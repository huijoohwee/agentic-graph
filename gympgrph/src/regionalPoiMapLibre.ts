import {
  type RegionalPoiProfile,
} from 'grph-shared/geospatial/regionalPoiGeo'
import {
  hasExactGeoJsonStyleSource,
  isMapLibreStyleReady,
  readGeoJsonSourceData,
  readMapLibreStyleSource,
} from './maplibreLayers.js'
import {
  hasExactRegionalPoiFeatureCollection,
  regionalPoiFeatureCollection,
  type RegionalPoiFeatureCollection as RegionalPoiMapLibreFeatureCollection,
} from './regionalPoiMapLibreProjection.js'

export {
  regionalPoiFeatureCollection,
  regionalPoiProfileBounds,
} from './regionalPoiMapLibreProjection.js'
export type {
  RegionalPoiBounds,
  RegionalPoiFeatureCollection,
  RegionalPoiFeatureProperties,
} from './regionalPoiMapLibreProjection.js'

export const REGIONAL_POI_SOURCE_ID = 'kg-geo-xr:regional-poi'
export const REGIONAL_POI_LAYER_IDS = Object.freeze({
  fill: `${REGIONAL_POI_SOURCE_ID}:fill`,
  extrusion: `${REGIONAL_POI_SOURCE_ID}:extrusion`,
  outline: `${REGIONAL_POI_SOURCE_ID}:outline`,
  locator: `${REGIONAL_POI_SOURCE_ID}:locator`,
  label: `${REGIONAL_POI_SOURCE_ID}:label`,
})
const REGIONAL_POI_SURFACE_FILTER = Object.freeze([
  '==',
  ['get', 'kgRegionalPoiFeatureKind'],
  'surface',
])
const REGIONAL_POI_LOCATOR_FILTER = Object.freeze([
  '==',
  ['get', 'kgRegionalPoiFeatureKind'],
  'locator',
])
const REGIONAL_POI_LAYER_DEFINITIONS = Object.freeze([
  Object.freeze({
    id: REGIONAL_POI_LAYER_IDS.fill,
    type: 'fill',
    source: REGIONAL_POI_SOURCE_ID,
    filter: REGIONAL_POI_SURFACE_FILTER,
    paint: Object.freeze({
      'fill-color': '#0ea5e9',
      'fill-opacity': 0.42,
    }),
  }),
  Object.freeze({
    id: REGIONAL_POI_LAYER_IDS.extrusion,
    type: 'fill-extrusion',
    source: REGIONAL_POI_SOURCE_ID,
    filter: REGIONAL_POI_SURFACE_FILTER,
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
    filter: REGIONAL_POI_SURFACE_FILTER,
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
    id: REGIONAL_POI_LAYER_IDS.locator,
    type: 'circle',
    source: REGIONAL_POI_SOURCE_ID,
    filter: REGIONAL_POI_LOCATOR_FILTER,
    paint: Object.freeze({
      'circle-color': '#0284c7',
      'circle-opacity': 0.98,
      'circle-pitch-alignment': 'viewport',
      'circle-pitch-scale': 'viewport',
      'circle-radius': 6,
      'circle-stroke-color': '#f8fafc',
      'circle-stroke-opacity': 1,
      'circle-stroke-width': 2,
    }),
  }),
  Object.freeze({
    id: REGIONAL_POI_LAYER_IDS.label,
    type: 'symbol',
    source: REGIONAL_POI_SOURCE_ID,
    filter: Object.freeze([
      'all',
      REGIONAL_POI_LOCATOR_FILTER,
      ['!=', ['get', 'kgRegionalPoiLabel'], ''],
    ]),
    layout: Object.freeze({
      'symbol-placement': 'point',
      'text-anchor': 'bottom',
      'text-allow-overlap': true,
      'text-field': ['get', 'kgRegionalPoiLabel'],
      'text-font': ['Noto Sans Regular'],
      'text-ignore-placement': true,
      'text-offset': [0, -0.8],
      'text-padding': 2,
      'text-size': 13,
    }),
    paint: Object.freeze({
      'text-color': '#082f49',
      'text-halo-color': '#f8fafc',
      'text-halo-blur': 0.25,
      'text-halo-width': 2,
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
  expected: RegionalPoiMapLibreFeatureCollection,
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
  expected: RegionalPoiMapLibreFeatureCollection,
): boolean {
  const liveSource = map.getSource?.(REGIONAL_POI_SOURCE_ID)
  const styleSource = readMapLibreStyleSource(map, REGIONAL_POI_SOURCE_ID)
  if (
    liveSource
    && styleSource !== undefined
    && !hasExactSourceShape(styleSource)
  ) return replaceOwnedSource(map, expected)
  if (!liveSource) return replaceOwnedSource(map, expected)
  if (hasExactRegionalPoiFeatureCollection(
    expected,
    readGeoJsonSourceData(liveSource),
  )) {
    return true
  }
  if (typeof liveSource.setData !== 'function') {
    return replaceOwnedSource(map, expected)
  }
  liveSource.setData(expected)
  return hasExactRegionalPoiFeatureCollection(
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
      hasExactRegionalPoiFeatureCollection,
    ) && hasExactRegionalPoiFeatureCollection(
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
    const expected = regionalPoiFeatureCollection(input)
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
