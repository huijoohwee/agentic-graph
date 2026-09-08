import type { AgenticGraphStorageChildState, AgenticGraphStorageMutation, AgenticGraphStorageMutationAck } from './contract'
import { normalizeNullableString, normalizeString, type D1DatabaseLike, type D1RunResult } from './db'

type ChildMutation = Extract<AgenticGraphStorageMutation, { entity: 'documentChunk' | 'graphSnapshot' }>
type ChildRow = Record<string, unknown>
export type StorageChildStateRow = {
  sync_revision: number
  workspace_id: string
  entity: ChildMutation['entity']
  document_id: string
  identity_key: string
  record_id: string
  deleted: 0 | 1
  updated_at: string
}
export type StorageChildMutationResult = {
  acknowledgement: AgenticGraphStorageMutationAck
  state: StorageChildStateRow | null
}
export const mapStorageChildStateRow = (state: StorageChildStateRow): AgenticGraphStorageChildState => {
  const updatedAtMs = Date.parse(state.updated_at)
  if (!Number.isSafeInteger(state.sync_revision) || state.sync_revision < 1 || !Number.isFinite(updatedAtMs)
      || (state.deleted !== 0 && state.deleted !== 1)
      || !state.workspace_id || !state.record_id || !state.document_id || !state.identity_key) {
    throw new Error('Invalid child sync state')
  }
  const common = { workspaceId: state.workspace_id, recordId: state.record_id, documentId: state.document_id,
    syncRevision: state.sync_revision, deleted: state.deleted === 1, updatedAtMs }
  if (state.entity === 'documentChunk') return { ...common, entity: state.entity, chunkKey: state.identity_key }
  const graphRevision = Number(state.identity_key)
  if (state.entity !== 'graphSnapshot' || !Number.isSafeInteger(graphRevision) || graphRevision < 0
      || String(graphRevision) !== state.identity_key) throw new Error('Invalid graph sync identity')
  return { ...common, entity: state.entity, graphRevision }
}
type Context = { db: D1DatabaseLike; workspaceId: string; documentIdAliases: Map<string, string> }
const STATEMENT_TIME = "strftime('%Y-%m-%dT%H:%M:%fZ', 'now')"

// Each branch uses its own bounded index lookup. An identity move or changed-ID
// restoration must fence both the physical ID and the requested natural key.
const LATEST_STATE = `SELECT * FROM (
  SELECT * FROM (SELECT * FROM storage_child_state
    WHERE workspace_id = ? AND entity = ? AND record_id = ? ORDER BY sync_revision DESC LIMIT 1)
  UNION ALL
  SELECT * FROM (SELECT * FROM storage_child_state
    WHERE workspace_id = ? AND entity = ? AND document_id = ? AND identity_key = ?
    ORDER BY sync_revision DESC LIMIT 1)
) ORDER BY sync_revision DESC LIMIT 1`
const REVISION_GUARD = `(SELECT sync_revision FROM (${LATEST_STATE})) IS ?`

const row = (result: D1RunResult | undefined): ChildRow | null => {
  if (!result || result.success === false || !Array.isArray(result.results)) {
    throw new Error('Child sync database result is incomplete')
  }
  const first = result.results[0]
  if (first == null) return null
  if (typeof first !== 'object' || Array.isArray(first)) throw new Error('Invalid child sync database row')
  return first as ChildRow
}
const stateRow = (result: D1RunResult | undefined): StorageChildStateRow | null => {
  const value = row(result)
  if (!value) return null
  if (!Number.isSafeInteger(value.sync_revision) || Number(value.sync_revision) < 1
      || !['documentChunk', 'graphSnapshot'].includes(String(value.entity))
      || (value.deleted !== 0 && value.deleted !== 1)
      || !Number.isFinite(Date.parse(String(value.updated_at)))) {
    throw new Error('Invalid child sync state')
  }
  return value as StorageChildStateRow
}
const acknowledge = (mutation: ChildMutation, status: AgenticGraphStorageMutationAck['status'],
  state: StorageChildStateRow | null, message: string | null = null): StorageChildMutationResult => ({
  acknowledgement: { mutationId: mutation.mutationId, recordId: mutation.recordId,
    entity: mutation.entity, status, serverRevision: state?.sync_revision ?? null, message }, state,
})

const jsonValue = (value: unknown): string => {
  if (typeof value === 'string') {
    try { return JSON.stringify(JSON.parse(value)) } catch { return value }
  }
  return JSON.stringify(value ?? null)
}
const fieldsEqual = (existing: ChildRow, columns: string[], values: unknown[]): boolean =>
  columns.every((column, index) => {
    const left = existing[column], right = values[index]
    if (column === 'graph_json' || column === 'layout_json') return jsonValue(left) === jsonValue(right)
    if (column === 'heading') return normalizeNullableString(left) === normalizeNullableString(right)
    return left === right
  })

const describe = (mutation: ChildMutation, workspaceId: string, documentId: string) => {
  if (mutation.entity === 'documentChunk') {
    const value = mutation.record
    return { table: 'document_chunks', keyColumn: 'chunk_key', identityKey: value.chunkKey,
      columns: ['document_id', 'workspace_id', 'chunk_key', 'chunk_order', 'heading', 'markdown', 'token_estimate', 'content_hash'],
      values: [documentId, workspaceId, value.chunkKey, value.chunkOrder, value.heading, value.markdown, value.tokenEstimate, value.contentHash] }
  }
  const value = mutation.record
  return { table: 'graph_snapshots', keyColumn: 'graph_revision', identityKey: String(value.graphRevision),
    columns: ['document_id', 'workspace_id', 'graph_revision', 'graph_hash', 'graph_json', 'layout_json', 'derived_from_document_revision'],
    values: [documentId, workspaceId, value.graphRevision, value.graphHash, JSON.stringify(value.graphJson || {}),
      value.layoutJson == null ? null : JSON.stringify(value.layoutJson), value.derivedFromDocumentRevision] }
}

// This writer implements the new child-revision contract. Its caller must admit
// that sync protocol before effects; legacy graph revisions are not sync revisions.
export const processAgenticGraphStorageChildMutation = async (
  context: Context, mutation: ChildMutation,
): Promise<StorageChildMutationResult> => {
  const { db, workspaceId } = context
  const record = mutation.record
  const recordId = normalizeString(record.id)
  const documentId = context.documentIdAliases.get(normalizeString(record.documentId)) || normalizeString(record.documentId)
  if (!recordId || !documentId || recordId !== mutation.recordId
      || workspaceId !== mutation.workspaceId || workspaceId !== record.workspaceId
      || !['upsert', 'delete'].includes(mutation.op)
      || (mutation.baseRevision !== null && (!Number.isSafeInteger(mutation.baseRevision) || mutation.baseRevision < 1))) {
    return acknowledge(mutation, 'rejected', null, 'Invalid child sync identity or base revision')
  }
  const numericFields = mutation.entity === 'documentChunk'
    ? [mutation.record.chunkOrder, mutation.record.tokenEstimate]
    : [mutation.record.graphRevision, mutation.record.derivedFromDocumentRevision]
  if (numericFields.some(value => !Number.isSafeInteger(value) || value < 0)) {
    return acknowledge(mutation, 'rejected', null, 'Invalid child numeric field')
  }
  if (mutation.entity === 'documentChunk' && !normalizeString(mutation.record.chunkKey)) {
    return acknowledge(mutation, 'rejected', null, 'A semantic chunk key is required')
  }
  if (!db.batch) throw new Error('Child sync requires transactional database batch support')
  const spec = describe(mutation, workspaceId, documentId)
  const stateValues = [workspaceId, mutation.entity, recordId, workspaceId, mutation.entity, documentId, spec.identityKey]
  const readState = () => db.prepare(LATEST_STATE).bind(...stateValues)
  const observed = await db.batch([
    db.prepare(`SELECT * FROM ${spec.table} WHERE id = ? AND workspace_id = ?`).bind(recordId, workspaceId),
    db.prepare(`SELECT * FROM ${spec.table} WHERE workspace_id = ? AND document_id = ? AND ${spec.keyColumn} = ?`)
      .bind(workspaceId, documentId, spec.identityKey),
    readState(),
  ])
  if (observed.length !== 3) throw new Error('Child sync observation is incomplete')
  const byId = row(observed[0]), byKey = row(observed[1]), observedState = stateRow(observed[2])
  if (byId && byKey && byId.id !== byKey.id) {
    return acknowledge(mutation, 'conflict', observedState, 'Child ID and natural key have different owners')
  }
  const existing = byId || byKey
  if (existing && !observedState) throw new Error('Live child has no sync revision')
  if (!existing && observedState?.deleted === 0) throw new Error('Live child sync state has no record')
  const revision = observedState?.sync_revision ?? null
  if (revision !== mutation.baseRevision) {
    return acknowledge(mutation, 'conflict', observedState, 'Child sync revision changed; pull before retrying')
  }
  if (mutation.op === 'delete' && !existing) return acknowledge(mutation, 'applied', observedState)
  if (existing && mutation.op === 'upsert' && fieldsEqual(existing, spec.columns, spec.values)) {
    return acknowledge(mutation, 'applied', observedState)
  }
  const targetId = existing ? String(existing.id) : recordId
  // Parent visibility and the revision are checked in the write statement itself.
  // The earlier observation is advisory; a concurrent writer cannot pass this CAS.
  const parentGuard = 'EXISTS (SELECT 1 FROM documents WHERE id = ? AND workspace_id = ? AND deleted = 0)'
  let statement
  if (mutation.op === 'delete') {
    statement = db.prepare(`DELETE FROM ${spec.table} WHERE id = ? AND workspace_id = ?
      AND ${REVISION_GUARD} RETURNING id`).bind(targetId, workspaceId, ...stateValues, revision)
  } else if (existing) {
    statement = db.prepare(`UPDATE ${spec.table} SET ${spec.columns.map(column => `${column} = ?`).join(', ')},
      updated_at = ${STATEMENT_TIME} WHERE id = ? AND workspace_id = ?
      AND ${REVISION_GUARD} AND ${parentGuard} RETURNING id`)
      .bind(...spec.values, targetId, workspaceId, ...stateValues, revision, documentId, workspaceId)
  } else {
    statement = db.prepare(`INSERT INTO ${spec.table} (id, ${spec.columns.join(', ')}, updated_at)
      SELECT ?, ${spec.columns.map(() => '?').join(', ')}, ${STATEMENT_TIME}
      WHERE ${REVISION_GUARD} AND ${parentGuard}
      AND NOT EXISTS (SELECT 1 FROM ${spec.table} WHERE id = ? OR (document_id = ? AND ${spec.keyColumn} = ?))
      RETURNING id`).bind(recordId, ...spec.values, ...stateValues, revision, documentId, workspaceId,
        recordId, documentId, spec.identityKey)
  }
  // RETURNING supplies only the directly changed ID. The following read observes
  // AFTER-trigger state in the same transaction, before a competitor can replace it.
  const written = await db.batch([statement, readState()])
  if (written.length !== 2) throw new Error('Child sync write result is incomplete')
  const changed = row(written[0]), state = stateRow(written[1])
  if (!changed) return acknowledge(mutation, 'conflict', state, 'Child changed or its parent is unavailable')
  if (!state || state.sync_revision <= (revision ?? 0) || state.record_id !== targetId
      || state.deleted !== (mutation.op === 'delete' ? 1 : 0)) {
    throw new Error('Child sync write did not produce the expected state')
  }
  return acknowledge(mutation, 'applied', state)
}
