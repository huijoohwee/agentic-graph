import { buildGraphNodeCanonicalTextPatch } from '@/lib/cards/graphNodeCardFields'
import { resolveGraphNodeByCanonicalId } from '@/lib/graph/canonicalNodeIds'
import type { GraphData, GraphNode, JSONValue } from '@/lib/graph/types'

export const commitStoryboardCardCanonicalText2d = (args: {
  addHistory: (label: string) => void
  canonicalKey: string
  cardId: string
  currentProperties: Record<string, unknown>
  historyLabel: string
  nextValue: string
  preserveFormatting?: boolean
  propertyKeys: readonly string[]
  updateNode: (id: string, patch: Partial<GraphNode>) => void
  graphData?: GraphData | null
  commitGraphData?: (graphData: GraphData) => void
}): void => {
  const buildProperties = (currentProperties: Record<string, unknown>) => buildGraphNodeCanonicalTextPatch({
    currentProperties,
    propertyKeys: args.propertyKeys,
    canonicalKey: args.canonicalKey,
    nextValue: args.nextValue,
    preserveFormatting: args.preserveFormatting,
  }) as Record<string, JSONValue>
  if (args.graphData && args.commitGraphData) {
    const targetNode = resolveGraphNodeByCanonicalId(args.graphData, args.cardId)
    if (targetNode) {
      const committedProperties = buildProperties((targetNode.properties || {}) as Record<string, unknown>)
      const nodes = (args.graphData.nodes || []).map(node => (
        node === targetNode ? { ...node, properties: committedProperties } : node
      ))
      args.commitGraphData({ ...args.graphData, nodes })
      args.addHistory(args.historyLabel)
    }
    return
  }
  const nextProperties = buildProperties(args.currentProperties)
  args.updateNode(args.cardId, { properties: nextProperties })
  args.addHistory(args.historyLabel)
}
