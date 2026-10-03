import type { SequenceModel } from './sequenceModel'
import { sequenceSvgEscape as escape, sequenceParticipantLabel } from './sequencePresentation'

/** Authored participants and individual events; connections never aggregate repeated steps. */
export function sequenceTopologySvg(model: SequenceModel): string {
  const columns = Math.max(1, Math.min(4, Math.ceil(Math.sqrt(model.participants.length))))
  const width = columns * 380 + 160, height = Math.ceil(model.participants.length / columns) * 300 + 200
  const points = new Map(model.participants.map((person, index) => [person.id, { x: 270 + (index % columns) * 380, y: 180 + Math.floor(index / columns) * 300 }]))
  const connections = new Map<string, string[]>()
  for (const event of model.events) {
    const key = JSON.stringify([event.from, event.to].sort())
    connections.set(key, [...(connections.get(key) || []), event.id])
  }
  const messages = model.events.map(event => {
    const from = points.get(event.from)!, to = points.get(event.to)!
    const siblings = connections.get(JSON.stringify([event.from, event.to].sort()))!
    const lane = (siblings.indexOf(event.id) - (siblings.length - 1) / 2) * 38
    const dx = to.x - from.x, dy = to.y - from.y, distance = Math.hypot(dx, dy) || 1
    const nx = -dy / distance, ny = dx / distance
    const direction = model.participants.findIndex(p => p.id === event.from) <= model.participants.findIndex(p => p.id === event.to) ? 1 : -1
    const offset = Math.max(-130, Math.min(130, lane)) * direction
    const same = event.from === event.to
    const start = { x: from.x + dx / distance * 104, y: from.y + dy / distance * 40 }
    const end = { x: to.x - dx / distance * 104, y: to.y - dy / distance * 40 }
    const mid = { x: (from.x + to.x) / 2 + nx * offset, y: (from.y + to.y) / 2 + ny * offset }
    const loop = 72 + siblings.indexOf(event.id) * .5
    const path = same ? `M${from.x + 104},${from.y - 15}c${loop},${-loop} ${loop},${loop} 0,30` : `M${start.x},${start.y}Q${mid.x + nx * offset},${mid.y + ny * offset} ${end.x},${end.y}`
    const label = `${event.ordinal}${event.protocol ? ` · ${event.protocol}` : ` · ${event.kind}`}`
    const badgeWidth = Math.min(210, Math.max(74, label.length * 7 + 24))
    const labelX = same ? from.x + 180 : mid.x, labelY = same ? from.y : mid.y
    const title = `${sequenceParticipantLabel(model, event.from)} → ${sequenceParticipantLabel(model, event.to)}: ${event.label}`
    const connection = event.kind === 'note' ? '' : `<path d="${path}" fill="none" stroke="transparent" stroke-width="24"/><path d="${path}" class="sequence-message" fill="none" stroke="currentColor" marker-end="url(#sequence-topology-arrow)" ${event.kind === 'reply' || event.kind === 'async' ? 'stroke-dasharray="5 4"' : ''}/>`
    return `<g data-sequence-event="${escape(event.id)}" role="button" tabindex="0" aria-label="${event.kind === 'note' ? 'Note' : `Step ${event.ordinal}`}: ${escape(event.label)}"><title>${escape(title)}</title>${connection}<rect x="${labelX - badgeWidth / 2}" y="${labelY - 22}" width="${badgeWidth}" height="44" rx="10" class="sequence-connection-badge"/><text x="${labelX}" y="${labelY + 4}">${escape(label.slice(0, 26))}</text></g>`
  }).join('')
  const people = model.participants.map(person => {
    const point = points.get(person.id)!
    const lines = person.label.match(/.{1,25}(?:\s|$)|.{1,25}/g) || [person.label]
    return `<g data-sequence-participant="${escape(person.id)}"><title>${escape(person.label)}</title><rect x="${point.x - 104}" y="${point.y - 40}" width="208" height="80" rx="12" class="sequence-participant"/><text x="${point.x}" y="${point.y - 12}" font-size="10" opacity=".7">${person.actor ? 'ACTOR' : 'PARTICIPANT'}</text><text x="${point.x}" y="${point.y + 7}">${lines.slice(0, 2).map((line, index) => `<tspan x="${point.x}" dy="${index ? 16 : 0}">${escape(line.trim())}</tspan>`).join('')}</text></g>`
  }).join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="Sequence connections" style="font:13px system-ui; color:var(--sequence-ink,#243047)"><defs><marker id="sequence-topology-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="currentColor"/></marker></defs><g text-anchor="middle">${messages}${people}</g></svg>`
}
