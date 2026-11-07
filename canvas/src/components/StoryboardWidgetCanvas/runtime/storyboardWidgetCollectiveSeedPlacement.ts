import { placeWidgetsCenteredInGroupBounds } from '@/components/StoryboardWidget/seedGroupSpread'
import { isCanonicalFrontmatterBuiltInWidgetNode, shouldAutoPlaceStoryboardWidget } from '@/components/StoryboardWidgetCanvas/storyboardWidgetCanvasShared'
import { buildFlowOverlayBoundsFromRects, deriveFlowOverlayCollectiveViewportState, type VisibleFlowViewport } from '@/components/FlowCanvas/workspaceVisibleViewportRecovery'
import { readFrontmatterFlowRenderSettings } from '@/lib/graph/frontmatterFlowSettings'
import { centerLayoutRectsByCentroid, measureLayoutRectSet } from '@/lib/canvas/layoutCentroid'
import { relaxOverlayPanelsWithCollision } from '@/lib/ui/relaxOverlayPanelsWithCollision'
import { shouldForceBalancedSpreadReseed } from '@/lib/ui/overlayBalancedSpread'
import type { GraphData } from '@/lib/graph/types'
import type { GraphSchema } from '@/lib/graph/schema'
import type { StoryboardWidgetWorldObstacle } from './storyboardWidgetRuntimeRichMediaObstacles'
import { syncFlowWidgetScreenAuthorityPosition } from './storyboardWidgetRuntimeSeedPositions'
import type { FlowWidgetPinnedById, FlowWidgetScreenPosById, FlowWidgetWorldPosById } from './storyboardWidgetRuntimeWidgetState'

type Bounds = { minX: number; minY: number; maxX: number; maxY: number }
type PlacementArgs = {
  activeCollectiveWorldObstacles: StoryboardWidgetWorldObstacle[]
  panelWorldW: number; panelWorldH: number; gapWorld: number
  seedCollisionSchema: GraphSchema
  visibleViewport: Omit<VisibleFlowViewport, 'centerX' | 'centerY'>
  safeZoomK: number; snapWorld: (value: number) => number
  viewportBounds: Bounds
  isFrontmatterFlow: boolean; graphDataForSeeding: GraphData | null
  cellW: number; cellH: number; pinnedOpenIds: string[]; useViewportOnlyBucket: boolean
  getLiveContainmentGroupAabbForNode: (id: string) => (Bounds & { groupId: string }) | null
  overlayNodeLayoutSignature: string
  worldById: FlowWidgetWorldPosById; posById: FlowWidgetScreenPosById
  zoomX: number; zoomY: number; zoomK: number; graphMetaKind: string | null
  latestAutoSeedWorldPosByNodeId: FlowWidgetWorldPosById
  lastAutoSeedLayoutSignature: string; seededPinnedWidgetWorldPosKey: string
  hasAuthoritativeGraphWorldAnchor: (id: string) => boolean
  nodeTypeById: Map<string, string>
  layoutRebalanceRequested: boolean; pendingRaw: string[]
  frontmatterHasUnplacedScreenAuthorityWidget: boolean; forceSceneEmptyReseed: boolean
  effectiveOrFallbackOpenIds: string[]; layoutRebalanceRequestAt: number
  placementPinnedById: FlowWidgetPinnedById; defaultPinnedInCanvas: boolean
}

// Value-only placement: the hook retains graph-store and mutable authority commits.
export function computeStoryboardWidgetCollectiveSeedPlacement(input: PlacementArgs) {
  const {
    activeCollectiveWorldObstacles, panelWorldW, panelWorldH, gapWorld, seedCollisionSchema,
    visibleViewport, safeZoomK, snapWorld, viewportBounds, isFrontmatterFlow, graphDataForSeeding,
    cellW, cellH, pinnedOpenIds, useViewportOnlyBucket, getLiveContainmentGroupAabbForNode,
    overlayNodeLayoutSignature, worldById, posById, zoomX, zoomY, zoomK, graphMetaKind,
    latestAutoSeedWorldPosByNodeId, lastAutoSeedLayoutSignature, seededPinnedWidgetWorldPosKey,
    hasAuthoritativeGraphWorldAnchor, nodeTypeById, layoutRebalanceRequested, pendingRaw,
    frontmatterHasUnplacedScreenAuthorityWidget, forceSceneEmptyReseed, effectiveOrFallbackOpenIds,
    layoutRebalanceRequestAt, placementPinnedById, defaultPinnedInCanvas,
  } = input
  const overlapsSeedRect = (
    a: { left: number; top: number; width: number; height: number },
    b: { left: number; top: number; width: number; height: number },
    gap: number,
  ) => {
    const ax2 = a.left + a.width + gap
    const ay2 = a.top + a.height + gap
    const bx2 = b.left + b.width + gap
    const by2 = b.top + b.height + gap
    return a.left < bx2 && b.left < ax2 && a.top < by2 && b.top < ay2
  }
  const avoidActiveCollectiveSeedObstacles = (placed: Array<{ id: string; x: number; y: number }>) => {
    if (activeCollectiveWorldObstacles.length === 0 || placed.length === 0) return placed
    let items = placed.map(p => ({
      id: p.id,
      left: p.x,
      top: p.y,
      width: panelWorldW,
      height: panelWorldH,
      movable: true,
    }))
    const hasObstacleOverlap = () => items.some(item =>
      activeCollectiveWorldObstacles.some(obstacle => obstacle.id !== item.id && overlapsSeedRect(item, obstacle, gapWorld)),
    )
    if (!hasObstacleOverlap()) return placed
    for (let pass = 0; pass < 3 && hasObstacleOverlap(); pass += 1) {
      const relaxed = relaxOverlayPanelsWithCollision({
        schema: seedCollisionSchema,
        items,
        obstacles: activeCollectiveWorldObstacles.filter(obstacle => !items.some(item => item.id === obstacle.id)),
        gapPx: gapWorld,
        strength: 0.85,
        iterations: 12,
        steps: 14,
        anchorStrength: 0.08,
        maxAnchorShiftPx: Math.max(
          panelWorldW + gapWorld,
          panelWorldH + gapWorld,
          Math.min(visibleViewport.width, visibleViewport.height) / safeZoomK * 0.42,
        ),
        maxSpeedPxPerStep: 180 / safeZoomK,
      })
      const relaxedById = new Map(relaxed.map(item => [item.id, item]))
      items = items.map(item => {
        const next = relaxedById.get(item.id)
        return next ? { ...item, left: next.left, top: next.top } : item
      })
    }
    const relaxedById = new Map(items.map(item => [item.id, item]))
    return placed.map(p => {
      const next = relaxedById.get(p.id)
      if (!next) return p
      return {
        id: p.id,
        x: snapWorld(next.left),
        y: snapWorld(next.top),
      }
    })
  }
  const normalizeSeedBoundsToViewport = (bounds: { minX: number; minY: number; maxX: number; maxY: number }) => {
    const bounded = {
      minX: Number.isFinite(bounds.minX) ? bounds.minX : viewportBounds.minX,
      minY: Number.isFinite(bounds.minY) ? bounds.minY : viewportBounds.minY,
      maxX: Number.isFinite(bounds.maxX) ? bounds.maxX : viewportBounds.maxX,
      maxY: Number.isFinite(bounds.maxY) ? bounds.maxY : viewportBounds.maxY,
    }
    const intersected = {
      minX: Math.max(viewportBounds.minX, bounded.minX),
      minY: Math.max(viewportBounds.minY, bounded.minY),
      maxX: Math.min(viewportBounds.maxX, bounded.maxX),
      maxY: Math.min(viewportBounds.maxY, bounded.maxY),
    }
    if (intersected.maxX - intersected.minX >= 1 && intersected.maxY - intersected.minY >= 1) return intersected
    return viewportBounds
  }
  const frontmatterRenderSettings = isFrontmatterFlow ? readFrontmatterFlowRenderSettings(graphDataForSeeding) : null
  const balancedHeroRowCount = frontmatterRenderSettings?.balancedHeroRowCount
  const balancedHeroRowGapScale = frontmatterRenderSettings?.balancedHeroRowGapScale
  const balancedHeroRowStaggerScale = frontmatterRenderSettings?.balancedHeroRowStaggerScale
  const placeSpreadGridInBounds = (ids: string[], bounds: { minX: number; minY: number; maxX: number; maxY: number }) =>
    avoidActiveCollectiveSeedObstacles(placeWidgetsCenteredInGroupBounds({
      ids,
      bounds: normalizeSeedBoundsToViewport(bounds),
      cellW,
      cellH,
      gapWorld,
      snapWorld,
      preferredFirstRowCount: balancedHeroRowCount,
      preferredRowGapScale: balancedHeroRowGapScale,
      preferredSingleRowStaggerScale: balancedHeroRowStaggerScale,
    }))

  const viewportBucketId = '__viewport__'
  const allBoundsByBucket = new Map<string, { minX: number; minY: number; maxX: number; maxY: number }>()
  allBoundsByBucket.set(viewportBucketId, viewportBounds)
  for (let i = 0; i < pinnedOpenIds.length; i += 1) {
    const id = pinnedOpenIds[i]!
    if (useViewportOnlyBucket) continue
    const group = getLiveContainmentGroupAabbForNode(id)
    if (!group) continue
    allBoundsByBucket.set(
      `group:${group.groupId}`,
      normalizeSeedBoundsToViewport({ minX: group.minX, minY: group.minY, maxX: group.maxX, maxY: group.maxY }),
    )
  }

  const bucketSignature = Array.from(allBoundsByBucket.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([bucketId, bounds]) => {
      if (bucketId === viewportBucketId) return `${bucketId}:visible-viewport`
      const minX = Math.round(bounds.minX * 1000) / 1000
      const minY = Math.round(bounds.minY * 1000) / 1000
      const maxX = Math.round(bounds.maxX * 1000) / 1000
      const maxY = Math.round(bounds.maxY * 1000) / 1000
      return `${bucketId}:${minX},${minY},${maxX},${maxY}`
    })
    .join('|')
  const currentLayoutSignature = `${overlayNodeLayoutSignature}|${visibleViewport.left},${visibleViewport.top},${visibleViewport.width}x${visibleViewport.height}|${bucketSignature}`
  const visibleViewportState: VisibleFlowViewport = {
    left: visibleViewport.left,
    top: visibleViewport.top,
    right: visibleViewport.right,
    bottom: visibleViewport.bottom,
    width: visibleViewport.width,
    height: visibleViewport.height,
    centerX: visibleViewport.left + visibleViewport.width / 2,
    centerY: visibleViewport.top + visibleViewport.height / 2,
  }
  const currentPinnedCollectiveBounds = buildFlowOverlayBoundsFromRects({
    items: pinnedOpenIds
      .map(id => {
        const world = worldById[id]
        if (!world || !Number.isFinite(world.x) || !Number.isFinite(world.y)) return null
        const left = world.x * safeZoomK + zoomX
        const top = world.y * safeZoomK + zoomY
        return {
          id,
          left,
          top,
          width: panelWorldW * safeZoomK,
          height: panelWorldH * safeZoomK,
        }
      })
      .filter((item): item is { id: string; left: number; top: number; width: number; height: number } => !!item),
  })
  const currentPinnedCollectiveViewportState =
    currentPinnedCollectiveBounds && currentPinnedCollectiveBounds.ids?.length === pinnedOpenIds.length
      ? deriveFlowOverlayCollectiveViewportState({
          bounds: currentPinnedCollectiveBounds,
          visibleViewport: visibleViewportState,
        })
      : null
  const currentPinnedCollectiveAlreadyBalanced =
    pinnedOpenIds.length > 1
    && currentPinnedCollectiveViewportState?.balanced === true
  const initialCollectiveCenteringPass =
    seededPinnedWidgetWorldPosKey.length === 0
    && lastAutoSeedLayoutSignature.length === 0
  const collectiveCentroidOffCenter = (
    items: Array<{ left: number; top: number; width: number; height: number }>,
    bounds: { minX: number; minY: number; maxX: number; maxY: number },
  ) => {
    if (items.length <= 1) return false
    const metrics = measureLayoutRectSet(items)
    if (!metrics || metrics.count <= 1) return false
    const targetCenterX = (bounds.minX + bounds.maxX) / 2
    const targetCenterY = (bounds.minY + bounds.maxY) / 2
    const toleranceX = Math.max(panelWorldW * 0.32, gapWorld * 1.75, (bounds.maxX - bounds.minX) * 0.045)
    const toleranceY = Math.max(panelWorldH * 0.32, gapWorld * 1.75, (bounds.maxY - bounds.minY) * 0.045)
    const outsideBounds =
      metrics.maxRight <= bounds.minX
      || metrics.maxBottom <= bounds.minY
      || metrics.minLeft >= bounds.maxX
      || metrics.minTop >= bounds.maxY
    return (
      outsideBounds
      || Math.abs(metrics.centroidX - targetCenterX) > toleranceX
      || Math.abs(metrics.centroidY - targetCenterY) > toleranceY
    )
  }

  const overlapEligible = (() => {
    const idsByBucket = new Map<string, string[]>()
    const pinnedWorldIdsByBucket = new Map<string, string[]>()
    const autoSeedWorldById = latestAutoSeedWorldPosByNodeId || {}
    const autoSeedLayoutChanged =
      lastAutoSeedLayoutSignature.length > 0
      && lastAutoSeedLayoutSignature !== currentLayoutSignature
      && !currentPinnedCollectiveAlreadyBalanced
    for (let i = 0; i < pinnedOpenIds.length; i += 1) {
      const id = pinnedOpenIds[i]!
      const world = worldById[id]
      const hasAuthoritativeWorldAnchor = hasAuthoritativeGraphWorldAnchor(id)
      const group = useViewportOnlyBucket ? null : getLiveContainmentGroupAabbForNode(id)
      const bucketId = group ? `group:${group.groupId}` : viewportBucketId
      if (world && Number.isFinite(world.x) && Number.isFinite(world.y)) {
        const pinnedList = pinnedWorldIdsByBucket.get(bucketId) || []
        pinnedList.push(id)
        pinnedWorldIdsByBucket.set(bucketId, pinnedList)
      }
      const nodeTypeId = nodeTypeById.get(id) || ''
      const frontmatterPinnedWidget =
        graphMetaKind === 'frontmatter-flow'
        && !hasAuthoritativeWorldAnchor
        && isCanonicalFrontmatterBuiltInWidgetNode({ id, type: nodeTypeId })
      const autoPlaceCandidate =
        shouldAutoPlaceStoryboardWidget({ graphMetaKind, pinnedInCanvas: true, worldPos: world, nodeTypeId })
        || frontmatterPinnedWidget
        || (initialCollectiveCenteringPass && !hasAuthoritativeWorldAnchor)
      if (!autoPlaceCandidate) continue
      if (!world || !Number.isFinite(world.x) || !Number.isFinite(world.y)) continue
      const list = idsByBucket.get(bucketId) || []
      list.push(id)
      idsByBucket.set(bucketId, list)
    }
    const overlappingIds = new Set<string>()
    const hasOverlap = (aId: string, bId: string) => {
      const a = worldById[aId]
      const b = worldById[bId]
      if (!a || !b) return false
      const overlapX = a.x < b.x + panelWorldW && b.x < a.x + panelWorldW
      const overlapY = a.y < b.y + panelWorldH && b.y < a.y + panelWorldH
      return overlapX && overlapY
    }
    for (const [bucketId, pinnedIds] of pinnedWorldIdsByBucket.entries()) {
      for (let i = 0; i < pinnedIds.length; i += 1) {
        const id = pinnedIds[i]!
        if (!autoSeedLayoutChanged) continue
        const prevAuto = autoSeedWorldById[id]
        if (!prevAuto || !Number.isFinite(prevAuto.x) || !Number.isFinite(prevAuto.y)) continue
        if (!worldById[id] || !Number.isFinite(worldById[id]!.x) || !Number.isFinite(worldById[id]!.y)) continue
        if (Math.abs(worldById[id]!.x - prevAuto.x) > 0.01 || Math.abs(worldById[id]!.y - prevAuto.y) > 0.01) continue
        overlappingIds.add(id)
      }
    }
    for (const [bucketId, ids] of idsByBucket.entries()) {
      const bucketItems = ids
        .map(id => {
          const world = worldById[id]
          if (!world) return null
          return { id, left: world.x, top: world.y, width: panelWorldW, height: panelWorldH }
        })
        .filter((item): item is { id: string; left: number; top: number; width: number; height: number } => !!item)
      const hasResidueCluster =
        bucketItems.length >= 3
        && shouldForceBalancedSpreadReseed({ items: bucketItems, gapPx: gapWorld })
      const bucketBounds = allBoundsByBucket.get(bucketId) || viewportBounds
      const needsInitialCentroidSeed =
        initialCollectiveCenteringPass
        && collectiveCentroidOffCenter(bucketItems, bucketBounds)
      if (hasResidueCluster || needsInitialCentroidSeed) {
        for (let i = 0; i < bucketItems.length; i += 1) overlappingIds.add(bucketItems[i]!.id)
        continue
      }
      for (let i = 0; i < ids.length; i += 1) {
        const a = ids[i]!
        for (let j = i + 1; j < ids.length; j += 1) {
          const b = ids[j]!
          if (!hasOverlap(a, b)) continue
          overlappingIds.add(a)
          overlappingIds.add(b)
        }
      }
    }
    return Array.from(overlappingIds)
  })()
  const forcedLayoutRebalanceIds = layoutRebalanceRequested ? pinnedOpenIds : []
  const unanchoredPinnedOpenIds = pinnedOpenIds.filter(id => !hasAuthoritativeGraphWorldAnchor(id))
  const forcedInitialCollectiveIds =
    initialCollectiveCenteringPass
    && (
      (pendingRaw.length > 0 && unanchoredPinnedOpenIds.length > 1)
      || frontmatterHasUnplacedScreenAuthorityWidget
    )
      ? unanchoredPinnedOpenIds
      : []
  const incrementalUnplacedNodeIds = (
    !initialCollectiveCenteringPass
    && !layoutRebalanceRequested
    && !forceSceneEmptyReseed
    && pendingRaw.length > 0
  ) ? pendingRaw : []
  let pending = (
    incrementalUnplacedNodeIds.length > 0
      ? incrementalUnplacedNodeIds
      : Array.from(new Set([
          ...pendingRaw,
          ...overlapEligible,
          ...forcedInitialCollectiveIds,
          ...forcedLayoutRebalanceIds,
        ]))
  ).sort((a, b) => a.localeCompare(b))
  const fullFrontmatterCollectiveIds = isFrontmatterFlow
    ? Array.from(new Set(
        effectiveOrFallbackOpenIds
          .map(id => String(id || '').trim())
          .filter(id => id && !hasAuthoritativeGraphWorldAnchor(id)),
      )).sort((a, b) => a.localeCompare(b))
    : []
  const shouldReseedWholeFrontmatterCollective =
    isFrontmatterFlow
    && fullFrontmatterCollectiveIds.length > 0
    && incrementalUnplacedNodeIds.length === 0
    && (() => {
      if (forceSceneEmptyReseed) return true
      return pending.length > 0 && pending.length < fullFrontmatterCollectiveIds.length
    })()
  const collectiveReseedTrace = shouldReseedWholeFrontmatterCollective ? {
    forceSceneEmptyReseed, pendingCount: pending.length,
    fullFrontmatterCollectiveCount: fullFrontmatterCollectiveIds.length,
    pendingIds: pending, fullFrontmatterCollectiveIds,
    layoutRebalanceRequested, isFrontmatterFlow, frontmatterHasUnplacedScreenAuthorityWidget,
  } : null
  if (shouldReseedWholeFrontmatterCollective) pending = fullFrontmatterCollectiveIds
  if (pending.length === 0) {
    return null
  }

  const idsByBucket = new Map<string, string[]>()
  const boundsByBucket = new Map<string, { minX: number; minY: number; maxX: number; maxY: number }>()
  boundsByBucket.set(viewportBucketId, viewportBounds)
  for (let i = 0; i < pending.length; i += 1) {
    const id = pending[i]!
    const group = useViewportOnlyBucket ? null : getLiveContainmentGroupAabbForNode(id)
    const bucketId = group ? `group:${group.groupId}` : viewportBucketId
    const list = idsByBucket.get(bucketId) || []
    list.push(id)
    idsByBucket.set(bucketId, list)
    if (group) {
      boundsByBucket.set(
        bucketId,
        normalizeSeedBoundsToViewport({ minX: group.minX, minY: group.minY, maxX: group.maxX, maxY: group.maxY }),
      )
    }
  }
  const bucketIds = Array.from(idsByBucket.keys()).sort((a, b) => a.localeCompare(b))
  const pendingSet = new Set(pending)
  const seedKey = `${pending.join(',')}|${currentLayoutSignature}|${layoutRebalanceRequested ? `rebalance:${layoutRebalanceRequestAt}` : 'auto'}`
  if (seededPinnedWidgetWorldPosKey === seedKey && !forceSceneEmptyReseed) {
    return null
  }

  const nextWorld = { ...worldById }
  const nextScreenPos = { ...posById }
  let changed = false
  let changedScreenPos = false
  const nextAutoSeedPositions: Record<string, { x: number; y: number }> = {}
  const syncScreenAuthorityPosition = (id: string, world: { x: number; y: number }) => {
    changedScreenPos = syncFlowWidgetScreenAuthorityPosition({
      id, world, nextScreenPos, pinnedById: placementPinnedById, defaultPinnedInCanvas, graphMetaKind, zoomK, zoomX, zoomY,
    }) || changedScreenPos
  }
  for (let i = 0; i < bucketIds.length; i += 1) {
    const bucketId = bucketIds[i]!
    const ids = (idsByBucket.get(bucketId) || [])
      .filter(id => pendingSet.has(id))
      .sort((a, b) => a.localeCompare(b))
    if (ids.length === 0) continue
    const bounds = boundsByBucket.get(bucketId) || viewportBounds
    const placed = placeSpreadGridInBounds(ids, bounds)
    for (let j = 0; j < placed.length; j += 1) {
      const p = placed[j]!
      const prev = worldById[p.id]
      if (!prev || Math.abs(prev.x - p.x) > 0.0001 || Math.abs(prev.y - p.y) > 0.0001) changed = true
      nextWorld[p.id] = { x: p.x, y: p.y }
      nextAutoSeedPositions[p.id] = { x: p.x, y: p.y }
      syncScreenAuthorityPosition(p.id, nextWorld[p.id]!)
    }
  }
  const autoSeedIds = Object.keys(nextAutoSeedPositions)
  if (autoSeedIds.length > 0) {
    const centered = centerLayoutRectsByCentroid({
      items: autoSeedIds
        .map(id => {
          const world = nextWorld[id]
          if (!world || !Number.isFinite(world.x) || !Number.isFinite(world.y)) return null
          return { id, left: world.x, top: world.y, width: panelWorldW, height: panelWorldH }
        })
        .filter((item): item is { id: string; left: number; top: number; width: number; height: number } => !!item),
      bounds: viewportBounds,
    })
    if (Math.abs(centered.shiftX) > 0.0001 || Math.abs(centered.shiftY) > 0.0001) {
      for (let i = 0; i < centered.items.length; i += 1) {
        const item = centered.items[i]!
        const x = item.left
        const y = item.top
        nextWorld[item.id] = { x, y }
        nextAutoSeedPositions[item.id] = { x, y }
        syncScreenAuthorityPosition(item.id, nextWorld[item.id]!)
      }
      changed = true
    }
    const obstacleAdjusted = avoidActiveCollectiveSeedObstacles(autoSeedIds
      .map(id => {
        const world = nextWorld[id]
        if (!world || !Number.isFinite(world.x) || !Number.isFinite(world.y)) return null
        return { id, x: world.x, y: world.y }
      })
      .filter((item): item is { id: string; x: number; y: number } => !!item))
    for (let i = 0; i < obstacleAdjusted.length; i += 1) {
      const p = obstacleAdjusted[i]!
      const prev = nextWorld[p.id]
      if (!prev || (Math.abs(prev.x - p.x) <= 0.0001 && Math.abs(prev.y - p.y) <= 0.0001)) continue
      nextWorld[p.id] = { x: p.x, y: p.y }
      nextAutoSeedPositions[p.id] = { x: p.x, y: p.y }
      syncScreenAuthorityPosition(p.id, nextWorld[p.id]!)
      changed = true
    }
  }
  return {
    nextWorld, nextScreenPos, nextAutoSeedPositions, autoSeedIds, changed, changedScreenPos,
    seedKey, currentLayoutSignature, collectiveReseedTrace,
  }
}
