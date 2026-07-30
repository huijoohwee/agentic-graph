import * as d3 from 'd3'

import { useGraphStore } from '@/hooks/useGraphStore'
import { fitStoryboardWidgetPinnedWidgets } from '@/components/FlowCanvas/fitPinnedWidgets'
import { buildFlowFitOptions, readStoryboardWidgetPortExtraPadScreenPx, resolveFitReferenceFrame } from '@/components/FlowCanvas/fitRuntime'
import { fitAllTransform } from '@/components/GraphCanvas/fit'
import { readZoomScaleExtent } from '@/lib/graph/layoutDefaults'
import type { ZoomRequest } from '@/lib/zoom/requests'
import type { GraphData } from '@/lib/graph/types'
import { setFlowNativeTransform, type FlowNativeRuntime } from '@/components/FlowCanvas/nativeRuntime'
import { resolveStoryboardWidgetVisibleViewport } from '@/components/FlowCanvas/storyboardWidgetZoomViewport'
import { collectCanonicalStoryboardWidgetOverlayRectEntries, readStoryboardWidgetOverlaySurfaceId, RICH_MEDIA_OVERLAY_ROOT_SELECTOR, SEMANTIC_FLOW_OVERLAY_ROOT_SELECTOR, STORYBOARD_WIDGET_OVERLAY_ROOT_SELECTOR, STORYBOARD_WIDGET_OVERLAY_SURFACE_ROOT_ATTR } from '@/lib/canvas/storyboard-widget-overlay-proxy'
import { recenterStoryboardWidgetOverlayWidgetPositions } from '@/components/FlowCanvas/storyboardWidgetOverlayRecenter'
import { easeOutCubic01, lerpNumber } from '@/lib/canvas/zoom-smoothing'
import { getFlowAutoMinScale, setFlowAutoMinScale } from '@/components/FlowCanvas/flowScaleExtentOverride'
import { DEFAULT_TOOLBAR_ZOOM_CONFIG } from '@/lib/zoom/toolbarZoom'
import { resolveZoomRequest2d } from '@/lib/zoom/resolveZoomRequest2d'
import { computeTransformScaleAboutViewportFrameCenter } from '@/lib/zoom/viewport'
import { isWorkspaceEditorOverlayOpen } from '@/features/workspace-table/workspaceTableSsot'
import { resolveFlowWidgetStateGraphKey } from '@/lib/storyboardWidget/widgetStateScope'
import { resolveScopedFlowWidgetNodeMap } from '@/lib/storyboardWidget/widgetStateScope'
import { buildGraphMetaKeyIgnoringPending } from '@/lib/graph/graphMetaKey'
import { measureLayoutRectSet } from '@/lib/canvas/layoutCentroid'
import { isStoryboardCanvas2dRenderer, resolveCanvas2dRendererId } from '@/lib/config.render'
import { readStoryboardCardSize2d } from '@/components/StoryboardWidgetCanvas/storyboardCardPlacements2d'
import {
  buildCollectiveCameraFollowBaselineKey,
  resetCollectiveCameraFollowBaseline,
} from '@/lib/canvas/overlayWidgetZoom'
const FLOW_ZOOM_MAX_VISUAL_CAP = 24

const escapeCssAttrValue = (value: string): string => {
  try {
    const escape = (globalThis as { CSS?: { escape?: (input: string) => string } }).CSS?.escape
    if (typeof escape === 'function') return escape(value)
  } catch {
    void 0
  }
  return value.replace(/["\\\]]/g, '\\$&')
}

const FLOW_ZOOM_REQUEST_ANIMS = new WeakMap<FlowNativeRuntime, { rafId: number | null; token: number }>()

export function collectStoryboardWidgetOverlayBounds(activeSurfaceId: string) {
  if (typeof document === 'undefined') return null
  const normalizedSurfaceId = String(activeSurfaceId || '').trim()
  const hasSurfaceId = normalizedSurfaceId.length > 0
  const surfaceRoot = hasSurfaceId
    ? document.querySelector<HTMLElement>(
      `[${STORYBOARD_WIDGET_OVERLAY_SURFACE_ROOT_ATTR}="${escapeCssAttrValue(normalizedSurfaceId)}"]`,
    )
    : null
  const surfaceRect = surfaceRoot?.getBoundingClientRect() || null
  const surfaceOffsetLeft = Number.isFinite(surfaceRect?.left) ? Number(surfaceRect?.left) : 0
  const surfaceOffsetTop = Number.isFinite(surfaceRect?.top) ? Number(surfaceRect?.top) : 0
  const merged = new Map<string, { left: number; right: number; top: number; bottom: number; area: number }>()
  const pushEntries = (selector: string) => {
    // Storyboard Widget overlays are portal-mounted fixed elements, so surfaceRoot is
    // only the coordinate origin. Scope membership by surface id instead.
    const queryRoot: ParentNode = document
    const els = Array.from(queryRoot.querySelectorAll(selector))
      .filter((el): el is HTMLElement => el instanceof HTMLElement)
      .filter(el => !hasSurfaceId || readStoryboardWidgetOverlaySurfaceId(el) === normalizedSurfaceId)
    for (const entry of collectCanonicalStoryboardWidgetOverlayRectEntries(els)) {
      const area = Math.max(0, entry.rect.width) * Math.max(0, entry.rect.height)
      const previous = merged.get(entry.id)
      if (previous && previous.area >= area) continue
      merged.set(entry.id, {
        left: entry.rect.left - surfaceOffsetLeft,
        right: entry.rect.right - surfaceOffsetLeft,
        top: entry.rect.top - surfaceOffsetTop,
        bottom: entry.rect.bottom - surfaceOffsetTop,
        area,
      })
    }
  }
  pushEntries(STORYBOARD_WIDGET_OVERLAY_ROOT_SELECTOR)
  pushEntries(RICH_MEDIA_OVERLAY_ROOT_SELECTOR)
  pushEntries(SEMANTIC_FLOW_OVERLAY_ROOT_SELECTOR)
  const entries = Array.from(merged.values()).filter(entry =>
    Number.isFinite(entry.left)
    && Number.isFinite(entry.right)
    && Number.isFinite(entry.top)
    && Number.isFinite(entry.bottom),
  )
  if (entries.length === 0) return null
  const ids = Array.from(merged.keys()).map(id => String(id || '').trim()).filter(Boolean)
    .sort((leftId, rightId) => leftId.localeCompare(rightId))
  let minX = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let minY = Number.POSITIVE_INFINITY
  let maxY = Number.NEGATIVE_INFINITY
  for (const entry of entries) {
    minX = Math.min(minX, entry.left)
    maxX = Math.max(maxX, entry.right)
    minY = Math.min(minY, entry.top)
    maxY = Math.max(maxY, entry.bottom)
  }
  if (![minX, maxX, minY, maxY].every(Number.isFinite)) return null
  return { minX, maxX, minY, maxY, width: Math.max(1, maxX - minX), height: Math.max(1, maxY - minY), ids, count: ids.length }
}

export function recenterVisibleStoryboardWidgetOverlayCentroid(args: {
  runtime: FlowNativeRuntime
  viewportW: number
  viewportH: number
  storyboardWidgetSurfaceId?: string
  graphData?: GraphData | null
  onFrame?: () => void
  onCommit?: () => void
}) {
  if (typeof document === 'undefined') return
  const activeSurfaceId = String(args.storyboardWidgetSurfaceId || '').trim()
  const run = () => {
    const bounds = collectStoryboardWidgetOverlayBounds(activeSurfaceId)
    if (!bounds) return
    const visibleViewport = resolveStoryboardWidgetVisibleViewport({
      storyboardWidgetSurfaceId: activeSurfaceId,
      viewportW: args.viewportW,
      viewportH: args.viewportH,
    })
    const allEntries = [{ left: bounds.minX, right: bounds.maxX, top: bounds.minY, bottom: bounds.maxY }]
    const visibleEntries = allEntries.filter(entry =>
      entry.right > visibleViewport.left
      && entry.bottom > visibleViewport.top
      && entry.left < visibleViewport.right
      && entry.top < visibleViewport.bottom,
    )
    const entries = visibleEntries.length > 0 ? visibleEntries : allEntries
    const metrics = measureLayoutRectSet(entries.map(entry => ({
      left: entry.left,
      top: entry.top,
      width: Math.max(1, entry.right - entry.left),
      height: Math.max(1, entry.bottom - entry.top),
    })))
    if (!metrics) return
    const centroid = { x: metrics.centroidX, y: metrics.centroidY }
    const desiredDeltaX = visibleViewport.centerX - centroid.x
    const desiredDeltaY = visibleViewport.centerY - centroid.y
    const minDeltaX = visibleViewport.left - bounds.minX
    const maxDeltaX = visibleViewport.right - bounds.maxX
    const minDeltaY = visibleViewport.top - bounds.minY
    const maxDeltaY = visibleViewport.bottom - bounds.maxY
    const deltaX = minDeltaX <= maxDeltaX
      ? Math.max(minDeltaX, Math.min(maxDeltaX, desiredDeltaX))
      : desiredDeltaX
    const deltaY = minDeltaY <= maxDeltaY
      ? Math.max(minDeltaY, Math.min(maxDeltaY, desiredDeltaY))
      : desiredDeltaY
    if (Math.abs(deltaX) < 0.5 && Math.abs(deltaY) < 0.5) return
    const current = args.runtime.transform || d3.zoomIdentity
    setFlowNativeTransform(args.runtime, d3.zoomIdentity.translate(current.x + deltaX, current.y + deltaY).scale(current.k))
    recenterStoryboardWidgetOverlayWidgetPositions({ activeSurfaceId, deltaX, deltaY, graphData: args.graphData })
    args.onFrame?.()
    args.onCommit?.()
  }
  requestAnimationFrame(() => requestAnimationFrame(run))
}

export { resolveStoryboardWidgetVisibleViewport }

export const cancelFlowZoomRequestAnim = (runtime: FlowNativeRuntime) => {
  const prev = FLOW_ZOOM_REQUEST_ANIMS.get(runtime)
  if (!prev) return
  if (prev.rafId != null) {
    try {
      cancelAnimationFrame(prev.rafId)
    } catch {
      void 0
    }
  }
  FLOW_ZOOM_REQUEST_ANIMS.set(runtime, { rafId: null, token: prev.token + 1 })
}

export const applyZoomRequestNative = (args: {
  zoomRequest: ZoomRequest
  runtime: FlowNativeRuntime
  graphData: GraphData | null
  storyboardWidgetSurfaceId?: string
  canvas2dRendererOverride?: unknown
  width: number
  height: number
  selectedNodeId: string | null
  selectedEdgeId: string | null
  selectedGroupId?: string | null
  selectedNodeIds?: string[]
  selectedEdgeIds?: string[]
  selectedGroupIds?: string[]
  onFrame?: () => void
  onCommit?: () => void
}) => {
  const clear = () => {
    try {
      useGraphStore.getState().clearZoomRequest()
    } catch {
      void 0
    }
  }
  const state = useGraphStore.getState()
  const canvas2dRenderer = resolveCanvas2dRendererId(args.canvas2dRendererOverride ?? state.canvas2dRenderer)
  const workspaceEditorOverlayOpen = isWorkspaceEditorOverlayOpen(state)
  const schema = state.schema
  if (!schema) {
    clear()
    return
  }
  const t0 = args.runtime.transform || d3.zoomIdentity
  const [schemaMinK, schemaMaxK] = readZoomScaleExtent(schema)
  const flowMinK = Math.min(schemaMinK, 0.000001)
  const flowMaxK = Math.min(schemaMaxK, FLOW_ZOOM_MAX_VISUAL_CAP)
  const autoMinK = getFlowAutoMinScale(args.runtime)
  const viewportW = Math.max(1, Math.floor(args.width))
  const viewportH = Math.max(1, Math.floor(args.height))
  const fitReferenceFrame = resolveFitReferenceFrame({
    viewportW,
    viewportH,
    referenceWidth: state.viewportFitReferenceWidth,
    referenceHeight: state.viewportFitReferenceHeight,
  })
  const visibleViewport = resolveStoryboardWidgetVisibleViewport({
    storyboardWidgetSurfaceId: args.storyboardWidgetSurfaceId,
    viewportW,
    viewportH,
  })
  const naturalInitializationRequest =
    args.zoomRequest.type === 'transform'
    && args.zoomRequest.intent === 'naturalInitialization'
  const effectiveZoomRequest: ZoomRequest =
    args.zoomRequest.type === 'transform'
    && args.zoomRequest.intent === 'naturalInitialization'
    ? {
        ...args.zoomRequest,
        payload: {
          k: args.zoomRequest.payload.k,
          x: visibleViewport.centerX,
          y: visibleViewport.centerY,
        },
      }
    : args.zoomRequest
  const isStoryboardWidgetFitLikeRequest =
    state.canvasRenderMode === '2d'
    && isStoryboardCanvas2dRenderer(canvas2dRenderer)
    && (
      args.zoomRequest.type === 'reset'
      || args.zoomRequest.type === 'fit'
    )
  const isStoryboardWidgetCollectiveOutRequest =
    state.canvasRenderMode === '2d'
    && isStoryboardCanvas2dRenderer(canvas2dRenderer)
    && args.zoomRequest.type === 'out'
  const isStoryboardWidgetContextualZoomRequest =
    state.canvasRenderMode === '2d'
    && isStoryboardCanvas2dRenderer(canvas2dRenderer)
    && (
      args.zoomRequest.type === 'in'
      || args.zoomRequest.type === 'out'
    )
  const isStoryboardWidgetZoomPresetRequest =
    state.canvasRenderMode === '2d'
    && isStoryboardCanvas2dRenderer(canvas2dRenderer)
    && args.zoomRequest.type === 'transform'
    && (
      args.zoomRequest.intent === 'zoomPreset'
      || naturalInitializationRequest
    )
  const forceImmediateWorkspaceOverlayFit = workspaceEditorOverlayOpen && isStoryboardWidgetFitLikeRequest
  const hasStoryboardWidgetGraphFitData =
    state.canvasRenderMode === '2d'
    && isStoryboardCanvas2dRenderer(canvas2dRenderer)
    && !!args.graphData
    && Array.isArray(args.graphData.nodes)
    && args.graphData.nodes.length > 0
  const isStoryboardWidgetGraphFitRequest =
    isStoryboardWidgetFitLikeRequest
    && hasStoryboardWidgetGraphFitData
  const isStoryboardWidgetCollectiveGraphFitReferenceRequest =
    (isStoryboardWidgetFitLikeRequest || isStoryboardWidgetCollectiveOutRequest)
    && hasStoryboardWidgetGraphFitData
  const fitGraphMeta = ((args.graphData?.metadata || {}) as Record<string, unknown>)
  const fitGraphContext = String(args.graphData?.context || '').trim()
  const fitHasCollectiveOverlayFit =
    (Array.isArray(state.openWidgetNodeIds) && state.openWidgetNodeIds.length > 0)
    || canvas2dRenderer === 'storyboard'
    || String(fitGraphMeta.kind || '').trim() === 'frontmatter-flow'
    || fitGraphContext === 'frontmatter-flow'
  const shouldRecenterStoryboardWidgetCollectiveAfterFit =
    isStoryboardWidgetFitLikeRequest
    && (
      !workspaceEditorOverlayOpen
      || fitHasCollectiveOverlayFit
    )
  const canUseStoryboardWidgetOverlayFitResolved =
    (isStoryboardWidgetFitLikeRequest || isStoryboardWidgetCollectiveOutRequest)
    && (
      !workspaceEditorOverlayOpen
      || fitHasCollectiveOverlayFit
    )
  const storyboardWidgetOverlayFitResolved = canUseStoryboardWidgetOverlayFitResolved
    ? (() => {
        const bounds = collectStoryboardWidgetOverlayBounds(String(args.storyboardWidgetSurfaceId || ''))
        if (!bounds) return null
        const pad = 48
        const fitW = Math.max(1, visibleViewport.width - pad * 2)
        const fitH = Math.max(1, visibleViewport.height - pad * 2)
        const base = args.runtime.transform || d3.zoomIdentity
        const safeBaseK = Number.isFinite(base.k) && base.k > 0 ? base.k : 1
        const scaleBy = Math.min(fitW / bounds.width, fitH / bounds.height)
        const targetK = Math.max(flowMinK, Math.min(flowMaxK, safeBaseK * scaleBy))
        const appliedScale = targetK / safeBaseK
        const metrics = measureLayoutRectSet([{
          left: bounds.minX,
          top: bounds.minY,
          width: Math.max(1, bounds.maxX - bounds.minX),
          height: Math.max(1, bounds.maxY - bounds.minY),
        }])
        const centerX = metrics?.centroidX ?? (bounds.minX + bounds.maxX) / 2
        const centerY = metrics?.centroidY ?? (bounds.minY + bounds.maxY) / 2
        const targetX = visibleViewport.centerX - (centerX - base.x) * appliedScale
        const targetY = visibleViewport.centerY - (centerY - base.y) * appliedScale
        return {
          nextTransform: d3.zoomIdentity.translate(targetX, targetY).scale(targetK),
          durationMs:
            args.zoomRequest.type === 'reset'
              ? 250
              : args.zoomRequest.type === 'out'
                ? DEFAULT_TOOLBAR_ZOOM_CONFIG.durationMs
                : Math.max(0, Math.floor(state.zoomDurationFitMs || 300)),
          nextMinScale: targetK,
        }
      })()
    : null
  const storyboardWidgetCollectiveGraphFitReference = isStoryboardWidgetCollectiveGraphFitReferenceRequest
    ? (() => {
        const intent =
          args.zoomRequest.type === 'fit' && args.zoomRequest.intent === 'fitToScreen'
            ? 'fitToScreen'
            : 'fitToView'
        const fitOpts = buildFlowFitOptions({
          schema,
          intent,
          frontmatterModeEnabled: state.frontmatterModeEnabled === true,
          multiDimTableModeEnabled: state.multiDimTableModeEnabled === true,
          documentSemanticMode: String(state.documentSemanticMode || 'document'),
          documentStructureBaselineLock: state.documentStructureBaselineLock === true,
          enableDocumentStructureBounds: intent !== 'fitToScreen',
          frontmatterFlowInitialFitFillRatio: state.frontmatterFlowInitialFitFillRatio,
        })
        const useWorkspaceOverlayGraphFallbackFit =
          workspaceEditorOverlayOpen
          && !fitHasCollectiveOverlayFit
        const fit = useWorkspaceOverlayGraphFallbackFit
          ? fitAllTransform(
              args.graphData?.nodes || [],
              Math.max(1, visibleViewport.width),
              Math.max(1, visibleViewport.height),
              { ...fitOpts, graphData: args.graphData || undefined },
            )
          : (() => {
              const graphKey = buildGraphMetaKeyIgnoringPending(args.graphData || null)
              return fitStoryboardWidgetPinnedWidgets({
                nodes: args.graphData?.nodes || [],
                fitW: fitReferenceFrame.width,
                viewportW: fitReferenceFrame.width,
                viewportH: fitReferenceFrame.height,
                openWidgetNodeIds: Array.isArray(state.openWidgetNodeIds) ? state.openWidgetNodeIds : [],
                pinnedById: resolveScopedFlowWidgetNodeMap({
                  graphMetaKey: graphKey,
                  keyedByGraphMetaKey: (state as unknown as { flowWidgetPinnedByNodeIdByGraphMetaKey?: Record<string, Record<string, boolean>> }).flowWidgetPinnedByNodeIdByGraphMetaKey,
                  globalByNodeId: state.flowWidgetPinnedByNodeId,
                }),
                worldPosById: resolveScopedFlowWidgetNodeMap({
                  graphMetaKey: graphKey,
                  keyedByGraphMetaKey: (state as unknown as { flowWidgetWorldPosByNodeIdByGraphMetaKey?: Record<string, Record<string, { x: number; y: number }>> }).flowWidgetWorldPosByNodeIdByGraphMetaKey,
                  globalByNodeId: (state as unknown as { flowWidgetWorldPosByNodeId?: Record<string, { x: number; y: number }> }).flowWidgetWorldPosByNodeId,
                }),
                portExtraPadScreenPx: readStoryboardWidgetPortExtraPadScreenPx(schema),
                graphData: args.graphData,
                readOverlayPanelSize: node => readStoryboardCardSize2d(node, state.strybldrStoryboardCardAspectMode),
                frontmatterOverlayFitProxyScales: {
                  phone: state.frontmatterFlowOverlayFitProxyScalePhone,
                  tablet: state.frontmatterFlowOverlayFitProxyScaleTablet,
                  laptop: state.frontmatterFlowOverlayFitProxyScaleLaptop,
                  desktop: state.frontmatterFlowOverlayFitProxyScaleDesktop,
                },
                fitOpts,
              })
            })()
        return {
          nextTransform: fit,
          durationMs:
            args.zoomRequest.type === 'reset'
              ? 250
              : args.zoomRequest.type === 'out'
                ? DEFAULT_TOOLBAR_ZOOM_CONFIG.durationMs
                : Math.max(0, Math.floor(state.zoomDurationFitMs || 300)),
          nextMinScale: fit.k,
        }
      })()
    : null
  const defaultResolved = resolveZoomRequest2d({
    zoomRequest: effectiveZoomRequest,
    graphData: args.graphData,
    schema,
    documentSemanticMode: (state.documentSemanticMode as 'document' | 'keyword' | undefined) ?? undefined,
    graphDataRevision: state.graphDataRevision || 0,
    viewportW,
    viewportH,
    viewportFitReferenceWidth: state.viewportFitReferenceWidth,
    viewportFitReferenceHeight: state.viewportFitReferenceHeight,
    viewPinned: state.viewPinned === true,
    durations: { fitMs: state.zoomDurationFitMs, selectionMs: state.zoomDurationSelectionMs },
    toolbarZoom: DEFAULT_TOOLBAR_ZOOM_CONFIG,
    selectedNodeId: args.selectedNodeId,
    selectedEdgeId: args.selectedEdgeId,
    selectedGroupId: args.selectedGroupId,
    selectedNodeIds: args.selectedNodeIds,
    selectedEdgeIds: args.selectedEdgeIds,
    selectedGroupIds: args.selectedGroupIds,
    currentTransform: t0,
    schemaExtent: { minK: flowMinK, maxK: flowMaxK },
    currentExtent: { minK: autoMinK ?? flowMinK, maxK: flowMaxK },
    cacheKeyBase: '2d',
  })
  const storyboardWidgetCollectiveFitReference =
    storyboardWidgetOverlayFitResolved
    || (fitHasCollectiveOverlayFit ? storyboardWidgetCollectiveGraphFitReference : null)
  const storyboardWidgetCollectiveOutResolved =
    isStoryboardWidgetCollectiveOutRequest
    && storyboardWidgetCollectiveFitReference
    && defaultResolved
    ? (() => {
        const collectiveAutoMinScale = Math.min(
          Number.isFinite(t0.k) ? t0.k : flowMinK,
          storyboardWidgetCollectiveFitReference.nextTransform.k,
        )
        const wantsCollectiveFloor =
          typeof defaultResolved.nextMinScale === 'number'
          && Number.isFinite(defaultResolved.nextMinScale)
          && defaultResolved.nextTransform.k <= defaultResolved.nextMinScale + 1e-9
        if (wantsCollectiveFloor) {
          return {
            nextTransform: storyboardWidgetCollectiveFitReference.nextTransform,
            durationMs: defaultResolved.durationMs,
            nextMinScale: collectiveAutoMinScale,
          }
        }
        return {
          ...defaultResolved,
          nextMinScale: collectiveAutoMinScale,
        }
      })()
    : null
  const storyboardWidgetOutUsesCollectiveFloor =
    isStoryboardWidgetCollectiveOutRequest
    && !!storyboardWidgetCollectiveOutResolved
    && !!defaultResolved
    && typeof defaultResolved.nextMinScale === 'number'
    && Number.isFinite(defaultResolved.nextMinScale)
    && defaultResolved.nextTransform.k <= defaultResolved.nextMinScale + 1e-9
  const storyboardWidgetContextualZoomBase =
    isStoryboardWidgetContextualZoomRequest && !storyboardWidgetOutUsesCollectiveFloor
      ? (storyboardWidgetCollectiveOutResolved || defaultResolved)
      : null
  const storyboardWidgetContextualZoomResolved =
    storyboardWidgetContextualZoomBase
      ? (() => {
          const nextK = storyboardWidgetContextualZoomBase.nextTransform.k
          if (!Number.isFinite(nextK) || nextK <= 0) return null
          const scaled = computeTransformScaleAboutViewportFrameCenter({
            transform: t0,
            viewport: visibleViewport,
            nextK,
          })
          return {
            ...storyboardWidgetContextualZoomBase,
            nextTransform: d3.zoomIdentity.translate(scaled.x, scaled.y).scale(scaled.k),
          }
        })()
      : null
  const shouldRecenterStoryboardWidgetCollectiveAfterZoom =
    isStoryboardWidgetContextualZoomRequest
    && fitHasCollectiveOverlayFit
  const resolved = isStoryboardWidgetFitLikeRequest && storyboardWidgetOverlayFitResolved
    ? storyboardWidgetOverlayFitResolved
    : isStoryboardWidgetGraphFitRequest
    ? storyboardWidgetCollectiveGraphFitReference
    : storyboardWidgetContextualZoomResolved
    ? storyboardWidgetContextualZoomResolved
    : storyboardWidgetCollectiveOutResolved
    ? storyboardWidgetCollectiveOutResolved
    : defaultResolved
  if (!resolved) {
    clear()
    return
  }
  const requestStoryboardWidgetZoomPresetRebalance = () => {
    if (!isStoryboardWidgetZoomPresetRequest) return
    const graphKey = resolveFlowWidgetStateGraphKey({ graphData: args.graphData })
    resetCollectiveCameraFollowBaseline(buildCollectiveCameraFollowBaselineKey({
      surfaceId: args.storyboardWidgetSurfaceId,
      graphKey,
    }))
    state.requestStoryboardWidgetLayoutRebalance({
      reason: 'zoom-preset',
      targetTransform: {
        k: resolved.nextTransform.k,
        x: resolved.nextTransform.x,
        y: resolved.nextTransform.y,
      },
    })
  }
  const nextMinScale = resolved.nextMinScale
  if (typeof nextMinScale === 'number' && Number.isFinite(nextMinScale) && nextMinScale < flowMinK) {
    const prev = getFlowAutoMinScale(args.runtime)
    const combined = prev == null ? nextMinScale : Math.min(prev, nextMinScale)
    setFlowAutoMinScale(args.runtime, combined)
  }
  const recenterStoryboardWidgetCollectiveAfterTransform = () => {
    if (shouldRecenterStoryboardWidgetCollectiveAfterFit) {
      recenterVisibleStoryboardWidgetOverlayCentroid({
        runtime: args.runtime,
        viewportW,
        viewportH,
        storyboardWidgetSurfaceId: args.storyboardWidgetSurfaceId,
        graphData: args.graphData,
        onFrame: args.onFrame,
        onCommit: args.onCommit,
      })
      return
    }
    if (shouldRecenterStoryboardWidgetCollectiveAfterZoom) {
      recenterVisibleStoryboardWidgetOverlayCentroid({
        runtime: args.runtime,
        viewportW,
        viewportH,
        storyboardWidgetSurfaceId: args.storyboardWidgetSurfaceId,
        graphData: args.graphData,
        onFrame: args.onFrame,
        onCommit: args.onCommit,
      })
    }
  }
  clear()
  const durationMs = forceImmediateWorkspaceOverlayFit
    ? 0
    : Math.max(0, Math.floor(resolved.durationMs))
  if (durationMs === 0) {
    cancelFlowZoomRequestAnim(args.runtime)
    setFlowNativeTransform(args.runtime, resolved.nextTransform)
    args.onFrame?.()
    requestStoryboardWidgetZoomPresetRebalance()
    args.onCommit?.()
    recenterStoryboardWidgetCollectiveAfterTransform()
    return
  }
  cancelFlowZoomRequestAnim(args.runtime)
  const prev = FLOW_ZOOM_REQUEST_ANIMS.get(args.runtime)
  const token = (prev?.token || 0) + 1
  FLOW_ZOOM_REQUEST_ANIMS.set(args.runtime, { rafId: null, token })
  const start = performance.now()
  const from = t0
  const to = resolved.nextTransform
  const tick = (now: number) => {
    const st = FLOW_ZOOM_REQUEST_ANIMS.get(args.runtime)
    if (!st || st.token !== token) return
    const raw01 = durationMs > 0 ? (now - start) / durationMs : 1
    const eased = easeOutCubic01(raw01)
    const k = lerpNumber(from.k, to.k, eased)
    const x = lerpNumber(from.x, to.x, eased)
    const y = lerpNumber(from.y, to.y, eased)
    setFlowNativeTransform(args.runtime, d3.zoomIdentity.translate(x, y).scale(k))
    args.onFrame?.()
    if (!(raw01 < 1)) {
      FLOW_ZOOM_REQUEST_ANIMS.set(args.runtime, { rafId: null, token })
      recenterStoryboardWidgetCollectiveAfterTransform()
      requestStoryboardWidgetZoomPresetRebalance()
      args.onCommit?.()
      return
    }
    const rafId = requestAnimationFrame(tick)
    FLOW_ZOOM_REQUEST_ANIMS.set(args.runtime, { rafId, token })
  }
  const rafId = requestAnimationFrame(tick)
  FLOW_ZOOM_REQUEST_ANIMS.set(args.runtime, { rafId, token })
  try {
    useGraphStore.getState().setLifecycleStage('zoomUpdate')
  } catch {
    void 0
  }
}
