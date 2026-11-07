import assert from 'node:assert/strict'
import { test } from 'node:test'
import http from 'node:http'
import dns from 'node:dns/promises'
import { EventEmitter } from 'node:events'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { fetchTextWithLimit } from '../lib/websites/server/websiteImportCore'
import { resolveCrawlerTarget, isPrivateCrawlerAddress } from '../lib/websites/server/crawlerNetworkPolicy'
import { reserveWebsiteImportRun } from '../lib/websites/server/websiteImportStorage'
import { createWebsiteImportHandler } from '../lib/websites/server/websiteImportServer'

async function listen(server: http.Server): Promise<string> {
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  return `http://127.0.0.1:${(server.address() as { port: number }).port}`
}
async function close(server: http.Server) {
  server.closeAllConnections()
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
}

test('public URL policy blocks private addresses, mapped IPv6 and credentials', async () => {
  for (const address of ['127.0.0.1', '10.0.0.1', '169.254.169.254', '::1', '::ffff:7f00:1', '0:0:0:0:0:ffff:127.0.0.1', 'fc00::1', 'fe80::1', 'ff02::1']) {
    assert.equal(isPrivateCrawlerAddress(address), true, address)
    const host = address.includes(':') ? `[${address}]` : address
    await assert.rejects(resolveCrawlerTarget(`http://${host}/`), /not a public/)
  }
  await assert.rejects(resolveCrawlerTarget('http://user:pass@example.invalid/'), /not a public/)
  assert.equal(isPrivateCrawlerAddress('2606:4700:4700::1111'), false)
})

test('static redirects reapply the public policy and pin the first checked connection', async t => {
  let requests = 0
  t.mock.method(http, 'get', (_url: URL, options: { lookup: (...args: unknown[]) => void }, callback: (res: unknown) => void) => {
    requests += 1
    options.lookup('ignored.invalid', {}, (error: unknown, address: unknown) => {
      assert.equal(error, null)
      assert.equal(address, '93.184.216.34')
    })
    const req = new EventEmitter()
    queueMicrotask(() => callback({ statusCode: 302, headers: { location: 'http://127.0.0.1/private' }, destroy() {} }))
    return req
  })
  const previous = process.env.AGENTIC_OS_CRAWLER_ALLOW_PRIVATE_NETWORKS
  delete process.env.AGENTIC_OS_CRAWLER_ALLOW_PRIVATE_NETWORKS
  try {
    const result = await fetchTextWithLimit('http://93.184.216.34/', { timeoutMs: 1000, maxBytes: 1024 })
    assert.equal(result.ok, false)
    assert.equal(requests, 1)
  } finally {
    if (previous === undefined) delete process.env.AGENTIC_OS_CRAWLER_ALLOW_PRIVATE_NETWORKS
    else process.env.AGENTIC_OS_CRAWLER_ALLOW_PRIVATE_NETWORKS = previous
  }
})

test('mixed DNS answers fail closed and slow DNS observes the request deadline', async t => {
  const lookup = t.mock.method(dns, 'lookup', async () => [
    { address: '93.184.216.34', family: 4 }, { address: '127.0.0.1', family: 4 },
  ])
  await assert.rejects(resolveCrawlerTarget('https://mixed.invalid/'), /non-public/)
  lookup.mock.mockImplementation(() => new Promise(() => {}))
  const result = await fetchTextWithLimit('https://slow.invalid/', { timeoutMs: 20, maxBytes: 1024 })
  assert.deepEqual(result, { ok: false, error: 'Request timed out' })
})

test('static fetch blocks local access by default and enforces streaming byte limits under explicit development override', async () => {
  let received = 0
  const server = http.createServer((_req, res) => { received += 1; res.end('x'.repeat(2048)) })
  const url = await listen(server)
  const previous = process.env.AGENTIC_OS_CRAWLER_ALLOW_PRIVATE_NETWORKS
  delete process.env.AGENTIC_OS_CRAWLER_ALLOW_PRIVATE_NETWORKS
  try {
    assert.equal((await fetchTextWithLimit(url, { timeoutMs: 1000, maxBytes: 4096 })).ok, false)
    assert.equal(received, 0)
    process.env.AGENTIC_OS_CRAWLER_ALLOW_PRIVATE_NETWORKS = '1'
    assert.equal((await fetchTextWithLimit(url, { timeoutMs: 1000, maxBytes: 4096 })).ok, true)
    const large = await fetchTextWithLimit(url, { timeoutMs: 1000, maxBytes: 1024 })
    assert.ok(large.ok === false && /too large/.test(large.error))
  } finally {
    if (previous === undefined) delete process.env.AGENTIC_OS_CRAWLER_ALLOW_PRIVATE_NETWORKS
    else process.env.AGENTIC_OS_CRAWLER_ALLOW_PRIVATE_NETWORKS = previous
    await close(server)
  }
})

test('conditional metadata stays opt-in and validators do not leak across redirects', async () => {
  const previous = process.env.AGENTIC_OS_CRAWLER_ALLOW_PRIVATE_NETWORKS
  process.env.AGENTIC_OS_CRAWLER_ALLOW_PRIVATE_NETWORKS = '1'
  let forwarded: string | string[] | undefined
  const server = http.createServer((req, res) => {
    if (req.url === '/redirect') { res.writeHead(302, { Location: '/destination' }); res.end(); return }
    if (req.url === '/destination') { forwarded = req.headers['if-none-match']; res.end('current'); return }
    res.writeHead(304, { ETag: '"same"' }); res.end()
  })
  const base = await listen(server)
  const options = { timeoutMs: 1000, maxBytes: 1024, allowedOrigin: base }
  try {
    assert.deepEqual(await fetchTextWithLimit(base, options), { ok: false, error: 'HTTP 304' })
    const validated = await fetchTextWithLimit(base, { ...options, cache: { etag: '"same"' } })
    assert.ok(validated.ok); assert.equal(validated.response?.status, 304); assert.equal(validated.text, '')
    const redirected = await fetchTextWithLimit(base + '/redirect', { ...options, cache: { etag: '"same"' } })
    assert.ok(redirected.ok); assert.equal(redirected.text, 'current'); assert.equal(redirected.response?.redirected, true)
    assert.equal(forwarded, undefined)
  } finally {
    await close(server)
    if (previous === undefined) delete process.env.AGENTIC_OS_CRAWLER_ALLOW_PRIVATE_NETWORKS
    else process.env.AGENTIC_OS_CRAWLER_ALLOW_PRIVATE_NETWORKS = previous
  }
})

test('parallel reservations preserve distinct runs and reject incompatible explicit reuse', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'website-admission-'))
  try {
    const runs = await Promise.all(Array.from({ length: 8 }, (_, page) => reserveWebsiteImportRun(root, undefined, { page })))
    assert.equal(new Set(runs.map(run => run.importId)).size, 8)
    const first = runs[0]
    assert.deepEqual(await reserveWebsiteImportRun(root, first.importId, { page: 0 }), { importId: first.importId, existing: true })
    await assert.rejects(reserveWebsiteImportRun(root, first.importId, { page: 1 }), /different URL/)
    const legacy = '20260101T000000Z'
    await fs.mkdir(path.join(root, legacy))
    await assert.rejects(reserveWebsiteImportRun(root, legacy, { page: 0 }), /unbound/)
  } finally { await fs.rm(root, { recursive: true, force: true }) }
})

test('actual import handler preserves both manifests and idempotently reuses an exact request', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'website-handler-'))
  const previous = process.env.AGENTIC_OS_WORKSPACE_STORE_ROOT
  process.env.AGENTIC_OS_WORKSPACE_STORE_ROOT = root
  await fs.writeFile(path.join(root, 'first.html'), '<h1>First article</h1>')
  await fs.writeFile(path.join(root, 'second.html'), '<h1>Second article</h1>')
  const handler = createWebsiteImportHandler({ repoRoot: root })
  const api = http.createServer((req, res) => { void handler(req, res, () => { res.statusCode = 404; res.end() }) })
  const base = await listen(api)
  const send = async (url: string, generationToken?: string) => {
    const response = await fetch(`${base}/__website_import/import-url`, { method: 'POST', body: JSON.stringify({ url, options: { generationToken } }) })
    return { status: response.status, body: await response.json() as { ok: boolean; importId: string } }
  }
  try {
    const [first, second] = await Promise.all([send('first.html'), send('second.html')])
    assert.equal(first.status, 200); assert.equal(second.status, 200)
    assert.notEqual(first.body.importId, second.body.importId)
    const readManifest = async (id: string) => JSON.parse(await fs.readFile(path.join(root, 'agentic-graph-workspace/website-imports', id, 'manifest.json'), 'utf8'))
    assert.equal((await readManifest(first.body.importId)).rootUrl, 'first.html')
    assert.equal((await readManifest(second.body.importId)).rootUrl, 'second.html')
    const original = await readManifest(first.body.importId)
    assert.equal((await send('first.html', first.body.importId)).status, 200)
    assert.equal((await send('second.html', first.body.importId)).status, 409)
    assert.deepEqual(await readManifest(first.body.importId), original)
    const start = async (options: Record<string, unknown>) => {
      const response = await fetch(`${base}/__website_import/start`, { method: 'POST', body: JSON.stringify({ url: 'first.html', options }) })
      return { status: response.status, body: await response.json() as { importId: string } }
    }
    const crawl = await start({ maxPages: 1 })
    assert.equal(crawl.status, 200)
    const repeated = await start({ maxPages: 1, generationToken: crawl.body.importId })
    assert.equal(repeated.status, 200)
    assert.equal(repeated.body.importId, crawl.body.importId)
    assert.equal((await start({ maxPages: 2, generationToken: crawl.body.importId })).status, 409)
    // Wait only for this test-owned local job before removing its temporary directory.
    const deadline = Date.now() + 2000
    while (['queued', 'running'].includes((await readManifest(crawl.body.importId)).status)) {
      assert.ok(Date.now() < deadline, 'local fixture crawl must terminate')
      await new Promise(resolve => setTimeout(resolve, 10))
    }

  } finally {
    await close(api)
    if (previous === undefined) delete process.env.AGENTIC_OS_WORKSPACE_STORE_ROOT
    else process.env.AGENTIC_OS_WORKSPACE_STORE_ROOT = previous
    await fs.rm(root, { recursive: true, force: true })
  }
})
