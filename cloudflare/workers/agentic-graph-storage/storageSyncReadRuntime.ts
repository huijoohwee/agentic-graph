import {
  AGENTIC_OS_STORAGE_SYNC_LIMITS,
  type AgenticGraphStoragePullChanges,
  type AgenticGraphStoragePullRequest,
} from './contract'
import {
  mapDocumentChunkRow,
  mapDocumentRow,
  mapGraphSnapshotRow,
  normalizeString,
  type D1DatabaseLike,
  type DocumentChunkRow,
  type DocumentRow,
  type GraphSnapshotRow,
} from './db'
import { readAgenticGraphStorageSyncPageRows } from './storageSyncPageRows'
import {
  decodeAgenticGraphStorageSyncCursor,
  encodeAgenticGraphStorageSyncCursor,
} from './storageSyncCursor'

export class AgenticGraphStorageSyncResultLimitError extends Error {}

const STORED_ROW_PAGE_LIMIT = 'one storage sync row exceeds the page byte limit'

const jsonByteLength = (value: unknown): number =>
  new TextEncoder().encode(JSON.stringify(value)).byteLength

const assertResultBounds = (changes: AgenticGraphStoragePullChanges): void => {
  const rows = [...changes.documents, ...changes.documentChunks, ...changes.graphSnapshots]
  if (rows.length > AGENTIC_OS_STORAGE_SYNC_LIMITS.maxResultRows) {
    throw new AgenticGraphStorageSyncResultLimitError(
      `storage sync result exceeds the ${AGENTIC_OS_STORAGE_SYNC_LIMITS.maxResultRows} row limit`,
    )
  }
  let bytes = 256
  for (const row of rows) {
    bytes += jsonByteLength(row) + 1
    if (bytes > AGENTIC_OS_STORAGE_SYNC_LIMITS.maxResponseBytes - 65_536) {
      throw new AgenticGraphStorageSyncResultLimitError(
        `storage sync result exceeds the ${AGENTIC_OS_STORAGE_SYNC_LIMITS.maxResponseBytes} byte response limit`,
      )
    }
  }
}

export const readAgenticGraphStoragePullPage = async (
  db: D1DatabaseLike,
  workspaceId: string,
  since: string | null,
  knownChunks: AgenticGraphStoragePullRequest['knownChunks'] = [],
  pageCursor: string | null = null,
  firstSnapshotAt = new Date().toISOString(),
): Promise<{
  changes: AgenticGraphStoragePullChanges
  nextPageCursor: string | null
  pageComplete: boolean
  snapshotAt: string
}> => {
  let cursor = null
  try {
    cursor = pageCursor ? decodeAgenticGraphStorageSyncCursor({ token: pageCursor, workspaceId, since }) : null
  } catch (error) {
    throw new AgenticGraphStorageSyncResultLimitError(error instanceof Error ? error.message : 'invalid storage page cursor')
  }
  const snapshotAt = cursor?.snapshotAt || firstSnapshotAt
  let rows
  try {
    rows = await readAgenticGraphStorageSyncPageRows({
      db,
      workspaceId,
      since,
      snapshotAt,
      cursor,
      maxRows: AGENTIC_OS_STORAGE_SYNC_LIMITS.maxResultRows,
      maxStoredResultBytes: AGENTIC_OS_STORAGE_SYNC_LIMITS.maxResponseBytes - 65_536,
    })
  } catch (error) {
    if (error instanceof Error && error.message === STORED_ROW_PAGE_LIMIT) {
      throw new AgenticGraphStorageSyncResultLimitError(error.message)
    }
    throw error
  }
  const knownChunkHashBySemanticKey = new Map<string, string>()
  for (const chunk of knownChunks.slice(0, 1_000)) {
    const documentId = normalizeString(chunk?.documentId)
    const chunkKey = normalizeString(chunk?.chunkKey)
    const contentHash = normalizeString(chunk?.contentHash)
    if (documentId && chunkKey && contentHash) {
      knownChunkHashBySemanticKey.set(`${documentId}\u0000${chunkKey}`, contentHash)
    }
  }
  const changes: AgenticGraphStoragePullChanges = {
    documents: (rows.documents as DocumentRow[]).map(mapDocumentRow),
    documentChunks: (rows.documentChunks as DocumentChunkRow[]).map(row => {
      const mapped = mapDocumentChunkRow(row)
      const knownHash = knownChunkHashBySemanticKey.get(`${mapped.documentId}\u0000${mapped.chunkKey}`)
      return knownHash === mapped.contentHash
        ? { ...mapped, markdown: '', contentReused: true }
        : mapped
    }),
    graphSnapshots: (rows.graphSnapshots as GraphSnapshotRow[]).map(mapGraphSnapshotRow),
  }
  assertResultBounds(changes)
  const nextPageCursor = rows.hasMore && rows.lastKey
    ? encodeAgenticGraphStorageSyncCursor({
        workspaceId,
        since,
        snapshotAt,
        lastUpdatedAt: rows.lastKey.updated_at,
        lastEntityRank: rows.lastKey.entity_rank,
        lastId: rows.lastKey.id,
      })
    : null
  return { changes, nextPageCursor, pageComplete: !nextPageCursor, snapshotAt }
}

export const readBoundedAgenticGraphStoragePullChanges = async (
  db: D1DatabaseLike,
  workspaceId: string,
  since: string | null,
  knownChunks: AgenticGraphStoragePullRequest['knownChunks'] = [],
): Promise<AgenticGraphStoragePullChanges> =>
  (await readAgenticGraphStoragePullPage(db, workspaceId, since, knownChunks)).changes
