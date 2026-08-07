export const APPLE_SPATIAL_INPUT_SCHEMA = 'airvio.apple-spatial-input/v1' as const

export interface AppleSpatialInputProfile {
  readonly schema: typeof APPLE_SPATIAL_INPUT_SCHEMA
  readonly controlRangeDegrees: number
  readonly jitterThresholdDegrees: number
  readonly settledAxisThreshold: number
  readonly smoothingRatePerSecond: number
  readonly calibrationTimeoutMilliseconds: number
}

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

export const APPLE_SPATIAL_INPUT_PROFILE_LIMITS = Object.freeze({
  controlRangeDegrees: Object.freeze([5, 90] as const),
  jitterThresholdDegrees: Object.freeze([0, 5] as const),
  settledAxisThreshold: Object.freeze([0, 0.1] as const),
  smoothingRatePerSecond: Object.freeze([1, 60] as const),
  calibrationTimeoutMilliseconds: Object.freeze([250, 10_000] as const),
})

const APPLE_SPATIAL_INPUT_PROFILE_KEYS = new Set([
  'schema',
  ...Object.keys(APPLE_SPATIAL_INPUT_PROFILE_LIMITS),
])

export const DEFAULT_APPLE_SPATIAL_INPUT_PROFILE: AppleSpatialInputProfile = Object.freeze({
  schema: APPLE_SPATIAL_INPUT_SCHEMA,
  controlRangeDegrees: 35,
  jitterThresholdDegrees: 0.75,
  settledAxisThreshold: 0.002,
  smoothingRatePerSecond: 12,
  calibrationTimeoutMilliseconds: 2_500,
})

export const INITIAL_APPLE_SPATIAL_INPUT_STATE: AppleSpatialInputState = Object.freeze({
  baseline: null,
  pitch: 0,
  roll: 0,
  previousTimestampMilliseconds: null,
})

function assertRange(name: keyof typeof APPLE_SPATIAL_INPUT_PROFILE_LIMITS, value: number): void {
  const [minimum, maximum] = APPLE_SPATIAL_INPUT_PROFILE_LIMITS[name]
  if (!Number.isFinite(value) || value < minimum || value > maximum) {
    throw new RangeError(`${name} must be a finite number from ${minimum} through ${maximum}.`)
  }
}

export function createAppleSpatialInputProfile(
  input: Omit<AppleSpatialInputProfile, 'schema'> & { readonly schema?: string },
): AppleSpatialInputProfile {
  for (const key of Object.keys(input)) {
    if (!APPLE_SPATIAL_INPUT_PROFILE_KEYS.has(key)) {
      throw new RangeError(`Unknown Apple spatial-input profile key: ${key}.`)
    }
  }
  if (input.schema !== undefined && input.schema !== APPLE_SPATIAL_INPUT_SCHEMA) {
    throw new RangeError(`schema must equal ${APPLE_SPATIAL_INPUT_SCHEMA}.`)
  }
  assertRange('controlRangeDegrees', input.controlRangeDegrees)
  assertRange('jitterThresholdDegrees', input.jitterThresholdDegrees)
  assertRange('settledAxisThreshold', input.settledAxisThreshold)
  assertRange('smoothingRatePerSecond', input.smoothingRatePerSecond)
  assertRange('calibrationTimeoutMilliseconds', input.calibrationTimeoutMilliseconds)
  return Object.freeze({
    schema: APPLE_SPATIAL_INPUT_SCHEMA,
    controlRangeDegrees: input.controlRangeDegrees,
    jitterThresholdDegrees: input.jitterThresholdDegrees,
    settledAxisThreshold: input.settledAxisThreshold,
    smoothingRatePerSecond: input.smoothingRatePerSecond,
    calibrationTimeoutMilliseconds: input.calibrationTimeoutMilliseconds,
  })
}

export function appleSpatialInputProfilesEqual(
  left: AppleSpatialInputProfile,
  right: AppleSpatialInputProfile,
): boolean {
  return left.schema === right.schema
    && left.controlRangeDegrees === right.controlRangeDegrees
    && left.jitterThresholdDegrees === right.jitterThresholdDegrees
    && left.settledAxisThreshold === right.settledAxisThreshold
    && left.smoothingRatePerSecond === right.smoothingRatePerSecond
    && left.calibrationTimeoutMilliseconds === right.calibrationTimeoutMilliseconds
}

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
    : Math.min(0.1, Math.max(1 / 240,
      (sample.timestampMilliseconds - previous.previousTimestampMilliseconds) / 1_000))
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
