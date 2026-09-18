import { cleanTimelinePreviewDocumentKey } from '@/components/timeline/useTimelinePreviewBootstrap'
import { resolveXrMotionReferenceStage, type XrMotionReferencePlan } from './xrMotionReferenceModel'
import { resolveXrCameraMoveLabel } from './xrCameraMoveCatalog'

const XR_TIMELINE_MIN_CUE_MINUTES = 0.000001

export function xrMotionReferenceTimelineDocumentKey(documentName: unknown): string {
  const documentKey = cleanTimelinePreviewDocumentKey(String(documentName || ''))
  return `${documentKey || 'Untitled'}#xr-motion`
}

function timelineMinutes(timeSeconds: number): number {
  return Math.max(0, Number(timeSeconds) || 0) / 60
}

function fractionalMinutesToken(value: number): string {
  return String(Number(Math.max(0, value).toFixed(6)))
}

function positionToken(timeSeconds: number): string {
  return `kgpos_${fractionalMinutesToken(timelineMinutes(timeSeconds)).replace(/\./g, '_')}`
}

function durationToken(durationSeconds: number): string {
  return `${fractionalMinutesToken(Math.max(XR_TIMELINE_MIN_CUE_MINUTES, timelineMinutes(durationSeconds)))}m`
}

function cuePositionToken(timeSeconds: number, durationSeconds: number): string {
  const durationMinutes = timelineMinutes(durationSeconds)
  const cueMinutes = Math.min(
    timelineMinutes(timeSeconds),
    Math.max(0, durationMinutes - XR_TIMELINE_MIN_CUE_MINUTES),
  )
  return `kgpos_${fractionalMinutesToken(cueMinutes).replace(/\./g, '_')}`
}

function stableToken(value: string): string {
  return String(value || 'item')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'item'
}

/** Resolve the same generated animation row identity used by the native ruler. */
export function resolveXrTimelineAnimationTrack(plan: XrMotionReferencePlan, rowKey: string) {
  return plan.cast.find(track => track.animation && new RegExp(`xr_animation_effect_${stableToken(track.actorId)}(?:$|[^a-z0-9_])`).test(rowKey))
}

/**
 * Projects the native XR plan into the same Mermaid-Gantt vocabulary used by
 * the consolidated BottomPanel Timeline player. Seconds stay authoritative;
 * only the transport projection uses fractional minute units.
 */
export function buildXrMotionReferenceTimelineCode(
  plan: XrMotionReferencePlan,
  options: { includeChoreographyCues?: boolean } = {},
): string {
  const includeChoreographyCues = options.includeChoreographyCues !== false
  const stage = resolveXrMotionReferenceStage(plan.stageId)
  const lines = [
    'gantt',
    '  title Video Sequence',
    '  dateFormat HH:mm',
    '  axisFormat %M:%S',
    '  section XR Scene',
    `  ${stage.label} stage scene : xr_stage_scene, ${positionToken(0)}, ${durationToken(plan.durationSeconds)}`,
  ]

  for (const track of plan.cast) {
    const actorToken = stableToken(track.actorId)
    if (track.animation) {
      lines.push(
        `  ${track.label} ${track.animation.presetId} ${track.animation.kind} effect : xr_animation_effect_${actorToken}, ${positionToken(track.animation.startTimeSeconds)}, ${durationToken(plan.durationSeconds - track.animation.startTimeSeconds)}`,
      )
    }
    if (includeChoreographyCues) track.marks.forEach((mark, index) => {
      lines.push(
        `  ${track.label} cast mark ${index + 1} scene : vert, xr_cast_scene_${actorToken}_${index + 1}, ${cuePositionToken(mark.timeSeconds, plan.durationSeconds)}, ${durationToken(0)}`,
      )
      const nextMark = track.marks[index + 1]
      if (!nextMark || nextMark.timeSeconds <= mark.timeSeconds) return
      lines.push(
        `  ${track.label} ${mark.gait} ${mark.transition} scene : xr_cast_scene_${actorToken}_move_${index + 1}, ${positionToken(mark.timeSeconds)}, ${durationToken(nextMark.timeSeconds - mark.timeSeconds)}`,
      )
    })
  }

  lines.push(
    '  section XR Runtime',
    `  XR runtime effect : xr_runtime_effect, ${positionToken(0)}, ${durationToken(plan.durationSeconds)}`,
  )
  if (includeChoreographyCues) plan.camera.forEach((mark, index) => {
    lines.push(
      `  Camera mark ${index + 1} effect (${resolveXrCameraMoveLabel(mark.moveId)} · ${mark.rig}) : vert, xr_camera_effect_${index + 1}, ${cuePositionToken(mark.timeSeconds, plan.durationSeconds)}, ${durationToken(0)}`,
    )
  })

  return lines.join('\n')
}
