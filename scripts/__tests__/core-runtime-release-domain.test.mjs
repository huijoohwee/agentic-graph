import assert from 'node:assert/strict'
import test from 'node:test'
import { digest } from '../travel-mesh-release-plan.mjs'
import { inspectCoreStorageDomain, configureCoreStorageDomain, restoreCoreStorageDomain, verifyCoreStorageDomain } from '../core-runtime-release-domain.mjs'
import { probeCoreStorageOrigin } from '../core-runtime-release-probes.mjs'

const configuration = { variables: { CLOUDFLARE_ACCOUNT_ID: 'a'.repeat(32), AGENTIC_OS_PUBLIC_ZONE_ID: 'b'.repeat(32), AGENTIC_OS_PUBLIC_ZONE_NAME: 'airvio.co' } }
const environment = { CLOUDFLARE_API_TOKEN: 'test-only' }
const spec = { hostname: 'storage.airvio.co', service: 'agentic-storage', zone_id: 'b'.repeat(32), zone_name: 'airvio.co', environment: 'production' }
const fixture = ({ domain = null, dns = [], failCreate = false } = {}) => {
  const state = { domain, dns, writes: [] }
  const apiFetch = async (raw, options = {}) => {
    const url = new URL(raw), method = options.method || 'GET'
    const result = value => Response.json({ success: true, result: value })
    if (url.pathname.endsWith('/domains/changeset')) return result({
      // Cloudflare plans the script's default environment as empty, but lists
      // its active domain under production (observed in run 34459215835).
      added: state.domain ? [] : [{ id: 'planned-domain', ...spec, environment: '' }],
      updated: state.domain ? [{ id: state.domain.id, modified: false }] : [], removed: [],
      conflicting: !state.domain && state.dns.length ? [{ hostname: spec.hostname }] : [],
    })
    if (method !== 'GET') state.writes.push({ path: url.pathname, method })
    if (url.pathname.endsWith('/workers/domains')) {
      assert.equal(method, 'GET'); return result(state.domain ? [state.domain] : [])
    }
    if (url.pathname.endsWith('/domains/records')) {
      assert.equal(method, 'PUT')
      assert.deepEqual(JSON.parse(options.body), { override_scope: false, override_existing_origin: false,
        override_existing_dns_record: false, origins: [{ hostname: spec.hostname, zone_id: spec.zone_id, zone_name: spec.zone_name }] })
      state.domain = { id: 'owned-domain', ...spec }
      state.dns = [{ id: 'managed-dns', name: spec.hostname, type: 'AAAA', content: '100::', proxied: true }]
      if (failCreate) throw new Error('response lost after provider creation')
      return result(state.domain)
    }
    if (url.pathname.endsWith('/dns_records')) { assert.equal(method, 'GET'); return result(state.dns) }
    assert.ok(url.pathname.endsWith('/workers/domains/owned-domain'))
    assert.equal(method, 'DELETE')
    state.domain = null; state.dns = []
    return result({})
  }
  return { configuration, environment, apiFetch, state }
}

test('an absent hostname is planned without mutation, then only its created domain is compensated', async () => {
  const args = fixture(), before = await inspectCoreStorageDomain(args)
  assert.deepEqual(args.state.writes, [])
  const routing = await configureCoreStorageDomain({ ...args, expectedDigest: digest(before) })
  assert.equal(routing.disposition, 'created')
  assert.equal((await verifyCoreStorageDomain({ ...args, routing })).domain.id, 'owned-domain')
  assert.equal((await restoreCoreStorageDomain({ ...args, routing })).disposition, 'removed-created-domain')
  assert.deepEqual(args.state.writes.map(item => item.method), ['PUT', 'DELETE'])
  assert.deepEqual(await inspectCoreStorageDomain(args), before)
})

test('an existing owned domain is reused and retained during rollback', async () => {
  const args = fixture({ domain: { id: 'owned-domain', ...spec } })
  const routing = await configureCoreStorageDomain({ ...args, expectedDigest: digest(await inspectCoreStorageDomain(args)) })
  assert.equal(routing.disposition, 'existing')
  assert.equal((await restoreCoreStorageDomain({ ...args, routing })).disposition, 'retained-existing')
  assert.deepEqual(args.state.writes, [])
})

test('foreign ownership, DNS occupancy, and post-preflight drift cannot overwrite a hostname', async () => {
  for (const existing of [
    { domain: { id: 'foreign-domain', ...spec, service: 'someone-else' } },
    { domain: { id: 'foreign-domain', ...spec, environment: 'staging' } },
    { domain: { id: 'unproved-domain', ...spec, environment: '' } },
    { dns: [{ id: 'foreign-dns', name: spec.hostname, type: 'CNAME', content: 'elsewhere.example', proxied: true }] },
  ]) {
    const args = fixture(existing)
    await assert.rejects(inspectCoreStorageDomain(args), /conflicts|existing DNS/)
    assert.deepEqual(args.state.writes, [])
  }
  const args = fixture(), before = await inspectCoreStorageDomain(args)
  args.state.domain = { id: 'owned-domain', ...spec }
  await assert.rejects(configureCoreStorageDomain({ ...args, expectedDigest: digest(before) }), /changed after preflight/)
  assert.deepEqual(args.state.writes, [])
})

test('response loss is not retried or misrepresented as proved routing', async () => {
  const args = fixture({ failCreate: true })
  await assert.rejects(configureCoreStorageDomain({ ...args, expectedDigest: digest(await inspectCoreStorageDomain(args)) }), /response lost/)
  await assert.rejects(restoreCoreStorageDomain({ ...args, routing: { status: 'attempted' } }), /ambiguous/)
  assert.deepEqual(args.state.writes.map(item => item.method), ['PUT'])
})

test('rollback refuses a replacement domain identity', async () => {
  const args = fixture()
  const routing = await configureCoreStorageDomain({ ...args, expectedDigest: digest(await inspectCoreStorageDomain(args)) })
  args.state.domain.id = 'replacement-domain'
  await assert.rejects(restoreCoreStorageDomain({ ...args, routing }), /changed after activation/)
  assert.deepEqual(args.state.writes.map(item => item.method), ['PUT'])
})

test('MCP storage-origin health waits only for bounded DNS propagation and rejects redirects', async () => {
  let calls = 0, waits = 0
  const passed = await probeCoreStorageOrigin({
    fetchFn: async (url, options) => {
      assert.equal(url, 'https://storage.airvio.co/api/storage/livez')
      assert.equal(options.redirect, 'manual')
      if (++calls < 3) throw new Error('DNS propagating')
      return Response.json({ ok: true, service: 'agentic-storage' })
    }, wait: async ms => { assert.equal(ms, 10000); waits++ },
  })
  assert.equal(passed.status, 200); assert.equal(calls, 3); assert.equal(waits, 2)
  calls = 0
  await assert.rejects(probeCoreStorageOrigin({ fetchFn: async () => { calls++; return Response.redirect('https://elsewhere.example') }, wait: async () => {} }), /unavailable/)
  assert.equal(calls, 6)
})
