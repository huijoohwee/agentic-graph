import {
  ensureXrMotionReferenceCastTrackForSubject,
  readXrMotionReferenceRuntime,
  type XrMotionReferenceRuntimeSnapshot,
} from './xrMotionReferenceRuntime'
import type {
  XrMotionReferenceMark,
  XrMotionReferenceVector,
} from './xrMotionReferenceModel'
import { selectBoundXrShotTarget } from './xrSelectedActorBinding'
import { resolveXrShotTarget } from './xrShotTargets'
import type { XrNativeControllerInput } from './xrNativeControllerInput'
import {
  THREE_KEYBOARD_MAX_FRAME_DELTA_MS,
  THREE_OBJECT_KEYBOARD_FINE_SPEED_METERS_PER_SECOND,
  THREE_OBJECT_KEYBOARD_SPEED_METERS_PER_SECOND,
} from './threeKeyboardChoreography'
import { readXrPhysicsRuntime, readXrPhysicsRuntimeFrame } from './xrPhysicsRuntime'
import { resolveXrSubjectMotion } from './xrSubjectMotionConstraints'
import { applyXrConstrainedCastMarkChoreography } from './xrConstrainedCastMarkRuntime'

export type XrSharedAssetControlOperation = 'select-target'

export type XrSharedAssetControlInput = Readonly<{
  operation: XrSharedAssetControlOperation
  targetId?: string
}>

export type XrSharedAssetControlResult = Readonly<{
  ok: boolean
  message: string
  operation: XrSharedAssetControlOperation
  targetId?: string
  snapshot: XrMotionReferenceRuntimeSnapshot
}>

export type XrSharedAssetCastMarkTarget = Readonly<{
  actorId: string
  mark: XrMotionReferenceMark
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

const XR_SHARED_OBJECT_CONTROLLER_DEAD_ZONE = 0.04
let sharedMotionSceneKey = ''
let sharedMotionTargetId = ''

function ensureSharedMotionTrack(
  runtime: XrMotionReferenceRuntimeSnapshot,
  actorId: string,
): XrMotionReferenceRuntimeSnapshot {
  if (!actorId || runtime.plan.cast.some(track => track.actorId === actorId)) return runtime
  if (!runtime.plan.subjects.some(subject => subject.id === actorId)) return runtime
  return ensureXrMotionReferenceCastTrackForSubject(actorId)
}

function releaseStaleSharedMotionFocus(): void {
  if (typeof document === 'undefined') return
  const activeElement = document.activeElement
  if (activeElement instanceof HTMLElement && activeElement !== document.body) {
    activeElement.blur()
  }
}

function nearestCastMark(
  marks: readonly XrMotionReferenceMark[],
  playheadSeconds: number,
): XrMotionReferenceMark | null {
  return marks.reduce<XrMotionReferenceMark | null>((closest, mark) => {
    if (!closest) return mark
    return Math.abs(mark.timeSeconds - playheadSeconds) < Math.abs(closest.timeSeconds - playheadSeconds)
      ? mark
      : closest
  }, null)
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

export function resolveXrSharedAssetCastMarkTarget(
  runtime: XrMotionReferenceRuntimeSnapshot,
): XrSharedAssetCastMarkTarget | null {
  const selectedMark = runtime.selectedMark
  const selectedCastMark = selectedMark?.kind === 'cast'
    ? runtime.plan.cast
      .find(track => track.actorId === selectedMark.actorId)
      ?.marks.find(candidate => candidate.id === selectedMark.markId)
    : null
  if (selectedMark?.kind === 'cast' && selectedCastMark) {
    return Object.freeze({
      actorId: selectedMark.actorId,
      mark: selectedCastMark,
    })
  }
  const targetTrack = runtime.plan.cast.find(track => track.actorId === runtime.selectedShotTargetId)
  const targetMark = targetTrack ? nearestCastMark(targetTrack.marks, runtime.playheadSeconds) : null
  return targetTrack && targetMark
    ? Object.freeze({ actorId: targetTrack.actorId, mark: targetMark })
    : null
}

export function selectedXrSharedObjectMotionControlActive(
  runtime: XrMotionReferenceRuntimeSnapshot = readXrMotionReferenceRuntime(),
): boolean {
  const target = resolveXrSharedAssetCastMarkTarget(runtime)
  if (!target) return false
  if (runtime.selectedMark?.kind === 'cast') return true
  return Boolean(sharedMotionTargetId
    && sharedMotionSceneKey === runtime.sceneKey
    && (runtime.selectedShotTargetId === sharedMotionTargetId || target.actorId === sharedMotionTargetId))
}

export function resolveXrSharedObjectControllerMotionTarget(input: Readonly<{
  controllerInput: XrNativeControllerInput
  deltaSeconds: number
  runtime: XrMotionReferenceRuntimeSnapshot
}>): XrSharedObjectControllerMotionTarget | null {
  if (!selectedXrSharedObjectMotionControlActive(input.runtime)) return null
  const target = resolveXrSharedAssetCastMarkTarget(input.runtime)
  const vector = controllerMotionVector(input.controllerInput)
  if (!target || !vector) return null
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
    target.mark.position[0] + vector.direction[0] * distanceMeters,
    target.mark.position[1],
    target.mark.position[2] + vector.direction[1] * distanceMeters,
  ] as const)
  const physics = readXrPhysicsRuntime()
  const motion = resolveXrSubjectMotion({
    actorId: target.actorId,
    desiredPosition,
    markId: target.mark.id,
    physics,
    physicsFrame: physics.phase === 'stopped' ? undefined : readXrPhysicsRuntimeFrame(),
    plan: input.runtime.plan,
    position: target.mark.position,
    timeSeconds: target.mark.timeSeconds,
  })
  if (motion.status === 'physics-owned' || motion.status === 'obstructed') return null
  const nextPosition = motion.position
  return Object.freeze({
    actorId: target.actorId,
    changed: nextPosition.some((value, index) => value !== target.mark.position[index]),
    markId: target.mark.id,
    nextPosition,
    ownerId: `xr:shared-object-motion:${target.actorId}:${target.mark.id}`,
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

export function controlXrSharedAssetControls(input: XrSharedAssetControlInput): XrSharedAssetControlResult {
  const runtime = readXrMotionReferenceRuntime()
  const targetId = String(input.targetId || '').trim()
  const target = resolveXrShotTarget(runtime.plan, targetId)
  if (!target) {
    return {
      ok: false,
      message: 'Select a valid 3D for XR target.',
      operation: input.operation,
      targetId,
      snapshot: runtime,
    }
  }
  if (target.kind === 'object') {
    const actorId = target.castActorId || target.id
    const prepared = ensureSharedMotionTrack(runtime, actorId)
    if (!prepared.plan.cast.some(track => track.actorId === actorId)) {
      return {
        ok: false,
        message: `${target.label} could not be readied for motion control.`,
        operation: input.operation,
        targetId: target.id,
        snapshot: prepared,
      }
    }
  }
  const selected = selectBoundXrShotTarget(target.id)
  sharedMotionSceneKey = target.kind === 'object' ? selected.sceneKey : ''
  sharedMotionTargetId = target.kind === 'object'
    ? target.castActorId || target.id
    : ''
  if (target.kind === 'object') releaseStaleSharedMotionFocus()
  return {
    ok: true,
    message: `${target.label} selected for shared XR controls.`,
    operation: input.operation,
    targetId: target.id,
    snapshot: selected,
  }
}
