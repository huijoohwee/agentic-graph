import type { SpatialVector } from '@/features/physics/spatialPhysicsTypes'
import {
  FLIGHT_SIM_FIXED_STEP_SECONDS,
  freezeFlightSimAircraftState,
  normalizeFlightSimInput,
  type FlightSimAircraftState,
  type FlightSimTickInput,
} from './flightSimModel'
import {
  FLIGHT_SIM_STALL_NOSE_DROP_RADIANS_PER_SECOND,
  flightSimControlAuthority,
  flightSimStallSeverity,
} from './flightSimEnvelope'

const MAX_PITCH_RADIANS = Math.PI * 0.28
const MAX_ROLL_RADIANS = Math.PI * 0.38
const PITCH_RATE_RADIANS_PER_SECOND = 0.72
const ROLL_RATE_RADIANS_PER_SECOND = 1.08
const YAW_RATE_RADIANS_PER_SECOND = 0.58
const BANK_TURN_RATE = 0.42
const THROTTLE_RATE_PER_SECOND = 0.48
const THRUST_ACCELERATION = 10.5
const LIFT_COEFFICIENT = 0.07
const BASE_DRAG = 0.018
const SPEED_DRAG = 0.0018
const GRAVITY = 9.81
const VELOCITY_ALIGNMENT_RATE = 0.42
const MAX_AIRSPEED_METERS_PER_SECOND = 48

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value))
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

function boundedStepSeconds(value: number): number {
  if (!Number.isFinite(value) || value <= 0 || value > 0.25) {
    throw new Error('Flight Sim step must be a finite number from 0 to 0.25 seconds')
  }
  return value
}

export function integrateFlightModel(
  previous: FlightSimAircraftState,
  inputValue: FlightSimTickInput,
  stepSecondsValue = FLIGHT_SIM_FIXED_STEP_SECONDS,
): FlightSimAircraftState {
  const stepSeconds = boundedStepSeconds(stepSecondsValue)
  const input = normalizeFlightSimInput(inputValue)
  const speed = flightSimAirspeed(previous)
  const controlAuthority = flightSimControlAuthority(speed)
  const stallSeverity = flightSimStallSeverity(speed)
  const pitchTarget = previous.pitch + (
    input.pitch * PITCH_RATE_RADIANS_PER_SECOND * controlAuthority
    - stallSeverity * FLIGHT_SIM_STALL_NOSE_DROP_RADIANS_PER_SECOND
  ) * stepSeconds
  const rollTarget = previous.roll
    + input.roll * ROLL_RATE_RADIANS_PER_SECOND * controlAuthority * stepSeconds
  const pitch = clamp(
    input.pitch === 0 ? pitchTarget * Math.exp(-0.28 * stepSeconds) : pitchTarget,
    -MAX_PITCH_RADIANS,
    MAX_PITCH_RADIANS,
  )
  const roll = clamp(
    input.roll === 0 ? rollTarget * Math.exp(-0.5 * stepSeconds) : rollTarget,
    -MAX_ROLL_RADIANS,
    MAX_ROLL_RADIANS,
  )
  const yaw = normalizeFlightSimAngle(
    previous.yaw
    + (
      input.yaw * YAW_RATE_RADIANS_PER_SECOND
      - Math.sin(roll) * BANK_TURN_RATE
    ) * controlAuthority * stepSeconds,
  )
  const throttle = clamp(
    previous.throttle + input.throttleDelta * THROTTLE_RATE_PER_SECOND * stepSeconds,
    0,
    1,
  )
  const forward = flightSimForwardVector(pitch, yaw)
  const forwardSpeed = Math.max(0, (
    previous.velocity[0] * forward[0]
    + previous.velocity[1] * forward[1]
    + previous.velocity[2] * forward[2]
  ))
  const lift = Math.min(GRAVITY * 1.8, forwardSpeed * forwardSpeed * LIFT_COEFFICIENT * Math.cos(roll))
  const dragCoefficient = BASE_DRAG + speed * SPEED_DRAG
  const alignedVelocity: SpatialVector = speed > 1e-8
    ? [
        previous.velocity[0] + (forward[0] * speed - previous.velocity[0]) * VELOCITY_ALIGNMENT_RATE * stepSeconds,
        previous.velocity[1] + (forward[1] * speed - previous.velocity[1]) * VELOCITY_ALIGNMENT_RATE * stepSeconds,
        previous.velocity[2] + (forward[2] * speed - previous.velocity[2]) * VELOCITY_ALIGNMENT_RATE * stepSeconds,
      ]
    : previous.velocity
  const acceleration: SpatialVector = [
    forward[0] * THRUST_ACCELERATION * throttle - alignedVelocity[0] * dragCoefficient,
    forward[1] * THRUST_ACCELERATION * throttle + lift - GRAVITY - alignedVelocity[1] * dragCoefficient,
    forward[2] * THRUST_ACCELERATION * throttle - alignedVelocity[2] * dragCoefficient,
  ]
  let velocity: SpatialVector = [
    alignedVelocity[0] + acceleration[0] * stepSeconds,
    alignedVelocity[1] + acceleration[1] * stepSeconds,
    alignedVelocity[2] + acceleration[2] * stepSeconds,
  ]
  const nextSpeed = Math.hypot(...velocity)
  if (nextSpeed > MAX_AIRSPEED_METERS_PER_SECOND) {
    const scale = MAX_AIRSPEED_METERS_PER_SECOND / nextSpeed
    velocity = [velocity[0] * scale, velocity[1] * scale, velocity[2] * scale]
  }
  const position: SpatialVector = [
    previous.position[0] + velocity[0] * stepSeconds,
    previous.position[1] + velocity[1] * stepSeconds,
    previous.position[2] + velocity[2] * stepSeconds,
  ]
  return freezeFlightSimAircraftState({ position, velocity, pitch, roll, yaw, throttle })
}
