import type { GraphNode } from '@/lib/graph/types'
import type { StrybldrCameraSettings } from '@/features/strybldr/strybldrCamera'
import {
  readXrMotionReferencePlan,
  XR_MOTION_REFERENCE_MAX_CAMERA_MARKS,
  XR_MOTION_REFERENCE_MAX_CAST_MARKS,
  type XrMotionReferencePlan,
  type XrMotionReferenceCameraRig,
  type XrMotionReferenceStageId,
  type XrMotionReferenceTransition,
  type XrMotionReferenceVector,
} from '@/features/three/xrMotionReferenceModel'
import {
  defaultXrCameraEasing,
  defaultXrChoreographyGait,
  type XrChoreographyEasing,
  type XrChoreographyGait,
} from './xrChoreographyEasing'
import type { XrCameraMoveId } from './xrCameraMoveCatalog'
import {
  xrMotionReferenceCastTrackRecord as castTrackRecord,
  xrMotionReferencePlanRecord as planRecord,
  xrMotionReferenceSourceSignature as sourceSignature,
} from './xrMotionReferenceRuntimeRecords'
import {
  buildCameraMarkChoreographyEdit,
  buildCastMarkChoreographyEdit,
} from './xrMotionReferenceChoreographyEdits'
import { resolveExistingXrMotionReferenceMarkSelection, resolveRetimedCameraMarkSelection, resolveRetimedCastMarkSelection, type XrMotionReferenceMarkSelection } from './xrMotionReferenceSelection'
import type { XrAnimationPathMark, XrAnimationPresetId } from '@/features/three/xrAnimationCatalog'
import {
  buildXrMotionReferenceSubjectAddEdit,
  buildXrMotionReferenceSubjectLabelEdit,
  buildXrMotionReferenceSubjectRemoveEdit,
  type XrMotionReferenceSubjectEdit,
} from './xrMotionReferenceSubjectEdits'
import {
  resolveDefaultXrShotTargetId,
  resolveXrShotTarget,
} from './xrShotTargets'
import {
  buildXrConstrainedCastTransitionPlan,
  buildXrConstrainedSubjectAssetTransformEdit,
  buildXrConstrainedSubjectTransformEdit,
  isXrConstrainedMotionPlanSafe,
  resolveXrConstrainedCastMarkDrop,
} from './xrConstrainedMotionEdits'
import { rebuildAssignedXrActionPaths } from './xrAssignedActionPathRebuild'
import {
  buildXrMotionReferenceCastAnimationClearEdit,
  buildXrMotionReferenceCastAnimationEdit,
} from './xrMotionReferenceAnimationEdits'
export type { XrMotionReferenceMarkSelection } from './xrMotionReferenceSelection'
export type XrMotionReferenceRuntimeSnapshot = Readonly<{
  sceneKey: string
  sourceSignature: string
  plan: XrMotionReferencePlan
  selectedActorId: string
  selectedShotTargetId: string
  selectedCameraRig: XrMotionReferenceCameraRig
  selectedMark: XrMotionReferenceMarkSelection
  castMarkArmed: boolean
  playheadSeconds: number
  dirty: boolean
  revision: number
}>
type RuntimeListener = () => void
const listeners = new Set<RuntimeListener>()
let activeNodes: readonly GraphNode[] = []
const dirtyCastArchive = new Map<string, Record<string, unknown>>()
function freezeSnapshot(value: Omit<XrMotionReferenceRuntimeSnapshot, 'revision'> & { revision: number }): XrMotionReferenceRuntimeSnapshot {
  return Object.freeze({ ...value })
}
let snapshot = freezeSnapshot({
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
function publish(next: Omit<XrMotionReferenceRuntimeSnapshot, 'revision'>): XrMotionReferenceRuntimeSnapshot {
  snapshot = freezeSnapshot({ ...next, revision: snapshot.revision + 1 })
  for (const listener of [...listeners]) listener()
  return snapshot
}
function normalizePlan(value: Record<string, unknown>): XrMotionReferencePlan {
  return readXrMotionReferencePlan(value, activeNodes)
}
function archiveCast(plan: XrMotionReferencePlan): void {
  const cast = planRecord(plan).cast
  if (!Array.isArray(cast)) return
  for (const item of cast) {
    const record = item as Record<string, unknown>
    const actorId = String(record.actorId || '').trim()
    if (actorId) dirtyCastArchive.set(actorId, record)
  }
}
function updatePlan(
  value: Record<string, unknown>,
  resolveSelection?: (plan: XrMotionReferencePlan) => XrMotionReferenceMarkSelection,
  validatePlan?: (plan: XrMotionReferencePlan) => boolean,
): XrMotionReferenceRuntimeSnapshot {
  const plan = normalizePlan(value)
  if (validatePlan && !validatePlan(plan)) return snapshot
  archiveCast(plan)
  const selectedActorId = plan.cast.some(track => track.actorId === snapshot.selectedActorId)
    ? snapshot.selectedActorId
    : plan.cast[0]?.actorId || ''
  const selectedShotTargetId = resolveDefaultXrShotTargetId(plan, snapshot.selectedShotTargetId, selectedActorId)
  return publish({
    ...snapshot,
    plan,
    selectedActorId,
    selectedShotTargetId,
    selectedMark: resolveExistingXrMotionReferenceMarkSelection(plan, resolveSelection ? resolveSelection(plan) : snapshot.selectedMark),
    playheadSeconds: Math.min(snapshot.playheadSeconds, plan.durationSeconds),
    dirty: true,
  })
}

function spatialPlanGuard(subjectIds?: readonly string[]): (plan: XrMotionReferencePlan) => boolean {
  const sceneKey = snapshot.sceneKey
  return plan => isXrConstrainedMotionPlanSafe({ plan, sceneKey, subjectIds })
}
export function readXrMotionReferenceRuntime(): XrMotionReferenceRuntimeSnapshot {
  return snapshot
}

export function subscribeXrMotionReferenceRuntime(listener: RuntimeListener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function restoreXrMotionReferenceRuntimeSnapshot(
  previous: XrMotionReferenceRuntimeSnapshot,
): XrMotionReferenceRuntimeSnapshot {
  dirtyCastArchive.clear()
  archiveCast(previous.plan)
  const { revision: _revision, ...restored } = previous
  return publish(restored)
}

export function hydrateXrMotionReferenceRuntime(args: {
  sceneKey: string
  nodes: readonly GraphNode[]
  persistedValue: unknown
}): XrMotionReferenceRuntimeSnapshot {
  const nextSourceSignature = sourceSignature(args.sceneKey, args.nodes, args.persistedValue)
  if (snapshot.sourceSignature === nextSourceSignature) return snapshot
  activeNodes = args.nodes.slice()
  if (snapshot.sceneKey === String(args.sceneKey || '') && snapshot.dirty) {
    archiveCast(snapshot.plan)
    const plan = readXrMotionReferencePlan({ ...planRecord(snapshot.plan), cast: [...dirtyCastArchive.values()] }, activeNodes)
    archiveCast(plan)
    const selectedActorId = plan.cast.some(track => track.actorId === snapshot.selectedActorId)
      ? snapshot.selectedActorId
      : plan.cast[0]?.actorId || ''
    const selectedShotTargetId = resolveDefaultXrShotTargetId(plan, snapshot.selectedShotTargetId, selectedActorId)
    return publish({
      ...snapshot,
      sourceSignature: nextSourceSignature,
      plan,
      selectedActorId,
      selectedShotTargetId,
      selectedMark: resolveExistingXrMotionReferenceMarkSelection(plan, snapshot.selectedMark),
      dirty: true,
    })
  }
  dirtyCastArchive.clear()
  const plan = readXrMotionReferencePlan(args.persistedValue, activeNodes)
  const selectedActorId = plan.cast.some(track => track.actorId === snapshot.selectedActorId)
    ? snapshot.selectedActorId
    : plan.cast[0]?.actorId || ''
  const selectedShotTargetId = resolveDefaultXrShotTargetId(plan, snapshot.selectedShotTargetId, selectedActorId)
  return publish({
    sceneKey: String(args.sceneKey || ''),
    sourceSignature: nextSourceSignature,
    plan,
    selectedActorId,
    selectedShotTargetId,
    selectedCameraRig: snapshot.selectedCameraRig,
    selectedMark: null,
    castMarkArmed: false,
    playheadSeconds: 0,
    dirty: false,
  })
}

export function setXrMotionReferenceStage(stageId: XrMotionReferenceStageId): XrMotionReferenceRuntimeSnapshot {
  return updatePlan({
    ...planRecord(snapshot.plan),
    stageId,
    cast: rebuildAssignedXrActionPaths({ plan: snapshot.plan, durationSeconds: snapshot.plan.durationSeconds }),
  }, undefined, spatialPlanGuard())
}

export function setXrMotionReferenceDuration(durationSeconds: number): XrMotionReferenceRuntimeSnapshot {
  const normalizedDuration = readXrMotionReferencePlan({ durationSeconds }).durationSeconds
  return updatePlan({
    ...planRecord(snapshot.plan),
    durationSeconds: normalizedDuration,
    cast: rebuildAssignedXrActionPaths({ plan: snapshot.plan, durationSeconds: normalizedDuration }),
  }, undefined, spatialPlanGuard())
}

export function setXrMotionReferenceFps(fps: number): XrMotionReferenceRuntimeSnapshot {
  return updatePlan({ ...planRecord(snapshot.plan), fps })
}

function applySubjectEdit(
  edit: XrMotionReferenceSubjectEdit | null,
  validatePlan?: (plan: XrMotionReferencePlan) => boolean,
): XrMotionReferenceRuntimeSnapshot {
  if (!edit) return snapshot
  const previous = snapshot
  const next = updatePlan(edit.value, undefined, validatePlan)
  if (next !== previous && edit.clearArchivedActorId) dirtyCastArchive.delete(edit.clearArchivedActorId)
  return next
}

export function addXrMotionReferenceSubject(args: {
  assetId: string
  label?: string
}): XrMotionReferenceRuntimeSnapshot {
  return applySubjectEdit(buildXrMotionReferenceSubjectAddEdit(snapshot.plan, args), spatialPlanGuard())
}

export function setXrMotionReferenceSubjectLabel(subjectIdValue: string, nextLabelValue: string): XrMotionReferenceRuntimeSnapshot {
  return applySubjectEdit(buildXrMotionReferenceSubjectLabelEdit(snapshot.plan, subjectIdValue, nextLabelValue))
}

export function setXrMotionReferenceSubjectAsset(args: Readonly<{
  subjectId: string
  assetId: string
}>): XrMotionReferenceRuntimeSnapshot {
  return setXrMotionReferenceSubjectAssetAndTransform(args)
}

export function setXrMotionReferenceSubjectAssetAndTransform(args: Readonly<{
  subjectId: string
  assetId: string
  position?: XrMotionReferenceVector
  rotationYDegrees?: number
  scale?: number
  color?: string
}>): XrMotionReferenceRuntimeSnapshot {
  const subject = snapshot.plan.subjects.find(candidate => candidate.id === args.subjectId)
  if (!subject) return snapshot
  if (subject.assetId === args.assetId) {
    return setXrMotionReferenceSubjectTransform(args)
  }
  const result = buildXrConstrainedSubjectAssetTransformEdit({
    activeNodes,
    args,
    plan: snapshot.plan,
    sceneKey: snapshot.sceneKey,
  })
  return applySubjectEdit(result.edit, spatialPlanGuard())
}

export function setXrMotionReferenceSubjectTransform(args: Readonly<{
  subjectId: string
  position?: XrMotionReferenceVector
  rotationYDegrees?: number
  scale?: number
  color?: string
}>): XrMotionReferenceRuntimeSnapshot {
  const result = buildXrConstrainedSubjectTransformEdit({
    args,
    plan: snapshot.plan,
    sceneKey: snapshot.sceneKey,
  })
  return applySubjectEdit(result.edit, spatialPlanGuard())
}

export function removeXrMotionReferenceSubject(subjectIdValue: string): XrMotionReferenceRuntimeSnapshot {
  return applySubjectEdit(buildXrMotionReferenceSubjectRemoveEdit(snapshot.plan, subjectIdValue))
}

export function setXrMotionReferencePlayhead(timeSeconds: number): XrMotionReferenceRuntimeSnapshot {
  const playheadSeconds = Math.min(snapshot.plan.durationSeconds, Math.max(0, Number(timeSeconds) || 0))
  if (playheadSeconds === snapshot.playheadSeconds) return snapshot
  return publish({ ...snapshot, playheadSeconds })
}

export function selectXrMotionReferenceActor(actorId: string): XrMotionReferenceRuntimeSnapshot {
  const normalized = String(actorId || '').trim()
  if (!snapshot.plan.cast.some(track => track.actorId === normalized)) return snapshot
  if (normalized === snapshot.selectedActorId && normalized === snapshot.selectedShotTargetId) return snapshot
  const selectedMark = snapshot.selectedMark?.kind === 'cast' && snapshot.selectedMark.actorId !== normalized
    ? null
    : snapshot.selectedMark
  return publish({ ...snapshot, selectedActorId: normalized, selectedShotTargetId: normalized, selectedMark })
}

export function selectXrMotionReferenceShotTarget(targetIdValue: string): XrMotionReferenceRuntimeSnapshot {
  const targetId = String(targetIdValue || '').trim()
  if (!resolveXrShotTarget(snapshot.plan, targetId) || targetId === snapshot.selectedShotTargetId) return snapshot
  const selectedMark = snapshot.selectedMark?.kind === 'camera'
    && snapshot.plan.camera.some(mark => mark.id === snapshot.selectedMark?.markId && mark.anchorId === targetId)
    ? snapshot.selectedMark
    : null
  return publish({ ...snapshot, selectedShotTargetId: targetId, selectedMark })
}

export function selectXrMotionReferenceCastMark(
  actorIdValue: string,
  markIdValue: string,
): XrMotionReferenceRuntimeSnapshot {
  const actorId = String(actorIdValue || '').trim()
  const markId = String(markIdValue || '').trim()
  const track = snapshot.plan.cast.find(candidate => candidate.actorId === actorId)
  if (!track?.marks.some(mark => mark.id === markId)) return snapshot
  if (snapshot.selectedMark?.kind === 'cast'
    && snapshot.selectedMark.actorId === actorId
    && snapshot.selectedMark.markId === markId
    && snapshot.selectedActorId === actorId) return snapshot
  return publish({
    ...snapshot,
    selectedActorId: actorId,
    selectedShotTargetId: actorId,
    selectedMark: Object.freeze({ kind: 'cast', actorId, markId }),
  })
}

export function selectXrMotionReferenceCameraMark(markIdValue: string): XrMotionReferenceRuntimeSnapshot {
  const markId = String(markIdValue || '').trim()
  const mark = snapshot.plan.camera.find(candidate => candidate.id === markId)
  if (!mark) return snapshot
  const selectedShotTargetId = resolveXrShotTarget(snapshot.plan, mark.anchorId)
    ? mark.anchorId
    : snapshot.selectedShotTargetId
  if (snapshot.selectedMark?.kind === 'camera'
    && snapshot.selectedMark.markId === markId
    && snapshot.selectedShotTargetId === selectedShotTargetId) return snapshot
  return publish({ ...snapshot, selectedShotTargetId, selectedMark: Object.freeze({ kind: 'camera', markId }) })
}

export function setXrMotionReferenceCameraRig(rig: XrMotionReferenceCameraRig): XrMotionReferenceRuntimeSnapshot {
  if (rig === snapshot.selectedCameraRig) return snapshot
  return publish({ ...snapshot, selectedCameraRig: rig })
}

export function setXrMotionReferenceCastMarkArmed(armed: boolean): XrMotionReferenceRuntimeSnapshot {
  const nextArmed = armed === true && Boolean(snapshot.selectedActorId)
  if (nextArmed === snapshot.castMarkArmed) return snapshot
  return publish({ ...snapshot, castMarkArmed: nextArmed })
}

export function toggleXrMotionReferenceCastMarkArmed(): XrMotionReferenceRuntimeSnapshot {
  return setXrMotionReferenceCastMarkArmed(!snapshot.castMarkArmed)
}

export function setXrMotionReferenceCastMark(args: {
  actorId: string
  timeSeconds: number
  position: XrMotionReferenceVector
  transition?: XrMotionReferenceTransition
  gait?: XrChoreographyGait
}): XrMotionReferenceRuntimeSnapshot {
  const actorId = String(args.actorId || '').trim()
  const sourceTrack = snapshot.plan.cast.find(candidate => candidate.actorId === actorId)
  if (!sourceTrack) return snapshot
  const subject = snapshot.plan.subjects.find(candidate => candidate.id === actorId)
  const plan = planRecord(snapshot.plan)
  const cast = Array.isArray(plan.cast) ? plan.cast.map(item => ({ ...(item as Record<string, unknown>) })) : []
  const track = cast.find(item => item.actorId === actorId)
  if (!track) return snapshot
  const marks = Array.isArray(track.marks) ? track.marks.slice() : []
  const replacing = marks.some(mark => Math.abs(Number((mark as Record<string, unknown>).timeSeconds) - args.timeSeconds) < 0.0005)
  if (marks.length >= XR_MOTION_REFERENCE_MAX_CAST_MARKS && !replacing) return snapshot
  marks.push({
    timeSeconds: args.timeSeconds,
    position: [...args.position],
    transition: args.transition || 'linear',
    gait: args.gait || sourceTrack.marks[0]?.gait || defaultXrChoreographyGait(subject || undefined),
  })
  track.marks = marks
  if ((track.animation as { kind?: unknown } | null)?.kind === 'action-path') track.animation = null
  return updatePlan({ ...plan, cast }, undefined, spatialPlanGuard([actorId]))
}

export function dropXrMotionReferenceCastMark(position: XrMotionReferenceVector): XrMotionReferenceRuntimeSnapshot {
  if (!snapshot.castMarkArmed || !snapshot.selectedActorId) return snapshot
  const track = snapshot.plan.cast.find(candidate => candidate.actorId === snapshot.selectedActorId)
  if (!track) return snapshot
  const result = resolveXrConstrainedCastMarkDrop({
    actorId: snapshot.selectedActorId,
    desiredPosition: position,
    gait: track.marks[0]?.gait || 'walk',
    plan: snapshot.plan,
    sceneKey: snapshot.sceneKey,
    timeSeconds: snapshot.playheadSeconds,
    transition: 'linear',
  })
  if (!result.position) return snapshot
  return setXrMotionReferenceCastMark({
    actorId: snapshot.selectedActorId,
    timeSeconds: snapshot.playheadSeconds,
    position: result.position,
    transition: 'linear',
    gait: track.marks[0]?.gait || 'walk',
  })
}

export function setXrMotionReferenceCastTransition(
  actorIdValue: string,
  transition: XrMotionReferenceTransition,
): XrMotionReferenceRuntimeSnapshot {
  const actorId = String(actorIdValue || '').trim()
  const result = buildXrConstrainedCastTransitionPlan({
    actorId,
    plan: snapshot.plan,
    sceneKey: snapshot.sceneKey,
    transition,
  })
  return result.plan
    ? updatePlan(planRecord(result.plan), undefined, spatialPlanGuard([actorId]))
    : snapshot
}

export function setXrMotionReferenceCastAnimation(
  actorIdValue: string, presetIdValue: XrAnimationPresetId, actionPathMarks?: readonly XrAnimationPathMark[],
): XrMotionReferenceRuntimeSnapshot {
  const actorId = String(actorIdValue || '').trim()
  const edit = buildXrMotionReferenceCastAnimationEdit({
    actionPathMarks,
    actorId,
    plan: snapshot.plan,
    playheadSeconds: snapshot.playheadSeconds,
    presetId: presetIdValue,
  })
  if (!edit) return snapshot
  return updatePlan(
    edit.value,
    undefined,
    edit.actionPath ? spatialPlanGuard([actorId]) : undefined,
  )
}
export function clearXrMotionReferenceCastAnimation(actorIdValue: string): XrMotionReferenceRuntimeSnapshot {
  const actorId = String(actorIdValue || '').trim()
  const edit = buildXrMotionReferenceCastAnimationClearEdit({
    actorId,
    plan: snapshot.plan,
    playheadSeconds: snapshot.playheadSeconds,
  })
  return edit ? updatePlan(edit, undefined, spatialPlanGuard([actorId])) : snapshot
}

export function removeXrMotionReferenceCastMark(actorIdValue: string, markId: string): XrMotionReferenceRuntimeSnapshot {
  const actorId = String(actorIdValue || '').trim()
  const plan = planRecord(snapshot.plan)
  const sourceTrack = snapshot.plan.cast.find(track => track.actorId === actorId)
  if (!sourceTrack || sourceTrack.marks.length <= 1 || !sourceTrack.marks.some(mark => mark.id === markId)) return snapshot
  const cast = snapshot.plan.cast.map(track => ({
    ...castTrackRecord(track),
    animation: track.actorId === actorId && track.animation?.kind === 'action-path' ? null : track.animation,
    marks: track.marks
      .filter(mark => track.actorId !== actorId || mark.id !== markId)
      .map(mark => ({ timeSeconds: mark.timeSeconds, position: [...mark.position], transition: mark.transition, gait: mark.gait })),
  }))
  return updatePlan({ ...plan, cast }, undefined, spatialPlanGuard([actorId]))
}

export function retimeXrMotionReferenceCastMark(
  actorIdValue: string,
  markId: string,
  timeSeconds: number,
): XrMotionReferenceRuntimeSnapshot {
  const actorId = String(actorIdValue || '').trim()
  const sourceTrack = snapshot.plan.cast.find(track => track.actorId === actorId)
  if (!sourceTrack || !sourceTrack.marks.some(mark => mark.id === markId)) return snapshot
  const preserveSelection = snapshot.selectedMark?.kind === 'cast'
    && snapshot.selectedMark.actorId === actorId
    && snapshot.selectedMark.markId === markId
  const targetTimeSeconds = Math.min(snapshot.plan.durationSeconds, Math.max(0, Number(timeSeconds) || 0))
  const plan = planRecord(snapshot.plan)
  const cast = snapshot.plan.cast.map(track => ({
    ...castTrackRecord(track),
    animation: track.actorId === actorId && track.animation?.kind === 'action-path' ? null : track.animation,
    marks: track.marks.map(mark => ({
      timeSeconds: track.actorId === actorId && mark.id === markId ? timeSeconds : mark.timeSeconds,
      position: [...mark.position],
      transition: mark.transition,
      gait: mark.gait,
    })),
  }))
  return updatePlan(
    { ...plan, cast },
    preserveSelection ? nextPlan => resolveRetimedCastMarkSelection(nextPlan, actorId, targetTimeSeconds) : undefined,
    spatialPlanGuard([actorId]),
  )
}

export function setXrMotionReferenceCameraMark(args: {
  timeSeconds: number
  anchorId: string
  settings: StrybldrCameraSettings
  moveId?: XrCameraMoveId
  rig?: XrMotionReferenceCameraRig
  easing?: XrChoreographyEasing
}): XrMotionReferenceRuntimeSnapshot {
  const plan = planRecord(snapshot.plan)
  const camera = Array.isArray(plan.camera) ? plan.camera.slice() : []
  const replacing = camera.some(mark => Math.abs(Number((mark as Record<string, unknown>).timeSeconds) - args.timeSeconds) < 0.0005)
  if (camera.length >= XR_MOTION_REFERENCE_MAX_CAMERA_MARKS && !replacing) return snapshot
  const rig = args.rig || snapshot.selectedCameraRig
  camera.push({
    timeSeconds: args.timeSeconds,
    anchorId: String(args.anchorId || '').trim(),
    moveId: args.moveId || 'custom',
    rig,
    easing: args.easing || defaultXrCameraEasing(rig),
    settings: { ...args.settings },
  })
  return updatePlan({ ...plan, camera })
}

export function removeXrMotionReferenceCameraMark(markId: string): XrMotionReferenceRuntimeSnapshot {
  const plan = planRecord(snapshot.plan)
  const camera = snapshot.plan.camera
    .filter(mark => mark.id !== markId)
    .map(mark => ({
      timeSeconds: mark.timeSeconds,
      anchorId: mark.anchorId,
      moveId: mark.moveId,
      rig: mark.rig,
      easing: mark.easing,
      settings: { ...mark.settings },
    }))
  return updatePlan({ ...plan, camera })
}

export function retimeXrMotionReferenceCameraMark(markId: string, timeSeconds: number): XrMotionReferenceRuntimeSnapshot {
  if (!snapshot.plan.camera.some(mark => mark.id === markId)) return snapshot
  const preserveSelection = snapshot.selectedMark?.kind === 'camera' && snapshot.selectedMark.markId === markId
  const targetTimeSeconds = Math.min(snapshot.plan.durationSeconds, Math.max(0, Number(timeSeconds) || 0))
  const plan = planRecord(snapshot.plan)
  const camera = snapshot.plan.camera.map(mark => ({
    timeSeconds: mark.id === markId ? timeSeconds : mark.timeSeconds,
    anchorId: mark.anchorId,
    moveId: mark.moveId,
    rig: mark.rig,
    easing: mark.easing,
    settings: { ...mark.settings },
  }))
  return updatePlan({ ...plan, camera }, preserveSelection ? nextPlan => resolveRetimedCameraMarkSelection(nextPlan, targetTimeSeconds) : undefined)
}

export function setXrMotionReferenceCastMarkChoreography(args: {
  actorId: string
  markId: string
  easing?: XrChoreographyEasing
  gait?: XrChoreographyGait
  position?: XrMotionReferenceVector
}): XrMotionReferenceRuntimeSnapshot {
  const edit = buildCastMarkChoreographyEdit(snapshot.plan, args)
  return edit
    ? updatePlan(edit, undefined, args.position || args.easing ? spatialPlanGuard([args.actorId]) : undefined)
    : snapshot
}

export function setXrMotionReferenceCameraMarkChoreography(args: Readonly<{ markId: string; easing?: XrChoreographyEasing; settings?: StrybldrCameraSettings }>): XrMotionReferenceRuntimeSnapshot {
  const edit = buildCameraMarkChoreographyEdit(snapshot.plan, args)
  return edit ? updatePlan(edit) : snapshot
}

export function markXrMotionReferenceSaved(persistedValue: unknown): XrMotionReferenceRuntimeSnapshot {
  const nextSourceSignature = sourceSignature(snapshot.sceneKey, activeNodes, persistedValue)
  dirtyCastArchive.clear()
  return publish({ ...snapshot, sourceSignature: nextSourceSignature, dirty: false })
}
