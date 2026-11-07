import type { StrybldrCameraSettings } from '@/features/strybldr/strybldrCamera'
import { XR_MOTION_REFERENCE_MAX_CAMERA_MARKS, type XrMotionReferenceCameraRig, type XrMotionReferencePlan } from './xrMotionReferenceModel'
import type { XrMotionReferenceRuntimeSnapshot } from './xrMotionReferenceRuntimeSnapshot'
import type { XrChoreographyEasing } from './xrChoreographyEasing'
import { resolveXrShotTarget } from './xrShotTargets'

type Snapshot = XrMotionReferenceRuntimeSnapshot
type Dependencies = Readonly<{
  publish: (next: Omit<Snapshot, 'revision'>) => Snapshot
  setCameraMarkChoreography: (args: { markId: string; settings: StrybldrCameraSettings }) => Snapshot
  setCameraMark: (args: { timeSeconds: number; anchorId: string; settings: StrybldrCameraSettings; rig?: XrMotionReferenceCameraRig; easing?: XrChoreographyEasing }) => Snapshot
}>

export function applyXrMotionReferenceCameraSettingsAtPlayhead(
  snapshot: Snapshot,
  settings: StrybldrCameraSettings,
  dependencies: Dependencies,
): Snapshot {
  if (snapshot.plan.camera.length === 0) return snapshot
  const timeSeconds = Math.min(snapshot.plan.durationSeconds, Math.max(0, snapshot.playheadSeconds))
  const selectedId = snapshot.selectedMark?.kind === 'camera' ? snapshot.selectedMark.markId : ''
  const selectedMark = snapshot.plan.camera.find(mark => mark.id === selectedId)
  const keyedMark = snapshot.plan.camera.find(mark => Math.abs(mark.timeSeconds - timeSeconds) < 0.0005)
  const target = selectedMark && Math.abs(selectedMark.timeSeconds - timeSeconds) < 0.0005
    ? selectedMark
    : keyedMark
  if (target) {
    const updated = dependencies.setCameraMarkChoreography({ markId: target.id, settings })
    return updated === snapshot ? snapshot : dependencies.publish({
      ...updated,
      selectedMark: Object.freeze({ kind: 'camera', markId: target.id }),
      selectedShotTargetId: target.anchorId,
      selectedActorId: updated.plan.cast.some(track => track.actorId === target.anchorId) ? target.anchorId : '',
    })
  }
  if (snapshot.plan.camera.length >= XR_MOTION_REFERENCE_MAX_CAMERA_MARKS) return snapshot
  const nearest = snapshot.plan.camera.reduce((closest, mark) => (
    Math.abs(mark.timeSeconds - timeSeconds) < Math.abs(closest.timeSeconds - timeSeconds) ? mark : closest
  ), snapshot.plan.camera[0]!)
  const anchorId = resolveXrShotTarget(snapshot.plan as XrMotionReferencePlan, snapshot.selectedShotTargetId)
    ? snapshot.selectedShotTargetId
    : nearest.anchorId
  const next = dependencies.setCameraMark({
    timeSeconds,
    anchorId,
    settings,
    rig: nearest.rig,
    easing: nearest.easing,
  })
  const created = next.plan.camera.find(mark => Math.abs(mark.timeSeconds - timeSeconds) < 0.0005)
  if (next === snapshot || !created) return snapshot
  return dependencies.publish({
    ...next,
    selectedMark: Object.freeze({ kind: 'camera', markId: created.id }),
    selectedShotTargetId: created.anchorId,
    selectedActorId: next.plan.cast.some(track => track.actorId === created.anchorId) ? created.anchorId : '',
  })
}
