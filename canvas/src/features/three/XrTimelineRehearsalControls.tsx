import React from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useGraphStore } from '@/hooks/useGraphStore'
import { controlLocalAnimation } from './xrAnimationMcpRuntime'
import { readXrAnimationTransport } from './xrAnimationTransportRuntime'

/** Timeline projects the existing command owner; it owns no clock or gameplay state. */
export function XrTimelineRehearsalControls({ durationSeconds, fps, disabled = false }: {
  durationSeconds: number
  fps: number
  disabled?: boolean
}) {
  useGraphStore(state => state.timelineTransportDocumentKey)
  useGraphStore(state => state.timelineTransportPosition)
  const transport = readXrAnimationTransport()
  const step = (direction: 'previous' | 'next') => {
    const result = controlLocalAnimation({ invocation: `/animation.control @canvas operation=scrub frame=${direction}` })
    if (!result.ok) useGraphStore.getState().pushUiToast({
      id: 'xr:frame-step:error', kind: 'error', message: result.message,
    })
  }
  return (
    <section className="timeline-transport-mini-action-bar" aria-label="XR frame rehearsal">
      <button type="button" className="timeline-transport-mini-action" aria-label="Previous XR animation frame"
        disabled={disabled || transport.timeSeconds <= 0} onClick={() => step('previous')}>
        <ChevronLeft className="size-4" role="img" aria-label="Previous frame" />
      </button>
      <output className="whitespace-nowrap text-xs tabular-nums" aria-label="XR animation frame">
        Frame {transport.frame} · {fps} fps
      </output>
      <button type="button" className="timeline-transport-mini-action" aria-label="Next XR animation frame"
        disabled={disabled || transport.timeSeconds >= durationSeconds} onClick={() => step('next')}>
        <ChevronRight className="size-4" role="img" aria-label="Next frame" />
      </button>
    </section>
  )
}
