export const AGENTICGRAPH_DELIMITED_TEXT_PARSER_OWNER = 'agenticgraph-native-delimited-text' as const
export const AGENTICGRAPH_DELIMITED_TEXT_PARSER_VERSION = '0.1.0'

export type DelimitedTextDiagnosticSeverity = 'warning' | 'error'

export type DelimitedTextDiagnosticCode =
  | 'ambiguous-delimiter'
  | 'bad-delimiter'
  | 'duplicate-header'
  | 'empty-header'
  | 'field-count-mismatch'
  | 'invalid-escape'
  | 'max-bytes-exceeded'
  | 'unclosed-quote'
  | 'unsupported-input'

export type DelimitedTextDiagnostic = {
  severity: DelimitedTextDiagnosticSeverity
  code: DelimitedTextDiagnosticCode
  message: string
  row?: number
  column?: number
  characterStart?: number
  characterEnd?: number
}

export type DelimitedTextProgress = {
  charsCurrent: number
  charsTotal: number
  rowCount: number
  aborted: boolean
}

export type DelimitedTextParseOptions = {
  delimiter?: string
  delimiterCandidates?: string[]
  quote?: string
  escape?: string
  newline?: '\n' | '\r\n' | '\r' | 'auto'
  header?: boolean
  trimEmptyTrailingRows?: boolean
  maxBytes?: number
  chunkSizeChars?: number
  signal?: AbortSignal
  onProgress?: (progress: DelimitedTextProgress) => void
}

export type DelimitedTextGenerateOptions = {
  delimiter?: string
  quote?: string
  escape?: string
  newline?: '\n' | '\r\n'
  fields?: string[]
  escapeFormulaCells?: boolean
}

export type DelimitedTextParseResult = {
  rows: string[][]
  headers?: string[]
  diagnostics: DelimitedTextDiagnostic[]
  metadata: {
    delimiter: string
    newline: '\n' | '\r\n' | '\r' | 'mixed' | 'unknown'
    rowCount: number
    fieldCount?: number
    parserOwner: typeof AGENTICGRAPH_DELIMITED_TEXT_PARSER_OWNER
    parserVersion: string
    aborted: boolean
  }
}

export function defaultDelimitedTextDelimiterForName(nameRaw: string | null | undefined): string | undefined {
  const normalized = String(nameRaw || '').split(/[?#]/)[0]?.toLowerCase() || ''
  if (normalized.endsWith('.tsv') || normalized.endsWith('.tab')) return '\t'
  return undefined
}

type DelimiterResolution = {
  delimiter: string
  diagnostics: DelimitedTextDiagnostic[]
}

type ScannerState = {
  rows: string[][]
  row: string[]
  field: string
  inQuotes: boolean
  fieldStarted: boolean
  quoteStart: number
  sawLf: boolean
  sawCrLf: boolean
  sawCr: boolean
  aborted: boolean
}

const DEFAULT_DELIMITERS = [',', '\t', ';', '|']
const DEFAULT_QUOTE = '"'
const DEFAULT_ESCAPE = '"'

function normalizeDelimiterCandidate(value: unknown): string {
  const raw = String(value ?? '')
  if (!raw) return ''
  if (raw.includes('\n') || raw.includes('\r')) return ''
  return raw
}

function createBadDelimiterDiagnostic(delimiter: string): DelimitedTextDiagnostic {
  return {
    severity: 'error',
    code: 'bad-delimiter',
    message: `Unsupported delimiter ${JSON.stringify(delimiter)}.`,
  }
}

function scoreDelimiter(text: string, delimiter: string): number {
  if (!delimiter) return 0
  const sample = text.slice(0, 64_000)
  const counts: number[] = []
  let count = 0
  let inQuotes = false
  for (let i = 0; i < sample.length; i += 1) {
    const ch = sample[i]
    if (ch === DEFAULT_QUOTE) {
      if (inQuotes && sample[i + 1] === DEFAULT_QUOTE) {
        i += 1
      } else {
        inQuotes = !inQuotes
      }
      continue
    }
    if (!inQuotes && sample.startsWith(delimiter, i)) {
      count += 1
      i += delimiter.length - 1
      continue
    }
    if (!inQuotes && (ch === '\n' || ch === '\r')) {
      counts.push(count)
      count = 0
      if (ch === '\r' && sample[i + 1] === '\n') i += 1
      if (counts.length >= 20) break
    }
  }
  if (counts.length < 20 && (count > 0 || sample.trim())) counts.push(count)
  const nonZero = counts.filter(v => v > 0)
  if (nonZero.length === 0) return 0
  const frequencies = new Map<number, number>()
  for (const value of nonZero) frequencies.set(value, (frequencies.get(value) || 0) + 1)
  let modeCount = 0
  let modeFrequency = 0
  for (const [value, frequency] of frequencies) {
    if (frequency > modeFrequency || (frequency === modeFrequency && value > modeCount)) {
      modeCount = value
      modeFrequency = frequency
    }
  }
  return modeCount * 100 + modeFrequency * 10 + nonZero.length
}

function resolveDelimiter(text: string, options: DelimitedTextParseOptions): DelimiterResolution {
  const explicit = normalizeDelimiterCandidate(options.delimiter)
  if (explicit) return { delimiter: explicit, diagnostics: [] }
  if (options.delimiter !== undefined && !explicit) {
    return { delimiter: ',', diagnostics: [createBadDelimiterDiagnostic(String(options.delimiter ?? ''))] }
  }

  const candidates = (options.delimiterCandidates && options.delimiterCandidates.length > 0
    ? options.delimiterCandidates
    : DEFAULT_DELIMITERS)
    .map(normalizeDelimiterCandidate)
    .filter(Boolean)
  if (candidates.length === 0) return { delimiter: ',', diagnostics: [createBadDelimiterDiagnostic('')] }

  const scored = candidates
    .map(delimiter => ({ delimiter, score: scoreDelimiter(text, delimiter) }))
    .sort((left, right) => right.score - left.score)
  const best = scored[0]
  if (!best || best.score <= 0) {
    return {
      delimiter: ',',
      diagnostics: [{
        severity: 'warning',
        code: 'ambiguous-delimiter',
        message: 'No delimiter signal was strong enough; comma was selected.',
      }],
    }
  }
  const tied = scored.filter(item => item.score === best.score)
  const diagnostics: DelimitedTextDiagnostic[] = tied.length > 1
    ? [{
        severity: 'warning',
        code: 'ambiguous-delimiter',
        message: `Multiple delimiters scored equally; ${JSON.stringify(best.delimiter)} was selected.`,
      }]
    : []
  return { delimiter: best.delimiter, diagnostics }
}

function resolveNewline(args: { sawLf: boolean; sawCrLf: boolean; sawCr: boolean }): '\n' | '\r\n' | '\r' | 'mixed' | 'unknown' {
  const values = [
    args.sawLf ? '\n' : '',
    args.sawCrLf ? '\r\n' : '',
    args.sawCr ? '\r' : '',
  ].filter(Boolean)
  if (values.length === 0) return 'unknown'
  if (values.length > 1) return 'mixed'
  return values[0] as '\n' | '\r\n' | '\r'
}

function createScanner(): ScannerState {
  return {
    rows: [],
    row: [],
    field: '',
    inQuotes: false,
    fieldStarted: false,
    quoteStart: -1,
    sawLf: false,
    sawCrLf: false,
    sawCr: false,
    aborted: false,
  }
}

function pushField(state: ScannerState): void {
  state.row.push(state.field)
  state.field = ''
  state.fieldStarted = false
}

function pushRow(state: ScannerState): void {
  pushField(state)
  state.rows.push(state.row)
  state.row = []
}

function feedScanner(args: {
  state: ScannerState
  text: string
  absoluteOffset: number
  delimiter: string
  quote: string
  escape: string
}): void {
  const state = args.state
  const delimiter = args.delimiter
  const quote = args.quote || DEFAULT_QUOTE
  const escape = args.escape || quote
  const text = args.text

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i]
    const absoluteIndex = args.absoluteOffset + i
    if (state.inQuotes) {
      if (ch === quote) {
        if (escape === quote && text[i + 1] === quote) {
          state.field += quote
          i += 1
          continue
        }
        state.inQuotes = false
        state.fieldStarted = true
        continue
      }
      state.field += ch
      continue
    }

    if (!state.fieldStarted && ch === quote) {
      state.inQuotes = true
      state.quoteStart = absoluteIndex
      state.fieldStarted = true
      continue
    }

    if (delimiter && text.startsWith(delimiter, i)) {
      pushField(state)
      i += delimiter.length - 1
      continue
    }

    if (ch === '\r' || ch === '\n') {
      if (ch === '\r' && text[i + 1] === '\n') {
        state.sawCrLf = true
        i += 1
      } else if (ch === '\r') {
        state.sawCr = true
      } else {
        state.sawLf = true
      }
      pushRow(state)
      continue
    }

    state.field += ch
    state.fieldStarted = true
  }
}

function normalizeHeaders(rawHeaders: string[], diagnostics: DelimitedTextDiagnostic[]): string[] {
  const seen = new Map<string, number>()
  return rawHeaders.map((value, index) => {
    const withoutBom = index === 0 ? String(value || '').replace(/^\uFEFF/, '') : String(value || '')
    const trimmed = withoutBom.trim()
    const base = trimmed || `field_${index + 1}`
    if (!trimmed) {
      diagnostics.push({
        severity: 'warning',
        code: 'empty-header',
        message: `Header ${index + 1} is empty; ${base} was assigned.`,
        row: 1,
        column: index + 1,
      })
    }
    const count = seen.get(base) || 0
    seen.set(base, count + 1)
    if (count === 0) return base
    const renamed = `${base}_${count + 1}`
    diagnostics.push({
      severity: 'warning',
      code: 'duplicate-header',
      message: `Header ${base} is duplicated; ${renamed} was assigned.`,
      row: 1,
      column: index + 1,
    })
    return renamed
  })
}

function finalizeParse(args: {
  state: ScannerState
  delimiter: string
  diagnostics: DelimitedTextDiagnostic[]
  header: boolean
  trimEmptyTrailingRows: boolean
  textLength: number
}): DelimitedTextParseResult {
  const state = args.state
  const diagnostics = [...args.diagnostics]
  if (state.inQuotes) {
    diagnostics.push({
      severity: 'error',
      code: 'unclosed-quote',
      message: 'Quoted field was not closed before end of input.',
      characterStart: state.quoteStart >= 0 ? state.quoteStart : undefined,
      characterEnd: args.textLength,
    })
  }
  pushRow(state)
  let rows = state.rows
  if (args.trimEmptyTrailingRows) {
    while (rows.length > 0) {
      const last = rows[rows.length - 1]
      if (!last || last.length !== 1 || String(last[0] || '') !== '') break
      rows = rows.slice(0, -1)
    }
  }

  let headers: string[] | undefined
  if (args.header && rows.length > 0) {
    headers = normalizeHeaders(rows[0], diagnostics)
    rows = rows.slice(1)
    for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
      const row = rows[rowIndex]
      if (row.length === headers.length) continue
      diagnostics.push({
        severity: 'warning',
        code: 'field-count-mismatch',
        message: `Row ${rowIndex + 2} has ${row.length} fields; expected ${headers.length}.`,
        row: rowIndex + 2,
      })
    }
  }

  const fieldCount = headers?.length || rows.reduce((max, row) => Math.max(max, row.length), 0)
  return {
    rows,
    ...(headers ? { headers } : {}),
    diagnostics,
    metadata: {
      delimiter: args.delimiter,
      newline: resolveNewline(state),
      rowCount: rows.length,
      ...(fieldCount > 0 ? { fieldCount } : {}),
      parserOwner: AGENTICGRAPH_DELIMITED_TEXT_PARSER_OWNER,
      parserVersion: AGENTICGRAPH_DELIMITED_TEXT_PARSER_VERSION,
      aborted: state.aborted,
    },
  }
}

export function parseDelimitedText(textRaw: string, options: DelimitedTextParseOptions = {}): DelimitedTextParseResult {
  const text = String(textRaw || '')
  const delimiterResolution = resolveDelimiter(text, options)
  const diagnostics = [...delimiterResolution.diagnostics]
  if (options.maxBytes !== undefined && text.length > Math.max(0, options.maxBytes)) {
    diagnostics.push({
      severity: 'error',
      code: 'max-bytes-exceeded',
      message: `Input length ${text.length} exceeds maxBytes ${options.maxBytes}.`,
    })
  }
  const state = createScanner()
  feedScanner({
    state,
    text,
    absoluteOffset: 0,
    delimiter: delimiterResolution.delimiter,
    quote: options.quote || DEFAULT_QUOTE,
    escape: options.escape || DEFAULT_ESCAPE,
  })
  return finalizeParse({
    state,
    delimiter: delimiterResolution.delimiter,
    diagnostics,
    header: options.header === true,
    trimEmptyTrailingRows: options.trimEmptyTrailingRows !== false,
    textLength: text.length,
  })
}

export async function parseDelimitedTextAsync(textRaw: string, options: DelimitedTextParseOptions = {}): Promise<DelimitedTextParseResult> {
  const text = String(textRaw || '')
  const delimiterResolution = resolveDelimiter(text, options)
  const diagnostics = [...delimiterResolution.diagnostics]
  if (options.maxBytes !== undefined && text.length > Math.max(0, options.maxBytes)) {
    diagnostics.push({
      severity: 'error',
      code: 'max-bytes-exceeded',
      message: `Input length ${text.length} exceeds maxBytes ${options.maxBytes}.`,
    })
  }
  const state = createScanner()
  const chunkSize = Math.max(1, Math.floor(options.chunkSizeChars || 64 * 1024))
  for (let offset = 0; offset < text.length; offset += chunkSize) {
    if (options.signal?.aborted) {
      state.aborted = true
      break
    }
    feedScanner({
      state,
      text: text.slice(offset, offset + chunkSize),
      absoluteOffset: offset,
      delimiter: delimiterResolution.delimiter,
      quote: options.quote || DEFAULT_QUOTE,
      escape: options.escape || DEFAULT_ESCAPE,
    })
    options.onProgress?.({
      charsCurrent: Math.min(text.length, offset + chunkSize),
      charsTotal: text.length,
      rowCount: state.rows.length,
      aborted: state.aborted,
    })
    if (text.length > chunkSize) await new Promise<void>(resolve => setTimeout(resolve, 0))
  }
  return finalizeParse({
    state,
    delimiter: delimiterResolution.delimiter,
    diagnostics,
    header: options.header === true,
    trimEmptyTrailingRows: options.trimEmptyTrailingRows !== false,
    textLength: text.length,
  })
}

function stringifyCell(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : ''
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

function escapeFormulaCell(value: string): string {
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value
}

function encodeCell(valueRaw: unknown, options: Required<Pick<DelimitedTextGenerateOptions, 'delimiter' | 'quote' | 'escape' | 'newline' | 'escapeFormulaCells'>>): string {
  let value = stringifyCell(valueRaw)
  if (options.escapeFormulaCells) value = escapeFormulaCell(value)
  const mustQuote =
    value.includes(options.delimiter)
    || value.includes(options.quote)
    || value.includes('\n')
    || value.includes('\r')
  const escaped = value.split(options.quote).join(`${options.escape}${options.quote}`)
  return mustQuote ? `${options.quote}${escaped}${options.quote}` : escaped
}

export function generateDelimitedText(rows: unknown[][], options: DelimitedTextGenerateOptions = {}): string {
  const delimiter = normalizeDelimiterCandidate(options.delimiter) || ','
  const quote = options.quote || DEFAULT_QUOTE
  const escape = options.escape || quote
  const newline = options.newline || '\r\n'
  const escapeFormulaCells = options.escapeFormulaCells !== false
  const generateOptions = { delimiter, quote, escape, newline, escapeFormulaCells }
  const bodyRows = Array.isArray(rows) ? rows : []
  const fields = Array.isArray(options.fields) ? options.fields.map(field => String(field ?? '')) : []
  const allRows = fields.length > 0 ? [fields, ...bodyRows] : bodyRows
  return allRows
    .map(row => (Array.isArray(row) ? row : []).map(cell => encodeCell(cell, generateOptions)).join(delimiter))
    .join(newline)
}

export function rowsToRecords(rows: string[][], headers: string[] | undefined): Array<Record<string, string>> {
  if (!headers || headers.length === 0) return rows.map(row => Object.fromEntries(row.map((value, index) => [`field_${index + 1}`, value])))
  return rows.map(row => {
    const record: Record<string, string> = {}
    const fieldCount = Math.max(headers.length, row.length)
    for (let index = 0; index < fieldCount; index += 1) {
      const key = headers[index] || `field_${index + 1}`
      record[key] = row[index] ?? ''
    }
    return record
  })
}
