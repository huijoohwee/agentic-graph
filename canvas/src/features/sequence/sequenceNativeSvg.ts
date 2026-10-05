import type { SequenceModel } from './sequenceModel'
import { sequenceSvgEscape as escape } from './sequencePresentation'
import { resolveSequenceCanvasLayout, sequenceCanvasTextPreview as preview, type SequenceCanvasLayoutOptions } from './sequenceCanvasLayout'

/** Horizontal presentation edits preserve authored participant order and every timed row. */
export function sequenceNativeSvg(model: SequenceModel, options: SequenceCanvasLayoutOptions = {}): string {
  const { card, positions } = resolveSequenceCanvasLayout(model, 'lifelines', options)
  const row = 64, top = card.height + 68, footer = top + model.events.length * row + 40
  const height = footer + card.height + 16
  const x = (id: string) => positions[id]!.x
  const y = (index: number) => top + index * row
  const centers = Object.values(positions).map(point => point.x)
  const left = Math.min(0, ...centers.map(center => center - card.width / 2 - 24))
  const right = Math.max(left + 480, ...centers.map(center => center + card.width / 2 + 24),
    ...model.events.filter(event => event.from === event.to).map(event => x(event.from) + 194))
  const width = right - left
  const people = model.participants.map(person => {
    const point = positions[person.id]!, name = escape(preview(person.label, card.width - 24, 13))
    const glyph = person.actor ? '<circle cx="0" cy="-5" r="4"/><path d="M-8 10C-8 0 8 0 8 10"/>'
      : '<rect x="-8" y="-9" width="16" height="18" rx="3"/><path d="M-4-3H4M-4 3H4"/>'
    const label = (center: number) => `<rect x="${point.x - card.width / 2}" y="${center - card.height / 2}" width="${card.width}" height="${card.height}" rx="10" class="sequence-participant"/><g transform="translate(${point.x - card.width / 2 + 24},${center - 14})" class="sequence-participant-glyph" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6">${glyph}</g><text x="${point.x - card.width / 2 + 42}" y="${center - 11}" text-anchor="start" font-size="10" class="sequence-participant-type">${person.actor ? 'ACTOR' : 'PARTICIPANT'}</text><text x="${point.x}" y="${center + 17}" class="sequence-participant-name">${name}</text>`
    const activations = model.activations.filter(activation => activation.participant === person.id).map(activation => `<rect x="${point.x - 5}" y="${y(Math.max(0, activation.first - 1))}" width="10" height="${Math.max(1, activation.last - activation.first + 1) * row}" class="sequence-participant"/>`).join('')
    return `<g data-sequence-participant="${escape(person.id)}" data-sequence-x="${point.x}" data-sequence-y="${point.y}" data-sequence-width="${card.width}" data-sequence-height="${card.height}" role="button" tabindex="0" aria-label="Move participant: ${escape(person.label)}"><title>${escape(person.label)}</title>${label(point.y)}<line x1="${point.x}" x2="${point.x}" y1="${card.height + 24}" y2="${footer - 8}" stroke="currentColor" stroke-dasharray="4 4" opacity=".45"/>${label(footer + card.height / 2)}${activations}</g>`
  }).join('')
  const branches = model.branches.map(branch => `<rect x="${left + 25}" y="${y(branch.first) - 30}" width="${width - 50}" height="${Math.max(1, branch.last - branch.first) * row}" fill="none" stroke="currentColor" stroke-dasharray="3 3" opacity=".5"/><text x="${left + 40}" y="${y(branch.first) - 12}" text-anchor="start"><title>${escape(branch.label)}</title>${escape(preview(branch.label, width - 80, 13))}</text>`).join('')
  const messages = model.events.map((event, index) => {
    const from = x(event.from), to = x(event.to), lineY = y(index), self = event.from === event.to
    if (event.kind === 'note') {
      const noteWidth = Math.max(160, Math.abs(to - from) + 160)
      return `<g data-sequence-event="${escape(event.id)}" role="button" tabindex="0" aria-label="Note: ${escape(event.label)}"><title>${escape(event.label)}</title><rect x="${Math.min(from, to) - 80}" y="${lineY - 20}" width="${noteWidth}" height="40" class="sequence-participant"/><text x="${(from + to) / 2}" y="${lineY + 4}">${escape(preview(event.label, noteWidth - 16, 13))}</text></g>`
    }
    const path = self ? `M${from},${lineY}h65v24h-65` : `M${from},${lineY}H${to}`
    const labelWidth = self ? 224 : Math.max(80, Math.abs(to - from) - 28)
    return `<g data-sequence-event="${escape(event.id)}" role="button" tabindex="0" aria-label="Step ${event.ordinal}: ${escape(event.label)}"><title>${escape(event.from)} → ${escape(event.to)}: ${escape(event.label)}</title><rect x="${Math.min(from, to) - 18}" y="${lineY - 24}" width="${Math.max(100, Math.abs(to - from) + 36)}" height="48" fill="transparent"/><path d="${path}" class="sequence-message" stroke="currentColor" fill="none" marker-end="url(#sequence-arrow)" ${event.arrow.startsWith('--') ? 'stroke-dasharray="4 3"' : ''}/><text x="${self ? from + 70 : (from + to) / 2}" y="${lineY - 9}">${escape(preview(event.label, labelWidth, 13))}</text><circle cx="${from}" cy="${lineY}" r="11" fill="currentColor"/><text x="${from}" y="${lineY + 4}" fill="var(--sequence-surface, white)" font-size="10">${event.ordinal}</text></g>`
  }).join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${left} 0 ${width} ${height}" role="group" aria-label="Sequence Diagram" style="font:13px system-ui; color:var(--sequence-ink,#243047)"><defs><marker id="sequence-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="currentColor"/></marker></defs><g text-anchor="middle" fill="currentColor">${branches}${people}${messages}</g></svg>`
}
