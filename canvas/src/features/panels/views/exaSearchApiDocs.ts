import type { FlowDetails, SettingMeta } from '@/features/settings/types'
import type { VirtualSettingsEntry } from './byteplusSharedTextApiDocs'
import { buildSettingsRowAnchorId } from './settingsRowAnchor'
import {
  EXA_SEARCH_API_AUTH_HEADER,
  EXA_SEARCH_API_AUTH_SCHEME,
  EXA_SEARCH_API_CATEGORIES,
  EXA_SEARCH_API_CODING_AGENT_REQUEST_JSON,
  EXA_SEARCH_API_DEFAULT_NUM_RESULTS,
  EXA_SEARCH_API_DEFAULT_SEARCH_TYPE,
  EXA_SEARCH_API_DEPRECATED_FIELDS,
  EXA_SEARCH_API_DOC_AREA,
  EXA_SEARCH_API_DOCS_MARKDOWN_URL,
  EXA_SEARCH_API_DOCS_URL,
  EXA_SEARCH_API_ENDPOINT,
  EXA_SEARCH_API_ERROR_STATUSES,
  EXA_SEARCH_API_INVOCATION_TEXT,
  EXA_SEARCH_API_KEY_ENV,
  EXA_SEARCH_API_MAX_NUM_RESULTS,
  EXA_SEARCH_API_RESPONSE_FIELDS,
  EXA_SEARCH_API_SEARCH_TYPES,
} from 'grph-shared/search/exaSearchApiSsot'

export { EXA_SEARCH_API_DOC_AREA, EXA_SEARCH_API_DOCS_URL }

type ExaSearchApiDocRow = Readonly<{
  key: string
  typeLabel: string
  value: string | number | boolean
  responsibility: string
  notes?: string
  searchHints?: readonly string[]
}>

const rows: ReadonlyArray<ExaSearchApiDocRow> = [
  {
    key: 'endpoint',
    typeLabel: 'endpoint',
    value: `POST ${EXA_SEARCH_API_ENDPOINT}`,
    responsibility: 'Canonical Exa Search endpoint for source-grounded coding-agent research.',
    searchHints: ['search endpoint', 'POST', EXA_SEARCH_API_ENDPOINT],
  },
  {
    key: 'auth.boundary',
    typeLabel: 'security note',
    value: `${EXA_SEARCH_API_AUTH_HEADER}: ${EXA_SEARCH_API_AUTH_SCHEME} (${EXA_SEARCH_API_KEY_ENV} host reference)`,
    responsibility: 'Describe server-owned bearer authentication without accepting or persisting a raw Exa API key in browser state.',
    notes: 'The key value belongs in a trusted host or proxy. MainPanel exposes names and boundaries only.',
    searchHints: ['authentication', EXA_SEARCH_API_KEY_ENV, EXA_SEARCH_API_AUTH_HEADER],
  },
  {
    key: 'request.query',
    typeLabel: 'string required',
    value: 'query',
    responsibility: 'Required natural-language search query for the coding task.',
  },
  {
    key: 'request.type',
    typeLabel: 'enum',
    value: EXA_SEARCH_API_DEFAULT_SEARCH_TYPE,
    responsibility: 'Search strategy selector; auto is the upstream default and chooses an appropriate strategy.',
    searchHints: EXA_SEARCH_API_SEARCH_TYPES,
  },
  {
    key: 'request.numResults',
    typeLabel: 'integer',
    value: EXA_SEARCH_API_DEFAULT_NUM_RESULTS,
    responsibility: `Bound the evidence pack to 1-${EXA_SEARCH_API_MAX_NUM_RESULTS} results; default to ${EXA_SEARCH_API_DEFAULT_NUM_RESULTS}.`,
  },
  {
    key: 'request.contents.highlights',
    typeLabel: 'boolean',
    value: true,
    responsibility: 'Return focused passages for coding-agent context instead of transferring full page text by default.',
    notes: 'The Exa coding-agent guide recommends highlights for concise, relevant evidence.',
  },
  {
    key: 'request.filters',
    typeLabel: 'object',
    value: JSON.stringify({ includeDomains: [], excludeDomains: [], category: null }),
    responsibility: 'Optional domain, category, and date filters narrow source selection without changing downstream ownership.',
    searchHints: ['includeDomains', 'excludeDomains', 'date filters', ...EXA_SEARCH_API_CATEGORIES],
  },
  {
    key: 'request.freshness',
    typeLabel: 'integer optional',
    value: 'contents.maxAgeHours',
    responsibility: 'Control cache freshness explicitly; zero forces live crawling and can add latency.',
    notes: 'Leave maxAgeHours absent unless the task requires a specific freshness boundary.',
    searchHints: ['maxAgeHours', 'live crawl', 'cache'],
  },
  {
    key: 'request.structured_output',
    typeLabel: 'object optional',
    value: 'outputSchema',
    responsibility: 'Request grounded structured output with the upstream schema limits instead of parsing prose downstream.',
    notes: 'The guide limits schemas to two nesting levels and ten properties.',
  },
  {
    key: 'request.stream',
    typeLabel: 'boolean',
    value: false,
    responsibility: 'Opt into SSE only when the caller owns OpenAI-compatible chat-chunk consumption.',
  },
  {
    key: 'request.coding_agent_default',
    typeLabel: 'json',
    value: EXA_SEARCH_API_CODING_AGENT_REQUEST_JSON,
    responsibility: 'Non-secret request preview shared by MainPanel Integrations, MCP guidance, and Skills & Commands.',
  },
  {
    key: 'response.contract',
    typeLabel: 'string[]',
    value: JSON.stringify(EXA_SEARCH_API_RESPONSE_FIELDS),
    responsibility: 'Track request identity, selected search type, evidence, structured output, and reported total cost.',
  },
  {
    key: 'errors.statuses',
    typeLabel: 'integer[]',
    value: JSON.stringify(EXA_SEARCH_API_ERROR_STATUSES),
    responsibility: 'Handle validation, authentication, semantic validation, rate limiting, and service failures explicitly.',
  },
  {
    key: 'deprecated.fields',
    typeLabel: 'string[]',
    value: JSON.stringify(EXA_SEARCH_API_DEPRECATED_FIELDS),
    responsibility: 'Reject legacy top-level content and retired tuning fields at the shared request boundary.',
  },
  {
    key: 'invocation',
    typeLabel: '/ # @',
    value: EXA_SEARCH_API_INVOCATION_TEXT,
    responsibility: 'Route Exa through canonical Agentic Canvas OS tool catalog semantics without inventing provider-specific grammar.',
  },
  {
    key: 'docs.url',
    typeLabel: 'url',
    value: EXA_SEARCH_API_DOCS_URL,
    responsibility: 'Canonical Exa Search API guide for coding agents.',
  },
  {
    key: 'docs.markdown_url',
    typeLabel: 'url',
    value: EXA_SEARCH_API_DOCS_MARKDOWN_URL,
    responsibility: 'Markdown form of the canonical guide for source verification.',
  },
]

const toBaseType = (typeLabel: string): SettingMeta['type'] => {
  const normalized = typeLabel.toLowerCase()
  if (normalized.includes('boolean')) return 'boolean'
  if (normalized.includes('object') || normalized.includes('[]') || normalized.includes('json')) return 'json'
  if (normalized.includes('integer') || normalized.includes('number')) return 'number'
  return 'string'
}

export function getExaSearchApiRowAnchorId(rowKey: string): string {
  return buildSettingsRowAnchorId('integrations-row-exa-search', rowKey)
}

export const EXA_SEARCH_API_DOC_ENTRIES: ReadonlyArray<VirtualSettingsEntry> = rows.map(row => {
  const details: FlowDetails = {
    area: EXA_SEARCH_API_DOC_AREA,
    responsibility: row.responsibility,
    notes: row.notes || '',
    modules: ['Exa Search API'],
    classes: ['CodingAgentSearchContract'],
    functions: ['MainPanel Integrations', 'MainPanel MCP', 'FloatingPanel Skills & Commands'],
    imports: [],
  }
  return {
    meta: {
      key: `exaSearchApi.${row.key}`,
      type: toBaseType(row.typeLabel),
      source: 'backendEnv',
      read: () => row.value,
    },
    value: row.value,
    typeLabel: row.typeLabel,
    tooltipRole: 'Exa Search API',
    tooltipDefaultValue: row.value,
    searchHints: ['exa search api', 'coding agent search', row.key, ...(row.searchHints || [])],
    details,
  }
})
