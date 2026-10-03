import type { SequenceModel } from './sequenceModel'

/** Mermaid emits message elements in authored order. Bind only a complete, exact projection. */
export function bindSequenceSvg(host: HTMLElement, model: SequenceModel, mermaid: boolean): void {
  const svg = host.querySelector('svg')
  if (!svg) throw new Error('Sequence SVG is missing')
  if (!mermaid) {
    if (svg.querySelectorAll('[data-sequence-event]').length !== model.events.length) throw new Error('Native sequence message count changed')
    return
  }
  const lines = [...svg.querySelectorAll<SVGGraphicsElement>('.messageLine0, .messageLine1')]
  const texts = [...svg.querySelectorAll<SVGGraphicsElement>('.messageText')]
  const numbers = [...svg.querySelectorAll<SVGGraphicsElement>('.sequenceNumber')]
  const notes = [...svg.querySelectorAll<SVGGElement>('g[data-et="note"]')]
  const messages = model.events.filter(event => event.kind !== 'note')
  if (lines.length !== messages.length || texts.length !== messages.length || notes.length !== model.events.length - messages.length) throw new Error('Mermaid sequence projection does not match authored messages')
  const annotate = (group: SVGGElement, id: string, label: string) => {
    group.setAttribute('data-sequence-event', id)
    group.setAttribute('role', 'button'); group.setAttribute('tabindex', '0')
    group.setAttribute('aria-label', label)
  }
  model.events.filter(event => event.kind === 'note').forEach((event, index) => annotate(notes[index]!, event.id, `Note: ${event.label}`))
  messages.forEach((event, index) => {
    const line = lines[index]!, text = texts[index]!
    const group = document.createElementNS('http://www.w3.org/2000/svg', 'g')
    annotate(group, event.id, `Step ${event.ordinal}: ${event.label}`)
    line.classList.add('sequence-message')
    line.parentNode!.insertBefore(group, line)
    group.append(line, text)
    if (numbers[index]) {
      const number = numbers[index]!
      const marker = number.previousElementSibling
      if (marker?.getAttribute('marker-start')?.includes('sequencenumber')) group.append(marker)
      group.append(number)
    }
    const bounds = group.getBBox()
    const hit = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
    hit.setAttribute('x', String(bounds.x - 8)); hit.setAttribute('y', String(bounds.y - 8))
    hit.setAttribute('width', String(Math.max(44, bounds.width + 16))); hit.setAttribute('height', String(Math.max(44, bounds.height + 16)))
    hit.setAttribute('fill', 'transparent'); group.prepend(hit)
  })
}
