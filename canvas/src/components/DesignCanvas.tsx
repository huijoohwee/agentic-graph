import React, { useMemo, useRef } from 'react'
import * as d3 from 'd3'
import { DesignCanvasRenderShell } from '@/components/DesignCanvas/DesignCanvasRenderShell'
import { useDesignCanvasArrangeActions } from '@/components/DesignCanvas/arrangeActions'
import { useDesignCanvasBootstrap } from '@/components/DesignCanvas/useDesignCanvasBootstrap'
import { useFrameDragController } from '@/components/DesignCanvas/useFrameDragController'
import { useDesignCanvasGraphOrchestration } from '@/components/DesignCanvas/useDesignCanvasGraphOrchestration'
import { useDesignCanvasLabelLayout } from '@/components/DesignCanvas/useDesignCanvasLabelLayout'
import { useDesignCanvasMarkdownPanelGroups } from '@/components/DesignCanvas/useDesignCanvasMarkdownPanelGroups'
import { useDesignCanvasOverlayRuntime } from '@/components/DesignCanvas/useDesignCanvasOverlayRuntime'
import { useDesignCanvasRenderData } from '@/components/DesignCanvas/useDesignCanvasRenderData'
import { useDesignCanvasShellControllers } from '@/components/DesignCanvas/useDesignCanvasShellControllers'
import { useDesignCanvasWireframeDecor } from '@/components/DesignCanvas/useDesignCanvasWireframeDecor'
import { useGroupResizeController } from '@/components/DesignCanvas/useGroupResizeController'
import { useGlobalInteractionCleanup } from '@/components/DesignCanvas/useGlobalInteractionCleanup'
import { useResizeMarqueeController } from '@/components/DesignCanvas/useResizeMarqueeController'
import { useZoomInitController } from '@/components/DesignCanvas/useZoomInitController'
import { useGraphStore } from '@/hooks/useGraphStore'
import { useCanvasAppliedMarkdownDocument } from '@/features/canvas/useCanvasAppliedMarkdownDocument'
import type { DesignFramePos, DesignFrameSize } from '@/hooks/store/designRendererSlice'
import { useContainerDims } from '@/hooks/useContainerDims'
import { readCanvasGridRenderConfigFromSchema } from '@/lib/canvas/canvasGridConfig'
import { disableAutoZoomModesForUserGesture } from '@/lib/canvas/auto-zoom-modes'
import { computeOverlayPanTransform2d } from '@/lib/canvas/overlayInteractions2d'
import { isEditableTarget } from '@/lib/canvas/arrangeShortcuts'
import { isWorkspaceEditorOverlayOpen } from '@/features/workspace-table/workspaceTableSsot'

import type { GraphSchema } from '@/lib/graph/schema'
import type { GraphData, GraphNode } from '@/lib/graph/types'
import { readDesignWireframeSettings } from '@/lib/render/designWireframeSettings'
import type { DesignLayerState } from '@/features/design/designLayersState'

const EMPTY_STRING_ARRAY: string[] = []
const EMPTY_DESIGN_LAYER_STATE: DesignLayerState = { order: [], hiddenById: {} }
const EMPTY_DESIGN_FRAME_POS_BY_ID: Record<string, DesignFramePos> = {}
const EMPTY_DESIGN_FRAME_SIZE_BY_ID: Record<string, DesignFrameSize> = {}

export default function DesignCanvas({
  active = true,
}: {
  active?: boolean
}) {
  const containerRef = useRef<HTMLElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const resolvedThemeMode = useGraphStore(s => (s.resolvedThemeMode || 'light') as 'light' | 'dark')
  const darkThemeVariant = useGraphStore(s => s.darkThemeVariant)
  const gRef = useRef<SVGGElement>(null)
  const zoomRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null)
  const labelsSelRef = useRef<d3.Selection<SVGTextElement, GraphNode, SVGGElement, unknown> | null>(null)
  const mediaOverlayPanRef = useRef<null | { pointerId: number; startTransform: d3.ZoomTransform }>(null)
  const dims = useContainerDims(containerRef)

  const moveDesignMediaOverlayPan = React.useCallback((args: { pointerId: number; dx: number; dy: number }) => {
    const drag = mediaOverlayPanRef.current
    if (!drag || drag.pointerId !== args.pointerId) return
    const svgEl = svgRef.current
    const zoom = zoomRef.current
    if (!svgEl || !zoom) return
    const st = useGraphStore.getState()
    disableAutoZoomModesForUserGesture(st)
    const next = computeOverlayPanTransform2d({
      startTransform: drag.startTransform,
      dxClientPx: args.dx,
      dyClientPx: args.dy,
      canvasPanSpeedMultiplier: st.canvasPanSpeedMultiplier,
      canvasInteractionSpeedMultiplier: st.canvasInteractionSpeedMultiplier,
      applySpeedMultipliers: false,
    })
    d3.select(svgEl).call(zoom.transform as never, next)
  }, [])

  const endDesignMediaOverlayPan = React.useCallback((args: { pointerId: number }) => {
    const drag = mediaOverlayPanRef.current
    if (!drag || drag.pointerId !== args.pointerId) return
    mediaOverlayPanRef.current = null
  }, [])

  const { snapshot } = useDesignCanvasBootstrap({
    active,
    svgRef,
    emptyStringArray: EMPTY_STRING_ARRAY,
    emptyDesignLayerState: EMPTY_DESIGN_LAYER_STATE,
    emptyDesignFramePosById: EMPTY_DESIGN_FRAME_POS_BY_ID,
    emptyDesignFrameSizeById: EMPTY_DESIGN_FRAME_SIZE_BY_ID,
  })
  const canvasMarkdownDocument = useCanvasAppliedMarkdownDocument({
    name: snapshot.markdownDocumentName,
    sourceUrl: snapshot.markdownDocumentSourceUrl,
    text: snapshot.markdownDocumentText,
    applyViewPreset: snapshot.markdownDocumentApplyViewPreset !== false,
  })
  const workspaceEditorOverlayOpen = isWorkspaceEditorOverlayOpen({ workspaceViewMode: snapshot.workspaceViewMode, workspaceCanvasPaneOpen: snapshot.workspaceCanvasPaneOpen })
  const interactionActive = active && !workspaceEditorOverlayOpen
  const arrangeActionsActive = active && !workspaceEditorOverlayOpen
  const workspaceEditorOverlayEnabled = workspaceEditorOverlayOpen && active && !!String(snapshot.markdownDocumentText || '').trim()
  const stopOverlayEvent = React.useCallback((event: React.SyntheticEvent) => {
    try {
      event.stopPropagation()
    } catch {
      void 0
    }
  }, [])
  const startDesignMediaOverlayPan = React.useCallback((args: { pointerId: number }) => {
    if (!interactionActive) return
    const svgEl = svgRef.current
    if (!svgEl) return
    disableAutoZoomModesForUserGesture(useGraphStore.getState())
    mediaOverlayPanRef.current = { pointerId: args.pointerId, startTransform: d3.zoomTransform(svgEl) }
  }, [interactionActive])

  const commitDesignFramePosHistory = React.useCallback(
    (args: { label: string; patch: Record<string, { x: number; y: number }> }) => {
      if (!interactionActive) return
      snapshot.commitDesignFramePosHistory(args)
    },
    [interactionActive, snapshot],
  )

  const commitDesignFrameRectHistory = React.useCallback(
    (args: { label: string; framePosPatch?: Record<string, { x: number; y: number }>; frameSizePatch?: Record<string, { w: number; h: number }> }) => {
      if (!interactionActive) return
      snapshot.commitDesignFrameRectHistory(args)
    },
    [interactionActive, snapshot],
  )
  const {
    documentUrl,
    webpageFrontmatter,
    webpageWorkspacePath,
    webpageLayout,
    webpageLayoutStatus,
    setWebpageLayoutStatus,
    setWebpageStatusUi,
    webpageStatusStore,
    activeWebpageLayoutGraphData,
    webpageLayoutKey,
    webpageGraphNodesById,
    decreaseWebpageFidelity,
    increaseWebpageFidelity,
    retryWebpageLayout,
    visibleNodes,
    designGraphNodeById,
    positions,
    localGraphData,
  } = useDesignCanvasGraphOrchestration({
    active,
    graphData: snapshot.graphData as GraphData | null,
    designLayerState: snapshot.designLayerState,
    designWireframeCacheEpoch: snapshot.designWireframeCacheEpoch,
    designFramePosById: snapshot.designFramePosById,
    designFrameSizeById: snapshot.designFrameSizeById,
    documentSemanticMode: String(snapshot.documentSemanticMode || 'document'),
    frontmatterModeEnabled: snapshot.frontmatterModeEnabled === true,
    markdownDocumentName: canvasMarkdownDocument.name,
    markdownDocumentText: canvasMarkdownDocument.text,
    viewportW: dims.width,
    viewportH: dims.height,
    setDesignRendererNodes: snapshot.setDesignRendererNodes,
    setDesignRendererWebpageGraph: snapshot.setDesignRendererWebpageGraph,
  })

  const FRAME_W = 320
  const FRAME_H = 240

  const {
    markdownPanelAllowedKinds,
    panelOnlyNodeIdSet,
    designGroups,
    allowGroupResize,
    groupHandleCfg,
    explicitGroupRectByNodeId,
    designGroupBoundsById,
    designMediaOverlayNodes,
    designMediaOverlayNodeIdSet,
    designMediaOverlayNodeIdsKey,
  } = useDesignCanvasMarkdownPanelGroups({
    active,
    localGraphData,
    positions,
    graphData: snapshot.graphData as GraphData | null,
    schema: snapshot.schema as GraphSchema | null,
    documentSemanticMode: String(snapshot.documentSemanticMode || 'document'),
    frontmatterModeEnabled: snapshot.frontmatterModeEnabled === true,
    multiDimTableModeEnabled: snapshot.multiDimTableModeEnabled === true,
    documentStructureBaselineLock: snapshot.documentStructureBaselineLock === true,
    renderMediaAsNodes: snapshot.renderMediaAsNodes,
    threeIframeOverlayPoolMax: snapshot.threeIframeOverlayPoolMax,
    markdownDocumentName: canvasMarkdownDocument.name,
    markdownDocumentText: canvasMarkdownDocument.text,
  })
  const { localGraphDataRef, designMediaOverlayElsRef } = useDesignCanvasOverlayRuntime({
    active,
    localGraphData,
    designMediaOverlayNodeIdsKey,
    designMediaOverlayNodes,
    viewportW: dims.width,
    viewportH: dims.height,
    mediaPanelDensity: snapshot.mediaPanelDensity,
    renderMediaAsNodes: snapshot.renderMediaAsNodes,
    overlaySizing: snapshot.overlaySizing,
    svgRef,
    zoomRef,
    documentUrl,
    webpageLayoutStatus,
    activeWebpageLayoutGraphData,
    hiddenById: snapshot.designLayerState?.hiddenById,
    webpageLayout,
    schema: snapshot.schema as GraphSchema | null,
    setWebpageLayoutStatus,
    setWebpageStatusUi,
  })

  const {
    setDesignFramePosMany,
    setDesignFrameSizeMany,
    frameElByIdRef,
    frameRectElByIdRef,
    frameStatusElByIdRef,
    groupRectElByIdRef,
    groupHandleElByIdRef,
    resizeOverlayElRef,
    designMediaHeaderDragRef,
    pointerToWorld,
    getZoomTransform,
    getZoomEventTarget,
    registerFrameEl,
    registerFrameRectEl,
    registerFrameStatusEl,
    registerGroupRectEl,
    registerGroupHandleEl,
    registerOverlayEl,
    shouldStartHeaderDrag,
    onHeaderDragStart,
    onHeaderDrag,
    onHeaderDragEnd,
  } = useDesignCanvasShellControllers({
    interactionActive,
    svgRef,
    mediaOverlayPanRef,
    designMediaOverlayElsRef,
    setDesignFramePosManyRaw: snapshot.setDesignFramePosMany,
    setDesignFrameSizeManyRaw: snapshot.setDesignFrameSizeMany,
    schema: snapshot.schema as GraphSchema | null,
    positions,
  })
  useZoomInitController({
    active,
    svgRef,
    gRef,
    zoomRef,
    labelsSelRef,
    viewportW: dims.width,
    viewportH: dims.height,
    localGraphData,
    localGraphDataRef,
    graphDataRevision: snapshot.graphDataRevision || 0,
    canvasRenderMode: snapshot.canvasRenderMode,
    canvas2dRenderer: snapshot.canvas2dRenderer,
    schema: snapshot.schema,
    viewportControlsPreset: snapshot.viewportControlsPreset,
    documentSemanticMode: snapshot.documentSemanticMode,
    frontmatterModeEnabled: snapshot.frontmatterModeEnabled,
    documentStructureBaselineLock: snapshot.documentStructureBaselineLock,
    renderMediaAsNodes: snapshot.renderMediaAsNodes,
    mediaPanelDensity: snapshot.mediaPanelDensity,
    collapsedGroupIds: snapshot.collapsedGroupIds,
    webpageLayoutKey,
  })
  const wireframeSettings = useMemo(() => readDesignWireframeSettings(snapshot.schema, localGraphData?.metadata || null), [localGraphData?.metadata, snapshot.schema])
  const {
    styleById,
    wireframeNodeById,
    denseRender,
    renderNodes,
    domDepthById,
    designMediaPreviewById,
  } = useDesignCanvasRenderData({
    activeWebpageLayoutGraphData,
    localGraphData,
    visibleNodes,
    positions,
    selectedNodeId: snapshot.selectedNodeId,
    selectedNodeIds: Array.isArray(snapshot.selectedNodeIds) ? snapshot.selectedNodeIds : EMPTY_STRING_ARRAY,
    designMediaOverlayNodeIdSet,
    webpageGraphNodesById,
    designGraphNodeById,
    showMediaPreview: wireframeSettings.showMediaPreview,
  })
  const labelLayoutById = useDesignCanvasLabelLayout({
    styleById,
    wireframeSettings,
    schema: snapshot.schema as GraphSchema | null,
    documentSemanticMode: (snapshot.documentSemanticMode as 'document' | 'keyword' | undefined) ?? undefined,
    renderNodes,
    positions,
    selectedNodeIds: Array.isArray(snapshot.selectedNodeIds) ? snapshot.selectedNodeIds : EMPTY_STRING_ARRAY,
    denseRender,
  })
  const { selectedIds, applyArrange } = useDesignCanvasArrangeActions({
    active: interactionActive,
    positions,
    schema: snapshot.schema,
    selectedNodeId: snapshot.selectedNodeId,
    selectedNodeIds: Array.isArray(snapshot.selectedNodeIds) ? snapshot.selectedNodeIds : EMPTY_STRING_ARRAY,
    setDesignFramePosMany: updates => commitDesignFramePosHistory({ label: 'Arrange', patch: updates }),
  })

  const canvasGrid = React.useMemo(() => readCanvasGridRenderConfigFromSchema(snapshot.schema), [snapshot.schema])
  const hasWebpageOverlay = !!(activeWebpageLayoutGraphData?.nodes && activeWebpageLayoutGraphData.nodes.length > 0)
  const baselineLock = snapshot.documentStructureBaselineLock === true || hasWebpageOverlay
  const {
    wireframeEdges,
    wireframeEdgeStroke,
    wireframeEdgeStrokeWidth,
    wireframeEdgesAnimated,
    wireframePreviewById,
    frameVisualById,
  } = useDesignCanvasWireframeDecor({
    styleById,
    wireframeSettings,
    localGraphData,
    positions,
    schema: snapshot.schema as GraphSchema | null,
    selectedNodeId: snapshot.selectedNodeId,
    documentUrl,
    domDepthById,
    renderNodes,
    wireframeNodeById,
    denseRender,
    hasWebpageOverlay,
  })

  const {
    dragRef: frameDragRef,
    dragPendingRef: frameDragPendingRef,
    dragRafRef: frameDragRafRef,
    handleFramePointerDown,
    handleFramePointerMove,
    handleFramePointerUp,
    handleFramePointerCancel,
  } = useFrameDragController({
    active: interactionActive,
    canvasPointerMode2d: String(snapshot.canvasPointerMode2d || ''),
    documentStructureBaselineLock: baselineLock,
    schema: snapshot.schema,
    positions,
    visibleNodes,
    explicitGroupRectByNodeId,
    frameElByIdRef,
    svgRef,
    commitDesignFramePosHistory,
    activeWebpageOverlayNodeCount: activeWebpageLayoutGraphData?.nodes?.length || 0,
    frameDefaultWidth: FRAME_W,
    frameDefaultHeight: FRAME_H,
  })
  const {
    resizeRef,
    marqueeRef,
    marqueeBox,
    beginResize,
    handleSvgPointerDown,
    handleSvgPointerMove,
    handleSvgPointerUp,
    handleSvgPointerCancel,
    cancelResizeAndMarquee,
  } = useResizeMarqueeController({
    active,
    interactionActive,
    canvasPointerMode2d: String(snapshot.canvasPointerMode2d || ''),
    documentStructureBaselineLock: baselineLock,
    viewportControlsPreset: snapshot.viewportControlsPreset,
    schema: snapshot.schema,
    svgRef,
    positions,
    visibleNodes,
    pointerToWorld,
    frameElByIdRef,
    frameRectElByIdRef,
    frameStatusElByIdRef,
    resizeOverlayElRef,
    commitDesignFrameRectHistory,
  })
  const {
    groupResizeRef,
    beginGroupResize,
    handleSvgPointerMove: handleGroupResizePointerMove,
    handleSvgPointerUp: handleGroupResizePointerUp,
    handleSvgPointerCancel: handleGroupResizePointerCancel,
    cancelGroupResize,
  } = useGroupResizeController({
    active,
    interactionActive,
    documentStructureBaselineLock: baselineLock,
    allowGroupResize,
    schema: snapshot.schema,
    svgRef,
    pointerToWorld,
    groupRectElByIdRef,
    groupHandleElByIdRef,
    positions,
    designGroupBoundsById,
    minBoundsSizePx: groupHandleCfg.minBoundsSizePx,
  })

  React.useEffect(() => {
    if (!interactionActive) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (isEditableTarget(event.target)) return
      if ((event.metaKey || event.ctrlKey) && String(event.key || '').toLowerCase() === 'z') {
        event.preventDefault()
        const store = useGraphStore.getState()
        if (event.shiftKey) store.redoDesignHistory()
        else store.undoDesignHistory()
        return
      }
      const k = String(event.key || '').toLowerCase()
      if (k === 'v') {
        event.preventDefault()
        useGraphStore.getState().setCanvasPointerMode2d('select')
        return
      }
      if (k === 'h') {
        event.preventDefault()
        useGraphStore.getState().setCanvasPointerMode2d('pan')
        return
      }
    }
    window.addEventListener('keydown', onKeyDown, { capture: true })
    return () => {
      window.removeEventListener('keydown', onKeyDown, { capture: true } as AddEventListenerOptions)
    }
  }, [interactionActive])
  useGlobalInteractionCleanup({
    interactionActive,
    svgRef,
    frameElByIdRef,
    frameDragRef,
    frameDragPendingRef,
    frameDragRafRef,
    resizeRef,
    marqueeRef,
    cancelResizeAndMarquee,
    groupResizeRef,
    cancelGroupResize,
    designMediaHeaderDragRef,
  })

  return (
    <DesignCanvasRenderShell
      containerRef={containerRef}
      active={active}
      interactionActive={interactionActive}
      documentUrl={documentUrl}
      webpageFrontmatter={webpageFrontmatter}
      webpageWorkspacePath={webpageWorkspacePath}
      webpageLayoutStatus={webpageLayoutStatus}
      webpageStatusStore={webpageStatusStore}
      onDecreaseFidelity={decreaseWebpageFidelity}
      onIncreaseFidelity={increaseWebpageFidelity}
      onRetry={retryWebpageLayout}
      selectedCount={selectedIds.length}
      arrangeActionsActive={arrangeActionsActive}
      onArrangeAction={applyArrange}
      canvasGrid={canvasGrid}
      themeSignal={`${resolvedThemeMode}:${darkThemeVariant}`}
      dims={dims}
      getZoomTransform={getZoomTransform}
      getZoomEventTarget={getZoomEventTarget}
      svgRef={svgRef}
      gRef={gRef}
      onSvgPointerDown={handleSvgPointerDown}
      onSvgPointerMove={e => {
        if (handleGroupResizePointerMove(e)) return
        handleSvgPointerMove(e)
      }}
      onSvgPointerUp={e => {
        if (handleGroupResizePointerUp(e)) return
        handleSvgPointerUp(e)
      }}
      onSvgPointerCancel={() => {
        if (handleGroupResizePointerCancel()) return
        handleSvgPointerCancel()
      }}
      designGroups={designGroups}
      designGroupBoundsById={designGroupBoundsById}
      selectedGroupId={snapshot.selectedGroupId}
      allowGroupResize={allowGroupResize}
      groupHandleCfg={groupHandleCfg}
      registerGroupRectEl={registerGroupRectEl}
      registerGroupHandleEl={registerGroupHandleEl}
      beginGroupResize={beginGroupResize}
      styleById={styleById}
      wireframeEdges={wireframeEdges}
      wireframeEdgeStroke={wireframeEdgeStroke}
      wireframeEdgeStrokeWidth={wireframeEdgeStrokeWidth}
      wireframeEdgesAnimated={wireframeEdgesAnimated}
      renderNodes={renderNodes}
      positions={positions}
      panelOnlyNodeIdSet={panelOnlyNodeIdSet}
      frameVisualById={frameVisualById}
      renderMediaAsNodes={snapshot.renderMediaAsNodes === true || Boolean(styleById)}
      designMediaPreviewById={designMediaPreviewById}
      startDesignMediaOverlayPan={startDesignMediaOverlayPan}
      moveDesignMediaOverlayPan={moveDesignMediaOverlayPan}
      endDesignMediaOverlayPan={endDesignMediaOverlayPan}
      registerFrameEl={registerFrameEl}
      registerFrameRectEl={registerFrameRectEl}
      registerFrameStatusEl={registerFrameStatusEl}
      onFramePointerDown={handleFramePointerDown}
      onFramePointerMove={handleFramePointerMove}
      onFramePointerUp={handleFramePointerUp}
      onFramePointerCancel={handleFramePointerCancel}
      wireframePreviewById={wireframePreviewById}
      labelLayoutById={labelLayoutById}
      selectedNodeId={snapshot.selectedNodeId}
      marqueeBox={marqueeBox}
      resizeOverlayRef={resizeOverlayElRef}
      onBeginResize={beginResize}
      workspaceEditorOverlayEnabled={workspaceEditorOverlayEnabled}
      markdownDocumentName={canvasMarkdownDocument.name}
      markdownDocumentText={canvasMarkdownDocument.text}
      markdownPanelAllowedKinds={[...markdownPanelAllowedKinds]}
      stopOverlayEvent={stopOverlayEvent}
      designMediaOverlayNodes={designMediaOverlayNodes}
      onRegisterOverlayEl={registerOverlayEl}
      shouldStartHeaderDrag={shouldStartHeaderDrag}
      onHeaderDragStart={onHeaderDragStart}
      onHeaderDrag={onHeaderDrag}
      onHeaderDragEnd={onHeaderDragEnd}
    />
  )
}
