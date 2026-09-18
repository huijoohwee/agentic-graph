import type { XrMotionReferencePlan } from './xrMotionReferenceModel'
import { buildXrShotTargets, resolveXrShotTargetPosition, type XrShotTarget } from './xrShotTargets'

export function sampleXrTimelineSceneObjects(plan: XrMotionReferencePlan, timeSeconds: number) {
  return buildXrShotTargets(plan).filter(target => target.kind === 'object').map(target => sampleXrTimelineSceneObject(plan, target, timeSeconds))
}

export function sampleXrTimelineSceneObject(plan: XrMotionReferencePlan, target: XrShotTarget, timeSeconds: number) {
  const track = plan.cast.find(candidate => candidate.actorId === target.id)
  const subject = plan.subjects.find(candidate => candidate.id === target.id)
  const rightIndex = track?.marks.findIndex(mark => mark.timeSeconds > timeSeconds) ?? -1
  const left = rightIndex > 0 ? track?.marks[rightIndex - 1] : undefined
  const right = rightIndex > 0 ? track?.marks[rightIndex] : undefined
  const moving = left && right && left.transition !== 'hold'
    && left.position.some((value, axis) => value !== right.position[axis])
  return {
    ...target,
    category: subject?.category || 'actor',
    motion: moving ? `${left.gait} · ${left.transition}` : 'hold',
    position: resolveXrShotTargetPosition(plan, target.id, timeSeconds),
  }
}
