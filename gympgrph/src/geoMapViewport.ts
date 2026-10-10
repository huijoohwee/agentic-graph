export type GeoMapViewportPadding = Readonly<{
  bottom: number
  left: number
  right: number
  top: number
}>

type ViewportRect = Readonly<{
  bottom: number
  height: number
  left: number
  right: number
  top: number
  width: number
}>

const VIEWPORT_OCCLUDER_ATTR = 'data-kg-workspace-visible-viewport-occluder'
const BOTTOM_PANEL_CLASS = 'kg-canvas-bottom-panel'

const GEO_MAP_OCCLUDING_PANEL_SELECTOR = [
  '[aria-label="Markdown Workspace"]',
  '[aria-label="Floating panel"]',
  '[aria-label="Geospatial panel"]',
  `[${VIEWPORT_OCCLUDER_ATTR}]`,
  `.${BOTTOM_PANEL_CLASS}`,
].join(', ')

const PANEL_CLEARANCE_PX = 16
const OCCLUSION_LAYOUT_SETTLE_MS = 120
const PRESENTATION_CLEARANCE_APERTURE_FRACTION = 0.1

function readVisibleRect(element: Element): ViewportRect | null {
  const htmlElement = element as HTMLElement
  const rect = htmlElement.getBoundingClientRect?.()
  if (!rect || rect.width <= 0 || rect.height <= 0) return null
  const ownerWindow = htmlElement.ownerDocument?.defaultView
  if (ownerWindow) {
    const style = ownerWindow.getComputedStyle?.(htmlElement)
    if (style?.display === 'none' || style?.visibility === 'hidden') return null
  }
  return rect
}

function overlaps(viewport: ViewportRect, candidate: ViewportRect): boolean {
  return candidate.left < viewport.right
    && candidate.right > viewport.left
    && candidate.top < viewport.bottom
    && candidate.bottom > viewport.top
}

const horizontalBasePadding = (width: number) => Math.max(16, Math.min(72, width * 0.08))
const verticalBasePadding = (height: number) => Math.max(16, Math.min(88, height * 0.1))
const bottomBasePadding = (height: number) => Math.max(verticalBasePadding(height), Math.min(112, height * 0.14))

/** Reads occlusion for UI control placement, independently of camera framing. */
export function readGeoMapOcclusionPadding(
  viewport: HTMLElement | null,
): GeoMapViewportPadding {
  const viewportRect = viewport ? readVisibleRect(viewport) : null
  const ownerDocument = viewport?.ownerDocument
  if (!viewportRect || !ownerDocument) {
    return Object.freeze({ bottom: 0, left: 0, right: 0, top: 0 })
  }
  const horizontalCenter = viewportRect.left + viewportRect.width / 2
  let left = 0
  let right = 0
  const verticalPanels: Array<{ rect: ViewportRect; edge: string }> = []
  for (const candidate of Array.from(
    ownerDocument.querySelectorAll(GEO_MAP_OCCLUDING_PANEL_SELECTOR),
  )) {
    if (candidate === viewport) continue
    const candidateRect = readVisibleRect(candidate)
    if (!candidateRect || !overlaps(viewportRect, candidateRect)) continue
    const edge = candidate.classList.contains(BOTTOM_PANEL_CLASS)
      ? 'bottom' : candidate.getAttribute(VIEWPORT_OCCLUDER_ATTR)
    if (edge === 'top' || edge === 'bottom' || edge === 'vertical') {
      verticalPanels.push({ rect: candidateRect, edge })
      continue
    }
    // Classifying by panel centre handles compact layouts where a panel crosses
    // the map centre while still covering one complete edge.
    const candidateCenter = candidateRect.left + candidateRect.width / 2
    if (candidateCenter <= horizontalCenter) {
      left = Math.max(left, candidateRect.right - viewportRect.left + PANEL_CLEARANCE_PX)
    } else {
      right = Math.max(right, viewportRect.right - candidateRect.left + PANEL_CLEARANCE_PX)
    }
  }
  const base = horizontalBasePadding(viewportRect.width)
  const apertureLeft = viewportRect.left + Math.max(base, left)
  const apertureRight = viewportRect.right - Math.max(base, right)
  const apertureCenter = (apertureLeft + apertureRight) / 2
  let top = 0
  let bottom = 0
  for (const { rect, edge } of verticalPanels) {
    if (apertureLeft >= apertureRight || rect.left >= apertureCenter || rect.right <= apertureCenter) continue
    const atTop = edge === 'top' || (edge === 'vertical'
      && rect.top + rect.height / 2 <= viewportRect.top + viewportRect.height / 2)
    if (atTop) top = Math.max(top, rect.bottom - viewportRect.top + PANEL_CLEARANCE_PX)
    else bottom = Math.max(bottom, viewportRect.bottom - rect.top + PANEL_CLEARANCE_PX)
  }
  // A fully covered control area has no usable vertical clearance.
  if (Math.max(top, verticalBasePadding(viewportRect.height))
    + Math.max(bottom, bottomBasePadding(viewportRect.height)) >= viewportRect.height) {
    top = 0
    bottom = 0
  }
  return Object.freeze({ bottom, left, right, top })
}

/** Camera framing follows the actual MapLibre viewport; CanvasViewContainer owns layout. */
export function readGeoMapViewportPadding(
  map: any,
): GeoMapViewportPadding {
  const viewport = map?.getContainer?.() as HTMLElement | undefined
  const width = Math.max(1, Number(viewport?.clientWidth) || 1)
  const height = Math.max(1, Number(viewport?.clientHeight) || 1)
  const horizontalBase = horizontalBasePadding(width)
  return Object.freeze({
    bottom: bottomBasePadding(height),
    left: horizontalBase,
    right: horizontalBase,
    top: verticalBasePadding(height),
  })
}

/** Camera framing that leaves room for the visible panels and a small clear edge. */
export function readGeoMapPresentationPadding(
  map: any,
  requestedClearance: number,
): GeoMapViewportPadding {
  const baseViewport = readGeoMapViewportPadding(map)
  const occlusion = readGeoMapOcclusionPadding(
    (map?.getContainer?.() as HTMLElement | null | undefined) ?? null,
  )
  const viewport = {
    bottom: Math.max(baseViewport.bottom, occlusion.bottom),
    left: Math.max(baseViewport.left, occlusion.left),
    right: Math.max(baseViewport.right, occlusion.right),
    top: Math.max(baseViewport.top, occlusion.top),
  }
  const mapViewport = map?.getContainer?.() as HTMLElement | null | undefined
  const width = Math.max(
    0,
    Number(mapViewport?.clientWidth) || Number(map?.transform?.width) || 0,
  )
  const height = Math.max(
    0,
    Number(mapViewport?.clientHeight) || Number(map?.transform?.height) || 0,
  )
  const horizontalAperture = Math.max(0, width - viewport.left - viewport.right)
  const verticalAperture = Math.max(0, height - viewport.top - viewport.bottom)
  const horizontalClearance = horizontalAperture > 0
    ? Math.min(requestedClearance, horizontalAperture * PRESENTATION_CLEARANCE_APERTURE_FRACTION)
    : requestedClearance
  const verticalClearance = verticalAperture > 0
    ? Math.min(requestedClearance, verticalAperture * PRESENTATION_CLEARANCE_APERTURE_FRACTION)
    : requestedClearance
  return Object.freeze({
    bottom: viewport.bottom + verticalClearance,
    left: viewport.left + horizontalClearance,
    right: viewport.right + horizontalClearance,
    top: viewport.top + verticalClearance,
  })
}

function geoMapOcclusionLayoutKey(viewport: HTMLElement): string {
  const viewportRect = readVisibleRect(viewport)
  const ownerDocument = viewport.ownerDocument
  if (!viewportRect || !ownerDocument) return 'unavailable'
  const rectKey = (rect: ViewportRect | null): string => rect
    ? [rect.left, rect.top, rect.width, rect.height].map(Math.round).join(',')
    : 'hidden'
  return [
    rectKey(viewportRect),
    ...Array.from(ownerDocument.querySelectorAll(GEO_MAP_OCCLUDING_PANEL_SELECTOR))
      .map(candidate => rectKey(readVisibleRect(candidate))),
  ].join('|')
}

function mutationMayChangeGeoMapOcclusion(
  record: MutationRecord,
): boolean {
  const target = record.target as Element
  if (typeof target.matches !== 'function') return false
  if (target.matches(GEO_MAP_OCCLUDING_PANEL_SELECTOR)
    || target.closest(GEO_MAP_OCCLUDING_PANEL_SELECTOR)
    || target.querySelector(GEO_MAP_OCCLUDING_PANEL_SELECTOR)) return true
  if (record.type !== 'childList') return false
  return [...Array.from(record.addedNodes), ...Array.from(record.removedNodes)].some(node => {
    const element = node as Element
    return typeof element.matches === 'function'
      && (element.matches(GEO_MAP_OCCLUDING_PANEL_SELECTOR)
        || Boolean(element.querySelector(GEO_MAP_OCCLUDING_PANEL_SELECTOR)))
  })
}

/** Reframes map consumers after editor or floating-panel occlusion changes. */
export function observeGeoMapViewportOcclusion(
  viewport: HTMLElement | null,
  onChange: () => void,
): () => void {
  const ownerDocument = viewport?.ownerDocument
  const ownerWindow = ownerDocument?.defaultView
  if (!viewport || !ownerDocument || !ownerWindow) return () => {}

  const MutationObserverConstructor = ownerWindow.MutationObserver
  if (!MutationObserverConstructor) return () => {}

  let disposed = false
  let timer: number | null = null
  let lastLayoutKey = geoMapOcclusionLayoutKey(viewport)
  const checkLayout = (): void => {
    timer = null
    if (disposed) return
    const nextLayoutKey = geoMapOcclusionLayoutKey(viewport)
    if (nextLayoutKey === lastLayoutKey) return
    lastLayoutKey = nextLayoutKey
    onChange()
  }
  const scheduleLayoutCheck = (): void => {
    if (disposed) return
    if (timer !== null) ownerWindow.clearTimeout(timer)
    timer = ownerWindow.setTimeout(checkLayout, OCCLUSION_LAYOUT_SETTLE_MS)
  }
  const mutations = new MutationObserverConstructor(records => {
    if (records.some(mutationMayChangeGeoMapOcclusion)) scheduleLayoutCheck()
  })
  mutations.observe(ownerDocument.documentElement, {
    attributes: true,
    attributeFilter: ['aria-hidden', 'aria-label', 'class', 'data-kg-workspace-visible-viewport-occluder', 'style'],
    childList: true,
    subtree: true,
  })
  const resizeObserver = typeof ownerWindow.ResizeObserver === 'function'
    ? new ownerWindow.ResizeObserver(scheduleLayoutCheck)
    : null
  resizeObserver?.observe(viewport)
  for (const candidate of Array.from(
    ownerDocument.querySelectorAll(GEO_MAP_OCCLUDING_PANEL_SELECTOR),
  )) resizeObserver?.observe(candidate)
  ownerDocument.addEventListener('transitionend', scheduleLayoutCheck, true)
  ownerDocument.addEventListener('animationend', scheduleLayoutCheck, true)

  return () => {
    if (disposed) return
    disposed = true
    if (timer !== null) ownerWindow.clearTimeout(timer)
    mutations.disconnect()
    resizeObserver?.disconnect()
    ownerDocument.removeEventListener('transitionend', scheduleLayoutCheck, true)
    ownerDocument.removeEventListener('animationend', scheduleLayoutCheck, true)
  }
}

export function geoMapViewportPaddingKey(
  padding: GeoMapViewportPadding,
): string {
  return [padding.top, padding.right, padding.bottom, padding.left].join(',')
}
