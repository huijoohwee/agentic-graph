import React from 'react'
import { VideoSequenceTimelineRuler, type VideoSequenceTimelineInsertedLane } from '@/components/timeline/VideoSequenceTimelineRuler'
import { TimelineTransportTimeAxisClip, TimelineTransportTimeAxisMark } from '@/components/timeline/TimelineTransportControls'
import { resolveVideoSequenceRulerInsetLeft, resolveVideoSequenceRulerInsetWidth } from '@/components/timeline/videoSequenceTimelineRulerGeometry'
import { resolveVideoSequenceTimelineScaleMaxMinutes } from '@/components/timeline/videoSequenceTimelineZoom'
import type { MermaidGanttTimelineTaskSpan } from '@/lib/mermaid/mermaidGanttBarInteraction'
import { useGanttTimelineInteractions } from '@/features/gitgraph/useGanttTimelineInteractions'
import { sequenceEventState } from './sequencePresentation'
import type { useSequenceDocument } from './useSequenceDocument'

type SequenceDocument = ReturnType<typeof useSequenceDocument>

// Adapt rehearsal intervals to the existing ruler's minute-based contract.
// There is no Gantt source, media clock, persisted track or editable duration.
export function SequenceTimelineRuler({ sequence, viewportRef, timelineZoom, sceneControls }: {
  sequence: SequenceDocument
  viewportRef: React.RefObject<HTMLElement | null>
  timelineZoom: number
  sceneControls: React.ReactNode
}) {
  const { model, events, duration, current, transport, selectEvent } = sequence
  const contentRef = React.useRef<HTMLElement>(null)
  const maxMinutes = duration / 60000
  const scaleMinutes = resolveVideoSequenceTimelineScaleMaxMinutes({ maxMinutes, mediaDurationSeconds: duration / 1000 })
  const spans = React.useMemo<MermaidGanttTimelineTaskSpan[]>(() => duration ? [{
    rowKey: model.key, label: 'Authored sequence rehearsal', raw: 'Authored sequence rehearsal',
    lineIndex: 0, startMinutes: 0, durationMinutes: maxMinutes, endMinutes: maxMinutes,
  }] : [], [duration, maxMinutes, model.key])
  const interactions = useGanttTimelineInteractions({
    autoSnappingEnabled: false, markdownDocumentName: '', markdownText: '',
    maxMinutes, scrubMaxMinutes: scaleMinutes, positionMinutes: transport.playbackPosition / 60000,
    resolveRowKeyAtPosition: () => '', selectedRowKey: '', selectionFollowsPlayhead: false,
    setSelectedRowKey: () => {}, spans, onCommitDrag: () => {},
    setTransportPlaying: transport.setTransportPlaying,
    setTransportPlaybackPosition: value => transport.setTransportPlaybackPosition(value * 60000),
  })
  const lanes: VideoSequenceTimelineInsertedLane[] = model.participants.map(participant => ({
    id: participant.id, insertAfterLaneId: 'workflow',
    label: <span title={participant.label}>{participant.label}</span>,
    selected: current?.from === participant.id || current?.to === participant.id,
    content: <TimelineTransportTimeAxisClip laneStyle="video" className="sequence-participant-track"
      aria-label={`${participant.label} sequence lane`} style={{ left: resolveVideoSequenceRulerInsetLeft(0), width: resolveVideoSequenceRulerInsetWidth(scaleMinutes ? maxMinutes / scaleMinutes * 100 : 0), minWidth: 0 }}>
      <button className="timeline-transport-time-axis-bar sequence-participant-bar" aria-label={`Scrub ${participant.label} sequence lane`} data-kg-video-sequence-ruler-scrub-target="1" title="Drag to scrub the authored sequence"
        onKeyDown={event => {
          const delta = event.key === 'ArrowRight' ? 1000 : event.key === 'ArrowLeft' ? -1000 : 0
          if (!delta && event.key !== 'Home' && event.key !== 'End') return
          event.preventDefault()
          transport.setTransportPlaying(false)
          transport.setTransportPlaybackPosition(event.key === 'Home' ? 0 : event.key === 'End' ? duration : Math.min(duration, Math.max(0, transport.playbackPosition + delta)))
        }}>
        <span>{participant.actor ? 'Actor' : 'Participant'} · {participant.label}</span>
      </button>
      {events.filter(event => event.from === participant.id || event.to === participant.id).map(event => (
        <TimelineTransportTimeAxisMark key={event.id} laneStyle="video" role="button" tabIndex={0} className="sequence-event-mark"
          style={{ left: `${duration ? event.startMs / duration * 100 : 0}%` }}
          data-sequence-state={sequenceEventState(event, transport.playbackPosition)}
          data-sequence-timeline-event={event.id} aria-pressed={current?.id === event.id}
          aria-label={`Seek step ${event.ordinal}: ${event.label} in ${participant.label}`}
          title={`${event.ordinal}. ${event.label} · ${event.startMs / 1000}s · Source line ${event.line}`}
          onPointerDown={event => event.stopPropagation()} onClick={() => selectEvent(event.id)}
          onKeyDown={keyboard => { if (keyboard.key === 'Enter' || keyboard.key === ' ') { keyboard.preventDefault(); selectEvent(event.id) } }}>
          <span>{event.ordinal}</span>
        </TimelineTransportTimeAxisMark>
      ))}
    </TimelineTransportTimeAxisClip>,
  }))
  return <section style={{ height: '100%', '--sequence-axis-min-width': `${Math.max(520, scaleMinutes * 60 * 52)}px` } as React.CSSProperties}><VideoSequenceTimelineRuler contentRef={contentRef} viewportRef={viewportRef}
    displayTicks={[]} dragPreview={null} draggingMode={null} draggingRowKey="" editable={false}
    maxMinutes={maxMinutes} mediaDurationSeconds={duration / 1000} playheadPercent={duration ? transport.playbackPosition / duration * 100 : 0}
    projectionMode="workflow" selectedRowKey="" taskSpans={spans} timelineInsertedLanes={lanes} timelineZoom={timelineZoom}
    renderClipOverlay={() => model.branches.length ? <section className="timeline-transport-clip-controls" aria-label="Sequence rehearsal outcomes" onPointerDown={event => event.stopPropagation()}>{sceneControls}</section> : null}
    timeAxisControls={<span title="Authored order · one second per message">Sequence</span>}
    onRulerPointerDown={interactions.handleRulerPointerScrub} onSelectRowKey={() => {}}
    onSelectRowPosition={(_key, minutes) => { transport.setTransportPlaying(false); transport.setTransportPlaybackPosition(minutes * 60000) }}
    onDropMedia={() => false} onTrackPointerStart={() => {}} /></section>
}
