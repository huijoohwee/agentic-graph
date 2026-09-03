import {
  readFlightSimSnapshot,
  subscribeFlightSimSnapshot,
} from './flightSimRuntime'
import {
  FLIGHT_SIM_MISSION_ENTITY_REF,
  type FlightSimDecisionRecord,
  type FlightSimPhase,
  type FlightSimSnapshot,
} from './flightSimModel'
import {
  isFlightSimTrainingAirspeedReliable,
  isFlightSimTrainingFailureActive,
  readFlightSimTrainingScenario,
  resolveFlightSimTrainingMission,
  setFlightSimTrainingVoiceEnabled,
  subscribeFlightSimTrainingScenario,
} from './flightSimTrainingScenario'
import {
  projectFlightSimEnvelope,
  type FlightSimEnvelopeProjection,
} from '../../../../packages/apple-spatial-input/src/flight'

export type FlightSimTrainingGrade = 'A' | 'B' | 'C' | 'D' | 'Pending'

export type FlightSimTrainingSnapshot = Readonly<{
  missionId: ReturnType<typeof readFlightSimTrainingScenario>['missionId']
  missionTitle: string
  objective: string
  terrain: string
  night: boolean
  failureId: ReturnType<typeof readFlightSimTrainingScenario>['failureId']
  failureActive: boolean
  failureRecovered: boolean
  voiceEnabled: boolean
  voiceAvailable: boolean
  flightActive: boolean
  phase: FlightSimPhase
  score: number
  grade: FlightSimTrainingGrade
  routeProgress: number
  stabilityPercent: number
  energyPercent: number
  airspeedReliable: boolean
  envelope: FlightSimEnvelopeProjection
  coachingCue: string
  systemsChecklist: readonly string[]
  revision: number
}>

type Listener = () => void
const listeners = new Set<Listener>()
let releaseFlightSubscription: (() => void) | null = null
let releaseScenarioSubscription: (() => void) | null = null
let lastFlightRevision = -1
let lastScenarioRevision = -1
let measuredRunId = 0
let measuredMissionId = ''
let measuredTick = 0
let observedTicks = 0
let stableTicks = 0
let energyTicks = 0
let failureRecovered = false
let snapshot: FlightSimTrainingSnapshot | null = null
let lastSpokenCue = ''

function percentage(numerator: number, denominator: number): number {
  return denominator > 0 ? Math.round((numerator / denominator) * 100) : 100
}

function grade(score: number, phase: FlightSimPhase): FlightSimTrainingGrade {
  if (phase !== 'completed' && phase !== 'crashed') return 'Pending'
  if (score >= 90) return 'A'
  if (score >= 80) return 'B'
  if (score >= 70) return 'C'
  return 'D'
}

function coachingCue(
  flight: FlightSimSnapshot,
  mission: ReturnType<typeof resolveFlightSimTrainingMission>,
  failureId: ReturnType<typeof readFlightSimTrainingScenario>['failureId'],
  activeFailure: boolean,
  recovered: boolean,
  envelope: FlightSimEnvelopeProjection,
): string {
  if (!flight.active) return `Open Flight Sim for ${mission.label}.`
  if (flight.phase === 'stopped') return `Start ${mission.label} when the systems checklist is complete.`
  if (flight.phase === 'completed') return 'Circuit complete. Review the measured score and save the debrief.'
  if (flight.phase === 'crashed') return 'Flight ended. Review the trace, correct one system, and restart.'
  if (activeFailure && failureId === 'engine-power-loss') {
    return 'Power loss. Hold attitude, preserve airspeed, then restore power after the drill window.'
  }
  if (activeFailure && failureId === 'instrument-uncertainty') {
    return 'Airspeed is unreliable. Cross-check pitch, power, and visual attitude.'
  }
  if (activeFailure) return 'Control bias detected. Counter gently and keep bank within the stable envelope.'
  if (recovered) return 'Failure recovered. Rejoin the circuit and stabilize the landing.'
  if (flight.phase === 'ready') return 'Advance power smoothly and keep wings level through departure.'
  if (envelope.status !== 'on-target') return envelope.recoveryCue
  return flight.currentWaypointId
    ? `Track ${flight.currentWaypointId}; keep pitch and bank inside the stable envelope.`
    : 'Settle on the marked landing area and hold the rollout.'
}

function resetMeasurements(
  flight: FlightSimSnapshot,
  missionId: string,
): void {
  measuredRunId = flight.runId
  measuredMissionId = missionId
  measuredTick = flight.tick
  observedTicks = 0
  stableTicks = 0
  energyTicks = 0
  failureRecovered = false
}

function measure(flight: FlightSimSnapshot, missionId: string): void {
  if (flight.runId !== measuredRunId
    || missionId !== measuredMissionId
    || flight.tick < measuredTick) {
    resetMeasurements(flight, missionId)
  }
  const elapsedTicks = Math.max(0, flight.tick - measuredTick)
  if (elapsedTicks === 0) return
  observedTicks += elapsedTicks
  if (Math.abs(flight.aircraft.roll) <= 0.35 && Math.abs(flight.aircraft.pitch) <= 0.28) {
    stableTicks += elapsedTicks
  }
  const speed = Math.hypot(...flight.aircraft.velocity)
  const mission = resolveFlightSimTrainingMission()
  const [minimumSpeed, maximumSpeed] = mission.targetSpeedMetersPerSecond
  if (speed >= minimumSpeed && speed <= maximumSpeed) energyTicks += elapsedTicks
  if (
    readFlightSimTrainingScenario().failureId !== 'none'
    && flight.tick >= 420
    && flight.aircraft.throttle >= 0.6
  ) {
    failureRecovered = true
  }
  measuredTick = flight.tick
}

function synchronize(): FlightSimTrainingSnapshot {
  const flight = readFlightSimSnapshot()
  const scenario = readFlightSimTrainingScenario()
  if (
    snapshot
    && flight.revision === lastFlightRevision
    && scenario.revision === lastScenarioRevision
  ) {
    return snapshot
  }
  measure(flight, scenario.missionId)
  const mission = resolveFlightSimTrainingMission(scenario.missionId)
  const stabilityPercent = percentage(stableTicks, observedTicks)
  const energyPercent = percentage(energyTicks, observedTicks)
  const routeProgress = flight.waypointCount > 0
    ? Math.round((flight.waypointIndex / flight.waypointCount) * 100)
    : 0
  const failureActive = isFlightSimTrainingFailureActive(flight)
  const airspeedReliable = isFlightSimTrainingAirspeedReliable(flight)
  const envelope = projectFlightSimEnvelope({
    aircraft: flight.aircraft,
    targetSpeedMetersPerSecond: mission.targetSpeedMetersPerSecond,
    airspeedReliable,
  })
  const routeScore = Math.round(Math.min(1, flight.waypointIndex / Math.max(1, flight.waypointCount)) * 40)
  const terminalScore = flight.phase === 'completed' ? 15 : 0
  const recoveryScore = scenario.failureId === 'none' || failureRecovered ? 10 : 0
  const score = Math.min(100, Math.round(
    routeScore
    + terminalScore
    + stabilityPercent * 0.2
    + energyPercent * 0.15
    + recoveryScore,
  ))
  snapshot = Object.freeze({
    missionId: scenario.missionId,
    missionTitle: mission.label,
    objective: mission.objective,
    terrain: mission.terrain,
    night: mission.night,
    failureId: scenario.failureId,
    failureActive,
    failureRecovered,
    voiceEnabled: scenario.voiceEnabled,
    voiceAvailable: typeof window !== 'undefined'
      && 'speechSynthesis' in window
      && typeof SpeechSynthesisUtterance !== 'undefined',
    flightActive: flight.active,
    phase: flight.phase,
    score,
    grade: grade(score, flight.phase),
    routeProgress,
    stabilityPercent,
    energyPercent,
    airspeedReliable,
    envelope,
    coachingCue: coachingCue(
      flight,
      mission,
      scenario.failureId,
      failureActive,
      failureRecovered,
      envelope,
    ),
    systemsChecklist: mission.systemsChecklist,
    revision: Math.max(flight.revision, scenario.revision),
  })
  lastFlightRevision = flight.revision
  lastScenarioRevision = scenario.revision
  return snapshot
}

function emit(): void {
  const previousCue = snapshot?.coachingCue
  const current = synchronize()
  if (
    current.voiceEnabled
    && current.coachingCue !== previousCue
    && current.coachingCue !== lastSpokenCue
  ) {
    speakFlightSimTrainingCue()
  }
  for (const listener of [...listeners]) listener()
}

function ensureSubscriptions(): void {
  if (releaseFlightSubscription) return
  releaseFlightSubscription = subscribeFlightSimSnapshot(emit)
  releaseScenarioSubscription = subscribeFlightSimTrainingScenario(emit)
}

function releaseSubscriptions(): void {
  if (listeners.size > 0) return
  releaseFlightSubscription?.()
  releaseScenarioSubscription?.()
  releaseFlightSubscription = null
  releaseScenarioSubscription = null
}

export function readFlightSimTrainingSnapshot(): FlightSimTrainingSnapshot {
  return synchronize()
}

export function subscribeFlightSimTrainingSnapshot(listener: Listener): () => void {
  listeners.add(listener)
  ensureSubscriptions()
  return () => {
    listeners.delete(listener)
    releaseSubscriptions()
  }
}

export function speakFlightSimTrainingCue(): boolean {
  const current = synchronize()
  if (!current.voiceAvailable || typeof window === 'undefined') return false
  window.speechSynthesis.cancel()
  const utterance = new SpeechSynthesisUtterance(current.coachingCue)
  utterance.rate = 0.96
  utterance.pitch = 1
  window.speechSynthesis.speak(utterance)
  lastSpokenCue = current.coachingCue
  return true
}

export function enableFlightSimVoiceInstructor(enabled: boolean): boolean {
  setFlightSimTrainingVoiceEnabled(enabled)
  return !enabled || speakFlightSimTrainingCue()
}

export function buildFlightSimTrainingOutcomeDecision(
  flight: FlightSimSnapshot = readFlightSimSnapshot(),
): FlightSimDecisionRecord | null {
  if (flight.runId <= 0 || (flight.phase !== 'completed' && flight.phase !== 'crashed')) {
    return null
  }
  return createFlightSimTrainingOutcomeDecision(flight, synchronize())
}

export function createFlightSimTrainingOutcomeDecision(
  flight: Pick<FlightSimSnapshot, 'runId' | 'phase' | 'tick'>,
  training: FlightSimTrainingSnapshot,
): FlightSimDecisionRecord {
  return Object.freeze({
    decisionId: `flight-training:run-${flight.runId}:${training.missionId}:outcome`,
    decisionType: 'dialogue_outcome',
    entityRef: FLIGHT_SIM_MISSION_ENTITY_REF,
    payload: Object.freeze({
      schema: 'agentic-graph-flight-training-outcome/v1',
      missionId: training.missionId,
      status: flight.phase,
      score: training.score,
      grade: training.grade,
      routeProgress: training.routeProgress,
      stabilityPercent: training.stabilityPercent,
      energyPercent: training.energyPercent,
      failureId: training.failureId,
      failureRecovered: training.failureRecovered,
      night: training.night,
    }),
    producedAt: new Date(Date.UTC(2026, 0, 1) + flight.tick * 20 + 10).toISOString(),
  })
}

export function resetFlightSimTrainingRuntimeForTests(): void {
  lastFlightRevision = -1
  lastScenarioRevision = -1
  measuredRunId = 0
  measuredMissionId = ''
  measuredTick = 0
  observedTicks = 0
  stableTicks = 0
  energyTicks = 0
  failureRecovered = false
  snapshot = null
  lastSpokenCue = ''
}
