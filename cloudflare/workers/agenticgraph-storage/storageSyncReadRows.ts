import {
  normalizeNullableString,
  normalizeNumber,
  queryAll,
  queryFirst,
  type D1DatabaseLike,
  type DocumentChunkRow,
  type DocumentRow,
  type GraphSnapshotRow,
} from './db'

export type KnowgrphStorageSyncRowLimitReason = 'row_count' | 'stored_result_bytes'
type AggregateRow = { row_count: number; stored_bytes: number }

const DOCUMENT_BYTES_SQL = `(
  coalesce(length(cast(id as blob)), 0) + coalesce(length(cast(workspace_id as blob)), 0)
  + coalesce(length(cast(canonical_path as blob)), 0) + coalesce(length(cast(title as blob)), 0)
  + coalesce(length(cast(doc_type as blob)), 0) + coalesce(length(cast(lang as blob)), 0)
  + coalesce(length(cast(graph_id as blob)), 0) + coalesce(length(cast(source_kind as blob)), 0)
  + coalesce(length(cast(content_md as blob)), 0) + coalesce(length(cast(content_hash as blob)), 0)
  + coalesce(length(cast(parser_version as blob)), 0) + coalesce(length(cast(created_at as blob)), 0)
  + coalesce(length(cast(updated_at as blob)), 0) + 24
)`
const CHUNK_BYTES_SQL = `(
  coalesce(length(cast(id as blob)), 0) + coalesce(length(cast(document_id as blob)), 0)
  + coalesce(length(cast(workspace_id as blob)), 0) + coalesce(length(cast(chunk_key as blob)), 0)
  + coalesce(length(cast(heading as blob)), 0) + coalesce(length(cast(markdown as blob)), 0)
  + coalesce(length(cast(content_hash as blob)), 0) + coalesce(length(cast(updated_at as blob)), 0) + 16
)`
const GRAPH_BYTES_SQL = `(
  coalesce(length(cast(id as blob)), 0) + coalesce(length(cast(document_id as blob)), 0)
  + coalesce(length(cast(workspace_id as blob)), 0) + coalesce(length(cast(graph_hash as blob)), 0)
  + coalesce(length(cast(graph_json as blob)), 0) + coalesce(length(cast(layout_json as blob)), 0)
  + coalesce(length(cast(updated_at as blob)), 0) + 16
)`

const readPredicate = (table: string, since: string | null): string =>
  `${table}.workspace_id = ?${since ? ` and ${table}.updated_at > ?` : ''}`
const readValues = (workspaceId: string, since: string | null): unknown[] =>
  since ? [workspaceId, since] : [workspaceId]
const readAggregate = async (args: {
  db: D1DatabaseLike; table: string; bytesSql: string; workspaceId: string; since: string | null
}): Promise<AggregateRow> => await queryFirst<AggregateRow>(
  args.db,
  `select count(*) as row_count, coalesce(sum(${args.bytesSql}), 0) as stored_bytes
   from ${args.table} where ${readPredicate(args.table, args.since)}`,
  readValues(args.workspaceId, args.since),
) || { row_count: 0, stored_bytes: 0 }

export const readBoundedPullChangeRows = async (
  db: D1DatabaseLike,
  workspaceId: string,
  since: string | null,
  limits?: { maxRows?: number; maxStoredResultBytes?: number },
): Promise<{
  documents: DocumentRow[]
  documentChunks: DocumentChunkRow[]
  graphSnapshots: GraphSnapshotRow[]
  limitExceeded: KnowgrphStorageSyncRowLimitReason | null
}> => {
  const maxRows = Math.max(1, Math.floor(normalizeNumber(limits?.maxRows, 100)))
  const maxStoredResultBytes = Math.max(1, Math.floor(normalizeNumber(limits?.maxStoredResultBytes, 8 * 1_024 * 1_024)))
  const sinceValue = normalizeNullableString(since)
  const [documentsAggregate, chunksAggregate, graphsAggregate] = await Promise.all([
    readAggregate({ db, table: 'documents', bytesSql: DOCUMENT_BYTES_SQL, workspaceId, since: sinceValue }),
    readAggregate({ db, table: 'document_chunks', bytesSql: CHUNK_BYTES_SQL, workspaceId, since: sinceValue }),
    readAggregate({ db, table: 'graph_snapshots', bytesSql: GRAPH_BYTES_SQL, workspaceId, since: sinceValue }),
  ])
  const aggregates = [documentsAggregate, chunksAggregate, graphsAggregate]
  if (aggregates.reduce((sum, row) => sum + normalizeNumber(row.row_count), 0) > maxRows) {
    return { documents: [], documentChunks: [], graphSnapshots: [], limitExceeded: 'row_count' }
  }
  if (aggregates.reduce((sum, row) => sum + normalizeNumber(row.stored_bytes), 0) > maxStoredResultBytes) {
    return { documents: [], documentChunks: [], graphSnapshots: [], limitExceeded: 'stored_result_bytes' }
  }
  const values = readValues(workspaceId, sinceValue)
  const documents = await queryAll<DocumentRow>(db,
    `select * from documents where ${readPredicate('documents', sinceValue)}
     order by documents.updated_at asc, documents.id asc limit ?`, [...values, maxRows + 1])
  if (documents.length > maxRows) {
    return { documents, documentChunks: [], graphSnapshots: [], limitExceeded: 'row_count' }
  }
  const chunkLimit = maxRows - documents.length
  const documentChunks = await queryAll<DocumentChunkRow>(db,
    `select * from document_chunks where ${readPredicate('document_chunks', sinceValue)}
     order by document_chunks.updated_at asc, document_chunks.id asc limit ?`, [...values, chunkLimit + 1])
  if (documentChunks.length > chunkLimit) {
    return { documents, documentChunks, graphSnapshots: [], limitExceeded: 'row_count' }
  }
  const graphLimit = maxRows - documents.length - documentChunks.length
  const graphSnapshots = await queryAll<GraphSnapshotRow>(db,
    `select * from graph_snapshots where ${readPredicate('graph_snapshots', sinceValue)}
     order by graph_snapshots.updated_at asc, graph_snapshots.id asc limit ?`, [...values, graphLimit + 1])
  return {
    documents,
    documentChunks,
    graphSnapshots,
    limitExceeded: graphSnapshots.length > graphLimit ? 'row_count' : null,
  }
}
