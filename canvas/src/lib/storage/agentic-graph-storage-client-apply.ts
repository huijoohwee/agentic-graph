import {
  AGENTIC_OS_STORAGE_SYNC_API_VERSION, type AgenticGraphStorageChildState,
  type AgenticGraphStorageMutation, type AgenticGraphStoragePullChanges, type AgenticGraphStoragePullResponse,
  type KgDocumentChunkRecord, type KgDocumentRecord, type KgGraphSnapshotRecord,
} from '@/lib/storage/agentic-graph-storage-sync-contract'
import {
  compareAndCommitAgenticGraphStorageMutationUnit, type AgenticGraphStorageDb, type AgenticGraphStorageRecordMap,
  type AgenticGraphStorageMutationUnit, type KgStorageDeferredRecord, type KgStorageConflictCandidateRecord,
} from '@/lib/storage/agentic-graph-storage-db'
import type { PersistedCollectionAtomicCondition } from '@/lib/storage/persistedCollectionStore'
import type { AgenticGraphStoragePullProjection } from '@/lib/storage/agentic-graph-storage-client-types'
import { agenticGraphStorageChildStateKeys, planAgenticGraphStorageChildState,
  readAgenticGraphStorageChildState } from '@/lib/storage/agentic-graph-storage-child-state'
import { buildAgenticGraphStorageTargetKeys, agenticGraphStorageTargetsOverlap } from '@/lib/storage/agentic-graph-storage-conflict-store'
import { recordsEqual, sanitizeDocumentRecord, sanitizeDocumentChunkRecord,
  sanitizeGraphSnapshotRecord } from '@/lib/storage/agentic-graph-storage-client-support'
import { toAgenticGraphLocalDocumentRecord } from '@/lib/storage/agentic-graph-storage-record-mapping'

type Condition = PersistedCollectionAtomicCondition<AgenticGraphStorageRecordMap>
type CachedRecord = AgenticGraphStorageRecordMap['documents'] | KgDocumentChunkRecord | KgGraphSnapshotRecord
type Unit = Omit<AgenticGraphStorageMutationUnit, 'mutations'> & {
  conditions: Condition[]; mutations: Array<AgenticGraphStorageMutationUnit['mutations'][number]>
}
const emptyChanges = (): AgenticGraphStoragePullChanges => ({ documents: [], documentChunks: [], graphSnapshots: [], deletions: [] })
const revision = (entry: KgStorageDeferredRecord): number => entry.childState?.syncRevision ?? (entry.record as KgDocumentRecord).revision
const parentId = (entity: AgenticGraphStorageMutation['entity'], record: { id: string; documentId?: string }): string => {
  if (entity === 'document') return record.id
  if (!record.documentId) throw new Error('Child document identity is missing')
  return record.documentId
}
const stateForRecord = (entity: 'documentChunk' | 'graphSnapshot', record: KgDocumentChunkRecord | KgGraphSnapshotRecord) =>
  readAgenticGraphStorageChildState({ ...record, entity, recordId: record.id, deleted: false })
const deferredEntry = (workspaceId: string, entity: AgenticGraphStorageMutation['entity'],
  record: AgenticGraphStorageMutation['record'] | null, childState: AgenticGraphStorageChildState | null): KgStorageDeferredRecord => {
  const recordId = childState?.recordId ?? record!.id
  return { id: JSON.stringify([workspaceId, entity, recordId, childState ? agenticGraphStorageChildStateKeys(childState)[1] : null]),
    workspaceId, entity, recordId, record, childState }
}
const entryRecordIdentity = (entry: KgStorageDeferredRecord) => {
  if (entry.record) return entry.record
  if (!entry.childState) throw new Error('Retained storage record has no identity')
  return { ...entry.childState, id: entry.recordId }
}

export const validateAgenticGraphStoragePullResponse = (
  response: AgenticGraphStoragePullResponse, workspaceId: string,
): void => {
  if (response.apiVersion !== AGENTIC_OS_STORAGE_SYNC_API_VERSION || response.workspaceId !== workspaceId
    || !response.changes || !['documents', 'documentChunks', 'graphSnapshots', 'deletions']
      .every(key => Array.isArray(response.changes[key as keyof AgenticGraphStoragePullChanges]))) {
    throw new Error('Storage pull protocol or workspace is invalid')
  }
  if (typeof response.pageComplete !== 'boolean' || typeof response.nextCursor !== 'string'
    || !Number.isFinite(Date.parse(response.nextCursor)) || !Number.isSafeInteger(response.serverTimeMs)
    || (response.nextPageCursor !== null && (typeof response.nextPageCursor !== 'string' || !response.nextPageCursor))
    || response.pageComplete === !!response.nextPageCursor) throw new Error('Storage pull cursor is invalid')
  for (const document of response.changes.documents) {
    if (!document || document.workspaceId !== workspaceId || typeof document.id !== 'string' || !document.id.trim()
      || typeof document.canonicalPath !== 'string' || typeof document.contentMd !== 'string'
      || !Number.isSafeInteger(document.revision) || document.revision < 0) throw new Error('Invalid pulled document')
  }
  for (const entity of ['documentChunk', 'graphSnapshot'] as const) {
    for (const record of entity === 'documentChunk' ? response.changes.documentChunks : response.changes.graphSnapshots) {
      if (!record || record.workspaceId !== workspaceId) throw new Error('Invalid pulled child workspace')
      stateForRecord(entity, record)
    }
  }
  for (const deletion of response.changes.deletions) {
    const state = readAgenticGraphStorageChildState(deletion)
    if (!state.deleted || state.workspaceId !== workspaceId) throw new Error('Invalid pulled deletion')
  }
}

const joinedChunks = (chunks: KgDocumentChunkRecord[], documentId: string): string => chunks
  .filter(chunk => chunk.documentId === documentId)
  .sort((a, b) => a.chunkOrder - b.chunkOrder || a.id.localeCompare(b.id)).map(chunk => chunk.markdown).join('\n\n')
const latestGraph = (graphs: KgGraphSnapshotRecord[], documentId: string): KgGraphSnapshotRecord | null => graphs
  .filter(graph => graph.documentId === documentId)
  .reduce<KgGraphSnapshotRecord | null>((latest, graph) => !latest || (graph.syncRevision ?? 0) > (latest.syncRevision ?? 0) ? graph : latest, null)

// Deferred records are a recoverable handoff from cache commit to projection.
// Pending local edits retain remote candidates here; successful projection retires
// only the exact observed records. Reopening or replaying needs no cursor rollback.
export const applyAgenticGraphStoragePullPage = async (args: {
  dbState: AgenticGraphStorageDb; workspaceId: string; changes: AgenticGraphStoragePullChanges;
  signal?: AbortSignal; includeDeferred?: boolean
}) => {
  const { dbState: storage, workspaceId } = args
  const { collections } = storage
  const [pendingRows, deferredRows] = await Promise.all([
    collections.syncOutbox.find({ selector: { workspaceId } }).exec(),
    collections.syncDeferred.find({ selector: { workspaceId } }).exec(),
  ])
  if (Object.values(args.changes).every(rows => rows.length === 0) && (args.includeDeferred === false || !deferredRows.length)) {
    return { changes: emptyChanges(), projection: { documentTexts: [], previousGraphs: [] } as AgenticGraphStoragePullProjection,
      cacheWriteCount: 0, reusedChunkCount: 0, finishProjection: async () => {} }
  }
  const [beforeChunks, beforeGraphs, beforeDocuments] = await Promise.all([
    collections.documentChunks.find({ selector: { workspaceId } }).exec(),
    collections.graphSnapshots.find({ selector: { workspaceId } }).exec(),
    collections.documents.find({ selector: { workspaceId } }).exec(),
  ])
  let pending = pendingRows.map(row => row.toJSON())
  const oldChunks = beforeChunks.map(row => row.toJSON()), oldGraphs = beforeGraphs.map(row => row.toJSON())
  const cacheViews: Record<AgenticGraphStorageMutation['entity'], Map<string, CachedRecord>> = {
    document: new Map(beforeDocuments.map(row => [row.get('id'), row.toJSON()])),
    documentChunk: new Map(oldChunks.map(row => [row.id, row])),
    graphSnapshot: new Map(oldGraphs.map(row => [row.id, row])),
  }
  const storedDeferred = new Map(deferredRows.map(row => [row.get('id'), row.toJSON()]))
  const entries = new Map<string, KgStorageDeferredRecord>(args.includeDeferred === false ? [] : storedDeferred)
  const offer = (entry: KgStorageDeferredRecord) => {
    const old = entries.get(entry.id) ?? storedDeferred.get(entry.id)
    if (old && revision(old) > revision(entry)) return
    if (old?.projection) entry = { ...entry, projection: old.projection }
    if (old && revision(old) === revision(entry) && !recordsEqual(old, entry)) {
      throw new Error('Storage revision has conflicting retained payloads')
    }
    entries.set(entry.id, entry)
  }
  for (const record of args.changes.documents) offer(deferredEntry(workspaceId, 'document', sanitizeDocumentRecord(record), null))
  for (const record of args.changes.documentChunks) {
    const state = stateForRecord('documentChunk', record)
    const cached = oldChunks.find(chunk => chunk.id === record.id)
    if (record.contentReused && (!cached || cached.contentHash !== record.contentHash)) {
      throw new Error('Pulled child refers to unavailable cached content')
    }
    const { contentReused: _reused, ...content } = record
    const materialized = sanitizeDocumentChunkRecord({ ...content,
      markdown: record.contentReused ? cached!.markdown : record.markdown })
    offer(deferredEntry(workspaceId, 'documentChunk', materialized, state))
  }
  for (const record of args.changes.graphSnapshots) offer(deferredEntry(workspaceId, 'graphSnapshot',
    sanitizeGraphSnapshotRecord(record), stateForRecord('graphSnapshot', record)))
  for (const state of args.changes.deletions) offer(deferredEntry(workspaceId, state.entity, null, readAgenticGraphStorageChildState(state)))
  const changes = emptyChanges(), projected = new Map<string, KgStorageDeferredRecord>()
  const textDocuments = new Set<string>(), graphDocuments = new Set<string>()
  const textBasis = new Map<string, string | null>(), graphBasis = new Map<string, KgGraphSnapshotRecord | null>()
  for (const entry of [...storedDeferred.values()].sort((a, b) => revision(a) - revision(b))) {
    const id = parentId(entry.entity, entryRecordIdentity(entry))
    if (entry.projection && 'previousText' in entry.projection && !textBasis.has(id)) textBasis.set(id, entry.projection.previousText ?? null)
    if (entry.projection && 'previousGraph' in entry.projection && !graphBasis.has(id)) graphBasis.set(id, entry.projection.previousGraph ?? null)
  }
  let cacheWriteCount = 0
  for (let entry of [...entries.values()].sort((a, b) => revision(a) - revision(b))) {
    args.signal?.throwIfAborted()
    const record = entryRecordIdentity(entry), documentId = parentId(entry.entity, record)
    const targetKeys = buildAgenticGraphStorageTargetKeys(entry.entity, entry.recordId, record)
    const blockers = pending.filter(row => {
      const mutation = row.payload as unknown as AgenticGraphStorageMutation
      if (!mutation || mutation.workspaceId !== workspaceId) throw new Error('Pending storage mutation identity is invalid')
      return (mutation.entity === entry.entity && agenticGraphStorageTargetsOverlap(targetKeys,
        buildAgenticGraphStorageTargetKeys(mutation.entity, mutation.recordId, mutation.record)))
        || ((mutation.entity === 'document' || entry.entity === 'document')
          && parentId(mutation.entity, mutation.record) === documentId)
    })
    const previousDeferred = storedDeferred.get(entry.id)
    if (entry.entity === 'document') {
      if (!textBasis.has(documentId)) {
        const previous = beforeDocuments.find(row => row.get('id') === documentId)
        textBasis.set(documentId, previous ? previous.get('contentMd') || joinedChunks(oldChunks, documentId) : null)
      }
      entry = { ...entry, projection: { previousText: textBasis.get(documentId)! } }
    } else if (entry.entity === 'documentChunk') {
      if (!textBasis.has(documentId)) textBasis.set(documentId, oldChunks.some(chunk => chunk.documentId === documentId)
        ? joinedChunks(oldChunks, documentId) : beforeDocuments.find(row => row.get('id') === documentId)?.get('contentMd') ?? null)
      entry = { ...entry, projection: { previousText: textBasis.get(documentId)! } }
    } else if (entry.entity === 'graphSnapshot') {
      if (!graphBasis.has(documentId)) graphBasis.set(documentId, latestGraph(oldGraphs, documentId))
      entry = { ...entry, projection: { previousGraph: graphBasis.get(documentId)! } }
    }
    const unit: Unit = { conditions: [
      { collectionName: 'syncOutbox', selector: { workspaceId }, records: pending },
      { collectionName: 'syncDeferred', selector: { id: entry.id }, records: previousDeferred ? [previousDeferred] : [] },
    ], mutations: [] }
    let newestRevision = revision(entry)
    if (entry.childState) {
      const child = await planAgenticGraphStorageChildState(storage, entry.childState)
      unit.conditions.push(...child.conditions); unit.mutations.push(...child.mutations)
      newestRevision = child.newestRevision
    }
    if (!previousDeferred || !recordsEqual(previousDeferred, entry)) {
      unit.mutations.push({ kind: 'upsert', collectionName: 'syncDeferred', record: entry })
    }
    const updatedPending = new Map<string, typeof pending[number]>()
    for (const blocker of blockers.filter(row => row.entity === entry.entity)) {
      const existing = (await collections.syncConflicts.findOne(blocker.id).exec())?.toJSON()
      const candidate: KgStorageConflictCandidateRecord = { id: blocker.id, mutationId: blocker.id, workspaceId,
        entity: entry.entity, recordId: entry.recordId, remoteRecord: entry.record, childState: entry.childState,
        serverRevision: revision(entry), receivedAtMs: existing?.receivedAtMs ?? Date.now() }
      if (!existing || (existing.serverRevision ?? 0) <= revision(entry)) {
        unit.conditions.push({ collectionName: 'syncConflicts', selector: { id: blocker.id }, records: existing ? [existing] : [] })
        if (!recordsEqual(existing, candidate)) unit.mutations.push({ kind: 'upsert', collectionName: 'syncConflicts', record: candidate })
      }
      if (blocker.lastAckStatus !== 'conflict') {
        const retained = { ...blocker, lastAckStatus: 'conflict' as const,
          lastAckMessage: entry.childState?.deleted ? 'The remote child was deleted. Review before restoring or accepting deletion.'
            : 'Remote changes overlap this retained local edit. Review before retrying.', updatedAtMs: Date.now() }
        unit.mutations.push({ kind: 'upsert', collectionName: 'syncOutbox', record: retained })
        updatedPending.set(blocker.id, retained)
      }
    }
    let applicable = blockers.length === 0
    const collectionName = entry.entity === 'document' ? 'documents' : entry.entity === 'documentChunk' ? 'documentChunks' : 'graphSnapshots'
    const cached = (await collections[collectionName].findOne(entry.recordId).exec())?.toJSON()
    unit.conditions.push({ collectionName, selector: { id: entry.recordId }, records: cached ? [cached] : [] } as Condition)
    const cacheView = cacheViews[entry.entity]
    if (cached) cacheView.set(entry.recordId, cached)
    else cacheView.delete(entry.recordId)
    const aliases = [...cacheView.values()].filter(row => row.id !== entry.recordId && agenticGraphStorageTargetsOverlap(targetKeys,
      buildAgenticGraphStorageTargetKeys(entry.entity, row.id, row)))
    const aliasRevision = (row: CachedRecord) => 'documentRevision' in row ? row.documentRevision : row.syncRevision ?? 0
    if (!entry.childState?.deleted && aliases.some(row => aliasRevision(row) > revision(entry))) applicable = false
    let cacheMutation: AgenticGraphStorageMutationUnit['mutations'][number] | null = null
    if (entry.entity === 'document') {
      const document = entry.record as KgDocumentRecord
      if (cached && 'documentRevision' in cached && cached.documentRevision > document.revision) applicable = false
      if (applicable) {
        const local = toAgenticGraphLocalDocumentRecord(document)
        if (!recordsEqual(cached, local)) {
          cacheMutation = { kind: 'upsert', collectionName: 'documents', record: local }
          unit.revisionDocuments = [local]
        }
      }
    } else if (entry.childState?.deleted) {
      const state = entry.childState
      const sameBinding = cached && 'documentId' in cached && cached.documentId === state.documentId
        && (state.entity === 'documentChunk' ? 'chunkKey' in cached && cached.chunkKey === state.chunkKey
          : 'graphRevision' in cached && cached.graphRevision === state.graphRevision)
      if (sameBinding && 'syncRevision' in cached && (cached.syncRevision ?? 0) > state.syncRevision) applicable = false
      if (applicable && sameBinding) cacheMutation = { kind: 'remove', collectionName, id: entry.recordId }
    } else {
      if (newestRevision > revision(entry) || (cached && 'syncRevision' in cached && (cached.syncRevision ?? 0) > revision(entry))) applicable = false
      if (applicable && !recordsEqual(cached, entry.record)) cacheMutation = { kind: 'upsert', collectionName,
        record: entry.record } as AgenticGraphStorageMutationUnit['mutations'][number]
    }
    const removedAliases = applicable ? aliases.filter(row => aliasRevision(row) <= revision(entry)) : []
    for (const alias of removedAliases) {
      unit.conditions.push({ collectionName, selector: { id: alias.id }, records: [alias] } as Condition)
      unit.mutations.push({ kind: 'remove', collectionName, id: alias.id })
    }
    if (cacheMutation) unit.mutations.push(cacheMutation)
    if (!await compareAndCommitAgenticGraphStorageMutationUnit(storage, unit)) throw new Error('Local storage changed during pull; retry from the saved cursor')
    pending = pending.map(row => updatedPending.get(row.id) ?? row)
    storedDeferred.set(entry.id, entry)
    cacheWriteCount += removedAliases.length
    for (const alias of removedAliases) cacheView.delete(alias.id)
    if (cacheMutation) {
      cacheWriteCount += 1
      if (cacheMutation.kind === 'remove') cacheView.delete(entry.recordId)
      else cacheView.set(entry.recordId, cacheMutation.record as CachedRecord)
    }
    if (blockers.length) continue
    projected.set(entry.id, entry)
    if (!applicable) continue
    if (entry.entity === 'document') changes.documents.push(entry.record as KgDocumentRecord)
    else if (entry.entity === 'documentChunk') textDocuments.add(documentId)
    else graphDocuments.add(documentId)
    if (entry.childState?.deleted) changes.deletions.push({ ...entry.childState, deleted: true })
    else if (entry.entity === 'graphSnapshot') changes.graphSnapshots.push(entry.record as KgGraphSnapshotRecord & { syncRevision: number })
    else if (entry.entity === 'documentChunk') changes.documentChunks.push(entry.record as KgDocumentChunkRecord & { syncRevision: number })
  }
  const finalChunks = textDocuments.size || changes.documents.length
    ? (await collections.documentChunks.find({ selector: { workspaceId } }).exec()).map(row => row.toJSON()) : []
  const finalGraphs = graphDocuments.size ? (await collections.graphSnapshots.find({ selector: { workspaceId } }).exec()).map(row => row.toJSON()) : []
  // A newer restored identity must survive an older tombstone, including projection.
  changes.deletions = changes.deletions.filter(state => state.entity !== 'graphSnapshot' || !finalGraphs.some(graph =>
    graph.documentId === state.documentId && graph.graphRevision === state.graphRevision && (graph.syncRevision ?? 0) > state.syncRevision))
  const projection: AgenticGraphStoragePullProjection = {
    documentTexts: [...new Map([
      ...changes.documents.map(document => [document.id, { documentId: document.id,
        text: document.contentMd || joinedChunks(finalChunks, document.id), previousText: textBasis.get(document.id) ?? null }] as const),
      ...[...textDocuments].map(documentId => [documentId, { documentId, text: joinedChunks(finalChunks, documentId),
        previousText: textBasis.get(documentId) ?? null }] as const),
    ]).values()],
    previousGraphs: [...graphDocuments].map(documentId => ({ documentId, record: graphBasis.get(documentId) ?? null })),
  }
  if (!await compareAndCommitAgenticGraphStorageMutationUnit(storage, { mutations: [],
    conditions: [{ collectionName: 'syncOutbox', selector: { workspaceId }, records: pending }] })) {
    throw new Error('Local edits changed before pull projection; retry from the saved cursor')
  }
  const finishProjection = async () => {
    for (const [id, entry] of projected) {
      if (!await compareAndCommitAgenticGraphStorageMutationUnit(storage, {
        conditions: [{ collectionName: 'syncDeferred', selector: { id }, records: [entry] }],
        mutations: [{ kind: 'remove', collectionName: 'syncDeferred', id }],
      })) throw new Error('Retained storage projection changed before completion')
    }
  }
  return { changes, projection, cacheWriteCount, reusedChunkCount: args.changes.documentChunks.filter(chunk => chunk.contentReused).length,
    finishProjection }
}
