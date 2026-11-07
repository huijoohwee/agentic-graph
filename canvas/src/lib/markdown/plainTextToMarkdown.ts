import { expandInlineTranscriptMarkdownLines } from './transcriptMarkdownLines'
import { restoreEncodedBlockquotePrefix } from './markdownStructuralEntities'

function looksLikeMarkdownStructuralLine(line: string): boolean {
  const text = String(line || '').trim()
  if (!text) return false
  return (
    /^#{1,6}\s/u.test(text)
    || /^>\s?/u.test(text)
    || /^\s*[-*+]\s/u.test(text)
    || /^\s*\d+\.\s/u.test(text)
    || /^\s*`{3,}|^\s*~{3,}/u.test(text)
    || /^\s*\|.*\|\s*$/u.test(text)
    || /^!\[[^\]]*\]\([^)]+\)\s*$/u.test(text)
    || /^\[[^\]]+\]\([^)]+\)\s*$/u.test(text)
  )
}

function normalizeFenceDelimiterLine(line: string): string {
  const text = String(line || '')
  return /^\s*(`{3,}|~{3,})/u.test(text) ? text.trim() : text
}

function buildMarkdownBodyFromPlainText(text: string): string {
  const lines = String(text || '').replace(/\r\n/g, '\n').split('\n')
  const blocks: string[] = []
  let paragraphLines: string[] = []
  let inFence = false
  const flushParagraph = () => {
    if (!paragraphLines.length) return
    blocks.push(paragraphLines.join(' ').replace(/\s+/g, ' ').trim())
    paragraphLines = []
  }
  const pushBlankLine = () => {
    if (!blocks.length || blocks[blocks.length - 1] === '') return
    blocks.push('')
  }
  for (const rawLine of lines) {
    const expandedLines = expandInlineTranscriptMarkdownLines(rawLine)
    if (!expandedLines.length) {
      flushParagraph()
      pushBlankLine()
      continue
    }
    for (const expandedLine of expandedLines) {
      const line = String(expandedLine || '').replace(/\s+$/u, '')
      const trimmed = line.trim()
      if (!trimmed) {
        flushParagraph()
        pushBlankLine()
        continue
      }
      if (/^\s*`{3,}|^\s*~{3,}/u.test(trimmed)) {
        flushParagraph()
        blocks.push(normalizeFenceDelimiterLine(line))
        inFence = !inFence
        continue
      }
      if (inFence) {
        blocks.push(line)
        continue
      }
      const structuralLine = restoreEncodedBlockquotePrefix(trimmed)
      if (looksLikeMarkdownStructuralLine(structuralLine)) {
        flushParagraph()
        blocks.push(structuralLine)
        continue
      }
      paragraphLines.push(trimmed)
    }
  }
  flushParagraph()
  return blocks.join('\n').replace(/\n{3,}/g, '\n\n').trim()
}

export function plainTextToMarkdown(text: string, title?: string): string {
  const t = String(text || '').replace(/\r\n/g, '\n').trim()
  const titleText = String(title || '').trim()
  if (!t) return titleText ? `# ${titleText}` : ''
  const body = buildMarkdownBodyFromPlainText(t)
  if (!titleText) return body
  const firstLine = (body.split('\n')[0] || '').trim()
  if (firstLine.startsWith('# ')) return body
  return `# ${titleText}\n\n${body}`
}
