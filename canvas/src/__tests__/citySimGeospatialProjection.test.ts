import assert from 'node:assert/strict'
import { createRegionalPoiProfile } from 'grph-shared/geospatial/regionalPoiGeo'
import { parseCitySimAuthoredSource } from '@/features/game-city-sim/citySimAuthoredSource'
import { projectCitySimToGeospatialOverlay } from '@/features/game-city-sim/citySimGeospatialProjection'
import type { CitySimSnapshot } from '@/features/game-city-sim/citySimRuntimeState'
import {
  cityGeoOverlayBounds,
  cityGeoOverlayFeatureCollection,
  cityGeoPresentationBounds,
} from '../../../gympgrph/src/cityGeoOverlayProjection'
import {
  readAuthoritativeCitySimDocument,
  readAuthoritativeCitySimSource,
} from './citySimAuthoritativeSource'

function citySnapshot(): CitySimSnapshot {
  const source = readAuthoritativeCitySimSource()
  return Object.freeze({
    active: true,
    advisor: null,
    city: source.city,
    costLog: null,
    error: null,
    estimatedCostUsd: 0,
    geographicProfile: source.geographicProfile,
    lastInput: null,
    lastResult: null,
    message: 'City Simulation is active.',
    modelCallCount: 0,
    phase: 'stopped',
    revision: 1,
    saveStatus: 'not-loaded',
    selectedParcelId: 'r00c01',
    webglSupported: true,
  })
}

export function testCitySimGeospatialProjectionTracksLiveParcelsAndSelection() {
  const snapshot = citySnapshot()
  const overlay = projectCitySimToGeospatialOverlay(snapshot)
  const collection = cityGeoOverlayFeatureCollection(overlay)

  assert.equal(overlay.active, true)
  assert.equal(overlay.profile?.id, snapshot.geographicProfile?.id)
  assert.equal(
    overlay.profile?.regionalPoiProfile.id,
    snapshot.geographicProfile?.regionalPoiProfileId,
  )
  assert.equal(overlay.profile?.regionalPoiProfile.surfaces.length, 9)
  assert.deepEqual(
    [...new Set(
      overlay.profile?.regionalPoiProfile.surfaces.map(
        surface => surface.poiId,
      ),
    )].sort(),
    ['gardens-by-the-bay', 'marina-bay-sands', 'singapore-flyer'],
  )
  assert.deepEqual(overlay.profile?.center, snapshot.geographicProfile?.anchor)
  assert.equal(
    overlay.profile?.bearingDegrees,
    snapshot.geographicProfile?.parcelBearingDegrees,
  )
  assert.equal(collection.features.length, 16)
  const bounds = cityGeoOverlayBounds(overlay)
  assert.ok(bounds)
  const boundsCenter = [
    (bounds[0][0] + bounds[1][0]) / 2,
    (bounds[0][1] + bounds[1][1]) / 2,
  ]
  assert.ok(Math.abs(boundsCenter[0] - snapshot.geographicProfile!.anchor[0]) < 1e-12)
  assert.ok(Math.abs(boundsCenter[1] - snapshot.geographicProfile!.anchor[1]) < 1e-12)
  const presentationBounds = cityGeoPresentationBounds(overlay)
  assert.ok(presentationBounds)
  assert.ok(presentationBounds[0][0] <= bounds[0][0])
  assert.ok(presentationBounds[0][1] < bounds[0][1])
  assert.ok(presentationBounds[1][0] > bounds[1][0])
  assert.ok(presentationBounds[1][1] >= bounds[1][1])

  const sourceRegionalProfile = overlay.profile!.regionalPoiProfile
  const sourceSurface = sourceRegionalProfile.surfaces[0]
  const antimeridianRegionalProfile = createRegionalPoiProfile({
    ...sourceRegionalProfile,
    id: 'adm0:TST:antimeridian-pois/v1',
    pois: [{ id: 'crossing-poi', label: 'Crossing POI' }],
    revision: 'fixture-antimeridian-pois-2026-07-31',
    surfaces: [{
      ...sourceSurface,
      geometry: {
        coordinates: [[
          [179, 10],
          [-179, 10],
          [-179, 12],
          [179, 12],
          [179, 10],
        ]],
        type: 'Polygon',
      },
      id: 'crossing-poi:surface',
      label: 'Crossing POI surface',
      poiId: 'crossing-poi',
    }],
  })
  const antimeridianOverlay = {
    ...overlay,
    profile: {
      ...overlay.profile!,
      center: [179.99995, 11] as const,
      regionalPoiProfile: antimeridianRegionalProfile,
    },
  }
  const antimeridianParcelBounds = cityGeoOverlayBounds(antimeridianOverlay)
  assert.ok(antimeridianParcelBounds)
  assert.ok(antimeridianParcelBounds[0][0] > 179)
  assert.ok(antimeridianParcelBounds[1][0] > 180)
  assert.ok(
    antimeridianParcelBounds[1][0] - antimeridianParcelBounds[0][0] < 0.01,
  )
  assert.deepEqual(cityGeoPresentationBounds(antimeridianOverlay), [
    [179, 10],
    [181, 12],
  ])
  const firstParcelRing = collection.features[0].geometry.coordinates[0]
  assert.ok(firstParcelRing[1][0] > firstParcelRing[0][0])
  assert.ok(
    firstParcelRing[1][1] < firstParcelRing[0][1],
    'the canonical non-zero parcel bearing must rotate the authored width axis',
  )
  const selected = collection.features.find(feature => (
    feature.properties.parcelId === snapshot.selectedParcelId
  ))
  assert.equal(selected?.properties.kgCitySelected, true)
  assert.equal(selected?.properties.zone, 'commercial')
  assert.equal(selected?.geometry.type, 'Polygon')

  const zonedCity = Object.freeze({
    ...snapshot.city,
    parcels: Object.freeze(snapshot.city.parcels.map(parcel => (
      parcel.id === 'r00c02'
        ? Object.freeze({ ...parcel, zone: 'residential' as const })
        : parcel
    ))),
  })
  const mutated = projectCitySimToGeospatialOverlay(Object.freeze({
    ...snapshot,
    city: zonedCity,
    revision: snapshot.revision + 1,
    selectedParcelId: 'r00c02',
  }))
  const mutatedCollection = cityGeoOverlayFeatureCollection(mutated)
  const mutatedParcel = mutatedCollection.features.find(feature => (
    feature.properties.parcelId === 'r00c02'
  ))
  assert.notEqual(mutated.revision, overlay.revision)
  assert.equal(mutatedParcel?.properties.zone, 'residential')
  assert.equal(mutatedParcel?.properties.kgCitySelected, true)

  const inactive = projectCitySimToGeospatialOverlay(Object.freeze({
    ...snapshot,
    active: false,
    geographicProfile: null,
  }))
  assert.equal(inactive.active, false)
  assert.deepEqual(inactive.parcels, [])

  const invalidLatitudeDocument = readAuthoritativeCitySimDocument().replace(
    'anchor: [103.851959,1.29027]',
    'anchor: [103.851959,85.5]',
  )
  const invalidLatitude = parseCitySimAuthoredSource(invalidLatitudeDocument)
  assert.equal(invalidLatitude.ok, false)
  if (invalidLatitude.ok === false) {
    assert.equal(invalidLatitude.error.code, 'invalid-geographic-profile')
    assert.match(invalidLatitude.error.message, /outside MapLibre projection bounds/)
  }

  const unknownPoiProfile = parseCitySimAuthoredSource(
    readAuthoritativeCitySimDocument().replace(
      'regional_poi_profile_id: "adm0:SGP:major-pois/v1"',
      'regional_poi_profile_id: "unknown:regional-pois"',
    ),
  )
  assert.equal(unknownPoiProfile.ok, false)
  if (unknownPoiProfile.ok === false) {
    assert.equal(unknownPoiProfile.error.code, 'invalid-geographic-profile')
    assert.match(unknownPoiProfile.error.message, /Unknown regional POI profile/)
  }
}
