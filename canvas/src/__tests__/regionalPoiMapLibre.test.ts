import assert from 'node:assert/strict'
import {
  createRegionalPoiProfile,
  type RegionalPoiProfile,
  type RegionalPoiSourceReference,
} from 'grph-shared/geospatial/regionalPoiGeo'
import {
  REGIONAL_POI_LAYER_IDS,
  REGIONAL_POI_LAYER_ORDER,
  REGIONAL_POI_SOURCE_ID,
  applyRegionalPoiProfileToMap,
  clearRegionalPoiProfileFromMap,
  mapHasExactRegionalPoiProfile,
  mapHasExactRegionalPoiSource,
  regionalPoiFeatureCollection,
  regionalPoiProfileBounds,
} from '../../../gympgrph/src/regionalPoiMapLibre.js'
import {
  TEST_LAYER_ANCHOR,
  TestMapLibreMap,
} from './helpers/cityGeoOverlayMapLibreHarness.js'

const checkedInGeometrySource = Object.freeze({
  authority: 'Fixture geometry authority',
  snapshotAt: '2026-07-31T00:00:00Z',
  sourceId: 'fixture-geometry-v1',
  sourceUrl: 'https://example.test/geometry',
  sourceVersion: '2026-07-31',
}) satisfies RegionalPoiSourceReference

const checkedInHeightSource = Object.freeze({
  authority: 'Fixture height authority',
  snapshotAt: '2026-07-31T00:00:00Z',
  sourceId: 'fixture-height-v1',
  sourceUrl: 'https://example.test/heights',
  sourceVersion: '2026-07-31',
}) satisfies RegionalPoiSourceReference

const checkedInContextSource = Object.freeze({
  authority: 'Fixture context authority',
  snapshotAt: '2026-07-31T00:00:00Z',
  sourceId: 'fixture-context-v1',
  sourceUrl: 'https://example.test/context',
  sourceVersion: '2026-07-31',
}) satisfies RegionalPoiSourceReference

function surface(
  options: Readonly<{
    baseHeightMeters: number
    coordinates: readonly (readonly (readonly [number, number])[])[]
    heightMeters: number
    id: string
    label: string
    poiId: string
  }>,
): RegionalPoiProfile['surfaces'][number] {
  return {
    accuracy: {
      footprint: 'source-polygon',
      height: 'source-recorded',
      statement: 'Exact fixture polygon and recorded fixture height.',
    },
    baseHeightMeters: options.baseHeightMeters,
    category: 'fixture-structure',
    geometry: {
      coordinates: options.coordinates,
      type: 'Polygon',
    },
    heightMeters: options.heightMeters,
    id: options.id,
    label: options.label,
    poiId: options.poiId,
    provenance: {
      context: [checkedInContextSource],
      geometry: checkedInGeometrySource,
      height: checkedInHeightSource,
    },
  }
}

function createSyntheticRegionalPoiProfile(): RegionalPoiProfile {
  return createRegionalPoiProfile({
    attribution: [{
      licenseName: 'Fixture Data License',
      licenseUrl: 'https://example.test/license',
      text: 'Fixture attribution',
      url: 'https://example.test/data',
    }],
    dataPolicy: {
      runtimeNetwork: 'forbidden',
      storage: 'checked-in',
    },
    id: 'adm0:TST:major-pois/v1',
    pois: [
      { id: 'structure-a', label: 'Structure A' },
      { id: 'structure-b', label: 'Structure B' },
    ],
    region: {
      code: 'TST',
      label: 'Synthetic Region',
    },
    revision: 'fixture-regional-pois-2026-07-31',
    schema: 'knowgrph.regional-poi-profile/v1',
    surfaces: [
      surface({
        baseHeightMeters: 0,
        coordinates: [[
          [12, 41],
          [12.01, 41],
          [12.01, 41.01],
          [12, 41.01],
          [12, 41],
        ], [
          [12.002, 41.002],
          [12.004, 41.002],
          [12.004, 41.004],
          [12.002, 41.004],
          [12.002, 41.002],
        ]],
        heightMeters: 40,
        id: 'structure-a-base',
        label: 'Structure A base',
        poiId: 'structure-a',
      }),
      surface({
        baseHeightMeters: 40,
        coordinates: [[
          [12.002, 41.002],
          [12.008, 41.002],
          [12.008, 41.008],
          [12.002, 41.008],
          [12.002, 41.002],
        ]],
        heightMeters: 45,
        id: 'structure-a-roof',
        label: 'Structure A roof',
        poiId: 'structure-a',
      }),
      surface({
        baseHeightMeters: 0,
        coordinates: [[
          [12.02, 41.02],
          [12.03, 41.02],
          [12.03, 41.03],
          [12.02, 41.03],
          [12.02, 41.02],
        ]],
        heightMeters: 60,
        id: 'structure-b',
        label: 'Structure B surface',
        poiId: 'structure-b',
      }),
    ],
  })
}

function testProjectionPreservesGeographyAndProvenance(): void {
  const profile = createSyntheticRegionalPoiProfile()
  const collection = regionalPoiFeatureCollection(profile)
  assert.equal(collection.features.length, 3)
  assert.deepEqual(collection.features[0].geometry.coordinates, [
    profile.surfaces[0].geometry.coordinates[0],
    profile.surfaces[0].geometry.coordinates[1],
  ])
  assert.notEqual(
    collection.features[0].geometry.coordinates,
    profile.surfaces[0].geometry.coordinates,
  )
  assert.deepEqual(
    collection.features.map(feature => feature.id),
    [
      `${profile.id}:structure-a-base`,
      `${profile.id}:structure-a-roof`,
      `${profile.id}:structure-b`,
    ],
  )
  assert.deepEqual(
    collection.features.map(
      feature => feature.properties.kgRegionalPoiLabel,
    ),
    ['Structure A', '', 'Structure B'],
  )
  const firstProperties = collection.features[0].properties
  assert.equal(firstProperties.kgRegionalPoiGeometrySourceId, 'fixture-geometry-v1')
  assert.equal(firstProperties.kgRegionalPoiHeightSourceId, 'fixture-height-v1')
  assert.equal(firstProperties.kgRegionalPoiStoragePolicy, 'checked-in')
  assert.equal(firstProperties.kgRegionalPoiRuntimeNetworkPolicy, 'forbidden')
  assert.deepEqual(
    JSON.parse(firstProperties.kgRegionalPoiContextProvenance),
    [{
      authority: 'Fixture context authority',
      snapshotAt: '2026-07-31T00:00:00Z',
      sourceId: 'fixture-context-v1',
      sourceUrl: 'https://example.test/context',
      sourceVersion: '2026-07-31',
    }],
  )
  assert.deepEqual(regionalPoiProfileBounds(profile), [
    [12, 41],
    [12.03, 41.03],
  ])
}

function assertLayerBandImmediatelyBeforeAnchor(map: TestMapLibreMap): void {
  const layerIds = map.getStyle().layers.map(layer => String(layer.id))
  const anchorIndex = layerIds.indexOf(TEST_LAYER_ANCHOR)
  assert.deepEqual(
    layerIds.slice(
      anchorIndex - REGIONAL_POI_LAYER_ORDER.length,
      anchorIndex,
    ),
    REGIONAL_POI_LAYER_ORDER,
  )
}

function testMapLibreApplyRepairModesAndClear(): void {
  const profile = createSyntheticRegionalPoiProfile()
  const map = new TestMapLibreMap()
  assert.equal(applyRegionalPoiProfileToMap(map, profile, {
    beforeLayerId: TEST_LAYER_ANCHOR,
    viewMode: '2d',
  }), true)
  assertLayerBandImmediatelyBeforeAnchor(map)
  assert.equal(map.sourceAddCount, 1)
  assert.equal(mapHasExactRegionalPoiSource(map, profile), true)
  assert.equal(mapHasExactRegionalPoiProfile(map, profile, {
    beforeLayerId: TEST_LAYER_ANCHOR,
    viewMode: '2d',
  }), true)
  assert.notEqual(
    map.getLayoutProperty(REGIONAL_POI_LAYER_IDS.fill, 'visibility'),
    'none',
  )
  assert.equal(
    map.getLayoutProperty(REGIONAL_POI_LAYER_IDS.extrusion, 'visibility'),
    'none',
  )
  assert.deepEqual(
    map.getLayer(REGIONAL_POI_LAYER_IDS.label)?.layout['text-font'],
    ['Noto Sans Regular'],
  )

  assert.equal(applyRegionalPoiProfileToMap(map, profile, {
    beforeLayerId: TEST_LAYER_ANCHOR,
    viewMode: '3d',
  }), true)
  assert.equal(map.sourceAddCount, 1)
  assert.equal(
    map.getLayoutProperty(REGIONAL_POI_LAYER_IDS.fill, 'visibility'),
    'none',
  )
  assert.equal(
    map.getLayoutProperty(REGIONAL_POI_LAYER_IDS.extrusion, 'visibility'),
    'visible',
  )
  assert.equal(mapHasExactRegionalPoiProfile(map, profile, {
    beforeLayerId: TEST_LAYER_ANCHOR,
    viewMode: '3d',
  }), true)

  map.getSource(REGIONAL_POI_SOURCE_ID)?.setData({
    type: 'FeatureCollection',
    features: [],
  })
  assert.equal(mapHasExactRegionalPoiSource(map, profile), false)
  assert.equal(applyRegionalPoiProfileToMap(map, profile, {
    beforeLayerId: TEST_LAYER_ANCHOR,
    viewMode: '3d',
  }), true)
  assert.equal(mapHasExactRegionalPoiSource(map, profile), true)

  const fillLayer = map.getLayer(REGIONAL_POI_LAYER_IDS.fill)
  assert.ok(fillLayer)
  fillLayer.paint['fill-opacity'] = 0.99
  map.moveLayer(REGIONAL_POI_LAYER_IDS.label)
  assert.equal(mapHasExactRegionalPoiProfile(map, profile, {
    beforeLayerId: TEST_LAYER_ANCHOR,
    viewMode: '3d',
  }), false)
  assert.equal(applyRegionalPoiProfileToMap(map, profile, {
    beforeLayerId: TEST_LAYER_ANCHOR,
    viewMode: '3d',
  }), true)
  assertLayerBandImmediatelyBeforeAnchor(map)
  assert.equal(mapHasExactRegionalPoiProfile(map, profile, {
    beforeLayerId: TEST_LAYER_ANCHOR,
    viewMode: '3d',
  }), true)

  assert.equal(clearRegionalPoiProfileFromMap(map), true)
  assert.equal(map.getSource(REGIONAL_POI_SOURCE_ID), undefined)
  assert.equal(
    REGIONAL_POI_LAYER_ORDER.every(layerId => !map.getLayer(layerId)),
    true,
  )
  assert.ok(map.getLayer(TEST_LAYER_ANCHOR))
}

export function testRegionalPoiMapLibre(): void {
  testProjectionPreservesGeographyAndProvenance()
  testMapLibreApplyRepairModesAndClear()
}
