import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import {
  SINGAPORE_CANONICAL_CENTER,
  SINGAPORE_FLIGHT_GEO_ANCHOR,
  SINGAPORE_FLIGHT_GEO_REFERENCE,
  SINGAPORE_PRESENTATION_BOUNDS,
  projectSingaporeLocalMeters,
  projectSingaporeLocalRectangle,
} from '../../grph-shared/src/geospatial/singaporeFlightGeo.ts'
import {
  alignMapToSingaporePresentation,
  createSingaporeMapInitialCameraOptions,
  readSingaporeCanvasCameraPolicy,
  readSingaporeMapCameraPolicy,
} from '../../gympgrph/src/features/geospatial/singaporeMapPolicy.ts'

const coordinateIsInsidePresentationBounds = (
  coordinate: readonly [number, number],
): boolean => {
  const [southwest, northeast] = SINGAPORE_PRESENTATION_BOUNDS
  return (
    coordinate[0] >= southwest[0]
    && coordinate[0] <= northeast[0]
    && coordinate[1] >= southwest[1]
    && coordinate[1] <= northeast[1]
  )
}

test('Singapore geography keeps one shared viewport center, flight anchor, and presentation extent', () => {
  assert.deepEqual(SINGAPORE_CANONICAL_CENTER, [103.8198, 1.3521])
  assert.deepEqual(SINGAPORE_FLIGHT_GEO_ANCHOR, [103.851959, 1.29027])
  assert.equal(SINGAPORE_FLIGHT_GEO_REFERENCE.center, SINGAPORE_CANONICAL_CENTER)
  assert.equal(SINGAPORE_FLIGHT_GEO_REFERENCE.anchor, SINGAPORE_FLIGHT_GEO_ANCHOR)
  assert.ok(coordinateIsInsidePresentationBounds(SINGAPORE_CANONICAL_CENTER))
  assert.ok(coordinateIsInsidePresentationBounds(SINGAPORE_FLIGHT_GEO_ANCHOR))
})

test('local meter projection keeps Flight and XR footprints on the shared Singapore anchor', () => {
  assert.deepEqual(projectSingaporeLocalMeters(0, 0), SINGAPORE_FLIGHT_GEO_ANCHOR)

  const ring = projectSingaporeLocalRectangle(32, 24)
  assert.equal(ring.length, 5)
  assert.equal(ring[0], ring[4])
  for (const coordinate of ring) {
    assert.ok(coordinateIsInsidePresentationBounds(coordinate))
  }
  assert.ok(ring[0][0] < SINGAPORE_FLIGHT_GEO_ANCHOR[0])
  assert.ok(ring[1][0] > SINGAPORE_FLIGHT_GEO_ANCHOR[0])
  assert.ok(ring[0][1] < SINGAPORE_FLIGHT_GEO_ANCHOR[1])
  assert.ok(ring[2][1] > SINGAPORE_FLIGHT_GEO_ANCHOR[1])
})

test('2D and 2D-modern share the north-up Singapore camera', () => {
  for (const mode of ['2d', '2d-modern'] as const) {
    const camera = readSingaporeMapCameraPolicy(mode)
    assert.deepEqual(camera.center, SINGAPORE_CANONICAL_CENTER)
    assert.deepEqual(camera.presentationBounds, SINGAPORE_PRESENTATION_BOUNDS)
    assert.equal(camera.pitch, 0)
    assert.equal(camera.bearing, 0)
    assert.equal(camera.zoom, 12)
  }
  assert.equal(
    readSingaporeCanvasCameraPolicy('2d'),
    readSingaporeMapCameraPolicy('2d'),
  )
})

test('3D and 3D-modern share a local oblique Singapore city camera', () => {
  for (const mode of ['3d', '3d-modern'] as const) {
    const camera = readSingaporeMapCameraPolicy(mode)
    assert.deepEqual(camera.center, SINGAPORE_CANONICAL_CENTER)
    assert.deepEqual(camera.presentationBounds, SINGAPORE_PRESENTATION_BOUNDS)
    assert.ok(camera.zoom >= 12)
    assert.ok(camera.pitch >= 45)
    assert.notEqual(camera.bearing, 0)
  }
  assert.equal(
    readSingaporeCanvasCameraPolicy('3d'),
    readSingaporeMapCameraPolicy('3d'),
  )
})

test('MapLibre basemap construction and realignment consume the shared Singapore camera policy', () => {
  const camera = readSingaporeMapCameraPolicy('3d')
  const initial = createSingaporeMapInitialCameraOptions(camera)
  assert.deepEqual(initial.bounds, SINGAPORE_PRESENTATION_BOUNDS)
  assert.equal(initial.fitBoundsOptions.maxZoom, camera.zoom)
  assert.equal(initial.fitBoundsOptions.pitch, camera.pitch)

  const fitCalls: unknown[][] = []
  assert.equal(alignMapToSingaporePresentation({
    fitBounds: (...args: unknown[]) => fitCalls.push(args),
  }, camera), true)
  assert.deepEqual(fitCalls[0]?.[0], SINGAPORE_PRESENTATION_BOUNDS)

  const source = readFileSync(
    path.resolve(
      process.cwd(),
      'gympgrph/src/features/geospatial/useMapLibreBasemap.ts',
    ),
    'utf8',
  )
  assert.match(source, /readSingaporeCanvasCameraPolicy\(canvasRenderMode\)/)
  assert.match(source, /createSingaporeMapInitialCameraOptions\(singaporeCamera\)/)
  assert.match(source, /createMapLibreInitialCameraAlignment\(\{/)
  assert.match(source, /singaporeCamera,/)
  assert.doesNotMatch(source, /INITIAL_3D_ZOOM|INITIAL_3D_PITCH/)
})
