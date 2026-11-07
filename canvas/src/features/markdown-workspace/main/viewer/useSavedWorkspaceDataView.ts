import React from 'react'
import { buildWorkspaceDataViewScopeKey, readWorkspaceDataViewConfig, writeWorkspaceDataViewConfig, type WorkspaceDataViewConfig } from './workspaceDataViewConfig'
import { subscribeDataViewState } from './workspaceDataViewStateEvents'

/** The shared settings adapter for inline and standalone views; source writes remain separate. */
export function useSavedWorkspaceDataView(args: { activeDocumentPath: string | null; tableId: string | null; fallback: WorkspaceDataViewConfig; ephemeral?: boolean }) {
  const { activeDocumentPath, tableId, ephemeral } = args
  const fallbackSignature = JSON.stringify(args.fallback)
  const [config, setConfig] = React.useState<WorkspaceDataViewConfig | null>(null)
  const current = React.useRef(config)
  const scope = buildWorkspaceDataViewScopeKey({ activeDocumentPath, tableId: tableId || '' })
  const update = React.useCallback((value: WorkspaceDataViewConfig | null) => {
    if (JSON.stringify(value) === JSON.stringify(current.current)) return
    current.current = value; setConfig(value)
  }, [])
  React.useEffect(() => {
    const read = () => { const next = !tableId ? null : ephemeral ? JSON.parse(fallbackSignature) : readWorkspaceDataViewConfig({ activeDocumentPath, tableId, fallback: JSON.parse(fallbackSignature) }); update(next) }
    read()
    if (ephemeral) return
    const stop = subscribeDataViewState(changedScope => { if (changedScope === scope) read() })
    const onStorage = () => read()
    window.addEventListener('storage', onStorage)
    return () => { stop(); window.removeEventListener('storage', onStorage) }
  }, [activeDocumentPath, tableId, scope, fallbackSignature, ephemeral, update])
  const setViewConfig: React.Dispatch<React.SetStateAction<WorkspaceDataViewConfig | null>> = React.useCallback(next => {
    if (current.current?.recoveryError) return
    const value = typeof next === 'function' ? next(current.current) : next
    try {
      if (value && tableId && !ephemeral) writeWorkspaceDataViewConfig({ activeDocumentPath, tableId, value })
      update(value)
    } catch (error) {
      if (current.current) update({ ...current.current, recoveryError: `Settings could not be saved: ${String(error)}` })
    }
  }, [activeDocumentPath, tableId, ephemeral, update])
  return { viewConfig: config, setViewConfig }
}
