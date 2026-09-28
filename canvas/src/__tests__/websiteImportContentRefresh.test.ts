import test from 'node:test'
import assert from 'node:assert/strict'
import { refreshWebsiteImportMarkdown } from '@/features/markdown-workspace/workspaceImport/refreshWebsiteImportMarkdown'
import { convertHtmlToMarkdownUnified } from '@/lib/markdown/htmlToMarkdownUnified'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'

test('new conversion and saved-import refresh retain the whole article with sibling transcript and source metadata', async () => {
  const { restore } = initJsdomHarness(), previousFetch = globalThis.fetch
  const intro = 'An introduction with enough prose to qualify as article content. '.repeat(12)
  const transcript = Array.from({ length: 100 }, (_, i) => `<p>Speaker ${i}: Complete passage ${i}, with its original detail.</p>`).join('')
  // No publisher names, host-specific selectors or embedded state format.
  const html = `<nav>Navigation links</nav><section><h1>Complete interview</h1><div class="prose"><p>${intro}</p><div><h2>Transcript</h2>${transcript}</div></div></section><footer>Footer links</footer>`
  const header = '---\nkgWebpageUrl: "https://example.test/interview"\nkgWebsiteImportId: "20260928T034028Z"\nkgWebsiteNodeId: "a456"\nkgCanvas2dRenderer: "d3"\ncustom: "keep this"\n---'
  const previous = `${header}\n\n${intro}`
  const requests: string[] = []
  globalThis.fetch = (async input => {
    requests.push(String(input))
    return new Response(html, { headers: { 'content-type': 'text/html' } })
  }) as typeof fetch
  try {
    const fresh = await convertHtmlToMarkdownUnified({ html, baseUrl: 'https://example.test/interview', fidelityLevel: 4 })
    assert.equal(fresh.ok, true)
    const updated = await refreshWebsiteImportMarkdown(previous, 'https://example.test/interview')
    assert.ok(updated?.startsWith(`${header}\n\n`))
    for (const text of [fresh.ok ? fresh.markdown : '', updated!]) {
      assert.match(text, /Complete interview/); assert.match(text, /Transcript/)
      assert.match(text, /Speaker 0:/); assert.match(text, /Speaker 99:/)
      assert.doesNotMatch(text, /Navigation links|Footer links/)
    }
    assert.equal(requests.length, 1)
    assert.ok(requests[0]!.startsWith('/__website_import/artifact?'))
    assert.match(requests[0]!, /kind=rawHtml/)
    assert.equal(await refreshWebsiteImportMarkdown('# Ordinary file', 'https://example.test'), null)
    assert.equal(requests.length, 1)
  } finally { globalThis.fetch = previousFetch; restore() }
})

test('missing and oversized captures fail instead of replacing content with a summary or truncation', async () => {
  const { restore } = initJsdomHarness(), previousFetch = globalThis.fetch
  globalThis.fetch = (async () => new Response('Not found', { status: 404 })) as typeof fetch
  try {
    await assert.rejects(refreshWebsiteImportMarkdown('---\nkgWebsiteImportId: "20260928T000000Z"\nkgWebsiteNodeId: "missing"\n---\nOriginal', 'https://example.test'))
    globalThis.fetch = (async () => new Response('x'.repeat(10_000_001))) as typeof fetch
    await assert.rejects(refreshWebsiteImportMarkdown('---\nkgWebsiteImportId: "20260928T000000Z"\nkgWebsiteNodeId: "oversized"\n---\nOriginal', 'https://example.test'), /exceeds the conversion limit/)
  } finally { globalThis.fetch = previousFetch; restore() }
})
