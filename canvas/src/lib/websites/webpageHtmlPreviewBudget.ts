// A preview budget, not a capture/export limit. Check before parsing or hashing HTML.
export const WEBPAGE_HTML_PREVIEW_MAX_BYTES = 500_000
export const WEBPAGE_HTML_PREVIEW_LIMIT_MESSAGE =
  'HTML preview exceeds the 500 KB limit. Use Markdown to read this page. The saved source is unchanged.'

export class WebpageHtmlPreviewLimitError extends Error {
  constructor() {
    super(WEBPAGE_HTML_PREVIEW_LIMIT_MESSAGE)
    this.name = 'WebpageHtmlPreviewLimitError'
  }
}

export function exceedsWebpageHtmlPreviewBudget(html: string): boolean {
  // Every UTF-16 code unit needs at least one UTF-8 byte. Avoid encoding huge inputs.
  return html.length > WEBPAGE_HTML_PREVIEW_MAX_BYTES ||
    new TextEncoder().encode(html).byteLength > WEBPAGE_HTML_PREVIEW_MAX_BYTES
}

export function assertWebpageHtmlPreviewBudget(html: string): void {
  if (exceedsWebpageHtmlPreviewBudget(html)) throw new WebpageHtmlPreviewLimitError()
}
