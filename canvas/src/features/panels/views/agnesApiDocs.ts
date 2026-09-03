import type { VirtualSettingsEntry } from './byteplusSharedTextApiDocs'
import type { SettingMeta } from '@/features/settings/types'
import {
  CHAT_AGNES_ENDPOINT_URL,
  CHAT_AGNES_MODEL_OPTIONS,
  CHAT_PROVIDER_AGNES,
} from '@/lib/chatEndpoint'

export const AGNES_API_DOC_AREA = 'Agnes AI API'
export const AGNES_API_DOCS_URL = CHAT_AGNES_ENDPOINT_URL

export { getAgnesApiRowAnchorId } from './chatApiDocAnchors'

const AGNES_TOOLTIP_ROLE = 'Agnes AI API'

type AgnesDocRow = {
  key: string
  typeLabel: string
  value?: string | number | boolean
  options?: readonly string[]
  valueKey?: string
  responsibility: string
  notes?: string
  searchHints?: string[]
  tooltipDefaultValue?: string | number | boolean | null
}

const toBaseType = (typeLabel: string): SettingMeta['type'] => {
  const normalized = String(typeLabel || '').trim().toLowerCase()
  if (normalized.includes('boolean')) return 'boolean'
  if (normalized.includes('integer') || normalized.includes('float') || normalized.includes('number')) return 'number'
  if (normalized.includes('object') || normalized.includes('[]') || normalized.includes('array')) return 'json'
  return 'string'
}

const CHAT_AUTH_MODE_OPTIONS = ['serverManaged', 'byok'] as const
const AGNES_STREAMING_JSON_CHUNK_OPTIONS = ['delta.content', 'message.content', 'choices[].delta.content'] as const
const AGNES_OUTPUT_CONTRACT_OPTIONS = ['frontmatter_kgc_markdown', 'markdown', 'json'] as const

const AGNES_API_DOC_ROWS: ReadonlyArray<AgnesDocRow> = [
  {
    key: 'provider',
    typeLabel: 'string',
    valueKey: 'chatProvider',
    value: CHAT_PROVIDER_AGNES,
    responsibility: 'Shared chat provider id for Agnes AI on the existing FloatingPanel Chat transport path.',
    notes: 'Agnes stays additive on the shared provider/model/auth owner and does not create a second assistant runtime.',
    searchHints: ['provider', 'chatProvider', 'agnes'],
  },
  {
    key: 'auth_mode',
    typeLabel: 'enum',
    valueKey: 'chatAuthMode',
    value: 'serverManaged',
    options: CHAT_AUTH_MODE_OPTIONS,
    responsibility: 'Shared auth mode for the upstream Agnes API key.',
    notes: 'Default server-managed auth uses Cloudflare/dev proxy secrets; BYOK is memory-only and only for explicit user fallback.',
    searchHints: ['auth', 'byok', 'serverManaged'],
    tooltipDefaultValue: 'serverManaged',
  },
  {
    key: 'api_key',
    typeLabel: 'string',
    valueKey: 'chatApiKey',
    value: '',
    responsibility: 'Memory-only BYOK field for Agnes API access.',
    notes: 'Browser storage must not persist the raw key.',
    searchHints: ['api key', 'bearer', 'AGNES_API_KEY'],
    tooltipDefaultValue: '',
  },
  {
    key: 'endpoint_url',
    typeLabel: 'string',
    valueKey: 'chatEndpointUrl',
    value: CHAT_AGNES_ENDPOINT_URL,
    responsibility: 'OpenAI-compatible Agnes chat-completions endpoint routed through the shared chat proxy.',
    searchHints: ['endpoint', 'chat completions', '/v1/chat/completions'],
  },
  {
    key: 'model',
    typeLabel: 'enum',
    valueKey: 'chatModel',
    value: CHAT_AGNES_MODEL_OPTIONS[0],
    options: CHAT_AGNES_MODEL_OPTIONS,
    responsibility: 'Model id for Agnes text generation on the shared chat path.',
    searchHints: ['model', 'agnes-2.0-flash'],
    tooltipDefaultValue: CHAT_AGNES_MODEL_OPTIONS[0],
  },
  {
    key: 'messages',
    typeLabel: 'array',
    value: '[]',
    responsibility: 'States that Agnes reuses the canonical agentic-graph chat request message assembly.',
    notes: 'No provider-specific prompt schema fork is allowed.',
    searchHints: ['messages', 'prompt contract', 'context pack'],
    tooltipDefaultValue: '[]',
  },
  {
    key: 'stream',
    typeLabel: 'boolean',
    valueKey: 'chatStream',
    value: true,
    responsibility: 'Streaming toggle for the shared SSE request path.',
    notes: 'Agnes stream chunks stay on the shared raw SSE parser and final markdown apply path.',
    searchHints: ['stream', 'sse', 'json chunks'],
  },
  {
    key: 'max_tokens',
    typeLabel: 'integer',
    valueKey: 'chatMaxCompletionTokens',
    value: 4000,
    responsibility: 'Completion-token cap for the shared chat-completions request.',
    searchHints: ['max_tokens', 'completion tokens'],
  },
  {
    key: 'streaming.json_chunks',
    typeLabel: 'enum',
    value: 'delta.content',
    options: AGNES_STREAMING_JSON_CHUNK_OPTIONS,
    responsibility: 'Documents the provider contract required by the shared SSE JSON chunk parser.',
    notes: 'Chunk parsing must stay upstream of markdown validation and must not mutate graph state per chunk.',
    searchHints: ['sse', 'json chunks', 'delta.content', 'done'],
    tooltipDefaultValue: 'delta.content',
  },
  {
    key: 'output_contract',
    typeLabel: 'enum',
    value: 'frontmatter_kgc_markdown',
    options: AGNES_OUTPUT_CONTRACT_OPTIONS,
    responsibility: 'Pins Agnes to the canonical FloatingPanel Chat -> Workspace -> Source Files -> markdown/frontmatter -> canvas path.',
    notes: 'Do not emit prose wrappers, legacy aliases, duplicate grouping keys, or provider-specific canvas directives.',
    searchHints: ['markdown', 'yaml frontmatter', 'workspace', 'source files', 'storyboard widget', 'storyboard', 'animatic'],
    tooltipDefaultValue: 'frontmatter_kgc_markdown',
  },
]

export const AGNES_API_DOC_ENTRIES: ReadonlyArray<VirtualSettingsEntry> =
  AGNES_API_DOC_ROWS.map(row => ({
    meta: {
      key: `agnesApi.${row.key}`,
      type: toBaseType(row.typeLabel),
      source: row.valueKey ? 'localStorage' : 'backendEnv',
      read: () => row.value ?? 'Agnes AI API setting',
      ...(row.options ? { options: [...row.options] } : {}),
    },
    value: row.value ?? 'Agnes AI API setting',
    valueKey: row.valueKey,
    typeLabel: row.typeLabel,
    tooltipRole: row.valueKey ? AGNES_TOOLTIP_ROLE : undefined,
    tooltipDefaultValue: row.tooltipDefaultValue,
    searchHints: ['agnes ai api', row.key, ...(row.searchHints || [])],
    details: {
      area: AGNES_API_DOC_AREA,
      responsibility: row.responsibility,
      notes: row.notes || '',
      modules: ['POST /v1/chat/completions'],
      classes: ['Request body'],
      functions: ['Agnes AI Chat Completions API'],
    },
  }))
