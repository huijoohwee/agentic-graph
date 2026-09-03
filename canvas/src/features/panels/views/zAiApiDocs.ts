import type { VirtualSettingsEntry } from './byteplusSharedTextApiDocs'
import type { SettingMeta } from '@/features/settings/types'

export const Z_AI_API_DOC_AREA = 'Z.AI API'
export const Z_AI_API_DOCS_URL = 'https://docs.z.ai/guides/overview/quick-start.md'

export { getZaiApiRowAnchorId } from './chatApiDocAnchors'

type ZAiDocRow = {
  key: string
  typeLabel: string
  value: string | number | boolean
  responsibility: string
  notes?: string
  searchHints?: string[]
}

const toBaseType = (typeLabel: string): SettingMeta['type'] => {
  const normalized = String(typeLabel || '').trim().toLowerCase()
  if (normalized.includes('boolean')) return 'boolean'
  if (normalized.includes('integer') || normalized.includes('float') || normalized.includes('number')) return 'number'
  if (normalized.includes('object') || normalized.includes('[]') || normalized.includes('array')) return 'json'
  return 'string'
}

const Z_AI_API_DOC_ROWS: ReadonlyArray<ZAiDocRow> = [
  {
    key: 'provider',
    typeLabel: 'string',
    value: 'Z.AI',
    responsibility: 'Identifies the referenced Z.AI Open Platform in the MainPanel Settings documentation surface.',
    notes: 'This reference does not select or register a new agentic-graph chat provider.',
    searchHints: ['provider', 'z.ai', 'z ai', 'open platform'],
  },
  {
    key: 'runtime_status',
    typeLabel: 'string',
    value: 'reference_only',
    responsibility: 'Makes the Settings-only boundary visible before an application runtime owner exists.',
    notes: 'The current chat endpoint and proxy allowlists do not include Z.AI, so these rows neither accept credentials nor enable provider execution.',
    searchHints: ['reference only', 'docs only', 'runtime boundary', 'unsupported provider'],
  },
  {
    key: 'protocol',
    typeLabel: 'string',
    value: 'OpenAI-compatible Chat Completions',
    responsibility: 'Records the protocol family described by the linked Quick Start.',
    searchHints: ['openai compatible', 'chat completions', 'protocol'],
  },
  {
    key: 'auth_header',
    typeLabel: 'string',
    value: 'Authorization: Bearer <Z.AI API key>',
    responsibility: 'Documents the bearer-token convention without rendering or persisting a credential.',
    searchHints: ['authorization', 'bearer', 'api key', 'authentication'],
  },
  {
    key: 'base_url',
    typeLabel: 'string',
    value: 'https://api.z.ai/api/paas/v4',
    responsibility: 'Records the OpenAI-compatible API base URL; a compatible client appends the chat endpoint path.',
    searchHints: ['base url', 'api.z.ai', 'paas', 'v4'],
  },
  {
    key: 'endpoint',
    typeLabel: 'string',
    value: 'POST /chat/completions',
    responsibility: 'Records the documented chat-completions operation relative to the base URL.',
    searchHints: ['post', 'chat completions', 'endpoint'],
  },
  {
    key: 'model',
    typeLabel: 'string',
    value: 'glm-5.2',
    responsibility: 'Shows the current Quick Start model identifier as a reference value.',
    searchHints: ['model', 'glm', 'glm-5.2'],
  },
  {
    key: 'request_fields',
    typeLabel: 'array',
    value: '["model", "messages"]',
    responsibility: 'Lists the minimum request-body fields for the documented chat-completions call.',
    searchHints: ['request body', 'model', 'messages'],
  },
  {
    key: 'stream',
    typeLabel: 'boolean',
    value: true,
    responsibility: 'Records that the documented chat-completions surface supports streaming.',
    notes: 'This reference value does not turn on a new stream transport in agentic-graph.',
    searchHints: ['stream', 'streaming', 'sse'],
  },
]

export const Z_AI_API_DOC_ENTRIES: ReadonlyArray<VirtualSettingsEntry> =
  Z_AI_API_DOC_ROWS.map(row => ({
    meta: {
      key: `zAiApi.${row.key}`,
      type: toBaseType(row.typeLabel),
      source: 'backendEnv',
      read: () => row.value,
    },
    value: row.value,
    typeLabel: row.typeLabel,
    referenceOnly: true,
    searchHints: ['z.ai api', 'z ai', 'glm', row.key, ...(row.searchHints || [])],
    details: {
      area: Z_AI_API_DOC_AREA,
      responsibility: row.responsibility,
      notes: row.notes || '',
      modules: ['POST /chat/completions'],
      classes: ['Request body'],
      functions: ['Z.AI OpenAI-Compatible Chat Completions API'],
    },
  }))
