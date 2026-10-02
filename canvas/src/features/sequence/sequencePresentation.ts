import type { SequenceModel, SequenceTimedEvent } from './sequenceModel'

export const sequenceSvgEscape = (text: string) => text.replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[ch]!)
export const sequenceParticipantLabel = (model: SequenceModel, id: string) => model.participants.find(person => person.id === id)?.label || id

/** Canvas and Timeline derive state from the same half-open transport interval. */
export function sequenceEventState(event: SequenceTimedEvent | undefined, position: number) {
  return !event ? 'skipped' : position < event.startMs ? 'pending' : position >= event.startMs + event.durationMs ? 'complete' : 'active'
}
