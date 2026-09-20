import {
  readXrMotionReferencePlan,
  sampleXrMotionReferenceMarks,
  resolveXrMotionReferenceStage,
  XR_MOTION_REFERENCE_MAX_CAST_MARKS,
  type XrMotionReferenceCastTrack,
  type XrMotionReferenceMark,
  type XrMotionReferencePlan,
  type XrMotionReferenceTransition,
  type XrMotionReferenceVector,
} from './xrMotionReferenceModel'
import type { XrChoreographyGait } from './xrChoreographyEasing'
import {
  buildXrMotionReferenceSubjectAssetEdit,
  buildXrMotionReferenceSubjectTransformEdit,
  type XrMotionReferenceSubjectEdit,
} from './xrMotionReferenceSubjectEdits'
import {
  readXrPhysicsRuntime,
  readXrPhysicsRuntimeFrame,
  type XrPhysicsRuntimeFrame,
  type XrPhysicsRuntimeSnapshot,
} from './xrPhysicsRuntime'
import {
  isXrSubjectMotionPositionSafe,
  resolveXrSubjectMotion,
  xrPhysicsOwnsAuthoredSubject,
  type XrSubjectMotionResolution,
} from './xrSubjectMotionConstraints'

type ConstrainedEditReason = 'applied' | 'invalid-target' | 'capacity' | 'physics-owned' | 'obstructed'

const XR_CONSTRAINED_MOTION_MIN_SAMPLES_PER_SECOND = 12
const XR_CONSTRAINED_MOTION_MAX_SAMPLES_PER_SECOND = 30
const XR_CONSTRAINED_MOTION_MAX_UNIFORM_STEPS = 900

export type XrConstrainedCastMarkDropResult = Readonly<{
  position: XrMotionReferenceVector | null
  reason: ConstrainedEditReason
  motion: XrSubjectMotionResolution | null
}>

export type XrConstrainedSubjectTransformResult = Readonly<{
  edit: XrMotionReferenceSubjectEdit | null
  reason: ConstrainedEditReason
  motion: XrSubjectMotionResolution | null
}>

export type XrConstrainedCastTransitionResult = Readonly<{
  plan: XrMotionReferencePlan | null
  reason: ConstrainedEditReason
  motion: XrSubjectMotionResolution | null
}>

function castMarkId(actorId: string, timeSeconds: number): string {
  return `cast:${actorId}:${Math.round(timeSeconds * 1000)}`
}

function constraintPhysics(sceneKey: string): Readonly<{
  physics: XrPhysicsRuntimeSnapshot
  physicsFrame?: XrPhysicsRuntimeFrame
}> {
  const current = readXrPhysicsRuntime()
  const physics = current.sceneKey === sceneKey
    ? current
    : Object.freeze({ ...current, phase: 'stopped' as const })
  return Object.freeze({
    physics,
    physicsFrame: physics.phase === 'stopped' ? undefined : readXrPhysicsRuntimeFrame(),
  })
}

function replaceCastTrack(
  plan: XrMotionReferencePlan,
  actorId: string,
  resolveTrack: (track: XrMotionReferenceCastTrack) => XrMotionReferenceCastTrack,
): XrMotionReferencePlan {
  return Object.freeze({
    ...plan,
    cast: Object.freeze(plan.cast.map(track => track.actorId === actorId ? resolveTrack(track) : track)),
  })
}

function planWithCastMark(input: Readonly<{
  actorId: string
  gait: XrChoreographyGait
  plan: XrMotionReferencePlan
  position: XrMotionReferenceVector
  timeSeconds: number
  transition: XrMotionReferenceTransition
}>): XrMotionReferencePlan | null {
  const track = input.plan.cast.find(candidate => candidate.actorId === input.actorId)
  if (!track) return null
  const replacing = track.marks.some(mark => Math.abs(mark.timeSeconds - input.timeSeconds) < 0.0005)
  if (track.marks.length >= XR_MOTION_REFERENCE_MAX_CAST_MARKS && !replacing) return null
  const mark: XrMotionReferenceMark = Object.freeze({
    id: castMarkId(input.actorId, input.timeSeconds),
    timeSeconds: input.timeSeconds,
    position: Object.freeze([...input.position] as [number, number, number]),
    transition: input.transition,
    gait: input.gait,
  })
  return replaceCastTrack(input.plan, input.actorId, source => Object.freeze({
    ...source,
    animation: source.animation?.kind === 'action-path' ? null : source.animation,
    marks: Object.freeze([
      ...source.marks.filter(candidate => Math.abs(candidate.timeSeconds - input.timeSeconds) >= 0.0005),
      mark,
    ].sort((left, right) => left.timeSeconds - right.timeSeconds)),
  }))
}

function planWithSubjectTransform(
  plan: XrMotionReferencePlan,
  args: Readonly<{
    subjectId: string
    position: XrMotionReferenceVector
    rotationYDegrees?: number
    scale?: number
    color?: string
  }>,
): XrMotionReferencePlan | null {
  const subject = plan.subjects.find(candidate => candidate.id === args.subjectId)
  if (!subject) return null
  const delta: XrMotionReferenceVector = Object.freeze([
    args.position[0] - subject.position[0],
    args.position[1] - subject.position[1],
    args.position[2] - subject.position[2],
  ])
  return Object.freeze({
    ...plan,
    subjects: Object.freeze(plan.subjects.map(candidate => candidate.id === args.subjectId
      ? Object.freeze({
        ...candidate,
        position: args.position,
        rotationYDegrees: args.rotationYDegrees ?? candidate.rotationYDegrees,
        scale: args.scale ?? candidate.scale,
        color: args.color ?? candidate.color,
      })
      : candidate)),
    cast: Object.freeze(plan.cast.map(track => track.actorId === args.subjectId
      ? Object.freeze({
        ...track,
        marks: Object.freeze(track.marks.map(mark => Object.freeze({
          ...mark,
          position: Object.freeze([
            mark.position[0] + delta[0],
            mark.position[1] + delta[1],
            mark.position[2] + delta[2],
          ] as [number, number, number]),
        }))),
      })
      : track)),
  })
}

function samePosition(left: XrMotionReferenceVector, right: XrMotionReferenceVector): boolean {
  return left.every((value, axis) => Math.abs(value - right[axis]) <= 1e-9)
}

function constrainedMotionSampleTimes(plan: XrMotionReferencePlan): readonly number[] {
  const samplesPerSecond = Math.min(
    XR_CONSTRAINED_MOTION_MAX_SAMPLES_PER_SECOND,
    Math.max(XR_CONSTRAINED_MOTION_MIN_SAMPLES_PER_SECOND, plan.fps),
  )
  const uniformSteps = Math.min(
    XR_CONSTRAINED_MOTION_MAX_UNIFORM_STEPS,
    Math.max(1, Math.ceil(plan.durationSeconds * samplesPerSecond)),
  )
  const sampleTimes = Array.from(
    { length: uniformSteps + 1 },
    (_, index) => plan.durationSeconds * index / uniformSteps,
  )
  const subjectIds = new Set(plan.subjects.map(subject => subject.id))
  for (const track of plan.cast) {
    if (!subjectIds.has(track.actorId)) continue
    for (const mark of track.marks) sampleTimes.push(mark.timeSeconds)
  }
  return Object.freeze(sampleTimes
    .sort((left, right) => left - right)
    .filter((timeSeconds, index, source) => index === 0 || Math.abs(timeSeconds - source[index - 1]!) > 1e-7))
}

function subjectTrackIsSafe(input: Readonly<{
  actorId: string
  physics: XrPhysicsRuntimeSnapshot
  physicsFrame?: XrPhysicsRuntimeFrame
  plan: XrMotionReferencePlan
  sampleTimes?: readonly number[]
}>): boolean {
  const subject = input.plan.subjects.find(candidate => candidate.id === input.actorId)
  if (!subject) return true
  const track = input.plan.cast.find(candidate => candidate.actorId === input.actorId)
  const sampleTimes = input.sampleTimes || constrainedMotionSampleTimes(input.plan)
  let previousPosition: XrMotionReferenceVector | null = null
  let previousTimeSeconds = 0
  for (const timeSeconds of sampleTimes) {
    const position = track
      ? sampleXrMotionReferenceMarks(track.marks, timeSeconds)
      : subject.position
    if (!isXrSubjectMotionPositionSafe({
      actorId: input.actorId,
      physics: input.physics,
      physicsFrame: input.physicsFrame,
      plan: input.plan,
      position,
      timeSeconds,
    })) return false
    if (!previousPosition) {
      previousPosition = position
      previousTimeSeconds = timeSeconds
      continue
    }
    const segment = resolveXrSubjectMotion({
      actorId: input.actorId,
      desiredPosition: position,
      physics: input.physics,
      physicsFrame: input.physicsFrame,
      plan: input.plan,
      position: previousPosition,
      startTimeSeconds: previousTimeSeconds,
      timeSeconds,
    })
    if (!samePosition(segment.position, position)) return false
    previousPosition = position
    previousTimeSeconds = timeSeconds
  }
  return true
}

export function isXrConstrainedMotionPlanSafe(input: Readonly<{
  plan: XrMotionReferencePlan
  sceneKey: string
  subjectIds?: readonly string[]
}>): boolean {
  const { physics, physicsFrame } = constraintPhysics(input.sceneKey)
  const subjectIds = input.subjectIds
    ? [...new Set(input.subjectIds)]
    : input.plan.subjects.map(subject => subject.id)
  const sampleTimes = constrainedMotionSampleTimes(input.plan)
  return subjectIds.every(actorId => !xrPhysicsOwnsAuthoredSubject(physics, actorId)
    && subjectTrackIsSafe({ actorId, physics, physicsFrame, plan: input.plan, sampleTimes }))
}

export function buildXrConstrainedSubjectAssetTransformEdit(input: Readonly<{
  activeNodes: Parameters<typeof readXrMotionReferencePlan>[1]
  args: Readonly<{
    subjectId: string
    assetId: string
    position?: XrMotionReferenceVector
    rotationYDegrees?: number
    scale?: number
    color?: string
  }>
  plan: XrMotionReferencePlan
  sceneKey: string
}>): XrConstrainedSubjectTransformResult {
  const assetEdit = buildXrMotionReferenceSubjectAssetEdit(input.plan, input.args)
  if (!assetEdit) return Object.freeze({ edit: null, reason: 'invalid-target', motion: null })
  const transformRequested = Boolean(
    input.args.position
    || input.args.rotationYDegrees !== undefined
    || input.args.scale !== undefined
    || input.args.color,
  )
  if (!transformRequested) {
    return Object.freeze({ edit: assetEdit, reason: 'applied' as const, motion: null })
  }
  const assetPlan = readXrMotionReferencePlan(assetEdit.value, input.activeNodes)
  const assetSubject = assetPlan.subjects.find(candidate => candidate.id === input.args.subjectId)
  if (!assetSubject) return Object.freeze({ edit: null, reason: 'invalid-target', motion: null })
  const result = buildXrConstrainedSubjectTransformEdit({
    args: {
      subjectId: input.args.subjectId,
      position: input.args.position || assetSubject.position,
      ...(input.args.rotationYDegrees !== undefined ? { rotationYDegrees: input.args.rotationYDegrees } : {}),
      ...(input.args.scale !== undefined ? { scale: input.args.scale } : {}),
      ...(input.args.color ? { color: input.args.color } : {}),
    },
    plan: assetPlan,
    sceneKey: input.sceneKey,
  })
  if (!result.edit) return result
  return Object.freeze({
    ...result,
    edit: Object.freeze({
      ...result.edit,
      ...(assetEdit.clearArchivedActorId ? { clearArchivedActorId: assetEdit.clearArchivedActorId } : {}),
    }),
  })
}

export function resolveXrConstrainedCastMarkDrop(input: Readonly<{
  actorId: string
  desiredPosition: XrMotionReferenceVector
  gait: XrChoreographyGait
  plan: XrMotionReferencePlan
  sceneKey: string
  timeSeconds: number
  transition: XrMotionReferenceTransition
}>): XrConstrainedCastMarkDropResult {
  const { physics, physicsFrame } = constraintPhysics(input.sceneKey)
  const track = input.plan.cast.find(candidate => candidate.actorId === input.actorId)
  if (!track) return Object.freeze({ position: null, reason: 'invalid-target', motion: null })
  const provisionalPlan = planWithCastMark({
    actorId: input.actorId,
    gait: input.gait,
    plan: input.plan,
    position: input.desiredPosition,
    timeSeconds: input.timeSeconds,
    transition: input.transition,
  })
  if (!provisionalPlan) return Object.freeze({ position: null, reason: 'capacity', motion: null })
  const currentMark = track.marks.find(mark => Math.abs(mark.timeSeconds - input.timeSeconds) < 0.0005)
  const motion = resolveXrSubjectMotion({
    actorId: input.actorId,
    desiredPosition: input.desiredPosition,
    markId: castMarkId(input.actorId, input.timeSeconds),
    physics,
    physicsFrame,
    plan: provisionalPlan,
    position: currentMark?.position || sampleXrMotionReferenceMarks(track.marks, input.timeSeconds),
    timeSeconds: input.timeSeconds,
  })
  if (motion.status === 'physics-owned' || motion.status === 'obstructed') {
    return Object.freeze({ position: null, reason: motion.status, motion })
  }
  const resolvedPlan = planWithCastMark({
    actorId: input.actorId,
    gait: input.gait,
    plan: input.plan,
    position: motion.position,
    timeSeconds: input.timeSeconds,
    transition: input.transition,
  })
  const safe = resolvedPlan && subjectTrackIsSafe({
    actorId: input.actorId,
    physics,
    physicsFrame,
    plan: resolvedPlan,
  })
  return safe
    ? Object.freeze({ position: motion.position, reason: 'applied', motion })
    : Object.freeze({ position: null, reason: 'obstructed', motion })
}

export function buildXrConstrainedSubjectTransformEdit(input: Readonly<{
  args: Readonly<{
    subjectId: string
    position?: XrMotionReferenceVector
    rotationYDegrees?: number
    scale?: number
    color?: string
  }>
  plan: XrMotionReferencePlan
  sceneKey: string
}>): XrConstrainedSubjectTransformResult {
  const { physics, physicsFrame } = constraintPhysics(input.sceneKey)
  const subject = input.plan.subjects.find(candidate => candidate.id === input.args.subjectId)
  if (!subject) return Object.freeze({ edit: null, reason: 'invalid-target', motion: null })
  const spatialEdit = Boolean(input.args.position
    || input.args.rotationYDegrees !== undefined
    || input.args.scale !== undefined)
  if (!spatialEdit) {
    return Object.freeze({
      edit: buildXrMotionReferenceSubjectTransformEdit(input.plan, input.args),
      reason: 'applied',
      motion: null,
    })
  }
  const requestedPlan = planWithSubjectTransform(input.plan, {
    ...input.args,
    position: input.args.position || subject.position,
  })
  if (!requestedPlan) return Object.freeze({ edit: null, reason: 'invalid-target', motion: null })
  const requestedSubject = requestedPlan.subjects.find(candidate => candidate.id === subject.id)!
  const motion = resolveXrSubjectMotion({
    actorId: subject.id,
    desiredPosition: requestedSubject.position,
    physics,
    physicsFrame,
    plan: requestedPlan,
    position: subject.position,
    timeSeconds: 0,
  })
  if (motion.status === 'physics-owned' || motion.status === 'obstructed') {
    return Object.freeze({ edit: null, reason: motion.status, motion })
  }
  const resolvedArgs = Object.freeze({ ...input.args, position: motion.position })
  const resolvedPlan = planWithSubjectTransform(input.plan, resolvedArgs)
  const safe = resolvedPlan && subjectTrackIsSafe({
    actorId: subject.id,
    physics,
    physicsFrame,
    plan: resolvedPlan,
  })
  const edit = safe ? buildXrMotionReferenceSubjectTransformEdit(input.plan, resolvedArgs) : null
  return edit
    ? Object.freeze({ edit, reason: 'applied', motion })
    : Object.freeze({ edit: null, reason: 'obstructed', motion })
}

function planWithCastTransition(
  plan: XrMotionReferencePlan,
  actorId: string,
  transition: XrMotionReferenceTransition,
  synthesizedPosition?: XrMotionReferenceVector,
): XrMotionReferencePlan | null {
  const track = plan.cast.find(candidate => candidate.actorId === actorId)
  if (!track) return null
  return replaceCastTrack(plan, actorId, source => {
    const marks = source.marks.map(mark => Object.freeze({ ...mark, transition }))
    if (transition === 'linear' && marks.length === 1 && synthesizedPosition) {
      const start = marks[0]!
      marks.push(Object.freeze({
        ...start,
        id: castMarkId(actorId, plan.durationSeconds),
        timeSeconds: plan.durationSeconds,
        position: synthesizedPosition,
      }))
    }
    return Object.freeze({
      ...source,
      animation: source.animation?.kind === 'action-path' ? null : source.animation,
      marks: Object.freeze(marks),
    })
  })
}

export function buildXrConstrainedCastTransitionPlan(input: Readonly<{
  actorId: string
  plan: XrMotionReferencePlan
  sceneKey: string
  transition: XrMotionReferenceTransition
}>): XrConstrainedCastTransitionResult {
  const { physics, physicsFrame } = constraintPhysics(input.sceneKey)
  const track = input.plan.cast.find(candidate => candidate.actorId === input.actorId)
  if (!track) return Object.freeze({ plan: null, reason: 'invalid-target', motion: null })
  if (input.transition !== 'linear' || track.marks.length !== 1) {
    return Object.freeze({
      plan: planWithCastTransition(input.plan, input.actorId, input.transition),
      reason: 'applied',
      motion: null,
    })
  }
  const start = track.marks[0]!
  const stage = resolveXrMotionReferenceStage(input.plan.stageId)
  const travelMeters = Math.min(2, Math.max(0.5, stage.sizeMeters[0] * 0.08))
  const desiredPosition: XrMotionReferenceVector = Object.freeze([
    start.position[0] + travelMeters,
    start.position[1],
    start.position[2],
  ])
  const provisionalPlan = planWithCastTransition(input.plan, input.actorId, input.transition, desiredPosition)!
  const motion = resolveXrSubjectMotion({
    actorId: input.actorId,
    desiredPosition,
    markId: castMarkId(input.actorId, input.plan.durationSeconds),
    physics,
    physicsFrame,
    plan: provisionalPlan,
    position: start.position,
    startTimeSeconds: start.timeSeconds,
    timeSeconds: input.plan.durationSeconds,
  })
  if (motion.status === 'physics-owned' || motion.status === 'obstructed') {
    return Object.freeze({ plan: null, reason: motion.status, motion })
  }
  const resolvedPlan = planWithCastTransition(input.plan, input.actorId, input.transition, motion.position)!
  const safe = !input.plan.subjects.some(subject => subject.id === input.actorId)
    || subjectTrackIsSafe({
      actorId: input.actorId,
      physics,
      physicsFrame,
      plan: resolvedPlan,
    })
  return safe
    ? Object.freeze({ plan: resolvedPlan, reason: 'applied', motion })
    : Object.freeze({ plan: null, reason: 'obstructed', motion })
}
