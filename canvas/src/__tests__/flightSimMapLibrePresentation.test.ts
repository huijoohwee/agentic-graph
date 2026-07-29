import test from 'node:test'
import assert from 'node:assert/strict'
import {
  clearFlightGeoOverlay,
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
  markMapLibreFlightBootstrapApplied,
} from '../../../gympgrph/src/features/geospatial/mapLibreFlightBootstrap'
import {
  applyFlightGeoOverlayToMap,
  flightGeoOverlayMapLibreFeatureCollection,
  FLIGHT_GEO_OVERLAY_LAYER_IDS,
  FLIGHT_GEO_OVERLAY_LAYER_ORDER,
  FLIGHT_GEO_OVERLAY_SOURCE_ID,
  retainFlightGeoOverlayDuringStyleSwap,
} from '../../../gympgrph/src/flightGeoOverlayMapLibre'
import {
  flightGeoEnvironmentMapLibreFeatureCollection,
  FLIGHT_GEO_ENVIRONMENT_LAYER_IDS,
  FLIGHT_GEO_ENVIRONMENT_SOURCE_ID,
} from '../../../gympgrph/src/flightGeoEnvironmentMapLibre'
import {
  recordFlightGeoStoppedPresentation,
  writeFlightGeoPresentationDebug,
} from '../../../gympgrph/src/features/geospatial/flightGeoPresentationDebug'
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

function withEnvironment(
  overlay: FlightGeoOverlaySnapshot,
): FlightGeoOverlaySnapshot {
  const ring = [
    [103.8198, 1.3498],
    [103.8202, 1.3498],
    [103.8202, 1.3502],
    [103.8198, 1.3502],
    [103.8198, 1.3498],
  ] as const
  return {
    ...overlay,
    environment: {
      anchor: [103.82, 1.35],
      id: 'singapore',
      label: 'Singapore',
      presentationBounds: [[103.8198, 1.3498], [103.8202, 1.3502]],
      revision: 'environment:stopped-ready',
      stageFootprint: ring,
      surfaces: [{
        baseHeightMeters: 0,
        color: '#0f766e',
        heightMeters: 0.08,
        id: 'stage-footprint',
        kind: 'stage-footprint',
        ring,
      }],
    },
  }
}

function presentationHarness(
  initial: FlightGeoOverlaySnapshot,
  afterPresented?: (presentation: FlightGeoOverlayPresentation) => void,
  options?: Readonly<{
    bootstrapApplied?: boolean
    cameraExact?: boolean
    environmentSourceLoaded?: boolean
    overlaySourceLoaded?: boolean
  }>,
) {
  let current = initial
  let cameraExact = options?.cameraExact ?? true
  let environmentSourceLoaded = options?.environmentSourceLoaded ?? true
  let overlaySourceLoaded = options?.overlaySourceLoaded ?? true
  let width = 0
  let repaintCount = 0
  let sourceData = flightGeoOverlayMapLibreFeatureCollection(initial)
  let environmentSourceData = initial.environment
    ? flightGeoEnvironmentMapLibreFeatureCollection(initial)
    : null
  let sourceDataWrites = 0
  let jumpToCount = 0
  const images = new Set<string>()
  const listeners = new Set<() => void>()
  const styleLoadListeners = new Set<() => void>()
  let overlayLayerOrder = [...FLIGHT_GEO_OVERLAY_LAYER_ORDER]
  const layerIds = new Set<string>([
    ...Object.values(FLIGHT_GEO_OVERLAY_LAYER_IDS),
    ...(initial.environment
      ? Object.values(FLIGHT_GEO_ENVIRONMENT_LAYER_IDS)
      : []),
  ])
  const layerVisibility = new Map<string, 'none' | 'visible'>([
    [FLIGHT_GEO_ENVIRONMENT_LAYER_IDS.fill2d, 'none'],
    [FLIGHT_GEO_ENVIRONMENT_LAYER_IDS.extrusion3d, 'visible'],
    [FLIGHT_GEO_ENVIRONMENT_LAYER_IDS.outline, 'visible'],
  ])
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
    getBearing: () => cameraExact ? current.aircraft.headingDegrees : 180,
    getCanvas: () => canvas,
    getCenter: () => ({
      lng: cameraExact ? current.camera.centerCoordinate[0] : 0,
      lat: cameraExact ? current.camera.centerCoordinate[1] : 0,
    }),
    getLayer: (id: string) => (
      layerIds.has(id) ? { id } : undefined
    ),
    getLayoutProperty: (id: string, property: string) => (
      property === 'visibility' ? layerVisibility.get(id) : undefined
    ),
    getPadding: () => ({ top: 16, right: 16, bottom: 16, left: 16 }),
    getPitch: () => cameraExact ? 48 : 0,
    hasImage: (id: string) => images.has(id),
    getSource: (id: string) => (
      id === FLIGHT_GEO_OVERLAY_SOURCE_ID
        ? {
            id,
            loaded: () => overlaySourceLoaded,
            serialize: () => ({ data: sourceData }),
            setData: (data: ReturnType<typeof flightGeoOverlayMapLibreFeatureCollection>) => {
              sourceDataWrites += 1
              sourceData = data
            },
          }
        : id === FLIGHT_GEO_ENVIRONMENT_SOURCE_ID && environmentSourceData
          ? {
              id,
              loaded: () => environmentSourceLoaded,
              serialize: () => ({ data: environmentSourceData }),
              setData: (data: ReturnType<typeof flightGeoEnvironmentMapLibreFeatureCollection>) => {
                sourceDataWrites += 1
                environmentSourceData = data
              },
            }
        : undefined
    ),
    getStyle: () => ({
      layers: [
        ...(initial.environment
          ? Object.values(FLIGHT_GEO_ENVIRONMENT_LAYER_IDS).map(id => ({ id }))
          : []),
        ...overlayLayerOrder.map(id => ({ id })),
      ],
    }),
    getZoom: () => cameraExact ? 15.5 : 0,
    moveLayer: () => undefined,
    off: (type: string, listener: () => void) => {
      if (type === 'render') listeners.delete(listener)
      if (type === 'style.load') styleLoadListeners.delete(listener)
    },
    on: (type: string, listener: () => void) => {
      if (type === 'render') listeners.add(listener)
      if (type === 'style.load') styleLoadListeners.add(listener)
    },
    triggerRepaint: () => {
      repaintCount += 1
    },
    jumpTo: () => {
      jumpToCount += 1
    },
    setLayoutProperty: (
      id: string,
      property: string,
      value: 'none' | 'visible',
    ) => {
      if (property === 'visibility') layerVisibility.set(id, value)
    },
  }
  if (options?.bootstrapApplied !== false) {
    markMapLibreFlightBootstrapApplied(map)
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
    viewMode: '3d',
  })
  return {
    canvas,
    emitRender: () => {
      for (const listener of [...listeners]) listener()
    },
    emitStyleLoad: () => {
      for (const listener of [...styleLoadListeners]) listener()
    },
    gate,
    map,
    listenerCount: () => listeners.size,
    presentedRevision: () => presented.current.revision,
    presentations,
    repaintCount: () => repaintCount,
    jumpToCount: () => jumpToCount,
    replaceSourceData: (next: FlightGeoOverlaySnapshot | null) => {
      sourceData = next
        ? flightGeoOverlayMapLibreFeatureCollection(next)
        : { type: 'FeatureCollection', features: [] }
    },
    setCurrent: (next: FlightGeoOverlaySnapshot) => {
      current = next
      sourceData = flightGeoOverlayMapLibreFeatureCollection(next)
      environmentSourceData = next.environment
        ? flightGeoEnvironmentMapLibreFeatureCollection(next)
        : null
    },
    setCameraExact: (exact: boolean) => {
      cameraExact = exact
    },
    setOverlaySourceLoaded: (loaded: boolean) => {
      overlaySourceLoaded = loaded
    },
    setEnvironmentSourceLoaded: (loaded: boolean) => {
      environmentSourceLoaded = loaded
    },
    setLayerPresent: (id: string, present: boolean) => {
      if (present) layerIds.add(id)
      else layerIds.delete(id)
    },
    setLayerVisibility: (id: string, visibility: 'none' | 'visible') => {
      layerVisibility.set(id, visibility)
    },
    setOverlayLayerOrder: (next: readonly string[]) => {
      overlayLayerOrder = [...next]
    },
    sourceDataWrites: () => sourceDataWrites,
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

test('initial Ready reuses an exact stopped frame across MapLibre camera precision', () => {
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
  const harness = presentationHarness(stopped)
  harness.setWidth(100)

  harness.gate.request(stopped)
  harness.emitRender()
  assert.equal(harness.presentations.length, 1)
  assert.equal(harness.listenerCount(), 0)
  const repaintsBeforeReady = harness.repaintCount()
  const sourceWritesBeforeReady = harness.sourceDataWrites()
  const jumpsBeforeReady = harness.jumpToCount()

  harness.setCurrent(ready)
  harness.gate.request(ready)

  assert.equal(harness.presentations.length, 2)
  assert.equal(harness.presentations.at(-1)?.readyFrameRequestId, 7)
  assert.equal(harness.listenerCount(), 0)
  assert.equal(harness.repaintCount(), repaintsBeforeReady)
  assert.equal(harness.sourceDataWrites(), sourceWritesBeforeReady)
  assert.equal(harness.jumpToCount(), jumpsBeforeReady)
  assert.equal(harness.canvas.dataset.kgFlightSimFirstFrame, '1')

  const freshReady = {
    ...ready,
    readyFrameRequestId: 8,
    revision: 'ready:next-request',
  }
  harness.setCurrent(freshReady)
  harness.gate.request(freshReady)
  assert.equal(
    harness.listenerCount(),
    1,
    'the one-shot stopped proof cannot satisfy a later ready request',
  )
})

test('stopped-frame reuse completes the armed native deadline without a second render', context => {
  resetFlightSimDeadlineRuntimeForTests()
  context.after(resetFlightSimDeadlineRuntimeForTests)
  let clockMs = 20
  const stopped = flightOverlay('stopped', 'stopped:deadline-reuse', null)
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
  harness.setCurrent(ready)
  clockMs = 21

  harness.gate.request(ready)

  assert.equal(harness.listenerCount(), 0)
  assert.equal(harness.repaintCount(), repaintsBeforeReady)
  assert.equal(readFlightSimDeadlineSnapshot().readyFrame?.source, 'native-maplibre-flight-ready-frame')
  assert.equal(readFlightSimDeadlineSnapshot().readyFrame?.elapsedMs, 1)
  assert.equal(readFlightSimDeadlineSnapshot().readyFrame?.withinLimit, true)
})

test('a style reload invalidates a stopped frame before Ready can reuse it', () => {
  const stopped = flightOverlay('stopped', 'stopped:style-reload', null)
  const ready = {
    ...stopped,
    phase: 'ready' as const,
    readyFrameRequestId: 9,
    revision: 'ready:style-reload',
    runId: 1,
  }
  const harness = presentationHarness(stopped)
  harness.setWidth(100)
  harness.gate.request(stopped)
  harness.emitRender()
  harness.emitStyleLoad()
  harness.setCurrent(ready)

  harness.gate.request(ready)
  assert.equal(harness.listenerCount(), 1)
  harness.emitRender()
  assert.equal(harness.presentations.at(-1)?.readyFrameRequestId, 9)
})

test('mutated Ready visuals fall back to a new native MapLibre render', () => {
  const exerciseFallback = (args: Readonly<{
    label: string
    prepare: (harness: ReturnType<typeof presentationHarness>) => void
    ready: FlightGeoOverlaySnapshot
    restore?: (harness: ReturnType<typeof presentationHarness>) => void
    stopped: FlightGeoOverlaySnapshot
  }>) => {
    const harness = presentationHarness(args.stopped)
    harness.setWidth(100)
    harness.gate.request(args.stopped)
    harness.emitRender()
    const repaintsBeforeReady = harness.repaintCount()
    harness.setCurrent(args.ready)
    args.prepare(harness)

    harness.gate.request(args.ready)
    assert.equal(
      harness.listenerCount(),
      1,
      `${args.label} must not reuse the stopped painter frame`,
    )
    assert.ok(harness.repaintCount() > repaintsBeforeReady)
    args.restore?.(harness)
    harness.emitRender()
    assert.equal(harness.presentations.length, 2)
    assert.equal(harness.presentations.at(-1)?.revision, args.ready.revision)
  }

  const stopped = flightOverlay('stopped', 'stopped:mutations', null)
  exerciseFallback({
    label: 'aircraft coordinate mutation',
    stopped,
    ready: {
      ...stopped,
      aircraft: {
        ...stopped.aircraft,
        coordinate: [103.821, 1.351],
      },
      camera: {
        ...stopped.camera,
        centerCoordinate: [103.821, 1.351],
      },
      phase: 'ready',
      readyFrameRequestId: 1,
      revision: 'ready:coordinate-mutation',
      runId: 1,
    },
    prepare: () => undefined,
  })

  const stoppedWithEnvironment = withEnvironment({
    ...stopped,
    revision: 'stopped:environment-mutation',
  })
  exerciseFallback({
    label: 'environment extrusion-height mutation',
    stopped: stoppedWithEnvironment,
    ready: {
      ...stoppedWithEnvironment,
      environment: {
        ...stoppedWithEnvironment.environment!,
        surfaces: stoppedWithEnvironment.environment!.surfaces.map(surface => ({
          ...surface,
          heightMeters: 12,
        })),
      },
      phase: 'ready',
      readyFrameRequestId: 2,
      revision: 'ready:environment-height-mutation',
      runId: 1,
    },
    prepare: () => undefined,
  })

  const ready = {
    ...stopped,
    phase: 'ready' as const,
    readyFrameRequestId: 3,
    revision: 'ready:layer-mutation',
    runId: 1,
  }
  exerciseFallback({
    label: 'missing aircraft layer',
    stopped,
    ready,
    prepare: harness => {
      harness.setLayerPresent(FLIGHT_GEO_OVERLAY_LAYER_IDS.aircraft, false)
    },
    restore: harness => {
      harness.setLayerPresent(FLIGHT_GEO_OVERLAY_LAYER_IDS.aircraft, true)
    },
  })
  exerciseFallback({
    label: 'unsettled overlay source',
    stopped,
    ready: { ...ready, readyFrameRequestId: 4, revision: 'ready:overlay-pending' },
    prepare: harness => harness.setOverlaySourceLoaded(false),
    restore: harness => harness.setOverlaySourceLoaded(true),
  })
  exerciseFallback({
    label: 'unsettled environment source',
    stopped: stoppedWithEnvironment,
    ready: {
      ...stoppedWithEnvironment,
      phase: 'ready',
      readyFrameRequestId: 5,
      revision: 'ready:environment-pending',
      runId: 1,
    },
    prepare: harness => harness.setEnvironmentSourceLoaded(false),
    restore: harness => harness.setEnvironmentSourceLoaded(true),
  })
  exerciseFallback({
    label: 'camera mutation',
    stopped,
    ready: { ...ready, readyFrameRequestId: 6, revision: 'ready:camera-mutation' },
    prepare: harness => harness.setCameraExact(false),
    restore: harness => harness.setCameraExact(true),
  })
  exerciseFallback({
    label: 'material camera coordinate mutation',
    stopped,
    ready: {
      ...ready,
      camera: {
        ...ready.camera,
        centerCoordinate: [103.82, 1.35000002],
      },
      readyFrameRequestId: 7,
      revision: 'ready:camera-coordinate-mutation',
    },
    prepare: () => undefined,
  })
})

test('a new stopped Flight request clears prior settlement proof before recording its own', () => {
  const root = { dataset: {} as DOMStringMap } as HTMLElement
  const priorStopped = flightOverlay('stopped', 'stopped:prior')
  recordFlightGeoStoppedPresentation(root, priorStopped, 'prior-camera')

  const currentStopped = {
    ...priorStopped,
    revision: 'stopped:current',
  }
  writeFlightGeoPresentationDebug(root, currentStopped, 0)
  assert.equal(root.dataset.kgFlightGeospatialStoppedRevision, undefined)
  assert.equal(root.dataset.kgFlightGeospatialStoppedProfileId, undefined)

  recordFlightGeoStoppedPresentation(root, currentStopped)
  assert.equal(
    root.dataset.kgFlightGeospatialStoppedRevision,
    'stopped:current',
  )
  assert.equal(root.dataset.kgFlightGeospatialStoppedRunId, '0')
  assert.equal(root.dataset.kgFlightGeospatialStoppedCameraSignature, undefined)
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
