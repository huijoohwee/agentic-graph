import React from 'react'
import { TimelineTransportChrome } from '@/components/timeline/TimelineTransportControls'
import { useSequenceDocument } from './useSequenceDocument'
import { usePanelTypography } from '@/lib/ui/panelTypography'
import { useGanttTimelineTransportView } from '@/features/gitgraph/useGanttTimelineTransportView'
import { sequenceEventState, sequenceParticipantLabel } from './sequencePresentation'
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
  const { model, events, duration, current, transport, selectEvent } = useSequenceDocument()
  const typography = usePanelTypography()
  const currentIndex = Math.max(0, events.findIndex(event => event.id === current?.id))
  const { playbackPosition, playing, playbackRate, setTransportPlaying, setTransportPlaybackPosition, setTransportPlaybackRate } = transport
  const railRef = React.useRef<HTMLOListElement>(null)
  const view = useGanttTimelineTransportView({ disabled: !events.length, maxMinutes: duration, positionMinutes: playbackPosition, rulerViewportRef: railRef })
  const label = (id: string) => sequenceParticipantLabel(model, id)
  return <section className={`sequence-flow sequence-timeline ${typography.panelTextClass}`} aria-label="Sequence Timeline">
    <TimelineTransportChrome ariaLabel="Sequence transport" titleLabel="Authored sequence rehearsal" subtitleLabel="Authored order · one second per message" currentLabel={`${(playbackPosition / 1000).toFixed(1)}s`} totalLabel={`${duration / 1000}s · ${events.length} steps`} max={duration} value={playbackPosition} step={10} playing={playing} playbackRate={playbackRate} disabled={!events.length}
      onPlaybackRateChange={setTransportPlaybackRate} onValueChange={value => { setTransportPlaying(false); setTransportPlaybackPosition(value) }}
      onTogglePlayback={() => { if (!playing && playbackPosition >= duration) setTransportPlaybackPosition(0); setTransportPlaying(!playing) }}
      headerAside={<><button disabled={!events.length} onClick={() => selectEvent(events[0]!.id)}>Reset</button><button disabled={!events.length || currentIndex <= 0} onClick={() => selectEvent(events[Math.max(0, currentIndex - 1)]!.id)}>Previous step</button><button disabled={!events.length || currentIndex >= events.length - 1} onClick={() => selectEvent(events[Math.min(events.length - 1, currentIndex + 1)]!.id)}>Next step</button><SequenceBranches /><button aria-label="Zoom out sequence timeline" disabled={!view.canZoomOut} onClick={view.handleZoomOut}>−</button><button aria-label="Zoom in sequence timeline" disabled={!view.canZoomIn} onClick={view.handleZoomIn}>+</button><button disabled={!view.canFitTimeline} onClick={view.handleFitTimeline}>Fit timeline</button><button disabled={!events.length} onClick={view.centerTimelinePlayhead}>Center playhead</button></>}
      ruler={<div className="sequence-rail-scroll" data-kg-video-sequence-ruler-scroll="1" onWheel={view.handleRulerWheelZoom}><ol ref={railRef} className="sequence-step-rail" style={{ width: `${view.timelineZoom * 100}%` }}>{events.map(event => <li key={event.id}><button title={event.label} aria-pressed={current?.id === event.id} aria-label={`Seek step ${event.ordinal}: ${event.label}`} onClick={() => selectEvent(event.id)}><span>{event.ordinal}</span><span>{event.label}</span><small>{event.startMs / 1000}s</small></button></li>)}</ol></div>}
      supplementalLanes={<ol className="sequence-flow-steps" aria-label="Sequence flow steps">{events.map(event => <li key={event.id} data-sequence-state={sequenceEventState(event, playbackPosition)}><button aria-pressed={current?.id === event.id} aria-label={`Inspect step ${event.ordinal}: ${event.label}`} onClick={() => selectEvent(event.id)}><span className="sequence-step-number">{event.ordinal}</span><span className="sequence-step-copy"><strong>{event.label}</strong><span>{label(event.from)} → {label(event.to)}</span><small>{event.protocol || event.kind} · {event.startMs / 1000}–{(event.startMs + event.durationMs) / 1000}s · Source line {event.line}</small></span><span className="sequence-step-state">{event.kind === 'note' ? 'marker' : sequenceEventState(event, playbackPosition)}</span></button></li>)}</ol>}
      contextLabel={current ? `${label(current.from)} → ${label(current.to)} · ${current.label}` : 'Open one supported sequence diagram'} />
    {model.diagnostics.map((d, index) => <p role="alert" key={index}>Line {d.line}: {d.message}</p>)}
  </section>
}
