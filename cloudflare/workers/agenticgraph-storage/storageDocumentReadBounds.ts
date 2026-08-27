import {
  normalizeNumber,
  normalizeString,
  queryAll,
  queryFirst,
  type CrawlerDocumentRow,
  type D1DatabaseLike,
} from './db'

export const KNOWGRPH_STORAGE_DOCUMENT_READ_LIMITS = {
  maxDocumentBytes: 1 * 1_024 * 1_024,
  maxDocumentChunks: 100,
  maxCrawlerRows: 100,
  maxCrawlerMetadataBytes: 512 * 1_024,
  maxCrawlerResponseBytes: 1 * 1_024 * 1_024,
} as const

export class KnowgrphStorageDocumentReadLimitError extends Error {}

type PublishedDocumentProbe = { id: string; content_bytes: number }
type PublishedChunkProbe = { row_count: number; content_bytes: number }
type PublishedChunkRow = { id: string; chunk_order: number; markdown: string }

const utf8Bytes = (value: string): number => new TextEncoder().encode(value).byteLength

export const readBoundedPublishedMarkdown = async (
  db: D1DatabaseLike,
  args: { workspaceId: string; canonicalPath: string },
): Promise<string | null> => {
  const workspaceId = normalizeString(args.workspaceId)
  const canonicalPath = normalizeString(args.canonicalPath)
  if (!workspaceId || !canonicalPath) return null
  const document = await queryFirst<PublishedDocumentProbe>(db,
    `select id, length(cast(content_md as blob)) as content_bytes
     from documents
     where workspace_id = ? and canonical_path = ? and deleted = 0
     limit 1`, [workspaceId, canonicalPath])
  if (!document) return null
  const contentBytes = normalizeNumber(document.content_bytes)
  if (contentBytes > KNOWGRPH_STORAGE_DOCUMENT_READ_LIMITS.maxDocumentBytes) {
    throw new KnowgrphStorageDocumentReadLimitError(
      `document exceeds the ${KNOWGRPH_STORAGE_DOCUMENT_READ_LIMITS.maxDocumentBytes} byte response limit`,
    )
  }
  if (contentBytes > 0) {
    const row = await queryFirst<{ content_md: string }>(db,
      `select content_md from documents
       where id = ? and workspace_id = ? and deleted = 0
       limit 1`, [document.id, workspaceId])
    const markdown = typeof row?.content_md === 'string' ? row.content_md : ''
    if (utf8Bytes(markdown) > KNOWGRPH_STORAGE_DOCUMENT_READ_LIMITS.maxDocumentBytes) {
      throw new KnowgrphStorageDocumentReadLimitError('document changed beyond the response byte limit')
    }
    return markdown
  }
  const chunkProbe = await queryFirst<PublishedChunkProbe>(db,
    `select count(*) as row_count,
            coalesce(sum(length(cast(markdown as blob))), 0) as content_bytes
     from document_chunks
     where workspace_id = ? and document_id = ?`, [workspaceId, document.id])
  const chunkCount = normalizeNumber(chunkProbe?.row_count)
  const chunkBytes = normalizeNumber(chunkProbe?.content_bytes) + Math.max(0, chunkCount - 1) * 2
  if (chunkCount > KNOWGRPH_STORAGE_DOCUMENT_READ_LIMITS.maxDocumentChunks) {
    throw new KnowgrphStorageDocumentReadLimitError(
      `document exceeds the ${KNOWGRPH_STORAGE_DOCUMENT_READ_LIMITS.maxDocumentChunks} chunk response limit`,
    )
  }
  if (chunkBytes > KNOWGRPH_STORAGE_DOCUMENT_READ_LIMITS.maxDocumentBytes) {
    throw new KnowgrphStorageDocumentReadLimitError(
      `document exceeds the ${KNOWGRPH_STORAGE_DOCUMENT_READ_LIMITS.maxDocumentBytes} byte response limit`,
    )
  }
  const chunks = await queryAll<PublishedChunkRow>(db,
    `select id, chunk_order, markdown from document_chunks
     where workspace_id = ? and document_id = ?
     order by chunk_order asc, id asc
     limit ?`, [workspaceId, document.id, KNOWGRPH_STORAGE_DOCUMENT_READ_LIMITS.maxDocumentChunks + 1])
  if (chunks.length > KNOWGRPH_STORAGE_DOCUMENT_READ_LIMITS.maxDocumentChunks) {
    throw new KnowgrphStorageDocumentReadLimitError('document chunk count changed beyond the response limit')
  }
  const markdown = chunks
    .map(chunk => normalizeString(chunk.markdown) ? String(chunk.markdown) : '')
    .filter(Boolean)
    .join('\n\n')
  if (utf8Bytes(markdown) > KNOWGRPH_STORAGE_DOCUMENT_READ_LIMITS.maxDocumentBytes) {
    throw new KnowgrphStorageDocumentReadLimitError('document changed beyond the response byte limit')
  }
  return markdown
}

export const readBoundedCrawlerDocumentRows = async (
  db: D1DatabaseLike,
  workspaceId: string,
  after: { canonicalPath: string; id: string } | null = null,
  publishedOnly = false,
): Promise<{ rows: CrawlerDocumentRow[]; hasMore: boolean }> => {
  const rows = await queryAll<CrawlerDocumentRow>(db,
    `select documents.id, documents.canonical_path, documents.title, documents.doc_type,
            documents.content_hash, documents.revision, documents.updated_at,
            length(coalesce(documents.content_md, '')) as content_length
     from documents
     ${publishedOnly ? `join document_publications on document_publications.document_id = documents.id
       and document_publications.workspace_id = documents.workspace_id
       and document_publications.canonical_path = documents.canonical_path
       and document_publications.document_revision = documents.revision
       and document_publications.content_hash = documents.content_hash
       and document_publications.status = 'published'` : ''}
     where documents.workspace_id = ? and documents.deleted = 0 and length(documents.content_md) > 0
       ${after ? 'and (documents.canonical_path > ? or (documents.canonical_path = ? and documents.id > ?))' : ''}
     order by documents.canonical_path asc, documents.id asc
     limit ?`, [
      workspaceId,
      ...(after ? [after.canonicalPath, after.canonicalPath, after.id] : []),
      KNOWGRPH_STORAGE_DOCUMENT_READ_LIMITS.maxCrawlerRows + 1,
    ])
  const page = rows.slice(0, KNOWGRPH_STORAGE_DOCUMENT_READ_LIMITS.maxCrawlerRows)
  let metadataBytes = 0
  for (const row of page) {
    metadataBytes += utf8Bytes(JSON.stringify(row))
    if (metadataBytes > KNOWGRPH_STORAGE_DOCUMENT_READ_LIMITS.maxCrawlerMetadataBytes) {
      throw new KnowgrphStorageDocumentReadLimitError(
        `crawler page exceeds the ${KNOWGRPH_STORAGE_DOCUMENT_READ_LIMITS.maxCrawlerMetadataBytes} byte metadata limit`,
      )
    }
  }
  return { rows: page, hasMore: rows.length > page.length }
}

export const assertBoundedCrawlerResponse = (body: string): void => {
  if (utf8Bytes(body) > KNOWGRPH_STORAGE_DOCUMENT_READ_LIMITS.maxCrawlerResponseBytes) {
    throw new KnowgrphStorageDocumentReadLimitError(
      `crawler response exceeds the ${KNOWGRPH_STORAGE_DOCUMENT_READ_LIMITS.maxCrawlerResponseBytes} byte limit`,
    )
  }
}
