import type { SpatialVector } from '@/features/physics/spatialPhysicsTypes'
import { projectSingaporeLocalMeters } from '@/lib/gympgrph/api'

export type FlightSimGeospatialCoordinate = readonly [
  longitude: number,
  latitude: number,
]

/**
 * Places mission-metre coordinates in the same Singapore-local frame used by
 * the aircraft, route, and XR environment.  All Flight callers must subtract
 * the spawn origin so the authored stage cannot drift away from the mission.
 */
export function projectFlightSimMissionPositionToGeospatial(
  position: SpatialVector,
  origin: SpatialVector,
): FlightSimGeospatialCoordinate {
  return projectSingaporeLocalMeters(
    position[0] - origin[0],
    origin[2] - position[2],
  )
}
