import React from 'react'
import { useGraphStore } from '@/hooks/useGraphStore'
import { readScopedFlowWidgetNodeValue } from '@/lib/storyboardWidget/widgetStateScope'
import { getEffectiveZoomStateForKey } from '@/lib/canvas/zoom-effective'
import { screenToWorld } from '@/lib/zoom/viewport'
import { useIsomorphicLayoutEffect } from '@/lib/react/useIsomorphicLayoutEffect'
import { DEFAULT_ZOOM_MAX_SCALE, DEFAULT_ZOOM_MIN_SCALE, DEFAULT_ZOOM_MIN_SCALE_HARD_CAP, readZoomScaleExtent } from '@/lib/graph/layoutDefaults'
import { WIDGET_ACTIONS_TOOLBAR_MAX_WIDTH_PX } from '@/components/StoryboardWidget/flowWidgetOverlayShared'
import { COLLECTIVE_OVERLAY_SCALE_LIMITS_16X9 } from '@/lib/ui/overlayScaleLimits'
import { computeCollectiveFollowPinnedScale, computeCollectiveFollowZoomK, computeWidgetScaleKey, computeWidgetScaledSize, WIDGET_BASE_SIZE } from '@/lib/canvas/overlayWidgetZoom'
import type { VectorPaintedOverlayScaleProjectionBase } from '@/lib/canvas/vectorPaintedOverlayProjection'
import { isFrontmatterManagedOverlayNode } from '@/components/StoryboardWidget/widgetFrontmatterPlacement'
import { STORYBOARD_WIDGET_SCREEN_AUTHORITY_COLLECTIVE_PAN_EVENT } from '@/lib/storyboardWidget/screenAuthorityCollectivePan'
import type { GraphSchema } from '@/lib/graph/schema'
import {
  type AppliedOverlayPlacement,
  persistCurrentScreenPlacementAsWorldPlacementState,
  persistFloatingPlacementState,
  persistFloatingPosForNode,
  persistFloatingScreenPlacementState,
  persistWorldPosForNode,
  readCurrentOverlayScreenPlacementForHandoffState,
  readCurrentOverlayScreenPlacementState,
  readCurrentTransformState,
  readPinConversionTransformState,
  readScreenAuthorityFollowZoomKState,
  readStoredFloatingScreenPlacementState,
  readStoredWidgetWorldPosForNode,
  resolveDefaultFloatingPosState,
  resolveFloatingPosState,
  shouldBypassStoreZoomFallback as shouldBypassStoreZoomFallbackState,
} from '@/components/StoryboardWidget/widgetPlacementRuntimeState'
import { applyWidgetOverlayPosition } from '@/components/StoryboardWidget/widgetPlacementRuntimeProjection'
import { useWidgetPlacementRuntimeRefSync } from '@/components/StoryboardWidget/useWidgetPlacementRuntimeRefSync'

export type ApplyOverlayPositionOptions = {
  emitInteractionFrame?: boolean
  updateToolbarLayout?: boolean
}

export function useWidgetPlacementRuntime(args: {
  node: { x?: unknown; y?: unknown; properties?: unknown }
  nodeId: string
  stackIndex?: number
  active: boolean
  storyboardWidgetSurfaceId?: string | null
  viewportW: number
  viewportH: number
  canvasWindowOffset?: { left: number; top: number } | null
  graphMetaKey?: string | null
  graphMetaKind?: string | null
  zoomViewKey?: string | null
  getLiveNodeWorldPos?: (nodeId: string) => { x: number; y: number } | null
  getLiveZoomTransform?: () => { k: number; x: number; y: number } | null
  getLiveContainmentGroupAabbForNode?: (nodeId: string) => { groupId: string; minX: number; minY: number; maxX: number; maxY: number } | null
  widgetPos: { top: number; left: number } | undefined
  schema: unknown
  openWidgetNodeCount: number
  autoStackOffset: { top: number; left: number }
  floating: boolean
  floatingUsesScreenAuthority: boolean
}) {
  const {
    node,
    nodeId,
    stackIndex,
    active,
    storyboardWidgetSurfaceId,
    viewportW,
    viewportH,
    canvasWindowOffset,
    graphMetaKey,
    graphMetaKind,
    zoomViewKey,
    getLiveNodeWorldPos,
    getLiveZoomTransform,
    getLiveContainmentGroupAabbForNode,
    widgetPos,
    schema,
    openWidgetNodeCount,
    autoStackOffset,
    floating,
    floatingUsesScreenAuthority,
  } = args

  const asideRef = React.useRef<HTMLElement | null>(null)
  const nodeRef = React.useRef(node)
  const widgetWorldPosRef = React.useRef<{ x: number; y: number } | null>(null)
  const lastGoodWorldPosRef = React.useRef<{ x: number; y: number } | null>(null)
  const pinnedDragOverrideRef = React.useRef<{ left: number; top: number } | null>(null)
  const worldDragOverrideRef = React.useRef<{ x: number; y: number } | null>(null)
  const viewportRef = React.useRef<{ width: number; height: number }>({ width: viewportW, height: viewportH })
  const canvasWindowOffsetRef = React.useRef<{ left: number; top: number }>({ left: 0, top: 0 })
  const schemaRef = React.useRef<GraphSchema | null>(schema && typeof schema === 'object' && !Array.isArray(schema) ? schema as GraphSchema : null)
  const floatingRef = React.useRef(floating)
  const anchoredPosRef = React.useRef<{ top: number; left: number }>({ top: 48, left: 16 })
  const scaledSizeRef = React.useRef<{ width: number; height: number }>({ width: WIDGET_BASE_SIZE.width, height: WIDGET_BASE_SIZE.height })
  const zoomStateRef = React.useRef<{ k: number; x: number; y: number } | null>(
    getEffectiveZoomStateForKey({
      zoomViewKey,
      zoomStateByKey: useGraphStore.getState().zoomStateByKey,
      zoomState: useGraphStore.getState().zoomState,
    }),
  )
  const lastAppliedRef = React.useRef<AppliedOverlayPlacement | null>(null)
  const screenAuthorityZoomBaselineKRef = React.useRef<number | null>(null)
  const screenAuthorityLayoutZoomBaseRef = React.useRef<{ left: number; top: number; scale: number } | null>(null)
  const storyboardPinnedZoomLayoutBaseRef = React.useRef<VectorPaintedOverlayScaleProjectionBase | null>(null)
  const lastStoryboardPinnedTransformRef = React.useRef<{ k: number; x: number; y: number } | null>(null)
  const screenAuthorityHandoffPosRef = React.useRef<{ left: number; top: number; scale: number } | null>(null)
  const initialFrontmatterManagedNode = isFrontmatterManagedOverlayNode(graphMetaKind, node)
  const lastFloatingScaleKeyRef = React.useRef<string>(computeWidgetScaleKey(computeCollectiveFollowPinnedScale({
    zoomK: zoomStateRef.current?.k ?? 1,
    viewportW,
    viewportH,
    count: openWidgetNodeCount,
    baseWidth: WIDGET_BASE_SIZE.width,
    baseHeight: WIDGET_BASE_SIZE.height,
    viewportPreset: initialFrontmatterManagedNode ? 'widgetFrontmatter' : 'widgetCanvas',
    fitToViewport: false,
  })))
  const cssInitRef = React.useRef(false)
  const livePosWarmupRafRef = React.useRef<number | null>(null)

  const readPanelScaleForZoom = React.useCallback((zoomK: number, frontmatterManagedNode = false, viewportOverride?: { width: number; height: number } | null) => {
    const extent = (() => {
      const s = schemaRef.current
      if (!s) return { minK: DEFAULT_ZOOM_MIN_SCALE, maxK: DEFAULT_ZOOM_MAX_SCALE }
      const [minK, maxK] = readZoomScaleExtent(s)
      return { minK: Math.min(minK, DEFAULT_ZOOM_MIN_SCALE_HARD_CAP), maxK }
    })()
    const scaleViewportW = Number.isFinite(viewportOverride?.width) && Number(viewportOverride?.width) > 0
      ? Number(viewportOverride?.width)
      : viewportW
    const scaleViewportH = Number.isFinite(viewportOverride?.height) && Number(viewportOverride?.height) > 0
      ? Number(viewportOverride?.height)
      : viewportH
    return computeCollectiveFollowPinnedScale({
      zoomK, extent, viewportW: scaleViewportW, viewportH: scaleViewportH, count: openWidgetNodeCount,
      baseWidth: WIDGET_BASE_SIZE.width, baseHeight: WIDGET_BASE_SIZE.height, quantizeStep: 0.02,
      hardMinScale: COLLECTIVE_OVERLAY_SCALE_LIMITS_16X9.widget.min, hardMaxScale: COLLECTIVE_OVERLAY_SCALE_LIMITS_16X9.widget.max,
      viewportPreset: frontmatterManagedNode ? 'widgetFrontmatter' : 'widgetCanvas', fitToViewport: false,
    })
  }, [openWidgetNodeCount, viewportH, viewportW])

  const readScreenAuthorityFollowZoomK = React.useCallback((zoomK: number, enabled: boolean): number => {
    return readScreenAuthorityFollowZoomKState({
      zoomK,
      enabled,
      screenAuthorityZoomBaselineKRef,
      computeCollectiveFollowZoomK,
    })
  }, [])

  const defaultFloatingPos = React.useMemo(() => {
    return resolveDefaultFloatingPosState({
      stackIndex,
      viewportW,
      viewportH,
      initialFrontmatterManagedNode,
      floatingUsesScreenAuthority,
      zoomK: zoomStateRef.current?.k ?? 1,
      openWidgetNodeCount,
      readPanelScaleForZoom,
    })
  }, [floatingUsesScreenAuthority, initialFrontmatterManagedNode, openWidgetNodeCount, readPanelScaleForZoom, stackIndex, viewportH, viewportW])

  const resolveFloatingPos = React.useCallback(
    (pos: { top: number; left: number } | undefined, fallback: { top: number; left: number }): { top: number; left: number } => {
      return resolveFloatingPosState({
        pos,
        fallback,
        initialFrontmatterManagedNode,
        floatingUsesScreenAuthority,
        hasAppliedPlacement: Boolean(lastAppliedRef.current),
        openWidgetNodeCount,
      })
    },
    [floatingUsesScreenAuthority, initialFrontmatterManagedNode, openWidgetNodeCount],
  )

  const [pinnedTopPx, setPinnedTopPx] = React.useState<number>(() => resolveFloatingPos(widgetPos, defaultFloatingPos).top)
  const [pinnedLeftPx, setPinnedLeftPx] = React.useState<number>(() => resolveFloatingPos(widgetPos, defaultFloatingPos).left)
  const [toolbarDock, setToolbarDock] = React.useState<'above' | 'below'>('above')
  const [toolbarInlineShiftPx, setToolbarInlineShiftPx] = React.useState(0)
  const [toolbarMaxWidthPx, setToolbarMaxWidthPx] = React.useState(WIDGET_ACTIONS_TOOLBAR_MAX_WIDTH_PX)

  useWidgetPlacementRuntimeRefSync({
    node,
    nodeRef,
    floating,
    floatingRef,
    viewportW,
    viewportH,
    viewportRef,
    canvasWindowOffset,
    canvasWindowOffsetRef,
    schema,
    schemaRef,
    floatingUsesScreenAuthority,
    storyboardWidgetSurfaceId,
    graphMetaKey,
    nodeId,
    screenAuthorityZoomBaselineKRef,
    screenAuthorityLayoutZoomBaseRef,
    screenAuthorityHandoffPosRef,
  })

  useIsomorphicLayoutEffect(() => {
    if (initialFrontmatterManagedNode && floatingUsesScreenAuthority && lastAppliedRef.current && !pinnedDragOverrideRef.current) return
    const pos = resolveFloatingPos(widgetPos, defaultFloatingPos)
    setPinnedTopPx(prev => (prev === pos.top ? prev : pos.top))
    setPinnedLeftPx(prev => (prev === pos.left ? prev : pos.left))
  }, [defaultFloatingPos, floatingUsesScreenAuthority, initialFrontmatterManagedNode, widgetPos, resolveFloatingPos])

  const persistFloatingPos = React.useCallback(
    (pos: { top: number; left: number }) => {
      persistFloatingPosForNode({ nodeId, graphMetaKey, pos })
    },
    [graphMetaKey, nodeId],
  )

  const persistWorldPos = React.useCallback(
    (pos: { x: number; y: number }) => {
      persistWorldPosForNode({ nodeId, graphMetaKey, pos })
    },
    [graphMetaKey, nodeId],
  )

  const readStoredWidgetWorldPos = React.useCallback((): { x: number; y: number } | null => {
    return readStoredWidgetWorldPosForNode({ nodeId, graphMetaKey })
  }, [graphMetaKey, nodeId])

  const shouldBypassStoreZoomFallback = React.useCallback((liveZoom: { k: number; x: number; y: number } | null): boolean => {
    return shouldBypassStoreZoomFallbackState({
      liveZoom,
      floating: floatingRef.current,
      floatingUsesScreenAuthority,
      pinnedDragOverride: pinnedDragOverrideRef.current,
      worldDragOverride: worldDragOverrideRef.current,
      hasStoredWorldPos: !!readStoredWidgetWorldPos(),
    })
  }, [floatingUsesScreenAuthority, readStoredWidgetWorldPos])

  const readCurrentTransform = React.useCallback(() => {
    return readCurrentTransformState({
      getLiveZoomTransform,
      zoomViewKey,
      zoomStateRef,
      shouldBypassStoreZoomFallback,
    })
  }, [getLiveZoomTransform, shouldBypassStoreZoomFallback, zoomViewKey])

  const readPinConversionTransform = React.useCallback(() => {
    return readPinConversionTransformState({
      graphMetaKind,
      node: nodeRef.current,
      floatingUsesScreenAuthority,
      getLiveZoomTransform,
      readCurrentTransform,
    })
  }, [floatingUsesScreenAuthority, getLiveZoomTransform, graphMetaKind, readCurrentTransform])

  const persistFloatingPlacement = React.useCallback((pos: { top: number; left: number }) => {
    persistFloatingPlacementState({
      pos,
      floatingUsesScreenAuthority,
      screenAuthorityHandoffPosRef,
      widgetWorldPosRef,
      persistFloatingPos,
      readCurrentTransform,
      persistWorldPos,
    })
  }, [floatingUsesScreenAuthority, persistFloatingPos, persistWorldPos, readCurrentTransform])

  const persistFloatingScreenPlacement = React.useCallback((pos: { top: number; left: number }) => {
    persistFloatingScreenPlacementState({
      pos,
      persistFloatingPos,
      widgetWorldPosRef,
      lastAppliedRef,
      screenAuthorityHandoffPosRef,
      screenAuthorityLayoutZoomBaseRef,
    })
  }, [persistFloatingPos])

  const readCurrentOverlayScreenPlacement = React.useCallback((): { left: number; top: number } | null => {
    return readCurrentOverlayScreenPlacementState({ asideRef })
  }, [])

  const readCurrentOverlayScreenPlacementForHandoff = React.useCallback((): { left: number; top: number } | null => {
    return readCurrentOverlayScreenPlacementForHandoffState({ asideRef })
  }, [])

  const readStoredFloatingScreenPlacement = React.useCallback((): { left: number; top: number } | null => {
    return readStoredFloatingScreenPlacementState({ nodeId, graphMetaKey })
  }, [graphMetaKey, nodeId])

  const persistCurrentScreenPlacementAsWorldPlacement = React.useCallback((): boolean => {
    return persistCurrentScreenPlacementAsWorldPlacementState({
      readCurrentOverlayScreenPlacement,
      readStoredFloatingScreenPlacement,
      lastAppliedRef,
      readPinConversionTransform,
      widgetWorldPosRef,
      lastGoodWorldPosRef,
      pinnedDragOverrideRef,
      persistWorldPos,
    })
  }, [persistWorldPos, readCurrentOverlayScreenPlacement, readPinConversionTransform, readStoredFloatingScreenPlacement])

  const applyOverlayPosition = React.useCallback((opts?: ApplyOverlayPositionOptions) => {
    applyWidgetOverlayPosition({
      asideRef,
      nodeRef,
      getLiveZoomTransform,
      zoomViewKey,
      shouldBypassStoreZoomFallback,
      zoomStateRef,
      schemaRef,
      graphMetaKind,
      storyboardWidgetSurfaceId,
      viewportW,
      viewportH,
      readScreenAuthorityFollowZoomK,
      readPanelScaleForZoom,
      openWidgetNodeCount,
      stackIndex,
      getLiveNodeWorldPos,
      nodeId,
      getLiveContainmentGroupAabbForNode,
      floatingRef,
      floatingUsesScreenAuthority,
      lastAppliedRef,
      storyboardPinnedZoomLayoutBaseRef,
      lastStoryboardPinnedTransformRef,
      screenAuthorityLayoutZoomBaseRef,
      screenAuthorityHandoffPosRef,
      widgetWorldPosRef,
      lastGoodWorldPosRef,
      pinnedDragOverrideRef,
      worldDragOverrideRef,
      canvasWindowOffsetRef,
      scaledSizeRef,
      anchoredPosRef,
      lastFloatingScaleKeyRef,
      cssInitRef,
      widgetPos,
      pinnedTopPx,
      pinnedLeftPx,
      autoStackOffset,
      readStoredWidgetWorldPos,
      persistWorldPos,
      setToolbarDock,
      setToolbarInlineShiftPx,
      setToolbarMaxWidthPx,
      opts,
    })
  }, [
    autoStackOffset.left,
    autoStackOffset.top,
    canvasWindowOffsetRef,
    cssInitRef,
    floatingUsesScreenAuthority,
    getLiveContainmentGroupAabbForNode,
    getLiveNodeWorldPos,
    getLiveZoomTransform,
    graphMetaKind,
    lastFloatingScaleKeyRef,
    lastGoodWorldPosRef,
    lastStoryboardPinnedTransformRef,
    nodeId,
    nodeRef,
    storyboardWidgetSurfaceId,
    openWidgetNodeCount,
    pinnedDragOverrideRef,
    pinnedLeftPx,
    pinnedTopPx,
    persistWorldPos,
    readPanelScaleForZoom,
    readScreenAuthorityFollowZoomK,
    readStoredWidgetWorldPos,
    scaledSizeRef,
    schemaRef,
    screenAuthorityHandoffPosRef,
    screenAuthorityLayoutZoomBaseRef,
    setToolbarDock,
    setToolbarInlineShiftPx,
    setToolbarMaxWidthPx,
    stackIndex,
    storyboardPinnedZoomLayoutBaseRef,
    shouldBypassStoreZoomFallback,
    viewportH,
    viewportW,
    widgetPos,
    widgetWorldPosRef,
    worldDragOverrideRef,
    zoomStateRef,
    viewportH,
    zoomViewKey,
  ])

  React.useEffect(() => {
    if (floatingUsesScreenAuthority) {
      widgetWorldPosRef.current = null
      return
    }
    const pick = (s: unknown) => {
      const state = s as {
        graphData?: unknown
        flowWidgetWorldPosByNodeId?: Record<string, { x: number; y: number }>
        flowWidgetWorldPosByNodeIdByGraphMetaKey?: Record<string, Record<string, { x: number; y: number }>>
      }
      return readScopedFlowWidgetNodeValue({
        nodeId,
        graphMetaKey,
        graphData: state.graphData,
        keyedByGraphMetaKey: state.flowWidgetWorldPosByNodeIdByGraphMetaKey,
        globalByNodeId: state.flowWidgetWorldPosByNodeId,
      })
    }
    const coerce = (v: unknown): { x: number; y: number } | null => {
      if (!v || typeof v !== 'object') return null
      const rec = v as { x?: unknown; y?: unknown }
      const x = typeof rec.x === 'number' && Number.isFinite(rec.x) ? rec.x : null
      const y = typeof rec.y === 'number' && Number.isFinite(rec.y) ? rec.y : null
      return x == null || y == null ? null : { x, y }
    }
    widgetWorldPosRef.current = coerce(pick(useGraphStore.getState()))
    const unsub = useGraphStore.subscribe(
      pick,
      next => {
        widgetWorldPosRef.current = coerce(next)
        applyOverlayPosition()
      },
    )
    return () => {
      try {
        unsub()
      } catch {
        void 0
      }
    }
  }, [applyOverlayPosition, floatingUsesScreenAuthority, graphMetaKey, nodeId])

  React.useEffect(() => {
    if (!active || !floating) return
    if (floatingUsesScreenAuthority) return
    if (pinnedDragOverrideRef.current || worldDragOverrideRef.current) return
    if (!lastAppliedRef.current) return
    const target = lastAppliedRef.current
      ? { left: lastAppliedRef.current.left, top: lastAppliedRef.current.top }
      : { left: pinnedLeftPx, top: pinnedTopPx }
    if (!Number.isFinite(target.left) || !Number.isFinite(target.top)) return
    const z = readCurrentTransform()
    const nextWorld = screenToWorld({ transform: z, sx: target.left, sy: target.top })
    const prevWorld = widgetWorldPosRef.current
    if (prevWorld && Math.abs(prevWorld.x - nextWorld.x) <= 0.0001 && Math.abs(prevWorld.y - nextWorld.y) <= 0.0001) return
    persistWorldPos(nextWorld)
  }, [active, floating, floatingUsesScreenAuthority, pinnedLeftPx, pinnedTopPx, persistWorldPos, readCurrentTransform])

  React.useEffect(() => {
    if (!active || !getLiveNodeWorldPos || floating || typeof window === 'undefined') return
    const initialLive = getLiveNodeWorldPos(nodeId)
    if (initialLive && Number.isFinite(initialLive.x) && Number.isFinite(initialLive.y)) return
    const startedAtMs = Date.now()
    let attempts = 0
    const tick = () => {
      attempts += 1
      applyOverlayPosition()
      const live = getLiveNodeWorldPos(nodeId)
      const elapsedMs = Date.now() - startedAtMs
      if ((live && Number.isFinite(live.x) && Number.isFinite(live.y)) || attempts >= 120 || elapsedMs >= 1600) {
        livePosWarmupRafRef.current = null
        return
      }
      livePosWarmupRafRef.current = window.requestAnimationFrame(tick)
    }
    livePosWarmupRafRef.current = window.requestAnimationFrame(tick)
    return () => {
      if (livePosWarmupRafRef.current != null) {
        try {
          cancelAnimationFrame(livePosWarmupRafRef.current)
        } catch {
          void 0
        }
        livePosWarmupRafRef.current = null
      }
    }
  }, [active, applyOverlayPosition, floating, getLiveNodeWorldPos, nodeId])

  useIsomorphicLayoutEffect(() => {
    applyOverlayPosition()
  }, [applyOverlayPosition, canvasWindowOffset?.left, canvasWindowOffset?.top, pinnedLeftPx, pinnedTopPx, viewportH, viewportW, node.x, node.y])

  React.useEffect(() => {
    if (!active || !nodeId || typeof window === 'undefined') return
    const onCollectivePan = (event: Event) => {
      const detail = (event as CustomEvent<{ screenByNodeId?: Record<string, { left?: unknown; top?: unknown }> }>).detail
      const next = detail?.screenByNodeId?.[nodeId]
      const left = typeof next?.left === 'number' && Number.isFinite(next.left) ? next.left : null
      const top = typeof next?.top === 'number' && Number.isFinite(next.top) ? next.top : null
      if (left == null || top == null) return
      const lastApplied = lastAppliedRef.current
      if (lastApplied) lastAppliedRef.current = { ...lastApplied, left, top }
      pinnedDragOverrideRef.current = { left, top }
      setPinnedLeftPx(prev => (Math.abs(prev - left) <= 0.001 ? prev : left))
      setPinnedTopPx(prev => (Math.abs(prev - top) <= 0.001 ? prev : top))
      const apply = () => {
        applyOverlayPosition()
        pinnedDragOverrideRef.current = null
      }
      if (typeof window.requestAnimationFrame === 'function') window.requestAnimationFrame(apply)
      else window.setTimeout(apply, 0)
    }
    window.addEventListener(STORYBOARD_WIDGET_SCREEN_AUTHORITY_COLLECTIVE_PAN_EVENT, onCollectivePan)
    return () => window.removeEventListener(STORYBOARD_WIDGET_SCREEN_AUTHORITY_COLLECTIVE_PAN_EVENT, onCollectivePan)
  }, [active, applyOverlayPosition, nodeId])

  React.useEffect(() => {
    if (!active || floating || !nodeId || widgetWorldPosRef.current || String(storyboardWidgetSurfaceId || '').trim() === 'storyboard') return
    applyOverlayPosition()
    const z = (getLiveZoomTransform ? getLiveZoomTransform() : null) || zoomStateRef.current || { k: 1, x: 0, y: 0 }
    const world = screenToWorld({
      transform: z,
      sx: anchoredPosRef.current.left + autoStackOffset.left,
      sy: anchoredPosRef.current.top + autoStackOffset.top,
    })
    persistWorldPos(world)
  }, [active, applyOverlayPosition, autoStackOffset.left, autoStackOffset.top, floating, getLiveZoomTransform, nodeId, persistWorldPos, storyboardWidgetSurfaceId])

  React.useEffect(() => {
    const unsub = useGraphStore.subscribe(
      s => getEffectiveZoomStateForKey({
        zoomViewKey,
        zoomStateByKey: s.zoomStateByKey,
        zoomState: s.zoomState,
      }),
      next => {
        const nextZoom = next || null
        if (floatingRef.current) {
          const frontmatterScreenAuthority = isFrontmatterManagedOverlayNode(graphMetaKind, nodeRef.current) && floatingUsesScreenAuthority
          const scaleZoomK = readScreenAuthorityFollowZoomK(nextZoom?.k ?? 1, frontmatterScreenAuthority)
          const scaleKey = computeWidgetScaleKey(readPanelScaleForZoom(
            scaleZoomK,
            isFrontmatterManagedOverlayNode(graphMetaKind, nodeRef.current),
          ))
          const sameScale = lastFloatingScaleKeyRef.current === scaleKey
          lastFloatingScaleKeyRef.current = scaleKey
          zoomStateRef.current = nextZoom
          if (frontmatterScreenAuthority && sameScale && !pinnedDragOverrideRef.current) return
          if (!frontmatterScreenAuthority && sameScale && !widgetWorldPosRef.current && !pinnedDragOverrideRef.current) return
          applyOverlayPosition({ updateToolbarLayout: false })
          return
        }
        zoomStateRef.current = nextZoom
        applyOverlayPosition({ updateToolbarLayout: false })
      },
    )
    return () => {
      try {
        unsub()
      } catch {
        void 0
      }
    }
  }, [applyOverlayPosition, floatingUsesScreenAuthority, graphMetaKind, readPanelScaleForZoom, readScreenAuthorityFollowZoomK, zoomViewKey])

  return {
    asideRef,
    viewportRef,
    canvasWindowOffsetRef,
    anchoredPosRef,
    scaledSizeRef,
    zoomStateRef,
    lastAppliedRef,
    pinnedDragOverrideRef,
    worldDragOverrideRef,
    widgetWorldPosRef,
    pinnedTopPx,
    pinnedLeftPx,
    setPinnedTopPx,
    setPinnedLeftPx,
    toolbarDock,
    toolbarInlineShiftPx,
    toolbarMaxWidthPx,
    applyOverlayPosition,
    persistWorldPos,
    persistFloatingPlacement,
    persistFloatingScreenPlacement,
    persistCurrentScreenPlacementAsWorldPlacement,
    readCurrentOverlayScreenPlacementForHandoff,
  }
}
