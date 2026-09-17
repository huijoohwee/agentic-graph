import * as React from 'react'
import { MainPanelTypeIcon, type MainPanelTypeIconKey } from '@/features/panels/ui/mainPanelHelpIconLibrary'
import type { visibleSpanTree } from './missionControlProjection'
import { numberLabel, spanResources, resourceLabels } from './missionControlProjection'

const tones: Record<string, { fill: string; stroke: string }> = {
  agent: { fill: '#e0e7ff', stroke: '#4f46e5' },
  model: { fill: '#ffedd5', stroke: '#c2410c' },
  tool: { fill: '#fef9c3', stroke: '#a16207' },
  retrieval: { fill: '#ccfbf1', stroke: '#0f766e' },
  check: { fill: '#e0f2fe', stroke: '#0369a1' },
}
export const spanTone = (kind: string) => tones[kind] ?? tones.agent!
export const durationLabel = (ms: number | null) => ms === null ? 'Unknown duration' : ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(2)} s`
// Semantic references reuse the Help library's component definitions and discoverability.
const icons: Record<string, MainPanelTypeIconKey> = { agent: 'invocation.subject.agent', model: 'invocation.subject.memory',
  tool: 'invocation.prefix.slash', retrieval: 'invocation.subject.research', check: 'field.type.checkbox' }
export function AgentRunSpanViews({ rows, selectedId, onSelect, search = '' }: {
  rows: ReturnType<typeof visibleSpanTree>; selectedId: string | null; onSelect: (id: string) => void; search?: string
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
  const end = Math.max(1, ...rows.map(({ span }) => (span.timing.offset ?? 0) + (span.timing.inclusive ?? 0)))
  return <ul ref={container} role="tree" aria-label="Span hierarchy" className="min-w-0 py-2">
    {visible.map(({ span, depth, missingParent }, index) => {
      const tone = spanTone(span.kind), selected = selectedId === span.spanId
      const iconKey = icons[span.kind] ?? 'invocation.subject.agent', resources = spanResources(span)
      const sourceIndex = rows.findIndex(row => row.span.spanId === span.spanId)
      const hasChildren = (rows[sourceIndex + 1]?.depth ?? 0) > depth
      const expanded = Boolean(search.trim()) || !collapsed.has(span.spanId)
      const guides = Math.min(depth, 8), width = guides * 24
      const reported = [resources.cpuMs === null ? null : `CPU ${durationLabel(resources.cpuMs)}`,
        resources.peakMemoryBytes === null ? null : `Peak RSS ${(resources.peakMemoryBytes / 1048576).toLocaleString(undefined, { maximumFractionDigits: 1 })} MiB`,
        resources.costUsd === null ? null : `Est. $${resources.costUsd.toLocaleString(undefined, { maximumFractionDigits: 6 })}`].filter(Boolean)
      return <li key={span.spanId} role="none" className="min-w-0">
        <div role="treeitem" tabIndex={focusedId === span.spanId ? 0 : -1}
          aria-label={`${span.operation} · ${span.kind} · ${span.status}${span.attempt === null ? '' : ` · attempt ${span.attempt}`}`}
          aria-selected={selected} aria-level={depth + 1} aria-expanded={hasChildren ? expanded : undefined}
          onKeyDown={event => navigate(event, index, hasChildren, expanded)}
          onClick={() => onSelect(span.spanId)}
          className="relative flex w-full min-w-0 cursor-pointer flex-wrap items-center gap-3 border-l-4 px-3 py-3 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500 sm:flex-nowrap"
          style={{ borderLeftColor: selected ? '#3b82f6' : 'transparent', background: selected ? 'color-mix(in srgb, #3b82f6 22%, var(--kg-bg, white))' : undefined }}>
          {Array.from({ length: guides }, (_, level) => {
            const last = visible.slice(index + 1).find(row => row.depth <= level + 1)?.depth !== level + 1
            const branch = level === guides - 1
            return <span key={level} aria-hidden="true" data-span-guide="" className="pointer-events-none absolute top-0 border-l"
              style={{ left: 62 + level * 24, height: branch && last ? '50%' : '100%', borderColor: '#a8a29e', opacity: branch || !last ? 1 : 0 }}>
              {branch && <span className="absolute left-0 w-3 border-b" style={{ top: last ? '100%' : '50%', borderColor: '#a8a29e' }} />}
            </span>
          })}
          {hasChildren && expanded && <span aria-hidden="true" className="pointer-events-none absolute bottom-0 h-1/2 border-l" style={{ left: 62 + guides * 24, borderColor: '#a8a29e' }} />}
          <span className="relative flex min-w-0 flex-1 basis-full items-center gap-3 sm:basis-auto" style={{ paddingLeft: width }}>
            <span className="flex w-5 shrink-0 justify-center">{hasChildren && <button type="button" tabIndex={-1}
              aria-label={`${expanded ? 'Collapse' : 'Expand'} ${span.operation}`} disabled={Boolean(search.trim())}
              onClick={event => { event.stopPropagation(); toggle(span.spanId) }} className="rounded p-0.5 hover:bg-gray-200/50">
              <span aria-hidden="true" className="inline-block w-4 text-center font-mono">{expanded ? '−' : '+'}</span>
            </button>}</span>
            <span aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border"
              style={{ background: tone.fill, color: tone.stroke, borderColor: tone.stroke }}><MainPanelTypeIcon iconKey={iconKey} className="h-5 w-5" strokeWidth={1.6} /></span>
            <span className="min-w-0"><span className="block break-words text-sm font-medium" title={span.operation}>{span.operation}</span>
              <span className="flex flex-wrap items-center gap-x-1 text-xs opacity-80">
                {span.evaluation.status !== 'unevaluated' && <span className="font-medium" style={{ color: 'var(--kg-accent, #6366f1)' }}>Evaluation {span.evaluation.status} ·</span>}
                <span>{durationLabel(span.timing.inclusive)}</span>{resources.tokens !== null && <span>· {numberLabel(resources.tokens)} tokens</span>}
                {!['completed', 'passed'].includes(span.status) && <span>· {span.status}</span>}{span.attempt !== null && span.attempt > 1 && <span>· attempt {span.attempt}</span>}
                <span>· exclusive observed {numberLabel(span.timing.exclusive, ' ms')}</span>
                {missingParent && <span>· parent outside this page</span>}{depth > 8 && <span>· depth {depth}</span>}
              </span>
              <span className="block text-xs opacity-70" aria-label="Span resources" title={Object.entries(resourceLabels(resources)).map(([label, value]) => `${label}: ${value}`).join(' · ')}>
                {reported.join(' · ')}{selected && <span className="block">{Object.entries(resourceLabels(resources)).filter(([, value]) => value === 'Unknown').map(([label]) => `${label}: Unknown`).join(' · ')}</span>}
              </span>
            </span>
          </span>
          <span data-span-timing="" className="relative w-full shrink-0 sm:w-[40%]" title={`Start offset: ${numberLabel(span.timing.offset, ' ms')}`}>
            {span.timing.offset === null || span.timing.inclusive === null ? <span className="text-xs">Position unknown</span>
              : <span aria-hidden="true" className="block h-2 rounded bg-gray-200"><span className="block h-2 rounded" style={{ background: tone.stroke,
                marginLeft: `${span.timing.offset / end * 100}%`, width: `${span.timing.inclusive / end * 100}%` }} /></span>}
          </span>
        </div>
      </li>
    })}
  </ul>
}
