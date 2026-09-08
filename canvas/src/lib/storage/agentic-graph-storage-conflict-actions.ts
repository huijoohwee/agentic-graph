import { resolveAgenticGraphStorageParentChildConflict } from '@/lib/storage/agentic-graph-storage-parent-child-conflict'
import {
  applyReviewedAgenticGraphStorageChangesToSourceFiles,
  resolvePulledDocumentSourceFileIdentity,
  sourceFileMatchesPulledDocumentIdentity,
  applyReviewedAgenticGraphStorageGraphRemovalToSourceFiles,
} from '@/features/source-files/sourceFilesInboundStorageApply'
import { useGraphStore } from '@/hooks/useGraphStore'
import {
  getAgenticGraphStorageDb,
  compareAndCommitAgenticGraphStorageMutationUnit,
  type AgenticGraphStorageRecordMap,
  type KgDocumentLocalRecord,
  type KgStorageConflictCandidateRecord,
  type AgenticGraphStorageDb,
  type AgenticGraphStorageMutationUnit,
} from '@/lib/storage/agentic-graph-storage-db'
import {
  toAgenticGraphLocalDocumentRecord,
  toAgenticGraphRemoteDocumentRecord,
} from '@/lib/storage/agentic-graph-storage-record-mapping'
import {
  buildAgenticGraphStorageTargetKeys,
  agenticGraphStorageTargetsOverlap,
  readAgenticGraphStorageConflictEntries,
} from '@/lib/storage/agentic-graph-storage-conflict-store'
import {
  notifyAgenticGraphStorageConflictUx,
} from '@/lib/storage/agentic-graph-storage-conflict-ux'
import {
  scheduleAgenticGraphStorageSync,
  type AgenticGraphStorageSyncRunResult,
} from '@/lib/storage/agentic-graph-storage-client-sync'
import type { PersistedCollectionAtomicCondition } from '@/lib/storage/persistedCollectionStore'
import { recordsEqual, readRetainedOutboxStatusCounts } from '@/lib/storage/agentic-graph-storage-client-support'
import { rebuildAgenticGraphStorageOutboxRecordForRetry } from '@/lib/storage/agentic-graph-storage-outbox-record'
import { resolveAgenticGraphStorageChildConflict } from '@/lib/storage/agentic-graph-storage-child-conflict'
import { readAgenticGraphSourceFileIdFromDocumentId } from '@/features/source-files/sourceFilesStorageSync'
import type {
  KgDocumentChunkRecord,
  KgDocumentRecord,
  KgGraphSnapshotRecord,
  AgenticGraphStorageMutation,
  AgenticGraphStorageOutboxRecord,
  AgenticGraphStorageChildState,
} from '@/lib/storage/agentic-graph-storage-sync-contract'

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
const encodeToken = (value: string): string => encodeURIComponent(normalizeString(value))
const decodeToken = (value: string): string => {
  try {
    return decodeURIComponent(value)
  } catch {
    return normalizeString(value)
  }
}

export const buildAgenticGraphStorageConflictReviewLogActionId = (workspaceId: string): string =>
  `${STORAGE_CONFLICT_ACTION_PREFIX}:review-log:${encodeToken(workspaceId)}`

export const buildAgenticGraphStorageConflictKeepLocalActionId = (workspaceId: string, mutationId: string): string =>
  `${STORAGE_CONFLICT_ACTION_PREFIX}:keep-local:${encodeToken(workspaceId)}:${encodeToken(mutationId)}`

export const buildAgenticGraphStorageConflictAcceptRemoteActionId = (workspaceId: string, mutationId: string): string =>
  `${STORAGE_CONFLICT_ACTION_PREFIX}:accept-remote:${encodeToken(workspaceId)}:${encodeToken(mutationId)}`

export const buildAgenticGraphStorageConflictFamilyActionId = (workspaceId: string, mutationId: string, choice: 'restore-family' | 'discard-family'): string =>
  `${STORAGE_CONFLICT_ACTION_PREFIX}:${choice}:${encodeToken(workspaceId)}:${encodeToken(mutationId)}`

const parseConflictActionId = (
  actionId: string,
): { action: 'review-log' | 'keep-local' | 'accept-remote' | 'restore-family' | 'discard-family'; workspaceId: string; mutationId: string | null } | null => {
  const parts = normalizeString(actionId).split(':')
  if (parts.length < 3) return null
  if (parts[0] !== STORAGE_CONFLICT_ACTION_PREFIX) return null
  const action = parts[1]
  if (!['review-log', 'keep-local', 'accept-remote', 'restore-family', 'discard-family'].includes(action!)) return null
  const workspaceId = decodeToken(parts[2] || '')
  const mutationId = parts.length > 3 ? decodeToken(parts[3] || '') : null
  if (!workspaceId) return null
  return { action: action as 'review-log' | 'keep-local' | 'accept-remote' | 'restore-family' | 'discard-family', workspaceId, mutationId: mutationId || null }
}

const readConflictSummary = async (
  workspaceId: string,
  dbState?: AgenticGraphStorageDb | null,
): Promise<AgenticGraphStorageSyncRunResult> => {
  const storage = dbState || (await getAgenticGraphStorageDb())
  const conflictEntries = await readAgenticGraphStorageConflictEntries(storage, workspaceId)
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

type ConflictOutboxEntry = { record: AgenticGraphStorageOutboxRecord; mutation: AgenticGraphStorageMutation }
type ConflictTarget = {
  storage: AgenticGraphStorageDb
  workspaceId: string
  entity: AgenticGraphStorageMutation['entity']
  targetKeys: ReadonlySet<string>
  outboxEntries: ConflictOutboxEntry[]
  candidates: KgStorageConflictCandidateRecord[]
  sourceSnapshot: ReturnType<typeof useGraphStore.getState>['sourceFiles']
  workspaceOutboxSnapshot: AgenticGraphStorageOutboxRecord[]
  workspaceCandidateSnapshot: KgStorageConflictCandidateRecord[]
}
type ConflictProjection = (args: {
  storage: AgenticGraphStorageDb
  entity: AgenticGraphStorageMutation['entity']
  op: AgenticGraphStorageMutation['op']
  record: AgenticGraphStorageMutation['record']
  childState?: AgenticGraphStorageChildState
  assertSourceCurrent?: () => void
  relatedChanges?: { documentChunks: KgDocumentChunkRecord[]; graphSnapshots: KgGraphSnapshotRecord[] }
}) => Promise<void>

const readRecordRevision = (entity: AgenticGraphStorageMutation['entity'], record: AgenticGraphStorageMutation['record']): number =>
  entity === 'document'
    ? normalizeNonNegativeInt((record as KgDocumentRecord).revision, 0)
    : entity === 'graphSnapshot'
      ? normalizeNonNegativeInt((record as KgGraphSnapshotRecord).graphRevision, 0)
      : 0
const readRecordUpdatedAt = (record: AgenticGraphStorageMutation['record']): number =>
  normalizeNonNegativeInt((record as { updatedAtMs?: unknown }).updatedAtMs, 0)
const compareRecords = (
  entity: AgenticGraphStorageMutation['entity'],
  left: AgenticGraphStorageMutation['record'],
  right: AgenticGraphStorageMutation['record'],
): number => readRecordRevision(entity, left) - readRecordRevision(entity, right)
  || readRecordUpdatedAt(left) - readRecordUpdatedAt(right)

const readConflictTarget = async (workspaceId: string, mutationId: string): Promise<ConflictTarget | null> => {
  const sourceSnapshot = useGraphStore.getState().sourceFiles
  const storage = await getAgenticGraphStorageDb()
  const triggerRow = await storage.collections.syncOutbox.findOne(mutationId).exec()
  if (!triggerRow || normalizeString(triggerRow.get('workspaceId')) !== workspaceId
    || normalizeString(triggerRow.get('lastAckStatus')) !== 'conflict') return null
  const trigger = triggerRow.get('payload') as unknown as AgenticGraphStorageMutation | null
  const entity = trigger?.entity
  if (!trigger || !entity || normalizeString(triggerRow.get('entity')) !== entity) return null
  const targetKeys = buildAgenticGraphStorageTargetKeys(entity, normalizeString(trigger.recordId), trigger.record)
  const outboxRows = await storage.collections.syncOutbox.find({ selector: { workspaceId } }).exec()
  const workspaceOutboxSnapshot = outboxRows.map(row => row.toJSON() as AgenticGraphStorageOutboxRecord)
  const outboxEntries = workspaceOutboxSnapshot.flatMap(record => {
    const mutation = record.payload as unknown as AgenticGraphStorageMutation | null
    if (!mutation || mutation.entity !== entity) return []
    const keys = buildAgenticGraphStorageTargetKeys(entity, mutation.recordId, mutation.record)
    return agenticGraphStorageTargetsOverlap(targetKeys, keys) ? [{ record, mutation }] : []
  })
  const outboxIds = new Set(outboxEntries.map(entry => entry.record.id))
  const candidateRows = await storage.collections.syncConflicts.find({ selector: { workspaceId } }).exec()
  const candidates = candidateRows.map(row => row.toJSON() as KgStorageConflictCandidateRecord).filter(candidate => {
    if (candidate.entity !== entity) return false
    const keys = buildAgenticGraphStorageTargetKeys(entity, candidate.recordId, candidate.remoteRecord)
    return outboxIds.has(candidate.mutationId) || agenticGraphStorageTargetsOverlap(targetKeys, keys)
  })
  return { storage, workspaceId, entity, targetKeys, outboxEntries, candidates, sourceSnapshot,
    workspaceOutboxSnapshot,
    workspaceCandidateSnapshot: candidateRows.map(row => row.toJSON() as KgStorageConflictCandidateRecord) }
}

const selectLatestOutboxEntry = (target: ConflictTarget): ConflictOutboxEntry => target.outboxEntries.reduce(
  (latest, entry) => {
    const order = entry.record.createdAtMs - latest.record.createdAtMs
      || compareRecords(target.entity, entry.mutation.record, latest.mutation.record)
      || entry.record.id.localeCompare(latest.record.id)
    return order > 0 ? entry : latest
  },
)

const readTargetCacheRecords = async (target: ConflictTarget): Promise<AgenticGraphStorageMutation['record'][]> => {
  const { collections } = target.storage
  const records: AgenticGraphStorageMutation['record'][] = target.entity === 'document'
    ? (await collections.documents.find({ selector: { workspaceId: target.workspaceId } }).exec())
      .map(row => toAgenticGraphRemoteDocumentRecord(row.toJSON() as KgDocumentLocalRecord))
    : target.entity === 'graphSnapshot'
      ? (await collections.graphSnapshots.find({ selector: { workspaceId: target.workspaceId } }).exec())
        .map(row => row.toJSON() as KgGraphSnapshotRecord)
      : (await collections.documentChunks.find({ selector: { workspaceId: target.workspaceId } }).exec())
        .map(row => row.toJSON() as KgDocumentChunkRecord)
  return records.filter(record => agenticGraphStorageTargetsOverlap(
    target.targetKeys,
    buildAgenticGraphStorageTargetKeys(target.entity, normalizeString(record.id), record),
  ))
}

const selectCurrentLocalRecord = (
  target: ConflictTarget,
  latest: ConflictOutboxEntry,
  cacheRecords: AgenticGraphStorageMutation['record'][],
): AgenticGraphStorageMutation['record'] => {
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
): Array<AgenticGraphStorageMutationUnit['mutations'][number]> => [
  ...target.outboxEntries.filter(entry => entry.record.id !== retainedOutboxId)
    .map(entry => ({ kind: 'remove' as const, collectionName: 'syncOutbox' as const, id: entry.record.id })),
  ...target.candidates.map(candidate => ({
    kind: 'remove' as const, collectionName: 'syncConflicts' as const, id: candidate.id,
  })),
]

const defaultConflictProjection: ConflictProjection = async ({ storage, entity, op, record, childState, assertSourceCurrent, relatedChanges }) => {
  if (entity === 'document') {
    const document = record as KgDocumentRecord
    const graphId = normalizeString(document.graphId)
    const graph = graphId
      ? (await storage.collections.graphSnapshots.findOne(graphId).exec())?.toJSON() as KgGraphSnapshotRecord | undefined
      : undefined
    assertSourceCurrent?.()
    await applyReviewedAgenticGraphStorageChangesToSourceFiles({
      workspaceId: document.workspaceId,
      changes: { documents: [document], documentChunks: relatedChanges?.documentChunks ?? [], graphSnapshots: relatedChanges?.graphSnapshots ?? (graph ? [graph] : []) },
    }).completion
  } else if (entity === 'graphSnapshot' && op === 'delete') {
    const graph = record as KgGraphSnapshotRecord
    assertSourceCurrent?.()
    await applyReviewedAgenticGraphStorageGraphRemovalToSourceFiles({
      workspaceId: graph.workspaceId, documentId: graph.documentId,
      graphRevisions: [graph.graphRevision, ...(childState?.entity === 'graphSnapshot' ? [childState.graphRevision] : [])],
    }).completion
  } else if (entity === 'graphSnapshot') {
    const graph = record as KgGraphSnapshotRecord
    const document = await storage.collections.documents.findOne(graph.documentId).exec()
    if (!document) return
    assertSourceCurrent?.()
    await applyReviewedAgenticGraphStorageChangesToSourceFiles({
      workspaceId: graph.workspaceId,
      changes: {
        documents: [toAgenticGraphRemoteDocumentRecord(document.toJSON() as KgDocumentLocalRecord)],
        documentChunks: [], graphSnapshots: [graph],
      },
    }).completion
  } else if (entity === 'documentChunk') {
    const chunk = record as KgDocumentChunkRecord
    const rows = await storage.collections.documentChunks.find({ selector: { workspaceId: chunk.workspaceId } }).exec()
    const documentChunks = rows.map(row => row.toJSON() as KgDocumentChunkRecord)
      .filter(candidate => candidate.documentId === chunk.documentId)
    assertSourceCurrent?.()
    const sourceFileId = readAgenticGraphSourceFileIdFromDocumentId(chunk.documentId)
    const current = useGraphStore.getState().sourceFiles.find(file => file.id === sourceFileId)
    await applyReviewedAgenticGraphStorageChangesToSourceFiles({ workspaceId: chunk.workspaceId,
      changes: { documents: [], documentChunks, graphSnapshots: [] },
      projection: { previousGraphs: [], documentTexts: [{ documentId: chunk.documentId,
        text: documentChunks.sort((a, b) => a.chunkOrder - b.chunkOrder || a.id.localeCompare(b.id)).map(row => row.markdown).join('\n\n'),
        previousText: current?.text ?? null }] },
    }).completion
  }
}
let conflictProjection = defaultConflictProjection
export const __setAgenticGraphStorageConflictProjectionForTests = (projection: ConflictProjection): (() => void) => {
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

const resolveChildChoice = async (target: ConflictTarget, mutationId: string, choice: 'keep-local' | 'accept-remote'): Promise<void> => {
  const sourceIds = new Set(target.outboxEntries.map(entry => readAgenticGraphSourceFileIdFromDocumentId(
    (entry.mutation.record as KgDocumentChunkRecord).documentId)))
  for (const candidate of target.candidates) if (candidate.childState) sourceIds.add(readAgenticGraphSourceFileIdFromDocumentId(candidate.childState.documentId))
  const observe = () => JSON.stringify(useGraphStore.getState().sourceFiles.filter(file => sourceIds.has(file.id)))
  const before = observe()
  const assertSourceCurrent = () => {
    if (observe() !== before) throw new Error('The visible source changed during conflict review; the queued edit remains retained')
  }
  try {
    const completed = await resolveAgenticGraphStorageChildConflict({ target, choice,
      project: args => projectConflictChoiceBestEffort({ ...args, assertSourceCurrent }, mutationId) })
    if (completed) {
      useGraphStore.getState().pushUiLog({ kind: 'success', source: 'storage:conflict:resolve',
        message: choice === 'keep-local' ? 'Kept the reviewed local child change and queued one sync retry.' : 'Accepted the reviewed remote child state.' })
      if (choice === 'keep-local') scheduleAgenticGraphStorageSync({ workspaceId: target.workspaceId,
        delayMs: 0, signature: `storage-conflict:keep-local:${mutationId}` })
    }
  } catch (error) {
    useGraphStore.getState().pushUiLog({ kind: 'warning', source: 'storage:conflict:resolve',
      message: `Child conflict remains retained. ${error instanceof Error ? error.message : 'The reviewed choice could not complete.'}` })
  }
  notifyAgenticGraphStorageConflictUx(await readConflictSummary(target.workspaceId, target.storage))
}

// Retain the exact reviewed workspace state across both the cache write and projection.
// A different tab may replace a queue row without changing its identity.
const prepareDocumentConflictCommit = async (target: ConflictTarget) => {
  const { storage, workspaceId } = target
  const names = ['documents', 'documentChunks', 'graphSnapshots', 'syncOutbox', 'syncConflicts', 'syncDeferred'] as const
  const snapshots = await Promise.all(names.map(async collectionName => ({ collectionName,
    selector: { workspaceId }, records: (await storage.collections[collectionName].find({ selector: { workspaceId } }).exec()).map(row => row.toJSON()),
  })))
  const pending = snapshots.find(row => row.collectionName === 'syncOutbox')!.records as AgenticGraphStorageOutboxRecord[]
  const conflicts = snapshots.find(row => row.collectionName === 'syncConflicts')!.records as KgStorageConflictCandidateRecord[]
  if (target.outboxEntries.some(entry => !recordsEqual(entry.record, pending.find(row => row.id === entry.record.id)))
    || target.candidates.some(entry => !recordsEqual(entry, conflicts.find(row => row.id === entry.id)))) {
    throw new Error('The document conflict changed before review could be applied')
  }
  for (const row of pending) {
    const mutation = row.payload as unknown as AgenticGraphStorageMutation
    if (mutation.entity === 'document' && !target.outboxEntries.some(entry => entry.record.id === row.id)
      && agenticGraphStorageTargetsOverlap(target.targetKeys, buildAgenticGraphStorageTargetKeys('document', mutation.recordId, mutation.record))) {
      throw new Error('A new document edit requires review')
    }
  }
  const reviewedIds = new Set(target.outboxEntries.map(entry => entry.record.id))
  const currentCandidates = conflicts.filter(row => row.entity === 'document' && (reviewedIds.has(row.mutationId)
    || agenticGraphStorageTargetsOverlap(target.targetKeys, buildAgenticGraphStorageTargetKeys('document', row.recordId, row.remoteRecord))))
  if (currentCandidates.length !== target.candidates.length) throw new Error('A new remote document candidate requires review')
  const identities = [...target.outboxEntries.map(entry => entry.mutation.record), ...target.candidates.flatMap(row => row.remoteRecord ? [row.remoteRecord] : [])]
    .map(record => resolvePulledDocumentSourceFileIdentity(record as KgDocumentRecord)).filter(identity => identity !== null)
  const observe = (files = useGraphStore.getState().sourceFiles) => JSON.stringify(files.filter(file =>
    identities.some(identity => sourceFileMatchesPulledDocumentIdentity(file, identity))))
  const visible = observe(target.sourceSnapshot)
  return {
    assertSourceCurrent: () => { if (observe() !== visible) throw new Error('The visible document changed during conflict review') },
    commit: async (unit: AgenticGraphStorageMutationUnit) => {
      if (!await compareAndCommitAgenticGraphStorageMutationUnit(storage, { ...unit,
        conditions: snapshots as PersistedCollectionAtomicCondition<AgenticGraphStorageRecordMap>[] })) {
        throw new Error('Concurrent local changes were retained; refresh the document conflict')
      }
      for (const mutation of unit.mutations) {
        const snapshot = snapshots.find(row => row.collectionName === mutation.collectionName)
        if (!snapshot) throw new Error('Unobserved document conflict collection')
        const id = mutation.kind === 'remove' ? mutation.id : mutation.record.id
        snapshot.records = snapshot.records.filter(row => row.id !== id)
        if (mutation.kind !== 'remove') snapshot.records.push(mutation.record as never)
      }
    },
  }
}

const resolveKeepLocal = async (target: ConflictTarget, mutationId: string): Promise<void> => {
  if (target.entity !== 'document') return resolveChildChoice(target, mutationId, 'keep-local')
  if (target.outboxEntries.length === 0) return
  const review = await prepareDocumentConflictCommit(target)
  const latest = selectLatestOutboxEntry(target)
  const cacheRecords = await readTargetCacheRecords(target)
  const current = selectCurrentLocalRecord(target, latest, cacheRecords)
  const remoteRevision = readMaxRemoteRevision(target) ?? latest.mutation.baseRevision
  const nextRevision = Math.max((remoteRevision ?? 0) + 1, readRecordRevision(target.entity, current), 1)
  const nextRecord = sanitizeDocumentRecord({ ...(current as KgDocumentRecord), revision: nextRevision,
    deleted: latest.mutation.op === 'delete', updatedAtMs: Date.now() })
  const retry = rebuildAgenticGraphStorageOutboxRecordForRetry({
    existingRecord: latest.record,
    mutation: latest.mutation,
    nextBaseRevision: remoteRevision,
    nextRecord,
    nowMs: Date.now(),
  })
  const provisionalRetry: AgenticGraphStorageOutboxRecord = {
    ...retry,
    lastAckStatus: 'conflict',
    lastAckMessage: 'Visible Source Files projection is pending.',
  }
  const mutations: Array<AgenticGraphStorageMutationUnit['mutations'][number]> = []
  const keepId = normalizeString(nextRecord.id)
  const localRecord = toAgenticGraphLocalDocumentRecord(nextRecord)
  mutations.push(...cacheRecords.filter(record => normalizeString(record.id) !== keepId)
    .map(record => ({ kind: 'remove' as const, collectionName: 'documents' as const, id: normalizeString(record.id) })),
    { kind: 'upsert', collectionName: 'documents', record: localRecord },
    { kind: 'upsert', collectionName: 'syncOutbox', record: provisionalRetry })
  await review.commit( { mutations, revisionDocuments: [localRecord] })
  const projected = await projectConflictChoiceBestEffort({
    storage: target.storage, entity: target.entity, op: latest.mutation.op, record: nextRecord, assertSourceCurrent: review.assertSourceCurrent,
  }, mutationId)
  if (!projected) {
    notifyAgenticGraphStorageConflictUx(await readConflictSummary(target.workspaceId, target.storage))
    return
  }
  try {
    await review.commit( {
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
    notifyAgenticGraphStorageConflictUx(await readConflictSummary(target.workspaceId, target.storage))
    return
  }
  useGraphStore.getState().pushUiLog({
    kind: 'success', source: 'storage:conflict:resolve',
    message: `Kept the latest local ${target.entity} change. One sync retry was queued.`,
  })
  notifyAgenticGraphStorageConflictUx(await readConflictSummary(target.workspaceId, target.storage))
  scheduleAgenticGraphStorageSync({ workspaceId: target.workspaceId, delayMs: 0, signature: `storage-conflict:keep-local:${mutationId}` })
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
  if (target.entity !== 'document') return resolveChildChoice(target, mutationId, 'accept-remote')
  const review = await prepareDocumentConflictCommit(target)
  let remoteRecord: AgenticGraphStorageMutation['record']
  let cleanupMutations: Array<AgenticGraphStorageMutationUnit['mutations'][number]>
  try {
    remoteRecord = sanitizeDocumentRecord(selectLatestRemoteCandidate(target).remoteRecord as KgDocumentRecord)
    const cacheRecords = await readTargetCacheRecords(target)
    const mutations: Array<AgenticGraphStorageMutationUnit['mutations'][number]> = []
    cleanupMutations = buildTargetCleanupMutations(target, null)
    const remoteId = normalizeString(remoteRecord.id)
    const localRecord = toAgenticGraphLocalDocumentRecord(remoteRecord as KgDocumentRecord)
    mutations.push(...cacheRecords.filter(record => normalizeString(record.id) !== remoteId)
      .map(record => ({ kind: 'remove' as const, collectionName: 'documents' as const, id: normalizeString(record.id) })),
      { kind: 'upsert', collectionName: 'documents', record: localRecord })
    await review.commit( { mutations, revisionDocuments: [localRecord] })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'The remote record could not be applied.'
    const store = useGraphStore.getState()
    store.pushUiLog({ kind: 'warning', source: 'storage:conflict:resolve', message: `Accept Remote failed. ${message}` })
    store.pushUiToast({
      id: `storage-conflict-accept-remote-failed:${mutationId}`, kind: 'warning',
      message: `Remote record was not applied. ${message}`, ttlMs: null, dismissible: true,
    })
    notifyAgenticGraphStorageConflictUx(await readConflictSummary(target.workspaceId, target.storage))
    return
  }
  const projected = await projectConflictChoiceBestEffort({
    storage: target.storage, entity: target.entity, op: 'upsert', record: remoteRecord, assertSourceCurrent: review.assertSourceCurrent,
  }, mutationId)
  if (!projected) {
    notifyAgenticGraphStorageConflictUx(await readConflictSummary(target.workspaceId, target.storage))
    return
  }
  try {
    await review.commit( { mutations: cleanupMutations })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Conflict cleanup could not be saved.'
    useGraphStore.getState().pushUiLog({
      kind: 'warning', source: 'storage:conflict:resolve', message: `Accept Remote cleanup failed. ${message}`,
    })
    notifyAgenticGraphStorageConflictUx(await readConflictSummary(target.workspaceId, target.storage))
    return
  }
  useGraphStore.getState().pushUiLog({
    kind: 'success', source: 'storage:conflict:resolve',
    message: `Accepted the latest remote ${target.entity}. All same-target local mutations were discarded.`,
  })
  notifyAgenticGraphStorageConflictUx(await readConflictSummary(target.workspaceId, target.storage))
}

const conflictActionInFlight = new Map<string, Promise<void>>()
const buildConflictTargetInFlightKey = (target: ConflictTarget): string => {
  const keys = Array.from(target.targetKeys)
  const semanticKey = keys.filter(key => !key.includes('\u0000id:')).sort()[0] || keys.sort()[0] || target.entity
  return `${target.workspaceId}\u0000${semanticKey}`
}

export const runAgenticGraphStorageConflictAction = async (actionId: string): Promise<boolean> => {
  const parsed = parseConflictActionId(actionId)
  if (!parsed) return false
  if (parsed.action === 'review-log') {
    openConflictLogSurface()
    return true
  }
  if (!parsed.mutationId) return true
  const target = await readConflictTarget(parsed.workspaceId, parsed.mutationId)
  if (!target) return true
  if (await resolveAgenticGraphStorageParentChildConflict({ target, choice: parsed.action,
    onRestored: () => scheduleAgenticGraphStorageSync({ workspaceId: target.workspaceId, delayMs: 0 }),
    project: args => projectConflictChoiceBestEffort(args, parsed.mutationId!),
    offer: (parent, childCount) => useGraphStore.getState().pushUiLog({ kind: 'warning', source: 'storage:conflict:review',
      message: `${parent.canonicalPath} was deleted remotely and has ${childCount} retained edits. Choose how to resolve the document and edits together.`,
      actions: ['restore-family', 'discard-family'].map(choice => ({
        id: buildAgenticGraphStorageConflictFamilyActionId(target.workspaceId, parsed.mutationId!, choice as 'restore-family' | 'discard-family'),
        label: choice === 'restore-family' ? 'Restore document and edits' : 'Discard retained edits', tone: 'warning' as const,
      })),
    }),
  })) {
    notifyAgenticGraphStorageConflictUx(await readConflictSummary(target.workspaceId, target.storage))
    return true
  }
  if (parsed.action === 'restore-family' || parsed.action === 'discard-family') {
    useGraphStore.getState().pushUiLog({ kind: 'warning', source: 'storage:conflict:review', message: 'Document recovery changed; refresh the remaining conflict before choosing again.' })
    notifyAgenticGraphStorageConflictUx(await readConflictSummary(target.workspaceId, target.storage))
    return true
  }
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
  } catch (error) {
    useGraphStore.getState().pushUiLog({ kind: 'warning', source: 'storage:conflict:resolve',
      message: `Conflict remains retained. ${error instanceof Error ? error.message : 'Review could not complete.'}` })
    notifyAgenticGraphStorageConflictUx(await readConflictSummary(target.workspaceId, target.storage))
  } finally {
    if (conflictActionInFlight.get(inFlightKey) === operation) conflictActionInFlight.delete(inFlightKey)
  }
  return true
}
