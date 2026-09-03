import { buildMarkdownDataViewFromTableToken } from '@/features/markdown/ui/markdownDataViewModel'
import { serializeMarkdownDataViewToTableLines } from '@/features/markdown/ui/markdownDataViewSerialize'
import type { TokensTable } from '@/features/markdown/ui/MarkdownTokens'

const PIPE_TABLE_LINE_RE = /^\s*\|.*\|\s*$/
const PIPE_TABLE_SEPARATOR_RE = /^\s*\|\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/
export type YamlMetadataTableProjection = {
  lines: string[]
  sourceLineByRowIndex: number[]
}

const splitSourceLines = (text: string): string[] => String(text || '').replace(/\r\n/g, '\n').split('\n')

const readLineIndent = (line: string): number => {
  const match = String(line || '').match(/^ */)
  return match ? match[0].length : 0
}

const stripLineIndent = (line: string): string => String(line || '').replace(/^ +/, '')

const joinPath = (parts: readonly string[]): string => parts.filter(Boolean).join('.')

const parseIndentCell = (value: string): number => {
  const numeric = Number.parseInt(String(value || '').trim(), 10)
  if (!Number.isFinite(numeric) || numeric < 0) return 0
  return Math.min(240, numeric)
}

export const yamlQuote = (value: string): string => `"${String(value || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`

const yamlKey = (value: string): string => (/^[A-Za-z_][A-Za-z0-9_.-]*$/.test(String(value || '')) ? String(value || '') : yamlQuote(value))

export const readYamlScalarText = (value: string): string => {
  const trimmed = String(value || '').trim()
  if (!trimmed) return ''
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    const inner = trimmed.slice(1, -1)
    return trimmed.startsWith('"')
      ? inner.replace(/\\"/g, '"').replace(/\\\\/g, '\\')
      : inner.replace(/''/g, "'")
  }
  return trimmed
}

const splitInlineMapEntries = (value: string): string[] => {
  const trimmed = String(value || '').trim()
  if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) return []
  const inner = trimmed.slice(1, -1)
  const entries: string[] = []
  let current = ''
  let quote = ''
  let depth = 0
  for (let index = 0; index < inner.length; index += 1) {
    const char = inner[index] || ''
    const previous = inner[index - 1] || ''
    if (quote) {
      current += char
      if (char === quote && previous !== '\\') quote = ''
      continue
    }
    if (char === '"' || char === "'") {
      quote = char
      current += char
      continue
    }
    if (char === '{' || char === '[') {
      depth += 1
      current += char
      continue
    }
    if (char === '}' || char === ']') {
      depth = Math.max(0, depth - 1)
      current += char
      continue
    }
    if (char === ',' && depth === 0) {
      if (current.trim()) entries.push(current.trim())
      current = ''
      continue
    }
    current += char
  }
  if (current.trim()) entries.push(current.trim())
  return entries
}

const splitInlineMapEntry = (entry: string): { key: string; value: string } | null => {
  const text = String(entry || '')
  let quote = ''
  let depth = 0
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index] || ''
    const previous = text[index - 1] || ''
    if (quote) {
      if (char === quote && previous !== '\\') quote = ''
      continue
    }
    if (char === '"' || char === "'") {
      quote = char
      continue
    }
    if (char === '{' || char === '[') {
      depth += 1
      continue
    }
    if (char === '}' || char === ']') {
      depth = Math.max(0, depth - 1)
      continue
    }
    if (char === ':' && depth === 0) {
      return {
        key: readYamlScalarText(text.slice(0, index).trim()),
        value: text.slice(index + 1).trim(),
      }
    }
  }
  return null
}

const readTypedInlineValue = (value: string): { key: string; type: string; value: string; rawValue: string } | null => {
  const fields: Record<string, string> = {}
  for (const entry of splitInlineMapEntries(value)) {
    const parsed = splitInlineMapEntry(entry)
    if (parsed?.key) fields[parsed.key] = parsed.value
  }
  if (!fields.key || !fields.type || !Object.prototype.hasOwnProperty.call(fields, 'value')) return null
  const rawValue = fields.value || ''
  return {
    key: readYamlScalarText(fields.key),
    type: readYamlScalarText(fields.type),
    value: readYamlScalarText(rawValue),
    rawValue,
  }
}

const formatTypedInlineValue = (value: string, type: string, originalRawValue = ''): string => {
  const next = String(value || '')
  const trimmed = next.trim()
  if (trimmed.startsWith('{') || trimmed.startsWith('[') || trimmed === 'true' || trimmed === 'false' || trimmed === 'null' || /^-?\d+(?:\.\d+)?$/.test(trimmed)) return trimmed
  const originalTrimmed = String(originalRawValue || '').trim()
  if ((originalTrimmed.startsWith('{') || originalTrimmed.startsWith('[')) && trimmed === originalTrimmed) return trimmed
  if (type === 'number' || type === 'boolean' || type === 'object' || type === 'array') return trimmed || (type === 'array' ? '[]' : type === 'object' ? '{}' : trimmed)
  return yamlQuote(next)
}

const isYamlBlockScalarMarker = (value: string): boolean => /^[|>][+-]?$/.test(String(value || '').trim())

export const readYamlKeyValue = (line: string): { key: string; value: string; indent: number } | null => {
  const raw = String(line || '')
  const match = raw.match(/^(\s*)(?:"([^"]+)"|([A-Za-z_][A-Za-z0-9_.:-]*))\s*:\s*(.*)$/)
  if (!match) return null
  return {
    indent: match[1]?.length || 0,
    key: match[2] || match[3] || '',
    value: readYamlScalarText(match[4] || ''),
  }
}

const readYamlListValue = (line: string): { key: string; value: string; indent: number; kind: 'map' | 'scalar' } | null => {
  const match = String(line || '').match(/^(\s*)-\s+(.*)$/)
  if (!match) return null
  const indent = match[1]?.length || 0
  const content = String(match[2] || '')
  const mapMatch = content.match(/^(?:"([^"]+)"|([A-Za-z_][A-Za-z0-9_.:-]*))\s*:\s*(.*)$/)
  if (mapMatch) {
    return {
      indent,
      key: mapMatch[1] || mapMatch[2] || '',
      value: readYamlScalarText(mapMatch[3] || ''),
      kind: 'map',
    }
  }
  return { indent, key: '', value: readYamlScalarText(content), kind: 'scalar' }
}

const readYamlSourceKey = (line: string): string => {
  const trimmed = stripLineIndent(line).trim()
  const match = trimmed.match(/^(?:"([^"]+)"|([A-Za-z_][A-Za-z0-9_.:-]*))\s*:/)
  return match ? (match[1] || match[2] || '') : ''
}

const splitSemanticValue = (value: string): { key: string; value: string } => {
  const text = String(value || '').trim()
  const index = text.indexOf(':')
  if (index < 1) return { key: '', value: text }
  return {
    key: text.slice(0, index).trim(),
    value: text.slice(index + 1).trim(),
  }
}

const buildSerializedTableMarkdownLines = (args: {
  heading: string
  header: readonly string[]
  rows: readonly (readonly string[])[]
}): string[] => {
  const header = Array.from(args.header || []).map(text => ({ text }))
  const rows = Array.from(args.rows || []).map(row => Array.from({ length: header.length }).map((_, index) => ({ text: String(row[index] ?? '') })))
  if (header.length < 1 || rows.length < 1) return []
  const table: TokensTable = { type: 'table', raw: '', header, rows }
  const view = buildMarkdownDataViewFromTableToken(table)
  const lines = view ? serializeMarkdownDataViewToTableLines(view) : []
  return lines.length > 0 ? [`## ${args.heading}`, '', ...lines] : []
}

type YamlMetadataRow = {
  levels: string[]
  key: string
  type: string
  value: string
  summary: string
  output: string
  action: string
  referencePack: string
  sourceValue: string
  content: string
  level: number
  line: number
  indent: number
}

const normalizeSemanticKey = (value: string): string => String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')

const readYamlTypeValueColumnName = (type: string): string => {
  const normalized = normalizeSemanticKey(type)
  if (!normalized || normalized === 'blank' || normalized === 'map') return ''
  const label = normalized.split('_').filter(Boolean).map(part => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`).join(' ')
  return label ? `${label} Value` : ''
}

const readYamlRowSemanticColumns = (args: {
  key: string
  levels: readonly string[]
  value: string
  sourceValue: string
}): Pick<YamlMetadataRow, 'summary' | 'output' | 'action' | 'referencePack'> => {
  const keys = [args.key, ...args.levels].map(normalizeSemanticKey).filter(Boolean)
  const value = String(args.value || '')
  const sourceValue = String(args.sourceValue || '')
  const referenceValue = sourceValue || value
  const summaryKeys = new Set(['summary', 'reading_summary', 'agenticOs_readingsummary', 'agenticOs_reading_summary'])
  const actionKeys = new Set(['action', 'actions', 'next_action', 'required_action'])
  const outputKeys = new Set([
    'output',
    'outputs',
    'output_src_doc',
    'outputsrcdoc',
    'output_policy',
    'download_url',
    'stream_url',
    'videodb_stream_url',
    'video_url',
    'image_url',
    'publish_packet_path',
  ])
  const referenceKeys = new Set([
    'reference',
    'references',
    'reference_pack',
    'source',
    'source_url',
    'sourceunitid',
    'source_unit_id',
    'workspace_path',
    'relative_path',
    'media_url',
    'webpage_url',
    'kgwebpageurl',
    'implementation_contract',
    'mcp_docs_url',
    'upstream_reference',
    'api_base_url',
    'base_url',
  ])
  return {
    summary: keys.some(key => summaryKeys.has(key)) ? value : '',
    output: keys.some(key => outputKeys.has(key)) ? value : '',
    action: keys.some(key => actionKeys.has(key)) ? value : '',
    referencePack: keys.some(key => referenceKeys.has(key)) ? referenceValue : '',
  }
}

export const buildYamlMetadataTableMarkdown = (args: {
  text: string
  startLine: number
}): YamlMetadataTableProjection => {
  const sourceLines = splitSourceLines(args.text)
  const stack: { indent: number; key: string; path: string }[] = []
  const typeByPath = new Map<string, string>()
  const blockScalarValuePaths = new Set<string>()
  const rowModels: YamlMetadataRow[] = sourceLines.map((line, index) => {
    const parsed = readYamlKeyValue(line)
    const listValue = readYamlListValue(line)
    const indent = readLineIndent(line)
    while (stack.length > 0 && stack[stack.length - 1]!.indent >= indent) stack.pop()
    const parentPath = stack[stack.length - 1]?.path || ''
    const level = Math.max(0, stack.length)
    const parentLevels = parentPath ? parentPath.split('.') : []
    const blockValuePath = parentPath && blockScalarValuePaths.has(parentPath) ? parentPath : ''
    if (blockValuePath) {
      const blockValueType = typeByPath.get(blockValuePath.split('.').slice(0, -1).join('.')) || ''
      const blockValue = stripLineIndent(line)
      return {
        levels: parentLevels,
        key: 'value',
        type: blockValueType || 'blank',
        value: blockValue,
        summary: '',
        output: '',
        action: '',
        referencePack: '',
        sourceValue: blockValue,
        content: blockValue,
        level,
        line: args.startLine + index,
        indent,
      }
    }
    if (parsed) {
      const typed = readTypedInlineValue(parsed.value)
      const rowKey = typed?.key || parsed.key
      const path = joinPath(parentPath ? [parentPath, parsed.key] : [parsed.key])
      const levels = [...parentLevels, rowKey]
      const value = typed?.value ?? parsed.value ?? ''
      const sourceValue = parsed.value || ''
      if (parsed.key === 'type' && parentPath && value) typeByPath.set(parentPath, value)
      if (parsed.key === 'value' && isYamlBlockScalarMarker(parsed.value)) blockScalarValuePaths.add(path)
      stack.push({ indent, key: parsed.key, path })
      const inheritedValueType = parsed.key === 'value' && parentPath ? typeByPath.get(parentPath) : ''
      return {
        levels,
        key: rowKey,
        type: typed?.type || inheritedValueType || (parsed.value ? 'scalar' : 'map'),
        value,
        ...readYamlRowSemanticColumns({ key: rowKey, levels, value, sourceValue }),
        sourceValue,
        content: stripLineIndent(line),
        level,
        line: args.startLine + index,
        indent,
      }
    }
    if (listValue) {
      const typed = readTypedInlineValue(listValue.value)
      const semantic = splitSemanticValue(listValue.value)
      const key = typed?.key || listValue.key || semantic.key || stack[stack.length - 1]?.key || ''
      const levels = key && parentLevels[parentLevels.length - 1] !== key
        ? [...parentLevels, key]
        : parentLevels
      if (listValue.kind === 'map' && key) {
        const path = joinPath(parentPath ? [parentPath, key] : [key])
        stack.push({ indent, key, path })
      }
      const value = typed?.value ?? (listValue.kind === 'map' ? listValue.value : semantic.value)
      const sourceValue = listValue.value
      return {
        levels: levels.filter(Boolean),
        key,
        type: typed?.type || 'list',
        value,
        ...readYamlRowSemanticColumns({ key, levels, value, sourceValue }),
        sourceValue,
        content: stripLineIndent(line),
        level,
        line: args.startLine + index,
        indent,
      }
    }
    return {
      levels: parentLevels,
      key: '',
      type: 'blank',
      value: '',
      summary: '',
      output: '',
      action: '',
      referencePack: '',
      sourceValue: '',
      content: stripLineIndent(line),
      level,
      line: args.startLine + index,
      indent,
    }
  })
  const maxLevel = Math.max(0, ...rowModels.map(row => Math.max(0, row.levels.length - 1)))
  const levelColumns = Array.from({ length: maxLevel + 1 }).map((_, index) => `L${index}`)
  const typeValueColumns = Array.from(new Set(rowModels.map(row => (row.value ? readYamlTypeValueColumnName(row.type) : '')).filter(Boolean)))
  const rows = rowModels.map(row => [
    ...Array.from({ length: levelColumns.length }).map((_, index) => row.levels[index] || ''),
    row.key,
    row.type,
    row.value,
    ...typeValueColumns.map(column => column === readYamlTypeValueColumnName(row.type) ? row.value : ''),
    row.summary,
    row.output,
    row.action,
    row.referencePack,
    row.sourceValue,
    `L${row.level}`,
    row.content,
    String(row.line),
    String(row.indent),
  ])
  return {
    lines: buildSerializedTableMarkdownLines({ heading: 'Markdown YAML Frontmatter', header: [...levelColumns, 'Key', 'Type', 'Value', ...typeValueColumns, 'Summary', 'Output', 'Action', 'Reference Pack', 'Source Value', 'Level', 'Content', 'Line', 'Indent'], rows }),
    sourceLineByRowIndex: sourceLines.map((_, index) => args.startLine + index),
  }
}

const parsePipeCells = (line: string): string[] => {
  const trimmed = String(line || '').trim()
  const withoutLeading = trimmed.startsWith('|') ? trimmed.slice(1) : trimmed
  const cells: string[] = []
  let current = ''
  for (let i = 0; i < withoutLeading.length; i += 1) {
    const char = withoutLeading[i]
    if (char === '\\' && withoutLeading[i + 1] === '|') {
      current += '|'
      i += 1
      continue
    }
    if (char === '|' && i === withoutLeading.length - 1) {
      cells.push(current.trim())
      current = ''
      continue
    }
    if (char === '|') {
      cells.push(current.trim())
      current = ''
      continue
    }
    current += char
  }
  if (current.length > 0 || !trimmed.endsWith('|')) cells.push(current.trim())
  return cells
}

const parseMarkdownTable = (lines: readonly string[]): { header: string[]; rows: string[][] } | null => {
  const bodyLines = Array.from(lines || []).filter(line => PIPE_TABLE_LINE_RE.test(String(line || '')))
  if (bodyLines.length < 2) return null
  const header = parsePipeCells(String(bodyLines[0] || ''))
  const hasSeparator = PIPE_TABLE_SEPARATOR_RE.test(String(bodyLines[1] || ''))
  const rows = bodyLines.slice(hasSeparator ? 2 : 1).map(parsePipeCells)
  return header.length > 0 && rows.length > 0 ? { header, rows } : null
}

export const applyYamlMetadataTableReplacement = (args: {
  sourceText: string
  sourceLineByRowIndex?: readonly number[]
  replacementLines: readonly string[]
}): string | null => {
  const sourceLines = String(args.sourceText || '').replace(/\r\n/g, '\n').split('\n')
  const table = parseMarkdownTable(args.replacementLines)
  const rows = table?.rows || []
  const keyIndex = table?.header.indexOf('Key') ?? -1
  const typeIndex = table?.header.indexOf('Type') ?? -1
  const valueIndex = table?.header.indexOf('Value') ?? -1
  const contentIndex = table?.header.indexOf('Content') ?? -1
  const lineIndex = table?.header.indexOf('Line') ?? -1
  const indentIndex = table?.header.indexOf('Indent') ?? -1
  const hasAnyTypeValueColumn = table?.header.some(name => name !== 'Source Value' && name !== 'Value' && /^.+ Value$/.test(name)) ?? false
  if (rows.length < 1 || keyIndex < 0 || typeIndex < 0 || (valueIndex < 0 && !hasAnyTypeValueColumn) || contentIndex < 0 || lineIndex < 0 || indentIndex < 0) return null
  rows.forEach((row, rowIndex) => {
    const parsedLine = Number.parseInt(String(row[lineIndex] || '').trim(), 10)
    const sourceLine = Number.isFinite(parsedLine) ? parsedLine : args.sourceLineByRowIndex?.[rowIndex]
    if (!sourceLine || sourceLine < 1 || sourceLine > sourceLines.length) return
    const indent = parseIndentCell(row[indentIndex] || '')
    const originalLine = sourceLines[sourceLine - 1] || ''
    const originalParsed = readYamlKeyValue(originalLine)
    const originalListValue = readYamlListValue(originalLine)
    const nextKey = String(row[keyIndex] || '').trim()
    const nextType = String(row[typeIndex] || '').trim()
    const typeValueIndex = table?.header.indexOf(readYamlTypeValueColumnName(nextType)) ?? -1
    const nextValue = String(typeValueIndex >= 0 ? row[typeValueIndex] : valueIndex >= 0 ? row[valueIndex] : '')
    if (originalParsed && originalParsed.value && nextKey) {
      const sourceKey = readYamlSourceKey(originalLine) || nextKey
      const typed = readTypedInlineValue(originalParsed.value)
      if (typed) {
        const value = formatTypedInlineValue(nextValue, nextType || typed.type, typed.rawValue)
        sourceLines[sourceLine - 1] = `${' '.repeat(indent)}${yamlKey(sourceKey)}: {key: ${yamlKey(nextKey || typed.key)}, type: ${nextType || typed.type}, value: ${value}}`
        return
      }
      sourceLines[sourceLine - 1] = `${' '.repeat(indent)}${sourceKey}: ${yamlQuote(nextValue)}`
      return
    }
    if (originalListValue) {
      if (originalListValue.kind === 'map') {
        const sourceKey = originalListValue.key || nextKey
        const typed = readTypedInlineValue(originalListValue.value)
        if (typed) {
          const value = formatTypedInlineValue(nextValue, nextType || typed.type, typed.rawValue)
          sourceLines[sourceLine - 1] = `${' '.repeat(indent)}- ${yamlKey(sourceKey)}: {key: ${yamlKey(nextKey || typed.key)}, type: ${nextType || typed.type}, value: ${value}}`
          return
        }
        sourceLines[sourceLine - 1] = `${' '.repeat(indent)}- ${yamlKey(sourceKey)}: ${yamlQuote(nextValue)}`
        return
      }
      const nextScalar = nextKey && nextValue ? `${nextKey}: ${nextValue}` : (nextValue || String(row[contentIndex] || '').replace(/^-\s*/, ''))
      sourceLines[sourceLine - 1] = `${' '.repeat(indent)}- ${yamlQuote(nextScalar)}`
      return
    }
    const sourceContent = stripLineIndent(originalLine)
    const contentCell = String(row[contentIndex] || '')
    sourceLines[sourceLine - 1] = `${' '.repeat(indent)}${nextValue && nextValue !== sourceContent ? nextValue : contentCell}`
  })
  return sourceLines.join('\n')
}
