import type { XrAnimationPoseSample } from './xrAnimationCatalog'

/** How a staged subject takes part in a shot: the lead plays the verb, others react. */
export type XrCinemaShotRole = 'lead' | 'support' | 'vehicle' | 'prop'

export type XrCinemaShotPerformance = Readonly<{
  pose: XrAnimationPoseSample
  /** Extra local offset (east, up, south) in metres from the staged mark. */
  offsetMeters: readonly [number, number, number]
  /** Extra yaw (radians) on top of facing the camera. */
  yawRadians: number
}>

const smooth = (value: number): number => {
  const t = Math.max(0, Math.min(1, value))
  return t * t * (3 - 2 * t)
}

const round = (value: number): number => Math.round(value * 1000) / 1000

/**
 * Layers a shot's acting verb over the timeline-sampled pose so every staged subject
 * keeps moving for the whole shot. `seconds` is shot-local time; `progress` is 0–1.
 */
export function resolveXrCinemaShotPerformance(
  base: XrAnimationPoseSample,
  acting: string,
  role: XrCinemaShotRole,
  seconds: number,
  progress: number,
): XrCinemaShotPerformance {
  const time = Number.isFinite(seconds) ? seconds : 0
  const t = Math.max(0, Math.min(1, Number.isFinite(progress) ? progress : 0))
  const breathe = Math.sin(time * Math.PI * 1.6)
  const pose = (patch: Partial<XrAnimationPoseSample>): XrAnimationPoseSample => Object.freeze({ ...base, ...patch })
  const lift = (dy: number): readonly [number, number, number] => [
    base.rootOffsetMeters[0],
    round(base.rootOffsetMeters[1] + dy),
    base.rootOffsetMeters[2],
  ]

  if (role === 'prop') {
    if (acting === 'brace' || acting === 'reveal') {
      // Debris and crates shudder and settle as the shot lands.
      const shake = (1 - smooth(t)) * Math.sin(time * 38) * 0.06
      return { pose: base, offsetMeters: [round(shake), round(Math.max(0, 1.4 * (1 - smooth(t * 1.6)))), 0], yawRadians: round(t * 0.6) }
    }
    return { pose: base, offsetMeters: [0, 0, 0], yawRadians: round(0.08 * Math.sin(time * 0.9)) }
  }

  if (role === 'vehicle') {
    if (acting === 'stride' || acting === 'brace') {
      // Vehicles cross the frame through the shot, braking hard on a brace.
      const travel = acting === 'brace' ? 9 * smooth(t * 1.4) - 4.5 : 12 * t - 6
      return { pose: base, offsetMeters: [0, round(0.03 * Math.sin(time * 18)), round(-travel)], yawRadians: 0 }
    }
    return { pose: base, offsetMeters: [0, round(0.01 * breathe), 0], yawRadians: 0 }
  }

  if (role === 'support') {
    // Supporting cast keeps a live idle and turns toward the lead's beat.
    return {
      pose: pose({
        rootOffsetMeters: lift(0.015 * breathe),
        leftArmPitchDegrees: round(base.leftArmPitchDegrees - 6 - 4 * breathe),
        rightArmPitchDegrees: round(base.rightArmPitchDegrees - 6 + 4 * breathe),
      }),
      offsetMeters: [0, 0, 0],
      yawRadians: round(0.35 * Math.sin(time * 0.7) * (1 - t * 0.5)),
    }
  }

  const sweep = Math.sin(time * Math.PI * 0.75)
  switch (acting) {
    case 'survey':
      // The opening reference shows the lead checking a handheld brief on the wet deck.
      return {
        pose: pose({
          rootOffsetMeters: lift(0.012 * breathe),
          rootRotationDegrees: [base.rootRotationDegrees[0], round(base.rootRotationDegrees[1] + 32 * sweep), base.rootRotationDegrees[2]],
          rightArmPitchDegrees: round(72 + 3 * breathe),
          rightArmRollDegrees: 12,
          leftArmPitchDegrees: round(70 - 2 * breathe),
          leftArmRollDegrees: -12,
          propCue: 'tablet',
        }),
        offsetMeters: [0, 0, 0],
        yawRadians: round(-0.5 + t * 1.0),
      }
    case 'address': {
      // Declaiming the line: alternating open-hand gestures on the beat.
      const beat = Math.sin(time * Math.PI * 2.2)
      return {
        pose: pose({
          rootOffsetMeters: lift(0.02 * Math.abs(beat)),
          rootRotationDegrees: [round(-4 * Math.abs(beat)), round(10 * beat), 0],
          leftArmPitchDegrees: round(-55 - 35 * Math.max(0, beat)),
          rightArmPitchDegrees: round(-55 - 35 * Math.max(0, -beat)),
          leftArmRollDegrees: -30,
          rightArmRollDegrees: 30,
        }),
        offsetMeters: [0, 0, round(-0.8 * smooth(t))],
        yawRadians: 0,
      }
    }
    case 'operate': {
      // Working an unseen console: both hands forward, fast keystroke rhythm.
      const key = Math.sin(time * Math.PI * 7)
      return {
        pose: pose({
          rootOffsetMeters: lift(-0.04),
          rootRotationDegrees: [10, round(6 * sweep), 0],
          crouch: Math.max(base.crouch, 0.16),
          leftArmPitchDegrees: round(-72 + 8 * key),
          rightArmPitchDegrees: round(-72 - 8 * key),
          leftArmRollDegrees: -14,
          rightArmRollDegrees: 14,
        }),
        offsetMeters: [0, 0, 0],
        yawRadians: round(0.6 - 0.4 * t),
      }
    }
    case 'reveal': {
      // A rising reveal: crouched, then standing tall with arms spread.
      const rise = smooth(t * 1.5)
      return {
        pose: pose({
          rootOffsetMeters: lift(round(-0.3 * (1 - rise) + 0.015 * breathe)),
          rootRotationDegrees: [round(14 * (1 - rise) - 6 * rise), 0, 0],
          crouch: round(0.55 * (1 - rise)),
          leftArmPitchDegrees: round(-10 - 120 * rise),
          rightArmPitchDegrees: round(-10 - 120 * rise),
          leftArmRollDegrees: round(-10 - 40 * rise),
          rightArmRollDegrees: round(10 + 40 * rise),
        }),
        offsetMeters: [0, 0, 0],
        yawRadians: round(Math.PI * (1 - rise)),
      }
    }
    case 'stride': {
      // Walking toward camera through the whole shot.
      const step = Math.sin(time * Math.PI * 3.6)
      return {
        pose: pose({
          rootOffsetMeters: lift(round(0.04 * Math.abs(step))),
          leftArmPitchDegrees: round(-4 + 32 * step),
          rightArmPitchDegrees: round(-4 - 32 * step),
          leftLegPitchDegrees: round(-30 * step),
          rightLegPitchDegrees: round(30 * step),
        }),
        offsetMeters: [0, 0, round(5 - 10 * t)],
        yawRadians: 0,
      }
    }
    case 'brace': {
      // Bracing against impact: drop low, guard up, stagger back.
      const hit = smooth((t - 0.35) / 0.2)
      return {
        pose: pose({
          rootOffsetMeters: lift(round(-0.22 * hit + 0.01 * breathe)),
          rootRotationDegrees: [round(-12 * hit), round(8 * Math.sin(time * 9) * hit * (1 - t)), 0],
          crouch: round(0.1 + 0.45 * hit),
          leftArmPitchDegrees: round(-40 - 80 * hit),
          rightArmPitchDegrees: round(-40 - 80 * hit),
          leftArmRollDegrees: -24,
          rightArmRollDegrees: 24,
        }),
        offsetMeters: [0, 0, round(1.6 * hit)],
        yawRadians: 0,
      }
    }
    default:
      return {
        pose: pose({ rootOffsetMeters: lift(0.015 * breathe) }),
        offsetMeters: [0, 0, 0],
        yawRadians: round(0.2 * Math.sin(time * 0.5)),
      }
  }
}
