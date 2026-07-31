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
import {
  promoteMapLibreFlightProviderStyle,
  type MapLibreFlightProviderPromotionState,
} from '../../../gympgrph/src/features/geospatial/mapLibreFlightProviderPromotion'

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
        color: '#d8e2e8',
        heightMeters: 3.6,
        id: 'provider-style-handoff:structure',
        kind: 'structure',
        label: 'Provider style handoff structure',
        poiId: null,
        regionalPoiSourceFacts: null,
        rings: [ring],
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
    presentationOwner: 'flight',
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
    3.6,
    'the authored Marina Bay Sands tower survives the handoff unchanged',
  )
})

test('provider promotion atomically applies the exact full Flight style and rejects same-identity mutations', async () => {
  const overlay = exactOverlay()
  const previousStyle = {
    version: 8,
    sources: {
      [FLIGHT_GEO_ENVIRONMENT_SOURCE_ID]: {
        data: flightGeoEnvironmentMapLibreFeatureCollection(overlay),
        type: 'geojson',
      },
      [FLIGHT_GEO_OVERLAY_SOURCE_ID]: {
        data: flightGeoOverlayMapLibreFeatureCollection(overlay),
        type: 'geojson',
      },
    },
    layers: [
      { id: 'kg-flight-sim:geo-bootstrap-background', type: 'background' },
      ...exactEnvironmentLayers(),
      ...exactOverlayLayers(),
    ],
  }
  const providerStyle = {
    version: 8,
    sources: { provider: { type: 'vector' } },
    layers: [{ id: 'provider-background', type: 'background' }],
  }
  let activePreviousStyle: Record<string, any> = previousStyle
  const applied: Array<{
    options: Record<string, unknown>
    style: Record<string, any>
  }> = []
  let appliedMarkers = 0
  const state: MapLibreFlightProviderPromotionState = {
    cancelProviderStyleApply: null,
    cancelProviderStyleLoad: null,
    disposed: false,
    generation: 1,
    map: {
      getStyle: () => activePreviousStyle,
      setStyle: (
        style: Record<string, any>,
        options: Record<string, unknown>,
      ) => applied.push({ options, style }),
    },
  }
  const promote = () => promoteMapLibreFlightProviderStyle({
    generation: state.generation,
    hasCurrentStyleOwnership: () => true,
    hasExactFlightOverlay: () => true,
    loadProviderStyle: async () => providerStyle,
    onApplied: () => {
      appliedMarkers += 1
    },
    retainFlightOverlay: (previous, next) =>
      retainFlightGeoOverlayDuringStyleSwap(
        previous,
        next,
        overlay,
        '3d',
      ),
    retainOverlay: true,
    scheduleProviderApply: apply => {
      apply()
      return () => void 0
    },
    state,
  })

  assert.equal(await promote(), 'applied')
  assert.equal(appliedMarkers, 1)
  assert.equal(applied.length, 1)
  assert.deepEqual(applied[0]!.options, { diff: true })
  assert.equal('transformStyle' in applied[0]!.options, false)
  assert.deepEqual(
    applied[0]!.style.layers.map((layer: { id: string }) => layer.id),
    [
      'provider-background',
      ...FLIGHT_GEO_ENVIRONMENT_LAYER_ORDER,
      ...FLIGHT_GEO_OVERLAY_LAYER_ORDER,
    ],
  )
  assert.deepEqual(
    applied[0]!.style.sources[FLIGHT_GEO_ENVIRONMENT_SOURCE_ID],
    previousStyle.sources[FLIGHT_GEO_ENVIRONMENT_SOURCE_ID],
  )
  assert.deepEqual(
    applied[0]!.style.sources[FLIGHT_GEO_OVERLAY_SOURCE_ID],
    previousStyle.sources[FLIGHT_GEO_OVERLAY_SOURCE_ID],
  )

  const mutatedPreviousStyle = structuredClone(previousStyle)
  const mutatedEnvironment =
    mutatedPreviousStyle.sources[
      FLIGHT_GEO_ENVIRONMENT_SOURCE_ID
    ].data as any
  mutatedEnvironment.features[0].geometry.coordinates[0][0][0] += 0.0001
  mutatedEnvironment.features[0].properties.kgHeightMeters = 120
  activePreviousStyle = mutatedPreviousStyle
  state.generation += 1
  applied.length = 0
  appliedMarkers = 0

  assert.equal(await promote(), 'admission-changed')
  assert.deepEqual(applied, [])
  assert.equal(appliedMarkers, 0)
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
  assert.equal(
    retainFlightGeoOverlayDuringStyleSwap({
      version: 8,
      sources,
      layers: mutatedEnvironmentLayers,
    }, nextStyle, overlay, '3d'),
    null,
    'a mutated environment rejects the provider transaction',
  )

  const polygonOutlineLayers = exactOverlayLayers().map(layer => (
    layer.id === FLIGHT_GEO_OVERLAY_LAYER_IDS.aircraftOutline
      ? { ...layer, layout: undefined, type: 'fill' }
      : layer
  ))
  assert.equal(
    retainFlightGeoOverlayDuringStyleSwap({
      version: 8,
      sources,
      layers: polygonOutlineLayers,
    }, nextStyle, overlay, '3d'),
    null,
    'a mutated overlay rejects the provider transaction',
  )
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

    assert.equal(
      rejected,
      null,
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
  assert.equal(
    retainFlightGeoOverlayDuringStyleSwap({
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
    }, nextStyle, overlay, '3d'),
    null,
    'a partial environment rejects the provider transaction',
  )
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
    assert.equal(rejected, null, `${label} must reject provider admission`)
  }

  const hiddenAircraftLayers = exactLayers.map(layer => (
    layer.id === FLIGHT_GEO_OVERLAY_LAYER_IDS.aircraft
      ? { ...layer, layout: { ...layer.layout, visibility: 'none' } }
      : layer
  ))
  assert.equal(
    retainFlightGeoOverlayDuringStyleSwap({
      version: 8,
      sources: exactSources,
      layers: hiddenAircraftLayers,
    }, nextStyle, overlay, '3d'),
    null,
  )
  assert.equal(
    retainFlightGeoOverlayDuringStyleSwap({
      version: 8,
      sources: exactSources,
      layers: [
        ...exactEnvironmentLayers('2d'),
        ...exactOverlayLayers(),
      ],
    }, nextStyle, overlay, '3d'),
    null,
  )
})
