import React from 'react'
import { getYouTubeId } from 'grph-shared/rich-media/providers'
import { buildVideoAgentSourcePlaybackUrl } from '@/features/video-agent/videoAgentSourcePlayback'
import { buildVideoAgentSourcePlaybackPanelSrcDoc } from '@/features/markdown-workspace/workspaceImport/videoAgentImportPanels'
import { buildMermaidGanttTimelineModel } from '@/lib/mermaid/mermaidGanttBarInteraction'
import {
  readYamlFrontmatterMermaidDiagramCodes,
  resolveMermaidDiagramCode,
} from '@/lib/mermaid/mermaidDiagramCode'
import {
  readVideoSequenceSourcePlayableUrl,
  readVideoSequenceTimelineModelFromMarkdown,
  type VideoSequenceTimelineSource,
} from './videoSequenceTimeline'
import { buildVideoSequenceExportPlan, type VideoSequenceExportPlan } from './videoSequenceExport'
import {
  buildTimelinePreviewSyncPlan,
  resolveTimelinePlanSourceUrl,
} from './timelinePlanSync'
import {
  readVideoSequenceSourceRevision,
  restoreVideoSequenceSourceFiles,
  subscribeVideoSequenceSources,
} from './videoSequenceSourceRegistry'

export type TimelinePreviewMediaSourceItem = {
  kind: 'image' | 'video' | 'audio' | 'iframe'
  key: string
  label: string
  openUrl: string
  source: VideoSequenceTimelineSource
  src: string
  srcDoc?: string
}

export type TimelinePreviewMediaSession = {
  exportPlan: VideoSequenceExportPlan | null
  items: TimelinePreviewMediaSourceItem[]
  previewPlan: VideoSequenceExportPlan | null
  sequenceMaxMinutes: number
}

const clean = (value: unknown): string => String(value || '').trim()
const EMPTY_SOURCES: readonly VideoSequenceTimelineSource[] = []

export function useTimelinePreviewSourceRecovery(sources?: readonly VideoSequenceTimelineSource[]): number {
  const sourceRevision = React.useSyncExternalStore(subscribeVideoSequenceSources, readVideoSequenceSourceRevision, readVideoSequenceSourceRevision)
  React.useEffect(() => {
    if (!sources?.length) return
    void restoreVideoSequenceSourceFiles(sources).catch(error => {
      console.warn('Local video source could not be restored for the preview.', error)
    })
  }, [sources])
  return sourceRevision
}

const readTimelinePreviewMediaSourceLabel = (source: VideoSequenceTimelineSource): string => {
  return clean(source.originalName)
    || clean(source.relativePath).split('/').filter(Boolean).pop()
    || clean(source.sourceUrl)
    || 'Media source'
}

const readTimelinePreviewMediaSourceKind = (source: VideoSequenceTimelineSource): TimelinePreviewMediaSourceItem['kind'] => {
  const signature = [
    source.mimeHint,
    source.originalName,
    source.relativePath,
    source.sourceUrl,
  ].join(' ').toLowerCase()
  if (/\b(?:audio|mpeg|mp3|wav|aac|m4a|opus|ogg)\b|\.m(?:p3|4a)\b|\.(?:wav|aac|opus|ogg)\b/.test(signature)) return 'audio'
  if (/\bimage\b|\.avif\b|\.gif\b|\.jpe?g\b|\.png\b|\.svg\b|\.webp\b/.test(signature)) return 'image'
  return 'video'
}

export function useTimelinePreviewMediaSession(args: {
  markdownDocumentName: string
  markdownText: string
  selectedRowKey?: string | null
}): TimelinePreviewMediaSession {
  const videoSequenceModel = React.useMemo(
    () => readVideoSequenceTimelineModelFromMarkdown(args.markdownText),
    [args.markdownText],
  )
  const sources = videoSequenceModel?.sources || EMPTY_SOURCES
  const sourceRevision = useTimelinePreviewSourceRecovery(sources)
  return React.useMemo(() => {
    const code = resolveMermaidDiagramCode(
      readYamlFrontmatterMermaidDiagramCodes(args.markdownText, 'gantt'),
      'gantt',
    )
    if (!code) {
      return {
        exportPlan: null,
        items: [],
        previewPlan: null,
        sequenceMaxMinutes: 0,
      }
    }
    const exportPlan = buildVideoSequenceExportPlan({
      code,
      filenameHint: args.markdownDocumentName,
      sources,
    })
    const previewPlan = buildTimelinePreviewSyncPlan({
      code,
      filenameHint: args.markdownDocumentName,
      selectedRowKey: args.selectedRowKey,
      sources,
    })
    const items = sources.flatMap((source): TimelinePreviewMediaSourceItem[] => {
      const src = resolveTimelinePlanSourceUrl(source)
      if (!src) return []
      const kind = readTimelinePreviewMediaSourceKind(source)
      const youtube = kind === 'video' && !!getYouTubeId(src)
      const openUrl = readVideoSequenceSourcePlayableUrl(source) || src
      return [{
        key: `video-sequence:${src}`,
        kind: youtube ? 'iframe' : kind,
        label: readTimelinePreviewMediaSourceLabel(source),
        openUrl,
        source,
        src,
        srcDoc: youtube ? buildVideoAgentSourcePlaybackPanelSrcDoc({
          sourcePlaybackUrl: buildVideoAgentSourcePlaybackUrl(src),
          sourceUrl: openUrl,
        }) : undefined,
      }]
    })
    return {
      exportPlan,
      items,
      previewPlan,
      sequenceMaxMinutes: Math.max(0, buildMermaidGanttTimelineModel(code).durationMinutes || 0),
    }
  }, [args.markdownDocumentName, args.markdownText, args.selectedRowKey, sourceRevision, sources])
}
