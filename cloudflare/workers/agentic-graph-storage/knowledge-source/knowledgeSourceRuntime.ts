import {
  AGENTIC_OS_KNOWLEDGE_SOURCE_API_VERSION,
  AGENTIC_OS_STORAGE_ROUTE_PATHS,
  type AgenticGraphKnowledgeSourceHandoffRequest,
  type AgenticGraphKnowledgeSourceHandoffResponse,
  type AgenticGraphKnowledgeSourceReadRequest,
  type AgenticGraphStorageWorkerEnv,
} from '../contract'
import {
  readAuthenticatedChatContext,
  readAuthorizedMembership,
  type AuthenticatedChatContext,
} from '../chatAuth'
import type { D1DatabaseLike } from '../db'
import { StorageRelayOpaqueTokenCodec } from '../storage-relay/storageRelayOpaqueToken'
import {
  authorizeStorageRelayRequest,
  createStorageRelayOperationId,
  readStorageRelayJsonRequest,
  StorageRelayError,
  StorageRelayOperation,
  type StorageRelayAuthHooks,
  type StorageRelayFetch,
} from '../storage-relay/storageRelaySafety'
import {
  KnowledgeSourceError,
  isKnowledgeSourcePlaceholder,
  isKnowledgeSourceRecord,
  readKnowledgeSourceText,
  type KnowledgeSourceErrorCode,
} from './knowledgeSourceContract'
import { readKnowledgeSourceAllowlist, resolveKnowledgeSource } from './knowledgeSourceRegistry'
import { buildKnowledgeSourceSnapshotEnvelope } from './knowledgeSourceProvenance'
import { createLarkAccessTokenSource } from './larkAccessToken'
import { LarkKnowledgeSourceProvider } from './larkKnowledgeSourceProvider'

const HANDOFF_TTL_MS = 5 * 60_000
const SOURCE_ALIAS_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u
const WORKSPACE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/u

type HandoffPayload = {
  userId: string
  sessionId: string
  identityMode: 'tenant-app' | 'user-oauth'
  allowlistRevision: string
  allowlistDigest: string
}

const createAuthHooks = (db: D1DatabaseLike): StorageRelayAuthHooks<AuthenticatedChatContext> => ({
  async authenticate({ request }) {
    const result = await readAuthenticatedChatContext(request, db)
    return result.ok ? result.value : null
  },
  async authorizeMembership({ authContext, workspaceId }) {
    const result = await readAuthorizedMembership({ db, workspaceId, userId: authContext.user.id })
    return result.ok ? { role: result.membership.role, status: result.membership.status } : null
  },
})

const readSigningSecret = (env: AgenticGraphStorageWorkerEnv): string => {
  const secret = readKnowledgeSourceText(env.AGENTIC_OS_STORAGE_SIGNING_SECRET)
  if (isKnowledgeSourcePlaceholder(secret) || secret.length < 16) {
    throw new KnowledgeSourceError({ code: 'identity_not_available', status: 503 })
  }
  return secret
}

const validateCommonRequest = (
  value: unknown,
  allowedKeys: readonly string[],
): AgenticGraphKnowledgeSourceHandoffRequest & Record<string, unknown> => {
  if (!isKnowledgeSourceRecord(value)) {
    throw new KnowledgeSourceError({ code: 'invalid_request', status: 400 })
  }
  if (Object.keys(value).some(key => !allowedKeys.includes(key))) {
    throw new KnowledgeSourceError({ code: 'invalid_request', status: 400 })
  }
  const workspaceId = readKnowledgeSourceText(value.workspaceId)
  const sourceId = readKnowledgeSourceText(value.sourceId)
  if (
    value.apiVersion !== AGENTIC_OS_KNOWLEDGE_SOURCE_API_VERSION
    || !WORKSPACE_ID_PATTERN.test(workspaceId)
    || !SOURCE_ALIAS_PATTERN.test(sourceId)
  ) {
    throw new KnowledgeSourceError({ code: 'invalid_request', status: 400 })
  }
  return { ...value, apiVersion: AGENTIC_OS_KNOWLEDGE_SOURCE_API_VERSION, workspaceId, sourceId }
}

const readHandoffRequest = (value: unknown): AgenticGraphKnowledgeSourceHandoffRequest =>
  validateCommonRequest(value, ['apiVersion', 'workspaceId', 'sourceId'])

const readSnapshotRequest = (value: unknown): AgenticGraphKnowledgeSourceReadRequest => {
  const common = validateCommonRequest(value, ['apiVersion', 'workspaceId', 'sourceId', 'token'])
  const token = readKnowledgeSourceText(common.token)
  if (!token || token.length > 16_384) {
    throw new KnowledgeSourceError({ code: 'invalid_request', status: 400 })
  }
  return { ...common, token }
}

const jsonResponse = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  })

const mapError = (error: unknown): KnowledgeSourceError => {
  if (error instanceof KnowledgeSourceError) return error
  if (error instanceof StorageRelayError) {
    const mappedCode: Partial<Record<StorageRelayError['code'], KnowledgeSourceErrorCode>> = {
      auth_required: 'auth_required',
      membership_forbidden: 'membership_forbidden',
      provider_not_configured: 'identity_not_available',
      provider_auth_failed: 'provider_auth_failed',
      not_found: 'not_found',
      rate_limited: 'rate_limited',
      timeout: 'timeout',
      limit_exceeded: 'limit_exceeded',
      upstream_unavailable: 'upstream_unavailable',
      invalid_request: 'invalid_request',
      invalid_response: 'invalid_response',
    }
    return new KnowledgeSourceError({
      code: mappedCode[error.code] ?? 'invalid_response',
      status: error.status,
      retryable: error.retryable,
    })
  }
  return new KnowledgeSourceError({ code: 'upstream_unavailable', status: 502, retryable: true })
}

const errorResponse = (error: unknown, operationId: string): Response => {
  const mapped = mapError(error)
  return jsonResponse(mapped.status, {
    ok: false,
    apiVersion: AGENTIC_OS_KNOWLEDGE_SOURCE_API_VERSION,
    code: mapped.code,
    retryable: mapped.retryable,
    operationId,
  })
}

export const isAgenticGraphKnowledgeSourceRoute = (pathname: string): boolean =>
  pathname === AGENTIC_OS_STORAGE_ROUTE_PATHS.knowledgeSourceHandoff
  || pathname === AGENTIC_OS_STORAGE_ROUTE_PATHS.knowledgeSourceRead

export const handleKnowledgeSourceRequest = async (args: {
  request: Request
  pathname: string
  env: AgenticGraphStorageWorkerEnv
  db: D1DatabaseLike
  fetcher?: StorageRelayFetch
  now?: () => number
}): Promise<Response> => {
  const operationId = createStorageRelayOperationId(args.request)
  const operation = new StorageRelayOperation({ fetcher: args.fetcher })
  try {
    if (args.request.method !== 'POST') {
      throw new KnowledgeSourceError({ code: 'invalid_request', status: 405 })
    }
    const rawBody = await readStorageRelayJsonRequest<unknown>(args.request, operation.budget)
    const requestBody = args.pathname === AGENTIC_OS_STORAGE_ROUTE_PATHS.knowledgeSourceHandoff
      ? readHandoffRequest(rawBody)
      : readSnapshotRequest(rawBody)
    const isHandoffIssuance = args.pathname === AGENTIC_OS_STORAGE_ROUTE_PATHS.knowledgeSourceHandoff
    const authContext = isHandoffIssuance
      ? (await authorizeStorageRelayRequest({
          request: args.request,
          workspaceId: requestBody.workspaceId,
          access: 'read',
          hooks: createAuthHooks(args.db),
          signal: operation.signal,
        })).authContext
      : null
    const allowlist = await readKnowledgeSourceAllowlist(args.env)
    const source = resolveKnowledgeSource({
      allowlist,
      workspaceId: requestBody.workspaceId,
      sourceId: requestBody.sourceId,
    })
    const accessToken = await createLarkAccessTokenSource(args.env, { now: args.now })
    const tokenCodec = new StorageRelayOpaqueTokenCodec({
      secret: readSigningSecret(args.env),
      now: args.now,
    })
    const binding = {
      purpose: 'entry' as const,
      workspaceId: requestBody.workspaceId,
      providerId: 'lark',
      rootKey: requestBody.sourceId,
    }
    if (isHandoffIssuance && authContext) {
      const token = await tokenCodec.seal<HandoffPayload>({
        binding,
        ttlMs: HANDOFF_TTL_MS,
        payload: {
          userId: authContext.user.id,
          sessionId: authContext.session.id,
          identityMode: accessToken.mode,
          allowlistRevision: allowlist.revision,
          allowlistDigest: allowlist.digest,
        },
      })
      const response: AgenticGraphKnowledgeSourceHandoffResponse = {
        ok: true,
        apiVersion: AGENTIC_OS_KNOWLEDGE_SOURCE_API_VERSION,
        workspaceId: requestBody.workspaceId,
        sourceId: requestBody.sourceId,
        provider: 'lark',
        kind: source.kind,
        token,
        expiresAtMs: (args.now ?? Date.now)() + HANDOFF_TTL_MS,
      }
      return jsonResponse(200, response)
    }
    const readRequest = requestBody as AgenticGraphKnowledgeSourceReadRequest
    const payload = await tokenCodec.open<HandoffPayload>({ token: readRequest.token, binding })
    if (
      payload.identityMode !== accessToken.mode
      || payload.allowlistRevision !== allowlist.revision
      || payload.allowlistDigest !== allowlist.digest
    ) {
      throw new KnowledgeSourceError({ code: 'source_config_drift', status: 409 })
    }
    const provider = new LarkKnowledgeSourceProvider(accessToken)
    const result = await provider.read({ source, operation })
    return jsonResponse(200, await buildKnowledgeSourceSnapshotEnvelope({
      allowlist,
      identityMode: provider.identityMode,
      source,
      result,
      now: args.now,
    }))
  } catch (error) {
    return errorResponse(error, operationId)
  } finally {
    operation.dispose()
  }
}
