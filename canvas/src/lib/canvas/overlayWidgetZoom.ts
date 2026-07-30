import {
  type BalancedSpreadViewportPreset,
  clampBalancedCollectiveScaleToViewport,
  computeBalancedSpreadBaseGapPx,
  computeBalancedSpreadLayout,
  computeBalancedSpreadSpacingPx,
  computeBalancedSpreadViewportMargins,
} from '@/lib/ui/overlayBalancedSpread'
import { COLLECTIVE_OVERLAY_SCALE_LIMITS_16X9 } from '@/lib/ui/overlayScaleLimits'

const DEFAULT_STORYBOARD_SURFACE_WIDTH_PX = 360
export const WIDGET_LAYOUT_BASE_HEIGHT_PX = 520
export const WIDGET_BASE_SIZE = Object.freeze({
  width: DEFAULT_STORYBOARD_SURFACE_WIDTH_PX,
  height: Math.round((DEFAULT_STORYBOARD_SURFACE_WIDTH_PX * 9) / 16),
})

export type ZoomScaleExtent = { minK: number; maxK: number }
export type WidgetScaleMode = 'pinnedInCanvas' | 'floating'
const FLOATING_MIN_SCALE = 0.86
const FLOATING_MAX_SCALE = 1.06
const FLOATING_SCALE_STEP = 0.02
const COLLECTIVE_CAMERA_BASELINE_REF_LIMIT = 64
const collectiveCameraBaselineRefByKey = new Map<string, { current: number | null }>()

export function buildCollectiveCameraFollowBaselineKey(args: {
  surfaceId: unknown
  graphKey?: unknown
}): string {
  const surfaceId = String(args.surfaceId || '').trim() || 'storyboard'
  const graphKey = String(args.graphKey || '').trim()
  return `${surfaceId}|${graphKey}`
}

export function resolveCollectiveCameraFollowBaselineRef(
  rawKey: unknown,
): { current: number | null } {
  const key = String(rawKey || '').trim() || 'storyboard:default'
  const existing = collectiveCameraBaselineRefByKey.get(key)
  if (existing) return existing
  const baselineRef = { current: null }
  collectiveCameraBaselineRefByKey.set(key, baselineRef)
  if (collectiveCameraBaselineRefByKey.size > COLLECTIVE_CAMERA_BASELINE_REF_LIMIT) {
    const oldestKey = collectiveCameraBaselineRefByKey.keys().next().value
    if (typeof oldestKey === 'string' && oldestKey !== key) {
      collectiveCameraBaselineRefByKey.delete(oldestKey)
    }
  }
  return baselineRef
}

export function resetCollectiveCameraFollowBaseline(
  rawKey: unknown,
  baselineZoomK = 1,
): void {
  const baselineRef = resolveCollectiveCameraFollowBaselineRef(rawKey)
  baselineRef.current = Number.isFinite(baselineZoomK) && baselineZoomK > 0
    ? Number(baselineZoomK)
    : 1
}

function clamp(v: number, lo: number, hi: number): number {
  if (!Number.isFinite(v)) return lo
  return Math.max(lo, Math.min(hi, v))
}

function quantizeScale(v: number, step: number): number {
  const safeStep = Number.isFinite(step) && step > 0 ? step : 0.01
  return Math.round(v / safeStep) * safeStep
}

export function computeWidgetScaleKey(scale: number): string {
  const n = Number.isFinite(scale) ? scale : 1
  return n.toFixed(2)
}

export function computeWidgetScale(
  zoomK: number,
  extent?: ZoomScaleExtent | null,
  opts?: { mode?: WidgetScaleMode },
): number {
  void extent
  const mode = opts?.mode === 'floating' ? 'floating' : 'pinnedInCanvas'
  if (mode === 'floating') {
    const k = Number.isFinite(zoomK) ? Math.max(0.1, Math.min(6, zoomK)) : 1
    const adaptive = Math.pow(k, 0.42)
    return clamp(quantizeScale(clamp(adaptive, FLOATING_MIN_SCALE, FLOATING_MAX_SCALE), FLOATING_SCALE_STEP), FLOATING_MIN_SCALE, FLOATING_MAX_SCALE)
  }

  const k = Number.isFinite(zoomK) ? zoomK : 1
  const PINNED_MIN_SCALE = 0.05
  const PINNED_MAX_SCALE = 1
  return clamp(k, PINNED_MIN_SCALE, PINNED_MAX_SCALE)
}

export function computeBoundedOverlayPaintScale(zoomK: number): number {
  return computeWidgetScale(zoomK, null, { mode: 'floating' })
}

export function computeWidgetScaledSize(scale: number): { width: number; height: number } {
  const s = Number.isFinite(scale) ? scale : 1
  return {
    width: WIDGET_BASE_SIZE.width * s,
    height: WIDGET_BASE_SIZE.height * s,
  }
}

export function projectCollectiveScreenLayoutForZoom(args: {
  base: { left: number; top: number; scale: number }
  scale: number
  baseLayoutScale?: number
  layoutScale?: number
  anchorX: number
  anchorY: number
  baseWidth: number
  baseHeight: number
}): { left: number; top: number } {
  const baseScale = Number.isFinite(args.base.scale) && args.base.scale > 0 ? args.base.scale : 1
  const nextScale = Number.isFinite(args.scale) && args.scale > 0 ? args.scale : baseScale
  const baseLayoutScale = Number.isFinite(args.baseLayoutScale) && Number(args.baseLayoutScale) > 0
    ? Number(args.baseLayoutScale)
    : baseScale
  const nextLayoutScale = Number.isFinite(args.layoutScale) && Number(args.layoutScale) > 0
    ? Number(args.layoutScale)
    : nextScale
  const baseWidth = Math.max(1, Number(args.baseWidth) || 1)
  const baseHeight = Math.max(1, Number(args.baseHeight) || 1)
  const anchorX = Number.isFinite(args.anchorX) ? args.anchorX : 0
  const anchorY = Number.isFinite(args.anchorY) ? args.anchorY : 0
  const ratio = nextLayoutScale / Math.max(0.001, baseLayoutScale)
  const baseCenterX = args.base.left + (baseWidth * baseScale) / 2
  const baseCenterY = args.base.top + (baseHeight * baseScale) / 2
  const nextCenterX = anchorX + (baseCenterX - anchorX) * ratio
  const nextCenterY = anchorY + (baseCenterY - anchorY) * ratio
  return {
    left: nextCenterX - (baseWidth * nextScale) / 2,
    top: nextCenterY - (baseHeight * nextScale) / 2,
  }
}

export function computeCollectiveFollowZoomK(args: {
  zoomK: number
  baselineZoomK?: number | null
}): number {
  const zoomK = Number.isFinite(args.zoomK) && args.zoomK > 0 ? Number(args.zoomK) : 1
  const baselineZoomK =
    Number.isFinite(args.baselineZoomK) && Number(args.baselineZoomK) > 0
      ? Number(args.baselineZoomK)
      : zoomK
  return zoomK / Math.max(0.001, baselineZoomK)
}

export function computeCollectiveCameraFollowScaleFromBaseline(args: {
  zoomK: number
  baselineZoomK?: number | null
}): number {
  return Math.max(0.001, computeCollectiveFollowZoomK(args))
}

export function computeCollectiveFollowPinnedScale(args: {
  zoomK: number
  extent?: ZoomScaleExtent | null
  viewportW: number
  viewportH: number
  count: number
  baseWidth: number
  baseHeight: number
  quantizeStep?: number
  hardMinScale?: number
  hardMaxScale?: number
  viewportPreset?: BalancedSpreadViewportPreset
  fitToViewport?: boolean
}): number {
  const viewportPreset = args.viewportPreset || 'widgetCanvas'
  const baseWidth = Math.max(1, Number(args.baseWidth) || 1)
  const baseHeight = Math.max(1, Number(args.baseHeight) || 1)
  const baseScale = computeWidgetScale(args.zoomK, args.extent, { mode: 'pinnedInCanvas' })
  const requestedHardMin =
    Number.isFinite(args.hardMinScale) ? Math.max(0.001, Number(args.hardMinScale)) : COLLECTIVE_OVERLAY_SCALE_LIMITS_16X9.widget.min
  const requestedHardMax =
    Number.isFinite(args.hardMaxScale) ? Math.max(0.001, Number(args.hardMaxScale)) : COLLECTIVE_OVERLAY_SCALE_LIMITS_16X9.widget.max
  const quantizeStep = Number.isFinite(args.quantizeStep) ? Math.max(0.001, Number(args.quantizeStep)) : 0.02
  const quantize = (value: number) => Math.round(value / quantizeStep) * quantizeStep
  const viewportW = Math.max(1, Number(args.viewportW) || 1)
  const viewportH = Math.max(1, Number(args.viewportH) || 1)
  const margins = computeBalancedSpreadViewportMargins({
    viewportW,
    viewportH,
    preset: viewportPreset,
  })
  const usableW = Math.max(1, viewportW - margins.left - margins.right)
  const usableH = Math.max(1, viewportH - margins.top - margins.bottom)
  const baseGapPx = computeBalancedSpreadBaseGapPx({
    viewportW,
    viewportH,
    preset: viewportPreset,
    margins,
  })
  const count = Math.max(1, Math.floor(Number(args.count) || 1))
  const fitScaleToViewport = (scale: number, spacingZoomK: number): number => {
    let nextScale = clampBalancedCollectiveScaleToViewport({
      scale,
      viewportW: args.viewportW,
      viewportH: args.viewportH,
      count,
      baseWidth,
      baseHeight,
      quantizeStep,
      hardMinScale: Math.min(requestedHardMin, scale),
      hardMaxScale: Math.max(requestedHardMax, scale),
      viewportPreset,
    })
    if (count <= 1) return nextScale
    let candidate = Math.max(0.05, nextScale)
    const safeSpacingZoomK = Number.isFinite(spacingZoomK) ? Math.max(0.1, Number(spacingZoomK)) : 1
    for (let i = 0; i < 24; i += 1) {
      const panel = {
        width: baseWidth * candidate,
        height: baseHeight * candidate,
      }
      const gapPx = computeBalancedSpreadSpacingPx({
        baseGapPx,
        zoomK: safeSpacingZoomK,
        count,
        preset: viewportPreset,
      })
      const layout = computeBalancedSpreadLayout({
        count,
        viewportW,
        viewportH,
        cellW: panel.width + gapPx,
        cellH: panel.height + gapPx,
        gapPx,
        zoomK: safeSpacingZoomK,
        marginLeftPx: margins.left,
        marginRightPx: margins.right,
        marginTopPx: margins.top,
        marginBottomPx: margins.bottom,
        snapPx: 1,
      })
      if (layout.gridW <= usableW + 1 && layout.gridH <= usableH + 1) {
        nextScale = Math.max(0.05, quantize(candidate))
        return nextScale
      }
      candidate = Math.max(0.05, quantize(candidate - quantizeStep))
    }
    return Math.max(0.05, quantize(candidate))
  }
  if (args.fitToViewport === false) {
    const neutralFitScale = fitScaleToViewport(1, 1)
    const zoomFactor = Number.isFinite(args.zoomK) ? Math.max(0.05, Number(args.zoomK)) : 1
    const scaled = neutralFitScale * zoomFactor
    return clamp(
      quantize(scaled),
      requestedHardMin,
      Math.max(requestedHardMax, neutralFitScale),
    )
  }
  return fitScaleToViewport(baseScale, args.zoomK)
}

export type CollectiveFollowScaleFromBaselineArgs = Omit<Parameters<typeof computeCollectiveFollowPinnedScale>[0], 'zoomK'> & {
  zoomK: number
  baselineZoomK?: number | null
}

export function computeCollectiveFollowScaleFromBaseline(args: CollectiveFollowScaleFromBaselineArgs): number {
  const { baselineZoomK, zoomK, ...scaleArgs } = args
  return computeCollectiveFollowPinnedScale({
    ...scaleArgs,
    zoomK: computeCollectiveFollowZoomK({ zoomK, baselineZoomK }),
  })
}
