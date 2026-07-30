import fs from 'node:fs'
import path from 'node:path'

const readUtf8 = (relativePath: string): string => {
  return fs.readFileSync(path.resolve(process.cwd(), relativePath), 'utf8')
}

const removedWorkspaceFilename = ['GraphTable', 'Workspace.impl.tsx'].join('')
const removedWorkspaceSymbol = ['GraphTable', 'Workspace'].join('')

export function testWorkspaceTableModeSharedUtilsOwnMultiDimModes() {
  const workspaceModeText = readUtf8('src/features/workspace-table/workspaceEditorMode.ts')
  const presentationText = readUtf8('src/features/workspace-table/workspaceEditorModePresentation.ts')
  const viewerHeaderText = readUtf8('src/features/markdown-workspace/main/viewer/WorkspaceDataViewHeader.tsx')
  const graphModePath = path.resolve(process.cwd(), 'src', 'features', 'graph-table', 'ui', 'graphTableViewMode.ts')
  const graphWorkspacePath = path.resolve(process.cwd(), 'src', 'lib', 'graph-table', 'ui', removedWorkspaceFilename)
  const lsKeysText = readUtf8('src/lib/config.ls.keys.ts')

  if (fs.existsSync(graphModePath)) {
    throw new Error('expected graph-table-local view mode file to be removed in favor of workspace-table shared utils')
  }
  if (!workspaceModeText.includes("export type WorkspaceTableViewMode = WorkspaceEditorMode | 'geospatial'")) {
    throw new Error('expected shared workspace table mode to own geospatial plus table/kanban/multi-dimensional table modes')
  }
  if (!workspaceModeText.includes('export function parseWorkspaceTableViewMode(')) {
    throw new Error('expected shared workspace table mode parser to live upstream')
  }
  if (!presentationText.includes('WORKSPACE_TABLE_VIEW_MODE_SELECT_OPTIONS')) {
    throw new Error('expected shared workspace table presentation options to live upstream')
  }
  if (fs.existsSync(graphWorkspacePath)) {
    throw new Error('expected removed graph-table workspace runtime to stay deleted in favor of the shared Multi-dimensional Table surface')
  }
  if (!viewerHeaderText.includes('getWorkspaceEditorModeLabel(props.viewerMode)')) {
    throw new Error('expected Editor Workspace Viewer Multi-dimensional Table to keep using shared workspace mode labels')
  }
  if (lsKeysText.includes('graphTableViewMode')) {
    throw new Error('expected duplicate graphTableViewMode local-storage key to be removed')
  }
}

export function testWorkspaceDataViewTableFrameFillsPane() {
  const viewerText = readUtf8('src/features/markdown-workspace/main/viewer/MarkdownWorkspaceDerivedViewer.tsx')
  const responsiveClassesText = readUtf8('src/lib/ui/responsiveElementClasses.ts')
  const responsiveCssText = readUtf8('src/styles/responsive-toolbar.css')
  const canvasToolbarCssText = readUtf8('src/styles/responsive-canvas-toolbar.css')

  if (!responsiveClassesText.includes('UI_RESPONSIVE_WORKSPACE_DATA_VIEW_ROOT_CLASSNAME')) {
    throw new Error('expected workspace data-view root to use a shared responsive class')
  }
  if (!responsiveClassesText.includes('UI_RESPONSIVE_WORKSPACE_DATA_VIEW_MAIN_CLASSNAME')) {
    throw new Error('expected workspace data-view body to use a shared responsive class')
  }
  if (!viewerText.includes('UI_RESPONSIVE_WORKSPACE_DATA_VIEW_ROOT_CLASSNAME')) {
    throw new Error('expected MarkdownWorkspaceDerivedViewer to mark the workspace data-view root')
  }
  if (!viewerText.includes('UI_RESPONSIVE_WORKSPACE_DATA_VIEW_MAIN_CLASSNAME')) {
    throw new Error('expected MarkdownWorkspaceDerivedViewer to mark the workspace data-view body')
  }
  if (!responsiveCssText.includes('.kg-workspace-data-view-main > .kg-data-view-table-frame')) {
    throw new Error('expected workspace-hosted data-view tables to fill the pane body')
  }
  if (!responsiveCssText.includes('max-height: none') || !responsiveCssText.includes('max-block-size: none')) {
    throw new Error('expected workspace-hosted data-view tables to override the generic table max-height')
  }
  if (!canvasToolbarCssText.includes('.kg-canvas-page-surface .kg-workspace-data-view-root') || !canvasToolbarCssText.includes('--kg-toolbar-compact-surface-height')) {
    throw new Error('expected canvas-hosted workspace data views to clear the compact toolbar surface')
  }
}

export function testWorkspaceDataViewFloatingPanelOwnsQueryWorkbench() {
  const floatingPanelViewText = readUtf8('src/features/markdown-workspace/main/viewer/WorkspaceDataViewFloatingPanelView.tsx')
  const settingsPanelText = readUtf8('src/features/markdown-workspace/main/viewer/WorkspaceDataViewSettingsPanel.tsx')
  const floatingStoreText = readUtf8('src/features/markdown-workspace/main/viewer/workspaceDataViewFloatingStore.ts')
  const propertiesSectionText = readUtf8('src/features/markdown-workspace/main/viewer/WorkspaceDataViewSettingsPropertiesSection.tsx')
  const headerText = readUtf8('src/features/markdown-workspace/main/viewer/WorkspaceDataViewHeader.tsx')
  const newRecordButtonText = readUtf8('src/features/markdown-workspace/main/viewer/WorkspaceDataViewNewRecordButton.tsx')
  const responsiveCssText = readUtf8('src/styles/responsive-toolbar.css')
  const indexCssText = readUtf8('src/index.css')
  const canvasViewportText = readUtf8('src/components/CanvasViewport.tsx')
  const bridgeText = readUtf8('src/features/markdown-workspace/main/viewer/CanvasWorkspaceDataViewFloatingRegistrationBridge.tsx')
  const derivedViewerText = readUtf8('src/features/markdown-workspace/main/viewer/MarkdownWorkspaceDerivedViewer.tsx')
  const multiDimTableSurfaceText = readUtf8('src/features/markdown-workspace/main/viewer/MultiDimTableSurface.tsx')
  const storyboardCanvasText = readUtf8('src/components/StoryboardCanvas.tsx')
  const kanbanGroupText = readUtf8('src/features/markdown/ui/kanban/KanbanGroup.tsx')
  const kanbanDividerRowText = readUtf8('src/features/markdown/ui/kanban/KanbanNewRecordDividerRow.tsx')

  if (!floatingPanelViewText.includes('<WorkspaceDataViewSettingsPanel')) {
    throw new Error('expected FloatingPanel View to delegate to the shared workspace data-view settings panel')
  }
  if (!floatingStoreText.includes('onNewRecord?: () => void') || !floatingPanelViewText.includes('onNewRecord={binding.onNewRecord}')) {
    throw new Error('expected FloatingPanel View binding to own the shared New Record action')
  }
  if (!settingsPanelText.includes('<WorkspaceDataViewNewRecordButton') || !headerText.includes('<WorkspaceDataViewNewRecordButton')) {
    throw new Error('expected header and FloatingPanel View to reuse the shared New Record button')
  }
  if (!storyboardCanvasText.includes('<WorkspaceDataViewNewRecordButton') || !storyboardCanvasText.includes('handleNewStoryboardRecord')) {
    throw new Error('expected Storyboard to reuse the shared New Record action instead of a renderer-local control')
  }
  if (!newRecordButtonText.includes("labelMode?: 'always' | 'hover' | 'icon'") || !newRecordButtonText.includes("presentation?: 'button' | 'divider'") || !newRecordButtonText.includes("hoverRevealScope?: 'self' | 'container'") || !newRecordButtonText.includes('kg-data-view-new-record-action--container-hover-label') || !newRecordButtonText.includes('UI_THEME_TOKENS.button.square') || !newRecordButtonText.includes('UI_RESPONSIVE_DATA_VIEW_ICON_ACTION_DEFAULT_CLASSNAME') || !newRecordButtonText.includes('kg-data-view-new-record-divider-action') || !newRecordButtonText.includes('MARKDOWN_DATA_VIEW_COPY.newRecordLabel')) {
    throw new Error('expected shared New Record button to own square icon sizing, divider-row presentation, and hover-reveal behavior with shared copy')
  }
  if (!responsiveCssText.includes('.kg-data-view-new-record-hover-scope:hover .kg-data-view-new-record-action--container-hover-label') || !responsiveCssText.includes('.kg-data-view-new-record-label--hover')) {
    throw new Error('expected New Record hover label behavior to live in shared responsive CSS, including container-triggered reveal support')
  }
  if (!headerText.includes('kg-data-view-new-record-hover-scope') || !headerText.includes('hoverRevealScope="container"') || !headerText.includes('labelMode="icon"')) {
    throw new Error('expected data view header to reuse the shared icon-only New Record action and container hover scope')
  }
  if (!storyboardCanvasText.includes('kg-data-view-new-record-hover-scope') || !storyboardCanvasText.includes('hoverRevealScope="container"') || !storyboardCanvasText.includes('labelMode="icon"')) {
    throw new Error('expected Storyboard to reuse the shared container hover scope for an icon-only New Record action')
  }
  if (!kanbanDividerRowText.includes('<WorkspaceDataViewNewRecordButton') || !kanbanDividerRowText.includes('presentation="divider"')) {
    throw new Error('expected shared kanban divider row utility to own the semantic New Record divider presentation')
  }
  if (!kanbanGroupText.includes('data-kg-kanban-group-header="1"') || !kanbanGroupText.includes('data-kg-kanban-group-list="1"') || !kanbanGroupText.includes('<KanbanNewRecordDividerRow') || !indexCssText.includes('[data-kg-kanban-group-header="1"]:hover [data-kg-kanban-group-actions="1"]') || !indexCssText.includes('[data-kg-kanban-group-list="1"]:hover [data-kg-kanban-group-actions="1"]')) {
    throw new Error('expected shared kanban group actions to reveal from both the lane header and semantic card list and reuse the shared New Record divider row utility')
  }
  if (!storyboardCanvasText.includes('data-kg-kanban-group-header="1"') || !storyboardCanvasText.includes('data-kg-kanban-group-list="1"') || !storyboardCanvasText.includes('<KanbanNewRecordDividerRow')) {
    throw new Error('expected Storyboard lanes to reuse the shared kanban header and semantic list action reveal contract, including the shared New Record divider row utility')
  }
  if (!settingsPanelText.includes('props.onNewRecord?.()')) {
    throw new Error('expected FloatingPanel View settings panel to render the shared New Record action')
  }
  if (!derivedViewerText.includes('onNewRecord: canMutate ? () => onNewRecord() : undefined')) {
    throw new Error('expected derived workspace data views to pass New Record through the shared FloatingPanel View binding')
  }
  if (!multiDimTableSurfaceText.includes('useCanvasWorkspaceDataViewSource')) {
    throw new Error('expected Multi-dimensional Table and Storyboard bridge to reuse the same canvas data-view source helper')
  }
  if (!canvasViewportText.includes('CanvasWorkspaceDataViewFloatingRegistrationBridgeLazy') || !canvasViewportText.includes("active2dSurface === 'storyboard' && floatingPanelOpen && floatingPanelView === 'view'")) {
    throw new Error('expected Storyboard to register FloatingPanel View settings through the shared data-view bridge only when View is active')
  }
  if (!canvasViewportText.includes("active2dSurface === 'storyboard' && floatingPanelOpen && floatingPanelView === 'view'") || !canvasViewportText.includes('fallbackDocumentName="storyboard.md"')) {
    throw new Error('expected Storyboard Widget to register FloatingPanel View settings through the shared data-view bridge only when View is active')
  }
  if (!bridgeText.includes('MarkdownWorkspaceDerivedViewer') || !bridgeText.includes('floatingPanelRegistrationOnly') || !bridgeText.includes('useCanvasWorkspaceDataViewSource')) {
    throw new Error('expected Storyboard FloatingPanel View bridge to reuse the shared derived-viewer registration path and canvas data-view source')
  }
  if (!derivedViewerText.includes('floatingPanelRegistrationOnly') || !derivedViewerText.includes('useWorkspaceDataViewFloatingRegistration(viewSettingsBinding)')) {
    throw new Error('expected derived viewer to support headless FloatingPanel View registration without a renderer-local panel')
  }
  if (!multiDimTableSurfaceText.includes('useCanvasWorkspaceDataViewSource')) {
    throw new Error('expected Multi-dimensional Table and Storyboard bridge to reuse the same canvas data-view source helper')
  }
  for (const expected of [
    'View query workbench',
    'View query roles',
    'setOrientationFromWorkbench',
    "orientation: nextOrientation",
  ]) {
    if (!settingsPanelText.includes(expected)) {
      throw new Error(`expected FloatingPanel View settings to own ${expected}`)
    }
  }
  if (settingsPanelText.includes("label: 'Fields'") || settingsPanelText.includes('Fields inventory') || settingsPanelText.includes('Fields inventory list')) {
    throw new Error('expected FloatingPanel View query workbench to stop owning a standalone Fields inventory')
  }
  if (settingsPanelText.includes('View query status') || settingsPanelText.includes("togglePanel('sort', false)") || settingsPanelText.includes("togglePanel('filter', false)") || settingsPanelText.includes("togglePanel('group', false)")) {
    throw new Error('expected FloatingPanel View query workbench to stop owning duplicate sort/filter/group status buttons')
  }
  for (const expected of [
    "key: 'filter' as const",
    "key: 'sort' as const",
    "key: 'group' as const",
    'value: filterRuleCount ?',
    'value: sortColumnName',
    'value: groupByColumnName',
  ]) {
    if (!settingsPanelText.includes(expected)) {
      throw new Error(`expected existing Sort/Filter/Group sections to own ${expected}`)
    }
  }
  for (const expected of [
    'Properties field inventory',
    'Properties field inventory list',
    'Search properties',
    'Hide property:',
    'Show property:',
  ]) {
    if (!propertiesSectionText.includes(expected)) {
      throw new Error(`expected Properties to own ${expected}`)
    }
  }
  if (settingsPanelText.includes('perspective') || settingsPanelText.includes('settings_panel') || settingsPanelText.includes('group_rollup_mode_selector')) {
    throw new Error('expected FloatingPanel View workbench to avoid copying Perspective DOM or implementation identifiers')
  }
  if (propertiesSectionText.includes('perspective') || propertiesSectionText.includes('settings_panel') || propertiesSectionText.includes('group_rollup_mode_selector')) {
    throw new Error('expected Properties inventory to avoid copying Perspective DOM or implementation identifiers')
  }
  if (settingsPanelText.includes("<span className={['text-xs', UI_THEME_TOKENS.text.secondary].join(' ')}>Group</span>")) {
    throw new Error('expected FloatingPanel View query workbench to avoid a duplicate Group selector label')
  }
}

export function testWorkspaceTableUserFacingCopyUsesMultiDimensionalTableSsot() {
  const sourcePaths = [
    'src/features/graph-data-table/ui/GraphDataTableToolbar.tsx',
    'src/features/graph-data-table/ui/GraphDataTableKanbanView.tsx',
    'src/lib/markdown-core/ui/MarkdownSelectionActionMenuItems.tsx',
    'src/lib/markdown-core/ui/MarkdownInlineSelectionToolbar.tsx',
    'src/features/panels/config.ts',
    'src/features/panels/views/HelpIconsSection.tsx',
    'src/features/panels/views/useSettingsView.helpers.ts',
    'src/features/panels/ui/mainPanelHelpIconLibrary.tsx',
    'src/features/spotlight/config.ts',
    'src/features/spotlight/LaunchSpotlightTourCard.tsx',
    'src/lib/config-copy/tooltips.ts',
    'src/cli/extract-settings-schema.ts',
  ]
  const staleGraphDataTableLabel = /Graph\s+Data\s+Table/

  for (const sourcePath of sourcePaths) {
    const text = readUtf8(sourcePath)
    if (staleGraphDataTableLabel.test(text)) {
      throw new Error(`expected ${sourcePath} to reuse Multi-dimensional Table shared copy instead of legacy data-table literals`)
    }
  }

  const copyText = readUtf8('src/lib/config-copy/markdownDataViewCopy.ts')
  for (const expectedCopyKey of [
    'toolbarAriaLabel',
    'workspaceAriaLabel',
    'viewSelectAriaLabel',
    'showInLabel',
    'hideInLabel',
    'mappingLabel',
  ]) {
    if (!copyText.includes(expectedCopyKey)) {
      throw new Error(`expected shared Multi-dimensional Table copy to expose ${expectedCopyKey}`)
    }
  }
}

export function testWorkspaceDataViewHasNoLegacyTableBackfill() {
  const candidatesText = readUtf8('src/features/markdown-workspace/main/viewer/markdownWorkspaceDataViewCandidates.ts')
  const viewerText = readUtf8('src/features/markdown-workspace/main/viewer/MarkdownWorkspaceDerivedViewer.tsx')
  const configText = readUtf8('src/features/markdown-workspace/main/viewer/workspaceDataViewConfig.ts')

  if (candidatesText.includes('legacyId')) {
    throw new Error('expected DataView candidates to expose only stable IDs')
  }
  if (viewerText.includes('legacyId') || viewerText.includes('stableMeta') || viewerText.includes('legacyMeta')) {
    throw new Error('expected MarkdownWorkspaceDerivedViewer to avoid legacy table config backfill')
  }
  if (configText.includes('raw.v === 1') || configText.includes('const maybeView = coerceWorkspaceDataViewConfig(raw)')) {
    throw new Error('expected WorkspaceDataView config coercion to reject legacy/direct config backfill paths')
  }
}

export function testWorkspaceCsvRefreshReusesDelimitedTextDataViewOwners() {
  const mainText = readUtf8('src/features/markdown-workspace/main/MarkdownWorkspaceMain.tsx')
  const viewerText = readUtf8('src/features/markdown-workspace/main/viewer/MarkdownWorkspaceDerivedViewer.tsx')
  const candidatesText = readUtf8('src/features/markdown-workspace/main/viewer/markdownWorkspaceDataViewCandidates.ts')
  const typesText = readUtf8('src/features/markdown-workspace/main/types.ts')
  const delimitedText = readUtf8('src/lib/delimited-text/delimitedText.ts')

  if (!typesText.includes('isMarkdownWorkspaceDelimitedTextPath')) {
    throw new Error('expected delimited-text workspace document detection to live in shared pane preset utilities')
  }
  if (!mainText.includes('shouldUseDataViewDocumentPreset')) {
    throw new Error('expected MarkdownWorkspaceMain to preserve Viewer Multi-dimensional Table mode for CSV refresh')
  }
  if (!mainText.includes('!shouldUseDataViewDocumentPreset')) {
    throw new Error('expected Viewer read-mode reset to skip delimited-text data-view presets')
  }
  if (!viewerText.includes('parseDelimitedTextWithWorkerFallback')) {
    throw new Error('expected MarkdownWorkspaceDerivedViewer to rebuild CSV data views with the existing worker-backed parser')
  }
  if (!viewerText.includes('buildDataViewCandidatesFromDelimitedTextParseResult')) {
    throw new Error('expected MarkdownWorkspaceDerivedViewer to reuse shared delimited-text data-view candidates')
  }
  if (!candidatesText.includes('buildWorkspaceDataViewSourceTableId')) {
    throw new Error('expected rows-JSON and raw delimited source tables to share one stable table id helper')
  }
  if (!delimitedText.includes('defaultDelimitedTextDelimiterForName')) {
    throw new Error('expected delimiter inference by file name to live in the delimited-text parser owner')
  }
}

export function testWorkspaceDataViewGraphToggleBridgesFloatingPanelToCanvasMode() {
  const settingsText = readUtf8('src/features/markdown-workspace/main/viewer/WorkspaceDataViewSettingsPanel.tsx')
  const viewerText = readUtf8('src/features/markdown-workspace/main/viewer/MarkdownWorkspaceDerivedViewer.tsx')
  const activeViewText = readUtf8('src/hooks/active-graph-data/activeViewGraph.ts')
  const modeActionsText = readUtf8('src/hooks/store/uiSettingsSliceModeActions.ts')
  const renderConfigText = readUtf8('src/lib/config.render.ts')
  const canvasViewportText = readUtf8('src/components/CanvasViewport.tsx')
  const canvasTableSurfaceText = readUtf8('src/features/markdown-workspace/main/viewer/MultiDimTableSurface.tsx')
  const canvasViewActionsText = readUtf8('src/components/toolbar/canvasViewActions.ts')
  const canvasViewMenuText = readUtf8('src/components/toolbar/canvasViewMenu.ts')
  const uiCopyText = readUtf8('src/lib/config-copy/uiCopy.ts')
  const restoreWritesText = readUtf8('src/features/canvas/graphStoreDocumentUiRestoreWrites.ts')

  if (!settingsText.includes("props.onChangeLayoutMode?.(next ? 'multiDimTable' : 'table')")) {
    throw new Error('expected the FloatingPanel graph toggle to bridge into the shared Multi-dimensional Table layout mode')
  }
  if (!settingsText.includes('MARKDOWN_DATA_VIEW_COPY.graphRenderingToggleLabel')) {
    throw new Error('expected graph-rendering toggle copy to use shared Multi-dimensional Table copy')
  }
  if (settingsText.includes('disabled={!props.canMutate}')) {
    throw new Error('expected graph-rendering view config toggle to stay enabled for read-only source tables')
  }
  if (!viewerText.includes('writeWorkspaceDataViewConfig({')) {
    throw new Error('expected workspace data-view graph config to persist immediately before canvas mode changes')
  }
  if (!viewerText.includes("setMultiDimTableModeEnabled(mode === 'multiDimTable')")) {
    throw new Error('expected workspace data-view layout changes to drive canvas Multi-dimensional Table mode')
  }
  if (!activeViewText.includes("if (mode === 'multiDimTable') return deriveActiveViewGraph()")) {
    throw new Error('expected Multi-dimensional Table active-view derivation to bypass stale cache after view-config changes')
  }
  if (!renderConfigText.includes('resolveTableGraphCanvas2dRenderer')) {
    throw new Error('expected table graph renderer resolution to live in shared renderer config utilities')
  }
  if (!renderConfigText.includes("export const TABLE_GRAPH_CANVAS_2D_RENDERER: Canvas2dRendererId = 'multiDimTable'")) {
    throw new Error('expected Multi-dimensional Table to be the canonical table graph renderer id')
  }
  if (!renderConfigText.includes("surfaceId: 'multiDimTable'") || renderConfigText.includes("id === 'd3' || id === 'flowchart' || id === 'multiDimTable'")) {
    throw new Error('expected Multi-dimensional Table renderer to use the shared table surface without D3-like routing')
  }
  if (!canvasViewportText.includes("import('@/features/markdown-workspace/main/viewer/MultiDimTableSurface')") || !canvasViewportText.includes("active2dSurface === 'multiDimTable'") || !canvasViewportText.includes('<MultiDimTableSurfaceLazy active ariaLabel="Canvas Multi-dimensional Table" />')) {
    throw new Error('expected CanvasViewport to mount the shared Multi-dimensional Table surface')
  }
  if (!canvasTableSurfaceText.includes('MarkdownWorkspaceDerivedViewer') || !canvasTableSurfaceText.includes('viewerMode="multiDimTable"') || !canvasTableSurfaceText.includes('jsonSourceDocumentText')) {
    throw new Error('expected Multi-dimensional Table to reuse Editor Workspace Viewer data-view owners')
  }
  if (canvasViewportText.includes("import('@/lib/graph-table/ui')") || canvasTableSurfaceText.includes(removedWorkspaceSymbol)) {
    throw new Error('expected Canvas Multi-dimensional Table to avoid the removed graph-table workspace surface')
  }
  if (!uiCopyText.includes('2D Renderer: Multi-dimensional Table') || !canvasViewMenuText.includes('canvasViewRendererMultiDimTableTitle')) {
    throw new Error('expected Multi-dimensional Table renderer to be labeled and exposed through shared Canvas View copy')
  }
  if (!modeActionsText.includes('resolveTableGraphCanvas2dRenderer(state.canvas2dRenderer)')) {
    throw new Error('expected store-level Multi-dimensional Table mode to switch non-graph renderers through the shared resolver')
  }
  if (!modeActionsText.includes('resolveNonTableGraphCanvas2dRenderer(state.canvas2dRenderer)')) {
    throw new Error('expected store-level Multi-dimensional Table mode to leave the table renderer through the shared resolver')
  }
  if (!canvasViewActionsText.includes('isTableGraphCanvas2dRenderer(canvas2dRenderer)')) {
    throw new Error('expected toolbar Multi-dimensional Table mode to reuse the shared graph-renderer predicate')
  }
  if (!canvasViewActionsText.includes('isMultiDimTableCanvas2dRenderer(nextRenderer)')) {
    throw new Error('expected Canvas View renderer selection to enter Multi-dimensional Table mode through the shared renderer helper')
  }
  if (!restoreWritesText.includes('resolveTableGraphCanvas2dRenderer(modeState.canvas2dRenderer)')) {
    throw new Error('expected document UI restore to normalize stale saved renderers for restored Multi-dimensional Table mode')
  }
  if (!restoreWritesText.includes('resolveNonTableGraphCanvas2dRenderer(modeState.canvas2dRenderer)')) {
    throw new Error('expected document UI restore to clear stale table renderers when restored table mode is off')
  }
}
