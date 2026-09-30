import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { tmpdir } from 'node:os'
import { createServer, type Server } from 'node:http'
import { gzipSync } from 'node:zlib'
import { handleWebsiteDiscovery, validateSelectedWebsiteUrls } from '@/lib/websites/server/websiteImportDiscovery'
import { buildWebsiteSelectionTree, websiteFolderUrls } from '@/lib/websites/websiteImportSelection'
import { NativeWebsiteCrawler } from '@/lib/websites/server/nativeWebsiteCrawler'
import { createWebsiteImportHandler } from '@/lib/websites/server/websiteImportServer'
import type { WebsiteImportManifestV1 } from '@/lib/websites/server/websiteImportTypes'
import { collectSitemapUrls } from '@/lib/websites/server/websiteImportServerHelpers'
import { extractXmlLocs, fetchTextWithLimit } from '@/lib/websites/server/websiteImportCore'
import { WebsiteDiscoveryCache, newDiscoveryMetrics } from '@/lib/websites/server/websiteDiscoveryCache'

const listen = async (server: Server) => {
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  return `http://127.0.0.1:${(server.address() as { port: number }).port}`
}
const close = (server: Server) => new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))

test('discovery cache revalidates changed metadata, respects response policy, and bounds retention', async () => {
  const previous = process.env.AGENTIC_OS_CRAWLER_ALLOW_PRIVATE_NETWORKS
  process.env.AGENTIC_OS_CRAWLER_ALLOW_PRIVATE_NETWORKS = '1'
  let now = 0, version = 1, requests = 0
  let policy = 'max-age=1', fail = false, cookie = false, vary = '', modified = false
  const date = 'Tue, 01 Sep 2026 00:00:00 GMT'
  const server = createServer((req, res) => {
    requests++
    if (fail) { res.writeHead(503); res.end(); return }
    res.setHeader('Cache-Control', policy)
    if (cookie) res.setHeader('Set-Cookie', 'session=example')
    if (vary) res.setHeader('Vary', vary)
    if (modified) res.setHeader('Last-Modified', date); else res.setHeader('ETag', `"${version}"`)
    if (req.headers['if-none-match'] === `"${version}"` || (modified && req.headers['if-modified-since'] === date)) { res.writeHead(304); res.end(); return }
    res.end(`<urlset><url><loc>/catalog/page-${version}</loc></url></urlset>`)
  })
  const base = await listen(server)
  const cache = new WebsiteDiscoveryCache(() => now, 2048, 2)
  const options = { timeoutMs: 1000, maxBytes: 1024, allowedOrigin: base }
  const metrics = newDiscoveryMetrics()
  try {
    const first = await cache.read(base, options, metrics)
    assert.ok(first.ok)
    assert.deepEqual(await cache.read(base, options, metrics), first)
    assert.equal(requests, 1); assert.equal(metrics.cacheHits, 1)
    const bytes = metrics.metadataTransferBytes
    now = 1001
    assert.deepEqual(await cache.read(base, options, metrics), first)
    assert.equal(metrics.revalidated, 1); assert.equal(metrics.metadataTransferBytes, bytes)
    version++; now += 1001
    const changed = await cache.read(base, options, metrics)
    assert.ok(changed.ok); assert.match(changed.text, /page-2/)
    now += 1001; fail = true
    assert.deepEqual(await cache.read(base, options, metrics), { ok: false, error: 'HTTP 503' }, 'expired cache must not disguise an upstream failure')
    fail = false
    assert.equal((await cache.read(base, { ...options, maxBytes: 8 }, metrics)).ok, false, 'cached bodies obey the caller byte ceiling')
    modified = true; policy = 'no-cache'
    await cache.read(base + '/modified', options, metrics)
    const before = metrics.revalidated
    await cache.read(base + '/modified', options, metrics)
    assert.equal(metrics.revalidated, before + 1, 'Last-Modified works without ETag')
    for (const excluded of ['no-store', 'private', 'cookie', 'vary']) {
      policy = ['no-store', 'private'].includes(excluded) ? excluded : 'max-age=60'
      cookie = excluded === 'cookie'; vary = excluded === 'vary' ? 'Cookie' : ''
      const count = requests
      await cache.read(base + '/' + excluded, options, metrics)
      await cache.read(base + '/' + excluded, options, metrics)
      assert.equal(requests - count, 2, excluded)
    }
    cookie = false; vary = ''; modified = false; policy = 'max-age=60'
    for (let index = 0; index < 4; index++) await cache.read(base + '/entry-' + index, options, metrics)
    assert.ok(cache.usage.bytes <= 2048); assert.equal(cache.usage.entries, 2)
    const retained = requests
    await cache.read(base + '/entry-0', options, metrics)
    assert.equal(requests, retained + 1, 'old entries are evicted')
    now += 24 * 60 * 60_000 + 1
    const revalidations = metrics.revalidated
    await cache.read(base + '/entry-0', options, metrics)
    assert.equal(metrics.revalidated, revalidations, 'expired validators are discarded')
    const controller = new AbortController(); controller.abort()
    const usage = cache.usage
    await assert.rejects(cache.read(base, { ...options, signal: controller.signal }, metrics), /abort/i)
    assert.deepEqual(cache.usage, usage)
    delete process.env.AGENTIC_OS_CRAWLER_ALLOW_PRIVATE_NETWORKS
    assert.equal((await cache.read(base + '/entry-0', options, metrics)).ok, false, 'public policy cannot reuse private-development cache entries')
  } finally {
    await close(server)
    if (previous === undefined) delete process.env.AGENTIC_OS_CRAWLER_ALLOW_PRIVATE_NETWORKS
    else process.env.AGENTIC_OS_CRAWLER_ALLOW_PRIVATE_NETWORKS = previous
  }
})

test('rendered discovery cache expires without sliding freshness and cannot retain oversized or partial captures', () => {
  let now = 0
  const cache = new WebsiteDiscoveryCache(() => now, 2048, 2)
  const capture = { finalUrl: 'https://example.test/', title: 'Catalog', html: 'not retained', links: ['https://example.test/a'], downloads: [],
    discoveryResponse: { status: 200, hasCookies: false, redirected: false } }
  cache.setRendered(capture.finalUrl, capture)
  now = 59_999
  const warm = cache.getRendered(capture.finalUrl)!
  assert.equal(warm.ageMs, 59_999); assert.equal(warm.capture.html, '')
  warm.capture.links.push('https://example.test/mutation')
  assert.equal(cache.getRendered(capture.finalUrl)!.capture.links.length, 1)
  now = 60_000
  assert.equal(cache.getRendered(capture.finalUrl), undefined)
  cache.setRendered(capture.finalUrl, { ...capture, linksLimited: true })
  assert.equal(cache.getRendered(capture.finalUrl), undefined)
  cache.setRendered(capture.finalUrl, { ...capture, links: ['x'.repeat(3000)] })
  assert.equal(cache.usage.bytes, 0)
  cache.setRendered(capture.finalUrl, { ...capture, discoveryResponse: { ...capture.discoveryResponse, cacheControl: 'no-cache' } })
  assert.equal(cache.getRendered(capture.finalUrl), undefined)
  cache.setRendered(capture.finalUrl, { ...capture, discoveryResponse: { ...capture.discoveryResponse, expires: 'Tue, 01 Sep 2026 00:00:00 GMT', date: 'Tue, 01 Sep 2026 00:01:00 GMT' } })
  assert.equal(cache.getRendered(capture.finalUrl), undefined, 'expired HTTP freshness cannot receive a default TTL')
})

test('cold and warm endpoint discovery preserves inventory while avoiding browser and media work', async t => {
  const previous = process.env.AGENTIC_OS_CRAWLER_ALLOW_PRIVATE_NETWORKS
  process.env.AGENTIC_OS_CRAWLER_ALLOW_PRIVATE_NETWORKS = '1'
  const requested: string[] = []
  const source = createServer((req, res) => {
    requested.push(req.url || '')
    if (req.url === '/catalog/') {
      res.setHeader('Content-Type', 'text/html')
      res.end('<style>@font-face{font-family:test;src:url(/font.woff2)}body{font-family:test}</style><img src="/picture.png"><video autoplay src="/movie.mp4"></video><script>document.write(\'<a href="/catalog/scripted">Scripted</a>\')</script>'); return
    }
    if (req.url === '/robots.txt') { res.end('Sitemap: /catalog/sitemap.xml'); return }
    if (req.url === '/catalog/sitemap.xml') { res.end('<urlset>' + Array.from({ length: 100 }, (_, i) => `<url><loc>/catalog/page-${i}</loc></url>`).join('') + '</urlset>'); return }
    res.writeHead(404); res.end()
  })
  const sourceBase = await listen(source)
  const handler = createWebsiteImportHandler({ repoRoot: tmpdir() })
  const api = createServer((req, res) => { void handler(req, res, () => { res.statusCode = 404; res.end() }) })
  const base = await listen(api)
  const refresh = async () => {
    const result = await fetch(base + '/__website_import/discover', { method: 'POST', body: JSON.stringify({ rootUrl: sourceBase + '/catalog/', url: sourceBase + '/catalog/' }) })
    assert.equal(result.status, 200)
    return result.json()
  }
  try {
    const cold = await refresh(), warm = await refresh()
    assert.deepEqual(warm.pages, cold.pages); assert.equal(cold.pages.length, 102)
    assert.equal(cold.metrics.browserLaunches, 1); assert.equal(warm.metrics.browserLaunches, 0)
    assert.ok(warm.metrics.cacheHits >= 3)
    assert.equal(warm.metrics.browserTransferBytes + warm.metrics.metadataTransferBytes, 0)
    assert.ok(cold.metrics.browserTransferBytes + cold.metrics.metadataTransferBytes > 0)
    assert.ok(warm.metrics.elapsedMs < cold.metrics.elapsedMs)
    assert.ok(!requested.some(url => /\.(png|woff2|mp4)$/.test(url)), 'discovery blocks media while retaining script navigation')
    t.diagnostic(JSON.stringify({ cold: cold.metrics, warm: warm.metrics, nodePeakRssKiB: process.resourceUsage().maxRSS, memoryScope: 'Node test process; browser processes excluded' }))
  } finally {
    await close(api); await close(source)
    if (previous === undefined) delete process.env.AGENTIC_OS_CRAWLER_ALLOW_PRIVATE_NETWORKS
    else process.env.AGENTIC_OS_CRAWLER_ALLOW_PRIVATE_NETWORKS = previous
  }
})

test('overlapping discovery is rejected and client cancellation releases its admission', async () => {
  const previous = process.env.AGENTIC_OS_CRAWLER_ALLOW_PRIVATE_NETWORKS
  process.env.AGENTIC_OS_CRAWLER_ALLOW_PRIVATE_NETWORKS = '1'
  let started!: () => void
  const navigating = new Promise<void>(resolve => { started = resolve })
  const source = createServer((_req, _res) => started())
  const sourceBase = await listen(source)
  const handler = createWebsiteImportHandler({ repoRoot: tmpdir() })
  const api = createServer((req, res) => { void handler(req, res, () => { res.statusCode = 404; res.end() }) })
  const base = await listen(api)
  const controller = new AbortController()
  const refresh = (signal?: AbortSignal) => fetch(base + '/__website_import/discover', { method: 'POST', signal,
    body: JSON.stringify({ rootUrl: sourceBase, url: sourceBase }) })
  try {
    const first = refresh(controller.signal)
    const rejected = assert.rejects(first, /abort/i)
    await navigating
    assert.equal((await refresh()).status, 429)
    controller.abort(); await rejected
    // Wait for the closed browser to release its sole admission, then prove a new request enters.
    source.removeAllListeners('request'); source.on('request', (_req, res) => { res.writeHead(503); res.end() })
    let status = 429
    for (let attempt = 0; attempt < 50 && status === 429; attempt++) {
      await new Promise(resolve => setTimeout(resolve, 20))
      status = (await refresh()).status
    }
    assert.equal(status, 400, 'a later request reaches the upstream rather than remaining permanently busy')
  } finally {
    controller.abort(); source.closeAllConnections(); await close(api); await close(source)
    if (previous === undefined) delete process.env.AGENTIC_OS_CRAWLER_ALLOW_PRIVATE_NETWORKS
    else process.env.AGENTIC_OS_CRAWLER_ALLOW_PRIVATE_NETWORKS = previous
  }
})

test('the shared discovery deadline terminates upstream work and returns a bounded failure', async () => {
  const previous = process.env.AGENTIC_OS_CRAWLER_ALLOW_PRIVATE_NETWORKS
  process.env.AGENTIC_OS_CRAWLER_ALLOW_PRIVATE_NETWORKS = '1'
  const source = createServer(() => {})
  const sourceBase = await listen(source)
  const api = createServer((req, res) => { void handleWebsiteDiscovery(req, res, 100) })
  const base = await listen(api)
  try {
    const began = performance.now()
    const response = await fetch(base, { method: 'POST', body: JSON.stringify({ rootUrl: sourceBase, url: sourceBase }) })
    assert.equal(response.status, 504)
    assert.match((await response.json()).error, /100ms deadline/)
    assert.ok(performance.now() - began < 5000, 'deadline includes browser startup with bounded shutdown allowance')
  } finally {
    source.closeAllConnections(); await close(api); await close(source)
    if (previous === undefined) delete process.env.AGENTIC_OS_CRAWLER_ALLOW_PRIVATE_NETWORKS
    else process.env.AGENTIC_OS_CRAWLER_ALLOW_PRIVATE_NETWORKS = previous
  }
})

test('discovery rejects oversized browser responses before retaining them and marks request-limited navigation partial', async () => {
  const source = createServer((req, res) => {
    res.setHeader('Content-Type', 'text/html')
    if (req.url === '/large') { res.setHeader('Content-Length', 33 * 1024 * 1024); res.write('<html>'); return }
    if (req.url === '/many') {
      res.end('<script>Promise.all(Array.from({length:140},(_,i)=>fetch("/request-"+i).catch(()=>{}))).then(()=>document.body.dataset.done="1")</script><a href="/kept">Kept</a>'); return
    }
    res.end('ok')
  })
  const base = await listen(source)
  const crawler = new NativeWebsiteCrawler({ concurrency: 1, proxyRotation: false, downloadAssets: false, maxDownloads: 0, maxDownloadBytes: 0, allowPrivateNetworks: true })
  try {
    await assert.rejects(crawler.capture({ url: base + '/large', nodeDirAbs: '', sequence: 0, discoveryOnly: true }), /32 MiB browser response budget/)
    const result = await crawler.capture({ url: base + '/many', nodeDirAbs: '', sequence: 0, discoveryOnly: true })
    assert.equal(result.linksLimited, true)
    assert.ok(result.links.includes(base + '/kept'))
  } finally { await crawler.close(); source.closeAllConnections(); await close(source) }
})

test('page selection is explicit, bounded and constrained to the source scope', () => {
  const root = 'https://example.test/library/'
  assert.equal(validateSelectedWebsiteUrls(root, undefined), undefined)
  assert.deepEqual(validateSelectedWebsiteUrls(root, [root + 'a#first', root + 'a#second', root + 'a?q=2']), [root + 'a', root + 'a?q=2'])
  for (const selection of [[], 'all', Array(501).fill(root), [root, 'https://other.test/library/a'], ['https://user:pass@example.test/library/a'], ['https://example.test/admin'], [root + 'file.png'], [root + 'x'.repeat(4096)]]) {
    assert.throws(() => validateSelectedWebsiteUrls(root, selection))
  }
})

test('folder selection retains nested pages and distinct query variants', () => {
  const urls = ['https://example.test/library/', 'https://example.test/library/guides/a', 'https://example.test/library/search?q=one', 'https://example.test/library/search?q=two']
  const tree = buildWebsiteSelectionTree(urls.map(url => ({ url, path: new URL(url).pathname })))
  const folder = tree.folders.find(item => item.name === 'library')!
  assert.equal(folder.folders[0]?.name, 'guides')
  assert.deepEqual(new Set(websiteFolderUrls(folder)), new Set(urls.slice(1)))
  assert.deepEqual(new Set(websiteFolderUrls(tree)), new Set(urls))
})

test('sitemap locations decode XML entities, preserve CDATA and exclude media namespaces', () => {
  const xml = '<sm:urlset><sm:url><sm:loc>/catalog?a=1&amp;b=&#50;</sm:loc><image:loc>/image-service</image:loc><sm:loc><![CDATA[/catalog?a=1&amp;b=2]]></sm:loc></sm:url></sm:urlset>'
  assert.deepEqual(extractXmlLocs(xml), ['/catalog?a=1&b=2', '/catalog?a=1&amp;b=2'])
})

test('discovery returns unique links from oversized HTML without serializing or persisting a capture', async () => {
  const root = await fs.mkdtemp(path.join(tmpdir(), 'website-discovery-'))
  const server = createServer((_req, res) => {
    res.setHeader('Content-Type', 'text/html')
    res.end(`<html><head><title>Independent catalog</title></head><body data-state="${'x'.repeat(110_000)}">${'<a href="/library/a">A</a>'.repeat(510)}<a href="/library/b">B</a></body></html>`)
  })
  const base = await listen(server)
  const crawler = new NativeWebsiteCrawler({ concurrency: 1, proxyRotation: false, downloadAssets: false, maxDownloads: 0, maxDownloadBytes: 0, maxHtmlChars: 100_000, allowPrivateNetworks: true })
  try {
    const args = { url: `${base}/library/`, nodeDirAbs: root, sequence: 0 }
    const discovered = await crawler.capture({ ...args, discoveryOnly: true })
    assert.deepEqual(discovered.links, [`${base}/library/a`, `${base}/library/b`])
    assert.equal(discovered.html, '')
    assert.equal(discovered.title, 'Independent catalog')
    assert.deepEqual(await fs.readdir(root), [])
    await assert.rejects(crawler.capture(args), /Captured HTML exceeds/)
  } finally { await crawler.close(); await close(server); await fs.rm(root, { recursive: true, force: true }) }
})

test('headless discovery includes explicit card URLs without collecting state or non-URLs', async () => {
  const source = createServer((_req, res) => {
    res.setHeader('Content-Type', 'text/html')
    res.end(`<a href="/catalog/anchor#part">Link</a><area href="/catalog/area">
      <button data-href="/catalog/button">Open</button><article data-url="/catalog/card"></article>
      <section to="/catalog/route"></section><section url="/catalog/direct"></section>
      <div title="http://127.0.0.1:${(source.address() as { port: number }).port}/catalog/title">Card</div>
      <div title="Ordinary title"></div><div data-href="javascript:alert(1)"></div>
      <div data-state='{"url":"/catalog/hidden-state"}'></div>`)
  })
  const base = await listen(source)
  const crawler = new NativeWebsiteCrawler({ concurrency: 1, proxyRotation: false, downloadAssets: false, maxDownloads: 0, maxDownloadBytes: 0, allowPrivateNetworks: true })
  try {
    const capture = await crawler.capture({ url: base + '/catalog/', nodeDirAbs: '', sequence: 0, discoveryOnly: true })
    assert.deepEqual(capture.links, ['anchor', 'area', 'button', 'card', 'route', 'direct', 'title'].map(leaf => `${base}/catalog/${leaf}`))
    assert.equal(capture.linksLimited, false)
    assert.equal(capture.html, '')
    assert.deepEqual(capture.downloads, [])
  } finally { await crawler.close(); await close(source) }
})

test('discovery combines rendered navigation, robots and recursive sitemaps without importing pages', async () => {
  const root = await fs.mkdtemp(path.join(tmpdir(), 'website-sitemap-discovery-'))
  const previous = process.env.AGENTIC_OS_CRAWLER_ALLOW_PRIVATE_NETWORKS
  process.env.AGENTIC_OS_CRAWLER_ALLOW_PRIVATE_NETWORKS = '1'
  const requests: string[] = []
  let outsideRequests = 0
  const outside = createServer((_req, res) => { outsideRequests++; res.end('<urlset/>') })
  const outsideBase = await listen(outside)
  const source = createServer((req, res) => {
    const url = req.url || ''
    requests.push(url)
    if (url === '/library/') { res.setHeader('Content-Type', 'text/html'); res.end('<a href="/library/visible">Visible</a>'); return }
    if (url === '/robots.txt') { res.end(`Sitemap: ${base}/maps/index.xml\nSitemap: ${outsideBase}/outside.xml`); return }
    if (url === '/maps/index.xml') { res.end('<sitemapindex><sitemap><loc>/maps/nested.xml</loc></sitemap><sitemap><loc>/maps/redirect.xml</loc></sitemap></sitemapindex>'); return }
    if (url === '/maps/redirect.xml') { res.writeHead(302, { Location: outsideBase + '/redirected.xml' }); res.end(); return }
    if (url === '/maps/nested.xml') { res.end('<sitemapindex><sitemap><loc>/maps/index.xml</loc></sitemap><sitemap><loc>/maps/pages.xml.gz</loc></sitemap></sitemapindex>'); return }
    if (url === '/maps/pages.xml.gz') {
      res.end(gzipSync(`<urlset><url><loc>${base}/library/hidden?a=1&amp;b=2</loc></url><url><loc>${base}/library/visible#duplicate</loc></url><url><loc>/outside-scope</loc></url><url><loc>/library/asset.png</loc></url><url><loc>${base.replace('://', '://user:password@')}/library/private</loc></url></urlset>`)); return
    }
    if (url === '/sitemap.xml') { res.end('<urlset><url><loc>/library/extra.xml</loc></url></urlset>'); return }
    if (url === '/library/extra.xml') { res.end('<sm:urlset xmlns:sm="http://www.sitemaps.org/schemas/sitemap/0.9"><sm:url><sm:loc><![CDATA[/library/extra?x=1&y=2]]></sm:loc></sm:url></sm:urlset>'); return }
    res.statusCode = 404; res.end()
  })
  const base = await listen(source)
  const handler = createWebsiteImportHandler({ repoRoot: root })
  const api = createServer((req, res) => { void handler(req, res, () => { res.statusCode = 404; res.end() }) })
  const apiBase = await listen(api)
  try {
    const response = await fetch(`${apiBase}/__website_import/discover`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rootUrl: base + '/library/', url: base + '/library/' }) })
    assert.equal(response.status, 200)
    const result = await response.json()
    assert.deepEqual(new Set(result.pages.map((page: { url: string }) => page.url)), new Set([
      base + '/library/', base + '/library/visible', base + '/library/hidden?a=1&b=2', base + '/library/extra?x=1&y=2',
    ]))
    assert.equal(result.limited, true, 'a rejected referenced sitemap is reported as partial')
    assert.equal(outsideRequests, 0, 'sitemap references and redirects cannot change origin')
    assert.equal(requests.filter(url => url === '/maps/index.xml').length, 1, 'index cycles are visited once')
    assert.ok(!requests.includes('/library/visible') && !requests.some(url => url.startsWith('/library/hidden')), 'finding a page must not crawl it')
    assert.deepEqual(await fs.readdir(root), [], 'discovery must not write artifacts')
  } finally {
    await close(api); await close(source); await close(outside); await fs.rm(root, { recursive: true, force: true })
    if (previous === undefined) delete process.env.AGENTIC_OS_CRAWLER_ALLOW_PRIVATE_NETWORKS
    else process.env.AGENTIC_OS_CRAWLER_ALLOW_PRIVATE_NETWORKS = previous
  }
})

test('sitemap discovery reports URL, request and decompression bounds and cancels pending reads', async () => {
  const previous = process.env.AGENTIC_OS_CRAWLER_ALLOW_PRIVATE_NETWORKS
  process.env.AGENTIC_OS_CRAWLER_ALLOW_PRIVATE_NETWORKS = '1'
  let reads = 0
  let receivedSlow!: () => void
  const slowStarted = new Promise<void>(resolve => { receivedSlow = resolve })
  const server = createServer((req, res) => {
    reads++
    if (req.url === '/slow.xml') { receivedSlow(); return }
    if (req.url === '/large.xml.gz') { res.end(gzipSync('<urlset>' + 'x'.repeat(4096) + '</urlset>')); return }
    if (req.url === '/index.xml') { res.end('<sitemapindex>' + Array.from({ length: 20 }, (_, i) => `<sitemap><loc>/child-${i}.xml</loc></sitemap>`).join('') + '</sitemapindex>'); return }
    if (req.url === '/pages.xml') { res.end('<urlset>' + Array.from({ length: 8 }, (_, i) => `<url><loc>/catalog/page-${i}</loc></url>`).join('') + '</urlset>'); return }
    res.statusCode = 404; res.end()
  })
  const base = await listen(server)
  const options = { timeoutMs: 1000, maxBytes: 2048, maxSitemaps: 3 }
  try {
    const pages = await collectSitemapUrls(base + '/catalog/', base + '/pages.xml', { ...options, maxUrls: 3 })
    assert.ok(pages.ok); assert.equal(pages.urls.length, 3); assert.equal(pages.limited, true)
    reads = 0
    const index = await collectSitemapUrls(base + '/catalog/', base + '/index.xml', options)
    assert.ok(index.ok); assert.equal(index.limited, true); assert.ok(reads <= 3)
    const large = await fetchTextWithLimit(base + '/large.xml.gz', { timeoutMs: 1000, maxBytes: 256 })
    assert.equal(large.ok, false, 'compressed payloads are limited after expansion')
    const controller = new AbortController()
    const pending = collectSitemapUrls(base + '/catalog/', base + '/slow.xml', { ...options, signal: controller.signal })
    const rejected = assert.rejects(pending, /abort/i)
    await slowStarted; controller.abort(); await rejected
    const empty = await collectSitemapUrls(base + '/catalog/', base + '/sitemap.xml', { ...options, maxSitemaps: 24, discover: true })
    assert.deepEqual(empty, { ok: true, urls: [], limited: false }, 'absent optional sitemaps are normal')
  } finally {
    server.closeAllConnections(); await close(server)
    if (previous === undefined) delete process.env.AGENTIC_OS_CRAWLER_ALLOW_PRIVATE_NETWORKS
    else process.env.AGENTIC_OS_CRAWLER_ALLOW_PRIVATE_NETWORKS = previous
  }
})

test('selected-page job creates only chosen artifacts, publishes progress, and rejects selection replay drift', async () => {
  const root = await fs.mkdtemp(path.join(tmpdir(), 'website-selection-job-'))
  const previousPrivate = process.env.AGENTIC_OS_CRAWLER_ALLOW_PRIVATE_NETWORKS
  process.env.AGENTIC_OS_CRAWLER_ALLOW_PRIVATE_NETWORKS = '1'
  const previousStore = process.env.AGENTIC_OS_WORKSPACE_STORE_ROOT
  process.env.AGENTIC_OS_WORKSPACE_STORE_ROOT = path.join(root, 'store')
  const requests: string[] = []
  let releaseSlow!: () => void
  const slow = new Promise<void>(resolve => { releaseSlow = resolve })
  const source = createServer((req, res) => {
    requests.push(req.url || '')
    void (async () => {
      if (req.url === '/library/slow') await slow
      res.setHeader('Content-Type', 'text/html')
      res.end('<article><h1>Chosen page</h1><p>Complete selected content.</p><a href="/library/unchecked">Unchecked child</a></article>')
    })()
  })
  const sourceBase = await listen(source)
  const handler = createWebsiteImportHandler({ repoRoot: root })
  const api = createServer((req, res) => { void handler(req, res, () => { res.statusCode = 404; res.end() }) })
  const base = await listen(api)
  const post = (selectedUrls: unknown, extraHeaders = {}) => fetch(`${base}/__website_import/start`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...extraHeaders }, body: JSON.stringify({ url: `${sourceBase}/library/`, options: { selectedUrls, generationToken: '20260928T120000Z', maxPages: 1, concurrency: 2, browserMode: 'headless', generateMarkdownArtifacts: true } }) })
  const manifest = async (): Promise<WebsiteImportManifestV1> => (await fetch(`${base}/__website_import/manifest?importId=20260928T120000Z`).then(r => r.json())).manifest
  try {
    assert.equal((await post([])).status, 400)
    assert.equal((await post([`${sourceBase}/outside`])).status, 400)
    assert.equal((await post([`${sourceBase}/library/a`], { Origin: 'https://other.test' })).status, 400)
    assert.deepEqual(await fs.readdir(root), [], 'rejected requests must not create an import')
    const selected = [`${sourceBase}/library/a`, `${sourceBase}/library/slow`]
    assert.equal((await post(selected)).status, 200)
    let partial: WebsiteImportManifestV1 | undefined
    for (let attempt = 0; attempt < 350; attempt++) {
      partial = await manifest()
      if (partial.nodes.some(node => node.status === 'ok')) break
      await new Promise(resolve => setTimeout(resolve, 20))
    }
    assert.equal(partial?.status, 'running')
    assert.equal(partial?.nodes.filter(node => node.status === 'ok').length, 1, 'completed page is visible while the other page is pending')
    releaseSlow()
    let done: WebsiteImportManifestV1 | undefined
    for (let attempt = 0; attempt < 350; attempt++) {
      done = await manifest()
      if (done.status === 'done' || done.status === 'failed') break
      await new Promise(resolve => setTimeout(resolve, 20))
    }
    assert.equal(done?.status, 'done')
    assert.deepEqual(done?.errors, [])
    assert.deepEqual(new Set(done?.nodes.map(node => node.url)), new Set(selected))
    assert.deepEqual(done?.selectedUrls, selected)
    assert.deepEqual(new Set(requests), new Set(['/library/a', '/library/slow']), 'root, sitemap and unchecked links must never be fetched')
    const first = done!.nodes[0]!
    const markdown = await fetch(`${base}/__website_import/artifact?importId=20260928T120000Z&nodeId=${first.nodeId}&kind=markdown`).then(r => r.text())
    assert.match(markdown, /Complete selected content/)
    assert.equal((await post(selected)).status, 200)
    assert.equal((await post([selected[0]])).status, 409)
  } finally {
    releaseSlow(); await close(api); await close(source)
    if (previousPrivate === undefined) delete process.env.AGENTIC_OS_CRAWLER_ALLOW_PRIVATE_NETWORKS
    else process.env.AGENTIC_OS_CRAWLER_ALLOW_PRIVATE_NETWORKS = previousPrivate
    if (previousStore === undefined) delete process.env.AGENTIC_OS_WORKSPACE_STORE_ROOT
    else process.env.AGENTIC_OS_WORKSPACE_STORE_ROOT = previousStore
    await fs.rm(root, { recursive: true, force: true })
  }
})
