import type { XrMotionReferencePlan, XrMotionReferenceVector } from './xrMotionReferenceModel'
import {
  readStrybldrCameraSettings,
  type StrybldrCameraSettings,
} from '@/features/strybldr/strybldrCamera'
import {
  readXrChoreographyEasing,
  readXrChoreographyGait,
  type XrChoreographyEasing,
  type XrChoreographyGait,
} from './xrChoreographyEasing'
import {
  xrMotionReferenceCastTrackRecord,
  xrMotionReferencePlanRecord,
} from './xrMotionReferenceRuntimeRecords'

export function buildCastMarkChoreographyEdit(
  plan: XrMotionReferencePlan,
  args: { actorId: string; markId: string; easing?: XrChoreographyEasing; gait?: XrChoreographyGait; position?: XrMotionReferenceVector },
): Record<string, unknown> | null {
  const sourceTrack = plan.cast.find(track => track.actorId === args.actorId)
  if (!sourceTrack?.marks.some(mark => mark.id === args.markId)) return null
  const cast = plan.cast.map(track => ({
    ...xrMotionReferenceCastTrackRecord(track),
    animation: track.actorId === args.actorId && track.animation?.kind === 'action-path' ? null : track.animation,
    marks: track.marks.map(mark => ({
      ...mark,
      timeSeconds: mark.timeSeconds,
      position: track.actorId === args.actorId && mark.id === args.markId && args.position ? [...args.position] : [...mark.position],
      transition: track.actorId === args.actorId && mark.id === args.markId ? readXrChoreographyEasing(args.easing || mark.transition) : mark.transition,
      gait: track.actorId === args.actorId && mark.id === args.markId ? readXrChoreographyGait(args.gait, mark.gait) : mark.gait,
    })),
  }))
  return { ...xrMotionReferencePlanRecord(plan), cast }
}

export function buildCameraMarkChoreographyEdit(
  plan: XrMotionReferencePlan,
  args: Readonly<{
    markId: string
    easing?: XrChoreographyEasing
    settings?: StrybldrCameraSettings
  }>,
): Record<string, unknown> | null {
  if (!plan.camera.some(mark => mark.id === args.markId) || (!args.easing && !args.settings)) return null
  const camera = plan.camera.map(mark => ({
    ...mark,
    timeSeconds: mark.timeSeconds,
    anchorId: mark.anchorId,
    moveId: mark.moveId,
    rig: mark.rig,
    easing: mark.id === args.markId && args.easing ? readXrChoreographyEasing(args.easing) : mark.easing,
    settings: mark.id === args.markId && args.settings
      ? readStrybldrCameraSettings(args.settings)
      : { ...mark.settings },
  }))
  return { ...xrMotionReferencePlanRecord(plan), camera }
}
