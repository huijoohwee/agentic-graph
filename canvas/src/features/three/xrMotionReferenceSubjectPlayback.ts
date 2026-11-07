import type { XrAnimationPoseSample } from './xrAnimationCatalog'
import { sampleXrAnimationPose } from './xrAnimationCatalog'
import {
  sampleXrMotionReferenceFacingY,
  sampleXrMotionReferenceMarks,
  type XrMotionReferenceCastTrack,
  type XrMotionReferenceSubject,
} from './xrMotionReferenceModel'
import { sampleXrStoryPresentation } from './xrStoryPresentation'

/** One timeline sample shared by every surface that renders a Media subject. */
export function sampleXrMotionReferenceSubjectPlayback(
  subject: XrMotionReferenceSubject,
  track: XrMotionReferenceCastTrack | undefined,
  timeSeconds: number,
  livePose?: XrAnimationPoseSample | null,
) {
  const sampledPose = livePose || sampleXrAnimationPose(track?.animation || null, timeSeconds)
  const locomotion = !livePose && !track?.animation && subject.category !== 'props'
    ? sampleLocomotion(track, timeSeconds)
    : null
  const animationPose = locomotion
    ? Object.freeze({
      ...sampledPose,
      leftArmPitchDegrees: sampledPose.leftArmPitchDegrees + locomotion.armSwingDegrees,
      rightArmPitchDegrees: sampledPose.rightArmPitchDegrees - locomotion.armSwingDegrees,
      leftLegPitchDegrees: locomotion.legSwingDegrees,
      rightLegPitchDegrees: -locomotion.legSwingDegrees,
      rootOffsetMeters: [
        sampledPose.rootOffsetMeters[0],
        sampledPose.rootOffsetMeters[1] + locomotion.bobMeters,
        sampledPose.rootOffsetMeters[2],
      ] as const,
    })
    : sampledPose
  return Object.freeze({
    position: track?.marks.length
      ? sampleXrMotionReferenceMarks(track.marks, timeSeconds)
      : subject.position,
    facingYRadians: track
      ? sampleXrMotionReferenceFacingY(track.marks, timeSeconds)
      : 0,
    animationPose,
    presentation: sampleXrStoryPresentation(track?.marks || [], timeSeconds),
  })
}

function sampleLocomotion(
  track: XrMotionReferenceCastTrack | undefined,
  timeSeconds: number,
): Readonly<{ armSwingDegrees: number; legSwingDegrees: number; bobMeters: number }> | null {
  if (!track || track.marks.length < 2) return null
  const rightIndex = track.marks.findIndex(mark => mark.timeSeconds > timeSeconds)
  if (rightIndex < 1) return null
  const from = track.marks[rightIndex - 1]!
  const to = track.marks[rightIndex]!
  const distance = Math.hypot(to.position[0] - from.position[0], to.position[2] - from.position[2])
  if (distance <= 0.001 || from.transition === 'hold') return null
  const speed = from.gait === 'run' ? 2.4 : from.gait === 'jog' ? 1.8 : from.gait === 'walk' ? 1.25 : 0
  if (!speed) return null
  const swing = Math.sin(Math.max(0, timeSeconds - from.timeSeconds) * Math.PI * 2 * speed)
  const legSwingDegrees = swing * (from.gait === 'run' ? 34 : from.gait === 'jog' ? 28 : 20)
  return Object.freeze({
    armSwingDegrees: legSwingDegrees * 0.72,
    legSwingDegrees,
    bobMeters: Math.abs(swing) * (from.gait === 'run' ? 0.055 : 0.025),
  })
}
