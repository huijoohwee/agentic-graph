import { normalizeNumber, normalizeString, queryFirst, type D1DatabaseLike } from './db'

const DOCUMENT_SEGMENT_CHARACTERS = 16_384
const MAX_DOCUMENT_STREAM_SEGMENTS = 100_000

type DocumentProbe = {
  id: string
  revision: number
  content_hash: string
  content_characters: number
}
type DocumentSegment = { segment: string }
type ChunkSegment = { id: string; chunk_order: number; markdown: string }

export const createAgenticGraphStorageDocumentStream = async (
  db: D1DatabaseLike,
  args: { workspaceId: string; canonicalPath: string; snapshotAt?: string },
): Promise<ReadableStream<Uint8Array> | null> => {
  const workspaceId = normalizeString(args.workspaceId)
  const canonicalPath = normalizeString(args.canonicalPath)
  if (!workspaceId || !canonicalPath) return null
  const document = await queryFirst<DocumentProbe>(db,
    `select id, revision, content_hash, length(content_md) as content_characters
     from documents where workspace_id = ? and canonical_path = ? and deleted = 0 limit 1`,
    [workspaceId, canonicalPath])
  if (!document) return null
  const documentId = normalizeString(document.id)
  const revision = normalizeNumber(document.revision)
  const contentHash = normalizeString(document.content_hash)
  const contentCharacters = Math.max(0, normalizeNumber(document.content_characters))
  const snapshotAt = normalizeString(args.snapshotAt) || new Date().toISOString()
  const encoder = new TextEncoder()
  let segmentIndex = 0
  let characterOffset = 1
  let lastChunkOrder = -1
  let lastChunkId = ''
  let wroteChunk = false
  let closed = false

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (closed) return
      segmentIndex += 1
      if (segmentIndex > MAX_DOCUMENT_STREAM_SEGMENTS) {
        controller.error(new Error('document stream exceeded its segment safety limit'))
        closed = true
        return
      }
      if (contentCharacters > 0) {
        const row = await queryFirst<DocumentSegment>(db,
          `select substr(content_md, ?, ?) as segment from documents
           where id = ? and workspace_id = ? and revision = ? and content_hash = ? and deleted = 0 limit 1`,
          [characterOffset, DOCUMENT_SEGMENT_CHARACTERS, documentId, workspaceId, revision, contentHash])
        if (!row || typeof row.segment !== 'string') {
          controller.error(new Error('document changed while it was streaming'))
          closed = true
          return
        }
        if (!row.segment) {
          controller.close()
          closed = true
          return
        }
        characterOffset += row.segment.length
        controller.enqueue(encoder.encode(row.segment))
        return
      }
      const chunk = await queryFirst<ChunkSegment>(db,
        `select id, chunk_order, markdown from document_chunks
         where workspace_id = ? and document_id = ? and updated_at <= ?
           and (chunk_order > ? or (chunk_order = ? and id > ?))
         order by chunk_order asc, id asc limit 1`,
        [workspaceId, documentId, snapshotAt, lastChunkOrder, lastChunkOrder, lastChunkId])
      if (!chunk) {
        controller.close()
        closed = true
        return
      }
      lastChunkOrder = normalizeNumber(chunk.chunk_order)
      lastChunkId = normalizeString(chunk.id)
      const markdown = typeof chunk.markdown === 'string' ? chunk.markdown : ''
      controller.enqueue(encoder.encode(`${wroteChunk ? '\n\n' : ''}${markdown}`))
      wroteChunk = true
    },
  })
}
