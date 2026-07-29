import type {
  FlightSimPresenterKind,
  FlightSimReadyPublication,
} from './flightSimRuntimeState'

export const FLIGHT_SIM_GAMEPLAY_NETWORK_BLOCK_LIMIT_MS = 1_000
export const FLIGHT_SIM_HUD_UPDATE_LIMIT_MS = 100
export const FLIGHT_SIM_READY_FRAME_LIMIT_MS = 100
export const FLIGHT_SIM_WEBGL_ADMISSION_LIMIT_MS = 100

type MonotonicNow = () => number
type ReadyFrameTimeoutScheduler = (
  expire: () => void,
  delayMs: number,
) => () => void

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
  presenter: FlightSimPresenterKind | null
  cancelTimeout: (() => void) | null
}>

const pendingHudUpdates = new Map<number, number>()
const pendingReadyFollowers = new Map<number, Set<() => void>>()
let mountedHudOwnerCount = 0
let readyPresenterClaimSequence = 0
let readyPresenterClaim: Readonly<{
  claimId: number
  presenter: FlightSimPresenterKind
}> | null = null
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

function scheduleReadyFrameTimeout(
  expire: () => void,
  delayMs: number,
): () => void {
  const timeout = setTimeout(expire, delayMs)
  if (typeof timeout === 'object' && 'unref' in timeout) timeout.unref()
  return () => clearTimeout(timeout)
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

function clearReadyFrameTimeout(request: ReadyFrameRequest): void {
  request.cancelTimeout?.()
}

function releaseFlightSimReadyFollowers(requestId: number): void {
  const followers = pendingReadyFollowers.get(requestId)
  if (!followers) return
  pendingReadyFollowers.delete(requestId)
  for (const notify of [...followers]) {
    try {
      notify()
    } catch (error) {
      console.error('Flight Sim ready follower failed after presenter completion', error)
    }
  }
}

function releaseFlightSimReadyFollowersAfterPresenter(requestId: number): void {
  const followers = pendingReadyFollowers.get(requestId)
  if (!followers) return
  queueMicrotask(() => {
    if (pendingReadyFollowers.get(requestId) !== followers) return
    releaseFlightSimReadyFollowers(requestId)
  })
}

function detachFlightSimReadyFrame(
  requestId: number,
): ReadyFrameRequest | null {
  const pending = pendingReadyFrame
  if (!pending || pending.requestId !== requestId) return null
  pendingReadyFrame = null
  clearReadyFrameTimeout(pending)
  return pending
}

function expireFlightSimReadyFrame(requestId: number): void {
  const pending = detachFlightSimReadyFrame(requestId)
  if (!pending) return
  publishDeadline('readyFrame', elapsedObservation({
    startedAtMs: pending.startedAtMs,
    completedAtMs: Math.max(
      monotonicNow(),
      pending.startedAtMs + FLIGHT_SIM_READY_FRAME_LIMIT_MS + 0.001,
    ),
    limitMs: FLIGHT_SIM_READY_FRAME_LIMIT_MS,
    source: 'ready-frame-deadline-timeout',
    synchronous: false,
    runId: pending.runId ?? undefined,
    tick: pending.tick ?? undefined,
  }))
  releaseFlightSimReadyFollowers(requestId)
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
  scheduleTimeout: ReadyFrameTimeoutScheduler = scheduleReadyFrameTimeout,
): number {
  const superseded = pendingReadyFrame
  if (superseded) {
    pendingReadyFrame = null
    clearReadyFrameTimeout(superseded)
  }
  while (pendingReadyFollowers.size > 0) {
    const requestIds = [...pendingReadyFollowers.keys()]
    for (const requestId of requestIds) {
      releaseFlightSimReadyFollowers(requestId)
    }
    if (pendingReadyFrame) return pendingReadyFrame.requestId
  }
  readyFrameRequestSequence += 1
  const requestId = readyFrameRequestSequence
  const startedAtMs = now()
  pendingReadyFrame = Object.freeze({
    requestId,
    startedAtMs,
    runId: null,
    tick: null,
    presenter: null,
    cancelTimeout: null,
  })
  let cancelTimeout: () => void
  try {
    cancelTimeout = scheduleTimeout(
      () => expireFlightSimReadyFrame(requestId),
      FLIGHT_SIM_READY_FRAME_LIMIT_MS,
    )
  } catch (error) {
    detachFlightSimReadyFrame(requestId)
    throw error
  }
  if (pendingReadyFrame?.requestId === requestId) {
    pendingReadyFrame = Object.freeze({
      ...pendingReadyFrame,
      cancelTimeout,
    })
  } else {
    cancelTimeout()
  }
  return requestId
}

export function claimFlightSimReadyPresenter(
  presenter: FlightSimPresenterKind,
): () => void {
  readyPresenterClaimSequence += 1
  const claimId = readyPresenterClaimSequence
  readyPresenterClaim = Object.freeze({ claimId, presenter })
  return () => {
    if (readyPresenterClaim?.claimId === claimId) readyPresenterClaim = null
  }
}

export function coordinateFlightSimReadyPublication(
  publication: FlightSimReadyPublication,
): boolean {
  const request = pendingReadyFrame
  const snapshot = publication.snapshot
  if (
    !request
    || snapshot.phase !== 'ready'
    || snapshot.runId <= 0
    || snapshot.tick !== 0
    || snapshot.runtimeError
  ) return false
  const presenter = request.presenter
    ?? readyPresenterClaim?.presenter
    ?? (publication.hasPresenter('maplibre')
      ? 'maplibre'
      : publication.hasPresenter('surface') ? 'surface' : null)
  if (!presenter) return false
  armFlightSimReadyFrame(
    request.requestId,
    snapshot.runId,
    snapshot.tick,
    presenter,
  )
  const followers = pendingReadyFollowers.get(request.requestId)
    ?? new Set<() => void>()
  followers.add(() => publication.notifyFollowers(presenter))
  pendingReadyFollowers.set(request.requestId, followers)
  if (!publication.hasPresenter(presenter)) return true
  try {
    publication.notifyPresenter(presenter)
  } catch (error) {
    cancelFlightSimReadyFrame(request.requestId)
    throw error
  }
  return true
}

export function armFlightSimReadyFrame(
  requestId: number,
  runId: number,
  tick: number,
  presenter?: FlightSimPresenterKind,
): void {
  if (!pendingReadyFrame || pendingReadyFrame.requestId !== requestId) return
  pendingReadyFrame = Object.freeze({
    ...pendingReadyFrame,
    runId,
    tick,
    presenter: pendingReadyFrame.presenter ?? presenter ?? null,
  })
}

export function cancelFlightSimReadyFrame(requestId: number): void {
  const pending = detachFlightSimReadyFrame(requestId)
  if (pending) releaseFlightSimReadyFollowers(requestId)
}

export function cancelCurrentFlightSimReadyFrame(): void {
  const requestId = pendingReadyFrame?.requestId
  if (requestId !== undefined) cancelFlightSimReadyFrame(requestId)
}

export function isFlightSimReadyFramePresentationPending(
  runId: number,
  tick: number,
): boolean {
  return (
    pendingReadyFrame?.runId === runId
    && pendingReadyFrame.tick === tick
  )
}

export function readCurrentFlightSimReadyFrameRequestId(): number | null {
  return pendingReadyFrame?.requestId ?? null
}

export function completeFlightSimReadyFrame(
  runId: number,
  tick: number,
  now: MonotonicNow = monotonicNow,
): FlightSimDeadlineObservation | null {
  return completeFlightSimReadyFrameFromPresenter(
    runId,
    tick,
    'shared-flight-surface-ready-frame',
    now,
  )
}

export function completeFlightSimMapLibreReadyFrame(
  requestId: number,
  runId: number,
  tick: number,
  now: MonotonicNow = monotonicNow,
): FlightSimDeadlineObservation | null {
  return completeFlightSimReadyFrameFromPresenter(
    runId,
    tick,
    'native-maplibre-flight-ready-frame',
    now,
    requestId,
  )
}

function completeFlightSimReadyFrameFromPresenter(
  runId: number,
  tick: number,
  source: 'shared-flight-surface-ready-frame' | 'native-maplibre-flight-ready-frame',
  now: MonotonicNow,
  requestId?: number,
): FlightSimDeadlineObservation | null {
  const pending = pendingReadyFrame
  const presenter: FlightSimPresenterKind =
    source === 'native-maplibre-flight-ready-frame'
      ? 'maplibre'
      : 'surface'
  if (
    !pending
    || (requestId !== undefined && pending.requestId !== requestId)
    || pending.runId !== runId
    || pending.tick !== tick
    || (pending.presenter !== null && pending.presenter !== presenter)
  ) return null
  detachFlightSimReadyFrame(pending.requestId)
  const observation = publishDeadline('readyFrame', elapsedObservation({
    startedAtMs: pending.startedAtMs,
    completedAtMs: now(),
    limitMs: FLIGHT_SIM_READY_FRAME_LIMIT_MS,
    source,
    synchronous: false,
    runId,
    tick,
  }))
  releaseFlightSimReadyFollowersAfterPresenter(pending.requestId)
  return observation
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
  const pending = pendingReadyFrame
  pendingReadyFrame = null
  if (pending) clearReadyFrameTimeout(pending)
  pendingReadyFollowers.clear()
  pendingHudUpdates.clear()
  mountedHudOwnerCount = 0
  readyPresenterClaimSequence = 0
  readyPresenterClaim = null
  readyFrameRequestSequence = 0
  deadlineSnapshot = Object.freeze({
    webglAdmission: null,
    readyFrame: null,
    hudUpdate: null,
    gameplayNetworkBlock: null,
  })
}
