import type { FlightSimSpatialProfile } from '@/features/game-flight-sim/flightSimModel'
import type { FlightSimGeoEnvironmentProjection } from '@/features/game-flight-sim/flightSimGeoEnvironmentProjection'
import {
  projectFlightSimToGeospatialOverlay,
  type FlightSimGeospatialOverlay,
} from '@/features/game-flight-sim/flightSimGeospatialProjection'
import { createIdleFlightSimSnapshot } from '@/features/game-flight-sim/flightSimRuntimeState'
import type { CitySimSnapshot } from './citySimRuntimeState'

export function projectCitySimAerialInspectionToGeospatialOverlay(
  city: CitySimSnapshot,
  profile: FlightSimSpatialProfile,
  environment: FlightSimGeoEnvironmentProjection | null,
): FlightSimGeospatialOverlay {
  const flightProjection = projectFlightSimToGeospatialOverlay(
    createIdleFlightSimSnapshot(profile, city.active, city.webglSupported),
    profile,
    { source: 'fixed-follow', view: 'survey' },
    false,
    null,
    environment,
  )
  return Object.freeze({
    ...flightProjection,
    active: city.active,
    phase: 'stopped',
    readyFrameRequestId: null,
    revision: `city-aerial-inspection:${flightProjection.revision}`,
    runId: 0,
    tick: 0,
  })
}
