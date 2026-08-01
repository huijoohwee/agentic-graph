import assert from 'node:assert/strict'
import test from 'node:test'
import {
  applyGeospatialFitRequestForPresentation,
} from '../../../gympgrph/src/geospatialFitRuntime'

const GRAPH_BOUNDS = [103.85, 1.28, 103.87, 1.3] as const
const USER_BOUNDS = [103.8, 1.2, 103.9, 1.4] as const

function createHarness() {
  const cityFits: string[] = []
  const fitBoundsCalls: unknown[][] = []
  const flyToCalls: unknown[] = []
  return {
    cityFits,
    fitBoundsCalls,
    flyToCalls,
    map: {
      fitBounds: (...args: unknown[]) => fitBoundsCalls.push(args),
      flyTo: (options: unknown) => flyToCalls.push(options),
      getZoom: () => 8,
    },
  }
}

test('queued fit-to-data reasserts City authored framing instead of generic graph bounds', () => {
  const harness = createHarness()
  const route = applyGeospatialFitRequestForPresentation({
    map: harness.map,
    request: { mode: 'data' },
    selectedBounds: null,
    graphBounds: GRAPH_BOUNDS,
    enhancedBounds: null,
    padding: 24,
    presentationOwner: 'city',
    applyCityPresentation: () => {
      harness.cityFits.push('city')
    },
  })

  assert.equal(route, 'city-presentation')
  assert.deepEqual(harness.cityFits, ['city'])
  assert.equal(harness.fitBoundsCalls.length, 0)
})

test('owner-null data fit preserves ordinary Geo behavior', () => {
  const harness = createHarness()
  const route = applyGeospatialFitRequestForPresentation({
    map: harness.map,
    request: { mode: 'data' },
    selectedBounds: null,
    graphBounds: GRAPH_BOUNDS,
    enhancedBounds: null,
    padding: 24,
    presentationOwner: null,
    applyCityPresentation: () => {
      harness.cityFits.push('city')
    },
  })

  assert.equal(route, 'generic')
  assert.equal(harness.cityFits.length, 0)
  assert.deepEqual(harness.fitBoundsCalls, [
    [GRAPH_BOUNDS, { padding: 24, duration: 0 }],
  ])
})

test('explicit bounds and current-location requests remain user-authoritative', () => {
  const boundsHarness = createHarness()
  const boundsRoute = applyGeospatialFitRequestForPresentation({
    map: boundsHarness.map,
    request: { mode: 'bounds', bounds: USER_BOUNDS },
    selectedBounds: null,
    graphBounds: GRAPH_BOUNDS,
    enhancedBounds: null,
    padding: 32,
    presentationOwner: 'city',
    applyCityPresentation: () => {
      boundsHarness.cityFits.push('city')
    },
  })
  assert.equal(boundsRoute, 'generic')
  assert.deepEqual(boundsHarness.fitBoundsCalls, [
    [USER_BOUNDS, { padding: 32, duration: 0 }],
  ])
  assert.equal(boundsHarness.cityFits.length, 0)

  const locationHarness = createHarness()
  const locationRoute = applyGeospatialFitRequestForPresentation({
    map: locationHarness.map,
    request: {
      mode: 'currentLocation',
      lng: 103.8198,
      lat: 1.3521,
      zoom: 15,
    },
    selectedBounds: null,
    graphBounds: GRAPH_BOUNDS,
    enhancedBounds: null,
    padding: 32,
    presentationOwner: 'flight',
    applyCityPresentation: () => {
      locationHarness.cityFits.push('city')
    },
  })
  assert.equal(locationRoute, 'generic')
  assert.deepEqual(locationHarness.flyToCalls, [{
    center: [103.8198, 1.3521],
    zoom: 15,
    duration: 0,
  }])
  assert.equal(locationHarness.cityFits.length, 0)
})

test('automatic selection and Flight data fits cannot steal a gameplay camera', () => {
  for (const [presentationOwner, mode] of [
    ['city', 'selection'],
    ['flight', 'data'],
  ] as const) {
    const harness = createHarness()
    const route = applyGeospatialFitRequestForPresentation({
      map: harness.map,
      request: { mode },
      selectedBounds: GRAPH_BOUNDS,
      graphBounds: GRAPH_BOUNDS,
      enhancedBounds: null,
      padding: 24,
      presentationOwner,
      applyCityPresentation: () => {
        harness.cityFits.push('city')
      },
    })
    assert.equal(route, 'ignore')
    assert.equal(harness.fitBoundsCalls.length, 0)
    assert.equal(harness.cityFits.length, 0)
  }
})
