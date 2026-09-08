import {
  buildAgenticGraphStorageExportPath,
  AGENTIC_OS_STORAGE_SYNC_LIMITS,
  type AgenticGraphStorageExportResponse,
} from '@/lib/storage/agentic-graph-storage-sync-contract'
import type { AgenticGraphStorageSyncNowArgs } from '@/lib/storage/agentic-graph-storage-client-types'
import { normalizeString } from '@/lib/storage/agentic-graph-storage-client-support'
import {
  buildApiOriginKey,
  buildAgenticGraphStorageSyncAuthHeaders,
  getClientFetch,
  fetchWithTimeout,
  AgenticGraphStorageResponseLimitError,
  parseStorageResponseJson,
  resolveAgenticGraphStorageApiUrl,
} from '@/lib/storage/agentic-graph-storage-client-transport'

const MAX_EXPORT_PAGES = 10_000
// Matches the native storage cursor decoder's accepted token length.
const MAX_EXPORT_CURSOR_CHARS = 4_096

type ExportArgs = Pick<AgenticGraphStorageSyncNowArgs, 'workspaceId' | 'baseUrl' | 'sessionToken' | 'fetchImpl' | 'requestTimeoutMs'>

export const exportAgenticGraphStorageWorkspacePages = async function* (
  args: ExportArgs,
): AsyncGenerator<AgenticGraphStorageExportResponse, void, void> {
  const workspaceId = normalizeString(args.workspaceId)
  if (!workspaceId) throw new Error('workspaceId is required for storage export')
  const fetchImpl = getClientFetch(args.fetchImpl)
  const apiOrigin = buildApiOriginKey(args.baseUrl)
  let pageCursor: string | null = null
  const visitedCursors = new Set<string>()
  for (let pageIndex = 0; pageIndex < MAX_EXPORT_PAGES; pageIndex += 1) {
    const exportUrl = resolveAgenticGraphStorageApiUrl(buildAgenticGraphStorageExportPath(workspaceId), args.baseUrl)
    const pageUrl = pageCursor
      ? `${exportUrl}${exportUrl.includes('?') ? '&' : '?'}cursor=${encodeURIComponent(pageCursor)}`
      : exportUrl
    const response = await fetchWithTimeout({
      fetchImpl, input: pageUrl, timeoutMs: args.requestTimeoutMs,
      init: { method: 'GET', headers: buildAgenticGraphStorageSyncAuthHeaders(args.sessionToken) },
    })
    const json = await parseStorageResponseJson<AgenticGraphStorageExportResponse | { ok?: false; error?: string }>(response, {
      requestLabel: 'agentic-graph storage export', apiOrigin,
    })
    if (!response.ok || !json || json.ok !== true) {
      throw new Error(`agentic-graph storage export failed: ${String((json as { error?: unknown })?.error || 'request failed')}`)
    }
    if (json.workspaceId !== workspaceId) throw new Error('agentic-graph storage export returned a different workspace')
    let rowCount = 0
    for (const field of ['documents', 'documentChunks', 'graphSnapshots'] as const) {
      const rows = json[field]
      if (!Array.isArray(rows)) throw new Error(`agentic-graph storage export returned invalid ${field}`)
      rowCount += rows.length
      if (rowCount > AGENTIC_OS_STORAGE_SYNC_LIMITS.maxResultRows) {
        throw new AgenticGraphStorageResponseLimitError('agentic-graph storage export exceeds the page row limit')
      }
      for (const row of rows) {
        if (!row || typeof row !== 'object' || Array.isArray(row)
          || typeof row.id !== 'string' || !row.id.trim() || row.workspaceId !== workspaceId) {
          throw new Error(`agentic-graph storage export returned invalid ${field} row identity or workspace`)
        }
      }
    }
    if (json.pageComplete !== undefined && typeof json.pageComplete !== 'boolean') {
      throw new Error('agentic-graph storage export returned invalid page completion')
    }
    if (json.nextPageCursor != null && typeof json.nextPageCursor !== 'string') {
      throw new Error('agentic-graph storage export returned an invalid page cursor')
    }
    const next = normalizeString(json.nextPageCursor) || null
    const complete = json.pageComplete !== false
    if (!complete && !next) throw new Error('agentic-graph storage export incomplete page is missing its next cursor')
    if (complete && next) throw new Error('agentic-graph storage export complete page has an unexpected next cursor')
    if (next) {
      if (next.length > MAX_EXPORT_CURSOR_CHARS) throw new Error('agentic-graph storage export page cursor exceeds the native length limit')
      if (next === pageCursor) throw new Error('agentic-graph storage export returned a non-advancing page cursor')
      if (visitedCursors.has(next)) throw new Error('agentic-graph storage export returned a cyclic page cursor')
      if (pageIndex + 1 >= MAX_EXPORT_PAGES) throw new Error('agentic-graph storage export exceeded the 10000-page safety limit')
      visitedCursors.add(next)
    }
    // No page reaches a consumer before its own identity and continuation validate.
    yield json
    if (complete) return
    pageCursor = next
  }
  throw new Error('agentic-graph storage export exceeded the 10000-page safety limit')
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
  if (!result) throw new Error('agentic-graph storage export returned no page')
  return { ...result, nextPageCursor: null, pageComplete: true, documents, documentChunks, graphSnapshots }
}
