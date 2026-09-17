import type { GraphData, GraphEdge, GraphNode } from '@/lib/graph/types'
import { fitAgentGraphProjectionRecords, AGENT_GRAPH_PROJECTION_GRAPH_DATA_MAX_BYTES } from '../../../../mcp/agent-graph/projection-budget.mjs'
import { hashStringToIndex } from 'grph-shared/hash/stringHash'
import { getCachedGraphLookup } from '@/lib/graph/lookupCache'
import { rankImpactNodes } from '@/features/graph-inspector/lib/nodeImpact'

// Presentation only: source evidence and canonical snapshot identities remain unchanged.
export const AGENT_GRAPH_GROUP_COLORS = ['#38bdf8', '#a78bfa', '#fb923c', '#2dd4bf', '#f472b6', '#facc15'] as const
export const AGENT_GRAPH_CERTAINTY_STYLES = {
  exact: { dash: '0', width: 2, label: 'Exact source relationship' },
  inferred: { dash: '6 4', width: 1.5, label: 'Statically inferred relationship' },
  ambiguous: { dash: '1 4', width: 1, label: 'Ambiguous relationship' },
  unreported: { dash: '1 7', width: 1, label: 'Certainty not captured' },
} as const
export function agentGraphSourceGroup(node: GraphNode): string {
  const path = String(node.properties?.['corpus:sourcePath'] || '')
  return path ? path.includes('/') ? path.split('/')[0]! : '(repository root)' : '(unreported source)'
}
export function agentGraphGroupColor(group: string): string {
  return AGENT_GRAPH_GROUP_COLORS[hashStringToIndex(group, AGENT_GRAPH_GROUP_COLORS.length)]!
}
export function styleAgentGraphNode(node: GraphNode): GraphNode {
  const group = agentGraphSourceGroup(node)
  return { ...node, properties: { ...node.properties, 'visual:layer': group, 'visual:fill': agentGraphGroupColor(group) } }
}
export function agentGraphEdgeCertainty(edge: GraphEdge): keyof typeof AGENT_GRAPH_CERTAINTY_STYLES {
  const value = edge.properties?.['evidence:certainty']
  return value === 'exact' || value === 'inferred' || value === 'ambiguous' ? value : 'unreported'
}
export function styleAgentGraphEdge(edge: GraphEdge): GraphEdge {
  const style = AGENT_GRAPH_CERTAINTY_STYLES[agentGraphEdgeCertainty(edge)]
  return { ...edge, properties: { ...edge.properties, 'visual:dash': style.dash, 'visual:strokeWidth': style.width } }
}

export function styleAgentGraphProjection(graph: GraphData): GraphData {
  const metadata: NonNullable<GraphData['metadata']> = { ...graph.metadata, agentGraphVisualEvidence: 'source-directory-certainty/v1' }
  const buildGraphData = (nodes: GraphNode[], edges: GraphEdge[]): GraphData => {
    const candidate = { ...graph, metadata, nodes, edges }
    const lookup = getCachedGraphLookup({ cacheScope: 'agent-graph-sizing', graphData: candidate })
    const degree = new Map(rankImpactNodes(lookup).map(row => [row.node.id, row.degree]))
    return { ...candidate, nodes: nodes.map(node => ({ ...node, properties: { ...node.properties,
      'visual:nodeSize': Math.min(36, 6 + Math.round(Math.sqrt(degree.get(node.id) || 0) * 4)),
    } })) }
  }
  const fitted = fitAgentGraphProjectionRecords({ nodes: graph.nodes.map(styleAgentGraphNode),
    edges: graph.edges.map(styleAgentGraphEdge), maxBytes: AGENT_GRAPH_PROJECTION_GRAPH_DATA_MAX_BYTES, buildGraphData })
  const projected = buildGraphData(fitted.nodes, fitted.edges)
  if (fitted.truncated && metadata.agentGraphProjection) {
    projected.metadata = { ...metadata, agentGraphProjection: { ...metadata.agentGraphProjection as Record<string, never>,
      projectionComplete: false, projectionTruncated: true, projectionReason: 'canvas-presentation-budget' } }
  }
  return projected
}
