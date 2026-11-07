import React from 'react'
import { applyRichMediaTimelinePlaybackRate, isRichMediaTimelineRateSeekOnly } from '@/lib/render/richMediaTimelineSync'
import {
  TIMELINE_TRANSPORT_PLAYBACK_REQUEST_EVENT,
  resolveVideoSequenceTimelineMediaSeconds,
  resolveVideoSequenceTimelinePositionMinutes,
  type TimelineTransportPlaybackRequestDetail,
  type VideoSequenceTimelineSource,
} from './videoSequenceTimeline'
import { type VideoSequenceExportPlan, resolveTimelinePlanPositionFromSourceTime, resolveTimelinePlanSourceTimeAtPosition } from './timelinePlanSync'
import {
  resolveTimelineTransportPlaybackRate,
  type TimelineTransportPlaybackRate,
  type TimelineTransportSnapshotReader,
} from './timelineTransport'

const POSITION_EPSILON_MINUTES = 0.005
const TARGET_EPSILON_SECONDS = 0.25

const clean = (value: unknown): string => String(value || '').trim()

const markVideoPlaybackFallback = (video: HTMLMediaElement) => {
  video.setAttribute('data-kg-video-sequence-playback-fallback', 'seek')
}

const clearVideoPlaybackFallback = (video: HTMLMediaElement) => {
  video.removeAttribute('data-kg-video-sequence-playback-fallback')
}

const markVideoPlaybackGap = (video: HTMLMediaElement) => {
  if (!video.hasAttribute('data-kg-video-sequence-playback-gap-previous-opacity')) {
    video.setAttribute('data-kg-video-sequence-playback-gap-previous-opacity', video.style.opacity || '')
  }
  video.setAttribute('data-kg-video-sequence-playback-gap', 'empty')
  video.style.opacity = '0'
}

const clearVideoPlaybackGap = (video: HTMLMediaElement) => {
  const previousOpacity = video.getAttribute('data-kg-video-sequence-playback-gap-previous-opacity')
  video.removeAttribute('data-kg-video-sequence-playback-gap')
  video.removeAttribute('data-kg-video-sequence-playback-gap-previous-opacity')
  video.style.opacity = previousOpacity || ''
}

const enableVideoSequenceAudioPlayback = (video: HTMLMediaElement) => {
  video.muted = false
  video.defaultMuted = false
  if (video.volume <= 0) video.volume = 1
  video.setAttribute('data-kg-video-sequence-audio-playback', 'audible')
}

const isVideoPlaybackGap = (video: HTMLMediaElement): boolean => {
  return video.getAttribute('data-kg-video-sequence-playback-gap') === 'empty'
}

export function resolveTimelineVideoPreviewDurationSeconds(args: {
  nativeDurationSeconds: number
  readerDurationSeconds?: number
}): number {
  const readerDurationSeconds = Number(args.readerDurationSeconds)
  if (Number.isFinite(readerDurationSeconds) && readerDurationSeconds > 0) return readerDurationSeconds
  const nativeDurationSeconds = Number(args.nativeDurationSeconds)
  return Number.isFinite(nativeDurationSeconds) && nativeDurationSeconds > 0 ? nativeDurationSeconds : 0
}

export function resolveTimelineVideoPreviewTargetSeconds(args: {
  exportPlan: VideoSequenceExportPlan | null
  maxPosition: number
  positionMinutes: number
  source: VideoSequenceTimelineSource | null
  sourceDurationSeconds: number
}): number | null {
  if (!Number.isFinite(args.sourceDurationSeconds) || args.sourceDurationSeconds <= 0) return null
  const hasSourceBackedPlan = Boolean(args.source && args.exportPlan?.segments.length)
  const resolvedSourceTime = args.source
    ? resolveTimelinePlanSourceTimeAtPosition({
      plan: args.exportPlan,
      positionMinutes: args.positionMinutes,
      source: args.source,
      sourceDurationSeconds: args.sourceDurationSeconds,
    })
    : null
  if (resolvedSourceTime) return resolvedSourceTime.sourceTimeSeconds
  if (hasSourceBackedPlan) return null
  return resolveVideoSequenceTimelineMediaSeconds({
    durationSeconds: args.sourceDurationSeconds,
    maxMinutes: args.maxPosition,
    positionMinutes: args.positionMinutes,
  })
}

export function resolveTimelineVideoPreviewPositionMinutes(args: {
  currentTimeSeconds: number
  exportPlan: VideoSequenceExportPlan | null
  maxPosition: number
  preferredPositionMinutes: number
  source: VideoSequenceTimelineSource | null
  sourceDurationSeconds: number
}): number | null {
  if (!Number.isFinite(args.sourceDurationSeconds) || args.sourceDurationSeconds <= 0) return null
  const resolvedPosition = args.source
    ? resolveTimelinePlanPositionFromSourceTime({
      currentTimeSeconds: args.currentTimeSeconds,
      plan: args.exportPlan,
      preferredPositionMinutes: args.preferredPositionMinutes,
      source: args.source,
      sourceDurationSeconds: args.sourceDurationSeconds,
    })
    : null
  return resolvedPosition ?? resolveVideoSequenceTimelinePositionMinutes({
    currentTimeSeconds: args.currentTimeSeconds,
    durationSeconds: args.sourceDurationSeconds,
    maxMinutes: args.maxPosition,
  })
}

export function useTimelineVideoPreviewSyncController(args: {
  active: boolean
  documentKey: string
  exportPlan: VideoSequenceExportPlan | null
  maxPosition: number
  mediaKey: string
  playbackPosition: number
  playbackRate: TimelineTransportPlaybackRate
  playing: boolean
  readerDurationSeconds?: number
  readTransportSnapshot: TimelineTransportSnapshotReader
  readVideo: () => HTMLMediaElement | null
  setTransportPlaybackPosition: (nextPosition: number) => void
  setTransportPlaying: (nextPlaying: boolean) => void
  source?: VideoSequenceTimelineSource | null
}) {
  const playbackFallbackRef = React.useRef(false)

  React.useEffect(() => {
    playbackFallbackRef.current = false
  }, [args.documentKey, args.mediaKey])

  const resolveTargetSeconds = React.useCallback((video: HTMLMediaElement, nextPositionMinutes: number): number | null => {
    const sourceDurationSeconds = resolveTimelineVideoPreviewDurationSeconds({
      nativeDurationSeconds: video.duration,
      readerDurationSeconds: args.readerDurationSeconds,
    })
    return resolveTimelineVideoPreviewTargetSeconds({
      exportPlan: args.exportPlan,
      maxPosition: args.maxPosition,
      positionMinutes: nextPositionMinutes,
      source: args.source || null,
      sourceDurationSeconds,
    })
  }, [args.exportPlan, args.maxPosition, args.readerDurationSeconds, args.source])

  const applyVideoTime = React.useCallback((video: HTMLMediaElement, nextPositionMinutes: number): void => {
    const targetSeconds = resolveTargetSeconds(video, nextPositionMinutes)
    if (targetSeconds == null) {
      markVideoPlaybackGap(video)
      if (!video.paused) video.pause()
      return
    }
    clearVideoPlaybackGap(video)
    if (Math.abs((video.currentTime || 0) - targetSeconds) > TARGET_EPSILON_SECONDS) {
      video.currentTime = targetSeconds
    }
  }, [resolveTargetSeconds])

  const requestNativePlayback = React.useCallback((video: HTMLMediaElement): void => {
    if (!video.paused || playbackFallbackRef.current) return
    enableVideoSequenceAudioPlayback(video)
    const play = typeof video.play === 'function' ? video.play.bind(video) : null
    if (!play) {
      playbackFallbackRef.current = true
      markVideoPlaybackFallback(video)
      return
    }
    void play().catch(() => {
      playbackFallbackRef.current = true
      markVideoPlaybackFallback(video)
    })
  }, [])

  React.useEffect(() => {
    if (!args.active || typeof window === 'undefined') return
    let frameId = 0
    let cancelled = false
    let cleanupVideo: (() => void) | null = null
    const syncVideo = () => {
      if (cancelled) return
      const video = args.readVideo()
      if (!video) {
        frameId = window.requestAnimationFrame(syncVideo)
        return
      }
      if (cleanupVideo) return
      video.setAttribute('data-kg-video-sequence-media-sync', '1')
      const applyTransportPosition = () => {
        applyVideoTime(video, args.readTransportSnapshot().position)
      }
      const writeTransportPosition = () => {
        if (isVideoPlaybackGap(video) || isRichMediaTimelineRateSeekOnly(video)) return
        const current = args.readTransportSnapshot()
        const sourceDurationSeconds = resolveTimelineVideoPreviewDurationSeconds({
          nativeDurationSeconds: video.duration,
          readerDurationSeconds: args.readerDurationSeconds,
        })
        const nextPosition = resolveTimelineVideoPreviewPositionMinutes({
          currentTimeSeconds: video.currentTime || 0,
          exportPlan: args.exportPlan,
          maxPosition: args.maxPosition,
          preferredPositionMinutes: current.position,
          source: args.source || null,
          sourceDurationSeconds,
        })
        if (nextPosition == null) return
        if (
          current.documentKey !== args.documentKey ||
          Math.abs(current.position - nextPosition) > POSITION_EPSILON_MINUTES
        ) {
          args.setTransportPlaybackPosition(nextPosition)
        }
      }
      const writePlaying = () => {
        if (isVideoPlaybackGap(video) || isRichMediaTimelineRateSeekOnly(video)) return
        if (video.paused || video.ended) writeTransportPosition()
        args.setTransportPlaying(!video.paused && !video.ended)
      }
      video.addEventListener('loadedmetadata', applyTransportPosition)
      video.addEventListener('timeupdate', writeTransportPosition)
      video.addEventListener('seeking', writeTransportPosition)
      video.addEventListener('play', writePlaying)
      video.addEventListener('pause', writePlaying)
      video.addEventListener('ended', writePlaying)
      applyTransportPosition()
      cleanupVideo = () => {
        video.removeEventListener('loadedmetadata', applyTransportPosition)
        video.removeEventListener('timeupdate', writeTransportPosition)
        video.removeEventListener('seeking', writeTransportPosition)
        video.removeEventListener('play', writePlaying)
        video.removeEventListener('pause', writePlaying)
        video.removeEventListener('ended', writePlaying)
      }
    }
    syncVideo()
    return () => {
      cancelled = true
      if (frameId) window.cancelAnimationFrame(frameId)
      cleanupVideo?.()
    }
  }, [
    applyVideoTime,
    args.active,
    args.documentKey,
    args.exportPlan,
    args.maxPosition,
    args.readerDurationSeconds,
    args.readTransportSnapshot,
    args.readVideo,
    args.setTransportPlaybackPosition,
    args.setTransportPlaying,
    args.source,
  ])

  React.useEffect(() => {
    if (!args.active || typeof window === 'undefined') return
    const handlePlaybackRequest = (event: Event) => {
      const detail = (event as CustomEvent<TimelineTransportPlaybackRequestDetail>).detail
      if (!detail || clean(detail.documentKey) !== args.documentKey) return
      const video = args.readVideo()
      if (!video) return
      applyVideoTime(video, detail.position)
      const nextPlaybackRate = resolveTimelineTransportPlaybackRate(detail.playbackRate, args.playbackRate)
      const nativeRate = applyRichMediaTimelinePlaybackRate(video, nextPlaybackRate)
      if (detail.playing && nativeRate) {
        playbackFallbackRef.current = false
        clearVideoPlaybackFallback(video)
        enableVideoSequenceAudioPlayback(video)
        if (!isVideoPlaybackGap(video)) requestNativePlayback(video)
      } else if (!video.paused) {
        playbackFallbackRef.current = false
        clearVideoPlaybackFallback(video)
        video.pause()
      }
    }
    window.addEventListener(TIMELINE_TRANSPORT_PLAYBACK_REQUEST_EVENT, handlePlaybackRequest)
    return () => {
      window.removeEventListener(TIMELINE_TRANSPORT_PLAYBACK_REQUEST_EVENT, handlePlaybackRequest)
    }
  }, [applyVideoTime, args.active, args.documentKey, args.playbackRate, args.readVideo, requestNativePlayback])

  React.useEffect(() => {
    if (!args.active) return
    const video = args.readVideo()
    if (!video) return
    applyVideoTime(video, args.playbackPosition)
    const nativeRate = applyRichMediaTimelinePlaybackRate(video, args.playbackRate)
    if (args.playing && nativeRate) {
      enableVideoSequenceAudioPlayback(video)
      if (video.paused && !isVideoPlaybackGap(video)) requestNativePlayback(video)
    } else if (!video.paused) {
      playbackFallbackRef.current = false
      clearVideoPlaybackFallback(video)
      video.pause()
    }
  }, [
    applyVideoTime,
    args.active,
    args.playbackPosition,
    args.playbackRate,
    args.playing,
    args.readVideo,
    requestNativePlayback,
  ])
}
