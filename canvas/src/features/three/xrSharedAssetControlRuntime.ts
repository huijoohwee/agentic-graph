import { useGraphStore } from '@/hooks/useGraphStore'
import {
  XR_MOTION_REFERENCE_GRAPH_METADATA_KEY,
  serializeXrMotionReferencePlan,
  type XrMotionReferenceMark,
  type XrMotionReferenceVector,
} from './xrMotionReferenceModel'
import {
  ensureXrMotionReferenceCastTrackForSubject,
  markXrMotionReferenceSaved,
  readXrMotionReferenceRuntime,
  restoreXrMotionReferenceRuntimeSnapshot,
  selectXrMotionReferenceCastMark,
  setXrMotionReferenceCastMarkArmed,
  setXrMotionReferencePlayhead,
  type XrMotionReferenceRuntimeSnapshot,
} from './xrMotionReferenceRuntime'
import {
  hydrateCanonicalXrMotionReferenceRuntime,
  hydrateCanonicalXrPhysicsRuntime,
} from './XrMotionReferenceRuntimeBridge'
import { readXrSceneDocumentReady } from './xrSceneDocumentReadiness'
import {
  XR_ANIMATION_PRESETS,
  isXrAnimationPresetId,
  resolveXrAnimationPreset,
  xrAnimationPresetCompatible,
  type XrAnimationPreset,
  type XrAnimationPresetId,
} from './xrAnimationCatalog'
import { updateXrAnimationAssignment } from './xrAnimationAssignmentRuntime'
import { applyXrConstrainedCastMarkChoreography } from './xrConstrainedCastMarkRuntime'
import { motionControlPoseToAnimationPose } from './motionControlPose'
import { readMotionControlSnapshot } from './motionControlRuntime'
import { readBoundXrSelectedActorId, selectBoundXrActor, selectBoundXrShotTarget } from './xrSelectedActorBinding'
import { buildXrShotTargets, resolveXrShotTarget } from './xrShotTargets'
import { resolveXrSceneLibraryAsset } from './xrSceneLibrary'
import { xrMotionReferenceTimelineDocumentKey } from './xrMotionReferenceTimeline'
import { requestXrMotionReferenceCameraPlaybackReapply } from './xrCameraPlaybackControlsRuntime'
import { readGameFpsSnapshot } from '@/features/game-fps/gameFpsRuntime'
import type { XrNativeControllerInput } from './xrNativeControllerInput'
import {
  THREE_KEYBOARD_MAX_FRAME_DELTA_MS,
  THREE_OBJECT_KEYBOARD_FINE_SPEED_METERS_PER_SECOND,
  THREE_OBJECT_KEYBOARD_SPEED_METERS_PER_SECOND,
} from './threeKeyboardChoreography'
import { readXrPhysicsRuntime, readXrPhysicsRuntimeFrame } from './xrPhysicsRuntime'
import { resolveXrSubjectMotion } from './xrSubjectMotionConstraints'

export const XR_SHARED_ASSET_CONTROL_SCHEMA = 'agenticgraph-xr-shared-asset-controls/v1' as const
export type XrSharedAssetControlSurface = 'media' | 'motion-control' | 'timeline' | 'game-mode'
export type XrSharedAssetControlOperation =
  | 'select-target'
  | 'apply-animation'
  | 'clear-animation'
  | 'arm-gesture-mark'
  | 'disarm-gesture-mark'
  | 'capture-hand-pose'
  | 'play-timeline'
  | 'pause-timeline'
  | 'scrub-timeline'

export type XrSharedAssetControlTarget = Readonly<{
  id: string
  label: string
  kind: 'scene' | 'object' | 'npc'
  castActorId: string
}>

export type XrSharedAssetControlSnapshot = Readonly<{
  schema: typeof XR_SHARED_ASSET_CONTROL_SCHEMA
  sceneReady: boolean
  selectedTargetId: string
  selectedActorId: string
  selectedLabel: string
  selectedKind: 'scene' | 'object' | 'npc'
  targetCount: number
  subjectCount: number
  castCount: number
  gameplayNpcCount: number
  targets: readonly XrSharedAssetControlTarget[]
  compatiblePresetIds: readonly XrAnimationPresetId[]
  assignedPresetId: XrAnimationPresetId | ''
  assignedPresetKind: XrAnimationPreset['kind'] | ''
  recommendedPresetId: XrAnimationPresetId | ''
  livePoseEligible: boolean
  livePoseActive: boolean
  selectedMarkId: string
  castMarkArmed: boolean
  playheadSeconds: number
  durationSeconds: number
  timelinePlaying: boolean
  revision: number
}>

export type XrSharedAssetControlInput = Readonly<{
  operation: XrSharedAssetControlOperation
  presetId?: string
  targetId?: string
  timeSeconds?: number
}>

export type XrSharedAssetControlResult = Readonly<{
  ok: boolean
  message: string
  operation: XrSharedAssetControlOperation
  targetId?: string
  presetId?: string
  snapshot: XrSharedAssetControlSnapshot
}>

export type XrSharedObjectControllerMotionTarget = Readonly<{
  actorId: string
  changed: boolean
  markId: string
  nextPosition: XrMotionReferenceVector
  ownerId: string
  source: XrNativeControllerInput['source']
}>

export type XrSharedObjectControllerMotionResult = Readonly<{
  applied: boolean
  reason: 'applied' | 'inactive' | 'invalid-mark' | 'physics-owned' | 'obstructed' | 'unchanged'
  target: XrSharedObjectControllerMotionTarget | null
}>

type RuntimeListener = () => void

type XrSharedGameplayNpcControlSnapshot = Readonly<{
  assignedPresetId: XrAnimationPresetId | ''
  gestureArmed: boolean
  handPoseActive: boolean
  selected: boolean
}>

type XrSharedGameplayNpcControlState = Readonly<{
  selectedNpcId: string
  gestureNpcId: string
  animationPresetByNpcId: Readonly<Record<string, XrAnimationPresetId>>
  handPoseNpcIds: readonly string[]
  revision: number
}>

const listeners = new Set<RuntimeListener>()
const XR_SHARED_OBJECT_CONTROLLER_DEAD_ZONE = 0.04
let sharedMotionSceneKey = ''
let sharedMotionTargetId = ''
let gameplayNpcState: XrSharedGameplayNpcControlState = Object.freeze({
  selectedNpcId: '',
  gestureNpcId: '',
  animationPresetByNpcId: Object.freeze({}),
  handPoseNpcIds: Object.freeze([]),
  revision: 0,
})

function publishGameplayNpcState(update: Partial<Omit<XrSharedGameplayNpcControlState, 'revision'>>): XrSharedGameplayNpcControlState {
  gameplayNpcState = Object.freeze({
    ...gameplayNpcState,
    ...update,
    revision: gameplayNpcState.revision + 1,
  })
  for (const listener of [...listeners]) listener()
  return gameplayNpcState
}

export function subscribeXrSharedAssetControlRuntime(listener: RuntimeListener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function readXrSharedAssetControlRevision(): number {
  return gameplayNpcState.revision
}

export function readXrSharedAssetGameplayNpcControl(npcIdValue: string): XrSharedGameplayNpcControlSnapshot {
  const npcId = String(npcIdValue || '').trim()
  return Object.freeze({
    assignedPresetId: gameplayNpcState.animationPresetByNpcId[npcId] || '',
    gestureArmed: gameplayNpcState.gestureNpcId === npcId,
    handPoseActive: gameplayNpcState.handPoseNpcIds.includes(npcId),
    selected: gameplayNpcState.selectedNpcId === npcId,
  })
}

function gameplayNpcIds(): Set<string> {
  return new Set(readGameFpsSnapshot().npcs.map(npc => npc.id))
}

function buildGameplayNpcTargets(existingTargetIds: ReadonlySet<string>): readonly XrSharedAssetControlTarget[] {
  const mission = readGameFpsSnapshot()
  return Object.freeze(mission.npcs
    .filter(npc => !existingTargetIds.has(npc.id))
    .map(npc => Object.freeze({
      id: npc.id,
      label: `${npc.id} · ${npc.action} · ${Math.round(npc.health)} HP`,
      kind: 'npc' as const,
      castActorId: '',
    })))
}

function buildSharedAssetTargets(runtime: XrMotionReferenceRuntimeSnapshot): readonly XrSharedAssetControlTarget[] {
  const authoredTargets = buildXrShotTargets(runtime.plan).map(target => Object.freeze({
    id: target.id,
    label: target.label,
    kind: target.kind,
    castActorId: target.castActorId || '',
  }))
  const authoredTargetIds = new Set(authoredTargets.map(target => target.id))
  return Object.freeze([
    ...authoredTargets,
    ...buildGameplayNpcTargets(authoredTargetIds),
  ])
}

function resolveSharedAssetTarget(runtime: XrMotionReferenceRuntimeSnapshot, targetIdValue: string): XrSharedAssetControlTarget | null {
  const targetId = String(targetIdValue || '').trim()
  if (!targetId) return null
  return buildSharedAssetTargets(runtime).find(target => target.id === targetId) || null
}

function selectGameplayNpcTarget(targetId: string): XrSharedGameplayNpcControlState {
  const npcId = String(targetId || '').trim()
  if (!gameplayNpcIds().has(npcId)) return gameplayNpcState
  if (gameplayNpcState.selectedNpcId === npcId) return gameplayNpcState
  return publishGameplayNpcState({ selectedNpcId: npcId })
}

function clearGameplayNpcTargetSelection(): void {
  if (!gameplayNpcState.selectedNpcId) return
  publishGameplayNpcState({ selectedNpcId: '' })
}

function releaseStaleSharedMotionFocus(): void {
  if (typeof document === 'undefined') return
  const activeElement = document.activeElement
  if (activeElement instanceof HTMLElement && activeElement !== document.body) {
    activeElement.blur()
  }
}

function updateGameplayNpcAnimation(targetId: string, presetId: XrAnimationPresetId | ''): XrSharedGameplayNpcControlState {
  const nextAssignments = { ...gameplayNpcState.animationPresetByNpcId }
  if (presetId) nextAssignments[targetId] = presetId
  else delete nextAssignments[targetId]
  return publishGameplayNpcState({ animationPresetByNpcId: Object.freeze(nextAssignments) })
}

function updateGameplayNpcHandPose(targetId: string, enabled: boolean): XrSharedGameplayNpcControlState {
  const nextIds = new Set(gameplayNpcState.handPoseNpcIds)
  if (enabled) nextIds.add(targetId)
  else nextIds.delete(targetId)
  return publishGameplayNpcState({ handPoseNpcIds: Object.freeze([...nextIds]) })
}

function compatibleGameplayNpcPresets(): readonly XrAnimationPreset[] {
  return XR_ANIMATION_PRESETS.filter(preset => preset.kind === 'character-motion')
}

function resolveGameplayNpcPreset(presetIdValue = ''): XrAnimationPreset | null {
  const compatible = compatibleGameplayNpcPresets()
  if (presetIdValue && isXrAnimationPresetId(presetIdValue)) {
    const preset = resolveXrAnimationPreset(presetIdValue)
    return compatible.some(candidate => candidate.id === preset.id) ? preset : null
  }
  return compatible[0] || null
}

function controlGameplayNpcTarget(
  target: XrSharedAssetControlTarget,
  input: XrSharedAssetControlInput,
): XrSharedAssetControlResult {
  selectGameplayNpcTarget(target.id)
  if (input.operation === 'apply-animation') {
    const preset = resolveGameplayNpcPreset(input.presetId)
    if (!preset) {
      return {
        ok: false,
        message: `${target.id} only accepts character-motion presets.`,
        operation: input.operation,
        targetId: target.id,
        snapshot: inspectXrSharedAssetControls(),
      }
    }
    updateGameplayNpcAnimation(target.id, preset.id)
    return {
      ok: true,
      message: `${preset.label} applied to ${target.id}.`,
      operation: input.operation,
      targetId: target.id,
      presetId: preset.id,
      snapshot: inspectXrSharedAssetControls(),
    }
  }
  if (input.operation === 'clear-animation') {
    updateGameplayNpcAnimation(target.id, '')
    updateGameplayNpcHandPose(target.id, false)
    return {
      ok: true,
      message: `Animation cleared from ${target.id}.`,
      operation: input.operation,
      targetId: target.id,
      snapshot: inspectXrSharedAssetControls(),
    }
  }
  if (input.operation === 'arm-gesture-mark' || input.operation === 'disarm-gesture-mark') {
    publishGameplayNpcState({ gestureNpcId: input.operation === 'arm-gesture-mark' ? target.id : '' })
    return {
      ok: true,
      message: `${target.id} gesture capture ${input.operation === 'arm-gesture-mark' ? 'armed' : 'disarmed'}.`,
      operation: input.operation,
      targetId: target.id,
      snapshot: inspectXrSharedAssetControls(),
    }
  }
  if (input.operation === 'capture-hand-pose') {
    if (gameplayNpcState.gestureNpcId !== target.id) {
      return {
        ok: false,
        message: `Arm ${target.id} before capturing a hand pose.`,
        operation: input.operation,
        targetId: target.id,
        snapshot: inspectXrSharedAssetControls(),
      }
    }
    if (!motionControlPoseToAnimationPose(readMotionControlSnapshot().pose)) {
      return {
        ok: false,
        message: 'Start Motion Control before capturing a gameplay NPC hand pose.',
        operation: input.operation,
        targetId: target.id,
        snapshot: inspectXrSharedAssetControls(),
      }
    }
    updateGameplayNpcHandPose(target.id, true)
    return {
      ok: true,
      message: `Captured live hand pose on ${target.id}.`,
      operation: input.operation,
      targetId: target.id,
      snapshot: inspectXrSharedAssetControls(),
    }
  }
  return {
    ok: false,
    message: `${target.id} is a gameplay NPC target; select, mark, hand pose, clear, or apply character motion.`,
    operation: input.operation,
    targetId: target.id,
    snapshot: inspectXrSharedAssetControls(),
  }
}

export function applyXrTimelineCastAnimationPreset(input: Readonly<{
  targetId: string
  presetId: string
}>): XrSharedAssetControlResult {
  const before = readXrMotionReferenceRuntime()
  const actorId = selectedActorId(before, input.targetId)
  const preset = resolvePresetForApply(before, actorId, input.presetId)
  if (!actorId || !preset) {
    return {
      ok: false,
      message: 'Select an animatable 3D for XR object, subject, or prop first.',
      operation: 'apply-animation',
      targetId: actorId,
      snapshot: inspectXrSharedAssetControls(),
    }
  }
  const prepared = ensureSharedMotionTrack(before, actorId)
  const track = castTrack(prepared, actorId)
  if (!track) {
    return {
      ok: false,
      message: 'The selected 3D for XR object could not be readied for motion control.',
      operation: 'apply-animation',
      targetId: actorId,
      snapshot: inspectXrSharedAssetControls(),
    }
  }
  if (!persistPromotedSharedMotionTrack(before, actorId)) {
    return {
      ok: false,
      message: 'The selected 3D for XR object could not be written to graph metadata.',
      operation: 'apply-animation',
      targetId: actorId,
      presetId: preset.id,
      snapshot: inspectXrSharedAssetControls(),
    }
  }
  const readyBefore = readXrMotionReferenceRuntime()
  const assignment = updateXrAnimationAssignment({
    operation: 'apply',
    presetId: preset.id,
    targetId: actorId,
    trackKind: preset.kind,
  })
  if (!assignment.ok) {
    return {
      ok: false,
      message: assignment.message,
      operation: 'apply-animation',
      targetId: actorId,
      presetId: preset.id,
      snapshot: inspectXrSharedAssetControls(),
    }
  }
  if (!persistMotionPlan(readyBefore)) {
    return {
      ok: false,
      message: 'The timeline XR animation could not be written to graph metadata.',
      operation: 'apply-animation',
      targetId: actorId,
      presetId: preset.id,
      snapshot: inspectXrSharedAssetControls(),
    }
  }
  if (assignment.positionMarksChanged) hydrateCanonicalXrPhysicsRuntime()
  selectBoundXrActor(actorId)
  return {
    ok: true,
    message: assignment.message,
    operation: 'apply-animation',
    targetId: actorId,
    presetId: preset.id,
    snapshot: inspectXrSharedAssetControls(),
  }
}

function hydrateSharedXrControls(): boolean {
  if (!readXrSceneDocumentReady() || !hydrateCanonicalXrMotionReferenceRuntime()) return false
  hydrateCanonicalXrPhysicsRuntime()
  return true
}

function persistMotionPlan(previousRuntime: XrMotionReferenceRuntimeSnapshot): boolean {
  const state = useGraphStore.getState()
  const serialized = serializeXrMotionReferencePlan(readXrMotionReferenceRuntime().plan)
  state.updateGraphMetadata({ [XR_MOTION_REFERENCE_GRAPH_METADATA_KEY]: serialized })
  const saved = useGraphStore.getState().graphData?.metadata?.[XR_MOTION_REFERENCE_GRAPH_METADATA_KEY]
  if (saved === serialized) {
    markXrMotionReferenceSaved(serialized)
    return true
  }
  restoreXrMotionReferenceRuntimeSnapshot(previousRuntime)
  return false
}

function selectedActorId(runtime: XrMotionReferenceRuntimeSnapshot, targetIdValue = ''): string {
  const targetId = String(targetIdValue || '').trim()
  const sharedTarget = resolveSharedAssetTarget(runtime, targetId)
  if (sharedTarget?.kind === 'npc') return ''
  const target = targetId ? resolveXrShotTarget(runtime.plan, targetId) : null
  if (target?.castActorId) return target.castActorId
  if (target?.kind === 'object' && runtime.plan.subjects.some(subject => subject.id === target.id)) return target.id
  if (targetId && runtime.plan.cast.some(track => track.actorId === targetId)) return targetId
  return readBoundXrSelectedActorId()
}

function castTrack(runtime: XrMotionReferenceRuntimeSnapshot, actorId: string) {
  return runtime.plan.cast.find(track => track.actorId === actorId) || null
}

function ensureSharedMotionTrack(runtime: XrMotionReferenceRuntimeSnapshot, actorId: string): XrMotionReferenceRuntimeSnapshot {
  if (!actorId || runtime.plan.cast.some(track => track.actorId === actorId)) return runtime
  if (!runtime.plan.subjects.some(subject => subject.id === actorId)) return runtime
  return ensureXrMotionReferenceCastTrackForSubject(actorId)
}

function persistPromotedSharedMotionTrack(previousRuntime: XrMotionReferenceRuntimeSnapshot, actorId: string): boolean {
  const runtime = readXrMotionReferenceRuntime()
  if (runtime === previousRuntime || !runtime.plan.cast.some(track => track.actorId === actorId)) return true
  return persistMotionPlan(previousRuntime)
}

function compatibleAnimationPresets(runtime: XrMotionReferenceRuntimeSnapshot, actorId: string): readonly XrAnimationPreset[] {
  const track = castTrack(runtime, actorId)
  const subject = runtime.plan.subjects.find(candidate => candidate.id === actorId)
  if (!track && !subject) return []
  return XR_ANIMATION_PRESETS.filter(preset => xrAnimationPresetCompatible({
    preset,
    assetId: subject?.assetId,
    category: subject?.category,
    graphActor: !subject,
  }))
}

function compatibleSharedTargetPresets(
  runtime: XrMotionReferenceRuntimeSnapshot,
  selectedTarget: XrSharedAssetControlTarget | undefined,
  actorId: string,
): readonly XrAnimationPreset[] {
  if (selectedTarget?.kind === 'npc') return compatibleGameplayNpcPresets()
  return compatibleAnimationPresets(runtime, actorId)
}

function selectedOrNearestCastMark(runtime: XrMotionReferenceRuntimeSnapshot, actorId: string): XrMotionReferenceMark | null {
  const track = castTrack(runtime, actorId)
  if (!track) return null
  if (runtime.selectedMark?.kind === 'cast' && runtime.selectedMark.actorId === actorId) {
    return track.marks.find(mark => mark.id === runtime.selectedMark?.markId) || null
  }
  return track.marks.reduce<XrMotionReferenceMark | null>((closest, mark) => {
    if (!closest) return mark
    return Math.abs(mark.timeSeconds - runtime.playheadSeconds) < Math.abs(closest.timeSeconds - runtime.playheadSeconds)
      ? mark
      : closest
  }, null)
}

function resolvePresetForApply(runtime: XrMotionReferenceRuntimeSnapshot, actorId: string, presetIdValue = ''): XrAnimationPreset | null {
  const compatible = compatibleAnimationPresets(runtime, actorId)
  if (presetIdValue && isXrAnimationPresetId(presetIdValue)) {
    const preset = resolveXrAnimationPreset(presetIdValue)
    return compatible.some(candidate => candidate.id === preset.id) ? preset : null
  }
  return compatible[0] || null
}

function timelineDocumentKey(): string {
  return xrMotionReferenceTimelineDocumentKey(useGraphStore.getState().markdownDocumentName)
}

function controllerMotionVector(input: XrNativeControllerInput): Readonly<{
  direction: readonly [number, number]
  magnitude: number
}> | null {
  if (input.source === 'none') return null
  const moveX = Number(input.moveX)
  const moveZ = Number(input.moveZ)
  const magnitude = Math.hypot(moveX, moveZ)
  if (!Number.isFinite(magnitude) || magnitude <= XR_SHARED_OBJECT_CONTROLLER_DEAD_ZONE) return null
  return Object.freeze({
    direction: Object.freeze([moveX / magnitude, moveZ / magnitude] as const),
    magnitude: Math.min(1, magnitude),
  })
}

export function readXrSharedMotionTargetId(): string {
  return sharedMotionTargetId
}

export function selectedXrSharedObjectMotionControlActive(
  runtime: XrMotionReferenceRuntimeSnapshot = readXrMotionReferenceRuntime(),
): boolean {
  const target = selectedOrNearestCastMark(runtime, selectedActorId(runtime))
  if (!target) return false
  if (runtime.selectedMark?.kind === 'cast') return true
  return Boolean(sharedMotionTargetId
    && sharedMotionSceneKey === runtime.sceneKey
    && runtime.selectedShotTargetId === sharedMotionTargetId)
}

export function resolveXrSharedObjectControllerMotionTarget(input: Readonly<{
  controllerInput: XrNativeControllerInput
  deltaSeconds: number
  runtime: XrMotionReferenceRuntimeSnapshot
}>): XrSharedObjectControllerMotionTarget | null {
  if (!selectedXrSharedObjectMotionControlActive(input.runtime)) return null
  const actorId = selectedActorId(input.runtime)
  const mark = selectedOrNearestCastMark(input.runtime, actorId)
  const vector = controllerMotionVector(input.controllerInput)
  if (!actorId || !mark || !vector) return null
  const boundedDeltaSeconds = Math.max(
    0,
    Math.min(THREE_KEYBOARD_MAX_FRAME_DELTA_MS / 1000, Number(input.deltaSeconds) || 0),
  )
  if (boundedDeltaSeconds <= 0) return null
  const speed = input.controllerInput.modifier
    ? THREE_OBJECT_KEYBOARD_FINE_SPEED_METERS_PER_SECOND
    : THREE_OBJECT_KEYBOARD_SPEED_METERS_PER_SECOND
  const distanceMeters = speed * boundedDeltaSeconds * vector.magnitude
  if (distanceMeters <= 0) return null
  const desiredPosition: XrMotionReferenceVector = Object.freeze([
    mark.position[0] + vector.direction[0] * distanceMeters,
    mark.position[1],
    mark.position[2] + vector.direction[1] * distanceMeters,
  ] as const)
  const physics = readXrPhysicsRuntime()
  const motion = resolveXrSubjectMotion({
    actorId,
    desiredPosition,
    markId: mark.id,
    physics,
    physicsFrame: physics.phase === 'stopped' ? undefined : readXrPhysicsRuntimeFrame(),
    plan: input.runtime.plan,
    position: mark.position,
    timeSeconds: mark.timeSeconds,
  })
  if (motion.status === 'physics-owned' || motion.status === 'obstructed') return null
  const nextPosition = motion.position
  return Object.freeze({
    actorId,
    changed: nextPosition.some((value, index) => value !== mark.position[index]),
    markId: mark.id,
    nextPosition,
    ownerId: `xr:shared-object-motion:${actorId}:${mark.id}`,
    source: input.controllerInput.source,
  })
}

export function applyXrSharedObjectControllerMotionTarget(
  target: XrSharedObjectControllerMotionTarget,
): XrSharedObjectControllerMotionResult {
  if (!target.changed) return Object.freeze({ applied: false, reason: 'unchanged', target })
  const result = applyXrConstrainedCastMarkChoreography({
    actorId: target.actorId,
    markId: target.markId,
    position: target.nextPosition,
  })
  return Object.freeze({
    applied: result.applied,
    reason: result.reason,
    target,
  })
}

export function applyXrSharedObjectControllerMotion(input: Readonly<{
  controllerInput: XrNativeControllerInput
  deltaSeconds: number
  runtime?: XrMotionReferenceRuntimeSnapshot
}>): XrSharedObjectControllerMotionResult {
  const target = resolveXrSharedObjectControllerMotionTarget({
    controllerInput: input.controllerInput,
    deltaSeconds: input.deltaSeconds,
    runtime: input.runtime || readXrMotionReferenceRuntime(),
  })
  return target
    ? applyXrSharedObjectControllerMotionTarget(target)
    : Object.freeze({ applied: false, reason: 'inactive', target: null })
}

export function inspectXrSharedAssetControls(): XrSharedAssetControlSnapshot {
  const runtime = readXrMotionReferenceRuntime()
  const sceneReady = readXrSceneDocumentReady()
  const targets = buildSharedAssetTargets(runtime)
  const actorId = selectedActorId(runtime)
  const selectedGameplayNpcTarget = gameplayNpcState.selectedNpcId
    ? targets.find(target => target.kind === 'npc' && target.id === gameplayNpcState.selectedNpcId)
    : undefined
  const selectedTarget = selectedGameplayNpcTarget
    || targets.find(target => target.id === runtime.selectedShotTargetId)
    || targets.find(target => target.id === actorId)
    || targets[0]
  const selectedTargetId = selectedTarget?.id || ''
  const subject = runtime.plan.subjects.find(candidate => candidate.id === actorId)
  const track = castTrack(runtime, actorId)
  const gameplayNpcAssignedPresetId = selectedTarget?.kind === 'npc'
    ? gameplayNpcState.animationPresetByNpcId[selectedTarget.id] || ''
    : ''
  const assignedPreset = gameplayNpcAssignedPresetId
    ? resolveXrAnimationPreset(gameplayNpcAssignedPresetId)
    : track?.animation ? resolveXrAnimationPreset(track.animation.presetId) : null
  const compatible = compatibleSharedTargetPresets(runtime, selectedTarget, actorId)
  const recommendedPreset = compatible.find(preset => preset.id !== assignedPreset?.id) || compatible[0] || null
  const selectedAsset = subject ? resolveXrSceneLibraryAsset(subject.assetId) : null
  const motionPose = motionControlPoseToAnimationPose(readMotionControlSnapshot().pose)
  const mark = actorId ? selectedOrNearestCastMark(runtime, actorId) : null
  const state = useGraphStore.getState()
  const selectedNpcHandPoseActive = selectedTarget?.kind === 'npc'
    && gameplayNpcState.handPoseNpcIds.includes(selectedTarget.id)
  const selectedNpcGestureArmed = selectedTarget?.kind === 'npc'
    && gameplayNpcState.gestureNpcId === selectedTarget.id
  return Object.freeze({
    schema: XR_SHARED_ASSET_CONTROL_SCHEMA,
    sceneReady,
    selectedTargetId,
    selectedActorId: selectedTarget?.kind === 'npc' ? '' : actorId,
    selectedLabel: selectedTarget?.kind === 'npc' ? selectedTarget.label : subject?.label || track?.label || selectedTarget?.label || 'Scene',
    selectedKind: selectedTarget?.kind || 'scene',
    targetCount: targets.length,
    subjectCount: runtime.plan.subjects.length,
    castCount: runtime.plan.cast.length,
    gameplayNpcCount: targets.filter(target => target.kind === 'npc').length,
    targets: Object.freeze(targets.map(target => Object.freeze({
      id: target.id,
      label: target.label,
      kind: target.kind,
      castActorId: target.castActorId || '',
    }))),
    compatiblePresetIds: Object.freeze(compatible.map(preset => preset.id)),
    assignedPresetId: assignedPreset?.id || '',
    assignedPresetKind: assignedPreset?.kind || '',
    recommendedPresetId: recommendedPreset?.id || '',
    livePoseEligible: selectedTarget?.kind === 'npc' || Boolean(track && (!selectedAsset || selectedAsset.shape === 'humanoid')),
    livePoseActive: selectedTarget?.kind === 'npc'
      ? Boolean(selectedNpcHandPoseActive)
      : Boolean(motionPose && track && (!selectedAsset || selectedAsset.shape === 'humanoid')),
    selectedMarkId: selectedTarget?.kind === 'npc'
      ? selectedNpcGestureArmed ? `npc:${selectedTarget.id}:gesture` : ''
      : mark?.id || '',
    castMarkArmed: selectedTarget?.kind === 'npc' ? Boolean(selectedNpcGestureArmed) : runtime.castMarkArmed,
    playheadSeconds: runtime.playheadSeconds,
    durationSeconds: runtime.plan.durationSeconds,
    timelinePlaying: state.timelineTransportDocumentKey === timelineDocumentKey() && state.timelineTransportPlaying === true,
    revision: runtime.revision,
  })
}

export function controlXrSharedAssetControls(input: XrSharedAssetControlInput): XrSharedAssetControlResult {
  if (!hydrateSharedXrControls()) {
    return {
      ok: false,
      message: 'Open or create an XR document before controlling 3D for XR assets.',
      operation: input.operation,
      snapshot: inspectXrSharedAssetControls(),
    }
  }

  if (input.operation === 'play-timeline' || input.operation === 'pause-timeline') {
    useGraphStore.getState().setTimelineTransportState({
      documentKey: timelineDocumentKey(),
      playing: input.operation === 'play-timeline',
    })
    if (input.operation === 'play-timeline') requestXrMotionReferenceCameraPlaybackReapply()
    return {
      ok: true,
      message: `XR timeline ${input.operation === 'play-timeline' ? 'started' : 'paused'}.`,
      operation: input.operation,
      snapshot: inspectXrSharedAssetControls(),
    }
  }

  if (input.operation === 'scrub-timeline') {
    const runtime = readXrMotionReferenceRuntime()
    const bounded = Math.min(runtime.plan.durationSeconds, Math.max(0, Number(input.timeSeconds) || 0))
    setXrMotionReferencePlayhead(bounded)
    useGraphStore.getState().setTimelineTransportState({ documentKey: timelineDocumentKey(), position: bounded / 60 })
    requestXrMotionReferenceCameraPlaybackReapply()
    return {
      ok: true,
      message: `XR playhead moved to ${bounded.toFixed(2)}s.`,
      operation: input.operation,
      snapshot: inspectXrSharedAssetControls(),
    }
  }

  const runtime = readXrMotionReferenceRuntime()
  if (input.operation === 'select-target') {
    const targetId = String(input.targetId || '').trim()
    const target = resolveSharedAssetTarget(runtime, targetId)
    if (!target) {
      return {
        ok: false,
        message: 'Select a valid 3D for XR target.',
        operation: input.operation,
        targetId,
        snapshot: inspectXrSharedAssetControls(),
      }
    }
    if (target.kind === 'npc') {
      sharedMotionSceneKey = ''
      sharedMotionTargetId = ''
      selectGameplayNpcTarget(target.id)
      return {
        ok: true,
        message: `${target.label} selected for shared XR gameplay controls.`,
        operation: input.operation,
        targetId: target.id,
        snapshot: inspectXrSharedAssetControls(),
      }
    }
    clearGameplayNpcTargetSelection()
    if (target.kind === 'object') {
      const actorId = selectedActorId(runtime, target.id)
      const prepared = ensureSharedMotionTrack(runtime, actorId)
      if (actorId && !castTrack(prepared, actorId)) {
        return {
          ok: false,
          message: `${target.label} could not be readied for motion control.`,
          operation: input.operation,
          targetId: target.id,
          snapshot: inspectXrSharedAssetControls(),
        }
      }
      if (!persistPromotedSharedMotionTrack(runtime, actorId)) {
        return {
          ok: false,
          message: `${target.label} could not be written to graph metadata.`,
          operation: input.operation,
          targetId: target.id,
          snapshot: inspectXrSharedAssetControls(),
        }
      }
      sharedMotionSceneKey = prepared.sceneKey
      sharedMotionTargetId = target.id
      releaseStaleSharedMotionFocus()
    } else {
      sharedMotionSceneKey = ''
      sharedMotionTargetId = ''
    }
    selectBoundXrShotTarget(target.id)
    return {
      ok: true,
      message: `${target.label} selected for shared XR controls.`,
      operation: input.operation,
      targetId: target.id,
      snapshot: inspectXrSharedAssetControls(),
    }
  }

  const sharedTarget = resolveSharedAssetTarget(runtime, input.targetId || gameplayNpcState.selectedNpcId)
  if (sharedTarget?.kind === 'npc') {
    return controlGameplayNpcTarget(sharedTarget, input)
  }

  const actorId = selectedActorId(runtime, input.targetId)
  const prepared = ensureSharedMotionTrack(runtime, actorId)
  const track = castTrack(prepared, actorId)
  if (!actorId || !track) {
    return {
      ok: false,
      message: 'Select an animatable 3D for XR object, subject, or prop first.',
      operation: input.operation,
      targetId: actorId,
      snapshot: inspectXrSharedAssetControls(),
    }
  }
  if (!persistPromotedSharedMotionTrack(runtime, actorId)) {
    return {
      ok: false,
      message: `${track.label} could not be written to graph metadata.`,
      operation: input.operation,
      targetId: actorId,
      snapshot: inspectXrSharedAssetControls(),
    }
  }

  if (input.targetId) selectBoundXrActor(actorId)

  if (input.operation === 'arm-gesture-mark' || input.operation === 'disarm-gesture-mark') {
    setXrMotionReferenceCastMarkArmed(input.operation === 'arm-gesture-mark')
    return {
      ok: true,
      message: `${track.label} gesture mark capture ${input.operation === 'arm-gesture-mark' ? 'armed' : 'disarmed'}.`,
      operation: input.operation,
      targetId: actorId,
      snapshot: inspectXrSharedAssetControls(),
    }
  }

  const before = readXrMotionReferenceRuntime()
  if (input.operation === 'apply-animation') {
    const preset = resolvePresetForApply(before, actorId, input.presetId)
    if (!preset) {
      return {
        ok: false,
        message: `${track.label} has no compatible animation preset for this target.`,
        operation: input.operation,
        targetId: actorId,
        snapshot: inspectXrSharedAssetControls(),
      }
    }
    const assignment = updateXrAnimationAssignment({
      operation: 'apply',
      presetId: preset.id,
      targetId: actorId,
      trackKind: preset.kind,
    })
    if (!assignment.ok) {
      return {
        ok: false,
        message: assignment.message,
        operation: input.operation,
        targetId: actorId,
        presetId: preset.id,
        snapshot: inspectXrSharedAssetControls(),
      }
    }
    if (!persistMotionPlan(before)) {
      return {
        ok: false,
        message: 'The shared XR animation could not be written to graph metadata.',
        operation: input.operation,
        targetId: actorId,
        presetId: preset.id,
        snapshot: inspectXrSharedAssetControls(),
      }
    }
    if (assignment.positionMarksChanged) hydrateCanonicalXrPhysicsRuntime()
    selectBoundXrActor(actorId)
    return {
      ok: true,
      message: assignment.message,
      operation: input.operation,
      targetId: actorId,
      presetId: preset.id,
      snapshot: inspectXrSharedAssetControls(),
    }
  }

  if (input.operation === 'clear-animation') {
    if (!track.animation) {
      return {
        ok: false,
        message: `${track.label} has no animation to clear.`,
        operation: input.operation,
        targetId: actorId,
        snapshot: inspectXrSharedAssetControls(),
      }
    }
    const assignment = updateXrAnimationAssignment({
      operation: 'clear',
      presetId: '',
      targetId: actorId,
      trackKind: track.animation.kind,
    })
    if (!assignment.ok) {
      return {
        ok: false,
        message: assignment.message,
        operation: input.operation,
        targetId: actorId,
        snapshot: inspectXrSharedAssetControls(),
      }
    }
    if (!persistMotionPlan(before)) {
      return {
        ok: false,
        message: 'The shared XR animation clear could not be written to graph metadata.',
        operation: input.operation,
        targetId: actorId,
        snapshot: inspectXrSharedAssetControls(),
      }
    }
    if (assignment.positionMarksChanged) hydrateCanonicalXrPhysicsRuntime()
    return {
      ok: true,
      message: assignment.message,
      operation: input.operation,
      targetId: actorId,
      snapshot: inspectXrSharedAssetControls(),
    }
  }

  if (input.operation === 'capture-hand-pose') {
    const pose = motionControlPoseToAnimationPose(readMotionControlSnapshot().pose)
    const mark = selectedOrNearestCastMark(before, actorId)
    if (!pose || !mark) {
      return {
        ok: false,
        message: 'Start Motion Control and select a cast mark before capturing a hand pose.',
        operation: input.operation,
        targetId: actorId,
        snapshot: inspectXrSharedAssetControls(),
      }
    }
    const nextPosition: XrMotionReferenceVector = Object.freeze([
      mark.position[0] + pose.rootOffsetMeters[0],
      Math.max(0, mark.position[1] + pose.rootOffsetMeters[1]),
      mark.position[2] + pose.rootOffsetMeters[2],
    ] as const)
    const applied = applyXrConstrainedCastMarkChoreography({
      actorId,
      markId: mark.id,
      position: nextPosition,
    })
    if (!applied.applied && applied.reason !== 'unchanged') {
      return {
        ok: false,
        message: applied.reason === 'physics-owned'
          ? 'Stop XR physics before writing a hand-pose keyframe.'
          : 'The hand-pose keyframe is obstructed by the authored XR scene.',
        operation: input.operation,
        targetId: actorId,
        snapshot: inspectXrSharedAssetControls(),
      }
    }
    if (applied.applied && !persistMotionPlan(before)) {
      return {
        ok: false,
        message: 'The hand-pose keyframe could not be written to graph metadata.',
        operation: input.operation,
        targetId: actorId,
        snapshot: inspectXrSharedAssetControls(),
      }
    }
    selectXrMotionReferenceCastMark(actorId, mark.id)
    return {
      ok: true,
      message: applied.applied
        ? `Captured hand pose on ${track.label}.`
        : `${track.label} hand pose is already on this mark.`,
      operation: input.operation,
      targetId: actorId,
      snapshot: inspectXrSharedAssetControls(),
    }
  }

  return {
    ok: false,
    message: 'Unsupported shared XR asset control.',
    operation: input.operation,
    targetId: actorId,
    snapshot: inspectXrSharedAssetControls(),
  }
}
