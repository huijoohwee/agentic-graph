import type { SequenceModel, SequenceTimedEvent } from './sequenceModel'
import { sequenceEventState } from './sequencePresentation'

/** Mermaid emits message elements in authored order. Bind only a complete, exact projection. */
export function bindSequenceSvg(host: HTMLElement, model: SequenceModel, mermaid: boolean): void {
  const svg = host.querySelector('svg')
  if (!svg) throw new Error('Sequence SVG is missing')
  if (!mermaid) {
    if (svg.querySelectorAll('[data-sequence-event]').length !== model.events.length) throw new Error('Native sequence message count changed')
    return
  }
  svg.setAttribute('role', 'group')
  for (const element of svg.querySelectorAll('[data-et="participant"][data-id], [data-et="life-line"][data-id]')) {
    const id = element.getAttribute('data-id')!
    if (!model.participants.some(person => person.id === id)) throw new Error('Sequence participant identity does not match authored source')
    element.setAttribute('data-sequence-participant', id)
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

export type SequenceSvgPlayback = {
  update(current: SequenceTimedEvent | null, position: number, reducedMotion: boolean): void
  dispose(): void
}

/** Bind once per SVG and branch projection; the shared clock only changes visible state. */
export function createSequenceSvgPlayback(host: HTMLElement, events: readonly SequenceTimedEvent[]): SequenceSvgPlayback {
  const svg = host.querySelector('svg')
  if (!svg) throw new Error('Sequence SVG is missing')
  const eventsById = new Map(events.map(event => [event.id, event]))
  const participants = [...svg.querySelectorAll('[data-sequence-participant]')].map(element => ({
    element, id: element.getAttribute('data-sequence-participant'), current: undefined as boolean | undefined,
  }))
  const bindings = [...svg.querySelectorAll('[data-sequence-event]')].map(element => ({
    element, id: element.getAttribute('data-sequence-event')!,
    event: eventsById.get(element.getAttribute('data-sequence-event')!),
    path: element.querySelector<SVGGeometryElement>('.sequence-message'), length: undefined as number | undefined,
    current: undefined as boolean | undefined, state: undefined as string | undefined,
  }))
  const bindingsById = new Map(bindings.map(binding => [binding.id, binding]))
  let disposed = false, pulse: SVGCircleElement | null = null
  return {
    update(current, position, reducedMotion) {
      if (disposed || !host.contains(svg)) return
      for (const participant of participants) {
        const selected = participant.id === current?.from || participant.id === current?.to
        if (selected !== participant.current) {
          participant.element.setAttribute('data-sequence-current', String(selected)); participant.current = selected
        }
      }
      for (const binding of bindings) {
        const selected = binding.id === current?.id, state = sequenceEventState(binding.event, position)
        if (selected !== binding.current) {
          binding.element.setAttribute('data-sequence-current', String(selected))
          binding.element.setAttribute('aria-pressed', String(selected)); binding.current = selected
        }
        if (state !== binding.state) { binding.element.setAttribute('data-sequence-state', state); binding.state = state }
      }
      const binding = current && bindingsById.get(current.id), event = binding?.event, path = binding?.path
      if (reducedMotion || !binding || binding.state !== 'active' || !event?.durationMs || !path?.getTotalLength || !path.getPointAtLength) {
        pulse?.remove(); return
      }
      binding.length ??= path.getTotalLength()
      const point = path.getPointAtLength(binding.length * Math.min(1, Math.max(0, (position - event.startMs) / event.durationMs)))
      if (!pulse) {
        pulse = host.ownerDocument.createElementNS('http://www.w3.org/2000/svg', 'circle')
        pulse.setAttribute('data-sequence-pulse', 'true'); pulse.setAttribute('r', '5')
        pulse.setAttribute('fill', 'var(--kg-canvas-accent)'); pulse.setAttribute('pointer-events', 'none')
      }
      if (pulse.parentNode !== binding.element) binding.element.append(pulse)
      const x = String(point.x), y = String(point.y)
      if (pulse.getAttribute('cx') !== x) pulse.setAttribute('cx', x)
      if (pulse.getAttribute('cy') !== y) pulse.setAttribute('cy', y)
    },
    dispose() { disposed = true; pulse?.remove() },
  }
}
