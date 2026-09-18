import React from 'react'
import { useActiveGraphRenderData } from '@/hooks/useActiveGraphData'
import { useGraphStore } from '@/hooks/useGraphStore'
import { buildDashboardCanvasModel, type DashboardCard } from './dashboardModel'
import { useDashboardWidgets, updateDashboardWidget, updateDashboardWidgets, widgetSettings, type DashboardWidgetSettings } from './dashboardWidgetConfiguration'
import type { DashboardWidgetEditorProps } from './DashboardWidgetFlip'

const control = 'w-full min-w-0 rounded border border-[var(--kg-border)] bg-[var(--kg-surface)] px-2 py-1.5 text-xs'
const button = 'rounded border border-[var(--kg-border)] px-2 py-1.5 text-xs'

export default function DashboardWidgetConfiguration(props: DashboardWidgetEditorProps & { onClose: () => void }) {
  const graph = useActiveGraphRenderData(true), schema = useGraphStore(state => state.schema)
  const config = useDashboardWidgets()
  const model = React.useMemo(() => buildDashboardCanvasModel(graph, schema), [graph, schema])
  const sources = props.template === 'metric'
    ? model.metrics.map(metric => ({ id: `graph:${metric.id}`, title: metric.label, subtitle: metric.detail, tone: metric.tone }))
    : model.sections.flatMap(section => section.cards.map(card => ({ ...card, id: `graph:${card.id}` })))
  const [selected, setSelected] = React.useState(props.widgetId ?? (props.template === 'tree' ? 'mission:tree' : ''))
  const [draft, setDraft] = React.useState<DashboardWidgetSettings>(() => props.widgetId || props.template === 'tree'
    ? { ...props.defaults, ...widgetSettings(config.document, props.widgetId ?? 'mission:tree') }
    : { kind: props.template === 'metric' ? undefined : props.template, tone: 'blue', visible: true })
  const [error, setError] = React.useState(''), [busy, setBusy] = React.useState(false)
  const cancelButton = React.useRef<HTMLButtonElement>(null)
  React.useEffect(() => { cancelButton.current?.focus({ preventScroll: true }) }, [])
  const sourceId = draft.source ?? selected
  const source = sources.find(item => item.id === sourceId)
  const existing = [...sources.map(item => item.id), ...Object.entries(config.document.widgets)
    .filter(([id, item]) => !sources.some(source => source.id === id) && sources.some(source => source.id === item.source)).map(([id]) => id)]
  const change = (value: DashboardWidgetSettings) => setDraft(current => ({ ...current, ...value }))
  const choose = (id: string) => {
    setSelected(id); setError('')
    setDraft(id ? { ...widgetSettings(config.document, id) }
      : { kind: props.template === 'metric' || props.template === 'tree' ? undefined : props.template, tone: 'blue', visible: true })
  }
  const run = async (operation: () => Promise<void>) => {
    setBusy(true); setError('')
    try { await operation(); props.onClose() } catch (failure) { setError((failure as Error).message); setBusy(false) }
  }
  return <section aria-label="Widget settings" className="h-full min-h-0 min-w-0 overflow-y-auto overscroll-contain space-y-3 rounded-lg border border-[var(--kg-border)] bg-[var(--kg-panel-bg)] p-4 shadow-sm"
    onKeyDown={event => { if (event.key === 'Escape' && !busy) { event.preventDefault(); props.onClose() } }}
    >
    {props.configuration}
    <form aria-label="Widget configuration" className="space-y-3" onSubmit={event => {
      event.preventDefault()
      if (props.template !== 'tree' && !source) { setError('Choose a data source.'); return }
      const id = selected || `graph:widget-${crypto.randomUUID()}`
      const settings = Object.fromEntries(Object.entries({ ...draft, ...(props.template === 'tree' ? {} : { source: sourceId }),
        title: draft.title ?? source?.title ?? props.title, subtitle: draft.subtitle ?? source?.subtitle ?? (props.template === 'tree' ? 'Agent Mission · selected run' : ''),
        visible: draft.visible !== false }).filter(([, value]) => value !== undefined))
      void run(() => updateDashboardWidget(id, settings))
    }}>
    <header className="flex items-center justify-between gap-2"><h4 className="text-sm font-semibold">Configure {props.title}</h4><button ref={cancelButton} type="button" className={button} disabled={busy} onClick={props.onClose}>Cancel</button></header>
    {!props.widgetId && props.template !== 'tree' && <label className="block text-xs">Widget<select aria-label="Widget" className={control} value={selected} onChange={event => choose(event.target.value)}>
      <option value="">New widget</option>{existing.map(id => <option key={id} value={id}>{widgetSettings(config.document, id).title ?? sources.find(source => source.id === (widgetSettings(config.document, id).source ?? id))?.title ?? id}{widgetSettings(config.document, id).visible === false ? ' (hidden)' : ''}</option>)}
    </select></label>}
    {props.template !== 'tree' && <label className="block text-xs">Data source<select aria-label="Data source" className={control} value={sourceId} required onChange={event => change({ source: event.target.value })}>
      <option value="">Choose a data source</option>{sources.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}
    </select></label>}
    <label className="block text-xs">Title<input className={control} maxLength={256} value={draft.title ?? source?.title ?? props.title} onChange={event => change({ title: event.target.value })} /></label>
    <label className="block text-xs">Description<input className={control} maxLength={256} value={draft.subtitle ?? source?.subtitle ?? (props.template === 'tree' ? 'Agent Mission · selected run' : '')} onChange={event => change({ subtitle: event.target.value })} /></label>
    {props.template !== 'metric' && <label className="block text-xs">Note<textarea className={control} maxLength={256} value={draft.footnote ?? ''} onChange={event => change({ footnote: event.target.value })} /></label>}
    {props.template !== 'metric' && props.template !== 'tree' && <label className="block text-xs">Display<select aria-label="Display" className={control} value={draft.kind ?? (source as DashboardCard)?.kind ?? props.template} onChange={event => change({ kind: event.target.value as DashboardCard['kind'] })}>
      {['bar', 'line', 'area', 'table'].map(kind => <option key={kind}>{kind}</option>)}
    </select></label>}
    <label className="block text-xs">Color<select aria-label="Color" className={control} value={draft.tone ?? source?.tone ?? 'blue'} onChange={event => change({ tone: event.target.value as DashboardCard['tone'] })}>
      {['blue', 'green', 'amber', 'rose', 'slate'].map(tone => <option key={tone}>{tone}</option>)}
    </select></label>
    {props.template !== 'tree' && <label className="block text-xs">Order<input className={control} type="number" min={-10000} max={10000} step={1} value={draft.order ?? 0} onChange={event => change({ order: Number(event.target.value) })} /></label>}
    <label className="flex gap-2 text-xs"><input type="checkbox" checked={draft.visible !== false} onChange={event => change({ visible: event.target.checked })} />Show on canvas</label>
    {(error || config.error) && <p role="alert" className="text-xs">{error || config.error}</p>}
    <footer className="flex flex-wrap gap-2"><button type="submit" className={button} disabled={busy || !config.ready}>{selected ? 'Save widget' : 'Add widget'}</button>
      {selected && <button type="button" className={button} disabled={busy || !config.ready} onClick={() => { void run(() => selected !== 'mission:tree' && !sources.some(source => source.id === selected)
        ? updateDashboardWidgets({ [selected]: null }) : updateDashboardWidget(selected, { visible: false })) }}>Remove widget</button>}
    </footer>
  </form></section>
}
