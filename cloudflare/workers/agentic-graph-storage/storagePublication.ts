import {
  AGENTIC_OS_STORAGE_API_VERSION,
  AGENTIC_OS_STORAGE_ROUTE_PATHS,
  type AgenticGraphStorageWorkerEnv,
} from './contract'
import { normalizeString, queryFirst, type D1DatabaseLike } from './db'
import { hasAgenticGraphStorageBrowserSessionCredential } from './chatAuth'
import {
  authenticateAgenticGraphStorageSnapshotRequest,
  authorizeAgenticGraphStorageWorkspace,
  readBoundedAgenticGraphStorageSyncJson,
} from './storageSyncSecurity'

export const AGENTIC_OS_STORAGE_PUBLICATION_ROUTE = AGENTIC_OS_STORAGE_ROUTE_PATHS.publications

type DocumentIdentity = { id: string; canonical_path: string; revision: number; content_hash: string }

const json = (status: number, body: unknown): Response => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
})

export const isAgenticGraphStoragePublicationRoute = (pathname: string): boolean =>
  pathname === AGENTIC_OS_STORAGE_PUBLICATION_ROUTE

export const hasAgenticGraphStorageSessionCredential = (request: Request): boolean =>
  /^Bearer\s+\S+$/i.test(String(request.headers.get('authorization') || '').trim())
  || Boolean(normalizeString(request.headers.get('x-agentic-graph-session-token')))
  || hasAgenticGraphStorageBrowserSessionCredential(request)

export const handleAgenticGraphStoragePublicationRoute = async (args: {
  request: Request
  env: AgenticGraphStorageWorkerEnv
  db: D1DatabaseLike
}): Promise<Response> => {
  const auth = await authenticateAgenticGraphStorageSnapshotRequest(args.request, args.env, args.db)
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
  const hasExpectedIdentity = body?.expectedRevision !== undefined || body?.expectedContentHash !== undefined
  if (hasExpectedIdentity && (!Number.isSafeInteger(body?.expectedRevision)
    || Number(body?.expectedRevision) < 1
    || typeof body?.expectedContentHash !== 'string' || !body.expectedContentHash.trim())) {
    return json(400, { ok: false, code: 'bad_request', error: 'expectedRevision and expectedContentHash must be supplied together' })
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
  if (canonicalPath && document.canonical_path !== canonicalPath) {
    return json(409, { ok: false, code: 'conflict', error: 'document identity does not match the canonical path' })
  }
  if (action === 'publish' && hasExpectedIdentity
    && (document.revision !== body?.expectedRevision || document.content_hash !== body?.expectedContentHash)) {
    return json(409, { ok: false, code: 'conflict', error: 'document changed before publication' })
  }
  const nowIso = new Date().toISOString()
  const committed = await queryFirst<DocumentIdentity & { status: string; updated_at: string }>(args.db,
    `insert into document_publications (
       workspace_id, document_id, canonical_path, document_revision, content_hash,
       status, published_by_user_id, published_at, updated_at
     ) select ?, ?, ?, ?, ?, ?, ?, ?, ? from documents
       where workspace_id = ? and id = ? and canonical_path = ? and deleted = 0
         ${action === 'publish' ? 'and revision = ? and content_hash = ?' : ''}
     on conflict(workspace_id, document_id) do update set
       canonical_path = excluded.canonical_path,
       document_revision = excluded.document_revision,
       content_hash = excluded.content_hash,
       status = excluded.status,
       published_by_user_id = excluded.published_by_user_id,
       published_at = excluded.published_at,
       updated_at = excluded.updated_at
     returning document_id as id, canonical_path, document_revision as revision,
               content_hash, status, updated_at`,
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
      workspaceId,
      document.id,
      document.canonical_path,
      ...(action === 'publish' ? [document.revision, document.content_hash] : []),
    ])
  if (!committed) return json(409, { ok: false, code: 'conflict', error: 'document changed while publication was being committed' })
  return json(200, {
    ok: true,
    apiVersion: AGENTIC_OS_STORAGE_API_VERSION,
    workspaceId,
    documentId: committed.id,
    canonicalPath: committed.canonical_path,
    status: committed.status,
    revision: committed.revision,
    contentHash: committed.content_hash,
    updatedAt: committed.updated_at,
  })
}
