import type * as d3 from 'd3'

export type PendingLink = {
  mode: 'create' | 'update-source' | 'update-target'
  fromId: string
  fromPortKey?: string | null
  start?: { x: number; y: number } | null
  end?: { x: number; y: number } | null
  phase?: 'drawing' | 'temporary'
}

export type TempLinkSelection = d3.Selection<SVGLineElement, unknown, SVGGElement, unknown> | null

const readEndpointElement = (
  tempLinkSelRef: { current: TempLinkSelection },
): SVGCircleElement | null => {
  const line = tempLinkSelRef.current?.node() || null
  const parent = line?.parentElement || null
  return parent?.querySelector<SVGCircleElement>('[data-kg-layer="temp-link-endpoint"]') || null
}

const setEndpointPosition = (
  endpoint: SVGCircleElement | null,
  point: { x: number; y: number },
) => {
  if (!endpoint) return
  endpoint.setAttribute('cx', String(point.x))
  endpoint.setAttribute('cy', String(point.y))
}

export const readPendingLinkPhase = (pending: PendingLink | null | undefined): 'drawing' | 'temporary' =>
  pending?.phase === 'temporary' ? 'temporary' : 'drawing'

export const showPendingEdgeVisual = (
  tempLinkSelRef: { current: TempLinkSelection },
  pending: PendingLink,
) => {
  const temporary = readPendingLinkPhase(pending) === 'temporary'
  const line = tempLinkSelRef.current
  if (line) {
    line
      .style('display', null)
      .style('pointer-events', temporary ? 'stroke' : 'none')
      .style('cursor', temporary ? 'pointer' : null)
      .attr('stroke-opacity', temporary ? 0.9 : 0.6)
      .attr('stroke-dasharray', temporary ? '7,4' : '4,2')
      .attr('data-kg-temporary-edge', temporary ? 'true' : null)
  }

  const endpoint = readEndpointElement(tempLinkSelRef)
  if (!endpoint) return
  endpoint.style.display = ''
  endpoint.style.pointerEvents = temporary ? 'all' : 'none'
  endpoint.style.cursor = temporary ? 'pointer' : ''
  endpoint.setAttribute('aria-hidden', temporary ? 'false' : 'true')
  endpoint.setAttribute('tabindex', temporary ? '0' : '-1')
  if (temporary) endpoint.setAttribute('data-kg-temporary-edge', 'true')
  else endpoint.removeAttribute('data-kg-temporary-edge')
  const point = pending.end || pending.start
  if (point) setEndpointPosition(endpoint, point)
}

export const movePendingEdgeEnd = (
  tempLinkSelRef: { current: TempLinkSelection },
  linkDragRef: { current: PendingLink | null },
  point: { x: number; y: number },
): boolean => {
  const pending = linkDragRef.current
  if (!pending || readPendingLinkPhase(pending) !== 'drawing') return false
  pending.end = point
  tempLinkSelRef.current?.attr('x2', point.x).attr('y2', point.y)
  setEndpointPosition(readEndpointElement(tempLinkSelRef), point)
  return true
}

export const nudgePendingEdgeEnd = (
  tempLinkSelRef: { current: TempLinkSelection },
  linkDragRef: { current: PendingLink | null },
  delta: { x: number; y: number },
): boolean => {
  const pending = linkDragRef.current
  const current = pending?.end || pending?.start
  if (!pending || !current) return false
  const point = {
    x: current.x + delta.x,
    y: current.y + delta.y,
  }
  pending.end = point
  tempLinkSelRef.current?.attr('x2', point.x).attr('y2', point.y)
  setEndpointPosition(readEndpointElement(tempLinkSelRef), point)
  return true
}

export const freezePendingEdgeAt = (
  tempLinkSelRef: { current: TempLinkSelection },
  linkDragRef: { current: PendingLink | null },
  point: { x: number; y: number },
): boolean => {
  const pending = linkDragRef.current
  if (!pending || pending.mode !== 'create' || readPendingLinkPhase(pending) !== 'drawing') return false
  pending.end = point
  pending.phase = 'temporary'
  tempLinkSelRef.current?.attr('x2', point.x).attr('y2', point.y)
  setEndpointPosition(readEndpointElement(tempLinkSelRef), point)
  showPendingEdgeVisual(tempLinkSelRef, pending)
  return true
}

export const resumeTemporaryEdge = (
  tempLinkSelRef: { current: TempLinkSelection },
  linkDragRef: { current: PendingLink | null },
): boolean => {
  const pending = linkDragRef.current
  if (!pending || readPendingLinkPhase(pending) !== 'temporary') return false
  pending.phase = 'drawing'
  showPendingEdgeVisual(tempLinkSelRef, pending)
  return true
}

export const hidePendingEdgeVisual = (
  tempLinkSelRef: { current: TempLinkSelection },
) => {
  tempLinkSelRef.current
    ?.style('display', 'none')
    .style('pointer-events', 'none')
    .style('cursor', null)
    .attr('data-kg-temporary-edge', null)
  const endpoint = readEndpointElement(tempLinkSelRef)
  if (!endpoint) return
  endpoint.style.display = 'none'
  endpoint.style.pointerEvents = 'none'
  endpoint.style.cursor = ''
  endpoint.setAttribute('aria-hidden', 'true')
  endpoint.setAttribute('tabindex', '-1')
  endpoint.removeAttribute('data-kg-temporary-edge')
}

export const readTemporaryEdgeEndpointElement = readEndpointElement
