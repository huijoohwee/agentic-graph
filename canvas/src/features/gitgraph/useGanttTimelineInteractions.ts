import React from 'react'
import {
  resolveMermaidGanttBarDragCommitted,
  resolveMermaidGanttBarDragPreview,
  resolveMermaidGanttTimelineDragEffectiveDelta,
  resolveMermaidGanttTimelineDragPreviewSpan,
  type MermaidGanttBarDragMode,
  type MermaidGanttTimelineDragPreview,
  type MermaidGanttTimelineTaskSpan,
} from '@/lib/mermaid/mermaidGanttBarInteraction'
import { clampTimelineTransportValue } from '@/components/timeline/timelineTransport'
import {
  normalizeVideoSequenceClipEditDeltaMinutes,
  resolveVideoSequenceClipEditSnappedMinutes,
  resolveVideoSequenceClipEditStepMinutes,
} from '@/components/timeline/videoSequenceClipEdit'
import { resolveVideoSequenceRulerInsetPixelMetrics } from '@/components/timeline/videoSequenceTimelineRulerGeometry'
import { VIDEO_SEQUENCE_LANE_HEIGHT_PX } from '@/components/timeline/videoSequenceTimeline'

export type GanttTimelineTransportDragState = {
  mode: MermaidGanttBarDragMode
  pointerId: number
  originClientX: number
  originClientY: number
  playheadMinutes: number
  minutesPerPixel: number
  stepMinutes: number
  markdownDocumentName: string | null
  markdownText: string
  span: MermaidGanttTimelineTaskSpan
}

type GanttTimelineTransportRulerScrubState = {
  pointerId: number
  rectLeft: number
  rectWidth: number
  selectedRowKey: string | null
}

function resolveTimelineRulerScrubElement(eventTarget: EventTarget | null, currentTarget: HTMLElement): HTMLElement {
  const target = eventTarget instanceof HTMLElement ? eventTarget : null
  const scrubElement = target?.closest('[data-kg-gantt-timeline-ruler-content="1"],[data-kg-video-sequence-ruler-axis="1"]')
  return scrubElement instanceof HTMLElement ? scrubElement : currentTarget
}

function isTimelinePlayheadScrubTarget(eventTarget: EventTarget | null): boolean {
  const target = eventTarget instanceof HTMLElement ? eventTarget : null
  return Boolean(target?.closest('[data-kg-gantt-timeline-playhead="1"],[data-kg-video-sequence-ruler-playhead-marker="1"]'))
}

function resolveTimelineRulerScrubRowKey(eventTarget: EventTarget | null): string | null {
  const target = eventTarget instanceof HTMLElement ? eventTarget : null
  const scrubTarget = target?.closest('[data-kg-video-sequence-ruler-scrub-row-key]')
  const rowKey = scrubTarget instanceof HTMLElement ? scrubTarget.dataset.kgVideoSequenceRulerScrubRowKey : ''
  return rowKey || null
}

function isTimelineRulerInteractiveControl(eventTarget: EventTarget | null): boolean {
  const target = eventTarget instanceof HTMLElement ? eventTarget : null
  const buttonTarget = target?.closest('button')
  if (buttonTarget && !buttonTarget.closest('[data-kg-video-sequence-ruler-scrub-target="1"]')) return true
  return Boolean(target?.closest('[data-kg-gantt-timeline-track-span="1"]'))
}

export function useGanttTimelineInteractions(args: {
  autoSnappingEnabled: boolean
  markdownDocumentName: string
  markdownText: string
  maxMinutes: number
  positionMinutes: number
  scrubMaxMinutes?: number
  resolveRowKeyAtPosition: (position: number) => string
  selectedRowKey: string
  setSelectedRowKey: (rowKey: string) => void
  setTransportPlaybackPosition: (position: number) => void
  setTransportPlaying: (playing: boolean) => void
  spans: readonly MermaidGanttTimelineTaskSpan[]
  onCommitDrag: (args: {
    displayLaneDelta: number
    dragState: GanttTimelineTransportDragState
    effectiveDeltaMinutes: number
  }) => void
}) {
  const [dragState, setDragState] = React.useState<GanttTimelineTransportDragState | null>(null)
  const [dragPreview, setDragPreview] = React.useState<MermaidGanttTimelineDragPreview | null>(null)
  const [rulerScrubState, setRulerScrubState] = React.useState<GanttTimelineTransportRulerScrubState | null>(null)

  const handlePositionChange = React.useCallback((value: number) => {
    const nextPosition = clampTimelineTransportValue(value, 0, args.maxMinutes)
    args.setTransportPlaybackPosition(nextPosition)
    const rowKey = args.resolveRowKeyAtPosition(nextPosition)
    if (rowKey && rowKey !== args.selectedRowKey) args.setSelectedRowKey(rowKey)
  }, [args])

  const resolveRulerScrubMinutes = React.useCallback((clientX: number, state: GanttTimelineTransportRulerScrubState) => {
    if (state.rectWidth <= 0) return 0
    const insetMetrics = resolveVideoSequenceRulerInsetPixelMetrics(state.rectWidth)
    const ratio = clampTimelineTransportValue((clientX - state.rectLeft - insetMetrics.insetLeftPx) / insetMetrics.widthPx, 0, 1)
    return ratio * Math.max(args.maxMinutes, args.scrubMaxMinutes || 0)
  }, [args.maxMinutes, args.scrubMaxMinutes])

  const handleRulerScrubPosition = React.useCallback((clientX: number, state: GanttTimelineTransportRulerScrubState) => {
    const nextPosition = resolveRulerScrubMinutes(clientX, state)
    if (state.selectedRowKey) {
      if (args.selectedRowKey !== state.selectedRowKey) args.setSelectedRowKey(state.selectedRowKey)
      args.setTransportPlaybackPosition(clampTimelineTransportValue(nextPosition, 0, args.maxMinutes))
      return
    }
    handlePositionChange(nextPosition)
  }, [args, handlePositionChange, resolveRulerScrubMinutes])

  const dragScaleMaxMinutes = Math.max(args.maxMinutes, args.scrubMaxMinutes || 0)

  const resolveDisplayLaneDelta = React.useCallback((clientY: number, state: GanttTimelineTransportDragState): number => {
    const deltaY = Number(clientY) - state.originClientY
    if (!Number.isFinite(deltaY)) return 0
    const threshold = VIDEO_SEQUENCE_LANE_HEIGHT_PX / 2
    if (Math.abs(deltaY) < threshold) return 0
    return Math.trunc(deltaY / VIDEO_SEQUENCE_LANE_HEIGHT_PX)
  }, [])

  const resolveSnappedDragDeltaMinutes = React.useCallback((deltaMinutes: number, state: GanttTimelineTransportDragState): number => {
    const rawTargetMinutes = state.mode === 'resize-end' ? state.span.endMinutes + deltaMinutes : state.span.startMinutes + deltaMinutes
    const snappedTargetMinutes = resolveVideoSequenceClipEditSnappedMinutes({
      enabled: args.autoSnappingEnabled,
      excludedSnapPositions: [state.span.startMinutes, state.span.endMinutes],
      playheadMinutes: state.playheadMinutes,
      positionMinutes: rawTargetMinutes,
      selectedSpan: state.span,
      spans: args.spans,
      targetDurationMinutes: state.mode === 'move' ? state.span.durationMinutes : undefined,
      timelineGrid: { minutesPerPixel: state.minutesPerPixel },
    })
    return normalizeVideoSequenceClipEditDeltaMinutes(
      state.mode === 'resize-end' ? snappedTargetMinutes - state.span.endMinutes : snappedTargetMinutes - state.span.startMinutes,
      state.stepMinutes,
    )
  }, [args.autoSnappingEnabled, args.spans])

  React.useEffect(() => {
    if (!dragState) return
    const handlePointerMove = (event: PointerEvent) => {
      if (event.pointerId !== dragState.pointerId) return
      const preview = resolveMermaidGanttBarDragPreview({
        mode: dragState.mode,
        originClientX: dragState.originClientX,
        clientX: event.clientX,
      })
      const displayLaneDelta = resolveDisplayLaneDelta(event.clientY, dragState)
      if (!resolveMermaidGanttBarDragCommitted(preview.deltaPx) && !displayLaneDelta) return
      const deltaMinutes = resolveSnappedDragDeltaMinutes(normalizeVideoSequenceClipEditDeltaMinutes(preview.deltaPx * dragState.minutesPerPixel, dragState.stepMinutes), dragState)
      const nextPreview = resolveMermaidGanttTimelineDragPreviewSpan({
        allowTimelineExpansion: true,
        deltaMinutes,
        maxMinutes: args.maxMinutes,
        mode: dragState.mode,
        stepMinutes: dragState.stepMinutes,
        span: dragState.span,
      })
      setDragPreview(nextPreview)
    }
    const handlePointerEnd = (event: PointerEvent) => {
      if (event.pointerId !== dragState.pointerId) return
      const preview = resolveMermaidGanttBarDragPreview({
        mode: dragState.mode,
        originClientX: dragState.originClientX,
        clientX: event.clientX,
      })
      const displayLaneDelta = resolveDisplayLaneDelta(event.clientY, dragState)
      setDragState(null)
      setDragPreview(null)
      if (!resolveMermaidGanttBarDragCommitted(preview.deltaPx) && !displayLaneDelta) return
      const deltaMinutes = normalizeVideoSequenceClipEditDeltaMinutes(preview.deltaPx * dragState.minutesPerPixel, dragState.stepMinutes)
      const effectiveDeltaMinutes = resolveMermaidGanttTimelineDragEffectiveDelta({
        allowTimelineExpansion: true,
        deltaMinutes,
        maxMinutes: args.maxMinutes,
        mode: dragState.mode,
        stepMinutes: dragState.stepMinutes,
        span: dragState.span,
      })
      if (effectiveDeltaMinutes === 0 && !displayLaneDelta) return
      args.onCommitDrag({
        displayLaneDelta,
        dragState,
        effectiveDeltaMinutes,
      })
    }
    window.addEventListener('pointermove', handlePointerMove, { passive: true })
    window.addEventListener('pointerup', handlePointerEnd, { passive: true })
    window.addEventListener('pointercancel', handlePointerEnd, { passive: true })
    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerEnd)
      window.removeEventListener('pointercancel', handlePointerEnd)
    }
  }, [args, dragState, resolveDisplayLaneDelta, resolveSnappedDragDeltaMinutes])

  React.useEffect(() => {
    if (!rulerScrubState) return
    const handlePointerMove = (event: PointerEvent) => {
      if (event.pointerId !== rulerScrubState.pointerId) return
      event.preventDefault()
      handleRulerScrubPosition(event.clientX, rulerScrubState)
    }
    const handlePointerEnd = (event: PointerEvent) => {
      if (event.pointerId !== rulerScrubState.pointerId) return
      setRulerScrubState(null)
    }
    window.addEventListener('pointermove', handlePointerMove, { passive: false })
    window.addEventListener('pointerup', handlePointerEnd, { passive: true })
    window.addEventListener('pointercancel', handlePointerEnd, { passive: true })
    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerEnd)
      window.removeEventListener('pointercancel', handlePointerEnd)
    }
  }, [handleRulerScrubPosition, rulerScrubState])

  const handleRulerPointerScrub = React.useCallback((event: React.PointerEvent<HTMLElement>) => {
    const primaryButtonActive = event.button === 0 || event.buttons === 1
    if (!primaryButtonActive || args.maxMinutes <= 0) return
    const target = event.target as HTMLElement | null
    if (isTimelineRulerInteractiveControl(target)) return
    const scrubElement = resolveTimelineRulerScrubElement(event.target, event.currentTarget)
    const rect = scrubElement.getBoundingClientRect()
    if (rect.width <= 0) return
    const selectedRowKey = resolveTimelineRulerScrubRowKey(event.target)
    event.preventDefault()
    event.stopPropagation()
    event.currentTarget.setPointerCapture?.(event.pointerId)
    const nextScrubState = {
      pointerId: event.pointerId,
      rectLeft: rect.left,
      rectWidth: rect.width,
      selectedRowKey,
    }
    setRulerScrubState(nextScrubState)
    args.setTransportPlaying(false)
    handleRulerScrubPosition(event.clientX, nextScrubState)
  }, [args, handleRulerScrubPosition])

  const handleTrackPointerStart = React.useCallback((
    event: React.PointerEvent<HTMLElement>,
    span: MermaidGanttTimelineTaskSpan,
    mode: MermaidGanttBarDragMode,
  ) => {
    const primaryButtonActive = event.button === 0 || event.buttons === 1
    if (!primaryButtonActive || args.maxMinutes <= 0) return
    if (isTimelinePlayheadScrubTarget(event.target)) return
    const rulerElement = event.currentTarget.closest('[data-kg-gantt-timeline-ruler-content="1"]') as HTMLElement | null
    const rulerWidth = rulerElement?.getBoundingClientRect().width || 0
    if (rulerWidth <= 0) return
    const rulerInsetMetrics = resolveVideoSequenceRulerInsetPixelMetrics(rulerWidth)
    event.preventDefault()
    event.stopPropagation()
    event.currentTarget.setPointerCapture?.(event.pointerId)
    args.setTransportPlaying(false)
    setDragState({
      mode,
      pointerId: event.pointerId,
      originClientX: event.clientX,
      originClientY: event.clientY,
      playheadMinutes: args.positionMinutes,
      minutesPerPixel: dragScaleMaxMinutes / rulerInsetMetrics.widthPx,
      stepMinutes: resolveVideoSequenceClipEditStepMinutes(span),
      markdownDocumentName: args.markdownDocumentName,
      markdownText: args.markdownText,
      span,
    })
    if (args.selectedRowKey !== span.rowKey) args.setSelectedRowKey(span.rowKey)
  }, [args, dragScaleMaxMinutes])

  return {
    dragPreview,
    draggingMode: dragState?.mode || null,
    draggingRowKey: dragState?.span.rowKey || '',
    handlePositionChange,
    handleRulerPointerScrub,
    handleTrackPointerStart,
  }
}
