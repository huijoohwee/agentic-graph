import {
  hashAgenticGraphStorageContent,
  isAgenticGraphStorageCanonicalPath,
  isAgenticGraphStorageEntityKind,
  type AgenticGraphStorageMutation,
  type AgenticGraphStorageMutationAck,
} from './contract'
import {
  type D1DatabaseLike,
  type DocumentRow,
  execute,
  normalizeNullableString,
  normalizeNumber,
  normalizeString,
  queryFirst,
} from './db'

import { mapStorageChildStateRow, processAgenticGraphStorageChildMutation } from './storageChildMutation'

// Sync visibility uses database statement time; device clocks are not pull cursors.
const STATEMENT_TIME_SQL = "strftime('%Y-%m-%dT%H:%M:%fZ', 'now')"

type MutationContext = {
  db: D1DatabaseLike
  workspaceId: string
  nowIso: string
  documentIdAliases: Map<string, string>
}

const acknowledgeConflict = (
  mutation: AgenticGraphStorageMutation,
  serverRevision: number | null,
  message: string,
): AgenticGraphStorageMutationAck => ({
  mutationId: mutation.mutationId,
  recordId: mutation.recordId,
  entity: mutation.entity,
  status: 'conflict',
  serverRevision,
  message,
})

export const acknowledgeRejected = (
  mutation: AgenticGraphStorageMutation,
  message: string,
): AgenticGraphStorageMutationAck => ({
  mutationId: mutation.mutationId,
  recordId: mutation.recordId,
  entity: mutation.entity,
  status: 'rejected',
  serverRevision: null,
  message,
})

const acknowledgeApplied = (
  mutation: AgenticGraphStorageMutation,
  serverRevision: number | null,
): AgenticGraphStorageMutationAck => ({
  mutationId: mutation.mutationId,
  recordId: mutation.recordId,
  entity: mutation.entity,
  status: 'applied',
  serverRevision,
  message: null,
})

const nullableStringsEqual = (left: unknown, right: unknown): boolean =>
  normalizeNullableString(left) === normalizeNullableString(right)

export const validateAgenticGraphStorageMutation = (
  workspaceId: string,
  mutation: AgenticGraphStorageMutation,
): string | null => {
  if (normalizeString(mutation.workspaceId) !== workspaceId) {
    return 'mutation workspaceId does not match request workspaceId'
  }
  const recordWorkspaceId = normalizeString((mutation.record as { workspaceId?: unknown }).workspaceId)
  if (recordWorkspaceId !== workspaceId) {
    return 'mutation record workspaceId does not match request workspaceId'
  }
  if (!isAgenticGraphStorageEntityKind(mutation.entity)) return 'mutation entity is not supported'
  if (!normalizeString(mutation.mutationId) || !normalizeString(mutation.recordId)) {
    return 'mutationId and recordId are required'
  }
  if (mutation.entity === 'document') {
    if (!isAgenticGraphStorageCanonicalPath(mutation.record.canonicalPath)) {
      return 'document canonicalPath must be a non-empty workspace-relative path of at most 1024 characters'
    }
    if (!normalizeString(mutation.record.contentHash)) return 'document Content_Hash is required'
    if (mutation.record.contentHash !== hashAgenticGraphStorageContent(mutation.record.contentMd)) {
      return 'document Content_Hash does not match document content'
    }
  }
  if (mutation.entity === 'documentChunk') {
    const chunkKey = normalizeString(mutation.record.chunkKey)
    if (!chunkKey || /^\d+(?::|-)\d+$/.test(chunkKey)) {
      return 'document chunk requires a semantic chunkKey'
    }
    if (!normalizeString(mutation.record.contentHash)) return 'document chunk Content_Hash is required'
    if (mutation.record.contentHash !== hashAgenticGraphStorageContent(mutation.record.markdown)) {
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
  record: Extract<AgenticGraphStorageMutation, { entity: 'document' }>['record'],
  revision: number,
  deleted: boolean,
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
)

const processDocumentMutation = async (
  context: MutationContext,
  mutation: Extract<AgenticGraphStorageMutation, { entity: 'document' }>,
): Promise<AgenticGraphStorageMutationAck> => {
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
    String(existing.content_md ?? '') !== record.contentMd
    || normalizeString(existing.content_hash) !== record.contentHash
    || Number(existing.deleted || 0) !== (nextDeleted ? 1 : 0)
  )
  const nextRevision = existingRevision != null && contentChanged && requestedRevision <= existingRevision
    ? existingRevision + 1
    : Math.max(requestedRevision, existingRevision == null ? 1 : existingRevision)
  if (existing && documentFieldsEqual(existing, record, nextRevision, nextDeleted)) {
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
  ]
  if (existing) {
    await execute(
      db,
      `UPDATE documents SET
         canonical_path = ?, title = ?, doc_type = ?, lang = ?, graph_id = ?, source_kind = ?,
         content_md = ?, content_hash = ?, parser_version = ?, revision = ?, deleted = ?, updated_at = ${STATEMENT_TIME_SQL}
       WHERE id = ? AND workspace_id = ?`,
      [...values, targetDocumentId, workspaceId],
    )
  } else {
    await execute(
      db,
      `INSERT INTO documents (
         id, workspace_id, canonical_path, title, doc_type, lang, graph_id, source_kind,
         content_md, content_hash, parser_version, revision, deleted, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ${STATEMENT_TIME_SQL})
       ON CONFLICT(workspace_id, canonical_path) DO UPDATE SET
         title = excluded.title, doc_type = excluded.doc_type, lang = excluded.lang,
         graph_id = excluded.graph_id, source_kind = excluded.source_kind,
         content_md = excluded.content_md, content_hash = excluded.content_hash,
         parser_version = excluded.parser_version, revision = excluded.revision,
         deleted = excluded.deleted, updated_at = excluded.updated_at`,
      [record.id, workspaceId, ...values, nowIso],
    )
  }
  return acknowledgeApplied(mutation, nextRevision)
}

export const processAgenticGraphStorageMutation = async (
  context: MutationContext,
  mutation: AgenticGraphStorageMutation,
): Promise<AgenticGraphStorageMutationAck> => {
  if (mutation.entity === 'document') return processDocumentMutation(context, mutation)
  if (mutation.entity === 'documentChunk' || mutation.entity === 'graphSnapshot') {
    const result = await processAgenticGraphStorageChildMutation(context, mutation)
    return { ...result.acknowledgement, childState: result.state ? mapStorageChildStateRow(result.state) : null }
  }
  return acknowledgeRejected(mutation, 'unsupported mutation entity')
}
