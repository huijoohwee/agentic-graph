export const AGENTIC_OS_STORAGE_SYNC_API_VERSION = 'agentic-graph-storage-sync/v2' as const

export type AgenticGraphStorageChildState = Readonly<{
  workspaceId: string
  recordId: string
  documentId: string
  syncRevision: number
  updatedAtMs: number
  deleted: boolean
} & (
  | { entity: 'documentChunk'; chunkKey: string }
  | { entity: 'graphSnapshot'; graphRevision: number }
)>
export type AgenticGraphStorageDeletedChildState = AgenticGraphStorageChildState & { deleted: true }

export type AgenticGraphStorageEntityKind = 'document' | 'documentChunk' | 'graphSnapshot'
export type AgenticGraphStorageMutationOp = 'upsert' | 'delete'
export type KgDocumentRecord = {
  id: string
  workspaceId: string
  canonicalPath: string
  title: string | null
  docType: string | null
  lang: string | null
  graphId: string | null
  sourceKind: 'markdown'
  contentMd: string
  contentHash: string
  parserVersion: string
  revision: number
  updatedAtMs: number
  deleted: boolean
}
export type KgDocumentChunkRecord = {
  id: string
  documentId: string
  workspaceId: string
  chunkKey: string
  chunkOrder: number
  heading: string | null
  markdown: string
  tokenEstimate: number
  contentHash: string
  updatedAtMs: number
  contentReused?: boolean
  syncRevision?: number
}
export type KgGraphSnapshotRecord = {
  id: string
  documentId: string
  workspaceId: string
  graphRevision: number
  graphHash: string
  graphJson: Record<string, unknown>
  layoutJson: Record<string, unknown> | null
  derivedFromDocumentRevision: number
  updatedAtMs: number
  syncRevision?: number
}
export type AgenticGraphStorageOutboxRecord = {
  id: string
  workspaceId: string
  deviceId: string
  entity: AgenticGraphStorageEntityKind
  op: AgenticGraphStorageMutationOp
  recordId: string
  baseRevision: number | null
  payload: Record<string, unknown>
  payloadHash: string
  syncApiVersion?: typeof AGENTIC_OS_STORAGE_SYNC_API_VERSION
  attemptCount: number
  lastAckStatus: 'applied' | 'conflict' | 'rejected' | 'deferred' | ''
  lastAckMessage: string | null
  createdAtMs: number
  updatedAtMs: number
}

export type AgenticGraphStorageCursorRecord = {
  id: string
  workspaceId: string
  deviceId: string
  lastPullCursor: string | null
  lastPushCursor: string | null
  serverClockMs: number | null
  updatedAtMs: number
}

export type AgenticGraphStorageMutationRecord =
  | KgDocumentRecord
  | KgDocumentChunkRecord
  | KgGraphSnapshotRecord

export type AgenticGraphStorageMutation =
  | {
      mutationId: string
      workspaceId: string
      entity: 'document'
      op: AgenticGraphStorageMutationOp
      recordId: string
      baseRevision: number | null
      record: KgDocumentRecord
    }
  | {
      mutationId: string
      workspaceId: string
      entity: 'documentChunk'
      op: AgenticGraphStorageMutationOp
      recordId: string
      baseRevision: number | null
      record: KgDocumentChunkRecord
    }
  | {
      mutationId: string
      workspaceId: string
      entity: 'graphSnapshot'
      op: AgenticGraphStorageMutationOp
      recordId: string
      baseRevision: number | null
      record: KgGraphSnapshotRecord
    }

export type AgenticGraphStoragePushRequest = {
  apiVersion: typeof AGENTIC_OS_STORAGE_SYNC_API_VERSION
  workspaceId: string
  deviceId: string
  mutations: AgenticGraphStorageMutation[]
}

export type AgenticGraphStorageMutationAck = {
  mutationId: string
  recordId: string
  entity: AgenticGraphStorageEntityKind
  status: 'applied' | 'conflict' | 'rejected'
  serverRevision: number | null
  message: string | null
  childState?: AgenticGraphStorageChildState | null
}

export type AgenticGraphStoragePushResponse = {
  ok: true
  apiVersion: typeof AGENTIC_OS_STORAGE_SYNC_API_VERSION
  workspaceId: string
  ackCursor: string
  serverTimeMs: number
  acknowledgements: AgenticGraphStorageMutationAck[]
}

export type AgenticGraphStoragePullRequest = {
  apiVersion: typeof AGENTIC_OS_STORAGE_SYNC_API_VERSION
  workspaceId: string
  deviceId: string
  since: string | null
  pageCursor?: string | null
  knownChunks: Array<{
    id: string
    documentId: string
    chunkKey: string
    contentHash: string
  }>
}

export type AgenticGraphStoragePullChanges = {
  documents: KgDocumentRecord[]
  documentChunks: Array<KgDocumentChunkRecord & { syncRevision: number }>
  graphSnapshots: Array<KgGraphSnapshotRecord & { syncRevision: number }>
  deletions: AgenticGraphStorageDeletedChildState[]
}

export type AgenticGraphStoragePullResponse = {
  ok: true
  apiVersion: typeof AGENTIC_OS_STORAGE_SYNC_API_VERSION
  workspaceId: string
  nextCursor: string
  nextPageCursor: string | null
  pageComplete: boolean
  serverTimeMs: number
  changes: AgenticGraphStoragePullChanges
}

