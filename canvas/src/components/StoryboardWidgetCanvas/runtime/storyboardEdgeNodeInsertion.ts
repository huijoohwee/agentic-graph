import { createUniqueId } from '@/lib/ids'
import type { GraphData, GraphEdge, GraphNode, JSONValue } from '@/lib/graph/types'
import {
  FLOW_EDGE_DISPLAY_LABEL_KEY,
  FLOW_EDGE_SOURCE_PORT_KEY,
  FLOW_EDGE_TARGET_PORT_KEY,
} from '@/lib/graph/flowPorts'
import { readEdgeEndpointId } from '@/lib/graph/edgeEndpoints'

export type StoryboardEdgeInsertionKind = 'transform' | 'join' | 'branch'

export const STORYBOARD_EDGE_INSERTION_OPTIONS: ReadonlyArray<{
  kind: StoryboardEdgeInsertionKind
  label: string
  nodeType: string
}> = [
  { kind: 'transform', label: 'Transform Node', nodeType: 'TransformNode' },
  { kind: 'join', label: 'Join Node', nodeType: 'JoinNode' },
  { kind: 'branch', label: 'Branch Node', nodeType: 'BranchNode' },
]

function readRecord(value: unknown): Record<string, JSONValue> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? { ...(value as Record<string, JSONValue>) }
    : {}
}

function splitEdgeProperties(
  edge: GraphEdge,
  side: 'incoming' | 'outgoing',
): Record<string, JSONValue> {
  const properties = readRecord(edge.properties)
  delete properties[FLOW_EDGE_DISPLAY_LABEL_KEY]
  if (side === 'incoming') delete properties[FLOW_EDGE_TARGET_PORT_KEY]
  else delete properties[FLOW_EDGE_SOURCE_PORT_KEY]
  return properties
}

function readFiniteCoordinate(value: unknown): number | null {
  const next = Number(value)
  return Number.isFinite(next) ? next : null
}

function resolveInsertionPosition(
  source: GraphNode | null,
  target: GraphNode | null,
  explicit?: { x: number; y: number } | null,
): { x: number; y: number } {
  if (explicit && Number.isFinite(explicit.x) && Number.isFinite(explicit.y)) {
    return { x: explicit.x, y: explicit.y }
  }
  const sourceX = readFiniteCoordinate(source?.x)
  const sourceY = readFiniteCoordinate(source?.y)
  const targetX = readFiniteCoordinate(target?.x)
  const targetY = readFiniteCoordinate(target?.y)
  return {
    x: sourceX != null && targetX != null ? (sourceX + targetX) / 2 : sourceX ?? targetX ?? 0,
    y: sourceY != null && targetY != null ? (sourceY + targetY) / 2 : sourceY ?? targetY ?? 0,
  }
}

export type StoryboardEdgeNodeInsertionResult = {
  graphData: GraphData
  insertedNode: GraphNode
  incomingEdge: GraphEdge
  outgoingEdge: GraphEdge
}

export function insertStoryboardWorkflowNodeOnEdge(args: {
  graphData: GraphData
  edgeId: string
  kind: StoryboardEdgeInsertionKind
  position?: { x: number; y: number } | null
}): StoryboardEdgeNodeInsertionResult | null {
  const edgeId = String(args.edgeId || '').trim()
  const option = STORYBOARD_EDGE_INSERTION_OPTIONS.find(item => item.kind === args.kind)
  const nodes = Array.isArray(args.graphData.nodes) ? args.graphData.nodes : []
  const edges = Array.isArray(args.graphData.edges) ? args.graphData.edges : []
  const edgeIndex = edges.findIndex(edge => String(edge?.id || '').trim() === edgeId)
  if (!option || edgeIndex < 0) return null

  const edge = edges[edgeIndex]
  const sourceId = readEdgeEndpointId(edge?.source)
  const targetId = readEdgeEndpointId(edge?.target)
  if (!sourceId || !targetId) return null

  const usedNodeIds = new Set(nodes.map(node => String(node?.id || '').trim()).filter(Boolean))
  const usedEdgeIds = new Set(edges.map(item => String(item?.id || '').trim()).filter(Boolean))
  const nodeId = createUniqueId('n', usedNodeIds)
  const outgoingEdgeId = createUniqueId('e', usedEdgeIds)
  const sourceNode = nodes.find(node => String(node?.id || '').trim() === sourceId) || null
  const targetNode = nodes.find(node => String(node?.id || '').trim() === targetId) || null
  const position = resolveInsertionPosition(sourceNode, targetNode, args.position)

  const insertedNode: GraphNode = {
    id: nodeId,
    type: option.nodeType,
    label: option.label,
    x: position.x,
    y: position.y,
    properties: {
      'workflow:role': option.kind,
    },
  }
  const incomingEdge: GraphEdge = {
    ...edge,
    target: nodeId,
    properties: splitEdgeProperties(edge, 'incoming'),
  }
  const outgoingEdge: GraphEdge = {
    ...edge,
    id: outgoingEdgeId,
    source: nodeId,
    target: targetId,
    properties: splitEdgeProperties(edge, 'outgoing'),
  }
  const nextEdges = edges.slice()
  nextEdges.splice(edgeIndex, 1, incomingEdge, outgoingEdge)

  return {
    graphData: {
      ...args.graphData,
      nodes: [...nodes, insertedNode],
      edges: nextEdges,
    },
    insertedNode,
    incomingEdge,
    outgoingEdge,
  }
}
