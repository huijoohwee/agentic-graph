import type { AppleSpatialInputProfile } from './profile.js'

export interface AppleSpatialInputSample {
  readonly betaDegrees: number
  readonly gammaDegrees: number
  readonly screenAngleDegrees: number
  readonly timestampMilliseconds: number
}

export interface AppleSpatialInputState {
  readonly baseline: Readonly<{
    betaDegrees: number
    gammaDegrees: number
  }> | null
  readonly pitch: number
  readonly roll: number
  readonly previousTimestampMilliseconds: number | null
}

export interface AppleSpatialInputProjection {
  readonly state: AppleSpatialInputState
  readonly calibratedNow: boolean
}

export interface ScreenOrientationAxes {
  readonly pitchDegrees: number
  readonly rollDegrees: number
}

export const INITIAL_APPLE_SPATIAL_INPUT_STATE: AppleSpatialInputState = Object.freeze({
  baseline: null,
  pitch: 0,
  roll: 0,
  previousTimestampMilliseconds: null,
})

export function clampSpatialInputAxis(value: number): number {
  return Math.max(-1, Math.min(1, Number.isFinite(value) ? value : 0))
}

export function finiteSpatialInputNumber(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

export function normalizeAngleDegrees(value: number): number {
  return ((value % 360) + 360) % 360
}

export function shortestAngleDeltaDegrees(value: number): number {
  const normalized = normalizeAngleDegrees(value)
  return normalized > 180 ? normalized - 360 : normalized
}

export function mapDeviceOrientationDeltaToScreen(
  betaDeltaDegrees: number,
  gammaDeltaDegrees: number,
  screenAngleDegrees: number,
): ScreenOrientationAxes {
  const angleRadians = normalizeAngleDegrees(screenAngleDegrees) * Math.PI / 180
  const cosine = Math.cos(angleRadians)
  const sine = Math.sin(angleRadians)
  return Object.freeze({
    pitchDegrees: betaDeltaDegrees * cosine + gammaDeltaDegrees * sine,
    rollDegrees: gammaDeltaDegrees * cosine - betaDeltaDegrees * sine,
  })
}

export function resetAppleSpatialInputState(): AppleSpatialInputState {
  return INITIAL_APPLE_SPATIAL_INPUT_STATE
}

export function projectAppleSpatialInput(
  previous: AppleSpatialInputState,
  sample: AppleSpatialInputSample,
  profile: AppleSpatialInputProfile,
): AppleSpatialInputProjection {
  if (![
    sample.betaDegrees,
    sample.gammaDegrees,
    sample.screenAngleDegrees,
    sample.timestampMilliseconds,
  ].every(Number.isFinite)) {
    return Object.freeze({ calibratedNow: false, state: previous })
  }
  if (!previous.baseline) {
    return Object.freeze({
      calibratedNow: true,
      state: Object.freeze({
        baseline: Object.freeze({
          betaDegrees: sample.betaDegrees,
          gammaDegrees: sample.gammaDegrees,
        }),
        pitch: 0,
        roll: 0,
        previousTimestampMilliseconds: sample.timestampMilliseconds,
      }),
    })
  }

  const mapped = mapDeviceOrientationDeltaToScreen(
    shortestAngleDeltaDegrees(sample.betaDegrees - previous.baseline.betaDegrees),
    sample.gammaDegrees - previous.baseline.gammaDegrees,
    sample.screenAngleDegrees,
  )
  const targetPitch = Math.abs(mapped.pitchDegrees) < profile.jitterThresholdDegrees
    ? 0
    : clampSpatialInputAxis(mapped.pitchDegrees / profile.controlRangeDegrees)
  const targetRoll = Math.abs(mapped.rollDegrees) < profile.jitterThresholdDegrees
    ? 0
    : clampSpatialInputAxis(mapped.rollDegrees / profile.controlRangeDegrees)
  const fallbackSeconds = 1 / 60
  const elapsedSeconds = previous.previousTimestampMilliseconds === null
    || !Number.isFinite(previous.previousTimestampMilliseconds)
    || sample.timestampMilliseconds <= previous.previousTimestampMilliseconds
    ? fallbackSeconds
    : Math.min(0.1, Math.max(
      1 / 240,
      (sample.timestampMilliseconds - previous.previousTimestampMilliseconds) / 1_000,
    ))
  const blend = 1 - Math.exp(-profile.smoothingRatePerSecond * elapsedSeconds)
  let pitch = previous.pitch + (targetPitch - previous.pitch) * blend
  let roll = previous.roll + (targetRoll - previous.roll) * blend
  if (targetPitch === 0 && Math.abs(pitch) < profile.settledAxisThreshold) pitch = 0
  if (targetRoll === 0 && Math.abs(roll) < profile.settledAxisThreshold) roll = 0

  return Object.freeze({
    calibratedNow: false,
    state: Object.freeze({
      baseline: previous.baseline,
      pitch: clampSpatialInputAxis(pitch),
      roll: clampSpatialInputAxis(roll),
      previousTimestampMilliseconds: sample.timestampMilliseconds,
    }),
  })
}
