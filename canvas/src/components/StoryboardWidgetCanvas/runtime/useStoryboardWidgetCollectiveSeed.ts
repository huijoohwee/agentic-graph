import type React from 'react'
import type { FlowNativeRuntime } from '@/components/FlowCanvas/nativeRuntime'
import type { VisibleFlowViewport } from '@/components/FlowCanvas/workspaceVisibleViewportRecovery'
import { computeCollectiveFollowPinnedScale, computeWidgetScaledSize, WIDGET_BASE_SIZE, WIDGET_LAYOUT_BASE_HEIGHT_PX } from '@/lib/canvas/overlayWidgetZoom'
import { resolveGraphNodeIdByCanonicalId, shouldAutoPlaceStoryboardWidget, readWidgetGridLayoutSettings, snapToGridPx } from '@/components/StoryboardWidgetCanvas/storyboardWidgetCanvasShared'
import { useGraphStore } from '@/hooks/useGraphStore'
import { isWorkspaceGraphMutationBlocked } from '@/features/workspace-table/workspaceTableSsot'
import { getEffectiveZoomStateForKey } from '@/lib/canvas/zoom-effective'
import { findStoryboardWidgetOverlaySurfaceRoot, STORYBOARD_WIDGET_OVERLAY_ROOT_SELECTOR, queryStoryboardWidgetOverlayRootsForSurface } from '@/lib/canvas/storyboard-widget-overlay-proxy'
import { computeBalancedSpreadBaseGapPx, computeBalancedSpreadViewportMargins, computeBalancedSpreadSpacingPx } from '@/lib/ui/overlayBalancedSpread'
import { useIsomorphicLayoutEffect } from '@/lib/react/useIsomorphicLayoutEffect'
import type { GraphData, GraphNode } from '@/lib/graph/types'
import { readGraphDataRevision } from '@/lib/graph/documentMetadata'
import { getCachedStoryboardWidgetPlacementContext } from './storyboardWidgetRenderGraph'
import { resolveBalancedViewportPreset } from '@/lib/graph/frontmatterFlowSettings'
import { resolveScopedFlowWidgetNodeMap } from '@/lib/storyboardWidget/widgetStateScope'
import { hasUnplacedStoryboardWidgetFloatingScreenAuthorityWidget } from '@/lib/storyboardWidget/widgetPlacementAuthority'
import { resolveStoryboardWidgetGraphDataForNodeAuthority } from '@/lib/storyboardWidget/storyboardWidgetGraphAuthority'
import { collectActiveRichMediaWorldObstacles, collectActiveStoryboardCardWorldObstacles } from './storyboardWidgetRuntimeRichMediaObstacles'
import { buildGraphDocumentMetaKey } from '@/lib/graph/graphMetaKey'
import { __flowCanvasDebug, syncFlowCanvasDebugWindow } from '@/components/FlowCanvas/flowCanvasDebug'
import { defaultSchema, type GraphSchema } from '@/lib/graph/schema'
import { unwrapGraphCellValue } from '@/lib/graph/nodeProperties'
import { reportRuntimeTrace } from '@/lib/debug/runtimeTrace'
import type { FlowWidgetPinnedById, FlowWidgetScreenPosById, FlowWidgetWorldPosById } from './storyboardWidgetRuntimeWidgetState'
import { isStoryboardWidgetContentMaterializationRebalanceRequest, isStoryboardWidgetZoomPresetRebalanceRequest, readStoryboardWidgetLayoutTargetTransform, type StoryboardWidgetLayoutRebalanceRequest } from '@/lib/storyboardWidget/layoutRebalance'
import { hasViewportOffset, pushStoryboardWidgetRuntimeSceneTrace, type FlowRuntimeZoomTransform } from './storyboardWidgetRuntimeSceneDiagnostics'
import { computeStoryboardWidgetCollectiveSeedPlacement } from './storyboardWidgetCollectiveSeedPlacement'

type Bounds = { minX: number; minY: number; maxX: number; maxY: number }
type SeedArgs = {
  active: boolean; storyboardWidgetSurfaceId?: string; openWidgetNodeIds: string[]
  viewportW: number; viewportH: number; schema: unknown; overlayNodeLayoutSignature: string
  storyboardWidgetLayoutRebalanceRequest?: StoryboardWidgetLayoutRebalanceRequest | null
  zoomViewKeyRef: React.MutableRefObject<string | null>
  flowRuntimeRefRef: React.MutableRefObject<React.MutableRefObject<FlowNativeRuntime | null> | null>
  renderGraphDataOverrideRef: React.MutableRefObject<GraphData | null>
  latestAutoSeedWorldPosByNodeIdRef: React.MutableRefObject<FlowWidgetWorldPosById>
  seededPinnedWidgetWorldPosKeyRef: React.MutableRefObject<string>
  lastAutoSeedLayoutSignatureRef: React.MutableRefObject<string>
  lastHandledLayoutRebalanceAtRef: React.MutableRefObject<number>
  flowWidgetPinnedCount: number; flowWidgetWorldPosCount: number
  getLiveZoomTransform: () => FlowRuntimeZoomTransform | null
  getVisibleViewport: () => Omit<VisibleFlowViewport, 'centerX' | 'centerY'>
  getLiveContainmentGroupAabbForNode: (id: string) => (Bounds & { groupId: string }) | null
  readPreferredGraphDataForSeeding: () => GraphData | null
  readRuntimeZoomTransform: (runtime: FlowNativeRuntime | null | undefined) => FlowRuntimeZoomTransform | null
}

export function useStoryboardWidgetCollectiveSeed(args: SeedArgs) {
  const {
    flowRuntimeRefRef, renderGraphDataOverrideRef, latestAutoSeedWorldPosByNodeIdRef,
    seededPinnedWidgetWorldPosKeyRef, lastAutoSeedLayoutSignatureRef, lastHandledLayoutRebalanceAtRef,
    flowWidgetPinnedCount, flowWidgetWorldPosCount, getLiveZoomTransform, getVisibleViewport,
    getLiveContainmentGroupAabbForNode, readPreferredGraphDataForSeeding,
  } = args
  useIsomorphicLayoutEffect(() => {
    if (!args.active) return
    if (!(args.viewportW > 1) || !(args.viewportH > 1)) return
    const surfaceRoot = findStoryboardWidgetOverlaySurfaceRoot(args.storyboardWidgetSurfaceId)
    const surfaceRect = surfaceRoot?.getBoundingClientRect() || null
    const measuredSurfaceWidth = Number.isFinite(surfaceRect?.width) ? Math.max(1, Math.floor(Number(surfaceRect?.width))) : null
    const measuredSurfaceHeight = Number.isFinite(surfaceRect?.height) ? Math.max(1, Math.floor(Number(surfaceRect?.height))) : null
    // Skip the first seed pass until the mounted Storyboard surface has replaced
    // the pre-mount window fallback dimensions from useContainerDims.
    if (
      measuredSurfaceWidth != null
      && measuredSurfaceHeight != null
      && (Math.abs(measuredSurfaceWidth - args.viewportW) > 1 || Math.abs(measuredSurfaceHeight - args.viewportH) > 1)
    ) return
    const st = useGraphStore.getState()
    const layoutRebalanceRequestAt =
      args.storyboardWidgetLayoutRebalanceRequest?.type === 'balanced-spread'
      && typeof args.storyboardWidgetLayoutRebalanceRequest.at === 'number'
      && Number.isFinite(args.storyboardWidgetLayoutRebalanceRequest.at)
        ? args.storyboardWidgetLayoutRebalanceRequest.at
        : 0
    const contentMaterializationViewportRecoveryRequested =
      isStoryboardWidgetContentMaterializationRebalanceRequest(args.storyboardWidgetLayoutRebalanceRequest)
    const layoutRebalanceRequested =
      layoutRebalanceRequestAt > 0
      && layoutRebalanceRequestAt !== lastHandledLayoutRebalanceAtRef.current
      && !contentMaterializationViewportRecoveryRequested
    const layoutRebalanceTargetTransform = layoutRebalanceRequested
      ? readStoryboardWidgetLayoutTargetTransform(args.storyboardWidgetLayoutRebalanceRequest)
      : null
    const zoomPresetPresentationRebalanceRequested =
      layoutRebalanceRequested
      && isStoryboardWidgetZoomPresetRebalanceRequest(args.storyboardWidgetLayoutRebalanceRequest)
    const graphDataForSeeding = resolveStoryboardWidgetGraphDataForNodeAuthority({
      preferredGraphData: readPreferredGraphDataForSeeding(),
      authorityGraphData: (st.graphData || null) as GraphData | null,
      nodeIds: args.openWidgetNodeIds,
    })
    const graphNodeById = new Map<string, GraphNode>()
    const nodeTypeById = new Map<string, string>()
    const graphNodes = Array.isArray(graphDataForSeeding?.nodes) ? graphDataForSeeding.nodes : []
    for (let i = 0; i < graphNodes.length; i += 1) {
      const node = graphNodes[i]
      const id = String(unwrapGraphCellValue(node?.id) || '').trim()
      if (!id) continue
      if (!graphNodeById.has(id)) graphNodeById.set(id, node)
      if (!nodeTypeById.has(id)) nodeTypeById.set(id, String(unwrapGraphCellValue(node?.type) || '').trim())
    }
    const widgetPlacementContext = getCachedStoryboardWidgetPlacementContext({
      graphData: graphDataForSeeding,
      graphRevision: readGraphDataRevision(graphDataForSeeding),
      openWidgetNodeIds: args.openWidgetNodeIds,
      preferCurrentGraphDataRefs: true,
    })
    const graphMetaKind = widgetPlacementContext?.graphMetaKind || null
    const isFrontmatterFlow = graphMetaKind === 'frontmatter-flow'
    const defaultPinnedInCanvas = widgetPlacementContext?.defaultPinnedInCanvas ?? true
    const graphKey = buildGraphDocumentMetaKey(graphDataForSeeding)
    const workspaceMutationBlockedForSeed = isWorkspaceGraphMutationBlocked(st)
    if (workspaceMutationBlockedForSeed && !zoomPresetPresentationRebalanceRequested) {
      pushStoryboardWidgetRuntimeSceneTrace({
        reason: 'workspace-blocked-skipping-flow-widget-seed-write',
        sceneNodeCount: flowRuntimeRefRef.current?.current?.scene?.nodes?.length || 0,
        positionsReady: flowRuntimeRefRef.current?.current?.positionsReady === true,
        workspaceMutationBlocked: true,
        viewportW: args.viewportW,
        viewportH: args.viewportH,
        transform: args.readRuntimeZoomTransform(flowRuntimeRefRef.current?.current),
      })
      return
    }
    const pinnedById = resolveScopedFlowWidgetNodeMap({
      graphMetaKey: graphKey,
      keyedByGraphMetaKey: (st as unknown as { flowWidgetPinnedByNodeIdByGraphMetaKey?: Record<string, FlowWidgetPinnedById> }).flowWidgetPinnedByNodeIdByGraphMetaKey,
      globalByNodeId: st.flowWidgetPinnedByNodeId,
    })
    const posById = resolveScopedFlowWidgetNodeMap({
      graphMetaKey: graphKey,
      keyedByGraphMetaKey: (st as unknown as { flowWidgetPosByNodeIdByGraphMetaKey?: Record<string, FlowWidgetScreenPosById> }).flowWidgetPosByNodeIdByGraphMetaKey,
      globalByNodeId: (st as unknown as { flowWidgetPosByNodeId?: FlowWidgetScreenPosById }).flowWidgetPosByNodeId,
    })
    const worldById = resolveScopedFlowWidgetNodeMap({
      graphMetaKey: graphKey,
      keyedByGraphMetaKey: (st as unknown as { flowWidgetWorldPosByNodeIdByGraphMetaKey?: Record<string, FlowWidgetWorldPosById> }).flowWidgetWorldPosByNodeIdByGraphMetaKey,
      globalByNodeId: (st as unknown as { flowWidgetWorldPosByNodeId?: FlowWidgetWorldPosById }).flowWidgetWorldPosByNodeId,
    })
    const effectiveOpenIds = Array.isArray(widgetPlacementContext?.effectiveOpenWidgetNodeIds)
      ? widgetPlacementContext!.effectiveOpenWidgetNodeIds
      : []
    const knownWidgetNodeIds = new Set<string>([
      ...effectiveOpenIds.map(id => String(id || '').trim()).filter(Boolean),
      ...Object.keys(worldById),
      ...Object.keys(posById),
      ...Object.keys(pinnedById),
      ...Array.from(nodeTypeById.keys()),
    ])
    const resolveActiveSurfaceOverlayWidgetId = (rawId: string): string => {
      const id = String(rawId || '').trim()
      if (!id) return ''
      if (knownWidgetNodeIds.has(id)) return id
      return resolveGraphNodeIdByCanonicalId(graphDataForSeeding, id) || id
    }
    const hasAuthoritativeGraphWorldAnchor = (rawId: string): boolean => {
      const id = resolveActiveSurfaceOverlayWidgetId(rawId)
      const node = graphNodeById.get(id) || graphNodeById.get(String(rawId || '').trim())
      if (!node) return false
      const hasXY = Number.isFinite(node.x) && Number.isFinite(node.y)
      const hasFixedXY = Number.isFinite(node.fx) && Number.isFinite(node.fy)
      return hasXY || hasFixedXY
    }
    const activeSurfaceOverlayPinnedById: FlowWidgetPinnedById = {}
    const activeSurfaceOverlayWidgetIds = (() => {
      if (typeof document === 'undefined') return []
      const seen = new Set<string>()
      const out: string[] = []
      const roots = queryStoryboardWidgetOverlayRootsForSurface({
        surfaceId: args.storyboardWidgetSurfaceId,
        selector: STORYBOARD_WIDGET_OVERLAY_ROOT_SELECTOR,
      })
      for (let i = 0; i < roots.length; i += 1) {
        const root = roots[i]
        const id = resolveActiveSurfaceOverlayWidgetId(String(root?.dataset?.kgWidget || '').trim())
        if (!id || seen.has(id)) continue
        const pinnedAttr = String(root?.dataset?.kgWidgetPinned || '').trim()
        if (pinnedAttr === '0') activeSurfaceOverlayPinnedById[id] = false
        if (pinnedAttr === '1') activeSurfaceOverlayPinnedById[id] = true
        seen.add(id)
        out.push(id)
      }
      return out
    })()
    const placementPinnedById: FlowWidgetPinnedById = {
      ...pinnedById,
      ...activeSurfaceOverlayPinnedById,
    }
    const resolvePlacementPinnedInCanvas = (id: string): boolean => {
      const v = placementPinnedById[id]
      return typeof v === 'boolean' ? v : defaultPinnedInCanvas
    }
    const effectiveOrFallbackOpenIds = effectiveOpenIds.length > 0
      ? Array.from(new Set([
          ...effectiveOpenIds.map(id => String(id || '').trim()).filter(Boolean),
          ...activeSurfaceOverlayWidgetIds,
        ]))
      : (
          isFrontmatterFlow
            ? Array.from(new Set([
                ...Object.keys(worldById),
                ...Object.keys(posById),
                ...activeSurfaceOverlayWidgetIds,
              ]))
              .map(id => String(id || '').trim())
              .filter(Boolean)
            : []
        )
    if (effectiveOrFallbackOpenIds.length === 0) return
    const activeSurfaceOverlayWidgetIdSet = new Set(activeSurfaceOverlayWidgetIds)
    const effectiveOrFallbackOpenIdSet = new Set(effectiveOrFallbackOpenIds)
    const runtimeSceneNodeCount = (() => {
      const nodes = flowRuntimeRefRef.current?.current?.scene?.nodes
      return Array.isArray(nodes) ? nodes.length : 0
    })()
    const renderGraphNodeCount = Array.isArray(renderGraphDataOverrideRef.current?.nodes) ? renderGraphDataOverrideRef.current.nodes.length : graphNodes.length
    const partitionedFrontmatterRuntimeScene = runtimeSceneNodeCount <= 0 && isFrontmatterFlow && renderGraphNodeCount > 0
    const forceSceneEmptyReseed = runtimeSceneNodeCount <= 0 && isFrontmatterFlow && !partitionedFrontmatterRuntimeScene

    const pendingRaw = effectiveOrFallbackOpenIds
      .map(id => String(id || '').trim())
      .filter(Boolean)
      .filter(id => {
        const pinned = resolvePlacementPinnedInCanvas(id)
        if (!pinned) return false
        if (forceSceneEmptyReseed) return !hasAuthoritativeGraphWorldAnchor(id)
        if (!shouldAutoPlaceStoryboardWidget({ graphMetaKind, pinnedInCanvas: pinned, worldPos: worldById[id] })) return false
        const w = worldById[id]
        if (w && Number.isFinite(w.x) && Number.isFinite(w.y)) return false
        const node = graphNodeById.get(id)
        const hasFixedGraphWorldAnchor = !!node && Number.isFinite(node.fx) && Number.isFinite(node.fy)
        if (hasFixedGraphWorldAnchor) return false
        return true
      })

    const liveZoom = getLiveZoomTransform()
    const persistedZoom =
      getEffectiveZoomStateForKey({
        zoomViewKey: args.zoomViewKeyRef.current,
        zoomStateByKey: st.zoomStateByKey,
        zoomState: st.zoomState,
      }) || null
    const liveLooksDefault =
      !liveZoom
      || (
        Math.abs((Number.isFinite(liveZoom.k) ? liveZoom.k : 1) - 1) <= 1e-6
        && Math.abs(Number.isFinite(liveZoom.x) ? liveZoom.x : 0) <= 0.5
        && Math.abs(Number.isFinite(liveZoom.y) ? liveZoom.y : 0) <= 0.5
      )
    const persistedHasViewportOffset =
      !!persistedZoom
      && (
        Math.abs((Number.isFinite(persistedZoom.k) ? persistedZoom.k : 1) - 1) > 1e-3
        || Math.abs(Number.isFinite(persistedZoom.x) ? persistedZoom.x : 0) > 0.5
        || Math.abs(Number.isFinite(persistedZoom.y) ? persistedZoom.y : 0) > 0.5
      )
    const isFirstFrontmatterInitSeed = isFrontmatterFlow && seededPinnedWidgetWorldPosKeyRef.current.length === 0
    const liveHasViewportOffset = hasViewportOffset(liveZoom)
    const shouldUseNeutralSeedZoomForFrontmatterInit =
      !layoutRebalanceRequested
      && !liveHasViewportOffset
      && !persistedHasViewportOffset
      && isFirstFrontmatterInitSeed
    const shouldUseNeutralSeedZoom =
      (runtimeSceneNodeCount <= 0 && !partitionedFrontmatterRuntimeScene && !persistedHasViewportOffset)
      || shouldUseNeutralSeedZoomForFrontmatterInit
    const z =
      layoutRebalanceTargetTransform
      ||
      (shouldUseNeutralSeedZoom ? { k: 1, x: 0, y: 0 } : null)
      || (persistedHasViewportOffset && liveLooksDefault ? persistedZoom : null)
      || liveZoom
      || persistedZoom
      || { k: 1, x: 0, y: 0 }
    const zoomK = typeof z.k === 'number' && Number.isFinite(z.k) ? z.k : 1
    const visibleViewport = getVisibleViewport()
    const balancedViewportPreset = resolveBalancedViewportPreset({
      graphData: graphDataForSeeding,
      fallbackPreset: isFrontmatterFlow ? 'widgetFrontmatter' : 'widgetCanvas',
    })
    const spreadMargins = computeBalancedSpreadViewportMargins({
      viewportW: visibleViewport.width,
      viewportH: visibleViewport.height,
      preset: balancedViewportPreset,
    })
    const horizontalMargin = Math.max(spreadMargins.left, spreadMargins.right)
    const verticalMargin = Math.max(spreadMargins.top, spreadMargins.bottom)
    const baseGapPx = computeBalancedSpreadBaseGapPx({ viewportW: visibleViewport.width, viewportH: visibleViewport.height, preset: balancedViewportPreset, margins: spreadMargins })
    const pinnedOpenIds = (
      isFrontmatterFlow
        ? effectiveOrFallbackOpenIds
            .map(id => String(id || '').trim())
            .filter(Boolean)
        : effectiveOrFallbackOpenIds
            .map(id => String(id || '').trim())
            .filter(Boolean)
            .filter(id => {
              const pinned = resolvePlacementPinnedInCanvas(id)
              return pinned || activeSurfaceOverlayWidgetIdSet.has(id)
            })
    )
      .filter((id, index, arr) => arr.indexOf(id) === index)
      .sort((a, b) => a.localeCompare(b))
    const frontmatterHasUnplacedScreenAuthorityWidget = hasUnplacedStoryboardWidgetFloatingScreenAuthorityWidget({
      graphMetaKind,
      nodeIds: pinnedOpenIds,
      nodeTypeById,
      pinnedByNodeId: placementPinnedById,
      worldPosByNodeId: worldById,
      screenPosByNodeId: posById,
    })
    const useViewportOnlyBucket = isFrontmatterFlow || pinnedOpenIds.length >= 12
    const panelScale = computeCollectiveFollowPinnedScale({
      zoomK,
      viewportW: visibleViewport.width,
      viewportH: visibleViewport.height,
      count: Math.max(1, pinnedOpenIds.length),
      baseWidth: WIDGET_BASE_SIZE.width,
      baseHeight: WIDGET_LAYOUT_BASE_HEIGHT_PX,
      viewportPreset: balancedViewportPreset,
      fitToViewport: false,
    })
    const widgetGrid = readWidgetGridLayoutSettings(args.schema)
    const gapBasePx = widgetGrid.gridEnabled ? Math.max(baseGapPx, widgetGrid.gapPx) : baseGapPx
    const panelScreen = computeWidgetScaledSize(panelScale)
    const panelWorldW = panelScreen.width / Math.max(0.001, zoomK)
    const panelWorldH = panelScreen.height / Math.max(0.001, zoomK)
    const gapScreenPx = computeBalancedSpreadSpacingPx({
      baseGapPx: gapBasePx,
      zoomK,
      count: Math.max(1, pinnedOpenIds.length),
      preset: balancedViewportPreset,
    })
    const gapWorld = gapScreenPx / Math.max(0.001, zoomK)
    const cellW = (panelScreen.width + gapScreenPx) / Math.max(0.001, zoomK)
    const cellH = (panelScreen.height + gapScreenPx) / Math.max(0.001, zoomK)
    const worldStep = widgetGrid.gridEnabled && !isFrontmatterFlow ? Math.max(1, widgetGrid.stepPx) : 1
    const snapWorld = (v: number) => (worldStep > 1 ? snapToGridPx(v, worldStep) : v)
    const safeZoomK = Math.max(0.001, zoomK)
    const zoomX = typeof z.x === 'number' && Number.isFinite(z.x) ? z.x : 0
    const zoomY = typeof z.y === 'number' && Number.isFinite(z.y) ? z.y : 0
    const viewportBounds = useViewportOnlyBucket
      ? {
          minX: (visibleViewport.left - zoomX) / safeZoomK,
          minY: (visibleViewport.top - zoomY) / safeZoomK,
          maxX: (visibleViewport.right - zoomX) / safeZoomK,
          maxY: (visibleViewport.bottom - zoomY) / safeZoomK,
        }
      : {
          minX: (visibleViewport.left + horizontalMargin - zoomX) / safeZoomK,
          minY: (visibleViewport.top + verticalMargin - zoomY) / safeZoomK,
          maxX: (visibleViewport.right - horizontalMargin - zoomX) / safeZoomK,
          maxY: (visibleViewport.bottom - verticalMargin - zoomY) / safeZoomK,
        }
    const activeRichMediaWorldObstacles = collectActiveRichMediaWorldObstacles({
      storyboardWidgetSurfaceId: args.storyboardWidgetSurfaceId,
      skipAll: frontmatterHasUnplacedScreenAuthorityWidget,
      isFrontmatterFlow,
      effectiveOrFallbackOpenIdSet,
      resolveActiveSurfaceOverlayWidgetId,
      zoomX,
      zoomY,
      zoomK,
    })
    const activeStoryboardCardWorldObstacles = collectActiveStoryboardCardWorldObstacles({
      storyboardWidgetSurfaceId: args.storyboardWidgetSurfaceId,
      resolveActiveSurfaceOverlayWidgetId,
      zoomX,
      zoomY,
      zoomK,
    })
    const activeCollectiveWorldObstacles = [
      ...activeRichMediaWorldObstacles,
      ...activeStoryboardCardWorldObstacles,
    ]
    const seedCollisionSchema = (args.schema || defaultSchema) as GraphSchema
    const markLayoutRebalanceHandled = () => {
      if (layoutRebalanceRequested) lastHandledLayoutRebalanceAtRef.current = layoutRebalanceRequestAt
    }
    const placement = computeStoryboardWidgetCollectiveSeedPlacement({
      activeCollectiveWorldObstacles, panelWorldW, panelWorldH, gapWorld, seedCollisionSchema,
      visibleViewport, safeZoomK, snapWorld, viewportBounds, isFrontmatterFlow, graphDataForSeeding,
      cellW, cellH, pinnedOpenIds, useViewportOnlyBucket, getLiveContainmentGroupAabbForNode,
      overlayNodeLayoutSignature: args.overlayNodeLayoutSignature,
      worldById, posById, zoomX, zoomY, zoomK, graphMetaKind,
      latestAutoSeedWorldPosByNodeId: latestAutoSeedWorldPosByNodeIdRef.current,
      lastAutoSeedLayoutSignature: lastAutoSeedLayoutSignatureRef.current,
      seededPinnedWidgetWorldPosKey: seededPinnedWidgetWorldPosKeyRef.current,
      hasAuthoritativeGraphWorldAnchor, nodeTypeById, layoutRebalanceRequested, pendingRaw,
      frontmatterHasUnplacedScreenAuthorityWidget, forceSceneEmptyReseed, effectiveOrFallbackOpenIds,
      layoutRebalanceRequestAt, placementPinnedById, defaultPinnedInCanvas,
    })
    if (!placement) {
      markLayoutRebalanceHandled()
      return
    }
    const {
      nextWorld, nextScreenPos, nextAutoSeedPositions, autoSeedIds, changed, changedScreenPos,
      seedKey, currentLayoutSignature, collectiveReseedTrace,
    } = placement
    if (collectiveReseedTrace) {
      reportRuntimeTrace({
        scope: 'storyboard-media-panel-loop', runId: 'runtime', hypothesisId: 'D',
        location: 'useStoryboardWidgetCollectiveSeed.ts',
        msg: 'runtime scene escalated to whole frontmatter collective reseed',
        data: collectiveReseedTrace,
      })
    }
    latestAutoSeedWorldPosByNodeIdRef.current = nextAutoSeedPositions
    const nextWidgetWorldRectById: Record<string, { left: number; top: number; width: number; height: number }> = {}
    for (let i = 0; i < autoSeedIds.length; i += 1) {
      const id = autoSeedIds[i]!
      const world = nextWorld[id]
      if (!world || !Number.isFinite(world.x) || !Number.isFinite(world.y)) continue
      nextWidgetWorldRectById[id] = { left: world.x, top: world.y, width: panelWorldW, height: panelWorldH }
    }
    __flowCanvasDebug.widgetWorldRectById = nextWidgetWorldRectById
    syncFlowCanvasDebugWindow()
    const presentationPositionCommitOptions = zoomPresetPresentationRebalanceRequested
      ? { allowDuringWorkspaceMutation: true, persist: false }
      : undefined
    if (changedScreenPos) st.setFlowWidgetPosByNodeId(nextScreenPos, presentationPositionCommitOptions)
    if (changed) st.setFlowWidgetWorldPosByNodeId(nextWorld, presentationPositionCommitOptions)
    seededPinnedWidgetWorldPosKeyRef.current = seedKey
    lastAutoSeedLayoutSignatureRef.current = currentLayoutSignature
    markLayoutRebalanceHandled()
  }, [
    args.active,
    args.storyboardWidgetSurfaceId,
    args.storyboardWidgetLayoutRebalanceRequest,
    args.openWidgetNodeIds,
    args.overlayNodeLayoutSignature,
    args.schema,
    args.viewportH,
    args.viewportW,
    args.zoomViewKeyRef,
    flowWidgetPinnedCount,
    flowWidgetWorldPosCount,
    getLiveContainmentGroupAabbForNode,
    getVisibleViewport,
    getLiveZoomTransform,
    readPreferredGraphDataForSeeding,
  ])

}
