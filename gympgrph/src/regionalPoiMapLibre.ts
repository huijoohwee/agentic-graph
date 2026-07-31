import type { Feature, FeatureCollection, Polygon } from 'geojson'
import {
  createRegionalPoiProfile,
  type RegionalPoiProfile,
  type RegionalPoiSourceReference,
} from 'grph-shared/geospatial/regionalPoiGeo'
import {
  hasExactGeoJsonStyleSource,
  isMapLibreStyleReady,
  readGeoJsonSourceData,
  readMapLibreStyleSource,
} from './maplibreLayers.js'
export const REGIONAL_POI_SOURCE_ID = 'kg-geo-xr:regional-poi'
export const REGIONAL_POI_LAYER_IDS = Object.freeze({
  fill: `${REGIONAL_POI_SOURCE_ID}:fill`,
  extrusion: `${REGIONAL_POI_SOURCE_ID}:extrusion`,
  outline: `${REGIONAL_POI_SOURCE_ID}:outline`,
  label: `${REGIONAL_POI_SOURCE_ID}:label`,
})
const REGIONAL_POI_LAYER_DEFINITIONS = Object.freeze([
  Object.freeze({
    id: REGIONAL_POI_LAYER_IDS.fill,
    type: 'fill',
    source: REGIONAL_POI_SOURCE_ID,
    paint: Object.freeze({
      'fill-color': '#0ea5e9',
      'fill-opacity': 0.42,
    }),
  }),
  Object.freeze({
    id: REGIONAL_POI_LAYER_IDS.extrusion,
    type: 'fill-extrusion',
    source: REGIONAL_POI_SOURCE_ID,
    paint: Object.freeze({
      'fill-extrusion-base': ['get', 'kgRegionalPoiBaseHeightMeters'],
      'fill-extrusion-color': '#0ea5e9',
      'fill-extrusion-height': ['get', 'kgRegionalPoiHeightMeters'],
      'fill-extrusion-opacity': 0.82,
      'fill-extrusion-vertical-gradient': true,
    }),
  }),
  Object.freeze({
    id: REGIONAL_POI_LAYER_IDS.outline,
    type: 'line',
    source: REGIONAL_POI_SOURCE_ID,
    layout: Object.freeze({
      'line-cap': 'round',
      'line-join': 'round',
    }),
    paint: Object.freeze({
      'line-color': '#0369a1',
      'line-opacity': 0.94,
      'line-width': 1.5,
    }),
  }),
  Object.freeze({
    id: REGIONAL_POI_LAYER_IDS.label,
    type: 'symbol',
    source: REGIONAL_POI_SOURCE_ID,
    filter: Object.freeze([
      '!=',
      ['get', 'kgRegionalPoiLabel'],
      '',
    ]),
    layout: Object.freeze({
      'symbol-placement': 'point',
      'text-anchor': 'bottom',
      'text-field': ['get', 'kgRegionalPoiLabel'],
      'text-offset': [0, -0.5],
      'text-size': 12,
    }),
    paint: Object.freeze({
      'text-color': '#082f49',
      'text-halo-color': '#f8fafc',
      'text-halo-width': 1.25,
    }),
  }),
] as const)

export const REGIONAL_POI_LAYER_ORDER = Object.freeze(
  REGIONAL_POI_LAYER_DEFINITIONS.map(layer => layer.id),
)
export type RegionalPoiViewMode = '2d' | '3d'
export type RegionalPoiMapLibreOptions = Readonly<{
  beforeLayerId?: string | null
  viewMode: RegionalPoiViewMode
}>
export type RegionalPoiFeatureProperties = Readonly<{
  kgRegionalPoiAccuracyFootprint: string
  kgRegionalPoiAccuracyHeight: string
  kgRegionalPoiAccuracyStatement: string
  kgRegionalPoiAttribution: string
  kgRegionalPoiBaseHeightMeters: number
  kgRegionalPoiCategory: string
  kgRegionalPoiContextProvenance: string
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
  kgRegionalPoiId: string
  kgRegionalPoiLabel: string
  kgRegionalPoiProfileId: string
  kgRegionalPoiProfileRevision: string
  kgRegionalPoiRegionCode: string
  kgRegionalPoiRegionLabel: string
  kgRegionalPoiRuntimeNetworkPolicy: 'forbidden'
  kgRegionalPoiStoragePolicy: 'checked-in'
  kgRegionalPoiSurfaceId: string
  kgRegionalPoiSurfaceLabel: string
}>
export type RegionalPoiFeatureCollection = FeatureCollection<
  Polygon,
  RegionalPoiFeatureProperties
>
export type RegionalPoiBounds = readonly [
  southwest: readonly [longitude: number, latitude: number],
  northeast: readonly [longitude: number, latitude: number],
]
const FEATURE_PROPERTY_KEYS = Object.freeze([
  'kgRegionalPoiAccuracyFootprint',
  'kgRegionalPoiAccuracyHeight',
  'kgRegionalPoiAccuracyStatement',
  'kgRegionalPoiAttribution',
  'kgRegionalPoiBaseHeightMeters',
  'kgRegionalPoiCategory',
  'kgRegionalPoiContextProvenance',
  'kgRegionalPoiGeometryAuthority',
  'kgRegionalPoiGeometrySnapshotAt',
  'kgRegionalPoiGeometrySourceId',
  'kgRegionalPoiGeometrySourceUrl',
  'kgRegionalPoiGeometrySourceVersion',
  'kgRegionalPoiHeightAuthority',
  'kgRegionalPoiHeightMeters',
  'kgRegionalPoiHeightSnapshotAt',
  'kgRegionalPoiHeightSourceId',
  'kgRegionalPoiHeightSourceUrl',
  'kgRegionalPoiHeightSourceVersion',
  'kgRegionalPoiId',
  'kgRegionalPoiLabel',
  'kgRegionalPoiProfileId',
  'kgRegionalPoiProfileRevision',
  'kgRegionalPoiRegionCode',
  'kgRegionalPoiRegionLabel',
  'kgRegionalPoiRuntimeNetworkPolicy',
  'kgRegionalPoiStoragePolicy',
  'kgRegionalPoiSurfaceId',
  'kgRegionalPoiSurfaceLabel',
] as const)
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
function buildRegionalPoiFeatureCollection(
  profile: RegionalPoiProfile,
): RegionalPoiFeatureCollection {
  const labelledPoiIds = new Set<string>()
  const poiLabels = new Map(profile.pois.map(poi => [poi.id, poi.label]))
  const attribution = canonicalAttribution(profile)
  const features = profile.surfaces.map(surface => {
    const showPoiLabel = !labelledPoiIds.has(surface.poiId)
    labelledPoiIds.add(surface.poiId)
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
        kgRegionalPoiAccuracyFootprint: surface.accuracy.footprint,
        kgRegionalPoiAccuracyHeight: surface.accuracy.height,
        kgRegionalPoiAccuracyStatement: surface.accuracy.statement,
        kgRegionalPoiAttribution: attribution,
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
        kgRegionalPoiId: surface.poiId,
        kgRegionalPoiLabel: showPoiLabel
          ? poiLabels.get(surface.poiId) || surface.label
          : '',
        kgRegionalPoiProfileId: profile.id,
        kgRegionalPoiProfileRevision: profile.revision,
        kgRegionalPoiRegionCode: profile.region.code,
        kgRegionalPoiRegionLabel: profile.region.label,
        kgRegionalPoiRuntimeNetworkPolicy: profile.dataPolicy.runtimeNetwork,
        kgRegionalPoiStoragePolicy: profile.dataPolicy.storage,
        kgRegionalPoiSurfaceId: surface.id,
        kgRegionalPoiSurfaceLabel: surface.label,
      },
    } satisfies Feature<Polygon, RegionalPoiFeatureProperties>
  })
  return { type: 'FeatureCollection', features }
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
  let west = Number.POSITIVE_INFINITY
  let south = Number.POSITIVE_INFINITY
  let east = Number.NEGATIVE_INFINITY
  let north = Number.NEGATIVE_INFINITY
  for (const surface of profile.surfaces) {
    for (const ring of surface.geometry.coordinates) {
      for (const [longitude, latitude] of ring) {
        west = Math.min(west, longitude)
        south = Math.min(south, latitude)
        east = Math.max(east, longitude)
        north = Math.max(north, latitude)
      }
    }
  }
  return Object.freeze([
    Object.freeze([west, south] as const),
    Object.freeze([east, north] as const),
  ] as const)
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
function hasExactSourceShape(value: unknown): boolean {
  return isPlainRecord(value)
    && Object.keys(value).length === 2
    && value.type === 'geojson'
    && Object.prototype.hasOwnProperty.call(value, 'data')
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
  expected: Feature<Polygon, RegionalPoiFeatureProperties>,
  actual: unknown,
): boolean {
  if (!isPlainRecord(actual) || Object.keys(actual).length !== 4) return false
  if (
    actual.type !== expected.type
    || actual.id !== expected.id
    || !hasExactValue(expected.geometry, actual.geometry)
  ) return false
  const properties = actual.properties
  return isPlainRecord(properties)
    && Object.keys(properties).length === FEATURE_PROPERTY_KEYS.length
    && FEATURE_PROPERTY_KEYS.every(key => (
      Object.is(expected.properties[key], properties[key])
    ))
}

function hasExactFeatureCollection(
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
    hasExactFeature(feature, features[index])
  ))
}

function withoutVisibility(value: unknown): unknown {
  if (!isPlainRecord(value)) return value
  const entries = Object.entries(value)
    .filter(([property]) => property !== 'visibility')
  return entries.length > 0 ? Object.fromEntries(entries) : undefined
}

function readStyleLayer(map: any, layerId: string): unknown {
  const layers = map?.getStyle?.()?.layers
  if (Array.isArray(layers)) {
    return layers.find(layer => isPlainRecord(layer) && layer.id === layerId)
  }
  return map?.getLayer?.(layerId)
}

function hasExactLayerDefinition(
  actual: unknown,
  expected: typeof REGIONAL_POI_LAYER_DEFINITIONS[number],
): boolean {
  if (!isPlainRecord(actual)) return false
  const definition = expected as Readonly<Record<string, unknown>>
  return actual.id === definition.id
    && actual.type === definition.type
    && actual.source === definition.source
    && actual['source-layer'] === undefined
    && actual.minzoom === undefined
    && actual.maxzoom === undefined
    && hasExactValue(definition.filter, actual.filter)
    && hasExactValue(
      withoutVisibility(definition.layout),
      withoutVisibility(actual.layout),
    )
    && hasExactValue(definition.paint, actual.paint)
}

function resolvedBeforeLayerId(
  map: any,
  beforeLayerId: string | null | undefined,
): string | null {
  return beforeLayerId && map?.getLayer?.(beforeLayerId)
    ? beforeLayerId
    : null
}

function hasExactLayerOrder(
  map: any,
  beforeLayerId: string | null | undefined,
): boolean {
  const styleLayers = map?.getStyle?.()?.layers
  if (!Array.isArray(styleLayers)) return false
  const layerIds = styleLayers.map(layer => String(layer?.id || ''))
  const indexes = REGIONAL_POI_LAYER_ORDER.map(layerId => (
    layerIds.indexOf(layerId)
  ))
  if (indexes.some(index => index < 0)) return false
  if (!indexes.every((index, position) => (
    position === 0 || index === indexes[position - 1] + 1
  ))) return false
  const anchor = resolvedBeforeLayerId(map, beforeLayerId)
  const expectedNextIndex = anchor ? layerIds.indexOf(anchor) : layerIds.length
  return indexes[indexes.length - 1] + 1 === expectedNextIndex
}

function expectedVisibility(
  layerId: string,
  viewMode: RegionalPoiViewMode,
): 'none' | 'visible' {
  if (layerId === REGIONAL_POI_LAYER_IDS.fill) {
    return viewMode === '2d' ? 'visible' : 'none'
  }
  if (layerId === REGIONAL_POI_LAYER_IDS.extrusion) {
    return viewMode === '3d' ? 'visible' : 'none'
  }
  return 'visible'
}

function readVisibility(map: any, layerId: string): 'none' | 'visible' {
  try {
    if (map?.getLayoutProperty?.(layerId, 'visibility') === 'none') {
      return 'none'
    }
  } catch { void 0 }
  const layer = readStyleLayer(map, layerId)
  return isPlainRecord(layer)
    && isPlainRecord(layer.layout)
    && layer.layout.visibility === 'none'
    ? 'none'
    : 'visible'
}

function removeOwnedLayers(map: any): boolean {
  if (typeof map?.removeLayer !== 'function') return false
  for (const layerId of [...REGIONAL_POI_LAYER_ORDER].reverse()) {
    if (map.getLayer?.(layerId)) map.removeLayer(layerId)
    if (map.getLayer?.(layerId)) return false
  }
  return true
}

function removeOwnedSource(map: any): boolean {
  if (!map?.getSource?.(REGIONAL_POI_SOURCE_ID)) return true
  if (typeof map.removeSource !== 'function') return false
  map.removeSource(REGIONAL_POI_SOURCE_ID)
  return !map.getSource?.(REGIONAL_POI_SOURCE_ID)
}

function replaceOwnedSource(
  map: any,
  expected: RegionalPoiFeatureCollection,
): boolean {
  if (!removeOwnedLayers(map) || !removeOwnedSource(map)) return false
  if (typeof map.addSource !== 'function') return false
  map.addSource(REGIONAL_POI_SOURCE_ID, {
    type: 'geojson',
    data: expected,
  })
  return Boolean(map.getSource?.(REGIONAL_POI_SOURCE_ID))
}

function ensureSource(
  map: any,
  expected: RegionalPoiFeatureCollection,
): boolean {
  const liveSource = map.getSource?.(REGIONAL_POI_SOURCE_ID)
  const styleSource = readMapLibreStyleSource(map, REGIONAL_POI_SOURCE_ID)
  if (
    liveSource
    && styleSource !== undefined
    && !hasExactSourceShape(styleSource)
  ) return replaceOwnedSource(map, expected)
  if (!liveSource) return replaceOwnedSource(map, expected)
  if (hasExactFeatureCollection(expected, readGeoJsonSourceData(liveSource))) {
    return true
  }
  if (typeof liveSource.setData !== 'function') {
    return replaceOwnedSource(map, expected)
  }
  liveSource.setData(expected)
  return hasExactFeatureCollection(
    expected,
    readGeoJsonSourceData(map.getSource?.(REGIONAL_POI_SOURCE_ID)),
  )
}

function ensureLayer(
  map: any,
  expected: typeof REGIONAL_POI_LAYER_DEFINITIONS[number],
  beforeLayerId: string | null,
): boolean {
  if (map.getLayer?.(expected.id)) {
    if (hasExactLayerDefinition(readStyleLayer(map, expected.id), expected)) {
      return true
    }
    if (typeof map.removeLayer !== 'function') return false
    map.removeLayer(expected.id)
    if (map.getLayer?.(expected.id)) return false
  }
  if (typeof map.addLayer !== 'function') return false
  map.addLayer(expected, beforeLayerId || undefined)
  return hasExactLayerDefinition(readStyleLayer(map, expected.id), expected)
}

function positionLayers(map: any, beforeLayerId: string | null): boolean {
  if (hasExactLayerOrder(map, beforeLayerId)) return true
  if (typeof map?.moveLayer !== 'function') return false
  for (const layerId of REGIONAL_POI_LAYER_ORDER) {
    if (map.getLayer?.(layerId)) {
      map.moveLayer(layerId, beforeLayerId || undefined)
    }
  }
  return hasExactLayerOrder(map, beforeLayerId)
}

function setLayerVisibility(
  map: any,
  viewMode: RegionalPoiViewMode,
): boolean {
  if (typeof map.setLayoutProperty !== 'function') return false
  for (const layerId of REGIONAL_POI_LAYER_ORDER) {
    const visibility = expectedVisibility(layerId, viewMode)
    if (readVisibility(map, layerId) !== visibility) {
      map.setLayoutProperty(layerId, 'visibility', visibility)
    }
    if (readVisibility(map, layerId) !== visibility) return false
  }
  return true
}

function sourceIsLoaded(source: unknown): boolean {
  if (!source || typeof source !== 'object') return false
  try {
    const loaded = (source as { loaded?: () => unknown }).loaded
    return typeof loaded !== 'function' || loaded.call(source) === true
  } catch {
    return false
  }
}

export function mapHasExactRegionalPoiSource(
  map: any,
  input: RegionalPoiProfile,
): boolean {
  try {
    const expected = regionalPoiFeatureCollection(input)
    const liveSource = map?.getSource?.(REGIONAL_POI_SOURCE_ID)
    if (!liveSource || !sourceIsLoaded(liveSource)) return false
    return hasExactGeoJsonStyleSource(
      readMapLibreStyleSource(map, REGIONAL_POI_SOURCE_ID),
      expected,
      hasExactFeatureCollection,
    ) && hasExactFeatureCollection(
      expected,
      readGeoJsonSourceData(liveSource),
    )
  } catch {
    return false
  }
}

export function mapHasExactRegionalPoiProfile(
  map: any,
  input: RegionalPoiProfile,
  options: RegionalPoiMapLibreOptions,
): boolean {
  if (options.viewMode !== '2d' && options.viewMode !== '3d') return false
  try {
    return mapHasExactRegionalPoiSource(map, input)
      && REGIONAL_POI_LAYER_DEFINITIONS.every(layer => (
        hasExactLayerDefinition(readStyleLayer(map, layer.id), layer)
        && readVisibility(map, layer.id)
          === expectedVisibility(layer.id, options.viewMode)
      ))
      && hasExactLayerOrder(map, options.beforeLayerId)
  } catch {
    return false
  }
}

export function applyRegionalPoiProfileToMap(
  map: any,
  input: RegionalPoiProfile,
  options: RegionalPoiMapLibreOptions,
): boolean {
  if (!map || !isMapLibreStyleReady(map)) return false
  if (options.viewMode !== '2d' && options.viewMode !== '3d') return false
  try {
    const profile = createRegionalPoiProfile(input)
    const expected = buildRegionalPoiFeatureCollection(profile)
    if (!ensureSource(map, expected)) return false
    const beforeLayerId = resolvedBeforeLayerId(map, options.beforeLayerId)
    for (const layer of REGIONAL_POI_LAYER_DEFINITIONS) {
      if (!ensureLayer(map, layer, beforeLayerId)) return false
    }
    return positionLayers(map, beforeLayerId)
      && setLayerVisibility(map, options.viewMode)
  } catch (error) {
    console.error('[kg-geo-xr] MapLibre regional POI apply failed.', error)
    return false
  }
}

export function clearRegionalPoiProfileFromMap(map: any): boolean {
  if (!map || !isMapLibreStyleReady(map)) return false
  try {
    return removeOwnedLayers(map) && removeOwnedSource(map)
  } catch (error) {
    console.error('[kg-geo-xr] MapLibre regional POI clear failed.', error)
    return false
  }
}
