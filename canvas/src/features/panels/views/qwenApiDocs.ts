import type { VirtualSettingsEntry } from './byteplusSharedTextApiDocs'
import type { SettingMeta } from '@/features/settings/types'
import {
  CHAT_PROVIDER_QWEN,
  CHAT_QWEN_ENDPOINT_OPTIONS,
  CHAT_QWEN_ENDPOINT_URL,
  CHAT_QWEN_MODEL_OPTIONS,
} from '@/lib/chatEndpoint'

export const QWEN_API_DOC_AREA = 'Qwen API'
export const QWEN_API_DOCS_URL = 'https://www.alibabacloud.com/help/en/model-studio/compatibility-of-openai-with-dashscope'

export { getQwenApiRowAnchorId } from './chatApiDocAnchors'

const QWEN_TOOLTIP_ROLE = 'Qwen API'

type QwenDocRow = {
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
const QWEN_REGION_OPTIONS = ['Singapore', 'US-Virginia', 'China-Beijing', 'Hong-Kong'] as const
const QWEN_OUTPUT_CONTRACT_OPTIONS = ['frontmatter_agenticOs_markdown', 'markdown', 'json'] as const

const QWEN_API_DOC_ROWS: ReadonlyArray<QwenDocRow> = [
  {
    key: 'provider',
    typeLabel: 'string',
    valueKey: 'chatProvider',
    value: CHAT_PROVIDER_QWEN,
    responsibility: 'Shared chat provider id for Qwen on the existing FloatingPanel Chat transport path.',
    notes: 'Qwen stays on the shared OpenAI-compatible chat-completions path and does not create a second assistant runtime.',
    searchHints: ['provider', 'chatProvider', 'qwen', 'dashscope', 'model studio'],
  },
  {
    key: 'auth_mode',
    typeLabel: 'enum',
    valueKey: 'chatAuthMode',
    value: 'serverManaged',
    options: CHAT_AUTH_MODE_OPTIONS,
    responsibility: 'Shared auth mode for the upstream Qwen API key.',
    notes: 'Default server-managed auth uses Cloudflare/dev proxy secrets; BYOK is memory-only and only for explicit user fallback.',
    searchHints: ['auth', 'byok', 'serverManaged', 'DASHSCOPE_API_KEY'],
    tooltipDefaultValue: 'serverManaged',
  },
  {
    key: 'api_key',
    typeLabel: 'string',
    valueKey: 'chatApiKey',
    value: '',
    responsibility: 'Memory-only BYOK field for Qwen API access.',
    notes: 'Browser storage must not persist the raw key.',
    searchHints: ['api key', 'bearer', 'DASHSCOPE_API_KEY', 'QWEN_API_KEY'],
    tooltipDefaultValue: '',
  },
  {
    key: 'endpoint_url',
    typeLabel: 'enum',
    valueKey: 'chatEndpointUrl',
    value: CHAT_QWEN_ENDPOINT_URL,
    options: CHAT_QWEN_ENDPOINT_OPTIONS,
    responsibility: 'Alibaba Cloud Model Studio OpenAI-compatible chat-completions endpoint routed through the shared chat proxy.',
    searchHints: ['endpoint', 'dashscope', 'compatible-mode', '/compatible-mode/v1/chat/completions'],
    tooltipDefaultValue: CHAT_QWEN_ENDPOINT_URL,
  },
  {
    key: 'region',
    typeLabel: 'enum',
    value: 'Singapore',
    options: QWEN_REGION_OPTIONS,
    responsibility: 'Documents the Model Studio region implied by the selected endpoint URL.',
    notes: 'Endpoint URL remains the source of truth for request routing.',
    searchHints: ['region', 'singapore', 'us virginia', 'china beijing', 'hong kong'],
    tooltipDefaultValue: 'Singapore',
  },
  {
    key: 'model',
    typeLabel: 'enum',
    valueKey: 'chatModel',
    value: CHAT_QWEN_MODEL_OPTIONS[0],
    options: CHAT_QWEN_MODEL_OPTIONS,
    responsibility: 'Model id for Qwen text generation on the shared chat-completions path.',
    searchHints: ['model', 'qwen-plus', 'qwen3-max', 'qwen-flash'],
    tooltipDefaultValue: CHAT_QWEN_MODEL_OPTIONS[0],
  },
  {
    key: 'messages',
    typeLabel: 'array',
    value: '[]',
    responsibility: 'States that Qwen reuses the canonical agentic-graph chat request message assembly.',
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
    notes: 'Qwen stream chunks stay on the shared raw SSE parser and final markdown apply path.',
    searchHints: ['stream', 'sse', 'chat completions'],
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
    key: 'output_contract',
    typeLabel: 'enum',
    value: 'frontmatter_agenticOs_markdown',
    options: QWEN_OUTPUT_CONTRACT_OPTIONS,
    responsibility: 'Pins Qwen to the canonical FloatingPanel Chat -> Workspace -> Source Files -> markdown/frontmatter -> canvas path.',
    notes: 'Do not emit prose wrappers, legacy aliases, duplicate grouping keys, or provider-specific canvas directives.',
    searchHints: ['markdown', 'yaml frontmatter', 'workspace', 'source files', 'storyboard widget', 'storyboard', 'animatic'],
    tooltipDefaultValue: 'frontmatter_agenticOs_markdown',
  },
]

export const QWEN_API_DOC_ENTRIES: ReadonlyArray<VirtualSettingsEntry> =
  QWEN_API_DOC_ROWS.map(row => ({
    meta: {
      key: `qwenApi.${row.key}`,
      type: toBaseType(row.typeLabel),
      source: row.valueKey ? 'localStorage' : 'backendEnv',
      read: () => row.value ?? 'Qwen API setting',
      ...(row.options ? { options: [...row.options] } : {}),
    },
    value: row.value ?? 'Qwen API setting',
    valueKey: row.valueKey,
    typeLabel: row.typeLabel,
    tooltipRole: row.valueKey ? QWEN_TOOLTIP_ROLE : undefined,
    tooltipDefaultValue: row.tooltipDefaultValue,
    searchHints: ['qwen api', 'dashscope', 'alibaba cloud model studio', row.key, ...(row.searchHints || [])],
    details: {
      area: QWEN_API_DOC_AREA,
      responsibility: row.responsibility,
      notes: row.notes || '',
      modules: ['POST /compatible-mode/v1/chat/completions'],
      classes: ['Request body'],
      functions: ['Qwen OpenAI-Compatible Chat Completions API'],
    },
  }))
