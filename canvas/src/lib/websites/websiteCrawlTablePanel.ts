import { escapeLegacyRichMediaTableHtml } from '@/features/rich-media/multiDimensionalTablePanel'
import { serializeMarkdownPipeTable } from '@/features/markdown/ui/markdownDataViewSerialize'
import type { WebsiteImportManifestV1, WebsiteImportNode } from '@/lib/websites/server/websiteImportTypes'
import { resolveWebsiteImportNodeRelativeDocumentPath, safeWebsitePathSegment } from '@/lib/websites/websitePathUtils'

export const WEBSITE_CRAWL_ARTIFACT_QUERY_PARAM = 'kgCrawlArtifact'
export const WEBSITE_CRAWL_SOURCE_URL_QUERY_PARAM = 'kgCrawlSourceUrl'
export const WEBSITE_CRAWL_TABLE_MARKDOWN_HEADING = '## Website crawl multi-dimensional table'

const WEBSITE_CRAWL_TABLE_COLUMNS = ['Page', 'Status', 'Source URL', 'HTML', 'Markdown', 'Downloads', 'Error'] as const
const WEBSITE_CRAWL_TABLE_MARKDOWN_HEADER = serializeMarkdownPipeTable({ columns: WEBSITE_CRAWL_TABLE_COLUMNS, rows: [] })[0] || ''

const buildWebsiteCrawlMarkdownDeepLink = (args: { artifactHref: string; sourceUrl: string; workspacePath: string }): string => {
  const query = new URLSearchParams({
    kgDoc: args.workspacePath,
    [WEBSITE_CRAWL_ARTIFACT_QUERY_PARAM]: args.artifactHref,
    [WEBSITE_CRAWL_SOURCE_URL_QUERY_PARAM]: args.sourceUrl,
  })
  return `/?${query.toString()}`
}

export function enhanceLegacyWebsiteCrawlTablePanelSrcDoc(srcDoc: string): string {
  if (!srcDoc.includes('data-kg-website-crawl-table-panel="1"')) return srcDoc
  const importId = srcDoc.match(/data-import-id=["']([^"']+)["']/i)?.[1] || ''
  if (!importId) return srcDoc
  return srcDoc.replace(/<tr\b[^>]*>[\s\S]*?<\/tr>/gi, row => {
    const cells = Array.from(row.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi))
    const sourceUrl = cells[2]?.[1]?.match(/<a\b[^>]*href=["']([^"']+)["']/i)?.[1]?.replace(/&amp;/g, '&') || ''
    const markdownLink = row.match(/<a\b[^>]*href=["']([^"']*(?:kind=markdown|kind%3Dmarkdown)[^"']*)["'][^>]*>Markdown<\/a>/i)
    if (!sourceUrl || !markdownLink?.[0] || !markdownLink[1]) return row
    const originalHref = markdownLink[1].replace(/&amp;/g, '&')
    const existingDeepLink = originalHref.startsWith('/?') && originalHref.includes(`${WEBSITE_CRAWL_ARTIFACT_QUERY_PARAM}=`)
    const existingParams = existingDeepLink ? new URLSearchParams(originalHref.slice(2)) : null
    let host = 'website'
    try { host = new URL(sourceUrl).host || host } catch { void 0 }
    const workspacePath = String(existingParams?.get('kgDoc') || '').trim()
      || `/websites/${safeWebsitePathSegment(host)}/${resolveWebsiteImportNodeRelativeDocumentPath({ nodeUrl: sourceUrl })}`
    const deepLink = existingDeepLink
      ? originalHref
      : buildWebsiteCrawlMarkdownDeepLink({ artifactHref: originalHref, sourceUrl, workspacePath })
    return row.replace(markdownLink[0], `<a href="${escapeLegacyRichMediaTableHtml(deepLink)}" target="_top" data-kg-website-crawl-markdown-open="1" data-kg-workspace-path="${escapeLegacyRichMediaTableHtml(workspacePath)}">Markdown</a>`)
  })
}

const artifactUrl = (args: { importId: string; nodeId: string; kind: 'rawHtml' | 'markdown' | 'download'; downloadId?: string }): string => {
  const query = new URLSearchParams({ importId: args.importId, nodeId: args.nodeId, kind: args.kind })
  if (args.downloadId) query.set('downloadId', args.downloadId)
  return `/__website_import/artifact?${query.toString()}`
}

const escapeMarkdownLinkLabel = (value: unknown): string => String(value ?? '')
  .replace(/\\/g, '\\\\')
  .replace(/\[/g, '\\[')
  .replace(/\]/g, '\\]')
  .replace(/</g, '\\<')
  .replace(/>/g, '\\>')
  .replace(/\r?\n/g, ' ')
  .trim()

const escapeMarkdownCellText = (value: unknown): string => String(value ?? '')
  .replace(/\\/g, '\\\\')
  .replace(/</g, '\\<')
  .replace(/>/g, '\\>')
  .replace(/\r?\n/g, ' ')
  .trim()

const escapeMarkdownLinkHref = (value: unknown): string => String(value ?? '')
  .replace(/\)/g, '%29')
  .replace(/\s/g, '%20')
  .trim()

const markdownLink = (href: string, label: string): string => {
  const safeHref = escapeMarkdownLinkHref(href)
  const safeLabel = escapeMarkdownLinkLabel(label)
  return safeHref ? `[${safeLabel || safeHref}](${safeHref})` : safeLabel
}

const markdownWorkspacePath = (manifest: WebsiteImportManifestV1, node: WebsiteImportNode): string => {
  const host = (() => {
    try {
      return new URL(manifest.rootUrl).host
    } catch {
      return 'website'
    }
  })()
  const relativePath = resolveWebsiteImportNodeRelativeDocumentPath({ nodeUrl: node.url, nodePath: node.path })
  return `/websites/${safeWebsitePathSegment(host)}/${relativePath}`
}

const artifactMarkdownCell = (manifest: WebsiteImportManifestV1, node: WebsiteImportNode, kind: 'rawHtml' | 'markdown'): string => {
  const path = kind === 'rawHtml' ? node.artifacts.rawHtmlRelPath : node.artifacts.markdownRelPath
  if (!path) return 'None'
  const href = artifactUrl({ importId: manifest.importId, nodeId: node.nodeId, kind })
  if (kind === 'rawHtml') return markdownLink(href, 'HTML')
  const workspacePath = markdownWorkspacePath(manifest, node)
  const deepLink = buildWebsiteCrawlMarkdownDeepLink({ artifactHref: href, sourceUrl: node.url, workspacePath })
  return markdownLink(deepLink, 'Markdown')
}

export function isWebsiteCrawlTablePanelMarkdown(value: unknown): boolean {
  const markdown = typeof value === 'string' ? value.trim() : ''
  return markdown.includes(WEBSITE_CRAWL_TABLE_MARKDOWN_HEADING)
    && markdown.includes(WEBSITE_CRAWL_TABLE_MARKDOWN_HEADER)
}

export function enhanceWebsiteCrawlTableRenderedMarkdownHtml(html: string): string {
  const rendered = String(html || '')
  if (!rendered.includes(WEBSITE_CRAWL_ARTIFACT_QUERY_PARAM) || !rendered.includes('kgDoc=')) return rendered
  return rendered.replace(/<a\b[^>]*>/gi, tag => {
    const hrefMatch = /\bhref=(['"])([^'"]+)\1/i.exec(tag)
    const href = String(hrefMatch?.[2] || '').replace(/&amp;/g, '&')
    if (!href.startsWith('/?')) return tag
    const params = new URLSearchParams(href.slice(2))
    const workspacePath = String(params.get('kgDoc') || '').trim()
    const artifactHref = String(params.get(WEBSITE_CRAWL_ARTIFACT_QUERY_PARAM) || '').trim()
    if (!workspacePath || !artifactHref) return tag
    const withoutNavigationAttrs = tag
      .replace(/\s+target=(['"])[^'"]*\1/gi, '')
      .replace(/\s+rel=(['"])[^'"]*\1/gi, '')
      .replace(/\s+data-kg-website-crawl-markdown-open=(['"])[^'"]*\1/gi, '')
      .replace(/\s+data-kg-workspace-path=(['"])[^'"]*\1/gi, '')
    return withoutNavigationAttrs.replace(/>$/, ` target="_top" rel="noreferrer" data-kg-website-crawl-markdown-open="1" data-kg-workspace-path="${escapeLegacyRichMediaTableHtml(workspacePath)}">`)
  })
}

export function buildWebsiteCrawlTablePanelMarkdown(manifest: WebsiteImportManifestV1): string {
  const errorByUrl = new Map((manifest.errors || []).map(item => [String(item.url || '').trim(), String(item.error || '').trim()]))
  const rows = manifest.nodes.map((node, index) => {
    const downloads = Array.isArray(node.artifacts.downloads) ? node.artifacts.downloads : []
    return [
      escapeMarkdownCellText(node.title || node.path || `Page ${index + 1}`),
      node.status === 'ok' ? '**Successful**' : '**Error**',
      markdownLink(node.url, node.url),
      artifactMarkdownCell(manifest, node, 'rawHtml'),
      artifactMarkdownCell(manifest, node, 'markdown'),
      downloads.length
        ? downloads.slice(0, 8).map(download => markdownLink(
          artifactUrl({ importId: manifest.importId, nodeId: node.nodeId, kind: 'download', downloadId: download.id }),
          download.fileName,
        )).join('; ')
        : 'None',
      escapeMarkdownCellText(errorByUrl.get(String(node.url || '').trim()) || '') || 'None',
    ].map(text => String(text ?? ''))
  })
  const tableLines = serializeMarkdownPipeTable({ columns: WEBSITE_CRAWL_TABLE_COLUMNS, rows })
  const host = (() => {
    try {
      return new URL(manifest.rootUrl).hostname || 'Crawl results'
    } catch {
      return 'Crawl results'
    }
  })()
  return [
    WEBSITE_CRAWL_TABLE_MARKDOWN_HEADING,
    '',
    `**${host}** · ${manifest.nodes.length} ${manifest.nodes.length === 1 ? 'page' : 'pages'}`,
    '',
    ...(tableLines.length > 0 ? tableLines : ['No crawled pages were stored.']),
  ].join('\n')
}
