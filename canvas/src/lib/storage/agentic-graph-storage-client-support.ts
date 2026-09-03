import { hashStringToHex } from '@/lib/hash/stringHash'
import { toCloneSafeObject, toCloneSafeObjectOrNull } from '@/lib/storage/cloneSafe'
import {
  buildAgenticGraphStorageCursorId,
  type KgDocumentChunkRecord,
  type KgDocumentRecord,
  type KgGraphSnapshotRecord,
  type AgenticGraphStorageCursorRecord,
  type AgenticGraphStorageMutation,
  type AgenticGraphStorageOutboxRecord,
  type AgenticGraphStoragePullResponse,
} from '@/lib/storage/agentic-graph-storage-sync-contract'
import {
  getAgenticGraphStorageDb,
  putAgenticGraphStorageDocument,
  type AgenticGraphStorageCollections,
  type AgenticGraphStorageDb,
} from '@/lib/storage/agentic-graph-storage-db'
import {
  toAgenticGraphLocalDocumentRecord,
  withAgenticGraphChunkContentHash,
  withAgenticGraphDocumentContentHash,
} from '@/lib/storage/agentic-graph-storage-record-mapping'
import { AGENTIC_OS_STORAGE_SYNC_BOUNDS } from '@/lib/storage/agentic-graph-storage-bounds'
import type {
  AgenticGraphStorageFetchLike,
  AgenticGraphStorageSyncNowArgs,
  AgenticGraphStorageSyncRunResult,
} from '@/lib/storage/agentic-graph-storage-client-types'

export const AGENTIC_OS_STORAGE_SYNC_TASK_PREFIX = 'agentic-graph-storage:sync'
export const AGENTIC_OS_STORAGE_SYNC_POLL_PREFIX = 'agentic-graph-storage:poll'
export const DEFAULT_PUSH_BATCH_SIZE = 50
export const DEFAULT_MAX_RETRY_COUNT = AGENTIC_OS_STORAGE_SYNC_BOUNDS.maxRetryAttempts
export const DEFAULT_POLL_INTERVAL_MS = AGENTIC_OS_STORAGE_SYNC_BOUNDS.pollIntervalMs
export const DEFAULT_SCHEDULE_DELAY_MS = 250
export const AGENTIC_OS_STORAGE_ROUTE_UNAVAILABLE_RETRY_MS = 10_000
export const DEFAULT_CHUNK_REFERENCE_LIMIT = 1_000


export const inFlightSyncByWorkspace = new Map<string, {
  promise: Promise<AgenticGraphStorageSyncRunResult>
  signal?: AbortSignal
}>()
export const pollTimerByWorkspace = new Map<string, number>()
export const repairedAgenticGraphStorageDbs = new WeakSet<object>()

export const normalizeString = (value: unknown): string => String(value || '').trim()
export const normalizePositiveInt = (value: unknown, fallback: number): number => {
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback
}
export const normalizeNonNegativeInt = (value: unknown, fallback: number): number => {
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : fallback
}
export const isNonNegativeInteger = (value: unknown): value is number =>
  typeof value === 'number'
  && Number.isFinite(value)
  && value >= 0
  && Math.floor(value) === value
export const sanitizeDocumentRecord = (record: KgDocumentRecord): KgDocumentRecord => withAgenticGraphDocumentContentHash({
  ...record,
  revision: normalizeNonNegativeInt(record.revision, 0),
  updatedAtMs: normalizeNonNegativeInt(record.updatedAtMs, 0),
  deleted: record.deleted === true,
})
export const sanitizeDocumentChunkRecord = (record: KgDocumentChunkRecord): KgDocumentChunkRecord => {
  const sanitized = {
    ...record,
    chunkOrder: normalizeNonNegativeInt(record.chunkOrder, 0),
    tokenEstimate: normalizeNonNegativeInt(record.tokenEstimate, 0),
    updatedAtMs: normalizeNonNegativeInt(record.updatedAtMs, 0),
  }
  return record.contentReused === true
    ? sanitized
    : withAgenticGraphChunkContentHash(sanitized)
}
export const sanitizeGraphSnapshotRecord = (record: KgGraphSnapshotRecord): KgGraphSnapshotRecord => ({
  ...record,
  graphRevision: normalizeNonNegativeInt(record.graphRevision, 0),
  derivedFromDocumentRevision: normalizeNonNegativeInt(record.derivedFromDocumentRevision, 0),
  updatedAtMs: normalizeNonNegativeInt(record.updatedAtMs, 0),
  graphJson: toCloneSafeObject(record.graphJson, {}),
  layoutJson: toCloneSafeObjectOrNull(record.layoutJson),
})
export const sanitizeMutationRecord = (
  entity: AgenticGraphStorageMutation['entity'],
  record: AgenticGraphStorageMutation['record'],
): AgenticGraphStorageMutation['record'] => {
  if (entity === 'document') return sanitizeDocumentRecord(record as KgDocumentRecord)
  if (entity === 'documentChunk') return sanitizeDocumentChunkRecord(record as KgDocumentChunkRecord)
  return sanitizeGraphSnapshotRecord(record as KgGraphSnapshotRecord)
}
export const sanitizeMutationPayload = (mutation: AgenticGraphStorageMutation): AgenticGraphStorageMutation => ({
  ...mutation,
  baseRevision:
    mutation.baseRevision == null
      ? null
      : normalizeNonNegativeInt(mutation.baseRevision, 0),
  record: sanitizeMutationRecord(mutation.entity, mutation.record) as never,
})
export const sanitizeOutboxRecord = (record: AgenticGraphStorageOutboxRecord): AgenticGraphStorageOutboxRecord => ({
  ...(() => {
    const payload = sanitizeMutationPayload(record.payload as unknown as AgenticGraphStorageMutation)
    return {
      ...record,
      baseRevision: record.baseRevision == null ? null : normalizeNonNegativeInt(record.baseRevision, 0),
      attemptCount: normalizeNonNegativeInt(record.attemptCount, 0),
      createdAtMs: normalizeNonNegativeInt(record.createdAtMs, 0),
      updatedAtMs: normalizeNonNegativeInt(record.updatedAtMs, 0),
      payload: payload as unknown as Record<string, unknown>,
      payloadHash: hashStringToHex(JSON.stringify(payload)),
    }
  })(),
})
export const sanitizeCursorRecord = (cursor: AgenticGraphStorageCursorRecord): AgenticGraphStorageCursorRecord => ({
  ...cursor,
  serverClockMs: cursor.serverClockMs == null ? null : normalizeNonNegativeInt(cursor.serverClockMs, 0),
  updatedAtMs: normalizeNonNegativeInt(cursor.updatedAtMs, 0),
})

export const ensureAgenticGraphStorageNumericRepair = async (dbState: AgenticGraphStorageDb): Promise<void> => {
  const dbRef = dbState.db as unknown as object
  if (repairedAgenticGraphStorageDbs.has(dbRef)) return
  const { collections } = dbState
  const documentRows = await collections.documents.find().exec()
  for (let i = 0; i < documentRows.length; i += 1) {
    const row = documentRows[i]!
    const rawDocumentRevision = row.get('documentRevision')
    const rawUpdatedAtMs = row.get('updatedAtMs')
    const documentRevision = normalizeNonNegativeInt(rawDocumentRevision, 0)
    const updatedAtMs = normalizeNonNegativeInt(rawUpdatedAtMs, 0)
    if (
      !isNonNegativeInteger(rawDocumentRevision)
      || !isNonNegativeInteger(rawUpdatedAtMs)
      || rawDocumentRevision !== documentRevision
      || rawUpdatedAtMs !== updatedAtMs
    ) {
      await row.incrementalPatch({ documentRevision, updatedAtMs })
    }
  }
  const chunkRows = await collections.documentChunks.find().exec()
  for (let i = 0; i < chunkRows.length; i += 1) {
    const row = chunkRows[i]!
    const rawChunkOrder = row.get('chunkOrder')
    const rawTokenEstimate = row.get('tokenEstimate')
    const rawUpdatedAtMs = row.get('updatedAtMs')
    const chunkOrder = normalizeNonNegativeInt(rawChunkOrder, 0)
    const tokenEstimate = normalizeNonNegativeInt(rawTokenEstimate, 0)
    const updatedAtMs = normalizeNonNegativeInt(rawUpdatedAtMs, 0)
    if (
      !isNonNegativeInteger(rawChunkOrder)
      || !isNonNegativeInteger(rawTokenEstimate)
      || !isNonNegativeInteger(rawUpdatedAtMs)
      || rawChunkOrder !== chunkOrder
      || rawTokenEstimate !== tokenEstimate
      || rawUpdatedAtMs !== updatedAtMs
    ) {
      await row.incrementalPatch({ chunkOrder, tokenEstimate, updatedAtMs })
    }
  }
  const graphRows = await collections.graphSnapshots.find().exec()
  for (let i = 0; i < graphRows.length; i += 1) {
    const row = graphRows[i]!
    const rawGraphJson = row.get('graphJson')
    const rawLayoutJson = row.get('layoutJson')
    const rawGraphRevision = row.get('graphRevision')
    const rawDerivedFromDocumentRevision = row.get('derivedFromDocumentRevision')
    const rawUpdatedAtMs = row.get('updatedAtMs')
    const graphRevision = normalizeNonNegativeInt(rawGraphRevision, 0)
    const derivedFromDocumentRevision = normalizeNonNegativeInt(rawDerivedFromDocumentRevision, 0)
    const updatedAtMs = normalizeNonNegativeInt(rawUpdatedAtMs, 0)
    const graphJson = toCloneSafeObject(rawGraphJson, {})
    const layoutJson = toCloneSafeObjectOrNull(rawLayoutJson)
    if (
      !isNonNegativeInteger(rawGraphRevision)
      || !isNonNegativeInteger(rawDerivedFromDocumentRevision)
      || !isNonNegativeInteger(rawUpdatedAtMs)
      || rawGraphRevision !== graphRevision
      || rawDerivedFromDocumentRevision !== derivedFromDocumentRevision
      || rawUpdatedAtMs !== updatedAtMs
      || JSON.stringify(rawGraphJson ?? null) !== JSON.stringify(graphJson ?? null)
      || JSON.stringify(rawLayoutJson ?? null) !== JSON.stringify(layoutJson ?? null)
    ) {
      await row.incrementalPatch({
        graphRevision,
        derivedFromDocumentRevision,
        updatedAtMs,
        graphJson,
        layoutJson,
      })
    }
  }
  const outboxRows = await collections.syncOutbox.find().exec()
  for (let i = 0; i < outboxRows.length; i += 1) {
    const row = outboxRows[i]!
    const raw = row.toJSON() as AgenticGraphStorageOutboxRecord
    const sanitized = sanitizeOutboxRecord(raw)
    if (JSON.stringify(raw) !== JSON.stringify(sanitized)) {
      await row.incrementalPatch({
        baseRevision: sanitized.baseRevision,
        payload: sanitized.payload,
        payloadHash: sanitized.payloadHash,
        attemptCount: sanitized.attemptCount,
        createdAtMs: sanitized.createdAtMs,
        updatedAtMs: sanitized.updatedAtMs,
      })
    }
  }
  const cursorRows = await collections.syncCursor.find().exec()
  for (let i = 0; i < cursorRows.length; i += 1) {
    const row = cursorRows[i]!
    const raw = row.toJSON() as AgenticGraphStorageCursorRecord
    const sanitized = sanitizeCursorRecord(raw)
    if (JSON.stringify(raw) !== JSON.stringify(sanitized)) {
      await row.incrementalPatch({
        serverClockMs: sanitized.serverClockMs,
        updatedAtMs: sanitized.updatedAtMs,
      })
    }
  }
  repairedAgenticGraphStorageDbs.add(dbRef)
}

export const getDbState = async (dbState?: AgenticGraphStorageDb | null): Promise<AgenticGraphStorageDb> => {
  if (dbState) return dbState
  return getAgenticGraphStorageDb()
}

export const readCursorRow = async (
  collections: AgenticGraphStorageCollections,
  workspaceId: string,
  deviceId: string,
) => collections.syncCursor.findOne(buildAgenticGraphStorageCursorId(workspaceId, deviceId)).exec()

export const upsertCursorRow = async (
  collections: AgenticGraphStorageCollections,
  cursor: AgenticGraphStorageCursorRecord,
): Promise<void> => {
  await collections.syncCursor.incrementalUpsert(sanitizeCursorRecord(cursor))
}

export const readPendingOutboxDocs = async (
  collections: AgenticGraphStorageCollections,
  workspaceId: string,
  maxRetryCount: number,
  limit: number,
) => {
  const rows = await collections.syncOutbox
    .find({ selector: { workspaceId } })
    .exec()
  const entityOrder = { document: 0, documentChunk: 1, graphSnapshot: 2 } as const
  return rows.sort((left, right) =>
    Number(left.get('createdAtMs') || 0) - Number(right.get('createdAtMs') || 0)
    || (entityOrder[normalizeString(left.get('entity')) as keyof typeof entityOrder] ?? 3)
      - (entityOrder[normalizeString(right.get('entity')) as keyof typeof entityOrder] ?? 3)
    || normalizeString(left.get('id')).localeCompare(normalizeString(right.get('id'))))
    .filter(row => {
      const lastAckStatus = normalizeString(row.get('lastAckStatus'))
      return Number(row.get('attemptCount') || 0) < maxRetryCount
        && lastAckStatus !== 'conflict'
        && lastAckStatus !== 'rejected'
    })
    .slice(0, limit)
}

export const removeOutboxDocById = async (collections: AgenticGraphStorageCollections, id: string): Promise<void> => {
  const existing = await collections.syncOutbox.findOne(id).exec()
  if (!existing) return
  await existing.remove()
}

export const bumpOutboxAttemptCount = async (
  collections: AgenticGraphStorageCollections,
  id: string,
  args: {
    nextAttemptCount: number
    nowMs: number
    lastAckStatus: 'conflict' | 'rejected' | 'deferred' | ''
    lastAckMessage: string | null
  },
): Promise<void> => {
  const existing = await collections.syncOutbox.findOne(id).exec()
  if (!existing) return
  await existing.incrementalPatch({
    attemptCount: args.nextAttemptCount,
    updatedAtMs: args.nowMs,
    lastAckStatus: args.lastAckStatus,
    lastAckMessage: args.lastAckMessage,
  })
}

export const readUnresolvedConflictCount = async (
  collections: AgenticGraphStorageCollections,
  workspaceId: string,
): Promise<number> => {
  const rows = await collections.syncOutbox
    .find({ selector: { workspaceId, lastAckStatus: 'conflict' } })
    .exec()
  return rows.length
}

export const readRetainedOutboxStatusCounts = async (
  collections: AgenticGraphStorageCollections,
  workspaceId: string,
): Promise<{ rejectedCount: number; deferredCount: number }> => {
  const rows = await collections.syncOutbox.find({ selector: { workspaceId } }).exec()
  let rejectedCount = 0
  let deferredCount = 0
  for (const row of rows) {
    const status = normalizeString(row.get('lastAckStatus'))
    if (status === 'rejected') rejectedCount += 1
    if (status === 'deferred') deferredCount += 1
  }
  return { rejectedCount, deferredCount }
}

// This exported policy answer keeps callers fail-closed: conflict resolution is always explicit.
export const shouldAutoClearAgenticGraphStorageConflict = (
  _localRevision: number,
  _serverRevision: number | null | undefined,
): false => false

export const recordsEqual = (left: unknown, right: unknown): boolean =>
  JSON.stringify(left) === JSON.stringify(right)

export const applyPulledDocuments = async (
  dbState: AgenticGraphStorageDb,
  documents: KgDocumentRecord[],
): Promise<number> => {
  let writtenCount = 0
  for (let i = 0; i < documents.length; i += 1) {
    const document = sanitizeDocumentRecord(documents[i]!)
    const localRecord = toAgenticGraphLocalDocumentRecord(document)
    const existing = await dbState.collections.documents.findOne(localRecord.id).exec()
    if (existing && recordsEqual(existing.toJSON(), localRecord)) continue
    await putAgenticGraphStorageDocument(dbState, localRecord)
    writtenCount += 1
  }
  return writtenCount
}

export const applyPulledDocumentChunks = async (
  collections: AgenticGraphStorageCollections,
  chunks: KgDocumentChunkRecord[],
): Promise<{ writtenCount: number; reusedCount: number }> => {
  let writtenCount = 0
  let reusedCount = 0
  for (let i = 0; i < chunks.length; i += 1) {
    const pulledChunk = sanitizeDocumentChunkRecord(chunks[i]!)
    const existing = await collections.documentChunks.findOne(pulledChunk.id).exec()
    const existingRecord = existing?.toJSON() as KgDocumentChunkRecord | undefined
    const chunk = pulledChunk.contentReused === true
      ? {
          ...pulledChunk,
          markdown: existingRecord?.contentHash === pulledChunk.contentHash
            ? existingRecord.markdown
            : '',
          contentReused: undefined,
        }
      : { ...pulledChunk, contentReused: undefined }
    if (pulledChunk.contentReused === true) {
      if (!existingRecord || existingRecord.contentHash !== pulledChunk.contentHash) {
        throw new Error(`pulled chunk ${pulledChunk.chunkKey} referenced unavailable cached content`)
      }
      reusedCount += 1
    }
    if (existingRecord && recordsEqual(existingRecord, chunk)) continue
    await collections.documentChunks.incrementalUpsert(chunk)
    writtenCount += 1
  }
  return { writtenCount, reusedCount }
}

export const applyPulledGraphSnapshots = async (
  collections: AgenticGraphStorageCollections,
  snapshots: KgGraphSnapshotRecord[],
): Promise<number> => {
  let writtenCount = 0
  for (let i = 0; i < snapshots.length; i += 1) {
    const snapshot = sanitizeGraphSnapshotRecord(snapshots[i]!)
    const existing = await collections.graphSnapshots.findOne(snapshot.id).exec()
    if (existing && recordsEqual(existing.toJSON(), snapshot)) continue
    await collections.graphSnapshots.incrementalUpsert(snapshot)
    writtenCount += 1
  }
  return writtenCount
}
