import type { VirtualSettingsEntry } from './byteplusSharedTextApiDocs'
import type { SettingMeta } from '@/features/settings/types'
import {
  CHAT_GOOGLE_CLOUD_ENDPOINT_OPTIONS,
  CHAT_GOOGLE_CLOUD_ENDPOINT_URL,
  CHAT_GOOGLE_CLOUD_LOCATION_DEFAULT,
  CHAT_GOOGLE_CLOUD_MODEL_OPTIONS,
  CHAT_GOOGLE_CLOUD_PROJECT_PLACEHOLDER,
  CHAT_PROVIDER_GOOGLE_CLOUD,
} from '@/lib/chatEndpoint'

export const GOOGLE_CLOUD_API_DOC_AREA = 'Google Cloud Vertex AI API'
export const GOOGLE_CLOUD_API_DOCS_URL = 'https://cloud.google.com/vertex-ai/generative-ai/docs/model-reference/gemini'

export { getGoogleCloudApiRowAnchorId } from './chatApiDocAnchors'

const GOOGLE_CLOUD_TOOLTIP_ROLE = 'Google Cloud Vertex AI API'

type GoogleCloudDocRow = {
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
const GOOGLE_CLOUD_LOCATION_OPTIONS = ['us-central1', 'global', 'europe-west4', 'asia-southeast1'] as const
const GOOGLE_CLOUD_OUTPUT_CONTRACT_OPTIONS = ['frontmatter_kgc_markdown', 'markdown', 'json'] as const

const GOOGLE_CLOUD_API_DOC_ROWS: ReadonlyArray<GoogleCloudDocRow> = [
  {
    key: 'provider',
    typeLabel: 'string',
    valueKey: 'chatProvider',
    value: CHAT_PROVIDER_GOOGLE_CLOUD,
    responsibility: 'Shared chat provider id for Google Cloud Vertex AI on the existing FloatingPanel Chat transport path.',
    notes: 'Uses Vertex AI OpenAI-compatible endpoints/openapi instead of a provider-specific assistant runtime.',
    searchHints: ['provider', 'chatProvider', 'google cloud', 'vertex ai', 'gcp', 'gemini'],
  },
  {
    key: 'auth_mode',
    typeLabel: 'enum',
    valueKey: 'chatAuthMode',
    value: 'serverManaged',
    options: CHAT_AUTH_MODE_OPTIONS,
    responsibility: 'Shared auth mode for the upstream Google Cloud access token.',
    notes: 'Default server-managed auth uses Cloudflare/dev proxy secrets; BYOK stores the OAuth access token in memory only and only for explicit user fallback.',
    searchHints: ['auth', 'byok', 'serverManaged', 'GOOGLE_CLOUD_ACCESS_TOKEN', 'VERTEX_AI_ACCESS_TOKEN'],
    tooltipDefaultValue: 'serverManaged',
  },
  {
    key: 'api_key',
    typeLabel: 'string',
    valueKey: 'chatApiKey',
    value: '',
    responsibility: 'Memory-only BYOK field for a Google Cloud OAuth access token used as the OpenAI-compatible bearer token.',
    notes: 'Browser storage must not persist the raw token.',
    searchHints: ['access token', 'bearer', 'api key', 'GOOGLE_CLOUD_ACCESS_TOKEN', 'VERTEX_AI_ACCESS_TOKEN'],
    tooltipDefaultValue: '',
  },
  {
    key: 'project_id',
    typeLabel: 'string',
    value: CHAT_GOOGLE_CLOUD_PROJECT_PLACEHOLDER,
    responsibility: 'Google Cloud project id segment for the Vertex AI OpenAI-compatible endpoint path.',
    notes: 'Update the endpoint_url row with the same project id before sending requests.',
    searchHints: ['project id', 'gcp project', 'vertex ai project'],
    tooltipDefaultValue: CHAT_GOOGLE_CLOUD_PROJECT_PLACEHOLDER,
  },
  {
    key: 'location',
    typeLabel: 'enum',
    value: CHAT_GOOGLE_CLOUD_LOCATION_DEFAULT,
    options: GOOGLE_CLOUD_LOCATION_OPTIONS,
    responsibility: 'Vertex AI location segment for the OpenAI-compatible endpoint path.',
    notes: 'Endpoint URL remains the source of truth for request routing.',
    searchHints: ['location', 'region', 'us-central1', 'global', 'europe-west4', 'asia-southeast1'],
    tooltipDefaultValue: CHAT_GOOGLE_CLOUD_LOCATION_DEFAULT,
  },
  {
    key: 'endpoint_url',
    typeLabel: 'enum',
    valueKey: 'chatEndpointUrl',
    value: CHAT_GOOGLE_CLOUD_ENDPOINT_URL,
    options: CHAT_GOOGLE_CLOUD_ENDPOINT_OPTIONS,
    responsibility: 'Vertex AI OpenAI-compatible chat-completions endpoint routed through the shared chat proxy.',
    searchHints: ['endpoint', 'openapi', 'aiplatform.googleapis.com', '/endpoints/openapi/chat/completions'],
    tooltipDefaultValue: CHAT_GOOGLE_CLOUD_ENDPOINT_URL,
  },
  {
    key: 'model',
    typeLabel: 'enum',
    valueKey: 'chatModel',
    value: CHAT_GOOGLE_CLOUD_MODEL_OPTIONS[0],
    options: CHAT_GOOGLE_CLOUD_MODEL_OPTIONS,
    responsibility: 'Model id for Vertex AI Gemini text generation on the OpenAI-compatible chat-completions path.',
    searchHints: ['model', 'google/gemini-2.0-flash-001', 'gemini', 'vertex ai'],
    tooltipDefaultValue: CHAT_GOOGLE_CLOUD_MODEL_OPTIONS[0],
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
    notes: 'Google Cloud stream chunks stay on the shared raw SSE parser and final markdown apply path.',
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
    options: GOOGLE_CLOUD_OUTPUT_CONTRACT_OPTIONS,
    responsibility: 'Pins Google Cloud to the canonical FloatingPanel Chat -> Workspace -> Source Files -> markdown/frontmatter -> canvas path.',
    notes: 'Do not emit prose wrappers, legacy aliases, duplicate grouping keys, or provider-specific canvas directives.',
    searchHints: ['markdown', 'yaml frontmatter', 'workspace', 'source files', 'storyboard widget', 'storyboard', 'animatic'],
    tooltipDefaultValue: 'frontmatter_kgc_markdown',
  },
]

export const GOOGLE_CLOUD_API_DOC_ENTRIES: ReadonlyArray<VirtualSettingsEntry> =
  GOOGLE_CLOUD_API_DOC_ROWS.map(row => ({
    meta: {
      key: `googleCloudApi.${row.key}`,
      type: toBaseType(row.typeLabel),
      source: row.valueKey ? 'localStorage' : 'backendEnv',
      read: () => row.value ?? 'Google Cloud API setting',
      ...(row.options ? { options: [...row.options] } : {}),
    },
    value: row.value ?? 'Google Cloud API setting',
    valueKey: row.valueKey,
    typeLabel: row.typeLabel,
    tooltipRole: row.valueKey ? GOOGLE_CLOUD_TOOLTIP_ROLE : undefined,
    tooltipDefaultValue: row.tooltipDefaultValue,
    searchHints: ['google cloud api', 'vertex ai', 'gemini', 'gcp', row.key, ...(row.searchHints || [])],
    details: {
      area: GOOGLE_CLOUD_API_DOC_AREA,
      responsibility: row.responsibility,
      notes: row.notes || '',
      modules: ['POST /v1/projects/{project}/locations/{location}/endpoints/openapi/chat/completions'],
      classes: ['Request body'],
      functions: ['Vertex AI OpenAI-Compatible Chat Completions API'],
    },
  }))
