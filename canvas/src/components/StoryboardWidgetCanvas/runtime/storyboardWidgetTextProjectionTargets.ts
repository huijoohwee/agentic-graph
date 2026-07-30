import {
  isRichMediaOutputTargetNode,
  resolveRichMediaWidgetKind,
} from '@/features/chat/richMediaRun'
import { isCanonicalNodeIdEqual } from '@/lib/graph/canonicalNodeIds'
import { readGraphEdgeEndpoints } from '@/lib/graph/edgeEndpoints'
import {
  FLOW_DEFAULT_SOURCE_PORT_KEY,
  FLOW_EDGE_SOURCE_PORT_KEY,
  FLOW_EDGE_TARGET_PORT_KEY,
  FLOW_PROMPT_INPUT_PORT_KEY,
  FLOW_TEXT_OUTPUT_PORT_KEY,
} from '@/lib/graph/flowPorts'
import { unwrapGraphCellValue } from '@/lib/graph/nodeProperties'
import type { GraphData, GraphEdge, GraphNode } from '@/lib/graph/types'
import { isPlainObject } from '@/lib/graph/value'
import {
  isStoryboardWidgetWorkflowRunnableNode,
  isStoryboardWidgetSystemOwnedWorkflowEdge,
  readFlowWidgetCardRunDownstreamTargetIds,
} from './storyboardWidgetWorkflowDownstreamRunTargets'
import { WORKFLOW_OUTPUT_EDGE_DEFAULT_TARGET_PORT_KEY } from './storyboardWidgetWorkflowOutputEdge'

const readEdgePortKey = (
  edge: GraphEdge,
  key: typeof FLOW_EDGE_SOURCE_PORT_KEY | typeof FLOW_EDGE_TARGET_PORT_KEY,
): string => {
  const properties = unwrapGraphCellValue(edge.properties)
  if (!isPlainObject(properties)) return ''
  return String(unwrapGraphCellValue(properties[key]) || '').trim()
}

const readAuthoredProjectionEdges = (args: {
  graphData: GraphData
  sourceNodeId: string
  targetNodeId: string
}): GraphEdge[] => (args.graphData.edges || []).filter(edge => {
  const endpoints = readGraphEdgeEndpoints(edge)
  return isCanonicalNodeIdEqual(endpoints.src, args.sourceNodeId)
    && isCanonicalNodeIdEqual(endpoints.tgt, args.targetNodeId)
    && !isStoryboardWidgetSystemOwnedWorkflowEdge(edge)
})

const hasCanonicalTextProjectionEdge = (edges: readonly GraphEdge[]): boolean => (
  edges.some(edge => (
    readEdgePortKey(edge, FLOW_EDGE_SOURCE_PORT_KEY) === FLOW_TEXT_OUTPUT_PORT_KEY
    && readEdgePortKey(edge, FLOW_EDGE_TARGET_PORT_KEY) === FLOW_PROMPT_INPUT_PORT_KEY
  ))
)

const hasCompatibleTextPanelProjection = (edges: readonly GraphEdge[]): boolean => {
  if (edges.length === 0) return true
  return edges.some(edge => {
    const sourcePortKey = readEdgePortKey(edge, FLOW_EDGE_SOURCE_PORT_KEY)
    const targetPortKey = readEdgePortKey(edge, FLOW_EDGE_TARGET_PORT_KEY)
    return (!sourcePortKey
      || sourcePortKey === FLOW_TEXT_OUTPUT_PORT_KEY
      || sourcePortKey === FLOW_DEFAULT_SOURCE_PORT_KEY)
      && (!targetPortKey || targetPortKey === WORKFLOW_OUTPUT_EDGE_DEFAULT_TARGET_PORT_KEY)
  })
}

const resolveProjectionTargetNodeIds = (args: {
  anchorNode: GraphNode
  graphData: GraphData
}): string[] => {
  const sourceNodeId = String(args.anchorNode.id || '').trim()
  const targetNodeIds = readFlowWidgetCardRunDownstreamTargetIds(args.anchorNode)
  for (const edge of args.graphData.edges || []) {
    const endpoints = readGraphEdgeEndpoints(edge)
    if (
      !endpoints.tgt
      || !isCanonicalNodeIdEqual(endpoints.src, sourceNodeId)
      || isStoryboardWidgetSystemOwnedWorkflowEdge(edge)
      || targetNodeIds.some(targetId => isCanonicalNodeIdEqual(targetId, endpoints.tgt))
    ) continue
    targetNodeIds.push(endpoints.tgt)
  }
  return targetNodeIds
}

export function resolveStoryboardWidgetTextProjectionTargets(args: {
  anchorNode: GraphNode
  graphData: GraphData
  resolveNodeById: (nodeId: string) => GraphNode | null
}): {
  explicitPanelNodeIds: string[]
  hasExplicitWidgetTarget: boolean
} {
  const explicitTargetNodeIds = resolveProjectionTargetNodeIds(args)
  const resolveTargetNode = (targetId: string): GraphNode | null => (
    args.resolveNodeById(targetId)
    || args.graphData.nodes.find(node => isCanonicalNodeIdEqual(node.id, targetId))
    || null
  )
  const resolveAuthoredEdges = (targetId: string): GraphEdge[] => readAuthoredProjectionEdges({
    graphData: args.graphData,
    sourceNodeId: String(args.anchorNode.id || '').trim(),
    targetNodeId: targetId,
  })
  const explicitPanelNodeIds = explicitTargetNodeIds.filter(targetId => {
    const authoredEdges = resolveAuthoredEdges(targetId)
    return isRichMediaOutputTargetNode(resolveTargetNode(targetId))
      && !hasCanonicalTextProjectionEdge(authoredEdges)
      && hasCompatibleTextPanelProjection(authoredEdges)
  })
  const hasExplicitWidgetTarget = explicitTargetNodeIds.some(targetId => {
    const targetNode = resolveTargetNode(targetId)
    return isStoryboardWidgetWorkflowRunnableNode({
        node: targetNode,
        resolveRichMediaKind: resolveRichMediaWidgetKind,
      })
      && hasCanonicalTextProjectionEdge(resolveAuthoredEdges(targetId))
  })
  return { explicitPanelNodeIds, hasExplicitWidgetTarget }
}
