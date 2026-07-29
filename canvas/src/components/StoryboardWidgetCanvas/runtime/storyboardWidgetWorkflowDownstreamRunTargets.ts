import { readGraphEdgeEndpoints } from '@/lib/graph/edgeEndpoints'
import { isCanonicalNodeIdEqual } from '@/lib/graph/canonicalNodeIds'
import { unwrapGraphCellValue } from '@/lib/graph/nodeProperties'
import type { GraphData, GraphEdge, GraphNode } from '@/lib/graph/types'
import { bumpStoryboardWidgetDraftGraphDataRevision } from '@/lib/storyboardWidget/storyboardWidgetDraftGraphData'
import { FLOW_SWARM_PREDICTION_NODE_TYPE_ID, FLOW_TEXT_GENERATION_NODE_TYPE_ID, FLOW_VIDEO_TRANSCRIBER_NODE_TYPE_ID } from '@/lib/config'
import { readFlowComputeSource } from '@/lib/storyboardWidget/flowComputeInline'

function cleanString(value: unknown): string {
  if (value && typeof value === 'object' && !Array.isArray(value) && 'value' in value) {
    return cleanString((value as { value?: unknown }).value)
  }
  return typeof value === 'string' ? value.trim() : ''
}

function readPlainRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function readStringList(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(cleanString).filter(Boolean)
  const single = cleanString(value)
  return single ? [single] : []
}

function pushUnique(out: string[], seen: Set<string>, values: ReadonlyArray<string>) {
  for (const value of values) {
    const id = cleanString(value)
    if (!id || seen.has(id)) continue
    seen.add(id)
    out.push(id)
  }
}

function readWidgetCardValue(node: GraphNode | null): Record<string, unknown> | null {
  const properties = readPlainRecord(node?.properties)
  const card = readPlainRecord(properties?.['canvas:widgetCard'])
  if (!card) return null
  return readPlainRecord(card.value) || card
}

function readRunDownstreamConfigTargetIds(value: unknown): string[] {
  const config = readPlainRecord(value)
  if (!config || cleanString(config.trigger) !== 'runDownstream') return []
  return [
    ...readStringList(config.targets),
    ...readStringList(config.targetIds),
    ...readStringList(config.target),
    ...readStringList(config.targetNodeId),
  ]
}

export function readFlowWidgetCardRunDownstreamTargetIds(node: GraphNode | null): string[] {
  const cardValue = readWidgetCardValue(node)
  if (!cardValue) return []

  const seen = new Set<string>()
  const out: string[] = []
  pushUnique(out, seen, readRunDownstreamConfigTargetIds(cardValue.onEdit))

  const actions = Array.isArray(cardValue.actions) ? cardValue.actions : []
  for (const action of actions) {
    pushUnique(out, seen, readRunDownstreamConfigTargetIds(action))
  }

  return out
}

function readOutgoingEdgeTargetIds(args: { node: GraphNode; graphData: GraphData | null }): string[] {
  const sourceId = cleanString(args.node.id)
  if (!sourceId || !Array.isArray(args.graphData?.edges)) return []
  const seen = new Set<string>()
  const out: string[] = []
  for (const edge of args.graphData.edges as GraphEdge[]) {
    const endpoints = readGraphEdgeEndpoints(edge)
    if (endpoints.src !== sourceId) continue
    pushUnique(out, seen, [endpoints.tgt])
  }
  return out
}

export function isStoryboardWidgetSystemOwnedWorkflowEdge(edge: GraphEdge): boolean {
  const properties = readPlainRecord(unwrapGraphCellValue(edge.properties))
  return unwrapGraphCellValue(properties?.workflowOutputEdge) === true
    || unwrapGraphCellValue(properties?.imageThreeJsOutputEdge) === true
    || unwrapGraphCellValue(properties?.imageGlbOutputEdge) === true
}

/**
 * Reconciles only user-authored outgoing topology for the exact Run owner.
 * Panel metadata and root aliases never synthesize an edge here.
 */
export function mergeStoryboardWidgetExplicitRunTargetTopology(args: {
  graphData: GraphData
  liveGraphData: GraphData | null | undefined
  sourceNodeId: string
}): GraphData {
  const sourceNodeId = cleanString(args.sourceNodeId)
  if (!sourceNodeId || !args.liveGraphData) return args.graphData

  const liveNodes = Array.isArray(args.liveGraphData.nodes) ? args.liveGraphData.nodes : []
  const liveEdges = Array.isArray(args.liveGraphData.edges) ? args.liveGraphData.edges : []
  const authoredEdges = liveEdges.filter(edge => {
    const endpoints = readGraphEdgeEndpoints(edge)
    return isCanonicalNodeIdEqual(endpoints.src, sourceNodeId)
      && cleanString(edge.label) !== 'candidateOption'
      && !isStoryboardWidgetSystemOwnedWorkflowEdge(edge)
  })
  if (authoredEdges.length === 0) return args.graphData

  const currentNodes = Array.isArray(args.graphData.nodes) ? args.graphData.nodes : []
  const currentEdges = Array.isArray(args.graphData.edges) ? args.graphData.edges : []
  const appendedNodes: GraphNode[] = []
  const appendedEdges: GraphEdge[] = []

  for (const edge of authoredEdges) {
    const endpoints = readGraphEdgeEndpoints(edge)
    const targetNode = liveNodes.find(node => isCanonicalNodeIdEqual(node.id, endpoints.tgt))
    if (!targetNode) continue
    const targetExists = [...currentNodes, ...appendedNodes]
      .some(node => isCanonicalNodeIdEqual(node.id, targetNode.id))
    if (!targetExists) appendedNodes.push(targetNode)

    const edgeExists = [...currentEdges, ...appendedEdges].some(currentEdge => {
      const currentEndpoints = readGraphEdgeEndpoints(currentEdge)
      return isCanonicalNodeIdEqual(currentEndpoints.src, endpoints.src)
        && isCanonicalNodeIdEqual(currentEndpoints.tgt, endpoints.tgt)
    })
    if (!edgeExists) appendedEdges.push(edge)
  }

  if (appendedNodes.length === 0 && appendedEdges.length === 0) return args.graphData
  return bumpStoryboardWidgetDraftGraphDataRevision({
    ...args.graphData,
    nodes: [...currentNodes, ...appendedNodes],
    edges: [...currentEdges, ...appendedEdges],
  })
}

export function resolveStoryboardWidgetWorkflowDownstreamRunTargetIds(args: {
  node: GraphNode
  graphData: GraphData | null
}): string[] {
  const graphNodeIds = new Set(
    (Array.isArray(args.graphData?.nodes) ? args.graphData!.nodes : [])
      .map(node => cleanString(node?.id))
      .filter(Boolean),
  )
  const sourceId = cleanString(args.node.id)
  const authoredTargetIds = readFlowWidgetCardRunDownstreamTargetIds(args.node)
  const candidateTargetIds = authoredTargetIds.length > 0
    ? authoredTargetIds
    : readOutgoingEdgeTargetIds({ node: args.node, graphData: args.graphData })

  const seen = new Set<string>()
  const out: string[] = []
  for (const targetId of candidateTargetIds) {
    const id = cleanString(targetId)
    if (!id || id === sourceId || seen.has(id)) continue
    if (graphNodeIds.size > 0 && !graphNodeIds.has(id)) continue
    seen.add(id)
    out.push(id)
  }
  return out
}

export function isStoryboardWidgetWorkflowRunnableNode(args: {
  node: GraphNode | null
  resolveRichMediaKind?: (node: GraphNode) => unknown
}): boolean {
  const node = args.node
  if (!node) return false
  const nodeType = cleanString(node.type)
  if (readFlowComputeSource(node)) return true
  if (nodeType === FLOW_VIDEO_TRANSCRIBER_NODE_TYPE_ID) return true
  if (nodeType === FLOW_SWARM_PREDICTION_NODE_TYPE_ID) return true
  if (nodeType === FLOW_TEXT_GENERATION_NODE_TYPE_ID) return true
  return Boolean(args.resolveRichMediaKind?.(node))
}
