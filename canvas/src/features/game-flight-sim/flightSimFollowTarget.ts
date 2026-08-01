import type { FlightSimCameraView } from './flightSimCameraRuntime'
import {
  FLIGHT_SIM_AIRCRAFT_COLLISION_HALF_SIZE_METERS,
  type FlightSimSnapshot,
} from './flightSimModel'
import { flightSimForwardVector } from './flightModel'

const COCKPIT_FORWARD_CLEARANCE_METERS = 0.55
const COCKPIT_VERTICAL_CLEARANCE_METERS = 0.45
const COCKPIT_LOOK_AHEAD_METERS = 18
const COCKPIT_FOV_DEGREES = 68
const CHASE_MIN_DISTANCE_METERS = 8
const CHASE_TARGET_MIN_HEIGHT_METERS = 0.8
const CHASE_HEIGHT_METERS = 3.2
const CHASE_FOV_DEGREES = 58
const CHASE_WING_HALF_SPAN_CLEARANCE = 2

export type FlightSimFollowTarget = Readonly<{
  position: readonly [number, number, number]
  target: readonly [number, number, number]
  fovDegrees: number
  resetKey: number
  sequence: number
}>

export function resolveFlightSimFollowTarget(
  snapshot: FlightSimSnapshot,
  coordinateScale: number,
  view: FlightSimCameraView = 'chase',
): FlightSimFollowTarget {
  const scale = Number.isFinite(coordinateScale) && coordinateScale > 0
    ? coordinateScale
    : 1
  const forward = flightSimForwardVector(
    snapshot.aircraft.pitch,
    snapshot.aircraft.yaw,
  )
  const aircraft = Object.freeze([
    snapshot.aircraft.position[0] * scale,
    snapshot.aircraft.position[1] * scale,
    snapshot.aircraft.position[2] * scale,
  ] as const)
  const [
    aircraftHalfWidth,
    aircraftHalfHeight,
    aircraftHalfDepth,
  ] = FLIGHT_SIM_AIRCRAFT_COLLISION_HALF_SIZE_METERS
  const vector = (forwardDistance: number, height: number) => Object.freeze([
    aircraft[0] + forward[0] * forwardDistance * scale,
    aircraft[1] + forward[1] * forwardDistance * scale + height * scale,
    aircraft[2] + forward[2] * forwardDistance * scale,
  ] as const)
  const chaseTargetHeight = Math.max(
    CHASE_TARGET_MIN_HEIGHT_METERS,
    aircraftHalfHeight,
  )
  // Keep the camera behind the aircraft's aft envelope plus two half-spans.
  // That fits the canonical aircraft collision envelope inside the chase frustum.
  const chaseDistance = Math.max(
    CHASE_MIN_DISTANCE_METERS,
    aircraftHalfDepth + aircraftHalfWidth * CHASE_WING_HALF_SPAN_CLEARANCE,
  )
  const chaseTarget = vector(0, chaseTargetHeight)
  const chasePosition = Object.freeze([
    chaseTarget[0] - forward[0] * chaseDistance * scale,
    chaseTarget[1] - forward[1] * 2 * scale + CHASE_HEIGHT_METERS * scale,
    chaseTarget[2] - forward[2] * chaseDistance * scale,
  ] as const)
  const cockpitForwardDistance = FLIGHT_SIM_AIRCRAFT_COLLISION_HALF_SIZE_METERS[2]
    + COCKPIT_FORWARD_CLEARANCE_METERS
  const cockpitHeight = FLIGHT_SIM_AIRCRAFT_COLLISION_HALF_SIZE_METERS[1]
    + COCKPIT_VERTICAL_CLEARANCE_METERS
  const horizontalForwardLength = Math.max(
    0.000001,
    Math.hypot(forward[0], forward[2]),
  )
  const horizontalForward = Object.freeze([
    forward[0] / horizontalForwardLength,
    0,
    forward[2] / horizontalForwardLength,
  ] as const)
  const cockpitPosition = Object.freeze([
    aircraft[0] + horizontalForward[0] * cockpitForwardDistance * scale,
    aircraft[1] + cockpitHeight * scale,
    aircraft[2] + horizontalForward[2] * cockpitForwardDistance * scale,
  ] as const)
  const cockpitTarget = Object.freeze([
    cockpitPosition[0] + forward[0] * COCKPIT_LOOK_AHEAD_METERS * scale,
    cockpitPosition[1] + forward[1] * COCKPIT_LOOK_AHEAD_METERS * scale,
    cockpitPosition[2] + forward[2] * COCKPIT_LOOK_AHEAD_METERS * scale,
  ] as const)
  const framing = view === 'cockpit'
    ? Object.freeze({
        position: cockpitPosition,
        target: cockpitTarget,
        fovDegrees: COCKPIT_FOV_DEGREES,
      })
    : view === 'survey'
      ? Object.freeze({ position: vector(-4, 18), target: vector(5, 0.8), fovDegrees: 64 })
      : Object.freeze({ position: chasePosition, target: chaseTarget, fovDegrees: CHASE_FOV_DEGREES })
  return Object.freeze({
    position: framing.position,
    target: framing.target,
    fovDegrees: framing.fovDegrees,
    resetKey: snapshot.runId,
    sequence: snapshot.tick,
  })
}
