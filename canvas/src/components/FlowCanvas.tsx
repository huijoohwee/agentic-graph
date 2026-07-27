/* eslint-disable react-refresh/only-export-components */
import React from 'react'

import FlowCanvasInteractionRuntime from '@/components/FlowCanvas/FlowCanvasInteractionRuntime'
import FlowCanvasMediaOverlays from '@/components/FlowCanvas/FlowCanvasMediaOverlays'
import { type FlowCanvasDrag } from '@/components/FlowCanvas/bindNativeInteractions'
import { requestFlowNativeDraw, type FlowNativeDrawArgs, type FlowNativeRuntime } from '@/components/FlowCanvas/nativeRuntime'
import {
  clampFinite,
  pickGraphDataForFlowRenderer,
  type FlowCanvasProps,
} from '@/components/FlowCanvas/shared'
import { useFlowCanvasGraphState } from '@/components/FlowCanvas/useFlowCanvasGraphState'
import { useFlowCanvasLayoutState } from '@/components/FlowCanvas/useFlowCanvasLayoutState'
import { useFlowCanvasRuntime } from '@/components/FlowCanvas/useFlowCanvasRuntime'
import { useFlowCanvasSnapshots } from '@/components/FlowCanvas/useFlowCanvasSnapshots'
import { useFlowCanvasStoreState } from '@/components/FlowCanvas/useFlowCanvasStoreState'
import { useFlowRequestCommit } from '@/components/FlowCanvas/useFlowRequestCommit'
import { useAutoZoomModes2d } from '@/features/zoom/useAutoZoomModes2d'
import { isWorkspaceEditorOverlayOpen } from '@/features/workspace-table/workspaceTableSsot'
import { useGraphStore } from '@/hooks/useGraphStore'
import { CANVAS_INTERACTIVE_CLASS, CANVAS_SURFACE_CLASS } from '@/lib/canvas/surface'
import { readCanvasGridRenderConfigFromSchema } from '@/lib/canvas/canvasGridConfig'
import { readAllowGroupResize } from '@/lib/canvas/groupResizePolicy'
import { ensureSpacePanKeyListenerInstalled } from '@/lib/canvas/space-pan'
import { createZoomWheelGuardState } from '@/lib/canvas/zoom-wheel-guard'
import { resolveStoryboardWidgetFocusedEdgeIds } from '@/lib/storyboardWidget/storyboardWidgetPortRows'
import { isStoryboardWidgetSurfaceRenderer } from '@/lib/storyboardWidget/screenAuthorityCollectivePan'
import type { GraphSchema } from '@/lib/graph/schema'

export { pickGraphDataForFlowRenderer }
const WORKSPACE_PREINIT_DRAW_INTERACTION_BYPASS_MS = 1200

export default function FlowCanvas({
  active = true,
  graphDataOverride,
  mutationSourceGraphDataOverride,
  graphDataRevisionOverride,
  canvas2dRendererOverride,
  suppressMediaOverlays = false,
  collisionDuringDrag = false,
  allowNodeDragOverride,
  exposeRuntimeRef,
  onInteractionFrame,
  onOverlayInteractionFrame,
  hideSelectedNodeGlyph = false,
  hideSelectedNodePortHandles,
  hideNodeIds,
  hidePortHandleNodeIds,
  hideGroupIds,
  excludeRichMediaOverlayNodeIds,
  excludeNativeSceneNodeIds,
  overlayAabbByNodeId,
  flowWidgetPinnedByNodeIdOverride,
  flowWidgetStateGraphKeyOverride,
  storyboardCollectiveZoomBaselineKRef,
  storyboardWidgetSurfaceId,
  forbidCircleNodes = false,
  onNodeChange,
  onNodePropertiesChange,
  onNodeRemove,
}: FlowCanvasProps) {
  const containerRef = React.useRef<HTMLElement>(null)
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null)
  const runtimeRef = React.useRef<FlowNativeRuntime | null>(null)
  const resolvedThemeMode = useGraphStore(s => (s.resolvedThemeMode || 'light') as 'light' | 'dark')
  const lastCommittedPositionsRef = React.useRef<Record<string, { x: number; y: number }> | null>(null)
  const positionsDirtySinceCommitRef = React.useRef(false)
  const selectedNodeIdsRef = React.useRef<string[]>([])
  const selectedEdgeIdsRef = React.useRef<string[]>([])
  const drawArgsRef = React.useRef<FlowNativeDrawArgs>({
    selectedNodeIds: [],
    selectedEdgeIds: [],
    edgeFocusActive: false,
    focusedEdgeIds: [],
    selectedGroupId: null,
    showGroupResizeHandle: false,
    hideNodeIds: undefined,
    hidePortHandleNodeIds: undefined,
    hideGroupIds: undefined,
    grid: null,
    storyboardWidgetOpenNodeIds: undefined,
    storyboardWidgetPinnedByNodeId: undefined,
    storyboardWidgetWorldPosByNodeId: undefined,
  })
  const lastPointerInCanvasRef = React.useRef<null | { sx: number; sy: number; ts: number }>(null)
  const lastWheelIntentRef = React.useRef<null | { dir: 'in' | 'out'; ts: number }>(null)
  const zoomWheelGuardRef = React.useRef(createZoomWheelGuardState())
  const userSelectLockPointerIdRef = React.useRef<number | null>(null)
  const collisionSchemaRef = React.useRef<GraphSchema | null>(null)
  const collisionGraphDataRef = React.useRef<any>(null)
  const collisionFlowConfigRef = React.useRef<any>(null)
  const collisionPresentationRef = React.useRef<any>(null)
  const dragRef = React.useRef<FlowCanvasDrag>(null)
  const lastBuiltGraphKeyRef = React.useRef('')
  const lastUserInteractionAtMsRef = React.useRef(0)
  const lastInitTransformZoomViewKeyRef = React.useRef<string | null>(null)
  const lastAppliedPositionsRef = React.useRef<Record<string, { x: number; y: number }> | null>(null)

  const {
    registerCanvasSnapshotFns,
    selectedNodeId,
    selectedNodeIds,
    dpr,
    viewportW,
    viewportH,
    schema,
    frontmatterModeEnabled,
    documentSemanticMode,
    multiDimTableModeEnabled,
    documentStructureBaselineLock,
    collapsedGroupIds,
    renderMediaAsNodes,
    mediaPanelDensity,
    threeIframeOverlayPoolMax,
    overlaySizing,
    canvasRenderMode,
    canvas2dRenderer: storeCanvas2dRenderer,
    infiniteCanvasInteractionMode,
    viewportControlsPreset,
    storyboardWidgetSelectionOnDrag,
    setLayoutPositionsForMode,
    graphDataRevision: baseGraphDataRevision,
    viewPinned,
    fitToScreenMode,
    zoomToSelectionMode,
    setZoomState,
    setZoomStateForKey,
    widgetRegistry,
    baseWidgetRegistry,
    documentWidgetRegistry,
    openWidgetNodeIds,
    flowWidgetPinnedByNodeId,
    flowWidgetWorldPosByNodeId,
  } = useFlowCanvasStoreState({ active, containerRef })
  const canvas2dRenderer = String(canvas2dRendererOverride || storeCanvas2dRenderer || '')
  const canvasPixelW = Math.max(1, Math.floor(viewportW * dpr))
  const canvasPixelH = Math.max(1, Math.floor(viewportH * dpr))

  useFlowCanvasSnapshots({
    active,
    canvasRef,
    runtimeRef,
    graphDataOverride,
    registerCanvasSnapshotFns,
    viewportW,
    viewportH,
  })

  const storeGraphData = useGraphStore(s => (active ? s.graphData : null))
  const {
    graphDataRevision,
    renderGraphData,
    allowMutations,
    effectiveFrontmatter,
    storyboardWidgetFrontmatterInteractionMode,
    storyboardWidgetOverlayInteractionMode,
    filteredGraphDataForRenderer,
    sceneGraphData,
    nativeSceneGraphData,
    mediaNodes,
    selectedOverlayNodeIdSet,
  } = useFlowCanvasGraphState({
    graphDataOverride,
    graphDataRevisionOverride,
    storeGraphData,
    baseGraphDataRevision,
    selectedNodeId,
    selectedNodeIds,
    frontmatterModeEnabled,
    documentSemanticMode,
    documentStructureBaselineLock,
    allowNodeDragOverride,
    canvas2dRenderer,
    renderMediaAsNodes,
    suppressMediaOverlays,
    infiniteCanvasInteractionMode,
    excludeRichMediaOverlayNodeIds,
    excludeNativeSceneNodeIds,
    openWidgetNodeIds,
    widgetRegistry,
    baseWidgetRegistry,
    documentWidgetRegistry,
    threeIframeOverlayPoolMax,
  })

  const {
    zoomViewKey,
    rankdir,
    flowConfigEffective,
    flowPresentation,
    layoutVariant,
    sceneGroups,
    cacheKey,
    computedPositions,
    seededFallbackPositions,
    graphDataForZoom,
    graphDataForZoomRequests,
    storyboardWidgetReservedW,
  } = useFlowCanvasLayoutState({
    active,
    resolvedThemeMode,
    graphDataRevision,
    sceneGraphData,
    filteredGraphDataForRenderer,
    effectiveFrontmatter,
    canvasRenderMode,
    canvas2dRenderer,
    documentSemanticMode,
    documentStructureBaselineLock,
    frontmatterModeEnabled,
    multiDimTableModeEnabled,
    collapsedGroupIds,
    renderMediaAsNodes,
    mediaPanelDensity,
    mediaNodes,
    schema,
    widgetRegistry,
    setLayoutPositionsForMode,
    overlaySizing,
    openWidgetNodeIds,
    flowWidgetPinnedByNodeId,
    flowWidgetWorldPosByNodeId,
    viewportW,
    viewportH,
  })
  const initKey = zoomViewKey
  const alreadyInitializedForKey = lastInitTransformZoomViewKeyRef.current === initKey
  const storyboardWidgetMode = isStoryboardWidgetSurfaceRenderer(canvas2dRenderer)
  const storyboardWidgetTransformGuardSnippet = () => {
    if (storyboardWidgetMode && alreadyInitializedForKey) return
  }
  void storyboardWidgetTransformGuardSnippet
  const workspaceEditorOverlayOpen = useGraphStore(s => isWorkspaceEditorOverlayOpen(s))
  const storyboardWidgetSelectedPortRowKey = useGraphStore(s => s.storyboardWidgetSelectedPortRowKey || '')
  const workspacePreInitDeferredDrawRef = React.useRef(false)
  const [selectionBox, setSelectionBox] = React.useState<null | { left: number; top: number; width: number; height: number }>(null)
  const selectionBoxRafRef = React.useRef<number | null>(null)
  const mediaOverlayInteractionFrameSchedulerRef = React.useRef<null | (() => void)>(null)
  const requestSetSelectionBox = React.useCallback((next: null | { left: number; top: number; width: number; height: number }) => {
    if (selectionBoxRafRef.current != null) cancelAnimationFrame(selectionBoxRafRef.current)
    selectionBoxRafRef.current = requestAnimationFrame(() => {
      selectionBoxRafRef.current = null
      setSelectionBox(prev => {
        if (!prev && !next) return prev
        if (next) {
          const width = clampFinite(next.width, 0, 1_000_000)
          const height = clampFinite(next.height, 0, 1_000_000)
          const left = clampFinite(next.left, 0, Math.max(0, viewportW - width))
          const top = clampFinite(next.top, 0, Math.max(0, viewportH - height))
          next = { left, top, width: clampFinite(width, 0, viewportW - left), height: clampFinite(height, 0, viewportH - top) }
        }
        if (prev && next && prev.left === next.left && prev.top === next.top && prev.width === next.width && prev.height === next.height) return prev
        return next
      })
    })
  }, [viewportH, viewportW])

  React.useEffect(() => {
    ensureSpacePanKeyListenerInstalled()
  }, [])
  React.useEffect(() => {
    exposeRuntimeRef?.(runtimeRef)
  }, [exposeRuntimeRef])

  const handleInteractionFrame = React.useCallback(() => {
    lastUserInteractionAtMsRef.current = Date.now()
    if (storyboardWidgetMode) {
      mediaOverlayInteractionFrameSchedulerRef.current?.()
      onOverlayInteractionFrame?.()
    }
    onInteractionFrame?.()
  }, [storyboardWidgetMode, onInteractionFrame, onOverlayInteractionFrame])
  const registerMediaOverlayInteractionFrameScheduler = React.useCallback((scheduler: null | (() => void)) => {
    mediaOverlayInteractionFrameSchedulerRef.current = scheduler
  }, [])
  const buildDrawArgs = React.useCallback(() => drawArgsRef.current, [])

  const drawRafRef = React.useRef<number | null>(null)
  const shouldSuppressWorkspacePreInitCanvasDraw = React.useCallback((): boolean => {
    if (!storyboardWidgetMode) return false
    if (workspaceEditorOverlayOpen !== true) return false
    const interactedRecently = Date.now() - lastUserInteractionAtMsRef.current <= WORKSPACE_PREINIT_DRAW_INTERACTION_BYPASS_MS
    if (interactedRecently) return false
    return lastInitTransformZoomViewKeyRef.current !== zoomViewKey
  }, [storyboardWidgetMode, workspaceEditorOverlayOpen, zoomViewKey])
  const scheduleFlowDraw = React.useCallback((opts?: { force?: boolean }) => {
    const force = opts?.force === true
    if (!force && shouldSuppressWorkspacePreInitCanvasDraw()) {
      workspacePreInitDeferredDrawRef.current = true
      return
    }
    workspacePreInitDeferredDrawRef.current = false
    if (drawRafRef.current != null) return
    drawRafRef.current = requestAnimationFrame(() => {
      drawRafRef.current = null
      if (!active) return
      const runtime = runtimeRef.current
      if (!runtime) return
      runtime.dirty = true
      requestFlowNativeDraw(runtime, buildDrawArgs())
    })
  }, [active, buildDrawArgs, shouldSuppressWorkspacePreInitCanvasDraw])

  React.useEffect(() => {
    if (!active) return
    if (!workspacePreInitDeferredDrawRef.current) return
    if (shouldSuppressWorkspacePreInitCanvasDraw()) return
    workspacePreInitDeferredDrawRef.current = false
    scheduleFlowDraw()
  }, [active, scheduleFlowDraw, shouldSuppressWorkspacePreInitCanvasDraw, zoomViewKey])

  React.useEffect(() => {
    const runtimeRefCurrent = runtimeRef
    return () => {
      if (drawRafRef.current != null) cancelAnimationFrame(drawRafRef.current)
      if (selectionBoxRafRef.current != null) cancelAnimationFrame(selectionBoxRafRef.current)
      const runtime = runtimeRefCurrent.current
      if (runtime?.pendingRaf != null) cancelAnimationFrame(runtime.pendingRaf)
    }
  }, [])

  React.useEffect(() => {
    if (!active) return
    const runtime = runtimeRef.current
    if (!runtime) return
    runtime.dirty = true
    scheduleFlowDraw()
  }, [active, resolvedThemeMode, scheduleFlowDraw])

  const updateHiddenDrawArgs = React.useCallback(() => {
    const baseNodeIds = Array.from(new Set((hideNodeIds || []).map(String)))
    const baseHandleIds = Array.from(new Set((hidePortHandleNodeIds || []).map(String)))
    drawArgsRef.current.hideNodeIds = hideSelectedNodeGlyph
      ? Array.from(new Set([...(selectedNodeIdsRef.current || []), ...baseNodeIds]))
      : (baseNodeIds.length > 0 ? baseNodeIds : undefined)
    drawArgsRef.current.hidePortHandleNodeIds = hideSelectedNodePortHandles
      ? Array.from(new Set([...(selectedNodeIdsRef.current || []), ...baseHandleIds]))
      : (baseHandleIds.length > 0 ? baseHandleIds : undefined)
    drawArgsRef.current.hideGroupIds = hideGroupIds?.length
      ? Array.from(new Set(hideGroupIds.map(String).filter(Boolean)))
      : undefined
    scheduleFlowDraw()
  }, [hideGroupIds, hideNodeIds, hidePortHandleNodeIds, hideSelectedNodeGlyph, hideSelectedNodePortHandles, scheduleFlowDraw])

  React.useEffect(() => {
    drawArgsRef.current.showGroupResizeHandle = readAllowGroupResize(schema)
    drawArgsRef.current.grid = readCanvasGridRenderConfigFromSchema(schema)
    if (canvas2dRenderer === 'storyboard') {
      drawArgsRef.current.storyboardWidgetOpenNodeIds = openWidgetNodeIds || []
      drawArgsRef.current.storyboardWidgetPinnedByNodeId = flowWidgetPinnedByNodeId || {}
      drawArgsRef.current.storyboardWidgetWorldPosByNodeId = flowWidgetWorldPosByNodeId || {}
    } else {
      drawArgsRef.current.storyboardWidgetOpenNodeIds = undefined
      drawArgsRef.current.storyboardWidgetPinnedByNodeId = undefined
      drawArgsRef.current.storyboardWidgetWorldPosByNodeId = undefined
    }
    updateHiddenDrawArgs()
  }, [
    canvas2dRenderer,
    flowWidgetPinnedByNodeId,
    flowWidgetWorldPosByNodeId,
    openWidgetNodeIds,
    schema,
    updateHiddenDrawArgs,
  ])

  const storyboardWidgetFocusedEdges = React.useMemo(
    () => resolveStoryboardWidgetFocusedEdgeIds(
      sceneGraphData,
      canvas2dRenderer === 'storyboard' ? storyboardWidgetSelectedPortRowKey : '',
    ),
    [canvas2dRenderer, storyboardWidgetSelectedPortRowKey, sceneGraphData],
  )

  React.useEffect(() => {
    drawArgsRef.current.edgeFocusActive = storyboardWidgetFocusedEdges.active
    drawArgsRef.current.focusedEdgeIds = storyboardWidgetFocusedEdges.edgeIds
    scheduleFlowDraw()
  }, [storyboardWidgetFocusedEdges, scheduleFlowDraw])

  const suppressAutoZoomModes = active
    && canvas2dRenderer === 'storyboard'
    && frontmatterModeEnabled
    && documentSemanticMode === 'document'

  const autoZoomPaused = !active || (suppressAutoZoomModes && !fitToScreenMode && !zoomToSelectionMode)
  useAutoZoomModes2d({ viewportW, viewportH, paused: autoZoomPaused })

  React.useEffect(() => {
    collisionSchemaRef.current = schema
    collisionGraphDataRef.current = nativeSceneGraphData
    collisionFlowConfigRef.current = flowConfigEffective
    collisionPresentationRef.current = flowPresentation
  }, [flowConfigEffective, flowPresentation, nativeSceneGraphData, schema])

  const requestCommit = useFlowRequestCommit({
    cacheKey,
    flowConfig: flowConfigEffective,
    flowPresentation,
    graphDataRevision,
    runtimeRef,
    graphDataForZoomRef: collisionGraphDataRef,
    schemaRef: collisionSchemaRef,
    disableRelaxOnCommit: canvas2dRenderer === 'storyboard',
    setLayoutPositionsForMode,
    setZoomState,
    setZoomStateForKey,
    viewportW,
    viewportH,
    zoomViewKey,
    positionsDirtySinceCommitRef,
    lastCommittedPositionsRef,
    buildDrawArgs,
    allowLayoutCommitWhenWorkspaceBlocked: canvas2dRenderer === 'storyboard',
  })
  useFlowCanvasRuntime({
    active,
    storyboardWidgetSurfaceId,
    allowNodeDragOverride,
    collisionDuringDrag,
    viewportControlsPreset,
    storyboardWidgetSelectionOnDrag,
    canvas2dRenderer,
    canvasRef,
    runtimeRef,
    drawArgsRef,
    buildDrawArgs,
    scheduleFlowDraw,
    requestCommit,
    requestSetSelectionBox,
    handleInteractionFrame,
    dragRef,
    lastPointerInCanvasRef,
    lastWheelIntentRef,
    zoomWheelGuardRef,
    userSelectLockPointerIdRef,
    positionsDirtySinceCommitRef,
    collisionSchemaRef,
    collisionGraphDataRef,
    collisionFlowConfigRef,
    collisionPresentationRef,
    lastAppliedPositionsRef,
    lastBuiltGraphKeyRef,
    lastInitTransformZoomViewKeyRef,
    lastUserInteractionAtMsRef,
    dpr,
    viewportW,
    viewportH,
    rankdir,
    zoomViewKey,
    graphDataRevision,
    sceneGraphData: nativeSceneGraphData,
    overlayAabbByNodeId,
    computedPositions,
    seededFallbackPositions,
    layoutVariant,
    flowConfigEffective,
    flowPresentation,
    sceneGroups,
    widgetRegistry,
    forbidCircleNodes,
    graphDataForZoom,
    graphDataForZoomRequests,
    storyboardWidgetReservedW,
    openWidgetNodeIds,
    flowWidgetPinnedByNodeId,
    flowWidgetWorldPosByNodeId,
    schema,
    frontmatterModeEnabled,
    documentSemanticMode,
    multiDimTableModeEnabled,
    documentStructureBaselineLock,
    fitToScreenMode,
    zoomToSelectionMode,
    viewPinned,
  })

  return (
    <section ref={containerRef} className={CANVAS_SURFACE_CLASS}>
      <FlowCanvasInteractionRuntime
        active={active}
        storyboardWidgetSurfaceId={storyboardWidgetSurfaceId}
        allowMutations={allowMutations}
        schema={schema}
        runtimeRef={runtimeRef}
        positionsDirtySinceCommitRef={positionsDirtySinceCommitRef}
        selectedNodeIdsRef={selectedNodeIdsRef}
        selectedEdgeIdsRef={selectedEdgeIdsRef}
        drawArgsRef={drawArgsRef}
        scheduleFlowDraw={scheduleFlowDraw}
        requestCommit={requestCommit}
        handleInteractionFrame={handleInteractionFrame}
        canvas2dRenderer={canvas2dRenderer}
        graphDataForZoomRequests={graphDataForZoomRequests}
        viewportW={viewportW}
        viewportH={viewportH}
        storyboardWidgetReservedW={storyboardWidgetReservedW}
      />
      <canvas
        ref={canvasRef}
        aria-label="Flow renderer"
        data-kg-canvas-interactive="1"
        data-kg-canvas-scene-node-count={nativeSceneGraphData?.nodes?.length || 0}
        data-kg-canvas-scene-edge-count={nativeSceneGraphData?.edges?.length || 0}
        className={CANVAS_INTERACTIVE_CLASS}
        width={canvasPixelW}
        height={canvasPixelH}
        draggable={false}
      />
      {suppressMediaOverlays ? null : (
        <FlowCanvasMediaOverlays
          active={active}
          mediaNodes={mediaNodes as any}
          flowWidgetPinnedByNodeIdOverride={flowWidgetPinnedByNodeIdOverride}
          flowWidgetStateGraphKeyOverride={flowWidgetStateGraphKeyOverride}
          storyboardCollectiveZoomBaselineKRef={storyboardCollectiveZoomBaselineKRef}
          selectedOverlayNodeIdSet={selectedOverlayNodeIdSet}
          sceneGraphData={sceneGraphData}
          mutationSourceGraphData={mutationSourceGraphDataOverride !== undefined ? mutationSourceGraphDataOverride : renderGraphData}
          nativeSceneGraphData={nativeSceneGraphData}
          canvasRef={canvasRef}
          runtimeRef={runtimeRef}
          drawArgsRef={drawArgsRef}
          positionsDirtySinceCommitRef={positionsDirtySinceCommitRef}
          requestCommit={requestCommit}
          onInteractionFrame={handleInteractionFrame}
          schema={schema}
          canvas2dRenderer={canvas2dRenderer}
          frontmatterModeEnabled={frontmatterModeEnabled}
          documentSemanticMode={documentSemanticMode}
          // Keep the FlowCanvas mount aligned with the overlay resize contract:
          // resizable={storyboardWidgetOverlayInteractionMode && isSelected}
          // Resize repaint contract remains in the runtime owner: if (resized) runtime.dirty = true.
          storyboardWidgetOverlayInteractionMode={storyboardWidgetOverlayInteractionMode}
          storyboardWidgetFrontmatterInteractionMode={storyboardWidgetFrontmatterInteractionMode}
          mediaPanelDensity={mediaPanelDensity}
          renderMediaAsNodes={renderMediaAsNodes}
          infiniteCanvasInteractionMode={infiniteCanvasInteractionMode}
          viewportW={viewportW}
          viewportH={viewportH}
          overlaySizing={overlaySizing}
          storyboardWidgetSurfaceId={storyboardWidgetSurfaceId}
          onNodeChange={onNodeChange}
          onNodePropertiesChange={onNodePropertiesChange}
          onNodeRemove={onNodeRemove}
          registerInteractionFrameLayoutScheduler={registerMediaOverlayInteractionFrameScheduler}
        />
      )}
      {selectionBox ? (
        <section
          aria-hidden={true}
          className="absolute pointer-events-none border border-[var(--kg-canvas-node-selected)] bg-[color-mix(in_srgb,var(--kg-canvas-node-selected)_15%,transparent)]"
          style={{ left: selectionBox.left, top: selectionBox.top, width: selectionBox.width, height: selectionBox.height }}
        />
      ) : null}
    </section>
  )
}
