import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { tmpdir } from 'node:os'
import { createServer, type Server } from 'node:http'
import { gzipSync } from 'node:zlib'
import { validateSelectedWebsiteUrls } from '@/lib/websites/server/websiteImportDiscovery'
import { buildWebsiteSelectionTree, websiteFolderUrls } from '@/lib/websites/websiteImportSelection'
import { NativeWebsiteCrawler } from '@/lib/websites/server/nativeWebsiteCrawler'
import { createWebsiteImportHandler } from '@/lib/websites/server/websiteImportServer'
import type { WebsiteImportManifestV1 } from '@/lib/websites/server/websiteImportTypes'
import { collectSitemapUrls } from '@/lib/websites/server/websiteImportServerHelpers'
import { extractXmlLocs, fetchTextWithLimit } from '@/lib/websites/server/websiteImportCore'

const listen = async (server: Server) => {
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  return `http://127.0.0.1:${(server.address() as { port: number }).port}`
}
const close = (server: Server) => new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))

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
