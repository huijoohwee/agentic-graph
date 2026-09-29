import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { tmpdir } from 'node:os'
import { createServer, type Server } from 'node:http'
import { validateSelectedWebsiteUrls } from '@/lib/websites/server/websiteImportDiscovery'
import { buildWebsiteSelectionTree, websiteFolderUrls } from '@/lib/websites/websiteImportSelection'
import { NativeWebsiteCrawler } from '@/lib/websites/server/nativeWebsiteCrawler'
import { createWebsiteImportHandler } from '@/lib/websites/server/websiteImportServer'
import type { WebsiteImportManifestV1 } from '@/lib/websites/server/websiteImportTypes'

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
