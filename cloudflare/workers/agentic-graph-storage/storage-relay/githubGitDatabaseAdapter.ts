import type { GitRemoteRegistration } from './gitRemoteRegistry'
import { assertAppliedCommitGraph } from './gitPushAttestation'
import {
  discardStorageRelayResponse,
  mapStorageRelayUpstreamStatus,
  readStorageRelayJsonResponse,
  StorageRelayError,
  type StorageRelayOperation,
} from './storageRelaySafety'

const GITHUB_API_ORIGIN = 'https://api.github.com'
const GITHUB_API_VERSION = '2026-03-10'
const GIT_OID_PATTERN = /^[0-9a-f]{40}$/
const MAX_OBJECT_BATCH = 32
const MAX_PUSH_CHANGES = 24
type GitHubRefResponse = {
  ref?: unknown
  object?: { type?: unknown; sha?: unknown }
}
type GitHubBlobResponse = {
  sha?: unknown
  size?: unknown
  encoding?: unknown
  content?: unknown
}
type GitHubTreeEntry = {
  path?: unknown
  mode?: unknown
  type?: unknown
  sha?: unknown
  size?: unknown
}
type GitHubTreeResponse = {
  sha?: unknown
  truncated?: unknown
  tree?: unknown
}
type GitHubCommitPerson = {
  name?: unknown
  email?: unknown
  date?: unknown
}
type GitHubCommitResponse = {
  sha?: unknown
  message?: unknown
  tree?: { sha?: unknown }
  parents?: unknown
  author?: GitHubCommitPerson
  committer?: GitHubCommitPerson
}
export type GitRemoteObjectRequest = {
  oid: string
  type: 'blob' | 'tree' | 'commit'
  representation?: 'canonical' | 'normalized'
}

export type GitRemoteObjectRecord =
  | {
      type: 'blob'
      remoteOid: string
      canonicalVerified: true
      canonicalPayloadBase64: string
      byteLength: number
    }
  | {
      type: 'tree'
      remoteOid: string
      canonicalVerified: true
      canonicalPayloadBase64: string
      byteLength: number
      entries: Array<{
        path: string
        mode: '100644' | '100755' | '040000'
        type: 'blob' | 'tree'
        oid: string
        size: number | null
      }>
    }
  | {
      type: 'commit'
      remoteOid: string
      canonicalVerified: false
      representation: 'normalized'
      treeOid: string
      parentOids: string[]
      message: string
      author: GitRemoteCommitIdentity
      committer: GitRemoteCommitIdentity
    }

export type GitRemoteCommitIdentity = {
  name: string
  email: string
  date: string
}

export type GitRemotePushChange =
  | { path: string; mode: '100644' | '100755'; content: Uint8Array }
  | { path: string; delete: true }

export type GitRemotePushRequest = {
  expectedOldOid: string
  expectedTreeOid: string
  commit: {
    expectedOid: string
    message: string
    author: GitRemoteCommitIdentity
    committer: GitRemoteCommitIdentity
  }
  changes: GitRemotePushChange[]
}

const assertGitOid = (value: unknown): string => {
  if (typeof value !== 'string' || !GIT_OID_PATTERN.test(value)) {
    throw new StorageRelayError({ code: 'invalid_response', status: 502 })
  }
  return value
}

const encodeBase64 = (bytes: Uint8Array): string => {
  let binary = ''
  const chunkSize = 0x8000
  for (let offset = 0; offset < bytes.byteLength; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize))
  }
  return btoa(binary)
}

const decodeGitHubBase64 = (value: unknown): Uint8Array => {
  if (typeof value !== 'string') {
    throw new StorageRelayError({ code: 'invalid_response', status: 502 })
  }
  const normalized = value.replace(/\s+/g, '')
  if (!/^[A-Za-z0-9+/]*={0,2}$/u.test(normalized)) {
    throw new StorageRelayError({ code: 'invalid_response', status: 502 })
  }
  let binary: string
  try {
    binary = atob(normalized)
  } catch {
    throw new StorageRelayError({ code: 'invalid_response', status: 502 })
  }
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
  return bytes
}

const concatenateBytes = (...parts: Uint8Array[]): Uint8Array => {
  const totalLength = parts.reduce((sum, part) => sum + part.byteLength, 0)
  const bytes = new Uint8Array(totalLength)
  let offset = 0
  for (const part of parts) {
    bytes.set(part, offset)
    offset += part.byteLength
  }
  return bytes
}

const readHexBytes = (oid: string): Uint8Array => {
  const bytes = new Uint8Array(20)
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(oid.slice(index * 2, index * 2 + 2), 16)
  }
  return bytes
}

const computeGitObjectOid = async (type: 'blob' | 'tree', payload: Uint8Array): Promise<string> => {
  const header = new TextEncoder().encode(`${type} ${payload.byteLength}\0`)
  const digest = await crypto.subtle.digest('SHA-1', concatenateBytes(header, payload))
  return Array.from(new Uint8Array(digest))
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('')
}

const compareBytes = (left: Uint8Array, right: Uint8Array): number => {
  const length = Math.min(left.byteLength, right.byteLength)
  for (let index = 0; index < length; index += 1) {
    if (left[index] !== right[index]) return left[index]! - right[index]!
  }
  return left.byteLength - right.byteLength
}

const assertTreePath = (value: unknown): string => {
  if (
    typeof value !== 'string'
    || !value
    || value !== value.normalize('NFC')
    || value === '.'
    || value === '..'
    || value.includes('/')
    || /[\u0000-\u001f\u007f\\]/u.test(value)
  ) {
    throw new StorageRelayError({ code: 'invalid_response', status: 502 })
  }
  return value
}

const serializeCanonicalTree = (entries: Extract<GitRemoteObjectRecord, { type: 'tree' }>['entries']): Uint8Array => {
  const encoder = new TextEncoder()
  const sortedEntries = [...entries].sort((left, right) => {
    const leftSortName = encoder.encode(`${left.path}${left.type === 'tree' ? '/' : ''}`)
    const rightSortName = encoder.encode(`${right.path}${right.type === 'tree' ? '/' : ''}`)
    return compareBytes(leftSortName, rightSortName)
  })
  const parts = sortedEntries.flatMap(entry => {
    const serializedMode = entry.mode === '040000' ? '40000' : entry.mode
    return [
      encoder.encode(`${serializedMode} ${entry.path}\0`),
      readHexBytes(entry.oid),
    ]
  })
  return concatenateBytes(...parts)
}

const readString = (value: unknown, maxLength = 10_000): string => {
  if (typeof value !== 'string' || value.length > maxLength || value.includes('\0')) {
    throw new StorageRelayError({ code: 'invalid_response', status: 502 })
  }
  return value
}

const readCommitIdentity = (value: GitHubCommitPerson | undefined): GitRemoteCommitIdentity => ({
  name: readString(value?.name, 256),
  email: readString(value?.email, 320),
  date: readString(value?.date, 64),
})

export const assertGitAuthorityPath = (
  pathValue: string,
  allowedPathPrefixes: readonly string[],
): string => {
  const path = String(pathValue || '')
  const segments = path.split('/')
  if (
    !path
    || path.length > 1024
    || path !== path.normalize('NFC')
    || path.startsWith('/')
    || path.endsWith('/')
    || segments.some(segment => !segment || segment === '.' || segment === '..' || segment === '.git')
    || /[\u0000-\u001f\u007f\\]/u.test(path)
  ) {
    throw new StorageRelayError({ code: 'invalid_request', status: 400 })
  }
  const authorized = allowedPathPrefixes.some(prefix => path === prefix || path.startsWith(`${prefix}/`))
  if (!authorized) throw new StorageRelayError({ code: 'membership_forbidden', status: 403 })
  return path
}

const githubHeaders = (registration: GitRemoteRegistration, includeContentType = false): Headers => {
  const headers = new Headers({
    accept: 'application/vnd.github+json',
    authorization: `Bearer ${registration.token}`,
    'user-agent': 'agentic-graph-storage-git-relay',
    'x-github-api-version': GITHUB_API_VERSION,
  })
  if (includeContentType) headers.set('content-type', 'application/json')
  return headers
}

const repositoryBaseUrl = (registration: GitRemoteRegistration): string =>
  `${GITHUB_API_ORIGIN}/repos/${encodeURIComponent(registration.owner)}/${encodeURIComponent(registration.repository)}`

const encodedRefPath = (branch: string): string =>
  branch.split('/').map(segment => encodeURIComponent(segment)).join('/')

const readSuccessfulJson = async <Value>(
  response: Response,
  operation: StorageRelayOperation,
  acceptedStatuses: readonly number[],
): Promise<Value> => {
  if (!acceptedStatuses.includes(response.status)) {
    await discardStorageRelayResponse(response)
    throw mapStorageRelayUpstreamStatus(response.status)
  }
  return readStorageRelayJsonResponse<Value>(response, operation.budget)
}

export class GitHubGitDatabaseAdapter {
  async resolveRef(
    registration: GitRemoteRegistration,
    operation: StorageRelayOperation,
  ): Promise<{ oid: string }> {
    const url = `${repositoryBaseUrl(registration)}/git/ref/heads/${encodedRefPath(registration.branch)}`
    const response = await operation.fetch(url, { headers: githubHeaders(registration) })
    if (response.status === 409) {
      await discardStorageRelayResponse(response)
      throw new StorageRelayError({ code: 'not_found', status: 404 })
    }
    const body = await readSuccessfulJson<GitHubRefResponse>(response, operation, [200])
    if (body.object?.type !== 'commit') {
      throw new StorageRelayError({ code: 'invalid_response', status: 502 })
    }
    return { oid: assertGitOid(body.object.sha) }
  }

  async readObjects(args: {
    registration: GitRemoteRegistration
    requests: readonly GitRemoteObjectRequest[]
    operation: StorageRelayOperation
  }): Promise<GitRemoteObjectRecord[]> {
    if (args.requests.length < 1 || args.requests.length > MAX_OBJECT_BATCH) {
      throw new StorageRelayError({ code: 'limit_exceeded', status: 413 })
    }
    const records: GitRemoteObjectRecord[] = []
    for (const request of args.requests) {
      const oid = assertGitOid(request.oid)
      if (request.type === 'blob') {
        records.push(await this.readCanonicalBlob(args.registration, oid, args.operation))
      } else if (request.type === 'tree') {
        records.push(await this.readCanonicalTree(args.registration, oid, args.operation))
      } else {
        if (
          request.representation !== 'normalized'
          || args.registration.fetchPolicy !== 'normalized-commits'
        ) {
          throw new StorageRelayError({ code: 'invalid_request', status: 400 })
        }
        records.push(await this.readNormalizedCommit(args.registration, oid, args.operation))
      }
    }
    return records
  }

  async pushCommit(args: {
    registration: GitRemoteRegistration
    request: GitRemotePushRequest
    operation: StorageRelayOperation
  }): Promise<{ oldOid: string; newOid: string; treeOid: string }> {
    const { registration, request, operation } = args
    const expectedOldOid = assertGitOid(request.expectedOldOid)
    const expectedTreeOid = assertGitOid(request.expectedTreeOid)
    const expectedCommitOid = assertGitOid(request.commit.expectedOid)
    if (request.changes.length < 1 || request.changes.length > MAX_PUSH_CHANGES) {
      throw new StorageRelayError({ code: 'limit_exceeded', status: 413 })
    }
    const initialRef = await this.resolveRef(registration, operation)
    if (initialRef.oid === expectedCommitOid) {
      const targetCommit = await this.readNormalizedCommit(registration, expectedCommitOid, operation)
      assertAppliedCommitGraph(targetCommit, expectedOldOid, expectedTreeOid)
      return { oldOid: expectedOldOid, newOid: expectedCommitOid, treeOid: expectedTreeOid }
    }
    if (initialRef.oid !== expectedOldOid) {
      throw new StorageRelayError({ code: 'conflict', status: 409 })
    }
    const baseCommit = await this.readNormalizedCommit(registration, expectedOldOid, operation)
    const treeEntries: Array<Record<string, unknown>> = []
    for (const change of request.changes) {
      const path = assertGitAuthorityPath(change.path, registration.allowedPathPrefixes)
      if ('delete' in change) {
        treeEntries.push({ path, mode: '100644', type: 'blob', sha: null })
        continue
      }
      const blobOid = await this.createBlob(registration, change.content, operation)
      treeEntries.push({ path, mode: change.mode, type: 'blob', sha: blobOid })
    }
    const treeOid = await this.createTree(registration, {
      baseTreeOid: baseCommit.treeOid,
      entries: treeEntries,
      operation,
    })
    if (treeOid !== expectedTreeOid) {
      throw new StorageRelayError({ code: 'invalid_response', status: 502 })
    }
    const commitOid = await this.createCommit(registration, {
      parentOid: expectedOldOid,
      treeOid,
      request: request.commit,
      operation,
    })
    if (commitOid !== expectedCommitOid) {
      throw new StorageRelayError({ code: 'invalid_response', status: 502 })
    }
    const refBeforeUpdate = await this.resolveRef(registration, operation)
    if (refBeforeUpdate.oid === expectedCommitOid) {
      const targetCommit = await this.readNormalizedCommit(registration, expectedCommitOid, operation)
      assertAppliedCommitGraph(targetCommit, expectedOldOid, expectedTreeOid)
      return { oldOid: expectedOldOid, newOid: expectedCommitOid, treeOid: expectedTreeOid }
    }
    if (refBeforeUpdate.oid !== expectedOldOid) {
      throw new StorageRelayError({ code: 'conflict', status: 409 })
    }
    await this.updateRef(registration, expectedOldOid, commitOid, expectedTreeOid, operation)
    return { oldOid: expectedOldOid, newOid: commitOid, treeOid }
  }

  private async readCanonicalBlob(
    registration: GitRemoteRegistration,
    oid: string,
    operation: StorageRelayOperation,
  ): Promise<Extract<GitRemoteObjectRecord, { type: 'blob' }>> {
    const response = await operation.fetch(`${repositoryBaseUrl(registration)}/git/blobs/${oid}`, {
      headers: githubHeaders(registration),
    })
    const body = await readSuccessfulJson<GitHubBlobResponse>(response, operation, [200])
    if (body.encoding !== 'base64' || assertGitOid(body.sha) !== oid) {
      throw new StorageRelayError({ code: 'invalid_response', status: 502 })
    }
    const payload = decodeGitHubBase64(body.content)
    if (Number(body.size) !== payload.byteLength || await computeGitObjectOid('blob', payload) !== oid) {
      throw new StorageRelayError({ code: 'invalid_response', status: 502 })
    }
    return {
      type: 'blob',
      remoteOid: oid,
      canonicalVerified: true,
      canonicalPayloadBase64: encodeBase64(payload),
      byteLength: payload.byteLength,
    }
  }

  private async readCanonicalTree(
    registration: GitRemoteRegistration,
    oid: string,
    operation: StorageRelayOperation,
  ): Promise<Extract<GitRemoteObjectRecord, { type: 'tree' }>> {
    const response = await operation.fetch(`${repositoryBaseUrl(registration)}/git/trees/${oid}`, {
      headers: githubHeaders(registration),
    })
    const body = await readSuccessfulJson<GitHubTreeResponse>(response, operation, [200])
    if (assertGitOid(body.sha) !== oid || body.truncated !== false || !Array.isArray(body.tree)) {
      throw new StorageRelayError({
        code: body.truncated === true ? 'limit_exceeded' : 'invalid_response',
        status: body.truncated === true ? 413 : 502,
      })
    }
    const entries = body.tree.map(entryValue => {
      const entry = entryValue as GitHubTreeEntry
      const mode = entry.mode
      const type = entry.type
      if (mode === '120000' || mode === '160000' || type === 'commit') {
        throw new StorageRelayError({ code: 'invalid_response', status: 502 })
      }
      if (
        (mode !== '100644' && mode !== '100755' && mode !== '040000')
        || (type !== 'blob' && type !== 'tree')
        || (type === 'tree') !== (mode === '040000')
      ) {
        throw new StorageRelayError({ code: 'invalid_response', status: 502 })
      }
      const normalizedMode = mode as '100644' | '100755' | '040000'
      const normalizedType = type as 'blob' | 'tree'
      const size = entry.size == null ? null : Number(entry.size)
      if (size != null && (!Number.isSafeInteger(size) || size < 0)) {
        throw new StorageRelayError({ code: 'invalid_response', status: 502 })
      }
      return {
        path: assertTreePath(entry.path),
        mode: normalizedMode,
        type: normalizedType,
        oid: assertGitOid(entry.sha),
        size,
      }
    })
    const canonicalPayload = serializeCanonicalTree(entries)
    if (await computeGitObjectOid('tree', canonicalPayload) !== oid) {
      throw new StorageRelayError({ code: 'invalid_response', status: 502 })
    }
    return {
      type: 'tree',
      remoteOid: oid,
      canonicalVerified: true,
      canonicalPayloadBase64: encodeBase64(canonicalPayload),
      byteLength: canonicalPayload.byteLength,
      entries,
    }
  }

  private async readNormalizedCommit(
    registration: GitRemoteRegistration,
    oid: string,
    operation: StorageRelayOperation,
  ): Promise<Extract<GitRemoteObjectRecord, { type: 'commit' }>> {
    const response = await operation.fetch(`${repositoryBaseUrl(registration)}/git/commits/${oid}`, {
      headers: githubHeaders(registration),
    })
    const body = await readSuccessfulJson<GitHubCommitResponse>(response, operation, [200])
    if (assertGitOid(body.sha) !== oid || !Array.isArray(body.parents)) {
      throw new StorageRelayError({ code: 'invalid_response', status: 502 })
    }
    return {
      type: 'commit',
      remoteOid: oid,
      canonicalVerified: false,
      representation: 'normalized',
      treeOid: assertGitOid(body.tree?.sha),
      parentOids: body.parents.map(parent => assertGitOid((parent as { sha?: unknown }).sha)),
      message: readString(body.message),
      author: readCommitIdentity(body.author),
      committer: readCommitIdentity(body.committer),
    }
  }

  private async createBlob(
    registration: GitRemoteRegistration,
    content: Uint8Array,
    operation: StorageRelayOperation,
  ): Promise<string> {
    const expectedOid = await computeGitObjectOid('blob', content)
    const response = await operation.fetch(`${repositoryBaseUrl(registration)}/git/blobs`, {
      method: 'POST',
      headers: githubHeaders(registration, true),
      body: JSON.stringify({ content: encodeBase64(content), encoding: 'base64' }),
    })
    const body = await readSuccessfulJson<{ sha?: unknown }>(response, operation, [201])
    if (assertGitOid(body.sha) !== expectedOid) {
      throw new StorageRelayError({ code: 'invalid_response', status: 502 })
    }
    return expectedOid
  }

  private async createTree(
    registration: GitRemoteRegistration,
    args: {
      baseTreeOid: string
      entries: Array<Record<string, unknown>>
      operation: StorageRelayOperation
    },
  ): Promise<string> {
    const response = await args.operation.fetch(`${repositoryBaseUrl(registration)}/git/trees`, {
      method: 'POST',
      headers: githubHeaders(registration, true),
      body: JSON.stringify({ base_tree: args.baseTreeOid, tree: args.entries }),
    })
    const body = await readSuccessfulJson<{ sha?: unknown }>(response, args.operation, [201])
    return assertGitOid(body.sha)
  }

  private async createCommit(
    registration: GitRemoteRegistration,
    args: {
      parentOid: string
      treeOid: string
      request: GitRemotePushRequest['commit']
      operation: StorageRelayOperation
    },
  ): Promise<string> {
    const response = await args.operation.fetch(`${repositoryBaseUrl(registration)}/git/commits`, {
      method: 'POST',
      headers: githubHeaders(registration, true),
      body: JSON.stringify({
        message: args.request.message,
        tree: args.treeOid,
        parents: [args.parentOid],
        author: args.request.author,
        committer: args.request.committer,
      }),
    })
    const body = await readSuccessfulJson<{ sha?: unknown }>(response, args.operation, [201])
    return assertGitOid(body.sha)
  }

  private async updateRef(
    registration: GitRemoteRegistration,
    expectedOldOid: string,
    commitOid: string,
    expectedTreeOid: string,
    operation: StorageRelayOperation,
  ): Promise<void> {
    const response = await operation.fetch(
      `${repositoryBaseUrl(registration)}/git/refs/heads/${encodedRefPath(registration.branch)}`,
      {
        method: 'PATCH',
        headers: githubHeaders(registration, true),
        body: JSON.stringify({ sha: commitOid, force: false }),
      },
    )
    if (response.status === 200) {
      await readStorageRelayJsonResponse<unknown>(response, operation.budget)
      return
    }
    const status = response.status
    await discardStorageRelayResponse(response)
    if (status === 409 || status === 422) {
      const currentRef = await this.resolveRef(registration, operation)
      if (currentRef.oid === commitOid) {
        const targetCommit = await this.readNormalizedCommit(registration, commitOid, operation)
        assertAppliedCommitGraph(targetCommit, expectedOldOid, expectedTreeOid)
        return
      }
      if (currentRef.oid !== expectedOldOid) {
        throw new StorageRelayError({ code: 'conflict', status: 409 })
      }
      throw new StorageRelayError({ code: 'invalid_response', status: 502 })
    }
    throw mapStorageRelayUpstreamStatus(status)
  }
}
