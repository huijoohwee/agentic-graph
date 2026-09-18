import type { XrMotionReferencePlan } from './xrMotionReferenceModel'
import { resolveXrCameraMoveLabel } from './xrCameraMoveCatalog'
import { buildXrShotTargets, resolveXrShotTargetPosition } from './xrShotTargets'

export type XrTimelineBeat = Readonly<{
  id: string
  kind: 'cast' | 'camera' | 'animation'
  targetId: string
  markId?: string
  timeSeconds: number
  label: string
  detail: string
}>

/** Read-only projection of authored cues. Equal-time cues remain distinct and ordered. */
export function buildXrTimelineBeats(plan: XrMotionReferencePlan): readonly XrTimelineBeat[] {
  const beats: XrTimelineBeat[] = []
  for (const track of plan.cast) {
    track.marks.forEach((mark, index) => beats.push({
      id: `cast:${track.actorId}:${mark.id}`, kind: 'cast', targetId: track.actorId,
      markId: mark.id, timeSeconds: mark.timeSeconds, label: track.label,
      detail: `Mark ${index + 1} · ${mark.gait} · ${mark.transition}`,
    }))
    if (track.animation) beats.push({
      id: `animation:${track.actorId}`, kind: 'animation', targetId: track.actorId,
      timeSeconds: track.animation.startTimeSeconds, label: track.label,
      detail: `${track.animation.presetId} · ${track.animation.kind}`,
    })
  }
  plan.camera.forEach((mark, index) => beats.push({
    id: `camera:${mark.id}`, kind: 'camera', targetId: mark.anchorId,
    markId: mark.id, timeSeconds: mark.timeSeconds, label: `Camera ${index + 1}`,
    detail: `${resolveXrCameraMoveLabel(mark.moveId)} · ${mark.rig}`,
  }))
  return beats.sort((left, right) => left.timeSeconds - right.timeSeconds)
}

export function activeXrTimelineBeatTime(beats: readonly XrTimelineBeat[], timeSeconds: number): number | null {
  let active: number | null = null
  for (const beat of beats) {
    if (beat.timeSeconds > timeSeconds + 1e-7) break
    active = beat.timeSeconds
  }
  return active
}

export function sampleXrTimelineSceneObjects(plan: XrMotionReferencePlan, timeSeconds: number) {
  return buildXrShotTargets(plan).filter(target => target.kind === 'object').map(target => {
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
  })
}
