import {
  normalizeNumber,
  queryAll,
  type D1DatabaseLike,
  type DocumentChunkRow,
  type DocumentRow,
  type GraphSnapshotRow,
} from './db'
import type { KnowgrphStorageSyncCursor } from './storageSyncCursor'

type EntityRank = 1 | 2 | 3
type PageKey = { entity_rank: EntityRank; updated_at: string; id: string; stored_bytes: number }

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

const positionPredicate = (rank: EntityRank, hasCursor: boolean): string => hasCursor
  ? `and (updated_at > ? or (updated_at = ? and (${rank} > ? or (${rank} = ? and id > ?))))`
  : ''

const keyTerm = (args: {
  table: string; rank: EntityRank; bytesSql: string; hasSince: boolean; hasCursor: boolean
}): string => `select ${args.rank} as entity_rank, updated_at, id, ${args.bytesSql} as stored_bytes
  from ${args.table}
  where workspace_id = ?
    ${args.hasSince ? 'and updated_at > ?' : ''}
    and updated_at <= ?
    ${positionPredicate(args.rank, args.hasCursor)}`

const termValues = (args: {
  workspaceId: string; since: string | null; snapshotAt: string; cursor: KnowgrphStorageSyncCursor | null
}): unknown[] => [
  args.workspaceId,
  ...(args.since ? [args.since] : []),
  args.snapshotAt,
  ...(args.cursor ? [
    args.cursor.lastUpdatedAt,
    args.cursor.lastUpdatedAt,
    args.cursor.lastEntityRank,
    args.cursor.lastEntityRank,
    args.cursor.lastId,
  ] : []),
]

const readRowsByIds = async <Row>(
  db: D1DatabaseLike,
  table: string,
  ids: string[],
): Promise<Row[]> => {
  if (ids.length === 0) return []
  return await queryAll<Row>(db, `select * from ${table} where id in (${ids.map(() => '?').join(',')})`, ids)
}

export type KnowgrphStorageSyncPageRows = {
  documents: DocumentRow[]
  documentChunks: DocumentChunkRow[]
  graphSnapshots: GraphSnapshotRow[]
  lastKey: PageKey | null
  hasMore: boolean
}

export const readKnowgrphStorageSyncPageRows = async (args: {
  db: D1DatabaseLike
  workspaceId: string
  since: string | null
  snapshotAt: string
  cursor: KnowgrphStorageSyncCursor | null
  maxRows: number
  maxStoredResultBytes: number
}): Promise<KnowgrphStorageSyncPageRows> => {
  const hasSince = Boolean(args.since)
  const hasCursor = Boolean(args.cursor)
  const terms = [
    keyTerm({ table: 'documents', rank: 1, bytesSql: DOCUMENT_BYTES_SQL, hasSince, hasCursor }),
    keyTerm({ table: 'document_chunks', rank: 2, bytesSql: CHUNK_BYTES_SQL, hasSince, hasCursor }),
    keyTerm({ table: 'graph_snapshots', rank: 3, bytesSql: GRAPH_BYTES_SQL, hasSince, hasCursor }),
  ]
  const values = [1, 2, 3].flatMap(() => termValues(args))
  const candidates = await queryAll<PageKey>(args.db, `select * from (${terms.join(' union all ')})
    order by updated_at asc, entity_rank asc, id asc limit ?`, [...values, args.maxRows + 1])
  const selected: PageKey[] = []
  let selectedBytes = 0
  for (const candidate of candidates) {
    const bytes = Math.max(0, normalizeNumber(candidate.stored_bytes))
    if (selected.length >= args.maxRows || (selected.length > 0 && selectedBytes + bytes > args.maxStoredResultBytes)) break
    if (bytes > args.maxStoredResultBytes) throw new Error('one storage sync row exceeds the page byte limit')
    selected.push(candidate)
    selectedBytes += bytes
  }
  const documents = await readRowsByIds<DocumentRow>(args.db, 'documents', selected.filter(row => row.entity_rank === 1).map(row => row.id))
  const documentChunks = await readRowsByIds<DocumentChunkRow>(args.db, 'document_chunks', selected.filter(row => row.entity_rank === 2).map(row => row.id))
  const graphSnapshots = await readRowsByIds<GraphSnapshotRow>(args.db, 'graph_snapshots', selected.filter(row => row.entity_rank === 3).map(row => row.id))
  return {
    documents,
    documentChunks,
    graphSnapshots,
    lastKey: selected.at(-1) || null,
    hasMore: candidates.length > selected.length,
  }
}
