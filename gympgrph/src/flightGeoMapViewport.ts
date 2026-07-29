export type FlightGeoMapViewportPadding = Readonly<{
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

const OCCLUDING_PANEL_SELECTOR = [
  '[aria-label="Markdown Workspace"]',
  '[aria-label="Floating panel"]',
  '[aria-label="Geospatial panel"]',
].join(', ')

const PANEL_CLEARANCE_PX = 16

function readVisibleRect(element: Element): ViewportRect | null {
  const htmlElement = element as HTMLElement
  const rect = htmlElement.getBoundingClientRect?.()
  if (!rect || rect.width <= 0 || rect.height <= 0) return null
  if (typeof window !== 'undefined') {
    const style = window.getComputedStyle?.(htmlElement)
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

/**
 * Reads the real left/right area covered by workspace and floating panels.
 * Flight maps are full-canvas, so camera placement follows the visual aperture
 * instead of the canvas's nominal center.
 */
export function readFlightGeoMapOcclusionPadding(
  viewport: HTMLElement | null,
): FlightGeoMapViewportPadding {
  const viewportRect = viewport ? readVisibleRect(viewport) : null
  if (!viewportRect || typeof document === 'undefined') {
    return Object.freeze({ bottom: 0, left: 0, right: 0, top: 0 })
  }
  const horizontalCenter = viewportRect.left + viewportRect.width / 2
  let left = 0
  let right = 0
  for (const candidate of Array.from(
    document.querySelectorAll(OCCLUDING_PANEL_SELECTOR),
  )) {
    if (candidate === viewport) continue
    const candidateRect = readVisibleRect(candidate)
    if (!candidateRect || !overlaps(viewportRect, candidateRect)) continue
    // A floating panel can overlap the viewport centre while still covering
    // one whole edge (the compact 1100px Flight layout is exactly that case).
    // Classify it by its own centre rather than requiring it to sit wholly on
    // one side of the map centre; otherwise the only visible map aperture is
    // treated as if it were unobstructed.
    const candidateCenter = candidateRect.left + candidateRect.width / 2
    if (candidateCenter <= horizontalCenter) {
      left = Math.max(left, candidateRect.right - viewportRect.left + PANEL_CLEARANCE_PX)
    } else {
      right = Math.max(right, viewportRect.right - candidateRect.left + PANEL_CLEARANCE_PX)
    }
  }
  return Object.freeze({ bottom: 0, left, right, top: 0 })
}

export function readFlightGeoMapViewportPadding(
  map: any,
): FlightGeoMapViewportPadding {
  const viewport = map?.getContainer?.() as HTMLElement | undefined
  const width = Math.max(1, Number(viewport?.clientWidth) || 1)
  const height = Math.max(1, Number(viewport?.clientHeight) || 1)
  const occlusion = readFlightGeoMapOcclusionPadding(viewport || null)
  const horizontalBase = Math.max(16, Math.min(72, width * 0.08))
  const verticalBase = Math.max(16, Math.min(88, height * 0.1))
  return Object.freeze({
    bottom: Math.max(verticalBase, Math.min(112, height * 0.14)),
    left: Math.max(horizontalBase, occlusion.left),
    right: Math.max(horizontalBase, occlusion.right),
    top: verticalBase,
  })
}

export function flightGeoMapViewportPaddingKey(
  padding: FlightGeoMapViewportPadding,
): string {
  return [padding.top, padding.right, padding.bottom, padding.left].join(',')
}
