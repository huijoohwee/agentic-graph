import type { WorkspaceImportState } from './sourceIndex'
import { normalizeWorkspacePath } from './path'
import { safeWebsitePathSegment } from '@/lib/websites/websitePathUtils'
import { hashStringToHex } from '@/lib/hash/stringHash'

export const IMPORT_INDEX_NAME = '_import-index.md'
export const IMPORT_INDEX_MAX_BYTES = 480 * 1024
const legacyStart = '<!-- workspace-import-index:v1 -->'
const startPattern = /^<!-- workspace-import-index:v(?:1|2 checksum=[a-f0-9]{8}) -->$/m
const end = '<!-- /workspace-import-index -->'
const columns = ['Source', 'Status', 'Saved documents', 'Detail', 'Input digest', 'Output digest', 'Checked at (ms)', 'Check result', 'ETag', 'Last modified']
export type ImportInventoryItem = {
  source: string
  status: 'imported' | 'not imported' | 'pending' | 'missing'
  outputs?: Array<{ path: string; receipt?: WorkspaceImportState }>
  detail?: string
}

export function importInventorySource(value: string): string {
  if (value.startsWith('local:/')) return `local:${normalizeWorkspacePath(value.slice(6))}`
  const url = new URL(value)
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('Unsupported import inventory source.')
  url.hash = ''
  return url.href
}

export function importInventoryPath(source: string): string {
  const normalized = importInventorySource(source)
  const parts = normalized.startsWith('local:') ? normalized.slice(6).split('/').filter(Boolean) : []
  const root = normalized.startsWith('local:') ? (parts.length > 1 ? `/${parts[0]}` : '')
    : `/websites/${safeWebsitePathSegment(new URL(normalized).host)}`
  return `${root}/${IMPORT_INDEX_NAME}`
}

const cell = (value: string) => value.replace(/[&<>|\[\]`\n\r]/g, c => `&#${c.charCodeAt(0)};`)
const tableCell = (value: string) => cell(value).replace(/[\\\t]/g, c => `&#${c.charCodeAt(0)};`).replace(/^ +| +$/g, spaces => '&#32;'.repeat(spaces.length))
const uncell = (value: string) => value.replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
// An explicitly empty string differs from an absent optional field; literal quotes remain escaped.
const optionalCell = (value: string | undefined) => value === undefined ? '' : value === '' ? '""' : tableCell(value).replace(/^""$/, '&#34;&#34;')
const optionalValue = (value: string) => value === '' ? undefined : value === '""' ? '' : uncell(value)
const legacyTarget = (value: string) => value.replace(/[\s()<>"\\]/g, c => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)
const target = (value: string) => legacyTarget(value).replace(/[|`]/g, c => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)
function validateItems(items: ImportInventoryItem[]) {
  if (!Array.isArray(items) || items.length > 5000) throw new Error('Import index exceeds 5,000 records; existing inventory was preserved.')
  const seen = new Set<string>()
  for (const item of items) {
    if (!item || Object.keys(item).some(key => !['source', 'status', 'outputs', 'detail'].includes(key))) throw new Error('Unsupported import inventory fields; content was preserved.')
    if (typeof item.source !== 'string' || item.source.length > 8192 || importInventorySource(item.source) !== item.source || seen.has(item.source)
      || !['imported', 'not imported', 'pending', 'missing'].includes(item.status)
      || (item.detail !== undefined && (typeof item.detail !== 'string' || item.detail.length > 4096))
      || (item.outputs !== undefined && (!Array.isArray(item.outputs) || item.outputs.length > 100))) throw new Error('Invalid import inventory row.')
    for (const output of item.outputs || []) {
      if (!output || Object.keys(output).some(key => !['path', 'receipt'].includes(key))) throw new Error('Unsupported saved import fields; content was preserved.')
      if (typeof output.path !== 'string' || !output.path.startsWith('/') || normalizeWorkspacePath(output.path) !== output.path || output.path.length > 8192) throw new Error('Invalid saved import path.')
      const receipt = output.receipt
      if (receipt && (Object.keys(receipt).some(key => !['identity', 'inputDigest', 'outputDigest', 'checkedAt', 'status', 'etag', 'lastModified'].includes(key))
        || (receipt.etag !== undefined && typeof receipt.etag !== 'string') || (receipt.lastModified !== undefined && typeof receipt.lastModified !== 'string'))) throw new Error('Unsupported import receipt fields; content was preserved.')
      if (receipt && (typeof receipt.identity !== 'string' || receipt.identity !== (item.source.startsWith('local:') ? item.source : `url:${item.source}`)
        || !/^[a-f0-9]{64}$/.test(receipt.outputDigest) || (receipt.inputDigest !== undefined && !/^[a-f0-9]{64}$/.test(receipt.inputDigest))
        || !Number.isFinite(receipt.checkedAt) || !['imported', 'unchanged'].includes(receipt.status))) throw new Error('Invalid import receipt.')
    }
    seen.add(item.source)
  }
}

function renderLegacyInventory(items: ImportInventoryItem[], encodedTargets = false): string {
  const link = (label: string, value: string) => `[${cell(label)}](<${encodedTargets ? encodeURI(value).replace(/[()<>]/g, c => encodeURIComponent(c)) : legacyTarget(value)}>)`
  validateItems(items)
  const ordered = [...items].sort((a, b) => a.source.localeCompare(b.source))
  const imported = ordered.filter(item => item.status === 'imported').length
  const lines = [legacyStart, '# Import index', '', `${ordered.length} known sources · ${imported} imported · ${ordered.length - imported} not fully imported`, '',
    'All known discoveries and selected inputs are retained here. This is not a claim that every source has been discovered. Opening this index does not crawl or import anything.', '',
    '| Source | Status | Saved documents | Detail |', '| --- | --- | --- | --- |']
  for (const item of ordered) {
    const label = item.source.startsWith('local:') ? cell(item.source.slice(6)) : link(new URL(item.source).pathname + new URL(item.source).search || '/', item.source)
    lines.push(`| ${label} | ${item.status} | ${(item.outputs || []).map(output => link(output.path.split('/').pop()!, output.path)).join(', ')} | ${cell(item.detail || '')} |`)
  }
  const payload = JSON.stringify({ version: 1, items: ordered }).replace(/</g, '\\u003c').replace(/`/g, '\\u0060')
  lines.push('', '<details><summary>Import metadata</summary>', '', '```json', payload, '```', '', '</details>', end)
  const text = lines.join('\n') + '\n'
  if (new TextEncoder().encode(text).byteLength > IMPORT_INDEX_MAX_BYTES) throw new Error('Import index exceeds 480 KiB; existing inventory was preserved. Split the collection before adding more sources.')
  return text
}

/** A single table owns both the Viewer rows and portable import receipts. */
export function renderImportInventory(items: ImportInventoryItem[], fullSourceLabels = false): string {
  validateItems(items)
  const ordered = [...items].sort((a, b) => a.source.localeCompare(b.source))
  const imported = ordered.filter(item => item.status === 'imported').length
  const link = (value: string, label = value) => `[${tableCell(label)}](<${target(value)}>)`
  const lines = ['# Import index', '', `${ordered.length} known sources · ${imported} imported · ${ordered.length - imported} not fully imported`, '',
    'All known discoveries and selected inputs are retained here. Opening this index does not crawl or import anything. Each saved document has its own row; receipt fields stay with that row.', '',
    `| ${columns.join(' | ')} |`, `| ${columns.map(() => '---').join(' | ')} |`]
  for (const item of ordered) for (const output of item.outputs?.length ? item.outputs : [undefined]) {
    const receipt = output?.receipt
    const origin = item.source.startsWith('local:') ? '' : new URL(item.source).origin
    const sourceLabel = origin && !fullSourceLabels ? `${item.source.slice(origin.length)} · ${origin}` : item.source
    lines.push(`| ${[origin ? link(item.source, sourceLabel) : tableCell(item.source), item.status,
      output ? link(output.path) : '', optionalCell(item.detail), receipt?.inputDigest || '', receipt?.outputDigest || '',
      receipt ? String(receipt.checkedAt) : '', receipt?.status || '', optionalCell(receipt?.etag), optionalCell(receipt?.lastModified)].join(' | ')} |`)
  }
  const body = lines.join('\n') + '\n'
  // This existing non-security checksum detects accidental managed edits; it grants no import authority.
  const text = `<!-- workspace-import-index:v2 checksum=${hashStringToHex(body)} -->\n${body}${end}\n`
  if (new TextEncoder().encode(text).byteLength > IMPORT_INDEX_MAX_BYTES) throw new Error('Import index exceeds 480 KiB; existing inventory was preserved. Split the collection before adding more sources.')
  return text
}

function readTableInventory(block: string): ImportInventoryItem[] {
  const rows = block.split('\n').filter(line => line.startsWith('| '))
  if (rows.shift() !== `| ${columns.join(' | ')} |` || rows.shift() !== `| ${columns.map(() => '---').join(' | ')} |`) throw new Error('Unsupported import index columns.')
  const items = new Map<string, ImportInventoryItem>()
  const label = (value: string) => uncell(value.match(/^\[([^\]]*)\]\(<[^>\n]*>\)$/)?.[1] ?? value)
  for (const row of rows) {
    const cells = row.split('|').slice(1, -1).map(value => value.trim())
    if (cells.length !== columns.length) throw new Error('Invalid import inventory row.')
    const [sourceLabel, status, path, , inputDigest, outputDigest, checkedAt, result] = cells.map((value, i) => i === 0 || i === 2 ? label(value) : uncell(value))
    const pathFirst = sourceLabel.match(/^(\/.*) · (https?:\/\/[^/]+)$/)
    const source = pathFirst ? pathFirst[2] + pathFirst[1] : sourceLabel
    const detail = optionalValue(cells[3]), etag = optionalValue(cells[8]), lastModified = optionalValue(cells[9])
    const item = items.get(source) || { source, status: status as ImportInventoryItem['status'], ...(detail !== undefined ? { detail } : {}) }
    if (item.status !== status || item.detail !== detail || (!path && items.has(source))) throw new Error('Conflicting import inventory rows.')
    if (path) {
      if (item.outputs?.some(output => output.path === path)) throw new Error('Duplicate saved import path.')
      const receipt: WorkspaceImportState | undefined = outputDigest ? {
        identity: source.startsWith('local:') ? source : `url:${source}`, outputDigest,
        ...(inputDigest ? { inputDigest } : {}), checkedAt: checkedAt === '' ? NaN : Number(checkedAt), status: result as WorkspaceImportState['status'],
        ...(etag !== undefined ? { etag } : {}), ...(lastModified !== undefined ? { lastModified } : {}),
      } : undefined
      if (!receipt && cells.slice(4).some(Boolean)) throw new Error('Incomplete import receipt.')
      item.outputs = [...(item.outputs || []), { path, ...(receipt ? { receipt } : {}) }]
    } else if (cells.slice(4).some(Boolean)) throw new Error('Import receipt has no saved document.')
    items.set(source, item)
  }
  const result = [...items.values()]
  validateItems(result)
  return result
}

export function readImportInventory(text: string): ImportInventoryItem[] {
  if (new TextEncoder().encode(text).byteLength > IMPORT_INDEX_MAX_BYTES) throw new Error('Import index exceeds the supported size.')
  const start = text.match(startPattern)?.[0] || ''
  const a = start ? text.indexOf(start) : -1, b = text.indexOf(end, a)
  const block = a >= 0 && b > a ? text.slice(a, b + end.length) + '\n' : ''
  if (start !== legacyStart && block) {
    try {
      const items = readTableInventory(block)
      const matches = (generated: string) => generated === block || generated.replace(/^\| .* \|$/gm,
        line => line.replace(/\[([^\]\n]*)\]\(<[^>\n]*>\)/g, '$1')) === block
      if (!matches(renderImportInventory(items)) && !matches(renderImportInventory(items, true))) throw new Error('Managed content differs.')
      return items
    } catch { throw new Error('The generated import index was edited; its content was preserved. Keep notes outside the managed block.') }
  }
  const payload = block.match(/\n```json\n([^\n]+)\n```/)
  if (!payload) throw new Error('Import index has unrelated or damaged content; it was preserved.')
  const parsed = JSON.parse(payload[1])
  if (parsed.version !== 1 || !Array.isArray(parsed.items) || parsed.items.length > 5000) throw new Error('Unsupported import index.')
  const generated = renderLegacyInventory(parsed.items)
  // Recover a table whose links became labels, only when every other byte still agrees
  // with validated metadata. Never normalize metadata, notes, or changed table cells.
  const labelsOnly = generated.replace(/^\| .* \|$/gm, line => line.replace(/\[([^\]\n]*)\]\(<[^>\n]*>\)/g, '$1'))
  if (generated !== block && labelsOnly !== block && renderLegacyInventory(parsed.items, true) !== block) throw new Error('The generated import index was edited; its content was preserved. Keep notes outside the managed block.')
  return parsed.items
}

export function replaceImportInventory(text: string | null, items: ImportInventoryItem[]): string {
  const block = renderImportInventory(items)
  if (text === null) return block
  readImportInventory(text)
  return text.slice(0, text.search(startPattern)) + block.trimEnd() + text.slice(text.indexOf(end) + end.length)
}
