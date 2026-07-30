import {
  mergeStoryboardWidgetExplicitRunTargetTopology,
} from '@/components/StoryboardWidgetCanvas/runtime/storyboardWidgetWorkflowDownstreamRunTargets'
import {
  mergeStoryboardWidgetProbeTreeOutputPanels,
  normalizeStoryboardWidgetProbeTreeOutputLayout,
  PROBE_TREE_OUTPUT_KEY,
} from '@/components/StoryboardWidgetCanvas/runtime/storyboardWidgetProbeTreeLayout'
import type { StoryboardWidgetWorkflowNodeResolutionContext } from '@/components/StoryboardWidgetCanvas/runtime/storyboardWidgetRenderGraph'
import { readGraphNodeProperties } from '@/lib/cards/graphNodeCardFields'
import { FLOW_RICH_MEDIA_PANEL_NODE_TYPE_ID } from '@/lib/config'
import { isCanonicalNodeIdEqual } from '@/lib/graph/canonicalNodeIds'
import { readGraphEdgeEndpoints } from '@/lib/graph/edgeEndpoints'
import { unwrapGraphCellValue } from '@/lib/graph/nodeProperties'
import type { GraphData, GraphNode } from '@/lib/graph/types'
import { bumpStoryboardWidgetDraftGraphDataRevision } from '@/lib/storyboardWidget/storyboardWidgetDraftGraphData'
import { resolveStoryboardWidgetTextProjectionTargets } from './storyboardWidgetTextProjectionTargets'

const readString = (value: unknown): string => {
  const scalar = unwrapGraphCellValue(value)
  return typeof scalar === 'string' ? scalar.trim() : ''
}

const isOwnedTextOutputPanel = (args: {
  node: GraphNode
  anchorNodeId: string
  outputKey: string
}): boolean => {
  if (readString(args.node.type) !== FLOW_RICH_MEDIA_PANEL_NODE_TYPE_ID) return false
  const properties = readGraphNodeProperties(args.node)
  return readString(properties.workflowOutputAnchorNodeId) === args.anchorNodeId
    && readString(properties.workflowOutputKey) === args.outputKey
}

const mergeOwnedTextOutputPanel = (args: {
  graphData: GraphData
  sourceGraphData: GraphData | null | undefined
  anchorNodeId: string
  outputKey: string
}): GraphData => {
  if (!args.anchorNodeId || !args.outputKey) return args.graphData
  const matcher = (node: GraphNode) => isOwnedTextOutputPanel({
    node,
    anchorNodeId: args.anchorNodeId,
    outputKey: args.outputKey,
  })
  if ((args.graphData.nodes || []).some(matcher)) return args.graphData
  const ownedPanel = (args.sourceGraphData?.nodes || []).find(matcher)
  return ownedPanel
    ? { ...args.graphData, nodes: [...(args.graphData.nodes || []), ownedPanel] }
    : args.graphData
}

export function mergeStoryboardWidgetRunInputTopology(args: {
  graphData: GraphData
  sourceGraphData: GraphData | null | undefined
  anchorNodeId: string
}): GraphData {
  const anchorNodeId = readString(args.anchorNodeId)
  if (!anchorNodeId || !args.sourceGraphData) return args.graphData
  const sourceNodes = Array.isArray(args.sourceGraphData.nodes) ? args.sourceGraphData.nodes : []
  const incomingEdges = (Array.isArray(args.sourceGraphData.edges) ? args.sourceGraphData.edges : [])
    .filter(edge => isCanonicalNodeIdEqual(readGraphEdgeEndpoints(edge).tgt, anchorNodeId))
  if (incomingEdges.length === 0) return args.graphData

  const nodes = [...(args.graphData.nodes || [])]
  const edges = [...(args.graphData.edges || [])]
  let changed = false
  for (const incomingEdge of incomingEdges) {
    const endpoints = readGraphEdgeEndpoints(incomingEdge)
    if (!endpoints.src || !endpoints.tgt) continue
    const sourceNode = sourceNodes.find(node => isCanonicalNodeIdEqual(node.id, endpoints.src))
    if (sourceNode && !nodes.some(node => isCanonicalNodeIdEqual(node.id, sourceNode.id))) {
      nodes.push(sourceNode)
      changed = true
    }
    const edgeId = readString(incomingEdge.id)
    const edgeExists = edges.some(edge => {
      if (edgeId && readString(edge.id) === edgeId) return true
      const current = readGraphEdgeEndpoints(edge)
      return isCanonicalNodeIdEqual(current.src, endpoints.src)
        && isCanonicalNodeIdEqual(current.tgt, endpoints.tgt)
    })
    if (!edgeExists) {
      edges.push(incomingEdge)
      changed = true
    }
  }
  return changed
    ? bumpStoryboardWidgetDraftGraphDataRevision({ ...args.graphData, nodes, edges })
    : args.graphData
}

export function buildStoryboardWidgetTextPublicationGraph(args: {
  context: StoryboardWidgetWorkflowNodeResolutionContext
  baseGraphData: GraphData | null
  liveDraftGraphData: GraphData | null
  anchorNodeId: string
  outputKey: string
  outputThreadRootId?: string | null
}): GraphData | null {
  if (!args.baseGraphData) return null
  const sourceGraphs = [
    args.context.draftGraph,
    args.context.baseGraph,
    args.context.storeGraph,
    args.context.renderGraph,
    args.liveDraftGraphData,
  ]
  let graphData = sourceGraphs.reduce<GraphData>((current, sourceGraphData) => {
    const withInputs = mergeStoryboardWidgetRunInputTopology({
      graphData: current,
      sourceGraphData,
      anchorNodeId: args.anchorNodeId,
    })
    return mergeStoryboardWidgetExplicitRunTargetTopology({
      graphData: withInputs,
      liveGraphData: sourceGraphData,
      sourceNodeId: args.anchorNodeId,
    })
  }, args.baseGraphData)
  const anchorNode = (graphData.nodes || []).find(node => readString(node.id) === args.anchorNodeId)
  const hasExplicitRichMediaTarget = anchorNode
    ? resolveStoryboardWidgetTextProjectionTargets({
        anchorNode,
        graphData,
        resolveNodeById: targetId => (
          (graphData.nodes || []).find(node => isCanonicalNodeIdEqual(node.id, targetId)) || null
        ),
      }).explicitPanelNodeIds.length > 0
    : false
  if (!hasExplicitRichMediaTarget) {
    graphData = sourceGraphs.reduce<GraphData>((current, sourceGraphData) => mergeOwnedTextOutputPanel({
      graphData: current,
      sourceGraphData,
      anchorNodeId: args.anchorNodeId,
      outputKey: args.outputKey,
    }), graphData)
  }
  if (args.outputKey === PROBE_TREE_OUTPUT_KEY) {
    graphData = sourceGraphs.reduce<GraphData>((current, sourceGraphData) => (
      mergeStoryboardWidgetProbeTreeOutputPanels({ graphData: current, liveGraphData: sourceGraphData })
    ), graphData)
  }
  return args.outputKey === PROBE_TREE_OUTPUT_KEY && args.outputThreadRootId?.trim()
    ? normalizeStoryboardWidgetProbeTreeOutputLayout({
        graphData,
        threadRootId: args.outputThreadRootId.trim(),
      })
    : graphData
}
