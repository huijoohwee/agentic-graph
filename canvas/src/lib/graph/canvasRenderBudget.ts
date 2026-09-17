import type { GraphData, GraphEdge, GraphNode, JSONValue } from '@/lib/graph/types'
import { readGraphEdgeEndpoints } from '@/lib/graph/edgeEndpoints'
import { buildScopedGraphSemanticKey } from '@/lib/graph/semanticKey'
import { isStructuralGraphEdge, readGraphTopologySummary, withGraphTopologyMetadata } from '@/lib/graph/graphTopology'

export type CanvasRenderBudgetSurface = 'd3Graph' | 'surface3d' | 'none'

type CanvasRenderBudgetConfig = {
  maxNodes: number
  maxEdges: number
  maxIncidentEdgesPerNode: number
}

type ScoredNode = {
  node: GraphNode
  id: string
  index: number
  score: number
  degree: number
  structuralDegree: number
}

type ScoredEdge = {
  edge: GraphEdge
  index: number
  sourceId: string
  targetId: string
  score: number
  structural: boolean
}

const RENDER_BUDGET_CACHE_LIMIT = 16
const STRUCTURAL_NODE_RESERVE_RATIO = 0.75
const renderBudgetCache = new WeakMap<object, Map<string, GraphData>>()

const D3_GRAPH_BUDGET: CanvasRenderBudgetConfig = {
  maxNodes: 420,
  maxEdges: 1800,
  maxIncidentEdgesPerNode: 10,
}

const SURFACE_3D_BUDGET: CanvasRenderBudgetConfig = {
  maxNodes: 320,
  maxEdges: 1200,
  maxIncidentEdgesPerNode: 8,
}

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

const readRecord = (value: unknown): Record<string, unknown> => {
  return isRecord(value) ? value : {}
}

const readFiniteNumber = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

const readWeightedNumber = (record: Record<string, unknown>, keys: readonly string[], scale = 1): number => {
  let score = 0
  for (let i = 0; i < keys.length; i += 1) {
    const raw = readFiniteNumber(record[keys[i]!])
    if (raw == null) continue
    const n = Math.max(0, Math.abs(raw))
    score += Math.min(64, Math.log2(n + 1) * scale)
  }
  return score
}

const hasMediaSignal = (node: GraphNode, props: Record<string, unknown>): boolean => {
  const type = String((node as { type?: unknown }).type || '').toLowerCase()
  if (/\b(image|video|audio|media|iframe|model|html)\b/.test(type)) return true
  for (const key of ['media_url', 'mediaUrl', 'src', 'url', 'image', 'video', 'iframe', 'assetUrl']) {
    const value = props[key]
    if (typeof value === 'string' && value.trim()) return true
  }
  return false
}

const scoreNode = (node: GraphNode, id: string, index: number, degree: number, structuralDegree: number): number => {
  const props = readRecord((node as { properties?: unknown }).properties)
  const metadata = readRecord((node as { metadata?: unknown }).metadata)
  const type = String((node as { type?: unknown }).type || '').toLowerCase()
  const labels = Array.isArray((node as { labels?: unknown }).labels)
    ? ((node as { labels?: unknown[] }).labels || []).map(v => String(v || '').toLowerCase()).join(' ')
    : ''
  let score = 1
  score += Math.min(120, degree * 5)
  if (structuralDegree > 0) score += 32 + Math.min(160, structuralDegree * 12)
  score += readWeightedNumber(props, [
    'visual:importance',
    'visual:nodeSize',
    'visual:fontSize',
    'keyword:score',
    'keyword:frequency',
    'keyword:strength',
    'count',
    'frequency',
    'score',
    'weight',
    'strength',
  ], 8)
  score += readWeightedNumber(metadata, ['importance', 'score', 'weight', 'rankScore'], 6)
  const keywordRank = readFiniteNumber(props['keyword:rank'])
  if (keywordRank != null && keywordRank > 0) score += Math.max(0, 32 - Math.min(32, keywordRank))
  const phraseLength = readFiniteNumber(props['keyword:phraseLength'])
  if (phraseLength != null && phraseLength > 1) score += Math.min(24, phraseLength * 5)
  if (props['visual:wordCloud'] === true) score += 24
  if (String(props['keyword:extractor'] || '').trim()) score += 12
  if (String(props['keyword:sourceRole'] || '').trim() === 'phrase') score += 18
  if (hasMediaSignal(node, props)) score += 48
  if (/\b(root|document|section|heading|group|cluster|hub)\b/.test(`${type} ${labels}`)) score += 20
  if (typeof (node as { x?: unknown }).x === 'number' && Number.isFinite((node as { x?: number }).x)) score += 2
  if (typeof (node as { y?: unknown }).y === 'number' && Number.isFinite((node as { y?: number }).y)) score += 2
  if (id) score += Math.max(0, 1 - Math.min(index, 1000) / 1000)
  return score
}

const scoreEdge = (
  edge: GraphEdge,
  index: number,
  sourceId: string,
  targetId: string,
  nodeScoreById: Map<string, number>,
): number => {
  const props = readRecord((edge as { properties?: unknown }).properties)
  let score = 0
  score += (nodeScoreById.get(sourceId) || 0) * 0.5
  score += (nodeScoreById.get(targetId) || 0) * 0.5
  score += readWeightedNumber(props, [
    'visual:width',
    'visual:importance',
    'keyword:strength',
    'weight',
    'score',
    'strength',
    'count',
  ], 6)
  const label = String((edge as { label?: unknown }).label || '').trim()
  if (label) score += Math.min(8, label.length / 8)
  score += Math.max(0, 1 - Math.min(index, 1000) / 1000)
  return score
}

const readBudgetConfig = (surface: CanvasRenderBudgetSurface): CanvasRenderBudgetConfig | null => {
  if (surface === 'd3Graph') return D3_GRAPH_BUDGET
  if (surface === 'surface3d') return SURFACE_3D_BUDGET
  return null
}

const readCachedBudgetGraph = (graphData: GraphData, cacheKey: string): GraphData | null => {
  const perGraph = renderBudgetCache.get(graphData as unknown as object)
  if (!perGraph) return null
  const cached = perGraph.get(cacheKey) || null
  if (!cached) return null
  perGraph.delete(cacheKey)
  perGraph.set(cacheKey, cached)
  return cached
}

const writeCachedBudgetGraph = (graphData: GraphData, cacheKey: string, value: GraphData): GraphData => {
  const graphObject = graphData as unknown as object
  let perGraph = renderBudgetCache.get(graphObject)
  if (!perGraph) {
    perGraph = new Map<string, GraphData>()
    renderBudgetCache.set(graphObject, perGraph)
  }
  perGraph.set(cacheKey, value)
  if (perGraph.size > RENDER_BUDGET_CACHE_LIMIT) {
    const oldestKey = perGraph.keys().next().value
    if (typeof oldestKey === 'string') perGraph.delete(oldestKey)
  }
  return value
}

export function resolveCanvasRenderBudgetSurface(args: {
  canvasRenderMode: unknown
  canvas2dRenderer: unknown
}): CanvasRenderBudgetSurface {
  if (String(args.canvasRenderMode || '') === '3d') return 'surface3d'
  if (String(args.canvasRenderMode || '') === '2d' && String(args.canvas2dRenderer || '') === 'd3') return 'd3Graph'
  return 'none'
}

export function applyCanvasRenderBudget(args: {
  graphData: GraphData | null | undefined
  graphRevision?: number | null
  surface: CanvasRenderBudgetSurface
  documentSemanticMode?: string | null
  priorityNodeIds?: readonly string[]
  priorityEdgeIds?: readonly string[]
}): GraphData | null {
  const graphData = args.graphData || null
  if (!graphData) return null
  const budget = readBudgetConfig(args.surface)
  if (!budget) return graphData

  const sourceNodes = Array.isArray(graphData.nodes) ? (graphData.nodes as GraphNode[]) : []
  const sourceEdges = Array.isArray(graphData.edges) ? (graphData.edges as GraphEdge[]) : []
  if (sourceNodes.length <= budget.maxNodes && sourceEdges.length <= budget.maxEdges) return graphData

  const topologyGraph = readGraphTopologySummary(graphData)
    ? graphData
    : withGraphTopologyMetadata({
      graphData,
      graphRevision: args.graphRevision,
      stage: 'render-budget',
      annotate: true,
      maxAnnotatedItems: Number.MAX_SAFE_INTEGER,
    }) || graphData
  const nodes = Array.isArray(topologyGraph.nodes) ? (topologyGraph.nodes as GraphNode[]) : []
  const edges = Array.isArray(topologyGraph.edges) ? (topologyGraph.edges as GraphEdge[]) : []
  if (nodes.length <= budget.maxNodes && edges.length <= budget.maxEdges) return graphData

  const priorityNodes = [...new Set(args.priorityNodeIds || [])].slice(0, budget.maxNodes)
  const priorityEdges = new Set((args.priorityEdgeIds || []).slice(0, budget.maxEdges))
  const cacheKey = buildScopedGraphSemanticKey('canvas-render-budget', {
    graphData,
    graphRevision: args.graphRevision || 0,
    graphSemanticKey: [
      args.surface,
      String(args.documentSemanticMode || 'document'),
      `nodes:${budget.maxNodes}`,
      `edges:${budget.maxEdges}`,
      `incident:${budget.maxIncidentEdgesPerNode}`,
      JSON.stringify(priorityNodes), JSON.stringify([...priorityEdges]),
    ].join('|'),
  })
  if (cacheKey) {
    const cached = readCachedBudgetGraph(graphData, cacheKey)
    if (cached) return cached
  }

  const hasTopologyAnnotations = nodes.every(node => {
    const props = readRecord((node as { properties?: unknown }).properties)
    return readFiniteNumber(props['graph:degree']) != null && readFiniteNumber(props['graph:structuralDegree']) != null
  })
  const degreeById = new Map<string, number>()
  const structuralDegreeById = new Map<string, number>()
  const structuralChildrenById = new Map<string, string[]>()
  const structuralParentCountById = new Map<string, number>()
  for (let i = 0; i < edges.length; i += 1) {
    const edge = edges[i]
    const { src, tgt } = readGraphEdgeEndpoints(edge)
    if (!src || !tgt || src === tgt) continue
    if (!hasTopologyAnnotations) {
      degreeById.set(src, (degreeById.get(src) || 0) + 1)
      degreeById.set(tgt, (degreeById.get(tgt) || 0) + 1)
    }
    if (isStructuralGraphEdge(edge)) {
      if (!hasTopologyAnnotations) {
        structuralDegreeById.set(src, (structuralDegreeById.get(src) || 0) + 1)
        structuralDegreeById.set(tgt, (structuralDegreeById.get(tgt) || 0) + 1)
      }
      const children = structuralChildrenById.get(src)
      if (children) children.push(tgt)
      else structuralChildrenById.set(src, [tgt])
      if (!structuralParentCountById.has(src)) structuralParentCountById.set(src, 0)
      structuralParentCountById.set(tgt, (structuralParentCountById.get(tgt) || 0) + 1)
    }
  }

  const scoredNodes: ScoredNode[] = []
  const scoredNodeById = new Map<string, ScoredNode>()
  const nodeIndexById = new Map<string, number>()
  for (let i = 0; i < nodes.length; i += 1) {
    const node = nodes[i]
    const id = String(node?.id || '').trim()
    if (!id) continue
    const props = readRecord((node as { properties?: unknown }).properties)
    const degree = readFiniteNumber(props['graph:degree']) ?? degreeById.get(id) ?? 0
    const structuralDegree = readFiniteNumber(props['graph:structuralDegree']) ?? structuralDegreeById.get(id) ?? 0
    const scored: ScoredNode = {
      node,
      id,
      index: i,
      degree,
      structuralDegree,
      score: scoreNode(node, id, i, degree, structuralDegree),
    }
    scoredNodes.push(scored)
    scoredNodeById.set(id, scored)
    nodeIndexById.set(id, i)
  }

  for (const children of structuralChildrenById.values()) {
    children.sort((a, b) => {
      const aIndex = nodeIndexById.get(a) ?? Number.MAX_SAFE_INTEGER
      const bIndex = nodeIndexById.get(b) ?? Number.MAX_SAFE_INTEGER
      return aIndex - bIndex
    })
  }

  const sortedNodes = scoredNodes.slice().sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score
    if (b.degree !== a.degree) return b.degree - a.degree
    return a.index - b.index
  })
  const retainedById = new Map<string, ScoredNode>()
  const retainNode = (id: string): boolean => {
    if (retainedById.size >= budget.maxNodes || retainedById.has(id)) return false
    const scored = scoredNodeById.get(id)
    if (!scored) return false
    retainedById.set(id, scored)
    return true
  }

  for (const id of priorityNodes) retainNode(id)

  if (structuralDegreeById.size > 0) {
    const structuralReserve = Math.max(1, Math.floor(budget.maxNodes * STRUCTURAL_NODE_RESERVE_RATIO))
    let roots = scoredNodes.filter(item => {
      return (structuralChildrenById.get(item.id)?.length || 0) > 0 && (structuralParentCountById.get(item.id) || 0) === 0
    })
    if (roots.length === 0) roots = sortedNodes.filter(item => item.structuralDegree > 0)
    roots.sort((a, b) => {
      if (a.index !== b.index) return a.index - b.index
      return b.score - a.score
    })
    const queued = new Set<string>()
    const queue: string[] = []
    for (let i = 0; i < roots.length; i += 1) {
      const id = roots[i]!.id
      if (queued.has(id)) continue
      queued.add(id)
      queue.push(id)
    }
    for (let head = 0; head < queue.length && retainedById.size < structuralReserve; head += 1) {
      const id = queue[head]!
      retainNode(id)
      const children = structuralChildrenById.get(id) || []
      for (let i = 0; i < children.length; i += 1) {
        const childId = children[i]!
        if (queued.has(childId)) continue
        queued.add(childId)
        queue.push(childId)
      }
    }
  }

  for (let i = 0; i < sortedNodes.length && retainedById.size < budget.maxNodes; i += 1) {
    retainNode(sortedNodes[i]!.id)
  }

  const retained = Array.from(retainedById.values()).sort((a, b) => a.index - b.index)

  const retainedNodeIdSet = new Set(retained.map(item => item.id))
  const nodeScoreById = new Map<string, number>()
  for (let i = 0; i < retained.length; i += 1) nodeScoreById.set(retained[i]!.id, retained[i]!.score)

  const scoredEdges: ScoredEdge[] = []
  for (let i = 0; i < edges.length; i += 1) {
    const edge = edges[i]
    const { src, tgt } = readGraphEdgeEndpoints(edge)
    if (!src || !tgt || src === tgt) continue
    if (!retainedNodeIdSet.has(src) || !retainedNodeIdSet.has(tgt)) continue
    const structural = isStructuralGraphEdge(edge)
    scoredEdges.push({
      edge,
      index: i,
      sourceId: src,
      targetId: tgt,
      score: scoreEdge(edge, i, src, tgt, nodeScoreById) + (structural ? 96 : 0),
      structural,
    })
  }

  const incidentCountByNodeId = new Map<string, number>()
  const retainedEdges: ScoredEdge[] = []
  const sortedEdges = scoredEdges.sort((a, b) => {
    const priority = Number(priorityEdges.has(b.edge.id)) - Number(priorityEdges.has(a.edge.id))
    if (priority) return priority
    if (b.score !== a.score) return b.score - a.score
    return a.index - b.index
  })
  for (let i = 0; i < sortedEdges.length; i += 1) {
    if (retainedEdges.length >= budget.maxEdges) break
    const edge = sortedEdges[i]!
    const sourceIncident = incidentCountByNodeId.get(edge.sourceId) || 0
    const targetIncident = incidentCountByNodeId.get(edge.targetId) || 0
    const incidentLimit = edge.structural
      ? Math.max(budget.maxIncidentEdgesPerNode, Math.min(budget.maxEdges, budget.maxNodes))
      : budget.maxIncidentEdgesPerNode
    if (sourceIncident >= incidentLimit || targetIncident >= incidentLimit) continue
    retainedEdges.push(edge)
    incidentCountByNodeId.set(edge.sourceId, sourceIncident + 1)
    incidentCountByNodeId.set(edge.targetId, targetIncident + 1)
  }
  retainedEdges.sort((a, b) => a.index - b.index)

  const nextMetadata: Record<string, JSONValue> = {
    ...(readRecord((topologyGraph as { metadata?: unknown }).metadata) as Record<string, JSONValue>),
    canvasRenderBudgetSurface: args.surface as unknown as JSONValue,
    canvasRenderNodeCount: retained.length as unknown as JSONValue,
    canvasRenderNodeLimit: budget.maxNodes as unknown as JSONValue,
    canvasRenderNodePrunedCount: Math.max(0, nodes.length - retained.length) as unknown as JSONValue,
    canvasRenderEdgeCount: retainedEdges.length as unknown as JSONValue,
    canvasRenderEdgeLimit: budget.maxEdges as unknown as JSONValue,
    canvasRenderEdgePrunedCount: Math.max(0, edges.length - retainedEdges.length) as unknown as JSONValue,
  }

  const budgeted: GraphData = {
    ...topologyGraph,
    nodes: retained.map(item => item.node),
    edges: retainedEdges.map(item => item.edge),
    metadata: nextMetadata,
  }
  return cacheKey ? writeCachedBudgetGraph(graphData, cacheKey, budgeted) : budgeted
}
