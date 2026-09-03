import {
  AgenticGraphGitRelayError,
  type AgenticGraphGitCommitRequest,
  type AgenticGraphGitDocumentWriteAuthority,
  type AgenticGraphGitObjectRecord,
  type AgenticGraphGitOperationOutboxRecord,
  type AgenticGraphGitPersistedCache,
  type AgenticGraphGitRefRecord,
  type AgenticGraphGitRelay,
  type AgenticGraphGitRelayFetchResult,
  type AgenticGraphGitRepositoryRecord,
} from '../../lib/storage/git/agentic-graph-git-contracts'
import {
  buildAgenticGraphGitCommitObjects,
  buildAgenticGraphGitObjectRecordId,
} from '../../lib/storage/git/agentic-graph-git-repository'

export const gitTestIdentity = {
  name: 'agentic-graph',
  email: 'git@agentic-graph.dev',
  timestampSeconds: 1_777_000_000,
  timezone: '+0800',
}

export const copyGitTestValue = <Value>(value: Value): Value => structuredClone(value)

export class MemoryGitCache implements AgenticGraphGitPersistedCache {
  readonly objects = new Map<string, AgenticGraphGitObjectRecord>()
  readonly refs = new Map<string, AgenticGraphGitRefRecord>()
  readonly repositories = new Map<string, AgenticGraphGitRepositoryRecord>()
  readonly outbox = new Map<string, AgenticGraphGitOperationOutboxRecord>()
  readonly events: string[] = []
  readonly claims = new Map<string, { token: string; expiresAtMs: number }>()
  private sequence = 0

  async getRepository(workspaceId: string, repositoryId: string) {
    return copyGitTestValue(this.repositories.get(`${workspaceId}\0${repositoryId}`) || null)
  }

  async putRepository(record: AgenticGraphGitRepositoryRecord) {
    this.events.push('repository')
    this.repositories.set(record.id, copyGitTestValue(record))
  }

  async getObject(workspaceId: string, repositoryId: string, objectId: string) {
    return copyGitTestValue(this.objects.get(`${workspaceId}\0${repositoryId}\0${objectId}`) || null)
  }

  async listObjects(workspaceId: string, repositoryId: string) {
    return Array.from(this.objects.values())
      .filter(record => record.workspaceId === workspaceId && record.repositoryId === repositoryId)
      .map(copyGitTestValue)
  }

  async putObjects(records: AgenticGraphGitObjectRecord[]) {
    this.events.push(`objects:${records.length}`)
    records.forEach(record => this.objects.set(record.id, copyGitTestValue(record)))
  }

  async getRef(workspaceId: string, repositoryId: string, refName: string) {
    return copyGitTestValue(this.refs.get(`${workspaceId}\0${repositoryId}\0${refName}`) || null)
  }

  async listRefs(workspaceId: string, repositoryId: string) {
    return Array.from(this.refs.values())
      .filter(record => record.workspaceId === workspaceId && record.repositoryId === repositoryId)
      .map(copyGitTestValue)
  }

  async putRefs(records: AgenticGraphGitRefRecord[]) {
    this.events.push(`refs:${records.length}`)
    records.forEach(record => this.refs.set(record.id, copyGitTestValue(record)))
  }

  async appendOutbox(record: Omit<AgenticGraphGitOperationOutboxRecord, 'enqueuedSequence'>) {
    const stored = { ...copyGitTestValue(record), enqueuedSequence: ++this.sequence }
    this.events.push(`outbox:${stored.id}`)
    this.outbox.set(stored.id, stored)
    return copyGitTestValue(stored)
  }

  async listOutbox(workspaceId: string, deviceId: string) {
    return Array.from(this.outbox.values())
      .filter(record => record.workspaceId === workspaceId && record.deviceId === deviceId)
      .map(copyGitTestValue)
  }

  async requeueFailedOutbox(workspaceId: string, deviceId: string, updatedAtMs: number) {
    let requeued = 0
    for (const [id, record] of this.outbox) {
      if (
        record.workspaceId !== workspaceId
        || record.deviceId !== deviceId
        || record.lastStatus === 'queued'
      ) continue
      this.outbox.set(id, {
        ...record,
        attemptCount: 0,
        lastStatus: 'queued',
        lastMessage: null,
        updatedAtMs,
      })
      this.claims.delete(id)
      requeued += 1
    }
    return requeued
  }

  async claimNextOutbox(args: {
    workspaceId: string
    deviceId: string
    claimOwner: string
    claimToken: string
    nowMs: number
    leaseMs: number
  }) {
    const record = Array.from(this.outbox.values())
      .filter(candidate =>
        candidate.workspaceId === args.workspaceId
        && candidate.deviceId === args.deviceId
        && candidate.lastStatus === 'queued')
      .sort((left, right) => left.enqueuedSequence - right.enqueuedSequence)[0]
    if (!record) return null
    const current = this.claims.get(record.id)
    if (current && current.expiresAtMs > args.nowMs) return null
    this.claims.set(record.id, {
      token: args.claimToken,
      expiresAtMs: args.nowMs + args.leaseMs,
    })
    return { record: copyGitTestValue(record), claimToken: args.claimToken }
  }

  async patchClaimedOutbox(
    id: string,
    claimToken: string,
    patch: Partial<AgenticGraphGitOperationOutboxRecord>,
    releaseClaim = false,
  ) {
    if (this.claims.get(id)?.token !== claimToken) return false
    const record = this.outbox.get(id)
    if (record) this.outbox.set(id, { ...record, ...copyGitTestValue(patch) })
    if (releaseClaim) this.claims.delete(id)
    return Boolean(record)
  }

  async acknowledgeClaimedOutbox(
    id: string,
    claimToken: string,
    refWrites: AgenticGraphGitRefRecord[] = [],
  ) {
    if (this.claims.get(id)?.token !== claimToken) return false
    refWrites.forEach(record => this.refs.set(record.id, copyGitTestValue(record)))
    this.outbox.delete(id)
    this.claims.delete(id)
    return true
  }
}

export const createGitTestAuthority = (
  writeCalls: Array<Parameters<AgenticGraphGitDocumentWriteAuthority['writeCommit']>[0]> = [],
): AgenticGraphGitDocumentWriteAuthority => ({
  resolveDocument({ path }) {
    if (
      path === 'agentic-canvas-os'
      || path.startsWith('agentic-canvas-os/')
      || path === 'huijoohwee/docs/workspace-seeds'
      || path.startsWith('huijoohwee/docs/workspace-seeds/')
    ) return { ok: false, path, reason: 'unsupported-path' }
    const repositoryPath = path.startsWith('agentic-graph/') ? path.slice('agentic-graph/'.length) : path
    return {
      ok: true,
      document: {
        canonicalPath: `agentic-graph/${repositoryPath}`,
        repositoryPath,
        repositoryId: 'repo',
      },
    }
  },
  async writeCommit(args) {
    writeCalls.push(args)
    return { kind: 'local-attestation', commitObjectId: args.expectedCommitObjectId }
  },
})

export const gitTestCommitRequest = (names: string[]): AgenticGraphGitCommitRequest => ({
  workspaceId: 'workspace',
  repositoryId: 'repo',
  remoteId: 'origin',
  canonicalPathScope: 'agentic-graph',
  refName: 'refs/heads/main',
  documents: names.map(name => ({
    path: `agentic-graph/docs/${name}.md`,
    kind: 'markdown',
    text: `# ${name}\n`,
  })),
  message: 'test commit',
  author: gitTestIdentity,
})

export const buildGitRemoteFixture = async (
  repositoryId: string,
  name: string,
): Promise<AgenticGraphGitRelayFetchResult> => {
  const request = { ...gitTestCommitRequest([name]), repositoryId }
  const built = await buildAgenticGraphGitCommitObjects({
    request,
    documents: [{
      ...request.documents[0]!,
      canonicalPath: `agentic-graph/docs/${name}.md`,
      repositoryPath: `docs/${name}.md`,
      repositoryId,
    }],
    parentObjectId: null,
    nowMs: 1_777_000_000_000,
  })
  return {
    objects: built.objects.map(object => ({
      objectId: object.objectId,
      objectType: object.objectType,
      bodyBase64: object.bodyBase64,
      byteLength: object.byteLength,
    })),
    refs: [
      { refName: 'HEAD', targetKind: 'symbolic', target: 'refs/heads/main' },
      { refName: 'refs/heads/main', targetKind: 'direct', target: built.commitObjectId },
    ],
    headRefName: 'HEAD',
    transferBytes: built.objects.reduce((sum, object) => sum + object.byteLength, 0),
  }
}

export const buildGitRemoteFixtureAfter = async (args: {
  parent: AgenticGraphGitRelayFetchResult
  names: string[]
  repositoryId?: string
}): Promise<AgenticGraphGitRelayFetchResult> => {
  const repositoryId = args.repositoryId ?? 'repo'
  const request = { ...gitTestCommitRequest(args.names), repositoryId }
  const parentObjectId = args.parent.refs.find(ref =>
    ref.refName === 'refs/heads/main' && ref.targetKind === 'direct')?.target
  if (!parentObjectId) throw new Error('Git test parent fixture has no branch head')
  const built = await buildAgenticGraphGitCommitObjects({
    request,
    documents: request.documents.map(document => ({
      ...document,
      canonicalPath: document.path,
      repositoryPath: document.path.slice('agentic-graph/'.length),
      repositoryId,
    })),
    parentObjectId,
    parentObjects: args.parent.objects.map(object => ({
      id: buildAgenticGraphGitObjectRecordId('workspace', repositoryId, object.objectId),
      workspaceId: 'workspace',
      repositoryId,
      objectId: object.objectId,
      objectFormat: 'sha1',
      objectType: object.objectType,
      bodyBase64: object.bodyBase64,
      byteLength: object.byteLength,
      updatedAtMs: 1_777_000_000_000,
    })),
    repositoryPathScope: '',
    nowMs: 1_777_000_001_000,
  })
  return {
    objects: built.objects.map(object => ({
      objectId: object.objectId,
      objectType: object.objectType,
      bodyBase64: object.bodyBase64,
      byteLength: object.byteLength,
    })),
    refs: [
      { refName: 'HEAD', targetKind: 'symbolic', target: 'refs/heads/main' },
      { refName: 'refs/heads/main', targetKind: 'direct', target: built.commitObjectId },
    ],
    headRefName: 'HEAD',
    transferBytes: built.objects.reduce((sum, object) => sum + object.byteLength, 0),
  }
}

export const gitTestRemoteRequest = (repositoryId = 'remote') => ({
  workspaceId: 'workspace',
  repositoryId,
  remoteId: `origin-${repositoryId}`,
  canonicalPathScope: 'agentic-graph',
  refName: 'refs/heads/main',
})

export const gitTestRelay = (
  fetchImpl: AgenticGraphGitRelay['fetch'],
  pushImpl?: AgenticGraphGitRelay['push'],
): AgenticGraphGitRelay => ({
  fetch: fetchImpl,
  push: pushImpl || (async () => {
    throw new AgenticGraphGitRelayError('invalid-response')
  }),
})
