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
import { SINGAPORE_MAJOR_POI_GEO_PROFILE } from 'grph-shared/geospatial/singaporeMajorPoiGeo'
import {
  SINGAPORE_MAJOR_POI_IDENTITIES,
} from 'grph-shared/geospatial/singaporeMajorPoiIdentity'
import {
  projectXrEnvironmentToFlightGeo,
} from '@/features/game-flight-sim/flightSimGeoEnvironmentProjection'
import {
  XR_SINGAPORE_MAJOR_POIS,
  XR_SINGAPORE_MAJOR_POI_SURFACES,
  XR_SINGAPORE_REGIONAL_POI_PRESENTATION,
  XR_SINGAPORE_STAGE_SIZE_METERS,
} from '@/features/three/xrSingaporeEnvironmentSource'
import {
  deriveXrObservationWheelSupports,
} from '@/features/three/xrObservationWheelPresentation'

test('Singapore POIs derive XR presentation and exact Geo extrusion from one profile', () => {
  assert.deepEqual(
    XR_SINGAPORE_MAJOR_POIS.map(poi => poi.id),
    SINGAPORE_MAJOR_POI_IDENTITIES.map(poi => poi.id),
  )
  assert.equal(
    XR_SINGAPORE_REGIONAL_POI_PRESENTATION.profileId,
    SINGAPORE_MAJOR_POI_GEO_PROFILE.id,
  )
  assert.equal(
    XR_SINGAPORE_REGIONAL_POI_PRESENTATION.profileRevision,
    SINGAPORE_MAJOR_POI_GEO_PROFILE.revision,
  )
  assert.deepEqual(
    XR_SINGAPORE_REGIONAL_POI_PRESENTATION.sizeMeters,
    XR_SINGAPORE_STAGE_SIZE_METERS,
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
  assert.deepEqual(
    XR_SINGAPORE_MAJOR_POI_SURFACES.map(surface => surface.id),
    SINGAPORE_MAJOR_POI_GEO_PROFILE.surfaces.map(surface => surface.id),
  )
  assert.equal(
    XR_SINGAPORE_MAJOR_POI_SURFACES.every(surface => (
      surface.position.every(Number.isFinite)
      && surface.size.every(value => Number.isFinite(value) && value > 0)
      && Math.abs(surface.position[0]) <= XR_SINGAPORE_STAGE_SIZE_METERS[0] / 2
      && Math.abs(surface.position[2]) <= XR_SINGAPORE_STAGE_SIZE_METERS[1] / 2
    )),
    true,
  )
  const observationWheel = XR_SINGAPORE_MAJOR_POI_SURFACES.find(
    surface => surface.presentation === 'observation-wheel',
  )
  assert.ok(observationWheel)
  const wheelSupports = deriveXrObservationWheelSupports(observationWheel)
  assert.equal(wheelSupports.length, 2)
  for (const support of wheelSupports) {
    const verticalRadius = support.size[1] * Math.cos(support.rotationZ) / 2
      + support.size[0] * Math.abs(Math.sin(support.rotationZ)) / 2
    const centerY = observationWheel.position[1] + support.position[1]
    assert.ok(centerY - verticalRadius >= -Number.EPSILON)
    assert.equal(support.size.every(value => Number.isFinite(value) && value > 0), true)
  }

  const environment = projectXrEnvironmentToFlightGeo({
    stageId: 'singapore',
    subjects: [],
  })
  const poiSurfaces = environment.surfaces.filter(
    surface => surface.kind === 'poi',
  )
  assert.equal(poiSurfaces.length, SINGAPORE_MAJOR_POI_GEO_PROFILE.surfaces.length)
  assert.deepEqual(
    poiSurfaces.map(surface => surface.id),
    SINGAPORE_MAJOR_POI_GEO_PROFILE.surfaces.map(surface => surface.id),
  )
  for (const [index, surface] of poiSurfaces.entries()) {
    const expected = SINGAPORE_MAJOR_POI_GEO_PROFILE.surfaces[index]
    assert.equal(surface.baseHeightMeters, expected.baseHeightMeters)
    assert.equal(surface.heightMeters, expected.heightMeters)
    assert.equal(surface.label, expected.label)
    assert.equal(surface.poiId, expected.poiId)
    assert.deepEqual(surface.rings, expected.geometry.coordinates)
    assert.deepEqual(surface.regionalPoiSourceFacts, {
      accuracy: expected.accuracy,
      category: expected.category,
      provenance: expected.provenance,
    })
  }

  const features = flightGeoEnvironmentMapLibreFeatureCollection({
    environment,
  } as FlightGeoOverlaySnapshot)
  const poiFeatures = features.features.filter(
    feature => feature.properties.kgSurfaceKind === 'poi',
  )
  assert.equal(poiFeatures.length, poiSurfaces.length)
  assert.deepEqual(
    [...new Set(poiFeatures.map(feature => feature.properties.kgPoiId))],
    SINGAPORE_MAJOR_POI_IDENTITIES.map(identity => identity.id),
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
