import {
  KNOWGRPH_STORAGE_API_VERSION,
  type KnowgrphStorageErrorResponse,
  type KnowgrphStorageWorkerEnv,
} from './contract'
import {
  hasRelayAccessRole,
  readAuthenticatedChatContext,
  readAuthorizedMembership,
} from './chatAuth'
import type { D1DatabaseLike } from './db'

export const KNOWGRPH_STORAGE_SYNC_MAX_REQUEST_BYTES = 16 * 1_024 * 1_024

export type KnowgrphStorageSyncPrincipal =
  | { local: true }
  | { local: false; userId: string }

type AuthorizationResult =
  | { ok: true; principal: KnowgrphStorageSyncPrincipal }
  | { ok: false; response: Response }

type JsonBodyResult =
  | { ok: true; value: unknown }
  | { ok: false; response: Response }

const CORS_HEADERS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET,HEAD,POST,OPTIONS',
  'access-control-allow-headers': 'content-type,authorization,x-knowgrph-session-token',
  'access-control-max-age': '86400',
}

const errorResponse = (status: number, error: string): Response =>
  new Response(JSON.stringify({
    ok: false,
    apiVersion: KNOWGRPH_STORAGE_API_VERSION,
    error,
    code: status === 403 ? 'forbidden' : 'bad_request',
  } satisfies KnowgrphStorageErrorResponse), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      ...CORS_HEADERS,
    },
  })

export const cancelKnowgrphStorageRequestBody = async (
  body: ReadableStream<Uint8Array> | null,
): Promise<void> => {
  try { await body?.cancel('storage sync request rejected before body consumption') } catch { /* already locked */ }
}

export const isKnowgrphStorageLocalRuntime = (env: KnowgrphStorageWorkerEnv): boolean =>
  String(env.KNOWGRPH_STORAGE_LOCAL_RUNTIME || '').trim() === 'true'

export const authenticateKnowgrphStorageSyncRequest = async (
  request: Request,
  env: KnowgrphStorageWorkerEnv,
  db: D1DatabaseLike,
): Promise<AuthorizationResult> => {
  if (isKnowgrphStorageLocalRuntime(env)) {
    return { ok: true, principal: { local: true } }
  }
  const auth = await readAuthenticatedChatContext(request, db)
  if (auth.ok === false) {
    await cancelKnowgrphStorageRequestBody(request.body)
    return auth
  }
  if (auth.value.user.status !== 'active') {
    await cancelKnowgrphStorageRequestBody(request.body)
    return { ok: false, response: errorResponse(403, 'active user status is required') }
  }
  return { ok: true, principal: { local: false, userId: auth.value.user.id } }
}

export const authorizeKnowgrphStorageWorkspace = async (args: {
  db: D1DatabaseLike
  workspaceId: string
  principal: KnowgrphStorageSyncPrincipal
  access: 'read' | 'write'
}): Promise<{ ok: true } | { ok: false; response: Response }> => {
  const principal = args.principal
  if (!('userId' in principal)) return { ok: true }
  const membership = await readAuthorizedMembership({
    db: args.db,
    workspaceId: args.workspaceId,
    userId: principal.userId,
  })
  if (membership.ok === false) return membership
  const active = membership.membership.status === 'active'
  const roleAllowed = args.access === 'write'
    ? hasRelayAccessRole(membership.membership.role)
    : ['viewer', 'editor', 'owner', 'provider-admin'].includes(membership.membership.role)
  if (!active || !roleAllowed) {
    return {
      ok: false,
      response: errorResponse(
        403,
        args.access === 'write'
          ? 'active editor, owner, or provider-admin membership is required'
          : 'active workspace membership is required',
      ),
    }
  }
  return { ok: true }
}

export const readBoundedKnowgrphStorageSyncJson = async (
  request: Request,
): Promise<JsonBodyResult> => {
  const mediaType = request.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase()
  if (mediaType !== 'application/json') {
    await cancelKnowgrphStorageRequestBody(request.body)
    return { ok: false, response: errorResponse(400, 'storage sync requests require application/json') }
  }
  const declaredText = request.headers.get('content-length')
  let declaredLength: number | null = null
  if (declaredText !== null) {
    declaredLength = Number(declaredText)
    if (!/^\d+$/.test(declaredText) || !Number.isSafeInteger(declaredLength)) {
      await cancelKnowgrphStorageRequestBody(request.body)
      return { ok: false, response: errorResponse(400, 'invalid storage sync content-length') }
    }
    if (declaredLength > KNOWGRPH_STORAGE_SYNC_MAX_REQUEST_BYTES) {
      await cancelKnowgrphStorageRequestBody(request.body)
      return { ok: false, response: errorResponse(413, 'storage sync request exceeds the byte limit') }
    }
  }
  if (!request.body) return { ok: false, response: errorResponse(400, 'storage sync request body is required') }

  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      total += value.byteLength
      if (total > KNOWGRPH_STORAGE_SYNC_MAX_REQUEST_BYTES) {
        await reader.cancel('storage sync request exceeds the byte limit')
        return { ok: false, response: errorResponse(413, 'storage sync request exceeds the byte limit') }
      }
      chunks.push(value)
    }
  } catch {
    try { await reader.cancel('storage sync request stream failed') } catch { /* already closed */ }
    return { ok: false, response: errorResponse(400, 'storage sync request body is unreadable') }
  } finally {
    try { reader.releaseLock() } catch { /* already released */ }
  }
  if (declaredLength !== null && total !== declaredLength) {
    return { ok: false, response: errorResponse(400, 'storage sync content-length does not match the body') }
  }
  const bytes = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
  try {
    return {
      ok: true,
      value: JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as unknown,
    }
  } catch {
    return { ok: false, response: errorResponse(400, 'invalid storage sync JSON request') }
  }
}
