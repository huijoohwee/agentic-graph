import {
  collectCanonicalStoryboardWidgetOverlayRectEntries,
  findStoryboardWidgetOverlaySurfaceRoot,
  isTransientOffscreenRichMediaOverlayRoot,
  queryStoryboardWidgetOverlayRootsForSurface,
  RICH_MEDIA_OVERLAY_ROOT_SELECTOR,
} from '@/lib/canvas/storyboard-widget-overlay-proxy'

export type StoryboardWidgetWorldObstacle = {
  id: string
  left: number
  top: number
  width: number
  height: number
}

export function distinctStoryboardOverlayRectsOverlap(
  left: Omit<StoryboardWidgetWorldObstacle, 'width' | 'height'> & { width?: number; height?: number },
  right: Omit<StoryboardWidgetWorldObstacle, 'width' | 'height'> & { width?: number; height?: number },
  gap = 0,
  fallbackSize: { width: number; height: number } = { width: 0, height: 0 },
): boolean {
  const normalizeId = (value: string) => String(value || '')
    .replace(/^(?:rich-media|storyboard-card):/, '')
    .trim()
  const leftId = normalizeId(left.id)
  const rightId = normalizeId(right.id)
  if (leftId && leftId === rightId) return false
  const safeGap = Math.max(0, Number.isFinite(gap) ? gap : 0)
  const leftWidth = left.width ?? fallbackSize.width
  const leftHeight = left.height ?? fallbackSize.height
  const rightWidth = right.width ?? fallbackSize.width
  const rightHeight = right.height ?? fallbackSize.height
  return left.left < right.left + rightWidth + safeGap
    && right.left < left.left + leftWidth + safeGap
    && left.top < right.top + rightHeight + safeGap
    && right.top < left.top + leftHeight + safeGap
}

export function collectActiveRichMediaWorldObstacles(args: {
  storyboardWidgetSurfaceId: string | null | undefined
  skipAll?: boolean
  isFrontmatterFlow?: boolean
  effectiveOrFallbackOpenIdSet: ReadonlySet<string>
  resolveActiveSurfaceOverlayWidgetId: (id: string) => string
  zoomX: number
  zoomY: number
  zoomK: number
}): StoryboardWidgetWorldObstacle[] {
  if (typeof document === 'undefined' || args.skipAll) return []
  const surfaceRoot = findStoryboardWidgetOverlaySurfaceRoot(args.storyboardWidgetSurfaceId)
  const surfaceRect = surfaceRoot?.getBoundingClientRect() || null
  const surfaceOffsetLeft = surfaceRect && Number.isFinite(surfaceRect.left) ? Number(surfaceRect.left) : 0
  const surfaceOffsetTop = surfaceRect && Number.isFinite(surfaceRect.top) ? Number(surfaceRect.top) : 0
  const entries = collectCanonicalStoryboardWidgetOverlayRectEntries(queryStoryboardWidgetOverlayRootsForSurface({
    surfaceId: args.storyboardWidgetSurfaceId,
    selector: RICH_MEDIA_OVERLAY_ROOT_SELECTOR,
  }))
  const obstacles: StoryboardWidgetWorldObstacle[] = []
  const safeZoomK = Math.max(0.001, args.zoomK)
  for (let i = 0; i < entries.length; i += 1) {
    const entry = entries[i]!
    const entryWidgetId = args.resolveActiveSurfaceOverlayWidgetId(entry.id)
    if (args.isFrontmatterFlow && entryWidgetId && args.effectiveOrFallbackOpenIdSet.has(entryWidgetId)) continue
    const rect = entry.rect
    if (!rect || isTransientOffscreenRichMediaOverlayRoot(entry.el, rect)) continue
    const screenLeft = Number(rect.left) - surfaceOffsetLeft
    const screenTop = Number(rect.top) - surfaceOffsetTop
    const screenRight = Number(rect.right) - surfaceOffsetLeft
    const screenBottom = Number(rect.bottom) - surfaceOffsetTop
    if (!Number.isFinite(screenLeft) || !Number.isFinite(screenTop) || !Number.isFinite(screenRight) || !Number.isFinite(screenBottom)) continue
    const left = (screenLeft - args.zoomX) / safeZoomK
    const top = (screenTop - args.zoomY) / safeZoomK
    const right = (screenRight - args.zoomX) / safeZoomK
    const bottom = (screenBottom - args.zoomY) / safeZoomK
    const width = right - left
    const height = bottom - top
    if (!(width > 0) || !(height > 0)) continue
    obstacles.push({ id: `rich-media:${entry.id}`, left, top, width, height })
  }
  return obstacles
}

export function collectActiveStoryboardCardWorldObstacles(args: {
  storyboardWidgetSurfaceId: string | null | undefined
  resolveActiveSurfaceOverlayWidgetId: (id: string) => string
  zoomX: number
  zoomY: number
  zoomK: number
}): StoryboardWidgetWorldObstacle[] {
  if (typeof document === 'undefined') return []
  const surfaceRoot = findStoryboardWidgetOverlaySurfaceRoot(args.storyboardWidgetSurfaceId)
  const surfaceRect = surfaceRoot?.getBoundingClientRect() || null
  const surfaceOffsetLeft = surfaceRect && Number.isFinite(surfaceRect.left) ? Number(surfaceRect.left) : 0
  const surfaceOffsetTop = surfaceRect && Number.isFinite(surfaceRect.top) ? Number(surfaceRect.top) : 0
  const roots = queryStoryboardWidgetOverlayRootsForSurface({
    surfaceId: args.storyboardWidgetSurfaceId,
    selector: '[data-kg-storyboard-fixed-card="1"][data-node-id]',
  })
  const obstacles: StoryboardWidgetWorldObstacle[] = []
  const safeZoomK = Math.max(0.001, args.zoomK)
  for (let i = 0; i < roots.length; i += 1) {
    const el = roots[i]!
    const rawId = String(el.dataset.nodeId || '').trim()
    const id = args.resolveActiveSurfaceOverlayWidgetId(rawId)
    if (!id) continue
    const rect = el.getBoundingClientRect()
    if (!(rect.width > 0) || !(rect.height > 0)) continue
    const left = (Number(rect.left) - surfaceOffsetLeft - args.zoomX) / safeZoomK
    const top = (Number(rect.top) - surfaceOffsetTop - args.zoomY) / safeZoomK
    const width = Number(rect.width) / safeZoomK
    const height = Number(rect.height) / safeZoomK
    if (![left, top, width, height].every(Number.isFinite)) continue
    obstacles.push({ id, left, top, width, height })
  }
  return obstacles
}
