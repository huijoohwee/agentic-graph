import type {
  FlightSimSnapshot,
  FlightSimSpatialProfile,
} from './flightSimModel'

export type FlightSimNavigationPoint = Readonly<{
  id: string
  x: number
  y: number
  state: 'active' | 'pending' | 'visited'
  kind: 'spawn' | 'waypoint' | 'landing'
}>

export type FlightSimNavigationProjection = Readonly<{
  aircraft: Readonly<{ x: number; y: number; headingDegrees: number }>
  objective: Readonly<{
    id: string
    distanceMeters: number
    bearingDegrees: number
  }> | null
  route: readonly FlightSimNavigationPoint[]
}>

const MAP_MARGIN = 0.08

function headingDegrees(yaw: number): number {
  return ((-yaw * 180 / Math.PI) % 360 + 360) % 360
}

function objectiveBearingDegrees(deltaX: number, deltaZ: number): number {
  return ((Math.atan2(deltaX, -deltaZ) * 180 / Math.PI) % 360 + 360) % 360
}

export function projectFlightSimNavigation(
  flight: FlightSimSnapshot,
  profile: FlightSimSpatialProfile,
): FlightSimNavigationProjection {
  const routeWorld = [
    Object.freeze({ id: 'flight-sim:spawn', position: profile.spawn.position, kind: 'spawn' as const }),
    ...profile.waypoints.map(waypoint => Object.freeze({
      id: waypoint.id,
      position: waypoint.position,
      kind: 'waypoint' as const,
    })),
    Object.freeze({
      id: profile.landingPad.id,
      position: profile.landingPad.position,
      kind: 'landing' as const,
    }),
  ]
  const allPositions = [...routeWorld.map(point => point.position), flight.aircraft.position]
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
  const landingActive = flight.waypointIndex >= profile.waypoints.length
  const route = Object.freeze(routeWorld.map((point, routeIndex) => {
    const mapPoint = project(point.position)
    const waypointIndex = routeIndex - 1
    const state = point.kind === 'spawn'
      ? 'visited'
      : point.kind === 'landing'
        ? flight.phase === 'completed'
          ? 'visited'
          : landingActive ? 'active' : 'pending'
        : waypointIndex < flight.waypointIndex
          ? 'visited'
          : waypointIndex === flight.waypointIndex ? 'active' : 'pending'
    return Object.freeze({ ...point, ...mapPoint, state })
  }))
  const objectiveWorld = profile.waypoints[flight.waypointIndex]
    || (flight.phase === 'completed' ? null : profile.landingPad)
  const objective = objectiveWorld
    ? (() => {
        const deltaX = objectiveWorld.position[0] - flight.aircraft.position[0]
        const deltaY = objectiveWorld.position[1] - flight.aircraft.position[1]
        const deltaZ = objectiveWorld.position[2] - flight.aircraft.position[2]
        return Object.freeze({
          id: objectiveWorld.id,
          distanceMeters: Math.hypot(deltaX, deltaY, deltaZ),
          bearingDegrees: objectiveBearingDegrees(deltaX, deltaZ),
        })
      })()
    : null
  return Object.freeze({
    aircraft: Object.freeze({
      ...project(flight.aircraft.position),
      headingDegrees: headingDegrees(flight.aircraft.yaw),
    }),
    objective,
    route,
  })
}
