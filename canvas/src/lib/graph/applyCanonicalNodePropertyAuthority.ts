import { resolveGraphNodeByCanonicalId } from '@/lib/graph/canonicalNodeIds'
import type { GraphData, GraphNode } from '@/lib/graph/types'

const readGraphMetadataString = (graphData: GraphData | null | undefined, key: string): string => {
  const metadata = graphData?.metadata
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return ''
  return String((metadata as Record<string, unknown>)[key] || '').trim()
}

export function hasCompatibleCanonicalNodePropertyAuthority(args: {
  graphData: GraphData | null | undefined
  propertyAuthorityGraphData: GraphData | null | undefined
}): boolean {
  const graphSource = readGraphMetadataString(args.graphData, 'source')
  const authoritySource = readGraphMetadataString(args.propertyAuthorityGraphData, 'source')
  if (graphSource && authoritySource && graphSource !== authoritySource) return false
  const graphSourceLayerHash = readGraphMetadataString(args.graphData, 'sourceLayerHash')
  const authoritySourceLayerHash = readGraphMetadataString(args.propertyAuthorityGraphData, 'sourceLayerHash')
  return !graphSourceLayerHash || !authoritySourceLayerHash || graphSourceLayerHash === authoritySourceLayerHash
}

export function applyCanonicalNodePropertyAuthority(args: {
  graphData: GraphData | null | undefined
  propertyAuthorityGraphData: GraphData | null | undefined
}): GraphData | null {
  const graphData = args.graphData || null
  if (!graphData || !args.propertyAuthorityGraphData) return graphData
  if (!hasCompatibleCanonicalNodePropertyAuthority(args)) return graphData
  let changed = false
  const nodes = (graphData.nodes || []).map(node => {
    const authorityNode = resolveGraphNodeByCanonicalId(args.propertyAuthorityGraphData, node.id)
    if (!authorityNode || authorityNode.properties === node.properties) return node
    changed = true
    return { ...node, properties: authorityNode.properties } as GraphNode
  })
  return changed ? { ...graphData, nodes } : graphData
}
