import { mergeFlightSimInputs } from './input.js'

export { mergeFlightSimInputs }

export type SpatialVector = readonly [number, number, number]

export interface FlightSimTickInput {
  readonly pitch: number
  readonly roll: number
  readonly yaw: number
  readonly throttleDelta: number
}

export type FlightSimInputPatch = Partial<FlightSimTickInput>

export interface FlightSimAircraftState {
  readonly position: SpatialVector
  readonly velocity: SpatialVector
  readonly pitch: number
  readonly roll: number
  readonly yaw: number
  readonly throttle: number
}

export const FLIGHT_SIM_MODEL_SCHEMA = 'knowgrph.flight-model/v1' as const
export const FLIGHT_SIM_FIXED_STEP_SECONDS = 1 / 60
export const FLIGHT_SIM_STALL_SPEED_METERS_PER_SECOND = 7
export const FLIGHT_SIM_FULL_CONTROL_SPEED_METERS_PER_SECOND = 12
export const FLIGHT_SIM_MINIMUM_CONTROL_AUTHORITY = 0.3
export const FLIGHT_SIM_STALL_NOSE_DROP_RADIANS_PER_SECOND = 0.42
export const FLIGHT_SIM_STABLE_PITCH_RADIANS = 0.28
export const FLIGHT_SIM_STABLE_ROLL_RADIANS = 0.35

export interface FlightSimModelProfile {
  readonly schema: typeof FLIGHT_SIM_MODEL_SCHEMA
  readonly maximumStepSeconds: number
  readonly maximumPitchRadians: number
  readonly maximumRollRadians: number
  readonly pitchRateRadiansPerSecond: number
  readonly rollRateRadiansPerSecond: number
  readonly yawRateRadiansPerSecond: number
  readonly bankTurnRate: number
  readonly throttleRatePerSecond: number
  readonly thrustAcceleration: number
  readonly liftCoefficient: number
  readonly baseDrag: number
  readonly speedDrag: number
  readonly gravity: number
  readonly velocityAlignmentRate: number
  readonly maximumAirspeedMetersPerSecond: number
  readonly stallSpeedMetersPerSecond: number
  readonly fullControlSpeedMetersPerSecond: number
  readonly minimumControlAuthority: number
  readonly stallNoseDropRadiansPerSecond: number
  readonly stablePitchRadians: number
  readonly stableRollRadians: number
}

export type FlightSimModelProfileInput = Partial<Omit<FlightSimModelProfile, 'schema'>> & {
  readonly schema?: string
}

export const DEFAULT_FLIGHT_SIM_MODEL_PROFILE: FlightSimModelProfile = Object.freeze({
  schema: FLIGHT_SIM_MODEL_SCHEMA,
  maximumStepSeconds: 0.25,
  maximumPitchRadians: Math.PI * 0.28,
  maximumRollRadians: Math.PI * 0.38,
  pitchRateRadiansPerSecond: 0.72,
  rollRateRadiansPerSecond: 1.08,
  yawRateRadiansPerSecond: 0.58,
  bankTurnRate: 0.42,
  throttleRatePerSecond: 0.48,
  thrustAcceleration: 10.5,
  liftCoefficient: 0.07,
  baseDrag: 0.018,
  speedDrag: 0.0018,
  gravity: 9.81,
  velocityAlignmentRate: 0.42,
  maximumAirspeedMetersPerSecond: 48,
  stallSpeedMetersPerSecond: FLIGHT_SIM_STALL_SPEED_METERS_PER_SECOND,
  fullControlSpeedMetersPerSecond: FLIGHT_SIM_FULL_CONTROL_SPEED_METERS_PER_SECOND,
  minimumControlAuthority: FLIGHT_SIM_MINIMUM_CONTROL_AUTHORITY,
  stallNoseDropRadiansPerSecond: FLIGHT_SIM_STALL_NOSE_DROP_RADIANS_PER_SECOND,
  stablePitchRadians: FLIGHT_SIM_STABLE_PITCH_RADIANS,
  stableRollRadians: FLIGHT_SIM_STABLE_ROLL_RADIANS,
})

const MODEL_PROFILE_KEYS = new Set(Object.keys(DEFAULT_FLIGHT_SIM_MODEL_PROFILE))

function requireFiniteRange(
  value: number,
  name: string,
  minimum: number,
  maximum = Number.POSITIVE_INFINITY,
): void {
  if (!Number.isFinite(value) || value < minimum || value > maximum) {
    throw new RangeError(`${name} must be a finite number from ${minimum} through ${maximum}.`)
  }
}

export function createFlightSimModelProfile(
  input: FlightSimModelProfileInput = {},
): FlightSimModelProfile {
  for (const key of Object.keys(input)) {
    if (!MODEL_PROFILE_KEYS.has(key)) throw new RangeError(`Unknown flight-model profile key: ${key}.`)
  }
  if (input.schema !== undefined && input.schema !== FLIGHT_SIM_MODEL_SCHEMA) {
    throw new RangeError(`schema must equal ${FLIGHT_SIM_MODEL_SCHEMA}.`)
  }
  const profile: FlightSimModelProfile = Object.freeze({
    ...DEFAULT_FLIGHT_SIM_MODEL_PROFILE,
    ...input,
    schema: FLIGHT_SIM_MODEL_SCHEMA,
  })
  requireFiniteRange(profile.maximumStepSeconds, 'maximumStepSeconds', 1 / 1_000, 1)
  requireFiniteRange(profile.maximumPitchRadians, 'maximumPitchRadians', 0.01, Math.PI / 2)
  requireFiniteRange(profile.maximumRollRadians, 'maximumRollRadians', 0.01, Math.PI / 2)
  for (const key of [
    'pitchRateRadiansPerSecond',
    'rollRateRadiansPerSecond',
    'yawRateRadiansPerSecond',
    'bankTurnRate',
    'throttleRatePerSecond',
    'thrustAcceleration',
    'liftCoefficient',
    'baseDrag',
    'speedDrag',
    'gravity',
    'maximumAirspeedMetersPerSecond',
    'fullControlSpeedMetersPerSecond',
    'stallNoseDropRadiansPerSecond',
    'stablePitchRadians',
    'stableRollRadians',
  ] as const) {
    requireFiniteRange(profile[key], key, 0)
  }
  requireFiniteRange(
    profile.stallSpeedMetersPerSecond,
    'stallSpeedMetersPerSecond',
    Number.MIN_VALUE,
  )
  requireFiniteRange(profile.velocityAlignmentRate, 'velocityAlignmentRate', 0, 1)
  requireFiniteRange(profile.minimumControlAuthority, 'minimumControlAuthority', 0, 1)
  if (profile.stallSpeedMetersPerSecond >= profile.fullControlSpeedMetersPerSecond) {
    throw new RangeError('stallSpeedMetersPerSecond must be below fullControlSpeedMetersPerSecond.')
  }
  if (profile.fullControlSpeedMetersPerSecond > profile.maximumAirspeedMetersPerSecond) {
    throw new RangeError('fullControlSpeedMetersPerSecond must not exceed maximumAirspeedMetersPerSecond.')
  }
  if (profile.stablePitchRadians > profile.maximumPitchRadians
    || profile.stableRollRadians > profile.maximumRollRadians) {
    throw new RangeError('Stable attitude limits must not exceed maximum attitude limits.')
  }
  return profile
}

export const FLIGHT_SIM_NEUTRAL_INPUT: FlightSimTickInput = Object.freeze({
  pitch: 0,
  roll: 0,
  yaw: 0,
  throttleDelta: 0,
})

export function stageFlightSimInputPatch(
  previous: FlightSimTickInput,
  patch: FlightSimInputPatch,
): FlightSimTickInput {
  const stagedField = (field: keyof FlightSimTickInput): number => {
    const candidate = patch[field]
    return candidate === undefined ? previous[field] : Number(candidate)
  }
  return Object.freeze({
    pitch: stagedField('pitch'),
    roll: stagedField('roll'),
    yaw: stagedField('yaw'),
    throttleDelta: stagedField('throttleDelta'),
  })
}

export function clampFlightSimUnit(value: unknown, label = 'Flight Sim input'): number {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) throw new Error(`${label} must be finite`)
  return Math.max(-1, Math.min(1, numeric))
}

export function normalizeFlightSimInput(
  value: FlightSimInputPatch | null | undefined,
): FlightSimTickInput {
  return Object.freeze({
    pitch: clampFlightSimUnit(value?.pitch ?? 0, 'Flight Sim pitch'),
    roll: clampFlightSimUnit(value?.roll ?? 0, 'Flight Sim roll'),
    yaw: clampFlightSimUnit(value?.yaw ?? 0, 'Flight Sim yaw'),
    throttleDelta: clampFlightSimUnit(value?.throttleDelta ?? 0, 'Flight Sim throttle delta'),
  })
}

export interface FlightSimInputNormalizationResult {
  readonly input: FlightSimTickInput
  readonly outOfRange: boolean
  readonly retainedLastValid: boolean
  readonly failures: readonly FlightSimInputNormalizationFailure[]
}

export interface FlightSimInputNormalizationFailure {
  readonly axis: keyof FlightSimTickInput
  readonly reason: 'nan' | 'infinite'
}

export function normalizeFlightSimInputFrame(
  value: FlightSimInputPatch | null | undefined,
  lastValid: FlightSimTickInput = FLIGHT_SIM_NEUTRAL_INPUT,
): FlightSimInputNormalizationResult {
  const retained = normalizeFlightSimInput(lastValid)
  let outOfRange = false
  let retainedLastValid = false
  const failures: FlightSimInputNormalizationFailure[] = []
  const axis = (
    candidateValue: unknown,
    fallback: number,
    axisName: keyof FlightSimTickInput,
  ): number => {
    const candidate = Number(candidateValue ?? 0)
    if (Number.isNaN(candidate)) {
      outOfRange = true
      retainedLastValid = true
      failures.push(Object.freeze({ axis: axisName, reason: 'nan' }))
      return fallback
    }
    if (!Number.isFinite(candidate)) {
      outOfRange = true
      failures.push(Object.freeze({ axis: axisName, reason: 'infinite' }))
      return Math.sign(candidate)
    }
    if (candidate < -1 || candidate > 1) outOfRange = true
    return Math.max(-1, Math.min(1, candidate))
  }
  return Object.freeze({
    input: Object.freeze({
      pitch: axis(value?.pitch, retained.pitch, 'pitch'),
      roll: axis(value?.roll, retained.roll, 'roll'),
      yaw: axis(value?.yaw, retained.yaw, 'yaw'),
      throttleDelta: axis(value?.throttleDelta, retained.throttleDelta, 'throttleDelta'),
    }),
    outOfRange,
    retainedLastValid,
    failures: Object.freeze(failures),
  })
}

export function isFlightSimInputNeutral(input: FlightSimTickInput): boolean {
  return input.pitch === 0 && input.roll === 0 && input.yaw === 0 && input.throttleDelta === 0
}

export function freezeFlightSimAircraftState(
  value: FlightSimAircraftState,
): FlightSimAircraftState {
  return Object.freeze({
    ...value,
    position: Object.freeze([...value.position]) as SpatialVector,
    velocity: Object.freeze([...value.velocity]) as SpatialVector,
  })
}

export function normalizeFlightSimAngle(value: number): number {
  const turn = Math.PI * 2
  return ((value + Math.PI) % turn + turn) % turn - Math.PI
}

export function flightSimForwardVector(pitch: number, yaw: number): SpatialVector {
  const horizontal = Math.cos(pitch)
  return Object.freeze([
    -Math.sin(yaw) * horizontal,
    Math.sin(pitch),
    -Math.cos(yaw) * horizontal,
  ]) as SpatialVector
}

export function flightSimAirspeed(state: Pick<FlightSimAircraftState, 'velocity'>): number {
  return Math.hypot(...state.velocity)
}

export function flightSimHeadingDegrees(yaw: number): number {
  return ((-yaw * 180 / Math.PI) % 360 + 360) % 360
}

function requireAirspeed(value: number): number {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error('Flight envelope airspeed must be a finite non-negative number')
  }
  return value
}

export function flightSimControlAuthority(
  airspeedValue: number,
  profile: FlightSimModelProfile = DEFAULT_FLIGHT_SIM_MODEL_PROFILE,
): number {
  const airspeed = requireAirspeed(airspeedValue)
  const normalized = Math.max(0, Math.min(1, airspeed / profile.fullControlSpeedMetersPerSecond))
  return profile.minimumControlAuthority + (1 - profile.minimumControlAuthority) * normalized
}

export function flightSimStallSeverity(
  airspeedValue: number,
  profile: FlightSimModelProfile = DEFAULT_FLIGHT_SIM_MODEL_PROFILE,
): number {
  const airspeed = requireAirspeed(airspeedValue)
  return Math.max(0, Math.min(1,
    (profile.stallSpeedMetersPerSecond - airspeed) / profile.stallSpeedMetersPerSecond,
  ))
}

function boundedStepSeconds(value: number, profile: FlightSimModelProfile): number {
  if (!Number.isFinite(value) || value <= 0 || value > profile.maximumStepSeconds) {
    throw new Error(`Flight Sim step must be a finite number from 0 to ${profile.maximumStepSeconds} seconds`)
  }
  return value
}

export function integrateFlightModel(
  previous: FlightSimAircraftState,
  inputValue: FlightSimTickInput,
  stepSecondsValue = FLIGHT_SIM_FIXED_STEP_SECONDS,
  profile: FlightSimModelProfile = DEFAULT_FLIGHT_SIM_MODEL_PROFILE,
): FlightSimAircraftState {
  const stepSeconds = boundedStepSeconds(stepSecondsValue, profile)
  const input = normalizeFlightSimInput(inputValue)
  const speed = flightSimAirspeed(previous)
  const controlAuthority = flightSimControlAuthority(speed, profile)
  const stallSeverity = flightSimStallSeverity(speed, profile)
  const pitchTarget = previous.pitch + (
    input.pitch * profile.pitchRateRadiansPerSecond * controlAuthority
    - stallSeverity * profile.stallNoseDropRadiansPerSecond
  ) * stepSeconds
  const rollTarget = previous.roll
    + input.roll * profile.rollRateRadiansPerSecond * controlAuthority * stepSeconds
  const pitch = Math.max(-profile.maximumPitchRadians, Math.min(profile.maximumPitchRadians,
    input.pitch === 0 ? pitchTarget * Math.exp(-0.28 * stepSeconds) : pitchTarget,
  ))
  const roll = Math.max(-profile.maximumRollRadians, Math.min(profile.maximumRollRadians,
    input.roll === 0 ? rollTarget * Math.exp(-0.5 * stepSeconds) : rollTarget,
  ))
  const yaw = normalizeFlightSimAngle(previous.yaw + (
    input.yaw * profile.yawRateRadiansPerSecond - Math.sin(roll) * profile.bankTurnRate
  ) * controlAuthority * stepSeconds)
  const throttle = Math.max(0, Math.min(1,
    previous.throttle + input.throttleDelta * profile.throttleRatePerSecond * stepSeconds,
  ))
  const forward = flightSimForwardVector(pitch, yaw)
  const forwardSpeed = Math.max(0,
    previous.velocity[0] * forward[0]
      + previous.velocity[1] * forward[1]
      + previous.velocity[2] * forward[2],
  )
  const lift = Math.min(
    profile.gravity * 1.8,
    forwardSpeed * forwardSpeed * profile.liftCoefficient * Math.cos(roll),
  )
  const dragCoefficient = profile.baseDrag + speed * profile.speedDrag
  const alignedVelocity: SpatialVector = speed > 1e-8
    ? [
        previous.velocity[0] + (forward[0] * speed - previous.velocity[0])
          * profile.velocityAlignmentRate * stepSeconds,
        previous.velocity[1] + (forward[1] * speed - previous.velocity[1])
          * profile.velocityAlignmentRate * stepSeconds,
        previous.velocity[2] + (forward[2] * speed - previous.velocity[2])
          * profile.velocityAlignmentRate * stepSeconds,
      ]
    : previous.velocity
  const acceleration: SpatialVector = [
    forward[0] * profile.thrustAcceleration * throttle - alignedVelocity[0] * dragCoefficient,
    forward[1] * profile.thrustAcceleration * throttle + lift
      - profile.gravity - alignedVelocity[1] * dragCoefficient,
    forward[2] * profile.thrustAcceleration * throttle - alignedVelocity[2] * dragCoefficient,
  ]
  let velocity: SpatialVector = [
    alignedVelocity[0] + acceleration[0] * stepSeconds,
    alignedVelocity[1] + acceleration[1] * stepSeconds,
    alignedVelocity[2] + acceleration[2] * stepSeconds,
  ]
  const nextSpeed = Math.hypot(...velocity)
  if (nextSpeed > profile.maximumAirspeedMetersPerSecond) {
    const scale = profile.maximumAirspeedMetersPerSecond / nextSpeed
    velocity = [velocity[0] * scale, velocity[1] * scale, velocity[2] * scale]
  }
  const position: SpatialVector = [
    previous.position[0] + velocity[0] * stepSeconds,
    previous.position[1] + velocity[1] * stepSeconds,
    previous.position[2] + velocity[2] * stepSeconds,
  ]
  return freezeFlightSimAircraftState({ position, velocity, pitch, roll, yaw, throttle })
}

export type FlightSimEnvelopeStatus =
  | 'instrument-uncertain'
  | 'stall-risk'
  | 'pitch-limit'
  | 'bank-limit'
  | 'low-energy'
  | 'high-energy'
  | 'on-target'
export type FlightSimEnvelopeSeverity = 'nominal' | 'caution' | 'warning'

export interface FlightSimEnvelopeProjection {
  readonly status: FlightSimEnvelopeStatus
  readonly severity: FlightSimEnvelopeSeverity
  readonly label: string
  readonly recoveryCue: string
  readonly airspeedMetersPerSecond: number
  readonly airspeedReliable: boolean
  readonly targetSpeedMetersPerSecond: readonly [number, number]
  readonly controlAuthority: number
  readonly stallSeverity: number
}

function requireTargetSpeedRange(value: readonly [number, number]): readonly [number, number] {
  const [minimum, maximum] = value
  if (!Number.isFinite(minimum) || !Number.isFinite(maximum) || minimum < 0 || maximum <= minimum) {
    throw new Error('Flight envelope target speed must be an increasing finite non-negative range')
  }
  return value
}

function envelopeStatus(args: Readonly<{
  aircraft: Pick<FlightSimAircraftState, 'pitch' | 'roll'>
  airspeed: number
  airspeedReliable: boolean
  targetSpeed: readonly [number, number]
  profile: FlightSimModelProfile
}>): Pick<FlightSimEnvelopeProjection, 'status' | 'severity' | 'label' | 'recoveryCue'> {
  if (!args.airspeedReliable) return {
    status: 'instrument-uncertain', severity: 'warning', label: 'Airspeed unreliable',
    recoveryCue: 'Cross-check pitch, power, and visual attitude.',
  }
  if (args.airspeed < args.profile.stallSpeedMetersPerSecond) return {
    status: 'stall-risk', severity: 'warning', label: 'Stall risk',
    recoveryCue: 'Lower the nose, level the wings, and add power.',
  }
  if (Math.abs(args.aircraft.pitch) > args.profile.stablePitchRadians) return {
    status: 'pitch-limit', severity: 'caution', label: 'Pitch outside envelope',
    recoveryCue: 'Ease pitch toward the horizon.',
  }
  if (Math.abs(args.aircraft.roll) > args.profile.stableRollRadians) return {
    status: 'bank-limit', severity: 'caution', label: 'Bank outside envelope',
    recoveryCue: 'Reduce bank and stabilize the turn.',
  }
  if (args.airspeed < args.targetSpeed[0]) return {
    status: 'low-energy', severity: 'caution', label: 'Below target speed',
    recoveryCue: 'Add power and avoid increasing pitch.',
  }
  if (args.airspeed > args.targetSpeed[1]) return {
    status: 'high-energy', severity: 'caution', label: 'Above target speed',
    recoveryCue: 'Reduce power and hold a stable attitude.',
  }
  return {
    status: 'on-target', severity: 'nominal', label: 'Envelope stable',
    recoveryCue: 'Hold attitude and power inside the target band.',
  }
}

export function projectFlightSimEnvelope(args: Readonly<{
  aircraft: Pick<FlightSimAircraftState, 'velocity' | 'pitch' | 'roll'>
  targetSpeedMetersPerSecond: readonly [number, number]
  airspeedReliable: boolean
}>, profile: FlightSimModelProfile = DEFAULT_FLIGHT_SIM_MODEL_PROFILE): FlightSimEnvelopeProjection {
  const airspeed = requireAirspeed(Math.hypot(...args.aircraft.velocity))
  const targetSpeed = requireTargetSpeedRange(args.targetSpeedMetersPerSecond)
  const status = envelopeStatus({
    aircraft: args.aircraft,
    airspeed,
    airspeedReliable: args.airspeedReliable,
    targetSpeed,
    profile,
  })
  return Object.freeze({
    ...status,
    airspeedMetersPerSecond: airspeed,
    airspeedReliable: args.airspeedReliable,
    targetSpeedMetersPerSecond: Object.freeze([...targetSpeed]) as readonly [number, number],
    controlAuthority: flightSimControlAuthority(airspeed, profile),
    stallSeverity: flightSimStallSeverity(airspeed, profile),
  })
}
