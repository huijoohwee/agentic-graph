import type { GraphData } from '@/lib/graph/types'
import { applyCanonicalNodePropertyAuthority } from '@/lib/graph/applyCanonicalNodePropertyAuthority'
import { KG_SUBGRAPHS_KEY, readSubgraphs, writeSubgraphs } from '@/lib/graph/subgraphs'
import { normalizeAllStoryboardWidgetProbeTreeOutputLayouts } from './storyboardWidgetProbeTreeLayout'

const hasGraphNodes = (graphData: GraphData | null | undefined): graphData is GraphData =>
  Array.isArray(graphData?.nodes) && graphData.nodes.length > 0

export function isAuthoritativeEmptyStoryboardGraph(graphData: GraphData | null | undefined): boolean {
  const nodes = Array.isArray(graphData?.nodes) ? graphData.nodes : []
  const edges = Array.isArray(graphData?.edges) ? graphData.edges : []
  if (!graphData || nodes.length > 0 || edges.length > 0) return false
  const metadata = graphData.metadata
  return !!(
    metadata
    && typeof metadata === 'object'
    && !Array.isArray(metadata)
    && (metadata as Record<string, unknown>).pending === true
  )
}

export function applyStoryboardCanvasGraphPropertyAuthority(args: {
  graphData: GraphData | null | undefined
  propertyAuthorityGraphData: GraphData | null | undefined
}): GraphData | null {
  let graphData = applyCanonicalNodePropertyAuthority(args)
  const authorityMetadata = args.propertyAuthorityGraphData?.metadata
  const hasCanonicalSubgraphAuthority = !!(
    authorityMetadata
    && typeof authorityMetadata === 'object'
    && !Array.isArray(authorityMetadata)
    && Object.prototype.hasOwnProperty.call(authorityMetadata, KG_SUBGRAPHS_KEY)
  )
  if (graphData && hasCanonicalSubgraphAuthority) {
    graphData = writeSubgraphs(graphData, readSubgraphs(args.propertyAuthorityGraphData))
  }
  return graphData ? normalizeAllStoryboardWidgetProbeTreeOutputLayouts(graphData) : null
}

export function resolveStoryboardCanvasGraphDataAuthority(args: {
  baseGraphData: GraphData | null
  draftGraphData: GraphData | null
  renderGraphData: GraphData | null
}): GraphData {
  if (isAuthoritativeEmptyStoryboardGraph(args.draftGraphData)) {
    return args.draftGraphData
  }
  const graphData = hasGraphNodes(args.renderGraphData)
    ? args.renderGraphData
    : hasGraphNodes(args.draftGraphData)
      ? args.draftGraphData
      : hasGraphNodes(args.baseGraphData)
        ? args.baseGraphData
        : args.renderGraphData || args.draftGraphData || args.baseGraphData || { context: '', type: 'Graph', nodes: [], edges: [] }
  const propertyAuthorityGraphData = hasGraphNodes(args.draftGraphData)
    ? args.draftGraphData
    : args.baseGraphData
  return applyStoryboardCanvasGraphPropertyAuthority({
    graphData,
    propertyAuthorityGraphData,
  }) || { context: '', type: 'Graph', nodes: [], edges: [] }
}
