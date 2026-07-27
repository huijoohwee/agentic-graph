import assert from 'node:assert/strict'
import test from 'node:test'
import {
  GEO_XR_ENVIRONMENT_PRESENTATION_IDS,
  resolveGeoXrEnvironmentPresentation,
  resolveGeoXrPlanCameraFraming,
} from '@/features/three/xrGeoEnvironmentPresentation'

test('Geo+XR maps each selectable Geo view to one distinct shared-stage presentation', () => {
  const cases = [
    ['2d', '2d-classic', 'planar', 'classic'],
    ['2d-modern', '2d-modern', 'planar', 'modern'],
    ['3d', '3d-classic', 'volumetric', 'classic'],
    ['3d-modern', '3d-modern', 'volumetric', 'modern'],
  ] as const
  assert.deepEqual(
    cases.map(([viewMode]) => resolveGeoXrEnvironmentPresentation(viewMode).id),
    GEO_XR_ENVIRONMENT_PRESENTATION_IDS,
  )
  for (const [viewMode, id, dimension, theme] of cases) {
    const presentation = resolveGeoXrEnvironmentPresentation(viewMode)
    assert.equal(presentation.id, id)
    assert.equal(presentation.dimension, dimension)
    assert.equal(presentation.theme, theme)
  }
  assert.equal(resolveGeoXrEnvironmentPresentation('2d-svg').id, '2d-classic')
})

test('Geo+XR planar framing is north-up and uses the existing camera above Flight', () => {
  const framing = resolveGeoXrPlanCameraFraming({
    aircraftPosition: [3, 8, -5],
    aspect: 16 / 9,
    coordinateScale: 0.05,
    stageSizeMeters: [32, 24],
  })
  assert.ok(Math.abs(framing.target[0] - 0.15) < Number.EPSILON)
  assert.equal(framing.target[1], 0.4)
  assert.equal(framing.target[2], -0.25)
  assert.equal(framing.position[0], framing.target[0])
  assert.ok(framing.position[1] > framing.target[1])
  assert.ok(framing.position[2] > framing.target[2])
  assert.ok(
    framing.position[2] - framing.target[2]
      < (framing.position[1] - framing.target[1]) * 0.001,
  )
  assert.equal(framing.fovDegrees, 50)

  const portrait = resolveGeoXrPlanCameraFraming({
    aircraftPosition: [3, 8, -5],
    aspect: 9 / 16,
    coordinateScale: 0.05,
    stageSizeMeters: [32, 24],
  })
  assert.ok(
    portrait.position[1] - portrait.target[1]
      > framing.position[1] - framing.target[1],
  )
})
