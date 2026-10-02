import React from 'react'
import { useGraphStore } from '@/hooks/useGraphStore'
import { defaultWorkspaceDataViewConfig, buildWorkspaceDataViewScopeKey, readWorkspaceDataViewConfig, type WorkspaceDataViewConfig } from './workspaceDataViewConfig'
import { useSavedWorkspaceDataView } from './useSavedWorkspaceDataView'
import type { DataViewCandidate } from './markdownWorkspaceDataViewCandidates'
import type { MarkdownWorkspaceDerivedViewerMode } from './MarkdownWorkspaceDerivedViewer'

export function useWorkspaceDataViewConfig(selected: DataViewCandidate | null, activeDocumentPath: string | null | undefined,
  viewerMode: MarkdownWorkspaceDerivedViewerMode, ephemeral = false) {
  const layout = viewerMode === 'calendar' ? 'calendar' : viewerMode === 'kanban' ? 'kanban' : 'table'
  const saved = useSavedWorkspaceDataView({ activeDocumentPath: activeDocumentPath ?? null, tableId: selected?.id ?? null, ephemeral,
    fallback: defaultWorkspaceDataViewConfig({ title: layout === 'calendar' ? 'Calendar View' : layout === 'kanban' ? 'Kanban View' : 'Table View', layout, groupByColumnId: selected?.view.groupByColumnId ?? null }),
  })
  const commitViewConfig = React.useCallback((next: WorkspaceDataViewConfig) => {
    saved.setViewConfig(next)
    if (!ephemeral && (saved.viewConfig?.graphEnabled === true) !== (next.graphEnabled === true)) useGraphStore.getState().setMultiDimTableModeEnabled(next.graphEnabled === true)
  }, [saved.setViewConfig, saved.viewConfig?.graphEnabled, ephemeral])
  const appliedIntent = React.useRef('')
  React.useEffect(() => {
    if (!selected || !saved.viewConfig) return
    const scope = { activeDocumentPath: activeDocumentPath ?? null, tableId: selected.id }
    const intent = `${buildWorkspaceDataViewScopeKey(scope)}:${viewerMode}`
    if (appliedIntent.current === intent) return
    appliedIntent.current = intent
    const current = ephemeral ? saved.viewConfig : readWorkspaceDataViewConfig({ ...scope, fallback: saved.viewConfig })
    if (!current.recoveryError && current.layout !== layout) saved.setViewConfig({ ...current, layout })
  }, [selected?.id, activeDocumentPath, viewerMode, layout, saved.viewConfig, saved.setViewConfig, ephemeral])
  return { ...saved, commitViewConfig }
}
