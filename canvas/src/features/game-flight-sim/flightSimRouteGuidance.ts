import type { SpatialVector } from '@/features/physics/spatialPhysicsTypes'
import { flightSimHeadingDegrees } from '../../../../packages/apple-spatial-input/src/flight'
import type {
  FlightSimSnapshot,
  FlightSimSpatialProfile,
} from './flightSimModel'

export type FlightSimRoutePointKind = 'spawn' | 'waypoint' | 'landing'
export type FlightSimRoutePointState = 'active' | 'pending' | 'visited'

export type FlightSimRouteGuidancePoint = Readonly<{
  id: string
  kind: FlightSimRoutePointKind
  position: SpatialVector
  state: FlightSimRoutePointState
}>

export type FlightSimRouteObjective = Readonly<{
  bearingDegrees: number
  distanceMeters: number
  headingErrorDegrees: number
  id: string
  kind: 'waypoint' | 'landing'
  label: string
  position: SpatialVector
}>

export type FlightSimRouteGuidance = Readonly<{
  aircraftHeadingDegrees: number
  objective: FlightSimRouteObjective | null
  route: readonly FlightSimRouteGuidancePoint[]
}>

function normalizeHeadingErrorDegrees(value: number): number {
  return ((value + 540) % 360 + 360) % 360 - 180
}

function objectiveBearingDegrees(
  deltaX: number,
  deltaZ: number,
  fallbackHeadingDegrees: number,
): number {
  if (Math.hypot(deltaX, deltaZ) < 1e-9) return fallbackHeadingDegrees
  return ((Math.atan2(deltaX, -deltaZ) * 180 / Math.PI) % 360 + 360) % 360
}

export function projectFlightSimRouteGuidance(
  flight: FlightSimSnapshot,
  profile: FlightSimSpatialProfile,
): FlightSimRouteGuidance {
  const landingActive = flight.waypointIndex >= profile.waypoints.length
  const aircraftHeadingDegrees = flightSimHeadingDegrees(flight.aircraft.yaw)
  const route = Object.freeze([
    Object.freeze({
      id: 'flight-sim:spawn',
      kind: 'spawn' as const,
      position: profile.spawn.position,
      state: 'visited' as const,
    }),
    ...profile.waypoints.map((waypoint, waypointIndex) => Object.freeze({
      id: waypoint.id,
      kind: 'waypoint' as const,
      position: waypoint.position,
      state: waypointIndex < flight.waypointIndex
        ? 'visited' as const
        : waypointIndex === flight.waypointIndex
          ? 'active' as const
          : 'pending' as const,
    })),
    Object.freeze({
      id: profile.landingPad.id,
      kind: 'landing' as const,
      position: profile.landingPad.position,
      state: flight.phase === 'completed'
        ? 'visited' as const
        : landingActive ? 'active' as const : 'pending' as const,
    }),
  ])
  const waypoint = profile.waypoints[flight.waypointIndex]
  const objectiveSeed = waypoint
    ? Object.freeze({
        id: waypoint.id,
        kind: 'waypoint' as const,
        label: `WP${flight.waypointIndex + 1}`,
        position: waypoint.position,
      })
    : flight.phase === 'completed'
      ? null
      : Object.freeze({
          id: profile.landingPad.id,
          kind: 'landing' as const,
          label: 'LAND',
          position: profile.landingPad.position,
        })
  const objective = objectiveSeed
    ? (() => {
        const deltaX = objectiveSeed.position[0] - flight.aircraft.position[0]
        const deltaY = objectiveSeed.position[1] - flight.aircraft.position[1]
        const deltaZ = objectiveSeed.position[2] - flight.aircraft.position[2]
        const bearingDegrees = objectiveBearingDegrees(
          deltaX,
          deltaZ,
          aircraftHeadingDegrees,
        )
        return Object.freeze({
          ...objectiveSeed,
          bearingDegrees,
          distanceMeters: Math.hypot(deltaX, deltaY, deltaZ),
          headingErrorDegrees: normalizeHeadingErrorDegrees(
            bearingDegrees - aircraftHeadingDegrees,
          ),
        })
      })()
    : null
  return Object.freeze({
    aircraftHeadingDegrees,
    objective,
    route,
  })
}

export function formatFlightSimCourseDirector(
  objective: Pick<
    FlightSimRouteObjective,
    'distanceMeters' | 'headingErrorDegrees' | 'label'
  > | null,
): string {
  if (!objective) return 'COURSE COMPLETE'
  const headingError = Math.round(objective.headingErrorDegrees)
  const absoluteHeadingError = Math.abs(headingError)
  const turnCue = absoluteHeadingError < 4
    ? 'HOLD COURSE'
    : `TURN ${headingError < 0 ? 'L' : 'R'} ${absoluteHeadingError}°`
  return [
    objective.label,
    `${Math.round(objective.distanceMeters)} m`,
    turnCue,
  ].join(' · ')
}
