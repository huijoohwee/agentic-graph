import assert from 'node:assert/strict'
import {
  projectCitySimAerialInspectionToGeospatialOverlay,
} from '@/features/game-city-sim/citySimAerialInspectionProjection'
import type { CitySimSnapshot } from '@/features/game-city-sim/citySimRuntimeState'
import {
  projectXrEnvironmentToFlightGeo,
} from '@/features/game-flight-sim/flightSimGeoEnvironmentProjection'
import { readAuthoritativeCitySimSource } from './citySimAuthoritativeSource'

function activeCitySnapshot(): CitySimSnapshot {
  const source = readAuthoritativeCitySimSource()
  return Object.freeze({
    active: true,
    advisor: null,
    city: Object.freeze({ ...source.city, tick: 17 }),
    costLog: null,
    error: null,
    estimatedCostUsd: 0,
    geographicProfile: source.geographicProfile,
    lastInput: null,
    lastResult: null,
    message: 'City Simulation is active.',
    modelCallCount: 0,
    phase: 'running',
    revision: 23,
    saveStatus: 'dirty',
    selectedParcelId: 'r00c00',
    webglSupported: true,
  })
}

export function testCitySimAerialInspectionUsesAuthoredCityProfileWithoutFlightCamera() {
  const city = activeCitySnapshot()
  const geographicProfile = city.geographicProfile!
  const environment = projectXrEnvironmentToFlightGeo({
    stageId: 'singapore',
    subjects: [],
  })
  const overlay = projectCitySimAerialInspectionToGeospatialOverlay(
    city,
    environment,
  )

  assert.equal(overlay.active, true)
  assert.equal(overlay.phase, 'stopped')
  assert.equal(overlay.presentationOwner, 'city')
  assert.equal(overlay.profileId, `city-inspection:${geographicProfile.id}`)
  assert.equal(overlay.runId, 0)
  assert.equal(overlay.tick, 0)
  assert.equal(overlay.readyFrameRequestId, null)
  assert.equal(overlay.camera.source, 'free-orbit')
  assert.equal(overlay.camera.effectiveOwner, 'free-orbit')
  assert.strictEqual(overlay.environment, environment)
  assert.equal(overlay.objective, null)
  assert.deepEqual(
    overlay.route.map(point => point.coordinate),
    geographicProfile.aerialInspection.routeCoordinates,
  )
  assert.deepEqual(overlay.aircraft, geographicProfile.aerialInspection.aircraft)
  assert.equal(Object.isFrozen(overlay), true)

  const laterCityTick = projectCitySimAerialInspectionToGeospatialOverlay(
    Object.freeze({
      ...city,
      city: Object.freeze({ ...city.city, tick: city.city.tick + 1 }),
      revision: city.revision + 1,
    }),
    environment,
  )
  assert.equal(laterCityTick.revision, overlay.revision)
  assert.deepEqual(laterCityTick.aircraft, overlay.aircraft)
  assert.deepEqual(laterCityTick.route, overlay.route)

  const inactive = projectCitySimAerialInspectionToGeospatialOverlay(
    Object.freeze({ ...city, active: false, revision: city.revision + 1 }),
    environment,
  )
  assert.equal(inactive.active, false)
  assert.equal(inactive.presentationOwner, null)
  assert.equal(inactive.environment, null)
  assert.deepEqual(inactive.route, [])
}
