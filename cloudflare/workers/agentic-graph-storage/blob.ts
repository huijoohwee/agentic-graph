import {
  AGENTIC_OS_STORAGE_API_VERSION,
  AGENTIC_OS_STORAGE_ROUTE_PATHS,
  type AgenticGraphStorageBlobUploadResponse,
  type AgenticGraphStorageErrorResponse,
  type AgenticGraphStorageWorkerEnv,
} from './contract'
import { normalizeString } from './db'
import { D1_BLOB_MAX_OBJECT_BYTES, readD1Blob, readD1BlobDatabase, readD1BlobRequest, writeD1Blob } from './d1BlobStore'

const BLOB_CORS_HEADERS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET,HEAD,POST,OPTIONS',
  'access-control-allow-headers': 'content-type,authorization,x-agentic-graph-content-hash,x-agentic-graph-content-kind',
  'access-control-max-age': '86400',
}

const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      ...BLOB_CORS_HEADERS,
    },
  })

const errorResponse = (
  status: number,
  code: AgenticGraphStorageErrorResponse['code'],
  error: string,
): Response => {
  const body: AgenticGraphStorageErrorResponse = {
    ok: false,
    apiVersion: AGENTIC_OS_STORAGE_API_VERSION,
    error,
    code,
  }
  return json(status, body)
}

const okBlobUploadResponse = (body: Omit<AgenticGraphStorageBlobUploadResponse, 'ok' | 'apiVersion'>): Response =>
  json(200, {
    ok: true,
    apiVersion: AGENTIC_OS_STORAGE_API_VERSION,
    ...body,
  } satisfies AgenticGraphStorageBlobUploadResponse)

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

const normalizeBlobCanonicalPath = (value: string): string => {
  const normalized = normalizeString(value).replace(/\\/g, '/').replace(/^workspace:/, '').replace(/^\/+/, '')
  if (!normalized) return ''
  const segments = normalized.split('/').filter(Boolean)
  if (segments.length === 0) return ''
  if (segments.some(segment => segment === '.' || segment === '..')) return ''
  if (/[\u0000-\u001f\u007f]/.test(normalized)) return ''
  return segments.join('/')
}

const buildBlobObjectKey = (args: { workspaceId: string; canonicalPath: string }): string =>
  `workspaces/${encodeURIComponent(args.workspaceId)}/${args.canonicalPath}`

export const readAgenticGraphStorageBlobRoute = (
  pathname: string,
): { workspaceId: string; canonicalPath: string; objectKey: string } | null => {
  const route = readDocRouteSegments(pathname, AGENTIC_OS_STORAGE_ROUTE_PATHS.blobPrefix)
  if (!route) return null
  const canonicalPath = normalizeBlobCanonicalPath(route.canonicalPath)
  if (!canonicalPath) return null
  return {
    workspaceId: route.workspaceId,
    canonicalPath,
    objectKey: buildBlobObjectKey({ workspaceId: route.workspaceId, canonicalPath }),
  }
}

export const isAgenticGraphStorageBlobRoute = (pathname: string): boolean =>
  String(pathname || '').startsWith(AGENTIC_OS_STORAGE_ROUTE_PATHS.blobPrefix)

const readBlobUploadLimit = (env: AgenticGraphStorageWorkerEnv): number => {
  const configured = Number(String(env.AGENTIC_OS_STORAGE_BLOB_MAX_BYTES || '').trim())
  return Number.isFinite(configured) && configured > 0
    ? Math.min(D1_BLOB_MAX_OBJECT_BYTES, Math.floor(configured))
    : D1_BLOB_MAX_OBJECT_BYTES
}

export const handleBlobUpload = async (request: Request, env: AgenticGraphStorageWorkerEnv): Promise<Response> => {
  const route = readAgenticGraphStorageBlobRoute(new URL(request.url).pathname)
  if (!route) return errorResponse(400, 'bad_request', 'workspaceId and canonicalPath are required')
  const db = readD1BlobDatabase(env)
  if (!db) return errorResponse(503, 'server_error', 'D1 blob storage is unavailable')
  const maxBytes = readBlobUploadLimit(env)
  const upload = await readD1BlobRequest(request, maxBytes)
  if (!upload.ok) return errorResponse(upload.reason === 'too-large' ? 413 : 400, 'bad_request',
    upload.reason === 'too-large' ? `blob payload exceeds ${maxBytes} byte limit` : 'blob upload body length is invalid')
  const bytes = upload.body
  const contentType = normalizeString(request.headers.get('content-type')) || 'application/octet-stream'
  const contentHash = normalizeString(request.headers.get('x-agentic-graph-content-hash')) || null
  const uploadedAtMs = Date.now()
  try {
    const saved = await writeD1Blob({ db, objectKey: route.objectKey, body: bytes,
      contentType, contentHash, nowMs: uploadedAtMs, customMetadata: {
        workspaceId: route.workspaceId, canonicalPath: route.canonicalPath,
        ...(contentHash ? { contentHash } : {}), uploadedAtMs: String(uploadedAtMs),
      } })
    return okBlobUploadResponse({
      workspaceId: route.workspaceId,
      canonicalPath: route.canonicalPath,
      objectKey: route.objectKey,
      contentType,
      contentHash,
      sizeBytes: saved.sizeBytes,
      etag: `"${saved.etag}"`,
      uploadedAtMs: saved.uploadedAtMs,
      publicPath: `${AGENTIC_OS_STORAGE_ROUTE_PATHS.blobPrefix}${encodeURIComponent(route.workspaceId)}/${encodeURIComponent(route.canonicalPath)}`,
    })
  } catch (error) {
    if (String(error).includes('graph_d1_blob_quota_exceeded')) {
      return errorResponse(507, 'server_error', 'D1 blob storage quota is exhausted')
    }
    throw error
  }
}

export const handleBlobRead = async (request: Request, env: AgenticGraphStorageWorkerEnv): Promise<Response> => {
  const route = readAgenticGraphStorageBlobRoute(new URL(request.url).pathname)
  if (!route) return errorResponse(400, 'bad_request', 'workspaceId and canonicalPath are required')
  const db = readD1BlobDatabase(env)
  if (!db) return errorResponse(503, 'server_error', 'D1 blob storage is unavailable')
  const stored = await readD1Blob(db, route.objectKey, request.method !== 'HEAD')
  if (!stored) return errorResponse(404, 'not_found', 'blob object not found')
  const headers = new Headers(BLOB_CORS_HEADERS)
  headers.set('content-type', stored.object.content_type || 'application/octet-stream')
  headers.set('cache-control', headers.get('cache-control') || 'no-store')
  headers.set('content-length', String(stored.object.size_bytes))
  headers.set('etag', `"${stored.object.etag}"`)
  headers.set('last-modified', new Date(stored.object.updated_at).toUTCString())
  headers.set('x-agentic-graph-storage-object-key', route.objectKey)
  return new Response(request.method === 'HEAD' ? null : stored.body || null, {
    status: 200,
    headers,
  })
}
