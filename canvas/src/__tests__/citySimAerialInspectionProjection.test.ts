import assert from 'node:assert/strict'
import {
  projectCitySimAerialInspectionToGeospatialOverlay,
} from '@/features/game-city-sim/citySimAerialInspectionProjection'
import {
  createDefaultCityGrid,
} from '@/features/game-city-sim/citySimModel'
import type {
  CitySimSnapshot,
} from '@/features/game-city-sim/citySimRuntimeState'
import {
  readFlightSimXrSpatialProfile,
} from '@/features/game-flight-sim/flightSimSpatialProfile'

function activeCitySnapshot(): CitySimSnapshot {
  const city = createDefaultCityGrid()
  return Object.freeze({
    active: true,
    advisor: null,
    city: Object.freeze({ ...city, tick: 17 }),
    costLog: null,
    error: null,
    estimatedCostUsd: 0,
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

export function testCitySimAerialInspectionReusesFlightGeoOverlayProjection() {
  const city = activeCitySnapshot()
  const profile = readFlightSimXrSpatialProfile()

  const overlay = projectCitySimAerialInspectionToGeospatialOverlay(
    city,
    profile,
  )

  assert.equal(overlay.active, true)
  assert.equal(overlay.phase, 'stopped')
  assert.equal(overlay.runId, 0)
  assert.equal(overlay.tick, 0)
  assert.equal(overlay.readyFrameRequestId, null)
  assert.equal(overlay.profileId, profile.id)
  assert.equal(overlay.camera.source, 'fixed-follow')
  assert.equal(overlay.camera.effectiveOwner, 'fixed-follow')
  assert.equal(overlay.camera.view, 'survey')
  assert.equal(overlay.night, false)
  assert.equal(overlay.environment, null)
  assert.equal(overlay.route.length, profile.waypoints.length + 2)
  assert.match(overlay.revision, /^city-aerial-inspection:/)
  assert.equal(Object.isFrozen(overlay), true)

  const laterCityTick = projectCitySimAerialInspectionToGeospatialOverlay(
    Object.freeze({
      ...city,
      city: Object.freeze({ ...city.city, tick: city.city.tick + 1 }),
      revision: city.revision + 1,
    }),
    profile,
  )
  assert.equal(laterCityTick.tick, 0)
  assert.equal(laterCityTick.revision, overlay.revision)
  assert.deepEqual(laterCityTick.aircraft, overlay.aircraft)
  assert.deepEqual(laterCityTick.route, overlay.route)

  const inactive = projectCitySimAerialInspectionToGeospatialOverlay(
    Object.freeze({ ...city, active: false, revision: city.revision + 1 }),
    profile,
  )
  assert.equal(inactive.active, false)
  assert.equal(inactive.runId, 0)
  assert.equal(inactive.tick, 0)
  assert.equal(inactive.readyFrameRequestId, null)
}
