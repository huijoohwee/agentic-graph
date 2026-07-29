import type {
  FlightSimSnapshot,
  FlightSimSpatialProfile,
} from './flightSimModel'
import {
  projectFlightSimRouteGuidance,
  type FlightSimRoutePointKind,
  type FlightSimRoutePointState,
} from './flightSimRouteGuidance'

export type FlightSimNavigationPoint = Readonly<{
  id: string
  x: number
  y: number
  state: FlightSimRoutePointState
  kind: FlightSimRoutePointKind
}>

export type FlightSimNavigationProjection = Readonly<{
  aircraft: Readonly<{ x: number; y: number; headingDegrees: number }>
  objective: Readonly<{
    bearingDegrees: number
    distanceMeters: number
    headingErrorDegrees: number
    id: string
    kind: 'waypoint' | 'landing'
    label: string
    x: number
    y: number
  }> | null
  route: readonly FlightSimNavigationPoint[]
}>

const MAP_MARGIN = 0.08

export function projectFlightSimNavigation(
  flight: FlightSimSnapshot,
  profile: FlightSimSpatialProfile,
): FlightSimNavigationProjection {
  const guidance = projectFlightSimRouteGuidance(flight, profile)
  const allPositions = [
    ...guidance.route.map(point => point.position),
    flight.aircraft.position,
  ]
  const xValues = allPositions.map(position => position[0])
  const zValues = allPositions.map(position => position[2])
  const minimumX = Math.min(...xValues)
  const maximumX = Math.max(...xValues)
  const minimumZ = Math.min(...zValues)
  const maximumZ = Math.max(...zValues)
  const span = Math.max(maximumX - minimumX, maximumZ - minimumZ, 1)
  const centerX = (minimumX + maximumX) / 2
  const centerZ = (minimumZ + maximumZ) / 2
  const mapMinimumX = centerX - span / 2
  const mapMinimumZ = centerZ - span / 2
  const project = (position: readonly number[]) => Object.freeze({
    x: MAP_MARGIN + ((position[0]! - mapMinimumX) / span) * (1 - MAP_MARGIN * 2),
    y: MAP_MARGIN + ((position[2]! - mapMinimumZ) / span) * (1 - MAP_MARGIN * 2),
  })
  const route = Object.freeze(guidance.route.map(point => {
    const mapPoint = project(point.position)
    return Object.freeze({
      id: point.id,
      kind: point.kind,
      state: point.state,
      ...mapPoint,
    })
  }))
  const objective = guidance.objective
    ? (() => {
        const { position, ...details } = guidance.objective
        return Object.freeze({
          ...details,
          ...project(position),
        })
      })()
    : null
  return Object.freeze({
    aircraft: Object.freeze({
      ...project(flight.aircraft.position),
      headingDegrees: guidance.aircraftHeadingDegrees,
    }),
    objective,
    route,
  })
}
