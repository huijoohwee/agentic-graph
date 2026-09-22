import type { XrMotionReferencePlan } from './xrMotionReferenceModel'

export type XrRehearsalTimelineBeat = Readonly<{
  timeSeconds: number
  label: string
  caption?: string
  anchorId: string
  markId: string
}>

function subjectLabel(plan: XrMotionReferencePlan, id: string): string {
  return plan.subjects.find(subject => subject.id === id)?.label
    || plan.cast.find(track => track.actorId === id)?.label
    || ''
}

function namedSubject(plan: XrMotionReferencePlan, pattern: RegExp) {
  return plan.subjects.find(subject => pattern.test(subject.label)) || null
}

function beatLabelForCameraMark(plan: XrMotionReferencePlan, mark: XrMotionReferencePlan['camera'][number]): string {
  if (mark.label) return mark.label
  const anchor = subjectLabel(plan, mark.anchorId)
  const straw = namedSubject(plan, /straw/i)
  const stick = namedSubject(plan, /stick/i)
  const brick = namedSubject(plan, /brick/i)
  const soup = namedSubject(plan, /pot|soup/i)
  if (plan.stageId === 'tropical-playground') {
    if (mark.timeSeconds <= 0.05) return 'Lagoon landing'
    if (mark.timeSeconds <= 6) return 'Wood ramp'
    if (mark.settings.shot === 'close-up') return 'Treasure close-up'
    if (mark.timeSeconds <= 11) return 'Skull grotto'
    if (mark.timeSeconds < 18) return 'Twin cannons'
    if (mark.timeSeconds <= 23) return 'Palisade ridge'
    return 'Volcano horizon'
  }
  if (!straw && !stick && !brick) return anchor || 'Camera'
  if (mark.timeSeconds <= 0.05 || /first pig/i.test(anchor) && mark.timeSeconds < 3) return 'Waterfront landing'
  if (straw && /wolf/i.test(anchor) && mark.timeSeconds <= 6) return 'Straw threshold'
  if (stick && /second pig/i.test(anchor) && mark.settings.shot === 'close-up') return 'Stick house midpoint'
  if (stick && /second pig/i.test(anchor)) return 'Stick house'
  if (brick && /third pig/i.test(anchor) && mark.timeSeconds < 18) return 'Brick house'
  if (soup && (/wolf/i.test(anchor) || mark.timeSeconds >= 19 && mark.timeSeconds <= 23)) return 'Chimney soup pot'
  if (/third pig/i.test(anchor)) return 'Journey end'
  return anchor || 'Beat'
}

export function resolveXrRehearsalTimelineBeats(plan: XrMotionReferencePlan): readonly XrRehearsalTimelineBeat[] {
  return Object.freeze(plan.camera.map(mark => Object.freeze({
    timeSeconds: mark.timeSeconds,
    label: beatLabelForCameraMark(plan, mark),
    ...(mark.caption ? { caption: mark.caption } : {}),
    anchorId: mark.anchorId,
    markId: mark.id,
  })))
}

export function resolveXrRehearsalTimelineBeatAt(plan: XrMotionReferencePlan, timeSeconds: number): XrRehearsalTimelineBeat | null {
  const beats = resolveXrRehearsalTimelineBeats(plan)
  return beats.reduce<XrRehearsalTimelineBeat | null>((current, beat) => (
    beat.timeSeconds <= timeSeconds + 0.001 ? beat : current
  ), null)
}

export function resolveXrRehearsalBeatLabelAt(plan: XrMotionReferencePlan, timeSeconds: number): string | null {
  const beat = resolveXrRehearsalTimelineBeats(plan).find(candidate => Math.abs(candidate.timeSeconds - timeSeconds) < 0.051)
  return beat?.label || null
}

export function resolveXrTimelineObjectPathCaption(args: {
  label: string
  motion: string
  beatLabel?: string | null
}): string {
  const text = args.label.toLowerCase()
  const beat = (args.beatLabel || '').toLowerCase()
  if (text.includes('wolf')) {
    return /straw|stick|brick|soup/.test(beat) ? 'huffs at threshold' : 'walks the path'
  }
  if (text.includes('first pig')) {
    return beat.includes('waterfront') || beat.includes('landing') ? 'lands on the waterfront' : 'flees straw'
  }
  if (text.includes('second pig')) {
    if (beat.includes('midpoint')) return 'stick house midpoint'
    if (beat.includes('stick')) return 'holds stick house'
    if (beat.includes('waterfront') || beat.includes('landing')) return 'lands on the waterfront'
    return 'flees stick'
  }
  if (text.includes('third pig')) {
    if (beat.includes('soup')) return 'chimney soup'
    if (beat.includes('end')) return 'journey end'
    if (beat.includes('waterfront') || beat.includes('landing')) return 'lands on the waterfront'
    return 'holds brick house'
  }
  if (text.includes('stick') && beat.includes('stick')) return args.beatLabel || 'raised in place'
  if (text.includes('house')) return 'raised in place'
  if (text.includes('pot') || text.includes('soup')) {
    return beat.includes('soup') ? 'chimney soup' : 'in place'
  }
  if (text.includes('oak') || text.includes('tree')) return 'waterfront'
  return `path ${args.motion}`
}
