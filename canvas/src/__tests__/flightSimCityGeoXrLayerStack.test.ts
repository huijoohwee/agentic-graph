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
  FLIGHT_GEO_ENVIRONMENT_LAYER_IDS,
  FLIGHT_GEO_ENVIRONMENT_SOURCE_ID,
} from '../../../gympgrph/src/flightGeoEnvironmentMapLibre'
import {
  FLIGHT_GEO_OVERLAY_LAYER_IDS,
  FLIGHT_GEO_OVERLAY_SOURCE_ID,
} from '../../../gympgrph/src/flightGeoOverlayMapLibre'
import {
  applyCityGeoXrAerialOverlayToMap,
} from '../../../gympgrph/src/features/geospatial/useFlightGeoOverlayMapLibrePresentation'
import {
  flightOverlay,
  withEnvironment,
} from './helpers/flightSimMapLibrePresentationHarness'
import {
  TestMapLibreMap,
} from './helpers/cityGeoOverlayMapLibreHarness'

test('City keeps parcels and aircraft in one exact Geo+XR stack without a local XR environment', () => {
  const overlay = {
    ...flightOverlay('stopped', 'city:stack'),
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

  assert.equal(applyCityGeoXrAerialOverlayToMap(map, overlay), true)
  for (const layer of CITY_GEO_OVERLAY_LAYER_DEFINITIONS) {
    map.addLayer(layer, FLIGHT_GEO_OVERLAY_LAYER_IDS.route)
  }
  assert.equal(applyCityGeoXrAerialOverlayToMap(map, overlay), true)

  const styleLayerIds = map.getStyle().layers.map(layer => String(layer.id))
  assert.equal(map.getSource(FLIGHT_GEO_ENVIRONMENT_SOURCE_ID), undefined)
  assert.equal(
    Object.values(FLIGHT_GEO_ENVIRONMENT_LAYER_IDS)
      .some(layerId => map.getLayer(layerId)),
    false,
  )
  assert.equal(hasExactCityGeoXrLayerOrder(styleLayerIds), true)
  assert.deepEqual(
    readCityGeoXrLayerOrder(styleLayerIds),
    CITY_GEO_XR_LAYER_ORDER,
  )
})

test('City withholds its aerial overlay until environment teardown succeeds', () => {
  const overlay = {
    ...flightOverlay('stopped', 'city:teardown-fence'),
    presentationOwner: 'city' as const,
  }
  const preparingMap = {
    style: { _loaded: false },
    isStyleLoaded: () => false,
  }
  assert.equal(
    applyCityGeoXrAerialOverlayToMap(preparingMap, overlay),
    false,
  )

  const map = new TestMapLibreMap()
  assert.equal(
    applyCityGeoXrAerialOverlayToMap(
      map,
      {
        ...withEnvironment(overlay),
        presentationOwner: 'city',
      },
    ),
    false,
  )
  assert.equal(map.getSource(FLIGHT_GEO_OVERLAY_SOURCE_ID), undefined)
})
