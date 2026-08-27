import {
  AGENTICGRAPH_STORAGE_API_VERSION,
  AGENTICGRAPH_STORAGE_DEFAULT_WORKSPACE_ID,
  AGENTICGRAPH_STORAGE_ROUTE_PATHS,
  type AgenticGraphStorageErrorResponse,
  type AgenticGraphStorageWorkerEnv,
} from './contract'
import type { D1DatabaseLike } from './db'
import {
  handleCrawlerSourceFiles,
  isAgenticGraphStorageCrawlerRoute,
  readAgenticGraphStorageCrawlerWorkspaceId,
} from './crawler'
import { AGENTICGRAPH_STORAGE_DOC_VIEW_HEADERS } from '../shared/publishedDoc'
import {
  authenticateAgenticGraphStorageSyncRequest,
  authorizeAgenticGraphStorageWorkspace,
  isAgenticGraphStorageLocalRuntime,
} from './storageSyncSecurity'
import { AgenticGraphStorageDocumentReadLimitError } from './storageDocumentReadBounds'
import { createAgenticGraphStorageDocumentStream } from './storageDocumentStream'
import {
  hasAgenticGraphStorageSessionCredential,
  isAgenticGraphStorageDocumentPublished,
} from './storagePublication'

const errorResponse = (
  status: number,
  error: string,
  corsHeaders: Record<string, string>,
): Response => new Response(JSON.stringify({
  ok: false,
  apiVersion: AGENTICGRAPH_STORAGE_API_VERSION,
  code: status === 404 ? 'not_found' : 'bad_request',
  error,
} satisfies AgenticGraphStorageErrorResponse), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...corsHeaders },
})

const decode = (value: string): string => {
  try { return decodeURIComponent(value).trim() } catch { return '' }
}

const readDocumentRoute = (pathname: string): { workspaceId: string; canonicalPath: string } | null => {
  if (pathname.startsWith(AGENTICGRAPH_STORAGE_ROUTE_PATHS.defaultDocPrefix)) {
    const canonicalPath = decode(pathname.slice(AGENTICGRAPH_STORAGE_ROUTE_PATHS.defaultDocPrefix.length))
    return canonicalPath ? { workspaceId: AGENTICGRAPH_STORAGE_DEFAULT_WORKSPACE_ID, canonicalPath } : null
  }
  if (!pathname.startsWith(AGENTICGRAPH_STORAGE_ROUTE_PATHS.docPrefix)) return null
  const suffix = pathname.slice(AGENTICGRAPH_STORAGE_ROUTE_PATHS.docPrefix.length)
  const firstSlash = suffix.indexOf('/')
  if (firstSlash < 1) return null
  const workspaceId = decode(suffix.slice(0, firstSlash))
  const canonicalPath = decode(suffix.slice(firstSlash + 1))
  return workspaceId && canonicalPath ? { workspaceId, canonicalPath } : null
}

export const handleSecuredAgenticGraphStorageDocumentRoute = async (args: {
  request: Request
  pathname: string
  env: AgenticGraphStorageWorkerEnv
  db: D1DatabaseLike
  corsHeaders: Record<string, string>
}): Promise<Response | null> => {
  const documentRoute = readDocumentRoute(args.pathname)
  const crawlerWorkspaceId = isAgenticGraphStorageCrawlerRoute(args.pathname)
    ? readAgenticGraphStorageCrawlerWorkspaceId(args.pathname)
    : null
  const workspaceId = documentRoute?.workspaceId || crawlerWorkspaceId
  if (!workspaceId) return null
  const trustedLocal = isAgenticGraphStorageLocalRuntime(args.env)
  const credentialed = trustedLocal || hasAgenticGraphStorageSessionCredential(args.request)
  if (credentialed) {
    if (!trustedLocal) {
      const auth = await authenticateAgenticGraphStorageSyncRequest(args.request, args.env, args.db)
      if (auth.ok === false) return auth.response
      const access = await authorizeAgenticGraphStorageWorkspace({
        db: args.db,
        workspaceId,
        principal: auth.principal,
        access: 'read',
      })
      if (access.ok === false) return access.response
    }
  } else if (documentRoute && !await isAgenticGraphStorageDocumentPublished(args.db, documentRoute)) {
    return errorResponse(404, 'document not found', args.corsHeaders)
  }
  if (args.request.method !== 'GET') {
    return errorResponse(405, 'unsupported document route method', args.corsHeaders)
  }
  if (!documentRoute) {
    try {
      return await handleCrawlerSourceFiles(args.request, args.db, args.corsHeaders, { publishedOnly: !credentialed })
    } catch (error) {
      if (error instanceof AgenticGraphStorageDocumentReadLimitError) {
        return errorResponse(413, error.message, args.corsHeaders)
      }
      throw error
    }
  }
  const body = await createAgenticGraphStorageDocumentStream(args.db, documentRoute)
  if (body === null) return errorResponse(404, 'document not found', args.corsHeaders)
  return new Response(body, {
    status: 200,
    headers: { ...AGENTICGRAPH_STORAGE_DOC_VIEW_HEADERS, ...args.corsHeaders },
  })
}
