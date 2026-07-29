import type { FlightSimAircraftState } from './flightSimModel'

export const FLIGHT_SIM_STALL_SPEED_METERS_PER_SECOND = 7
export const FLIGHT_SIM_FULL_CONTROL_SPEED_METERS_PER_SECOND = 12
export const FLIGHT_SIM_MINIMUM_CONTROL_AUTHORITY = 0.3
export const FLIGHT_SIM_STALL_NOSE_DROP_RADIANS_PER_SECOND = 0.42
export const FLIGHT_SIM_STABLE_PITCH_RADIANS = 0.28
export const FLIGHT_SIM_STABLE_ROLL_RADIANS = 0.35

export type FlightSimEnvelopeStatus =
  | 'instrument-uncertain'
  | 'stall-risk'
  | 'pitch-limit'
  | 'bank-limit'
  | 'low-energy'
  | 'high-energy'
  | 'on-target'

export type FlightSimEnvelopeSeverity = 'nominal' | 'caution' | 'warning'

export type FlightSimEnvelopeProjection = Readonly<{
  status: FlightSimEnvelopeStatus
  severity: FlightSimEnvelopeSeverity
  label: string
  recoveryCue: string
  airspeedMetersPerSecond: number
  airspeedReliable: boolean
  targetSpeedMetersPerSecond: readonly [number, number]
  controlAuthority: number
  stallSeverity: number
}>

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value))
}

function requireAirspeed(value: number): number {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error('Flight envelope airspeed must be a finite non-negative number')
  }
  return value
}

function requireTargetSpeedRange(
  value: readonly [number, number],
): readonly [number, number] {
  const [minimum, maximum] = value
  if (!Number.isFinite(minimum) || !Number.isFinite(maximum) || minimum < 0 || maximum <= minimum) {
    throw new Error('Flight envelope target speed must be an increasing finite non-negative range')
  }
  return value
}

export function flightSimControlAuthority(airspeedValue: number): number {
  const airspeed = requireAirspeed(airspeedValue)
  const normalized = clamp(
    airspeed / FLIGHT_SIM_FULL_CONTROL_SPEED_METERS_PER_SECOND,
    0,
    1,
  )
  return FLIGHT_SIM_MINIMUM_CONTROL_AUTHORITY
    + (1 - FLIGHT_SIM_MINIMUM_CONTROL_AUTHORITY) * normalized
}

export function flightSimStallSeverity(airspeedValue: number): number {
  const airspeed = requireAirspeed(airspeedValue)
  return clamp(
    (FLIGHT_SIM_STALL_SPEED_METERS_PER_SECOND - airspeed)
      / FLIGHT_SIM_STALL_SPEED_METERS_PER_SECOND,
    0,
    1,
  )
}

function statusProjection(args: Readonly<{
  aircraft: Pick<FlightSimAircraftState, 'pitch' | 'roll'>
  airspeed: number
  airspeedReliable: boolean
  targetSpeed: readonly [number, number]
}>): Pick<FlightSimEnvelopeProjection, 'status' | 'severity' | 'label' | 'recoveryCue'> {
  if (!args.airspeedReliable) {
    return {
      status: 'instrument-uncertain',
      severity: 'warning',
      label: 'Airspeed unreliable',
      recoveryCue: 'Cross-check pitch, power, and visual attitude.',
    }
  }
  if (args.airspeed < FLIGHT_SIM_STALL_SPEED_METERS_PER_SECOND) {
    return {
      status: 'stall-risk',
      severity: 'warning',
      label: 'Stall risk',
      recoveryCue: 'Lower the nose, level the wings, and add power.',
    }
  }
  if (Math.abs(args.aircraft.pitch) > FLIGHT_SIM_STABLE_PITCH_RADIANS) {
    return {
      status: 'pitch-limit',
      severity: 'caution',
      label: 'Pitch outside envelope',
      recoveryCue: 'Ease pitch toward the horizon.',
    }
  }
  if (Math.abs(args.aircraft.roll) > FLIGHT_SIM_STABLE_ROLL_RADIANS) {
    return {
      status: 'bank-limit',
      severity: 'caution',
      label: 'Bank outside envelope',
      recoveryCue: 'Reduce bank and stabilize the turn.',
    }
  }
  if (args.airspeed < args.targetSpeed[0]) {
    return {
      status: 'low-energy',
      severity: 'caution',
      label: 'Below target speed',
      recoveryCue: 'Add power and avoid increasing pitch.',
    }
  }
  if (args.airspeed > args.targetSpeed[1]) {
    return {
      status: 'high-energy',
      severity: 'caution',
      label: 'Above target speed',
      recoveryCue: 'Reduce power and hold a stable attitude.',
    }
  }
  return {
    status: 'on-target',
    severity: 'nominal',
    label: 'Envelope stable',
    recoveryCue: 'Hold attitude and power inside the target band.',
  }
}

export function projectFlightSimEnvelope(args: Readonly<{
  aircraft: Pick<FlightSimAircraftState, 'velocity' | 'pitch' | 'roll'>
  targetSpeedMetersPerSecond: readonly [number, number]
  airspeedReliable: boolean
}>): FlightSimEnvelopeProjection {
  const airspeed = requireAirspeed(Math.hypot(...args.aircraft.velocity))
  const targetSpeed = requireTargetSpeedRange(args.targetSpeedMetersPerSecond)
  const status = statusProjection({
    aircraft: args.aircraft,
    airspeed,
    airspeedReliable: args.airspeedReliable,
    targetSpeed,
  })
  return Object.freeze({
    ...status,
    airspeedMetersPerSecond: airspeed,
    airspeedReliable: args.airspeedReliable,
    targetSpeedMetersPerSecond: Object.freeze([...targetSpeed]) as readonly [number, number],
    controlAuthority: flightSimControlAuthority(airspeed),
    stallSeverity: flightSimStallSeverity(airspeed),
  })
}
