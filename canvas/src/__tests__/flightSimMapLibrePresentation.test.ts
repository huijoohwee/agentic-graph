import test from 'node:test'
import assert from 'node:assert/strict'
import {
  clearFlightGeoOverlay,
  readFlightGeoOverlay,
  readFlightGeoOverlayReadyFramePresented,
  setFlightGeoOverlay,
  subscribeFlightGeoOverlay,
} from '../../../gympgrph/src/flightGeoOverlay'
import {
  canMapLibreFlightOverlayPresent,
  disposeMapLibreFlightBootstrap,
  markMapLibreFlightBootstrapApplied,
  markMapLibreFlightOverlayPresented,
  markMapLibreFlightReadyFramePresented,
  reconcileMapLibreFlightBootstrap,
} from '../../../gympgrph/src/features/geospatial/mapLibreFlightBootstrap'
import {
  applyFlightGeoOverlayCameraToMap,
  applyFlightGeoOverlayToMap,
  FLIGHT_GEO_OVERLAY_LAYER_IDS,
  FLIGHT_GEO_OVERLAY_LAYER_ORDER,
  FLIGHT_GEO_OVERLAY_SOURCE_ID,
} from '../../../gympgrph/src/flightGeoOverlayMapLibre'
import {
  applyFlightGeoEnvironmentToMap,
  FLIGHT_GEO_ENVIRONMENT_LAYER_IDS,
  FLIGHT_GEO_ENVIRONMENT_LAYER_ORDER,
} from '../../../gympgrph/src/flightGeoEnvironmentMapLibre'
import {
  armFlightSimReadyFrame,
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
import {
  flightOverlay,
  presentationHarness,
  withEnvironment,
} from './helpers/flightSimMapLibrePresentationHarness'

const flushMicrotasks = () => new Promise<void>(resolve => setImmediate(resolve))
const applyProviderStyleImmediately = (apply: () => void) => {
  apply()
  return () => void 0
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

test('a stopped Flight frame waits for the local bootstrap before acknowledging a mounted provider map', () => {
  const stopped = flightOverlay('stopped', 'stopped:bootstrap-fence')
  const harness = presentationHarness(stopped, undefined, {
    bootstrapApplied: false,
  })
  harness.setWidth(100)

  harness.gate.request(stopped)
  harness.emitRender()
  assert.equal(
    harness.presentations.length,
    0,
    'the retained provider map cannot satisfy stopped-stage preparation',
  )
  assert.equal(harness.listenerCount(), 1)

  markMapLibreFlightBootstrapApplied(harness.map)
  harness.emitRender()
  assert.equal(harness.presentations.length, 1)
  assert.equal(harness.listenerCount(), 0)
})

test('a stopped Flight frame waits for the settled overlay source before preparation can advance', () => {
  const stopped = flightOverlay('stopped', 'stopped:source-pending')
  const harness = presentationHarness(stopped, undefined, {
    overlaySourceLoaded: false,
  })
  harness.setWidth(100)

  harness.gate.request(stopped)
  harness.emitRender()
  assert.equal(
    harness.presentations.length,
    0,
    'serialized GeoJSON alone cannot acknowledge stopped-stage preparation',
  )
  assert.equal(harness.listenerCount(), 1)

  harness.setOverlaySourceLoaded(true)
  harness.emitSourceData(FLIGHT_GEO_OVERLAY_SOURCE_ID)
  harness.emitRender()
  assert.equal(harness.presentations.length, 1)
  assert.equal(harness.listenerCount(), 0)
})

test('a stopped Flight frame waits for its staged tick-zero camera', () => {
  const stopped = flightOverlay('stopped', 'stopped:camera-pending')
  const harness = presentationHarness(stopped, undefined, {
    cameraExact: false,
  })
  harness.setWidth(100)

  harness.gate.request(stopped)
  harness.emitRender()
  assert.equal(harness.presentations.length, 0)
  assert.equal(harness.listenerCount(), 1)

  harness.setCameraExact(true)
  harness.emitRender()
  assert.equal(harness.presentations.length, 1)
  assert.equal(harness.listenerCount(), 0)
})

test('a stopped Flight frame rejects a noncanonical overlay stack before commit', () => {
  const stopped = flightOverlay('stopped', 'stopped:layer-order', null)
  const harness = presentationHarness(stopped)
  harness.setWidth(100)
  harness.setOverlayLayerOrder(Object.values(FLIGHT_GEO_OVERLAY_LAYER_IDS))

  harness.gate.request(stopped)
  harness.emitRender()

  assert.equal(harness.presentations.length, 0)
  assert.equal(harness.listenerCount(), 1)

  harness.setOverlayLayerOrder(FLIGHT_GEO_OVERLAY_LAYER_ORDER)
  harness.emitRender()

  assert.equal(harness.presentations.length, 1)
  assert.equal(harness.listenerCount(), 0)
})

test('initial Ready reuses an exact stopped frame across MapLibre camera precision', context => {
  const stopped = flightOverlay('stopped', 'stopped:committed', null)
  const ready = {
    ...stopped,
    camera: {
      ...stopped.camera,
      centerCoordinate: [103.82, 1.350000000006] as const,
    },
    phase: 'ready' as const,
    readyFrameRequestId: 7,
    revision: 'ready:committed',
    runId: 1,
  }
  clearFlightGeoOverlay()
  context.after(clearFlightGeoOverlay)
  setFlightGeoOverlay(stopped)
  const harness = presentationHarness(stopped)
  harness.setWidth(100)

  harness.gate.request(stopped)
  harness.emitRender()
  assert.equal(harness.presentations.length, 1)
  assert.equal(harness.listenerCount(), 0)
  const repaintsBeforeReady = harness.repaintCount()
  const sourceWritesBeforeReady = harness.sourceDataWrites()
  const jumpsBeforeReady = harness.jumpToCount()

  setFlightGeoOverlay(ready)
  harness.setCurrentPreservingSourceData(ready)
  assert.equal(applyFlightGeoEnvironmentToMap(harness.map, ready, '3d'), true)
  assert.equal(applyFlightGeoOverlayToMap(harness.map, ready), true)
  assert.equal(
    applyFlightGeoOverlayCameraToMap(
      harness.map,
      ready,
      '3d',
      { top: 16, right: 16, bottom: 16, left: 16 },
    ),
    true,
  )
  assert.equal(harness.gate.canReuseCommittedStoppedFrame(ready), true)
  harness.gate.request(ready)

  assert.equal(harness.presentations.length, 2)
  assert.equal(harness.presentations.at(-1)?.readyFrameRequestId, 7)
  assert.equal(harness.listenerCount(), 0)
  assert.equal(harness.repaintCount(), repaintsBeforeReady)
  assert.equal(harness.sourceDataWrites(), sourceWritesBeforeReady)
  assert.equal(harness.jumpToCount(), jumpsBeforeReady)
  assert.equal(harness.canvas.dataset.kgFlightSimFirstFrame, '1')
  assert.equal(readFlightGeoOverlayReadyFramePresented(), true)

  const freshReady = {
    ...ready,
    readyFrameRequestId: 8,
    revision: 'ready:next-request',
  }
  setFlightGeoOverlay(freshReady)
  harness.setCurrentPreservingSourceData(freshReady)
  harness.gate.request(freshReady)
  assert.equal(
    harness.listenerCount(),
    1,
    'the one-shot stopped proof cannot satisfy a later ready request',
  )
})

test('initial Ready reuses the exact committed provider stopped frame without another painter pass', async context => {
  const stopped = withEnvironment(
    flightOverlay('stopped', 'stopped:provider-committed', null),
  )
  const priorReady = {
    ...stopped,
    phase: 'ready' as const,
    readyFrameRequestId: 16,
    revision: 'ready:prior-provider-committed',
    runId: 1,
  }
  const ready = {
    ...stopped,
    phase: 'ready' as const,
    readyFrameRequestId: 17,
    revision: 'ready:provider-committed',
    runId: 1,
  }
  clearFlightGeoOverlay()
  context.after(clearFlightGeoOverlay)
  const harness = presentationHarness(stopped)
  context.after(() => {
    harness.gate.dispose()
    disposeMapLibreFlightBootstrap(harness.map)
  })
  harness.setWidth(100)
  setFlightGeoOverlay(priorReady)
  markMapLibreFlightOverlayPresented(harness.map, priorReady)
  markMapLibreFlightReadyFramePresented(
    harness.map,
    priorReady.revision,
    priorReady.readyFrameRequestId,
  )
  assert.equal(readFlightGeoOverlayReadyFramePresented(), true)
  setFlightGeoOverlay(stopped)
  assert.equal(readFlightGeoOverlayReadyFramePresented(), false)

  reconcileMapLibreFlightBootstrap({
    bootstrapStyle: { version: 8, name: 'local-flight-bootstrap' },
    hasExactFlightOverlay: () => true,
    hasLiveFlightStyleOwner: () => readFlightGeoOverlay().active,
    loadProviderStyle: async () => ({
      version: 8,
      name: 'provider-flight',
      sources: {},
      layers: [],
    }),
    map: harness.map,
    scheduleProviderStyleApply: applyProviderStyleImmediately,
    retainFlightOverlay: (_previous, next) => ({ ...next }),
  })
  await flushMicrotasks()
  assert.equal(harness.styleSetCount(), 0)

  harness.gate.request(stopped)
  harness.emitRender()
  assert.equal(harness.presentations.length, 1)
  await flushMicrotasks()
  assert.equal(
    harness.styleSetCount(),
    1,
    'stopped commit directly queues provider admission after its render',
  )
  assert.equal(canMapLibreFlightOverlayPresent(harness.map, stopped), true)
  harness.emitStyleLoad()
  assert.equal(applyFlightGeoEnvironmentToMap(harness.map, stopped, '3d'), true)
  assert.equal(applyFlightGeoOverlayToMap(harness.map, stopped), true)
  assert.equal(
    applyFlightGeoOverlayCameraToMap(
      harness.map,
      stopped,
      '3d',
      { top: 16, right: 16, bottom: 16, left: 16 },
      { stageStopped: true },
    ),
    true,
  )
  harness.gate.request(stopped)
  harness.emitRender()
  assert.equal(
    harness.presentations.length,
    2,
    'the provider painter must commit its own stopped-frame proof',
  )

  setFlightGeoOverlay(ready)
  harness.setCurrentPreservingSourceData(ready)
  assert.equal(
    canMapLibreFlightOverlayPresent(harness.map, ready),
    false,
    'the stopped provider identity does not generally admit Ready',
  )
  assert.equal(applyFlightGeoEnvironmentToMap(harness.map, ready, '3d'), true)
  assert.equal(applyFlightGeoOverlayToMap(harness.map, ready), true)
  assert.equal(
    applyFlightGeoOverlayCameraToMap(
      harness.map,
      ready,
      '3d',
      { top: 16, right: 16, bottom: 16, left: 16 },
    ),
    true,
  )
  assert.equal(harness.gate.canReuseCommittedStoppedFrame(ready), true)
  const listenerCountBeforeReady = harness.listenerCount()
  const repaintsBeforeReady = harness.repaintCount()
  const sourceWritesBeforeReady = harness.sourceDataWrites()
  const jumpsBeforeReady = harness.jumpToCount()
  const styleSetsBeforeReady = harness.styleSetCount()

  harness.gate.request(ready)

  assert.equal(harness.presentations.length, 3)
  assert.equal(harness.presentations.at(-1)?.readyFrameRequestId, 17)
  assert.equal(readFlightGeoOverlayReadyFramePresented(), true)
  assert.equal(harness.listenerCount(), listenerCountBeforeReady)
  assert.equal(harness.repaintCount(), repaintsBeforeReady)
  assert.equal(harness.sourceDataWrites(), sourceWritesBeforeReady)
  assert.equal(harness.jumpToCount(), jumpsBeforeReady)
  assert.equal(harness.styleSetCount(), styleSetsBeforeReady)
})

test('stopped-frame reuse completes the armed native deadline without a second render', context => {
  resetFlightSimDeadlineRuntimeForTests()
  context.after(resetFlightSimDeadlineRuntimeForTests)
  clearFlightGeoOverlay()
  context.after(clearFlightGeoOverlay)
  let clockMs = 20
  const stopped = flightOverlay('stopped', 'stopped:deadline-reuse', null)
  setFlightGeoOverlay(stopped)
  const requestId = beginFlightSimReadyFrame(
    () => clockMs,
    () => () => undefined,
  )
  armFlightSimReadyFrame(requestId, 1, 0, 'maplibre')
  const ready = {
    ...stopped,
    phase: 'ready' as const,
    readyFrameRequestId: requestId,
    revision: 'ready:deadline-reuse',
    runId: 1,
  }
  const harness = presentationHarness(stopped, presentation => {
    if (presentation.readyFrameRequestId === null) return
    completeFlightSimMapLibreReadyFrame(
      presentation.readyFrameRequestId,
      presentation.runId,
      presentation.tick,
      () => clockMs,
    )
  })
  harness.setWidth(100)
  harness.gate.request(stopped)
  harness.emitRender()
  const repaintsBeforeReady = harness.repaintCount()
  setFlightGeoOverlay(ready)
  harness.setCurrentPreservingSourceData(ready)
  clockMs = 21

  harness.gate.request(ready)

  assert.equal(harness.listenerCount(), 0)
  assert.equal(harness.repaintCount(), repaintsBeforeReady)
  assert.equal(readFlightSimDeadlineSnapshot().readyFrame?.source, 'native-maplibre-flight-ready-frame')
  assert.equal(readFlightSimDeadlineSnapshot().readyFrame?.elapsedMs, 1)
  assert.equal(readFlightSimDeadlineSnapshot().readyFrame?.withinLimit, true)
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
