import { normalizeOverlaySurfaceCacheKey, readStableFrontmatterOverlaySurfaceCache, writeStableFrontmatterOverlaySurfaceCache, clearStableFrontmatterOverlaySurfaceCache } from './stableOverlaySurfaceCache'
import React from 'react'
import { deriveOpenWidgetOverlayNodeIds, deriveSelectedOverlayEditorNodeIdForDerivation, isCanonicalFrontmatterBuiltInWidgetNode, resolveDefaultFlowWidgetPinnedInCanvas } from '@/components/StoryboardWidgetCanvas/storyboardWidgetCanvasShared'
import { useGraphStore } from '@/hooks/useGraphStore'
import { useMarkdownExplorerStore } from '@/features/markdown-explorer/store'
import { deriveSceneDisplayGraph } from '@/lib/scene/sceneDerivation'
import { readGraphDataRevision } from '@/lib/graph/documentMetadata'
import type { GraphData, GraphEdge, GraphNode } from '@/lib/graph/types'
import { computeFlowConnectedValuesBySchemaPath, type FlowConnectedValuesBySchemaPath } from '@/lib/storyboardWidget/flowDataflow'
import type { WidgetRegistryEntry } from '@/features/storyboard-widget-manager/widgetRegistryTypes'
import { isWorkspaceEditorOverlayOpen, isWorkspaceGraphMutationBlocked } from '@/features/workspace-table/workspaceTableSsot'
import { shouldDeferComposedGraphRender } from '@/features/source-files/composedApplyGuards'
import {
  buildComposedSourceFileSelectionKey,
  resolvePreferredEnabledComposedSourceFile,
} from '@/features/source-files/composedSourceSelection'
import {
  hashScopedStringArraySignature,
  hashSignatureParts,
  normalizeStringArrayForSignature,
} from '@/lib/hash/signature'
import { buildScopedGraphSemanticKey } from '@/lib/graph/semanticKey'
import { isFrontmatterFlowGraph } from '@/lib/graph/frontmatterMode'
import { seedMissingFlowWidgetPinnedByIds } from '@/lib/storyboardWidget/flowWidgetPinnedState'
import { resolveScopedFlowWidgetNodeMap } from '@/lib/storyboardWidget/widgetStateScope'
import { buildGraphDocumentMetaKey } from '@/lib/graph/graphMetaKey'
import { isStoryboardWidgetQeTraceEnabled, pushStoryboardWidgetQeTrace } from '@/lib/storyboardWidget/storyboardWidgetQeTrace'
import {
  buildRichMediaConnectedValueTargetNodeIdSet,
  listDisplayRichMediaOverlayNodes,
} from '@/lib/render/richMediaSsot'
import { applyFixedStoryboardCardPlacementsToGraphData2d, readStoryboardWidgetPlacementSize2d } from '@/components/StoryboardWidgetCanvas/storyboardCardPlacements2d'
import { useStableStoryboardCardPlacements2d } from '@/components/StoryboardWidgetCanvas/useStableStoryboardCardPlacements2d'
import {
  getCachedStoryboardWidgetRenderGraph,
  getCachedStoryboardWidgetPlacementContext,
} from '@/components/StoryboardWidgetCanvas/runtime/storyboardWidgetRenderGraph'
import { type FrontmatterOverlayOnlyCoverageCache, resolveFrontmatterOverlayVisualIsolationWithStableCoverage } from '@/components/StoryboardWidgetCanvas/runtime/storyboardWidgetOverlayCoverage'
import { buildOverlayEditorElements } from '@/components/StoryboardWidgetCanvas/runtime/storyboardWidgetOverlaySurfaceElements'
import {
  buildFlowCanvasGraphDataOverride,
  resolveOverlayOnlyActive,
} from '@/components/StoryboardWidgetCanvas/runtime/storyboardWidgetOverlaySurfaceVisibility'
import { isAuthoritativeEmptyStoryboardGraph } from '@/components/StoryboardWidgetCanvas/runtime/storyboardCanvasGraphAuthority'
import { reportRuntimeTrace } from '@/lib/debug/runtimeTrace'
// #region debug-point A:overlay-surface-graph-handoff
const STORYBOARD_MEDIA_PANEL_LOOP_TRACE_SCOPE = 'storyboard-media-panel-loop'
const reportStoryboardMediaPanelLoopOverlaySurfaceDebug = (args: {
  hypothesisId: 'A' | 'B' | 'C' | 'D' | 'E'
  location: string
  msg: string
  data?: Record<string, unknown>
}) => {
  reportRuntimeTrace({
    scope: STORYBOARD_MEDIA_PANEL_LOOP_TRACE_SCOPE,
    runId: 'runtime',
    hypothesisId: args.hypothesisId,
    location: args.location,
    msg: args.msg,
    data: args.data || {},
  })
}
// #endregion
const EMPTY_GRAPH_NODES: GraphNode[] = []
const EMPTY_GRAPH_EDGES: GraphEdge[] = []
const EMPTY_GRAPH_NODE_BY_ID = new Map<string, GraphNode>()
const EMPTY_GRAPH_ELIGIBLE_NODE_IDS = new Set<string>()

function isGraphDataLike(value: unknown): value is GraphData {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const candidate = value as { nodes?: unknown; edges?: unknown }
  return Array.isArray(candidate.nodes) || Array.isArray(candidate.edges)
}

export function useStoryboardWidgetOverlaySurface(args: {
  storyboardWidgetSurfaceId: string
  canEdit: boolean
  storyboardWidgetViewActive: boolean
  storyboardWidgetFrontmatterGraphAvailable: boolean; editorSurfaceKind?: 'card' | 'widget'
  geospatialWidgetPanelMode?: boolean
  renderGraphDataOverride: GraphData | null
  draftGraphDataRef: React.MutableRefObject<GraphData | null>
  baseGraphDataRevision: number
  draftGraphDataRevision: number
  overlayTopologyLayoutSignature: string
  openWidgetNodeIds: string[]
  allowExplicitOpenWidgetNodeIds?: boolean
  overlayDraftNode: GraphNode | null
  pendingOverlayNode: GraphNode | null
  pendingOverlayNodeIdRef: React.MutableRefObject<string | null>
  lastDroppedWidgetNodeIdRef: React.MutableRefObject<string | null>
  lastDroppedWidgetToken: number
  toolMode: 'select' | 'addEdge'
  pendingEdgeSourceId: string | null
  viewportW: number
  viewportH: number
  canvasWindowOffset: { left: number; top: number }
  zoomViewKey: string | null
  getLiveNodeWorldPos?: (nodeId: string) => { x: number; y: number } | null
  getLiveZoomTransform?: () => { k: number; x: number; y: number } | null
  getLiveContainmentGroupAabbForNode?: (nodeId: string) => { groupId: string; minX: number; minY: number; maxX: number; maxY: number } | null
  beginAddEdgeFromNode: (nodeId: string, portKey?: string | null) => void
  finalizePendingEdge: (nodeId: string, portKey?: string | null, source?: { nodeId: string; portKey: string | null }) => void
  setNodeLabelById: (nodeId: string, label: string) => void
  setNodeTypeById: (nodeId: string, type: string) => void
  patchNodePropertiesById: (nodeId: string, patch: Record<string, unknown>) => void
  setNodePropertiesById: (nodeId: string, properties: Record<string, unknown>) => void
  validateNodeById: (nodeId: string) => void
  runWorkflowNode: (nodeId: string) => Promise<void> | void
  duplicateNodeById: (nodeId: string) => void
  removeNodeById: (nodeId: string) => void
  clearNodeOutputById: (nodeId: string) => void
  showNodeEditorHelp: () => void
  convertNodeToLoopById: (nodeId: string) => void
  enableHandlesForAllInputs: () => void
  renameSchemaFieldIdByNodeId: (nodeId: string, prevId: string, nextId: string) => void
  scheduleOverlayCollisionResolve: () => void
  upsertUiToast: (args: { id: string; kind: 'neutral' | 'warning' | 'success' | 'error'; message: string; ttlMs?: number }) => void
  widgetRegistry: ReadonlyArray<WidgetRegistryEntry>
  flowWidgetPinnedByNodeId?: Record<string, boolean>
}) {
  const {
    storyboardWidgetSurfaceId,
    canEdit,
    storyboardWidgetViewActive,
    storyboardWidgetFrontmatterGraphAvailable, editorSurfaceKind,
    geospatialWidgetPanelMode,
    renderGraphDataOverride: rawRenderGraphDataOverride,
    draftGraphDataRef,
    baseGraphDataRevision,
    draftGraphDataRevision,
    overlayTopologyLayoutSignature,
    openWidgetNodeIds,
    allowExplicitOpenWidgetNodeIds,
    overlayDraftNode,
    pendingOverlayNode,
    pendingOverlayNodeIdRef,
    lastDroppedWidgetNodeIdRef,
    lastDroppedWidgetToken,
    toolMode,
    pendingEdgeSourceId,
    viewportW,
    viewportH,
    canvasWindowOffset,
    zoomViewKey,
    getLiveNodeWorldPos,
    getLiveZoomTransform,
    getLiveContainmentGroupAabbForNode,
    beginAddEdgeFromNode,
    finalizePendingEdge,
    setNodeLabelById,
    setNodeTypeById,
    patchNodePropertiesById,
    setNodePropertiesById,
    validateNodeById,
    runWorkflowNode,
    duplicateNodeById,
    removeNodeById,
    clearNodeOutputById,
    showNodeEditorHelp,
    convertNodeToLoopById,
    enableHandlesForAllInputs,
    renameSchemaFieldIdByNodeId,
    scheduleOverlayCollisionResolve,
    upsertUiToast,
    widgetRegistry,
    flowWidgetPinnedByNodeId,
  } = args
  const workspaceMutationBlocked = useGraphStore(s => isWorkspaceGraphMutationBlocked(s))
  const workspaceOverlayOpen = useGraphStore(s => isWorkspaceEditorOverlayOpen(s))
  const schema = useGraphStore(s => s.schema)
  const strybldrStoryboardCardAspectMode = useGraphStore(s => s.strybldrStoryboardCardAspectMode)
  const sourceFiles = useGraphStore(s => s.sourceFiles)
  const markdownDocumentName = useGraphStore(s => s.markdownDocumentName)
  const explorerActivePath = useMarkdownExplorerStore(s => s.activePath)

  const activeSourceFile = React.useMemo(
    () => resolvePreferredEnabledComposedSourceFile({
      sourceFiles,
      markdownDocumentName,
      explorerActivePath,
      fallbackName: markdownDocumentName,
    }),
    [explorerActivePath, markdownDocumentName, sourceFiles],
  )
  const activeSourceSelectionKey = React.useMemo(
    () => buildComposedSourceFileSelectionKey(activeSourceFile),
    [activeSourceFile],
  )
  const stableOverlaySurfaceCacheKey = React.useMemo(() => {
    const sourceKey = String(activeSourceSelectionKey || '').trim()
    if (workspaceOverlayOpen && sourceKey) return `workspace:${sourceKey}`
    return normalizeOverlaySurfaceCacheKey(storyboardWidgetSurfaceId)
  }, [activeSourceSelectionKey, storyboardWidgetSurfaceId, workspaceOverlayOpen])
  const activeSourceFrontmatterFlowAvailable = React.useMemo(
    () => isFrontmatterFlowGraph(activeSourceFile?.parsedGraphData),
    [activeSourceFile],
  )
  const activeSourceParsedGraphKnown = React.useMemo(
    () => isGraphDataLike(activeSourceFile?.parsedGraphData),
    [activeSourceFile],
  )
  const renderGraphDataOverride = React.useMemo((): GraphData | null => {
    if (
      allowExplicitOpenWidgetNodeIds === true
      && !isGraphDataLike(rawRenderGraphDataOverride)
      && isGraphDataLike(activeSourceFile?.parsedGraphData)
    ) {
      return activeSourceFile.parsedGraphData as GraphData
    }
    return rawRenderGraphDataOverride
  }, [activeSourceFile, allowExplicitOpenWidgetNodeIds, rawRenderGraphDataOverride])
  const overlayEditorNodeIdsRef = React.useRef<string[]>([])
  const lastStableOverlayEditorNodeIdsRef = React.useRef<string[]>([])
  const lastStableOverlayEditorNodeIdsGraphKeyRef = React.useRef<string>('')
  const lastStableOverlayEditorNodeIdsSourceKeyRef = React.useRef<string>('')
  const renderGraphDataOverrideRef = React.useRef<GraphData | null>(renderGraphDataOverride)
  const lastStableRenderGraphDataOverrideRef = React.useRef<GraphData | null>(renderGraphDataOverride)
  const previousActiveSourceSelectionKeyRef = React.useRef<string>('')

  const cachedStableOverlaySurface = readStableFrontmatterOverlaySurfaceCache(stableOverlaySurfaceCacheKey)
  if (
    cachedStableOverlaySurface
    && lastStableOverlayEditorNodeIdsRef.current.length === 0
    && (!activeSourceSelectionKey || cachedStableOverlaySurface.sourceKey === activeSourceSelectionKey)
  ) {
    lastStableOverlayEditorNodeIdsRef.current = cachedStableOverlaySurface.ids
    lastStableOverlayEditorNodeIdsGraphKeyRef.current = cachedStableOverlaySurface.graphKey
    lastStableOverlayEditorNodeIdsSourceKeyRef.current = cachedStableOverlaySurface.sourceKey
    lastStableRenderGraphDataOverrideRef.current = cachedStableOverlaySurface.graphData
  }

  React.useEffect(() => {
    const previous = previousActiveSourceSelectionKeyRef.current
    if (previous && activeSourceSelectionKey && previous !== activeSourceSelectionKey) {
      lastStableOverlayEditorNodeIdsRef.current = []
      lastStableOverlayEditorNodeIdsGraphKeyRef.current = ''
      lastStableOverlayEditorNodeIdsSourceKeyRef.current = ''
      clearStableFrontmatterOverlaySurfaceCache(stableOverlaySurfaceCacheKey)
    }
    if (activeSourceSelectionKey) previousActiveSourceSelectionKeyRef.current = activeSourceSelectionKey
  }, [activeSourceSelectionKey, stableOverlaySurfaceCacheKey])

  React.useEffect(() => {
    if (!storyboardWidgetViewActive) {
      if (workspaceMutationBlocked) return
      if (workspaceOverlayOpen) return
      lastStableOverlayEditorNodeIdsRef.current = []
      lastStableOverlayEditorNodeIdsGraphKeyRef.current = ''
      lastStableOverlayEditorNodeIdsSourceKeyRef.current = ''
      clearStableFrontmatterOverlaySurfaceCache(stableOverlaySurfaceCacheKey)
    }
  }, [storyboardWidgetViewActive, stableOverlaySurfaceCacheKey, workspaceMutationBlocked, workspaceOverlayOpen])

  const openWidgetNodeIdsKey = React.useMemo(
    () => hashScopedStringArraySignature('open-widget-node-ids', openWidgetNodeIds),
    [openWidgetNodeIds],
  )
  const openWidgetNodeIdsSnapshotRef = React.useRef<{ key: string; value: string[] } | null>(null)
  if (openWidgetNodeIdsSnapshotRef.current?.key !== openWidgetNodeIdsKey) {
    openWidgetNodeIdsSnapshotRef.current = {
      key: openWidgetNodeIdsKey,
      value: normalizeStringArrayForSignature(openWidgetNodeIds, { unique: true }),
    }
  }
  const openWidgetNodeIdsSnapshot = openWidgetNodeIdsSnapshotRef.current.value
  const renderGraphDataRevision = React.useMemo(() => {
    const revision = readGraphDataRevision(renderGraphDataOverride)
    if (revision > 0) return revision
    return storyboardWidgetViewActive ? draftGraphDataRevision : baseGraphDataRevision
  }, [baseGraphDataRevision, draftGraphDataRevision, storyboardWidgetViewActive, renderGraphDataOverride])
  const stableStoryboardCardPlacements = useStableStoryboardCardPlacements2d({
    aspectRatioMode: strybldrStoryboardCardAspectMode,
    graphData: renderGraphDataOverride,
    graphRevision: renderGraphDataRevision,
    layoutKey: stableOverlaySurfaceCacheKey,
    schema,
    widgetRegistry,
  })
  const overlayLayoutGraphData = React.useMemo((): GraphData | null => {
    if (String(storyboardWidgetSurfaceId || '').trim() !== 'storyboard') return renderGraphDataOverride
    return applyFixedStoryboardCardPlacementsToGraphData2d({
      aspectRatioMode: strybldrStoryboardCardAspectMode,
      flowWidgetPinnedByNodeId,
      graphData: renderGraphDataOverride,
      graphRevision: renderGraphDataRevision,
      referencePlacements: stableStoryboardCardPlacements,
      readPlacementSize: node => readStoryboardWidgetPlacementSize2d(node, strybldrStoryboardCardAspectMode),
      schema,
      widgetRegistry,
    })
  }, [
    flowWidgetPinnedByNodeId,
    renderGraphDataOverride,
    renderGraphDataRevision,
    schema,
    stableStoryboardCardPlacements,
    storyboardWidgetSurfaceId,
    strybldrStoryboardCardAspectMode,
    widgetRegistry,
  ])
  const renderGraphSemanticKey = React.useMemo(
    () => buildScopedGraphSemanticKey('storyboard-widget-overlay-surface-render-graph', {
      graphData: renderGraphDataOverride,
      graphRevision: renderGraphDataRevision,
    }),
    [renderGraphDataOverride, renderGraphDataRevision],
  )
  const renderGraphLookup = React.useMemo(() => {
    return getCachedStoryboardWidgetRenderGraph({
      scope: 'storyboard-widget-overlay-surface-render-graph',
      graphData: overlayLayoutGraphData,
      graphRevision: renderGraphDataRevision,
      preferCurrentGraphDataRefs: true,
    })
  }, [overlayLayoutGraphData, renderGraphDataRevision])
  const renderGraphNodes = renderGraphLookup?.nodes || EMPTY_GRAPH_NODES
  const renderGraphEdges = renderGraphLookup?.edges || EMPTY_GRAPH_EDGES
  const renderGraphNodeById = renderGraphLookup?.nodeById || EMPTY_GRAPH_NODE_BY_ID
  const renderGraphIncidentEdgesByNodeId = renderGraphLookup?.incidentEdgesByNodeId || null
  const renderGraphEligibleNodeIds = renderGraphLookup?.eligibleNodeIds || EMPTY_GRAPH_ELIGIBLE_NODE_IDS
  const renderGraphPlacementContext = React.useMemo(() => {
    return getCachedStoryboardWidgetPlacementContext({
      graphData: overlayLayoutGraphData,
      graphRevision: renderGraphDataRevision,
      openWidgetNodeIds: openWidgetNodeIdsSnapshot,
      preferCurrentGraphDataRefs: true,
    })
  }, [openWidgetNodeIdsSnapshot, overlayLayoutGraphData, renderGraphDataRevision])
  const renderGraphMetaKind = renderGraphPlacementContext?.graphMetaKind || renderGraphLookup?.graphMetaKind || null
  const renderGraphMetaKey = React.useMemo(
    () => buildGraphDocumentMetaKey(renderGraphDataOverride),
    [renderGraphDataOverride],
  )
  const deferComposedGraphOverlayRender = React.useMemo(
    () => shouldDeferComposedGraphRender({
      graphData: renderGraphDataOverride,
      layers: sourceFiles,
    }),
    [renderGraphDataOverride, sourceFiles],
  )

  const selectedOverlayEditorNodeIdForDerivation = React.useMemo(() => deriveSelectedOverlayEditorNodeIdForDerivation({ overlayDraftNode, pendingOverlayNode, pendingOverlayNodeId: pendingOverlayNodeIdRef.current, renderGraphDataOverride, lastStableRenderGraphDataOverride: lastStableRenderGraphDataOverrideRef.current, nodeById: renderGraphNodeById, storyboardWidgetSurfaceId }), [overlayDraftNode, pendingOverlayNode, renderGraphDataOverride, renderGraphNodeById, storyboardWidgetSurfaceId])

  const overlayEditorNodeIds = React.useMemo(() => {
    if (editorSurfaceKind === 'card') return []
    if (isAuthoritativeEmptyStoryboardGraph(renderGraphDataOverride)) return []
    const rememberStableOverlayIds = (ids: string[]) => {
      lastStableOverlayEditorNodeIdsRef.current = ids
      lastStableOverlayEditorNodeIdsGraphKeyRef.current = renderGraphSemanticKey
      lastStableOverlayEditorNodeIdsSourceKeyRef.current = activeSourceSelectionKey
      writeStableFrontmatterOverlaySurfaceCache(stableOverlaySurfaceCacheKey, {
        sourceKey: activeSourceSelectionKey,
        graphKey: renderGraphSemanticKey,
        ids,
        graphData: renderGraphDataOverride,
      })
    }
    const readLastStableForCurrentSource = (): string[] => {
      const lastStable = lastStableOverlayEditorNodeIdsRef.current
      if (lastStable.length === 0) return []
      const lastSourceKey = lastStableOverlayEditorNodeIdsSourceKeyRef.current
      if (activeSourceSelectionKey && activeSourceSelectionKey !== lastSourceKey) return []
      return lastStable
    }
    const shouldKeepLastStableForFrontmatterHandoff = (): boolean => {
      if (storyboardWidgetFrontmatterGraphAvailable || activeSourceFrontmatterFlowAvailable) return true
      if (activeSourceParsedGraphKnown) return false
      return !renderGraphMetaKind
    }
    if (deferComposedGraphOverlayRender && !allowExplicitOpenWidgetNodeIds) {
      if (shouldKeepLastStableForFrontmatterHandoff()) return readLastStableForCurrentSource()
      return []
    }
    if (!storyboardWidgetViewActive) {
      const isFrontmatterFlow = renderGraphPlacementContext?.isFrontmatterFlow === true
      if (workspaceOverlayOpen && isFrontmatterFlow) {
        const sorted = renderGraphPlacementContext?.frontmatterOverlayNodeIds || []
        if (sorted.length > 0) {
          rememberStableOverlayIds(sorted)
          return sorted
        }
      }
      const lastStable = readLastStableForCurrentSource()
      if (workspaceOverlayOpen && lastStable.length > 0) return lastStable
      if (workspaceMutationBlocked && lastStable.length > 0) return lastStable
      return []
    }
    const isFrontmatterFlow = renderGraphPlacementContext?.isFrontmatterFlow === true
    const nodes = renderGraphNodes
    const nodeById = renderGraphNodeById
    if (isFrontmatterFlow) {
      const sorted = renderGraphPlacementContext?.frontmatterOverlayNodeIds || []
      if (sorted.length > 0) {
        rememberStableOverlayIds(sorted)
        return sorted
      }
      const lastStable = readLastStableForCurrentSource()
      const sameGraphAsLastStable = lastStableOverlayEditorNodeIdsGraphKeyRef.current === renderGraphSemanticKey
      if (lastStable.length > 0 && (sameGraphAsLastStable || workspaceMutationBlocked || nodes.length === 0)) return lastStable
      return []
    }
    if (!allowExplicitOpenWidgetNodeIds && shouldKeepLastStableForFrontmatterHandoff()) {
      const lastStable = readLastStableForCurrentSource()
      if (lastStable.length > 0) return lastStable
      return []
    }
    const next = deriveOpenWidgetOverlayNodeIds({
      graphData: renderGraphDataOverride,
      openWidgetNodeIds: openWidgetNodeIdsSnapshot,
      allowExplicitOpenWidgetNodeIds,
      eligibleNodeIds: renderGraphEligibleNodeIds,
      nodeById,
      selectedNodeId: selectedOverlayEditorNodeIdForDerivation,
    })
    if (next.length > 0) rememberStableOverlayIds(next)
    return next
  }, [
    activeSourceFrontmatterFlowAvailable,
    activeSourceParsedGraphKnown,
    activeSourceSelectionKey,
    allowExplicitOpenWidgetNodeIds,
    editorSurfaceKind,
    storyboardWidgetFrontmatterGraphAvailable,
    storyboardWidgetViewActive,
    overlayDraftNode?.id,
    renderGraphDataOverride,
    renderGraphPlacementContext,
    openWidgetNodeIdsSnapshot,
    renderGraphEligibleNodeIds,
    renderGraphMetaKind,
    renderGraphNodeById,
    renderGraphNodes,
    renderGraphSemanticKey,
    stableOverlaySurfaceCacheKey,
    workspaceMutationBlocked,
    workspaceOverlayOpen,
    deferComposedGraphOverlayRender,
    selectedOverlayEditorNodeIdForDerivation,
  ])

  React.useEffect(() => {
    overlayEditorNodeIdsRef.current = overlayEditorNodeIds
  }, [overlayEditorNodeIds])

  React.useEffect(() => {
    if (typeof window === 'undefined') return
    if (!isStoryboardWidgetQeTraceEnabled(window)) return

    const graphNodes = renderGraphNodes.length
    const graphEdges = renderGraphEdges.length
    pushStoryboardWidgetQeTrace(window, {
      kind: 'overlay-surface',
      active: canEdit ? 1 : 0,
      view: storyboardWidgetViewActive ? 1 : 0,
      frontmatterGraph: storyboardWidgetFrontmatterGraphAvailable ? 1 : 0,
      graphNodes,
      graphEdges,
      openWidgetCount: openWidgetNodeIdsSnapshot.length,
      overlayCount: overlayEditorNodeIds.length,
      overlayIdsHead: overlayEditorNodeIds.slice(0, 8).join(','),
      overlayOnlyActive: overlayEditorNodeIds.length > 0 ? 1 : 0,
      activeSourceSelectionKey,
      activeSourceFrontmatterFlowAvailable: activeSourceFrontmatterFlowAvailable ? 1 : 0,
      activeSourceParsedGraphKnown: activeSourceParsedGraphKnown ? 1 : 0,
      lastStableSourceSelectionKey: lastStableOverlayEditorNodeIdsSourceKeyRef.current,
      deferComposedGraphOverlayRender: deferComposedGraphOverlayRender ? 1 : 0,
      graphMetaKind: renderGraphMetaKind || '',
    })
  }, [
    activeSourceFrontmatterFlowAvailable,
    activeSourceParsedGraphKnown,
    activeSourceSelectionKey,
    canEdit,
    deferComposedGraphOverlayRender,
    storyboardWidgetFrontmatterGraphAvailable,
    storyboardWidgetViewActive,
    overlayEditorNodeIds,
    openWidgetNodeIdsKey,
    openWidgetNodeIdsSnapshot.length,
    renderGraphMetaKind,
    renderGraphDataRevision,
    renderGraphEdges.length,
    renderGraphNodes.length,
  ])

  React.useEffect(() => {
    renderGraphDataOverrideRef.current = renderGraphDataOverride
    const nodeCount = Array.isArray(renderGraphDataOverride?.nodes) ? renderGraphDataOverride.nodes.length : 0
    if (!renderGraphDataOverride || nodeCount <= 0) return
    const activeSourceMatchesStableOverlay =
      !!activeSourceSelectionKey
      && activeSourceSelectionKey === lastStableOverlayEditorNodeIdsSourceKeyRef.current
      && lastStableOverlayEditorNodeIdsRef.current.length > 0
    const graphIsFrontmatterFlow = isFrontmatterFlowGraph(renderGraphDataOverride)
    const preserveStableFrontmatterGraph =
      activeSourceMatchesStableOverlay
      && !graphIsFrontmatterFlow
      && (
        storyboardWidgetFrontmatterGraphAvailable
        || activeSourceFrontmatterFlowAvailable
        || !activeSourceParsedGraphKnown
        || !renderGraphMetaKind
      )
    if (preserveStableFrontmatterGraph) return
    lastStableRenderGraphDataOverrideRef.current = renderGraphDataOverride
  }, [
    activeSourceFrontmatterFlowAvailable,
    activeSourceParsedGraphKnown,
    activeSourceSelectionKey,
    storyboardWidgetFrontmatterGraphAvailable,
    renderGraphDataOverride,
    renderGraphMetaKind,
  ])

  const overlayEditorNodeIdsKey = React.useMemo(
    () => hashScopedStringArraySignature('overlay', overlayEditorNodeIds),
    [overlayEditorNodeIds],
  )
  const seededFrontmatterAutoWidgetsKeyRef = React.useRef<string>('')
  React.useEffect(() => {
    if (deferComposedGraphOverlayRender) return
    const graphData = renderGraphDataOverrideRef.current
    if (!graphData) return
    if (renderGraphPlacementContext?.isFrontmatterFlow !== true) return
    if (overlayEditorNodeIds.length === 0) return

    const st = useGraphStore.getState()
    if (isWorkspaceGraphMutationBlocked(st)) return
    const pinnedById = resolveScopedFlowWidgetNodeMap({
      graphMetaKey: renderGraphMetaKey,
      keyedByGraphMetaKey: (st as unknown as { flowWidgetPinnedByNodeIdByGraphMetaKey?: Record<string, Record<string, boolean>> }).flowWidgetPinnedByNodeIdByGraphMetaKey,
      globalByNodeId: st.flowWidgetPinnedByNodeId,
    })
    const defaultPinned = renderGraphPlacementContext?.defaultPinnedInCanvas ?? true
    const missingIds = overlayEditorNodeIds.filter(id => id && !Object.prototype.hasOwnProperty.call(pinnedById, id))
    const missingIdsKey = hashScopedStringArraySignature('missing-frontmatter-pins', missingIds)
    const seedKey = hashSignatureParts([
      'frontmatter-overlay-auto-pins',
      overlayTopologyLayoutSignature,
      overlayEditorNodeIdsKey,
      missingIdsKey,
      defaultPinned,
    ])
    if (seededFrontmatterAutoWidgetsKeyRef.current === seedKey) return
    seededFrontmatterAutoWidgetsKeyRef.current = seedKey
    if (missingIds.length === 0) return

    const nextPinned = seedMissingFlowWidgetPinnedByIds({ pinnedById, nodeIds: missingIds, pinned: defaultPinned })
    if (!nextPinned) return
    st.setFlowWidgetPinnedByNodeId(nextPinned)
    if (!defaultPinned) scheduleOverlayCollisionResolve()
  }, [deferComposedGraphOverlayRender, overlayTopologyLayoutSignature, overlayEditorNodeIds, overlayEditorNodeIdsKey, renderGraphMetaKey, renderGraphPlacementContext, scheduleOverlayCollisionResolve])

  const seededGeospatialOverlayWidgetPinsKeyRef = React.useRef<string>('')
  const overlayEditorNodeIdsSnapshotRef = React.useRef<{ key: string; value: string[] } | null>(null)
  if (overlayEditorNodeIdsSnapshotRef.current?.key !== overlayEditorNodeIdsKey) {
    overlayEditorNodeIdsSnapshotRef.current = {
      key: overlayEditorNodeIdsKey,
      value: normalizeStringArrayForSignature(overlayEditorNodeIds, { unique: true }),
    }
  }
  const overlayEditorNodeIdsSnapshot = overlayEditorNodeIdsSnapshotRef.current.value
  const overlayVisibilityActive = React.useMemo(() => {
    return storyboardWidgetViewActive || (workspaceOverlayOpen && overlayEditorNodeIds.length > 0)
  }, [storyboardWidgetViewActive, overlayEditorNodeIds.length, workspaceOverlayOpen])
  const frontmatterOverlayAuthorityGraphData = React.useMemo(() => {
    if (isFrontmatterFlowGraph(renderGraphDataOverride)) return renderGraphDataOverride
    const lastStableGraph = lastStableRenderGraphDataOverrideRef.current
    if (!isFrontmatterFlowGraph(lastStableGraph)) return renderGraphDataOverride
    if (!workspaceOverlayOpen && !storyboardWidgetViewActive) return renderGraphDataOverride
    if (overlayEditorNodeIdsSnapshot.length === 0) return renderGraphDataOverride
    return lastStableGraph
  }, [storyboardWidgetViewActive, overlayEditorNodeIdsSnapshot, renderGraphDataOverride, workspaceOverlayOpen])
  const frontmatterOverlayCoverageActive = React.useMemo(() => {
    return overlayVisibilityActive && (
      renderGraphPlacementContext?.isFrontmatterFlow === true
      || isFrontmatterFlowGraph(frontmatterOverlayAuthorityGraphData)
    )
  }, [frontmatterOverlayAuthorityGraphData, overlayVisibilityActive, renderGraphPlacementContext])

  React.useEffect(() => {
    if (deferComposedGraphOverlayRender) return
    if (!geospatialWidgetPanelMode) return
    if (overlayEditorNodeIds.length === 0) return
    const st = useGraphStore.getState()
    if (isWorkspaceGraphMutationBlocked(st)) return
    const pinnedById = resolveScopedFlowWidgetNodeMap({
      graphMetaKey: renderGraphMetaKey,
      keyedByGraphMetaKey: (st as unknown as { flowWidgetPinnedByNodeIdByGraphMetaKey?: Record<string, Record<string, boolean>> }).flowWidgetPinnedByNodeIdByGraphMetaKey,
      globalByNodeId: st.flowWidgetPinnedByNodeId,
    })
    const missingIds = overlayEditorNodeIds.filter(id => id && !Object.prototype.hasOwnProperty.call(pinnedById, id))
    const defaultPinned = resolveDefaultFlowWidgetPinnedInCanvas({ geospatialWidgetPanelMode: true })
    const missingIdsKey = hashScopedStringArraySignature('missing-geospatial-pins', missingIds)
    const seedKey = hashSignatureParts([
      'geospatial-overlay-auto-pins',
      overlayEditorNodeIdsKey,
      missingIdsKey,
      defaultPinned,
    ])
    if (seededGeospatialOverlayWidgetPinsKeyRef.current === seedKey) return
    seededGeospatialOverlayWidgetPinsKeyRef.current = seedKey
    if (missingIds.length === 0) return
    const nextPinned = seedMissingFlowWidgetPinnedByIds({ pinnedById, nodeIds: missingIds, pinned: defaultPinned })
    if (!nextPinned) return
    st.setFlowWidgetPinnedByNodeId(nextPinned)
    if (!defaultPinned) scheduleOverlayCollisionResolve()
  }, [deferComposedGraphOverlayRender, geospatialWidgetPanelMode, overlayEditorNodeIds, overlayEditorNodeIdsKey, renderGraphMetaKey, scheduleOverlayCollisionResolve])
  const frontmatterVisibleSceneDisplayRef = React.useRef<{
    key: string
    value: ReturnType<typeof deriveSceneDisplayGraph> | null
  } | null>(null)
  const frontmatterVisibleGraphSemanticKey = React.useMemo(
    () => buildScopedGraphSemanticKey('storyboard-widget-overlay-surface-frontmatter-visible-graph', {
      graphData: frontmatterOverlayAuthorityGraphData,
      graphRevision: renderGraphDataRevision,
      graphSemanticKey: renderGraphSemanticKey,
    }),
    [frontmatterOverlayAuthorityGraphData, renderGraphDataRevision, renderGraphSemanticKey],
  )
  if (
    !frontmatterVisibleSceneDisplayRef.current
    || frontmatterVisibleSceneDisplayRef.current.key !== frontmatterVisibleGraphSemanticKey
  ) {
    const renderGraphDataOverride = frontmatterOverlayAuthorityGraphData
    frontmatterVisibleSceneDisplayRef.current = {
      key: frontmatterVisibleGraphSemanticKey,
      value: frontmatterOverlayCoverageActive && renderGraphDataOverride
        ? deriveSceneDisplayGraph({ graphData: renderGraphDataOverride })
        : null,
    }
  }
  const frontmatterVisibleSceneDisplay = frontmatterVisibleSceneDisplayRef.current?.value || null
  const frontmatterVisibleGraphNodes = React.useMemo(() => {
    if (!frontmatterOverlayCoverageActive) return renderGraphNodes
    const displayNodes = Array.isArray(frontmatterVisibleSceneDisplay?.displayGraphData?.nodes)
      ? (frontmatterVisibleSceneDisplay?.displayGraphData?.nodes as GraphNode[])
      : null
    if (displayNodes && displayNodes.length > 0) return displayNodes
    return renderGraphNodes
  }, [frontmatterOverlayCoverageActive, frontmatterVisibleSceneDisplay, renderGraphNodes])
  const connectedValueTargetNodeIds = React.useMemo(() => {
    return buildRichMediaConnectedValueTargetNodeIdSet({
      nodes: frontmatterOverlayCoverageActive ? frontmatterVisibleGraphNodes : [],
      extraNodeIds: overlayEditorNodeIdsSnapshot,
    })
  }, [frontmatterOverlayCoverageActive, frontmatterVisibleGraphNodes, overlayEditorNodeIdsSnapshot])
  const connectedValuesGraphRevision = args.storyboardWidgetViewActive ? args.draftGraphDataRevision : args.baseGraphDataRevision
  const connectedValuesByNodeId = React.useMemo(() => {
    if (connectedValueTargetNodeIds.size === 0) return new Map<string, FlowConnectedValuesBySchemaPath>()
    return computeFlowConnectedValuesBySchemaPath({
      graphData: frontmatterOverlayCoverageActive ? frontmatterOverlayAuthorityGraphData : renderGraphDataOverride,
      registry: Array.isArray(widgetRegistry) ? widgetRegistry : [],
      targetNodeIds: connectedValueTargetNodeIds,
      graphRevision: connectedValuesGraphRevision,
      graphSemanticKey: renderGraphSemanticKey,
    })
  }, [connectedValuesGraphRevision, connectedValueTargetNodeIds, frontmatterOverlayAuthorityGraphData, frontmatterOverlayCoverageActive, renderGraphDataOverride, renderGraphSemanticKey, widgetRegistry])
  const frontmatterRichMediaOverlayNodeIds = React.useMemo(() => {
    if (!frontmatterOverlayCoverageActive) return [] as string[]
    const overlayEditorNodeIdSet = new Set(overlayEditorNodeIdsSnapshot)
    const overlays = listDisplayRichMediaOverlayNodes({
      renderMediaAsNodes: false,
      canvasRenderMode: '2d',
      canvas2dRenderer: 'storyboard',
      frontmatterModeEnabled: true,
      documentSemanticMode: 'document',
      nodes: frontmatterVisibleGraphNodes,
      poolMax: 24,
      excludeNodeIdSet: overlayEditorNodeIdSet,
      connectedValuesByNodeId,
    })
    return overlays.map(node => String(node.id || '').trim()).filter(Boolean)
  }, [connectedValuesByNodeId, frontmatterOverlayCoverageActive, frontmatterVisibleGraphNodes, overlayEditorNodeIdsSnapshot])
  const frontmatterRichMediaOverlayNodeIdsKey = React.useMemo(
    () => hashScopedStringArraySignature('frontmatter-rich-media-overlay', frontmatterRichMediaOverlayNodeIds),
    [frontmatterRichMediaOverlayNodeIds],
  )
  const frontmatterRichMediaOverlayNodeIdsSnapshotRef = React.useRef<{ key: string; value: string[] } | null>(null)
  if (frontmatterRichMediaOverlayNodeIdsSnapshotRef.current?.key !== frontmatterRichMediaOverlayNodeIdsKey) {
    frontmatterRichMediaOverlayNodeIdsSnapshotRef.current = {
      key: frontmatterRichMediaOverlayNodeIdsKey,
      value: normalizeStringArrayForSignature(frontmatterRichMediaOverlayNodeIds, { unique: true }),
    }
  }
  const frontmatterRichMediaOverlayNodeIdsSnapshot = frontmatterRichMediaOverlayNodeIdsSnapshotRef.current.value

  const handlePinnedInCanvasChange = React.useCallback(() => {
    // Pin state switches placement authority; collision layout stays owned by topology,
    // viewport changes, and explicit floating-position updates.
  }, [])
  const overlayEditorElements = React.useMemo(() => {
    return buildOverlayEditorElements({
      overlayVisibilityActive,
      renderGraphNodeById,
      renderGraphIncidentEdgesByNodeId,
      renderGraphMetaKind,
      renderGraphDataOverride,
      lastStableRenderGraphDataOverride: lastStableRenderGraphDataOverrideRef.current,
      draftGraphDataRef,
      pendingOverlayNodeIdRef,
      pendingOverlayNode,
      overlayEditorNodeIds,
      connectedValuesByNodeId,
      storyboardWidgetSurfaceId, editorSurfaceKind,
      renderGraphSemanticKey,
      canEdit,
      widgetRegistry,
      toolMode,
      pendingEdgeSourceId,
      viewportW,
      viewportH,
      canvasWindowOffset,
      zoomViewKey,
      lastDroppedWidgetNodeIdRef,
      lastDroppedWidgetToken,
      getLiveNodeWorldPos,
      getLiveZoomTransform,
      getLiveContainmentGroupAabbForNode,
      beginAddEdgeFromNode,
      finalizePendingEdge,
      setNodeLabelById,
      setNodeTypeById,
      patchNodePropertiesById,
      setNodePropertiesById,
      validateNodeById,
      runWorkflowNode,
      duplicateNodeById,
      removeNodeById,
      clearNodeOutputById,
      showNodeEditorHelp,
      convertNodeToLoopById,
      enableHandlesForAllInputs,
      renameSchemaFieldIdByNodeId,
      upsertUiToast,
      flowWidgetPinnedByNodeId,
      handlePinnedInCanvasChange,
    })
  }, [
    beginAddEdgeFromNode,
    canEdit,
    canvasWindowOffset,
    clearNodeOutputById,
    convertNodeToLoopById,
    duplicateNodeById,
    draftGraphDataRef,
    enableHandlesForAllInputs, editorSurfaceKind,
    finalizePendingEdge,
    storyboardWidgetSurfaceId,
    flowWidgetPinnedByNodeId,
    getLiveContainmentGroupAabbForNode,
    getLiveNodeWorldPos,
    getLiveZoomTransform,
    lastDroppedWidgetNodeIdRef,
    lastDroppedWidgetToken,
    patchNodePropertiesById,
    pendingEdgeSourceId,
    pendingOverlayNode,
    pendingOverlayNodeIdRef,
    removeNodeById,
    renameSchemaFieldIdByNodeId,
    runWorkflowNode,
    setNodeLabelById,
    setNodePropertiesById,
    setNodeTypeById,
    showNodeEditorHelp,
    toolMode,
    upsertUiToast,
    validateNodeById,
    viewportH,
    viewportW,
    widgetRegistry,
    zoomViewKey,
    connectedValuesByNodeId,
    handlePinnedInCanvasChange,
    overlayEditorNodeIds,
    renderGraphIncidentEdgesByNodeId,
    renderGraphMetaKind,
    renderGraphNodeById,
    renderGraphDataOverride,
    overlayVisibilityActive,
  ])

  const hasOverlayEditors =
    overlayEditorElements.length > 0
    || (workspaceOverlayOpen && overlayEditorNodeIds.length > 0)
  const frontmatterOverlayOnlyCoverageRef = React.useRef<FrontmatterOverlayOnlyCoverageCache | null>(null)
  const frontmatterOverlayVisualIsolation = React.useMemo(() => resolveFrontmatterOverlayVisualIsolationWithStableCoverage({
    frontmatterOverlayOnlyCoverageRef,
    renderGraphDataOverride: frontmatterOverlayAuthorityGraphData,
    frontmatterVisibleSceneDisplay,
    frontmatterRichMediaOverlayNodeIdsSnapshot,
    overlayEditorNodeIdsSnapshot,
    renderGraphEligibleNodeIds,
    renderGraphSemanticKey,
    workspaceMutationBlocked,
  }), [
    frontmatterOverlayAuthorityGraphData, frontmatterVisibleSceneDisplay, frontmatterRichMediaOverlayNodeIdsSnapshot,
    overlayEditorNodeIdsSnapshot, renderGraphEligibleNodeIds, renderGraphSemanticKey, workspaceMutationBlocked,
  ])

  const overlayOnlyActive = resolveOverlayOnlyActive({
    overlayVisibilityActive,
    hasOverlayEditors,
    geospatialWidgetPanelMode,
    frontmatterOverlayVisualIsolation,
    workspaceMutationBlocked,
  })

  const flowCanvasGraphDataOverride = React.useMemo(() => {
    return buildFlowCanvasGraphDataOverride({
      renderGraphDataOverride: frontmatterOverlayAuthorityGraphData,
      frontmatterOverlayVisualIsolation,
      overlayEditorNodeIdsSnapshot,
      overlayOnlyActive,
    })
  }, [
    frontmatterOverlayVisualIsolation.kind,
    frontmatterOverlayVisualIsolation.visibleNodeIds,
    overlayEditorNodeIdsSnapshot,
    overlayOnlyActive,
    frontmatterOverlayAuthorityGraphData,
  ])
  const overlaySurfaceGraphSignature = React.useMemo(() => {
    return [
      String(overlayOnlyActive),
      String(frontmatterOverlayVisualIsolation.kind || ''),
      String(Array.isArray(renderGraphDataOverride?.nodes) ? renderGraphDataOverride.nodes.length : 0),
      String(Array.isArray(frontmatterOverlayAuthorityGraphData?.nodes) ? frontmatterOverlayAuthorityGraphData.nodes.length : 0),
      String(overlayEditorNodeIdsSnapshot.length),
      String(Array.isArray(flowCanvasGraphDataOverride?.nodes) ? flowCanvasGraphDataOverride.nodes.length : 0),
    ].join('::')
  }, [
    flowCanvasGraphDataOverride,
    frontmatterOverlayAuthorityGraphData,
    frontmatterOverlayVisualIsolation.kind,
    overlayEditorNodeIdsSnapshot.length,
    overlayOnlyActive,
    renderGraphDataOverride,
  ])
  const reportedOverlaySurfaceGraphSignatureRef = React.useRef('')
  React.useEffect(() => {
    if (renderGraphPlacementContext?.canvas2dRenderer !== 'storyboard') return
    if (!overlaySurfaceGraphSignature || reportedOverlaySurfaceGraphSignatureRef.current === overlaySurfaceGraphSignature) return
    reportedOverlaySurfaceGraphSignatureRef.current = overlaySurfaceGraphSignature
    // #region debug-point B:overlay-surface-graph-handoff
    reportStoryboardMediaPanelLoopOverlaySurfaceDebug({
      hypothesisId: 'D',
      location: 'useStoryboardWidgetOverlaySurface.tsx:flow-canvas-graph-override',
      msg: 'overlay surface computed flow-canvas graph override for storyboard',
      data: {
        overlayOnlyActive,
        frontmatterOverlayVisualIsolationKind: frontmatterOverlayVisualIsolation.kind,
        renderGraphNodeCount: Array.isArray(renderGraphDataOverride?.nodes) ? renderGraphDataOverride.nodes.length : 0,
        authorityGraphNodeCount: Array.isArray(frontmatterOverlayAuthorityGraphData?.nodes)
          ? frontmatterOverlayAuthorityGraphData.nodes.length
          : 0,
        overlayEditorNodeIds: overlayEditorNodeIdsSnapshot,
        flowCanvasGraphNodeCount: Array.isArray(flowCanvasGraphDataOverride?.nodes) ? flowCanvasGraphDataOverride.nodes.length : 0,
      },
    })
    // #endregion
  }, [
    flowCanvasGraphDataOverride,
    frontmatterOverlayAuthorityGraphData,
    frontmatterOverlayVisualIsolation.kind,
    overlayEditorNodeIdsSnapshot,
    overlayOnlyActive,
    overlaySurfaceGraphSignature,
    renderGraphDataOverride,
    renderGraphPlacementContext?.canvas2dRenderer,
  ])

  return {
    hasOverlayEditors,
    noGraphLoaded: !renderGraphDataOverride,
    overlayEditorElements,
    overlayEditorNodeIds,
    overlayOnlyActive,
    flowCanvasGraphDataOverride,
  }
}
