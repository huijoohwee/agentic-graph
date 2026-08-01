import test from 'node:test'
import assert from 'node:assert/strict'
import {
  applyFlightGeoOverlayToMap,
  flightGeoOverlayFeatureCollection,
  FLIGHT_GEO_AIRCRAFT_IMAGE_IDS,
  FLIGHT_GEO_OVERLAY_LAYER_IDS,
  FLIGHT_GEO_OVERLAY_SOURCE_ID,
  mapHasExactFlightGeoOverlay,
  mapHasExactFlightGeoStyleSources,
} from '../../../gympgrph/src/flightGeoOverlayMapLibre'
import { createFlightSimRuntime } from '../features/game-flight-sim/flightSimRuntimeCore'
import {
  projectFlightSimToGeospatialOverlay,
} from '../features/game-flight-sim/flightSimGeospatialProjection'
import type { FlightSimSpatialProfile } from '../features/game-flight-sim/flightSimModel'
import type { SpatialVector } from '../features/physics/spatialPhysicsTypes'
import { flightOverlay } from './helpers/flightSimMapLibreFixtures'

type LayerDefinition = Readonly<{
  filter?: unknown
  id: unknown
  layout?: Readonly<Record<string, unknown>>
  paint?: Readonly<Record<string, unknown>>
  source?: unknown
  type?: unknown
}>

type LayerFailure = Readonly<{
  error?: Error
  layerId: string
  mode: 'omit' | 'throw'
}>

function mapHarness(failure?: LayerFailure) {
  const layers = new Map<string, LayerDefinition>()
  const sourceDefinitions = new Map<string, Record<string, unknown>>()
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
    addSource: (
      sourceId: string,
      source: Record<string, unknown> & { data: unknown },
    ) => {
      sourceDefinitions.set(sourceId, { ...source })
      const stored = {
        data: source.data,
        loaded: () => true,
        serialize: () => ({ data: stored.data }),
        setData: (data: unknown) => {
          setDataWrites += 1
          stored.data = data
          sourceDefinitions.set(sourceId, {
            ...sourceDefinitions.get(sourceId),
            data,
          })
        },
      }
      sources.set(sourceId, stored)
    },
    getLayer: (layerId: string) => layers.get(layerId),
    getLayoutProperty: (layerId: string, property: string) => (
      layers.get(layerId)?.layout?.[property]
    ),
    getImage: (imageId: string) => images.get(imageId),
    getSource: (sourceId: string) => sources.get(sourceId),
    getStyle: () => ({
      layers: [...layers.values()],
      sources: Object.fromEntries(sourceDefinitions),
    }),
    hasImage: (imageId: string) => images.has(imageId),
    moveLayer: () => undefined,
    removeLayer: (layerId: string) => {
      layers.delete(layerId)
    },
    removeSource: (sourceId: string) => {
      sources.delete(sourceId)
      sourceDefinitions.delete(sourceId)
    },
  }
  return {
    images,
    layers,
    map,
    mutateSourceOptions: (options: Record<string, unknown>) => {
      const source = sourceDefinitions.get(FLIGHT_GEO_OVERLAY_SOURCE_ID)
      assert.ok(source)
      sourceDefinitions.set(FLIGHT_GEO_OVERLAY_SOURCE_ID, {
        ...source,
        ...options,
      })
    },
    readSourceData: () => sources.get(FLIGHT_GEO_OVERLAY_SOURCE_ID)?.data,
    readSourceDefinition: () =>
      sourceDefinitions.get(FLIGHT_GEO_OVERLAY_SOURCE_ID),
    setDataWrites: () => setDataWrites,
  }
}

function readAircraftPoint(sourceData: unknown): Readonly<{
  coordinate: number[]
  headingDegrees: number
}> {
  const features = (sourceData as {
    features?: {
      geometry?: { coordinates?: unknown; type?: unknown }
      properties?: Record<string, unknown>
    }[]
  })?.features
  const aircraftShape = features?.find(
    feature => feature.properties?.kgFlightOverlayKind === 'aircraft',
  )
  assert.equal(aircraftShape?.geometry?.type, 'Point')
  const coordinate = aircraftShape?.geometry?.coordinates as number[]
  assert.equal(coordinate.length, 2)
  return {
    coordinate,
    headingDegrees: Number(aircraftShape?.properties?.headingDegrees),
  }
}

test('MapLibre aircraft uses canonical Point data and a fixed-pixel native symbol', () => {
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
  const northboundPoint = readAircraftPoint(sourceData)
  assert.deepEqual(northboundPoint.coordinate, northbound.aircraft.coordinate)
  assert.equal(northboundPoint.headingDegrees, northbound.aircraft.headingDegrees)

  const aircraftLayer = harness.layers.get(
    FLIGHT_GEO_OVERLAY_LAYER_IDS.aircraft,
  )
  const aircraftOutlineLayer = harness.layers.get(
    FLIGHT_GEO_OVERLAY_LAYER_IDS.aircraftOutline,
  )
  assert.ok(aircraftOutlineLayer)
  assert.equal(aircraftOutlineLayer?.type, 'symbol')
  assert.equal(aircraftOutlineLayer?.layout?.['icon-size'], 1.2)
  assert.deepEqual(aircraftOutlineLayer?.layout?.['icon-rotate'], [
    'get',
    'headingDegrees',
  ])
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

  harness.layers.set(FLIGHT_GEO_OVERLAY_LAYER_IDS.aircraftOutline, {
    ...aircraftOutlineLayer,
    layout: undefined,
    paint: {
      'fill-color': '#0f172a',
      'fill-translate': [0, 2],
    },
    type: 'fill',
  })
  assert.equal(mapHasExactFlightGeoOverlay(harness.map, northbound), false)
  assert.equal(applyFlightGeoOverlayToMap(harness.map, northbound), true)
  assert.equal(mapHasExactFlightGeoOverlay(harness.map, northbound), true)
  assert.equal(
    harness.layers.get(FLIGHT_GEO_OVERLAY_LAYER_IDS.aircraftOutline)?.type,
    'symbol',
    'a retained polygon outline must be replaced before it can cover the map',
  )

  const eastbound = flightOverlay(90)
  assert.equal(applyFlightGeoOverlayToMap(harness.map, eastbound), true)
  const eastboundPoint = readAircraftPoint(harness.readSourceData())
  assert.deepEqual(eastboundPoint.coordinate, eastbound.aircraft.coordinate)
  assert.equal(eastboundPoint.headingDegrees, 90)
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

test('Flight rebuilds a GeoJSON source with noncanonical owned options', () => {
  const harness = mapHarness()
  const overlay = flightOverlay(28)

  assert.equal(applyFlightGeoOverlayToMap(harness.map, overlay), true)
  assert.equal(mapHasExactFlightGeoStyleSources(harness.map, overlay), true)

  harness.mutateSourceOptions({ cluster: true })
  assert.equal(mapHasExactFlightGeoStyleSources(harness.map, overlay), false)
  assert.equal(applyFlightGeoOverlayToMap(harness.map, overlay), true)
  assert.equal(mapHasExactFlightGeoStyleSources(harness.map, overlay), true)
  assert.deepEqual(
    Object.keys(harness.readSourceDefinition() || {}).sort(),
    ['data', 'type'],
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
    flightGeoOverlayFeatureCollection(stopped),
    flightGeoOverlayFeatureCollection(ready),
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
    flightGeoOverlayFeatureCollection(stopped),
    flightGeoOverlayFeatureCollection(ready),
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
