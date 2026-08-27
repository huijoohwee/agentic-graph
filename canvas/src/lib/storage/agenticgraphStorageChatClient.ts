import { readEnvString } from '@/lib/config.env'
import {
  buildAgenticGraphStorageChatPoliciesPath,
  buildAgenticGraphStorageChatRelayPath,
  buildAgenticGraphStorageChatSessionPath,
  type AgenticGraphStorageChatAuthMode,
  type AgenticGraphStorageChatPoliciesResponse,
  type AgenticGraphStorageChatPolicyRecord,
  type AgenticGraphStorageChatProviderId,
  type AgenticGraphStorageChatSessionMembership,
  type AgenticGraphStorageChatSessionResponse,
} from '@/lib/storage/agenticgraphStorageSyncContract'

const normalizeString = (value: unknown): string => String(value || '').trim()

const SUPPORTED_STORAGE_CHAT_PROVIDER_IDS: readonly AgenticGraphStorageChatProviderId[] = [
  'openai',
  'miromind',
  'agnes-ai',
  'byteplus-modelark',
  'qwen',
  'google-cloud',
]

export type AgenticGraphStorageChatRelayConfig = {
  baseUrl: string
  workspaceId: string
  sessionToken: string
  relayUrl: string
}

export type AgenticGraphStorageChatRelayDecision =
  | { kind: 'disabled' }
  | { kind: 'loading'; detail: string }
  | { kind: 'blocked'; detail: string; policy: AgenticGraphStorageChatPolicyRecord | null }
  | {
      kind: 'ready'
      detail: string
      config: AgenticGraphStorageChatRelayConfig
      membership: AgenticGraphStorageChatSessionMembership
      policy: AgenticGraphStorageChatPolicyRecord
    }

export const readAgenticGraphCollaborationSaveSessionToken = (
  explicitToken?: string | null,
): string | null => {
  const token = normalizeString(
    explicitToken == null
      ? readAgenticGraphStorageChatRelayConfig()?.sessionToken
        || readEnvString('VITE_AGENTICGRAPH_STORAGE_CHAT_SESSION_TOKEN', '')
      : explicitToken,
  )
  return token && token.length <= 8_192 && !/\s/.test(token) ? token : null
}

export const requireAgenticGraphCollaborationSaveSessionToken = (
  explicitToken?: string | null,
): string => {
  const token = readAgenticGraphCollaborationSaveSessionToken(explicitToken)
  if (!token) {
    throw new Error('Authenticated storage session is required for collaboration save.')
  }
  return token
}

export const toAgenticGraphStorageChatProviderId = (
  value: unknown,
): AgenticGraphStorageChatProviderId | null => {
  const normalized = normalizeString(value)
  return SUPPORTED_STORAGE_CHAT_PROVIDER_IDS.includes(normalized as AgenticGraphStorageChatProviderId)
    ? (normalized as AgenticGraphStorageChatProviderId)
    : null
}

export const buildAgenticGraphStorageAbsoluteUrl = (
  baseUrl: string,
  path: string,
): string | null => {
  const normalizedBaseUrl = normalizeString(baseUrl)
  const normalizedPath = normalizeString(path)
  if (!normalizedBaseUrl || !normalizedPath) return null
  try {
    return new URL(
      normalizedPath,
      normalizedBaseUrl.endsWith('/') ? normalizedBaseUrl : `${normalizedBaseUrl}/`,
    ).toString()
  } catch {
    return null
  }
}

export const readAgenticGraphStorageChatRelayConfig = (): AgenticGraphStorageChatRelayConfig | null => {
  const baseUrl = normalizeString(readEnvString('VITE_AGENTICGRAPH_STORAGE_BASE_URL', ''))
  const workspaceId = normalizeString(readEnvString('VITE_AGENTICGRAPH_STORAGE_WORKSPACE_ID', ''))
  const sessionToken = normalizeString(readEnvString('VITE_AGENTICGRAPH_STORAGE_CHAT_SESSION_TOKEN', ''))
  if (!baseUrl || !workspaceId || !sessionToken) return null
  const relayUrl = buildAgenticGraphStorageAbsoluteUrl(baseUrl, buildAgenticGraphStorageChatRelayPath())
  if (!relayUrl) return null
  return {
    baseUrl,
    workspaceId,
    sessionToken,
    relayUrl,
  }
}

export const isAgenticGraphStorageChatRelayUrl = (requestUrl: string): boolean => {
  const normalizedRequestUrl = normalizeString(requestUrl)
  if (!normalizedRequestUrl) return false
  const relayConfig = readAgenticGraphStorageChatRelayConfig()
  return normalizedRequestUrl === String(relayConfig?.relayUrl || '')
}

export const buildAgenticGraphStorageChatAuthHeaders = (sessionToken: string): HeadersInit => ({
  accept: 'application/json',
  authorization: `Bearer ${normalizeString(sessionToken)}`,
})

const parseJsonResponse = async <T>(response: Response): Promise<T> => {
  const text = await response.text()
  if (!text) throw new Error(`Expected JSON response body for ${response.url || 'storage chat request'}`)
  return JSON.parse(text) as T
}

export const fetchAgenticGraphStorageChatSession = async (args: {
  config: AgenticGraphStorageChatRelayConfig
  fetchFn?: typeof fetch
}): Promise<AgenticGraphStorageChatSessionResponse> => {
  const fetchFn = args.fetchFn || fetch
  const sessionUrl = buildAgenticGraphStorageAbsoluteUrl(args.config.baseUrl, buildAgenticGraphStorageChatSessionPath())
  if (!sessionUrl) throw new Error('Invalid storage chat session URL')
  const response = await fetchFn(sessionUrl, {
    method: 'GET',
    headers: buildAgenticGraphStorageChatAuthHeaders(args.config.sessionToken),
  })
  if (!response.ok) {
    throw new Error(`Storage chat session request failed (${response.status})`)
  }
  return await parseJsonResponse<AgenticGraphStorageChatSessionResponse>(response)
}

export const fetchAgenticGraphStorageChatPolicies = async (args: {
  config: AgenticGraphStorageChatRelayConfig
  fetchFn?: typeof fetch
}): Promise<AgenticGraphStorageChatPoliciesResponse> => {
  const fetchFn = args.fetchFn || fetch
  const policiesUrl = buildAgenticGraphStorageAbsoluteUrl(
    args.config.baseUrl,
    buildAgenticGraphStorageChatPoliciesPath(args.config.workspaceId),
  )
  if (!policiesUrl) throw new Error('Invalid storage chat policies URL')
  const response = await fetchFn(policiesUrl, {
    method: 'GET',
    headers: buildAgenticGraphStorageChatAuthHeaders(args.config.sessionToken),
  })
  if (!response.ok) {
    throw new Error(`Storage chat policies request failed (${response.status})`)
  }
  return await parseJsonResponse<AgenticGraphStorageChatPoliciesResponse>(response)
}

export const readDefaultAgenticGraphStorageChatPolicy = (args: {
  workspaceId: string
  providerId: AgenticGraphStorageChatProviderId
}): AgenticGraphStorageChatPolicyRecord => ({
  workspaceId: normalizeString(args.workspaceId),
  providerId: args.providerId,
  allowServerManaged: false,
  allowByok: true,
  monthlyRequestLimit: null,
  monthlyTokenLimit: null,
  monthlySpendLimitCents: null,
  defaultModel: null,
  updatedAtMs: null,
})

export const resolveAgenticGraphStorageChatPolicy = (args: {
  workspaceId: string
  providerId: AgenticGraphStorageChatProviderId
  policies: readonly AgenticGraphStorageChatPolicyRecord[]
}): AgenticGraphStorageChatPolicyRecord => (
  args.policies.find(policy => (
    normalizeString(policy.workspaceId) === normalizeString(args.workspaceId)
    && policy.providerId === args.providerId
  ))
  || readDefaultAgenticGraphStorageChatPolicy({
    workspaceId: args.workspaceId,
    providerId: args.providerId,
  })
)

export const isAgenticGraphStorageChatAuthModeAllowed = (
  policy: AgenticGraphStorageChatPolicyRecord,
  authMode: AgenticGraphStorageChatAuthMode,
): boolean => (authMode === 'byok' ? policy.allowByok : policy.allowServerManaged)
