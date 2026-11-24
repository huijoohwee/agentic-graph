import { createRecordRelation } from '@agentic-base/views-react/record-links'
import type { GraphData, GraphEdge, GraphNode } from '@/lib/graph/types'
import { unwrapGraphCellValue } from '@/lib/graph/nodeProperties'
import { buildScopedGraphSemanticKey } from '@/lib/graph/semanticKey'
import {
  hashScopedStringArraySignature,
  hashSignatureParts,
  normalizeStringArrayForSignature,
} from '@/lib/hash/signature'

const GRAPH_LOOKUP_CACHE_LIMIT = 16
const GRAPH_SUBSET_CACHE_LIMIT = 48

export type CachedGraphLookup = {
  cacheKey: string
  graphData: GraphData
  nodes: GraphNode[]
  edges: GraphEdge[]
  nodeById: Map<string, GraphNode>
  edgeById: Map<string, GraphEdge>
  incidentEdgesByNodeId: Map<string, GraphEdge[]>
}

export type CachedGraphSubset = {
  cacheKey: string
  nodeIds: string[]
  nodeIdSet: Set<string>
  nodes: GraphNode[]
  edges: GraphEdge[]
}

type GetCachedGraphLookupArgs = {
  cacheScope: string
  graphData?: GraphData | null
  graphRevision?: number | null
  graphSemanticKey?: string | null
  sourceLayerHash?: string | null
  sourceLayerOrderHash?: string | null
  preferCurrentGraphDataRefs?: boolean
}

const graphLookupCache = new Map<string, CachedGraphLookup>()
const graphSubsetCache = new Map<string, CachedGraphSubset>()

function readGraphCollections(graphData: GraphData): { nodes: GraphNode[]; edges: GraphEdge[] } {
  return {
    nodes: Array.isArray(graphData.nodes) ? graphData.nodes : [],
    edges: Array.isArray(graphData.edges) ? graphData.edges : [],
  }
}

function readCachedGraphLookup(cacheKey: string): CachedGraphLookup | null {
  const cached = graphLookupCache.get(cacheKey) || null
  if (!cached) return null
  graphLookupCache.delete(cacheKey)
  graphLookupCache.set(cacheKey, cached)
  return cached
}

function writeCachedGraphLookup(cacheKey: string, value: CachedGraphLookup): CachedGraphLookup {
  graphLookupCache.set(cacheKey, value)
  if (graphLookupCache.size > GRAPH_LOOKUP_CACHE_LIMIT) {
    const oldestKey = graphLookupCache.keys().next().value
    if (typeof oldestKey === 'string') graphLookupCache.delete(oldestKey)
  }
  return value
}

function readCachedGraphSubset(cacheKey: string): CachedGraphSubset | null {
  const cached = graphSubsetCache.get(cacheKey) || null
  if (!cached) return null
  graphSubsetCache.delete(cacheKey)
  graphSubsetCache.set(cacheKey, cached)
  return cached
}

function writeCachedGraphSubset(cacheKey: string, value: CachedGraphSubset): CachedGraphSubset {
  graphSubsetCache.set(cacheKey, value)
  if (graphSubsetCache.size > GRAPH_SUBSET_CACHE_LIMIT) {
    const oldestKey = graphSubsetCache.keys().next().value
    if (typeof oldestKey === 'string') graphSubsetCache.delete(oldestKey)
  }
  return value
}

function buildGraphLookup(cacheKey: string, graphData: GraphData): CachedGraphLookup {
  const { nodes, edges } = readGraphCollections(graphData)
  const nodeById = new Map<string, GraphNode>()
  const edgeById = new Map<string, GraphEdge>()
  const endpointIds = new Set<string>()
  const edgeKeys: string[] = []
  const links: { source: string; target: string }[] = []

  for (let i = 0; i < nodes.length; i += 1) {
    const node = nodes[i]
    const id = String(unwrapGraphCellValue(node?.id) ?? '').trim()
    if (!id) continue
    nodeById.set(id, node)
  }

  for (let i = 0; i < edges.length; i += 1) {
    const edge = edges[i]
    const edgeId = String(unwrapGraphCellValue(edge?.id) ?? '').trim()
    if (edgeId) edgeById.set(edgeId, edge)

    const sourceId = String(unwrapGraphCellValue(edge?.source) ?? '').trim()
    const targetId = String(unwrapGraphCellValue(edge?.target) ?? '').trim()
    // Position identifies the exact original edge, including anonymous and repeated edges.
    const edgeKey = String(i)
    edgeKeys.push(edgeKey)
    for (const endpoint of [sourceId, targetId]) {
      if (!endpoint) continue
      endpointIds.add(endpoint)
      links.push({ source: edgeKey, target: JSON.stringify(endpoint) })
    }
  }

  const incidence = createRecordRelation({
    sources: edgeKeys, targets: Array.from(endpointIds, id => JSON.stringify(id)), links,
  })
  // Existing graph consumers iterate this Map and depend on the original edge objects and order.
  const incidentEdgesByNodeId = new Map<string, GraphEdge[]>()
  for (const id of endpointIds) {
    incidentEdgesByNodeId.set(id, incidence.to(JSON.stringify(id)).map(link => edges[Number(link.source)]!))
  }

  return {
    cacheKey,
    graphData,
    nodes,
    edges,
    nodeById,
    edgeById,
    incidentEdgesByNodeId,
  }
}

export function getCachedGraphLookup(args: GetCachedGraphLookupArgs): CachedGraphLookup | null {
  const graphData = args.graphData || null
  if (!graphData) return null

  const cacheKey = buildScopedGraphSemanticKey(args.cacheScope, {
    graphData,
    graphRevision: args.graphRevision,
    graphSemanticKey: args.graphSemanticKey,
    sourceLayerHash: args.sourceLayerHash,
    sourceLayerOrderHash: args.sourceLayerOrderHash,
  })
  if (!cacheKey) return null

  const cached = readCachedGraphLookup(cacheKey)
  if (cached) {
    if (cached.graphData !== graphData) {
      const { nodes, edges } = readGraphCollections(graphData)
      const reusesCurrentCollections = cached.nodes === nodes && cached.edges === edges
      if (args.preferCurrentGraphDataRefs === true) {
        if (reusesCurrentCollections) {
          cached.graphData = graphData
          return cached
        }
        return writeCachedGraphLookup(cacheKey, buildGraphLookup(cacheKey, graphData))
      }
      cached.graphData = graphData
    }
    return cached
  }

  return writeCachedGraphLookup(cacheKey, buildGraphLookup(cacheKey, graphData))
}

export function getCachedGraphSubsetByNodeIds(args: {
  graphLookup?: CachedGraphLookup | null
  nodeIds: string[]
  cacheScope?: string
}): CachedGraphSubset | null {
  const graphLookup = args.graphLookup || null
  if (!graphLookup) return null

  const normalizedNodeIds = normalizeStringArrayForSignature(args.nodeIds, {
    unique: true,
    sort: true,
  })
  if (normalizedNodeIds.length === 0) return null

  const nodeIdsSignature = hashScopedStringArraySignature(
    args.cacheScope || 'graph-subset-node-ids',
    normalizedNodeIds,
  )
  const cacheKey = hashSignatureParts([
    args.cacheScope || 'graph-subset',
    graphLookup.cacheKey,
    nodeIdsSignature,
  ])
  const cached = readCachedGraphSubset(cacheKey)
  if (cached) return cached

  const nodeIdSet = new Set(normalizedNodeIds)
  const nodes = normalizedNodeIds
    .map(id => graphLookup.nodeById.get(id) || null)
    .filter((node): node is GraphNode => !!node)
  if (nodes.length === 0) return null

  const edges: GraphEdge[] = []
  const seenEdgeIds = new Set<string>()
  for (let i = 0; i < normalizedNodeIds.length; i += 1) {
    const nodeId = normalizedNodeIds[i]
    const incidentEdges = graphLookup.incidentEdgesByNodeId.get(nodeId) || []
    for (let edgeIndex = 0; edgeIndex < incidentEdges.length; edgeIndex += 1) {
      const edge = incidentEdges[edgeIndex]
      const edgeId = String(edge?.id || '').trim()
      const sourceId = String(edge?.source || '').trim()
      const targetId = String(edge?.target || '').trim()
      if (!nodeIdSet.has(sourceId) && !nodeIdSet.has(targetId)) continue
      const dedupeKey = edgeId || `${sourceId}->${targetId}:${edgeIndex}`
      if (seenEdgeIds.has(dedupeKey)) continue
      seenEdgeIds.add(dedupeKey)
      edges.push(edge)
    }
  }

  return writeCachedGraphSubset(cacheKey, {
    cacheKey,
    nodeIds: normalizedNodeIds,
    nodeIdSet,
    nodes,
    edges,
  })
}
