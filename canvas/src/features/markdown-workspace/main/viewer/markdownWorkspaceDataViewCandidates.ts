import { LRUCache } from '@/lib/cache/LRUCache'
import type { TokenWithLines } from '@/features/markdown/ui/markdownPreviewLexUtils'
import type { TokensTable } from '@/features/markdown/ui/MarkdownTokens'
import {
  buildMarkdownDataViewFromTableToken,
  type MarkdownDataView,
} from '@/features/markdown/ui/markdownDataViewModel'
import { serializeMarkdownDataViewToTableLines } from '@/features/markdown/ui/markdownDataViewSerialize'
import type { JsonToMarkdownMode } from '@/features/markdown/jsonToMarkdown'
import { tryBuildJsonMarkdownTablesFromText } from '@/features/markdown/jsonToMarkdownDocument'
import type { DelimitedTextParseResult } from '@/lib/delimited-text/delimitedText'
import { buildWorkspaceDataViewSourceTableId } from './workspaceDataViewConfig'

export type DataViewCandidate = {
  id: string
  label: string
  table: TokenWithLines & TokensTable
  view: MarkdownDataView
  readonly?: boolean
  structuredSource?: boolean
}

const DATA_VIEW_CANDIDATES_CACHE = new LRUCache<string, DataViewCandidate[]>(60)
const ROWS_JSON_DATA_VIEW_CANDIDATES_CACHE = new LRUCache<string, DataViewCandidate[]>(40)
const DELIMITED_TEXT_DATA_VIEW_CANDIDATES_CACHE = new LRUCache<string, DataViewCandidate[]>(40)
const DERIVED_TABLE_SOURCE_BUDGET_CHARS = 320_000
const HEADING_LINE_RE = /^#{1,6}\s+(.+?)\s*#*\s*$/

export function tryBuildApiGraphMarkdownTablesFromJson(text: string, preferredMode?: JsonToMarkdownMode): string | null {
  return tryBuildJsonMarkdownTablesFromText(text, preferredMode)
}

const buildMarkdownDataViewFromTableTokenLoose = (table: TokensTable): MarkdownDataView | null => {
  const headerCells = Array.isArray(table.header) ? table.header : []
  const rowsCells = Array.isArray(table.rows) ? table.rows : []
  const colCount = Math.max(headerCells.length, ...rowsCells.map(r => r.length))
  if (!Number.isFinite(colCount) || colCount <= 1 || colCount > 32) return null

  const headerNames = Array.from({ length: colCount }).map((_, i) => String(headerCells[i]?.text ?? '').trim())
  const rows = rowsCells.map((r, rowIndex) => {
    const cells = Array.from({ length: colCount }).map((_, colIndex) => String(r[colIndex]?.text ?? '').trim())
    return { id: `row_${rowIndex}`, cells }
  })
  if (rows.length < 1) return null

  const columns = headerNames.map((name, colIndex) => {
    const safe = name || `Column ${colIndex + 1}`
    return { id: `col_${colIndex}`, name: safe, kind: 'text' as const }
  })

  const titleColumnId = columns[0]?.id ?? 'col_0'
  return { columns, rows, titleColumnId, groupByColumnId: null }
}

const isRecord = (value: unknown): value is Record<string, unknown> => (
  !!value && typeof value === 'object' && !Array.isArray(value)
)

const normalizeArtifactFields = (fieldsRaw: unknown[], records: readonly Record<string, unknown>[]): string[] => {
  const fields: string[] = []
  const seen = new Set<string>()
  for (const raw of fieldsRaw) {
    const field = String(raw ?? '').trim()
    if (!field || seen.has(field)) continue
    seen.add(field)
    fields.push(field)
  }
  for (const record of records) {
    for (const key of Object.keys(record)) {
      if (seen.has(key)) continue
      seen.add(key)
      fields.push(key)
    }
  }
  return fields
}

const cellTextForArtifactValue = (value: unknown): string => {
  if (value == null) return ''
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value)
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

const buildSourceTableCandidate = (args: {
  fields: readonly string[]
  rows: readonly (readonly unknown[])[]
  sourcePath?: string | null
}): DataViewCandidate | null => {
  const fields = Array.from(args.fields || []).map((field, index) => String(field || '').trim() || `field_${index + 1}`)
  const rows = Array.from(args.rows || []).map(row => Array.from({ length: fields.length }).map((_, index) => cellTextForArtifactValue(row[index])))
  if (fields.length < 1 || rows.length < 1) return null
  const table: TokenWithLines & TokensTable = {
    type: 'table',
    raw: '',
    header: fields.map(field => ({ text: field })),
    rows: rows.map(row => row.map(text => ({ text }))),
    startLine: 1,
    endLine: Math.max(1, rows.length + 2),
  }
  const view = buildMarkdownDataViewFromTableToken(table)
  if (!view) return null
  const sourcePath = typeof args.sourcePath === 'string' ? args.sourcePath.trim() : ''
  return {
    id: buildWorkspaceDataViewSourceTableId(rows.length),
    label: sourcePath ? `Source table: ${sourcePath}` : 'Source table',
    table,
    view,
    readonly: true,
  }
}

export const buildDataViewCandidatesFromRowsJsonArtifact = (
  jsonText: string,
  candidatesKey: string,
): DataViewCandidate[] => {
  const trimmed = String(jsonText || '').trim()
  if (!trimmed || !trimmed.startsWith('{')) return []
  const cacheKey = `rows-json:${candidatesKey}`
  const cached = ROWS_JSON_DATA_VIEW_CANDIDATES_CACHE.get(cacheKey)
  if (cached) return cached

  let parsed: unknown
  try {
    parsed = JSON.parse(trimmed)
  } catch {
    ROWS_JSON_DATA_VIEW_CANDIDATES_CACHE.set(cacheKey, [])
    return []
  }
  if (!isRecord(parsed)) {
    ROWS_JSON_DATA_VIEW_CANDIDATES_CACHE.set(cacheKey, [])
    return []
  }
  const rowsRaw = parsed.rows
  if (!Array.isArray(rowsRaw)) {
    ROWS_JSON_DATA_VIEW_CANDIDATES_CACHE.set(cacheKey, [])
    return []
  }
  const records = rowsRaw.filter(isRecord)
  if (records.length < 1) {
    ROWS_JSON_DATA_VIEW_CANDIDATES_CACHE.set(cacheKey, [])
    return []
  }
  const metadata = isRecord(parsed.metadata) ? parsed.metadata : {}
  const fieldsRaw = Array.isArray(metadata.fieldNames) ? metadata.fieldNames : []
  const fields = normalizeArtifactFields(fieldsRaw, records)
  if (fields.length < 1) {
    ROWS_JSON_DATA_VIEW_CANDIDATES_CACHE.set(cacheKey, [])
    return []
  }
  const candidate = buildSourceTableCandidate({
    fields,
    rows: records.map(record => fields.map(field => record[field])),
    sourcePath: typeof metadata.sourcePath === 'string' ? metadata.sourcePath.trim() : '',
  })
  if (!candidate) {
    ROWS_JSON_DATA_VIEW_CANDIDATES_CACHE.set(cacheKey, [])
    return []
  }
  const candidates: DataViewCandidate[] = [candidate]
  ROWS_JSON_DATA_VIEW_CANDIDATES_CACHE.set(cacheKey, candidates)
  return candidates
}

export const buildDataViewCandidatesFromDelimitedTextParseResult = (args: {
  parseResult: DelimitedTextParseResult
  candidatesKey: string
  sourcePath?: string | null
}): DataViewCandidate[] => {
  const cacheKey = `delimited-text:${args.candidatesKey}`
  const cached = DELIMITED_TEXT_DATA_VIEW_CANDIDATES_CACHE.get(cacheKey)
  if (cached) return cached
  const rows = Array.isArray(args.parseResult.rows) ? args.parseResult.rows : []
  const headers = Array.isArray(args.parseResult.headers) ? args.parseResult.headers : []
  const fieldCount = Math.max(headers.length, ...rows.map(row => Array.isArray(row) ? row.length : 0))
  const fields = headers.length > 0
    ? Array.from({ length: fieldCount }).map((_, index) => headers[index] || `field_${index + 1}`)
    : Array.from({ length: fieldCount }).map((_, index) => `field_${index + 1}`)
  const candidate = buildSourceTableCandidate({
    fields,
    rows,
    sourcePath: args.sourcePath,
  })
  const candidates = candidate ? [candidate] : []
  DELIMITED_TEXT_DATA_VIEW_CANDIDATES_CACHE.set(cacheKey, candidates)
  return candidates
}

export const buildMarkdownPipeTableFromRowsJsonArtifact = (
  jsonText: string,
  candidatesKey: string,
): string | null => {
  const candidate = buildDataViewCandidatesFromRowsJsonArtifact(jsonText, candidatesKey)[0]
  if (!candidate) return null
  const lines = serializeMarkdownDataViewToTableLines(candidate.view)
  return lines.length > 0 ? `${lines.join('\n')}\n` : null
}

// The lexer supplies ordered, one-based source ranges. Locate them without copying the whole document.
function sourceLineCursor(markdown: string) {
  let line = 1
  let offset = 0
  return (target: number) => {
    while (line < target && offset < markdown.length) {
      const next = markdown.indexOf('\n', offset)
      offset = next < 0 ? markdown.length : next + 1
      line++
    }
    return offset
  }
}

const isStructuredSourceCandidateLabel = (label: string): boolean => {
  const normalized = String(label || '').trim().toLowerCase()
  return normalized === 'markdown yaml frontmatter' || normalized === 'markdown body'
}

export const buildDataViewCandidates = (
  markdownText: string,
  candidatesKey: string,
  tokens: TokenWithLines[],
  relaxed: boolean,
): DataViewCandidate[] => {
  const cacheKey = `${candidatesKey}|${relaxed ? 'relaxed' : 'strict'}`
  const cached = DATA_VIEW_CANDIDATES_CACHE.get(cacheKey)
  if (cached) return cached
  const candidates: DataViewCandidate[] = []
  const seenLabels = new Map<string, number>()
  const offsetAtLine = sourceLineCursor(markdownText)
  let remaining = DERIVED_TABLE_SOURCE_BUDGET_CHARS
  let heading = ''
  for (const token of tokens) {
    if (token.type === 'heading' && 'text' in token) {
      const start = offsetAtLine(token.startLine)
      const rawHeading = markdownText.slice(start, offsetAtLine(token.startLine + 1)).trim()
      heading = rawHeading.match(HEADING_LINE_RE)?.[1]?.trim() || token.text
    }
    if (token.type === 'code') heading = ''
    if (token.type !== 'table' || !('header' in token)) continue
    const table = token
    const from = offsetAtLine(table.startLine)
    const length = offsetAtLine(table.endLine + 1) - from
    if (length > remaining) continue
    const view = relaxed
      ? (buildMarkdownDataViewFromTableToken(table) || buildMarkdownDataViewFromTableTokenLoose(table))
      : buildMarkdownDataViewFromTableToken(table)
    if (!view) continue
    remaining -= length
    const startLine = Math.max(1, Math.floor(Number((table as unknown as { startLine?: unknown }).startLine || 0)))
    const endLine = Math.max(startLine, Math.floor(Number((table as unknown as { endLine?: unknown }).endLine || 0)))
    const stableId = `md-block:${startLine}-${endLine}`
    const baseLabel = heading || `Table ${candidates.length + 1}`
    const labelCount = seenLabels.get(baseLabel) || 0
    seenLabels.set(baseLabel, labelCount + 1)
    const label = labelCount > 0 ? `${baseLabel} (${labelCount + 1})` : baseLabel
    candidates.push({
      id: stableId,
      label,
      table,
      view,
      structuredSource: isStructuredSourceCandidateLabel(baseLabel),
    })
  }
  DATA_VIEW_CANDIDATES_CACHE.set(cacheKey, candidates)
  return candidates
}
