import type {
  KgDocumentChunkRecord,
  KgDocumentRecord,
  KgGraphSnapshotRecord,
  KnowgrphStoragePullResponse,
} from '@/lib/storage/knowgrphStorageSyncContract'
import type { KnowgrphStorageDb } from '@/lib/storage/knowgrphStorageDb'
import type { WorkspaceSeedSyncTaskContext } from '@/lib/workspace/workspaceSeedSyncRuntime'

export type KnowgrphStorageFetchLike = typeof fetch
export type KnowgrphStoragePulledChangesApplyArgs = {
  workspaceId: string
  deviceId: string
  changes: KnowgrphStoragePullResponse['changes']
  signal: AbortSignal
  taskContext: WorkspaceSeedSyncTaskContext
}

export type QueueKnowgrphStorageMutationArgs =
  | {
      workspaceId: string
      deviceId?: string | null
      entity: 'document'
      op: 'upsert' | 'delete'
      recordId?: string | null
      record: KgDocumentRecord
      baseRevision?: number | null
      dbState?: KnowgrphStorageDb | null
    }
  | {
      workspaceId: string
      deviceId?: string | null
      entity: 'documentChunk'
      op: 'upsert' | 'delete'
      recordId?: string | null
      record: KgDocumentChunkRecord
      baseRevision?: number | null
      dbState?: KnowgrphStorageDb | null
    }
  | {
      workspaceId: string
      deviceId?: string | null
      entity: 'graphSnapshot'
      op: 'upsert' | 'delete'
      recordId?: string | null
      record: KgGraphSnapshotRecord
      baseRevision?: number | null
      dbState?: KnowgrphStorageDb | null
    }

export type KnowgrphStorageSyncNowArgs = {
  workspaceId: string
  deviceId?: string | null
  baseUrl?: string | null
  fetchImpl?: KnowgrphStorageFetchLike
  pushBatchSize?: number
  maxRetryCount?: number
  requestTimeoutMs?: number
  sleepImpl?: ((delayMs: number) => Promise<void>) | null
  onPulledChangesApplied?: ((
    args: KnowgrphStoragePulledChangesApplyArgs
  ) => void | Promise<void>) | null
  onSyncCompleted?: ((result: KnowgrphStorageSyncRunResult) => void | Promise<void>) | null
  dbState?: KnowgrphStorageDb | null
}
export type KnowgrphStorageSyncRunResult = {
  transportStatus: 'synced' | 'offline-queued'
  workspaceId: string
  deviceId: string
  pushedCount: number
  pulledDocumentCount: number
  pulledChunkCount: number
  pulledGraphSnapshotCount: number
  appliedCount: number
  conflictCount: number
  rejectedCount: number
  deferredCount: number
  unresolvedConflictCount: number
  conflictEntries: Array<{
    mutationId: string
    entity: string
    recordId: string
    canonicalPath?: string | null
    localRevision?: number | null
    serverRevision?: number | null
    message: string | null
  }>
  transportError?: string | null
  lastPushCursor: string | null
  lastPullCursor: string | null
}
