import { GitRemoteRegistry } from './gitRemoteRegistry'
import {
  GitHubGitDatabaseAdapter,
  assertGitAuthorityPath,
  type GitRemoteCommitIdentity,
  type GitRemoteObjectRequest,
  type GitRemotePushChange,
  type GitRemotePushRequest,
} from './githubGitDatabaseAdapter'
import {
  assertDevStorageRelayRequest,
  authorizeStorageRelayRequest,
  createStorageRelayOperationId,
  readStorageRelayJsonRequest,
  STORAGE_RELAY_API_VERSION,
  StorageRelayError,
  StorageRelayOperation,
  storageRelayErrorResponse,
  storageRelayJsonResponse,
  type StorageRelayAuthHooks,
  type StorageRelayFetch,
} from './storageRelaySafety'

type GitRelayBaseRequest = {
  apiVersion: string
  workspaceId: string
  remoteId: string
  action: string
}

type GitRelayResolveRefRequest = GitRelayBaseRequest & {
  action: 'resolve-ref'
}

type GitRelayReadObjectsRequest = GitRelayBaseRequest & {
  action: 'read-objects'
  objects: GitRemoteObjectRequest[]
}

type EncodedPushChange =
  | { path: string; mode: '100644' | '100755'; contentBase64: string }
  | { path: string; delete: true }

type GitRelayPushRequest = GitRelayBaseRequest & {
  action: 'push-commit'
  expectedOldOid: string
  expectedTreeOid: string
  commit: GitRemotePushRequest['commit']
  changes: EncodedPushChange[]
}

type GitRelayRequest =
  | GitRelayResolveRefRequest
  | GitRelayReadObjectsRequest
  | GitRelayPushRequest

const OID_PATTERN = /^[0-9a-f]{40}$/
const RFC3339_WITH_ZONE_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/
const FORBIDDEN_CLIENT_AUTHORITY_FIELDS = [
  'url',
  'baseUrl',
  'owner',
  'repository',
  'repo',
  'branch',
  'ref',
  'token',
  'accessToken',
] as const

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)

const assertIdentifier = (value: unknown): string => {
  if (
    typeof value !== 'string'
    || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/.test(value)
  ) {
    throw new StorageRelayError({ code: 'invalid_request', status: 400 })
  }
  return value
}

const assertOid = (value: unknown): string => {
  if (typeof value !== 'string' || !OID_PATTERN.test(value)) {
    throw new StorageRelayError({ code: 'invalid_request', status: 400 })
  }
  return value
}

const decodeBase64 = (value: unknown): Uint8Array => {
  if (typeof value !== 'string' || value.length > 14_000_000) {
    throw new StorageRelayError({ code: 'invalid_request', status: 400 })
  }
  const normalized = value.replace(/\s+/g, '')
  if (normalized.length % 4 === 1 || !/^[A-Za-z0-9+/]*={0,2}$/u.test(normalized)) {
    throw new StorageRelayError({ code: 'invalid_request', status: 400 })
  }
  let binary: string
  try {
    binary = atob(normalized)
  } catch {
    throw new StorageRelayError({ code: 'invalid_request', status: 400 })
  }
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
  return bytes
}

const parseIdentity = (value: unknown): GitRemoteCommitIdentity => {
  if (!isRecord(value)) throw new StorageRelayError({ code: 'invalid_request', status: 400 })
  const name = typeof value.name === 'string' ? value.name.trim() : ''
  const email = typeof value.email === 'string' ? value.email.trim() : ''
  const date = typeof value.date === 'string' ? value.date.trim() : ''
  if (
    !name
    || name.length > 256
    || /[\u0000\r\n]/u.test(name)
    || !email
    || email.length > 320
    || /[\u0000\r\n<>]/u.test(email)
    || !RFC3339_WITH_ZONE_PATTERN.test(date)
    || !Number.isFinite(Date.parse(date))
  ) {
    throw new StorageRelayError({ code: 'invalid_request', status: 400 })
  }
  return { name, email, date }
}

const parseObjectRequests = (value: unknown): GitRemoteObjectRequest[] => {
  if (!Array.isArray(value) || value.length < 1 || value.length > 32) {
    throw new StorageRelayError({ code: 'limit_exceeded', status: 413 })
  }
  const seen = new Set<string>()
  return value.map(candidate => {
    if (!isRecord(candidate)) throw new StorageRelayError({ code: 'invalid_request', status: 400 })
    const oid = assertOid(candidate.oid)
    const type = candidate.type
    const representation = candidate.representation
    if (
      (type !== 'blob' && type !== 'tree' && type !== 'commit')
      || (representation != null && representation !== 'canonical' && representation !== 'normalized')
      || (type !== 'commit' && representation === 'normalized')
    ) {
      throw new StorageRelayError({ code: 'invalid_request', status: 400 })
    }
    const key = `${type}:${oid}`
    if (seen.has(key)) throw new StorageRelayError({ code: 'invalid_request', status: 400 })
    seen.add(key)
    return {
      oid,
      type,
      ...(representation
        ? { representation: representation as GitRemoteObjectRequest['representation'] }
        : {}),
    }
  })
}

const parsePushRequest = (
  value: GitRelayPushRequest,
  allowedPathPrefixes: readonly string[],
): GitRemotePushRequest => {
  if (!isRecord(value.commit)) {
    throw new StorageRelayError({ code: 'invalid_request', status: 400 })
  }
  const message = typeof value.commit.message === 'string' ? value.commit.message : ''
  if (!message || message.length > 10_000 || message.includes('\0')) {
    throw new StorageRelayError({ code: 'invalid_request', status: 400 })
  }
  if (!Array.isArray(value.changes) || value.changes.length < 1 || value.changes.length > 24) {
    throw new StorageRelayError({ code: 'limit_exceeded', status: 413 })
  }
  const seenPaths = new Set<string>()
  const seenPortablePaths = new Set<string>()
  const changes: GitRemotePushChange[] = value.changes.map(candidate => {
    if (!isRecord(candidate)) throw new StorageRelayError({ code: 'invalid_request', status: 400 })
    const path = assertGitAuthorityPath(
      typeof candidate.path === 'string' ? candidate.path : '',
      allowedPathPrefixes,
    )
    const portablePath = path.normalize('NFC').toLocaleLowerCase('en-US')
    if (seenPaths.has(path) || seenPortablePaths.has(portablePath)) {
      throw new StorageRelayError({ code: 'invalid_request', status: 400 })
    }
    seenPaths.add(path)
    seenPortablePaths.add(portablePath)
    if ('delete' in candidate && candidate.delete === true) return { path, delete: true }
    const writeCandidate = candidate as Extract<EncodedPushChange, { mode: '100644' | '100755' }>
    const mode = writeCandidate.mode
    if (mode !== '100644' && mode !== '100755') {
      throw new StorageRelayError({ code: 'invalid_request', status: 400 })
    }
    return { path, mode, content: decodeBase64(writeCandidate.contentBase64) }
  })
  return {
    expectedOldOid: assertOid(value.expectedOldOid),
    expectedTreeOid: assertOid(value.expectedTreeOid),
    commit: {
      expectedOid: assertOid(value.commit.expectedOid),
      message,
      author: parseIdentity(value.commit.author),
      committer: parseIdentity(value.commit.committer),
    },
    changes,
  }
}

const parseBaseRequest = (value: unknown): GitRelayRequest => {
  if (!isRecord(value) || value.apiVersion !== STORAGE_RELAY_API_VERSION) {
    throw new StorageRelayError({ code: 'invalid_request', status: 400 })
  }
  if (FORBIDDEN_CLIENT_AUTHORITY_FIELDS.some(field => field in value)) {
    throw new StorageRelayError({ code: 'invalid_request', status: 400 })
  }
  const action = value.action
  if (action !== 'resolve-ref' && action !== 'read-objects' && action !== 'push-commit') {
    throw new StorageRelayError({ code: 'invalid_request', status: 400 })
  }
  return {
    ...value,
    apiVersion: STORAGE_RELAY_API_VERSION,
    workspaceId: assertIdentifier(value.workspaceId),
    remoteId: assertIdentifier(value.remoteId),
    action,
  } as GitRelayRequest
}

export const createGitRemoteRelayHandler = <AuthContext>(dependencies: {
  env: { AGENTIC_OS_STORAGE_DEV_REMOTE_RELAY_ENABLED?: string }
  authHooks: StorageRelayAuthHooks<AuthContext>
  registry: GitRemoteRegistry
  adapter?: GitHubGitDatabaseAdapter
  fetcher?: StorageRelayFetch
  timeoutMs?: number
  maxBytes?: number
}) => async (request: Request): Promise<Response> => {
  const operationId = createStorageRelayOperationId(request)
  const operation = new StorageRelayOperation({
    fetcher: dependencies.fetcher,
    timeoutMs: dependencies.timeoutMs,
    maxBytes: dependencies.maxBytes,
  })
  try {
    assertDevStorageRelayRequest(request, dependencies.env)
    if (request.method !== 'POST') {
      throw new StorageRelayError({ code: 'invalid_request', status: 405 })
    }
    const payload = parseBaseRequest(
      await readStorageRelayJsonRequest<unknown>(request, operation.budget),
    )
    await authorizeStorageRelayRequest({
      request,
      workspaceId: payload.workspaceId,
      access: payload.action === 'push-commit' ? 'write' : 'read',
      hooks: dependencies.authHooks,
      signal: operation.signal,
    })
    const registration = dependencies.registry.resolve(payload)
    const adapter = dependencies.adapter ?? new GitHubGitDatabaseAdapter()
    if (payload.action === 'resolve-ref') {
      const resolved = await adapter.resolveRef(registration, operation)
      return storageRelayJsonResponse(200, {
        ok: true,
        apiVersion: STORAGE_RELAY_API_VERSION,
        operationId,
        remoteId: registration.remoteId,
        branch: registration.branch,
        oid: resolved.oid,
        objectFormat: 'sha1',
      })
    }
    if (payload.action === 'read-objects') {
      const records = await adapter.readObjects({
        registration,
        requests: parseObjectRequests(payload.objects),
        operation,
      })
      return storageRelayJsonResponse(200, {
        ok: true,
        apiVersion: STORAGE_RELAY_API_VERSION,
        operationId,
        remoteId: registration.remoteId,
        records,
      })
    }
    const result = await adapter.pushCommit({
      registration,
      request: parsePushRequest(payload, registration.allowedPathPrefixes),
      operation,
    })
    return storageRelayJsonResponse(200, {
      ok: true,
      apiVersion: STORAGE_RELAY_API_VERSION,
      operationId,
      remoteId: registration.remoteId,
      ...result,
    })
  } catch (error) {
    return storageRelayErrorResponse(error, operationId)
  } finally {
    operation.dispose()
  }
}
