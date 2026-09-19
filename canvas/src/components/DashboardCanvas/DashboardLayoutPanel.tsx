import React from 'react'
import { useDashboardSource } from './useDashboardSource'
import { useGraphStore } from '@/hooks/useGraphStore'
import { buildDashboardCanvasModel } from './dashboardModel'
import { authoredDashboardWidgets, configureDashboardCards, configureDashboardMetrics, useDashboardWidgets, updateDashboardWidgets } from './dashboardWidgetConfiguration'
import DashboardWidgetCommandPanel from './DashboardWidgetCommandPanel'
import { dashboardWidgetRows } from './dashboardWidgetLayout'

/** Props and drag both edit the one saved row/column document. */
export default function DashboardLayoutPanel() {
  const config = useDashboardWidgets(), { graphData } = useDashboardSource(true), schema = useGraphStore(state => state.schema)
  const model = React.useMemo(() => buildDashboardCanvasModel(graphData, schema), [graphData, schema])
  const authored = authoredDashboardWidgets(config.document, [...model.metrics.map(item => `graph:${item.id}`), ...model.sections.flatMap(section => section.cards.map(item => `graph:${item.id}`))])
  const contained = new Set(authored.flatMap(([, item]) => item.template === 'container' ? item.children ?? [] : []))
  const boards = [
    { id: 'mission', title: 'Mission', ids: ['mission:codebase', 'mission:tree'], columns: 1 },
    { id: 'dashboard-metrics', title: 'Metrics', ids: configureDashboardMetrics(config.document, model.metrics).map(item => `graph:${item.id}`), columns: 5 },
    ...model.sections.map(section => ({ id: section.id, title: section.title,
      ids: configureDashboardCards(config.document, section.cards, model.sections.flatMap(item => item.cards)).map(item => `graph:${item.id}`), columns: 3 })),
    ...authored.filter(([, value]) => value.template === 'container').map(([id, value]) => ({ id: id.startsWith('graph:container-') ? id.slice(16) : id.slice(6), title: value.title ?? id, ids: value.children ?? [], columns: value.columns ?? 2 })),
    { id: 'authored', title: 'Added widgets', ids: authored.filter(([id, value]) => !contained.has(id) && !['tree', 'codebase', 'container'].includes(value.template!)).map(([id]) => id), columns: 1 },
  ]
  const [selected, setSelected] = React.useState('mission'), [columns, setColumns] = React.useState(2), [message, setMessage] = React.useState('')
  const board = boards.find(item => item.id === selected) ?? boards[0]
  const rows = dashboardWidgetRows(config.document.boards?.[board.id], board.ids, board.columns)
  return <details className="rounded border border-[var(--kg-border)] p-3" open>
    <summary className="text-sm font-semibold">Rows and columns</summary>
    <p className="my-2 text-xs">Apply columns here or drag beside a card. Both save the same layout.</p>
    <label className="block text-xs">Container<select aria-label="Layout container" className="my-1 w-full rounded border bg-[var(--kg-surface)] p-2" value={selected} onChange={event => setSelected(event.target.value)}>{boards.filter((item, index) => boards.findIndex(other => other.id === item.id) === index).map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>
    <label className="block text-xs">Columns<input aria-label="Layout columns" type="number" min={1} max={12} className="my-1 w-full rounded border bg-[var(--kg-surface)] p-2" value={columns} onChange={event => setColumns(Number(event.target.value))} /></label>
    <p className="text-xs">{rows.length} rows · {rows.flat().length} widgets</p>
    <button type="button" className="my-2 rounded border px-3 py-2 text-xs" disabled={!config.ready || !Number.isInteger(columns) || columns < 1 || columns > 12} onClick={() => {
      const ids = rows.flat(), next: string[][] = []
      for (let i = 0; i < ids.length; i += columns) next.push(ids.slice(i, i + columns))
      void updateDashboardWidgets({}, { [board.id]: next }).then(() => setMessage('Layout saved.')).catch(error => setMessage(error.message))
    }}>Apply columns</button>
    <DashboardWidgetCommandPanel />
    {message && <p role="status" className="text-xs">{message}</p>}
  </details>
}
