import { fs, path, readUtf8 } from './sourceFixture'

export const testPanelHeaderUsesAriaTablist = () => {
  const root = process.cwd()
  const tabHeaderPath = path.resolve(root, 'src', 'features', 'panels', 'ui', 'TabHeader.tsx')
  const text = readUtf8(tabHeaderPath) + readUtf8(path.resolve(root, 'src/features/panels/ui/PanelViewTabs.tsx'))
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

  const tabHeader = readUtf8(tabHeaderPath) + readUtf8(path.resolve(root, 'src/features/panels/ui/PanelViewTabs.tsx'))
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

  const floatingPanelController = readUtf8(floatingPanelPath)
  if (!floatingPanelController.includes('<FloatingPanelShell') || !floatingPanelController.includes("from '@/components/ui/FloatingPanel'")) throw new Error('Expected native floating panel to delegate to the shared shell')
  const floatingPanel = floatingPanelController + readUtf8(path.resolve(root, 'src/components/ui/FloatingPanel.tsx'))
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
    !graphTableInspector.includes('<CanvasEditableKeyTypeValueRow') || graphTableInspector.includes('grid-cols-[minmax(0,120px)_minmax(0,1fr)]') ||
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
    !sharedKtvRow.includes('KTV_FIELD_GRID_CLASS_NAME')
    || !sharedKtvRows.includes('grid-cols-[minmax(0,0.95fr)_minmax(2.75rem,0.42fr)_minmax(0,1.2fr)]')
    || !sharedKtvRows.includes('sm:grid-cols-[minmax(0,1fr)_minmax(3rem,4.75rem)_minmax(0,1.45fr)]')
  ) {
    throw new Error('Expected the upstream shared KTV row runtime to keep the shared default Key/Type/Value grid with a wider bounded Value column')
  }
  if (
    sharedKtvRow.includes('KTV_KEY_VALUE_GRID_CLASS_NAME')
    || sharedKtvRows.includes('grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]')
  ) {
    throw new Error('Expected the upstream shared KTV row runtime to retire the separate two-column grid')
  }
  if (!sharedKtvRow.includes("layout === 'keyIconSliderInput' ? null : typeNode")) {
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
