import assert from 'node:assert/strict'
import test from 'node:test'
import {
  projectXrEnvironmentToFlightGeo,
} from '../../canvas/src/features/game-flight-sim/flightSimGeoEnvironmentProjection.ts'
import {
  projectSingaporeLocalMeters,
  type GeospatialCoordinate,
} from '../../canvas/src/lib/gympgrph/api.ts'
import {
  resolveXrSceneLibraryAsset,
} from '../../canvas/src/features/three/xrSceneLibrary.ts'
import {
  applyFlightGeoEnvironmentToMap,
  FLIGHT_GEO_ENVIRONMENT_LAYER_IDS,
  FLIGHT_GEO_ENVIRONMENT_SOURCE_ID,
  mapHasExactFlightGeoEnvironment,
} from '../../gympgrph/src/flightGeoEnvironmentMapLibre.ts'
import type {
  FlightGeoOverlaySnapshot,
} from '../../gympgrph/src/flightGeoOverlay.ts'
import {
  SINGAPORE_MAJOR_POI_GEO_PROFILE,
} from '../../grph-shared/src/geospatial/singaporeMajorPoiGeo.ts'

type FakeSource = {
  data: unknown
  serialize: () => { data: unknown }
  setData: (next: unknown) => void
}

function createFakeMap() {
  const layers = new Map<string, Record<string, unknown>>()
  const sources = new Map<string, FakeSource>()
  const visibility = new Map<string, string>()
  const map = {
    style: { _loaded: true },
    addLayer(layer: Record<string, unknown>) {
      const id = String(layer.id)
      layers.set(id, layer)
      const layout = layer.layout as Record<string, unknown> | undefined
      visibility.set(
        id,
        layout?.visibility === 'none' ? 'none' : 'visible',
      )
    },
    addSource(id: string, input: { data: unknown }) {
      const source: FakeSource = {
        data: input.data,
        serialize: () => ({ data: source.data }),
        setData: next => {
          source.data = next
        },
      }
      sources.set(id, source)
    },
    getLayer: (id: string) => layers.get(id),
    getLayoutProperty(id: string, property: string) {
      return property === 'visibility' ? visibility.get(id) : undefined
    },
    getPaintProperty(id: string, property: string) {
      const paint = layers.get(id)?.paint
      return paint && typeof paint === 'object'
        ? (paint as Record<string, unknown>)[property]
        : undefined
    },
    getSource: (id: string) => sources.get(id),
    isStyleLoaded: () => true,
    removeLayer(id: string) {
      layers.delete(id)
      visibility.delete(id)
    },
    setLayoutProperty(id: string, property: string, value: string) {
      if (property === 'visibility') visibility.set(id, value)
    },
  }
  return { layers, map, sources, visibility }
}

function createOverlay(
  environment: ReturnType<typeof projectXrEnvironmentToFlightGeo>,
): FlightGeoOverlaySnapshot {
  return {
    active: true,
    aircraft: {
      coordinate: environment.anchor,
      altitudeMeters: 10,
      headingDegrees: 0,
    },
    camera: {
      centerCoordinate: environment.anchor,
      cockpitClearance: { forwardMeters: 0, verticalMeters: 0 },
      effectiveOwner: 'fixed-follow',
      source: 'fixed-follow',
      timeline: null,
      view: 'chase',
    },
    environment,
    night: false,
    objective: null,
    phase: 'stopped',
    profileId: 'test',
    readyFrameRequestId: null,
    revision: 'test',
    route: [],
    runId: 0,
    tick: 0,
  }
}

function projectLocalRectangle(
  centerX: number,
  centerZ: number,
  widthMeters: number,
  depthMeters: number,
  rotationDegrees: number,
) {
  const rotationRadians = rotationDegrees * Math.PI / 180
  const cosine = Math.cos(rotationRadians)
  const sine = Math.sin(rotationRadians)
  const halfWidth = widthMeters / 2
  const halfDepth = depthMeters / 2
  const corners = [
    [-halfWidth, -halfDepth],
    [halfWidth, -halfDepth],
    [halfWidth, halfDepth],
    [-halfWidth, halfDepth],
  ] as const
  const ring = corners.map(([offsetX, offsetZ]) => {
    const x = centerX + offsetX * cosine + offsetZ * sine
    const z = centerZ - offsetX * sine + offsetZ * cosine
    return projectSingaporeLocalMeters(x, -z)
  })
  return [...ring, ring[0]]
}

const METERS_PER_LATITUDE_DEGREE = 111_320

function projectedDistanceMeters(
  first: GeospatialCoordinate,
  second: GeospatialCoordinate,
): number {
  const latitudeRadians = (first[1] + second[1]) / 2 * Math.PI / 180
  const eastMeters = (second[0] - first[0]) *
    METERS_PER_LATITUDE_DEGREE * Math.cos(latitudeRadians)
  const northMeters = (second[1] - first[1]) * METERS_PER_LATITUDE_DEGREE
  return Math.hypot(eastMeters, northMeters)
}

function assertApproximately(
  actual: number,
  expected: number,
  message: string,
): void {
  assert.ok(
    Math.abs(actual - expected) < 0.001,
    `${message}: expected ${expected}, received ${actual}`,
  )
}

function assertCoordinateApproximately(
  actual: GeospatialCoordinate,
  expected: GeospatialCoordinate,
  message: string,
): void {
  assertApproximately(actual[0], expected[0], `${message} longitude`)
  assertApproximately(actual[1], expected[1], `${message} latitude`)
}

test('Singapore XR environment projects its stage, named POIs, and selected asset to one geographic anchor', () => {
  const environment = projectXrEnvironmentToFlightGeo({
    stageId: 'singapore',
    subjects: [{
      id: 'subject-helicopter',
      assetId: 'vehicle-helicopter',
      category: 'vehicles',
      label: 'Helicopter',
      color: '#f59e0b',
      position: [4, 2, -3],
      rotationYDegrees: 35,
      scale: 1,
    }],
  })

  assert.equal(environment.id, 'singapore')
  assert.deepEqual(environment.anchor, [103.851959, 1.29027])
  assert.equal(environment.stageFootprint.length, 5)
  assert.equal(
    environment.surfaces.filter(surface => surface.kind === 'poi').length,
    9,
  )
  assert.equal(
    environment.surfaces.some(surface => surface.kind === 'structure'),
    false,
  )
  const helicopter = environment.surfaces.find(
    surface => surface.id === 'subject-helicopter',
  )
  assert.equal(helicopter?.kind, 'subject')
  assert.equal(helicopter?.color, '#f59e0b')
  const helicopterAsset = resolveXrSceneLibraryAsset('vehicle-helicopter')
  assert.deepEqual(helicopterAsset.dimensionsMeters, [7.4, 3.4, 9])
  assert.equal(helicopter?.baseHeightMeters, 2)
  assert.equal(helicopter?.heightMeters, 5.4)
  assert.equal(helicopter?.rings.length, 1)
  assert.equal(helicopter?.rings[0]?.length, 5)
  assert.deepEqual(
    helicopter?.rings[0],
    projectLocalRectangle(4, -3, 7.4, 9, 35),
  )
  assertApproximately(
    projectedDistanceMeters(
      helicopter!.rings[0][0],
      helicopter!.rings[0][1],
    ),
    7.4,
    'helicopter footprint keeps its authored metre width',
  )
  assertApproximately(
    projectedDistanceMeters(
      helicopter!.rings[0][1],
      helicopter!.rings[0][2],
    ),
    9,
    'helicopter footprint keeps its authored metre depth',
  )
  assert.equal(helicopter?.regionalPoiSourceFacts, null)
  const stageFootprint = environment.surfaces.find(
    surface => surface.kind === 'stage-footprint',
  )
  assert.equal(stageFootprint?.baseHeightMeters, 0)
  assert.equal(stageFootprint?.heightMeters, 0.08)
  assert.deepEqual(
    environment.stageFootprint,
    projectLocalRectangle(0, 0, 32, 24, 0),
  )
  assert.deepEqual(
    environment.stageFootprint[0],
    projectSingaporeLocalMeters(-16, 12),
  )
  assert.deepEqual(
    environment.stageFootprint[2],
    projectSingaporeLocalMeters(16, -12),
  )
  assertCoordinateApproximately(
    Object.freeze([
      (environment.stageFootprint[0][0] + environment.stageFootprint[2][0]) / 2,
      (environment.stageFootprint[0][1] + environment.stageFootprint[2][1]) / 2,
    ]) as GeospatialCoordinate,
    projectSingaporeLocalMeters(0, 0),
    'stage footprint keeps its authored local-metre centre',
  )
  assertApproximately(
    projectedDistanceMeters(
      environment.stageFootprint[0],
      environment.stageFootprint[1],
    ),
    32,
    'stage footprint keeps its authored 32 metre width',
  )
  assertApproximately(
    projectedDistanceMeters(
      environment.stageFootprint[1],
      environment.stageFootprint[2],
    ),
    24,
    'stage footprint keeps its authored 24 metre depth',
  )
  assert.deepEqual(environment.anchor, projectSingaporeLocalMeters(0, 0))
  const marinaBaySandsTowerTwo = environment.surfaces.find(
    surface => surface.id === 'marina-bay-sands:tower-2',
  )
  const authoredTowerTwo = SINGAPORE_MAJOR_POI_GEO_PROFILE.surfaces.find(
    surface => surface.id === 'marina-bay-sands:tower-2',
  )
  assert.ok(authoredTowerTwo)
  assert.equal(marinaBaySandsTowerTwo?.baseHeightMeters, 0)
  assert.equal(marinaBaySandsTowerTwo?.heightMeters, 193)
  assert.equal(marinaBaySandsTowerTwo?.poiId, 'marina-bay-sands')
  assert.deepEqual(
    marinaBaySandsTowerTwo?.rings,
    authoredTowerTwo.geometry.coordinates,
  )
  assert.deepEqual(
    marinaBaySandsTowerTwo?.regionalPoiSourceFacts,
    {
      accuracy: authoredTowerTwo.accuracy,
      category: authoredTowerTwo.category,
      provenance: authoredTowerTwo.provenance,
    },
  )

  const recolored = projectXrEnvironmentToFlightGeo({
    stageId: 'singapore',
    subjects: [{
      id: 'subject-helicopter',
      assetId: 'vehicle-helicopter',
      category: 'vehicles',
      label: 'Helicopter',
      color: '#22d3ee',
      position: [4, 2, -3],
      rotationYDegrees: 35,
      scale: 1,
    }],
  })
  assert.notEqual(
    recolored.revision,
    environment.revision,
    'every visible subject color change must produce a new exact revision',
  )
})

test('four MapLibre modes keep planar 2D footprints and native 3D extrusions on the same source revision', () => {
  const environment = projectXrEnvironmentToFlightGeo({
    stageId: 'singapore',
    subjects: [],
  })
  const overlay = createOverlay(environment)
  const { layers, map, sources, visibility } = createFakeMap()

  assert.equal(applyFlightGeoEnvironmentToMap(map, overlay, '2d'), true)
  assert.equal(mapHasExactFlightGeoEnvironment(map, overlay), true)
  assert.equal(
    layers.get(FLIGHT_GEO_ENVIRONMENT_LAYER_IDS.fill2d)?.type,
    'fill',
  )
  assert.equal(
    visibility.get(FLIGHT_GEO_ENVIRONMENT_LAYER_IDS.fill2d),
    'visible',
  )
  assert.equal(
    visibility.get(FLIGHT_GEO_ENVIRONMENT_LAYER_IDS.extrusion3d),
    'none',
  )

  assert.equal(
    applyFlightGeoEnvironmentToMap(map, overlay, '3d-modern'),
    true,
  )
  assert.equal(
    layers.get(FLIGHT_GEO_ENVIRONMENT_LAYER_IDS.extrusion3d)?.type,
    'fill-extrusion',
  )
  assert.equal(
    visibility.get(FLIGHT_GEO_ENVIRONMENT_LAYER_IDS.fill2d),
    'none',
  )
  assert.equal(
    visibility.get(FLIGHT_GEO_ENVIRONMENT_LAYER_IDS.extrusion3d),
    'visible',
  )
  assert.ok(sources.has(FLIGHT_GEO_ENVIRONMENT_SOURCE_ID))
})

test('environment layer creation fails closed when the active style rejects a required layer', () => {
  const environment = projectXrEnvironmentToFlightGeo({
    stageId: 'singapore',
    subjects: [],
  })
  const overlay = createOverlay(environment)
  const { map } = createFakeMap()
  map.addLayer = () => {
    throw new Error('style rejected layer')
  }
  const diagnostics: unknown[][] = []
  const originalConsoleError = console.error
  console.error = (...args: unknown[]) => diagnostics.push(args)
  try {
    assert.equal(
      applyFlightGeoEnvironmentToMap(map, overlay, '3d'),
      false,
    )
  } finally {
    console.error = originalConsoleError
  }
  assert.equal(diagnostics.length, 1)
  assert.match(String(diagnostics[0]?.[0]), /singapore/)
  assert.match(String(diagnostics[0]?.[0]), /mode "3d"/)
})
