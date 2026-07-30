import assert from 'node:assert/strict'
import { createDefaultCityGrid } from '@/features/game-city-sim/citySimModel'
import type { CitySimSnapshot } from '@/features/game-city-sim/citySimRuntimeState'
import {
  projectCitySimAerialInspectionToGeospatialOverlay,
} from '@/features/game-city-sim/citySimAerialInspectionProjection'
import {
  beginFlightSimReadyFrame,
  readCurrentFlightSimReadyFrameRequestId,
  resetFlightSimDeadlineRuntimeForTests,
} from '@/features/game-flight-sim/flightSimDeadlineRuntime'
import {
  projectXrEnvironmentToFlightGeo,
} from '@/features/game-flight-sim/flightSimGeoEnvironmentProjection'
import {
  projectFlightSimToGeospatialOverlay,
  type FlightSimGeospatialOverlay,
} from '@/features/game-flight-sim/flightSimGeospatialProjection'
import { createIdleFlightSimSnapshot } from '@/features/game-flight-sim/flightSimRuntimeState'
import { readFlightSimXrSpatialProfile } from '@/features/game-flight-sim/flightSimSpatialProfile'
import {
  applyGeoXrGameplayOverlayPublication,
} from '@/features/geospatial/geoXrGameplayOverlayArbitration'

function activeCitySnapshot(): CitySimSnapshot {
  return Object.freeze({
    active: true,
    advisor: null,
    city: createDefaultCityGrid(),
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
    selectedParcelId: null,
    webglSupported: true,
  })
}

export function testCityFlightGeoOverlayArbitrationIsDeterministic() {
  resetFlightSimDeadlineRuntimeForTests()
  const profile = readFlightSimXrSpatialProfile()
  const environment = projectXrEnvironmentToFlightGeo({
    stageId: 'singapore',
    subjects: [],
  })
  const city = activeCitySnapshot()
  const inactiveFlight = createIdleFlightSimSnapshot(profile, false, true)
  const activeFlight = Object.freeze({
    ...createIdleFlightSimSnapshot(profile, true, true),
    phase: 'ready' as const,
    revision: 1,
    runId: 1,
  })
  const flightBefore = structuredClone(activeFlight)
  const readyFrameBefore = beginFlightSimReadyFrame(
    () => 100,
    () => () => void 0,
  )
  const events: string[] = []
  const published: FlightSimGeospatialOverlay[] = []
  let cityProjectionCount = 0
  let flightProjectionCount = 0
  const projectCity = () => {
    cityProjectionCount += 1
    return projectCitySimAerialInspectionToGeospatialOverlay(
      city,
      profile,
      environment,
    )
  }
  const projectFlight = () => {
    flightProjectionCount += 1
    return projectFlightSimToGeospatialOverlay(
      activeFlight,
      profile,
      { source: 'fixed-follow', view: 'survey' },
      false,
      readyFrameBefore,
      environment,
    )
  }

  const setOverlay = (overlay: ReturnType<typeof projectFlight>) => {
    published.push(overlay)
    events.push(
      overlay.runId === 0 && overlay.readyFrameRequestId === null
        ? 'city'
        : 'flight',
    )
  }
  const clearOverlay = () => events.push('clear')
  try {
    assert.equal(applyGeoXrGameplayOverlayPublication({
      city,
      clearOverlay,
      flight: inactiveFlight,
      projectCity,
      projectFlight,
      setOverlay,
    }), 'city')
    assert.equal(cityProjectionCount, 1)
    assert.equal(flightProjectionCount, 0)

    assert.equal(applyGeoXrGameplayOverlayPublication({
      city,
      clearOverlay,
      flight: activeFlight,
      projectCity,
      projectFlight,
      setOverlay,
    }), 'flight')
    assert.equal(cityProjectionCount, 1)
    assert.equal(flightProjectionCount, 1)

    assert.equal(applyGeoXrGameplayOverlayPublication({
      city: Object.freeze({ ...city, active: false }),
      clearOverlay,
      flight: inactiveFlight,
      projectCity,
      projectFlight,
      setOverlay,
    }), 'clear')
    assert.deepEqual(events, ['city', 'flight', 'clear'])
    assert.equal(published[0]?.phase, 'stopped')
    assert.equal(published[0]?.runId, 0)
    assert.equal(published[0]?.tick, 0)
    assert.equal(published[0]?.readyFrameRequestId, null)
    assert.equal(published[1]?.phase, 'ready')
    assert.equal(published[1]?.readyFrameRequestId, readyFrameBefore)
    assert.equal(cityProjectionCount, 1)
    assert.equal(flightProjectionCount, 1)
    assert.deepEqual(activeFlight, flightBefore)
    assert.equal(
      readCurrentFlightSimReadyFrameRequestId(),
      readyFrameBefore,
      'City arbitration must not mutate Flight readiness',
    )
  } finally {
    resetFlightSimDeadlineRuntimeForTests()
  }
}
