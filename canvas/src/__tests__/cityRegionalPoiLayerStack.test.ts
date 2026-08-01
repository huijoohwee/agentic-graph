import assert from 'node:assert/strict'
import test from 'node:test'
import {
  SINGAPORE_MAJOR_POI_GEO_PROFILE,
} from 'grph-shared/geospatial/singaporeMajorPoiGeo'
import {
  applyCityGeoPresentationToMap,
  mapHasExactCityGeoPresentation,
} from '../../../gympgrph/src/cityGeoPresentationMapLibre'
import {
  FLIGHT_GEO_OVERLAY_LAYER_IDS,
  FLIGHT_GEO_OVERLAY_SOURCE_ID,
} from '../../../gympgrph/src/flightGeoOverlayMapLibre'
import {
  REGIONAL_POI_LAYER_ORDER,
  REGIONAL_POI_SOURCE_ID,
  applyRegionalPoiProfileToMap,
  mapHasExactRegionalPoiProfile,
  type RegionalPoiFeatureCollection,
} from '../../../gympgrph/src/regionalPoiMapLibre'
import {
  createSyntheticCityGeoOverlaySnapshot,
  TEST_LAYER_ANCHOR,
  TestMapLibreMap,
} from './helpers/cityGeoOverlayMapLibreHarness'

test('City presents canonical regional POI geometry without City or Flight layers', () => {
  const map = new TestMapLibreMap()
  const citySnapshot = createSyntheticCityGeoOverlaySnapshot()
  assert.equal(applyRegionalPoiProfileToMap(
    map,
    SINGAPORE_MAJOR_POI_GEO_PROFILE,
    {
      beforeLayerId: TEST_LAYER_ANCHOR,
      viewMode: '3d',
    },
  ), true)
  assert.equal(applyCityGeoPresentationToMap(map, citySnapshot), true)

  assert.equal(mapHasExactRegionalPoiProfile(
    map,
    SINGAPORE_MAJOR_POI_GEO_PROFILE,
    {
      beforeLayerId: TEST_LAYER_ANCHOR,
      viewMode: '3d',
    },
  ), true)
  assert.equal(mapHasExactCityGeoPresentation(map, citySnapshot), true)
  assert.deepEqual(
    map.getStyle().layers.map(layer => String(layer.id)),
    [...REGIONAL_POI_LAYER_ORDER, TEST_LAYER_ANCHOR],
  )
  assert.deepEqual(
    Object.keys(map.getStyle().sources),
    [REGIONAL_POI_SOURCE_ID],
  )
  assert.equal(map.getSource(FLIGHT_GEO_OVERLAY_SOURCE_ID), undefined)
  assert.equal(
    Object.values(FLIGHT_GEO_OVERLAY_LAYER_IDS)
      .some(layerId => map.getLayer(layerId)),
    false,
  )

  const regionalSource = map.getSource(REGIONAL_POI_SOURCE_ID)?.serialize()
  const regionalFeatures = (
    regionalSource?.data as RegionalPoiFeatureCollection
  ).features
  assert.deepEqual(
    regionalFeatures.flatMap(feature => {
      if (feature.properties.kgRegionalPoiFeatureKind !== 'surface') return []
      return [{
        baseHeightMeters: feature.properties.kgRegionalPoiBaseHeightMeters,
        heightMeters: feature.properties.kgRegionalPoiHeightMeters,
        id: feature.id,
        poiId: feature.properties.kgRegionalPoiId,
      }]
    }),
    SINGAPORE_MAJOR_POI_GEO_PROFILE.surfaces.map(surface => ({
      baseHeightMeters: surface.baseHeightMeters,
      heightMeters: surface.heightMeters,
      id: `${SINGAPORE_MAJOR_POI_GEO_PROFILE.id}:${surface.id}`,
      poiId: surface.poiId,
    })),
  )
  assert.equal(
    map.featureStateSetCalls.length,
    SINGAPORE_MAJOR_POI_GEO_PROFILE.surfaces.length,
  )
})
