import type React from 'react'
import { useGraphStore } from '@/hooks/useGraphStore'
import { getEffectiveZoomStateForKey } from '@/lib/canvas/zoom-effective'
import { screenToWorld, worldToScreen } from '@/lib/zoom/viewport'
import { DEFAULT_FLOW_NODE_WIDTH_PX } from '@/lib/graph/layoutDefaults'
import { readPortHandleUiMetrics } from '@/components/StoryboardWidget/portHandleUi'
import {
  WIDGET_ACTIONS_TOOLBAR_CLEARANCE_PX,
  WIDGET_ACTIONS_TOOLBAR_MAX_WIDTH_PX,
  WIDGET_ACTIONS_TOOLBAR_VIEWPORT_MARGIN_PX,
} from '@/components/StoryboardWidget/flowWidgetOverlayShared'
import {
  computeBoundedOverlayPaintScale,
  computeWidgetScaleKey,
  computeWidgetScaledSize,
  projectCollectiveScreenLayoutForZoom,
  WIDGET_BASE_SIZE,
} from '@/lib/canvas/overlayWidgetZoom'
import {
  applyVectorPaintedOverlayBox,
  projectVectorPaintedOverlayZoomBox,
  type VectorPaintedOverlayScaleProjectionBase,
} from '@/lib/canvas/vectorPaintedOverlayProjection'
import { isFrontmatterManagedOverlayNode, resolveFrontmatterBalancedFallbackPos } from '@/components/StoryboardWidget/widgetFrontmatterPlacement'
import { readRichMediaOverlayFrameSize } from '@/components/StoryboardWidget/richMediaOverlayFrameSize'
import { computeStoryboardWidgetOverlayScreenBox } from '@/lib/storyboardWidget/overlayWorldDrag'
import { computeViewportSafeInlineCenterShiftPx } from '@/lib/ui/viewportToolbarPlacement'
import { resolveStoryboardWidgetVisibleViewport } from '@/components/FlowCanvas/applyZoomRequestNative'
import {
  coerceRichMediaPanelSizePx,
  resolveRichMediaAspectRatioValue,
  resolveRichMediaAspectSelection,
} from '@/lib/render/richMediaSsot'
import { FLOW_RICH_MEDIA_PANEL_NODE_TYPE_ID } from '@/lib/storyboardWidget/richMediaPanelConfig'
import { emitStoryboardWidgetInteractionFrame } from '@/lib/canvas/storyboard-widget-overlay-proxy'
import type { ApplyOverlayPositionOptions } from '@/components/StoryboardWidget/useWidgetPlacementRuntime'
import type { AppliedOverlayPlacement } from '@/components/StoryboardWidget/widgetPlacementRuntimeState'

export function applyWidgetOverlayPosition(args: {
  asideRef: React.MutableRefObject<HTMLElement | null>
  nodeRef: React.MutableRefObject<{ x?: unknown; y?: unknown; properties?: unknown }>
  getLiveZoomTransform?: () => { k: number; x: number; y: number } | null
  zoomViewKey?: string | null
  shouldBypassStoreZoomFallback: (liveZoom: { k: number; x: number; y: number } | null) => boolean
  zoomStateRef: React.MutableRefObject<{ k: number; x: number; y: number } | null>
  schemaRef: React.MutableRefObject<import('@/lib/graph/schema').GraphSchema | null>
  graphMetaKind?: string | null
  storyboardWidgetSurfaceId?: string | null
  viewportW: number
  viewportH: number
  readScreenAuthorityFollowZoomK: (zoomK: number, enabled: boolean) => number
  readPanelScaleForZoom: (zoomK: number, frontmatterManagedNode?: boolean, viewportOverride?: { width: number; height: number } | null) => number
  openWidgetNodeCount: number
  stackIndex?: number
  getLiveNodeWorldPos?: (nodeId: string) => { x: number; y: number } | null
  nodeId: string
  getLiveContainmentGroupAabbForNode?: (nodeId: string) => { groupId: string; minX: number; minY: number; maxX: number; maxY: number } | null
  floatingRef: React.MutableRefObject<boolean>
  floatingUsesScreenAuthority: boolean
  lastAppliedRef: React.MutableRefObject<AppliedOverlayPlacement | null>
  storyboardPinnedZoomLayoutBaseRef: React.MutableRefObject<VectorPaintedOverlayScaleProjectionBase | null>
  lastStoryboardPinnedTransformRef: React.MutableRefObject<{ k: number; x: number; y: number } | null>
  screenAuthorityLayoutZoomBaseRef: React.MutableRefObject<{ left: number; top: number; scale: number } | null>
  screenAuthorityHandoffPosRef: React.MutableRefObject<{ left: number; top: number; scale: number } | null>
  widgetWorldPosRef: React.MutableRefObject<{ x: number; y: number } | null>
  lastGoodWorldPosRef: React.MutableRefObject<{ x: number; y: number } | null>
  pinnedDragOverrideRef: React.MutableRefObject<{ left: number; top: number } | null>
  worldDragOverrideRef: React.MutableRefObject<{ x: number; y: number } | null>
  canvasWindowOffsetRef: React.MutableRefObject<{ left: number; top: number }>
  scaledSizeRef: React.MutableRefObject<{ width: number; height: number }>
  anchoredPosRef: React.MutableRefObject<{ top: number; left: number }>
  lastFloatingScaleKeyRef: React.MutableRefObject<string>
  cssInitRef: React.MutableRefObject<boolean>
  widgetPos: { top: number; left: number } | undefined
  pinnedTopPx: number
  pinnedLeftPx: number
  autoStackOffset: { top: number; left: number }
  readStoredWidgetWorldPos: () => { x: number; y: number } | null
  persistWorldPos: (pos: { x: number; y: number }) => void
  setToolbarDock: React.Dispatch<React.SetStateAction<'above' | 'below'>>
  setToolbarInlineShiftPx: React.Dispatch<React.SetStateAction<number>>
  setToolbarMaxWidthPx: React.Dispatch<React.SetStateAction<number>>
  opts?: ApplyOverlayPositionOptions
}): void {
  const {
    asideRef,
    nodeRef,
    getLiveZoomTransform,
    zoomViewKey,
    shouldBypassStoreZoomFallback,
    zoomStateRef,
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
  } = args

  const el = asideRef.current
  if (!el) return
  const n = nodeRef.current
  const richMediaFrameSize = readRichMediaOverlayFrameSize(n as { type?: unknown; properties?: unknown })
  const effectiveRichMediaFrameSize = (() => {
    if (String((n as { type?: unknown } | null)?.type || '').trim() !== FLOW_RICH_MEDIA_PANEL_NODE_TYPE_ID) return richMediaFrameSize
    const props = n && typeof n === 'object' && !Array.isArray((n as { properties?: unknown }).properties)
      ? ((n as { properties?: unknown }).properties as Record<string, unknown> | null)
      : null
    if (!props) return richMediaFrameSize
    const width = Number(props['visual:width'])
    const height = Number(props['visual:height'])
    if (!(Number.isFinite(width) && width > 0 && Number.isFinite(height) && height > 0)) return richMediaFrameSize
    return coerceRichMediaPanelSizePx({
      width,
      height,
      minWidthPx: 1,
      minHeightPx: 1,
      targetAspect: resolveRichMediaAspectRatioValue(resolveRichMediaAspectSelection({ width, height })),
    })
  })()
  if (!cssInitRef.current) {
    cssInitRef.current = true
    el.style.left = '0px'
    el.style.top = '0px'
    el.style.transformOrigin = 'top left'
    el.style.transform = 'none'
    ;(el.style as CSSStyleDeclaration & { zoom: string }).zoom = '1'
  }
  const frameWidth = effectiveRichMediaFrameSize?.width || WIDGET_BASE_SIZE.width
  const frameHeight = effectiveRichMediaFrameSize?.height || WIDGET_BASE_SIZE.height
  const nextFrameWidth = `${frameWidth}px`
  const nextFrameHeight = `${frameHeight}px`
  if (el.style.width !== nextFrameWidth) el.style.width = nextFrameWidth
  if (el.style.height !== nextFrameHeight) el.style.height = nextFrameHeight
  const liveZoom = getLiveZoomTransform ? getLiveZoomTransform() : null
  const storeZoom = getEffectiveZoomStateForKey({
    zoomViewKey,
    zoomStateByKey: useGraphStore.getState().zoomStateByKey,
    zoomState: useGraphStore.getState().zoomState,
  })
  const bypassStoreZoomFallback = shouldBypassStoreZoomFallback(liveZoom)
  let z = liveZoom || (bypassStoreZoomFallback ? null : zoomStateRef.current)
  if (!liveZoom && !bypassStoreZoomFallback && storeZoom && storeZoom !== z) {
    z = storeZoom
    zoomStateRef.current = storeZoom
  }
  const placementTransform = z || { k: 1, x: 0, y: 0 }
  const zoomK = Number.isFinite(placementTransform.k) ? placementTransform.k : 1
  const frontmatterManagedNode = isFrontmatterManagedOverlayNode(graphMetaKind, n)
  const frontmatterVisibleViewportAuthority = frontmatterManagedNode
  const screenAuthorityVisibleViewport = frontmatterVisibleViewportAuthority
    ? resolveStoryboardWidgetVisibleViewport({ storyboardWidgetSurfaceId: storyboardWidgetSurfaceId || undefined, viewportW, viewportH })
    : { left: 0, top: 0, right: viewportW, bottom: viewportH, width: viewportW, height: viewportH, centerX: viewportW / 2, centerY: viewportH / 2 }
  const screenAuthorityViewportLeft = Number.isFinite(screenAuthorityVisibleViewport.left) ? screenAuthorityVisibleViewport.left : 0
  const screenAuthorityViewportTop = Number.isFinite(screenAuthorityVisibleViewport.top) ? screenAuthorityVisibleViewport.top : 0
  const screenAuthorityViewportRight = Number.isFinite(screenAuthorityVisibleViewport.right) ? screenAuthorityVisibleViewport.right : viewportW
  const screenAuthorityViewportBottom = Number.isFinite(screenAuthorityVisibleViewport.bottom) ? screenAuthorityVisibleViewport.bottom : viewportH
  const screenAuthorityViewportWidth = Math.max(1, Number.isFinite(screenAuthorityVisibleViewport.width) ? screenAuthorityVisibleViewport.width : viewportW)
  const screenAuthorityViewportHeight = Math.max(1, Number.isFinite(screenAuthorityVisibleViewport.height) ? screenAuthorityVisibleViewport.height : viewportH)
  const frontmatterPanelScaleZoomK = readScreenAuthorityFollowZoomK(zoomK, frontmatterVisibleViewportAuthority)
  const panelScale = readPanelScaleForZoom(
    frontmatterPanelScaleZoomK,
    frontmatterManagedNode,
    frontmatterVisibleViewportAuthority ? { width: screenAuthorityViewportWidth, height: screenAuthorityViewportHeight } : null,
  )
  if (floatingRef.current) lastFloatingScaleKeyRef.current = computeWidgetScaleKey(panelScale)
  const baseScaled = computeWidgetScaledSize(panelScale)
  const scaled = effectiveRichMediaFrameSize
    ? { width: effectiveRichMediaFrameSize.width * panelScale, height: effectiveRichMediaFrameSize.height * panelScale }
    : baseScaled
  scaledSizeRef.current = scaled
  const rawFrontmatterBalancedFallbackPos = resolveFrontmatterBalancedFallbackPos({
    enabled: frontmatterManagedNode,
    openWidgetNodeCount,
    stackIndex,
    viewportW: frontmatterVisibleViewportAuthority ? screenAuthorityViewportWidth : viewportW,
    viewportH: frontmatterVisibleViewportAuthority ? screenAuthorityViewportHeight : viewportH,
    scaled,
    zoomK: frontmatterPanelScaleZoomK,
  })
  const frontmatterBalancedFallbackPos = rawFrontmatterBalancedFallbackPos
    ? {
        top: rawFrontmatterBalancedFallbackPos.top + (frontmatterVisibleViewportAuthority ? screenAuthorityViewportTop : 0),
        left: rawFrontmatterBalancedFallbackPos.left + (frontmatterVisibleViewportAuthority ? screenAuthorityViewportLeft : 0),
      }
    : null
  const live = getLiveNodeWorldPos ? getLiveNodeWorldPos(nodeId) : null
  const liveX = live && Number.isFinite(live.x) ? live.x : null
  const liveY = live && Number.isFinite(live.y) ? live.y : null
  const nx = typeof n.x === 'number' && Number.isFinite(n.x) ? n.x : null
  const ny = typeof n.y === 'number' && Number.isFinite(n.y) ? n.y : null
  const hasAuthoritativeNodeWorldPos = (liveX != null && liveY != null) || (nx != null && ny != null)
  const storyboardRichMediaGraphWorldPreferred = String(storyboardWidgetSurfaceId || '').trim() === 'storyboard' && !!effectiveRichMediaFrameSize && nx != null && ny != null
  const preferredAuthoritativeWorldPos =
    storyboardRichMediaGraphWorldPreferred
      ? { x: nx, y: ny }
      : (liveX != null && liveY != null)
        ? { x: liveX, y: liveY }
        : (nx != null && ny != null)
          ? { x: nx, y: ny }
          : null
  if (preferredAuthoritativeWorldPos) lastGoodWorldPosRef.current = preferredAuthoritativeWorldPos
  const world = lastGoodWorldPosRef.current || { x: 0, y: 0 }
  const { sx: screenX, sy: screenY } = worldToScreen({ transform: placementTransform, x: world.x, y: world.y })
  const portEnabled = Boolean(args.schemaRef.current?.behavior?.portHandles?.enabled) || frontmatterManagedNode
  const portMetrics = readPortHandleUiMetrics(args.schemaRef.current || null, { zoomK })
  const portExtraPadScreenPx = portEnabled ? Math.max(0, portMetrics.railWidthPx + 8) : 0
  anchoredPosRef.current = {
    top: screenY - 12,
    left: screenX + DEFAULT_FLOW_NODE_WIDTH_PX * zoomK + 16 + portExtraPadScreenPx,
  }

  const dragOverride = pinnedDragOverrideRef.current
  const worldDragOverride = worldDragOverrideRef.current
  const storyboardPinnedCardLayoutActive = !floatingRef.current && String(storyboardWidgetSurfaceId || '').trim() === 'storyboard'
  if (!storyboardPinnedCardLayoutActive) {
    storyboardPinnedZoomLayoutBaseRef.current = null
    lastStoryboardPinnedTransformRef.current = null
  }
  const currentStoredWorld = readStoredWidgetWorldPos()
  if (currentStoredWorld) widgetWorldPosRef.current = currentStoredWorld
  const currentStoredWorldForPlacement = floatingUsesScreenAuthority ? null : currentStoredWorld
  const storedWorld = currentStoredWorldForPlacement || (floatingUsesScreenAuthority ? null : widgetWorldPosRef.current)
  const storedWorldScreen = storedWorld ? worldToScreen({ transform: placementTransform, x: storedWorld.x, y: storedWorld.y }) : null
  const usableFloatingScreenPos = (() => {
    if (floatingUsesScreenAuthority || currentStoredWorld || widgetWorldPosRef.current || worldDragOverride || dragOverride) return null
    const top = typeof widgetPos?.top === 'number' && Number.isFinite(widgetPos.top) ? widgetPos.top : null
    const left = typeof widgetPos?.left === 'number' && Number.isFinite(widgetPos.left) ? widgetPos.left : null
    if (top == null || left == null) return null
    if (left < -scaled.width * 0.5 || left > viewportW - 8) return null
    if (top < -scaled.height * 0.5 || top > viewportH - 8) return null
    return { top, left }
  })()
  const frontmatterBaseFarOffscreen = frontmatterManagedNode && storedWorldScreen && (
    storedWorldScreen.sx < -scaled.width * 2
    || storedWorldScreen.sy < -scaled.height * 2
    || storedWorldScreen.sx > viewportW + scaled.width * 2
    || storedWorldScreen.sy > viewportH + scaled.height * 2
  )
  const effectiveStoredWorld = frontmatterBaseFarOffscreen ? null : storedWorld
  const defaultWorld = screenToWorld({
    transform: placementTransform,
    sx: anchoredPosRef.current.left + autoStackOffset.left,
    sy: anchoredPosRef.current.top + autoStackOffset.top,
  })
  const worldPinnedTopLeft = worldDragOverride || (storyboardPinnedCardLayoutActive ? world : effectiveStoredWorld || defaultWorld)
  const worldPinned = effectiveRichMediaFrameSize
    ? { x: worldPinnedTopLeft.x + frameWidth / 2, y: worldPinnedTopLeft.y + frameHeight / 2 }
    : worldPinnedTopLeft
  const storyboardPaintScale = computeBoundedOverlayPaintScale(zoomK)
  const worldPinnedScreen = worldToScreen({ transform: placementTransform, x: worldPinnedTopLeft.x, y: worldPinnedTopLeft.y })
  const storyboardPinnedRawScreenBox = storyboardPinnedCardLayoutActive
    ? computeStoryboardWidgetOverlayScreenBox({
        transform: placementTransform,
        centerWorld: worldPinned,
        paintScale: storyboardPaintScale,
        width: frameWidth,
        height: frameHeight,
      })
    : null
  const explicitPinnedWorld = worldDragOverride || effectiveStoredWorld
  if (storyboardPinnedRawScreenBox && explicitPinnedWorld) {
    // Captured and dragged placements store the frame top-left, not its center.
    const screen = worldToScreen({ transform: placementTransform, x: explicitPinnedWorld.x, y: explicitPinnedWorld.y })
    storyboardPinnedRawScreenBox.left = screen.sx
    storyboardPinnedRawScreenBox.top = screen.sy
  }
  const storyboardPinnedScreenBox = storyboardPinnedRawScreenBox
    ? (() => {
        const projected = projectVectorPaintedOverlayZoomBox({
          previousBox: lastAppliedRef.current,
          baseBox: storyboardPinnedZoomLayoutBaseRef.current,
          previousTransform: lastStoryboardPinnedTransformRef.current,
          currentTransform: placementTransform,
          rawBox: storyboardPinnedRawScreenBox,
          anchorX: viewportW / 2,
          anchorY: viewportH / 2,
          width: frameWidth,
          height: frameHeight,
        })
        storyboardPinnedZoomLayoutBaseRef.current = projected.baseBox
        return projected.box
      })()
    : null
  const floatingWorld = worldDragOverride || effectiveStoredWorld
  const floatingWorldScreen = floatingWorld ? worldToScreen({ transform: placementTransform, x: floatingWorld.x, y: floatingWorld.y }) : null
  const richMediaAuthoritativeScreenBase = effectiveRichMediaFrameSize && hasAuthoritativeNodeWorldPos
    ? { top: screenY + frameHeight * (1 - panelScale) / 2, left: screenX + frameWidth * (1 - panelScale) / 2 }
    : { top: screenY, left: screenX }
  const richMediaAuthoritativeTopLeftScreenBase = effectiveRichMediaFrameSize && hasAuthoritativeNodeWorldPos
    ? { top: screenY, left: screenX }
    : richMediaAuthoritativeScreenBase
  const useFrontmatterInitialBalancedBase = frontmatterManagedNode && floatingUsesScreenAuthority && !hasAuthoritativeNodeWorldPos && !lastAppliedRef.current
  const frontmatterScreenAuthorityBase = (() => {
    const layoutBase = screenAuthorityLayoutZoomBaseRef.current
    if (floatingUsesScreenAuthority && layoutBase) return { top: layoutBase.top, left: layoutBase.left }
    const applied = lastAppliedRef.current
    if (!floatingUsesScreenAuthority || !applied) return { top: pinnedTopPx, left: pinnedLeftPx }
    if (!frontmatterManagedNode || !frontmatterBalancedFallbackPos) return { top: applied.top, left: applied.left }
    const intersectsVisibleViewport =
      applied.left + scaled.width > screenAuthorityViewportLeft
      && applied.left < screenAuthorityViewportRight
      && applied.top + scaled.height > screenAuthorityViewportTop
      && applied.top < screenAuthorityViewportBottom
    return intersectsVisibleViewport ? { top: applied.top, left: applied.left } : frontmatterBalancedFallbackPos
  })()
  const screenAuthorityHandoffPos = floatingUsesScreenAuthority && floatingRef.current ? screenAuthorityHandoffPosRef.current : null
  const basePos = dragOverride
    ? { top: dragOverride.top, left: dragOverride.left }
    : floatingRef.current
      ? (screenAuthorityHandoffPos
          ? { top: screenAuthorityHandoffPos.top, left: screenAuthorityHandoffPos.left }
          : floatingWorldScreen
            ? { top: floatingWorldScreen.sy, left: floatingWorldScreen.sx }
            : floatingUsesScreenAuthority
              ? (hasAuthoritativeNodeWorldPos
                  ? richMediaAuthoritativeTopLeftScreenBase
                  : useFrontmatterInitialBalancedBase && frontmatterBalancedFallbackPos
                    ? frontmatterBalancedFallbackPos
                    : frontmatterScreenAuthorityBase)
              : usableFloatingScreenPos
                ? usableFloatingScreenPos
                : { top: worldPinnedScreen.sy, left: worldPinnedScreen.sx })
      : storyboardPinnedScreenBox
        ? { top: storyboardPinnedScreenBox.top, left: storyboardPinnedScreenBox.left }
        : { top: worldPinnedScreen.sy, left: worldPinnedScreen.sx }
  const safeBasePos = { top: Number.isFinite(basePos.top) ? basePos.top : 8, left: Number.isFinite(basePos.left) ? basePos.left : 8 }
  const floatingScreenAuthorityScale = floatingRef.current && floatingUsesScreenAuthority && !frontmatterManagedNode
    ? screenAuthorityHandoffPos?.scale ?? lastAppliedRef.current?.scale
    : null
  const effectivePanelScale = storyboardPinnedScreenBox?.scale ?? panelScale
  const appliedPanelScale = floatingScreenAuthorityScale ?? effectivePanelScale
  const effectiveScaled = effectiveRichMediaFrameSize
    ? { width: effectiveRichMediaFrameSize.width * appliedPanelScale, height: effectiveRichMediaFrameSize.height * appliedPanelScale }
    : computeWidgetScaledSize(appliedPanelScale)
  scaledSizeRef.current = effectiveScaled
  const screenAuthorityZoomLayoutActive = frontmatterManagedNode
    && floatingRef.current
    && floatingUsesScreenAuthority
    && !(effectiveRichMediaFrameSize && hasAuthoritativeNodeWorldPos)
  const posBase = (() => {
    if (!screenAuthorityZoomLayoutActive) {
      screenAuthorityLayoutZoomBaseRef.current = null
      return safeBasePos
    }
    const shouldResetBase = !!dragOverride
      || !screenAuthorityLayoutZoomBaseRef.current
      || !Number.isFinite(screenAuthorityLayoutZoomBaseRef.current.scale)
      || screenAuthorityLayoutZoomBaseRef.current.scale <= 0
    if (shouldResetBase) screenAuthorityLayoutZoomBaseRef.current = { left: safeBasePos.left, top: safeBasePos.top, scale: effectivePanelScale }
    const base = screenAuthorityLayoutZoomBaseRef.current
    if (!base || dragOverride) return safeBasePos
    return projectCollectiveScreenLayoutForZoom({
      base,
      scale: effectivePanelScale,
      anchorX: screenAuthorityViewportLeft + screenAuthorityViewportWidth / 2,
      anchorY: screenAuthorityViewportTop + screenAuthorityViewportHeight / 2,
      baseWidth: WIDGET_BASE_SIZE.width,
      baseHeight: WIDGET_BASE_SIZE.height,
    })
  })()
  const posBaseForViewport = (() => {
    if (floatingRef.current || dragOverride || (frontmatterManagedNode && effectiveStoredWorld)) return posBase
    const aabb = getLiveContainmentGroupAabbForNode?.(nodeId)
    if (!aabb) return posBase
    const a = worldToScreen({ transform: placementTransform, x: aabb.minX, y: aabb.minY })
    const b = worldToScreen({ transform: placementTransform, x: aabb.maxX, y: aabb.maxY })
    const left0 = Math.min(a.sx, b.sx)
    const right0 = Math.max(a.sx, b.sx)
    const top0 = Math.min(a.sy, b.sy)
    const bottom0 = Math.max(a.sy, b.sy)
    if (!Number.isFinite(left0) || !Number.isFinite(right0) || !Number.isFinite(top0) || !Number.isFinite(bottom0)) return posBase
    const minLeft = left0 + 8
    const minTop = top0 + 8
    const maxLeft = Math.max(minLeft, right0 - 8 - effectiveScaled.width)
    const maxTop = Math.max(minTop, bottom0 - 8 - effectiveScaled.height)
    const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))
    return { left: clamp(posBase.left, minLeft, maxLeft), top: clamp(posBase.top, minTop, maxTop) }
  })()
  const pos = posBaseForViewport
  const updateToolbarLayout = opts?.updateToolbarLayout !== false
  const nextToolbarDock = pos.top >= WIDGET_ACTIONS_TOOLBAR_CLEARANCE_PX ? 'above' : 'below'
  if (updateToolbarLayout) setToolbarDock(prev => (prev === nextToolbarDock ? prev : nextToolbarDock))
  const safeEffectivePanelScale = Number.isFinite(appliedPanelScale) && appliedPanelScale > 0 ? appliedPanelScale : 1
  const toolbarViewportLeft = frontmatterVisibleViewportAuthority ? screenAuthorityViewportLeft : 0
  const toolbarViewportRight = frontmatterVisibleViewportAuthority ? screenAuthorityViewportRight : viewportW
  const toolbarViewportWidth = Math.max(1, toolbarViewportRight - toolbarViewportLeft)
  const toolbarMaxScreenWidth = Math.max(
    1,
    Math.min(
      WIDGET_ACTIONS_TOOLBAR_MAX_WIDTH_PX * safeEffectivePanelScale,
      Math.max(1, toolbarViewportWidth - WIDGET_ACTIONS_TOOLBAR_VIEWPORT_MARGIN_PX * 2),
    ),
  )
  const toolbarShiftScreenPx = computeViewportSafeInlineCenterShiftPx({
    anchorCenterPx: pos.left + effectiveScaled.width / 2 - toolbarViewportLeft,
    elementWidthPx: toolbarMaxScreenWidth,
    viewportWidthPx: toolbarViewportWidth,
    marginPx: WIDGET_ACTIONS_TOOLBAR_VIEWPORT_MARGIN_PX,
  })
  const nextToolbarInlineShiftPx = toolbarShiftScreenPx / safeEffectivePanelScale
  if (updateToolbarLayout) setToolbarInlineShiftPx(prev => (Math.abs(prev - nextToolbarInlineShiftPx) <= 0.001 ? prev : nextToolbarInlineShiftPx))
  const nextToolbarMaxWidthPx = toolbarMaxScreenWidth / safeEffectivePanelScale
  if (updateToolbarLayout) setToolbarMaxWidthPx(prev => (Math.abs(prev - nextToolbarMaxWidthPx) <= 0.001 ? prev : nextToolbarMaxWidthPx))
  const offset = canvasWindowOffsetRef.current
  const offsetLeft = Number.isFinite(offset.left) ? offset.left : 0
  const offsetTop = Number.isFinite(offset.top) ? offset.top : 0
  const tx = pos.left + offsetLeft
  const ty = pos.top + offsetTop
  const last = lastAppliedRef.current
  if (last && last.left === pos.left && last.top === pos.top && last.offsetLeft === offsetLeft && last.offsetTop === offsetTop && Math.abs(last.scale - appliedPanelScale) < 1e-6 && Math.abs(last.zoomK - zoomK) < 1e-6) return
  lastAppliedRef.current = { left: pos.left, top: pos.top, scale: appliedPanelScale, zoomK, offsetLeft, offsetTop }
  if (storyboardPinnedCardLayoutActive) lastStoryboardPinnedTransformRef.current = { k: placementTransform.k, x: placementTransform.x, y: placementTransform.y }
  applyVectorPaintedOverlayBox(el, {
    left: tx,
    top: ty,
    scale: appliedPanelScale,
    width: frameWidth,
    height: frameHeight,
    positionMode: 'matrix',
  })
  if (floatingRef.current && !floatingUsesScreenAuthority && !currentStoredWorld && !widgetWorldPosRef.current && !worldDragOverride && !dragOverride) {
    const seedWorld = usableFloatingScreenPos
      ? screenToWorld({ transform: placementTransform, sx: usableFloatingScreenPos.left, sy: usableFloatingScreenPos.top })
      : worldPinnedTopLeft
    widgetWorldPosRef.current = seedWorld
    lastGoodWorldPosRef.current = seedWorld
    persistWorldPos(seedWorld)
  }
  if (opts?.emitInteractionFrame !== false) {
    if (updateToolbarLayout) emitStoryboardWidgetInteractionFrame()
    else emitStoryboardWidgetInteractionFrame({ updateToolbarLayout: false })
  }
}
