import type { SequenceModel } from './sequenceModel'
import { sequenceSvgEscape as escape, sequenceParticipantLabel } from './sequencePresentation'

type Point = { x: number; y: number }
type Box = Point & { width: number; height: number }
const intersects = (a: Box, b: Box) => Math.abs(a.x - b.x) < (a.width + b.width) / 2 + 12 && Math.abs(a.y - b.y) < (a.height + b.height) / 2 + 12

/** Allocate distinct reachable event targets, including repeated, reversed and self connections. */
export function sequenceTopologySvg(model: SequenceModel): string {
  const columns = Math.max(1, Math.min(4, Math.ceil(Math.sqrt(model.participants.length))))
  const points = new Map(model.participants.map((person, index) => [person.id, { x: 270 + (index % columns) * 380, y: 180 + Math.floor(index / columns) * 300 }]))
  const occupied: Box[] = [...points.values()].map(point => ({ ...point, width: 208, height: 80 }))
  const bounds = { left: 0, top: 0, right: columns * 380 + 160, bottom: Math.ceil(model.participants.length / columns) * 300 + 200 }
  const include = (point: Point, padding = 32) => {
    bounds.left = Math.min(bounds.left, point.x - padding); bounds.top = Math.min(bounds.top, point.y - padding)
    bounds.right = Math.max(bounds.right, point.x + padding); bounds.bottom = Math.max(bounds.bottom, point.y + padding)
  }
  const allocate = (ideal: Point, width: number): Box => {
    // A finite search suffices: each ring has more slots than the bounded authored model.
    for (let ring = 0; ring <= model.events.length + model.participants.length; ring++) {
      for (let row = -ring; row <= ring; row++) for (let column = -ring; column <= ring; column++) {
        if (Math.max(Math.abs(row), Math.abs(column)) !== ring) continue
        const box = { x: ideal.x + column * 240, y: ideal.y + row * 64, width, height: 44 }
        if (occupied.some(other => intersects(box, other))) continue
        occupied.push(box); include({ x: box.x - width / 2, y: box.y - 22 }); include({ x: box.x + width / 2, y: box.y + 22 })
        return box
      }
    }
    throw new Error('Sequence connection layout exceeded its target budget')
  }
  const messages = model.events.map(event => {
    const from = points.get(event.from)!, to = points.get(event.to)!, same = event.from === event.to
    const label = `${event.ordinal} · ${event.protocol || event.kind}`
    const badge = allocate(same ? { x: from.x + 240, y: from.y } : { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 }, Math.min(210, Math.max(74, label.length * 7 + 24)))
    const anchor = (center: Point, offset = 0) => {
      const dx = badge.x - center.x, dy = badge.y - center.y
      const scale = Math.min(dx ? 104 / Math.abs(dx) : Infinity, dy ? 40 / Math.abs(dy) : Infinity)
      const vertical = Math.abs(dx) / 104 >= Math.abs(dy) / 40
      return { x: center.x + (offset && !vertical ? Math.max(-89, Math.min(89, dx * scale)) + offset : dx * scale), y: center.y + (offset && vertical ? Math.max(-25, Math.min(25, dy * scale)) + offset : dy * scale) }
    }
    const start = anchor(from, same ? -15 : 0), end = anchor(to, same ? 15 : 0)
    // Endpoint controls point out of their boxes; one shared tangent joins the badge.
    const entry = { x: (start.x + badge.x) / 2, y: (start.y + badge.y) / 2 }
    const exit = { x: (end.x + badge.x) / 2, y: (end.y + badge.y) / 2 }
    const distance = Math.hypot(end.x - start.x, end.y - start.y) || 1
    const tangent = { x: (end.x - start.x) / distance * 48, y: (end.y - start.y) / distance * 48 }
    const before = { x: badge.x - tangent.x, y: badge.y - tangent.y }
    const after = { x: badge.x + tangent.x, y: badge.y + tangent.y }
    for (const point of [entry, exit, before, after]) include(point)
    const path = `M${start.x},${start.y}C${entry.x},${entry.y} ${before.x},${before.y} ${badge.x},${badge.y}C${after.x},${after.y} ${exit.x},${exit.y} ${end.x},${end.y}`
    const title = `${sequenceParticipantLabel(model, event.from)} → ${sequenceParticipantLabel(model, event.to)}: ${event.label}`
    const connection = event.kind === 'note' ? '' : `<path d="${path}" pointer-events="none" class="sequence-message" fill="none" stroke="currentColor" marker-end="url(#sequence-topology-arrow)" ${event.kind === 'reply' || event.kind === 'async' ? 'stroke-dasharray="5 4"' : ''}/>`
    return `<g data-sequence-event="${escape(event.id)}" role="button" tabindex="0" aria-label="${event.kind === 'note' ? 'Note' : `Step ${event.ordinal}`}: ${escape(event.label)}"><title>${escape(title)}</title>${connection}<rect x="${badge.x - badge.width / 2}" y="${badge.y - 22}" width="${badge.width}" height="44" rx="10" class="sequence-connection-badge"/><text x="${badge.x}" y="${badge.y + 4}">${escape(label.slice(0, 26))}</text></g>`
  }).join('')
  const people = model.participants.map(person => {
    const point = points.get(person.id)!
    const lines = person.label.match(/.{1,25}(?:\s|$)|.{1,25}/g) || [person.label]
    return `<g data-sequence-participant="${escape(person.id)}"><title>${escape(person.label)}</title><rect x="${point.x - 104}" y="${point.y - 40}" width="208" height="80" rx="12" class="sequence-participant"/><text x="${point.x}" y="${point.y - 12}" font-size="10" opacity=".7">${person.actor ? 'ACTOR' : 'PARTICIPANT'}</text><text x="${point.x}" y="${point.y + 7}">${lines.slice(0, 2).map((line, index) => `<tspan x="${point.x}" dy="${index ? 16 : 0}">${escape(line.trim())}</tspan>`).join('')}</text></g>`
  }).join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${bounds.left} ${bounds.top} ${bounds.right - bounds.left} ${bounds.bottom - bounds.top}" role="group" aria-label="Sequence connections" style="font:13px system-ui; color:var(--sequence-ink,#243047)"><defs><marker id="sequence-topology-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="currentColor"/></marker></defs><g text-anchor="middle" fill="currentColor">${messages}${people}</g></svg>`
}
