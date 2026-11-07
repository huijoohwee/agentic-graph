import type { SequenceModel } from './sequenceModel'
import { sequenceSvgEscape as escape, sequenceParticipantLabel, sequenceParticipantSvg, sequenceParticipantNode, sequenceParticipantAnchor, sequenceParticipantPortPadding } from './sequencePresentation'
import { resolveSequenceCanvasLayout, sequenceCanvasTextPreview as preview, sequenceCanvasTextWidth as textWidth, type SequenceCanvasLayoutOptions } from './sequenceCanvasLayout'

type Point = { x: number; y: number }
type Box = Point & { width: number; height: number }
const BADGE_HEIGHT = 60, GAP = 12
const intersects = (a: Box, b: Box) => Math.abs(a.x - b.x) < (a.width + b.width) / 2 + GAP && Math.abs(a.y - b.y) < (a.height + b.height) / 2 + GAP

/** Compact, deterministic placement; every authored occurrence keeps its own reachable target. */
export function sequenceTopologySvg(model: SequenceModel, options: SequenceCanvasLayoutOptions = {}): string {
  const { card, positions } = resolveSequenceCanvasLayout(model, 'connections', options)
  const CARD_WIDTH = card.width, CARD_HEIGHT = card.height
  const points = new Map(Object.entries(positions))
  const occupied: Box[] = [...points.values()].map(point => ({ ...point, width: CARD_WIDTH, height: CARD_HEIGHT }))
  const bounds = { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity }
  const include = (point: Point, padding = 24) => {
    bounds.left = Math.min(bounds.left, point.x - padding); bounds.top = Math.min(bounds.top, point.y - padding)
    bounds.right = Math.max(bounds.right, point.x + padding); bounds.bottom = Math.max(bounds.bottom, point.y + padding)
  }
  const includeBox = (box: Box, padding = 24) => {
    include({ x: box.x - box.width / 2, y: box.y - box.height / 2 }, padding)
    include({ x: box.x + box.width / 2, y: box.y + box.height / 2 }, padding)
  }
  const participantPadding = Math.max(24, sequenceParticipantPortPadding(card, options.schema))
  occupied.forEach(box => includeBox(box, participantPadding))
  if (!occupied.length) { include({ x: 0, y: 0 }); include({ x: 44, y: 44 }) }
  const allocate = (ideal: Point, width: number): Box => {
    let best: Box | null = null, bestScore = Infinity
    const area = (bounds.right - bounds.left) * (bounds.bottom - bounds.top)
    const consider = (x: number, y: number) => {
      const box = { x, y, width, height: BADGE_HEIGHT }
      const expandedArea = (Math.max(bounds.right, x + width / 2 + 16) - Math.min(bounds.left, x - width / 2 - 16))
        * (Math.max(bounds.bottom, y + BADGE_HEIGHT / 2 + 16) - Math.min(bounds.top, y - BADGE_HEIGHT / 2 - 16))
      const score = (expandedArea - area) * 2 + (x - ideal.x) ** 2 + (y - ideal.y) ** 2
      if (score >= bestScore || occupied.some(other => intersects(box, other))) return
      best = box; bestScore = score
    }
    consider(ideal.x, ideal.y)
    // Candidate edges pack into nearby gaps instead of spreading every repetition by a grid cell.
    for (const other of occupied) {
      const dx = (other.width + width) / 2 + GAP, dy = (other.height + BADGE_HEIGHT) / 2 + GAP
      for (const direction of [-1, 1]) {
        consider(ideal.x, other.y + direction * dy); consider(other.x, other.y + direction * dy)
        consider(other.x + direction * dx, ideal.y); consider(other.x + direction * dx, other.y)
      }
    }
    // The outer candidate makes allocation finite even for the maximum authored inventory.
    consider(bounds.right + width / 2 + GAP, ideal.y)
    if (!best) throw new Error('Sequence connection layout exceeded its target budget')
    occupied.push(best); includeBox(best)
    return best
  }
  const messages = model.events.map(event => {
    const from = points.get(event.from)!, to = points.get(event.to)!, same = event.from === event.to
    const width = Math.min(196, Math.max(144, textWidth(event.label, 14) + 24))
    const badge = allocate(same ? { x: from.x + CARD_WIDTH / 2 + width / 2 + GAP, y: from.y }
      : { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 }, width)
    const anchor = (id: string, point: Point) => sequenceParticipantAnchor(sequenceParticipantNode(id, point, card), badge, card, options.schema)
    const start = anchor(event.from, from), end = anchor(event.to, to)
    // Endpoint controls point out of the cards; a common tangent joins both curves at the badge.
    const outward = (center: Point, endpoint: Point, offset: number) => {
      const horizontal = endpoint.x !== center.x
      return horizontal ? { x: endpoint.x + Math.sign(endpoint.x - center.x) * 36, y: endpoint.y + offset }
        : { x: endpoint.x + offset, y: endpoint.y + Math.sign(endpoint.y - center.y) * 36 }
    }
    const entry = outward(from, start, same ? -24 : 0)
    const exit = outward(to, end, same ? 24 : 0)
    const distance = Math.hypot(end.x - start.x, end.y - start.y) || 1
    const tangent = { x: (end.x - start.x) / distance * 36, y: (end.y - start.y) / distance * 36 }
    const before = { x: badge.x - tangent.x, y: badge.y - tangent.y }
    const after = { x: badge.x + tangent.x, y: badge.y + tangent.y }
    for (const point of [entry, exit, before, after]) include(point)
    const path = `M${start.x},${start.y}C${entry.x},${entry.y} ${before.x},${before.y} ${badge.x},${badge.y}C${after.x},${after.y} ${exit.x},${exit.y} ${end.x},${end.y}`
    const title = `${sequenceParticipantLabel(model, event.from)} → ${sequenceParticipantLabel(model, event.to)}: ${event.label}`
    const metadata = preview(`${event.ordinal} · ${event.protocol || event.kind}`, width - 32, 11)
    const pillWidth = Math.min(width - 20, textWidth(metadata, 11) + 20)
    const connection = event.kind === 'note' ? '' : `<path d="${path}" pointer-events="none" class="sequence-message" clip-path="url(#sequence-topology-route-clip)" fill="none" stroke="currentColor" vector-effect="non-scaling-stroke" marker-end="url(#sequence-topology-arrow)" ${event.kind === 'reply' || event.kind === 'async' ? 'stroke-dasharray="5 4"' : ''}/>`
    return `<g data-sequence-event="${escape(event.id)}" role="button" tabindex="0" aria-label="${event.kind === 'note' ? 'Note' : `Step ${event.ordinal}`}: ${escape(event.label)}"><title>${escape(title)}</title>${connection}<rect x="${badge.x - width / 2}" y="${badge.y - BADGE_HEIGHT / 2}" width="${width}" height="${BADGE_HEIGHT}" rx="12" class="sequence-connection-badge"/><text x="${badge.x}" y="${badge.y - 6}" font-size="14" class="sequence-event-label">${escape(preview(event.label, width - 20, 14))}</text><rect x="${badge.x - pillWidth / 2}" y="${badge.y + 3}" width="${pillWidth}" height="20" rx="10" class="sequence-event-pill"/><text x="${badge.x}" y="${badge.y + 17}" font-size="11" class="sequence-event-meta">${escape(metadata)}</text></g>`
  }).join('')
  const people = model.participants.map(person => {
    const point = points.get(person.id)!, name = preview(person.label, CARD_WIDTH * .6, 14)
    return `<g data-sequence-participant="${escape(person.id)}" data-sequence-x="${point.x}" data-sequence-y="${point.y}" data-sequence-width="${CARD_WIDTH}" data-sequence-height="${CARD_HEIGHT}" role="button" tabindex="0" aria-label="Move participant: ${escape(person.label)}"><title>${escape(person.label)}</title>${sequenceParticipantSvg(person, point, card, name, options.schema)}</g>`
  }).join('')
  // One shared vector clip keeps every route beneath every label while preserving local path bindings.
  const rectangle = (left: number, top: number, right: number, bottom: number) => `M${left},${top}H${right}V${bottom}H${left}Z`
  const cutouts = occupied.slice(model.participants.length).map(box => rectangle(box.x - box.width / 2, box.y - box.height / 2, box.x + box.width / 2, box.y + box.height / 2)).join('')
  const routeClip = `<clipPath id="sequence-topology-route-clip" clipPathUnits="userSpaceOnUse"><path clip-rule="evenodd" d="${rectangle(bounds.left, bounds.top, bounds.right, bounds.bottom)}${cutouts}"/></clipPath>`
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${bounds.left} ${bounds.top} ${bounds.right - bounds.left} ${bounds.bottom - bounds.top}" role="group" aria-label="Sequence connections" style="font:14px system-ui; color:var(--sequence-ink,#243047)"><defs>${routeClip}<marker id="sequence-topology-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="context-stroke"/></marker></defs><g text-anchor="middle" fill="currentColor">${messages}${people}</g></svg>`
}
