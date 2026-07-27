import test from 'node:test'
import assert from 'node:assert/strict'
import {
  clearFlightGeoOverlay,
  flightGeoOverlayFeatureCollection,
  readFlightGeoOverlay,
  setFlightGeoOverlay,
  subscribeFlightGeoOverlay,
  type FlightGeoOverlayPresentation,
  type FlightGeoOverlaySnapshot,
} from '../../../gympgrph/src/flightGeoOverlay'
import {
  createFlightGeoOverlayPresentationGate,
} from '../../../gympgrph/src/features/geospatial/useFlightGeoOverlayMapLibrePresentation'
import {
  applyFlightGeoOverlayToMap,
  FLIGHT_GEO_OVERLAY_LAYER_IDS,
  FLIGHT_GEO_OVERLAY_SOURCE_ID,
  retainFlightGeoOverlayDuringStyleSwap,
} from '../../../gympgrph/src/flightGeoOverlayMapLibre'
import {
  beginFlightSimReadyFrame,
  cancelCurrentFlightSimReadyFrame,
  completeFlightSimMapLibreReadyFrame,
  coordinateFlightSimReadyPublication,
  isFlightSimReadyFramePresentationPending,
  readCurrentFlightSimReadyFrameRequestId,
  readFlightSimDeadlineSnapshot,
  resetFlightSimDeadlineRuntimeForTests,
} from '../features/game-flight-sim/flightSimDeadlineRuntime'
import { createFlightSimRuntime } from '../features/game-flight-sim/flightSimRuntime'
import {
  FLIGHT_SIM_MIN_CAPTURE_RADIUS_METERS,
  type FlightSimSpatialProfile,
} from '../features/game-flight-sim/flightSimModel'
import {
  projectFlightSimToGeospatialOverlay,
} from '../features/game-flight-sim/flightSimGeospatialProjection'

function flightOverlay(
  phase: FlightGeoOverlaySnapshot['phase'],
  revision: string,
  readyFrameRequestId: number | null = phase === 'ready' ? 1 : null,
): FlightGeoOverlaySnapshot {
  return {
    active: true,
    aircraft: {
      coordinate: [103.82, 1.35],
      altitudeMeters: 400,
      headingDegrees: 0,
    },
    camera: {
      centerCoordinate: [103.82, 1.35],
      cockpitClearance: {
        forwardMeters: 2,
        verticalMeters: 1,
      },
      effectiveOwner: 'fixed-follow',
      source: 'fixed-follow',
      timeline: null,
      view: 'chase',
    },
    night: false,
    phase,
    profileId: 'singapore',
    readyFrameRequestId,
    revision,
    route: [
      {
        id: 'spawn',
        coordinate: [103.82, 1.35],
        altitudeMeters: 400,
        kind: 'spawn',
        state: 'visited',
      },
      {
        id: 'landing',
        coordinate: [103.83, 1.36],
        altitudeMeters: 0,
        kind: 'landing',
        state: 'active',
      },
    ],
    runId: phase === 'stopped' ? 0 : 1,
    tick: 0,
  }
}

function presentationHarness(
  initial: FlightGeoOverlaySnapshot,
  afterPresented?: (presentation: FlightGeoOverlayPresentation) => void,
) {
  let current = initial
  let width = 0
  let repaintCount = 0
  let sourceData = flightGeoOverlayFeatureCollection(initial)
  const listeners = new Set<() => void>()
  const canvas = {
    dataset: {} as DOMStringMap,
    getBoundingClientRect: () => ({
      bottom: 100,
      height: 100,
      left: 0,
      right: width,
      top: 0,
      width,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    }),
  }
  const map = {
    style: { _loaded: true },
    getCanvas: () => canvas,
    getLayer: (id: string) => (
      Object.values(FLIGHT_GEO_OVERLAY_LAYER_IDS).some(layerId => layerId === id)
        ? { id }
        : undefined
    ),
    getSource: (id: string) => (
      id === FLIGHT_GEO_OVERLAY_SOURCE_ID
        ? {
            id,
            serialize: () => ({ data: sourceData }),
            setData: (data: ReturnType<typeof flightGeoOverlayFeatureCollection>) => {
              sourceData = data
            },
          }
        : undefined
    ),
    getStyle: () => ({
      layers: Object.values(FLIGHT_GEO_OVERLAY_LAYER_IDS).map(id => ({ id })),
    }),
    moveLayer: () => undefined,
    off: (type: string, listener: () => void) => {
      if (type === 'render') listeners.delete(listener)
    },
    on: (type: string, listener: () => void) => {
      if (type === 'render') listeners.add(listener)
    },
    triggerRepaint: () => {
      repaintCount += 1
    },
  }
  const presentations: FlightGeoOverlayPresentation[] = []
  const presented = {
    current: {
      map: null,
      readyFrameRequestId: null,
      revision: '',
    },
  }
  const gate = createFlightGeoOverlayPresentationGate({
    active: () => true,
    isCanvasElement: (value): value is HTMLCanvasElement => value === canvas,
    map,
    onPresented: presentation => {
      presentations.push(presentation)
      afterPresented?.(presentation)
    },
    presented,
    readOverlay: () => current,
    readRoot: () => null,
  })
  return {
    canvas,
    emitRender: () => {
      for (const listener of [...listeners]) listener()
    },
    gate,
    map,
    listenerCount: () => listeners.size,
    presentedRevision: () => presented.current.revision,
    presentations,
    repaintCount: () => repaintCount,
    replaceSourceData: (next: FlightGeoOverlaySnapshot | null) => {
      sourceData = next
        ? flightGeoOverlayFeatureCollection(next)
        : { type: 'FeatureCollection', features: [] }
    },
    setCurrent: (next: FlightGeoOverlaySnapshot) => {
      current = next
      sourceData = flightGeoOverlayFeatureCollection(next)
    },
    setWidth: (next: number) => {
      width = next
    },
  }
}

function runtimeProfile(): FlightSimSpatialProfile {
  const radiusMeters = FLIGHT_SIM_MIN_CAPTURE_RADIUS_METERS
  return Object.freeze({
    id: 'flight-sim:maplibre-ready-order',
    sourceKey: 'authored:maplibre-ready-order',
    aircraftHalfSize: Object.freeze([0.5, 0.5, 0.5] as const),
    spawn: Object.freeze({
      position: Object.freeze([0, 20, 0] as const),
      velocity: Object.freeze([0, 0, -10] as const),
      pitch: 0,
      roll: 0,
      yaw: 0,
      throttle: 0.6,
    }),
    blockers: Object.freeze([]),
    waypoints: Object.freeze([
      ...[1, 2, 3].map(index => Object.freeze({
        id: `waypoint-${index}`,
        position: Object.freeze([0, 20, -200 * index] as const),
        radiusMeters,
      })),
    ]),
    landingPad: Object.freeze({
      id: 'landing-pad',
      position: Object.freeze([0, 0, -400] as const),
      radiusMeters,
    }),
  })
}

test('native MapLibre presents ready tick zero before expensive store followers', async context => {
  resetFlightSimDeadlineRuntimeForTests()
  let clockMs = 0
  const events: string[] = []
  const initial = flightOverlay('stopped', 'stopped:0', null)
  const harness = presentationHarness(initial, presentation => {
    if (
      presentation.phase === 'ready'
      && presentation.readyFrameRequestId !== null
    ) {
      completeFlightSimMapLibreReadyFrame(
        presentation.readyFrameRequestId,
        presentation.runId,
        presentation.tick,
        () => clockMs,
      )
    }
  })
  harness.setWidth(100)
  const spatialProfile = runtimeProfile()
  const releaseOverlay = subscribeFlightGeoOverlay(() => {
    const overlay = readFlightGeoOverlay()
    harness.setCurrent(overlay)
    assert.equal(applyFlightGeoOverlayToMap(harness.map, overlay), true)
    harness.gate.request(overlay)
  })
  context.after(() => {
    releaseOverlay()
    clearFlightGeoOverlay()
    resetFlightSimDeadlineRuntimeForTests()
  })
  const runtime = createFlightSimRuntime({
    profile: spatialProfile,
    active: true,
    webglSupported: true,
    cancelReadyPublication: cancelCurrentFlightSimReadyFrame,
    coordinateReadyPublication: coordinateFlightSimReadyPublication,
  })
  runtime.subscribePresenter('maplibre', () => {
    const snapshot = runtime.read()
    const requestId = readCurrentFlightSimReadyFrameRequestId()
    assert.notEqual(requestId, null)
    assert.equal(
      isFlightSimReadyFramePresentationPending(snapshot.runId, snapshot.tick),
      true,
    )
    setFlightGeoOverlay(projectFlightSimToGeospatialOverlay(
      snapshot,
      spatialProfile,
      { source: 'fixed-follow', view: 'chase' },
      false,
      requestId,
    ))
    events.push('maplibre')
  })
  runtime.subscribePresenter('surface', () => {
    events.push('surface')
  })
  runtime.subscribe(() => {
    clockMs += 336
    events.push('follower')
  })

  const requestId = beginFlightSimReadyFrame(() => clockMs)
  const ready = runtime.start()
  assert.equal(ready.phase, 'ready')
  assert.deepEqual(events, ['maplibre'])
  assert.equal(clockMs, 0)
  assert.equal(harness.listenerCount(), 1)
  assert.ok(harness.repaintCount() > 0)

  clockMs = 16
  harness.emitRender()
  const observation = readFlightSimDeadlineSnapshot().readyFrame
  assert.equal(observation?.source, 'native-maplibre-flight-ready-frame')
  assert.equal(observation?.elapsedMs, 16)
  assert.equal(observation?.withinLimit, true)
  assert.equal(observation?.runId, ready.runId)
  assert.equal(observation?.tick, ready.tick)
  assert.equal(readCurrentFlightSimReadyFrameRequestId(), null)
  assert.equal(requestId, harness.presentations.at(-1)?.readyFrameRequestId)
  assert.equal(harness.listenerCount(), 0)
  assert.equal(
    harness.presentedRevision(),
    `${ready.runId}:${ready.tick}:ready:0:${spatialProfile.id}:fixed-follow:chase:operator:day`,
  )
  assert.equal(harness.canvas.dataset.kgFlightSimFirstFrame, '1')
  assert.deepEqual(events, ['maplibre'])
  await Promise.resolve()
  assert.deepEqual(events, ['maplibre', 'surface', 'follower'])
  assert.equal(clockMs, 352)
})

test('same-revision stopped presentation can acknowledge a fresh preparation', () => {
  const stopped = flightOverlay('stopped', 'same-stopped-revision')
  const harness = presentationHarness(stopped)
  harness.setWidth(100)

  harness.gate.request(stopped)
  harness.emitRender()
  assert.equal(harness.presentations.length, 1)

  harness.gate.request(stopped)
  assert.equal(harness.listenerCount(), 1)
  harness.emitRender()
  assert.equal(harness.presentations.length, 2)
})

test('a fresh ready-frame request re-arms the same deterministic revision', () => {
  const priorReady = flightOverlay('ready', 'same-ready-revision', 1)
  const harness = presentationHarness(priorReady)
  harness.setWidth(100)

  harness.gate.request(priorReady)
  harness.emitRender()
  assert.equal(harness.presentations.at(-1)?.readyFrameRequestId, 1)

  const stopped = flightOverlay('stopped', 'stopped-revision')
  harness.setCurrent(stopped)
  harness.gate.request(stopped)
  assert.equal(harness.listenerCount(), 1)

  const freshReady = flightOverlay('ready', 'same-ready-revision', 2)
  harness.setCurrent(freshReady)
  harness.gate.request(freshReady)
  assert.equal(harness.listenerCount(), 1)
  harness.emitRender()

  assert.equal(harness.presentations.length, 2)
  assert.equal(harness.presentations.at(-1)?.readyFrameRequestId, 2)
})

test('transient invalid first render retries before exact MapLibre acknowledgement', () => {
  const ready = flightOverlay('ready', 'ready:1:0')
  const harness = presentationHarness(ready)

  harness.gate.request(ready)
  harness.emitRender()
  assert.equal(harness.presentations.length, 0)
  assert.equal(harness.listenerCount(), 1)
  assert.ok(harness.repaintCount() >= 2)

  harness.setWidth(100)
  harness.emitRender()
  assert.equal(harness.listenerCount(), 0)
  assert.equal(harness.presentations.length, 1)
  assert.equal(harness.canvas.dataset.kgFlightSimFirstFrameSurface, 'maplibre')
  assert.equal(harness.canvas.dataset.kgFlightSimFirstFrame, '1')
})

test('retained layers with stale empty data cannot acknowledge a ready frame', () => {
  const ready = flightOverlay('ready', 'ready:exact-source')
  const harness = presentationHarness(ready)
  harness.setWidth(100)
  harness.replaceSourceData(null)

  harness.gate.request(ready)
  harness.emitRender()
  assert.equal(harness.presentations.length, 0)
  assert.equal(harness.listenerCount(), 1)
  assert.equal(harness.canvas.dataset.kgFlightSimFirstFrame, undefined)

  harness.replaceSourceData(ready)
  harness.emitRender()
  assert.equal(harness.presentations.length, 1)
  assert.equal(harness.canvas.dataset.kgFlightSimFirstFrame, '1')
})

test('aircraft marker uses one provider-served glyph stack and retains heading rotation', () => {
  type LayerDefinition = {
    id: unknown
    layout?: Record<string, unknown>
    type?: unknown
  }
  const sources = new Map<string, { _data: unknown; setData: (data: unknown) => void }>()
  const layers = new Map<string, LayerDefinition>()
  const map = {
    style: { _loaded: true },
    addLayer: (layer: LayerDefinition) => {
      layers.set(String(layer.id), layer)
    },
    addSource: (id: string, source: { data: unknown }) => {
      const stored = {
        _data: source.data,
        serialize: () => ({ data: stored._data }),
        setData(data: unknown) {
          stored._data = data
        },
      }
      sources.set(id, stored)
    },
    getLayer: (id: string) => layers.get(id),
    getSource: (id: string) => sources.get(id),
    getStyle: () => ({ layers: [...layers.values()] }),
    moveLayer: () => void 0,
  }
  const overlay = flightOverlay('ready', 'ready:provider-glyph')

  assert.equal(applyFlightGeoOverlayToMap(map, overlay), true)
  const aircraft = layers.get(FLIGHT_GEO_OVERLAY_LAYER_IDS.aircraft)
  assert.equal(aircraft?.type, 'symbol')
  assert.equal(aircraft?.layout?.['text-field'], '▲')
  assert.deepEqual(aircraft?.layout?.['text-font'], ['Noto Sans Regular'])
  assert.deepEqual(
    aircraft?.layout?.['text-rotate'],
    ['get', 'headingDegrees'],
  )
})

test('provider promotion retains the exact Flight source and ordered layers', () => {
  const source = {
    data: {
      type: 'FeatureCollection',
      features: [{ id: 'aircraft' }],
    },
    type: 'geojson',
  }
  const flightLayers = [
    FLIGHT_GEO_OVERLAY_LAYER_IDS.route,
    FLIGHT_GEO_OVERLAY_LAYER_IDS.routePoints,
    FLIGHT_GEO_OVERLAY_LAYER_IDS.aircraftOutline,
    FLIGHT_GEO_OVERLAY_LAYER_IDS.aircraft,
  ].map(id => ({ id, source: FLIGHT_GEO_OVERLAY_SOURCE_ID }))
  const previousStyle = {
    version: 8,
    sources: {
      [FLIGHT_GEO_OVERLAY_SOURCE_ID]: source,
    },
    layers: [
      { id: 'kg-flight-sim:geo-bootstrap-background', type: 'background' },
      ...flightLayers,
    ],
  }
  const nextStyle = {
    version: 8,
    sources: {
      provider: { type: 'vector' },
    },
    layers: [
      { id: 'provider-background', type: 'background' },
      { id: FLIGHT_GEO_OVERLAY_LAYER_IDS.route, type: 'line' },
    ],
  }

  const promoted = retainFlightGeoOverlayDuringStyleSwap(
    previousStyle,
    nextStyle,
  )

  assert.equal(
    promoted.sources[FLIGHT_GEO_OVERLAY_SOURCE_ID],
    source,
  )
  assert.equal(promoted.sources.provider.type, 'vector')
  assert.deepEqual(
    promoted.layers.map((layer: { id: string }) => layer.id),
    [
      'provider-background',
      FLIGHT_GEO_OVERLAY_LAYER_IDS.route,
      FLIGHT_GEO_OVERLAY_LAYER_IDS.routePoints,
      FLIGHT_GEO_OVERLAY_LAYER_IDS.aircraftOutline,
      FLIGHT_GEO_OVERLAY_LAYER_IDS.aircraft,
    ],
  )
  assert.equal(previousStyle.layers.length, 5)
  assert.equal(nextStyle.layers.length, 2)
})
