import React from 'react'
import { applyPreferredSeedLayoutCells } from '@/components/StoryboardWidget/seedGroupSpread'
import { resolveStoryboardWidgetVisibleViewport } from '@/components/FlowCanvas/applyZoomRequestNative'
import {
  buildFlowOverlayBoundsFromRects,
  deriveFlowOverlayCollectiveViewportState,
  type VisibleFlowViewport,
} from '@/components/FlowCanvas/workspaceVisibleViewportRecovery'
import { useGraphStore } from '@/hooks/useGraphStore'
import { buildOverlayNodeLayoutSignature } from '@/lib/storyboardWidget/overlayTopologyLayoutSignature'
import { isWorkspaceEditorOverlayOpen, isWorkspaceGraphMutationBlocked } from '@/features/workspace-table/workspaceTableSsot'
import { hashScopedStringArraySignature, hashSignatureParts, normalizeStringArrayForSignature } from '@/lib/hash/signature'
import { readGraphDataRevision } from '@/lib/graph/documentMetadata'
import type { GraphData } from '@/lib/graph/types'
import { defaultSchema } from '@/lib/graph/schema'
import { getEffectiveZoomStateForKey, getZoomStateForKey } from '@/lib/canvas/zoom-effective'
import { resolveBalancedViewportPreset, type FrontmatterFlowRenderSettings } from '@/lib/graph/frontmatterFlowSettings'
import { COLLECTIVE_OVERLAY_SCALE_LIMITS_16X9 } from '@/lib/ui/overlayScaleLimits'
import { computeOverlayMaxAnchorShiftPx } from '@/lib/ui/overlayAnchorShift'
import { relaxOverlayPanelsWithCollision } from '@/lib/ui/relaxOverlayPanelsWithCollision'
import { readFlowLayoutKnobs } from '@/lib/graph/layoutDefaults'
import {
  collectCanonicalStoryboardWidgetOverlayRectEntries,
  STORYBOARD_WIDGET_OVERLAY_ROOT_SELECTOR,
  RICH_MEDIA_OVERLAY_ROOT_SELECTOR,
  isTransientOffscreenRichMediaOverlayRoot,
  queryStoryboardWidgetOverlayRootsForSurface,
  shouldReplaceStoryboardWidgetOverlayRectCandidate,
} from '@/lib/canvas/storyboard-widget-overlay-proxy'
import { screenToWorld, worldToScreen } from '@/lib/zoom/viewport'
import { computeCollectiveFollowPinnedScale, computeWidgetScaledSize, WIDGET_BASE_SIZE } from '@/lib/canvas/overlayWidgetZoom'
import { readWidgetGridLayoutSettings, shouldAutoPlaceStoryboardWidget, snapToGridPx } from '@/components/StoryboardWidgetCanvas/storyboardWidgetCanvasShared'
import {
  BALANCED_OVERLAY_SPREAD_TARGET_ASPECT,
  computeBalancedSpreadLayout,
  computeBalancedSpreadViewportMargins,
  computeBalancedSpreadSpacingPx,
  isHorizontalOverlayStrip,
  isVerticalOverlayCluster,
  shouldForceBalancedSpreadReseed,
} from '@/lib/ui/overlayBalancedSpread'
import { getCachedStoryboardWidgetRenderGraph } from '@/components/StoryboardWidgetCanvas/runtime/storyboardWidgetRenderGraph'
import { orderStoryboardWidgetOverlayNodeIdsByRenderGraph } from '@/components/StoryboardWidgetCanvas/runtime/storyboardWidgetOverlayNodeOrder'
import { buildGraphDocumentMetaKey } from '@/lib/graph/graphMetaKey'
import { resolveScopedFlowWidgetNodeMap } from '@/lib/storyboardWidget/widgetStateScope'
import {
  areStoryboardWidgetOverlaysOwnedByFloatingScreenAuthority,
  resolveEffectiveFlowWidgetPinnedInCanvas,
  shouldUseStoryboardWidgetFloatingScreenAuthority,
} from '@/lib/storyboardWidget/widgetPlacementAuthority'
import { reportRuntimeTrace } from '@/lib/debug/runtimeTrace'
import { distinctStoryboardOverlayRectsOverlap } from '@/components/StoryboardWidgetCanvas/runtime/storyboardWidgetRuntimeRichMediaObstacles'
import { resolveStoryboardWidgetDroppedNodeCollisionPolicy } from '@/components/StoryboardWidgetCanvas/runtime/storyboardWidgetDroppedNodeCollisionPolicy'
// #region debug-point A:overlay-collision
const STORYBOARD_MEDIA_PANEL_LOOP_TRACE_SCOPE = 'storyboard-media-panel-loop'
const reportStoryboardMediaPanelLoopOverlayCollisionDebug = (args: {
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

function hasOverlap(
  a: { left: number; top: number; width?: number; height?: number },
  b: { left: number; top: number; width?: number; height?: number },
  fallback: { width: number; height: number },
  gapPx: number,
) {
  const aw = a.width ?? fallback.width
  const ah = a.height ?? fallback.height
  const bw = b.width ?? fallback.width
  const bh = b.height ?? fallback.height
  const ax2 = a.left + aw + gapPx
  const ay2 = a.top + ah + gapPx
  const bx2 = b.left + bw + gapPx
  const by2 = b.top + bh + gapPx
  return a.left < bx2 && b.left < ax2 && a.top < by2 && b.top < ay2
}

const OVERLAY_POSITION_QUANTUM_PX = 1

function quantizeOverlayPos(v: number): number {
  if (!Number.isFinite(v)) return 0
  return Math.round(v / OVERLAY_POSITION_QUANTUM_PX) * OVERLAY_POSITION_QUANTUM_PX
}

function normalizeOverlaySignatureIds(ids: string[]): string[] {
  return normalizeStringArrayForSignature(ids, { unique: true, sort: true })
}

function buildPosSignature(
  ids: string[],
  args: {
    posById: Record<string, { top: number; left: number }> | null | undefined
    worldById: Record<string, { x: number; y: number }> | null | undefined
    pinnedById: Record<string, boolean> | null | undefined
  },
): string {
  const signatureIds = normalizeOverlaySignatureIds(ids)
  if (signatureIds.length === 0) return ''
  const posById = args.posById || {}
  const worldById = args.worldById || {}
  const pinnedById = args.pinnedById || {}
  const parts = signatureIds.map(id => {
    if (pinnedById[id] === true) {
      const pos = worldById[id]
      const x = pos && Number.isFinite(pos.x) ? Math.round(pos.x * 100) / 100 : 'na'
      const y = pos && Number.isFinite(pos.y) ? Math.round(pos.y * 100) / 100 : 'na'
      return `${id}:w:${x},${y}`
    }
    const pos = posById[id]
    const left = pos && Number.isFinite(pos.left) ? Math.round(pos.left) : 'na'
    const top = pos && Number.isFinite(pos.top) ? Math.round(pos.top) : 'na'
    return `${id}:s:${left},${top}`
  })
  return hashSignatureParts(['overlay-pos', ...parts])
}

export function useStoryboardWidgetOverlayCollision(args: {
  editorRuntimeActive: boolean
  overlayOnlyModeEnabled: boolean
  renderGraphDataOverride: GraphData | null
  schema: any
  selectedNodeId: string | null
  lastDroppedWidgetNodeIdRef: React.MutableRefObject<string | null>
  viewportW: number
  viewportH: number
  canvasWindowOffset: { left: number; top: number }
  canvasWindowOffsetRef: React.MutableRefObject<{ left: number; top: number }>
  zoomViewKeyRef: React.MutableRefObject<string | null>
  draftGraphDataRef: React.MutableRefObject<GraphData | null>
  frontmatterFlowRenderSettings: FrontmatterFlowRenderSettings | null
  getLiveNodeWorldPos: (nodeId: string) => { x: number; y: number } | null
  getLiveZoomTransform: () => { k: number; x: number; y: number } | null
  storyboardWidgetSurfaceId?: string
  graphContentRevision: number
}) {
  const {
    editorRuntimeActive,
    overlayOnlyModeEnabled,
    renderGraphDataOverride,
    schema,
    selectedNodeId,
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
  } = args
  const runtimeActive = editorRuntimeActive || overlayOnlyModeEnabled
  const overlayCollisionResolveRafRef = React.useRef<number | null>(null)
  const overlayCollisionResolveKeyRef = React.useRef<string>('')
  const overlayRectCacheRef = React.useRef<Map<string, { left: number; top: number; width: number; height: number }>>(new Map())
  const overlayCollisionIterKeyRef = React.useRef<string>('')
  const overlayCollisionIterCountRef = React.useRef<number>(0)
  const overlayCollisionWarmupStartedAtMsRef = React.useRef<number | null>(null)
  const overlayCollisionWarmupAttemptsRef = React.useRef<number>(0)
  const overlayMeasurementWarmupStartedAtMsRef = React.useRef<number | null>(null)
  const overlayMeasurementWarmupAttemptsRef = React.useRef<number>(0)
  const scheduleOverlayCollisionResolveRef = React.useRef<() => void>(() => void 0)
  const selfCommittedPosSignatureRef = React.useRef<string>('')
  const observedStorePosSignatureRef = React.useRef<string>('')
  const overlayCollisionSettleBaseKeyRef = React.useRef<string>('')
  const overlayCollisionBestUnresolvedRef = React.useRef<number>(Number.POSITIVE_INFINITY)
  const overlayCollisionRecentSigRef = React.useRef<string[]>([])
  const workspaceOverlayOpenRef = React.useRef(false)
  const overlayNodeLayoutSignature = React.useMemo(() => {
    const graphDataForOverlayRuntime = draftGraphDataRef.current || renderGraphDataOverride || null
    return buildOverlayNodeLayoutSignature(graphDataForOverlayRuntime)
  }, [draftGraphDataRef, renderGraphDataOverride])

  const queryActiveSurfaceOverlays = React.useCallback((selector: string): HTMLElement[] => {
    return queryStoryboardWidgetOverlayRootsForSurface({
      surfaceId: storyboardWidgetSurfaceId,
      selector,
    })
  }, [storyboardWidgetSurfaceId])

  const resetOverlayCollisionTransientState = React.useCallback((clearRectCache = false) => {
    overlayCollisionResolveKeyRef.current = ''
    overlayCollisionIterKeyRef.current = ''
    overlayCollisionIterCountRef.current = 0
    overlayCollisionWarmupStartedAtMsRef.current = null
    overlayCollisionWarmupAttemptsRef.current = 0
    overlayMeasurementWarmupStartedAtMsRef.current = null
    overlayMeasurementWarmupAttemptsRef.current = 0
    overlayCollisionSettleBaseKeyRef.current = ''
    overlayCollisionBestUnresolvedRef.current = Number.POSITIVE_INFINITY
    overlayCollisionRecentSigRef.current = []
    if (clearRectCache) overlayRectCacheRef.current.clear()
  }, [])

  const cancelOverlayCollisionResolve = React.useCallback((clearRectCache = false) => {
    if (overlayCollisionResolveRafRef.current != null) {
      try {
        cancelAnimationFrame(overlayCollisionResolveRafRef.current)
      } catch {
        void 0
      }
      overlayCollisionResolveRafRef.current = null
    }
    resetOverlayCollisionTransientState(clearRectCache)
  }, [resetOverlayCollisionTransientState])

  const scheduleOverlayCollisionResolve = React.useCallback(() => {
    if (!runtimeActive) return
    if (workspaceOverlayOpenRef.current) return
    if (isWorkspaceGraphMutationBlocked(useGraphStore.getState())) return
    if (typeof document === 'undefined' || typeof window === 'undefined') return
    if (overlayCollisionResolveRafRef.current != null) return
    if (overlayCollisionWarmupStartedAtMsRef.current == null) overlayCollisionWarmupStartedAtMsRef.current = Date.now()

    overlayCollisionResolveRafRef.current = window.requestAnimationFrame(() => {
      overlayCollisionResolveRafRef.current = null
      if (!runtimeActive || workspaceOverlayOpenRef.current) return
      if (isWorkspaceGraphMutationBlocked(useGraphStore.getState())) return

      const widgetOverlayEls = queryActiveSurfaceOverlays(STORYBOARD_WIDGET_OVERLAY_ROOT_SELECTOR)
      const richMediaOverlayEls = queryActiveSurfaceOverlays(RICH_MEDIA_OVERLAY_ROOT_SELECTOR)
      const overlayEls = Array.from(new Set<HTMLElement>([
        ...widgetOverlayEls,
        ...richMediaOverlayEls,
      ]))
      if (overlayEls.length < 2) {
        const st = useGraphStore.getState()
        const storyboardWidgetOpenWidgetIds =
          (st.openWidgetNodeIdsByRenderer?.storyboard && Array.isArray(st.openWidgetNodeIdsByRenderer.storyboard)
            ? st.openWidgetNodeIdsByRenderer.storyboard
            : st.openWidgetNodeIds) || []
        const wantsResolve = storyboardWidgetOpenWidgetIds.length >= 2 || overlayOnlyModeEnabled
        // #region debug-point B:collision-warmup
        reportStoryboardMediaPanelLoopOverlayCollisionDebug({
          hypothesisId: 'B',
          location: 'useStoryboardWidgetOverlayCollision.ts:collision-warmup',
          msg: 'overlay collision warmup is waiting for overlay roots',
          data: {
            overlayElementCount: overlayEls.length,
            widgetOverlayElementCount: widgetOverlayEls.length,
            richMediaOverlayElementCount: richMediaOverlayEls.length,
            wantsResolve,
            overlayOnlyModeEnabled,
            canvas2dRenderer: String((st as { canvas2dRenderer?: unknown }).canvas2dRenderer || ''),
            openWidgetNodeIds: Array.isArray((st as { openWidgetNodeIds?: unknown[] }).openWidgetNodeIds)
              ? (st as { openWidgetNodeIds?: unknown[] }).openWidgetNodeIds!.map(id => String(id || '').trim()).filter(Boolean)
              : [],
            storyboardWidgetScopedOpenWidgetNodeIds: Array.isArray((st as { openWidgetNodeIdsByRenderer?: Record<string, unknown[]> }).openWidgetNodeIdsByRenderer?.storyboard)
              ? ((st as { openWidgetNodeIdsByRenderer?: Record<string, unknown[]> }).openWidgetNodeIdsByRenderer?.storyboard || []).map(id => String(id || '').trim()).filter(Boolean)
              : [],
            activeRendererScopedOpenWidgetNodeIds: Array.isArray((st as { openWidgetNodeIdsByRenderer?: Record<string, unknown[]> }).openWidgetNodeIdsByRenderer?.[String((st as { canvas2dRenderer?: unknown }).canvas2dRenderer || '')])
              ? ((st as { openWidgetNodeIdsByRenderer?: Record<string, unknown[]> }).openWidgetNodeIdsByRenderer?.[String((st as { canvas2dRenderer?: unknown }).canvas2dRenderer || '')] || []).map(id => String(id || '').trim()).filter(Boolean)
              : [],
          },
        })
        // #endregion
        overlayCollisionWarmupAttemptsRef.current += 1
        const startedAt = overlayCollisionWarmupStartedAtMsRef.current || Date.now()
        const elapsed = Date.now() - startedAt
        if (wantsResolve && overlayCollisionWarmupAttemptsRef.current < 60 && elapsed < 1600) {
          scheduleOverlayCollisionResolveRef.current()
          return
        }
        overlayCollisionWarmupStartedAtMsRef.current = null
        overlayCollisionWarmupAttemptsRef.current = 0
        return
      }
      overlayCollisionWarmupStartedAtMsRef.current = null
      overlayCollisionWarmupAttemptsRef.current = 0

      const graphDataForOverlayRuntime = draftGraphDataRef.current || renderGraphDataOverride || null
      const graphKey = buildGraphDocumentMetaKey(graphDataForOverlayRuntime)
      const graphRevision = readGraphDataRevision(graphDataForOverlayRuntime)
      const overlayGraphLookup = getCachedStoryboardWidgetRenderGraph({
        scope: 'storyboard-widget-overlay-collision-graph',
        graphData: graphDataForOverlayRuntime,
        graphRevision,
        preferCurrentGraphDataRefs: true,
      })
      const graphKind = overlayGraphLookup?.graphMetaKind || ''
      const isFrontmatterFlow = graphKind === 'frontmatter-flow'
      const nodes = overlayGraphLookup?.nodes || []
      const nodeById = overlayGraphLookup?.nodeById || null
      const overlayNodeIds = (() => {
        const next: string[] = []
        const seen = new Set<string>()
        for (let i = 0; i < overlayEls.length; i += 1) {
          const id = String(overlayEls[i]?.dataset?.kgWidget || '').trim()
          if (!id || seen.has(id)) continue
          seen.add(id)
          next.push(id)
        }
        return orderStoryboardWidgetOverlayNodeIdsByRenderGraph({
          ids: next,
          nodes,
          graphMetaKind: graphKind,
        })
      })()
      if (overlayNodeIds.length < 2) {
        resetOverlayCollisionTransientState(true)
        return
      }
      const st = useGraphStore.getState()
      const pinnedById = resolveScopedFlowWidgetNodeMap({ graphMetaKey: graphKey, keyedByGraphMetaKey: (st as unknown as { flowWidgetPinnedByNodeIdByGraphMetaKey?: Record<string, Record<string, boolean>> }).flowWidgetPinnedByNodeIdByGraphMetaKey, globalByNodeId: st.flowWidgetPinnedByNodeId })
      const screenAuthorityOwnedByPlacementRuntime = areStoryboardWidgetOverlaysOwnedByFloatingScreenAuthority({ graphMetaKind: graphKind, storyboardWidgetSurfaceId, nodeIds: overlayNodeIds, nodeById, pinnedByNodeId: pinnedById })
      if (screenAuthorityOwnedByPlacementRuntime) {
        resetOverlayCollisionTransientState(true)
        return
      }

      if (st.flowWidgetDraggingNodeId) return
      const liveZoom = getLiveZoomTransform()
      const zoomKRaw =
        (liveZoom?.k ??
          getEffectiveZoomStateForKey({
            zoomViewKey: zoomViewKeyRef.current,
            zoomStateByKey: st.zoomStateByKey,
            zoomState: st.zoomState,
          })?.k) ?? null
      const zoomK = typeof zoomKRaw === 'number' && Number.isFinite(zoomKRaw) ? zoomKRaw : 1
      const overlayCount = overlayNodeIds.length
      const visibleViewport = resolveStoryboardWidgetVisibleViewport({
        storyboardWidgetSurfaceId,
        viewportW,
        viewportH,
      })
      const visibleViewportLeft = visibleViewport.left
      const visibleViewportTop = visibleViewport.top
      const visibleViewportWidth = visibleViewport.width
      const visibleViewportHeight = visibleViewport.height
      const activeViewport = isFrontmatterFlow
        ? {
            left: visibleViewportLeft,
            top: visibleViewportTop,
            right: visibleViewportLeft + visibleViewportWidth,
            bottom: visibleViewportTop + visibleViewportHeight,
            width: visibleViewportWidth,
            height: visibleViewportHeight,
          }
        : {
            left: 0,
            top: 0,
            right: viewportW,
            bottom: viewportH,
            width: viewportW,
            height: viewportH,
          }
      const activeVisibleViewport: VisibleFlowViewport = {
        left: activeViewport.left,
        top: activeViewport.top,
        right: activeViewport.right,
        bottom: activeViewport.bottom,
        width: activeViewport.width,
        height: activeViewport.height,
        centerX: activeViewport.left + activeViewport.width / 2,
        centerY: activeViewport.top + activeViewport.height / 2,
      }
      const resolveInfiniteCanvasCollisionPosition = (pos: { left: number; top: number }, _size: { width: number; height: number }) => {
        const rawLeft = Number.isFinite(pos.left) ? pos.left : 0
        const rawTop = Number.isFinite(pos.top) ? pos.top : 0
        const snapped = snapStepPx > 1
          ? { left: snapScreen(rawLeft), top: snapScreen(rawTop) }
          : { left: rawLeft, top: rawTop }
        return { left: snapped.left, top: snapped.top }
      }
      const deriveCollectiveViewportState = (items: Array<{ left: number; top: number; width: number; height: number }>) => {
        if (items.length <= 0) return null
        const bounds = buildFlowOverlayBoundsFromRects({ items })
        return deriveFlowOverlayCollectiveViewportState({
          bounds,
          visibleViewport: activeVisibleViewport,
        })
      }
      const panelScale = computeCollectiveFollowPinnedScale({
        zoomK,
        viewportW: visibleViewportWidth,
        viewportH: visibleViewportHeight,
        count: Math.max(1, overlayCount),
        baseWidth: WIDGET_BASE_SIZE.width,
        baseHeight: WIDGET_BASE_SIZE.height,
        quantizeStep: 0.02,
        hardMinScale: COLLECTIVE_OVERLAY_SCALE_LIMITS_16X9.widget.min,
        hardMaxScale: COLLECTIVE_OVERLAY_SCALE_LIMITS_16X9.widget.max,
        viewportPreset: isFrontmatterFlow ? 'widgetFrontmatter' : 'widgetCanvas',
        fitToViewport: false,
      })
      const canvasOffset = canvasWindowOffsetRef.current || canvasWindowOffset
      const offL = Number.isFinite(canvasOffset.left) ? Math.round(canvasOffset.left * 10) / 10 : 0
      const offT = Number.isFinite(canvasOffset.top) ? Math.round(canvasOffset.top * 10) / 10 : 0
      const widgetGrid = readWidgetGridLayoutSettings(schema)
      const overlayNodeIdsKey = hashScopedStringArraySignature('overlay-collision-node-ids', overlayNodeIds)
      const posById = resolveScopedFlowWidgetNodeMap({
        graphMetaKey: graphKey,
        keyedByGraphMetaKey: (st as unknown as { flowWidgetPosByNodeIdByGraphMetaKey?: Record<string, Record<string, { top: number; left: number }>> }).flowWidgetPosByNodeIdByGraphMetaKey,
        globalByNodeId: st.flowWidgetPosByNodeId,
      })
      const worldById = resolveScopedFlowWidgetNodeMap({
        graphMetaKey: graphKey,
        keyedByGraphMetaKey: (st as unknown as { flowWidgetWorldPosByNodeIdByGraphMetaKey?: Record<string, Record<string, { x: number; y: number }>> }).flowWidgetWorldPosByNodeIdByGraphMetaKey,
        globalByNodeId: (st as unknown as { flowWidgetWorldPosByNodeId?: Record<string, { x: number; y: number }> }).flowWidgetWorldPosByNodeId,
      })
      const posSig = buildPosSignature(overlayNodeIds, { posById, worldById, pinnedById })
      const storyboardCardLayoutSurface = String(storyboardWidgetSurfaceId || '').trim() === 'storyboard'
      const isPinnedInCanvasForNode = (id: string): boolean => storyboardCardLayoutSurface || resolveEffectiveFlowWidgetPinnedInCanvas({ graphMetaKind: graphKind, node: String(id || '').trim() ? nodeById?.get(String(id || '').trim()) || null : null, pinnedValue: String(id || '').trim() ? pinnedById[String(id || '').trim()] : null })
      const settleBaseKey = hashSignatureParts([
        'overlay-collision-settle',
        overlayNodeIdsKey,
        viewportW,
        viewportH,
        overlayOnlyModeEnabled,
        offL,
        offT,
        visibleViewportLeft,
        visibleViewportTop,
        visibleViewportWidth,
        visibleViewportHeight,
        Math.round(BALANCED_OVERLAY_SPREAD_TARGET_ASPECT * 1000) / 1000,
      ])
      const key = hashSignatureParts(['overlay-collision-key', settleBaseKey, posSig])
      if (overlayCollisionResolveKeyRef.current === key) return
      overlayCollisionResolveKeyRef.current = key
      if (overlayCollisionIterKeyRef.current !== key) {
        overlayCollisionIterKeyRef.current = key
        overlayCollisionIterCountRef.current = 0
      }

      const floatingScaled = computeWidgetScaledSize(panelScale)
      const canvasOffsetLeft = Number.isFinite(canvasOffset.left) ? canvasOffset.left : 0
      const canvasOffsetTop = Number.isFinite(canvasOffset.top) ? canvasOffset.top : 0
      const rectByNodeId = new Map<string, { left: number; top: number; width: number; height: number }>()
      const selectedRawRectByNodeId = new Map<string, { el: HTMLElement; rect: DOMRect }>()
      const unresolvedRectIdSet = new Set<string>()
      for (let i = 0; i < overlayEls.length; i += 1) {
        const el = overlayEls[i]
        const id = String(el.dataset.kgWidget || '').trim()
        if (!id) continue
        const rect = el.getBoundingClientRect()
        const width = Number.isFinite(rect.width) ? rect.width : 0
        const height = Number.isFinite(rect.height) ? rect.height : 0
        const leftRaw = Number.isFinite(rect.left) ? rect.left : 0
        const topRaw = Number.isFinite(rect.top) ? rect.top : 0
        const left = leftRaw - canvasOffsetLeft
        const top = topRaw - canvasOffsetTop
        const nextRaw = { el, rect }
        if (width > 0 && height > 0 && shouldReplaceStoryboardWidgetOverlayRectCandidate(selectedRawRectByNodeId.get(id), nextRaw)) {
          selectedRawRectByNodeId.set(id, nextRaw)
          const resolved = { left, top, width, height }
          overlayRectCacheRef.current.set(id, resolved)
          rectByNodeId.set(id, resolved)
          continue
        }
        if (selectedRawRectByNodeId.has(id)) continue
        const cached = overlayRectCacheRef.current.get(id) || null
        if (cached) {
          rectByNodeId.set(id, cached)
          continue
        }
        unresolvedRectIdSet.add(id)
        if (Number.isFinite(left) && Number.isFinite(top)) rectByNodeId.set(id, { left, top, width: floatingScaled.width, height: floatingScaled.height })
      }

      let maxW = 0
      let maxH = 0
      let count = 0
      for (let i = 0; i < overlayNodeIds.length; i += 1) {
        const r = rectByNodeId.get(overlayNodeIds[i]!)
        if (!r || !(r.width > 0 && r.height > 0)) continue
        maxW = Math.max(maxW, r.width)
        maxH = Math.max(maxH, r.height)
        count += 1
      }
      const typicalSize = count > 0
        ? {
            width: Math.max(120, floatingScaled.width, maxW),
            height: Math.max(160, floatingScaled.height, maxH),
          }
        : floatingScaled
      const useFrontmatterProxyCollisionSizing = isFrontmatterFlow && overlayOnlyModeEnabled
      const balancedLayoutSize = useFrontmatterProxyCollisionSizing ? floatingScaled : typicalSize
      const resolveWidgetCollisionSize = (rect: { width: number; height: number } | null | undefined) => useFrontmatterProxyCollisionSizing ? floatingScaled : {
        width: Math.max(floatingScaled.width, rect?.width ?? 0),
        height: Math.max(floatingScaled.height, rect?.height ?? 0),
      }
      const gapBase = typeof schema?.layout?.flow?.overlay?.collisionGapPx === 'number' ? schema.layout.flow.overlay.collisionGapPx : 12
      const configuredGapPx = Math.max(0, Math.min(80, Math.floor(widgetGrid.gridEnabled ? Math.max(gapBase, widgetGrid.gapPx) : gapBase)))
      const balancedViewportPreset = resolveBalancedViewportPreset({
        graphData: graphDataForOverlayRuntime,
        fallbackPreset: isFrontmatterFlow ? 'widgetFrontmatter' : 'widgetCanvas',
      })
      const adaptiveGapPx = computeBalancedSpreadSpacingPx({
        baseGapPx: configuredGapPx,
        zoomK,
        count: Math.max(1, overlayCount),
        preset: balancedViewportPreset,
      })
      const gapPx = Math.max(configuredGapPx, adaptiveGapPx)
      const snapStepPx = widgetGrid.gridEnabled ? Math.max(1, widgetGrid.stepPx) : 1
      const snapScreen = (v: number): number => (snapStepPx > 1 ? snapToGridPx(v, snapStepPx) : v)
      const cellSize = {
        width: Math.max(1, snapScreen(balancedLayoutSize.width + gapPx)),
        height: Math.max(1, snapScreen(balancedLayoutSize.height + gapPx)),
      }
      const spreadMargins = computeBalancedSpreadViewportMargins({
        viewportW: visibleViewportWidth,
        viewportH: visibleViewportHeight,
        preset: balancedViewportPreset,
      })
      const horizontalMargin = Math.max(spreadMargins.left, spreadMargins.right)
      const verticalMargin = Math.max(spreadMargins.top, spreadMargins.bottom)
      const marginLeft = horizontalMargin
      const marginRight = horizontalMargin
      const marginTop = verticalMargin
      const marginBottom = verticalMargin
      const balancedLayout = computeBalancedSpreadLayout({
        count: Math.max(1, overlayCount),
        viewportW: visibleViewportWidth,
        viewportH: visibleViewportHeight,
        cellW: cellSize.width,
        cellH: cellSize.height,
        gapPx,
        zoomK,
        marginLeftPx: marginLeft,
        marginRightPx: marginRight,
        marginTopPx: marginTop,
        marginBottomPx: marginBottom,
        snapPx: snapStepPx,
      })
      const preferredBalancedCells = applyPreferredSeedLayoutCells({
        cells: balancedLayout.cells,
        cellH: cellSize.height,
        gapPx,
        preferredFirstRowCount: frontmatterFlowRenderSettings?.balancedHeroRowCount,
        preferredRowGapScale: frontmatterFlowRenderSettings?.balancedHeroRowGapScale,
        preferredSingleRowStaggerScale: frontmatterFlowRenderSettings?.balancedHeroRowStaggerScale,
      })
      const useBalancedCenteredLayout = overlayCount >= 2 || isFrontmatterFlow || widgetGrid.gridEnabled
      let rowsMax = balancedLayout.rows
      let dockCols = balancedLayout.cols
      const cols = Math.max(1, dockCols)
      let dockWidth = balancedLayout.gridW
      let dockLeft = visibleViewportLeft + balancedLayout.startLeft
      let dockTop = visibleViewportTop + balancedLayout.startTop
      const preferredBalancedCellsInVisibleViewport = preferredBalancedCells.map(cell => ({
        ...cell,
        left: visibleViewportLeft + cell.left,
        top: visibleViewportTop + cell.top,
      }))
      if (!useBalancedCenteredLayout) {
        dockWidth = dockCols * cellSize.width - gapPx
        dockLeft = Math.max(visibleViewportLeft + marginLeft, visibleViewportLeft + visibleViewportWidth - marginRight - dockWidth)
        dockTop = visibleViewportTop + marginTop
      }

      const pinnedObstacles: Array<{ id: string; left: number; top: number; width: number; height: number }> = []
      if (typeof document !== 'undefined') {
        const richMediaEls = queryActiveSurfaceOverlays(RICH_MEDIA_OVERLAY_ROOT_SELECTOR)
        const canonicalRichMediaObstacles = collectCanonicalStoryboardWidgetOverlayRectEntries(richMediaEls)
        for (let i = 0; i < canonicalRichMediaObstacles.length; i += 1) {
          const entry = canonicalRichMediaObstacles[i]
          const id = entry?.id
          const rect = entry?.rect
          if (!id || !rect) continue
          if (isTransientOffscreenRichMediaOverlayRoot(entry.el, rect)) continue
          pinnedObstacles.push({ id: `rich-media:${id}`, left: rect.left, top: rect.top, width: rect.width, height: rect.height })
        }
        const lastDroppedWidgetNodeId = String(args.lastDroppedWidgetNodeIdRef.current || '').trim()
        const storyboardCardEls = queryActiveSurfaceOverlays('article[aria-label^="Storyboard card"][data-node-id]')
        for (let i = 0; i < storyboardCardEls.length; i += 1) {
          const el = storyboardCardEls[i]!
          const id = String(el.dataset.nodeId || '').trim()
          // During a drop, the existing cards are authored placement obstacles.
          // Only the newly dropped card may move into the open cascade cell.
          if (!id || id === lastDroppedWidgetNodeId) continue
          const rect = el.getBoundingClientRect()
          if (!(rect.width > 0 && rect.height > 0)) continue
          pinnedObstacles.push({ id: `storyboard-card:${id}`, left: rect.left, top: rect.top, width: rect.width, height: rect.height })
        }
      }
      const storedCollectiveItems = overlayNodeIds
        .map(rawId => {
          const id = String(rawId || '').trim()
          if (!id) return null
          if (isPinnedInCanvasForNode(id)) return null
          if (!shouldAutoPlaceStoryboardWidget({
            graphMetaKind: graphKind,
            pinnedInCanvas: false,
            floatingPos: posById[id],
            nodeTypeId: String(nodeById?.get(id)?.type || '').trim(),
          })) return null
          const stored = posById[id]
          if (!stored || !Number.isFinite(stored.top) || !Number.isFinite(stored.left)) return null
          const rect = rectByNodeId.get(id) || null
          const size = resolveWidgetCollisionSize(rect)
          return { id, left: stored.left, top: stored.top, width: size.width, height: size.height }
        })
        .filter((item): item is { id: string; left: number; top: number; width: number; height: number } => !!item)
      const storedCollectiveViewportState = deriveCollectiveViewportState(storedCollectiveItems)
      const storedCollectiveOverlaps = (() => {
        if (storedCollectiveItems.length < 2) return false
        for (let i = 0; i < storedCollectiveItems.length; i += 1) {
          for (let j = i + 1; j < storedCollectiveItems.length; j += 1) {
            if (hasOverlap(storedCollectiveItems[i]!, storedCollectiveItems[j]!, floatingScaled, gapPx)) return true
          }
        }
        return false
      })()
      const storedCollectiveIsResidue =
        storedCollectiveItems.length >= 2
        && (
          storedCollectiveOverlaps
          || isVerticalOverlayCluster({ items: storedCollectiveItems, gapPx })
          || isHorizontalOverlayStrip({ items: storedCollectiveItems, gapPx })
          || (
            isFrontmatterFlow
            && overlayOnlyModeEnabled
            && !storedCollectiveViewportState?.balanced
          )
        )
      const items: Array<{ id: string; top: number; left: number; movable: boolean; pinnedInCanvas: boolean; width?: number; height?: number }> = []
      let stack = 0
      for (let i = 0; i < overlayNodeIds.length; i += 1) {
        const id = String(overlayNodeIds[i] || '').trim()
        if (!id) continue
        const rect = rectByNodeId.get(id) || null
        if (isPinnedInCanvasForNode(id)) {
          const nodeTypeId = String(nodeById?.get(id)?.type || '').trim()
          // A pinned world position is authored placement authority. Overlap alone
          // must not turn it back into a layout candidate after a zoom, pan, drag,
          // or delayed collision warmup. Newly inserted overlays without authored
          // placement still enter the resolver through shouldAutoPlace.
          const allowPinnedAutoPlace = shouldAutoPlaceStoryboardWidget({
            graphMetaKind: graphKind,
            pinnedInCanvas: true,
            worldPos: worldById[id],
            nodeTypeId,
          })
          if (!allowPinnedAutoPlace) {
            if (rect) pinnedObstacles.push({ id, left: rect.left, top: rect.top, width: rect.width, height: rect.height })
            continue
          }
          const rawCol = Math.floor(stack / rowsMax)
          const col = Math.min(rawCol, cols - 1)
          const row = rawCol < cols ? stack % rowsMax : stack - (cols - 1) * rowsMax
          const centeredCell = useBalancedCenteredLayout ? preferredBalancedCellsInVisibleViewport[stack] : null
          stack += 1
          const pinnedCollisionSize = resolveWidgetCollisionSize(rect)
          const fallback = centeredCell
            ? { left: centeredCell.left, top: centeredCell.top }
            : { left: dockLeft + col * cellSize.width, top: dockTop + row * cellSize.height }
          const base = rect ? { left: rect.left, top: rect.top } : fallback
          const resolved = resolveInfiniteCanvasCollisionPosition(base, pinnedCollisionSize)
          items.push({
            id,
            top: resolved.top,
            left: resolved.left,
            movable: true,
            pinnedInCanvas: true,
            width: pinnedCollisionSize.width,
            height: pinnedCollisionSize.height,
          })
          continue
        }
        const floatingScreenAuthorityOwnedByPlacementRuntime = shouldUseStoryboardWidgetFloatingScreenAuthority({
          graphMetaKind: graphKind,
          pinnedInCanvas: false,
          storyboardWidgetSurfaceId,
        })
        if (floatingScreenAuthorityOwnedByPlacementRuntime) {
          if (rect) pinnedObstacles.push({ id, left: rect.left, top: rect.top, width: rect.width, height: rect.height })
          continue
        }
        if (!shouldAutoPlaceStoryboardWidget({
          graphMetaKind: graphKind,
          pinnedInCanvas: false,
          floatingPos: posById[id],
          nodeTypeId: String(nodeById?.get(id)?.type || '').trim(),
        })) {
          if (rect) pinnedObstacles.push({ id, left: rect.left, top: rect.top, width: rect.width, height: rect.height })
          continue
        }
        const stored = posById[id]
        const hasStored = Boolean(stored && Number.isFinite(stored.top) && Number.isFinite(stored.left))
        const rawCol = Math.floor(stack / rowsMax)
        const col = Math.min(rawCol, cols - 1)
        const row = rawCol < cols ? stack % rowsMax : stack - (cols - 1) * rowsMax
        const centeredCell = useBalancedCenteredLayout ? preferredBalancedCellsInVisibleViewport[stack] : null
        stack += 1
        const fallback = centeredCell
          ? { left: centeredCell.left, top: centeredCell.top }
          : { left: dockLeft + col * cellSize.width, top: dockTop + row * cellSize.height }
        const base = !hasStored || storedCollectiveIsResidue
          ? fallback
            : stored
        const floatingCollisionSize = resolveWidgetCollisionSize(rect)
        const resolved = resolveInfiniteCanvasCollisionPosition(base, floatingCollisionSize)
        items.push({ id, top: resolved.top, left: resolved.left, movable: true, pinnedInCanvas: false, width: floatingCollisionSize.width, height: floatingCollisionSize.height })
      }
      if (items.length === 0) {
        resetOverlayCollisionTransientState(true)
        return
      }

      const unresolvedMovableIds = items
        .map(item => item.id)
        .filter(id => unresolvedRectIdSet.has(id))
      const canDeferUntilMeasuredCollectiveLayout =
        unresolvedMovableIds.length > 0
        && (isFrontmatterFlow || items.length >= 2)
        && items.every(item => item.width == null || item.height == null || (item.width > 0 && item.height > 0))
      if (canDeferUntilMeasuredCollectiveLayout) {
        overlayMeasurementWarmupAttemptsRef.current += 1
        if (overlayMeasurementWarmupStartedAtMsRef.current == null) {
          overlayMeasurementWarmupStartedAtMsRef.current = Date.now()
        }
        const startedAt = overlayMeasurementWarmupStartedAtMsRef.current || Date.now()
        const elapsed = Date.now() - startedAt
        if (overlayMeasurementWarmupAttemptsRef.current < 60 && elapsed < 1600) {
          resetOverlayCollisionTransientState()
          scheduleOverlayCollisionResolveRef.current()
          return
        }
      } else {
        overlayMeasurementWarmupStartedAtMsRef.current = null
        overlayMeasurementWarmupAttemptsRef.current = 0
      }
      if (!canDeferUntilMeasuredCollectiveLayout) {
        overlayMeasurementWarmupStartedAtMsRef.current = null
        overlayMeasurementWarmupAttemptsRef.current = 0
      }
      const fallbackFixedId = (() => {
        if (pinnedObstacles.some(obstacle => String(obstacle.id || '').startsWith('rich-media:'))) return ''
        const sel = String(selectedNodeId || '').trim()
        if (sel && items.some(it => it.id === sel)) return sel
        if (isFrontmatterFlow && overlayOnlyModeEnabled) return ''
        if (overlayOnlyModeEnabled) return [...items].map(it => it.id).sort((a, b) => a.localeCompare(b))[0] || ''
        return items[0]?.id || ''
      })()
      const droppedNodeCollisionPolicy = resolveStoryboardWidgetDroppedNodeCollisionPolicy({
        candidateNodeIds: items.map(item => item.id),
        selectedNodeId,
        lastDroppedWidgetNodeId: args.lastDroppedWidgetNodeIdRef.current,
        fallbackFixedNodeId: fallbackFixedId,
      })
      const fixedId = droppedNodeCollisionPolicy.fixedNodeId

      const shouldResolveItems = (candidates: Array<{ id: string; left: number; top: number; width?: number; height?: number }>) => {
        for (let i = 0; i < candidates.length; i += 1) for (let j = i + 1; j < candidates.length; j += 1) {
          if (hasOverlap(candidates[i]!, candidates[j]!, floatingScaled, gapPx)) return true
        }
        return false
      }
      const shouldResolveItemsAgainstObstacles = (candidates: Array<{ id: string; left: number; top: number; width?: number; height?: number }>) => {
        for (let i = 0; i < candidates.length; i += 1) for (let j = 0; j < pinnedObstacles.length; j += 1) {
          if (distinctStoryboardOverlayRectsOverlap(candidates[i]!, pinnedObstacles[j]!, gapPx, floatingScaled)) return true
        }
        return false
      }
      const shouldRebalanceCluster = (candidates: Array<{ id: string; left: number; top: number; width?: number; height?: number }>) => {
        const clusterItems = candidates.map(it => ({
          left: it.left,
          top: it.top,
          width: it.width ?? floatingScaled.width,
          height: it.height ?? floatingScaled.height,
        }))
        return shouldForceBalancedSpreadReseed({ items: clusterItems, gapPx })
      }

      const nextPos = { ...posById }
      const nextWorld = { ...worldById }
      const seedGridAroundFixed = (worldIn: Array<{ id: string; left: number; top: number; width: number; height: number; movable: boolean }>) => {
        const movable = worldIn.filter(it => it.movable)
        if (movable.length <= 0) return worldIn
        const balancedCells = preferredBalancedCellsInVisibleViewport
        if (balancedCells.length <= 0) return worldIn
        const fixed = fixedId ? (worldIn.find(it => it.id === fixedId) || null) : null
        const centerOf = (item: { left: number; top: number; width: number; height: number }) => ({
          x: item.left + item.width / 2,
          y: item.top + item.height / 2,
        })
        const fixedCenter = fixed
          ? centerOf(fixed)
          : {
              x: visibleViewportLeft + visibleViewportWidth / 2,
              y: visibleViewportTop + visibleViewportHeight / 2,
            }
        const cells = balancedCells.map((cell, idx) => ({
          idx,
          left: cell.left,
          top: cell.top,
          row: cell.row,
          col: cell.col,
          cx: cell.left + (cellSize.width - gapPx) / 2,
          cy: cell.top + (cellSize.height - gapPx) / 2,
        }))
        const sortedCells = [...cells].sort((a, b) => {
          const da = Math.abs(a.cx - fixedCenter.x) + Math.abs(a.cy - fixedCenter.y)
          const db = Math.abs(b.cx - fixedCenter.x) + Math.abs(b.cy - fixedCenter.y)
          if (da !== db) return da - db
          const ra = Math.abs(a.row - (balancedLayout.rows - 1) / 2)
          const rb = Math.abs(b.row - (balancedLayout.rows - 1) / 2)
          if (ra !== rb) return ra - rb
          return a.idx - b.idx
        })
        const used = new Set<number>()
        for (let i = 0; i < worldIn.length; i += 1) {
          const it = worldIn[i]!
          if (it.movable) continue
          let bestIdx = -1
          let bestScore = Number.POSITIVE_INFINITY
          for (let j = 0; j < cells.length; j += 1) {
            const cell = cells[j]!
            const dx = cell.cx - (it.left + it.width / 2)
            const dy = cell.cy - (it.top + it.height / 2)
            const score = Math.abs(dx) + Math.abs(dy)
            if (score < bestScore) {
              bestScore = score
              bestIdx = cell.idx
            }
          }
          if (bestIdx >= 0) used.add(bestIdx)
        }
        const pickNextCell = () => {
          for (let i = 0; i < sortedCells.length; i += 1) {
            const cell = sortedCells[i]!
            if (used.has(cell.idx)) continue
            used.add(cell.idx)
            return cell
          }
          return sortedCells[Math.min(sortedCells.length - 1, used.size % sortedCells.length)]!
        }
        return [...worldIn].sort((a, b) => a.id.localeCompare(b.id)).map(it => {
          if (!it.movable) return it
          const cell = pickNextCell()
          return { ...it, left: cell.left, top: cell.top }
        })
      }
      const toWorld = () => items.map(it => ({
        id: it.id,
        left: it.left,
        top: it.top,
        width: it.width ?? floatingScaled.width,
        height: it.height ?? floatingScaled.height,
        movable: it.movable && (
          droppedNodeCollisionPolicy.exclusivelyMovableNodeId
            ? it.id === droppedNodeCollisionPolicy.exclusivelyMovableNodeId
            : (!fixedId || it.id !== fixedId)
        ),
      }))
      const preserveInfiniteCanvasWorld = (world: Array<{ id: string; left: number; top: number; width: number; height: number; movable: boolean }>) =>
        world.map(it => {
          const resolved = resolveInfiniteCanvasCollisionPosition({ left: it.left, top: it.top }, { width: it.width, height: it.height })
          return { ...it, left: resolved.left, top: resolved.top }
        })

      let world = preserveInfiniteCanvasWorld(toWorld())
      const graph = graphDataForOverlayRuntime
      const rawNodes = Array.isArray(graph?.nodes) ? (graph!.nodes as Array<{ id?: unknown; x?: unknown; y?: unknown }>) : []
      const nodeObstacles: Array<{ id: string; left: number; top: number; width: number; height: number }> = []
      const overlayNodeIdSet = new Set<string>(overlayNodeIds)
      const worldTransform =
        getLiveZoomTransform()
        || getZoomStateForKey({ zoomViewKey: zoomViewKeyRef.current, zoomStateByKey: st.zoomStateByKey })
        || { k: 1, x: 0, y: 0 }
      const collisionSchema = schema || defaultSchema
      const allowNodeObstacleCollision = !overlayOnlyModeEnabled
      if (allowNodeObstacleCollision && rawNodes.length > 0) {
        const k = typeof worldTransform?.k === 'number' && Number.isFinite(worldTransform.k) ? worldTransform.k : 1
        const rankdir: 'LR' | 'TB' = frontmatterFlowRenderSettings?.rankdir === 'LR' ? 'LR' : 'TB'
        const knobs = readFlowLayoutKnobs({ schema: collisionSchema, rankdir })
        const handleExtra = collisionSchema.behavior?.portHandles?.enabled === true ? Math.max(0, knobs.handle.sizePx) : 0
        const nodeW = Math.max(1, Math.floor(knobs.node.widthPx + handleExtra * 2))
        const nodeH = Math.max(1, Math.floor(knobs.node.heightPx + handleExtra * 2))
        for (let i = 0; i < rawNodes.length; i += 1) {
          const n = rawNodes[i]
          const id = String(n?.id || '').trim()
          if (!id) continue
          if (overlayNodeIdSet.has(id)) continue
          const live = getLiveNodeWorldPos(id)
          const x = live?.x ?? (typeof n?.x === 'number' && Number.isFinite(n.x) ? n.x : null)
          const y = live?.y ?? (typeof n?.y === 'number' && Number.isFinite(n.y) ? n.y : null)
          if (x == null || y == null) continue
          const s = worldToScreen({ transform: worldTransform, x, y })
          nodeObstacles.push({ id, left: s.sx, top: s.sy, width: nodeW * k, height: nodeH * k })
        }
      }
      const obstacles = [...nodeObstacles, ...pinnedObstacles]
      const wantsResolve = shouldResolveItems(world) || shouldResolveItemsAgainstObstacles(world) || shouldRebalanceCluster(world)
      if (wantsResolve) {
        if (shouldResolveItems(world) || shouldRebalanceCluster(world)) world = preserveInfiniteCanvasWorld(seedGridAroundFixed(world))
        const resolvePass = (strength: number, iterations: number, steps: number) =>
          relaxOverlayPanelsWithCollision({
            schema: collisionSchema,
            items: world,
            obstacles,
            gapPx,
            strength,
            iterations,
            steps,
            anchorStrength: 0.08,
            maxAnchorShiftPx: computeOverlayMaxAnchorShiftPx(activeViewport.width, activeViewport.height),
            maxSpeedPxPerStep: 180,
          })
        const pass1 = resolvePass(0.85, 12, 14)
        world = preserveInfiniteCanvasWorld(world.map(it => ({ ...it, ...(pass1.find(x => x.id === it.id) || {}) })))
        if (shouldResolveItems(world) || shouldResolveItemsAgainstObstacles(world)) {
          const pass2 = resolvePass(0.78, 10, 12)
          world = preserveInfiniteCanvasWorld(world.map(it => ({ ...it, ...(pass2.find(x => x.id === it.id) || {}) })))
        }
      }
      const finalById = new Map(world.map(it => [
        it.id,
        {
          left: quantizeOverlayPos(it.left),
          top: quantizeOverlayPos(it.top),
        },
      ]))
      for (let i = 0; i < items.length; i += 1) {
        const item = items[i]
        const p = finalById.get(item.id)
        if (!p) continue
        if (item.pinnedInCanvas) {
          const worldPos = screenToWorld({
            transform: worldTransform,
            sx: p.left,
            sy: p.top,
          })
          if (Number.isFinite(worldPos.x) && Number.isFinite(worldPos.y)) {
            nextWorld[item.id] = { x: worldPos.x, y: worldPos.y }
          }
          continue
        }
        nextPos[item.id] = { top: p.top, left: p.left }
      }

      let changedPos = false
      let changedWorld = false
      for (const it of items) {
        if (it.pinnedInCanvas) {
          const prev = worldById[it.id]
          const cur = nextWorld[it.id]
          if (!cur) continue
          const prevX = prev && Number.isFinite(prev.x) ? Math.round(prev.x * 100) / 100 : null
          const prevY = prev && Number.isFinite(prev.y) ? Math.round(prev.y * 100) / 100 : null
          const curX = Math.round(cur.x * 100) / 100
          const curY = Math.round(cur.y * 100) / 100
          if (prevX == null || prevY == null || prevX !== curX || prevY !== curY) {
            changedWorld = true
          }
          continue
        }
        const prev = posById[it.id]
        const cur = nextPos[it.id]
        if (!cur) continue
        const prevTop = prev ? quantizeOverlayPos(prev.top) : null
        const prevLeft = prev ? quantizeOverlayPos(prev.left) : null
        if (prevTop == null || prevLeft == null || prevTop !== cur.top || prevLeft !== cur.left) {
          changedPos = true
        }
      }
      if (!changedPos && !changedWorld) return
      if (workspaceOverlayOpenRef.current) return
      if (isWorkspaceGraphMutationBlocked(st)) return
      const storeGraphKey = buildGraphDocumentMetaKey((st as unknown as { graphData?: GraphData | null }).graphData || null)
      const shouldWriteGraphScopedInMemory = !!graphKey && graphKey !== storeGraphKey
      selfCommittedPosSignatureRef.current = buildPosSignature(overlayNodeIds, {
        posById: nextPos,
        worldById: nextWorld,
        pinnedById,
      })
      if (shouldWriteGraphScopedInMemory) {
        useGraphStore.setState(prev => {
          if (isWorkspaceGraphMutationBlocked(prev)) return {}
          const prevState = prev as unknown as {
            flowWidgetPosByNodeId?: Record<string, { top: number; left: number }>
            flowWidgetPosByNodeIdByGraphMetaKey?: Record<string, Record<string, { top: number; left: number }>>
            flowWidgetWorldPosByNodeId?: Record<string, { x: number; y: number }>
            flowWidgetWorldPosByNodeIdByGraphMetaKey?: Record<string, Record<string, { x: number; y: number }>>
          }
          const nextState: Record<string, unknown> = {}
          if (changedPos) {
            const byKey = prevState.flowWidgetPosByNodeIdByGraphMetaKey || {}
            nextState.flowWidgetPosByNodeId = nextPos
            nextState.flowWidgetPosByNodeIdByGraphMetaKey = { ...byKey, [graphKey]: nextPos }
          }
          if (changedWorld) {
            const byKey = prevState.flowWidgetWorldPosByNodeIdByGraphMetaKey || {}
            nextState.flowWidgetWorldPosByNodeId = nextWorld
            nextState.flowWidgetWorldPosByNodeIdByGraphMetaKey = { ...byKey, [graphKey]: nextWorld }
          }
          return nextState
        })
      } else {
      if (changedPos) st.setFlowWidgetPosByNodeId(nextPos)
      if (changedWorld) {
        ;(st as unknown as { setFlowWidgetWorldPosByNodeId?: (pos: Record<string, { x: number; y: number }>) => void }).setFlowWidgetWorldPosByNodeId?.(nextWorld)
      }
      }

      const stillOverlaps =
        shouldResolveItems(world.map(it => ({ id: it.id, left: it.left, top: it.top, width: it.width, height: it.height })))
        || shouldResolveItemsAgainstObstacles(world.map(it => ({ id: it.id, left: it.left, top: it.top, width: it.width, height: it.height })))
        || shouldRebalanceCluster(world.map(it => ({ id: it.id, left: it.left, top: it.top, width: it.width, height: it.height })))
      if (stillOverlaps && (changedPos || changedWorld)) {
        if (overlayCollisionSettleBaseKeyRef.current !== settleBaseKey) {
          overlayCollisionSettleBaseKeyRef.current = settleBaseKey
          overlayCollisionBestUnresolvedRef.current = Number.POSITIVE_INFINITY
          overlayCollisionRecentSigRef.current = []
        }
        overlayCollisionIterCountRef.current += 1
        const unresolvedPairCount = (() => {
          let count = 0
          const candidates = world.map(it => ({ id: it.id, left: it.left, top: it.top, width: it.width, height: it.height }))
          for (let i = 0; i < candidates.length; i += 1) {
            for (let j = i + 1; j < candidates.length; j += 1) {
              if (hasOverlap(candidates[i]!, candidates[j]!, floatingScaled, gapPx)) count += 1
            }
          }
          for (let i = 0; i < candidates.length; i += 1) {
            for (let j = 0; j < pinnedObstacles.length; j += 1) {
              if (distinctStoryboardOverlayRectsOverlap(candidates[i]!, pinnedObstacles[j]!, gapPx, floatingScaled)) count += 1
            }
          }
          if (shouldRebalanceCluster(candidates)) count += 1
          return count
        })()
        const finalSig = buildPosSignature(overlayNodeIds, {
          posById: nextPos,
          worldById: nextWorld,
          pinnedById,
        })
        const seenBefore = overlayCollisionRecentSigRef.current.includes(finalSig)
        const improved = unresolvedPairCount < overlayCollisionBestUnresolvedRef.current
        if (improved) {
          overlayCollisionBestUnresolvedRef.current = unresolvedPairCount
          overlayCollisionRecentSigRef.current = [finalSig]
        } else {
          const recent = overlayCollisionRecentSigRef.current
          recent.push(finalSig)
          while (recent.length > 4) recent.shift()
        }
        const allowReschedule =
          overlayCollisionIterCountRef.current <= 10
          && (improved || (!seenBefore && overlayCollisionIterCountRef.current <= 4))
        if (allowReschedule) {
          resetOverlayCollisionTransientState()
          scheduleOverlayCollisionResolveRef.current()
        }
      }
    })
  }, [
    canvasWindowOffset,
    canvasWindowOffsetRef,
    args.lastDroppedWidgetNodeIdRef,
    draftGraphDataRef,
    frontmatterFlowRenderSettings,
    getLiveNodeWorldPos,
    getLiveZoomTransform,
    overlayOnlyModeEnabled,
    queryActiveSurfaceOverlays,
    resetOverlayCollisionTransientState,
    renderGraphDataOverride,
    runtimeActive,
    schema,
    selectedNodeId,
    storyboardWidgetSurfaceId,
    viewportH,
    viewportW,
    zoomViewKeyRef,
  ])
  scheduleOverlayCollisionResolveRef.current = scheduleOverlayCollisionResolve

  React.useEffect(() => {
    const readWorkspaceOverlayOpen = () => isWorkspaceEditorOverlayOpen(useGraphStore.getState())
    workspaceOverlayOpenRef.current = readWorkspaceOverlayOpen()
    if (workspaceOverlayOpenRef.current) cancelOverlayCollisionResolve(true)
    const unsub = useGraphStore.subscribe(
      s => [s.workspaceViewMode, s.workspaceCanvasPaneOpen] as const,
      () => {
        const wasOpen = workspaceOverlayOpenRef.current
        const isOpen = readWorkspaceOverlayOpen()
        workspaceOverlayOpenRef.current = isOpen
        if (isOpen) {
          cancelOverlayCollisionResolve(true)
          return
        }
        if (wasOpen) scheduleOverlayCollisionResolve()
      },
    )
    return () => unsub()
  }, [cancelOverlayCollisionResolve, scheduleOverlayCollisionResolve])

  React.useEffect(() => {
    if (!runtimeActive || workspaceOverlayOpenRef.current) return
    resetOverlayCollisionTransientState()
    scheduleOverlayCollisionResolveRef.current()
  }, [
    canvasWindowOffset.left,
    canvasWindowOffset.top,
    runtimeActive,
    overlayOnlyModeEnabled,
    overlayNodeLayoutSignature,
    viewportH,
    viewportW,
    resetOverlayCollisionTransientState,
  ])

  React.useEffect(() => {
    if (!runtimeActive) return
    const handlePosLikeChange = () => {
      if (workspaceOverlayOpenRef.current) return
      const state = useGraphStore.getState()
      if (isWorkspaceGraphMutationBlocked(state)) return
      const graphDataForOverlayRuntime = draftGraphDataRef.current || renderGraphDataOverride || null
      const graphKey = buildGraphDocumentMetaKey(graphDataForOverlayRuntime)
      const overlayEls = queryActiveSurfaceOverlays(STORYBOARD_WIDGET_OVERLAY_ROOT_SELECTOR)
      const nodeIds = normalizeOverlaySignatureIds(overlayEls.map(el => String(el?.dataset?.kgWidget || '').trim()))
      const currentSig = buildPosSignature(nodeIds, {
        posById: resolveScopedFlowWidgetNodeMap({
          graphMetaKey: graphKey,
          keyedByGraphMetaKey: (state as unknown as { flowWidgetPosByNodeIdByGraphMetaKey?: Record<string, Record<string, { top: number; left: number }>> }).flowWidgetPosByNodeIdByGraphMetaKey,
          globalByNodeId: state.flowWidgetPosByNodeId,
        }),
        worldById: resolveScopedFlowWidgetNodeMap({
          graphMetaKey: graphKey,
          keyedByGraphMetaKey: (state as unknown as { flowWidgetWorldPosByNodeIdByGraphMetaKey?: Record<string, Record<string, { x: number; y: number }>> }).flowWidgetWorldPosByNodeIdByGraphMetaKey,
          globalByNodeId: (state as unknown as { flowWidgetWorldPosByNodeId?: Record<string, { x: number; y: number }> }).flowWidgetWorldPosByNodeId,
        }),
        pinnedById: resolveScopedFlowWidgetNodeMap({
          graphMetaKey: graphKey,
          keyedByGraphMetaKey: (state as unknown as { flowWidgetPinnedByNodeIdByGraphMetaKey?: Record<string, Record<string, boolean>> }).flowWidgetPinnedByNodeIdByGraphMetaKey,
          globalByNodeId: state.flowWidgetPinnedByNodeId,
        }),
      })
      if (currentSig && currentSig === selfCommittedPosSignatureRef.current) {
        selfCommittedPosSignatureRef.current = ''
        observedStorePosSignatureRef.current = currentSig
        return
      }
      if (currentSig && currentSig === observedStorePosSignatureRef.current) {
        return
      }
      observedStorePosSignatureRef.current = currentSig
      scheduleOverlayCollisionResolveRef.current()
    }
    const unsubPos = useGraphStore.subscribe(s => s.flowWidgetPosByNodeId, handlePosLikeChange)
    const unsubPosByKey = useGraphStore.subscribe(
      s => (s as unknown as { flowWidgetPosByNodeIdByGraphMetaKey?: Record<string, Record<string, { top: number; left: number }>> }).flowWidgetPosByNodeIdByGraphMetaKey,
      handlePosLikeChange,
    )
    // Zoom writes world positions to preserve each widget's visual center after CSS scaling.
    // Pin state only changes placement authority. Neither is a collision-layout trigger.
    const unsubOpenWidgets = useGraphStore.subscribe(
      s => normalizeOverlaySignatureIds(
        Array.isArray(s.openWidgetNodeIdsByRenderer?.storyboard)
          ? s.openWidgetNodeIdsByRenderer.storyboard
          : (Array.isArray(s.openWidgetNodeIds) ? s.openWidgetNodeIds : []),
      ).join('|'),
      () => {
        if (workspaceOverlayOpenRef.current) return
        if (isWorkspaceGraphMutationBlocked(useGraphStore.getState())) return
        // #region debug-point C:open-widget-subscription
        {
          const st = useGraphStore.getState()
          reportStoryboardMediaPanelLoopOverlayCollisionDebug({
            hypothesisId: 'B',
            location: 'useStoryboardWidgetOverlayCollision.ts:open-widget-subscription',
            msg: 'overlay collision open-widget subscription fired',
            data: {
              canvas2dRenderer: String((st as { canvas2dRenderer?: unknown }).canvas2dRenderer || ''),
              openWidgetNodeIds: Array.isArray((st as { openWidgetNodeIds?: unknown[] }).openWidgetNodeIds)
                ? (st as { openWidgetNodeIds?: unknown[] }).openWidgetNodeIds!.map(id => String(id || '').trim()).filter(Boolean)
                : [],
              storyboardWidgetScopedOpenWidgetNodeIds: Array.isArray((st as { openWidgetNodeIdsByRenderer?: Record<string, unknown[]> }).openWidgetNodeIdsByRenderer?.storyboard)
                ? ((st as { openWidgetNodeIdsByRenderer?: Record<string, unknown[]> }).openWidgetNodeIdsByRenderer?.storyboard || []).map(id => String(id || '').trim()).filter(Boolean)
                : [],
              activeRendererScopedOpenWidgetNodeIds: Array.isArray((st as { openWidgetNodeIdsByRenderer?: Record<string, unknown[]> }).openWidgetNodeIdsByRenderer?.[String((st as { canvas2dRenderer?: unknown }).canvas2dRenderer || '')])
                ? ((st as { openWidgetNodeIdsByRenderer?: Record<string, unknown[]> }).openWidgetNodeIdsByRenderer?.[String((st as { canvas2dRenderer?: unknown }).canvas2dRenderer || '')] || []).map(id => String(id || '').trim()).filter(Boolean)
                : [],
            },
          })
        }
        // #endregion
        scheduleOverlayCollisionResolveRef.current()
      },
    )
    return () => {
      try {
        unsubPos()
      } catch {
        void 0
      }
      try {
        unsubPosByKey()
      } catch {
        void 0
      }
      try {
        unsubOpenWidgets()
      } catch {
        void 0
      }
    }
  }, [draftGraphDataRef, queryActiveSurfaceOverlays, renderGraphDataOverride, runtimeActive])

  React.useEffect(() => {
    return () => {
      if (overlayCollisionResolveRafRef.current != null) {
        try {
          cancelAnimationFrame(overlayCollisionResolveRafRef.current)
        } catch {
          void 0
        }
        overlayCollisionResolveRafRef.current = null
      }
    }
  }, [])

  return { scheduleOverlayCollisionResolve }
}
