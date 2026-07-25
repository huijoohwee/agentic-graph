import {
  clampFlightSimUnit,
  type FlightSimSnapshot,
  type FlightSimTickInput,
} from './flightSimModel'

export const FLIGHT_SIM_TRAINING_MISSIONS = Object.freeze([
  {
    id: 'circuit-foundation',
    label: 'Circuit Foundation',
    objective: 'Fly the ordered waterfront circuit and stabilize the marked landing.',
    terrain: 'Procedural waterfront',
    night: false,
    targetSpeedMetersPerSecond: Object.freeze([8, 22] as const),
    defaultFailure: 'none',
    systemsChecklist: Object.freeze(['Controls free', 'Power set', 'Route briefed']),
  },
  {
    id: 'night-circuit',
    label: 'Night Circuit',
    objective: 'Hold the circuit by instruments and runway lighting with reduced visual range.',
    terrain: 'Procedural waterfront at night',
    night: true,
    targetSpeedMetersPerSecond: Object.freeze([9, 20] as const),
    defaultFailure: 'instrument-uncertainty',
    systemsChecklist: Object.freeze(['Lights checked', 'Instruments cross-checked', 'Stable approach']),
  },
  {
    id: 'systems-recovery',
    label: 'Systems Recovery',
    objective: 'Recognize a bounded power loss, retain control, and recover before landing.',
    terrain: 'Procedural waterfront recovery area',
    night: false,
    targetSpeedMetersPerSecond: Object.freeze([8, 18] as const),
    defaultFailure: 'engine-power-loss',
    systemsChecklist: Object.freeze(['Aviate', 'Diagnose power', 'Recover and land']),
  },
] as const)

export type FlightSimTrainingMission = (typeof FLIGHT_SIM_TRAINING_MISSIONS)[number]
export type FlightSimTrainingMissionId = FlightSimTrainingMission['id']

export const FLIGHT_SIM_TRAINING_FAILURES = Object.freeze([
  { id: 'none', label: 'No injected failure' },
  { id: 'engine-power-loss', label: 'Engine power loss' },
  { id: 'instrument-uncertainty', label: 'Unreliable airspeed' },
  { id: 'control-bias', label: 'Control bias' },
] as const)

export type FlightSimTrainingFailureId =
  (typeof FLIGHT_SIM_TRAINING_FAILURES)[number]['id']

export type FlightSimTrainingScenarioSnapshot = Readonly<{
  missionId: FlightSimTrainingMissionId
  failureId: FlightSimTrainingFailureId
  voiceEnabled: boolean
  revision: number
}>

type Listener = () => void
const listeners = new Set<Listener>()
let scenario: FlightSimTrainingScenarioSnapshot = Object.freeze({
  missionId: 'circuit-foundation',
  failureId: 'none',
  voiceEnabled: false,
  revision: 0,
})

function publish(
  patch: Partial<Omit<FlightSimTrainingScenarioSnapshot, 'revision'>>,
): FlightSimTrainingScenarioSnapshot {
  scenario = Object.freeze({ ...scenario, ...patch, revision: scenario.revision + 1 })
  for (const listener of [...listeners]) listener()
  return scenario
}

export function readFlightSimTrainingScenario(): FlightSimTrainingScenarioSnapshot {
  return scenario
}

export function subscribeFlightSimTrainingScenario(listener: Listener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function resolveFlightSimTrainingMission(
  missionId: FlightSimTrainingMissionId = scenario.missionId,
): FlightSimTrainingMission {
  return FLIGHT_SIM_TRAINING_MISSIONS.find(item => item.id === missionId)
    ?? FLIGHT_SIM_TRAINING_MISSIONS[0]
}

export function selectFlightSimTrainingMission(
  missionId: FlightSimTrainingMissionId,
): FlightSimTrainingScenarioSnapshot {
  const mission = resolveFlightSimTrainingMission(missionId)
  return publish({ missionId: mission.id, failureId: mission.defaultFailure })
}

export function selectFlightSimTrainingFailure(
  failureId: FlightSimTrainingFailureId,
): FlightSimTrainingScenarioSnapshot {
  const supported = FLIGHT_SIM_TRAINING_FAILURES.some(item => item.id === failureId)
  if (!supported) throw new Error(`Unsupported Flight Sim training failure: ${failureId}`)
  return publish({ failureId })
}

export function setFlightSimTrainingVoiceEnabled(
  voiceEnabled: boolean,
): FlightSimTrainingScenarioSnapshot {
  return publish({ voiceEnabled: Boolean(voiceEnabled) })
}

export function isFlightSimTrainingFailureActive(
  flight: Pick<FlightSimSnapshot, 'active' | 'phase' | 'tick'>,
): boolean {
  return isFlightSimTrainingFailureActiveAtTick(flight, flight.tick)
}

function isFlightSimTrainingFailureActiveAtTick(
  flight: Pick<FlightSimSnapshot, 'active' | 'phase'>,
  tick: number,
): boolean {
  return flight.active
    && (flight.phase === 'ready' || flight.phase === 'flying')
    && tick >= 180
    && tick < 420
    && scenario.failureId !== 'none'
}

export function isFlightSimTrainingAirspeedReliable(
  flight: Pick<FlightSimSnapshot, 'active' | 'phase' | 'tick'>,
): boolean {
  return scenario.failureId !== 'instrument-uncertainty'
    || !isFlightSimTrainingFailureActive(flight)
}

export function applyFlightSimTrainingTickModifiers(args: Readonly<{
  flight: Pick<FlightSimSnapshot, 'active' | 'phase' | 'tick'> & Readonly<{
    aircraft: Pick<FlightSimSnapshot['aircraft'], 'throttle'>
  }>
  input: FlightSimTickInput
  throttleSetpoint: number | null
}>): Readonly<{
  input: FlightSimTickInput
  throttleSetpoint: number | null
}> {
  if (!isFlightSimTrainingFailureActiveAtTick(args.flight, args.flight.tick + 1)) {
    return Object.freeze({
      input: args.input,
      throttleSetpoint: args.throttleSetpoint,
    })
  }
  if (scenario.failureId === 'engine-power-loss') {
    const requestedThrottle = args.throttleSetpoint ?? args.flight.aircraft.throttle
    return Object.freeze({
      input: Object.freeze({
        ...args.input,
        throttleDelta: Math.min(args.input.throttleDelta, -0.7),
      }),
      throttleSetpoint: Math.min(requestedThrottle, 0.28),
    })
  }
  if (scenario.failureId === 'control-bias') {
    return Object.freeze({
      input: Object.freeze({
        ...args.input,
        roll: clampFlightSimUnit(args.input.roll + 0.22, 'Flight training roll bias'),
        yaw: clampFlightSimUnit(args.input.yaw - 0.14, 'Flight training yaw bias'),
      }),
      throttleSetpoint: args.throttleSetpoint,
    })
  }
  return Object.freeze({
    input: args.input,
    throttleSetpoint: args.throttleSetpoint,
  })
}

export function resetFlightSimTrainingScenarioForTests(): void {
  scenario = Object.freeze({
    missionId: 'circuit-foundation',
    failureId: 'none',
    voiceEnabled: false,
    revision: scenario.revision + 1,
  })
  for (const listener of [...listeners]) listener()
}
