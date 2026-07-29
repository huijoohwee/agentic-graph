import type { Feature, FeatureCollection, Polygon } from 'geojson'
import { flightGeoOverlayFeatureCollection, type FlightGeoOverlaySnapshot } from './flightGeoOverlay.js'
import { clearGeoJsonSourceData, isMapLibreStyleReady, setGeoJsonSourceData } from './maplibreLayers.js'

export const FLIGHT_GEO_OVERLAY_SOURCE_ID = 'kg-flight-sim:geo-overlay'
export const FLIGHT_GEO_OVERLAY_LAYER_IDS = Object.freeze({
  aircraft: `${FLIGHT_GEO_OVERLAY_SOURCE_ID}:aircraft`,
  aircraftOutline: `${FLIGHT_GEO_OVERLAY_SOURCE_ID}:aircraft-outline`,
  objectiveGuide: `${FLIGHT_GEO_OVERLAY_SOURCE_ID}:objective-guide`,
  route: `${FLIGHT_GEO_OVERLAY_SOURCE_ID}:route`,
  routePoints: `${FLIGHT_GEO_OVERLAY_SOURCE_ID}:route-points`,
})
export const FLIGHT_GEO_AIRCRAFT_IMAGE_IDS = Object.freeze({
  day: `${FLIGHT_GEO_OVERLAY_SOURCE_ID}:aircraft-image-day`,
  night: `${FLIGHT_GEO_OVERLAY_SOURCE_ID}:aircraft-image-night`,
})

const FLIGHT_GEO_OVERLAY_LAYER_ORDER = Object.freeze([
  FLIGHT_GEO_OVERLAY_LAYER_IDS.route,
  FLIGHT_GEO_OVERLAY_LAYER_IDS.objectiveGuide,
  FLIGHT_GEO_OVERLAY_LAYER_IDS.routePoints,
  FLIGHT_GEO_OVERLAY_LAYER_IDS.aircraftOutline,
  FLIGHT_GEO_OVERLAY_LAYER_IDS.aircraft,
])
const FLIGHT_GEO_OVERLAY_LAYER_ID_SET = new Set<string>(
  FLIGHT_GEO_OVERLAY_LAYER_ORDER,
)

const FLIGHT_GEO_CAMERA_PRESETS = Object.freeze({
  chase: Object.freeze({ pitch: 48, zoom: 15.5 }),
  cockpit: Object.freeze({ pitch: 68, zoom: 17 }),
  survey: Object.freeze({ pitch: 22, zoom: 14.25 }),
})
const FLIGHT_GEO_NIGHT_EXPRESSION = Object.freeze([
  'boolean',
  ['get', 'kgFlightNight'],
  false,
])
const METERS_PER_LATITUDE_DEGREE = 111_320
const FLIGHT_GEO_AIRCRAFT_SHAPE_METERS = Object.freeze([
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
})

function ensureFlightGeoAircraftImages(map: any): boolean {
  try {
    for (const mode of ['day', 'night'] as const) {
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
      kgFlightOverlayRevision: overlay.revision,
      altitudeMeters: overlay.aircraft.altitudeMeters,
      headingDegrees,
    },
  }
}

function flightGeoOverlayMapLibreFeatureCollection(
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

export function retainFlightGeoOverlayDuringStyleSwap(
  previousStyle: Readonly<Record<string, any>> | undefined,
  nextStyle: Readonly<Record<string, any>>,
): Record<string, any> {
  const previousSources = previousStyle?.sources
  const retainedSource = previousSources?.[FLIGHT_GEO_OVERLAY_SOURCE_ID]
  if (!retainedSource) return { ...nextStyle }
  const previousLayers = Array.isArray(previousStyle?.layers)
    ? previousStyle.layers
    : []
  const retainedLayers = FLIGHT_GEO_OVERLAY_LAYER_ORDER
    .map(layerId => previousLayers.find(layer => layer?.id === layerId))
    .filter(Boolean)
  if (retainedLayers.length === 0) return { ...nextStyle }
  const nextLayers = Array.isArray(nextStyle?.layers)
    ? nextStyle.layers.filter(
        layer => !FLIGHT_GEO_OVERLAY_LAYER_ID_SET.has(String(layer?.id || '')),
      )
    : []
  return {
    ...nextStyle,
    sources: {
      ...(nextStyle?.sources || {}),
      [FLIGHT_GEO_OVERLAY_SOURCE_ID]: retainedSource,
    },
    layers: [
      ...nextLayers,
      ...retainedLayers,
    ],
  }
}

function addLayerOnce(map: any, layer: Record<string, unknown>): boolean {
  const layerId = String(layer.id || '')
  try {
    if (!layerId) throw new Error('Flight overlay layer requires a stable id.')
    if (map.getLayer?.(layerId)) return true
    if (typeof map.addLayer !== 'function') {
      throw new Error('MapLibre addLayer is unavailable.')
    }
    map.addLayer(layer)
    if (map.getLayer?.(layerId)) return true
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

function keepFlightGeoOverlayAboveHostLayers(map: any): void {
  const styleLayers = map.getStyle?.()?.layers
  if (!Array.isArray(styleLayers)) return
  const presentOrder = styleLayers
    .map((layer: { id?: unknown }) => String(layer?.id || ''))
    .filter((id: string) => FLIGHT_GEO_OVERLAY_LAYER_ID_SET.has(id))
  const topOrder = styleLayers
    .slice(-FLIGHT_GEO_OVERLAY_LAYER_ORDER.length)
    .map((layer: { id?: unknown }) => String(layer?.id || ''))
  const expected = [...FLIGHT_GEO_OVERLAY_LAYER_ORDER]
  if (
    presentOrder.length === expected.length
    && topOrder.every((id: string, index: number) => id === expected[index])
  ) return
  for (const layerId of expected) {
    if (map.getLayer?.(layerId)) map.moveLayer?.(layerId)
  }
}

export function fitMapToFlightGeoOverlay(
  map: any,
  overlay: FlightGeoOverlaySnapshot,
): boolean {
  try {
    if (!map || !overlay.active || overlay.route.length < 2) return false
    const coordinates = [
      ...overlay.route.map(point => point.coordinate),
      overlay.aircraft.coordinate,
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
    const container = map.getContainer?.()
    const width = Math.max(1, Number(container?.clientWidth) || 1)
    const height = Math.max(1, Number(container?.clientHeight) || 1)
    const horizontalBase = Math.max(16, Math.min(72, width * 0.08))
    const floatingPanelClearance = width >= 760
      ? Math.min(360, width * 0.32)
      : horizontalBase
    const verticalBase = Math.max(16, Math.min(88, height * 0.1))
    map.fitBounds?.(
      [[minLongitude, minLatitude], [maxLongitude, maxLatitude]],
      {
        duration: 0,
        maxZoom: 16,
        padding: {
          top: verticalBase,
          right: floatingPanelClearance,
          bottom: Math.max(verticalBase, Math.min(112, height * 0.14)),
          left: horizontalBase,
        },
      },
    )
    return true
  } catch {
    return false
  }
}

export function applyFlightGeoOverlayCameraToMap(
  map: any,
  overlay: FlightGeoOverlaySnapshot,
  viewMode: string = '3d',
): boolean {
  if (typeof map?.jumpTo !== 'function') return false
  try {
    const mode3d = viewMode === '3d' || viewMode === '3d-modern'
    if (
      overlay.camera.effectiveOwner === 'timeline-playback'
      && overlay.camera.timeline
    ) {
      map.jumpTo({
        bearing: mode3d
          ? overlay.camera.timeline.bearingDegrees
          : 0,
        center: [...overlay.camera.timeline.centerCoordinate],
        pitch: mode3d
          ? Math.max(22, overlay.camera.timeline.pitchDegrees)
          : 0,
        zoom: overlay.camera.timeline.zoom,
      })
      return true
    }
    if (overlay.camera.source !== 'fixed-follow') return false
    const preset = FLIGHT_GEO_CAMERA_PRESETS[overlay.camera.view]
    map.jumpTo?.({
      bearing: mode3d && overlay.camera.view !== 'survey'
        ? overlay.aircraft.headingDegrees
        : 0,
      center: [...overlay.camera.centerCoordinate],
      pitch: mode3d ? preset.pitch : 0,
      zoom: preset.zoom,
    })
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
    setGeoJsonSourceData(
      map,
      FLIGHT_GEO_OVERLAY_SOURCE_ID,
      flightGeoOverlayMapLibreFeatureCollection(overlay),
    )
    addLayerOnce(map, {
      id: FLIGHT_GEO_OVERLAY_LAYER_IDS.route,
      type: 'line',
      source: FLIGHT_GEO_OVERLAY_SOURCE_ID,
      filter: ['==', ['get', 'kgFlightOverlayKind'], 'route'],
      paint: {
        'line-color': [
          'case',
          FLIGHT_GEO_NIGHT_EXPRESSION,
          '#a78bfa',
          '#22d3ee',
        ],
        'line-opacity': 0.88,
        'line-width': 4,
        'line-dasharray': [1.5, 1.25],
      },
    })
    addLayerOnce(map, {
      id: FLIGHT_GEO_OVERLAY_LAYER_IDS.objectiveGuide,
      type: 'line',
      source: FLIGHT_GEO_OVERLAY_SOURCE_ID,
      filter: [
        '==',
        ['get', 'kgFlightOverlayKind'],
        'objective-guide',
      ],
      layout: {
        'line-cap': 'round',
        'line-join': 'round',
      },
      paint: {
        'line-color': [
          'case',
          FLIGHT_GEO_NIGHT_EXPRESSION,
          '#f5d0fe',
          '#fde047',
        ],
        'line-opacity': 0.94,
        'line-width': 3,
        'line-dasharray': [0.75, 1.25],
      },
    })
    addLayerOnce(map, {
      id: FLIGHT_GEO_OVERLAY_LAYER_IDS.routePoints,
      type: 'circle',
      source: FLIGHT_GEO_OVERLAY_SOURCE_ID,
      filter: ['==', ['get', 'kgFlightOverlayKind'], 'route-point'],
      paint: {
        'circle-color': [
          'case',
          FLIGHT_GEO_NIGHT_EXPRESSION,
          [
            'match',
            ['get', 'kgFlightRouteState'],
            'active',
            '#a78bfa',
            'visited',
            '#34d399',
            '#e0e7ff',
          ],
          [
            'match',
            ['get', 'kgFlightRouteState'],
            'active',
            '#22d3ee',
            'visited',
            '#34d399',
            '#f8fafc',
          ],
        ],
        'circle-opacity': [
          'match',
          ['get', 'kgFlightRouteState'],
          'active',
          1,
          'visited',
          0.86,
          0.7,
        ],
        'circle-pitch-scale': 'viewport',
        'circle-radius': [
          'case',
          ['==', ['get', 'kgFlightRouteKind'], 'landing'],
          [
            'match',
            ['get', 'kgFlightRouteState'],
            'active',
            9,
            'visited',
            8,
            7,
          ],
          [
            'match',
            ['get', 'kgFlightRouteState'],
            'active',
            7.5,
            'visited',
            6,
            5,
          ],
        ],
        'circle-stroke-color': [
          'case',
          ['==', ['get', 'kgFlightRouteKind'], 'landing'],
          '#f59e0b',
          '#0f172a',
        ],
        'circle-stroke-width': [
          'case',
          ['==', ['get', 'kgFlightRouteState'], 'active'],
          3,
          ['==', ['get', 'kgFlightRouteKind'], 'landing'],
          2.5,
          ['==', ['get', 'kgFlightRouteState'], 'visited'],
          2,
          1.5,
        ],
      },
    })
    addLayerOnce(map, {
      id: FLIGHT_GEO_OVERLAY_LAYER_IDS.aircraftOutline,
      type: 'fill',
      source: FLIGHT_GEO_OVERLAY_SOURCE_ID,
      filter: ['==', ['get', 'kgFlightOverlayKind'], 'aircraft'],
      paint: {
        'fill-color': [
          'case',
          FLIGHT_GEO_NIGHT_EXPRESSION,
          '#312e81',
          '#0f172a',
        ],
        'fill-opacity': 0.88,
        'fill-translate': [0, 2],
        'fill-translate-anchor': 'viewport',
      },
    })
    addLayerOnce(map, {
      id: FLIGHT_GEO_OVERLAY_LAYER_IDS.aircraft,
      type: 'symbol',
      source: FLIGHT_GEO_OVERLAY_SOURCE_ID,
      filter: ['==', ['get', 'kgFlightOverlayKind'], 'aircraft'],
      layout: {
        'icon-allow-overlap': true,
        'icon-ignore-placement': true,
        'icon-image': [
          'case',
          FLIGHT_GEO_NIGHT_EXPRESSION,
          FLIGHT_GEO_AIRCRAFT_IMAGE_IDS.night,
          FLIGHT_GEO_AIRCRAFT_IMAGE_IDS.day,
        ],
        'icon-pitch-alignment': 'viewport',
        'icon-rotate': ['get', 'headingDegrees'],
        'icon-rotation-alignment': 'map',
        'icon-size': 1,
      },
    })
    keepFlightGeoOverlayAboveHostLayers(map)
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
    clearGeoJsonSourceData(map, FLIGHT_GEO_OVERLAY_SOURCE_ID)
    return true
  } catch {
    return false
  }
}
