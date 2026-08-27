import {
  hashKnowgrphStorageContent,
  isKnowgrphStorageCanonicalPath,
  isKnowgrphStorageEntityKind,
  type KnowgrphStorageMutation,
  type KnowgrphStorageMutationAck,
} from './contract'
import {
  type D1DatabaseLike,
  type DocumentChunkRow,
  type DocumentRow,
  type GraphSnapshotRow,
  execute,
  isoFromMs,
  normalizeNullableString,
  normalizeNumber,
  normalizeString,
  queryFirst,
} from './db'

type MutationContext = {
  db: D1DatabaseLike
  workspaceId: string
  nowIso: string
  documentIdAliases: Map<string, string>
}

const acknowledgeConflict = (
  mutation: KnowgrphStorageMutation,
  serverRevision: number | null,
  message: string,
): KnowgrphStorageMutationAck => ({
  mutationId: mutation.mutationId,
  recordId: mutation.recordId,
  entity: mutation.entity,
  status: 'conflict',
  serverRevision,
  message,
})

export const acknowledgeRejected = (
  mutation: KnowgrphStorageMutation,
  message: string,
): KnowgrphStorageMutationAck => ({
  mutationId: mutation.mutationId,
  recordId: mutation.recordId,
  entity: mutation.entity,
  status: 'rejected',
  serverRevision: null,
  message,
})

const acknowledgeApplied = (
  mutation: KnowgrphStorageMutation,
  serverRevision: number | null,
): KnowgrphStorageMutationAck => ({
  mutationId: mutation.mutationId,
  recordId: mutation.recordId,
  entity: mutation.entity,
  status: 'applied',
  serverRevision,
  message: null,
})

const nullableStringsEqual = (left: unknown, right: unknown): boolean =>
  normalizeNullableString(left) === normalizeNullableString(right)

const jsonObjectsEqual = (left: unknown, right: unknown): boolean => {
  const normalize = (value: unknown): string => {
    if (typeof value === 'string') {
      try {
        return JSON.stringify(JSON.parse(value))
      } catch {
        return value
      }
    }
    return JSON.stringify(value ?? null)
  }
  return normalize(left) === normalize(right)
}

export const validateKnowgrphStorageMutation = (
  workspaceId: string,
  mutation: KnowgrphStorageMutation,
): string | null => {
  if (normalizeString(mutation.workspaceId) !== workspaceId) {
    return 'mutation workspaceId does not match request workspaceId'
  }
  const recordWorkspaceId = normalizeString((mutation.record as { workspaceId?: unknown }).workspaceId)
  if (recordWorkspaceId !== workspaceId) {
    return 'mutation record workspaceId does not match request workspaceId'
  }
  if (!isKnowgrphStorageEntityKind(mutation.entity)) return 'mutation entity is not supported'
  if (!normalizeString(mutation.mutationId) || !normalizeString(mutation.recordId)) {
    return 'mutationId and recordId are required'
  }
  if (mutation.entity === 'document') {
    if (!isKnowgrphStorageCanonicalPath(mutation.record.canonicalPath)) {
      return 'document canonicalPath must be a non-empty workspace-relative path of at most 1024 characters'
    }
    if (!normalizeString(mutation.record.contentHash)) return 'document Content_Hash is required'
    if (mutation.record.contentHash !== hashKnowgrphStorageContent(mutation.record.contentMd)) {
      return 'document Content_Hash does not match document content'
    }
  }
  if (mutation.entity === 'documentChunk') {
    const chunkKey = normalizeString(mutation.record.chunkKey)
    if (!chunkKey || /^\d+(?::|-)\d+$/.test(chunkKey)) {
      return 'document chunk requires a semantic chunkKey'
    }
    if (!normalizeString(mutation.record.contentHash)) return 'document chunk Content_Hash is required'
    if (mutation.record.contentHash !== hashKnowgrphStorageContent(mutation.record.markdown)) {
      return 'document chunk Content_Hash does not match chunk content'
    }
  }
  if (mutation.entity === 'graphSnapshot' && !normalizeString(mutation.record.graphHash)) {
    return 'graph snapshot graphHash is required'
  }
  return null
}

const documentFieldsEqual = (
  existing: DocumentRow,
  record: Extract<KnowgrphStorageMutation, { entity: 'document' }>['record'],
  revision: number,
  deleted: boolean,
  updatedAt: string,
): boolean => (
  normalizeString(existing.canonical_path) === normalizeString(record.canonicalPath)
  && nullableStringsEqual(existing.title, record.title)
  && nullableStringsEqual(existing.doc_type, record.docType)
  && nullableStringsEqual(existing.lang, record.lang)
  && nullableStringsEqual(existing.graph_id, record.graphId)
  && normalizeString(existing.source_kind) === record.sourceKind
  && String(existing.content_md ?? '') === record.contentMd
  && normalizeString(existing.content_hash) === record.contentHash
  && normalizeString(existing.parser_version) === record.parserVersion
  && normalizeNumber(existing.revision) === revision
  && Number(existing.deleted || 0) === (deleted ? 1 : 0)
  && normalizeString(existing.updated_at) === updatedAt
)

const processDocumentMutation = async (
  context: MutationContext,
  mutation: Extract<KnowgrphStorageMutation, { entity: 'document' }>,
): Promise<KnowgrphStorageMutationAck> => {
  const { db, workspaceId, nowIso, documentIdAliases } = context
  const record = mutation.record
  const existingById = await queryFirst<DocumentRow>(
    db,
    'SELECT * FROM documents WHERE id = ? AND workspace_id = ?',
    [record.id, workspaceId],
  )
  const existingByPath = await queryFirst<DocumentRow>(
    db,
    'SELECT * FROM documents WHERE workspace_id = ? AND canonical_path = ?',
    [workspaceId, record.canonicalPath],
  )
  const existingId = normalizeString(existingById?.id)
  const existingPathId = normalizeString(existingByPath?.id)
  if (existingId && existingPathId && existingId !== existingPathId) {
    return acknowledgeConflict(
      mutation,
      Math.max(normalizeNumber(existingById?.revision), normalizeNumber(existingByPath?.revision)),
      `document canonical path is already owned by ${existingPathId}`,
    )
  }
  const existing = existingById || existingByPath
  const targetDocumentId = normalizeString(existing?.id) || record.id
  if (targetDocumentId !== record.id) documentIdAliases.set(record.id, targetDocumentId)
  const existingRevision = existing ? normalizeNumber(existing.revision) : null
  if (
    mutation.baseRevision != null
    && existingRevision != null
    && existingRevision !== mutation.baseRevision
  ) {
    return acknowledgeConflict(
      mutation,
      existingRevision,
      `document revision conflict: expected ${mutation.baseRevision}, found ${existingRevision}`,
    )
  }
  const requestedRevision = normalizeNumber(record.revision)
  const nextDeleted = record.deleted || mutation.op === 'delete'
  const contentChanged = !!existing && (
    normalizeString(existing.content_hash) !== record.contentHash
    || Number(existing.deleted || 0) !== (nextDeleted ? 1 : 0)
  )
  const nextRevision = existingRevision != null && contentChanged && requestedRevision <= existingRevision
    ? existingRevision + 1
    : Math.max(requestedRevision, existingRevision == null ? 1 : existingRevision)
  const updatedAt = isoFromMs(record.updatedAtMs, nowIso)
  if (existing && documentFieldsEqual(existing, record, nextRevision, nextDeleted, updatedAt)) {
    return acknowledgeApplied(mutation, nextRevision)
  }
  const values = [
    record.canonicalPath,
    record.title,
    record.docType,
    record.lang,
    record.graphId,
    record.sourceKind,
    record.contentMd,
    record.contentHash,
    record.parserVersion,
    nextRevision,
    nextDeleted ? 1 : 0,
    updatedAt,
  ]
  if (existing) {
    await execute(
      db,
      `UPDATE documents SET
         canonical_path = ?, title = ?, doc_type = ?, lang = ?, graph_id = ?, source_kind = ?,
         content_md = ?, content_hash = ?, parser_version = ?, revision = ?, deleted = ?, updated_at = ?
       WHERE id = ? AND workspace_id = ?`,
      [...values, targetDocumentId, workspaceId],
    )
  } else {
    await execute(
      db,
      `INSERT INTO documents (
         id, workspace_id, canonical_path, title, doc_type, lang, graph_id, source_kind,
         content_md, content_hash, parser_version, revision, deleted, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(workspace_id, canonical_path) DO UPDATE SET
         title = excluded.title, doc_type = excluded.doc_type, lang = excluded.lang,
         graph_id = excluded.graph_id, source_kind = excluded.source_kind,
         content_md = excluded.content_md, content_hash = excluded.content_hash,
         parser_version = excluded.parser_version, revision = excluded.revision,
         deleted = excluded.deleted, updated_at = excluded.updated_at`,
      [record.id, workspaceId, ...values, updatedAt],
    )
  }
  return acknowledgeApplied(mutation, nextRevision)
}

const chunkFieldsEqual = (
  existing: DocumentChunkRow,
  record: Extract<KnowgrphStorageMutation, { entity: 'documentChunk' }>['record'],
  documentId: string,
  updatedAt: string,
): boolean => (
  normalizeString(existing.document_id) === documentId
  && normalizeString(existing.workspace_id) === record.workspaceId
  && normalizeString(existing.chunk_key) === record.chunkKey
  && normalizeNumber(existing.chunk_order) === normalizeNumber(record.chunkOrder)
  && nullableStringsEqual(existing.heading, record.heading)
  && String(existing.markdown ?? '') === record.markdown
  && normalizeNumber(existing.token_estimate) === normalizeNumber(record.tokenEstimate)
  && normalizeString(existing.content_hash) === record.contentHash
  && normalizeString(existing.updated_at) === updatedAt
)

const processDocumentChunkMutation = async (
  context: MutationContext,
  mutation: Extract<KnowgrphStorageMutation, { entity: 'documentChunk' }>,
): Promise<KnowgrphStorageMutationAck> => {
  const { db, workspaceId, nowIso, documentIdAliases } = context
  const record = mutation.record
  const documentId = documentIdAliases.get(normalizeString(record.documentId)) || record.documentId
  const existingById = await queryFirst<DocumentChunkRow>(
    db,
    'SELECT * FROM document_chunks WHERE id = ? AND workspace_id = ?',
    [record.id, workspaceId],
  )
  const existingByKey = await queryFirst<DocumentChunkRow>(
    db,
    'SELECT * FROM document_chunks WHERE document_id = ? AND chunk_key = ?',
    [documentId, record.chunkKey],
  )
  const existing = existingById || existingByKey
  const targetId = normalizeString(existing?.id) || record.id
  if (mutation.op === 'delete') {
    if (existing) {
      await execute(db, 'DELETE FROM document_chunks WHERE id = ? AND workspace_id = ?', [targetId, workspaceId])
    }
    return acknowledgeApplied(mutation, null)
  }
  const updatedAt = isoFromMs(record.updatedAtMs, nowIso)
  if (existing && chunkFieldsEqual(existing, record, documentId, updatedAt)) {
    return acknowledgeApplied(mutation, null)
  }
  const values = [
    documentId,
    workspaceId,
    record.chunkKey,
    normalizeNumber(record.chunkOrder),
    record.heading,
    record.markdown,
    normalizeNumber(record.tokenEstimate),
    record.contentHash,
    updatedAt,
  ]
  if (existing) {
    await execute(
      db,
      `UPDATE document_chunks SET
         document_id = ?, workspace_id = ?, chunk_key = ?, chunk_order = ?, heading = ?,
         markdown = ?, token_estimate = ?, content_hash = ?, updated_at = ?
       WHERE id = ? AND workspace_id = ?`,
      [...values, targetId, workspaceId],
    )
  } else {
    await execute(
      db,
      `INSERT INTO document_chunks (
         id, document_id, workspace_id, chunk_key, chunk_order, heading, markdown,
         token_estimate, content_hash, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [record.id, ...values],
    )
  }
  return acknowledgeApplied(mutation, null)
}

const graphFieldsEqual = (
  existing: GraphSnapshotRow,
  record: Extract<KnowgrphStorageMutation, { entity: 'graphSnapshot' }>['record'],
  documentId: string,
  updatedAt: string,
): boolean => (
  normalizeString(existing.document_id) === documentId
  && normalizeString(existing.workspace_id) === record.workspaceId
  && normalizeNumber(existing.graph_revision) === normalizeNumber(record.graphRevision)
  && normalizeString(existing.graph_hash) === record.graphHash
  && jsonObjectsEqual(existing.graph_json, record.graphJson)
  && jsonObjectsEqual(existing.layout_json, record.layoutJson)
  && normalizeNumber(existing.derived_from_document_revision) === normalizeNumber(record.derivedFromDocumentRevision)
  && normalizeString(existing.updated_at) === updatedAt
)

const processGraphSnapshotMutation = async (
  context: MutationContext,
  mutation: Extract<KnowgrphStorageMutation, { entity: 'graphSnapshot' }>,
): Promise<KnowgrphStorageMutationAck> => {
  const { db, workspaceId, nowIso, documentIdAliases } = context
  const record = mutation.record
  const documentId = documentIdAliases.get(normalizeString(record.documentId)) || record.documentId
  const existingById = await queryFirst<GraphSnapshotRow>(
    db,
    'SELECT * FROM graph_snapshots WHERE id = ? AND workspace_id = ?',
    [record.id, workspaceId],
  )
  const latest = await queryFirst<{ graph_revision: number }>(
    db,
    'SELECT MAX(graph_revision) AS graph_revision FROM graph_snapshots WHERE document_id = ? AND workspace_id = ?',
    [documentId, workspaceId],
  )
  const serverRevision = latest?.graph_revision == null ? null : normalizeNumber(latest.graph_revision)
  if (
    mutation.baseRevision != null
    && serverRevision != null
    && serverRevision !== mutation.baseRevision
  ) {
    return acknowledgeConflict(
      mutation,
      serverRevision,
      `graph snapshot revision conflict: expected ${mutation.baseRevision}, found ${serverRevision}`,
    )
  }
  if (mutation.op === 'delete') {
    if (existingById) {
      await execute(db, 'DELETE FROM graph_snapshots WHERE id = ? AND workspace_id = ?', [record.id, workspaceId])
    }
    return acknowledgeApplied(mutation, serverRevision)
  }
  const updatedAt = isoFromMs(record.updatedAtMs, nowIso)
  if (existingById && graphFieldsEqual(existingById, record, documentId, updatedAt)) {
    return acknowledgeApplied(mutation, normalizeNumber(record.graphRevision))
  }
  const values = [
    documentId,
    workspaceId,
    normalizeNumber(record.graphRevision),
    record.graphHash,
    JSON.stringify(record.graphJson || {}),
    record.layoutJson == null ? null : JSON.stringify(record.layoutJson),
    normalizeNumber(record.derivedFromDocumentRevision),
    updatedAt,
  ]
  if (existingById) {
    await execute(
      db,
      `UPDATE graph_snapshots SET
         document_id = ?, workspace_id = ?, graph_revision = ?, graph_hash = ?,
         graph_json = ?, layout_json = ?, derived_from_document_revision = ?, updated_at = ?
       WHERE id = ? AND workspace_id = ?`,
      [...values, record.id, workspaceId],
    )
  } else {
    await execute(
      db,
      `INSERT INTO graph_snapshots (
         id, document_id, workspace_id, graph_revision, graph_hash, graph_json,
         layout_json, derived_from_document_revision, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [record.id, ...values],
    )
  }
  return acknowledgeApplied(mutation, normalizeNumber(record.graphRevision))
}

export const processKnowgrphStorageMutation = async (
  context: MutationContext,
  mutation: KnowgrphStorageMutation,
): Promise<KnowgrphStorageMutationAck> => {
  if (mutation.entity === 'document') return processDocumentMutation(context, mutation)
  if (mutation.entity === 'documentChunk') return processDocumentChunkMutation(context, mutation)
  if (mutation.entity === 'graphSnapshot') return processGraphSnapshotMutation(context, mutation)
  return acknowledgeRejected(mutation, 'unsupported mutation entity')
}
