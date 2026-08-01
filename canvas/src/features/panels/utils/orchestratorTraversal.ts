import type {
  AgenticGraphRagExamplePath,
  AgenticGraphRagPathValue,
  AgenticGraphRagTraversePath,
  AgenticRagNodeId,
  GraphData,
  GraphNode,
  JSONValue,
} from '@/lib/graph/types'
import { isGraphRagPathValue, toParsedExamplePath, toParsedTraversePath } from '@/lib/graph/graphragTraversal'
import { useGraphStore } from '@/hooks/useGraphStore'
import { getCachedGraphLookup } from '@/lib/graph/lookupCache'
import { buildScopedGraphSemanticKey } from '@/lib/graph/semanticKey'
import { getThreeConfig, getThreeSelectionConfig } from '@/lib/graph/schema'
import { lsInt } from '@/lib/persistence'
import { LS_KEYS, buildNumericTooltip } from '@/lib/config'
import { hashScopedStringArraySignature, hashSignatureParts } from '@/lib/hash/signature'

export type GraphRagTraversalSummary = {
  mode: 'graphRag'
  ownerNodeId: string
  ownerNodeLabel: string
  query: string | null
  example: string | null
  traverseNodeIds: AgenticRagNodeId[]
  multiHop: string[]
  hops: string[]
  edgeIds: string[]
}

export type GenericTraversalSummary = {
  mode: 'generic'
  startNodeId: string
  maxDepth: number
  labelFilter: string
  edgeIds: string[]
}

export type TraversalSummary = GraphRagTraversalSummary | GenericTraversalSummary

type BuildEdgeIdsForPathContext = {
  graphRevision?: number | null
  graphSemanticKey?: string | null
}

type TraversalSummaryMembershipContext = {
  graphRevision?: number | null
  graphSemanticKey?: string | null
}

export type TraversalSummaryMembership = {
  edgeIds: string[]
  edgeIdSet: Set<string>
  edgeStepById: Map<string, number>
  nodeIdSet: Set<string>
}

const TRAVERSAL_SUMMARY_MEMBERSHIP_CACHE_LIMIT = 24
const traversalSummaryMembershipCache = new Map<string, TraversalSummaryMembership | null>()

export const ORCHESTRATOR_TRAVERSAL_DELAY_DEFAULT_MS = 900
export const ORCHESTRATOR_TRAVERSAL_DELAY_MIN_MS = 300
export const ORCHESTRATOR_TRAVERSAL_DELAY_MAX_MS = 2000

export const TRAVERSAL_MAX_DEPTH_DEFAULT = 2
export const TRAVERSAL_MAX_DEPTH_MIN = 1
export const TRAVERSAL_MAX_DEPTH_MAX = 8

export const COLLISION_RADIUS_DEFAULT = 10
export const COLLISION_RADIUS_MIN = 4
export const COLLISION_RADIUS_MAX = 40
export const COLLISION_RADIUS_INTERVAL = 1

export const ORCHESTRATOR_TRAVERSAL_DELAY_TOOLTIP = buildNumericTooltip({
  defaultValue: ORCHESTRATOR_TRAVERSAL_DELAY_DEFAULT_MS,
  min: ORCHESTRATOR_TRAVERSAL_DELAY_MIN_MS,
  max: ORCHESTRATOR_TRAVERSAL_DELAY_MAX_MS,
  interval: 50,
  impact: 'Slower improves readability; faster accelerates inspection.',
})

export function clampTraversalMaxDepth(value: number | string | null | undefined): number {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return TRAVERSAL_MAX_DEPTH_DEFAULT
    const rounded = Math.round(value)
    if (rounded < TRAVERSAL_MAX_DEPTH_MIN) return TRAVERSAL_MAX_DEPTH_MIN
    if (rounded > TRAVERSAL_MAX_DEPTH_MAX) return TRAVERSAL_MAX_DEPTH_MAX
    return rounded
  }
  if (typeof value === 'string') {
    const parsed = Number.parseInt(value || String(TRAVERSAL_MAX_DEPTH_DEFAULT), 10)
    if (!Number.isFinite(parsed)) return TRAVERSAL_MAX_DEPTH_DEFAULT
    if (parsed < TRAVERSAL_MAX_DEPTH_MIN) return TRAVERSAL_MAX_DEPTH_MIN
    if (parsed > TRAVERSAL_MAX_DEPTH_MAX) return TRAVERSAL_MAX_DEPTH_MAX
    return parsed
  }
  return TRAVERSAL_MAX_DEPTH_DEFAULT
}

export function clampCollisionRadius(value: number | string | null | undefined): number {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return COLLISION_RADIUS_DEFAULT
    const clamped = Math.max(COLLISION_RADIUS_MIN, Math.min(COLLISION_RADIUS_MAX, value))
    return Math.floor(clamped)
  }
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value || String(COLLISION_RADIUS_DEFAULT))
    if (!Number.isFinite(parsed)) return COLLISION_RADIUS_DEFAULT
    const clamped = Math.max(COLLISION_RADIUS_MIN, Math.min(COLLISION_RADIUS_MAX, parsed))
    return Math.floor(clamped)
  }
  return COLLISION_RADIUS_DEFAULT
}

let traversalTimeoutId: number | null = null

function normalizeNullableString(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null
  if (value.length === 0) return null
  return value
}

function arraysShallowEqual<T>(a: T[], b: T[]): boolean {
  if (a === b) return true
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false
  }
  return true
}

function readCachedTraversalSummaryMembership(
  cacheKey: string,
): TraversalSummaryMembership | null | undefined {
  if (!cacheKey) return undefined
  const cached = traversalSummaryMembershipCache.get(cacheKey)
  if (cached === undefined) return undefined
  traversalSummaryMembershipCache.delete(cacheKey)
  traversalSummaryMembershipCache.set(cacheKey, cached)
  return cached
}

function writeCachedTraversalSummaryMembership(
  cacheKey: string,
  membership: TraversalSummaryMembership | null,
): TraversalSummaryMembership | null {
  if (!cacheKey) return membership
  traversalSummaryMembershipCache.set(cacheKey, membership)
  if (traversalSummaryMembershipCache.size > TRAVERSAL_SUMMARY_MEMBERSHIP_CACHE_LIMIT) {
    const oldestKey = traversalSummaryMembershipCache.keys().next().value
    if (typeof oldestKey === 'string') traversalSummaryMembershipCache.delete(oldestKey)
  }
  return membership
}

export function findGraphRagOwnerNode(
  graph: GraphData | null,
  selectedNodeId: string | null | undefined,
): GraphNode | null {
  if (!graph || !Array.isArray(graph.nodes)) return null
  const selectedId = selectedNodeId ? String(selectedNodeId) : ''
  const candidates: GraphNode[] = []
  graph.nodes.forEach(node => {
    const props = node.properties ?? {}
    const raw = (props as Record<string, JSONValue>).graphRAGPath as AgenticGraphRagPathValue | undefined
    if (!isGraphRagPathValue(raw)) return
    const traversePath = toParsedTraversePath(raw)
    if (!traversePath || !Array.isArray(traversePath.traverse) || traversePath.traverse.length === 0) return
    candidates.push(node)
  })
  if (candidates.length === 0) return null
  if (selectedId) {
    let best: GraphNode | null = null
    let bestScore = -1
    candidates.forEach(owner => {
      let score = 0
      if (String(owner.id) === selectedId) {
        score += 3
      }
      const props = owner.properties ?? {}
      const raw = (props as Record<string, JSONValue>).graphRAGPath as AgenticGraphRagPathValue | undefined
      if (isGraphRagPathValue(raw)) {
        const traversePath = toParsedTraversePath(raw)
        const traverseIds = Array.isArray(traversePath?.traverse) ? traversePath?.traverse ?? [] : []
        if (traverseIds.length > 0) {
          const index = traverseIds.findIndex(id => String(id) === selectedId)
          if (index >= 0) {
            score += 2
            score += Math.max(0, traverseIds.length - index)
          }
        }
      }
      if (score > bestScore) {
        bestScore = score
        best = owner
      }
    })
    if (best) return best
  }
  return candidates[0]
}

export function buildEdgeIdsForPath(
  graph: GraphData | null,
  pathIds: string[],
  context?: BuildEdgeIdsForPathContext | null,
): string[] {
  if (!graph || !Array.isArray(graph.edges)) return []
  if (!Array.isArray(pathIds) || pathIds.length < 2) return []
  const graphSemanticKey = buildScopedGraphSemanticKey('orchestrator-traversal-path', {
    graphData: graph,
    graphRevision: context?.graphRevision,
    graphSemanticKey: context?.graphSemanticKey,
  })
  const graphLookup = graphSemanticKey
    ? getCachedGraphLookup({
        cacheScope: 'orchestrator-traversal-path',
        graphData: graph,
        graphRevision: context?.graphRevision,
        graphSemanticKey,
      })
    : null
  const ids: string[] = []
  for (let i = 0; i < pathIds.length - 1; i += 1) {
    const a = String(pathIds[i])
    const b = String(pathIds[i + 1])
    const incidentEdges = graphLookup?.incidentEdgesByNodeId.get(a) || graph.edges
    const edge = incidentEdges.find(e => {
      const s = String(e.source)
      const t = String(e.target)
      return (s === a && t === b) || (s === b && t === a)
    })
    if (edge) ids.push(String(edge.id))
  }
  return ids
}

export function readTraversalSummaryMembership(
  graph: GraphData | null,
  summary: TraversalSummary | null,
  context?: TraversalSummaryMembershipContext | null,
): TraversalSummaryMembership | null {
  if (!graph || !Array.isArray(graph.edges)) return null
  if (!summary || !Array.isArray(summary.edgeIds) || summary.edgeIds.length === 0) return null
  const normalizedEdgeIds = Array.from(
    new Set(summary.edgeIds.map(edgeId => String(edgeId || '').trim()).filter(Boolean)),
  )
  if (normalizedEdgeIds.length === 0) return null
  const graphSemanticKey = buildScopedGraphSemanticKey('orchestrator-traversal-membership', {
    graphData: graph,
    graphRevision: context?.graphRevision,
    graphSemanticKey: context?.graphSemanticKey,
  })
  const cacheKey = hashSignatureParts([
    'orchestrator-traversal-membership',
    graphSemanticKey,
    hashScopedStringArraySignature('traversal-edge-ids', normalizedEdgeIds),
  ])
  const cached = readCachedTraversalSummaryMembership(cacheKey)
  if (cached !== undefined) return cached
  const graphLookup = getCachedGraphLookup({
    cacheScope: 'orchestrator-traversal-membership',
    graphData: graph,
    graphRevision: context?.graphRevision,
    graphSemanticKey,
    preferCurrentGraphDataRefs: true,
  })
  const edgeIdSet = new Set<string>(normalizedEdgeIds)
  const edgeStepById = new Map<string, number>()
  const nodeIdSet = new Set<string>()
  normalizedEdgeIds.forEach((edgeId, index) => {
    edgeStepById.set(edgeId, index + 1)
    const edge = graphLookup?.edgeById.get(edgeId)
    if (!edge) return
    nodeIdSet.add(String(edge.source))
    nodeIdSet.add(String(edge.target))
  })
  return writeCachedTraversalSummaryMembership(cacheKey, {
    edgeIds: normalizedEdgeIds,
    edgeIdSet,
    edgeStepById,
    nodeIdSet,
  })
}

export function persistTraversalSummaryToGraph(
  graph: GraphData | null,
  summary: TraversalSummary | null,
): GraphData | null {
  if (!graph || !Array.isArray(graph.nodes)) return graph
  if (!summary || summary.mode !== 'graphRag') return graph
  if (!summary.ownerNodeId) return graph
  const ownerId = summary.ownerNodeId
  let didChange = false
  const nodes = graph.nodes.map(node => {
    if (String(node.id) !== ownerId) return node
    const props = node.properties ?? {}
    const raw = (props as Record<string, JSONValue>).graphRAGPath as
      | AgenticGraphRagPathValue
      | undefined
    if (!isGraphRagPathValue(raw)) return node
    const traversePath = toParsedTraversePath(raw)
    const examplePath = toParsedExamplePath(raw)
    const prevQuery = normalizeNullableString(traversePath?.query)
    const prevExample = normalizeNullableString(examplePath?.example)
    const prevTraverse = Array.isArray(traversePath?.traverse) ? traversePath?.traverse ?? [] : []
    const prevHops = Array.isArray(examplePath?.hops) ? examplePath?.hops ?? [] : []
    const prevMultiHop = Array.isArray(traversePath?.multiHop) ? traversePath?.multiHop ?? [] : []
    const nextQuery = normalizeNullableString(summary.query)
    const nextExample = normalizeNullableString(summary.example)
    const nextTraverse = summary.traverseNodeIds
    const nextHops = summary.hops
    const nextMultiHop = summary.multiHop
    const changed =
      nextQuery !== prevQuery ||
      nextExample !== prevExample ||
      !arraysShallowEqual(nextTraverse, prevTraverse) ||
      !arraysShallowEqual(nextHops, prevHops) ||
      !arraysShallowEqual(nextMultiHop, prevMultiHop)
    if (!changed) return node
    const nextPath: AgenticGraphRagPathValue = {
      ...(raw as AgenticGraphRagTraversePath & AgenticGraphRagExamplePath),
    }
    if (nextQuery !== null) {
      ;(nextPath as AgenticGraphRagTraversePath).query = nextQuery
    } else {
      delete (nextPath as AgenticGraphRagTraversePath).query
    }
    if (nextExample !== null) {
      ;(nextPath as AgenticGraphRagExamplePath).example = nextExample
    } else {
      delete (nextPath as AgenticGraphRagExamplePath).example
    }
    ;(nextPath as AgenticGraphRagTraversePath).traverse = nextTraverse as JSONValue
    ;(nextPath as AgenticGraphRagExamplePath).hops = nextHops
    ;(nextPath as AgenticGraphRagTraversePath).multiHop = nextMultiHop
    const nextProps: Record<string, JSONValue> = {
      ...props,
      graphRAGPath: nextPath as JSONValue,
    }
    didChange = true
    return { ...node, properties: nextProps }
  })
  if (!didChange) return graph
  return { ...graph, nodes }
}

export function buildGraphRagTraversalSummary(
  graph: GraphData | null,
  selectedNodeId: string | null,
): GraphRagTraversalSummary | null {
  if (!graph || !Array.isArray(graph.nodes) || !Array.isArray(graph.edges)) return null
  const owner = findGraphRagOwnerNode(graph, selectedNodeId)
  if (!owner) return null
  const props = owner.properties ?? {}
  const raw = (props as Record<string, JSONValue>).graphRAGPath as
    | AgenticGraphRagPathValue
    | undefined
  if (!isGraphRagPathValue(raw)) return null
  const traversePath = toParsedTraversePath(raw)
  const examplePath = toParsedExamplePath(raw)
  const query = traversePath && typeof traversePath.query === 'string' ? traversePath.query : null
  const example = examplePath && typeof examplePath.example === 'string' ? examplePath.example : null
  const traverseNodeIds = Array.isArray(traversePath?.traverse) ? traversePath?.traverse ?? [] : []
  const multiHop = Array.isArray(traversePath?.multiHop) ? traversePath?.multiHop ?? [] : []
  const hops = Array.isArray(examplePath?.hops) ? examplePath?.hops ?? [] : []
  const pathIds = [owner.id, ...traverseNodeIds].map(id => String(id))
  const edgeIds = buildEdgeIdsForPath(graph, pathIds)
  if (!edgeIds.length) return null
  return {
    mode: 'graphRag',
    ownerNodeId: String(owner.id),
    ownerNodeLabel:
      typeof owner.label === 'string' && owner.label.length > 0 ? owner.label : String(owner.id),
    query,
    example,
    traverseNodeIds,
    multiHop,
    hops,
    edgeIds,
  }
}

export function runEdgeTraversalSequenceGlobal(edgeIds: string[], startNodeId?: string | null): void {
  if (!Array.isArray(edgeIds) || edgeIds.length === 0) return
  const state = useGraphStore.getState()
  state.setAiKgTraversalRan(true)
  if (traversalTimeoutId != null) {
    try {
      if (typeof window !== 'undefined') {
        window.clearTimeout(traversalTimeoutId)
      }
    } catch {
      void 0
    }
    traversalTimeoutId = null
  }
  state.setSelectionSource('toolbar')
  const graph = state.graphData as GraphData | null
  const labels = new Set<string>()
  const edgeTargetById: Record<string, string> = {}
  if (graph && Array.isArray(graph.edges)) {
    const idSet = new Set(edgeIds.map(id => String(id)))
    for (const edge of graph.edges) {
      if (!edge || edge.id == null) continue
      const id = String(edge.id)
      if (!idSet.has(id)) continue
      if (typeof edge.label === 'string' && edge.label.length > 0) {
        labels.add(edge.label)
      }
      const target = edge.target
      if (target != null) {
        edgeTargetById[id] = String(target)
      }
    }
  }
  const schema = state.schema
  const schemaThree = getThreeConfig(schema)
  const prevEdgeOpacityByLabel = (schemaThree.edgeOpacityByLabel || {}) as Record<string, number>
  const nextEdgeOpacityByLabel: Record<string, number> = {
    ...prevEdgeOpacityByLabel,
  }
  labels.forEach(label => {
    const prev =
      typeof prevEdgeOpacityByLabel[label] === 'number'
        ? prevEdgeOpacityByLabel[label]
        : schemaThree.linkOpacity ?? 0.6
    const next = Math.max(prev, 0.9)
    nextEdgeOpacityByLabel[label] = Math.min(1, next)
  })
  const baseSelection = getThreeSelectionConfig(schema)
  const rawSelection = (schemaThree.selection || {}) as {
    selectedNodeGlowIntensity?: number
    dimmedNodeOpacity?: number
    dimmedEdgeOpacity?: number
    selectedEdgeWidth?: number
    selectedEdgeColor?: string
  }
  const prevSelection = {
    selectedNodeGlowIntensity: rawSelection.selectedNodeGlowIntensity,
    dimmedNodeOpacity: rawSelection.dimmedNodeOpacity,
    dimmedEdgeOpacity: rawSelection.dimmedEdgeOpacity,
    selectedEdgeWidth: rawSelection.selectedEdgeWidth,
    selectedEdgeColor: rawSelection.selectedEdgeColor,
  }
  const boostedSelection = {
    selectedNodeGlowIntensity: Math.min(5, baseSelection.selectedNodeGlowIntensity * 1.35),
    dimmedNodeOpacity: Math.max(0, Math.min(1, baseSelection.dimmedNodeOpacity * 0.7)),
    dimmedEdgeOpacity: Math.max(0, Math.min(1, baseSelection.dimmedEdgeOpacity * 0.7)),
    selectedEdgeWidth: rawSelection.selectedEdgeWidth,
    selectedEdgeColor: rawSelection.selectedEdgeColor,
  }
  state.setThreeConfig({
    edgeOpacityByLabel: nextEdgeOpacityByLabel,
    selection: boostedSelection,
  })
  state.selectNode(null)
  state.selectEdge(null)
  const stepMs = (() => {
    try {
      return lsInt(LS_KEYS.orchestratorTraversalDelayMs, ORCHESTRATOR_TRAVERSAL_DELAY_DEFAULT_MS)
    } catch {
      return ORCHESTRATOR_TRAVERSAL_DELAY_DEFAULT_MS
    }
  })()
  const initialDelayMs = Math.min(stepMs, 250)
  const playStep = (index: number) => {
    if (index >= edgeIds.length) {
      if (typeof window !== 'undefined') {
        traversalTimeoutId = window.setTimeout(() => {
          state.selectEdge(null)
          state.setThreeConfig({
            edgeOpacityByLabel: prevEdgeOpacityByLabel,
            selection: prevSelection,
          })
          traversalTimeoutId = null
        }, stepMs)
      }
      return
    }
    const id = edgeIds[index]
    const targetId = edgeTargetById[String(id)]
    if (typeof targetId === 'string' && targetId.length > 0) {
      state.selectNode(targetId)
    }
    state.selectEdge(id)
    if (typeof window !== 'undefined') {
      traversalTimeoutId = window.setTimeout(() => {
        playStep(index + 1)
      }, stepMs)
    }
  }
  if (startNodeId && String(startNodeId).trim().length > 0) {
    state.selectNode(String(startNodeId))
    if (typeof window !== 'undefined') {
      traversalTimeoutId = window.setTimeout(() => {
        playStep(0)
      }, initialDelayMs)
    }
  } else {
    playStep(0)
  }
}
