import React from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useGraphStore } from '@/hooks/useGraphStore'
import { controlLocalAnimation } from './xrAnimationMcpRuntime'
import { readXrAnimationTransport } from './xrAnimationTransportRuntime'

const XrTimelineSceneOverview = React.lazy(() => import('./XrTimelineSceneOverview').then(module => ({ default: module.XrTimelineSceneOverview })))

/** Timeline projects the existing command owner; it owns no clock or gameplay state. */
export function XrTimelineRehearsalControls({ durationSeconds, fps, disabled = false }: {
  durationSeconds: number
  fps: number
  disabled?: boolean
}) {
  const [overviewOpen, setOverviewOpen] = React.useState(false)
  const overviewId = React.useId()
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
    <>
      <div className="flex items-center gap-1 px-2" role="group" aria-label="XR frame rehearsal">
        <button type="button" className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded hover:bg-black/5 disabled:opacity-40 focus-visible:outline" aria-label="Previous XR animation frame"
          disabled={disabled || transport.timeSeconds <= 0} onClick={() => step('previous')}>
          <ChevronLeft className="size-4" aria-hidden />
        </button>
        <output className="whitespace-nowrap text-[10px] tabular-nums" aria-label="XR animation frame">
          Frame {transport.frame} · {fps} fps
        </output>
        <button type="button" className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded hover:bg-black/5 disabled:opacity-40 focus-visible:outline" aria-label="Next XR animation frame"
          disabled={disabled || transport.timeSeconds >= durationSeconds} onClick={() => step('next')}>
          <ChevronRight className="size-4" aria-hidden />
        </button>
        <button type="button" className="ml-auto min-h-11 shrink-0 rounded px-2 text-xs hover:bg-black/5 focus-visible:outline"
          aria-expanded={overviewOpen} aria-controls={overviewId} onClick={() => setOverviewOpen(open => !open)}>
          Scene cues
        </button>
      </div>
      <div id={overviewId} hidden={!overviewOpen}>
        {overviewOpen && <React.Suspense fallback={<p className="p-2 text-xs" role="status">Loading scene cues…</p>}>
          <XrTimelineSceneOverview disabled={disabled} />
        </React.Suspense>}
      </div>
    </>
  )
}
