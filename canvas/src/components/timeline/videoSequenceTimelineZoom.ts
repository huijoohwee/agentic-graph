import type { MermaidGanttTimelineTick } from '@/lib/mermaid/mermaidGanttBarInteraction'
import { formatVideoSequenceTimelineSecondsOffset } from './videoSequenceTimeline'
import { resolveVideoSequenceRulerInsetPixelMetrics } from './videoSequenceTimelineRulerGeometry'

const VIDEO_SEQUENCE_TIMELINE_ZOOM_TICK_TARGET_PER_ZOOM = 8
const VIDEO_SEQUENCE_TIMELINE_ZOOM_TICK_STEPS_SECONDS = [1, 2, 10, 15, 30, 60, 120, 300, 600] as const
const VIDEO_SEQUENCE_TIMELINE_SCALE_STEPS_SECONDS = [10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600] as const
const VIDEO_SEQUENCE_TIMELINE_APPEND_SPACE_MIN_ZOOM = 2
const VIDEO_SEQUENCE_TIMELINE_APPEND_SPACE_PER_ZOOM_PERCENT = 40
const VIDEO_SEQUENCE_TIMELINE_APPEND_SPACE_MAX_PERCENT = 160
const VIDEO_SEQUENCE_TIMELINE_FRAME_LABEL_ZOOM = 6
const VIDEO_SEQUENCE_TIMELINE_FRAME_TICK_STEP_FRAMES = 1
const VIDEO_SEQUENCE_TIMELINE_FRAME_LABEL_TARGETS_PER_SECOND = 6
const VIDEO_SEQUENCE_TIMELINE_FRAME_LABEL_STEPS = [1, 2, 5, 10, 15, 30] as const
const VIDEO_SEQUENCE_TIMELINE_FRAME_RULER_MIN_LABEL_SPACING_PX = 12
const VIDEO_SEQUENCE_TIMELINE_FRAME_RULER_REFERENCE_WIDTH_PX = 960
export const VIDEO_SEQUENCE_TIMELINE_DEFAULT_FRAME_RATE = 24
const VIDEO_SEQUENCE_TIMELINE_MAX_FRAME_TICKS = 1800

export function resolveVideoSequenceTimelineScaleDurationSeconds(durationSeconds: number): number {
  const duration = Number.isFinite(durationSeconds) && durationSeconds > 0 ? durationSeconds : 0
  if (duration <= 0) return 0
  const scaleStep = VIDEO_SEQUENCE_TIMELINE_SCALE_STEPS_SECONDS.find(step => duration <= step)
  if (scaleStep) return scaleStep
  const terminalStep = VIDEO_SEQUENCE_TIMELINE_SCALE_STEPS_SECONDS[VIDEO_SEQUENCE_TIMELINE_SCALE_STEPS_SECONDS.length - 1]
  return Math.ceil(duration / terminalStep) * terminalStep
}

export function resolveVideoSequenceTimelineScaleMaxMinutes(args: {
  maxMinutes: number
  mediaDurationSeconds: number
}): number {
  const maxMinutes = Number.isFinite(args.maxMinutes) && args.maxMinutes > 0 ? args.maxMinutes : 0
  const mediaDurationSeconds = Number.isFinite(args.mediaDurationSeconds) && args.mediaDurationSeconds > 0 ? args.mediaDurationSeconds : 0
  if (maxMinutes <= 0 || mediaDurationSeconds <= 0) return maxMinutes
  const scaleDurationSeconds = resolveVideoSequenceTimelineScaleDurationSeconds(mediaDurationSeconds)
  return Math.max(maxMinutes, (scaleDurationSeconds / mediaDurationSeconds) * maxMinutes)
}

export function resolveVideoSequenceTimelineZoomTickStepSeconds(args: {
  durationSeconds: number
  timelineZoom: number
}): number {
  const durationSeconds = Number.isFinite(args.durationSeconds) && args.durationSeconds > 0 ? args.durationSeconds : 0
  const timelineZoom = Number.isFinite(args.timelineZoom) && args.timelineZoom > 0 ? args.timelineZoom : 1
  if (durationSeconds <= 0) return 1
  const targetTickCount = Math.max(6, Math.round(timelineZoom * VIDEO_SEQUENCE_TIMELINE_ZOOM_TICK_TARGET_PER_ZOOM))
  const rawStep = Math.max(1, durationSeconds / targetTickCount)
  return VIDEO_SEQUENCE_TIMELINE_ZOOM_TICK_STEPS_SECONDS.find(step => step >= rawStep)
    || VIDEO_SEQUENCE_TIMELINE_ZOOM_TICK_STEPS_SECONDS[VIDEO_SEQUENCE_TIMELINE_ZOOM_TICK_STEPS_SECONDS.length - 1]
}

export function resolveVideoSequenceTimelineFrameRate(value: number): number {
  const frameRate = Number.isFinite(value) && value > 0 ? value : VIDEO_SEQUENCE_TIMELINE_DEFAULT_FRAME_RATE
  return Math.min(120, Math.max(1, frameRate))
}

function resolveVideoSequenceTimelineFrameTickStepFrames(totalFrames: number): number {
  const safeTotalFrames = Math.max(0, Math.round(Number.isFinite(totalFrames) ? totalFrames : 0))
  if (safeTotalFrames <= VIDEO_SEQUENCE_TIMELINE_MAX_FRAME_TICKS) return VIDEO_SEQUENCE_TIMELINE_FRAME_TICK_STEP_FRAMES
  const rawStep = Math.ceil(safeTotalFrames / VIDEO_SEQUENCE_TIMELINE_MAX_FRAME_TICKS)
  return Math.max(VIDEO_SEQUENCE_TIMELINE_FRAME_TICK_STEP_FRAMES, rawStep + (rawStep % 2))
}

function shouldUseVideoSequenceFrameTicks(args: {
  mediaDurationSeconds: number
  timelineZoom: number
}): boolean {
  return args.timelineZoom >= VIDEO_SEQUENCE_TIMELINE_FRAME_LABEL_ZOOM && args.mediaDurationSeconds > 0
}

function resolveVideoSequenceTimelineFrameLabelStepFrames(frameRate: number): number {
  const rawStepFrames = resolveVideoSequenceTimelineFrameRate(frameRate) / VIDEO_SEQUENCE_TIMELINE_FRAME_LABEL_TARGETS_PER_SECOND
  return VIDEO_SEQUENCE_TIMELINE_FRAME_LABEL_STEPS.find(step => step >= rawStepFrames)
    || VIDEO_SEQUENCE_TIMELINE_FRAME_LABEL_STEPS[VIDEO_SEQUENCE_TIMELINE_FRAME_LABEL_STEPS.length - 1]
}

function formatVideoSequenceTimelineFrameLabel(frame: number, frameRate: number): string {
  if (frame <= 0) return '00:00'
  const wholeSeconds = Math.floor(frame / frameRate)
  const frameInSecond = frame - wholeSeconds * frameRate
  if (frameInSecond === 0) return formatVideoSequenceTimelineSecondsOffset(wholeSeconds)
  const labelStepFrames = resolveVideoSequenceTimelineFrameLabelStepFrames(frameRate)
  const maxFrameLabel = frameRate - Math.ceil(labelStepFrames / 2)
  if (frameInSecond <= maxFrameLabel && frameInSecond % labelStepFrames === 0) {
    return `${frameInSecond}f`
  }
  return ''
}

function buildVideoSequenceTimelineFrameTicks(args: {
  frameRate: number
  maxMinutes: number
  scaleDurationSeconds: number
}): readonly MermaidGanttTimelineTick[] {
  const frameRate = resolveVideoSequenceTimelineFrameRate(args.frameRate)
  const totalFrames = Math.max(1, Math.round(args.scaleDurationSeconds * frameRate))
  const stepFrames = resolveVideoSequenceTimelineFrameTickStepFrames(totalFrames)
  const ticks: MermaidGanttTimelineTick[] = []
  for (let frame = 0; frame < totalFrames; frame += stepFrames) {
    const seconds = frame / frameRate
    const minutes = (seconds / args.scaleDurationSeconds) * args.maxMinutes
    ticks.push({
      label: formatVideoSequenceTimelineFrameLabel(frame, frameRate),
      minutes,
      percent: (minutes / args.maxMinutes) * 100,
    })
  }
  ticks.push({
    label: formatVideoSequenceTimelineSecondsOffset(args.scaleDurationSeconds),
    minutes: args.maxMinutes,
    percent: 100,
  })
  return ticks
}

export function resolveVideoSequenceTimelineContentZoom(args: {
  frameRate?: number
  mediaDurationSeconds: number
  timelineZoom: number
}): number {
  const timelineZoom = Number.isFinite(args.timelineZoom) && args.timelineZoom > 0 ? args.timelineZoom : 1
  const mediaDurationSeconds = Number.isFinite(args.mediaDurationSeconds) && args.mediaDurationSeconds > 0 ? args.mediaDurationSeconds : 0
  if (!shouldUseVideoSequenceFrameTicks({ mediaDurationSeconds, timelineZoom })) return timelineZoom
  const frameRate = resolveVideoSequenceTimelineFrameRate(args.frameRate || 0)
  const labelSpacingPercent = (resolveVideoSequenceTimelineFrameLabelStepFrames(frameRate) / Math.max(1, Math.round(mediaDurationSeconds * frameRate))) * 100
  if (labelSpacingPercent <= 0) return timelineZoom
  const minimumContentScale = (VIDEO_SEQUENCE_TIMELINE_FRAME_RULER_MIN_LABEL_SPACING_PX * 100) / (VIDEO_SEQUENCE_TIMELINE_FRAME_RULER_REFERENCE_WIDTH_PX * labelSpacingPercent)
  return Math.max(timelineZoom + 1, Math.ceil(minimumContentScale))
}

export function resolveVideoSequenceTimelineWorkspaceLayout(args: {
  appendSpacePercent: number
  timelineContentZoom: number
}): {
  appendFlexPercent: number
  viewportFlexPercent: number
  workspaceWidthPercent: number
} {
  const timelineContentZoom = Number.isFinite(args.timelineContentZoom) && args.timelineContentZoom > 0 ? args.timelineContentZoom : 1
  const appendSpaceScale = Number.isFinite(args.appendSpacePercent) && args.appendSpacePercent > 0 ? args.appendSpacePercent / 100 : 0
  const workspaceScale = Math.max(1, timelineContentZoom + appendSpaceScale)
  return {
    appendFlexPercent: appendSpaceScale > 0 ? (appendSpaceScale / workspaceScale) * 100 : 0,
    viewportFlexPercent: (timelineContentZoom / workspaceScale) * 100,
    workspaceWidthPercent: workspaceScale * 100,
  }
}

export function buildVideoSequenceTimelineZoomTicks(args: {
  displayTicks: readonly MermaidGanttTimelineTick[]
  frameRate?: number
  maxMinutes: number
  mediaDurationSeconds: number
  rulerWidthPx?: number
  timelineZoom: number
}): readonly MermaidGanttTimelineTick[] {
  const mediaDurationSeconds = Number.isFinite(args.mediaDurationSeconds) && args.mediaDurationSeconds > 0 ? args.mediaDurationSeconds : 0
  const maxMinutes = Number.isFinite(args.maxMinutes) && args.maxMinutes > 0 ? args.maxMinutes : 0
  if (mediaDurationSeconds <= 0 || maxMinutes <= 0) return args.displayTicks
  const scaleDurationSeconds = resolveVideoSequenceTimelineScaleDurationSeconds(mediaDurationSeconds)
  if (shouldUseVideoSequenceFrameTicks({ mediaDurationSeconds: scaleDurationSeconds, timelineZoom: args.timelineZoom })) {
    return fitVideoSequenceTickLabels(buildVideoSequenceTimelineFrameTicks({
      frameRate: resolveVideoSequenceTimelineFrameRate(args.frameRate || 0),
      maxMinutes,
      scaleDurationSeconds,
    }), args.rulerWidthPx)
  }
  const stepSeconds = resolveVideoSequenceTimelineZoomTickStepSeconds({
    durationSeconds: scaleDurationSeconds,
    timelineZoom: args.timelineZoom,
  })
  const ticks: MermaidGanttTimelineTick[] = []
  for (let seconds = 0; seconds < scaleDurationSeconds; seconds += stepSeconds) {
    const minutes = (seconds / scaleDurationSeconds) * maxMinutes
    ticks.push({
      label: formatVideoSequenceTimelineSecondsOffset(seconds),
      minutes,
      percent: (minutes / maxMinutes) * 100,
    })
  }
  ticks.push({
    label: formatVideoSequenceTimelineSecondsOffset(scaleDurationSeconds),
    minutes: maxMinutes,
    percent: 100,
  })
  return fitVideoSequenceTickLabels(ticks, args.rulerWidthPx)
}

function fitVideoSequenceTickLabels(ticks: readonly MermaidGanttTimelineTick[], width?: number): readonly MermaidGanttTimelineTick[] {
  if (!Number.isFinite(width) || !width || width <= 0 || ticks.length < 3) return ticks
  const plotWidth = resolveVideoSequenceRulerInsetPixelMetrics(width).widthPx
  const last = ticks[ticks.length - 1]
  const minimumSpacing = 56
  let previousLabelPosition = ticks[0].percent * plotWidth / 100
  return ticks.map((tick, index) => {
    if (!index || index === ticks.length - 1 || !tick.label) return tick
    const position = tick.percent * plotWidth / 100
    if (position - previousLabelPosition < minimumSpacing || last.percent * plotWidth / 100 - position < minimumSpacing) {
      return { ...tick, label: '' }
    }
    previousLabelPosition = position
    return tick
  })
}

export function resolveVideoSequenceTimelineAppendSpacePercent(timelineZoom: number): number {
  const zoom = Number.isFinite(timelineZoom) && timelineZoom > 0 ? timelineZoom : 1
  if (zoom < VIDEO_SEQUENCE_TIMELINE_APPEND_SPACE_MIN_ZOOM) return 0
  return Math.min(
    VIDEO_SEQUENCE_TIMELINE_APPEND_SPACE_MAX_PERCENT,
    Math.round((zoom - 1) * VIDEO_SEQUENCE_TIMELINE_APPEND_SPACE_PER_ZOOM_PERCENT),
  )
}
