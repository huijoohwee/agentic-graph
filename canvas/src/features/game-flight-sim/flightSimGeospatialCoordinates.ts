import type { SpatialVector } from '@/features/physics/spatialPhysicsTypes'
import { projectLocalMetersToGeospatial } from '@/lib/gympgrph/api'

export type FlightSimGeospatialCoordinate = readonly [
  longitude: number,
  latitude: number,
]

export type FlightSimGeographicReference = Readonly<{
  anchor: FlightSimGeospatialCoordinate
  presentationBounds: readonly [FlightSimGeospatialCoordinate, FlightSimGeospatialCoordinate]
}>

/** Geography is optional for the local kernel, and has no implicit Flight default. */
export function validateFlightSimGeographicReference(value: unknown): FlightSimGeographicReference | null {
  if (value === undefined) return null
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('Flight geographic reference must be an authored object.')
  }
  const input = value as Record<string, unknown>
  if (Object.keys(input).some(key => !['anchor', 'presentationBounds'].includes(key))) {
    throw new TypeError('Flight geographic reference contains an unsupported field.')
  }
  const coordinate = (entry: unknown): FlightSimGeospatialCoordinate => {
    if (!Array.isArray(entry) || entry.length !== 2
      || !Number.isFinite(entry[0]) || Math.abs(entry[0]) > 180
      || !Number.isFinite(entry[1]) || Math.abs(entry[1]) >= 90) {
      throw new RangeError('Flight geographic coordinates must be finite [longitude, latitude] away from the poles.')
    }
    return Object.freeze([entry[0], entry[1]])
  }
  const anchor = coordinate(input.anchor)
  projectLocalMetersToGeospatial(0, 0, anchor)
  if (!Array.isArray(input.presentationBounds) || input.presentationBounds.length !== 2) {
    throw new TypeError('Flight geographic presentationBounds must contain two coordinates.')
  }
  const southwest = coordinate(input.presentationBounds[0])
  const northeast = coordinate(input.presentationBounds[1])
  if (southwest[0] >= northeast[0] || southwest[1] >= northeast[1]
    || anchor[0] < southwest[0] || anchor[0] > northeast[0]
    || anchor[1] < southwest[1] || anchor[1] > northeast[1]) {
    throw new RangeError('Flight geographic bounds must be ordered and contain the authored anchor.')
  }
  return Object.freeze({ anchor, presentationBounds: Object.freeze([southwest, northeast]) as readonly [FlightSimGeospatialCoordinate, FlightSimGeospatialCoordinate] })
}

/**
 * Mission route and aircraft positions subtract their converted spawn origin.
 * XR environment assets are already authored in metres and project directly.
 */
export function projectFlightSimMissionPositionToGeospatial(
  position: SpatialVector,
  origin: SpatialVector,
  reference: FlightSimGeographicReference,
): FlightSimGeospatialCoordinate {
  return projectLocalMetersToGeospatial(
    position[0] - origin[0],
    origin[2] - position[2],
    reference.anchor,
  )
}
