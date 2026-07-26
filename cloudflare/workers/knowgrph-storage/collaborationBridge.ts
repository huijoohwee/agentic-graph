import {
  KNOWGRPH_STORAGE_API_VERSION,
  type KnowgrphCollaborationSaveRequest,
  type KnowgrphCollaborationSaveResponse,
  type KnowgrphStorageErrorResponse,
  type KnowgrphStorageWorkerEnv,
} from './contract'
import {
  hasRelayAccessRole,
  readAuthenticatedChatContext,
  readAuthorizedMembership,
} from './chatAuth'
import { type D1DatabaseLike, normalizeString } from './db'
import {
  assertDevStorageRelayRequest,
  StorageRelayError,
} from './storage-relay/storageRelaySafety'
import {
  readStorageGitRemoteAuthority,
  type StorageGitRemoteAuthority,
} from './storageGitRemoteAuthority'
import {
  formatCollaborationJson,
  serializeCollaborationYDocStateBase64,
} from '../../../grph-shared/src/collaboration/yjsSnapshot'
import {
  DOCUMENT_REPOSITORY_TARGETS,
  resolveDocumentRepositoryAuthorityResult,
} from '../../../grph-shared/src/collaboration/documentRepositoryAuthority'

const KNOWGRPH_COLLABORATION_AWARENESS_STALE_MS = 2 * 60_000

const CORS_HEADERS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET,POST,OPTIONS',
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

const okCollaborationSaveResponse = (body: Omit<KnowgrphCollaborationSaveResponse, 'ok' | 'apiVersion'>): Response =>
  json(200, {
    ok: true,
    apiVersion: KNOWGRPH_STORAGE_API_VERSION,
    ...body,
  } satisfies KnowgrphCollaborationSaveResponse)

const readJsonBody = async (request: Request): Promise<unknown> => {
  try {
    return await request.json()
  } catch {
    return null
  }
}

const isCollaborationSaveRequest = (value: unknown): value is KnowgrphCollaborationSaveRequest => {
  if (!value || typeof value !== 'object') return false
  const record = value as Record<string, unknown>
  return (
    record.apiVersion === KNOWGRPH_STORAGE_API_VERSION
    && (record.operation === 'upsert' || record.operation === 'delete')
    && typeof record.workspaceId === 'string'
    && typeof record.documentKey === 'string'
    && (record.documentKind === 'markdown' || record.documentKind === 'json')
    && (record.repositoryTarget === DOCUMENT_REPOSITORY_TARGETS.knowgrphDocs
      || record.repositoryTarget === DOCUMENT_REPOSITORY_TARGETS.workspaceDocs)
    && (record.gitRemoteId === undefined || typeof record.gitRemoteId === 'string')
    && typeof record.serializedText === 'string'
    && typeof record.yjsStateBase64 === 'string'
    && typeof record.activePeerCount === 'number'
    && (record.pocketBaseRoomId == null || typeof record.pocketBaseRoomId === 'string')
    && (record.savedByPeerId == null || typeof record.savedByPeerId === 'string')
    && (record.saveBoundary === 'explicit' || record.saveBoundary === 'autosave')
  )
}

const encodeUtf8Base64 = (value: string): string => {
  if (typeof Buffer !== 'undefined') return Buffer.from(value, 'utf8').toString('base64')
  const bytes = new TextEncoder().encode(value)
  let binary = ''
  const chunkSize = 0x8000
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize))
  }
  return btoa(binary)
}

const decodeUtf8Base64 = (value: string): string => {
  const normalized = normalizeString(value).replace(/\s+/g, '')
  if (!normalized) return ''
  if (typeof Buffer !== 'undefined') return Buffer.from(normalized, 'base64').toString('utf8')
  const binary = atob(normalized)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
  return new TextDecoder().decode(bytes)
}

const readCanonicalCollaborationSaveTextWithState = (args: {
  documentKey: string
  documentKind: 'markdown' | 'json'
  serializedText: string
  activePeerCount: number
  yjsStateBase64: string
}): {
  text: string
  error: string | null
} => {
  const activePeerCount = Math.max(0, Math.floor(Number(args.activePeerCount || 0)))
  const yjsStateBase64 = normalizeString(args.yjsStateBase64)
  if (yjsStateBase64) {
    try {
      return {
        text: serializeCollaborationYDocStateBase64({
          documentKey: args.documentKey,
          documentKind: args.documentKind,
          yjsStateBase64,
        }),
        error: null,
      }
    } catch {
      return { text: '', error: 'collaboration Yjs snapshot could not be serialized' }
    }
  }
  if (args.documentKind !== 'json') return { text: args.serializedText, error: null }
  let parsed: unknown
  try {
    parsed = JSON.parse(args.serializedText)
  } catch {
    return { text: '', error: 'collaboration JSON save payload is not valid JSON' }
  }
  if (activePeerCount >= 2) {
    return { text: '', error: 'concurrent JSON save requires Yjs CRDT state' }
  }
  return { text: formatCollaborationJson(parsed), error: null }
}

const readGitHubBridgeConfig = (
  env: KnowgrphStorageWorkerEnv,
  authority: StorageGitRemoteAuthority,
): {
  token: string
  owner: string
  repo: string
  branch: string
  committerName: string
  committerEmail: string
} => {
  return {
    token: normalizeString(env.KNOWGRPH_STORAGE_GITHUB_TOKEN),
    owner: normalizeString(env.KNOWGRPH_STORAGE_GITHUB_OWNER),
    repo: authority.repository,
    branch: normalizeString(env.KNOWGRPH_STORAGE_GITHUB_BRANCH) || 'main',
    committerName: normalizeString(env.KNOWGRPH_STORAGE_GITHUB_COMMITTER_NAME),
    committerEmail: normalizeString(env.KNOWGRPH_STORAGE_GITHUB_COMMITTER_EMAIL),
  }
}

const readPocketBaseBridgeConfig = (env: KnowgrphStorageWorkerEnv): {
  baseUrl: string
  token: string
} => ({
  baseUrl: normalizeString(env.KNOWGRPH_STORAGE_POCKETBASE_URL),
  token: normalizeString(env.KNOWGRPH_STORAGE_POCKETBASE_TOKEN),
})

const readJsonObject = async (response: Response): Promise<Record<string, unknown> | null> => {
  const value = await response.json().catch(() => null)
  return value && typeof value === 'object' ? value as Record<string, unknown> : null
}

const readNestedString = (value: unknown, path: string[]): string => {
  let current = value
  for (let i = 0; i < path.length; i += 1) {
    if (!current || typeof current !== 'object') return ''
    current = (current as Record<string, unknown>)[path[i]!]
  }
  return normalizeString(current)
}

const readRecordNumber = (record: unknown, key: string): number => {
  const value = record && typeof record === 'object' ? Number((record as Record<string, unknown>)[key]) : 0
  return Number.isFinite(value) ? value : 0
}

const commitCollaborationSnapshotToGitHub = async (args: {
  env: KnowgrphStorageWorkerEnv
  gitAuthority: StorageGitRemoteAuthority
  githubPath: string
  text: string
}): Promise<{ commitSha: string | null; contentSha: string | null }> => {
  const config = readGitHubBridgeConfig(args.env, args.gitAuthority)
  if (!config.token) throw new Error('missing GitHub bridge token')
  if (!config.owner || !config.repo) {
    throw new Error(`missing GitHub bridge repository config for ${args.gitAuthority.repositoryTarget}`)
  }
  const apiUrl = `https://api.github.com/repos/${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repo)}/contents/${args.githubPath}`
  const headers = {
    accept: 'application/vnd.github+json',
    authorization: `Bearer ${config.token}`,
    'content-type': 'application/json',
    'user-agent': 'knowgrph-storage-collaboration-bridge',
    'x-github-api-version': '2022-11-28',
  }
  const currentResponse = await fetch(`${apiUrl}?ref=${encodeURIComponent(config.branch)}`, { headers })
  let currentSha = ''
  if (currentResponse.ok) {
    const currentJson = await readJsonObject(currentResponse)
    currentSha = readNestedString(currentJson, ['sha'])
    const currentContentBase64 = readNestedString(currentJson, ['content'])
    if (currentSha && currentContentBase64 && decodeUtf8Base64(currentContentBase64) === args.text) {
      return { commitSha: null, contentSha: currentSha }
    }
  } else if (currentResponse.status !== 404) {
    throw new Error(`GitHub contents read failed (${currentResponse.status})`)
  }
  const body: Record<string, unknown> = {
    message: `chore(sync): save ${args.githubPath.replace(/^docs\//, '')} from ${args.gitAuthority.repositoryTarget} collaboration bridge`,
    content: encodeUtf8Base64(args.text),
    branch: config.branch,
  }
  if (currentSha) body.sha = currentSha
  if (config.committerName && config.committerEmail) {
    body.committer = {
      name: config.committerName,
      email: config.committerEmail,
    }
  }
  const putResponse = await fetch(apiUrl, {
    method: 'PUT',
    headers,
    body: JSON.stringify(body),
  })
  const putJson = await readJsonObject(putResponse)
  if (!putResponse.ok) {
    const message = readNestedString(putJson, ['message']) || `GitHub contents write failed (${putResponse.status})`
    throw new Error(message)
  }
  return {
    commitSha: readNestedString(putJson, ['commit', 'sha']) || null,
    contentSha: readNestedString(putJson, ['content', 'sha']) || null,
  }
}

const deleteCollaborationSnapshotFromGitHub = async (args: {
  env: KnowgrphStorageWorkerEnv
  gitAuthority: StorageGitRemoteAuthority
  githubPath: string
}): Promise<{ commitSha: string | null; contentSha: null }> => {
  const config = readGitHubBridgeConfig(args.env, args.gitAuthority)
  if (!config.token) throw new Error('missing GitHub bridge token')
  if (!config.owner || !config.repo) {
    throw new Error(`missing GitHub bridge repository config for ${args.gitAuthority.repositoryTarget}`)
  }
  const apiUrl = `https://api.github.com/repos/${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repo)}/contents/${args.githubPath}`
  const headers = {
    accept: 'application/vnd.github+json',
    authorization: `Bearer ${config.token}`,
    'content-type': 'application/json',
    'user-agent': 'knowgrph-storage-collaboration-bridge',
    'x-github-api-version': '2022-11-28',
  }
  const currentResponse = await fetch(`${apiUrl}?ref=${encodeURIComponent(config.branch)}`, { headers })
  if (currentResponse.status === 404) return { commitSha: null, contentSha: null }
  if (!currentResponse.ok) {
    throw new Error(`GitHub contents read failed (${currentResponse.status})`)
  }
  const currentJson = await readJsonObject(currentResponse)
  const currentSha = readNestedString(currentJson, ['sha'])
  if (!currentSha) throw new Error('GitHub contents read returned no content SHA')
  const body: Record<string, unknown> = {
    message: `chore(sync): delete ${args.githubPath.replace(/^docs\//, '')} from ${args.gitAuthority.repositoryTarget} collaboration bridge`,
    sha: currentSha,
    branch: config.branch,
  }
  if (config.committerName && config.committerEmail) {
    body.committer = {
      name: config.committerName,
      email: config.committerEmail,
    }
  }
  const deleteResponse = await fetch(apiUrl, {
    method: 'DELETE',
    headers,
    body: JSON.stringify(body),
  })
  const deleteJson = await readJsonObject(deleteResponse)
  if (!deleteResponse.ok) {
    const message = readNestedString(deleteJson, ['message'])
      || `GitHub contents delete failed (${deleteResponse.status})`
    throw new Error(message)
  }
  return {
    commitSha: readNestedString(deleteJson, ['commit', 'sha']) || null,
    contentSha: null,
  }
}

const quotePocketBaseFilterValue = (value: string): string => JSON.stringify(String(value || ''))

const readPocketBaseCollaborationSnapshot = async (args: {
  env: KnowgrphStorageWorkerEnv
  roomId: string | null
}): Promise<{ activePeerCount: number; yjsStateBase64: string } | null> => {
  const roomId = normalizeString(args.roomId)
  const config = readPocketBaseBridgeConfig(args.env)
  if (!roomId || !config.baseUrl) return null
  const headers: Record<string, string> = { accept: 'application/json' }
  if (config.token) headers.authorization = `Bearer ${config.token}`
  const base = config.baseUrl.endsWith('/') ? config.baseUrl : `${config.baseUrl}/`
  const roomUrl = new URL(`api/collections/collab_rooms/records/${encodeURIComponent(roomId)}`, base)
  const roomResponse = await fetch(roomUrl.toString(), { headers })
  if (!roomResponse.ok) throw new Error(`PocketBase room read failed (${roomResponse.status})`)
  const roomRecord = await readJsonObject(roomResponse)
  const awarenessUrl = new URL('api/collections/collab_awareness/records', base)
  awarenessUrl.searchParams.set('page', '1')
  awarenessUrl.searchParams.set('perPage', '200')
  awarenessUrl.searchParams.set('filter', `roomId = ${quotePocketBaseFilterValue(roomId)}`)
  const awarenessResponse = await fetch(awarenessUrl.toString(), { headers })
  if (!awarenessResponse.ok) throw new Error(`PocketBase awareness read failed (${awarenessResponse.status})`)
  const awarenessRecord = await readJsonObject(awarenessResponse)
  const items = Array.isArray(awarenessRecord?.items) ? awarenessRecord.items : []
  const currentMs = Date.now()
  const freshItems = items.filter(item => {
    const lastSeenAtMs = readRecordNumber(item, 'lastSeenAtMs')
    return lastSeenAtMs > 0 && currentMs - lastSeenAtMs <= KNOWGRPH_COLLABORATION_AWARENESS_STALE_MS
  })
  return {
    activePeerCount: Math.max(1, freshItems.length),
    yjsStateBase64: readNestedString(roomRecord, ['yjsStateBase64']),
  }
}

const readLocalDevGateFailure = (
  request: Request,
  env: KnowgrphStorageWorkerEnv,
): Response | null => {
  try {
    assertDevStorageRelayRequest(request, env)
    return null
  } catch (error) {
    if (error instanceof StorageRelayError && error.status === 400) {
      return errorResponse(400, 'bad_request', 'invalid collaboration save request URL')
    }
    return errorResponse(403, 'forbidden', 'collaboration save is restricted to the local Dev relay')
  }
}

export const handleCollaborationSave = async (
  request: Request,
  env: KnowgrphStorageWorkerEnv,
  db: D1DatabaseLike,
): Promise<Response> => {
  const gateFailure = readLocalDevGateFailure(request, env)
  if (gateFailure) return gateFailure
  const auth = await readAuthenticatedChatContext(request, db)
  if (auth.ok === false) return auth.response
  const body = await readJsonBody(request)
  if (!isCollaborationSaveRequest(body)) return errorResponse(400, 'bad_request', 'invalid collaboration save request')
  const workspaceId = normalizeString(body.workspaceId)
  const documentKey = normalizeString(body.documentKey)
  if (!workspaceId || !documentKey) return errorResponse(400, 'bad_request', 'workspaceId and documentKey are required')
  const membership = await readAuthorizedMembership({
    db,
    workspaceId,
    userId: auth.value.user.id,
  })
  if (membership.ok === false) return membership.response
  if (
    membership.membership.status !== 'active'
    || !hasRelayAccessRole(membership.membership.role)
  ) {
    return errorResponse(403, 'forbidden', 'active editor, owner, or provider-admin membership is required')
  }
  const authorityResult = resolveDocumentRepositoryAuthorityResult({
    documentKey,
    documentKind: body.documentKind,
  })
  if (authorityResult.ok === false) {
    return errorResponse(
      400,
      'bad_request',
      `unsupported collaboration save path: ${authorityResult.path || documentKey}`,
    )
  }
  const authority = authorityResult.authority
  if (authority.repositoryTarget !== body.repositoryTarget) {
    return errorResponse(400, 'bad_request', 'collaboration save repository target does not match path authority')
  }
  let gitAuthority: StorageGitRemoteAuthority
  try {
    gitAuthority = readStorageGitRemoteAuthority(env, body.repositoryTarget)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Git remote authority is invalid'
    return errorResponse(500, 'server_error', message)
  }
  if (
    body.gitRemoteId !== undefined
    && normalizeString(body.gitRemoteId) !== gitAuthority.remoteId
  ) {
    return errorResponse(400, 'bad_request', 'Git remote does not match collaboration repository target')
  }
  try {
    let result: { commitSha: string | null; contentSha: string | null }
    if (body.operation === 'delete') {
      result = await deleteCollaborationSnapshotFromGitHub({
        env,
        gitAuthority,
        githubPath: authority.githubPath,
      })
    } else {
      const pocketBaseSnapshot = await readPocketBaseCollaborationSnapshot({
        env,
        roomId: body.pocketBaseRoomId,
      })
      const canonical = readCanonicalCollaborationSaveTextWithState({
        documentKey,
        documentKind: body.documentKind,
        serializedText: body.serializedText,
        activePeerCount: pocketBaseSnapshot?.activePeerCount ?? body.activePeerCount,
        yjsStateBase64: body.yjsStateBase64 || pocketBaseSnapshot?.yjsStateBase64 || '',
      })
      if (canonical.error) return errorResponse(409, 'conflict', canonical.error)
      result = await commitCollaborationSnapshotToGitHub({
        env,
        gitAuthority,
        githubPath: authority.githubPath,
        text: canonical.text,
      })
    }
    return okCollaborationSaveResponse({
      operation: body.operation,
      workspaceId,
      documentKey,
      repositoryTarget: authority.repositoryTarget,
      githubPath: authority.githubPath,
      commitSha: result.commitSha,
      contentSha: result.contentSha,
      committedAtMs: Date.now(),
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'collaboration save bridge failed'
    if (message.includes('missing GitHub bridge token')) return errorResponse(403, 'forbidden', message)
    return errorResponse(500, 'server_error', message)
  }
}
