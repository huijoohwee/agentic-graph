import {
  useGanttTimelineTransportSurfaceModel,
  type GanttTimelineTransportSurfaceModel,
} from './useGanttTimelineTransportSurfaceModel'
import type { GanttTimelineTransportMode } from './ganttTimelineTransportMode'
import type { GanttTimelineTransportCommandAdapter } from './ganttTimelineTransportCommandAdapter'
import type { VideoSequenceTimelineInsertedLane } from '@/components/timeline/VideoSequenceTimelineRuler'

export type GanttTimelineTransportRouteModel = {
  surfaceModel: GanttTimelineTransportSurfaceModel
}

export function useGanttTimelineTransportRouteModel(args: {
  code: string
  clockActive?: boolean
  compact: boolean
  commandAdapter?: GanttTimelineTransportCommandAdapter
  editable?: boolean
  mode: GanttTimelineTransportMode
  publishPlaybackRequest?: boolean
  runtimeDocumentKey?: string
  runtimeDurationSeconds?: number
  runtimeFrameRate?: number
  timelineInsertedLanes?: readonly VideoSequenceTimelineInsertedLane[]
  onSelectedRowKeyChange?: (rowKey: string | null) => void
}): GanttTimelineTransportRouteModel {
  const transportSurfaceModel = useGanttTimelineTransportSurfaceModel({
    code: args.code,
    clockActive: args.clockActive,
    compact: args.compact,
    commandAdapter: args.commandAdapter,
    editable: args.editable,
    mode: args.mode,
    publishPlaybackRequest: args.publishPlaybackRequest,
    runtimeDocumentKey: args.runtimeDocumentKey,
    runtimeDurationSeconds: args.runtimeDurationSeconds,
    runtimeFrameRate: args.runtimeFrameRate,
    timelineInsertedLanes: args.timelineInsertedLanes,
    onSelectedRowKeyChange: args.onSelectedRowKeyChange,
  })

  return {
    surfaceModel: transportSurfaceModel,
  }
}
