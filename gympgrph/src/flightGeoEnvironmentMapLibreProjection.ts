import type { Feature, FeatureCollection, Polygon } from 'geojson'
import type { RegionalPoiSourceReference } from 'grph-shared/geospatial/regionalPoiGeo'
import type {
  FlightGeoEnvironmentProjection,
  FlightGeoEnvironmentSurface,
  FlightGeoOverlaySnapshot,
} from './flightGeoOverlay.js'

export type FlightGeoEnvironmentFeatureProperties = Readonly<{
  kgBaseHeightMeters: number
  kgColor: string
  kgEnvironmentId: string
  kgEnvironmentRevision: string
  kgHeightMeters: number
  kgPoiId: string
  kgRegionalPoiAccuracyFootprint: string
  kgRegionalPoiAccuracyHeight: string
  kgRegionalPoiAccuracyStatement: string
  kgRegionalPoiCategory: string
  kgRegionalPoiContextProvenance: string
  kgRegionalPoiGeometryAuthority: string
  kgRegionalPoiGeometrySnapshotAt: string
  kgRegionalPoiGeometrySourceId: string
  kgRegionalPoiGeometrySourceUrl: string
  kgRegionalPoiGeometrySourceVersion: string
  kgRegionalPoiHeightAuthority: string
  kgRegionalPoiHeightSnapshotAt: string
  kgRegionalPoiHeightSourceId: string
  kgRegionalPoiHeightSourceUrl: string
  kgRegionalPoiHeightSourceVersion: string
  kgRenderBaseHeightMeters: number
  kgRenderHeightMeters: number
  kgSurfaceId: string
  kgSurfaceKind: string
  kgSurfaceLabel: string
}>

export type FlightGeoEnvironmentFeatureCollection = FeatureCollection<
  Polygon,
  FlightGeoEnvironmentFeatureProperties
>

const GLOBE_GROUND_CLEARANCE_METERS = 0.15
const ENVIRONMENT_PROPERTY_KEYS = Object.freeze([
  'kgBaseHeightMeters',
  'kgColor',
  'kgEnvironmentId',
  'kgEnvironmentRevision',
  'kgHeightMeters',
  'kgPoiId',
  'kgRegionalPoiAccuracyFootprint',
  'kgRegionalPoiAccuracyHeight',
  'kgRegionalPoiAccuracyStatement',
  'kgRegionalPoiCategory',
  'kgRegionalPoiContextProvenance',
  'kgRegionalPoiGeometryAuthority',
  'kgRegionalPoiGeometrySnapshotAt',
  'kgRegionalPoiGeometrySourceId',
  'kgRegionalPoiGeometrySourceUrl',
  'kgRegionalPoiGeometrySourceVersion',
  'kgRegionalPoiHeightAuthority',
  'kgRegionalPoiHeightSnapshotAt',
  'kgRegionalPoiHeightSourceId',
  'kgRegionalPoiHeightSourceUrl',
  'kgRegionalPoiHeightSourceVersion',
  'kgRenderBaseHeightMeters',
  'kgRenderHeightMeters',
  'kgSurfaceId',
  'kgSurfaceKind',
  'kgSurfaceLabel',
] as const)

type RegionalPoiFeatureProperties = Pick<
  FlightGeoEnvironmentFeatureProperties,
  | 'kgRegionalPoiAccuracyFootprint'
  | 'kgRegionalPoiAccuracyHeight'
  | 'kgRegionalPoiAccuracyStatement'
  | 'kgRegionalPoiCategory'
  | 'kgRegionalPoiContextProvenance'
  | 'kgRegionalPoiGeometryAuthority'
  | 'kgRegionalPoiGeometrySnapshotAt'
  | 'kgRegionalPoiGeometrySourceId'
  | 'kgRegionalPoiGeometrySourceUrl'
  | 'kgRegionalPoiGeometrySourceVersion'
  | 'kgRegionalPoiHeightAuthority'
  | 'kgRegionalPoiHeightSnapshotAt'
  | 'kgRegionalPoiHeightSourceId'
  | 'kgRegionalPoiHeightSourceUrl'
  | 'kgRegionalPoiHeightSourceVersion'
>

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

function regionalPoiProperties(
  surface: FlightGeoEnvironmentSurface,
): RegionalPoiFeatureProperties {
  const facts = surface.regionalPoiSourceFacts
  if (!facts) {
    return {
      kgRegionalPoiAccuracyFootprint: '',
      kgRegionalPoiAccuracyHeight: '',
      kgRegionalPoiAccuracyStatement: '',
      kgRegionalPoiCategory: '',
      kgRegionalPoiContextProvenance: '',
      kgRegionalPoiGeometryAuthority: '',
      kgRegionalPoiGeometrySnapshotAt: '',
      kgRegionalPoiGeometrySourceId: '',
      kgRegionalPoiGeometrySourceUrl: '',
      kgRegionalPoiGeometrySourceVersion: '',
      kgRegionalPoiHeightAuthority: '',
      kgRegionalPoiHeightSnapshotAt: '',
      kgRegionalPoiHeightSourceId: '',
      kgRegionalPoiHeightSourceUrl: '',
      kgRegionalPoiHeightSourceVersion: '',
    }
  }
  const geometrySource = facts.provenance.geometry
  const heightSource = facts.provenance.height
  return {
    kgRegionalPoiAccuracyFootprint: facts.accuracy.footprint,
    kgRegionalPoiAccuracyHeight: facts.accuracy.height,
    kgRegionalPoiAccuracyStatement: facts.accuracy.statement,
    kgRegionalPoiCategory: facts.category,
    kgRegionalPoiContextProvenance: JSON.stringify(
      facts.provenance.context.map(canonicalSourceReference),
    ),
    kgRegionalPoiGeometryAuthority: geometrySource.authority,
    kgRegionalPoiGeometrySnapshotAt: geometrySource.snapshotAt,
    kgRegionalPoiGeometrySourceId: geometrySource.sourceId,
    kgRegionalPoiGeometrySourceUrl: geometrySource.sourceUrl,
    kgRegionalPoiGeometrySourceVersion: geometrySource.sourceVersion,
    kgRegionalPoiHeightAuthority: heightSource.authority,
    kgRegionalPoiHeightSnapshotAt: heightSource.snapshotAt,
    kgRegionalPoiHeightSourceId: heightSource.sourceId,
    kgRegionalPoiHeightSourceUrl: heightSource.sourceUrl,
    kgRegionalPoiHeightSourceVersion: heightSource.sourceVersion,
  }
}

function resolveRenderHeightRange(
  baseHeightMeters: number,
  heightMeters: number,
): readonly [number, number] {
  if (baseHeightMeters > 0) return [baseHeightMeters, heightMeters]
  // Globe depth testing clips extrusions that start exactly on its surface.
  return [
    GLOBE_GROUND_CLEARANCE_METERS,
    heightMeters + GLOBE_GROUND_CLEARANCE_METERS,
  ]
}

function environmentFeatureCollection(
  environment: FlightGeoEnvironmentProjection,
): FlightGeoEnvironmentFeatureCollection {
  const features = environment.surfaces.map(surface => {
    const [renderBaseHeightMeters, renderHeightMeters] =
      resolveRenderHeightRange(
        surface.baseHeightMeters,
        surface.heightMeters,
      )
    return {
      type: 'Feature',
      id: `${environment.id}:${surface.id}`,
      geometry: {
        type: 'Polygon',
        coordinates: surface.rings.map(ring => (
          ring.map(coordinate => [...coordinate])
        )),
      },
      properties: {
        kgBaseHeightMeters: surface.baseHeightMeters,
        kgColor: surface.color,
        kgEnvironmentId: environment.id,
        kgEnvironmentRevision: environment.revision,
        kgHeightMeters: surface.heightMeters,
        kgPoiId: surface.poiId || '',
        ...regionalPoiProperties(surface),
        kgRenderBaseHeightMeters: renderBaseHeightMeters,
        kgRenderHeightMeters: renderHeightMeters,
        kgSurfaceId: surface.id,
        kgSurfaceKind: surface.kind,
        kgSurfaceLabel: surface.label,
      },
    } satisfies Feature<Polygon, FlightGeoEnvironmentFeatureProperties>
  })
  return { type: 'FeatureCollection', features }
}

/**
 * Flight phase and ready-frame tokens are not painted environment state.
 * Keeping this projection public lets the readiness gate prove that its
 * stopped painter frame and first Ready frame have the same authored metres.
 */
export function flightGeoEnvironmentMapLibreFeatureCollection(
  overlay: FlightGeoOverlaySnapshot,
): FlightGeoEnvironmentFeatureCollection {
  return overlay.environment
    ? environmentFeatureCollection(overlay.environment)
    : { type: 'FeatureCollection', features: [] }
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function hasExactEnvironmentRing(
  expected: readonly (readonly number[])[],
  actual: unknown,
): boolean {
  return Array.isArray(actual)
    && actual.length === expected.length
    && expected.every((coordinate, index) => {
      const actualCoordinate = actual[index]
      return Array.isArray(actualCoordinate)
        && actualCoordinate.length === coordinate.length
        && coordinate.every((value, coordinateIndex) => (
          typeof actualCoordinate[coordinateIndex] === 'number'
          && Number.isFinite(actualCoordinate[coordinateIndex])
          && Object.is(value, actualCoordinate[coordinateIndex])
        ))
    })
}

function hasExactEnvironmentFeature(
  expected: Feature<Polygon, FlightGeoEnvironmentFeatureProperties>,
  actual: unknown,
): boolean {
  if (!isPlainRecord(actual)) return false
  if (actual.id !== expected.id || actual.type !== expected.type) return false
  const geometry = actual.geometry
  if (!isPlainRecord(geometry) || geometry.type !== 'Polygon') return false
  const coordinates = geometry.coordinates
  if (
    !Array.isArray(coordinates)
    || coordinates.length !== expected.geometry.coordinates.length
    || !coordinates.every((ring, index) => (
      hasExactEnvironmentRing(expected.geometry.coordinates[index], ring)
    ))
  ) return false
  const properties = actual.properties
  return isPlainRecord(properties)
    && Object.keys(properties).length === ENVIRONMENT_PROPERTY_KEYS.length
    && ENVIRONMENT_PROPERTY_KEYS.every(key => (
      Object.is(properties[key], expected.properties[key])
    ))
}

export function hasExactFlightGeoEnvironmentFeatureCollection(
  expected: FlightGeoEnvironmentFeatureCollection,
  actual: unknown,
): boolean {
  if (!isPlainRecord(actual) || actual.type !== expected.type) return false
  const features = actual.features
  return Array.isArray(features)
    && features.length === expected.features.length
    && expected.features.every((feature, index) => (
      hasExactEnvironmentFeature(feature, features[index])
    ))
}
