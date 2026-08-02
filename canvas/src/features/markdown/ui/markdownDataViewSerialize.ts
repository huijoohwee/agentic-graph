import type { MarkdownDataView } from './markdownDataViewModel'

const escapeMarkdownTableCell = (raw: string): string => {
  const s = String(raw ?? '')
  return s
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/\\/g, '\\\\')
    .replace(/\|/g, '\\|')
    .replace(/\r?\n/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

const buildSeparatorCell = (): string => '---'

export type MarkdownPipeTableScalar = string | number | boolean | null | undefined
export type MarkdownPipeTableAlignment = 'left' | 'center' | 'right' | null | undefined

export type MarkdownPipeTableInput = {
  columns: readonly MarkdownPipeTableScalar[]
  rows: readonly (readonly MarkdownPipeTableScalar[])[]
  alignments?: readonly MarkdownPipeTableAlignment[]
}

export type ParsedMarkdownPipeTable = {
  columns: string[]
  rows: string[][]
  alignments: Array<Exclude<MarkdownPipeTableAlignment, undefined>>
}

export type ParseMarkdownPipeTableOptions = {
  maxColumns?: number
  maxRows?: number
  maxCellCharacters?: number
  maxTotalCells?: number
}

const DEFAULT_MARKDOWN_PIPE_TABLE_LIMITS = Object.freeze({
  maxColumns: 64,
  maxRows: 1_000,
  maxCellCharacters: 16_384,
  maxTotalCells: 50_000,
})

/**
 * Canonical serializer for generated/persisted table artifacts.
 *
 * Keep HTML out of this boundary. Renderers may derive DOM tables from the
 * returned Markdown, while YAML frontmatter stores these lines as a block
 * scalar so the Markdown remains the single authored table authority.
 */
export const serializeMarkdownPipeTable = (input: MarkdownPipeTableInput): string[] => {
  const columns = Array.isArray(input.columns) ? input.columns.map(value => String(value ?? '')) : []
  const rows = Array.isArray(input.rows) ? input.rows : []
  if (columns.length < 1) return []

  const header = `| ${columns.map(escapeMarkdownTableCell).join(' | ')} |`
  const sep = `| ${columns.map((column, index) => {
    const base = buildSeparatorCell()
    const alignment = input.alignments?.[index]
    if (alignment === 'right') return `${base}:`
    if (alignment === 'center') return `:${base}:`
    return base
  }).join(' | ')} |`
  const body = rows.map(r => {
    const cells = columns.map((_, i) => escapeMarkdownTableCell(String(r[i] ?? '')))
    return `| ${cells.join(' | ')} |`
  })
  return [header, sep, ...body]
}

export const serializeMarkdownDataViewToTableLines = (view: MarkdownDataView): string[] =>
  serializeMarkdownPipeTable({
    columns: Array.isArray(view.columns) ? view.columns.map(column => column.name) : [],
    rows: Array.isArray(view.rows) ? view.rows.map(row => row.cells) : [],
  })

const splitMarkdownPipeRow = (line: string): string[] | null => {
  const trimmed = String(line || '').trim()
  if (!trimmed.startsWith('|') || !trimmed.endsWith('|')) return null
  const body = trimmed.slice(1, -1)
  const cells: string[] = []
  let cell = ''
  let escaped = false
  for (const char of body) {
    if (escaped) {
      cell += char
      escaped = false
      continue
    }
    if (char === '\\') {
      cell += char
      escaped = true
      continue
    }
    if (char === '|') {
      cells.push(cell.trim())
      cell = ''
      continue
    }
    cell += char
  }
  cells.push(cell.trim())
  return cells
}

const unescapeMarkdownPipeCell = (value: string): string =>
  value.replace(/\\([\\|])/g, '$1')

const isMarkdownPipeDelimiterRow = (line: string, expectedColumns: number): boolean => {
  const cells = splitMarkdownPipeRow(line)
  return !!cells
    && cells.length === expectedColumns
    && cells.every(cell => /^:?-{3,}:?$/.test(cell.replace(/\s+/g, '')))
}

const parseMarkdownPipeAlignment = (value: string): Exclude<MarkdownPipeTableAlignment, undefined> => {
  const normalized = value.replace(/\s+/g, '')
  if (normalized.startsWith(':') && normalized.endsWith(':')) return 'center'
  if (normalized.startsWith(':')) return 'left'
  if (normalized.endsWith(':')) return 'right'
  return null
}

const readBoundedInteger = (value: number | undefined, fallback: number): number => {
  if (!Number.isFinite(value)) return fallback
  return Math.max(1, Math.floor(value as number))
}

const readMarkdownPipeTableLimits = (options: ParseMarkdownPipeTableOptions) => ({
  maxColumns: readBoundedInteger(options.maxColumns, DEFAULT_MARKDOWN_PIPE_TABLE_LIMITS.maxColumns),
  maxRows: readBoundedInteger(options.maxRows, DEFAULT_MARKDOWN_PIPE_TABLE_LIMITS.maxRows),
  maxCellCharacters: readBoundedInteger(
    options.maxCellCharacters,
    DEFAULT_MARKDOWN_PIPE_TABLE_LIMITS.maxCellCharacters,
  ),
  maxTotalCells: readBoundedInteger(options.maxTotalCells, DEFAULT_MARKDOWN_PIPE_TABLE_LIMITS.maxTotalCells),
})

const isMarkdownFenceMarker = (line: string): boolean => /^(`{3,}|~{3,})/.test(line.trim())

/**
 * Parse the first authored GFM pipe table while ignoring fenced examples.
 *
 * The parser is deliberately bounded because generated Markdown can be
 * provider-controlled and downstream consumers may materialize every cell.
 */
export const parseMarkdownPipeTable = (
  value: unknown,
  options: ParseMarkdownPipeTableOptions = {},
): ParsedMarkdownPipeTable | null => {
  const limits = readMarkdownPipeTableLimits(options)
  const lines = String(value ?? '').replace(/\r\n?/g, '\n').split('\n')
  let fence: '`' | '~' | null = null

  for (let index = 0; index < lines.length - 1; index += 1) {
    const line = lines[index] || ''
    if (isMarkdownFenceMarker(line)) {
      const marker = line.trim().startsWith('~') ? '~' : '`'
      fence = fence === marker ? null : (fence || marker)
      continue
    }
    if (fence) continue

    const headerCells = splitMarkdownPipeRow(line)
    if (!headerCells || headerCells.length < 1 || headerCells.length > limits.maxColumns) continue
    const delimiterCells = splitMarkdownPipeRow(lines[index + 1] || '')
    if (
      !delimiterCells
      || delimiterCells.length !== headerCells.length
      || !delimiterCells.every(cell => /^:?-{3,}:?$/.test(cell.replace(/\s+/g, '')))
    ) {
      continue
    }

    const columns = headerCells.map(unescapeMarkdownPipeCell)
    if (columns.some(cell => cell.length > limits.maxCellCharacters)) return null
    const rows: string[][] = []
    let totalCells = columns.length

    for (let rowIndex = index + 2; rowIndex < lines.length; rowIndex += 1) {
      const rowLine = lines[rowIndex] || ''
      if (isMarkdownFenceMarker(rowLine)) break
      const rowCells = splitMarkdownPipeRow(rowLine)
      if (!rowCells) break
      if (rowCells.length !== columns.length) return null
      if (rows.length >= limits.maxRows || totalCells + rowCells.length > limits.maxTotalCells) return null
      const row = rowCells.map(unescapeMarkdownPipeCell)
      if (row.some(cell => cell.length > limits.maxCellCharacters)) return null
      rows.push(row)
      totalCells += row.length
    }

    return {
      columns,
      rows,
      alignments: delimiterCells.map(parseMarkdownPipeAlignment),
    }
  }
  return null
}

/** Detect a real GFM pipe table while ignoring fenced examples and prose pipes. */
export const containsMarkdownPipeTable = (value: unknown): boolean => {
  const lines = String(value ?? '').replace(/\r\n?/g, '\n').split('\n')
  let fence: '`' | '~' | null = null
  for (let index = 0; index < lines.length - 1; index += 1) {
    const line = lines[index] || ''
    const fenceMatch = line.trim().match(/^(`{3,}|~{3,})/)
    if (fenceMatch) {
      const marker = fenceMatch[1]?.startsWith('~') ? '~' : '`'
      fence = fence === marker ? null : (fence || marker)
      continue
    }
    if (fence) continue
    const headerCells = splitMarkdownPipeRow(line)
    if (!headerCells || headerCells.length < 1) continue
    if (isMarkdownPipeDelimiterRow(lines[index + 1] || '', headerCells.length)) return true
  }
  return false
}
