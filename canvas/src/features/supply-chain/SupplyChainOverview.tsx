import React from 'react'
import { Activity, ArrowDownRight, ArrowLeftRight, Boxes, Building2, Check, ChevronDown, ChevronRight, CircleHelp, Clock3, Factory, LocateFixed, MapPin, Package, Plane, RotateCcw, Search, Ship, TrainFront, Truck, Warehouse, ZoomIn, ZoomOut } from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'
import { useGraphStore } from '@/hooks/useGraphStore'
import { requestGeospatialFitToBounds, requestGeospatialFitToData } from '@/features/geospatial/gympgrphBridge'
import { getSupplyChainFacilityBounds } from './supplyChainGeospatialGraph'
import { useSupplyChainViewStore, type SupplyChainSelection } from './supplyChainViewStore'
import { GanttTimelineTransportPanel } from '@/features/gitgraph/GanttTimelineTransportPanel'
import { READ_ONLY_GANTT_TIMELINE_COMMAND_ADAPTER } from '@/features/gitgraph/ganttTimelineTransportCommandAdapter'
import { TimelineTransportTimeAxisClip } from '@/components/timeline/TimelineTransportControls'
import { resolveVideoSequenceTimelineScaleDurationSeconds } from '@/components/timeline/videoSequenceTimelineZoom'
import {
  projectSupplyChainScenario,
  scenarioConsignment,
  scenarioFacility,
  scenarioLeg,
  SUPPLY_CHAIN_SCENARIO,
  type SupplyChainConsignment,
  type SupplyChainFacility,
  type SupplyChainFacilityKind,
  type SupplyChainMode,
  type SupplyChainEvent,
  type SupplyChainResource,
  type SupplyChainScenario,
} from './supplyChainScenario'
import './supplyChainOverview.css'

const SCENARIO = SUPPLY_CHAIN_SCENARIO
const TRANSPORT_DOCUMENT_KEY = `${SCENARIO.id}@${SCENARIO.revision}`
const TIMELINE_SCALE_SECONDS = resolveVideoSequenceTimelineScaleDurationSeconds(SCENARIO.durationSeconds)
const MODE_COLORS: Record<SupplyChainMode, string> = {
  road: '#4169e1', rail: '#8b5cf6', air: '#0e9f9a', sea: '#0b7fab', reverse: '#d38b24',
}
const MODE_LABELS: Record<SupplyChainMode, string> = {
  road: 'Road', rail: 'Rail', air: 'Air', sea: 'Sea', reverse: 'Returns',
}
const FACILITY_COLORS: Record<SupplyChainFacilityKind, string> = {
  supplier: '#2563eb', production: '#7c3aed', consolidation: '#64748b', airport: '#0891b2', seaport: '#0f766e',
  'rail-terminal': '#7c3aed', 'cross-dock': '#d97706', 'regional-hub': '#2563eb', fulfillment: '#0891b2',
  'delivery-station': '#16a34a', destination: '#15803d', returns: '#ca8a04',
}
const smallButtonClass = 'inline-flex min-h-8 items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 text-[11px] font-medium text-slate-600 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-50'

type Selection = SupplyChainSelection

function formatClock(seconds: number) {
  const safe = Math.max(0, Math.floor(seconds))
  return `${Math.floor(safe / 60).toString().padStart(2, '0')}:${(safe % 60).toString().padStart(2, '0')}`
}

function MiniMetric({ icon, label, value, note }: { icon: React.ReactNode; label: string; value: string; note: string }) {
  return <div className="flex min-w-[135px] items-center gap-2.5 rounded-xl border border-slate-200/90 bg-white/95 px-3 py-2 shadow-sm backdrop-blur">
    <span className="grid h-8 w-8 place-items-center rounded-lg bg-blue-50 text-blue-700">{icon}</span>
    <div className="min-w-0"><p className="text-[10px] font-medium text-slate-500">{label}</p><p className="truncate text-sm font-bold tracking-tight text-slate-900">{value}<span className="ml-1 text-[9px] font-medium text-slate-400">{note}</span></p></div>
  </div>
}

function SupplyChainMap({
  entityFilter, showLabels, onEntityFilter, onToggleLabels, onReset,
}: {
  entityFilter: 'all' | 'infrastructure' | 'resources'
  showLabels: boolean
  onEntityFilter: (value: 'all' | 'infrastructure' | 'resources') => void
  onToggleLabels: () => void
  onReset: () => void
}) {
  return <section className="pointer-events-none absolute inset-0 overflow-hidden" aria-label="Supply chain map controls" data-supply-chain-map-controls="true">
    <div className="pointer-events-none absolute left-1/2 top-[116px] z-10 flex -translate-x-1/2 items-center gap-2 rounded-xl border border-white/80 bg-white/90 px-3 py-2 shadow-sm backdrop-blur">
      <Activity size={14} className="text-blue-600" />
      <span className="whitespace-nowrap text-[10px] font-semibold text-slate-700">Connected logistics network</span>
      <span className="h-3 w-px bg-slate-200" />
      <span className="whitespace-nowrap text-[9px] font-medium text-slate-500">12 facilities · road, rail, air and sea · forward and return flows</span>
    </div>
    <div className="pointer-events-auto absolute right-3 top-[116px] z-10 flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white/95 p-1.5 shadow-sm" aria-label="Network display controls">
      <label className="sr-only" htmlFor="supply-chain-entity-filter">Filter network entities</label>
      <select id="supply-chain-entity-filter" value={entityFilter} onChange={event => onEntityFilter(event.target.value as 'all' | 'infrastructure' | 'resources')} aria-label="Filter network entities" className="h-8 max-w-[150px] rounded-lg border border-slate-200 bg-white px-2 text-[10px] font-semibold text-slate-700 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100">
        <option value="all">All entities</option><option value="infrastructure">Infrastructure</option><option value="resources">Resources</option>
      </select>
      <button type="button" onClick={onToggleLabels} aria-pressed={showLabels} className={`${smallButtonClass} !min-h-8 !px-2 !text-[10px] ${showLabels ? '!border-blue-200 !bg-blue-50 !text-blue-700' : ''}`}><span>Labels {showLabels ? 'on' : 'off'}</span></button>
      <button type="button" onClick={onReset} aria-label="Reset overview" className={`${smallButtonClass} !min-h-8 !px-2 !text-[10px]`}><RotateCcw size={12}/><span>Reset</span></button>
    </div>
  </section>
}

function StageOverview({ onSelect, selectedFacilityId }: { onSelect: (facility: SupplyChainFacility) => void; selectedFacilityId?: string }) {
  const [expanded, setExpanded] = React.useState<Record<string, boolean>>({})
  const groups: { title: string; ids: string[]; icon: React.ReactNode; accent: string }[] = [
    { title: 'Origin & production', ids: ['facility.supplier', 'facility.production', 'facility.origin'], icon: <Factory size={14}/>, accent: 'text-violet-600' },
    { title: 'Air cargo gateway', ids: ['facility.airport'], icon: <Plane size={14}/>, accent: 'text-cyan-700' },
    { title: 'Sea cargo gateway', ids: ['facility.seaport'], icon: <Ship size={14}/>, accent: 'text-teal-700' },
    { title: 'Rail corridor', ids: ['facility.rail'], icon: <TrainFront size={14}/>, accent: 'text-violet-600' },
    { title: 'Transfer & distribution', ids: ['facility.transfer', 'facility.hub', 'facility.fulfillment'], icon: <Warehouse size={14}/>, accent: 'text-blue-700' },
    { title: 'Delivery & returns', ids: ['facility.delivery', 'facility.destination', 'facility.returns'], icon: <Truck size={14}/>, accent: 'text-emerald-700' },
  ]
  return <section className="space-y-2" aria-label="Network stages">
    <div className="flex items-center justify-between"><h2 className="text-[11px] font-bold uppercase tracking-[.12em] text-slate-500">Network stages</h2><span className="text-[10px] text-slate-400">12 sites</span></div>
    <div className="space-y-1">{groups.map(group => {
      const isExpanded = expanded[group.title] === true
      const groupId = `supply-chain-stage-${group.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`
      return <section key={group.title} className="overflow-hidden rounded-lg border border-slate-100 bg-white">
        <button type="button" className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-[11px] font-semibold text-slate-700 hover:bg-slate-50" aria-expanded={isExpanded} aria-controls={groupId} onClick={() => setExpanded(current => ({ ...current, [group.title]: !isExpanded }))}><span className={group.accent}>{group.icon}</span>{group.title}{isExpanded ? <ChevronDown size={13} className="ml-auto text-slate-400"/> : <ChevronRight size={13} className="ml-auto text-slate-400"/>}</button>
        {isExpanded && <div id={groupId} className="flex flex-wrap gap-1 px-2.5 pb-2">{group.ids.map(id => { const facility = scenarioFacility(SCENARIO, id)!; const selected = selectedFacilityId === facility.id; return <button key={id} type="button" aria-pressed={selected} className={`rounded-md px-1.5 py-1 text-[9px] transition ${selected ? 'bg-blue-100 font-semibold text-blue-700' : 'bg-slate-50 text-slate-500 hover:bg-blue-50 hover:text-blue-700'}`} onClick={() => onSelect(facility)}>{facility.code}</button> })}</div>}
      </section>
    })}</div>
  </section>
}

function ResourceRoster({ selectedConsignmentId, timeSeconds, onSelect }: { selectedConsignmentId: string; timeSeconds: number; onSelect: (consignment: SupplyChainConsignment) => void }) {
  return <section className="mt-2 space-y-1 border-t border-slate-100 pt-2" aria-label="Sample resource roster">
    <div className="flex items-center justify-between"><h2 className="text-[11px] font-bold uppercase tracking-[.12em] text-slate-500">Resources</h2><span className="text-[9px] text-slate-400">local scenario</span></div>
    {SCENARIO.resources.map(resource => {
      const consignment = scenarioConsignment(SCENARIO, resource.consignmentId)!
      const projection = projectSupplyChainScenario(SCENARIO, timeSeconds, consignment.id)
      const event = projection.latestEvent
      const exceptional = event?.state === 'exception'
      const leg = projection.activeLegId ? scenarioLeg(SCENARIO, projection.activeLegId) : undefined
      const assigned = Boolean(leg && resource.modes.includes(leg.mode))
      const legLabel = leg ? assigned ? `${MODE_LABELS[leg.mode]} · ${leg.label}` : resource.modes.map(mode => MODE_LABELS[mode]).join(' / ') : 'Journey complete'
      const icon = resource.kind === 'road-vehicle' ? <Truck size={13}/> : resource.kind === 'rail-unit' ? <TrainFront size={13}/> : resource.kind === 'sea-container' ? <Ship size={13}/> : <Plane size={13}/>
      return <button key={resource.id} type="button" onClick={() => onSelect(consignment)} aria-pressed={selectedConsignmentId === consignment.id} className={`flex w-full items-center gap-2 rounded-lg border px-2 py-0.5 text-left transition ${selectedConsignmentId === consignment.id ? 'border-blue-200 bg-blue-50' : 'border-transparent bg-slate-50 hover:border-slate-200 hover:bg-white'}`}>
        <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-white text-slate-600 shadow-sm">{icon}</span>
        <span className="min-w-0 flex-1"><span className="block truncate text-[10px] font-bold text-slate-800">{resource.code} · {resource.name}</span><span className="block truncate text-[9px] text-slate-400">{consignment.reference} · {legLabel}</span></span>
        <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[8px] font-semibold ${exceptional && assigned ? 'bg-rose-50 text-rose-700' : assigned ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{exceptional && assigned ? 'Review' : assigned ? 'Moving' : leg ? 'Ready' : 'Done'}</span>
      </button>
    })}
  </section>
}

function EntityInspector({
  selection, selectedConsignmentId, timeSeconds, activeEvent, onSelectConsignment,
}: {
  selection: Selection
  selectedConsignmentId: string
  timeSeconds: number
  activeEvent?: SupplyChainEvent
  onSelectConsignment: (consignment: SupplyChainConsignment) => void
}) {
  const activeEventTitle = activeEvent?.title || 'Scenario ready'
  const exception = activeEvent?.state === 'exception'
  const consignment = scenarioConsignment(SCENARIO, selectedConsignmentId)!
  const facility = selection.kind === 'facility' ? scenarioFacility(SCENARIO, selection.id) : undefined
  const selectedConsignment = selection.kind === 'consignment' ? scenarioConsignment(SCENARIO, selection.id) : undefined
  const focusConsignment = selectedConsignment || consignment
  const facilityCode = facility?.code || scenarioFacility(SCENARIO, focusConsignment.destinationFacilityId)?.code || '—'
  return <section className="space-y-3" aria-label="Selected supply chain entity">
    {facility ? <>
      <header className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-white shadow-sm" style={{ backgroundColor: FACILITY_COLORS[facility.kind] }}><MapPin size={18}/></span>
        <div className="min-w-0"><p className="text-[9px] font-bold uppercase tracking-[.14em] text-blue-600">{facility.code} · {facility.region}</p><h2 className="mt-0.5 text-sm font-bold leading-tight text-slate-900">{facility.name}</h2><p className="mt-1 text-[10px] leading-4 text-slate-500">{facility.summary}</p></div>
      </header>
      <div className="grid grid-cols-2 gap-2"><div className="rounded-lg bg-slate-50 p-2"><p className="text-[9px] text-slate-400">Scenario capacity</p><p className="mt-1 text-[10px] font-semibold text-slate-700">{facility.capacity}</p></div><div className="rounded-lg bg-slate-50 p-2"><p className="text-[9px] text-slate-400">Latest event</p><p className="mt-1 truncate text-[10px] font-semibold text-slate-700">{activeEventTitle}</p></div></div>
      <div className="rounded-lg border border-blue-100 bg-blue-50/60 p-2.5"><p className="text-[9px] font-bold uppercase tracking-wider text-blue-700">Consignment at this site</p><button type="button" onClick={() => onSelectConsignment(consignment)} className="mt-1 flex w-full items-center text-left text-[11px] font-bold text-slate-800 hover:text-blue-700">{consignment.reference}<ChevronRight size={14} className="ml-auto"/></button><p className="mt-1 text-[10px] text-slate-500">{formatClock(timeSeconds)} scenario time · {facilityCode} focus</p></div>
    </> : <>
      <header className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-blue-600 text-white shadow-sm"><Package size={18}/></span>
        <div className="min-w-0"><p className="text-[9px] font-bold uppercase tracking-[.14em] text-blue-600">Selected consignment</p><h2 className="mt-0.5 text-base font-bold text-slate-900">{focusConsignment.reference}</h2><p className="mt-1 text-[10px] text-slate-500">{focusConsignment.service} · synthetic data</p></div>
      </header>
      <div className="grid grid-cols-2 gap-2"><div className="rounded-lg bg-slate-50 p-2"><p className="text-[9px] text-slate-400">Contents</p><p className="mt-1 truncate text-[10px] font-semibold text-slate-700">{focusConsignment.contents}</p></div><div className="rounded-lg bg-slate-50 p-2"><p className="text-[9px] text-slate-400">Quantity</p><p className="mt-1 text-[10px] font-semibold text-slate-700">{focusConsignment.quantity} {focusConsignment.unit}</p></div></div>
      <div className="rounded-lg border border-slate-100 p-2.5"><div className="flex items-center justify-between"><p className="text-[9px] font-bold uppercase tracking-wider text-slate-500">Current journey</p><span className={`rounded-full px-2 py-0.5 text-[9px] font-semibold ${exception ? 'bg-rose-50 text-rose-700' : 'bg-emerald-50 text-emerald-700'}`}>{activeEventTitle}</span></div>
        <div className="mt-3 space-y-0">{focusConsignment.legIds.map((legId, index) => { const leg = scenarioLeg(SCENARIO, legId)!; const from = scenarioFacility(SCENARIO, leg.from)!; const to = scenarioFacility(SCENARIO, leg.to)!; const active = timeSeconds < focusConsignment.etaSeconds && (index === Math.min(focusConsignment.legIds.length - 1, Math.max(0, Math.floor(timeSeconds / (focusConsignment.etaSeconds / focusConsignment.legIds.length))))); return <div key={leg.id} className="flex gap-2.5"><div className="flex w-3 flex-col items-center"><span className={`mt-1 h-2 w-2 rounded-full ${active ? 'bg-blue-600 ring-4 ring-blue-50' : 'bg-slate-300'}`} /><span className="min-h-[24px] w-px bg-slate-200" /></div><div className="min-w-0 flex-1 pb-2"><p className="truncate text-[10px] font-semibold text-slate-700">{from.name} <ArrowRightGlyph mode={leg.mode}/> {to.name}</p><p className="mt-0.5 text-[9px] text-slate-400">{MODE_LABELS[leg.mode]} · {leg.label}</p></div></div> })}</div>
      </div>
      {focusConsignment.returnConsignmentId && <div className="flex items-center gap-2 rounded-lg bg-amber-50 px-2.5 py-2 text-[10px] text-amber-800"><RotateCcw size={13}/><span>Linked return <strong>{focusConsignment.returnConsignmentId}</strong></span></div>}
    </>}
    <section className="space-y-1.5 border-t border-slate-100 pt-3" aria-label="Sample consignments">
      <div className="mb-1 flex items-center justify-between"><h3 className="text-[10px] font-bold uppercase tracking-[.12em] text-slate-500">Sample consignments</h3><span className="text-[9px] text-slate-400">Choose a journey</span></div>
      {SCENARIO.consignments.map(item => <button key={item.id} type="button" onClick={() => onSelectConsignment(item)} aria-pressed={focusConsignment.id === item.id} className={`flex w-full items-center gap-2 rounded-lg border px-2 py-1.5 text-left transition ${focusConsignment.id === item.id ? 'border-blue-200 bg-blue-50' : 'border-transparent bg-slate-50 hover:border-slate-200 hover:bg-white'}`}>
        <span className="grid h-7 w-7 place-items-center rounded-md bg-white text-slate-500 shadow-sm">{item.service.includes('air') ? <Plane size={13}/> : item.service.includes('Ocean') ? <Ship size={13}/> : <TrainFront size={13}/>}</span>
        <span className="min-w-0 flex-1"><span className="block text-[10px] font-bold text-slate-800">{item.reference}</span><span className="block truncate text-[9px] text-slate-400">{item.service} · {item.quantity} {item.unit}</span></span>
        <ChevronRight size={13} className="text-slate-400"/>
      </button>)}
    </section>
  </section>
}

function ArrowRightGlyph({ mode }: { mode: SupplyChainMode }) {
  return <span aria-label={MODE_LABELS[mode]} className="mx-1 inline-flex translate-y-[2px]" style={{ color: MODE_COLORS[mode] }}><ArrowLeftRight size={10}/></span>
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

export function SupplyChainOverview() {
  const selection = useSupplyChainViewStore(state => state.selection)
  const setSelection = useSupplyChainViewStore(state => state.setSelection)
  const modeFilter = useSupplyChainViewStore(state => state.modeFilter)
  const setModeFilter = useSupplyChainViewStore(state => state.setModeFilter)
  const entityFilter = useSupplyChainViewStore(state => state.entityFilter)
  const setEntityFilter = useSupplyChainViewStore(state => state.setEntityFilter)
  const showLabels = useSupplyChainViewStore(state => state.showLabels)
  const setShowLabels = useSupplyChainViewStore(state => state.setShowLabels)
  const [search, setSearch] = React.useState('')
  const [showEvents, setShowEvents] = React.useState(true)
  const selectedMapNodeId = useGraphStore(state => state.selectedNodeId)
  const transport = useGraphStore(useShallow(state => ({
    documentKey: state.timelineTransportDocumentKey || '',
    position: state.timelineTransportPosition || 0,
    playing: state.timelineTransportPlaying === true,
    setTimelineTransportState: state.setTimelineTransportState,
  })))
  const selectedConsignmentId = selection.kind === 'consignment'
    ? selection.id
    : SCENARIO.consignments.find(consignment => consignment.legIds.some(legId => {
      const leg = scenarioLeg(SCENARIO, legId)
      return leg?.from === selection.id || leg?.to === selection.id
    }))?.id || SCENARIO.consignments[0].id
  const selectedConsignment = scenarioConsignment(SCENARIO, selectedConsignmentId)!
  const chooseConsignment = React.useCallback((consignment: SupplyChainConsignment) => setSelection({ kind: 'consignment', id: consignment.id }), [])
  const chooseFacility = React.useCallback((facility: SupplyChainFacility) => {
    setSelection({ kind: 'facility', id: facility.id })
    const bounds = getSupplyChainFacilityBounds(facility.id)
    if (bounds) void requestGeospatialFitToBounds(bounds).catch(() => undefined)
  }, [setSelection])
  const timeSeconds = transport.documentKey === TRANSPORT_DOCUMENT_KEY
    ? Math.min(SCENARIO.durationSeconds, Math.max(0, transport.position * 60))
    : 0
  const projection = React.useMemo(
    () => projectSupplyChainScenario(SCENARIO, timeSeconds, selectedConsignmentId),
    [selectedConsignmentId, timeSeconds],
  )
  const activeFacilityId = selection.kind === 'facility' ? selection.id : projection.latestEvent?.facilityId
  const activeEventTitle = projection.latestEvent?.title || 'Scenario ready'
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
  React.useEffect(() => {
    const selected = String(selectedMapNodeId || '')
    const facilityPrefix = 'supply-chain:facility.'
    const resourcePrefix = 'supply-chain:resource.'
    if (selected.startsWith(facilityPrefix)) {
      const facilityId = selected.slice('supply-chain:'.length)
      if (scenarioFacility(SCENARIO, facilityId)) setSelection({ kind: 'facility', id: facilityId })
      return
    }
    if (selected.startsWith(resourcePrefix)) {
      const resource = SCENARIO.resources.find(item => item.id === selected.slice('supply-chain:'.length))
      if (resource) setSelection({ kind: 'consignment', id: resource.consignmentId })
    }
  }, [selectedMapNodeId, setSelection])
  React.useEffect(() => () => {
    const current = useGraphStore.getState()
    if (current.timelineTransportDocumentKey === TRANSPORT_DOCUMENT_KEY) {
      current.setTimelineTransportState({ playing: false })
    }
  }, [])
  React.useEffect(() => {
    // Always enter this authored source with its complete regional footprint in
    // the shared map's current visible aperture, even if a prior workspace left
    // the map panned or zoomed to a different site.
    void requestGeospatialFitToData().catch(() => undefined)
  }, [])
  const filteredFacilities = SCENARIO.facilities.filter(facility => `${facility.name} ${facility.code} ${facility.region}`.toLowerCase().includes(search.trim().toLowerCase()))
  const filteredConsignments = SCENARIO.consignments.filter(consignment => `${consignment.reference} ${consignment.contents} ${consignment.service}`.toLowerCase().includes(search.trim().toLowerCase()))
  const resetOverview = () => {
    setSelection({ kind: 'consignment', id: SCENARIO.consignments[0].id })
    setModeFilter('all')
    setEntityFilter('all')
    setShowLabels(true)
    setShowEvents(true)
    setSearch('')
    transport.setTimelineTransportState({ documentKey: TRANSPORT_DOCUMENT_KEY, position: 0, playing: false })
    void requestGeospatialFitToData().catch(() => undefined)
  }

  return <main className="sc-overview pointer-events-none absolute inset-0 z-[45] h-full min-h-0 w-full overflow-hidden text-slate-800" aria-label="Supply chain operations overview" data-supply-chain-overview="true" data-scenario-id={SCENARIO.id} data-scenario-revision={SCENARIO.revision}>
    <header className="pointer-events-auto absolute left-3 right-3 top-2 z-20 flex min-h-[46px] items-center gap-3 rounded-xl border border-slate-200/90 bg-white/95 px-3 shadow-[0_1px_4px_rgba(15,23,42,.08)] backdrop-blur" data-kg-workspace-visible-viewport-occluder="top">
      <span className="grid h-8 w-8 place-items-center rounded-lg bg-slate-900 text-white"><ArrowLeftRight size={16}/></span>
      <div className="min-w-0"><div className="flex items-center gap-2"><strong className="text-[13px] tracking-tight text-slate-900">Network operations</strong><ChevronRight size={13} className="text-slate-300"/><span className="truncate text-[11px] text-slate-500">End-to-end supply chain</span><span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[8px] font-bold uppercase tracking-wide text-amber-800"><span className="h-1.5 w-1.5 rounded-full bg-amber-500"/>Simulated</span></div><p className="hidden text-[9px] text-slate-400 sm:block">Synthetic local source · seed {SCENARIO.seed} · revision {SCENARIO.revision}</p></div>
    </header>
    <section className="pointer-events-auto absolute left-1/2 top-[58px] z-20 flex max-w-[calc(100%-24px)] -translate-x-1/2 items-center gap-2 overflow-x-auto rounded-xl border border-slate-200/90 bg-white/95 p-1.5 shadow-sm backdrop-blur" aria-label="Scenario summary" data-kg-workspace-visible-viewport-occluder="top">
      <MiniMetric icon={<Boxes size={16}/>} label="Active sample consignments" value={String(projection.activeConsignmentCount).padStart(2, '0')} note={`${SCENARIO.consignments.length} total`} />
      <MiniMetric icon={<Building2 size={16}/>} label="Connected facilities" value={String(SCENARIO.facilities.length).padStart(2, '0')} note="modeled" />
      <MiniMetric icon={<Truck size={16}/>} label="Transport modes" value={String(new Set(SCENARIO.legs.filter(leg => leg.mode !== 'reverse').map(leg => leg.mode)).size).padStart(2, '0')} note="road · rail · air · sea" />
      <MiniMetric icon={<RotateCcw size={15}/>} label="Linked return flows" value={String(SCENARIO.consignments.filter(consignment => consignment.returnConsignmentId).length).padStart(2, '0')} note="in scenario" />
      <label className="ml-1 flex shrink-0 items-center gap-2 text-[10px] font-medium text-slate-500">Journey
        <select value={selectedConsignmentId} onChange={event => { const consignment = scenarioConsignment(SCENARIO, event.target.value); if (consignment) chooseConsignment(consignment) }} aria-label="Select supply chain journey" className="h-8 max-w-[145px] rounded-lg border border-slate-200 bg-white px-2 text-[10px] font-semibold text-slate-700 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100">
          {SCENARIO.consignments.map(consignment => <option key={consignment.id} value={consignment.id}>{consignment.reference} · {consignment.service}</option>)}
        </select>
      </label>
      <label className="ml-1 flex shrink-0 items-center gap-2 text-[10px] font-medium text-slate-500">Routes
        <select value={modeFilter} onChange={event => setModeFilter(event.target.value as SupplyChainMode | 'all')} aria-label="Filter routes by transport mode" className="h-8 max-w-[145px] rounded-lg border border-slate-200 bg-white px-2 text-[10px] font-semibold text-slate-700 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100">
          <option value="all">All modes</option><option value="road">Road</option><option value="rail">Rail</option><option value="air">Air</option><option value="sea">Sea</option><option value="reverse">Returns</option>
        </select>
      </label>
    </section>
    <section className="pointer-events-none absolute inset-0 min-h-0 overflow-hidden">
      <SupplyChainMap
        entityFilter={entityFilter}
        showLabels={showLabels}
        onEntityFilter={setEntityFilter}
        onToggleLabels={() => setShowLabels(!showLabels)}
        onReset={resetOverview}
      />
      <aside className="pointer-events-auto absolute bottom-[202px] left-3 top-[158px] z-20 hidden w-[244px] overflow-y-auto rounded-xl border border-slate-200/90 bg-white/95 p-3 shadow-[0_8px_28px_rgba(15,23,42,.10)] backdrop-blur xl:block" aria-label="Geospatial panel">
        <header className="mb-3 flex items-start justify-between"><div><p className="text-[9px] font-bold uppercase tracking-[.14em] text-blue-600">Global movement</p><h2 className="mt-0.5 text-[13px] font-bold text-slate-900">Connected network</h2></div><span className="rounded-md bg-blue-50 px-1.5 py-1 text-[9px] font-bold text-blue-700">12 sites</span></header>
        <div className="mb-2 flex items-center gap-2 rounded-lg bg-slate-50 px-2 py-1.5"><span className="grid h-7 w-7 place-items-center rounded-md bg-white text-blue-600 shadow-sm"><Activity size={14}/></span><div className="min-w-0"><p className="text-[10px] font-semibold text-slate-700">Scenario clock</p><p className="text-[9px] text-slate-400">{formatClock(timeSeconds)} elapsed · {transport.playing ? 'playing' : 'paused'}</p></div><span className="ml-auto rounded-full bg-emerald-50 px-1.5 py-0.5 text-[8px] font-semibold text-emerald-700">LOCAL</span></div>
        <label className="relative mb-2 block"><Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400"/><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Find a site or consignment" aria-label="Search network entities" className="h-8 w-full rounded-lg border border-slate-200 bg-slate-50 pl-8 pr-3 text-[10px] outline-none placeholder:text-slate-400 focus:border-blue-400 focus:bg-white focus:ring-2 focus:ring-blue-100"/></label>
        <StageOverview selectedFacilityId={activeFacilityId} onSelect={chooseFacility}/>
        <ResourceRoster selectedConsignmentId={selectedConsignmentId} timeSeconds={timeSeconds} onSelect={chooseConsignment}/>
        <p className="mt-3 border-t border-slate-100 pt-2 text-[9px] leading-4 text-slate-400">Illustrative topology. Synthetic local source · seed {SCENARIO.seed} · revision {SCENARIO.revision}.</p>
      </aside>
      <aside className="pointer-events-auto absolute bottom-[202px] right-3 top-[158px] z-20 hidden w-[278px] overflow-y-auto rounded-xl border border-slate-200/90 bg-white/95 p-3 shadow-[0_8px_28px_rgba(15,23,42,.10)] backdrop-blur xl:block" aria-label="Geospatial panel">
        <div className="mb-3 flex items-center justify-between"><h2 className="text-[11px] font-bold uppercase tracking-[.12em] text-slate-500">Operations detail</h2><button type="button" aria-label="Help with synthetic scenario" title="All values are generated locally for this scenario." className="text-slate-400 hover:text-slate-700"><CircleHelp size={14}/></button></div>
        <EntityInspector selection={selection} selectedConsignmentId={selectedConsignmentId} timeSeconds={timeSeconds} activeEvent={projection.latestEvent} onSelectConsignment={chooseConsignment}/>
      </aside>
      {search && <section className="pointer-events-auto absolute left-1/2 top-24 z-30 max-h-[45%] w-[min(360px,calc(100%-24px))] -translate-x-1/2 overflow-auto rounded-xl border border-slate-200 bg-white p-2.5 shadow-xl" aria-label="Search results and selected site">
        <header className="mb-1.5 flex items-center justify-between"><p className="text-[10px] font-bold text-slate-600">Search results · {filteredFacilities.length + filteredConsignments.length}</p><button type="button" aria-label="Clear search" onClick={() => setSearch('')} className="rounded p-1 text-slate-400 hover:bg-slate-100"><ChevronDown size={13}/></button></header>
        {search && <div className="space-y-1">{filteredFacilities.slice(0, 8).map(facility => <button key={facility.id} type="button" onClick={() => { chooseFacility(facility); setSearch('') }} className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-slate-50"><MapPin size={13} style={{ color: FACILITY_COLORS[facility.kind] }}/><span className="min-w-0 flex-1 truncate text-[10px] font-medium">{facility.name}</span><span className="text-[9px] text-slate-400">{facility.code}</span></button>)}{filteredConsignments.map(consignment => <button key={consignment.id} type="button" onClick={() => { chooseConsignment(consignment); setSearch('') }} className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-slate-50"><Package size={13} className="text-blue-600"/><span className="min-w-0 flex-1 truncate text-[10px] font-medium">{consignment.reference} · {consignment.contents}</span><ChevronRight size={12} className="text-slate-400"/></button>)}</div>}
      </section>}
      <div className="pointer-events-auto absolute bottom-[202px] left-3 z-10 flex items-center gap-1.5 rounded-lg border border-white/90 bg-white/90 p-1.5 shadow-sm backdrop-blur" aria-label="Map display controls">
        <button type="button" onClick={() => setShowEvents(value => !value)} aria-pressed={showEvents} className={`${smallButtonClass} ${showEvents ? '!border-blue-200 !bg-blue-50 !text-blue-700' : ''}`}><Activity size={12}/><span>Movement events</span></button>
        <button type="button" onClick={() => setSelection({ kind: 'consignment', id: SCENARIO.consignments[0].id })} className={smallButtonClass}><RouteIconGlyph/><span>Focus journey</span></button>
      </div>
      <div className="pointer-events-auto absolute bottom-[202px] right-3 z-10 hidden items-center gap-1 rounded-lg border border-white/90 bg-white/90 px-2 py-1.5 text-[9px] text-slate-500 shadow-sm backdrop-blur sm:flex"><Clock3 size={12}/><span>{formatClock(timeSeconds)}</span><span className="mx-1 h-3 w-px bg-slate-200"/>{projection.activeConsignmentCount} active sample movements</div>
    </section>
    <footer className="pointer-events-auto absolute bottom-0 left-0 right-0 z-20 flex h-[174px] flex-col overflow-hidden border-t border-slate-200 bg-white/95 px-2 pb-1 pt-1 shadow-[0_-6px_24px_rgba(15,23,42,.06)] sm:h-[190px] sm:px-3" aria-label="Shared supply chain timeline" data-kg-workspace-visible-viewport-occluder="bottom">
      <div className="flex min-h-0 flex-1 items-stretch gap-2 overflow-hidden">
        <section className="hidden min-w-[150px] max-w-[240px] flex-1 items-center gap-2 md:flex"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-600"><Clock3 size={15}/></span><div className="min-w-0"><h2 className="truncate text-[11px] font-bold text-slate-800">Network movement timeline</h2><p className="truncate text-[9px] text-slate-400">{selectedConsignment.reference} · {activeEventTitle} · {formatClock(timeSeconds)}</p></div></section>
        <div className="min-h-0 min-w-0 flex-1 overflow-hidden" data-supply-chain-shared-timeline="true">
          <GanttTimelineTransportPanel code={timelineCode} compact clockActive editable={false} commandAdapter={READ_ONLY_GANTT_TIMELINE_COMMAND_ADAPTER} mode="workflow" publishPlaybackRequest={false} runtimeDocumentKey={TRANSPORT_DOCUMENT_KEY} runtimeDurationSeconds={SCENARIO.durationSeconds} runtimeFrameRate={1} timelineInsertedLanes={timelineLanes} />
        </div>
      </div>
      <div className="flex h-5 shrink-0 items-center justify-between border-t border-slate-100 px-1 text-[9px] text-slate-400"><span className="inline-flex items-center gap-1.5"><Check size={11} className="text-emerald-600"/>One scenario clock drives the map, event list and journey</span><span>Sample playback · {SCENARIO.durationSeconds / 60} min · read-only</span></div>
    </footer>
  </main>
}

function RouteIconGlyph() {
  return <span className="inline-grid h-3 w-3 place-items-center"><ArrowDownRight size={12}/></span>
}
