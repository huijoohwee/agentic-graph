import React from 'react'
import { PanelSelect } from '@/lib/ui/panelFormControls'
import type { WorkspaceDataViewFloatingBinding } from './workspaceDataViewFloatingStore'
import { deleteWorkspaceDataViewFromState, duplicateWorkspaceDataViewInState, getWorkspaceDataViewActiveView, readWorkspaceDataViewStateWithMeta, writeWorkspaceDataViewState, type WorkspaceDataViewState } from './workspaceDataViewConfig'
import { DataViewAction } from './WorkspaceDataViewSettingsActions'

export function WorkspaceDataViewSettingsLifecycle(props: Pick<WorkspaceDataViewFloatingBinding, 'viewConfig' | 'setViewConfig' | 'viewScope' | 'onSelectSavedView'>) {
  const scope = props.viewScope
  const [revision, refresh] = React.useState(0)
  const [error, setError] = React.useState('')
  const state = React.useMemo(() => {
    if (!scope || scope.ephemeral) return null
    const current = readWorkspaceDataViewStateWithMeta(scope).state
    return { ...current, views: current.views.map(view => view.id === props.viewConfig.id ? props.viewConfig : view) }
  }, [scope, props.viewConfig, revision])
  const commit = (next: WorkspaceDataViewState) => {
    if (!scope || scope.ephemeral) return
    try {
      writeWorkspaceDataViewState({ ...scope, value: next })
      const view = getWorkspaceDataViewActiveView({ state: next }).view
      props.setViewConfig(view); props.onSelectSavedView?.(view); refresh(value => value + 1); setError('')
    } catch (reason) { setError(`Saved views could not be changed: ${String(reason)}`) }
  }
  if (!state) return null
  return <section className="space-y-2" aria-label="Saved views">
    {error && <p role="alert">{error}</p>}
    <label className="block text-xs">Saved view<PanelSelect aria-label="Saved view" className="w-full" value={state.activeViewId} onValueChange={activeViewId => commit({ ...state, activeViewId })}>
      {state.views.map(view => <option key={view.id} value={view.id}>{view.name}</option>)}
    </PanelSelect></label>
    <menu className="m-0 p-0 flex gap-2 flex-wrap" aria-label="Saved view actions">
      <li className="list-none"><DataViewAction onClick={() => commit(duplicateWorkspaceDataViewInState({ state, viewId: state.activeViewId }))}>Duplicate view</DataViewAction></li>
      <li className="list-none"><DataViewAction disabled={state.views.length <= 1} title={state.views.length <= 1 ? 'Keep at least one view.' : 'Deletes this view configuration; source records remain.'} onClick={() => commit(deleteWorkspaceDataViewFromState({ state, viewId: state.activeViewId }))}>Delete view</DataViewAction></li>
    </menu>
    {state.views.length <= 1 && <p className="text-xs">Keep at least one view.</p>}
  </section>
}
