import { useGraphStore } from '@/hooks/useGraphStore'
import { TIMELINE_TRANSPORT_PLAYBACK_RATES, type TimelineTransportPlaybackRate } from '@/components/timeline/timelineTransport'
import { readXrMotionReferenceRuntime, setXrMotionReferencePlayhead } from './xrMotionReferenceRuntime'
import { xrMotionReferenceTimelineDocumentKey } from './xrMotionReferenceTimeline'
import { requestXrMotionReferenceCameraPlaybackReapply } from './xrCameraPlaybackControlsRuntime'

export type XrAnimationFrameTarget = number | 'next' | 'previous'

export function parseXrAnimationFrameTarget(value: string): XrAnimationFrameTarget | null {
  if (value === 'next' || value === 'previous') return value
  if (!/^\d+$/.test(value)) return null
  const frame = Number(value)
  return Number.isSafeInteger(frame) ? frame : null
}

export function readXrAnimationTransport() {
  const state = useGraphStore.getState()
  const motion = readXrMotionReferenceRuntime()
  const documentKey = xrMotionReferenceTimelineDocumentKey(state.markdownDocumentName)
  const active = state.timelineTransportDocumentKey === documentKey
  const timeSeconds = Math.min(motion.plan.durationSeconds, Math.max(0,
    active ? state.timelineTransportPosition * 60 : motion.playheadSeconds))
  return {
    documentKey,
    playing: active && state.timelineTransportPlaying,
    playbackRate: active ? state.timelineTransportPlaybackRate : 1,
    playbackRates: TIMELINE_TRANSPORT_PLAYBACK_RATES,
    timeSeconds,
    frame: Math.floor(timeSeconds * motion.plan.fps + 1e-7),
    fps: motion.plan.fps,
  }
}

/** Projects commands into the existing BottomPanel clock; never advances game or physics ticks. */
export function updateXrAnimationTransport(control: {
  operation: 'play' | 'pause' | 'scrub'
  timeSeconds: number
  frame?: XrAnimationFrameTarget
  playbackRate?: TimelineTransportPlaybackRate
}): void {
  const state = useGraphStore.getState()
  const transport = readXrAnimationTransport()
  if (control.operation === 'scrub') {
    const frame = control.frame === 'next' ? transport.frame + 1
      : control.frame === 'previous' ? transport.frame - 1 : control.frame
    const seconds = frame === undefined ? control.timeSeconds : frame / transport.fps
    const bounded = Math.min(readXrMotionReferenceRuntime().plan.durationSeconds, Math.max(0, seconds))
    state.setTimelineTransportState({ documentKey: transport.documentKey, position: bounded / 60,
      ...(frame !== undefined ? { playing: false } : {}) })
    setXrMotionReferencePlayhead(bounded)
    requestXrMotionReferenceCameraPlaybackReapply()
    return
  }
  state.setTimelineTransportState({ documentKey: transport.documentKey, playing: control.operation === 'play',
    ...(control.playbackRate !== undefined ? { playbackRate: control.playbackRate } : {}) })
  if (control.operation === 'play') requestXrMotionReferenceCameraPlaybackReapply()
}
