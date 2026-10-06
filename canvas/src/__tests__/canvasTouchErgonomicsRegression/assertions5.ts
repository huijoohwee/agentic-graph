import { staleContentStartUtility, staleMarkdownGutterContentStartAlias, staleDataViewSmallActionSizingClass, staleDataViewSmallIconSizingClass, staleGraphDataTableHeaderHeightClass, staleGraphDataTableInputSizingClass, staleGraphDataTableBodyCellPaddingClass, staleGraphDataTableIndexWidthClass, staleGraphDataTableIndexColStyle, type SourceFixture } from './sourceFixture'

export function assertPhase5(fixture: SourceFixture) {
  const { canvasText, toolbarText, collapsibleToolbarText, detailsMenuText, explorerSearchControlText, explorerHeaderActionsText, markdownWorkspaceToolbarText, markdownWorkspaceToolbarInlineMenusText, workspaceModeSelectText, markdownWorkspaceLayoutText, markdownEditorPaneText, monacoTextEditorText, workspaceWidthDefaultsText, workspacePaneRuntimeText, graphTableToolbarText, workspaceActionsPanelText, graphTableDomTableText, graphTableKanbanViewText, graphDataTableFieldsPanelText, graphDataTableFilterPanelText, graphDataTableSortPanelText, graphDataTableGroupPanelText, graphDataTableUiPrimitivesText, graphDataTableToolbarStylesText, graphDataTableTableText, graphDataTableBodyText, graphDataTableRowsText, markdownBlockGutterText, markdownBlockquoteText, markdownCalloutText, markdownInlineMenusText, markdownInlineSelectionToolbarText, markdownSelectionToolbarText, markdownDataViewKanbanGroupText, settingsUiText, anchorOverlayText, anchoredPopoverText, overlayPlacementText, cssText, responsiveToolbarCssText, responsiveCanvasToolbarCssText, strybldrTimelineBottomPanelText, explorerPaneToggleIdx, binPaneToggleIdx, jsonPaneToggleIdx, markdownPaneToggleIdx, viewerPaneToggleIdx, htmlPaneToggleIdx, canvasPaneToggleIdx, kanbanShortcutCopyText, panelConfigText, kanbanDropPreviewText, kanbanDragHookText } = fixture
  if (
    !markdownInlineSelectionToolbarText.includes('allowOverflowVisible') ||
    !markdownInlineSelectionToolbarText.includes('uiToolbarRowScrollListClassName') ||
    !markdownInlineSelectionToolbarText.includes('uiToolbarResponsiveRowScrollClassName') ||
    !markdownInlineSelectionToolbarText.includes('uiToolbarTouchRowScrollClassName') ||
    !markdownInlineSelectionToolbarText.includes('UI_RESPONSIVE_COMPACT_GLYPH_CLASSNAME') ||
    !markdownInlineSelectionToolbarText.includes('markdownInlineSelectionToolbarIconClassName') ||
    !responsiveToolbarCssText.includes('touch-action: pan-x') || markdownInlineSelectionToolbarText.includes("touchAction: 'pan-x") ||
    markdownInlineSelectionToolbarText.includes('flex flex-wrap items-center gap-1') ||
    markdownInlineSelectionToolbarText.includes('w-3 h-3') ||
    markdownInlineSelectionToolbarText.includes('h-3 w-3')
  ) {
    throw new Error('expected Viewer inline selection toolbar menus to reuse shared list, row-scroll, touch-scroll, visible-overflow, and compact glyph mobile toolbar primitives')
  }

  if (
    !markdownInlineSelectionToolbarText.includes('MarkdownSelectionActionMenuItems') ||
    markdownInlineSelectionToolbarText.includes('>Show on Canvas<') ||
    !markdownSelectionToolbarText.includes('Link: Inline URL (default)') ||
    !markdownSelectionToolbarText.includes('Link: Horizontal Card')
  ) {
    throw new Error('expected Markdown selection actions and link display modes to have one centralized More-menu owner')
  }

  if (!settingsUiText.includes('UI_RESPONSIVE_INLINE_ELEMENT_ROW_CLASSNAME') || !settingsUiText.includes('uiToolbarRowScrollClassName')) {
    throw new Error('expected Settings previews to use responsive inline rows and shared row scrolling')
  }

  if (!markdownInlineMenusText.includes('UI_RESPONSIVE_MARKDOWN_INLINE_MENU_LIST_CLASSNAME') || markdownInlineMenusText.includes('max-h-24')) {
    throw new Error('expected Markdown inline suggestion menus to use the shared responsive menu-list owner')
  }

  if (!responsiveToolbarCssText.includes('.App-toolbar--touch-row-scroll') || !responsiveToolbarCssText.includes('width: calc(100vw - var(--kg-safe-left) - var(--kg-safe-right) - 1rem)') || responsiveToolbarCssText.includes('.App-toolbar--touch-wrap') || toolbarText.includes("width: 'calc(100vw - var(--kg-safe-left) - var(--kg-safe-right) - 1rem)'")) {
    throw new Error('expected toolbar mobile row-scroll behavior to stay centralized in shared CSS without stale wrap classes')
  }

  if (!responsiveToolbarCssText.includes('scroll-snap-type: x proximity') || !responsiveToolbarCssText.includes('scroll-snap-align: center')) {
    throw new Error('expected mobile canvas toolbar row scrolling to keep stable snap affordances')
  }

  if (!collapsibleToolbarText.includes('kg-collapsible-toolbar-overflow')) {
    throw new Error('expected collapsed workspace toolbar menus to reuse the shared viewport-clamped overflow shell')
  }

  if (!collapsibleToolbarText.includes('forceExpanded') || !markdownWorkspaceToolbarText.includes('forceExpanded={isTouchToolbarViewport}')) {
    throw new Error('expected Editor Workspace mobile controls to stay as a scrollable dock instead of collapsing behind overflow')
  }

  if (
    !markdownWorkspaceToolbarInlineMenusText.includes('UI_RESPONSIVE_MARKDOWN_TOOLBAR_HIGHLIGHT_BADGE_CLASSNAME') ||
    !markdownWorkspaceToolbarInlineMenusText.includes('UI_RESPONSIVE_DEFAULT_GLYPH_CLASSNAME') ||
    !markdownWorkspaceToolbarInlineMenusText.includes('markdownWorkspaceToolbarGlyphClassName') ||
    !markdownWorkspaceToolbarText.includes('UI_RESPONSIVE_DEFAULT_GLYPH_CLASSNAME') ||
    !markdownWorkspaceToolbarText.includes('MARKDOWN_WORKSPACE_TOOLBAR_GLYPH_CLASSNAME') ||
    [markdownWorkspaceToolbarInlineMenusText, markdownWorkspaceToolbarText].some(text =>
      text.includes('className="w-4 h-4"') ||
      text.includes("className='w-4 h-4'") ||
      text.includes('className="h-4 w-4"') ||
      text.includes("className='h-4 w-4'")
    ) ||
    markdownWorkspaceToolbarInlineMenusText.includes('min-w-[1rem]')
  ) {
    throw new Error('expected Markdown workspace toolbar action glyphs and highlight badges to use shared responsive owners')
  }

  if (!markdownWorkspaceToolbarText.includes('kg-markdown-workspace-toolbar-row') || !responsiveToolbarCssText.includes('position: sticky') || !responsiveToolbarCssText.includes('var(--kg-mobile-bottom-dock-clearance')) {
    throw new Error('expected Editor Workspace mobile toolbar to use a thumb-reachable sticky bottom row above the shared mobile dock without theme changes')
  }

  if (!responsiveToolbarCssText.includes('.kg-markdown-workspace-toolbar-row') || !responsiveToolbarCssText.includes('background: var(--kg-panel-bg)') || !responsiveToolbarCssText.includes('border-top: 1px solid var(--kg-border)')) {
    throw new Error('expected Editor Workspace mobile toolbar dock to reuse existing panel theme tokens instead of overlaying editor content')
  }

  if (!canvasText.includes('UI_RESPONSIVE_CANVAS_WORKSPACE_TOOLBAR_DOCK_CLASSNAME')) {
    throw new Error('expected editor-mode canvas toolbar to use a dedicated responsive dock class')
  }

  if (
    !cssText.includes('--kg-canvas-viewport-edge-gap: 0.5rem') ||
    !responsiveCanvasToolbarCssText.includes('var(--kg-safe-top) + var(--kg-canvas-viewport-edge-gap)') ||
    !responsiveCanvasToolbarCssText.includes('var(--kg-safe-bottom) + var(--kg-canvas-viewport-edge-gap)') || !responsiveCanvasToolbarCssText.includes('.kg-canvas-bottom-panel') ||
    !responsiveCanvasToolbarCssText.includes('72rem') ||
    !strybldrTimelineBottomPanelText.includes('UI_RESPONSIVE_CANVAS_BOTTOM_PANEL_CLASSNAME') || strybldrTimelineBottomPanelText.includes("bottom: 'calc(var(--kg-safe-bottom)") || strybldrTimelineBottomPanelText.includes("width: 'min(calc(100% - 1.5rem")
  ) {
    throw new Error('expected Canvas Toolbar and Timeline bottom panel viewport-edge spacing plus wide timeline panel sizing to share the same CSS token')
  }

  if (
    !cssText.includes('--kg-toolbar-compact-surface-height') ||
    !cssText.includes('--toolbar-padding: var(--kg-toolbar-compact-padding)') ||
    !strybldrTimelineBottomPanelText.includes("height: 'var(--kg-toolbar-compact-surface-height)'") ||
    strybldrTimelineBottomPanelText.includes('min-h-[36px]')
  ) {
    throw new Error('expected minimized Timeline bottom panel height to reuse existing compact Toolbar sizing tokens')
  }

  if (!responsiveToolbarCssText.includes('.kg-markdown-workspace-shell')) {
    throw new Error('expected Editor Workspace to use a shared mobile stacking rule')
  }

  if (!responsiveToolbarCssText.includes('.kg-markdown-workspace-editor-panes') || !responsiveToolbarCssText.includes('.kg-monaco-textarea-fallback')) {
    throw new Error('expected Editor Workspace edit panes and textarea fallback to have shared mobile editability bounds')
  }

  if (
    !workspaceModeSelectText.includes('UI_RESPONSIVE_WORKSPACE_MODE_TAB_CLASSNAME') ||
    workspaceModeSelectText.includes('h-7 max-w-[12rem]') ||
    workspaceModeSelectText.includes('max-w-[12rem]')
  ) {
    throw new Error('expected WorkspaceModeSelect tabs to use the shared responsive mode-tab owner instead of local fixed height/width clamps')
  }

  if (!markdownWorkspaceLayoutText.includes('kg-markdown-workspace-editor-panes') || !markdownWorkspaceLayoutText.includes('kg-markdown-workspace-pane-divider')) {
    throw new Error('expected Editor Workspace panes and dividers to use responsive owner classes')
  }

  if (!markdownEditorPaneText.includes('kg-markdown-editor-pane') || !markdownEditorPaneText.includes('kg-monaco-textarea-fallback')) {
    throw new Error('expected Markdown editor pane to expose responsive Monaco and textarea classes')
  }

  if (!monacoTextEditorText.includes('kg-monaco-editor-root')) {
    throw new Error('expected Monaco editor root to expose a responsive editability class')
  }

  if (!canvasText.includes('WORKSPACE_EDITOR_CANVAS_GUTTER_CSS') || canvasText.includes('calc(100% - 3rem)')) {
    throw new Error('expected Canvas overlay bounds to reuse the shared workspace gutter token instead of a local mobile width literal')
  }

  if (!workspacePaneRuntimeText.includes('WORKSPACE_EDITOR_CANVAS_GUTTER_PX') || workspacePaneRuntimeText.includes('WORKSPACE_PREVIEW_RIGHT_GUTTER_PX')) {
    throw new Error('expected workspace pane runtime resizing bounds to reuse the shared canvas gutter token')
  }

  if (!workspaceWidthDefaultsText.includes('MIN_WORKSPACE_CANVAS_VISIBLE_STRIP_COMPACT_RATIO') || !workspaceWidthDefaultsText.includes('return args.maxPx')) {
    throw new Error('expected compact workspace width defaults to prefer editable mobile pane width from the shared owner')
  }

  if (
    !workspaceWidthDefaultsText.includes('WORKSPACE_EDITOR_PANE_DEFAULT_VIEWPORT_RATIO = 0.5') ||
    workspaceWidthDefaultsText.includes('1 - (WORKSPACE_EDITOR_CANVAS_DEFAULT_SPLIT.canvasPercent / 100)')
  ) {
    throw new Error('expected desktop workspace editor pane default initialization to use a neutral 50% viewport ratio')
  }

  if (!responsiveToolbarCssText.includes('flex-direction: column')) {
    throw new Error('expected Editor Workspace mobile layout to stack Explorer above editor content')
  }

  if (!responsiveToolbarCssText.includes('.kg-markdown-workspace-explorer')) {
    throw new Error('expected Markdown Explorer mobile sizing to stay centralized in shared CSS')
  }

  if (!responsiveToolbarCssText.includes('.kg-markdown-workspace-explorer-resize') || responsiveToolbarCssText.includes('.kg-markdown-workspace-explorer-resize {\n      display: none;')) {
    throw new Error('expected Explorer/editor divider to remain visible when Editor Workspace stacks on narrow viewports')
  }

  if (
    !responsiveToolbarCssText.includes('box-shadow: inset 1px 0 0 var(--kg-divider)') ||
    !responsiveToolbarCssText.includes('inline-size: 100% !important') ||
    !responsiveToolbarCssText.includes('block-size: 1px !important') ||
    !responsiveToolbarCssText.includes('cursor: row-resize !important') ||
    !responsiveToolbarCssText.includes('background-image: none !important') ||
    !responsiveToolbarCssText.includes('box-shadow: none;')
  ) {
    throw new Error('expected Explorer/editor divider to stay visible on desktop and reset to a horizontal separator on stacked mobile')
  }

  if (!responsiveToolbarCssText.includes('.MainPanelContainer')) {
    throw new Error('expected main panel mobile viewport bounds to stay centralized in shared CSS')
  }

  if (!responsiveToolbarCssText.includes('.kg-collapsible-toolbar-overflow')) {
    throw new Error('expected collapsed toolbar overflow bounds to stay centralized in shared CSS')
  }

  if (!responsiveToolbarCssText.includes('.kg-collapsible-toolbar-overflow-items .kg-row-scroll') || !responsiveToolbarCssText.includes('min-inline-size: 0')) {
    throw new Error('expected collapsed toolbar same-row scroll containers to stay bounded by the shared overflow shell')
  }

  if (!responsiveCanvasToolbarCssText.includes('.kg-workspace-overlay-canvas-toolbar')) {
    throw new Error('expected editor-mode canvas toolbar mobile dock to stay centralized in shared CSS')
  }

  if (!responsiveCanvasToolbarCssText.includes('.kg-canvas-toolbar-dock')) {
    throw new Error('expected primary canvas toolbar to share the mobile thumb-reachable dock owner')
  }

  if (!detailsMenuText.includes('clampOverlayTopLeftFullyInViewport') || !detailsMenuText.includes('viewportHeight')) {
    throw new Error('expected shared details menus to clamp portal placement against full viewport bounds')
  }

  if (!anchorOverlayText.includes('useBodyPortalRoot(open, { createBeforeOpen: true })') || !anchorOverlayText.includes('resolveOverlayVerticalTop')) {
    throw new Error('expected shared dropdown overlays to render from the first open and use viewport-aware vertical placement')
  }

  if (!anchorOverlayText.includes('allowOverflowVisible') || !anchorOverlayText.includes("overflow: allowOverflowVisible ? 'visible' : undefined")) {
    throw new Error('expected shared AnchorOverlay to support visible-overflow menus when floating selection toolbars expand outside the root panel')
  }

  if (!anchorOverlayText.includes('kg-anchor-overlay') || !detailsMenuText.includes('kg-details-menu-portal') || !responsiveToolbarCssText.includes('.kg-anchor-overlay')) {
    throw new Error('expected shared overlay portals to expose mobile viewport-owned classes')
  }

  if (!anchoredPopoverText.includes('clampOverlayTopLeftFullyInViewport') || anchoredPopoverText.includes("translateX('-100%')") || anchoredPopoverText.includes("translateX(-100%)")) {
    throw new Error('expected anchored popovers to clamp inside the viewport without transform fallback placement')
  }

  if (!anchoredPopoverText.includes('kg-anchored-popover') || !responsiveToolbarCssText.includes('.kg-anchored-popover')) {
    throw new Error('expected anchored popovers to reuse shared mobile overlay sizing')
  }

  if (!detailsMenuText.includes('resolveOverlayVerticalTop') || !detailsMenuText.includes('readOverlayElementSize')) {
    throw new Error('expected shared point-expand menus to reuse measured viewport-aware overlay placement')
  }

  if (!overlayPlacementText.includes('spaceBelow') || !overlayPlacementText.includes('spaceAbove') || !overlayPlacementText.includes('scrollHeight')) {
    throw new Error('expected overlay placement helper to measure real menu height and flip away from clipped viewport edges')
  }

  if (detailsMenuText.includes('maxHeight') || detailsMenuText.includes('overscrollBehavior') || detailsMenuText.includes('WebkitOverflowScrolling') || anchorOverlayText.includes("maxWidth: 'calc(100vw") || anchorOverlayText.includes("maxHeight: 'var(--kg-overlay-max-height") || anchorOverlayText.includes('WebkitOverflowScrolling')) {
    throw new Error('expected shared overlay menus to leave viewport max sizing and scroll policy in shared CSS')
  }

  if (anchorOverlayText.includes('var(--kg-overlay-max-height') || detailsMenuText.includes('var(--kg-overlay-max-height') || !responsiveToolbarCssText.includes('max-height: var(--kg-overlay-max-height)')) {
    throw new Error('expected shared overlay portals to reuse the mobile bottom-dock-aware max-height token')
  }

  if (!responsiveToolbarCssText.includes('--kg-mobile-bottom-dock-clearance') || !responsiveToolbarCssText.includes('--kg-overlay-max-height')) {
    throw new Error('expected mobile overlay sizing to reserve shared bottom dock clearance without local menu patches')
  }

  if (!responsiveToolbarCssText.includes('max-height: var(--kg-overlay-max-height)') || !responsiveToolbarCssText.includes('max-block-size: var(--kg-overlay-max-height)')) {
    throw new Error('expected shared mobile menus to cap secondary panels with the overlay max-height token')
  }

  if (!responsiveToolbarCssText.includes('.kg-data-view-floating-menu,') || !responsiveToolbarCssText.includes('-webkit-overflow-scrolling: touch;')) {
    throw new Error('expected shared data-view floating menus to use mobile viewport scrolling policy')
  }

  if (detailsMenuText.includes("translateX('-100%')") || detailsMenuText.includes("translateX(-100%)")) {
    throw new Error('expected shared details menus to avoid transform fallback placement that can escape mobile bounds')
  }

  if (
    !responsiveToolbarCssText.includes('.kg-explorer-search-input') ||
    !explorerSearchControlText.includes('kg-explorer-search-input') ||
    !explorerSearchControlText.includes('UI_RESPONSIVE_TOOLBAR_FIELD_CLASSNAME') ||
    !explorerSearchControlText.includes('UI_RESPONSIVE_DEFAULT_GLYPH_CLASSNAME') ||
    !explorerSearchControlText.includes('explorerSearchIconClassName') ||
    explorerSearchControlText.includes('min-w-0 h-[var(--kg-control-height,28px)] rounded border')
  ) {
    throw new Error('expected Explorer search width and icon sizing to stay owned by shared responsive CSS')
  }

  if (explorerHeaderActionsText.includes('SelectionActionsMenu') || explorerHeaderActionsText.includes('MoreHorizontal') || explorerHeaderActionsText.includes('CollapsibleToolbar')) {
    throw new Error('expected Explorer header actions to avoid a three-dot overflow split')
  }

  if (
    !explorerHeaderActionsText.includes('uiToolbarRowScrollListClassName') ||
    !explorerHeaderActionsText.includes('ariaLabel="Refresh"') ||
    !explorerHeaderActionsText.includes('UI_RESPONSIVE_DEFAULT_GLYPH_CLASSNAME') ||
    !explorerHeaderActionsText.includes('explorerHeaderActionIconClassName')
  ) {
    throw new Error('expected Explorer header actions to keep Refresh and Search in the same scrollable action row')
  }

  if (
    [explorerSearchControlText, explorerHeaderActionsText].some(text =>
      text.includes('className="w-4 h-4"') ||
      text.includes("className='w-4 h-4'") ||
      text.includes('className="h-4 w-4"') ||
      text.includes("className='h-4 w-4'") ||
      text.includes('className="w-4 h-4 shrink-0"') ||
      text.includes("className='w-4 h-4 shrink-0'")
    )
  ) {
    throw new Error('expected Explorer header/search action glyphs to reuse the shared responsive default glyph owner')
  }

  if (
    explorerHeaderActionsText.includes('ariaLabel="New file"') ||
    explorerHeaderActionsText.includes('ariaLabel="Clear"') ||
    explorerHeaderActionsText.includes('ariaLabel="Delete') ||
    explorerHeaderActionsText.includes('Refresh from URL')
  ) {
    throw new Error('expected Explorer header to keep file mutations in the file context menu and consolidate URL refresh into Refresh')
  }

  if (!responsiveToolbarCssText.includes('.kg-workspace-pane-toggles') || !markdownWorkspaceToolbarText.includes('kg-workspace-pane-toggles') || !markdownWorkspaceToolbarText.includes('uiToolbarRowScrollInlineClassName')) {
    throw new Error('expected workspace pane toggles to keep a shared mobile row-scroll owner')
  }

  if (!responsiveToolbarCssText.includes('.kg-workspace-pane-toggles') || !responsiveToolbarCssText.includes('border: 0;') || !responsiveToolbarCssText.includes('background: transparent;') || !responsiveToolbarCssText.includes('padding: 0;')) {
    throw new Error('expected workspace pane toggles to stay unframed inside the shared toolbar panel')
  }

  if (markdownWorkspaceToolbarText.includes('kg-workspace-pane-toggles ${uiToolbarRowScrollInlineClassName} gap-2 rounded border')) {
    throw new Error('expected workspace pane toggles to avoid a nested bordered toolbar panel')
  }

  if (!responsiveToolbarCssText.includes('.kg-workspace-pane-toggle') || !responsiveToolbarCssText.includes('.kg-workspace-pane-toggle-input') || !responsiveToolbarCssText.includes('.kg-workspace-pane-toggle-label')) {
    throw new Error('expected workspace pane toggles to expose shared touch-sized label/input/text classes')
  }

  if (!responsiveToolbarCssText.includes('.kg-workspace-pane-toggle--viewer') || !markdownWorkspaceToolbarText.includes('kg-workspace-pane-toggle--viewer')) {
    throw new Error('expected Viewer pane toggle to expose a dedicated bounded mobile touch target class')
  }

  if (!responsiveToolbarCssText.includes('.kg-workspace-pane-toggles-item') || !markdownWorkspaceToolbarText.includes('kg-workspace-pane-toggles-item')) {
    throw new Error('expected workspace pane toggle row wrapper to stay bounded in collapsed toolbar overflow')
  }

  if (!markdownWorkspaceToolbarText.includes('Show Markdown editor pane') || !markdownWorkspaceToolbarText.includes('Show Viewer preview pane')) {
    throw new Error('expected Markdown and Viewer pane toggles to keep explicit edit/view accessibility labels')
  }

  if (!markdownWorkspaceToolbarText.includes('resolveViewerEditPaneVisibility')) {
    throw new Error('expected Viewer pane toggle to preserve an editable source pane when enabling preview')
  }

  if (markdownWorkspaceToolbarText.includes('Show Multi-dimensional Table')) {
    throw new Error('expected legacy Multi-dimensional Table pane toggle to be removed from the Editor Workspace toolbar')
  }

  if (!(
    explorerPaneToggleIdx >= 0 &&
    explorerPaneToggleIdx < binPaneToggleIdx &&
    binPaneToggleIdx < jsonPaneToggleIdx &&
    jsonPaneToggleIdx < markdownPaneToggleIdx &&
    markdownPaneToggleIdx < viewerPaneToggleIdx &&
    viewerPaneToggleIdx < htmlPaneToggleIdx &&
    htmlPaneToggleIdx < canvasPaneToggleIdx
  )) {
    throw new Error('expected pane toggles to keep Explorer, bin, JSON, Markdown, Viewer, HTML, Canvas order')
  }

  if (
    !responsiveToolbarCssText.includes('.kg-graph-data-table-menu-row') ||
    !graphTableToolbarText.includes('kg-graph-data-table-menu-field') ||
    !graphTableToolbarText.includes('UI_RESPONSIVE_TOOLBAR_FIELD_CLASSNAME') ||
    graphTableToolbarText.includes("const inputHeightClass = 'h-[var(--kg-control-height,28px)]'")
  ) {
    throw new Error('expected graph-table menu form rows to use shared mobile field constraints')
  }

  if (
    !workspaceActionsPanelText.includes('UI_RESPONSIVE_TOOLBAR_FIELD_CLASSNAME') ||
    workspaceActionsPanelText.includes('w-full min-w-0 h-[var(--kg-control-height,28px)] px-2 rounded border box-border')
  ) {
    throw new Error('expected Workspace Actions sample dataset select to use the shared responsive toolbar field owner')
  }

  if (
    ![graphDataTableFieldsPanelText, graphDataTableFilterPanelText, graphDataTableSortPanelText].every(text => text.includes('UI_RESPONSIVE_GRAPH_DATA_TABLE_WIDE_FLOATING_PANEL_CLASSNAME')) ||
    !graphDataTableGroupPanelText.includes('UI_RESPONSIVE_GRAPH_DATA_TABLE_NARROW_FLOATING_PANEL_CLASSNAME') ||
    [graphDataTableFieldsPanelText, graphDataTableFilterPanelText, graphDataTableSortPanelText, graphDataTableGroupPanelText].some(text =>
      text.includes('max-h-96') ||
      text.includes('max-h-80') ||
      text.includes('w-80') ||
      text.includes('sm:w-96') ||
      text.includes('md:w-[544px]') ||
      text.includes('md:w-[384px]')
    )
  ) {
    throw new Error('expected graph-data-table floating panels to share responsive width and height owners instead of local fixed panel sizing')
  }

  if (
    !graphTableDomTableText.includes('UI_RESPONSIVE_CONTENT_START_OFFSET_CLASSNAME') ||
    !markdownBlockGutterText.includes('UI_RESPONSIVE_CONTENT_START_PADDING_CLASSNAME') ||
    !markdownBlockquoteText.includes('UI_RESPONSIVE_CONTENT_START_OFFSET_BEFORE_CLASSNAME') ||
    !markdownCalloutText.includes('UI_RESPONSIVE_CONTENT_START_OFFSET_CLASSNAME') ||
    [graphTableDomTableText, markdownBlockGutterText, markdownBlockquoteText, markdownCalloutText].some(text =>
      text.includes(staleContentStartUtility('left')) ||
      text.includes(staleContentStartUtility('pl')) ||
      text.includes(staleMarkdownGutterContentStartAlias())
    )
  ) {
    throw new Error('expected Markdown gutter and graph-table content-start offsets to live in shared responsive content-start owners')
  }

  if (
    !responsiveToolbarCssText.includes('.kg-graph-data-table-kanban-lane') ||
    !graphTableKanbanViewText.includes('kg-graph-data-table-kanban-lane') ||
    !graphTableKanbanViewText.includes('UI_RESPONSIVE_DATA_VIEW_KANBAN_CARD_LIST_CLASSNAME') ||
    !markdownDataViewKanbanGroupText.includes('UI_RESPONSIVE_DATA_VIEW_KANBAN_CARD_LIST_CLASSNAME') ||
    graphTableKanbanViewText.includes('max-h-[min(65vh,720px)]') ||
    markdownDataViewKanbanGroupText.includes('max-h-[min(65vh,720px)]')
  ) {
    throw new Error('expected graph-table and markdown kanban lanes to use valid shared viewport sizing')
  }

  if (
    !graphDataTableTableText.includes('UI_RESPONSIVE_GRAPH_DATA_TABLE_HEADER_CELL_CLASSNAME') ||
    !graphDataTableTableText.includes('UI_RESPONSIVE_GRAPH_DATA_TABLE_HEADER_CONTENT_CLASSNAME') ||
    !graphDataTableTableText.includes('UI_RESPONSIVE_GRAPH_DATA_TABLE_BODY_CELL_CLASSNAME') ||
    !graphDataTableTableText.includes('UI_RESPONSIVE_GRAPH_DATA_TABLE_TEXT_INPUT_CLASSNAME') ||
    !graphDataTableFieldsPanelText.includes('UI_RESPONSIVE_GRAPH_DATA_TABLE_PANEL_SEARCH_INPUT_CLASSNAME') ||
    !graphDataTableFilterPanelText.includes('UI_RESPONSIVE_GRAPH_DATA_TABLE_PANEL_VALUE_INPUT_CLASSNAME') ||
    !graphDataTableUiPrimitivesText.includes('UI_RESPONSIVE_GRAPH_DATA_TABLE_PANEL_CHOICE_CLASSNAME') ||
    !graphDataTableUiPrimitivesText.includes('UI_RESPONSIVE_GRAPH_DATA_TABLE_PANEL_SPLIT_ROW_CLASSNAME') ||
    !graphDataTableGroupPanelText.includes('UI_RESPONSIVE_GRAPH_DATA_TABLE_PANEL_CHOICE_CLASSNAME') ||
    !graphDataTableFilterPanelText.includes('UI_RESPONSIVE_GRAPH_DATA_TABLE_PANEL_CHOICE_CLASSNAME') ||
    !graphDataTableSortPanelText.includes('UI_RESPONSIVE_GRAPH_DATA_TABLE_PANEL_CHOICE_CLASSNAME') ||
    !graphDataTableFieldsPanelText.includes('UI_RESPONSIVE_GRAPH_DATA_TABLE_PANEL_HEADER_ROW_CLASSNAME') ||
    !graphDataTableFieldsPanelText.includes('UI_RESPONSIVE_GRAPH_DATA_TABLE_PANEL_SEARCH_ROW_CLASSNAME') ||
    !graphDataTableFieldsPanelText.includes('UI_RESPONSIVE_GRAPH_DATA_TABLE_PANEL_FIELD_ROW_CLASSNAME') ||
    !graphDataTableFieldsPanelText.includes('UI_RESPONSIVE_GRAPH_DATA_TABLE_PANEL_INLINE_ROW_CLASSNAME') ||
    !graphDataTableSortPanelText.includes('UI_RESPONSIVE_GRAPH_DATA_TABLE_PANEL_HEADER_ROW_CLASSNAME') ||
    !graphDataTableSortPanelText.includes('UI_RESPONSIVE_GRAPH_DATA_TABLE_PANEL_SPLIT_ROW_CLASSNAME') ||
    !graphDataTableSortPanelText.includes('UI_RESPONSIVE_GRAPH_DATA_TABLE_PANEL_SCROLL_STACK_CLASSNAME') ||
    !graphDataTableSortPanelText.includes('UI_RESPONSIVE_GRAPH_DATA_TABLE_PANEL_FOOTER_ROW_CLASSNAME') ||
    !graphDataTableGroupPanelText.includes('UI_RESPONSIVE_GRAPH_DATA_TABLE_PANEL_HEADER_ROW_CLASSNAME') ||
    !graphDataTableGroupPanelText.includes('UI_RESPONSIVE_GRAPH_DATA_TABLE_PANEL_SPACIOUS_SCROLL_STACK_CLASSNAME') ||
    !graphDataTableGroupPanelText.includes('UI_RESPONSIVE_GRAPH_DATA_TABLE_PANEL_DIVIDER_STACK_CLASSNAME') ||
    !graphDataTableGroupPanelText.includes('UI_RESPONSIVE_GRAPH_DATA_TABLE_PANEL_INLINE_CONTROL_CLASSNAME') ||
    !graphDataTableGroupPanelText.includes('UI_RESPONSIVE_GRAPH_DATA_TABLE_PANEL_WRAP_ROW_CLASSNAME') ||
    !graphDataTableFilterPanelText.includes('UI_RESPONSIVE_GRAPH_DATA_TABLE_PANEL_GROUP_FRAME_CLASSNAME') ||
    !graphDataTableFilterPanelText.includes('UI_RESPONSIVE_GRAPH_DATA_TABLE_PANEL_SCROLL_STACK_CLASSNAME') ||
    !graphDataTableFilterPanelText.includes('UI_RESPONSIVE_GRAPH_DATA_TABLE_PANEL_STACK_CLASSNAME') ||
    !graphDataTableFilterPanelText.includes('UI_RESPONSIVE_GRAPH_DATA_TABLE_PANEL_FOOTER_ROW_CLASSNAME') ||
    !responsiveToolbarCssText.includes('.kg-graph-data-table-panel-search-input') ||
    !responsiveToolbarCssText.includes('--kg-graph-data-table-panel-search-input-padding-start') ||
    !responsiveToolbarCssText.includes('.kg-graph-data-table-panel-value-input') ||
    !responsiveToolbarCssText.includes('--kg-graph-data-table-panel-value-input-width') ||
    !responsiveToolbarCssText.includes('.kg-graph-data-table-panel-choice') ||
    !responsiveToolbarCssText.includes('--kg-graph-data-table-panel-choice-height') ||
    !responsiveToolbarCssText.includes('--kg-graph-data-table-panel-choice-height: var(--kg-touch-target, 44px)') ||
    !graphDataTableTableText.includes('UI_RESPONSIVE_GRAPH_DATA_TABLE_INDEX_COLUMN_CLASSNAME') ||
    !graphDataTableBodyText.includes('UI_RESPONSIVE_GRAPH_DATA_TABLE_KIND_CELL_TEXT_CLASSNAME') ||
    !graphDataTableBodyText.includes('UI_RESPONSIVE_GRAPH_DATA_TABLE_ID_CELL_TEXT_CLASSNAME') ||
    !graphDataTableBodyText.includes('UI_RESPONSIVE_GRAPH_DATA_TABLE_COMPACT_CELL_TEXT_CLASSNAME') ||
    !graphDataTableRowsText.includes('UI_RESPONSIVE_GRAPH_DATA_TABLE_SCOPE_INDICATOR_CLASSNAME') ||
    !graphDataTableUiPrimitivesText.includes('UI_RESPONSIVE_GRAPH_DATA_TABLE_ICON_BUTTON_CLASSNAME') ||
    !graphDataTableUiPrimitivesText.includes('UI_RESPONSIVE_GRAPH_DATA_TABLE_SECONDARY_BUTTON_CLASSNAME') ||
    !graphDataTableToolbarStylesText.includes('UI_RESPONSIVE_GRAPH_DATA_TABLE_TOOLBAR_BUTTON_CLASSNAME') ||
    graphDataTableTableText.includes(staleGraphDataTableHeaderHeightClass()) ||
    graphDataTableTableText.includes(staleGraphDataTableInputSizingClass()) ||
    graphDataTableFieldsPanelText.includes('h-7 w-full rounded-md border') ||
    graphDataTableFieldsPanelText.includes('pl-7 pr-2') ||
    graphDataTableFilterPanelText.includes('h-8 w-40 rounded-md border') ||
    [graphDataTableUiPrimitivesText, graphDataTableGroupPanelText, graphDataTableFilterPanelText, graphDataTableSortPanelText].some(text =>
      text.includes('px-2 py-1')
    ) ||
    [graphDataTableUiPrimitivesText, graphDataTableFieldsPanelText, graphDataTableSortPanelText, graphDataTableGroupPanelText, graphDataTableFilterPanelText].some(text =>
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
        'rounded-md border ${UI_THEME_TOKENS.panel.border} ${UI_THEME_TOKENS.panel.headerBg} p-2',
      ].some(snippet => text.includes(snippet))
    ) ||
    graphDataTableTableText.includes(staleGraphDataTableBodyCellPaddingClass()) ||
    graphDataTableTableText.includes(staleGraphDataTableIndexWidthClass()) ||
    graphDataTableTableText.includes(staleGraphDataTableIndexColStyle()) ||
    [graphDataTableUiPrimitivesText, graphDataTableToolbarStylesText].some(text =>
      text.includes(staleDataViewSmallIconSizingClass()) ||
      text.includes(staleDataViewSmallActionSizingClass())
    ) ||
    graphDataTableRowsText.includes('w-[3px]') ||
    ['max-w-16', 'max-w-40', 'max-w-52'].some(snippet => graphDataTableBodyText.includes(snippet))
  ) {
    throw new Error('expected graph-data-table sizing, panel choices, buttons, cell text clamps, and row scope indicator width to live in shared responsive owners')
  }

  if (!graphTableKanbanViewText.includes('useKanbanDragAndDrop') || !graphTableKanbanViewText.includes('reorderKanbanRowIds') || !graphTableKanbanViewText.includes('orderedRowIds: nextOrderedRowIds') || !graphTableKanbanViewText.includes('handleKeyboardMove')) {
    throw new Error('expected graph-table kanban view to reuse the shared drag-and-drop contract and keyboard reorder lane order ids')
  }

  if (!kanbanShortcutCopyText.includes('KANBAN_SHORTCUT_HELP_LINES') || !panelConfigText.includes('...KANBAN_SHORTCUT_HELP_LINES') || graphTableKanbanViewText.includes('KanbanShortcutLegend') || graphTableKanbanViewText.includes('KanbanShortcutDetails')) {
    throw new Error('expected kanban shortcut guidance to live in shared Help shortcut copy instead of graph-table local hint surfaces')
  }

  if (
    !kanbanDropPreviewText.includes('export function KanbanDropIndicator') ||
    !kanbanDropPreviewText.includes('export function KanbanLaneDragOverIndicator') ||
    !kanbanDropPreviewText.includes('export function KanbanCardDropPreview') ||
    !kanbanDropPreviewText.includes('UI_RESPONSIVE_KANBAN_DROP_INDICATOR_CLASSNAME') ||
    !graphTableKanbanViewText.includes('KanbanCardDropPreview') ||
    !graphTableKanbanViewText.includes('KanbanLaneDragOverIndicator') ||
    !graphTableKanbanViewText.includes('KanbanLaneDropPreview') ||
    !markdownDataViewKanbanGroupText.includes('KanbanLaneDragOverIndicator') ||
    kanbanDropPreviewText.includes('h-[2px]') ||
    graphTableKanbanViewText.includes('h-[2px]') ||
    markdownDataViewKanbanGroupText.includes('h-[2px]')
  ) {
    throw new Error('expected graph-table kanban view to reuse the shared pointer drop preview helper for cards and lane-end affordances')
  }

  if (!kanbanDragHookText.includes('KANBAN_EDGE_SCROLL_THRESHOLD_PX') || !kanbanDragHookText.includes('window.requestAnimationFrame(tick)') || !graphTableKanbanViewText.includes('getBoardScrollElement: () => boardScrollRef.current')) {
    throw new Error('expected graph-table kanban drag assistance to reuse the shared edge-aware auto-scroll owner instead of local scroll patches')
  }

  if (!kanbanDragHookText.includes('KANBAN_LANE_HOVER_DWELL_MS') || !kanbanDragHookText.includes('window.setTimeout(() =>') || !kanbanDragHookText.includes('resolveDropTarget')) {
    throw new Error('expected graph-table kanban lane target switching to reuse the shared hover dwell stabilization contract')
  }

  if (!kanbanDragHookText.includes('KANBAN_DIRECTIONAL_LANE_ENTRY_BIAS_PX') || !kanbanDragHookText.includes('KANBAN_CARD_TARGET_HYSTERESIS_PX') || !kanbanDragHookText.includes('lastAppliedTargetPointerRef')) {
    throw new Error('expected graph-table kanban lane entry and card target stickiness to reuse the shared bias and hysteresis contract')
  }
}
