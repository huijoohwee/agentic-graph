import { AGENTIC_OS_STORAGE_SYNC_LIMITS } from './contract'
import { queryAll, type D1DatabaseLike, type DocumentChunkRow, type DocumentRow, type GraphSnapshotRow } from './db'
import type { StorageChildStateRow } from './storageChildMutation'
import type { AgenticGraphStorageSyncCursor } from './storageSyncCursor'

type EntityRank = 1 | 2 | 3
type PageKey = { entity_rank: EntityRank; updated_at: string; id: string | number; stored_bytes: number }
type ResultRow = PageKey & { payload_json: string | null; state_json: string | null; oversized: number; missing: number; has_more: number }
type PageArgs = {
  db: D1DatabaseLike; workspaceId: string; since: string | null; snapshotAt: string
  cursor: AgenticGraphStorageSyncCursor | null; maxRows: number; maxStoredResultBytes: number
  mode?: 'sync' | 'export'
}
const DOCUMENT_COLUMNS = ['id', 'workspace_id', 'canonical_path', 'title', 'doc_type', 'lang', 'graph_id',
  'source_kind', 'content_md', 'content_hash', 'parser_version', 'revision', 'deleted', 'created_at', 'updated_at']
const CHUNK_COLUMNS = ['id', 'document_id', 'workspace_id', 'chunk_key', 'chunk_order', 'heading',
  'markdown', 'token_estimate', 'content_hash', 'updated_at']
const GRAPH_COLUMNS = ['id', 'document_id', 'workspace_id', 'graph_revision', 'graph_hash', 'graph_json',
  'layout_json', 'derived_from_document_revision', 'updated_at']
const STATE_COLUMNS = ['sync_revision', 'workspace_id', 'entity', 'document_id', 'identity_key', 'record_id', 'deleted', 'updated_at']
const jsonColumns = (alias: string, columns: string[]): string =>
  `json_object(${columns.map(column => `'${column}', ${alias}.${column}`).join(', ')})`
const storedBytes = (alias: string, columns: string[]): string =>
  `(${columns.map(column => `coalesce(length(cast(${alias}.${column} as blob)), 0)`).join(' + ')} + 256)`
const binding = (tableAlias: string, stateAlias: string, keyColumn: string): string =>
  `${tableAlias}.id = ${stateAlias}.record_id AND ${tableAlias}.workspace_id = ${stateAlias}.workspace_id
   AND ${tableAlias}.document_id = ${stateAlias}.document_id AND cast(${tableAlias}.${keyColumn} as text) = ${stateAlias}.identity_key`

const range = (args: PageArgs, alias: string, rank: EntityRank, idColumn: string) => {
  const cursor = args.cursor
  const filter = (sql: string, values: Array<string | number>) => ({
    sql: `${alias}.workspace_id = ? ${sql ? `AND ${sql}` : ''} AND ${alias}.updated_at <= ?`,
    values: [args.workspaceId, ...values, args.snapshotAt, args.maxRows + 1],
  })
  // SQLite can scan earlier IDs for a tuple range with a timestamp upper bound.
  // Separate equal-time and later-time seeks; only the cursor's entity splits.
  if (cursor && rank === cursor.lastEntityRank) return [
    filter(`${alias}.updated_at = ? AND ${alias}.${idColumn} > ?`, [cursor.lastUpdatedAt, cursor.lastId]),
    filter(`${alias}.updated_at > ?`, [cursor.lastUpdatedAt]),
  ]
  if (cursor) return [filter(`${alias}.updated_at ${rank > cursor.lastEntityRank ? '>=' : '>'} ?`, [cursor.lastUpdatedAt])]
  return [filter(args.since ? `${alias}.updated_at >= ?` : '', args.since ? [args.since] : [])]
}
const childTerm = (args: PageArgs, entity: 'documentChunk' | 'graphSnapshot', rank: 2 | 3) => {
  const isChunk = entity === 'documentChunk'
  const table = isChunk ? 'document_chunks' : 'graph_snapshots'
  const key = isChunk ? 'chunk_key' : 'graph_revision'
  const columns = isChunk ? CHUNK_COLUMNS : GRAPH_COLUMNS
  return range(args, 's', rank, 'sync_revision').map(filter => ({ values: filter.values, sql: `SELECT * FROM (
    SELECT ${rank} AS entity_rank, s.updated_at, s.sync_revision AS id, s.record_id,
      s.workspace_id, s.document_id, s.identity_key, s.deleted,
      CASE WHEN s.deleted = 0 AND c.id IS NULL THEN 1 ELSE 0 END AS missing,
      ${storedBytes('s', STATE_COLUMNS)} + CASE WHEN s.deleted = 0 THEN ${storedBytes('c', columns)} ELSE 0 END AS stored_bytes
    FROM storage_child_state s LEFT JOIN ${table} c ON ${binding('c', 's', key)}
    WHERE s.entity = '${entity}' AND ${filter.sql} ${args.mode === 'export' ? 'AND s.deleted = 0' : ''}
    ORDER BY s.updated_at, s.sync_revision LIMIT ?)` }))
}

export type AgenticGraphStorageSyncPageRows = {
  documents: DocumentRow[]
  documentChunks: Array<DocumentChunkRow & { sync_revision: number }>
  graphSnapshots: Array<GraphSnapshotRow & { sync_revision: number }>
  deletions: StorageChildStateRow[]
  lastKey: PageKey | null
  hasMore: boolean
}

export const readAgenticGraphStorageSyncPageRows = async (args: PageArgs): Promise<AgenticGraphStorageSyncPageRows> => {
  if (!Number.isSafeInteger(args.maxRows) || args.maxRows < 1 || args.maxRows > AGENTIC_OS_STORAGE_SYNC_LIMITS.maxResultRows
      || !Number.isSafeInteger(args.maxStoredResultBytes) || args.maxStoredResultBytes < 1
      || args.maxStoredResultBytes > AGENTIC_OS_STORAGE_SYNC_LIMITS.maxResponseBytes) throw new Error('Invalid storage page bounds')
  const documents = range(args, 'd', 1, 'id').map(documentRange => ({ values: documentRange.values, sql: `SELECT * FROM (
    SELECT 1 AS entity_rank, d.updated_at, d.id, d.id AS record_id, d.workspace_id,
      NULL AS document_id, NULL AS identity_key, 0 AS deleted, 0 AS missing, ${storedBytes('d', DOCUMENT_COLUMNS)} AS stored_bytes
    FROM documents d WHERE ${documentRange.sql} ORDER BY d.updated_at, d.id LIMIT ?)` }))
  const terms = [...documents, ...childTerm(args, 'documentChunk', 2), ...childTerm(args, 'graphSnapshot', 3)]
  // At most four indexed streams contribute maxRows+1 descriptors each. Content is
  // selected only after row/byte bounds, within the same database statement.
  const sql = `WITH candidates AS MATERIALIZED (
      SELECT * FROM (${terms.map(term => term.sql).join(' UNION ALL ')})
      ORDER BY updated_at, entity_rank, id LIMIT ?
    ), costed AS (
      SELECT *, row_number() OVER (ORDER BY updated_at, entity_rank, id) AS position,
        sum(stored_bytes) OVER (ORDER BY updated_at, entity_rank, id ROWS UNBOUNDED PRECEDING) AS page_bytes
      FROM candidates
    ), selected AS MATERIALIZED (
      SELECT * FROM costed WHERE position <= ? AND (page_bytes <= ? OR position = 1)
    )
    SELECT p.entity_rank, p.updated_at, p.id, p.stored_bytes, p.missing,
      CASE WHEN p.stored_bytes > ? THEN 1 ELSE 0 END AS oversized,
      CASE WHEN p.stored_bytes > ? OR p.missing = 1 OR p.deleted = 1 THEN NULL
        WHEN p.entity_rank = 1 THEN (SELECT ${jsonColumns('d', DOCUMENT_COLUMNS)} FROM documents d
          WHERE d.id = p.record_id AND d.workspace_id = p.workspace_id)
        WHEN p.entity_rank = 2 THEN (SELECT ${jsonColumns('c', CHUNK_COLUMNS)} FROM document_chunks c
          WHERE ${binding('c', 'p', 'chunk_key')})
        ELSE (SELECT ${jsonColumns('c', GRAPH_COLUMNS)} FROM graph_snapshots c
          WHERE ${binding('c', 'p', 'graph_revision')}) END AS payload_json,
      CASE WHEN p.entity_rank = 1 OR p.stored_bytes > ? THEN NULL ELSE
        (SELECT ${jsonColumns('s', STATE_COLUMNS)} FROM storage_child_state s WHERE s.sync_revision = p.id) END AS state_json,
      (SELECT count(*) FROM candidates) > (SELECT count(*) FROM selected) AS has_more
    FROM selected p ORDER BY p.updated_at, p.entity_rank, p.id`
  const budget = args.maxStoredResultBytes
  const rows = await queryAll<ResultRow>(args.db, sql, [...terms.flatMap(term => term.values),
    args.maxRows + 1, args.maxRows, budget, budget, budget, budget])
  const result: AgenticGraphStorageSyncPageRows = { documents: [], documentChunks: [], graphSnapshots: [],
    deletions: [], lastKey: rows.at(-1) || null, hasMore: rows.some(value => value.has_more === 1) }
  for (const value of rows) {
    if (value.oversized === 1) throw new Error('one storage sync row exceeds the page byte limit')
    if (value.missing === 1) throw new Error('Live child sync state has no matching record')
    if (value.entity_rank === 1) {
      if (!value.payload_json) throw new Error('Storage page document disappeared')
      result.documents.push(JSON.parse(value.payload_json) as DocumentRow)
      continue
    }
    if (!value.state_json) throw new Error('Storage page child state disappeared')
    const state = JSON.parse(value.state_json) as StorageChildStateRow
    if (state.deleted === 1) { result.deletions.push(state); continue }
    if (!value.payload_json) throw new Error('Storage page child disappeared')
    const record = { ...JSON.parse(value.payload_json), sync_revision: state.sync_revision }
    if (value.entity_rank === 2) result.documentChunks.push(record)
    else result.graphSnapshots.push(record)
  }
  return result
}
