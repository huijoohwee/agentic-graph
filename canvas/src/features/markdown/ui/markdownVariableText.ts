import type { MarkdownVariablePreview } from './MarkdownRendererTypes'
import { parseMarkdownVariableTokens } from './markdownVariableReferences'

/** Captions may reference other frontmatter scalars; cycles stay visible and bounded. */
export function resolveMarkdownVariableText(text: string, previews: Record<string, MarkdownVariablePreview>, visited: string[] = []): string {
  if (visited.length >= 8) return text
  let cursor = 0, result = ''
  for (const token of parseMarkdownVariableTokens(text)) {
    result += text.slice(cursor, token.start)
    const key = token.key.toLowerCase(), preview = previews[key]
    const value = preview?.displayValue ?? preview?.value ?? token.fallback ?? token.declaredValue
    result += value == null || visited.includes(key) ? token.raw : resolveMarkdownVariableText(value, previews, [...visited, key])
    cursor = token.end
  }
  return result + text.slice(cursor)
}
