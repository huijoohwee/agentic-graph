import assert from 'node:assert/strict'
import test from 'node:test'
import { CANONICAL_MIRROR_NAMESPACE, LEGACY_PRODUCT_NAMESPACES } from '../mirror-namespace-contract.mjs'
import { classifyScopeUpgradeKind, readPublishedRuntimeRevision } from '../production-service-worker-profile.mjs'

const origin = 'https://example.test'
const revision = '1'.repeat(40)
const root = '/.well-known/runtime-readiness.json'
const marker = scope => `/${scope}${root}`
const current = CANONICAL_MIRROR_NAMESPACE
const [retired, otherRetired] = LEGACY_PRODUCT_NAMESPACES
const response = source => Response.json({ source: { revision: source } })
const observe = entries => {
  const requests = []
  return {
    requests,
    read: () => readPublishedRuntimeRevision({ profileOrigin: origin, fetchFn: async (url, options) => {
      requests.push(new URL(url).pathname)
      assert.equal(options.redirect, 'manual')
      assert.equal(options.cache, 'no-store')
      const entry = entries[new URL(url).pathname]
      return entry?.() ?? new Response('', { status: 404 })
    } }),
  }
}

test('canonical runtime identity takes precedence and matches the root marker', async () => {
  const probe = observe({ [marker(current)]: () => response(revision), [root]: () => response(revision) })
  assert.deepEqual(await probe.read(), { scopeSegment: current, revision })
  assert.deepEqual(probe.requests, [marker(current), root])
  assert.equal(classifyScopeUpgradeKind(current), 'in-scope-upgrade')
})

test('canonical 404 permits one root-matched retired scope as a migration input', async () => {
  const probe = observe({ [marker(retired)]: () => response(revision), [root]: () => response(revision) })
  assert.deepEqual(await probe.read(), { scopeSegment: retired, revision })
  assert.equal(classifyScopeUpgradeKind(retired), 'scope-transition')
})

test('a server error never falls through to a retired runtime', async () => {
  const probe = observe({ [marker(current)]: () => new Response('', { status: 503 }),
    [marker(retired)]: () => response(revision), [root]: () => response(revision) })
  await assert.rejects(probe.read(), /must be available/)
  assert.deepEqual(probe.requests, [marker(current)])
})

test('malformed and HTML markers fail instead of changing authority', async () => {
  for (const malformed of [() => response('not-a-revision'), () => new Response('<html/>', { headers: { 'content-type': 'text/html' } })]) {
    const probe = observe({ [marker(current)]: malformed, [marker(retired)]: () => response(revision) })
    await assert.rejects(probe.read())
    assert.deepEqual(probe.requests, [marker(current)])
  }
})

test('missing or ambiguous retired deployments cannot establish a baseline', async () => {
  await assert.rejects(observe({ [root]: () => response(revision) }).read(), /one observed retired/)
  await assert.rejects(observe({ [marker(retired)]: () => response(revision),
    [marker(otherRetired)]: () => response(revision), [root]: () => response(revision) }).read(), /one observed retired/)
})

test('a permanent retired alias does not count as a second deployed scope', async () => {
  const entries = { [marker(retired)]: () => response(revision), [root]: () => response(revision),
    [marker(otherRetired)]: () => new Response('', { status: 301, headers: { location: marker(retired) } }) }
  assert.deepEqual(await observe(entries).read(), { scopeSegment: retired, revision })
  for (const location of ['https://untrusted.test' + marker(retired), '/unknown/.well-known/runtime-readiness.json', marker(otherRetired)]) {
    await assert.rejects(observe({ ...entries, [marker(otherRetired)]: () => new Response('', {
      status: 301, headers: { location },
    }) }).read(), /known same-origin retired marker/)
  }
})

test('scope and root marker drift invalidates either kind of previous runtime', async () => {
  for (const scope of [current, retired]) {
    await assert.rejects(observe({ [marker(scope)]: () => response(revision),
      [root]: () => response('2'.repeat(40)) }).read(), /must match the root/)
  }
})

test('unknown scope and non-origin inputs cannot become migration authority', async () => {
  assert.throws(() => classifyScopeUpgradeKind('unrelated-app'), /unknown previous/)
  await assert.rejects(readPublishedRuntimeRevision({ profileOrigin: `${origin}/path`,
    fetchFn: () => { throw new Error('must not fetch') } }), /no path or credentials/)
})
