import React from 'react'
import { useGraphStore } from '@/hooks/useGraphStore'
import { MARKDOWN_DATA_VIEW_COPY } from '@/lib/config-copy/markdownDataViewCopy'
import { cancelWorkspaceSyncTask, scheduleWorkspaceSyncTask } from '@/lib/async/workspaceSyncScheduler'
import { WORKSPACE_SYNC_SCOPE_MARKDOWN_WORKSPACE_DATAVIEW_RUNTIME_PERSISTENCE } from '@/lib/async/workspaceSyncKeys'
import { hashStringToHex } from '@/lib/hash/stringHash'
import { defaultWorkspaceDataViewConfig, readWorkspaceDataViewConfig, writeWorkspaceDataViewConfig, type WorkspaceDataViewConfig } from './workspaceDataViewConfig'
import type { DataViewCandidate } from './markdownWorkspaceDataViewCandidates'
import type { MarkdownWorkspaceDerivedViewerMode } from './MarkdownWorkspaceDerivedViewer'

/** Source observations share table settings without persisting evidence or changing authored modes. */
export function useWorkspaceDataViewConfig(selected: DataViewCandidate | null, activeDocumentPath: string | null | undefined,
  viewerMode: MarkdownWorkspaceDerivedViewerMode, ephemeral = false) {
  const [viewConfig, setViewConfig] = React.useState<WorkspaceDataViewConfig | null>(null)
  const tableId = selected?.id, groupByColumnId = selected?.view.groupByColumnId ?? null
  React.useEffect(() => {
    if (!tableId) { setViewConfig(null); return }
    const fallback = defaultWorkspaceDataViewConfig({
      title: viewerMode === 'kanban' ? MARKDOWN_DATA_VIEW_COPY.kanbanViewLabel : viewerMode === 'geospatial'
        ? MARKDOWN_DATA_VIEW_COPY.geospatialViewLabel : MARKDOWN_DATA_VIEW_COPY.tableViewLabel,
      layout: viewerMode === 'kanban' ? 'kanban' : 'table', groupByColumnId,
    })
    setViewConfig(ephemeral ? fallback : readWorkspaceDataViewConfig({ activeDocumentPath, tableId, fallback }))
  }, [activeDocumentPath, viewerMode, tableId, groupByColumnId, ephemeral])
  React.useEffect(() => {
    if (ephemeral || !tableId || !viewConfig) return
    const taskKey = `markdown-workspace:dataview:${tableId}`, value = viewConfig
    scheduleWorkspaceSyncTask(taskKey, () => writeWorkspaceDataViewConfig({ activeDocumentPath, tableId, value }), 200, {
      signature: hashStringToHex(JSON.stringify({ docPath: activeDocumentPath ?? null, tableId, value })),
      scopeKey: WORKSPACE_SYNC_SCOPE_MARKDOWN_WORKSPACE_DATAVIEW_RUNTIME_PERSISTENCE,
    })
    return () => { cancelWorkspaceSyncTask(taskKey) }
  }, [activeDocumentPath, tableId, viewConfig, ephemeral])
  const commitViewConfig = React.useCallback((next: WorkspaceDataViewConfig) => {
    setViewConfig(next)
    if (ephemeral) return
    if (tableId) writeWorkspaceDataViewConfig({ activeDocumentPath, tableId, value: next })
    if ((viewConfig?.graphEnabled === true) !== (next.graphEnabled === true)) useGraphStore.getState().setMultiDimTableModeEnabled(next.graphEnabled === true)
  }, [activeDocumentPath, tableId, viewConfig?.graphEnabled, ephemeral])
  return { viewConfig, setViewConfig, commitViewConfig }
}
