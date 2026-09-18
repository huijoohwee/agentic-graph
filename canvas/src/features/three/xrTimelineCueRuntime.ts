import { useGraphStore } from '@/hooks/useGraphStore'
import { controlLocalAnimation } from './xrAnimationMcpRuntime'
import { selectXrMotionReferenceCastMark, selectXrMotionReferenceCameraMark, readXrMotionReferenceRuntime, setXrMotionReferenceCastMark } from './xrMotionReferenceRuntime'
import { controlXrSharedAssetControls } from './xrSharedAssetControlRuntime'
import { sampleXrMotionReferenceMarks, type XrMotionReferencePlan } from './xrMotionReferenceModel'
import { resolveXrTimelineAnimationTrack } from './xrMotionReferenceTimeline'

type XrTimelineCue = Readonly<{ kind: 'cast' | 'camera' | 'animation'; targetId: string; markId?: string; timeSeconds: number }>

/** Cue navigation delegates to the existing transport and selection owners. */
export function jumpToXrTimelineCue(beat: XrTimelineCue): void {
  const paused = controlLocalAnimation({ operation: 'pause' })
  const seek = paused.ok ? controlLocalAnimation({ operation: 'scrub', timeSeconds: beat.timeSeconds }) : paused
  const result = seek.ok ? controlXrSharedAssetControls({ operation: 'select-target', targetId: beat.targetId }) : seek
  if (!result.ok) {
    useGraphStore.getState().pushUiToast({ id: 'xr:beat-seek:error', kind: 'error', message: result.message })
    return
  }
  if (beat.kind !== 'animation') useGraphStore.getState().setMermaidDiagramSelectedRowKey('gantt', beat.kind === 'camera' ? 'xr-lane:camera' : `xr-lane:object:${beat.targetId}`)
  if (beat.kind === 'cast' && beat.markId) selectXrMotionReferenceCastMark(beat.targetId, beat.markId)
  if (beat.kind === 'camera' && beat.markId) selectXrMotionReferenceCameraMark(beat.markId)
}

/** Existing Gantt clip selection supplies animation cues; no second marker list. */
export function selectXrTimelineRow(plan: XrMotionReferencePlan, rowKey: string | null, selectScene: () => void): void {
  if (!rowKey) return
  if (rowKey.includes('xr_stage_scene')) { selectScene(); return }
  const track = resolveXrTimelineAnimationTrack(plan, rowKey)
  if (track?.animation) jumpToXrTimelineCue({ kind: 'animation', targetId: track.actorId, timeSeconds: track.animation.startTimeSeconds })
}

/** Author through the existing constrained plan owner and its native Save lifecycle. */
export function createXrTimelineCastMark(actorId: string, requestedSeconds: number): boolean {
  if (!Number.isFinite(requestedSeconds)) return false
  const selected = controlXrSharedAssetControls({ operation: 'select-target', targetId: actorId })
  if (!selected.ok) return false
  const { plan } = readXrMotionReferenceRuntime()
  const track = plan.cast.find(candidate => candidate.actorId === actorId)
  if (!track) return false
  const timeSeconds = Math.min(plan.durationSeconds, Math.max(0, Math.round(requestedSeconds * plan.fps) / plan.fps))
  const existing = track.marks.find(mark => Math.abs(mark.timeSeconds - timeSeconds) < 0.001)
  if (existing) {
    jumpToXrTimelineCue({ kind: 'cast', targetId: actorId, markId: existing.id, timeSeconds: existing.timeSeconds })
    return true
  }
  const paused = controlLocalAnimation({ operation: 'pause' })
  if (!paused.ok || !controlLocalAnimation({ operation: 'scrub', timeSeconds }).ok) return false
  const preceding = [...track.marks].reverse().find(mark => mark.timeSeconds <= timeSeconds) || track.marks[0]
  const next = setXrMotionReferenceCastMark({ actorId, timeSeconds,
    position: sampleXrMotionReferenceMarks(track.marks, timeSeconds), transition: preceding?.transition, gait: preceding?.gait })
  const mark = next.plan.cast.find(candidate => candidate.actorId === actorId)?.marks.find(candidate => Math.abs(candidate.timeSeconds - timeSeconds) < 0.001)
  if (!mark) {
    useGraphStore.getState().pushUiToast({ id: 'xr:mark-create:error', kind: 'error', message: 'The mark could not be added within this scene’s motion constraints or mark limit.' })
    return false
  }
  selectXrMotionReferenceCastMark(actorId, mark.id)
  return true
}
