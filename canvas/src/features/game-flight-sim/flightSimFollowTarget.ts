import { FLIGHT_SIM_AIRCRAFT_ASSET_SPEC } from './assetSpec/flightSimAssetSpec'
import type { FlightSimCameraView } from './flightSimCameraRuntime'
import type { FlightSimSnapshot } from './flightSimModel'
import { flightSimForwardVector } from './flightModel'

const COCKPIT_FORWARD_CLEARANCE_METERS = 0.55
const COCKPIT_VERTICAL_CLEARANCE_METERS = 0.45
const COCKPIT_LOOK_AHEAD_METERS = 18
const COCKPIT_FOV_DEGREES = 68

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
  const vector = (forwardDistance: number, height: number) => Object.freeze([
    aircraft[0] + forward[0] * forwardDistance * scale,
    aircraft[1] + forward[1] * forwardDistance * scale + height * scale,
    aircraft[2] + forward[2] * forwardDistance * scale,
  ] as const)
  const chaseTarget = vector(0, 0.8)
  const chasePosition = Object.freeze([
    chaseTarget[0] - forward[0] * 8 * scale,
    chaseTarget[1] - forward[1] * 2 * scale + 3.2 * scale,
    chaseTarget[2] - forward[2] * 8 * scale,
  ] as const)
  const cockpitForwardDistance = FLIGHT_SIM_AIRCRAFT_ASSET_SPEC.collisionHalfSizeMeters[2]
    + COCKPIT_FORWARD_CLEARANCE_METERS
  const cockpitHeight = FLIGHT_SIM_AIRCRAFT_ASSET_SPEC.collisionHalfSizeMeters[1]
    + COCKPIT_VERTICAL_CLEARANCE_METERS
  const framing = view === 'cockpit'
    ? Object.freeze({
        position: vector(cockpitForwardDistance, cockpitHeight),
        target: vector(COCKPIT_LOOK_AHEAD_METERS, cockpitHeight),
        fovDegrees: COCKPIT_FOV_DEGREES,
      })
    : view === 'survey'
      ? Object.freeze({ position: vector(-4, 18), target: vector(5, 0.8), fovDegrees: 64 })
      : Object.freeze({ position: chasePosition, target: chaseTarget, fovDegrees: 58 })
  return Object.freeze({
    position: framing.position,
    target: framing.target,
    fovDegrees: framing.fovDegrees,
    resetKey: snapshot.runId,
    sequence: snapshot.tick,
  })
}
