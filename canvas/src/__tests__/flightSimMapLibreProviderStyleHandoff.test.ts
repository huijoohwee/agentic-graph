import test from 'node:test'
import assert from 'node:assert/strict'
import {
  flightGeoOverlayMapLibreFeatureCollection,
  FLIGHT_GEO_OVERLAY_LAYER_DEFINITIONS,
  FLIGHT_GEO_OVERLAY_LAYER_IDS,
  FLIGHT_GEO_OVERLAY_LAYER_ORDER,
  FLIGHT_GEO_OVERLAY_SOURCE_ID,
  retainFlightGeoOverlayDuringStyleSwap,
} from '../../../gympgrph/src/flightGeoOverlayMapLibre'
import {
  flightGeoEnvironmentMapLibreFeatureCollection,
  FLIGHT_GEO_ENVIRONMENT_LAYER_DEFINITIONS,
  FLIGHT_GEO_ENVIRONMENT_LAYER_IDS,
  FLIGHT_GEO_ENVIRONMENT_LAYER_ORDER,
  FLIGHT_GEO_ENVIRONMENT_SOURCE_ID,
} from '../../../gympgrph/src/flightGeoEnvironmentMapLibre'
import type {
  FlightGeoOverlaySnapshot,
} from '../../../gympgrph/src/flightGeoOverlay'

function exactOverlay(): FlightGeoOverlaySnapshot {
  const ring = [
    [103.8518, 1.2901],
    [103.852, 1.2901],
    [103.852, 1.2903],
    [103.8518, 1.2903],
    [103.8518, 1.2901],
  ] as const
  return {
    active: true,
    aircraft: {
      altitudeMeters: 110,
      coordinate: [103.8519, 1.2902],
      headingDegrees: 0,
    },
    camera: {
      centerCoordinate: [103.8519, 1.2902],
      cockpitClearance: { forwardMeters: 2, verticalMeters: 1 },
      effectiveOwner: 'fixed-follow',
      source: 'fixed-follow',
      timeline: null,
      view: 'chase',
    },
    environment: {
      anchor: [103.8519, 1.2902],
      id: 'singapore',
      label: 'Singapore',
      presentationBounds: [[103.8518, 1.2901], [103.852, 1.2903]],
      revision: 'environment:exact',
      stageFootprint: ring,
      surfaces: [{
        baseHeightMeters: 0,
        color: '#64748b',
        heightMeters: 12,
        id: 'skyline-center',
        kind: 'structure',
        ring,
      }],
    },
    night: false,
    objective: {
      bearingDegrees: 45,
      coordinate: [103.852, 1.2903],
      distanceMeters: 110,
      headingErrorDegrees: 45,
      id: 'waypoint-1',
      kind: 'waypoint',
      label: 'WP1',
    },
    phase: 'stopped',
    profileId: 'singapore',
    readyFrameRequestId: null,
    revision: 'stopped:exact',
    route: [{
      altitudeMeters: 110,
      coordinate: [103.8519, 1.2902],
      id: 'spawn',
      kind: 'spawn',
      state: 'visited',
    }, {
      altitudeMeters: 110,
      coordinate: [103.852, 1.2903],
      id: 'waypoint-1',
      kind: 'waypoint',
      state: 'active',
    }],
    runId: 0,
    tick: 0,
  }
}

function exactEnvironmentLayers(
  viewMode: '2d' | '3d' = '3d',
): Record<string, any>[] {
  const hiddenLayerId = viewMode === '3d'
    ? FLIGHT_GEO_ENVIRONMENT_LAYER_IDS.fill2d
    : FLIGHT_GEO_ENVIRONMENT_LAYER_IDS.extrusion3d
  return FLIGHT_GEO_ENVIRONMENT_LAYER_DEFINITIONS.map(layer => ({
    ...layer,
    ...(layer.id === hiddenLayerId
      ? { layout: { visibility: 'none' } }
      : {}),
  }))
}

function exactOverlayLayers(): Record<string, any>[] {
  return FLIGHT_GEO_OVERLAY_LAYER_DEFINITIONS.map(layer => ({ ...layer }))
}

test('provider-style handoff retains the complete Flight environment below its route and aircraft', () => {
  const overlay = exactOverlay()
  const environmentSource = {
    data: flightGeoEnvironmentMapLibreFeatureCollection(overlay),
    type: 'geojson',
  }
  const overlaySource = {
    data: flightGeoOverlayMapLibreFeatureCollection(overlay),
    type: 'geojson',
  }
  const environmentLayers = exactEnvironmentLayers()
  const overlayLayers = exactOverlayLayers()
  const previousStyle = {
    version: 8,
    sources: {
      [FLIGHT_GEO_ENVIRONMENT_SOURCE_ID]: environmentSource,
      [FLIGHT_GEO_OVERLAY_SOURCE_ID]: overlaySource,
    },
    layers: [
      { id: 'kg-flight-sim:geo-bootstrap-background', type: 'background' },
      ...environmentLayers,
      ...overlayLayers,
    ],
  }
  const nextStyle = {
    version: 8,
    sources: { provider: { type: 'vector' } },
    layers: [
      { id: 'provider-background', type: 'background' },
      { id: FLIGHT_GEO_ENVIRONMENT_LAYER_ORDER[0], type: 'fill' },
      { id: FLIGHT_GEO_OVERLAY_LAYER_ORDER[0], type: 'line' },
    ],
  }

  const promoted = retainFlightGeoOverlayDuringStyleSwap(
    previousStyle,
    nextStyle,
    overlay,
    '3d',
  )

  assert.equal(promoted.sources[FLIGHT_GEO_ENVIRONMENT_SOURCE_ID], environmentSource)
  assert.equal(promoted.sources[FLIGHT_GEO_OVERLAY_SOURCE_ID], overlaySource)
  assert.equal(promoted.sources.provider.type, 'vector')
  assert.deepEqual(
    promoted.layers.map((layer: { id: string }) => layer.id),
    [
      'provider-background',
      ...FLIGHT_GEO_ENVIRONMENT_LAYER_ORDER,
      ...FLIGHT_GEO_OVERLAY_LAYER_ORDER,
    ],
  )
  assert.equal(
    promoted.sources[FLIGHT_GEO_ENVIRONMENT_SOURCE_ID].data.features[0].properties.kgHeightMeters,
    12,
    'the authored 12m skyline survives the handoff unchanged',
  )
})

test('provider-style handoff refuses mutated extrusion and polygon-outline layers', () => {
  const overlay = exactOverlay()
  const nextStyle = {
    version: 8,
    sources: { provider: { type: 'vector' } },
    layers: [{ id: 'provider-background', type: 'background' }],
  }
  const sources = {
    [FLIGHT_GEO_ENVIRONMENT_SOURCE_ID]: {
      type: 'geojson',
      data: flightGeoEnvironmentMapLibreFeatureCollection(overlay),
    },
    [FLIGHT_GEO_OVERLAY_SOURCE_ID]: {
      type: 'geojson',
      data: flightGeoOverlayMapLibreFeatureCollection(overlay),
    },
  }
  const mutatedEnvironmentLayers = exactEnvironmentLayers().map(layer => (
    layer.id === FLIGHT_GEO_ENVIRONMENT_LAYER_IDS.extrusion3d
      ? {
          ...layer,
          paint: {
            ...layer.paint,
            'fill-extrusion-height': ['get', 'kgHeightMeters'],
          },
        }
      : layer
  ))
  const environmentRejected = retainFlightGeoOverlayDuringStyleSwap({
    version: 8,
    sources,
    layers: mutatedEnvironmentLayers,
  }, nextStyle, overlay, '3d')
  assert.equal(
    environmentRejected.sources[FLIGHT_GEO_ENVIRONMENT_SOURCE_ID],
    undefined,
  )
  assert.equal(
    environmentRejected.sources[FLIGHT_GEO_OVERLAY_SOURCE_ID],
    undefined,
    'a mutated environment rejects the complete Flight composition',
  )
  assert.deepEqual(environmentRejected.layers, nextStyle.layers)

  const polygonOutlineLayers = exactOverlayLayers().map(layer => (
    layer.id === FLIGHT_GEO_OVERLAY_LAYER_IDS.aircraftOutline
      ? { ...layer, layout: undefined, type: 'fill' }
      : layer
  ))
  const outlineRejected = retainFlightGeoOverlayDuringStyleSwap({
    version: 8,
    sources,
    layers: polygonOutlineLayers,
  }, nextStyle, overlay, '3d')
  assert.equal(
    outlineRejected.sources[FLIGHT_GEO_OVERLAY_SOURCE_ID],
    undefined,
  )
  assert.equal(
    outlineRejected.sources[FLIGHT_GEO_ENVIRONMENT_SOURCE_ID],
    undefined,
    'a mutated overlay rejects the complete Flight composition',
  )
  assert.deepEqual(outlineRejected.layers, nextStyle.layers)
})

test('provider-style handoff refuses same-identity source payload mutations', () => {
  const overlay = exactOverlay()
  const exactEnvironment =
    flightGeoEnvironmentMapLibreFeatureCollection(overlay)
  const exactFlight = flightGeoOverlayMapLibreFeatureCollection(overlay)
  const nextStyle = {
    version: 8,
    sources: { provider: { type: 'vector' } },
    layers: [{ id: 'provider-background', type: 'background' }],
  }
  const mutatedEnvironment = structuredClone(exactEnvironment)
  const mutatedEnvironmentProperties =
    mutatedEnvironment.features[0]!.properties as Record<string, unknown>
  mutatedEnvironmentProperties.kgHeightMeters = 13
  const mutatedFlight = structuredClone(exactFlight)
  const mutatedRouteGeometry = mutatedFlight.features[0]!.geometry
  assert.equal(mutatedRouteGeometry.type, 'LineString')
  if (mutatedRouteGeometry.type !== 'LineString') {
    throw new Error('Expected the first Flight feature to be the route.')
  }
  mutatedRouteGeometry.coordinates[0]![0] += 0.001

  for (const [label, environmentData, flightData] of [
    ['environment height', mutatedEnvironment, exactFlight],
    ['Flight coordinate', exactEnvironment, mutatedFlight],
  ] as const) {
    const rejected = retainFlightGeoOverlayDuringStyleSwap({
      version: 8,
      sources: {
        [FLIGHT_GEO_ENVIRONMENT_SOURCE_ID]: {
          type: 'geojson',
          data: environmentData,
        },
        [FLIGHT_GEO_OVERLAY_SOURCE_ID]: {
          type: 'geojson',
          data: flightData,
        },
      },
      layers: [
        ...exactEnvironmentLayers(),
        ...exactOverlayLayers(),
      ],
    }, nextStyle, overlay, '3d')

    assert.deepEqual(
      rejected,
      nextStyle,
      `${label} mutation rejects the complete provider handoff`,
    )
  }
})

test('provider-style handoff refuses a partial environment stack', () => {
  const overlay = exactOverlay()
  const nextStyle = {
    version: 8,
    sources: { provider: { type: 'vector' } },
    layers: [{ id: 'provider-background', type: 'background' }],
  }
  const promoted = retainFlightGeoOverlayDuringStyleSwap({
    version: 8,
    sources: {
      [FLIGHT_GEO_ENVIRONMENT_SOURCE_ID]: {
        type: 'geojson',
        data: flightGeoEnvironmentMapLibreFeatureCollection(overlay),
      },
    },
    layers: FLIGHT_GEO_ENVIRONMENT_LAYER_ORDER
      .slice(0, -1)
      .map(id => ({ id, source: FLIGHT_GEO_ENVIRONMENT_SOURCE_ID })),
  }, nextStyle, overlay, '3d')

  assert.equal(
    promoted.sources[FLIGHT_GEO_ENVIRONMENT_SOURCE_ID],
    undefined,
    'a later exact application must rebuild instead of retaining stale fragments',
  )
  assert.deepEqual(promoted.layers, nextStyle.layers)
})

test('provider-style handoff refuses mutated source options and layer visibility', () => {
  const overlay = exactOverlay()
  const nextStyle = {
    version: 8,
    sources: { provider: { type: 'vector' } },
    layers: [{ id: 'provider-background', type: 'background' }],
  }
  const exactSources = {
    [FLIGHT_GEO_ENVIRONMENT_SOURCE_ID]: {
      type: 'geojson',
      data: flightGeoEnvironmentMapLibreFeatureCollection(overlay),
    },
    [FLIGHT_GEO_OVERLAY_SOURCE_ID]: {
      type: 'geojson',
      data: flightGeoOverlayMapLibreFeatureCollection(overlay),
    },
  }
  const exactLayers = [
    ...exactEnvironmentLayers(),
    ...exactOverlayLayers(),
  ]
  for (const [label, sources] of [
    ['clustered overlay', {
      ...exactSources,
      [FLIGHT_GEO_OVERLAY_SOURCE_ID]: {
        ...exactSources[FLIGHT_GEO_OVERLAY_SOURCE_ID],
        cluster: true,
      },
    }],
    ['generated environment ids', {
      ...exactSources,
      [FLIGHT_GEO_ENVIRONMENT_SOURCE_ID]: {
        ...exactSources[FLIGHT_GEO_ENVIRONMENT_SOURCE_ID],
        generateId: true,
      },
    }],
  ] as const) {
    const rejected = retainFlightGeoOverlayDuringStyleSwap({
      version: 8,
      sources,
      layers: exactLayers,
    }, nextStyle, overlay, '3d')
    assert.deepEqual(rejected, nextStyle, `${label} must not be retained`)
  }

  const hiddenAircraftLayers = exactLayers.map(layer => (
    layer.id === FLIGHT_GEO_OVERLAY_LAYER_IDS.aircraft
      ? { ...layer, layout: { ...layer.layout, visibility: 'none' } }
      : layer
  ))
  assert.deepEqual(
    retainFlightGeoOverlayDuringStyleSwap({
      version: 8,
      sources: exactSources,
      layers: hiddenAircraftLayers,
    }, nextStyle, overlay, '3d'),
    nextStyle,
  )
  assert.deepEqual(
    retainFlightGeoOverlayDuringStyleSwap({
      version: 8,
      sources: exactSources,
      layers: [
        ...exactEnvironmentLayers('2d'),
        ...exactOverlayLayers(),
      ],
    }, nextStyle, overlay, '3d'),
    nextStyle,
  )
})
