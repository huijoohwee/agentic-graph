import { worldToScreen } from '@/lib/zoom/viewport'
import { projectCollectiveScreenLayoutForZoom } from '@/lib/canvas/overlayWidgetZoom'

export type VectorPaintedOverlayPoint = {
  x: number
  y: number
}

export type VectorPaintedOverlayTransform = {
  k: number
  x: number
  y: number
}

export type VectorPaintedOverlayScreenBox = {
  left: number
  top: number
  scale: number
}

export type VectorPaintedOverlayPositionMode = 'vectorPainted' | 'matrix'

export type VectorPaintedOverlayScaleProjectionBase = {
  left: number
  top: number
  scale: number
  layoutScale?: number
}

export type VectorPaintedOverlayZoomProjectionResult = {
  box: VectorPaintedOverlayScreenBox
  baseBox: VectorPaintedOverlayScaleProjectionBase
}

export function snapOverlayCoordinateToDevicePixel(value: number, devicePixelRatio?: number): number {
  if (!Number.isFinite(value)) return 0
  const ratio = Number.isFinite(devicePixelRatio) ? Math.max(1, Number(devicePixelRatio)) : 1
  return Math.round(value * ratio) / ratio
}

export function computeVectorPaintedOverlayScreenBox(args: {
  transform: VectorPaintedOverlayTransform | null
  centerWorld: VectorPaintedOverlayPoint
  devicePixelRatio?: number
  paintScale?: number
  snapToDevicePixels?: boolean
  width: number
  height: number
}): VectorPaintedOverlayScreenBox {
  const width = Number.isFinite(args.width) ? Math.max(1, args.width) : 1
  const height = Number.isFinite(args.height) ? Math.max(1, args.height) : 1
  const centerX = Number.isFinite(args.centerWorld.x) ? args.centerWorld.x : 0
  const centerY = Number.isFinite(args.centerWorld.y) ? args.centerWorld.y : 0
  const center = worldToScreen({
    transform: args.transform,
    x: centerX,
    y: centerY,
  })
  const scale = Number.isFinite(args.paintScale)
    ? Math.max(0.001, Number(args.paintScale))
    : args.transform && Number.isFinite(args.transform.k) ? Math.max(0.001, args.transform.k) : 1
  const left = center.sx - width * scale / 2
  const top = center.sy - height * scale / 2
  const shouldSnap = args.snapToDevicePixels === true
  return {
    left: shouldSnap ? snapOverlayCoordinateToDevicePixel(left, args.devicePixelRatio) : left,
    top: shouldSnap ? snapOverlayCoordinateToDevicePixel(top, args.devicePixelRatio) : top,
    scale,
  }
}

export function projectVectorPaintedOverlayScaleBox(args: {
  anchorX: number
  anchorY: number
  baseBox?: VectorPaintedOverlayScaleProjectionBase | null
  height: number
  layoutScale?: number
  previousBox: VectorPaintedOverlayScaleProjectionBase
  scale: number
  width: number
}): VectorPaintedOverlayScreenBox {
  const base = args.baseBox || args.previousBox
  const scale = Number.isFinite(args.scale) && args.scale > 0 ? args.scale : base.scale
  const baseLayoutScale = Number.isFinite(base.layoutScale) && Number(base.layoutScale) > 0 ? Number(base.layoutScale) : base.scale
  const layoutScale = Number.isFinite(args.layoutScale) && Number(args.layoutScale) > 0 ? Number(args.layoutScale) : scale
  const projected = projectCollectiveScreenLayoutForZoom({
    base,
    scale,
    baseLayoutScale,
    layoutScale,
    anchorX: args.anchorX,
    anchorY: args.anchorY,
    baseWidth: args.width,
    baseHeight: args.height,
  })
  return {
    left: projected.left,
    top: projected.top,
    scale,
  }
}

export function isSameVectorPaintedOverlayTransform(
  a: VectorPaintedOverlayTransform | null,
  b: VectorPaintedOverlayTransform | null,
): boolean {
  if (!a || !b) return a === b
  return Math.abs(a.k - b.k) < 1e-6 && Math.abs(a.x - b.x) < 1e-6 && Math.abs(a.y - b.y) < 1e-6
}

function projectRawScreenBoxToPaintedLayout(args: {
  anchorX: number
  anchorY: number
  height: number
  layoutScale: number
  rawBox: VectorPaintedOverlayScreenBox
  width: number
}): VectorPaintedOverlayScreenBox {
  const paintScale = Number.isFinite(args.rawBox.scale) && args.rawBox.scale > 0 ? args.rawBox.scale : 1
  const layoutScale = Number.isFinite(args.layoutScale) && args.layoutScale > 0 ? args.layoutScale : paintScale
  if (Math.abs(layoutScale - paintScale) < 0.000001) return args.rawBox
  const width = Math.max(1, Number(args.width) || 1)
  const height = Math.max(1, Number(args.height) || 1)
  const rawCenterX = args.rawBox.left + width * paintScale / 2
  const rawCenterY = args.rawBox.top + height * paintScale / 2
  const ratio = paintScale / Math.max(0.001, layoutScale)
  const anchorX = Number.isFinite(args.anchorX) ? args.anchorX : 0
  const anchorY = Number.isFinite(args.anchorY) ? args.anchorY : 0
  const centerX = anchorX + (rawCenterX - anchorX) * ratio
  const centerY = anchorY + (rawCenterY - anchorY) * ratio
  return {
    left: centerX - width * paintScale / 2,
    top: centerY - height * paintScale / 2,
    scale: paintScale,
  }
}

export function projectVectorPaintedOverlayZoomBox(args: {
  anchorX: number
  anchorY: number
  baseBox?: VectorPaintedOverlayScaleProjectionBase | null
  currentTransform: VectorPaintedOverlayTransform | null
  height: number
  previousBox?: VectorPaintedOverlayScaleProjectionBase | null
  previousTransform: VectorPaintedOverlayTransform | null
  rawBox: VectorPaintedOverlayScreenBox
  width: number
}): VectorPaintedOverlayZoomProjectionResult {
  const layoutScale = args.currentTransform && Number.isFinite(args.currentTransform.k) && args.currentTransform.k > 0 ? args.currentTransform.k : 1
  const normalizedRawBox = projectRawScreenBoxToPaintedLayout({
    rawBox: args.rawBox,
    layoutScale,
    anchorX: args.anchorX,
    anchorY: args.anchorY,
    width: args.width,
    height: args.height,
  })
  const previousBox = args.previousBox || null
  const fallbackBase = {
    left: normalizedRawBox.left,
    top: normalizedRawBox.top,
    scale: normalizedRawBox.scale,
    layoutScale: normalizedRawBox.scale,
  }
  if (previousBox && isSameVectorPaintedOverlayTransform(args.previousTransform, args.currentTransform)) {
    return { box: { left: previousBox.left, top: previousBox.top, scale: previousBox.scale }, baseBox: args.baseBox || fallbackBase }
  }
  return { box: normalizedRawBox, baseBox: fallbackBase }
}

export function readVectorPaintedOverlayScale(el: HTMLElement): number {
  const matrix = String(el.style.transform || '').match(
    /^matrix\(\s*([-\d.]+)\s*,\s*[-\d.]+\s*,\s*[-\d.]+\s*,\s*([-\d.]+)\s*,\s*[-\d.]+\s*,\s*[-\d.]+\s*\)$/,
  )
  if (matrix) {
    const scaleX = Number(matrix[1])
    const scaleY = Number(matrix[2])
    const scale = Number.isFinite(scaleX) && scaleX > 0 ? scaleX : scaleY
    if (Number.isFinite(scale) && scale > 0) return Math.max(0.001, scale)
  }
  const raw = String((el.style as CSSStyleDeclaration & { zoom?: string }).zoom || '').trim()
  const scale = Number(raw)
  return Number.isFinite(scale) && scale > 0 ? Math.max(0.001, scale) : 1
}

export function readVectorPaintedOverlayPosition(el: HTMLElement): { left: number; top: number } | null {
  const matrix = String(el.style.transform || '').match(
    /^matrix\(\s*[-\d.]+\s*,\s*[-\d.]+\s*,\s*[-\d.]+\s*,\s*[-\d.]+\s*,\s*([-\d.]+)\s*,\s*([-\d.]+)\s*\)$/,
  )
  if (matrix) {
    const left = Number(matrix[1])
    const top = Number(matrix[2])
    if (Number.isFinite(left) && Number.isFinite(top)) return { left, top }
  }
  const left = Number.parseFloat(String(el.style.left || ''))
  const top = Number.parseFloat(String(el.style.top || ''))
  if (Number.isFinite(left) && Number.isFinite(top)) {
    const scale = readVectorPaintedOverlayScale(el)
    return { left: left * scale, top: top * scale }
  }
  const rect = el.getBoundingClientRect()
  if (!Number.isFinite(rect.left) || !Number.isFinite(rect.top)) return null
  return { left: rect.left, top: rect.top }
}

export function isParentOwnedOverlayPlacement(el: HTMLElement): boolean {
  return el.dataset?.kgOverlayPlacementOwner === 'parent'
}

export function applyVectorPaintedOverlayBox(el: HTMLElement, args: {
  left: number
  top: number
  scale?: number
  width?: number
  height?: number
  display?: string
  zIndex?: string
  positionMode?: VectorPaintedOverlayPositionMode
}): void {
  if (isParentOwnedOverlayPlacement(el)) return
  const left = Number.isFinite(args.left) ? args.left : 0
  const top = Number.isFinite(args.top) ? args.top : 0
  const scale = Number.isFinite(args.scale) && Number(args.scale) > 0 ? Math.max(0.001, Number(args.scale)) : 1
  const zoomStyle = el.style as CSSStyleDeclaration & { zoom: string }
  const positionMode = args.positionMode === 'matrix' ? 'matrix' : 'vectorPainted'

  if (args.display != null && el.style.display !== args.display) el.style.display = args.display
  if (args.zIndex != null && el.style.zIndex !== args.zIndex) el.style.zIndex = args.zIndex
  if (args.width != null && Number.isFinite(args.width)) {
    const width = `${Math.max(1, Number(args.width))}px`
    if (el.style.width !== width) el.style.width = width
  }
  if (args.height != null && Number.isFinite(args.height)) {
    const height = `${Math.max(1, Number(args.height))}px`
    if (el.style.height !== height) el.style.height = height
  }

  if (el.style.transformOrigin !== 'top left') el.style.transformOrigin = 'top left'
  if (positionMode === 'matrix') {
    const nextTransform = `matrix(${scale}, 0, 0, ${scale}, ${left}, ${top})`
    if (el.style.left !== '0px') el.style.left = '0px'
    if (el.style.top !== '0px') el.style.top = '0px'
    if (el.style.transform !== nextTransform) el.style.transform = nextTransform
    if (zoomStyle.zoom !== '1') zoomStyle.zoom = '1'
  } else {
    const leftPx = `${left / scale}px`
    const topPx = `${top / scale}px`
    const zoom = String(scale)
    if (el.style.left !== leftPx) el.style.left = leftPx
    if (el.style.top !== topPx) el.style.top = topPx
    if (el.style.transform !== 'none') el.style.transform = 'none'
    if (zoomStyle.zoom !== zoom) zoomStyle.zoom = zoom
  }
  if (el.style.willChange) el.style.willChange = ''
  try {
    el.dataset.kgVectorPaintedOverlay = '1'
    el.dataset.kgVectorPaintedOverlayMode = positionMode
  } catch {
    void 0
  }
}

export function applyVectorPaintedOverlayPosition(el: HTMLElement, pos: { left: number; top: number }): void {
  if (!Number.isFinite(pos.left) || !Number.isFinite(pos.top)) return
  applyVectorPaintedOverlayBox(el, {
    left: pos.left,
    top: pos.top,
    scale: readVectorPaintedOverlayScale(el),
    positionMode: ((el as HTMLElement & { dataset?: DOMStringMap }).dataset?.kgVectorPaintedOverlayMode === 'matrix')
      ? 'matrix'
      : 'vectorPainted',
  })
}
