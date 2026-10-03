import React from 'react'
import { getYouTubeId } from 'grph-shared/rich-media/providers'
import { buildVideoAgentSourcePlaybackUrl } from '@/features/video-agent/videoAgentSourcePlayback'
import { buildVideoAgentSourcePlaybackPanelSrcDoc } from '@/features/markdown-workspace/workspaceImport/videoAgentImportPanels'
import { type VideoSequenceExportPlan } from '@/components/timeline/timelinePlanSync'
import {
  type TimelineTransportPlaybackRate,
  type TimelineTransportSnapshotReader,
} from '@/components/timeline/timelineTransport'
import { useTimelineVideoPreviewSyncController } from '@/components/timeline/timelinePreviewSync'
import { type VideoSequenceTimelineSource } from '@/components/timeline/videoSequenceTimeline'
import { CardMediaPreview } from '@/lib/cards/CardMediaPreview'
import { type CardMediaKind } from '@/lib/cards/cardMediaPreviewUtils'

const RichMediaPanelLazy = React.lazy(() => import('@/components/RichMediaPanel'))

export const readTimelineTransportMediaPreviewKind = (source: VideoSequenceTimelineSource | null, fallbackUrl: string): CardMediaKind => {
  const signature = [
    source?.mimeHint,
    source?.originalName,
    source?.relativePath,
    source?.sourceUrl,
    fallbackUrl,
  ].join(' ').toLowerCase()
  if (/\bimage\b|\.avif\b|\.gif\b|\.jpe?g\b|\.png\b|\.svg\b|\.webp\b/.test(signature)) return 'image'
  if (/\baudio\b|\.aac\b|\.aiff?\b|\.flac\b|\.m4a\b|\.mp3\b|\.oga\b|\.ogg\b|\.opus\b|\.wav\b/.test(signature)) return 'audio'
  return getYouTubeId(fallbackUrl) ? 'iframe' : 'video'
}

export type GanttTimelineTransportMediaPlayerModel = {
  active: boolean
  documentKey: string
  exportPlan: VideoSequenceExportPlan | null
  kind: CardMediaKind
  maxMinutes: number
  playbackRate: TimelineTransportPlaybackRate
  playing: boolean
  positionMinutes: number
  readerDurationSeconds: number
  setTransportPlaybackPosition: (nextPosition: number) => void
  setTransportPlaying: (nextPlaying: boolean) => void
  source: VideoSequenceTimelineSource | null
  title: string
  url: string
}

export function GanttTimelineTransportMediaPlayer(args: {
  model: GanttTimelineTransportMediaPlayerModel
}) {
  const videoRef = React.useRef<HTMLMediaElement | null>(null)
  const sourcePlaybackSrcDoc = React.useMemo(() => args.model.kind === 'iframe'
    ? buildVideoAgentSourcePlaybackPanelSrcDoc({ sourcePlaybackUrl: buildVideoAgentSourcePlaybackUrl(args.model.url), sourceUrl: args.model.url })
    : '', [args.model.kind, args.model.url])
  const snapshotRef = React.useRef({
    documentKey: args.model.documentKey,
    position: args.model.positionMinutes,
  })

  React.useEffect(() => {
    snapshotRef.current = {
      documentKey: args.model.documentKey,
      position: args.model.positionMinutes,
    }
  }, [args.model.documentKey, args.model.positionMinutes])

  const readVideo = React.useCallback(() => videoRef.current, [])
  const readTransportSnapshot = React.useCallback<TimelineTransportSnapshotReader>(() => snapshotRef.current, [])

  useTimelineVideoPreviewSyncController({
    active: args.model.active && args.model.kind === 'video',
    documentKey: args.model.documentKey,
    exportPlan: args.model.exportPlan,
    maxPosition: args.model.maxMinutes,
    mediaKey: args.model.url,
    playbackPosition: args.model.positionMinutes,
    playbackRate: args.model.playbackRate,
    playing: args.model.playing,
    readerDurationSeconds: args.model.readerDurationSeconds,
    readTransportSnapshot,
    readVideo,
    setTransportPlaybackPosition: args.model.setTransportPlaybackPosition,
    setTransportPlaying: args.model.setTransportPlaying,
    source: args.model.source,
  })

  if (!args.model.active || !args.model.url) return null

  return (
    <section
      className="timeline-transport-media-player"
      aria-label="Timeline media player"
      data-kg-video-sequence-media-player="1"
      data-kg-video-sequence-media-player-kind={args.model.kind}
    >
      <section className="timeline-transport-media-player-frame">
        {sourcePlaybackSrcDoc ? <React.Suspense fallback={null}><RichMediaPanelLazy
          kind="iframe" title={args.model.title} url={args.model.url} openUrl={args.model.url}
          srcDoc={sourcePlaybackSrcDoc} sourcePlayback interactive
          frameMode="surface" placementOwner="parent" panelChrome="none" scrollOwner="media"
          style={{ width: '100%', height: '100%' }}
        /></React.Suspense> : <CardMediaPreview
          kind={args.model.kind}
          url={args.model.url}
          title={args.model.title}
          fit="contain"
          interactive={args.model.kind !== 'video'}
          videoControls={false}
          videoAutoPlay={false}
          videoLoop={false}
          mediaClassName="timeline-transport-media-player-media"
          mediaThumbnailDataAttr={true}
          onVideoElement={element => {
            videoRef.current = element
          }}
          onMediaElement={element => {
            if (element instanceof HTMLMediaElement) videoRef.current = element
          }}
        />}
      </section>
    </section>
  )
}
