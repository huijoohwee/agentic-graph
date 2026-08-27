import {
  applyReviewedKnowgrphStorageChangesToSourceFiles,
  applyReviewedKnowgrphStorageGraphRemovalToSourceFiles,
} from '@/features/source-files/sourceFilesInboundStorageApply'
import { useGraphStore } from '@/hooks/useGraphStore'
import {
  getKnowgrphStorageDb,
  commitKnowgrphStorageMutationUnit,
  type KgDocumentLocalRecord,
  type KgStorageConflictCandidateRecord,
  type KnowgrphStorageDb,
  type KnowgrphStorageMutationUnit,
} from '@/lib/storage/knowgrphStorageDb'
import {
  toKnowgrphLocalDocumentRecord,
  toKnowgrphRemoteDocumentRecord,
} from '@/lib/storage/knowgrphStorageRecordMapping'
import {
  buildKnowgrphStorageTargetKeys,
  knowgrphStorageTargetsOverlap,
  readKnowgrphStorageConflictEntries,
} from '@/lib/storage/knowgrphStorageConflictStore'
import {
  notifyKnowgrphStorageConflictUx,
} from '@/lib/storage/knowgrphStorageConflictUx'
import {
  scheduleKnowgrphStorageSync,
  type KnowgrphStorageSyncRunResult,
} from '@/lib/storage/knowgrphStorageClientSync'
import { readRetainedOutboxStatusCounts } from '@/lib/storage/knowgrphStorageClientSupport'
import { rebuildKnowgrphStorageOutboxRecordForRetry } from '@/lib/storage/knowgrphStorageOutboxRecord'
import { toCloneSafeObject, toCloneSafeObjectOrNull } from '@/lib/storage/cloneSafe'
import type {
  KgDocumentChunkRecord,
  KgDocumentRecord,
  KgGraphSnapshotRecord,
  KnowgrphStorageMutation,
  KnowgrphStorageOutboxRecord,
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
  const conflictEntries = await readKnowgrphStorageConflictEntries(storage, workspaceId)
  const retained = await readRetainedOutboxStatusCounts(storage.collections, workspaceId)
  return {
    transportStatus: 'synced',
    durableLocalQueue: storage.persistence.getState().mode === 'indexeddb'
      && storage.persistence.getState().status === 'active',
    workspaceId,
    deviceId: '',
    pushedCount: 0,
    pulledDocumentCount: 0,
    pulledChunkCount: 0,
    pulledGraphSnapshotCount: 0,
    appliedCount: 0,
    conflictCount: 0,
    rejectedCount: retained.rejectedCount,
    deferredCount: retained.deferredCount,
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

type ConflictOutboxEntry = { record: KnowgrphStorageOutboxRecord; mutation: KnowgrphStorageMutation }
type ConflictTarget = {
  storage: KnowgrphStorageDb
  workspaceId: string
  entity: KnowgrphStorageMutation['entity']
  targetKeys: ReadonlySet<string>
  outboxEntries: ConflictOutboxEntry[]
  candidates: KgStorageConflictCandidateRecord[]
}
type ConflictProjection = (args: {
  storage: KnowgrphStorageDb
  entity: KnowgrphStorageMutation['entity']
  op: KnowgrphStorageMutation['op']
  record: KnowgrphStorageMutation['record']
}) => Promise<void>

const readRecordRevision = (entity: KnowgrphStorageMutation['entity'], record: KnowgrphStorageMutation['record']): number =>
  entity === 'document'
    ? normalizeNonNegativeInt((record as KgDocumentRecord).revision, 0)
    : entity === 'graphSnapshot'
      ? normalizeNonNegativeInt((record as KgGraphSnapshotRecord).graphRevision, 0)
      : 0
const readRecordUpdatedAt = (record: KnowgrphStorageMutation['record']): number =>
  normalizeNonNegativeInt((record as { updatedAtMs?: unknown }).updatedAtMs, 0)
const compareRecords = (
  entity: KnowgrphStorageMutation['entity'],
  left: KnowgrphStorageMutation['record'],
  right: KnowgrphStorageMutation['record'],
): number => readRecordRevision(entity, left) - readRecordRevision(entity, right)
  || readRecordUpdatedAt(left) - readRecordUpdatedAt(right)

const readConflictTarget = async (workspaceId: string, mutationId: string): Promise<ConflictTarget | null> => {
  const storage = await getKnowgrphStorageDb()
  const triggerRow = await storage.collections.syncOutbox.findOne(mutationId).exec()
  if (!triggerRow || normalizeString(triggerRow.get('workspaceId')) !== workspaceId
    || normalizeString(triggerRow.get('lastAckStatus')) !== 'conflict') return null
  const trigger = triggerRow.get('payload') as unknown as KnowgrphStorageMutation | null
  const entity = trigger?.entity
  if (!trigger || !entity || normalizeString(triggerRow.get('entity')) !== entity) return null
  const targetKeys = buildKnowgrphStorageTargetKeys(entity, normalizeString(trigger.recordId), trigger.record)
  const outboxRows = await storage.collections.syncOutbox.find({ selector: { workspaceId } }).exec()
  const outboxEntries = outboxRows.flatMap(row => {
    const record = row.toJSON() as KnowgrphStorageOutboxRecord
    const mutation = record.payload as unknown as KnowgrphStorageMutation | null
    if (!mutation || mutation.entity !== entity) return []
    const keys = buildKnowgrphStorageTargetKeys(entity, mutation.recordId, mutation.record)
    return knowgrphStorageTargetsOverlap(targetKeys, keys) ? [{ record, mutation }] : []
  })
  const outboxIds = new Set(outboxEntries.map(entry => entry.record.id))
  const candidateRows = await storage.collections.syncConflicts.find({ selector: { workspaceId } }).exec()
  const candidates = candidateRows.map(row => row.toJSON() as KgStorageConflictCandidateRecord).filter(candidate => {
    if (candidate.entity !== entity) return false
    const keys = buildKnowgrphStorageTargetKeys(entity, candidate.recordId, candidate.remoteRecord)
    return outboxIds.has(candidate.mutationId) || knowgrphStorageTargetsOverlap(targetKeys, keys)
  })
  return { storage, workspaceId, entity, targetKeys, outboxEntries, candidates }
}

const selectLatestOutboxEntry = (target: ConflictTarget): ConflictOutboxEntry => target.outboxEntries.reduce(
  (latest, entry) => {
    const order = entry.record.createdAtMs - latest.record.createdAtMs
      || compareRecords(target.entity, entry.mutation.record, latest.mutation.record)
      || entry.record.id.localeCompare(latest.record.id)
    return order > 0 ? entry : latest
  },
)

const readTargetCacheRecords = async (target: ConflictTarget): Promise<KnowgrphStorageMutation['record'][]> => {
  const { collections } = target.storage
  const records: KnowgrphStorageMutation['record'][] = target.entity === 'document'
    ? (await collections.documents.find({ selector: { workspaceId: target.workspaceId } }).exec())
      .map(row => toKnowgrphRemoteDocumentRecord(row.toJSON() as KgDocumentLocalRecord))
    : target.entity === 'graphSnapshot'
      ? (await collections.graphSnapshots.find({ selector: { workspaceId: target.workspaceId } }).exec())
        .map(row => row.toJSON() as KgGraphSnapshotRecord)
      : (await collections.documentChunks.find({ selector: { workspaceId: target.workspaceId } }).exec())
        .map(row => row.toJSON() as KgDocumentChunkRecord)
  return records.filter(record => knowgrphStorageTargetsOverlap(
    target.targetKeys,
    buildKnowgrphStorageTargetKeys(target.entity, normalizeString(record.id), record),
  ))
}

const selectCurrentLocalRecord = (
  target: ConflictTarget,
  latest: ConflictOutboxEntry,
  cacheRecords: KnowgrphStorageMutation['record'][],
): KnowgrphStorageMutation['record'] => {
  const preferredId = normalizeString(latest.mutation.record.id)
  const preferred = cacheRecords.filter(record => normalizeString(record.id) === preferredId)
  const choices = [latest.mutation.record, ...(preferred.length > 0 ? preferred : cacheRecords)]
  return choices.reduce((current, record) => compareRecords(target.entity, record, current) > 0 ? record : current)
}

const readMaxRemoteRevision = (target: ConflictTarget): number | null => {
  const revisions = target.candidates.flatMap(candidate => [
    candidate.serverRevision,
    candidate.remoteRecord ? readRecordRevision(target.entity, candidate.remoteRecord) : null,
  ]).filter((value): value is number => typeof value === 'number' && Number.isFinite(value))
  return revisions.length > 0 ? Math.max(...revisions) : null
}

const buildTargetCleanupMutations = (
  target: ConflictTarget,
  retainedOutboxId: string | null,
): Array<KnowgrphStorageMutationUnit['mutations'][number]> => [
  ...target.outboxEntries.filter(entry => entry.record.id !== retainedOutboxId)
    .map(entry => ({ kind: 'remove' as const, collectionName: 'syncOutbox' as const, id: entry.record.id })),
  ...target.candidates.map(candidate => ({
    kind: 'remove' as const, collectionName: 'syncConflicts' as const, id: candidate.id,
  })),
]

const defaultConflictProjection: ConflictProjection = async ({ storage, entity, op, record }) => {
  if (entity === 'document') {
    const document = record as KgDocumentRecord
    const graphId = normalizeString(document.graphId)
    const graph = graphId
      ? (await storage.collections.graphSnapshots.findOne(graphId).exec())?.toJSON() as KgGraphSnapshotRecord | undefined
      : undefined
    await applyReviewedKnowgrphStorageChangesToSourceFiles({
      workspaceId: document.workspaceId,
      changes: { documents: [document], documentChunks: [], graphSnapshots: graph ? [graph] : [] },
    }).completion
  } else if (entity === 'graphSnapshot' && op === 'delete') {
    const graph = record as KgGraphSnapshotRecord
    await applyReviewedKnowgrphStorageGraphRemovalToSourceFiles({
      workspaceId: graph.workspaceId, documentId: graph.documentId,
    }).completion
  } else if (entity === 'graphSnapshot') {
    const graph = record as KgGraphSnapshotRecord
    const document = await storage.collections.documents.findOne(graph.documentId).exec()
    if (!document) return
    await applyReviewedKnowgrphStorageChangesToSourceFiles({
      workspaceId: graph.workspaceId,
      changes: {
        documents: [toKnowgrphRemoteDocumentRecord(document.toJSON() as KgDocumentLocalRecord)],
        documentChunks: [], graphSnapshots: [graph],
      },
    }).completion
  } else if (entity === 'documentChunk') {
    const chunk = record as KgDocumentChunkRecord
    const rows = await storage.collections.documentChunks.find({ selector: { workspaceId: chunk.workspaceId } }).exec()
    const documentChunks = rows.map(row => row.toJSON() as KgDocumentChunkRecord)
      .filter(candidate => candidate.documentId === chunk.documentId)
    if (documentChunks.length > 0) {
      await applyReviewedKnowgrphStorageChangesToSourceFiles({
        workspaceId: chunk.workspaceId,
        changes: { documents: [], documentChunks, graphSnapshots: [] },
      }).completion
    }
  }
}
let conflictProjection = defaultConflictProjection
export const __setKnowgrphStorageConflictProjectionForTests = (projection: ConflictProjection): (() => void) => {
  const previous = conflictProjection
  conflictProjection = projection
  return () => { conflictProjection = previous }
}
const projectConflictChoiceBestEffort = async (
  args: Parameters<ConflictProjection>[0],
  mutationId: string,
): Promise<boolean> => {
  try {
    await conflictProjection(args)
    return true
  } catch (error) {
    const message = error instanceof Error ? error.message : 'visible Source Files refresh failed'
    useGraphStore.getState().pushUiLog({
      kind: 'warning', source: 'storage:conflict:projection',
      message: `Conflict choice ${mutationId} remains pending because visible Source Files refresh failed. ${message}`,
    })
    return false
  }
}

const resolveKeepLocal = async (target: ConflictTarget, mutationId: string): Promise<void> => {
  if (target.outboxEntries.length === 0) return
  const latest = selectLatestOutboxEntry(target)
  const cacheRecords = await readTargetCacheRecords(target)
  const current = selectCurrentLocalRecord(target, latest, cacheRecords)
  const remoteRevision = readMaxRemoteRevision(target) ?? latest.mutation.baseRevision
  const nextRevision = Math.max((remoteRevision ?? 0) + 1, readRecordRevision(target.entity, current), 1)
  const nextRecord: KnowgrphStorageMutation['record'] = target.entity === 'document'
    ? sanitizeDocumentRecord({
        ...(current as KgDocumentRecord), revision: nextRevision,
        deleted: latest.mutation.op === 'delete', updatedAtMs: Date.now(),
      })
    : target.entity === 'graphSnapshot'
      ? sanitizeGraphSnapshotRecord({
          ...(current as KgGraphSnapshotRecord), graphRevision: nextRevision, updatedAtMs: Date.now(),
        })
      : current
  const retry = rebuildKnowgrphStorageOutboxRecordForRetry({
    existingRecord: latest.record,
    mutation: latest.mutation,
    nextBaseRevision: remoteRevision,
    nextRecord,
    nowMs: Date.now(),
  })
  const provisionalRetry: KnowgrphStorageOutboxRecord = {
    ...retry,
    lastAckStatus: 'conflict',
    lastAckMessage: 'Visible Source Files projection is pending.',
  }
  const mutations: Array<KnowgrphStorageMutationUnit['mutations'][number]> = []
  const keepId = normalizeString(nextRecord.id)
  if (target.entity === 'document') {
    const localRecord = toKnowgrphLocalDocumentRecord(nextRecord as KgDocumentRecord)
    mutations.unshift(
      ...cacheRecords.filter(record => normalizeString(record.id) !== keepId)
        .map(record => ({ kind: 'remove' as const, collectionName: 'documents' as const, id: normalizeString(record.id) })),
      { kind: 'upsert', collectionName: 'documents', record: localRecord },
    )
    mutations.push({ kind: 'upsert', collectionName: 'syncOutbox', record: provisionalRetry })
    await commitKnowgrphStorageMutationUnit(target.storage, { mutations, revisionDocuments: [localRecord] })
  } else {
    const collectionName = target.entity === 'graphSnapshot' ? 'graphSnapshots' as const : 'documentChunks' as const
    mutations.unshift(...cacheRecords.map(record => ({
      kind: 'remove' as const, collectionName, id: normalizeString(record.id),
    })))
    if (latest.mutation.op !== 'delete') {
      mutations.unshift(target.entity === 'graphSnapshot'
        ? { kind: 'upsert', collectionName: 'graphSnapshots', record: nextRecord as KgGraphSnapshotRecord }
        : { kind: 'upsert', collectionName: 'documentChunks', record: nextRecord as KgDocumentChunkRecord })
    }
    mutations.push({ kind: 'upsert', collectionName: 'syncOutbox', record: provisionalRetry })
    await commitKnowgrphStorageMutationUnit(target.storage, { mutations })
  }
  const projected = await projectConflictChoiceBestEffort({
    storage: target.storage, entity: target.entity, op: latest.mutation.op, record: nextRecord,
  }, mutationId)
  if (!projected) {
    notifyKnowgrphStorageConflictUx(await readConflictSummary(target.workspaceId, target.storage))
    return
  }
  try {
    await commitKnowgrphStorageMutationUnit(target.storage, {
      mutations: [
        ...buildTargetCleanupMutations(target, retry.id),
        { kind: 'upsert', collectionName: 'syncOutbox', record: retry },
      ],
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Conflict cleanup could not be saved.'
    useGraphStore.getState().pushUiLog({
      kind: 'warning', source: 'storage:conflict:resolve', message: `Keep Local cleanup failed. ${message}`,
    })
    notifyKnowgrphStorageConflictUx(await readConflictSummary(target.workspaceId, target.storage))
    return
  }
  useGraphStore.getState().pushUiLog({
    kind: 'success', source: 'storage:conflict:resolve',
    message: `Kept the latest local ${target.entity} change. One sync retry was queued.`,
  })
  notifyKnowgrphStorageConflictUx(await readConflictSummary(target.workspaceId, target.storage))
  scheduleKnowgrphStorageSync({ workspaceId: target.workspaceId, delayMs: 0, signature: `storage-conflict:keep-local:${mutationId}` })
}

const selectLatestRemoteCandidate = (target: ConflictTarget): KgStorageConflictCandidateRecord => {
  const candidates = target.candidates.filter(candidate => candidate.remoteRecord)
  if (candidates.length === 0) throw new Error('The retained remote candidate is not available yet.')
  const latest = candidates.reduce((current, candidate) => {
    const order = compareRecords(target.entity, candidate.remoteRecord!, current.remoteRecord!)
      || candidate.receivedAtMs - current.receivedAtMs
    return order > 0 ? candidate : current
  })
  const knownServerRevision = readMaxRemoteRevision(target)
  if (target.entity !== 'documentChunk' && knownServerRevision != null
    && readRecordRevision(target.entity, latest.remoteRecord!) < knownServerRevision) {
    throw new Error('The latest retained remote candidate is not available yet.')
  }
  return latest
}

const resolveAcceptRemote = async (target: ConflictTarget, mutationId: string): Promise<void> => {
  let remoteRecord: KnowgrphStorageMutation['record']
  let cleanupMutations: Array<KnowgrphStorageMutationUnit['mutations'][number]>
  try {
    remoteRecord = selectLatestRemoteCandidate(target).remoteRecord!
    remoteRecord = target.entity === 'document'
      ? sanitizeDocumentRecord(remoteRecord as KgDocumentRecord)
      : target.entity === 'graphSnapshot'
        ? sanitizeGraphSnapshotRecord(remoteRecord as KgGraphSnapshotRecord)
        : remoteRecord
    const cacheRecords = await readTargetCacheRecords(target)
    const mutations: Array<KnowgrphStorageMutationUnit['mutations'][number]> = []
    cleanupMutations = buildTargetCleanupMutations(target, null)
    const remoteId = normalizeString(remoteRecord.id)
    if (target.entity === 'document') {
      const localRecord = toKnowgrphLocalDocumentRecord(remoteRecord as KgDocumentRecord)
      mutations.unshift(
        ...cacheRecords.filter(record => normalizeString(record.id) !== remoteId)
          .map(record => ({ kind: 'remove' as const, collectionName: 'documents' as const, id: normalizeString(record.id) })),
        { kind: 'upsert', collectionName: 'documents', record: localRecord },
      )
      await commitKnowgrphStorageMutationUnit(target.storage, { mutations, revisionDocuments: [localRecord] })
    } else {
      const collectionName = target.entity === 'graphSnapshot' ? 'graphSnapshots' as const : 'documentChunks' as const
      mutations.unshift(...cacheRecords.filter(record => normalizeString(record.id) !== remoteId).map(record => ({
        kind: 'remove' as const, collectionName, id: normalizeString(record.id),
      })))
      mutations.unshift(target.entity === 'graphSnapshot'
        ? { kind: 'upsert', collectionName: 'graphSnapshots', record: remoteRecord as KgGraphSnapshotRecord }
        : { kind: 'upsert', collectionName: 'documentChunks', record: remoteRecord as KgDocumentChunkRecord })
      await commitKnowgrphStorageMutationUnit(target.storage, { mutations })
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'The remote record could not be applied.'
    const store = useGraphStore.getState()
    store.pushUiLog({ kind: 'warning', source: 'storage:conflict:resolve', message: `Accept Remote failed. ${message}` })
    store.pushUiToast({
      id: `storage-conflict-accept-remote-failed:${mutationId}`, kind: 'warning',
      message: `Remote record was not applied. ${message}`, ttlMs: null, dismissible: true,
    })
    notifyKnowgrphStorageConflictUx(await readConflictSummary(target.workspaceId, target.storage))
    return
  }
  const projected = await projectConflictChoiceBestEffort({
    storage: target.storage, entity: target.entity, op: 'upsert', record: remoteRecord,
  }, mutationId)
  if (!projected) {
    notifyKnowgrphStorageConflictUx(await readConflictSummary(target.workspaceId, target.storage))
    return
  }
  try {
    await commitKnowgrphStorageMutationUnit(target.storage, { mutations: cleanupMutations })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Conflict cleanup could not be saved.'
    useGraphStore.getState().pushUiLog({
      kind: 'warning', source: 'storage:conflict:resolve', message: `Accept Remote cleanup failed. ${message}`,
    })
    notifyKnowgrphStorageConflictUx(await readConflictSummary(target.workspaceId, target.storage))
    return
  }
  useGraphStore.getState().pushUiLog({
    kind: 'success', source: 'storage:conflict:resolve',
    message: `Accepted the latest remote ${target.entity}. All same-target local mutations were discarded.`,
  })
  notifyKnowgrphStorageConflictUx(await readConflictSummary(target.workspaceId, target.storage))
}

const conflictActionInFlight = new Map<string, Promise<void>>()
const buildConflictTargetInFlightKey = (target: ConflictTarget): string => {
  const keys = Array.from(target.targetKeys)
  const semanticKey = keys.filter(key => !key.includes('\u0000id:')).sort()[0] || keys.sort()[0] || target.entity
  return `${target.workspaceId}\u0000${semanticKey}`
}

export const runKnowgrphStorageConflictAction = async (actionId: string): Promise<boolean> => {
  const parsed = parseConflictActionId(actionId)
  if (!parsed) return false
  if (parsed.action === 'review-log') {
    openConflictLogSurface()
    return true
  }
  if (!parsed.mutationId) return true
  const target = await readConflictTarget(parsed.workspaceId, parsed.mutationId)
  if (!target) return true
  const inFlightKey = buildConflictTargetInFlightKey(target)
  const existing = conflictActionInFlight.get(inFlightKey)
  if (existing) {
    await existing
    return true
  }
  const operation = parsed.action === 'keep-local'
    ? resolveKeepLocal(target, parsed.mutationId)
    : resolveAcceptRemote(target, parsed.mutationId)
  conflictActionInFlight.set(inFlightKey, operation)
  try {
    await operation
  } finally {
    if (conflictActionInFlight.get(inFlightKey) === operation) conflictActionInFlight.delete(inFlightKey)
  }
  return true
}
