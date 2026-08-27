import {
  KNOWGRPH_STORAGE_API_VERSION,
  KNOWGRPH_STORAGE_ROUTE_PATHS,
  type KnowgrphStorageBlobUploadResponse,
  type KnowgrphStorageErrorResponse,
  type KnowgrphStorageR2BucketLike,
  type KnowgrphStorageR2ObjectLike,
  type KnowgrphStorageWorkerEnv,
} from './contract'
import { normalizeString } from './db'

const BLOB_CORS_HEADERS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET,HEAD,POST,OPTIONS',
  'access-control-allow-headers': 'content-type,authorization,x-knowgrph-content-hash,x-knowgrph-content-kind',
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

const okBlobUploadResponse = (body: Omit<KnowgrphStorageBlobUploadResponse, 'ok' | 'apiVersion'>): Response =>
  json(200, {
    ok: true,
    apiVersion: KNOWGRPH_STORAGE_API_VERSION,
    ...body,
  } satisfies KnowgrphStorageBlobUploadResponse)

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

export const readKnowgrphStorageBlobRoute = (
  pathname: string,
): { workspaceId: string; canonicalPath: string; objectKey: string } | null => {
  const route = readDocRouteSegments(pathname, KNOWGRPH_STORAGE_ROUTE_PATHS.blobPrefix)
  if (!route) return null
  const canonicalPath = normalizeBlobCanonicalPath(route.canonicalPath)
  if (!canonicalPath) return null
  return {
    workspaceId: route.workspaceId,
    canonicalPath,
    objectKey: buildBlobObjectKey({ workspaceId: route.workspaceId, canonicalPath }),
  }
}

const readBlobBucket = (env: KnowgrphStorageWorkerEnv): KnowgrphStorageR2BucketLike | null => {
  const bucket = env.KNOWGRPH_STORAGE_BLOB_BUCKET
  if (!bucket || typeof bucket.put !== 'function' || typeof bucket.get !== 'function') return null
  return bucket
}

const readBlobUploadLimitBytes = (env: KnowgrphStorageWorkerEnv): number => {
  const parsed = Number(String(env.KNOWGRPH_STORAGE_BLOB_MAX_BYTES || '').trim())
  if (Number.isFinite(parsed) && parsed > 0) return Math.floor(parsed)
  return 100 * 1024 * 1024
}

const readRequestContentLength = (request: Request): number | null => {
  const header = request.headers.get('content-length')
  if (header === null) return null
  const normalized = header.trim()
  if (!/^\d+$/.test(normalized)) return Number.NaN
  const parsed = Number(normalized)
  return Number.isSafeInteger(parsed) ? parsed : Number.NaN
}

const buildBoundedBlobBody = (
  body: ReadableStream<Uint8Array> | null,
  maxBytes: number,
): { body: ReadableStream<Uint8Array> | null; exceeded: () => boolean } => {
  if (!body) return { body: null, exceeded: () => false }
  const reader = body.getReader()
  let totalBytes = 0
  let limitExceeded = false
  return {
    exceeded: () => limitExceeded,
    body: new ReadableStream<Uint8Array>({
      async pull(controller) {
        try {
          const next = await reader.read()
          if (next.done) {
            controller.close()
            reader.releaseLock()
            return
          }
          totalBytes += next.value.byteLength
          if (totalBytes > maxBytes) {
            limitExceeded = true
            await reader.cancel('blob payload exceeds the configured byte limit')
            controller.error(new Error('blob_payload_limit_exceeded'))
            return
          }
          controller.enqueue(next.value)
        } catch (error) {
          controller.error(error)
        }
      },
      async cancel(reason) {
        try { await reader.cancel(reason) } catch { /* already closed */ }
      },
    }),
  }
}

const readR2ObjectEtag = (object: KnowgrphStorageR2ObjectLike | null | undefined): string | null =>
  normalizeString(object?.httpEtag || object?.etag || '') || null

export const isKnowgrphStorageBlobRoute = (pathname: string): boolean =>
  String(pathname || '').startsWith(KNOWGRPH_STORAGE_ROUTE_PATHS.blobPrefix)

export const handleBlobUpload = async (request: Request, env: KnowgrphStorageWorkerEnv): Promise<Response> => {
  const route = readKnowgrphStorageBlobRoute(new URL(request.url).pathname)
  if (!route) return errorResponse(400, 'bad_request', 'workspaceId and canonicalPath are required')
  const bucket = readBlobBucket(env)
  if (!bucket) return errorResponse(500, 'server_error', 'missing Cloudflare R2 binding KNOWGRPH_STORAGE_BLOB_BUCKET')
  const contentLength = readRequestContentLength(request)
  const maxBytes = readBlobUploadLimitBytes(env)
  if (contentLength != null && (!Number.isFinite(contentLength) || contentLength > maxBytes)) {
    try { await request.body?.cancel('blob payload rejected before upload') } catch { /* already locked */ }
    return errorResponse(
      contentLength > maxBytes ? 413 : 400,
      'bad_request',
      contentLength > maxBytes
        ? `blob payload exceeds ${maxBytes} byte limit`
        : 'invalid blob content-length',
    )
  }
  const contentType = normalizeString(request.headers.get('content-type')) || 'application/octet-stream'
  const contentHash = normalizeString(request.headers.get('x-knowgrph-content-hash')) || null
  const uploadedAtMs = Date.now()
  const boundedBody = buildBoundedBlobBody(request.body, maxBytes)
  let object: KnowgrphStorageR2ObjectLike | null | undefined
  try {
    object = await bucket.put(route.objectKey, boundedBody.body, {
      httpMetadata: {
        contentType,
      },
      customMetadata: {
        workspaceId: route.workspaceId,
        canonicalPath: route.canonicalPath,
        ...(contentHash ? { contentHash } : {}),
        uploadedAtMs: String(uploadedAtMs),
      },
    })
  } catch (error) {
    if (boundedBody.exceeded()) {
      return errorResponse(413, 'bad_request', `blob payload exceeds ${maxBytes} byte limit`)
    }
    throw error
  }
  return okBlobUploadResponse({
    workspaceId: route.workspaceId,
    canonicalPath: route.canonicalPath,
    objectKey: route.objectKey,
    contentType,
    contentHash,
    sizeBytes: contentLength,
    etag: readR2ObjectEtag(object),
    uploadedAtMs,
    publicPath: `${KNOWGRPH_STORAGE_ROUTE_PATHS.blobPrefix}${encodeURIComponent(route.workspaceId)}/${encodeURIComponent(route.canonicalPath)}`,
  })
}

export const handleBlobRead = async (request: Request, env: KnowgrphStorageWorkerEnv): Promise<Response> => {
  const route = readKnowgrphStorageBlobRoute(new URL(request.url).pathname)
  if (!route) return errorResponse(400, 'bad_request', 'workspaceId and canonicalPath are required')
  const bucket = readBlobBucket(env)
  if (!bucket) return errorResponse(500, 'server_error', 'missing Cloudflare R2 binding KNOWGRPH_STORAGE_BLOB_BUCKET')
  const object = request.method === 'HEAD' && typeof bucket.head === 'function'
    ? await bucket.head(route.objectKey)
    : await bucket.get(route.objectKey)
  if (!object) return errorResponse(404, 'not_found', 'blob object not found')
  const headers = new Headers(BLOB_CORS_HEADERS)
  if (typeof object.writeHttpMetadata === 'function') object.writeHttpMetadata(headers)
  if (!headers.get('content-type')) headers.set('content-type', 'application/octet-stream')
  headers.set('cache-control', headers.get('cache-control') || 'no-store')
  const etag = readR2ObjectEtag(object)
  if (etag) headers.set('etag', etag)
  headers.set('x-knowgrph-storage-object-key', route.objectKey)
  return new Response(request.method === 'HEAD' ? null : object.body || null, {
    status: 200,
    headers,
  })
}
