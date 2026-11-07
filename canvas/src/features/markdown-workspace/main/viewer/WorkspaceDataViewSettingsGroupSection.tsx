import React from 'react'
import type { WorkspaceDataViewFloatingBinding } from './workspaceDataViewFloatingStore'
import { projectDataViewGroups } from './workspaceDataViewGroups'
import { PanelSelect } from '@/lib/ui/panelFormControls'
import { DataViewAction } from './WorkspaceDataViewSettingsActions'

export function WorkspaceDataViewSettingsGroupSection(props: Pick<WorkspaceDataViewFloatingBinding, 'columns' | 'sourceView' | 'viewConfig' | 'setViewConfig'>) {
  const config = props.viewConfig
  const groups = props.sourceView ? projectDataViewGroups(props.sourceView, config.groupByColumnId) : []
  const hidden = new Set(config.hiddenGroupIds || [])
  return <section aria-label="Group" className="space-y-2">
    <label className="block text-xs">Group by<PanelSelect className="w-full" aria-label="Group by" value={config.groupByColumnId || ''} onValueChange={value => props.setViewConfig({ ...config, v: 3, groupByColumnId: value || null, hiddenGroupIds: [] })}>
      <option value="">None</option>{props.columns.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
    </PanelSelect></label>
    <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={!!config.hideEmptyGroups} onChange={event => props.setViewConfig({ ...config, v: 3, hideEmptyGroups: event.target.checked })} />Hide empty groups after filtering</label>
    <menu className="m-0 p-0 flex gap-2" aria-label="Group visibility actions">
      <li className="list-none"><DataViewAction onClick={() => props.setViewConfig({ ...config, v: 3, hiddenGroupIds: (config.hiddenGroupIds || []).filter(id => !groups.some(group => group.key === id)) })}>Show all groups</DataViewAction></li>
      <li className="list-none"><DataViewAction onClick={() => props.setViewConfig({ ...config, v: 3, hiddenGroupIds: [...new Set([...hidden, ...groups.map(group => group.key)])] })}>Hide all groups</DataViewAction></li>
    </menu>
    <ul className="m-0 p-0 space-y-1" aria-label="Group visibility">{groups.map(group => <li key={group.key} className="list-none">
      <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={!hidden.has(group.key)} onChange={event => props.setViewConfig({ ...config, v: 3, hiddenGroupIds: event.target.checked ? [...hidden].filter(id => id !== group.key) : [...hidden, group.key] })} />{group.label}{group.value === '' ? ' (empty value)' : ''}<output className="ml-auto">{group.rows.length}</output></label>
    </li>)}</ul>
  </section>
}
