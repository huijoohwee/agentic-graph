export const FLIGHT_SIM_METERS_PER_AUTHORED_WORLD_UNIT = 20
export const FLIGHT_SIM_SPATIAL_SCALE_ID =
  `flight-meters-${FLIGHT_SIM_METERS_PER_AUTHORED_WORLD_UNIT}`

export function flightSimAuthoredWorldUnitsToMeters(value: number): number {
  return value * FLIGHT_SIM_METERS_PER_AUTHORED_WORLD_UNIT
}

export function resolveFlightSimGameplayCoordinateScale(
  authoredSceneScale: number,
  flightSimActive: boolean,
): number {
  return flightSimActive
    ? authoredSceneScale / FLIGHT_SIM_METERS_PER_AUTHORED_WORLD_UNIT
    : authoredSceneScale
}
