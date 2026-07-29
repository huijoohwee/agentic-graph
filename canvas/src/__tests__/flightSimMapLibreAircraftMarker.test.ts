import test from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'
import type { FlightGeoOverlaySnapshot } from '../../../gympgrph/src/flightGeoOverlay'
import {
  applyFlightGeoOverlayCameraToMap,
  applyFlightGeoOverlayToMap,
  flightGeoOverlayMapLibreFeatureCollection,
  FLIGHT_GEO_AIRCRAFT_IMAGE_IDS,
  FLIGHT_GEO_OVERLAY_LAYER_IDS,
  FLIGHT_GEO_OVERLAY_SOURCE_ID,
  fitMapToFlightGeoOverlay,
} from '../../../gympgrph/src/flightGeoOverlayMapLibre'
import { readFlightGeoMapViewportPadding } from '../../../gympgrph/src/flightGeoMapViewport'
import { createFlightSimRuntime } from '../features/game-flight-sim/flightSimRuntimeCore'
import {
  projectFlightSimToGeospatialOverlay,
} from '../features/game-flight-sim/flightSimGeospatialProjection'
import type { FlightSimSpatialProfile } from '../features/game-flight-sim/flightSimModel'
import type { SpatialVector } from '../features/physics/spatialPhysicsTypes'

type LayerDefinition = Readonly<{
  filter?: unknown
  id: unknown
  layout?: Readonly<Record<string, unknown>>
  paint?: Readonly<Record<string, unknown>>
  type?: unknown
}>

type LayerFailure = Readonly<{
  error?: Error
  layerId: string
  mode: 'omit' | 'throw'
}>

function flightOverlay(headingDegrees = 0): FlightGeoOverlaySnapshot {
  return {
    active: true,
    aircraft: {
      coordinate: [103.82, 1.35],
      altitudeMeters: 400,
      headingDegrees,
    },
    camera: {
      centerCoordinate: [103.82, 1.35],
      cockpitClearance: { forwardMeters: 2, verticalMeters: 1 },
      effectiveOwner: 'fixed-follow',
      source: 'fixed-follow',
      timeline: null,
      view: 'chase',
    },
    environment: null,
    night: false,
    objective: null,
    phase: 'ready',
    profileId: 'singapore',
    readyFrameRequestId: 1,
    revision: `ready:aircraft:${headingDegrees}`,
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
    runId: 1,
    tick: 0,
  }
}

test('Flight camera preserves 2D north-up and 3D oblique mode ownership', () => {
  const calls: Record<string, unknown>[] = []
  const padding = { top: 24, right: 412, bottom: 48, left: 652 }
  const map = {
    jumpTo: (camera: Record<string, unknown>) => calls.push(camera),
  }
  const overlay = flightOverlay(72)

  for (const mode of ['2d', '2d-modern']) {
    assert.equal(
      applyFlightGeoOverlayCameraToMap(map, overlay, mode, padding),
      true,
    )
    assert.equal(calls.at(-1)?.pitch, 0)
    assert.equal(calls.at(-1)?.bearing, 0)
    assert.deepEqual(calls.at(-1)?.padding, padding)
  }
  for (const mode of ['3d', '3d-modern']) {
    assert.equal(
      applyFlightGeoOverlayCameraToMap(map, overlay, mode, padding),
      true,
    )
    assert.equal(calls.at(-1)?.pitch, 48)
    assert.equal(calls.at(-1)?.bearing, 72)
    assert.deepEqual(calls.at(-1)?.padding, padding)
  }
  assert.equal(
    applyFlightGeoOverlayCameraToMap(
      map,
      { ...overlay, phase: 'stopped' },
      '3d',
      padding,
    ),
    false,
  )
  assert.equal(calls.length, 4)
})

test('stopped preparation stages each tick-zero camera so Ready does not jump again', () => {
  const padding = { top: 24, right: 412, bottom: 48, left: 652 }
  const calls: Record<string, unknown>[] = []
  let camera = {
    bearing: 0,
    center: [0, 0] as [number, number],
    padding: { top: 0, right: 0, bottom: 0, left: 0 },
    pitch: 0,
    zoom: 0,
  }
  const map = {
    getBearing: () => camera.bearing,
    getCenter: () => ({ lng: camera.center[0], lat: camera.center[1] }),
    getPadding: () => camera.padding,
    getPitch: () => camera.pitch,
    getZoom: () => camera.zoom,
    jumpTo: (next: Record<string, unknown>) => {
      calls.push(next)
      const center = next.center as [number, number]
      camera = {
        bearing: Number(next.bearing),
        center: [Number(center[0]), Number(center[1])],
        padding: next.padding as typeof camera.padding,
        pitch: Number(next.pitch),
        zoom: Number(next.zoom),
      }
    },
  }
  for (const mode of ['2d', '2d-modern', '3d', '3d-modern']) {
    const ready = flightOverlay(72)
    const stopped = {
      ...ready,
      phase: 'stopped' as const,
      readyFrameRequestId: null,
      revision: `stopped:aircraft:${mode}`,
      runId: 0,
    }
    const callsBeforeStage = calls.length
    assert.equal(
      applyFlightGeoOverlayCameraToMap(
        map,
        stopped,
        mode,
        padding,
        { stageStopped: true },
      ),
      true,
    )
    assert.equal(calls.length, callsBeforeStage + 1)
    assert.deepEqual(calls.at(-1), {
      bearing: mode.startsWith('3d') ? 72 : 0,
      center: [103.82, 1.35],
      padding,
      pitch: mode.startsWith('3d') ? 48 : 0,
      zoom: 15.5,
    })

    assert.equal(
      applyFlightGeoOverlayCameraToMap(map, ready, mode, padding),
      true,
    )
    assert.equal(calls.length, callsBeforeStage + 1)

    const moved = {
      ...ready,
      aircraft: { ...ready.aircraft, headingDegrees: 18 },
      camera: {
        ...ready.camera,
        centerCoordinate: [103.821, 1.351] as const,
      },
    }
    assert.equal(
      applyFlightGeoOverlayCameraToMap(map, moved, mode, padding),
      true,
    )
    assert.equal(calls.length, callsBeforeStage + 2)
  }
})

test('Flight camera reserves a panel that crosses the compact map centre', () => {
  const dom = new JSDOM('<main><section id="map"></section><aside aria-label="Floating panel"></aside></main>')
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window')
  const previousDocument = Object.getOwnPropertyDescriptor(globalThis, 'document')
  Object.defineProperty(globalThis, 'window', { configurable: true, value: dom.window })
  Object.defineProperty(globalThis, 'document', { configurable: true, value: dom.window.document })
  try {
    const mapContainer = dom.window.document.querySelector('#map') as HTMLElement
    const panel = dom.window.document.querySelector('[aria-label="Floating panel"]') as HTMLElement
    Object.defineProperties(mapContainer, {
      clientHeight: { configurable: true, value: 962 },
      clientWidth: { configurable: true, value: 550 },
    })
    mapContainer.getBoundingClientRect = () => ({
      bottom: 962, height: 962, left: 550, right: 1100, top: 0, width: 550,
    } as DOMRect)
    panel.getBoundingClientRect = () => ({
      bottom: 953, height: 944, left: 747, right: 1091, top: 9, width: 344,
    } as DOMRect)

    assert.deepEqual(
      readFlightGeoMapViewportPadding({ getContainer: () => mapContainer }),
      { bottom: 112, left: 44, right: 369, top: 88 },
    )
  } finally {
    if (previousWindow) Object.defineProperty(globalThis, 'window', previousWindow)
    else delete (globalThis as { window?: Window }).window
    if (previousDocument) Object.defineProperty(globalThis, 'document', previousDocument)
    else delete (globalThis as { document?: Document }).document
    dom.window.close()
  }
})

test('Flight fit includes XR surfaces and the visual map aperture', () => {
  const calls: unknown[][] = []
  const padding = { top: 24, right: 412, bottom: 48, left: 652 }
  const overlay: FlightGeoOverlaySnapshot = {
    ...flightOverlay(),
    environment: {
      anchor: [103.851959, 1.29027],
      id: 'singapore',
      label: 'Singapore',
      presentationBounds: [[103.605, 1.158], [104.09, 1.48]],
      revision: 'stage:exact',
      stageFootprint: [
        [103.8, 1.2], [103.9, 1.2], [103.9, 1.3], [103.8, 1.3], [103.8, 1.2],
      ],
      surfaces: [{
        baseHeightMeters: 0,
        color: '#0f766e',
        heightMeters: 1.6,
        id: 'stage-footprint',
        kind: 'stage-footprint',
        ring: [
          [103.8, 1.2], [103.9, 1.2], [103.9, 1.3], [103.8, 1.3], [103.8, 1.2],
        ],
      }],
    },
  }
  const map = {
    fitBounds: (...args: unknown[]) => calls.push(args),
  }

  assert.equal(fitMapToFlightGeoOverlay(map, overlay, padding), true)
  assert.deepEqual(calls[0]?.[0], [[103.8, 1.2], [103.9, 1.36]])
  assert.deepEqual(
    (calls[0]?.[1] as { padding?: unknown })?.padding,
    padding,
  )
})

function mapHarness(failure?: LayerFailure) {
  const layers = new Map<string, LayerDefinition>()
  const images = new Map<string, {
    data: Uint8Array
    height: number
    width: number
  }>()
  const sources = new Map<string, {
    data: unknown
    loaded: () => boolean
    serialize: () => { data: unknown }
    setData: (data: unknown) => void
  }>()
  let setDataWrites = 0
  const map = {
    style: { _loaded: true },
    addLayer: (layer: LayerDefinition) => {
      const layerId = String(layer.id)
      if (failure?.layerId === layerId) {
        if (failure.mode === 'throw') throw failure.error
        return
      }
      layers.set(layerId, layer)
    },
    addImage: (
      imageId: string,
      image: { data: Uint8Array; height: number; width: number },
    ) => {
      images.set(imageId, image)
    },
    addSource: (sourceId: string, source: { data: unknown }) => {
      const stored = {
        data: source.data,
        loaded: () => true,
        serialize: () => ({ data: stored.data }),
        setData: (data: unknown) => {
          setDataWrites += 1
          stored.data = data
        },
      }
      sources.set(sourceId, stored)
    },
    getLayer: (layerId: string) => layers.get(layerId),
    getImage: (imageId: string) => images.get(imageId),
    getSource: (sourceId: string) => sources.get(sourceId),
    getStyle: () => ({ layers: [...layers.values()] }),
    hasImage: (imageId: string) => images.has(imageId),
    moveLayer: () => undefined,
  }
  return {
    images,
    layers,
    map,
    readSourceData: () => sources.get(FLIGHT_GEO_OVERLAY_SOURCE_ID)?.data,
    setDataWrites: () => setDataWrites,
  }
}

function readAircraftRing(sourceData: unknown): number[][] {
  const features = (sourceData as {
    features?: {
      geometry?: { coordinates?: unknown; type?: unknown }
      properties?: Record<string, unknown>
    }[]
  })?.features
  const aircraftShape = features?.find(
    feature => feature.properties?.kgFlightOverlayKind === 'aircraft',
  )
  assert.equal(aircraftShape?.geometry?.type, 'Polygon')
  const coordinates = aircraftShape?.geometry?.coordinates as number[][][]
  assert.ok(Array.isArray(coordinates?.[0]))
  return coordinates[0]
}

test('MapLibre aircraft uses pose-derived native geometry without fonts', () => {
  const harness = mapHarness()
  const northbound = flightOverlay(0)

  assert.equal(applyFlightGeoOverlayToMap(harness.map, northbound), true)
  const sourceData = harness.readSourceData() as {
    features?: { properties?: Record<string, unknown> }[]
  }
  assert.equal(
    sourceData.features?.filter(
      feature => feature.properties?.kgFlightOverlayKind === 'route-point',
    ).length,
    2,
  )
  assert.equal(
    sourceData.features?.filter(
      feature => feature.properties?.kgFlightOverlayKind === 'route',
    ).length,
    1,
  )
  const northboundRing = readAircraftRing(sourceData)
  assert.equal(northboundRing.length, 13)
  assert.deepEqual(northboundRing.at(-1), northboundRing[0])
  assert.equal(northboundRing[0][0], northbound.aircraft.coordinate[0])
  assert.ok(northboundRing[0][1] > northbound.aircraft.coordinate[1])

  const aircraftLayer = harness.layers.get(
    FLIGHT_GEO_OVERLAY_LAYER_IDS.aircraft,
  )
  assert.equal(aircraftLayer?.type, 'symbol')
  assert.deepEqual(aircraftLayer?.filter, [
    '==',
    ['get', 'kgFlightOverlayKind'],
    'aircraft',
  ])
  assert.equal(JSON.stringify(aircraftLayer).includes('text-field'), false)
  assert.equal(JSON.stringify(aircraftLayer).includes('text-font'), false)
  assert.equal(aircraftLayer?.layout?.['icon-size'], 1)
  assert.deepEqual(aircraftLayer?.layout?.['icon-rotate'], [
    'get',
    'headingDegrees',
  ])
  for (const imageId of Object.values(FLIGHT_GEO_AIRCRAFT_IMAGE_IDS)) {
    const image = harness.images.get(imageId)
    assert.equal(image?.width, 40)
    assert.equal(image?.height, 40)
    assert.ok(image?.data.some(channel => channel > 0))
  }

  const eastbound = flightOverlay(90)
  assert.equal(applyFlightGeoOverlayToMap(harness.map, eastbound), true)
  const eastboundRing = readAircraftRing(harness.readSourceData())
  assert.ok(eastboundRing[0][0] > eastbound.aircraft.coordinate[0])
  assert.ok(
    Math.abs(eastboundRing[0][1] - eastbound.aircraft.coordinate[1]) < 1e-10,
  )
})

test('an exact Flight Geo overlay replay does not restart its GeoJSON source', () => {
  const harness = mapHarness()
  const overlay = flightOverlay(28)

  assert.equal(applyFlightGeoOverlayToMap(harness.map, overlay), true)
  assert.equal(harness.setDataWrites(), 0)

  assert.equal(applyFlightGeoOverlayToMap(harness.map, overlay), true)
  assert.equal(
    harness.setDataWrites(),
    0,
    'the existing serialized source matches the ordered Flight overlay payload',
  )
})

test('Ready reuses the loaded stopped Flight payload when its pixels are unchanged', () => {
  const harness = mapHarness()
  const stopped = {
    ...flightOverlay(28),
    phase: 'stopped' as const,
    readyFrameRequestId: null,
    revision: 'stopped:prepared',
    runId: 0,
  }
  const ready = {
    ...stopped,
    phase: 'ready' as const,
    readyFrameRequestId: 7,
    revision: 'ready:armed',
    runId: 1,
  }

  assert.equal(applyFlightGeoOverlayToMap(harness.map, stopped), true)
  assert.deepEqual(
    flightGeoOverlayMapLibreFeatureCollection(stopped),
    flightGeoOverlayMapLibreFeatureCollection(ready),
    'stopped and first-ready GeoJSON stay byte-equivalent for unchanged pixels',
  )
  assert.equal(applyFlightGeoOverlayToMap(harness.map, ready), true)
  assert.equal(
    harness.setDataWrites(),
    0,
    'phase and ready request metadata must not reset the settled MapLibre worker',
  )
})

test('the authored stopped Flight snapshot projects to the exact Float32 tick-zero payload', () => {
  const vector = (values: readonly number[]) => (
    Object.freeze([...values]) as SpatialVector
  )
  const profile: FlightSimSpatialProfile = Object.freeze({
    aircraftHalfSize: vector([0.5, 0.5, 0.5]),
    blockers: Object.freeze([]),
    id: 'flight-sim:maplibre-tick-zero-float32',
    landingPad: Object.freeze({
      id: 'landing',
      position: vector([0, 0, -400]),
      radiusMeters: 50,
    }),
    sourceKey: 'maplibre-tick-zero-float32',
    spawn: Object.freeze({
      pitch: 0,
      position: vector([0, 400, 81.60000000000001]),
      roll: 0,
      throttle: 0.62,
      velocity: vector([0, 0, -12]),
      yaw: 0,
    }),
    waypoints: Object.freeze([
      Object.freeze({ id: 'waypoint-1', position: vector([0, 400, -100]), radiusMeters: 50 }),
      Object.freeze({ id: 'waypoint-2', position: vector([0, 400, -200]), radiusMeters: 50 }),
      Object.freeze({ id: 'waypoint-3', position: vector([0, 400, -300]), radiusMeters: 50 }),
    ]),
  })
  const runtime = createFlightSimRuntime({
    active: true,
    profile,
    webglSupported: true,
  })
  const stoppedFlight = runtime.read()
  const readyFlight = runtime.start()
  assert.notEqual(
    stoppedFlight.aircraft.position[2],
    profile.spawn.position[2],
    'the regression must exercise authored-double versus ECS-Float32 preview storage',
  )
  assert.deepEqual(stoppedFlight.aircraft, readyFlight.aircraft)

  const stopped = projectFlightSimToGeospatialOverlay(
    stoppedFlight,
    profile,
    { source: 'fixed-follow', view: 'chase' },
    false,
  )
  const ready = projectFlightSimToGeospatialOverlay(
    readyFlight,
    profile,
    { source: 'fixed-follow', view: 'chase' },
    false,
    7,
  )

  assert.deepEqual(stopped.aircraft.coordinate, ready.aircraft.coordinate)
  assert.deepEqual(stopped.camera.centerCoordinate, ready.camera.centerCoordinate)
  assert.deepEqual(
    flightGeoOverlayMapLibreFeatureCollection(stopped),
    flightGeoOverlayMapLibreFeatureCollection(ready),
    'stopped and initial Ready must retain the exact GeoJSON worker payload',
  )
})

test('MapLibre layer exceptions include the failed Flight layer id', () => {
  const cause = new Error('synthetic MapLibre layer failure')
  const harness = mapHarness({
    error: cause,
    layerId: FLIGHT_GEO_OVERLAY_LAYER_IDS.aircraft,
    mode: 'throw',
  })
  const diagnostics: unknown[][] = []
  const originalConsoleError = console.error
  console.error = (...args: unknown[]) => {
    diagnostics.push(args)
  }
  try {
    assert.equal(applyFlightGeoOverlayToMap(harness.map, flightOverlay()), false)
  } finally {
    console.error = originalConsoleError
  }

  assert.equal(diagnostics.length, 1)
  assert.match(
    String(diagnostics[0][0]),
    new RegExp(FLIGHT_GEO_OVERLAY_LAYER_IDS.aircraft),
  )
  assert.equal(diagnostics[0][1], cause)
})

test('MapLibre validation failures are diagnosed when no layer is registered', () => {
  const harness = mapHarness({
    layerId: FLIGHT_GEO_OVERLAY_LAYER_IDS.aircraft,
    mode: 'omit',
  })
  const diagnostics: unknown[][] = []
  const originalConsoleError = console.error
  console.error = (...args: unknown[]) => {
    diagnostics.push(args)
  }
  try {
    assert.equal(applyFlightGeoOverlayToMap(harness.map, flightOverlay()), false)
  } finally {
    console.error = originalConsoleError
  }

  assert.equal(diagnostics.length, 1)
  assert.match(
    String(diagnostics[0][0]),
    new RegExp(FLIGHT_GEO_OVERLAY_LAYER_IDS.aircraft),
  )
  assert.match(
    String((diagnostics[0][1] as Error)?.message),
    /did not register the layer/,
  )
})
