import { coerceHttpUrl } from '@/lib/url'
import {
  CHAT_AGNES_MODEL_OPTIONS,
  CHAT_SEALION_MODEL_OPTIONS,
  CHAT_BYTEPLUS_IMAGE_MODEL_DEFAULT,
  CHAT_BYTEPLUS_IMAGE_MODEL_OPTIONS,
  CHAT_BYTEPLUS_MODEL_OPTIONS,
  CHAT_BYTEPLUS_TEXT_MODEL_DEFAULT,
  CHAT_BYTEPLUS_TEXT_MODEL_OPTIONS,
  CHAT_BYTEPLUS_VIDEO_MODEL_DEFAULT,
  CHAT_BYTEPLUS_VIDEO_MODEL_OPTIONS,
  CHAT_DEERFLOW_MODEL_OPTIONS,
  CHAT_DEFAULT_MODEL,
  CHAT_GEMINI_MODEL_OPTIONS,
  CHAT_GEMINI_TEXT_MODEL_DEFAULT,
  CHAT_GEMINI_VIDEO_MODEL_DEFAULT,
  CHAT_GOOGLE_CLOUD_MODEL_OPTIONS,
  CHAT_LOCAL_DEFAULT_MODEL,
  CHAT_LOCAL_MODEL_OPTIONS,
  CHAT_MIROMIND_MODEL_OPTIONS,
  CHAT_MODEL_ID_BY_INPUT_VARIANT,
  CHAT_OPENAI_MODEL_OPTIONS,
  CHAT_QWEN_MODEL_OPTIONS,
  CHAT_SHARED_MODEL_CATALOG_OPTIONS,
} from '@/lib/chatEndpointModels'
export {
  CHAT_AGNES_MODEL_OPTIONS,
  CHAT_SEALION_MODEL_OPTIONS,
  CHAT_BYTEPLUS_IMAGE_MODEL_DEFAULT,
  CHAT_BYTEPLUS_IMAGE_MODEL_OPTIONS,
  CHAT_BYTEPLUS_MODEL_OPTIONS,
  CHAT_BYTEPLUS_TEXT_MODEL_DEFAULT,
  CHAT_BYTEPLUS_TEXT_MODEL_OPTIONS,
  CHAT_BYTEPLUS_VIDEO_MODEL_DEFAULT,
  CHAT_BYTEPLUS_VIDEO_MODEL_OPTIONS,
  CHAT_DEERFLOW_MODEL_OPTIONS,
  CHAT_DEFAULT_MODEL,
  CHAT_GEMINI_MODEL_OPTIONS,
  CHAT_GEMINI_TEXT_MODEL_DEFAULT,
  CHAT_GEMINI_TEXT_MODEL_OPTIONS,
  CHAT_GEMINI_VIDEO_MODEL_DEFAULT,
  CHAT_GEMINI_VIDEO_MODEL_OPTIONS,
  CHAT_GOOGLE_CLOUD_MODEL_OPTIONS,
  CHAT_LOCAL_DEFAULT_MODEL,
  CHAT_LOCAL_MODEL_OPTIONS,
  CHAT_MIROMIND_MODEL_OPTIONS,
  CHAT_OPENAI_MODEL_OPTIONS,
  CHAT_QWEN_MODEL_OPTIONS,
} from '@/lib/chatEndpointModels'

export const CHAT_PROXY_PATH_PREFIX = '/__chat_proxy'
export const CHAT_BINARY_DOWNLOAD_PROXY_PATH = '/__chat_asset_proxy'
export const CHAT_COMPLETIONS_PATH = '/v1/chat/completions'
export const CHAT_BYTEPLUS_COMPLETIONS_PATH = '/api/v3/chat/completions'
export const CHAT_BYTEPLUS_IMAGES_GENERATIONS_PATH = '/api/v3/images/generations'
export const CHAT_BYTEPLUS_CONTENT_GENERATIONS_TASKS_PATH = '/api/v3/contents/generations/tasks'
export const CHAT_OPENAI_RESPONSES_PATH = '/v1/responses'
export const CHAT_DEERFLOW_CHAT_COMPLETIONS_PATH = '/api/llm/chat/completions'
export const CHAT_BYTEPLUS_AP_SOUTHEAST_HOST = 'ark.ap-southeast.bytepluses.com'
export const CHAT_BYTEPLUS_EU_WEST_HOST = 'ark.eu-west.bytepluses.com'
export const CHAT_OPENAI_HOST = 'api.openai.com'
export const CHAT_MIROMIND_HOST = 'api.miromind.ai'
export const CHAT_AGNES_HOST = 'apihub.agnes-ai.com'
export const CHAT_SEALION_HOST = 'api.sea-lion.ai'
export const CHAT_QWEN_SINGAPORE_HOST = 'dashscope-intl.aliyuncs.com'
export const CHAT_QWEN_US_VIRGINIA_HOST = 'dashscope-us.aliyuncs.com'
export const CHAT_QWEN_CHINA_BEIJING_HOST = 'dashscope.aliyuncs.com'
export const CHAT_QWEN_HONG_KONG_HOST = 'cn-hongkong.dashscope.aliyuncs.com'
export const CHAT_GOOGLE_CLOUD_GLOBAL_HOST = 'aiplatform.googleapis.com'
export const CHAT_GOOGLE_CLOUD_US_CENTRAL1_HOST = 'us-central1-aiplatform.googleapis.com'
export const CHAT_GOOGLE_CLOUD_EUROPE_WEST4_HOST = 'europe-west4-aiplatform.googleapis.com'
export const CHAT_GOOGLE_CLOUD_ASIA_SOUTHEAST1_HOST = 'asia-southeast1-aiplatform.googleapis.com'
export const CHAT_DEERFLOW_LOCAL_HOST = 'localhost'
export const CHAT_GEMINI_HOST = 'generativelanguage.googleapis.com'
export const CHAT_BYTEPLUS_AP_SOUTHEAST_BASE = `https://${CHAT_BYTEPLUS_AP_SOUTHEAST_HOST}`
export const CHAT_BYTEPLUS_EU_WEST_BASE = `https://${CHAT_BYTEPLUS_EU_WEST_HOST}`
export const CHAT_OPENAI_BASE = `https://${CHAT_OPENAI_HOST}`
export const CHAT_MIROMIND_BASE = `https://${CHAT_MIROMIND_HOST}`
export const CHAT_AGNES_BASE = `https://${CHAT_AGNES_HOST}`
export const CHAT_SEALION_BASE = `https://${CHAT_SEALION_HOST}`
export const CHAT_QWEN_BASE = `https://${CHAT_QWEN_SINGAPORE_HOST}`
export const CHAT_QWEN_US_VIRGINIA_BASE = `https://${CHAT_QWEN_US_VIRGINIA_HOST}`
export const CHAT_QWEN_CHINA_BEIJING_BASE = `https://${CHAT_QWEN_CHINA_BEIJING_HOST}`
export const CHAT_QWEN_HONG_KONG_BASE = `https://${CHAT_QWEN_HONG_KONG_HOST}`
export const CHAT_GOOGLE_CLOUD_GLOBAL_BASE = `https://${CHAT_GOOGLE_CLOUD_GLOBAL_HOST}`
export const CHAT_GOOGLE_CLOUD_US_CENTRAL1_BASE = `https://${CHAT_GOOGLE_CLOUD_US_CENTRAL1_HOST}`
export const CHAT_GOOGLE_CLOUD_EUROPE_WEST4_BASE = `https://${CHAT_GOOGLE_CLOUD_EUROPE_WEST4_HOST}`
export const CHAT_GOOGLE_CLOUD_ASIA_SOUTHEAST1_BASE = `https://${CHAT_GOOGLE_CLOUD_ASIA_SOUTHEAST1_HOST}`
export const CHAT_DEERFLOW_LOCAL_BASE = 'http://localhost:8001'
export const CHAT_GEMINI_BASE = `https://${CHAT_GEMINI_HOST}`
export const CHAT_GEMINI_VIDEOS_PATH = '/v1beta/models/{model}:predictLongRunning'
export const CHAT_GEMINI_OPENAI_CHAT_PATH = '/v1beta/openai/chat/completions'
export const CHAT_GOOGLE_CLOUD_PROJECT_PLACEHOLDER = 'PROJECT_ID'
export const CHAT_GOOGLE_CLOUD_LOCATION_DEFAULT = 'us-central1'
export const CHAT_GOOGLE_CLOUD_OPENAPI_CHAT_COMPLETIONS_PATH = `/v1/projects/${CHAT_GOOGLE_CLOUD_PROJECT_PLACEHOLDER}/locations/${CHAT_GOOGLE_CLOUD_LOCATION_DEFAULT}/endpoints/openapi/chat/completions`
export const CHAT_QWEN_COMPATIBLE_MODE_PATH = '/compatible-mode/v1'
export const CHAT_QWEN_CHAT_COMPLETIONS_PATH = `${CHAT_QWEN_COMPATIBLE_MODE_PATH}/chat/completions`
export const CHAT_QWEN_MODELS_PATH = `${CHAT_QWEN_COMPATIBLE_MODE_PATH}/models`
export const CHAT_BYTEPLUS_AP_SOUTHEAST_ENDPOINT_URL = `${CHAT_BYTEPLUS_AP_SOUTHEAST_BASE}${CHAT_BYTEPLUS_COMPLETIONS_PATH}`
export const CHAT_BYTEPLUS_EU_WEST_ENDPOINT_URL = `${CHAT_BYTEPLUS_EU_WEST_BASE}${CHAT_BYTEPLUS_COMPLETIONS_PATH}`
export const CHAT_OPENAI_ENDPOINT_URL = `${CHAT_OPENAI_BASE}${CHAT_OPENAI_RESPONSES_PATH}`
export const CHAT_MIROMIND_ENDPOINT_URL = `${CHAT_MIROMIND_BASE}${CHAT_COMPLETIONS_PATH}`
export const CHAT_AGNES_ENDPOINT_URL = `${CHAT_AGNES_BASE}${CHAT_COMPLETIONS_PATH}`
export const CHAT_SEALION_ENDPOINT_URL = `${CHAT_SEALION_BASE}${CHAT_COMPLETIONS_PATH}`
export const CHAT_QWEN_ENDPOINT_URL = `${CHAT_QWEN_BASE}${CHAT_QWEN_CHAT_COMPLETIONS_PATH}`
export const CHAT_GEMINI_ENDPOINT_URL = `${CHAT_GEMINI_BASE}${CHAT_GEMINI_OPENAI_CHAT_PATH}`
export const CHAT_GEMINI_ENDPOINT_OPTIONS = [CHAT_GEMINI_ENDPOINT_URL] as const
export const CHAT_QWEN_ENDPOINT_OPTIONS = [
  CHAT_QWEN_ENDPOINT_URL,
  `${CHAT_QWEN_US_VIRGINIA_BASE}${CHAT_QWEN_CHAT_COMPLETIONS_PATH}`,
  `${CHAT_QWEN_CHINA_BEIJING_BASE}${CHAT_QWEN_CHAT_COMPLETIONS_PATH}`,
  `${CHAT_QWEN_HONG_KONG_BASE}${CHAT_QWEN_CHAT_COMPLETIONS_PATH}`,
] as const
export const CHAT_GOOGLE_CLOUD_ENDPOINT_URL = `${CHAT_GOOGLE_CLOUD_US_CENTRAL1_BASE}${CHAT_GOOGLE_CLOUD_OPENAPI_CHAT_COMPLETIONS_PATH}`
export const CHAT_GOOGLE_CLOUD_ENDPOINT_OPTIONS = [
  CHAT_GOOGLE_CLOUD_ENDPOINT_URL,
  `${CHAT_GOOGLE_CLOUD_GLOBAL_BASE}/v1/projects/${CHAT_GOOGLE_CLOUD_PROJECT_PLACEHOLDER}/locations/global/endpoints/openapi/chat/completions`,
  `${CHAT_GOOGLE_CLOUD_EUROPE_WEST4_BASE}/v1/projects/${CHAT_GOOGLE_CLOUD_PROJECT_PLACEHOLDER}/locations/europe-west4/endpoints/openapi/chat/completions`,
  `${CHAT_GOOGLE_CLOUD_ASIA_SOUTHEAST1_BASE}/v1/projects/${CHAT_GOOGLE_CLOUD_PROJECT_PLACEHOLDER}/locations/asia-southeast1/endpoints/openapi/chat/completions`,
] as const
export const CHAT_DEERFLOW_ENDPOINT_URL = `${CHAT_DEERFLOW_LOCAL_BASE}${CHAT_DEERFLOW_CHAT_COMPLETIONS_PATH}`
export const CHAT_PROVIDER_OPENAI = 'openai'
export const CHAT_PROVIDER_MIROMIND = 'miromind'
export const CHAT_PROVIDER_AGNES = 'agnes-ai'
export const CHAT_PROVIDER_SEALION = 'sealion'
export const CHAT_PROVIDER_QWEN = 'qwen'
export const CHAT_PROVIDER_GOOGLE_CLOUD = 'google-cloud'
export const CHAT_PROVIDER_BYTEPLUS = 'byteplus-modelark'
export const CHAT_PROVIDER_DEERFLOW = 'deerflow'
export const CHAT_PROVIDER_LM_STUDIO = 'lmstudio-local'
export const CHAT_PROVIDER_GEMINI = 'gemini'
export const CHAT_PROVIDER_OPTIONS = [CHAT_PROVIDER_OPENAI, CHAT_PROVIDER_MIROMIND, CHAT_PROVIDER_AGNES, CHAT_PROVIDER_SEALION, CHAT_PROVIDER_QWEN, CHAT_PROVIDER_GOOGLE_CLOUD, CHAT_PROVIDER_BYTEPLUS, CHAT_PROVIDER_DEERFLOW, CHAT_PROVIDER_LM_STUDIO, CHAT_PROVIDER_GEMINI] as const
export type ChatProviderId = (typeof CHAT_PROVIDER_OPTIONS)[number]
export const CHAT_DEFAULT_PROVIDER: ChatProviderId = CHAT_PROVIDER_BYTEPLUS
export const CHAT_DEFAULT_ENDPOINT_URL = CHAT_OPENAI_ENDPOINT_URL
export const CHAT_PROXY_AI_GATEWAY_ROUTE_HEADER = 'X-KG-AI-Gateway-Route'
export const CHAT_PROXY_AI_GATEWAY_METADATA_HEADER = 'X-KG-AI-Gateway-Metadata'
export const CHAT_PROXY_AI_GATEWAY_CACHE_TTL_HEADER = 'X-KG-AI-Gateway-Cache-TTL'
const CHAT_PROVIDER_LABELS: Record<ChatProviderId, string> = {
  [CHAT_PROVIDER_BYTEPLUS]: 'BytePlus ModelArk',
  [CHAT_PROVIDER_DEERFLOW]: 'DeerFlow Gateway',
  [CHAT_PROVIDER_MIROMIND]: 'MiroMind API',
  [CHAT_PROVIDER_AGNES]: 'Agnes AI API',
  [CHAT_PROVIDER_SEALION]: 'AI Singapore SEA-LION API',
  [CHAT_PROVIDER_QWEN]: 'Qwen API',
  [CHAT_PROVIDER_GOOGLE_CLOUD]: 'Google Cloud Vertex AI',
  [CHAT_PROVIDER_OPENAI]: 'OpenAI',
  [CHAT_PROVIDER_LM_STUDIO]: 'Local Gateway',
  [CHAT_PROVIDER_GEMINI]: 'Google Gemini',
}

export const chatProviderRequiresApiKey = (provider: unknown): boolean => {
  const normalizedProvider = normalizeChatProviderId(provider)
  return normalizedProvider === CHAT_PROVIDER_OPENAI
    || normalizedProvider === CHAT_PROVIDER_MIROMIND
    || normalizedProvider === CHAT_PROVIDER_AGNES
    || normalizedProvider === CHAT_PROVIDER_SEALION
    || normalizedProvider === CHAT_PROVIDER_QWEN
    || normalizedProvider === CHAT_PROVIDER_GOOGLE_CLOUD
    || normalizedProvider === CHAT_PROVIDER_BYTEPLUS
    || normalizedProvider === CHAT_PROVIDER_GEMINI
}

const toCleanInput = (value: unknown): string => {
  if (typeof value !== 'string') return ''
  return value.trim()
}

const hostMatches = (hostname: string, hosts: readonly string[]): boolean => hosts.includes(String(hostname || '').toLowerCase())
const isLocalHost = (hostname: string): boolean => hostMatches(hostname, ['localhost', '127.0.0.1', '0.0.0.0'])
const isTrustedOpenAiHost = (hostname: string): boolean => hostMatches(hostname, [CHAT_OPENAI_HOST])
const isTrustedMiroMindHost = (hostname: string): boolean => hostMatches(hostname, [CHAT_MIROMIND_HOST])
const isTrustedAgnesHost = (hostname: string): boolean => hostMatches(hostname, [CHAT_AGNES_HOST])
const isTrustedSealionHost = (hostname: string): boolean => hostMatches(hostname, [CHAT_SEALION_HOST])
const isTrustedQwenHost = (hostname: string): boolean => hostMatches(hostname, [CHAT_QWEN_SINGAPORE_HOST, CHAT_QWEN_US_VIRGINIA_HOST, CHAT_QWEN_CHINA_BEIJING_HOST, CHAT_QWEN_HONG_KONG_HOST])
const isTrustedGoogleCloudHost = (hostname: string): boolean => hostMatches(hostname, [CHAT_GOOGLE_CLOUD_GLOBAL_HOST, CHAT_GOOGLE_CLOUD_US_CENTRAL1_HOST, CHAT_GOOGLE_CLOUD_EUROPE_WEST4_HOST, CHAT_GOOGLE_CLOUD_ASIA_SOUTHEAST1_HOST])
const isTrustedBytePlusHost = (hostname: string): boolean => hostMatches(hostname, [CHAT_BYTEPLUS_AP_SOUTHEAST_HOST, CHAT_BYTEPLUS_EU_WEST_HOST])
const isTrustedGeminiHost = (hostname: string): boolean => hostMatches(hostname, [CHAT_GEMINI_HOST])

const getProviderDefaultUpstreamBase = (provider: unknown): string | null => {
  const normalizedProvider = normalizeChatProviderId(provider)
  if (normalizedProvider === CHAT_PROVIDER_BYTEPLUS) return CHAT_BYTEPLUS_AP_SOUTHEAST_BASE
  if (normalizedProvider === CHAT_PROVIDER_DEERFLOW) return CHAT_DEERFLOW_LOCAL_BASE
  if (normalizedProvider === CHAT_PROVIDER_MIROMIND) return CHAT_MIROMIND_BASE
  if (normalizedProvider === CHAT_PROVIDER_AGNES) return CHAT_AGNES_BASE
  if (normalizedProvider === CHAT_PROVIDER_SEALION) return CHAT_SEALION_BASE
  if (normalizedProvider === CHAT_PROVIDER_QWEN) return CHAT_QWEN_BASE
  if (normalizedProvider === CHAT_PROVIDER_GOOGLE_CLOUD) return CHAT_GOOGLE_CLOUD_US_CENTRAL1_BASE
  if (normalizedProvider === CHAT_PROVIDER_OPENAI) return CHAT_OPENAI_BASE
  if (normalizedProvider === CHAT_PROVIDER_GEMINI) return CHAT_GEMINI_BASE
  return null
}

const getProviderDefaultEndpointUrl = (provider: unknown): string => {
  const normalizedProvider = normalizeChatProviderId(provider)
  if (normalizedProvider === CHAT_PROVIDER_BYTEPLUS) return CHAT_BYTEPLUS_AP_SOUTHEAST_ENDPOINT_URL
  if (normalizedProvider === CHAT_PROVIDER_DEERFLOW) return CHAT_DEERFLOW_ENDPOINT_URL
  if (normalizedProvider === CHAT_PROVIDER_MIROMIND) return CHAT_MIROMIND_ENDPOINT_URL
  if (normalizedProvider === CHAT_PROVIDER_AGNES) return CHAT_AGNES_ENDPOINT_URL
  if (normalizedProvider === CHAT_PROVIDER_SEALION) return CHAT_SEALION_ENDPOINT_URL
  if (normalizedProvider === CHAT_PROVIDER_QWEN) return CHAT_QWEN_ENDPOINT_URL
  if (normalizedProvider === CHAT_PROVIDER_GOOGLE_CLOUD) return CHAT_GOOGLE_CLOUD_ENDPOINT_URL
  if (normalizedProvider === CHAT_PROVIDER_OPENAI) return CHAT_OPENAI_ENDPOINT_URL
  if (normalizedProvider === CHAT_PROVIDER_GEMINI) return CHAT_GEMINI_ENDPOINT_URL
  return `${CHAT_PROXY_PATH_PREFIX}${CHAT_COMPLETIONS_PATH}`
}

const toAsciiRequestId = (value: unknown): string => {
  const raw = typeof value === 'string' ? value : ''
  const next = raw
    .trim()
    .replace(/[^\x20-\x7E]/g, '')
    .slice(0, 512)
  return next
}

const toAiGatewayRoute = (value: unknown): string => {
  const route = typeof value === 'string' ? value.trim() : ''
  if (!/^dynamic\/[a-z0-9._/-]+$/i.test(route)) return ''
  return route.slice(0, 128)
}

const toAiGatewayCacheTtlSeconds = (value: unknown): string => {
  const parsed = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(parsed)) return ''
  const bounded = Math.max(1, Math.min(86_400, Math.floor(parsed)))
  return String(bounded)
}

const isAiGatewayMetadataPrimitive = (value: unknown): value is string | number | boolean =>
  typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'

const toAiGatewayMetadataHeaderValue = (value: unknown): string => {
  if (!value || typeof value !== 'object') return ''
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, entryValue]) => isAiGatewayMetadataPrimitive(entryValue))
    .slice(0, 5)
    .map(([key, entryValue]) => {
      const nextKey = String(key || '').trim().slice(0, 64)
      if (!nextKey) return null
      if (typeof entryValue === 'string') return [nextKey, entryValue.trim().slice(0, 160)]
      if (typeof entryValue === 'number') return [nextKey, Number.isFinite(entryValue) ? entryValue : 0]
      return [nextKey, entryValue]
    })
    .filter(Boolean) as Array<[string, string | number | boolean]>
  if (!entries.length) return ''
  return JSON.stringify(Object.fromEntries(entries))
}

export type ChatProxyAiGatewayConfig = {
  route?: unknown
  metadata?: Record<string, string | number | boolean> | null
  cacheTtlSeconds?: unknown
}

const toProxyPathFromLocalUrl = (url: URL): string => {
  const pathname = String(url.pathname || '').trim()
  const pathWithSlash = pathname.startsWith('/') ? pathname : `/${pathname}`
  const basePath = pathWithSlash === '/' ? CHAT_COMPLETIONS_PATH : pathWithSlash
  return `${CHAT_PROXY_PATH_PREFIX}${basePath}${url.search || ''}`
}

const normalizeBytePlusBaseRequestPath = (path: string): string => {
  const raw = String(path || '').trim()
  if (!raw) return raw
  const splitAt = raw.search(/[?#]/)
  const pathname = splitAt >= 0 ? raw.slice(0, splitAt) : raw
  const suffix = splitAt >= 0 ? raw.slice(splitAt) : ''
  if (/\/api\/v3\/?$/i.test(pathname)) {
    return `${pathname.replace(/\/api\/v3\/?$/i, '/api/v3/chat/completions')}${suffix}`
  }
  return raw
}

const normalizeQwenBaseRequestPath = (path: string): string => {
  const raw = String(path || '').trim()
  if (!raw) return raw
  const splitAt = raw.search(/[?#]/)
  const pathname = splitAt >= 0 ? raw.slice(0, splitAt) : raw
  const suffix = splitAt >= 0 ? raw.slice(splitAt) : ''
  if (pathname === '/' || pathname === '') {
    return `${CHAT_QWEN_CHAT_COMPLETIONS_PATH}${suffix}`
  }
  if (/\/compatible-mode\/v1\/?$/i.test(pathname)) {
    return `${pathname.replace(/\/compatible-mode\/v1\/?$/i, CHAT_QWEN_CHAT_COMPLETIONS_PATH)}${suffix}`
  }
  return raw
}

const normalizeGoogleCloudBaseRequestPath = (path: string): string => {
  const raw = String(path || '').trim()
  if (!raw) return raw
  const splitAt = raw.search(/[?#]/)
  const pathname = splitAt >= 0 ? raw.slice(0, splitAt) : raw
  const suffix = splitAt >= 0 ? raw.slice(splitAt) : ''
  if (pathname === '/' || pathname === '') {
    return `${CHAT_GOOGLE_CLOUD_OPENAPI_CHAT_COMPLETIONS_PATH}${suffix}`
  }
  if (/\/v1\/projects\/[^/]+\/locations\/[^/]+\/endpoints\/openapi\/?$/i.test(pathname)) {
    return `${pathname.replace(/\/?$/i, '/chat/completions')}${suffix}`
  }
  return raw
}

const normalizeKnownBaseRequestPath = (path: string): string =>
  normalizeGoogleCloudBaseRequestPath(normalizeQwenBaseRequestPath(normalizeBytePlusBaseRequestPath(path)))

const replaceCompletionsPath = (path: string): string => {
  const normalized = String(path || '').trim()
  if (!normalized) return '/v1/models'
  if (/\/compatible-mode\/v1\/?$/i.test(normalized)) {
    return normalized.replace(/\/compatible-mode\/v1\/?$/i, CHAT_QWEN_MODELS_PATH)
  }
  if (/\/compatible-mode\/v1\/chat\/completions\/?$/i.test(normalized)) {
    return normalized.replace(/\/compatible-mode\/v1\/chat\/completions\/?$/i, CHAT_QWEN_MODELS_PATH)
  }
  if (/\/endpoints\/openapi\/chat\/completions\/?$/i.test(normalized)) {
    return normalized.replace(/\/chat\/completions\/?$/i, '/models')
  }
  if (/\/endpoints\/openapi\/?$/i.test(normalized)) {
    return normalized.replace(/\/?$/i, '/models')
  }
  if (/\/api\/v3\/?$/i.test(normalized)) {
    return normalized.replace(/\/api\/v3\/?$/i, '/api/v3/models')
  }
  if (/\/api\/llm\/chat\/completions\/?$/i.test(normalized)) {
    return normalized.replace(/\/api\/llm\/chat\/completions\/?$/i, '/api/models')
  }
  if (/\/v1\/responses\/?$/i.test(normalized)) {
    return '/v1/models'
  }
  if (/\/chat\/completions\/?$/i.test(normalized)) {
    return normalized.replace(/\/chat\/completions\/?$/i, '/models')
  }
  if (/\/v1\/chat\/completions\/?$/i.test(normalized)) {
    return normalized.replace(/\/v1\/chat\/completions\/?$/i, '/v1/models')
  }
  return '/v1/models'
}

const toModelsPath = (path: string): string => {
  const normalized = String(path || '').trim()
  if (!normalized) return '/v1/models'
  if (/\/compatible-mode\/v1\/?$/i.test(normalized)) {
    return normalized.replace(/\/compatible-mode\/v1\/?$/i, CHAT_QWEN_MODELS_PATH)
  }
  if (/\/compatible-mode\/v1\/chat\/completions\/?$/i.test(normalized)) {
    return normalized.replace(/\/compatible-mode\/v1\/chat\/completions\/?$/i, CHAT_QWEN_MODELS_PATH)
  }
  if (/\/endpoints\/openapi\/chat\/completions\/?$/i.test(normalized)) {
    return normalized.replace(/\/chat\/completions\/?$/i, '/models')
  }
  if (/\/endpoints\/openapi\/?$/i.test(normalized)) {
    return normalized.replace(/\/?$/i, '/models')
  }
  if (/\/api\/v3\/?$/i.test(normalized)) {
    return normalized.replace(/\/api\/v3\/?$/i, '/api/v3/models')
  }
  if (/\/api\/llm\/chat\/completions\/?$/i.test(normalized)) {
    return normalized.replace(/\/api\/llm\/chat\/completions\/?$/i, '/api/models')
  }
  if (/\/v1\/responses\/?$/i.test(normalized)) {
    return '/v1/models'
  }
  if (/\/chat\/completions\/?$/i.test(normalized)) {
    return normalized.replace(/\/chat\/completions\/?$/i, '/models')
  }
  if (/\/v1\/chat\/completions\/?$/i.test(normalized)) {
    return normalized.replace(/\/v1\/chat\/completions\/?$/i, '/v1/models')
  }
  return '/v1/models'
}

const stripProxyPrefix = (path: string): string => {
  const normalized = String(path || '').trim()
  if (!normalized.startsWith(CHAT_PROXY_PATH_PREFIX)) return normalized
  const next = normalized.slice(CHAT_PROXY_PATH_PREFIX.length)
  if (!next) return '/'
  return next.startsWith('/') ? next : `/${next}`
}

const toUniqueModelList = (values: readonly string[]): string[] => {
  const out: string[] = []
  const seen = new Set<string>()
  values.forEach(value => {
    const next = String(value || '').trim()
    if (!next || seen.has(next)) return
    seen.add(next)
    out.push(next)
  })
  return out
}

export function normalizeChatModelId(value: unknown): string {
  return normalizeChatModelIdForProvider(value, CHAT_DEFAULT_PROVIDER)
}

export function normalizeChatProviderId(value: unknown): ChatProviderId {
  const raw = typeof value === 'string' ? value.trim().toLowerCase() : ''
  if (raw === CHAT_PROVIDER_BYTEPLUS || raw === 'byteplus' || raw === 'modelark') return CHAT_PROVIDER_BYTEPLUS
  if (raw === CHAT_PROVIDER_DEERFLOW || raw === 'deer-flow' || raw === 'deerflow-gateway') return CHAT_PROVIDER_DEERFLOW
  if (raw === CHAT_PROVIDER_MIROMIND || raw === 'miro-mind' || raw === 'miromind-api') return CHAT_PROVIDER_MIROMIND
  if (raw === CHAT_PROVIDER_AGNES || raw === 'agnes' || raw === 'agnes-ai-api') return CHAT_PROVIDER_AGNES
  if (raw === CHAT_PROVIDER_SEALION || raw === 'sea-lion' || raw === 'sea lion' || raw === 'aisingapore' || raw === 'ai-singapore' || raw === 'ai singapore') return CHAT_PROVIDER_SEALION
  if (raw === CHAT_PROVIDER_QWEN || raw === 'dashscope' || raw === 'model-studio' || raw === 'modelstudio' || raw === 'qwen-api' || raw === 'qwen-modelstudio' || raw === 'alibaba-qwen') return CHAT_PROVIDER_QWEN
  if (raw === CHAT_PROVIDER_GOOGLE_CLOUD || raw === 'google cloud' || raw === 'googlecloud' || raw === 'gcp' || raw === 'vertex' || raw === 'vertex-ai' || raw === 'vertexai' || raw === 'google-vertex' || raw === 'google-vertex-ai') return CHAT_PROVIDER_GOOGLE_CLOUD
  if (raw === CHAT_PROVIDER_OPENAI) return CHAT_PROVIDER_OPENAI
  if (raw === CHAT_PROVIDER_LM_STUDIO) return CHAT_PROVIDER_LM_STUDIO
  if (raw === CHAT_PROVIDER_GEMINI || raw === 'google-gemini' || raw === 'google') return CHAT_PROVIDER_GEMINI
  return CHAT_DEFAULT_PROVIDER
}

export function getChatModelOptions(provider: unknown): readonly string[] {
  const normalizedProvider = normalizeChatProviderId(provider)
  if (normalizedProvider === CHAT_PROVIDER_BYTEPLUS) return CHAT_BYTEPLUS_MODEL_OPTIONS
  if (normalizedProvider === CHAT_PROVIDER_DEERFLOW) return CHAT_DEERFLOW_MODEL_OPTIONS
  if (normalizedProvider === CHAT_PROVIDER_MIROMIND) return CHAT_MIROMIND_MODEL_OPTIONS
  if (normalizedProvider === CHAT_PROVIDER_AGNES) return CHAT_AGNES_MODEL_OPTIONS
  if (normalizedProvider === CHAT_PROVIDER_SEALION) return CHAT_SEALION_MODEL_OPTIONS
  if (normalizedProvider === CHAT_PROVIDER_QWEN) return CHAT_QWEN_MODEL_OPTIONS
  if (normalizedProvider === CHAT_PROVIDER_GOOGLE_CLOUD) return CHAT_GOOGLE_CLOUD_MODEL_OPTIONS
  if (normalizedProvider === CHAT_PROVIDER_LM_STUDIO) return CHAT_LOCAL_MODEL_OPTIONS
  if (normalizedProvider === CHAT_PROVIDER_GEMINI) return CHAT_GEMINI_MODEL_OPTIONS
  return CHAT_OPENAI_MODEL_OPTIONS
}

export function getSharedChatModelCatalogOptions(provider?: unknown): string[] {
  return toUniqueModelList([
    ...getChatModelOptions(provider),
    ...CHAT_SHARED_MODEL_CATALOG_OPTIONS,
  ])
}

export function getSharedChatModelSuggestionOptions(args: {
  provider?: unknown
  currentModel?: unknown
  discoveredModels?: readonly string[]
}): string[] {
  return toUniqueModelList([
    ...getSharedChatModelCatalogOptions(args.provider),
    ...(Array.isArray(args.discoveredModels) ? args.discoveredModels : []),
    typeof args.currentModel === 'string' ? args.currentModel : '',
  ])
}

export function getChatProviderLabel(provider: unknown): string {
  return CHAT_PROVIDER_LABELS[normalizeChatProviderId(provider)]
}

export function getChatProviderCredentialLabel(provider: unknown): string {
  const normalizedProvider = normalizeChatProviderId(provider)
  if (normalizedProvider === CHAT_PROVIDER_GOOGLE_CLOUD) return 'Google Cloud Vertex AI OAuth access token'
  if (normalizedProvider === CHAT_PROVIDER_GEMINI) return 'Google Gemini API key'
  return `${getChatProviderLabel(normalizedProvider)} API key`
}

export function getChatProviderRegionLabel(provider: unknown, endpointUrl?: unknown): string {
  const normalizedProvider = normalizeChatProviderId(provider)
  if (normalizedProvider === CHAT_PROVIDER_OPENAI) return 'Global'
  if (normalizedProvider === CHAT_PROVIDER_DEERFLOW) return 'Local'
  if (normalizedProvider === CHAT_PROVIDER_MIROMIND) return 'Global'
  if (normalizedProvider === CHAT_PROVIDER_AGNES) return 'Global'
  if (normalizedProvider === CHAT_PROVIDER_SEALION) return 'Singapore'
  if (normalizedProvider === CHAT_PROVIDER_LM_STUDIO) return 'Local'
  if (normalizedProvider === CHAT_PROVIDER_GOOGLE_CLOUD) {
    const upstream = resolveChatUpstreamBaseForProxy(endpointUrl, normalizedProvider)
    const host = (() => {
      if (!upstream) return ''
      try {
        return new URL(upstream).hostname
      } catch {
        return ''
      }
    })()
    if (host === CHAT_GOOGLE_CLOUD_GLOBAL_HOST) return 'Global'
    if (host === CHAT_GOOGLE_CLOUD_EUROPE_WEST4_HOST) return 'Europe-West4'
    if (host === CHAT_GOOGLE_CLOUD_ASIA_SOUTHEAST1_HOST) return 'Asia-Southeast1'
    return 'US-Central1'
  }
  if (normalizedProvider === CHAT_PROVIDER_GEMINI) return 'Global'
  const upstream = resolveChatUpstreamBaseForProxy(endpointUrl, normalizedProvider)
  const host = (() => {
    if (!upstream) return ''
    try {
      return new URL(upstream).hostname
    } catch {
      return ''
    }
  })()
  if (normalizedProvider === CHAT_PROVIDER_QWEN) {
    if (host === CHAT_QWEN_US_VIRGINIA_HOST) return 'US-Virginia'
    if (host === CHAT_QWEN_CHINA_BEIJING_HOST) return 'China-Beijing'
    if (host === CHAT_QWEN_HONG_KONG_HOST) return 'Hong-Kong'
    return 'Singapore'
  }
  if (host === CHAT_BYTEPLUS_EU_WEST_HOST) return 'EU-West-1'
  return 'AP-Southeast-1'
}

export function getDefaultChatModelForProvider(provider: unknown): string {
  const options = getChatModelOptions(provider)
  return options[0] || ''
}

export type ChatGenerationOutputKind = 'text' | 'image' | 'video'

export function getDefaultGenerationModelForProvider(provider: unknown, kind: ChatGenerationOutputKind): string {
  const normalizedProvider = normalizeChatProviderId(provider)
  if (normalizedProvider === CHAT_PROVIDER_BYTEPLUS) {
    if (kind === 'image') return CHAT_BYTEPLUS_IMAGE_MODEL_DEFAULT
    if (kind === 'video') return CHAT_BYTEPLUS_VIDEO_MODEL_DEFAULT
    return CHAT_BYTEPLUS_TEXT_MODEL_DEFAULT
  }
  if (normalizedProvider === CHAT_PROVIDER_GEMINI) {
    if (kind === 'video') return CHAT_GEMINI_VIDEO_MODEL_DEFAULT
    return CHAT_GEMINI_TEXT_MODEL_DEFAULT
  }
  return getDefaultChatModelForProvider(normalizedProvider)
}

const toTitleToken = (token: string): string => {
  const t = String(token || '').trim()
  if (!t) return ''
  return t[0]!.toUpperCase() + t.slice(1)
}

export function getBytePlusVideoModelLabel(modelId: unknown): string {
  const raw = typeof modelId === 'string' ? modelId.trim() : ''
  if (!raw) return ''
  const parts = raw.split('-').map(v => v.trim()).filter(Boolean)
  if (parts.length === 0) return raw
  const last = parts[parts.length - 1] || ''
  const core = /^\d{6}$/.test(last) ? parts.slice(0, -1) : parts
  if (core.length === 0) return raw

  const first = core[0] || ''
  const rest = core.slice(1)

  const out: string[] = [toTitleToken(first)]

  if (rest.length >= 3 && rest[0]?.toLowerCase() === 'seedance' && /^\d+$/.test(rest[1] || '') && /^\d+$/.test(rest[2] || '')) {
    out.push('Seedance')
    out.push(`${rest[1]}.${rest[2]}`)
    out.push(...rest.slice(3))
  } else if (rest.length >= 2 && /^\d+$/.test(rest[0] || '') && /^\d+$/.test(rest[1] || '')) {
    out.push(`${rest[0]}.${rest[1]}`)
    out.push(...rest.slice(2))
  } else {
    out.push(...rest)
  }

  const label = out.filter(Boolean).join('-')
  const hasSeedance = core.some(v => String(v || '').toLowerCase() === 'seedance') || String(first || '').toLowerCase() === 'seedance'
  return hasSeedance ? `ByteDance-${label}` : label
}

export function normalizeChatModelIdForProvider(value: unknown, provider: unknown): string {
  const normalizedProvider = normalizeChatProviderId(provider)
  const raw = typeof value === 'string' ? value.trim() : ''
  if (!raw) return getDefaultChatModelForProvider(normalizedProvider)
  const canonicalInputVariant = CHAT_MODEL_ID_BY_INPUT_VARIANT[raw.toLowerCase()]
  return canonicalInputVariant || raw
}

export function isKnownChatModelIdForDifferentProvider(value: unknown, provider: unknown): boolean {
  const raw = typeof value === 'string' ? value.trim() : ''
  if (!raw) return false
  const normalizedProvider = normalizeChatProviderId(provider)
  const normalizedModel = normalizeChatModelIdForProvider(raw, normalizedProvider)
  return CHAT_PROVIDER_OPTIONS.some(optionProvider => optionProvider !== normalizedProvider && getChatModelOptions(optionProvider).includes(normalizedModel))
}

const isUnknownNativeOpenAiModelId = (value: unknown): boolean => {
  const raw = typeof value === 'string' ? value.trim() : ''
  return Boolean(raw && /^gpt-/i.test(raw) && !getChatModelOptions(CHAT_PROVIDER_OPENAI).includes(raw))
}

export function resolveChatModelIdForProvider(value: unknown, provider: unknown, args?: { preserveUnknownCustomModel?: boolean }): string {
  const normalizedProvider = normalizeChatProviderId(provider)
  const normalizedModel = normalizeChatModelIdForProvider(value, normalizedProvider)
  const providerModels = getChatModelOptions(normalizedProvider)
  if (providerModels.includes(normalizedModel)) return normalizedModel
  const raw = typeof value === 'string' ? value.trim() : ''
  if (
    args?.preserveUnknownCustomModel
    && raw
    && !isKnownChatModelIdForDifferentProvider(normalizedModel, normalizedProvider)
    && !isUnknownNativeOpenAiModelId(normalizedModel)
  ) {
    return normalizedModel
  }
  return getDefaultChatModelForProvider(normalizedProvider)
}

export function normalizeChatEndpointUrlInput(value: unknown, provider?: unknown): string {
  const raw = toCleanInput(value)
  if (!raw) return getProviderDefaultEndpointUrl(provider || CHAT_DEFAULT_PROVIDER)
  if (raw.startsWith('/')) {
    return resolveChatEndpointForRequest(raw) || getProviderDefaultEndpointUrl(provider || CHAT_DEFAULT_PROVIDER)
  }
  const absolute = coerceHttpUrl(raw)
  if (!absolute) return getProviderDefaultEndpointUrl(provider || CHAT_DEFAULT_PROVIDER)
  try {
    const parsed = new URL(absolute)
    if (isLocalHost(parsed.hostname) || isTrustedOpenAiHost(parsed.hostname) || isTrustedMiroMindHost(parsed.hostname) || isTrustedAgnesHost(parsed.hostname) || isTrustedSealionHost(parsed.hostname) || isTrustedQwenHost(parsed.hostname) || isTrustedGoogleCloudHost(parsed.hostname) || isTrustedBytePlusHost(parsed.hostname) || isTrustedGeminiHost(parsed.hostname)) {
      if (isTrustedQwenHost(parsed.hostname)) {
        parsed.pathname = normalizeQwenBaseRequestPath(parsed.pathname)
      }
      if (isTrustedGoogleCloudHost(parsed.hostname)) {
        parsed.pathname = normalizeGoogleCloudBaseRequestPath(parsed.pathname)
      }
      return parsed.toString()
    }
  } catch {
    void 0
  }
  return getProviderDefaultEndpointUrl(provider || CHAT_DEFAULT_PROVIDER)
}

export function resolveChatEndpointForRequest(value: unknown): string | null {
  const raw = toCleanInput(value)
  if (!raw) return null
  if (raw.startsWith('/')) {
    if (raw.startsWith(CHAT_PROXY_PATH_PREFIX)) {
      return `${CHAT_PROXY_PATH_PREFIX}${normalizeKnownBaseRequestPath(stripProxyPrefix(raw))}`
    }
    return `${CHAT_PROXY_PATH_PREFIX}${normalizeKnownBaseRequestPath(raw.startsWith('/') ? raw : `/${raw}`)}`
  }
  const absolute = coerceHttpUrl(raw)
  if (!absolute) return null
  try {
    const parsed = new URL(absolute)
    if (isLocalHost(parsed.hostname) || isTrustedOpenAiHost(parsed.hostname) || isTrustedMiroMindHost(parsed.hostname) || isTrustedAgnesHost(parsed.hostname) || isTrustedSealionHost(parsed.hostname) || isTrustedQwenHost(parsed.hostname) || isTrustedGoogleCloudHost(parsed.hostname) || isTrustedBytePlusHost(parsed.hostname) || isTrustedGeminiHost(parsed.hostname)) {
      if (isTrustedBytePlusHost(parsed.hostname)) {
        if (parsed.pathname === '/' || parsed.pathname === '') {
          parsed.pathname = CHAT_BYTEPLUS_COMPLETIONS_PATH
        } else {
          parsed.pathname = normalizeBytePlusBaseRequestPath(parsed.pathname)
        }
      }
      if (isTrustedQwenHost(parsed.hostname)) {
        parsed.pathname = normalizeQwenBaseRequestPath(parsed.pathname)
      }
      if (isTrustedGoogleCloudHost(parsed.hostname)) {
        parsed.pathname = normalizeGoogleCloudBaseRequestPath(parsed.pathname)
      }
      if (isTrustedMiroMindHost(parsed.hostname) && (parsed.pathname === '/' || parsed.pathname === '')) {
        parsed.pathname = CHAT_COMPLETIONS_PATH
      }
      if (isTrustedAgnesHost(parsed.hostname) && (parsed.pathname === '/' || parsed.pathname === '')) {
        parsed.pathname = CHAT_COMPLETIONS_PATH
      }
      if (isTrustedSealionHost(parsed.hostname) && (parsed.pathname === '/' || parsed.pathname === '')) {
        parsed.pathname = CHAT_COMPLETIONS_PATH
      }
      return toProxyPathFromLocalUrl(parsed)
    }
    return null
  } catch {
    return null
  }
}

export function isResponsesEndpointUrl(value: unknown): boolean {
  const raw = typeof value === 'string' ? value.trim() : ''
  if (!raw) return false
  const withoutQuery = (() => {
    const q = raw.indexOf('?')
    return q >= 0 ? raw.slice(0, q) : raw
  })()
  const stripped = stripProxyPrefix(withoutQuery)
  return /\/v1\/responses\/?$/i.test(stripped)
}

export function resolveBytePlusContentEndpointForRequest(args: {
  endpointUrl?: unknown
  path: string
}): string | null {
  const rawPath = String(args.path || '').trim()
  if (!rawPath.startsWith('/')) return null
  const upstreamBase = resolveChatUpstreamBaseForProxy(args.endpointUrl, CHAT_PROVIDER_BYTEPLUS) || CHAT_BYTEPLUS_AP_SOUTHEAST_BASE
  return resolveChatEndpointForRequest(`${upstreamBase}${rawPath}`)
}

export function resolveBinaryDownloadProxyUrl(value: unknown): string {
  const raw = toCleanInput(value)
  if (!raw) return ''
  return `${CHAT_BINARY_DOWNLOAD_PROXY_PATH}?url=${encodeURIComponent(raw)}`
}

export function resolveChatUpstreamBaseForProxy(value: unknown, provider: unknown): string | null {
  const raw = toCleanInput(value)
  if (!raw || raw.startsWith('/')) {
    const normalizedProvider = normalizeChatProviderId(provider)
    if (normalizedProvider === CHAT_PROVIDER_DEERFLOW && raw.startsWith('/')) return null
    return getProviderDefaultUpstreamBase(provider)
  }
  const absolute = coerceHttpUrl(raw)
  if (!absolute) return getProviderDefaultUpstreamBase(provider)
  try {
    const parsed = new URL(absolute)
    if (isLocalHost(parsed.hostname)) return parsed.origin
    const normalizedProvider = normalizeChatProviderId(provider)
    if (normalizedProvider === CHAT_PROVIDER_OPENAI) {
      return isTrustedOpenAiHost(parsed.hostname) ? parsed.origin : null
    }
    if (normalizedProvider === CHAT_PROVIDER_MIROMIND) {
      return isTrustedMiroMindHost(parsed.hostname) ? parsed.origin : null
    }
    if (normalizedProvider === CHAT_PROVIDER_AGNES) {
      return isTrustedAgnesHost(parsed.hostname) ? parsed.origin : null
    }
    if (normalizedProvider === CHAT_PROVIDER_SEALION) {
      return isTrustedSealionHost(parsed.hostname) ? parsed.origin : null
    }
    if (normalizedProvider === CHAT_PROVIDER_QWEN) {
      return isTrustedQwenHost(parsed.hostname) ? parsed.origin : null
    }
    if (normalizedProvider === CHAT_PROVIDER_GOOGLE_CLOUD) {
      return isTrustedGoogleCloudHost(parsed.hostname) ? parsed.origin : null
    }
    if (normalizedProvider === CHAT_PROVIDER_DEERFLOW) {
      return isLocalHost(parsed.hostname) ? parsed.origin : null
    }
    if (normalizedProvider === CHAT_PROVIDER_BYTEPLUS) {
      return isTrustedBytePlusHost(parsed.hostname) ? parsed.origin : null
    }
    if (normalizedProvider === CHAT_PROVIDER_GEMINI) {
      return isTrustedGeminiHost(parsed.hostname) ? parsed.origin : null
    }
    return null
  } catch {
    return null
  }
}

export function buildChatProxyHeaders(args: {
  provider: unknown
  apiKey?: unknown
  endpointUrl?: unknown
  clientRequestId?: unknown
  aiGateway?: ChatProxyAiGatewayConfig | null
}): Record<string, string> {
  const headers: Record<string, string> = {}
  const provider = normalizeChatProviderId(args.provider)
  headers['X-KG-Chat-Provider'] = provider
  const sanitizedApiKey = String(args.apiKey || '').trim()
  if (sanitizedApiKey) {
    headers['X-KG-Chat-Api-Key'] = sanitizedApiKey
  }
  const upstreamBase = resolveChatUpstreamBaseForProxy(args.endpointUrl, provider)
  if (upstreamBase) {
    headers['X-KG-Chat-Upstream'] = upstreamBase
  }
  const clientRequestId = toAsciiRequestId(args.clientRequestId)
  if (clientRequestId) {
    headers['X-Client-Request-Id'] = clientRequestId
  }
  const aiGatewayRoute = toAiGatewayRoute(args.aiGateway?.route)
  if (aiGatewayRoute) {
    headers[CHAT_PROXY_AI_GATEWAY_ROUTE_HEADER] = aiGatewayRoute
  }
  const aiGatewayMetadata = toAiGatewayMetadataHeaderValue(args.aiGateway?.metadata)
  if (aiGatewayMetadata) {
    headers[CHAT_PROXY_AI_GATEWAY_METADATA_HEADER] = aiGatewayMetadata
  }
  const aiGatewayCacheTtlSeconds = toAiGatewayCacheTtlSeconds(args.aiGateway?.cacheTtlSeconds)
  if (aiGatewayCacheTtlSeconds) {
    headers[CHAT_PROXY_AI_GATEWAY_CACHE_TTL_HEADER] = aiGatewayCacheTtlSeconds
  }
  return headers
}

export function getChatRecommendedModelHint(provider: unknown): string {
  const normalizedProvider = normalizeChatProviderId(provider)
  if (normalizedProvider === CHAT_PROVIDER_BYTEPLUS) {
    return `Default text: ${CHAT_BYTEPLUS_TEXT_MODEL_DEFAULT}. Image Run uses ${CHAT_BYTEPLUS_IMAGE_MODEL_DEFAULT}; video Run uses ${CHAT_BYTEPLUS_VIDEO_MODEL_DEFAULT}.`
  }
  if (normalizedProvider === CHAT_PROVIDER_DEERFLOW) {
    return 'Use a DeerFlow-configured model id; endpoint defaults to the local DeerFlow Gateway OpenAI-compatible surface.'
  }
  if (normalizedProvider === CHAT_PROVIDER_MIROMIND) {
    return `Use ${CHAT_MIROMIND_MODEL_OPTIONS[0]} or ${CHAT_MIROMIND_MODEL_OPTIONS[1]}; raw SSE preserves reasoning_steps, reasoning_tokens, and num_search_queries from MiroMind chat completions.`
  }
  if (normalizedProvider === CHAT_PROVIDER_AGNES) {
    return `Use ${CHAT_AGNES_MODEL_OPTIONS[0]}; requests stay on the shared chat-completions transport and stream SSE JSON chunks through the canonical markdown/frontmatter pipeline.`
  }
  if (normalizedProvider === CHAT_PROVIDER_SEALION) {
    return `Use ${CHAT_SEALION_MODEL_OPTIONS[0]} for Southeast Asian multilingual/cultural tasks; requests stay on the shared OpenAI-compatible chat path.`
  }
  if (normalizedProvider === CHAT_PROVIDER_QWEN) {
    return `Use ${CHAT_QWEN_MODEL_OPTIONS[0]}, ${CHAT_QWEN_MODEL_OPTIONS[2]}, or ${CHAT_QWEN_MODEL_OPTIONS[4]}; Qwen runs through Alibaba Cloud Model Studio's OpenAI-compatible chat-completions endpoint.`
  }
  if (normalizedProvider === CHAT_PROVIDER_GOOGLE_CLOUD) {
    return `Use ${CHAT_GOOGLE_CLOUD_MODEL_OPTIONS[0]} or another google/gemini model id; Google Cloud runs through Vertex AI's OpenAI-compatible endpoints/openapi chat-completions endpoint.`
  }
  if (normalizedProvider === CHAT_PROVIDER_GEMINI) {
    return `Use ${CHAT_GEMINI_MODEL_OPTIONS[0]}; Google Gemini uses the direct Gemini API OpenAI-compatible /v1beta/openai/chat/completions endpoint and a Gemini API key.`
  }
  if (normalizedProvider === CHAT_PROVIDER_OPENAI) {
    return 'Use an OpenAI model id and keep API keys server-routed through the proxy.'
  }
  return 'Use a locally served OpenAI-compatible model id.'
}

export function getChatDefaultEndpointUrlForProvider(provider: unknown): string {
  return getProviderDefaultEndpointUrl(provider)
}

export function resolveChatEndpointForHealth(value: unknown): string | null {
  const requestTarget = resolveChatEndpointForRequest(value)
  if (!requestTarget) return null
  if (requestTarget.startsWith('/')) {
    const splitAt = requestTarget.indexOf('?')
    const pathname = splitAt >= 0 ? requestTarget.slice(0, splitAt) : requestTarget
    const hasProxyPrefix = pathname.startsWith(CHAT_PROXY_PATH_PREFIX)
    const effectivePath = hasProxyPrefix ? stripProxyPrefix(pathname) : pathname
    const healthPath = replaceCompletionsPath(effectivePath)
    if (hasProxyPrefix) {
      return `${CHAT_PROXY_PATH_PREFIX}${healthPath}`
    }
    return healthPath
  }
  try {
    const parsed = new URL(requestTarget)
    parsed.pathname = replaceCompletionsPath(parsed.pathname)
    parsed.search = ''
    return parsed.toString()
  } catch {
    return null
  }
}

export function resolveChatEndpointForModels(value: unknown): string | null {
  const requestTarget = resolveChatEndpointForRequest(value)
  if (!requestTarget) return null
  if (requestTarget.startsWith('/')) {
    const splitAt = requestTarget.indexOf('?')
    const pathname = splitAt >= 0 ? requestTarget.slice(0, splitAt) : requestTarget
    const hasProxyPrefix = pathname.startsWith(CHAT_PROXY_PATH_PREFIX)
    const effectivePath = hasProxyPrefix ? stripProxyPrefix(pathname) : pathname
    const modelsPath = toModelsPath(effectivePath)
    if (hasProxyPrefix) {
      return `${CHAT_PROXY_PATH_PREFIX}${modelsPath}`
    }
    return modelsPath
  }
  try {
    const parsed = new URL(requestTarget)
    parsed.pathname = toModelsPath(parsed.pathname)
    parsed.search = ''
    return parsed.toString()
  } catch {
    return null
  }
}
