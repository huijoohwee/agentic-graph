import React from 'react'
import { useGanttTimelineInteractions, type GanttTimelineTransportDragState } from './useGanttTimelineInteractions'
import { useGanttTimelineSelectionSync } from './useGanttTimelineSelectionSync'
import { useGanttTimelineTransportView } from './useGanttTimelineTransportView'
import {
  resolveMermaidGanttTimelineRowKeyAtPosition,
  type MermaidGanttTimelineModel,
} from '@/lib/mermaid/mermaidGanttBarInteraction'

export type GanttTimelineTransportInteractionModel = {
  canFitTimeline: boolean
  canZoomIn: boolean
  canZoomOut: boolean
  centerTimelinePlayhead: () => void
  dragPreview: ReturnType<typeof useGanttTimelineInteractions>['dragPreview']
  draggingMode: ReturnType<typeof useGanttTimelineInteractions>['draggingMode']
  draggingRowKey: string
  handleFitTimeline: () => void
  handlePositionChange: (value: number) => void
  handleRulerWheelZoom: (event: React.WheelEvent<HTMLElement>) => void
  handleRulerPointerScrub: ReturnType<typeof useGanttTimelineInteractions>['handleRulerPointerScrub']
  handleTrackPointerStart: ReturnType<typeof useGanttTimelineInteractions>['handleTrackPointerStart']
  handleZoomIn: () => void
  handleZoomOut: () => void
  playheadPercent: number
  timelineZoom: number
  timelineZoomPercent: number
}

export function useGanttTimelineTransportInteractionModel(args: {
  autoSnappingEnabled: boolean
  disabled: boolean
  markdownDocumentName: string
  markdownText: string
  maxMinutes: number
  playing: boolean
  positionMinutes: number
  rulerViewportRef: React.RefObject<HTMLElement | null>
  scrubMaxMinutes?: number
  selectedRowKey: string
  setSelectedRowKey: (rowKey: string) => void
  setTransportPlaybackPosition: (position: number) => void
  setTransportPlaying: (playing: boolean) => void
  timelineModel: MermaidGanttTimelineModel
  positionOnlySelectedRowKeys?: ReadonlySet<string>
  onCommitDrag: (args: {
    dragState: GanttTimelineTransportDragState
    effectiveDeltaMinutes: number
  }) => void
}): GanttTimelineTransportInteractionModel {
  const interactions = useGanttTimelineInteractions({
    autoSnappingEnabled: args.autoSnappingEnabled,
    markdownDocumentName: args.markdownDocumentName,
    markdownText: args.markdownText,
    maxMinutes: args.maxMinutes,
    positionMinutes: args.positionMinutes,
    scrubMaxMinutes: args.scrubMaxMinutes,
    resolveRowKeyAtPosition: position => resolveMermaidGanttTimelineRowKeyAtPosition(args.timelineModel, position),
    selectedRowKey: args.selectedRowKey,
    setSelectedRowKey: args.setSelectedRowKey,
    setTransportPlaybackPosition: args.setTransportPlaybackPosition,
    setTransportPlaying: args.setTransportPlaying,
    spans: args.timelineModel.taskSpans,
    onCommitDrag: args.onCommitDrag,
  })
  const transportView = useGanttTimelineTransportView({
    disabled: args.disabled,
    maxMinutes: args.maxMinutes,
    positionMinutes: args.positionMinutes,
    rulerViewportRef: args.rulerViewportRef,
  })

  useGanttTimelineSelectionSync({
    playing: args.playing,
    positionMinutes: args.positionMinutes,
    resolveRowKeyAtPosition: position => resolveMermaidGanttTimelineRowKeyAtPosition(args.timelineModel, position),
    selectedRowKey: args.selectedRowKey,
    setSelectedRowKey: args.setSelectedRowKey,
    setTransportPlaybackPosition: args.setTransportPlaybackPosition,
    positionOnlySelectedRowKeys: args.positionOnlySelectedRowKeys,
    taskSpans: args.timelineModel.taskSpans,
  })

  return {
    canFitTimeline: transportView.canFitTimeline,
    canZoomIn: transportView.canZoomIn,
    canZoomOut: transportView.canZoomOut,
    centerTimelinePlayhead: transportView.centerTimelinePlayhead,
    dragPreview: interactions.dragPreview,
    draggingMode: interactions.draggingMode,
    draggingRowKey: interactions.draggingRowKey,
    handleFitTimeline: transportView.handleFitTimeline,
    handlePositionChange: interactions.handlePositionChange,
    handleRulerWheelZoom: transportView.handleRulerWheelZoom,
    handleRulerPointerScrub: interactions.handleRulerPointerScrub,
    handleTrackPointerStart: interactions.handleTrackPointerStart,
    handleZoomIn: transportView.handleZoomIn,
    handleZoomOut: transportView.handleZoomOut,
    playheadPercent: transportView.playheadPercent,
    timelineZoom: transportView.timelineZoom,
    timelineZoomPercent: transportView.timelineZoomPercent,
  }
}
