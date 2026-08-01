import assert from 'node:assert/strict'
import { SINGAPORE_MAJOR_POI_GEO_PROFILE } from 'grph-shared/geospatial/singaporeMajorPoiGeo'
import { parseCitySimAuthoredSource } from '@/features/game-city-sim/citySimAuthoredSource'
import { projectCitySimToGeospatialOverlay } from '@/features/game-city-sim/citySimGeospatialProjection'
import type { CitySimSnapshot } from '@/features/game-city-sim/citySimRuntimeState'
import {
  cityGeoPresentationStateEntries,
} from '../../../gympgrph/src/cityGeoPresentationMapLibre'
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
    lastInput: null,
    lastResult: null,
    message: 'City Simulation is active.',
    modelCallCount: 0,
    phase: 'stopped',
    revision: 1,
    saveStatus: 'not-loaded',
    selectedParcelId: 'singapore-flyer',
    webglSupported: true,
  })
}

export function testCitySimGeospatialProjectionTracksLiveParcelsAndSelection() {
  const snapshot = citySnapshot()
  const overlay = projectCitySimToGeospatialOverlay(snapshot)
  const entries = cityGeoPresentationStateEntries(overlay)

  assert.equal(overlay.active, true)
  assert.equal(
    overlay.profile?.regionalPoiProfile.id,
    snapshot.city.regionalPoiProfileId,
  )
  assert.equal(
    overlay.profile?.regionalPoiProfile.surfaces.length,
    SINGAPORE_MAJOR_POI_GEO_PROFILE.surfaces.length,
  )
  assert.deepEqual(
    overlay.parcels.map(parcel => parcel.id),
    SINGAPORE_MAJOR_POI_GEO_PROFILE.pois.map(poi => poi.id),
  )
  assert.equal(entries.length, SINGAPORE_MAJOR_POI_GEO_PROFILE.surfaces.length)
  assert.equal(
    entries.every(entry => entry.featureId.startsWith(
      `${SINGAPORE_MAJOR_POI_GEO_PROFILE.id}:`,
    )),
    true,
  )
  const selectedEntries = entries.filter(
    entry => entry.state.kgRegionalPoiPresentationSelected,
  )
  assert.equal(selectedEntries.length, 1)
  assert.equal(selectedEntries[0]?.poiId, 'singapore-flyer')
  assert.equal(
    selectedEntries[0]?.state.kgRegionalPoiPresentationVariant,
    'commercial',
  )

  const zonedCity = Object.freeze({
    ...snapshot.city,
    parcels: Object.freeze(snapshot.city.parcels.map(parcel => (
      parcel.id === 'gardens-by-the-bay'
        ? Object.freeze({ ...parcel, zone: 'residential' as const })
        : parcel
    ))),
  })
  const mutated = projectCitySimToGeospatialOverlay(Object.freeze({
    ...snapshot,
    city: zonedCity,
    revision: snapshot.revision + 1,
    selectedParcelId: 'gardens-by-the-bay',
  }))
  const mutatedEntries = cityGeoPresentationStateEntries(mutated)
    .filter(entry => entry.poiId === 'gardens-by-the-bay')
  assert.notEqual(mutated.revision, overlay.revision)
  assert.equal(mutatedEntries.length, 4)
  assert.equal(
    mutatedEntries.every(entry => (
      entry.state.kgRegionalPoiPresentationVariant === 'residential'
      && entry.state.kgRegionalPoiPresentationSelected
    )),
    true,
  )

  const inactive = projectCitySimToGeospatialOverlay(Object.freeze({
    ...snapshot,
    active: false,
  }))
  assert.equal(inactive.active, false)
  assert.deepEqual(inactive.parcels, [])

  const unknownPoiProfile = parseCitySimAuthoredSource(
    readAuthoritativeCitySimDocument().replace(
      'regional_poi_profile_id: "adm0:SGP:major-pois/v1"',
      'regional_poi_profile_id: "unknown:regional-pois"',
    ),
  )
  assert.equal(unknownPoiProfile.ok, false)
  if (unknownPoiProfile.ok === false) {
    assert.equal(unknownPoiProfile.error.code, 'invalid-city')
    assert.match(unknownPoiProfile.error.message, /Unknown regional POI profile/)
  }
}
