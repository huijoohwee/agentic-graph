import { Buffer } from 'node:buffer'
import type { FakeAgenticGraphStorageD1ReadState, FakeRow } from './fake-agentic-graph-storage-d1-reads'

type State = Pick<FakeAgenticGraphStorageD1ReadState, 'documents' | 'documentChunks' | 'documentPublications'>

const isPublished = (state: State, document: FakeRow): boolean =>
  Array.from(state.documentPublications.values()).some(publication =>
    publication.workspace_id === document.workspace_id && publication.document_id === document.id
    && publication.canonical_path === document.canonical_path && publication.document_revision === document.revision
    && publication.content_hash === document.content_hash && publication.status === 'published')

const readIdentity = (state: State, sql: string, values: unknown[]): FakeRow | undefined => {
  const [id, workspaceId, canonicalPath, revision, contentHash] = values
  const document = state.documents.get(String(id))
  if (!document || document.workspace_id !== workspaceId || document.canonical_path !== canonicalPath
    || document.revision !== revision || document.content_hash !== contentHash || Number(document.deleted || 0) !== 0) return
  if (sql.includes('and exists (') && !isPublished(state, document)) return
  return document
}

const segment = (content: unknown, offset: unknown, length: unknown): number[] =>
  Array.from(new TextEncoder().encode(String(content ?? '')).slice(Number(offset) - 1, Number(offset) - 1 + Number(length)))
const compareSqlText = (a: unknown, b: unknown): number => Buffer.compare(Buffer.from(String(a)), Buffer.from(String(b)))

// The native SQLite tests verify SQL semantics. This shared browser fixture
// follows the emitted identity predicates and returns D1's BLOB byte-array shape.
export const readFakeStoragePublicationRows = (state: State, sql: string, values: unknown[]): FakeRow[] | null => {
  if (sql.startsWith('insert into document_publications')) {
    const [workspaceId, documentId, canonicalPath, documentRevision, contentHash, status,
      publishedByUserId, publishedAt, updatedAt, selectedWorkspace, selectedId, selectedPath, selectedRevision, selectedHash] = values
    if (!sql.includes(') select ') || !sql.includes('returning document_id as id')) {
      throw new Error('Unsupported publication mutation in fixture')
    }
    const document = state.documents.get(String(selectedId))
    if (!document || document.workspace_id !== selectedWorkspace || document.canonical_path !== selectedPath
      || Number(document.deleted || 0) !== 0
      || (sql.includes('and revision = ?') && (document.revision !== selectedRevision || document.content_hash !== selectedHash))) return []
    state.documentPublications.set(`${workspaceId}::${documentId}`, {
      workspace_id: workspaceId, document_id: documentId, canonical_path: canonicalPath,
      document_revision: documentRevision, content_hash: contentHash, status,
      published_by_user_id: publishedByUserId, published_at: publishedAt, updated_at: updatedAt,
    })
    return [{ id: documentId, canonical_path: canonicalPath, revision: documentRevision, content_hash: contentHash, status, updated_at: updatedAt }]
  }
  if (sql.startsWith('select id, revision, content_hash, length(cast(content_md as blob)) as content_bytes')) {
    const [workspaceId, canonicalPath] = values
    const document = Array.from(state.documents.values()).find(row => row.workspace_id === workspaceId
      && row.canonical_path === canonicalPath && Number(row.deleted || 0) === 0
      && (!sql.includes('and exists (') || isPublished(state, row)))
    return document ? [{ id: document.id, revision: document.revision, content_hash: document.content_hash,
      content_bytes: new TextEncoder().encode(String(document.content_md ?? '')).byteLength }] : []
  }
  if (sql.startsWith('select substr(cast(content_md as blob), ?, ?) as segment from documents')) {
    const [offset, length, ...identity] = values
    const document = readIdentity(state, sql, identity)
    return document ? [{ segment: segment(document.content_md, offset, length) }] : []
  }
  if (sql.startsWith('select document_chunks.id, document_chunks.chunk_order,') && sql.includes('from documents left join document_chunks')) {
    const [offset, length, lastOrder, , lastId, ...identity] = values
    const document = readIdentity(state, sql, identity)
    if (!document) return []
    const chunk = Array.from(state.documentChunks.values())
      .filter(row => row.workspace_id === document.workspace_id && row.document_id === document.id)
      .filter(row => Number(row.chunk_order) > Number(lastOrder) || (Number(row.chunk_order) === Number(lastOrder) && compareSqlText(row.id, lastId) > 0))
      .sort((a, b) => Number(a.chunk_order) - Number(b.chunk_order) || compareSqlText(a.id, b.id))[0]
    return chunk ? [{ id: chunk.id, chunk_order: chunk.chunk_order, segment: segment(chunk.markdown, offset, length),
      content_bytes: new TextEncoder().encode(String(chunk.markdown ?? '')).byteLength }]
      : [{ id: null, chunk_order: null, segment: null, content_bytes: null }]
  }
  return null
}
