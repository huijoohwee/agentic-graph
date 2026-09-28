import test from 'node:test'
import assert from 'node:assert/strict'
import { fetchWebpageHtmlViaProxy, clearWebpageIframeSrcdocCaches } from '@/lib/websites/webpageIframeSrcdoc'

test('an already cancelled preview never starts a new proxy request', async () => {
  clearWebpageIframeSrcdocCaches()
  const controller = new AbortController()
  controller.abort()
  let requests = 0
  for (const bypassCache of [false, true]) {
    await assert.rejects(fetchWebpageHtmlViaProxy({
      url: 'https://example.invalid/cancelled', signal: controller.signal, bypassCache,
      fetchImpl: async () => { requests += 1; return new Response('<p>unused</p>') },
    }), { name: 'AbortError' })
  }
  assert.equal(requests, 0, 'cancelled views must not allocate, fetch or populate the cache')
})

test('cancellation during request creation observes a later network failure', async () => {
  clearWebpageIframeSrcdocCaches()
  const controller = new AbortController()
  await assert.rejects(fetchWebpageHtmlViaProxy({
    url: 'https://example.invalid/race', signal: controller.signal,
    fetchImpl: async () => { controller.abort(); return new Response('', { status: 413 }) },
  }), { name: 'AbortError' })
  // node:test reports a leaked rejection as a test failure.
  await new Promise(resolve => setTimeout(resolve, 0))
})
