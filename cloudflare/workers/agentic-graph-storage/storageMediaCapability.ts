import {
  AGENTIC_OS_STORAGE_API_VERSION,
  AGENTIC_OS_STORAGE_ROUTE_PATHS,
  type AgenticGraphStorageR2ObjectLike,
  type AgenticGraphStorageWorkerEnv,
} from './contract'
import { normalizeString } from './db'
import { AGENTIC_OS_MEDIA_ROUTE_PREFIX, readMediaObjectKey } from './media'

export const AGENTIC_OS_STORAGE_MEDIA_CAPABILITY_SCHEMA = 'agentic-graph-storage-media-capability/v1' as const
const MAX_TTL_SECONDS = 15 * 60
const MIN_SECRET_BYTES = 32

type MediaOperation = 'read' | 'write'
type CapabilityPayload = {
  schema: typeof AGENTIC_OS_STORAGE_MEDIA_CAPABILITY_SCHEMA
  workspaceId: string
  objectKey: string
  operation: MediaOperation
  subjectUserId: string
  issuedAtMs: number
  expiresAtMs: number
  nonce: string
}

const json = (status: number, body: unknown): Response => new Response(JSON.stringify(body), {
  status,
  headers: {
    'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store',
    'access-control-allow-origin': '*', 'access-control-allow-headers': 'content-type,x-agentic-graph-media-capability',
  },
})

const base64UrlEncode = (bytes: Uint8Array): string => {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

const base64UrlDecode = (value: string): Uint8Array => {
  if (!/^[A-Za-z0-9_-]+$/.test(value) || value.length > 8_192) throw new Error('invalid media capability')
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=')
  const binary = atob(base64)
  return Uint8Array.from(binary, character => character.charCodeAt(0))
}

const readSecret = (env: AgenticGraphStorageWorkerEnv): string => {
  const secret = String(env.AGENTIC_OS_STORAGE_SIGNING_SECRET || '')
  if (new TextEncoder().encode(secret).byteLength < MIN_SECRET_BYTES) throw new Error('storage signing secret is unavailable')
  return secret
}

const importKey = async (secret: string): Promise<CryptoKey> => await crypto.subtle.importKey(
  'raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify'],
)

const sign = async (payloadBytes: Uint8Array, secret: string): Promise<Uint8Array> =>
  new Uint8Array(await crypto.subtle.sign('HMAC', await importKey(secret), payloadBytes))

const readToken = (request: Request): string => {
  const header = normalizeString(request.headers.get('x-agentic-graph-media-capability'))
  if (header) return header
  try { return normalizeString(new URL(request.url).searchParams.get('agentic_os_media_capability')) } catch { return '' }
}

export const mintAgenticGraphStorageMediaCapability = async (args: {
  env: AgenticGraphStorageWorkerEnv
  workspaceId: string
  objectKey: string
  operation: MediaOperation
  subjectUserId: string
  ttlSeconds?: number
  nowMs?: number
}): Promise<{ token: string; expiresAtMs: number; urlPath: string }> => {
  const nowMs = args.nowMs ?? Date.now()
  const ttlSeconds = Math.max(30, Math.min(MAX_TTL_SECONDS, Math.floor(args.ttlSeconds || 300)))
  const payload: CapabilityPayload = {
    schema: AGENTIC_OS_STORAGE_MEDIA_CAPABILITY_SCHEMA,
    workspaceId: normalizeString(args.workspaceId),
    objectKey: normalizeString(args.objectKey).replace(/^\/+/, ''),
    operation: args.operation,
    subjectUserId: normalizeString(args.subjectUserId),
    issuedAtMs: nowMs,
    expiresAtMs: nowMs + ttlSeconds * 1_000,
    nonce: crypto.randomUUID(),
  }
  if (!payload.workspaceId || !payload.objectKey || !payload.subjectUserId) throw new Error('invalid media capability request')
  const payloadBytes = new TextEncoder().encode(JSON.stringify(payload))
  const token = `${base64UrlEncode(payloadBytes)}.${base64UrlEncode(await sign(payloadBytes, readSecret(args.env)))}`
  return {
    token,
    expiresAtMs: payload.expiresAtMs,
    urlPath: `${AGENTIC_OS_MEDIA_ROUTE_PREFIX}${payload.objectKey}?agentic_os_media_capability=${encodeURIComponent(token)}`,
  }
}

const verifyCapability = async (args: {
  request: Request
  env: AgenticGraphStorageWorkerEnv
  objectKey: string
  operation: MediaOperation
  nowMs?: number
}): Promise<CapabilityPayload> => {
  const [payloadPart, signaturePart, extra] = readToken(args.request).split('.')
  if (!payloadPart || !signaturePart || extra) throw new Error('media capability is required')
  const payloadBytes = base64UrlDecode(payloadPart)
  const signature = base64UrlDecode(signaturePart)
  const valid = await crypto.subtle.verify('HMAC', await importKey(readSecret(args.env)), signature, payloadBytes)
  if (!valid) throw new Error('invalid media capability signature')
  let value: unknown
  try { value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(payloadBytes)) } catch { throw new Error('invalid media capability payload') }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('invalid media capability payload')
  const payload = value as CapabilityPayload
  const nowMs = args.nowMs ?? Date.now()
  if (
    payload.schema !== AGENTIC_OS_STORAGE_MEDIA_CAPABILITY_SCHEMA
    || normalizeString(payload.objectKey) !== args.objectKey
    || payload.operation !== args.operation
    || !normalizeString(payload.workspaceId)
    || !normalizeString(payload.subjectUserId)
    || !Number.isSafeInteger(payload.issuedAtMs)
    || !Number.isSafeInteger(payload.expiresAtMs)
    || payload.issuedAtMs > nowMs + 30_000
    || payload.expiresAtMs <= nowMs
    || payload.expiresAtMs - payload.issuedAtMs > MAX_TTL_SECONDS * 1_000
  ) throw new Error('media capability does not authorize this request')
  return payload
}

const readBucket = (env: AgenticGraphStorageWorkerEnv) => {
  const bucket = env.AGENTIC_OS_STORAGE_BLOB_BUCKET
  if (!bucket || typeof bucket.get !== 'function' || typeof bucket.put !== 'function') throw new Error('media bucket is unavailable')
  return bucket
}

const assertOwnedObject = (object: AgenticGraphStorageR2ObjectLike, payload: CapabilityPayload): void => {
  const metadata = object.customMetadata || {}
  if (
    metadata.agenticGraphWorkspaceId !== payload.workspaceId
    || metadata.agenticGraphCapabilitySchema !== AGENTIC_OS_STORAGE_MEDIA_CAPABILITY_SCHEMA
  ) throw new Error('media object ownership does not match the capability')
}

export const handleAgenticGraphStorageCapabilityMediaRoute = async (
  request: Request,
  env: AgenticGraphStorageWorkerEnv,
): Promise<Response> => {
  const objectKey = readMediaObjectKey(new URL(request.url).pathname)
  if (!objectKey) return json(400, { ok: false, code: 'bad_request', error: 'invalid media object key' })
  const operation: MediaOperation = request.method === 'PUT' || request.method === 'POST' ? 'write' : 'read'
  if (!['GET', 'HEAD', 'PUT', 'POST'].includes(request.method)) {
    return json(405, { ok: false, code: 'bad_request', error: 'unsupported media route method' })
  }
  let capability: CapabilityPayload
  try { capability = await verifyCapability({ request, env, objectKey, operation }) } catch (error) {
    return json(403, { ok: false, code: 'authorization_failed', error: error instanceof Error ? error.message : 'media authorization failed' })
  }
  const bucket = readBucket(env)
  if (operation === 'write') {
    const storedAtMs = Date.now()
    const contentType = normalizeString(request.headers.get('content-type')) || 'application/octet-stream'
    const contentHash = normalizeString(request.headers.get('content-hash') || request.headers.get('x-agentic-graph-content-hash'))
    const object = await bucket.put(objectKey, request.body || null, {
      httpMetadata: { contentType },
      customMetadata: {
        agenticGraphWorkspaceId: capability.workspaceId,
        agenticGraphOwnerUserId: capability.subjectUserId,
        agenticGraphCapabilitySchema: AGENTIC_OS_STORAGE_MEDIA_CAPABILITY_SCHEMA,
        storedAtMs: String(storedAtMs),
        ...(contentHash ? { contentHash } : {}),
      },
    })
    return json(200, {
      ok: true,
      apiVersion: AGENTIC_OS_STORAGE_API_VERSION,
      workspaceId: capability.workspaceId,
      objectKey,
      etag: normalizeString(object?.httpEtag || object?.etag) || null,
      storedAtMs,
      publicPath: `${AGENTIC_OS_MEDIA_ROUTE_PREFIX}${objectKey}`,
    })
  }
  const object = request.method === 'HEAD' && typeof bucket.head === 'function'
    ? await bucket.head(objectKey)
    : await bucket.get(objectKey)
  if (!object) return json(404, { ok: false, code: 'not_found', error: 'media object not found' })
  try { assertOwnedObject(object, capability) } catch (error) {
    return json(403, { ok: false, code: 'authorization_failed', error: error instanceof Error ? error.message : 'media ownership mismatch' })
  }
  const headers = new Headers({ 'cache-control': 'private, no-store', 'x-agentic-graph-storage-object-key': objectKey })
  headers.set('access-control-allow-origin', '*')
  object.writeHttpMetadata?.(headers)
  if (!headers.has('content-type')) headers.set('content-type', 'application/octet-stream')
  return new Response(request.method === 'HEAD' ? null : object.body || null, { status: 200, headers })
}

export const isAgenticGraphStorageMediaCapabilityRoute = (pathname: string): boolean =>
  pathname === AGENTIC_OS_STORAGE_ROUTE_PATHS.mediaCapability
