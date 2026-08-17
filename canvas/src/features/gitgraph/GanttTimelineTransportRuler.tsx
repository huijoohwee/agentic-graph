import type React from 'react'
import { VideoSequenceTimelineRuler, type VideoSequenceTimelineClipOverlayRenderer, type VideoSequenceTimelineInsertedLane } from '@/components/timeline/VideoSequenceTimelineRuler'
import { type GanttTimelineTransportRulerModel } from './useGanttTimelineTransportRulerModel'

export type GanttTimelineTransportRulerProps = {
  model: GanttTimelineTransportRulerModel['ruler']
  renderClipOverlay?: VideoSequenceTimelineClipOverlayRenderer
  timeAxisControls?: React.ReactNode
  timeRulerOverlay?: React.ReactNode
  timelineInsertedLanes?: readonly VideoSequenceTimelineInsertedLane[]
}

export function GanttTimelineTransportRuler(args: GanttTimelineTransportRulerProps) {
  return (
    <VideoSequenceTimelineRuler
      contentRef={args.model.contentRef}
      viewportRef={args.model.viewportRef}
      disabledLaneIds={args.model.disabledLaneIds}
      displayTicks={args.model.displayTicks}
      dragPreview={args.model.dragPreview}
      draggingMode={args.model.draggingMode}
      draggingRowKey={args.model.draggingRowKey}
      editable={args.model.editable}
      maxMinutes={args.model.maxMinutes}
      mediaDurationSeconds={args.model.mediaDurationSeconds}
      mediaFrameRate={args.model.mediaFrameRate}
      playheadPercent={args.model.playheadPercent}
      projectionMode={args.model.mode}
      renderClipOverlay={args.renderClipOverlay}
      selectedRowKey={args.model.selectedRowKey}
      scopes={args.model.scopes}
      sourceThumbnails={args.model.sourceThumbnails}
      sourceThumbnailWindows={args.model.sourceThumbnailWindows}
      sourceThumbnailSets={args.model.sourceThumbnailSets}
      taskSpans={args.model.taskSpans}
      timeAxisControls={args.timeAxisControls}
      timeRulerOverlay={args.timeRulerOverlay}
      timelineInsertedLanes={args.timelineInsertedLanes}
      timelineZoom={args.model.timelineZoom}
      onDropMedia={args.model.onDropMedia}
      onRulerPointerDown={args.model.onRulerPointerDown}
      onSelectRowKey={args.model.onSelectRowKey}
      onSelectRowPosition={args.model.onSelectRowPosition}
      onTrackPointerStart={args.model.onTrackPointerStart}
    />
  )
}
