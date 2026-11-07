import type { CSSProperties } from 'react'
import type { TokenWithLines } from '@/features/markdown/ui/markdownPreviewLex'

const MARKDOWN_LARGE_DOCUMENT_SOURCE_CHARS = 250_000
const MARKDOWN_LARGE_DOCUMENT_TOKEN_COUNT = 2_500
const MARKDOWN_LARGE_DOCUMENT_HEADING_COUNT = 120

function exceedsPreviewTokenBudget(tokens: TokenWithLines[]): boolean {
  // Lists, inline markup and table cells can hide thousands of renderable
  // tokens inside a single root block. Walk lazily and stop at the budget.
  const stack: Iterator<unknown>[] = [tokens.values()]
  const seen = new Set<object>()
  let count = 0
  let headings = 0
  while (stack.length) {
    const next = stack[stack.length - 1].next()
    if (next.done) { stack.pop(); continue }
    const value = next.value
    if (!value || typeof value !== 'object' || seen.has(value)) continue
    seen.add(value)
    if (Array.isArray(value)) { stack.push(value.values()); continue }
    const token = value as Record<string, unknown>
    count += 1
    if (token.type === 'heading') headings += 1
    if (count > MARKDOWN_LARGE_DOCUMENT_TOKEN_COUNT || headings > MARKDOWN_LARGE_DOCUMENT_HEADING_COUNT) return true
    for (const key of ['tokens', 'items', 'header', 'rows']) {
      if (Array.isArray(token[key])) stack.push(token[key].values())
    }
  }
  return false
}

export function deriveMarkdownPreviewDocumentMode(args: {
  sourceMarkdownText?: string
  tokens: TokenWithLines[]
}): {
  sourceMarkdownLength: number
  markdownLargeDocumentMode: boolean
} {
  const sourceMarkdownLength = typeof args.sourceMarkdownText === 'string' ? args.sourceMarkdownText.length : 0
  return {
    sourceMarkdownLength,
    markdownLargeDocumentMode:
      sourceMarkdownLength > MARKDOWN_LARGE_DOCUMENT_SOURCE_CHARS ||
      exceedsPreviewTokenBudget(args.tokens),
  }
}

export function getMarkdownPreviewScrollStyle(
  scrollClass: string,
  stickyHeadingScrollPaddingTopPx: number,
): CSSProperties {
  const stickyPadding =
    stickyHeadingScrollPaddingTopPx > 0 ? { scrollPaddingTop: `${stickyHeadingScrollPaddingTopPx}px` } : null
  if (scrollClass === 'overflow-auto') {
    return {
      scrollbarGutter: 'stable',
      overflowY: 'auto',
      overflowX: 'hidden',
      ...(stickyPadding || {}),
    }
  }
  return {
    scrollbarGutter: 'stable',
    ...(stickyPadding || {}),
  }
}
