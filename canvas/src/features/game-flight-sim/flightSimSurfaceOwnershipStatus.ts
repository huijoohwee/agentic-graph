export const FLIGHT_SIM_SURFACE_ENTRY_FAILURE_CODE = 'FLIGHT_SIM_SURFACE_ENTRY_FAILED'
export const FLIGHT_SIM_SURFACE_RESTORATION_FAILURE_CODE = 'FLIGHT_SIM_SURFACE_RESTORATION_FAILED'

export type FlightSimSurfaceOwnershipFailureCode =
  | typeof FLIGHT_SIM_SURFACE_ENTRY_FAILURE_CODE
  | typeof FLIGHT_SIM_SURFACE_RESTORATION_FAILURE_CODE

export type FlightSimSurfaceOwnershipFailure = Readonly<{
  code: FlightSimSurfaceOwnershipFailureCode
  message: string
  phase: 'entry' | 'restoration'
}>

export type FlightSimSurfaceOwnershipStatus = Readonly<{
  failure: FlightSimSurfaceOwnershipFailure | null
  revision: number
}>

let status: FlightSimSurfaceOwnershipStatus = Object.freeze({
  failure: null,
  revision: 0,
})

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message
    ? error.message
    : String(error || fallback)
}

function publish(
  failure: FlightSimSurfaceOwnershipFailure | null,
): FlightSimSurfaceOwnershipStatus {
  status = Object.freeze({ failure, revision: status.revision + 1 })
  return status
}

export function readFlightSimSurfaceOwnershipStatus(): FlightSimSurfaceOwnershipStatus {
  return status
}

export function clearFlightSimSurfaceOwnershipFailure(): FlightSimSurfaceOwnershipStatus {
  return publish(null)
}

export function reportFlightSimSurfaceEntryFailure(
  error: unknown,
): FlightSimSurfaceOwnershipStatus {
  return publish(Object.freeze({
    code: FLIGHT_SIM_SURFACE_ENTRY_FAILURE_CODE,
    message: errorMessage(error, 'Flight Sim surface entry failed.'),
    phase: 'entry',
  }))
}

export function reportFlightSimSurfaceRestorationFailure(
  error: unknown,
): FlightSimSurfaceOwnershipStatus {
  return publish(Object.freeze({
    code: FLIGHT_SIM_SURFACE_RESTORATION_FAILURE_CODE,
    message: errorMessage(error, 'Flight Sim surface restoration failed.'),
    phase: 'restoration',
  }))
}

export function resetFlightSimSurfaceOwnershipStatusForTests(): FlightSimSurfaceOwnershipStatus {
  status = Object.freeze({ failure: null, revision: 0 })
  return status
}
