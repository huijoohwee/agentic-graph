export const AGENTIC_OS_GIT_OBJECT_FORMAT = 'sha1' as const

export const AGENTIC_OS_GIT_OPERATION_BOUNDS = {
  timeoutMs: 30_000,
  maxTransferBytes: 10_485_760,
  maxAttempts: 3,
  backoffBaseMs: 1_000,
  backoffFactor: 2,
  backoffCapMs: 30_000,
} as const

export type AgenticGraphGitObjectType = 'blob' | 'tree' | 'commit' | 'tag'
export type AgenticGraphGitOperationKind = 'clone' | 'fetch' | 'commit' | 'push'
export type AgenticGraphGitStorageMode = 'online' | 'offline-only'
export type AgenticGraphGitDocumentKind = 'markdown' | 'json'

export type AgenticGraphGitObjectRecord = {
  id: string
  workspaceId: string
  repositoryId: string
  objectId: string
  objectFormat: typeof AGENTIC_OS_GIT_OBJECT_FORMAT
  objectType: AgenticGraphGitObjectType
  bodyBase64: string
  byteLength: number
  updatedAtMs: number
}

export type AgenticGraphGitRefRecord = {
  id: string
  workspaceId: string
  repositoryId: string
  refName: string
  targetKind: 'direct' | 'symbolic'
  target: string
  remoteId: string | null
  updatedAtMs: number
}

export type AgenticGraphGitRepositoryRecord = {
  id: string
  workspaceId: string
  repositoryId: string
  remoteId: string
  canonicalPathScope: string
  headRefName: string
  objectFormat: typeof AGENTIC_OS_GIT_OBJECT_FORMAT
  updatedAtMs: number
}

export type AgenticGraphGitIdentity = {
  name: string
  email: string
  timestampSeconds: number
  timezone: string
}

export type AgenticGraphGitDocument = {
  path: string
  kind: AgenticGraphGitDocumentKind
  text: string
}

export type AgenticGraphGitRemoteRequest = {
  workspaceId: string
  repositoryId: string
  remoteId: string
  canonicalPathScope: string
  refName: string
}

export type AgenticGraphGitCommitRequest = {
  workspaceId: string
  repositoryId: string
  remoteId: string
  canonicalPathScope: string
  refName: string
  documents: AgenticGraphGitDocument[]
  message: string
  author: AgenticGraphGitIdentity
  committer?: AgenticGraphGitIdentity | null
}

export type AgenticGraphGitPushRequest = AgenticGraphGitRemoteRequest & {
  expectedRemoteObjectId: string | null
}

export type AgenticGraphGitQueuedRequest =
  | ({ kind: 'clone' | 'fetch' } & AgenticGraphGitRemoteRequest)
  | ({ kind: 'commit' } & AgenticGraphGitCommitRequest)
  | ({ kind: 'push' } & AgenticGraphGitPushRequest)

export type AgenticGraphGitOutboxStatus =
  | 'queued'
  | 'complete'
  | 'limit-exceeded'
  | 'conflict'
  | 'auth-failure'
  | 'retry-exhausted'
  | 'invalid-remote'

export type AgenticGraphGitOperationOutboxRecord = {
  id: string
  workspaceId: string
  deviceId: string
  entity: 'gitOperation'
  kind: AgenticGraphGitOperationKind
  request: AgenticGraphGitQueuedRequest
  attemptCount: number
  lastStatus: AgenticGraphGitOutboxStatus
  lastMessage: string | null
  commitPhase?: 'authority-dispatched'
  commitParentObjectId?: string | null
  commitTreeObjectId?: string
  enqueuedSequence: number
  createdAtMs: number
  updatedAtMs: number
}

export type AgenticGraphGitOperationResult =
  | {
      status: 'complete'
      operationId: string
      kind: AgenticGraphGitOperationKind
      objectId: string | null
      objectsReused: number
    }
  | {
      status: 'queued'
      operationId: string
      kind: AgenticGraphGitOperationKind
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
      kind: AgenticGraphGitOperationKind
      message: string
    }

export type AgenticGraphGitResolvedDocument = AgenticGraphGitDocument & {
  canonicalPath: string
  repositoryPath: string
  repositoryId: string
}

export type AgenticGraphGitResolvedDocumentDeletion = Pick<
  AgenticGraphGitResolvedDocument,
  'kind' | 'canonicalPath' | 'repositoryPath' | 'repositoryId'
>

export type AgenticGraphGitDocumentAuthorityResult =
  | {
      ok: true
      document: Pick<AgenticGraphGitResolvedDocument, 'canonicalPath' | 'repositoryPath' | 'repositoryId'>
    }
  | {
      ok: false
      path: string
      reason: 'unsupported-path'
    }

export type AgenticGraphGitCommitWriteResult =
  | {
      kind: 'local-attestation'
      commitObjectId: string
    }
  | {
      kind: 'remote-save-bridge'
      commitObjectId: string | null
    }

export type AgenticGraphGitDocumentWriteAuthority = {
  resolveDocument(args: {
    path: string
    kind: AgenticGraphGitDocumentKind
  }): AgenticGraphGitDocumentAuthorityResult | Promise<AgenticGraphGitDocumentAuthorityResult>
  writeCommit(args: {
    operationId: string
    workspaceId: string
    repositoryId: string
    refName: string
    parentObjectId: string | null
    treeObjectId: string
    expectedCommitObjectId: string
    message: string
    author: AgenticGraphGitIdentity
    committer: AgenticGraphGitIdentity
    documents: AgenticGraphGitResolvedDocument[]
    deletions: AgenticGraphGitResolvedDocumentDeletion[]
    signal: AbortSignal
  }): Promise<AgenticGraphGitCommitWriteResult>
}

export type AgenticGraphGitRelayObject = {
  objectId: string
  objectType: AgenticGraphGitObjectType
  bodyBase64: string
  byteLength: number
}

export type AgenticGraphGitRelayRef = {
  refName: string
  targetKind: 'direct' | 'symbolic'
  target: string
}

export type AgenticGraphGitRelayFetchResult = {
  objects: AgenticGraphGitRelayObject[]
  refs: AgenticGraphGitRelayRef[]
  headRefName: string
  transferBytes: number
}

export type AgenticGraphGitRelay = {
  fetch(args: AgenticGraphGitRemoteRequest & {
    kind: 'clone' | 'fetch'
    knownObjectIds: string[]
    signal: AbortSignal
  }): Promise<AgenticGraphGitRelayFetchResult>
  push(args: AgenticGraphGitPushRequest & {
    targetObjectId: string
    objects: AgenticGraphGitRelayObject[]
    signal: AbortSignal
  }): Promise<
    | { status: 'applied'; remoteObjectId: string; transferBytes: number }
    | { status: 'remote-advanced'; remoteObjectId: string; transferBytes: number }
  >
}

export type AgenticGraphGitIssue = {
  workspaceId: string
  operationId: string
  kind: AgenticGraphGitOperationKind
  issue: 'conflict' | 'limit-exceeded' | 'auth-failure' | 'retry-exhausted' | 'invalid-remote'
  message: string
}

export type AgenticGraphGitPersistedCache = {
  getRepository(workspaceId: string, repositoryId: string): Promise<AgenticGraphGitRepositoryRecord | null>
  putRepository(record: AgenticGraphGitRepositoryRecord): Promise<void>
  getObject(workspaceId: string, repositoryId: string, objectId: string): Promise<AgenticGraphGitObjectRecord | null>
  listObjects(workspaceId: string, repositoryId: string): Promise<AgenticGraphGitObjectRecord[]>
  putObjects(records: AgenticGraphGitObjectRecord[]): Promise<void>
  getRef(workspaceId: string, repositoryId: string, refName: string): Promise<AgenticGraphGitRefRecord | null>
  listRefs(workspaceId: string, repositoryId: string): Promise<AgenticGraphGitRefRecord[]>
  putRefs(records: AgenticGraphGitRefRecord[]): Promise<void>
  appendOutbox(
    record: Omit<AgenticGraphGitOperationOutboxRecord, 'enqueuedSequence'>,
  ): Promise<AgenticGraphGitOperationOutboxRecord>
  listOutbox(workspaceId: string, deviceId: string): Promise<AgenticGraphGitOperationOutboxRecord[]>
  requeueFailedOutbox(workspaceId: string, deviceId: string, updatedAtMs: number): Promise<number>
  claimNextOutbox(args: {
    workspaceId: string
    deviceId: string
    claimOwner: string
    claimToken: string
    nowMs: number
    leaseMs: number
  }): Promise<{ record: AgenticGraphGitOperationOutboxRecord; claimToken: string } | null>
  patchClaimedOutbox(
    id: string,
    claimToken: string,
    patch: Partial<Pick<
      AgenticGraphGitOperationOutboxRecord,
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
    refWrites?: AgenticGraphGitRefRecord[],
  ): Promise<boolean>
}

export type AgenticGraphGitEngineDependencies = {
  cache: AgenticGraphGitPersistedCache
  authority: AgenticGraphGitDocumentWriteAuthority
  relay: AgenticGraphGitRelay
  deviceId: string
  reportIssue?: ((issue: AgenticGraphGitIssue) => void | Promise<void>) | null
  idFactory?: (() => string) | null
  now?: (() => number) | null
  sleep?: ((delayMs: number, signal: AbortSignal) => Promise<void>) | null
}

export class AgenticGraphGitRelayError extends Error {
  readonly code: 'retryable' | 'auth-failure' | 'invalid-response' | 'limit-exceeded'
  readonly transferBytes: number

  constructor(
    code: AgenticGraphGitRelayError['code'],
    message = 'Git relay request failed',
    transferBytes = 0,
  ) {
    super(message)
    this.name = 'AgenticGraphGitRelayError'
    this.code = code
    this.transferBytes = Number.isFinite(transferBytes) ? Math.max(0, transferBytes) : 0
  }
}

export class AgenticGraphGitAuthorityError extends Error {
  readonly code: 'retryable' | 'auth-failure' | 'invalid-response'

  constructor(code: AgenticGraphGitAuthorityError['code'], message = 'Git document authority failed') {
    super(message)
    this.name = 'AgenticGraphGitAuthorityError'
    this.code = code
  }
}
