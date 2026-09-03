import type { VirtualSettingsEntry } from './byteplusSharedTextApiDocs'
import type { SettingMeta } from '@/features/settings/types'
import {
  CHAT_SEALION_BASE,
  CHAT_SEALION_ENDPOINT_URL,
  CHAT_SEALION_MODEL_OPTIONS,
  CHAT_PROVIDER_SEALION,
} from '@/lib/chatEndpoint'

export const SEALION_API_DOC_AREA = 'AI Singapore SEA-LION API'
export const SEALION_API_DOCS_URL = 'https://docs.sea-lion.ai/guides/inferencing/api.md'
export const SEALION_MCP_SERVER_URL = 'https://api.sea-lion.ai/mcp/sealion'
export const SEALION_EMBEDDINGS_ENDPOINT_URL = `${CHAT_SEALION_BASE}/v1/embeddings`
export const SEALION_API_KEY_ENV = 'AGENTIC_OS_CHAT_PROXY_SEALION_API_KEY'

export { getSealionApiRowAnchorId } from './chatApiDocAnchors'

type SealionDocRow = {
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

const CHAT_AUTH_MODE_OPTIONS = ['serverManaged', 'byok'] as const
const SEALION_USE_CASE_OPTIONS = ['chat_completion', 'tool_calling', 'reasoning_thinking_mode', 'safety_check', 'embedding'] as const
const SEALION_DISTRIBUTION_OPTIONS = ['hosted_api', 'mcp_sidecar', 'ollama', 'workers_ai', 'vllm', 'tgi'] as const

const toBaseType = (typeLabel: string): SettingMeta['type'] => {
  const normalized = String(typeLabel || '').trim().toLowerCase()
  if (normalized.includes('boolean')) return 'boolean'
  if (normalized.includes('integer') || normalized.includes('float') || normalized.includes('number')) return 'number'
  if (normalized.includes('object') || normalized.includes('[]') || normalized.includes('array')) return 'json'
  return 'string'
}

const SEALION_API_DOC_ROWS: ReadonlyArray<SealionDocRow> = [
  {
    key: 'provider',
    typeLabel: 'string',
    valueKey: 'chatProvider',
    value: CHAT_PROVIDER_SEALION,
    responsibility: 'Shared chat provider id for the hosted SEA-LION API on the existing FloatingPanel Chat transport path.',
    notes: 'SEA-LION API is OpenAI-compatible for chat completions; it remains an optional regional specialist provider and does not replace parser, renderer, memory, or graph-apply owners.',
    searchHints: ['provider', 'chatProvider', 'sea-lion', 'sealion', 'aisingapore'],
  },
  {
    key: 'auth_mode',
    typeLabel: 'enum',
    valueKey: 'chatAuthMode',
    value: 'serverManaged',
    options: CHAT_AUTH_MODE_OPTIONS,
    responsibility: 'Shared auth mode for the upstream SEA-LION API key created in SEA-LION Playground.',
    notes: 'Default server-managed auth uses host proxy secrets; BYOK is memory-only and must be explicit. The upstream docs allow one API key per user.',
    searchHints: ['auth', 'byok', 'serverManaged', 'playground', 'API Key Manager', SEALION_API_KEY_ENV],
    tooltipDefaultValue: 'serverManaged',
  },
  {
    key: 'api_key',
    typeLabel: 'string',
    valueKey: 'chatApiKey',
    value: '',
    responsibility: 'Memory-only BYOK field for SEA-LION hosted API access.',
    notes: `Server Managed Key env: ${SEALION_API_KEY_ENV}. Never persist raw keys in localStorage, markdown, fixtures, tests, or source.`,
    searchHints: ['api key', 'bearer', SEALION_API_KEY_ENV],
    tooltipDefaultValue: '',
  },
  {
    key: 'endpoint_url',
    typeLabel: 'string',
    valueKey: 'chatEndpointUrl',
    value: CHAT_SEALION_ENDPOINT_URL,
    responsibility: 'OpenAI-compatible SEA-LION `/v1/chat/completions` endpoint routed through the shared chat proxy.',
    searchHints: ['endpoint', 'base_url', 'chat completions', CHAT_SEALION_BASE, '/v1/chat/completions'],
  },
  {
    key: 'model',
    typeLabel: 'enum',
    valueKey: 'chatModel',
    value: CHAT_SEALION_MODEL_OPTIONS[0],
    options: CHAT_SEALION_MODEL_OPTIONS,
    responsibility: 'Hosted SEA-LION chat-completions model id for Southeast Asian multilingual, tool-use, reasoning, or safety tasks.',
    searchHints: ['model', 'Qwen-SEA-LION-v4.5-27B-IT', 'Gemma-SEA-LION-v4.5-E2B-IT', 'Llama-SEA-LION-v3.5-70B-R', 'SEA-Guard'],
    tooltipDefaultValue: CHAT_SEALION_MODEL_OPTIONS[0],
  },
  {
    key: 'models_endpoint_url',
    typeLabel: 'url',
    value: `${CHAT_SEALION_BASE}/v1/models`,
    responsibility: 'Hosted SEA-LION models endpoint for listing models available to the configured API key.',
    notes: 'Use server-side bearer auth through the shared proxy path; do not expose the operator key in browser state.',
    searchHints: ['models', '/v1/models', 'available models', 'Authorization Bearer'],
    tooltipDefaultValue: `${CHAT_SEALION_BASE}/v1/models`,
  },
  {
    key: 'embeddings_endpoint_url',
    typeLabel: 'url',
    value: SEALION_EMBEDDINGS_ENDPOINT_URL,
    responsibility: 'Hosted SEA-LION `/v1/embeddings` endpoint for `SEA-LION-ModernBERT-Embedding-600M`.',
    notes: 'The API doc describes 1024-dimensional embeddings across 11 Southeast Asian languages with an 8k token context window.',
    searchHints: ['embeddings', 'ModernBERT', '1024', '11 Southeast Asian languages', '8k token context'],
    tooltipDefaultValue: SEALION_EMBEDDINGS_ENDPOINT_URL,
  },
  {
    key: 'embedding_model',
    typeLabel: 'string',
    value: 'aisingapore/SEA-LION-ModernBERT-Embedding-600M',
    responsibility: 'Hosted SEA-LION embedding model id for semantic similarity and retrieval workloads outside the chat-completions path.',
    notes: 'Keep embeddings routed through `/v1/embeddings`; do not offer this value as the default chat-completions model.',
    searchHints: ['embedding model', 'SEA-LION-ModernBERT-Embedding-600M', 'semantic similarity', 'retrieval'],
    tooltipDefaultValue: 'aisingapore/SEA-LION-ModernBERT-Embedding-600M',
  },
  {
    key: 'mcp.server_url',
    typeLabel: 'url',
    value: SEALION_MCP_SERVER_URL,
    responsibility: 'Hosted MCP sidecar URL for variant detection, translation/localization, and safety classification.',
    notes: 'Use as a specialist sidecar when SEA language, regional localization, or regional safety is the bottleneck.',
    searchHints: ['mcp', 'sidecar', 'detect_language_variant', 'translate', 'localize', 'safety_check'],
    tooltipDefaultValue: SEALION_MCP_SERVER_URL,
  },
  {
    key: 'routing_policy',
    typeLabel: 'enum',
    value: 'detect_language_variant',
    options: SEALION_USE_CASE_OPTIONS,
    responsibility: 'Routing policy -> use hosted SEA-LION chat, tool calling, reasoning, SEA-Guard safety, or embeddings based on workload -> keep general reasoning provider-neutral.',
    notes: 'The API doc covers v4.5 function calling, v3.5 `thinking_mode`, SEA-Guard safety classification, and embeddings; public or high-stakes decisions still need review.',
    searchHints: ['routing policy', 'tool_choice', 'thinking_mode', 'safety', 'SEA-Guard', 'embedding'],
    tooltipDefaultValue: 'chat_completion',
  },
  {
    key: 'distribution',
    typeLabel: 'enum',
    value: 'hosted_api',
    options: SEALION_DISTRIBUTION_OPTIONS,
    responsibility: 'Distribution mode -> document hosted API, MCP, local Ollama/vLLM/TGI, and Workers AI options -> keep runtime provider-agnostic.',
    notes: 'The hosted API is the canonical MainPanel Integrations default; local/self-hosted routes should use the same OpenAI-compatible endpoint setting without committed models or validation payloads.',
    searchHints: ['hosted api', 'ollama', 'workers ai', 'vllm', 'tgi', 'Cloudflare'],
    tooltipDefaultValue: 'hosted_api',
  },
  {
    key: 'docs_url',
    typeLabel: 'url',
    value: SEALION_API_DOCS_URL,
    responsibility: 'Official SEA-LION inferencing API documentation for keys, models, chat completions, tool use, reasoning, guard, embeddings, and rate limits.',
    notes: 'Model license terms can vary by underlying base model; use the specific model card for release-specific license decisions.',
    searchHints: ['docs', 'inferencing', 'api.md', 'chat completions', 'tool use', 'rate limits'],
    tooltipDefaultValue: SEALION_API_DOCS_URL,
  },
  {
    key: 'rate_limit.rpm_per_user',
    typeLabel: 'integer',
    value: 10,
    responsibility: 'Document the hosted SEA-LION API request-per-minute limit for operator TCO and throttling expectations.',
    notes: 'Official API doc states 10 requests per minute per user as of 04 Jun 2026; contact sealion@aisingapore.org for increases.',
    searchHints: ['rate limit', 'RPM', '10 requests per minute', '04 Jun 2026', 'sealion@aisingapore.org'],
    tooltipDefaultValue: 10,
  },
  {
    key: 'cloudflare.workers_ai_model',
    typeLabel: 'string',
    value: '@cf/aisingapore/gemma-sea-lion-v4-27b-it',
    responsibility: 'Workers AI reference model id -> expose a zero-key Cloudflare option for operator review -> avoid hardcoding runtime dispatch.',
    notes: 'This row is documentation-only in Dev; deploying or changing Cloudflare runtime remains operator-gated.',
    searchHints: ['Cloudflare Workers AI', '@cf/aisingapore/gemma-sea-lion-v4-27b-it'],
    tooltipDefaultValue: '@cf/aisingapore/gemma-sea-lion-v4-27b-it',
  },
]

export const SEALION_API_DOC_ENTRIES: ReadonlyArray<VirtualSettingsEntry> =
  SEALION_API_DOC_ROWS.map(row => ({
    meta: {
      key: `sealionApi.${row.key}`,
      type: toBaseType(row.typeLabel),
      source: row.valueKey ? 'localStorage' : 'backendEnv',
      read: () => row.value ?? 'SEA-LION API setting',
      ...(row.options ? { options: [...row.options] } : {}),
    },
    value: row.value ?? 'SEA-LION API setting',
    valueKey: row.valueKey,
    typeLabel: row.typeLabel,
    tooltipRole: row.valueKey ? SEALION_API_DOC_AREA : undefined,
    tooltipDefaultValue: row.tooltipDefaultValue,
    searchHints: ['AI Singapore SEA-LION API', 'sealion', 'sea-lion', row.key, ...(row.searchHints || [])],
    details: {
      area: SEALION_API_DOC_AREA,
      responsibility: row.responsibility,
      notes: row.notes || '',
      modules: ['canvas/src/features/panels/views/sealionApiDocs.ts', 'POST /v1/chat/completions'],
      classes: ['Request body', 'Regional specialist sidecar'],
      functions: ['SEA-LION Chat Completions API'],
    },
  }))
