import type { WorkspaceImportState } from './sourceIndex'
import { normalizeWorkspacePath } from './path'
import { safeWebsitePathSegment } from '@/lib/websites/websitePathUtils'

export const IMPORT_INDEX_NAME = '_import-index.md'
export const IMPORT_INDEX_MAX_BYTES = 480 * 1024
const start = '<!-- workspace-import-index:v1 -->'
const end = '<!-- /workspace-import-index -->'
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
const target = (value: string) => value.replace(/[\s()<>"\\]/g, c => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)
function validateItems(items: ImportInventoryItem[]) {
  if (!Array.isArray(items) || items.length > 5000) throw new Error('Import index exceeds 5,000 records; existing inventory was preserved.')
  const seen = new Set<string>()
  for (const item of items) {
    if (typeof item.source !== 'string' || item.source.length > 8192 || importInventorySource(item.source) !== item.source || seen.has(item.source)
      || !['imported', 'not imported', 'pending', 'missing'].includes(item.status)
      || (item.detail !== undefined && (typeof item.detail !== 'string' || item.detail.length > 4096))
      || (item.outputs !== undefined && (!Array.isArray(item.outputs) || item.outputs.length > 100))) throw new Error('Invalid import inventory row.')
    for (const output of item.outputs || []) {
      if (typeof output.path !== 'string' || !output.path.startsWith('/') || normalizeWorkspacePath(output.path) !== output.path || output.path.length > 8192) throw new Error('Invalid saved import path.')
      const receipt = output.receipt
      if (receipt && (typeof receipt.identity !== 'string' || receipt.identity !== (item.source.startsWith('local:') ? item.source : `url:${item.source}`)
        || !/^[a-f0-9]{64}$/.test(receipt.outputDigest) || (receipt.inputDigest !== undefined && !/^[a-f0-9]{64}$/.test(receipt.inputDigest))
        || !Number.isFinite(receipt.checkedAt) || !['imported', 'unchanged'].includes(receipt.status))) throw new Error('Invalid import receipt.')
    }
    seen.add(item.source)
  }
}

export function renderImportInventory(items: ImportInventoryItem[], encodedTargets = false): string {
  const link = (label: string, value: string) => `[${cell(label)}](<${encodedTargets ? encodeURI(value).replace(/[()<>]/g, c => encodeURIComponent(c)) : target(value)}>)`
  validateItems(items)
  const ordered = [...items].sort((a, b) => a.source.localeCompare(b.source))
  const imported = ordered.filter(item => item.status === 'imported').length
  const lines = [start, '# Import index', '', `${ordered.length} known sources · ${imported} imported · ${ordered.length - imported} not fully imported`, '',
    'All known discoveries and selected inputs are retained here. This is not a claim that every source has been discovered. Opening this index does not crawl or import anything.', '',
    '| Source | Status | Saved documents | Detail |', '| --- | --- | --- | --- |']
  for (const item of ordered) {
    const label = item.source.startsWith('local:') ? cell(item.source.slice(6)) : link(new URL(item.source).pathname + new URL(item.source).search || '/', item.source)
    lines.push(`| ${label} | ${item.status} | ${(item.outputs || []).map(output => link(output.path.split('/').pop()!, output.path)).join(', ')} | ${cell(item.detail || '')} |`)
  }
  // The human table and reusable receipts share one guarded document, not a second database.
  const payload = JSON.stringify({ version: 1, items: ordered }).replace(/</g, '\\u003c').replace(/`/g, '\\u0060')
  lines.push('', '<details><summary>Import metadata</summary>', '', '```json', payload, '```', '', '</details>', end)
  const text = lines.join('\n') + '\n'
  if (new TextEncoder().encode(text).byteLength > IMPORT_INDEX_MAX_BYTES) throw new Error('Import index exceeds 480 KiB; existing inventory was preserved. Split the collection before adding more sources.')
  return text
}

export function readImportInventory(text: string): ImportInventoryItem[] {
  if (new TextEncoder().encode(text).byteLength > IMPORT_INDEX_MAX_BYTES) throw new Error('Import index exceeds the supported size.')
  const a = text.indexOf(start), b = text.indexOf(end)
  const block = a >= 0 && b > a ? text.slice(a, b + end.length) + '\n' : ''
  const payload = block.match(/\n```json\n([^\n]+)\n```/)
  if (!payload) throw new Error('Import index has unrelated or damaged content; it was preserved.')
  const parsed = JSON.parse(payload[1])
  if (parsed.version !== 1 || !Array.isArray(parsed.items) || parsed.items.length > 5000) throw new Error('Unsupported import index.')
  if (renderImportInventory(parsed.items) !== block && renderImportInventory(parsed.items, true) !== block) throw new Error('The generated import index was edited; its content was preserved. Keep notes outside the managed block.')
  return parsed.items
}

export function replaceImportInventory(text: string | null, items: ImportInventoryItem[]): string {
  const block = renderImportInventory(items)
  if (text === null) return block
  readImportInventory(text)
  return text.slice(0, text.indexOf(start)) + block.trimEnd() + text.slice(text.indexOf(end) + end.length)
}
