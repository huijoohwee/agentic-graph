import React from 'react'
import * as d3 from 'd3'
import { UI_RESPONSIVE_PASSIVE_FILL_SURFACE_CLASSNAME } from '@/lib/ui/responsiveElementClasses'
import RichMediaPanel from '@/components/RichMediaPanel'
import { FlowCanvasRichMediaOverlayToolbar } from '@/components/FlowCanvas/FlowCanvasRichMediaOverlayToolbar'
import { StoryboardWidgetOverlayPortHandles } from '@/components/StoryboardWidget/StoryboardWidgetOverlayPortHandles'
import {
  isFlowCanvasRichMediaPropertyMutationBlocked,
  resolveFlowCanvasMediaOverlayInteractionPolicy,
} from '@/components/FlowCanvas/shared'
import { __flowCanvasDebug, syncFlowCanvasDebugWindow } from '@/components/FlowCanvas/flowCanvasDebug'
import type { FlowNativeDrawArgs, FlowNativeRuntime } from '@/components/FlowCanvas/nativeRuntime'
import { requestFlowNativeDraw, setFlowNativeTransform } from '@/components/FlowCanvas/nativeRuntime'
import { computeCollectiveCameraFollowScaleFromBaseline, computeCollectiveFollowScaleFromBaseline } from '@/lib/canvas/overlayWidgetZoom'
import { readVectorPaintedOverlayScale } from '@/lib/canvas/vectorPaintedOverlayProjection'
import { useGraphStore } from '@/hooks/useGraphStore'
import { disableAutoZoomModesForUserGesture } from '@/lib/canvas/auto-zoom-modes'
import { computeOverlayDraggedPoint2d, computeOverlayPanTransform2d } from '@/lib/canvas/overlayInteractions2d'
import type { GraphSchema } from '@/lib/graph/schema'
import { isStoryboardWidgetFrontmatterDocumentModeRequested } from '@/lib/graph/frontmatterMode'
import { COLLECTIVE_OVERLAY_SCALE_LIMITS_16X9 } from '@/lib/ui/overlayScaleLimits'
import { createRafLatestScheduler, type RafLatestScheduler } from '@/lib/react/rafLatestScheduler'
import { canonicalNodeIdSetHas, isCanonicalNodeIdEqual } from '@/lib/graph/canonicalNodeIds'
import { readGraphDataRevision } from '@/lib/graph/documentMetadata'
import type { GraphData, GraphNode } from '@/lib/graph/types'
import { Z_INDEX_GRAPH_MEDIA_LAYER, Z_INDEX_GRAPH_OVERLAY_SELECTED } from '@/lib/ui/zIndex'
import {
  commitRichMediaPanelChange,
  normalizeRichMediaPanelDensity,
  resolveRichMediaPanelInteractive,
} from '@/lib/render/richMediaSsot'
import { buildRichMediaPanelDroppedMediaProperties } from '@/lib/render/richMediaPanelNode'
import {
  collectCanonicalStoryboardWidgetOverlayRectEntries,
  emitStoryboardWidgetGeometryCommitted,
  STORYBOARD_WIDGET_OVERLAY_ROOT_SELECTOR,
  STORYBOARD_WIDGET_OVERLAY_SURFACE_ROOT_ATTR,
  readStoryboardWidgetOverlaySurfaceId,
} from '@/lib/canvas/storyboard-widget-overlay-proxy'
import { isStoryboardWidgetSurfaceRenderer } from '@/lib/storyboardWidget/screenAuthorityCollectivePan'
import { readNodeCenterWorld2d } from '@/lib/render/mediaAnchor'
import type { MediaOverlayNode } from '@/lib/render/mediaOverlayPool'
import type { MediaDragPayload } from '@/lib/ui/mediaDragPayload'
import { readMediaDropScreenAnchor } from '@/lib/ui/mediaDropScreenAnchors'
import { initializeMediaOverlayShell, startMediaOverlayLayoutLoop2d } from '@/lib/render/mediaOverlayLayoutLoop2d'
import { projectMediaOverlayResizeWorldSizeToLayout } from '@/lib/render/mediaOverlayResizeProjection'
import { resolveCanvasAspectRatioResizeSize, resolveCanvasAspectRatioSize } from '@/lib/canvas/canvasAspectRatioDisplayControls'
import { readStoryboardCardSize2d } from '@/components/StoryboardWidgetCanvas/storyboardCardPlacements2d'
import { readOverlaySizingConfigForDensity, type OverlayDensitySizingConfigInput } from '@/lib/render/overlaySizing2d'
import { RICH_MEDIA_PANEL_DEFAULT_VIEW_SIZE } from '@/lib/render/richMediaPanelDefaults'
import { isWorkspaceEditorOverlayOpen, isWorkspaceGraphMutationBlocked } from '@/features/workspace-table/workspaceTableSsot'
import { computeBalancedSpreadViewportMargins } from '@/lib/ui/overlayBalancedSpread'
import { clampMediaLayoutViewportToFrame16x9, coerceRichMediaPanelSizeForLayoutViewport, resolveFlowCanvasMediaLayoutViewport } from '@/components/FlowCanvas/flowCanvasMediaLayoutViewport'
import { readMediaLayoutNodePropsSignature } from '@/components/FlowCanvas/flowCanvasMediaLayoutPropsSignature'
import {
  buildFlowCanvasRichMediaPanelHeaderToolbar,
  shouldActivateFlowCanvasRichMediaPanelFromPointer,
} from '@/components/FlowCanvas/flowCanvasRichMediaPanelHeaderToolbar'
import { captureRichMediaPanelBoundaryEvent } from '@/components/captureRichMediaPanelBoundaryEvent'
import {
  readElementWorldTopLeft2d,
  readNodeWorldCenterFromTopLeft2d,
  readNodeWorldTopLeft2d,
  resolveFlowCanvasMediaOverlayGraphNode,
  resolveFlowCanvasMediaOverlayPinnedInCanvas,
  resolveFlowCanvasMediaOverlayWorldTopLeft2d,
} from '@/components/FlowCanvas/flowCanvasMediaOverlayWorldPoint'
import { resolveFlowWidgetStateGraphKey, resolveScopedFlowWidgetNodeMap } from '@/lib/storyboardWidget/widgetStateScope'
import { isFlowWidgetHeaderDragAllowedByPin } from '@/lib/storyboardWidget/flowWidgetPinMovement'
import { collectGroupPanelContainedNodeIds, isGroupPanelContainedNode } from '@/lib/storyboardWidget/groupPanelContainment'
import { useFlowCanvasMediaOverlayDebug } from '@/components/FlowCanvas/useFlowCanvasMediaOverlayDebug'
function escapeSelectorAttrValue(value: string): string {
  const text = String(value || '')
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') return CSS.escape(text)
  return text.replace(/["\\]/g, '\\$&')
}
export default function FlowCanvasMediaOverlays(args: {
  active: boolean
  mediaNodes: MediaOverlayNode[]
  flowWidgetPinnedByNodeIdOverride?: Record<string, boolean>
  flowWidgetStateGraphKeyOverride?: string | null
  storyboardCollectiveZoomBaselineKRef?: React.MutableRefObject<number | null>
  selectedOverlayNodeIdSet: Set<string>
  sceneGraphData: GraphData | null
  mutationSourceGraphData: GraphData | null
  nativeSceneGraphData: GraphData | null
  canvasRef: React.MutableRefObject<HTMLCanvasElement | null>
  runtimeRef: React.MutableRefObject<FlowNativeRuntime | null>
  drawArgsRef: React.MutableRefObject<FlowNativeDrawArgs>
  positionsDirtySinceCommitRef: React.MutableRefObject<boolean>
  requestCommit: () => void
  onInteractionFrame?: () => void
  schema: unknown
  canvas2dRenderer: string
  frontmatterModeEnabled: boolean
  documentSemanticMode: string
  storyboardWidgetOverlayInteractionMode: boolean
  storyboardWidgetFrontmatterInteractionMode: boolean
  mediaPanelDensity: 'default' | 'compact'
  renderMediaAsNodes: boolean
  infiniteCanvasInteractionMode: 'static' | 'interactive'
  viewportW: number
  viewportH: number
  overlaySizing?: OverlayDensitySizingConfigInput | null
  storyboardWidgetSurfaceId?: string
  onNodeChange?: (nodeId: string, patch: Partial<GraphNode>, sourceGraphData?: GraphData | null) => void
  onNodePropertiesChange?: (nodeId: string, patch: Record<string, unknown>, sourceGraphData?: GraphData | null) => void
  onNodeRemove?: (nodeId: string) => void
  registerInteractionFrameLayoutScheduler?: (scheduler: null | (() => void)) => void
}) {
  const {
    active,
    mediaNodes,
    flowWidgetPinnedByNodeIdOverride,
    flowWidgetStateGraphKeyOverride,
    storyboardCollectiveZoomBaselineKRef,
    selectedOverlayNodeIdSet,
    sceneGraphData,
    mutationSourceGraphData,
    nativeSceneGraphData,
    canvasRef,
    runtimeRef,
    drawArgsRef,
    positionsDirtySinceCommitRef,
    requestCommit,
    onInteractionFrame,
    schema,
    canvas2dRenderer,
    frontmatterModeEnabled,
    documentSemanticMode,
    storyboardWidgetOverlayInteractionMode,
    storyboardWidgetFrontmatterInteractionMode,
    mediaPanelDensity,
    renderMediaAsNodes,
    infiniteCanvasInteractionMode,
    viewportW,
    viewportH,
    overlaySizing,
    storyboardWidgetSurfaceId,
    onNodeChange,
    onNodePropertiesChange,
    onNodeRemove,
    registerInteractionFrameLayoutScheduler,
  } = args
  const groupPanelContainedNodeIds = React.useMemo(
    () => collectGroupPanelContainedNodeIds(sceneGraphData),
    [sceneGraphData],
  )
  const storyboardWidgetFrontmatterDocumentModeRequested = React.useMemo(() => {
    return isStoryboardWidgetFrontmatterDocumentModeRequested({
      canvas2dRenderer,
      frontmatterModeEnabled,
      documentSemanticMode,
    })
  }, [canvas2dRenderer, documentSemanticMode, frontmatterModeEnabled])
  const storyboardWidgetSurfaceRendererMode = isStoryboardWidgetSurfaceRenderer(canvas2dRenderer)
  const storyboardSharedSurfaceRendererMode = canvas2dRenderer === 'storyboard'
  const storyboardRichMediaWorldTransformProjectionMode = storyboardWidgetSurfaceRendererMode || storyboardSharedSurfaceRendererMode
  const useStoryboardWidgetRichMediaPanelHeaderToolbar = storyboardSharedSurfaceRendererMode
  const richMediaInfiniteCanvasMode = storyboardWidgetSurfaceRendererMode || storyboardSharedSurfaceRendererMode || canvas2dRenderer === 'flowCanvas'
  const mediaOverlayDragInteractionMode = storyboardWidgetSurfaceRendererMode || storyboardSharedSurfaceRendererMode || canvas2dRenderer === 'flowCanvas'
  const graphSchema = schema as GraphSchema
  const mediaOverlayElsRef = React.useRef<Map<string, HTMLElement>>(new Map())
  const mediaOverlayPanelSizeOverrideRef = React.useRef<Map<string, { w: number; h: number }>>(new Map())
  const mediaOverlayPanelSizeTargetWorldRef = React.useRef<Map<string, { w: number; h: number }>>(new Map())
  const mediaOverlayPanelLastKnownWorldSizeRef = React.useRef<Map<string, { w: number; h: number }>>(new Map())
  const mediaOverlayWorldPositionOverrideRef = React.useRef<Map<string, { x: number; y: number }>>(new Map())
  const mediaOverlayLayoutScheduleRef = React.useRef<null | (() => void)>(null)
  const mediaOverlayLayoutFlushRef = React.useRef<null | (() => void)>(null)
  const mediaOverlayHeaderDragRef = React.useRef<null | { id: string; pointerId: number; startX: number; startY: number; startK: number; lastDx: number; lastDy: number }>(null)
  const mediaOverlayPanRef = React.useRef<null | { pointerId: number; startTransform: d3.ZoomTransform }>(null)
  const mediaOverlayResizeRef = React.useRef<null | {
    id: string
    pointerId: number
    startW: number
    startH: number
    bodyAspect: number
    startScale: number
    lastW: number
    lastH: number
  }>(null)
  const mediaOverlayPanMoveLatestRef = React.useRef<{ pointerId: number; clientX: number; clientY: number; dx: number; dy: number; buttons: number; shiftKey: boolean } | null>(null)
  const mediaOverlayHeaderMoveLatestRef = React.useRef<{ id: string; pointerId: number; dx: number; dy: number } | null>(null)
  const mediaOverlayResizeMoveLatestRef = React.useRef<{ id: string; pointerId: number; dx: number; dy: number } | null>(null)
  const mediaOverlayPanMoveSchedulerRef = React.useRef<RafLatestScheduler<{ pointerId: number; clientX: number; clientY: number; dx: number; dy: number; buttons: number; shiftKey: boolean }> | null>(null)
  const mediaOverlayHeaderMoveSchedulerRef = React.useRef<RafLatestScheduler<{ id: string; pointerId: number; dx: number; dy: number }> | null>(null)
  const mediaOverlayResizeMoveSchedulerRef = React.useRef<RafLatestScheduler<{ id: string; pointerId: number; dx: number; dy: number }> | null>(null)
  const localStoryboardWidgetZoomBaselineKRef = React.useRef<number | null>(null)
  const storyboardWidgetZoomBaselineKRef = storyboardCollectiveZoomBaselineKRef || localStoryboardWidgetZoomBaselineKRef
  const workspaceOverlayOpenRef = React.useRef(false)
  const workspaceMutationBlockedRef = React.useRef(false), resizeMutationBlockedRef = React.useRef(false)
  const workspaceOverlayOpen = useGraphStore(s => isWorkspaceEditorOverlayOpen(s))
  const workspaceMutationBlocked = useGraphStore(s => isWorkspaceGraphMutationBlocked(s)), resizeMutationBlocked = workspaceMutationBlocked && typeof onNodePropertiesChange !== 'function'
  const [activeRichMediaPanelId, setActiveRichMediaPanelId] = React.useState('')
  const selectedNodeId = useGraphStore(s => String(s.selectedNodeId || '').trim())
  const openWidgetNodeIds = useGraphStore(s => s.openWidgetNodeIds)
  const flowWidgetPinnedByNodeId = useGraphStore(s => s.flowWidgetPinnedByNodeId)
  const flowWidgetPinnedByNodeIdByGraphMetaKey = useGraphStore(s => s.flowWidgetPinnedByNodeIdByGraphMetaKey)
  const flowWidgetWorldPosByNodeId = useGraphStore(s => s.flowWidgetWorldPosByNodeId)
  const flowWidgetWorldPosByNodeIdByGraphMetaKey = useGraphStore(s => s.flowWidgetWorldPosByNodeIdByGraphMetaKey)
  const flowWidgetStateGraphKey = React.useMemo(
    () => flowWidgetStateGraphKeyOverride ?? resolveFlowWidgetStateGraphKey({ graphData: sceneGraphData }),
    [flowWidgetStateGraphKeyOverride, sceneGraphData],
  )
  const effectiveFlowWidgetPinnedByNodeId = React.useMemo(() => flowWidgetPinnedByNodeIdOverride || resolveScopedFlowWidgetNodeMap({
    graphMetaKey: flowWidgetStateGraphKey,
    keyedByGraphMetaKey: flowWidgetPinnedByNodeIdByGraphMetaKey,
    globalByNodeId: flowWidgetPinnedByNodeId,
  }), [flowWidgetPinnedByNodeId, flowWidgetPinnedByNodeIdByGraphMetaKey, flowWidgetPinnedByNodeIdOverride, flowWidgetStateGraphKey])
  const effectiveFlowWidgetWorldPosByNodeId = React.useMemo(() => resolveScopedFlowWidgetNodeMap({
    graphMetaKey: flowWidgetStateGraphKey,
    keyedByGraphMetaKey: flowWidgetWorldPosByNodeIdByGraphMetaKey,
    globalByNodeId: flowWidgetWorldPosByNodeId,
  }), [flowWidgetStateGraphKey, flowWidgetWorldPosByNodeId, flowWidgetWorldPosByNodeIdByGraphMetaKey])
  const persistResolvedMediaOverlayWorldPosition = React.useCallback((id: string, point: { x: number; y: number }) => {
    mediaOverlayWorldPositionOverrideRef.current.set(id, point)
    const state = useGraphStore.getState()
    const current = resolveScopedFlowWidgetNodeMap({
      graphMetaKey: flowWidgetStateGraphKey,
      keyedByGraphMetaKey: state.flowWidgetWorldPosByNodeIdByGraphMetaKey,
      globalByNodeId: state.flowWidgetWorldPosByNodeId,
    })
    const previous = current[id]
    if (previous && Math.abs(previous.x - point.x) < 0.01 && Math.abs(previous.y - point.y) < 0.01) return
    state.setFlowWidgetWorldPosByNodeIdForGraph(flowWidgetStateGraphKey, { ...current, [id]: point })
  }, [flowWidgetStateGraphKey])
  const preserveMediaOverlayScreenPlacementForPinTransition = React.useCallback((id: string) => {
    const point = readElementWorldTopLeft2d(
      mediaOverlayElsRef.current.get(String(id || '').trim()),
      runtimeRef.current?.transform,
    )
    if (point) persistResolvedMediaOverlayWorldPosition(id, point)
  }, [persistResolvedMediaOverlayWorldPosition])
  const strybldrStoryboardCardAspectMode = useGraphStore(s => s.strybldrStoryboardCardAspectMode)
  const sceneNodePropsByIdRef = React.useRef<Map<string, Record<string, unknown>>>(new Map())
  const cancelMediaOverlayInteractionState = React.useCallback((options?: { preserveWorldPositionOverrides?: boolean }) => {
    const headerDragId = mediaOverlayHeaderDragRef.current?.id || ''
    mediaOverlayPanMoveSchedulerRef.current?.cancel()
    mediaOverlayHeaderMoveSchedulerRef.current?.cancel()
    mediaOverlayResizeMoveSchedulerRef.current?.cancel()
    mediaOverlayPanMoveLatestRef.current = null
    mediaOverlayHeaderMoveLatestRef.current = null
    mediaOverlayResizeMoveLatestRef.current = null
    mediaOverlayPanRef.current = null
    mediaOverlayHeaderDragRef.current = null
    mediaOverlayResizeRef.current = null
    mediaOverlayPanelSizeOverrideRef.current.clear()
    mediaOverlayPanelSizeTargetWorldRef.current.clear()
    if (options?.preserveWorldPositionOverrides !== true) mediaOverlayWorldPositionOverrideRef.current.clear()
    if (headerDragId && useGraphStore.getState().flowWidgetDraggingNodeId === headerDragId) useGraphStore.getState().setFlowWidgetDraggingNodeId(null)
  }, [])
  const resetMediaOverlayInteractionState = React.useCallback((options?: { clearLastKnownWorldSize?: boolean }) => {
    cancelMediaOverlayInteractionState()
    if (options?.clearLastKnownWorldSize === true) mediaOverlayPanelLastKnownWorldSizeRef.current.clear()
  }, [cancelMediaOverlayInteractionState])
  React.useEffect(() => {
    workspaceOverlayOpenRef.current = workspaceOverlayOpen
    workspaceMutationBlockedRef.current = workspaceMutationBlocked; resizeMutationBlockedRef.current = resizeMutationBlocked
    if (workspaceMutationBlocked) cancelMediaOverlayInteractionState({ preserveWorldPositionOverrides: true })
  }, [cancelMediaOverlayInteractionState, resizeMutationBlocked, workspaceMutationBlocked, workspaceOverlayOpen])
  React.useEffect(() => {
    const next = new Map<string, Record<string, unknown>>()
    const lastKnownSizes = mediaOverlayPanelLastKnownWorldSizeRef.current
    const nodes = Array.isArray(sceneGraphData?.nodes) ? (sceneGraphData.nodes as Array<{ id?: unknown; properties?: unknown }>) : []
    for (let i = 0; i < nodes.length; i += 1) {
      const id = String(nodes[i]?.id || '').trim()
      const props = nodes[i]?.properties
      if (!id || !props || typeof props !== 'object' || Array.isArray(props)) continue
      const record = props as Record<string, unknown>
      next.set(id, record)
      const stableSize = readStoryboardCardSize2d(nodes[i] as GraphNode, strybldrStoryboardCardAspectMode)
      lastKnownSizes.set(id, { w: stableSize.width, h: stableSize.height })
    }
    for (const id of Array.from(lastKnownSizes.keys())) {
      if (!next.has(id)) lastKnownSizes.delete(id)
    }
    sceneNodePropsByIdRef.current = next
  }, [sceneGraphData, strybldrStoryboardCardAspectMode])
  const mediaLayoutItemIds = React.useMemo(
    () => {
      const ids = mediaNodes.map(node => String(node.id || '').trim()).filter(Boolean)
      return ids.length <= 1 ? ids : Array.from(new Set(ids)).sort((a, b) => a.localeCompare(b))
    },
    [mediaNodes],
  )
  const mediaLayoutItemIdsKey = React.useMemo(() => mediaLayoutItemIds.join('|'), [mediaLayoutItemIds])
  const storyboardWidgetSurfaceInteractionMode =
    storyboardWidgetOverlayInteractionMode
    || storyboardWidgetFrontmatterInteractionMode
    || storyboardWidgetFrontmatterDocumentModeRequested
  const storyboardWidgetOverlaySurfaceId = storyboardWidgetSurfaceInteractionMode ? storyboardWidgetSurfaceId : ''
  const queryActiveStoryboardWidgetOverlays = React.useCallback((): HTMLElement[] => {
    if (!storyboardWidgetSurfaceInteractionMode || typeof document === 'undefined') return []
    const surfaceId = String(storyboardWidgetOverlaySurfaceId || '').trim()
    if (!surfaceId) return []
    const surfaceRoot = surfaceId
      ? document.querySelector<HTMLElement>(`[${STORYBOARD_WIDGET_OVERLAY_SURFACE_ROOT_ATTR}="${escapeSelectorAttrValue(surfaceId)}"]`)
      : null
    const queryRoot: ParentNode = surfaceRoot || document
    return Array.from(queryRoot.querySelectorAll<HTMLElement>(STORYBOARD_WIDGET_OVERLAY_ROOT_SELECTOR))
      .filter(el => readStoryboardWidgetOverlaySurfaceId(el) === surfaceId)
  }, [storyboardWidgetSurfaceInteractionMode, storyboardWidgetOverlaySurfaceId])
  const mediaLayoutItems = React.useMemo(
    () => mediaLayoutItemIdsKey ? mediaLayoutItemIdsKey.split('|').filter(Boolean).map(id => ({ id })) : [],
    [mediaLayoutItemIdsKey],
  )
  const mediaLayoutItemsKey = React.useMemo(() => mediaLayoutItems.map(item => item.id).join('|'), [mediaLayoutItems])
  const mediaViewportMargins = React.useMemo(
    () => computeBalancedSpreadViewportMargins({ viewportW, viewportH, preset: 'richMedia', minLeftPx: 16, minRightPx: 16, minTopPx: 16, minBottomPx: 16 }),
    [viewportH, viewportW],
  )
  const mediaViewportMargin = React.useMemo(() => Math.max(
    mediaViewportMargins.left,
    mediaViewportMargins.right,
    mediaViewportMargins.top,
    mediaViewportMargins.bottom,
  ), [
    mediaViewportMargins.bottom,
    mediaViewportMargins.left,
    mediaViewportMargins.right,
    mediaViewportMargins.top,
  ])
  const readMediaLayoutViewport = React.useCallback(() => resolveFlowCanvasMediaLayoutViewport({
    canvas2dRenderer,
    storyboardWidgetSurfaceId: storyboardWidgetOverlaySurfaceId,
    viewportW,
    viewportH,
  }), [canvas2dRenderer, storyboardWidgetOverlaySurfaceId, viewportH, viewportW])
  const mediaLayoutPropsSignature = React.useMemo(
    () => readMediaLayoutNodePropsSignature(mediaLayoutItemIds, sceneGraphData),
    [mediaLayoutItemIds, sceneGraphData],
  )
  const sceneGraphDataRevision = React.useMemo(() => readGraphDataRevision(sceneGraphData), [sceneGraphData])
  useFlowCanvasMediaOverlayDebug({
    mediaLayoutItemsKey,
    mediaLayoutPropsSignature,
    mediaNodes,
    mediaOverlayElementsRef: mediaOverlayElsRef,
    nativeSceneGraphData,
    workspaceOverlayOpen,
  })
  const buildDrawArgs = React.useCallback(() => drawArgsRef.current, [drawArgsRef])
  const flushMediaOverlayLayout = React.useCallback(() => {
    mediaOverlayLayoutScheduleRef.current?.()
    mediaOverlayLayoutFlushRef.current?.()
    emitStoryboardWidgetGeometryCommitted()
  }, [])
  React.useEffect(() => {
    if (!storyboardWidgetSurfaceRendererMode) {
      registerInteractionFrameLayoutScheduler?.(null)
      return () => registerInteractionFrameLayoutScheduler?.(null)
    }
    const scheduleLayout = () => {
      mediaOverlayLayoutFlushRef.current?.()
    }
    registerInteractionFrameLayoutScheduler?.(scheduleLayout)
    return () => registerInteractionFrameLayoutScheduler?.(null)
  }, [storyboardWidgetSurfaceRendererMode, registerInteractionFrameLayoutScheduler])
  const stopEvent = React.useCallback(captureRichMediaPanelBoundaryEvent, [])
  React.useEffect(() => {
    if (!storyboardCollectiveZoomBaselineKRef) storyboardWidgetZoomBaselineKRef.current = null
  }, [canvas2dRenderer, mediaLayoutItemIdsKey, storyboardCollectiveZoomBaselineKRef, storyboardWidgetSurfaceId, storyboardWidgetZoomBaselineKRef])
  const computeOverlaySizingScale = React.useCallback((zoomK: number, itemCount: number, panelW: number, panelH: number) => {
    const layoutViewport = clampMediaLayoutViewportToFrame16x9(readMediaLayoutViewport())
    const safeZoomK = Number.isFinite(zoomK) && zoomK > 0 ? zoomK : 1
    if (
      storyboardWidgetSurfaceRendererMode
      && (
        storyboardWidgetZoomBaselineKRef.current == null
        || !Number.isFinite(storyboardWidgetZoomBaselineKRef.current)
        || storyboardWidgetZoomBaselineKRef.current <= 0
      )
    ) {
      storyboardWidgetZoomBaselineKRef.current = safeZoomK
    }
    if (storyboardWidgetSurfaceRendererMode) {
      return computeCollectiveCameraFollowScaleFromBaseline({
        zoomK: safeZoomK,
        baselineZoomK: storyboardWidgetZoomBaselineKRef.current,
      })
    }
    return computeCollectiveFollowScaleFromBaseline({
      zoomK: safeZoomK,
      baselineZoomK: 1,
      viewportW: layoutViewport.width,
      viewportH: layoutViewport.height,
      count: itemCount,
      baseWidth: panelW,
      baseHeight: panelH,
      quantizeStep: 0.02,
      hardMinScale: COLLECTIVE_OVERLAY_SCALE_LIMITS_16X9.richMedia.min,
      hardMaxScale: COLLECTIVE_OVERLAY_SCALE_LIMITS_16X9.richMedia.max,
      fitToViewport: undefined,
    })
  }, [readMediaLayoutViewport, storyboardWidgetSurfaceRendererMode, storyboardWidgetZoomBaselineKRef])
  const writeRichMediaResizeTrace = React.useCallback((parts: Array<string | number>) => {
    try {
      __flowCanvasDebug.lastRichMediaResizeTrace = parts.map(v => String(v)).join('|')
      syncFlowCanvasDebugWindow()
    } catch {
      void 0
    }
  }, [])
  const applyMediaOverlayPanMove = React.useCallback((queued: { pointerId: number; clientX: number; clientY: number; dx: number; dy: number; buttons: number; shiftKey: boolean }) => {
    if (!mediaOverlayDragInteractionMode) return
    const drag = mediaOverlayPanRef.current
    if (!drag || drag.pointerId !== queued.pointerId) return
    const runtime = runtimeRef.current
    if (!runtime) return
    const store = useGraphStore.getState() as { canvasPanSpeedMultiplier?: unknown; canvasInteractionSpeedMultiplier?: unknown }
    const next = computeOverlayPanTransform2d({
      startTransform: drag.startTransform,
      dxClientPx: queued.dx,
      dyClientPx: queued.dy,
      canvasPanSpeedMultiplier: store.canvasPanSpeedMultiplier,
      canvasInteractionSpeedMultiplier: store.canvasInteractionSpeedMultiplier,
      applySpeedMultipliers: true,
    })
    setFlowNativeTransform(runtime, next)
    requestFlowNativeDraw(runtime, buildDrawArgs())
    flushMediaOverlayLayout()
  }, [buildDrawArgs, flushMediaOverlayLayout, mediaOverlayDragInteractionMode, runtimeRef])
  const applyMediaOverlayHeaderDragMove = React.useCallback((id: string, queued: { pointerId: number; dx: number; dy: number }) => {
    if (!mediaOverlayDragInteractionMode) return
    const drag = mediaOverlayHeaderDragRef.current
    if (!drag || drag.id !== id || drag.pointerId !== queued.pointerId) return
    const runtime = runtimeRef.current
    const scene = runtime?.scene
    const node = scene?.nodeById.get(id) || null
    drag.lastDx = queued.dx
    drag.lastDy = queued.dy
    const next = computeOverlayDraggedPoint2d({
      baseX: drag.startX,
      baseY: drag.startY,
      dxClientPx: queued.dx,
      dyClientPx: queued.dy,
      zoomK: drag.startK,
      schema: graphSchema,
      snapToGrid: false,
    })
    mediaOverlayWorldPositionOverrideRef.current.set(id, next)
    if (node) {
      Object.assign(node, { x: next.x, y: next.y, fx: next.x, fy: next.y, vx: 0, vy: 0 })
      if (runtime) runtime.dirty = true
    }
    positionsDirtySinceCommitRef.current = true
    if (node && runtime) requestFlowNativeDraw(runtime, buildDrawArgs())
    flushMediaOverlayLayout()
  }, [buildDrawArgs, flushMediaOverlayLayout, graphSchema, mediaOverlayDragInteractionMode, positionsDirtySinceCommitRef, runtimeRef])
  const applyMediaOverlayResizeMove = React.useCallback((id: string, queued: { pointerId: number; dx: number; dy: number }) => {
    if (!mediaOverlayDragInteractionMode || resizeMutationBlockedRef.current) return
    const drag = mediaOverlayResizeRef.current
    if (!drag || drag.id !== id || drag.pointerId !== queued.pointerId) return
    const scale = Math.max(0.001, drag.startScale)
    const nextFrame = resolveCanvasAspectRatioResizeSize({
      startWidth: drag.startW,
      startHeight: drag.startH,
      deltaX: queued.dx / scale,
      deltaY: queued.dy / scale,
      minWidth: 24,
      mode: strybldrStoryboardCardAspectMode,
    })
    const nextW = Math.max(24, Math.round(nextFrame.width))
    const nextH = Math.max(24, Math.round(nextW * drag.bodyAspect))
    drag.lastW = nextW
    drag.lastH = nextH
    mediaOverlayPanelSizeOverrideRef.current.set(id, projectMediaOverlayResizeWorldSizeToLayout({ height: nextH, projectWithWorldTransformScale: storyboardRichMediaWorldTransformProjectionMode, scale, width: nextW }))
    mediaOverlayPanelSizeTargetWorldRef.current.set(id, { w: nextW, h: nextH })
    writeRichMediaResizeTrace(['phase=move', `id=${id}`, `pid=${queued.pointerId}`, `nextW=${nextW}`, `nextH=${nextH}`])
    flushMediaOverlayLayout()
  }, [flushMediaOverlayLayout, mediaOverlayDragInteractionMode, storyboardRichMediaWorldTransformProjectionMode, strybldrStoryboardCardAspectMode, writeRichMediaResizeTrace])
  const beginMediaOverlayPan = React.useCallback((payload: { pointerId: number; clientX: number; clientY: number; buttons: number; shiftKey: boolean }) => {
    if (!mediaOverlayDragInteractionMode) return
    const runtime = runtimeRef.current
    if (!runtime) return
    disableAutoZoomModesForUserGesture(useGraphStore.getState())
    mediaOverlayPanRef.current = { pointerId: payload.pointerId, startTransform: runtime.transform || d3.zoomIdentity }
  }, [mediaOverlayDragInteractionMode, runtimeRef])
  const beginMediaOverlayHeaderDrag = React.useCallback((id: string, pointerId: number) => {
    if (!mediaOverlayDragInteractionMode) return
    const runtime = runtimeRef.current
    const scene = runtime?.scene
    const node = scene?.nodeById.get(id) || null
    const start = readNodeWorldTopLeft2d(node) || mediaOverlayWorldPositionOverrideRef.current.get(id) || readNodeWorldTopLeft2d(mediaNodes.find(node => isCanonicalNodeIdEqual(node?.id, id))) || readNodeWorldTopLeft2d((sceneGraphData?.nodes || []).find(node => isCanonicalNodeIdEqual(node?.id, id))) || readElementWorldTopLeft2d(mediaOverlayElsRef.current.get(id), runtime?.transform)
    if (!start) return
    disableAutoZoomModesForUserGesture(useGraphStore.getState())
    mediaOverlayHeaderDragRef.current = { id, pointerId, startX: start.x, startY: start.y, startK: runtime?.transform?.k || 1, lastDx: 0, lastDy: 0 }
    useGraphStore.getState().setFlowWidgetDraggingNodeId(id)
  }, [mediaNodes, mediaOverlayDragInteractionMode, runtimeRef, sceneGraphData?.nodes])
  const finishMediaOverlayHeaderDrag = React.useCallback((id: string, pointerId: number) => {
    const drag = mediaOverlayHeaderDragRef.current
    if (!drag || drag.id !== id || drag.pointerId !== pointerId) return
    mediaOverlayHeaderMoveSchedulerRef.current?.cancel()
    if (mediaOverlayHeaderMoveLatestRef.current?.id === id && mediaOverlayHeaderMoveLatestRef.current.pointerId === pointerId) applyMediaOverlayHeaderDragMove(id, mediaOverlayHeaderMoveLatestRef.current)
    const finalPoint = mediaOverlayWorldPositionOverrideRef.current.get(id)
    if (finalPoint && !workspaceMutationBlockedRef.current) {
      const patch = {
        fx: finalPoint.x,
        fy: finalPoint.y,
        x: finalPoint.x,
        y: finalPoint.y,
      } as Partial<GraphNode>
      if (onNodeChange) onNodeChange(id, patch, mutationSourceGraphData)
      else useGraphStore.getState().updateNode(id, patch)
    }
    mediaOverlayHeaderMoveLatestRef.current = null
    mediaOverlayHeaderDragRef.current = null
    if (useGraphStore.getState().flowWidgetDraggingNodeId === id) useGraphStore.getState().setFlowWidgetDraggingNodeId(null)
    requestCommit()
  }, [applyMediaOverlayHeaderDragMove, mutationSourceGraphData, onNodeChange, requestCommit])
  const beginMediaOverlayResize = React.useCallback((id: string, pointerId: number) => {
    if (!active || !mediaOverlayDragInteractionMode || resizeMutationBlockedRef.current) {
      writeRichMediaResizeTrace(['phase=skip', `id=${id}`, `pid=${pointerId}`])
      return
    }
    disableAutoZoomModesForUserGesture(useGraphStore.getState())
    const el = mediaOverlayElsRef.current.get(id) || null
    const scale = el ? readVectorPaintedOverlayScale(el) : 1
    const rect = el?.getBoundingClientRect()
    const measuredW = rect && Number.isFinite(rect.width) ? rect.width : 0
    const baseProps = sceneNodePropsByIdRef.current.get(id) || {}
    const storedW = Number(baseProps['visual:width'])
    const startW = Number.isFinite(storedW) && storedW > 0 ? Math.max(24, Math.round(storedW)) : Math.max(24, Math.round(measuredW / Math.max(0.001, scale)))
    const stableFrame = resolveCanvasAspectRatioSize({
      defaultWidth: Math.max(24, measuredW / Math.max(0.001, scale)),
      mode: strybldrStoryboardCardAspectMode,
      width: startW,
    })
    const stableH = Math.max(24, Math.round(stableFrame.height))
    const bodyAspect = stableH / Math.max(1, startW)
    mediaOverlayResizeRef.current = { id, pointerId, startW, startH: stableH, bodyAspect, startScale: scale, lastW: startW, lastH: stableH }
    mediaOverlayPanelSizeOverrideRef.current.set(id, projectMediaOverlayResizeWorldSizeToLayout({ height: stableH, projectWithWorldTransformScale: storyboardRichMediaWorldTransformProjectionMode, scale, width: startW }))
    mediaOverlayPanelSizeTargetWorldRef.current.set(id, { w: startW, h: stableH })
    writeRichMediaResizeTrace(['phase=start', `id=${id}`, `pid=${pointerId}`, `startW=${startW}`, `startH=${stableH}`])
    flushMediaOverlayLayout()
  }, [active, flushMediaOverlayLayout, mediaOverlayDragInteractionMode, storyboardRichMediaWorldTransformProjectionMode, strybldrStoryboardCardAspectMode, writeRichMediaResizeTrace])
  React.useEffect(() => {
    if (mediaOverlayDragInteractionMode) return
    mediaOverlayPanMoveSchedulerRef.current?.cancel()
    mediaOverlayPanRef.current = null
    mediaOverlayHeaderMoveSchedulerRef.current?.cancel()
    mediaOverlayHeaderDragRef.current = null
    mediaOverlayResizeMoveSchedulerRef.current?.cancel()
    mediaOverlayResizeRef.current = null
    mediaOverlayPanelSizeOverrideRef.current.clear()
    mediaOverlayPanelSizeTargetWorldRef.current.clear()
    mediaOverlayWorldPositionOverrideRef.current.clear()
  }, [mediaOverlayDragInteractionMode])
  React.useEffect(() => {
    if (!mediaOverlayDragInteractionMode) {
      mediaOverlayPanelSizeOverrideRef.current.clear()
      mediaOverlayPanelSizeTargetWorldRef.current.clear()
      return
    }
    const targets = mediaOverlayPanelSizeTargetWorldRef.current
    if (targets.size === 0) return
    const nodes = Array.isArray(sceneGraphData?.nodes) ? (sceneGraphData.nodes as Array<{ id?: unknown; properties?: unknown }>) : []
    const byId = new Map<string, Record<string, unknown>>()
    for (let i = 0; i < nodes.length; i += 1) {
      const id = String(nodes[i]?.id || '').trim()
      const props = nodes[i]?.properties
      if (id && props && typeof props === 'object' && !Array.isArray(props)) byId.set(id, props as Record<string, unknown>)
    }
    let changed = false
    for (const [id, target] of targets.entries()) {
      const props = byId.get(id)
      const width = Number(props?.['visual:width'])
      const height = Number(props?.['visual:height'])
      __flowCanvasDebug.lastRichMediaResizeTarget = `${id}:${Number.isFinite(width) ? width : '-'}x${Number.isFinite(height) ? height : '-'}->${target.w}x${target.h}`
      syncFlowCanvasDebugWindow()
      if (!Number.isFinite(width) || !Number.isFinite(height)) continue
      if (Math.abs(width - target.w) <= 0.5 && Math.abs(height - target.h) <= 0.5) {
        targets.delete(id)
        mediaOverlayPanelSizeOverrideRef.current.delete(id)
        changed = true
      }
    }
    if (changed) mediaOverlayLayoutScheduleRef.current?.()
  }, [mediaOverlayDragInteractionMode, mediaLayoutPropsSignature, sceneGraphData?.nodes, sceneGraphDataRevision])
  React.useEffect(() => {
    const stopPassiveLayoutWhileWorkspaceOverlayOpen =
      workspaceOverlayOpenRef.current && !storyboardWidgetFrontmatterDocumentModeRequested
    if (!active) return
    if (stopPassiveLayoutWhileWorkspaceOverlayOpen) return
    mediaOverlayLayoutScheduleRef.current?.()
    onInteractionFrame?.()
  }, [
    active,
    canvas2dRenderer,
    workspaceOverlayOpen,
    storyboardWidgetFrontmatterDocumentModeRequested,
    storyboardWidgetFrontmatterInteractionMode,
    mediaLayoutItemIdsKey,
    mediaLayoutPropsSignature,
    onInteractionFrame,
  ])
  React.useEffect(() => {
    const stopPassiveLayoutWhileWorkspaceOverlayOpen =
      workspaceOverlayOpenRef.current && !storyboardWidgetFrontmatterDocumentModeRequested
    if (!active || mediaLayoutItems.length === 0 || stopPassiveLayoutWhileWorkspaceOverlayOpen) {
      mediaOverlayLayoutScheduleRef.current = null
      return
    }
    const stableMediaLayoutItems = mediaLayoutItemsKey ? mediaLayoutItemsKey.split('|').filter(Boolean).map(id => ({ id })) : []
    const density = normalizeRichMediaPanelDensity(mediaPanelDensity)
    const sizingConfig = readOverlaySizingConfigForDensity({ density, sizing: overlaySizing || null })
    const loop = startMediaOverlayLayoutLoop2d({
      enabled: true,
      loop: storyboardRichMediaWorldTransformProjectionMode ? 'always' : 'onDemand',
      items: stableMediaLayoutItems,
      manualPlacement: richMediaInfiniteCanvasMode,
      density,
      viewportW,
      viewportH,
      readLayoutViewport: readMediaLayoutViewport,
      readTransform: () => runtimeRef.current?.transform || d3.zoomIdentity,
      computeSizingZoomK: zoomK => computeOverlaySizingScale(
        zoomK,
        stableMediaLayoutItems.length,
        RICH_MEDIA_PANEL_DEFAULT_VIEW_SIZE.width,
        RICH_MEDIA_PANEL_DEFAULT_VIEW_SIZE.height,
      ),
      aspectRatioMode: strybldrStoryboardCardAspectMode,
      panelDisplay: 'flex',
      scaleLayoutOnZoom: storyboardWidgetSurfaceRendererMode,
      projectWithWorldTransformScale: storyboardRichMediaWorldTransformProjectionMode,
      getPanelSizeForId: id => {
        if (!richMediaInfiniteCanvasMode) return null
        const override = mediaOverlayPanelSizeOverrideRef.current.get(id)
        if (override) {
          writeRichMediaResizeTrace(['phase=layout-override', `id=${id}`, `w=${override.w}`, `h=${override.h}`])
          if (storyboardSharedSurfaceRendererMode) return override
          const coerced = coerceRichMediaPanelSizeForLayoutViewport({ readLayoutViewport: readMediaLayoutViewport, width: override.w, height: override.h, minWidthPx: 220, minHeightPx: 160 })
          return { w: coerced.width, h: coerced.height }
        }
        const stableSize = mediaOverlayPanelLastKnownWorldSizeRef.current.get(id) || null
        if (!stableSize) {
          return storyboardSharedSurfaceRendererMode
            ? { w: RICH_MEDIA_PANEL_DEFAULT_VIEW_SIZE.width, h: RICH_MEDIA_PANEL_DEFAULT_VIEW_SIZE.height }
            : null
        }
        if (storyboardSharedSurfaceRendererMode) return stableSize
        const zoomK = typeof runtimeRef.current?.transform?.k === 'number' && runtimeRef.current.transform.k > 0 ? runtimeRef.current.transform.k : 1
        const scale = computeOverlaySizingScale(zoomK, stableMediaLayoutItems.length, stableSize.w, stableSize.h)
        const coerced = coerceRichMediaPanelSizeForLayoutViewport({ readLayoutViewport: readMediaLayoutViewport, width: stableSize.w * scale, height: stableSize.h * scale, minWidthPx: 220, minHeightPx: 160 })
        return { w: coerced.width, h: coerced.height }
      },
      getElementForId: id => mediaOverlayElsRef.current.get(id) || null,
      getScreenAnchorForId: readMediaDropScreenAnchor,
      onResolvedWorldTopLeftForId: storyboardRichMediaWorldTransformProjectionMode ? persistResolvedMediaOverlayWorldPosition : undefined,
      getNodeWorldTopLeftForId: storyboardRichMediaWorldTransformProjectionMode ? id => {
        const graphNode = resolveFlowCanvasMediaOverlayGraphNode(sceneGraphData, id)
        const pinnedInCanvas = resolveFlowCanvasMediaOverlayPinnedInCanvas({
          graphMetaKind: storyboardWidgetFrontmatterDocumentModeRequested ? 'frontmatter-flow' : null,
          node: graphNode,
          pinnedValue: effectiveFlowWidgetPinnedByNodeId[id],
        })
        return resolveFlowCanvasMediaOverlayWorldTopLeft2d({
          graphNode,
          pinnedInCanvas,
          interactionOverride: mediaOverlayWorldPositionOverrideRef.current.get(id),
          storedWorldPosition: effectiveFlowWidgetWorldPosByNodeId[id],
          mediaNode: mediaNodes.find(node => isCanonicalNodeIdEqual(node?.id, id)),
          runtimeNode: runtimeRef.current?.scene?.nodeById.get(id),
        })
      } : undefined,
      getNodeWorldCenterForId: id => readNodeWorldCenterFromTopLeft2d(mediaNodes.find(node => isCanonicalNodeIdEqual(node?.id, id))) || readNodeWorldCenterFromTopLeft2d((sceneGraphData?.nodes || []).find(node => isCanonicalNodeIdEqual(node?.id, id))) || readNodeCenterWorld2d(runtimeRef.current?.scene?.nodeById.get(id), { coords: 'center' }),
      getCollisionObstacles: () => {
        const obstacles: Array<{ id: string; left: number; top: number; width: number; height: number }> = []
        const canonicalOverlayRects = collectCanonicalStoryboardWidgetOverlayRectEntries(queryActiveStoryboardWidgetOverlays())
        for (let i = 0; i < canonicalOverlayRects.length; i += 1) {
          const entry = canonicalOverlayRects[i]
          const id = entry?.id
          const rect = entry?.rect
          if (!id || !rect || mediaOverlayElsRef.current.has(id)) continue
          obstacles.push({ id, left: rect.left, top: rect.top, width: rect.width, height: rect.height })
        }
        return obstacles
      },
      schema: schema && typeof schema === 'object' ? (schema as GraphSchema) : null,
      collision: richMediaInfiniteCanvasMode
        ? { enabled: false }
        : { enabled: true },
      sizingConfig: {
        widthRatio: sizingConfig.widthRatio,
        widthMinPx: sizingConfig.widthMinPx,
        widthMaxPx: sizingConfig.widthMaxPx,
        quantizeStepPx: richMediaInfiniteCanvasMode ? 1 : 16,
      },
      clampToViewport: richMediaInfiniteCanvasMode
        ? null
        : { margin: mediaViewportMargin },
    })
    mediaOverlayLayoutScheduleRef.current = loop.schedule
    mediaOverlayLayoutFlushRef.current = loop.flush
    loop.schedule()
    return () => {
      loop.stop()
      if (mediaOverlayLayoutScheduleRef.current === loop.schedule) mediaOverlayLayoutScheduleRef.current = null
      if (mediaOverlayLayoutFlushRef.current === loop.flush) mediaOverlayLayoutFlushRef.current = null
    }
  }, [
    active,
    workspaceOverlayOpen,
    storyboardWidgetFrontmatterDocumentModeRequested,
    storyboardWidgetSurfaceRendererMode,
    richMediaInfiniteCanvasMode,
    storyboardRichMediaWorldTransformProjectionMode,
    mediaViewportMargin,
    mediaLayoutItems.length,
    mediaLayoutItemsKey,
    mediaPanelDensity,
    effectiveFlowWidgetWorldPosByNodeId,
    effectiveFlowWidgetPinnedByNodeId,
    computeOverlaySizingScale,
    persistResolvedMediaOverlayWorldPosition,
    readMediaLayoutViewport,
    writeRichMediaResizeTrace,
    queryActiveStoryboardWidgetOverlays,
    runtimeRef,
    sceneGraphDataRevision,
    schema,
    overlaySizing,
    storyboardSharedSurfaceRendererMode,
    strybldrStoryboardCardAspectMode,
    viewportH,
    viewportW,
  ])

  React.useEffect(() => {
    return () => resetMediaOverlayInteractionState({ clearLastKnownWorldSize: true })
  }, [resetMediaOverlayInteractionState])

  if (!(active && mediaNodes.length > 0)) return null
  return (
    <section
      aria-label="Flow media overlay"
      className={UI_RESPONSIVE_PASSIVE_FILL_SURFACE_CLASSNAME}
      style={{ zIndex: Z_INDEX_GRAPH_MEDIA_LAYER }}
    >
      {mediaNodes.map((node, index) => {
        const containedByGroupPanel = isGroupPanelContainedNode(groupPanelContainedNodeIds, node.id)
        const hasSelectionChrome =
          canonicalNodeIdSetHas(selectedOverlayNodeIdSet, node.id)
          || isCanonicalNodeIdEqual(selectedNodeId, node.id)
          || isCanonicalNodeIdEqual(activeRichMediaPanelId, node.id)
        const isSelected = hasSelectionChrome || (Array.isArray(openWidgetNodeIds) && openWidgetNodeIds.some(openNodeId => isCanonicalNodeIdEqual(openNodeId, node.id)))
        const mediaOverlayInteractionPolicy = resolveFlowCanvasMediaOverlayInteractionPolicy({
          rendererInteractionMode: mediaOverlayDragInteractionMode,
          resizeMutationBlocked,
        })
        const overlayInteractionEnabled = mediaOverlayInteractionPolicy.overlayPanActive
        const headerDragInteractionActive = mediaOverlayInteractionPolicy.headerDragActive
        const resizeInteractionActive = mediaOverlayInteractionPolicy.resizeActive
        const richMediaPanelPinned = resolveFlowCanvasMediaOverlayPinnedInCanvas({
          graphMetaKind: storyboardWidgetFrontmatterDocumentModeRequested ? 'frontmatter-flow' : null,
          node: resolveFlowCanvasMediaOverlayGraphNode(sceneGraphData, node.id),
          pinnedValue: effectiveFlowWidgetPinnedByNodeId[node.id],
        })
        const richMediaPanelPinAllowsMovement = isFlowWidgetHeaderDragAllowedByPin({
          pinnedInCanvas: richMediaPanelPinned,
        })
        const richMediaBodyPanOwnedByCollective = storyboardSharedSurfaceRendererMode
        const richMediaPanelMoveEnabled = headerDragInteractionActive && richMediaPanelPinAllowsMovement && !containedByGroupPanel
        const richMediaPanelOverlayPanEnabled = overlayInteractionEnabled && richMediaPanelPinAllowsMovement && !richMediaBodyPanOwnedByCollective
        const bodyDragMovesRichMediaPanel = richMediaPanelMoveEnabled
        const resizeHandleVisible = isSelected
        const overlayPanelPointerEventsClass = mediaOverlayInteractionPolicy.panelPointerEventsClassName
        const overlayZIndex = isSelected
          ? Z_INDEX_GRAPH_OVERLAY_SELECTED
          : Math.max(1, Z_INDEX_GRAPH_MEDIA_LAYER + Math.max(0, mediaNodes.length - index))
        const updateNode = (id: string, patch: { properties: Record<string, unknown> }) => {
          if (isFlowCanvasRichMediaPropertyMutationBlocked({
            workspaceMutationBlocked: workspaceMutationBlockedRef.current,
            hasDelegatedPropertyMutation: typeof onNodePropertiesChange === 'function',
          })) return
          if (onNodePropertiesChange) {
            onNodePropertiesChange(id, patch.properties, mutationSourceGraphData)
            return
          }
          useGraphStore.getState().updateNode(id, patch as Partial<GraphNode>)
        }
        const changeRichMediaPanel = (next: import('@/lib/render/richMediaSsot').RichMediaPanelChange) => {
          if (!node.panel) return
          commitRichMediaPanelChange({ nodeId: node.id, next, updateNode })
        }
        const handleRichMediaPanelMediaDrop = (payload: MediaDragPayload) => {
          const mediaUrl = String(payload.url || '').trim()
          if (!mediaUrl || workspaceMutationBlockedRef.current) return
          const nodeProperties = sceneNodePropsByIdRef.current.get(node.id) || {}
          const label = String(payload.label || node.title || node.id || '').trim()
          updateNode(node.id, {
            properties: {
              ...nodeProperties,
              ...buildRichMediaPanelDroppedMediaProperties({ ...payload, url: mediaUrl, label }),
            },
          })
        }
        const richMediaPanelHeaderToolbar = buildFlowCanvasRichMediaPanelHeaderToolbar({
          enabled: useStoryboardWidgetRichMediaPanelHeaderToolbar, flowWidgetPinnedByNodeId: effectiveFlowWidgetPinnedByNodeId, flowWidgetStateGraphKey, isSelected,
          node, onBeforePinnedChange: () => preserveMediaOverlayScreenPlacementForPinTransition(node.id), pinned: richMediaPanelPinned, requestCommit,
          scheduleLayout: flushMediaOverlayLayout, setActiveRichMediaPanelId, stopEvent,
        })
        return (
          <section
            key={node.id}
            ref={el => {
              if (!el) { mediaOverlayElsRef.current.delete(node.id); return }
              mediaOverlayElsRef.current.set(node.id, el)
              initializeMediaOverlayShell(el, mediaViewportMargins.left, mediaViewportMargins.top)
            }}
            className={`absolute left-0 top-0 overflow-visible ${overlayPanelPointerEventsClass}`}
            data-kg-rich-media-storyboard-widget-overlay-shell="1"
            data-kg-rich-media-overlay="1"
            data-kg-storyboard-widget-mode="1"
            data-kg-overlay-pan-owner={richMediaBodyPanOwnedByCollective ? 'canvas' : undefined}
            data-kg-canvas-overlay-pinned={richMediaPanelPinned ? '1' : '0'}
            data-kg-rich-media-storyboard-widget-pinned={richMediaPanelPinned ? '1' : '0'}
            data-kg-group-panel-contained={containedByGroupPanel ? '1' : '0'}
            data-node-id={node.id}
            data-kg-storyboard-widget-surface={storyboardWidgetOverlaySurfaceId || undefined}
            style={{ zIndex: overlayZIndex }}
          >
            <FlowCanvasRichMediaOverlayToolbar visible={isSelected} nodeId={node.id} nodeProperties={sceneNodePropsByIdRef.current.get(node.id) || {}} panel={node.panel} onPanelChange={changeRichMediaPanel} openUrl={node.openUrl} sceneGraphData={sceneGraphData} workspaceMutationBlockedRef={workspaceMutationBlockedRef} onRemoveNode={onNodeRemove} />
            <StoryboardWidgetOverlayPortHandles nodeId={node.id} selected={hasSelectionChrome} />
            <RichMediaPanel
              overlayId={node.id}
              className="relative h-full w-full pointer-events-auto"
              title={node.title}
              url={node.url}
              srcDoc={node.srcDoc}
              openUrl={node.openUrl}
              kind={node.kind} renderMode={node.renderMode}
              selected={isSelected}
              panelChrome="storyboardWidget" canvasOverlayPinned={richMediaPanelPinned}
              outputVersionPlacement="bubble-toolbar"
              placementOwner="parent"
              {...richMediaPanelHeaderToolbar.panelProps}
              interactive={resolveRichMediaPanelInteractive({ nodeInteractive: node.interactive, renderMediaAsNodes, infiniteCanvasInteractionMode, canvasRenderMode: '2d', canvas2dRenderer, frontmatterModeEnabled, documentSemanticMode })}
              panel={node.panel}
              onPanelChange={changeRichMediaPanel}
              onMediaDrop={handleRichMediaPanelMediaDrop}
              forwardWheelTo={() => canvasRef.current}
              onPointerDownCapture={event => {
                if (event.button !== 0) return
                if (!shouldActivateFlowCanvasRichMediaPanelFromPointer({ isSelected, target: event.target })) return
                const id = String(node.id || '').trim()
                if (!id) return
                richMediaPanelHeaderToolbar.activate()
              }}
              onOverlayPanStart={richMediaPanelOverlayPanEnabled ? payload => { if (bodyDragMovesRichMediaPanel) { beginMediaOverlayHeaderDrag(node.id, payload.pointerId); return }; beginMediaOverlayPan(payload) } : undefined}
              onOverlayPan={richMediaPanelOverlayPanEnabled ? payload => {
                if (bodyDragMovesRichMediaPanel) { const queued = { id: node.id, pointerId: payload.pointerId, dx: payload.dx, dy: payload.dy }; mediaOverlayHeaderMoveLatestRef.current = queued; if (!mediaOverlayHeaderMoveSchedulerRef.current) mediaOverlayHeaderMoveSchedulerRef.current = createRafLatestScheduler(entry => applyMediaOverlayHeaderDragMove(entry.id, entry)); mediaOverlayHeaderMoveSchedulerRef.current.schedule(queued); return }
                mediaOverlayPanMoveLatestRef.current = payload
                if (!mediaOverlayPanMoveSchedulerRef.current) mediaOverlayPanMoveSchedulerRef.current = createRafLatestScheduler(applyMediaOverlayPanMove)
                mediaOverlayPanMoveSchedulerRef.current.schedule(payload)
              } : undefined}
              onOverlayPanEnd={richMediaPanelOverlayPanEnabled ? payload => {
                if (bodyDragMovesRichMediaPanel) { finishMediaOverlayHeaderDrag(node.id, payload.pointerId); return }
                const drag = mediaOverlayPanRef.current
                if (!drag || drag.pointerId !== payload.pointerId) return
                mediaOverlayPanMoveSchedulerRef.current?.cancel()
                if (mediaOverlayPanMoveLatestRef.current?.pointerId === payload.pointerId) applyMediaOverlayPanMove(mediaOverlayPanMoveLatestRef.current)
                mediaOverlayPanMoveLatestRef.current = null
                mediaOverlayPanRef.current = null
                requestCommit()
              } : undefined}
              onHeaderDragStart={richMediaPanelMoveEnabled ? ({ pointerId }) => beginMediaOverlayHeaderDrag(node.id, pointerId) : undefined}
              onHeaderDrag={richMediaPanelMoveEnabled ? ({ dx, dy, pointerId }) => {
                const queued = { id: node.id, pointerId, dx, dy }
                mediaOverlayHeaderMoveLatestRef.current = queued
                if (!mediaOverlayHeaderMoveSchedulerRef.current) mediaOverlayHeaderMoveSchedulerRef.current = createRafLatestScheduler(entry => applyMediaOverlayHeaderDragMove(entry.id, entry))
                mediaOverlayHeaderMoveSchedulerRef.current.schedule(queued)
              } : undefined}
              onHeaderDragEnd={richMediaPanelMoveEnabled ? ({ pointerId }) => finishMediaOverlayHeaderDrag(node.id, pointerId) : undefined}
              resizable={resizeHandleVisible} resizeHandleVisible={resizeHandleVisible}
              onResizeStart={resizeInteractionActive ? ({ pointerId }) => beginMediaOverlayResize(node.id, pointerId) : undefined}
              onResize={resizeInteractionActive ? ({ dx, dy, pointerId }) => {
                const queued = { id: node.id, pointerId, dx, dy }
                mediaOverlayResizeMoveLatestRef.current = queued
                if (!mediaOverlayResizeMoveSchedulerRef.current) mediaOverlayResizeMoveSchedulerRef.current = createRafLatestScheduler(entry => applyMediaOverlayResizeMove(entry.id, entry))
                mediaOverlayResizeMoveSchedulerRef.current.schedule(queued)
              } : undefined}
              onResizeEnd={resizeInteractionActive ? ({ pointerId }) => {
                const drag = mediaOverlayResizeRef.current
                if (!drag || drag.id !== node.id || drag.pointerId !== pointerId) return
                mediaOverlayResizeMoveSchedulerRef.current?.cancel()
                if (mediaOverlayResizeMoveLatestRef.current?.id === node.id && mediaOverlayResizeMoveLatestRef.current.pointerId === pointerId) applyMediaOverlayResizeMove(node.id, mediaOverlayResizeMoveLatestRef.current)
                mediaOverlayResizeMoveLatestRef.current = null
                mediaOverlayResizeRef.current = null
                if (!resizeMutationBlockedRef.current) {
                  try {
                    const baseProps = sceneNodePropsByIdRef.current.get(node.id) || {}
                    const nextProperties = { ...baseProps, 'visual:width': drag.lastW, 'visual:height': drag.lastH }
                    if (onNodePropertiesChange) onNodePropertiesChange(node.id, nextProperties, mutationSourceGraphData)
                    else useGraphStore.getState().updateNode(node.id, { properties: nextProperties } as Partial<GraphNode>)
                  } catch {
                    void 0
                  }
                  writeRichMediaResizeTrace(['phase=end', `id=${node.id}`, `pid=${pointerId}`, `finalW=${drag.lastW}`, `finalH=${drag.lastH}`, `owner=${onNodePropertiesChange ? 'source' : 'store'}`])
                  mediaOverlayLayoutScheduleRef.current?.()
                  requestCommit()
                }
              } : undefined}
              storyboardWidgetInteractionMode={storyboardWidgetSurfaceInteractionMode}
              storyboardWidgetFrontmatterDocumentMode={storyboardWidgetFrontmatterDocumentModeRequested}
              storyboardWidgetSurfaceId={storyboardWidgetOverlaySurfaceId}
              onWheelCapture={mediaOverlayInteractionPolicy.capturePanelEvents ? stopEvent : undefined}
              onClick={mediaOverlayInteractionPolicy.capturePanelEvents ? stopEvent : undefined}
              onDoubleClick={mediaOverlayInteractionPolicy.capturePanelEvents ? stopEvent : undefined}
              onContextMenuCapture={mediaOverlayInteractionPolicy.capturePanelEvents ? stopEvent : undefined}
            />
          </section>
        )
      })}
    </section>
  )
}
