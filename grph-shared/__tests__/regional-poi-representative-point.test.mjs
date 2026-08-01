import assert from 'node:assert/strict'
import test from 'node:test'
import {
  deriveRegionalPoiRepresentativePoint,
} from '../dist/geospatial/regionalPoiGeo.js'

function pointInRing(point, ring) {
  let inside = false
  for (let index = 0, prior = ring.length - 2; index < ring.length - 1; prior = index++) {
    const [x, y] = ring[index]
    const [priorX, priorY] = ring[prior]
    if (
      (y > point[1]) !== (priorY > point[1])
      && point[0] < (priorX - x) * (point[1] - y) / (priorY - y) + x
    ) inside = !inside
  }
  return inside
}

function pointInPolygon(point, polygon) {
  return pointInRing(point, polygon[0])
    && !polygon.slice(1).some(hole => pointInRing(point, hole))
}

test('representative points remain on concave and holed polygon surfaces', () => {
  const concave = [[
    [0, 0], [6, 0], [6, 6], [4, 6], [4, 2],
    [2, 2], [2, 6], [0, 6], [0, 0],
  ]]
  const holed = [[
    [10, 0], [20, 0], [20, 10], [10, 10], [10, 0],
  ], [
    [13, 3], [17, 3], [17, 7], [13, 7], [13, 3],
  ]]

  const concavePoint = deriveRegionalPoiRepresentativePoint([concave])
  const holedPoint = deriveRegionalPoiRepresentativePoint([holed])
  assert.equal(pointInPolygon(concavePoint, concave), true)
  assert.equal(pointInPolygon(holedPoint, holed), true)
  assert.equal(pointInRing(holedPoint, holed[1]), false)
})

test('representative points weight disjoint surfaces and ignore source order', () => {
  const small = [[
    [10, 0], [11, 0], [11, 1], [10, 1], [10, 0],
  ]]
  const large = [[
    [0, 0], [2, 0], [2, 2], [0, 2], [0, 0],
  ]]

  const forward = deriveRegionalPoiRepresentativePoint([small, large])
  const reversed = deriveRegionalPoiRepresentativePoint([large, small])
  assert.deepEqual(reversed, forward)
  assert.equal(pointInPolygon(forward, large), true)
  assert.equal(pointInPolygon(forward, small), false)
})

test('distributed disjoint surfaces preserve each polygon longitude frame', () => {
  const dominant = [[
    [0, 0], [10, 0], [10, 1], [0, 1], [0, 0],
  ]]
  const satellites = Array.from({ length: 35 }, (_, index) => {
    const rawWest = (index + 1) * 10
    const rawEast = rawWest + 0.1
    const west = rawWest > 180 ? rawWest - 360 : rawWest
    const east = rawEast > 180 ? rawEast - 360 : rawEast
    return [[
      [west, 10], [east, 10], [east, 10.1],
      [west, 10.1], [west, 10],
    ]]
  })

  const forward = deriveRegionalPoiRepresentativePoint([
    dominant,
    ...satellites,
  ])
  const reversed = deriveRegionalPoiRepresentativePoint([
    ...satellites.toReversed(),
    dominant,
  ])

  assert.deepEqual(reversed, forward)
  assert.equal(pointInPolygon(forward, dominant), true)
})

test('representative points keep antimeridian polygons contiguous', () => {
  const crossing = [[
    [179, 10], [-179, 10], [-179, 12], [179, 12], [179, 10],
  ]]
  const point = deriveRegionalPoiRepresentativePoint([crossing])

  assert.ok(Math.abs(Math.abs(point[0]) - 180) < 1e-12)
  assert.equal(point[1], 11)
  assert.throws(
    () => deriveRegionalPoiRepresentativePoint([]),
    /requires at least one polygon/,
  )
})

test('representative-point input rejects malformed geographic polygons', () => {
  const valid = [
    [0, 0], [1, 0], [1, 1], [0, 1], [0, 0],
  ]
  const invalidCases = [
    { polygons: null, pattern: /requires at least one polygon/ },
    { polygons: [[]], pattern: /requires at least one ring/ },
    {
      polygons: [[valid.slice(0, 3)]],
      pattern: /requires at least four coordinates/,
    },
    {
      polygons: [[[...valid.slice(0, -1), [0, 2]]]],
      pattern: /must be closed/,
    },
    {
      polygons: [[[[0, 0, 1], ...valid.slice(1)]]],
      pattern: /must be \[longitude, latitude\]/,
    },
    {
      polygons: [[[[181, 0], [1, 0], [1, 1], [0, 1], [181, 0]]]],
      pattern: /longitude must be within/,
    },
    {
      polygons: [[[[0, 95], [1, 95], [1, 96], [0, 96], [0, 95]]]],
      pattern: /latitude must be within/,
    },
    {
      polygons: [[[[0, 0], [1, 0], [1, Number.NaN], [0, 1], [0, 0]]]],
      pattern: /latitude must be within/,
    },
  ]

  for (const { polygons, pattern } of invalidCases) {
    assert.throws(
      () => deriveRegionalPoiRepresentativePoint(polygons),
      pattern,
    )
  }
})
