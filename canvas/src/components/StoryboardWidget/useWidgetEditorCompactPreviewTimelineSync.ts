import React from 'react'
import type { GraphData } from '@/lib/graph/types'
import { cleanTimelinePreviewDocumentKey } from '@/components/timeline/useTimelinePreviewBootstrap'
import {
  TIMELINE_TRANSPORT_PLAYBACK_REQUEST_EVENT,
  type TimelineTransportPlaybackRequestDetail,
} from '@/components/timeline/videoSequenceTimeline'
import {
  resolveRichMediaTimelineDurationUnits,
  resolveRichMediaTimelineMediaTargetSeconds,
  applyRichMediaTimelinePlaybackRate,
} from '@/lib/render/richMediaTimelineSync'

export function useWidgetEditorCompactPreviewTimelineSync(args: {
  compactPreviewKind: string
  compactPreviewMediaUrl: string
  compactPreviewMediaElementRef: React.RefObject<HTMLMediaElement | null>
  compactPreviewMediaElement: HTMLMediaElement | null
  timelineTransportDocumentKey: string
  timelineTransportPosition: number
  timelineTransportPlaying: boolean
  timelineTransportPlaybackRate: number
  markdownDocumentName: string
  graphData: GraphData | null | undefined
  graphDataRevision: number
}): {
  timelineDocumentKey: string
  compactPreviewIsPlayableMedia: boolean
} {
  const {
    compactPreviewKind,
    compactPreviewMediaUrl,
    compactPreviewMediaElementRef,
    compactPreviewMediaElement,
    timelineTransportDocumentKey,
    timelineTransportPosition,
    timelineTransportPlaying,
    timelineTransportPlaybackRate,
    markdownDocumentName,
    graphData,
    graphDataRevision,
  } = args

  const timelineDocumentKey = React.useMemo(
    () => cleanTimelinePreviewDocumentKey(markdownDocumentName),
    [markdownDocumentName],
  )
  const timelineDurationUnits = React.useMemo(
    () => resolveRichMediaTimelineDurationUnits(graphData),
    [graphData, graphDataRevision],
  )
  const compactPreviewIsPlayableMedia = compactPreviewKind === 'video' || compactPreviewKind === 'audio'

  const syncCompactPreviewMediaToTimeline = React.useCallback((
    media: HTMLMediaElement,
    override?: Partial<TimelineTransportPlaybackRequestDetail>,
  ) => {
    if (!compactPreviewIsPlayableMedia) return
    const documentKey = cleanTimelinePreviewDocumentKey(override?.documentKey || timelineTransportDocumentKey)
    if (!timelineDocumentKey || documentKey !== timelineDocumentKey) return
    const positionSource = typeof override?.position === 'number' ? override.position : timelineTransportPosition
    const playing = typeof override?.playing === 'boolean' ? override.playing : timelineTransportPlaying
    const playbackRateSource = typeof override?.playbackRate === 'number' ? override.playbackRate : timelineTransportPlaybackRate
    const playbackRate = Number.isFinite(playbackRateSource) && playbackRateSource > 0 ? playbackRateSource : 1
    const mediaDuration = Number.isFinite(media.duration) && media.duration > 0 ? media.duration : 0
    const targetSecondsRaw = resolveRichMediaTimelineMediaTargetSeconds({
      mediaDurationSeconds: mediaDuration,
      positionUnits: Number.isFinite(positionSource) ? Math.max(0, positionSource) : 0,
      timelineDurationUnits,
    })
    const targetSeconds = mediaDuration > 0 ? Math.min(mediaDuration, targetSecondsRaw) : targetSecondsRaw
    const currentTime = Number.isFinite(media.currentTime) ? media.currentTime : 0
    if (!playing || Math.abs(currentTime - targetSeconds) > 0.18) {
      try {
        media.currentTime = targetSeconds
      } catch {
        void 0
      }
    }
    const nativeRate = applyRichMediaTimelinePlaybackRate(media, playbackRate)
    if (playing && nativeRate) {
      if (media.paused) {
        try {
          const maybePromise = media.play()
          if (maybePromise && typeof maybePromise.catch === 'function') maybePromise.catch(() => undefined)
        } catch {
          void 0
        }
      }
      return
    }
    if (!media.paused) {
      try {
        media.pause()
      } catch {
        void 0
      }
    }
  }, [
    compactPreviewIsPlayableMedia,
    timelineDocumentKey,
    timelineDurationUnits,
    timelineTransportDocumentKey,
    timelineTransportPlaybackRate,
    timelineTransportPlaying,
    timelineTransportPosition,
  ])

  React.useEffect(() => {
    if (!compactPreviewIsPlayableMedia) return
    const media = compactPreviewMediaElement || compactPreviewMediaElementRef.current
    if (!media) return
    const syncCompactPreviewMedia = () => syncCompactPreviewMediaToTimeline(media)
    syncCompactPreviewMedia()
    media.addEventListener('loadedmetadata', syncCompactPreviewMedia)
    media.addEventListener('durationchange', syncCompactPreviewMedia)
    return () => {
      media.removeEventListener('loadedmetadata', syncCompactPreviewMedia)
      media.removeEventListener('durationchange', syncCompactPreviewMedia)
    }
  }, [
    compactPreviewIsPlayableMedia,
    compactPreviewMediaElement,
    compactPreviewMediaUrl,
    syncCompactPreviewMediaToTimeline,
  ])

  React.useEffect(() => {
    if (typeof window === 'undefined') return
    const handlePlaybackRequest = (event: Event) => {
      const detail = (event as CustomEvent<TimelineTransportPlaybackRequestDetail>).detail
      if (!detail || cleanTimelinePreviewDocumentKey(detail.documentKey) !== timelineDocumentKey) return
      const media = compactPreviewMediaElementRef.current
      if (media) syncCompactPreviewMediaToTimeline(media, detail)
    }
    window.addEventListener(TIMELINE_TRANSPORT_PLAYBACK_REQUEST_EVENT, handlePlaybackRequest)
    return () => window.removeEventListener(TIMELINE_TRANSPORT_PLAYBACK_REQUEST_EVENT, handlePlaybackRequest)
  }, [compactPreviewMediaElementRef, syncCompactPreviewMediaToTimeline, timelineDocumentKey])

  return {
    timelineDocumentKey,
    compactPreviewIsPlayableMedia,
  }
}
