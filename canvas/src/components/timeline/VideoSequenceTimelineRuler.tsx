import React from 'react'
import type { TimelineMediaReaderThumbnail } from './timelineMediaReader'
import { buildTimelineAnimationState } from './timelineAnimationEngine'
import { VideoSequenceFrameSampleRail } from './VideoSequenceFrameSampleRail'
import { VideoSequenceClipThumbnailStrip } from './VideoSequenceClipThumbnailStrip'
import { VideoSequenceAudioDbControl } from './VideoSequenceAudioDbControl'
import { buildVideoSequenceGeneratedFrameThumbnails, type VideoSequenceGeneratedFrameThumbnailOrigin } from './videoSequenceGeneratedFrameThumbnails'
import { VideoSequenceTimelineClipMeta, resolveVideoSequenceSourceWindowLabel } from './VideoSequenceTimelineClipMeta'
import { VideoSequenceTimelineRulerTicks } from './VideoSequenceTimelineRulerTicks'
import { VideoSequenceTimeAxisControls } from './VideoSequenceTimeAxisControls'
import { resolveVideoSequenceRulerInsetLeft, resolveVideoSequenceRulerInsetWidth } from './videoSequenceTimelineRulerGeometry'
import { buildVideoSequenceSourceImageThumbnail } from './videoSequenceSourceImageThumbnail'
import { resolveVideoSequenceSourceThumbnailSet } from './videoSequenceSourceThumbnailSet'
import { resolveVideoSequenceClipThumbnails } from './videoSequenceClipThumbnailSelection'
import { useVideoSequenceTimelineMediaDropTarget } from './useVideoSequenceTimelineMediaDropTarget'
import { buildVideoSequenceTimelineZoomTicks, resolveVideoSequenceTimelineAppendSpacePercent, resolveVideoSequenceTimelineContentZoom, resolveVideoSequenceTimelineScaleMaxMinutes, resolveVideoSequenceTimelineWorkspaceLayout } from './videoSequenceTimelineZoom'
import {
  VIDEO_SEQUENCE_BOTTOM_PANEL_DISABLED_LANE_IDS,
  VIDEO_SEQUENCE_LANE_HEIGHT_PX,
  VIDEO_SEQUENCE_TIMELINE_LANES,
  buildVideoSequenceTimelineCueSamples,
  buildVideoSequenceTimelineFrameSamples,
  buildVideoSequenceTimelineWaveformSamples,
  formatVideoSequenceTimelineSecondsOffset,
  isCompactSourceMediaSpan,
  resolveRenderableVideoSequenceTimelineSpans,
  resolveVideoSequenceTimelineDisplayLaneId,
  resolveVideoSequenceTimelineMediaSeconds,
  resolveVideoSequenceTimelineLane,
  resolveVisibleVideoSequenceTimelineDisplayLanes,
  shouldRenderVideoSequenceTimelineSpan,
  type VideoSequenceTimelineDisplayLane,
  type VideoSequenceTimelineLaneId,
  type VideoSequenceTimelineProjectionOptions,
  type VideoSequenceTimelineScope,
} from './videoSequenceTimeline'
import { readMermaidGanttTaskSourceRangeSeconds, type MermaidGanttBarDragMode, type MermaidGanttTimelineDragPreview, type MermaidGanttTimelineTaskSpan, type MermaidGanttTimelineTick } from '@/lib/mermaid/mermaidGanttBarInteraction'
import type { MediaDragPayload } from '@/lib/ui/mediaDragPayload'
import './VideoSequenceTimelineRuler.css'
import './VideoSequenceTimelineRulerTimeAxis.css'
export const VIDEO_SEQUENCE_LANE_TOP_OFFSET_PX = 24
export const VIDEO_SEQUENCE_RULER_SCOPE_STRIP_PX = 24
export const VIDEO_SEQUENCE_RULER_FOOTER_PX = 28 + VIDEO_SEQUENCE_RULER_SCOPE_STRIP_PX
export type VideoSequenceTimelineThumbnailWindow = { sourceEndSeconds: number; sourceStartSeconds: number; timelineEndMinutes: number; timelineStartMinutes: number }
export type VideoSequenceTimelineSourceThumbnailSet = { kind: 'image' | 'video'; label: string; sourceAudioWaveformSamples: readonly number[]; sourceId: string; sourceThumbnailWindows: readonly VideoSequenceTimelineThumbnailWindow[]; sourceThumbnails: readonly TimelineMediaReaderThumbnail[]; sourceUrl: string }
export type VideoSequenceTimelineProjectionMode = 'media' | 'workflow'
export type VideoSequenceTimelineInsertedLaneRenderArgs = {
  selected: boolean
  selectRowKey: string
}
export type VideoSequenceTimelineInsertedLane = {
  content: React.ReactNode | ((args: VideoSequenceTimelineInsertedLaneRenderArgs) => React.ReactNode)
  id: string
  insertAfterLaneId: string
  label: React.ReactNode
  selectRowKey?: string
}
export type VideoSequenceTimelineClipOverlayRenderArgs = {
  compact: boolean
  displayLaneId: string
  lane: VideoSequenceTimelineLaneId
  selected: boolean
  span: MermaidGanttTimelineTaskSpan
  verticalMarker: boolean
}
export type VideoSequenceTimelineClipOverlayRenderer = (args: VideoSequenceTimelineClipOverlayRenderArgs) => React.ReactNode
const VIDEO_SEQUENCE_RESIZE_MODE_LABELS: Record<Extract<MermaidGanttBarDragMode, 'resize-start' | 'resize-end'>, string> = {
  'resize-end': 'end',
  'resize-start': 'start',
}
const VIDEO_SEQUENCE_THUMBNAIL_WINDOW_EPSILON = 0.001
const VIDEO_SEQUENCE_DENSE_FBF_MAX_DURATION_MINUTES = 1.25 / 60
const VIDEO_SEQUENCE_SOURCE_CONTENT_LANES = new Set<VideoSequenceTimelineLaneId>(['video', 'image', 'scene'])
const VIDEO_SEQUENCE_OPERATION_CONTENT_LANES = new Set<VideoSequenceTimelineLaneId>(['mask', 'grade', 'audio'])
const VIDEO_SEQUENCE_GENERATED_FRAME_CONTENT_LANES = new Set<VideoSequenceTimelineLaneId>(['fbf'])
const WORKFLOW_TIMELINE_DISPLAY_LANES: readonly VideoSequenceTimelineDisplayLane[] = [{
  id: 'workflow',
  label: 'Workflow',
  semanticId: 'video',
}]
function resolveVideoSequenceThumbnailWindow(args: {
  span: MermaidGanttTimelineTaskSpan
  windows: readonly VideoSequenceTimelineThumbnailWindow[]
}): VideoSequenceTimelineThumbnailWindow | null {
  return args.windows.find(window =>
    Math.abs(window.timelineStartMinutes - args.span.startMinutes) <= VIDEO_SEQUENCE_THUMBNAIL_WINDOW_EPSILON &&
    Math.abs(window.timelineEndMinutes - args.span.endMinutes) <= VIDEO_SEQUENCE_THUMBNAIL_WINDOW_EPSILON,
  ) || null
}
function resolveVideoSequenceSpanThumbnailWindow(args: {
  allowTimelineFallback: boolean
  span: MermaidGanttTimelineTaskSpan
  windows: readonly VideoSequenceTimelineThumbnailWindow[]
}): VideoSequenceTimelineThumbnailWindow | null {
  const existingWindow = resolveVideoSequenceThumbnailWindow({ span: args.span, windows: args.windows })
  if (existingWindow) return existingWindow
  const sourceRange = readMermaidGanttTaskSourceRangeSeconds(args.span.raw)
  if (sourceRange) {
    return {
      sourceEndSeconds: Math.max(sourceRange.startSeconds + 0.0001, sourceRange.endSeconds),
      sourceStartSeconds: Math.max(0, sourceRange.startSeconds),
      timelineEndMinutes: args.span.endMinutes,
      timelineStartMinutes: args.span.startMinutes,
    }
  }
  if (!sourceRange && !args.allowTimelineFallback) return null
  const fallbackStart = args.span.startMinutes
  const fallbackEnd = args.span.endMinutes
  const sourceStartSeconds = Math.max(0, fallbackStart)
  const sourceEndSeconds = Math.max(sourceStartSeconds + 0.0001, fallbackEnd)
  if (!Number.isFinite(sourceStartSeconds) || !Number.isFinite(sourceEndSeconds)) return null
  return {
    sourceEndSeconds,
    sourceStartSeconds,
    timelineEndMinutes: args.span.endMinutes,
    timelineStartMinutes: args.span.startMinutes,
  }
}
function buildVideoSequenceClipMediaCache(args: {
  renderableSpans: readonly MermaidGanttTimelineTaskSpan[]
  sourceThumbnailWindows: readonly VideoSequenceTimelineThumbnailWindow[]
  sourceThumbnailSets: readonly VideoSequenceTimelineSourceThumbnailSet[]
  sourceThumbnails: readonly TimelineMediaReaderThumbnail[]
}) {
  const cache = new Map<string, {
    compactSourceFrameSamples: boolean
    compactSourceMedia: boolean
    compactSourcePlaceholder: boolean
    generatedFrameSamples: readonly TimelineMediaReaderThumbnail[]
    lane: VideoSequenceTimelineLaneId
    semanticFrameSamples: readonly TimelineMediaReaderThumbnail[]
    sourceAudioWaveformSamples: readonly number[]
    showMediaCues: boolean
    thumbnailSamples: readonly TimelineMediaReaderThumbnail[]
    thumbnailOrigin?: VideoSequenceGeneratedFrameThumbnailOrigin
    thumbnailWindow: VideoSequenceTimelineThumbnailWindow | null
    verticalMarker: boolean
  }>()
  for (const span of args.renderableSpans) {
    const verticalMarker = /(^|[:,\s])vert([,\s]|$)/i.test(span.raw)
    const lane = resolveVideoSequenceTimelineLane(span)
    const showsGeneratedFrameContent = VIDEO_SEQUENCE_GENERATED_FRAME_CONTENT_LANES.has(lane)
    const compactSourceMedia = isCompactSourceMediaSpan(span, lane)
    const compactSourceVideo = compactSourceMedia && lane === 'video'
    const compactSourceImage = compactSourceMedia && (lane === 'image' || lane === 'scene')
    const compactSourceFrameSamples = compactSourceMedia && lane === 'fbf'
    const sourceThumbnailSet = resolveVideoSequenceSourceThumbnailSet({ lane, sets: args.sourceThumbnailSets, span })
    const showsSourceMediaContent = VIDEO_SEQUENCE_SOURCE_CONTENT_LANES.has(lane) && (compactSourceMedia || !!sourceThumbnailSet)
    const showsMediaContent = !verticalMarker && (showsSourceMediaContent || VIDEO_SEQUENCE_OPERATION_CONTENT_LANES.has(lane) || showsGeneratedFrameContent)
    const sourceThumbnails = compactSourceMedia && !sourceThumbnailSet ? [] : (sourceThumbnailSet?.sourceThumbnails || args.sourceThumbnails)
    const sourceThumbnailWindows = compactSourceMedia && !sourceThumbnailSet ? [] : (sourceThumbnailSet?.sourceThumbnailWindows || args.sourceThumbnailWindows)
    const compactSourcePlaceholder = compactSourceMedia && lane !== 'audio' && lane !== 'fbf' && !sourceThumbnailSet?.sourceThumbnails.length && !((compactSourceImage || compactSourceVideo) && sourceThumbnailSet?.sourceUrl)
    const thumbnailWindow = showsMediaContent ? resolveVideoSequenceSpanThumbnailWindow({ allowTimelineFallback: VIDEO_SEQUENCE_SOURCE_CONTENT_LANES.has(lane) || showsGeneratedFrameContent, span, windows: sourceThumbnailWindows }) : null
    const nativeFrameSamples = showsMediaContent && (!compactSourceMedia || compactSourceVideo)
      ? resolveVideoSequenceClipThumbnails({ sourceThumbnails, sourceWindow: thumbnailWindow })
      : []
    const stillImageSamples = compactSourceImage && sourceThumbnailSet?.kind === 'image'
      ? (sourceThumbnailSet.sourceThumbnails.length ? sourceThumbnailSet.sourceThumbnails.slice(0, 1) : buildVideoSequenceSourceImageThumbnail(sourceThumbnailSet))
      : []
    const sourceAudioWaveformSamples = lane === 'audio' ? (sourceThumbnailSet?.sourceAudioWaveformSamples || []) : []
    const semanticFrameSamples = compactSourceFrameSamples ? buildVideoSequenceGeneratedFrameThumbnails({ sourceWindow: thumbnailWindow, span }) : []
    const generatedFrameSamples = showsGeneratedFrameContent && !nativeFrameSamples.length && !semanticFrameSamples.length ? buildVideoSequenceGeneratedFrameThumbnails({ sourceWindow: thumbnailWindow, span }) : []
    const thumbnailOrigin = generatedFrameSamples.length ? 'frame-by-frame' : undefined
    cache.set(span.rowKey, {
      compactSourceFrameSamples,
      compactSourceMedia,
      compactSourcePlaceholder,
      generatedFrameSamples,
      lane,
      semanticFrameSamples,
      showMediaCues: showsMediaContent && lane !== 'audio' && !compactSourceMedia,
      sourceAudioWaveformSamples,
      thumbnailSamples: compactSourceFrameSamples || (compactSourceMedia && lane === 'audio') ? [] : (stillImageSamples.length ? stillImageSamples : (nativeFrameSamples.length ? nativeFrameSamples : generatedFrameSamples)),
      thumbnailOrigin,
      thumbnailWindow,
      verticalMarker,
    })
  }
  return cache
}
function resolveActiveVideoSequenceResizeMode(args: {
  dragging: boolean
  draggingMode: MermaidGanttBarDragMode | null
  previewSpan: MermaidGanttTimelineDragPreview | null
  span: MermaidGanttTimelineTaskSpan
}): Extract<MermaidGanttBarDragMode, 'resize-start' | 'resize-end'> | null {
  if (!args.dragging) return null
  if (args.draggingMode === 'resize-start' || args.draggingMode === 'resize-end') return args.draggingMode
  if (!args.previewSpan) return null
  if (args.previewSpan.rowKey !== args.span.rowKey) return null
  if (args.previewSpan.startMinutes !== args.span.startMinutes) return 'resize-start'
  if (args.previewSpan.durationMinutes !== args.span.durationMinutes) return 'resize-end'
  return null
}
export function buildVideoSequenceLaneSidebarStyle(lanes: readonly { id: string }[] = VIDEO_SEQUENCE_TIMELINE_LANES): React.CSSProperties {
  return { gridTemplateRows: `repeat(${lanes.length}, ${VIDEO_SEQUENCE_LANE_HEIGHT_PX}px)` }
}
export function resolveVideoSequenceRulerMinHeight(laneCount = VIDEO_SEQUENCE_TIMELINE_LANES.length): number {
  return VIDEO_SEQUENCE_LANE_TOP_OFFSET_PX + (laneCount * VIDEO_SEQUENCE_LANE_HEIGHT_PX) + VIDEO_SEQUENCE_RULER_FOOTER_PX
}
export function VideoSequenceTimelineRuler({
  contentRef,
  viewportRef,
  displayTicks,
  dragPreview,
  draggingMode,
  draggingRowKey,
  editable = true,
  maxMinutes,
  mediaDurationSeconds = 0,
  mediaFrameRate = 0,
  playheadPercent,
  projectionMode = 'media',
  selectedRowKey,
  sourceThumbnails = [],
  sourceThumbnailWindows = [],
  sourceThumbnailSets = [],
  scopes = [],
  renderClipOverlay,
  taskSpans, timeAxisControls, timeRulerOverlay, timelineInsertedLanes = [], timelineZoom,
  disabledLaneIds = VIDEO_SEQUENCE_BOTTOM_PANEL_DISABLED_LANE_IDS,
  onRulerPointerDown,
  onSelectRowKey,
  onSelectRowPosition,
  onDropMedia,
  onTrackPointerStart,
}: {
  contentRef: React.RefObject<HTMLElement | null>
  viewportRef: React.RefObject<HTMLElement | null>
  displayTicks: readonly MermaidGanttTimelineTick[]
  dragPreview: MermaidGanttTimelineDragPreview | null
  draggingMode: MermaidGanttBarDragMode | null
  draggingRowKey: string; editable?: boolean
  maxMinutes: number
  mediaDurationSeconds?: number
  mediaFrameRate?: number
  playheadPercent: number
  projectionMode?: VideoSequenceTimelineProjectionMode
  selectedRowKey: string
  sourceThumbnails?: readonly TimelineMediaReaderThumbnail[]
  sourceThumbnailWindows?: readonly VideoSequenceTimelineThumbnailWindow[]
  sourceThumbnailSets?: readonly VideoSequenceTimelineSourceThumbnailSet[]
  scopes?: readonly VideoSequenceTimelineScope[]
  renderClipOverlay?: VideoSequenceTimelineClipOverlayRenderer
  taskSpans: readonly MermaidGanttTimelineTaskSpan[]; timeAxisControls?: React.ReactNode; timeRulerOverlay?: React.ReactNode; timelineInsertedLanes?: readonly VideoSequenceTimelineInsertedLane[]; timelineZoom: number
  disabledLaneIds?: VideoSequenceTimelineProjectionOptions['disabledLaneIds']
  onRulerPointerDown: (event: React.PointerEvent<HTMLElement>) => void
  onSelectRowKey: (rowKey: string) => void
  onSelectRowPosition: (rowKey: string, positionMinutes: number) => void
  onDropMedia: (payload: MediaDragPayload, positionMinutes: number) => boolean
  onTrackPointerStart: (event: React.PointerEvent<HTMLElement>, span: MermaidGanttTimelineTaskSpan, mode: MermaidGanttBarDragMode) => void
}) {
  const mediaDropRef = React.useRef<HTMLElement | null>(null)
  const rulerScrollRef = React.useRef<HTMLElement | null>(null)
  const laneSidebarScrollRef = React.useRef<HTMLElement | null>(null)
  const workflowProjection = projectionMode === 'workflow'
  const projectionOptions = React.useMemo<VideoSequenceTimelineProjectionOptions>(() => ({ disabledLaneIds }), [disabledLaneIds])
  const visibleLanes = React.useMemo(() => (
    workflowProjection
      ? (taskSpans.some(shouldRenderVideoSequenceTimelineSpan) ? WORKFLOW_TIMELINE_DISPLAY_LANES : [])
      : resolveVisibleVideoSequenceTimelineDisplayLanes(taskSpans, projectionOptions)
  ), [projectionOptions, taskSpans, workflowProjection])
  const timelineLanes = React.useMemo(() => {
    if (!timelineInsertedLanes.length) return visibleLanes
    const insertedByAnchor = new Map<string, VideoSequenceTimelineInsertedLane[]>()
    for (const lane of timelineInsertedLanes) {
      const anchored = insertedByAnchor.get(lane.insertAfterLaneId) || []
      anchored.push(lane)
      insertedByAnchor.set(lane.insertAfterLaneId, anchored)
    }
    return visibleLanes.flatMap(lane => [lane, ...(insertedByAnchor.get(lane.id) || [])])
  }, [timelineInsertedLanes, visibleLanes])
  const renderableSpans = React.useMemo(() => (
    workflowProjection
      ? taskSpans.filter(shouldRenderVideoSequenceTimelineSpan)
      : resolveRenderableVideoSequenceTimelineSpans(taskSpans, projectionOptions)
  ), [projectionOptions, taskSpans, workflowProjection])
  const clipMediaByRowKey = React.useMemo(() => buildVideoSequenceClipMediaCache({ renderableSpans, sourceThumbnailSets, sourceThumbnailWindows, sourceThumbnails }), [renderableSpans, sourceThumbnailSets, sourceThumbnailWindows, sourceThumbnails])
  const visibleLaneIndexById = React.useMemo(() => new Map<string, number>(timelineLanes.map((lane, index): [string, number] => [lane.id, index])), [timelineLanes])
  const displayLaneIdByRowKey = React.useMemo(() => new Map(renderableSpans.map(span => [
    span.rowKey,
    workflowProjection ? 'workflow' : resolveVideoSequenceTimelineDisplayLaneId(span, renderableSpans, projectionOptions),
  ])), [projectionOptions, renderableSpans, workflowProjection])
  const formatClipTime = React.useCallback((positionMinutes: number) => formatVideoSequenceTimelineSecondsOffset(
    mediaDurationSeconds > 0 && maxMinutes > 0 ? resolveVideoSequenceTimelineMediaSeconds({ durationSeconds: mediaDurationSeconds, maxMinutes, positionMinutes }) : positionMinutes,
  ), [maxMinutes, mediaDurationSeconds])
  const minHeight = resolveVideoSequenceRulerMinHeight(timelineLanes.length)
  const timelineScaleMaxMinutes = React.useMemo(() => resolveVideoSequenceTimelineScaleMaxMinutes({ maxMinutes, mediaDurationSeconds }), [maxMinutes, mediaDurationSeconds])
  const handleDropMedia = React.useCallback((payload: MediaDragPayload, positionMinutes: number) => (
    workflowProjection ? false : onDropMedia(payload, positionMinutes)
  ), [onDropMedia, workflowProjection])
  const mediaDropTargetProps = useVideoSequenceTimelineMediaDropTarget({ contentRef, maxMinutes: timelineScaleMaxMinutes, onDropMedia: handleDropMedia, targetRef: mediaDropRef })
  const timelineAxisTicks = React.useMemo(() => buildVideoSequenceTimelineZoomTicks({ displayTicks, frameRate: mediaFrameRate, maxMinutes: timelineScaleMaxMinutes, mediaDurationSeconds, timelineZoom }), [displayTicks, mediaDurationSeconds, mediaFrameRate, timelineScaleMaxMinutes, timelineZoom])
  const timelineContentZoom = React.useMemo(() => resolveVideoSequenceTimelineContentZoom({ frameRate: mediaFrameRate, mediaDurationSeconds, timelineZoom }), [mediaDurationSeconds, mediaFrameRate, timelineZoom])
  const appendSpacePercent = React.useMemo(() => resolveVideoSequenceTimelineAppendSpacePercent(timelineZoom), [timelineZoom])
  const workspaceLayout = React.useMemo(() => resolveVideoSequenceTimelineWorkspaceLayout({ appendSpacePercent, timelineContentZoom }), [appendSpacePercent, timelineContentZoom])
  const bodyMinHeight = Math.max(1, minHeight - VIDEO_SEQUENCE_LANE_TOP_OFFSET_PX)
  const animationState = React.useMemo(() => buildTimelineAnimationState({
    active: !!draggingRowKey || !!selectedRowKey,
    itemCount: taskSpans.length,
    progress: playheadPercent / 100,
    surface: 'bottom-timeline',
  }), [draggingRowKey, playheadPercent, selectedRowKey, taskSpans.length])
  const { style: animationStyle, ...animationAttributes } = animationState.attributes
  const setRulerScrollElement = React.useCallback((element: HTMLElement | null) => {
    mediaDropRef.current = element
    rulerScrollRef.current = element
  }, [])
  React.useEffect(() => {
    const scroller = rulerScrollRef.current
    if (!scroller) return
    const syncSidebarScroll = () => laneSidebarScrollRef.current?.style.setProperty('--kg-video-sequence-sidebar-scroll-top', `${scroller.scrollTop || 0}px`)
    syncSidebarScroll()
    scroller.addEventListener('scroll', syncSidebarScroll, { passive: true })
    return () => scroller.removeEventListener('scroll', syncSidebarScroll)
  }, [])
  return (
    <section
      className="timeline-video-sequence-editor timeline-video-sequence-grid"
      aria-label={workflowProjection ? 'Workflow Gantt timeline' : 'Video sequence editor'}
      {...animationAttributes}
      style={{ minHeight, ...(animationStyle || {}) }}
      data-kg-animation-object-opacity={animationState.objectFrame.opacity}
      data-kg-animation-object-scale={animationState.objectFrame.scale}
      data-kg-animation-object-translate-x={animationState.objectFrame.translateX}
      data-kg-animation-easing-curve={animationState.easing.curve}
      data-kg-animation-frame-by-frame={animationState.frameByFrame.frameCount}
      data-kg-animation-frame-rate={animationState.frameByFrame.frameRate}
      data-kg-animation-frame-timing={animationState.frameByFrame.timing}
      data-kg-animation-layer-modifiers={animationState.modifiers.join(' ')}
      data-kg-animation-layer-panel={animationState.layerPanel.dragSort ? `${animationState.layerPanel.contextMenu} ${animationState.layerPanel.inlineRenameKey} ${animationState.layerPanel.grouping}` : undefined}
      data-kg-animation-layer-modes={animationState.layerPanel.layerModes.join(' ')}
      data-kg-animation-layer-properties={animationState.propertyTokens}
      data-kg-animation-loop-modes={animationState.loopModes.join(' ')}
      data-kg-animation-recording-enabled={animationState.recording.enabled ? '1' : undefined}
      data-kg-animation-vector-morph-path={animationState.vectorMorph.pathSample}
      data-kg-video-sequence-projection-mode={projectionMode}
    >
      <aside className="timeline-video-sequence-lane-sidebar" aria-label={workflowProjection ? 'Workflow lane labels' : 'Video sequence lane labels'}>
        <VideoSequenceTimeAxisControls>{timeAxisControls}</VideoSequenceTimeAxisControls>
        <section
          ref={laneSidebarScrollRef}
          className="timeline-video-sequence-lane-sidebar-scroll"
          style={buildVideoSequenceLaneSidebarStyle(timelineLanes)}
        >
          {timelineLanes.map(lane => (
            <section key={lane.id} className="timeline-video-sequence-lane-label" data-kg-video-sequence-display-lane-label={lane.id} data-kg-video-sequence-lane-append={'append' in lane && lane.append ? '1' : undefined} data-kg-video-sequence-lane-label={'semanticId' in lane ? lane.semanticId : 'inserted'} data-kg-video-sequence-inserted-lane={'content' in lane ? lane.id : undefined}>
              {lane.label}
            </section>
          ))}
        </section>
      </aside>
      <section ref={setRulerScrollElement} className="timeline-video-sequence-ruler-scroll timeline-video-sequence-ruler-surface" aria-label={workflowProjection ? 'Workflow timeline rail' : 'Video sequence timeline rail'} data-kg-video-sequence-ruler-scroll="1" {...mediaDropTargetProps}>
        <section className="timeline-video-sequence-ruler-scroll-content" aria-label={workflowProjection ? 'Workflow timeline workspace' : 'Video sequence timeline workspace'} style={{ minHeight, width: `${workspaceLayout.workspaceWidthPercent}%` }}>
        <section
          ref={viewportRef}
          className="timeline-video-sequence-ruler-viewport"
          aria-label={workflowProjection ? 'Workflow timeline axis and lanes' : 'Video sequence timeline axis and lanes'}
          style={{ flexBasis: `${workspaceLayout.viewportFlexPercent}%`, minHeight, '--kg-video-sequence-lane-count': timelineLanes.length } as React.CSSProperties}
          data-kg-video-sequence-ruler-viewport="1"
          data-kg-video-sequence-content-zoom={String(timelineContentZoom)}
          data-kg-gantt-timeline-zoom={String(timelineZoom)}
        >
        <section className="timeline-video-sequence-ruler-axis" aria-label="Timeline time ruler" data-kg-video-sequence-ruler-axis="1" onPointerDown={onRulerPointerDown}>
          <VideoSequenceTimelineRulerTicks displayTicks={timelineAxisTicks} />
          {timeRulerOverlay}
          <span
            className="timeline-transport-playhead-marker timeline-video-sequence-ruler-playhead-marker"
            style={{ left: resolveVideoSequenceRulerInsetLeft(timelineScaleMaxMinutes > 0 ? playheadPercent * (maxMinutes / timelineScaleMaxMinutes) : playheadPercent) }}
            data-kg-video-sequence-ruler-playhead-marker="1"
            aria-label="Timeline playhead marker"
            onPointerDown={onRulerPointerDown}
          />
        </section>
        <section
          ref={contentRef}
          className="timeline-transport-ruler-content timeline-video-sequence-ruler-content"
          style={{ minHeight: bodyMinHeight } as React.CSSProperties}
          data-kg-gantt-timeline-ruler-content="1"
          data-kg-video-sequence-ruler-body="1"
          onPointerDown={onRulerPointerDown}
        >
        <svg className="timeline-video-sequence-motion-vector" aria-hidden="true" focusable="false" preserveAspectRatio="none" viewBox="0 0 100 10" data-kg-animation-svg-attribute-target="1">
          <path
            d={animationState.vectorMorph.pathSample}
            fill="none"
            pathLength={animationState.svg.pathLength}
            stroke="currentColor"
            strokeDasharray={animationState.svg.dashArray}
            strokeDashoffset={animationState.svg.dashOffset}
            strokeLinecap="round"
            strokeWidth="1.5"
          />
        </svg>
        <span
          className="timeline-transport-playhead"
          style={{ left: resolveVideoSequenceRulerInsetLeft(timelineScaleMaxMinutes > 0 ? playheadPercent * (maxMinutes / timelineScaleMaxMinutes) : playheadPercent) }}
          data-kg-gantt-timeline-playhead="1"
          data-kg-video-sequence-ruler-playhead="1"
          aria-label="Timeline playhead"
          onPointerDown={onRulerPointerDown}
        >
        </span>
        {timelineInsertedLanes.map(lane => {
          const laneIndex = visibleLaneIndexById.get(lane.id)
          if (laneIndex === undefined) return null
          const laneSelectRowKey = lane.selectRowKey || ''
          const selected = !!laneSelectRowKey && selectedRowKey === laneSelectRowKey
          const laneContent = typeof lane.content === 'function'
            ? lane.content({ selected, selectRowKey: laneSelectRowKey })
            : lane.content
          return (
            <section
              key={`inserted:${lane.id}`}
              className="timeline-video-sequence-inserted-lane"
              style={{ top: `${laneIndex * VIDEO_SEQUENCE_LANE_HEIGHT_PX}px` }}
              data-kg-video-sequence-inserted-lane-content={lane.id}
            >
              {laneContent}
            </section>
          )
        })}
        {renderableSpans.map((span, index) => {
          const media = clipMediaByRowKey.get(span.rowKey)
          if (!media) return null
          const { compactSourceMedia, compactSourcePlaceholder, lane, semanticFrameSamples, showMediaCues, sourceAudioWaveformSamples, thumbnailOrigin, thumbnailSamples, thumbnailWindow, verticalMarker } = media
          const compactTimelineBar = workflowProjection || compactSourceMedia || !editable
          const previewSpan = dragPreview?.rowKey === span.rowKey ? dragPreview : null
          const startMinutes = previewSpan?.startMinutes ?? span.startMinutes
          const durationMinutes = previewSpan?.durationMinutes ?? span.durationMinutes
          const leftPercent = timelineScaleMaxMinutes > 0 ? (startMinutes / timelineScaleMaxMinutes) * 100 : 0
          const displayLaneId = displayLaneIdByRowKey.get(span.rowKey) || lane
          const minWidthPercent = lane === 'fbf' ? 0.24 : 2
          const widthPercent = timelineScaleMaxMinutes > 0 ? Math.max(minWidthPercent, (durationMinutes / timelineScaleMaxMinutes) * 100) : 0
          const laneIndex = visibleLaneIndexById.get(displayLaneId) ?? visibleLaneIndexById.get(lane) ?? 0
          const selected = selectedRowKey === span.rowKey
          const dragging = draggingRowKey === span.rowKey
          const activeResizeMode = resolveActiveVideoSequenceResizeMode({ dragging, draggingMode, previewSpan, span })
          const cueSamples = showMediaCues && editable
            ? buildVideoSequenceTimelineCueSamples({
                sampleCount: Math.max(6, Math.round(durationMinutes * 2)),
                seedText: `${span.label} ${span.raw}`,
              })
            : []
          const frameSamples = showMediaCues && !thumbnailSamples.length
            ? buildVideoSequenceTimelineFrameSamples({
                sampleCount: Math.max(4, Math.round(durationMinutes * 1.6)),
                seedText: `${span.label} ${span.raw}`,
              })
            : []
          const waveformSamples = lane === 'audio' && !verticalMarker
            ? (sourceAudioWaveformSamples.length ? sourceAudioWaveformSamples : buildVideoSequenceTimelineWaveformSamples({
                sampleCount: compactSourceMedia ? Math.max(320, Math.round(durationMinutes * 480)) : Math.max(8, Math.round(durationMinutes * 3)),
                seedText: `${span.label} ${span.raw}`,
              }))
            : []
          const keyframeSamples = lane === 'keyframe' && !verticalMarker ? animationState.keyframes : []
          const morphSamples = lane === 'morph' && !verticalMarker
            ? buildVideoSequenceTimelineCueSamples({
                sampleCount: Math.max(5, Math.round(durationMinutes * 1.4)),
                seedText: `${span.label} ${span.raw} morph`,
              })
            : []
          const textSamples = lane === 'text' && !verticalMarker
            ? buildVideoSequenceTimelineFrameSamples({
                sampleCount: Math.max(4, Math.round(durationMinutes * 1.2)),
                seedText: `${span.label} ${span.raw} text`,
              })
            : []
          const nestedSamples = (lane === 'nested' || lane === 'fbf' || lane === 'keyframe') && !verticalMarker && !compactSourceMedia
            && !thumbnailSamples.length
            ? buildVideoSequenceTimelineFrameSamples({ sampleCount: Math.max(4, Math.round(durationMinutes * 1.1)), seedText: `${span.label} ${span.raw} nested` })
            : []
          const clipStartLabel = formatClipTime(startMinutes)
          const clipEndLabel = formatClipTime(startMinutes + durationMinutes)
          const denseFbfClip = lane === 'fbf' && !verticalMarker && (durationMinutes <= VIDEO_SEQUENCE_DENSE_FBF_MAX_DURATION_MINUTES || widthPercent < 3.5)
          const clipOverlay = renderClipOverlay?.({
            compact: compactTimelineBar,
            displayLaneId,
            lane,
            selected,
            span,
            verticalMarker,
          }) || null
          return (
            <article
              key={`span:${span.rowKey}`}
              className={`timeline-transport-track-clip timeline-transport-track-clip--lane-${lane} ${verticalMarker ? 'timeline-transport-track-clip--milestone' : ''} ${selected ? 'timeline-transport-track-clip--selected' : ''} ${dragging ? 'timeline-transport-track-clip--dragging' : ''}`}
              style={{
                left: verticalMarker ? `clamp(24px, ${leftPercent}%, calc(100% - 24px))` : resolveVideoSequenceRulerInsetLeft(leftPercent),
                top: verticalMarker ? '0px' : `${laneIndex * VIDEO_SEQUENCE_LANE_HEIGHT_PX + (compactTimelineBar ? 0 : (index % 2) * 2)}px`,
                width: verticalMarker ? '14px' : resolveVideoSequenceRulerInsetWidth(Math.min(100 - leftPercent, widthPercent)),
              }}
              aria-label={`${span.label} timeline clip`}
              data-kg-gantt-timeline-track-span="1"
              data-kg-video-sequence-drag-mode={dragging ? draggingMode || undefined : undefined}
              data-kg-gantt-timeline-track-dragging={dragging ? '1' : undefined}
              data-kg-gantt-timeline-track-row-key={span.rowKey}
              data-kg-video-sequence-active-resize-mode={activeResizeMode || undefined}
              data-kg-video-sequence-active-track={selected ? '1' : undefined}
              data-kg-timeline-clip-compact={compactTimelineBar ? '1' : undefined}
              data-kg-timeline-clip-select-surface={compactTimelineBar && !thumbnailSamples.length ? '1' : undefined}
              data-kg-compact-source-placeholder={compactSourcePlaceholder ? '1' : undefined}
              data-kg-video-sequence-clip-thumbnail-origin={thumbnailOrigin}
              data-kg-video-sequence-clip-thumbnail-reel={thumbnailSamples.length ? '1' : undefined}
              data-kg-video-sequence-dense-fbf={denseFbfClip ? '1' : undefined}
              data-kg-video-sequence-display-lane={displayLaneId}
              data-kg-video-sequence-audio-waveform-source={lane === 'audio' ? (sourceAudioWaveformSamples.length ? 'source' : 'synthetic') : undefined} data-kg-video-sequence-audio-waveform-samples={lane === 'audio' ? waveformSamples.length : undefined}
              data-kg-video-sequence-lane={lane}
              data-kg-video-sequence-source-window={resolveVideoSequenceSourceWindowLabel(thumbnailWindow) || undefined}
              data-kg-video-sequence-trim-start={clipStartLabel}
              data-kg-video-sequence-trim-end={clipEndLabel}
              data-kg-video-sequence-motion-easing={animationState.easing.mode}
              data-kg-video-sequence-frame-rate={animationState.frameByFrame.frameRate}
              data-kg-video-sequence-frame-timing={animationState.frameByFrame.timing}
              data-kg-video-sequence-layer-mode={lane === 'detached' ? 'detached-continuous' : lane === 'fbf' ? 'animated-frame' : undefined}
              data-kg-video-sequence-motion-modifiers={animationState.modifiers.join(' ')}
              data-kg-video-sequence-motion-properties={animationState.propertyTokens}
              data-kg-video-sequence-motion-loop-modes={animationState.loopModes.join(' ')}
              data-kg-video-sequence-nested-animation={animationState.nested.modes.join(' ')}
              data-kg-video-sequence-nested-composite={animationState.nested.compositeOrder}
              data-kg-video-sequence-nested-fps={`timeline:${animationState.nested.timelineFrameRate} fbf:${animationState.nested.fbfFrameRate}`}
              data-kg-video-sequence-nested-render-passes={animationState.nested.renderPasses.join(' ')}
              data-kg-video-sequence-recording-mode={animationState.recording.enabled ? 'playhead-auto-key' : undefined}
              data-kg-video-sequence-motion-work-area={`${animationState.workArea.start}-${animationState.workArea.end}`}
              title={span.label}
            >
              {compactSourcePlaceholder ? null : (
                <VideoSequenceClipThumbnailStrip onMovePointerStart={(event, targetSpan) => onTrackPointerStart(event, targetSpan, 'move')} onSelectRowPosition={onSelectRowPosition} span={span} suppressPreview={activeResizeMode !== null} thumbnailOrigin={thumbnailOrigin} thumbnailWindow={thumbnailWindow} thumbnails={thumbnailSamples} />
              )}
              <VideoSequenceFrameSampleRail samples={semanticFrameSamples} span={span} />
              {frameSamples.length ? (
                <section className="timeline-video-sequence-clip-frame-strip" aria-hidden="true" data-kg-video-sequence-clip-frames="1">
                  {frameSamples.map((sample, frameIndex) => (
                    <span
                      key={`frame:${span.rowKey}:${frameIndex}`}
                      className="timeline-video-sequence-clip-frame"
                      style={{
                        '--kg-video-sequence-frame-focus': `${(sample + frameIndex * 13) % 100}%`,
                        opacity: Math.max(0.52, sample / 100),
                      } as React.CSSProperties}
                    />
                  ))}
                </section>
              ) : null}
              {cueSamples.length ? (
                <section className="timeline-video-sequence-clip-cues" aria-hidden="true" data-kg-video-sequence-clip-cues="1">
                  {cueSamples.map((sample, cueIndex) => (
                    <span
                      key={`cue:${span.rowKey}:${cueIndex}`}
                      className="timeline-video-sequence-clip-cue"
                      style={{
                        height: `${Math.max(5, sample / 9)}px`,
                        opacity: Math.max(0.24, sample / 100),
                      }}
                    />
                  ))}
                </section>
              ) : null}
              {clipOverlay}
              {waveformSamples.length ? (
                <section className="timeline-video-sequence-audio-waveform" aria-hidden="true" data-kg-video-sequence-audio-waveform="1">
                  {waveformSamples.map((sample, sampleIndex) => (
                    <span
                      key={`waveform:${span.rowKey}:${sampleIndex}`}
                      className="timeline-video-sequence-audio-waveform-bar"
                      style={{ height: `${Math.max(4, sample / 4)}px` }}
                    />
                  ))}
                </section>
              ) : null}
              {lane === 'audio' && !verticalMarker ? <VideoSequenceAudioDbControl label={span.label} rowKey={span.rowKey} /> : null}
              {keyframeSamples.length ? (
                <section className="timeline-video-sequence-keyframe-strip" aria-label={`${span.label} keyframes`} data-kg-video-sequence-keyframes="1">
                  {keyframeSamples.map(keyframe => (
                    <span
                      key={`keyframe:${span.rowKey}:${keyframe.offset}`}
                      className="timeline-video-sequence-keyframe"
                      style={{ left: `${keyframe.offset * 100}%` }}
                      title={`${keyframe.easing} ${Math.round(keyframe.offset * 100)}%`}
                      data-kg-video-sequence-keyframe-easing={keyframe.easing}
                      data-kg-video-sequence-keyframe-offset={keyframe.offset}
                      data-kg-video-sequence-keyframe-value={keyframe.value}
                    />
                  ))}
                </section>
              ) : null}
              {morphSamples.length ? (
                <section className="timeline-video-sequence-morph-strip" aria-label={`${span.label} vector morph samples`} data-kg-video-sequence-vector-morph="1" data-kg-video-sequence-vector-morph-boolean-ops={animationState.vectorMorph.booleanOperations.join(' ')} data-kg-video-sequence-vector-morph-path={animationState.vectorMorph.interpolatedPath} data-kg-video-sequence-vector-morph-shapes={animationState.vectorMorph.shapeFamilies.join(' ')}>
                  {morphSamples.map((sample, sampleIndex) => (
                    <span
                      key={`morph:${span.rowKey}:${sampleIndex}`}
                      className="timeline-video-sequence-morph-node"
                      style={{ '--kg-video-sequence-morph-node': `${sample}%` } as React.CSSProperties}
                    />
                  ))}
                </section>
              ) : null}
              {textSamples.length ? (
                <section className="timeline-video-sequence-text-strip" aria-label={`${span.label} text animation ranges`} data-kg-video-sequence-text-animation="1" data-kg-video-sequence-text-keyframes={animationState.text.keyframes.length} data-kg-video-sequence-text-properties={animationState.text.properties.join(' ')} data-kg-video-sequence-text-scopes={animationState.text.scopes.join(' ')}>
                  {textSamples.map((sample, sampleIndex) => (
                    <span
                      key={`text:${span.rowKey}:${sampleIndex}`}
                      className="timeline-video-sequence-text-range"
                      style={{ '--kg-video-sequence-text-range': `${sample}%` } as React.CSSProperties}
                    />
                  ))}
                </section>
              ) : null}
              {nestedSamples.length ? (
                <section className="timeline-video-sequence-nested-strip" aria-label={`${span.label} nested animation composite`} data-kg-video-sequence-nested-composite-strip="1">
                  {nestedSamples.map((sample, sampleIndex) => (
                    <span key={`nested:${span.rowKey}:${sampleIndex}`} className="timeline-video-sequence-nested-frame" style={{ '--kg-video-sequence-nested-frame': `${sample}%`, '--kg-video-sequence-nested-phase': `${(sampleIndex % 3) + 1}` } as React.CSSProperties} />
                  ))}
                </section>
              ) : null}
              {editable ? <button type="button" className="timeline-transport-track-handle timeline-transport-track-handle--start" aria-label={`Resize ${span.label} start`} data-kg-gantt-timeline-track-drag-mode="resize-start" title={`Trim ${span.label} start`} onPointerDown={event => onTrackPointerStart(event, span, 'resize-start')}>
                <span className="timeline-transport-track-handle-grip" aria-hidden="true" />
                {activeResizeMode === 'resize-start' ? <span className="timeline-video-sequence-trim-guide">{VIDEO_SEQUENCE_RESIZE_MODE_LABELS[activeResizeMode]}</span> : null}
              </button> : null}
              <button type="button" className="timeline-transport-track-clip-move" aria-label={`${editable ? 'Move' : 'Select'} ${span.label}`} data-kg-gantt-timeline-track-drag-mode={editable ? 'move' : undefined} onClick={() => onSelectRowKey(span.rowKey)} onPointerDown={editable ? event => onTrackPointerStart(event, span, 'move') : undefined}>
                <span className="timeline-transport-track-clip-label">{span.label}</span>
                {!verticalMarker && !compactTimelineBar ? (
                  <time className="timeline-video-sequence-clip-timecode" dateTime={`PT${Math.max(0, Math.round(durationMinutes))}S`}>
                    {clipStartLabel}-{clipEndLabel}
                  </time>
                ) : null}
                {!verticalMarker && !workflowProjection ? <VideoSequenceTimelineClipMeta compact={compactTimelineBar} durationLabel={formatClipTime(durationMinutes)} durationMinutes={durationMinutes} sourceWindow={thumbnailWindow} /> : null}
              </button>
              {editable ? <button type="button" className="timeline-transport-track-handle timeline-transport-track-handle--end" aria-label={`Resize ${span.label} end`} data-kg-gantt-timeline-track-drag-mode="resize-end" title={`Trim ${span.label} end`} onPointerDown={event => onTrackPointerStart(event, span, 'resize-end')}><span className="timeline-transport-track-handle-grip" aria-hidden="true" />
                {activeResizeMode === 'resize-end' ? <span className="timeline-video-sequence-trim-guide">{VIDEO_SEQUENCE_RESIZE_MODE_LABELS[activeResizeMode]}</span> : null}
              </button> : null}
            </article>
          )
        })}
        {scopes.length ? (
          <section className="timeline-video-sequence-ruler-scope-strip" aria-label="Video sequence scopes" data-kg-video-sequence-ruler-scopes="1">
            {scopes.map(scope => (
              <section
                key={scope.id}
                className="timeline-video-sequence-ruler-scope"
                aria-label={`${scope.label} display`}
                title={scope.label}
                data-kg-video-sequence-scope={scope.id}
                data-kg-video-sequence-scope-active={scope.active ? '1' : undefined}
                data-kg-video-sequence-scope-active-family={scope.activeFamilyId || undefined}
                data-kg-video-sequence-scope-activity-mode={scope.activityMode}
                data-kg-video-sequence-scope-selection-active={scope.selectionActive ? '1' : undefined}
              >
                <section className="timeline-video-sequence-ruler-scope-bars" aria-label={`${scope.label} display`}>
                  {scope.samples.map((sample, sampleIndex) => (
                    <span
                      key={`${scope.id}:${sampleIndex}`}
                      className="timeline-video-sequence-ruler-scope-bar"
                      style={{ '--kg-video-sequence-scope-bar': `${sample}%` } as React.CSSProperties}
                      aria-hidden="true"
                    />
                  ))}
                </section>
              </section>
            ))}
          </section>
        ) : null}
        </section>
        </section>
        {appendSpacePercent > 0 ? <section className="timeline-video-sequence-ruler-append-space" aria-label="Timeline append workspace" data-kg-video-sequence-append-space="1" style={{ flexBasis: `${workspaceLayout.appendFlexPercent}%`, minHeight }} /> : null}
        </section>
      </section>
    </section>
  )
}
