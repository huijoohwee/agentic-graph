import type { XrMotionReferenceMark } from './xrMotionReferenceModel'

const CUES = ['idle', 'hidden', 'build', 'collapse', 'huff', 'splash'] as const
export type XrPresentationCue = typeof CUES[number]
export type XrStoryPresentation = Readonly<{
  cue: XrPresentationCue
  progress: number
  elapsed: number
  visible: boolean
}>

export function readXrPresentationCue(value: unknown): XrPresentationCue | undefined {
  return CUES.find(cue => cue === value)
}

/** Pure Timeline sampling: no timers, accumulated impulses, random numbers or mutation. */
export function sampleXrStoryPresentation(
  marks: readonly Pick<XrMotionReferenceMark, 'timeSeconds' | 'cue'>[],
  timeSeconds: number,
): XrStoryPresentation {
  const time = Number.isFinite(timeSeconds) ? Math.max(0, timeSeconds) : 0
  let active: typeof marks[number] | undefined
  for (const mark of marks) {
    if (mark.cue && mark.timeSeconds <= time && (!active || mark.timeSeconds >= active.timeSeconds)) active = mark
  }
  const cue = active?.cue || 'idle'
  const elapsed = Math.max(0, time - (active?.timeSeconds ?? time))
  const progress = Math.min(1, elapsed / (cue === 'huff' || cue === 'splash' ? 1.4 : 0.8))
  return Object.freeze({ cue, progress, elapsed, visible: cue !== 'hidden' })
}
