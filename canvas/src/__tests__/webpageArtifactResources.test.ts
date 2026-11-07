import test from 'node:test'
import assert from 'node:assert/strict'
import { clearWebpageIframeSrcdocCaches, fetchWebpageHtmlViaProxy, fetchWebsiteImportArtifact } from '@/lib/websites/webpageIframeSrcdoc'
import { createWebpageTextRequestCache } from '@/lib/websites/webpageTextRequestCache'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { NativeWebsiteCrawler } from '@/lib/websites/server/nativeWebsiteCrawler'

test('leaving the last view cancels its upstream request, including cache bypass', async () => {
  for (const bypassCache of [false, true]) {
    clearWebpageIframeSrcdocCaches()
    const consumer = new AbortController()
    let upstream: AbortSignal | null = null
    const pending = fetchWebpageHtmlViaProxy({ url: 'https://example.invalid/slow', signal: consumer.signal, bypassCache,
      fetchImpl: async (_url, init) => {
        upstream = init!.signal as AbortSignal
        return await new Promise<Response>((_resolve, reject) => upstream!.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true }))
      },
    })
    const rejected = assert.rejects(pending, { name: 'AbortError' })
    await Promise.resolve()
    consumer.abort()
    await rejected
    assert.equal((upstream as unknown as AbortSignal).aborted, true)
  }
})

test('one cancelled subscriber does not cancel a shared page still in use', async () => {
  clearWebpageIframeSrcdocCaches()
  const first = new AbortController(), second = new AbortController()
  let upstream: AbortSignal | null = null, requests = 0
  let finish!: (response: Response) => void
  const fetchImpl: typeof fetch = async (_url, init) => {
    requests += 1; upstream = init!.signal as AbortSignal
    return await new Promise<Response>(resolve => { finish = resolve })
  }
  const a = fetchWebpageHtmlViaProxy({ url: 'https://example.invalid/shared', signal: first.signal, fetchImpl })
  const b = fetchWebpageHtmlViaProxy({ url: 'https://example.invalid/shared', signal: second.signal, fetchImpl })
  const rejected = assert.rejects(a, { name: 'AbortError' })
  await Promise.resolve(); first.abort(); await rejected
  assert.equal((upstream as unknown as AbortSignal).aborted, false)
  finish(new Response('<p>Complete content</p>'))
  assert.equal(await b, '<p>Complete content</p>')
  assert.equal(requests, 1)
})

test('page bodies use a total memory budget and oversized bodies are delivered without retention', async () => {
  const originalFetch = globalThis.fetch
  let calls = 0, body = 'x'.repeat(2 * 1024 * 1024)
  globalThis.fetch = async () => { calls += 1; return new Response(body) }
  const read = (nodeId: string) => fetchWebsiteImportArtifact({ importId: 'resources', nodeId, kind: 'rawHtml', signal: new AbortController().signal })
  try {
    clearWebpageIframeSrcdocCaches()
    for (let i = 0; i < 7; i += 1) assert.equal((await read(String(i))).length, body.length)
    await read('0')
    assert.equal(calls, 8, 'the oldest body must be evicted before 24 small entry slots are filled')
    clearWebpageIframeSrcdocCaches(); calls = 0; body = 'y'.repeat(5 * 1024 * 1024)
    assert.equal(await read('large'), body)
    assert.equal(await read('large'), body)
    assert.equal(calls, 2, 'an oversized page must not stay resident after the view releases it')
  } finally { globalThis.fetch = originalFetch; clearWebpageIframeSrcdocCaches() }
})

test('oversized artifact responses are cancelled before reading or caching their bodies', async () => {
  const originalFetch = globalThis.fetch
  let cancelled = 0
  globalThis.fetch = async () => new Response(new ReadableStream({ cancel() { cancelled += 1 } }), {
    headers: { 'content-length': String(33 * 1024 * 1024) },
  })
  try {
    clearWebpageIframeSrcdocCaches()
    await assert.rejects(fetchWebsiteImportArtifact({ importId: 'resources', nodeId: 'oversized', kind: 'rawHtml', signal: new AbortController().signal }), /Response too large/)
    assert.equal(cancelled, 1)
  } finally { globalThis.fetch = originalFetch; clearWebpageIframeSrcdocCaches() }
})

test('late completion of an abandoned request cannot populate the cache or remove its replacement', async () => {
  const cache = createWebpageTextRequestCache(() => 60_000)
  const first = new AbortController()
  let oldFinish!: (text: string) => void, newFinish!: (text: string) => void
  const a = cache.fetch('same', async () => await new Promise(resolve => { oldFinish = resolve }), first.signal)
  const rejected = assert.rejects(a, { name: 'AbortError' })
  await Promise.resolve(); first.abort()
  const b = cache.fetch('same', async () => await new Promise(resolve => { newFinish = resolve }), new AbortController().signal)
  await rejected; await Promise.resolve()
  oldFinish('stale')
  await new Promise(resolve => setTimeout(resolve, 0))
  const c = cache.fetch('same', async () => { throw new Error('duplicate request') }, new AbortController().signal)
  newFinish('current')
  assert.deepEqual(await Promise.all([b, c]), ['current', 'current'])
  assert.equal(await cache.fetch('same', async () => 'wrong', new AbortController().signal), 'current')
  cache.clear()
})

test('stream limits use received bytes even without Content-Length and preserve split Unicode', async () => {
  const originalFetch = globalThis.fetch
  let cancelled = false, bytes = 0
  globalThis.fetch = async () => new Response(new ReadableStream({
    pull(controller) { bytes += 1024 * 1024; controller.enqueue(new Uint8Array(1024 * 1024)) },
    cancel() { cancelled = true },
  }, { highWaterMark: 0 }))
  const read = (nodeId: string) => fetchWebsiteImportArtifact({ importId: 'stream', nodeId, kind: 'rawHtml', signal: new AbortController().signal })
  try {
    clearWebpageIframeSrcdocCaches()
    await assert.rejects(read('limit'), /Response too large/)
    assert.equal(cancelled, true)
    assert.equal(bytes, 33 * 1024 * 1024)
    const source = '<p>Complete 🙂 中文</p>', encoded = new TextEncoder().encode(source)
    globalThis.fetch = async () => new Response(new ReadableStream({ start(controller) {
      for (const byte of encoded) controller.enqueue(new Uint8Array([byte]))
      controller.close()
    } }))
    assert.equal(await read('unicode'), source)
  } finally { globalThis.fetch = originalFetch; clearWebpageIframeSrcdocCaches() }
})

test('the headless crawler reports oversized HTML instead of returning a truncated successful capture', async () => {
  const server = createServer((request, response) => {
    response.setHeader('Content-Type', 'text/html')
    response.end(`<!doctype html><html><head><title>Generic capture</title></head><body data-state="${request.url === '/large' ? 'x'.repeat(110_000) : 'small'}"><main>Final visible content</main></body></html>`)
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address() as { port: number }
  const crawler = new NativeWebsiteCrawler({ concurrency: 1, proxyRotation: false, downloadAssets: false,
    maxDownloads: 0, maxDownloadBytes: 0, maxHtmlChars: 100_000, allowPrivateNetworks: true })
  try {
    const capture = (suffix: string) => crawler.capture({ url: `http://127.0.0.1:${address.port}/${suffix}`, nodeDirAbs: tmpdir(), sequence: 0 })
    await assert.rejects(capture('large'), /Captured HTML exceeds the 100000-character limit/)
    const small = await capture('small')
    assert.ok(small.html.includes('<main>Final visible content</main>'))
    assert.ok(small.html.endsWith('</html>'))
  } finally {
    await crawler.close()
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
  }
})
