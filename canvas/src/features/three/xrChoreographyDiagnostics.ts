import type {
  XrMotionReferenceCameraRig,
  XrMotionReferencePlan,
  XrMotionReferenceVector,
} from './xrMotionReferenceModel'
import type { XrChoreographyGait } from './xrChoreographyEasing'

export type XrChoreographySpeedWarning = Readonly<{
  code: 'cast-speed' | 'camera-speed' | 'hold-jump'
  targetKind: 'cast' | 'camera'
  targetId: string
  label: string
  fromMarkId: string
  toMarkId: string
  speedMetersPerSecond: number
  limitMetersPerSecond: number
  message: string
}>

const GAIT_SPEED_LIMITS: Readonly<Record<XrChoreographyGait, number>> = Object.freeze({
  hold: 0.05,
  walk: 2.2,
  jog: 4.5,
  run: 8.5,
  wheeled: 35,
  flight: 90,
  drop: 60,
})

const CAMERA_SPEED_LIMITS: Readonly<Record<XrMotionReferenceCameraRig, number>> = Object.freeze({
  dolly: 8,
  steadicam: 4,
  handheld: 3,
  crane: 6,
  drone: 20,
  'car-mount': 35,
})

function round(value: number): number {
  return Math.round(value * 100) / 100
}

function distance(left: XrMotionReferenceVector, right: XrMotionReferenceVector): number {
  return Math.hypot(right[0] - left[0], right[1] - left[1], right[2] - left[2])
}

export function resolveXrChoreographySpeedWarnings(plan: XrMotionReferencePlan): readonly XrChoreographySpeedWarning[] {
  const warnings: XrChoreographySpeedWarning[] = []
  for (const track of plan.cast) {
    for (let index = 0; index < track.marks.length - 1; index += 1) {
      const from = track.marks[index]!
      const to = track.marks[index + 1]!
      const duration = Math.max(0.001, to.timeSeconds - from.timeSeconds)
      const speed = distance(from.position, to.position) / duration
      const limit = GAIT_SPEED_LIMITS[from.gait]
      if (speed <= limit) continue
      const holdJump = from.gait === 'hold' || from.transition === 'hold'
      warnings.push(Object.freeze({
        code: holdJump ? 'hold-jump' : 'cast-speed',
        targetKind: 'cast',
        targetId: track.actorId,
        label: track.label,
        fromMarkId: from.id,
        toMarkId: to.id,
        speedMetersPerSecond: round(speed),
        limitMetersPerSecond: limit,
        message: holdJump
          ? `${track.label} jumps ${round(distance(from.position, to.position))}m after a hold.`
          : `${track.label} reaches ${round(speed)}m/s; ${from.gait} sanity limit is ${limit}m/s.`,
      }))
    }
  }
  for (let index = 0; index < plan.camera.length - 1; index += 1) {
    const from = plan.camera[index]!
    const to = plan.camera[index + 1]!
    // A held camera mark ends its shot; the next mark is a cut, not camera travel.
    if (from.easing === 'hold') continue
    const duration = Math.max(0.001, to.timeSeconds - from.timeSeconds)
    const speed = distance(from.pose.position, to.pose.position) / duration
    const limit = CAMERA_SPEED_LIMITS[from.rig]
    if (speed <= limit) continue
    warnings.push(Object.freeze({
      code: 'camera-speed',
      targetKind: 'camera',
      targetId: 'camera',
      label: `Camera ${from.rig}`,
      fromMarkId: from.id,
      toMarkId: to.id,
      speedMetersPerSecond: round(speed),
      limitMetersPerSecond: limit,
      message: `Camera reaches ${round(speed)}m/s; ${from.rig} sanity limit is ${limit}m/s.`,
    }))
  }
  return Object.freeze(warnings)
}
