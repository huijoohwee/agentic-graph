import React from 'react'
import { useGanttTimelineDocumentActions } from './useGanttTimelineDocumentActions'
import type { MermaidGanttTimelineTaskSpan } from '@/lib/mermaid/mermaidGanttBarInteraction'
import type { VideoSequenceExportPlan } from '@/components/timeline/videoSequenceExport'
import {
  GANTT_TIMELINE_TRANSPORT_COMMAND_SCHEMA,
  routeGanttTimelineTransportClipEdit,
  routeGanttTimelineTransportCommand,
  type GanttTimelineTransportCommandAdapter,
  type GanttTimelineTransportCommandTarget,
} from './ganttTimelineTransportCommandAdapter'

export type GanttTimelineTransportCommandModel = {
  chromeModelCommands: Pick<
    ReturnType<typeof useGanttTimelineDocumentActions>,
    | 'autoSnappingEnabled'
    | 'cancelEditedMediaExport'
    | 'exportSessionCollection'
    | 'exportingKind'
    | 'handleDownloadEditedMedia'
    | 'handleRetryEditedMediaExport'
    | 'handleRetryEditedMediaExportRunId'
    | 'handleToggleVideoSequenceTimingSyncMode'
    | 'handleVideoSequenceClipEdit'
    | 'handleVideoSequenceTool'
    | 'latestRetryableExportSession'
    | 'rippleEditingEnabled'
    | 'timingSyncMode'
  >
  handleCommittedDragUpdate: ReturnType<typeof useGanttTimelineDocumentActions>['handleCommittedDragUpdate']
  handleMediaDrop: ReturnType<typeof useGanttTimelineDocumentActions>['handleMediaDrop']
}

export function useGanttTimelineTransportCommandModel(args: {
  code: string
  commandAdapter?: GanttTimelineTransportCommandAdapter
  documentKey: string
  exportPlan: VideoSequenceExportPlan | null
  markdownDocumentName: string
  markdownText: string
  maxMinutes: number
  positionMinutes: number
  selectedSpan: MermaidGanttTimelineTaskSpan | null
  selectedRowKey: string
  setSelectedRowKey: (rowKey: string) => void
  setTransportPlaying: (nextPlaying: boolean) => void
}): GanttTimelineTransportCommandModel {
  const documentActions = useGanttTimelineDocumentActions({
    code: args.code,
    exportPlan: args.exportPlan,
    markdownDocumentName: args.markdownDocumentName,
    markdownText: args.markdownText,
    maxMinutes: args.maxMinutes,
    positionMinutes: args.positionMinutes,
    selectedSpan: args.selectedSpan,
    setSelectedRowKey: args.setSelectedRowKey,
    setTransportPlaying: args.setTransportPlaying,
  })

  const commandTarget = React.useMemo<GanttTimelineTransportCommandTarget>(() => ({
    documentKey: args.documentKey,
    playheadMinutes: args.positionMinutes,
    selectedRowKey: args.selectedRowKey || null,
  }), [args.documentKey, args.positionMinutes, args.selectedRowKey])

  const handleVideoSequenceTool = React.useCallback((toolId: Parameters<typeof documentActions.handleVideoSequenceTool>[0]) => {
    routeGanttTimelineTransportCommand({
      adapter: args.commandAdapter,
      command: {
        kind: 'tool',
        schema: GANTT_TIMELINE_TRANSPORT_COMMAND_SCHEMA,
        target: commandTarget,
        toolId,
      },
      markdownFallback: () => documentActions.handleVideoSequenceTool(toolId),
    })
  }, [args.commandAdapter, commandTarget, documentActions.handleVideoSequenceTool])

  const handleVideoSequenceClipEdit = React.useCallback((action: Parameters<typeof documentActions.handleVideoSequenceClipEdit>[0]) => {
    routeGanttTimelineTransportClipEdit({
      action,
      adapter: args.commandAdapter,
      markdownFallback: () => documentActions.handleVideoSequenceClipEdit(action),
      target: commandTarget,
    })
  }, [args.commandAdapter, commandTarget, documentActions.handleVideoSequenceClipEdit])

  const handleMediaDrop = React.useCallback((media: Parameters<typeof documentActions.handleMediaDrop>[0], positionMinutes: number) => {
    const result = routeGanttTimelineTransportCommand({
      adapter: args.commandAdapter,
      command: {
        kind: 'media-drop',
        media,
        positionMinutes,
        schema: GANTT_TIMELINE_TRANSPORT_COMMAND_SCHEMA,
        target: commandTarget,
      },
      markdownFallback: () => documentActions.handleMediaDrop(media, positionMinutes),
    })
    return result.status === 'handled' && (result.owner === 'external' || result.value)
  }, [args.commandAdapter, commandTarget, documentActions.handleMediaDrop])

  const handleCommittedDragUpdate = React.useCallback((input: Parameters<typeof documentActions.handleCommittedDragUpdate>[0]) => {
    routeGanttTimelineTransportCommand({
      adapter: args.commandAdapter,
      command: {
        displayLaneDelta: input.displayLaneDelta,
        effectiveDeltaMinutes: input.effectiveDeltaMinutes,
        kind: 'drag-edit',
        mode: input.dragState.mode,
        schema: GANTT_TIMELINE_TRANSPORT_COMMAND_SCHEMA,
        sourceEndMinutes: input.dragState.span.endMinutes,
        sourceStartMinutes: input.dragState.span.startMinutes,
        target: {
          ...commandTarget,
          selectedRowKey: input.dragState.span.rowKey || commandTarget.selectedRowKey,
        },
      },
      markdownFallback: () => documentActions.handleCommittedDragUpdate(input),
    })
  }, [args.commandAdapter, commandTarget, documentActions.handleCommittedDragUpdate])

  return {
    chromeModelCommands: {
      cancelEditedMediaExport: documentActions.cancelEditedMediaExport,
      autoSnappingEnabled: documentActions.autoSnappingEnabled,
      exportSessionCollection: documentActions.exportSessionCollection,
      exportingKind: documentActions.exportingKind,
      handleDownloadEditedMedia: documentActions.handleDownloadEditedMedia,
      handleRetryEditedMediaExport: documentActions.handleRetryEditedMediaExport,
      handleRetryEditedMediaExportRunId: documentActions.handleRetryEditedMediaExportRunId,
      handleToggleVideoSequenceTimingSyncMode: documentActions.handleToggleVideoSequenceTimingSyncMode,
      handleVideoSequenceClipEdit,
      handleVideoSequenceTool,
      latestRetryableExportSession: documentActions.latestRetryableExportSession,
      rippleEditingEnabled: documentActions.rippleEditingEnabled,
      timingSyncMode: documentActions.timingSyncMode,
    },
    handleCommittedDragUpdate,
    handleMediaDrop,
  }
}
