import assert from 'node:assert/strict'
import {
  createRegionalPoiProfile,
  deriveRegionalPoiLocators,
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
    schema: 'agentic-graph.regional-poi-profile/v1',
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

function createAntimeridianRegionalPoiProfile(): RegionalPoiProfile {
  const base = createSyntheticRegionalPoiProfile()
  return createRegionalPoiProfile({
    ...base,
    id: 'adm0:TST:antimeridian-pois/v1',
    pois: [{ id: 'crossing-structure', label: 'Crossing Structure' }],
    revision: 'fixture-antimeridian-pois-2026-07-31',
    surfaces: [surface({
      baseHeightMeters: 0,
      coordinates: [[
        [179, 10],
        [-179, 10],
        [-179, 12],
        [179, 12],
        [179, 10],
      ]],
      heightMeters: 40,
      id: 'crossing-structure-base',
      label: 'Crossing Structure base',
      poiId: 'crossing-structure',
    })],
  })
}

function testProjectionPreservesGeographyAndProvenance(): void {
  const profile = createSyntheticRegionalPoiProfile()
  const collection = regionalPoiFeatureCollection(profile)
  const surfaceFeatures = collection.features.filter(feature => (
    feature.properties.kgRegionalPoiFeatureKind === 'surface'
  ))
  const locatorFeatures = collection.features.filter(feature => (
    feature.properties.kgRegionalPoiFeatureKind === 'locator'
  ))
  assert.equal(collection.features.length, 5)
  assert.equal(surfaceFeatures.length, profile.surfaces.length)
  assert.equal(locatorFeatures.length, profile.pois.length)
  assert.equal(surfaceFeatures[0]?.geometry.type, 'Polygon')
  assert.deepEqual(surfaceFeatures[0]?.geometry.coordinates, [
    profile.surfaces[0].geometry.coordinates[0],
    profile.surfaces[0].geometry.coordinates[1],
  ])
  assert.notEqual(
    surfaceFeatures[0]?.geometry.coordinates,
    profile.surfaces[0].geometry.coordinates,
  )
  assert.deepEqual(
    surfaceFeatures.map(feature => feature.id),
    [
      `${profile.id}:structure-a-base`,
      `${profile.id}:structure-a-roof`,
      `${profile.id}:structure-b`,
    ],
  )
  assert.deepEqual(
    surfaceFeatures.map(
      feature => feature.properties.kgRegionalPoiLabel,
    ),
    ['', '', ''],
  )
  assert.deepEqual(
    locatorFeatures.map(feature => ({
      coordinates: feature.geometry.type === 'Point'
        ? feature.geometry.coordinates
        : null,
      id: feature.id,
      label: feature.properties.kgRegionalPoiLabel,
      poiId: feature.properties.kgRegionalPoiId,
    })),
    deriveRegionalPoiLocators(profile).map(locator => ({
      coordinates: locator.coordinate,
      id: `${profile.id}:locator:${locator.poiId}`,
      label: locator.label,
      poiId: locator.poiId,
    })),
  )
  const firstProperties = surfaceFeatures[0]?.properties
  assert.ok(firstProperties)
  assert.ok('kgRegionalPoiGeometrySourceId' in firstProperties)
  assert.equal(firstProperties.kgRegionalPoiGeometrySourceId, 'fixture-geometry-v1')
  assert.equal(firstProperties.kgRegionalPoiHeightSourceId, 'fixture-height-v1')
  assert.equal(firstProperties.kgRegionalPoiFeatureKind, 'surface')
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

  const antimeridianProfile = createAntimeridianRegionalPoiProfile()
  assert.deepEqual(regionalPoiProfileBounds(antimeridianProfile), [
    [179, 10],
    [181, 12],
  ])
  const antimeridianSurface = regionalPoiFeatureCollection(
    antimeridianProfile,
  ).features.find(feature => (
    feature.properties.kgRegionalPoiFeatureKind === 'surface'
  ))
  assert.deepEqual(
    antimeridianSurface?.geometry.type === 'Polygon'
      ? antimeridianSurface.geometry.coordinates[0]
      : null,
    antimeridianProfile.surfaces[0].geometry.coordinates[0],
  )
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
  const surfaceFilter = [
    '==',
    ['get', 'kgRegionalPoiFeatureKind'],
    'surface',
  ]
  const locatorFilter = [
    '==',
    ['get', 'kgRegionalPoiFeatureKind'],
    'locator',
  ]
  for (const layerId of [
    REGIONAL_POI_LAYER_IDS.fill,
    REGIONAL_POI_LAYER_IDS.extrusion,
    REGIONAL_POI_LAYER_IDS.outline,
  ]) {
    assert.deepEqual(map.getLayer(layerId)?.filter, surfaceFilter)
  }
  const locatorLayer = map.getLayer(REGIONAL_POI_LAYER_IDS.locator)
  assert.equal(locatorLayer?.type, 'circle')
  assert.deepEqual(locatorLayer?.filter, locatorFilter)
  assert.equal(locatorLayer?.paint['circle-radius'], 6)
  assert.equal(locatorLayer?.paint['circle-pitch-alignment'], 'viewport')
  assert.equal(locatorLayer?.paint['circle-pitch-scale'], 'viewport')
  const labelLayer = map.getLayer(REGIONAL_POI_LAYER_IDS.label)
  assert.deepEqual(labelLayer?.filter, [
    'all',
    locatorFilter,
    ['!=', ['get', 'kgRegionalPoiLabel'], ''],
  ])
  assert.deepEqual(labelLayer?.layout['text-variable-anchor'], [
    'bottom',
    'left',
    'right',
    'top',
  ])
  assert.equal(labelLayer?.layout['text-radial-offset'], 0.8)
  assert.equal(labelLayer?.layout['text-justify'], 'auto')
  assert.equal(labelLayer?.layout['text-max-width'], 10)
  assert.equal('text-anchor' in (labelLayer?.layout || {}), false)
  assert.equal('text-offset' in (labelLayer?.layout || {}), false)
  assert.equal('text-allow-overlap' in (labelLayer?.layout || {}), false)
  assert.equal('text-ignore-placement' in (labelLayer?.layout || {}), false)
  assert.equal(labelLayer?.paint['text-halo-width'], 2)

  const source = map.getSource(REGIONAL_POI_SOURCE_ID)
  assert.ok(source)
  const staleDiscriminator = structuredClone(source.data) as any
  const staleLocator = staleDiscriminator.features.find(
    (feature: any) => feature.properties.kgRegionalPoiFeatureKind === 'locator',
  )
  assert.ok(staleLocator)
  staleLocator.properties.kgRegionalPoiFeatureKind = 'surface'
  source.setData(staleDiscriminator)
  assert.equal(mapHasExactRegionalPoiSource(map, profile), false)
  assert.equal(applyRegionalPoiProfileToMap(map, profile, {
    beforeLayerId: TEST_LAYER_ANCHOR,
    viewMode: '2d',
  }), true)
  assert.equal(mapHasExactRegionalPoiSource(map, profile), true)

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
  assert.notEqual(
    map.getLayoutProperty(REGIONAL_POI_LAYER_IDS.locator, 'visibility'),
    'none',
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
  const staleLocatorLayer = map.getLayer(REGIONAL_POI_LAYER_IDS.locator)
  assert.ok(staleLocatorLayer)
  staleLocatorLayer.paint['circle-radius'] = 99
  const staleLabelLayer = map.getLayer(REGIONAL_POI_LAYER_IDS.label)
  assert.ok(staleLabelLayer)
  delete staleLabelLayer.layout['text-variable-anchor']
  delete staleLabelLayer.layout['text-radial-offset']
  delete staleLabelLayer.layout['text-justify']
  staleLabelLayer.layout['text-anchor'] = 'bottom'
  staleLabelLayer.layout['text-offset'] = [0, -0.8]
  staleLabelLayer.layout['text-allow-overlap'] = true
  staleLabelLayer.layout['text-ignore-placement'] = true
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
