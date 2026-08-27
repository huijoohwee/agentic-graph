import type {
  KgDocumentChunkRecord,
  KgDocumentRecord,
  KgGraphSnapshotRecord,
  AgenticGraphStoragePullResponse,
} from '@/lib/storage/agenticgraphStorageSyncContract'
import type { AgenticGraphStorageDb } from '@/lib/storage/agenticgraphStorageDb'
import type { WorkspaceSeedSyncTaskContext } from '@/lib/workspace/workspaceSeedSyncRuntime'

export type AgenticGraphStorageFetchLike = typeof fetch
export type AgenticGraphStoragePulledChangesApplyArgs = {
  workspaceId: string
  deviceId: string
  changes: AgenticGraphStoragePullResponse['changes']
  signal: AbortSignal
  taskContext: WorkspaceSeedSyncTaskContext
}

export type QueueAgenticGraphStorageMutationArgs =
  | {
      workspaceId: string
      deviceId?: string | null
      entity: 'document'
      op: 'upsert' | 'delete'
      recordId?: string | null
      record: KgDocumentRecord
      baseRevision?: number | null
      dbState?: AgenticGraphStorageDb | null
    }
  | {
      workspaceId: string
      deviceId?: string | null
      entity: 'documentChunk'
      op: 'upsert' | 'delete'
      recordId?: string | null
      record: KgDocumentChunkRecord
      baseRevision?: number | null
      dbState?: AgenticGraphStorageDb | null
    }
  | {
      workspaceId: string
      deviceId?: string | null
      entity: 'graphSnapshot'
      op: 'upsert' | 'delete'
      recordId?: string | null
      record: KgGraphSnapshotRecord
      baseRevision?: number | null
      dbState?: AgenticGraphStorageDb | null
    }

export type AgenticGraphStorageSyncNowArgs = {
  workspaceId: string
  deviceId?: string | null
  baseUrl?: string | null
  sessionToken?: string | null
  fetchImpl?: AgenticGraphStorageFetchLike
  pushBatchSize?: number
  maxRetryCount?: number
  requestTimeoutMs?: number
  sleepImpl?: ((delayMs: number) => Promise<void>) | null
  onPulledChangesApplied?: ((
    args: AgenticGraphStoragePulledChangesApplyArgs
  ) => void | Promise<void>) | null
  onSyncCompleted?: ((result: AgenticGraphStorageSyncRunResult) => void | Promise<void>) | null
  dbState?: AgenticGraphStorageDb | null
}
export type AgenticGraphStorageSyncRunResult = {
  transportStatus: 'synced' | 'offline-queued'
  durableLocalQueue?: boolean
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
