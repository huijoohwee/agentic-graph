import * as React from 'react'
import { HierarchyTreeRow } from '@/lib/ui/HierarchyTreeRow'
import { MainPanelTypeIcon, type MainPanelTypeIconKey } from '@/features/panels/ui/mainPanelHelpIconLibrary'
import type { TraceSpan, visibleSpanTree } from './missionControlProjection'
import { numberLabel, spanResources } from './missionControlProjection'
import { DEFAULT_SPAN_METRICS, SPAN_METRICS, durationLabel, spanMetricLabel, spanMetricMaximum, spanMetricPercent, spanMetricValue, type SpanMetric } from './agentRunSpanMetric'
export { durationLabel } from './agentRunSpanMetric'

const tones: Record<string, { fill: string; stroke: string }> = {
  agent: { fill: '#e0e7ff', stroke: '#4f46e5' },
  model: { fill: '#ffedd5', stroke: '#c2410c' },
  tool: { fill: '#fef9c3', stroke: '#a16207' },
  retrieval: { fill: '#ccfbf1', stroke: '#0f766e' },
  check: { fill: '#e0f2fe', stroke: '#0369a1' },
}
export const spanTone = (kind: string) => tones[kind] ?? tones.agent!
// Semantic references reuse the Help library's component definitions and discoverability.
const icons: Record<string, MainPanelTypeIconKey> = { agent: 'invocation.subject.agent', model: 'invocation.subject.memory',
  tool: 'invocation.prefix.slash', retrieval: 'invocation.subject.research', check: 'field.type.checkbox' }
export function AgentRunSpanViews({ rows, selectedId, onSelect, search = '', metrics = DEFAULT_SPAN_METRICS }: {
  rows: ReturnType<typeof visibleSpanTree>; selectedId: string | null; onSelect: (id: string) => void; search?: string; metrics?: SpanMetric[]
}) {
  const [collapsed, setCollapsed] = React.useState<Set<string>>(() => new Set())
  const container = React.useRef<HTMLUListElement>(null)
  const toggle = (id: string) => setCollapsed(previous => { const next = new Set(previous); if (!next.delete(id)) next.add(id); return next })
  const visible = rows.filter((row, index) => {
    if (search.trim()) return true
    let depth = row.depth
    for (let i = index - 1; i >= 0 && depth > 0; i--) if (rows[i]!.depth < depth) {
      if (collapsed.has(rows[i]!.span.spanId)) return false
      depth = rows[i]!.depth
    }
    return true
  })
  const visibleDepths = visible.map(row => row.depth)
  const focusedId = visible.some(row => row.span.spanId === selectedId) ? selectedId : visible[0]?.span.spanId
  function focus(index: number) { container.current?.querySelectorAll<HTMLElement>('[role="treeitem"]')[index]?.focus() }
  function navigate(event: React.KeyboardEvent, index: number, hasChildren: boolean, expanded: boolean) {
    const row = visible[index]!
    if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'Enter', ' '].includes(event.key)) return
    event.preventDefault()
    if (event.key === 'ArrowDown') focus(Math.min(index + 1, visible.length - 1))
    if (event.key === 'ArrowUp') focus(Math.max(index - 1, 0))
    if (event.key === 'Home') focus(0)
    if (event.key === 'End') focus(visible.length - 1)
    if (event.key === 'Enter' || event.key === ' ') onSelect(row.span.spanId)
    if (event.key === 'ArrowRight' && hasChildren) { if (!expanded) toggle(row.span.spanId); else focus(index + 1) }
    if (event.key === 'ArrowLeft') {
      if (hasChildren && expanded && !search.trim()) toggle(row.span.spanId)
      else { const parent = visible.findIndex(item => item.span.spanId === row.span.parentSpanId); if (parent >= 0) focus(parent) }
    }
  }
  const ends = new Map<string, number>()
  const columns = SPAN_METRICS.filter(option => metrics.includes(option.key))
  const maxima = new Map(columns.map(({ key }) => [key, spanMetricMaximum(rows.map(row => row.span), key)]))
  const gridTemplateColumns = `minmax(320px, 1.5fr)${columns.length ? ` repeat(${columns.length}, minmax(144px, 1fr))` : ''}`
  for (const { span } of rows) { const scope = span.timing.scope ?? ''; ends.set(scope, Math.max(ends.get(scope) ?? 1, (span.timing.offset ?? 0) + (span.timing.inclusive ?? 0))) }
  return <section aria-label="Span columns" data-agent-span-columns="" className="min-w-0 overflow-x-auto">
    <section style={{ minWidth: 348 + columns.length * 156 }}>
    <header className="grid items-center gap-3 border-b border-l-4 border-b-[var(--kg-border)] border-l-transparent px-3 py-2 text-xs font-medium" style={{ gridTemplateColumns }}>
      <span>Span</span>{columns.map(({ key, label }) => <span key={key} data-span-metric-heading={key} className="truncate" title={label}>{label}</span>)}
    </header>
    <ul ref={container} role="tree" aria-label="Span hierarchy" className="min-w-0 py-2">
    {visible.map(({ span, depth, missingParent }, index) => {
      const tone = spanTone(span.kind), selected = selectedId === span.spanId
      const iconKey = icons[span.kind] ?? 'invocation.subject.agent', resources = span.status === 'reused' && span.historicalResources ? span.historicalResources : spanResources(span)
      const end = ends.get(span.timing.scope ?? '') ?? 1
      const sourceIndex = rows.findIndex(row => row.span.spanId === span.spanId)
      const hasChildren = (rows[sourceIndex + 1]?.depth ?? 0) > depth
      const expanded = Boolean(search.trim()) || !collapsed.has(span.spanId)
      const reported = [resources.cpuMs === null ? null : `CPU ${durationLabel(resources.cpuMs)}`,
        resources.peakMemoryBytes === null ? null : `Peak RSS ${spanMetricLabel(resources.peakMemoryBytes, 'peakMemoryBytes')}`,
        resources.costUsd === null ? null : spanMetricLabel(resources.costUsd, 'costUsd')].filter(Boolean)
      const summary = [
        span.evaluation.status !== 'unevaluated' ? `Evaluation ${span.evaluation.status}` : null,
        durationLabel(span.timing.inclusive), `exclusive observed ${numberLabel(span.timing.exclusive, ' ms')}`,
        span.status === 'reused' && span.historicalResources ? 'Original measurement' : null, ...reported,
        `Tokens: ${numberLabel(resources.tokens)}`, resources.costUsd === null ? 'Estimated USD: Unknown' : null,
        !['completed', 'passed'].includes(span.status) ? span.status : null,
        span.attempt !== null && span.attempt > 1 ? `attempt ${span.attempt}` : null,
        span.model ? `Model: ${span.model} (${span.modelIdentityBasis})` : null,
        missingParent ? 'parent outside this page' : null, depth > 8 ? `depth ${depth}` : null,
      ].filter(Boolean).join(' · ')
      return <li key={span.spanId} role="none" className="min-w-0">
        <HierarchyTreeRow depth={depth} visibleDepths={visibleDepths} index={index}
          selected={selected} focused={focusedId === span.spanId} hasChildren={hasChildren} expanded={expanded}
          label={`${span.operation} · ${span.kind} · ${span.status}${span.attempt === null ? '' : ` · attempt ${span.attempt}`}`}
          description={summary} gridTemplateColumns={gridTemplateColumns} variant="span"
          onKeyDown={event => navigate(event, index, hasChildren, expanded)}
          onClick={() => onSelect(span.spanId)}
          primary={<>
            <span className="flex w-5 shrink-0 justify-center">{hasChildren && <button type="button" tabIndex={-1}
              aria-label={`${expanded ? 'Collapse' : 'Expand'} ${span.operation}`} disabled={Boolean(search.trim())}
              onClick={event => { event.stopPropagation(); toggle(span.spanId) }} className="rounded p-0.5 hover:bg-gray-200/50">
              <span aria-hidden="true" className="inline-block w-4 text-center font-mono">{expanded ? '−' : '+'}</span>
            </button>}</span>
            <span aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border"
              style={{ background: tone.fill, color: tone.stroke, borderColor: tone.stroke }}><MainPanelTypeIcon iconKey={iconKey} className="h-5 w-5" strokeWidth={1.6} /></span>
            <span className="min-w-0" data-span-description="">
              <span className="block truncate text-sm font-medium leading-5" title={span.operation}>{span.operation}</span>
              <span className="block truncate text-xs leading-4 opacity-70" aria-label="Span resources" title={summary}>{summary}</span>
            </span>
          </>}
          columns={columns.map(({ key }) => <SpanMetricCell key={key} span={span} metric={key} maximum={maxima.get(key) ?? 0} end={end} color={tone.stroke} />)}
        />
      </li>
    })}
    </ul>
    </section>
  </section>
}

function SpanMetricCell({ span, metric, maximum, end, color }: {
  span: TraceSpan; metric: SpanMetric; maximum: number; end: number; color: string
}) {
  const value = spanMetricValue(span, metric), label = spanMetricLabel(value, metric)
  const clock = `Clock: ${span.timing.scope || 'run'} · Start offset: ${numberLabel(span.timing.offset, ' ms')}${span.timing.basis === 'observed-extent' ? ' · observed extent' : ''}`
  return <span data-span-metric={metric} data-span-metric-value={value ?? 'unknown'} className="relative min-w-0"
    title={`${label} · ${metric === 'time' ? clock : 'relative to largest loaded span measurement'}${span.status === 'reused' ? ' · original measurement' : ''}`}>
    <span className="mb-1 block truncate text-xs">{label}</span>
    {metric === 'time' ? <span data-span-timing="" className="block min-w-0" title={clock}>
      {span.timing.offset === null || span.timing.inclusive === null ? <span className="block truncate text-xs opacity-70">
        {span.kind === 'workflow' && !span.timing.scope ? 'Worktree timelines below' : span.timing.inclusive !== null ? 'Start not recorded' : 'Timestamp not recorded in source receipt'}
      </span> : <span aria-hidden="true" className="block h-2 rounded bg-gray-200"><span className="block h-2 rounded"
        style={{ background: color, marginLeft: `${span.timing.offset / end * 100}%`, width: `${span.timing.inclusive / end * 100}%` }} /></span>}
    </span> : value !== null && <span aria-hidden="true" className="block h-2 rounded bg-gray-200"><span className="block h-2 rounded"
      style={{ background: color, width: `${spanMetricPercent(value, maximum)}%` }} /></span>}
  </span>
}
