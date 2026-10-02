import React from 'react'
import {
  buildVideoSequenceExportPlan,
  buildTimelinePreviewSyncPlan,
  buildTimelinePreviewThumbnailPlan,
  resolveVideoSequenceExportPlanError,
  type VideoSequenceExportPlan,
} from '@/components/timeline/videoSequenceExport'
import { useTimelinePreviewMonitorBinding } from '@/components/timeline/useTimelinePreviewMonitorBinding'
import { useTimelinePreviewSourceRecovery } from '@/components/timeline/useTimelinePreviewMediaSession'
import { readVideoSequenceTimelineModelFromMarkdown } from '@/components/timeline/videoSequenceTimeline'
import { type MermaidGanttTimelineTaskSpan } from '@/lib/mermaid/mermaidGanttBarInteraction'

export type GanttTimelineTransportPreviewSession = {
  exportPlan: VideoSequenceExportPlan | null
  exportPlanError: string
  monitorScopes: ReturnType<typeof useTimelinePreviewMonitorBinding>['monitorScopes']
  previewPlan: VideoSequenceExportPlan | null
  thumbnailPlan: VideoSequenceExportPlan | null
}

export function useGanttTimelineTransportPreviewSession(args: {
  code: string
  markdownDocumentName: string
  markdownText: string
  maxMinutes: number
  positionMinutes: number
  selectedRowKey?: string | null
  taskSpans: readonly MermaidGanttTimelineTaskSpan[]
}): GanttTimelineTransportPreviewSession {
  const videoSequenceModel = React.useMemo(
    () => readVideoSequenceTimelineModelFromMarkdown(args.markdownText),
    [args.markdownText],
  )
  const sourceRevision = useTimelinePreviewSourceRecovery(videoSequenceModel?.sources)
  const previewMonitorBinding = useTimelinePreviewMonitorBinding({
    markdownDocumentName: args.markdownDocumentName,
    markdownText: args.markdownText,
    maxMinutes: args.maxMinutes,
    positionMinutes: args.positionMinutes,
    selectedRowKey: args.selectedRowKey,
    sourceCount: videoSequenceModel?.sources.length || 0,
    spanCount: args.taskSpans.length,
  })
  const exportPlan = React.useMemo(
    () => buildVideoSequenceExportPlan({
      code: args.code,
      filenameHint: args.markdownDocumentName,
      sources: videoSequenceModel?.sources || [],
    }),
    [args.code, args.markdownDocumentName, sourceRevision, videoSequenceModel?.sources],
  )
  const previewPlan = React.useMemo(
    () => buildTimelinePreviewSyncPlan({
      code: args.code,
      filenameHint: args.markdownDocumentName,
      selectedRowKey: args.selectedRowKey,
      sources: videoSequenceModel?.sources || [],
    }),
    [args.code, args.markdownDocumentName, args.selectedRowKey, sourceRevision, videoSequenceModel?.sources],
  )
  const thumbnailPlan = React.useMemo(
    () => buildTimelinePreviewThumbnailPlan({
      code: args.code,
      filenameHint: args.markdownDocumentName,
      sources: videoSequenceModel?.sources || [],
    }),
    [args.code, args.markdownDocumentName, sourceRevision, videoSequenceModel?.sources],
  )
  const exportPlanError = React.useMemo(() => resolveVideoSequenceExportPlanError(exportPlan), [exportPlan])

  return React.useMemo(() => ({
    exportPlan,
    exportPlanError,
    monitorScopes: previewMonitorBinding.monitorScopes,
    previewPlan,
    thumbnailPlan,
  }), [
    exportPlan,
    exportPlanError,
    previewMonitorBinding.monitorScopes,
    previewPlan,
    thumbnailPlan,
  ])
}
