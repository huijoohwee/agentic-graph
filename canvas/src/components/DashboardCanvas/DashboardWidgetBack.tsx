import React from 'react'
import { useDashboardSource } from './useDashboardSource'
import { useGraphStore } from '@/hooks/useGraphStore'
import { buildDashboardCanvasModel, type DashboardCard } from './dashboardModel'
import { authoredDashboardWidgets, useDashboardWidgets, updateDashboardWidget, updateDashboardWidgets, widgetSettings, type DashboardWidgetSettings } from './dashboardWidgetConfiguration'
import { dashboardTableMarkdown, DashboardMarkdown } from './DashboardMarkdown'
import type { DashboardWidgetEditorProps } from './DashboardWidgetFlip'

const control = 'w-full min-w-0 rounded border border-[var(--kg-border)] bg-[var(--kg-surface)] px-2 py-1.5 text-xs'
const button = 'rounded border border-[var(--kg-border)] px-2 py-1.5 text-xs'

export default function DashboardWidgetConfiguration(props: DashboardWidgetEditorProps & { onClose: () => void }) {
  const { graphData: graph } = useDashboardSource(true), schema = useGraphStore(state => state.schema)
  const config = useDashboardWidgets()
  const model = React.useMemo(() => buildDashboardCanvasModel(graph, schema), [graph, schema])
  const structural = ['heading', 'text', 'divider', 'container', 'disclosure'].includes(props.template)
  const dataSources = props.template === 'metric'
    ? model.metrics.map(metric => ({ id: `graph:${metric.id}`, title: metric.label, subtitle: metric.detail, tone: metric.tone }))
    : model.sections.flatMap(section => section.cards.map(card => ({ ...card, id: `graph:${card.id}` })))
  const sources = structural ? (props.template === 'container' ? model.sections.map(section => ({ id: `graph:container-${section.id}`, title: section.title, subtitle: section.cadence, tone: 'slate' })) : props.template === 'heading' ? [{ id: 'graph:header', title: model.title, subtitle: model.subtitle, tone: 'slate' }] : []) : dataSources
  const missionId = props.template === 'tree' ? 'mission:tree' : props.template === 'codebase' ? 'mission:codebase' : null
  const chartKind: DashboardCard['kind'] | undefined = ['bar', 'line', 'area', 'table'].includes(props.template) ? props.template as DashboardCard['kind'] : undefined
  const missionDescription = props.template === 'codebase' ? 'Retained native snapshot · read only' : 'Agent Mission · selected run'
  const [selected, setSelected] = React.useState(props.widgetId ?? missionId ?? '')
  const [draft, setDraft] = React.useState<DashboardWidgetSettings>(() => props.widgetId || missionId
    ? { ...props.defaults, ...widgetSettings(config.document, props.widgetId ?? missionId!) }
    : { kind: chartKind, tone: 'blue', visible: true })
  const [error, setError] = React.useState(''), [busy, setBusy] = React.useState(false)
  const cancelButton = React.useRef<HTMLButtonElement>(null)
  React.useEffect(() => { cancelButton.current?.focus({ preventScroll: true }) }, [])
  const sourceId = draft.source ?? selected
  const source = sources.find(item => item.id === sourceId)
  const existing = [...sources.map(item => item.id), ...Object.entries(config.document.widgets)
    .filter(([id, item]) => !sources.some(source => source.id === id) && (structural ? item.template === props.template : sources.some(source => source.id === item.source))).map(([id]) => id)]
  const change = (value: DashboardWidgetSettings) => setDraft(current => ({ ...current, ...value }))
  const choose = (id: string) => {
    setSelected(id); setError('')
    setDraft(id ? { ...widgetSettings(config.document, id) }
      : { kind: chartKind, tone: 'blue', visible: true })
  }
  const run = async (operation: () => Promise<void>) => {
    setBusy(true); setError('')
    try { await operation(); props.onClose() } catch (failure) { setError((failure as Error).message); setBusy(false) }
  }
  return <section aria-label="Widget settings" className="h-full min-h-0 min-w-0 overflow-y-auto overscroll-contain space-y-3 rounded-lg border border-[var(--kg-border)] bg-[var(--kg-panel-bg)] p-4 shadow-sm"
    onKeyDown={event => { if (event.key === 'Escape' && !busy) { event.preventDefault(); props.onClose() } }}
    >
    <header className="flex items-center justify-between gap-2"><h4 className="text-sm font-semibold">Configure {props.title}</h4><button ref={cancelButton} type="button" className={button} disabled={busy} onClick={props.onClose}>Cancel</button></header>
    {props.configuration}
    <form aria-label="Widget configuration" className="space-y-3" onSubmit={event => {
      event.preventDefault()
      if (!missionId && !structural && !source) { setError('Choose a data source.'); return }
      const id = selected || `graph:widget-${crypto.randomUUID()}`
      const settings = Object.fromEntries(Object.entries({ ...draft, template: props.template, ...(missionId || structural ? {} : { source: sourceId }),
        title: draft.title ?? source?.title ?? props.title, subtitle: draft.subtitle ?? source?.subtitle ?? (missionId ? missionDescription : ''),
        visible: draft.visible !== false }).filter(([, value]) => value !== undefined))
      void run(() => {
        if (structural && props.template === 'container' && draft.columns) {
          const boardId = id.startsWith('graph:container-') ? id.slice(16) : id.slice(6)
          const ids = config.document.boards?.[boardId]?.flat() ?? draft.children ?? [], rows: string[][] = []
          for (let index = 0; index < ids.length; index += draft.columns) rows.push(ids.slice(index, index + draft.columns))
          return updateDashboardWidgets({ [id]: settings }, { [boardId]: rows })
        }
        return updateDashboardWidget(id, settings)
      })
    }}>

    {!props.widgetId && !missionId && <label className="block text-xs">Widget<select aria-label="Widget" className={control} value={selected} onChange={event => choose(event.target.value)}>
      <option value="">New widget</option>{existing.map(id => <option key={id} value={id}>{widgetSettings(config.document, id).title ?? sources.find(source => source.id === (widgetSettings(config.document, id).source ?? id))?.title ?? id}{widgetSettings(config.document, id).visible === false ? ' (hidden)' : ''}</option>)}
    </select></label>}
    {!missionId && !structural && <label className="block text-xs">Data source<select aria-label="Data source" className={control} value={sourceId} required onChange={event => change({ source: event.target.value })}>
      <option value="">Choose a data source</option>{sources.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}
    </select></label>}
    <label className="block text-xs">Title<input className={control} maxLength={256} value={draft.title ?? source?.title ?? props.title} onChange={event => change({ title: event.target.value })} /></label>
    <label className="block text-xs">Description<input className={control} maxLength={256} value={draft.subtitle ?? source?.subtitle ?? (missionId ? missionDescription : '')} onChange={event => change({ subtitle: event.target.value })} /></label>
    {props.template !== 'metric' && <label className="block text-xs">Note<textarea className={control} maxLength={256} value={draft.footnote ?? ''} onChange={event => change({ footnote: event.target.value })} /></label>}
    {props.template !== 'metric' && !missionId && !structural && <label className="block text-xs">Display<select aria-label="Display" className={control} value={draft.kind ?? (source as DashboardCard)?.kind ?? props.template} onChange={event => change({ kind: event.target.value as DashboardCard['kind'] })}>
      {['bar', 'line', 'area', 'table'].map(kind => <option key={kind}>{kind}</option>)}
    </select></label>}
    {(structural || props.template === 'table') && <section aria-label="Widget Markdown editor" className="rounded border p-2">
      <p className="mb-2 text-xs">Markdown · click a block to edit; click outside to return to View.</p>
      <DashboardMarkdown label="Widget Markdown" text={draft.markdown ?? (props.template === 'table' && source && 'rows' in source ? dashboardTableMarkdown(source as DashboardCard) : selected === 'graph:header' ? `Dashboard\n\n## ${model.title}\n\n${model.subtitle}` : props.template === 'heading' ? '## Heading' : props.template === 'divider' ? '---' : 'Write Markdown here.')}
        onChange={markdown => change({ markdown })} />
    </section>}
    {props.template === 'container' && <><label className="block text-xs">Columns<input aria-label="Container columns" className={control} type="number" min={1} max={12} value={draft.columns ?? 2} onChange={event => change({ columns: Number(event.target.value) })} /></label>
      <fieldset className="space-y-1 text-xs"><legend>Contained widgets</legend>{authoredDashboardWidgets(config.document, model.sections.flatMap(section => section.cards.map(item => `graph:${item.id}`))).filter(([id, item]) => id !== selected && item.template !== 'container').map(([id, item]) => <label key={id} className="flex gap-2"><input type="checkbox" checked={draft.children?.includes(id) ?? false} onChange={event => change({ children: event.target.checked ? [...(draft.children ?? []), id] : (draft.children ?? []).filter(child => child !== id) })} />{item.title ?? id}</label>)}</fieldset></>}
    <label className="block text-xs">Aspect ratio<select aria-label="Widget aspect ratio" className={control} value={draft.aspectRatio ?? '16:9'} onChange={event => change({ aspectRatio: event.target.value as DashboardWidgetSettings['aspectRatio'] })}>
      <option value="16:9">16:9 (Default)</option><option value="9:16">9:16</option><option value="custom">Custom · drag to resize</option>
    </select></label>
    {draft.aspectRatio === 'custom' && <section className="grid grid-cols-2 gap-2">{(['width', 'height'] as const).map(key => <label key={key} className="text-xs">{key}<input aria-label={`Widget ${key}`} className={control} type="number" min={120} max={4096} value={draft[key] ?? (key === 'width' ? 640 : 360)} onChange={event => change({ [key]: Number(event.target.value) })} /></label>)}</section>}
    <label className="block text-xs">Card color<select aria-label="Color" className={control} value={draft.tone ?? source?.tone ?? 'blue'} onChange={event => change({ tone: event.target.value as DashboardCard['tone'] })}>
      {['blue', 'green', 'amber', 'rose', 'slate'].map(tone => <option key={tone}>{tone}</option>)}
    </select></label>
    {!missionId && <label className="block text-xs">Order<input className={control} type="number" min={-10000} max={10000} step={1} value={draft.order ?? 0} onChange={event => change({ order: Number(event.target.value) })} /></label>}
    <label className="flex gap-2 text-xs"><input type="checkbox" checked={draft.expanded !== false} onChange={event => change({ expanded: event.target.checked })} />Expanded</label>
    <label className="flex gap-2 text-xs"><input type="checkbox" checked={draft.visible !== false} onChange={event => change({ visible: event.target.checked })} />Show on canvas</label>
    {(error || config.error) && <p role="alert" className="text-xs">{error || config.error}</p>}
    <footer className="flex flex-wrap gap-2"><button type="submit" className={button} disabled={busy || !config.ready}>{selected ? 'Save widget' : 'Add widget'}</button>
      {selected && <button type="button" className={button} disabled={busy || !config.ready} onClick={() => { void run(() => !missionId && !sources.some(source => source.id === selected)
        ? updateDashboardWidgets({ [selected]: null }) : updateDashboardWidget(selected, { visible: false })) }}>Remove widget</button>}
    </footer>
  </form></section>
}
