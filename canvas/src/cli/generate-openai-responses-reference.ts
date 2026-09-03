import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { serializeMarkdownPipeTable } from '@/features/markdown/ui/markdownDataViewSerialize'
import {
  OPENAI_RESPONSES_API_DOC_ROWS,
  OPENAI_VALUE_TOOLTIP_BY_ROW_KEY,
  type OpenAiApiDocRow,
} from '../features/integrations/openaiResponsesSsot'
import { resolveApiReferenceCodebaseIndexOutputPath } from './apiReferenceOutputPaths'

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(SCRIPT_DIR, '../../..')

const OUTPUT_PATH = resolveApiReferenceCodebaseIndexOutputPath(
  REPO_ROOT,
  'agentic-graph-openai-responses-api-reference-codebase-index.md',
)

const CONFIG_KEYS = new Set(['provider', 'auth_mode', 'endpoint_url', 'api_key'])
const REQUIRED_KEYS = new Set(['provider', 'auth_mode', 'endpoint_url', 'model'])

function normalizeScalar(value: string | number | boolean | null | undefined): string {
  if (typeof value === 'undefined') return ''
  if (value === null) return 'null'
  const text = String(value).trim()
  if (!text) return ''
  return text === '—' ? '-' : text
}

function trimTrailingSentencePunctuation(value: string): string {
  return String(value || '').trim().replace(/[.;\s]+$/g, '')
}

function buildValueDescription(row: OpenAiApiDocRow): string {
  const tooltip = OPENAI_VALUE_TOOLTIP_BY_ROW_KEY[row.key] || {}
  const parts: string[] = []
  const defaultValue = typeof row.tooltipDefaultValue !== 'undefined'
    ? row.tooltipDefaultValue
    : tooltip.defaultValue
  const min = typeof row.tooltipMin !== 'undefined' ? row.tooltipMin : tooltip.min
  const max = typeof row.tooltipMax !== 'undefined' ? row.tooltipMax : tooltip.max
  const interval = typeof row.tooltipInterval !== 'undefined' ? row.tooltipInterval : tooltip.interval
  const expansionNote = row.tooltipExpansionNote || tooltip.expansionNote
  const contractionNote = row.tooltipContractionNote || tooltip.contractionNote
  const impact = row.tooltipImpact || tooltip.impact

  if (typeof defaultValue !== 'undefined') parts.push(`Default: ${normalizeScalar(defaultValue)}`)
  if (typeof min !== 'undefined') parts.push(`Min: ${normalizeScalar(min)}`)
  if (typeof max !== 'undefined') parts.push(`Max: ${normalizeScalar(max)}`)
  if (typeof interval !== 'undefined') parts.push(`Interval: ${normalizeScalar(interval)}`)
  if (expansionNote) parts.push(trimTrailingSentencePunctuation(expansionNote))
  if (contractionNote) parts.push(trimTrailingSentencePunctuation(contractionNote))
  if (impact) parts.push(`Impact: ${trimTrailingSentencePunctuation(impact)}`)
  return parts.join('; ')
}

function resolvePattern(typeLabel: string): string {
  const normalized = String(typeLabel || '').trim().toLowerCase()
  if (!normalized) return '—'
  if (normalized.includes('state-machine')) return 'state-machine'
  if (normalized.includes('webhook')) return 'webhook'
  if (normalized.includes('array<union>')) return 'array<union>'
  if (normalized.includes('[]')) return 'array<union>'
  if (normalized.includes('|')) return 'union'
  return 'scalar'
}

function formatList(values: string[] | undefined): string {
  return (values || []).map(value => String(value || '').trim()).filter(Boolean).join('; ')
}

function buildRow(row: OpenAiApiDocRow): string[] {
  const isConfig = CONFIG_KEYS.has(row.key)
  const endpoint = isConfig ? 'ALL' : 'POST /responses'
  const kind = isConfig ? 'config' : 'param'
  const required = REQUIRED_KEYS.has(row.key) ? 'yes' : (isConfig ? 'no' : 'no')
  const direction = 'in'
  const actor = isConfig ? 'Operator' : 'Caller'
  const seqNote = isConfig ? '—' : 'POST /responses'
  const location = isConfig ? '—' : 'body'
  const scope = '—'
  const pattern = resolvePattern(row.typeLabel)
  const keyDescription = row.responsibility
  const valueDescription = buildValueDescription(row)

  return [
    endpoint,
    kind,
    row.key,
    row.typeLabel,
    row.value,
    required,
    direction,
    actor,
    seqNote,
    location,
    scope,
    pattern,
    keyDescription,
    valueDescription,
    formatList(row.modules),
    formatList(row.classes),
    formatList(row.functions),
  ]
}

function buildMarkdown(): string {
  const lines = [
    '## Table',
    '',
    ...serializeMarkdownPipeTable({
      columns: ['endpoint', 'kind', 'key', 'type', 'value', 'required', 'direction', 'actor', 'seq-note', 'location', 'scope', 'pattern', 'key-description', 'value-description', 'module', 'class', 'function'],
      rows: OPENAI_RESPONSES_API_DOC_ROWS.map(buildRow),
    }),
    '',
  ]
  return lines.join('\n')
}

function main(): void {
  mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true })
  writeFileSync(OUTPUT_PATH, buildMarkdown(), 'utf8')
  process.stdout.write(`${OUTPUT_PATH}\n`)
}

main()
