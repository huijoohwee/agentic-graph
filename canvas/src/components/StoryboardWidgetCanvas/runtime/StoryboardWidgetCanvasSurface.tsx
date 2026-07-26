import React from 'react'
import { UI_RESPONSIVE_PASSIVE_FILL_SURFACE_CLASSNAME } from '@/lib/ui/responsiveElementClasses'
import FlowCanvas from '@/components/FlowCanvas'
import { StoryboardCardOverlayLayer2d } from '@/components/StoryboardWidgetCanvas/StoryboardCardOverlayLayer2d'
import { applyFixedStoryboardCardPlacementsToGraphData2d, readStoryboardWidgetPlacementSize2d } from '@/components/StoryboardWidgetCanvas/storyboardCardPlacements2d'
import { readResolvedStoryboardWidgetDropTransform } from '@/components/StoryboardWidgetCanvas/storyboardWidgetCanvasShared'
import { buildStoryboardBoardModel } from '@/components/StoryboardCanvas/storyboardModel'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import { Z_INDEX_GRAPH_OVERLAY_EDGES } from '@/lib/ui/zIndex'
import { readFlowWidgetDragPayloadFromDataTransfer, resolveFlowWidgetDragEventReleaseClientPoint } from '@/lib/storyboardWidget/widgetDrag'
import {
  MEDIA_POINTER_DRAG_DROP_EVENT,
  claimMediaPointerDragDrop,
  clearMediaPointerDragPayload,
  hasMediaDragPayload,
  isMediaPointerDragDropClaimed,
  isMediaDropClaimedByNestedTarget,
  readMediaDragPayload, resolveMediaDragEventReleaseClientPoint,
  type MediaPointerDragDropDetail,
} from '@/lib/ui/mediaDragPayload'
import { screenToWorld } from '@/lib/zoom/viewport'
import { resolveCanvasViewportMeasureElement } from '@/lib/canvas/viewportMeasureElement'
import { useGraphStore } from '@/hooks/useGraphStore'
import type { GraphData, GraphNode } from '@/lib/graph/types'
import type { WidgetRegistryEntry } from '@/features/storyboard-widget-manager/widgetRegistryTypes'
import { StoryboardWidgetOverlayPortHandleProvider } from '@/components/StoryboardWidget/StoryboardWidgetOverlayPortHandles'
import { FLOW_PORT_HANDLE_SELECTOR, readFlowPortHandleAtClientPoint } from '@/components/StoryboardWidget/flowPortHandlePointerDrag'
import { useStoryboardEdgeCreationRequest } from '@/components/StoryboardWidgetCanvas/runtime/useStoryboardEdgeCreationRequest'
import { useStoryboardSharedSurfacePan } from '@/components/StoryboardWidgetCanvas/runtime/useStoryboardSharedSurfacePan'
import { isStoryboardFixedCardOwnedNode } from '@/components/StoryboardWidgetCanvas/storyboardCardOwnership2d'
import { isStoryboardCardMediaDropEdge } from '@/components/StoryboardWidgetCanvas/storyboardCardMediaDropGraph'
import { resolveFlowWidgetStateGraphKey, resolveScopedFlowWidgetNodeMap } from '@/lib/storyboardWidget/widgetStateScope'
import { resolveGraphNodeByCanonicalId } from '@/lib/graph/canonicalNodeIds'
import { applyStoryboardCanvasGraphPropertyAuthority } from '@/components/StoryboardWidgetCanvas/runtime/storyboardCanvasGraphAuthority'
import { useStableStoryboardCardPlacements2d } from '@/components/StoryboardWidgetCanvas/useStableStoryboardCardPlacements2d'
import { buildRichMediaPanelOverlayExcludeNodeIdSet } from '@/lib/render/richMediaSsot'
import { isRichMediaPanelNode } from '@/lib/render/richMediaPanelNode'
import { readFlowEdgePortKey } from '@/lib/graph/flowPorts'
import { readFiniteRuntimeZoomTransform } from '@/components/StoryboardWidgetCanvas/runtime/useStoryboardWidgetRuntimeScene'
import { resolveCollectiveCameraFollowBaselineRef } from '@/lib/canvas/overlayWidgetZoom'

export default function StoryboardWidgetCanvasSurface(props: {
  rootRef: React.RefObject<HTMLElement | null>
  storyboardWidgetSurfaceId: string
  active: boolean
  canInteract: boolean
  canEdit: boolean
  geospatialWidgetPanelMode?: boolean
  storyboardCardsMode?: boolean
  storyboardWidgetMode?: boolean
  storyboardSourceGraphData?: GraphData | null
  renderGraphDataOverride: GraphData | null
  storyboardWidgetViewActive: boolean
  openWidgetNodeIds?: ReadonlyArray<string> | null
  draftGraphDataRevision: number
  baseGraphDataRevision: number
  flowRuntimeRefRef: React.MutableRefObject<React.MutableRefObject<any> | null>
  hasOverlayEditors: boolean
  emitStoryboardWidgetInteractionFrame: () => void
  overlayOnlyActive: boolean
  overlayEditorNodeCount?: number
  overlayEdgesSvgRef: React.Ref<SVGSVGElement>
  overlayEditorElements: React.ReactNode
  noGraphLoaded: boolean
  toolMode: 'select' | 'addEdge'
  pendingEdgeSourceId: string | null
  beginAddEdgeFromNode: (nodeId: string, portKey?: string | null) => void
  cancelPendingEdge: () => void
  finalizePendingEdge: (nodeId: string, portKey?: string | null, source?: { nodeId: string; portKey: string | null }) => void
  runWorkflowNode: (nodeId: string) => Promise<void> | void
  inspectorPortalHost: HTMLElement | null
  inspectorElement: React.ReactNode
  widgetRegistry: ReadonlyArray<WidgetRegistryEntry>
  shouldDedupeWidgetDrop: (key: string) => boolean
  setCanvasWindowOffsetFromRect: (rect: DOMRect) => void
  getLiveZoomTransform: () => { k: number; x: number; y: number } | null
  zoomViewKeyRef: React.MutableRefObject<string | null>
  addNodeFromRegistryAtWorld: (args: { entry: WidgetRegistryEntry; x: number; y: number }) => void
  addRichMediaPanelFromMediaAtWorld: (args: { media: import('@/lib/ui/mediaDragPayload').MediaDragPayload; releaseClientPoint?: { clientX: number; clientY: number }; x: number; y: number }) => string
  commitStoryboardCardMediaGraph: (graphData: GraphData) => void
  patchNodeById: (nodeId: string, patch: Partial<GraphNode>, sourceGraphData?: GraphData | null) => void
  patchNodePropertiesById: (nodeId: string, patch: Record<string, unknown>, sourceGraphData?: GraphData | null) => void
  removeNodeById: (nodeId: string) => void
  removePendingNodeById: (nodeId: string) => void
  upsertUiToast: (args: { id: string; kind: 'neutral' | 'warning' | 'success' | 'error'; message: string; ttlMs?: number }) => void
  createPortal: typeof import('react-dom').createPortal
}) {
  const flowRuntimeRefRef = props.flowRuntimeRefRef
  const getLiveZoomTransform = props.getLiveZoomTransform
  const cardOverlayInteractionFrameSchedulerRef = React.useRef<null | (() => void)>(null)
  const flushCardOverlayInteractionFrame = React.useCallback(() => {
    cardOverlayInteractionFrameSchedulerRef.current?.()
  }, [])
  const registerCardOverlayInteractionFrameScheduler = React.useCallback((scheduler: null | (() => void)) => {
    cardOverlayInteractionFrameSchedulerRef.current = scheduler
  }, [])
  const getSynchronizedStoryboardCameraTransform = React.useCallback(() => {
    return readFiniteRuntimeZoomTransform(flowRuntimeRefRef.current?.current)
      || getLiveZoomTransform()
  }, [flowRuntimeRefRef, getLiveZoomTransform])
  const canvas2dRenderer = useGraphStore(s => s.canvas2dRenderer)
  const graphContentRevision = useGraphStore(s => s.graphContentRevision)
  const graphDataRevision = useGraphStore(s => s.graphDataRevision)
  const schema = useGraphStore(s => s.schema)
  const strybldrStoryboardCardAspectMode = useGraphStore(s => s.strybldrStoryboardCardAspectMode)
  const flowWidgetPinnedByNodeId = useGraphStore(s => s.flowWidgetPinnedByNodeId)
  const flowWidgetPinnedByNodeIdByGraphMetaKey = useGraphStore(s => s.flowWidgetPinnedByNodeIdByGraphMetaKey)
  const canonicalGraphData = useGraphStore(s => s.graphData)
  const storyboardSurfaceRouteActive = String(props.storyboardWidgetSurfaceId || '').trim() === 'storyboard' || canvas2dRenderer === 'storyboard'
  const storyboardCardsActive = props.storyboardCardsMode === true && storyboardSurfaceRouteActive
  const storyboardSharedSurfaceActive =
    (props.storyboardCardsMode === true || props.storyboardWidgetMode === true) && storyboardSurfaceRouteActive
  const flowWidgetStateGraphKey = React.useMemo(
    () => resolveFlowWidgetStateGraphKey({ graphData: props.storyboardSourceGraphData || null }),
    [props.storyboardSourceGraphData],
  )
  const storyboardCollectiveZoomBaselineKey = `${props.storyboardWidgetSurfaceId}|${flowWidgetStateGraphKey || ''}`
  const storyboardCollectiveZoomBaselineKRef = resolveCollectiveCameraFollowBaselineRef(
    storyboardCollectiveZoomBaselineKey,
  )
  const effectiveFlowWidgetPinnedByNodeId = React.useMemo(() => resolveScopedFlowWidgetNodeMap({
    graphMetaKey: flowWidgetStateGraphKey,
    keyedByGraphMetaKey: flowWidgetPinnedByNodeIdByGraphMetaKey,
    globalByNodeId: flowWidgetPinnedByNodeId,
  }), [flowWidgetPinnedByNodeId, flowWidgetPinnedByNodeIdByGraphMetaKey, flowWidgetStateGraphKey])
  const storyboardSourceGraphData = React.useMemo(() => applyStoryboardCanvasGraphPropertyAuthority({
    graphData: props.storyboardSourceGraphData,
    propertyAuthorityGraphData: canonicalGraphData,
  }), [canonicalGraphData, graphContentRevision, graphDataRevision, props.storyboardSourceGraphData])
  const stableStoryboardCardPlacements = useStableStoryboardCardPlacements2d({
    aspectRatioMode: strybldrStoryboardCardAspectMode,
    graphData: storyboardSourceGraphData,
    graphRevision: graphContentRevision || graphDataRevision || 0,
    layoutKey: flowWidgetStateGraphKey || props.storyboardWidgetSurfaceId,
    schema,
    widgetRegistry: props.widgetRegistry,
  })
  const storyboardGraphData = React.useMemo(() => {
    if (!storyboardSharedSurfaceActive) return null
    return applyFixedStoryboardCardPlacementsToGraphData2d({
      aspectRatioMode: strybldrStoryboardCardAspectMode,
      flowWidgetPinnedByNodeId: effectiveFlowWidgetPinnedByNodeId,
      graphData: storyboardSourceGraphData,
      graphRevision: graphContentRevision || graphDataRevision || 0,
      referencePlacements: stableStoryboardCardPlacements,
      readPlacementSize: props.storyboardWidgetMode === true
        ? node => readStoryboardWidgetPlacementSize2d(node, strybldrStoryboardCardAspectMode)
        : undefined,
      schema,
      widgetRegistry: props.widgetRegistry,
    })
  }, [effectiveFlowWidgetPinnedByNodeId, graphContentRevision, graphDataRevision, schema, stableStoryboardCardPlacements, storyboardSharedSurfaceActive, storyboardSourceGraphData, strybldrStoryboardCardAspectMode])
  const storyboardFixedCardNodeIds = React.useMemo(() => {
    if (!storyboardSharedSurfaceActive) return []
    const board = buildStoryboardBoardModel({
      graphData: storyboardGraphData,
      graphRevision: graphContentRevision || graphDataRevision || 0,
      widgetRegistry: props.widgetRegistry,
    })
    const nodeById = new Map<string, GraphNode>()
    const nodes = Array.isArray(storyboardGraphData?.nodes) ? storyboardGraphData.nodes : []
    for (let i = 0; i < nodes.length; i += 1) {
      const node = nodes[i]
      const id = String(node?.id || '').trim()
      if (id) nodeById.set(id, node)
    }
    const fixedCardNodeIds = board.lanes
      .flatMap(lane => lane.cards.map(card => String(card.id || '').trim()))
      .filter(id => isStoryboardFixedCardOwnedNode(resolveGraphNodeByCanonicalId(storyboardGraphData, id)))
    return fixedCardNodeIds
  }, [graphContentRevision, graphDataRevision, props.widgetRegistry, storyboardSharedSurfaceActive, storyboardGraphData])
  const storyboardNodeById = React.useMemo(() => {
    const nodeById = new Map<string, GraphNode>()
    for (const node of storyboardGraphData?.nodes || []) {
      const id = String(node?.id || '').trim()
      if (id) nodeById.set(id, node)
    }
    return nodeById
  }, [storyboardGraphData])
  const explicitOpenWidgetNodeIds = React.useMemo(() => (
    props.storyboardWidgetMode === true && Array.isArray(props.openWidgetNodeIds)
      ? props.openWidgetNodeIds
      : []
  ), [props.openWidgetNodeIds, props.storyboardWidgetMode])
  const storyboardOpenWidgetNodeIds = React.useMemo(() => {
    if (!storyboardSharedSurfaceActive) return []
    const resolvedIds = new Set<string>()
    for (const rawId of explicitOpenWidgetNodeIds) {
      const id = String(resolveGraphNodeByCanonicalId(storyboardGraphData, rawId)?.id || '').trim()
      if (id) resolvedIds.add(id)
    }
    return Array.from(resolvedIds)
  }, [explicitOpenWidgetNodeIds, storyboardGraphData, storyboardSharedSurfaceActive])
  const openRichMediaPanelNodeIds = React.useMemo(() => Array.from(buildRichMediaPanelOverlayExcludeNodeIdSet({
    graphData: storyboardGraphData,
    nodeById: storyboardNodeById,
    candidateRawIds: explicitOpenWidgetNodeIds,
  })), [explicitOpenWidgetNodeIds, storyboardGraphData, storyboardNodeById])
  const storyboardOverlayConsumerNodeIds = React.useMemo(() => Array.from(new Set([
    ...storyboardFixedCardNodeIds,
    ...storyboardOpenWidgetNodeIds,
  ])), [storyboardFixedCardNodeIds, storyboardOpenWidgetNodeIds])
  const storyboardCardOwnedMediaPanelNodeIds = React.useMemo(() => {
    if (!storyboardSharedSurfaceActive || storyboardOverlayConsumerNodeIds.length === 0) return []
    const overlayConsumerNodeIdSet = new Set(storyboardOverlayConsumerNodeIds)
    const sourceIds = new Set((storyboardGraphData?.edges || [])
      .filter(edge => {
        const targetId = String(resolveGraphNodeByCanonicalId(storyboardGraphData, edge.target)?.id || '').trim()
        if (!overlayConsumerNodeIdSet.has(targetId)) return false
        const sourceNode = resolveGraphNodeByCanonicalId(storyboardGraphData, edge.source)
        if (!isRichMediaPanelNode(sourceNode)) return false
        return isStoryboardCardMediaDropEdge(edge, targetId) || readFlowEdgePortKey(edge, 'target') === 'mediaUrl'
      })
      .map(edge => String(resolveGraphNodeByCanonicalId(storyboardGraphData, edge.source)?.id || '').trim())
      .filter(Boolean))
    return (storyboardGraphData?.nodes || [])
      .map(node => String(node?.id || '').trim())
      .filter(nodeId => sourceIds.has(nodeId))
      .filter(Boolean)
  }, [storyboardGraphData, storyboardOverlayConsumerNodeIds, storyboardSharedSurfaceActive])
  const readFlowCanvasBaseGraphDataOverride = React.useCallback(() => {
    const flowCanvasGraphDataOverride = storyboardSharedSurfaceActive ? storyboardGraphData : props.renderGraphDataOverride
    return flowCanvasGraphDataOverride
  }, [props.renderGraphDataOverride, storyboardGraphData, storyboardSharedSurfaceActive])
  const flowCanvasGraphDataOverride = React.useMemo(() => {
    return readFlowCanvasBaseGraphDataOverride()
  }, [readFlowCanvasBaseGraphDataOverride])
  const storyboardEdgeGraphData = storyboardSharedSurfaceActive ? storyboardGraphData : flowCanvasGraphDataOverride
  const flowCanvasNativeSceneExcludedNodeIds = React.useMemo(() => (
    storyboardSharedSurfaceActive
      ? Array.from(new Set([
          ...storyboardOverlayConsumerNodeIds,
          ...storyboardCardOwnedMediaPanelNodeIds,
          ...openRichMediaPanelNodeIds,
        ]))
      : undefined
  ), [openRichMediaPanelNodeIds, storyboardCardOwnedMediaPanelNodeIds, storyboardOverlayConsumerNodeIds, storyboardSharedSurfaceActive])
  const flowCanvasRichMediaOverlayExcludedNodeIds = React.useMemo(
    () => Array.from(new Set(openRichMediaPanelNodeIds)),
    [openRichMediaPanelNodeIds],
  )
  const storyboardSurfaceGraphSignature = React.useMemo(() => {
    return [
      String(storyboardSharedSurfaceActive),
      String(Array.isArray(props.storyboardSourceGraphData?.nodes) ? props.storyboardSourceGraphData.nodes.length : 0),
      String(Array.isArray(storyboardGraphData?.nodes) ? storyboardGraphData.nodes.length : 0),
      String(flowCanvasNativeSceneExcludedNodeIds?.length || 0),
      String(Array.isArray(flowCanvasGraphDataOverride?.nodes) ? flowCanvasGraphDataOverride.nodes.length : 0),
    ].join('::')
  }, [
    flowCanvasGraphDataOverride,
    props.storyboardSourceGraphData,
    storyboardGraphData,
    storyboardSharedSurfaceActive,
    flowCanvasNativeSceneExcludedNodeIds?.length,
  ])
  const reportedStoryboardSurfaceGraphSignatureRef = React.useRef('')
  React.useEffect(() => {
    if (!storyboardCardsActive) return
    if (!storyboardSurfaceGraphSignature || reportedStoryboardSurfaceGraphSignatureRef.current === storyboardSurfaceGraphSignature) return
    reportedStoryboardSurfaceGraphSignatureRef.current = storyboardSurfaceGraphSignature
  }, [
    flowCanvasGraphDataOverride,
    props.storyboardSourceGraphData,
    storyboardCardsActive,
    storyboardGraphData,
    flowCanvasNativeSceneExcludedNodeIds,
    storyboardSurfaceGraphSignature,
  ])
  useStoryboardEdgeCreationRequest({ active: storyboardCardsActive, beginEdge: props.beginAddEdgeFromNode, graphData: storyboardEdgeGraphData })
  useStoryboardSharedSurfacePan({
    active: props.active,
    emitInteractionFrame: props.emitStoryboardWidgetInteractionFrame,
    getLiveZoomTransform: getSynchronizedStoryboardCameraTransform,
    rootRef: props.rootRef,
    storyboardWidgetSurfaceId: props.storyboardWidgetSurfaceId,
    zoomViewKeyRef: props.zoomViewKeyRef,
  })
  const readSurfaceDrop = React.useCallback((clientX: number, clientY: number) => {
    const rect = resolveCanvasViewportMeasureElement(props.rootRef.current)?.getBoundingClientRect() || null
    if (!rect) return null
    props.setCanvasWindowOffsetFromRect(rect)
    const sx = clientX - rect.left
    const sy = clientY - rect.top
    if (!Number.isFinite(sx) || !Number.isFinite(sy) || sx < 0 || sy < 0 || sx > rect.width || sy > rect.height) return null
    const transform = readResolvedStoryboardWidgetDropTransform({
      getLiveZoomTransform: getSynchronizedStoryboardCameraTransform,
      zoomViewKeyRef: props.zoomViewKeyRef,
      draftGraphDataRef: { current: flowCanvasGraphDataOverride || props.renderGraphDataOverride || props.storyboardSourceGraphData || null },
      baseGraphData: props.storyboardSourceGraphData || null,
      useProjectedRichMediaShell: true,
      screenOrigin: { left: rect.left, top: rect.top },
    })
    return screenToWorld({
      transform,
      sx,
      sy,
    })
  }, [flowCanvasGraphDataOverride, getSynchronizedStoryboardCameraTransform, props])

  const appendMediaPanelAtClientPoint = React.useCallback((payload: import('@/lib/ui/mediaDragPayload').MediaDragPayload, clientX: number, clientY: number) => {
    if (props.geospatialWidgetPanelMode || !props.canEdit) return false
    if (isMediaDropClaimedByNestedTarget(clientX, clientY)) return false
    const mediaUrl = String(payload?.url || '').trim()
    if (!mediaUrl) return false
    const pos = readSurfaceDrop(clientX, clientY)
    if (!pos) return false
    const actualId = props.addRichMediaPanelFromMediaAtWorld({ media: { ...payload, url: mediaUrl }, releaseClientPoint: { clientX, clientY }, x: pos.x, y: pos.y })
    if (!actualId) return false
    props.upsertUiToast({ id: 'storyboard-widget-drop-media', kind: 'neutral', message: 'Created Rich Media Panel node.', ttlMs: 1500 })
    clearMediaPointerDragPayload()
    return true
  }, [props, readSurfaceDrop])

  const isMediaPointerDropDistanceAccepted = React.useCallback((detail: MediaPointerDragDropDetail) => {
    if (!Number.isFinite(detail.startClientX) || !Number.isFinite(detail.startClientY)) return true
    const dx = detail.clientX - Number(detail.startClientX)
    const dy = detail.clientY - Number(detail.startClientY)
    return Math.hypot(dx, dy) >= 6
  }, [])

  React.useEffect(() => {
    if (!props.active || props.geospatialWidgetPanelMode || !props.canEdit || typeof window === 'undefined') return
    const handleCanvasPointerDragDrop = (event: Event) => {
      const detail = (event as CustomEvent<MediaPointerDragDropDetail>).detail
      if (!detail?.payload) return
      if (isMediaPointerDragDropClaimed(detail)) return
      if (!isMediaPointerDropDistanceAccepted(detail)) return
      claimMediaPointerDragDrop(detail)
      try {
        event.preventDefault()
        event.stopPropagation()
        ;(event as unknown as { stopImmediatePropagation?: () => void }).stopImmediatePropagation?.()
      } catch {
        void 0
      }
      if (!appendMediaPanelAtClientPoint(detail.payload, detail.clientX, detail.clientY)) {
        detail.__kgMediaPointerDropClaimed = false
        return
      }
    }
    window.addEventListener(MEDIA_POINTER_DRAG_DROP_EVENT, handleCanvasPointerDragDrop, true)
    return () => window.removeEventListener(MEDIA_POINTER_DRAG_DROP_EVENT, handleCanvasPointerDragDrop, true)
  }, [appendMediaPanelAtClientPoint, isMediaPointerDropDistanceAccepted, props.active, props.canEdit, props.geospatialWidgetPanelMode])

  React.useEffect(() => {
    if (!props.active || !props.canEdit || typeof window === 'undefined') return
    const handlePointerDown = (event: PointerEvent | MouseEvent) => {
      if (event.button !== 0 || props.toolMode !== 'addEdge') return
      const target = event.target instanceof Element ? event.target : null
      if (target?.closest(FLOW_PORT_HANDLE_SELECTOR)) return
      if (readFlowPortHandleAtClientPoint({ clientX: event.clientX, clientY: event.clientY })) return
      props.cancelPendingEdge()
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || props.toolMode !== 'addEdge') return
      props.cancelPendingEdge()
      try {
        event.preventDefault()
        event.stopPropagation()
      } catch {
        void 0
      }
    }
    window.addEventListener('pointerdown', handlePointerDown, true)
    window.addEventListener('mousedown', handlePointerDown, true)
    window.addEventListener('keydown', handleKeyDown, true)
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown, true)
      window.removeEventListener('mousedown', handlePointerDown, true)
      window.removeEventListener('keydown', handleKeyDown, true)
    }
  }, [props])

  return (
    <section
      ref={props.rootRef}
      className={`absolute inset-0 z-0 ${props.geospatialWidgetPanelMode ? 'pointer-events-none' : ''}`}
      aria-label="Storyboard"
      data-kg-storyboard-widget-surface-root={props.storyboardWidgetSurfaceId}
      data-kg-storyboard-display-mode={storyboardCardsActive ? 'card' : props.storyboardWidgetMode === true ? 'widget' : undefined}
      data-kg-storyboard-native-excluded-node-count={storyboardSharedSurfaceActive ? String(flowCanvasNativeSceneExcludedNodeIds?.length || 0) : undefined}
      data-kg-storyboard-overlay-node-count={storyboardSharedSurfaceActive ? String(props.overlayEditorNodeCount || 0) : undefined}
      onDragOverCapture={(ev) => {
        if (props.geospatialWidgetPanelMode || !props.canEdit) return
        if (ev.dataTransfer && hasMediaDragPayload(ev.dataTransfer)) {
          ev.preventDefault()
          try {
            ev.dataTransfer.dropEffect = 'copy'
          } catch {
            void 0
          }
          return
        }
        ev.preventDefault()
        try {
          ev.dataTransfer.dropEffect = 'copy'
        } catch {
          void 0
        }
      }}
      onDropCapture={(ev) => {
        if (props.geospatialWidgetPanelMode || !props.canEdit) return
        if (ev.dataTransfer && hasMediaDragPayload(ev.dataTransfer)) {
          const mediaPayload = readMediaDragPayload(ev.dataTransfer)
          const release = resolveMediaDragEventReleaseClientPoint(ev.nativeEvent)
          if (mediaPayload && appendMediaPanelAtClientPoint(mediaPayload, release.clientX, release.clientY)) {
            ev.preventDefault()
            ev.stopPropagation()
          }
          return
        }
        const payload = readFlowWidgetDragPayloadFromDataTransfer({ getData: mime => ev.dataTransfer.getData(mime) })
        if (!payload) return
        const entry = (props.widgetRegistry || []).find(e => e && e.isEnabled && e.id === payload.registryEntryId) || null
        if (!entry) return
        const el = resolveCanvasViewportMeasureElement(props.rootRef.current)
        const rect = el ? el.getBoundingClientRect() : null
        if (!rect) return
        props.setCanvasWindowOffsetFromRect(rect)
        const release = resolveFlowWidgetDragEventReleaseClientPoint(ev.nativeEvent)
        const sx = release.clientX - rect.left
        const sy = release.clientY - rect.top
        if (!Number.isFinite(sx) || !Number.isFinite(sy) || sx < 0 || sy < 0 || sx > rect.width || sy > rect.height) return
        const pos = readSurfaceDrop(release.clientX, release.clientY)
        if (!pos) return
        const dropKey = `${payload.registryEntryId}:${Math.round(sx)}:${Math.round(sy)}`
        if (props.shouldDedupeWidgetDrop(dropKey)) {
          ev.preventDefault()
          ev.stopPropagation()
          return
        }
        props.addNodeFromRegistryAtWorld({ entry, x: pos.x, y: pos.y })
        props.upsertUiToast({
          id: 'storyboard-widget-drop-widget',
          kind: 'neutral',
          message: `Created ${entry.nodeTypeId} node.`,
          ttlMs: 1500,
        })
        ev.preventDefault()
        ev.stopPropagation()
      }}
    >
      <StoryboardWidgetOverlayPortHandleProvider
        active={props.canEdit}
        graphData={storyboardEdgeGraphData}
        pendingEdgeSourceId={props.pendingEdgeSourceId}
        registryEntries={props.widgetRegistry}
        schema={schema}
        toolMode={props.toolMode}
        beginEdge={props.beginAddEdgeFromNode}
        cancelEdge={props.cancelPendingEdge}
        finalizeEdge={props.finalizePendingEdge}
      >
      {!props.noGraphLoaded && (
        <FlowCanvas
          active={props.active}
          storyboardWidgetSurfaceId={props.storyboardWidgetSurfaceId}
          allowNodeDragOverride={props.canInteract}
          graphDataOverride={flowCanvasGraphDataOverride}
          mutationSourceGraphDataOverride={storyboardSourceGraphData || flowCanvasGraphDataOverride}
          graphDataRevisionOverride={props.storyboardWidgetViewActive ? props.draftGraphDataRevision : props.baseGraphDataRevision}
          excludeNativeSceneNodeIds={flowCanvasNativeSceneExcludedNodeIds}
          excludeRichMediaOverlayNodeIds={flowCanvasRichMediaOverlayExcludedNodeIds}
          flowWidgetPinnedByNodeIdOverride={effectiveFlowWidgetPinnedByNodeId}
          flowWidgetStateGraphKeyOverride={flowWidgetStateGraphKey}
          storyboardCollectiveZoomBaselineKRef={storyboardCollectiveZoomBaselineKRef}
          onNodeChange={props.patchNodeById}
          onNodePropertiesChange={props.patchNodePropertiesById}
          onNodeRemove={props.removeNodeById}
          exposeRuntimeRef={ref => {
            props.flowRuntimeRefRef.current = ref
          }}
          onInteractionFrame={props.hasOverlayEditors ? props.emitStoryboardWidgetInteractionFrame : undefined}
          onOverlayInteractionFrame={storyboardCardsActive ? flushCardOverlayInteractionFrame : undefined}
        />
      )}

      {(props.overlayOnlyActive || props.hasOverlayEditors || storyboardCardsActive) && (
        <svg
          ref={props.overlayEdgesSvgRef}
          className={UI_RESPONSIVE_PASSIVE_FILL_SURFACE_CLASSNAME}
          style={{
            zIndex: Z_INDEX_GRAPH_OVERLAY_EDGES,
            color: 'var(--kg-canvas-edge-stroke, #9ca3af)',
            overflow: 'visible',
            opacity: 1,
            visibility: 'visible',
          }}
          aria-hidden={true}
        />
      )}

      {props.overlayEditorElements}
      <StoryboardCardOverlayLayer2d
        active={storyboardCardsActive}
        commitGraphData={props.commitStoryboardCardMediaGraph}
        flowWidgetPinnedByNodeId={effectiveFlowWidgetPinnedByNodeId}
        flowWidgetStateGraphKey={flowWidgetStateGraphKey}
        fixedCardReferencePlacements={stableStoryboardCardPlacements}
        storyboardWidgetSurfaceId={props.storyboardWidgetSurfaceId}
        storyboardCollectiveZoomBaselineKRef={storyboardCollectiveZoomBaselineKRef}
        getTransform={getSynchronizedStoryboardCameraTransform}
        getWheelForwardTarget={() => props.rootRef.current?.querySelector('[data-kg-canvas-interactive="1"]') || null}
        graphData={storyboardGraphData}
        graphRevision={graphContentRevision || graphDataRevision || 0}
        onNodeChange={props.patchNodeById}
        removeNodeById={props.removeNodeById}
        removePendingNodeById={props.removePendingNodeById}
        runWorkflowNode={props.runWorkflowNode}
        schema={schema}
        widgetRegistry={props.widgetRegistry}
        registerInteractionFrameProjectionScheduler={registerCardOverlayInteractionFrameScheduler}
      />

      {props.noGraphLoaded && !props.geospatialWidgetPanelMode && (
        <aside className="absolute top-3 left-3 z-[220]" aria-label="Storyboard Status">
          <section className={`rounded-lg border px-3 py-2 ${UI_THEME_TOKENS.panel.bg} ${UI_THEME_TOKENS.input.border}`}>
            <p className={`text-xs ${UI_THEME_TOKENS.text.secondary}`}>No graph loaded.</p>
          </section>
        </aside>
      )}

      {!props.hasOverlayEditors && props.toolMode === 'addEdge' && props.canEdit && (
        <aside className="absolute top-16 left-3 z-[220]" aria-label="Add edge hint">
          <section className={`rounded-lg border px-3 py-2 ${UI_THEME_TOKENS.panel.bg} ${UI_THEME_TOKENS.input.border}`}>
            <p className={`text-xs ${UI_THEME_TOKENS.text.secondary}`}>
              {props.pendingEdgeSourceId
                ? `Multi-connect from ${props.pendingEdgeSourceId}: choose inputs for fan-out or another output for fan-in. Click canvas or press Escape to finish.`
                : 'Select source node.'}
            </p>
          </section>
        </aside>
      )}

      {props.inspectorPortalHost ? props.createPortal(props.inspectorElement, props.inspectorPortalHost) : null}
      </StoryboardWidgetOverlayPortHandleProvider>
    </section>
  )
}
