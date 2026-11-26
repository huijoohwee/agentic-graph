import {
  resolveXrMotionReferenceStage,
  sampleXrMotionReferenceMarks,
  type XrChoreographyEasing,
  type XrChoreographyGait,
  type XrMotionReferenceMark,
  type XrMotionReferencePlan,
  type XrMotionReferenceVector,
} from './xrMotionReferenceModel'
import {
  buildXrAnimationActionPath,
  resolveXrAnimationPreset,
  type XrActionPathPresetId,
  type XrAnimationPathMark,
} from './xrAnimationCatalog'
import {
  clearXrMotionReferenceCastAnimation,
  readXrMotionReferenceRuntime,
  restoreXrMotionReferenceRuntimeSnapshot,
  setXrMotionReferenceCastAnimation,
  setXrMotionReferenceCastMarkChoreography,
} from './xrMotionReferenceRuntime'
import { readXrPhysicsRuntime, readXrPhysicsRuntimeFrame } from './xrPhysicsRuntime'
import {
  isXrSubjectMotionPositionSafe,
  resolveXrSubjectMotion,
  xrPhysicsOwnsAuthoredSubject,
  type XrSubjectMotionResolution,
} from './xrSubjectMotionConstraints'

const XR_ACTION_PATH_RESOLUTION_PASSES = 4
const XR_ACTION_PATH_PERSISTENCE_INSET_METERS = 0.001

export type XrConstrainedCastMarkUpdate = Readonly<{
  actorId: string
  markId: string
  easing?: XrChoreographyEasing
  gait?: XrChoreographyGait
  position?: XrMotionReferenceVector
}>

export type XrConstrainedCastMarkResult = Readonly<{
  applied: boolean
  motion: XrSubjectMotionResolution | null
  reason: 'applied' | 'invalid-mark' | 'physics-owned' | 'obstructed' | 'unchanged'
}>

export type XrConstrainedCastAnimationResult = Readonly<{
  applied: boolean
  reason: 'applied' | 'invalid-target' | 'physics-owned' | 'obstructed'
}>

function actionPathMarkId(actorId: string, timeSeconds: number): string {
  return `cast:${actorId}:${Math.round(timeSeconds * 1000)}`
}

function planWithActionPath(
  plan: XrMotionReferencePlan,
  actorId: string,
  presetId: XrActionPathPresetId,
  marks: readonly XrMotionReferenceMark[],
): XrMotionReferencePlan {
  const preset = resolveXrAnimationPreset(presetId)
  return Object.freeze({
    ...plan,
    cast: Object.freeze(plan.cast.map(track => track.actorId === actorId
      ? Object.freeze({
        ...track,
        animation: Object.freeze({
          kind: 'action-path' as const,
          presetId,
          startTimeSeconds: 0,
          loop: preset.loop,
        }),
        marks,
      })
      : track)),
  })
}

function insetTowardSegmentStart(
  position: XrMotionReferenceVector,
  segmentStart: XrMotionReferenceVector,
): XrMotionReferenceVector {
  const distance = Math.hypot(
    position[0] - segmentStart[0],
    position[1] - segmentStart[1],
    position[2] - segmentStart[2],
  )
  if (distance <= XR_ACTION_PATH_PERSISTENCE_INSET_METERS) return position
  const ratio = XR_ACTION_PATH_PERSISTENCE_INSET_METERS / distance
  return Object.freeze([
    position[0] + (segmentStart[0] - position[0]) * ratio,
    position[1] + (segmentStart[1] - position[1]) * ratio,
    position[2] + (segmentStart[2] - position[2]) * ratio,
  ] as const)
}

function materializeConstrainedActionPath(
  actorId: string,
  presetId: XrActionPathPresetId,
): Readonly<{ marks: readonly XrAnimationPathMark[]; reason: 'applied' | 'invalid-target' | 'physics-owned' | 'obstructed' }> {
  const runtime = readXrMotionReferenceRuntime()
  const track = runtime.plan.cast.find(candidate => candidate.actorId === actorId)
  const subject = runtime.plan.subjects.find(candidate => candidate.id === actorId)
  if (!track || !subject) return Object.freeze({ marks: [], reason: 'invalid-target' })
  const physics = readXrPhysicsRuntime()
  if (xrPhysicsOwnsAuthoredSubject(physics, actorId)) {
    return Object.freeze({ marks: [], reason: 'physics-owned' })
  }
  const physicsFrame = physics.phase === 'stopped' ? undefined : readXrPhysicsRuntimeFrame()
  const stage = resolveXrMotionReferenceStage(runtime.plan.stageId)
  const origin = sampleXrMotionReferenceMarks(track.marks, runtime.playheadSeconds)
  const generated = buildXrAnimationActionPath({
    presetId,
    durationSeconds: runtime.plan.durationSeconds,
    origin,
    stageSizeMeters: stage.sizeMeters,
  })
  const generatedMarks = Object.freeze(generated.map(mark => Object.freeze({
    ...mark,
    id: actionPathMarkId(actorId, mark.timeSeconds),
  })))
  let marks: readonly XrMotionReferenceMark[] = generatedMarks
  for (let pass = 0; pass < XR_ACTION_PATH_RESOLUTION_PASSES; pass += 1) {
    const nextMarks: XrMotionReferenceMark[] = []
    let segmentStart = origin
    let segmentStartTimeSeconds = generatedMarks[0]?.timeSeconds || 0
    for (let index = 0; index < generatedMarks.length; index += 1) {
      const generatedMark = generatedMarks[index]!
      const candidateMarks = Object.freeze([...nextMarks, ...marks.slice(index)])
      const candidatePlan = planWithActionPath(runtime.plan, actorId, presetId, candidateMarks)
      const motion = resolveXrSubjectMotion({
        actorId,
        desiredPosition: generatedMark.position,
        markId: generatedMark.id,
        physics,
        physicsFrame,
        plan: candidatePlan,
        position: segmentStart,
        startTimeSeconds: segmentStartTimeSeconds,
        timeSeconds: generatedMark.timeSeconds,
      })
      if (motion.status === 'physics-owned') return Object.freeze({ marks: [], reason: 'physics-owned' })
      const insetPosition = insetTowardSegmentStart(motion.position, segmentStart)
      const persistedMotion = resolveXrSubjectMotion({
        actorId,
        desiredPosition: insetPosition,
        markId: generatedMark.id,
        physics,
        physicsFrame,
        plan: candidatePlan,
        position: segmentStart,
        startTimeSeconds: segmentStartTimeSeconds,
        timeSeconds: generatedMark.timeSeconds,
      })
      const resolvedMark = Object.freeze({ ...generatedMark, position: persistedMotion.position })
      nextMarks.push(resolvedMark)
      segmentStart = resolvedMark.position
      segmentStartTimeSeconds = generatedMark.timeSeconds
    }
    const stable = marks.every((mark, index) => mark.position.every((value, axis) => value === nextMarks[index]?.position[axis]))
    marks = Object.freeze(nextMarks)
    if (stable) break
  }
  const resolvedPlan = planWithActionPath(runtime.plan, actorId, presetId, marks)
  const safe = marks.every(mark => isXrSubjectMotionPositionSafe({
    actorId,
    physics,
    physicsFrame,
    plan: resolvedPlan,
    position: mark.position,
    timeSeconds: mark.timeSeconds,
  }))
  return safe
    ? Object.freeze({
      marks: Object.freeze(marks.map(({ id: _id, ...mark }) => Object.freeze(mark))),
      reason: 'applied' as const,
    })
    : Object.freeze({ marks: [], reason: 'obstructed' as const })
}

export function applyXrConstrainedCastActionPath(
  actorId: string,
  presetId: XrActionPathPresetId,
): XrConstrainedCastAnimationResult {
  const previous = readXrMotionReferenceRuntime()
  const materialized = materializeConstrainedActionPath(actorId, presetId)
  if (materialized.reason !== 'applied') {
    return Object.freeze({ applied: false, reason: materialized.reason })
  }
  setXrMotionReferenceCastAnimation(actorId, presetId, materialized.marks)
  const applied = readXrMotionReferenceRuntime()
  const track = applied.plan.cast.find(candidate => candidate.actorId === actorId)
  const physics = readXrPhysicsRuntime()
  const physicsFrame = physics.phase === 'stopped' ? undefined : readXrPhysicsRuntimeFrame()
  const safe = track?.animation?.kind === 'action-path'
    && track.animation.presetId === presetId
    && track.marks.every(mark => isXrSubjectMotionPositionSafe({
      actorId,
      physics,
      physicsFrame,
      plan: applied.plan,
      position: mark.position,
      timeSeconds: mark.timeSeconds,
    }))
  if (!safe) {
    restoreXrMotionReferenceRuntimeSnapshot(previous)
    return Object.freeze({ applied: false, reason: 'obstructed' })
  }
  return Object.freeze({ applied: true, reason: 'applied' })
}

export function clearXrConstrainedCastAnimation(actorId: string): XrConstrainedCastAnimationResult {
  const before = readXrMotionReferenceRuntime()
  const track = before.plan.cast.find(candidate => candidate.actorId === actorId)
  if (!track) return Object.freeze({ applied: false, reason: 'invalid-target' })
  if (track.animation?.kind === 'action-path'
    && xrPhysicsOwnsAuthoredSubject(readXrPhysicsRuntime(), actorId)) {
    return Object.freeze({ applied: false, reason: 'physics-owned' })
  }
  const next = clearXrMotionReferenceCastAnimation(actorId)
  return next.revision === before.revision
    ? Object.freeze({ applied: false, reason: 'obstructed' })
    : Object.freeze({ applied: true, reason: 'applied' })
}

export function applyXrConstrainedCastMarkChoreography(
  update: XrConstrainedCastMarkUpdate,
): XrConstrainedCastMarkResult {
  const runtime = readXrMotionReferenceRuntime()
  const mark = runtime.plan.cast
    .find(track => track.actorId === update.actorId)
    ?.marks.find(candidate => candidate.id === update.markId)
  if (!mark) return Object.freeze({ applied: false, motion: null, reason: 'invalid-mark' })
  let motion: XrSubjectMotionResolution | null = null
  if (update.position) {
    const physics = readXrPhysicsRuntime()
    motion = resolveXrSubjectMotion({
      actorId: update.actorId,
      desiredPosition: update.position,
      markId: update.markId,
      physics,
      physicsFrame: physics.phase === 'stopped' ? undefined : readXrPhysicsRuntimeFrame(),
      plan: runtime.plan,
      position: mark.position,
      timeSeconds: mark.timeSeconds,
    })
    if (motion.status === 'physics-owned' || motion.status === 'obstructed') {
      return Object.freeze({ applied: false, motion, reason: motion.status })
    }
  }
  const position = motion?.position
  const choreographyChanged = Boolean(update.easing || update.gait)
  const positionChanged = Boolean(position && position.some((value, index) => value !== mark.position[index]))
  if (!choreographyChanged && !positionChanged) {
    return Object.freeze({ applied: false, motion, reason: 'unchanged' })
  }
  const next = setXrMotionReferenceCastMarkChoreography({
    actorId: update.actorId,
    markId: update.markId,
    easing: update.easing,
    gait: update.gait,
    position,
    ...(motion ? { positionResolution: motion } : {}),
  })
  return next.revision === runtime.revision
    ? Object.freeze({ applied: false, motion, reason: 'obstructed' })
    : Object.freeze({ applied: true, motion, reason: 'applied' })
}
