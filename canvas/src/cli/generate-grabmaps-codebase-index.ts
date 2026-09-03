import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { serializeMarkdownPipeTable } from '@/features/markdown/ui/markdownDataViewSerialize'
import {
  GRABMAPS_DOC_ROWS,
  type GrabMapsApiDocRow,
} from '../features/integrations/grabMapsSsot.rows'
import { resolveApiReferenceCodebaseIndexOutputPath } from './apiReferenceOutputPaths'

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(SCRIPT_DIR, '../../..')
const OUTPUT_PATH = resolveApiReferenceCodebaseIndexOutputPath(
  REPO_ROOT,
  'agentic-graph-grabmaps-api-reference-codebase-index.md',
)

function normalizeScalar(value: unknown): string {
  if (typeof value === 'undefined' || value === null) return ''
  return String(value).trim()
}

function resolvePattern(typeLabel: string): string {
  const normalized = String(typeLabel || '').trim().toLowerCase()
  if (!normalized) return 'scalar'
  if (normalized.includes('object[]') || normalized.includes('array')) return 'array<union>'
  if (normalized.includes('object') || normalized.includes('map')) return 'map'
  if (normalized.includes('|')) return 'union'
  return 'scalar'
}

function formatList(values: string[] | undefined): string {
  return (values || []).map(v => String(v || '').trim()).filter(Boolean).join('; ')
}

function resolveEndpoint(row: GrabMapsApiDocRow): string {
  const value = String(row.value || '').trim()
  if (/^(GET|POST|PUT|PATCH|DELETE)\s+/i.test(value)) return value
  if (row.key.startsWith('grabmaps.endpoint.')) return 'GrabMaps endpoint'
  if (row.key.startsWith('grabmaps.mcp.')) return 'POST /api/v1/mcp'
  if (row.key.startsWith('grabmaps.')) return 'ALL'
  if (row.key.startsWith('geo.')) return 'Geo panel'
  if (row.key.startsWith('geospatial.')) return 'Geospatial mode'
  if (row.key.startsWith('maplibre.')) return 'MapLibre surface'
  return 'ALL'
}

function resolveKind(row: GrabMapsApiDocRow): string {
  const type = String(row.typeLabel || '').toLowerCase()
  if (type.includes('endpoint')) return 'endpoint'
  if (type.includes('url')) return 'config'
  if (row.key.startsWith('grabmaps.endpoint.')) return 'endpoint'
  if (row.key.startsWith('grabmaps.mcp.')) return 'param'
  if (row.key.startsWith('grabmaps.') || row.key.startsWith('geo.') || row.key.startsWith('maplibre.')) return 'config'
  return 'param'
}

function buildValueDescription(row: GrabMapsApiDocRow): string {
  const parts: string[] = []
  if (typeof row.tooltipDefaultValue !== 'undefined') parts.push(`Default: ${normalizeScalar(row.tooltipDefaultValue)}`)
  if (typeof row.tooltipMin !== 'undefined') parts.push(`Min: ${normalizeScalar(row.tooltipMin)}`)
  if (typeof row.tooltipMax !== 'undefined') parts.push(`Max: ${normalizeScalar(row.tooltipMax)}`)
  if (typeof row.tooltipInterval !== 'undefined') parts.push(`Interval: ${normalizeScalar(row.tooltipInterval)}`)
  if (row.tooltipExpansionNote) parts.push(String(row.tooltipExpansionNote).trim())
  if (row.tooltipContractionNote) parts.push(String(row.tooltipContractionNote).trim())
  const impact = String(row.tooltipImpact || row.valueDescription || '').trim()
  if (impact) parts.push(impact)
  return parts.join('; ')
}

function buildRow(row: GrabMapsApiDocRow): string[] {
  return [
    resolveEndpoint(row),
    resolveKind(row),
    row.key,
    row.typeLabel,
    row.value,
    row.valueKey ? 'yes' : 'no',
    'in',
    row.valueKey ? 'Caller' : 'Operator',
    row.responsibility || '—',
    row.valueKey ? 'body' : '—',
    row.area || '—',
    resolvePattern(row.typeLabel),
    row.keyDescription,
    buildValueDescription(row),
    formatList(row.module),
    formatList(row.className),
    formatList(row.functionName),
  ]
}

function buildMarkdown(): string {
  return [
    '## Table',
    '',
    ...serializeMarkdownPipeTable({
      columns: ['endpoint', 'kind', 'key', 'type', 'value', 'required', 'direction', 'actor', 'seq-note', 'location', 'scope', 'pattern', 'key-description', 'value-description', 'module', 'class', 'function'],
      rows: GRABMAPS_DOC_ROWS.map(buildRow),
    }),
    '',
  ].join('\n')
}

function main(): void {
  mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true })
  writeFileSync(OUTPUT_PATH, buildMarkdown(), 'utf8')
  process.stdout.write(`${OUTPUT_PATH}\n`)
}

main()
