import assert from 'node:assert/strict'
import test from 'node:test'
import { createMapLibreInitialCameraAlignment } from '../../../gympgrph/src/features/geospatial/mapLibreInitialCameraAlignment'
import { readSingaporeCanvasCameraPolicy } from '../../../gympgrph/src/features/geospatial/singaporeMapPolicy'

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

test('Flight bootstrap retains staged camera through style.load, load, resize, and queued frame', () => {
  const harness = createMapHarness()
  const frames: Array<() => void> = []
  const align = createMapLibreInitialCameraAlignment({
    canvasRenderMode: '3d',
    flightBootstrapActive: true,
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
    flightBootstrapActive: false,
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
