import type {
  Feature,
  FeatureCollection,
  Point,
  Polygon,
} from 'geojson'
import {
  createRegionalPoiProfile,
  deriveRegionalPoiLongitudeSpan,
  deriveRegionalPoiLocators,
  type RegionalPoiProfile,
  type RegionalPoiSourceReference,
} from 'grph-shared/geospatial/regionalPoiGeo'

export type RegionalPoiCommonFeatureProperties = Readonly<{
  kgRegionalPoiAttribution: string
  kgRegionalPoiId: string
  kgRegionalPoiLabel: string
  kgRegionalPoiProfileId: string
  kgRegionalPoiProfileRevision: string
  kgRegionalPoiRegionCode: string
  kgRegionalPoiRegionLabel: string
  kgRegionalPoiRuntimeNetworkPolicy: 'forbidden'
  kgRegionalPoiStoragePolicy: 'checked-in'
}>

export type RegionalPoiSurfaceFeatureProperties =
  RegionalPoiCommonFeatureProperties & Readonly<{
    kgRegionalPoiAccuracyFootprint: string
    kgRegionalPoiAccuracyHeight: string
    kgRegionalPoiAccuracyStatement: string
    kgRegionalPoiBaseHeightMeters: number
    kgRegionalPoiCategory: string
    kgRegionalPoiContextProvenance: string
    kgRegionalPoiFeatureKind: 'surface'
    kgRegionalPoiGeometryAuthority: string
    kgRegionalPoiGeometrySnapshotAt: string
    kgRegionalPoiGeometrySourceId: string
    kgRegionalPoiGeometrySourceUrl: string
    kgRegionalPoiGeometrySourceVersion: string
    kgRegionalPoiHeightAuthority: string
    kgRegionalPoiHeightMeters: number
    kgRegionalPoiHeightSnapshotAt: string
    kgRegionalPoiHeightSourceId: string
    kgRegionalPoiHeightSourceUrl: string
    kgRegionalPoiHeightSourceVersion: string
    kgRegionalPoiSurfaceId: string
    kgRegionalPoiSurfaceLabel: string
  }>

export type RegionalPoiLocatorFeatureProperties =
  RegionalPoiCommonFeatureProperties & Readonly<{
    kgRegionalPoiFeatureKind: 'locator'
  }>

export type RegionalPoiFeatureProperties =
  | RegionalPoiLocatorFeatureProperties
  | RegionalPoiSurfaceFeatureProperties

export type RegionalPoiFeature =
  | Feature<Point, RegionalPoiLocatorFeatureProperties>
  | Feature<Polygon, RegionalPoiSurfaceFeatureProperties>

export type RegionalPoiFeatureCollection = FeatureCollection<
  Point | Polygon,
  RegionalPoiFeatureProperties
>

export type RegionalPoiBounds = readonly [
  southwest: readonly [longitude: number, latitude: number],
  northeast: readonly [longitude: number, latitude: number],
]

function canonicalSourceReference(
  source: RegionalPoiSourceReference,
): Readonly<Record<string, string>> {
  return {
    authority: source.authority,
    sourceId: source.sourceId,
    sourceUrl: source.sourceUrl,
    sourceVersion: source.sourceVersion,
    snapshotAt: source.snapshotAt,
  }
}

function canonicalContextProvenance(
  sources: readonly RegionalPoiSourceReference[],
): string {
  return JSON.stringify(sources.map(canonicalSourceReference))
}

function canonicalAttribution(profile: RegionalPoiProfile): string {
  return JSON.stringify(profile.attribution.map(attribution => ({
    text: attribution.text,
    url: attribution.url,
    licenseName: attribution.licenseName,
    licenseUrl: attribution.licenseUrl,
  })))
}

function commonProperties<FeatureKind extends 'locator' | 'surface'>(
  profile: RegionalPoiProfile,
  attribution: string,
  input: Readonly<{
    featureKind: FeatureKind
    label: string
    poiId: string
  }>,
): RegionalPoiCommonFeatureProperties & Readonly<{
  kgRegionalPoiFeatureKind: FeatureKind
}> {
  return {
    kgRegionalPoiAttribution: attribution,
    kgRegionalPoiFeatureKind: input.featureKind,
    kgRegionalPoiId: input.poiId,
    kgRegionalPoiLabel: input.label,
    kgRegionalPoiProfileId: profile.id,
    kgRegionalPoiProfileRevision: profile.revision,
    kgRegionalPoiRegionCode: profile.region.code,
    kgRegionalPoiRegionLabel: profile.region.label,
    kgRegionalPoiRuntimeNetworkPolicy: profile.dataPolicy.runtimeNetwork,
    kgRegionalPoiStoragePolicy: profile.dataPolicy.storage,
  }
}

function buildRegionalPoiFeatureCollection(
  profile: RegionalPoiProfile,
): RegionalPoiFeatureCollection {
  const attribution = canonicalAttribution(profile)
  const surfaceFeatures = profile.surfaces.map(surface => {
    const geometrySource = surface.provenance.geometry
    const heightSource = surface.provenance.height
    return {
      type: 'Feature',
      id: `${profile.id}:${surface.id}`,
      geometry: {
        type: 'Polygon',
        coordinates: surface.geometry.coordinates.map(ring => (
          ring.map(coordinate => [...coordinate])
        )),
      },
      properties: {
        ...commonProperties(profile, attribution, {
          featureKind: 'surface',
          label: '',
          poiId: surface.poiId,
        }),
        kgRegionalPoiFeatureKind: 'surface',
        kgRegionalPoiAccuracyFootprint: surface.accuracy.footprint,
        kgRegionalPoiAccuracyHeight: surface.accuracy.height,
        kgRegionalPoiAccuracyStatement: surface.accuracy.statement,
        kgRegionalPoiBaseHeightMeters: surface.baseHeightMeters,
        kgRegionalPoiCategory: surface.category,
        kgRegionalPoiContextProvenance: canonicalContextProvenance(
          surface.provenance.context,
        ),
        kgRegionalPoiGeometryAuthority: geometrySource.authority,
        kgRegionalPoiGeometrySnapshotAt: geometrySource.snapshotAt,
        kgRegionalPoiGeometrySourceId: geometrySource.sourceId,
        kgRegionalPoiGeometrySourceUrl: geometrySource.sourceUrl,
        kgRegionalPoiGeometrySourceVersion: geometrySource.sourceVersion,
        kgRegionalPoiHeightAuthority: heightSource.authority,
        kgRegionalPoiHeightMeters: surface.heightMeters,
        kgRegionalPoiHeightSnapshotAt: heightSource.snapshotAt,
        kgRegionalPoiHeightSourceId: heightSource.sourceId,
        kgRegionalPoiHeightSourceUrl: heightSource.sourceUrl,
        kgRegionalPoiHeightSourceVersion: heightSource.sourceVersion,
        kgRegionalPoiSurfaceId: surface.id,
        kgRegionalPoiSurfaceLabel: surface.label,
      },
    } satisfies Feature<Polygon, RegionalPoiSurfaceFeatureProperties>
  })
  const locatorFeatures = deriveRegionalPoiLocators(profile).map(locator => ({
    type: 'Feature',
    id: `${profile.id}:locator:${locator.poiId}`,
    geometry: {
      type: 'Point',
      coordinates: [...locator.coordinate],
    },
    properties: {
      ...commonProperties(profile, attribution, {
        featureKind: 'locator',
        label: locator.label,
        poiId: locator.poiId,
      }),
      kgRegionalPoiFeatureKind: 'locator',
    },
  } satisfies Feature<Point, RegionalPoiLocatorFeatureProperties>))
  return {
    type: 'FeatureCollection',
    features: [...surfaceFeatures, ...locatorFeatures],
  }
}

export function regionalPoiFeatureCollection(
  input: RegionalPoiProfile,
): RegionalPoiFeatureCollection {
  return buildRegionalPoiFeatureCollection(createRegionalPoiProfile(input))
}

export function regionalPoiProfileBounds(
  input: RegionalPoiProfile,
): RegionalPoiBounds {
  const profile = createRegionalPoiProfile(input)
  const longitudes: number[] = []
  let south = Number.POSITIVE_INFINITY
  let north = Number.NEGATIVE_INFINITY
  for (const surface of profile.surfaces) {
    for (const ring of surface.geometry.coordinates) {
      for (const [longitude, latitude] of ring) {
        longitudes.push(longitude)
        south = Math.min(south, latitude)
        north = Math.max(north, latitude)
      }
    }
  }
  const longitudeSpan = deriveRegionalPoiLongitudeSpan(longitudes)
  return Object.freeze([
    Object.freeze([longitudeSpan.west, south] as const),
    Object.freeze([longitudeSpan.east, north] as const),
  ] as const)
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

function hasExactFeature(
  expected: RegionalPoiFeature,
  actual: unknown,
): boolean {
  return isPlainRecord(actual)
    && Object.keys(actual).length === 4
    && actual.type === expected.type
    && actual.id === expected.id
    && hasExactValue(expected.geometry, actual.geometry)
    && hasExactValue(expected.properties, actual.properties)
}

export function hasExactRegionalPoiFeatureCollection(
  expected: RegionalPoiFeatureCollection,
  actual: unknown,
): boolean {
  if (!isPlainRecord(actual)) return false
  const features = actual.features
  if (
    Object.keys(actual).length !== 2
    || actual.type !== expected.type
    || !Array.isArray(features)
    || features.length !== expected.features.length
  ) return false
  return expected.features.every((feature, index) => (
    hasExactFeature(feature as RegionalPoiFeature, features[index])
  ))
}
