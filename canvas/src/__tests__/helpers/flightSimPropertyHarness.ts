import type { Parameters } from 'fast-check'

export const FLIGHT_SIM_PROPERTY_RUNS = 100
export const FLIGHT_SIM_PROPERTY_BASE_SEED = 0x4b475300

export function flightSimPropertyParameters(
  propertyNumber: number,
): Parameters<unknown> {
  if (!Number.isInteger(propertyNumber) || propertyNumber < 1 || propertyNumber > 45) {
    throw new RangeError('Flight Sim property number must be an integer from 1 through 45')
  }
  return Object.freeze({
    numRuns: FLIGHT_SIM_PROPERTY_RUNS,
    seed: FLIGHT_SIM_PROPERTY_BASE_SEED + propertyNumber,
  })
}
