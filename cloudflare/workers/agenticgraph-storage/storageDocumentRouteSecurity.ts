import {
  KNOWGRPH_STORAGE_API_VERSION,
  KNOWGRPH_STORAGE_DEFAULT_WORKSPACE_ID,
  KNOWGRPH_STORAGE_ROUTE_PATHS,
  type KnowgrphStorageErrorResponse,
  type KnowgrphStorageWorkerEnv,
} from './contract'
import type { D1DatabaseLike } from './db'
import {
  handleCrawlerSourceFiles,
  isKnowgrphStorageCrawlerRoute,
  readKnowgrphStorageCrawlerWorkspaceId,
} from './crawler'
import { KNOWGRPH_STORAGE_DOC_VIEW_HEADERS } from '../shared/publishedDoc'
import {
  authenticateKnowgrphStorageSyncRequest,
  authorizeKnowgrphStorageWorkspace,
  isKnowgrphStorageLocalRuntime,
} from './storageSyncSecurity'
import { KnowgrphStorageDocumentReadLimitError } from './storageDocumentReadBounds'
import { createKnowgrphStorageDocumentStream } from './storageDocumentStream'
import {
  hasKnowgrphStorageSessionCredential,
  isKnowgrphStorageDocumentPublished,
} from './storagePublication'

const errorResponse = (
  status: number,
  error: string,
  corsHeaders: Record<string, string>,
): Response => new Response(JSON.stringify({
  ok: false,
  apiVersion: KNOWGRPH_STORAGE_API_VERSION,
  code: status === 404 ? 'not_found' : 'bad_request',
  error,
} satisfies KnowgrphStorageErrorResponse), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...corsHeaders },
})

const decode = (value: string): string => {
  try { return decodeURIComponent(value).trim() } catch { return '' }
}

const readDocumentRoute = (pathname: string): { workspaceId: string; canonicalPath: string } | null => {
  if (pathname.startsWith(KNOWGRPH_STORAGE_ROUTE_PATHS.defaultDocPrefix)) {
    const canonicalPath = decode(pathname.slice(KNOWGRPH_STORAGE_ROUTE_PATHS.defaultDocPrefix.length))
    return canonicalPath ? { workspaceId: KNOWGRPH_STORAGE_DEFAULT_WORKSPACE_ID, canonicalPath } : null
  }
  if (!pathname.startsWith(KNOWGRPH_STORAGE_ROUTE_PATHS.docPrefix)) return null
  const suffix = pathname.slice(KNOWGRPH_STORAGE_ROUTE_PATHS.docPrefix.length)
  const firstSlash = suffix.indexOf('/')
  if (firstSlash < 1) return null
  const workspaceId = decode(suffix.slice(0, firstSlash))
  const canonicalPath = decode(suffix.slice(firstSlash + 1))
  return workspaceId && canonicalPath ? { workspaceId, canonicalPath } : null
}

export const handleSecuredKnowgrphStorageDocumentRoute = async (args: {
  request: Request
  pathname: string
  env: KnowgrphStorageWorkerEnv
  db: D1DatabaseLike
  corsHeaders: Record<string, string>
}): Promise<Response | null> => {
  const documentRoute = readDocumentRoute(args.pathname)
  const crawlerWorkspaceId = isKnowgrphStorageCrawlerRoute(args.pathname)
    ? readKnowgrphStorageCrawlerWorkspaceId(args.pathname)
    : null
  const workspaceId = documentRoute?.workspaceId || crawlerWorkspaceId
  if (!workspaceId) return null
  const trustedLocal = isKnowgrphStorageLocalRuntime(args.env)
  const credentialed = trustedLocal || hasKnowgrphStorageSessionCredential(args.request)
  if (credentialed) {
    if (!trustedLocal) {
      const auth = await authenticateKnowgrphStorageSyncRequest(args.request, args.env, args.db)
      if (auth.ok === false) return auth.response
      const access = await authorizeKnowgrphStorageWorkspace({
        db: args.db,
        workspaceId,
        principal: auth.principal,
        access: 'read',
      })
      if (access.ok === false) return access.response
    }
  } else if (documentRoute && !await isKnowgrphStorageDocumentPublished(args.db, documentRoute)) {
    return errorResponse(404, 'document not found', args.corsHeaders)
  }
  if (args.request.method !== 'GET') {
    return errorResponse(405, 'unsupported document route method', args.corsHeaders)
  }
  if (!documentRoute) {
    try {
      return await handleCrawlerSourceFiles(args.request, args.db, args.corsHeaders, { publishedOnly: !credentialed })
    } catch (error) {
      if (error instanceof KnowgrphStorageDocumentReadLimitError) {
        return errorResponse(413, error.message, args.corsHeaders)
      }
      throw error
    }
  }
  const body = await createKnowgrphStorageDocumentStream(args.db, documentRoute)
  if (body === null) return errorResponse(404, 'document not found', args.corsHeaders)
  return new Response(body, {
    status: 200,
    headers: { ...KNOWGRPH_STORAGE_DOC_VIEW_HEADERS, ...args.corsHeaders },
  })
}
