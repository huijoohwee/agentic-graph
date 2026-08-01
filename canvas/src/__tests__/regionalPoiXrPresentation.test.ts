import assert from 'node:assert/strict'
import { ExtrudeGeometry } from 'three'
import type {
  RegionalPoiCoordinate,
  RegionalPoiProfile,
} from 'grph-shared/geospatial/regionalPoiGeo'
import { SINGAPORE_MAJOR_POI_GEO_PROFILE } from 'grph-shared/geospatial/singaporeMajorPoiGeo'
import {
  createRegionalPoiXrPresentation,
} from '@/features/three/regionalPoiXrPresentation'
import {
  createXrRegionalPoiExtrusionShape,
  createXrRegionalPoiSurfaceRenderPlan,
  createXrRegionalPoiSurfaceUserData,
} from '@/features/three/xrRegionalPoiSurfaceRenderPlan'
import {
  createXrRegionalPoiPolygonRenderResources,
} from '@/features/three/XrRegionalPoiSurfaceGeometry'
import {
  XR_SINGAPORE_POI_SURFACE_RENDER_PLAN,
} from '@/features/three/XrSingaporeTerrainGeometry'

const SOURCE = Object.freeze({
  authority: 'Test authority',
  snapshotAt: '2026-07-31T00:00:00Z',
  sourceId: 'test:polygon/1',
  sourceUrl: 'https://example.com/polygon/1',
  sourceVersion: '1',
})

const OUTER_RING = Object.freeze([
  [103, 1],
  [103.004, 1],
  [103.004, 1.004],
  [103.002, 1.004],
  [103.002, 1.002],
  [103, 1.002],
  [103, 1],
] as const satisfies readonly RegionalPoiCoordinate[])

const HOLE_RING = Object.freeze([
  [103.0025, 1.0005],
  [103.0025, 1.0015],
  [103.0035, 1.0015],
  [103.0035, 1.0005],
  [103.0025, 1.0005],
] as const satisfies readonly RegionalPoiCoordinate[])

const PROFILE: RegionalPoiProfile = Object.freeze({
  attribution: Object.freeze([Object.freeze({
    licenseName: 'Test licence',
    licenseUrl: 'https://example.com/licence',
    text: 'Test data',
    url: 'https://example.com/data',
  })]),
  dataPolicy: Object.freeze({
    runtimeNetwork: 'forbidden',
    storage: 'checked-in',
  }),
  id: 'test:concave-with-hole/v1',
  pois: Object.freeze([Object.freeze({ id: 'test-poi', label: 'Test POI' })]),
  region: Object.freeze({ code: 'TST', label: 'Test Region' }),
  revision: '1',
  schema: 'knowgrph.regional-poi-profile/v1',
  surfaces: Object.freeze([Object.freeze({
    accuracy: Object.freeze({
      footprint: 'source-polygon',
      height: 'source-recorded',
      statement: 'Exact test footprint and height.',
    }),
    baseHeightMeters: 4,
    category: 'building',
    geometry: Object.freeze({
      coordinates: Object.freeze([OUTER_RING, HOLE_RING]),
      type: 'Polygon',
    }),
    heightMeters: 14,
    id: 'test-poi:main-building',
    label: 'Test Building',
    poiId: 'test-poi',
    provenance: Object.freeze({
      context: Object.freeze([]),
      geometry: SOURCE,
      height: SOURCE,
    }),
  })]),
})

function ringArea(ring: readonly (readonly [number, number])[]): number {
  return Math.abs(ring.slice(0, -1).reduce((area, point, index) => {
    const next = ring[(index + 1) % (ring.length - 1)]
    return area + point[0] * next[1] - next[0] * point[1]
  }, 0)) / 2
}

function capArea(geometry: ExtrudeGeometry): number {
  const positions = geometry.getAttribute('position')
  let area = 0
  for (let index = 0; index < positions.count; index += 3) {
    const z = [
      positions.getZ(index),
      positions.getZ(index + 1),
      positions.getZ(index + 2),
    ]
    if (Math.max(...z) - Math.min(...z) > Number.EPSILON) continue
    const ax = positions.getX(index)
    const ay = positions.getY(index)
    const bx = positions.getX(index + 1)
    const by = positions.getY(index + 1)
    const cx = positions.getX(index + 2)
    const cy = positions.getY(index + 2)
    area += Math.abs((bx - ax) * (cy - ay) - (by - ay) * (cx - ax)) / 2
  }
  return area
}

export function testRegionalPoiXrProjectionRetainsPolygonAndMetadata() {
  const presentation = createRegionalPoiXrPresentation({
    paddingRatio: 0,
    profile: PROFILE,
    sizeMeters: [40, 40],
    styleByCategory: {
      building: {
        color: '#c8d5dd',
        presentation: 'polygon-extrusion',
        tone: 'light',
      },
    },
  })
  const surface = presentation.surfaces[0]
  assert.ok(surface)
  assert.equal(surface.rings.length, 2)
  assert.deepEqual(
    surface.rings.map(ring => ring.length),
    PROFILE.surfaces[0].geometry.coordinates.map(ring => ring.length),
  )
  assert.deepEqual(surface.rings[0][0], surface.rings[0].at(-1))
  assert.deepEqual(surface.rings[1][0], surface.rings[1].at(-1))
  assert.notDeepEqual(surface.rings[0][4], surface.rings[0][3])
  assert.equal(surface.baseHeightMeters, 4)
  assert.equal(surface.heightMeters, 14)
  assert.equal(surface.baseHeight, presentation.scale * 4)
  assert.equal(surface.topHeight, presentation.scale * 14)
  assert.equal(surface.category, 'building')
  assert.equal(surface.poiLabel, 'Test POI')
  assert.deepEqual(surface.accuracy, PROFILE.surfaces[0].accuracy)
  assert.deepEqual(surface.provenance, PROFILE.surfaces[0].provenance)
  assert.equal(Object.isFrozen(surface.rings), true)
  assert.equal(surface.rings.every(Object.isFrozen), true)

  const shape = createXrRegionalPoiExtrusionShape(surface)
  assert.equal(shape.curves.length, OUTER_RING.length - 1)
  assert.equal(shape.holes.length, 1)
  assert.equal(shape.holes[0].curves.length, HOLE_RING.length - 1)
  const geometry = new ExtrudeGeometry(shape, {
    bevelEnabled: false,
    curveSegments: 1,
    depth: surface.topHeight - surface.baseHeight,
    steps: 1,
  })
  const expectedFootprintArea = ringArea(surface.rings[0])
    - ringArea(surface.rings[1])
  assert.ok(geometry.getAttribute('position').count > 0)
  const triangulatedFootprintArea = capArea(geometry) / 2
  assert.ok(
    Math.abs(triangulatedFootprintArea - expectedFootprintArea)
      < expectedFootprintArea * 1e-6,
    `triangulated caps must preserve footprint area ${expectedFootprintArea}; received ${triangulatedFootprintArea}`,
  )
  geometry.dispose()
}

export function testSingaporeXrPoiRenderPlanIsSourceComplete() {
  const entries = XR_SINGAPORE_POI_SURFACE_RENDER_PLAN.flatMap(
    poi => [...poi.surfaces],
  )
  const sourceIds = SINGAPORE_MAJOR_POI_GEO_PROFILE.surfaces.map(
    surface => surface.id,
  )
  assert.deepEqual(entries.map(entry => entry.surface.id), sourceIds)
  assert.equal(new Set(entries.map(entry => entry.surface.id)).size, sourceIds.length)
  assert.equal(
    entries.every(entry => sourceIds.includes(entry.surface.id)),
    true,
    'render plan must not contain an unsourced fixture surface',
  )
  assert.equal(
    entries.filter(entry => entry.renderer === 'polygon-extrusion').every(
      entry => entry.surface.rings.length > 0,
    ),
    true,
  )
  for (const entry of entries) {
    assert.deepEqual(
      Object.keys(createXrRegionalPoiSurfaceUserData(entry.surface)).sort(),
      [
        'accuracy',
        'baseHeightMeters',
        'category',
        'collidable',
        'heightMeters',
        'interactive',
        'poiId',
        'poiLabel',
        'provenance',
        'selectable',
        'surfaceId',
        'surfaceLabel',
      ],
    )
    if (entry.renderer !== 'polygon-extrusion') continue
    const resources = createXrRegionalPoiPolygonRenderResources(entry.surface)
    const geometryPosition = resources.geometry.getAttribute('position')
    const edgePosition = resources.edgeGeometry.getAttribute('position')
    assert.ok(geometryPosition.count > 0)
    assert.ok(edgePosition.count > 0)
    resources.geometry.computeBoundingBox()
    const bounds = resources.geometry.boundingBox
    assert.ok(bounds)
    const expectedDepth = entry.surface.topHeight - entry.surface.baseHeight
    assert.ok(Math.abs(bounds.max.z - bounds.min.z - expectedDepth) < 1e-6)
    const ringCoordinates = entry.surface.rings.flatMap(ring => [...ring])
    const expectedX = ringCoordinates.map(coordinate => coordinate[0])
    const expectedY = ringCoordinates.map(coordinate => -coordinate[1])
    assert.ok(Math.abs(bounds.min.x - Math.min(...expectedX)) < 1e-6)
    assert.ok(Math.abs(bounds.max.x - Math.max(...expectedX)) < 1e-6)
    assert.ok(Math.abs(bounds.min.y - Math.min(...expectedY)) < 1e-6)
    assert.ok(Math.abs(bounds.max.y - Math.max(...expectedY)) < 1e-6)
    let geometryDisposals = 0
    let edgeDisposals = 0
    resources.geometry.addEventListener('dispose', () => { geometryDisposals += 1 })
    resources.edgeGeometry.addEventListener('dispose', () => { edgeDisposals += 1 })
    resources.dispose()
    resources.dispose()
    assert.equal(geometryDisposals, 1)
    assert.equal(edgeDisposals, 1)
  }
}

export function testRegionalPoiXrRenderPlanningRejectsDuplicateSurfaceIdentities() {
  const presentation = createRegionalPoiXrPresentation({
    profile: PROFILE,
    sizeMeters: [40, 40],
    styleByCategory: {
      building: {
        color: '#c8d5dd',
        presentation: 'polygon-extrusion',
        tone: 'light',
      },
    },
  })
  assert.throws(
    () => createXrRegionalPoiSurfaceRenderPlan([
      presentation.surfaces[0],
      presentation.surfaces[0],
    ]),
    /Duplicate XR regional POI surface/,
  )
}
