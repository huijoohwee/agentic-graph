import { useGraphStore } from '@/hooks/useGraphStore'
import { readWebglSupport } from '@/lib/three/webglSupport'
import type { WorkspaceFs } from '@/features/workspace-fs/types'
import {
  hydrateCanonicalXrMotionReferenceRuntime,
  hydrateCanonicalXrPhysicsRuntime,
} from '@/features/three/XrMotionReferenceRuntimeBridge'
import {
  activateXrSceneSurface,
  deactivateXrSceneGameplayMode,
  isXrGameplaySurfaceView,
  registerXrSceneGameplayMode,
} from '@/features/three/xrSceneSurfaceRuntime'
import type { GameOsModeDeclaration } from 'grph-shared/game-os/index'
import {
  acknowledgeGameFpsDecisions,
  captureGameFpsAdvance,
  discardGameFpsTransientInput,
  hasGameFpsMission,
  publishRuntimeFailure,
  readGameFpsRunId,
  readGameFpsSpatialProfile,
  readGameFpsSnapshot,
  refreshGameFpsMissionSpatialProfile,
  restartGameFpsMission,
  startGameFpsMission,
  stopGameFpsMission,
} from './gameFpsRuntime'
import { gameFpsSpatialProfilesMatch, type GameFpsSpatialProfile } from './gameFpsModel'
import {
  loadGameFpsSavedDecisions,
  persistPendingGameFpsDecisions,
  queueGameFpsDecisions,
  readGameFpsDecisionStore,
} from './gameFpsDecisionStore'
import { readGameModeXrSpatialProfile } from './gameModeXrSpatialProfile'
import {
  subscribeXrMotionReferenceRuntime,
} from '@/features/three/xrMotionReferenceRuntime'
import {
  subscribeXrNativeControllerDemo,
} from '@/features/three/xrNativeControllerDemoRuntime'
import {
  pauseXrPhysicsRuntime,
  playXrPhysicsRuntime,
  readXrPhysicsRuntime,
} from '@/features/three/xrPhysicsRuntime'

export type GameModeLaunchStatus = 'idle' | 'loading' | 'ready' | 'error'
export type GameModeSimulationStatus = 'idle' | 'ready' | 'running' | 'paused'

export type GameModeSnapshot = Readonly<{
  active: boolean
  surfaceMode: 'xr'
  webglSupported: boolean
  launchStatus: GameModeLaunchStatus
  simulationStatus: GameModeSimulationStatus
  message: string
  revision: number
}>

type Listener = () => void
type GraphStoreState = ReturnType<typeof useGraphStore.getState>
type PreviousCanvasSurface = Readonly<Pick<
  GraphStoreState,
  'canvasRenderMode' | 'canvas3dMode' | 'floatingPanelOpen' | 'floatingPanelView'
>>
type AuthoredXrRuntimeOwnership = Readonly<{
  physicsWasPlaying: boolean
  timelineWasPlaying: boolean
}>

const listeners = new Set<Listener>()
let launchGeneration = 0
let simulationGeneration = 0
let simulationQueue: Promise<void> = Promise.resolve()
let motionInputRequiresNeutral = false
let previousCanvasSurface: PreviousCanvasSurface | null = null
let authoredXrRuntimeOwnership: AuthoredXrRuntimeOwnership | null = null
let snapshot: GameModeSnapshot = Object.freeze({
  active: false,
  surfaceMode: 'xr',
  webglSupported: false,
  launchStatus: 'idle',
  simulationStatus: 'idle',
  message: 'Game Mode is inactive.',
  revision: 0,
})

function publish(update: Partial<Omit<GameModeSnapshot, 'revision'>>): GameModeSnapshot {
  snapshot = Object.freeze({ ...snapshot, ...update, revision: snapshot.revision + 1 })
  for (const listener of [...listeners]) listener()
  return snapshot
}

function fenceSimulationAdvances(): void {
  simulationGeneration += 1
}

function suspendAuthoredXrRuntime(entering: boolean): void {
  const state = useGraphStore.getState()
  if (entering && !authoredXrRuntimeOwnership) {
    authoredXrRuntimeOwnership = Object.freeze({
      physicsWasPlaying: readXrPhysicsRuntime().phase === 'playing',
      timelineWasPlaying: state.timelineTransportPlaying === true,
    })
  }
  pauseXrPhysicsRuntime()
  state.setTimelineTransportState({ playing: false })
}

function restoreAuthoredXrRuntime(): void {
  const ownership = authoredXrRuntimeOwnership
  authoredXrRuntimeOwnership = null
  if (!ownership) return
  if (ownership.physicsWasPlaying) playXrPhysicsRuntime()
  else pauseXrPhysicsRuntime()
  useGraphStore.getState().setTimelineTransportState({ playing: ownership.timelineWasPlaying })
}

function resolveSpatialProfile(): GameFpsSpatialProfile {
  return readGameModeXrSpatialProfile()
}

function runtimeFailureMessage(error: unknown): string {
  return error instanceof Error && error.message
    ? error.message
    : String(error || 'Game Mode runtime failed')
}

function queuedMissionPublishedRuntimeFailure(error: unknown, queuedRunId: number): boolean {
  const mission = readGameFpsSnapshot()
  return readGameFpsRunId() === queuedRunId
    && mission.runtimeError === runtimeFailureMessage(error)
}

function spatialProfileRefreshMessage(): string {
  return `Deterministic ECS mission restarted for the ${readGameFpsSpatialProfile().id} spatial profile; move, aim, or fire to engage.`
}

function publishGameModeRuntimeFailure(error: unknown): GameModeSnapshot {
  const currentMission = readGameFpsSnapshot()
  const failedMission = currentMission.runtimeError ? currentMission : publishRuntimeFailure(error)
  fenceSimulationAdvances()
  return publish({
    launchStatus: 'error',
    simulationStatus: 'idle',
    message: failedMission.runtimeError || runtimeFailureMessage(error),
  })
}

function replaceIncompatibleLiveMission(): ReturnType<typeof readGameFpsSnapshot> | null {
  if (!snapshot.active || !hasGameFpsMission()) return null
  const mission = refreshGameFpsMissionSpatialProfile()
  if (!mission) return null
  fenceSimulationAdvances()
  publish({
    launchStatus: 'ready',
    simulationStatus: 'ready',
    message: spatialProfileRefreshMessage(),
  })
  return mission
}

function refreshLiveMissionFromSharedScene(): void {
  try {
    replaceIncompatibleLiveMission()
  } catch (error) {
    publishGameModeRuntimeFailure(error)
  }
}

subscribeXrMotionReferenceRuntime(refreshLiveMissionFromSharedScene)
subscribeXrNativeControllerDemo(refreshLiveMissionFromSharedScene)

export function readGameModeSnapshot(): GameModeSnapshot {
  return snapshot
}

export function subscribeGameModeSnapshot(listener: Listener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function openGameModeSurface(options: Readonly<{
  openPanel?: boolean
  webglSupported?: boolean
}> = {}): boolean {
  if (!hydrateCanonicalXrMotionReferenceRuntime()) {
    publish({ launchStatus: 'error', simulationStatus: 'idle', message: 'Game Mode requires a hydrated authored document on the shared XR Mode scene.' })
    return false
  }
  hydrateCanonicalXrPhysicsRuntime()
  const state = useGraphStore.getState()
  const entering = !snapshot.active
  if (entering) {
    fenceSimulationAdvances()
    previousCanvasSurface = Object.freeze({
      canvasRenderMode: state.canvasRenderMode,
      canvas3dMode: state.canvas3dMode,
      floatingPanelOpen: state.floatingPanelOpen,
      floatingPanelView: isXrGameplaySurfaceView(state.floatingPanelView)
        ? 'motionControl'
        : state.floatingPanelView,
    })
  }
  let spatialProfileRefreshed = false
  try {
    const activated = activateXrSceneSurface({
      ...(options.openPanel === false ? {} : { panelView: 'gameMode', openPanel: true }),
      gameplaySurface: 'gameMode',
      beforePanelCommit: () => {
        if (hasGameFpsMission()) {
          spatialProfileRefreshed = Boolean(refreshGameFpsMissionSpatialProfile())
        }
      },
    })
    if (activated) {
      suspendAuthoredXrRuntime(entering)
      const mission = readGameFpsSnapshot()
      publish({
        active: true,
        surfaceMode: 'xr',
        webglSupported: options.webglSupported ?? readWebglSupport(),
        launchStatus: mission.phase === 'stopped' ? snapshot.launchStatus : 'ready',
        simulationStatus: entering
          ? mission.phase === 'playing' ? 'ready' : mission.phase === 'stopped' && hasGameFpsMission() ? 'paused' : 'idle'
          : snapshot.simulationStatus,
        message: spatialProfileRefreshed
          ? spatialProfileRefreshMessage()
          : 'Game Mode opened on the shared XR Mode scene.',
      })
      return true
    }
    if (entering) previousCanvasSurface = null
    publish({ launchStatus: 'error', simulationStatus: 'idle', message: 'Game Mode requires an available shared XR Mode surface.' })
    return false
  } catch (error) {
    if (entering) previousCanvasSurface = null
    publishGameModeRuntimeFailure(error)
    return false
  }
}

export async function startGameMode(options: Readonly<{
  decisions?: readonly unknown[]
  openPanel?: boolean
  webglSupported?: boolean
}> = {}): Promise<GameModeSnapshot> {
  if (!openGameModeSurface(options)) return snapshot
  const generation = launchGeneration + 1
  launchGeneration = generation
  const decisionStore = readGameFpsDecisionStore()
  if (decisionStore.hydrationBlocked) {
    fenceSimulationAdvances()
    stopGameFpsMission()
    return publish({ launchStatus: 'error', simulationStatus: 'idle', message: decisionStore.error || 'Decision persistence is unreadable.' })
  }
  const webglSupported = options.webglSupported ?? snapshot.webglSupported
  if (!webglSupported) {
    fenceSimulationAdvances()
    stopGameFpsMission()
    return publish({ launchStatus: 'error', simulationStatus: 'idle', message: 'WebGL is unavailable; Game Mode stayed stopped on the shared XR surface.' })
  }
  if (!Object.hasOwn(options, 'decisions') && hasGameFpsMission()) {
    const current = readGameFpsSnapshot()
    const previousSpatialProfile = readGameFpsSpatialProfile()
    const spatialProfile = resolveSpatialProfile()
    if (!gameFpsSpatialProfilesMatch(previousSpatialProfile, spatialProfile)) {
      fenceSimulationAdvances()
      const mission = startGameFpsMission()
      return publish({
        launchStatus: 'ready',
        simulationStatus: mission.phase === 'playing' ? 'ready' : 'idle',
        message: `Deterministic ECS mission restarted for the ${spatialProfile.id} spatial profile; move, aim, or fire to engage.`,
      })
    }
    if (current.runtimeError) {
      fenceSimulationAdvances()
      return publish({
        launchStatus: 'error',
        simulationStatus: 'idle',
        message: `${current.runtimeError} Restart Game Mode before resuming.`,
      })
    }
    if (current.phase === 'stopped') {
      fenceSimulationAdvances()
      const mission = startGameFpsMission()
      return publish({
        launchStatus: 'ready',
        simulationStatus: mission.phase === 'playing' ? 'ready' : 'idle',
        message: mission.phase === 'playing'
          ? `Deterministic ECS mission resumed at tick ${mission.tick}; move, aim, or fire to engage.`
          : `Deterministic ECS mission restored (${mission.phase}); restart explicitly for a fresh run.`,
      })
    }
    if (current.phase === 'playing' && snapshot.message === spatialProfileRefreshMessage()) return snapshot
    return publish({
      launchStatus: 'ready',
      simulationStatus: current.phase === 'playing'
        ? snapshot.simulationStatus === 'running' ? 'running' : 'ready'
        : 'idle',
      message: current.phase === 'playing'
        ? snapshot.simulationStatus === 'running'
          ? 'Deterministic ECS mission is already running.'
          : 'Deterministic ECS mission is ready; move, aim, or fire to engage.'
        : `Deterministic ECS mission is ${current.phase}; restart explicitly for a fresh run.`,
    })
  }
  publish({ launchStatus: 'loading', message: 'Loading validated local Decisions…' })
  try {
    const decisions = Object.hasOwn(options, 'decisions')
      ? [...(options.decisions || [])]
      : await loadGameFpsSavedDecisions()
    if (generation !== launchGeneration || !snapshot.active) return snapshot
    const mission = startGameFpsMission({
      decisions,
    })
    fenceSimulationAdvances()
    return publish({
      launchStatus: 'ready',
      simulationStatus: mission.phase === 'playing' ? 'ready' : 'idle',
      message: mission.phase === 'playing'
        ? 'Deterministic ECS mission is ready; move, aim, or fire to engage.'
        : `Deterministic ECS mission restored (${mission.phase}).`,
    })
  } catch (error) {
    if (generation !== launchGeneration) return snapshot
    if (!Object.hasOwn(options, 'decisions')) {
      stopGameFpsMission()
      const message = readGameFpsDecisionStore().error || runtimeFailureMessage(error)
      return publish({ launchStatus: 'error', simulationStatus: 'idle', message })
    }
    return publishGameModeRuntimeFailure(error)
  }
}

export function armGameModeSimulation(): GameModeSnapshot {
  const mission = readGameFpsSnapshot()
  if (!snapshot.active || mission.phase !== 'playing' || mission.runtimeError) return snapshot
  if (snapshot.simulationStatus === 'running') return snapshot
  fenceSimulationAdvances()
  return publish({ simulationStatus: 'running', message: 'Deterministic ECS mission running.' })
}

export function authorizeGameModeMotionInput(input: Readonly<{
  active: boolean
  tracked: boolean
}>): boolean {
  if (!input.tracked) {
    motionInputRequiresNeutral = true
    return false
  }
  if (!input.active) {
    motionInputRequiresNeutral = false
    return true
  }
  if (motionInputRequiresNeutral) return false
  return armGameModeSimulation().simulationStatus === 'running'
}

export function reportGameModeSimulationFailure(error: unknown): GameModeSnapshot {
  const mission = readGameFpsSnapshot()
  if (
    snapshot.launchStatus === 'error'
    && mission.runtimeError === runtimeFailureMessage(error)
  ) return snapshot
  return publishGameModeRuntimeFailure(error)
}

export function pauseGameModeSimulation(message = 'Game Mode paused; resume with player input.'): GameModeSnapshot {
  fenceSimulationAdvances()
  motionInputRequiresNeutral = true
  discardGameFpsTransientInput()
  if (snapshot.simulationStatus !== 'running') return snapshot
  return publish({ simulationStatus: 'paused', message })
}

export function advanceGameModeSimulationBy(deltaSeconds: number): Promise<ReturnType<typeof readGameFpsSnapshot>> {
  if (snapshot.simulationStatus !== 'running') return Promise.resolve(readGameFpsSnapshot())
  let gameAdvance: ReturnType<typeof captureGameFpsAdvance>
  try {
    gameAdvance = captureGameFpsAdvance(deltaSeconds)
  } catch (error) {
    publishGameModeRuntimeFailure(error)
    return Promise.reject(error)
  }
  const queuedGeneration = simulationGeneration
  const queuedRunId = readGameFpsRunId()
  let resolveResult!: (value: ReturnType<typeof readGameFpsSnapshot>) => void
  let rejectResult!: (reason: unknown) => void
  const result = new Promise<ReturnType<typeof readGameFpsSnapshot>>((resolve, reject) => {
    resolveResult = resolve
    rejectResult = reject
  })
  simulationQueue = simulationQueue.catch(() => undefined).then(async () => {
    if (queuedGeneration !== simulationGeneration || snapshot.simulationStatus !== 'running') {
      resolveResult(readGameFpsSnapshot())
      return
    }
    try {
      const refreshedMission = replaceIncompatibleLiveMission()
      if (refreshedMission) {
        resolveResult(refreshedMission)
        return
      }
      const mission = await gameAdvance()
      if (queuedGeneration === simulationGeneration && snapshot.simulationStatus === 'running') {
        if (mission.runtimeError) {
          fenceSimulationAdvances()
          publish({ launchStatus: 'error', simulationStatus: 'idle', message: mission.runtimeError })
        } else if (mission.phase !== 'playing') {
          fenceSimulationAdvances()
          publish({
            simulationStatus: 'idle',
            message: `Deterministic ECS mission ${mission.phase} at tick ${mission.tick}.`,
          })
        }
      }
      resolveResult(mission)
    } catch (error) {
      if (
        queuedGeneration === simulationGeneration
        || queuedMissionPublishedRuntimeFailure(error, queuedRunId)
      ) {
        publishGameModeRuntimeFailure(error)
      }
      rejectResult(error)
    }
  })
  return result
}

export function stopGameMode(): GameModeSnapshot {
  launchGeneration += 1
  fenceSimulationAdvances()
  motionInputRequiresNeutral = true
  stopGameFpsMission()
  return publish({ launchStatus: 'ready', simulationStatus: 'paused', message: 'Game Mode stopped; the local mission remains available to resume.' })
}

export async function restartGameMode(options: Readonly<{
  webglSupported?: boolean
  workspace?: WorkspaceFs
}> = {}): Promise<GameModeSnapshot> {
  const generation = launchGeneration + 1
  launchGeneration = generation
  fenceSimulationAdvances()
  motionInputRequiresNeutral = true
  if (!snapshot.active && !openGameModeSurface()) {
    return snapshot
  }
  const decisionStore = readGameFpsDecisionStore()
  if (decisionStore.hydrationBlocked) {
    stopGameFpsMission()
    return publish({ launchStatus: 'error', simulationStatus: 'idle', message: decisionStore.error || 'Decision persistence is unreadable.' })
  }
  const webglSupported = options.webglSupported ?? readWebglSupport()
  if (!webglSupported) {
    stopGameFpsMission()
    return publish({ webglSupported: false, launchStatus: 'error', simulationStatus: 'idle', message: 'WebGL is unavailable; Game Mode stayed stopped on the shared XR surface.' })
  }
  publish({ webglSupported, launchStatus: 'loading', simulationStatus: 'idle', message: 'Validating local Decisions before restart…' })
  let persistedDecisions: readonly unknown[]
  try {
    persistedDecisions = await loadGameFpsSavedDecisions(options.workspace ? { workspace: options.workspace } : {})
  } catch (error) {
    if (generation !== launchGeneration) return snapshot
    stopGameFpsMission()
    const message = readGameFpsDecisionStore().error || runtimeFailureMessage(error)
    return publish({ launchStatus: 'error', simulationStatus: 'idle', message })
  }
  if (generation !== launchGeneration || !snapshot.active) return snapshot
  try {
    restartGameFpsMission({ persistedDecisions })
    return publish({ launchStatus: 'ready', simulationStatus: 'ready', message: 'Game Mode restarted; move, aim, or fire to engage.' })
  } catch (error) {
    if (generation !== launchGeneration) return snapshot
    stopGameFpsMission()
    return publishGameModeRuntimeFailure(error)
  }
}

function performGameModeSurfaceExit(options: Readonly<{ restorePreviousSurface?: boolean }> = {}): GameModeSnapshot {
  launchGeneration += 1
  fenceSimulationAdvances()
  motionInputRequiresNeutral = true
  stopGameFpsMission()
  const previous = previousCanvasSurface
  previousCanvasSurface = null
  const next = publish({ active: false, launchStatus: 'idle', simulationStatus: 'idle', message: 'Game Mode exited; the previous Canvas surface can resume.' })
  restoreAuthoredXrRuntime()
  if (options.restorePreviousSurface !== false && previous) {
    const state = useGraphStore.getState()
    state.setCanvas3dMode(previous.canvas3dMode)
    state.setCanvasRenderMode(previous.canvasRenderMode)
    state.setFloatingPanelView(previous.floatingPanelView)
    state.setFloatingPanelOpen(previous.floatingPanelOpen)
  }
  return next
}

export function exitGameModeSurface(options: Readonly<{ restorePreviousSurface?: boolean }> = {}): GameModeSnapshot {
  const next = performGameModeSurfaceExit(options)
  deactivateXrSceneGameplayMode('gameMode')
  return next
}

registerXrSceneGameplayMode('gameMode', {
  identity: 'first-person',
  worldSchema: 'agentic-graph.game-mode.first-person/v1',
  persistence: { continuity: 'none', lease: 'none' },
  surface: { overlayKind: 'xr-scene-gameplay' },
  adaptInput: () => ({}),
  createOverlay: () => ({
    overlayId: 'first-person',
    overlayKind: 'xr-scene-gameplay',
  }),
  exit: () => {
    if (snapshot.active) performGameModeSurfaceExit({ restorePreviousSurface: false })
  },
} satisfies GameOsModeDeclaration)

export async function persistGameModePendingDecisions(options: Readonly<{
  workspace?: WorkspaceFs
}> = {}) {
  const mission = readGameFpsSnapshot()
  const decisions = [...mission.pendingDecisions]
  if (decisions.length > 0) queueGameFpsDecisions(decisions)
  const result = await persistPendingGameFpsDecisions(options)
  if (result.status === 'saved' && decisions.length > 0) {
    acknowledgeGameFpsDecisions(decisions.map(decision => decision.decisionId))
  }
  return result
}

export function resetGameModeRuntimeForTests(): GameModeSnapshot {
  launchGeneration += 1
  fenceSimulationAdvances()
  motionInputRequiresNeutral = false
  previousCanvasSurface = null
  stopGameFpsMission()
  restoreAuthoredXrRuntime()
  const next = publish({
    active: false,
    surfaceMode: 'xr',
    webglSupported: false,
    launchStatus: 'idle',
    simulationStatus: 'idle',
    message: 'Game Mode is inactive.',
  })
  deactivateXrSceneGameplayMode('gameMode')
  return next
}
