import { normalizeInline, stripWww, truncate } from './webpageMarkdownArtifactUtils'
import { hostFromUrl, safeWebsitePathSegment } from './websitePathUtils'
import { serializeMarkdownPipeTable } from '@/features/markdown/ui/markdownDataViewSerialize'

export type WebsiteSitemapNode = {
  nodeId: string
  url: string
  path: string
  title?: string | null
}

type TreeNode = {
  name: string
  children: Map<string, TreeNode>
  leafCount: number
}

const ensureChild = (parent: TreeNode, name: string): TreeNode => {
  const key = String(name || '').trim()
  const existing = parent.children.get(key)
  if (existing) return existing
  const next: TreeNode = { name: key, children: new Map(), leafCount: 0 }
  parent.children.set(key, next)
  return next
}

export function buildWebsiteSitemapTreeAscii(args: {
  rootLabel: string
  nodes: WebsiteSitemapNode[]
  maxDepth?: number
  maxChildrenPerFolder?: number
}): string {
  const maxDepth = typeof args.maxDepth === 'number' && args.maxDepth > 0 ? Math.floor(args.maxDepth) : 4
  const maxChildrenPerFolder =
    typeof args.maxChildrenPerFolder === 'number' && args.maxChildrenPerFolder > 0 ? Math.floor(args.maxChildrenPerFolder) : 28

  const root: TreeNode = { name: args.rootLabel || 'website', children: new Map(), leafCount: 0 }

  for (const n of args.nodes) {
    const rawPath = String(n.path || '').trim()
    const parts = rawPath
      ? rawPath.split('/').filter(Boolean)
      : (() => {
          try {
            return new URL(String(n.url || '')).pathname.split('/').filter(Boolean)
          } catch {
            return []
          }
        })()
    const segs = parts.length ? parts.map(safeWebsitePathSegment) : ['index']
    let cur = root
    for (const seg of segs) cur = ensureChild(cur, seg)
    cur.leafCount += 1
  }

  const lines: string[] = []

  const render = (node: TreeNode, prefix: string, depth: number, isLast: boolean) => {
    const connector = prefix ? (isLast ? '└── ' : '├── ') : ''
    const name = node.name || 'item'
    const badge = node.leafCount > 0 ? ` (${node.leafCount})` : ''
    lines.push(`${prefix}${connector}${name}${badge}`)

    if (depth >= maxDepth) return
    const children = Array.from(node.children.values())
    children.sort((a, b) => a.name.localeCompare(b.name))
    const limited = children.slice(0, maxChildrenPerFolder)
    const overflow = children.length - limited.length
    const nextPrefix = prefix ? `${prefix}${isLast ? '    ' : '│   '}` : ''
    for (let i = 0; i < limited.length; i += 1) {
      render(limited[i], nextPrefix, depth + 1, i === limited.length - 1 && overflow <= 0)
    }
    if (overflow > 0) {
      lines.push(`${nextPrefix}└── … (+${overflow} more)`) 
    }
  }

  render(root, '', 0, true)
  return lines.join('\n')
}

export function buildWebsiteSitemapMarkdown(args: {
  rootUrl: string
  importId: string
  outputDirRel?: string
  nodes: WebsiteSitemapNode[]
  docLinkByNodeId?: Record<string, string>
}): string {
  const rootUrl = String(args.rootUrl || '').trim()
  const importId = String(args.importId || '').trim()
  const outputDirRel = String(args.outputDirRel || '').trim()
  const docLinkByNodeId = args.docLinkByNodeId && typeof args.docLinkByNodeId === 'object' ? args.docLinkByNodeId : null
  const host = stripWww(hostFromUrl(rootUrl) || 'website')

  const cleanedNodes = args.nodes
    .map((n) => {
      const url = String(n.url || '').trim()
      const path = String(n.path || '').trim()
      const title = truncate(normalizeInline(n.title || ''), 96)
      const nodeId = String(n.nodeId || '').trim()
      return { nodeId: nodeId || url, url, path, title: title || null }
    })
    .filter(n => n.url)

  const doc: string[] = []
  doc.push('---')
  doc.push('kgCanvas2dRenderer: "d3"')
  doc.push('kgCanvasRenderMode: "2d"')
  doc.push('kgCanvasSurfaceMode: "2d"')
  if (rootUrl) doc.push(`kgWebpageUrl: "${rootUrl.replace(/"/g, '\\"')}"`)
  doc.push(`kgWebpageView: "markdown"`)
  if (importId) doc.push(`kgWebsiteImportId: "${importId.replace(/"/g, '\\"')}"`)
  if (outputDirRel) doc.push(`kgWebsiteOutputDirRel: "${outputDirRel.replace(/"/g, '\\"')}"`)
  doc.push('---')
  doc.push('')

  doc.push(`# Website Sitemap: ${host}`)
  if (rootUrl) doc.push(`## ${rootUrl}`)
  doc.push('')
  doc.push(`> **Pages:** ${cleanedNodes.length}`)
  if (importId) doc.push(`> **Import ID:** ${importId}`)
  doc.push('')

  doc.push('---')
  doc.push('')
  doc.push('## Tree')
  doc.push('')
  doc.push('```')
  doc.push(
    buildWebsiteSitemapTreeAscii({
      rootLabel: host,
      nodes: cleanedNodes,
      maxDepth: 4,
      maxChildrenPerFolder: 28,
    }),
  )
  doc.push('```')
  doc.push('')

  doc.push('---')
  doc.push('')
  doc.push('## Pages')
  doc.push('')
  const pageRows: string[][] = []
  for (const n of cleanedNodes.slice(0, 2000)) {
    const displayPath = n.path ? `/${n.path.replace(/^\/+/, '')}` : '(root)'
    const title = n.title || '(unknown)'
    const docLinkRaw = docLinkByNodeId && n.nodeId ? String(docLinkByNodeId[n.nodeId] || '').trim() : ''
    const docLink = docLinkRaw && (docLinkRaw.startsWith('./') || docLinkRaw.startsWith('../')) ? docLinkRaw : (docLinkRaw ? `./${docLinkRaw.replace(/^\/+/, '')}` : '')
    const docCell = docLink ? `[open](${encodeURI(docLink)})` : ''
    pageRows.push([`\`${displayPath}\``, title, n.url, docCell])
  }
  doc.push(...serializeMarkdownPipeTable({ columns: ['Path', 'Title', 'URL', 'Doc'], rows: pageRows }))
  doc.push('')

  return doc.join('\n')
}
