import type {
  XrMotionReferencePlan,
  XrMotionReferenceVector,
} from './xrMotionReferenceModel'
import { sampleXrMotionReferenceMarks } from './xrMotionReferenceSampling'
import { resolveXrStageObjects, resolveXrMotionReferenceStage } from './xrSceneLibrary'

import { readSharedXrNativeControllerDemoFrame, XR_NATIVE_CONTROLLER_DEMO_KEY_POSITION, XR_NATIVE_CONTROLLER_DEMO_CHEST_POSITION } from './xrNativeControllerDemoRuntime'

export const XR_MOTION_REFERENCE_SCENE_SHOT_TARGET_ID = 'xr-shot:scene'

export type XrShotTarget = Readonly<{
  id: string
  kind: 'scene' | 'object'
  label: string
  color: string
  castActorId: string | null
}>

export function buildXrShotTargets(plan: XrMotionReferencePlan): readonly XrShotTarget[] {
  const stagePreset = resolveXrMotionReferenceStage(plan.stageId)
  const stage = Object.freeze<XrShotTarget>({
    id: XR_MOTION_REFERENCE_SCENE_SHOT_TARGET_ID,
    kind: 'scene',
    label: `${stagePreset.label} scene`,
    color: '#64748b',
    castActorId: null,
  })
  const subjects = plan.subjects.map(subject => Object.freeze<XrShotTarget>({
    id: subject.id,
    kind: 'object',
    label: subject.label,
    color: subject.color,
    castActorId: plan.cast.some(track => track.actorId === subject.id) ? subject.id : null,
  }))
  const subjectIds = new Set(plan.subjects.map(subject => subject.id))
  const graphObjects = plan.cast
    .filter(track => !subjectIds.has(track.actorId))
    .map(track => Object.freeze<XrShotTarget>({
      id: track.actorId,
      kind: 'object',
      label: track.label,
      color: track.color,
      castActorId: track.actorId,
    }))
  const stageObjects = resolveXrStageObjects(plan.stageId).filter(object => !subjectIds.has(object.id)).map(object => Object.freeze<XrShotTarget>({
    id: object.id, label: object.label, color: object.color, kind: 'object', castActorId: null,
  }))
  return Object.freeze([stage, ...subjects, ...graphObjects, ...stageObjects])
}

export function resolveXrShotTarget(plan: XrMotionReferencePlan, targetIdValue: string): XrShotTarget | null {
  const targetId = String(targetIdValue || '').trim()
  return buildXrShotTargets(plan).find(target => target.id === targetId) || null
}

export function resolveDefaultXrShotTargetId(
  plan: XrMotionReferencePlan,
  currentTargetId = '',
  preferredActorId = '',
): string {
  if (resolveXrShotTarget(plan, currentTargetId)) return currentTargetId
  if (resolveXrShotTarget(plan, preferredActorId)) return preferredActorId
  return plan.cast[0]?.actorId
    || plan.subjects[0]?.id
    || XR_MOTION_REFERENCE_SCENE_SHOT_TARGET_ID
}

export function resolveXrShotTargetPosition(
  plan: XrMotionReferencePlan,
  targetIdValue: string,
  timeSeconds: number,
): XrMotionReferenceVector {
  const targetId = String(targetIdValue || '').trim()
  const track = plan.cast.find(candidate => candidate.actorId === targetId)
  if (track) return sampleXrMotionReferenceMarks(track.marks, timeSeconds)
  const subject = plan.subjects.find(subject => subject.id === targetId)
  if (subject) return subject.position
  const object = resolveXrStageObjects(plan.stageId).find(object => object.id === targetId)
  if (object?.id === 'xr-stage:key') return XR_NATIVE_CONTROLLER_DEMO_KEY_POSITION
  if (object?.id === 'xr-stage:chest') return XR_NATIVE_CONTROLLER_DEMO_CHEST_POSITION
  if (object?.nativeBodyId) {
    const frame = readSharedXrNativeControllerDemoFrame()
    return (object.nativeBodyId === 'native-controller' ? frame.player : frame.bodies.find(body => body.subjectId === object.nativeBodyId))?.position || object.position
  }
  return object?.position || [0, 0, 0]
}
