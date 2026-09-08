import { normalizeNumber, normalizeString, queryFirst, type D1DatabaseLike } from './db'

const DOCUMENT_SEGMENT_BYTES = 16_384
const MAX_DOCUMENT_STREAM_SEGMENTS = 100_000

type DocumentProbe = {
  id: string
  revision: number
  content_hash: string
  content_bytes: number
}
type DocumentSegment = { segment: unknown }
type ChunkSegment = DocumentSegment & { id: string | null; chunk_order: number | null; content_bytes: number | null }

const readSegmentBytes = (value: unknown): Uint8Array | null => {
  // D1 returns BLOB cells as byte arrays. Test/host SQL adapters may expose a view.
  if (Array.isArray(value) && value.length <= DOCUMENT_SEGMENT_BYTES
    && value.every(byte => Number.isInteger(byte) && byte >= 0 && byte <= 255)) return Uint8Array.from(value)
  if (ArrayBuffer.isView(value) && value.byteLength <= DOCUMENT_SEGMENT_BYTES) {
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength)
  }
  return null
}

export const createAgenticGraphStorageDocumentStream = async (
  db: D1DatabaseLike,
  args: { workspaceId: string; canonicalPath: string; publishedOnly?: boolean },
): Promise<ReadableStream<Uint8Array> | null> => {
  const workspaceId = normalizeString(args.workspaceId)
  const canonicalPath = normalizeString(args.canonicalPath)
  if (!workspaceId || !canonicalPath) return null
  // Authorization and payload selection share each SQL read. A later revision
  // or revocation cannot inherit an earlier successful publication check.
  const publicationPredicate = args.publishedOnly ? `and exists (
    select 1 from document_publications
    where document_publications.workspace_id = documents.workspace_id
      and document_publications.document_id = documents.id
      and document_publications.canonical_path = documents.canonical_path
      and document_publications.document_revision = documents.revision
      and document_publications.content_hash = documents.content_hash
      and document_publications.status = 'published')` : ''
  const document = await queryFirst<DocumentProbe>(db,
    `select id, revision, content_hash, length(cast(content_md as blob)) as content_bytes
     from documents where workspace_id = ? and canonical_path = ? and deleted = 0 ${publicationPredicate} limit 1`,
    [workspaceId, canonicalPath])
  if (!document) return null
  const documentId = normalizeString(document.id)
  const revision = normalizeNumber(document.revision)
  const contentHash = normalizeString(document.content_hash)
  const contentBytes = Math.max(0, normalizeNumber(document.content_bytes))
  const identityPredicate = `documents.id = ? and documents.workspace_id = ? and documents.canonical_path = ?
    and documents.revision = ? and documents.content_hash = ? and documents.deleted = 0 ${publicationPredicate}`
  const identityValues = [documentId, workspaceId, canonicalPath, revision, contentHash]
  const encoder = new TextEncoder()
  let segmentIndex = 0
  let byteOffset = 1
  let lastChunkOrder = -1
  let lastChunkId = ''
  let wroteChunk = false
  let chunkByteOffset = 1
  let closed = false

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      while (!closed) {
        segmentIndex += 1
        if (segmentIndex > MAX_DOCUMENT_STREAM_SEGMENTS) {
          controller.error(new Error('document stream exceeded its segment safety limit'))
          closed = true
          return
        }
        if (contentBytes > 0) {
          const row = await queryFirst<DocumentSegment>(db,
            `select substr(cast(content_md as blob), ?, ?) as segment from documents
             where ${identityPredicate} limit 1`,
            [byteOffset, DOCUMENT_SEGMENT_BYTES, ...identityValues])
          const bytes = readSegmentBytes(row?.segment)
          const expectedLength = Math.min(DOCUMENT_SEGMENT_BYTES, Math.max(0, contentBytes - byteOffset + 1))
          if (!bytes || bytes.byteLength !== expectedLength) {
            controller.error(new Error('document changed while it was streaming'))
            closed = true
            return
          }
          if (!bytes.byteLength) {
            controller.close()
            closed = true
            return
          }
          byteOffset += bytes.byteLength
          controller.enqueue(bytes)
          return
        }
        const chunk = await queryFirst<ChunkSegment>(db,
          `select document_chunks.id, document_chunks.chunk_order,
                  substr(cast(document_chunks.markdown as blob), ?, ?) as segment,
                  length(cast(document_chunks.markdown as blob)) as content_bytes
           from documents left join document_chunks
             on document_chunks.workspace_id = documents.workspace_id and document_chunks.document_id = documents.id
             and (document_chunks.chunk_order > ? or (document_chunks.chunk_order = ? and document_chunks.id > ?))
           where ${identityPredicate}
           order by document_chunks.chunk_order asc, document_chunks.id asc limit 1`,
          [chunkByteOffset, DOCUMENT_SEGMENT_BYTES, lastChunkOrder, lastChunkOrder, lastChunkId, ...identityValues])
        if (!chunk) {
          controller.error(new Error('document changed while it was streaming'))
          closed = true
          return
        }
        if (chunk.id === null) {
          controller.close()
          closed = true
          return
        }
        const totalBytes = Number(chunk.content_bytes)
        // SQLite returns NULL for substr(CAST('' AS BLOB), ...).
        const bytes = totalBytes === 0 && chunk.segment === null ? new Uint8Array(0) : readSegmentBytes(chunk.segment)
        const expectedLength = Math.min(DOCUMENT_SEGMENT_BYTES, Math.max(0, totalBytes - chunkByteOffset + 1))
        if (!Number.isSafeInteger(totalBytes) || totalBytes < 0 || !bytes || bytes.byteLength !== expectedLength) {
          controller.error(new Error('document chunk segment is invalid'))
          closed = true
          return
        }
        const hadChunk = wroteChunk
        if (chunkByteOffset === 1) {
          if (wroteChunk) controller.enqueue(encoder.encode('\n\n'))
          wroteChunk = true
        }
        if (bytes.byteLength) controller.enqueue(bytes)
        chunkByteOffset += bytes.byteLength
        if (chunkByteOffset > totalBytes) {
          lastChunkOrder = normalizeNumber(chunk.chunk_order)
          lastChunkId = normalizeString(chunk.id)
          chunkByteOffset = 1
        }
        if (hadChunk || bytes.byteLength) return
        // An initial empty chunk has no bytes to enqueue. Advance in this bounded
        // pull so a pending reader cannot be left waiting for an empty emission.
      }
    },
  })
}
