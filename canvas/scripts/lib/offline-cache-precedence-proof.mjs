import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'

export const CACHE_PRECEDENCE_PHASES = ['precache-missing', 'precache-corrupt', 'pack-corrupt', 'pack-missing'].map(name => `cache-precedence:${name}`)
export const summarizeCacheRequests = (requests, phase) => ({ phase, total: requests.length,
  workerFetches: requests.filter(item => item.serviceWorker).length, failed: requests.filter(item => item.failure).length,
  uncachedPageRequests: requests.filter(item => !item.serviceWorker && !item.fromServiceWorker).length })

export function recordCacheProofNetwork(context, getPhase) {
  const requests = [], records = new WeakMap()
  const request = value => {
    if (!/^https?:/.test(value.url())) return
    const item = { phase: getPhase(), url: value.url(), method: value.method(), serviceWorker: Boolean(value.serviceWorker()), fromServiceWorker: false, status: null, failure: null }
    records.set(value, item); requests.push(item)
  }
  const response = value => { const item = records.get(value.request()); if (item) { item.status = value.status(); item.fromServiceWorker = value.fromServiceWorker() } }
  const failed = value => { const item = records.get(value); if (item) item.failure = value.failure()?.errorText || 'request failed' }
  context.on('request', request); context.on('response', response); context.on('requestfailed', failed)
  return { requests, stop() { context.off('request', request); context.off('response', response); context.off('requestfailed', failed) } }
}

// These mutations exercise the real built worker's cache ordering in its fresh browser context.
export async function proveOfflineCachePrecedence({ page, manifest, revision, output, stage, setNetworkPhase = () => {} }) {
  assert.ok(['before-install', 'after-install'].includes(stage))
  assert.equal(manifest.revision, revision)
  const installed = stage === 'after-install', cases = [], receipt = { stage, revision, passed: false, cases }
  let phase = 'setup', snapshot
  const network = recordCacheProofNetwork(page.context(), () => phase)
  const persist = () => writeFile(join(output, `offline-cache-precedence-${stage}.json`), JSON.stringify(receipt, null, 2) + '\n')
  const restore = async () => {
    if (!snapshot) return
    await page.evaluate(async state => {
      for (const item of [state.precache, state.pack].filter(Boolean)) {
        await (await caches.open(item.name)).put(item.key, new Response(new Uint8Array(item.bytes), { status: item.status, statusText: item.statusText, headers: item.headers }))
      }
    }, snapshot)
  }
  try {
    await page.waitForLoadState('networkidle')
    snapshot = await page.evaluate(async ({ manifest, installed }) => {
      const registration = await navigator.serviceWorker.getRegistration()
      if (!registration || !navigator.serviceWorker.controller) throw new Error('An active controlling built worker is required')
      const scope = registration.scope, revision = manifest.revision
      const stateName = 'kg-python-learning-v1-' + encodeURIComponent(new URL(scope).pathname) + '-state'
      const stateResponse = await (await caches.open(stateName)).match(new URL('__learning_state__', scope).href)
      const pointer = stateResponse ? await stateResponse.json() : null
      if (installed ? pointer?.active?.revision !== revision : Boolean(pointer?.active)) throw new Error('Verified-pack installation state differs from proof stage')
      const candidates = manifest.files.filter(file => file.path.startsWith(`assets/${revision}/`) && file.path.endsWith('.js') && file.bytes <= 500000).sort((a, b) => a.bytes - b.bytes || a.path.localeCompare(b.path))
      const cacheNames = (await caches.keys()).filter(name => name.startsWith('workbox-precache') && name.includes(scope))
      const cachedKeys = await Promise.all(cacheNames.map(async name => ({ name, keys: await (await caches.open(name)).keys() })))
      let selected
      for (const file of candidates) {
        const url = new URL(file.path, scope).href
        const matches = cachedKeys.flatMap(cache => cache.keys.filter(key => { const normalized = new URL(key.url); normalized.searchParams.delete('__WB_REVISION__'); return normalized.href === url }).map(key => ({ name: cache.name, key: key.url })))
        if (matches.length === 1) { selected = { file, url, ...matches[0] }; break }
      }
      if (!selected) throw new Error('No unique actual precached JavaScript key belongs to the verified manifest')
      const save = async (name, key) => {
        const response = await (await caches.open(name)).match(key)
        if (!response) throw new Error('Expected initial cache member is missing')
        const bytes = new Uint8Array(await response.arrayBuffer())
        const sha256 = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(value => value.toString(16).padStart(2, '0')).join('')
        if (bytes.length !== selected.file.bytes || sha256 !== selected.file.sha256) throw new Error('Initial cache member differs from manifest bytes')
        return { name, key, bytes: [...bytes], status: response.status, statusText: response.statusText, headers: [...response.headers] }
      }
      return { scope, file: selected.file, url: selected.url, precache: await save(selected.name, selected.key),
        pack: installed ? await save(pointer.active.cache, selected.url) : null }
    }, { manifest, installed })
    receipt.asset = { ...snapshot.file, url: snapshot.url, scope: snapshot.scope, precacheName: snapshot.precache.name,
      precacheKey: snapshot.precache.key, packName: snapshot.pack?.name || null }
    const definitions = installed ? [
      { name: 'precache-missing', target: 'precache', mutation: 'delete', status: 200 },
      { name: 'precache-corrupt', target: 'precache', mutation: 'corrupt', status: 200 },
      { name: 'pack-corrupt', target: 'pack', mutation: 'corrupt', status: 503 },
      { name: 'pack-missing', target: 'pack', mutation: 'delete', status: 503 },
    ] : [
      { name: 'normal-precache-hit', status: 200 },
      { name: 'normal-precache-miss', target: 'precache', mutation: 'delete', status: 200, requiresNetwork: true },
    ]
    for (const definition of definitions) {
      await restore(); await page.waitForLoadState('networkidle')
      phase = installed ? `cache-precedence:${definition.name}` : definition.name
      setNetworkPhase(installed ? phase : 'setup')
      const start = network.requests.length, result = { name: definition.name, phase, expectedStatus: definition.status, passed: false, errors: [] }
      cases.push(result)
      try {
        if (definition.target) await page.evaluate(async ({ member, mutation }) => {
          const cache = await caches.open(member.name)
          if (mutation === 'delete') { if (!await cache.delete(member.key)) throw new Error('Cache mutation did not delete its exact member') }
          else await cache.put(member.key, new Response(new Uint8Array([0]), { headers: { 'content-type': 'application/javascript' } }))
        }, { member: snapshot[definition.target], mutation: definition.mutation })
        result.response = await page.evaluate(async url => {
          const response = await fetch(url, { cache: 'no-store' }), bytes = new Uint8Array(await response.arrayBuffer())
          const sha256 = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(value => value.toString(16).padStart(2, '0')).join('')
          return { status: response.status, bytes: bytes.length, sha256, url: response.url }
        }, snapshot.url)
        assert.equal(result.response.status, definition.status, 'The original asset URL must resolve through the expected cache owner')
        if (definition.status === 200) { assert.equal(result.response.bytes, snapshot.file.bytes); assert.equal(result.response.sha256, snapshot.file.sha256) }
      } catch (error) { result.errors.push(error instanceof Error ? error.message : String(error)) }
      finally {
        await page.waitForLoadState('networkidle').catch(error => result.errors.push(error.message))
        phase = 'setup'; setNetworkPhase('setup')
        result.requests = network.requests.slice(start)
        result.network = summarizeCacheRequests(result.requests, result.phase)
        try {
          assert.ok(result.network.total > 0, 'Each case must observe actual full-context requests')
          assert.equal(result.network.failed, 0); assert.equal(result.network.uncachedPageRequests, 0)
          if (definition.requiresNetwork) assert.ok(result.network.workerFetches > 0, 'A no-pack precache miss must retain ordinary network fallback')
          else assert.equal(result.network.workerFetches, 0, 'This case must make no worker network attempt')
        } catch (error) { result.errors.push(error instanceof Error ? error.message : String(error)) }
        try { await restore() } catch (error) { result.errors.push(`Cache restoration failed: ${error.message}`) }
        result.passed = result.errors.length === 0
        await persist()
      }
    }
    receipt.passed = cases.length === definitions.length && cases.every(item => item.passed)
  } catch (error) { receipt.error = error instanceof Error ? error.message : String(error) }
  finally {
    try { await restore() } catch (error) { receipt.passed = false; receipt.error = `Cache restoration failed: ${error.message}` }
    network.stop(); await persist()
  }
  return receipt
}
