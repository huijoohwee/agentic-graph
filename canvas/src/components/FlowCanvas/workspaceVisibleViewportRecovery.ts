import { buildScopedGraphSemanticKey } from '@/lib/graph/semanticKey'
import { measureLayoutRectSet } from '@/lib/canvas/layoutCentroid'
import { layoutRectSetCentroidWithinViewport } from '@/lib/canvas/graph-elements/centroid'

export const STORYBOARD_WIDGET_WORKSPACE_RECOVERY_MAX_VISUAL_SCALE = 24

export type FlowOverlayBounds = {
  minX: number
  maxX: number
  minY: number
  maxY: number
  width: number
  height: number
  ids?: string[]
}

export type VisibleFlowViewport = {
  left: number
  top: number
  right: number
  bottom: number
  width: number
  height: number
  centerX: number
  centerY: number
}

export type FlowTransformLike = {
  x: number
  y: number
  k: number
}

export type FlowOverlayCollectiveViewportState = {
  visible: boolean
  centered: boolean
  balanced: boolean
  offscreen: boolean
  fitsVisibleViewport: boolean
}

const normalizeFlowOverlayCollectiveIds = (ids: readonly string[]): string[] =>
  Array.from(new Set(
    ids.map(id => String(id || '').trim()).filter(Boolean),
  )).sort((leftId, rightId) => leftId.localeCompare(rightId))

export function buildFlowOverlayCollectiveTopologyKey(args: {
  zoomViewKey: string
  layoutSignature: string
  ids: readonly string[]
}): string {
  return buildScopedGraphSemanticKey('flow-overlay-collective-topology', {
    graphSemanticKey: [
      String(args.zoomViewKey || '').trim(),
      String(args.layoutSignature || '').trim(),
      normalizeFlowOverlayCollectiveIds(args.ids).join(','),
    ].join('|'),
  })
}

export function hasFlowOverlayCollectiveTopologyChanged(args: {
  previousIds: readonly string[]
  currentIds: readonly string[]
}): boolean {
  const previousIds = normalizeFlowOverlayCollectiveIds(args.previousIds)
  const currentIds = normalizeFlowOverlayCollectiveIds(args.currentIds)
  if (previousIds.length === 0 || currentIds.length === 0) return false
  if (previousIds.length !== currentIds.length) return true
  return previousIds.some((id, index) => id !== currentIds[index])
}

export function shouldRecoverFlowOverlayCollectiveAfterTopologyChange(args: {
  topologyChanged: boolean
  viewportState: FlowOverlayCollectiveViewportState | null
}): boolean {
  return args.topologyChanged && args.viewportState?.offscreen === true
}

export function shouldPreserveEstablishedWorkspaceOverlayCamera(args: {
  initializedForView: boolean
  workspaceEditorOverlayOpen: boolean
  workspaceOverlayStabilized: boolean
}): boolean {
  return args.workspaceEditorOverlayOpen
    && (args.initializedForView || args.workspaceOverlayStabilized)
}

const roundViewportPart = (value: number): number =>
  Number.isFinite(value) ? Math.round(value) : 0

export function buildFlowOverlayBoundsFromRects(args: {
  items: Array<{
    id?: string
    left: number
    top: number
    right?: number
    bottom?: number
    width?: number
    height?: number
  }>
}): FlowOverlayBounds | null {
  const items = Array.isArray(args.items) ? args.items : []
  let minX = Number.POSITIVE_INFINITY
  let minY = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let maxY = Number.NEGATIVE_INFINITY
  const ids: string[] = []
  for (let i = 0; i < items.length; i += 1) {
    const item = items[i]
    if (!item) continue
    const left = Number.isFinite(item.left) ? item.left : null
    const top = Number.isFinite(item.top) ? item.top : null
    const right = Number.isFinite(item.right)
      ? item.right as number
      : (left == null || !Number.isFinite(item.width) ? null : left + Math.max(1, Number(item.width)))
    const bottom = Number.isFinite(item.bottom)
      ? item.bottom as number
      : (top == null || !Number.isFinite(item.height) ? null : top + Math.max(1, Number(item.height)))
    if (left == null || top == null || right == null || bottom == null) continue
    if (!(right > left) || !(bottom > top)) continue
    minX = Math.min(minX, left)
    minY = Math.min(minY, top)
    maxX = Math.max(maxX, right)
    maxY = Math.max(maxY, bottom)
    const id = String(item.id || '').trim()
    if (id) ids.push(id)
  }
  if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) return null
  return {
    minX,
    maxX,
    minY,
    maxY,
    width: Math.max(1, maxX - minX),
    height: Math.max(1, maxY - minY),
    ids: ids.length > 0 ? ids : undefined,
  }
}

export function deriveFlowOverlayCollectiveViewportState(args: {
  bounds: FlowOverlayBounds | null
  visibleViewport: VisibleFlowViewport
}): FlowOverlayCollectiveViewportState | null {
  const bounds = args.bounds
  if (!bounds) return null
  const visibleViewport = args.visibleViewport
  const marginX = Math.max(24, visibleViewport.width * 0.08)
  const marginY = Math.max(24, visibleViewport.height * 0.08)
  const offscreen =
    bounds.maxX <= visibleViewport.left - marginX
    || bounds.maxY <= visibleViewport.top - marginY
    || bounds.minX >= visibleViewport.right + marginX
    || bounds.minY >= visibleViewport.bottom + marginY
  const visible =
    bounds.maxX > visibleViewport.left
    && bounds.maxY > visibleViewport.top
    && bounds.minX < visibleViewport.right
    && bounds.minY < visibleViewport.bottom
  const spanW = Math.max(1, bounds.width)
  const spanH = Math.max(1, bounds.height)
  const spanAspect = spanW / spanH
  const fitsVisibleViewport =
    spanW <= visibleViewport.width * 1.4
    && spanH <= visibleViewport.height * 1.4
  const metrics = measureLayoutRectSet([{
    left: bounds.minX,
    top: bounds.minY,
    width: spanW,
    height: spanH,
  }])
  const centered =
    fitsVisibleViewport
    && layoutRectSetCentroidWithinViewport({
      metrics,
      viewportW: visibleViewport.width,
      viewportH: visibleViewport.height,
      viewportCenterX: visibleViewport.centerX,
      viewportCenterY: visibleViewport.centerY,
      toleranceXRatio: 0.2,
      toleranceYRatio: 0.24,
    })
  const balanced = centered && fitsVisibleViewport && spanAspect >= 0.18 && spanAspect <= 6
  return { visible, centered, balanced, offscreen, fitsVisibleViewport }
}

export function buildWorkspaceVisibleViewportFitRecoveryKey(args: {
  zoomViewKey: string
  visibleViewport: Pick<VisibleFlowViewport, 'left' | 'top' | 'width' | 'height'>
  overlayBounds: Pick<FlowOverlayBounds, 'ids'> & Partial<Pick<FlowOverlayBounds, 'minX' | 'maxX' | 'minY' | 'maxY' | 'width' | 'height'>>
}): string {
  const idsKey = Array.isArray(args.overlayBounds.ids)
    ? args.overlayBounds.ids.map(id => String(id || '').trim()).filter(Boolean).sort((a, b) => a.localeCompare(b)).join(',')
    : ''
  const boundsKey = [
    `minX=${roundViewportPart(args.overlayBounds.minX ?? 0)}`,
    `maxX=${roundViewportPart(args.overlayBounds.maxX ?? 0)}`,
    `minY=${roundViewportPart(args.overlayBounds.minY ?? 0)}`,
    `maxY=${roundViewportPart(args.overlayBounds.maxY ?? 0)}`,
    `width=${roundViewportPart(args.overlayBounds.width ?? 0)}`,
    `height=${roundViewportPart(args.overlayBounds.height ?? 0)}`,
  ].join('|')
  return buildScopedGraphSemanticKey('storyboard-widget-workspace-visible-viewport-fit', {
    graphSemanticKey: [
      String(args.zoomViewKey || '').trim(),
      `left=${roundViewportPart(args.visibleViewport.left)}`,
      `top=${roundViewportPart(args.visibleViewport.top)}`,
      `width=${roundViewportPart(args.visibleViewport.width)}`,
      `height=${roundViewportPart(args.visibleViewport.height)}`,
      boundsKey,
      idsKey,
    ].join('|'),
  })
}

export function computeWorkspaceOverlayVisibleViewportFitTransform(args: {
  current: FlowTransformLike
  overlayBounds: FlowOverlayBounds
  visibleViewport: Pick<VisibleFlowViewport, 'width' | 'height' | 'centerX' | 'centerY'>
  scaleExtent?: [number, number]
  maxVisualScale?: number
}): FlowTransformLike | null {
  const { current, overlayBounds, visibleViewport } = args
  if (!Number.isFinite(overlayBounds.width) || !Number.isFinite(overlayBounds.height)) return null
  const maxVisualScale = Number.isFinite(args.maxVisualScale)
    ? Math.max(0.000001, Number(args.maxVisualScale))
    : STORYBOARD_WIDGET_WORKSPACE_RECOVERY_MAX_VISUAL_SCALE
  const scaleExtent = args.scaleExtent || [0.000001, maxVisualScale]
  const minK = Math.min(scaleExtent[0], 0.000001)
  const maxK = Math.max(minK, Math.min(scaleExtent[1], maxVisualScale))
  const safeBaseK = Number.isFinite(current.k) && current.k > 0 ? current.k : 1
  const fitScaleBy = Math.min(
    Math.max(0.000001, Number(visibleViewport.width) || 1) / Math.max(1, overlayBounds.width),
    Math.max(0.000001, Number(visibleViewport.height) || 1) / Math.max(1, overlayBounds.height),
  )
  const safeFitScaleBy = Number.isFinite(fitScaleBy) && fitScaleBy > 0 ? Math.min(1, fitScaleBy) : 1
  const targetK = Math.max(minK, Math.min(maxK, safeBaseK * safeFitScaleBy))
  const appliedScale = targetK / safeBaseK
  const centerX = (overlayBounds.minX + overlayBounds.maxX) / 2
  const centerY = (overlayBounds.minY + overlayBounds.maxY) / 2
  if (!Number.isFinite(centerX) || !Number.isFinite(centerY)) return null
  return {
    x: visibleViewport.centerX - (centerX - current.x) * appliedScale,
    y: visibleViewport.centerY - (centerY - current.y) * appliedScale,
    k: targetK,
  }
}
