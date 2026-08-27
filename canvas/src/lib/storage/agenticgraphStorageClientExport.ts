import {
  buildAgenticGraphStorageExportPath,
  type AgenticGraphStorageExportResponse,
} from '@/lib/storage/agenticgraphStorageSyncContract'
import type { AgenticGraphStorageSyncNowArgs } from '@/lib/storage/agenticgraphStorageClientTypes'
import { normalizeString } from '@/lib/storage/agenticgraphStorageClientSupport'
import {
  buildApiOriginKey,
  buildAgenticGraphStorageSyncAuthHeaders,
  getClientFetch,
  parseStorageResponseJson,
  resolveAgenticGraphStorageApiUrl,
} from '@/lib/storage/agenticgraphStorageClientTransport'

type ExportArgs = Pick<AgenticGraphStorageSyncNowArgs, 'workspaceId' | 'baseUrl' | 'sessionToken' | 'fetchImpl'>

export const exportAgenticGraphStorageWorkspacePages = async function* (
  args: ExportArgs,
): AsyncGenerator<AgenticGraphStorageExportResponse, void, void> {
  const workspaceId = normalizeString(args.workspaceId)
  if (!workspaceId) throw new Error('workspaceId is required for storage export')
  const fetchImpl = getClientFetch(args.fetchImpl)
  const apiOrigin = buildApiOriginKey(args.baseUrl)
  let pageCursor: string | null = null
  for (let pageIndex = 0; pageIndex < 10_000; pageIndex += 1) {
    const exportUrl = resolveAgenticGraphStorageApiUrl(buildAgenticGraphStorageExportPath(workspaceId), args.baseUrl)
    const pageUrl = pageCursor
      ? `${exportUrl}${exportUrl.includes('?') ? '&' : '?'}cursor=${encodeURIComponent(pageCursor)}`
      : exportUrl
    const response = await fetchImpl(pageUrl, {
      method: 'GET', headers: buildAgenticGraphStorageSyncAuthHeaders(args.sessionToken),
    })
    const json = await parseStorageResponseJson<AgenticGraphStorageExportResponse | { ok?: false; error?: string }>(response, {
      requestLabel: 'agenticgraph storage export', apiOrigin,
    })
    if (!response.ok || !json || json.ok !== true) {
      throw new Error(`agenticgraph storage export failed: ${String((json as { error?: unknown })?.error || 'request failed')}`)
    }
    yield json
    const next = normalizeString(json.nextPageCursor) || null
    if (json.pageComplete !== false || !next) return
    if (next === pageCursor) throw new Error('agenticgraph storage export returned a non-advancing page cursor')
    pageCursor = next
  }
  throw new Error('agenticgraph storage export exceeded the 10000-page safety limit')
}

export const exportAgenticGraphStorageWorkspace = async (args: ExportArgs): Promise<AgenticGraphStorageExportResponse> => {
  let result: AgenticGraphStorageExportResponse | null = null
  const documents: AgenticGraphStorageExportResponse['documents'] = []
  const documentChunks: AgenticGraphStorageExportResponse['documentChunks'] = []
  const graphSnapshots: AgenticGraphStorageExportResponse['graphSnapshots'] = []
  for await (const page of exportAgenticGraphStorageWorkspacePages(args)) {
    result = page
    documents.push(...page.documents)
    documentChunks.push(...page.documentChunks)
    graphSnapshots.push(...page.graphSnapshots)
  }
  if (!result) throw new Error('agenticgraph storage export returned no page')
  return { ...result, nextPageCursor: null, pageComplete: true, documents, documentChunks, graphSnapshots }
}
