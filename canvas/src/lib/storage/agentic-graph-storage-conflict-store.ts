import { toAgenticGraphRemoteDocumentRecord } from '@/lib/storage/agentic-graph-storage-record-mapping'
import type {
  KgDocumentChunkRecord,
  KgDocumentRecord,
  KgGraphSnapshotRecord,
  AgenticGraphStorageMutation,
  AgenticGraphStorageOutboxRecord,
  AgenticGraphStorageChildState,
} from '@/lib/storage/agentic-graph-storage-sync-contract'
import type {
  KgStorageConflictCandidateRecord,
  KgStorageDeferredRecord,
  AgenticGraphStorageDb,
} from '@/lib/storage/agentic-graph-storage-db'
import type { AgenticGraphStorageSyncRunResult } from '@/lib/storage/agentic-graph-storage-client-types'

type ConflictEntity = AgenticGraphStorageMutation['entity']

const normalizeString = (value: unknown): string => String(value || '').trim()
const conflictKey = (entity: string, recordId: string): string => `${entity}\u0000${recordId}`

export const buildAgenticGraphStorageTargetKeys = (
  entity: ConflictEntity,
  recordId: string,
  record: Partial<KgDocumentRecord & KgDocumentChunkRecord & KgGraphSnapshotRecord> | null,
): ReadonlySet<string> => {
  const keys = new Set<string>()
  const safeRecordId = normalizeString(recordId) || normalizeString(record?.id)
  if (safeRecordId) keys.add(conflictKey(entity, `id:${safeRecordId}`))
  if (entity === 'document' && record) {
    const canonicalPath = normalizeString((record as KgDocumentRecord).canonicalPath)
    if (canonicalPath) keys.add(conflictKey(entity, `path:${canonicalPath}`))
  } else if (entity === 'documentChunk' && record) {
    const chunk = record as KgDocumentChunkRecord
    const documentId = normalizeString(chunk.documentId)
    const chunkKey = normalizeString(chunk.chunkKey)
    if (documentId && chunkKey) keys.add(conflictKey(entity, `chunk:${documentId}\u0000${chunkKey}`))
  } else if (entity === 'graphSnapshot' && record) {
    const documentId = normalizeString((record as KgGraphSnapshotRecord).documentId)
    if (documentId) keys.add(conflictKey(entity, `graph:${documentId}\u0000${(record as KgGraphSnapshotRecord).graphRevision}`))
  }
  return keys
}

export const agenticGraphStorageTargetsOverlap = (
  left: ReadonlySet<string>,
  right: ReadonlySet<string>,
): boolean => {
  for (const key of left) {
    if (right.has(key)) return true
  }
  return false
}

export const resolveAgenticGraphStorageParentRecoverySnapshot = (args: {
  mutation: AgenticGraphStorageMutation; pending: AgenticGraphStorageOutboxRecord[];
  candidates: KgStorageConflictCandidateRecord[]; deferred: KgStorageDeferredRecord[]; documents: KgDocumentRecord[];
}) => {
  const { mutation, pending, candidates, deferred, documents } = args
  const first = mutation
  const initialId = first.entity === 'document' ? first.record.id : first.record.documentId
  const initialPath = first.entity === 'document' ? first.record.canonicalPath : documents.find(row => row.id === initialId)?.canonicalPath
  const parentIds = new Set([initialId])
  const remoteRows = [...candidates.filter(row => row.entity === 'document').flatMap(row => row.remoteRecord ? [row.remoteRecord as KgDocumentRecord] : []),
    ...deferred.filter(row => row.entity === 'document').flatMap(row => row.record ? [row.record as KgDocumentRecord] : [])]
  for (const row of [...documents, ...remoteRows]) if (initialPath && row.canonicalPath === initialPath) parentIds.add(row.id)
  const belongs = (row: AgenticGraphStorageOutboxRecord) => {
    const mutation = (row.payload as unknown as AgenticGraphStorageMutation)
    return mutation.entity === 'document' ? parentIds.has(mutation.record.id)
      || (!!initialPath && mutation.record.canonicalPath === initialPath) : parentIds.has(mutation.record.documentId)
  }
  const family = pending.filter(belongs), parents = family.filter(row => row.entity === 'document')
  const children = family.filter(row => row.entity !== 'document')
  if (!children.length) return null
  const authoritative = [...remoteRows, ...documents.filter(row => !parents.some(parent => (parent.payload as unknown as AgenticGraphStorageMutation).record.id === row.id))]
    .filter(row => parentIds.has(row.id)).sort((a, b) => b.revision - a.revision)
  const remote = authoritative[0]
  if (!remote?.deleted) return null
  return { parentIds, family, parents, children, remote }
}

const readServerRevision = (
  entity: ConflictEntity,
  record: AgenticGraphStorageMutation['record'],
): number | null => {
  const value = entity === 'document'
    ? Number((record as KgDocumentRecord).revision)
    : Number((record as KgDocumentChunkRecord | KgGraphSnapshotRecord).syncRevision)
  return Number.isFinite(value) && value >= 0 ? Math.floor(value) : null
}

const readRecordFreshness = (
  entity: ConflictEntity,
  record: AgenticGraphStorageMutation['record'],
): number => {
  const revision = readServerRevision(entity, record)
  if (revision != null) return revision
  const updatedAtMs = Number((record as { updatedAtMs?: unknown }).updatedAtMs)
  return Number.isFinite(updatedAtMs) ? Math.floor(updatedAtMs) : 0
}

const toCandidate = (args: {
  workspaceId: string
  mutationId: string
  entity: ConflictEntity
  recordId: string
  serverRevision: number | null
  record: AgenticGraphStorageMutation['record'] | null
  existing?: KgStorageConflictCandidateRecord | null
  childState?: AgenticGraphStorageChildState | null
}): KgStorageConflictCandidateRecord => {
  const existingRecord = args.existing?.remoteRecord ?? null
  const useIncomingRecord = !!args.record && (
    !existingRecord
    || readRecordFreshness(args.entity, args.record) >= readRecordFreshness(args.entity, existingRecord)
  )
  const remoteRecord = useIncomingRecord ? args.record : existingRecord
  const revisions = [
    args.serverRevision,
    args.existing?.serverRevision,
    remoteRecord ? readServerRevision(args.entity, remoteRecord) : null,
  ].filter((value): value is number => typeof value === 'number' && Number.isFinite(value))
  return {
    id: args.mutationId,
    workspaceId: args.workspaceId,
    mutationId: args.mutationId,
    entity: args.entity,
    recordId: args.recordId,
    serverRevision: revisions.length > 0 ? Math.max(...revisions) : null,
    remoteRecord,
    childState: args.childState ?? args.existing?.childState ?? null,
    receivedAtMs: useIncomingRecord || !args.existing ? Date.now() : args.existing.receivedAtMs,
  }
}

export const recordAgenticGraphStoragePushConflictCandidates = async (args: {
  dbState: AgenticGraphStorageDb
  workspaceId: string
  entries: AgenticGraphStorageSyncRunResult['conflictEntries']
}): Promise<void> => {
  for (const entry of args.entries) {
    const mutationId = normalizeString(entry.mutationId)
    const entity = normalizeString(entry.entity) as ConflictEntity
    const recordId = normalizeString(entry.recordId)
    if (!mutationId || !recordId || !['document', 'documentChunk', 'graphSnapshot'].includes(entity)) continue
    const existing = await args.dbState.collections.syncConflicts.findOne(mutationId).exec()
    await args.dbState.collections.syncConflicts.incrementalUpsert(toCandidate({
      workspaceId: args.workspaceId,
      mutationId,
      entity,
      recordId,
      serverRevision: entry.serverRevision ?? null,
      record: null,
      childState: entry.childState ?? null,
      existing: existing?.toJSON() as KgStorageConflictCandidateRecord | null,
    }))
  }
}

export const needsAgenticGraphStorageConflictCandidateRefresh = async (
  dbState: AgenticGraphStorageDb,
  workspaceId: string,
): Promise<boolean> => {
  const conflicts = await dbState.collections.syncOutbox
    .find({ selector: { workspaceId, lastAckStatus: 'conflict' } })
    .exec()
  for (const row of conflicts) {
    const mutationId = normalizeString(row.get('id'))
    const candidate = mutationId
      ? await dbState.collections.syncConflicts.findOne(mutationId).exec()
      : null
    if (candidate?.get('childState')?.deleted) continue
    const remote = candidate?.get('remoteRecord')
    if (!remote || (readServerRevision(candidate!.get('entity'), remote) ?? -1) < (candidate?.get('serverRevision') ?? 0)) return true
  }
  return false
}

export const readAgenticGraphStorageConflictEntries = async (
  dbState: AgenticGraphStorageDb,
  workspaceId: string,
): Promise<AgenticGraphStorageSyncRunResult['conflictEntries']> => {
  const [allRows, candidateRows, documentRows, deferredRows] = await Promise.all([
    dbState.collections.syncOutbox.find({ selector: { workspaceId } }).exec(),
    dbState.collections.syncConflicts.find({ selector: { workspaceId } }).exec(),
    dbState.collections.documents.find({ selector: { workspaceId } }).exec(),
    dbState.collections.syncDeferred.find({ selector: { workspaceId } }).exec(),
  ])
  const rows = allRows.filter(row => row.get('lastAckStatus') === 'conflict')
  const pending = allRows.map(row => row.toJSON()), candidates = candidateRows.map(row => row.toJSON())
  const documents = documentRows.map(row => toAgenticGraphRemoteDocumentRecord(row.toJSON()))
  const deferred = deferredRows.map(row => row.toJSON())
  const candidateByMutationId = new Map(candidateRows.map(row => [normalizeString(row.get('mutationId')), row]))
  return rows.flatMap(row => {
    const mutation = row.get('payload') as unknown as AgenticGraphStorageMutation | null
    if (!mutation) return []
    const candidate = candidateByMutationId.get(normalizeString(row.get('id')))
    const localRevision = readServerRevision(mutation.entity, mutation.record)
    const recovery = resolveAgenticGraphStorageParentRecoverySnapshot({ mutation, pending, candidates, deferred, documents })
    return [{
      mutationId: normalizeString(row.get('id')),
      entity: mutation.entity,
      recordId: normalizeString(row.get('recordId')),
      canonicalPath: mutation.entity === 'document'
        ? normalizeString((mutation.record as KgDocumentRecord).canonicalPath) || null
        : null,
      localRevision,
      parentRecovery: recovery ? { documentId: recovery.remote.id, parentRevision: recovery.remote.revision, retainedChildCount: recovery.children.length } : null,
      serverRevision: candidate?.get('serverRevision') ?? null,
      childState: candidate?.get('childState') ?? null,
      message: recovery
        ? `${recovery.remote.canonicalPath} was deleted remotely, with ${recovery.children.length} retained child ${recovery.children.length === 1 ? 'edit' : 'edits'}. Restore recovers the document and all retained edits. Discard accepts deletion and removes all retained local changes for this document.`
        : candidate?.get('childState')?.deleted
        ? 'The remote child was deleted. Keep Local restores the reviewed local change; Accept Remote accepts deletion.'
        : normalizeString(row.get('lastAckMessage')) || null,
    }]
  })
}

export const readAgenticGraphStorageConflictCandidate = async (
  dbState: AgenticGraphStorageDb,
  mutationId: string,
): Promise<KgStorageConflictCandidateRecord | null> => {
  const row = await dbState.collections.syncConflicts.findOne(normalizeString(mutationId)).exec()
  return row ? row.toJSON() as KgStorageConflictCandidateRecord : null
}

export const removeAgenticGraphStorageConflictCandidate = async (
  dbState: AgenticGraphStorageDb,
  mutationId: string,
): Promise<void> => {
  const row = await dbState.collections.syncConflicts.findOne(normalizeString(mutationId)).exec()
  await row?.remove()
}

export const readConflictCandidateDocument = (
  candidate: KgStorageConflictCandidateRecord | null,
): KgDocumentRecord | null => candidate?.entity === 'document' && candidate.remoteRecord
  ? candidate.remoteRecord as KgDocumentRecord
  : null

export const readConflictCandidateChunk = (
  candidate: KgStorageConflictCandidateRecord | null,
): KgDocumentChunkRecord | null => candidate?.entity === 'documentChunk' && candidate.remoteRecord
  ? candidate.remoteRecord as KgDocumentChunkRecord
  : null

export const readConflictCandidateGraph = (
  candidate: KgStorageConflictCandidateRecord | null,
): KgGraphSnapshotRecord | null => candidate?.entity === 'graphSnapshot' && candidate.remoteRecord
  ? candidate.remoteRecord as KgGraphSnapshotRecord
  : null
