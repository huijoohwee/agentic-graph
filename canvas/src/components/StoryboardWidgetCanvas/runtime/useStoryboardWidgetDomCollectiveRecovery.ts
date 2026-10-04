import React from 'react'
import type { FlowNativeRuntime } from '@/components/FlowCanvas/nativeRuntime'
import { buildFlowOverlayBoundsFromRects, deriveFlowOverlayCollectiveViewportState, hasFlowOverlayCollectiveTopologyChanged, type VisibleFlowViewport } from '@/components/FlowCanvas/workspaceVisibleViewportRecovery'
import { placeWidgetsCenteredInGroupBounds } from '@/components/StoryboardWidget/seedGroupSpread'
import { computeCollectiveFollowPinnedScale, computeWidgetScaledSize, WIDGET_BASE_SIZE, WIDGET_LAYOUT_BASE_HEIGHT_PX } from '@/lib/canvas/overlayWidgetZoom'
import { useGraphStore } from '@/hooks/useGraphStore'
import { isWorkspaceGraphMutationBlocked } from '@/features/workspace-table/workspaceTableSsot'
import { getEffectiveZoomStateForKey } from '@/lib/canvas/zoom-effective'
import { CANVAS_OVERLAY_PROXY_ROOT_SELECTOR, collectCanonicalStoryboardWidgetOverlayRectEntries, emitStoryboardWidgetInteractionFrame as emitStoryboardWidgetInteractionFrameEvent, findStoryboardWidgetOverlaySurfaceRoot, queryStoryboardWidgetOverlayRootsForSurface } from '@/lib/canvas/storyboard-widget-overlay-proxy'
import { computeBalancedSpreadBaseGapPx, computeBalancedSpreadViewportMargins, computeBalancedSpreadSpacingPx } from '@/lib/ui/overlayBalancedSpread'
import { useIsomorphicLayoutEffect } from '@/lib/react/useIsomorphicLayoutEffect'
import type { GraphData } from '@/lib/graph/types'
import { readGraphDataRevision } from '@/lib/graph/documentMetadata'
import { getCachedStoryboardWidgetPlacementContext } from './storyboardWidgetRenderGraph'
import { resolveBalancedViewportPreset } from '@/lib/graph/frontmatterFlowSettings'
import { resolveScopedFlowWidgetNodeMap } from '@/lib/storyboardWidget/widgetStateScope'
import { resolveEffectiveFlowWidgetPinnedInCanvas, shouldUseStoryboardWidgetFloatingScreenAuthority } from '@/lib/storyboardWidget/widgetPlacementAuthority'
import { resolveStoryboardWidgetGraphDataForNodeAuthority } from '@/lib/storyboardWidget/storyboardWidgetGraphAuthority'
import { buildGraphDocumentMetaKey } from '@/lib/graph/graphMetaKey'
import type { FlowWidgetPinnedById, FlowWidgetScreenPosById, FlowWidgetWorldPosById } from './storyboardWidgetRuntimeWidgetState'
import { pushStoryboardWidgetRuntimeSceneTrace, type FlowRuntimeZoomTransform } from './storyboardWidgetRuntimeSceneDiagnostics'

const MAX_RECOVERY_FRAMES = 240
type RecoveryArgs = {
  active: boolean; storyboardWidgetSurfaceId?: string; openWidgetNodeIds: string[]
  overlayNodeLayoutSignature: string; viewportH: number; viewportW: number
  zoomViewKeyRef: React.MutableRefObject<string | null>
  flowRuntimeRefRef: React.MutableRefObject<React.MutableRefObject<FlowNativeRuntime | null> | null>
  flowWidgetPinnedCount: number; flowWidgetWorldPosCount: number; workspaceMutationBlocked: boolean
  getLiveZoomTransform: () => FlowRuntimeZoomTransform | null
  getVisibleViewport: () => Omit<VisibleFlowViewport, 'centerX' | 'centerY'>
  readPreferredGraphDataForSeeding: () => GraphData | null
}

export function useStoryboardWidgetDomCollectiveRecovery(args: RecoveryArgs) {
  const {
    flowRuntimeRefRef, flowWidgetPinnedCount, flowWidgetWorldPosCount, workspaceMutationBlocked,
    getLiveZoomTransform, getVisibleViewport, readPreferredGraphDataForSeeding,
  } = args
  const domCollectiveRecoveryAttemptByScopeRef = React.useRef<Record<string, number>>({})
  const domCollectiveNodeIdsRef = React.useRef<string[]>([])
  const domCollectiveLayoutSignatureRef = React.useRef<string>('')
  useIsomorphicLayoutEffect(() => {
    if (!args.active) return
    if (typeof window === 'undefined' || typeof document === 'undefined') return
    let cancelled = false
    let rafId: number | null = null
    let observer: MutationObserver | null = null
    let readinessAttempts = 0
    const currentLayoutSignature = String(args.overlayNodeLayoutSignature || '').trim()
    const previousLayoutSignature = domCollectiveLayoutSignatureRef.current
    let establishedTopologyChanged =
      previousLayoutSignature.length > 0
      && currentLayoutSignature.length > 0
      && previousLayoutSignature !== currentLayoutSignature
    if (currentLayoutSignature) domCollectiveLayoutSignatureRef.current = currentLayoutSignature
    const run = (): boolean => {
      if (cancelled) return true
      const roots = queryStoryboardWidgetOverlayRootsForSurface({
        surfaceId: args.storyboardWidgetSurfaceId,
        selector: CANVAS_OVERLAY_PROXY_ROOT_SELECTOR,
      })
      const canonicalEntries = collectCanonicalStoryboardWidgetOverlayRectEntries(roots)
      const currentNodeIds = canonicalEntries
        .map(entry => String(entry.id || '').trim())
        .filter(Boolean)
        .sort((leftId, rightId) => leftId.localeCompare(rightId))
      const previousNodeIds = domCollectiveNodeIdsRef.current
      if (hasFlowOverlayCollectiveTopologyChanged({
        previousIds: previousNodeIds,
        currentIds: currentNodeIds,
      })) {
        establishedTopologyChanged = true
      }
      if (currentNodeIds.length > 0) domCollectiveNodeIdsRef.current = currentNodeIds
      if (canonicalEntries.length === 0) return false
      const surfaceRoot = findStoryboardWidgetOverlaySurfaceRoot(args.storyboardWidgetSurfaceId)
      const surfaceRect = surfaceRoot?.getBoundingClientRect() || null
      const surfaceOffsetLeft = surfaceRect && Number.isFinite(surfaceRect.left) ? Number(surfaceRect.left) : 0
      const surfaceOffsetTop = surfaceRect && Number.isFinite(surfaceRect.top) ? Number(surfaceRect.top) : 0
      const rootRectItems = canonicalEntries.map(entry => {
        const rect = entry.rect
        return {
          id: entry.id,
          screenLeft: rect.left,
          screenTop: rect.top,
          left: rect.left - surfaceOffsetLeft,
          top: rect.top - surfaceOffsetTop,
          right: rect.right - surfaceOffsetLeft,
          bottom: rect.bottom - surfaceOffsetTop,
        }
      })
      const bounds = buildFlowOverlayBoundsFromRects({
        items: rootRectItems,
      })
      const boundsIds = bounds?.ids || []
      if (!bounds || boundsIds.length === 0) return true
      const st = useGraphStore.getState()
      const graphDataForSeeding = resolveStoryboardWidgetGraphDataForNodeAuthority({
        preferredGraphData: readPreferredGraphDataForSeeding(),
        authorityGraphData: (st.graphData || null) as GraphData | null,
        nodeIds: args.openWidgetNodeIds,
      })
      const graphRevisionForSeeding = readGraphDataRevision(graphDataForSeeding)
      const graphKey = buildGraphDocumentMetaKey(graphDataForSeeding)
      const widgetPlacementContext = getCachedStoryboardWidgetPlacementContext({
        graphData: graphDataForSeeding,
        graphRevision: graphRevisionForSeeding,
        openWidgetNodeIds: args.openWidgetNodeIds,
        preferCurrentGraphDataRefs: true,
      })
      const graphMetaKind = widgetPlacementContext?.graphMetaKind || null
      const pinnedById = resolveScopedFlowWidgetNodeMap({
        graphMetaKey: graphKey,
        keyedByGraphMetaKey: (st as unknown as { flowWidgetPinnedByNodeIdByGraphMetaKey?: Record<string, FlowWidgetPinnedById> }).flowWidgetPinnedByNodeIdByGraphMetaKey,
        globalByNodeId: st.flowWidgetPinnedByNodeId,
      })
      const skipDomCollectiveRecoveryForFrontmatterScreenAuthority =
        graphMetaKind === 'frontmatter-flow'
        && boundsIds.every(rawId => {
          const id = String(rawId || '').trim()
          if (!id) return false
          const pinned = resolveEffectiveFlowWidgetPinnedInCanvas({
            graphMetaKind,
            node: null,
            pinnedValue: typeof pinnedById[id] === 'boolean' ? pinnedById[id]! : null,
          })
          return shouldUseStoryboardWidgetFloatingScreenAuthority({ graphMetaKind, pinnedInCanvas: pinned })
        })
      if (skipDomCollectiveRecoveryForFrontmatterScreenAuthority) {
        return true
      }
      const visibleViewport = getVisibleViewport()
      const visibleViewportCenterX = visibleViewport.left + visibleViewport.width / 2
      const visibleViewportCenterY = visibleViewport.top + visibleViewport.height / 2
      const viewportState = deriveFlowOverlayCollectiveViewportState({
        bounds,
        visibleViewport: {
          left: visibleViewport.left,
          top: visibleViewport.top,
          right: visibleViewport.right,
          bottom: visibleViewport.bottom,
          width: visibleViewport.width,
          height: visibleViewport.height,
          centerX: visibleViewportCenterX,
          centerY: visibleViewportCenterY,
        },
      })
      // Topology growth already carries graph-owned placement authored in the
      // painted camera frame. Preserve both authorities; only explicit layout
      // commands may move the established collective or camera.
      if (establishedTopologyChanged) return true
      if (boundsIds.length <= 1) return true
      const measuredCenterX = (bounds.minX + bounds.maxX) / 2
      const measuredCenterY = (bounds.minY + bounds.maxY) / 2
      const measuredCenterShiftX = visibleViewportCenterX - measuredCenterX
      const measuredCenterShiftY = visibleViewportCenterY - measuredCenterY
      const measuredCenterToleranceX = Math.max(24, visibleViewport.width * 0.06)
      const measuredCenterToleranceY = Math.max(24, visibleViewport.height * 0.08)
      const measuredAspect = bounds.width / Math.max(1, bounds.height)
      const measuredShapeBalanced =
        viewportState?.fitsVisibleViewport === true
        && measuredAspect >= 0.18
        && measuredAspect <= 6
      const needsMeasuredCenterShift =
        measuredShapeBalanced
        && (
          Math.abs(measuredCenterShiftX) > measuredCenterToleranceX
          || Math.abs(measuredCenterShiftY) > measuredCenterToleranceY
        )
      if (viewportState?.balanced === true && !needsMeasuredCenterShift) return true
      const idsKey = boundsIds
        .map(id => String(id || '').trim())
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b))
        .join(',')
      const scopeKey = [
        String(args.overlayNodeLayoutSignature || '').trim(),
        String(args.storyboardWidgetSurfaceId || '').trim(),
        idsKey,
        `${Math.round(visibleViewport.left)}:${Math.round(visibleViewport.top)}:${Math.round(visibleViewport.width)}x${Math.round(visibleViewport.height)}`,
        `${Math.round(bounds.minX)}:${Math.round(bounds.minY)}:${Math.round(bounds.maxX)}:${Math.round(bounds.maxY)}`,
      ].join('|')
      const attempts = domCollectiveRecoveryAttemptByScopeRef.current[scopeKey] || 0
      if (attempts >= 6) return true
      domCollectiveRecoveryAttemptByScopeRef.current = {
        ...domCollectiveRecoveryAttemptByScopeRef.current,
        [scopeKey]: attempts + 1,
      }
      const currentWorld = resolveScopedFlowWidgetNodeMap({
        graphMetaKey: graphKey,
        keyedByGraphMetaKey: (st as unknown as { flowWidgetWorldPosByNodeIdByGraphMetaKey?: Record<string, FlowWidgetWorldPosById> }).flowWidgetWorldPosByNodeIdByGraphMetaKey,
        globalByNodeId: (st as unknown as { flowWidgetWorldPosByNodeId?: FlowWidgetWorldPosById }).flowWidgetWorldPosByNodeId,
      })
      const currentScreen = resolveScopedFlowWidgetNodeMap({
        graphMetaKey: graphKey,
        keyedByGraphMetaKey: (st as unknown as { flowWidgetPosByNodeIdByGraphMetaKey?: Record<string, FlowWidgetScreenPosById> }).flowWidgetPosByNodeIdByGraphMetaKey,
        globalByNodeId: (st as unknown as { flowWidgetPosByNodeId?: FlowWidgetScreenPosById }).flowWidgetPosByNodeId,
      })
      const z =
        getLiveZoomTransform()
        || getEffectiveZoomStateForKey({
          zoomViewKey: args.zoomViewKeyRef.current,
          zoomStateByKey: st.zoomStateByKey,
          zoomState: st.zoomState,
        })
        || { k: 1, x: 0, y: 0 }
      const zoomK = typeof z.k === 'number' && Number.isFinite(z.k) ? z.k : 1
      const zoomX = typeof z.x === 'number' && Number.isFinite(z.x) ? z.x : 0
      const zoomY = typeof z.y === 'number' && Number.isFinite(z.y) ? z.y : 0
      const safeZoomK = Math.max(0.001, zoomK)
      const balancedViewportPreset = resolveBalancedViewportPreset({
        graphData: graphDataForSeeding,
        fallbackPreset: 'widgetCanvas',
      })
      const spreadMargins = computeBalancedSpreadViewportMargins({
        viewportW: visibleViewport.width,
        viewportH: visibleViewport.height,
        preset: balancedViewportPreset,
      })
      const baseGapPx = computeBalancedSpreadBaseGapPx({
        viewportW: visibleViewport.width,
        viewportH: visibleViewport.height,
        preset: balancedViewportPreset,
        margins: spreadMargins,
      })
      const panelScale = computeCollectiveFollowPinnedScale({
        zoomK,
        viewportW: visibleViewport.width,
        viewportH: visibleViewport.height,
        count: Math.max(1, boundsIds.length),
        baseWidth: WIDGET_BASE_SIZE.width,
        // Collective layout needs the taller storyboard surface footprint even
        // though the rendered widget still uses the shared stable paint size.
        baseHeight: WIDGET_LAYOUT_BASE_HEIGHT_PX,
        viewportPreset: balancedViewportPreset,
        fitToViewport: false,
      })
      const panelScreen = computeWidgetScaledSize(panelScale)
      const gapScreenPx = computeBalancedSpreadSpacingPx({
        baseGapPx,
        zoomK,
        count: Math.max(1, boundsIds.length),
        preset: balancedViewportPreset,
      })
      const placed = needsMeasuredCenterShift
        ? rootRectItems
            .map(item => ({
              id: String(item.id || '').trim(),
              x: item.left + measuredCenterShiftX,
              y: item.top + measuredCenterShiftY,
              screenX: item.screenLeft + measuredCenterShiftX,
              screenY: item.screenTop + measuredCenterShiftY,
            }))
            .filter(item => item.id && Number.isFinite(item.x) && Number.isFinite(item.y))
        : placeWidgetsCenteredInGroupBounds({
            ids: boundsIds,
            bounds: {
              minX: visibleViewport.left + spreadMargins.left,
              minY: visibleViewport.top + spreadMargins.top,
              maxX: visibleViewport.right - spreadMargins.right,
              maxY: visibleViewport.bottom - spreadMargins.bottom,
            },
            cellW: panelScreen.width + gapScreenPx,
            cellH: panelScreen.height + gapScreenPx,
            gapWorld: gapScreenPx,
            snapWorld: value => value,
          }).map(item => ({
            ...item,
            screenX: item.x + surfaceOffsetLeft,
            screenY: item.y + surfaceOffsetTop,
          }))
      if (placed.length <= 0) return true
      const nextWorld = { ...currentWorld }
      const nextScreen = { ...currentScreen }
      let changedWorld = false
      let changedScreen = false
      for (let i = 0; i < placed.length; i += 1) {
        const p = placed[i]!
        const id = String(p.id || '').trim()
        if (!id) continue
        const world = {
          x: (p.x - zoomX) / safeZoomK,
          y: (p.y - zoomY) / safeZoomK,
        }
        const prevWorld = nextWorld[id]
        if (!prevWorld || Math.abs(prevWorld.x - world.x) > 0.0001 || Math.abs(prevWorld.y - world.y) > 0.0001) {
          nextWorld[id] = world
          changedWorld = true
        }
        const screen = { left: p.screenX, top: p.screenY }
        const prevScreen = nextScreen[id]
        if (!prevScreen || Math.abs(prevScreen.left - screen.left) > 0.0001 || Math.abs(prevScreen.top - screen.top) > 0.0001) {
          nextScreen[id] = screen
          changedScreen = true
        }
      }
      if (!changedWorld && !changedScreen) return true
      if (isWorkspaceGraphMutationBlocked(st)) {
        pushStoryboardWidgetRuntimeSceneTrace({
          reason: 'workspace-blocked-skipping-dom-collective-seed-write',
          sceneNodeCount: flowRuntimeRefRef.current?.current?.scene?.nodes?.length || 0,
          positionsReady: flowRuntimeRefRef.current?.current?.positionsReady === true,
          workspaceMutationBlocked: true,
          viewportW: args.viewportW,
          viewportH: args.viewportH,
          transform: z,
        })
        return true
      }
      if (changedScreen) st.setFlowWidgetPosByNodeId(nextScreen)
      if (changedWorld) st.setFlowWidgetWorldPosByNodeId(nextWorld)
      emitStoryboardWidgetInteractionFrameEvent()
      return false
    }
    const disconnectObserver = () => {
      observer?.disconnect()
      observer = null
    }
    const scheduleReadinessRetry = () => {
      if (cancelled || rafId != null || readinessAttempts >= MAX_RECOVERY_FRAMES) return
      rafId = window.requestAnimationFrame(() => {
        rafId = null
        if (cancelled) return
        readinessAttempts += 1
        const settled = run()
        if (settled || readinessAttempts >= MAX_RECOVERY_FRAMES) {
          if (!settled) {
            pushStoryboardWidgetRuntimeSceneTrace({
              reason: 'dom-collective-recovery-frame-budget-exhausted',
              sceneNodeCount: flowRuntimeRefRef.current?.current?.scene?.nodes?.length || 0,
              positionsReady: flowRuntimeRefRef.current?.current?.positionsReady === true,
              workspaceMutationBlocked: isWorkspaceGraphMutationBlocked(useGraphStore.getState()),
              viewportW: args.viewportW,
              viewportH: args.viewportH,
              transform: getLiveZoomTransform(),
            })
          }
          disconnectObserver()
          return
        }
        scheduleReadinessRetry()
      })
    }
    if (!run()) {
      if (typeof MutationObserver !== 'undefined' && document.body) {
        // Media layout can mutate again after a position commit. Run recovery
        // once per frame so this observer cannot recursively consume microtasks.
        observer = new MutationObserver(scheduleReadinessRetry)
        observer.observe(document.body, {
          childList: true,
          subtree: true,
          attributes: true,
          attributeFilter: ['data-kg-widget', 'data-kg-storyboard-widget-surface', 'style'],
        })
      }
      scheduleReadinessRetry()
    }
    return () => {
      cancelled = true
      observer?.disconnect()
      observer = null
      if (rafId != null) {
        try {
          window.cancelAnimationFrame(rafId)
        } catch {
          void 0
        }
      }
    }
  }, [
    args.active,
    args.storyboardWidgetSurfaceId,
    args.overlayNodeLayoutSignature,
    args.viewportH,
    args.viewportW,
    flowWidgetPinnedCount,
    flowWidgetWorldPosCount,
    getVisibleViewport,
    workspaceMutationBlocked,
  ])
}
