import assert from 'node:assert/strict'
import test from 'node:test'
import {
  CITY_GEO_OVERLAY_LAYER_DEFINITIONS,
  CITY_GEO_OVERLAY_LAYER_IDS,
} from '../../../gympgrph/src/cityGeoOverlayMapLibre'
import {
  CITY_GEO_XR_LAYER_ORDER,
  hasExactCityGeoXrLayerOrder,
  readCityGeoXrLayerOrder,
} from '../../../gympgrph/src/geoXrOverlayLayerOrder'
import {
  applyFlightGeoEnvironmentToMap,
} from '../../../gympgrph/src/flightGeoEnvironmentMapLibre'
import {
  applyFlightGeoOverlayToMap,
  FLIGHT_GEO_OVERLAY_LAYER_IDS,
} from '../../../gympgrph/src/flightGeoOverlayMapLibre'
import {
  flightOverlay,
  withEnvironment,
} from './helpers/flightSimMapLibrePresentationHarness'
import {
  TestMapLibreMap,
} from './helpers/cityGeoOverlayMapLibreHarness'

test('City keeps environment, parcels, and aircraft in one exact Geo+XR stack', () => {
  const overlay = {
    ...withEnvironment(flightOverlay('stopped', 'city:stack')),
    presentationOwner: 'city' as const,
  }
  const map = new TestMapLibreMap() as TestMapLibreMap & {
    addImage: (imageId: string, image: unknown) => void
    getImage: (imageId: string) => unknown
    hasImage: (imageId: string) => boolean
  }
  const images = new Map<string, unknown>()
  map.addImage = (imageId, image) => {
    images.set(imageId, image)
  }
  map.getImage = imageId => images.get(imageId)
  map.hasImage = imageId => images.has(imageId)

  assert.equal(applyFlightGeoOverlayToMap(map, overlay), true)
  for (const layer of CITY_GEO_OVERLAY_LAYER_DEFINITIONS) {
    map.addLayer(layer, FLIGHT_GEO_OVERLAY_LAYER_IDS.route)
  }
  assert.equal(
    applyFlightGeoEnvironmentToMap(
      map,
      overlay,
      '3d',
      { beforeLayerId: CITY_GEO_OVERLAY_LAYER_IDS.fill },
    ),
    true,
  )
  assert.equal(applyFlightGeoOverlayToMap(map, overlay), true)

  const styleLayerIds = map.getStyle().layers.map(layer => String(layer.id))
  assert.equal(hasExactCityGeoXrLayerOrder(styleLayerIds), true)
  assert.deepEqual(
    readCityGeoXrLayerOrder(styleLayerIds),
    CITY_GEO_XR_LAYER_ORDER,
  )
})
