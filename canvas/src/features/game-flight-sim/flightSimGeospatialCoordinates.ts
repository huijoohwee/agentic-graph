import type { SpatialVector } from '@/features/physics/spatialPhysicsTypes'
import { projectSingaporeLocalMeters } from '@/lib/gympgrph/api'

export type FlightSimGeospatialCoordinate = readonly [
  longitude: number,
  latitude: number,
]

/**
 * Mission route and aircraft positions subtract their converted spawn origin.
 * XR environment assets are already authored in metres and project directly.
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
