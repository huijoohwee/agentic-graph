import test from 'node:test'
import assert from 'node:assert/strict'
import type { FlightGeoOverlaySnapshot } from '../../../gympgrph/src/flightGeoOverlay'
import {
  applyFlightGeoOverlayCameraToMap,
  applyFlightGeoOverlayToMap,
  FLIGHT_GEO_AIRCRAFT_IMAGE_IDS,
  FLIGHT_GEO_OVERLAY_LAYER_IDS,
  FLIGHT_GEO_OVERLAY_SOURCE_ID,
} from '../../../gympgrph/src/flightGeoOverlayMapLibre'

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
  const map = {
    jumpTo: (camera: Record<string, unknown>) => calls.push(camera),
  }
  const overlay = flightOverlay(72)

  for (const mode of ['2d', '2d-modern']) {
    assert.equal(
      applyFlightGeoOverlayCameraToMap(map, overlay, mode),
      true,
    )
    assert.equal(calls.at(-1)?.pitch, 0)
    assert.equal(calls.at(-1)?.bearing, 0)
  }
  for (const mode of ['3d', '3d-modern']) {
    assert.equal(
      applyFlightGeoOverlayCameraToMap(map, overlay, mode),
      true,
    )
    assert.equal(calls.at(-1)?.pitch, 48)
    assert.equal(calls.at(-1)?.bearing, 72)
  }
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
    serialize: () => { data: unknown }
    setData: (data: unknown) => void
  }>()
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
        serialize: () => ({ data: stored.data }),
        setData: (data: unknown) => {
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
