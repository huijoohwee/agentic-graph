import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parseArgs } from '../cli/convert-webpage-url-to-md'
import { convertHtmlToMarkdownUnified } from '../lib/markdown/htmlToMarkdownUnified'
import { convertWebpageHtmlToMarkdownArtifactAsync } from '../lib/websites/webpageHtmlToMarkdownArtifact'
import { convertWebpageUrlToMarkdownViaProxyFetch } from '../lib/websites/webpageClientConvert'
import { initJsdomHarness } from '../tests/lib/jsdomHarness'
import { stripOversizedHydrationAttributes } from '../lib/markdown/htmlToMarkdownHast'

test('CLI image flag is order-independent and reaches actual conversion', async () => {
  const { restore } = initJsdomHarness()
  try {
    const url = 'https://example.invalid/article'
    const html = '<article><h1>Example</h1><p>Body text.</p><img src="/photo.png" alt="Photo"></article>'
    for (const argv of [ ['--no-images', '--url', url, '--out', 'page.md'], ['--url', url, '--out', 'page.md', '--no-images'] ]) {
      const args = parseArgs(argv)
      assert.equal(args.includeImages, false)
      const markdown = await convertWebpageHtmlToMarkdownArtifactAsync({ html, url, includeImages: args.includeImages })
      assert.ok(markdown.includes('Body text.'))
      assert.ok(!markdown.includes('photo.png'))
    }
    const args = parseArgs(['--url', url, '--out', 'page.md'])
    const markdown = await convertWebpageHtmlToMarkdownArtifactAsync({ html, url, includeImages: args.includeImages })
    assert.ok(markdown.includes('photo.png'))
  } finally { restore() }
})

test('oversized conversion fails explicitly while a complete document retains its tail', async () => {
  const { restore } = initJsdomHarness()
  try {
    const html = `<article><h1>Beginning</h1><p>${'x'.repeat(11000)}</p><p>Final sentinel paragraph.</p></article>`
    const limited = await convertHtmlToMarkdownUnified({ html, maxInputChars: 10000 })
    assert.equal(limited.ok, false)
    if (!limited.ok) assert.equal(limited.code, 'HTML_INPUT_LIMIT_EXCEEDED')
    const complete = await convertHtmlToMarkdownUnified({ html, maxInputChars: html.length })
    assert.ok(complete.ok && complete.markdown.includes('Final sentinel paragraph.'))
    // Repeating the lower limit must not reuse an earlier complete-result cache entry.
    assert.equal((await convertHtmlToMarkdownUnified({ html, maxInputChars: 10000 })).ok, false)
  } finally { restore() }
})

test('artifact wrapper cannot hide an input-limit failure with a fallback artifact', async () => {
  await assert.rejects(convertWebpageHtmlToMarkdownArtifactAsync({ html: 'x'.repeat(10_000_001), url: 'https://example.invalid' }), /no partial Markdown/)
})

test('large inert hydration attributes do not consume the rendered-content budget', async () => {
  const { restore } = initJsdomHarness()
  try {
    const metadata = JSON.stringify({ payload: 'x'.repeat(80_000) }).replace(/"/g, '&quot;')
    const html = `<main data-state="${metadata}"><h1>Document title</h1><p>First paragraph.</p><img data-src="/image.png" alt="Image"><p>Final paragraph.</p></main>`
    const prepared = stripOversizedHydrationAttributes(html)
    assert.ok(!prepared.includes('data-state'))
    assert.ok(prepared.includes('data-src="/image.png"'))
    assert.ok(prepared.includes('Final paragraph.'))
    const result = await convertHtmlToMarkdownUnified({ html, baseUrl: 'https://example.invalid', maxInputChars: 10000 })
    assert.ok(result.ok && result.markdown.includes('First paragraph.') && result.markdown.includes('Final paragraph.'))
    const body = `<main><p>${'x'.repeat(80_000)}</p></main>`
    assert.equal(stripOversizedHydrationAttributes(body), body)
    assert.equal((await convertHtmlToMarkdownUnified({ html: body, maxInputChars: 10000 })).ok, false)
  } finally { restore() }
})

test('proxy converter refuses over-budget HTML without reporting a successful prefix', async t => {
  t.mock.method(globalThis, 'fetch', async () => new Response('x'.repeat(8_000_001)))
  const result = await convertWebpageUrlToMarkdownViaProxyFetch('https://example.invalid')
  assert.equal(result.ok, false)
  if (!result.ok) assert.match(result.error, /no partial Markdown/)
})
