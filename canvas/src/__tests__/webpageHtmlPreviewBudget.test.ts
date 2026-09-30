import test from 'node:test'
import assert from 'node:assert/strict'
import { buildWebpageHtmlSrcdoc, buildWebpageHtmlSrcdocAsync, clearWebpageIframeSrcdocCaches, fetchWebsiteImportArtifact } from '@/lib/websites/webpageIframeSrcdoc'
import { assertWebpageHtmlPreviewBudget, WEBPAGE_HTML_PREVIEW_MAX_BYTES as limit, WEBPAGE_HTML_PREVIEW_LIMIT_MESSAGE as message, WebpageHtmlPreviewLimitError } from '@/lib/websites/webpageHtmlPreviewBudget'

test('HTML preview measures UTF-8 bytes at the boundary', () => {
  assert.doesNotThrow(() => assertWebpageHtmlPreviewBudget('x'.repeat(limit)))
  assert.doesNotThrow(() => assertWebpageHtmlPreviewBudget('é'.repeat(limit / 2)))
  assert.throws(() => assertWebpageHtmlPreviewBudget('é'.repeat(limit / 2) + 'x'), WebpageHtmlPreviewLimitError)
  assert.throws(() => assertWebpageHtmlPreviewBudget('x'.repeat(limit + 1)), WebpageHtmlPreviewLimitError)
})

test('both builders reject oversized attributes before sanitizer steps, including allow mode', async () => {
  const html = `<div data-state="${'x'.repeat(16_000_000)}"><h1>Original capture</h1></div>`
  for (const scriptPolicy of ['strip', 'allow'] as const) {
    let steps = 0
    const args = { html, baseHref: 'https://example.invalid/', scriptPolicy }
    const sync = buildWebpageHtmlSrcdoc(args)
    const asyncResult = await buildWebpageHtmlSrcdocAsync({ ...args, onProgress: () => { steps += 1 } })
    for (const result of [sync, asyncResult.html]) {
      assert.ok(result.includes(message))
      assert.ok(!result.includes('Original capture'))
      assert.ok(new TextEncoder().encode(result).byteLength <= limit)
    }
    assert.equal(steps, 0)
  }
})

test('normal captured HTML retains content and strips source scripts', async () => {
  const args = { html: '<h1>Readable</h1><script>hydrateSite()</script>', baseHref: 'https://example.invalid/' }
  for (const html of [buildWebpageHtmlSrcdoc(args), (await buildWebpageHtmlSrcdocAsync(args)).html]) {
    assert.ok(html.includes('<h1>Readable</h1>'))
    assert.ok(!html.includes('hydrateSite()'))
    assert.ok(!html.includes(message))
  }
})

test('HTML expanded by runtime injection is also bounded', async () => {
  const args = { html: '<p>' + 'x'.repeat(limit - 7) + '</p>', baseHref: 'https://example.invalid/' }
  for (const html of [buildWebpageHtmlSrcdoc(args), (await buildWebpageHtmlSrcdocAsync(args)).html]) {
    assert.ok(html.includes(message))
    assert.ok(new TextEncoder().encode(html).byteLength <= limit)
  }
})

const read = (htmlPreview = true) => fetchWebsiteImportArtifact({
  importId: 'preview-budget', nodeId: 'page', kind: 'rawHtml', htmlPreview, signal: new AbortController().signal,
})

test('oversized Content-Length cancels before reading the preview body', async () => {
  const originalFetch = globalThis.fetch
  let pulls = 0, cancels = 0
  globalThis.fetch = async () => new Response(new ReadableStream({
    pull() { pulls += 1 }, cancel() { cancels += 1 },
  }, { highWaterMark: 0 }), { headers: { 'content-length': String(limit + 1) } })
  try {
    clearWebpageIframeSrcdocCaches()
    await assert.rejects(read(), WebpageHtmlPreviewLimitError)
    assert.equal(pulls, 0)
    assert.equal(cancels, 1)
  } finally { globalThis.fetch = originalFetch; clearWebpageIframeSrcdocCaches() }
})

test('failed body cancellation cannot replace the size-limit error', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => new Response(new ReadableStream({
    cancel() { throw new Error('Transport already closed') },
  }), { headers: { 'content-length': String(limit + 1) } })
  try {
    clearWebpageIframeSrcdocCaches()
    await assert.rejects(read(), WebpageHtmlPreviewLimitError)
  } finally { globalThis.fetch = originalFetch; clearWebpageIframeSrcdocCaches() }
})

test('missing or understated length still cancels at the streamed byte limit', async () => {
  const originalFetch = globalThis.fetch
  try {
    for (const headers of [{}, { 'content-length': '1' }]) {
      let pulls = 0, cancels = 0
      globalThis.fetch = async () => new Response(new ReadableStream({
        pull(controller) { pulls += 1; controller.enqueue(new Uint8Array(100_001)) },
        cancel() { cancels += 1 },
      }, { highWaterMark: 0 }), { headers })
      clearWebpageIframeSrcdocCaches()
      await assert.rejects(read(), WebpageHtmlPreviewLimitError)
      assert.equal(pulls, 5)
      assert.equal(cancels, 1)
    }
  } finally { globalThis.fetch = originalFetch; clearWebpageIframeSrcdocCaches() }
})

test('full-source retrieval keeps its budget and cannot bypass a later preview limit through cache', async () => {
  const originalFetch = globalThis.fetch
  const source = 'x'.repeat(limit + 1)
  let requests = 0
  globalThis.fetch = async () => { requests += 1; return new Response(source) }
  try {
    clearWebpageIframeSrcdocCaches()
    assert.equal(await read(false), source)
    await assert.rejects(read(), WebpageHtmlPreviewLimitError)
    assert.equal(requests, 2)
    assert.equal(await read(false), source)
    assert.equal(requests, 2)
  } finally { globalThis.fetch = originalFetch; clearWebpageIframeSrcdocCaches() }
})
