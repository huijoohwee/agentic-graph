import {
  STORYBOARD_WIDGET_OVERLAY_SURFACE_ROOT_ATTR,
} from '@/lib/canvas/storyboard-widget-overlay-proxy'
import { normalizeViewportFrame } from '@/lib/zoom/viewport'

const escapeCssAttrValue = (value: string): string => {
  try {
    const cssApi = (globalThis as { CSS?: { escape?: (input: string) => string } }).CSS
    if (cssApi && typeof cssApi.escape === 'function') return cssApi.escape(value)
  } catch {
    void 0
  }
  return value.replace(/["\\\]]/g, '\\$&')
}

export function resolveStoryboardWidgetVisibleViewport(args: {
  storyboardWidgetSurfaceId?: string
  viewportW: number
  viewportH: number
}) {
  const fallback = normalizeViewportFrame({ viewportW: args.viewportW, viewportH: args.viewportH })
  if (typeof document === 'undefined') return fallback
  const surfaceId = String(args.storyboardWidgetSurfaceId || '').trim()
  if (!surfaceId) return fallback
  const surfaceRoot = document.querySelector<HTMLElement>(
    `[${STORYBOARD_WIDGET_OVERLAY_SURFACE_ROOT_ATTR}="${escapeCssAttrValue(surfaceId)}"]`,
  )
  if (!(surfaceRoot instanceof HTMLElement)) return fallback
  const surfaceRect = surfaceRoot?.getBoundingClientRect() || null
  if (!Number.isFinite(surfaceRect?.left) || !Number.isFinite(surfaceRect?.top) || !Number.isFinite(surfaceRect?.right) || !Number.isFinite(surfaceRect?.bottom)) return fallback
  const top = 0
  const left = 0
  const right = Math.max(left + 1, Math.min(args.viewportW, Math.floor(Number(surfaceRect?.width) || args.viewportW)))
  const bottom = Math.max(top + 1, Math.min(args.viewportH, Math.floor(Number(surfaceRect?.height) || args.viewportH)))
  // Editor Workspace is an overlay, not a Storyboard Widget layout constraint.
  return {
    left,
    top,
    right,
    bottom,
    width: Math.max(1, right - left),
    height: Math.max(1, bottom - top),
    centerX: (left + right) / 2,
    centerY: (top + bottom) / 2,
  }
}
