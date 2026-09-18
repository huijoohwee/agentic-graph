import { unwrapKeyTypeValue } from '@/lib/graph/keyTypeValue'
import { containsMarkdownPipeTable, serializeMarkdownPipeTable } from '@/features/markdown/ui/markdownDataViewSerialize'
import { isRecord, mergeStructuredProperties, readFieldValue, readFirstString } from './chatResponseStructuredRecord'

const tableCellText = (value: unknown): string => {
  const scalar = unwrapKeyTypeValue(value)
  if (typeof scalar === 'string' || typeof scalar === 'number' || typeof scalar === 'boolean') return String(scalar)
  if (scalar == null) return ''
  try { return JSON.stringify(scalar) } catch { return '' }
}

const readTableColumn = (value: unknown, index: number): { key: string; label: string } => {
  if (!isRecord(value)) { const text = tableCellText(value).trim() || `Column ${index + 1}`; return { key: text, label: text } }
  return {
    key: readFirstString(value, ['key', 'id', 'field', 'name', 'label', 'title']) || `column_${index + 1}`,
    label: readFirstString(value, ['label', 'title', 'name', 'key', 'id', 'field']) || `Column ${index + 1}`,
  }
}

const readFirstArray = (record: Record<string, unknown>, keys: readonly string[]): unknown[] => {
  for (const key of keys) { const raw = readFieldValue(record, key); if (Array.isArray(raw)) return raw }
  return []
}

export const readStructuredTableMarkdown = (record: Record<string, unknown>, role: string): string => {
  const existingOutput = readFirstString(record, ['output', 'result', 'response', 'text', 'content', 'markdown'])
  if (containsMarkdownPipeTable(existingOutput)) return existingOutput
  const explicitKind = readFirstString(record, ['kind', 'type', 'mediaKind', 'media_kind']).toLowerCase()
  if (role !== 'table' && !['table', 'markdown-table', 'multi-dimensional-table'].includes(explicitKind)) return ''
  const nestedTable = readFieldValue(record, 'table')
  const source = isRecord(nestedTable) ? mergeStructuredProperties(nestedTable) : record
  let rawColumns = readFirstArray(source, ['columns', 'headers', 'header'])
  const rawRows = readFirstArray(source, ['rows', 'data', 'items', 'records'])
  if (rawColumns.length === 0) { const firstRecordRow = rawRows.find(isRecord); if (firstRecordRow) rawColumns = Object.keys(firstRecordRow).filter(key => key !== 'cells') }
  if (rawColumns.length === 0) return ''
  const columns = rawColumns.map(readTableColumn)
  const rows = rawRows.map(row => {
    if (Array.isArray(row)) return columns.map((_, index) => tableCellText(row[index]))
    if (!isRecord(row)) return columns.map((_, index) => index === 0 ? tableCellText(row) : '')
    const cellsValue = readFieldValue(row, 'cells')
    const cells = Array.isArray(cellsValue) ? cellsValue : null
    return cells ? columns.map((_, index) => tableCellText(cells[index])) : columns.map(column => tableCellText(readFieldValue(row, column.key)))
  })
  return serializeMarkdownPipeTable({ columns: columns.map(column => column.label), rows }).join('\n')
}
