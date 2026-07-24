import { hashSignatureParts } from '@/lib/hash/signature'
import type { GraphData, GraphEdge, GraphNode } from '@/lib/graph/types'
import { splitComposedNodeId } from '@/lib/graph/canonicalNodeIds'
import { readGraphEdgeEndpoints } from '@/lib/graph/edgeEndpoints'
import { readFlowEdgePortKey } from '@/lib/graph/flowPorts'
import { readNodeProperties } from '@/lib/graph/nodeProperties'

function measuredLayoutKey(value: unknown): string {
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? String(Math.round(n)) : '0'
}

function readVisualLayoutKey(props: Record<string, unknown>, key: string): string {
  const raw = props[key]
  return raw == null ? '' : measuredLayoutKey(raw)
}

function readCanonicalOverlayIdentity(rawId: unknown): string {
  const id = String(rawId || '').trim()
  if (!id) return ''
  return splitComposedNodeId(id).inner || id
}

export function buildOverlayTopologyLayoutSignature(graphData: GraphData | null | undefined): string {
  const nodes = Array.isArray(graphData?.nodes) ? (graphData!.nodes as GraphNode[]) : []
  const edges = Array.isArray(graphData?.edges) ? (graphData!.edges as GraphEdge[]) : []
  const nodeLayoutSignature = buildOverlayNodeLayoutSignature({ ...graphData, nodes } as GraphData)
  const edgeParts = edges
    .map(edge => {
      const { src, tgt } = readGraphEdgeEndpoints(edge)
      const sourcePortKey = readFlowEdgePortKey(edge, 'source') || ''
      const targetPortKey = readFlowEdgePortKey(edge, 'target') || ''
      return [
        readCanonicalOverlayIdentity(edge.id),
        readCanonicalOverlayIdentity(src),
        readCanonicalOverlayIdentity(tgt),
        String(edge.label || '').trim(),
        sourcePortKey,
        targetPortKey,
      ].join(':')
    })
    .filter(part => part.replace(/:/g, '').trim())
    .sort()
  return hashSignatureParts(['overlay-topology-layout', nodeLayoutSignature, edgeParts.length, ...edgeParts])
}

export function buildOverlayNodeLayoutSignature(graphData: GraphData | null | undefined): string {
  const nodes = Array.isArray(graphData?.nodes) ? (graphData!.nodes as GraphNode[]) : []
  const nodeParts = nodes
    .map(node => {
      const id = readCanonicalOverlayIdentity(node?.id)
      if (!id) return ''
      const props = readNodeProperties(node)
      return [
        id,
        String(node.type || '').trim(),
        readVisualLayoutKey(props, 'visual:width'),
        readVisualLayoutKey(props, 'visual:height'),
        readVisualLayoutKey(props, 'visual:minWidth'),
        readVisualLayoutKey(props, 'visual:minHeight'),
        String(props['visual:zIndex'] || '').trim(),
        String(props['flow:widgetFormId'] || '').trim(),
      ].join(':')
    })
    .filter(Boolean)
    .sort()
  return hashSignatureParts(['overlay-node-layout', nodeParts.length, ...nodeParts])
}
