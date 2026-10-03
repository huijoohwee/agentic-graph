export const FLIGHT_SIM_SIMULATION_SPEEDS = Object.freeze([0.5, 1, 2] as const)

export type FlightSimSimulationSpeed = (typeof FLIGHT_SIM_SIMULATION_SPEEDS)[number]
export type FlightSimPresentationSettings = Readonly<{
  simulationSpeed: FlightSimSimulationSpeed
  overlaysVisible: boolean
  navigationVisible: boolean
  revision: number
}>
export type FlightSimPresentationSettingsPatch =
  Readonly<Partial<Omit<FlightSimPresentationSettings, 'revision'>>>

const defaults = Object.freeze({
  simulationSpeed: 1 as FlightSimSimulationSpeed,
  overlaysVisible: true,
  navigationVisible: true,
})
const listeners = new Set<() => void>()
let snapshot: FlightSimPresentationSettings = Object.freeze({ ...defaults, revision: 0 })

export function readFlightSimPresentationSettings(): FlightSimPresentationSettings {
  return snapshot
}

export function subscribeFlightSimPresentationSettings(listener: () => void): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

export function updateFlightSimPresentationSettings(
  patch: FlightSimPresentationSettingsPatch,
): FlightSimPresentationSettings {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)
    || Reflect.ownKeys(patch).some(key => !Object.hasOwn(defaults, key))) {
    throw new Error('Flight Sim presentation settings require a supported partial settings object.')
  }
  if (Object.hasOwn(patch, 'simulationSpeed')
    && !FLIGHT_SIM_SIMULATION_SPEEDS.includes(patch.simulationSpeed as FlightSimSimulationSpeed)) {
    throw new Error('Flight Sim simulation speed must be 0.5, 1, or 2.')
  }
  for (const key of ['overlaysVisible', 'navigationVisible'] as const) {
    if (Object.hasOwn(patch, key) && typeof patch[key] !== 'boolean') {
      throw new Error(`Flight Sim ${key} must be a boolean.`)
    }
  }
  const next = { ...snapshot, ...patch }
  if (next.simulationSpeed === snapshot.simulationSpeed
    && next.overlaysVisible === snapshot.overlaysVisible
    && next.navigationVisible === snapshot.navigationVisible) return snapshot
  snapshot = Object.freeze({ ...next, revision: snapshot.revision + 1 })
  for (const listener of [...listeners]) listener()
  return snapshot
}

export function resetFlightSimPresentationSettings(): FlightSimPresentationSettings {
  return updateFlightSimPresentationSettings(defaults)
}
