import {
  captureFlightSimMission,
  type FlightSimMission,
} from './flightSimMission'

export class FlightSimExternalCallBlockedError extends Error {
  readonly code = 'FLIGHT_SIM_GAMEPLAY_NETWORK_BLOCKED'
  readonly operation: string
  readonly synchronous = true

  constructor(operation: string) {
    super(`Flight Sim blocked gameplay network operation: ${operation}`)
    this.name = 'FlightSimExternalCallBlockedError'
    this.operation = operation
  }
}

export function blockFlightSimGameplayNetworkAttempt(
  mission: FlightSimMission,
  operation: string,
  _executor: () => unknown,
): never {
  if (!operation || operation.trim() !== operation) {
    throw new Error(
      'Flight Sim gameplay network operation must be a non-empty trimmed string',
    )
  }
  captureFlightSimMission(mission)
  throw new FlightSimExternalCallBlockedError(operation)
}
