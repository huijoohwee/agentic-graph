import { isKeyTypeValue as isPropertyEnvelope } from '@/lib/graph/keyTypeValue'
import { FLOW_RICH_MEDIA_PANEL_NODE_TYPE_ID } from '@/lib/config'
import { unwrapGraphCellValue } from '@/lib/graph/nodeProperties'
import {
  containsMarkdownPipeTable,
  serializeMarkdownPipeTable,
} from '@/features/markdown/ui/markdownDataViewSerialize'

export const GENERATED_MARKDOWN_PIPE_TABLE_FORMAT = 'markdown-pipe-table'
export const GENERATED_MARKDOWN_PIPE_TABLE_MIME_TYPE = 'text/markdown; charset=utf-8'

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value)

const readScalar = (value: unknown): unknown => unwrapGraphCellValue(value)

const readString = (value: unknown): string => {
  const scalar = readScalar(value)
  return typeof scalar === 'string' ? scalar.trim() : ''
}

const withScalarValue = (current: unknown, value: unknown): unknown =>
  isPropertyEnvelope(current) ? { ...current, value } : value

const decodeHtmlEntitiesBasic = (value: string): string => String(value || '')
  .replace(/&nbsp;/gi, ' ')
  .replace(/&amp;/gi, '&')
  .replace(/&lt;/gi, '<')
  .replace(/&gt;/gi, '>')
  .replace(/&quot;/gi, '"')
  .replace(/&apos;|&#39;/gi, "'")
  .replace(/&#(\d+);/g, (_match, code: string) => {
    const value = Number.parseInt(code, 10)
    return Number.isFinite(value) ? String.fromCodePoint(value) : ''
  })
  .replace(/&#x([0-9a-f]+);/gi, (_match, code: string) => {
    const value = Number.parseInt(code, 16)
    return Number.isFinite(value) ? String.fromCodePoint(value) : ''
  })

const readHtmlAttribute = (tag: string, attribute: string): string => {
  const escaped = attribute.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = new RegExp(`\\b${escaped}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i').exec(tag)
  return decodeHtmlEntitiesBasic(String(match?.[1] || match?.[2] || match?.[3] || '')).trim()
}

const htmlCellToMarkdown = (value: string): string => {
  let next = String(value || '')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<\s*(script|style)\b[\s\S]*?<\/\s*\1\s*>/gi, ' ')
  next = next.replace(/<img\b[^>]*>/gi, tag => {
    const src = readHtmlAttribute(tag, 'src')
    const alt = readHtmlAttribute(tag, 'alt') || 'Image'
    return src ? `![${alt.replace(/\]/g, '\\]')}](${src.replace(/\)/g, '%29')})` : alt
  })
  next = next.replace(/<a\b[^>]*>[\s\S]*?<\/a\s*>/gi, tag => {
    const href = readHtmlAttribute(tag, 'href')
    const label = decodeHtmlEntitiesBasic(tag.replace(/^<a\b[^>]*>|<\/a\s*>$/gi, '').replace(/<[^>]+>/g, ' '))
      .replace(/\s+/g, ' ')
      .trim()
    return href ? `[${label || href}](${href.replace(/\)/g, '%29')})` : label
  })
  next = next
    .replace(/<\s*br\s*\/?>/gi, ' ')
    .replace(/<\/?(?:strong|b)\b[^>]*>/gi, '**')
    .replace(/<\/?(?:em|i)\b[^>]*>/gi, '*')
    .replace(/<[^>]+>/g, ' ')
  return decodeHtmlEntitiesBasic(next).replace(/\s+/g, ' ').trim()
}

export function isHtmlTableSrcDoc(value: unknown): boolean {
  return /<table\b/i.test(readString(value))
}

export function convertHtmlTableSrcDocToMarkdown(value: unknown): string {
  const srcDoc = readString(value)
  const tableHtml = srcDoc.match(/<table\b[\s\S]*?<\/table\s*>/i)?.[0] || ''
  if (!tableHtml) return ''
  const parsedRows: Array<{ cells: string[]; hasHeader: boolean }> = []
  const rowRe = /<tr\b[^>]*>([\s\S]*?)<\/tr\s*>/gi
  let rowMatch: RegExpExecArray | null
  while ((rowMatch = rowRe.exec(tableHtml))) {
    const cells: string[] = []
    let hasHeader = false
    const cellRe = /<(th|td)\b[^>]*>([\s\S]*?)<\/\1\s*>/gi
    let cellMatch: RegExpExecArray | null
    while ((cellMatch = cellRe.exec(String(rowMatch[1] || '')))) {
      if (String(cellMatch[1] || '').toLowerCase() === 'th') hasHeader = true
      cells.push(htmlCellToMarkdown(String(cellMatch[2] || '')))
    }
    if (cells.length > 0) parsedRows.push({ cells, hasHeader })
  }
  if (parsedRows.length < 1) return ''
  const columnCount = parsedRows.reduce((max, row) => Math.max(max, row.cells.length), 0)
  if (columnCount < 1) return ''
  const headerIndex = parsedRows.findIndex(row => row.hasHeader)
  const headerRow = headerIndex === 0 ? parsedRows[0]?.cells || [] : []
  const columns = Array.from({ length: columnCount }, (_, index) => headerRow[index] || `Column ${index + 1}`)
  const body = (headerIndex === 0 ? parsedRows.slice(1) : parsedRows)
    .map(row => Array.from({ length: columnCount }, (_, index) => row.cells[index] || ''))
  return serializeMarkdownPipeTable({ columns, rows: body }).join('\n')
}

const normalizePortTypes = (raw: unknown): unknown => {
  const scalar = readScalar(raw)
  if (!isRecord(scalar)) return raw
  let changed = false
  const next: Record<string, unknown> = { ...scalar }
  for (const direction of ['in', 'out'] as const) {
    const ports = isRecord(scalar[direction]) ? scalar[direction] as Record<string, unknown> : null
    if (!ports || !Object.prototype.hasOwnProperty.call(ports, 'outputSrcDoc')) continue
    next[direction] = {
      ...ports,
      output: ports.output ?? 'markdown_table',
    }
    delete (next[direction] as Record<string, unknown>).outputSrcDoc
    changed = true
  }
  return changed ? withScalarValue(raw, next) : raw
}

const normalizeWidgetFields = (raw: unknown): unknown => {
  const scalar = readScalar(raw)
  if (!Array.isArray(scalar)) return raw
  let changed = false
  const next = scalar.map(item => {
    if (!isRecord(item)) return item
    const fieldKey = readString(item.fieldKey)
    const schemaPath = readString(item.schemaPath)
    if (fieldKey !== 'outputSrcDoc' && schemaPath !== 'properties.outputSrcDoc') return item
    changed = true
    return {
      ...item,
      fieldKey: 'output',
      fieldType: 'textarea',
      schemaPath: 'properties.output',
    }
  })
  return changed ? withScalarValue(raw, next) : raw
}

export function normalizeGeneratedRichMediaTableProperties<T extends Record<string, unknown>>(args: {
  nodeType: unknown
  nodeLabel?: unknown
  properties: T
}): T {
  if (readString(args.nodeType) !== FLOW_RICH_MEDIA_PANEL_NODE_TYPE_ID) return args.properties
  const properties = args.properties
  const output = readString(properties.output)
  const outputHasPipeTable = containsMarkdownPipeTable(output)
  const storedSrcDocKeys = (['outputSrcDoc', 'srcDoc'] as const)
    .filter(key => Object.prototype.hasOwnProperty.call(properties, key))
  const tableHtmlKeys = (['outputSrcDoc', 'srcDoc'] as const)
    .filter(key => isHtmlTableSrcDoc(properties[key]))
  const explicitTableFormat = readString(properties.tableFormat) === GENERATED_MARKDOWN_PIPE_TABLE_FORMAT
    || readString(properties.videoAgentKind) === 'multi-dimensional-table'
    || /(?:^|[-_])table(?:$|[-_])/.test(readString(properties.kind))
  if (tableHtmlKeys.length === 0 && !outputHasPipeTable) return properties

  const convertedTable = outputHasPipeTable
    ? ''
    : tableHtmlKeys.map(key => convertHtmlTableSrcDocToMarkdown(properties[key])).find(containsMarkdownPipeTable) || ''
  const markdownTable = outputHasPipeTable ? output : convertedTable
  if (!containsMarkdownPipeTable(markdownTable)) return properties

  const next: Record<string, unknown> = { ...properties }
  if (!outputHasPipeTable) {
    const label = readString(args.nodeLabel)
    const titledOutput = label ? `## ${label}\n\n${markdownTable}` : markdownTable
    next.output = withScalarValue(properties.output, titledOutput)
  }
  for (const key of storedSrcDocKeys) delete next[key]
  next.outputMimeType = withScalarValue(properties.outputMimeType, GENERATED_MARKDOWN_PIPE_TABLE_MIME_TYPE)
  next.tableFormat = withScalarValue(properties.tableFormat, GENERATED_MARKDOWN_PIPE_TABLE_FORMAT)
  next.richMediaActiveTab = withScalarValue(properties.richMediaActiveTab, 'text')
  next.media_interactive = withScalarValue(properties.media_interactive, false)
  if (outputHasPipeTable || explicitTableFormat || tableHtmlKeys.length > 0) {
    next.kind = withScalarValue(properties.kind, 'markdown-table')
  }
  if (Object.prototype.hasOwnProperty.call(properties, 'flow:portTypes')) {
    next['flow:portTypes'] = normalizePortTypes(properties['flow:portTypes'])
  }
  if (Object.prototype.hasOwnProperty.call(properties, 'frontmatter:widgetFields')) {
    next['frontmatter:widgetFields'] = normalizeWidgetFields(properties['frontmatter:widgetFields'])
  }
  return next as T
}
