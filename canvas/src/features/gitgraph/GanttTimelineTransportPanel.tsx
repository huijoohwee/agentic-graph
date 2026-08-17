import React from 'react'
import { GanttTimelineTransportSurface } from './GanttTimelineTransportSurface'
import { useGanttTimelineTransportRouteModel } from './useGanttTimelineTransportRouteModel'
import type { GanttTimelineTransportMode } from './ganttTimelineTransportMode'
import type { VideoSequenceTimelineClipOverlayRenderer, VideoSequenceTimelineInsertedLane } from '@/components/timeline/VideoSequenceTimelineRuler'
import type { GanttTimelineTransportCommandAdapter } from './ganttTimelineTransportCommandAdapter'

export function GanttTimelineTransportPanel({
  code,
  clockActive = false,
  compact,
  commandAdapter,
  editable = true,
  mode = 'media',
  publishPlaybackRequest = true,
  renderClipOverlay,
  runtimeDocumentKey = '',
  runtimeDurationSeconds = 0,
  runtimeFrameRate = 0,
  supplementalLanes,
  timeAxisControls,
  timeRulerOverlay,
  timelineInsertedLanes,
  onSelectedRowKeyChange,
}: {
  code: string
  clockActive?: boolean
  compact: boolean
  commandAdapter?: GanttTimelineTransportCommandAdapter
  editable?: boolean
  mode?: GanttTimelineTransportMode
  publishPlaybackRequest?: boolean
  renderClipOverlay?: VideoSequenceTimelineClipOverlayRenderer
  runtimeDocumentKey?: string
  runtimeDurationSeconds?: number
  runtimeFrameRate?: number
  supplementalLanes?: React.ReactNode
  timeAxisControls?: React.ReactNode
  timeRulerOverlay?: React.ReactNode
  timelineInsertedLanes?: readonly VideoSequenceTimelineInsertedLane[]
  onSelectedRowKeyChange?: (rowKey: string | null) => void
}) {
  const transportRouteModel = useGanttTimelineTransportRouteModel({
    code,
    clockActive,
    compact,
    commandAdapter,
    editable,
    mode,
    publishPlaybackRequest,
    runtimeDocumentKey,
    runtimeDurationSeconds,
    runtimeFrameRate,
    onSelectedRowKeyChange,
  })
  return <GanttTimelineTransportSurface model={transportRouteModel.surfaceModel} renderClipOverlay={renderClipOverlay} supplementalLanes={supplementalLanes} timeAxisControls={timeAxisControls} timeRulerOverlay={timeRulerOverlay} timelineInsertedLanes={timelineInsertedLanes} />
}
