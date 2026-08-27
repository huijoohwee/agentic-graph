import type { VirtualSettingsEntry } from './byteplusSharedTextApiDocs'
import type { SettingMeta } from '@/features/settings/types'
import { buildSettingsRowAnchorId } from './settingsRowAnchor'
import {
  CHAT_GEMINI_ENDPOINT_OPTIONS,
  CHAT_GEMINI_ENDPOINT_URL,
  CHAT_GEMINI_MODEL_OPTIONS,
  CHAT_PROVIDER_GEMINI,
} from '@/lib/chatEndpoint'

export const GEMINI_API_DOC_AREA = 'Google Gemini API'
export const GEMINI_API_DOCS_URL = 'https://ai.google.dev/gemini-api/docs/openai'

export const getGeminiApiRowAnchorId = (rowKey: string): string =>
  buildSettingsRowAnchorId('gemini-chat-api-row', rowKey)

const GEMINI_TOOLTIP_ROLE = 'Google Gemini API'
const CHAT_AUTH_MODE_OPTIONS = ['serverManaged', 'byok'] as const
const GEMINI_OUTPUT_CONTRACT_OPTIONS = ['frontmatter_kgc_markdown', 'markdown', 'json'] as const

type GeminiDocRow = {
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

const GEMINI_API_DOC_ROWS: ReadonlyArray<GeminiDocRow> = [
  {
    key: 'provider',
    typeLabel: 'string',
    valueKey: 'chatProvider',
    value: CHAT_PROVIDER_GEMINI,
    responsibility: 'Shared direct Gemini provider id for FloatingPanel Chat, separate from Google Cloud Vertex AI.',
    notes: 'Uses the Gemini API OpenAI-compatible endpoint and does not route through Vertex AI.',
    searchHints: ['provider', 'chatProvider', 'google gemini', 'gemini api', 'direct gemini'],
  },
  {
    key: 'auth_mode',
    typeLabel: 'enum',
    valueKey: 'chatAuthMode',
    value: 'serverManaged',
    options: CHAT_AUTH_MODE_OPTIONS,
    responsibility: 'Selects server-managed Gemini API key injection or memory-only BYOK.',
    notes: 'The server-managed key is AGENTICGRAPH_CHAT_PROXY_GEMINI_API_KEY; BYOK is retained only in memory for an explicit user fallback.',
    searchHints: ['auth', 'byok', 'serverManaged', 'AGENTICGRAPH_CHAT_PROXY_GEMINI_API_KEY'],
    tooltipDefaultValue: 'serverManaged',
  },
  {
    key: 'api_key',
    typeLabel: 'string',
    valueKey: 'chatApiKey',
    value: '',
    responsibility: 'Memory-only BYOK field for a direct Gemini API key.',
    notes: 'The proxy forwards this credential with x-goog-api-key; browser storage must not persist it.',
    searchHints: ['api key', 'x-goog-api-key', 'gemini api key'],
    tooltipDefaultValue: '',
  },
  {
    key: 'endpoint_url',
    typeLabel: 'enum',
    valueKey: 'chatEndpointUrl',
    value: CHAT_GEMINI_ENDPOINT_URL,
    options: CHAT_GEMINI_ENDPOINT_OPTIONS,
    responsibility: 'Gemini API OpenAI-compatible chat-completions endpoint routed through the shared chat proxy.',
    searchHints: ['endpoint', 'generativelanguage.googleapis.com', '/v1beta/openai/chat/completions'],
    tooltipDefaultValue: CHAT_GEMINI_ENDPOINT_URL,
  },
  {
    key: 'model',
    typeLabel: 'enum',
    valueKey: 'chatModel',
    value: CHAT_GEMINI_MODEL_OPTIONS[0],
    options: CHAT_GEMINI_MODEL_OPTIONS,
    responsibility: 'Direct Gemini text model used by the OpenAI-compatible chat-completions request.',
    searchHints: ['model', 'gemini-3-flash-preview', 'gemini'],
    tooltipDefaultValue: CHAT_GEMINI_MODEL_OPTIONS[0],
  },
  {
    key: 'messages',
    typeLabel: 'array',
    valueKey: 'chatMessagesJson',
    value: '[]',
    responsibility: 'Configurable message override for the shared OpenAI-compatible request body.',
    notes: 'Leave empty to use the canonical AgenticGraph chat request message assembly.',
    searchHints: ['messages', 'prompt contract', 'context pack'],
    tooltipDefaultValue: '[]',
  },
  {
    key: 'stream',
    typeLabel: 'boolean',
    valueKey: 'chatStream',
    value: true,
    responsibility: 'Streaming toggle for the shared SSE request path.',
    notes: 'Gemini chunks remain on the shared stream parser and markdown apply path.',
    searchHints: ['stream', 'sse', 'chat completions'],
  },
  {
    key: 'max_tokens',
    typeLabel: 'integer',
    valueKey: 'chatMaxCompletionTokens',
    value: 4000,
    responsibility: 'Completion-token cap for the shared chat-completions request.',
    searchHints: ['max_tokens', 'max completion tokens', 'generation config'],
  },
  {
    key: 'output_contract',
    typeLabel: 'enum',
    value: 'frontmatter_kgc_markdown',
    options: GEMINI_OUTPUT_CONTRACT_OPTIONS,
    responsibility: 'Pins Gemini to the canonical FloatingPanel Chat -> Workspace -> Source Files -> markdown/frontmatter -> canvas path.',
    notes: 'Do not emit prose wrappers, legacy aliases, duplicate grouping keys, or provider-specific canvas directives.',
    searchHints: ['markdown', 'yaml frontmatter', 'workspace', 'source files', 'storyboard widget', 'animatic'],
    tooltipDefaultValue: 'frontmatter_kgc_markdown',
  },
]

export const GEMINI_API_DOC_ENTRIES: ReadonlyArray<VirtualSettingsEntry> =
  GEMINI_API_DOC_ROWS.map(row => ({
    meta: {
      key: `geminiApi.${row.key}`,
      type: toBaseType(row.typeLabel),
      source: row.valueKey ? 'localStorage' : 'backendEnv',
      read: () => row.value ?? 'Google Gemini API setting',
      ...(row.options ? { options: [...row.options] } : {}),
    },
    value: row.value ?? 'Google Gemini API setting',
    valueKey: row.valueKey,
    typeLabel: row.typeLabel,
    tooltipRole: row.valueKey ? GEMINI_TOOLTIP_ROLE : undefined,
    tooltipDefaultValue: row.tooltipDefaultValue,
    searchHints: ['google gemini api', 'gemini api', 'direct gemini', row.key, ...(row.searchHints || [])],
    details: {
      area: GEMINI_API_DOC_AREA,
      responsibility: row.responsibility,
      notes: row.notes || '',
      modules: ['POST /v1beta/openai/chat/completions'],
      classes: ['Request body'],
      functions: ['Gemini API OpenAI-Compatible Chat Completions API'],
    },
  }))
