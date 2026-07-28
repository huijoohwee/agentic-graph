import {
  FLIGHT_SIM_MAX_FRAME_SECONDS,
  FLIGHT_SIM_ZERO_COST_LOG,
  type FlightSimDecisionRecord,
  type FlightSimInputPatch,
  type FlightSimSnapshot,
  type FlightSimSpatialProfile,
  type FlightSimTickInput,
} from './flightSimModel'

export type FlightSimAdvanceRequest = Readonly<{
  deltaSeconds: number
  generation: number
  input: FlightSimTickInput
  throttleSetpoint: number | null
}>

type Listener = () => void
export type FlightSimPresenterKind = 'maplibre' | 'surface'
export type FlightSimReadyPublication = Readonly<{
  snapshot: FlightSimSnapshot
  hasPresenter: (kind: FlightSimPresenterKind) => boolean
  notifyPresenter: (kind: FlightSimPresenterKind) => void
  notifyFollowers: (presenter: FlightSimPresenterKind) => void
}>

export type FlightSimRuntime = Readonly<{
  profile: () => FlightSimSpatialProfile
  read: () => FlightSimSnapshot
  subscribe: (listener: Listener) => () => void
  subscribeHud: (listener: Listener) => () => void
  subscribePresenter: (
    kind: FlightSimPresenterKind,
    listener: Listener,
  ) => () => void
  open: (webglSupported?: boolean) => FlightSimSnapshot
  start: () => FlightSimSnapshot
  stop: () => FlightSimSnapshot
  restart: () => FlightSimSnapshot
  exit: () => FlightSimSnapshot
  setProfile: (profile: FlightSimSpatialProfile) => FlightSimSnapshot
  setInput: (patch: FlightSimInputPatch) => FlightSimSnapshot
  queueInput: (patch: FlightSimInputPatch) => FlightSimSnapshot
  setThrottle: (value: number) => FlightSimSnapshot
  advanceBy: (deltaSeconds: number) => Promise<FlightSimSnapshot>
  acknowledgeDecisions: (ids: readonly string[]) => FlightSimSnapshot
  hydrate: (decisions: readonly unknown[]) => FlightSimSnapshot
  resetPersistence: () => FlightSimSnapshot
  rejectGameplayNetworkAttempt: (
    operation: string,
    executor: () => unknown,
  ) => FlightSimSnapshot
  fail: (error: unknown) => FlightSimSnapshot
}>

export function freezeFlightSimDecision(value: FlightSimDecisionRecord): FlightSimDecisionRecord {
  return Object.freeze({ ...value, payload: Object.freeze({ ...value.payload }) })
}

export function flightSimRuntimeErrorMessage(error: unknown): string {
  return error instanceof Error && error.message
    ? error.message
    : String(error || 'Flight Sim runtime failed')
}

export function createIdleFlightSimSnapshot(
  profile: FlightSimSpatialProfile,
  active: boolean,
  webglSupported: boolean,
): FlightSimSnapshot {
  return Object.freeze({
    active,
    surfaceMode: 'xr',
    webglSupported,
    phase: 'stopped',
    runId: 0,
    aircraft: profile.spawn,
    waypointIndex: 0,
    waypointCount: profile.waypoints.length,
    currentWaypointId: profile.waypoints[0]?.id || profile.landingPad.id,
    tick: 0,
    elapsedSeconds: 0,
    collisionId: null,
    pendingDecisions: Object.freeze([]),
    lastCostLog: FLIGHT_SIM_ZERO_COST_LOG,
    runtimeError: null,
    revision: 0,
  })
}

export function boundedFlightSimDeltaSeconds(value: number): number {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error('Flight Sim delta must be a non-negative finite number')
  }
  return Math.min(value, FLIGHT_SIM_MAX_FRAME_SECONDS)
}

export function maximumFlightSimDecisionRunId(
  decisions: readonly FlightSimDecisionRecord[],
): number {
  return decisions.reduce((maximum, item) => Math.max(maximum, Number(item.payload.runId)), 0)
}
