import { MEDIA_PREVIEW_SELECTABLE_SURFACE_ATTR, MEDIA_PREVIEW_SELECTABLE_SURFACE_VALUE } from '@/lib/cards/mediaPreviewSurfaceSelection'

export const STORYBOARD_WIDGET_OVERLAY_MODE_SELECTOR = '[data-kg-storyboard-widget-mode="1"]'
export const STORYBOARD_WIDGET_OVERLAY_SURFACE_ATTR = 'data-kg-storyboard-widget-surface'
export const STORYBOARD_WIDGET_OVERLAY_SURFACE_ROOT_ATTR = 'data-kg-storyboard-widget-surface-root'
export const STORYBOARD_WIDGET_OVERLAY_ROOT_SELECTOR = `[data-kg-widget]${STORYBOARD_WIDGET_OVERLAY_MODE_SELECTOR}`
export const RICH_MEDIA_OVERLAY_ROOT_SELECTOR = `[data-kg-rich-media-overlay="1"]${STORYBOARD_WIDGET_OVERLAY_MODE_SELECTOR}`
export const RICH_MEDIA_LOCAL_INTERACTION_SELECTOR = '[data-kg-rich-media-interaction-owner="1"]'
export const SEMANTIC_FLOW_OVERLAY_ROOT_SELECTOR = `[data-node-id][${STORYBOARD_WIDGET_OVERLAY_SURFACE_ATTR}]`
export const CANVAS_OVERLAY_PROXY_ROOT_SELECTOR = [
  STORYBOARD_WIDGET_OVERLAY_ROOT_SELECTOR,
  RICH_MEDIA_OVERLAY_ROOT_SELECTOR,
  SEMANTIC_FLOW_OVERLAY_ROOT_SELECTOR,
].join(', ')
export const CANVAS_OVERLAY_RESIZE_HANDLE_SELECTOR = '[data-kg-resize-handle]'
export const CANVAS_OVERLAY_DRAG_HANDLE_SELECTOR =
  `[data-kg-flow-node-drag-handle="true"],[data-kg-canvas-overlay-drag-handle="true"],${CANVAS_OVERLAY_RESIZE_HANDLE_SELECTOR}`

export const CANVAS_OVERLAY_PAN_OWNER_ATTR = 'data-kg-overlay-pan-owner'
export const CANVAS_OVERLAY_PAN_OWNER_CANVAS = 'canvas'

export const STORYBOARD_WIDGET_OVERLAY_CONTROL_SELECTOR = [
  'input',
  'textarea',
  'select',
  'button',
  'a',
  '[role="textbox"]',
  '[role="button"]',
  '[contenteditable="true"]',
  '[data-kg-canvas-pointer-ignore="true"]',
  '[data-kg-media-scroll-surface="1"]',
].join(',')

export const RICH_MEDIA_CANVAS_OVERLAY_CONTROL_SELECTOR = [
  'input',
  'textarea',
  'select',
  'button',
  'a',
  '[role="textbox"]',
  '[role="button"]',
  '[contenteditable="true"]',
  '[data-kg-rich-media-inline-edit="1"]',
  '[data-kg-rich-media-model-surface="1"]',
  '[data-kg-canvas-pointer-ignore="true"]:not([data-kg-media-scroll-surface="1"])',
].join(',')

export const STORYBOARD_WIDGET_OVERLAY_INTERACTIVE_SELECTOR =
  `${STORYBOARD_WIDGET_OVERLAY_CONTROL_SELECTOR},[data-kg-card-inline-edit="1"],[${MEDIA_PREVIEW_SELECTABLE_SURFACE_ATTR}="${MEDIA_PREVIEW_SELECTABLE_SURFACE_VALUE}"]`

export const STORYBOARD_WIDGET_INTERACTION_FRAME_EVENT = 'kg-storyboard-widget-interaction-frame'
export const STORYBOARD_WIDGET_GEOMETRY_COMMITTED_EVENT = 'kg-storyboard-widget-geometry-committed'

export type StoryboardWidgetInteractionFrameOptions = { updateToolbarLayout?: boolean }

let storyboardWidgetInteractionFrameRaf: number | null = null
let storyboardWidgetInteractionFrameUpdatesToolbar = false

export function escapeStoryboardWidgetOverlaySelectorAttrValue(value: string): string {
  const text = String(value || '')
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') return CSS.escape(text)
  return text.replace(/["\\\]]/g, '\\$&')
}

export function findStoryboardWidgetOverlaySurfaceRoot(surfaceId: string | null | undefined): HTMLElement | null {
  if (typeof document === 'undefined') return null
  const normalizedSurfaceId = String(surfaceId || '').trim()
  if (!normalizedSurfaceId) return null
  return document.querySelector<HTMLElement>(
    `[${STORYBOARD_WIDGET_OVERLAY_SURFACE_ROOT_ATTR}="${escapeStoryboardWidgetOverlaySelectorAttrValue(normalizedSurfaceId)}"]`,
  )
}

export function queryStoryboardWidgetOverlayRootsForSurface(args: {
  surfaceId: string | null | undefined
  selector: string
  root?: ParentNode | null
}): HTMLElement[] {
  if (typeof document === 'undefined') return []
  const surfaceId = String(args.surfaceId || '').trim()
  if (!surfaceId) return []
  const queryRoot = args.root || document
  return Array.from(queryRoot.querySelectorAll(args.selector))
    .filter((el): el is HTMLElement => el instanceof HTMLElement)
    .filter(el => readStoryboardWidgetOverlaySurfaceId(el) === surfaceId)
}

export function emitStoryboardWidgetInteractionFrame(opts?: StoryboardWidgetInteractionFrameOptions): void {
  if (typeof window === 'undefined') return
  // A geometry request must survive coalescing with position-only zoom frames.
  storyboardWidgetInteractionFrameUpdatesToolbar ||= opts?.updateToolbarLayout !== false
  if (storyboardWidgetInteractionFrameRaf != null) return
  storyboardWidgetInteractionFrameRaf = window.requestAnimationFrame(() => {
    const detail = { updateToolbarLayout: storyboardWidgetInteractionFrameUpdatesToolbar }
    storyboardWidgetInteractionFrameRaf = null
    storyboardWidgetInteractionFrameUpdatesToolbar = false
    try { window.dispatchEvent(new CustomEvent(STORYBOARD_WIDGET_INTERACTION_FRAME_EVENT, { detail })) } catch { void 0 }
  })
}

export function emitStoryboardWidgetGeometryCommitted(): void {
  if (typeof window === 'undefined') return
  try { window.dispatchEvent(new Event(STORYBOARD_WIDGET_GEOMETRY_COMMITTED_EVENT)) } catch { void 0 }
}

export type StoryboardWidgetOverlayProxyTarget =
  | { kind: 'none' }
  | { kind: 'canvas'; targetEl: Element }
  | { kind: 'overlay'; targetEl: Element; overlayRoot: HTMLElement; isInteractive: boolean }

export function readCanvasOverlayPinnedState(overlayRoot: HTMLElement | null | undefined): boolean {
  if (!overlayRoot) return false
  const widgetPinned = String(overlayRoot.dataset.kgWidgetPinned || '').trim()
  if (widgetPinned === '1') return true
  const richMediaPinned = String(overlayRoot.dataset.kgCanvasOverlayPinned || '').trim()
  return richMediaPinned === '1'
}

export function readCanvasOverlayNodeId(overlayRoot: HTMLElement | null | undefined): string {
  if (!overlayRoot) return ''
  const widgetId = String(overlayRoot.dataset.kgWidget || '').trim()
  if (widgetId) return widgetId
  return String(overlayRoot.dataset.nodeId || '').trim()
}

export function readCanvasOverlayPanOwner(overlayRoot: HTMLElement | null | undefined): string {
  if (!overlayRoot) return ''
  return String(overlayRoot.getAttribute(CANVAS_OVERLAY_PAN_OWNER_ATTR) || '').trim()
}

export function isCanvasOverlayPanOwnedByCanvas(overlayRoot: HTMLElement | null | undefined): boolean {
  return readCanvasOverlayPanOwner(overlayRoot) === CANVAS_OVERLAY_PAN_OWNER_CANVAS
}

export function isRichMediaCanvasOverlayRoot(overlayRoot: HTMLElement | null | undefined): boolean {
  if (!overlayRoot) return false
  try {
    return overlayRoot.matches(RICH_MEDIA_OVERLAY_ROOT_SELECTOR)
  } catch {
    return String(overlayRoot.dataset.kgRichMediaOverlay || '').trim() === '1'
      && String(overlayRoot.dataset.kgStoryboardWidgetMode || '').trim() === '1'
  }
}

export function isStoryboardWidgetOverlayControlTarget(target: Element | null | undefined): boolean {
  return !!target?.closest(STORYBOARD_WIDGET_OVERLAY_CONTROL_SELECTOR)
}

export function isCanvasOverlayBodyPanBlockingTarget(
  target: Element | null | undefined,
  overlayRoot: HTMLElement | null | undefined,
): boolean {
  if (!target) return false
  if (isRichMediaCanvasOverlayRoot(overlayRoot)) {
    return !!target.closest(RICH_MEDIA_CANVAS_OVERLAY_CONTROL_SELECTOR)
  }
  return isStoryboardWidgetOverlayControlTarget(target)
}

export function shouldUseCanvasOverlayBodyPan(args: {
  target: Element | null | undefined
  overlayRoot: HTMLElement | null | undefined
}): boolean {
  if (!args.target || !args.overlayRoot) return false
  if (!isCanvasOverlayPanOwnedByCanvas(args.overlayRoot)) return false
  if (isCanvasOverlayBodyPanBlockingTarget(args.target, args.overlayRoot)) return false
  if (args.target.closest(CANVAS_OVERLAY_RESIZE_HANDLE_SELECTOR)) return false
  if (args.target.closest(CANVAS_OVERLAY_DRAG_HANDLE_SELECTOR)) return false
  return true
}

export function readStoryboardWidgetElementSurfaceId(el: Element | null | undefined): string {
  if (!(el instanceof HTMLElement)) return ''
  const ownSurfaceId = String(el.dataset.kgStoryboardWidgetSurface || '').trim()
  if (ownSurfaceId) return ownSurfaceId
  try {
    const closestSurface = el.closest(`[${STORYBOARD_WIDGET_OVERLAY_SURFACE_ATTR}]`)
    if (closestSurface instanceof HTMLElement) {
      const closestSurfaceId = String(closestSurface.dataset.kgStoryboardWidgetSurface || '').trim()
      if (closestSurfaceId) return closestSurfaceId
    }
    const closestSurfaceRoot = el.closest(`[${STORYBOARD_WIDGET_OVERLAY_SURFACE_ROOT_ATTR}]`)
    if (closestSurfaceRoot instanceof HTMLElement) {
      return String(closestSurfaceRoot.getAttribute(STORYBOARD_WIDGET_OVERLAY_SURFACE_ROOT_ATTR) || '').trim()
    }
  } catch {
    void 0
  }
  return ''
}

export function readStoryboardWidgetOverlaySurfaceId(overlayRoot: HTMLElement | null | undefined): string {
  if (!(overlayRoot instanceof HTMLElement)) return ''
  const ownSurfaceId = readStoryboardWidgetElementSurfaceId(overlayRoot)
  if (ownSurfaceId) return ownSurfaceId
  try {
    const closestSurface = overlayRoot.closest(`[${STORYBOARD_WIDGET_OVERLAY_SURFACE_ATTR}]`)
    if (closestSurface instanceof HTMLElement) {
      return String(closestSurface.dataset.kgStoryboardWidgetSurface || '').trim()
    }
  } catch {
    void 0
  }
  return ''
}

export function isTransientOffscreenRichMediaOverlayRoot(overlayRoot: HTMLElement | null | undefined, rect: DOMRect | null | undefined): boolean {
  if (!overlayRoot || !rect) return false
  if (String(overlayRoot.dataset.kgRichMediaOverlay || '').trim() !== '1') return false
  const tiny = rect.width <= 2 && rect.height <= 2
  const farOffscreen = rect.left < -10000 || rect.top < -10000
  const parkedOffscreen = rect.right <= 0 || rect.bottom <= 0
  return tiny && (farOffscreen || parkedOffscreen)
}

export function isUsableStoryboardWidgetOverlayRectCandidate(overlayRoot: HTMLElement | null | undefined, rect: DOMRect | null | undefined): boolean {
  if (!overlayRoot || !rect) return false
  if (isTransientOffscreenRichMediaOverlayRoot(overlayRoot, rect)) return false
  if (typeof window !== 'undefined' && typeof window.getComputedStyle === 'function') {
    const style = window.getComputedStyle(overlayRoot)
    if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity || '1') === 0) return false
  }
  return Number.isFinite(rect.left) && Number.isFinite(rect.top) && rect.width > 0 && rect.height > 0
}

export function shouldReplaceStoryboardWidgetOverlayRectCandidate(
  current: { el: HTMLElement; rect: DOMRect } | null | undefined,
  next: { el: HTMLElement; rect: DOMRect },
): boolean {
  if (!isUsableStoryboardWidgetOverlayRectCandidate(next.el, next.rect)) return false
  if (!current || !isUsableStoryboardWidgetOverlayRectCandidate(current.el, current.rect)) return true
  const currentArea = Math.max(0, current.rect.width) * Math.max(0, current.rect.height)
  const nextArea = Math.max(0, next.rect.width) * Math.max(0, next.rect.height)
  return nextArea > currentArea + 1
}

function readOverlayRectCandidateRank(el: HTMLElement): number {
  const surfaceId = readStoryboardWidgetOverlaySurfaceId(el)
  const hasWidgetShellId = String(el.dataset.kgWidget || '').trim().length > 0
  const isRichMediaOverlay = String(el.dataset.kgRichMediaOverlay || '').trim() === '1'
  const isPinnedCanvasProxy = readCanvasOverlayPinnedState(el)
  if (surfaceId && hasWidgetShellId) return 5
  if (surfaceId && isRichMediaOverlay && !isPinnedCanvasProxy) return 4
  if (surfaceId && isRichMediaOverlay && isPinnedCanvasProxy) return 3
  if (surfaceId) return 2
  if (isRichMediaOverlay) return 1
  return 0
}

export function collectCanonicalStoryboardWidgetOverlayRectEntries(
  overlayRoots: Iterable<HTMLElement>,
): Array<{ id: string; el: HTMLElement; rect: DOMRect }> {
  const selectedById = new Map<string, { el: HTMLElement; rect: DOMRect }>()
  for (const el of overlayRoots) {
    const id = readCanvasOverlayNodeId(el)
    if (!id) continue
    const rect = el.getBoundingClientRect()
    if (!isUsableStoryboardWidgetOverlayRectCandidate(el, rect)) continue
    const next = { el, rect }
    const current = selectedById.get(id)
    const nextRank = readOverlayRectCandidateRank(el)
    const currentRank = current ? readOverlayRectCandidateRank(current.el) : -1
    if (nextRank > currentRank) {
      selectedById.set(id, next)
      continue
    }
    if (nextRank < currentRank) continue
    if (shouldReplaceStoryboardWidgetOverlayRectCandidate(current, next)) selectedById.set(id, next)
  }
  return Array.from(selectedById.entries())
    .map(([id, entry]) => ({ id, el: entry.el, rect: entry.rect }))
}

export function resolveStoryboardWidgetOverlayProxyTarget(args: { target: unknown; canvasEl: Element; storyboardWidgetSurfaceId?: string | null }): StoryboardWidgetOverlayProxyTarget {
  const el = args.target instanceof Element ? args.target : null
  if (!el) return { kind: 'none' }
  if (args.canvasEl.contains(el)) return { kind: 'canvas', targetEl: el }

  const root = el.closest(CANVAS_OVERLAY_PROXY_ROOT_SELECTOR)
  const overlayRoot = root instanceof HTMLElement ? root : null
  if (!overlayRoot) return { kind: 'none' }
  const activeSurfaceId =
    String(args.storyboardWidgetSurfaceId || '').trim()
    || readStoryboardWidgetElementSurfaceId(args.canvasEl)
  if (!activeSurfaceId) return { kind: 'none' }
  if (activeSurfaceId) {
    const overlaySurfaceId = readStoryboardWidgetOverlaySurfaceId(overlayRoot)
    if (!overlaySurfaceId || overlaySurfaceId !== activeSurfaceId) return { kind: 'none' }
  }

  const isInteractive = isCanvasOverlayPanOwnedByCanvas(overlayRoot)
    ? isCanvasOverlayBodyPanBlockingTarget(el, overlayRoot)
    : !!el.closest(STORYBOARD_WIDGET_OVERLAY_INTERACTIVE_SELECTOR)
  return { kind: 'overlay', targetEl: el, overlayRoot, isInteractive }
}
