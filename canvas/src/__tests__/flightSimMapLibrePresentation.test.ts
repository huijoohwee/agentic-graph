import test from 'node:test'
import assert from 'node:assert/strict'
import {
  clearFlightGeoOverlay,
  flightGeoOverlayFeatureCollection,
  markFlightGeoOverlayReadyFramePresented,
  readFlightGeoOverlay,
  setFlightGeoOverlay,
  subscribeFlightGeoOverlay,
  type FlightGeoOverlayPresentation,
  type FlightGeoOverlaySnapshot,
} from '../../../gympgrph/src/flightGeoOverlay'
import {
  createFlightGeoOverlayPresentationGate,
  FLIGHT_GEO_PREPARATION_RENDER_ATTEMPT_LIMIT,
  FLIGHT_GEO_READY_RENDER_ATTEMPT_LIMIT,
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
    environment: null,
    night: false,
    objective: {
      bearingDegrees: 45,
      coordinate: [103.83, 1.36],
      distanceMeters: 120,
      headingErrorDegrees: 45,
      id: 'landing',
      kind: 'landing',
      label: 'LAND',
    },
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
  const images = new Set<string>()
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
    addImage: (id: string) => images.add(id),
    getCanvas: () => canvas,
    getLayer: (id: string) => (
      Object.values(FLIGHT_GEO_OVERLAY_LAYER_IDS).some(layerId => layerId === id)
        ? { id }
        : undefined
    ),
    hasImage: (id: string) => images.has(id),
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
  runtime.subscribeHud(() => {
    events.push('hud')
  })
  runtime.subscribe(() => {
    clockMs += 336
    events.push('follower')
  })

  const requestId = beginFlightSimReadyFrame(() => clockMs)
  const ready = runtime.start()
  assert.equal(ready.phase, 'ready')
  assert.deepEqual(events, ['maplibre', 'hud'])
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
    `${ready.runId}:${ready.tick}:ready:0:${spatialProfile.id}:fixed-follow:chase:operator:no-environment:day`,
  )
  assert.equal(harness.canvas.dataset.kgFlightSimFirstFrame, '1')
  assert.deepEqual(events, ['maplibre', 'hud'])
  await Promise.resolve()
  assert.deepEqual(events, ['maplibre', 'hud', 'surface', 'follower'])
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

test('provider style promotion re-presents a consumed ready overlay and retains earned first-frame proof', () => {
  const revision = 'ready:provider-style-promotion'
  const initialReady = flightOverlay('ready', revision, 1)
  const harness = presentationHarness(initialReady)
  harness.setWidth(100)

  harness.gate.request(initialReady)
  harness.emitRender()
  assert.equal(harness.presentations.length, 1)
  assert.equal(harness.canvas.dataset.kgFlightSimFirstFrame, '1')

  const consumedReady = flightOverlay('ready', revision, null)
  harness.setCurrent(consumedReady)
  harness.gate.resetPresented()
  harness.gate.request(consumedReady)
  harness.emitRender()

  assert.equal(harness.presentations.length, 2)
  assert.equal(harness.presentations.at(-1)?.revision, revision)
  assert.equal(harness.presentations.at(-1)?.readyFrameRequestId, null)
  assert.equal(harness.presentedRevision(), revision)
  assert.equal(harness.canvas.dataset.kgFlightSimFirstFrame, '1')
  assert.equal(
    harness.canvas.dataset.kgFlightSimFirstFrameSurface,
    'maplibre',
  )

  harness.gate.clearCanvas()
  assert.equal(harness.canvas.dataset.kgFlightSimFirstFrame, undefined)
  assert.equal(
    harness.canvas.dataset.kgFlightSimFirstFrameSurface,
    undefined,
  )
})

test('a consumed ready overlay cannot manufacture first-frame proof on a fresh canvas', () => {
  const consumedReady = flightOverlay(
    'ready',
    'ready:fresh-provider-canvas',
    null,
  )
  const harness = presentationHarness(consumedReady)
  harness.setWidth(100)

  harness.gate.request(consumedReady)
  harness.emitRender()

  assert.equal(harness.presentations.length, 1)
  assert.equal(harness.presentedRevision(), consumedReady.revision)
  assert.equal(harness.canvas.dataset.kgFlightSimFirstFrame, undefined)
  assert.equal(
    harness.canvas.dataset.kgFlightSimFirstFrameSurface,
    undefined,
  )
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

test('previously presented ready overlay waits through provider-style source settlement', context => {
  const ready = flightOverlay(
    'ready',
    'ready:provider-settlement',
    44,
  )
  clearFlightGeoOverlay()
  setFlightGeoOverlay(ready)
  context.after(clearFlightGeoOverlay)
  assert.equal(
    markFlightGeoOverlayReadyFramePresented(
      ready.revision,
      ready.readyFrameRequestId!,
    ),
    true,
  )
  const harness = presentationHarness(ready)
  assert.ok(
    FLIGHT_GEO_PREPARATION_RENDER_ATTEMPT_LIMIT
      > FLIGHT_GEO_READY_RENDER_ATTEMPT_LIMIT,
  )

  harness.setWidth(100)
  harness.replaceSourceData(null)
  harness.gate.request(ready)
  for (
    let attempt = 0;
    attempt <= FLIGHT_GEO_READY_RENDER_ATTEMPT_LIMIT;
    attempt += 1
  ) {
    harness.emitRender()
  }
  assert.equal(
    harness.listenerCount(),
    1,
    'a consumed request must survive beyond the one-shot first-frame budget',
  )

  harness.replaceSourceData(ready)
  harness.emitRender()
  assert.equal(harness.listenerCount(), 0)
  assert.equal(harness.presentations.length, 1)
  assert.equal(harness.presentations[0]?.readyFrameRequestId, 44)
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
    FLIGHT_GEO_OVERLAY_LAYER_IDS.objectiveGuide,
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
      FLIGHT_GEO_OVERLAY_LAYER_IDS.objectiveGuide,
      FLIGHT_GEO_OVERLAY_LAYER_IDS.routePoints,
      FLIGHT_GEO_OVERLAY_LAYER_IDS.aircraftOutline,
      FLIGHT_GEO_OVERLAY_LAYER_IDS.aircraft,
    ],
  )
  assert.equal(previousStyle.layers.length, 6)
  assert.equal(nextStyle.layers.length, 2)
})
