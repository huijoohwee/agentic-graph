import {
  AGENTIC_OS_GIT_OPERATION_BOUNDS,
  AgenticGraphGitRelayError,
  type AgenticGraphGitIdentity,
  type AgenticGraphGitRelay,
  type AgenticGraphGitRelayObject,
} from './git/agentic-graph-git-contracts'
import {
  buildGitCommitBody,
  decodeGitBytesBase64,
  encodeGitBytesBase64,
  normalizeGitObjectId,
  normalizeGitRefName,
  parseCanonicalGitCommit,
  parseGitTree,
  verifyGitRelayObject,
} from './git/agentic-graph-git-object-codec'
import { normalizeAgenticGraphGitPath } from './git/agentic-graph-git-repository'

export const AGENTIC_OS_STORAGE_GIT_RELAY_PATH = '/api/storage/git/relay' as const
export const AGENTIC_OS_STORAGE_GIT_RELAY_API_VERSION = 'agentic-graph-storage-relay/v1' as const

type RelayFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

export type AgenticGraphStorageGitRelayDependencies = {
  baseRequestUrl: string
  sessionToken: string
  fetcher?: RelayFetch
}

type RelayNodeType = 'blob' | 'tree' | 'commit'
type RelayNode = { oid: string; type: RelayNodeType }
type RelayHttpResult = { status: number; body: Record<string, unknown> }
type FlatFile = { objectId: string; mode: '100644' | '100755'; body: Uint8Array }

const textEncoder = new TextEncoder()
const fatalTextDecoder = new TextDecoder('utf-8', { fatal: true })
const MAX_RELAY_REQUESTS = 40
const MAX_READ_OBJECTS = 32
const MAX_PUSH_CHANGES = 24
const RFC3339 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:Z|[+-]\d{2}:\d{2})$/

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)

const invalidResponse = (bytes = 0): AgenticGraphGitRelayError =>
  new AgenticGraphGitRelayError('invalid-response', 'Git relay response is invalid', bytes)

const limitExceeded = (bytes = 0): AgenticGraphGitRelayError =>
  new AgenticGraphGitRelayError('limit-exceeded', 'Git relay bounds exceeded', bytes)

const buildEndpoint = (baseRequestUrl: string): URL => {
  let base: URL
  try {
    base = new URL(String(baseRequestUrl || ''))
  } catch {
    throw new Error('Git relay base request URL is invalid')
  }
  if (
    (base.protocol !== 'http:' && base.protocol !== 'https:')
    || base.username
    || base.password
  ) {
    throw new Error('Git relay base request URL is invalid')
  }
  return new URL(AGENTIC_OS_STORAGE_GIT_RELAY_PATH, base)
}

const normalizeSessionToken = (value: string): string => {
  const token = String(value || '').trim()
  if (!token || token.length > 8_192 || /\s/.test(token)) {
    throw new Error('Git relay session dependency is invalid')
  }
  return token
}

class RelayOperation {
  private readonly controller = new AbortController()
  private readonly timeoutId: ReturnType<typeof globalThis.setTimeout>
  private readonly handleExternalAbort: () => void
  private transferredBytes = 0
  private requestCount = 0

  constructor(
    private readonly endpoint: URL,
    private readonly token: string,
    private readonly fetcher: RelayFetch,
    private readonly externalSignal: AbortSignal,
  ) {
    this.handleExternalAbort = () => this.controller.abort()
    externalSignal.addEventListener('abort', this.handleExternalAbort, { once: true })
    if (externalSignal.aborted) this.controller.abort()
    this.timeoutId = globalThis.setTimeout(
      () => this.controller.abort(),
      AGENTIC_OS_GIT_OPERATION_BOUNDS.timeoutMs,
    )
  }

  get bytes(): number {
    return this.transferredBytes
  }

  private consume(byteLength: number): void {
    if (!Number.isSafeInteger(byteLength) || byteLength < 0) throw invalidResponse(this.bytes)
    this.transferredBytes += byteLength
    if (this.transferredBytes > AGENTIC_OS_GIT_OPERATION_BOUNDS.maxTransferBytes) {
      this.controller.abort()
      throw limitExceeded(this.transferredBytes)
    }
  }

  private async readJson(response: Response): Promise<Record<string, unknown>> {
    const declaredLength = response.headers.get('content-length')
    if (declaredLength != null && declaredLength !== '') {
      const length = Number(declaredLength)
      if (!Number.isSafeInteger(length) || length < 0) throw invalidResponse(this.bytes)
      if (length > AGENTIC_OS_GIT_OPERATION_BOUNDS.maxTransferBytes - this.bytes) {
        response.body?.cancel().catch(() => undefined)
        throw limitExceeded(this.bytes + length)
      }
    }
    const reader = response.body?.getReader()
    if (!reader) throw invalidResponse(this.bytes)
    const chunks: Uint8Array[] = []
    let length = 0
    try {
      while (true) {
        const result = await reader.read()
        if (result.done) break
        this.consume(result.value.byteLength)
        chunks.push(result.value)
        length += result.value.byteLength
      }
    } catch (error) {
      await reader.cancel().catch(() => undefined)
      throw error
    } finally {
      reader.releaseLock()
    }
    const bytes = new Uint8Array(length)
    let offset = 0
    for (const chunk of chunks) {
      bytes.set(chunk, offset)
      offset += chunk.byteLength
    }
    try {
      const parsed = JSON.parse(fatalTextDecoder.decode(bytes))
      if (!isRecord(parsed)) throw new Error('invalid')
      return parsed
    } catch {
      throw invalidResponse(this.bytes)
    }
  }

  async post(payload: Record<string, unknown>): Promise<RelayHttpResult> {
    this.requestCount += 1
    if (this.requestCount > MAX_RELAY_REQUESTS) throw limitExceeded(this.bytes)
    const requestBody = JSON.stringify(payload)
    this.consume(textEncoder.encode(requestBody).byteLength)
    try {
      const response = await this.fetcher(this.endpoint, {
        method: 'POST',
        cache: 'no-store',
        credentials: 'omit',
        headers: {
          authorization: `Bearer ${this.token}`,
          'content-type': 'application/json',
        },
        body: requestBody,
        signal: this.controller.signal,
      })
      return { status: response.status, body: await this.readJson(response) }
    } catch (error) {
      if (error instanceof AgenticGraphGitRelayError) throw error
      if (
        this.controller.signal.aborted
        || error instanceof TypeError
        || (error instanceof Error && error.name === 'AbortError')
      ) {
        throw new AgenticGraphGitRelayError('retryable', 'Git relay request failed', this.bytes)
      }
      throw invalidResponse(this.bytes)
    }
  }

  close(): void {
    globalThis.clearTimeout(this.timeoutId)
    this.externalSignal.removeEventListener('abort', this.handleExternalAbort)
  }
}

const assertEnvelope = (
  result: RelayHttpResult,
  remoteId: string,
  allowConflict = false,
  transferBytes = 0,
): Record<string, unknown> => {
  const body = result.body
  if (
    body.apiVersion !== AGENTIC_OS_STORAGE_GIT_RELAY_API_VERSION
    || (body.remoteId != null && body.remoteId !== remoteId)
  ) {
    throw invalidResponse(transferBytes)
  }
  if (result.status === 409 && allowConflict && body.ok === false) return body
  if (result.status === 200 && body.ok === true && body.remoteId === remoteId) return body
  const code = typeof body.code === 'string' ? body.code : ''
  if (result.status === 401 || result.status === 403 || [
    'auth_required',
    'membership_forbidden',
    'provider_auth_failed',
  ].includes(code)) {
    throw new AgenticGraphGitRelayError('auth-failure', 'Git relay authentication failed', transferBytes)
  }
  if (result.status === 413 || code === 'limit_exceeded') throw limitExceeded(transferBytes)
  if (
    body.retryable === true
    || result.status === 429
    || result.status >= 500
    || ['rate_limited', 'timeout', 'upstream_unavailable'].includes(code)
  ) {
    throw new AgenticGraphGitRelayError('retryable', 'Git relay request failed', transferBytes)
  }
  throw invalidResponse(transferBytes)
}

const parseRemoteIdentity = (value: unknown): AgenticGraphGitIdentity => {
  if (!isRecord(value)) throw invalidResponse()
  const name = typeof value.name === 'string' ? value.name : ''
  const email = typeof value.email === 'string' ? value.email : ''
  const date = typeof value.date === 'string' ? value.date : ''
  if (!RFC3339.test(date)) throw invalidResponse()
  const timestampMs = Date.parse(date)
  if (!Number.isSafeInteger(timestampMs) || timestampMs % 1_000 !== 0) throw invalidResponse()
  const zone = date.endsWith('Z') ? '+0000' : date.slice(-6).replace(':', '')
  return { name, email, timestampSeconds: timestampMs / 1_000, timezone: zone }
}

const normalizedCommitObject = async (
  record: Record<string, unknown>,
): Promise<{ object: AgenticGraphGitRelayObject; dependencies: RelayNode[] }> => {
  if (
    record.type !== 'commit'
    || record.canonicalVerified !== false
    || record.representation !== 'normalized'
    || !Array.isArray(record.parentOids)
    || record.parentOids.length > 1
    || typeof record.message !== 'string'
  ) {
    throw invalidResponse()
  }
  const remoteOid = normalizeGitObjectId(record.remoteOid)
  const treeObjectId = normalizeGitObjectId(record.treeOid)
  const parentObjectId = record.parentOids.length
    ? normalizeGitObjectId(record.parentOids[0])
    : null
  const body = buildGitCommitBody({
    treeObjectId,
    parentObjectId,
    author: parseRemoteIdentity(record.author),
    committer: parseRemoteIdentity(record.committer),
    message: record.message,
  })
  const object: AgenticGraphGitRelayObject = {
    objectId: remoteOid,
    objectType: 'commit',
    bodyBase64: encodeGitBytesBase64(body),
    byteLength: body.byteLength,
  }
  await verifyGitRelayObject(object)
  return {
    object,
    dependencies: [
      { oid: treeObjectId, type: 'tree' },
      ...(parentObjectId ? [{ oid: parentObjectId, type: 'commit' as const }] : []),
    ],
  }
}

const canonicalRelayObject = async (
  record: Record<string, unknown>,
  type: 'blob' | 'tree',
): Promise<{ object: AgenticGraphGitRelayObject; dependencies: RelayNode[] }> => {
  if (
    record.type !== type
    || record.canonicalVerified !== true
    || typeof record.canonicalPayloadBase64 !== 'string'
  ) {
    throw invalidResponse()
  }
  const object: AgenticGraphGitRelayObject = {
    objectId: normalizeGitObjectId(record.remoteOid),
    objectType: type,
    bodyBase64: record.canonicalPayloadBase64,
    byteLength: Number(record.byteLength),
  }
  const verified = await verifyGitRelayObject(object)
  return {
    object,
    dependencies: type === 'tree'
      ? parseGitTree(verified.body).map(entry => ({
          oid: entry.objectId,
          type: entry.mode === '40000' ? 'tree' : 'blob',
        }))
      : [],
  }
}

const scheduleNode = (
  node: RelayNode,
  known: Set<string>,
  expectedTypes: Map<string, RelayNodeType>,
  pending: RelayNode[],
): void => {
  const oid = normalizeGitObjectId(node.oid)
  const existingType = expectedTypes.get(oid)
  if (existingType && existingType !== node.type) throw invalidResponse()
  if (existingType) return
  expectedTypes.set(oid, node.type)
  if (!known.has(oid)) pending.push({ oid, type: node.type })
}

const flattenTree = (
  objects: Map<string, { object: AgenticGraphGitRelayObject; body: Uint8Array }>,
  treeObjectId: string,
  prefix: string,
  files: Map<string, FlatFile>,
  visiting: Set<string>,
): void => {
  const oid = normalizeGitObjectId(treeObjectId)
  const tree = objects.get(oid)
  if (!tree || tree.object.objectType !== 'tree' || visiting.has(oid)) throw invalidResponse()
  visiting.add(oid)
  for (const entry of parseGitTree(tree.body)) {
    const path = normalizeAgenticGraphGitPath(prefix ? `${prefix}/${entry.name}` : entry.name)
    if (path.split('/').includes('.git')) throw invalidResponse()
    const child = objects.get(entry.objectId)
    if (!child) throw invalidResponse()
    if (entry.mode === '40000') {
      if (child.object.objectType !== 'tree') throw invalidResponse()
      flattenTree(objects, entry.objectId, path, files, visiting)
    } else {
      if (child.object.objectType !== 'blob' || files.has(path)) throw invalidResponse()
      files.set(path, { objectId: entry.objectId, mode: entry.mode, body: child.body })
    }
  }
  visiting.delete(oid)
}

const identityDate = (identity: AgenticGraphGitIdentity): string => {
  const sign = identity.timezone[0] === '-' ? -1 : 1
  const hours = Number(identity.timezone.slice(1, 3))
  const minutes = Number(identity.timezone.slice(3, 5))
  const offsetMinutes = sign * (hours * 60 + minutes)
  const localDate = new Date((identity.timestampSeconds + offsetMinutes * 60) * 1_000)
  const localIso = localDate.toISOString().slice(0, 19)
  return `${localIso}${identity.timezone.slice(0, 3)}:${identity.timezone.slice(3)}`
}

const pushIdentity = (identity: AgenticGraphGitIdentity) => ({
  name: identity.name,
  email: identity.email,
  date: identityDate(identity),
})

export const createAgenticGraphStorageGitRelay = (
  dependencies: AgenticGraphStorageGitRelayDependencies,
): AgenticGraphGitRelay => {
  const endpoint = buildEndpoint(dependencies.baseRequestUrl)
  const token = normalizeSessionToken(dependencies.sessionToken)
  const fetcher = dependencies.fetcher || globalThis.fetch.bind(globalThis)
  const baseRequest = (workspaceId: string, remoteId: string) => ({
    apiVersion: AGENTIC_OS_STORAGE_GIT_RELAY_API_VERSION,
    workspaceId,
    remoteId,
  })

  return {
    async fetch(args) {
      const operation = new RelayOperation(endpoint, token, fetcher, args.signal)
      try {
        const refName = normalizeGitRefName(args.refName)
        if (!refName.startsWith('refs/heads/')) throw invalidResponse(operation.bytes)
        const resolved = assertEnvelope(await operation.post({
          ...baseRequest(args.workspaceId, args.remoteId),
          action: 'resolve-ref',
        }), args.remoteId, false, operation.bytes)
        if (
          resolved.objectFormat !== 'sha1'
          || resolved.branch !== refName.slice('refs/heads/'.length)
        ) {
          throw invalidResponse(operation.bytes)
        }
        const headObjectId = normalizeGitObjectId(resolved.oid)
        const known = new Set(args.knownObjectIds.map(normalizeGitObjectId))
        const expectedTypes = new Map<string, RelayNodeType>()
        const pending: RelayNode[] = []
        const objects: AgenticGraphGitRelayObject[] = []
        scheduleNode({ oid: headObjectId, type: 'commit' }, known, expectedTypes, pending)
        while (pending.length > 0) {
          const batch = pending.splice(0, MAX_READ_OBJECTS)
          const response = assertEnvelope(await operation.post({
            ...baseRequest(args.workspaceId, args.remoteId),
            action: 'read-objects',
            objects: batch.map(node => ({
              oid: node.oid,
              type: node.type,
              representation: node.type === 'commit' ? 'normalized' : 'canonical',
            })),
          }), args.remoteId, false, operation.bytes)
          if (!Array.isArray(response.records) || response.records.length !== batch.length) {
            throw invalidResponse(operation.bytes)
          }
          const requested = new Map(batch.map(node => [node.oid, node.type]))
          for (const value of response.records) {
            if (!isRecord(value)) throw invalidResponse(operation.bytes)
            const remoteOid = normalizeGitObjectId(value.remoteOid)
            const expectedType = requested.get(remoteOid)
            if (!expectedType) throw invalidResponse(operation.bytes)
            requested.delete(remoteOid)
            const verified = expectedType === 'commit'
              ? await normalizedCommitObject(value)
              : await canonicalRelayObject(value, expectedType)
            objects.push(verified.object)
            for (const node of verified.dependencies) scheduleNode(node, known, expectedTypes, pending)
          }
          if (requested.size > 0) throw invalidResponse(operation.bytes)
        }
        return {
          objects,
          refs: [
            { refName: 'HEAD', targetKind: 'symbolic', target: refName },
            { refName, targetKind: 'direct', target: headObjectId },
          ],
          headRefName: 'HEAD',
          transferBytes: operation.bytes,
        }
      } catch (error) {
        if (error instanceof AgenticGraphGitRelayError) throw error
        throw invalidResponse(operation.bytes)
      } finally {
        operation.close()
      }
    },

    async push(args) {
      const operation = new RelayOperation(endpoint, token, fetcher, args.signal)
      try {
        const expectedOldOid = args.expectedRemoteObjectId
          ? normalizeGitObjectId(args.expectedRemoteObjectId)
          : null
        if (!expectedOldOid) throw invalidResponse()
        const objects = new Map<string, { object: AgenticGraphGitRelayObject; body: Uint8Array }>()
        let objectBytes = 0
        for (const object of args.objects) {
          if (object.objectType === 'tag') throw invalidResponse()
          const verified = await verifyGitRelayObject(object)
          if (objects.has(verified.objectId)) throw invalidResponse()
          objectBytes += verified.body.byteLength
          if (objectBytes > AGENTIC_OS_GIT_OPERATION_BOUNDS.maxTransferBytes) throw limitExceeded(objectBytes)
          objects.set(verified.objectId, { object, body: verified.body })
        }
        const targetObjectId = normalizeGitObjectId(args.targetObjectId)
        const targetRecord = objects.get(targetObjectId)
        const parentRecord = objects.get(expectedOldOid)
        if (
          !targetRecord
          || targetRecord.object.objectType !== 'commit'
          || !parentRecord
          || parentRecord.object.objectType !== 'commit'
        ) {
          throw invalidResponse()
        }
        const target = parseCanonicalGitCommit(targetRecord.body)
        const parent = parseCanonicalGitCommit(parentRecord.body)
        if (target.parentObjectIds.length !== 1 || target.parentObjectIds[0] !== expectedOldOid) {
          throw invalidResponse()
        }
        if (parent.parentObjectIds.length > 1) throw invalidResponse()
        const targetFiles = new Map<string, FlatFile>()
        const parentFiles = new Map<string, FlatFile>()
        flattenTree(objects, target.treeObjectId, '', targetFiles, new Set())
        flattenTree(objects, parent.treeObjectId, '', parentFiles, new Set())
        const paths = Array.from(new Set([...targetFiles.keys(), ...parentFiles.keys()])).sort()
        const changes: Array<Record<string, unknown>> = []
        for (const path of paths) {
          const next = targetFiles.get(path)
          const previous = parentFiles.get(path)
          if (next && previous && next.objectId === previous.objectId && next.mode === previous.mode) continue
          changes.push(next
            ? { path, mode: next.mode, contentBase64: encodeGitBytesBase64(next.body) }
            : { path, delete: true })
        }
        if (changes.length < 1 || changes.length > MAX_PUSH_CHANGES) throw limitExceeded(operation.bytes)
        const result = await operation.post({
          ...baseRequest(args.workspaceId, args.remoteId),
          action: 'push-commit',
          expectedOldOid,
          expectedTreeOid: target.treeObjectId,
          commit: {
            expectedOid: targetObjectId,
            message: target.message,
            author: pushIdentity(target.author),
            committer: pushIdentity(target.committer),
          },
          changes,
        })
        const response = assertEnvelope(result, args.remoteId, true, operation.bytes)
        if (result.status === 409) {
          return {
            status: 'remote-advanced',
            remoteObjectId: expectedOldOid,
            transferBytes: operation.bytes,
          }
        }
        if (
          normalizeGitObjectId(response.oldOid) !== expectedOldOid
          || normalizeGitObjectId(response.newOid) !== targetObjectId
          || normalizeGitObjectId(response.treeOid) !== target.treeObjectId
        ) {
          throw invalidResponse(operation.bytes)
        }
        return {
          status: 'applied',
          remoteObjectId: targetObjectId,
          transferBytes: operation.bytes,
        }
      } catch (error) {
        if (error instanceof AgenticGraphGitRelayError) throw error
        throw invalidResponse(operation.bytes)
      } finally {
        operation.close()
      }
    },
  }
}
