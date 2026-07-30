import type { Feature, FeatureCollection, Polygon } from 'geojson'
import {
  flightGeoOverlayFeatureCollection,
  type FlightGeoOverlaySnapshot,
} from './flightGeoOverlay.js'

const METERS_PER_LATITUDE_DEGREE = 111_320
export const FLIGHT_GEO_AIRCRAFT_SHAPE_METERS = Object.freeze([
  Object.freeze([0, 30] as const),
  Object.freeze([5, 7] as const),
  Object.freeze([28, -5] as const),
  Object.freeze([7, -9] as const),
  Object.freeze([10, -22] as const),
  Object.freeze([3, -20] as const),
  Object.freeze([0, -26] as const),
  Object.freeze([-3, -20] as const),
  Object.freeze([-10, -22] as const),
  Object.freeze([-7, -9] as const),
  Object.freeze([-28, -5] as const),
  Object.freeze([-5, 7] as const),
])

function flightGeoAircraftShapeFeature(
  overlay: FlightGeoOverlaySnapshot,
): Feature<Polygon> | null {
  const [longitude, latitude] = overlay.aircraft.coordinate
  const headingDegrees = overlay.aircraft.headingDegrees
  if (![longitude, latitude, headingDegrees].every(Number.isFinite)) return null
  const headingRadians = headingDegrees * Math.PI / 180
  const latitudeRadians = latitude * Math.PI / 180
  const longitudeMetersPerDegree = METERS_PER_LATITUDE_DEGREE
    * Math.max(0.01, Math.abs(Math.cos(latitudeRadians)))
  const ring = FLIGHT_GEO_AIRCRAFT_SHAPE_METERS.map(
    ([rightMeters, forwardMeters]) => {
      const eastMeters = (
        rightMeters * Math.cos(headingRadians)
        + forwardMeters * Math.sin(headingRadians)
      )
      const northMeters = (
        forwardMeters * Math.cos(headingRadians)
        - rightMeters * Math.sin(headingRadians)
      )
      return [
        longitude + eastMeters / longitudeMetersPerDegree,
        latitude + northMeters / METERS_PER_LATITUDE_DEGREE,
      ]
    },
  )
  ring.push([...ring[0]])
  return {
    type: 'Feature',
    id: `${overlay.profileId}:aircraft`,
    geometry: {
      type: 'Polygon',
      coordinates: [ring],
    },
    properties: {
      kgFlightOverlayKind: 'aircraft',
      kgFlightNight: overlay.night,
      altitudeMeters: overlay.aircraft.altitudeMeters,
      headingDegrees,
    },
  }
}

export function flightGeoOverlayMapLibreFeatureCollection(
  overlay: FlightGeoOverlaySnapshot,
): FeatureCollection {
  const collection = flightGeoOverlayFeatureCollection(overlay)
  const aircraftShape = flightGeoAircraftShapeFeature(overlay)
  if (!aircraftShape || collection.features.length === 0) return collection
  return {
    ...collection,
    features: collection.features.map(feature => (
      feature.properties?.kgFlightOverlayKind === 'aircraft'
        ? aircraftShape
        : feature
    )),
  }
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * GeoJSONSource#setData restarts its worker update even when the serialized
 * payload is unchanged. Keep feature and coordinate order exact, while
 * treating record key order as an implementation detail of serialization.
 */
function hasExactFlightGeoOverlayValue(
  expected: unknown,
  actual: unknown,
): boolean {
  if (Object.is(expected, actual)) return true
  if (Array.isArray(expected)) {
    return Array.isArray(actual)
      && expected.length === actual.length
      && expected.every((value, index) => (
        hasExactFlightGeoOverlayValue(value, actual[index])
      ))
  }
  if (!isPlainRecord(expected) || !isPlainRecord(actual)) return false
  const expectedKeys = Object.keys(expected)
  const actualKeys = Object.keys(actual)
  return expectedKeys.length === actualKeys.length
    && expectedKeys.every(key => (
      Object.prototype.hasOwnProperty.call(actual, key)
      && hasExactFlightGeoOverlayValue(expected[key], actual[key])
    ))
}

export function hasExactFlightGeoOverlayFeatureCollection(
  expected: FeatureCollection,
  actual: unknown,
): boolean {
  return hasExactFlightGeoOverlayValue(expected, actual)
}
