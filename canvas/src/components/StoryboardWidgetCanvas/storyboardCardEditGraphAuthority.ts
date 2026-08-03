import { resolveGraphNodeByCanonicalId } from '@/lib/graph/canonicalNodeIds'
import type { GraphData, GraphNode } from '@/lib/graph/types'

export function resolveStoryboardCardEditGraphAuthority(args: {
  cardId: string
  renderedGraphData: GraphData | null | undefined
  storeGraphData: GraphData | null | undefined
}): { graphData: GraphData | null; node: GraphNode | null } {
  const cardId = String(args.cardId || '').trim()
  const renderedGraphData = args.renderedGraphData || null
  const storeGraphData = args.storeGraphData || null
  if (!cardId) return { graphData: renderedGraphData || storeGraphData, node: null }
  const renderedNode = resolveGraphNodeByCanonicalId(renderedGraphData, cardId)
  if (renderedNode) return { graphData: renderedGraphData, node: renderedNode }
  const storeNode = resolveGraphNodeByCanonicalId(storeGraphData, cardId)
  if (storeNode) return { graphData: storeGraphData, node: storeNode }
  return { graphData: renderedGraphData || storeGraphData, node: null }
}
