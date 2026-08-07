export const APPLE_SPATIAL_INPUT_SCHEMA = 'airvio.apple-spatial-input/v1' as const

export interface AppleSpatialInputProfile {
  readonly schema: typeof APPLE_SPATIAL_INPUT_SCHEMA
  readonly controlRangeDegrees: number
  readonly jitterThresholdDegrees: number
  readonly settledAxisThreshold: number
  readonly smoothingRatePerSecond: number
  readonly calibrationTimeoutMilliseconds: number
}

export type AppleSpatialInputProfileInput = Omit<AppleSpatialInputProfile, 'schema'> & {
  readonly schema?: string
}

export const APPLE_SPATIAL_INPUT_PROFILE_LIMITS = Object.freeze({
  controlRangeDegrees: Object.freeze([5, 90] as const),
  jitterThresholdDegrees: Object.freeze([0, 5] as const),
  settledAxisThreshold: Object.freeze([0, 0.1] as const),
  smoothingRatePerSecond: Object.freeze([1, 60] as const),
  calibrationTimeoutMilliseconds: Object.freeze([250, 10_000] as const),
})

const PROFILE_KEYS = new Set([
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

function assertRange(
  name: keyof typeof APPLE_SPATIAL_INPUT_PROFILE_LIMITS,
  value: number,
): void {
  const [minimum, maximum] = APPLE_SPATIAL_INPUT_PROFILE_LIMITS[name]
  if (!Number.isFinite(value) || value < minimum || value > maximum) {
    throw new RangeError(`${name} must be a finite number from ${minimum} through ${maximum}.`)
  }
}

export function createAppleSpatialInputProfile(
  input: AppleSpatialInputProfileInput,
): AppleSpatialInputProfile {
  for (const key of Object.keys(input)) {
    if (!PROFILE_KEYS.has(key)) {
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
