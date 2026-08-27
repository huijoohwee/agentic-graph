import {
  KNOWGRPH_STORAGE_API_VERSION,
  KNOWGRPH_STORAGE_ROUTE_PATHS,
  type KnowgrphMediaAssetPersistRequest,
  type KnowgrphMediaAssetPersistResponse,
  type KnowgrphStorageErrorResponse,
  type KnowgrphStorageKvNamespaceLike,
  type KnowgrphStorageWorkerEnv,
} from './contract'
import { normalizeNumber, normalizeString } from './db'
import type { D1DatabaseLike } from './db'
import {
  deleteMediaArtifact,
  findMediaArtifactByHash,
  listRecentMediaArtifacts,
  readMediaArtifact,
  updateMediaArtifactProvenance,
  upsertMediaArtifact,
  type MediaArtifactRecord,
} from './mediaArtifacts'
import {
  MEDIA_AUTH_UNAUTHENTICATED_CODE,
  MEDIA_AUTH_UNAUTHORIZED_CODE,
  defaultMediaAuthProvider,
  type MediaAuthProvider,
} from './mediaAuth'

const MEDIA_ASSET_ACCESS_TTL_SECONDS_DEFAULT = 15 * 60
const MEDIA_ASSET_ACCESS_TTL_SECONDS_MIN = 60
const MEDIA_ASSET_ACCESS_TTL_SECONDS_MAX = 24 * 60 * 60

const CORS_HEADERS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET,POST,PATCH,DELETE,OPTIONS',
  'access-control-allow-headers': 'content-type,authorization',
  'access-control-max-age': '86400',
}

const jsonHeaders = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
  ...CORS_HEADERS,
}

const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), { status, headers: jsonHeaders })

const errorResponse = (
  status: number,
  code: KnowgrphStorageErrorResponse['code'] | typeof MEDIA_AUTH_UNAUTHENTICATED_CODE | typeof MEDIA_AUTH_UNAUTHORIZED_CODE,
  error: string,
): Response => json(status, {
  ok: false,
  apiVersion: KNOWGRPH_STORAGE_API_VERSION,
  code,
  error,
})

const readJsonBody = async (request: Request): Promise<unknown> => {
  try {
    return await request.json()
  } catch {
    return null
  }
}

const readRequestWorkspaceId = (request: Request): string => {
  try {
    return normalizeString(new URL(request.url).searchParams.get('workspaceId') || '')
  } catch {
    return ''
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value)

const parseJsonObject = (value: string): Record<string, unknown> => {
  try {
    const parsed = JSON.parse(value || '{}')
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {}
  } catch {
    return {}
  }
}

const isMediaAssetPersistRequest = (value: unknown): value is KnowgrphMediaAssetPersistRequest => {
  if (!isRecord(value)) return false
  return (
    value.apiVersion === KNOWGRPH_STORAGE_API_VERSION
    && typeof value.workspaceId === 'string'
    && typeof value.objectKey === 'string'
    && typeof value.runId === 'string'
    && typeof value.stageId === 'string'
    && typeof value.shotId === 'string'
    && ['text', 'image', 'audio', 'video', 'binary'].includes(String(value.kind || ''))
    && typeof value.durableR2Url === 'string'
    && typeof value.contentHash === 'string'
    && (typeof value.mediaType === 'string' || value.mediaType == null)
    && isRecord(value.provenance)
    && (isRecord(value.layout) || value.layout == null)
    && typeof value.version === 'number'
    && (typeof value.presignedUrl === 'string' || value.presignedUrl == null)
    && (typeof value.accessTtlSeconds === 'number' || value.accessTtlSeconds == null)
    && (typeof value.collaborationRoomId === 'string' || value.collaborationRoomId == null)
  )
}

export const isKnowgrphStorageMediaAssetRoute = (pathname: string): boolean =>
  normalizeString(pathname) === KNOWGRPH_STORAGE_ROUTE_PATHS.mediaAssetPersist

const serializeMediaArtifact = (artifact: MediaArtifactRecord) => {
  const objectKey =
    normalizeString(artifact.durableR2Url).replace(/^\/?api\/storage\/media\//, '') ||
    `${artifact.runId}/${artifact.stageId}/${artifact.shotId}`
  return {
    artifactId: artifact.id,
    objectKey,
    publicPath: `${KNOWGRPH_STORAGE_ROUTE_PATHS.mediaPrefix}${objectKey}`,
    runId: artifact.runId,
    stageId: artifact.stageId,
    shotId: artifact.shotId,
    kind: artifact.kind,
    contentHash: artifact.contentHash,
    mediaType: artifact.mediaType,
    provenance: parseJsonObject(artifact.provenanceJson),
    version: artifact.version,
    createdAt: artifact.createdAt,
    updatedAt: artifact.updatedAt,
  }
}

const buildMediaAssetListResponse = async (
  request: Request,
  db: D1DatabaseLike,
): Promise<Response> => {
  const workspaceId = readRequestWorkspaceId(request)
  if (!workspaceId) return errorResponse(400, 'bad_request', 'workspaceId is required')
  const limit = (() => {
    try {
      return normalizeNumber(new URL(request.url).searchParams.get('limit'), 50)
    } catch {
      return 50
    }
  })()
  const artifacts = await listRecentMediaArtifacts(db, workspaceId, limit)
  return json(200, {
    ok: true,
    apiVersion: KNOWGRPH_STORAGE_API_VERSION,
    workspaceId,
    artifacts: artifacts.map(serializeMediaArtifact),
  })
}

const readArtifactMutationParams = async (request: Request): Promise<{
  workspaceId: string
  artifactId: string
  nextName: string
}> => {
  const url = new URL(request.url)
  const body = request.method === 'PATCH' ? await readJsonBody(request) : null
  const record = isRecord(body) ? body : {}
  return {
    workspaceId: normalizeString(record.workspaceId || url.searchParams.get('workspaceId') || ''),
    artifactId: normalizeString(record.artifactId || url.searchParams.get('artifactId') || ''),
    nextName: normalizeString(record.name || record.fileName || ''),
  }
}

const handleMediaAssetRename = async (
  request: Request,
  db: D1DatabaseLike,
  authProvider: MediaAuthProvider,
): Promise<Response> => {
  const params = await readArtifactMutationParams(request)
  if (!params.workspaceId || !params.artifactId || !params.nextName) {
    return errorResponse(400, 'bad_request', 'workspaceId, artifactId, and name are required')
  }
  const existing = await readMediaArtifact(db, params.artifactId, params.workspaceId)
  if (!existing) return errorResponse(404, 'not_found', `media artifact not found: ${params.artifactId}`)
  const auth = await authProvider(request, existing.runId)
  if (auth.ok === false) {
    const status = auth.code === MEDIA_AUTH_UNAUTHENTICATED_CODE ? 401 : 403
    return errorResponse(status, auth.code, auth.authError)
  }
  const provenance = {
    ...parseJsonObject(existing.provenanceJson),
    fileName: params.nextName,
    renamedAtMs: Date.now(),
  }
  const updated = await updateMediaArtifactProvenance(
    db,
    params.workspaceId,
    params.artifactId,
    JSON.stringify(provenance),
    new Date().toISOString(),
  )
  if (!updated) return errorResponse(404, 'not_found', `media artifact not found: ${params.artifactId}`)
  return json(200, {
    ok: true,
    apiVersion: KNOWGRPH_STORAGE_API_VERSION,
    workspaceId: params.workspaceId,
    artifact: serializeMediaArtifact(updated),
  })
}

const handleMediaAssetDelete = async (
  request: Request,
  env: KnowgrphStorageWorkerEnv,
  db: D1DatabaseLike,
  authProvider: MediaAuthProvider,
): Promise<Response> => {
  const params = await readArtifactMutationParams(request)
  if (!params.workspaceId || !params.artifactId) {
    return errorResponse(400, 'bad_request', 'workspaceId and artifactId are required')
  }
  const existing = await readMediaArtifact(db, params.artifactId, params.workspaceId)
  if (!existing) return errorResponse(404, 'not_found', `media artifact not found: ${params.artifactId}`)
  const auth = await authProvider(request, existing.runId)
  if (auth.ok === false) {
    const status = auth.code === MEDIA_AUTH_UNAUTHENTICATED_CODE ? 401 : 403
    return errorResponse(status, auth.code, auth.authError)
  }
  const deleted = await deleteMediaArtifact(db, params.workspaceId, params.artifactId)
  const objectKey = serializeMediaArtifact(existing).objectKey
  let r2Status: 'deleted' | 'binding_missing' | 'skipped' = 'skipped'
  const bucket = env.KNOWGRPH_STORAGE_BLOB_BUCKET
  if (bucket && typeof bucket.delete === 'function') {
    await bucket.delete(objectKey)
    r2Status = 'deleted'
  } else {
    r2Status = 'binding_missing'
  }
  return json(200, {
    ok: true,
    apiVersion: KNOWGRPH_STORAGE_API_VERSION,
    workspaceId: params.workspaceId,
    artifactId: params.artifactId,
    objectKey,
    storage: {
      r2: r2Status,
      d1: deleted ? 'deleted' : 'missing',
    },
  })
}

const clampAccessTtlSeconds = (value: number | null | undefined): number => {
  const normalized = normalizeNumber(value, MEDIA_ASSET_ACCESS_TTL_SECONDS_DEFAULT)
  if (normalized <= 0) return MEDIA_ASSET_ACCESS_TTL_SECONDS_DEFAULT
  return Math.min(MEDIA_ASSET_ACCESS_TTL_SECONDS_MAX, Math.max(MEDIA_ASSET_ACCESS_TTL_SECONDS_MIN, normalized))
}

const isValidMediaObjectKey = (objectKey: string): boolean => {
  const segments = normalizeString(objectKey).split('/').filter(Boolean)
  const runsIndex = segments.indexOf('runs')
  if (runsIndex < 1) return false
  if (segments.length !== runsIndex + 4) return false
  if (!segments[segments.length - 1]?.includes('.')) return false
  return segments.every(segment => {
    if (!segment || segment === '.' || segment === '..') return false
    // eslint-disable-next-line no-control-regex
    return !/[\u0000-\u001f\u007f]/.test(segment)
  })
}

const readR2ObjectEtag = (object: { httpEtag?: string; etag?: string } | null | undefined): string | null =>
  normalizeString(object?.httpEtag || object?.etag || '') || null

const normalizeObjectKey = (value: string): string =>
  normalizeString(value).replace(/^\/+/, '')

const buildArtifactId = (runId: string, stageId: string, shotId: string): string =>
  `${runId}:${stageId}:${shotId}`

const readAccessKv = (env: KnowgrphStorageWorkerEnv): KnowgrphStorageKvNamespaceLike | null => {
  const kv = env.KNOWGRPH_MEDIA_ACCESS_KV
  return kv && typeof kv.put === 'function' ? kv : null
}

const writeAccessCache = async (args: {
  env: KnowgrphStorageWorkerEnv
  request: KnowgrphMediaAssetPersistRequest
  artifactId: string
  publicPath: string
  objectEtag: string | null
}): Promise<{
  status: KnowgrphMediaAssetPersistResponse['storage']['kv']
  cacheKey: string | null
  expiresAtMs: number | null
  url: string | null
}> => {
  const kv = readAccessKv(args.env)
  const accessUrl = normalizeString(args.request.presignedUrl) || args.publicPath
  if (!accessUrl) return { status: 'skipped', cacheKey: null, expiresAtMs: null, url: null }
  if (!kv) return { status: 'binding_missing', cacheKey: null, expiresAtMs: null, url: accessUrl }
  const ttlSeconds = clampAccessTtlSeconds(args.request.accessTtlSeconds)
  const expiresAtMs = Date.now() + ttlSeconds * 1000
  const cacheKey = [
    'media-access',
    args.request.workspaceId,
    args.artifactId,
    args.request.contentHash,
  ].map(part => encodeURIComponent(normalizeString(part))).join(':')
  await kv.put(cacheKey, JSON.stringify({
    workspaceId: args.request.workspaceId,
    artifactId: args.artifactId,
    objectKey: args.request.objectKey,
    contentHash: args.request.contentHash,
    objectEtag: args.objectEtag,
    url: accessUrl,
    expiresAtMs,
  }), { expirationTtl: ttlSeconds })
  return { status: 'cached', cacheKey, expiresAtMs, url: accessUrl }
}

const notifyCanvasRoom = async (args: {
  env: KnowgrphStorageWorkerEnv
  request: KnowgrphMediaAssetPersistRequest
  artifactId: string
  publicPath: string
}): Promise<KnowgrphMediaAssetPersistResponse['storage']['durableObject']> => {
  const roomId = normalizeString(args.request.collaborationRoomId)
  if (!roomId) return 'skipped'
  const namespace = args.env.KNOWGRPH_CANVAS_ROOM
  if (!namespace || typeof namespace.idFromName !== 'function' || typeof namespace.get !== 'function') {
    return 'binding_missing'
  }
  const stub = namespace.get(namespace.idFromName(`${args.request.workspaceId}:${roomId}`))
  const response = await stub.fetch('https://knowgrph.internal/asset-sync', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      workspaceId: args.request.workspaceId,
      roomId,
      artifactId: args.artifactId,
      objectKey: args.request.objectKey,
      publicPath: args.publicPath,
      contentHash: args.request.contentHash,
      kind: args.request.kind,
      syncedAtMs: Date.now(),
    }),
  })
  if (!response.ok) throw new Error(`canvas room asset sync failed (${response.status})`)
  return 'broadcasted'
}

export const handleMediaAssetPersist = async (
  request: Request,
  env: KnowgrphStorageWorkerEnv,
  db: D1DatabaseLike,
  authProvider: MediaAuthProvider = defaultMediaAuthProvider,
): Promise<Response> => {
  if (request.method === 'GET') {
    return buildMediaAssetListResponse(request, db)
  }
  if (request.method === 'PATCH') {
    return handleMediaAssetRename(request, db, authProvider)
  }
  if (request.method === 'DELETE') {
    return handleMediaAssetDelete(request, env, db, authProvider)
  }
  if (request.method !== 'POST') {
    return errorResponse(405, 'bad_request', 'unsupported media asset route method')
  }
  const body = await readJsonBody(request)
  if (!isMediaAssetPersistRequest(body)) {
    return errorResponse(400, 'bad_request', 'invalid media asset persist request')
  }
  const objectKey = normalizeObjectKey(body.objectKey)
  if (!isValidMediaObjectKey(objectKey)) {
    return errorResponse(400, 'bad_request', 'invalid media object key; expected airvio/runs/{runId}/{stageId}/{shotId}.{ext}')
  }
  if (!objectKey.includes(`/runs/${body.runId}/${body.stageId}/`)) {
    return errorResponse(400, 'bad_request', 'media object key does not match runId and stageId')
  }
  const auth = await authProvider(request, body.runId)
  if (auth.ok === false) {
    const status = auth.code === MEDIA_AUTH_UNAUTHENTICATED_CODE ? 401 : 403
    return errorResponse(status, auth.code, auth.authError)
  }
  const bucket = env.KNOWGRPH_STORAGE_BLOB_BUCKET
  if (!bucket || typeof bucket.head !== 'function') {
    return errorResponse(500, 'server_error', 'missing Cloudflare R2 binding KNOWGRPH_STORAGE_BLOB_BUCKET with head support')
  }
  const object = await bucket.head(objectKey)
  if (!object) {
    return errorResponse(404, 'not_found', `media object not found: ${objectKey}`)
  }

  const requestedArtifactId = buildArtifactId(body.runId, body.stageId, body.shotId)
  const existing = await findMediaArtifactByHash(db, body.workspaceId, body.contentHash)
  const nowIso = new Date().toISOString()
  const artifactId = existing?.id || requestedArtifactId
  if (!existing || existing.id === requestedArtifactId) {
    await upsertMediaArtifact(db, {
      id: requestedArtifactId,
      workspaceId: body.workspaceId,
      runId: body.runId,
      stageId: body.stageId,
      shotId: body.shotId,
      kind: body.kind,
      durableR2Url: body.durableR2Url,
      contentHash: body.contentHash,
      mediaType: body.mediaType,
      provenanceJson: JSON.stringify(body.provenance),
      layoutJson: body.layout ? JSON.stringify(body.layout) : null,
      version: body.version,
    }, nowIso)
  }

  const publicPath = `${KNOWGRPH_STORAGE_ROUTE_PATHS.mediaPrefix}${objectKey}`
  const normalizedBody = { ...body, objectKey }
  const access = await writeAccessCache({
    env,
    request: normalizedBody,
    artifactId,
    publicPath,
    objectEtag: readR2ObjectEtag(object),
  })
  const durableObjectStatus = await notifyCanvasRoom({
    env,
    request: normalizedBody,
    artifactId,
    publicPath,
  })

  return json(200, {
    ok: true,
    apiVersion: KNOWGRPH_STORAGE_API_VERSION,
    workspaceId: body.workspaceId,
    artifactId,
    objectKey,
    publicPath,
    durableR2Url: body.durableR2Url,
    contentHash: body.contentHash,
    storage: {
      r2: 'confirmed',
      d1: existing && existing.id !== requestedArtifactId ? 'reused' : 'persisted',
      kv: access.status,
      durableObject: durableObjectStatus,
    },
    access: {
      cacheKey: access.cacheKey,
      expiresAtMs: access.expiresAtMs,
      url: access.url,
    },
  } satisfies KnowgrphMediaAssetPersistResponse)
}
