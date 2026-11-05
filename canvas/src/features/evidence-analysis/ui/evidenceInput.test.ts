import assert from 'node:assert/strict'
import test from 'node:test'
import { readEvidenceExamples } from './evidenceInput'

const paths = ['/evidence-analysis/fixtures/first.json', '/evidence-analysis/fixtures/second.json']
test('production examples bind the native revision while development and Node keep unversioned paths', async () => {
  const revision = '0123456789abcdef0123456789abcdef01234567'
  const calls: string[] = []
  const fetcher = (async path => { calls.push(String(path)); return new Response('{}') }) as typeof fetch
  for (const base of ['/', '/agentic-graph/']) {
    await readEvidenceExamples(paths, fetcher, base, { production: true, sourceRevision: revision })
    assert.deepEqual(calls.splice(0), paths.map(path => `${base}${path.slice(1)}?revision=${revision}`))
  }
  await readEvidenceExamples([paths[0]], fetcher, '/', { production: false, sourceRevision: revision })
  await readEvidenceExamples([paths[0]], fetcher)
  assert.deepEqual(calls, [paths[0], paths[0]])
})
test('production cannot silently fall back or inject a query through an invalid revision', async () => {
  let calls = 0
  const fetcher = (async () => { calls++; return new Response('{}') }) as typeof fetch
  for (const sourceRevision of [undefined, '', 'unknown', 'a'.repeat(39), `${'a'.repeat(40)}&other=1`]) {
    await assert.rejects(readEvidenceExamples([paths[0]], fetcher, '/agentic-graph/', { production: true, sourceRevision }), /native source revision/)
  }
  assert.equal(calls, 0)
})
test('logical example paths resolve within root, native and configured application bases', async () => {
  for (const [base, prefix] of [['/', '/'], ['/agentic-graph/', '/agentic-graph/'], ['/custom/study', '/custom/study/']]) {
    const calls: { path: string; init: RequestInit | undefined }[] = []
    const fetcher = (async (path, init) => { calls.push({ path: String(path), init }); return new Response('{"original":"retained"}') }) as typeof fetch
    assert.deepEqual(await readEvidenceExamples(paths, fetcher, base), ['{"original":"retained"}', '{"original":"retained"}'])
    assert.deepEqual(calls.map(call => call.path), paths.map(path => prefix + path.slice(1)))
    assert.ok(calls.every(call => call.init?.mode === 'same-origin' && call.init.redirect === 'error' && call.init.credentials === 'same-origin'))
  }
})
test('application bases and logical paths cannot escape before a request', async () => {
  let calls = 0
  const fetcher = (async () => { calls++; throw new Error('Unexpected request') }) as typeof fetch
  for (const base of ['https://external.invalid/', '//external.invalid/', 'relative/', '/study/../', '/study/%2e%2e/', '/study/%2Fother/', '/study/%5cother/', '/study\\other/', '/study/\n../', '/study/%09../', '/study/?q=1', '/study/#part', '/study/%zz/']) {
    await assert.rejects(readEvidenceExamples([paths[0]], fetcher, base), /Example base/)
  }
  for (const path of ['/evidence-analysis/fixtures/../first.json', '/evidence-analysis/fixtures/%2e%2e.json', '//external.invalid/first.json']) {
    await assert.rejects(readEvidenceExamples([path], fetcher, '/agentic-graph/'), /local asset/)
  }
  assert.equal(calls, 0)
})
test('example input reads exact UTF-8 bytes and refuses redirects at transport', async () => {
  const calls: RequestInit[] = []
  const fetcher = (async (_path, init) => { calls.push(init!); return new Response('{"label":"π"}') }) as typeof fetch
  assert.deepEqual(await readEvidenceExamples([paths[0]], fetcher), ['{"label":"π"}'])
  assert.equal(calls[0].redirect, 'error'); assert.equal(calls[0].mode, 'same-origin')
  await assert.rejects(readEvidenceExamples(['https://other.invalid/a.json'], fetcher), /local asset/)
  await assert.rejects(readEvidenceExamples([paths[0]], (async () => new Response(new Uint8Array([0xff]))) as typeof fetch), /encoded data|encoding/i)
})
test('the input bound applies across all streamed assets and cancels the overflowing body', async () => {
  let call = 0, canceled = false
  const fetcher = (async () => {
    call++
    if (call === 1) return new Response('a'.repeat(1_500_000))
    let sent = false
    return new Response(new ReadableStream({ pull(controller) { if (!sent) { sent = true; controller.enqueue(new Uint8Array(500_001)) } }, cancel() { canceled = true } }))
  }) as typeof fetch
  await assert.rejects(readEvidenceExamples(paths, fetcher), /combined 2,000,000/)
  assert.equal(canceled, true); assert.equal(call, 2)
})
test('declared oversized assets are rejected before reading and redirected responses are refused', async () => {
  let canceled = false
  const body = new ReadableStream({ cancel() { canceled = true } })
  await assert.rejects(readEvidenceExamples([paths[0]], (async () => new Response(body, { headers: { 'content-length': '2000001' } })) as typeof fetch), /input bound/)
  assert.equal(canceled, true)
  const response = new Response('{}'); Object.defineProperty(response, 'redirected', { value: true })
  await assert.rejects(readEvidenceExamples([paths[0]], (async () => response) as typeof fetch), /unavailable/)
})
test('a cancelled owner never requests an example and cancellation prevents the next batch request', async () => {
  const controller = new AbortController(); controller.abort()
  let calls = 0
  const fetcher = (async () => { calls++; return new Response('{}') }) as typeof fetch
  await assert.rejects(readEvidenceExamples(paths, fetcher, '/', { production: false }, { signal: controller.signal }), { name: 'AbortError' })
  assert.equal(calls, 0)
  const next = new AbortController()
  const cancellingFetch = (async () => { calls++; next.abort(); return new Response('{}') }) as typeof fetch
  await assert.rejects(readEvidenceExamples(paths, cancellingFetch, '/', { production: false }, { signal: next.signal }), { name: 'AbortError' })
  assert.equal(calls, 1)
})
test('stalled headers have a whole-read deadline and a late body is cancelled', { timeout: 2000 }, async () => {
  let finish!: (response: Response) => void, requestSignal: AbortSignal | undefined, cancelled = false
  const fetcher = ((_path, init) => { requestSignal = init?.signal as AbortSignal; return new Promise<Response>(resolve => { finish = resolve }) }) as typeof fetch
  await assert.rejects(readEvidenceExamples([paths[0]], fetcher, '/', { production: false }, { timeoutMs: 20 }), /deadline/)
  assert.equal(requestSignal?.aborted, true)
  finish(new Response(new ReadableStream({ cancel() { cancelled = true } })))
  await new Promise(resolve => setTimeout(resolve, 0))
  assert.equal(cancelled, true)
})
test('stalled bodies are cancelled without waiting for a broken stream cleanup', { timeout: 2000 }, async () => {
  let cancelled = false
  const response = new Response(new ReadableStream({ cancel() { cancelled = true; return new Promise(() => {}) } }))
  await assert.rejects(readEvidenceExamples([paths[0]], (async () => response) as typeof fetch, '/', { production: false }, { timeoutMs: 20 }), /deadline/)
  assert.equal(cancelled, true)
  assert.equal(response.body?.locked, false)
})
test('owner cancellation aborts a pending body and a later independent load succeeds', async () => {
  const controller = new AbortController()
  let cancelled = false, signal: AbortSignal | undefined
  const fetcher = (async (_path, init) => {
    signal = init?.signal as AbortSignal
    return new Response(new ReadableStream({ start() { setTimeout(() => controller.abort(), 0) }, cancel() { cancelled = true } }))
  }) as typeof fetch
  await assert.rejects(readEvidenceExamples(paths, fetcher, '/', { production: false }, { signal: controller.signal }), { name: 'AbortError' })
  assert.equal(signal?.aborted, true); assert.equal(cancelled, true)
  assert.deepEqual(await readEvidenceExamples([paths[0]], (async () => new Response('{}')) as typeof fetch), ['{}'])
})
