import React from 'react'
import { buildMarkdownVariablePreviewByKey } from '@/lib/markdown-core/ui/markdownInlineVariableMediaPreview'
import { resolveMarkdownVariableText } from '@/features/markdown/ui/markdownVariableChoices'
import { resolveXrRehearsalTimelineBeatAt } from './xrRehearsalTimelineBeats'
import { useGraphStore } from '@/hooks/useGraphStore'
import { readXrAnimationTransport } from './xrAnimationTransportRuntime'
import { readXrMotionReferenceRuntime, subscribeXrMotionReferenceRuntime } from './xrMotionReferenceRuntime'

/** Floating views project the BottomPanel clock; game and camera runtimes keep their own lifecycle. */
export function XrRehearsalStatus() {
  const runtime = React.useSyncExternalStore(subscribeXrMotionReferenceRuntime, readXrMotionReferenceRuntime, readXrMotionReferenceRuntime)
  useGraphStore(state => state.timelineTransportDocumentKey)
  useGraphStore(state => state.timelineTransportPosition)
  useGraphStore(state => state.timelineTransportPlaying)
  useGraphStore(state => state.timelineTransportPlaybackRate)
  useGraphStore(state => state.markdownDocumentName)
  const source = useGraphStore(state => state.markdownDocumentText)
  const variables = React.useMemo(() => buildMarkdownVariablePreviewByKey(source || ''), [source])
  const transport = readXrAnimationTransport()
  const beat = resolveXrRehearsalTimelineBeatAt(runtime.plan, transport.timeSeconds)
  return <output aria-label="Shared Timeline rehearsal" aria-live="off" className="block py-1 text-[10px] tabular-nums opacity-70">
    Timeline · Frame {transport.frame} · {transport.fps} fps · {transport.playbackRate}× · {transport.playing ? 'Playing' : 'Paused'}
    {beat?.caption ? <span className="mt-1 block text-xs leading-relaxed" data-kg-xr-story-caption={beat.markId}><strong>{beat.label}</strong> · {resolveMarkdownVariableText(beat.caption, variables)}</span> : null}
  </output>
}
