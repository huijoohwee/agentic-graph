import assert from 'node:assert/strict'
import test from 'node:test'
import type { FlightGeoOverlaySnapshot } from '../../../gympgrph/src/flightGeoOverlay'
import {
  flightGeoEnvironmentMapLibreFeatureCollection,
  FLIGHT_GEO_ENVIRONMENT_LAYER_DEFINITIONS,
  FLIGHT_GEO_ENVIRONMENT_LAYER_IDS,
  FLIGHT_GEO_ENVIRONMENT_LAYER_ORDER,
  hasExactFlightGeoEnvironmentFeatureCollection,
} from '../../../gympgrph/src/flightGeoEnvironmentMapLibre'
import {
  projectXrEnvironmentToFlightGeo,
} from '@/features/game-flight-sim/flightSimGeoEnvironmentProjection'
import {
  XR_SINGAPORE_MAJOR_POIS,
  XR_SINGAPORE_MAJOR_POI_SURFACES,
} from '@/features/three/xrSingaporeEnvironmentSource'

test('Singapore source projects named major POIs into native 3D extrusions', () => {
  assert.deepEqual(
    XR_SINGAPORE_MAJOR_POIS.map(poi => poi.id),
    [
      'marina-bay-sands',
      'singapore-flyer',
      'gardens-by-the-bay',
    ],
  )
  assert.equal(Object.isFrozen(XR_SINGAPORE_MAJOR_POIS), true)
  assert.equal(Object.isFrozen(XR_SINGAPORE_MAJOR_POI_SURFACES), true)
  assert.equal(
    XR_SINGAPORE_MAJOR_POI_SURFACES.every(surface => (
      Object.isFrozen(surface)
      && Object.isFrozen(surface.position)
      && Object.isFrozen(surface.size)
    )),
    true,
  )

  const environment = projectXrEnvironmentToFlightGeo({
    stageId: 'singapore',
    subjects: [],
  })
  const poiSurfaces = environment.surfaces.filter(
    surface => surface.kind === 'poi',
  )
  assert.equal(poiSurfaces.length, XR_SINGAPORE_MAJOR_POI_SURFACES.length)
  assert.deepEqual(
    poiSurfaces.map(surface => surface.id),
    XR_SINGAPORE_MAJOR_POI_SURFACES.map(surface => surface.id),
  )
  assert.equal(
    poiSurfaces.every(surface => (
      surface.baseHeightMeters >= 0
      && surface.heightMeters > surface.baseHeightMeters
      && Boolean(surface.label)
      && Boolean(surface.poiId)
      && surface.ring.length === 5
    )),
    true,
  )

  const features = flightGeoEnvironmentMapLibreFeatureCollection({
    environment,
  } as FlightGeoOverlaySnapshot)
  const poiFeatures = features.features.filter(
    feature => feature.properties.kgSurfaceKind === 'poi',
  )
  assert.equal(poiFeatures.length, poiSurfaces.length)
  assert.deepEqual(
    [...new Set(poiFeatures.map(feature => feature.properties.kgPoiId))],
    [
      'marina-bay-sands',
      'singapore-flyer',
      'gardens-by-the-bay',
    ],
  )
  assert.equal(
    poiFeatures.every(feature => (
      feature.properties.kgSurfaceLabel.length > 0
      && feature.properties.kgRenderHeightMeters
        > feature.properties.kgRenderBaseHeightMeters
    )),
    true,
  )
  const staleProperties = structuredClone(features) as any
  staleProperties.features[0].properties.legacySurfaceAlias = 'forbidden'
  assert.equal(
    hasExactFlightGeoEnvironmentFeatureCollection(features, staleProperties),
    false,
  )

  const extrusion = FLIGHT_GEO_ENVIRONMENT_LAYER_DEFINITIONS.find(
    layer => layer.id === FLIGHT_GEO_ENVIRONMENT_LAYER_IDS.extrusion3d,
  )
  assert.ok(extrusion)
  assert.equal(extrusion.type, 'fill-extrusion')
  assert.deepEqual(
    extrusion.paint['fill-extrusion-base'],
    ['get', 'kgRenderBaseHeightMeters'],
  )
  assert.deepEqual(
    extrusion.paint['fill-extrusion-height'],
    ['get', 'kgRenderHeightMeters'],
  )
  assert.deepEqual(
    FLIGHT_GEO_ENVIRONMENT_LAYER_ORDER,
    [
      FLIGHT_GEO_ENVIRONMENT_LAYER_IDS.fill2d,
      FLIGHT_GEO_ENVIRONMENT_LAYER_IDS.extrusion3d,
      FLIGHT_GEO_ENVIRONMENT_LAYER_IDS.outline,
    ],
  )
})
