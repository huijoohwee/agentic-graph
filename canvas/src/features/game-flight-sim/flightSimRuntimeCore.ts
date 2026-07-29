import {
  captureFlightSimMission, cloneFlightSimMission, createFlightSimMission,
  disposeFlightSimMission, tickFlightSimMission,
  type FlightSimMission, type FlightSimMissionCapture,
} from './flightSimMission'
import { validateFlightSimMissionDecisions } from './flightSimDecisionAdmission'
import {
  FLIGHT_SIM_FIXED_STEP_SECONDS, FLIGHT_SIM_MAX_CATCH_UP_TICKS,
  FLIGHT_SIM_MAX_PERSISTED_RUN_ID, FLIGHT_SIM_NEUTRAL_INPUT, FLIGHT_SIM_ZERO_COST_LOG,
  isFlightSimInputNeutral, stageFlightSimInputPatch,
  type FlightSimCostLog, type FlightSimDecisionRecord, type FlightSimInputPatch,
  type FlightSimPhase, type FlightSimSnapshot, type FlightSimSpatialProfile,
  type FlightSimTickInput,
} from './flightSimModel'
import { mergeFlightSimInputs } from './flightSimInput'
import { createFlightSimPendingDecisionIndex } from './flightSimPendingDecisions'
import {
  boundedFlightSimDeltaSeconds, createIdleFlightSimSnapshot,
  flightSimRuntimeErrorMessage, freezeFlightSimDecision,
  maximumFlightSimDecisionRunId,
  type FlightSimAdvanceRequest, type FlightSimPresenterKind,
  type FlightSimReadyPublication, type FlightSimRuntime,
} from './flightSimRuntimeState'
import { beginFlightSimHudUpdate } from './flightSimDeadlineRuntime'
import { rejectFlightSimGameplayNetworkAttemptWithinDeadline } from './flightSimDeadlineIntegration'
import { applyFlightSimTrainingTickModifiers } from './flightSimTrainingScenario'

type Listener = () => void

function mergedInput(
  left: FlightSimTickInput,
  right: FlightSimInputPatch,
): FlightSimTickInput {
  return mergeFlightSimInputs([left, right])
}

export function createFlightSimRuntime(options: Readonly<{
  profile: FlightSimSpatialProfile
  active?: boolean
  webglSupported?: boolean
  onMissionCreated?: (mission: FlightSimMission) => void
  coordinateReadyPublication?: (
    publication: FlightSimReadyPublication,
  ) => boolean
  cancelReadyPublication?: () => void
}>): FlightSimRuntime {
  const listeners = new Set<Listener>()
  const hudListeners = new Set<Listener>()
  const presenterListeners: Record<FlightSimPresenterKind, Set<Listener>> = {
    maplibre: new Set<Listener>(),
    surface: new Set<Listener>(),
  }
  const pendingDecisions = createFlightSimPendingDecisionIndex(freezeFlightSimDecision)
  let profile = options.profile
  let mission: FlightSimMission | null = null
  let runId = 0
  let generation = 0
  let accumulatorSeconds = 0
  let input = FLIGHT_SIM_NEUTRAL_INPUT
  let pendingInput = FLIGHT_SIM_NEUTRAL_INPUT
  let throttleTarget: number | null = null
  let missionArmed = false
  let hydratedDecisions: readonly FlightSimDecisionRecord[] = Object.freeze([])
  let resumePhase: Exclude<FlightSimPhase, 'stopped'> = 'ready'
  let tickQueue: Promise<void> = Promise.resolve()
  let snapshot = createIdleFlightSimSnapshot(
    profile,
    options.active ?? true,
    options.webglSupported ?? true,
  )
  const notifyListeners = (
    targets: Set<Listener>,
    publishedRevision: number,
    failures?: unknown[],
  ) => {
    for (const listener of [...targets]) {
      if (snapshot.revision !== publishedRevision) return
      try {
        listener()
      } catch (error) {
        if (!failures) throw error
        failures.push(error)
      }
    }
  }
  const notifyPublishedSnapshot = (publishedRevision: number) => {
    const notifyPresenter = (kind: FlightSimPresenterKind) => {
      notifyListeners(presenterListeners[kind], publishedRevision)
    }
    const notifyFollowers = (presenter: FlightSimPresenterKind) => {
      const failures: unknown[] = []
      notifyListeners(
        presenterListeners[presenter === 'maplibre' ? 'surface' : 'maplibre'],
        publishedRevision,
        failures,
      )
      notifyListeners(listeners, publishedRevision, failures)
      if (failures.length > 0) {
        throw new AggregateError(
          failures,
          'Flight Sim ready follower publication failed',
        )
      }
    }
    const readyCandidate = snapshot.phase === 'ready'
      && snapshot.tick === 0
      && snapshot.runId > 0
      && !snapshot.runtimeError
    if (readyCandidate && options.coordinateReadyPublication?.({
      snapshot,
      hasPresenter: kind => presenterListeners[kind].size > 0,
      notifyPresenter,
      notifyFollowers,
    })) {
      notifyListeners(hudListeners, publishedRevision)
      return
    }
    if (!readyCandidate) options.cancelReadyPublication?.()
    notifyPresenter('maplibre')
    notifyPresenter('surface')
    notifyListeners(hudListeners, publishedRevision)
    notifyListeners(listeners, publishedRevision)
  }
  const publish = (
    update: Partial<Omit<FlightSimSnapshot, 'revision'>>,
  ): FlightSimSnapshot => {
    beginFlightSimHudUpdate(snapshot.revision + 1)
    snapshot = Object.freeze({ ...snapshot, ...update, revision: snapshot.revision + 1 })
    notifyPublishedSnapshot(snapshot.revision)
    return snapshot
  }
  const publishCapture = (
    capture: FlightSimMissionCapture,
    costLog: FlightSimCostLog,
    phase: FlightSimPhase = capture.phase,
    runtimeError: string | null = snapshot.runtimeError,
  ) => publish({
    ...capture,
    active: snapshot.active,
    webglSupported: snapshot.webglSupported,
    phase,
    runId,
    pendingDecisions: pendingDecisions.values(),
    lastCostLog: costLog,
    runtimeError,
  })
  const resetMission = (active = snapshot.active) => {
    const discardedMission = mission
    mission = null
    if (discardedMission) disposeFlightSimMission(discardedMission)
    pendingDecisions.clear()
    hydratedDecisions = Object.freeze([])
    runId = 0
    generation += 1
    accumulatorSeconds = 0
    input = FLIGHT_SIM_NEUTRAL_INPUT
    pendingInput = FLIGHT_SIM_NEUTRAL_INPUT
    throttleTarget = null
    missionArmed = false
    resumePhase = 'ready'
    snapshot = Object.freeze({
      ...createIdleFlightSimSnapshot(profile, active, snapshot.webglSupported),
      revision: snapshot.revision + 1,
    })
    notifyPublishedSnapshot(snapshot.revision)
    return snapshot
  }
  const replaceMission = (replayHydratedDecisions = false) => {
    const continuesHydratedRun = replayHydratedDecisions && hydratedDecisions.length > 0
    if (!continuesHydratedRun && runId >= FLIGHT_SIM_MAX_PERSISTED_RUN_ID) return publish({
      phase: 'stopped',
      runtimeError: 'Flight Sim exhausted its bounded run range; reset the local save.',
    })
    const nextRunId = continuesHydratedRun ? runId : runId + 1
    const previousMission = mission
    const nextMission = createFlightSimMission({
      runId: nextRunId,
      profile,
      decisions: replayHydratedDecisions ? hydratedDecisions : [],
    })
    try {
      options.onMissionCreated?.(nextMission)
    } catch (error) {
      disposeFlightSimMission(nextMission)
      throw error
    }
    generation += 1
    runId = nextRunId
    mission = nextMission
    if (previousMission) disposeFlightSimMission(previousMission)
    hydratedDecisions = Object.freeze([])
    accumulatorSeconds = 0
    input = FLIGHT_SIM_NEUTRAL_INPUT
    pendingInput = FLIGHT_SIM_NEUTRAL_INPUT
    throttleTarget = null
    missionArmed = false
    const capture = captureFlightSimMission(nextMission)
    resumePhase = capture.phase
    return publishCapture(capture, FLIGHT_SIM_ZERO_COST_LOG, capture.phase, null)
  }
  const stageMissionInput = (value: FlightSimTickInput) => {
    if (!isFlightSimInputNeutral(value) && mission && snapshot.phase === 'ready') {
      missionArmed = true
    }
    return snapshot
  }
  const capturedInput = () => {
    const combined = mergedInput(input, pendingInput)
    pendingInput = FLIGHT_SIM_NEUTRAL_INPUT
    return applyFlightSimTrainingTickModifiers({
      flight: snapshot,
      input: combined,
      throttleSetpoint: throttleTarget,
    })
  }
  const advanceCurrentMission = async (
    request: FlightSimAdvanceRequest,
  ): Promise<FlightSimSnapshot> => {
    const canAdvance = snapshot.phase === 'flying'
      || (snapshot.phase === 'ready' && missionArmed)
    if (!mission || request.generation !== generation || !canAdvance || snapshot.runtimeError) {
      return snapshot
    }
    const activeMission = mission
    const workingMission = cloneFlightSimMission(activeMission)
    let adoptedWorkingMission = false
    const producedDecisions = new Map<string, FlightSimDecisionRecord>()
    let capture = captureFlightSimMission(workingMission)
    let costLog = snapshot.lastCostLog
    try {
      accumulatorSeconds += request.deltaSeconds
      let stepped = false
      let catchUpTicks = 0
      while (
        accumulatorSeconds + 1e-10 >= FLIGHT_SIM_FIXED_STEP_SECONDS
        && catchUpTicks < FLIGHT_SIM_MAX_CATCH_UP_TICKS
      ) {
        accumulatorSeconds = Math.max(0, accumulatorSeconds - FLIGHT_SIM_FIXED_STEP_SECONDS)
        catchUpTicks += 1
        const result = await tickFlightSimMission(
          workingMission,
          request.input,
          request.throttleSetpoint,
        )
        if (mission !== activeMission || generation !== request.generation) return snapshot
        stepped = true
        capture = result.capture
        costLog = result.costLog
        for (const item of result.decisions) producedDecisions.set(item.decisionId, item)
        if (capture.phase === 'completed' || capture.phase === 'crashed') {
          accumulatorSeconds = 0
          break
        }
      }
      if (!stepped || mission !== activeMission || generation !== request.generation) return snapshot
      mission = workingMission
      adoptedWorkingMission = true
      disposeFlightSimMission(activeMission)
      for (const item of producedDecisions.values()) pendingDecisions.retain(item)
      if (throttleTarget === request.throttleSetpoint) throttleTarget = null
      missionArmed = false
      resumePhase = capture.phase
      return publishCapture(capture, costLog)
    } catch (error) {
      if (mission === activeMission && generation === request.generation) {
        const failedCapture = captureFlightSimMission(workingMission)
        mission = workingMission
        adoptedWorkingMission = true
        disposeFlightSimMission(activeMission)
        for (const item of producedDecisions.values()) pendingDecisions.retain(item)
        if (throttleTarget === request.throttleSetpoint) throttleTarget = null
        missionArmed = false
        resumePhase = failedCapture.phase
        publishCapture(
          capture,
          costLog,
          capture.phase,
          flightSimRuntimeErrorMessage(error),
        )
      }
      throw error
    } finally {
      if (!adoptedWorkingMission) disposeFlightSimMission(workingMission)
    }
  }
  return Object.freeze({
    profile: () => profile,
    read: () => snapshot,
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    subscribeHud(listener) {
      hudListeners.add(listener)
      return () => hudListeners.delete(listener)
    },
    subscribePresenter(kind, listener) {
      presenterListeners[kind].add(listener)
      return () => presenterListeners[kind].delete(listener)
    },
    open(webglSupported = true) {
      return publish({
        active: true,
        webglSupported,
        runtimeError: webglSupported ? null : 'WebGL is unavailable; Flight Sim stayed stopped.',
      })
    },
    start() {
      if (!snapshot.active) return publish({ runtimeError: 'Open Flight Sim before starting.' })
      if (!snapshot.webglSupported) return publish({ phase: 'stopped', runtimeError: 'WebGL is unavailable; Flight Sim stayed stopped.' })
      if (!mission) return replaceMission(true)
      if (snapshot.runtimeError) return snapshot
      if (snapshot.phase !== 'stopped') return snapshot
      return publish({ phase: resumePhase })
    },
    stop() {
      if (!mission || snapshot.phase === 'stopped') return snapshot
      resumePhase = snapshot.phase
      generation += 1
      accumulatorSeconds = 0
      input = FLIGHT_SIM_NEUTRAL_INPUT
      pendingInput = FLIGHT_SIM_NEUTRAL_INPUT
      throttleTarget = null
      missionArmed = false
      return publish({ phase: 'stopped' })
    },
    restart() {
      if (!snapshot.active) return publish({ runtimeError: 'Open Flight Sim before restarting.' })
      if (!snapshot.webglSupported) return publish({ phase: 'stopped', runtimeError: 'WebGL is unavailable; Flight Sim stayed stopped.' })
      const priorPhase = snapshot.phase === 'stopped' ? resumePhase : snapshot.phase
      if (priorPhase === 'ready' || priorPhase === 'flying') pendingDecisions.discardRun(runId)
      return replaceMission()
    },
    exit() {
      return resetMission(false)
    },
    setProfile(nextProfile) {
      if (profile.sourceKey === nextProfile.sourceKey) return snapshot
      profile = nextProfile
      return resetMission()
    },
    setInput(patch) {
      input = stageFlightSimInputPatch(input, patch)
      if (patch.throttleDelta !== undefined && patch.throttleDelta !== 0) throttleTarget = null
      return stageMissionInput(input)
    },
    queueInput(patch) {
      pendingInput = mergedInput(pendingInput, patch)
      return stageMissionInput(pendingInput)
    },
    setThrottle(value) {
      const numeric = Number(value)
      if (!Number.isFinite(numeric) || numeric < 0 || numeric > 1) {
        throw new Error('Flight Sim throttle must be a finite number from 0 to 1')
      }
      if (snapshot.phase !== 'ready' && snapshot.phase !== 'flying') {
        return publish({ runtimeError: 'Flight Sim throttle requires a ready or flying mission.' })
      }
      throttleTarget = numeric
      return stageMissionInput(stageFlightSimInputPatch(FLIGHT_SIM_NEUTRAL_INPUT, {
        throttleDelta: Math.sign(numeric - snapshot.aircraft.throttle),
      }))
    },
    advanceBy(deltaSeconds) {
      const captured = capturedInput()
      const request = Object.freeze({
        deltaSeconds: boundedFlightSimDeltaSeconds(deltaSeconds),
        generation,
        input: captured.input,
        throttleSetpoint: captured.throttleSetpoint,
      })
      const queued = tickQueue.then(() => advanceCurrentMission(request))
      tickQueue = queued.then(() => undefined, () => undefined)
      return queued.catch(error => {
        if (request.generation === generation && !snapshot.runtimeError) {
          publish({ runtimeError: flightSimRuntimeErrorMessage(error) })
        }
        throw error
      })
    },
    acknowledgeDecisions(ids) {
      pendingDecisions.acknowledge(ids)
      return publish({ pendingDecisions: pendingDecisions.values() })
    },
    hydrate(values) {
      if (mission) return snapshot
      try {
        const decisions = validateFlightSimMissionDecisions(profile, values)
        hydratedDecisions = decisions
        runId = Math.max(runId, maximumFlightSimDecisionRunId(decisions))
        return publish({ runtimeError: null })
      } catch (error) {
        return publish({ phase: 'stopped', runtimeError: flightSimRuntimeErrorMessage(error) })
      }
    },
    resetPersistence: resetMission,
    rejectGameplayNetworkAttempt(operation, executor) {
      return rejectFlightSimGameplayNetworkAttemptWithinDeadline(
        mission, operation, executor, runtimeError => publish({ runtimeError }),
      )
    },
    fail(error) {
      return publish({ phase: 'stopped', runtimeError: flightSimRuntimeErrorMessage(error) })
    },
  })
}
