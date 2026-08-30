import type { GraphEdge, GraphNode } from '@/lib/graph/types'

export const AG_KEYWORD_KIND_PROP = 'keyword:kind'

export const detectKeywordGraph = (args: {
  metadata?: unknown
  nodes: GraphNode[]
  edges: GraphEdge[]
}): boolean => {
  const meta = args.metadata && typeof args.metadata === 'object' && !Array.isArray(args.metadata)
    ? (args.metadata as Record<string, unknown>)
    : null
  if (meta?.kind === 'keyword') return true

  const nodes = Array.isArray(args.nodes) ? args.nodes : []
  for (let i = 0; i < nodes.length; i += 1) {
    const n = nodes[i]
    const props = (n?.properties || {}) as Record<string, unknown>
    const kind = props[AG_KEYWORD_KIND_PROP]
    if (typeof kind === 'string' && kind.trim()) return true
  }

  const edges = Array.isArray(args.edges) ? args.edges : []
  for (let i = 0; i < edges.length; i += 1) {
    const e = edges[i]
    const props = (e?.properties || {}) as Record<string, unknown>
    const kind = props[AG_KEYWORD_KIND_PROP]
    if (typeof kind === 'string' && kind.trim()) return true
  }

  return false
}
