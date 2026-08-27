// =============================================================================
// Media R2 surface — knowgrph-storage worker
// knowgrph-widget-canvas-media spec · Tasks 7.1, 7.2
// Requirements R3.3, R4.1, R4.2, R4.4, R4.5, R4.6, R9.3, R9.4, R9.5
//
// Routes:
//   PUT  /api/storage/media/airvio/runs/{runId}/{stageId}/{shotId}.{ext}  — write
//   GET|HEAD /api/storage/media/airvio/runs/{runId}/{stageId}/{shotId}.{ext} — read/replay
//
// Auth: run-scoped Bearer token (see mediaAuth.ts).
// Both read and write require a verified token for the matching runId.
// =============================================================================

import {
  KNOWGRPH_STORAGE_API_VERSION,
  type KnowgrphStorageErrorResponse,
  type KnowgrphStorageR2BucketLike,
  type KnowgrphStorageR2ObjectLike,
} from './contract'
import { normalizeString } from './db'
import {
  MEDIA_AUTH_UNAUTHENTICATED_CODE,
  MEDIA_AUTH_UNAUTHORIZED_CODE,
  defaultMediaAuthProvider,
  extractRunIdFromKey,
  type MediaAuthResult,
  type MediaAuthProvider,
} from './mediaAuth'

// Re-export auth constants so callers can reference them without importing mediaAuth directly.
export { MEDIA_AUTH_UNAUTHENTICATED_CODE, MEDIA_AUTH_UNAUTHORIZED_CODE }
export type { MediaAuthProvider }

// -----------------------------------------------------------------------------
// Constants
// -----------------------------------------------------------------------------

export const KNOWGRPH_MEDIA_ROUTE_PREFIX = '/api/storage/media/'

// -----------------------------------------------------------------------------
// Env duck-type — avoids import cycle with the canvas contract.
// Media bytes share the canonical generated-artifact R2 bucket so uploaded
// objects appear under the operator-owned knowgrph-storage-blobs/airvio/ prefix.
// -----------------------------------------------------------------------------

export interface KnowgrphStorageMediaEnv {
  KNOWGRPH_STORAGE_BLOB_BUCKET?: KnowgrphStorageR2BucketLike
  [key: string]: unknown
}

// -----------------------------------------------------------------------------
// CORS / response helpers (mirror blob.ts)
// -----------------------------------------------------------------------------

const MEDIA_CORS_HEADERS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET,HEAD,PUT,POST,OPTIONS',
  'access-control-allow-headers':
    'content-type,authorization,content-hash,x-knowgrph-content-hash',
  'access-control-max-age': '86400',
} as const

const jsonResponse = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      ...MEDIA_CORS_HEADERS,
    },
  })

const errorResponse = (
  status: number,
  code: KnowgrphStorageErrorResponse['code'] | typeof MEDIA_AUTH_UNAUTHENTICATED_CODE | typeof MEDIA_AUTH_UNAUTHORIZED_CODE,
  error: string,
): Response => {
  const body = {
    ok: false,
    code,
    error,
  }
  return jsonResponse(status, body)
}

// -----------------------------------------------------------------------------
// Route predicate
// -----------------------------------------------------------------------------

/**
 * Returns true when `pathname` belongs to the media route namespace.
 * Used by `index.ts` to dispatch before the blob route check.
 *
 * @param pathname - URL pathname to test.
 * @param _authProvider - reserved; kept for API symmetry (unused here).
 */
export const isKnowgrphStorageMediaRoute = (
  pathname: string,
  _authProvider?: MediaAuthProvider,
): boolean => String(pathname || '').startsWith(KNOWGRPH_MEDIA_ROUTE_PREFIX)

// -----------------------------------------------------------------------------
// Key extraction
//
// Path format:  /api/storage/media/airvio/runs/{runId}/{stageId}/{shotId}.{ext}
// R2 object key: airvio/runs/{runId}/{stageId}/{shotId}.{ext}
//
// Validation mirrors blob.ts: no traversal segments, no control characters.
// -----------------------------------------------------------------------------

const isValidMediaObjectKey = (key: string): boolean => {
  if (!key) return false
  const segments = key.split('/').filter(Boolean)
  const runsIndex = segments.indexOf('runs')
  if (runsIndex < 1) return false
  if (segments.length !== runsIndex + 4) return false
  for (const seg of segments) {
    if (seg === '.' || seg === '..') return false
    // eslint-disable-next-line no-control-regex
    if (/[\u0000-\u001f\u007f]/.test(seg)) return false
  }
  // Last segment must contain a dot (the extension)
  const last = segments[segments.length - 1]
  if (!last.includes('.')) return false
  return true
}

export const readMediaObjectKey = (pathname: string): string | null => {
  const suffix = pathname.slice(KNOWGRPH_MEDIA_ROUTE_PREFIX.length)
  if (!suffix) return null
  // Decode each segment individually to handle percent-encoding safely
  const decoded = suffix
    .split('/')
    .map(seg => {
      try {
        return decodeURIComponent(seg)
      } catch {
        return seg
      }
    })
    .join('/')
  const key = normalizeString(decoded).replace(/^\/+/, '')
  if (!isValidMediaObjectKey(key)) return null
  return key
}

// -----------------------------------------------------------------------------
// Bucket helper
// -----------------------------------------------------------------------------

const readMediaBucket = (env: KnowgrphStorageMediaEnv): KnowgrphStorageR2BucketLike | null => {
  const bucket = env.KNOWGRPH_STORAGE_BLOB_BUCKET
  if (!bucket || typeof bucket.put !== 'function' || typeof bucket.get !== 'function') return null
  return bucket
}

// -----------------------------------------------------------------------------
// R2 etag helper (mirrors blob.ts)
// -----------------------------------------------------------------------------

const readR2ObjectEtag = (
  object: KnowgrphStorageR2ObjectLike | null | undefined,
): string | null => normalizeString(object?.httpEtag || object?.etag || '') || null

// -----------------------------------------------------------------------------
// Auth enforcement helper
//
// Runs the auth check (injectable for tests) and returns either null (ok) or
// a pre-built error Response to return immediately.
// -----------------------------------------------------------------------------

const enforceAuth = async (
  request: Request,
  objectKey: string,
  authProvider: MediaAuthProvider,
): Promise<Response | null> => {
  const runId = extractRunIdFromKey(objectKey)
  if (!runId) {
    // Malformed key — treat as unauthenticated (should not reach here normally)
    return errorResponse(401, MEDIA_AUTH_UNAUTHENTICATED_CODE, 'authentication required')
  }

  const result = await authProvider(request, runId)
  if (result.ok) return null
  const authFailure = result as Extract<MediaAuthResult, { ok: false }>
  const status = authFailure.code === MEDIA_AUTH_UNAUTHENTICATED_CODE ? 401 : 403
  return errorResponse(status, authFailure.code, authFailure.authError)
}

// -----------------------------------------------------------------------------
// WRITE — PUT /api/storage/media/airvio/runs/{runId}/{stageId}/{shotId}.{ext}
//
// Requirements R3.3, R4.1, R4.2, R4.5, R4.6, R9.3, R9.4, R9.5
// Reads optional `content-hash` header and stores it as customMetadata.
// Requires a verified run-scoped Bearer token.
// -----------------------------------------------------------------------------

export const handleMediaWrite = async (
  request: Request,
  env: KnowgrphStorageMediaEnv,
  authProvider: MediaAuthProvider = defaultMediaAuthProvider,
): Promise<Response> => {
  const objectKey = readMediaObjectKey(new URL(request.url).pathname)
  if (!objectKey) {
    return errorResponse(400, 'bad_request', 'invalid media object key; expected airvio/runs/{runId}/{stageId}/{shotId}.{ext}')
  }

  // Auth check — must come before any R2 or data access
  const authError = await enforceAuth(request, objectKey, authProvider)
  if (authError) return authError

  const bucket = readMediaBucket(env)
  if (!bucket) {
    return errorResponse(500, 'server_error', 'missing Cloudflare R2 binding KNOWGRPH_STORAGE_BLOB_BUCKET')
  }

  const contentType =
    normalizeString(request.headers.get('content-type')) || 'application/octet-stream'
  const contentHash =
    normalizeString(
      request.headers.get('content-hash') || request.headers.get('x-knowgrph-content-hash'),
    ) || null

  const storedAtMs = Date.now()

  const object = await bucket.put(objectKey, request.body || null, {
    httpMetadata: {
      contentType,
    },
    customMetadata: {
      ...(contentHash ? { contentHash } : {}),
      storedAtMs: String(storedAtMs),
    },
  })

  const etag = readR2ObjectEtag(object)

  const responseBody = {
    ok: true,
    apiVersion: KNOWGRPH_STORAGE_API_VERSION,
    objectKey,
    contentType,
    contentHash,
    etag,
    storedAtMs,
    publicPath: `${KNOWGRPH_MEDIA_ROUTE_PREFIX}${objectKey}`,
  }

  return new Response(JSON.stringify(responseBody), {
    status: 200,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      ...MEDIA_CORS_HEADERS,
    },
  })
}

// -----------------------------------------------------------------------------
// READ — GET|HEAD /api/storage/media/airvio/runs/{runId}/{stageId}/{shotId}.{ext}
//
// Requirements R4.1, R4.2, R4.4, R4.5, R4.6, R9.3, R9.4, R9.5
// Returns the stored bytes (or headers only for HEAD).
// Returns 404 when the object is not found so the canvas can show a fallback.
// Requires a verified run-scoped Bearer token.
// -----------------------------------------------------------------------------

export const handleMediaRead = async (
  request: Request,
  env: KnowgrphStorageMediaEnv,
  authProvider: MediaAuthProvider = defaultMediaAuthProvider,
): Promise<Response> => {
  const objectKey = readMediaObjectKey(new URL(request.url).pathname)
  if (!objectKey) {
    return errorResponse(400, 'bad_request', 'invalid media object key; expected airvio/runs/{runId}/{stageId}/{shotId}.{ext}')
  }

  // Auth check — must come before any R2 or data access
  const authError = await enforceAuth(request, objectKey, authProvider)
  if (authError) return authError

  const bucket = readMediaBucket(env)
  if (!bucket) {
    return errorResponse(500, 'server_error', 'missing Cloudflare R2 binding KNOWGRPH_STORAGE_BLOB_BUCKET')
  }

  const object =
    request.method === 'HEAD' && typeof bucket.head === 'function'
      ? await bucket.head(objectKey)
      : await bucket.get(objectKey)

  if (!object) {
    return errorResponse(404, 'not_found', `media object not found: ${objectKey}`)
  }

  const headers = new Headers(MEDIA_CORS_HEADERS)
  if (typeof object.writeHttpMetadata === 'function') object.writeHttpMetadata(headers)
  if (!headers.get('content-type')) headers.set('content-type', 'application/octet-stream')
  headers.set('cache-control', headers.get('cache-control') || 'public, max-age=31536000, immutable')

  const etag = readR2ObjectEtag(object)
  if (etag) headers.set('etag', etag)
  headers.set('x-knowgrph-storage-object-key', objectKey)

  return new Response(request.method === 'HEAD' ? null : object.body || null, {
    status: 200,
    headers,
  })
}
