import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'
import React from 'react'
import { createRoot } from 'react-dom/client'
import { GameFpsHud } from '@/features/game-fps/GameFpsHud'
import {
  advanceGameFpsBy,
  readGameFpsSpatialProfile,
  readGameFpsSnapshot,
  setGameFpsInput,
} from '@/features/game-fps/gameFpsRuntime'
import {
  advanceGameModeSimulationBy,
  armGameModeSimulation,
  exitGameModeSurface,
  readGameModeSnapshot,
  resetGameModeRuntimeForTests,
  startGameMode,
  stopGameMode,
} from '@/features/game-fps/gameModeRuntime'
import { readGameModeXrSpatialProfile } from '@/features/game-fps/gameModeXrSpatialProfile'
import { isGameFpsPositionValid } from '@/features/game-fps/gameFpsGeometry'
import { GAME_FPS_SHARED_XR_PROFILE_ID } from '@/features/game-fps/gameFpsModel'
import {
  hydrateCanonicalXrPhysicsRuntime,
} from '@/features/three/XrMotionReferenceRuntimeBridge'
import {
  readXrMotionReferenceRuntime,
  restoreXrMotionReferenceRuntimeSnapshot,
  setXrMotionReferenceStage,
} from '@/features/three/xrMotionReferenceRuntime'
import { XR_MOTION_REFERENCE_STAGE_PRESETS } from '@/features/three/xrSceneLibrary'
import { WORKSPACE_RUN_READY_DEMO_ENV } from '@/features/workspace-fs/workspaceRunReadyDemos'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'
import { mountReactRoot, unmountReactRoot } from '@/tests/lib/reactRootHarness'
import { installGameModeRuntimeTestLifecycle } from './helpers/gameModeRuntimeTestLifecycle'

const source = (...parts: string[]) => readFileSync(resolve(process.cwd(), ...parts), 'utf8')

installGameModeRuntimeTestLifecycle('game-mode-spatial-source-runtime')

async function assertRenderedHudRuntimeError(error: RegExp): Promise<void> {
  const { dom, restore } = initJsdomHarness(
    '<!doctype html><html><body><section id="game-fps-hud-root"></section></body></html>',
  )
  const container = dom.window.document.getElementById('game-fps-hud-root')
  if (!container) throw new Error('missing Game FPS HUD test root')
  const root = createRoot(container)
  try {
    await mountReactRoot(root, React.createElement(GameFpsHud), {
      window: dom.window as unknown as Window,
      frames: 1,
    })
    const hud = container.querySelector<HTMLElement>('[data-kg-game-fps-hud="1"]')
    assert.ok(hud)
    assert.match(hud.dataset.kgGameFpsRuntimeError || '', error)
    assert.ok([...container.querySelectorAll('[role="alert"]')].some(alert => error.test(alert.textContent || '')))
  } finally {
    await unmountReactRoot(root, { window: dom.window as unknown as Window })
    restore()
  }
}

test('Game Mode refreshes the XR spatial profile when the authored terrain changes', async () => {
  await startGameMode({ decisions: [], webglSupported: true })
  const singapore = readGameFpsSpatialProfile()
  assert.deepEqual([singapore.map.halfWidth, singapore.map.halfDepth], [16, 12])
  stopGameMode()
  exitGameModeSurface({ restorePreviousSurface: false })
  setXrMotionReferenceStage('neutral-volume')
  hydrateCanonicalXrPhysicsRuntime()
  const neutral = await startGameMode({ webglSupported: true })
  const refreshed = readGameFpsSpatialProfile()
  assert.equal(refreshed.id, GAME_FPS_SHARED_XR_PROFILE_ID)
  assert.deepEqual([refreshed.map.halfWidth, refreshed.map.halfDepth], [8, 6])
  assert.notDeepEqual(refreshed.map.blockers, singapore.map.blockers)
  assert.equal(readGameFpsSnapshot().tick, 0)
  assert.equal(neutral.launchStatus, 'ready')
})

test('Game Mode replaces an incompatible live mission immediately at tick zero', async () => {
  await startGameMode({ decisions: [], webglSupported: true })
  armGameModeSimulation()
  await advanceGameModeSimulationBy(0.2)
  assert.ok(readGameFpsSnapshot().tick > 0)
  setXrMotionReferenceStage('neutral-volume')
  hydrateCanonicalXrPhysicsRuntime()
  assert.equal(readGameFpsSnapshot().tick, 0)
  assert.deepEqual(
    [readGameFpsSpatialProfile().map.halfWidth, readGameFpsSpatialProfile().map.halfDepth],
    [8, 6],
  )
  assert.equal(readGameModeSnapshot().simulationStatus, 'ready')
  assert.match(readGameModeSnapshot().message, /restarted for the xr-authored spatial profile/i)
})

test('Game Mode publishes authored spatial replacement failures through the Game FPS HUD', async () => {
  await startGameMode({ decisions: [], webglSupported: true })
  const motionBeforeFailure = readXrMotionReferenceRuntime()
  const invalidStage = XR_MOTION_REFERENCE_STAGE_PRESETS.find(preset => preset.id === 'neutral-volume')
  assert.ok(invalidStage)
  const originalStage = { sizeMeters: invalidStage.sizeMeters, structures: invalidStage.structures }
  const mutableStage = invalidStage as unknown as {
    sizeMeters: readonly [number, number]
    structures: readonly Readonly<{
      id: string
      position: readonly [number, number, number]
      size: readonly [number, number, number]
      tone: 'light' | 'mid' | 'dark' | 'accent'
      collidable?: boolean
    }>[]
  }
  try {
    mutableStage.sizeMeters = [1, 1]
    mutableStage.structures = [{
      id: 'test-no-spawn-volume', position: [0, 1, 0], size: [10, 2, 10], tone: 'dark',
    }]
    assert.doesNotThrow(() => restoreXrMotionReferenceRuntimeSnapshot({
      ...motionBeforeFailure,
      plan: Object.freeze({ ...motionBeforeFailure.plan, stageId: 'neutral-volume' }),
    }))
    assert.equal(readGameModeSnapshot().launchStatus, 'error')
    assert.equal(readGameModeSnapshot().simulationStatus, 'idle')
    assert.match(readGameModeSnapshot().message, /no valid deterministic Game Mode spawn/i)
    assert.match(readGameFpsSnapshot().runtimeError || '', /no valid deterministic Game Mode spawn/i)
    await assertRenderedHudRuntimeError(/no valid deterministic Game Mode spawn/i)
  } finally {
    resetGameModeRuntimeForTests()
    mutableStage.sizeMeters = originalStage.sizeMeters
    mutableStage.structures = originalStage.structures
    restoreXrMotionReferenceRuntimeSnapshot(motionBeforeFailure)
    hydrateCanonicalXrPhysicsRuntime()
  }
})

test('native tropical Game bounds reuse the centered canonical terrain perimeter', () => {
  const previousDemo = process.env[WORKSPACE_RUN_READY_DEMO_ENV]
  try {
    process.env[WORKSPACE_RUN_READY_DEMO_ENV] = 'xr-physics'
    setXrMotionReferenceStage('tropical-playground')
    hydrateCanonicalXrPhysicsRuntime()
    const profile = readGameModeXrSpatialProfile()
    assert.deepEqual(
      [profile.map.centerX, profile.map.centerZ, profile.map.halfWidth, profile.map.halfDepth],
      [0, 1.1, 15.4, 13.4],
    )
    for (const spawn of [profile.playerSpawn, ...profile.npcSeeds]) {
      assert.equal(isGameFpsPositionValid(spawn, 0.45, profile.map), true)
    }
  } finally {
    if (previousDemo === undefined) delete process.env[WORKSPACE_RUN_READY_DEMO_ENV]
    else process.env[WORKSPACE_RUN_READY_DEMO_ENV] = previousDemo
  }
})

test('every authored XR preset admits collision-free ground-actor spawns', () => {
  for (const preset of XR_MOTION_REFERENCE_STAGE_PRESETS) {
    setXrMotionReferenceStage(preset.id)
    const profile = readGameModeXrSpatialProfile()
    const spawns = [profile.playerSpawn, ...profile.npcSeeds]
    for (const spawn of spawns) {
      assert.equal(
        isGameFpsPositionValid(spawn, 0.45, profile.map),
        true,
        `${preset.id} must not place ${'id' in spawn ? spawn.id : 'player'} inside a blocker`,
      )
    }
    for (let index = 0; index < spawns.length; index += 1) {
      for (let peerIndex = index + 1; peerIndex < spawns.length; peerIndex += 1) {
        const distance = Math.hypot(
          spawns[index].x - spawns[peerIndex].x,
          spawns[index].z - spawns[peerIndex].z,
        )
        assert.ok(distance >= 1.2, `${preset.id} spawn pair ${index}/${peerIndex} must not overlap`)
      }
    }
  }
  setXrMotionReferenceStage('street-grid')
  const street = readGameModeXrSpatialProfile()
  assert.equal(street.map.blockers.some(blocker => (
    ['stage:west-walk', 'stage:east-walk', 'stage:crossing'].includes(blocker.id)
  )), true)
  setXrMotionReferenceStage('aerial-sky')
  const aerial = readGameModeXrSpatialProfile()
  assert.equal(aerial.map.blockers.some(blocker => blocker.id.startsWith('stage:cloud-bank')), true)
  assert.equal(aerial.map.blockers.some(blocker => blocker.id === 'stage:flight-corridor'), true)
  assert.equal(aerial.map.blockers.some(blocker => blocker.id.startsWith('stage:ground-mass')), true)
  assert.equal(new Set(aerial.map.blockers.map(blocker => blocker.id)).size, aerial.map.blockers.length)
})

test('Game Mode panel projects shared owners without a second renderer, world, or save path', () => {
  const panel = source('src', 'features', 'game-fps', 'GameModeFloatingPanelView.tsx')
  const renderer = source('src', 'lib', 'three', 'ThreeGraph.impl.tsx')
  const gameplayProjection = source('src', 'lib', 'three', 'ThreeGameplayOverlay.tsx')
  const missionStage = source('src', 'features', 'game-fps', 'GameFpsMissionStage.tsx')
  const model = source('src', 'features', 'game-fps', 'gameFpsModel.ts')
  const gameRuntime = source('src', 'features', 'game-fps', 'gameFpsRuntime.ts')
  const modeRuntime = source('src', 'features', 'game-fps', 'gameModeRuntime.ts')
  const viewport = source('src', 'components', 'CanvasViewport.tsx')
  const xrRuntime = source('src', 'features', 'canvas', 'XrPhysicsRunReadyDemoRuntime.tsx')
  const hud = source('src', 'features', 'game-fps', 'GameFpsHud.tsx')
  assert.equal(existsSync(resolve(process.cwd(), 'src/features/canvas/GameFpsRunReadyDemoRuntime.tsx')), false)
  assert.equal(existsSync(resolve(process.cwd(), '../docs/workspace-seeds/agenticgraph-game-fps-demo.md')), false)
  assert.equal(panel.includes('<Canvas'), false)
  assert.equal(panel.includes('createGameFpsAuthoredMission'), false)
  assert.match(panel, /GAME_FPS_SAVE_PATH/)
  assert.match(gameplayProjection, /GameFpsMissionStageLazy coordinateScale=\{props\.coordinateScale\}/)
  assert.match(missionStage, /const GAME_FPS_CAMERA_FOV_DEGREES = 60/)
  assert.match(missionStage, /function applyGameFpsCameraOptics\(camera: PerspectiveCamera\): void/)
  assert.match(missionStage, /camera\.updateProjectionMatrix\(\)/)
  assert.match(missionStage, /dataset\.kgGameFpsGroundedCamera = perspectiveCamera\?\.fov === GAME_FPS_CAMERA_FOV_DEGREES \? '1' : '0'/)
  assert.match(renderer, /<XrWorldPlacement[\s\S]*\{gameplayStage\}/)
  assert.match(renderer, /data-kg-authored-xr-scene-retained/)
  assert.match(renderer, /data-kg-game-mode-scene=\{gameMode\.active \? GAME_FPS_SHARED_XR_PROFILE_ID/)
  assert.match(renderer, /const gameFpsStageActive = mode === 'xr' && gameFpsActive\b/)
  assert.match(
    viewport,
    /const \{ citySim, citySimActive, gameFpsActive, flightSimActive \} = useCanvasGameplayOverlayState\(\)/,
  )
  assert.equal(/gameFpsRunReadyDemo\s*\|\|\s*gameMode\.active/.test(`${renderer}\n${viewport}`), false)
  assert.match(renderer, /active=\{active && mode === 'xr' && !gameplayOverlayActive\}/)
  assert.match(renderer, /const rendererLifecycleKey = resolveThreeRendererLifecycleKey\(mode\)/)
  assert.match(viewport, /gameFpsHudVisible \? <GameFpsHudLazy \/>/)
  assert.match(hud, /data-kg-game-fps-action="save"/)
  assert.match(
    hud,
    /resetGameFpsLocalSave\(\)\.then\(result => \{\s*if \(result\.status === 'saved'\) void restartGameMode\(\)/,
    'the Reset action must automatically Restart only after the empty save is verified',
  )
  assert.match(xrRuntime, /pausedForGameplayRef/)
  assert.match(xrRuntime, /pauseXrNativeControllerDemo\(\)/)
  assert.match(xrRuntime, /resumeXrNativeControllerDemo\(\)/)
  const rendererClearOwnership = renderer.match(/const rendererClearColor[\s\S]*?const rendererLifecycleKey/)?.[0] || ''
  assert.notEqual(rendererClearOwnership, '')
  assert.doesNotMatch(rendererClearOwnership, /gameFpsActive/)
  const activationGuardIndex = xrRuntime.indexOf(
    "const activatesXrSurface = state.canvasRenderMode !== '3d' || state.canvas3dMode !== 'xr'",
  )
  const preserveGameplayActivationIndex = xrRuntime.indexOf(
    'activateXrSceneSurface({ preserveGameplay: !dedicatedDemo })',
  )
  const initializedIndex = xrRuntime.indexOf('surfaceInitializedRef.current = true')
  assert.match(
    xrRuntime,
    /if \(\s*activatesXrSurface\s*&& !activateXrSceneSurface\(\{ preserveGameplay: !dedicatedDemo \}\)\s*\)/,
  )
  assert.ok(
    activationGuardIndex >= 0
    && preserveGameplayActivationIndex > activationGuardIndex
    && initializedIndex > preserveGameplayActivationIndex,
  )

  const productionSources = [missionStage, model, gameRuntime, modeRuntime, renderer]
  for (const forbiddenMarker of [
    'GameFpsArenaEnvironment',
    'kg_game_fps_arena',
    'GAME_FPS_MAP',
    'GAME_FPS_ARENA_SPATIAL_PROFILE',
    'game-arena',
    'gameModeSceneComposition',
  ]) {
    assert.equal(
      productionSources.some(productionSource => productionSource.includes(forbiddenMarker)),
      false,
      `Game Mode production source must forbid ${forbiddenMarker}`,
    )
  }
})
