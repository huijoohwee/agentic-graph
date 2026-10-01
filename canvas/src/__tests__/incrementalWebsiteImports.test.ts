import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { handleWebsiteImportRevalidation } from '@/lib/websites/server/websiteImportRevalidation'

// A local generic origin exercises real request validators without crawling a user fixture.
test('explicit source checks reuse validators across handler lifetimes and detect changed bytes', async () => {
  const previousPolicy = process.env.AGENTIC_OS_CRAWLER_ALLOW_PRIVATE_NETWORKS
  process.env.AGENTIC_OS_CRAWLER_ALLOW_PRIVATE_NETWORKS = '1'
  let content = 'first content', requests = 0, bodies = 0, lastValidator: unknown
  const upstream = createServer((req, res) => {
    requests++; lastValidator = req.headers['if-none-match']
    const etag = `"${content}"`
    res.setHeader('ETag', etag); res.setHeader('Content-Type', 'text/plain'); res.setHeader('Cache-Control', 'public, max-age=0')
    if (lastValidator === etag) { res.writeHead(304); res.end(); return }
    bodies++; res.end(content)
  })
  const handler = createServer((req, res) => { void handleWebsiteImportRevalidation(req, res) })
  await new Promise<void>(resolve => upstream.listen(0, '127.0.0.1', resolve))
  await new Promise<void>(resolve => handler.listen(0, '127.0.0.1', resolve))
  const origin = `http://127.0.0.1:${(upstream.address() as { port: number }).port}`
  const endpoint = `http://127.0.0.1:${(handler.address() as { port: number }).port}`
  const check = async (options: Record<string, unknown> = {}) => (await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: origin, options }) })).json()
  try {
    const first = await check(); assert.equal(first.text, content); assert.equal(first.unchanged, false)
    // Validator/digest are supplied from durable caller state, never a process memory cache.
    const second = await check(first); assert.equal(second.unchanged, true); assert.equal(second.text, undefined); assert.equal(bodies, 1); assert.equal(requests, 2)
    content = 'other content'
    const third = await check(second); assert.equal(third.unchanged, false); assert.equal(third.text, content); assert.notEqual(third.digest, first.digest)
    const sameBytes = await check({ digest: third.digest }); assert.equal(sameBytes.unchanged, true, 'origins without validators still avoid reconversion of identical bytes')
    const rejected = await fetch(endpoint, { method: 'POST', headers: { Origin: 'https://foreign.invalid', 'Content-Type': 'application/json' }, body: JSON.stringify({ url: origin }) })
    assert.equal(rejected.status, 400); assert.equal(requests, 4)
  } finally {
    await new Promise<void>(resolve => handler.close(() => resolve())); await new Promise<void>(resolve => upstream.close(() => resolve()))
    if (previousPolicy === undefined) delete process.env.AGENTIC_OS_CRAWLER_ALLOW_PRIVATE_NETWORKS; else process.env.AGENTIC_OS_CRAWLER_ALLOW_PRIVATE_NETWORKS = previousPolicy
  }
})
