import { expandInlineTranscriptMarkdownLines } from './transcriptMarkdownLines'
import { collapseRepeatedBlockquotePayload, restoreEncodedBlockquotePrefix } from './markdownStructuralEntities'
import { serializeMarkdownPipeTable } from '@/features/markdown/ui/markdownDataViewSerialize'

function countUnescapedPipes(line: string): number {
  let count = 0
  let escaped = false
  for (const ch of String(line || '')) {
    if (escaped) {
      escaped = false
      continue
    }
    if (ch === '\\') {
      escaped = true
      continue
    }
    if (ch === '|') count += 1
  }
  return count
}

function decodeHtmlEntitiesBasic(text: string): string {
  return String(text || '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
}

function stripHtmlTags(text: string): string {
  return decodeHtmlEntitiesBasic(String(text || '').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim()
}

const SIMPLE_HTML_WRAPPER_TAGS = new Set([
  'article',
  'b',
  'div',
  'em',
  'footer',
  'header',
  'i',
  'label',
  'main',
  'p',
  'section',
  'small',
  'span',
  'strong',
  'sub',
  'sup',
  'u',
])

const CANONICAL_HTML_TABLE_LINE_PREFIX = '\uE000kg-markdown-table:'

function convertHtmlTableToMarkdown(tableHtml: string): string {
  const rows: string[][] = []
  const rowRe = /<tr\b[^>]*>([\s\S]*?)<\/tr>/giu
  let rowMatch: RegExpExecArray | null
  while ((rowMatch = rowRe.exec(String(tableHtml || '')))) {
    const rowHtml = String(rowMatch[1] || '')
    const cells: string[] = []
    const cellRe = /<t[hd]\b[^>]*>([\s\S]*?)<\/t[hd]>/giu
    let cellMatch: RegExpExecArray | null
    while ((cellMatch = cellRe.exec(rowHtml))) {
      const cellText = stripHtmlTags(String(cellMatch[1] || ''))
      cells.push(cellText)
    }
    if (cells.length) rows.push(cells)
  }
  if (!rows.length) return stripHtmlTags(tableHtml)
  const header = rows[0]!
  const body = rows.slice(1)
  return serializeMarkdownPipeTable({
    columns: header,
    rows: body.map(row => header.map((_, index) => row[index] || '')),
  }).join('\n')
}

function convertRawHtmlTables(markdown: string): string {
  return String(markdown || '').replace(/<table\b[\s\S]*?<\/table>/giu, tableHtml =>
    convertHtmlTableToMarkdown(tableHtml)
      .split('\n')
      .map(line => `${CANONICAL_HTML_TABLE_LINE_PREFIX}${line}`)
      .join('\n'))
}

function restoreLinePrefixes(line: string): string {
  return String(line || '')
    .replace(/^(\s*)\\>\s+/u, '$1> ')
    .replace(/^(\s*)\\([-*+])\s+/u, '$1$2 ')
    .replace(/^(\s*)\\(\d+\.)\s+/u, '$1$2 ')
    .replace(/^(\s*)-\s+(\d+\.\s+)/u, '$1$2')
}

function restoreSegmentSyntax(segment: string, isTableLine: boolean): string {
  let restored = String(segment || '')
  restored = restored.replace(/\\+([[\]`*_~$!])/gu, '$1')
  restored = restored.replace(/\\+\|/gu, isTableLine ? '|' : '\\|')
  restored = restored.replace(/\\+([<>])/gu, '$1')
  return restored
}

function simplifySimpleHtmlWrapper(body: string): string {
  const trimmed = String(body || '').trim()
  if (!trimmed.startsWith('<') || !trimmed.endsWith('>')) return body
  if (/<(?:a|audio|blockquote|code|h[1-6]|iframe|img|li|math|ol|pre|table|ul|video)\b/i.test(trimmed)) return body
  let sawTag = false
  const tagRe = /<\/?([a-z0-9-]+)\b[^>]*>/giu
  let match: RegExpExecArray | null
  while ((match = tagRe.exec(trimmed))) {
    sawTag = true
    const tag = String(match[1] || '').toLowerCase()
    if (!SIMPLE_HTML_WRAPPER_TAGS.has(tag)) return body
  }
  if (!sawTag) return body
  const simplified = stripHtmlTags(trimmed)
  return simplified || body
}

function normalizeSimpleHtmlWrapperLine(line: string): string {
  const text = String(line || '')
  let rest = text
  let prefix = ''
  const blockquoteMatch = rest.match(/^(\s*>+\s*)/u)
  if (blockquoteMatch) {
    prefix += blockquoteMatch[1] || ''
    rest = rest.slice(prefix.length)
  }
  const listMatch = rest.match(/^(\s*(?:[-*+]\s+|\d+\.\s+))/u)
  if (listMatch) {
    prefix += listMatch[1] || ''
    rest = rest.slice((listMatch[1] || '').length)
  }
  const simplified = simplifySimpleHtmlWrapper(rest)
  return simplified === rest ? text : `${prefix}${simplified}`
}

function looksLikeRecoveredCodeLine(line: string): boolean {
  const text = String(line || '').trim()
  if (!text) return false
  if (/^[#()[\]{}'"`]/u.test(text)) return true
  if (/^(?:from|import|def|class|for|while|if|elif|else|try|except|finally|with|return|yield|raise|break|continue|print|const|let|var|function|async|await|export|interface|type)\b/u.test(text)) return true
  if (/[:=]\s*[^ ]|->|=>|\bnp\./u.test(text)) return true
  return false
}

function normalizeRecoveredFenceCodeLine(line: string): string {
  const raw = String(line || '')
  if (!/^\s*[-*+]\s+\S/u.test(raw)) return raw
  const stripped = raw.replace(/^(\s*)[-*+]\s+/u, '$1')
  return looksLikeRecoveredCodeLine(stripped) ? stripped : raw
}

function normalizeFenceDelimiterLine(line: string): string {
  const text = String(line || '')
  return /^\s*(`{3,}|~{3,})/u.test(text) ? text.trim() : text
}

function restoreInlineSyntax(line: string): string {
  const isTableLine = /^\s*\|.*\|\s*$/u.test(line) || countUnescapedPipes(line) >= 2
  let out = ''
  let i = 0
  while (i < line.length) {
    const ch = line[i] || ''
    const prev = i > 0 ? line[i - 1] || '' : ''
    if (ch !== '`' || prev === '\\') {
      let j = i
      while (j < line.length) {
        const current = line[j] || ''
        const currentPrev = j > 0 ? line[j - 1] || '' : ''
        if (current === '`' && currentPrev !== '\\') break
        j += 1
      }
      out += restoreSegmentSyntax(line.slice(i, j), isTableLine)
      i = j
      continue
    }
    let fenceLen = 1
    while (i + fenceLen < line.length && (line[i + fenceLen] || '') === '`') fenceLen += 1
    const fence = '`'.repeat(fenceLen)
    let j = i + fenceLen
    while (j < line.length) {
      if (line.slice(j, j + fenceLen) === fence) {
        j += fenceLen
        break
      }
      j += 1
    }
    out += line.slice(i, Math.min(j, line.length))
    i = j
  }
  return out
}

export function restoreWebpageMarkdownSyntaxFidelity(markdown: string): string {
  const lines = convertRawHtmlTables(String(markdown || '')).replace(/\r/g, '').split('\n')
  const out: string[] = []
  let inFence = false
  for (const rawLine of lines) {
    if (rawLine.startsWith(CANONICAL_HTML_TABLE_LINE_PREFIX)) {
      out.push(rawLine.slice(CANONICAL_HTML_TABLE_LINE_PREFIX.length))
      continue
    }
    const trimmed = rawLine.trim()
    if (/^`{3,}/u.test(trimmed) || /^~{3,}/u.test(trimmed)) {
      inFence = !inFence
      out.push(normalizeFenceDelimiterLine(rawLine))
      continue
    }
    if (inFence) {
      out.push(normalizeRecoveredFenceCodeLine(rawLine))
      continue
    }
    const withPrefixes = collapseRepeatedBlockquotePayload(restoreEncodedBlockquotePrefix(restoreLinePrefixes(rawLine)))
    const withSimplifiedHtmlWrappers = normalizeSimpleHtmlWrapperLine(withPrefixes)
    const expandedLines = expandInlineTranscriptMarkdownLines(withSimplifiedHtmlWrappers)
    if (!expandedLines.length) {
      out.push(restoreInlineSyntax(withSimplifiedHtmlWrappers))
      continue
    }
    for (const expandedLine of expandedLines) out.push(restoreInlineSyntax(expandedLine))
  }
  return out.join('\n')
}
