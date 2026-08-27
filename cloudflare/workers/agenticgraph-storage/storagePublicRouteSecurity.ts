import {
  AGENTICGRAPH_STORAGE_API_VERSION,
  AGENTICGRAPH_STORAGE_ROUTE_PATHS,
  type AgenticGraphStorageErrorResponse,
  type AgenticGraphStorageWorkerEnv,
} from './contract'
import type { D1DatabaseLike } from './db'
import {
  handleBlobRead,
  handleBlobUpload,
  isAgenticGraphStorageBlobRoute,
  readAgenticGraphStorageBlobRoute,
} from './blob'
import { handleMediaRead, handleMediaWrite, isAgenticGraphStorageMediaRoute, readMediaObjectKey } from './media'
import { handleMediaAssetPersist, isAgenticGraphStorageMediaAssetRoute } from './mediaAssetSync'
import {
  authenticateAgenticGraphStorageSyncRequest,
  authorizeAgenticGraphStorageWorkspace,
  cancelAgenticGraphStorageRequestBody,
  readBoundedAgenticGraphStorageSyncJson,
} from './storageSyncSecurity'
import {
  handleAgenticGraphStorageCapabilityMediaRoute,
  isAgenticGraphStorageMediaCapabilityRoute,
  mintAgenticGraphStorageMediaCapability,
} from './storageMediaCapability'
import {
  handleAgenticGraphStoragePublicationRoute,
  isAgenticGraphStoragePublicationRoute,
} from './storagePublication'

const CORS_HEADERS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET,HEAD,POST,PUT,PATCH,DELETE,OPTIONS',
  'access-control-allow-headers': 'content-type,authorization,x-agenticgraph-media-capability,x-agenticgraph-content-hash,x-agenticgraph-content-kind',
  'access-control-max-age': '86400',
}

const errorResponse = (
  status: number,
  code: AgenticGraphStorageErrorResponse['code'],
  error: string,
): Response => new Response(JSON.stringify({
  ok: false,
  apiVersion: AGENTICGRAPH_STORAGE_API_VERSION,
  code,
  error,
} satisfies AgenticGraphStorageErrorResponse), {
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
export const handleSecuredAgenticGraphStorageDataRoute = async (args: {
  request: Request
  pathname: string
  env: AgenticGraphStorageWorkerEnv
  db: D1DatabaseLike
}): Promise<Response | null> => {
  if (isAgenticGraphStoragePublicationRoute(args.pathname)) {
    return handleAgenticGraphStoragePublicationRoute({ request: args.request, env: args.env, db: args.db })
  }
  if (isAgenticGraphStorageMediaCapabilityRoute(args.pathname)) {
    const auth = await authenticateAgenticGraphStorageSyncRequest(args.request, args.env, args.db)
    if (auth.ok === false) return auth.response
    if (args.request.method !== 'POST') return errorResponse(405, 'bad_request', 'media capabilities require POST')
    const parsed = await readBoundedAgenticGraphStorageSyncJson(args.request)
    if (parsed.ok === false) return parsed.response
    const body = parsed.value && typeof parsed.value === 'object' && !Array.isArray(parsed.value)
      ? parsed.value as Record<string, unknown>
      : null
    const workspaceId = String(body?.workspaceId || '').trim()
    const objectKey = String(body?.objectKey || '').trim().replace(/^\/+/, '')
    const operation = body?.operation === 'read' || body?.operation === 'write' ? body.operation : null
    const ttlSeconds = Number(body?.ttlSeconds || 300)
    const parsedKey = readMediaObjectKey(`${AGENTICGRAPH_STORAGE_ROUTE_PATHS.mediaPrefix}${objectKey}`)
    if (!workspaceId || !operation || !parsedKey || !Number.isSafeInteger(ttlSeconds)) {
      return errorResponse(400, 'bad_request', 'workspaceId, valid objectKey, operation, and ttlSeconds are required')
    }
    const access = await authorizeAgenticGraphStorageWorkspace({
      db: args.db,
      workspaceId,
      principal: auth.principal,
      access: operation === 'write' ? 'write' : 'read',
    })
    if (access.ok === false) return access.response
    if (auth.principal.local) return errorResponse(403, 'forbidden', 'local runtime cannot mint production media capabilities')
    try {
      const capability = await mintAgenticGraphStorageMediaCapability({
        env: args.env,
        workspaceId,
        objectKey: parsedKey,
        operation,
        subjectUserId: 'userId' in auth.principal ? auth.principal.userId : '',
        ttlSeconds,
      })
      return new Response(JSON.stringify({
        ok: true,
        apiVersion: AGENTICGRAPH_STORAGE_API_VERSION,
        workspaceId,
        objectKey: parsedKey,
        operation,
        ...capability,
      }), { status: 200, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...CORS_HEADERS } })
    } catch {
      return errorResponse(503, 'server_error', 'media capability signing is unavailable')
    }
  }

  if (isAgenticGraphStorageMediaAssetRoute(args.pathname)) {
    const auth = await authenticateAgenticGraphStorageSyncRequest(args.request, args.env, args.db)
    if (auth.ok === false) return auth.response
    if (auth.principal.local) return handleMediaAssetPersist(args.request, args.env, args.db)
    if (args.request.method === 'GET') {
      const workspaceId = readMediaAssetWorkspaceId(args.request)
      if (!workspaceId) return handleMediaAssetPersist(args.request, args.env, args.db)
      const access = await authorizeAgenticGraphStorageWorkspace({
        db: args.db,
        workspaceId,
        principal: auth.principal,
        access: 'read',
      })
      if (access.ok === false) return access.response
      return handleMediaAssetPersist(args.request, args.env, args.db)
    }
    if (args.request.method === 'POST' || args.request.method === 'PATCH') {
      const parsed = await readBoundedAgenticGraphStorageSyncJson(args.request)
      if (parsed.ok === false) return parsed.response
      const body = parsed.value && typeof parsed.value === 'object' && !Array.isArray(parsed.value)
        ? parsed.value as Record<string, unknown>
        : null
      let forwardedValue = parsed.value
      const workspaceId = String(body?.workspaceId || '').trim()
      if (!workspaceId) return errorResponse(400, 'bad_request', 'workspaceId is required')
      const access = await authorizeAgenticGraphStorageWorkspace({
        db: args.db,
        workspaceId,
        principal: auth.principal,
        access: 'write',
      })
      if (access.ok === false) return access.response
      if (args.request.method === 'POST') {
        const objectKey = String(body?.objectKey || '').trim().replace(/^\/+/, '')
        const bucket = args.env.AGENTICGRAPH_STORAGE_BLOB_BUCKET
        const object = objectKey && bucket?.head ? await bucket.head(objectKey) : null
        if (!object || object.customMetadata?.agenticgraphWorkspaceId !== workspaceId) {
          return errorResponse(403, 'forbidden', 'media object ownership does not match the workspace')
        }
        try {
          const capability = await mintAgenticGraphStorageMediaCapability({
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
      const access = await authorizeAgenticGraphStorageWorkspace({
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

  if (isAgenticGraphStorageMediaRoute(args.pathname)) {
    if (String(args.env.AGENTICGRAPH_STORAGE_LOCAL_RUNTIME || '').trim() !== 'true') {
      return handleAgenticGraphStorageCapabilityMediaRoute(args.request, args.env)
    }
    const auth = await authenticateAgenticGraphStorageSyncRequest(args.request, args.env, args.db)
    if (auth.ok === false) return auth.response
    if (args.request.method === 'PUT' || args.request.method === 'POST') {
      return handleMediaWrite(args.request, args.env)
    }
    if (args.request.method === 'GET' || args.request.method === 'HEAD') {
      return handleMediaRead(args.request, args.env)
    }
    return errorResponse(405, 'bad_request', 'unsupported media route method')
  }

  if (isAgenticGraphStorageBlobRoute(args.pathname)) {
    const auth = await authenticateAgenticGraphStorageSyncRequest(args.request, args.env, args.db)
    if (auth.ok === false) return auth.response
    const route = readAgenticGraphStorageBlobRoute(args.pathname)
    if (!route) return errorResponse(400, 'bad_request', 'workspaceId and canonicalPath are required')
    const method = args.request.method
    const accessKind = method === 'POST' ? 'write' : method === 'GET' || method === 'HEAD' ? 'read' : null
    if (!accessKind) return errorResponse(405, 'bad_request', 'unsupported blob route method')
    const access = await authorizeAgenticGraphStorageWorkspace({
      db: args.db,
      workspaceId: route.workspaceId,
      principal: auth.principal,
      access: accessKind,
    })
    if (access.ok === false) {
      await cancelAgenticGraphStorageRequestBody(args.request.body)
      return access.response
    }
    return method === 'POST'
      ? handleBlobUpload(args.request, args.env)
      : handleBlobRead(args.request, args.env)
  }

  return null
}
