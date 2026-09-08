import type { AgenticGraphStorageChildState, AgenticGraphStorageMutation, AgenticGraphStorageMutationAck } from '@/lib/storage/agentic-graph-storage-sync-contract'
import type { AgenticGraphStorageDb, AgenticGraphStorageMutationUnit, AgenticGraphStorageRecordMap } from '@/lib/storage/agentic-graph-storage-db'
import type { PersistedCollectionAtomicCondition } from '@/lib/storage/persistedCollectionStore'

export type AgenticGraphStorageChildStateUnit = {
  conditions: Array<PersistedCollectionAtomicCondition<AgenticGraphStorageRecordMap>>
  mutations: Array<AgenticGraphStorageMutationUnit['mutations'][number]>
  newestRevision: number
}

export const readAgenticGraphStorageChildState = (value: unknown): AgenticGraphStorageChildState => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid child sync state')
  const state = value as Record<string, unknown>
  for (const field of ['workspaceId', 'recordId', 'documentId']) {
    if (typeof state[field] !== 'string' || !(state[field] as string).trim()) throw new Error('Invalid child sync identity')
  }
  if (!Number.isSafeInteger(state.syncRevision) || Number(state.syncRevision) < 1
    || !Number.isSafeInteger(state.updatedAtMs) || Number(state.updatedAtMs) < 0
    || typeof state.deleted !== 'boolean') throw new Error('Invalid child sync revision')
  const common = { workspaceId: state.workspaceId as string, recordId: state.recordId as string,
    documentId: state.documentId as string, syncRevision: state.syncRevision as number,
    updatedAtMs: state.updatedAtMs as number, deleted: state.deleted }
  if (state.entity === 'documentChunk' && typeof state.chunkKey === 'string' && state.chunkKey.trim()) {
    return { ...common, entity: 'documentChunk', chunkKey: state.chunkKey }
  }
  if (state.entity === 'graphSnapshot' && Number.isSafeInteger(state.graphRevision) && Number(state.graphRevision) >= 0) {
    return { ...common, entity: 'graphSnapshot', graphRevision: state.graphRevision as number }
  }
  throw new Error('Invalid child sync natural identity')
}

export const agenticGraphStorageChildStateKeys = (state: Pick<AgenticGraphStorageChildState, 'workspaceId' | 'recordId' | 'documentId'>
  & ({ entity: 'documentChunk'; chunkKey: string } | { entity: 'graphSnapshot'; graphRevision: number })): [string, string] => [
  JSON.stringify([state.workspaceId, state.entity, 'record', state.recordId]),
  JSON.stringify([state.workspaceId, state.entity, 'natural', state.documentId,
    state.entity === 'documentChunk' ? state.chunkKey : state.graphRevision]),
]

export const readAgenticGraphStorageAcknowledgedChildState = (
  mutation: AgenticGraphStorageMutation,
  acknowledgement: AgenticGraphStorageMutationAck,
): AgenticGraphStorageChildState | null => {
  const revision = acknowledgement.serverRevision
  if (revision !== null && (!Number.isSafeInteger(revision) || revision < 0)) {
    throw new Error('Invalid storage acknowledgement revision')
  }
  if (mutation.entity === 'document') {
    if (acknowledgement.childState != null) throw new Error('Document acknowledgement contains child state')
    return null
  }
  if (acknowledgement.childState == null) {
    if (revision !== null || (acknowledgement.status === 'applied'
      && (mutation.op !== 'delete' || mutation.baseRevision !== null))) {
      throw new Error('Child acknowledgement is missing authoritative state')
    }
    return null
  }
  const state = readAgenticGraphStorageChildState(acknowledgement.childState)
  if (state.entity !== mutation.entity || state.workspaceId !== mutation.workspaceId || state.syncRevision !== revision) {
    throw new Error('Child acknowledgement state does not match the sent mutation')
  }
  if (acknowledgement.status === 'applied' && (state.deleted !== (mutation.op === 'delete')
    || (mutation.op === 'upsert' && (state.entity === 'documentChunk' && mutation.entity === 'documentChunk'
      ? state.chunkKey !== mutation.record.chunkKey
      : state.entity === 'graphSnapshot' && mutation.entity === 'graphSnapshot'
        && state.graphRevision !== mutation.record.graphRevision)))) {
    throw new Error('Applied child acknowledgement contradicts the sent operation')
  }
  return state
}

// Two directly addressed records preserve both physical moves and changed-ID
// restoration, without scanning historical state or retaining payload copies.
export const planAgenticGraphStorageChildState = async (
  storage: AgenticGraphStorageDb,
  incoming: AgenticGraphStorageChildState,
): Promise<AgenticGraphStorageChildStateUnit> => {
  const state = readAgenticGraphStorageChildState(incoming)
  const ids = agenticGraphStorageChildStateKeys(state)
  const rows = await Promise.all(ids.map(id => storage.collections.syncChildState.findOne(id).exec()))
  const unit: AgenticGraphStorageChildStateUnit = { conditions: [], mutations: [], newestRevision: state.syncRevision }
  for (let index = 0; index < ids.length; index += 1) {
    const id = ids[index]!, existing = rows[index]?.toJSON()
    unit.conditions.push({ collectionName: 'syncChildState', selector: { id }, records: existing ? [existing] : [] })
    if (existing) {
      const known = readAgenticGraphStorageChildState(existing)
      if (existing.id !== id || !agenticGraphStorageChildStateKeys(known).includes(id)) throw new Error('Child state binding is corrupt')
      unit.newestRevision = Math.max(unit.newestRevision, known.syncRevision)
      if (known.syncRevision === state.syncRevision && JSON.stringify(known) !== JSON.stringify(state)) {
        throw new Error('Child sync revision was reused for different state')
      }
      if (known.syncRevision >= state.syncRevision) continue
    }
    unit.mutations.push({ kind: 'upsert', collectionName: 'syncChildState', record: { id, ...state } })
  }
  return unit
}

export const planAgenticGraphStorageAcknowledgedChild = async (
  storage: AgenticGraphStorageDb,
  mutation: AgenticGraphStorageMutation,
  state: AgenticGraphStorageChildState | null,
): Promise<AgenticGraphStorageChildStateUnit> => {
  if (mutation.entity === 'document' || (state && (state.entity !== mutation.entity || state.workspaceId !== mutation.workspaceId))) {
    throw new Error('Child acknowledgement mutation identity is invalid')
  }
  const unit: AgenticGraphStorageChildStateUnit = state ? await planAgenticGraphStorageChildState(storage, state)
    : { conditions: [], mutations: [], newestRevision: 0 }
  if (!state) {
    if (mutation.op !== 'delete' || mutation.baseRevision !== null) throw new Error('Child acknowledgement state is required')
    const identity = { workspaceId: mutation.workspaceId, recordId: mutation.recordId, documentId: mutation.record.documentId }
    const keys = agenticGraphStorageChildStateKeys(mutation.entity === 'documentChunk'
      ? { ...identity, entity: mutation.entity, chunkKey: mutation.record.chunkKey }
      : { ...identity, entity: mutation.entity, graphRevision: mutation.record.graphRevision })
    for (const id of keys) {
      const row = (await storage.collections.syncChildState.findOne(id).exec())?.toJSON()
      if (row) { readAgenticGraphStorageChildState(row); return unit }
      unit.conditions.push({ collectionName: 'syncChildState', selector: { id }, records: [] })
    }
  } else if (state.recordId !== mutation.recordId || state.documentId !== mutation.record.documentId
    || unit.newestRevision > state.syncRevision) return unit
  const collectionName = mutation.entity === 'documentChunk' ? 'documentChunks' : 'graphSnapshots'
  const row = await storage.collections[collectionName].findOne(mutation.recordId).exec()
  if (!row) return unit
  const cached = row.toJSON()
  if (cached.syncRevision != null && (!Number.isSafeInteger(cached.syncRevision) || cached.syncRevision < 1)) {
    throw new Error('Cached child sync revision is invalid')
  }
  if ((cached.syncRevision ?? 0) > (state?.syncRevision ?? 0)) return unit
  const payload = (value: object) => {
    const { updatedAtMs: _time, syncRevision: _revision, contentReused: _reuse, ...record } = value as Record<string, unknown>
    return JSON.stringify(record, (_key, child) => child && typeof child === 'object' && !Array.isArray(child)
      ? Object.fromEntries(Object.keys(child).sort().map(key => [key, child[key]])) : child)
  }
  if (payload(cached) !== payload(mutation.record)) return unit
  unit.conditions.push({ collectionName, selector: { id: cached.id }, records: [cached] } as PersistedCollectionAtomicCondition<AgenticGraphStorageRecordMap>)
  if (!state || state.deleted) unit.mutations.push({ kind: 'remove', collectionName, id: cached.id })
  else if (cached.syncRevision !== state.syncRevision) {
    unit.mutations.push({ kind: 'upsert', collectionName, record: { ...cached, syncRevision: state.syncRevision } } as AgenticGraphStorageMutationUnit['mutations'][number])
  }
  return unit
}
