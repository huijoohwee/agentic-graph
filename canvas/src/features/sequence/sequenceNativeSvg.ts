import type { SequenceModel } from './sequenceModel'
import { sequenceSvgEscape as escape } from './sequencePresentation'

/** Original native geometry. Source ordinal and source IDs remain exact in both renderers. */
export function sequenceNativeSvg(model: SequenceModel): string {
  const gap = 240, margin = 120, row = 64, top = 120
  const width = Math.max(480, model.participants.length * gap)
  const height = top + model.events.length * row + 110
  const x = (id: string) => margin + model.participants.findIndex(p => p.id === id) * gap
  const y = (index: number) => top + index * row
  const people = model.participants.map(p => {
    const actor = p.actor ? `<g stroke="currentColor" fill="none"><circle cx="${x(p.id)}" cy="23" r="8"/><path d="M${x(p.id)},31v20m-16,-13h32m-16,13l-12,14m12,-14l12,14"/></g><text x="${x(p.id)}" y="85">${escape(p.label)}</text>`
      : `<rect x="${x(p.id) - 88}" y="18" width="176" height="52" rx="6" class="sequence-participant"/><text x="${x(p.id)}" y="48">${escape(p.label)}</text>`
    return `${actor}<line x1="${x(p.id)}" x2="${x(p.id)}" y1="90" y2="${height - 80}" stroke="currentColor" stroke-dasharray="4 4" opacity=".45"/><rect x="${x(p.id) - 88}" y="${height - 70}" width="176" height="48" rx="6" class="sequence-participant"/><text x="${x(p.id)}" y="${height - 41}">${escape(p.label)}</text>`
  }).join('')
  const branches = model.branches.map(branch => `<rect x="25" y="${y(branch.first) - 30}" width="${width - 50}" height="${Math.max(1, branch.last - branch.first) * row}" fill="none" stroke="currentColor" stroke-dasharray="3 3" opacity=".5"/><text x="40" y="${y(branch.first) - 12}" text-anchor="start">${escape(branch.label)}</text>`).join('')
  const activations = model.activations.map(a => `<rect x="${x(a.participant) - 5}" y="${y(Math.max(0, a.first - 1))}" width="10" height="${Math.max(1, a.last - a.first + 1) * row}" class="sequence-participant"/>`).join('')
  const messages = model.events.map((event, index) => {
    const from = x(event.from), to = x(event.to), lineY = y(index), self = from === to
    if (event.kind === 'note') return `<g data-sequence-event="${escape(event.id)}" role="button" tabindex="0" aria-label="Note: ${escape(event.label)}"><rect x="${Math.min(from, to) - 80}" y="${lineY - 20}" width="${Math.max(160, Math.abs(to - from) + 160)}" height="40" class="sequence-participant"/><text x="${(from + to) / 2}" y="${lineY + 4}">${escape(event.label)}</text></g>`
    const path = self ? `M${from},${lineY}h65v24h-65` : `M${from},${lineY}H${to}`
    return `<g data-sequence-event="${escape(event.id)}" role="button" tabindex="0" aria-label="Step ${event.ordinal}: ${escape(event.label)}"><title>${escape(event.from)} → ${escape(event.to)}: ${escape(event.label)}</title><rect x="${Math.min(from, to) - 18}" y="${lineY - 24}" width="${Math.max(100, Math.abs(to - from) + 36)}" height="48" fill="transparent"/><path d="${path}" class="sequence-message" stroke="currentColor" fill="none" marker-end="url(#sequence-arrow)" ${event.arrow.startsWith('--') ? 'stroke-dasharray="4 3"' : ''}/><text x="${self ? from + 70 : (from + to) / 2}" y="${lineY - 9}">${escape(event.label)}</text><circle cx="${from}" cy="${lineY}" r="11" fill="currentColor"/><text x="${from}" y="${lineY + 4}" fill="var(--sequence-surface, white)" font-size="10">${event.ordinal}</text></g>`
  }).join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="Sequence Diagram" style="font:13px system-ui; color:var(--sequence-ink,#243047)"><defs><marker id="sequence-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="currentColor"/></marker></defs><g text-anchor="middle">${branches}${people}${activations}${messages}</g></svg>`
}
