import React from 'react'
import { useActiveGraphRenderData } from '@/hooks/useActiveGraphData'
import { useGraphStore } from '@/hooks/useGraphStore'
import { buildDashboardCanvasModel, type DashboardCard } from './dashboardModel'
import { DASHBOARD_WIDGETS_PATH, useDashboardWidgets, updateDashboardWidget, updateDashboardWidgets, widgetSettings } from './dashboardWidgetConfiguration'
import { AGENT_RUN_CANVAS_VIEWS } from '@/lib/canvas/canvasViewInvocationContract.mjs'

const control = 'w-full min-w-0 rounded border bg-transparent p-2 text-xs'
/** The existing FloatingPanel Props surface owns both graph and Mission widgets. */
export default function DashboardPropsPanel() {
  const data = useActiveGraphRenderData(true), schema = useGraphStore(state => state.schema)
  const model = React.useMemo(() => buildDashboardCanvasModel(data, schema), [data, schema])
  const config = useDashboardWidgets(), [selected, setSelected] = React.useState('mission:tree'), [addition, setAddition] = React.useState('')
  const templates = [
    ...Object.entries(AGENT_RUN_CANVAS_VIEWS).map(([id, label]) => ({ id: `mission:${id}`, title: String(label), subtitle: 'Selected run', kind: undefined as DashboardCard['kind'] | undefined })),
    ...model.metrics.map(item => ({ id: `graph:${item.id}`, title: item.label, subtitle: item.detail, kind: undefined as DashboardCard['kind'] | undefined })),
    ...model.sections.flatMap(section => section.cards.map(item => ({ id: `graph:${item.id}`, title: item.title, subtitle: item.subtitle, kind: item.kind }))),
  ]
  const catalog = [...templates, ...Object.entries(config.document.widgets).flatMap(([id, settings]) => { const source = templates.find(item => item.id === settings.source); return source ? [{ ...source, id }] : [] })]
  const present = catalog.filter(item => widgetSettings(config.document, item.id).visible !== false)
  const available = catalog.filter(item => widgetSettings(config.document, item.id).visible === false)
  const item = present.find(item => item.id === selected) ?? present[0], settings = item ? widgetSettings(config.document, item.id) : {}
  const update = (patch: Parameters<typeof updateDashboardWidget>[1]) => { if (item) void updateDashboardWidget(item.id, patch).catch(() => undefined) }
  return <section aria-label="Dashboard widgets" className="space-y-3 p-3 text-xs">
    <h3 className="font-semibold">Dashboard widgets</h3>
    <p>Add a widget from a graph data source, or choose an existing widget to configure.</p>
    <label className="grid gap-1">Widget<select className={control} aria-label="Dashboard widget" value={item?.id ?? ''} onChange={event => setSelected(event.target.value)}>
      {!present.length && <option value="">No widgets</option>}{present.map(entry => <option key={entry.id} value={entry.id}>{entry.id.startsWith('mission:') ? 'Agent Mission' : 'Graph'} · {widgetSettings(config.document, entry.id).title ?? entry.title}</option>)}
    </select></label>
    {item && <form key={`${item.id}:${JSON.stringify(settings)}`} className="space-y-2" onSubmit={event => {
      event.preventDefault(); const form = new FormData(event.currentTarget)
      update({ title: String(form.get('title')).trim(), subtitle: String(form.get('subtitle')).trim(), footnote: String(form.get('footnote')).trim(),
        tone: String(form.get('tone')) as DashboardCard['tone'], order: Number(form.get('order')), ...(item.kind ? { kind: String(form.get('kind')) as DashboardCard['kind'] } : {}) })
    }}>
      <label className="grid gap-1">Title<input className={control} name="title" maxLength={256} defaultValue={settings.title ?? item.title} /></label>
      <label className="grid gap-1">Description<input className={control} name="subtitle" maxLength={256} defaultValue={settings.subtitle ?? item.subtitle} /></label>
      <label className="grid gap-1">Note<input className={control} name="footnote" maxLength={256} defaultValue={settings.footnote ?? ''} /></label>
      <label className="grid gap-1">Color<select className={control} name="tone" defaultValue={settings.tone ?? 'blue'}>{['blue', 'green', 'amber', 'rose', 'slate'].map(value => <option key={value}>{value}</option>)}</select></label>
      {item.kind && <label className="grid gap-1">Display<select name="kind" className={control} defaultValue={settings.kind ?? item.kind}>{['bar', 'line', 'area', 'table'].map(value => <option key={value}>{value}</option>)}</select></label>}
      <label className="grid gap-1">Order<input className={control} name="order" type="number" min={-10000} max={10000} step={1} defaultValue={settings.order ?? 0} /></label>
      <div className="flex gap-2"><button className="rounded border px-3 py-2" disabled={!config.ready || !!config.error}>Save widget</button><button type="button" className="rounded border px-3 py-2" onClick={() => { if (settings.source && item) void updateDashboardWidgets({ [item.id]: null }).catch(() => undefined); else update({ visible: false }) }}>Remove widget</button></div>
    </form>}
    <label className="grid gap-1">Add widget<select className={control} aria-label="Add Dashboard widget" value={addition} onChange={event => setAddition(event.target.value)}><option value="">Choose a data source</option>{templates.filter(entry => entry.id.startsWith('graph:')).map(entry => <option key={`new:${entry.id}`} value={`new:${entry.id}`}>New · {entry.title}</option>)}{available.map(entry => <option key={entry.id} value={entry.id}>{entry.title}</option>)}</select></label>
    <button className="rounded border px-3 py-2" disabled={!addition || !!config.error} onClick={() => { const source = templates.find(item => `new:${item.id}` === addition); const id = source ? `graph:widget-${crypto.randomUUID()}` : addition; void updateDashboardWidget(id, source ? { source: source.id, title: source.title, subtitle: source.subtitle, visible: true } : { visible: true }).then(() => { setSelected(id); setAddition('') }).catch(() => undefined) }}>Add widget</button>
    <p className="break-all">Source Files · {DASHBOARD_WIDGETS_PATH}</p>
    <p>Settings save to this browser workspace. Source Files provides the existing upload and sharing controls.</p>
    {config.error && <p role="alert">{config.error}</p>}
  </section>
}
