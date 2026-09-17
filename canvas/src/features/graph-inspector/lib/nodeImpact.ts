import type { GraphData, GraphEdge, GraphNode } from '@/lib/graph/types'
import type { CachedGraphLookup } from '@/lib/graph/lookupCache'
import { unwrapGraphCellValue } from '@/lib/graph/nodeProperties'
import { traverseNeighborhood } from '../../../../../mcp/agent-graph/neighborhood.mjs'

export type ImpactDirection = 'incoming' | 'outgoing'
const text = (value: unknown): string => {
  const unwrapped = unwrapGraphCellValue(value)
  return typeof unwrapped === 'string' ? unwrapped.trim() : ''
}
export const impactSourcePath = (node: GraphNode) => text(node.properties?.['corpus:sourcePath'])
  || text(node.properties?.['evidence:sourcePath']) || text(node.properties?.sourcePath)
export const impactExplanation = (edge: GraphEdge) => text(edge.properties?.['evidence:explanation'])
  || 'No source explanation was captured for this relationship.'

export function inspectNodeImpact(lookup: CachedGraphLookup, nodeId: string, depth: number, direction: ImpactDirection) {
  if (![1, 2, 3].includes(depth) || !['incoming', 'outgoing'].includes(direction)) throw new Error('Invalid impact traversal')
  if (lookup.nodes.length > 2000 || lookup.edges.length > 5000) throw new Error('Impact inspection supports at most 2,000 loaded nodes and 5,000 edges. Narrow the graph first.')
  if (!lookup.nodeById.has(nodeId)) return null
  const traversal = traverseNeighborhood(lookup, nodeId, { direction, maxDepth: depth, limit: 5000 })
  const affected = traversal.nodeIds.filter(id => id !== nodeId && lookup.nodeById.has(id))
    .map(id => ({ node: lookup.nodeById.get(id)!, hops: traversal.depths[id] as number }))
  const files = new Set(affected.map(row => impactSourcePath(row.node)).filter(Boolean))
  const incident = [...new Map((lookup.incidentEdgesByNodeId.get(nodeId) || []).map(edge => [edge.id, edge])).values()]
  const incoming = incident.filter(edge => edge.target === nodeId)
  const outgoing = incident.filter(edge => edge.source === nodeId)
  const graph = lookup.graphData as GraphData
  const projection = graph.metadata?.agentGraphProjection as Record<string, unknown> | undefined
  const incomplete = !!graph.metadata?.agentGraphPreview || projection?.complete === false
    || projection?.projectionComplete === false || projection?.projectionTruncated === true
    || traversal.limitTruncated || traversal.nodeIds.some(id => !lookup.nodeById.has(id))
  return { affected, fileCount: files.size, unknownFiles: affected.filter(row => !impactSourcePath(row.node)).length,
    incoming, outgoing, incomplete, nodeIds: [nodeId, ...affected.map(row => row.node.id)], edgeIds: traversal.edgeIds }
}


export function rankImpactNodes(lookup: CachedGraphLookup) {
  return lookup.nodes.map(node => {
    const edges = [...new Map((lookup.incidentEdgesByNodeId.get(node.id) || []).map(edge => [edge.id, edge])).values()]
    const provenance = text(node.properties?.['evidence:kind']) || text(node.metadata?.provenance)
    const kinds = provenance ? [provenance] : [...new Set(edges.map(edge => text(edge.properties?.['evidence:kind'])).filter(Boolean))]
    const prov = kinds.length ? kinds.sort().join(', ') : 'unreported'
    const kind = String(node.type || 'unreported'), path = impactSourcePath(node)
    const search = `${node.id} ${node.label || ''} ${kind} ${path} ${text(node.properties?.['corpus:repository'])}`.toLowerCase()
    return { node, degree: edges.length, kind, path, provenance: prov, provenanceBasis: provenance ? 'node' : 'incident edges', search }
  }).sort((a, b) => b.degree - a.degree || (a.node.id < b.node.id ? -1 : a.node.id > b.node.id ? 1 : 0))
}

export function filterImpactNodes(rows: ReturnType<typeof rankImpactNodes>, query: string) {
  const tokens: string[] = query.slice(0, 256).toLowerCase().match(/(?:[^\s"]+|"[^"]*")+/g) || []
  return rows.filter(row => tokens.every(token => {
    const colon = token.indexOf(':'), key = colon < 0 ? '' : token.slice(0, colon)
    const value = (colon < 0 ? token : token.slice(colon + 1)).replaceAll('"', '')
    if (!value) return false
    const field = key === 'kind' ? row.kind : key === 'path' ? row.path : key === 'prov' ? row.provenance : null
    return field === null ? row.search.includes(token.replaceAll('"', '')) : field.toLowerCase().includes(value)
  }))
}
