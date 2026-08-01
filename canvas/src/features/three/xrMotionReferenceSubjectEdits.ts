import {
  resolveXrMotionReferenceStage,
  XR_MOTION_REFERENCE_MAX_CAST_TRACKS,
  XR_MOTION_REFERENCE_MAX_SUBJECTS,
  type XrMotionReferencePlan,
  type XrMotionReferenceVector,
} from './xrMotionReferenceModel'
import { defaultXrChoreographyGait } from './xrChoreographyEasing'
import {
  xrMotionReferenceCastTrackRecord as castTrackRecord,
  xrMotionReferencePlanRecord as planRecord,
} from './xrMotionReferenceRuntimeRecords'
import { resolveXrSceneLibraryAsset } from './xrSceneLibrary'
import {
  resolveNextXrSubjectId,
  resolveNextXrSubjectPlacement,
} from './xrMotionReferenceSubjectPlacement'

export type XrMotionReferenceSubjectEdit = Readonly<{
  value: Record<string, unknown>
  clearArchivedActorId?: string
}>

export function buildXrMotionReferenceSubjectAddEdit(
  planValue: XrMotionReferencePlan,
  args: Readonly<{ assetId: string; label?: string }>,
): XrMotionReferenceSubjectEdit | null {
  if (planValue.subjects.length >= XR_MOTION_REFERENCE_MAX_SUBJECTS) return null
  const asset = resolveXrSceneLibraryAsset(args.assetId)
  const plan = planRecord(planValue)
  const id = resolveNextXrSubjectId(asset.id, planValue.subjects)
  const label = String(args.label || asset.label).trim().slice(0, 80) || asset.label
  const position = resolveNextXrSubjectPlacement(
    resolveXrMotionReferenceStage(planValue.stageId),
    asset.id,
    planValue.subjects,
  )
  const subjects = Array.isArray(plan.subjects) ? plan.subjects.slice() : []
  subjects.push({ id, assetId: asset.id, label, color: asset.defaultColor, position: [...position], rotationYDegrees: 0, scale: 1 })
  const cast = Array.isArray(plan.cast) ? plan.cast.slice() : []
  if (asset.mobile && cast.length < XR_MOTION_REFERENCE_MAX_CAST_TRACKS) {
    cast.push({ actorId: id, label, animation: null, marks: [{ timeSeconds: 0, position: [...position], transition: 'linear', gait: defaultXrChoreographyGait(asset.category) }] })
  }
  return { value: { ...plan, subjects, cast } }
}

export function buildXrMotionReferenceSubjectLabelEdit(
  planValue: XrMotionReferencePlan,
  subjectIdValue: string,
  nextLabelValue: string,
): XrMotionReferenceSubjectEdit | null {
  const subjectId = String(subjectIdValue || '').trim()
  const nextLabel = String(nextLabelValue || '').trim().slice(0, 80)
  if (!subjectId || !nextLabel) return null
  const subjects = planValue.subjects.map(subject => (
    subject.id === subjectId ? { ...subject, label: nextLabel } : subject
  ))
  if (!subjects.some(subject => subject.id === subjectId)) return null
  const cast = planValue.cast.map(track => ({
    ...castTrackRecord(track),
    label: track.actorId === subjectId ? nextLabel : track.label,
  }))
  return { value: { ...planRecord(planValue), subjects, cast } }
}

export function buildXrMotionReferenceSubjectAssetEdit(
  planValue: XrMotionReferencePlan,
  args: Readonly<{ subjectId: string; assetId: string }>,
): XrMotionReferenceSubjectEdit | null {
  const subjectId = String(args.subjectId || '').trim()
  const requestedAssetId = String(args.assetId || '').trim()
  const subject = planValue.subjects.find(candidate => candidate.id === subjectId)
  if (!subject) return null
  const previousAsset = resolveXrSceneLibraryAsset(subject.assetId)
  const nextAsset = resolveXrSceneLibraryAsset(requestedAssetId)
  if (nextAsset.id !== requestedAssetId || nextAsset.id === previousAsset.id) return null
  const existingTrack = planValue.cast.find(track => track.actorId === subjectId)
  if (nextAsset.mobile && !existingTrack && planValue.cast.length >= XR_MOTION_REFERENCE_MAX_CAST_TRACKS) return null

  const previousDefaultGait = defaultXrChoreographyGait(previousAsset.category)
  const nextDefaultGait = defaultXrChoreographyGait(nextAsset.category)
  const nextLabel = subject.label === previousAsset.label ? nextAsset.label : subject.label
  const nextColor = subject.color.toLowerCase() === previousAsset.defaultColor.toLowerCase()
    ? nextAsset.defaultColor
    : subject.color
  const subjects = planValue.subjects.map(candidate => candidate.id === subjectId ? {
    ...candidate,
    assetId: nextAsset.id,
    category: nextAsset.category,
    label: nextLabel,
    color: nextColor,
  } : candidate)
  let cast: readonly Record<string, unknown>[]
  if (!nextAsset.mobile) {
    cast = planValue.cast.filter(track => track.actorId !== subjectId).map(castTrackRecord)
  } else if (existingTrack) {
    cast = planValue.cast.map(track => track.actorId === subjectId ? {
      ...castTrackRecord(track),
      label: nextLabel,
      marks: track.marks.map(mark => ({
        timeSeconds: mark.timeSeconds,
        position: [...mark.position],
        transition: mark.transition,
        gait: mark.gait === previousDefaultGait ? nextDefaultGait : mark.gait,
      })),
    } : castTrackRecord(track))
  } else {
    cast = [
      ...planValue.cast.map(castTrackRecord),
      {
        actorId: subjectId,
        label: nextLabel,
        animation: null,
        marks: [{ timeSeconds: 0, position: [...subject.position], transition: 'linear', gait: nextDefaultGait }],
      },
    ]
  }
  return {
    value: { ...planRecord(planValue), subjects, cast },
    clearArchivedActorId: nextAsset.mobile ? undefined : subjectId,
  }
}

export function buildXrMotionReferenceSubjectTransformEdit(
  planValue: XrMotionReferencePlan,
  args: Readonly<{
    subjectId: string
    position?: XrMotionReferenceVector
    rotationYDegrees?: number
    scale?: number
    color?: string
  }>,
): XrMotionReferenceSubjectEdit | null {
  const subjectId = String(args.subjectId || '').trim()
  const subject = planValue.subjects.find(candidate => candidate.id === subjectId)
  if (!subject) return null
  const nextPosition = args.position || subject.position
  const delta: XrMotionReferenceVector = [
    nextPosition[0] - subject.position[0],
    nextPosition[1] - subject.position[1],
    nextPosition[2] - subject.position[2],
  ]
  const subjects = planValue.subjects.map(candidate => candidate.id === subjectId ? {
    ...candidate,
    position: [...nextPosition],
    rotationYDegrees: args.rotationYDegrees ?? candidate.rotationYDegrees,
    scale: args.scale ?? candidate.scale,
    color: args.color ?? candidate.color,
  } : candidate)
  const cast = planValue.cast.map(track => ({
    ...castTrackRecord(track),
    marks: track.marks.map(mark => ({
      timeSeconds: mark.timeSeconds,
      position: track.actorId === subjectId
        ? [mark.position[0] + delta[0], mark.position[1] + delta[1], mark.position[2] + delta[2]]
        : [...mark.position],
      transition: mark.transition,
      gait: mark.gait,
    })),
  }))
  return { value: { ...planRecord(planValue), subjects, cast } }
}

export function buildXrMotionReferenceSubjectRemoveEdit(
  planValue: XrMotionReferencePlan,
  subjectIdValue: string,
): XrMotionReferenceSubjectEdit | null {
  const subjectId = String(subjectIdValue || '').trim()
  if (!planValue.subjects.some(subject => subject.id === subjectId)) return null
  const subjects = planValue.subjects.filter(subject => subject.id !== subjectId)
  const cast = planValue.cast.filter(track => track.actorId !== subjectId).map(castTrackRecord)
  return { value: { ...planRecord(planValue), subjects, cast } }
}
