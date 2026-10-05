import { resolveCanvasAspectRatioSize, type CanvasAspectRatioMode } from '@/lib/canvas/canvasAspectRatioDisplayControls'
import type { SequenceModel } from './sequenceModel'

export type SequenceCanvasLayout = 'connections' | 'lifelines'
export type SequenceParticipantPoint = { x: number; y: number }
export type SequenceCanvasLayoutOptions = {
  aspectMode?: CanvasAspectRatioMode
  positions?: Readonly<Record<string, SequenceParticipantPoint>>
}

const COORDINATE_LIMIT = 100000, PARTICIPANT_GAP = 32
const coordinate = (value: number) => {
  if (!Number.isFinite(value)) throw new Error('Sequence participant coordinates must be finite')
  return Math.max(-COORDINATE_LIMIT, Math.min(COORDINATE_LIMIT, value))
}

/** Presentation coordinates never mutate authored participant or message order. */
export function resolveSequenceCanvasLayout(model: SequenceModel, layout: SequenceCanvasLayout, options: SequenceCanvasLayoutOptions = {}) {
  const card = resolveCanvasAspectRatioSize({ defaultWidth: 192, mode: options.aspectMode })
  const columns = Math.max(1, Math.min(4, Math.ceil(Math.sqrt(model.participants.length))))
  const positions: Record<string, SequenceParticipantPoint> = Object.create(null)
  let previousX = -Infinity
  model.participants.forEach((person, index) => {
    const row = Math.floor(index / columns), column = row % 2 ? columns - 1 - index % columns : index % columns
    const supplied = options.positions && Object.prototype.hasOwnProperty.call(options.positions, person.id) ? options.positions[person.id] : undefined
    const point = supplied ? { x: coordinate(supplied.x), y: coordinate(supplied.y) } : layout === 'connections'
      ? { x: card.width / 2 + 16 + column * (card.width + 196), y: card.height / 2 + 16 + row * (card.height + 144) }
      : { x: card.width / 2 + 24 + index * Math.max(240, card.width + PARTICIPANT_GAP), y: card.height / 2 + 16 }
    if (layout === 'lifelines') {
      point.x = Math.max(previousX + card.width + PARTICIPANT_GAP, point.x)
      point.y = card.height / 2 + 16
      previousX = point.x
    }
    positions[person.id] = point
  })
  return { card, positions }
}

export function constrainSequenceParticipantPosition(model: SequenceModel, layout: SequenceCanvasLayout, id: string,
  point: SequenceParticipantPoint, options: SequenceCanvasLayoutOptions = {}): SequenceParticipantPoint {
  const index = model.participants.findIndex(person => person.id === id)
  if (index < 0) throw new Error('Sequence participant is not part of the active document')
  const next = { x: coordinate(point.x), y: coordinate(point.y) }
  if (layout === 'connections') return next
  const { card, positions } = resolveSequenceCanvasLayout(model, layout, options)
  const before = model.participants[index - 1], after = model.participants[index + 1]
  const minimum = before ? positions[before.id]!.x + card.width + PARTICIPANT_GAP : -COORDINATE_LIMIT
  const maximum = after ? positions[after.id]!.x - card.width - PARTICIPANT_GAP : COORDINATE_LIMIT
  return { x: Math.max(minimum, Math.min(maximum, next.x)), y: positions[id]!.y }
}

const Segmenter = (Intl as typeof Intl & { Segmenter?: new () => { segment(text: string): Iterable<{ segment: string }> } }).Segmenter
const segmenter = Segmenter ? new Segmenter() : null
const graphemes = (text: string): string[] => {
  if (segmenter) return Array.from(segmenter.segment(text), entry => entry.segment)
  const result: string[] = []
  for (const character of text) {
    if (result.length && (/^[\p{M}\p{Emoji_Modifier}\u200d\ufe0e\ufe0f]$/u.test(character) || result[result.length - 1]!.endsWith('\u200d'))) result[result.length - 1] += character
    else result.push(character)
  }
  return result
}
export const sequenceCanvasTextWidth = (text: string, size: number) => graphemes(text).reduce((sum, character) => sum + size * (/^[\x00-\x7f]$/.test(character) ? .56 : 1), 0)
export const sequenceCanvasTextPreview = (text: string, width: number, size: number): string => {
  if (sequenceCanvasTextWidth(text, size) <= width) return text
  let visible = ''
  for (const character of graphemes(text)) {
    if (sequenceCanvasTextWidth(visible + character + '…', size) > width) break
    visible += character
  }
  return visible.trimEnd() + '…'
}
