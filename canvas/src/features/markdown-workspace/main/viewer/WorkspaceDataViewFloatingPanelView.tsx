import React from 'react'
import { PanelTabHeader } from 'agentic-design-system/react/panels'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import { MARKDOWN_DATA_VIEW_COPY } from '@/lib/config-copy/markdownDataViewCopy'
import { WorkspaceDataViewSettingsPanel } from './WorkspaceDataViewSettingsPanel'
import { useWorkspaceDataViewFloatingBinding } from './workspaceDataViewFloatingStore'

export function WorkspaceDataViewFloatingPanelView() {
  const binding = useWorkspaceDataViewFloatingBinding()

  if (!binding) {
    return (
      <section className="agentic-panel-tab-layout" aria-label={MARKDOWN_DATA_VIEW_COPY.viewSettingsLabel}>
        <PanelTabHeader title={MARKDOWN_DATA_VIEW_COPY.viewLabel} />
        <div className="agentic-panel-tab-body">
          <p className={UI_THEME_TOKENS.text.secondary}>
            Open a table, multi-dimensional table, kanban, Calendar, or geospatial Viewer surface to edit View settings here.
          </p>
        </div>
      </section>
    )
  }

  return (
    <WorkspaceDataViewSettingsPanel
      title={MARKDOWN_DATA_VIEW_COPY.viewLabel}
      contextLabel={binding.contextLabel}
      activePanel={binding.activePanel}
      canMutate={binding.canMutate}
      viewerLayout={binding.viewerLayout}
      viewerMode={binding.viewerMode}
      allowMultiDimLayout={binding.allowMultiDimLayout}
      sourceView={binding.sourceView}
      viewScope={binding.viewScope}
      onSelectSavedView={binding.onSelectSavedView}
      columns={binding.columns}
      groupByColumnId={binding.groupByColumnId}
      viewConfig={binding.viewConfig}
      setViewConfig={binding.setViewConfig}
      onChangeLayout={binding.onChangeLayout}
      onChangeLayoutMode={binding.onChangeLayoutMode}
      onSelectGeospatialView={binding.onSelectGeospatialView}
      onReset={binding.onReset}
      onNewRecord={binding.onNewRecord}
      onAddColumn={binding.onAddColumn}
      onDuplicateColumn={binding.onDuplicateColumn}
      onDeleteColumn={binding.onDeleteColumn}
      onRenameColumn={binding.onRenameColumn}
    />
  )
}
