import {
  buildKnowgrphStorageExportPath,
  type KnowgrphStorageExportResponse,
} from '@/lib/storage/knowgrphStorageSyncContract'
import type { KnowgrphStorageSyncNowArgs } from '@/lib/storage/knowgrphStorageClientTypes'
import { normalizeString } from '@/lib/storage/knowgrphStorageClientSupport'
import {
  buildApiOriginKey,
  buildKnowgrphStorageSyncAuthHeaders,
  getClientFetch,
  parseStorageResponseJson,
  resolveKnowgrphStorageApiUrl,
} from '@/lib/storage/knowgrphStorageClientTransport'

type ExportArgs = Pick<KnowgrphStorageSyncNowArgs, 'workspaceId' | 'baseUrl' | 'sessionToken' | 'fetchImpl'>

export const exportKnowgrphStorageWorkspacePages = async function* (
  args: ExportArgs,
): AsyncGenerator<KnowgrphStorageExportResponse, void, void> {
  const workspaceId = normalizeString(args.workspaceId)
  if (!workspaceId) throw new Error('workspaceId is required for storage export')
  const fetchImpl = getClientFetch(args.fetchImpl)
  const apiOrigin = buildApiOriginKey(args.baseUrl)
  let pageCursor: string | null = null
  for (let pageIndex = 0; pageIndex < 10_000; pageIndex += 1) {
    const exportUrl = resolveKnowgrphStorageApiUrl(buildKnowgrphStorageExportPath(workspaceId), args.baseUrl)
    const pageUrl = pageCursor
      ? `${exportUrl}${exportUrl.includes('?') ? '&' : '?'}cursor=${encodeURIComponent(pageCursor)}`
      : exportUrl
    const response = await fetchImpl(pageUrl, {
      method: 'GET', headers: buildKnowgrphStorageSyncAuthHeaders(args.sessionToken),
    })
    const json = await parseStorageResponseJson<KnowgrphStorageExportResponse | { ok?: false; error?: string }>(response, {
      requestLabel: 'knowgrph storage export', apiOrigin,
    })
    if (!response.ok || !json || json.ok !== true) {
      throw new Error(`knowgrph storage export failed: ${String((json as { error?: unknown })?.error || 'request failed')}`)
    }
    yield json
    const next = normalizeString(json.nextPageCursor) || null
    if (json.pageComplete !== false || !next) return
    if (next === pageCursor) throw new Error('knowgrph storage export returned a non-advancing page cursor')
    pageCursor = next
  }
  throw new Error('knowgrph storage export exceeded the 10000-page safety limit')
}

export const exportKnowgrphStorageWorkspace = async (args: ExportArgs): Promise<KnowgrphStorageExportResponse> => {
  let result: KnowgrphStorageExportResponse | null = null
  const documents: KnowgrphStorageExportResponse['documents'] = []
  const documentChunks: KnowgrphStorageExportResponse['documentChunks'] = []
  const graphSnapshots: KnowgrphStorageExportResponse['graphSnapshots'] = []
  for await (const page of exportKnowgrphStorageWorkspacePages(args)) {
    result = page
    documents.push(...page.documents)
    documentChunks.push(...page.documentChunks)
    graphSnapshots.push(...page.graphSnapshots)
  }
  if (!result) throw new Error('knowgrph storage export returned no page')
  return { ...result, nextPageCursor: null, pageComplete: true, documents, documentChunks, graphSnapshots }
}
