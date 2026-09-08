import { resolveCanvasAspectRatioSize } from '@/lib/canvas/canvasAspectRatioDisplayControls'
import { applyVectorPaintedOverlayBox, isParentOwnedOverlayPlacement, type VectorPaintedOverlayPositionMode } from '@/lib/canvas/vectorPaintedOverlayProjection'
import type { MediaPanelDensity } from '@/lib/render/mediaPanelSpec'

export type MediaPanelCssMetrics = {
  headerH: number
  borderW: number
  radius: number
  padding: number
  titleSize: number
}

export type MediaPanelCssVars = Record<string, string>

const VARS_CACHE = new WeakMap<HTMLElement, string>()
const BOX_POS_CACHE = new WeakMap<HTMLElement, string>()
const BOX_SIZE_CACHE = new WeakMap<HTMLElement, string>()

export function computeMediaPanelCssVars2d(args: {
  zoomK: number
  dimsWorld: { headerHeight: number; padding: number; corner: number; borderWidth: number }
}): { metrics: MediaPanelCssMetrics; vars: MediaPanelCssVars } {
  const k = Number.isFinite(args.zoomK) ? Math.max(0.001, Number(args.zoomK)) : 1
  const headerH = Math.max(10, Number(args.dimsWorld.headerHeight) * k)
  const borderW = Math.max(0.5, Number(args.dimsWorld.borderWidth) * k)
  const radius = Math.max(2, Number(args.dimsWorld.corner) * k)
  const padding = Math.max(1, Number(args.dimsWorld.padding) * k)
  const titleSize = Math.max(10, Math.min(40, 10 * k))
  const metrics: MediaPanelCssMetrics = { headerH, borderW, radius, padding, titleSize }
  const vars: MediaPanelCssVars = {
    '--kg-media-panel-header-h': `${headerH}px`,
    '--kg-media-panel-border-w': `${borderW}px`,
    '--kg-media-panel-radius': `${radius}px`,
    '--kg-media-panel-padding': `${padding}px`,
    '--kg-media-panel-title-size': `${titleSize}px`,
  }
  return { metrics, vars }
}

export function computeMediaPanelCssVars3d(args: { density: MediaPanelDensity; sizeScale: number }): { metrics: MediaPanelCssMetrics; vars: MediaPanelCssVars } {
  const s = Number.isFinite(args.sizeScale) ? Math.max(0.001, Number(args.sizeScale)) : 1
  const density = args.density === 'compact' ? 'compact' : 'default'
  const headerBase = density === 'compact' ? 22 : 28
  const paddingBase = density === 'compact' ? 6 : 8
  const radiusBase = density === 'compact' ? 9 : 10
  const borderBase = 1
  const titleBase = density === 'compact' ? 11 : 12
  const headerH = Math.max(14, Math.round(headerBase * s))
  const padding = Math.max(2, Math.round(paddingBase * s))
  const radius = Math.max(3, Math.round(radiusBase * s))
  const borderW = Math.max(1, Math.round(borderBase * s))
  const titleSize = Math.max(10, Math.round(titleBase * s))
  const metrics: MediaPanelCssMetrics = { headerH, borderW, radius, padding, titleSize }
  const vars: MediaPanelCssVars = {
    '--kg-media-panel-header-h': `${headerH}px`,
    '--kg-media-panel-border-w': `${borderW}px`,
    '--kg-media-panel-radius': `${radius}px`,
    '--kg-media-panel-padding': `${padding}px`,
    '--kg-media-panel-title-size': `${titleSize}px`,
  }
  return { metrics, vars }
}

export function computePanelSizeFromContent16x9(args: {
  contentW: number
  metrics: Pick<MediaPanelCssMetrics, 'headerH' | 'padding'> & Partial<Pick<MediaPanelCssMetrics, 'borderW'>>
}): {
  panelW: number
  panelH: number
  contentW: number
  contentH: number
} {
  const contentW = Math.max(2, Number(args.contentW) || 2)
  const contentH = Math.max(2, (contentW * 9) / 16)
  const padding = Math.max(0, Number(args.metrics.padding) || 0)
  const headerH = Math.max(0, Number(args.metrics.headerH) || 0)
  const borderW = Math.max(0, Number((args.metrics as Partial<Pick<MediaPanelCssMetrics, 'borderW'>>).borderW) || 0)
  const panelW = Math.max(2, contentW + padding * 2 + borderW * 2)
  const panelH = Math.max(2, contentH + headerH + padding * 2 + borderW * 2)
  return { panelW, panelH, contentW, contentH }
}

export function computeContentBoxFromPanelFrame16x9(args: {
  panelW: number
  panelH: number
  metrics: Pick<MediaPanelCssMetrics, 'headerH' | 'padding' | 'borderW'>
}): { contentW: number; contentH: number; aspect: number } {
  const panelW = Math.max(2, Number(args.panelW) || 2)
  const panelH = Math.max(2, Number(args.panelH) || 2)
  const padding = Math.max(0, Number(args.metrics.padding) || 0)
  const headerH = Math.max(0, Number(args.metrics.headerH) || 0)
  const borderW = Math.max(0, Number(args.metrics.borderW) || 0)
  const contentW = Math.max(2, panelW - padding * 2 - borderW * 2)
  const contentH = Math.max(2, panelH - headerH - padding * 2 - borderW * 2)
  return {
    contentW,
    contentH,
    aspect: contentW / Math.max(1, contentH),
  }
}

function coerceMediaPanelContentAspect(raw: unknown, fallback = 16 / 9): number {
  const n = typeof raw === 'number' && Number.isFinite(raw) ? raw : Number(raw)
  const f = Number.isFinite(fallback) && fallback > 0 ? fallback : 16 / 9
  return Math.max(0.05, Math.min(20, Number.isFinite(n) && n > 0 ? n : f))
}

export function resolvePanelFrameContentAspect(args: {
  panelW: number
  panelH: number
  metrics: Pick<MediaPanelCssMetrics, 'headerH' | 'padding' | 'borderW'>
  fallbackAspect?: number
}): number {
  const content = computeContentBoxFromPanelFrame16x9({
    panelW: args.panelW,
    panelH: args.panelH,
    metrics: args.metrics,
  })
  return coerceMediaPanelContentAspect(content.aspect, args.fallbackAspect)
}

export function computePanelFrameSizeFromWidthAspect(args: {
  panelW: number
  metrics: Pick<MediaPanelCssMetrics, 'headerH' | 'padding' | 'borderW'>
  aspect?: number
}): { panelW: number; panelH: number; contentW: number; contentH: number } {
  const panelW = Math.max(2, Number(args.panelW) || 2)
  const padding = Math.max(0, Number(args.metrics.padding) || 0)
  const headerH = Math.max(0, Number(args.metrics.headerH) || 0)
  const borderW = Math.max(0, Number(args.metrics.borderW) || 0)
  const aspect = coerceMediaPanelContentAspect(args.aspect)
  const contentW = Math.max(2, panelW - padding * 2 - borderW * 2)
  const contentH = Math.max(2, contentW / aspect)
  const panelH = Math.max(2, contentH + headerH + padding * 2 + borderW * 2)
  return { panelW, panelH, contentW, contentH }
}

export function computePanelFrameSizeFromWidth16x9(args: {
  panelW: number
  metrics: Pick<MediaPanelCssMetrics, 'headerH' | 'padding' | 'borderW'>
}): { panelW: number; panelH: number; contentW: number; contentH: number } {
  return computePanelFrameSizeFromWidthAspect({
    panelW: args.panelW,
    metrics: args.metrics,
    aspect: 16 / 9,
  })
}

export function computePanelFrameSizeFromDensityWidth16x9(args: {
  density: MediaPanelDensity
  panelW: number
  sizeScale?: number
}): { panelW: number; panelH: number; contentW: number; contentH: number; metrics: MediaPanelCssMetrics } {
  const density: MediaPanelDensity = args.density === 'compact' ? 'compact' : 'default'
  const sizeScale = Number.isFinite(args.sizeScale) && Number(args.sizeScale) > 0 ? Number(args.sizeScale) : 1
  const computed = computeMediaPanelCssVars3d({ density, sizeScale })
  const frame = computePanelFrameSizeFromWidth16x9({
    panelW: args.panelW,
    metrics: computed.metrics,
  })
  return { ...frame, metrics: computed.metrics }
}

export function readPanelCssMetricPx(el: HTMLElement | null | undefined, name: string, fallback: number): number {
  if (!el || typeof window === 'undefined' || typeof window.getComputedStyle !== 'function') return fallback
  try {
    const raw = window.getComputedStyle(el).getPropertyValue(name).trim()
    const n = Number.parseFloat(raw)
    return Number.isFinite(n) && n >= 0 ? n : fallback
  } catch {
    return fallback
  }
}

export function readRichMediaPanelFrameMetrics(el: HTMLElement | null | undefined): Pick<MediaPanelCssMetrics, 'headerH' | 'padding' | 'borderW'> {
  return {
    headerH: readPanelCssMetricPx(el, '--kg-media-panel-header-h', 28),
    padding: readPanelCssMetricPx(el, '--kg-media-panel-padding', 8),
    borderW: readPanelCssMetricPx(el, '--kg-media-panel-border-w', 1),
  }
}

export function computePanelFrameResizeFromDrag16x9(args: {
  startW: number
  startH: number
  dxClientPx: number
  dyClientPx: number
  scale?: number
  metrics: Pick<MediaPanelCssMetrics, 'headerH' | 'padding' | 'borderW'>
  minPanelW?: number
  minPanelH?: number
}): { panelW: number; panelH: number; contentW: number; contentH: number } {
  const scale = Number.isFinite(args.scale) && Number(args.scale) > 0 ? Math.max(0.001, Number(args.scale)) : 1
  const startW = Math.max(2, Number(args.startW) || 2)
  const startH = Math.max(2, Number(args.startH) || 2)
  const dx = Number.isFinite(args.dxClientPx) ? Number(args.dxClientPx) : 0
  const dy = Number.isFinite(args.dyClientPx) ? Number(args.dyClientPx) : 0
  const padding = Math.max(0, Number(args.metrics.padding) || 0)
  const borderW = Math.max(0, Number(args.metrics.borderW) || 0)
  const headerH = Math.max(0, Number(args.metrics.headerH) || 0)
  const chromeX = padding * 2 + borderW * 2
  const chromeY = headerH + padding * 2 + borderW * 2
  const minPanelW = Math.max(2, Number(args.minPanelW) || 2)
  const minPanelH = Math.max(2, Number(args.minPanelH) || 2)
  const aspect = resolvePanelFrameContentAspect({
    panelW: startW,
    panelH: startH,
    metrics: args.metrics,
    fallbackAspect: 16 / 9,
  })
  const minWidthFromHeight = Math.max(2, Math.max(2, minPanelH - chromeY) * aspect + chromeX)
  const chosenW = Math.abs(dy) > Math.abs(dx)
    ? Math.max(2, Math.max(2, startH + dy / scale - chromeY) * aspect + chromeX)
    : startW + dx / scale
  const panelW = Math.max(minPanelW, minWidthFromHeight, Math.round(chosenW))
  return computePanelFrameSizeFromWidthAspect({ panelW, metrics: args.metrics, aspect })
}

export function readStableRichMediaPanelSize(props: Record<string, unknown> | null | undefined, aspectRatioMode?: unknown): { w: number; h: number } | null {
  if (!props) return null
  const width = Number(props['visual:width'])
  const height = Number(props['visual:height'])
  if (!Number.isFinite(width) || width <= 0) return null
  if (aspectRatioMode != null) {
    const size = resolveCanvasAspectRatioSize({ defaultWidth: 24, mode: aspectRatioMode, width })
    return { w: Math.max(24, Math.round(size.width)), h: Math.max(24, Math.round(size.height)) }
  }
  if (!Number.isFinite(height) || height <= 0) return null
  return {
    w: Math.max(24, Math.round(width)),
    h: Math.max(24, Math.round(height)),
  }
}

export function computeMediaPanelPixelSize2d(args: { zoomK: number; dimsWorld: { panelWidth: number; panelHeight: number } }): {
  panelW: number
  panelH: number
} {
  const k = Number.isFinite(args.zoomK) ? Math.max(0.001, Number(args.zoomK)) : 1
  const panelW = Math.max(2, Number(args.dimsWorld.panelWidth) * k)
  const panelH = Math.max(2, Number(args.dimsWorld.panelHeight) * k)
  return { panelW, panelH }
}

export function computePanelRect(args: {
  cx: number
  cy: number
  w: number
  h: number
  clamp?: { viewportW: number; viewportH: number; margin: number; left?: number; top?: number }
}): { left: number; top: number; w: number; h: number } {
  const w = Math.max(1, Number(args.w) || 1)
  const h = Math.max(1, Number(args.h) || 1)
  let left = (Number(args.cx) || 0) - w / 2
  let top = (Number(args.cy) || 0) - h / 2
  const clamp = args.clamp || null
  if (clamp) {
    const vw = Math.max(1, Number(clamp.viewportW) || 1)
    const vh = Math.max(1, Number(clamp.viewportH) || 1)
    const m = Math.max(0, Number(clamp.margin) || 0)
    const originLeft = Number.isFinite(clamp.left) ? Number(clamp.left) : 0
    const originTop = Number.isFinite(clamp.top) ? Number(clamp.top) : 0
    left = Math.max(originLeft + m, Math.min(originLeft + vw - m - w, left))
    top = Math.max(originTop + m, Math.min(originTop + vh - m - h, top))
  }
  return { left, top, w, h }
}

export function applyMediaPanelCssVars(el: HTMLElement, vars: MediaPanelCssVars): void {
  let sig = ''
  for (const k of Object.keys(vars)) sig += `${k}:${vars[k]};`
  if (VARS_CACHE.get(el) === sig) return
  for (const k of Object.keys(vars)) el.style.setProperty(k, vars[k]!)
  VARS_CACHE.set(el, sig)
}

export function applyPanelBox(el: HTMLElement, args: {
  left: number
  top: number
  w: number
  h: number
  zIndex?: number | string
  display?: 'block' | 'none' | 'flex'
  scale?: number
  positionMode?: VectorPaintedOverlayPositionMode
}): void {
  if (isParentOwnedOverlayPlacement(el)) return
  const left = Number.isFinite(args.left) ? args.left : 0
  const top = Number.isFinite(args.top) ? args.top : 0
  const w = Number.isFinite(args.w) ? args.w : 1
  const h = Number.isFinite(args.h) ? args.h : 1
  const scale = Number.isFinite(args.scale) && Number(args.scale) > 0 ? Math.max(0.001, Number(args.scale)) : 1
  const display = args.display || 'block'
  const z = args.zIndex != null ? String(args.zIndex) : ''
  const positionMode = args.positionMode === 'matrix' ? 'matrix' : 'vectorPainted'
  const posSig = `${positionMode}|${left}|${top}|${scale}`
  const sizeSig = `${display}|${z}|${w}|${h}`

  const prevPosSig = BOX_POS_CACHE.get(el) || ''
  const prevSizeSig = BOX_SIZE_CACHE.get(el) || ''
  const expectedWidth = `${w}px`
  const expectedHeight = `${h}px`
  const sizeStyleMatches = el.style.display === display && (
    display === 'none'
    || (el.style.width === expectedWidth && el.style.height === expectedHeight && el.style.zIndex === z)
  )
  const zoomStyle = el.style as CSSStyleDeclaration & { zoom: string }
  const positionStyleMatches = positionMode === 'matrix'
    ? el.style.left === '0px'
      && el.style.top === '0px'
      && el.style.transform === `matrix(${scale}, 0, 0, ${scale}, ${left}, ${top})`
      && zoomStyle.zoom === '1'
    : el.style.left === `${left / scale}px`
      && el.style.top === `${top / scale}px`
      && el.style.transform === 'none'
      && zoomStyle.zoom === String(scale)
  const sizeChanged = prevSizeSig !== sizeSig || !sizeStyleMatches
  const positionChanged = prevPosSig !== posSig || !positionStyleMatches
  if (!sizeChanged && !positionChanged) return

  if (sizeChanged) {
    el.style.display = display
    if (display !== 'none') {
      el.style.width = expectedWidth
      el.style.height = expectedHeight
      if (z) el.style.zIndex = z
      else el.style.zIndex = ''
    }
    BOX_SIZE_CACHE.set(el, sizeSig)
  }

  if (display !== 'none' && positionChanged) {
    applyVectorPaintedOverlayBox(el, {
      left,
      top,
      scale,
      positionMode,
    })
    BOX_POS_CACHE.set(el, posSig)
  }
}
