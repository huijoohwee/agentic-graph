import assert from 'node:assert/strict'
import test from 'node:test'
import {
  projectXrEnvironmentToFlightGeo,
} from '../../canvas/src/features/game-flight-sim/flightSimGeoEnvironmentProjection.ts'
import {
  projectFlightSimMissionPositionToGeospatial,
} from '../../canvas/src/features/game-flight-sim/flightSimGeospatialCoordinates.ts'
import {
  createFlightSimSpatialProfile,
} from '../../canvas/src/features/game-flight-sim/flightSimSpatialProfile.ts'
import {
  resolveXrCanonicalSceneSpatialSource,
} from '../../canvas/src/features/three/xrCanonicalSceneSpatialSource.ts'
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
      layers.set(String(layer.id), layer)
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
    getSource: (id: string) => sources.get(id),
    isStyleLoaded: () => true,
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

function singaporeFlightProfile() {
  return createFlightSimSpatialProfile(
    resolveXrCanonicalSceneSpatialSource({
      projection: 'authored',
      stageId: 'singapore',
    }),
  )
}

function projectLocalRectangle(
  centerX: number,
  centerZ: number,
  widthMeters: number,
  depthMeters: number,
  rotationDegrees: number,
  profile: ReturnType<typeof singaporeFlightProfile>,
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
  const ring = corners.map(([offsetX, offsetZ]) => projectFlightSimMissionPositionToGeospatial(
    Object.freeze([
      centerX + offsetX * cosine + offsetZ * sine,
      0,
      centerZ - offsetX * sine + offsetZ * cosine,
    ]),
    profile.spawn.position,
  ))
  return [...ring, ring[0]]
}

test('Singapore XR environment projects its stage, structures, and selected asset to one geographic anchor', () => {
  const profile = singaporeFlightProfile()
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
  }, profile)

  assert.equal(environment.id, 'singapore')
  assert.deepEqual(environment.anchor, [103.851959, 1.29027])
  assert.equal(environment.stageFootprint.length, 5)
  assert.equal(
    environment.surfaces.filter(surface => surface.kind === 'structure').length,
    9,
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
  assert.equal(helicopter?.ring.length, 5)
  assert.deepEqual(
    helicopter?.ring,
    projectLocalRectangle(4, -3, 7.4, 9, 35, profile),
  )
  const stageFootprint = environment.surfaces.find(
    surface => surface.kind === 'stage-footprint',
  )
  assert.equal(stageFootprint?.baseHeightMeters, 0)
  assert.equal(stageFootprint?.heightMeters, 0.08)
  assert.deepEqual(
    environment.stageFootprint,
    projectLocalRectangle(0, 0, 32, 24, 0, profile),
  )
  assert.deepEqual(
    environment.stageFootprint[0],
    projectFlightSimMissionPositionToGeospatial(
      Object.freeze([-16, 0, -12]),
      profile.spawn.position,
    ),
  )
  assert.deepEqual(environment.anchor, projectFlightSimMissionPositionToGeospatial(
    profile.spawn.position,
    profile.spawn.position,
  ))
  const skylineCenter = environment.surfaces.find(
    surface => surface.id === 'skyline-center',
  )
  assert.equal(skylineCenter?.baseHeightMeters, 0)
  assert.equal(skylineCenter?.heightMeters, 12)

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
  }, profile)
  assert.notEqual(
    recolored.revision,
    environment.revision,
    'every visible subject color change must produce a new exact revision',
  )
})

test('four MapLibre modes keep planar 2D footprints and native 3D extrusions on the same source revision', () => {
  const profile = singaporeFlightProfile()
  const environment = projectXrEnvironmentToFlightGeo({
    stageId: 'singapore',
    subjects: [],
  }, profile)
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
  const profile = singaporeFlightProfile()
  const environment = projectXrEnvironmentToFlightGeo({
    stageId: 'singapore',
    subjects: [],
  }, profile)
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
