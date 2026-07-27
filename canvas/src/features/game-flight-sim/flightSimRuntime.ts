import {
  acquireDurableChatStreamTransportSuspension,
} from '@/features/chat/floatingPanelChat/floatingPanelChatDurableStream'
import { activateXrSceneSurface, registerXrSceneGameplayExitHandler } from '@/features/three/xrSceneSurfaceRuntime'
import type { WorkspaceFs } from '@/features/workspace-fs/types'
import { acquireWorkspaceSeedSyncSuspension } from '@/lib/workspace/workspaceSeedSyncRuntime'
import {
  preloadFlightSimMissionStage,
  resetFlightSimMissionStageLoaderForTests,
} from '@/lib/three/flightSimMissionStageLoader'
import { readFlightSimDefaultAssetLoadReport } from './assetSpec/flightSimDefaultAssets'
import {
  loadFlightSimSavedDecisions, persistPendingFlightSimDecisions,
  queueFlightSimDecisions, readFlightSimDecisionStore,
  reportFlightSimDecisionLoadFailure, resetFlightSimLocalSave,
  type FlightSimDecisionStoreSnapshot,
} from './flightSimDecisionStore'
import {
  readFlightSimWebglAdmission,
  startFlightSimWithReadyFrame,
} from './flightSimDeadlineIntegration'
import { resetFlightSimDeadlineRuntimeForTests } from './flightSimDeadlineRuntime'
import {
  beginFlightSimHydration, cancelFlightSimHydration,
  finishFlightSimHydration, readFlightSimHydrationPending,
} from './flightSimHydrationGate'
import {
  FLIGHT_SIM_FIXED_STEP_SECONDS,
  type FlightSimInputPatch, type FlightSimSnapshot, type FlightSimSpatialProfile,
} from './flightSimModel'
import { createFlightSimRuntime } from './flightSimRuntimeCore'
import { flightSimRuntimeErrorMessage } from './flightSimRuntimeState'
import { readFlightSimXrSpatialProfile } from './flightSimSpatialProfile'
import type { FlightSimStageRuntimeController } from './flightSimStageRuntimeController'
import {
  beginFlightSimStagePreparation,
  cancelFlightSimStagePreparation,
  cancelCurrentFlightSimStagePreparation,
  resetFlightSimStagePreparationForTests,
  waitForFlightSimStagePreparation,
} from './flightSimStagePreparationRuntime'
import {
  createFlightSimSurfaceOpenController,
  FlightSimSurfaceOpenStaleError,
  invalidateFlightSimSurfaceOpens,
  isFlightSimSurfaceOpenCurrent,
  readFlightSimSurfaceLifecycleGeneration,
  settleFlightSimSurfaceOpenController,
  throwIfFlightSimSurfaceOpenStale,
} from './flightSimSurfaceOpenLifecycle'
import {
  captureFlightSimAuthoredRuntimeOwnership, captureFlightSimPreviousCanvasSurface,
  restoreFlightSimAuthoredRuntime, restoreFlightSimPreviousCanvasSurface,
  suspendFlightSimAuthoredRuntime, type FlightSimAuthoredRuntimeOwnership,
  type FlightSimPreviousCanvasSurface,
} from './flightSimSurfaceOwnershipRuntime'
import {
  clearFlightSimSurfaceOwnershipFailure, reportFlightSimSurfaceEntryFailure,
  reportFlightSimSurfaceRestorationFailure,
  resetFlightSimSurfaceOwnershipStatusForTests,
} from './flightSimSurfaceOwnershipStatus'

export { createFlightSimRuntime } from './flightSimRuntimeCore'
export type { FlightSimRuntime } from './flightSimRuntimeState'

type Listener = () => void
type FlightSimOperationOptions = Readonly<{
  workspace?: WorkspaceFs
  signal?: AbortSignal
}>
type FlightSimSurfaceOpenOptions = FlightSimOperationOptions & Readonly<{
  openPanel?: boolean
  webglSupported?: boolean
}>

let defaultRuntime = createFlightSimRuntime({
  profile: readFlightSimXrSpatialProfile(),
  active: false,
  webglSupported: false,
})
let previousCanvasSurface: FlightSimPreviousCanvasSurface | null = null
let authoredRuntimeOwnership: FlightSimAuthoredRuntimeOwnership | null = null
let flightSimSurfaceOpenTail: Promise<void> | null = null
let releaseFlightSimDurableChatStreamTransportSuspension: (() => void) | null = null
let releaseFlightSimWorkspaceSeedSyncSuspension: (() => void) | null = null

function throwIfFlightSimOperationAborted(signal?: AbortSignal): void {
  if (!signal?.aborted) return
  throw signal.reason instanceof Error
    ? signal.reason
    : new Error('Flight Sim operation was aborted')
}

function hasFlightSimBrowserPresentationRuntime(): boolean {
  return typeof window !== 'undefined'
    && typeof document !== 'undefined'
    && typeof window.requestAnimationFrame === 'function'
}

function admitDefaultAssets(): void {
  const { report } = readFlightSimDefaultAssetLoadReport()
  if (
    report.errors.length !== 0
    || report.loaded.length !== 2
    || report.glbFallbackCount !== 1
    || report.requiredAircraftGlbFallbackCount !== 0
  ) {
    throw new Error('Flight Sim default asset admission returned a non-canonical catalog')
  }
}

function suspendAuthoredRuntime(): void {
  if (!authoredRuntimeOwnership) {
    authoredRuntimeOwnership = captureFlightSimAuthoredRuntimeOwnership()
  }
  suspendFlightSimAuthoredRuntime()
}

function restoreAuthoredRuntime(): void {
  const ownership = authoredRuntimeOwnership
  authoredRuntimeOwnership = null
  restoreFlightSimAuthoredRuntime(ownership)
}

export function readFlightSimSnapshot(): FlightSimSnapshot {
  return defaultRuntime.read()
}

export function readFlightSimSpatialProfile(): FlightSimSpatialProfile {
  return defaultRuntime.profile()
}

export function subscribeFlightSimSnapshot(listener: Listener): () => void {
  return defaultRuntime.subscribe(listener)
}

export function isFlightSimHydrationPending(): boolean {
  return readFlightSimHydrationPending()
}

const flightSimStageRuntimeController: FlightSimStageRuntimeController =
  Object.freeze({
    advanceByFixedStep: () => advanceFlightSimByFixedStep(),
    isHydrationPending: () => isFlightSimHydrationPending(),
    readSnapshot: () => readFlightSimSnapshot(),
    readSpatialProfile: () => readFlightSimSpatialProfile(),
    reportRenderFailure: error => reportFlightSimRenderFailure(error),
    setInput: patch => setFlightSimInput(patch),
    stop: () => stopFlightSim(),
    subscribe: listener => subscribeFlightSimSnapshot(listener),
  })

export function readFlightSimStageRuntimeController(): FlightSimStageRuntimeController {
  return flightSimStageRuntimeController
}

function restoreSurfaceOwnership(
  previous: FlightSimPreviousCanvasSurface | null,
  restorePreviousSurface: boolean,
): string[] {
  const failures: string[] = []
  try {
    restoreAuthoredRuntime()
  } catch (error) {
    failures.push(flightSimRuntimeErrorMessage(error))
  }
  if (restorePreviousSurface && previous) {
    try {
      restoreFlightSimPreviousCanvasSurface(previous)
    } catch (error) {
      failures.push(flightSimRuntimeErrorMessage(error))
    }
  }
  return failures
}

function restoreWorkspaceSeedSyncOwnership(): void {
  const release = releaseFlightSimWorkspaceSeedSyncSuspension
  releaseFlightSimWorkspaceSeedSyncSuspension = null
  release?.()
}

function restoreDurableChatStreamTransportOwnership(): void {
  const release = releaseFlightSimDurableChatStreamTransportSuspension
  releaseFlightSimDurableChatStreamTransportSuspension = null
  release?.()
}

function failFlightSimSurfaceEntry(
  error: unknown,
  entering: boolean,
  surfaceActivated: boolean,
): FlightSimSnapshot {
  const failures = [flightSimRuntimeErrorMessage(error)]
  if (entering) {
    defaultRuntime.exit()
    if (surfaceActivated) {
      failures.push(...restoreSurfaceOwnership(previousCanvasSurface, true))
    }
    restoreDurableChatStreamTransportOwnership()
    restoreWorkspaceSeedSyncOwnership()
    previousCanvasSurface = null
  }
  const message = `Flight Sim surface entry did not complete: ${failures.join('; ')}`
  reportFlightSimSurfaceEntryFailure(message)
  return defaultRuntime.fail(message)
}

function abortFlightSimSurfaceEntry(
  hydrationFinished: boolean,
  hydrationToken: number,
  entering: boolean,
  surfaceActivated: boolean,
): FlightSimSnapshot {
  if (!hydrationFinished) finishFlightSimHydration(hydrationToken)
  cancelFlightSimHydration()
  const restorationFailures: string[] = []
  if (entering) {
    defaultRuntime.exit()
    if (surfaceActivated) {
      restorationFailures.push(
        ...restoreSurfaceOwnership(previousCanvasSurface, true),
      )
    }
    restoreDurableChatStreamTransportOwnership()
    restoreWorkspaceSeedSyncOwnership()
    previousCanvasSurface = null
  }
  if (restorationFailures.length > 0) {
    const message = (
      'Flight Sim surface restoration did not complete after aborted entry: '
      + restorationFailures.join('; ')
    )
    reportFlightSimSurfaceRestorationFailure(message)
    return defaultRuntime.fail(message)
  }
  return defaultRuntime.read()
}

async function performFlightSimSurfaceOpen(
  options: FlightSimSurfaceOpenOptions,
  expectedGeneration: number,
): Promise<FlightSimSnapshot> {
  if (!isFlightSimSurfaceOpenCurrent(expectedGeneration)) {
    return defaultRuntime.read()
  }
  throwIfFlightSimOperationAborted(options.signal)
  const hydrationToken = beginFlightSimHydration()
  const entering = !defaultRuntime.read().active
  if (entering) previousCanvasSurface = captureFlightSimPreviousCanvasSurface()
  clearFlightSimSurfaceOwnershipFailure()
  let hydrationFinished = false
  let surfaceActivated = false
  let locallyAcquiredSeedSyncRelease: (() => void) | null = null
  let stagePreparationRequestId: number | null = null
  try {
    const webglAdmission = readFlightSimWebglAdmission(options.webglSupported)
    if (!webglAdmission.available) {
      hydrationFinished = true
      finishFlightSimHydration(hydrationToken)
      return failFlightSimSurfaceEntry(
        webglAdmission.failureReason || 'WebGL is unavailable.',
        entering,
        false,
      )
    }
    if (
      entering
      && !releaseFlightSimDurableChatStreamTransportSuspension
    ) {
      releaseFlightSimDurableChatStreamTransportSuspension =
        acquireDurableChatStreamTransportSuspension()
    }
    admitDefaultAssets()
    const [decisions] = await Promise.all([
      loadFlightSimSavedDecisions(options),
      preloadFlightSimMissionStage(flightSimStageRuntimeController),
    ])
    throwIfFlightSimSurfaceOpenStale(expectedGeneration)
    throwIfFlightSimOperationAborted(options.signal)
    hydrationFinished = true
    if (!finishFlightSimHydration(hydrationToken)) return defaultRuntime.read()
    if (readFlightSimDecisionStore().hydrationBlocked) {
      return failFlightSimSurfaceEntry(
        readFlightSimDecisionStore().error
        || 'Flight Sim Decisions remain blocked until Reset local save succeeds.',
        entering,
        false,
      )
    }
    defaultRuntime.setProfile(readFlightSimXrSpatialProfile())
    throwIfFlightSimSurfaceOpenStale(expectedGeneration)
    const hydrated = defaultRuntime.hydrate(decisions)
    throwIfFlightSimSurfaceOpenStale(expectedGeneration)
    if (hydrated.runtimeError) {
      return failFlightSimSurfaceEntry(
        reportFlightSimDecisionLoadFailure(hydrated.runtimeError).error,
        entering,
        false,
      )
    }
    throwIfFlightSimOperationAborted(options.signal)
    if (entering && !releaseFlightSimWorkspaceSeedSyncSuspension) {
      locallyAcquiredSeedSyncRelease =
        await acquireWorkspaceSeedSyncSuspension(options.signal)
      throwIfFlightSimSurfaceOpenStale(expectedGeneration)
      throwIfFlightSimOperationAborted(options.signal)
      releaseFlightSimWorkspaceSeedSyncSuspension =
        locallyAcquiredSeedSyncRelease
      locallyAcquiredSeedSyncRelease = null
    }
    throwIfFlightSimSurfaceOpenStale(expectedGeneration)
    throwIfFlightSimOperationAborted(options.signal)
    surfaceActivated = activateXrSceneSurface({
      gameplaySurface: 'flightSim',
      ...(options.openPanel === false
        ? {}
        : { panelView: 'flightSim', openPanel: true }),
    })
    if (!surfaceActivated) {
      return failFlightSimSurfaceEntry('The shared XR Canvas is unavailable.', entering, false)
    }
    throwIfFlightSimSurfaceOpenStale(expectedGeneration)
    throwIfFlightSimOperationAborted(options.signal)
    suspendAuthoredRuntime()
    throwIfFlightSimSurfaceOpenStale(expectedGeneration)
    throwIfFlightSimOperationAborted(options.signal)
    if (hasFlightSimBrowserPresentationRuntime()) {
      stagePreparationRequestId = beginFlightSimStagePreparation()
    }
    const opened = defaultRuntime.open(true)
    throwIfFlightSimSurfaceOpenStale(expectedGeneration)
    if (stagePreparationRequestId !== null) {
      await waitForFlightSimStagePreparation(stagePreparationRequestId, {
        signal: options.signal,
      })
      throwIfFlightSimSurfaceOpenStale(expectedGeneration)
      throwIfFlightSimOperationAborted(options.signal)
    }
    return opened
  } catch (error) {
    if (
      !isFlightSimSurfaceOpenCurrent(expectedGeneration)
      || error instanceof FlightSimSurfaceOpenStaleError
    ) {
      return defaultRuntime.read()
    }
    if (options.signal?.aborted) {
      return abortFlightSimSurfaceEntry(
        hydrationFinished,
        hydrationToken,
        entering,
        surfaceActivated,
      )
    }
    if (!hydrationFinished && !finishFlightSimHydration(hydrationToken)) {
      return defaultRuntime.read()
    }
    const localError = readFlightSimDecisionStore().error || error
    return failFlightSimSurfaceEntry(localError, entering, surfaceActivated)
  } finally {
    if (stagePreparationRequestId !== null) {
      cancelFlightSimStagePreparation(stagePreparationRequestId)
    }
    locallyAcquiredSeedSyncRelease?.()
  }
}

export function openFlightSimSurface(
  options: FlightSimSurfaceOpenOptions = {},
): Promise<FlightSimSnapshot> {
  const expectedGeneration = readFlightSimSurfaceLifecycleGeneration()
  const openController = createFlightSimSurfaceOpenController(options.signal)
  const operationOptions = {
    ...options,
    signal: openController.controller.signal,
  }
  const opening = flightSimSurfaceOpenTail
    ? flightSimSurfaceOpenTail.then(() => (
        performFlightSimSurfaceOpen(operationOptions, expectedGeneration)
      ))
    : performFlightSimSurfaceOpen(operationOptions, expectedGeneration)
  const tail = opening.then(() => undefined, () => undefined)
  flightSimSurfaceOpenTail = tail
  void tail.then(() => {
    settleFlightSimSurfaceOpenController(openController)
    if (flightSimSurfaceOpenTail === tail) flightSimSurfaceOpenTail = null
  })
  return opening
}

export function startFlightSim(): FlightSimSnapshot
export function startFlightSim(options: FlightSimSurfaceOpenOptions): Promise<FlightSimSnapshot>
export function startFlightSim(
  options?: FlightSimSurfaceOpenOptions,
): FlightSimSnapshot | Promise<FlightSimSnapshot> {
  if (options) return openFlightSimSurface(options).then(opened => (
    opened.active && opened.webglSupported && !opened.runtimeError
      ? startFlightSim()
      : opened
  ))
  if (readFlightSimHydrationPending()) {
    return defaultRuntime.fail('Flight Sim Decisions are still loading; wait before starting.')
  }
  if (readFlightSimDecisionStore().hydrationBlocked) {
    return defaultRuntime.fail(
      readFlightSimDecisionStore().error
      || 'Flight Sim Decisions are unreadable; reset the local save before starting.',
    )
  }
  return startFlightSimWithReadyFrame(() => defaultRuntime.start())
}

export function stopFlightSim(): FlightSimSnapshot {
  return defaultRuntime.stop()
}

export function restartFlightSim(): FlightSimSnapshot {
  if (readFlightSimHydrationPending()) {
    return defaultRuntime.fail('Flight Sim Decisions are still loading; wait before restarting.')
  }
  if (readFlightSimDecisionStore().hydrationBlocked) {
    return defaultRuntime.fail(
      readFlightSimDecisionStore().error
      || 'Flight Sim Decisions are unreadable; reset the local save before restarting.',
    )
  }
  return defaultRuntime.restart()
}

export function setFlightSimInput(patch: FlightSimInputPatch): FlightSimSnapshot {
  return defaultRuntime.setInput(patch)
}

export function queueFlightSimInput(patch: FlightSimInputPatch): FlightSimSnapshot {
  return defaultRuntime.queueInput(patch)
}

export function setFlightSimThrottle(value: number): FlightSimSnapshot {
  return defaultRuntime.setThrottle(value)
}

export function advanceFlightSimBy(deltaSeconds: number): Promise<FlightSimSnapshot> {
  return defaultRuntime.advanceBy(deltaSeconds)
}

export function advanceFlightSimByFixedStep(): Promise<FlightSimSnapshot> {
  return advanceFlightSimBy(FLIGHT_SIM_FIXED_STEP_SECONDS)
}

export function rejectFlightSimGameplayNetworkAttempt(
  operation: string,
  executor: () => unknown,
): FlightSimSnapshot {
  return defaultRuntime.rejectGameplayNetworkAttempt(operation, executor)
}

export function reportFlightSimRenderFailure(error: unknown): FlightSimSnapshot {
  return defaultRuntime.fail(error)
}

export function acknowledgeFlightSimDecisions(ids: readonly string[]): FlightSimSnapshot {
  return defaultRuntime.acknowledgeDecisions(ids)
}

export async function persistFlightSimPendingDecisions(
  options: FlightSimOperationOptions = {},
): Promise<FlightSimDecisionStoreSnapshot> {
  throwIfFlightSimOperationAborted(options.signal)
  const decisions = [...defaultRuntime.read().pendingDecisions]
  if (decisions.length > 0) queueFlightSimDecisions(decisions)
  const saved = await persistPendingFlightSimDecisions(options)
  throwIfFlightSimOperationAborted(options.signal)
  if (saved.status === 'saved' && decisions.length > 0) {
    defaultRuntime.acknowledgeDecisions(decisions.map(item => item.decisionId))
  }
  return saved
}

export async function resetFlightSimLocalPersistence(
  options: FlightSimOperationOptions = {},
): Promise<FlightSimDecisionStoreSnapshot> {
  throwIfFlightSimOperationAborted(options.signal)
  const reset = await resetFlightSimLocalSave(options)
  throwIfFlightSimOperationAborted(options.signal)
  if (reset.status === 'saved') defaultRuntime.resetPersistence()
  return reset
}

export function exitFlightSimSurface(
  options: Readonly<{ restorePreviousSurface?: boolean }> = {},
): FlightSimSnapshot {
  invalidateFlightSimSurfaceOpens()
  cancelCurrentFlightSimStagePreparation(
    new FlightSimSurfaceOpenStaleError(),
  )
  cancelFlightSimHydration()
  const failures: string[] = []
  const previous = previousCanvasSurface
  previousCanvasSurface = null
  const next = defaultRuntime.exit()
  failures.push(
    ...restoreSurfaceOwnership(
      previous,
      options.restorePreviousSurface !== false,
    ),
  )
  restoreDurableChatStreamTransportOwnership()
  restoreWorkspaceSeedSyncOwnership()
  if (failures.length > 0) {
    const message = `Flight Sim surface restoration did not complete: ${failures.join('; ')}`
    reportFlightSimSurfaceRestorationFailure(message)
    return defaultRuntime.fail(message)
  }
  clearFlightSimSurfaceOwnershipFailure()
  return next
}

export const exitFlightSim = exitFlightSimSurface

registerXrSceneGameplayExitHandler('flightSim', () => {
  if (defaultRuntime.read().active || flightSimSurfaceOpenTail) {
    exitFlightSimSurface({ restorePreviousSurface: false })
  }
}, {
  preserveWhenPanelOnly: ['motionControl', 'camera'],
})

export function resetFlightSimRuntimeForTests(
  profile: FlightSimSpatialProfile = readFlightSimXrSpatialProfile(),
): FlightSimSnapshot {
  invalidateFlightSimSurfaceOpens()
  cancelFlightSimHydration()
  flightSimSurfaceOpenTail = null
  previousCanvasSurface = null
  restoreAuthoredRuntime()
  restoreDurableChatStreamTransportOwnership()
  restoreWorkspaceSeedSyncOwnership()
  resetFlightSimSurfaceOwnershipStatusForTests()
  resetFlightSimDeadlineRuntimeForTests()
  resetFlightSimStagePreparationForTests()
  resetFlightSimMissionStageLoaderForTests()
  defaultRuntime = createFlightSimRuntime({ profile, active: false, webglSupported: false })
  return defaultRuntime.read()
}
