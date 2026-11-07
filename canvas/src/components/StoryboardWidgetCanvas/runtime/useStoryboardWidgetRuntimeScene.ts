import React from 'react'
import { computeFlowGroupAabb, type FlowNativeRuntime } from '@/components/FlowCanvas/nativeRuntime'
import { resolveStoryboardWidgetVisibleViewport } from '@/components/FlowCanvas/applyZoomRequestNative'
import { WIDGET_BASE_SIZE } from '@/lib/canvas/overlayWidgetZoom'
import { useGraphStore } from '@/hooks/useGraphStore'
import { isWorkspaceGraphMutationBlocked, type WorkspaceGraphMutationState } from '@/features/workspace-table/workspaceTableSsot'
import { getEffectiveZoomStateForKey } from '@/lib/canvas/zoom-effective'
import { CANVAS_OVERLAY_PROXY_ROOT_SELECTOR, collectCanonicalStoryboardWidgetOverlayRectEntries, emitStoryboardWidgetInteractionFrame as emitStoryboardWidgetInteractionFrameEvent, findStoryboardWidgetOverlaySurfaceRoot, STORYBOARD_WIDGET_INTERACTION_FRAME_EVENT, queryStoryboardWidgetOverlayRootsForSurface } from '@/lib/canvas/storyboard-widget-overlay-proxy'
import type { GraphData } from '@/lib/graph/types'
import { isCanonicalNodeIdEqual } from '@/lib/graph/canonicalNodeIds'
import { useStoryboardWidgetStateDependencyCounts } from './storyboardWidgetRuntimeWidgetState'
import { getCachedStoryboardWidgetContainmentGroupLookup } from './storyboardWidgetRuntimeGroupLookup'
import type { StoryboardWidgetLayoutRebalanceRequest } from '@/lib/storyboardWidget/layoutRebalance'
import { hasViewportOffset, pushStoryboardWidgetRuntimeSceneTrace, type FlowRuntimeZoomTransform } from './storyboardWidgetRuntimeSceneDiagnostics'
import { useStoryboardWidgetDomCollectiveRecovery } from './useStoryboardWidgetDomCollectiveRecovery'
import { useStoryboardWidgetCollectiveSeed } from './useStoryboardWidgetCollectiveSeed'

export function readFiniteRuntimeZoomTransform(runtime: FlowNativeRuntime | null | undefined): FlowRuntimeZoomTransform | null {
  const t = runtime?.transform || null
  const k = typeof t?.k === 'number' && Number.isFinite(t.k) && t.k > 0 ? t.k : null
  const x = typeof t?.x === 'number' && Number.isFinite(t.x) ? t.x : null
  const y = typeof t?.y === 'number' && Number.isFinite(t.y) ? t.y : null
  if (k == null || x == null || y == null) return null
  return { k, x, y }
}

export function useStoryboardWidgetRuntimeScene(args: {
  active: boolean
  storyboardWidgetSurfaceId?: string
  openWidgetNodeIds: string[]
  draftGraphDataRef?: React.MutableRefObject<GraphData | null>
  renderGraphDataOverride: GraphData | null
  viewportW: number
  viewportH: number
  schema: unknown
  overlayNodeLayoutSignature: string
  storyboardWidgetLayoutRebalanceRequest?: StoryboardWidgetLayoutRebalanceRequest | null
  zoomViewKeyRef: React.MutableRefObject<string | null>
}) {
  const flowRuntimeRefRef = React.useRef<React.MutableRefObject<FlowNativeRuntime | null> | null>(null)
  const latestAutoSeedWorldPosByNodeIdRef = React.useRef<Record<string, { x: number; y: number }>>({})
  const lastUsableZoomTransformRef = React.useRef<{ k: number; x: number; y: number } | null>(null)
  const workspaceMutationBlocked = useGraphStore(s => isWorkspaceGraphMutationBlocked(s))
  const { flowWidgetPinnedCount, flowWidgetWorldPosCount } = useStoryboardWidgetStateDependencyCounts()
  const workspaceMutationBlockedPrevRef = React.useRef<boolean>(workspaceMutationBlocked)
  const lastInteractionFrameAtMsRef = React.useRef<number>(0)
  const getVisibleViewport = React.useCallback(() => {
    return resolveStoryboardWidgetVisibleViewport({
      storyboardWidgetSurfaceId: args.storyboardWidgetSurfaceId,
      viewportW: args.viewportW,
      viewportH: args.viewportH,
    })
  }, [args.storyboardWidgetSurfaceId, args.viewportH, args.viewportW])
  const shouldPreserveWorkspaceReopenAuthorities = React.useCallback(() => {
    const lastUsable = lastUsableZoomTransformRef.current
    if (!lastUsable) return false
    const autoSeedWorldNodes = Object.values(latestAutoSeedWorldPosByNodeIdRef.current || {})
      .filter((world): world is { x: number; y: number } => (
        !!world
        && Number.isFinite(world.x)
        && Number.isFinite(world.y)
      ))
    if (autoSeedWorldNodes.length === 0) return false
    const k = typeof lastUsable.k === 'number' && Number.isFinite(lastUsable.k) && lastUsable.k > 0
      ? lastUsable.k
      : null
    const x = typeof lastUsable.x === 'number' && Number.isFinite(lastUsable.x) ? lastUsable.x : null
    const y = typeof lastUsable.y === 'number' && Number.isFinite(lastUsable.y) ? lastUsable.y : null
    if (k == null || x == null || y == null) return false
    const visibleViewport = getVisibleViewport()
    const panelW = WIDGET_BASE_SIZE.width * k
    const panelH = WIDGET_BASE_SIZE.height * k
    let minX = Number.POSITIVE_INFINITY
    let minY = Number.POSITIVE_INFINITY
    let maxX = Number.NEGATIVE_INFINITY
    let maxY = Number.NEGATIVE_INFINITY
    for (let i = 0; i < autoSeedWorldNodes.length; i += 1) {
      const world = autoSeedWorldNodes[i]!
      const left = world.x * k + x
      const top = world.y * k + y
      minX = Math.min(minX, left)
      minY = Math.min(minY, top)
      maxX = Math.max(maxX, left + panelW)
      maxY = Math.max(maxY, top + panelH)
    }
    if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) return false
    const marginX = Math.max(24, visibleViewport.width * 0.08)
    const marginY = Math.max(24, visibleViewport.height * 0.08)
    const offscreen =
      maxX <= visibleViewport.left - marginX
      || maxY <= visibleViewport.top - marginY
      || minX >= visibleViewport.right + marginX
      || minY >= visibleViewport.bottom + marginY
    if (offscreen) return false
    return (
      maxX > visibleViewport.left
      && maxY > visibleViewport.top
      && minX < visibleViewport.right
      && minY < visibleViewport.bottom
    )
  }, [getVisibleViewport])

  React.useEffect(() => {
    if (typeof window === 'undefined') return
    const markInteraction = () => {
      lastInteractionFrameAtMsRef.current = Date.now()
    }
    try {
      window.addEventListener(STORYBOARD_WIDGET_INTERACTION_FRAME_EVENT, markInteraction as EventListener)
    } catch {
      void 0
    }
    return () => {
      try {
        window.removeEventListener(STORYBOARD_WIDGET_INTERACTION_FRAME_EVENT, markInteraction as EventListener)
      } catch {
        void 0
      }
    }
  }, [])

  const getLiveNodeWorldPos = React.useCallback((nodeId: string) => {
    const id = String(nodeId || '').trim()
    if (!id) return null
    const state = useGraphStore.getState() as WorkspaceGraphMutationState & {
      graphData?: GraphData | null
      flowWidgetDraggingNodeId?: string | null
    }
    const workspaceMutationBlocked = isWorkspaceGraphMutationBlocked(state)
    const autoSeed = latestAutoSeedWorldPosByNodeIdRef.current[id]
    const autoSeedX = autoSeed && Number.isFinite(autoSeed.x) ? autoSeed.x : null
    const autoSeedY = autoSeed && Number.isFinite(autoSeed.y) ? autoSeed.y : null
    const interactionInProgress = Date.now() - lastInteractionFrameAtMsRef.current < 620
    const flowWidgetDraggingNodeId = String(state.flowWidgetDraggingNodeId || '').trim()
    const flowWidgetDragging = flowWidgetDraggingNodeId.length > 0
    if (workspaceMutationBlocked && autoSeedX != null && autoSeedY != null && !interactionInProgress && !flowWidgetDragging) {
      return { x: autoSeedX, y: autoSeedY }
    }
    const runtime = flowRuntimeRefRef.current?.current
    if (!runtime || runtime.positionsReady !== true) return null
    const n = runtime.scene?.nodeById?.get(id) || null
    if (!n) return null
    const x = typeof n.x === 'number' && Number.isFinite(n.x) ? n.x : null
    const y = typeof n.y === 'number' && Number.isFinite(n.y) ? n.y : null
    if (x == null || y == null) return null
    return { x, y }
  }, [])

  const getLiveZoomTransform = React.useCallback(() => {
    const runtime = flowRuntimeRefRef.current?.current
    const sceneNodes = runtime?.scene?.nodes
    const sceneNodeCount = Array.isArray(sceneNodes) ? sceneNodes.length : 0
    const workspaceMutationBlocked = isWorkspaceGraphMutationBlocked(useGraphStore.getState())
    const positionsReady = runtime?.positionsReady === true
    const liveRuntimeTransform = readFiniteRuntimeZoomTransform(runtime)
    if (Array.isArray(sceneNodes) && sceneNodes.length <= 0) {
      const st = useGraphStore.getState()
      const persisted = getEffectiveZoomStateForKey({
        zoomViewKey: args.zoomViewKeyRef.current,
        zoomStateByKey: st.zoomStateByKey,
        zoomState: st.zoomState,
      })
      const persistedK = typeof persisted?.k === 'number' && Number.isFinite(persisted.k) ? persisted.k : null
      const persistedX = typeof persisted?.x === 'number' && Number.isFinite(persisted.x) ? persisted.x : null
      const persistedY = typeof persisted?.y === 'number' && Number.isFinite(persisted.y) ? persisted.y : null
      const persistedTransform =
        persistedK != null && persistedX != null && persistedY != null
          ? { k: persistedK, x: persistedX, y: persistedY }
          : null
      const interactionInProgress = Date.now() - lastInteractionFrameAtMsRef.current < 620
      if (
        liveRuntimeTransform
        && !workspaceMutationBlocked
        && (interactionInProgress || hasViewportOffset(liveRuntimeTransform) || !hasViewportOffset(persistedTransform))
      ) {
        lastUsableZoomTransformRef.current = liveRuntimeTransform
        pushStoryboardWidgetRuntimeSceneTrace({
          reason: 'scene-empty-using-live-runtime-transform',
          sceneNodeCount,
          positionsReady,
          workspaceMutationBlocked,
          viewportW: args.viewportW,
          viewportH: args.viewportH,
          transform: liveRuntimeTransform,
        })
        return liveRuntimeTransform
      }
      if (liveRuntimeTransform && workspaceMutationBlocked) {
        pushStoryboardWidgetRuntimeSceneTrace({
          reason: 'scene-empty-workspace-blocked-rejecting-live-runtime-transform',
          sceneNodeCount,
          positionsReady,
          workspaceMutationBlocked,
          viewportW: args.viewportW,
          viewportH: args.viewportH,
          transform: liveRuntimeTransform,
        })
      }
      const lastUsable = lastUsableZoomTransformRef.current
      if (lastUsable) {
        pushStoryboardWidgetRuntimeSceneTrace({
          reason: 'scene-empty-using-last-usable-transform',
          sceneNodeCount,
          positionsReady,
          workspaceMutationBlocked,
          viewportW: args.viewportW,
          viewportH: args.viewportH,
          transform: lastUsable,
        })
        return lastUsable
      }
      if (persistedTransform) {
        pushStoryboardWidgetRuntimeSceneTrace({
          reason: 'scene-empty-using-persisted-transform',
          sceneNodeCount,
          positionsReady,
          workspaceMutationBlocked,
          viewportW: args.viewportW,
          viewportH: args.viewportH,
          transform: persistedTransform,
        })
        return persistedTransform
      }
      if (workspaceMutationBlocked) {
        pushStoryboardWidgetRuntimeSceneTrace({
          reason: 'scene-empty-workspace-blocked-awaiting-live-transform',
          sceneNodeCount,
          positionsReady,
          workspaceMutationBlocked,
          viewportW: args.viewportW,
          viewportH: args.viewportH,
          transform: null,
        })
        return null
      }
      // Overlay-only runtime can transiently report empty scene during workspace recomposition.
      // Fall back to neutral only if no prior usable transform exists.
      pushStoryboardWidgetRuntimeSceneTrace({
        reason: 'scene-empty-neutral-transform',
        sceneNodeCount,
        positionsReady,
        workspaceMutationBlocked,
        viewportW: args.viewportW,
        viewportH: args.viewportH,
        transform: { k: 1, x: 0, y: 0 },
      })
      return { k: 1, x: 0, y: 0 }
    }
    if (!liveRuntimeTransform) {
      pushStoryboardWidgetRuntimeSceneTrace({
        reason: 'runtime-transform-unavailable',
        sceneNodeCount,
        positionsReady,
        workspaceMutationBlocked,
        viewportW: args.viewportW,
        viewportH: args.viewportH,
        transform: null,
      })
      return null
    }
    if (workspaceMutationBlocked && lastUsableZoomTransformRef.current) {
      pushStoryboardWidgetRuntimeSceneTrace({
        reason: 'workspace-blocked-using-last-usable-transform',
        sceneNodeCount,
        positionsReady,
        workspaceMutationBlocked,
        viewportW: args.viewportW,
        viewportH: args.viewportH,
        transform: lastUsableZoomTransformRef.current,
      })
      return lastUsableZoomTransformRef.current
    }
    if (workspaceMutationBlocked) {
      pushStoryboardWidgetRuntimeSceneTrace({
        reason: 'workspace-blocked-rejecting-live-runtime-transform',
        sceneNodeCount,
        positionsReady,
        workspaceMutationBlocked,
        viewportW: args.viewportW,
        viewportH: args.viewportH,
        transform: liveRuntimeTransform,
      })
      return null
    }
    const next = liveRuntimeTransform
    lastUsableZoomTransformRef.current = next
    pushStoryboardWidgetRuntimeSceneTrace({
      reason: 'runtime-transform-live',
      sceneNodeCount,
      positionsReady,
      workspaceMutationBlocked,
      viewportW: args.viewportW,
      viewportH: args.viewportH,
      transform: next,
    })
    return next
  }, [args.viewportH, args.viewportW, args.zoomViewKeyRef])

  const getRenderedZoomTransform = React.useCallback(() => {
    // The workspace mutation guard protects layout writes. Run placement only
    // needs a read-only snapshot of the coordinate frame currently painted on
    // screen, which remains authoritative while the editor overlay is open.
    return readFiniteRuntimeZoomTransform(flowRuntimeRefRef.current?.current)
  }, [])

  const getRenderedOverlayRectForNode = React.useCallback((nodeId: string) => {
    const id = String(nodeId || '').trim()
    if (!id || typeof document === 'undefined') return null
    const surfaceRoot = findStoryboardWidgetOverlaySurfaceRoot(args.storyboardWidgetSurfaceId)
    const surfaceRect = surfaceRoot?.getBoundingClientRect() || null
    if (
      !surfaceRect
      || !Number.isFinite(surfaceRect.left)
      || !Number.isFinite(surfaceRect.top)
    ) return null
    const roots = queryStoryboardWidgetOverlayRootsForSurface({
      surfaceId: args.storyboardWidgetSurfaceId,
      selector: CANVAS_OVERLAY_PROXY_ROOT_SELECTOR,
    })
    const entry = collectCanonicalStoryboardWidgetOverlayRectEntries(roots)
      .find(candidate => isCanonicalNodeIdEqual(candidate.id, id))
    if (!entry) return null
    return {
      left: entry.rect.left - surfaceRect.left,
      top: entry.rect.top - surfaceRect.top,
      width: entry.rect.width,
      height: entry.rect.height,
    }
  }, [args.storyboardWidgetSurfaceId])

  const getLiveContainmentGroupAabbForNode = React.useCallback((nodeId: string) => {
    const id = String(nodeId || '').trim()
    if (!id) return null
    const runtime = flowRuntimeRefRef.current?.current
    const scene = runtime?.scene
    if (!runtime || !scene) return null
    const best = getCachedStoryboardWidgetContainmentGroupLookup(scene)?.readContainmentGroupForNode(id) || null
    if (!best) return null

    const st = useGraphStore.getState()
    const t =
      getLiveZoomTransform() ||
      getEffectiveZoomStateForKey({
        zoomViewKey: args.zoomViewKeyRef.current,
        zoomStateByKey: st.zoomStateByKey,
        zoomState: st.zoomState,
      }) ||
      { k: 1, x: 0, y: 0 }
    const cfg = runtime.presentation.groups
    const aabb = computeFlowGroupAabb({
      scene,
      group: best as never,
      paddingPx: cfg.paddingPx,
      labelTopExtraPx: cfg.labelTopExtraPx,
    })
    if (!aabb) return null
    return { groupId: best.id, ...aabb }
  }, [args.zoomViewKeyRef, getLiveZoomTransform])

  const renderGraphDataOverrideRef = React.useRef<GraphData | null>(args.renderGraphDataOverride)
  React.useEffect(() => {
    renderGraphDataOverrideRef.current = args.renderGraphDataOverride
  }, [args.renderGraphDataOverride])
  const readPreferredGraphDataForSeeding = React.useCallback(() => {
    return args.draftGraphDataRef?.current || renderGraphDataOverrideRef.current || null
  }, [args.draftGraphDataRef])

  const seededPinnedWidgetWorldPosKeyRef = React.useRef<string>('')
  const lastAutoSeedLayoutSignatureRef = React.useRef<string>('')
  const lastHandledLayoutRebalanceAtRef = React.useRef<number>(0)
  React.useEffect(() => {
    const prev = workspaceMutationBlockedPrevRef.current
    workspaceMutationBlockedPrevRef.current = workspaceMutationBlocked
    if (workspaceMutationBlocked !== true || prev === true) return
    if (shouldPreserveWorkspaceReopenAuthorities()) {
      pushStoryboardWidgetRuntimeSceneTrace({
        reason: 'workspace-reopen-preserving-current-authorities',
        sceneNodeCount: flowRuntimeRefRef.current?.current?.scene?.nodes?.length || 0,
        positionsReady: flowRuntimeRefRef.current?.current?.positionsReady === true,
        workspaceMutationBlocked,
        viewportW: args.viewportW,
        viewportH: args.viewportH,
        transform: lastUsableZoomTransformRef.current,
      })
      return
    }
    // Reset transient transform/seed authorities when Workspace overlay re-opens
    // only when the current authorities no longer keep the widget collective visible.
    lastUsableZoomTransformRef.current = null
    latestAutoSeedWorldPosByNodeIdRef.current = {}
    seededPinnedWidgetWorldPosKeyRef.current = ''
    lastAutoSeedLayoutSignatureRef.current = ''
  }, [args.viewportH, args.viewportW, shouldPreserveWorkspaceReopenAuthorities, workspaceMutationBlocked])
  useStoryboardWidgetDomCollectiveRecovery({
    ...args, flowRuntimeRefRef, flowWidgetPinnedCount, flowWidgetWorldPosCount,
    workspaceMutationBlocked, getLiveZoomTransform, getVisibleViewport, readPreferredGraphDataForSeeding,
  })
  useStoryboardWidgetCollectiveSeed({
    ...args, flowRuntimeRefRef, renderGraphDataOverrideRef, latestAutoSeedWorldPosByNodeIdRef,
    seededPinnedWidgetWorldPosKeyRef, lastAutoSeedLayoutSignatureRef, lastHandledLayoutRebalanceAtRef,
    flowWidgetPinnedCount, flowWidgetWorldPosCount, getLiveZoomTransform, getVisibleViewport,
    getLiveContainmentGroupAabbForNode, readPreferredGraphDataForSeeding,
    readRuntimeZoomTransform: readFiniteRuntimeZoomTransform,
  })

  const emitStoryboardWidgetInteractionFrame = React.useCallback(() => {
    emitStoryboardWidgetInteractionFrameEvent()
  }, [])

  return {
    emitStoryboardWidgetInteractionFrame,
    flowRuntimeRefRef,
    getLiveContainmentGroupAabbForNode,
    getLiveNodeWorldPos,
    getLiveZoomTransform,
    getRenderedOverlayRectForNode,
    getRenderedZoomTransform,
    latestAutoSeedWorldPosByNodeIdRef,
  }
}
