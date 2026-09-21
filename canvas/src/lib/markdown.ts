import { load as parseYaml } from 'js-yaml'
import { parseAsciiBoxTable } from '../features/markdown/ui/codeblock/asciiBoxTable'
import { repairFrontmatterYamlSyntax } from './markdown/frontmatterYamlRepair'

export type MarkdownFrontmatter = Record<string, unknown>
export type MarkdownFrontmatterParseResult = {
  meta: MarkdownFrontmatter
  startIndex: number
  warnings: string[]
}

export type MarkdownBlock =
  | { kind: 'heading'; level: number; text: string; startLine: number; endLine: number }
  | { kind: 'paragraph'; text: string; startLine: number; endLine: number }
  | { kind: 'code'; text: string; language?: string; startLine: number; endLine: number }
  | {
      kind: 'table'
      text: string
      tableFormat?: 'markdown' | 'ascii'
      tableHeader?: string[]
      tableRows?: string[][]
      startLine: number
      endLine: number
    }
  | {
      kind: 'list'
      items: Array<{ text: string; ordered: boolean; index?: number }>
      startLine: number
      endLine: number
    }

export const splitMarkdownLines = (raw: string): string[] =>
  String(raw || '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')

const isYamlFrontmatterFenceLine = (line: string): boolean => /^---\s*$/.test(String(line || ''))

export const parseMarkdownFrontmatter = (
  lines: string[],
  limits?: { maxNodes: number; maxDepth: number },
): MarkdownFrontmatterParseResult => {
  if (limits && (!Number.isSafeInteger(limits.maxNodes) || limits.maxNodes < 1
    || !Number.isSafeInteger(limits.maxDepth) || limits.maxDepth < 0)) throw new Error('Invalid frontmatter traversal limits')
  if (!lines.length) return { meta: {}, startIndex: 0, warnings: [] }
  if (!isYamlFrontmatterFenceLine(lines[0] || '')) return { meta: {}, startIndex: 0, warnings: [] }
  let endIndex = -1
  for (let i = 1; i < lines.length; i += 1) {
    if (isYamlFrontmatterFenceLine(lines[i] || '')) {
      endIndex = i
      break
    }
  }
  if (endIndex < 0) return { meta: {}, startIndex: 0, warnings: [] }

  const frontmatterText = lines.slice(1, endIndex).join('\n')
  const warnings: string[] = []
  const recoverFrontmatterMermaidLiteral = (raw: string): string => {
    const srcLines = String(raw || '').split('\n')
    for (let i = 0; i < srcLines.length; i += 1) {
      const line = srcLines[i] || ''
      const match = /^(\s*)mermaid\s*:\s*(\||>)\s*$/.exec(line)
      if (!match) continue
      const baseIndent = (match[1] || '').length
      const block: string[] = []
      let minIndent = Number.POSITIVE_INFINITY
      for (let j = i + 1; j < srcLines.length; j += 1) {
        const next = srcLines[j] || ''
        if (!next.trim()) {
          block.push('')
          continue
        }
        const indent = (next.match(/^\s*/) || [''])[0].length
        if (indent <= baseIndent) break
        if (indent < minIndent) minIndent = indent
        block.push(next)
      }
      if (block.length === 0) return ''
      const trimIndent = Number.isFinite(minIndent) ? minIndent : 0
      return block.map(l => (l.length >= trimIndent ? l.slice(trimIndent) : l.trimStart())).join('\n').trim()
    }
    return ''
  }
  let visitedNodes = 0
  const sanitizeYamlValue = (value: unknown, depth = 0): unknown => {
    if (limits && (++visitedNodes > limits.maxNodes || depth > limits.maxDepth)) {
      throw new Error('Markdown frontmatter traversal limit exceeded')
    }
    if (value instanceof Date) return value.toISOString()
    if (Array.isArray(value)) return value.map(v => sanitizeYamlValue(v, depth + 1))
    if (value && typeof value === 'object') {
      const record = value as Record<string, unknown>
      const out: Record<string, unknown> = {}
      for (const key of Object.keys(record)) Object.defineProperty(out, key, {
        value: sanitizeYamlValue(record[key], depth + 1), enumerable: true, writable: true, configurable: true,
      })
      return out
    }
    return value
  }
  const formatYamlError = (error: unknown): string => {
    if (!error || typeof error !== 'object') return 'unknown YAML parse error'
    const reason = typeof (error as { reason?: unknown }).reason === 'string'
      ? String((error as { reason?: unknown }).reason).trim()
      : ''
    const message = typeof (error as { message?: unknown }).message === 'string'
      ? String((error as { message?: unknown }).message).split('\n')[0]!.trim()
      : ''
    const mark = (error as { mark?: { line?: unknown; column?: unknown } }).mark
    const line = typeof mark?.line === 'number' ? mark.line + 1 : null
    const column = typeof mark?.column === 'number' ? mark.column + 1 : null
    const base = reason || message || 'unknown YAML parse error'
    if (line != null && column != null) return `${base} (line ${line}, column ${column})`
    return base
  }

  let meta: MarkdownFrontmatter = {}
  let initialParseError: string | null = null
  try {
    const parsed = parseYaml(frontmatterText) as unknown
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      meta = sanitizeYamlValue(parsed) as MarkdownFrontmatter
    }
  } catch (error) {
    initialParseError = formatYamlError(error)
    try {
      const repaired = repairFrontmatterYamlSyntax(frontmatterText)
      const parsed = parseYaml(repaired) as unknown
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        meta = sanitizeYamlValue(parsed) as MarkdownFrontmatter
        warnings.push(`Markdown frontmatter YAML parse recovered after repair: ${initialParseError}`)
      } else {
        meta = {}
      }
    } catch (repairError) {
      meta = {}
      warnings.push(
        `Markdown frontmatter YAML parse failed and frontmatter was ignored: ${initialParseError}; repair failed: ${formatYamlError(repairError)}`,
      )
    }
  }

  if (Object.keys(meta).length === 0) {
    const mermaidLiteral = recoverFrontmatterMermaidLiteral(frontmatterText)
    if (mermaidLiteral) {
      meta = { mermaid: mermaidLiteral }
    }
  }

  return { meta, startIndex: endIndex + 1, warnings }
}

export const parseMarkdownBlocks = (lines: string[], startIndex: number): MarkdownBlock[] => {
  const blocks: MarkdownBlock[] = []
  let i = startIndex
  const lineCount = lines.length

  const splitMarkdownTableRow = (raw: string): string[] => {
    const s = String(raw || '').trim()
    if (!s) return []
    const withoutEnds = s.replace(/^\|/, '').replace(/\|$/, '')
    return withoutEnds
      .split('|')
      .map(c => String(c || '').trim())
      .map(c => c.replace(/\s+/g, ' ').trim())
  }

  const parseMarkdownPipeTable = (tableText: string): { header: string[] | null; rows: string[][] } | null => {
    const rawLines = String(tableText || '').split(/\r?\n/)
    if (rawLines.length < 2) return null
    const headerLine = rawLines[0] || ''
    const dividerLine = rawLines[1] || ''
    const isDivider = (() => {
      const t = dividerLine.trim()
      if (!t.includes('|')) return false
      return /^(\|?\s*:?-+:?\s*)+\|?\s*$/.test(t.replace(/\|/g, '| '))
    })()
    if (!isDivider) return null
    const header = splitMarkdownTableRow(headerLine).filter(Boolean)
    const rows: string[][] = []
    for (let idx = 2; idx < rawLines.length; idx += 1) {
      const rowLine = rawLines[idx] || ''
      if (!rowLine.trim()) continue
      if (!rowLine.includes('|')) continue
      const cells = splitMarkdownTableRow(rowLine)
      if (cells.length > 0) rows.push(cells)
    }
    if (header.length === 0 && rows.length === 0) return null
    return { header: header.length ? header : null, rows }
  }

  while (i < lineCount) {
    const line = lines[i] ?? ''
    const trimmed = line.trim()
    if (!trimmed) {
      i += 1
      continue
    }

    const fenceOpenMatch = /^(```+|~~~+)\s*(.*)$/.exec(trimmed)
    if (fenceOpenMatch) {
      const marker = fenceOpenMatch[1] || ''
      const info = fenceOpenMatch[2] || ''
      const language = (info.trim().split(/\s+/)[0] || '').trim() || undefined
      const startLine = i + 1
      i += 1
      const bodyLines: string[] = []
      while (i < lineCount) {
        const rawInner = lines[i] ?? ''
        const tInner = rawInner.trim()
        const fenceCloseMatch = /^(```+|~~~+)\s*(.*)$/.exec(tInner)
        if (fenceCloseMatch && fenceCloseMatch[1] === marker) break
        bodyLines.push(rawInner)
        i += 1
      }
      const endLine = Math.min(lineCount, i + 1)
      if (i < lineCount) {
        const maybeClose = (lines[i] ?? '').trim()
        const fenceCloseMatch = /^(```+|~~~+)\s*(.*)$/.exec(maybeClose)
        if (fenceCloseMatch && fenceCloseMatch[1] === marker) {
          i += 1
        }
      }
      const codeText = bodyLines.join('\n')
      const lang = String(language || '').trim().toLowerCase()
      const asciiCandidate =
        lang === 'ascii' ||
        lang === 'grid' ||
        lang === 'diagram' ||
        /[┌┐└┘┬┴┼├┤│─╔╗╚╝╦╩╬║═]/.test(codeText) ||
        (/(^|\n)\s*\+[-+]{3,}\+\s*(\n|$)/.test(codeText) && /\|/.test(codeText))
      const asciiTable = asciiCandidate ? parseAsciiBoxTable(codeText) : null
      if (asciiTable) {
        blocks.push({
          kind: 'table',
          text: codeText,
          tableFormat: 'ascii',
          tableHeader: asciiTable.header || undefined,
          tableRows: asciiTable.rows || undefined,
          startLine,
          endLine,
        })
      } else {
        blocks.push({ kind: 'code', text: codeText, language, startLine, endLine })
      }
      continue
    }

    const headingMatch = /^(#{1,6})\s+(.*)$/.exec(trimmed)
    if (headingMatch) {
      const level = headingMatch[1]?.length || 1
      const text = String(headingMatch[2] || '').trim()
      const lineNo = i + 1
      blocks.push({ kind: 'heading', level, text, startLine: lineNo, endLine: lineNo })
      i += 1
      continue
    }

    const listMatch = /^(\s*)([-*+]|(\d+)\.)\s+(.+)$/.exec(line)
    if (listMatch) {
      const indent = listMatch[1] || ''
      const startLine = i + 1
      const items: Array<{ text: string; ordered: boolean; index?: number }> = []
      while (i < lineCount) {
        const liLine = lines[i] ?? ''
        const m = /^(\s*)([-*+]|(\d+)\.)\s+(.+)$/.exec(liLine)
        if (!m) break
        if ((m[1] || '') !== indent) break
        const ordered = !!m[3]
        const index = ordered ? Number(m[3] || '') : undefined
        const text = String(m[4] || '').trim()
        items.push({
          text,
          ordered,
          index: Number.isFinite(index as number) ? (index as number) : undefined,
        })
        i += 1
        while (i < lineCount) {
          const cont = lines[i] ?? ''
          if (!cont.trim()) break
          const contListStart = /^(\s*)([-*+]|(\d+)\.)\s+/.test(cont)
          const contIndent = /^(\s+)/.exec(cont)?.[1] || ''
          if (contListStart || contIndent.length <= indent.length) break
          const last = items[items.length - 1]
          last.text = `${last.text}\n${cont.trim()}`
          i += 1
        }
        while (i < lineCount && !(lines[i] ?? '').trim()) {
          i += 1
        }
      }
      const endLine = Math.max(startLine, i)
      blocks.push({ kind: 'list', items, startLine, endLine })
      continue
    }

    const isTableDivider = (raw: string): boolean => {
      const t = (raw || '').trim()
      if (!t) return false
      if (!t.includes('|')) return false
      return /^(\|?\s*:?-+:?\s*)+\|?\s*$/.test(t.replace(/\|/g, '| '))
    }

    if (trimmed.includes('|') && i + 1 < lineCount && isTableDivider(lines[i + 1] ?? '')) {
      const startLine = i + 1
      const tableLines: string[] = []
      while (i < lineCount) {
        const t = (lines[i] ?? '').trim()
        if (!t) break
        if (!t.includes('|')) break
        tableLines.push(lines[i] ?? '')
        i += 1
      }
      const endLine = Math.max(startLine, i)
      const tableText = tableLines.join('\n')
      const parsed = parseMarkdownPipeTable(tableText)
      blocks.push({
        kind: 'table',
        text: tableText,
        tableFormat: 'markdown',
        tableHeader: parsed?.header || undefined,
        tableRows: parsed?.rows || undefined,
        startLine,
        endLine,
      })
      continue
    }

    const startLine = i + 1
    const paraLines: string[] = []
    while (i < lineCount) {
      const raw = lines[i] ?? ''
      const t = raw.trim()
      if (!t) break
      if (/^(```+|~~~+)/.test(t)) break
      if (/^(#{1,6})\s+/.test(t)) break
      if (/^(\s*)([-*+]|(\d+)\.)\s+/.test(raw)) break
      if (t.includes('|') && i + 1 < lineCount && isTableDivider(lines[i + 1] ?? '')) break
      paraLines.push(raw)
      i += 1
    }
    const endLine = Math.max(startLine, i)
    blocks.push({
      kind: 'paragraph',
      text: paraLines.join('\n').trim(),
      startLine,
      endLine,
    })
  }
  return blocks
}
