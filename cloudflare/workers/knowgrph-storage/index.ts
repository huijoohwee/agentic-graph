import {
  KNOWGRPH_STORAGE_API_VERSION,
  KNOWGRPH_STORAGE_DEFAULT_WORKSPACE_ID,
  KNOWGRPH_STORAGE_ROUTE_PATHS,
  type KnowgrphStorageErrorResponse,
  type KnowgrphStorageExportResponse,
  type KnowgrphStorageMutationAck,
  type KnowgrphStoragePullChanges,
  type KnowgrphStoragePullRequest,
  type KnowgrphStoragePullResponse,
  type KnowgrphStoragePushRequest,
  type KnowgrphStoragePushResponse,
  type KnowgrphStorageWorkerEnv,
} from './contract'
import {
  type D1DatabaseLike,
  readPullChangeRows,
  type DocumentChunkRow,
  type DocumentRow,
  type GraphSnapshotRow,
  ensureSyncDeviceRow,
  ensureWorkspaceRow,
  execute,
  mapDocumentChunkRow,
  mapDocumentRow,
  mapGraphSnapshotRow,
  normalizeString,
  pruneStaleSyncEvents,
  readDb,
  writeSyncEvent,
} from './db'
import {
  acknowledgeRejected,
  processKnowgrphStorageMutation,
  validateKnowgrphStorageMutation,
} from './mutationProcessor'
import { handleCrawlerSourceFiles, isKnowgrphStorageCrawlerRoute } from './crawler'
import { handleBlobRead, handleBlobUpload, isKnowgrphStorageBlobRoute } from './blob'
import { handleMediaRead, handleMediaWrite, isKnowgrphStorageMediaRoute } from './media'
import { handleMediaAssetPersist, isKnowgrphStorageMediaAssetRoute } from './mediaAssetSync'
import {
  KNOWGRPH_STORAGE_DOC_VIEW_HEADERS,
  readPublishedMarkdown,
} from '../shared/publishedDoc'
import { handleCollaborationSave } from './collaborationBridge'
import { KnowgrphCanvasSyncRoom } from './canvasSyncRoom'
import {
  deriveKnowgrphCanvasRoomDevicePrincipalId,
  readKnowgrphCanvasRoomProxyIdentity,
} from './canvasRoomProxyIdentity'
import {
  handleChatAudit,
  handleChatPolicies,
  handleChatRelay,
  handleChatSession,
  readAuthenticatedChatContext,
  readAuthorizedMembership,
  isKnowgrphStorageChatRoute,
} from './chatAuth'
import {
  handleStorageRelayRequest,
  isKnowgrphStorageRelayRoute,
} from './storageRelayRuntime'

const CORS_HEADERS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET,HEAD,POST,PUT,OPTIONS',
  'access-control-allow-headers': 'content-type,authorization,x-client-request-id,x-knowgrph-content-hash,x-knowgrph-content-kind,x-knowgrph-content-sha256,x-knowgrph-file-sync-meta',
  'access-control-expose-headers': 'x-knowgrph-file-sync-meta',
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
  code: KnowgrphStorageErrorResponse['code'],
  error: string,
): Response => {
  const body: KnowgrphStorageErrorResponse = {
    ok: false,
    apiVersion: KNOWGRPH_STORAGE_API_VERSION,
    error,
    code,
  }
  return json(status, body)
}

const okPushResponse = (body: Omit<KnowgrphStoragePushResponse, 'ok' | 'apiVersion'>): Response =>
  json(200, {
    ok: true,
    apiVersion: KNOWGRPH_STORAGE_API_VERSION,
    ...body,
  } satisfies KnowgrphStoragePushResponse)

const okPullResponse = (body: Omit<KnowgrphStoragePullResponse, 'ok' | 'apiVersion'>): Response =>
  json(200, {
    ok: true,
    apiVersion: KNOWGRPH_STORAGE_API_VERSION,
    ...body,
  } satisfies KnowgrphStoragePullResponse)

const okExportResponse = (body: Omit<KnowgrphStorageExportResponse, 'ok' | 'apiVersion'>): Response =>
  json(200, {
    ok: true,
    apiVersion: KNOWGRPH_STORAGE_API_VERSION,
    ...body,
  } satisfies KnowgrphStorageExportResponse)

const readJsonBody = async (request: Request): Promise<unknown> => {
  try {
    return await request.json()
  } catch {
    return null
  }
}

const handleCanvasRoomProxy = async (
  request: Request,
  env: KnowgrphStorageWorkerEnv,
  db: D1DatabaseLike,
): Promise<Response> => {
  if (request.method !== 'GET') {
    return errorResponse(405, 'bad_request', 'unsupported canvas room route method')
  }
  const route = readKnowgrphCanvasRoomProxyIdentity(request, KNOWGRPH_STORAGE_ROUTE_PATHS.canvasRoomPrefix)
  if (!route) return errorResponse(400, 'bad_request', 'workspaceId and roomId are required')
  const auth = await readAuthenticatedChatContext(request, db)
  if (auth.ok === false) return auth.response
  const membership = await readAuthorizedMembership({
    db,
    workspaceId: route.workspaceId,
    userId: auth.value.user.id,
  })
  if (membership.ok === false) return membership.response
  const devicePrincipalId = await deriveKnowgrphCanvasRoomDevicePrincipalId(route, auth.value.user.id)
  const namespace = env.KNOWGRPH_CANVAS_ROOM
  if (!namespace) return errorResponse(500, 'server_error', 'missing Cloudflare Durable Object binding KNOWGRPH_CANVAS_ROOM')
  const roomStub = namespace.get(namespace.idFromName(`${route.workspaceId}:${route.roomId}`))
  if (!route.deviceIdValid) {
    return errorResponse(400, 'bad_request', 'authenticated canvas room connection requires a valid device id')
  }
  const targetPath = route.websocketUpgrade ? '/connect' : '/status'
  const headers = new Headers(request.headers)
  headers.set('x-knowgrph-room-workspace-id', route.workspaceId)
  headers.set('x-knowgrph-room-id', route.roomId)
  headers.set('x-knowgrph-user-id', auth.value.user.id)
  headers.set('x-knowgrph-session-id', auth.value.session.id)
  if (devicePrincipalId) headers.set('x-knowgrph-device-principal-id', devicePrincipalId)
  headers.set('x-knowgrph-user-display-name', normalizeString(auth.value.user.displayName) || normalizeString(auth.value.user.email) || auth.value.user.id)
  headers.set('x-knowgrph-room-role', membership.membership.role)
  const roomUrl = `https://knowgrph.internal${targetPath}?workspaceId=${encodeURIComponent(route.workspaceId)}&roomId=${encodeURIComponent(route.roomId)}`
  return roomStub.fetch(new Request(roomUrl, {
    method: 'GET',
    headers,
  }))
}

export { KnowgrphCanvasSyncRoom }

const isPushRequest = (value: unknown): value is KnowgrphStoragePushRequest => {
  if (!value || typeof value !== 'object') return false
  const record = value as Record<string, unknown>
  return (
    record.apiVersion === KNOWGRPH_STORAGE_API_VERSION
    && typeof record.workspaceId === 'string'
    && typeof record.deviceId === 'string'
    && Array.isArray(record.mutations)
  )
}

const isPullRequest = (value: unknown): value is KnowgrphStoragePullRequest => {
  if (!value || typeof value !== 'object') return false
  const record = value as Record<string, unknown>
  return (
    record.apiVersion === KNOWGRPH_STORAGE_API_VERSION
    && typeof record.workspaceId === 'string'
    && typeof record.deviceId === 'string'
    && (typeof record.since === 'string' || record.since == null)
    && (record.knownChunks == null || Array.isArray(record.knownChunks))
  )
}

const handlePush = async (request: Request, env: KnowgrphStorageWorkerEnv, db: D1DatabaseLike): Promise<Response> => {
  const body = await readJsonBody(request)
  if (!isPushRequest(body)) return errorResponse(400, 'bad_request', 'invalid storage push request')
  const workspaceId = normalizeString(body.workspaceId)
  const deviceId = normalizeString(body.deviceId)
  if (!workspaceId || !deviceId) return errorResponse(400, 'bad_request', 'workspaceId and deviceId are required')
  const nowIso = new Date().toISOString()
  const serverTimeMs = Date.parse(nowIso)
  await ensureWorkspaceRow(db, workspaceId, nowIso)
  await ensureSyncDeviceRow(db, workspaceId, deviceId, nowIso)
  const acknowledgements: KnowgrphStorageMutationAck[] = []
  const documentIdAliases = new Map<string, string>()
  for (const mutation of body.mutations) {
    const mismatch = validateKnowgrphStorageMutation(workspaceId, mutation)
    if (mismatch) {
      acknowledgements.push(acknowledgeRejected(mutation, mismatch))
      continue
    }
    acknowledgements.push(await processKnowgrphStorageMutation({
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

const readPullChanges = async (
  db: D1DatabaseLike,
  workspaceId: string,
  since: string | null,
  knownChunks: KnowgrphStoragePullRequest['knownChunks'] = [],
): Promise<KnowgrphStoragePullChanges> => {
  const { documents, documentChunks, graphSnapshots } = await readPullChangeRows(db, workspaceId, since)
  const knownChunkHashBySemanticKey = new Map<string, string>()
  for (const chunk of knownChunks.slice(0, 1_000)) {
    const documentId = normalizeString(chunk?.documentId)
    const chunkKey = normalizeString(chunk?.chunkKey)
    const contentHash = normalizeString(chunk?.contentHash)
    if (documentId && chunkKey && contentHash) {
      knownChunkHashBySemanticKey.set(`${documentId}\u0000${chunkKey}`, contentHash)
    }
  }
  return {
    documents: (documents as DocumentRow[]).map(mapDocumentRow),
    documentChunks: (documentChunks as DocumentChunkRow[]).map(row => {
      const mapped = mapDocumentChunkRow(row)
      const knownHash = knownChunkHashBySemanticKey.get(`${mapped.documentId}\u0000${mapped.chunkKey}`)
      return knownHash === mapped.contentHash
        ? { ...mapped, markdown: '', contentReused: true }
        : mapped
    }),
    graphSnapshots: (graphSnapshots as GraphSnapshotRow[]).map(mapGraphSnapshotRow),
  }
}

const handlePull = async (request: Request, env: KnowgrphStorageWorkerEnv, db: D1DatabaseLike): Promise<Response> => {
  const body = await readJsonBody(request)
  const pullRequest = isPullRequest(body) ? body : null
  if (!pullRequest) return errorResponse(400, 'bad_request', 'invalid storage pull request')
  const workspaceId = normalizeString(pullRequest.workspaceId)
  const deviceId = normalizeString(pullRequest.deviceId)
  if (!workspaceId || !deviceId) return errorResponse(400, 'bad_request', 'workspaceId and deviceId are required')
  const nowIso = new Date().toISOString()
  const serverTimeMs = Date.parse(nowIso)
  const changes = await readPullChanges(
    db,
    workspaceId,
    pullRequest.since,
    Array.isArray(pullRequest.knownChunks) ? pullRequest.knownChunks : [],
  )
  const hasChanges =
    changes.documents.length > 0
    || changes.documentChunks.length > 0
    || changes.graphSnapshots.length > 0
  if (hasChanges) {
    await ensureWorkspaceRow(db, workspaceId, nowIso)
    await ensureSyncDeviceRow(db, workspaceId, deviceId, nowIso)
    await execute(
      db,
      'UPDATE sync_devices SET last_pull_cursor = ?, updated_at = ? WHERE id = ? AND workspace_id = ?',
      [nowIso, nowIso, deviceId, workspaceId],
    )
  }
  return okPullResponse({
    workspaceId,
    nextCursor: hasChanges ? nowIso : normalizeString(pullRequest.since) || nowIso,
    serverTimeMs,
    changes,
  })
}

const handleExport = async (request: Request, env: KnowgrphStorageWorkerEnv, db: D1DatabaseLike): Promise<Response> => {
  const url = new URL(request.url)
  const pathname = url.pathname
  const encodedWorkspaceId = pathname.slice(KNOWGRPH_STORAGE_ROUTE_PATHS.exportPrefix.length)
  const workspaceId = normalizeString(decodeURIComponent(encodedWorkspaceId || ''))
  if (!workspaceId) return errorResponse(400, 'bad_request', 'workspaceId is required')
  const nowIso = new Date().toISOString()
  await ensureWorkspaceRow(db, workspaceId, nowIso)
  const changes = await readPullChanges(db, workspaceId, null)
  return okExportResponse({
    workspaceId,
    exportedAtMs: Date.parse(nowIso),
    documents: changes.documents,
    documentChunks: changes.documentChunks,
    graphSnapshots: changes.graphSnapshots,
  })
}

const readDocRouteSegments = (
  pathname: string,
  prefix: string,
): { workspaceId: string; canonicalPath: string } | null => {
  const suffix = pathname.slice(prefix.length)
  if (!suffix) return null
  const firstSlash = suffix.indexOf('/')
  if (firstSlash < 1) return null
  const workspaceId = normalizeString(decodeURIComponent(suffix.slice(0, firstSlash)))
  const canonicalPath = normalizeString(decodeURIComponent(suffix.slice(firstSlash + 1)))
  if (!workspaceId || !canonicalPath) return null
  return { workspaceId, canonicalPath }
}

const readDefaultDocRouteSegments = (
  pathname: string,
  prefix: string,
): { workspaceId: string; canonicalPath: string } | null => {
  const suffix = pathname.slice(prefix.length)
  const canonicalPath = normalizeString(decodeURIComponent(suffix || ''))
  if (!canonicalPath) return null
  return {
    workspaceId: KNOWGRPH_STORAGE_DEFAULT_WORKSPACE_ID,
    canonicalPath,
  }
}

const handleDocView = async (request: Request, _env: KnowgrphStorageWorkerEnv, db: D1DatabaseLike): Promise<Response> => {
  const pathname = new URL(request.url).pathname
  const route = readDocRouteSegments(pathname, KNOWGRPH_STORAGE_ROUTE_PATHS.docPrefix)
  if (!route) return errorResponse(400, 'bad_request', 'workspaceId and canonicalPath are required')
  const contentMd = await readPublishedMarkdown(db, { workspaceId: route.workspaceId, canonicalPath: route.canonicalPath })
  if (contentMd === null) return errorResponse(404, 'not_found', 'document not found')
  return new Response(contentMd, {
    status: 200,
    headers: {
      ...KNOWGRPH_STORAGE_DOC_VIEW_HEADERS,
      ...CORS_HEADERS,
    },
  })
}

const handleDefaultDocView = async (request: Request, _env: KnowgrphStorageWorkerEnv, db: D1DatabaseLike): Promise<Response> => {
  const pathname = new URL(request.url).pathname
  const route = readDefaultDocRouteSegments(pathname, KNOWGRPH_STORAGE_ROUTE_PATHS.defaultDocPrefix)
  if (!route) return errorResponse(400, 'bad_request', 'canonicalPath is required')
  const contentMd = await readPublishedMarkdown(db, { workspaceId: route.workspaceId, canonicalPath: route.canonicalPath })
  if (contentMd === null) return errorResponse(404, 'not_found', 'document not found')
  return new Response(contentMd, {
    status: 200,
    headers: {
      ...KNOWGRPH_STORAGE_DOC_VIEW_HEADERS,
      ...CORS_HEADERS,
    },
  })
}

export const createKnowgrphStorageWorker = () => ({
  async fetch(request: Request, env: KnowgrphStorageWorkerEnv): Promise<Response> {
    if (request.method === 'OPTIONS') {
      return noContent()
    }
    const url = new URL(request.url)
    try {
      const db = readDb(env)
      if (!db) return errorResponse(500, 'server_error', 'missing Cloudflare D1 binding DB')
      if (request.method === 'POST' && url.pathname === KNOWGRPH_STORAGE_ROUTE_PATHS.collabSave) {
        return await handleCollaborationSave(request, env, db)
      }
      if (isKnowgrphStorageRelayRoute(url.pathname)) {
        return withCorsHeaders(await handleStorageRelayRequest({
          request,
          pathname: url.pathname,
          env,
          db,
        }))
      }
      if (url.pathname.startsWith(KNOWGRPH_STORAGE_ROUTE_PATHS.canvasRoomPrefix)) {
        return await handleCanvasRoomProxy(request, env, db)
      }
      if (isKnowgrphStorageChatRoute(url.pathname)) {
        if (request.method === 'GET' && url.pathname === KNOWGRPH_STORAGE_ROUTE_PATHS.chatSession) {
          return await handleChatSession(request, db)
        }
        if (request.method === 'GET' && url.pathname.startsWith(KNOWGRPH_STORAGE_ROUTE_PATHS.chatPoliciesPrefix)) {
          return await handleChatPolicies(request, db)
        }
        if (request.method === 'GET' && url.pathname.startsWith(KNOWGRPH_STORAGE_ROUTE_PATHS.chatAuditPrefix)) {
          return await handleChatAudit(request, db)
        }
        if (request.method === 'POST' && url.pathname === KNOWGRPH_STORAGE_ROUTE_PATHS.chatRelay) {
          return await handleChatRelay(request, env, db)
        }
        return errorResponse(405, 'bad_request', 'unsupported chat route method')
      }
      if (isKnowgrphStorageMediaAssetRoute(url.pathname)) {
        return await handleMediaAssetPersist(request, env, db)
      }
      if (isKnowgrphStorageMediaRoute(url.pathname)) {
        if (request.method === 'PUT' || request.method === 'POST') return await handleMediaWrite(request, env)
        if (request.method === 'GET' || request.method === 'HEAD') return await handleMediaRead(request, env)
      }
      if (isKnowgrphStorageBlobRoute(url.pathname)) {
        if (request.method === 'POST') return await handleBlobUpload(request, env)
        if (request.method === 'GET' || request.method === 'HEAD') return await handleBlobRead(request, env)
      }
      if (request.method === 'POST' && url.pathname === KNOWGRPH_STORAGE_ROUTE_PATHS.push) {
        return await handlePush(request, env, db)
      }
      if (request.method === 'POST' && url.pathname === KNOWGRPH_STORAGE_ROUTE_PATHS.pull) {
        return await handlePull(request, env, db)
      }
      if (request.method === 'GET' && url.pathname.startsWith(KNOWGRPH_STORAGE_ROUTE_PATHS.exportPrefix)) {
        return await handleExport(request, env, db)
      }
      if (request.method === 'GET' && url.pathname.startsWith(KNOWGRPH_STORAGE_ROUTE_PATHS.defaultDocPrefix)) {
        return await handleDefaultDocView(request, env, db)
      }
      if (request.method === 'GET' && url.pathname.startsWith(KNOWGRPH_STORAGE_ROUTE_PATHS.docPrefix)) {
        return await handleDocView(request, env, db)
      }
      if (request.method === 'GET' && isKnowgrphStorageCrawlerRoute(url.pathname)) {
        const crawlerResponse = await handleCrawlerSourceFiles(request, db, CORS_HEADERS)
        if (crawlerResponse) return crawlerResponse
      }
      return errorResponse(404, 'not_found', 'storage route not found')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'unexpected worker error'
      return errorResponse(500, 'server_error', message)
    }
  },
})

const worker = createKnowgrphStorageWorker()

export default worker
