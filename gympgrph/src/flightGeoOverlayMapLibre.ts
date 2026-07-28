import { flightGeoOverlayFeatureCollection, type FlightGeoOverlaySnapshot } from './flightGeoOverlay.js'
import { clearGeoJsonSourceData, isMapLibreStyleReady, setGeoJsonSourceData } from './maplibreLayers.js'

export const FLIGHT_GEO_OVERLAY_SOURCE_ID = 'kg-flight-sim:geo-overlay'
export const FLIGHT_GEO_OVERLAY_LAYER_IDS = Object.freeze({
  aircraft: `${FLIGHT_GEO_OVERLAY_SOURCE_ID}:aircraft`,
  aircraftOutline: `${FLIGHT_GEO_OVERLAY_SOURCE_ID}:aircraft-outline`,
  route: `${FLIGHT_GEO_OVERLAY_SOURCE_ID}:route`,
  routePoints: `${FLIGHT_GEO_OVERLAY_SOURCE_ID}:route-points`,
})

const FLIGHT_GEO_OVERLAY_LAYER_ORDER = Object.freeze([
  FLIGHT_GEO_OVERLAY_LAYER_IDS.route,
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

function addLayerOnce(map: any, layer: Record<string, unknown>): void {
  if (map.getLayer?.(layer.id)) return
  try {
    map.addLayer?.(layer)
  } catch {
    void 0
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
): boolean {
  if (typeof map?.jumpTo !== 'function') return false
  try {
    if (
      overlay.camera.effectiveOwner === 'timeline-playback'
      && overlay.camera.timeline
    ) {
      map.jumpTo({
        bearing: overlay.camera.timeline.bearingDegrees,
        center: [...overlay.camera.timeline.centerCoordinate],
        pitch: overlay.camera.timeline.pitchDegrees,
        zoom: overlay.camera.timeline.zoom,
      })
      return true
    }
    if (overlay.camera.source !== 'fixed-follow') return false
    const preset = FLIGHT_GEO_CAMERA_PRESETS[overlay.camera.view]
    map.jumpTo?.({
      bearing: overlay.camera.view === 'survey'
        ? 0
        : overlay.aircraft.headingDegrees,
      center: [...overlay.camera.centerCoordinate],
      pitch: preset.pitch,
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
    setGeoJsonSourceData(
      map,
      FLIGHT_GEO_OVERLAY_SOURCE_ID,
      flightGeoOverlayFeatureCollection(overlay),
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
        'circle-radius': 6,
        'circle-stroke-color': '#0f172a',
        'circle-stroke-width': 2,
      },
    })
    addLayerOnce(map, {
      id: FLIGHT_GEO_OVERLAY_LAYER_IDS.aircraftOutline,
      type: 'circle',
      source: FLIGHT_GEO_OVERLAY_SOURCE_ID,
      filter: ['==', ['get', 'kgFlightOverlayKind'], 'aircraft'],
      paint: {
        'circle-color': [
          'case',
          FLIGHT_GEO_NIGHT_EXPRESSION,
          '#312e81',
          '#0f172a',
        ],
        'circle-opacity': 0.92,
        'circle-radius': 13,
      },
    })
    addLayerOnce(map, {
      id: FLIGHT_GEO_OVERLAY_LAYER_IDS.aircraft,
      type: 'symbol',
      source: FLIGHT_GEO_OVERLAY_SOURCE_ID,
      filter: ['==', ['get', 'kgFlightOverlayKind'], 'aircraft'],
      layout: {
        'text-allow-overlap': true,
        'text-field': '▲',
        'text-font': ['Noto Sans Regular'],
        'text-ignore-placement': true,
        'text-rotate': ['get', 'headingDegrees'],
        'text-rotation-alignment': 'map',
        'text-size': 22,
      },
      paint: {
        'text-color': [
          'case',
          FLIGHT_GEO_NIGHT_EXPRESSION,
          '#c4b5fd',
          '#22d3ee',
        ],
        'text-halo-color': [
          'case',
          FLIGHT_GEO_NIGHT_EXPRESSION,
          '#1e1b4b',
          '#f8fafc',
        ],
        'text-halo-width': 1.5,
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
