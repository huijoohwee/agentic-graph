import {
  cancelCurrentFlightSimReadyFrame,
  coordinateFlightSimReadyPublication,
} from './flightSimDeadlineRuntime'
import type { FlightSimSpatialProfile } from './flightSimModel'
import { createFlightSimRuntime } from './flightSimRuntimeCore'
import type { FlightSimRuntime } from './flightSimRuntimeState'
import { readFlightSimXrSpatialProfile } from './flightSimSpatialProfile'

function createDefaultRuntime(options: Readonly<{
  profile: FlightSimSpatialProfile
  active: boolean
  webglSupported: boolean
}>): FlightSimRuntime {
  return createFlightSimRuntime({
    ...options,
    cancelReadyPublication: cancelCurrentFlightSimReadyFrame,
    coordinateReadyPublication: coordinateFlightSimReadyPublication,
  })
}

export let flightSimDefaultRuntime = createDefaultRuntime({
  profile: readFlightSimXrSpatialProfile(),
  active: false,
  webglSupported: false,
})

export function resetFlightSimDefaultRuntime(
  profile: FlightSimSpatialProfile,
): FlightSimRuntime {
  flightSimDefaultRuntime = createDefaultRuntime({
    profile,
    active: false,
    webglSupported: false,
  })
  return flightSimDefaultRuntime
}
