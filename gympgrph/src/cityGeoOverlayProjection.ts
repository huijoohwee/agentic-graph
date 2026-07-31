import type { Feature, FeatureCollection, Polygon } from 'geojson'
import {
  deriveRegionalPoiLongitudeSpan,
  normalizeRegionalPoiLongitude,
} from 'grph-shared/geospatial/regionalPoiGeo'
import {
  createCityGeoOverlaySnapshot,
  type CityGeoCoordinate,
  type CityGeoOverlaySnapshot,
  type CityGeoParcelState,
  type CityGeoViewMode,
  type CityGeoZoneStyle,
  type CityGeographicProfile,
} from './cityGeoOverlay.js'
import {
  regionalPoiProfileBounds,
} from './regionalPoiMapLibre.js'

const METERS_PER_LATITUDE_DEGREE = 111_320

export type CityGeoParcelProperties = Readonly<{
  column: number
  kgCityBaseHeightMeters: number
  kgCityFillColor: string
  kgCityHeightMeters: number
  kgCityOutlineColor: string
  kgCityOverlayKind: 'parcel'
  kgCityProfileId: string
  kgCityProfileRevision: string
  kgCitySelected: boolean
  kgCitySelectedOutlineColor: string
  landValueCents: number
  parcelId: string
  pollution: number
  population: number
  row: number
  zone: CityGeoParcelState['zone']
}>

export type CityGeoParcelFeatureCollection = FeatureCollection<
  Polygon,
  CityGeoParcelProperties
>

export type CityGeoBounds = readonly [
  southwest: CityGeoCoordinate,
  northeast: CityGeoCoordinate,
]

export type CityGeoGridFootprint = Readonly<{
  bearingDegrees: number
  center: CityGeoCoordinate
  columnGapMeters: number
  columns: number
  parcelDepthMeters: number
  parcelWidthMeters: number
  rowGapMeters: number
  rows: number
}>

function parcelHeightMeters(
  parcel: CityGeoParcelState,
  style: CityGeoZoneStyle,
): number {
  const landValueHeight = style.landValueCentsPerHeightMeter === null
    ? 0
    : parcel.landValueCents / style.landValueCentsPerHeightMeter
  const populationHeight = style.populationPerHeightMeter === null
    ? 0
    : parcel.population / style.populationPerHeightMeter
  return Number(Math.min(
    style.maxHeightMeters,
    style.baseHeightMeters + landValueHeight + populationHeight,
  ).toFixed(3))
}

function geographicCoordinate(
  profile: Pick<CityGeographicProfile, 'bearingDegrees' | 'center'>,
  eastMeters: number,
  northMeters: number,
): [number, number] {
  const bearingRadians = profile.bearingDegrees * Math.PI / 180
  const latitudeRadians = profile.center[1] * Math.PI / 180
  const longitudeMetersPerDegree = METERS_PER_LATITUDE_DEGREE
    * Math.abs(Math.cos(latitudeRadians))
  const rotatedEastMeters = (
    eastMeters * Math.cos(bearingRadians)
    + northMeters * Math.sin(bearingRadians)
  )
  const rotatedNorthMeters = (
    northMeters * Math.cos(bearingRadians)
    - eastMeters * Math.sin(bearingRadians)
  )
  const coordinate: [number, number] = [
    normalizeRegionalPoiLongitude(
      profile.center[0] + rotatedEastMeters / longitudeMetersPerDegree,
    ),
    profile.center[1] + rotatedNorthMeters / METERS_PER_LATITUDE_DEGREE,
  ]
  if (
    !coordinate.every(Number.isFinite)
    || coordinate[1] < -85
    || coordinate[1] > 85
  ) {
    throw new Error('City geographic profile projects a parcel outside supported bounds.')
  }
  return coordinate
}

export function cityGeoGridProjectedBounds(
  footprint: CityGeoGridFootprint,
): CityGeoBounds {
  if (
    !Number.isSafeInteger(footprint.rows)
    || footprint.rows <= 0
    || !Number.isSafeInteger(footprint.columns)
    || footprint.columns <= 0
  ) {
    throw new Error('City projected grid dimensions must be positive safe integers.')
  }
  const totalWidthMeters = (
    footprint.columns * footprint.parcelWidthMeters
    + (footprint.columns - 1) * footprint.columnGapMeters
  )
  const totalDepthMeters = (
    footprint.rows * footprint.parcelDepthMeters
    + (footprint.rows - 1) * footprint.rowGapMeters
  )
  if (
    !Number.isFinite(totalWidthMeters)
    || totalWidthMeters <= 0
    || !Number.isFinite(totalDepthMeters)
    || totalDepthMeters <= 0
  ) {
    throw new Error('City projected grid footprint must have positive finite dimensions.')
  }
  const halfWidthMeters = totalWidthMeters / 2
  const halfDepthMeters = totalDepthMeters / 2
  const coordinates = [
    [-halfWidthMeters, -halfDepthMeters],
    [halfWidthMeters, -halfDepthMeters],
    [halfWidthMeters, halfDepthMeters],
    [-halfWidthMeters, halfDepthMeters],
  ].map(([eastMeters, northMeters]) => (
    geographicCoordinate(footprint, eastMeters, northMeters)
  ))
  const longitudes = coordinates.map(coordinate => coordinate[0])
  const latitudes = coordinates.map(coordinate => coordinate[1])
  const longitudeSpan = deriveRegionalPoiLongitudeSpan(longitudes)
  return Object.freeze([
    Object.freeze([
      longitudeSpan.west,
      Math.min(...latitudes),
    ] as const),
    Object.freeze([
      longitudeSpan.east,
      Math.max(...latitudes),
    ] as const),
  ] as const)
}

function parcelPolygonRing(
  parcel: CityGeoParcelState,
  rows: number,
  columns: number,
  profile: CityGeographicProfile,
): [number, number][] {
  const columnStride = profile.parcelWidthMeters + profile.columnGapMeters
  const rowStride = profile.parcelDepthMeters + profile.rowGapMeters
  const parcelCenterEast = (
    parcel.column - (columns - 1) / 2
  ) * columnStride
  const parcelCenterNorth = (
    (rows - 1) / 2 - parcel.row
  ) * rowStride
  const halfWidth = profile.parcelWidthMeters / 2
  const halfDepth = profile.parcelDepthMeters / 2
  const localCorners = [
    [-halfWidth, -halfDepth],
    [halfWidth, -halfDepth],
    [halfWidth, halfDepth],
    [-halfWidth, halfDepth],
  ] as const
  const ring = localCorners.map(([eastOffset, northOffset]) => (
    geographicCoordinate(
      profile,
      parcelCenterEast + eastOffset,
      parcelCenterNorth + northOffset,
    )
  ))
  ring.push([...ring[0]])
  return ring
}

function parcelFeature(
  parcel: CityGeoParcelState,
  snapshot: CityGeoOverlaySnapshot & Readonly<{
    profile: CityGeographicProfile
  }>,
): Feature<Polygon, CityGeoParcelProperties> {
  const style = snapshot.profile.zoneStyles[parcel.zone]
  return {
    type: 'Feature',
    id: `${snapshot.profile.id}:${parcel.id}`,
    geometry: {
      type: 'Polygon',
      coordinates: [[...parcelPolygonRing(
        parcel,
        snapshot.rows,
        snapshot.columns,
        snapshot.profile,
      )]],
    },
    properties: {
      column: parcel.column,
      kgCityBaseHeightMeters: style.baseHeightMeters,
      kgCityFillColor: style.fillColor,
      kgCityHeightMeters: parcelHeightMeters(parcel, style),
      kgCityOutlineColor: style.outlineColor,
      kgCityOverlayKind: 'parcel',
      kgCityProfileId: snapshot.profile.id,
      kgCityProfileRevision: snapshot.profile.revision,
      kgCitySelected: snapshot.selectedParcelId === parcel.id,
      kgCitySelectedOutlineColor: snapshot.profile.selectedOutlineColor,
      landValueCents: parcel.landValueCents,
      parcelId: parcel.id,
      pollution: parcel.pollution,
      population: parcel.population,
      row: parcel.row,
      zone: parcel.zone,
    },
  }
}

export function cityGeoOverlayFeatureCollection(
  input: CityGeoOverlaySnapshot,
): CityGeoParcelFeatureCollection {
  const snapshot = createCityGeoOverlaySnapshot(input)
  if (!snapshot.active || !snapshot.profile) {
    return { type: 'FeatureCollection', features: [] }
  }
  const parcels = [...snapshot.parcels].sort((left, right) => (
    left.row - right.row
    || left.column - right.column
    || left.id.localeCompare(right.id)
  ))
  return {
    type: 'FeatureCollection',
    features: parcels.map(parcel => parcelFeature(
      parcel,
      snapshot as CityGeoOverlaySnapshot & Readonly<{
        profile: CityGeographicProfile
      }>,
    )),
  }
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function hasExactValue(expected: unknown, actual: unknown): boolean {
  if (Object.is(expected, actual)) return true
  if (Array.isArray(expected)) {
    return Array.isArray(actual)
      && expected.length === actual.length
      && expected.every((value, index) => hasExactValue(value, actual[index]))
  }
  if (!isPlainRecord(expected) || !isPlainRecord(actual)) return false
  const expectedKeys = Object.keys(expected)
  const actualKeys = Object.keys(actual)
  return expectedKeys.length === actualKeys.length
    && expectedKeys.every(key => (
      Object.prototype.hasOwnProperty.call(actual, key)
      && hasExactValue(expected[key], actual[key])
    ))
}

export function hasExactCityGeoOverlayFeatureCollection(
  expected: CityGeoParcelFeatureCollection,
  actual: unknown,
): boolean {
  return hasExactValue(expected, actual)
}

export function cityGeoOverlayBounds(
  snapshot: CityGeoOverlaySnapshot,
): CityGeoBounds | null {
  const validated = createCityGeoOverlaySnapshot(snapshot)
  if (!validated.active || !validated.profile) return null
  return cityGeoGridProjectedBounds({
    bearingDegrees: validated.profile.bearingDegrees,
    center: validated.profile.center,
    columnGapMeters: validated.profile.columnGapMeters,
    columns: validated.columns,
    parcelDepthMeters: validated.profile.parcelDepthMeters,
    parcelWidthMeters: validated.profile.parcelWidthMeters,
    rowGapMeters: validated.profile.rowGapMeters,
    rows: validated.rows,
  })
}

export function cityGeoPresentationBounds(
  snapshot: CityGeoOverlaySnapshot,
): CityGeoBounds | null {
  const validated = createCityGeoOverlaySnapshot(snapshot)
  if (!validated.active || !validated.profile) return null
  const parcelBounds = cityGeoOverlayBounds(validated)
  const poiBounds = regionalPoiProfileBounds(
    validated.profile.regionalPoiProfile,
  )
  if (!parcelBounds) return poiBounds
  const longitudeSpan = deriveRegionalPoiLongitudeSpan([
    parcelBounds[0][0],
    parcelBounds[1][0],
    ...validated.profile.regionalPoiProfile.surfaces.flatMap(surface => (
      surface.geometry.coordinates.flatMap(ring => (
        ring.map(([longitude]) => longitude)
      ))
    )),
  ])
  return Object.freeze([
    Object.freeze([
      longitudeSpan.west,
      Math.min(parcelBounds[0][1], poiBounds[0][1]),
    ] as const),
    Object.freeze([
      longitudeSpan.east,
      Math.max(parcelBounds[1][1], poiBounds[1][1]),
    ] as const),
  ] as const)
}

export function cityGeoOverlayFramingKey(
  snapshot: CityGeoOverlaySnapshot,
  viewMode: CityGeoViewMode,
): string | null {
  if (!snapshot.active || !snapshot.profile) return null
  const bounds = cityGeoPresentationBounds(snapshot)
  if (!bounds) return null
  const framing = snapshot.profile.framing[viewMode]
  return [
    snapshot.profile.id,
    snapshot.profile.revision,
    viewMode,
    snapshot.rows,
    snapshot.columns,
    ...bounds[0],
    ...bounds[1],
    framing.bearingDegrees,
    framing.pitchDegrees,
    framing.maxZoom,
    framing.paddingPixels,
  ].join(':')
}
