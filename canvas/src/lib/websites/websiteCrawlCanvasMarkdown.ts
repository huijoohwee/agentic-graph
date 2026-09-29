type CrawlDownload = {
  id?: unknown
  fileName?: unknown
  mimeType?: unknown
  bytes?: unknown
}

type CrawlNode = {
  nodeId?: unknown
  url?: unknown
  title?: unknown
  status?: unknown
  links?: unknown
  artifacts?: unknown
}

type CrawlRuntime = {
  engine?: unknown
  headless?: unknown
  proxyMode?: unknown
  proxyPoolSize?: unknown
}

const yamlString = (value: unknown): string => JSON.stringify(String(value || ''))
const cell = (value: unknown): string => String(value || '').replace(/\r?\n/g, ' ').trim()
const mermaidLabel = (value: unknown): string => String(value || '').replace(/["\[\]{}<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 100)

const artifactUrl = (args: {
  outputDirRel: string
  importId: string
  nodeId: string
  kind: 'rawHtml' | 'download'
  downloadId?: string
}): string => {
  const query = new URLSearchParams({
    outputDirRel: args.outputDirRel,
    importId: args.importId,
    nodeId: args.nodeId,
    kind: args.kind,
  })
  if (args.kind === 'rawHtml') query.set('download', '1')
  if (args.downloadId) query.set('downloadId', args.downloadId)
  return `/__website_import/artifact?${query.toString()}`
}

export function buildWebsiteCrawlCanvasMarkdown(args: {
  rootUrl: string
  importId: string
  outputDirRel: string
  runtime?: CrawlRuntime | null
  nodes: CrawlNode[]
}): string {
  const pages = args.nodes
    .filter(node => String(node?.status || 'ok') === 'ok')
    .map(node => {
      const nodeId = String(node.nodeId || '').trim()
      const url = String(node.url || '').trim()
      const artifacts = node.artifacts && typeof node.artifacts === 'object' ? node.artifacts as Record<string, unknown> : {}
      const downloads = Array.isArray(artifacts.downloads) ? artifacts.downloads as CrawlDownload[] : []
      const links = Array.isArray(node.links) ? node.links.map(String).filter(Boolean) : []
      return { nodeId, url, title: String(node.title || '').trim(), downloads, links, hasHtml: Boolean(artifacts.rawHtmlRelPath) }
    })
    .filter(page => page.nodeId && page.url)
    .slice(0, 500)
  const pageByUrl = new Map(pages.map(page => [page.url, page]))
  const lines = [
    '---',
    'kgCanvas2dRenderer: "d3"',
    'kgCanvasRenderMode: "2d"',
    `kgWebsiteImportId: ${yamlString(args.importId)}`,
    `kgWebsiteRootUrl: ${yamlString(args.rootUrl)}`,
    `kgWebsiteOutputDirRel: ${yamlString(args.outputDirRel)}`,
    `kgCrawlerEngine: ${yamlString(args.runtime?.engine || 'http')}`,
    `kgCrawlerHeadless: ${args.runtime?.headless === true ? 'true' : 'false'}`,
    `kgCrawlerProxyMode: ${yamlString(args.runtime?.proxyMode || 'direct')}`,
    '---',
    '',
    '# Website crawl Canvas',
    '',
    `Source: ${args.rootUrl}`,
    '',
    '```mermaid',
    'flowchart LR',
  ]
  for (const page of pages) {
    lines.push(`  page_${page.nodeId}["${mermaidLabel(page.title || page.url)}"]`)
  }
  let edgeCount = 0
  for (const page of pages) {
    for (const link of page.links) {
      const target = pageByUrl.get(link)
      if (!target || edgeCount >= 1500) continue
      lines.push(`  page_${page.nodeId} -->|links| page_${target.nodeId}`)
      edgeCount += 1
    }
    for (const artifact of page.downloads.slice(0, 24)) {
      const downloadId = String(artifact.id || '').trim()
      if (!downloadId || edgeCount >= 1500) continue
      lines.push(`  asset_${downloadId}["${mermaidLabel(artifact.fileName || 'download')}"]`)
      lines.push(`  page_${page.nodeId} -->|downloads| asset_${downloadId}`)
      edgeCount += 1
    }
  }
  lines.push('```', '', '## Pages', '')
  const pageTableRows = pages.map(page => {
    const html = page.hasHtml
      ? `[Download HTML](${artifactUrl({ outputDirRel: args.outputDirRel, importId: args.importId, nodeId: page.nodeId, kind: 'rawHtml' })})`
      : '—'
    return [cell(page.title || page.url), `[Open](${page.url})`, html]
  })
  lines.push(...serializeMarkdownPipeTable({
    columns: ['Page', 'Source', 'HTML'],
    rows: pageTableRows,
  }))
  const downloads = pages.flatMap(page => page.downloads.map(download => ({ page, download })))
  if (downloads.length) {
    const downloadTableRows: string[][] = []
    for (const { page, download } of downloads) {
      const id = String(download.id || '').trim()
      if (!id) continue
      const url = artifactUrl({ outputDirRel: args.outputDirRel, importId: args.importId, nodeId: page.nodeId, kind: 'download', downloadId: id })
      downloadTableRows.push([
        `[${cell(download.fileName || 'download')}](${url})`,
        cell(download.mimeType),
        String(Number(download.bytes) || 0),
        cell(page.title || page.url),
      ])
    }
    lines.push('', '## Downloaded files', '', ...serializeMarkdownPipeTable({
      columns: ['File', 'Type', 'Bytes', 'Source page'],
      rows: downloadTableRows,
    }))
  }
  lines.push('', '## Runtime', '', `- Engine: ${cell(args.runtime?.engine || 'http')}`, `- Headless: ${args.runtime?.headless === true ? 'yes' : 'no'}`, `- Proxy mode: ${cell(args.runtime?.proxyMode || 'direct')}`, `- Proxy pool size: ${Number(args.runtime?.proxyPoolSize) || 0}`, '')
  return lines.join('\n')
}
import { serializeMarkdownPipeTable } from '@/features/markdown/ui/markdownDataViewSerialize'
