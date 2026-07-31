import {
  cityGeoOverlayFeatureCollection,
  hasExactCityGeoOverlayFeatureCollection,
  type CityGeoParcelFeatureCollection,
} from './cityGeoOverlayProjection.js'
import type {
  CityGeoOverlaySnapshot,
  CityGeoViewMode,
} from './cityGeoOverlay.js'
import {
  hasExactGeoJsonStyleSource,
  isMapLibreStyleReady,
  readGeoJsonSourceData,
  readMapLibreStyleSource,
} from './maplibreLayers.js'

export const CITY_GEO_OVERLAY_SOURCE_ID = 'kg-city-sim:geo-overlay'

export const CITY_GEO_OVERLAY_LAYER_IDS = Object.freeze({
  fill: `${CITY_GEO_OVERLAY_SOURCE_ID}:fill`,
  extrusion: `${CITY_GEO_OVERLAY_SOURCE_ID}:extrusion`,
  outline: `${CITY_GEO_OVERLAY_SOURCE_ID}:outline`,
  selectedParcel: `${CITY_GEO_OVERLAY_SOURCE_ID}:selected-parcel`,
})

const CITY_PARCEL_FILTER = Object.freeze([
  '==',
  ['get', 'kgCityOverlayKind'],
  'parcel',
])

export const CITY_GEO_FILL_LAYER = Object.freeze({
  id: CITY_GEO_OVERLAY_LAYER_IDS.fill,
  type: 'fill',
  source: CITY_GEO_OVERLAY_SOURCE_ID,
  filter: CITY_PARCEL_FILTER,
  paint: Object.freeze({
    'fill-color': ['get', 'kgCityFillColor'],
    'fill-opacity': 0.64,
  }),
})

export const CITY_GEO_EXTRUSION_LAYER = Object.freeze({
  id: CITY_GEO_OVERLAY_LAYER_IDS.extrusion,
  type: 'fill-extrusion',
  source: CITY_GEO_OVERLAY_SOURCE_ID,
  filter: CITY_PARCEL_FILTER,
  paint: Object.freeze({
    'fill-extrusion-base': ['get', 'kgCityBaseHeightMeters'],
    'fill-extrusion-color': ['get', 'kgCityFillColor'],
    'fill-extrusion-height': ['get', 'kgCityHeightMeters'],
    'fill-extrusion-opacity': 0.82,
    'fill-extrusion-vertical-gradient': true,
  }),
})

export const CITY_GEO_OUTLINE_LAYER = Object.freeze({
  id: CITY_GEO_OVERLAY_LAYER_IDS.outline,
  type: 'line',
  source: CITY_GEO_OVERLAY_SOURCE_ID,
  filter: CITY_PARCEL_FILTER,
  layout: Object.freeze({
    'line-cap': 'round',
    'line-join': 'round',
  }),
  paint: Object.freeze({
    'line-color': ['get', 'kgCityOutlineColor'],
    'line-opacity': 0.94,
    'line-width': 1.5,
  }),
})

export const CITY_GEO_SELECTED_PARCEL_LAYER = Object.freeze({
  id: CITY_GEO_OVERLAY_LAYER_IDS.selectedParcel,
  type: 'line',
  source: CITY_GEO_OVERLAY_SOURCE_ID,
  filter: Object.freeze([
    'all',
    CITY_PARCEL_FILTER,
    ['==', ['get', 'kgCitySelected'], true],
  ]),
  layout: Object.freeze({
    'line-cap': 'round',
    'line-join': 'round',
  }),
  paint: Object.freeze({
    'line-color': ['get', 'kgCitySelectedOutlineColor'],
    'line-opacity': 1,
    'line-width': 4,
  }),
})

export const CITY_GEO_OVERLAY_LAYER_DEFINITIONS = Object.freeze([
  CITY_GEO_FILL_LAYER,
  CITY_GEO_EXTRUSION_LAYER,
  CITY_GEO_OUTLINE_LAYER,
  CITY_GEO_SELECTED_PARCEL_LAYER,
] as const)

export const CITY_GEO_OVERLAY_LAYER_ORDER = Object.freeze(
  CITY_GEO_OVERLAY_LAYER_DEFINITIONS.map(layer => layer.id),
)

export type CityGeoOverlayMapLibreOptions = Readonly<{
  beforeLayerId?: string | null
  viewMode: CityGeoViewMode
}>

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function hasExactStyleValue(expected: unknown, actual: unknown): boolean {
  if (Object.is(expected, actual)) return true
  if (Array.isArray(expected)) {
    return Array.isArray(actual)
      && expected.length === actual.length
      && expected.every((value, index) => (
        hasExactStyleValue(value, actual[index])
      ))
  }
  if (!isPlainRecord(expected) || !isPlainRecord(actual)) return false
  const expectedKeys = Object.keys(expected)
  const actualKeys = Object.keys(actual)
  return expectedKeys.length === actualKeys.length
    && expectedKeys.every(key => (
      Object.prototype.hasOwnProperty.call(actual, key)
      && hasExactStyleValue(expected[key], actual[key])
    ))
}

function withoutVisibility(value: unknown): unknown {
  if (!isPlainRecord(value)) return value
  const entries = Object.entries(value)
    .filter(([property]) => property !== 'visibility')
  return entries.length > 0 ? Object.fromEntries(entries) : undefined
}

export function hasExactCityGeoOverlayStyleLayerDefinition(
  actual: unknown,
  expected: typeof CITY_GEO_OVERLAY_LAYER_DEFINITIONS[number],
): boolean {
  if (!isPlainRecord(actual)) return false
  const definition = expected as Readonly<Record<string, unknown>>
  return actual.id === definition.id
    && actual.type === definition.type
    && actual.source === definition.source
    && actual['source-layer'] === undefined
    && actual.minzoom === undefined
    && actual.maxzoom === undefined
    && hasExactStyleValue(definition.filter, actual.filter)
    && hasExactStyleValue(
      withoutVisibility(definition.layout),
      withoutVisibility(actual.layout),
    )
    && hasExactStyleValue(definition.paint, actual.paint)
}

export function hasExactCityGeoOverlayStyleLayerDefinitions(
  layers: readonly unknown[],
): boolean {
  return CITY_GEO_OVERLAY_LAYER_DEFINITIONS.every(expected => (
    hasExactCityGeoOverlayStyleLayerDefinition(
      layers.find(layer => isPlainRecord(layer) && layer.id === expected.id),
      expected,
    )
  ))
}

function readStyleLayer(map: any, layerId: string): unknown {
  const layers = map?.getStyle?.()?.layers
  if (Array.isArray(layers)) {
    return layers.find(layer => isPlainRecord(layer) && layer.id === layerId)
  }
  return map?.getLayer?.(layerId)
}

function hasExactCityLayerOrder(
  map: any,
  beforeLayerId: string | null,
): boolean {
  const styleLayers = map?.getStyle?.()?.layers
  if (!Array.isArray(styleLayers)) return false
  const layerIds = styleLayers.map(layer => String(layer?.id || ''))
  const cityIndexes = CITY_GEO_OVERLAY_LAYER_ORDER.map(layerId => (
    layerIds.indexOf(layerId)
  ))
  if (cityIndexes.some(index => index < 0)) return false
  if (!cityIndexes.every((index, position) => (
    position === 0 || index === cityIndexes[position - 1] + 1
  ))) return false
  const resolvedBeforeLayerId = beforeLayerId && map.getLayer?.(beforeLayerId)
    ? beforeLayerId
    : null
  const expectedNextIndex = resolvedBeforeLayerId
    ? layerIds.indexOf(resolvedBeforeLayerId)
    : layerIds.length
  return cityIndexes[cityIndexes.length - 1] + 1 === expectedNextIndex
}

function expectedVisibility(
  layerId: string,
  viewMode: CityGeoViewMode,
): 'none' | 'visible' {
  return layerId === CITY_GEO_OVERLAY_LAYER_IDS.extrusion
    && viewMode === '2d'
    ? 'none'
    : 'visible'
}

function readVisibility(map: any, layerId: string): 'none' | 'visible' {
  try {
    const value = map?.getLayoutProperty?.(layerId, 'visibility')
    if (value === 'none') return 'none'
  } catch {
    // Fall back to the serialized style because test and host adapters may omit
    // Map#getLayoutProperty while still exposing the canonical style object.
  }
  const layer = readStyleLayer(map, layerId)
  if (!isPlainRecord(layer) || !isPlainRecord(layer.layout)) return 'visible'
  return layer.layout.visibility === 'none' ? 'none' : 'visible'
}

function reportFailure(operation: string, error: unknown): false {
  console.error(`[kg-city] MapLibre City Geo ${operation} failed.`, error)
  return false
}

function removeOwnedLayers(map: any): boolean {
  if (typeof map?.removeLayer !== 'function') return false
  for (const layerId of [...CITY_GEO_OVERLAY_LAYER_ORDER].reverse()) {
    if (map.getLayer?.(layerId)) map.removeLayer(layerId)
    if (map.getLayer?.(layerId)) return false
  }
  return true
}

function removeOwnedSource(map: any): boolean {
  if (!map?.getSource?.(CITY_GEO_OVERLAY_SOURCE_ID)) return true
  if (typeof map.removeSource !== 'function') return false
  map.removeSource(CITY_GEO_OVERLAY_SOURCE_ID)
  return !map.getSource?.(CITY_GEO_OVERLAY_SOURCE_ID)
}

function hasExactSourceShape(source: unknown): boolean {
  if (!isPlainRecord(source)) return false
  const keys = Object.keys(source)
  return keys.length === 2
    && keys.includes('type')
    && keys.includes('data')
    && source.type === 'geojson'
}

function replaceOwnedSource(
  map: any,
  expected: CityGeoParcelFeatureCollection,
): boolean {
  if (!removeOwnedLayers(map) || !removeOwnedSource(map)) return false
  if (typeof map.addSource !== 'function') return false
  map.addSource(CITY_GEO_OVERLAY_SOURCE_ID, {
    type: 'geojson',
    data: expected,
  })
  return Boolean(map.getSource?.(CITY_GEO_OVERLAY_SOURCE_ID))
}

function ensureSource(
  map: any,
  expected: CityGeoParcelFeatureCollection,
): boolean {
  const liveSource = map.getSource?.(CITY_GEO_OVERLAY_SOURCE_ID)
  const styleSource = readMapLibreStyleSource(map, CITY_GEO_OVERLAY_SOURCE_ID)
  if (liveSource && styleSource !== undefined && !hasExactSourceShape(styleSource)) {
    return replaceOwnedSource(map, expected)
  }
  if (!liveSource) return replaceOwnedSource(map, expected)
  const current = readGeoJsonSourceData(liveSource)
  if (hasExactCityGeoOverlayFeatureCollection(expected, current)) return true
  if (typeof liveSource.setData !== 'function') {
    return replaceOwnedSource(map, expected)
  }
  liveSource.setData(expected)
  return hasExactCityGeoOverlayFeatureCollection(
    expected,
    readGeoJsonSourceData(map.getSource?.(CITY_GEO_OVERLAY_SOURCE_ID)),
  )
}

function ensureLayer(
  map: any,
  layer: typeof CITY_GEO_OVERLAY_LAYER_DEFINITIONS[number],
  beforeLayerId: string | null,
): boolean {
  const layerId = layer.id
  if (map.getLayer?.(layerId)) {
    if (hasExactCityGeoOverlayStyleLayerDefinition(
      readStyleLayer(map, layerId),
      layer,
    )) return true
    if (typeof map.removeLayer !== 'function') return false
    map.removeLayer(layerId)
    if (map.getLayer?.(layerId)) return false
  }
  if (typeof map.addLayer !== 'function') return false
  map.addLayer(layer, beforeLayerId || undefined)
  return Boolean(map.getLayer?.(layerId))
    && hasExactCityGeoOverlayStyleLayerDefinition(
      readStyleLayer(map, layerId),
      layer,
    )
}

function positionLayers(map: any, beforeLayerId: string | null): boolean {
  if (hasExactCityLayerOrder(map, beforeLayerId)) return true
  if (typeof map?.moveLayer !== 'function') return false
  const resolvedBeforeLayerId = beforeLayerId && map.getLayer?.(beforeLayerId)
    ? beforeLayerId
    : undefined
  for (const layerId of CITY_GEO_OVERLAY_LAYER_ORDER) {
    if (map.getLayer?.(layerId)) map.moveLayer(layerId, resolvedBeforeLayerId)
  }
  return hasExactCityLayerOrder(map, beforeLayerId)
}

function setLayerVisibility(map: any, viewMode: CityGeoViewMode): boolean {
  if (typeof map.setLayoutProperty !== 'function') return false
  for (const layerId of CITY_GEO_OVERLAY_LAYER_ORDER) {
    const visibility = expectedVisibility(layerId, viewMode)
    if (readVisibility(map, layerId) !== visibility) {
      map.setLayoutProperty(layerId, 'visibility', visibility)
    }
    if (readVisibility(map, layerId) !== visibility) return false
  }
  return true
}

export function mapHasExactCityGeoOverlay(
  map: any,
  snapshot: CityGeoOverlaySnapshot,
  options: CityGeoOverlayMapLibreOptions,
): boolean {
  try {
    if (!snapshot.active) {
      return !map?.getSource?.(CITY_GEO_OVERLAY_SOURCE_ID)
        && CITY_GEO_OVERLAY_LAYER_ORDER.every(id => !map?.getLayer?.(id))
    }
    const expected = cityGeoOverlayFeatureCollection(snapshot)
    return hasExactCityGeoOverlaySourceData(map, expected)
      && CITY_GEO_OVERLAY_LAYER_DEFINITIONS.every(layer => (
        hasExactCityGeoOverlayStyleLayerDefinition(
          readStyleLayer(map, layer.id),
          layer,
        )
        && readVisibility(map, layer.id)
          === expectedVisibility(layer.id, options.viewMode)
      ))
      && hasExactCityLayerOrder(map, options.beforeLayerId || null)
  } catch {
    return false
  }
}

function hasExactCityGeoOverlaySourceData(
  map: any,
  expected: CityGeoParcelFeatureCollection,
): boolean {
  const source = map?.getSource?.(CITY_GEO_OVERLAY_SOURCE_ID)
  if (!source) return false
  if (typeof source.loaded === 'function' && source.loaded() !== true) {
    return false
  }
  const styleSource = readMapLibreStyleSource(map, CITY_GEO_OVERLAY_SOURCE_ID)
  return hasExactGeoJsonStyleSource(
    styleSource,
    expected,
    hasExactCityGeoOverlayFeatureCollection,
  ) && hasExactCityGeoOverlayFeatureCollection(
    expected,
    readGeoJsonSourceData(source),
  )
}

export function mapHasExactCityGeoOverlaySource(
  map: any,
  snapshot: CityGeoOverlaySnapshot,
): boolean {
  try {
    if (!snapshot.active) {
      return !map?.getSource?.(CITY_GEO_OVERLAY_SOURCE_ID)
    }
    return hasExactCityGeoOverlaySourceData(
      map,
      cityGeoOverlayFeatureCollection(snapshot),
    )
  } catch {
    return false
  }
}

export function applyCityGeoOverlayToMap(
  map: any,
  snapshot: CityGeoOverlaySnapshot,
  options: CityGeoOverlayMapLibreOptions,
): boolean {
  if (!map || !isMapLibreStyleReady(map)) return false
  if (!snapshot.active) return clearCityGeoOverlayFromMap(map)
  try {
    const expected = cityGeoOverlayFeatureCollection(snapshot)
    if (!ensureSource(map, expected)) return false
    const beforeLayerId = options.beforeLayerId
      && map.getLayer?.(options.beforeLayerId)
      ? options.beforeLayerId
      : null
    for (const layer of CITY_GEO_OVERLAY_LAYER_DEFINITIONS) {
      if (!ensureLayer(map, layer, beforeLayerId)) return false
    }
    if (!positionLayers(map, beforeLayerId)) return false
    return setLayerVisibility(map, options.viewMode)
  } catch (error) {
    return reportFailure('apply', error)
  }
}

export function clearCityGeoOverlayFromMap(map: any): boolean {
  if (!map || !isMapLibreStyleReady(map)) return false
  try {
    return removeOwnedLayers(map) && removeOwnedSource(map)
  } catch (error) {
    return reportFailure('clear', error)
  }
}
