import { flightSimForwardVector } from './flightModel'
import type { FlightSimCameraView } from './flightSimCameraRuntime'
import type { FlightSimSnapshot } from './flightSimModel'

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
  const framing = view === 'cockpit'
    ? Object.freeze({ position: vector(1.2, 0.65), target: vector(14, 0.65), fovDegrees: 72 })
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
