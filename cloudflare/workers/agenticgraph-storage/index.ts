import {
  AGENTICGRAPH_STORAGE_API_VERSION,
  AGENTICGRAPH_STORAGE_ROUTE_PATHS,
  AGENTICGRAPH_STORAGE_SYNC_LIMITS,
  type AgenticGraphStorageErrorResponse,
  type AgenticGraphStorageExportResponse,
  type AgenticGraphStorageMutationAck,
  type AgenticGraphStoragePullChanges,
  type AgenticGraphStoragePullRequest,
  type AgenticGraphStoragePullResponse,
  type AgenticGraphStoragePushRequest,
  type AgenticGraphStoragePushResponse,
  type AgenticGraphStorageWorkerEnv,
} from './contract'
import {
  type D1DatabaseLike,
  ensureSyncDeviceRow,
  ensureWorkspaceRow,
  execute,
  normalizeString,
  pruneStaleSyncEvents,
  readDb,
  writeSyncEvent,
} from './db'
import {
  acknowledgeRejected,
  processAgenticGraphStorageMutation,
  validateAgenticGraphStorageMutation,
} from './mutationProcessor'
import { handleCollaborationSave } from './collaborationBridge'
import { AgenticGraphCanvasSyncRoom } from './canvasSyncRoom'
import {
  deriveAgenticGraphCanvasRoomDevicePrincipalId,
  readAgenticGraphCanvasRoomProxyIdentity,
} from './canvasRoomProxyIdentity'
import {
  handleChatAudit,
  handleChatPolicies,
  handleChatRelay,
  handleChatSession,
  readAuthenticatedCanvasRoomContext,
  readAuthorizedMembership,
  isAgenticGraphStorageChatRoute,
} from './chatAuth'
import { readTravelAgencyMembershipSide } from './travelAgencySide'
import {
  handleStorageRelayRequest,
  isAgenticGraphStorageRelayRoute,
} from './storageRelayRuntime'
import {
  handleKnowledgeSourceRequest,
  isAgenticGraphKnowledgeSourceRoute,
} from './knowledge-source/knowledgeSourceRuntime'
import { probeTravelMutationTriggerReadiness } from './sharedCanvasNode/travelMutationReadiness'
import type { TravelMutationTriggerEnv } from './sharedCanvasNode/travelMutationConfig'
import {
  authenticateAgenticGraphStorageSnapshotRequest,
  authorizeAgenticGraphStorageWorkspace,
  readBoundedAgenticGraphStorageSyncJson,
  type AgenticGraphStorageSyncPrincipal,
} from './storageSyncSecurity'
import {
  handleAgenticGraphStorageBrowserSessionRoute,
  isAgenticGraphStorageBrowserSessionRoute,
  isAgenticGraphStorageSameOriginCookieMutation,
  readAgenticGraphStorageBrowserSessionConfiguration,
} from './storageBrowserSession'
import { handleSecuredAgenticGraphStorageDataRoute } from './storagePublicRouteSecurity'
import {
  AgenticGraphStorageSyncResultLimitError,
  readAgenticGraphStoragePullPage,
} from './storageSyncReadRuntime'
import { handleSecuredAgenticGraphStorageDocumentRoute } from './storageDocumentRouteSecurity'

const CORS_HEADERS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET,HEAD,POST,PUT,PATCH,DELETE,OPTIONS',
  'access-control-allow-headers': 'content-type,authorization,x-client-request-id,x-agenticgraph-session-token,x-agenticgraph-media-capability,x-agenticgraph-content-hash,x-agenticgraph-content-kind,x-agenticgraph-content-sha256,x-agenticgraph-file-sync-meta',
  'access-control-expose-headers': 'x-agenticgraph-file-sync-meta',
  'access-control-max-age': '86400',
}

const jsonHeaders = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
  ...CORS_HEADERS,
}

const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), { status, headers: jsonHeaders })

const noContent = (): Response =>
  new Response(null, { status: 204, headers: CORS_HEADERS })

const withCorsHeaders = (response: Response): Response => {
  const headers = new Headers(response.headers)
  for (const [name, value] of Object.entries(CORS_HEADERS)) headers.set(name, value)
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}

const errorResponse = (
  status: number,
  code: AgenticGraphStorageErrorResponse['code'],
  error: string,
): Response => {
  const body: AgenticGraphStorageErrorResponse = {
    ok: false,
    apiVersion: AGENTICGRAPH_STORAGE_API_VERSION,
    error,
    code,
  }
  return json(status, body)
}

const okPushResponse = (body: Omit<AgenticGraphStoragePushResponse, 'ok' | 'apiVersion'>): Response =>
  json(200, {
    ok: true,
    apiVersion: AGENTICGRAPH_STORAGE_API_VERSION,
    ...body,
  } satisfies AgenticGraphStoragePushResponse)

const okPullResponse = (body: Omit<AgenticGraphStoragePullResponse, 'ok' | 'apiVersion'>): Response =>
  json(200, {
    ok: true,
    apiVersion: AGENTICGRAPH_STORAGE_API_VERSION,
    ...body,
  } satisfies AgenticGraphStoragePullResponse)

const okExportResponse = (body: Omit<AgenticGraphStorageExportResponse, 'ok' | 'apiVersion'>): Response =>
  json(200, {
    ok: true,
    apiVersion: AGENTICGRAPH_STORAGE_API_VERSION,
    ...body,
  } satisfies AgenticGraphStorageExportResponse)

const handleCanvasRoomProxy = async (
  request: Request,
  env: AgenticGraphStorageWorkerEnv,
  db: D1DatabaseLike,
): Promise<Response> => {
  if (request.method !== 'GET') {
    return errorResponse(405, 'bad_request', 'unsupported canvas room route method')
  }
  const route = readAgenticGraphCanvasRoomProxyIdentity(request, AGENTICGRAPH_STORAGE_ROUTE_PATHS.canvasRoomPrefix)
  if (!route) return errorResponse(400, 'bad_request', 'workspaceId and roomId are required')
  const auth = await readAuthenticatedCanvasRoomContext(request, db)
  if (auth.ok === false) return auth.response
  const membership = await readAuthorizedMembership({
    db,
    workspaceId: route.workspaceId,
    userId: auth.value.user.id,
  })
  if (membership.ok === false) return membership.response
  const devicePrincipalId = await deriveAgenticGraphCanvasRoomDevicePrincipalId(route, auth.value.user.id)
  const namespace = env.AGENTICGRAPH_CANVAS_ROOM
  if (!namespace) return errorResponse(500, 'server_error', 'missing Cloudflare Durable Object binding AGENTICGRAPH_CANVAS_ROOM')
  const roomStub = namespace.get(namespace.idFromName(`${route.workspaceId}:${route.roomId}`))
  if (!route.deviceIdValid) {
    return errorResponse(400, 'bad_request', 'authenticated canvas room connection requires a valid device id')
  }
  const targetPath = route.websocketUpgrade ? '/connect' : '/status'
  const headers = new Headers(request.headers)
  headers.set('x-agenticgraph-room-workspace-id', route.workspaceId)
  headers.set('x-agenticgraph-room-id', route.roomId)
  headers.set('x-agenticgraph-user-id', auth.value.user.id)
  headers.set('x-agenticgraph-session-id', auth.value.session.id)
  if (devicePrincipalId) headers.set('x-agenticgraph-device-principal-id', devicePrincipalId)
  headers.set('x-agenticgraph-user-display-name', normalizeString(auth.value.user.displayName) || normalizeString(auth.value.user.email) || auth.value.user.id)
  headers.set('x-agenticgraph-room-role', membership.membership.role)
  const side = await readTravelAgencyMembershipSide({
    db,
    workspaceId: route.workspaceId,
    userId: auth.value.user.id,
    membershipId: membership.membership.id,
    role: membership.membership.role,
  })
  if (side) {
    headers.set('x-agenticgraph-room-membership-id', side.membershipId)
    headers.set('x-agenticgraph-room-transaction-side', side.transactionSide)
  }
  const roomUrl = `https://agenticgraph.internal${targetPath}?workspaceId=${encodeURIComponent(route.workspaceId)}&roomId=${encodeURIComponent(route.roomId)}`
  return roomStub.fetch(new Request(roomUrl, {
    method: 'GET',
    headers,
  }))
}

export { AgenticGraphCanvasSyncRoom }

const isPushRequest = (value: unknown): value is AgenticGraphStoragePushRequest => {
  if (!value || typeof value !== 'object') return false
  const record = value as Record<string, unknown>
  return (
    record.apiVersion === AGENTICGRAPH_STORAGE_API_VERSION
    && typeof record.workspaceId === 'string'
    && typeof record.deviceId === 'string'
    && Array.isArray(record.mutations)
  )
}

const isPullRequest = (value: unknown): value is AgenticGraphStoragePullRequest => {
  if (!value || typeof value !== 'object') return false
  const record = value as Record<string, unknown>
  return (
    record.apiVersion === AGENTICGRAPH_STORAGE_API_VERSION
    && typeof record.workspaceId === 'string'
    && typeof record.deviceId === 'string'
    && (typeof record.since === 'string' || record.since == null)
    && (typeof record.pageCursor === 'string' || record.pageCursor == null)
    && (record.knownChunks == null || Array.isArray(record.knownChunks))
  )
}

const jsonByteLength = (value: unknown): number =>
  new TextEncoder().encode(JSON.stringify(value)).byteLength

const resultLimitResponse = (error: AgenticGraphStorageSyncResultLimitError): Response =>
  errorResponse(413, 'bad_request', error.message)

const handlePush = async (
  request: Request,
  db: D1DatabaseLike,
  principal: AgenticGraphStorageSyncPrincipal,
): Promise<Response> => {
  const parsed = await readBoundedAgenticGraphStorageSyncJson(request)
  if (parsed.ok === false) return parsed.response
  const body = parsed.value
  if (!isPushRequest(body)) return errorResponse(400, 'bad_request', 'invalid storage push request')
  const workspaceId = normalizeString(body.workspaceId)
  const deviceId = normalizeString(body.deviceId)
  if (!workspaceId || !deviceId) return errorResponse(400, 'bad_request', 'workspaceId and deviceId are required')
  const authorization = await authorizeAgenticGraphStorageWorkspace({ db, workspaceId, principal, access: 'write' })
  if (authorization.ok === false) return authorization.response
  if (body.mutations.length > AGENTICGRAPH_STORAGE_SYNC_LIMITS.maxPushMutations) {
    return errorResponse(
      413,
      'bad_request',
      `storage push exceeds the ${AGENTICGRAPH_STORAGE_SYNC_LIMITS.maxPushMutations} mutation limit`,
    )
  }
  if (body.mutations.some(mutation => jsonByteLength(mutation) > AGENTICGRAPH_STORAGE_SYNC_LIMITS.maxMutationBytes)) {
    return errorResponse(
      413,
      'bad_request',
      `storage mutation exceeds the ${AGENTICGRAPH_STORAGE_SYNC_LIMITS.maxMutationBytes} byte limit`,
    )
  }
  const nowIso = new Date().toISOString()
  const serverTimeMs = Date.parse(nowIso)
  await ensureWorkspaceRow(db, workspaceId, nowIso)
  await ensureSyncDeviceRow(db, workspaceId, deviceId, nowIso)
  const acknowledgements: AgenticGraphStorageMutationAck[] = []
  const documentIdAliases = new Map<string, string>()
  for (const mutation of body.mutations) {
    const mismatch = validateAgenticGraphStorageMutation(workspaceId, mutation)
    if (mismatch) {
      acknowledgements.push(acknowledgeRejected(mutation, mismatch))
      continue
    }
    acknowledgements.push(await processAgenticGraphStorageMutation({
      db,
      workspaceId,
      nowIso,
      documentIdAliases,
    }, mutation))
  }
  await execute(
    db,
    'UPDATE sync_devices SET last_push_cursor = ?, updated_at = ? WHERE id = ? AND workspace_id = ?',
    [nowIso, nowIso, deviceId, workspaceId],
  )
  await writeSyncEvent(db, {
    workspaceId,
    deviceId,
    eventType: 'push',
    payload: { mutationCount: body.mutations.length, acknowledgements },
    nowIso,
  })
  await pruneStaleSyncEvents(db, nowIso)
  return okPushResponse({
    workspaceId,
    ackCursor: nowIso,
    serverTimeMs,
    acknowledgements,
  })
}

const handlePull = async (
  request: Request,
  db: D1DatabaseLike,
  principal: AgenticGraphStorageSyncPrincipal,
): Promise<Response> => {
  const parsed = await readBoundedAgenticGraphStorageSyncJson(request)
  if (parsed.ok === false) return parsed.response
  const body = parsed.value
  const pullRequest = isPullRequest(body) ? body : null
  if (!pullRequest) return errorResponse(400, 'bad_request', 'invalid storage pull request')
  const workspaceId = normalizeString(pullRequest.workspaceId)
  const deviceId = normalizeString(pullRequest.deviceId)
  if (!workspaceId || !deviceId) return errorResponse(400, 'bad_request', 'workspaceId and deviceId are required')
  const authorization = await authorizeAgenticGraphStorageWorkspace({ db, workspaceId, principal, access: 'read' })
  if (authorization.ok === false) return authorization.response
  const nowIso = new Date().toISOString()
  const serverTimeMs = Date.parse(nowIso)
  let page
  try {
    page = await readAgenticGraphStoragePullPage(
      db,
      workspaceId,
      pullRequest.since,
      Array.isArray(pullRequest.knownChunks) ? pullRequest.knownChunks : [],
      normalizeString(pullRequest.pageCursor) || null,
      nowIso,
    )
  } catch (error) {
    if (error instanceof AgenticGraphStorageSyncResultLimitError) return resultLimitResponse(error)
    throw error
  }
  const changes: AgenticGraphStoragePullChanges = page.changes
  const hasChanges =
    changes.documents.length > 0
    || changes.documentChunks.length > 0
    || changes.graphSnapshots.length > 0
  if (page.pageComplete) {
    await ensureWorkspaceRow(db, workspaceId, nowIso)
    await ensureSyncDeviceRow(db, workspaceId, deviceId, nowIso)
    await execute(
      db,
      'UPDATE sync_devices SET last_pull_cursor = ?, updated_at = ? WHERE id = ? AND workspace_id = ?',
      [page.snapshotAt, nowIso, deviceId, workspaceId],
    )
  }
  return okPullResponse({
    workspaceId,
    nextCursor: page.pageComplete ? page.snapshotAt : normalizeString(pullRequest.since),
    nextPageCursor: page.nextPageCursor,
    pageComplete: page.pageComplete,
    serverTimeMs,
    changes,
  })
}

const handleExport = async (
  request: Request,
  db: D1DatabaseLike,
  principal: AgenticGraphStorageSyncPrincipal,
): Promise<Response> => {
  const url = new URL(request.url)
  const pathname = url.pathname
  const encodedWorkspaceId = pathname.slice(AGENTICGRAPH_STORAGE_ROUTE_PATHS.exportPrefix.length)
  const workspaceId = normalizeString(decodeURIComponent(encodedWorkspaceId || ''))
  if (!workspaceId) return errorResponse(400, 'bad_request', 'workspaceId is required')
  const authorization = await authorizeAgenticGraphStorageWorkspace({ db, workspaceId, principal, access: 'read' })
  if (authorization.ok === false) return authorization.response
  const nowIso = new Date().toISOString()
  let page
  try {
    page = await readAgenticGraphStoragePullPage(
      db,
      workspaceId,
      null,
      [],
      normalizeString(url.searchParams.get('cursor')) || null,
      nowIso,
    )
  } catch (error) {
    if (error instanceof AgenticGraphStorageSyncResultLimitError) return resultLimitResponse(error)
    throw error
  }
  return okExportResponse({
    workspaceId,
    exportedAtMs: Date.parse(nowIso),
    nextPageCursor: page.nextPageCursor,
    pageComplete: page.pageComplete,
    documents: page.changes.documents,
    documentChunks: page.changes.documentChunks,
    graphSnapshots: page.changes.graphSnapshots,
  })
}

const hasCanvasRoomBinding = (value: unknown): boolean => {
  if (!value || typeof value !== 'object') return false
  const binding = value as Record<string, unknown>
  return typeof binding.idFromName === 'function' && typeof binding.get === 'function'
}

const handleReadiness = async (env: AgenticGraphStorageWorkerEnv): Promise<Response> => {
  const d1 = readDb(env) ? 'ready' : 'missing'
  const canvasRoom = hasCanvasRoomBinding(env.AGENTICGRAPH_CANVAS_ROOM) ? 'ready' : 'missing'
  const browserSessionAccessConfiguration = String(env.AGENTICGRAPH_STORAGE_LOCAL_RUNTIME || '').trim() === 'true'
    ? 'local-only'
    : readAgenticGraphStorageBrowserSessionConfiguration(env).ok ? 'configured' : 'missing'
  const travelMutationTrigger = await probeTravelMutationTriggerReadiness(
    env as AgenticGraphStorageWorkerEnv & TravelMutationTriggerEnv,
  )
  const signingSecret = String(env.AGENTICGRAPH_STORAGE_SIGNING_SECRET || '').length >= 32
    ? 'ready'
    : String(env.AGENTICGRAPH_STORAGE_LOCAL_RUNTIME || '').trim() === 'true' ? 'local-only' : 'missing'
  const reasons = [
    ...(d1 === 'ready' ? [] : ['d1-binding-missing']),
    ...(canvasRoom === 'ready' ? [] : ['canvas-room-binding-missing']),
    ...(browserSessionAccessConfiguration === 'missing' ? ['storage-browser-session-access-configuration-missing'] : []),
    ...(signingSecret === 'missing' ? ['storage-signing-secret-missing'] : []),
    ...travelMutationTrigger.reasons,
  ]
  const ok = reasons.length === 0
  return json(ok ? 200 : 503, {
    ok,
    service: 'agenticgraph-storage',
    apiVersion: AGENTICGRAPH_STORAGE_API_VERSION,
    dependencies: { d1, canvasRoom, browserSessionAccessConfiguration, signingSecret, travelMutationTrigger },
    reasons,
  })
}

export const createAgenticGraphStorageWorker = () => ({
  async fetch(request: Request, env: AgenticGraphStorageWorkerEnv): Promise<Response> {
    if (request.method === 'OPTIONS') {
      return noContent()
    }
    const url = new URL(request.url)
    try {
      if (url.pathname === '/livez' || url.pathname === '/api/storage/livez') {
        if (request.method !== 'GET' && request.method !== 'HEAD') {
          return new Response(null, { status: 405, headers: { allow: 'GET, HEAD', ...CORS_HEADERS } })
        }
        const response = json(200, { ok: true, service: 'agenticgraph-storage', status: 'live' })
        return request.method === 'HEAD' ? new Response(null, { status: response.status, headers: response.headers }) : response
      }
      if (url.pathname === '/readyz' || url.pathname === '/api/storage/readyz') {
        if (request.method !== 'GET' && request.method !== 'HEAD') {
          return new Response(null, { status: 405, headers: { allow: 'GET, HEAD', ...CORS_HEADERS } })
        }
        const response = await handleReadiness(env)
        return request.method === 'HEAD' ? new Response(null, { status: response.status, headers: response.headers }) : response
      }
      if (!isAgenticGraphStorageSameOriginCookieMutation(request)) {
        return errorResponse(403, 'forbidden', 'cookie-authenticated storage mutations require an exact same-origin request')
      }
      const db = readDb(env)
      if (isAgenticGraphStorageBrowserSessionRoute(url.pathname)) {
        return await handleAgenticGraphStorageBrowserSessionRoute({ request, env, db })
      }
      if (!db) return errorResponse(500, 'server_error', 'missing Cloudflare D1 binding DB')
      if (request.method === 'POST' && url.pathname === AGENTICGRAPH_STORAGE_ROUTE_PATHS.collabSave) {
        return await handleCollaborationSave(request, env, db)
      }
      if (isAgenticGraphStorageRelayRoute(url.pathname)) {
        return withCorsHeaders(await handleStorageRelayRequest({
          request,
          pathname: url.pathname,
          env,
          db,
        }))
      }
      if (isAgenticGraphKnowledgeSourceRoute(url.pathname)) {
        return withCorsHeaders(await handleKnowledgeSourceRequest({
          request,
          pathname: url.pathname,
          env,
          db,
        }))
      }
      if (url.pathname.startsWith(AGENTICGRAPH_STORAGE_ROUTE_PATHS.canvasRoomPrefix)) {
        return await handleCanvasRoomProxy(request, env, db)
      }
      if (isAgenticGraphStorageChatRoute(url.pathname)) {
        if (request.method === 'GET' && url.pathname === AGENTICGRAPH_STORAGE_ROUTE_PATHS.chatSession) {
          return await handleChatSession(request, db)
        }
        if (request.method === 'GET' && url.pathname.startsWith(AGENTICGRAPH_STORAGE_ROUTE_PATHS.chatPoliciesPrefix)) {
          return await handleChatPolicies(request, db)
        }
        if (request.method === 'GET' && url.pathname.startsWith(AGENTICGRAPH_STORAGE_ROUTE_PATHS.chatAuditPrefix)) {
          return await handleChatAudit(request, db)
        }
        if (request.method === 'POST' && url.pathname === AGENTICGRAPH_STORAGE_ROUTE_PATHS.chatRelay) {
          return await handleChatRelay(request, env, db)
        }
        return errorResponse(405, 'bad_request', 'unsupported chat route method')
      }
      const storageDataResponse = await handleSecuredAgenticGraphStorageDataRoute({
        request,
        pathname: url.pathname,
        env,
        db,
      })
      if (storageDataResponse) return storageDataResponse
      if (request.method === 'POST' && url.pathname === AGENTICGRAPH_STORAGE_ROUTE_PATHS.push) {
        const auth = await authenticateAgenticGraphStorageSnapshotRequest(request, env, db)
        if (auth.ok === false) return auth.response
        return await handlePush(request, db, auth.principal)
      }
      if (request.method === 'POST' && url.pathname === AGENTICGRAPH_STORAGE_ROUTE_PATHS.pull) {
        const auth = await authenticateAgenticGraphStorageSnapshotRequest(request, env, db)
        if (auth.ok === false) return auth.response
        return await handlePull(request, db, auth.principal)
      }
      if (request.method === 'GET' && url.pathname.startsWith(AGENTICGRAPH_STORAGE_ROUTE_PATHS.exportPrefix)) {
        const auth = await authenticateAgenticGraphStorageSnapshotRequest(request, env, db)
        if (auth.ok === false) return auth.response
        return await handleExport(request, db, auth.principal)
      }
      const documentResponse = await handleSecuredAgenticGraphStorageDocumentRoute({
        request,
        pathname: url.pathname,
        env,
        db,
        corsHeaders: CORS_HEADERS,
      })
      if (documentResponse) return documentResponse
      return errorResponse(404, 'not_found', 'storage route not found')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'unexpected worker error'
      return errorResponse(500, 'server_error', message)
    }
  },
})

const worker = createAgenticGraphStorageWorker()

export default worker
