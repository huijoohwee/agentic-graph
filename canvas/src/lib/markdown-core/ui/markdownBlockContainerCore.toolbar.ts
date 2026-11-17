import type { MarkdownFormatAction } from 'grph-shared/markdown/formatting'

export const resolveTurnIntoFormatAction = (next: string): MarkdownFormatAction | 'codeBlock' | null => {
  if (next === 'heading2') return 'heading2'
  if (next === 'bulletList') return 'bulletList'
  if (next === 'numberedList') return 'numberedList'
  if (next === 'blockquote') return 'blockquote'
  if (next === 'code') return 'codeBlock'
  return null
}

export { toggleHeadingAcrossLines } from 'agentic-design-system/markdown'
