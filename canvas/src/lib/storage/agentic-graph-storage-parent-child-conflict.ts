import { useGraphStore } from '@/hooks/useGraphStore'
import { resolvePulledDocumentSourceFileIdentity, sourceFileMatchesPulledDocumentIdentity } from '@/features/source-files/sourceFilesInboundStorageApply'
import { compareAndCommitAgenticGraphStorageMutationUnit, type AgenticGraphStorageDb, type AgenticGraphStorageRecordMap,
  type AgenticGraphStorageMutationUnit, type KgDocumentLocalRecord, type KgStorageConflictCandidateRecord } from '@/lib/storage/agentic-graph-storage-db'
import { toAgenticGraphLocalDocumentRecord, toAgenticGraphRemoteDocumentRecord } from '@/lib/storage/agentic-graph-storage-record-mapping'
import { buildAgenticGraphStorageTargetKeys, agenticGraphStorageTargetsOverlap, resolveAgenticGraphStorageParentRecoverySnapshot } from '@/lib/storage/agentic-graph-storage-conflict-store'
import { createAgenticGraphStorageOutboxRecord, rebuildAgenticGraphStorageOutboxRecordForRetry } from '@/lib/storage/agentic-graph-storage-outbox-record'
import { planAgenticGraphStorageChildState, readAgenticGraphStorageChildState } from '@/lib/storage/agentic-graph-storage-child-state'
import { recordsEqual } from '@/lib/storage/agentic-graph-storage-client-support'
import { AGENTIC_OS_STORAGE_SYNC_API_VERSION, type AgenticGraphStorageMutation, type AgenticGraphStorageOutboxRecord,
  type KgDocumentRecord, type KgDocumentChunkRecord, type KgGraphSnapshotRecord, type AgenticGraphStorageChildState } from '@/lib/storage/agentic-graph-storage-sync-contract'
import type { StorageChildConflictTarget } from '@/lib/storage/agentic-graph-storage-child-conflict'
import type { PersistedCollectionAtomicCondition } from '@/lib/storage/persistedCollectionStore'

type Mutation = AgenticGraphStorageMutationUnit['mutations'][number]
type Condition = PersistedCollectionAtomicCondition<AgenticGraphStorageRecordMap>
type Child = KgDocumentChunkRecord | KgGraphSnapshotRecord
type Target = StorageChildConflictTarget & { sourceSnapshot: ReturnType<typeof useGraphStore.getState>['sourceFiles'];
  workspaceOutboxSnapshot: AgenticGraphStorageOutboxRecord[]; workspaceCandidateSnapshot: KgStorageConflictCandidateRecord[] }
export type ParentChildConflictProjection = { storage: AgenticGraphStorageDb; entity: 'document'; op: 'upsert' | 'delete';
  record: KgDocumentRecord; assertSourceCurrent: () => void;
  relatedChanges: { documentChunks: KgDocumentChunkRecord[]; graphSnapshots: KgGraphSnapshotRecord[] } }
const payload = (row: AgenticGraphStorageOutboxRecord) => row.payload as unknown as AgenticGraphStorageMutation
const latest = (rows: AgenticGraphStorageOutboxRecord[]) => rows.reduce((a, b) =>
  b.createdAtMs > a.createdAtMs || (b.createdAtMs === a.createdAtMs && b.id > a.id) ? b : a)

export const resolveAgenticGraphStorageParentChildConflict = async (args: {
  target: Target; choice: string; project: (args: ParentChildConflictProjection) => Promise<boolean>;
  offer: (parent: KgDocumentRecord, childCount: number) => void; onRestored: () => void;
}): Promise<boolean> => {
  const { target, choice } = args, { storage, workspaceId } = target
  const names = ['documents', 'documentChunks', 'graphSnapshots', 'syncOutbox', 'syncConflicts', 'syncDeferred', 'syncChildState'] as const
  const snapshots = await Promise.all(names.map(async collectionName => ({ collectionName, selector: { workspaceId },
    records: (await storage.collections[collectionName].find({ selector: { workspaceId } }).exec()).map(row => row.toJSON()),
  })))
  const records = <K extends typeof names[number]>(name: K) =>
    snapshots.find(row => row.collectionName === name)!.records as AgenticGraphStorageRecordMap[K][]
  const pending = records('syncOutbox'), candidates = records('syncConflicts'), deferred = records('syncDeferred')
  const documents = records('documents').map(toAgenticGraphRemoteDocumentRecord)
  const mutation = target.outboxEntries[0]?.mutation
  if (!mutation) return false
  const recovery = resolveAgenticGraphStorageParentRecoverySnapshot({ mutation, pending, candidates, deferred, documents })
  if (!recovery) return false
  const { parentIds, family, parents, children, remote } = recovery
  if (choice !== 'restore-family' && choice !== 'discard-family') { args.offer(remote, children.length); return true }
  try {
    const unchanged = <T extends { id: string }>(before: T[], current: T[]) => before.length === current.length
      && before.every(row => recordsEqual(row, current.find(candidate => candidate.id === row.id)))
    if (!unchanged(target.workspaceOutboxSnapshot, pending) || !unchanged(target.workspaceCandidateSnapshot, candidates)) {
      throw new Error('The retained edits or remote candidates changed before review; review the current document and edits.')
    }
    const identities = [...documents.filter(row => parentIds.has(row.id)), remote,
      ...parents.map(row => payload(row).record as KgDocumentRecord)].map(resolvePulledDocumentSourceFileIdentity)
      .filter(identity => identity !== null)
    const observe = (files = useGraphStore.getState().sourceFiles) => JSON.stringify(files.filter(file =>
      identities.some(identity => sourceFileMatchesPulledDocumentIdentity(file, identity))))
    const visible = observe(target.sourceSnapshot)
    const assertSourceCurrent = () => { if (observe() !== visible) throw new Error('The visible document changed during review; its edits remain retained.') }
    const commit = async (mutations: Mutation[], extraConditions: Condition[] = [], revisionDocuments: KgDocumentLocalRecord[] = []) => {
      if (!await compareAndCommitAgenticGraphStorageMutationUnit(storage, {
        conditions: [...snapshots as Condition[], ...extraConditions], mutations, revisionDocuments,
      })) throw new Error('Concurrent changes were retained; review the current document and edits.')
      for (const mutation of mutations) {
        const snapshot = snapshots.find(row => row.collectionName === mutation.collectionName)!
        const id = mutation.kind === 'remove' ? mutation.id : mutation.record.id
        snapshot.records = snapshot.records.filter(row => row.id !== id)
        if (mutation.kind !== 'remove') snapshot.records.push(mutation.record as never)
      }
    }
    if (candidates.some(row => row.entity === 'document' && parentIds.has(row.recordId) && (row.serverRevision ?? 0) > remote.revision)) {
      throw new Error('Refresh the authoritative parent revision before restoring these edits.')
    }
    const restoring = choice === 'restore-family', nowMs = Date.now()
    const parentBasis = parents.length ? payload(latest(parents)).record as KgDocumentRecord
      : documents.find(row => row.id === remote.id) ?? remote
    const parent = restoring ? { ...parentBasis, id: remote.id, canonicalPath: remote.canonicalPath,
      deleted: false, revision: Math.max(remote.revision + 1, parentBasis.revision), updatedAtMs: nowMs } : remote
    if (!Number.isSafeInteger(remote.revision) || remote.revision < 0 || !Number.isSafeInteger(parent.revision)) {
      throw new Error('A valid authoritative parent revision is required before recovery.')
    }
    const localParent = toAgenticGraphLocalDocumentRecord(parent)
    const mutations: Mutation[] = [{ kind: 'upsert', collectionName: 'documents', record: localParent }]
    for (const row of records('documents')) if (parentIds.has(row.id) && row.id !== parent.id) mutations.push({ kind: 'remove', collectionName: 'documents', id: row.id })
    const retryRows: AgenticGraphStorageOutboxRecord[] = []
    let parentCandidate: KgStorageConflictCandidateRecord | null = null
    const childConditions: Condition[] = []
    const relatedChanges = { documentChunks: records('documentChunks').filter(row => parentIds.has(row.documentId)),
      graphSnapshots: records('graphSnapshots').filter(row => parentIds.has(row.documentId)) }
    if (restoring) {
      const parentRetry = parents.length ? rebuildAgenticGraphStorageOutboxRecordForRetry({ existingRecord: latest(parents),
        mutation: { ...payload(latest(parents)), op: 'upsert' }, nextBaseRevision: remote.revision, nextRecord: parent, nowMs })
        : createAgenticGraphStorageOutboxRecord({ workspaceId, deviceId: latest(family).deviceId,
          entity: 'document', op: 'upsert', record: parent, baseRevision: remote.revision })
      parentRetry.createdAtMs = Math.min(...family.map(row => row.createdAtMs))
      retryRows.push(parentRetry)
      parentCandidate = { id: parentRetry.id, mutationId: parentRetry.id, workspaceId, entity: 'document',
        recordId: remote.id, serverRevision: remote.revision, remoteRecord: remote, receivedAtMs: nowMs }
      mutations.push({ kind: 'upsert', collectionName: 'syncConflicts', record: parentCandidate })
      let groups: AgenticGraphStorageOutboxRecord[][] = []
      for (const row of children) {
        const mutation = payload(row), keys = buildAgenticGraphStorageTargetKeys(mutation.entity, mutation.recordId, mutation.record)
        const matching = groups.filter(group => group.some(existing => {
          const record = payload(existing)
          return agenticGraphStorageTargetsOverlap(keys, buildAgenticGraphStorageTargetKeys(record.entity, record.recordId, record.record))
        }))
        groups = [...groups.filter(group => !matching.includes(group)), [row, ...matching.flat()]]
      }
      for (const group of groups) {
        const row = latest(group), mutation = payload(row), local = mutation.record as Child
        const keys = buildAgenticGraphStorageTargetKeys(mutation.entity, local.id, local)
        const states = [...candidates.flatMap(row => row.childState ? [row.childState] : []),
          ...deferred.flatMap(row => row.childState ? [row.childState] : []), ...records('syncChildState')]
          .filter(state => state.entity === mutation.entity && agenticGraphStorageTargetsOverlap(keys,
            buildAgenticGraphStorageTargetKeys(state.entity, state.recordId, { ...state, id: state.recordId })))
          .sort((a, b) => b.syncRevision - a.syncRevision)
        const state = states[0] ? readAgenticGraphStorageChildState(states[0]) : null
        if ((state && state.documentId !== remote.id) || (!state && (row.syncApiVersion !== AGENTIC_OS_STORAGE_SYNC_API_VERSION || row.baseRevision !== null))) {
          throw new Error('Refresh the authoritative child identity and revision before restoring these edits.')
        }
        if (state) {
          const plan = await planAgenticGraphStorageChildState(storage, state)
          if (plan.newestRevision > state.syncRevision) throw new Error('A newer child state needs review.')
          childConditions.push(...plan.conditions); mutations.push(...plan.mutations)
        }
        const record = { ...local, id: state?.recordId ?? local.id, documentId: remote.id,
          ...(state ? { syncRevision: state.syncRevision } : {}), updatedAtMs: nowMs }
        const retry = rebuildAgenticGraphStorageOutboxRecordForRetry({ existingRecord: { ...row, syncApiVersion: AGENTIC_OS_STORAGE_SYNC_API_VERSION },
          mutation, nextBaseRevision: state?.syncRevision ?? null, nextRecord: record, nowMs })
        retryRows.push(retry)
        const collectionName = row.entity === 'documentChunk' ? 'documentChunks' : 'graphSnapshots'
        const childRows = relatedChanges[collectionName]
        const matches = (candidate: Child) => agenticGraphStorageTargetsOverlap(keys,
          buildAgenticGraphStorageTargetKeys(mutation.entity, candidate.id, candidate))
        for (const cached of childRows.filter(matches)) if (mutation.op === 'delete' || cached.id !== record.id) {
          mutations.push({ kind: 'remove', collectionName, id: cached.id })
        }
        const next = childRows.filter(candidate => !matches(candidate))
        if (mutation.op !== 'delete') {
          mutations.push({ kind: 'upsert', collectionName, record } as Mutation); next.push(record as never)
        }
        relatedChanges[collectionName] = next as never
      }
      for (const row of retryRows) mutations.push({ kind: 'upsert', collectionName: 'syncOutbox', record: {
        ...row, lastAckStatus: 'conflict', lastAckMessage: 'Reviewed document recovery awaits visible projection.',
      } })
    } else {
      for (const collectionName of ['documentChunks', 'graphSnapshots'] as const) {
        for (const row of relatedChanges[collectionName]) if (children.some(child => {
          const mutation = payload(child)
          return (collectionName === 'documentChunks' ? 'documentChunk' : 'graphSnapshot') === mutation.entity
            && agenticGraphStorageTargetsOverlap(buildAgenticGraphStorageTargetKeys(mutation.entity, mutation.recordId, mutation.record),
              buildAgenticGraphStorageTargetKeys(mutation.entity, row.id, row))
        })) mutations.push({ kind: 'remove', collectionName, id: row.id })
        relatedChanges[collectionName] = []
      }
    }
    assertSourceCurrent()
    await commit(mutations, childConditions, [localParent])
    if (!await args.project({ storage, entity: 'document', op: restoring ? 'upsert' : 'delete', record: parent,
      assertSourceCurrent, relatedChanges })) return true
    const retainedIds = new Set(retryRows.map(row => row.id)), familyIds = new Set(family.map(row => row.id))
    const cleanup: Mutation[] = family.filter(row => !retainedIds.has(row.id))
      .map(row => ({ kind: 'remove', collectionName: 'syncOutbox', id: row.id }))
    const reviewedTarget = (entity: AgenticGraphStorageMutation['entity'], recordId: string,
      record: Parameters<typeof buildAgenticGraphStorageTargetKeys>[2]) => entity === 'document'
      ? parentIds.has(recordId) : children.some(child => {
        const mutation = payload(child)
        return mutation.entity === entity && agenticGraphStorageTargetsOverlap(
          buildAgenticGraphStorageTargetKeys(entity, mutation.recordId, mutation.record),
          buildAgenticGraphStorageTargetKeys(entity, recordId, record))
      })
    for (const row of candidates) if (familyIds.has(row.mutationId) || reviewedTarget(row.entity, row.recordId, row.remoteRecord ?? row.childState)) {
      cleanup.push({ kind: 'remove', collectionName: 'syncConflicts', id: row.id })
    }
    if (parentCandidate) cleanup.push({ kind: 'remove', collectionName: 'syncConflicts', id: parentCandidate.id })
    for (const row of deferred) if (reviewedTarget(row.entity, row.recordId, row.record ?? row.childState)) {
      cleanup.push({ kind: 'remove', collectionName: 'syncDeferred', id: row.id })
    }
    cleanup.push(...retryRows.map(record => ({ kind: 'upsert' as const, collectionName: 'syncOutbox' as const, record })))
    await commit(cleanup)
    useGraphStore.getState().pushUiLog({ kind: 'success', source: 'storage:conflict:resolve', message: restoring
      ? 'Restored the reviewed document and retained edits. The document is queued before its edits.'
      : 'Accepted the deleted document and discarded its reviewed retained edits.' })
    if (restoring) args.onRestored()
  } catch (error) {
    useGraphStore.getState().pushUiLog({ kind: 'warning', source: 'storage:conflict:resolve',
      message: `Document recovery remains pending. ${error instanceof Error ? error.message : 'Review could not complete.'}` })
  }
  return true
}
