import {
  KNOWGRPH_STORAGE_SYNC_LIMITS,
  type KnowgrphStoragePullChanges,
  type KnowgrphStoragePullRequest,
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
import { readKnowgrphStorageSyncPageRows } from './storageSyncPageRows'
import {
  decodeKnowgrphStorageSyncCursor,
  encodeKnowgrphStorageSyncCursor,
} from './storageSyncCursor'

export class KnowgrphStorageSyncResultLimitError extends Error {}

const jsonByteLength = (value: unknown): number =>
  new TextEncoder().encode(JSON.stringify(value)).byteLength

const assertResultBounds = (changes: KnowgrphStoragePullChanges): void => {
  const rows = [...changes.documents, ...changes.documentChunks, ...changes.graphSnapshots]
  if (rows.length > KNOWGRPH_STORAGE_SYNC_LIMITS.maxResultRows) {
    throw new KnowgrphStorageSyncResultLimitError(
      `storage sync result exceeds the ${KNOWGRPH_STORAGE_SYNC_LIMITS.maxResultRows} row limit`,
    )
  }
  let bytes = 256
  for (const row of rows) {
    bytes += jsonByteLength(row) + 1
    if (bytes > KNOWGRPH_STORAGE_SYNC_LIMITS.maxResponseBytes - 65_536) {
      throw new KnowgrphStorageSyncResultLimitError(
        `storage sync result exceeds the ${KNOWGRPH_STORAGE_SYNC_LIMITS.maxResponseBytes} byte response limit`,
      )
    }
  }
}

export const readKnowgrphStoragePullPage = async (
  db: D1DatabaseLike,
  workspaceId: string,
  since: string | null,
  knownChunks: KnowgrphStoragePullRequest['knownChunks'] = [],
  pageCursor: string | null = null,
  firstSnapshotAt = new Date().toISOString(),
): Promise<{
  changes: KnowgrphStoragePullChanges
  nextPageCursor: string | null
  pageComplete: boolean
  snapshotAt: string
}> => {
  let cursor = null
  try {
    cursor = pageCursor ? decodeKnowgrphStorageSyncCursor({ token: pageCursor, workspaceId, since }) : null
  } catch (error) {
    throw new KnowgrphStorageSyncResultLimitError(error instanceof Error ? error.message : 'invalid storage page cursor')
  }
  const snapshotAt = cursor?.snapshotAt || firstSnapshotAt
  let rows
  try {
    rows = await readKnowgrphStorageSyncPageRows({
      db,
      workspaceId,
      since,
      snapshotAt,
      cursor,
      maxRows: KNOWGRPH_STORAGE_SYNC_LIMITS.maxResultRows,
      maxStoredResultBytes: KNOWGRPH_STORAGE_SYNC_LIMITS.maxResponseBytes - 65_536,
    })
  } catch (error) {
    throw new KnowgrphStorageSyncResultLimitError(
      error instanceof Error ? error.message : 'storage sync page could not be read',
    )
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
  const changes: KnowgrphStoragePullChanges = {
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
    ? encodeKnowgrphStorageSyncCursor({
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

export const readBoundedKnowgrphStoragePullChanges = async (
  db: D1DatabaseLike,
  workspaceId: string,
  since: string | null,
  knownChunks: KnowgrphStoragePullRequest['knownChunks'] = [],
): Promise<KnowgrphStoragePullChanges> =>
  (await readKnowgrphStoragePullPage(db, workspaceId, since, knownChunks)).changes
