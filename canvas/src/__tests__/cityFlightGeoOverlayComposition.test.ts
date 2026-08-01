import assert from 'node:assert/strict'
import type { CitySimSnapshot } from '@/features/game-city-sim/citySimRuntimeState'
import {
  projectCitySimToGeospatialOverlay,
} from '@/features/game-city-sim/citySimGeospatialProjection'
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
import type { FlightSimSnapshot } from '@/features/game-flight-sim/flightSimModel'
import { createIdleFlightSimSnapshot } from '@/features/game-flight-sim/flightSimRuntimeState'
import { readFlightSimXrSpatialProfile } from '@/features/game-flight-sim/flightSimSpatialProfile'
import {
  publishGeoXrOverlayComposition,
  resolveGeoXrGameplayPresentationOwner,
  type GeoXrOverlayStoreModule,
} from '@/features/geospatial/geoXrFlightOverlayComposition'
import { readAuthoritativeCitySimSource } from './citySimAuthoritativeSource'

function activeCitySnapshot(): CitySimSnapshot {
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
    selectedParcelId: null,
    webglSupported: true,
  })
}

export function testCityFlightGeoOverlayCompositionIsDeterministic() {
  resetFlightSimDeadlineRuntimeForTests()
  const profile = readFlightSimXrSpatialProfile()
  const environment = projectXrEnvironmentToFlightGeo({
    stageId: 'singapore',
    subjects: [],
  })
  const city = activeCitySnapshot()
  const inactiveCity = Object.freeze({ ...city, active: false })
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
  let cityOverlayProjectionCount = 0
  let flightProjectionCount = 0
  const projectCityOverlay = (snapshot: CitySimSnapshot) => {
    cityOverlayProjectionCount += 1
    return projectCitySimToGeospatialOverlay(snapshot)
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
  const store: GeoXrOverlayStoreModule = {
    clearCityGeoOverlay: () => events.push('city:hard-clear'),
    clearFlightGeoOverlay: () => events.push('flight:clear'),
    setCityGeoOverlay: overlay => {
      events.push(overlay.active ? 'city:active' : 'city:clear')
    },
    setFlightGeoOverlay: overlay => {
      published.push(overlay)
      events.push(`flight:${overlay.presentationOwner}`)
    },
  }
  const publish = (nextCity: CitySimSnapshot, nextFlight: FlightSimSnapshot) => (
    publishGeoXrOverlayComposition({
      city: nextCity,
      flight: nextFlight,
      projectCityOverlay,
      projectFlight,
      store,
    })
  )

  try {
    assert.equal(publish(city, inactiveFlight), 'city')
    assert.deepEqual(events.splice(0), ['flight:clear', 'city:active'])

    assert.equal(publish(city, activeFlight), 'flight')
    assert.deepEqual(events.splice(0), ['city:hard-clear', 'flight:flight'])

    assert.equal(publish(city, inactiveFlight), 'city')
    assert.deepEqual(events.splice(0), ['flight:clear', 'city:active'])

    assert.equal(publish(inactiveCity, inactiveFlight), 'clear')
    assert.deepEqual(events.splice(0), ['flight:clear', 'city:clear'])

    assert.equal(cityOverlayProjectionCount, 3)
    assert.equal(flightProjectionCount, 1)
    assert.equal(published[0]?.phase, 'ready')
    assert.equal(published[0]?.readyFrameRequestId, readyFrameBefore)
    assert.strictEqual(published[0]?.environment, environment)
    assert.deepEqual(activeFlight, flightBefore)
    assert.equal(
      readCurrentFlightSimReadyFrameRequestId(),
      readyFrameBefore,
      'City composition must not mutate Flight readiness',
    )

    assert.equal(resolveGeoXrGameplayPresentationOwner({
      cityActive: true,
      flightActive: false,
      flightBootstrapRequested: true,
    }), 'city')
    assert.equal(resolveGeoXrGameplayPresentationOwner({
      cityActive: false,
      flightActive: false,
      flightBootstrapRequested: true,
    }), 'flight')
    assert.equal(resolveGeoXrGameplayPresentationOwner({
      cityActive: true,
      flightActive: true,
      flightBootstrapRequested: false,
    }), 'flight')
    assert.equal(resolveGeoXrGameplayPresentationOwner({
      cityActive: false,
      flightActive: false,
      flightBootstrapRequested: false,
    }), null)
  } finally {
    resetFlightSimDeadlineRuntimeForTests()
  }
}
