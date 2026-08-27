export const KNOWGRPH_GIT_OBJECT_FORMAT = 'sha1' as const

export const KNOWGRPH_GIT_OPERATION_BOUNDS = {
  timeoutMs: 30_000,
  maxTransferBytes: 10_485_760,
  maxAttempts: 3,
  backoffBaseMs: 1_000,
  backoffFactor: 2,
  backoffCapMs: 30_000,
} as const

export type KnowgrphGitObjectType = 'blob' | 'tree' | 'commit' | 'tag'
export type KnowgrphGitOperationKind = 'clone' | 'fetch' | 'commit' | 'push'
export type KnowgrphGitStorageMode = 'online' | 'offline-only'
export type KnowgrphGitDocumentKind = 'markdown' | 'json'

export type KnowgrphGitObjectRecord = {
  id: string
  workspaceId: string
  repositoryId: string
  objectId: string
  objectFormat: typeof KNOWGRPH_GIT_OBJECT_FORMAT
  objectType: KnowgrphGitObjectType
  bodyBase64: string
  byteLength: number
  updatedAtMs: number
}

export type KnowgrphGitRefRecord = {
  id: string
  workspaceId: string
  repositoryId: string
  refName: string
  targetKind: 'direct' | 'symbolic'
  target: string
  remoteId: string | null
  updatedAtMs: number
}

export type KnowgrphGitRepositoryRecord = {
  id: string
  workspaceId: string
  repositoryId: string
  remoteId: string
  canonicalPathScope: string
  headRefName: string
  objectFormat: typeof KNOWGRPH_GIT_OBJECT_FORMAT
  updatedAtMs: number
}

export type KnowgrphGitIdentity = {
  name: string
  email: string
  timestampSeconds: number
  timezone: string
}

export type KnowgrphGitDocument = {
  path: string
  kind: KnowgrphGitDocumentKind
  text: string
}

export type KnowgrphGitRemoteRequest = {
  workspaceId: string
  repositoryId: string
  remoteId: string
  canonicalPathScope: string
  refName: string
}

export type KnowgrphGitCommitRequest = {
  workspaceId: string
  repositoryId: string
  remoteId: string
  canonicalPathScope: string
  refName: string
  documents: KnowgrphGitDocument[]
  message: string
  author: KnowgrphGitIdentity
  committer?: KnowgrphGitIdentity | null
}

export type KnowgrphGitPushRequest = KnowgrphGitRemoteRequest & {
  expectedRemoteObjectId: string | null
}

export type KnowgrphGitQueuedRequest =
  | ({ kind: 'clone' | 'fetch' } & KnowgrphGitRemoteRequest)
  | ({ kind: 'commit' } & KnowgrphGitCommitRequest)
  | ({ kind: 'push' } & KnowgrphGitPushRequest)

export type KnowgrphGitOutboxStatus =
  | 'queued'
  | 'complete'
  | 'limit-exceeded'
  | 'conflict'
  | 'auth-failure'
  | 'retry-exhausted'
  | 'invalid-remote'

export type KnowgrphGitOperationOutboxRecord = {
  id: string
  workspaceId: string
  deviceId: string
  entity: 'gitOperation'
  kind: KnowgrphGitOperationKind
  request: KnowgrphGitQueuedRequest
  attemptCount: number
  lastStatus: KnowgrphGitOutboxStatus
  lastMessage: string | null
  commitPhase?: 'authority-dispatched'
  commitParentObjectId?: string | null
  commitTreeObjectId?: string
  enqueuedSequence: number
  createdAtMs: number
  updatedAtMs: number
}

export type KnowgrphGitOperationResult =
  | {
      status: 'complete'
      operationId: string
      kind: KnowgrphGitOperationKind
      objectId: string | null
      objectsReused: number
    }
  | {
      status: 'queued'
      operationId: string
      kind: KnowgrphGitOperationKind
    }
  | {
      status:
        | 'unsupported-path'
        | 'limit-exceeded'
        | 'conflict'
        | 'auth-failure'
        | 'retry-exhausted'
        | 'invalid-remote'
      operationId: string | null
      kind: KnowgrphGitOperationKind
      message: string
    }

export type KnowgrphGitResolvedDocument = KnowgrphGitDocument & {
  canonicalPath: string
  repositoryPath: string
  repositoryId: string
}

export type KnowgrphGitResolvedDocumentDeletion = Pick<
  KnowgrphGitResolvedDocument,
  'kind' | 'canonicalPath' | 'repositoryPath' | 'repositoryId'
>

export type KnowgrphGitDocumentAuthorityResult =
  | {
      ok: true
      document: Pick<KnowgrphGitResolvedDocument, 'canonicalPath' | 'repositoryPath' | 'repositoryId'>
    }
  | {
      ok: false
      path: string
      reason: 'unsupported-path'
    }

export type KnowgrphGitCommitWriteResult =
  | {
      kind: 'local-attestation'
      commitObjectId: string
    }
  | {
      kind: 'remote-save-bridge'
      commitObjectId: string | null
    }

export type KnowgrphGitDocumentWriteAuthority = {
  resolveDocument(args: {
    path: string
    kind: KnowgrphGitDocumentKind
  }): KnowgrphGitDocumentAuthorityResult | Promise<KnowgrphGitDocumentAuthorityResult>
  writeCommit(args: {
    operationId: string
    workspaceId: string
    repositoryId: string
    refName: string
    parentObjectId: string | null
    treeObjectId: string
    expectedCommitObjectId: string
    message: string
    author: KnowgrphGitIdentity
    committer: KnowgrphGitIdentity
    documents: KnowgrphGitResolvedDocument[]
    deletions: KnowgrphGitResolvedDocumentDeletion[]
    signal: AbortSignal
  }): Promise<KnowgrphGitCommitWriteResult>
}

export type KnowgrphGitRelayObject = {
  objectId: string
  objectType: KnowgrphGitObjectType
  bodyBase64: string
  byteLength: number
}

export type KnowgrphGitRelayRef = {
  refName: string
  targetKind: 'direct' | 'symbolic'
  target: string
}

export type KnowgrphGitRelayFetchResult = {
  objects: KnowgrphGitRelayObject[]
  refs: KnowgrphGitRelayRef[]
  headRefName: string
  transferBytes: number
}

export type KnowgrphGitRelay = {
  fetch(args: KnowgrphGitRemoteRequest & {
    kind: 'clone' | 'fetch'
    knownObjectIds: string[]
    signal: AbortSignal
  }): Promise<KnowgrphGitRelayFetchResult>
  push(args: KnowgrphGitPushRequest & {
    targetObjectId: string
    objects: KnowgrphGitRelayObject[]
    signal: AbortSignal
  }): Promise<
    | { status: 'applied'; remoteObjectId: string; transferBytes: number }
    | { status: 'remote-advanced'; remoteObjectId: string; transferBytes: number }
  >
}

export type KnowgrphGitIssue = {
  workspaceId: string
  operationId: string
  kind: KnowgrphGitOperationKind
  issue: 'conflict' | 'limit-exceeded' | 'auth-failure' | 'retry-exhausted' | 'invalid-remote'
  message: string
}

export type KnowgrphGitPersistedCache = {
  getRepository(workspaceId: string, repositoryId: string): Promise<KnowgrphGitRepositoryRecord | null>
  putRepository(record: KnowgrphGitRepositoryRecord): Promise<void>
  getObject(workspaceId: string, repositoryId: string, objectId: string): Promise<KnowgrphGitObjectRecord | null>
  listObjects(workspaceId: string, repositoryId: string): Promise<KnowgrphGitObjectRecord[]>
  putObjects(records: KnowgrphGitObjectRecord[]): Promise<void>
  getRef(workspaceId: string, repositoryId: string, refName: string): Promise<KnowgrphGitRefRecord | null>
  listRefs(workspaceId: string, repositoryId: string): Promise<KnowgrphGitRefRecord[]>
  putRefs(records: KnowgrphGitRefRecord[]): Promise<void>
  appendOutbox(
    record: Omit<KnowgrphGitOperationOutboxRecord, 'enqueuedSequence'>,
  ): Promise<KnowgrphGitOperationOutboxRecord>
  listOutbox(workspaceId: string, deviceId: string): Promise<KnowgrphGitOperationOutboxRecord[]>
  requeueFailedOutbox(workspaceId: string, deviceId: string, updatedAtMs: number): Promise<number>
  claimNextOutbox(args: {
    workspaceId: string
    deviceId: string
    claimOwner: string
    claimToken: string
    nowMs: number
    leaseMs: number
  }): Promise<{ record: KnowgrphGitOperationOutboxRecord; claimToken: string } | null>
  patchClaimedOutbox(
    id: string,
    claimToken: string,
    patch: Partial<Pick<
      KnowgrphGitOperationOutboxRecord,
      | 'attemptCount'
      | 'lastStatus'
      | 'lastMessage'
      | 'commitPhase'
      | 'commitParentObjectId'
      | 'commitTreeObjectId'
      | 'updatedAtMs'
    >>,
    releaseClaim?: boolean,
  ): Promise<boolean>
  acknowledgeClaimedOutbox(
    id: string,
    claimToken: string,
    refWrites?: KnowgrphGitRefRecord[],
  ): Promise<boolean>
}

export type KnowgrphGitEngineDependencies = {
  cache: KnowgrphGitPersistedCache
  authority: KnowgrphGitDocumentWriteAuthority
  relay: KnowgrphGitRelay
  deviceId: string
  reportIssue?: ((issue: KnowgrphGitIssue) => void | Promise<void>) | null
  idFactory?: (() => string) | null
  now?: (() => number) | null
  sleep?: ((delayMs: number, signal: AbortSignal) => Promise<void>) | null
}

export class KnowgrphGitRelayError extends Error {
  readonly code: 'retryable' | 'auth-failure' | 'invalid-response' | 'limit-exceeded'
  readonly transferBytes: number

  constructor(
    code: KnowgrphGitRelayError['code'],
    message = 'Git relay request failed',
    transferBytes = 0,
  ) {
    super(message)
    this.name = 'KnowgrphGitRelayError'
    this.code = code
    this.transferBytes = Number.isFinite(transferBytes) ? Math.max(0, transferBytes) : 0
  }
}

export class KnowgrphGitAuthorityError extends Error {
  readonly code: 'retryable' | 'auth-failure' | 'invalid-response'

  constructor(code: KnowgrphGitAuthorityError['code'], message = 'Git document authority failed') {
    super(message)
    this.name = 'KnowgrphGitAuthorityError'
    this.code = code
  }
}
