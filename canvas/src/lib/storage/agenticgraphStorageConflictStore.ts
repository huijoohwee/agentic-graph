import type {
  KgDocumentChunkRecord,
  KgDocumentRecord,
  KgGraphSnapshotRecord,
  KnowgrphStorageMutation,
  KnowgrphStoragePullResponse,
} from '@/lib/storage/knowgrphStorageSyncContract'
import type {
  KgStorageConflictCandidateRecord,
  KnowgrphStorageDb,
} from '@/lib/storage/knowgrphStorageDb'
import type { KnowgrphStorageSyncRunResult } from '@/lib/storage/knowgrphStorageClientTypes'
import { KNOWGRPH_STORAGE_SYNC_BOUNDS } from '@/lib/storage/knowgrphStorageBounds'

type PulledChanges = KnowgrphStoragePullResponse['changes']
type ConflictEntity = KnowgrphStorageMutation['entity']

const normalizeString = (value: unknown): string => String(value || '').trim()
const conflictKey = (entity: string, recordId: string): string => `${entity}\u0000${recordId}`

export const buildKnowgrphStorageTargetKeys = (
  entity: ConflictEntity,
  recordId: string,
  record: KnowgrphStorageMutation['record'] | null,
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
    if (documentId) keys.add(conflictKey(entity, `document:${documentId}`))
  }
  return keys
}

export const knowgrphStorageTargetsOverlap = (
  left: ReadonlySet<string>,
  right: ReadonlySet<string>,
): boolean => {
  for (const key of left) {
    if (right.has(key)) return true
  }
  return false
}

const readServerRevision = (
  entity: ConflictEntity,
  record: KnowgrphStorageMutation['record'],
): number | null => {
  const value = entity === 'document'
    ? Number((record as KgDocumentRecord).revision)
    : entity === 'graphSnapshot'
      ? Number((record as KgGraphSnapshotRecord).graphRevision)
      : Number.NaN
  return Number.isFinite(value) && value >= 0 ? Math.floor(value) : null
}

const readRecordFreshness = (
  entity: ConflictEntity,
  record: KnowgrphStorageMutation['record'],
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
  record: KnowgrphStorageMutation['record'] | null
  existing?: KgStorageConflictCandidateRecord | null
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
    receivedAtMs: useIncomingRecord || !args.existing ? Date.now() : args.existing.receivedAtMs,
  }
}

export const recordKnowgrphStoragePushConflictCandidates = async (args: {
  dbState: KnowgrphStorageDb
  workspaceId: string
  entries: KnowgrphStorageSyncRunResult['conflictEntries']
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
      existing: existing?.toJSON() as KgStorageConflictCandidateRecord | null,
    }))
  }
}

export const needsKnowgrphStorageConflictCandidateRefresh = async (
  dbState: KnowgrphStorageDb,
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
    if (!candidate?.get('remoteRecord')) return true
  }
  return false
}

export const readKnowgrphStorageConflictEntries = async (
  dbState: KnowgrphStorageDb,
  workspaceId: string,
): Promise<KnowgrphStorageSyncRunResult['conflictEntries']> => {
  const rows = await dbState.collections.syncOutbox
    .find({ selector: { workspaceId, lastAckStatus: 'conflict' } })
    .exec()
  const candidates = await dbState.collections.syncConflicts.find({ selector: { workspaceId } }).exec()
  const candidateByMutationId = new Map(candidates.map(row => [normalizeString(row.get('mutationId')), row]))
  return rows.flatMap(row => {
    const mutation = row.get('payload') as unknown as KnowgrphStorageMutation | null
    if (!mutation) return []
    const candidate = candidateByMutationId.get(normalizeString(row.get('id')))
    const localRevision = readServerRevision(mutation.entity, mutation.record)
    return [{
      mutationId: normalizeString(row.get('id')),
      entity: mutation.entity,
      recordId: normalizeString(row.get('recordId')),
      canonicalPath: mutation.entity === 'document'
        ? normalizeString((mutation.record as KgDocumentRecord).canonicalPath) || null
        : null,
      localRevision,
      serverRevision: candidate?.get('serverRevision') ?? null,
      message: normalizeString(row.get('lastAckMessage')) || null,
    }]
  })
}

const readPulledRecordId = (record: { id?: unknown }): string => normalizeString(record.id)

export const partitionPulledKnowgrphStorageChanges = async (args: {
  dbState: KnowgrphStorageDb
  workspaceId: string
  changes: PulledChanges
}): Promise<{ applicableChanges: PulledChanges; retainedCandidateCount: number }> => {
  const rows = await args.dbState.collections.syncOutbox
    .find({ selector: { workspaceId: args.workspaceId } })
    .exec()
  if (rows.length === 0) {
    return { applicableChanges: args.changes, retainedCandidateCount: 0 }
  }

  const unresolvedMutations: Array<{
    mutationId: string
    entity: ConflictEntity
    recordId: string
    targetKeys: ReadonlySet<string>
  }> = []
  for (const row of rows) {
    const lastAckStatus = normalizeString(row.get('lastAckStatus'))
    const attemptCount = Number(row.get('attemptCount') || 0)
    const canRetry = attemptCount < KNOWGRPH_STORAGE_SYNC_BOUNDS.maxRetryAttempts
    if (lastAckStatus !== 'conflict' && (!canRetry || lastAckStatus === 'rejected')) continue
    const mutationId = normalizeString(row.get('id'))
    const entity = normalizeString(row.get('entity')) as ConflictEntity
    const recordId = normalizeString(row.get('recordId'))
    const mutation = row.get('payload') as unknown as KnowgrphStorageMutation | null
    if (!mutationId || !recordId || !mutation || mutation.entity !== entity) continue
    unresolvedMutations.push({
      mutationId,
      entity,
      recordId,
      targetKeys: buildKnowgrphStorageTargetKeys(entity, recordId, mutation.record),
    })
  }

  let retainedCandidateCount = 0
  const retainOrApply = async <RecordType extends KnowgrphStorageMutation['record']>(
    entity: ConflictEntity,
    records: RecordType[],
  ): Promise<RecordType[]> => {
    const applicable: RecordType[] = []
    for (const record of records) {
      const recordId = readPulledRecordId(record)
      const pulledTargetKeys = buildKnowgrphStorageTargetKeys(entity, recordId, record)
      const conflicts = unresolvedMutations.filter(mutation =>
        mutation.entity === entity
        && knowgrphStorageTargetsOverlap(mutation.targetKeys, pulledTargetKeys),
      )
      if (conflicts.length === 0) {
        applicable.push(record)
        continue
      }
      for (const conflict of conflicts) {
        const existing = await args.dbState.collections.syncConflicts.findOne(conflict.mutationId).exec()
        await args.dbState.collections.syncConflicts.incrementalUpsert(toCandidate({
          workspaceId: args.workspaceId,
          mutationId: conflict.mutationId,
          entity,
          recordId,
          serverRevision: readServerRevision(entity, record),
          record,
          existing: existing?.toJSON() as KgStorageConflictCandidateRecord | null,
        }))
        retainedCandidateCount += 1
      }
    }
    return applicable
  }

  return {
    applicableChanges: {
      documents: await retainOrApply('document', args.changes.documents),
      documentChunks: await retainOrApply('documentChunk', args.changes.documentChunks),
      graphSnapshots: await retainOrApply('graphSnapshot', args.changes.graphSnapshots),
    },
    retainedCandidateCount,
  }
}

export const readKnowgrphStorageConflictCandidate = async (
  dbState: KnowgrphStorageDb,
  mutationId: string,
): Promise<KgStorageConflictCandidateRecord | null> => {
  const row = await dbState.collections.syncConflicts.findOne(normalizeString(mutationId)).exec()
  return row ? row.toJSON() as KgStorageConflictCandidateRecord : null
}

export const removeKnowgrphStorageConflictCandidate = async (
  dbState: KnowgrphStorageDb,
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
