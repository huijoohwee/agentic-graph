import React from 'react'
import type { TimelineMediaReaderThumbnail } from '@/components/timeline/timelineMediaReader'
import type { VideoSequenceTimelineSourceThumbnailSet, VideoSequenceTimelineThumbnailWindow } from '@/components/timeline/VideoSequenceTimelineRuler'
import type { MediaDragPayload } from '@/lib/ui/mediaDragPayload'
import { clampTimelineTransportValue } from '@/components/timeline/timelineTransport'
import { type VideoSequenceTimelineLaneId, type VideoSequenceTimelineScope } from '@/components/timeline/videoSequenceTimeline'
import type { GanttTimelineTransportMode } from './ganttTimelineTransportMode'
import {
  type MermaidGanttBarDragMode,
  type MermaidGanttTimelineDragPreview,
  type MermaidGanttTimelineTaskSpan,
  type MermaidGanttTimelineTick,
} from '@/lib/mermaid/mermaidGanttBarInteraction'

export type GanttTimelineTransportRulerModel = {
  chrome: {
    rulerClassName: string
    rulerProps: React.HTMLAttributes<HTMLElement>
    subtitleLabel: string
    totalLabel: string
    value: number
  }
  ruler: {
    contentRef: React.RefObject<HTMLElement | null>
    viewportRef: React.RefObject<HTMLElement | null>
    displayTicks: readonly MermaidGanttTimelineTick[]
    dragPreview: MermaidGanttTimelineDragPreview | null
    draggingMode: MermaidGanttBarDragMode | null
    draggingRowKey: string
    editable: boolean
    canEditTrack?: (rowKey: string, mode: MermaidGanttBarDragMode) => boolean
    maxMinutes: number
    mediaDurationSeconds: number
    mediaFrameRate: number
    mode: GanttTimelineTransportMode
    playheadPercent: number
    scopes: readonly VideoSequenceTimelineScope[]
    selectedRowKey: string
    sourceThumbnails: readonly TimelineMediaReaderThumbnail[]
    sourceThumbnailWindows: readonly VideoSequenceTimelineThumbnailWindow[]
    sourceThumbnailSets: readonly VideoSequenceTimelineSourceThumbnailSet[]
    taskSpans: readonly MermaidGanttTimelineTaskSpan[]
    timelineZoom: number
    disabledLaneIds: readonly VideoSequenceTimelineLaneId[]
    onDropMedia: (payload: MediaDragPayload, positionMinutes: number) => boolean
    onRulerPointerDown: (event: React.PointerEvent<HTMLElement>) => void
    onSelectRowKey: (rowKey: string) => void
    onSelectRowPosition: (rowKey: string, positionMinutes: number) => void
    onTrackPointerStart: (event: React.PointerEvent<HTMLElement>, span: MermaidGanttTimelineTaskSpan, mode: MermaidGanttBarDragMode) => void
  }
}

export function useGanttTimelineTransportRulerModel(args: {
  compact: boolean
  contentRef: React.RefObject<HTMLElement | null>
  viewportRef: React.RefObject<HTMLElement | null>
  displayTicks: readonly MermaidGanttTimelineTick[]
  dragPreview: MermaidGanttTimelineDragPreview | null
  draggingMode: MermaidGanttBarDragMode | null
  draggingRowKey: string
  editable: boolean
  canEditTrack?: (rowKey: string, mode: MermaidGanttBarDragMode) => boolean
  maxMinutes: number
  mediaDurationSeconds: number
  mediaFrameRate: number
  mode: GanttTimelineTransportMode
  playheadPercent: number
  positionMinutes: number
  scopes: readonly VideoSequenceTimelineScope[]
  selectedRowKey: string
  sourceThumbnails: readonly TimelineMediaReaderThumbnail[]
  sourceThumbnailWindows: readonly VideoSequenceTimelineThumbnailWindow[]
  sourceThumbnailSets: readonly VideoSequenceTimelineSourceThumbnailSet[]
  taskSpans: readonly MermaidGanttTimelineTaskSpan[]
  timelineZoom: number
  totalLabel: string
  visibleLaneCount: number
  disabledLaneIds: readonly VideoSequenceTimelineLaneId[]
  onDropMedia: (payload: MediaDragPayload, positionMinutes: number) => boolean
  onRulerPointerDown: (event: React.PointerEvent<HTMLElement>) => void
  onRulerWheel: (event: React.WheelEvent<HTMLElement>) => void
  onSelectRowKey: (rowKey: string) => void
  onSelectRowPosition: (rowKey: string, positionMinutes: number) => void
  onTrackPointerStart: (event: React.PointerEvent<HTMLElement>, span: MermaidGanttTimelineTaskSpan, mode: MermaidGanttBarDragMode) => void
}): GanttTimelineTransportRulerModel {
  return React.useMemo(() => ({
    chrome: {
      rulerClassName: args.compact
        ? 'timeline-transport-ruler--compact timeline-transport-ruler--tracks timeline-transport-ruler--video-sequence'
        : 'timeline-transport-ruler--tracks timeline-transport-ruler--video-sequence',
      rulerProps: {
        'data-kg-gantt-timeline-ruler': 'bottomPanel',
        'data-kg-gantt-timeline-pinch-zoom': '1',
        onWheel: args.onRulerWheel,
        style: {
          '--kg-video-sequence-lane-count': args.visibleLaneCount,
        } as React.CSSProperties,
      } as React.HTMLAttributes<HTMLElement>,
      subtitleLabel: `${args.taskSpans.length} timeline rows`,
      totalLabel: args.totalLabel,
      value: clampTimelineTransportValue(args.positionMinutes, 0, Math.max(1, args.maxMinutes)),
    },
    ruler: {
      contentRef: args.contentRef,
      displayTicks: args.displayTicks,
      disabledLaneIds: args.disabledLaneIds,
      dragPreview: args.dragPreview,
      draggingMode: args.draggingMode,
      draggingRowKey: args.draggingRowKey,
      editable: args.editable,
      canEditTrack: args.canEditTrack,
      maxMinutes: args.maxMinutes,
      mediaDurationSeconds: args.mediaDurationSeconds,
      mediaFrameRate: args.mediaFrameRate,
      mode: args.mode,
      onDropMedia: args.onDropMedia,
      onRulerPointerDown: args.onRulerPointerDown,
      onSelectRowKey: args.onSelectRowKey,
      onSelectRowPosition: args.onSelectRowPosition,
      onTrackPointerStart: args.onTrackPointerStart,
      playheadPercent: args.playheadPercent,
      scopes: args.scopes,
      selectedRowKey: args.selectedRowKey,
      sourceThumbnails: args.sourceThumbnails,
      sourceThumbnailWindows: args.sourceThumbnailWindows,
      sourceThumbnailSets: args.sourceThumbnailSets,
      taskSpans: args.taskSpans,
      timelineZoom: args.timelineZoom,
      viewportRef: args.viewportRef,
    },
  }), [
    args.compact,
    args.contentRef,
    args.displayTicks,
    args.disabledLaneIds,
    args.dragPreview,
    args.draggingMode,
    args.draggingRowKey,
    args.editable,
    args.canEditTrack,
    args.maxMinutes,
    args.mediaDurationSeconds,
    args.mediaFrameRate,
    args.mode,
    args.onDropMedia,
    args.onRulerPointerDown,
    args.onRulerWheel,
    args.onSelectRowKey,
    args.onSelectRowPosition,
    args.onTrackPointerStart,
    args.playheadPercent,
    args.positionMinutes,
    args.scopes,
    args.selectedRowKey,
    args.sourceThumbnails,
    args.sourceThumbnailWindows,
    args.sourceThumbnailSets,
    args.taskSpans,
    args.timelineZoom,
    args.totalLabel,
    args.visibleLaneCount,
    args.viewportRef,
  ])
}
