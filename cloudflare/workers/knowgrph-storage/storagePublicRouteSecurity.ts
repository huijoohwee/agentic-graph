import {
  KNOWGRPH_STORAGE_API_VERSION,
  KNOWGRPH_STORAGE_ROUTE_PATHS,
  type KnowgrphStorageErrorResponse,
  type KnowgrphStorageWorkerEnv,
} from './contract'
import type { D1DatabaseLike } from './db'
import {
  handleBlobRead,
  handleBlobUpload,
  isKnowgrphStorageBlobRoute,
  readKnowgrphStorageBlobRoute,
} from './blob'
import { handleMediaRead, handleMediaWrite, isKnowgrphStorageMediaRoute, readMediaObjectKey } from './media'
import { handleMediaAssetPersist, isKnowgrphStorageMediaAssetRoute } from './mediaAssetSync'
import {
  authenticateKnowgrphStorageSyncRequest,
  authorizeKnowgrphStorageWorkspace,
  cancelKnowgrphStorageRequestBody,
  readBoundedKnowgrphStorageSyncJson,
} from './storageSyncSecurity'
import {
  handleKnowgrphStorageCapabilityMediaRoute,
  isKnowgrphStorageMediaCapabilityRoute,
  mintKnowgrphStorageMediaCapability,
} from './storageMediaCapability'
import {
  handleKnowgrphStoragePublicationRoute,
  isKnowgrphStoragePublicationRoute,
} from './storagePublication'

const CORS_HEADERS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET,HEAD,POST,PUT,PATCH,DELETE,OPTIONS',
  'access-control-allow-headers': 'content-type,authorization,x-knowgrph-media-capability,x-knowgrph-content-hash,x-knowgrph-content-kind',
  'access-control-max-age': '86400',
}

const errorResponse = (
  status: number,
  code: KnowgrphStorageErrorResponse['code'],
  error: string,
): Response => new Response(JSON.stringify({
  ok: false,
  apiVersion: KNOWGRPH_STORAGE_API_VERSION,
  code,
  error,
} satisfies KnowgrphStorageErrorResponse), {
  status,
  headers: {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    ...CORS_HEADERS,
  },
})

const readMediaAssetWorkspaceId = (request: Request): string => {
  try { return String(new URL(request.url).searchParams.get('workspaceId') || '').trim() } catch { return '' }
}

/**
 * Secures inherited binary/media surfaces before their legacy handlers can
 * inspect a body or touch D1/R2. A production session plus workspace
 * membership is sufficient for workspace-addressed blobs and asset listing.
 * Raw media and asset mutations cannot be tenant-bound with the stored legacy
 * metadata, so they intentionally fail closed outside the explicit local mode.
 */
export const handleSecuredKnowgrphStorageDataRoute = async (args: {
  request: Request
  pathname: string
  env: KnowgrphStorageWorkerEnv
  db: D1DatabaseLike
}): Promise<Response | null> => {
  if (isKnowgrphStoragePublicationRoute(args.pathname)) {
    return handleKnowgrphStoragePublicationRoute({ request: args.request, env: args.env, db: args.db })
  }
  if (isKnowgrphStorageMediaCapabilityRoute(args.pathname)) {
    const auth = await authenticateKnowgrphStorageSyncRequest(args.request, args.env, args.db)
    if (auth.ok === false) return auth.response
    if (args.request.method !== 'POST') return errorResponse(405, 'bad_request', 'media capabilities require POST')
    const parsed = await readBoundedKnowgrphStorageSyncJson(args.request)
    if (parsed.ok === false) return parsed.response
    const body = parsed.value && typeof parsed.value === 'object' && !Array.isArray(parsed.value)
      ? parsed.value as Record<string, unknown>
      : null
    const workspaceId = String(body?.workspaceId || '').trim()
    const objectKey = String(body?.objectKey || '').trim().replace(/^\/+/, '')
    const operation = body?.operation === 'read' || body?.operation === 'write' ? body.operation : null
    const ttlSeconds = Number(body?.ttlSeconds || 300)
    const parsedKey = readMediaObjectKey(`${KNOWGRPH_STORAGE_ROUTE_PATHS.mediaPrefix}${objectKey}`)
    if (!workspaceId || !operation || !parsedKey || !Number.isSafeInteger(ttlSeconds)) {
      return errorResponse(400, 'bad_request', 'workspaceId, valid objectKey, operation, and ttlSeconds are required')
    }
    const access = await authorizeKnowgrphStorageWorkspace({
      db: args.db,
      workspaceId,
      principal: auth.principal,
      access: operation === 'write' ? 'write' : 'read',
    })
    if (access.ok === false) return access.response
    if (auth.principal.local) return errorResponse(403, 'forbidden', 'local runtime cannot mint production media capabilities')
    try {
      const capability = await mintKnowgrphStorageMediaCapability({
        env: args.env,
        workspaceId,
        objectKey: parsedKey,
        operation,
        subjectUserId: 'userId' in auth.principal ? auth.principal.userId : '',
        ttlSeconds,
      })
      return new Response(JSON.stringify({
        ok: true,
        apiVersion: KNOWGRPH_STORAGE_API_VERSION,
        workspaceId,
        objectKey: parsedKey,
        operation,
        ...capability,
      }), { status: 200, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...CORS_HEADERS } })
    } catch {
      return errorResponse(503, 'server_error', 'media capability signing is unavailable')
    }
  }

  if (isKnowgrphStorageMediaAssetRoute(args.pathname)) {
    const auth = await authenticateKnowgrphStorageSyncRequest(args.request, args.env, args.db)
    if (auth.ok === false) return auth.response
    if (auth.principal.local) return handleMediaAssetPersist(args.request, args.env, args.db)
    if (args.request.method === 'GET') {
      const workspaceId = readMediaAssetWorkspaceId(args.request)
      if (!workspaceId) return handleMediaAssetPersist(args.request, args.env, args.db)
      const access = await authorizeKnowgrphStorageWorkspace({
        db: args.db,
        workspaceId,
        principal: auth.principal,
        access: 'read',
      })
      if (access.ok === false) return access.response
      return handleMediaAssetPersist(args.request, args.env, args.db)
    }
    if (args.request.method === 'POST' || args.request.method === 'PATCH') {
      const parsed = await readBoundedKnowgrphStorageSyncJson(args.request)
      if (parsed.ok === false) return parsed.response
      const body = parsed.value && typeof parsed.value === 'object' && !Array.isArray(parsed.value)
        ? parsed.value as Record<string, unknown>
        : null
      let forwardedValue = parsed.value
      const workspaceId = String(body?.workspaceId || '').trim()
      if (!workspaceId) return errorResponse(400, 'bad_request', 'workspaceId is required')
      const access = await authorizeKnowgrphStorageWorkspace({
        db: args.db,
        workspaceId,
        principal: auth.principal,
        access: 'write',
      })
      if (access.ok === false) return access.response
      if (args.request.method === 'POST') {
        const objectKey = String(body?.objectKey || '').trim().replace(/^\/+/, '')
        const bucket = args.env.KNOWGRPH_STORAGE_BLOB_BUCKET
        const object = objectKey && bucket?.head ? await bucket.head(objectKey) : null
        if (!object || object.customMetadata?.knowgrphWorkspaceId !== workspaceId) {
          return errorResponse(403, 'forbidden', 'media object ownership does not match the workspace')
        }
        try {
          const capability = await mintKnowgrphStorageMediaCapability({
            env: args.env,
            workspaceId,
            objectKey,
            operation: 'read',
            subjectUserId: 'userId' in auth.principal ? auth.principal.userId : '',
            ttlSeconds: Number(body?.accessTtlSeconds || 15 * 60),
          })
          forwardedValue = {
            ...body,
            presignedUrl: new URL(capability.urlPath, args.request.url).toString(),
          }
        } catch {
          return errorResponse(503, 'server_error', 'media capability signing is unavailable')
        }
      }
      const boundedRequest = new Request(args.request.url, {
        method: args.request.method,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(forwardedValue),
      })
      return handleMediaAssetPersist(boundedRequest, args.env, args.db, async () => ({ ok: true }))
    }
    if (args.request.method === 'DELETE') {
      const workspaceId = readMediaAssetWorkspaceId(args.request)
      if (!workspaceId) return errorResponse(400, 'bad_request', 'workspaceId is required')
      const access = await authorizeKnowgrphStorageWorkspace({
        db: args.db,
        workspaceId,
        principal: auth.principal,
        access: 'write',
      })
      if (access.ok === false) return access.response
      return handleMediaAssetPersist(args.request, args.env, args.db, async () => ({ ok: true }))
    }
    return handleMediaAssetPersist(args.request, args.env, args.db)
  }

  if (isKnowgrphStorageMediaRoute(args.pathname)) {
    if (String(args.env.KNOWGRPH_STORAGE_LOCAL_RUNTIME || '').trim() !== 'true') {
      return handleKnowgrphStorageCapabilityMediaRoute(args.request, args.env)
    }
    const auth = await authenticateKnowgrphStorageSyncRequest(args.request, args.env, args.db)
    if (auth.ok === false) return auth.response
    if (args.request.method === 'PUT' || args.request.method === 'POST') {
      return handleMediaWrite(args.request, args.env)
    }
    if (args.request.method === 'GET' || args.request.method === 'HEAD') {
      return handleMediaRead(args.request, args.env)
    }
    return errorResponse(405, 'bad_request', 'unsupported media route method')
  }

  if (isKnowgrphStorageBlobRoute(args.pathname)) {
    const auth = await authenticateKnowgrphStorageSyncRequest(args.request, args.env, args.db)
    if (auth.ok === false) return auth.response
    const route = readKnowgrphStorageBlobRoute(args.pathname)
    if (!route) return errorResponse(400, 'bad_request', 'workspaceId and canonicalPath are required')
    const method = args.request.method
    const accessKind = method === 'POST' ? 'write' : method === 'GET' || method === 'HEAD' ? 'read' : null
    if (!accessKind) return errorResponse(405, 'bad_request', 'unsupported blob route method')
    const access = await authorizeKnowgrphStorageWorkspace({
      db: args.db,
      workspaceId: route.workspaceId,
      principal: auth.principal,
      access: accessKind,
    })
    if (access.ok === false) {
      await cancelKnowgrphStorageRequestBody(args.request.body)
      return access.response
    }
    return method === 'POST'
      ? handleBlobUpload(args.request, args.env)
      : handleBlobRead(args.request, args.env)
  }

  return null
}
