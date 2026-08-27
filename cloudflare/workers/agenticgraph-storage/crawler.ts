import {
  CLOUDFLARE_PAY_PER_CRAWL_DOC_URL,
  CLOUDFLARE_PAY_PER_CRAWL_REQUEST_HEADERS,
  CLOUDFLARE_PAY_PER_CRAWL_RESPONSE_HEADERS,
  AGENTICGRAPH_STORAGE_CRAWLER_ACCESS_HEADERS,
  AGENTICGRAPH_STORAGE_DEFAULT_WORKSPACE_ID,
  AGENTICGRAPH_STORAGE_ROUTE_PATHS,
  buildAgenticGraphStorageDefaultDocPath,
  buildAgenticGraphStorageDocPath,
  buildAgenticGraphStorageExportPath,
  buildAgenticGraphStorageLlmsPath,
  buildAgenticGraphStorageSourceFilesIndexPath,
} from './contract'
import {
  AGENTICGRAPH_MARKDOWN_CONTENT_MANIFEST_PATH,
  AGENTICGRAPH_MARKDOWN_CONTENT_MANIFEST_SCHEMA,
  AGENTICGRAPH_MARKDOWN_CONTENT_MANIFEST_SUFFIX,
  buildAgenticGraphMarkdownContentManifestPath,
} from '../../../canvas/src/lib/storage/markdownContentManifestContract'
import {
  type D1DatabaseLike,
  type CrawlerDocumentRow,
  normalizeNumber,
  normalizeString,
} from './db'
import {
  assertBoundedCrawlerResponse,
  readBoundedCrawlerDocumentRows,
} from './storageDocumentReadBounds'
import {
  decodeAgenticGraphStorageCrawlerCursor,
  encodeAgenticGraphStorageCrawlerCursor,
} from './storageCrawlerCursor'

type CrawlerDocument = {
  id: string
  canonicalPath: string
  title: string
  docType: string
  contentHash: string
  revision: number
  updatedAt: string
  contentLength: number
}

type CrawlerRoute = {
  workspaceId: string
  format: 'index' | 'llms' | 'manifest'
}

const SOURCE_FILES_LLM_SUFFIX = '/llms.txt'

export const isDiscoverableCrawlerDocument = (document: Pick<CrawlerDocument, 'id' | 'canonicalPath' | 'contentLength'>): boolean =>
  Boolean(document.id && document.canonicalPath && document.contentLength > 0)

const decodeRouteSegment = (value: string): string => {
  try {
    return decodeURIComponent(value)
  } catch {
    return ''
  }
}

const escapeMarkdownText = (value: unknown): string =>
  String(value || '')
    .replace(/\\/g, '\\\\')
    .replace(/\[/g, '\\[')
    .replace(/\]/g, '\\]')
    .replace(/`/g, '\\`')
    .trim()

const code = (value: unknown): string =>
  `\`${String(value || '').replace(/`/g, '\\`').trim()}\``

const absoluteUrl = (requestUrl: string, path: string): string =>
  new URL(path, requestUrl).toString()

const buildCrawlerDocPath = (workspaceId: string, canonicalPath: string): string =>
  workspaceId === AGENTICGRAPH_STORAGE_DEFAULT_WORKSPACE_ID
    ? buildAgenticGraphStorageDefaultDocPath(canonicalPath)
    : buildAgenticGraphStorageDocPath(workspaceId, canonicalPath)

const readCrawlerRoute = (pathname: string): CrawlerRoute | null => {
  if (pathname === AGENTICGRAPH_MARKDOWN_CONTENT_MANIFEST_PATH) {
    return { workspaceId: AGENTICGRAPH_STORAGE_DEFAULT_WORKSPACE_ID, format: 'manifest' }
  }
  if (pathname === AGENTICGRAPH_STORAGE_ROUTE_PATHS.sourceFilesLlms) {
    return { workspaceId: AGENTICGRAPH_STORAGE_DEFAULT_WORKSPACE_ID, format: 'llms' }
  }
  if (pathname === AGENTICGRAPH_STORAGE_ROUTE_PATHS.sourceFilesIndex) {
    return { workspaceId: AGENTICGRAPH_STORAGE_DEFAULT_WORKSPACE_ID, format: 'index' }
  }
  if (!pathname.startsWith(AGENTICGRAPH_STORAGE_ROUTE_PATHS.sourceFilesIndexPrefix)) return null
  const suffix = pathname.slice(AGENTICGRAPH_STORAGE_ROUTE_PATHS.sourceFilesIndexPrefix.length)
  const format = suffix.endsWith(SOURCE_FILES_LLM_SUFFIX)
    ? 'llms'
    : suffix.endsWith(AGENTICGRAPH_MARKDOWN_CONTENT_MANIFEST_SUFFIX) ? 'manifest' : 'index'
  const routeSuffix = format === 'llms' ? SOURCE_FILES_LLM_SUFFIX : format === 'manifest' ? AGENTICGRAPH_MARKDOWN_CONTENT_MANIFEST_SUFFIX : ''
  const workspaceSegment = routeSuffix ? suffix.slice(0, -routeSuffix.length) : suffix
  const normalizedWorkspaceSegment = workspaceSegment.replace(/\/+$/, '')
  if (!normalizedWorkspaceSegment || normalizedWorkspaceSegment.includes('/')) return null
  const workspaceId = normalizeString(decodeRouteSegment(normalizedWorkspaceSegment))
  if (!workspaceId) return null
  return { workspaceId, format }
}

export const isAgenticGraphStorageCrawlerRoute = (pathname: string): boolean =>
  readCrawlerRoute(pathname) !== null

export const readAgenticGraphStorageCrawlerWorkspaceId = (pathname: string): string | null =>
  readCrawlerRoute(pathname)?.workspaceId || null

const readCrawlerDocuments = async (
  db: D1DatabaseLike,
  workspaceId: string,
  cursorToken: string | null,
  publishedOnly: boolean,
): Promise<{ documents: CrawlerDocument[]; nextCursor: string | null }> => {
  const after = cursorToken ? decodeAgenticGraphStorageCrawlerCursor(cursorToken, workspaceId) : null
  const page = await readBoundedCrawlerDocumentRows(db, workspaceId, after, publishedOnly)
  const documents = page.rows
    .map(row => {
      const canonicalPath = normalizeString(row.canonical_path)
      const title = normalizeString(row.title) || canonicalPath.split('/').filter(Boolean).slice(-1)[0] || normalizeString(row.id)
      return {
        id: normalizeString(row.id),
        canonicalPath,
        title,
        docType: normalizeString(row.doc_type) || 'markdown',
        contentHash: normalizeString(row.content_hash),
        revision: normalizeNumber(row.revision),
        updatedAt: normalizeString(row.updated_at),
        contentLength: normalizeNumber(row.content_length),
      }
    })
    .filter(row => row.id && row.canonicalPath)
  const last = documents.at(-1)
  return {
    documents,
    nextCursor: page.hasMore && last
      ? encodeAgenticGraphStorageCrawlerCursor({ workspaceId, canonicalPath: last.canonicalPath, id: last.id })
      : null,
  }
}

const buildCrawlerHeaders = (
  contentType: string,
  corsHeaders: Record<string, string>,
  nextPageUrl: string | null,
): HeadersInit => ({
  'content-type': contentType,
  'cache-control': 'private, no-store',
  'link': [
    `<${CLOUDFLARE_PAY_PER_CRAWL_DOC_URL}>; rel="help"; title="Cloudflare AI Crawl Control Pay Per Crawl"`,
    ...(nextPageUrl ? [`<${nextPageUrl}>; rel="next"`] : []),
  ].join(', '),
  'x-robots-tag': 'noindex, nofollow',
  [AGENTICGRAPH_STORAGE_CRAWLER_ACCESS_HEADERS.source]: 'd1-documents-doc-view',
  [AGENTICGRAPH_STORAGE_CRAWLER_ACCESS_HEADERS.payPerCrawlPolicy]: 'cloudflare-zone-policy',
  ...corsHeaders,
})

const appendAccessPolicyLines = (lines: string[]): void => {
  lines.push(
    '## Access Policy',
    '',
    '- Source Files are read from the D1-backed storage document rows and markdown doc-view route.',
    '- Cloudflare AI Crawl Control Pay Per Crawl, when enabled on the zone, owns payment negotiation before crawler-visible content is served.',
    `- Unpaid crawler requests can receive HTTP 402 with ${code(CLOUDFLARE_PAY_PER_CRAWL_RESPONSE_HEADERS.price)}; successful paid access can receive HTTP 200 with ${code(CLOUDFLARE_PAY_PER_CRAWL_RESPONSE_HEADERS.charged)}.`,
    `- AI crawler payment intent can use ${code(CLOUDFLARE_PAY_PER_CRAWL_REQUEST_HEADERS.exactPrice)} or ${code(CLOUDFLARE_PAY_PER_CRAWL_REQUEST_HEADERS.maxPrice)} when those headers are signed through Cloudflare Web Bot Auth.`,
    `- Cloudflare can return ${code(CLOUDFLARE_PAY_PER_CRAWL_RESPONSE_HEADERS.error)} when paid crawler access is rejected.`,
    '- This Worker does not emulate payment headers, prices, or crawler identity. It only exposes neutral read-only Source Files content and metadata.',
    `- Pay Per Crawl reference: ${CLOUDFLARE_PAY_PER_CRAWL_DOC_URL}`,
    '',
  )
}

const buildSourceFilesIndexMarkdown = (args: {
  requestUrl: string
  workspaceId: string
  exportedAtIso: string
  documents: CrawlerDocument[]
  nextPageUrl?: string | null
}): string => {
  const indexUrl = absoluteUrl(args.requestUrl, buildAgenticGraphStorageSourceFilesIndexPath(args.workspaceId))
  const llmsUrl = absoluteUrl(args.requestUrl, buildAgenticGraphStorageLlmsPath(args.workspaceId))
  const exportUrl = absoluteUrl(args.requestUrl, buildAgenticGraphStorageExportPath(args.workspaceId))
  const manifestUrl = absoluteUrl(args.requestUrl, buildAgenticGraphMarkdownContentManifestPath(args.workspaceId))
  const lines = [
    '# AgenticGraph Source Files',
    '',
    `Workspace: ${code(args.workspaceId)}`,
    `Generated: ${code(args.exportedAtIso)}`,
    `Documents: ${args.documents.length}`,
    '',
  ]
  appendAccessPolicyLines(lines)
  lines.push(
    '## Crawler Entry Points',
    '',
    `- [Source Files index](${indexUrl})`,
    `- [LLM text](${llmsUrl})`,
    `- [Storage export JSON](${exportUrl})`,
    `- [Markdown content manifest](${manifestUrl})`,
    '',
    '## Source Files',
    '',
  )
  if (args.documents.length === 0) {
    lines.push('- No Source Files are currently published for this workspace.')
    return `${lines.join('\n')}\n`
  }
  for (const document of args.documents) {
    const docUrl = absoluteUrl(args.requestUrl, buildCrawlerDocPath(args.workspaceId, document.canonicalPath))
    lines.push(`- [${escapeMarkdownText(document.title)}](${docUrl})`)
    lines.push(`  - canonicalPath: ${code(document.canonicalPath)}`)
    lines.push(`  - contentHash: ${code(document.contentHash)}`)
    lines.push(`  - revision: ${document.revision}`)
    lines.push(`  - updatedAt: ${code(document.updatedAt)}`)
    lines.push(`  - contentLength: ${document.contentLength}`)
  }
  if (args.nextPageUrl) lines.push('', `- [Next page](${args.nextPageUrl})`)
  return `${lines.join('\n')}\n`
}

export const buildMarkdownContentManifest = (args: {
  requestUrl: string
  workspaceId: string
  exportedAtIso: string
  documents: CrawlerDocument[]
  nextPageUrl?: string | null
}): Record<string, unknown> => ({
  schema: AGENTICGRAPH_MARKDOWN_CONTENT_MANIFEST_SCHEMA,
  workspace_id: args.workspaceId,
  generated_at: args.exportedAtIso,
  documents: args.documents.filter(isDiscoverableCrawlerDocument).map(document => {
    const encodedPath = encodeURIComponent(document.canonicalPath)
    const canonicalPath = args.workspaceId === AGENTICGRAPH_STORAGE_DEFAULT_WORKSPACE_ID
      ? `/agenticgraph/doc-default/${encodedPath}`
      : `/agenticgraph/doc/${encodeURIComponent(args.workspaceId)}/${encodedPath}`
    return {
      id: document.id,
      title: document.title,
      type: document.docType,
      source_path: document.canonicalPath,
      canonical_url: absoluteUrl(args.requestUrl, canonicalPath),
      markdown_url: absoluteUrl(args.requestUrl, buildCrawlerDocPath(args.workspaceId, document.canonicalPath)),
      content_hash: document.contentHash,
      revision: document.revision,
      updated_at: document.updatedAt,
      content_length: document.contentLength,
    }
  }),
  pagination: { next: args.nextPageUrl },
})

const buildSourceFilesLlmsText = (args: {
  requestUrl: string
  workspaceId: string
  exportedAtIso: string
  documents: CrawlerDocument[]
  nextPageUrl?: string | null
}): string => {
  const indexUrl = absoluteUrl(args.requestUrl, buildAgenticGraphStorageSourceFilesIndexPath(args.workspaceId))
  const lines = [
    '# AgenticGraph Source Files',
    '',
    '> Markdown Source Files from the AgenticGraph Editor Workspace storage boundary.',
    '',
    `Workspace: ${args.workspaceId}`,
    `Generated: ${args.exportedAtIso}`,
    `Index: ${indexUrl}`,
    '',
  ]
  appendAccessPolicyLines(lines)
  lines.push('## Documents', '')
  if (args.documents.length === 0) {
    lines.push('- No Source Files are currently published for this workspace.')
    return `${lines.join('\n')}\n`
  }
  for (const document of args.documents) {
    const docUrl = absoluteUrl(args.requestUrl, buildCrawlerDocPath(args.workspaceId, document.canonicalPath))
    lines.push(`- ${document.title}: ${docUrl}`)
  }
  if (args.nextPageUrl) lines.push('', `Next page: ${args.nextPageUrl}`)
  return `${lines.join('\n')}\n`
}

export const handleCrawlerSourceFiles = async (
  request: Request,
  db: D1DatabaseLike,
  corsHeaders: Record<string, string>,
  options: { publishedOnly?: boolean } = {},
): Promise<Response | null> => {
  const url = new URL(request.url)
  const route = readCrawlerRoute(url.pathname)
  if (!route) return null
  const nowIso = new Date().toISOString()
  let page
  try {
    page = await readCrawlerDocuments(
      db,
      route.workspaceId,
      normalizeString(url.searchParams.get('cursor')) || null,
      options.publishedOnly === true,
    )
  } catch {
    return new Response(JSON.stringify({ ok: false, code: 'bad_request', error: 'invalid crawler page cursor' }), {
      status: 400,
      headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...corsHeaders },
    })
  }
  const nextPageUrl = page.nextCursor ? (() => {
    const next = new URL(request.url)
    next.searchParams.set('cursor', page.nextCursor)
    return next.toString()
  })() : null
  const args = {
    requestUrl: request.url,
    workspaceId: route.workspaceId,
    exportedAtIso: nowIso,
    documents: page.documents,
    nextPageUrl,
  }
  const body = route.format === 'manifest'
    ? JSON.stringify(buildMarkdownContentManifest(args), null, 2)
    : route.format === 'llms' ? buildSourceFilesLlmsText(args) : buildSourceFilesIndexMarkdown(args)
  assertBoundedCrawlerResponse(body)
  const contentType = route.format === 'manifest'
    ? 'application/json; charset=utf-8'
    : route.format === 'llms' ? 'text/plain; charset=utf-8' : 'text/markdown; charset=utf-8'
  return new Response(body, { status: 200, headers: buildCrawlerHeaders(contentType, corsHeaders, nextPageUrl) })
}
