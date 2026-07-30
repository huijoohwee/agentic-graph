import { applyPulledKnowgrphStorageChangesToSourceFiles } from '@/features/source-files/sourceFilesInboundStorageApply'
import { useGraphStore } from '@/hooks/useGraphStore'
import { hashStringToHex } from '@/lib/hash/stringHash'
import {
  getKnowgrphStorageDb,
  putKnowgrphStorageDocument,
  type KgDocumentLocalRecord,
  type KnowgrphStorageDb,
} from '@/lib/storage/knowgrphStorageDb'
import { toKnowgrphRemoteDocumentRecord } from '@/lib/storage/knowgrphStorageRecordMapping'
import {
  notifyKnowgrphStorageConflictUx,
} from '@/lib/storage/knowgrphStorageConflictUx'
import {
  scheduleKnowgrphStorageSync,
  type KnowgrphStorageSyncRunResult,
} from '@/lib/storage/knowgrphStorageClientSync'
import { toCloneSafeObject, toCloneSafeObjectOrNull } from '@/lib/storage/cloneSafe'
import type {
  KgDocumentRecord,
  KgGraphSnapshotRecord,
  KnowgrphStorageMutation,
} from '@/lib/storage/knowgrphStorageSyncContract'

const STORAGE_CONFLICT_ACTION_PREFIX = 'kg-storage-conflict-action'

const normalizeString = (value: unknown): string => String(value || '').trim()
const normalizeNonNegativeInt = (value: unknown, fallback: number): number => {
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : fallback
}
const sanitizeDocumentRecord = (record: KgDocumentRecord): KgDocumentRecord => ({
  ...record,
  revision: normalizeNonNegativeInt(record.revision, 0),
  updatedAtMs: normalizeNonNegativeInt(record.updatedAtMs, Date.now()),
  deleted: record.deleted === true,
})
const sanitizeGraphSnapshotRecord = (record: KgGraphSnapshotRecord): KgGraphSnapshotRecord => ({
  ...record,
  graphRevision: normalizeNonNegativeInt(record.graphRevision, 0),
  derivedFromDocumentRevision: normalizeNonNegativeInt(record.derivedFromDocumentRevision, 0),
  updatedAtMs: normalizeNonNegativeInt(record.updatedAtMs, Date.now()),
  graphJson: toCloneSafeObject(record.graphJson, {}),
  layoutJson: toCloneSafeObjectOrNull(record.layoutJson),
})
const encodeToken = (value: string): string => encodeURIComponent(normalizeString(value))
const decodeToken = (value: string): string => {
  try {
    return decodeURIComponent(value)
  } catch {
    return normalizeString(value)
  }
}

export const buildKnowgrphStorageConflictReviewLogActionId = (workspaceId: string): string =>
  `${STORAGE_CONFLICT_ACTION_PREFIX}:review-log:${encodeToken(workspaceId)}`

export const buildKnowgrphStorageConflictKeepLocalActionId = (workspaceId: string, mutationId: string): string =>
  `${STORAGE_CONFLICT_ACTION_PREFIX}:keep-local:${encodeToken(workspaceId)}:${encodeToken(mutationId)}`

export const buildKnowgrphStorageConflictAcceptRemoteActionId = (workspaceId: string, mutationId: string): string =>
  `${STORAGE_CONFLICT_ACTION_PREFIX}:accept-remote:${encodeToken(workspaceId)}:${encodeToken(mutationId)}`

const parseConflictActionId = (
  actionId: string,
): { action: 'review-log' | 'keep-local' | 'accept-remote'; workspaceId: string; mutationId: string | null } | null => {
  const parts = normalizeString(actionId).split(':')
  if (parts.length < 3) return null
  if (parts[0] !== STORAGE_CONFLICT_ACTION_PREFIX) return null
  const action = parts[1]
  if (action !== 'review-log' && action !== 'keep-local' && action !== 'accept-remote') return null
  const workspaceId = decodeToken(parts[2] || '')
  const mutationId = parts.length > 3 ? decodeToken(parts[3] || '') : null
  if (!workspaceId) return null
  return { action, workspaceId, mutationId: mutationId || null }
}

const readConflictSummary = async (
  workspaceId: string,
  dbState?: KnowgrphStorageDb | null,
): Promise<KnowgrphStorageSyncRunResult> => {
  const storage = dbState || (await getKnowgrphStorageDb())
  const rows = await storage.collections.syncOutbox.find({ selector: { workspaceId, lastAckStatus: 'conflict' } }).exec()
  const conflictEntries = rows.map(row => {
    const mutation = row.get('payload') as unknown as KnowgrphStorageMutation | null
    const localRevision = mutation?.entity === 'document'
      ? Number(mutation.record.revision || 0)
      : mutation?.entity === 'graphSnapshot'
        ? Number(mutation.record.graphRevision || 0)
        : null
    return {
      mutationId: normalizeString(row.get('id')),
      entity: normalizeString(row.get('entity')),
      recordId: normalizeString(row.get('recordId')),
      canonicalPath: mutation?.entity === 'document'
        ? normalizeString(mutation.record.canonicalPath) || null
        : null,
      localRevision: Number.isFinite(localRevision) ? localRevision : null,
      serverRevision: null,
      message: normalizeString(row.get('lastAckMessage')) || null,
    }
  })
  return {
    transportStatus: 'synced',
    workspaceId,
    deviceId: '',
    pushedCount: 0,
    pulledDocumentCount: 0,
    pulledChunkCount: 0,
    pulledGraphSnapshotCount: 0,
    appliedCount: 0,
    conflictCount: 0,
    rejectedCount: 0,
    deferredCount: 0,
    unresolvedConflictCount: conflictEntries.length,
    conflictEntries,
    transportError: null,
    lastPushCursor: null,
    lastPullCursor: null,
  }
}

const openConflictLogSurface = (): void => {
  const store = useGraphStore.getState()
  try {
    store.setBottomSurfaceCollapsed(false)
  } catch {
    void 0
  }
  try {
    store.setBottomSurfaceTab('history')
  } catch {
    void 0
  }
  try {
    store.requestHistorySubTab('log')
  } catch {
    void 0
  }
}

const readOutboxMutation = async (workspaceId: string, mutationId: string, dbState?: KnowgrphStorageDb | null) => {
  const storage = dbState || (await getKnowgrphStorageDb())
  const row = await storage.collections.syncOutbox.findOne(mutationId).exec()
  if (!row) return { storage, row: null, mutation: null as KnowgrphStorageMutation | null }
  if (normalizeString(row.get('workspaceId')) !== workspaceId) return { storage, row: null, mutation: null as KnowgrphStorageMutation | null }
  return {
    storage,
    row,
    mutation: row.get('payload') as unknown as KnowgrphStorageMutation,
  }
}

const patchOutboxForRetry = async (args: {
  storage: KnowgrphStorageDb
  mutationId: string
  mutation: KnowgrphStorageMutation
  nextBaseRevision: number | null
  nextRecord: KnowgrphStorageMutation['record']
}): Promise<void> => {
  const row = await args.storage.collections.syncOutbox.findOne(args.mutationId).exec()
  if (!row) return
  const nextMutation: KnowgrphStorageMutation = {
    ...args.mutation,
    baseRevision: args.nextBaseRevision,
    record: args.nextRecord as never,
  }
  const nowMs = Date.now()
  await row.incrementalPatch({
    baseRevision: args.nextBaseRevision,
    payload: nextMutation as unknown as Record<string, unknown>,
    payloadHash: hashStringToHex(JSON.stringify(nextMutation)),
    attemptCount: 0,
    lastAckStatus: '',
    lastAckMessage: null,
    updatedAtMs: nowMs,
  })
}

const applyLocalDocumentChoiceToVisibleSourceFiles = async (
  storage: KnowgrphStorageDb,
  document: KgDocumentRecord,
): Promise<void> => {
  const graphId = normalizeString(document.graphId)
  const graphSnapshot = graphId
    ? ((await storage.collections.graphSnapshots.findOne(graphId).exec())?.toJSON() as KgGraphSnapshotRecord | undefined) || null
    : null
  const result = applyPulledKnowgrphStorageChangesToSourceFiles({
    workspaceId: document.workspaceId,
    changes: {
      documents: [document],
      documentChunks: [],
      graphSnapshots: graphSnapshot ? [graphSnapshot] : [],
    },
  })
  await result.completion
}

const applyLocalGraphChoiceToVisibleSourceFiles = async (
  storage: KnowgrphStorageDb,
  graphSnapshot: KgGraphSnapshotRecord,
): Promise<void> => {
  const documentDoc = await storage.collections.documents.findOne(graphSnapshot.documentId).exec()
  if (!documentDoc) return
  const result = applyPulledKnowgrphStorageChangesToSourceFiles({
    workspaceId: graphSnapshot.workspaceId,
    changes: {
      documents: [toKnowgrphRemoteDocumentRecord(documentDoc.toJSON() as KgDocumentLocalRecord)],
      documentChunks: [],
      graphSnapshots: [graphSnapshot],
    },
  })
  await result.completion
}

const resolveKeepLocal = async (workspaceId: string, mutationId: string): Promise<void> => {
  const { storage, row, mutation } = await readOutboxMutation(workspaceId, mutationId)
  if (!row || !mutation) return
  if (mutation.entity === 'document') {
    const remoteDoc = await storage.collections.documents.findOne(mutation.recordId).exec()
    const remoteRevision = Number(remoteDoc?.get('documentRevision') || 0)
    const currentRecord = mutation.record
    const nextRevision = Math.max(remoteRevision + 1, Number(currentRecord.revision || 0) || 1)
    const nextRecord = sanitizeDocumentRecord({
      ...currentRecord,
      revision: nextRevision,
      updatedAtMs: Date.now(),
    })
    await putKnowgrphStorageDocument(storage, {
      ...nextRecord,
      documentRevision: nextRecord.revision,
      isDeleted: nextRecord.deleted,
    })
    await patchOutboxForRetry({
      storage,
      mutationId,
      mutation,
      nextBaseRevision: remoteRevision || null,
      nextRecord,
    })
    await applyLocalDocumentChoiceToVisibleSourceFiles(storage, nextRecord)
    useGraphStore.getState().pushUiLog({
      kind: 'success',
      source: 'storage:conflict:resolve',
      message: `Kept local document change for ${nextRecord.id}. Sync retry queued.`,
    })
  } else if (mutation.entity === 'graphSnapshot') {
    const remoteGraph = await storage.collections.graphSnapshots.findOne(mutation.recordId).exec()
    const remoteRevision = Number(remoteGraph?.get('graphRevision') || 0)
    const currentRecord = mutation.record
    const nextRecord = sanitizeGraphSnapshotRecord({
      ...currentRecord,
      graphRevision: Math.max(remoteRevision + 1, Number(currentRecord.graphRevision || 0) || 1),
      derivedFromDocumentRevision: normalizeNonNegativeInt(currentRecord.derivedFromDocumentRevision, 0),
      updatedAtMs: Date.now(),
    })
    await storage.collections.graphSnapshots.incrementalUpsert(nextRecord)
    await patchOutboxForRetry({
      storage,
      mutationId,
      mutation,
      nextBaseRevision: remoteRevision || null,
      nextRecord,
    })
    await applyLocalGraphChoiceToVisibleSourceFiles(storage, nextRecord)
    useGraphStore.getState().pushUiLog({
      kind: 'success',
      source: 'storage:conflict:resolve',
      message: `Kept local graph snapshot change for ${nextRecord.id}. Sync retry queued.`,
    })
  } else {
    await row.incrementalPatch({
      attemptCount: 0,
      lastAckStatus: '',
      lastAckMessage: null,
      updatedAtMs: Date.now(),
    })
  }
  const summary = await readConflictSummary(workspaceId, storage)
  notifyKnowgrphStorageConflictUx(summary)
  scheduleKnowgrphStorageSync({ workspaceId, delayMs: 0, signature: `storage-conflict:keep-local:${mutationId}` })
}

const resolveAcceptRemote = async (workspaceId: string, mutationId: string): Promise<void> => {
  const { storage, row, mutation } = await readOutboxMutation(workspaceId, mutationId)
  if (!row) return
  const recordId = mutation ? normalizeString(mutation.recordId) : normalizeString(row.get('recordId'))
  try {
    if (mutation?.entity === 'document') {
      const remote = await storage.collections.documents.findOne(recordId).exec()
      if (!remote) throw new Error('The remote document is not available in the persisted cache.')
      const remoteRecord = remote.toJSON() as KgDocumentLocalRecord
      await putKnowgrphStorageDocument(storage, remoteRecord)
      await applyLocalDocumentChoiceToVisibleSourceFiles(
        storage,
        toKnowgrphRemoteDocumentRecord(remoteRecord),
      )
    } else if (mutation?.entity === 'graphSnapshot') {
      const remote = await storage.collections.graphSnapshots.findOne(recordId).exec()
      if (!remote) throw new Error('The remote graph snapshot is not available in the persisted cache.')
      const remoteRecord = sanitizeGraphSnapshotRecord(remote.toJSON() as KgGraphSnapshotRecord)
      await storage.collections.graphSnapshots.incrementalUpsert(remoteRecord)
      await applyLocalGraphChoiceToVisibleSourceFiles(storage, remoteRecord)
    } else if (mutation?.entity === 'documentChunk') {
      const remote = await storage.collections.documentChunks.findOne(recordId).exec()
      if (!remote) throw new Error('The remote document chunk is not available in the persisted cache.')
      await storage.collections.documentChunks.incrementalUpsert(remote.toJSON())
    }
    await row.remove()
  } catch (error) {
    const message = error instanceof Error ? error.message : 'The remote record could not be applied.'
    const store = useGraphStore.getState()
    store.pushUiLog({
      kind: 'warning',
      source: 'storage:conflict:resolve',
      message: `Accept Remote failed for ${recordId || mutationId}. ${message}`,
    })
    store.pushUiToast({
      id: `storage-conflict-accept-remote-failed:${mutationId}`,
      kind: 'warning',
      message: `Remote record was not applied. ${message}`,
      ttlMs: null,
      dismissible: true,
    })
    notifyKnowgrphStorageConflictUx(await readConflictSummary(workspaceId, storage))
    return
  }
  useGraphStore.getState().pushUiLog({
    kind: 'success',
    source: 'storage:conflict:resolve',
    message: `Accepted remote version for ${recordId || mutationId}. Local conflicting mutation was discarded.`,
  })
  const summary = await readConflictSummary(workspaceId, storage)
  notifyKnowgrphStorageConflictUx(summary)
}

export const runKnowgrphStorageConflictAction = async (actionId: string): Promise<boolean> => {
  const parsed = parseConflictActionId(actionId)
  if (!parsed) return false
  if (parsed.action === 'review-log') {
    openConflictLogSurface()
    return true
  }
  if (!parsed.mutationId) return true
  if (parsed.action === 'keep-local') {
    await resolveKeepLocal(parsed.workspaceId, parsed.mutationId)
    return true
  }
  if (parsed.action === 'accept-remote') {
    await resolveAcceptRemote(parsed.workspaceId, parsed.mutationId)
    return true
  }
  return false
}
