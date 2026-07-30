import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'
import { useGraphStore } from '@/hooks/useGraphStore'
import { resolveAuthoredWorldPaused } from '@/lib/three/authoredWorldPause'
import { applyCanvasFrontmatterPreset } from '@/features/parsers/canvasFrontmatterPreset'
import { controlLocalCamera } from '@/features/strybldr/cameraMcpRuntime'
import { controlLocalAnimation } from '@/features/three/xrAnimationMcpRuntime'
import { controlLocalXrScene } from '@/features/three/xrSceneMcpRuntime'
import { installGameFpsDesktopInput } from '@/features/game-fps/gameFpsInput'
import {
  advanceGameFpsBy,
  queueGameFpsFire,
  readGameFpsSpatialProfile,
  readGameFpsSnapshot,
  reloadGameFpsWeapon,
  setGameFpsInput,
} from '@/features/game-fps/gameFpsRuntime'
import {
  advanceGameModeSimulationBy,
  armGameModeSimulation,
  exitGameModeSurface,
  openGameModeSurface,
  pauseGameModeSimulation,
  readGameModeSnapshot,
  reportGameModeSimulationFailure,
  resetGameModeRuntimeForTests,
  startGameMode,
  stopGameMode,
} from '@/features/game-fps/gameModeRuntime'
import { readGameModeXrSpatialProfile } from '@/features/game-fps/gameModeXrSpatialProfile'
import {
  hasGameFpsLineOfSight,
  resolveGameFpsMovement,
} from '@/features/game-fps/gameFpsGeometry'
import {
  GAME_FPS_FIXED_STEP_SECONDS,
  GAME_FPS_MISSION_ID,
  GAME_FPS_SHARED_XR_PROFILE_ID,
} from '@/features/game-fps/gameFpsModel'
import { readXrNativeControllerCamera } from '@/features/three/xrNativeControllerCameraRuntime'
import {
  hydrateCanonicalXrMotionReferenceRuntime,
  hydrateCanonicalXrPhysicsRuntime,
} from '@/features/three/XrMotionReferenceRuntimeBridge'
import {
  addXrMotionReferenceSubject,
  readXrMotionReferenceRuntime,
  setXrMotionReferenceStage,
} from '@/features/three/xrMotionReferenceRuntime'
import { XR_PHYSICS_GRAPH_METADATA_KEY } from '@/features/three/xrPhysicsModel'
import { playXrPhysicsRuntime, readXrPhysicsRuntime } from '@/features/three/xrPhysicsRuntime'
import { motionControlCaptureSurfaceIsOpen } from '@/features/three/motionControlSurfaceRuntime'
import {
  activateXrSceneSurface,
  XR_SCENE_FLOATING_PANEL_VIEWS,
} from '@/features/three/xrSceneSurfaceRuntime'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'
import { installGameModeRuntimeTestLifecycle } from './helpers/gameModeRuntimeTestLifecycle'

installGameModeRuntimeTestLifecycle('game-mode-runtime')

function maximumTickDecision(decisionId: string) {
  return {
    decisionId,
    decisionType: 'world_tick_result' as const,
    entityRef: 'npc-scout',
    payload: {
      event: 'npc_action',
      missionId: GAME_FPS_MISSION_ID,
      runId: 1,
      tick: 0xffff_fffe,
      action: 'hold',
    },
    producedAt: '2026-01-01T00:00:00.000Z',
  }
}

test('Game Mode activates the shared XR scene from 2D and restores its prior owner on exit', () => {
  const state = useGraphStore.getState()
  state.setCanvasRenderMode('2d')
  state.setCanvas3dMode('3d')
  state.setFloatingPanelView('motionControl')
  state.setFloatingPanelOpen(true)
  assert.equal(openGameModeSurface({ webglSupported: true }), true)
  assert.equal(readGameModeSnapshot().active, true)
  assert.equal(readGameModeSnapshot().surfaceMode, 'xr')
  assert.equal(useGraphStore.getState().canvasRenderMode, '3d')
  assert.equal(useGraphStore.getState().canvas3dMode, 'xr')
  assert.equal(useGraphStore.getState().floatingPanelView, 'gameMode')
  assert.equal(useGraphStore.getState().floatingPanelOpen, true)
  assert.equal(motionControlCaptureSurfaceIsOpen({
    canvasRenderMode: '3d',
    canvas3dMode: 'xr',
    floatingPanelOpen: true,
    floatingPanelView: 'gameMode',
    mediaCatalogMode: 'xr-3d',
  }), true)
  exitGameModeSurface()
  assert.equal(readGameModeSnapshot().active, false)
  assert.equal(useGraphStore.getState().canvasRenderMode, '2d')
  assert.equal(useGraphStore.getState().canvas3dMode, '3d')
  assert.equal(useGraphStore.getState().floatingPanelView, 'motionControl')
  assert.equal(useGraphStore.getState().floatingPanelOpen, true)
})

test('Game Mode pauses and idempotently restores shared authored transports on exit and companion handoff', () => {
  const state = useGraphStore.getState()
  const subject = addXrMotionReferenceSubject({ assetId: 'prop-ball', label: 'Freeze proof' }).plan.subjects.at(-1)
  assert.ok(subject)
  useGraphStore.setState({
    graphData: {
      ...state.graphData!,
      metadata: {
        ...(state.graphData?.metadata || {}),
        [XR_PHYSICS_GRAPH_METADATA_KEY]: {
          bodies: { [subject.id]: { mode: 'dynamic' } },
        },
      },
    },
  } as never)
  assert.equal(hydrateCanonicalXrMotionReferenceRuntime(), true)
  assert.equal(hydrateCanonicalXrPhysicsRuntime(), true)
  assert.ok(readXrPhysicsRuntime().world.bodies.length > 0)
  assert.equal(playXrPhysicsRuntime().phase, 'playing')
  useGraphStore.getState().setTimelineTransportState({ playing: true })

  assert.equal(openGameModeSurface({ webglSupported: true }), true)
  assert.equal(readXrPhysicsRuntime().phase, 'paused')
  assert.equal(useGraphStore.getState().timelineTransportPlaying, false)
  assert.equal(openGameModeSurface({ webglSupported: true }), true, 'repeat open must retain the first transport ownership capture')
  exitGameModeSurface({ restorePreviousSurface: false })
  assert.equal(readXrPhysicsRuntime().phase, 'playing')
  assert.equal(useGraphStore.getState().timelineTransportPlaying, true)

  assert.equal(openGameModeSurface({ webglSupported: true }), true)
  assert.equal(activateXrSceneSurface({ panelView: 'media', openPanel: true }), true)
  assert.equal(readGameModeSnapshot().active, false)
  assert.equal(readXrPhysicsRuntime().phase, 'playing')
  assert.equal(useGraphStore.getState().timelineTransportPlaying, true)

  assert.equal(openGameModeSurface({ webglSupported: true }), true)
  resetGameModeRuntimeForTests()
  assert.equal(readGameModeSnapshot().active, false)
  assert.equal(readXrPhysicsRuntime().phase, 'playing')
  assert.equal(useGraphStore.getState().timelineTransportPlaying, true)
})

test('Game Mode freeze contract retains authored presentation and removes every shared-stage input route', () => {
  const source = (...parts: string[]) => readFileSync(resolve(process.cwd(), 'src', ...parts), 'utf8')
  const threeGraph = source('lib', 'three', 'ThreeGraph.impl.tsx')
  const scene = source('lib', 'three', 'Scene.impl.tsx')
  const xrSceneStage = source('features', 'three', 'XrSceneStage.tsx')
  const motionGraphStage = source('features', 'three', 'XrMotionReferenceGraphStage.tsx')
  const canonicalPhysicsStage = source('features', 'three', 'XrCanonicalPhysicsStage.tsx')
  const motionStage = source('features', 'three', 'XrMotionReferenceStage.tsx')
  const physicsStage = source('features', 'three', 'XrPhysicsStageRuntime.tsx')
  const subject = source('features', 'three', 'XrSceneLibrarySubject.tsx')
  assert.equal(resolveAuthoredWorldPaused(false, false), false)
  assert.equal(resolveAuthoredWorldPaused(true, false), true)
  assert.equal(resolveAuthoredWorldPaused(false, true), true)
  assert.ok(threeGraph.includes('const authoredWorldPaused = resolveAuthoredWorldPaused(paused, gameplayOverlayActive)'))
  for (const component of ['SceneLazy', 'GlbAssetModel', 'SpatialCaptureManifestStage']) {
    const mount = threeGraph.match(new RegExp(`<${component}\\b[\\s\\S]*?\\n\\s*/>`))?.[0] || ''
    assert.ok(mount.includes('paused={authoredWorldPaused}'), `${component} must use the one authored-world pause owner`)
  }
  assert.ok(scene.includes('<XrSceneStage authority={xrGraphStageAuthority} data={data} paused={Boolean(paused)}'))
  assert.ok(xrSceneStage.includes('<XrMotionReferenceGraphStageLazy data={data} paused={paused}'))
  assert.ok(xrSceneStage.includes('<XrCanonicalPhysicsStage paused={paused}'))
  assert.ok(!motionGraphStage.includes('gameModeRuntime'))
  assert.ok(!canonicalPhysicsStage.includes('gameModeRuntime'))
  assert.ok(motionGraphStage.includes('paused={paused}'))
  assert.ok(canonicalPhysicsStage.includes('inputEnabled={!paused}'))
  assert.ok(motionStage.includes('useRetainedWhilePaused(liveRuntime, paused)'))
  assert.ok(motionStage.includes('useRetainedWhilePaused(liveMotionControl, paused)'))
  assert.ok(motionStage.includes('{!paused ? <XrKeyboardChoreographyRuntime /> : null}'))
  assert.ok(motionStage.includes('onFloorPoint={!paused && runtime.castMarkArmed'))
  assert.ok(motionStage.includes('inputEnabled={!paused}'))
  assert.ok(motionStage.includes('onSelect={!paused ?'))
  assert.ok(motionStage.includes('onClick={!paused ? event =>'))
  assert.ok(physicsStage.includes('if (paused) return'))
  assert.ok(physicsStage.includes("if (!paused && runtime.phase === 'stopped')"))
  assert.ok(subject.includes('selectable: Boolean(onSelect)'))
  assert.ok(subject.includes('onClick={onSelect ? event =>'))
})

test('all five shared XR panels use one surface and non-Game panels exit Game ownership', async () => {
  for (const panelView of XR_SCENE_FLOATING_PANEL_VIEWS) {
    await startGameMode({ decisions: [], webglSupported: true })
    armGameModeSimulation()
    assert.equal(activateXrSceneSurface({ panelView, openPanel: true }), true)
    assert.equal(readGameModeSnapshot().active, panelView === 'gameMode')
    assert.equal(readGameFpsSnapshot().phase, panelView === 'gameMode' ? 'playing' : 'stopped')
    assert.equal(useGraphStore.getState().canvasRenderMode, '3d')
    assert.equal(useGraphStore.getState().canvas3dMode, 'xr')
    assert.equal(useGraphStore.getState().floatingPanelView, panelView)
    assert.equal(useGraphStore.getState().floatingPanelOpen, true)
    if (readGameModeSnapshot().active) exitGameModeSurface({ restorePreviousSurface: false })
  }
})

test('panel-only frontmatter presets on the current XR surface use shared Game ownership rules', async () => {
  for (const panelView of XR_SCENE_FLOATING_PANEL_VIEWS) {
    await startGameMode({ decisions: [], webglSupported: true })
    applyCanvasFrontmatterPreset({
      rawText: [
        '---',
        'kgFloatingPanelOpen: true',
        `kgFloatingPanelView: "${panelView}"`,
        '---',
        '',
      ].join('\n'),
    })
    assert.equal(readGameModeSnapshot().active, panelView === 'gameMode')
    assert.equal(readGameFpsSnapshot().phase, panelView === 'gameMode' ? 'playing' : 'stopped')
    assert.equal(useGraphStore.getState().canvasRenderMode, '3d')
    assert.equal(useGraphStore.getState().canvas3dMode, 'xr')
    assert.equal(useGraphStore.getState().floatingPanelView, panelView)
    assert.equal(useGraphStore.getState().floatingPanelOpen, true)
    if (readGameModeSnapshot().active) exitGameModeSurface({ restorePreviousSurface: false })
  }
})

test('rejected radial-to-XR transactions preserve active Game ownership and reject MCP mutations', async () => {
  await startGameMode({ decisions: [], webglSupported: true })
  const activeMission = readGameFpsSnapshot()
  assert.equal(readGameModeSnapshot().active, true)
  const state = useGraphStore.getState()
  useGraphStore.setState({
    schema: {
      ...(state.schema || {}),
      layout: { ...(state.schema?.layout || {}), mode: 'radial' },
    },
  } as never)
  const rejectedSurface = activateXrSceneSurface({ panelView: 'animation', openPanel: true, timeline: true })
  assert.equal(rejectedSurface, false)
  assert.equal(readGameModeSnapshot().active, true)
  assert.equal(readGameFpsSnapshot().revision, activeMission.revision)
  assert.equal(useGraphStore.getState().floatingPanelView, 'gameMode')

  const motionBefore = readXrMotionReferenceRuntime()
  const cameraBefore = readXrNativeControllerCamera()
  const storeBefore = useGraphStore.getState()
  const metadataBefore = JSON.stringify(storeBefore.graphData?.metadata || {})
  const timelineBefore = {
    collapsed: storeBefore.bottomSurfaceCollapsed,
    playing: storeBefore.timelineTransportPlaying,
    position: storeBefore.timelineTransportPosition,
    tab: storeBefore.bottomSurfaceTab,
  }
  const alternateCamera = cameraBefore.mode === 'fixed-follow' ? 'free-orbit' : 'fixed-follow'
  const alternateStage = motionBefore.plan.stageId === 'neutral-volume' ? 'singapore' : 'neutral-volume'
  const animation = controlLocalAnimation({ operation: 'scrub', timeSeconds: 2 })
  const cameraSource = controlLocalCamera({ action: 'select', cameraId: alternateCamera })
  const cameraChoreography = controlLocalCamera({ action: 'scrub', targetId: 'camera', timeSeconds: 2 })
  const scene = controlLocalXrScene({ action: 'stage', stageId: alternateStage })
  assert.equal(animation.ok, false)
  assert.equal(cameraSource.ok, false)
  assert.equal(cameraChoreography.ok, false)
  assert.equal(scene.ok, false)
  assert.equal(readGameModeSnapshot().active, true)
  assert.equal(readGameFpsSnapshot().revision, activeMission.revision)
  assert.equal(readXrNativeControllerCamera().mode, cameraBefore.mode)
  const motionAfter = readXrMotionReferenceRuntime()
  assert.equal(motionAfter.plan.stageId, motionBefore.plan.stageId)
  assert.equal(motionAfter.playheadSeconds, motionBefore.playheadSeconds)
  assert.equal(motionAfter.revision, motionBefore.revision)
  const storeAfter = useGraphStore.getState()
  assert.equal(JSON.stringify(storeAfter.graphData?.metadata || {}), metadataBefore)
  assert.deepEqual({
    collapsed: storeAfter.bottomSurfaceCollapsed,
    playing: storeAfter.timelineTransportPlaying,
    position: storeAfter.timelineTransportPosition,
    tab: storeAfter.bottomSurfaceTab,
  }, timelineBefore)
  assert.equal(storeAfter.canvasRenderMode, '3d')
  assert.equal(storeAfter.canvas3dMode, 'xr')
  assert.equal(storeAfter.floatingPanelView, 'gameMode')
})

test('Game Mode projects gameplay through the canonical shared XR spatial source', async () => {
  setXrMotionReferenceStage('loading-bay')
  hydrateCanonicalXrPhysicsRuntime()
  await startGameMode({ decisions: [], webglSupported: true })
  const spatialProfile = readGameModeXrSpatialProfile()
  assert.equal(spatialProfile.id, GAME_FPS_SHARED_XR_PROFILE_ID)
  assert.equal(readGameFpsSpatialProfile().id, GAME_FPS_SHARED_XR_PROFILE_ID)
  const crate = spatialProfile.map.blockers.find(blocker => blocker.id === 'stage:crate-a')
  assert.ok(crate)
  assert.equal(spatialProfile.map.blockers.some(blocker => blocker.id.startsWith('terrain:')), false)
  assert.ok(spatialProfile.npcSeeds.every(npc => (
    Math.abs(npc.x) < spatialProfile.map.halfWidth && Math.abs(npc.z) < spatialProfile.map.halfDepth
  )))
  const spatialMap = readGameFpsSpatialProfile().map
  const approach = { x: crate.centerX - crate.halfWidth - 0.36, z: crate.centerZ }
  assert.deepEqual(resolveGameFpsMovement(approach, { x: 1, z: 0 }, 0.35, spatialMap), approach)
  assert.equal(hasGameFpsLineOfSight(
    { x: crate.centerX - crate.halfWidth - 1, z: crate.centerZ },
    { x: crate.centerX + crate.halfWidth + 1, z: crate.centerZ },
    spatialMap,
  ), false)
})

test('Game Mode waits for normalized player engagement and pauses without advancing', async () => {
  await startGameMode({ decisions: [], webglSupported: true })
  assert.equal(readGameModeSnapshot().simulationStatus, 'ready')
  const pendingDecisionCount = readGameFpsSnapshot().pendingDecisions.length
  for (let index = 0; index < 60; index += 1) await advanceGameModeSimulationBy(0.25)
  assert.equal(readGameFpsSnapshot().tick, 0)
  assert.equal(readGameFpsSnapshot().player.health, 100)
  assert.equal(readGameFpsSnapshot().pendingDecisions.length, pendingDecisionCount)
  armGameModeSimulation()
  assert.equal(readGameModeSnapshot().simulationStatus, 'running')
  const queuedAdvances = Array.from({ length: 10 }, () => advanceGameModeSimulationBy(0.25))
  pauseGameModeSimulation()
  await Promise.all(queuedAdvances)
  assert.equal(readGameFpsSnapshot().tick, 0, 'pause must fence advances already queued by rendered frames')
  armGameModeSimulation()
  await advanceGameModeSimulationBy(0.25)
  assert.ok(readGameFpsSnapshot().tick > 0)
  const pausedTick = readGameFpsSnapshot().tick
  pauseGameModeSimulation()
  await advanceGameModeSimulationBy(0.25)
  assert.equal(readGameFpsSnapshot().tick, pausedTick)
})

test('Game Mode preserves rendered-frame input across its outer simulation queue', async () => {
  await startGameMode({ decisions: [], webglSupported: true })
  armGameModeSimulation()
  const initial = readGameFpsSnapshot()

  setGameFpsInput({ forward: 1 })
  const queuedAdvance = advanceGameModeSimulationBy(0.25)
  setGameFpsInput({ forward: 0 })
  const moved = await queuedAdvance

  assert.equal(moved.tick, 15)
  assert.notEqual(moved.player.z, initial.player.z)
})

test('Game Mode preserves a movement edge across a stalled render interval', async () => {
  await startGameMode({ decisions: [], webglSupported: true })
  armGameModeSimulation()
  const initial = readGameFpsSnapshot()

  setGameFpsInput({ forward: 1 })
  setGameFpsInput({ forward: 0 })
  await advanceGameModeSimulationBy(GAME_FPS_FIXED_STEP_SECONDS / 2)
  const moved = await advanceGameModeSimulationBy(GAME_FPS_FIXED_STEP_SECONDS / 2)
  assert.notEqual(moved.player.z, initial.player.z)

  const neutral = await advanceGameModeSimulationBy(GAME_FPS_FIXED_STEP_SECONDS)
  assert.equal(neutral.player.z, moved.player.z)
})

test('Game Mode pause discards movement buffered before a lifecycle fence', async () => {
  await startGameMode({ decisions: [], webglSupported: true })
  armGameModeSimulation()
  const initial = readGameFpsSnapshot()

  setGameFpsInput({ forward: 1 })
  setGameFpsInput({ forward: 0 })
  await advanceGameModeSimulationBy(GAME_FPS_FIXED_STEP_SECONDS / 2)
  pauseGameModeSimulation()
  armGameModeSimulation()
  const resumed = await advanceGameModeSimulationBy(GAME_FPS_FIXED_STEP_SECONDS / 2)

  assert.equal(resumed.tick, 1)
  assert.equal(resumed.player.z, initial.player.z)
})

test('Game Mode stages one-shot input across sub-step outer advances exactly once', async () => {
  await startGameMode({ decisions: [], webglSupported: true })
  armGameModeSimulation()
  const initial = readGameFpsSnapshot()

  setGameFpsInput({ lookYawDelta: 0.2 })
  queueGameFpsFire()
  const beforeStep = await advanceGameModeSimulationBy(GAME_FPS_FIXED_STEP_SECONDS / 2)
  assert.equal(beforeStep.tick, 0)
  assert.equal(beforeStep.ammo, initial.ammo)

  const fired = await advanceGameModeSimulationBy(GAME_FPS_FIXED_STEP_SECONDS / 2)
  assert.equal(fired.tick, 1)
  assert.equal(fired.ammo, initial.ammo - 1)
  assert.notEqual(fired.player.yaw, initial.player.yaw)

  reloadGameFpsWeapon()
  await advanceGameModeSimulationBy(GAME_FPS_FIXED_STEP_SECONDS / 2)
  const reloaded = await advanceGameModeSimulationBy(GAME_FPS_FIXED_STEP_SECONDS / 2)
  assert.equal(reloaded.tick, 2)
  assert.equal(reloaded.ammo, initial.ammo)

  const neutral = await advanceGameModeSimulationBy(GAME_FPS_FIXED_STEP_SECONDS)
  assert.equal(neutral.tick, 3)
  assert.equal(neutral.ammo, reloaded.ammo)
  assert.equal(neutral.player.yaw, reloaded.player.yaw)
})

test('Game Mode projects invalid frame deltas as visible runtime failures', async () => {
  await startGameMode({ decisions: [], webglSupported: true })
  armGameModeSimulation()

  await assert.rejects(
    advanceGameModeSimulationBy(Number.NaN),
    /deltaSeconds must be a non-negative finite number/,
  )

  assert.equal(readGameModeSnapshot().launchStatus, 'error')
  assert.equal(readGameModeSnapshot().simulationStatus, 'idle')
  assert.match(readGameFpsSnapshot().runtimeError || '', /deltaSeconds must be a non-negative finite number/)
})

test('Game Mode publishes unexpected simulation-step failures exactly once', async () => {
  await startGameMode({ decisions: [], webglSupported: true })
  armGameModeSimulation()

  const failed = reportGameModeSimulationFailure(new Error('Motion Control conversion failed'))
  assert.equal(failed.launchStatus, 'error')
  assert.equal(failed.simulationStatus, 'idle')
  assert.equal(failed.message, 'Motion Control conversion failed')
  assert.equal(readGameFpsSnapshot().runtimeError, 'Motion Control conversion failed')

  const duplicate = reportGameModeSimulationFailure(new Error('Motion Control conversion failed'))
  assert.equal(duplicate.revision, failed.revision)
})

test('Game Mode desktop lifecycle events fence queued simulation work', async () => {
  const { dom, restore } = initJsdomHarness()
  try {
    await startGameMode({ decisions: [], webglSupported: true })
    const input = installGameFpsDesktopInput(dom.window.document.createElement('canvas'))
    const expectPausedWithoutAdvance = async (dispatch: () => void) => {
      armGameModeSimulation()
      const tick = readGameFpsSnapshot().tick
      const queued = advanceGameModeSimulationBy(0.25)
      dispatch()
      await queued
      assert.equal(readGameModeSnapshot().simulationStatus, 'paused')
      assert.equal(readGameFpsSnapshot().tick, tick)
    }
    await expectPausedWithoutAdvance(() => dom.window.dispatchEvent(new dom.window.Event('blur')))
    await expectPausedWithoutAdvance(() => dom.window.dispatchEvent(new dom.window.Event('resize')))
    await expectPausedWithoutAdvance(() => {
      Object.defineProperty(dom.window.document, 'visibilityState', { configurable: true, value: 'hidden' })
      dom.window.document.dispatchEvent(new dom.window.Event('visibilitychange'))
    })
    await expectPausedWithoutAdvance(() => dom.window.document.dispatchEvent(new dom.window.Event('pointerlockchange')))
    input.dispose()
  } finally {
    restore()
  }
})

test('Game Mode terminal missions leave the running simulation state', async () => {
  await startGameMode({ decisions: [], webglSupported: true })
  armGameModeSimulation()
  for (let index = 0; index < 60 && readGameFpsSnapshot().phase === 'playing'; index += 1) {
    await advanceGameModeSimulationBy(0.25)
  }
  const terminalMission = readGameFpsSnapshot()
  assert.equal(terminalMission.phase, 'lost')
  assert.equal(readGameModeSnapshot().simulationStatus, 'idle')
  assert.equal(readGameModeSnapshot().message, `Deterministic ECS mission lost at tick ${terminalMission.tick}.`)
})

test('Game Mode Stop and Start resume the same in-memory mission', async () => {
  await startGameMode({ decisions: [], webglSupported: true })
  setGameFpsInput({ forward: 1 })
  await advanceGameFpsBy(0.2)
  setGameFpsInput({ forward: 0 })
  const beforeStop = readGameFpsSnapshot()
  assert.ok(beforeStop.tick > 0)
  stopGameMode()
  assert.equal(readGameFpsSnapshot().phase, 'stopped')
  await startGameMode({ webglSupported: true })
  const resumed = readGameFpsSnapshot()
  assert.equal(resumed.phase, 'playing')
  assert.equal(resumed.tick, beforeStop.tick)
  assert.deepEqual(resumed.player, beforeStop.player)
})

test('Game Mode Start stays ready when Stop is followed immediately during an underway tick', async () => {
  await startGameMode({ decisions: [], webglSupported: true })
  const advancing = advanceGameFpsBy(GAME_FPS_FIXED_STEP_SECONDS * 2)
  await Promise.resolve()
  await Promise.resolve()

  stopGameMode()
  const resumedMode = await startGameMode({ webglSupported: true })
  assert.equal(resumedMode.launchStatus, 'ready')
  assert.equal(resumedMode.simulationStatus, 'ready')
  assert.match(resumedMode.message, /resumed at tick 0/)

  const settled = await advancing
  assert.equal(settled.phase, 'playing')
  assert.equal(settled.tick, 1)
  assert.equal(settled.runtimeError, null)
})

test('Game Mode projects a resumed underway tick failure after Stop and immediate Start', async () => {
  await startGameMode({
    decisions: [maximumTickDecision('game-mode:resumed-failure-boundary')],
    webglSupported: true,
  })
  armGameModeSimulation()
  const failingAdvance = advanceGameModeSimulationBy(GAME_FPS_FIXED_STEP_SECONDS)
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()

  stopGameMode()
  const resumed = await startGameMode({ webglSupported: true })
  assert.equal(resumed.launchStatus, 'ready')
  assert.equal(resumed.simulationStatus, 'ready')

  await assert.rejects(failingAdvance, /exhausted its bounded tick range/)
  const mission = readGameFpsSnapshot()
  const mode = readGameModeSnapshot()
  assert.match(mission.runtimeError || '', /exhausted its bounded tick range/)
  assert.equal(mode.launchStatus, 'error')
  assert.equal(mode.simulationStatus, 'idle')
  assert.equal(mode.message, mission.runtimeError)
})

test('Game Mode fences an underway tick failure after the stopped mission is replaced', async () => {
  await startGameMode({
    decisions: [maximumTickDecision('game-mode:replaced-failure-boundary')],
    webglSupported: true,
  })
  armGameModeSimulation()
  const staleAdvance = advanceGameModeSimulationBy(GAME_FPS_FIXED_STEP_SECONDS)
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()

  stopGameMode()
  const replacementMode = await startGameMode({ decisions: [], webglSupported: true })
  const replacementMission = await staleAdvance
  assert.equal(replacementMission.runtimeError, null)
  assert.equal(readGameFpsSnapshot(), replacementMission)
  assert.equal(replacementMode.launchStatus, 'ready')
  assert.equal(replacementMode.simulationStatus, 'ready')
  assert.equal(readGameModeSnapshot().launchStatus, 'ready')
  assert.equal(readGameModeSnapshot().simulationStatus, 'ready')
})

test('Game Mode Open refreshes a stopped authored mission before exposing its overlay', async () => {
  await startGameMode({ decisions: [], webglSupported: true })
  const singapore = readGameFpsSpatialProfile()
  stopGameMode()
  exitGameModeSurface()
  setXrMotionReferenceStage('neutral-volume')
  assert.deepEqual(
    [readGameFpsSpatialProfile().map.halfWidth, readGameFpsSpatialProfile().map.halfDepth],
    [singapore.map.halfWidth, singapore.map.halfDepth],
    'inactive authored changes must leave the stopped mission untouched until Open',
  )
  let profileAtOverlayOpen: ReturnType<typeof readGameFpsSpatialProfile> | null = null
  const unsubscribe = useGraphStore.subscribe((next, previous) => {
    const overlayOpened = next.floatingPanelOpen
      && next.floatingPanelView === 'gameMode'
      && (!previous.floatingPanelOpen || previous.floatingPanelView !== 'gameMode')
    if (overlayOpened && !profileAtOverlayOpen) profileAtOverlayOpen = readGameFpsSpatialProfile()
  })
  try {
    assert.equal(openGameModeSurface({ webglSupported: true }), true)
  } finally {
    unsubscribe()
  }
  assert.ok(profileAtOverlayOpen, 'the Game Mode overlay must be exposed exactly once')
  assert.deepEqual(
    [profileAtOverlayOpen.map.halfWidth, profileAtOverlayOpen.map.halfDepth],
    [8, 6],
    'Open must refresh the authored spatial profile before the FloatingPanel becomes visible',
  )
  assert.equal(readGameFpsSnapshot().tick, 0)
  assert.equal(readGameModeSnapshot().active, true)
})
