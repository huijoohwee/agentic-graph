import React from 'react'
import type { MarkdownDataView, MarkdownDataViewColumn } from '@/features/markdown/ui/markdownDataViewModel'
import { PanelSelect } from '@/lib/ui/panelFormControls'
import type { WorkspaceDataViewConfig, WorkspaceDataViewSortRule } from './workspaceDataViewConfig'
import { DataViewAction } from './WorkspaceDataViewSettingsActions'
import { dataViewId, FILTER_LIMITS } from './workspaceDataViewFilterTree'
import { applyWorkspaceDataViewQuery } from './workspaceDataViewQuery'

export function WorkspaceDataViewSettingsSortSection(props: {
  columns: readonly MarkdownDataViewColumn[]; view: WorkspaceDataViewConfig; sourceView?: MarkdownDataView; onChangeView: (next: WorkspaceDataViewConfig) => void
}) {
  const legacy = props.view.sortSemantics !== 'typed'
  const [preview, setPreview] = React.useState(false)
  const convert = (): WorkspaceDataViewConfig => ({ ...props.view, v: 3, sortSemantics: 'typed', sortRules: props.view.sortRules.map((rule, index) => ({ ...rule, enabled: index === 0 })) })
  const commit = (sortRules: WorkspaceDataViewSortRule[]) => props.onChangeView({ ...props.view, v: 3, sortRules })
  const change = (id: string, patch: Partial<WorkspaceDataViewSortRule>) => commit(props.view.sortRules.map(rule => rule.id === id ? { ...rule, ...patch } : rule))
  const move = (index: number, offset: number) => {
    const rules = [...props.view.sortRules], destination = index + offset
    if (destination < 0 || destination >= rules.length) return
    const [rule] = rules.splice(index, 1); rules.splice(destination, 0, rule); commit(rules)
  }
  const nextPreview = preview && props.sourceView ? applyWorkspaceDataViewQuery({ view: props.sourceView, viewConfig: convert(), state: { searchQuery: '', visibleGroups: null, sortMode: 'none' } }) : null
  return <section aria-label="Sort" className="space-y-2">
    {legacy && props.view.sortRules.length > 0 && <aside className="rounded border p-2 space-y-2" aria-label="Legacy sort compatibility">
      <p className="text-xs">Existing order uses the first field and text comparison. Other saved fields remain inactive. Typed sorting puts empty values last and compares numbers and dates by value.</p>
      {!preview ? <DataViewAction onClick={() => setPreview(true)}>Preview typed sorting</DataViewAction> : <>
        <p className="text-xs">Proposed first records: {nextPreview?.rows.slice(0, 5).map(row => row.cells[nextPreview.columns.findIndex(c => c.id === nextPreview.titleColumnId)] || row.id).join(' · ') || 'No records'}</p>
        <DataViewAction onClick={() => { props.onChangeView(convert()); setPreview(false) }}>Use typed sorting</DataViewAction>
        <DataViewAction onClick={() => setPreview(false)}>Keep existing order</DataViewAction>
      </>}
    </aside>}
    <ol className="m-0 p-0 space-y-2" aria-label="Sort precedence">
      {props.view.sortRules.map((rule, index) => <li key={rule.id} className="list-none rounded border p-2 space-y-2">
        <label className="block text-xs">{index + 1}. Property<PanelSelect aria-label={`Sort property ${index + 1}`} className="w-full" value={rule.columnId} onValueChange={columnId => change(rule.id, { columnId })}>
          {!props.columns.some(c => c.id === rule.columnId) && <option value={rule.columnId}>Missing property (inactive)</option>}
          {props.columns.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </PanelSelect></label>
        <label className="block text-xs">Direction<PanelSelect aria-label={`Sort direction ${index + 1}`} className="w-full" value={rule.direction} onValueChange={direction => change(rule.id, { direction: direction === 'desc' ? 'desc' : 'asc' })}><option value="asc">Ascending</option><option value="desc">Descending</option></PanelSelect></label>
        {legacy ? index > 0 && <p className="text-xs">Inactive legacy sort field</p> : <label className="flex gap-2 text-xs"><input type="checkbox" checked={rule.enabled !== false} onChange={event => change(rule.id, { enabled: event.target.checked })} />Use this field</label>}
        <menu className="m-0 p-0 flex flex-wrap gap-1" aria-label={`Sort actions ${index + 1}`}>
          <li className="list-none"><DataViewAction disabled={!index} onClick={() => move(index, -1)}>Move up</DataViewAction></li>
          <li className="list-none"><DataViewAction disabled={index === props.view.sortRules.length - 1} onClick={() => move(index, 1)}>Move down</DataViewAction></li>
          <li className="list-none"><DataViewAction onClick={() => commit(props.view.sortRules.filter(r => r.id !== rule.id))}>Remove sort</DataViewAction></li>
        </menu>
      </li>)}
    </ol>
    <DataViewAction disabled={!props.columns.length || props.view.sortRules.length >= FILTER_LIMITS.sorts} onClick={() => {
      const next = { ...props.view, v: 3 as const, sortSemantics: props.view.sortRules.length ? props.view.sortSemantics : 'typed' as const,
        sortRules: [...props.view.sortRules, { id: dataViewId(), columnId: props.columns[0].id, direction: 'asc' as const }] }
      props.onChangeView(next)
    }}>Add sort</DataViewAction>
    <DataViewAction disabled={!props.view.sortRules.length} onClick={() => commit([])}>Clear sorting</DataViewAction>
  </section>
}
