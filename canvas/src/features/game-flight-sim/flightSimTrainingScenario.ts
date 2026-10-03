import {
  clampFlightSimUnit,
  type FlightSimPhase,
  type FlightSimSnapshot,
  type FlightSimTickInput,
} from './flightSimModel'
import type {
  FlightSimTrainingProfile,
  FlightSimTrainingMission,
  FlightSimTrainingFailure,
} from './flightSimTrainingProfile'
import type { FlightSimGeographicReference } from './flightSimGeospatialCoordinates'
export type { FlightSimTrainingMission } from './flightSimTrainingProfile'
export type FlightSimTrainingMissionId = string
export type FlightSimTrainingFailureId = string

export type FlightSimTrainingScenarioSnapshot = Readonly<{
  profile: FlightSimTrainingProfile | null
  geographicReference: FlightSimGeographicReference | null
  sourceKey: string
  missionId: string
  failureId: string
  voiceEnabled: boolean
  revision: number
  runBinding: Readonly<{ runId: number; profileSourceKey: string; missionId: string; failureId: string }> | null
}>

type Listener = () => void
const listeners = new Set<Listener>()
let scenario: FlightSimTrainingScenarioSnapshot = Object.freeze({
  profile: null, geographicReference: null, sourceKey: '', missionId: '', failureId: '', voiceEnabled: false, revision: 0, runBinding: null,
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
/** The existing scenario owner is the sole admitted configuration and selection store. */
export function admitFlightSimTrainingProfile(
  profile: FlightSimTrainingProfile | null,
  sourceKey: string,
  phase: FlightSimPhase,
  isCurrent?: () => boolean,
  geographicReference: FlightSimGeographicReference | null = null,
): FlightSimTrainingScenarioSnapshot {
  if (scenario.sourceKey === sourceKey && JSON.stringify(scenario.profile) === JSON.stringify(profile)
    && JSON.stringify(scenario.geographicReference) === JSON.stringify(geographicReference)) return scenario
  if (phase !== 'stopped') {
    throw new Error('Flight training source changed during an active run; stop before admitting another profile.')
  }
  const mission = profile?.missions.find(item => item.id === profile.defaultMissionId)
  const previous = scenario
  try {
    if (isCurrent && !isCurrent()) throw new Error('Flight training admission is no longer current before profile publication.')
    const next = publish({ profile, geographicReference, sourceKey, missionId: mission?.id || '', failureId: mission?.defaultFailureId || '' })
    if (isCurrent && !isCurrent()) throw new Error('Flight training admission is no longer current during profile publication.')
    return next
  } catch (error) {
    scenario = previous
    for (const listener of [...listeners]) { try { listener() } catch { /* retain the admission failure */ } }
    throw error
  }

}
/** A retained run may resume only with the selection and source that governed it. */
export function assertFlightSimTrainingRunBinding(runId: number): void {
  const binding = scenario.runBinding
  if (binding?.runId === runId && (binding.profileSourceKey !== scenario.sourceKey || binding.missionId !== scenario.missionId || binding.failureId !== scenario.failureId)) {
    throw new Error('Flight training selection or source changed while stopped; Restart is required for a new run.')
  }
}
export function bindFlightSimTrainingRun(flight: Pick<FlightSimSnapshot, 'active' | 'phase' | 'runId'>): void {
  if (!flight.active || flight.phase === 'stopped' || flight.runId < 1) return
  if (scenario.runBinding?.runId === flight.runId && scenario.runBinding.profileSourceKey === scenario.sourceKey && scenario.runBinding.missionId === scenario.missionId && scenario.runBinding.failureId === scenario.failureId) return
  publish({ runBinding: Object.freeze({ runId: flight.runId, profileSourceKey: scenario.sourceKey, missionId: scenario.missionId, failureId: scenario.failureId }) })
}
export function resolveFlightSimTrainingMission(
  missionId: string = scenario.missionId,
): FlightSimTrainingMission | null {
  return scenario.profile?.missions.find(item => item.id === missionId) || null
}
export function resolveFlightSimTrainingFailure(): FlightSimTrainingFailure | null {
  return scenario.profile?.failures.find(item => item.id === scenario.failureId) || null
}
export function selectFlightSimTrainingMission(missionId: string): FlightSimTrainingScenarioSnapshot {
  const mission = resolveFlightSimTrainingMission(missionId)
  if (!mission) throw new Error(`Flight training mission is unavailable or unsupported: ${missionId}`)
  return publish({ missionId: mission.id, failureId: mission.defaultFailureId })
}
export function selectFlightSimTrainingFailure(failureId: string): FlightSimTrainingScenarioSnapshot {
  if (!scenario.profile?.failures.some(item => item.id === failureId)) {
    throw new Error(`Flight training failure is unavailable or unsupported: ${failureId}`)
  }
  return publish({ failureId })
}
export function setFlightSimTrainingVoiceEnabled(voiceEnabled: boolean): FlightSimTrainingScenarioSnapshot {
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
  const window = scenario.profile?.failureWindow
  const failure = resolveFlightSimTrainingFailure()
  return Boolean(window && failure && failure.effect.kind !== 'none'
    && flight.active && (flight.phase === 'ready' || flight.phase === 'flying')
    && tick >= window.startTick && tick < window.endTickExclusive)
}
export function isFlightSimTrainingAirspeedReliable(
  flight: Pick<FlightSimSnapshot, 'active' | 'phase' | 'tick'>,
): boolean {
  return resolveFlightSimTrainingFailure()?.effect.kind !== 'airspeed-unreliable'
    || !isFlightSimTrainingFailureActive(flight)
}
export function applyFlightSimTrainingTickModifiers(args: Readonly<{
  flight: Pick<FlightSimSnapshot, 'active' | 'phase' | 'tick'> & Readonly<{
    aircraft: Pick<FlightSimSnapshot['aircraft'], 'throttle'>
  }>
  input: FlightSimTickInput
  throttleSetpoint: number | null
}>): Readonly<{ input: FlightSimTickInput; throttleSetpoint: number | null }> {
  const effect = resolveFlightSimTrainingFailure()?.effect
  if (!isFlightSimTrainingFailureActiveAtTick(args.flight, args.flight.tick + 1)) {
    return Object.freeze({ input: args.input, throttleSetpoint: args.throttleSetpoint })
  }
  if (effect?.kind === 'throttle-limit') {
    const requestedThrottle = args.throttleSetpoint ?? args.flight.aircraft.throttle
    return Object.freeze({
      input: Object.freeze({ ...args.input, throttleDelta: Math.min(args.input.throttleDelta, effect.throttleDelta) }),
      throttleSetpoint: Math.min(requestedThrottle, effect.maxThrottle),
    })
  }
  if (effect?.kind === 'input-bias') return Object.freeze({
    input: Object.freeze({
      ...args.input,
      roll: clampFlightSimUnit(args.input.roll + effect.roll, 'Flight training roll bias'),
      yaw: clampFlightSimUnit(args.input.yaw + effect.yaw, 'Flight training yaw bias'),
    }),
    throttleSetpoint: args.throttleSetpoint,
  })
  return Object.freeze({ input: args.input, throttleSetpoint: args.throttleSetpoint })
}
export function resetFlightSimTrainingScenarioForTests(): void {
  publish({ profile: null, geographicReference: null, sourceKey: '', missionId: '', failureId: '', voiceEnabled: false, runBinding: null })
}
