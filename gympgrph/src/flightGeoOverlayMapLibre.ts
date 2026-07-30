import type { FlightGeoOverlaySnapshot } from './flightGeoOverlay.js'
import {
  FLIGHT_GEO_AIRCRAFT_SHAPE_METERS,
  flightGeoOverlayMapLibreFeatureCollection,
  hasExactFlightGeoOverlayFeatureCollection,
} from './flightGeoOverlayMapLibrePayload.js'
import {
  clearGeoJsonSourceData,
  hasExactGeoJsonStyleSource,
  isMapLibreStyleReady,
  readGeoJsonSourceData,
  readMapLibreStyleSource,
  setGeoJsonSourceData,
} from './maplibreLayers.js'
import { readFlightGeoMapViewportPadding, type FlightGeoMapViewportPadding } from './flightGeoMapViewport.js'
import {
  flightGeoEnvironmentMapLibreFeatureCollection,
  FLIGHT_GEO_ENVIRONMENT_LAYER_IDS,
  FLIGHT_GEO_ENVIRONMENT_LAYER_ORDER,
  FLIGHT_GEO_ENVIRONMENT_SOURCE_ID,
  hasExactFlightGeoEnvironmentFeatureCollection,
  hasExactFlightGeoEnvironmentStyleLayerDefinitions,
} from './flightGeoEnvironmentMapLibre.js'
import {
  FLIGHT_GEO_AIRCRAFT_IMAGE_IDS,
  FLIGHT_GEO_OVERLAY_LAYER_DEFINITIONS,
  FLIGHT_GEO_OVERLAY_LAYER_IDS,
  FLIGHT_GEO_OVERLAY_SOURCE_ID,
  hasExactFlightGeoOverlayStyleLayerDefinition,
  hasExactFlightGeoOverlayStyleLayerDefinitions,
  mapHasExactFlightGeoOverlayLayerDefinitions,
} from './flightGeoOverlayMapLibreLayers.js'
export {
  FLIGHT_GEO_AIRCRAFT_IMAGE_IDS,
  FLIGHT_GEO_OVERLAY_LAYER_DEFINITIONS,
  FLIGHT_GEO_OVERLAY_LAYER_IDS,
  FLIGHT_GEO_OVERLAY_SOURCE_ID,
} from './flightGeoOverlayMapLibreLayers.js'
export {
  applyFlightGeoOverlayCameraToMap,
  canInspectFlightGeoOverlayCamera,
  createFlightGeoOverlayMapLibreCamera,
  flightGeoOverlayMapLibreCameraSignature,
  mapHasExactFlightGeoOverlayCamera,
  type FlightGeoMapCamera,
  type FlightGeoOverlayCameraApplicationOptions,
} from './flightGeoOverlayMapLibreCamera.js'

export { flightGeoOverlayMapLibreFeatureCollection }

// This is both the painter order and the exactness contract for the Flight
// overlay. Keep it public so presentation gates do not accidentally infer a
// different order from the object declaration above.
export const FLIGHT_GEO_OVERLAY_LAYER_ORDER = Object.freeze([
  FLIGHT_GEO_OVERLAY_LAYER_IDS.route,
  FLIGHT_GEO_OVERLAY_LAYER_IDS.objectiveGuide,
  FLIGHT_GEO_OVERLAY_LAYER_IDS.routePoints,
  FLIGHT_GEO_OVERLAY_LAYER_IDS.aircraftOutline,
  FLIGHT_GEO_OVERLAY_LAYER_IDS.aircraft,
])
const FLIGHT_GEO_OVERLAY_LAYER_ID_SET = new Set<string>(
  FLIGHT_GEO_OVERLAY_LAYER_ORDER,
)
const FLIGHT_GEO_ENVIRONMENT_LAYER_ID_SET = new Set<string>(
  FLIGHT_GEO_ENVIRONMENT_LAYER_ORDER,
)

const FLIGHT_GEO_AIRCRAFT_IMAGE_SIZE = 40

type FlightGeoAircraftImage = Readonly<{
  data: Uint8Array
  height: number
  width: number
}>

function isPointInsideAircraftShape(x: number, y: number): boolean {
  let inside = false
  for (
    let index = 0, previous = FLIGHT_GEO_AIRCRAFT_SHAPE_METERS.length - 1;
    index < FLIGHT_GEO_AIRCRAFT_SHAPE_METERS.length;
    previous = index, index += 1
  ) {
    const [currentX, currentY] = FLIGHT_GEO_AIRCRAFT_SHAPE_METERS[index]
    const [previousX, previousY] =
      FLIGHT_GEO_AIRCRAFT_SHAPE_METERS[previous]
    if (
      (currentY > y) !== (previousY > y)
      && x < (
        (previousX - currentX) * (y - currentY)
        / (previousY - currentY)
        + currentX
      )
    ) {
      inside = !inside
    }
  }
  return inside
}

function createFlightGeoAircraftImage(
  fill: readonly [number, number, number],
  outline: readonly [number, number, number],
): FlightGeoAircraftImage {
  const data = new Uint8Array(
    FLIGHT_GEO_AIRCRAFT_IMAGE_SIZE
      * FLIGHT_GEO_AIRCRAFT_IMAGE_SIZE
      * 4,
  )
  const pixelToShape = (
    pixel: number,
  ): number => (pixel / FLIGHT_GEO_AIRCRAFT_IMAGE_SIZE - 0.5) * 64
  const inside = (x: number, y: number): boolean =>
    isPointInsideAircraftShape(pixelToShape(x), -pixelToShape(y))
  for (let y = 0; y < FLIGHT_GEO_AIRCRAFT_IMAGE_SIZE; y += 1) {
    for (let x = 0; x < FLIGHT_GEO_AIRCRAFT_IMAGE_SIZE; x += 1) {
      if (!inside(x + 0.5, y + 0.5)) continue
      const boundary = [
        [-1, 0],
        [1, 0],
        [0, -1],
        [0, 1],
      ].some(([offsetX, offsetY]) => !inside(
        x + 0.5 + offsetX,
        y + 0.5 + offsetY,
      ))
      const color = boundary ? outline : fill
      const offset = (y * FLIGHT_GEO_AIRCRAFT_IMAGE_SIZE + x) * 4
      data[offset] = color[0]
      data[offset + 1] = color[1]
      data[offset + 2] = color[2]
      data[offset + 3] = 255
    }
  }
  return Object.freeze({
    data,
    height: FLIGHT_GEO_AIRCRAFT_IMAGE_SIZE,
    width: FLIGHT_GEO_AIRCRAFT_IMAGE_SIZE,
  })
}

const FLIGHT_GEO_AIRCRAFT_IMAGES = Object.freeze({
  day: createFlightGeoAircraftImage([34, 211, 238], [248, 250, 252]),
  night: createFlightGeoAircraftImage([196, 181, 253], [30, 27, 75]),
  outlineDay: createFlightGeoAircraftImage([15, 23, 42], [15, 23, 42]),
  outlineNight: createFlightGeoAircraftImage([30, 27, 75], [30, 27, 75]),
})

function ensureFlightGeoAircraftImages(map: any): boolean {
  try {
    for (
      const mode of [
        'day',
        'night',
        'outlineDay',
        'outlineNight',
      ] as const
    ) {
      const imageId = FLIGHT_GEO_AIRCRAFT_IMAGE_IDS[mode]
      const exists = typeof map.hasImage === 'function'
        ? map.hasImage(imageId)
        : Boolean(map.getImage?.(imageId))
      if (exists) continue
      if (typeof map.addImage !== 'function') {
        throw new Error('MapLibre addImage is unavailable.')
      }
      map.addImage(imageId, FLIGHT_GEO_AIRCRAFT_IMAGES[mode])
      const registered = typeof map.hasImage === 'function'
        ? map.hasImage(imageId)
        : Boolean(map.getImage?.(imageId))
      if (!registered) {
        throw new Error(`MapLibre did not register image "${imageId}".`)
      }
    }
    return true
  } catch (error) {
    console.error(
      '[kg-flight] Could not register the fixed-pixel aircraft images.',
      error,
    )
    return false
  }
}

function mapHasFlightGeoAircraftImages(map: any): boolean {
  try {
    return Object.values(FLIGHT_GEO_AIRCRAFT_IMAGE_IDS).every(imageId => (
      typeof map?.hasImage === 'function'
        ? map.hasImage(imageId)
        : Boolean(map?.getImage?.(imageId))
    ))
  } catch {
    return false
  }
}

/**
 * A Flight phase or ready-frame token is runtime metadata, not painted GeoJSON.
 * Compare the complete visual payload instead of forcing a source-worker update
 * merely because a stopped, already-rendered mission becomes ready at tick zero.
 */
export function mapHasExactFlightGeoOverlay(
  map: any,
  overlay: FlightGeoOverlaySnapshot,
): boolean {
  try {
    const source = map?.getSource?.(FLIGHT_GEO_OVERLAY_SOURCE_ID)
    const sourceLoaded = typeof source?.loaded === 'function'
      && source.loaded() === true
    if (!sourceLoaded) return false
    return hasExactFlightGeoOverlayFeatureCollection(
      flightGeoOverlayMapLibreFeatureCollection(overlay),
      readGeoJsonSourceData(source),
    )
      && Object.values(FLIGHT_GEO_OVERLAY_LAYER_IDS)
        .every(layerId => Boolean(map?.getLayer?.(layerId)))
      && mapHasFlightGeoAircraftImages(map)
      && mapHasExactFlightGeoOverlayLayerDefinitions(map)
  } catch {
    return false
  }
}

function isStyleLayer(layer: unknown): layer is Record<string, unknown> {
  return layer !== null && typeof layer === 'object' && !Array.isArray(layer)
}

function layerVisibility(layer: unknown): 'none' | 'visible' {
  if (!isStyleLayer(layer)) return 'visible'
  const layout = (layer as Record<string, unknown>).layout
  return (
    layout
    && typeof layout === 'object'
    && !Array.isArray(layout)
    && (layout as Record<string, unknown>).visibility === 'none'
  ) ? 'none' : 'visible'
}

function hasExactRetainedFlightLayerState(
  layers: readonly unknown[],
  overlay: FlightGeoOverlaySnapshot,
  viewMode: string,
  retainEnvironment: boolean,
): boolean {
  const expectedOrder = [
    ...(retainEnvironment ? FLIGHT_GEO_ENVIRONMENT_LAYER_ORDER : []),
    ...FLIGHT_GEO_OVERLAY_LAYER_ORDER,
  ]
  const topOrder = layers
    .slice(-expectedOrder.length)
    .map(layer => isStyleLayer(layer) ? String(layer.id || '') : '')
  if (!expectedOrder.every((id, index) => topOrder[index] === id)) return false
  const findLayer = (id: string) => layers.find(
    layer => isStyleLayer(layer) && layer.id === id,
  )
  if (
    !FLIGHT_GEO_OVERLAY_LAYER_ORDER.every(id => (
      layerVisibility(findLayer(id)) === 'visible'
    ))
  ) return false
  if (!retainEnvironment) return true
  if (!overlay.environment) {
    return FLIGHT_GEO_ENVIRONMENT_LAYER_ORDER.every(id => (
      layerVisibility(findLayer(id)) === 'none'
    ))
  }
  const mode3d = viewMode === '3d' || viewMode === '3d-modern'
  return layerVisibility(
    findLayer(FLIGHT_GEO_ENVIRONMENT_LAYER_IDS.fill2d),
  ) === (mode3d ? 'none' : 'visible')
    && layerVisibility(
      findLayer(FLIGHT_GEO_ENVIRONMENT_LAYER_IDS.extrusion3d),
    ) === (mode3d ? 'visible' : 'none')
    && layerVisibility(
      findLayer(FLIGHT_GEO_ENVIRONMENT_LAYER_IDS.outline),
    ) === 'visible'
}

export function mapHasExactFlightGeoStyleSources(
  map: any,
  overlay: FlightGeoOverlaySnapshot,
): boolean {
  const overlaySource = readMapLibreStyleSource(
    map,
    FLIGHT_GEO_OVERLAY_SOURCE_ID,
  )
  if (!hasExactGeoJsonStyleSource(
    overlaySource,
    flightGeoOverlayMapLibreFeatureCollection(overlay),
    hasExactFlightGeoOverlayFeatureCollection,
  )) return false
  const environmentSource = readMapLibreStyleSource(
    map,
    FLIGHT_GEO_ENVIRONMENT_SOURCE_ID,
  )
  if (environmentSource === undefined && !overlay.environment) return true
  return hasExactGeoJsonStyleSource(
    environmentSource,
    flightGeoEnvironmentMapLibreFeatureCollection(overlay),
    hasExactFlightGeoEnvironmentFeatureCollection,
  )
}

export function retainFlightGeoOverlayDuringStyleSwap(
  previousStyle: Readonly<Record<string, any>> | undefined,
  nextStyle: Readonly<Record<string, any>>,
  expectedOverlay: FlightGeoOverlaySnapshot,
  viewMode: string,
): Record<string, any> | null {
  if (!expectedOverlay.active) return { ...nextStyle }
  const previousSources = previousStyle?.sources
  const retainedOverlaySource = previousSources?.[FLIGHT_GEO_OVERLAY_SOURCE_ID]
  const retainedEnvironmentSource = previousSources?.[FLIGHT_GEO_ENVIRONMENT_SOURCE_ID]
  const previousLayers = Array.isArray(previousStyle?.layers)
    ? previousStyle.layers
    : []
  const retainedOverlayLayers = FLIGHT_GEO_OVERLAY_LAYER_ORDER
    .map(layerId => previousLayers.find(layer => layer?.id === layerId))
    .filter(Boolean)
  const retainedEnvironmentLayers = FLIGHT_GEO_ENVIRONMENT_LAYER_ORDER
    .map(layerId => previousLayers.find(layer => layer?.id === layerId))
    .filter(Boolean)
  const hasEnvironmentFragments = Boolean(retainedEnvironmentSource)
    || retainedEnvironmentLayers.length > 0
  const hasExactOverlay = (
    hasExactGeoJsonStyleSource(
      retainedOverlaySource,
      flightGeoOverlayMapLibreFeatureCollection(expectedOverlay),
      hasExactFlightGeoOverlayFeatureCollection,
    )
    && retainedOverlayLayers.length === FLIGHT_GEO_OVERLAY_LAYER_ORDER.length
    && hasExactFlightGeoOverlayStyleLayerDefinitions(retainedOverlayLayers)
  )
  const hasExactEnvironment = (
    (!hasEnvironmentFragments && !expectedOverlay.environment)
    || (
      hasExactGeoJsonStyleSource(
        retainedEnvironmentSource,
        flightGeoEnvironmentMapLibreFeatureCollection(expectedOverlay),
        hasExactFlightGeoEnvironmentFeatureCollection,
      )
      && retainedEnvironmentLayers.length
        === FLIGHT_GEO_ENVIRONMENT_LAYER_ORDER.length
      && hasExactFlightGeoEnvironmentStyleLayerDefinitions(
        retainedEnvironmentLayers,
      )
    )
  )
  const hasExactLayerState = hasExactRetainedFlightLayerState(
    previousLayers,
    expectedOverlay,
    viewMode,
    hasEnvironmentFragments,
  )
  // Provider promotion is one visual handoff. Retaining only the route/aircraft
  // or only the XR environment would expose a partial Flight frame while the
  // missing half is rebuilt by a later render.
  if (
    !hasExactOverlay
    || !hasExactEnvironment
    || !hasExactLayerState
  ) return null
  const retainEnvironment = hasEnvironmentFragments
  const nextLayers = Array.isArray(nextStyle?.layers)
    ? nextStyle.layers.filter(
        layer => {
          const layerId = String(layer?.id || '')
          return !(
            (retainEnvironment && FLIGHT_GEO_ENVIRONMENT_LAYER_ID_SET.has(layerId))
            || FLIGHT_GEO_OVERLAY_LAYER_ID_SET.has(layerId)
          )
        },
      )
    : []
  return {
    ...nextStyle,
    sources: {
      ...(nextStyle?.sources || {}),
      ...(retainEnvironment ? {
        [FLIGHT_GEO_ENVIRONMENT_SOURCE_ID]: retainedEnvironmentSource,
      } : {}),
      [FLIGHT_GEO_OVERLAY_SOURCE_ID]: retainedOverlaySource,
    },
    layers: [
      ...nextLayers,
      ...(retainEnvironment ? retainedEnvironmentLayers : []),
      ...retainedOverlayLayers,
    ],
  }
}

function readFlightGeoOverlayStyleLayer(
  map: any,
  layerId: string,
): Record<string, unknown> | null {
  const styleLayers = map?.getStyle?.()?.layers
  if (Array.isArray(styleLayers)) {
    const layer = styleLayers.find(candidate => candidate?.id === layerId)
    return layer && typeof layer === 'object' ? layer : null
  }
  const layer = map?.getLayer?.(layerId)
  return layer && typeof layer === 'object' ? layer : null
}

function ensureFlightGeoOverlayLayer(
  map: any,
  layer: typeof FLIGHT_GEO_OVERLAY_LAYER_DEFINITIONS[number],
): boolean {
  const layerId = String(layer.id || '')
  try {
    if (!layerId) throw new Error('Flight overlay layer requires a stable id.')
    if (map.getLayer?.(layerId)) {
      if (hasExactFlightGeoOverlayStyleLayerDefinition(
        readFlightGeoOverlayStyleLayer(map, layerId),
        layer,
      )) {
        return true
      }
      if (typeof map.removeLayer !== 'function') {
        throw new Error('MapLibre removeLayer is unavailable.')
      }
      map.removeLayer(layerId)
      if (map.getLayer?.(layerId)) {
        throw new Error('MapLibre retained a mutated Flight overlay layer.')
      }
    }
    if (typeof map.addLayer !== 'function') {
      throw new Error('MapLibre addLayer is unavailable.')
    }
    map.addLayer(layer)
    if (
      map.getLayer?.(layerId)
      && hasExactFlightGeoOverlayStyleLayerDefinition(
        readFlightGeoOverlayStyleLayer(map, layerId),
        layer,
      )
    ) return true
    throw new Error(
      'MapLibre did not register the layer; inspect preceding map error events.',
    )
  } catch (error) {
    console.error(
      `[kg-flight] Could not add MapLibre Flight overlay layer "${layerId || 'unknown'}".`,
      error,
    )
    return false
  }
}

function keepFlightGeoOverlayAboveHostLayers(
  map: any,
  overlay: FlightGeoOverlaySnapshot,
): void {
  const styleLayers = map.getStyle?.()?.layers
  if (!Array.isArray(styleLayers)) return
  const expected = [
    ...(overlay.environment ? FLIGHT_GEO_ENVIRONMENT_LAYER_ORDER : []),
    ...FLIGHT_GEO_OVERLAY_LAYER_ORDER,
  ]
  const expectedIds = new Set<string>(expected)
  const presentOrder = styleLayers
    .map((layer: { id?: unknown }) => String(layer?.id || ''))
    .filter((id: string) => expectedIds.has(id))
  const topOrder = styleLayers
    .slice(-expected.length)
    .map((layer: { id?: unknown }) => String(layer?.id || ''))
  if (
    presentOrder.length === expected.length
    && presentOrder.every((id: string, index: number) => id === expected[index])
    && topOrder.every((id: string, index: number) => id === expected[index])
  ) return
  for (const layerId of expected) {
    if (map.getLayer?.(layerId)) map.moveLayer?.(layerId)
  }
}

export function fitMapToFlightGeoOverlay(
  map: any,
  overlay: FlightGeoOverlaySnapshot,
  padding: FlightGeoMapViewportPadding = readFlightGeoMapViewportPadding(map),
): boolean {
  try {
    if (!map || !overlay.active || overlay.route.length < 2) return false
    const coordinates = [
      ...overlay.route.map(point => point.coordinate),
      overlay.aircraft.coordinate,
      ...(overlay.environment?.surfaces.flatMap(surface => surface.ring) || []),
    ]
    let minLongitude = Number.POSITIVE_INFINITY
    let minLatitude = Number.POSITIVE_INFINITY
    let maxLongitude = Number.NEGATIVE_INFINITY
    let maxLatitude = Number.NEGATIVE_INFINITY
    for (const [longitude, latitude] of coordinates) {
      minLongitude = Math.min(minLongitude, longitude)
      minLatitude = Math.min(minLatitude, latitude)
      maxLongitude = Math.max(maxLongitude, longitude)
      maxLatitude = Math.max(maxLatitude, latitude)
    }
    if (![minLongitude, minLatitude, maxLongitude, maxLatitude].every(Number.isFinite)) {
      return false
    }
    const minimumSpanDegrees = 0.0004
    if (maxLongitude - minLongitude < minimumSpanDegrees) {
      const longitudeCenter = (minLongitude + maxLongitude) / 2
      minLongitude = longitudeCenter - minimumSpanDegrees / 2
      maxLongitude = longitudeCenter + minimumSpanDegrees / 2
    }
    if (maxLatitude - minLatitude < minimumSpanDegrees) {
      const latitudeCenter = (minLatitude + maxLatitude) / 2
      minLatitude = latitudeCenter - minimumSpanDegrees / 2
      maxLatitude = latitudeCenter + minimumSpanDegrees / 2
    }
    map.fitBounds?.(
      [[minLongitude, minLatitude], [maxLongitude, maxLatitude]],
      {
        duration: 0,
        maxZoom: 16,
        padding,
      },
    )
    return true
  } catch {
    return false
  }
}

export function applyFlightGeoOverlayToMap(
  map: any,
  overlay: FlightGeoOverlaySnapshot,
): boolean {
  try {
    if (!map || !isMapLibreStyleReady(map)) return false
    if (!overlay.active) {
      return clearFlightGeoOverlayFromMap(map)
    }
    if (!ensureFlightGeoAircraftImages(map)) return false
    const expected = flightGeoOverlayMapLibreFeatureCollection(overlay)
    const styleSource = readMapLibreStyleSource(
      map,
      FLIGHT_GEO_OVERLAY_SOURCE_ID,
    )
    const source = map.getSource?.(FLIGHT_GEO_OVERLAY_SOURCE_ID)
    if (
      source
      && styleSource !== undefined
      && !hasExactGeoJsonStyleSource(
        styleSource,
        expected,
        hasExactFlightGeoOverlayFeatureCollection,
      )
    ) {
      if (
        typeof map.removeLayer !== 'function'
        || typeof map.removeSource !== 'function'
      ) return false
      for (const layerId of [...FLIGHT_GEO_OVERLAY_LAYER_ORDER].reverse()) {
        if (map.getLayer?.(layerId)) map.removeLayer(layerId)
        if (map.getLayer?.(layerId)) return false
      }
      map.removeSource(FLIGHT_GEO_OVERLAY_SOURCE_ID)
      if (map.getSource?.(FLIGHT_GEO_OVERLAY_SOURCE_ID)) return false
    }
    const sourceData = readGeoJsonSourceData(
      map.getSource?.(FLIGHT_GEO_OVERLAY_SOURCE_ID),
    )
    if (!hasExactFlightGeoOverlayFeatureCollection(expected, sourceData)) {
      setGeoJsonSourceData(
        map,
        FLIGHT_GEO_OVERLAY_SOURCE_ID,
        expected,
      )
    }
    if (!FLIGHT_GEO_OVERLAY_LAYER_DEFINITIONS.every(layer => (
      ensureFlightGeoOverlayLayer(map, layer)
    ))) return false
    keepFlightGeoOverlayAboveHostLayers(map, overlay)
    return Boolean(map.getSource?.(FLIGHT_GEO_OVERLAY_SOURCE_ID))
      && Object.values(FLIGHT_GEO_OVERLAY_LAYER_IDS)
        .every(layerId => Boolean(map.getLayer?.(layerId)))
  } catch {
    return false
  }
}

export function clearFlightGeoOverlayFromMap(map: any): boolean {
  try {
    if (!map || !isMapLibreStyleReady(map)) return false
    const source = map.getSource?.(FLIGHT_GEO_OVERLAY_SOURCE_ID)
    if (!source) return true
    const sourceData = readGeoJsonSourceData(source)
    if (!sourceData) return false
    if (sourceData.features.length === 0) return true
    clearGeoJsonSourceData(map, FLIGHT_GEO_OVERLAY_SOURCE_ID)
    return true
  } catch {
    return false
  }
}
