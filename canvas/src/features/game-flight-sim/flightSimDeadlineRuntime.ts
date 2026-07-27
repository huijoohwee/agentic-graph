export const FLIGHT_SIM_GAMEPLAY_NETWORK_BLOCK_LIMIT_MS = 1_000
export const FLIGHT_SIM_HUD_UPDATE_LIMIT_MS = 100
export const FLIGHT_SIM_READY_FRAME_LIMIT_MS = 100
export const FLIGHT_SIM_WEBGL_ADMISSION_LIMIT_MS = 100

type MonotonicNow = () => number

export type FlightSimDeadlineObservation = Readonly<{
  startedAtMs: number
  completedAtMs: number
  elapsedMs: number
  limitMs: number
  withinLimit: boolean
  synchronous: boolean
  source: string
  operation?: string
  available?: boolean
  revision?: number
  runId?: number
  tick?: number
}>

export type FlightSimDeadlineSnapshot = Readonly<{
  webglAdmission: FlightSimDeadlineObservation | null
  readyFrame: FlightSimDeadlineObservation | null
  hudUpdate: FlightSimDeadlineObservation | null
  gameplayNetworkBlock: FlightSimDeadlineObservation | null
}>

type ReadyFrameRequest = Readonly<{
  requestId: number
  startedAtMs: number
  runId: number | null
  tick: number | null
}>

const pendingHudUpdates = new Map<number, number>()
let mountedHudOwnerCount = 0
let readyFrameRequestSequence = 0
let pendingReadyFrame: ReadyFrameRequest | null = null
let deadlineSnapshot: FlightSimDeadlineSnapshot = Object.freeze({
  webglAdmission: null,
  readyFrame: null,
  hudUpdate: null,
  gameplayNetworkBlock: null,
})

function monotonicNow(): number {
  return typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now()
}

function elapsedObservation(args: Readonly<{
  startedAtMs: number
  completedAtMs: number
  limitMs: number
  source: string
  synchronous: boolean
  operation?: string
  available?: boolean
  revision?: number
  runId?: number
  tick?: number
}>): FlightSimDeadlineObservation {
  const elapsedMs = Math.max(0, args.completedAtMs - args.startedAtMs)
  return Object.freeze({
    ...args,
    elapsedMs,
    withinLimit: elapsedMs <= args.limitMs,
  })
}

function publishDeadline(
  key: keyof FlightSimDeadlineSnapshot,
  observation: FlightSimDeadlineObservation,
): FlightSimDeadlineObservation {
  deadlineSnapshot = Object.freeze({
    ...deadlineSnapshot,
    [key]: observation,
  })
  return observation
}

function publishHudDeadline(
  observation: FlightSimDeadlineObservation,
): FlightSimDeadlineObservation {
  const recorded = deadlineSnapshot.hudUpdate
  if (recorded && !recorded.withinLimit && observation.withinLimit) {
    return recorded
  }
  return publishDeadline('hudUpdate', observation)
}

export function readFlightSimDeadlineSnapshot(): FlightSimDeadlineSnapshot {
  return deadlineSnapshot
}

export function measureFlightSimWebglAdmission(
  probe: () => boolean,
  now: MonotonicNow = monotonicNow,
): Readonly<{
  available: boolean
  observation: FlightSimDeadlineObservation
}> {
  const startedAtMs = now()
  const result = probe()
  if (typeof result !== 'boolean') {
    throw new Error('Flight Sim WebGL admission must resolve synchronously to a boolean')
  }
  const completedAtMs = now()
  const observation = publishDeadline('webglAdmission', elapsedObservation({
    startedAtMs,
    completedAtMs,
    limitMs: FLIGHT_SIM_WEBGL_ADMISSION_LIMIT_MS,
    source: 'browser-webgl-probe',
    synchronous: true,
    available: result,
  }))
  return Object.freeze({
    available: result && observation.withinLimit,
    observation,
  })
}

export function beginFlightSimReadyFrame(
  now: MonotonicNow = monotonicNow,
): number {
  readyFrameRequestSequence += 1
  pendingReadyFrame = Object.freeze({
    requestId: readyFrameRequestSequence,
    startedAtMs: now(),
    runId: null,
    tick: null,
  })
  return readyFrameRequestSequence
}

export function armFlightSimReadyFrame(
  requestId: number,
  runId: number,
  tick: number,
): void {
  if (!pendingReadyFrame || pendingReadyFrame.requestId !== requestId) return
  pendingReadyFrame = Object.freeze({
    ...pendingReadyFrame,
    runId,
    tick,
  })
}

export function cancelFlightSimReadyFrame(requestId: number): void {
  if (pendingReadyFrame?.requestId === requestId) pendingReadyFrame = null
}

export function completeFlightSimReadyFrame(
  runId: number,
  tick: number,
  now: MonotonicNow = monotonicNow,
): FlightSimDeadlineObservation | null {
  const pending = pendingReadyFrame
  if (!pending || pending.runId !== runId || pending.tick !== tick) return null
  pendingReadyFrame = null
  return publishDeadline('readyFrame', elapsedObservation({
    startedAtMs: pending.startedAtMs,
    completedAtMs: now(),
    limitMs: FLIGHT_SIM_READY_FRAME_LIMIT_MS,
    source: 'shared-flight-surface-ready-frame',
    synchronous: false,
    runId,
    tick,
  }))
}

export function beginFlightSimHudUpdate(
  revision: number,
  now: MonotonicNow = monotonicNow,
): void {
  if (!pendingHudUpdates.has(revision)) pendingHudUpdates.set(revision, now())
}

export function registerFlightSimHudDeadlineOwner(
  mountedRevision: number,
): () => void {
  mountedHudOwnerCount += 1
  for (const revision of pendingHudUpdates.keys()) {
    if (revision <= mountedRevision) pendingHudUpdates.delete(revision)
  }
  let released = false
  return () => {
    if (released) return
    released = true
    mountedHudOwnerCount = Math.max(0, mountedHudOwnerCount - 1)
    if (mountedHudOwnerCount === 0) pendingHudUpdates.clear()
  }
}

export function completeFlightSimHudUpdate(
  revision: number,
  now: MonotonicNow = monotonicNow,
): FlightSimDeadlineObservation | null {
  if (!pendingHudUpdates.has(revision)) return null
  const completedAtMs = now()
  const completed: FlightSimDeadlineObservation[] = []
  for (const [pendingRevision, startedAtMs] of pendingHudUpdates) {
    if (pendingRevision > revision) continue
    pendingHudUpdates.delete(pendingRevision)
    completed.push(elapsedObservation({
      startedAtMs,
      completedAtMs,
      limitMs: FLIGHT_SIM_HUD_UPDATE_LIMIT_MS,
      source: 'runtime-publish-to-hud-layout',
      synchronous: false,
      revision: pendingRevision,
    }))
  }
  const observation = completed.find(candidate => !candidate.withinLimit)
    || completed.find(candidate => candidate.revision === revision)
  return observation ? publishHudDeadline(observation) : null
}

export function measureFlightSimGameplayNetworkBlock(
  operation: string,
  block: () => never,
  now: MonotonicNow = monotonicNow,
): never {
  const startedAtMs = now()
  try {
    return block()
  } finally {
    publishDeadline('gameplayNetworkBlock', elapsedObservation({
      startedAtMs,
      completedAtMs: now(),
      limitMs: FLIGHT_SIM_GAMEPLAY_NETWORK_BLOCK_LIMIT_MS,
      source: 'flight-runtime-network-guard',
      synchronous: true,
      operation,
    }))
  }
}

export function resetFlightSimDeadlineRuntimeForTests(): void {
  pendingHudUpdates.clear()
  mountedHudOwnerCount = 0
  readyFrameRequestSequence = 0
  pendingReadyFrame = null
  deadlineSnapshot = Object.freeze({
    webglAdmission: null,
    readyFrame: null,
    hudUpdate: null,
    gameplayNetworkBlock: null,
  })
}
