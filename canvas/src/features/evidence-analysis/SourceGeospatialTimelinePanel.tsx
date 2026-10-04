import React from 'react'
import { useGraphStore } from '@/hooks/useGraphStore'
import { GanttTimelineTransportPanel } from '@/features/gitgraph/GanttTimelineTransportPanel'
import type { GanttTimelineTransportCommandAdapter } from '@/features/gitgraph/ganttTimelineTransportCommandAdapter'
import { TimelineTransportTimeAxisClip } from '@/components/timeline/TimelineTransportControls'
import { resolveVideoSequenceTimelineScaleDurationSeconds } from '@/components/timeline/videoSequenceTimelineZoom'
import { useSourceGeospatialState } from './geospatialSource'
import { connectSourceTimeline, seekSourceTimeline } from './sourceTimelineBridge'

const readOnly: GanttTimelineTransportCommandAdapter = {
  selectionFollowsPlayhead: false, canEditTrack: () => false,
  handleCommand: () => ({ status: 'rejected', reason: 'Source records are immutable. Edit the authored source configuration separately.' }),
}
const button = 'App-toolbar__btn min-h-[44px]'
export function SourceGeospatialTimelinePanel({ compact = false }: { compact?: boolean }) {
  const state = useSourceGeospatialState()
  if (!state.timeline || !state.snapshot) return <p role={state.error ? 'alert' : 'status'} className="p-3">{state.error || (state.loading ? 'Loading source Timeline…' : 'No accepted source Timeline. Load the source map context first.')}</p>
  return <SourceTimeline key={state.timeline.documentKey} compact={compact} timeline={state.timeline} />
}
function SourceTimeline({ compact, timeline }: { compact: boolean; timeline: NonNullable<ReturnType<typeof useSourceGeospatialState>['timeline']> }) {
  const state = useSourceGeospatialState()
  const [draft, setDraft] = React.useState(state.atUtc), [error, setError] = React.useState('')
  React.useLayoutEffect(() => connectSourceTimeline(timeline), [timeline])
  React.useEffect(() => { setDraft(state.atUtc) }, [state.atUtc])
  const position = useGraphStore(s => s.timelineTransportDocumentKey === timeline.documentKey ? s.timelineTransportPosition * 60 : 0)
  const scale = resolveVideoSequenceTimelineScaleDurationSeconds(timeline.durationSeconds)
  const seek = (utc: string) => { try { seekSourceTimeline(utc); setError('') } catch (reason) { setError(String(reason)) } }
  const previous = state.moments.filter(moment => moment >= timeline.startUtc && moment < state.atUtc).at(-1)
  const next = state.moments.find(moment => moment > state.atUtc && moment <= timeline.endUtc)
  const code = React.useMemo(() => ['gantt', '  title Video Sequence', '  dateFormat HH:mm', '  axisFormat %M:%S', '  section Source observations', `  Source window : source_window_scene, kgpos_0, ${timeline.durationSeconds / 60}m`].join('\n'), [timeline.durationSeconds])
  return <section aria-label="Source map Timeline" className="flex h-full min-h-0 min-w-0 flex-col gap-2 overflow-auto p-2" data-source-timeline-key={timeline.documentKey} data-source-timeline-utc={state.atUtc}>
    <header className="flex shrink-0 flex-wrap items-center gap-2 text-xs"><strong>{timeline.title}</strong><output aria-label="Timeline observation UTC">{state.atUtc}</output></header>
    <div className="min-h-[240px] flex-1 shrink-0">
    <GanttTimelineTransportPanel code={code} compact={compact} clockActive editable={false} commandAdapter={readOnly}
      mode="media" publishPlaybackRequest={false} runtimeDocumentKey={timeline.documentKey} runtimeDurationSeconds={timeline.durationSeconds} runtimeFrameRate={0}
      timelineInsertedLanes={timeline.lanes.map(lane => ({ id: lane.id, insertAfterLaneId: 'scene', label: <span className="line-clamp-3" title={lane.label}>{lane.label}</span>,
        content: <TimelineTransportTimeAxisClip laneStyle="video" aria-label={lane.label}>
          <section className="relative min-h-[44px] w-full" aria-label={`${lane.label} events`}>
            {lane.contexts.map(context => <p key={context.id} className="m-0 px-2 text-xs" title={[context.statement, context.sourceHash, context.sourcePointer].filter(Boolean).join(' · ')}>{context.label} · {context.status}{context.statement ? ` · ${context.statement}` : ''}</p>)}
            {lane.events.map(event => <button key={event.id} type="button" className={`absolute top-0 h-11 overflow-hidden rounded border px-1 text-left text-xs ${event.kind === 'missing' || event.kind === 'gap' ? 'border-dashed bg-amber-100 text-black' : 'bg-sky-700 text-white'}`}
              style={{ left: `${event.startSeconds / scale * 100}%`, width: `${Math.max(0.3, (event.endSeconds - event.startSeconds) / scale * 100)}%`, minWidth: event.kind === 'observation' || event.kind === 'missing' ? '4px' : undefined }}
              aria-label={`Seek ${lane.label} ${event.kind} ${event.atUtc}`} title={`${event.label} · ${event.kind} · ${event.atUtc}${event.toUtc ? `–${event.toUtc}` : ''} · ${event.status}\n${event.sourceId} · ${event.sourceHash} · ${event.sourcePointer}`}
              onClick={() => seek(new Date(Date.parse(timeline.startUtc) + event.startSeconds * 1000).toISOString())}>{event.kind === 'observation' ? '•' : event.kind}</button>)}
            <hr aria-label={`${lane.label} playhead`} className="pointer-events-none absolute inset-y-0 m-0 h-full w-px border-0 bg-red-500" style={{ left: `${position / scale * 100}%` }} />
          </section>
        </TimelineTransportTimeAxisClip>,
      }))} />
    </div>
    <details className="shrink-0 text-xs"><summary className="min-h-[44px] cursor-pointer">Seek observation UTC</summary>
      <p>Elapsed axis starts at {timeline.startUtc}. Observation gaps remain unknown.</p>
    <form className="flex flex-wrap items-center gap-2 text-xs" onSubmit={event => { event.preventDefault(); seek(draft) }}>
      <label>Observation UTC <input aria-label="Timeline observation UTC input" className="min-h-[44px] w-64 border" value={draft} onChange={event => setDraft(event.target.value)} /></label>
      <button type="submit" className={button}>Seek UTC</button>
      <button type="button" className={button} disabled={!previous} onClick={() => previous && seek(previous)}>Previous observation</button>
      <button type="button" className={button} disabled={!next} onClick={() => next && seek(next)}>Next observation</button>
    </form>
    {(error || state.error) && <p role="alert">{error || state.error}</p>}
    </details>
    <details className="shrink-0 text-xs"><summary className="min-h-[44px] cursor-pointer">Timeline source details</summary>{timeline.lanes.map(lane => <section key={lane.id} aria-label={`${lane.label} source details`}><h4>{lane.label}</h4><ul>{lane.contexts.map(context => <li key={context.id}>{context.label} · {context.status} · {context.statement} {context.sourceHash} {context.sourcePointer}</li>)}{lane.events.map(event => <li key={event.id}><button className={button} type="button" onClick={() => seek(new Date(Date.parse(timeline.startUtc) + event.startSeconds * 1000).toISOString())}>{event.atUtc} · {event.kind}</button> {event.label} · {event.status} · {event.sourceId} · {event.sourceHash} · {event.sourcePointer}</li>)}</ul></section>)}</details>
  </section>
}
