import { readEnvString } from '@/lib/config.env'
import {
  buildKnowgrphStorageChatPoliciesPath,
  buildKnowgrphStorageChatRelayPath,
  buildKnowgrphStorageChatSessionPath,
  type KnowgrphStorageChatAuthMode,
  type KnowgrphStorageChatPoliciesResponse,
  type KnowgrphStorageChatPolicyRecord,
  type KnowgrphStorageChatProviderId,
  type KnowgrphStorageChatSessionMembership,
  type KnowgrphStorageChatSessionResponse,
} from '@/lib/storage/knowgrphStorageSyncContract'

const normalizeString = (value: unknown): string => String(value || '').trim()

const SUPPORTED_STORAGE_CHAT_PROVIDER_IDS: readonly KnowgrphStorageChatProviderId[] = [
  'openai',
  'miromind',
  'agnes-ai',
  'byteplus-modelark',
  'qwen',
  'google-cloud',
]

export type KnowgrphStorageChatRelayConfig = {
  baseUrl: string
  workspaceId: string
  sessionToken: string
  relayUrl: string
}

export type KnowgrphStorageChatRelayDecision =
  | { kind: 'disabled' }
  | { kind: 'loading'; detail: string }
  | { kind: 'blocked'; detail: string; policy: KnowgrphStorageChatPolicyRecord | null }
  | {
      kind: 'ready'
      detail: string
      config: KnowgrphStorageChatRelayConfig
      membership: KnowgrphStorageChatSessionMembership
      policy: KnowgrphStorageChatPolicyRecord
    }

export const readKnowgrphCollaborationSaveSessionToken = (
  explicitToken?: string | null,
): string | null => {
  const token = normalizeString(
    explicitToken == null
      ? readKnowgrphStorageChatRelayConfig()?.sessionToken
        || readEnvString('VITE_KNOWGRPH_STORAGE_CHAT_SESSION_TOKEN', '')
      : explicitToken,
  )
  return token && token.length <= 8_192 && !/\s/.test(token) ? token : null
}

export const requireKnowgrphCollaborationSaveSessionToken = (
  explicitToken?: string | null,
): string => {
  const token = readKnowgrphCollaborationSaveSessionToken(explicitToken)
  if (!token) {
    throw new Error('Authenticated storage session is required for collaboration save.')
  }
  return token
}

export const toKnowgrphStorageChatProviderId = (
  value: unknown,
): KnowgrphStorageChatProviderId | null => {
  const normalized = normalizeString(value)
  return SUPPORTED_STORAGE_CHAT_PROVIDER_IDS.includes(normalized as KnowgrphStorageChatProviderId)
    ? (normalized as KnowgrphStorageChatProviderId)
    : null
}

export const buildKnowgrphStorageAbsoluteUrl = (
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

export const readKnowgrphStorageChatRelayConfig = (): KnowgrphStorageChatRelayConfig | null => {
  const baseUrl = normalizeString(readEnvString('VITE_KNOWGRPH_STORAGE_BASE_URL', ''))
  const workspaceId = normalizeString(readEnvString('VITE_KNOWGRPH_STORAGE_WORKSPACE_ID', ''))
  const sessionToken = normalizeString(readEnvString('VITE_KNOWGRPH_STORAGE_CHAT_SESSION_TOKEN', ''))
  if (!baseUrl || !workspaceId || !sessionToken) return null
  const relayUrl = buildKnowgrphStorageAbsoluteUrl(baseUrl, buildKnowgrphStorageChatRelayPath())
  if (!relayUrl) return null
  return {
    baseUrl,
    workspaceId,
    sessionToken,
    relayUrl,
  }
}

export const isKnowgrphStorageChatRelayUrl = (requestUrl: string): boolean => {
  const normalizedRequestUrl = normalizeString(requestUrl)
  if (!normalizedRequestUrl) return false
  const relayConfig = readKnowgrphStorageChatRelayConfig()
  return normalizedRequestUrl === String(relayConfig?.relayUrl || '')
}

export const buildKnowgrphStorageChatAuthHeaders = (sessionToken: string): HeadersInit => ({
  accept: 'application/json',
  authorization: `Bearer ${normalizeString(sessionToken)}`,
})

const parseJsonResponse = async <T>(response: Response): Promise<T> => {
  const text = await response.text()
  if (!text) throw new Error(`Expected JSON response body for ${response.url || 'storage chat request'}`)
  return JSON.parse(text) as T
}

export const fetchKnowgrphStorageChatSession = async (args: {
  config: KnowgrphStorageChatRelayConfig
  fetchFn?: typeof fetch
}): Promise<KnowgrphStorageChatSessionResponse> => {
  const fetchFn = args.fetchFn || fetch
  const sessionUrl = buildKnowgrphStorageAbsoluteUrl(args.config.baseUrl, buildKnowgrphStorageChatSessionPath())
  if (!sessionUrl) throw new Error('Invalid storage chat session URL')
  const response = await fetchFn(sessionUrl, {
    method: 'GET',
    headers: buildKnowgrphStorageChatAuthHeaders(args.config.sessionToken),
  })
  if (!response.ok) {
    throw new Error(`Storage chat session request failed (${response.status})`)
  }
  return await parseJsonResponse<KnowgrphStorageChatSessionResponse>(response)
}

export const fetchKnowgrphStorageChatPolicies = async (args: {
  config: KnowgrphStorageChatRelayConfig
  fetchFn?: typeof fetch
}): Promise<KnowgrphStorageChatPoliciesResponse> => {
  const fetchFn = args.fetchFn || fetch
  const policiesUrl = buildKnowgrphStorageAbsoluteUrl(
    args.config.baseUrl,
    buildKnowgrphStorageChatPoliciesPath(args.config.workspaceId),
  )
  if (!policiesUrl) throw new Error('Invalid storage chat policies URL')
  const response = await fetchFn(policiesUrl, {
    method: 'GET',
    headers: buildKnowgrphStorageChatAuthHeaders(args.config.sessionToken),
  })
  if (!response.ok) {
    throw new Error(`Storage chat policies request failed (${response.status})`)
  }
  return await parseJsonResponse<KnowgrphStorageChatPoliciesResponse>(response)
}

export const readDefaultKnowgrphStorageChatPolicy = (args: {
  workspaceId: string
  providerId: KnowgrphStorageChatProviderId
}): KnowgrphStorageChatPolicyRecord => ({
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

export const resolveKnowgrphStorageChatPolicy = (args: {
  workspaceId: string
  providerId: KnowgrphStorageChatProviderId
  policies: readonly KnowgrphStorageChatPolicyRecord[]
}): KnowgrphStorageChatPolicyRecord => (
  args.policies.find(policy => (
    normalizeString(policy.workspaceId) === normalizeString(args.workspaceId)
    && policy.providerId === args.providerId
  ))
  || readDefaultKnowgrphStorageChatPolicy({
    workspaceId: args.workspaceId,
    providerId: args.providerId,
  })
)

export const isKnowgrphStorageChatAuthModeAllowed = (
  policy: KnowgrphStorageChatPolicyRecord,
  authMode: KnowgrphStorageChatAuthMode,
): boolean => (authMode === 'byok' ? policy.allowByok : policy.allowServerManaged)
