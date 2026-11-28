import type { GraphNode } from '@/lib/graph/types'

export function filterGraphCanvasViewportFitNodes(args: {
  nodes: GraphNode[]
  panelOnlyNodeIdSet?: Set<string> | null
  mediaOverlayNodeIdSet?: Set<string> | null
}): GraphNode[] {
  const nodes = Array.isArray(args.nodes) ? args.nodes : []
  if (nodes.length === 0) return nodes
  const hasPanelOnly = !!args.panelOnlyNodeIdSet && args.panelOnlyNodeIdSet.size > 0
  if (!hasPanelOnly) return nodes

  const filtered = nodes.filter(node => {
    const id = String(node?.id || '').trim()
    if (!id) return true
    if (hasPanelOnly && args.panelOnlyNodeIdSet?.has(id)) return false
    return true
  })
  return filtered.length > 0 ? filtered : nodes
}

/** The mounted scene may be unavailable while the Canvas layer is being replaced. */
export function readViewportFitNodesFromLayer(layer: { data(): GraphNode[] } | null, fallback: GraphNode[]): GraphNode[] {
  try {
    const mounted = layer?.data()
    if (Array.isArray(mounted) && mounted.length) return mounted
  } catch {
    return fallback
  }
  return fallback
}
