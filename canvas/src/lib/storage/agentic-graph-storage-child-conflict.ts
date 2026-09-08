import {
  AGENTIC_OS_STORAGE_SYNC_API_VERSION, type AgenticGraphStorageMutation, type AgenticGraphStorageOutboxRecord,
  type AgenticGraphStorageChildState, type KgDocumentChunkRecord, type KgGraphSnapshotRecord,
} from '@/lib/storage/agentic-graph-storage-sync-contract'
import {
  compareAndCommitAgenticGraphStorageMutationUnit, type AgenticGraphStorageDb, type AgenticGraphStorageRecordMap,
  type AgenticGraphStorageMutationUnit, type KgStorageConflictCandidateRecord,
} from '@/lib/storage/agentic-graph-storage-db'
import type { PersistedCollectionAtomicCondition } from '@/lib/storage/persistedCollectionStore'
import { buildAgenticGraphStorageTargetKeys, agenticGraphStorageTargetsOverlap } from '@/lib/storage/agentic-graph-storage-conflict-store'
import { readAgenticGraphStorageChildState, planAgenticGraphStorageChildState } from '@/lib/storage/agentic-graph-storage-child-state'
import { rebuildAgenticGraphStorageOutboxRecordForRetry } from '@/lib/storage/agentic-graph-storage-outbox-record'
import { recordsEqual } from '@/lib/storage/agentic-graph-storage-client-support'

type ChildRecord = KgDocumentChunkRecord | KgGraphSnapshotRecord
type Condition = PersistedCollectionAtomicCondition<AgenticGraphStorageRecordMap>
export type StorageChildConflictTarget = {
  storage: AgenticGraphStorageDb; workspaceId: string; entity: AgenticGraphStorageMutation['entity'];
  targetKeys: ReadonlySet<string>; candidates: KgStorageConflictCandidateRecord[];
  outboxEntries: Array<{ record: AgenticGraphStorageOutboxRecord; mutation: AgenticGraphStorageMutation }>
}
export type StorageChildConflictProjection = {
  storage: AgenticGraphStorageDb; entity: AgenticGraphStorageMutation['entity'];
  op: AgenticGraphStorageMutation['op']; record: AgenticGraphStorageMutation['record']; childState: AgenticGraphStorageChildState;
}

export const resolveAgenticGraphStorageChildConflict = async (args: {
  target: StorageChildConflictTarget; choice: 'keep-local' | 'accept-remote';
  project: (args: StorageChildConflictProjection) => Promise<boolean>;
}): Promise<boolean> => {
  const { target, choice } = args, { storage, workspaceId, entity } = target
  if (entity === 'document' || !target.outboxEntries.length) throw new Error('A retained child conflict is required')
  const candidates = target.candidates.filter(candidate => candidate.childState && (candidate.childState.deleted || candidate.remoteRecord))
  const candidate = candidates.sort((a, b) => (b.serverRevision ?? 0) - (a.serverRevision ?? 0))[0]
  if (!candidate) throw new Error('The authoritative child candidate is not available yet')
  const state = readAgenticGraphStorageChildState(candidate.childState)
  if (state.workspaceId !== workspaceId || state.entity !== entity || state.syncRevision !== candidate.serverRevision
    || target.candidates.some(row => (row.serverRevision ?? 0) > state.syncRevision)) throw new Error('Refresh the latest child candidate before resolving')
  if (!state.deleted) {
    const remote = candidate.remoteRecord as ChildRecord | null
    if (!remote || remote.id !== state.recordId || remote.workspaceId !== workspaceId
      || remote.documentId !== state.documentId || remote.syncRevision !== state.syncRevision) throw new Error('The retained live child is incomplete')
  }
  const latest = target.outboxEntries.reduce((a, b) => b.record.createdAtMs > a.record.createdAtMs
    || (b.record.createdAtMs === a.record.createdAtMs && b.record.id > a.record.id) ? b : a)
  const local = latest.mutation.record as ChildRecord
  const record: ChildRecord = choice === 'keep-local' ? { ...local, syncRevision: state.syncRevision, updatedAtMs: Date.now() }
    : state.deleted ? local : candidate.remoteRecord as ChildRecord
  const op = choice === 'keep-local' ? latest.mutation.op : state.deleted ? 'delete' : 'upsert'
  const retry = rebuildAgenticGraphStorageOutboxRecordForRetry({ existingRecord: {
    ...latest.record, syncApiVersion: AGENTIC_OS_STORAGE_SYNC_API_VERSION }, mutation: latest.mutation,
    nextBaseRevision: state.syncRevision, nextRecord: record, nowMs: Date.now() })
  const provisional = choice === 'keep-local' ? { ...retry, lastAckStatus: 'conflict' as const,
    lastAckMessage: 'Visible Source Files projection is pending.' } : latest.record
  const collectionName = entity === 'documentChunk' ? 'documentChunks' : 'graphSnapshots'
  const [pendingRows, candidateRows, cacheRows, deferredRows] = await Promise.all([
    storage.collections.syncOutbox.find({ selector: { workspaceId } }).exec(),
    storage.collections.syncConflicts.find({ selector: { workspaceId } }).exec(),
    storage.collections[collectionName].find({ selector: { workspaceId } }).exec(),
    storage.collections.syncDeferred.find({ selector: { workspaceId } }).exec(),
  ])
  const pending = pendingRows.map(row => row.toJSON()), allCandidates = candidateRows.map(row => row.toJSON())
  const cache = cacheRows.map(row => row.toJSON()), deferred = deferredRows.map(row => row.toJSON())
  const keys = new Set([...target.targetKeys, ...buildAgenticGraphStorageTargetKeys(entity, state.recordId, { ...state, id: state.recordId })])
  const overlaps = (recordId: string, value: Parameters<typeof buildAgenticGraphStorageTargetKeys>[2]) =>
    agenticGraphStorageTargetsOverlap(keys, buildAgenticGraphStorageTargetKeys(entity, recordId, value))
  const currentTarget = pending.filter(row => row.entity === entity && overlaps(row.recordId,
    (row.payload as unknown as AgenticGraphStorageMutation).record))
  const targetIds = new Set(target.outboxEntries.map(entry => entry.record.id))
  const currentCandidates = allCandidates.filter(row => row.entity === entity && (targetIds.has(row.mutationId)
    || overlaps(row.recordId, row.remoteRecord ?? row.childState ?? null)))
  if (currentTarget.length !== target.outboxEntries.length || target.outboxEntries.some(entry =>
    !recordsEqual(entry.record, pending.find(row => row.id === entry.record.id)))
    || currentCandidates.length !== target.candidates.length
    || target.candidates.some(row => !recordsEqual(row, allCandidates.find(current => current.id === row.id)))) {
    throw new Error('The conflict changed before the reviewed choice could be applied')
  }
  const child = await planAgenticGraphStorageChildState(storage, state)
  if (child.newestRevision > state.syncRevision) throw new Error('A newer child state requires review')
  const conditions: Condition[] = [
    { collectionName: 'syncOutbox', selector: { workspaceId }, records: pending },
    { collectionName: 'syncConflicts', selector: { workspaceId }, records: allCandidates },
    { collectionName: 'syncDeferred', selector: { workspaceId }, records: deferred },
    { collectionName, selector: { workspaceId }, records: cache } as Condition,
  ]
  const nextCache = new Map(cache.map(row => [row.id, row]))
  const mutations: Array<AgenticGraphStorageMutationUnit['mutations'][number]> = [...child.mutations]
  for (const cached of cache.filter(row => overlaps(row.id, row))) {
    if (op !== 'delete' && cached.id === record.id) continue
    mutations.push({ kind: 'remove', collectionName, id: cached.id }); nextCache.delete(cached.id)
  }
  if (op !== 'delete') {
    mutations.push({ kind: 'upsert', collectionName, record } as AgenticGraphStorageMutationUnit['mutations'][number])
    nextCache.set(record.id, record)
  }
  if (choice === 'keep-local') mutations.push({ kind: 'upsert', collectionName: 'syncOutbox', record: provisional })
  if (!await compareAndCommitAgenticGraphStorageMutationUnit(storage, { conditions: [...conditions, ...child.conditions], mutations })) {
    throw new Error('Local changes raced the reviewed child choice')
  }
  if (!await args.project({ storage, entity, op, record, childState: state })) return false
  const finalState = await planAgenticGraphStorageChildState(storage, state)
  if (finalState.newestRevision > state.syncRevision) throw new Error('Child state changed during projection')
  const finalConditions: Condition[] = [
    ...finalState.conditions,
    { collectionName: 'syncOutbox', selector: { workspaceId }, records: pending.map(row => row.id === provisional.id ? provisional : row) },
    { collectionName: 'syncConflicts', selector: { workspaceId }, records: allCandidates },
    { collectionName: 'syncDeferred', selector: { workspaceId }, records: deferred },
    { collectionName, selector: { workspaceId }, records: [...nextCache.values()] } as Condition,
  ]
  const cleanup: Array<AgenticGraphStorageMutationUnit['mutations'][number]> = [
    ...target.outboxEntries.filter(entry => choice === 'accept-remote' || entry.record.id !== retry.id)
      .map(entry => ({ kind: 'remove' as const, collectionName: 'syncOutbox' as const, id: entry.record.id })),
    ...target.candidates.map(row => ({ kind: 'remove' as const, collectionName: 'syncConflicts' as const, id: row.id })),
    ...deferred.filter(row => row.entity === entity && row.childState && row.childState.syncRevision <= state.syncRevision
      && overlaps(row.recordId, row.record ?? row.childState))
      .map(row => ({ kind: 'remove' as const, collectionName: 'syncDeferred' as const, id: row.id })),
  ]
  if (choice === 'keep-local') cleanup.push({ kind: 'upsert', collectionName: 'syncOutbox', record: retry })
  if (!await compareAndCommitAgenticGraphStorageMutationUnit(storage, { conditions: finalConditions, mutations: cleanup })) {
    throw new Error('New local changes were retained because conflict completion raced another writer')
  }
  return true
}
