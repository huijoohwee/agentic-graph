import fs from 'node:fs'
import path from 'node:path'

const readUtf8 = (absPath: string): string => {
  return fs.readFileSync(absPath, { encoding: 'utf8' })
}

export const testPanelHeaderUsesAriaTablist = () => {
  const root = process.cwd()
  const tabHeaderPath = path.resolve(root, 'src', 'features', 'panels', 'ui', 'TabHeader.tsx')
  const text = readUtf8(tabHeaderPath)
  if (!text.includes('role="tablist"') && !text.includes("role='tablist'")) {
    throw new Error('Expected TabHeader to render a tablist role')
  }
  if (!text.includes('role="tab"') && !text.includes("role='tab'")) {
    throw new Error('Expected TabHeader to render tab roles')
  }
}

export const testMainPanelContainerUsesKgPanelBg = () => {
  const root = process.cwd()
  const filePath = path.resolve(root, 'src', 'features', 'panels', 'ui', 'MainPanelContainer.tsx')
  const text = readUtf8(filePath)
  if (text.includes('var(--panel-bg)')) throw new Error('Expected MainPanelContainer to avoid var(--panel-bg)')
  if (!text.includes('var(--kg-panel-bg)')) throw new Error('Expected MainPanelContainer to use var(--kg-panel-bg)')
  if (text.includes('headerBarHeightPx') || text.includes('--kg-header-bar-height')) {
    throw new Error('Expected MainPanelContainer to avoid parsing header-height utility classes')
  }
}

export const testPanelShellUsesResponsiveRowScrolling = () => {
  const root = process.cwd()
  const tabHeaderPath = path.resolve(root, 'src', 'features', 'panels', 'ui', 'TabHeader.tsx')
  const headerActionsPath = path.resolve(root, 'src', 'features', 'panels', 'ui', 'HeaderActions.tsx')
  const floatingPanelPath = path.resolve(root, 'src', 'lib', 'toolbar', 'ToolbarToolMenu.impl.tsx')
  const iconButtonPath = path.resolve(root, 'src', 'components', 'IconButton.tsx')
  const iconHelpersPath = path.resolve(root, 'src', 'lib', 'ui', 'icons.ts')
  const responsiveCssPath = path.resolve(root, 'src', 'styles', 'responsive-toolbar.css')
  const responsiveElementClassesPath = path.resolve(root, 'src', 'lib', 'ui', 'responsiveElementClasses.ts')
  const toolbarStylesPath = path.resolve(root, 'src', 'features', 'toolbar', 'ui', 'toolbarStyles.ts')

  const tabHeader = readUtf8(tabHeaderPath)
  if (!tabHeader.includes('uiToolbarRowScrollClassName') || !tabHeader.includes('uiToolbarRowScrollJustifyEndClassName')) {
    throw new Error('Expected TabHeader shell to use the toolbar row-scroll SSOT')
  }
  if (!tabHeader.includes('basis-full w-full sm:basis-auto sm:w-72')) {
    throw new Error('Expected TabHeader search shell to expand full-width on narrow widths')
  }
  if (!tabHeader.includes('kg-panel-tabs-nav') || !tabHeader.includes('basis-full w-full')) {
    throw new Error('Expected TabHeader tab nav to preserve its bounded mobile lane before panel tools')
  }
  if (!tabHeader.includes('kg-panel-tablist') || !tabHeader.includes('uiToolbarRowScrollClassName')) {
    throw new Error('Expected TabHeader tabs to scroll from the shared toolbar row helper')
  }

  const headerActions = readUtf8(headerActionsPath)
  if (!headerActions.includes('uiToolbarRowScrollJustifyEndClassName')) {
    throw new Error('Expected HeaderActions to scroll from the shared toolbar row helper')
  }

  const floatingPanel = readUtf8(floatingPanelPath)
  const responsiveCss = readUtf8(responsiveCssPath)
  const responsiveElementClasses = readUtf8(responsiveElementClassesPath)
  const iconHelpers = readUtf8(iconHelpersPath)
  if (!floatingPanel.includes('UI_RESPONSIVE_SAFE_VIEWPORT_PANEL_CLASSNAME') || floatingPanel.includes('w-80') || !responsiveElementClasses.includes('kg-safe-viewport-panel') || !responsiveCss.includes('.kg-safe-viewport-panel') || !responsiveCss.includes('--kg-safe-viewport-panel-width')) {
    throw new Error('Expected FloatingPanel shell to cap width through the shared safe viewport panel class')
  }
  if (
    !tabHeader.includes('UI_RESPONSIVE_PANEL_HEADER_ROW_CLASSNAME') ||
    !floatingPanel.includes('UI_RESPONSIVE_PANEL_HEADER_ROW_CLASSNAME') ||
    !responsiveElementClasses.includes('UI_RESPONSIVE_PANEL_HEADER_ROW_CLASSNAME') ||
    !responsiveCss.includes('.kg-responsive-panel-header-row') ||
    !responsiveCss.includes('--kg-responsive-panel-header-row-min-height') ||
    tabHeader.includes('min-h-[36px]') ||
    floatingPanel.includes('min-h-[36px]')
  ) {
    throw new Error('Expected panel header row height to use the shared responsive row-height owner')
  }
  if (!floatingPanel.includes('uiToolbarRowScrollJustifyBetweenClassName') || !floatingPanel.includes('uiToolbarRowScrollClassName')) {
    throw new Error('Expected FloatingPanel header shell to use toolbar row-scroll helpers')
  }

  const iconButton = readUtf8(iconButtonPath)
  if (!iconButton.includes('kg-icon-button') || !iconButton.includes('UI_RESPONSIVE_INLINE_ELEMENT_ROW_CLASSNAME')) {
    throw new Error('Expected IconButton to use the shared clipped icon-button surface')
  }
  if (!iconButton.includes('UI_RESPONSIVE_INLINE_ELEMENT_ROW_CLASSNAME') || !iconButton.includes('UI_RESPONSIVE_ICON_TEXT_ROW_CLASSNAME')) {
    throw new Error('Expected IconButton text/icon groups to use the shared responsive element-row primitive')
  }
  if (
    !iconHelpers.includes('UI_RESPONSIVE_COMPACT_GLYPH_CLASSNAME') ||
    !iconHelpers.includes('UI_RESPONSIVE_DEFAULT_GLYPH_CLASSNAME') ||
    !responsiveElementClasses.includes('UI_RESPONSIVE_DEFAULT_GLYPH_CLASSNAME') ||
    !responsiveCss.includes('.kg-default-glyph') ||
    !responsiveCss.includes('--kg-default-glyph-size') ||
    iconHelpers.includes("return 'w-3 h-3'") ||
    iconHelpers.includes("return 'w-4 h-4'") ||
    iconHelpers.includes('return "w-3 h-3"') ||
    iconHelpers.includes('return "w-4 h-4"')
  ) {
    throw new Error('Expected getIconSizeClass to use shared responsive glyph owner classes')
  }

  const toolbarStyles = readUtf8(toolbarStylesPath)
  if (!toolbarStyles.includes('uiToolbarRowScrollClassName') || !toolbarStyles.includes('uiToolbarTouchRowScrollClassName')) {
    throw new Error('Expected toolbarStyles to own shared row-scroll class constants')
  }
  if (!toolbarStyles.includes('uiToolbarResponsiveRowScrollClassName') || toolbarStyles.includes('overflow-x-auto overflow-y-hidden')) {
    throw new Error('Expected toolbarStyles row-scroll helpers to defer scroll behavior to shared CSS')
  }
  if (
    !toolbarStyles.includes('uiToolbarAreaStackClassName') ||
    !toolbarStyles.includes('uiToolbarAreaActionRowClassName') ||
    !toolbarStyles.includes('uiToolbarAreaWrapActionRowClassName') ||
    !toolbarStyles.includes('uiToolbarSettingsPanelBodyClassName') ||
    !toolbarStyles.includes('uiToolbarSettingsPanelSubsectionClassName') ||
    !toolbarStyles.includes('uiToolbarSettingsPanelFooterClassName') ||
    !toolbarStyles.includes('uiToolbarSettingsPanelActionGroupClassName') ||
    !toolbarStyles.includes('uiToolbarSettingsPanelTextActionClassName') ||
    !responsiveCss.includes('.kg-toolbar-area-stack') ||
    !responsiveCss.includes('.kg-toolbar-area-action-row') ||
    !responsiveCss.includes('--kg-toolbar-area-action-row-gap') ||
    !responsiveCss.includes('.kg-toolbar-settings-panel-body') ||
    !responsiveCss.includes('.kg-toolbar-settings-panel-subsection') ||
    !responsiveCss.includes('.kg-toolbar-settings-panel-footer') ||
    !responsiveCss.includes('.kg-toolbar-settings-panel-action-group') ||
    !responsiveCss.includes('.kg-toolbar-settings-panel-text-action') ||
    !responsiveCss.includes('--kg-toolbar-settings-panel-body-padding-inline') ||
    !responsiveCss.includes('--kg-toolbar-settings-panel-body-gap') ||
    !responsiveCss.includes('--kg-toolbar-settings-panel-subsection-padding-block-start') ||
    !responsiveCss.includes('--kg-toolbar-settings-panel-subsection-gap') ||
    !responsiveCss.includes('--kg-toolbar-settings-panel-footer-gap') ||
    !responsiveCss.includes('--kg-toolbar-settings-panel-action-group-gap') ||
    !responsiveCss.includes('--kg-toolbar-settings-panel-text-action-min-height') ||
    !responsiveCss.includes('--kg-toolbar-settings-panel-text-action-padding-inline')
  ) {
    throw new Error('Expected toolbar area rows and settings panel bodies to use shared toolbarStyles identities with CSS-owned spacing')
  }
  if (!responsiveCss.includes('.kg-row-scroll,') || !responsiveCss.includes('.kg-responsive-row-scroll')) {
    throw new Error('Expected responsive CSS to centralize always-on and mobile-only row scrolling')
  }
  if (!responsiveCss.includes('.kg-responsive-element-row') || !responsiveCss.includes('.kg-icon-button,') || !responsiveCss.includes('.App-toolbar__btn')) {
    throw new Error('Expected shared responsive CSS to own icon and toolbar button clipping')
  }
  const rendererHoverSettingsPath = path.resolve(root, 'src', 'features', 'toolbar', 'ui', 'RendererHoverSettings.tsx')
  const rendererHoverSettings = readUtf8(rendererHoverSettingsPath)
  if (!rendererHoverSettings.includes('UI_RESPONSIVE_LABEL_ROW_CLASSNAME') || rendererHoverSettings.includes('flex items-center gap-1 text-xs')) {
    throw new Error('Expected renderer hover labels to use the shared responsive label row owner')
  }
  if (!responsiveCss.includes('text-overflow: ellipsis') || !responsiveCss.includes('white-space: nowrap')) {
    throw new Error('Expected shared responsive CSS to prefer ellipsis over messy button overflow')
  }
  if (
    !responsiveElementClasses.includes('UI_RESPONSIVE_CONTROL_VALUE_ROW_CLASSNAME') ||
    !responsiveElementClasses.includes('UI_RESPONSIVE_CONTROL_COMPACT_VALUE_ROW_CLASSNAME') ||
    !responsiveElementClasses.includes('UI_RESPONSIVE_CONTROL_INLINE_FILL_CLASSNAME') ||
    !responsiveElementClasses.includes('UI_RESPONSIVE_CONTROL_HINT_CLASSNAME') ||
    !responsiveCss.includes('.kg-responsive-control-value-row') ||
    !responsiveCss.includes('--kg-responsive-control-value-row-gap') ||
    !responsiveCss.includes('.kg-responsive-control-inline-fill') ||
    !responsiveCss.includes('.kg-responsive-control-hint') ||
    !responsiveCss.includes('--kg-responsive-control-hint-min-width')
  ) {
    throw new Error('Expected shared responsive CSS to own control value-row, fill, and hint sizing')
  }
}

export const testResponsiveWorkspaceAndTableSurfacesStayBounded = () => {
  const root = process.cwd()
  const responsiveCssPath = path.resolve(root, 'src', 'styles', 'responsive-toolbar.css')
  const responsiveElementClassesPath = path.resolve(root, 'src', 'lib', 'ui', 'responsiveElementClasses.ts')
  const workspaceHeaderPath = path.resolve(root, 'src', 'components', 'ui', 'WorkspaceHeader.tsx')
  const embeddedWorkspacePath = path.resolve(root, 'src', 'components', 'EmbeddedWorkspaceShell.tsx')
  const canvasPreviewDockPath = path.resolve(root, 'src', 'components', 'CanvasPreviewDock.tsx')
  const toolMenuStatePath = path.resolve(root, 'src', 'features', 'toolbar', 'useToolMenuState.ts')
  const graphTableToolbarPath = path.resolve(root, 'src', 'features', 'graph-data-table', 'ui', 'GraphDataTableToolbar.tsx')
  const graphTableInspectorPath = path.resolve(root, 'src', 'features', 'graph-inspector', 'ui', 'GraphRecordInspector.tsx')
  const graphDataTablePath = path.resolve(root, 'src', 'lib', 'graph-data-table', 'ui', 'GraphDataTableTable.impl.tsx')
  const graphDataTableHeaderPath = path.resolve(root, 'src', 'features', 'graph-data-table', 'ui', 'GraphDataTableHeader.tsx')
  const graphDataTableBodyPath = path.resolve(root, 'src', 'features', 'graph-data-table', 'ui', 'GraphDataTableBody.tsx')
  const graphDataTableFieldsPanelPath = path.resolve(root, 'src', 'features', 'graph-data-table', 'ui', 'GraphDataTableFieldsPanel.tsx')
  const graphDataTableFilterPanelPath = path.resolve(root, 'src', 'features', 'graph-data-table', 'ui', 'GraphDataTableFilterPanel.tsx')
  const graphDataTableSortPanelPath = path.resolve(root, 'src', 'features', 'graph-data-table', 'ui', 'GraphDataTableSortPanel.tsx')
  const graphDataTableGroupPanelPath = path.resolve(root, 'src', 'features', 'graph-data-table', 'ui', 'GraphDataTableGroupPanel.tsx')
  const graphDataTableUiPrimitivesPath = path.resolve(root, 'src', 'features', 'graph-data-table', 'ui', 'GraphDataTableUiPrimitives.tsx')
  const graphDataTableToolbarStylesPath = path.resolve(root, 'src', 'features', 'graph-data-table', 'ui', 'GraphDataTableToolbarStyles.ts')
  const markdownToolbarPath = path.resolve(root, 'src', 'features', 'markdown-workspace', 'MarkdownWorkspaceToolbar.tsx')
  const markdownToolbarInlineMenusPath = path.resolve(root, 'src', 'features', 'markdown-workspace', 'MarkdownWorkspaceToolbarInlineMenus.tsx')
  const markdownExplorerPath = path.resolve(root, 'src', 'features', 'markdown-workspace', 'MarkdownWorkspaceExplorer.tsx')
  const explorerSearchControlPath = path.resolve(root, 'src', 'features', 'markdown-workspace', 'ExplorerSearchControl.tsx')
  const explorerHeaderActionsPath = path.resolve(root, 'src', 'features', 'markdown-workspace', 'MarkdownWorkspaceExplorerHeaderActions.tsx')
  const workspaceTableModeControlPath = path.resolve(root, 'src', 'features', 'workspace-table', 'ui', 'WorkspaceTableModeControl.tsx')

  const responsiveCss = readUtf8(responsiveCssPath)
  const responsiveElementClasses = readUtf8(responsiveElementClassesPath)
  if (!responsiveCss.includes('.kg-workspace-header-row') || !responsiveCss.includes('.kg-embedded-workspace-main')) {
    throw new Error('Expected shared responsive CSS to own workspace header and embedded workspace bounds')
  }
  if (!responsiveCss.includes('.kg-graph-data-table-menu-form')) {
    throw new Error('Expected shared responsive CSS to own graph-table menu bounds')
  }
  if (!responsiveCss.includes('flex-wrap: nowrap') || !responsiveCss.includes('.kg-icon-button > span')) {
    throw new Error('Expected shared responsive CSS to forbid icon/text wrapping inside toolbar buttons')
  }

  const workspaceHeader = readUtf8(workspaceHeaderPath)
  if (!workspaceHeader.includes('min-w-0 max-w-full shrink-0 overflow-hidden')) {
    throw new Error('Expected WorkspaceHeader to clip inside mobile viewports')
  }
  if (!workspaceHeader.includes('UI_RESPONSIVE_WORKSPACE_HEADER_ROW_CLASSNAME') || !workspaceHeader.includes('uiToolbarRowScrollJustifyBetweenClassName')) {
    throw new Error('Expected WorkspaceHeaderRow to use the shared row-scroll primitive')
  }

  const embeddedWorkspace = readUtf8(embeddedWorkspacePath)
  if (!embeddedWorkspace.includes('kg-embedded-workspace-shell') || !embeddedWorkspace.includes('kg-embedded-workspace-main')) {
    throw new Error('Expected EmbeddedWorkspaceShell to expose shared responsive shell classes')
  }
  if (
    !embeddedWorkspace.includes('UI_RESPONSIVE_EMBEDDED_WORKSPACE_LEFT_CLASSNAME') ||
    embeddedWorkspace.includes('sm:min-w-[280px]') ||
    !responsiveElementClasses.includes('UI_RESPONSIVE_EMBEDDED_WORKSPACE_LEFT_CLASSNAME') ||
    !responsiveCss.includes('.kg-embedded-workspace-left') ||
    !responsiveCss.includes('--kg-embedded-workspace-left-min-width')
  ) {
    throw new Error('Expected EmbeddedWorkspaceShell to release fixed minimum width on mobile')
  }

  const canvasPreviewDock = readUtf8(canvasPreviewDockPath)
  if (!canvasPreviewDock.includes('kg-canvas-preview-dock') || !canvasPreviewDock.includes('kg-canvas-preview-dock--collapsed') || !canvasPreviewDock.includes('--kg-canvas-preview-dock-width') || canvasPreviewDock.includes('style={{ width:')) {
    throw new Error('Expected CanvasPreviewDock to expose responsive dock state classes')
  }

  const toolMenuState = readUtf8(toolMenuStatePath)
  if (!toolMenuState.includes('clampOverlayTopLeftFullyInViewport') || !toolMenuState.includes('(pointer: coarse), (max-width: 768px)')) {
    throw new Error('Expected floating panel drag state to fully clamp mobile panels inside the viewport')
  }

  const graphTableToolbar = readUtf8(graphTableToolbarPath)
  if (!graphTableToolbar.includes('kg-graph-data-table-toolbar') || !graphTableToolbar.includes('kg-graph-data-table-menu-form')) {
    throw new Error('Expected GraphDataTableToolbar controls and menus to use shared responsive classes')
  }
  if (!graphTableToolbar.includes('UI_TEXT_TRUNCATE') || !graphTableToolbar.includes('UI_RESPONSIVE_ELEMENT_ROW_CLASSNAME')) {
    throw new Error('Expected GraphDataTableToolbar labels to ellipsize instead of pushing icons to new rows')
  }

  const graphTableInspector = readUtf8(graphTableInspectorPath)
  if (
    !graphTableInspector.includes('GRAPH_RECORD_INSPECTOR_ROOT_CLASS_NAME') ||
    !graphTableInspector.includes('GRAPH_RECORD_INSPECTOR_DETAIL_GRID_CLASS_NAME') || graphTableInspector.includes('grid-cols-[minmax(0,120px)_minmax(0,1fr)]') ||
    !graphTableInspector.includes('UI_RESPONSIVE_GRAPH_DATA_TABLE_CODE_EDITOR_CLASSNAME') ||
    graphTableInspector.includes('h-[220px]') ||
    !responsiveCss.includes('.kg-graph-data-table-code-editor')
  ) {
    throw new Error('Expected GraphRecordInspector to avoid fixed overflow columns and local fixed code editor heights on mobile')
  }
  const graphDataTable = readUtf8(graphDataTablePath)
  const graphDataTableHeader = readUtf8(graphDataTableHeaderPath)
  const graphDataTableBody = readUtf8(graphDataTableBodyPath)
  const graphDataTableFieldsPanel = readUtf8(graphDataTableFieldsPanelPath)
  const graphDataTableFilterPanel = readUtf8(graphDataTableFilterPanelPath)
  const graphDataTableSortPanel = readUtf8(graphDataTableSortPanelPath)
  const graphDataTableGroupPanel = readUtf8(graphDataTableGroupPanelPath)
  const graphDataTableUiPrimitives = readUtf8(graphDataTableUiPrimitivesPath)
  const graphDataTableToolbarStyles = readUtf8(graphDataTableToolbarStylesPath)
  if (
    !responsiveElementClasses.includes('UI_RESPONSIVE_GRAPH_DATA_TABLE_HEADER_CELL_CLASSNAME') ||
    !responsiveElementClasses.includes('UI_RESPONSIVE_GRAPH_DATA_TABLE_HEADER_CONTENT_CLASSNAME') ||
    !responsiveElementClasses.includes('UI_RESPONSIVE_GRAPH_DATA_TABLE_BODY_CELL_CLASSNAME') ||
    !responsiveElementClasses.includes('UI_RESPONSIVE_GRAPH_DATA_TABLE_TEXT_INPUT_CLASSNAME') ||
    !responsiveElementClasses.includes('UI_RESPONSIVE_GRAPH_DATA_TABLE_PANEL_SEARCH_INPUT_CLASSNAME') ||
    !responsiveElementClasses.includes('UI_RESPONSIVE_GRAPH_DATA_TABLE_PANEL_VALUE_INPUT_CLASSNAME') ||
    !responsiveElementClasses.includes('UI_RESPONSIVE_GRAPH_DATA_TABLE_PANEL_HEADER_ROW_CLASSNAME') ||
    !responsiveElementClasses.includes('UI_RESPONSIVE_GRAPH_DATA_TABLE_PANEL_SEARCH_ROW_CLASSNAME') ||
    !responsiveElementClasses.includes('UI_RESPONSIVE_GRAPH_DATA_TABLE_PANEL_INLINE_ROW_CLASSNAME') ||
    !responsiveElementClasses.includes('UI_RESPONSIVE_GRAPH_DATA_TABLE_PANEL_SPLIT_ROW_CLASSNAME') ||
    !responsiveElementClasses.includes('UI_RESPONSIVE_GRAPH_DATA_TABLE_PANEL_FIELD_ROW_CLASSNAME') ||
    !responsiveElementClasses.includes('UI_RESPONSIVE_GRAPH_DATA_TABLE_PANEL_INLINE_CONTROL_CLASSNAME') ||
    !responsiveElementClasses.includes('UI_RESPONSIVE_GRAPH_DATA_TABLE_PANEL_STACK_CLASSNAME') ||
    !responsiveElementClasses.includes('UI_RESPONSIVE_GRAPH_DATA_TABLE_PANEL_SCROLL_STACK_CLASSNAME') ||
    !responsiveElementClasses.includes('UI_RESPONSIVE_GRAPH_DATA_TABLE_PANEL_SPACIOUS_SCROLL_STACK_CLASSNAME') ||
    !responsiveElementClasses.includes('UI_RESPONSIVE_GRAPH_DATA_TABLE_PANEL_DIVIDER_STACK_CLASSNAME') ||
    !responsiveElementClasses.includes('UI_RESPONSIVE_GRAPH_DATA_TABLE_PANEL_GROUP_FRAME_CLASSNAME') ||
    !responsiveElementClasses.includes('UI_RESPONSIVE_GRAPH_DATA_TABLE_PANEL_WRAP_ROW_CLASSNAME') ||
    !responsiveElementClasses.includes('UI_RESPONSIVE_GRAPH_DATA_TABLE_PANEL_FOOTER_ROW_CLASSNAME') ||
    !responsiveElementClasses.includes('UI_RESPONSIVE_GRAPH_DATA_TABLE_INDEX_COLUMN_CLASSNAME') ||
    !responsiveElementClasses.includes('UI_RESPONSIVE_GRAPH_DATA_TABLE_KIND_CELL_TEXT_CLASSNAME') ||
    !responsiveElementClasses.includes('UI_RESPONSIVE_GRAPH_DATA_TABLE_ID_CELL_TEXT_CLASSNAME') ||
    !responsiveElementClasses.includes('UI_RESPONSIVE_GRAPH_DATA_TABLE_COMPACT_CELL_TEXT_CLASSNAME') ||
    !responsiveElementClasses.includes('UI_RESPONSIVE_GRAPH_DATA_TABLE_ICON_BUTTON_CLASSNAME') ||
    !responsiveElementClasses.includes('UI_RESPONSIVE_GRAPH_DATA_TABLE_SECONDARY_BUTTON_CLASSNAME') ||
    !responsiveElementClasses.includes('UI_RESPONSIVE_GRAPH_DATA_TABLE_TOOLBAR_BUTTON_CLASSNAME') ||
    !responsiveCss.includes('.kg-graph-data-table-header-cell') ||
    !responsiveCss.includes('--kg-graph-data-table-header-height') ||
    !responsiveCss.includes('.kg-graph-data-table-body-cell') ||
    !responsiveCss.includes('--kg-graph-data-table-cell-padding-inline') ||
    !responsiveCss.includes('--kg-graph-data-table-cell-padding-block') ||
    !responsiveCss.includes('.kg-graph-data-table-text-input') ||
    !responsiveCss.includes('--kg-graph-data-table-input-height') ||
    !responsiveCss.includes('--kg-graph-data-table-input-padding-inline') ||
    !responsiveCss.includes('.kg-graph-data-table-panel-search-input') ||
    !responsiveCss.includes('--kg-graph-data-table-panel-search-input-padding-start') ||
    !responsiveCss.includes('.kg-graph-data-table-panel-value-input') ||
    !responsiveCss.includes('--kg-graph-data-table-panel-value-input-width') ||
    !responsiveCss.includes('.kg-graph-data-table-panel-header-row') ||
    !responsiveCss.includes('--kg-graph-data-table-panel-header-row-gap') ||
    !responsiveCss.includes('.kg-graph-data-table-panel-search-row') ||
    !responsiveCss.includes('--kg-graph-data-table-panel-search-row-margin-block-end') ||
    !responsiveCss.includes('.kg-graph-data-table-panel-inline-row') ||
    !responsiveCss.includes('.kg-graph-data-table-panel-split-row') ||
    !responsiveCss.includes('--kg-graph-data-table-panel-row-gap') ||
    !responsiveCss.includes('.kg-graph-data-table-panel-field-row') ||
    !responsiveCss.includes('--kg-graph-data-table-panel-field-row-padding-inline') ||
    !responsiveCss.includes('.kg-graph-data-table-panel-inline-control') ||
    !responsiveCss.includes('--kg-graph-data-table-panel-inline-control-gap') ||
    !responsiveCss.includes('.kg-graph-data-table-panel-scroll-stack') ||
    !responsiveCss.includes('--kg-graph-data-table-panel-scroll-stack-gap') ||
    !responsiveCss.includes('.kg-graph-data-table-panel-group-frame') ||
    !responsiveCss.includes('--kg-graph-data-table-panel-group-frame-padding') ||
    !responsiveCss.includes('.kg-graph-data-table-panel-footer-row') ||
    !responsiveCss.includes('--kg-graph-data-table-panel-footer-row-margin-block-start') ||
    !responsiveCss.includes('.kg-graph-data-table-index-column') ||
    !responsiveCss.includes('--kg-graph-data-table-index-column-width') ||
    !responsiveCss.includes('.kg-graph-data-table-cell-text') ||
    !responsiveCss.includes('--kg-graph-data-table-cell-text-max-width') ||
    !responsiveCss.includes('.kg-graph-data-table-icon-button') ||
    !responsiveCss.includes('.kg-graph-data-table-secondary-button') ||
    !responsiveCss.includes('.kg-graph-data-table-toolbar-button') ||
    !graphDataTable.includes('UI_RESPONSIVE_GRAPH_DATA_TABLE_HEADER_CELL_CLASSNAME') ||
    !graphDataTable.includes('UI_RESPONSIVE_GRAPH_DATA_TABLE_HEADER_CONTENT_CLASSNAME') ||
    !graphDataTable.includes('UI_RESPONSIVE_GRAPH_DATA_TABLE_BODY_CELL_CLASSNAME') ||
    !graphDataTable.includes('UI_RESPONSIVE_GRAPH_DATA_TABLE_TEXT_INPUT_CLASSNAME') ||
    !graphDataTableFieldsPanel.includes('UI_RESPONSIVE_GRAPH_DATA_TABLE_PANEL_SEARCH_INPUT_CLASSNAME') ||
    !graphDataTableFilterPanel.includes('UI_RESPONSIVE_GRAPH_DATA_TABLE_PANEL_VALUE_INPUT_CLASSNAME') ||
    !graphDataTableUiPrimitives.includes('UI_RESPONSIVE_GRAPH_DATA_TABLE_PANEL_SPLIT_ROW_CLASSNAME') ||
    !graphDataTableFieldsPanel.includes('UI_RESPONSIVE_GRAPH_DATA_TABLE_PANEL_HEADER_ROW_CLASSNAME') ||
    !graphDataTableFieldsPanel.includes('UI_RESPONSIVE_GRAPH_DATA_TABLE_PANEL_SEARCH_ROW_CLASSNAME') ||
    !graphDataTableFieldsPanel.includes('UI_RESPONSIVE_GRAPH_DATA_TABLE_PANEL_FIELD_ROW_CLASSNAME') ||
    !graphDataTableSortPanel.includes('UI_RESPONSIVE_GRAPH_DATA_TABLE_PANEL_SCROLL_STACK_CLASSNAME') ||
    !graphDataTableSortPanel.includes('UI_RESPONSIVE_GRAPH_DATA_TABLE_PANEL_FOOTER_ROW_CLASSNAME') ||
    !graphDataTableGroupPanel.includes('UI_RESPONSIVE_GRAPH_DATA_TABLE_PANEL_SPACIOUS_SCROLL_STACK_CLASSNAME') ||
    !graphDataTableGroupPanel.includes('UI_RESPONSIVE_GRAPH_DATA_TABLE_PANEL_DIVIDER_STACK_CLASSNAME') ||
    !graphDataTableGroupPanel.includes('UI_RESPONSIVE_GRAPH_DATA_TABLE_PANEL_INLINE_CONTROL_CLASSNAME') ||
    !graphDataTableFilterPanel.includes('UI_RESPONSIVE_GRAPH_DATA_TABLE_PANEL_GROUP_FRAME_CLASSNAME') ||
    !graphDataTableFilterPanel.includes('UI_RESPONSIVE_GRAPH_DATA_TABLE_PANEL_FOOTER_ROW_CLASSNAME') ||
    !graphDataTable.includes('UI_RESPONSIVE_GRAPH_DATA_TABLE_INDEX_COLUMN_CLASSNAME') ||
    !graphDataTableHeader.includes('var(--kg-graph-data-table-index-column-width, 2rem)') ||
    !graphDataTableBody.includes('UI_RESPONSIVE_GRAPH_DATA_TABLE_KIND_CELL_TEXT_CLASSNAME') ||
    !graphDataTableBody.includes('UI_RESPONSIVE_GRAPH_DATA_TABLE_ID_CELL_TEXT_CLASSNAME') ||
    !graphDataTableBody.includes('UI_RESPONSIVE_GRAPH_DATA_TABLE_COMPACT_CELL_TEXT_CLASSNAME') ||
    !graphDataTableUiPrimitives.includes('UI_RESPONSIVE_GRAPH_DATA_TABLE_ICON_BUTTON_CLASSNAME') ||
    !graphDataTableUiPrimitives.includes('UI_RESPONSIVE_GRAPH_DATA_TABLE_SECONDARY_BUTTON_CLASSNAME') ||
    !graphDataTableToolbarStyles.includes('UI_RESPONSIVE_GRAPH_DATA_TABLE_TOOLBAR_BUTTON_CLASSNAME') ||
    [
      "const headerHeightClassName = 'h-8'",
      "const indexColumnWidthClassName = 'w-8'",
      'h-7 w-full px-2',
      'px-2 ${bodyVerticalPaddingClassName}',
      'style={{ width: 32 }}',
    ].some(snippet => graphDataTable.includes(snippet)) ||
    [graphDataTableUiPrimitives, graphDataTableFieldsPanel, graphDataTableSortPanel, graphDataTableGroupPanel, graphDataTableFilterPanel].some(text =>
      [
        'inline-flex items-center justify-between gap-2',
        'mb-2 flex items-center justify-between gap-2',
        'mb-3 flex items-center gap-2',
        'flex items-center justify-between gap-2',
        'flex items-center gap-2',
        'flex flex-1 flex-col gap-2 overflow-auto pt-2 pb-4',
        'flex flex-1 gap-2 flex-col overflow-auto pt-2 pb-4',
        'flex flex-1 flex-col gap-3 overflow-auto pt-2 pb-4',
        'flex flex-col gap-2',
        'flex flex-wrap gap-2',
        'inline-flex items-center gap-1',
      ].some(snippet => text.includes(snippet))
    ) ||
    graphDataTableFieldsPanel.includes('h-7 w-full rounded-md border') ||
    graphDataTableFieldsPanel.includes('pl-7 pr-2') ||
    graphDataTableFilterPanel.includes('h-8 w-40 rounded-md border') ||
    [graphDataTableUiPrimitives, graphDataTableToolbarStyles].some(text =>
      text.includes('h-7 w-7') ||
      text.includes('h-7 px-2')
    ) ||
    ['max-w-16', 'max-w-40', 'max-w-52'].some(snippet => graphDataTableBody.includes(snippet))
  ) {
    throw new Error('Expected GraphDataTable sizing, buttons, and cell text clamps to reuse shared responsive table owners')
  }

  const markdownToolbar = readUtf8(markdownToolbarPath)
  const markdownToolbarInlineMenus = readUtf8(markdownToolbarInlineMenusPath)
  if (!markdownToolbar.includes('kg-workspace-toolbar-controls') || !markdownToolbar.includes('uiToolbarRowScrollClassName')) {
    throw new Error('Expected MarkdownWorkspaceToolbar controls to scroll on one mobile row')
  }
  if (!markdownToolbar.includes('UI_TEXT_TRUNCATE')) {
    throw new Error('Expected MarkdownWorkspaceToolbar labels to use shared ellipsis')
  }
  if (
    !markdownToolbar.includes('UI_RESPONSIVE_DEFAULT_GLYPH_CLASSNAME') ||
    !markdownToolbar.includes('MARKDOWN_WORKSPACE_TOOLBAR_GLYPH_CLASSNAME') ||
    !markdownToolbarInlineMenus.includes('UI_RESPONSIVE_DEFAULT_GLYPH_CLASSNAME') ||
    !markdownToolbarInlineMenus.includes('markdownWorkspaceToolbarGlyphClassName') ||
    [markdownToolbar, markdownToolbarInlineMenus].some(text =>
      text.includes('className="w-4 h-4"') ||
      text.includes("className='w-4 h-4'") ||
      text.includes('className="h-4 w-4"') ||
      text.includes("className='h-4 w-4'")
    )
  ) {
    throw new Error('Expected MarkdownWorkspaceToolbar action glyphs to reuse shared responsive default glyph sizing')
  }

  const markdownExplorer = readUtf8(markdownExplorerPath)
  if (
    !markdownExplorer.includes('WorkspaceHeaderRow') ||
    !markdownExplorer.includes('kg-markdown-workspace-panel-toolbar-row') ||
    markdownExplorer.includes('UI_RESPONSIVE_WORKSPACE_HEADER_ROW_CLASSNAME') ||
    markdownExplorer.includes('uiToolbarRowScrollJustifyBetweenClassName')
  ) {
    throw new Error('Expected MarkdownWorkspaceExplorer header to use the shared workspace toolbar row without duplicated row-scroll wiring')
  }
  const explorerSearchControl = readUtf8(explorerSearchControlPath)
  const explorerHeaderActions = readUtf8(explorerHeaderActionsPath)
  if (
    !explorerSearchControl.includes('UI_RESPONSIVE_DEFAULT_GLYPH_CLASSNAME') ||
    !explorerSearchControl.includes('explorerSearchIconClassName') ||
    !explorerHeaderActions.includes('UI_RESPONSIVE_DEFAULT_GLYPH_CLASSNAME') ||
    !explorerHeaderActions.includes('explorerHeaderActionIconClassName') ||
    [explorerSearchControl, explorerHeaderActions].some(text =>
      text.includes('className="w-4 h-4"') ||
      text.includes("className='w-4 h-4'") ||
      text.includes('className="h-4 w-4"') ||
      text.includes("className='h-4 w-4'") ||
      text.includes('className="w-4 h-4 shrink-0"') ||
      text.includes("className='w-4 h-4 shrink-0'")
    )
  ) {
    throw new Error('Expected Markdown workspace Explorer action glyphs to reuse shared responsive default glyph sizing')
  }

  const workspaceTableModeControl = readUtf8(workspaceTableModeControlPath)
  if (!workspaceTableModeControl.includes('UI_TEXT_TRUNCATE') || !workspaceTableModeControl.includes('uiToolbarRowScrollJustifyBetweenClassName')) {
    throw new Error('Expected WorkspaceTableModeControl rows to stay bounded with one-row scrolling')
  }
}

export const testResponsiveMenusAndDataViewSurfacesStayBounded = () => {
  const root = process.cwd()
  const responsiveCssPath = path.resolve(root, 'src', 'styles', 'responsive-toolbar.css')
  const responsiveElementClassesPath = path.resolve(root, 'src', 'lib', 'ui', 'responsiveElementClasses.ts')
  const overlayPath = path.resolve(root, 'src', 'lib', 'ui', 'overlay.tsx')
  const toolbarDropdownPath = path.resolve(root, 'src', 'components', 'toolbar', 'ToolbarDropdownSelect.tsx')
  const interactionModeSelectPath = path.resolve(root, 'src', 'components', 'toolbar', 'InteractionModeSelect.tsx')
  const canvas2dRendererSelectPath = path.resolve(root, 'src', 'components', 'toolbar', 'Canvas2dRendererSelect.tsx')
  const zoomModeSelectPath = path.resolve(root, 'src', 'components', 'toolbar', 'ZoomModeSelect.tsx')
  const documentModeSelectPath = path.resolve(root, 'src', 'components', 'toolbar', 'DocumentModeSelect.tsx')
  const editorWorkspaceSelectPath = path.resolve(root, 'src', 'components', 'toolbar', 'EditorWorkspaceSelect.tsx')
  const toolbarToolMenuPath = path.resolve(root, 'src', 'lib', 'toolbar', 'ToolbarToolMenu.impl.tsx')
  const designFloatingPanelPath = path.resolve(root, 'src', 'features', 'design', 'DesignFloatingPanelView.tsx')
  const floatingPropsPanelPath = path.resolve(root, 'src', 'features', 'toolbar', 'FloatingPropsPanel.tsx')
  const storyboardWidgetInspectorTabsPath = path.resolve(root, 'src', 'components', 'StoryboardWidget', 'StoryboardWidgetInspectorTabs.tsx')
  const collaborationViewPath = path.resolve(root, 'src', 'features', 'panels', 'views', 'CollaborationView.tsx')
  const floatingPanelChatSectionsPath = path.resolve(root, 'src', 'features', 'chat', 'FloatingPanelChatSections.tsx')
  const chatModelCredentialControlsPath = path.resolve(root, 'src', 'features', 'chat', 'ChatModelCredentialControls.tsx')
  const grabMapsDiscoveryWidgetSectionPath = path.resolve(root, 'src', 'features', 'toolbar', 'GrabMapsDiscoveryWidgetSection.tsx')
  const grabMapsDiscoverySettingsGridPath = path.resolve(root, 'src', 'features', 'toolbar', 'GrabMapsDiscoverySettingsGrid.tsx')
  const designTokensPanelPath = path.resolve(root, 'src', 'features', 'design', 'DesignTokensPanel.tsx')
  const designDomTreePanelPath = path.resolve(root, 'src', 'features', 'design', 'DesignDomTreePanel.tsx')
  const designLayersPanelPath = path.resolve(root, 'src', 'features', 'design', 'DesignLayersPanel.tsx')
  const designDomInspectPanelPath = path.resolve(root, 'src', 'features', 'design', 'DesignDomInspectPanel.tsx')
  const mainPanelStoryboardWidgetManagerHeaderPath = path.resolve(root, 'src', 'features', 'panels', 'ui', 'MainPanelStoryboardWidgetManagerHeader.tsx')
  const storyboardWidgetGraphTabPath = path.resolve(root, 'src', 'features', 'storyboard-widget-manager', 'StoryboardWidgetGraphTab.tsx')
  const storyboardWidgetSpecificationTabPath = path.resolve(root, 'src', 'features', 'storyboard-widget-manager', 'StoryboardWidgetSpecificationTab.tsx')
  const storyboardWidgetMappingTabLayoutPath = path.resolve(root, 'src', 'features', 'storyboard-widget-manager', 'StoryboardWidgetMappingTabLayout.tsx')
  const widgetEditorSchemaTablePath = path.resolve(root, 'src', 'components', 'StoryboardWidget', 'WidgetEditorSchemaTable.tsx')
  const historyViewPath = path.resolve(root, 'src', 'features', 'panels', 'views', 'HistoryView.tsx')
  const searchPanelPath = path.resolve(root, 'src', 'components', 'SearchPanel.tsx')
  const launchDropdownPath = path.resolve(root, 'src', 'lib', 'toolbar', 'LaunchDropdown.impl.tsx')
  const launchDropdownExportPath = path.resolve(root, 'src', 'lib', 'toolbar', 'LaunchDropdownExportMenu.tsx')
  const launchDropdownImportUrlItemPath = path.resolve(root, 'src', 'lib', 'toolbar', 'LaunchDropdownImportUrlItem.tsx')
  const columnHeaderMenuPath = path.resolve(root, 'src', 'components', 'ui', 'ColumnHeaderMenu.tsx')
  const columnHeaderPropertyTypeMenuPath = path.resolve(root, 'src', 'components', 'ui', 'ColumnHeaderPropertyTypeMenu.tsx')
  const typeMenuPath = path.resolve(root, 'src', 'components', 'ui', 'TypeMenu.tsx')
  const graphDataTableHeaderPath = path.resolve(root, 'src', 'features', 'graph-data-table', 'ui', 'GraphDataTableHeader.tsx')
  const graphTableFastGridHeaderPath = path.resolve(root, 'src', 'features', 'graph-data-table', 'ui', 'GraphDataTableFastGridHeader.tsx')
  const dataViewHeaderPath = path.resolve(root, 'src', 'features', 'markdown-workspace', 'main', 'viewer', 'WorkspaceDataViewHeader.tsx')
  const dataViewPanelPath = path.resolve(root, 'src', 'features', 'markdown-workspace', 'main', 'viewer', 'WorkspaceDataViewSettingsPanel.tsx')
  const dataViewPropertiesPath = path.resolve(root, 'src', 'features', 'markdown-workspace', 'main', 'viewer', 'WorkspaceDataViewSettingsPropertiesSection.tsx')
  const dataViewPrimitivesPath = path.resolve(root, 'src', 'features', 'markdown-workspace', 'main', 'viewer', 'WorkspaceDataViewSettingsPrimitives.tsx')
  const dataViewFilterPath = path.resolve(root, 'src', 'features', 'markdown-workspace', 'main', 'viewer', 'WorkspaceDataViewFilterMenu.tsx')
  const dataViewChipsPath = path.resolve(root, 'src', 'features', 'markdown', 'ui', 'MarkdownDataViewChips.tsx')
  const dataViewChipStylesPath = path.resolve(root, 'src', 'features', 'markdown', 'ui', 'dataViewChipStyles.ts')
  const dataViewAddColumnPath = path.resolve(root, 'src', 'features', 'markdown', 'ui', 'MarkdownDataViewAddColumnMenu.tsx')
  const dataViewTablePath = path.resolve(root, 'src', 'features', 'markdown', 'ui', 'MarkdownDataViewTableView.tsx')
  const kanbanCardPath = path.resolve(root, 'src', 'features', 'markdown', 'ui', 'kanban', 'KanbanCard.tsx')
  const dateCellEditorPath = path.resolve(root, 'src', 'features', 'graph-data-table', 'ui', 'fast-grid', 'DateCellEditor.tsx')
  const flowMappingRowsTablePath = path.resolve(root, 'src', 'features', 'storyboard-widget-manager', 'FlowMappingRowsTable.tsx')
  const widgetRegistryTablePath = path.resolve(root, 'src', 'features', 'storyboard-widget-manager', 'WidgetRegistryTable.tsx')
  const widgetRegistryFieldsEditorPath = path.resolve(root, 'src', 'features', 'storyboard-widget-manager', 'WidgetRegistryFieldsEditor.tsx')
  const widgetRegistryPortsEditorPath = path.resolve(root, 'src', 'features', 'storyboard-widget-manager', 'WidgetRegistryPortsEditor.tsx')
  const widgetRegistrySchemaMappingsEditorPath = path.resolve(root, 'src', 'features', 'storyboard-widget-manager', 'WidgetRegistrySchemaMappingsEditor.tsx')
  const storyboardWidgetMappingSettingsPanelPath = path.resolve(root, 'src', 'features', 'storyboard-widget-manager', 'StoryboardWidgetMappingSettingsPanel.tsx')
  const expandCollapseAllButtonPath = path.resolve(root, 'src', 'features', 'panels', 'ui', 'ExpandCollapseAllButton.tsx')
  const fileTreePath = path.resolve(root, 'src', 'features', 'markdown-workspace', 'MarkdownFileTree.tsx')
  const floatingMenuStylesPath = path.resolve(root, 'src', 'features', 'markdown-workspace', 'main', 'viewer', 'floatingMenuStyles.ts')

  const responsiveCss = readUtf8(responsiveCssPath)
  const responsiveElementClasses = readUtf8(responsiveElementClassesPath)
  if (
    !responsiveElementClasses.includes('UI_RESPONSIVE_COLUMN_HEADER_MENU_PANEL_CLASSNAME') ||
    !responsiveElementClasses.includes('UI_RESPONSIVE_COLUMN_HEADER_FILTER_PANEL_CLASSNAME') ||
    !responsiveElementClasses.includes('UI_RESPONSIVE_COLUMN_HEADER_FILTER_LABEL_CLASSNAME') ||
    !responsiveElementClasses.includes('UI_RESPONSIVE_COLUMN_HEADER_FILTER_FIELD_CLASSNAME') ||
    !responsiveElementClasses.includes('UI_RESPONSIVE_COLUMN_HEADER_FILTER_ACTION_CLASSNAME') ||
    !responsiveElementClasses.includes('UI_RESPONSIVE_COLUMN_HEADER_TYPE_VALUE_CLASSNAME') ||
    !responsiveElementClasses.includes('UI_RESPONSIVE_TYPE_MENU_PANEL_CLASSNAME') ||
    !responsiveElementClasses.includes('UI_RESPONSIVE_DATA_VIEW_FILTER_MENU_PANEL_CLASSNAME') ||
    !responsiveElementClasses.includes('UI_RESPONSIVE_DATA_VIEW_KANBAN_GROUP_CLASSNAME') ||
    !responsiveElementClasses.includes('UI_RESPONSIVE_KANBAN_DROP_INDICATOR_CLASSNAME') ||
    !responsiveElementClasses.includes('UI_RESPONSIVE_DATA_VIEW_KANBAN_CARD_LIST_CLASSNAME') ||
    !responsiveElementClasses.includes('UI_RESPONSIVE_DATA_VIEW_KANBAN_STATUS_ROW_CLASSNAME') ||
    !responsiveElementClasses.includes('UI_RESPONSIVE_DATA_VIEW_REORDER_INDICATOR_CLASSNAME') ||
    !responsiveElementClasses.includes('UI_RESPONSIVE_DATA_VIEW_SETTINGS_ROW_VALUE_CLASSNAME') ||
    !responsiveElementClasses.includes('UI_RESPONSIVE_DATA_VIEW_SETTINGS_LAYOUT_CHOICE_CLASSNAME') ||
    !responsiveElementClasses.includes('UI_RESPONSIVE_DATA_VIEW_HEADER_ACTIONS_CLASSNAME') ||
    !responsiveElementClasses.includes('UI_RESPONSIVE_DATA_VIEW_TABLE_FRAME_CLASSNAME') ||
    !responsiveElementClasses.includes('UI_RESPONSIVE_MENU_OPTION_ROW_CLASSNAME') ||
    !responsiveElementClasses.includes('UI_RESPONSIVE_TOUCH_MENU_OPTION_ROW_CLASSNAME') ||
    !responsiveElementClasses.includes('UI_RESPONSIVE_WIDE_TOOLBAR_DROPDOWN_PANEL_CLASSNAME') ||
    !responsiveElementClasses.includes('UI_RESPONSIVE_EXTRA_WIDE_TOOLBAR_DROPDOWN_WIDTH_CLASSNAME') ||
    !responsiveElementClasses.includes('UI_RESPONSIVE_NARROW_TOOLBAR_DROPDOWN_WIDTH_CLASSNAME') ||
    !responsiveElementClasses.includes('UI_RESPONSIVE_COMPACT_TOOLBAR_DROPDOWN_WIDTH_CLASSNAME') ||
    !responsiveElementClasses.includes('UI_RESPONSIVE_SLIM_TOOLBAR_DROPDOWN_WIDTH_CLASSNAME') ||
    !responsiveElementClasses.includes('UI_RESPONSIVE_TINY_TOOLBAR_DROPDOWN_WIDTH_CLASSNAME') ||
    !responsiveElementClasses.includes('UI_RESPONSIVE_TOOLBAR_DROPDOWN_OPTION_META_CLASSNAME') ||
    !responsiveElementClasses.includes('UI_RESPONSIVE_TOOLBAR_DROPDOWN_OPTION_HINT_CLASSNAME') ||
    !responsiveElementClasses.includes('UI_RESPONSIVE_FLOATING_PANEL_SUBPANEL_CLASSNAME') ||
    !responsiveElementClasses.includes('UI_RESPONSIVE_PANEL_FLEX_INPUT_CLASSNAME') ||
    !responsiveElementClasses.includes('UI_RESPONSIVE_COMPACT_PANEL_FIELD_INPUT_CLASSNAME') ||
    !responsiveElementClasses.includes('UI_RESPONSIVE_PANEL_TABLE_FIELD_INPUT_CLASSNAME') ||
    !responsiveElementClasses.includes('UI_RESPONSIVE_PANEL_INLINE_FIELD_CLASSNAME') ||
    !responsiveElementClasses.includes('UI_RESPONSIVE_PANEL_TEXT_ACTION_BUTTON_CLASSNAME')
  ) {
    throw new Error('Expected data-view column, type, filter, kanban, toolbar dropdown, floating subpanel, and panel input surfaces to expose shared responsive owner class names')
  }
  if (!responsiveCss.includes('.kg-toolbar-dropdown-menu') || !responsiveCss.includes('.kg-toolbar-dropdown-menu--wide') || !responsiveCss.includes('.kg-toolbar-dropdown-menu--extra-wide') || !responsiveCss.includes('--kg-toolbar-dropdown-inline-clearance') || !responsiveCss.includes('.kg-toolbar-dropdown-menu--narrow') || !responsiveCss.includes('.kg-toolbar-dropdown-menu--compact') || !responsiveCss.includes('.kg-toolbar-dropdown-menu--slim') || !responsiveCss.includes('.kg-toolbar-dropdown-menu--tiny') || !responsiveCss.includes('.kg-toolbar-dropdown-option-meta') || !responsiveCss.includes('--kg-toolbar-dropdown-option-meta-max-width') || !responsiveCss.includes('--kg-toolbar-dropdown-width') || !responsiveCss.includes('.kg-floating-panel-subpanel') || !responsiveCss.includes('--kg-floating-panel-subpanel-min-width') || !responsiveCss.includes('.kg-responsive-panel-flex-input') || !responsiveCss.includes('--kg-responsive-panel-flex-input-min-width') || !responsiveCss.includes('.kg-responsive-panel-inline-field') || !responsiveCss.includes('--kg-responsive-panel-inline-field-height') || !responsiveCss.includes('--kg-responsive-panel-inline-field-padding-inline') || !responsiveCss.includes('--kg-responsive-panel-inline-field-padding-block') || !responsiveCss.includes('.kg-column-header-menu')) {
    throw new Error('Expected shared responsive CSS to bound toolbar and column menus')
  }
  if (!responsiveCss.includes('.kg-menu-option-row') || !responsiveCss.includes('--kg-menu-option-row-padding-inline') || !responsiveCss.includes('.kg-toolbar-dropdown-option-hint') || !responsiveCss.includes('--kg-toolbar-dropdown-option-hint-padding-inline')) {
    throw new Error('Expected shared responsive CSS to own toolbar dropdown option row and hint sizing')
  }
  if (!responsiveCss.includes('.kg-column-header-filter-editor') || !responsiveCss.includes('.kg-column-header-filter-label') || !responsiveCss.includes('--kg-column-header-filter-label-width') || !responsiveCss.includes('.kg-column-header-filter-field') || !responsiveCss.includes('--kg-column-header-filter-field-height') || !responsiveCss.includes('--kg-column-header-filter-field-padding-inline') || !responsiveCss.includes('.kg-column-header-filter-action') || !responsiveCss.includes('--kg-column-header-filter-action-height') || !responsiveCss.includes('--kg-column-header-filter-action-padding-inline') || !responsiveCss.includes('.kg-column-header-type-value') || !responsiveCss.includes('--kg-column-header-type-value-max-width') || !responsiveCss.includes('.kg-type-menu') || !responsiveCss.includes('.kg-data-view-filter-menu')) {
    throw new Error('Expected shared responsive CSS to own column filter actions, type menu, and data-view filter menu sizing')
  }
  if (!responsiveCss.includes('.kg-data-view-settings-panel') || !responsiveCss.includes('.kg-data-view-settings-row-value') || !responsiveCss.includes('--kg-data-view-settings-row-value-max-width') || !responsiveCss.includes('.kg-data-view-settings-layout-choice') || !responsiveCss.includes('--kg-data-view-settings-layout-choice-min-width') || !responsiveCss.includes('.kg-data-view-table-frame') || !responsiveCss.includes('--kg-data-view-table-frame-max-height') || !responsiveCss.includes('.kg-data-view-kanban-group') || !responsiveCss.includes('.kg-kanban-drop-indicator') || !responsiveCss.includes('--kg-kanban-drop-indicator-thickness') || !responsiveCss.includes('.kg-data-view-kanban-card-list') || !responsiveCss.includes('--kg-data-view-kanban-card-list-max-height') || !responsiveCss.includes('.kg-data-view-kanban-status-row') || !responsiveCss.includes('--kg-data-view-kanban-status-row-min-height') || !responsiveCss.includes('.kg-data-view-reorder-indicator') || !responsiveCss.includes('--kg-data-view-reorder-indicator-thickness') || !responsiveCss.includes('.kg-data-view-header-actions') || !responsiveCss.includes('--kg-data-view-header-actions-max-width')) {
    throw new Error('Expected shared responsive CSS to bound data-view panels and kanban groups')
  }
  if (!responsiveCss.includes('.kg-click-expand-menu-children') || !responsiveCss.includes('.kg-menu-row svg')) {
    throw new Error('Expected nested menu children and menu icons to avoid offscreen transforms and icon wrapping')
  }
  const overlay = readUtf8(overlayPath)
  if (!overlay.includes('clampOverlayTopLeftFullyInViewport') || !overlay.includes('kg-anchor-overlay') || overlay.includes("maxWidth: 'calc(100vw") || overlay.includes("maxHeight: 'var(--kg-overlay-max-height") || overlay.includes('overscrollBehavior')) {
    throw new Error('Expected AnchorOverlay to clamp dropdowns through placement code and shared responsive CSS')
  }
  const toolbarDropdown = readUtf8(toolbarDropdownPath)
  if (!toolbarDropdown.includes('kg-toolbar-dropdown-menu') || !toolbarDropdown.includes('kg-toolbar-dropdown-children') || !toolbarDropdown.includes('aria-expanded') || !toolbarDropdown.includes('UI_RESPONSIVE_TOUCH_MENU_OPTION_ROW_CLASSNAME') || !toolbarDropdown.includes('UI_RESPONSIVE_TOOLBAR_DROPDOWN_OPTION_META_CLASSNAME') || !toolbarDropdown.includes('UI_RESPONSIVE_TOOLBAR_DROPDOWN_OPTION_HINT_CLASSNAME') || !toolbarDropdown.includes('UI_RESPONSIVE_COMPACT_GLYPH_CLASSNAME') || !toolbarDropdown.includes('toolbarDropdownChevronClassName') || !toolbarDropdown.includes("menuWidthClass = ''") || toolbarDropdown.includes("menuWidthClass = 'w-72'") || toolbarDropdown.includes('max-w-[45%]') || toolbarDropdown.includes('gap-2 rounded px-2 py-1 text-sm') || toolbarDropdown.includes('px-2 py-0.5 text-[10px]') || toolbarDropdown.includes('h-3 w-3') || toolbarDropdown.includes('w-3 h-3')) {
    throw new Error('Expected toolbar dropdown groups, hints, and nested chevrons to use shared responsive owners')
  }
  const editorWorkspaceSelect = readUtf8(editorWorkspaceSelectPath)
  if (!editorWorkspaceSelect.includes('UI_RESPONSIVE_MENU_OPTION_ROW_CLASSNAME') || editorWorkspaceSelect.includes('gap-2 rounded px-2 py-1 text-sm')) {
    throw new Error('Expected EditorWorkspaceSelect appended rows to use the shared toolbar dropdown option row owner')
  }
  const interactionModeSelect = readUtf8(interactionModeSelectPath)
  if (interactionModeSelect.includes('menuWidthClass="w-72"')) {
    throw new Error('Expected InteractionModeSelect to inherit the shared toolbar dropdown default width')
  }
  const canvas2dRendererSelect = readUtf8(canvas2dRendererSelectPath)
  if (
    !canvas2dRendererSelect.includes('UI_RESPONSIVE_EXTRA_WIDE_TOOLBAR_DROPDOWN_WIDTH_CLASSNAME') ||
    canvas2dRendererSelect.includes('[--kg-toolbar-dropdown-width:24rem]') ||
    canvas2dRendererSelect.includes('max-w-[calc(100vw_-_2rem)]')
  ) {
    throw new Error('Expected Canvas2dRendererSelect to reuse the shared extra-wide toolbar dropdown owner')
  }
  const compactToolbarDropdowns = [
    readUtf8(zoomModeSelectPath),
    readUtf8(documentModeSelectPath),
    readUtf8(editorWorkspaceSelectPath),
  ]
  if (
    compactToolbarDropdowns.some(text => !text.includes('UI_RESPONSIVE_COMPACT_TOOLBAR_DROPDOWN_WIDTH_CLASSNAME')) ||
    compactToolbarDropdowns.some(text => text.includes('menuWidthClass="w-64"'))
  ) {
    throw new Error('Expected compact toolbar dropdowns to reuse the shared compact width owner')
  }
  const narrowToolbarDropdowns = [
    readUtf8(toolbarToolMenuPath),
    readUtf8(designFloatingPanelPath),
  ]
  const storyboardWidgetSpecificationTab = readUtf8(storyboardWidgetSpecificationTabPath)
  const slimToolbarDropdowns = [
    readUtf8(mainPanelStoryboardWidgetManagerHeaderPath),
    storyboardWidgetSpecificationTab,
  ]
  const tinyToolbarDropdown = readUtf8(historyViewPath)
  const storyboardWidgetInspectorTabs = readUtf8(storyboardWidgetInspectorTabsPath)
  if (
    narrowToolbarDropdowns.some(text => !text.includes('UI_RESPONSIVE_NARROW_TOOLBAR_DROPDOWN_WIDTH_CLASSNAME')) ||
    narrowToolbarDropdowns.some(text => text.includes('menuWidthClass="w-56"')) ||
    slimToolbarDropdowns.some(text => !text.includes('UI_RESPONSIVE_SLIM_TOOLBAR_DROPDOWN_WIDTH_CLASSNAME')) ||
    slimToolbarDropdowns.some(text => text.includes('menuWidthClass="w-44"')) ||
    (tinyToolbarDropdown.includes('ToolbarDropdownSelect') && !tinyToolbarDropdown.includes('UI_RESPONSIVE_TINY_TOOLBAR_DROPDOWN_WIDTH_CLASSNAME')) ||
    tinyToolbarDropdown.includes('menuWidthClass="w-40"') ||
    !storyboardWidgetInspectorTabs.includes('UI_RESPONSIVE_TINY_TOOLBAR_DROPDOWN_WIDTH_CLASSNAME') ||
    storyboardWidgetInspectorTabs.includes('menuWidthClass="w-40"')
  ) {
    throw new Error('Expected narrow, slim, and tiny toolbar dropdowns to reuse shared width owners')
  }
  const collaborationView = readUtf8(collaborationViewPath)
  const floatingPanelChatSections = readUtf8(floatingPanelChatSectionsPath)
  const chatModelCredentialControls = readUtf8(chatModelCredentialControlsPath)
  const grabMapsDiscoveryWidgetSection = readUtf8(grabMapsDiscoveryWidgetSectionPath)
  const grabMapsDiscoverySettingsGrid = readUtf8(grabMapsDiscoverySettingsGridPath)
  const widgetEditorSchemaTable = readUtf8(widgetEditorSchemaTablePath)
  if (
    !collaborationView.includes('UI_RESPONSIVE_PANEL_FLEX_INPUT_CLASSNAME') ||
    collaborationView.includes('min-w-[14rem]')
  ) {
    throw new Error('Expected Collaboration panel invite and answer input shells to reuse the shared responsive flex input owner')
  }
  if (
    !floatingPanelChatSections.includes('UI_RESPONSIVE_CHAT_MESSAGE_BUBBLE_CLASSNAME') ||
    !['UI_RESPONSIVE_COMPACT_PANEL_FIELD_INPUT_CLASSNAME', 'UI_RESPONSIVE_CONTROL_COMPACT_VALUE_ROW_CLASSNAME', 'UI_RESPONSIVE_CONTROL_INLINE_FILL_CLASSNAME', 'htmlFor={chatModelSelectId}', 'data-kg-chat-model-select="true"'].every(snippet => chatModelCredentialControls.includes(snippet)) ||
    !grabMapsDiscoverySettingsGrid.includes('UI_RESPONSIVE_COMPACT_PANEL_FIELD_INPUT_CLASSNAME') || !responsiveCss.includes('.kg-floating-chat-message-bubble') || !responsiveCss.includes('.kg-responsive-compact-panel-field-input') ||
    !responsiveCss.includes('--kg-responsive-compact-panel-field-input-height') ||
    !responsiveCss.includes('--kg-responsive-compact-panel-field-input-padding-inline') ||
    floatingPanelChatSections.includes('max-w-[85%]') || chatModelCredentialControls.includes('h-7 px-2') ||
    grabMapsDiscoverySettingsGrid.includes('h-7 w-full rounded border px-2')
  ) {
    throw new Error('Expected chat bubbles and compact panel setting fields to reuse shared responsive owners')
  }
  if (
    !grabMapsDiscoveryWidgetSection.includes('UI_RESPONSIVE_PANEL_TEXT_ACTION_BUTTON_CLASSNAME') ||
    !responsiveCss.includes('.kg-responsive-panel-text-action-button') ||
    !responsiveCss.includes('--kg-responsive-panel-text-action-button-height') ||
    !responsiveCss.includes('--kg-responsive-panel-text-action-button-padding-inline') ||
    grabMapsDiscoveryWidgetSection.includes('inline-flex h-8 items-center gap-1 rounded border px-2 text-sm') ||
    grabMapsDiscoveryWidgetSection.includes('inline-flex h-8 items-center gap-1 rounded px-2 text-sm')
  ) {
    throw new Error('Expected panel text actions to reuse the shared responsive action button owner')
  }
  if (
    !widgetEditorSchemaTable.includes('UI_RESPONSIVE_PANEL_TABLE_FIELD_INPUT_CLASSNAME') ||
    !responsiveCss.includes('.kg-responsive-panel-table-field-input') ||
    !responsiveCss.includes('--kg-responsive-panel-table-field-input-height') ||
    !responsiveCss.includes('--kg-responsive-panel-table-field-input-padding-inline') ||
    widgetEditorSchemaTable.includes('w-full h-8 rounded-md px-2')
  ) {
    throw new Error('Expected panel table fields to reuse the shared responsive input owner')
  }
  const floatingSubpanels = [
    readUtf8(floatingPropsPanelPath),
    readUtf8(designTokensPanelPath),
    readUtf8(designDomTreePanelPath),
    readUtf8(designLayersPanelPath),
    readUtf8(designDomInspectPanelPath),
  ]
  const designDomTreePanel = readUtf8(designDomTreePanelPath)
  const designLayersPanel = readUtf8(designLayersPanelPath)
  const designPanelTexts = [designDomTreePanel, designLayersPanel]
  if (
    floatingSubpanels.some(text => !text.includes('UI_RESPONSIVE_FLOATING_PANEL_SUBPANEL_CLASSNAME')) ||
    floatingSubpanels.some(text => text.includes('min-w-56'))
  ) {
    throw new Error('Expected floating props and design subpanels to reuse the shared responsive subpanel width owner')
  }
  if (
    !responsiveElementClasses.includes('UI_RESPONSIVE_DESIGN_PANEL_HEADER_ROW_CLASSNAME') ||
    !responsiveElementClasses.includes('UI_RESPONSIVE_DESIGN_PANEL_SEARCH_BLOCK_CLASSNAME') ||
    !responsiveElementClasses.includes('UI_RESPONSIVE_DESIGN_PANEL_SEARCH_FIELD_CLASSNAME') ||
    !responsiveElementClasses.includes('UI_RESPONSIVE_DESIGN_PANEL_CONTENT_CLASSNAME') ||
    !responsiveElementClasses.includes('UI_RESPONSIVE_DESIGN_PANEL_EMPTY_ROW_CLASSNAME') ||
    !responsiveElementClasses.includes('UI_RESPONSIVE_DESIGN_PANEL_LIST_ROW_CLASSNAME') ||
    !responsiveElementClasses.includes('UI_RESPONSIVE_DESIGN_PANEL_TREE_ROW_CLASSNAME') ||
    !responsiveElementClasses.includes('UI_RESPONSIVE_DESIGN_PANEL_ROW_ACTION_CLASSNAME') ||
    !responsiveElementClasses.includes('UI_RESPONSIVE_DESIGN_PANEL_REORDER_ROW_CLASSNAME') ||
    !responsiveCss.includes('.kg-design-panel-header-row') ||
    !responsiveCss.includes('--kg-design-panel-header-row-padding-inline') ||
    !responsiveCss.includes('.kg-design-panel-search-block') ||
    !responsiveCss.includes('--kg-design-panel-search-block-padding-inline') ||
    !responsiveCss.includes('.kg-design-panel-search-field') ||
    !responsiveCss.includes('--kg-design-panel-search-field-padding-inline') ||
    !responsiveCss.includes('.kg-design-panel-content') ||
    !responsiveCss.includes('--kg-design-panel-content-padding-inline') ||
    !responsiveCss.includes('.kg-design-panel-empty-row') ||
    !responsiveCss.includes('--kg-design-panel-empty-row-padding-inline') ||
    !responsiveCss.includes('.kg-design-panel-list-row') ||
    !responsiveCss.includes('--kg-design-panel-list-row-padding-inline') ||
    !responsiveCss.includes('.kg-design-panel-tree-row') ||
    !responsiveCss.includes('--kg-design-panel-tree-row-padding-inline') ||
    !responsiveCss.includes('.kg-design-panel-row-action') ||
    !responsiveCss.includes('--kg-design-panel-row-action-padding-inline') ||
    !responsiveCss.includes('.kg-design-panel-reorder-row') ||
    !responsiveCss.includes('--kg-design-panel-reorder-row-gap') ||
    !designDomTreePanel.includes('UI_RESPONSIVE_DESIGN_PANEL_CONTENT_CLASSNAME') ||
    !designDomTreePanel.includes('UI_RESPONSIVE_DESIGN_PANEL_TREE_ROW_CLASSNAME') ||
    !designLayersPanel.includes('UI_RESPONSIVE_DESIGN_PANEL_LIST_ROW_CLASSNAME') ||
    !designLayersPanel.includes('UI_RESPONSIVE_DESIGN_PANEL_REORDER_ROW_CLASSNAME') ||
    designPanelTexts.some(text =>
      [
        'UI_RESPONSIVE_DESIGN_PANEL_HEADER_ROW_CLASSNAME',
        'UI_RESPONSIVE_DESIGN_PANEL_SEARCH_BLOCK_CLASSNAME',
        'UI_RESPONSIVE_DESIGN_PANEL_SEARCH_FIELD_CLASSNAME',
        'UI_RESPONSIVE_DESIGN_PANEL_EMPTY_ROW_CLASSNAME',
        'UI_RESPONSIVE_DESIGN_PANEL_ROW_ACTION_CLASSNAME',
      ].some(owner => !text.includes(owner))
    ) ||
    designPanelTexts.some(text =>
      [
        'px-3 py-2 border-b flex items-center gap-2',
        'px-3 py-2 block',
        'mt-1 flex items-center gap-2 rounded border px-2 py-1',
        'min-w-0 flex-1 text-left rounded px-2 py-1',
      ].some(snippet => text.includes(snippet))
    ) ||
    designDomTreePanel.includes('flex items-center gap-1 px-2 py-1.5') ||
    designDomTreePanel.includes('block px-2 py-2 text-[10px]') ||
    designLayersPanel.includes('px-2 py-2 flex items-center gap-2') ||
    designLayersPanel.includes('block px-3 py-2 text-[10px]') ||
    designLayersPanel.includes('className="flex items-center gap-1"')
  ) {
    throw new Error('Expected Design DOM and Layers panel rows/search surfaces to use shared responsive design panel owners')
  }
  const searchPanel = readUtf8(searchPanelPath)
  if (!searchPanel.includes('UI_RESPONSIVE_WIDE_TOOLBAR_DROPDOWN_PANEL_CLASSNAME') || searchPanel.includes('w-80')) {
    throw new Error('Expected SearchPanel dropdown width to use the shared wide toolbar dropdown owner')
  }
  const launchDropdown = readUtf8(launchDropdownPath)
  const launchDropdownExport = readUtf8(launchDropdownExportPath)
  const launchDropdownImportUrlItem = readUtf8(launchDropdownImportUrlItemPath)
  if (!launchDropdown.includes('UI_RESPONSIVE_LAUNCH_MENU_ROW_CLASSNAME') || !launchDropdown.includes('UI_RESPONSIVE_DEFAULT_GLYPH_CLASSNAME') || !launchDropdown.includes("const menuIconClass = cn(UI_RESPONSIVE_DEFAULT_GLYPH_CLASSNAME, 'shrink-0')") || !launchDropdownImportUrlItem.includes('importUrlControlsId') || !launchDropdownImportUrlItem.includes('kg-click-expand-menu-children') || !launchDropdownExport.includes('kg-click-expand-menu-children') || launchDropdownExport.includes('left-full') || launchDropdownImportUrlItem.includes('runImportUrl(draft)') || launchDropdown.includes("const menuIconClass = 'w-4 h-4 shrink-0'") || launchDropdown.includes('const menuIconClass = "w-4 h-4 shrink-0"') || launchDropdown.includes('w-80')) {
    throw new Error('Expected launch menu rows and menu icons to keep bounded click-expand rows without parent-click import execution')
  }
  const columnHeaderMenu = readUtf8(columnHeaderMenuPath)
  if (!columnHeaderMenu.includes('UI_RESPONSIVE_COLUMN_HEADER_MENU_PANEL_CLASSNAME') || !columnHeaderMenu.includes('UI_RESPONSIVE_COLUMN_HEADER_FILTER_PANEL_CLASSNAME') || !columnHeaderMenu.includes('UI_RESPONSIVE_COLUMN_HEADER_FILTER_LABEL_CLASSNAME') || !columnHeaderMenu.includes('UI_RESPONSIVE_COLUMN_HEADER_FILTER_FIELD_CLASSNAME') || !columnHeaderMenu.includes('UI_RESPONSIVE_COLUMN_HEADER_FILTER_ACTION_CLASSNAME') || !columnHeaderMenu.includes('UI_RESPONSIVE_COLUMN_HEADER_TYPE_VALUE_CLASSNAME') || !columnHeaderMenu.includes('UI_RESPONSIVE_MENU_ICON_ACTION_CLASSNAME') || !columnHeaderMenu.includes('kg-click-expand-menu-children') || columnHeaderMenu.includes('onMouseEnter') || columnHeaderMenu.includes('left-full') || columnHeaderMenu.includes('w-[260px]') || columnHeaderMenu.includes('w-12 shrink-0 text-xs') || columnHeaderMenu.includes('max-w-[120px]') || columnHeaderMenu.includes('h-7 min-w-0 px-2 rounded border flex-1') || columnHeaderMenu.includes('h-7 px-2 rounded border') || columnHeaderMenu.includes('items-center justify-center w-8 h-8 rounded border')) {
    throw new Error('Expected column header menus to use bounded click-expand child primitives')
  }
  const typeMenu = readUtf8(typeMenuPath)
  const columnHeaderPropertyTypeMenu = readUtf8(columnHeaderPropertyTypeMenuPath)
  if (
    !typeMenu.includes('UI_RESPONSIVE_TYPE_MENU_PANEL_CLASSNAME') ||
    !typeMenu.includes('UI_RESPONSIVE_MENU_ROW_CLASSNAME') ||
    !typeMenu.includes('UI_RESPONSIVE_DEFAULT_GLYPH_CLASSNAME') ||
    !typeMenu.includes('typeMenuGlyphClassName') ||
    typeMenu.includes('w-4 h-4 shrink-0') ||
    typeMenu.includes('h-4 w-4 shrink-0') ||
    !columnHeaderPropertyTypeMenu.includes('UI_RESPONSIVE_COMPACT_GLYPH_CLASSNAME') ||
    !columnHeaderPropertyTypeMenu.includes('columnHeaderPropertyTypeMenuGlyphClassName') ||
    columnHeaderPropertyTypeMenu.includes('w-3 h-3 shrink-0') ||
    columnHeaderPropertyTypeMenu.includes('h-3 w-3 shrink-0')
  ) {
    throw new Error('Expected type menus and column header type glyphs to reuse shared responsive glyph owners')
  }
  const dataViewHeader = readUtf8(dataViewHeaderPath)
  if (
    !dataViewHeader.includes('kg-data-view-header-controls') ||
    (!dataViewHeader.includes('UI_RESPONSIVE_ACTION_ROW_CLASSNAME') && !dataViewHeader.includes('getDataViewIconButtonClassName'))
  ) {
    throw new Error('Expected Data View header controls to stay inside viewport bounds')
  }
  if (!dataViewHeader.includes("openSettingsPanel('layout')")) {
    throw new Error('Expected Data View layout control to open the shared FloatingPanel View layout section')
  }
  if (!dataViewHeader.includes("openSettingsPanel('group')") || !dataViewHeader.includes("openSettingsPanel('properties')")) {
    throw new Error('Expected Data View group, settings, and more controls to route into the shared FloatingPanel View sections')
  }
  if (!dataViewHeader.includes('aria-label="Add column"') || dataViewHeader.includes('MarkdownDataViewAddColumnMenu')) {
    throw new Error('Expected Data View add-column trigger to route through the shared FloatingPanel View instead of a local menu')
  }
  if (
    !dataViewHeader.includes('UI_RESPONSIVE_DATA_VIEW_SEARCH_FORM_CLASSNAME') ||
    dataViewHeader.includes('kg-data-view-search-form flex min-w-0 max-w-full items-center gap-2 px-2 py-1 rounded border') ||
    dataViewHeader.includes('layoutDetailsRef') ||
    dataViewHeader.includes('FLOATING_MENU_LEFT_W220_CLASSNAME')
  ) {
    throw new Error('Expected Data View header to remove the legacy local layout dropdown after View-panel consolidation')
  }
  if (dataViewHeader.includes('FLOATING_MENU_RIGHT_W220_CLASSNAME') || dataViewHeader.includes('<details className="relative z-30">')) {
    throw new Error('Expected Data View header to remove the legacy local More dropdown after View-panel consolidation')
  }
  const dataViewPanel = readUtf8(dataViewPanelPath)
  const dataViewProperties = readUtf8(dataViewPropertiesPath)
  const dataViewPrimitives = readUtf8(dataViewPrimitivesPath)
  if (!dataViewPanel.includes('kg-data-view-settings-layout flex h-full min-h-0 flex-col') || !dataViewPanel.includes('secondaryNode={(') || !dataViewPanel.includes('UI_RESPONSIVE_DATA_VIEW_HEADER_ACTIONS_CLASSNAME') || dataViewPanel.includes('max-w-[45%]')) {
    throw new Error('Expected Data View settings panel to consolidate shared header actions into the shell header using the shared right-edge action lane')
  }
  if (!dataViewPanel.includes('<ExpandCollapseAllButton') || !dataViewPanel.includes('titleCollapse="Collapse (Default)"') || !dataViewPanel.includes('<CollapsibleSection') || dataViewPanel.includes('kg-data-view-settings-nav') || dataViewPanel.includes('<ToolbarDropdownSelect') || dataViewPanel.includes('uiToolbarResponsiveRowScrollClassName') || dataViewPanel.includes('onMouseEnter={() => setActivePanel(') || dataViewPanel.includes('w-[220px]') || dataViewPanel.includes('border-r')) {
    throw new Error('Expected Data View settings panel to consolidate collapse/expand into the header and remove legacy chooser / side rail wrappers')
  }
  if (!dataViewPanel.includes('overflow-y-auto px-3 pb-3') || !dataViewPanel.includes('flushTop')) {
    throw new Error('Expected Data View settings panel to remove the spacer between the header border and the first collapsible section')
  }
  if (!dataViewPanel.includes("key: 'reset'") || dataViewPanel.includes("key: 'duplicate'") || dataViewPanel.includes("key: 'delete'")) {
    throw new Error('Expected Data View settings panel to expose reset and remove legacy placeholder duplicate/delete sections')
  }
  if (!dataViewPanel.includes('onAddColumn={props.onAddColumn}') || !dataViewProperties.includes('aria-label="Add column"') || !dataViewProperties.includes('MarkdownDataViewAddColumnMenu')) {
    throw new Error('Expected Data View Properties section to own add-column creation after header consolidation')
  }
  if (
    !dataViewProperties.includes('UI_RESPONSIVE_DATA_VIEW_REORDER_INDICATOR_CLASSNAME') ||
    !dataViewProperties.includes('UI_RESPONSIVE_DATA_VIEW_PROPERTY_ROW_CLASSNAME') ||
    dataViewProperties.includes('absolute left-2 right-2 bottom-0') || dataViewProperties.includes('h-[2px]') ||
    dataViewProperties.includes('px-2 py-1 rounded border') || !responsiveCss.includes('inset-inline: var(--kg-data-view-reorder-indicator-inline-offset, 0.5rem)') || !responsiveCss.includes('inset-block-end: 0')
  ) {
    throw new Error('Expected Data View Properties row shell sizing and reorder indicator geometry to live in shared responsive owners')
  }
  if (!dataViewPrimitives.includes('UI_RESPONSIVE_DATA_VIEW_SETTINGS_ROW_VALUE_CLASSNAME') || !dataViewPrimitives.includes('UI_RESPONSIVE_DATA_VIEW_SETTINGS_LAYOUT_CHOICE_CLASSNAME') || !dataViewPrimitives.includes('UI_RESPONSIVE_COMPACT_GLYPH_CLASSNAME') || dataViewPrimitives.includes('max-w-[45%]') || dataViewPrimitives.includes('min-w-[6rem]') || dataViewPrimitives.includes('w-3 h-3')) {
    throw new Error('Expected Data View settings primitives to route row value, layout-choice, and compact glyph sizing through shared responsive owners')
  }
  const dataViewFilter = readUtf8(dataViewFilterPath)
  if (!dataViewFilter.includes('UI_RESPONSIVE_DATA_VIEW_FILTER_MENU_PANEL_CLASSNAME') || !dataViewFilter.includes('UI_RESPONSIVE_MENU_ICON_ACTION_CLASSNAME') || !dataViewFilter.includes('UI_TEXT_TRUNCATE') || dataViewFilter.includes('w-[260px]') || dataViewFilter.includes('items-center justify-center w-8 h-8 rounded border')) {
    throw new Error('Expected Data View filter menus to stay bounded and ellipsized')
  }
  const dataViewChips = readUtf8(dataViewChipsPath)
  const dataViewChipStyles = readUtf8(dataViewChipStylesPath)
  if (!dataViewChipStyles.includes('UI_RESPONSIVE_INLINE_ELEMENT_ROW_CLASSNAME') || !dataViewChips.includes('UI_RESPONSIVE_COMPACT_GLYPH_CLASSNAME') || dataViewChips.includes('w-3 h-3 shrink-0')) {
    throw new Error('Expected Data View chips to prevent long tag and icon overflow')
  }
  const dataViewAddColumn = readUtf8(dataViewAddColumnPath)
  if (!dataViewAddColumn.includes('UI_RESPONSIVE_MENU_ROW_CLASSNAME') || !dataViewAddColumn.includes('UI_RESPONSIVE_ACTION_ROW_CLASSNAME')) {
    throw new Error('Expected Data View add-column menu to reuse responsive menu and action rows')
  }
  const dataViewTable = readUtf8(dataViewTablePath)
  if (
    !dataViewTable.includes('uiToolbarRowScrollClassName') ||
    !dataViewTable.includes('UI_RESPONSIVE_DATA_VIEW_TABLE_FRAME_CLASSNAME') ||
    !dataViewTable.includes('UI_RESPONSIVE_DATA_VIEW_TABLE_VALUE_CLASSNAME') ||
    !dataViewTable.includes('UI_RESPONSIVE_DATA_VIEW_TABLE_PROGRESS_CLASSNAME') ||
    !dataViewTable.includes('UI_RESPONSIVE_MENU_ICON_ACTION_CLASSNAME') ||
    dataViewTable.includes('flex flex-wrap gap-1') ||
    dataViewTable.includes('max-h-[70vh]') ||
    dataViewTable.includes('max-w-[24rem]') ||
    dataViewTable.includes('w-24 max-w-[55%]') ||
    dataViewTable.includes('items-center justify-center w-8 h-8 rounded border')
  ) {
    throw new Error('Expected Data View table chip rows and value clamps to use shared responsive owners')
  }
  const graphDataTableHeader = readUtf8(graphDataTableHeaderPath)
  const graphTableFastGridHeader = readUtf8(graphTableFastGridHeaderPath)
  if (
    [
      dataViewProperties,
      dataViewTable,
      graphDataTableHeader,
      graphTableFastGridHeader,
    ].some(text => text.includes('w-[240px]')) ||
    !graphDataTableHeader.includes('UI_RESPONSIVE_COLUMN_HEADER_MENU_PANEL_CLASSNAME')
  ) {
    throw new Error('Expected column type and column action menus to use shared responsive width owners instead of local fixed width literals')
  }
  const kanbanViewPath = path.resolve(root, 'src', 'features', 'markdown', 'ui', 'MarkdownDataViewKanbanView.tsx')
  const kanbanShortcutCopyPath = path.resolve(root, 'src', 'features', 'markdown', 'ui', 'kanban', 'kanbanShortcutCopy.ts')
  const kanbanGroupPath = path.resolve(root, 'src', 'features', 'markdown', 'ui', 'kanban', 'KanbanGroup.tsx')
  const kanbanDropPreviewPath = path.resolve(root, 'src', 'features', 'markdown', 'ui', 'kanban', 'KanbanDropPreview.tsx')
  const kanbanDragHookPath = path.resolve(root, 'src', 'features', 'markdown', 'ui', 'kanban', 'useKanbanDragAndDrop.ts')
  const kanbanDragVisualStatePath = path.resolve(root, 'src', 'features', 'markdown', 'ui', 'kanban', 'kanbanDragVisualState.ts')
  const kanbanDragIntentPath = path.resolve(root, 'src', 'features', 'markdown', 'ui', 'kanban', 'kanbanDragIntent.ts')
  const kanbanMoveOutcomesPath = path.resolve(root, 'src', 'features', 'markdown', 'ui', 'kanban', 'kanbanMoveOutcomes.ts')
  const kanbanCard = readUtf8(kanbanCardPath)
  const kanbanShortcutCopy = readUtf8(kanbanShortcutCopyPath)
  const panelConfig = readUtf8(path.resolve(root, 'src', 'features', 'panels', 'config.ts'))
  const kanbanGroup = readUtf8(kanbanGroupPath)
  const smallIconActionSurfaces = [
    kanbanCard,
    kanbanGroup,
    readUtf8(dateCellEditorPath),
    readUtf8(flowMappingRowsTablePath),
    readUtf8(expandCollapseAllButtonPath),
  ]
  const flowMappingRowsTable = readUtf8(flowMappingRowsTablePath)
  const widgetRegistryTable = readUtf8(widgetRegistryTablePath)
  const kanbanDropPreview = readUtf8(kanbanDropPreviewPath)
  const kanbanDragHook = readUtf8(kanbanDragHookPath)
  const kanbanDragVisualState = readUtf8(kanbanDragVisualStatePath)
  const kanbanDragIntent = readUtf8(kanbanDragIntentPath)
  const kanbanMoveOutcomes = readUtf8(kanbanMoveOutcomesPath)
  const flowManagerFormEditorTexts = [
    readUtf8(widgetRegistryFieldsEditorPath),
    readUtf8(widgetRegistryPortsEditorPath),
    readUtf8(widgetRegistrySchemaMappingsEditorPath),
    readUtf8(storyboardWidgetMappingSettingsPanelPath),
  ]
  if (!kanbanCard.includes('kg-click-expand-menu-children') || kanbanCard.includes('-translate-x-full')) {
    throw new Error('Expected kanban card child menus to expand inline without offscreen side placement')
  }
  if (!kanbanCard.includes('uiToolbarRowScrollClassName') || kanbanCard.includes('flex flex-wrap gap-1 list-none')) {
    throw new Error('Expected Kanban tag rows to use toolbar-owned same-row scrolling')
  }
  if (
    !kanbanCard.includes('data-kg-kanban-card-drag-region="1"') ||
    !kanbanCard.includes("const sharedDragRegionClassName = props.cardDragProps?.draggable ? 'cursor-grab active:cursor-grabbing' : ''") ||
    !kanbanCard.includes('const sharedDragRegionProps = props.cardDragProps?.draggable') ||
    !kanbanCard.includes('{...sharedDragRegionProps}')
  ) {
    throw new Error('Expected Kanban cards to expose shared non-handle drag regions instead of a visible grip handle or full-card drag shell')
  }
  if (!kanbanCard.includes('props.canMutate && (e.altKey || e.metaKey)') || !kanbanCard.includes('props.onKeyboardMove?.({ rowId: props.row.id, direction })')) {
    throw new Error('Expected Kanban cards to expose shared keyboard move controls for accessible reorder')
  }
  if (kanbanCard.includes('KANBAN_DRAG_HANDLE_LABEL') || kanbanCard.includes('KanbanShortcutDetails') || kanbanCard.includes('aria-describedby={props.canMutate && props.onKeyboardMove ? shortcutHintId : undefined}')) {
    throw new Error('Expected Kanban cards to keep shortcut copy out of the local card surface and avoid reintroducing a visible drag handle')
  }
  if (!kanbanCard.includes('KanbanCardDropPreview') || kanbanCard.includes('absolute inset-x-2 top-0 h-[2px] z-10')) {
    throw new Error('Expected Kanban cards to reuse the shared drop preview helper instead of inline-only drop lines')
  }
  if (!kanbanCard.includes('onFocusableRowElement?:') || !kanbanCard.includes('props.onFocusableRowElement?.({')) {
    throw new Error('Expected Kanban cards to expose shared focusable-row registration instead of local-only focus recovery')
  }
  if (!kanbanCard.includes('getKanbanCardDragVisualState') || !kanbanGroup.includes('getKanbanLaneDragVisualState') || !kanbanCard.includes('isCommitFlash') || !kanbanGroup.includes('commitFlashRowId')) {
    throw new Error('Expected Kanban cards and lanes to reuse shared drag ghost/emphasis and commit flash visuals instead of local styling branches')
  }
  if (smallIconActionSurfaces.some(text => !text.includes('UI_RESPONSIVE_SMALL_ICON_ACTION_CLASSNAME')) || smallIconActionSurfaces.some(text => text.includes('inline-flex items-center justify-center w-7 h-7') || text.includes('h-7 w-7'))) {
    throw new Error('Expected compact icon action surfaces to use the shared small icon action owner')
  }
  const storyboardWidgetGraphTab = readUtf8(storyboardWidgetGraphTabPath)
  const storyboardWidgetMappingTabLayout = readUtf8(storyboardWidgetMappingTabLayoutPath)
  const flowManagerPanelHeaderTexts = [
    storyboardWidgetGraphTab,
    storyboardWidgetMappingTabLayout,
    storyboardWidgetSpecificationTab,
  ]
  const flowManagerPanelBodyTexts = [
    storyboardWidgetGraphTab,
    storyboardWidgetMappingTabLayout,
    storyboardWidgetSpecificationTab,
  ]
  if (
    !responsiveElementClasses.includes('UI_RESPONSIVE_FLOW_MANAGER_PANEL_HEADER_CLASSNAME') ||
    !responsiveElementClasses.includes('UI_RESPONSIVE_FLOW_MANAGER_PANEL_HEADER_ROW_CLASSNAME') ||
    !responsiveElementClasses.includes('UI_RESPONSIVE_FLOW_MANAGER_PANEL_BODY_CLASSNAME') ||
    !responsiveElementClasses.includes('UI_RESPONSIVE_FLOW_MANAGER_PANEL_FRAME_CLASSNAME') ||
    !responsiveElementClasses.includes('UI_RESPONSIVE_FLOW_MANAGER_TOOLBAR_ROW_CLASSNAME') ||
    !responsiveElementClasses.includes('UI_RESPONSIVE_FLOW_MANAGER_ACTION_MENU_CLASSNAME') ||
    !responsiveElementClasses.includes('UI_RESPONSIVE_FLOW_MANAGER_SECTION_HEADER_CLASSNAME') ||
    !responsiveElementClasses.includes('UI_RESPONSIVE_FLOW_MANAGER_SECTION_GRID_CLASSNAME') ||
    !responsiveElementClasses.includes('UI_RESPONSIVE_FLOW_MANAGER_ACTION_GROUP_CLASSNAME') ||
    !responsiveElementClasses.includes('UI_RESPONSIVE_FLOW_MANAGER_INLINE_CONTROL_CLASSNAME') ||
    !responsiveElementClasses.includes('UI_RESPONSIVE_FLOW_MANAGER_STATUS_TEXT_CLASSNAME') ||
    !responsiveElementClasses.includes('UI_RESPONSIVE_FLOW_MANAGER_STATUS_ALERT_CLASSNAME') ||
    !responsiveElementClasses.includes('UI_RESPONSIVE_FLOW_MANAGER_FOOTER_ROW_CLASSNAME') ||
    !responsiveElementClasses.includes('UI_RESPONSIVE_FLOW_MANAGER_TABLE_FIELD_CLASSNAME') ||
    !responsiveElementClasses.includes('UI_RESPONSIVE_FLOW_MANAGER_TABLE_HEADER_CELL_CLASSNAME') ||
    !responsiveElementClasses.includes('UI_RESPONSIVE_FLOW_MANAGER_TABLE_ACTION_HEADER_CELL_CLASSNAME') ||
    !responsiveElementClasses.includes('UI_RESPONSIVE_FLOW_MANAGER_TABLE_CELL_CLASSNAME') ||
    !responsiveElementClasses.includes('UI_RESPONSIVE_FLOW_MANAGER_TABLE_ACTION_CELL_CLASSNAME') ||
    !responsiveElementClasses.includes('UI_RESPONSIVE_FLOW_MANAGER_REGISTRY_TABLE_HEADER_CELL_CLASSNAME') ||
    !responsiveElementClasses.includes('UI_RESPONSIVE_FLOW_MANAGER_REGISTRY_TABLE_CELL_CLASSNAME') ||
    !responsiveElementClasses.includes('UI_RESPONSIVE_FLOW_MANAGER_REGISTRY_TABLE_EMPTY_CELL_CLASSNAME') ||
    !responsiveElementClasses.includes('UI_RESPONSIVE_FLOW_MANAGER_FORM_FIELD_CLASSNAME') ||
    !responsiveElementClasses.includes('UI_RESPONSIVE_FLOW_MANAGER_REGISTRY_ITEM_CLASSNAME') ||
    !responsiveElementClasses.includes('UI_RESPONSIVE_FLOW_MANAGER_REGISTRY_ITEM_HEADER_CLASSNAME') ||
    !responsiveElementClasses.includes('UI_RESPONSIVE_FLOW_MANAGER_REGISTRY_ITEM_GRID_CLASSNAME') ||
    !responsiveElementClasses.includes('UI_RESPONSIVE_FLOW_MANAGER_SPEC_EDITOR_CLASSNAME') ||
    !responsiveCss.includes('.kg-flow-manager-table-field') ||
    !responsiveCss.includes('--kg-flow-manager-table-field-height') ||
    !responsiveCss.includes('--kg-flow-manager-table-field-padding-inline') ||
    !responsiveCss.includes('.kg-flow-manager-form-field') ||
    !responsiveCss.includes('--kg-flow-manager-form-field-margin-block-start') ||
    !responsiveCss.includes('--kg-flow-manager-form-field-padding-inline') ||
    !responsiveCss.includes('--kg-flow-manager-form-field-padding-block') ||
    !responsiveCss.includes('.kg-flow-manager-registry-item') ||
    !responsiveCss.includes('--kg-flow-manager-registry-item-padding') ||
    !responsiveCss.includes('.kg-flow-manager-registry-item-header') ||
    !responsiveCss.includes('--kg-flow-manager-registry-item-header-gap') ||
    !responsiveCss.includes('.kg-flow-manager-registry-item-grid') ||
    !responsiveCss.includes('--kg-flow-manager-registry-item-grid-gap') ||
    !responsiveCss.includes('.kg-flow-manager-spec-editor') ||
    !responsiveCss.includes('--kg-flow-manager-spec-editor-margin-block-start') ||
    !responsiveCss.includes('--kg-flow-manager-spec-editor-padding-inline') ||
    !responsiveCss.includes('--kg-flow-manager-spec-editor-padding-block') ||
    !responsiveCss.includes('--kg-flow-manager-spec-editor-min-height') ||
    !responsiveCss.includes('.kg-flow-manager-panel-header') ||
    !responsiveCss.includes('--kg-flow-manager-panel-header-padding-inline') ||
    !responsiveCss.includes('--kg-flow-manager-panel-header-padding-block') ||
    !responsiveCss.includes('.kg-flow-manager-panel-header-row') ||
    !responsiveCss.includes('--kg-flow-manager-panel-header-row-gap') ||
    !responsiveCss.includes('.kg-flow-manager-panel-body') ||
    !responsiveCss.includes('--kg-flow-manager-panel-body-padding-inline') ||
    !responsiveCss.includes('--kg-flow-manager-panel-body-padding-block') ||
    !responsiveCss.includes('.kg-flow-manager-panel-frame') ||
    !responsiveCss.includes('--kg-flow-manager-panel-frame-padding') ||
    !responsiveCss.includes('.kg-flow-manager-toolbar-row') ||
    !responsiveCss.includes('--kg-flow-manager-toolbar-row-gap') ||
    !responsiveCss.includes('.kg-flow-manager-action-menu') ||
    !responsiveCss.includes('--kg-flow-manager-action-menu-gap') ||
    !responsiveCss.includes('.kg-flow-manager-section-header') ||
    !responsiveCss.includes('--kg-flow-manager-section-header-gap') ||
    !responsiveCss.includes('.kg-flow-manager-section-grid') ||
    !responsiveCss.includes('--kg-flow-manager-section-grid-gap') ||
    !responsiveCss.includes('.kg-flow-manager-action-group') ||
    !responsiveCss.includes('--kg-flow-manager-action-group-gap') ||
    !responsiveCss.includes('.kg-flow-manager-inline-control') ||
    !responsiveCss.includes('--kg-flow-manager-inline-control-gap') ||
    !responsiveCss.includes('.kg-flow-manager-status-text') ||
    !responsiveCss.includes('--kg-flow-manager-status-text-padding-inline') ||
    !responsiveCss.includes('--kg-flow-manager-status-text-padding-block-start') ||
    !responsiveCss.includes('.kg-flow-manager-status-alert') ||
    !responsiveCss.includes('--kg-flow-manager-status-alert-padding-inline') ||
    !responsiveCss.includes('--kg-flow-manager-status-alert-padding-block') ||
    !responsiveCss.includes('.kg-flow-manager-footer-row') ||
    !responsiveCss.includes('--kg-flow-manager-footer-row-padding-block') ||
    !responsiveCss.includes('.kg-flow-manager-table-header-cell') ||
    !responsiveCss.includes('.kg-flow-manager-table-header-cell--actions') ||
    !responsiveCss.includes('--kg-flow-manager-table-header-cell-padding-inline') ||
    !responsiveCss.includes('--kg-flow-manager-table-header-cell-padding-block') ||
    !responsiveCss.includes('.kg-flow-manager-table-cell') ||
    !responsiveCss.includes('.kg-flow-manager-table-cell--actions') ||
    !responsiveCss.includes('--kg-flow-manager-table-cell-padding-inline') ||
    !responsiveCss.includes('--kg-flow-manager-table-cell-padding-block') ||
    !responsiveCss.includes('.kg-flow-manager-registry-table-header-cell') ||
    !responsiveCss.includes('--kg-flow-manager-registry-table-header-cell-padding-inline') ||
    !responsiveCss.includes('--kg-flow-manager-registry-table-header-cell-padding-block') ||
    !responsiveCss.includes('.kg-flow-manager-registry-table-cell') ||
    !responsiveCss.includes('.kg-flow-manager-registry-table-cell--empty') ||
    !responsiveCss.includes('--kg-flow-manager-registry-table-cell-padding-inline') ||
    !responsiveCss.includes('--kg-flow-manager-registry-table-cell-padding-block') ||
    !flowMappingRowsTable.includes('UI_RESPONSIVE_FLOW_MANAGER_TABLE_FIELD_CLASSNAME') ||
    !flowMappingRowsTable.includes('UI_RESPONSIVE_FLOW_MANAGER_TABLE_HEADER_CELL_CLASSNAME') ||
    !flowMappingRowsTable.includes('UI_RESPONSIVE_FLOW_MANAGER_TABLE_ACTION_HEADER_CELL_CLASSNAME') ||
    !flowMappingRowsTable.includes('UI_RESPONSIVE_FLOW_MANAGER_TABLE_CELL_CLASSNAME') ||
    !flowMappingRowsTable.includes('UI_RESPONSIVE_FLOW_MANAGER_TABLE_ACTION_CELL_CLASSNAME') ||
    !widgetRegistryTable.includes('UI_RESPONSIVE_FLOW_MANAGER_REGISTRY_TABLE_HEADER_CELL_CLASSNAME') ||
    !widgetRegistryTable.includes('UI_RESPONSIVE_FLOW_MANAGER_REGISTRY_TABLE_CELL_CLASSNAME') ||
    !widgetRegistryTable.includes('UI_RESPONSIVE_FLOW_MANAGER_REGISTRY_TABLE_EMPTY_CELL_CLASSNAME') ||
    flowManagerPanelHeaderTexts.some(text => !text.includes('UI_RESPONSIVE_FLOW_MANAGER_PANEL_HEADER_CLASSNAME')) ||
    !storyboardWidgetGraphTab.includes('UI_RESPONSIVE_FLOW_MANAGER_PANEL_HEADER_ROW_CLASSNAME') ||
    flowManagerPanelBodyTexts.some(text => !text.includes('UI_RESPONSIVE_FLOW_MANAGER_PANEL_BODY_CLASSNAME')) ||
    !storyboardWidgetMappingTabLayout.includes('UI_RESPONSIVE_FLOW_MANAGER_TOOLBAR_ROW_CLASSNAME') ||
    !storyboardWidgetSpecificationTab.includes('UI_RESPONSIVE_FLOW_MANAGER_TOOLBAR_ROW_CLASSNAME') ||
    !flowManagerFormEditorTexts[3].includes('UI_RESPONSIVE_FLOW_MANAGER_TOOLBAR_ROW_CLASSNAME') ||
    flowManagerFormEditorTexts[3].includes('sticky bottom-0 py-2 border-t flex items-center justify-between gap-2') ||
    !storyboardWidgetMappingTabLayout.includes('UI_RESPONSIVE_FLOW_MANAGER_ACTION_MENU_CLASSNAME') ||
    !storyboardWidgetSpecificationTab.includes('UI_RESPONSIVE_FLOW_MANAGER_ACTION_MENU_CLASSNAME') ||
    !flowManagerFormEditorTexts[3].includes('UI_RESPONSIVE_FLOW_MANAGER_ACTION_MENU_CLASSNAME') ||
    !flowManagerFormEditorTexts[3].includes('UI_RESPONSIVE_FLOW_MANAGER_SECTION_HEADER_CLASSNAME') ||
    !flowManagerFormEditorTexts[3].includes('UI_RESPONSIVE_FLOW_MANAGER_SECTION_GRID_CLASSNAME') ||
    !flowManagerFormEditorTexts[3].includes('UI_RESPONSIVE_FLOW_MANAGER_ACTION_GROUP_CLASSNAME') ||
    !storyboardWidgetMappingTabLayout.includes('UI_RESPONSIVE_FLOW_MANAGER_INLINE_CONTROL_CLASSNAME') ||
    !flowManagerFormEditorTexts[3].includes('UI_RESPONSIVE_FLOW_MANAGER_INLINE_CONTROL_CLASSNAME') ||
    !flowManagerFormEditorTexts[0].includes('UI_RESPONSIVE_FLOW_MANAGER_INLINE_CONTROL_CLASSNAME') ||
    !storyboardWidgetSpecificationTab.includes('UI_RESPONSIVE_FLOW_MANAGER_STATUS_TEXT_CLASSNAME') ||
    !flowManagerFormEditorTexts[3].includes('UI_RESPONSIVE_FLOW_MANAGER_STATUS_ALERT_CLASSNAME') ||
    !flowManagerFormEditorTexts[3].includes('UI_RESPONSIVE_FLOW_MANAGER_FOOTER_ROW_CLASSNAME') ||
    !storyboardWidgetGraphTab.includes('UI_RESPONSIVE_FLOW_MANAGER_PANEL_FRAME_CLASSNAME') ||
    flowManagerFormEditorTexts.some(text => !text.includes('UI_RESPONSIVE_FLOW_MANAGER_FORM_FIELD_CLASSNAME')) ||
    flowManagerFormEditorTexts.slice(0, 3).some(text => !text.includes('UI_RESPONSIVE_FLOW_MANAGER_REGISTRY_ITEM_CLASSNAME')) ||
    flowManagerFormEditorTexts.slice(0, 3).some(text => !text.includes('UI_RESPONSIVE_FLOW_MANAGER_REGISTRY_ITEM_HEADER_CLASSNAME')) ||
    flowManagerFormEditorTexts.slice(0, 3).some(text => !text.includes('UI_RESPONSIVE_FLOW_MANAGER_REGISTRY_ITEM_GRID_CLASSNAME')) ||
    !storyboardWidgetSpecificationTab.includes('UI_RESPONSIVE_FLOW_MANAGER_SPEC_EDITOR_CLASSNAME') ||
    flowMappingRowsTable.includes('w-full h-7 px-2') ||
    flowManagerFormEditorTexts.some(text => text.includes('mt-1 w-full rounded border px-2 py-1')) ||
    flowManagerFormEditorTexts.some(text => text.includes("UI_RESPONSIVE_FLOW_MANAGER_FORM_FIELD_CLASSNAME, 'rounded border'")) ||
    flowManagerFormEditorTexts.slice(0, 3).some(text => text.includes('rounded border p-2')) ||
    flowManagerFormEditorTexts.slice(0, 3).some(text => text.includes('flex items-center justify-between gap-2')) ||
    flowManagerFormEditorTexts.slice(0, 2).some(text => text.includes('grid grid-cols-1 sm:grid-cols-4 gap-2')) ||
    flowManagerFormEditorTexts[2].includes('grid grid-cols-1 sm:grid-cols-2 gap-2') ||
    storyboardWidgetSpecificationTab.includes('mt-2 ${UI_RESPONSIVE_FLOW_MANAGER_SPEC_EDITOR_CLASSNAME} rounded-md border px-2 py-1') ||
    flowManagerPanelHeaderTexts.some(text => text.includes('px-3 py-2 border-b')) ||
    storyboardWidgetGraphTab.includes('flex items-center justify-between gap-3') ||
    flowManagerPanelBodyTexts.some(text => text.includes('p-3 min-h-0 h-full overflow-hidden')) ||
    flowManagerPanelBodyTexts.some(text => text.includes('h-full min-h-0 p-3')) ||
    flowManagerPanelBodyTexts.some(text => text.includes('overflow-auto p-3')) ||
    flowManagerPanelBodyTexts.some(text => text.includes('overflow-hidden p-3')) ||
    storyboardWidgetMappingTabLayout.includes('flex flex-wrap items-center justify-between gap-2') ||
    storyboardWidgetSpecificationTab.includes('flex flex-wrap items-center justify-between gap-2') ||
    storyboardWidgetMappingTabLayout.includes('m-0 p-0 list-none flex flex-wrap items-center gap-1') ||
    storyboardWidgetSpecificationTab.includes('m-0 p-0 list-none flex items-center gap-1') ||
    flowManagerFormEditorTexts[3].includes('m-0 p-0 list-none flex items-center gap-1') ||
    flowManagerFormEditorTexts[3].includes('flex items-center justify-between gap-2') ||
    flowManagerFormEditorTexts[3].includes('grid grid-cols-1 sm:grid-cols-3 gap-2') ||
    flowManagerFormEditorTexts[3].includes('className="flex items-center gap-2"') ||
    storyboardWidgetMappingTabLayout.includes('inline-flex items-center gap-2') ||
    flowManagerFormEditorTexts[3].includes('inline-flex items-center gap-2') ||
    flowManagerFormEditorTexts[0].includes('inline-flex items-center gap-2') ||
    storyboardWidgetSpecificationTab.includes('px-3 pt-2') ||
    flowManagerFormEditorTexts[3].includes('rounded border px-2 py-2') ||
    flowManagerFormEditorTexts[3].includes('sticky bottom-0 py-2 border-t') ||
    storyboardWidgetGraphTab.includes('rounded border p-2') ||
    flowMappingRowsTable.includes('text-left px-2 py-2 text-xs font-semibold') ||
    flowMappingRowsTable.includes('text-right px-2 py-2 text-xs font-semibold') ||
    flowMappingRowsTable.includes('px-2 py-1 align-top border-t') ||
    widgetRegistryTable.includes('text-left px-3 py-2 text-xs font-semibold') ||
    widgetRegistryTable.includes('px-3 py-2') ||
    widgetRegistryTable.includes('px-3 py-6 text-center')
  ) {
    throw new Error('Expected Flow Manager table cells, form fields, registry items, and spec editors to use shared compact Flow Manager owners')
  }
  if (!kanbanGroup.includes('UI_RESPONSIVE_DATA_VIEW_KANBAN_GROUP_CLASSNAME') || kanbanGroup.includes('w-[260px]')) {
    throw new Error('Expected Data View kanban lanes to use the shared responsive lane owner instead of a local fixed width literal')
  }
  if (!kanbanCard.includes('buildKanbanCardDropIntentLabel') || !kanbanGroup.includes('laneDropPreviewLabel')) {
    throw new Error('Expected Kanban cards and lanes to reuse shared drag-intent captions instead of static drop labels')
  }
  const kanbanView = readUtf8(kanbanViewPath)
  const kanbanReorderPath = path.resolve(root, 'src', 'features', 'markdown', 'ui', 'kanban', 'kanbanReorder.ts')
  const dataViewModelPath = path.resolve(root, 'src', 'features', 'markdown', 'ui', 'markdownDataViewModel.ts')
  const kanbanReorder = readUtf8(kanbanReorderPath)
  const dataViewModel = readUtf8(dataViewModelPath)
  if (!kanbanShortcutCopy.includes('KANBAN_SHORTCUT_HELP_LINES') || !panelConfig.includes('...KANBAN_SHORTCUT_HELP_LINES')) {
    throw new Error('Expected Kanban shortcut copy to be owned by a shared helper and surfaced from MainPanel Help shortcuts')
  }
  if (!kanbanDropPreview.includes('export function KanbanDropIndicator') || !kanbanDropPreview.includes('export function KanbanLaneDragOverIndicator') || !kanbanDropPreview.includes('export function KanbanCardDropPreview') || !kanbanDropPreview.includes('export function KanbanLaneDropPreview') || !kanbanDropPreview.includes('UI_RESPONSIVE_KANBAN_DROP_INDICATOR_CLASSNAME') || kanbanDropPreview.includes('h-[2px]')) {
    throw new Error('Expected Kanban drop previews to be owned by a shared helper')
  }
  if (!kanbanDragVisualState.includes('export const getKanbanCardDragVisualState') || !kanbanDragVisualState.includes('export const getKanbanLaneDragVisualState') || !kanbanDragVisualState.includes('isCommitFlash')) {
    throw new Error('Expected Kanban drag ghost, lane emphasis, and commit flash visuals to be owned by a shared helper')
  }
  if (!kanbanDragIntent.includes('export const buildKanbanCardDropIntentLabel') || !kanbanDragIntent.includes('export const buildKanbanDragStatusText')) {
    throw new Error('Expected Kanban drag intent messaging to be owned by a shared helper')
  }
  if (!kanbanMoveOutcomes.includes("kind: 'blocked' | 'cancelled' | 'no-op' | 'committed'") || !kanbanMoveOutcomes.includes('export type KanbanBlockedMoveReason') || !kanbanMoveOutcomes.includes('export const isKanbanMoveNoOp') || !kanbanMoveOutcomes.includes('export const buildKanbanDropOutcomeText')) {
    throw new Error('Expected Kanban move outcome suppression and success/cancel/boundary messaging to be owned by a shared helper')
  }
  if (!kanbanDragHook.includes('getBoardScrollElement?: () => HTMLElement | null') || !kanbanDragHook.includes('getLaneScrollElement?: (groupKey: string) => HTMLElement | null') || !kanbanDragHook.includes('window.requestAnimationFrame(tick)')) {
    throw new Error('Expected Kanban drag owner to manage shared board and lane auto-scroll via a requestAnimationFrame loop')
  }
  if (!kanbanDragHook.includes('KANBAN_LANE_HOVER_DWELL_MS') || !kanbanDragHook.includes('window.setTimeout(() =>') || !kanbanDragHook.includes('resolveDropTarget')) {
    throw new Error('Expected Kanban drag owner to stabilize cross-lane hover with a shared dwell contract instead of immediate target thrash')
  }
  if (!kanbanDragHook.includes('KANBAN_DIRECTIONAL_LANE_ENTRY_BIAS_PX') || !kanbanDragHook.includes('KANBAN_CARD_TARGET_HYSTERESIS_PX') || !kanbanDragHook.includes('lastAppliedTargetPointerRef')) {
    throw new Error('Expected Kanban drag owner to apply shared directional lane-entry bias and card-target hysteresis instead of raw pointer switching')
  }
  if (kanbanDragHook.indexOf('const updateAutoScrollTargets = React.useCallback') > kanbanDragHook.indexOf('const resolveDropTarget = React.useCallback')) {
    throw new Error('Expected Markdown kanban shared auto-scroll callback to be declared before the shared drop-target resolver to avoid TDZ runtime crashes')
  }
  if (!kanbanDragHook.includes('const clearActiveDropTarget = React.useCallback') || !kanbanDragHook.includes('if (dragOverRowIdRef.current == null) {') || !kanbanDragHook.includes('clearActiveDropTarget()')) {
    throw new Error('Expected Markdown kanban lane-end drag previews to clear from the shared drag owner when the pointer leaves the lane target')
  }
  if (!kanbanDragHook.includes('registerFocusableRowElement') || !kanbanDragHook.includes('requestFocusRow') || !kanbanDragHook.includes('attemptFocusRow')) {
    throw new Error('Expected Kanban drag owner to centralize post-move focus recovery instead of per-surface focus patches')
  }
  if (!kanbanDragHook.includes('const commitMove = React.useCallback') || !kanbanDragHook.includes('const reportBlockedMove = React.useCallback') || !kanbanDragHook.includes("commitMove(move) === 'committed' ? 'commit' : 'no-op'")) {
    throw new Error('Expected Kanban drag owner to centralize shared commit/no-op/boundary resolution for pointer and keyboard moves')
  }
  if (!kanbanDragHook.includes('const [dragOutcomeSequence, setDragOutcomeSequence] = React.useState(0)') || !kanbanDragHook.includes('setDragOutcomeSequence(value => value + 1)') || !kanbanView.includes('kanbanDrag.dragOutcomeSequence')) {
    throw new Error('Expected Markdown kanban repeated outcome announcements to be driven by a shared outcome sequence instead of local live-region retries')
  }
  if (!kanbanDragHook.includes('clearCommitFeedback()') || !kanbanDragHook.includes("kind: 'no-op'")) {
    throw new Error('Expected Markdown kanban no-op moves to clear stale success feedback in the shared drag owner before announcing no change')
  }
  if (!kanbanDragHook.includes('const draggingRowIdRef = React.useRef<string | null>(null)') || !kanbanDragHook.includes('const dragSourceGroupKeyRef = React.useRef<string | null>(null)') || !kanbanDragHook.includes('const resolveDraggedRowId = React.useCallback') || !kanbanDragHook.includes('const resolveDraggedGroupKey = React.useCallback')) {
    throw new Error('Expected Kanban drag owner to retain active drag identity in shared refs when browser dragover/drop dataTransfer payloads are unavailable')
  }
  if (!kanbanDragHook.includes('setCommitFlashRowId(move.rowId)') || !kanbanView.includes('commitFlashRowId={kanbanDrag.commitFlashRowId}') || !kanbanGroup.includes('props.commitFlashRowId === row.id')) {
    throw new Error('Expected Markdown kanban commit flash to follow the moved row through the shared drag owner and card registration path')
  }
  if (!kanbanView.includes('useKanbanDragAndDrop') || !kanbanView.includes('reorderKanbanRowIds') || !kanbanView.includes('onReorderRows({') || !kanbanView.includes('handleKeyboardMove')) {
    throw new Error('Expected Markdown kanban view to reuse the shared drag-and-drop hook and keyboard reorder through the root data-view reorder contract')
  }
  if (kanbanView.includes('KanbanShortcutLegend') || kanbanView.includes('KanbanShortcutDetails')) {
    throw new Error('Expected Kanban shortcut guidance to move out of local kanban surfaces and into MainPanel Help shortcuts')
  }
  if (!kanbanView.includes('buildKanbanDragStatusText') || !kanbanView.includes('activeDragStatusText')) {
    throw new Error('Expected Markdown kanban view to expose visible shared drag-intent status before drop')
  }
  if (!kanbanView.includes('const liveRegionKey = [') || !kanbanView.includes('kanbanDrag.dragOutcomeSequence') || !kanbanView.includes('aria-live="polite">{statusPillText}</section>') || !kanbanView.includes('UI_RESPONSIVE_DATA_VIEW_KANBAN_STATUS_ROW_CLASSNAME') || kanbanView.includes("setLiveMessage(statusPillText || '')") || kanbanView.includes('min-h-[28px]')) {
    throw new Error('Expected Markdown kanban live-region announcements to stay aligned with the shared status pill without local live-message state churn')
  }
  if (!kanbanView.includes('isKanbanMoveNoOp') || !kanbanView.includes('dragOutcomeMessage') || !kanbanView.includes('commitFlashGroupKey') || !kanbanView.includes('statusPillText')) {
    throw new Error('Expected Markdown kanban view to reuse shared success/no-op/cancel messaging and commit flash feedback')
  }
  if (!kanbanView.includes('registerFocusableRowElement') || !kanbanView.includes('kanbanDrag.commitMove({') || !kanbanView.includes('kanbanDrag.reportBlockedMove({') || !kanbanView.includes("'start-of-lane'") || !kanbanView.includes("'start-of-board'") || !kanbanView.includes("'end-of-board'") || !kanbanGroup.includes('onFocusableRowElement={props.onFocusableRowElement}')) {
    throw new Error('Expected Markdown kanban keyboard reorder, boundary feedback, and focus recovery to stay rooted in the shared drag owner and card registration path')
  }
  if (!kanbanReorder.includes('export const resolveKanbanGroupOrder') || !kanbanView.includes('resolveKanbanGroupOrder')) {
    throw new Error('Expected Markdown kanban lane ordering to reuse the shared configured-option order helper')
  }
  if (!kanbanGroup.includes('KanbanLaneDragOverIndicator') || !kanbanGroup.includes('KanbanLaneDropPreview') || kanbanGroup.includes('h-[2px]') || !kanbanView.includes('showLaneDropPreview=')) {
    throw new Error('Expected Markdown kanban lanes to expose a shared end-of-lane drop affordance during pointer drag')
  }
  if (!kanbanGroup.includes('UI_RESPONSIVE_DATA_VIEW_KANBAN_CARD_LIST_CLASSNAME') || kanbanGroup.includes('max-h-[min(65vh,720px)]') || !kanbanView.includes('getBoardScrollElement: () => boardScrollRef.current')) {
    throw new Error('Expected Markdown kanban lanes and board to expose explicit scroll owners for shared edge-aware drag assistance')
  }
  if (!dataViewModel.includes('export const reorderMarkdownDataViewRows') || !dataViewModel.includes('columns: recomputeColumnsForRows')) {
    throw new Error('Expected Markdown data-view model to own persisted row reorder and enum option recomputation upstream')
  }
  const fileTree = readUtf8(fileTreePath)
  if (!fileTree.includes('clampOverlayTopLeftFullyInViewport') || !fileTree.includes('kg-data-view-floating-menu fixed') || !fileTree.includes('UI_RESPONSIVE_MENU_ROW_CLASSNAME')) {
    throw new Error('Expected workspace file context menus to clamp within mobile viewports')
  }
  const floatingMenuStyles = readUtf8(floatingMenuStylesPath)
  if (!floatingMenuStyles.includes('uiToolbarRowScrollClassName') || !floatingMenuStyles.includes('UI_RESPONSIVE_INLINE_ELEMENT_ROW_CLASSNAME')) {
    throw new Error('Expected floating toolbars to reuse row-scroll and responsive inline elements')
  }
}

export const testKeyValueRowsKeepMobileGridConsistency = () => {
  const root = process.cwd()
  const sharedKtvRowsPath = path.resolve(root, '..', 'grph-shared', 'src', 'ui', 'keyTypeValueRows.ts')
  const sharedKtvRowPath = path.resolve(root, '..', 'grph-shared', 'src', 'react', 'keyTypeValueRow.tsx')
  const statusBadgePath = path.resolve(root, 'src', 'features', 'panels', 'ui', 'StatusBadge.tsx')
  const sharedKtvRows = readUtf8(sharedKtvRowsPath)
  const sharedKtvRow = readUtf8(sharedKtvRowPath)
  const statusBadge = readUtf8(statusBadgePath)
  if (sharedKtvRow.includes('grid-cols-1 sm:grid-cols-')) {
    throw new Error('Expected the upstream shared KTV row runtime to preserve grid columns on narrow widths instead of introducing ad hoc breakpoint overrides')
  }
  if (
    !sharedKtvRow.includes('KTV_KEY_TYPE_VALUE_GRID_CLASS_NAME')
    || !sharedKtvRows.includes('grid-cols-[minmax(0,0.95fr)_minmax(2.75rem,0.42fr)_minmax(0,1.2fr)]')
    || !sharedKtvRows.includes('sm:grid-cols-[minmax(0,1fr)_minmax(3rem,4.75rem)_minmax(0,1.45fr)]')
  ) {
    throw new Error('Expected the upstream shared KTV row runtime to keep the shared default Key/Type/Value grid with a wider bounded Value column')
  }
  if (
    !sharedKtvRow.includes('KTV_KEY_VALUE_GRID_CLASS_NAME')
    || !sharedKtvRows.includes('grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]')
  ) {
    throw new Error('Expected the upstream shared KTV row runtime to keep the shared simple Key/Value mobile two-column grid')
  }
  if (!sharedKtvRow.includes('flex min-w-0 items-center justify-center')) {
    throw new Error('Expected the upstream shared KTV row runtime to preserve icon spacer cells in the mobile grid instead of hiding them')
  }
  if (!sharedKtvRow.includes('justify-start sm:justify-end')) {
    throw new Error('Expected the upstream shared KTV row runtime to preserve right-aligned value cells that relax to start alignment on narrow widths')
  }
  if (!sharedKtvRows.includes('export const KTV_ROW_TEXT_CELL_CLASS_NAME') || !sharedKtvRows.includes('overflow-hidden')) {
    throw new Error('Expected upstream shared KTV cells to clip instead of allowing messy mobile overflow')
  }
  if (!sharedKtvRows.includes('self-stretch px-2') || sharedKtvRows.includes('border-x ${UI_THEME_TOKENS.panel.border}')) {
    throw new Error('Expected KTV Value cells to keep shared left/right alignment without grid border lines')
  }
  if (!sharedKtvRows.includes('export const KTV_ROW_LABEL_CELL_CLASS_NAME') || !sharedKtvRows.includes('text-ellipsis whitespace-nowrap')) {
    throw new Error('Expected upstream shared KTV labels to use ellipsis on narrow widths')
  }
  if (sharedKtvRow.includes('break-words')) {
    throw new Error('Expected upstream shared KTV cells to avoid messy wrapped setting keys and values')
  }
  if (
    !statusBadge.includes('min-w-0 max-w-full') ||
    !statusBadge.includes('UI_RESPONSIVE_STATUS_BADGE_CLASSNAME') ||
    !statusBadge.includes('UI_RESPONSIVE_STATUS_BADGE_MESSAGE_CLASSNAME') ||
    !statusBadge.includes('UI_RESPONSIVE_STATUS_BADGE_DETAIL_CLASSNAME') ||
    statusBadge.includes('sm:min-w-[120px]') ||
    statusBadge.includes('max-w-40') ||
    statusBadge.includes('max-w-32')
  ) {
    throw new Error('Expected StatusBadge to release fixed width clamps through shared responsive owners on mobile')
  }
}

export const testSettingsRowsUseEllipsisForLongMobileText = () => {
  const root = process.cwd()
  const settingsEntryRowPath = path.resolve(root, 'src', 'features', 'panels', 'views', 'SettingsEntryRow.tsx')
  const settingsEntryRowInputPath = path.resolve(root, 'src', 'features', 'panels', 'views', 'settingsEntryRow.input.tsx')
  const detailsTablePath = path.resolve(root, 'src', 'features', 'panels', 'views', 'SettingsEntryDetailsTable.tsx')
  const collapsibleSectionPath = path.resolve(root, 'src', 'features', 'panels', 'ui', 'CollapsibleSection.tsx')
  const mainPanelSettingsPanelShellPath = path.resolve(root, 'src', 'features', 'panels', 'ui', 'MainPanelSettingsPanelShell.tsx')
  const settingsSectionsPath = path.resolve(root, 'src', 'features', 'panels', 'views', 'SettingsSections.tsx')
  const sourceFileRowsPath = path.resolve(root, 'src', 'features', 'panels', 'views', 'SourceFileManagementSettingsRows.tsx')
  const specialValueNodePath = path.resolve(root, 'src', 'features', 'panels', 'views', 'SettingsSpecialValueNode.tsx')
  const settingsUiPath = path.resolve(root, 'src', 'features', 'settings', 'ui.tsx')
  const indexCssPath = path.resolve(root, 'src', 'index.css')

  const settingsEntryRow = readUtf8(settingsEntryRowPath)
  const settingsEntryRowInput = readUtf8(settingsEntryRowInputPath)
  if (!settingsEntryRow.includes('UI_TEXT_TRUNCATE')) {
    throw new Error('Expected SettingsEntryRow to use the shared ellipsis helper for long labels')
  }
  if (!settingsEntryRow.includes('className="w-full min-w-0 max-w-full overflow-hidden"')) {
    throw new Error('Expected SettingsEntryRow tooltips to constrain long labels before ellipsis')
  }
  if (!settingsEntryRow.includes('RightAlignedValueCell') || !settingsEntryRow.includes('valueNode={<RightAlignedValueCell>')) {
    throw new Error('Expected SettingsEntryRow values to reuse the shared responsive value cell')
  }
  if (!settingsEntryRowInput.includes('UI_RESPONSIVE_SETTINGS_VALUE_WRAPPER_CLASSNAME') || settingsEntryRowInput.includes('min-h-[24px]')) {
    throw new Error('Expected SettingsEntryRow input value wrappers to use the shared responsive value wrapper')
  }

  const detailsTable = readUtf8(detailsTablePath)
  if (!detailsTable.includes('table-fixed') || !detailsTable.includes('title={modules}')) {
    throw new Error('Expected SettingsEntryDetailsTable to preserve details behind clipped cells')
  }
  if (!detailsTable.includes('UI_TEXT_TRUNCATE')) {
    throw new Error('Expected SettingsEntryDetailsTable to ellipsize long module/class/function details')
  }

  const indexCss = readUtf8(indexCssPath)
  if (!indexCss.includes('display: block;') || !indexCss.includes('max-inline-size: 100%')) {
    throw new Error('Expected shared truncate utility to create a bounded ellipsis box')
  }

  const collapsibleSection = readUtf8(collapsibleSectionPath)
  const mainPanelSettingsPanelShell = readUtf8(mainPanelSettingsPanelShellPath)
  if (!collapsibleSection.includes('flex min-w-0 max-w-full items-center justify-between gap-1')) {
    throw new Error('Expected CollapsibleSection headers to stay within mobile panel bounds')
  }
  if (!collapsibleSection.includes('min-w-0 flex-1 overflow-hidden')) {
    throw new Error('Expected CollapsibleSection title area to release width to the action button')
  }
  if (!collapsibleSection.includes('UI_RESPONSIVE_PANEL_HEADER_ACTIONS_CLASSNAME') || collapsibleSection.includes('max-w-[45%]')) {
    throw new Error('Expected CollapsibleSection action lanes to use the shared responsive panel header owner')
  }
  if (!mainPanelSettingsPanelShell.includes('UI_RESPONSIVE_PANEL_HEADER_SECONDARY_CLASSNAME') || mainPanelSettingsPanelShell.includes('max-w-[55%]')) {
    throw new Error('Expected MainPanelSettingsPanelShell secondary lanes to use the shared responsive panel header owner')
  }

  const settingsSections = readUtf8(settingsSectionsPath)
  if (!settingsSections.includes('UI_TEXT_TRUNCATE') || !settingsSections.includes('inline-flex min-w-0 max-w-full items-center gap-1 overflow-hidden')) {
    throw new Error('Expected SettingsSections titles to ellipsize instead of overflowing on mobile')
  }

  const sourceFileRows = readUtf8(sourceFileRowsPath)
  if (!sourceFileRows.includes('SOURCE_FILE_ROW_DESCRIPTION_CLASS_NAME') || !sourceFileRows.includes('UI_TEXT_TRUNCATE')) {
    throw new Error('Expected Source File Management settings rows to reuse shared ellipsis classes')
  }
  if (!sourceFileRows.includes('SOURCE_FILE_ROW_VALUE_CLASS_NAME') || !sourceFileRows.includes('uiToolbarRowScrollClassName')) {
    throw new Error('Expected Source File Management value groups to stay inside the responsive value cell')
  }

  const specialValueNode = readUtf8(specialValueNodePath)
  if (!specialValueNode.includes('specialValueRowClassName') || !specialValueNode.includes('uiToolbarRowScrollClassName')) {
    throw new Error('Expected Settings special value rows to scroll within the KTV value cell')
  }
  if (!specialValueNode.includes('UI_RESPONSIVE_COMPACT_PANEL_FLEX_INPUT_CLASSNAME') || specialValueNode.includes('min-w-[7rem]')) {
    throw new Error('Expected Settings special value input shells to use the shared compact panel flex-input owner')
  }
  if (specialValueNode.includes('flex items-center gap-2') || specialValueNode.includes('flex-1 min-w-0')) {
    throw new Error('Expected Settings special value rows to avoid stale fixed-width mobile layouts')
  }

  const settingsUi = readUtf8(settingsUiPath)
  if (!settingsUi.includes('overflow-hidden text-ellipsis whitespace-nowrap')) {
    throw new Error('Expected read-only settings values to ellipsize on mobile')
  }
  if (!settingsUi.includes('w-full min-w-0 max-w-full h-6')) {
    throw new Error('Expected settings inputs and selects to keep responsive width constraints')
  }
}

export const testToolbarRendererViewLazyLoadsWorkspaceTableModeControl = () => {
  const root = process.cwd()
  const filePath = path.resolve(root, 'src', 'features', 'toolbar', 'ToolbarToolMenuRendererView.tsx')
  const text = readUtf8(filePath)
  if (text.includes("import { WorkspaceTableModeControl } from '@/features/workspace-table/ui/WorkspaceTableModeControl'")) {
    throw new Error('Expected ToolbarToolMenuRendererView to avoid a static WorkspaceTableModeControl import')
  }
  if (!text.includes('const WorkspaceTableModeControlLazy = React.lazy(async () => {')) {
    throw new Error('Expected ToolbarToolMenuRendererView to lazy-load WorkspaceTableModeControl')
  }
  if (!text.includes('<WorkspaceTableModeControlLazy />')) {
    throw new Error('Expected ToolbarToolMenuRendererView to render the lazy workspace control')
  }
}

export const testWorkspaceTableModeControlAvoidsToolbarSsotBridge = () => {
  const root = process.cwd()
  const filePath = path.resolve(root, 'src', 'features', 'workspace-table', 'ui', 'WorkspaceTableModeControl.tsx')
  const text = readUtf8(filePath)
  if (text.includes("from '@/features/workspace-table/workspaceTableSsot'")) {
    throw new Error('Expected WorkspaceTableModeControl to avoid workspaceTableSsot imports that can pull toolbar chunks into SettingsView')
  }
  if (text.includes("from '@/lib/graph-record-db'") || text.includes('warmGraphRecordDb(')) {
    throw new Error('Expected WorkspaceTableModeControl to avoid the legacy GraphRecordDb warm-up and open the shared Multi-dimensional Table surface directly')
  }
}

export const testMainPanelLazyLoadsInactiveHeavyTabs = () => {
  const root = process.cwd()
  const filePath = path.resolve(root, 'src', 'features', 'panels', 'MainPanel.tsx')
  const text = readUtf8(filePath)
  if (text.includes("import HelpView from '@/features/panels/views/HelpView'")) {
    throw new Error('Expected MainPanel to avoid a static HelpView import')
  }
  if (text.includes("import DashboardView from '@/features/panels/views/DashboardView'")) {
    throw new Error('Expected MainPanel to avoid a static DashboardView import')
  }
  if (text.includes("import WorkflowSection from '@/features/panels/views/WorkflowSection'")) {
    throw new Error('Expected MainPanel to avoid a static WorkflowSection import')
  }
  if (!text.includes("const HelpViewLazy = React.lazy(() => import('@/features/panels/views/HelpView'))")) {
    throw new Error('Expected MainPanel to lazy-load HelpView')
  }
  if (!text.includes("const DashboardViewLazy = React.lazy(() => import('@/features/panels/views/DashboardView'))")) {
    throw new Error('Expected MainPanel to lazy-load DashboardView')
  }
  if (text.includes("const WorkflowSectionLazy = React.lazy(() => import('@/features/panels/views/WorkflowSection'))")) {
    throw new Error('Expected MainPanel to avoid legacy WorkflowSection lazy loading after consolidation into StoryboardWidgetManager')
  }
}

export const testMainPanelSettingsSurfacesSourceFileManagementContract = () => {
  const root = process.cwd()
  const settingsViewPath = path.resolve(root, 'src', 'features', 'panels', 'views', 'SettingsView.tsx')
  const sourceFileRowsPath = path.resolve(root, 'src', 'features', 'panels', 'views', 'SourceFileManagementSettingsRows.tsx')
  const collapseStatePath = path.resolve(root, 'src', 'features', 'markdown', 'ui', 'useMarkdownExplorerSectionCollapseState.ts')
  const schemaPath = path.resolve(root, 'src', 'features', 'settings', 'settings-flow.schema.json')

  const settingsViewText = readUtf8(settingsViewPath)
  const sourceFileRowsText = readUtf8(sourceFileRowsPath)
  const collapseStateText = readUtf8(collapseStatePath)
  const schemaText = readUtf8(schemaPath)

  if (settingsViewText.includes('<SourceFileManagementSettingsPanel')) {
    throw new Error('Expected MainPanel Settings to remove the legacy standalone Source File Management panel')
  }
  if (!settingsViewText.includes('<SourceFileManagementSettingsRows')) {
    throw new Error('Expected MainPanel Settings to render Source File Management rows inside the Settings section')
  }
  if (!settingsViewText.includes('getAreaIntroItemCount={getSettingsAreaIntroItemCount}')) {
    throw new Error('Expected MainPanel Settings section counts to include Source File Management lead rows')
  }
  if (!sourceFileRowsText.includes('SOURCE_FILE_MANAGEMENT_SETTINGS_ROW_COUNT = 7')) {
    throw new Error('Expected Source File Management lead row count to stay owned by the rows module')
  }
  if (!sourceFileRowsText.includes("from 'grph-shared/react/keyTypeValueRow'")) {
    throw new Error('Expected Source File Management settings to reuse the shared Key/Type/Value row primitive from the upstream owner')
  }
  if (!sourceFileRowsText.includes('buildSettingsRowAnchorId')) {
    throw new Error('Expected Source File Management settings to reuse the shared settings row anchor helper')
  }
  if (sourceFileRowsText.includes('rounded-xl') || sourceFileRowsText.includes('grid grid-cols-2')) {
    throw new Error('Expected Source File Management settings to avoid the legacy standalone card/stat-grid layout')
  }
  if (!sourceFileRowsText.includes('Restore docs mirror defaults') || !sourceFileRowsText.includes('Open Source Files')) {
    throw new Error('Expected Source File Management settings rows to expose docs mirror restore and Source Files open actions')
  }
  if (!sourceFileRowsText.includes('scheduleApplyComposedGraphFromSourceFiles()')) {
    throw new Error('Expected Source File Management settings rows to reuse the canonical passive Source Files recomposition scheduler')
  }
  if (!sourceFileRowsText.includes('Import local files remains an explicit manual action') || !sourceFileRowsText.includes('Select folder') || !sourceFileRowsText.includes('Select files') || !sourceFileRowsText.includes('Automatic') || !sourceFileRowsText.includes('Manual')) {
    throw new Error('Expected Source File Management settings rows to expose explicit local selection and automatic/manual sync controls')
  }
  if (!collapseStateText.includes('requestMarkdownExplorerSourceFilesOpen')) {
    throw new Error('Expected markdown explorer collapse state to expose a source-owned Source Files open request')
  }
  if (!schemaText.includes('"area": "Source File Management"')) {
    throw new Error('Expected settings schema to group Source Files controls under Source File Management')
  }
}

export const testWorkflowManagerReusesWorkspaceTableSsotForMultiDimView = () => {
  const root = process.cwd()
  const filePath = path.resolve(root, 'src', 'features', 'storyboard-widget-manager', 'StoryboardWidgetGraphTab.tsx')
  const text = readUtf8(filePath)
  const removedWorkspaceSymbol = ['GraphTable', 'Workspace'].join('')
  if (!text.includes("from '@/features/workspace-table/workspaceTablePreferencesStore'")) {
    throw new Error('Expected Workflow Manager to read workspace table mode from workspaceTablePreferencesStore SSOT')
  }
  if (!text.includes('workspaceEditorMode === \'multiDimTable\'')) {
    throw new Error('Expected Workflow Manager to gate multi-dimensional table view by workspaceEditorMode SSOT')
  }
  if (!text.includes('<MultiDimTableSurface active ariaLabel="Workflow Multi-dimensional Table" />')) {
    throw new Error('Expected Workflow Manager to render the shared Multi-dimensional Table surface')
  }
  if (text.includes(removedWorkspaceSymbol)) {
    throw new Error('Expected Workflow Manager to avoid the removed graph-table workspace surface')
  }
  if (text.includes('Legacy graph-manager controls are suppressed for frontmatter workflow processing.')) {
    throw new Error('Expected Workflow Manager to remove dedicated workflow sections mode panel copy after Graph Fields consolidation')
  }
  if (text.includes('WorkflowManagerInspectorPanel')) {
    throw new Error('Expected Workflow Manager to avoid dedicated inspector panel and reuse Graph Fields pane model')
  }
}

export const testFloatingPanelRemovesDesignLayersViewAfterWorkflowManagerConsolidation = () => {
  const root = process.cwd()
  const filePath = path.resolve(root, 'src', 'lib', 'toolbar', 'ToolbarToolMenu.impl.tsx'), xrSceneViewsPath = path.resolve(root, 'src', 'lib', 'toolbar', 'FloatingPanelXrSceneViews.tsx')
  const iconLibraryPath = path.resolve(root, 'src', 'features', 'panels', 'ui', 'mainPanelHelpIconLibrary.tsx')
  const floatingPanelTypesPath = path.resolve(root, 'src', 'hooks', 'store', 'store-types', 'graph-state-chat-import.ts')
  const uiSliceInitialStatePath = path.resolve(root, 'src', 'hooks', 'store', 'uiSliceInitialState.ts')
  const commandCatalogPanelPath = path.resolve(root, 'src', 'features', 'command-menu', 'CommandMenuCatalogPanel.tsx')
  const commandMenuDirectoryPath = path.resolve(root, 'src', 'features', 'command-menu')
  const inlineCommandCatalogPath = path.resolve(root, 'src', 'lib', 'command-menu', 'inlineCommandMenuCatalog.ts')
  const responsiveInlineIconBadgePath = path.resolve(root, 'src', 'lib', 'ui', 'ResponsiveInlineIconBadge.tsx'), floatingPanelCatalogLayoutPath = path.resolve(root, 'src', 'lib', 'ui', 'floatingPanelCatalogLayout.tsx')
  const mediaKindOverlayPath = path.resolve(root, 'src', 'lib', 'ui', 'MediaKindOverlay.tsx')
  const mediaKindOverlayIconPath = path.resolve(root, 'src', 'lib', 'ui', 'mediaKindOverlayIcon.ts')
  const mediaOverlayAppearancePath = path.resolve(root, 'src', 'lib', 'ui', 'mediaOverlayAppearance.ts')
  const mediaLightboxPath = path.resolve(root, 'src', 'lib', 'ui', 'MediaLightbox.tsx'), richMediaDirectSurfacePath = path.resolve(root, 'src', 'components', 'RichMediaPanelDirectMediaSurface.tsx')
  const mediaLightboxPromptParametersPath = path.resolve(root, 'src', 'lib', 'ui', 'mediaLightboxPromptParameters.ts')
  const uiBarrelPath = path.resolve(root, 'src', 'lib', 'ui', 'index.ts')
  const indexCssPath = path.resolve(root, 'src', 'index.css')
  const uploadedMediaPanelUploadPath = path.resolve(root, 'src', 'lib', 'storage', 'uploadedMediaPanelUpload.ts')
  const helpSectionsPath = path.resolve(root, 'src', 'features', 'panels', 'views', 'HelpSections.tsx')
  const helpCommandMenuSectionPath = path.resolve(root, 'src', 'features', 'panels', 'views', 'HelpCommandMenuSection.tsx')
  const helpCloudflareMediaSectionPath = path.resolve(root, 'src', 'features', 'panels', 'views', 'HelpCloudflareMediaSection.tsx')
  const launcherPath = path.resolve(root, 'src', 'features', 'toolbar', 'ToolbarMenuLauncher.tsx')
  const typesPath = path.resolve(root, 'src', 'features', 'toolbar', 'ToolbarToolMenuTypes.ts')
  const text = readUtf8(filePath), xrSceneViewsText = readUtf8(xrSceneViewsPath)
  const iconLibraryText = readUtf8(iconLibraryPath)
  const floatingPanelTypesText = readUtf8(floatingPanelTypesPath)
  const uiSliceInitialStateText = readUtf8(uiSliceInitialStatePath)
  const commandCatalogReferenceText = readUtf8(commandCatalogPanelPath)
  const commandMenuFileNames = [
    'CommandMenuCatalogPanel.tsx',
    'MediaCatalogPanel.tsx',
    'MediaCatalogPanelView.tsx',
    'mediaCatalogActionSelection.ts',
    'mediaCatalogCandidateItems.tsx',
    'mediaCatalogListItems.tsx',
    'mediaCatalogShared.tsx',
    'mediaCatalogTypes.ts',
    'mediaCatalogUploadedFields.tsx',
    'mediaCatalogUploadedItems.tsx',
  ]
  const commandCatalogPanelText = commandMenuFileNames
    .map(fileName => readUtf8(path.resolve(commandMenuDirectoryPath, fileName)))
    .join('\n')
  const inlineCommandCatalogText = readUtf8(inlineCommandCatalogPath)
  const responsiveInlineIconBadgeText = readUtf8(responsiveInlineIconBadgePath), floatingPanelCatalogLayoutText = readUtf8(floatingPanelCatalogLayoutPath)
  const mediaKindOverlayText = readUtf8(mediaKindOverlayPath)
  const mediaKindOverlayIconText = readUtf8(mediaKindOverlayIconPath)
  const mediaOverlayAppearanceText = readUtf8(mediaOverlayAppearancePath)
  const mediaLightboxText = readUtf8(mediaLightboxPath), richMediaDirectSurfaceText = readUtf8(richMediaDirectSurfacePath)
  const mediaLightboxPromptParametersText = readUtf8(mediaLightboxPromptParametersPath)
  const uiBarrelText = readUtf8(uiBarrelPath)
  const indexCssText = readUtf8(indexCssPath)
  const uploadedMediaPanelUploadText = readUtf8(uploadedMediaPanelUploadPath)
  const helpSectionsText = readUtf8(helpSectionsPath)
  const helpCommandMenuSectionText = readUtf8(helpCommandMenuSectionPath)
  const helpCloudflareMediaSectionText = readUtf8(helpCloudflareMediaSectionPath)
  const launcherText = readUtf8(launcherPath)
  const typesText = readUtf8(typesPath)
  if (text.includes("view: 'designLayers'")) {
    throw new Error('Expected FloatingPanel to remove designLayers view after Workflow Manager consolidation')
  }
  if (!text.includes("view: 'view'")) {
    throw new Error('Expected FloatingPanel to expose a dedicated View tab beside Props Panel')
  }
  if (text.indexOf("view: 'media'") <= text.indexOf("view: 'view'")) {
    throw new Error('Expected FloatingPanel to place Media immediately after View in the primary view list')
  }
  if (!text.includes("floatingPanelView === 'view' && <WorkspaceDataViewFloatingPanelView />")) {
    throw new Error('Expected FloatingPanel to render the dedicated View settings surface')
  }
  if (!xrSceneViewsText.includes("view === 'media'") || !xrSceneViewsText.includes('<MediaCatalogPanelLazy />')) {
    throw new Error('Expected FloatingPanel to render the Media view')
  }
  const mediaViewIndex = text.indexOf("view: 'media'")
  const animationViewIndex = text.indexOf("view: 'animation'")
  const cameraViewIndex = text.indexOf("view: 'camera'")
  if (!(mediaViewIndex >= 0 && mediaViewIndex < animationViewIndex && animationViewIndex < cameraViewIndex)
    || !xrSceneViewsText.includes("view === 'animation'")
    || !xrSceneViewsText.includes('<XrAnimationFloatingPanelViewLazy />')) {
    throw new Error('Expected FloatingPanel Animation immediately after Media and before Camera with a lazy first-class render branch')
  }
  if (!iconLibraryText.includes('floatingPanel.media') || !iconLibraryText.includes('media: \'floatingPanel.media\'') || !iconLibraryText.includes('floatingPanel.animation') || !iconLibraryText.includes('animation: \'floatingPanel.animation\'')) {
    throw new Error('Expected FloatingPanel icon SSOT to include Media and Animation')
  }
  if (!floatingPanelTypesText.includes("| 'media'") || !floatingPanelTypesText.includes("| 'animation'")) {
    throw new Error('Expected FloatingPanel view type to include Media and Animation')
  }
  if (!uiSliceInitialStateText.includes("view === 'media'") || !uiSliceInitialStateText.includes("view === 'animation'")) {
    throw new Error('Expected FloatingPanel view setter whitelist to accept Media and Animation')
  }
  if (!helpSectionsText.includes('<HelpCommandMenuSection') || !helpCommandMenuSectionText.includes('<CommandMenuReferenceCatalog')) {
    throw new Error('Expected MainPanel Help to own the shared Command Menu reference catalog section')
  }
  if (!commandCatalogReferenceText.includes('INLINE_SLASH_COMMAND_ACTIONS') || !commandCatalogReferenceText.includes('INLINE_VARIABLE_COMMAND_ACTIONS') || !commandCatalogReferenceText.includes('INLINE_KEYWORD_COMMAND_ACTIONS')) {
    throw new Error('Expected Command Menu reference catalog to render from the shared inline command catalog')
  }
  if (!commandCatalogReferenceText.includes('data-kg-command-menu-reference-catalog') || !commandCatalogReferenceText.includes('data-kg-command-menu-prefix')) {
    throw new Error('Expected MainPanel Help Command Menu reference catalog to expose shared prefix rows for /, @, and # actions')
  }
  if (commandCatalogReferenceText.split('\n').length >= 600) {
    throw new Error('Expected CommandMenuCatalogPanel.tsx to stay below 600 lines and keep FloatingPanel Media in its dedicated owner')
  }
  for (const fileName of commandMenuFileNames) {
    const lineCount = readUtf8(path.resolve(commandMenuDirectoryPath, fileName)).split('\n').length
    if (lineCount >= 600) {
      throw new Error(`Expected features/command-menu/${fileName} to stay below 600 lines; got ${lineCount}`)
    }
  }
  if (!commandCatalogPanelText.includes('useCommandMenuRichMediaInventory') || !commandCatalogPanelText.includes('data-kg-media-panel') || !commandCatalogPanelText.includes('data-kg-media-list')) {
    throw new Error('Expected FloatingPanel Media to own the shared @ rich-media candidate list')
  }
  if (
    !commandCatalogPanelText.includes('data-kg-media-layout-selector')
    || !commandCatalogPanelText.includes('data-kg-media-layout-toggle')
    || !commandCatalogPanelText.includes('data-kg-media-search-toggle')
    || !commandCatalogPanelText.includes('data-kg-media-search-affordance')
    || !commandCatalogPanelText.includes('data-kg-media-search-overlay-anchor')
    || !commandCatalogPanelText.includes('data-kg-media-search-panel')
    || !commandCatalogPanelText.includes('data-kg-media-search-inline')
    || !commandCatalogPanelText.includes('data-kg-media-search-overlay')
    || !commandCatalogPanelText.includes('data-kg-media-search-expand-direction')
    || !commandCatalogPanelText.includes('data-kg-media-search-input')
    || commandCatalogPanelText.includes('title="@ media commands"')
    || commandCatalogPanelText.includes('<span>Search</span>')
    || !commandCatalogPanelText.includes('data-kg-media-grid')
    || !commandCatalogPanelText.includes('data-kg-media-list-layout')
    || !commandCatalogPanelText.includes('data-kg-media-card-layout')
    || !commandCatalogPanelText.includes('Card layout')
    || !commandCatalogPanelText.includes('MEDIA_COMPACT_LIST_ROW_LAYOUT')
    || !commandCatalogPanelText.includes('data-kg-media-list-row-layout={MEDIA_COMPACT_LIST_ROW_LAYOUT}')
    || !commandCatalogPanelText.includes('data-kg-media-list-view-row="1"')
    || !commandCatalogPanelText.includes('data-kg-media-list-row-layout="3-rows"')
    || !commandCatalogPanelText.includes('data-kg-media-list-row-section="title"')
    || !commandCatalogPanelText.includes('data-kg-media-list-row-section="meta"')
    || !commandCatalogPanelText.includes('data-kg-media-list-row-section="description"')
    || !commandCatalogPanelText.includes('MEDIA_LIST_THUMBNAIL_COLUMN_CLASSNAME')
    || !commandCatalogPanelText.includes('MEDIA_LIST_THUMBNAIL_FRAME_CLASSNAME')
    || !commandCatalogPanelText.includes("from '@/lib/ui/floatingPanelCatalogLayout'") || !commandCatalogPanelText.includes('floatingPanelCatalogThreeRowClassName')
    || !commandCatalogPanelText.includes('floatingPanelCatalogThreeRowThumbnailFrameClassName') || !floatingPanelCatalogLayoutText.includes('grid-cols-[6.875rem_minmax(0,1fr)]')
    || !floatingPanelCatalogLayoutText.includes('group relative inline-flex h-[4.625rem] w-[6.475rem]') || !floatingPanelCatalogLayoutText.includes('overflow-visible')
    || !commandCatalogPanelText.includes('MediaListThumbnailIconFrame')
    || !commandCatalogPanelText.includes("MediaDownloadOverlay, MediaInfoOverlay, MediaKindOverlay, MediaOpenLinkOverlay } from '@/lib/ui/MediaKindOverlay'")
    || !commandCatalogPanelText.includes("resolveMediaKindOverlayIcon } from '@/lib/ui/mediaKindOverlayIcon'")
    || !commandCatalogPanelText.includes("className={cn('group relative m-0 aspect-[16/9]")
    || !commandCatalogPanelText.includes("className={cn('group relative m-0 grid aspect-[16/9]")
    || !commandCatalogPanelText.includes('isOpenableMediaHref')
    || !commandCatalogPanelText.includes('readRichMediaOpenHref')
    || !commandCatalogPanelText.includes('MediaCandidateCard')
    || !commandCatalogPanelText.includes('UploadedMediaCard')
    || !commandCatalogPanelText.includes('<article')
    || !commandCatalogPanelText.includes('<figure')
  ) {
    throw new Error('Expected FloatingPanel Media to own a semantic grid/list layout selector, proportional media thumbnail lane, card layout, and 3-row list layout')
  }
  if (commandCatalogPanelText.includes('inline-flex h-8 w-14') || commandCatalogPanelText.includes('grid h-10 w-14')) {
    throw new Error('Expected FloatingPanel Media list thumbnails and command icons to reuse the shared proportional thumbnail lane')
  }
  if (
    commandCatalogPanelText.includes('<ResponsiveInlineIconBadge Icon={Icon} label={mediaKind')
    || commandCatalogPanelText.includes('<ResponsiveInlineIconBadge Icon={Icon} label={item.kind} />\n          <a')
    || commandCatalogPanelText.includes('<ResponsiveInlineIconBadge Icon={Icon} label={item.kind} />\n          <span')
    || commandCatalogPanelText.includes('<ResponsiveInlineIconBadge Icon={Icon} label={item.kind} />')
  ) {
    throw new Error('Expected FloatingPanel Media kind labels to consolidate into the shared thumbnail overlay icon instead of text chips')
  }
  if (
    commandCatalogPanelText.includes('function MediaKindBadge')
    || !commandCatalogPanelText.includes("ResponsiveInlineIconBadge } from '@/lib/ui/ResponsiveInlineIconBadge'")
    || !responsiveInlineIconBadgeText.includes('getChipClass')
    || !responsiveInlineIconBadgeText.includes('UI_RESPONSIVE_INLINE_ELEMENT_ROW_CLASSNAME')
    || !responsiveInlineIconBadgeText.includes("className={cn('h-3 w-3 shrink-0'")
    || !responsiveInlineIconBadgeText.includes('data-kg-responsive-inline-icon-badge')
  ) {
    throw new Error('Expected FloatingPanel Media kind chips to reuse the shared responsive inline icon badge while keeping tiny icons')
  }
  if (
    !mediaKindOverlayText.includes('export function MediaKindOverlay')
    || !mediaKindOverlayText.includes('export function MediaOpenLinkOverlay')
    || !mediaKindOverlayText.includes('export function MediaInfoOverlay')
    || !mediaKindOverlayText.includes('export function MediaDownloadOverlay')
    || !mediaKindOverlayText.includes('buildMarkdownMediaDownloadHref')
    || !mediaKindOverlayText.includes('deriveMarkdownMediaDownloadFilename')
    || !mediaKindOverlayText.includes('data-kg-media-kind-overlay-icon')
    || !mediaKindOverlayText.includes('data-kg-media-open-link-overlay')
    || !mediaKindOverlayText.includes('data-kg-media-info-overlay')
    || !mediaKindOverlayText.includes('data-kg-media-info-overlay-tooltip')
    || !mediaKindOverlayText.includes('data-kg-media-download-overlay')
    || !mediaKindOverlayIconText.includes('export function resolveMediaKindOverlayIcon')
    || !mediaKindOverlayIconText.includes('FileAudio')
    || !mediaKindOverlayIconText.includes('FileCode2')
    || !mediaOverlayAppearanceText.includes('export type MediaOverlayAppearance')
    || !mediaOverlayAppearanceText.includes('MEDIA_OVERLAY_HOVER_APPEAR_CLASSNAME')
    || !mediaOverlayAppearanceText.includes('group-hover:opacity-100')
    || !mediaKindOverlayText.includes('getMediaOverlayAppearanceClassName(appearance)')
    || !mediaKindOverlayText.includes('group-hover:block')
    || !mediaKindOverlayText.includes('group-focus:block')
    || !mediaKindOverlayText.includes('bottom-1 right-1')
    || !mediaKindOverlayText.includes('right-1 top-1')
    || !mediaKindOverlayText.includes('bottom-1 left-1')
    || !mediaKindOverlayText.includes('pointer-events-auto')
    || !mediaKindOverlayText.includes('ExternalLink')
    || !mediaKindOverlayText.includes('Download')
    || !mediaKindOverlayText.includes('Info')
    || !mediaKindOverlayText.includes('bg-[color:var(--kg-panel-bg)]/80')
    || !mediaKindOverlayText.includes('backdrop-blur-sm')
    || !mediaKindOverlayText.includes("Icon className=\"h-3 w-3\"")
    || !uiBarrelText.includes("export * from './MediaKindOverlay'")
    || !uiBarrelText.includes("export * from './mediaKindOverlayIcon'")
    || !uiBarrelText.includes("export * from './mediaOverlayAppearance'")
  ) {
    throw new Error('Expected Media kind and open-link overlays to be shared translucent UI utilities exported across agenticgraph')
  }
  if (
    !commandCatalogPanelText.includes('appearance="hover"')
    || commandCatalogPanelText.includes('opacity-0 transition-opacity group-hover:opacity-100')
  ) {
    throw new Error('Expected FloatingPanel Media thumbnail overlays to use the shared hover-appear overlay utility')
  }
  if (
    !commandCatalogPanelText.includes('MediaLightbox')
    || !commandCatalogPanelText.includes('handlePreviewUploadedMedia')
    || !commandCatalogPanelText.includes('onPreviewUploadedMedia={handlePreviewUploadedMedia}')
    || !commandCatalogPanelText.includes('onPreview={onPreviewUploadedMedia}')
    || !commandCatalogPanelText.includes('data-kg-media-thumbnail-fullscreen')
    || !commandCatalogPanelText.includes('MediaDownloadOverlay')
    || !mediaLightboxText.includes('PreviewOverlay')
    || !mediaLightboxText.includes('<RichMediaPanel') || !richMediaDirectSurfaceText.includes('ZoomPanViewport')
    || !mediaLightboxText.includes('data-kg-media-lightbox="1"')
    || !mediaLightboxText.includes('data-kg-media-lightbox-kind')
    || !mediaLightboxText.includes("'data-kg-media-lightbox-fullscreen': '1'")
    || !mediaLightboxText.includes('data-kg-media-lightbox-close="1"')
    || !mediaLightboxText.includes('data-kg-media-lightbox-video="1"')
    || !mediaLightboxText.includes('data-kg-media-lightbox-audio="1"')
    || !richMediaDirectSurfaceText.includes('LS_KEYS.previewZoomPanMedia')
    || !uiBarrelText.includes("export * from './MediaLightbox'")
  ) {
    throw new Error('Expected FloatingPanel Media thumbnail preview and Download Media to reuse shared preview and download utilities')
  }
  if (
    !commandCatalogPanelText.includes('data-kg-media-new-button')
    || !commandCatalogPanelText.includes('aria-label="New Media"')
    || !commandCatalogPanelText.includes('data-kg-media-upload-input')
    || !commandCatalogPanelText.includes('accept="image/*,audio/*,video/*"')
    || !commandCatalogPanelText.includes('MEDIA_LIBRARY_OPEN_TOP_EVENT')
    || !commandCatalogPanelText.includes('mediaListRef')
    || !commandCatalogPanelText.includes('openMediaLibraryTop')
    || !commandCatalogPanelText.includes('MEDIA_NEW_ACTIONS')
    || !commandCatalogPanelText.includes("label: 'Upload Media'")
    || !commandCatalogPanelText.includes("label: 'Import URL'")
    || !commandCatalogPanelText.includes('data-kg-media-import-url-prompt="1"')
    || !commandCatalogPanelText.includes("from '@/features/toolbar/ImportUrlPrompt'")
    || !commandCatalogPanelText.includes("from '@/lib/storage/uploadedMediaPanelImportUrl'")
    || !commandCatalogPanelText.includes("label: 'Generate Media'")
    || !commandCatalogPanelText.includes('generateLightboxOpen')
    || !commandCatalogPanelText.includes('buildMediaLightboxPromptParameters')
    || !commandCatalogPanelText.includes("from '@/lib/ui/mediaDragPayload'")
    || !commandCatalogPanelText.includes('writeMediaDragPayload(event.dataTransfer, payload)')
    || !commandCatalogPanelText.includes('data-kg-media-draggable="1"')
    || !inlineCommandCatalogText.includes("label: 'New Media'")
  ) {
    throw new Error('Expected FloatingPanel Media to expose New Media upload/generate choices while preserving shared upload and prompt-panel support')
  }
  if (
    !mediaLightboxText.includes('data-kg-media-lightbox-empty-output="1"')
    || !mediaLightboxText.includes('open={open && (hasMediaSource || editablePrompt)}')
    || !mediaLightboxPromptParametersText.includes('buildMediaLightboxPromptParameters')
    || !mediaLightboxPromptParametersText.includes('CHAT_BYTEPLUS_IMAGE_MODEL_OPTIONS')
    || !mediaLightboxPromptParametersText.includes('MEDIA_VARIATION_COUNT_PARAMETER_OPTIONS')
  ) {
    throw new Error('Expected shared MediaLightbox to support prompt-only generated media panels with reusable model and parameter controls')
  }
  if (!commandCatalogPanelText.includes('uploadFilesToUploadedMediaPanel') || !uploadedMediaPanelUploadText.includes('uploadMediaFileToAgenticGraphStorage') || !commandCatalogPanelText.includes('data-kg-media-upload-item') || !commandCatalogPanelText.includes('MediaOpenLinkOverlay')) {
    throw new Error('Expected FloatingPanel Media upload rows to reuse the Cloudflare media storage helper and expose synced links')
  }
  if (
    commandCatalogPanelText.includes('Open Cloudflare media link')
    || commandCatalogPanelText.includes('Open local media link')
    || commandCatalogPanelText.includes('Cloudflare media link')
    || commandCatalogPanelText.includes('Local media link')
    || commandCatalogPanelText.includes('>Open</a>')
  ) {
    throw new Error('Expected FloatingPanel Media open-link actions to consolidate into the shared thumbnail overlay instead of text links')
  }
  if (
    commandCatalogPanelText.includes('Cloudflare storage')
    || commandCatalogPanelText.includes('Local storage')
  ) {
    throw new Error('Expected FloatingPanel Media to remove stale storage status copy from uploaded media rows')
  }
  if (
    !commandCatalogPanelText.includes('MEDIA_DESCRIPTION_STORAGE_KEY')
    || !commandCatalogPanelText.includes('MEDIA_FIELDS_STORAGE_KEY')
    || !commandCatalogPanelText.includes('readUploadedMediaDescription')
    || !commandCatalogPanelText.includes('readUploadedMediaFieldText')
    || !commandCatalogPanelText.includes('buildUploadedMediaInfoLabel')
    || !commandCatalogPanelText.includes('handleUploadedMediaDescriptionChange')
    || !commandCatalogPanelText.includes('handleUploadedMediaFieldChange')
    || !commandCatalogPanelText.includes('data-kg-media-description-input')
    || !commandCatalogPanelText.includes('buildUploadedMediaDefaultFieldTokens')
    || !commandCatalogPanelText.includes('data-kg-media-field-tags-inline')
    || !commandCatalogPanelText.includes('data-kg-media-field-input')
    || !commandCatalogPanelText.includes('renderMarkdownSigilInlineText(normalizedValue)')
    || !commandCatalogPanelText.includes('UI_INLINE_CHIP_GROUP_CLASSNAME')
    || !indexCssText.includes('[data-kg-media-description-input]')
    || !indexCssText.includes('display: inline-block !important;')
    || !commandCatalogPanelText.includes('MediaInfoOverlay')
  ) {
    throw new Error('Expected FloatingPanel Media uploaded rows to expose editable descriptions, # metadata fields, and the shared info overlay')
  }
  if (
    commandCatalogPanelText.includes('data-kg-media-field-tags="1"')
    || commandCatalogPanelText.includes('data-kg-media-field-tag={')
    || commandCatalogPanelText.includes('data-kg-media-field-tag=')
    || commandCatalogPanelText.includes('DATA_VIEW_CHIP_ROW_CLASSNAME')
    || commandCatalogPanelText.includes('readInlineKeywordChipLabel')
    || commandCatalogPanelText.includes('readInlineKeywordChipToneValue')
    || commandCatalogPanelText.includes('UI_TEXT_TRUNCATE_CHIP')
    || commandCatalogPanelText.includes('splitInlineKeywordChipTokens')
    || commandCatalogPanelText.includes('resolveDataViewChipClass(tag)')
    || commandCatalogPanelText.includes('text-[11px] font-normal leading-5')
    || commandCatalogPanelText.includes("style={{ display: 'inline-flex' }}")
    || indexCssText.includes('[data-kg-media-field-tags-inline]')
  ) {
    throw new Error('Expected FloatingPanel Media uploaded # fields to delegate to the shared Markdown sigil utility without local chip/font/display overrides')
  }
  if (commandCatalogPanelText.includes('UploadedMediaFieldTags')) {
    throw new Error('Expected FloatingPanel Media uploaded # fields to inline-edit through the metadata row instead of a separate section')
  }
  if (
    commandCatalogPanelText.includes('data-kg-command-menu-cloudflare-media-service')
    || commandCatalogPanelText.includes('CLOUDFLARE_MEDIA_ASSET_SYNC_SERVICES')
  ) {
    throw new Error('Expected FloatingPanel Media to avoid Cloudflare storage configuration rows')
  }
  if (!helpSectionsText.includes('<HelpCloudflareMediaSection') || !helpCloudflareMediaSectionText.includes('data-kg-main-panel-cloudflare-media-service')) {
    throw new Error('Expected MainPanel Help to own the Cloudflare media runtime configuration rows')
  }
  if (
    !commandCatalogPanelText.includes('data-kg-command-menu-media-thumbnail')
    || !commandCatalogPanelText.includes('mediaListThumbnailFrameClassName')
    || !commandCatalogPanelText.includes('rounded border')
    || !commandCatalogPanelText.includes('UI_THEME_TOKENS.panel.border')
    || !commandCatalogPanelText.includes('UI_THEME_TOKENS.input.bg')
    || !commandCatalogPanelText.includes('shadow-sm')
  ) {
    throw new Error('Expected FloatingPanel Media thumbnails to use the shared tokenized proportional thumbnail frame')
  }
  if (
    !commandCatalogPanelText.includes('data-kg-command-menu-media-name-input')
    || !commandCatalogPanelText.includes('renameCommandMenuRichMediaMarkdownHref')
    || !commandCatalogPanelText.includes("owner.type === 'graphNodeLabel'")
    || !commandCatalogPanelText.includes('setMarkdownDocument(markdownDocumentName, nextText')
  ) {
    throw new Error('Expected FloatingPanel Media names to be inline-editable through graph and markdown owners')
  }
  if (!commandCatalogPanelText.includes('KeyTypeValueHeader') || !commandCatalogPanelText.includes('KeyTypeValueStaticRow') || !commandCatalogPanelText.includes('KeyTypeValueSectionStack')) {
    throw new Error('Expected MainPanel Help Command Menu catalog to keep using shared KTV primitives')
  }
  if (commandCatalogPanelText.includes('data-kg-media-ktv-layout')) {
    throw new Error('Expected Media panel list mode to remove the legacy KTV three-column layout marker')
  }
  if (text.includes("floatingPanelView === 'designLayers'")) {
    throw new Error('Expected FloatingPanel to avoid rendering designLayers branch after consolidation')
  }
  if (text.includes("view: 'discovery'")) {
    throw new Error('Expected FloatingPanel to remove legacy discovery tab after Props Panel Discovery Widget consolidation')
  }
  if (text.includes("floatingPanelView === 'discovery'")) {
    throw new Error('Expected FloatingPanel to remove dedicated discovery branch after Props Panel Discovery Widget consolidation')
  }
  if (text.includes('normalizeRequestedFloatingPanelView')) {
    throw new Error('Expected FloatingPanel to remove legacy requested-view remapping after discovery consolidation')
  }
  if (launcherText.includes("'discovery'")) {
    throw new Error('Expected ToolbarMenuLauncher to remove legacy discovery requested-view support')
  }
  if (!launcherText.includes("tab === 'view'")) {
    throw new Error('Expected ToolbarMenuLauncher to route shared View requests into the FloatingPanel')
  }
  if (typesText.includes("'discovery'")) {
    throw new Error('Expected ToolbarToolMenuProps to remove legacy discovery requested-view type support')
  }
  if (!typesText.includes("import type { FloatingPanelView }") || !typesText.includes('requestedFloatingPanelView?: FloatingPanelView')) {
    throw new Error('Expected ToolbarToolMenuProps to use the shared FloatingPanelView type owner')
  }
}

export const testWorkflowManagerConsolidatedEntriesReuseGraphFieldsRightPane = () => {
  const root = process.cwd()
  const storyboardWidgetGraphTabPath = path.resolve(root, 'src', 'features', 'storyboard-widget-manager', 'StoryboardWidgetGraphTab.tsx')
  const graphFieldsViewPath = path.resolve(root, 'src', 'features', 'panels', 'views', 'GraphFieldsView.tsx')
  const graphFieldsCommandsPath = path.resolve(root, 'src', 'features', 'panels', 'views', 'graph-fields', 'graphFieldsEntryCommands.ts')
  const graphTabText = readUtf8(storyboardWidgetGraphTabPath)
  const graphFieldsText = readUtf8(graphFieldsViewPath)
  const graphFieldsCommandsText = readUtf8(graphFieldsCommandsPath)

  if (!graphTabText.includes('entryShortcutLabels={WORKFLOW_MANAGER_GRAPH_FIELDS_COMMAND_ENTRY_LABELS}')) {
    throw new Error('Expected Workflow Manager to pass consolidated workflow shortcut labels into GraphFieldsView')
  }
  if (!graphTabText.includes('GRAPH_FIELDS_COMMAND_ENTRY_LABELS')) {
    throw new Error('Expected non-workflow graph tab to reuse shared Graph Fields command entry labels')
  }
  if (!graphTabText.includes('entryOpenRequest={entryOpenRequest}')) {
    throw new Error('Expected Workflow Manager to pass entry open requests into GraphFieldsView')
  }
  if (!graphFieldsText.includes('resolveGraphFieldsEntryCommandTarget')) {
    throw new Error('Expected GraphFieldsView to route entry commands through the shared Graph Fields command helper')
  }
  if (!graphFieldsText.includes('isGraphFieldsSelectionInspectorEntryLabel')) {
    throw new Error('Expected GraphFieldsView to detect selection-inspector entry requests inside the shared Graph Fields pane model')
  }
  if (!graphFieldsText.includes('GraphRecordSelectionInspectorLazy')) {
    throw new Error('Expected GraphFieldsView to reuse the shared selection inspector inside the existing settings pane')
  }
  if (!graphFieldsText.includes('handledEntryOpenTokenRef')) {
    throw new Error('Expected GraphFieldsView entry-open handling to dedupe repeated request tokens and avoid runtime update loops')
  }
  if (!graphFieldsCommandsText.includes('WORKFLOW_MANAGER_GRAPH_FIELDS_COMMAND_ENTRY_LABELS') || !graphFieldsCommandsText.includes('resolveGraphFieldsEntryCommandTarget')) {
    throw new Error('Expected Graph Fields command helper to own workflow labels and target routing')
  }
  if (!graphFieldsCommandsText.includes('isGraphFieldsSelectionInspectorEntryLabel')) {
    throw new Error('Expected Graph Fields command helper to centralize selection-inspector entry detection')
  }
  if (!graphFieldsCommandsText.includes('INLINE_MEDIA_COMMAND_ENTRY_LABELS')) {
    throw new Error('Expected Graph Fields command helper to reuse shared media command labels')
  }
  if (!graphFieldsCommandsText.includes("label.includes('image')") || !graphFieldsCommandsText.includes("label.includes('video')")) {
    throw new Error('Expected Graph Fields command helper to route image/video command entries')
  }
  if (!graphFieldsText.includes('entryOpenRequest?:')) {
    throw new Error('Expected GraphFieldsView to accept consolidated entry open requests')
  }
  if (!graphFieldsText.includes('setSelectedFieldId(target.id)')) {
    throw new Error('Expected GraphFieldsView to open right-pane Field Settings by selecting a target field')
  }
  if (!graphFieldsText.includes('graphFields:entryOpen:')) {
    throw new Error('Expected GraphFieldsView consolidated entry-open path to provide visible toast confirmation')
  }
  if (!graphFieldsText.includes('scrollIntoView')) {
    throw new Error('Expected GraphFieldsView consolidated entry-open path to move focus toward right-pane Field Settings')
  }
}

export const testGraphFieldsResponsiveSizingOwnersStayShared = () => {
  const root = process.cwd()
  const responsiveCssPath = path.resolve(root, 'src', 'styles', 'responsive-toolbar.css')
  const responsiveElementClassesPath = path.resolve(root, 'src', 'lib', 'ui', 'responsiveElementClasses.ts')
  const fieldLayoutPath = path.resolve(root, 'src', 'features', 'panels', 'views', 'graph-fields', 'FieldLayoutSection.tsx')
  const fieldEndpointsPath = path.resolve(root, 'src', 'features', 'panels', 'views', 'graph-fields', 'FieldEndpointsAndCardinalitySection.tsx')
  const fieldSamplesPath = path.resolve(root, 'src', 'features', 'panels', 'views', 'graph-fields', 'FieldSamplesPanel.tsx')
  const graphFieldIconsPath = path.resolve(root, 'src', 'features', 'graph-fields', 'ui', 'graphFieldIcons.tsx')

  const responsiveCss = readUtf8(responsiveCssPath)
  const responsiveElementClasses = readUtf8(responsiveElementClassesPath)
  const fieldLayout = readUtf8(fieldLayoutPath)
  const fieldEndpoints = readUtf8(fieldEndpointsPath)
  const fieldSamples = readUtf8(fieldSamplesPath)
  const graphFieldIcons = readUtf8(graphFieldIconsPath)

  if (
    !responsiveElementClasses.includes('UI_RESPONSIVE_GRAPH_FIELDS_OWNER_VALUE_CLASSNAME') ||
    !responsiveElementClasses.includes('UI_RESPONSIVE_WIDE_PANEL_HEADER_SECONDARY_CLASSNAME') ||
    !responsiveCss.includes('.kg-graph-fields-owner-value') ||
    !responsiveCss.includes('--kg-graph-fields-owner-value-width') ||
    !responsiveCss.includes('.kg-responsive-panel-header-secondary--wide') ||
    !fieldLayout.includes('UI_RESPONSIVE_GRAPH_FIELDS_OWNER_VALUE_CLASSNAME') ||
    !fieldEndpoints.includes('UI_RESPONSIVE_GRAPH_FIELDS_OWNER_VALUE_CLASSNAME') ||
    !fieldSamples.includes('UI_RESPONSIVE_WIDE_PANEL_HEADER_SECONDARY_CLASSNAME') ||
    !graphFieldIcons.includes('UI_RESPONSIVE_DEFAULT_GLYPH_CLASSNAME') ||
    !graphFieldIcons.includes('graphFieldIconDefaultClassName') ||
    fieldSamples.includes('max-w-[65%]') ||
    [fieldLayout, fieldEndpoints].some(text => text.includes('w-40 truncate')) ||
    graphFieldIcons.includes('w-4 h-4') ||
    graphFieldIcons.includes('h-4 w-4') ||
    graphFieldIcons.includes('16px')
  ) {
    throw new Error('Expected Graph Fields owner-key, samples header widths, and default icon glyphs to reuse shared responsive owners')
  }
}

export const testGraphEditorToolRailResponsiveGlyphsStayShared = () => {
  const root = process.cwd()
  const graphEditorToolRailPath = path.resolve(root, 'src', 'features', 'graph-editor', 'GraphEditorToolRail.tsx')
  const responsiveElementClassesPath = path.resolve(root, 'src', 'lib', 'ui', 'responsiveElementClasses.ts')
  const responsiveCssPath = path.resolve(root, 'src', 'styles', 'responsive-toolbar.css')

  const graphEditorToolRail = readUtf8(graphEditorToolRailPath)
  const responsiveElementClasses = readUtf8(responsiveElementClassesPath)
  const responsiveCss = readUtf8(responsiveCssPath)

  if (
    !responsiveElementClasses.includes('UI_RESPONSIVE_DEFAULT_GLYPH_CLASSNAME') ||
    !responsiveCss.includes('.kg-default-glyph') ||
    !graphEditorToolRail.includes('UI_RESPONSIVE_DEFAULT_GLYPH_CLASSNAME') ||
    !graphEditorToolRail.includes('graphEditorToolRailIconClassName') ||
    !graphEditorToolRail.includes('UI_RESPONSIVE_MENU_ROW_CLASSNAME') ||
    graphEditorToolRail.includes('className="h-4 w-4"') ||
    graphEditorToolRail.includes("className='h-4 w-4'") ||
    graphEditorToolRail.includes('className="w-4 h-4"') ||
    graphEditorToolRail.includes("className='w-4 h-4'")
  ) {
    throw new Error('Expected graph-editor rail tool icons to reuse the shared responsive default glyph owner')
  }
}

export const testWorkflowManagerNonWorkflowListsReuseGraphFieldsRightPane = () => {
  const root = process.cwd()
  const storyboardWidgetGraphTabPath = path.resolve(root, 'src', 'features', 'storyboard-widget-manager', 'StoryboardWidgetGraphTab.tsx')
  const graphFieldsViewPath = path.resolve(root, 'src', 'features', 'panels', 'views', 'GraphFieldsView.tsx')
  const graphTabText = readUtf8(storyboardWidgetGraphTabPath)
  const graphFieldsText = readUtf8(graphFieldsViewPath)
  if (!graphTabText.includes('aria-label="Graph Fields and Field Settings"')) {
    throw new Error('Expected non-workflow Workflow Manager surface to include embedded Graph Fields right pane')
  }
  if (!graphTabText.includes('const GRAPH_FIELDS_SHORTCUT_LABELS = [')) {
    throw new Error('Expected non-workflow Workflow Manager to define Graph Fields shortcut labels')
  }
  if (!graphTabText.includes("'Node'") || !graphTabText.includes("'Edges'") || !graphTabText.includes("'Clusters'") || !graphTabText.includes("'Renderer'") || !graphTabText.includes("'Layer Mode'")) {
    throw new Error('Expected non-workflow shortcut list to cover Node/Edges/Clusters/Renderer/Layer Mode')
  }
  if (!graphTabText.includes('entryShortcutLabels={GRAPH_FIELDS_SHORTCUT_LABELS}')) {
    throw new Error('Expected non-workflow Workflow Manager to pass shortcut labels into GraphFieldsView')
  }
  if (!graphFieldsText.includes('aria-label="Graph Fields entry shortcuts"')) {
    throw new Error('Expected GraphFieldsView to render shortcut buttons within Graph Fields surface')
  }
  if (!graphFieldsText.includes("key={`entry-shortcut:${label}:${index}`}")) {
    throw new Error('Expected GraphFieldsView shortcut buttons to use stable per-entry keys instead of label-only keys')
  }
  if (!graphFieldsText.includes('onClick={() => onEntryShortcutClick(label)}')) {
    throw new Error('Expected GraphFieldsView shortcut clicks to route through the shared right-pane open handler')
  }
}
