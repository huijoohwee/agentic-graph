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
import { resolveVideoSequenceRulerInsetPixelMetrics, resolveVideoSequenceRulerPosition } from '@/components/timeline/videoSequenceTimelineRulerGeometry'
import { VIDEO_SEQUENCE_LANE_HEIGHT_PX, resolveVideoSequenceTimelineDragLaneDelta } from '@/components/timeline/videoSequenceTimeline'

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
  laneOrder?: { host: HTMLElement; ids: string[]; origin: number; key: string }
}

function readTimelineDragLanes(host: HTMLElement): string[] {
  return Array.from(host.querySelectorAll<HTMLElement>('[data-kg-video-sequence-drag-lane-id]'), row => row.dataset.kgVideoSequenceDragLaneId || '')
}
function hasCurrentTimelineDragLanes(state: GanttTimelineTransportDragState): boolean {
  return !state.laneOrder || (state.laneOrder.host.isConnected && JSON.stringify(readTimelineDragLanes(state.laneOrder.host)) === state.laneOrder.key)
}

type GanttTimelineTransportRulerScrubState = {
  pointerId: number
  rectLeft: number
  rectWidth: number
  selectedRowKey: string | null
  originClientX: number
  originClientY: number
  dragIntent: boolean
  moved: boolean
  target: HTMLElement
  capture: HTMLElement
  markdownDocumentName: string
  markdownText: string
  maxMinutes: number
  scaleMinutes: number
}

function resolveTimelineRulerScrubElement(eventTarget: EventTarget | null, currentTarget: HTMLElement): HTMLElement {
  const target = eventTarget instanceof Element ? eventTarget : null
  const scrubElement = target?.closest('[data-kg-gantt-timeline-ruler-content="1"],[data-kg-video-sequence-ruler-axis="1"]')
  return scrubElement instanceof HTMLElement ? scrubElement : currentTarget
}

function isTimelinePlayheadScrubTarget(eventTarget: EventTarget | null): boolean {
  const target = eventTarget instanceof Element ? eventTarget : null
  return Boolean(target?.closest('[data-kg-gantt-timeline-playhead="1"],[data-kg-video-sequence-ruler-playhead-marker="1"]'))
}

function resolveTimelineRulerScrubRowKey(eventTarget: EventTarget | null): string | null {
  const target = eventTarget instanceof Element ? eventTarget : null
  const scrubTarget = target?.closest('[data-kg-video-sequence-ruler-scrub-row-key]')
  const rowKey = scrubTarget instanceof HTMLElement ? scrubTarget.dataset.kgVideoSequenceRulerScrubRowKey : ''
  return rowKey || null
}

function isTimelineRulerInteractiveControl(eventTarget: EventTarget | null): boolean {
  const target = eventTarget instanceof Element ? eventTarget : null
  if (target?.closest('[data-kg-source-annotation-layer],input,select,textarea,[contenteditable="true"],[data-kg-timeline-time-axis-mark]')) return true
  const buttonTarget = target?.closest('button')
  if (buttonTarget?.matches(':disabled,[aria-disabled="true"]')) return true
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
  selectionFollowsPlayhead?: boolean
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
  const rulerScrubRef = React.useRef<GanttTimelineTransportRulerScrubState | null>(null)
  const clickCleanupRef = React.useRef<(() => void) | null>(null)
  const argsRef = React.useRef(args)
  argsRef.current = args
  const scrubAuthorityCurrent = (state: GanttTimelineTransportRulerScrubState) => {
    const current = argsRef.current
    return state.target.isConnected && state.capture.isConnected
      && current.markdownDocumentName === state.markdownDocumentName && current.markdownText === state.markdownText
      && current.maxMinutes === state.maxMinutes
      && Math.max(current.maxMinutes, current.scrubMaxMinutes || 0) === state.scaleMinutes
  }
  React.useLayoutEffect(() => {
    if (rulerScrubRef.current && !scrubAuthorityCurrent(rulerScrubRef.current)) setRulerScrubState(null)
  })

  const handlePositionChange = React.useCallback((value: number) => {
    const nextPosition = clampTimelineTransportValue(value, 0, args.maxMinutes)
    args.setTransportPlaybackPosition(nextPosition)
    if (args.selectionFollowsPlayhead === false) return
    const rowKey = args.resolveRowKeyAtPosition(nextPosition)
    if (rowKey && rowKey !== args.selectedRowKey) args.setSelectedRowKey(rowKey)
  }, [args])

  const resolveRulerScrubMinutes = React.useCallback((clientX: number, state: GanttTimelineTransportRulerScrubState) => {
    return resolveVideoSequenceRulerPosition(clientX, state.rectLeft, state.rectWidth, Math.max(args.maxMinutes, args.scrubMaxMinutes || 0))
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

  const scrubPositionRef = React.useRef(handleRulerScrubPosition)
  scrubPositionRef.current = handleRulerScrubPosition

  const dragScaleMaxMinutes = Math.max(args.maxMinutes, args.scrubMaxMinutes || 0)

  const resolveDisplayLaneDelta = React.useCallback((clientY: number, state: GanttTimelineTransportDragState): number => {
    const deltaY = Number(clientY) - state.originClientY
    if (!Number.isFinite(deltaY)) return 0
    const threshold = VIDEO_SEQUENCE_LANE_HEIGHT_PX / 2
    if (Math.abs(deltaY) < threshold) return 0
    return state.laneOrder ? resolveVideoSequenceTimelineDragLaneDelta(state.laneOrder.ids, state.laneOrder.origin, deltaY) : Math.trunc(deltaY / VIDEO_SEQUENCE_LANE_HEIGHT_PX)
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
      if (!hasCurrentTimelineDragLanes(dragState)) { setDragState(null); setDragPreview(null); return }
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
      if (!hasCurrentTimelineDragLanes(dragState)) { setDragState(null); setDragPreview(null); return }
      const preview = resolveMermaidGanttBarDragPreview({
        mode: dragState.mode,
        originClientX: dragState.originClientX,
        clientX: event.clientX,
      })
      const displayLaneDelta = resolveDisplayLaneDelta(event.clientY, dragState)
      setDragState(null)
      setDragPreview(null)
      if (event.type === 'pointercancel') return
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
    const state = rulerScrubState
    const release = () => {
      delete state.target.dataset.kgTimelineRulerScrubbing
      if (state.capture.hasPointerCapture?.(state.pointerId)) state.capture.releasePointerCapture?.(state.pointerId)
    }
    let awaitingPointerUp = false
    let clickTimer: number | undefined
    const suppressClick = (event: MouseEvent) => {
      if (!state.dragIntent || !state.moved || awaitingPointerUp || event.detail === 0) return
      if ('pointerId' in event && Number(event.pointerId) !== state.pointerId) return
      event.preventDefault()
      event.stopImmediatePropagation()
      clickCleanupRef.current?.()
    }
    const clearClick = () => {
      state.capture.removeEventListener('click', suppressClick, true)
      window.removeEventListener('pointerup', finishCancelledPointer)
      window.removeEventListener('pointerdown', clearClick, true)
      if (clickTimer !== undefined) window.clearTimeout(clickTimer)
      if (clickCleanupRef.current === clearClick) clickCleanupRef.current = null
    }
    const finishCancelledPointer = (event: PointerEvent) => {
      if (event.pointerId !== state.pointerId) return
      awaitingPointerUp = false
      window.removeEventListener('pointerup', finishCancelledPointer)
      clickTimer = window.setTimeout(clearClick, 0)
    }
    clickCleanupRef.current?.()
    clickCleanupRef.current = clearClick
    state.capture.addEventListener('click', suppressClick, true)
    const finish = (cancelled = false) => {
      if (rulerScrubRef.current !== state) return
      rulerScrubRef.current = null
      release()
      setRulerScrubState(null)
      if (state.moved && state.dragIntent) {
        if (cancelled) {
          awaitingPointerUp = true
          window.addEventListener('pointerup', finishCancelledPointer)
          window.addEventListener('pointerdown', clearClick, true)
        } else clickTimer = window.setTimeout(clearClick, 0)
      } else clearClick()
    }
    const handlePointerMove = (event: PointerEvent) => {
      if (event.pointerId !== state.pointerId) return
      if (!scrubAuthorityCurrent(state)) { finish(true); return }
      if (state.dragIntent && !state.moved) {
        if (!resolveMermaidGanttBarDragCommitted(Math.hypot(event.clientX - state.originClientX, event.clientY - state.originClientY))) return
        state.moved = true
        state.target.dataset.kgTimelineRulerScrubbing = '1'
        argsRef.current.setTransportPlaying(false)
        if (!scrubAuthorityCurrent(state)) { finish(true); return }
      }
      event.preventDefault()
      scrubPositionRef.current(event.clientX, state)
    }
    const handlePointerEnd = (event: PointerEvent) => { if (event.pointerId === state.pointerId) finish(event.type !== 'pointerup') }
    const cancel = () => finish(true)
    const handleKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') cancel() }
    window.addEventListener('pointermove', handlePointerMove, { passive: false })
    window.addEventListener('pointerup', handlePointerEnd)
    window.addEventListener('pointercancel', handlePointerEnd)
    window.addEventListener('blur', cancel)
    state.capture.addEventListener('lostpointercapture', handlePointerEnd)
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerEnd)
      window.removeEventListener('pointercancel', handlePointerEnd)
      window.removeEventListener('blur', cancel)
      state.capture.removeEventListener('lostpointercapture', handlePointerEnd)
      window.removeEventListener('keydown', handleKeyDown)
      if (rulerScrubRef.current === state) {
        rulerScrubRef.current = null
        release()
        clearClick()
      }
    }
  }, [rulerScrubState])
  React.useEffect(() => () => { clickCleanupRef.current?.() }, [])

  const handleRulerPointerScrub = React.useCallback((event: React.PointerEvent<HTMLElement>) => {
    const primaryButtonActive = event.button === 0 || event.buttons === 1
    if (!primaryButtonActive || event.isPrimary === false || args.maxMinutes <= 0 || rulerScrubRef.current) return
    const target = event.target instanceof Element ? event.target : null
    if (isTimelineRulerInteractiveControl(target)) return
    const scrubElement = resolveTimelineRulerScrubElement(event.target, event.currentTarget)
    const rect = scrubElement.getBoundingClientRect()
    if (rect.width <= 0) return
    const selectedRowKey = resolveTimelineRulerScrubRowKey(event.target)
    const laneTarget = target?.closest<HTMLElement>('[data-kg-video-sequence-ruler-scrub-intent="drag"]')
    const nextScrubState: GanttTimelineTransportRulerScrubState = {
      pointerId: event.pointerId, rectLeft: rect.left, rectWidth: rect.width, selectedRowKey,
      originClientX: event.clientX, originClientY: event.clientY, dragIntent: !!laneTarget, moved: false,
      target: laneTarget || scrubElement, capture: event.currentTarget,
      markdownDocumentName: args.markdownDocumentName, markdownText: args.markdownText,
      maxMinutes: args.maxMinutes, scaleMinutes: Math.max(args.maxMinutes, args.scrubMaxMinutes || 0),
    }
    if (!laneTarget) event.preventDefault()
    event.stopPropagation()
    clickCleanupRef.current?.()
    // Capture the actual semantic control so a click without movement keeps its native target.
    nextScrubState.capture = laneTarget || event.currentTarget
    nextScrubState.capture.setPointerCapture?.(event.pointerId)
    rulerScrubRef.current = nextScrubState
    setRulerScrubState(nextScrubState)
    if (laneTarget) {
      if (selectedRowKey && args.selectedRowKey !== selectedRowKey) args.setSelectedRowKey(selectedRowKey)
    } else {
      args.setTransportPlaying(false)
      handleRulerScrubPosition(event.clientX, nextScrubState)
    }
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
    const ids = rulerElement ? readTimelineDragLanes(rulerElement) : []
    const laneId = event.currentTarget.closest<HTMLElement>('[data-kg-video-sequence-display-lane]')?.dataset.kgVideoSequenceDisplayLane
    const origin = laneId ? ids.indexOf(laneId) : -1
    setDragState({
      ...(rulerElement && origin >= 0 ? { laneOrder: { host: rulerElement, ids, origin, key: JSON.stringify(ids) } } : {}),
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
