import {
  useGanttTimelineTransportSurfaceModel,
  type GanttTimelineTransportSurfaceModel,
} from './useGanttTimelineTransportSurfaceModel'
import type { GanttTimelineTransportMode } from './ganttTimelineTransportMode'
import type { GanttTimelineTransportCommandAdapter } from './ganttTimelineTransportCommandAdapter'

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
    onSelectedRowKeyChange: args.onSelectedRowKeyChange,
  })

  return {
    surfaceModel: transportSurfaceModel,
  }
}
