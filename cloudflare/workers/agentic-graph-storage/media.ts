// =============================================================================
// Media D1 surface — agentic-graph-storage worker
// agentic-graph-widget-canvas-media spec · Tasks 7.1, 7.2
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
  AGENTIC_OS_STORAGE_API_VERSION,
  type AgenticGraphStorageErrorResponse,
} from './contract'
import { normalizeString } from './db'
import { D1_BLOB_MAX_OBJECT_BYTES, readD1Blob, readD1BlobDatabase, readD1BlobRequest, writeD1Blob } from './d1BlobStore'
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

export const AGENTIC_OS_MEDIA_ROUTE_PREFIX = '/api/storage/media/'

// -----------------------------------------------------------------------------
// Env duck-type — avoids import cycle with the canvas contract.
// Media bytes share the bounded D1 blob store and preserve the airvio/runs key namespace.
// -----------------------------------------------------------------------------

export interface AgenticGraphStorageMediaEnv {
  DB?: unknown
  [key: string]: unknown
}

// -----------------------------------------------------------------------------
// CORS / response helpers (mirror blob.ts)
// -----------------------------------------------------------------------------

const MEDIA_CORS_HEADERS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET,HEAD,PUT,POST,OPTIONS',
  'access-control-allow-headers':
    'content-type,authorization,content-hash,x-agentic-graph-content-hash',
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
  code: AgenticGraphStorageErrorResponse['code'] | typeof MEDIA_AUTH_UNAUTHENTICATED_CODE | typeof MEDIA_AUTH_UNAUTHORIZED_CODE,
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
export const isAgenticGraphStorageMediaRoute = (
  pathname: string,
  _authProvider?: MediaAuthProvider,
): boolean => String(pathname || '').startsWith(AGENTIC_OS_MEDIA_ROUTE_PREFIX)

// -----------------------------------------------------------------------------
// Key extraction
//
// Path format:  /api/storage/media/airvio/runs/{runId}/{stageId}/{shotId}.{ext}
// D1 object key: airvio/runs/{runId}/{stageId}/{shotId}.{ext}
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
  const suffix = pathname.slice(AGENTIC_OS_MEDIA_ROUTE_PREFIX.length)
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
// D1 binding helper
// -----------------------------------------------------------------------------

const readMediaDb = (env: AgenticGraphStorageMediaEnv) => readD1BlobDatabase(env)

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
  env: AgenticGraphStorageMediaEnv,
  authProvider: MediaAuthProvider = defaultMediaAuthProvider,
): Promise<Response> => {
  const objectKey = readMediaObjectKey(new URL(request.url).pathname)
  if (!objectKey) {
    return errorResponse(400, 'bad_request', 'invalid media object key; expected airvio/runs/{runId}/{stageId}/{shotId}.{ext}')
  }

  // Auth check — must come before any D1 access
  const authError = await enforceAuth(request, objectKey, authProvider)
  if (authError) return authError

  const db = readMediaDb(env)
  if (!db) return errorResponse(503, 'server_error', 'D1 blob storage is unavailable')
  const upload = await readD1BlobRequest(request)
  if (!upload.ok) return errorResponse(upload.reason === 'too-large' ? 413 : 400, 'bad_request',
    upload.reason === 'too-large' ? `media payload exceeds ${D1_BLOB_MAX_OBJECT_BYTES} byte limit` : 'media upload body length is invalid')
  const bytes = upload.body

  const contentType =
    normalizeString(request.headers.get('content-type')) || 'application/octet-stream'
  const contentHash =
    normalizeString(
      request.headers.get('content-hash') || request.headers.get('x-agentic-graph-content-hash'),
    ) || null

  const storedAtMs = Date.now()
  let saved: Awaited<ReturnType<typeof writeD1Blob>>
  try {
    saved = await writeD1Blob({ db, objectKey, body: bytes, contentType, contentHash, nowMs: storedAtMs,
      customMetadata: { ...(contentHash ? { contentHash } : {}), storedAtMs: String(storedAtMs) } })
  } catch (error) {
    if (String(error).includes('graph_d1_blob_quota_exceeded')) {
      return errorResponse(507, 'server_error', 'D1 blob storage quota is exhausted')
    }
    throw error
  }

  const responseBody = {
    ok: true,
    apiVersion: AGENTIC_OS_STORAGE_API_VERSION,
    objectKey,
    contentType,
    contentHash,
    etag: `"${saved.etag}"`,
    storedAtMs: saved.uploadedAtMs,
    publicPath: `${AGENTIC_OS_MEDIA_ROUTE_PREFIX}${objectKey}`,
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
  env: AgenticGraphStorageMediaEnv,
  authProvider: MediaAuthProvider = defaultMediaAuthProvider,
): Promise<Response> => {
  const objectKey = readMediaObjectKey(new URL(request.url).pathname)
  if (!objectKey) {
    return errorResponse(400, 'bad_request', 'invalid media object key; expected airvio/runs/{runId}/{stageId}/{shotId}.{ext}')
  }

  // Auth check — must come before any D1 access
  const authError = await enforceAuth(request, objectKey, authProvider)
  if (authError) return authError

  const db = readMediaDb(env)
  if (!db) return errorResponse(503, 'server_error', 'D1 blob storage is unavailable')
  const stored = await readD1Blob(db, objectKey, request.method !== 'HEAD')
  if (!stored) {
    return errorResponse(404, 'not_found', `media object not found: ${objectKey}`)
  }

  const headers = new Headers(MEDIA_CORS_HEADERS)
  headers.set('content-type', stored.object.content_type || 'application/octet-stream')
  headers.set('cache-control', headers.get('cache-control') || 'public, max-age=31536000, immutable')
  headers.set('content-length', String(stored.object.size_bytes))
  headers.set('etag', `"${stored.object.etag}"`)
  headers.set('last-modified', new Date(stored.object.updated_at).toUTCString())
  headers.set('x-agentic-graph-storage-object-key', objectKey)

  return new Response(request.method === 'HEAD' ? null : stored.body || null, {
    status: 200,
    headers,
  })
}
