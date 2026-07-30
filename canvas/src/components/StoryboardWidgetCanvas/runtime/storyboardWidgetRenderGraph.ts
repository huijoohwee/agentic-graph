import { canonicalNodeIdSetHas, getCanonicalNodeLookupValue, splitComposedNodeId } from '@/lib/graph/canonicalNodeIds'
import { buildOverlayTopologyLayoutSignature } from '@/lib/storyboardWidget/overlayTopologyLayoutSignature'
import { FLOW_HANDLE_DEFAULT_EDGE_ID } from '@/components/FlowCanvas/handles'
import { pickDefaultFlowPortKey, readFlowEdgePortKey } from '@/lib/graph/flowPorts'
import { buildFlowWidgetEligibleNodeIdSet } from '@/lib/graph/flowWidgetEligibility'
import { readGraphEdgeEndpoints } from '@/lib/graph/edgeEndpoints'
import { getCachedGraphLookup } from '@/lib/graph/lookupCache'
import { buildScopedGraphSemanticKey } from '@/lib/graph/semanticKey'
import { hashRecordSignature32, hashScopedStringArraySignature, hashSignatureParts } from '@/lib/hash/signature'
import type { GraphData, GraphEdge, GraphNode } from '@/lib/graph/types'
import { deriveSceneDisplayGraph } from '@/lib/scene/sceneDerivation'
import { resolveDefaultFlowWidgetPinnedInCanvas } from '@/components/StoryboardWidgetCanvas/storyboardWidgetCanvasShared'
import { deriveFrontmatterFlowOverlayNodeIds } from '@/lib/storyboardWidget/frontmatterOverlayNodeIds'
import {
  readWorkflowMaterializationParentNodeId,
  readWorkflowMaterializationProjectionSourceNodeId,
} from '@/lib/storyboardWidget/runMaterializationProjection'
import { buildFlowRunAllNodeSequence, type FlowRunAllPhaseId } from '@/lib/storyboardWidget/runAllSequenceSsot'
import { unwrapGraphCellValue } from '@/lib/graph/nodeProperties'
import { buildFrontmatterOverlayNodeLookup, resolveFrontmatterOverlayEdgeCurveOptions } from '@/lib/storyboardWidget/frontmatterCollectiveLayout'
import { isFrontmatterFlowGraph } from '@/lib/graph/frontmatterMode'
import {
  readCachedStoryboardWidgetOverlayEdgeGraph,
  readCachedStoryboardWidgetRenderGraph,
  readCachedStoryboardWidgetPlacementContext,
  readCachedStoryboardWidgetWorkflowNodeResolutionContext,
  readCachedStoryboardWidgetWorkflowRunPlan,
  writeCachedStoryboardWidgetOverlayEdgeGraph,
  writeCachedStoryboardWidgetRenderGraph,
  writeCachedStoryboardWidgetPlacementContext,
  writeCachedStoryboardWidgetWorkflowNodeResolutionContext,
  writeCachedStoryboardWidgetWorkflowRunPlan,
} from '@/components/StoryboardWidgetCanvas/runtime/storyboardWidgetRenderGraphCaches'

export type StoryboardWidgetRenderGraphLookup = {
  graph: GraphData | null
  revision: number
  graphSemanticKey: string
  nodes: GraphNode[]
  edges: GraphEdge[]
  nodeById: ReadonlyMap<string, GraphNode>
  incidentEdgesByNodeId: ReadonlyMap<string, GraphEdge[]> | null
  eligibleNodeIds: ReadonlySet<string>
  graphMetaKind: string | null
  nodeIdsByInnerId: ReadonlyMap<string, string[]>
}

export type StoryboardWidgetOverlayEdgeGraphLookup = {
  graphSemanticKey: string
  graphMetaKind: string | null
  nodes: Array<{ id: unknown; metadata?: unknown; type?: unknown; properties?: unknown }>
  nodeIds: Set<string>
  defaultPortKeyByNodeId: Map<string, { in: string; out: string }>
  edgeCurveById: Map<string, { bend: number; orbitShift: number; orbital: boolean; phase: -1 | 1 } | null>
  rawEdgeById: Map<string, GraphEdge>
  edges: Array<{
    id: string
    source: string
    target: string
    sourcePortKey: string
    targetPortKey: string
    edgeType: string
  }>
}

export type StoryboardWidgetPlacementContext = {
  canvas2dRenderer?: string
  graphSemanticKey: string
  graphMetaKind: string | null
  isFrontmatterFlow: boolean
  defaultPinnedInCanvas: boolean
  frontmatterOverlayNodeIds: string[]
  effectiveOpenWidgetNodeIds: string[]
}

export type StoryboardWidgetWorkflowRunPlan = {
  graphSemanticKey: string
  eligibleNodeIds: ReadonlySet<string>
  orderedNodeIds: string[]
  phaseCounts: Record<FlowRunAllPhaseId, number>
}

export type StoryboardWidgetWorkflowNodeResolutionContext = {
  graphSemanticKey: string
  draftGraph: GraphData | null
  renderGraph: GraphData | null
  baseGraph: GraphData | null
  storeGraph: GraphData | null
  draftNodes: GraphNode[]
  renderNodes: GraphNode[]
  baseNodes: GraphNode[]
  storeNodes: GraphNode[]
  draftNodeById: ReadonlyMap<string, GraphNode>
  renderNodeById: ReadonlyMap<string, GraphNode>
  baseNodeById: ReadonlyMap<string, GraphNode>
  storeNodeById: ReadonlyMap<string, GraphNode>
}

export type StoryboardWidgetWorkflowResolvedRunTarget = {
  graphForRun: GraphData
  node: GraphNode
  resolvedNodeId: string
  writableNodeId: string
}

export function readCanonicalStoryboardWidgetOverlayIdentity(rawId: unknown): string {
  const id = String(unwrapGraphCellValue(rawId) ?? '').trim()
  if (!id) return ''
  return splitComposedNodeId(id).inner || id
}

function normalizeFrontmatterOverlayNodeIds(rawIds: ReadonlyArray<string>): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (let i = 0; i < rawIds.length; i += 1) {
    const id = String(rawIds[i] || '').trim()
    if (!id || seen.has(id)) continue
    seen.add(id)
    out.push(id)
  }
  return out
}

function readPropString(props: unknown, key: string): string {
  if (!props || typeof props !== 'object' || Array.isArray(props)) return ''
  const raw = (props as Record<string, unknown>)[key]
  return typeof raw === 'string' ? raw.trim() : ''
}

function readStoryboardWidgetGraphMetaKind(graph: GraphData | null | undefined): string | null {
  if (isFrontmatterFlowGraph(graph)) return 'frontmatter-flow'
  const kind = String(((graph?.metadata || {}) as Record<string, unknown>).kind || '').trim()
  return kind || null
}

function buildOverlayNodeHandleSignature(
  nodes: ReadonlyArray<{ id?: unknown; metadata?: unknown; type?: unknown; properties?: unknown }>,
): string {
  if (!Array.isArray(nodes) || nodes.length === 0) return ''
  const parts = nodes
    .map(node => {
      const id = readCanonicalStoryboardWidgetOverlayIdentity(node?.id)
      if (!id) return ''
      return [
        id,
        String(node?.type || '').trim(),
        hashRecordSignature32(node?.metadata || {}, { maxEntries: 24, maxDepth: 3 }),
        hashRecordSignature32(node?.properties || {}, { maxEntries: 24, maxDepth: 3 }),
      ].join(':')
    })
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b))
  return hashSignatureParts(['overlay-node-handle-signature', ...parts])
}

export function getCachedStoryboardWidgetRenderGraph(args: {
  scope: string
  graphData: GraphData | null
  graphRevision: number
  preferCurrentGraphDataRefs?: boolean
}): StoryboardWidgetRenderGraphLookup | null {
  const scope = String(args.scope || '').trim()
  if (!scope) return null
  const graph = args.graphData
  const graphRevision = Number.isFinite(args.graphRevision) ? Math.max(0, Math.floor(args.graphRevision)) : 0
  const graphSemanticKey = buildScopedGraphSemanticKey(scope, {
    graphData: graph,
    graphRevision,
  })
  const baseLookup = getCachedGraphLookup({
    cacheScope: scope,
    graphData: graph,
    graphRevision,
    graphSemanticKey,
    preferCurrentGraphDataRefs: args.preferCurrentGraphDataRefs,
  })
  if (!baseLookup) return null

  const cacheKey = hashSignatureParts([
    'storyboard-widget-render-graph',
    baseLookup.cacheKey,
  ])
  const cached = readCachedStoryboardWidgetRenderGraph(cacheKey)
  if (
    cached
    && cached.nodes === baseLookup.nodes
    && cached.edges === baseLookup.edges
    && cached.nodeById === baseLookup.nodeById
    && cached.incidentEdgesByNodeId === baseLookup.incidentEdgesByNodeId
  ) {
    cached.graph = graph
    cached.revision = graphRevision
    return cached
  }

  const nodes = baseLookup.nodes
  const nodeIdsByInnerId = new Map<string, string[]>()
  for (let i = 0; i < nodes.length; i += 1) {
    const node = nodes[i]
    const id = String(node?.id || '').trim()
    if (!id) continue
    const innerId = splitComposedNodeId(id).inner
    if (!innerId) continue
    const existing = nodeIdsByInnerId.get(innerId)
    if (existing) existing.push(id)
    else nodeIdsByInnerId.set(innerId, [id])
  }

  return writeCachedStoryboardWidgetRenderGraph(cacheKey, {
    graph,
    revision: graphRevision,
    graphSemanticKey,
    nodes,
    edges: baseLookup.edges,
    nodeById: baseLookup.nodeById,
    incidentEdgesByNodeId: baseLookup.incidentEdgesByNodeId,
    eligibleNodeIds: buildFlowWidgetEligibleNodeIdSet(nodes),
    graphMetaKind: readStoryboardWidgetGraphMetaKind(graph),
    nodeIdsByInnerId,
  })
}

export function getCachedStoryboardWidgetOverlayEdgeGraph(args: {
  graphData: GraphData | null
  graphRevision: number
  overlayNodeIds: ReadonlyArray<string>
  preferCurrentGraphDataRefs?: boolean
}): StoryboardWidgetOverlayEdgeGraphLookup | null {
  const graph = args.graphData
  const graphMetaKind = readStoryboardWidgetGraphMetaKind(graph)
  const overlayEdgeGraphData = graphMetaKind === 'frontmatter-flow'
    ? (deriveSceneDisplayGraph({ graphData: graph })?.displayGraphData || graph)
    : graph
  const graphRevision = Number.isFinite(args.graphRevision) ? Math.max(0, Math.floor(args.graphRevision)) : 0
  const baseGraph = getCachedStoryboardWidgetRenderGraph({
    scope: 'storyboard-widget-overlay-edges-base-graph',
    graphData: overlayEdgeGraphData,
    graphRevision,
    preferCurrentGraphDataRefs: args.preferCurrentGraphDataRefs,
  })
  if (!baseGraph) return null

  const overlayNodeIds = Array.from(new Set((args.overlayNodeIds || []).map(id => String(id || '').trim()).filter(Boolean)))
    .sort((a, b) => a.localeCompare(b))
  const overlayNodeIdsKey = hashScopedStringArraySignature('overlay-node-ids', overlayNodeIds, {
    unique: true,
    sort: true,
  })
  const nodeHandleSemanticKey = buildOverlayNodeHandleSignature(baseGraph.nodes)
  const graphSemanticKey = hashSignatureParts([
    'overlay-graph-semantic',
    graphRevision > 0 ? `rev:${graphRevision}` : '',
    buildOverlayTopologyLayoutSignature(overlayEdgeGraphData),
    nodeHandleSemanticKey,
  ])
  const cacheKey = hashSignatureParts([
    'overlay-graph-lookup',
    graphSemanticKey,
    overlayNodeIdsKey,
  ])
  const cached = readCachedStoryboardWidgetOverlayEdgeGraph(cacheKey)
  if (cached) return cached

  const overlayNodeIdSet = new Set<string>(overlayNodeIds)
  const nodes: Array<{ id: unknown; metadata?: unknown; type?: unknown; properties?: unknown }> = []
  const nodeIds = new Set<string>()
  for (let i = 0; i < baseGraph.nodes.length; i += 1) {
    const node = baseGraph.nodes[i]
    const id = readCanonicalStoryboardWidgetOverlayIdentity(node?.id)
    if (!id || !canonicalNodeIdSetHas(overlayNodeIdSet, node?.id)) continue
    nodeIds.add(id)
    nodes.push({ id, metadata: node?.metadata, type: node?.type, properties: node?.properties })
  }

  const defaultPortKeyByNodeId = new Map<string, { in: string; out: string }>()
  for (let i = 0; i < nodes.length; i += 1) {
    const node = nodes[i]
    const id = String(node?.id || '').trim()
    if (!id) continue
    const outPortKey = pickDefaultFlowPortKey({ properties: node?.properties as never }, 'out') || FLOW_HANDLE_DEFAULT_EDGE_ID
    const inPortKey = pickDefaultFlowPortKey({ properties: node?.properties as never }, 'in') || FLOW_HANDLE_DEFAULT_EDGE_ID
    defaultPortKeyByNodeId.set(id, { out: outPortKey, in: inPortKey })
  }
  const overlayNodeById = buildFrontmatterOverlayNodeLookup(nodes)

  const rawEdgeById = new Map<string, GraphEdge>()
  const edgeCurveById = new Map<string, { bend: number; orbitShift: number; orbital: boolean; phase: -1 | 1 } | null>()
  const edges: Array<{
    id: string
    source: string
    target: string
    sourcePortKey: string
    targetPortKey: string
    edgeType: string
  }> = []
  for (let i = 0; i < baseGraph.edges.length; i += 1) {
    const edge = baseGraph.edges[i]
    const id = String(edge?.id || '').trim()
    const { src: sourceRaw, tgt: targetRaw } = readGraphEdgeEndpoints(edge)
    const source = readCanonicalStoryboardWidgetOverlayIdentity(sourceRaw)
    const target = readCanonicalStoryboardWidgetOverlayIdentity(targetRaw)
    if (!id || !source || !target) continue
    if (!canonicalNodeIdSetHas(overlayNodeIdSet, sourceRaw) || !canonicalNodeIdSetHas(overlayNodeIdSet, targetRaw)) continue
    const targetNode = overlayNodeById.get(target) || null
    const projectionSourceRaw =
      readWorkflowMaterializationProjectionSourceNodeId(edge?.properties)
      || readWorkflowMaterializationParentNodeId(targetNode as Pick<GraphNode, 'properties'> | null)
    const presentationSource = projectionSourceRaw
      && canonicalNodeIdSetHas(overlayNodeIdSet, projectionSourceRaw)
      ? readCanonicalStoryboardWidgetOverlayIdentity(projectionSourceRaw)
      : source
    const props = edge?.properties
    const edgeWithProps = { properties: props as GraphEdge['properties'] } as Pick<GraphEdge, 'properties'>
    const sourcePortKey = (
      presentationSource === source
        ? readFlowEdgePortKey(edgeWithProps, 'source')
        : ''
    ) || defaultPortKeyByNodeId.get(presentationSource)?.out
      || FLOW_HANDLE_DEFAULT_EDGE_ID
    const targetPortKey =
      readFlowEdgePortKey(edgeWithProps, 'target')
      || defaultPortKeyByNodeId.get(target)?.in
      || FLOW_HANDLE_DEFAULT_EDGE_ID
    rawEdgeById.set(id, edge)
    const semanticEdgeCurve = resolveFrontmatterOverlayEdgeCurveOptions({
      graphMetaKind: baseGraph.graphMetaKind, edge, sourceNode: overlayNodeById.get(presentationSource) || null, targetNode, sourceId: presentationSource, targetId: target,
    })
    edgeCurveById.set(id, semanticEdgeCurve)
    edges.push({
      id,
      source: presentationSource,
      target,
      sourcePortKey,
      targetPortKey,
      edgeType: String(edge?.type || '').trim() || readPropString(props, 'flow:socketType'),
    })
  }
  return writeCachedStoryboardWidgetOverlayEdgeGraph(cacheKey, {
    graphSemanticKey,
    graphMetaKind: baseGraph.graphMetaKind,
    nodes,
    nodeIds,
    defaultPortKeyByNodeId,
    edgeCurveById,
    rawEdgeById,
    edges,
  })
}

export function getCachedStoryboardWidgetPlacementContext(args: {
  graphData: GraphData | null
  graphRevision: number
  openWidgetNodeIds?: ReadonlyArray<string>
  preferCurrentGraphDataRefs?: boolean
}): StoryboardWidgetPlacementContext | null {
  const baseGraph = getCachedStoryboardWidgetRenderGraph({
    scope: 'storyboard-widget-widget-placement-base-graph',
    graphData: args.graphData,
    graphRevision: args.graphRevision,
    preferCurrentGraphDataRefs: args.preferCurrentGraphDataRefs,
  })
  if (!baseGraph) return null

  const openWidgetNodeIds = Array.from(
    new Set((args.openWidgetNodeIds || []).map(id => String(id || '').trim()).filter(Boolean)),
  ).sort((a, b) => a.localeCompare(b))
  const openWidgetNodeIdsKey = hashScopedStringArraySignature('storyboard-widget-open-widget-node-ids', openWidgetNodeIds, {
    unique: true,
    sort: true,
  })
  const cacheKey = hashSignatureParts([
    'storyboard-widget-widget-placement-context',
    baseGraph.graphSemanticKey,
    openWidgetNodeIdsKey,
  ])
  const cached = readCachedStoryboardWidgetPlacementContext(cacheKey)
  if (cached) return cached

  const graphMetaKind = baseGraph.graphMetaKind
  const isFrontmatterFlow = graphMetaKind === 'frontmatter-flow'
  const defaultPinnedInCanvas = resolveDefaultFlowWidgetPinnedInCanvas({ graphMetaKind })
  const frontmatterOverlayNodeIds = isFrontmatterFlow
    ? normalizeFrontmatterOverlayNodeIds(deriveFrontmatterFlowOverlayNodeIds(baseGraph.graph))
    : []
  const effectiveOpenWidgetNodeIds = isFrontmatterFlow
    ? frontmatterOverlayNodeIds
    : openWidgetNodeIds

  return writeCachedStoryboardWidgetPlacementContext(cacheKey, {
    graphSemanticKey: baseGraph.graphSemanticKey,
    graphMetaKind,
    isFrontmatterFlow,
    defaultPinnedInCanvas,
    frontmatterOverlayNodeIds,
    effectiveOpenWidgetNodeIds,
  })
}

export function getCachedStoryboardWidgetWorkflowRunPlan(args: {
  graphData: GraphData | null
  graphRevision: number
  preferCurrentGraphDataRefs?: boolean
}): StoryboardWidgetWorkflowRunPlan | null {
  const baseGraph = getCachedStoryboardWidgetRenderGraph({
    scope: 'storyboard-widget-workflow-actions-draft-graph',
    graphData: args.graphData,
    graphRevision: args.graphRevision,
    preferCurrentGraphDataRefs: args.preferCurrentGraphDataRefs,
  })
  if (!baseGraph || !baseGraph.graph) return null

  const cacheKey = hashSignatureParts([
    'storyboard-widget-workflow-run-plan',
    baseGraph.graphSemanticKey,
  ])
  const cached = readCachedStoryboardWidgetWorkflowRunPlan(cacheKey)
  if (cached) return cached

  const eligibleNodeIds = baseGraph.eligibleNodeIds
  const ordered = buildFlowRunAllNodeSequence({
    graphData: baseGraph.graph,
    eligibleNodeIds,
  })
  return writeCachedStoryboardWidgetWorkflowRunPlan(cacheKey, {
    graphSemanticKey: baseGraph.graphSemanticKey,
    eligibleNodeIds,
    orderedNodeIds: ordered.orderedNodeIds,
    phaseCounts: ordered.phaseCounts,
  })
}

export function getCachedStoryboardWidgetWorkflowNodeResolutionContext(args: {
  draftGraph: GraphData | null
  draftGraphRevision: number
  renderGraph: GraphData | null
  renderGraphRevision: number
  baseGraph: GraphData | null
  baseGraphRevision: number
  storeGraph: GraphData | null
  storeGraphRevision: number
  preferCurrentGraphDataRefs?: boolean
}): StoryboardWidgetWorkflowNodeResolutionContext {
  const draftLookup = getCachedStoryboardWidgetRenderGraph({
    scope: 'storyboard-widget-workflow-node-resolution-draft-graph',
    graphData: args.draftGraph,
    graphRevision: args.draftGraphRevision,
    preferCurrentGraphDataRefs: args.preferCurrentGraphDataRefs,
  })
  const renderLookup = getCachedStoryboardWidgetRenderGraph({
    scope: 'storyboard-widget-workflow-node-resolution-render-graph',
    graphData: args.renderGraph,
    graphRevision: args.renderGraphRevision,
    preferCurrentGraphDataRefs: args.preferCurrentGraphDataRefs,
  })
  const baseLookup = getCachedStoryboardWidgetRenderGraph({
    scope: 'storyboard-widget-workflow-node-resolution-base-graph',
    graphData: args.baseGraph,
    graphRevision: args.baseGraphRevision,
    preferCurrentGraphDataRefs: args.preferCurrentGraphDataRefs,
  })
  const storeLookup = getCachedStoryboardWidgetRenderGraph({
    scope: 'storyboard-widget-workflow-node-resolution-store-graph',
    graphData: args.storeGraph,
    graphRevision: args.storeGraphRevision,
    preferCurrentGraphDataRefs: args.preferCurrentGraphDataRefs,
  })
  const cacheKey = hashSignatureParts([
    'storyboard-widget-workflow-node-resolution-context',
    draftLookup?.graphSemanticKey || '',
    String(draftLookup?.revision ?? args.draftGraphRevision ?? ''),
    renderLookup?.graphSemanticKey || '',
    String(renderLookup?.revision ?? args.renderGraphRevision ?? ''),
    baseLookup?.graphSemanticKey || '',
    String(baseLookup?.revision ?? args.baseGraphRevision ?? ''),
    storeLookup?.graphSemanticKey || '',
    String(storeLookup?.revision ?? args.storeGraphRevision ?? ''),
  ])
  const cached = readCachedStoryboardWidgetWorkflowNodeResolutionContext(cacheKey)
  if (cached) return cached
  return writeCachedStoryboardWidgetWorkflowNodeResolutionContext(cacheKey, {
    graphSemanticKey: cacheKey,
    draftGraph: draftLookup?.graph || args.draftGraph || null,
    renderGraph: renderLookup?.graph || args.renderGraph || null,
    baseGraph: baseLookup?.graph || args.baseGraph || null,
    storeGraph: storeLookup?.graph || args.storeGraph || null,
    draftNodes: draftLookup?.nodes || [],
    renderNodes: renderLookup?.nodes || [],
    baseNodes: baseLookup?.nodes || [],
    storeNodes: storeLookup?.nodes || [],
    draftNodeById: draftLookup?.nodeById || new Map<string, GraphNode>(),
    renderNodeById: renderLookup?.nodeById || new Map<string, GraphNode>(),
    baseNodeById: baseLookup?.nodeById || new Map<string, GraphNode>(),
    storeNodeById: storeLookup?.nodeById || new Map<string, GraphNode>(),
  })
}

export function resolveStoryboardWidgetWorkflowWritableNodeId(args: {
  context: StoryboardWidgetWorkflowNodeResolutionContext
  requestedNodeId: string
  resolvedNodeId: string
}): string {
  const requested = splitComposedNodeId(args.requestedNodeId)
  const resolved = splitComposedNodeId(args.resolvedNodeId)
  const exactRequested = requested.full ? args.context.draftNodeById.get(requested.full) || null : null
  if (exactRequested) return readCanonicalStoryboardWidgetOverlayIdentity(exactRequested.id)
  const exactResolved = resolved.full ? args.context.draftNodeById.get(resolved.full) || null : null
  if (exactResolved) return readCanonicalStoryboardWidgetOverlayIdentity(exactResolved.id)
  const targetInners = new Set([requested.inner, resolved.inner].filter(Boolean))
  if (targetInners.size === 0) return String(args.resolvedNodeId || '').trim()
  const innerMatches = args.context.draftNodes.filter(node => targetInners.has(splitComposedNodeId(node?.id).inner))
  if (innerMatches.length === 1) return readCanonicalStoryboardWidgetOverlayIdentity(innerMatches[0]?.id)
  return String(args.resolvedNodeId || '').trim()
}

export function resolveStoryboardWidgetWorkflowRunTarget(args: {
  context: StoryboardWidgetWorkflowNodeResolutionContext
  requestedNodeId: string
}): StoryboardWidgetWorkflowResolvedRunTarget | null {
  const requestedNodeId = String(args.requestedNodeId || '').trim()
  if (!requestedNodeId) return null
  const draftNode = getCanonicalNodeLookupValue(args.context.draftNodeById, requestedNodeId)
  const renderNode = getCanonicalNodeLookupValue(args.context.renderNodeById, requestedNodeId)
  const baseNode = getCanonicalNodeLookupValue(args.context.baseNodeById, requestedNodeId)
  const resolved =
    (args.context.draftGraph && draftNode
      ? { graph: args.context.draftGraph, node: draftNode }
      : null)
    || (args.context.renderGraph && renderNode
      ? { graph: args.context.renderGraph, node: renderNode }
      : null)
    || (args.context.baseGraph && baseNode
      ? { graph: args.context.baseGraph, node: baseNode }
      : null)
  if (!resolved) return null
  const resolvedNodeId = readCanonicalStoryboardWidgetOverlayIdentity(resolved.node.id) || requestedNodeId
  const writableNodeId = resolveStoryboardWidgetWorkflowWritableNodeId({
    context: args.context,
    requestedNodeId,
    resolvedNodeId,
  }) || resolvedNodeId
  return {
    graphForRun: resolved.graph,
    node: resolved.node,
    resolvedNodeId,
    writableNodeId,
  }
}

export function resolveStoryboardWidgetWorkflowNodeByIdAcrossGraphs(args: {
  context: StoryboardWidgetWorkflowNodeResolutionContext
  candidateNodeId: string
  graphForRun: GraphData | null
}): GraphNode | null {
  const candidateNodeId = String(args.candidateNodeId || '').trim()
  if (!candidateNodeId) return null
  const draftHit = args.context.draftNodeById.get(candidateNodeId) || null
  if (draftHit) return draftHit
  const renderHit = args.context.renderNodeById.get(candidateNodeId) || null
  if (renderHit) return renderHit
  const storeHit = args.context.storeNodeById.get(candidateNodeId) || null
  if (storeHit) return storeHit
  if (args.graphForRun && args.graphForRun === args.context.baseGraph) {
    const baseHit = args.context.baseNodeById.get(candidateNodeId) || null
    if (baseHit) return baseHit
  }
  const nodeLists = [
    args.context.draftNodes,
    args.context.renderNodes,
    ...(args.graphForRun && args.graphForRun === args.context.baseGraph ? [args.context.baseNodes] : []),
    args.context.storeNodes,
  ]
  for (let listIndex = 0; listIndex < nodeLists.length; listIndex += 1) {
    const nodes = nodeLists[listIndex]!
    for (let nodeIndex = 0; nodeIndex < nodes.length; nodeIndex += 1) {
      const id = String(unwrapGraphCellValue(nodes[nodeIndex]?.id) || '').trim()
      if (id === candidateNodeId) return nodes[nodeIndex]!
    }
  }
  return null
}

export function listStoryboardWidgetWorkflowNodesAcrossGraphs(args: {
  context: StoryboardWidgetWorkflowNodeResolutionContext
  graphForRun: GraphData | null
}): GraphNode[] {
  const out: GraphNode[] = []
  for (let i = 0; i < args.context.draftNodes.length; i += 1) out.push(args.context.draftNodes[i]!)
  for (let i = 0; i < args.context.renderNodes.length; i += 1) out.push(args.context.renderNodes[i]!)
  if (args.graphForRun && args.graphForRun === args.context.baseGraph) {
    for (let i = 0; i < args.context.baseNodes.length; i += 1) out.push(args.context.baseNodes[i]!)
  }
  for (let i = 0; i < args.context.storeNodes.length; i += 1) out.push(args.context.storeNodes[i]!)
  return out
}
