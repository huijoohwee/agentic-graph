import React from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useGraphStore } from '@/hooks/useGraphStore'
import { GanttTimelineTransportPanel } from '@/features/gitgraph/GanttTimelineTransportPanel'
import { READ_ONLY_GANTT_TIMELINE_COMMAND_ADAPTER } from '@/features/gitgraph/ganttTimelineTransportCommandAdapter'
import { TimelineTransportTimeAxisClip } from '@/components/timeline/TimelineTransportControls'
import { resolveVideoSequenceTimelineScaleDurationSeconds } from '@/components/timeline/videoSequenceTimelineZoom'
import { useSupplyChainViewStore } from './supplyChainViewStore'
import {
  projectSupplyChainScenario,
  scenarioConsignment,
  scenarioFacility,
  SUPPLY_CHAIN_SCENARIO,
  type SupplyChainConsignment,
  type SupplyChainMode,
} from './supplyChainScenario'

const SCENARIO = SUPPLY_CHAIN_SCENARIO
const TRANSPORT_DOCUMENT_KEY = `${SCENARIO.id}@${SCENARIO.revision}`
const TIMELINE_SCALE_SECONDS = resolveVideoSequenceTimelineScaleDurationSeconds(SCENARIO.durationSeconds)
const MODE_COLORS: Record<SupplyChainMode, string> = {
  road: '#4169e1', rail: '#8b5cf6', air: '#0e9f9a', sea: '#0b7fab', reverse: '#d38b24',
}

function formatClock(seconds: number) {
  const safe = Math.max(0, Math.floor(seconds))
  return `${Math.floor(safe / 60).toString().padStart(2, '0')}:${(safe % 60).toString().padStart(2, '0')}`
}

function TimelineEventsLane({
  onSelectRow, onSelectConsignment,
}: {
  onSelectRow: () => void
  onSelectConsignment: (consignment: SupplyChainConsignment) => void
}) {
  const setState = useGraphStore(state => state.setTimelineTransportState)
  const choose = (atSeconds: number) => setState({ documentKey: TRANSPORT_DOCUMENT_KEY, position: atSeconds / 60, playing: false })
  return <TimelineTransportTimeAxisClip laneStyle="video" aria-label="Supply chain event timeline lane">
    <div className="relative h-8 w-full">
      {SCENARIO.events.map((event, index) => {
        const consignment = scenarioConsignment(SCENARIO, event.consignmentId)!
        const mode: SupplyChainMode = consignment.service.includes('air') ? 'air' : consignment.service.includes('Ocean') ? 'sea' : 'rail'
        const left = `${(event.atSeconds / TIMELINE_SCALE_SECONDS) * 100}%`
        const markerColor = event.state === 'exception' ? '#e11d48' : MODE_COLORS[mode]
        return <button key={event.id} type="button" title={`${consignment.reference} · ${formatClock(event.atSeconds)} · ${event.state} · ${event.title}`} aria-label={`Seek to ${consignment.reference}: ${event.title} at ${formatClock(event.atSeconds)}${event.state === 'exception' ? ', exception' : ''}`} onClick={() => { onSelectRow(); onSelectConsignment(consignment); choose(event.atSeconds) }} className="sc-event-marker" style={{ left, top: `${[28, 50, 72][index % 3]}%`, borderColor: markerColor }}><span style={{ backgroundColor: markerColor }} /></button>
      })}
    </div>
  </TimelineTransportTimeAxisClip>
}

export function SupplyChainTimelinePanel({ compact = false }: { compact?: boolean }) {
  const selection = useSupplyChainViewStore(state => state.selection)
  const setSelection = useSupplyChainViewStore(state => state.setSelection)
  const showEvents = useSupplyChainViewStore(state => state.showEvents)
  const transport = useGraphStore(useShallow(state => ({
    documentKey: state.timelineTransportDocumentKey || '',
    position: state.timelineTransportPosition || 0,
    playing: state.timelineTransportPlaying === true,
    setTimelineTransportState: state.setTimelineTransportState,
  })))
  const selectedConsignmentId = selection.kind === 'consignment'
    ? selection.id
    : SCENARIO.consignments.find(consignment => consignment.legIds.some(legId => {
      const leg = SCENARIO.legs.find(item => item.id === legId)
      return leg?.from === selection.id || leg?.to === selection.id
    }))?.id || SCENARIO.consignments[0].id
  const selectedConsignment = scenarioConsignment(SCENARIO, selectedConsignmentId)!
  const chooseConsignment = React.useCallback((consignment: SupplyChainConsignment) => setSelection({ kind: 'consignment', id: consignment.id }), [setSelection])
  const timeSeconds = transport.documentKey === TRANSPORT_DOCUMENT_KEY
    ? Math.min(SCENARIO.durationSeconds, Math.max(0, transport.position * 60))
    : 0
  const projection = projectSupplyChainScenario(SCENARIO, timeSeconds, selectedConsignmentId)
  const timelineCode = React.useMemo(() => [
    'gantt',
    '  title Network movement scenario',
    '  dateFormat HH:mm',
    '  axisFormat %M:%S',
    '  section End-to-end logistics',
    `  Supply chain network : network_scenario, kgpos_0, ${SCENARIO.durationSeconds / 60}m`,
  ].join('\n'), [])
  const timelineLanes = React.useMemo(() => showEvents ? [{
    id: 'supply-chain:events',
    selectRowKey: 'supply-chain:events',
    insertAfterLaneId: 'workflow',
    label: 'Network events',
    ariaLabel: 'Network consignment events',
    selected: true,
    content: ({ selectRow }: { selectRow: () => void }) => <TimelineEventsLane onSelectRow={selectRow} onSelectConsignment={chooseConsignment} />,
  }] : [], [chooseConsignment, showEvents])

  return <section className="flex h-full min-h-0 flex-col overflow-hidden" aria-label="Supply chain shared Timeline" data-supply-chain-shared-timeline="true">
    <header className="flex shrink-0 items-center gap-2 border-b border-slate-100 px-3 py-1.5 text-xs">
      <strong>Network movement timeline</strong>
      <span className="text-slate-500">{selectedConsignment.reference} · {projection.latestEvent?.title || 'Scenario ready'} · {formatClock(timeSeconds)}</span>
      <span className="ml-auto text-slate-400">Synthetic sample · read-only</span>
    </header>
    <div className="min-h-0 flex-1 overflow-hidden">
      <GanttTimelineTransportPanel code={timelineCode} compact={compact} clockActive editable={false} commandAdapter={READ_ONLY_GANTT_TIMELINE_COMMAND_ADAPTER} mode="workflow" publishPlaybackRequest={false} runtimeDocumentKey={TRANSPORT_DOCUMENT_KEY} runtimeDurationSeconds={SCENARIO.durationSeconds} runtimeFrameRate={1} timelineInsertedLanes={timelineLanes} />
    </div>
  </section>
}
