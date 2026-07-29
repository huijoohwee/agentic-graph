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
  outlineDay: `${FLIGHT_GEO_OVERLAY_SOURCE_ID}:aircraft-outline-image-day`,
  outlineNight: `${FLIGHT_GEO_OVERLAY_SOURCE_ID}:aircraft-outline-image-night`,
})

export const FLIGHT_GEO_NIGHT_EXPRESSION = Object.freeze([
  'boolean',
  ['get', 'kgFlightNight'],
  false,
])

export const FLIGHT_GEO_AIRCRAFT_OUTLINE_LAYER = Object.freeze({
  id: FLIGHT_GEO_OVERLAY_LAYER_IDS.aircraftOutline,
  type: 'symbol',
  source: FLIGHT_GEO_OVERLAY_SOURCE_ID,
  filter: ['==', ['get', 'kgFlightOverlayKind'], 'aircraft'],
  layout: Object.freeze({
    'icon-allow-overlap': true,
    'icon-ignore-placement': true,
    'icon-image': [
      'case',
      FLIGHT_GEO_NIGHT_EXPRESSION,
      FLIGHT_GEO_AIRCRAFT_IMAGE_IDS.outlineNight,
      FLIGHT_GEO_AIRCRAFT_IMAGE_IDS.outlineDay,
    ],
    'icon-pitch-alignment': 'viewport',
    'icon-rotate': ['get', 'headingDegrees'],
    'icon-rotation-alignment': 'map',
    'icon-size': 1.2,
  }),
  paint: Object.freeze({
    'icon-opacity': 0.9,
  }),
})
export const FLIGHT_GEO_ROUTE_LAYER = Object.freeze({
  id: FLIGHT_GEO_OVERLAY_LAYER_IDS.route,
  type: 'line',
  source: FLIGHT_GEO_OVERLAY_SOURCE_ID,
  filter: ['==', ['get', 'kgFlightOverlayKind'], 'route'],
  paint: Object.freeze({
    'line-color': [
      'case',
      FLIGHT_GEO_NIGHT_EXPRESSION,
      '#a78bfa',
      '#22d3ee',
    ],
    'line-opacity': 0.88,
    'line-width': 4,
    'line-dasharray': [1.5, 1.25],
  }),
})
export const FLIGHT_GEO_OBJECTIVE_GUIDE_LAYER = Object.freeze({
  id: FLIGHT_GEO_OVERLAY_LAYER_IDS.objectiveGuide,
  type: 'line',
  source: FLIGHT_GEO_OVERLAY_SOURCE_ID,
  filter: ['==', ['get', 'kgFlightOverlayKind'], 'objective-guide'],
  layout: Object.freeze({
    'line-cap': 'round',
    'line-join': 'round',
  }),
  paint: Object.freeze({
    'line-color': [
      'case',
      FLIGHT_GEO_NIGHT_EXPRESSION,
      '#f5d0fe',
      '#fde047',
    ],
    'line-opacity': 0.94,
    'line-width': 3,
    'line-dasharray': [0.75, 1.25],
  }),
})
export const FLIGHT_GEO_ROUTE_POINTS_LAYER = Object.freeze({
  id: FLIGHT_GEO_OVERLAY_LAYER_IDS.routePoints,
  type: 'circle',
  source: FLIGHT_GEO_OVERLAY_SOURCE_ID,
  filter: ['==', ['get', 'kgFlightOverlayKind'], 'route-point'],
  paint: Object.freeze({
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
  }),
})
export const FLIGHT_GEO_AIRCRAFT_LAYER = Object.freeze({
  id: FLIGHT_GEO_OVERLAY_LAYER_IDS.aircraft,
  type: 'symbol',
  source: FLIGHT_GEO_OVERLAY_SOURCE_ID,
  filter: ['==', ['get', 'kgFlightOverlayKind'], 'aircraft'],
  layout: Object.freeze({
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
  }),
})
export const FLIGHT_GEO_OVERLAY_LAYER_DEFINITIONS = Object.freeze([
  FLIGHT_GEO_ROUTE_LAYER,
  FLIGHT_GEO_OBJECTIVE_GUIDE_LAYER,
  FLIGHT_GEO_ROUTE_POINTS_LAYER,
  FLIGHT_GEO_AIRCRAFT_OUTLINE_LAYER,
  FLIGHT_GEO_AIRCRAFT_LAYER,
] as const)

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

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function withoutVisibility(value: unknown): unknown {
  if (!isPlainRecord(value)) return value
  const entries = Object.entries(value)
    .filter(([property]) => property !== 'visibility')
  return entries.length > 0 ? Object.fromEntries(entries) : undefined
}

export function hasExactFlightGeoOverlayStyleLayerDefinition(
  actual: unknown,
  expected: typeof FLIGHT_GEO_OVERLAY_LAYER_DEFINITIONS[number],
): boolean {
  if (!isPlainRecord(actual)) return false
  const expectedLayer = expected as Readonly<Record<string, unknown>>
  return actual.id === expectedLayer.id
    && actual.type === expectedLayer.type
    && actual.source === expectedLayer.source
    && actual['source-layer'] === undefined
    && actual.minzoom === undefined
    && actual.maxzoom === undefined
    && hasExactStyleValue(expectedLayer.filter, actual.filter)
    && hasExactStyleValue(
      withoutVisibility(expectedLayer.layout),
      withoutVisibility(actual.layout),
    )
    && hasExactStyleValue(expectedLayer.paint, actual.paint)
}

export function hasExactFlightGeoOverlayStyleLayerDefinitions(
  layers: readonly unknown[],
): boolean {
  return FLIGHT_GEO_OVERLAY_LAYER_DEFINITIONS.every(expected => (
    hasExactFlightGeoOverlayStyleLayerDefinition(
      layers.find(layer => isPlainRecord(layer) && layer.id === expected.id),
      expected,
    )
  ))
}

export function mapHasExactFlightGeoOverlayLayerDefinitions(map: any): boolean {
  const styleLayers = map?.getStyle?.()?.layers
  if (Array.isArray(styleLayers)) {
    return hasExactFlightGeoOverlayStyleLayerDefinitions(styleLayers)
  }
  return FLIGHT_GEO_OVERLAY_LAYER_DEFINITIONS.every(expected => (
    hasExactFlightGeoOverlayStyleLayerDefinition(
      map?.getLayer?.(expected.id),
      expected,
    )
  ))
}

export function hasExactFlightGeoAircraftOutlineStyleLayer(
  layer: unknown,
): boolean {
  return hasExactFlightGeoOverlayStyleLayerDefinition(
    layer,
    FLIGHT_GEO_AIRCRAFT_OUTLINE_LAYER,
  )
}

export function mapHasExactFlightGeoAircraftOutlineLayer(map: any): boolean {
  const styleLayers = map?.getStyle?.()?.layers
  const layer = Array.isArray(styleLayers)
    ? styleLayers.find(candidate => (
        isPlainRecord(candidate)
        && candidate.id === FLIGHT_GEO_OVERLAY_LAYER_IDS.aircraftOutline
      ))
    : map?.getLayer?.(FLIGHT_GEO_OVERLAY_LAYER_IDS.aircraftOutline)
  return hasExactFlightGeoAircraftOutlineStyleLayer(layer)
}
