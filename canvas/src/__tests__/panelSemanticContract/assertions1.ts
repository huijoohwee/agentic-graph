import { type SourceFixture } from './sourceFixture'

export function assertPhase1(fixture: SourceFixture) {
  const { responsiveCss, responsiveElementClasses, overlay, toolbarDropdown, editorWorkspaceSelect, interactionModeSelect, canvas2dRendererSelect, compactToolbarDropdowns, narrowToolbarDropdowns, slimToolbarDropdowns, tinyToolbarDropdown, storyboardWidgetInspectorTabs, collaborationView, floatingPanelChatSections, chatModelCredentialControls, grabMapsDiscoveryWidgetSection, grabMapsDiscoverySettingsGrid, widgetEditorSchemaTable, floatingSubpanels, designDomTreePanel, designLayersPanel, designPanelTexts, searchPanel, launchDropdown, launchDropdownExport, launchDropdownImportUrlItem, columnHeaderMenu, typeMenu, columnHeaderPropertyTypeMenu, dataViewHeader, dataViewPanel, dataViewProperties, dataViewPrimitives, dataViewFilter, dataViewChips, dataViewChipStyles, dataViewAddColumn, dataViewTable, graphDataTableHeader, graphTableFastGridHeader, kanbanCard, kanbanGroup, smallIconActionSurfaces } = fixture
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
    !responsiveElementClasses.includes('UI_RESPONSIVE_FLOATING_PANEL_SUBPANEL_CLASSNAME') ||
    !responsiveElementClasses.includes('UI_RESPONSIVE_PANEL_FLEX_INPUT_CLASSNAME') ||
    !responsiveElementClasses.includes('UI_RESPONSIVE_COMPACT_PANEL_FIELD_INPUT_CLASSNAME') ||
    !responsiveElementClasses.includes('UI_RESPONSIVE_PANEL_TABLE_FIELD_INPUT_CLASSNAME') ||
    !responsiveElementClasses.includes('UI_RESPONSIVE_PANEL_INLINE_FIELD_CLASSNAME') ||
    !responsiveElementClasses.includes('UI_RESPONSIVE_PANEL_TEXT_ACTION_BUTTON_CLASSNAME')
  ) {
    throw new Error('Expected data-view column, type, filter, kanban, toolbar dropdown, floating subpanel, and panel input surfaces to expose shared responsive owner class names')
  }

  if (!responsiveCss.includes('.kg-toolbar-dropdown-menu') || !responsiveCss.includes('.kg-toolbar-dropdown-menu--wide') || !responsiveCss.includes('.kg-toolbar-dropdown-menu--extra-wide') || !responsiveCss.includes('--kg-toolbar-dropdown-inline-clearance') || !responsiveCss.includes('.kg-toolbar-dropdown-menu--narrow') || !responsiveCss.includes('.kg-toolbar-dropdown-menu--compact') || !responsiveCss.includes('.kg-toolbar-dropdown-menu--slim') || !responsiveCss.includes('.kg-toolbar-dropdown-menu--tiny') || !responsiveCss.includes('--kg-toolbar-dropdown-width') || !responsiveCss.includes('.kg-floating-panel-subpanel') || !responsiveCss.includes('--kg-floating-panel-subpanel-min-width') || !responsiveCss.includes('.kg-responsive-panel-flex-input') || !responsiveCss.includes('--kg-responsive-panel-flex-input-min-width') || !responsiveCss.includes('.kg-responsive-panel-inline-field') || !responsiveCss.includes('--kg-responsive-panel-inline-field-height') || !responsiveCss.includes('--kg-responsive-panel-inline-field-padding-inline') || !responsiveCss.includes('--kg-responsive-panel-inline-field-padding-block') || !responsiveCss.includes('.kg-column-header-menu')) {
    throw new Error('Expected shared responsive CSS to bound toolbar and column menus')
  }

  if (!responsiveCss.includes('.kg-menu-option-row') || !responsiveCss.includes('--kg-menu-option-row-padding-inline')) {
    throw new Error('Expected shared responsive CSS to own toolbar dropdown option row and hint sizing')
  }

  if (!responsiveCss.includes('.kg-column-header-filter-editor') || !responsiveCss.includes('.kg-column-header-filter-label') || !responsiveCss.includes('--kg-column-header-filter-label-width') || !responsiveCss.includes('.kg-column-header-filter-field') || !/\.kg-column-header-filter-field\s*\{[^}]*height:\s*var\(--kg-control-height, 28px\)/.test(responsiveCss) || !responsiveCss.includes('--kg-column-header-filter-field-padding-inline') || !responsiveCss.includes('.kg-column-header-filter-action') || !/\.kg-column-header-filter-action\s*\{[^}]*height:\s*var\(--kg-control-height, 28px\)/.test(responsiveCss) || !responsiveCss.includes('--kg-column-header-filter-action-padding-inline') || !responsiveCss.includes('.kg-column-header-type-value') || !responsiveCss.includes('--kg-column-header-type-value-max-width') || !responsiveCss.includes('.kg-type-menu') || !responsiveCss.includes('.kg-data-view-filter-menu')) {
    throw new Error('Expected shared responsive CSS to own column filter actions, type menu, and data-view filter menu sizing')
  }

  if (!responsiveCss.includes('.kg-data-view-settings-panel') || !responsiveCss.includes('.kg-data-view-settings-row-value') || !responsiveCss.includes('--kg-data-view-settings-row-value-max-width') || !responsiveCss.includes('.kg-data-view-settings-layout-choice') || !responsiveCss.includes('--kg-data-view-settings-layout-choice-min-width') || !responsiveCss.includes('.kg-data-view-table-frame') || !responsiveCss.includes('--kg-data-view-table-frame-max-height') || !responsiveCss.includes('.kg-data-view-kanban-group') || !responsiveCss.includes('.kg-kanban-drop-indicator') || !responsiveCss.includes('--kg-kanban-drop-indicator-thickness') || !responsiveCss.includes('.kg-data-view-kanban-card-list') || !responsiveCss.includes('--kg-data-view-kanban-card-list-max-height') || !responsiveCss.includes('.kg-data-view-kanban-status-row') || !responsiveCss.includes('--kg-data-view-kanban-status-row-min-height') || !responsiveCss.includes('.kg-data-view-reorder-indicator') || !responsiveCss.includes('--kg-data-view-reorder-indicator-thickness') || !responsiveCss.includes('.kg-data-view-header-actions') || !responsiveCss.includes('--kg-data-view-header-actions-max-width')) {
    throw new Error('Expected shared responsive CSS to bound data-view panels and kanban groups')
  }

  if (!responsiveCss.includes('.kg-click-expand-menu-children') || !responsiveCss.includes('.kg-menu-row svg')) {
    throw new Error('Expected nested menu children and menu icons to avoid offscreen transforms and icon wrapping')
  }

  if (!overlay.includes('clampOverlayTopLeftFullyInViewport') || !overlay.includes('kg-anchor-overlay') || overlay.includes("maxWidth: 'calc(100vw") || overlay.includes("maxHeight: 'var(--kg-overlay-max-height") || overlay.includes('overscrollBehavior')) {
    throw new Error('Expected AnchorOverlay to clamp dropdowns through placement code and shared responsive CSS')
  }

  if (!toolbarDropdown.includes('DropdownMenuSurface') || !toolbarDropdown.includes('kg-toolbar-dropdown-children') || !toolbarDropdown.includes('aria-expanded') || !toolbarDropdown.includes('dropdownMenuOptionClassName') || !toolbarDropdown.includes('UI_RESPONSIVE_COMPACT_GLYPH_CLASSNAME') || !toolbarDropdown.includes('toolbarDropdownChevronClassName') || !toolbarDropdown.includes("menuWidthClass = ''") || toolbarDropdown.includes("menuWidthClass = 'w-72'") || toolbarDropdown.includes('max-w-[45%]') || toolbarDropdown.includes('gap-2 rounded px-2 py-1 text-sm') || toolbarDropdown.includes('px-2 py-0.5 text-[10px]') || toolbarDropdown.includes('h-3 w-3') || toolbarDropdown.includes('w-3 h-3')) {
    throw new Error('Expected toolbar dropdown groups, hints, and nested chevrons to use shared responsive owners')
  }

  if (!editorWorkspaceSelect.includes('UI_RESPONSIVE_MENU_OPTION_ROW_CLASSNAME') || editorWorkspaceSelect.includes('gap-2 rounded px-2 py-1 text-sm')) {
    throw new Error('Expected EditorWorkspaceSelect appended rows to use the shared toolbar dropdown option row owner')
  }

  if (interactionModeSelect.includes('menuWidthClass="w-72"')) {
    throw new Error('Expected InteractionModeSelect to inherit the shared toolbar dropdown default width')
  }

  if (
    !canvas2dRendererSelect.includes('UI_RESPONSIVE_EXTRA_WIDE_TOOLBAR_DROPDOWN_WIDTH_CLASSNAME') ||
    canvas2dRendererSelect.includes('[--kg-toolbar-dropdown-width:24rem]') ||
    canvas2dRendererSelect.includes('max-w-[calc(100vw_-_2rem)]')
  ) {
    throw new Error('Expected Canvas2dRendererSelect to reuse the shared extra-wide toolbar dropdown owner')
  }

  if (
    compactToolbarDropdowns.some(text => !text.includes('UI_RESPONSIVE_COMPACT_TOOLBAR_DROPDOWN_WIDTH_CLASSNAME')) ||
    compactToolbarDropdowns.some(text => text.includes('menuWidthClass="w-64"'))
  ) {
    throw new Error('Expected compact toolbar dropdowns to reuse the shared compact width owner')
  }

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

  if (!searchPanel.includes('UI_RESPONSIVE_WIDE_TOOLBAR_DROPDOWN_PANEL_CLASSNAME') || searchPanel.includes('w-80')) {
    throw new Error('Expected SearchPanel dropdown width to use the shared wide toolbar dropdown owner')
  }

  if (!launchDropdown.includes('UI_RESPONSIVE_LAUNCH_MENU_ROW_CLASSNAME') || !launchDropdown.includes('UI_RESPONSIVE_DEFAULT_GLYPH_CLASSNAME') || !launchDropdown.includes("const menuIconClass = cn(UI_RESPONSIVE_DEFAULT_GLYPH_CLASSNAME, 'shrink-0')") || !launchDropdownImportUrlItem.includes('importUrlControlsId') || !launchDropdownImportUrlItem.includes('kg-click-expand-menu-children') || !launchDropdownExport.includes('kg-click-expand-menu-children') || launchDropdownExport.includes('left-full') || launchDropdownImportUrlItem.includes('runImportUrl(draft)') || launchDropdown.includes("const menuIconClass = 'w-4 h-4 shrink-0'") || launchDropdown.includes('const menuIconClass = "w-4 h-4 shrink-0"') || launchDropdown.includes('w-80')) {
    throw new Error('Expected launch menu rows and menu icons to keep bounded click-expand rows without parent-click import execution')
  }

  if (!columnHeaderMenu.includes('UI_RESPONSIVE_COLUMN_HEADER_MENU_PANEL_CLASSNAME') || !columnHeaderMenu.includes('UI_RESPONSIVE_COLUMN_HEADER_FILTER_PANEL_CLASSNAME') || !columnHeaderMenu.includes('UI_RESPONSIVE_COLUMN_HEADER_FILTER_LABEL_CLASSNAME') || !columnHeaderMenu.includes('UI_RESPONSIVE_COLUMN_HEADER_FILTER_FIELD_CLASSNAME') || !columnHeaderMenu.includes('UI_RESPONSIVE_COLUMN_HEADER_FILTER_ACTION_CLASSNAME') || !columnHeaderMenu.includes('UI_RESPONSIVE_COLUMN_HEADER_TYPE_VALUE_CLASSNAME') || !columnHeaderMenu.includes('UI_RESPONSIVE_MENU_ICON_ACTION_CLASSNAME') || !columnHeaderMenu.includes('kg-click-expand-menu-children') || columnHeaderMenu.includes('onMouseEnter') || columnHeaderMenu.includes('left-full') || columnHeaderMenu.includes('w-[260px]') || columnHeaderMenu.includes('w-12 shrink-0 text-xs') || columnHeaderMenu.includes('max-w-[120px]') || columnHeaderMenu.includes('h-7 min-w-0 px-2 rounded border flex-1') || columnHeaderMenu.includes('h-7 px-2 rounded border') || columnHeaderMenu.includes('items-center justify-center w-8 h-8 rounded border')) {
    throw new Error('Expected column header menus to use bounded click-expand child primitives')
  }

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

  if (!dataViewFilter.includes('UI_RESPONSIVE_DATA_VIEW_FILTER_MENU_PANEL_CLASSNAME') || !dataViewFilter.includes('UI_RESPONSIVE_MENU_ICON_ACTION_CLASSNAME') || !dataViewFilter.includes('UI_TEXT_TRUNCATE') || dataViewFilter.includes('w-[260px]') || dataViewFilter.includes('items-center justify-center w-8 h-8 rounded border')) {
    throw new Error('Expected Data View filter menus to stay bounded and ellipsized')
  }

  if (!dataViewChipStyles.includes('UI_RESPONSIVE_INLINE_ELEMENT_ROW_CLASSNAME') || !dataViewChips.includes('UI_RESPONSIVE_COMPACT_GLYPH_CLASSNAME') || dataViewChips.includes('w-3 h-3 shrink-0')) {
    throw new Error('Expected Data View chips to prevent long tag and icon overflow')
  }

  if (!dataViewAddColumn.includes('UI_RESPONSIVE_MENU_ROW_CLASSNAME') || !dataViewAddColumn.includes('UI_RESPONSIVE_ACTION_ROW_CLASSNAME')) {
    throw new Error('Expected Data View add-column menu to reuse responsive menu and action rows')
  }

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
}
