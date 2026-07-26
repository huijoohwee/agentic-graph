import React from 'react'
import { createPortal } from 'react-dom'
import { deriveStoryboardWidgetViewGraph, type ToolMode } from '@/components/StoryboardWidgetCanvas/storyboardWidgetCanvasShared'
import { useStoryboardWidgetInspectorState } from '@/components/StoryboardWidgetCanvas/runtime/useStoryboardWidgetInspectorState'
import { useStoryboardWidgetRuntimeScene } from '@/components/StoryboardWidgetCanvas/runtime/useStoryboardWidgetRuntimeScene'
import { useStoryboardWidgetRenderState } from '@/components/StoryboardWidgetCanvas/runtime/useStoryboardWidgetRenderState'
import { resolveStoryboardCanvasGraphDataAuthority } from '@/components/StoryboardWidgetCanvas/runtime/storyboardCanvasGraphAuthority'
import { useStoryboardWidgetOverlaySurface } from '@/components/StoryboardWidgetCanvas/runtime/useStoryboardWidgetOverlaySurface'
import { useStoryboardWidgetSurfaceAnchors } from '@/components/StoryboardWidgetCanvas/runtime/useStoryboardWidgetSurfaceAnchors'
import { useStoryboardWidgetDropBridge } from '@/components/StoryboardWidgetCanvas/runtime/useStoryboardWidgetDropBridge'
import { useStoryboardWidgetOverlayCollision } from '@/components/StoryboardWidgetCanvas/runtime/useStoryboardWidgetOverlayCollision'
import { useStoryboardWidgetOverlayEdges } from '@/components/StoryboardWidgetCanvas/runtime/useStoryboardWidgetOverlayEdges'
import { useStoryboardWidgetInspectorSurface } from '@/components/StoryboardWidgetCanvas/runtime/useStoryboardWidgetInspectorSurface'
import { useStoryboardWidgetSelectionBookkeeping } from '@/components/StoryboardWidgetCanvas/runtime/useStoryboardWidgetSelectionBookkeeping'
import { useStoryboardWidgetNodeDraftActions } from '@/components/StoryboardWidgetCanvas/runtime/useStoryboardWidgetNodeDraftActions'
import { useStoryboardWidgetGraphActions } from '@/components/StoryboardWidgetCanvas/runtime/useStoryboardWidgetGraphActions'
import { useStoryboardWidgetWorkflowActions } from '@/components/StoryboardWidgetCanvas/runtime/useStoryboardWidgetWorkflowActions'
import { useStoryboardWidgetRuntimeStoreState } from '@/components/StoryboardWidgetCanvas/runtime/useStoryboardWidgetRuntimeStoreState'
import { resolveStoryboardWidgetAutoRunNodeIds } from '@/components/StoryboardWidgetCanvas/runtime/storyboardWidgetAutoRunTargets'
import StoryboardWidgetCanvasSurface from '@/components/StoryboardWidgetCanvas/runtime/StoryboardWidgetCanvasSurface'
import { useContainerDims } from '@/hooks/useContainerDims'
import { useGraphStore } from '@/hooks/useGraphStore'
import type { GraphData, GraphNode } from '@/lib/graph/types'
import { buildActive2dZoomViewKey } from '@/lib/canvas/active-2d-zoom-view-key'
import { buildCollapsedGroupIdsKey } from '@/lib/canvas/collapsedGroupIdsKey'
import { resolveCanvasViewportMeasureElement } from '@/lib/canvas/viewportMeasureElement'
import { buildDataflowWidgetRegistry } from '@/lib/storyboardWidget/widgetRegistryDataflow'
import { isFrontmatterFlowGraph } from '@/lib/graph/frontmatterMode'
import { isFrontmatterOnlyPolicyActive } from '@/lib/config.render'
import {
  buildOverlayNodeLayoutSignature,
  buildOverlayTopologyLayoutSignature,
} from '@/lib/storyboardWidget/overlayTopologyLayoutSignature'
import { hashSignatureParts } from '@/lib/hash/signature'
import { buildCanvasAppliedMarkdownDocumentIdentityKey, useCanvasAppliedMarkdownDocument } from '@/features/canvas/useCanvasAppliedMarkdownDocument'
import { resolveRichMediaWidgetKind } from '@/features/chat/richMediaRun'
import { isCanonicalNodeIdEqual, resolveGraphNodeByCanonicalId } from '@/lib/graph/canonicalNodeIds'
import { appendPendingOverlayNodesToGraphData, resolvePendingOverlayGraphDataBase } from '@/components/StoryboardWidgetCanvas/runtime/storyboardWidgetPendingOverlayGraph'
import { useNativeCrawlerWorkflowRecovery } from '@/components/StoryboardWidgetCanvas/runtime/useNativeCrawlerWorkflowRecovery'
import { useTextWidgetOutputArtifactRecovery } from '@/components/StoryboardWidgetCanvas/runtime/useTextWidgetOutputArtifactRecovery'
import { useStoryboardCardMediaGraphCommit } from '@/components/StoryboardWidgetCanvas/runtime/useStoryboardCardMediaGraphCommit'
import { reportRuntimeTrace } from '@/lib/debug/runtimeTrace'
import { buildStoryboardBoardModel } from '@/components/StoryboardCanvas/storyboardModel'
import { isStoryboardFixedCardOwnedNode } from '@/components/StoryboardWidgetCanvas/storyboardCardOwnership2d'
import { readCanvasCardWidgetDisplayMode } from '@/lib/canvas/canvasCardWidgetDisplayControls'
// #region debug-point A:runtime-storyboard-graph-handoff
const STORYBOARD_MEDIA_PANEL_LOOP_TRACE_SCOPE = 'storyboard-media-panel-loop'
const reportStoryboardMediaPanelLoopRuntimeDebug = (args: {
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
export default function StoryboardWidgetCanvasRuntime(
  {
    active = true,
    storyboardWidgetSurfaceId: storyboardWidgetSurfaceIdProp,
    storyboardCardsMode = false,
    widgetDropCaptureEnabled = false,
    geospatialWidgetPanelMode = false,
  }: {
    active?: boolean
    storyboardWidgetSurfaceId?: string
    storyboardCardsMode?: boolean
    widgetDropCaptureEnabled?: boolean
    geospatialWidgetPanelMode?: boolean
  },
) {
  const storyboardWidgetSurfaceIdRef = React.useRef<string>('')
  if (!storyboardWidgetSurfaceIdRef.current) {
    const providedSurfaceId = String(storyboardWidgetSurfaceIdProp || '').trim()
    storyboardWidgetSurfaceIdRef.current = providedSurfaceId || `kgfe-${Math.random().toString(36).slice(2, 10)}`
  }
  const storyboardWidgetSurfaceId = storyboardWidgetSurfaceIdRef.current
  const editorRuntimeActive = active
  // In geospatial/widget-drop bridge mode, keep only drop capture and forbid
  // Storyboard Widget runtime layout/edge/collision effects from mutating canvas state.
  const widgetDropBridgeOnly = widgetDropCaptureEnabled && !active
  const rootRef = React.useRef<HTMLElement | null>(null)
  const { width, height, left: containerLeft, top: containerTop } = useContainerDims(rootRef, {
    resolveMeasureElement: resolveCanvasViewportMeasureElement,
  })
  const viewportW = Math.max(1, Math.floor(width))
  const viewportH = Math.max(1, Math.floor(height))

  const {
    addEdge, addNode, addNodesToUserSubgraph, baseGraphData, baseGraphDataRevision,
    baseWidgetRegistry, canvasRenderMode, canvas2dRenderer, canvasRunMode, collapsedGroupIds, createUserSubgraph,
    documentSemanticMode, documentStructureBaselineLock, documentWidgetRegistry, effectiveWidgetRegistry,
    storyboardWidgetLayoutRebalanceRequest, flowWidgetPinnedByNodeId, frontmatterModeEnabled, graphContentRevision, markdownDocumentName,
    markdownDocumentApplyRevision, markdownDocumentApplyViewPreset, markdownDocumentSourceUrl, markdownDocumentText, mediaPanelDensity, openWidgetNodeIds, removeNodesFromUserSubgraph,
    removeUserSubgraph, renderMediaAsNodes, resolvedThemeMode, schema, selectEdge, selectGroup,
    selectNode, selectedEdgeId, selectedNodeId, selectedNodeIds, setGraphDataPreservingLayout,
    setOpenWidgetNodeIds, setSchema, setSelectionSource, toggleGroupCollapsed, updateEdge, updateNode,
    updateOpenWidgetNodeIds, updateUserSubgraph, upsertUiToast, workspaceMutationBlocked,
  } = useStoryboardWidgetRuntimeStoreState()
  const strybldrStoryboardDisplayMode = useGraphStore(s => s.strybldrStoryboardDisplayMode)
  const historyRestoreRevision = useGraphStore(s => s.historyRestoreRevision)
  const storyboardDisplayMode = readCanvasCardWidgetDisplayMode(strybldrStoryboardDisplayMode)
  const storyboardCardDisplayActive = storyboardCardsMode && storyboardDisplayMode === 'card'
  const storyboardWidgetDisplayActive = storyboardCardsMode && storyboardDisplayMode === 'widget'
  const runWorkflowNodeRef = React.useRef<((nodeId: string) => Promise<void> | void) | null>(null)
  const setSelectionSourceForActions = React.useCallback(
    (source: 'canvas' | 'menu' | 'toolbar' | 'editor' | 'unknown' | 'system') => {
      setSelectionSource(source === 'canvas' || source === 'toolbar' ? source : 'editor')
    },
    [setSelectionSource],
  )

  const baseGraphKind = React.useMemo(() => {
    if (baseGraphData && isFrontmatterFlowGraph(baseGraphData as unknown as GraphData)) return 'frontmatter-flow'
    const meta = (baseGraphData?.metadata || {}) as Record<string, unknown>
    const byKind = String(meta.kind || '').trim()
    if (byKind) return byKind
    return String(baseGraphData?.context || '').trim()
  }, [baseGraphData])
  const storyboardWidgetFrontmatterGraphAvailable = React.useMemo(
    () => (baseGraphData ? isFrontmatterFlowGraph(baseGraphData as unknown as GraphData) : false),
    [baseGraphData],
  )
  const frontmatterOnlyPolicyActive = React.useMemo(
    () => isFrontmatterOnlyPolicyActive({ canvasRenderMode, canvas2dRenderer }),
    [canvas2dRenderer, canvasRenderMode],
  )
  const canvasMarkdownDocument = useCanvasAppliedMarkdownDocument({
    name: markdownDocumentName,
    sourceUrl: markdownDocumentSourceUrl,
    text: markdownDocumentText,
    applyViewPreset: markdownDocumentApplyViewPreset !== false,
  })
  const activeDocumentKey = React.useMemo(() => {
    return [buildCanvasAppliedMarkdownDocumentIdentityKey({ name: canvasMarkdownDocument.name, sourceUrl: canvasMarkdownDocument.sourceUrl }), String(markdownDocumentApplyRevision || 0)].join('::')
  }, [canvasMarkdownDocument.name, canvasMarkdownDocument.sourceUrl, markdownDocumentApplyRevision])
  const storyboardWidgetViewActive = editorRuntimeActive
  const canInteract = editorRuntimeActive
  const canEdit = editorRuntimeActive && !documentStructureBaselineLock
  const { canvasWindowOffset, canvasWindowOffsetRef, inspectorPortalHost, setCanvasWindowOffsetFromRect } = useStoryboardWidgetSurfaceAnchors({
    active,
    editorRuntimeActive,
    rootRef,
  })
  const collapsedGroupIdsKey = React.useMemo(() => buildCollapsedGroupIdsKey(collapsedGroupIds), [collapsedGroupIds])
  const collapsedGroupIdsForView = React.useMemo(() => (collapsedGroupIdsKey ? collapsedGroupIdsKey.split('|').filter(Boolean) : []), [collapsedGroupIdsKey])
  const zoomGraphData = React.useMemo(
    (): GraphData | null => deriveStoryboardWidgetViewGraph({
      graphData: (baseGraphData || null) as GraphData | null,
      collapsedGroupIds: collapsedGroupIdsForView,
      forceFrontmatterFlow: frontmatterOnlyPolicyActive,
    }),
    [baseGraphData, collapsedGroupIdsForView, frontmatterOnlyPolicyActive],
  )
  const storyboardWidgetBaseGraphData = React.useMemo(
    (): GraphData | null => deriveStoryboardWidgetViewGraph({
      graphData: (baseGraphData || null) as GraphData | null,
      collapsedGroupIds: [],
      forceFrontmatterFlow: frontmatterOnlyPolicyActive,
    }),
    [baseGraphData, frontmatterOnlyPolicyActive],
  )

  const zoomViewKey = React.useMemo(() => {
    return buildActive2dZoomViewKey({
      canvasRenderMode,
      canvas2dRenderer,
      schema,
      graphData: zoomGraphData,
      documentSemanticMode,
      frontmatterModeEnabled,
      documentStructureBaselineLock,
      renderMediaAsNodes,
      mediaPanelDensity,
      collapsedGroupIds,
    })
  }, [
    canvas2dRenderer,
    canvasRenderMode,
    collapsedGroupIds,
    documentSemanticMode,
    documentStructureBaselineLock,
    frontmatterModeEnabled,
    mediaPanelDensity,
    renderMediaAsNodes,
    schema,
    zoomGraphData,
  ])

  const zoomViewKeyRef = React.useRef<string | null>(zoomViewKey)
  React.useEffect(() => {
    zoomViewKeyRef.current = zoomViewKey
  }, [zoomViewKey])

  const widgetRegistry = React.useMemo(
    () => buildDataflowWidgetRegistry({ documentWidgetRegistry, effectiveWidgetRegistry, widgetRegistry: baseWidgetRegistry }),
    [baseWidgetRegistry, documentWidgetRegistry, effectiveWidgetRegistry],
  )
  const widgetRegistryRef = React.useRef(widgetRegistry)
  const lastWidgetDropRef = React.useRef<{ key: string; ts: number } | null>(null)
  const lastDroppedWidgetNodeIdRef = React.useRef<string | null>(null)
  const [lastDroppedWidgetToken, setLastDroppedWidgetToken] = React.useState<number>(0)

  const openWidgetNodeIdsRef = React.useRef(openWidgetNodeIds)
  const overlayEditorNodeIdsRef = React.useRef<string[]>([])

  React.useEffect(() => {
    openWidgetNodeIdsRef.current = openWidgetNodeIds
  }, [openWidgetNodeIds])

  const [toolMode, setToolMode] = React.useState<ToolMode>('select')
  const [pendingEdgeSourceId, setPendingEdgeSourceId] = React.useState<string | null>(null)
  const [pendingEdgeSourceIds, setPendingEdgeSourceIds] = React.useState<string[]>([])
  const [pendingEdgeSourcePortKey, setPendingEdgeSourcePortKey] = React.useState<string | null>(null)
  const pendingSelectNodeIdRef = React.useRef<string | null>(null)
  const pendingOpenWidgetNodeIdRef = React.useRef<string | null>(null)
  const [overlayNodeIdOverride, setOverlayNodeIdOverride] = React.useState<string | null>(null)
  const [pendingOverlayNode, setPendingOverlayNode] = React.useState<GraphNode | null>(null)
  const [pendingOverlayNodesById, setPendingOverlayNodesById] = React.useState<Record<string, GraphNode>>({})
  const pendingOverlayNodeIdRef = React.useRef<string | null>(null)
  const registerPendingOverlayNode = React.useCallback<React.Dispatch<React.SetStateAction<GraphNode | null>>>((nextPendingNode) => {
    setPendingOverlayNode(nextPendingNode)
  }, [])
  React.useEffect(() => {
    const id = String(pendingOverlayNode?.id || '').trim()
    if (!id || !pendingOverlayNode) return
    setPendingOverlayNodesById(prevNodes => {
      if (prevNodes[id] === pendingOverlayNode) return prevNodes
      return { ...prevNodes, [id]: pendingOverlayNode }
    })
  }, [pendingOverlayNode])
  const removePendingOverlayNodeById = React.useCallback((nodeId: string) => {
    const id = String(nodeId || '').trim()
    if (!id) return
    setPendingOverlayNodesById(prevNodes => {
      const matchingId = Object.keys(prevNodes).find(candidateId => isCanonicalNodeIdEqual(candidateId, id))
      if (!matchingId) return prevNodes
      const nextNodes = { ...prevNodes }
      delete nextNodes[matchingId]
      return nextNodes
    })
    if (isCanonicalNodeIdEqual(pendingOverlayNodeIdRef.current, id)) pendingOverlayNodeIdRef.current = null
    setPendingOverlayNode(prevNode => isCanonicalNodeIdEqual(prevNode?.id, id) ? null : prevNode)
  }, [])
  const overlayNodeIdOverrideWasSelectedRef = React.useRef(false)
  const overlayNodeIdOverrideUntilMsRef = React.useRef<number>(0)
  const reservedNodeIdsRef = React.useRef<Set<string>>(new Set())
  const forceSelectRef = React.useRef<{ id: string; remaining: number; untilMs: number } | null>(null)
  const forceSelectTimerRef = React.useRef<number | null>(null)
  const {
    draftGraphData,
    draftGraphDataRef,
    draftGraphDataRevision,
    frontmatterFlowRenderSettings,
    renderGraphDataOverride,
    selectedDraftEdge,
    setDraftGraphData,
  } = useStoryboardWidgetRenderState({
    active,
    editorRuntimeActive,
    storyboardWidgetViewActive,
    workspaceMutationBlocked,
    baseGraphData: (baseGraphData || null) as GraphData | null,
    baseGraphDataRevision,
    storyboardWidgetBaseGraphData,
    collapsedGroupIdsForView,
    frontmatterOnlyPolicyActive,
    activeDocumentKey,
    selectedEdgeId,
    historyRestoreRevision,
    preferDraftGraphData: storyboardCardsMode,
  })
  const { publishStoryboardCardMediaGraph, commitStoryboardCardMediaGraph, commitStoryboardCardMediaGraphForSurface, persistPublishedStoryboardCardMediaGraphForSurface } = useStoryboardCardMediaGraphCommit({ baseRevision: baseGraphDataRevision, draftRevision: draftGraphDataRevision, draftGraphDataRef, setDraftGraphData, setGraphDataPreservingLayout, sourceOwner: { documentName: markdownDocumentName, documentText: markdownDocumentText }, upsertUiToast })
  const storyboardCanvasGraphDataForDisplay = React.useMemo((): GraphData | null => {
    if (!storyboardCardsMode) return null
    return resolveStoryboardCanvasGraphDataAuthority({
      baseGraphData,
      draftGraphData,
      renderGraphData: renderGraphDataOverride,
    })
  }, [
    baseGraphData,
    draftGraphData,
    renderGraphDataOverride,
    storyboardCardsMode,
  ])
  const storyboardWidgetNodeIds = React.useMemo((): string[] => {
    if (!storyboardWidgetDisplayActive) return []
    const board = buildStoryboardBoardModel({
      graphData: storyboardCanvasGraphDataForDisplay,
      graphRevision: draftGraphDataRevision || baseGraphDataRevision || 0,
      widgetRegistry,
    })
    const nodeById = new Map<string, GraphNode>()
    const nodes = Array.isArray(storyboardCanvasGraphDataForDisplay?.nodes) ? storyboardCanvasGraphDataForDisplay.nodes as GraphNode[] : []
    for (let i = 0; i < nodes.length; i += 1) {
      const node = nodes[i]
      const id = String(node?.id || '').trim()
      if (id) nodeById.set(id, node)
    }
    return board.lanes
      .flatMap(lane => lane.cards.map(card => String(card.id || '').trim()))
      .filter(id => id && isStoryboardFixedCardOwnedNode(resolveGraphNodeByCanonicalId(storyboardCanvasGraphDataForDisplay, id) || nodeById.get(id)))
  }, [baseGraphDataRevision, draftGraphDataRevision, storyboardCanvasGraphDataForDisplay, storyboardWidgetDisplayActive, widgetRegistry])
  const overlayOpenWidgetNodeIds = React.useMemo(() => {
    if (storyboardCardDisplayActive) return []
    if (!storyboardWidgetDisplayActive) return openWidgetNodeIds
    const next: string[] = []
    const seen = new Set<string>()
    const pushId = (rawId: unknown) => {
      const id = String(rawId || '').trim()
      if (!id || seen.has(id)) return
      seen.add(id)
      next.push(id)
    }
    for (let i = 0; i < storyboardWidgetNodeIds.length; i += 1) pushId(storyboardWidgetNodeIds[i])
    for (let i = 0; i < openWidgetNodeIds.length; i += 1) pushId(openWidgetNodeIds[i])
    return next
  }, [openWidgetNodeIds, storyboardCardDisplayActive, storyboardCanvasGraphDataForDisplay, storyboardWidgetDisplayActive, storyboardWidgetNodeIds])
  const overlayRenderGraphDataOverride = storyboardCardsMode ? storyboardCanvasGraphDataForDisplay : renderGraphDataOverride
  const overlayTopologyLayoutSignature = React.useMemo(() => {
    const graphDataForOverlayRuntime =
      draftGraphData
      || overlayRenderGraphDataOverride
      || storyboardWidgetBaseGraphData
      || baseGraphData
      || null
    return buildOverlayTopologyLayoutSignature(graphDataForOverlayRuntime)
  }, [baseGraphData, draftGraphData, storyboardWidgetBaseGraphData, overlayRenderGraphDataOverride])
  const overlayNodeLayoutSignature = React.useMemo(() => {
    const graphDataForOverlayRuntime =
      draftGraphData
      || overlayRenderGraphDataOverride
      || storyboardWidgetBaseGraphData
      || baseGraphData
      || null
    return buildOverlayNodeLayoutSignature(graphDataForOverlayRuntime)
  }, [baseGraphData, draftGraphData, storyboardWidgetBaseGraphData, overlayRenderGraphDataOverride])

  const {
    emitStoryboardWidgetInteractionFrame,
    flowRuntimeRefRef,
    getLiveContainmentGroupAabbForNode,
    getLiveNodeWorldPos,
    getLiveZoomTransform,
  } = useStoryboardWidgetRuntimeScene({
    active,
    storyboardWidgetSurfaceId,
    openWidgetNodeIds: overlayOpenWidgetNodeIds,
    draftGraphDataRef,
    renderGraphDataOverride: overlayRenderGraphDataOverride,
    viewportW,
    viewportH,
    schema,
    overlayNodeLayoutSignature,
    storyboardWidgetLayoutRebalanceRequest,
    zoomViewKeyRef,
  })

  const overlayOnlyModeEnabled = React.useMemo(() => {
    return storyboardWidgetViewActive
  }, [storyboardWidgetViewActive])

  const overlayEdgesEnabledRef = React.useRef(false)

  const { scheduleOverlayCollisionResolve } = useStoryboardWidgetOverlayCollision({
    editorRuntimeActive,
    overlayOnlyModeEnabled,
    renderGraphDataOverride: overlayRenderGraphDataOverride,
    schema,
    selectedNodeId,
    lastDroppedWidgetNodeIdRef,
    viewportW,
    viewportH,
    canvasWindowOffset,
    canvasWindowOffsetRef,
    zoomViewKeyRef,
    draftGraphDataRef,
    frontmatterFlowRenderSettings,
    getLiveNodeWorldPos,
    getLiveZoomTransform,
    storyboardWidgetSurfaceId,
    graphContentRevision,
  })

  const { overlayEdgesSvgRef, scheduleOverlayEdgeUpdate } = useStoryboardWidgetOverlayEdges({
    active,
    overlayOnlyModeEnabled,
    resolvedThemeMode,
    overlayEdgesEnabledRef,
    storyboardWidgetSurfaceId,
    rootRef,
    draftGraphDataRef,
    renderGraphDataOverride: overlayRenderGraphDataOverride,
    fixedCardsOwnGraphAuthority: storyboardCardsMode,
    overlayEditorNodeIdsRef,
    openWidgetNodeIdsRef,
    pendingOverlayNodeIdRef,
    widgetRegistryRef,
    schema,
    toolMode,
    pendingEdgeSourceId,
    pendingEdgeSourceIds,
    pendingEdgeSourcePortKey,
    frontmatterFlowRenderSettings,
  })

  const {
    overlayDraftNode,
    scheduleForceSelect,
    selectedDraftNode,
    shouldDedupeWidgetDrop,
  } = useStoryboardWidgetSelectionBookkeeping({
    active,
    editorRuntimeActive,
    storyboardWidgetViewActive,
    canvas2dRenderer,
    overlayOnlyModeEnabled,
    storyboardWidgetFrontmatterGraphAvailable,
    widgetRegistry,
    draftGraphData,
    renderGraphDataOverride: overlayRenderGraphDataOverride,
    selectedNodeId,
    overlayNodeIdOverride,
    pendingOverlayNode,
    openWidgetNodeIdsRef,
    draftGraphDataRef,
    widgetRegistryRef,
    lastWidgetDropRef,
    forceSelectRef,
    forceSelectTimerRef,
    pendingSelectNodeIdRef,
    reservedNodeIdsRef,
    pendingOpenWidgetNodeIdRef,
    pendingOverlayNodeIdRef,
    overlayNodeIdOverrideWasSelectedRef,
    overlayNodeIdOverrideUntilMsRef,
    setOpenWidgetNodeIds,
    updateOpenWidgetNodeIds,
    setOverlayNodeIdOverride,
  })

  const { appendDraftEdge, appendDraftNode, beginAddEdgeFromNode, cancelPendingEdge, finalizePendingEdge } = useStoryboardWidgetGraphActions({
    active,
    draftGraphData,
    draftGraphDataRef, setDraftGraphData,
    baseGraphData: (baseGraphData || null) as GraphData | null,
    schema,
    selectedNodeId,
    selectedNodeIds,
    toolMode,
    pendingEdgeSourceId,
    pendingEdgeSourceIds,
    pendingEdgeSourcePortKey, extraGraphNodesById: pendingOverlayNodesById,
    pendingSelectNodeIdRef,
    setSelectionSource: setSelectionSourceForActions,
    selectNode,
    selectEdge,
    addEdge,
    addNode,
    persistDraftGraphData: persistPublishedStoryboardCardMediaGraphForSurface,
    setToolMode,
    setPendingEdgeSourceId,
    setPendingEdgeSourceIds,
    setPendingEdgeSourcePortKey,
    upsertUiToast,
  })

  const { addNodeFromRegistryAtWorld, addRichMediaPanelFromMediaAtWorld } = useStoryboardWidgetDropBridge({
    active,
    widgetDropCaptureEnabled,
    widgetDropBridgeOnly,
    geospatialWidgetPanelMode,
    rootRef,
    widgetRegistryRef,
    baseGraphData,
    draftGraphDataRef,
    reservedNodeIdsRef,
    pendingOverlayNodeIdRef,
    pendingOpenWidgetNodeIdRef,
    overlayNodeIdOverrideWasSelectedRef,
    overlayNodeIdOverrideUntilMsRef,
    lastDroppedWidgetNodeIdRef,
    zoomViewKeyRef,
    getLiveZoomTransform,
    appendDraftNode,
    appendDraftEdge,
    updateNode,
    shouldDedupeWidgetDrop,
    scheduleForceSelect,
    setCanvasWindowOffsetFromRect,
    setOverlayNodeIdOverride,
    setPendingOverlayNode: registerPendingOverlayNode,
    setLastDroppedWidgetToken,
    upsertUiToast,
  })

  const {
    edgeMetaJson,
    edgePropsJson,
    inspectorTab,
    jsonError,
    nodeMetaJson,
    nodePropsJson,
    setEdgeMetaJson,
    setEdgePropsJson,
    setInspectorTab,
    setJsonError,
    setNodeMetaJson,
    setNodePropsJson,
    setWorkflowContextJson,
    setWorkflowMetaJson,
    workflowContextJson,
    workflowMetaJson,
  } = useStoryboardWidgetInspectorState({
    active,
    draftGraphData,
    selectedDraftNode,
    selectedDraftEdge,
  })
  const handleNodePropertiesCommittedForAutoRun = React.useCallback((nodeId: string, changedPropertyKeys?: ReadonlyArray<string>) => {
    if (canvasRunMode !== 'auto') return
    const id = String(nodeId || '').trim()
    if (!id) return
    const run = () => {
      if (runWorkflowNodeRef.current == null) return
      const graphData = (draftGraphDataRef.current || draftGraphData || baseGraphData || null) as GraphData | null
      const targetNodeIds = resolveStoryboardWidgetAutoRunNodeIds({
        graphData,
        nodeId: id,
        changedPropertyKeys,
        resolveRichMediaKind: resolveRichMediaWidgetKind,
      })
      for (const targetNodeId of targetNodeIds) {
        void runWorkflowNodeRef.current(targetNodeId)
      }
    }
    if (typeof queueMicrotask === 'function') {
      queueMicrotask(run)
      return
    }
    void Promise.resolve().then(run)
  }, [baseGraphData, canvasRunMode, draftGraphData, draftGraphDataRef])

  const {
    applyJsonToDraft,
    clearNodeOutputById,
    convertNodeToLoopById,
    duplicateNodeById,
    enableHandlesForAllInputs,
    patchNodeById,
    patchNodePropertiesById,
    patchSelectedNodeProperties,
    removeNodeById,
    renameSchemaFieldIdByNodeId,
    setNodeLabelById,
    setNodePropertiesById,
    setNodeTypeById,
    setSelectedEdgeLabel,
    setSelectedNodeLabel,
    setSelectedNodeType,
    showNodeEditorHelp,
    validateNodeById,
  } = useStoryboardWidgetNodeDraftActions({
    active,
    draftGraphData,
    draftGraphDataRef,
    setDraftGraphData,
    baseGraphData,
    selectedNodeId,
    selectedEdgeId,
    documentStructureBaselineLock,
    schema,
    setSchema,
    addNode,
    updateNode,
    updateEdge,
    selectNode,
    selectEdge,
    setSelectionSource: setSelectionSourceForActions,
    setGraphDataPreservingLayout,
    updateOpenWidgetNodeIds,
    persistCommittedNodeProperties: persistPublishedStoryboardCardMediaGraphForSurface,
    onNodePropertiesCommittedForAutoRun: handleNodePropertiesCommittedForAutoRun,
    upsertUiToast,
    nodePropsJson,
    nodeMetaJson,
    edgePropsJson,
    edgeMetaJson,
    workflowMetaJson,
    workflowContextJson,
    setJsonError,
  })
  const { exportWorkflowBundle, runWorkflowNode } = useStoryboardWidgetWorkflowActions({
    storyboardWidgetViewActive,
    baseGraphKind,
    baseGraphData: (baseGraphData || null) as GraphData | null,
    draftGraphData,
    draftGraphDataRef,
    renderGraphDataOverride,
    markdownDocumentName,
    markdownDocumentSourceUrl,
    widgetRegistry,
    appendDraftNode,
    setDraftGraphData,
    commitPublishedGraphData: publishStoryboardCardMediaGraph,
    persistDraftGraphData: commitStoryboardCardMediaGraph,
    updateNode,
    upsertUiToast,
    scheduleOverlayEdgeUpdate,
  })
  runWorkflowNodeRef.current = runWorkflowNode
  useNativeCrawlerWorkflowRecovery({ active: storyboardWidgetViewActive, graphData: draftGraphDataRef.current || draftGraphData, documentName: markdownDocumentName, runNode: runWorkflowNode })
  useTextWidgetOutputArtifactRecovery({ active: storyboardWidgetViewActive, graphData: storyboardCanvasGraphDataForDisplay || draftGraphDataRef.current || draftGraphData, latestGraphDataRef: draftGraphDataRef, documentName: markdownDocumentName, commitGraphData: commitStoryboardCardMediaGraph })
  const { inspectorElement } = useStoryboardWidgetInspectorSurface({
    active,
    baseGraphData,
    draftGraphData,
    selectedDraftNode,
    selectedDraftEdge,
    selectedNodeId,
    selectedNodeIds,
    collapsedGroupIds,
    inspectorTab,
    setInspectorTab,
    createUserSubgraph,
    updateUserSubgraph,
    removeUserSubgraph,
    addNodesToUserSubgraph,
    removeNodesFromUserSubgraph,
    toggleGroupCollapsed,
    setSelectionSource: setSelectionSourceForActions,
    selectNode,
    selectEdge,
    selectGroup,
    runWorkflowNode,
    exportWorkflowBundle,
    jsonError,
    nodePropsJson,
    setNodePropsJson,
    nodeMetaJson,
    setNodeMetaJson,
    edgePropsJson,
    setEdgePropsJson,
    edgeMetaJson,
    setEdgeMetaJson,
    workflowMetaJson,
    setWorkflowMetaJson,
    workflowContextJson,
    setWorkflowContextJson,
    setSelectedNodeLabel,
    patchSelectedNodeProperties,
    setSelectedNodeType,
    setSelectedEdgeLabel,
    applyJsonToDraft,
    upsertUiToast,
  })

  const {
    hasOverlayEditors,
    noGraphLoaded,
    overlayEditorElements,
    overlayEditorNodeIds,
    overlayOnlyActive,
    flowCanvasGraphDataOverride,
  } = useStoryboardWidgetOverlaySurface({
    storyboardWidgetSurfaceId,
    canEdit,
    storyboardWidgetViewActive,
    storyboardWidgetFrontmatterGraphAvailable, editorSurfaceKind: storyboardCardDisplayActive ? 'card' : 'widget',
    geospatialWidgetPanelMode,
    renderGraphDataOverride: overlayRenderGraphDataOverride,
    draftGraphDataRef,
    baseGraphDataRevision,
    draftGraphDataRevision,
    overlayTopologyLayoutSignature,
    openWidgetNodeIds: overlayOpenWidgetNodeIds,
    allowExplicitOpenWidgetNodeIds: storyboardWidgetDisplayActive,
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
  })
  const overlayEditorNodeIdsKey = React.useMemo(() => {
    return hashSignatureParts(['overlay-editor-node-ids', ...overlayEditorNodeIds])
  }, [overlayEditorNodeIds])
  React.useEffect(() => {
    overlayEditorNodeIdsRef.current = overlayEditorNodeIds
  }, [overlayEditorNodeIds])
  const overlayEdgeHostActive = overlayOnlyActive || hasOverlayEditors || storyboardCardsMode
  React.useEffect(() => {
    overlayEdgesEnabledRef.current = overlayEdgeHostActive
    if (!overlayEdgeHostActive) return
    scheduleOverlayEdgeUpdate()
  }, [overlayEdgeHostActive, overlayEditorNodeIdsKey, overlayTopologyLayoutSignature, scheduleOverlayEdgeUpdate])
  const flowCanvasGraphDataWithPendingOverlays = React.useMemo(
    () => appendPendingOverlayNodesToGraphData(resolvePendingOverlayGraphDataBase({ baseGraphData, draftGraphData, flowCanvasGraphDataOverride, renderGraphDataOverride, storyboardCardsMode }), pendingOverlayNodesById),
    [baseGraphData, draftGraphData, flowCanvasGraphDataOverride, pendingOverlayNodesById, renderGraphDataOverride, storyboardCardsMode],
  )
  React.useEffect(() => {
    const pendingOverlayStillSelectedOrOpen = (id: string): boolean => {
      const selected = String(selectedNodeId || '').trim()
      if (selected && isCanonicalNodeIdEqual(selected, id)) return true
      const pendingSelectedId = String(pendingSelectNodeIdRef.current || '').trim()
      if (pendingSelectedId && isCanonicalNodeIdEqual(pendingSelectedId, id)) return true
      const pendingOpenId = String(pendingOpenWidgetNodeIdRef.current || '').trim()
      if (pendingOpenId && isCanonicalNodeIdEqual(pendingOpenId, id)) return true
      for (let i = 0; i < openWidgetNodeIds.length; i += 1) {
        if (isCanonicalNodeIdEqual(openWidgetNodeIds[i], id)) return true
      }
      return false
    }
    setPendingOverlayNodesById(prev => {
      let next: Record<string, GraphNode> | null = null
      for (const id of Object.keys(prev)) {
        if (!resolveGraphNodeByCanonicalId(baseGraphData, id) && pendingOverlayStillSelectedOrOpen(id)) continue
        if (!next) next = { ...prev }
        delete next[id]
      }
      return next || prev
    })
    const pendingId = String(pendingOverlayNodeIdRef.current || '').trim()
    if (!pendingId) return
    if (!resolveGraphNodeByCanonicalId(baseGraphData, pendingId) && (pendingOverlayNode || pendingOverlayStillSelectedOrOpen(pendingId))) return
    pendingOverlayNodeIdRef.current = null
    setPendingOverlayNode(null)
  }, [baseGraphData, openWidgetNodeIds, pendingOverlayNode, selectedNodeId, storyboardCardsMode])
  const storyboardCanvasGraphDataOverride = storyboardCardDisplayActive
    ? appendPendingOverlayNodesToGraphData(storyboardCanvasGraphDataForDisplay, pendingOverlayNodesById) || storyboardCanvasGraphDataForDisplay
    : storyboardCardsMode
      ? (flowCanvasGraphDataWithPendingOverlays || storyboardCanvasGraphDataForDisplay)
      : flowCanvasGraphDataWithPendingOverlays
  const storyboardRuntimeGraphSignature = React.useMemo(() => {
    return [
      String(storyboardCardsMode),
      String(Array.isArray(baseGraphData?.nodes) ? baseGraphData.nodes.length : 0),
      String(Array.isArray(draftGraphData?.nodes) ? draftGraphData.nodes.length : 0),
      String(Array.isArray(renderGraphDataOverride?.nodes) ? renderGraphDataOverride.nodes.length : 0),
      String(Array.isArray(flowCanvasGraphDataOverride?.nodes) ? flowCanvasGraphDataOverride.nodes.length : 0),
      String(Object.keys(pendingOverlayNodesById).length),
      String(Array.isArray(flowCanvasGraphDataWithPendingOverlays?.nodes) ? flowCanvasGraphDataWithPendingOverlays.nodes.length : 0),
      String(Array.isArray(storyboardCanvasGraphDataOverride?.nodes) ? storyboardCanvasGraphDataOverride.nodes.length : 0),
    ].join('::')
  }, [
    baseGraphData,
    draftGraphData,
    flowCanvasGraphDataOverride,
    flowCanvasGraphDataWithPendingOverlays,
    pendingOverlayNodesById,
    renderGraphDataOverride,
    storyboardCanvasGraphDataOverride,
    storyboardCardsMode,
  ])
  const reportedStoryboardRuntimeGraphSignatureRef = React.useRef('')
  React.useEffect(() => {
    if (!storyboardCardsMode) return
    if (!storyboardRuntimeGraphSignature || reportedStoryboardRuntimeGraphSignatureRef.current === storyboardRuntimeGraphSignature) return
    reportedStoryboardRuntimeGraphSignatureRef.current = storyboardRuntimeGraphSignature
    // #region debug-point B:runtime-storyboard-graph-handoff
    reportStoryboardMediaPanelLoopRuntimeDebug({
      hypothesisId: 'D',
      location: 'StoryboardWidgetCanvas.runtime.tsx:storyboard-source-graph',
      msg: 'runtime prepared storyboard source graph override',
      data: {
        baseGraphNodeCount: Array.isArray(baseGraphData?.nodes) ? baseGraphData.nodes.length : 0,
        draftGraphNodeCount: Array.isArray(draftGraphData?.nodes) ? draftGraphData.nodes.length : 0,
        renderGraphNodeCount: Array.isArray(renderGraphDataOverride?.nodes) ? renderGraphDataOverride.nodes.length : 0,
        flowCanvasGraphNodeCount: Array.isArray(flowCanvasGraphDataOverride?.nodes) ? flowCanvasGraphDataOverride.nodes.length : 0,
        pendingOverlayNodeIds: Object.keys(pendingOverlayNodesById),
        flowCanvasGraphWithPendingNodeCount: Array.isArray(flowCanvasGraphDataWithPendingOverlays?.nodes)
          ? flowCanvasGraphDataWithPendingOverlays.nodes.length
          : 0,
        storyboardSourceGraphNodeCount: Array.isArray(storyboardCanvasGraphDataOverride?.nodes)
          ? storyboardCanvasGraphDataOverride.nodes.length
          : 0,
      },
    })
    // #endregion
  }, [
    baseGraphData,
    draftGraphData,
    flowCanvasGraphDataOverride,
    flowCanvasGraphDataWithPendingOverlays,
    pendingOverlayNodesById,
    renderGraphDataOverride,
    storyboardCanvasGraphDataOverride,
    storyboardCardsMode,
    storyboardRuntimeGraphSignature,
  ])
  const surfaceNoGraphLoaded = storyboardCardsMode ? false : noGraphLoaded

  if (widgetDropBridgeOnly) {
    return <section ref={rootRef} className="absolute inset-0 pointer-events-none opacity-0" aria-hidden="true" />
  }

  return (
    <StoryboardWidgetCanvasSurface
      rootRef={rootRef}
      storyboardWidgetSurfaceId={storyboardWidgetSurfaceId}
      active={active}
      canInteract={canInteract}
      canEdit={canEdit}
      geospatialWidgetPanelMode={geospatialWidgetPanelMode}
      storyboardCardsMode={storyboardCardDisplayActive}
      storyboardWidgetMode={storyboardWidgetDisplayActive}
      storyboardSourceGraphData={storyboardCanvasGraphDataOverride}
      renderGraphDataOverride={flowCanvasGraphDataOverride}
      storyboardWidgetViewActive={storyboardWidgetViewActive}
      openWidgetNodeIds={overlayOpenWidgetNodeIds}
      draftGraphDataRevision={draftGraphDataRevision}
      baseGraphDataRevision={baseGraphDataRevision}
      flowRuntimeRefRef={flowRuntimeRefRef}
      hasOverlayEditors={overlayEdgeHostActive}
      emitStoryboardWidgetInteractionFrame={emitStoryboardWidgetInteractionFrame}
      overlayOnlyActive={overlayOnlyActive}
      overlayEditorNodeCount={overlayEditorNodeIds.length}
      overlayEdgesSvgRef={overlayEdgesSvgRef}
      overlayEditorElements={overlayEditorElements as unknown as React.ReactNode}
      noGraphLoaded={surfaceNoGraphLoaded}
      toolMode={toolMode}
      pendingEdgeSourceId={pendingEdgeSourceId}
      pendingEdgeSourceIds={pendingEdgeSourceIds}
      beginAddEdgeFromNode={beginAddEdgeFromNode} cancelPendingEdge={cancelPendingEdge} finalizePendingEdge={finalizePendingEdge} runWorkflowNode={runWorkflowNode}
      inspectorPortalHost={inspectorPortalHost}
      inspectorElement={inspectorElement}
      widgetRegistry={widgetRegistry}
      shouldDedupeWidgetDrop={shouldDedupeWidgetDrop}
      setCanvasWindowOffsetFromRect={setCanvasWindowOffsetFromRect}
      getLiveZoomTransform={getLiveZoomTransform}
      zoomViewKeyRef={zoomViewKeyRef}
      addNodeFromRegistryAtWorld={addNodeFromRegistryAtWorld}
      addRichMediaPanelFromMediaAtWorld={addRichMediaPanelFromMediaAtWorld}
      commitStoryboardCardMediaGraph={commitStoryboardCardMediaGraphForSurface}
      patchNodeById={patchNodeById}
      patchNodePropertiesById={patchNodePropertiesById}
      removeNodeById={removeNodeById}
      removePendingNodeById={removePendingOverlayNodeById}
      upsertUiToast={upsertUiToast}
      createPortal={createPortal}
    />
  )
}
