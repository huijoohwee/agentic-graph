export type GeospatialCoordinate = readonly [
  longitude: number,
  latitude: number,
]

export type GeospatialPresentationBounds = readonly [
  southwest: GeospatialCoordinate,
  northeast: GeospatialCoordinate,
]

export type GeospatialLinearRing = readonly [
  southwest: GeospatialCoordinate,
  southeast: GeospatialCoordinate,
  northeast: GeospatialCoordinate,
  northwest: GeospatialCoordinate,
  close: GeospatialCoordinate,
]

/**
 * A viewport extent for Singapore's primary urban islands.
 *
 * This is presentation framing, not an administrative or legal boundary.
 */
const PRESENTATION_BOUNDS: GeospatialPresentationBounds = Object.freeze([
  Object.freeze([103.605, 1.158]) as GeospatialCoordinate,
  Object.freeze([104.09, 1.48]) as GeospatialCoordinate,
])

export const SINGAPORE_FLIGHT_GEO_REFERENCE = Object.freeze({
  anchor: Object.freeze([103.851959, 1.29027]) as GeospatialCoordinate,
  center: Object.freeze([103.8198, 1.3521]) as GeospatialCoordinate,
  presentationBounds: PRESENTATION_BOUNDS,
})

export const SINGAPORE_CANONICAL_CENTER =
  SINGAPORE_FLIGHT_GEO_REFERENCE.center

export const SINGAPORE_FLIGHT_GEO_ANCHOR =
  SINGAPORE_FLIGHT_GEO_REFERENCE.anchor

export const SINGAPORE_PRESENTATION_BOUNDS =
  SINGAPORE_FLIGHT_GEO_REFERENCE.presentationBounds

const METERS_PER_LATITUDE_DEGREE = 111_320

const assertFiniteDistance = (value: number, label: string): void => {
  if (!Number.isFinite(value)) {
    throw new RangeError(`${label} must be finite`)
  }
}

export function projectSingaporeLocalMeters(
  eastMeters: number,
  northMeters: number,
  anchor: GeospatialCoordinate = SINGAPORE_FLIGHT_GEO_ANCHOR,
): GeospatialCoordinate {
  assertFiniteDistance(eastMeters, 'eastMeters')
  assertFiniteDistance(northMeters, 'northMeters')
  const latitudeRadians = anchor[1] * Math.PI / 180
  const metersPerLongitudeDegree =
    METERS_PER_LATITUDE_DEGREE * Math.cos(latitudeRadians)
  return Object.freeze([
    anchor[0] + eastMeters / metersPerLongitudeDegree,
    anchor[1] + northMeters / METERS_PER_LATITUDE_DEGREE,
  ])
}

export function projectSingaporeLocalRectangle(
  widthMeters: number,
  depthMeters: number,
  center: GeospatialCoordinate = SINGAPORE_FLIGHT_GEO_ANCHOR,
): GeospatialLinearRing {
  assertFiniteDistance(widthMeters, 'widthMeters')
  assertFiniteDistance(depthMeters, 'depthMeters')
  if (widthMeters <= 0 || depthMeters <= 0) {
    throw new RangeError('widthMeters and depthMeters must be greater than zero')
  }

  const halfWidthMeters = widthMeters / 2
  const halfDepthMeters = depthMeters / 2
  const southwest = projectSingaporeLocalMeters(
    -halfWidthMeters,
    -halfDepthMeters,
    center,
  )
  const southeast = projectSingaporeLocalMeters(
    halfWidthMeters,
    -halfDepthMeters,
    center,
  )
  const northeast = projectSingaporeLocalMeters(
    halfWidthMeters,
    halfDepthMeters,
    center,
  )
  const northwest = projectSingaporeLocalMeters(
    -halfWidthMeters,
    halfDepthMeters,
    center,
  )

  return Object.freeze([
    southwest,
    southeast,
    northeast,
    northwest,
    southwest,
  ])
}
