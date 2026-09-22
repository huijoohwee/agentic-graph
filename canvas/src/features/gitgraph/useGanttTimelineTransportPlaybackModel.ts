import React from 'react'
import { useTimelineTransportPlayback } from '@/components/timeline/timelineTransport'
import {
  buildRichMediaTimelineTransportFrame,
  publishRichMediaTimelineTransportFrame,
  publishRichMediaTimelineClockStart,
} from '@/lib/render/richMediaTimelineSync'
import {
  resolveGanttTimelineTransportRenderTimeMs,
  useGanttTimelinePlaybackControls,
} from './useGanttTimelinePlaybackControls'

export type GanttTimelineTransportPlaybackModel = {
  handleTogglePlayback: () => void
}

export function useGanttTimelineTransportPlaybackModel(args: {
  clockActive?: boolean
  disabled: boolean
  documentKey: string
  maxMinutes: number
  playbackRate: number
  playbackUnitsPerMs: number
  playing: boolean
  positionMinutes: number
  publishPlaybackRequest?: boolean
  setTransportPlaying: (nextPlaying: boolean) => void
  onPositionChange: (position: number) => void
}): GanttTimelineTransportPlaybackModel {
  const playbackControls = useGanttTimelinePlaybackControls({
    documentKey: args.documentKey,
    maxMinutes: args.maxMinutes,
    playbackRate: args.playbackRate,
    playbackUnitsPerMs: args.playbackUnitsPerMs,
    playing: args.playing,
    positionMinutes: args.positionMinutes,
    publishPlaybackRequest: args.publishPlaybackRequest,
    setTransportPlaybackPosition: args.onPositionChange,
    setTransportPlaying: args.setTransportPlaying,
  })
  const publishTimelineTransportFrame = React.useCallback((positionMinutes: number, playing: boolean, startupSignal?: AbortSignal) => {
    if (args.disabled) return
    const payload = buildRichMediaTimelineTransportFrame({
      localDocumentKey: args.documentKey,
      transportDocumentKey: args.documentKey,
      transportPlaybackRate: args.playbackRate,
      transportPlaying: playing,
      transportPosition: positionMinutes,
      override: {
        sourcePlayback: false,
        timeMs: resolveGanttTimelineTransportRenderTimeMs({
          playbackUnitsPerMs: args.playbackUnitsPerMs,
          positionMinutes,
        }),
      },
    })
    if (payload) {
      if (startupSignal) return publishRichMediaTimelineClockStart(payload, startupSignal)
      publishRichMediaTimelineTransportFrame(payload)
    }
  }, [args.disabled, args.documentKey, args.playbackRate, args.playbackUnitsPerMs])

  useTimelineTransportPlayback({
    active: args.clockActive !== false && !args.disabled,
    documentKey: args.documentKey,
    max: args.maxMinutes,
    onPlaybackStart: (position, signal) => publishTimelineTransportFrame(position, true, signal),
    onPlaybackFrame: position => publishTimelineTransportFrame(position, true),
    onPlaybackEnd: playbackControls.handlePlaybackEnd,
    onPositionChange: args.onPositionChange,
    playbackRate: args.playbackRate,
    playing: args.playing,
    position: args.positionMinutes,
    unitsPerMs: args.playbackUnitsPerMs,
  })

  React.useEffect(() => {
    publishTimelineTransportFrame(args.positionMinutes, args.playing)
  }, [args.playing, args.positionMinutes, publishTimelineTransportFrame])

  return {
    handleTogglePlayback: playbackControls.handleTogglePlayback,
  }
}
