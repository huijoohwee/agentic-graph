import {
  AGENTICGRAPH_STORAGE_API_VERSION,
  AGENTICGRAPH_STORAGE_ROUTE_PATHS,
  type AgenticGraphStorageChatAuditEntry,
  type AgenticGraphStorageChatAuditResponse,
  type AgenticGraphStorageChatPoliciesResponse,
  type AgenticGraphStorageChatPolicyRecord,
  type AgenticGraphStorageChatRelayRequest,
  type AgenticGraphStorageChatRelayResponse,
  type AgenticGraphStorageChatRole,
  type AgenticGraphStorageChatSessionMembership,
  type AgenticGraphStorageChatSessionResponse,
  type AgenticGraphStorageErrorResponse,
  type AgenticGraphStorageWorkerEnv,
} from './contract'
import {
  type ChatProxyAuditRow,
  type D1DatabaseLike,
  normalizeNullableString,
  normalizeString,
  readActiveAuthSessionByHash,
  readChatProxyAuditRows,
  readWorkspaceMembershipRow,
  readWorkspaceMembershipRowsByUser,
  readWorkspaceProviderPolicyRow,
  readWorkspaceProviderPolicyRows,
  writeChatProxyAuditRow,
} from './db'
import {
  cancelChatRelayBody,
  readBoundedChatRelayRequestJson,
  readBoundedChatRelayResponseJson,
} from './chatRelayBodyBounds'

const CORS_HEADERS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET,HEAD,POST,OPTIONS',
  'access-control-allow-headers': 'content-type,authorization,x-client-request-id,x-agenticgraph-session-token',
  'access-control-max-age': '86400',
}

export const AGENTICGRAPH_STORAGE_BROWSER_SESSION_COOKIE_NAME = '__Host-kg_storage_session'
const MAX_BROWSER_SESSION_COOKIE_TOKEN_LENGTH = 512
const BROWSER_SESSION_COOKIE_TOKEN = /^[A-Za-z0-9_-]+$/

const jsonHeaders = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
  ...CORS_HEADERS,
}

const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), { status, headers: jsonHeaders })

const errorResponse = (
  status: number,
  code: AgenticGraphStorageErrorResponse['code'],
  error: string,
): Response => json(status, {
  ok: false,
  apiVersion: AGENTICGRAPH_STORAGE_API_VERSION,
  error,
  code,
} satisfies AgenticGraphStorageErrorResponse)

const normalizeIsoToMs = (value: string | null | undefined): number | null => {
  const raw = String(value || '').trim()
  if (!raw) return null
  const parsed = Date.parse(raw)
  return Number.isFinite(parsed) ? parsed : null
}

const buildAuditId = (): string =>
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? `chat_audit:${crypto.randomUUID()}`
    : `chat_audit:${Date.now()}:${Math.random().toString(16).slice(2)}`

const readAuthorizationBearerToken = (request: Request): string => {
  const authorization = String(request.headers.get('authorization') || '').trim()
  if (/^bearer\s+/i.test(authorization)) return authorization.replace(/^bearer\s+/i, '').trim()
  return String(request.headers.get('x-agenticgraph-session-token') || '').trim()
}

export const readAgenticGraphStorageBrowserSessionToken = (request: Request): string => {
  const cookie = String(request.headers.get('cookie') || '')
  if (!cookie || cookie.length > 8_192) return ''
  for (const part of cookie.split(';')) {
    const [name, ...rawValue] = part.trim().split('=')
    if (name !== AGENTICGRAPH_STORAGE_BROWSER_SESSION_COOKIE_NAME) continue
    const value = rawValue.join('=').trim()
    if (
      value.length < 32
      || value.length > MAX_BROWSER_SESSION_COOKIE_TOKEN_LENGTH
      || !BROWSER_SESSION_COOKIE_TOKEN.test(value)
    ) return ''
    return value
  }
  return ''
}

type AuthenticatedSessionCredential = {
  token: string
  source: 'bearer' | 'cookie'
}

const readBearerSessionCredential = (request: Request): AuthenticatedSessionCredential | null => {
  const token = readAuthorizationBearerToken(request)
  return token ? { token, source: 'bearer' } : null
}

/**
 * Cookie credentials are limited to the browser-session and D1 snapshot
 * surfaces. Chat and Canvas-room callers retain their existing bearer/query
 * boundary until their separate WebSocket-ticket migration is complete.
 */
const readStorageSnapshotSessionCredential = (request: Request): AuthenticatedSessionCredential | null => {
  const bearer = readBearerSessionCredential(request)
  if (bearer) return bearer
  const cookie = readAgenticGraphStorageBrowserSessionToken(request)
  return cookie ? { token: cookie, source: 'cookie' } : null
}

const readCanvasRoomSessionCredential = (request: Request): AuthenticatedSessionCredential | null => {
  const bearer = readBearerSessionCredential(request)
  if (bearer) return bearer
  const queryToken = String(new URL(request.url).searchParams.get('kg_session_token') || '').trim()
  return queryToken ? { token: queryToken, source: 'bearer' } : null
}

const encodeHex = (bytes: Uint8Array): string =>
  Array.from(bytes).map(byte => byte.toString(16).padStart(2, '0')).join('')

export const hashAgenticGraphStorageAuthSessionToken = async (value: string): Promise<string> => {
  const input = normalizeString(value)
  const bytes = new TextEncoder().encode(input)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return encodeHex(new Uint8Array(digest))
}

const readWorkspaceSuffix = (pathname: string, prefix: string): string => {
  const suffix = pathname.startsWith(prefix) ? pathname.slice(prefix.length) : ''
  return normalizeString(decodeURIComponent(suffix))
}

const readAuditLimit = (request: Request): number => {
  const limit = Number(new URL(request.url).searchParams.get('limit') || '')
  return Number.isFinite(limit) ? Math.max(1, Math.min(200, Math.floor(limit))) : 50
}

const hasAuditAccessRole = (role: string): boolean =>
  role === 'owner' || role === 'provider-admin'

export const hasRelayAccessRole = (role: string): boolean =>
  role === 'editor' || role === 'owner' || role === 'provider-admin'

const clampAiGatewayCacheTtlSeconds = (value: unknown): string | null => {
  if (!Number.isFinite(Number(value))) return null
  return String(Math.max(1, Math.min(86_400, Math.floor(Number(value)))))
}

const deriveStorageRelayAiGatewayRoute = (payload: AgenticGraphStorageChatRelayRequest): string | null => {
  if (payload.providerId !== 'openai') return null
  const metadata = payload.aiGatewayMetadata && typeof payload.aiGatewayMetadata === 'object'
    ? payload.aiGatewayMetadata
    : null
  const intent = normalizeString(metadata?.intent)
  return intent === 'draft' ? 'dynamic/draft' : null
}

const deriveStorageRelayAiGatewayCacheTtlSeconds = (payload: AgenticGraphStorageChatRelayRequest): string | null => {
  if (payload.providerId !== 'openai') return null
  const route = normalizeString(payload.aiGatewayRoute) || deriveStorageRelayAiGatewayRoute(payload)
  if (!route) return null
  const metadata = payload.aiGatewayMetadata && typeof payload.aiGatewayMetadata === 'object'
    ? payload.aiGatewayMetadata
    : null
  const workspaceContextCacheKey = normalizeString(metadata?.workspace_context_cache_key)
  return workspaceContextCacheKey ? '120' : '60'
}

const mapPolicyRow = (row: Awaited<ReturnType<typeof readWorkspaceProviderPolicyRows>>[number]): AgenticGraphStorageChatPolicyRecord => ({
  workspaceId: row.workspace_id,
  providerId: row.provider_id as AgenticGraphStorageChatPolicyRecord['providerId'],
  allowServerManaged: Number(row.allow_server_managed || 0) === 1,
  allowByok: Number(row.allow_byok || 0) === 1,
  monthlyRequestLimit: row.monthly_request_limit == null ? null : Number(row.monthly_request_limit),
  monthlyTokenLimit: row.monthly_token_limit == null ? null : Number(row.monthly_token_limit),
  monthlySpendLimitCents: row.monthly_spend_limit_cents == null ? null : Number(row.monthly_spend_limit_cents),
  defaultModel: normalizeNullableString(row.default_model),
  updatedAtMs: normalizeIsoToMs(row.updated_at),
})

const mapAuditRow = (row: ChatProxyAuditRow): AgenticGraphStorageChatAuditEntry => ({
  id: row.id,
  workspaceId: row.workspace_id,
  userId: row.user_id,
  membershipId: row.membership_id,
  providerId: row.provider_id,
  authMode: row.auth_mode as AgenticGraphStorageChatAuditEntry['authMode'],
  requestId: normalizeNullableString(row.request_id),
  upstreamStatus: row.upstream_status == null ? null : Number(row.upstream_status),
  relayStatus: row.relay_status,
  modelId: normalizeNullableString(row.model_id),
  requestBytes: row.request_bytes == null ? null : Number(row.request_bytes),
  responseBytes: row.response_bytes == null ? null : Number(row.response_bytes),
  latencyMs: row.latency_ms == null ? null : Number(row.latency_ms),
  errorCode: normalizeNullableString(row.error_code),
  errorMessage: normalizeNullableString(row.error_message),
  createdAtMs: normalizeIsoToMs(row.created_at),
})

export type AuthenticatedChatContext = {
  credentialSource: 'bearer' | 'cookie'
  session: {
    id: string
    userId: string
    expiresAt: string
  }
  user: {
    id: string
    email: string
    displayName: string
    status: string
  }
}

export type AuthenticatedChatContextResult =
  | { ok: true; value: AuthenticatedChatContext }
  | { ok: false; response: Response }

export type AuthorizedMembershipResult =
  | { ok: true; membership: { id: string; role: AgenticGraphStorageChatRole; status: string } }
  | { ok: false; response: Response }

const readAuthenticatedContextForToken = async (
  credential: AuthenticatedSessionCredential | null,
  db: D1DatabaseLike,
): Promise<AuthenticatedChatContextResult> => {
  if (!credential?.token) {
    return { ok: false, response: errorResponse(401, 'forbidden', 'missing authenticated storage session token') }
  }
  const tokenHash = await hashAgenticGraphStorageAuthSessionToken(credential.token)
  const nowIso = new Date().toISOString()
  const session = await readActiveAuthSessionByHash(db, tokenHash, nowIso)
  if (!session) return { ok: false, response: errorResponse(401, 'forbidden', 'invalid or expired session') }
  if (normalizeString(session.user_status) !== 'active') {
    return { ok: false, response: errorResponse(403, 'forbidden', 'active user status is required') }
  }
  return {
    ok: true,
    value: {
      credentialSource: credential.source,
      session: {
        id: session.id,
        userId: session.user_id,
        expiresAt: session.expires_at,
      },
      user: {
        id: session.user_id,
        email: session.user_email,
        displayName: session.user_display_name,
        status: session.user_status,
      },
    },
  }
}

export const readAuthenticatedChatContext = async (
  request: Request,
  db: D1DatabaseLike,
): Promise<AuthenticatedChatContextResult> =>
  readAuthenticatedContextForToken(readBearerSessionCredential(request), db)

export const readAuthenticatedStorageSyncContext = async (
  request: Request,
  db: D1DatabaseLike,
): Promise<AuthenticatedChatContextResult> =>
  readAuthenticatedContextForToken(readStorageSnapshotSessionCredential(request), db)

export const readAuthenticatedBrowserSessionContext = async (
  request: Request,
  db: D1DatabaseLike,
): Promise<AuthenticatedChatContextResult> => {
  const cookie = readAgenticGraphStorageBrowserSessionToken(request)
  return readAuthenticatedContextForToken(
    cookie ? { token: cookie, source: 'cookie' } : null,
    db,
  )
}

export const readAuthenticatedCanvasRoomContext = async (
  request: Request,
  db: D1DatabaseLike,
): Promise<AuthenticatedChatContextResult> =>
  readAuthenticatedContextForToken(readCanvasRoomSessionCredential(request), db)

export const readAuthorizedMembership = async (args: {
  db: D1DatabaseLike
  workspaceId: string
  userId: string
}): Promise<AuthorizedMembershipResult> => {
  const membership = await readWorkspaceMembershipRow(args.db, args.workspaceId, args.userId)
  if (!membership) return { ok: false, response: errorResponse(403, 'forbidden', 'workspace membership is required') }
  return {
    ok: true,
    membership: {
      id: membership.id,
      role: membership.role as AgenticGraphStorageChatRole,
      status: membership.status,
    },
  }
}

const isAuthenticatedChatContextFailure = (
  value: AuthenticatedChatContextResult,
): value is Extract<AuthenticatedChatContextResult, { ok: false }> =>
  value.ok === false

const isAuthorizedMembershipFailure = (
  value: AuthorizedMembershipResult,
): value is Extract<AuthorizedMembershipResult, { ok: false }> =>
  value.ok === false

export const isAgenticGraphStorageChatRoute = (pathname: string): boolean =>
  pathname === AGENTICGRAPH_STORAGE_ROUTE_PATHS.chatSession
  || pathname === AGENTICGRAPH_STORAGE_ROUTE_PATHS.chatRelay
  || pathname.startsWith(AGENTICGRAPH_STORAGE_ROUTE_PATHS.chatPoliciesPrefix)
  || pathname.startsWith(AGENTICGRAPH_STORAGE_ROUTE_PATHS.chatAuditPrefix)

export const handleChatSession = async (request: Request, db: D1DatabaseLike): Promise<Response> => {
  const auth = await readAuthenticatedChatContext(request, db)
  if (isAuthenticatedChatContextFailure(auth)) return auth.response
  const memberships = await readWorkspaceMembershipRowsByUser(db, auth.value.user.id)
  const response: AgenticGraphStorageChatSessionResponse = {
    ok: true,
    apiVersion: AGENTICGRAPH_STORAGE_API_VERSION,
    user: {
      id: auth.value.user.id,
      email: auth.value.user.email,
      displayName: auth.value.user.displayName,
      status: auth.value.user.status,
    },
    session: {
      id: auth.value.session.id,
      expiresAt: auth.value.session.expiresAt,
    },
    memberships: memberships.map(row => ({
      workspaceId: row.workspace_id,
      role: row.role as AgenticGraphStorageChatRole,
      status: row.status,
    } satisfies AgenticGraphStorageChatSessionMembership)),
  }
  return json(200, response)
}

export const handleChatPolicies = async (request: Request, db: D1DatabaseLike): Promise<Response> => {
  const workspaceId = readWorkspaceSuffix(new URL(request.url).pathname, AGENTICGRAPH_STORAGE_ROUTE_PATHS.chatPoliciesPrefix)
  if (!workspaceId) return errorResponse(400, 'bad_request', 'workspaceId is required')
  const auth = await readAuthenticatedChatContext(request, db)
  if (isAuthenticatedChatContextFailure(auth)) return auth.response
  const membership = await readAuthorizedMembership({ db, workspaceId, userId: auth.value.user.id })
  if (isAuthorizedMembershipFailure(membership)) return membership.response
  const policies = await readWorkspaceProviderPolicyRows(db, workspaceId)
  const response: AgenticGraphStorageChatPoliciesResponse = {
    ok: true,
    apiVersion: AGENTICGRAPH_STORAGE_API_VERSION,
    workspaceId,
    membership: {
      userId: auth.value.user.id,
      role: membership.membership.role,
      status: membership.membership.status,
    },
    policies: policies.map(mapPolicyRow),
  }
  return json(200, response)
}

export const handleChatAudit = async (request: Request, db: D1DatabaseLike): Promise<Response> => {
  const workspaceId = readWorkspaceSuffix(new URL(request.url).pathname, AGENTICGRAPH_STORAGE_ROUTE_PATHS.chatAuditPrefix)
  if (!workspaceId) return errorResponse(400, 'bad_request', 'workspaceId is required')
  const auth = await readAuthenticatedChatContext(request, db)
  if (isAuthenticatedChatContextFailure(auth)) return auth.response
  const membership = await readAuthorizedMembership({ db, workspaceId, userId: auth.value.user.id })
  if (isAuthorizedMembershipFailure(membership)) return membership.response
  if (!hasAuditAccessRole(membership.membership.role)) {
    return errorResponse(403, 'forbidden', 'owner or provider-admin role is required')
  }
  const rows = await readChatProxyAuditRows(db, workspaceId, readAuditLimit(request))
  const response: AgenticGraphStorageChatAuditResponse = {
    ok: true,
    apiVersion: AGENTICGRAPH_STORAGE_API_VERSION,
    workspaceId,
    entries: rows.map(mapAuditRow),
  }
  return json(200, response)
}

const isChatRelayRequest = (value: unknown): value is AgenticGraphStorageChatRelayRequest => {
  if (!value || typeof value !== 'object') return false
  const record = value as Record<string, unknown>
  return (
    record.apiVersion === AGENTICGRAPH_STORAGE_API_VERSION
    && typeof record.workspaceId === 'string'
    && typeof record.providerId === 'string'
    && (record.authMode === 'serverManaged' || record.authMode === 'byok')
    && typeof record.model === 'string'
    && Array.isArray(record.messages)
    && (record.requestSurface == null || record.requestSurface === 'chat-completions' || record.requestSurface === 'responses')
    && (record.input == null || Array.isArray(record.input))
    && (record.aiGatewayRoute == null || typeof record.aiGatewayRoute === 'string')
    && (record.aiGatewayMetadata == null || typeof record.aiGatewayMetadata === 'object')
    && (record.aiGatewayCacheTtlSeconds == null || Number.isFinite(Number(record.aiGatewayCacheTtlSeconds)))
    && (record.providerOptions == null || typeof record.providerOptions === 'object')
  )
}

const readDefaultPolicy = (args: {
  workspaceId: string
  providerId: string
}): AgenticGraphStorageChatPolicyRecord => ({
  workspaceId: args.workspaceId,
  providerId: args.providerId as AgenticGraphStorageChatPolicyRecord['providerId'],
  allowServerManaged: false,
  allowByok: true,
  monthlyRequestLimit: null,
  monthlyTokenLimit: null,
  monthlySpendLimitCents: null,
  defaultModel: null,
  updatedAtMs: null,
})

export const handleChatRelay = async (
  request: Request,
  env: AgenticGraphStorageWorkerEnv,
  db: D1DatabaseLike,
): Promise<Response> => {
  const auth = await readAuthenticatedChatContext(request, db)
  if (isAuthenticatedChatContextFailure(auth)) {
    await cancelChatRelayBody(request.body, 'chat relay authentication failed')
    return auth.response
  }
  const parsed = await readBoundedChatRelayRequestJson(request)
  if (parsed.ok === false) return errorResponse(parsed.status, 'bad_request', parsed.error)
  const payload = parsed.value
  if (!isChatRelayRequest(payload)) return errorResponse(400, 'bad_request', 'invalid chat relay request payload')
  const membership = await readAuthorizedMembership({ db, workspaceId: payload.workspaceId, userId: auth.value.user.id })
  if (isAuthorizedMembershipFailure(membership)) return membership.response
  if (!hasRelayAccessRole(membership.membership.role)) {
    return errorResponse(403, 'forbidden', 'editor, owner, or provider-admin role is required')
  }
  const policyRow = await readWorkspaceProviderPolicyRow(db, payload.workspaceId, payload.providerId)
  const policy = policyRow ? mapPolicyRow(policyRow) : readDefaultPolicy({
    workspaceId: payload.workspaceId,
    providerId: payload.providerId,
  })
  if (payload.authMode === 'serverManaged' && !policy.allowServerManaged) {
    return errorResponse(403, 'forbidden', 'server-managed relay mode is not enabled for this workspace provider')
  }
  if (payload.authMode === 'byok' && !policy.allowByok) {
    return errorResponse(403, 'forbidden', 'BYOK relay mode is not enabled for this workspace provider')
  }
  if (payload.authMode === 'byok' && !normalizeString(payload.byokApiKey)) {
    return errorResponse(400, 'bad_request', 'byokApiKey is required when authMode=byok')
  }
  if (payload.stream === true) {
    return errorResponse(400, 'bad_request', 'stream relay is not supported by the storage chat relay yet')
  }
  const proxyBaseUrl = normalizeString(env.AGENTICGRAPH_STORAGE_CHAT_PROXY_BASE_URL)
  if (!proxyBaseUrl) return errorResponse(500, 'server_error', 'missing AGENTICGRAPH_STORAGE_CHAT_PROXY_BASE_URL')
  let proxyUrl: URL
  try {
    proxyUrl = new URL('/__chat_proxy/v1/chat/completions', proxyBaseUrl.endsWith('/') ? proxyBaseUrl : `${proxyBaseUrl}/`)
  } catch {
    return errorResponse(500, 'server_error', 'invalid AGENTICGRAPH_STORAGE_CHAT_PROXY_BASE_URL')
  }
  const requestId = normalizeString(request.headers.get('x-client-request-id')) || buildAuditId()
  const proxyHeaders = new Headers({
    'content-type': 'application/json',
    accept: 'application/json',
    'x-kg-chat-provider': payload.providerId,
    'x-client-request-id': requestId,
  })
  if (payload.endpointUrl) proxyHeaders.set('x-kg-chat-upstream', String(payload.endpointUrl).trim())
  if (payload.authMode === 'byok' && payload.byokApiKey) proxyHeaders.set('x-kg-chat-api-key', payload.byokApiKey.trim())
  const aiGatewayRoute = normalizeString(payload.aiGatewayRoute) || deriveStorageRelayAiGatewayRoute(payload)
  if (aiGatewayRoute) proxyHeaders.set('x-kg-ai-gateway-route', aiGatewayRoute)
  if (payload.aiGatewayMetadata && typeof payload.aiGatewayMetadata === 'object') {
    proxyHeaders.set('x-kg-ai-gateway-metadata', JSON.stringify(payload.aiGatewayMetadata))
  }
  const aiGatewayCacheTtlSeconds = clampAiGatewayCacheTtlSeconds(payload.aiGatewayCacheTtlSeconds)
    || deriveStorageRelayAiGatewayCacheTtlSeconds(payload)
  if (aiGatewayCacheTtlSeconds) {
    proxyHeaders.set('x-kg-ai-gateway-cache-ttl', aiGatewayCacheTtlSeconds)
  }
  const useResponsesInput = payload.requestSurface === 'responses' && Array.isArray(payload.input)
  const providerOptions = payload.providerOptions && typeof payload.providerOptions === 'object'
    ? payload.providerOptions
    : {}
  const requestBody = JSON.stringify({
    model: payload.model,
    ...providerOptions,
    ...(useResponsesInput
      ? { input: payload.input }
      : { messages: payload.messages }),
    stream: false,
  })
  const requestBytes = new TextEncoder().encode(requestBody).byteLength
  const startedAtMs = Date.now()
  let upstreamStatus: number | null = null
  let responseBytes: number | null = null
  let errorMessage: string | null = null
  let relayStatus = 'allowed'
  let responseBody: unknown = null
  try {
    const proxyResponse = await fetch(proxyUrl.toString(), {
      method: 'POST',
      headers: proxyHeaders,
      body: requestBody,
    })
    upstreamStatus = proxyResponse.status
    const boundedResponse = await readBoundedChatRelayResponseJson(proxyResponse)
    responseBytes = boundedResponse.bytes
    if (boundedResponse.ok === false) {
      relayStatus = 'upstream_error'
      errorMessage = boundedResponse.error
    } else {
      responseBody = boundedResponse.value
    }
    if (boundedResponse.ok && !proxyResponse.ok) {
      relayStatus = 'upstream_error'
      errorMessage = normalizeNullableString((responseBody as { error?: unknown } | null)?.error)
        || proxyResponse.statusText
        || 'chat relay upstream failed'
    }
  } catch {
    relayStatus = 'network_error'
    errorMessage = 'chat relay proxy request failed'
  }
  const createdAtIso = new Date().toISOString()
  await writeChatProxyAuditRow(db, {
    id: buildAuditId(),
    workspaceId: payload.workspaceId,
    userId: auth.value.user.id,
    membershipId: membership.membership.id,
    providerId: payload.providerId,
    authMode: payload.authMode,
    requestId,
    upstreamStatus,
    relayStatus,
    modelId: payload.model,
    requestBytes,
    responseBytes,
    latencyMs: Date.now() - startedAtMs,
    errorCode: relayStatus === 'allowed' ? null : relayStatus,
    errorMessage,
    createdAt: createdAtIso,
  })
  if (relayStatus !== 'allowed') {
    return errorResponse(upstreamStatus && upstreamStatus >= 400 ? upstreamStatus : 502, 'server_error', errorMessage || 'chat relay request failed')
  }
  const response: AgenticGraphStorageChatRelayResponse = {
    ok: true,
    apiVersion: AGENTICGRAPH_STORAGE_API_VERSION,
    workspaceId: payload.workspaceId,
    providerId: payload.providerId,
    authMode: payload.authMode,
    upstreamStatus: upstreamStatus || 200,
    relayStatus: 'allowed',
    body: responseBody,
  }
  return json(200, response)
}
