import { scoreHtmlContentRootCandidate } from './htmlToMarkdownHeuristics'

type HastNode = {
  type?: unknown
  tagName?: unknown
  children?: unknown
  properties?: unknown
  value?: unknown
}

type Summary = { textLength: number; headings: number; chrome: boolean }

const prop = (node: HastNode, key: string): string => {
  const props = node.properties as Record<string, unknown> | undefined
  const value = props?.[key]
  return Array.isArray(value) ? value.join(' ') : typeof value === 'string' ? value : ''
}

/** Keep an article's title, media and sibling sections with its longest prose section. */
export const pickBestContentRoot = (root: HastNode): HastNode | null => {
  const parents = new Map<HastNode, HastNode>()
  const summaries = new Map<HastNode, Summary>()
  let best: { node: HastNode; score: number; boost: number } | undefined
  const visit = (node: HastNode): Summary => {
    const tag = String(node.tagName || '').toLowerCase()
    const role = prop(node, 'role').toLowerCase()
    const summary: Summary = {
      textLength: node.type === 'text' ? String(node.value || '').replace(/\s+/g, ' ').trim().length : 0,
      headings: tag === 'h1' ? 1 : 0,
      chrome: tag === 'nav' || tag === 'footer' || role === 'navigation' || role === 'banner',
    }
    for (const child of Array.isArray(node.children) ? node.children as HastNode[] : []) {
      parents.set(child, node)
      const info = visit(child)
      summary.textLength += info.textLength
      summary.headings += info.headings
      summary.chrome ||= info.chrome
    }
    summaries.set(node, summary)
    const boost = scoreHtmlContentRootCandidate({ tag, role, id: prop(node, 'id'), className: prop(node, 'className') || prop(node, 'class') })
    const score = summary.textLength + boost
    if (boost > 0 && (!best || score > best.score)) best = { node, score, boost }
    return summary
  }
  visit(root)
  if (!best) return null
  const selected = best.node
  const content = summaries.get(selected)!
  if (content.textLength < 300) return null
  // Strong publisher roots and explicit article/main boundaries are authoritative.
  if (best.boost >= 10_000 || content.headings || /^(main|article)$/.test(String(selected.tagName)) || prop(selected, 'role') === 'main') return selected
  for (let parent = parents.get(selected); parent; parent = parents.get(parent)) {
    if (parent.type === 'root' || /^(html|body)$/.test(String(parent.tagName))) break
    const info = summaries.get(parent)!
    if (info.chrome || info.headings > 1 || info.textLength > Math.max(content.textLength * 1.75, content.textLength + 4000)) break
    if (info.headings === 1) return parent
  }
  return selected
}
