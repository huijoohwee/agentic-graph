import React from 'react'
import { ChevronLeft, ChevronRight, RotateCcw, ZoomIn, ZoomOut, Maximize, LocateFixed } from 'lucide-react'
import { TimelineTransportChrome, TimelineTransportMiniActionBar } from '@/components/timeline/TimelineTransportControls'
import { useSequenceDocument } from './useSequenceDocument'
import { useGanttTimelineTransportView } from '@/features/gitgraph/useGanttTimelineTransportView'
import { sequenceParticipantLabel } from './sequencePresentation'
import { SequenceTimelineRuler } from './SequenceTimelineRuler'
import './SequenceFlow.css'

export function SequenceBranches() {
  const { model, choices, chooseBranch } = useSequenceDocument()
  const groups = [...new Set(model.branches.map(branch => branch.groupId))]
  return <>{groups.map((groupId, index) => {
    const branches = model.branches.filter(branch => branch.groupId === groupId)
    return <label key={groupId}>Outcome {index + 1} <select aria-label={`Sequence outcome ${index + 1}`} value={choices[groupId] || branches[0]!.id} onChange={event => chooseBranch(groupId, event.target.value)}>{branches.map(branch => <option key={branch.id} value={branch.id}>{branch.label}</option>)}</select></label>
  })}</>
}

export function SequenceTimeline() {
  const sequence = useSequenceDocument()
  const { model, events, duration, current, transport, selectEvent } = sequence
  const currentIndex = Math.max(0, events.findIndex(event => event.id === current?.id))
  const { playbackPosition, playing, playbackRate, setTransportPlaying, setTransportPlaybackPosition, setTransportPlaybackRate } = transport
  const viewportRef = React.useRef<HTMLElement>(null)
  const view = useGanttTimelineTransportView({ disabled: !events.length, maxMinutes: duration / 60000, positionMinutes: playbackPosition / 60000, rulerViewportRef: viewportRef })
  const label = (id: string) => sequenceParticipantLabel(model, id)
  return <section className="sequence-flow" aria-label="Sequence Timeline">
    <TimelineTransportChrome ariaLabel="Sequence transport" showRange={false} chromeClassName="timeline-transport-chrome--mermaid-gantt sequence-transport" rulerClassName="timeline-transport-ruler--video-sequence" rulerProps={{ onWheel: view.handleRulerWheelZoom }} currentLabel={`${(playbackPosition / 1000).toFixed(1)}s`} totalLabel={`${duration / 1000}s · ${events.length} steps`} max={duration} value={playbackPosition} step={10} playing={playing} playbackRate={playbackRate} disabled={!events.length}
      onPlaybackRateChange={setTransportPlaybackRate} onValueChange={value => { setTransportPlaying(false); setTransportPlaybackPosition(value) }}
      onTogglePlayback={() => { if (!playing && playbackPosition >= duration) setTransportPlaybackPosition(0); setTransportPlaying(!playing) }}
      headerAside={<section className="timeline-transport-header-tools" aria-label="Sequence Timeline actions"><TimelineTransportMiniActionBar aria-label="Timeline transport actions" actions={[
        { id: 'reset', ariaLabel: 'Reset sequence', icon: RotateCcw, disabled: !events.length, onClick: () => selectEvent(events[0]!.id) },
        { id: 'previous', ariaLabel: 'Previous step', icon: ChevronLeft, disabled: !events.length || currentIndex <= 0, onClick: () => selectEvent(events[Math.max(0, currentIndex - 1)]!.id) },
        { id: 'next', ariaLabel: 'Next step', icon: ChevronRight, disabled: !events.length || currentIndex >= events.length - 1, onClick: () => selectEvent(events[Math.min(events.length - 1, currentIndex + 1)]!.id) },
        { id: 'zoom-out', ariaLabel: 'Zoom out sequence timeline', icon: ZoomOut, disabled: !view.canZoomOut, onClick: view.handleZoomOut },
        { id: 'zoom-in', ariaLabel: 'Zoom in sequence timeline', icon: ZoomIn, disabled: !view.canZoomIn, onClick: view.handleZoomIn },
        { id: 'fit', ariaLabel: 'Fit timeline', icon: Maximize, disabled: !view.canFitTimeline, onClick: view.handleFitTimeline },
        { id: 'center', ariaLabel: 'Center playhead', icon: LocateFixed, disabled: !events.length, onClick: view.centerTimelinePlayhead },
      ]} /></section>}
      ruler={<SequenceTimelineRuler key={sequence.documentKey} sequence={sequence} viewportRef={viewportRef} timelineZoom={view.timelineZoom} sceneControls={<SequenceBranches />} />}
      contextLabel={current ? `${current.ordinal}. ${current.label} · ${label(current.from)} → ${label(current.to)} · ${current.protocol || current.kind} · Source line ${current.line}` : 'Open one supported sequence diagram'} />
    {model.diagnostics.map((d, index) => <p role="alert" key={index}>Line {d.line}: {d.message}</p>)}
  </section>
}
