import type { VirtualSettingsEntry } from './byteplusSharedTextApiDocs'
import type { SettingMeta } from '@/features/settings/types'
import {
  CHAT_MIROMIND_ENDPOINT_URL,
  CHAT_MIROMIND_MODEL_OPTIONS,
  CHAT_PROVIDER_MIROMIND,
} from '@/lib/chatEndpoint'

export const MIROMIND_API_DOC_AREA = 'MiroMind API'
export const MIROMIND_API_DOCS_URL = 'https://api.miromind.ai/v1/chat/completions'

export { getMiroMindApiRowAnchorId } from './chatApiDocAnchors'

const MIROMIND_TOOLTIP_ROLE = 'MiroMind API'

type MiroMindDocRow = {
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
const MIROMIND_STREAMING_REASONING_OPTIONS = ['delta.reasoning_steps', 'delta.content', 'usage'] as const

const MIROMIND_API_DOC_ROWS: ReadonlyArray<MiroMindDocRow> = [
  {
    key: 'provider',
    typeLabel: 'string',
    valueKey: 'chatProvider',
    value: CHAT_PROVIDER_MIROMIND,
    responsibility: 'Shared chat provider id for MiroMind on the existing FloatingPanel Chat transport path.',
    notes: 'Uses the shared provider/model/auth owner instead of a second assistant runtime.',
    searchHints: ['provider', 'chatProvider', 'miromind'],
  },
  {
    key: 'auth_mode',
    typeLabel: 'enum',
    valueKey: 'chatAuthMode',
    value: 'serverManaged',
    options: CHAT_AUTH_MODE_OPTIONS,
    responsibility: 'Shared auth mode for the upstream MiroMind API key.',
    notes: 'Default server-managed auth uses Cloudflare/dev proxy secrets; BYOK is memory-only and only for explicit user fallback.',
    searchHints: ['auth', 'byok', 'serverManaged'],
    tooltipDefaultValue: 'serverManaged',
  },
  {
    key: 'api_key',
    typeLabel: 'string',
    valueKey: 'chatApiKey',
    value: '',
    responsibility: 'Memory-only BYOK field for MiroMind API access.',
    notes: 'Browser storage must not persist the raw key.',
    searchHints: ['api key', 'bearer', 'MIROMIND_API_KEY'],
    tooltipDefaultValue: '',
  },
  {
    key: 'endpoint_url',
    typeLabel: 'string',
    valueKey: 'chatEndpointUrl',
    value: CHAT_MIROMIND_ENDPOINT_URL,
    responsibility: 'OpenAI-compatible MiroMind chat-completions endpoint routed through the shared chat proxy.',
    searchHints: ['endpoint', 'chat completions', '/v1/chat/completions'],
  },
  {
    key: 'model',
    typeLabel: 'enum',
    valueKey: 'chatModel',
    value: CHAT_MIROMIND_MODEL_OPTIONS[0],
    options: CHAT_MIROMIND_MODEL_OPTIONS,
    responsibility: 'Model id for MiroMind deep-research chat completions.',
    searchHints: ['model', 'mirothinker-1-7-deepresearch-mini', 'mirothinker-1-7-deepresearch'],
    tooltipDefaultValue: CHAT_MIROMIND_MODEL_OPTIONS[0],
  },
  {
    key: 'messages',
    typeLabel: 'array',
    value: '[]',
    responsibility: 'States that MiroMind reuses the canonical agentic-graph chat request message assembly.',
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
    notes: 'Raw SSE parsing preserves MiroMind reasoning_steps and final usage metadata.',
    searchHints: ['stream', 'sse', 'reasoning_steps'],
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
    key: 'mcp_servers',
    typeLabel: 'array',
    value: '[]',
    responsibility: 'Documents the optional provider request field without creating a second MainPanel-to-canvas pipeline.',
    notes: 'Treat as provider capability only; downstream ownership still stays chat -> markdown -> workspace -> canvas.',
    searchHints: ['mcp_servers', 'provider-side mcp', 'optional'],
    tooltipDefaultValue: '[]',
  },
  {
    key: 'streaming.reasoning_steps',
    typeLabel: 'enum',
    value: 'delta.reasoning_steps',
    options: MIROMIND_STREAMING_REASONING_OPTIONS,
    responsibility: 'Documents the additive SSE extensions that the shared raw stream parser can surface.',
    notes: 'Reasoning remains observational metadata and must not directly mutate the graph.',
    searchHints: ['reasoning_steps', 'reasoning_tokens', 'num_search_queries', 'usage'],
    tooltipDefaultValue: 'delta.reasoning_steps',
  },
]

export const MIROMIND_API_DOC_ENTRIES: ReadonlyArray<VirtualSettingsEntry> =
  MIROMIND_API_DOC_ROWS.map(row => ({
    meta: {
      key: `miromindApi.${row.key}`,
      type: toBaseType(row.typeLabel),
      source: row.valueKey ? 'localStorage' : 'backendEnv',
      read: () => row.value ?? 'MiroMind API setting',
      ...(row.options ? { options: [...row.options] } : {}),
    },
    value: row.value ?? 'MiroMind API setting',
    valueKey: row.valueKey,
    typeLabel: row.typeLabel,
    tooltipRole: row.valueKey ? MIROMIND_TOOLTIP_ROLE : undefined,
    tooltipDefaultValue: row.tooltipDefaultValue,
    searchHints: ['miromind api', row.key, ...(row.searchHints || [])],
    details: {
      area: MIROMIND_API_DOC_AREA,
      responsibility: row.responsibility,
      notes: row.notes || '',
      modules: ['POST /v1/chat/completions'],
      classes: ['Request body'],
      functions: ['MiroMind Chat Completions API'],
    },
  }))
