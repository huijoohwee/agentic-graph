import React from 'react'
import type { TimelineMediaReaderSummary } from '@/components/timeline/timelineMediaReader'
import { type TimelineTransportPlaybackRate } from '@/components/timeline/timelineTransport'

export type GanttTimelineTransportShellModel = {
  ariaLabel: string
  chromeClassName: string
  currentLabel: string
  disabled: boolean
  hasMediaDurationScale: boolean
  max: number
  mediaDurationSeconds: number
  min: number
  playbackRate: TimelineTransportPlaybackRate
  playing: boolean
  rootProps: React.HTMLAttributes<HTMLElement>
  shellClassName: string
  showInlineProgress: boolean
  showRange: boolean
  step: number
  onTogglePlayback: () => void
  onValueChange: (value: number) => void
  onPlaybackRateChange: (rate: TimelineTransportPlaybackRate) => void
}

export function useGanttTimelineTransportShellModel(args: {
  currentLabel: string
  disabled: boolean
  hasMediaDurationScale: boolean
  maxMinutes: number
  mediaDurationSeconds: number
  mediaReaderSummary: TimelineMediaReaderSummary
  playbackRate: TimelineTransportPlaybackRate
  playing: boolean
  timelineMode: 'empty' | 'source-backed' | 'workflow'
  onTogglePlayback: () => void
  onValueChange: (value: number) => void
  onPlaybackRateChange: (rate: TimelineTransportPlaybackRate) => void
}): GanttTimelineTransportShellModel {
  return React.useMemo(() => ({
    ariaLabel: 'Scrub Gantt-timeline position',
    chromeClassName: 'timeline-transport-chrome--mermaid-gantt p-2',
    currentLabel: args.currentLabel,
    disabled: args.disabled,
    hasMediaDurationScale: args.hasMediaDurationScale,
    max: Math.max(1, args.maxMinutes),
    mediaDurationSeconds: args.mediaDurationSeconds,
    min: 0,
    onPlaybackRateChange: args.onPlaybackRateChange,
    onTogglePlayback: args.onTogglePlayback,
    onValueChange: args.onValueChange,
    playbackRate: args.playbackRate,
    playing: args.playing,
    rootProps: {
      'aria-label': 'Gantt-Timeline transport',
      'data-kg-gantt-timeline-transport': 'bottomPanel',
      'data-kg-video-sequence-media-duration': args.mediaDurationSeconds > 0 ? args.mediaDurationSeconds : undefined,
      'data-kg-video-sequence-media-duration-scale': args.hasMediaDurationScale ? '1' : undefined,
      'data-kg-video-sequence-media-reader': args.mediaReaderSummary.status,
      'data-kg-video-sequence-media-reader-byte-size': args.mediaReaderSummary.byteSize > 0 ? args.mediaReaderSummary.byteSize : undefined,
      'data-kg-video-sequence-media-reader-bytes-read': args.mediaReaderSummary.bytesRead > 0 ? args.mediaReaderSummary.bytesRead : undefined,
      'data-kg-video-sequence-media-reader-format': args.mediaReaderSummary.formatName || undefined,
      'data-kg-video-sequence-media-reader-mime-type': args.mediaReaderSummary.mimeType || undefined,
      'data-kg-video-sequence-media-reader-primary-audio-codec': args.mediaReaderSummary.primaryAudioCodec || undefined,
      'data-kg-video-sequence-media-reader-primary-video-codec': args.mediaReaderSummary.primaryVideoCodec || undefined,
      'data-kg-video-sequence-media-reader-read-ratio': args.mediaReaderSummary.metadataReadRatio > 0 ? args.mediaReaderSummary.metadataReadRatio : undefined,
      'data-kg-video-sequence-timeline': args.timelineMode,
    } as React.HTMLAttributes<HTMLElement>,
    shellClassName: 'timeline-transport-shell--video-sequence',
    showInlineProgress: true,
    showRange: false,
    step: 1,
  }), [
    args.currentLabel,
    args.disabled,
    args.hasMediaDurationScale,
    args.maxMinutes,
    args.mediaDurationSeconds,
    args.mediaReaderSummary,
    args.onPlaybackRateChange,
    args.onTogglePlayback,
    args.onValueChange,
    args.playbackRate,
    args.playing,
    args.timelineMode,
  ])
}
