import React from 'react'
import { useGraphStore } from '@/hooks/useGraphStore'
import { readXrAnimationTransport } from './xrAnimationTransportRuntime'
import { readXrMotionReferenceRuntime, subscribeXrMotionReferenceRuntime } from './xrMotionReferenceRuntime'

/** Floating views project the BottomPanel clock; game and camera runtimes keep their own lifecycle. */
export function XrRehearsalStatus() {
  React.useSyncExternalStore(subscribeXrMotionReferenceRuntime, readXrMotionReferenceRuntime, readXrMotionReferenceRuntime)
  useGraphStore(state => state.timelineTransportDocumentKey)
  useGraphStore(state => state.timelineTransportPosition)
  useGraphStore(state => state.timelineTransportPlaying)
  useGraphStore(state => state.timelineTransportPlaybackRate)
  useGraphStore(state => state.markdownDocumentName)
  const transport = readXrAnimationTransport()
  return <output aria-label="Shared Timeline rehearsal" aria-live="off" className="block py-1 text-[10px] tabular-nums opacity-70">
    Timeline · Frame {transport.frame} · {transport.fps} fps · {transport.playbackRate}× · {transport.playing ? 'Playing' : 'Paused'}
  </output>
}
