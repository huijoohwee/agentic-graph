import type { FlightSimSpatialProfile } from '@/features/game-flight-sim/flightSimModel'
import {
  projectFlightSimToGeospatialOverlay,
  type FlightSimGeospatialOverlay,
} from '@/features/game-flight-sim/flightSimGeospatialProjection'
import { createIdleFlightSimSnapshot } from '@/features/game-flight-sim/flightSimRuntimeState'
import type { CitySimSnapshot } from './citySimRuntimeState'

export function projectCitySimAerialInspectionToGeospatialOverlay(
  city: CitySimSnapshot,
  profile: FlightSimSpatialProfile,
): FlightSimGeospatialOverlay {
  const flightProjection = projectFlightSimToGeospatialOverlay(
    createIdleFlightSimSnapshot(profile, city.active, city.webglSupported),
    profile,
    { source: 'fixed-follow', view: 'survey' },
    false,
    null,
    null,
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
