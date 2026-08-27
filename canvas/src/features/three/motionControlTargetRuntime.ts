import {
  XR_ANIMATION_PRESETS,
  xrAnimationPresetCompatible,
} from './xrAnimationCatalog'
import {
  buildXrAnimationInvocation,
  buildXrAnimationTransportInvocation,
  inspectLocalAnimation,
} from './xrAnimationMcpRuntime'
import { buildXrPhysicsInvocation } from './xrSceneMcpContract.mjs'
import { inspectLocalXrSceneAssets } from './xrSceneMcpRuntime'
import { readXrPhysicsRuntime, type XrPhysicsRuntimeSnapshot } from './xrPhysicsRuntime'
import type { XrMotionReferenceSubject } from './xrMotionReferenceModel'
import { readXrMotionReferenceRuntime } from './xrMotionReferenceRuntime'
import { readBoundXrSelectedActorId } from './xrSelectedActorBinding'
import { resolveXrSceneLibraryAsset } from './xrSceneLibrary'
import { MOTION_CONTROL_SURFACE_CATALOG } from './motionControlSurfaceRuntime'
import { buildGameModeInvocation } from '@/features/game-fps/gameModeMcpRuntime'
import { GAME_MODE_WEB_MCP_TOOL_IDS } from '@/features/game-fps/gameModeMcpContract.mjs'
import { readGameModeSnapshot } from '@/features/game-fps/gameModeRuntime'
import { readGameFpsSnapshot } from '@/features/game-fps/gameFpsRuntime'

type AuthoredSubjectIdentity = Pick<XrMotionReferenceSubject, 'id' | 'assetId' | 'category' | 'label'>
type PhysicsBodyIdentity = Pick<XrPhysicsRuntimeSnapshot['world']['bodies'][number], 'subjectId' | 'mode'>

export function buildMotionControlObjectIdentification(input: Readonly<{
  subjects: readonly AuthoredSubjectIdentity[]
  selectedSubjectId: string
  physicsBodies: readonly PhysicsBodyIdentity[]
}>) {
  const physicsBodies = new Map(input.physicsBodies.map(body => [body.subjectId, body]))
  const records = Object.freeze(input.subjects.map(subject => {
    const asset = resolveXrSceneLibraryAsset(subject.assetId)
    const body = physicsBodies.get(subject.id)
    return Object.freeze({
      id: subject.id,
      label: subject.label,
      category: subject.category,
      assetLabel: asset.label,
      catalogDimensionsMeters: Object.freeze([...asset.dimensionsMeters]) as readonly [number, number, number],
      selected: subject.id === input.selectedSubjectId,
      physicsBodyAttached: Boolean(body),
      physicsBodyMode: body?.mode || 'none' as const,
    })
  }))
  return Object.freeze({
    records,
    counts: Object.freeze({
      total: records.length,
      selected: records.filter(record => record.selected).length,
      physicsAttached: records.filter(record => record.physicsBodyAttached).length,
    }),
  })
}

export function buildMotionControlXrControllerInvocation(controller: Readonly<{
  mode: 'ball' | 'rocket'
  phase: 'off' | 'ready' | 'running' | 'paused'
}>): string {
  return controller.phase === 'off'
    ? buildXrPhysicsInvocation('controller', 'develop-run', { mode: controller.mode })
    : buildXrPhysicsInvocation('controller', 'reset')
}

export function buildMotionControlAnimationTarget(input: Readonly<{
  actorId: string
  label: string
  livePoseCompatible: boolean
  assignedPresetId: string
  recommendedPresetId: string
}>) {
  return Object.freeze({
    ...input,
    compatible: Boolean(input.actorId && (input.assignedPresetId || input.recommendedPresetId)),
  })
}

export function inspectMotionControlTargets() {
  const runtime = readXrMotionReferenceRuntime()
  const scene = inspectLocalXrSceneAssets()
  const physics = readXrPhysicsRuntime()
  const animation = inspectLocalAnimation()
  const gameMode = readGameModeSnapshot()
  const gameMission = readGameFpsSnapshot()
  const controller = scene.physics.controllerDemo
  const actorId = readBoundXrSelectedActorId()
  const track = runtime.plan.cast.find(candidate => candidate.actorId === actorId)
  const subject = runtime.plan.subjects.find(candidate => candidate.id === actorId)
  const selectedAsset = subject ? resolveXrSceneLibraryAsset(subject.assetId) : null
  const humanoidCompatible = Boolean(track && (!selectedAsset || selectedAsset.shape === 'humanoid'))
  const compatiblePreset = track
    ? XR_ANIMATION_PRESETS.find(preset => xrAnimationPresetCompatible({
      preset,
      assetId: subject?.assetId,
      category: subject?.category,
      graphActor: !subject,
    }))
    : null
  const assignedPreset = track?.animation
    ? XR_ANIMATION_PRESETS.find(preset => preset.id === track.animation?.presetId)
    : null
  const animationPreset = assignedPreset || compatiblePreset
  const animationTarget = buildMotionControlAnimationTarget({
    actorId,
    label: subject?.label || track?.label || '',
    livePoseCompatible: humanoidCompatible,
    assignedPresetId: assignedPreset?.id || '',
    recommendedPresetId: compatiblePreset?.id || '',
  })
  const objectIdentification = buildMotionControlObjectIdentification({
    subjects: runtime.plan.subjects,
    selectedSubjectId: runtime.selectedShotTargetId,
    physicsBodies: physics.world.bodies,
  })
  return {
    selectedHumanoid: {
      actorId,
      label: subject?.label || track?.label || '',
      compatible: humanoidCompatible,
      assignedPresetId: track?.animation?.presetId || '',
    },
    surfaces: {
      xr3d: {
        ...MOTION_CONTROL_SURFACE_CATALOG['xr-3d'],
        sceneReady: scene.sceneReady,
        subjectCount: objectIdentification.counts.total,
        objectIdentification,
        controllerMode: controller.mode,
        controllerPhase: controller.phase,
        invocation: buildMotionControlXrControllerInvocation(controller),
        webMcpTool: scene.webMcpTools.control,
      },
      animation: {
        ...MOTION_CONTROL_SURFACE_CATALOG.animation,
        sceneReady: animation.sceneReady,
        selectedTarget: animationTarget,
        invocation: animationPreset
          ? buildXrAnimationInvocation(animationPreset.id)
          : buildXrAnimationTransportInvocation('play'),
        webMcpTool: animation.webMcpTools.control,
      },
      gameMode: {
        ...MOTION_CONTROL_SURFACE_CATALOG['game-mode'],
        active: gameMode.active,
        surfaceMode: gameMode.surfaceMode,
        simulationStatus: gameMode.simulationStatus,
        phase: gameMission.phase,
        enemiesAlive: gameMission.enemiesAlive,
        invocation: buildGameModeInvocation(gameMode.active ? 'restart' : 'start'),
        webMcpTool: `agenticgraph.${GAME_MODE_WEB_MCP_TOOL_IDS.control}`,
      },
    },
  }
}
