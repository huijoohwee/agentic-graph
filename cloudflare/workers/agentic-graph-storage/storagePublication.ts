import {
  AGENTIC_OS_STORAGE_API_VERSION,
  type AgenticGraphStorageWorkerEnv,
} from './contract'
import { execute, normalizeString, queryFirst, type D1DatabaseLike } from './db'
import {
  authenticateAgenticGraphStorageSyncRequest,
  authorizeAgenticGraphStorageWorkspace,
  readBoundedAgenticGraphStorageSyncJson,
} from './storageSyncSecurity'

export const AGENTIC_OS_STORAGE_PUBLICATION_ROUTE = '/api/storage/publications'

type DocumentIdentity = { id: string; canonical_path: string; revision: number; content_hash: string }

const json = (status: number, body: unknown): Response => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
})

export const isAgenticGraphStoragePublicationRoute = (pathname: string): boolean =>
  pathname === AGENTIC_OS_STORAGE_PUBLICATION_ROUTE

export const isAgenticGraphStorageDocumentPublished = async (
  db: D1DatabaseLike,
  args: { workspaceId: string; canonicalPath: string },
): Promise<boolean> => Boolean(await queryFirst(db,
  `select 1 as allowed from document_publications
   join documents on documents.id = document_publications.document_id
   where document_publications.workspace_id = ?
     and document_publications.canonical_path = ?
     and document_publications.status = 'published'
     and documents.workspace_id = document_publications.workspace_id
     and documents.canonical_path = document_publications.canonical_path
     and documents.revision = document_publications.document_revision
     and documents.content_hash = document_publications.content_hash
     and documents.deleted = 0
   limit 1`, [args.workspaceId, args.canonicalPath]))

export const hasAgenticGraphStorageSessionCredential = (request: Request): boolean =>
  /^Bearer\s+\S+$/i.test(String(request.headers.get('authorization') || '').trim())
  || Boolean(normalizeString(request.headers.get('x-agentic-graph-session-token')))

export const handleAgenticGraphStoragePublicationRoute = async (args: {
  request: Request
  env: AgenticGraphStorageWorkerEnv
  db: D1DatabaseLike
}): Promise<Response> => {
  const auth = await authenticateAgenticGraphStorageSyncRequest(args.request, args.env, args.db)
  if (auth.ok === false) return auth.response
  if (auth.principal.local) return json(403, { ok: false, code: 'forbidden', error: 'local runtime cannot publish documents' })
  if (args.request.method !== 'POST') return json(405, { ok: false, code: 'bad_request', error: 'publication changes require POST' })
  const parsed = await readBoundedAgenticGraphStorageSyncJson(args.request)
  if (parsed.ok === false) return parsed.response
  const body = parsed.value && typeof parsed.value === 'object' && !Array.isArray(parsed.value)
    ? parsed.value as Record<string, unknown>
    : null
  const workspaceId = normalizeString(body?.workspaceId)
  const documentId = normalizeString(body?.documentId)
  const canonicalPath = normalizeString(body?.canonicalPath)
  const action = body?.action === 'publish' || body?.action === 'revoke' ? body.action : null
  if (!workspaceId || (!documentId && !canonicalPath) || !action) {
    return json(400, { ok: false, code: 'bad_request', error: 'workspaceId, document identity, and action are required' })
  }
  const access = await authorizeAgenticGraphStorageWorkspace({
    db: args.db,
    workspaceId,
    principal: auth.principal,
    access: 'write',
  })
  if (access.ok === false) return access.response
  const document = await queryFirst<DocumentIdentity>(args.db,
    `select id, canonical_path, revision, content_hash from documents
     where workspace_id = ? and deleted = 0
       and (${documentId ? 'id = ?' : 'canonical_path = ?'}) limit 1`,
    [workspaceId, documentId || canonicalPath])
  if (!document) return json(404, { ok: false, code: 'not_found', error: 'document not found' })
  const nowIso = new Date().toISOString()
  await execute(args.db,
    `insert into document_publications (
       workspace_id, document_id, canonical_path, document_revision, content_hash,
       status, published_by_user_id, published_at, updated_at
     ) values (?, ?, ?, ?, ?, ?, ?, ?, ?)
     on conflict(workspace_id, document_id) do update set
       canonical_path = excluded.canonical_path,
       document_revision = excluded.document_revision,
       content_hash = excluded.content_hash,
       status = excluded.status,
       published_by_user_id = excluded.published_by_user_id,
       published_at = excluded.published_at,
       updated_at = excluded.updated_at`,
    [
      workspaceId,
      document.id,
      document.canonical_path,
      document.revision,
      document.content_hash,
      action === 'publish' ? 'published' : 'revoked',
      'userId' in auth.principal ? auth.principal.userId : '',
      nowIso,
      nowIso,
    ])
  return json(200, {
    ok: true,
    apiVersion: AGENTIC_OS_STORAGE_API_VERSION,
    workspaceId,
    documentId: document.id,
    canonicalPath: document.canonical_path,
    status: action === 'publish' ? 'published' : 'revoked',
    revision: document.revision,
    contentHash: document.content_hash,
    updatedAt: nowIso,
  })
}
