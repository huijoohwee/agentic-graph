import type { Feature, FeatureCollection, Polygon } from 'geojson'
import type {
  FlightGeoEnvironmentProjection,
  FlightGeoOverlaySnapshot,
} from './flightGeoOverlay.js'
import {
  hasExactGeoJsonStyleSource,
  isMapLibreStyleReady,
  readGeoJsonSourceData,
  readMapLibreStyleSource,
} from './maplibreLayers.js'

export const FLIGHT_GEO_ENVIRONMENT_SOURCE_ID =
  'kg-flight-geo-environment'

export const FLIGHT_GEO_ENVIRONMENT_LAYER_IDS = Object.freeze({
  fill2d: `${FLIGHT_GEO_ENVIRONMENT_SOURCE_ID}:fill-2d`,
  extrusion3d: `${FLIGHT_GEO_ENVIRONMENT_SOURCE_ID}:extrusion-3d`,
  outline: `${FLIGHT_GEO_ENVIRONMENT_SOURCE_ID}:outline`,
})

// Environment layers always sit below the Flight route and aircraft stack.
// Keep this order public so a provider-style handoff can retain the complete
// authored-metre composition rather than briefly dropping it between styles.
export const FLIGHT_GEO_ENVIRONMENT_LAYER_ORDER = Object.freeze([
  FLIGHT_GEO_ENVIRONMENT_LAYER_IDS.fill2d,
  FLIGHT_GEO_ENVIRONMENT_LAYER_IDS.extrusion3d,
  FLIGHT_GEO_ENVIRONMENT_LAYER_IDS.outline,
])

export type FlightGeoEnvironmentFeatureProperties = Readonly<{
  kgBaseHeightMeters: number
  kgColor: string
  kgEnvironmentId: string
  kgEnvironmentRevision: string
  kgHeightMeters: number
  kgPoiId: string
  kgRenderBaseHeightMeters: number
  kgRenderHeightMeters: number
  kgSurfaceId: string
  kgSurfaceKind: string
  kgSurfaceLabel: string
}>

const GLOBE_GROUND_CLEARANCE_METERS = 0.15
const ENVIRONMENT_PROPERTY_KEYS = Object.freeze([
  'kgBaseHeightMeters',
  'kgColor',
  'kgEnvironmentId',
  'kgEnvironmentRevision',
  'kgHeightMeters',
  'kgPoiId',
  'kgRenderBaseHeightMeters',
  'kgRenderHeightMeters',
  'kgSurfaceId',
  'kgSurfaceKind',
  'kgSurfaceLabel',
] as const)
export const FLIGHT_GEO_ENVIRONMENT_LAYER_DEFINITIONS = Object.freeze([
  Object.freeze({
    id: FLIGHT_GEO_ENVIRONMENT_LAYER_IDS.fill2d,
    type: 'fill',
    source: FLIGHT_GEO_ENVIRONMENT_SOURCE_ID,
    paint: Object.freeze({
      'fill-color': ['get', 'kgColor'],
      'fill-opacity': [
        'case',
        ['==', ['get', 'kgSurfaceKind'], 'stage-footprint'],
        0.2,
        0.7,
      ],
    }),
  }),
  Object.freeze({
    id: FLIGHT_GEO_ENVIRONMENT_LAYER_IDS.extrusion3d,
    type: 'fill-extrusion',
    source: FLIGHT_GEO_ENVIRONMENT_SOURCE_ID,
    paint: Object.freeze({
      'fill-extrusion-base': ['get', 'kgRenderBaseHeightMeters'],
      'fill-extrusion-color': ['get', 'kgColor'],
      'fill-extrusion-height': ['get', 'kgRenderHeightMeters'],
      'fill-extrusion-opacity': 0.86,
    }),
  }),
  Object.freeze({
    id: FLIGHT_GEO_ENVIRONMENT_LAYER_IDS.outline,
    type: 'line',
    source: FLIGHT_GEO_ENVIRONMENT_SOURCE_ID,
    paint: Object.freeze({
      'line-color': '#06b6d4',
      'line-opacity': 0.9,
      'line-width': 2,
    }),
  }),
] as const)

function resolveRenderHeightRange(
  baseHeightMeters: number,
  heightMeters: number,
): readonly [number, number] {
  if (baseHeightMeters > 0) {
    return [baseHeightMeters, heightMeters]
  }
  // Globe depth testing clips extrusions that start exactly on its surface.
  return [
    GLOBE_GROUND_CLEARANCE_METERS,
    heightMeters + GLOBE_GROUND_CLEARANCE_METERS,
  ]
}

export type FlightGeoEnvironmentFeatureCollection = FeatureCollection<
  Polygon,
  FlightGeoEnvironmentFeatureProperties
>

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
        coordinates: [surface.ring.map(coordinate => [...coordinate])],
      },
      properties: {
        kgBaseHeightMeters: surface.baseHeightMeters,
        kgColor: surface.color,
        kgEnvironmentId: environment.id,
        kgEnvironmentRevision: environment.revision,
        kgHeightMeters: surface.heightMeters,
        kgPoiId: surface.poiId || '',
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

/**
 * MapLibre can retain an older source payload while every layer is still
 * present. Compare the authored feature shape in order so a stale coordinate
 * or extrusion-height mutation cannot be treated as an exact presentation.
 */
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
  ) {
    return false
  }
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

function isEnvironmentSourceLoaded(source: unknown): boolean {
  if (!source || typeof source !== 'object') return false
  try {
    const loaded = (source as { loaded?: () => unknown }).loaded
    return typeof loaded !== 'function' || loaded.call(source) === true
  } catch {
    return false
  }
}

function scheduleEnvironmentSourceData(
  map: any,
  data: FlightGeoEnvironmentFeatureCollection,
): boolean {
  const source = map?.getSource?.(FLIGHT_GEO_ENVIRONMENT_SOURCE_ID)
  if (!source || typeof source.setData !== 'function') return false
  try {
    source.setData(data)
    return true
  } catch {
    return false
  }
}

function is3dViewMode(viewMode: string): boolean {
  return viewMode === '3d' || viewMode === '3d-modern'
}

function removeEnvironmentLayers(map: any): boolean {
  for (const layerId of [...FLIGHT_GEO_ENVIRONMENT_LAYER_ORDER].reverse()) {
    if (!readEnvironmentStyleLayer(map, layerId)) continue
    if (typeof map.removeLayer !== 'function') return false
    map.removeLayer(layerId)
    if (readEnvironmentStyleLayer(map, layerId)) return false
  }
  return true
}

function ensureEnvironmentSource(
  map: any,
  expected: FlightGeoEnvironmentFeatureCollection,
): boolean {
  const source = map.getSource?.(FLIGHT_GEO_ENVIRONMENT_SOURCE_ID)
  const styleSource = readMapLibreStyleSource(
    map,
    FLIGHT_GEO_ENVIRONMENT_SOURCE_ID,
  )
  if (
    source
    && (
      styleSource === undefined
      || hasExactGeoJsonStyleSource(
        styleSource,
        expected,
        hasExactFlightGeoEnvironmentFeatureCollection,
      )
    )
  ) return true
  if (source) {
    if (
      !removeEnvironmentLayers(map)
      || typeof map.removeSource !== 'function'
    ) return false
    map.removeSource(FLIGHT_GEO_ENVIRONMENT_SOURCE_ID)
    if (map.getSource?.(FLIGHT_GEO_ENVIRONMENT_SOURCE_ID)) return false
  }
  map.addSource?.(FLIGHT_GEO_ENVIRONMENT_SOURCE_ID, {
    type: 'geojson',
    data: { type: 'FeatureCollection', features: [] },
  })
  return Boolean(map.getSource?.(FLIGHT_GEO_ENVIRONMENT_SOURCE_ID))
}

function hasExactStyleValue(expected: unknown, actual: unknown): boolean {
  if (Array.isArray(expected)) {
    return Array.isArray(actual)
      && expected.length === actual.length
      && expected.every((value, index) => (
        hasExactStyleValue(value, actual[index])
      ))
  }
  if (isPlainRecord(expected)) {
    return isPlainRecord(actual)
      && Object.keys(expected).length === Object.keys(actual).length
      && Object.entries(expected).every(([key, value]) => (
        hasExactStyleValue(value, actual[key])
      ))
  }
  return Object.is(expected, actual)
}

function readEnvironmentStyleLayer(
  map: any,
  layerId: string,
): Record<string, unknown> | null {
  const styleLayers = map?.getStyle?.()?.layers
  if (Array.isArray(styleLayers)) {
    const styleLayer = styleLayers.find(layer => (
      isPlainRecord(layer) && layer.id === layerId
    ))
    return isPlainRecord(styleLayer) ? styleLayer : null
  }
  const layer = map?.getLayer?.(layerId)
  return isPlainRecord(layer) ? layer : null
}

function hasExactEnvironmentLayerDefinition(
  actual: unknown,
  expected: typeof FLIGHT_GEO_ENVIRONMENT_LAYER_DEFINITIONS[number],
): boolean {
  if (!isPlainRecord(actual)) return false
  const actualLayout = isPlainRecord(actual.layout)
    ? Object.fromEntries(
        Object.entries(actual.layout)
          .filter(([property]) => property !== 'visibility'),
      )
    : undefined
  if (
    actual.type !== expected.type
    || actual.source !== expected.source
    || actual['source-layer'] !== undefined
    || actual.minzoom !== undefined
    || actual.maxzoom !== undefined
    || actual.filter !== undefined
    || !hasExactStyleValue(expected.paint, actual.paint)
  ) return false
  return actualLayout === undefined || Object.keys(actualLayout).length === 0
}

function mapHasExactEnvironmentLayerDefinition(
  map: any,
  expected: typeof FLIGHT_GEO_ENVIRONMENT_LAYER_DEFINITIONS[number],
): boolean {
  return hasExactEnvironmentLayerDefinition(
    readEnvironmentStyleLayer(map, expected.id),
    expected,
  )
}

function ensureEnvironmentLayer(
  map: any,
  expected: typeof FLIGHT_GEO_ENVIRONMENT_LAYER_DEFINITIONS[number],
  beforeLayerId: string | null,
): boolean {
  if (map.getLayer?.(expected.id)) {
    if (mapHasExactEnvironmentLayerDefinition(map, expected)) return true
    if (typeof map.removeLayer !== 'function') return false
    map.removeLayer(expected.id)
    if (map.getLayer?.(expected.id)) return false
  }
  if (typeof map.addLayer !== 'function') return false
  map.addLayer(expected, beforeLayerId || undefined)
  return mapHasExactEnvironmentLayerDefinition(map, expected)
}

function hasExactEnvironmentLayerOrder(
  map: any,
  beforeLayerId: string | null,
): boolean {
  if (!beforeLayerId || !map.getLayer?.(beforeLayerId)) return true
  const layers = map?.getStyle?.()?.layers
  if (!Array.isArray(layers)) return false
  const layerIds = layers.map(layer => String(layer?.id || ''))
  const environmentIndexes = FLIGHT_GEO_ENVIRONMENT_LAYER_ORDER.map(layerId => (
    layerIds.indexOf(layerId)
  ))
  if (environmentIndexes.some(index => index < 0)) return false
  if (!environmentIndexes.every((index, position) => (
    position === 0 || index === environmentIndexes[position - 1] + 1
  ))) return false
  return environmentIndexes[environmentIndexes.length - 1] + 1
    === layerIds.indexOf(beforeLayerId)
}

function positionEnvironmentLayers(
  map: any,
  beforeLayerId: string | null,
): boolean {
  if (hasExactEnvironmentLayerOrder(map, beforeLayerId)) return true
  if (!beforeLayerId || typeof map?.moveLayer !== 'function') return false
  for (const layerId of FLIGHT_GEO_ENVIRONMENT_LAYER_ORDER) {
    if (map.getLayer?.(layerId)) map.moveLayer(layerId, beforeLayerId)
  }
  return hasExactEnvironmentLayerOrder(map, beforeLayerId)
}

function ensureEnvironmentLayers(
  map: any,
  beforeLayerId: string | null,
): boolean {
  return FLIGHT_GEO_ENVIRONMENT_LAYER_DEFINITIONS.every(expected => (
    ensureEnvironmentLayer(map, expected, beforeLayerId)
  )) && positionEnvironmentLayers(map, beforeLayerId)
}

export function hasExactFlightGeoEnvironmentStyleLayerDefinitions(
  layers: readonly unknown[],
): boolean {
  return FLIGHT_GEO_ENVIRONMENT_LAYER_DEFINITIONS.every(expected => {
    const actual = layers.find(layer => (
      isPlainRecord(layer) && layer.id === expected.id
    ))
    return hasExactEnvironmentLayerDefinition(actual, expected)
  })
}

function setEnvironmentLayerVisibility(
  map: any,
  layerId: string,
  visibility: 'none' | 'visible',
): void {
  try {
    const current = typeof map.getLayoutProperty === 'function'
      ? map.getLayoutProperty(layerId, 'visibility')
      : undefined
    // MapLibre schedules a painter update for every setLayoutProperty call,
    // including an identical visibility value. Ready reuses a stopped painter
    // frame, so it must not dirty that frame merely to restate its mode.
    if ((current || 'visible') === visibility) return
    map.setLayoutProperty?.(layerId, 'visibility', visibility)
  } catch {
    void 0
  }
}

function hideEnvironmentLayers(map: any): void {
  for (const layerId of FLIGHT_GEO_ENVIRONMENT_LAYER_ORDER) {
    setEnvironmentLayerVisibility(map, layerId, 'none')
  }
}

function applyModeVisibility(map: any, viewMode: string): void {
  const mode3d = is3dViewMode(viewMode)
  setEnvironmentLayerVisibility(
    map,
    FLIGHT_GEO_ENVIRONMENT_LAYER_IDS.fill2d,
    mode3d ? 'none' : 'visible',
  )
  setEnvironmentLayerVisibility(
    map,
    FLIGHT_GEO_ENVIRONMENT_LAYER_IDS.extrusion3d,
    mode3d ? 'visible' : 'none',
  )
  setEnvironmentLayerVisibility(
    map,
    FLIGHT_GEO_ENVIRONMENT_LAYER_IDS.outline,
    'visible',
  )
}

export function applyFlightGeoEnvironmentToMap(
  map: any,
  overlay: FlightGeoOverlaySnapshot,
  viewMode: string,
  options: Readonly<{ beforeLayerId?: string | null }> = {},
): boolean {
  if (!map || !isMapLibreStyleReady(map)) return false
  if (!overlay.environment) {
    return clearFlightGeoEnvironmentFromMap(map)
  }
  try {
    const expected = flightGeoEnvironmentMapLibreFeatureCollection(overlay)
    if (!ensureEnvironmentSource(map, expected)) {
      throw new Error('MapLibre did not register the XR environment source.')
    }
    const beforeLayerId = options.beforeLayerId
      && map.getLayer?.(options.beforeLayerId)
      ? options.beforeLayerId
      : null
    if (!ensureEnvironmentLayers(map, beforeLayerId)) {
      throw new Error('MapLibre did not register every XR environment layer.')
    }
    applyModeVisibility(map, viewMode)
    const sourceData = readGeoJsonSourceData(
      map.getSource?.(FLIGHT_GEO_ENVIRONMENT_SOURCE_ID),
    )
    if (hasExactFlightGeoEnvironmentFeatureCollection(expected, sourceData)) {
      return true
    }
    return scheduleEnvironmentSourceData(map, expected)
  } catch (error) {
    console.error(
      `[kg-flight] Could not project XR environment "${overlay.environment.id}" into MapLibre mode "${viewMode}".`,
      error,
    )
    return false
  }
}

export function clearFlightGeoEnvironmentFromMap(map: any): boolean {
  if (!map) return false
  // This runs during mount and style replacement, when MapLibre can expose a
  // Map instance before its Style is attached. Its getSource() implementation
  // dereferences that Style, so never probe a source until the style is ready.
  // Layer visibility is still best-effort and immediate so a retained style
  // cannot flash an environment while the empty source update settles.
  hideEnvironmentLayers(map)
  if (!isMapLibreStyleReady(map)) return true
  try {
    const source = map.getSource?.(FLIGHT_GEO_ENVIRONMENT_SOURCE_ID)
    if (!source) return true
    const sourceData = readGeoJsonSourceData(source)
    if (!sourceData) return false
    if (sourceData.features.length === 0) return true
    return scheduleEnvironmentSourceData(map, {
      type: 'FeatureCollection',
      features: [],
    })
  } catch {
    return false
  }
}

export function removeFlightGeoEnvironmentFromMap(map: any): boolean {
  if (!map) return false
  if (!isMapLibreStyleReady(map)) {
    // A retained provider style can still paint its previous frame while the
    // replacement style loads. Hide best-effort now, then let style.load retry
    // the destructive layer/source teardown once MapLibre permits mutation.
    hideEnvironmentLayers(map)
    return false
  }
  try {
    if (!removeEnvironmentLayers(map)) return false
    const source = map.getSource?.(FLIGHT_GEO_ENVIRONMENT_SOURCE_ID)
    const styleSource = readMapLibreStyleSource(
      map,
      FLIGHT_GEO_ENVIRONMENT_SOURCE_ID,
    )
    if (!source && styleSource === undefined) return true
    if (typeof map.removeSource !== 'function') return false
    map.removeSource(FLIGHT_GEO_ENVIRONMENT_SOURCE_ID)
    return !map.getSource?.(FLIGHT_GEO_ENVIRONMENT_SOURCE_ID)
      && readMapLibreStyleSource(
        map,
        FLIGHT_GEO_ENVIRONMENT_SOURCE_ID,
      ) === undefined
  } catch {
    return false
  }
}

export function mapHasExactFlightGeoEnvironment(
  map: any,
  overlay: FlightGeoOverlaySnapshot,
): boolean {
  try {
    const source = map?.getSource?.(FLIGHT_GEO_ENVIRONMENT_SOURCE_ID)
    if (!source) return !overlay.environment
    const sourceData = readGeoJsonSourceData(source)
    if (!sourceData || !isEnvironmentSourceLoaded(source)) return false
    if (!overlay.environment) return sourceData.features.length === 0
    return FLIGHT_GEO_ENVIRONMENT_LAYER_DEFINITIONS
      .every(expected => mapHasExactEnvironmentLayerDefinition(map, expected))
      && hasExactFlightGeoEnvironmentFeatureCollection(
        flightGeoEnvironmentMapLibreFeatureCollection(overlay),
        sourceData,
      )
  } catch {
    return false
  }
}
