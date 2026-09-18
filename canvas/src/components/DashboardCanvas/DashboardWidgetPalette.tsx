import React from 'react'
import { useActiveGraphRenderData } from '@/hooks/useActiveGraphData'
import { useGraphStore } from '@/hooks/useGraphStore'
import { DashboardCardView, DashboardMetricTile } from './DashboardWidgets'
import { buildDashboardCanvasModel, type DashboardCard, type DashboardMetric } from './dashboardModel'
import { useDashboardWidgets, updateDashboardWidget, updateDashboardWidgets, configureDashboardCards, configureDashboardMetrics, widgetSettings } from './dashboardWidgetConfiguration'
import { useAgentRunInspection, selectAgentRunInspection } from '@/features/agent-ready/agentRunInspectionStore'
import { AgentRunSpanViews } from '@/features/agent-ready/AgentRunSpanViews'
import { visibleSpanTree } from '@/features/agent-ready/missionControlProjection'
import { DASHBOARD_WIDGET_DRAG_TYPE, addDashboardWidget } from './dashboardWidgetPaletteActions'

/** Entries for the existing Props Widget palette, with the same cards used on Canvas. */
export default function DashboardWidgetPalette() {
  const graph = useActiveGraphRenderData(true), schema = useGraphStore(state => state.schema), inspection = useAgentRunInspection()
  const config = useDashboardWidgets(), model = React.useMemo(() => buildDashboardCanvasModel(graph, schema), [graph, schema])
  const all = { ...config.document, widgets: Object.fromEntries(Object.entries(config.document.widgets).map(([id, value]) => [id, { ...value, visible: true }])) }
  const cards = configureDashboardCards(all, model.sections.flatMap(section => section.cards)), metrics = configureDashboardMetrics(all, model.metrics)
  const entries: { id: string; title: string; card?: DashboardCard; metric?: DashboardMetric; mission?: string }[] = [
    { id: 'mission:tree', title: 'Span tree', mission: 'tree' },
    ...metrics.map(metric => ({ id: `graph:${metric.id}`, title: metric.label, metric })),
    ...cards.map(card => ({ id: `graph:${card.id}`, title: card.title, card })),
  ]
  return <>
    {config.error && <li role="alert" className="p-2 text-xs">{config.error}</li>}
    {entries.map(entry => {
      const settings = widgetSettings(config.document, entry.id), present = settings.visible !== false
      const update = (value: Parameters<typeof updateDashboardWidget>[1]) => { void updateDashboardWidget(entry.id, value).catch(() => undefined) }
      const card: DashboardCard = entry.card ?? { id: entry.id, title: settings.title ?? entry.title, subtitle: settings.subtitle ?? 'Selected run', footnote: settings.footnote, kind: 'table', tone: settings.tone ?? 'blue', series: [], rows: [] }
      return <li key={entry.id} aria-label={`Widget ${entry.id}`} className="min-w-0 rounded-md border border-[var(--kg-border)] p-2" draggable onDragStart={event => {
        event.dataTransfer.setData(DASHBOARD_WIDGET_DRAG_TYPE, settings.source ?? entry.id); event.dataTransfer.effectAllowed = 'copy'
      }}>
        <p className="mb-2 text-xs">{entry.mission ? 'Agent Mission' : 'Dashboard'} · {present ? 'On canvas' : 'Available'}</p>
        {entry.metric ? <DashboardMetricTile metric={entry.metric} canEdit onCommitMetricLabel={(_id, title) => update({ title })} onCommitMetricDetail={(_id, subtitle) => update({ subtitle })} />
          : <DashboardCardView card={card} canEditCardText onCommitCardText={(_id, field, value) => update({ [field]: value })}>
            {entry.mission ? <div className="max-h-44 overflow-auto text-xs">{entry.mission === 'tree' && inspection
              ? <AgentRunSpanViews rows={visibleSpanTree(inspection.trace.spans, '').slice(0, 8)} selectedId={inspection.spanId} onSelect={selectAgentRunInspection} />
              : <p>{inspection ? `${inspection.trace.spans.length} retained spans · ${inspection.trace.status}` : 'Select or import a run to preview this widget.'}</p>}</div> : undefined}
          </DashboardCardView>}
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
          <button className="rounded border px-2 py-1" onClick={() => { void (present ? addDashboardWidget(settings.source ?? entry.id) : updateDashboardWidget(entry.id, { visible: true })).catch(() => undefined) }}>{present && !entry.mission ? 'Add widget' : 'Show widget'}</button>
          {present && <button className="rounded border px-2 py-1" onClick={() => { void (settings.source ? updateDashboardWidgets({ [entry.id]: null }) : updateDashboardWidget(entry.id, { visible: false })).catch(() => undefined) }}>Remove widget</button>}
          {entry.card && <label>Display <select aria-label={`Display ${entry.id}`} value={entry.card.kind} onChange={event => update({ kind: event.target.value as DashboardCard['kind'] })}>{['bar', 'line', 'area', 'table'].map(kind => <option key={kind}>{kind}</option>)}</select></label>}
          <label>Color <select aria-label={`Color ${entry.id}`} value={settings.tone ?? entry.card?.tone ?? entry.metric?.tone ?? 'blue'} onChange={event => update({ tone: event.target.value as DashboardCard['tone'] })}>{['blue', 'green', 'amber', 'rose', 'slate'].map(tone => <option key={tone}>{tone}</option>)}</select></label>
          <button aria-label={`Move ${entry.id} earlier`} className="rounded border px-2 py-1" onClick={() => update({ order: Math.max(-10000, (settings.order ?? 0) - 1) })}>↑</button>
          <button aria-label={`Move ${entry.id} later`} className="rounded border px-2 py-1" onClick={() => update({ order: Math.min(10000, (settings.order ?? 0) + 1) })}>↓</button>
        </div>
      </li>
    })}
  </>
}
