import { buildWebpageHtmlSrcdoc } from '@/lib/websites/webpageIframeSrcdoc'
import { WEBPAGE_HTML_PREVIEW_LIMIT_MESSAGE, WEBPAGE_HTML_PREVIEW_MAX_BYTES } from '@/lib/websites/webpageHtmlPreviewBudget'

export function testWebpageHtmlSrcdocBoundsLargeHtmlBeforeSanitizing() {
  const html = `<div data-state="${'x'.repeat(2_100_000)}"><h1>Captured content</h1></div>`
  const built = buildWebpageHtmlSrcdoc({ html, baseHref: 'https://example.invalid/', scriptPolicy: 'strip' })
  if (!built.includes(WEBPAGE_HTML_PREVIEW_LIMIT_MESSAGE)) throw new Error('expected a visible preview limit with Markdown recovery')
  if (built.includes('Captured content')) throw new Error('oversized HTML must not enter the iframe')
  if (new TextEncoder().encode(built).byteLength > WEBPAGE_HTML_PREVIEW_MAX_BYTES) throw new Error('fallback must be bounded')
}
