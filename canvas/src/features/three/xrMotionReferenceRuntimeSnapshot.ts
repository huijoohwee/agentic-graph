import { readXrMotionReferencePlan, type XrMotionReferencePlan, type XrMotionReferenceCameraRig } from './xrMotionReferenceModel'
import { readXrSubjectPartIds } from './xrSubjectAuthoring'
import type { XrMotionReferenceMarkSelection } from './xrMotionReferenceSelection'

export type XrMotionReferenceRuntimeSnapshot = Readonly<{
  sceneKey: string
  sourceSignature: string
  plan: XrMotionReferencePlan
  selectedActorId: string
  selectedShotTargetId: string
  selectedSubjectPart?: Readonly<{ sceneKey: string; subjectId: string; partId: string }> | null
  selectedCameraRig: XrMotionReferenceCameraRig
  selectedMark: XrMotionReferenceMarkSelection
  castMarkArmed: boolean
  playheadSeconds: number
  dirty: boolean
  revision: number
}>

/** One shared ephemeral part selection, revalidated whenever its scene/plan is published. */
export function freezeXrMotionReferenceSnapshot(value: XrMotionReferenceRuntimeSnapshot, previous?: XrMotionReferenceRuntimeSnapshot): XrMotionReferenceRuntimeSnapshot {
  const candidate = Object.hasOwn(value, 'selectedSubjectPart') ? value.selectedSubjectPart : previous?.selectedSubjectPart
  // Transport-only publication cannot rebuild a construction after metadata-cache eviction.
  if (previous && Object.isFrozen(previous) && Object.isFrozen(previous.plan) && value.plan === previous.plan
    && value.sceneKey === previous.sceneKey && value.selectedShotTargetId === previous.selectedShotTargetId
    && candidate !== undefined && candidate === previous.selectedSubjectPart && (candidate === null || Object.isFrozen(candidate))) {
    return Object.freeze({ ...value, selectedSubjectPart: candidate })
  }
  const subject = value.plan.subjects.find(item => item.id === value.selectedShotTargetId)
  const parts = subject?.construction ? readXrSubjectPartIds(subject.construction) : []
  const valid = candidate && candidate.sceneKey === value.sceneKey && candidate.subjectId === subject?.id && parts.includes(candidate.partId)
  const selectedSubjectPart = !value.sceneKey || !subject || !parts.length ? null
    : valid && candidate === previous?.selectedSubjectPart && Object.isFrozen(candidate) ? candidate
      : Object.freeze({ sceneKey: value.sceneKey, subjectId: subject.id, partId: valid ? candidate.partId : parts[0] })
  return Object.freeze({ ...value, selectedSubjectPart })
}

export function createInitialXrMotionReferenceSnapshot(): XrMotionReferenceRuntimeSnapshot {
  return freezeXrMotionReferenceSnapshot({
    sceneKey: '',
    sourceSignature: '',
    plan: readXrMotionReferencePlan(null, []),
    selectedActorId: '',
    selectedShotTargetId: '',
    selectedCameraRig: 'dolly',
    selectedMark: null,
    castMarkArmed: false,
    playheadSeconds: 0,
    dirty: false,
    revision: 0,
  })
}
