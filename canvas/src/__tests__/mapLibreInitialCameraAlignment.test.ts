import assert from 'node:assert/strict'
import test from 'node:test'
import { createMapLibreInitialCameraAlignment } from '../../../gympgrph/src/features/geospatial/mapLibreInitialCameraAlignment'
import { readGeospatialPresentationCameraOwner } from '../../../gympgrph/src/features/geospatial/geospatialPresentationCameraOwner'
import { readSingaporeCanvasCameraPolicy } from '../../../gympgrph/src/features/geospatial/singaporeMapPolicy'
import { createCityGeoOverlayMapLibreController } from '../../../gympgrph/src/cityGeoOverlayMapLibreController'
import {
  readFlightGeoOverlay,
  setFlightGeoOverlay,
} from '../../../gympgrph/src/flightGeoOverlay'
import {
  createSyntheticCityGeoOverlaySnapshot,
  TEST_LAYER_ANCHOR,
  TestMapLibreMap,
} from './helpers/cityGeoOverlayMapLibreHarness'

function createMapHarness() {
  const fitBoundsCalls: unknown[][] = []
  return {
    fitBoundsCalls,
    map: {
      fitBounds: (...args: unknown[]) => {
        fitBoundsCalls.push(args)
      },
    },
  }
}

test('gameplay camera claim retains authored camera through style.load, load, resize, and queued frame', () => {
  const harness = createMapHarness()
  const frames: Array<() => void> = []
  const align = createMapLibreInitialCameraAlignment({
    canvasRenderMode: '3d',
    hasPresentationCameraClaim: () => true,
    isCurrent: () => true,
    map: () => harness.map,
    requestFrame: callback => frames.push(callback),
    singaporeCamera: readSingaporeCanvasCameraPolicy('3d'),
  })

  // A clean map can report these in either order while the Flight stopped
  // presenter is committing its fixed-follow camera.
  align() // style.load
  align() // load
  align() // ResizeObserver
  for (const frame of frames) frame()

  assert.equal(harness.fitBoundsCalls.length, 0)
  assert.equal(frames.length, 0)
})

test('ordinary 3D maps keep the Singapore load and queued-frame alignment', () => {
  const harness = createMapHarness()
  const frames: Array<() => void> = []
  const align = createMapLibreInitialCameraAlignment({
    canvasRenderMode: '3d',
    hasPresentationCameraClaim: () => false,
    isCurrent: () => true,
    map: () => harness.map,
    requestFrame: callback => frames.push(callback),
    singaporeCamera: readSingaporeCanvasCameraPolicy('3d'),
  })

  align() // style.load
  align() // load
  align() // ResizeObserver
  assert.equal(harness.fitBoundsCalls.length, 1)
  assert.equal(frames.length, 1)

  frames[0]!()
  assert.equal(harness.fitBoundsCalls.length, 2)
})

test('a City presentation claim before load suppresses the stale generic alignment', () => {
  const harness = createMapHarness()
  const frames: Array<() => void> = []
  let cityCameraClaimed = false
  const align = createMapLibreInitialCameraAlignment({
    canvasRenderMode: '3d',
    hasPresentationCameraClaim: () => cityCameraClaimed,
    isCurrent: () => true,
    map: () => harness.map,
    requestFrame: callback => frames.push(callback),
    singaporeCamera: readSingaporeCanvasCameraPolicy('3d'),
  })

  // The provider map mounted before City activated. Its delayed load callback
  // observes the live City claim instead of the stale construction snapshot.
  cityCameraClaimed = true
  align() // delayed load
  for (const frame of frames) frame() // any queued resize/load frame

  assert.equal(harness.fitBoundsCalls.length, 0)
  assert.equal(frames.length, 0)
})

test('a synchronous overlay publication claims the camera before the React owner prop commits', () => {
  const harness = createMapHarness()
  const previousOverlay = readFlightGeoOverlay()
  const pendingReactOwner = null
  const align = createMapLibreInitialCameraAlignment({
    canvasRenderMode: '3d',
    hasPresentationCameraClaim: () => (
      readGeospatialPresentationCameraOwner(pendingReactOwner) !== null
    ),
    isCurrent: () => true,
    map: () => harness.map,
    singaporeCamera: readSingaporeCanvasCameraPolicy('3d'),
  })

  try {
    setFlightGeoOverlay({
      ...previousOverlay,
      active: true,
      presentationOwner: 'city',
      revision: 'city-published-before-react-commit',
    })

    align() // delayed load observes the store, while the prop is still null
    assert.equal(harness.fitBoundsCalls.length, 0)
  } finally {
    setFlightGeoOverlay(previousOverlay)
  }
})

test('a City camera claim defers generic alignment to authored framing', () => {
  const map = new TestMapLibreMap()
  const frames: Array<() => void> = []
  const alignInitialCamera = createMapLibreInitialCameraAlignment({
    canvasRenderMode: '3d',
    hasPresentationCameraClaim: () => true,
    isCurrent: () => true,
    map: () => map,
    requestFrame: callback => frames.push(callback),
    singaporeCamera: readSingaporeCanvasCameraPolicy('3d'),
  })

  assert.equal(alignInitialCamera(), false)
  assert.equal(map.fitBoundsCalls.length, 0)
  assert.equal(frames.length, 0)

  const snapshot = createSyntheticCityGeoOverlaySnapshot()
  const controller = createCityGeoOverlayMapLibreController({
    beforeLayerId: TEST_LAYER_ANCHOR,
    map,
    readSnapshot: () => snapshot,
    subscribe: () => () => undefined,
    viewMode: '3d',
  })
  assert.equal(map.fitBoundsCalls.length, 1)
  assert.equal(map.fitBoundsCalls[0]?.options.pitch, 52)
  controller.dispose()
})

test('a City claim suppresses a generic Singapore alignment already queued for the next frame', () => {
  const harness = createMapHarness()
  const frames: Array<() => void> = []
  let cityCameraClaimed = false
  const align = createMapLibreInitialCameraAlignment({
    canvasRenderMode: '3d',
    hasPresentationCameraClaim: () => cityCameraClaimed,
    isCurrent: () => true,
    map: () => harness.map,
    requestFrame: callback => frames.push(callback),
    singaporeCamera: readSingaporeCanvasCameraPolicy('3d'),
  })

  assert.equal(align(), true)
  assert.equal(harness.fitBoundsCalls.length, 1)
  assert.equal(frames.length, 1)

  cityCameraClaimed = true
  frames.shift()?.()

  assert.equal(
    harness.fitBoundsCalls.length,
    1,
    'the queued generic fit cannot overwrite City camera ownership',
  )
})
