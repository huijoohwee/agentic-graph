import {
  isStoryboardWidgetWorkflowRunnableNode,
  resolveStoryboardWidgetWorkflowDownstreamRunTargetIds,
} from '@/components/StoryboardWidgetCanvas/runtime/storyboardWidgetWorkflowDownstreamRunTargets'
import { readGraphEdgeEndpoints } from '@/lib/graph/edgeEndpoints'
import { readFlowEdgePortKey } from '@/lib/graph/flowPorts'
import type { GraphData, GraphNode } from '@/lib/graph/types'
import { resolveImageToThreeJsRunInput } from '@/features/image-to-threejs/imageToThreeJsContract'
import { resolveImageToGlbRunInput } from '@/features/image-to-glb/imageToGlbContract'
import { hasProceduralAssetRunInvocation } from '@/features/image-to-glb/proceduralAssetWorkflowContract'

function findGraphNodeById(graphData: GraphData | null | undefined, nodeId: string): GraphNode | null {
  const id = String(nodeId || '').trim()
  if (!id || !Array.isArray(graphData?.nodes)) return null
  return graphData!.nodes.find(node => String(node?.id || '').trim() === id) || null
}

export function resolveStoryboardWidgetAutoRunNodeIds(args: {
  graphData: GraphData | null
  nodeId: string
  changedPropertyKeys?: ReadonlyArray<string> | null
  resolveRichMediaKind?: (node: GraphNode) => unknown
}): string[] {
  const id = String(args.nodeId || '').trim()
  if (!id) return []
  const node = findGraphNodeById(args.graphData, id)
  if (!node) return [id]
  const shouldScopeToChangedProperties = Array.isArray(args.changedPropertyKeys)
  if (!shouldScopeToChangedProperties && (hasProceduralAssetRunInvocation(node.properties) || resolveImageToGlbRunInput({ node }) || resolveImageToThreeJsRunInput({ node }))) {
    return [id]
  }
  const changedPropertyKeySet = new Set(
    (Array.isArray(args.changedPropertyKeys) ? args.changedPropertyKeys : [])
      .map(key => String(key || '').trim())
      .filter(Boolean),
  )
  const downstreamTargetIds = resolveStoryboardWidgetWorkflowDownstreamRunTargetIds({
    node,
    graphData: args.graphData,
  }).filter(targetId => {
    if (shouldScopeToChangedProperties) {
      const hasChangedOutgoingPort = (args.graphData?.edges || []).some(edge => {
        const endpoints = readGraphEdgeEndpoints(edge)
        if (endpoints.src !== id || endpoints.tgt !== targetId) return false
        const sourcePortKey = readFlowEdgePortKey(edge, 'source') || ''
        return sourcePortKey ? changedPropertyKeySet.has(sourcePortKey) : false
      })
      if (!hasChangedOutgoingPort) return false
    }
    const targetNode = findGraphNodeById(args.graphData, targetId)
    return isStoryboardWidgetWorkflowRunnableNode({
      node: targetNode,
      resolveRichMediaKind: args.resolveRichMediaKind,
    })
  })
  if (shouldScopeToChangedProperties) return downstreamTargetIds
  return downstreamTargetIds.length > 0 ? downstreamTargetIds : [id]
}
