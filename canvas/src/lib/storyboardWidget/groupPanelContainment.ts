import type { GraphData } from '@/lib/graph/types'
import { readSubgraphs } from '@/lib/graph/subgraphs'

export const collectGroupPanelContainedNodeIds = (
  graphData: GraphData | null | undefined,
): Set<string> => {
  const containedNodeIds = new Set<string>()
  readSubgraphs(graphData).forEach(group => {
    group.memberNodeIds.forEach(rawNodeId => {
      const nodeId = String(rawNodeId || '').trim()
      if (nodeId) containedNodeIds.add(nodeId)
    })
  })
  return containedNodeIds
}

export const isGroupPanelContainedNode = (
  containedNodeIds: ReadonlySet<string>,
  rawNodeId: unknown,
): boolean => {
  const nodeId = String(rawNodeId || '').trim()
  return nodeId ? containedNodeIds.has(nodeId) : false
}
