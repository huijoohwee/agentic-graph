import { type SourceFixture } from './sourceFixture'

export function assertPhase1(fixture: SourceFixture) {
  const { toolbarText, toolbarStylesText, toolMenuController, responsiveElementClassesText, cssText, responsiveToolbarCssText, toolbarAreaCssOwners, toolbarAreaContracts, staleToolbarAreaLayoutStrings } = fixture
  if (!toolMenuController.includes('<FloatingPanelShell') || !toolMenuController.includes("from '@/components/ui/FloatingPanel'")) throw new Error('Expected native tool menu to delegate to the shared floating shell')

  if (!responsiveToolbarCssText.includes('touch-action: pan-x') || responsiveToolbarCssText.includes('touch-action: pan-x manipulation') || toolbarText.includes("touchAction: 'pan-x manipulation'")) {
    throw new Error('expected toolbar touch scrolling behavior to live in shared CSS with a valid pan-x touch-action instead of Toolbar inline style')
  }

  if (!toolbarText.includes("uiToolbarTouchRowScrollClassName")) {
    throw new Error('expected toolbar to opt into the shared touch row-scroll SSOT on narrow or coarse viewports')
  }

  if (!toolbarStylesText.includes('uiToolbarTouchRowScrollClassName') || !toolbarStylesText.includes('App-toolbar--touch-row-scroll')) {
    throw new Error('expected toolbarStyles to own the safe horizontal mobile scroll row class')
  }

  if (!toolbarStylesText.includes('uiToolbarResponsiveRowScrollClassName') || toolbarStylesText.includes('overflow-x-auto overflow-y-hidden')) {
    throw new Error('expected toolbarStyles to expose row-scroll identities without duplicating CSS scroll behavior')
  }

  if (
    !toolbarStylesText.includes('uiToolbarAreaStackClassName') ||
    !toolbarStylesText.includes('uiToolbarAreaInsetStackClassName') ||
    !toolbarStylesText.includes('uiToolbarAreaActionRowClassName') ||
    !toolbarStylesText.includes('uiToolbarAreaCompactActionRowClassName') ||
    !toolbarStylesText.includes('uiToolbarAreaWrapActionRowClassName') ||
    !toolbarStylesText.includes('uiToolbarAreaLabelClassName')
  ) {
    throw new Error('expected toolbarStyles to own toolbar-area stack/action/label class constants')
  }

  if (toolbarAreaCssOwners.some(cssOwner => !responsiveToolbarCssText.includes(cssOwner))) {
    throw new Error('expected responsive toolbar CSS to own toolbar-area spacing and bounds')
  }

  for (const [name, text, expectedOwners] of toolbarAreaContracts) {
    const missingOwner = expectedOwners.find(owner => !text.includes(owner))
    if (missingOwner) {
      throw new Error(`expected ${name} to use ${missingOwner} from toolbarStyles`)
    }
    const staleLayout = staleToolbarAreaLayoutStrings.find(stale => text.includes(stale))
    if (staleLayout) {
      throw new Error(`expected ${name} to avoid stale local toolbar-area layout string "${staleLayout}"`)
    }
  }

  if (!cssText.includes('.App-toolbar--touch-scroll')) {
    throw new Error('expected toolbar touch scrolling behavior to stay centralized in shared CSS')
  }

  if (cssText.includes('--kg-control-height: var(--kg-touch-target)')) {
    throw new Error('expected mobile touch policy not to mutate the shared control-height token used by toolbar icons')
  }

  if (cssText.includes('@media (pointer: coarse), (max-width: 768px) {\n    .App-toolbar__divider')) {
    throw new Error('expected mobile touch policy not to mutate toolbar divider sizing')
  }

  if (!cssText.includes('height: calc(var(--kg-control-height, 28px) - 12px);')) {
    throw new Error('expected toolbar divider sizing to stay globally tied to the stable control-height token')
  }

  if (!responsiveToolbarCssText.includes('.kg-row-scroll,') || !responsiveToolbarCssText.includes('.kg-responsive-row-scroll')) {
    throw new Error('expected responsive toolbar CSS to centralize same-row scrolling primitives')
  }

  if (
    !responsiveElementClassesText.includes('UI_RESPONSIVE_CONTENT_START_PADDING_CLASSNAME') ||
    !responsiveElementClassesText.includes('UI_RESPONSIVE_CONTENT_START_OFFSET_CLASSNAME') ||
    !responsiveElementClassesText.includes('UI_RESPONSIVE_CONTENT_START_OFFSET_BEFORE_CLASSNAME') ||
    !responsiveElementClassesText.includes('UI_RESPONSIVE_DATA_VIEW_ACTION_SMALL_CLASSNAME') ||
    !responsiveElementClassesText.includes('UI_RESPONSIVE_DATA_VIEW_ACTION_DEFAULT_CLASSNAME') ||
    !responsiveElementClassesText.includes('UI_RESPONSIVE_MENU_ICON_ACTION_CLASSNAME') ||
    !responsiveElementClassesText.includes('UI_RESPONSIVE_SMALL_ICON_ACTION_CLASSNAME') ||
    !responsiveElementClassesText.includes('UI_RESPONSIVE_DATA_VIEW_ICON_ACTION_SMALL_CLASSNAME') ||
    !responsiveElementClassesText.includes('UI_RESPONSIVE_DATA_VIEW_ICON_ACTION_DEFAULT_CLASSNAME') ||
    !responsiveElementClassesText.includes('UI_RESPONSIVE_DATA_VIEW_FIELD_INPUT_CLASSNAME') ||
    !responsiveElementClassesText.includes('UI_RESPONSIVE_IMPORT_URL_PRESET_ACTION_CLASSNAME') ||
    !responsiveElementClassesText.includes('UI_RESPONSIVE_IMPORT_URL_FIELD_CLASSNAME') ||
    !responsiveElementClassesText.includes('UI_RESPONSIVE_IMPORT_URL_CONFIRM_ACTION_CLASSNAME') ||
    !responsiveElementClassesText.includes('UI_RESPONSIVE_IMPORT_URL_ADDON_ACTION_CLASSNAME') ||
    !responsiveElementClassesText.includes('UI_RESPONSIVE_TOOLBAR_FIELD_CLASSNAME') ||
    !responsiveElementClassesText.includes('UI_RESPONSIVE_COLOR_SWATCH_CLASSNAME') ||
    !responsiveElementClassesText.includes('UI_RESPONSIVE_COLOR_SWATCH_DASHED_CLASSNAME') ||
    !responsiveElementClassesText.includes('UI_RESPONSIVE_SELECTION_CONTROL_CLASSNAME') ||
    !responsiveElementClassesText.includes('UI_RESPONSIVE_SMALL_SELECTION_CONTROL_CLASSNAME') ||
    !responsiveElementClassesText.includes('UI_RESPONSIVE_COMPACT_SELECTION_CONTROL_CLASSNAME') ||
    !responsiveElementClassesText.includes('UI_RESPONSIVE_SAFE_VIEWPORT_PANEL_CLASSNAME') ||
    !responsiveElementClassesText.includes('UI_RESPONSIVE_SIDE_PANEL_CLASSNAME') ||
    !responsiveElementClassesText.includes('UI_RESPONSIVE_FLOATING_PANEL_SUBPANEL_CLASSNAME') ||
    !responsiveElementClassesText.includes('UI_RESPONSIVE_CANVAS_STATUS_ROW_CLASSNAME') ||
    !responsiveElementClassesText.includes('UI_RESPONSIVE_CANVAS_STATUS_PANEL_CLASSNAME') ||
    !responsiveElementClassesText.includes('UI_RESPONSIVE_CANVAS_TOOL_ACTION_CLASSNAME') ||
    !responsiveElementClassesText.includes('UI_RESPONSIVE_ANCHOR_PREVIEW_OVERLAY_CLASSNAME') ||
    !responsiveElementClassesText.includes('UI_RESPONSIVE_MEDIA_OVERLAY_ACTION_SMALL_CLASSNAME') ||
    !responsiveElementClassesText.includes('UI_RESPONSIVE_MEDIA_OVERLAY_ACTION_DEFAULT_CLASSNAME') ||
    !responsiveElementClassesText.includes('UI_RESPONSIVE_MEDIA_OVERLAY_ACTION_ICON_CLASSNAME') ||
    !responsiveElementClassesText.includes('UI_RESPONSIVE_GRAPH_DATA_TABLE_FLOATING_PANEL_CLASSNAME') ||
    !responsiveElementClassesText.includes('UI_RESPONSIVE_GRAPH_DATA_TABLE_WIDE_FLOATING_PANEL_CLASSNAME') ||
    !responsiveElementClassesText.includes('UI_RESPONSIVE_GRAPH_DATA_TABLE_NARROW_FLOATING_PANEL_CLASSNAME') ||
    !responsiveElementClassesText.includes('UI_RESPONSIVE_GRAPH_DATA_TABLE_HEADER_CELL_CLASSNAME') ||
    !responsiveElementClassesText.includes('UI_RESPONSIVE_GRAPH_DATA_TABLE_HEADER_CONTENT_CLASSNAME') ||
    !responsiveElementClassesText.includes('UI_RESPONSIVE_GRAPH_DATA_TABLE_BODY_CELL_CLASSNAME') ||
    !responsiveElementClassesText.includes('UI_RESPONSIVE_GRAPH_DATA_TABLE_TEXT_INPUT_CLASSNAME') ||
    !responsiveElementClassesText.includes('UI_RESPONSIVE_GRAPH_DATA_TABLE_PANEL_SEARCH_INPUT_CLASSNAME') ||
    !responsiveElementClassesText.includes('UI_RESPONSIVE_GRAPH_DATA_TABLE_PANEL_VALUE_INPUT_CLASSNAME') ||
    !responsiveElementClassesText.includes('UI_RESPONSIVE_GRAPH_DATA_TABLE_PANEL_CHOICE_CLASSNAME') ||
    !responsiveElementClassesText.includes('UI_RESPONSIVE_GRAPH_DATA_TABLE_PANEL_HEADER_ROW_CLASSNAME') ||
    !responsiveElementClassesText.includes('UI_RESPONSIVE_GRAPH_DATA_TABLE_PANEL_SEARCH_ROW_CLASSNAME') ||
    !responsiveElementClassesText.includes('UI_RESPONSIVE_GRAPH_DATA_TABLE_PANEL_INLINE_ROW_CLASSNAME') ||
    !responsiveElementClassesText.includes('UI_RESPONSIVE_GRAPH_DATA_TABLE_PANEL_SPLIT_ROW_CLASSNAME') ||
    !responsiveElementClassesText.includes('UI_RESPONSIVE_GRAPH_DATA_TABLE_PANEL_FIELD_ROW_CLASSNAME') ||
    !responsiveElementClassesText.includes('UI_RESPONSIVE_GRAPH_DATA_TABLE_PANEL_INLINE_CONTROL_CLASSNAME') ||
    !responsiveElementClassesText.includes('UI_RESPONSIVE_GRAPH_DATA_TABLE_PANEL_STACK_CLASSNAME') ||
    !responsiveElementClassesText.includes('UI_RESPONSIVE_GRAPH_DATA_TABLE_PANEL_SCROLL_STACK_CLASSNAME') ||
    !responsiveElementClassesText.includes('UI_RESPONSIVE_GRAPH_DATA_TABLE_PANEL_SPACIOUS_SCROLL_STACK_CLASSNAME') ||
    !responsiveElementClassesText.includes('UI_RESPONSIVE_GRAPH_DATA_TABLE_PANEL_DIVIDER_STACK_CLASSNAME') ||
    !responsiveElementClassesText.includes('UI_RESPONSIVE_GRAPH_DATA_TABLE_PANEL_GROUP_FRAME_CLASSNAME') ||
    !responsiveElementClassesText.includes('UI_RESPONSIVE_GRAPH_DATA_TABLE_PANEL_WRAP_ROW_CLASSNAME') ||
    !responsiveElementClassesText.includes('UI_RESPONSIVE_GRAPH_DATA_TABLE_PANEL_FOOTER_ROW_CLASSNAME') ||
    !responsiveElementClassesText.includes('UI_RESPONSIVE_GRAPH_DATA_TABLE_INDEX_COLUMN_CLASSNAME') ||
    !responsiveElementClassesText.includes('UI_RESPONSIVE_GRAPH_DATA_TABLE_KIND_CELL_TEXT_CLASSNAME') ||
    !responsiveElementClassesText.includes('UI_RESPONSIVE_GRAPH_DATA_TABLE_ID_CELL_TEXT_CLASSNAME') ||
    !responsiveElementClassesText.includes('UI_RESPONSIVE_GRAPH_DATA_TABLE_COMPACT_CELL_TEXT_CLASSNAME') ||
    !responsiveElementClassesText.includes('UI_RESPONSIVE_GRAPH_DATA_TABLE_SCOPE_INDICATOR_CLASSNAME') ||
    !responsiveElementClassesText.includes('UI_RESPONSIVE_GRAPH_DATA_TABLE_ICON_BUTTON_CLASSNAME') ||
    !responsiveElementClassesText.includes('UI_RESPONSIVE_GRAPH_DATA_TABLE_SECONDARY_BUTTON_CLASSNAME') ||
    !responsiveElementClassesText.includes('UI_RESPONSIVE_GRAPH_DATA_TABLE_TOOLBAR_BUTTON_CLASSNAME') ||
    !responsiveElementClassesText.includes('UI_RESPONSIVE_KANBAN_LANE_CLASSNAME') ||
    !responsiveElementClassesText.includes('UI_RESPONSIVE_KANBAN_DROP_INDICATOR_CLASSNAME') ||
    !responsiveElementClassesText.includes('UI_RESPONSIVE_DATA_VIEW_KANBAN_CARD_LIST_CLASSNAME') ||
    !responsiveElementClassesText.includes('UI_RESPONSIVE_DATA_VIEW_KANBAN_STATUS_ROW_CLASSNAME') ||
    !responsiveElementClassesText.includes('UI_RESPONSIVE_DATA_VIEW_REORDER_INDICATOR_CLASSNAME') ||
    !responsiveElementClassesText.includes('UI_RESPONSIVE_DATA_VIEW_SETTINGS_ROW_VALUE_CLASSNAME') ||
    !responsiveElementClassesText.includes('UI_RESPONSIVE_DATA_VIEW_SETTINGS_LAYOUT_CHOICE_CLASSNAME') ||
    !responsiveElementClassesText.includes('UI_RESPONSIVE_CARD_TITLE_EDITOR_CLASSNAME') ||
    !responsiveElementClassesText.includes('UI_RESPONSIVE_CARD_MULTILINE_EDITOR_CLASSNAME') ||
    !responsiveElementClassesText.includes('UI_RESPONSIVE_STORYBOARD_REFERENCE_LINK_CLASSNAME') ||
    !responsiveElementClassesText.includes('UI_RESPONSIVE_STORYBOARD_INDEX_BADGE_CLASSNAME') ||
    !responsiveElementClassesText.includes('UI_RESPONSIVE_STORYBOARD_FILTER_ACTION_CLASSNAME') ||
    !responsiveElementClassesText.includes('UI_RESPONSIVE_CANVAS_FLOATING_ACTION_ROW_CLASSNAME') ||
    !responsiveElementClassesText.includes('UI_RESPONSIVE_CANVAS_DIAGNOSTIC_PANEL_CLASSNAME') ||
    !responsiveElementClassesText.includes('UI_RESPONSIVE_CANVAS_DIAGNOSTIC_ANCHOR_CLASSNAME') ||
    !responsiveElementClassesText.includes('UI_RESPONSIVE_CANVAS_DIAGNOSTIC_SCROLL_PANEL_CLASSNAME') ||
    !responsiveElementClassesText.includes('UI_RESPONSIVE_STRUCTURED_EDITOR_PANEL_CLASSNAME') ||
    !responsiveElementClassesText.includes('UI_RESPONSIVE_DATA_VIEW_MENU_PANEL_CLASSNAME') ||
    !responsiveElementClassesText.includes('UI_RESPONSIVE_DATA_VIEW_COMPACT_MENU_PANEL_CLASSNAME') ||
    !responsiveElementClassesText.includes('UI_RESPONSIVE_DATA_VIEW_NARROW_MENU_PANEL_CLASSNAME') ||
    !responsiveElementClassesText.includes('UI_RESPONSIVE_DATA_VIEW_SEARCH_INPUT_CLASSNAME') ||
    !responsiveElementClassesText.includes('UI_RESPONSIVE_WORKSPACE_MODE_TAB_CLASSNAME') ||
    !responsiveElementClassesText.includes('UI_RESPONSIVE_MARKDOWN_TOOLBAR_HIGHLIGHT_BADGE_CLASSNAME') ||
    !responsiveElementClassesText.includes('UI_RESPONSIVE_DATA_VIEW_HEADER_ACTIONS_CLASSNAME') ||
    !responsiveElementClassesText.includes('UI_RESPONSIVE_DATA_VIEW_TABLE_FRAME_CLASSNAME') ||
    !responsiveElementClassesText.includes('UI_RESPONSIVE_DATA_VIEW_TABLE_VALUE_CLASSNAME') ||
    !responsiveElementClassesText.includes('UI_RESPONSIVE_DATA_VIEW_TABLE_PROGRESS_CLASSNAME') ||
    !responsiveElementClassesText.includes('UI_RESPONSIVE_MENU_OPTION_ROW_CLASSNAME') ||
    !responsiveElementClassesText.includes('UI_RESPONSIVE_TOUCH_MENU_OPTION_ROW_CLASSNAME') ||
    !responsiveElementClassesText.includes('UI_RESPONSIVE_WIDE_TOOLBAR_DROPDOWN_PANEL_CLASSNAME') ||
    !responsiveElementClassesText.includes('UI_RESPONSIVE_EXTRA_WIDE_TOOLBAR_DROPDOWN_WIDTH_CLASSNAME') ||
    !responsiveElementClassesText.includes('UI_RESPONSIVE_NARROW_TOOLBAR_DROPDOWN_WIDTH_CLASSNAME') ||
    !responsiveElementClassesText.includes('UI_RESPONSIVE_COMPACT_TOOLBAR_DROPDOWN_WIDTH_CLASSNAME') ||
    !responsiveElementClassesText.includes('UI_RESPONSIVE_SLIM_TOOLBAR_DROPDOWN_WIDTH_CLASSNAME') ||
    !responsiveElementClassesText.includes('UI_RESPONSIVE_TINY_TOOLBAR_DROPDOWN_WIDTH_CLASSNAME') ||
    !responsiveElementClassesText.includes('UI_RESPONSIVE_MARKDOWN_GEO_PANEL_EMPTY_CLASSNAME') ||
    !responsiveElementClassesText.includes('UI_RESPONSIVE_MARKDOWN_GEO_PANEL_FRAME_CLASSNAME') ||
    !responsiveElementClassesText.includes('UI_RESPONSIVE_MARKDOWN_GEO_PANEL_PRESENTATION_FRAME_CLASSNAME') ||
    !responsiveElementClassesText.includes('UI_RESPONSIVE_MARKDOWN_TABLE_FRAME_CLASSNAME') ||
    !responsiveElementClassesText.includes('UI_RESPONSIVE_MARKDOWN_BOUNDED_IMAGE_CLASSNAME') ||
    !responsiveElementClassesText.includes('UI_RESPONSIVE_MARKDOWN_SAFE_HTML_TABLE_SHELL_CLASSNAME') ||
    !responsiveElementClassesText.includes('UI_RESPONSIVE_MARKDOWN_SAFE_HTML_EMBED_FRAME_CLASSNAME') ||
    !responsiveElementClassesText.includes('UI_RESPONSIVE_MARKDOWN_SAFE_HTML_PRESENTATION_EMBED_FRAME_CLASSNAME') ||
    !responsiveElementClassesText.includes('UI_RESPONSIVE_MARKDOWN_INLINE_MENU_LIST_CLASSNAME') ||
    !responsiveElementClassesText.includes('UI_RESPONSIVE_MARKDOWN_PRESENTATION_META_TEXT_CLASSNAME') ||
    !responsiveElementClassesText.includes('UI_RESPONSIVE_PREVIEW_OVERLAY_PANEL_CLASSNAME') ||
    !responsiveElementClassesText.includes('UI_RESPONSIVE_PREVIEW_GALLERY_DRAG_CARD_CLASSNAME') ||
    !responsiveElementClassesText.includes('UI_RESPONSIVE_WIDE_DIALOG_PANEL_CLASSNAME') ||
    !responsiveElementClassesText.includes('UI_RESPONSIVE_WIDE_DIALOG_MESSAGE_CLASSNAME') ||
    !responsiveElementClassesText.includes('UI_RESPONSIVE_MAIN_PANEL_OPEN_CARD_CLASSNAME') ||
    !responsiveElementClassesText.includes('UI_RESPONSIVE_MAIN_PANEL_COLLAPSED_CARD_CLASSNAME') ||
    !responsiveElementClassesText.includes('UI_RESPONSIVE_FLOATING_NOTICE_CARD_CLASSNAME') ||
    !responsiveElementClassesText.includes('UI_RESPONSIVE_GRAPH_FIELDS_DESCRIPTION_EDITOR_CLASSNAME') ||
    !responsiveElementClassesText.includes('UI_RESPONSIVE_GRAPH_FIELDS_TEMPLATE_EDITOR_CLASSNAME') ||
    !responsiveElementClassesText.includes('UI_RESPONSIVE_GRAPH_FIELDS_VALIDATION_EDITOR_CLASSNAME') ||
    !responsiveElementClassesText.includes('UI_RESPONSIVE_GRAPH_FIELDS_DEFAULT_TEXT_EDITOR_CLASSNAME') ||
    !responsiveElementClassesText.includes('UI_RESPONSIVE_GRAPH_FIELDS_DEFAULT_TEXT_EXPANDED_EDITOR_CLASSNAME') ||
    !responsiveElementClassesText.includes('UI_RESPONSIVE_GRAPH_FIELDS_DEFAULT_JSON_EDITOR_CLASSNAME') ||
    !responsiveElementClassesText.includes('UI_RESPONSIVE_GRAPH_FIELDS_OWNER_VALUE_CLASSNAME') ||
    !responsiveElementClassesText.includes('UI_RESPONSIVE_GRAPH_FIELDS_PANEL_HEADER_CLASSNAME') ||
    !responsiveElementClassesText.includes('UI_RESPONSIVE_GRAPH_FIELDS_PANEL_STRIP_CLASSNAME') ||
    !responsiveElementClassesText.includes('UI_RESPONSIVE_GRAPH_FIELDS_FIELD_INPUT_CLASSNAME') ||
    !responsiveElementClassesText.includes('UI_RESPONSIVE_GRAPH_FIELDS_COMFORTABLE_FIELD_INPUT_CLASSNAME') ||
    !responsiveElementClassesText.includes('UI_RESPONSIVE_GRAPH_FIELDS_SHORT_FIELD_INPUT_CLASSNAME') ||
    !responsiveElementClassesText.includes('UI_RESPONSIVE_GRAPH_FIELDS_TYPE_SELECT_CLASSNAME') ||
    !responsiveElementClassesText.includes('UI_RESPONSIVE_GRAPH_FIELDS_INLINE_FIELD_SHELL_CLASSNAME') ||
    !responsiveElementClassesText.includes('UI_RESPONSIVE_GRAPH_FIELDS_INLINE_FIELD_CLASSNAME') ||
    !responsiveElementClassesText.includes('UI_RESPONSIVE_GRAPH_FIELDS_COMPACT_ICON_CELL_CLASSNAME') ||
    !responsiveElementClassesText.includes('UI_RESPONSIVE_GRAPH_FIELDS_OPTION_ROW_CLASSNAME') ||
    !responsiveElementClassesText.includes('UI_RESPONSIVE_GRAPH_FIELDS_OPTION_DRAG_HANDLE_CLASSNAME') ||
    !responsiveElementClassesText.includes('UI_RESPONSIVE_GRAPH_FIELDS_OPTION_SWATCH_CLASSNAME') ||
    !responsiveElementClassesText.includes('UI_RESPONSIVE_GRAPH_FIELDS_OPTION_ACTION_CLASSNAME') ||
    !responsiveElementClassesText.includes('UI_RESPONSIVE_GRAPH_FIELDS_LIST_ROW_CLASSNAME') ||
    !responsiveElementClassesText.includes('UI_RESPONSIVE_GRAPH_FIELDS_SAMPLE_ROW_CLASSNAME') ||
    !responsiveElementClassesText.includes('UI_RESPONSIVE_SCHEMA_EDITOR_SERIALIZATION_COMPACT_EDITOR_CLASSNAME') ||
    !responsiveElementClassesText.includes('UI_RESPONSIVE_SCHEMA_EDITOR_SERIALIZATION_EDITOR_CLASSNAME') ||
    !responsiveElementClassesText.includes('UI_RESPONSIVE_MULTILINE_TEXT_INPUT_EDITOR_CLASSNAME') ||
    !responsiveElementClassesText.includes('UI_RESPONSIVE_SCHEMA_PROPERTY_NAME_CLASSNAME') ||
    !responsiveElementClassesText.includes('UI_RESPONSIVE_SCHEMA_RULES_TEXT_EDITOR_CLASSNAME') ||
    !responsiveElementClassesText.includes('UI_RESPONSIVE_PANEL_CODE_EDITOR_FRAME_CLASSNAME') ||
    !responsiveElementClassesText.includes('UI_RESPONSIVE_PANEL_CODE_EDITOR_SMALL_FRAME_CLASSNAME') ||
    !responsiveElementClassesText.includes('UI_RESPONSIVE_PANEL_CODE_EDITOR_COMPACT_FRAME_CLASSNAME') ||
    !responsiveElementClassesText.includes('UI_RESPONSIVE_PANEL_CODE_EDITOR_LARGE_FRAME_CLASSNAME') ||
    !responsiveElementClassesText.includes('UI_RESPONSIVE_PANEL_CODE_EDITOR_TALL_FRAME_CLASSNAME') ||
    !responsiveElementClassesText.includes('UI_RESPONSIVE_GRAPH_RAG_WORKFLOW_TOKEN_CLASSNAME') ||
    !responsiveElementClassesText.includes('UI_RESPONSIVE_GRAPH_RAG_WORKFLOW_COMPACT_TOKEN_CLASSNAME') ||
    !responsiveElementClassesText.includes('UI_RESPONSIVE_STATS_TOKEN_CHART_SLOT_CLASSNAME') ||
    !responsiveElementClassesText.includes('UI_RESPONSIVE_COMPACT_INLINE_CONTROL_CLASSNAME') ||
    !responsiveElementClassesText.includes('UI_RESPONSIVE_COMPACT_INLINE_CHIP_CLASSNAME') ||
    !responsiveElementClassesText.includes('UI_RESPONSIVE_MICRO_INLINE_CONTROL_CLASSNAME') ||
    !responsiveElementClassesText.includes('UI_RESPONSIVE_MICRO_INLINE_CHIP_CLASSNAME') ||
    !responsiveElementClassesText.includes('UI_RESPONSIVE_COMPACT_LIST_ROW_CLASSNAME') ||
    !responsiveElementClassesText.includes('UI_RESPONSIVE_COMPACT_GLYPH_CLASSNAME') ||
    !responsiveElementClassesText.includes('UI_RESPONSIVE_DEFAULT_GLYPH_CLASSNAME') ||
    !responsiveToolbarCssText.includes('.kg-compact-glyph') ||
    !responsiveToolbarCssText.includes('--kg-compact-glyph-size') ||
    !responsiveToolbarCssText.includes('.kg-default-glyph') ||
    !responsiveToolbarCssText.includes('--kg-default-glyph-size') ||
    !responsiveElementClassesText.includes('UI_RESPONSIVE_CHIP_CLASSNAME') ||
    !responsiveElementClassesText.includes('UI_RESPONSIVE_BADGE_CHIP_CLASSNAME') ||
    !responsiveElementClassesText.includes('UI_RESPONSIVE_BADGE_CHIP_DEFAULT_CLASSNAME') ||
    !responsiveElementClassesText.includes('UI_RESPONSIVE_INLINE_STATUS_CHIP_CLASSNAME') ||
    !responsiveElementClassesText.includes('UI_RESPONSIVE_PANEL_STICKY_OVERLAP_CLASSNAME') ||
    !responsiveElementClassesText.includes('UI_RESPONSIVE_TOOLTIP_EXPANDED_BODY_CLASSNAME') ||
    !responsiveElementClassesText.includes('UI_RESPONSIVE_TOOLTIP_KEY_LABEL_CLASSNAME') ||
    !responsiveElementClassesText.includes('UI_RESPONSIVE_STATUS_BADGE_CLASSNAME') ||
    !responsiveElementClassesText.includes('UI_RESPONSIVE_STATUS_BADGE_MESSAGE_CLASSNAME') ||
    !responsiveElementClassesText.includes('UI_RESPONSIVE_STATUS_BADGE_DETAIL_CLASSNAME') ||
    !responsiveElementClassesText.includes('UI_RESPONSIVE_COMPACT_ERROR_FEEDBACK_BADGE_CLASSNAME')
  ) {
    throw new Error('expected safe viewport panels, side panels, canvas status panels, diagnostic overlays, structured editors, floating action rows, kanban lanes, data-view panels, markdown geo/safe-html panels, preview overlays, wide dialogs, main panel cards, graph-fields editors, schema serialization editors, multiline text input editors, schema rules text editors, panel code editor frames, graph-stats token chart slots, responsive min-width owners, constrained value fields, split controls, touch targets, text action buttons, panel field rows, Storyboard Widget manager frames, History recent-file paths, and anchor previews to use shared responsive owner classes')
  }

  if (
    !responsiveElementClassesText.includes('UI_RESPONSIVE_EMBEDDED_WORKSPACE_LEFT_CLASSNAME') ||
    !responsiveElementClassesText.includes('UI_RESPONSIVE_TAG_INPUT_FORM_CLASSNAME') ||
    !responsiveElementClassesText.includes('UI_RESPONSIVE_CONSTRAINED_VALUE_FIELD_CLASSNAME') ||
    !responsiveElementClassesText.includes('UI_RESPONSIVE_SETTINGS_VALUE_WRAPPER_CLASSNAME') ||
    !responsiveElementClassesText.includes('UI_RESPONSIVE_PANEL_FLEX_INPUT_CLASSNAME') ||
    !responsiveElementClassesText.includes('UI_RESPONSIVE_COMPACT_PANEL_FLEX_INPUT_CLASSNAME') ||
    !responsiveElementClassesText.includes('UI_RESPONSIVE_COMPACT_PANEL_FIELD_INPUT_CLASSNAME') ||
    !responsiveElementClassesText.includes('UI_RESPONSIVE_PANEL_TABLE_FIELD_INPUT_CLASSNAME') ||
    !responsiveElementClassesText.includes('UI_RESPONSIVE_PANEL_TABLE_ICON_ACTION_CLASSNAME') ||
    !responsiveElementClassesText.includes('UI_RESPONSIVE_PANEL_INLINE_FIELD_CLASSNAME') ||
    !responsiveElementClassesText.includes('UI_RESPONSIVE_CONTROL_ROW_CLASSNAME') ||
    !responsiveElementClassesText.includes('UI_RESPONSIVE_SPLIT_CONTROL_HALF_CLASSNAME') ||
    !responsiveElementClassesText.includes('UI_RESPONSIVE_CONTROL_TOUCH_TARGET_CLASSNAME') ||
    !responsiveElementClassesText.includes('UI_RESPONSIVE_COMPACT_CONTROL_TOUCH_TARGET_CLASSNAME') ||
    !responsiveElementClassesText.includes('UI_RESPONSIVE_CONTROL_INPUT_CLASSNAME') ||
    !responsiveElementClassesText.includes('UI_RESPONSIVE_CONTROL_SELECT_CLASSNAME') ||
    !responsiveElementClassesText.includes('UI_RESPONSIVE_CONTROL_TOGGLE_GROUP_CLASSNAME') ||
    !responsiveElementClassesText.includes('UI_RESPONSIVE_CONTROL_TOGGLE_GROUP_END_CLASSNAME') ||
    !responsiveElementClassesText.includes('UI_RESPONSIVE_CONTROL_TOGGLE_BUTTON_CLASSNAME') ||
    !responsiveElementClassesText.includes('UI_RESPONSIVE_CONTROL_VALUE_ROW_CLASSNAME') ||
    !responsiveElementClassesText.includes('UI_RESPONSIVE_CONTROL_COMPACT_VALUE_ROW_CLASSNAME') ||
    !responsiveElementClassesText.includes('UI_RESPONSIVE_CONTROL_INLINE_FILL_CLASSNAME') ||
    !responsiveElementClassesText.includes('UI_RESPONSIVE_CONTROL_HINT_CLASSNAME') ||
    !responsiveElementClassesText.includes('UI_RESPONSIVE_TEXT_ACTION_BUTTON_CLASSNAME') ||
    !responsiveElementClassesText.includes('UI_RESPONSIVE_WIDE_TEXT_ACTION_BUTTON_CLASSNAME') ||
    !responsiveElementClassesText.includes('UI_RESPONSIVE_PANEL_TEXT_ACTION_BUTTON_CLASSNAME') ||
    !responsiveElementClassesText.includes('UI_RESPONSIVE_PANEL_FIELD_ROW_CLASSNAME') ||
    !responsiveElementClassesText.includes('UI_RESPONSIVE_PANEL_FIELD_LABEL_CLASSNAME') ||
    !responsiveElementClassesText.includes('UI_RESPONSIVE_PANEL_FIELD_LABEL_WIDE_CLASSNAME') ||
    !responsiveElementClassesText.includes('UI_RESPONSIVE_PANEL_FIELD_VALUE_CLASSNAME') ||
    !responsiveElementClassesText.includes('UI_RESPONSIVE_PANEL_HEADER_ROW_CLASSNAME') ||
    !responsiveElementClassesText.includes('UI_RESPONSIVE_PANEL_HEADER_ACTIONS_CLASSNAME') ||
    !responsiveElementClassesText.includes('UI_RESPONSIVE_PANEL_HEADER_SECONDARY_CLASSNAME') ||
    !responsiveElementClassesText.includes('UI_RESPONSIVE_WIDE_PANEL_HEADER_SECONDARY_CLASSNAME') ||
    !responsiveElementClassesText.includes('UI_RESPONSIVE_DESIGN_PANEL_HEADER_ROW_CLASSNAME') ||
    !responsiveElementClassesText.includes('UI_RESPONSIVE_DESIGN_PANEL_SEARCH_BLOCK_CLASSNAME') ||
    !responsiveElementClassesText.includes('UI_RESPONSIVE_DESIGN_PANEL_SEARCH_FIELD_CLASSNAME') ||
    !responsiveElementClassesText.includes('UI_RESPONSIVE_DESIGN_PANEL_CONTENT_CLASSNAME') ||
    !responsiveElementClassesText.includes('UI_RESPONSIVE_DESIGN_PANEL_EMPTY_ROW_CLASSNAME') ||
    !responsiveElementClassesText.includes('UI_RESPONSIVE_DESIGN_PANEL_LIST_ROW_CLASSNAME') ||
    !responsiveElementClassesText.includes('UI_RESPONSIVE_DESIGN_PANEL_TREE_ROW_CLASSNAME') ||
    !responsiveElementClassesText.includes('UI_RESPONSIVE_DESIGN_PANEL_ROW_ACTION_CLASSNAME') ||
    !responsiveElementClassesText.includes('UI_RESPONSIVE_DESIGN_PANEL_REORDER_ROW_CLASSNAME') ||
    !responsiveElementClassesText.includes('UI_RESPONSIVE_FLOW_MANAGER_PANEL_HEADER_CLASSNAME') ||
    !responsiveElementClassesText.includes('UI_RESPONSIVE_FLOW_MANAGER_PANEL_BODY_CLASSNAME') ||
    !responsiveElementClassesText.includes('UI_RESPONSIVE_FLOW_MANAGER_PANEL_FRAME_CLASSNAME') ||
    !responsiveElementClassesText.includes('UI_RESPONSIVE_FLOW_MANAGER_TOOLBAR_ROW_CLASSNAME') ||
    !responsiveElementClassesText.includes('UI_RESPONSIVE_FLOW_MANAGER_ACTION_MENU_CLASSNAME') ||
    !responsiveElementClassesText.includes('UI_RESPONSIVE_FLOW_MANAGER_SECTION_HEADER_CLASSNAME') ||
    !responsiveElementClassesText.includes('UI_RESPONSIVE_FLOW_MANAGER_SECTION_GRID_CLASSNAME') ||
    !responsiveElementClassesText.includes('UI_RESPONSIVE_FLOW_MANAGER_ACTION_GROUP_CLASSNAME') ||
    !responsiveElementClassesText.includes('UI_RESPONSIVE_FLOW_MANAGER_INLINE_CONTROL_CLASSNAME') ||
    !responsiveElementClassesText.includes('UI_RESPONSIVE_FLOW_MANAGER_TABLE_FRAME_CLASSNAME') ||
    !responsiveElementClassesText.includes('UI_RESPONSIVE_FLOW_MANAGER_TABLE_NODE_TEXT_CLASSNAME') ||
    !responsiveElementClassesText.includes('UI_RESPONSIVE_FLOW_MANAGER_TABLE_EDITOR_TEXT_CLASSNAME') ||
    !responsiveElementClassesText.includes('UI_RESPONSIVE_FLOW_MANAGER_TABLE_FORM_TEXT_CLASSNAME') ||
    !responsiveElementClassesText.includes('UI_RESPONSIVE_FLOW_MANAGER_TABLE_HEADER_CELL_CLASSNAME') ||
    !responsiveElementClassesText.includes('UI_RESPONSIVE_FLOW_MANAGER_TABLE_ACTION_HEADER_CELL_CLASSNAME') ||
    !responsiveElementClassesText.includes('UI_RESPONSIVE_FLOW_MANAGER_TABLE_CELL_CLASSNAME') ||
    !responsiveElementClassesText.includes('UI_RESPONSIVE_FLOW_MANAGER_TABLE_ACTION_CELL_CLASSNAME') ||
    !responsiveElementClassesText.includes('UI_RESPONSIVE_FLOW_MANAGER_FORM_FIELD_CLASSNAME') ||
    !responsiveElementClassesText.includes('UI_RESPONSIVE_FLOW_MANAGER_REGISTRY_ITEM_CLASSNAME') ||
    !responsiveElementClassesText.includes('UI_RESPONSIVE_FLOW_MANAGER_REGISTRY_ITEM_HEADER_CLASSNAME') ||
    !responsiveElementClassesText.includes('UI_RESPONSIVE_FLOW_MANAGER_REGISTRY_ITEM_GRID_CLASSNAME') ||
    !responsiveElementClassesText.includes('UI_RESPONSIVE_FLOW_MANAGER_SPEC_EDITOR_CLASSNAME') ||
    !responsiveElementClassesText.includes('UI_RESPONSIVE_HISTORY_RECENT_FILE_LOCATION_CLASSNAME') ||
    !responsiveToolbarCssText.includes('.kg-safe-viewport-panel') ||
    !responsiveToolbarCssText.includes('.kg-content-start-padding') ||
    !responsiveToolbarCssText.includes('.kg-content-start-offset') ||
    !responsiveToolbarCssText.includes('.kg-content-start-offset-before::before') ||
    !responsiveToolbarCssText.includes('--kg-content-start-offset-left') ||
    !responsiveToolbarCssText.includes('--kg-safe-viewport-panel-width') ||
    !responsiveToolbarCssText.includes('.kg-floating-panel-subpanel') ||
    !responsiveToolbarCssText.includes('--kg-floating-panel-subpanel-min-width') ||
    !responsiveToolbarCssText.includes('.kg-responsive-side-panel') ||
    !responsiveToolbarCssText.includes('.kg-canvas-status-row') ||
    !responsiveToolbarCssText.includes('.kg-canvas-status-panel') ||
    !responsiveToolbarCssText.includes('.kg-canvas-tool-action') ||
    !responsiveToolbarCssText.includes('--kg-canvas-tool-action-size') ||
    !responsiveToolbarCssText.includes('--kg-canvas-tool-action-size: var(--kg-touch-target, 44px)') ||
    !responsiveToolbarCssText.includes('.kg-responsive-toolbar-field') ||
    !responsiveToolbarCssText.includes('--kg-responsive-toolbar-field-height') ||
    !responsiveToolbarCssText.includes('--kg-responsive-toolbar-field-height: var(--kg-touch-target, 44px)') ||
    !responsiveToolbarCssText.includes('.kg-responsive-color-swatch') ||
    !responsiveToolbarCssText.includes('--kg-responsive-color-swatch-width') ||
    !responsiveToolbarCssText.includes('--kg-responsive-color-swatch-height') ||
    !responsiveToolbarCssText.includes('.kg-responsive-color-swatch.kg-responsive-color-swatch') ||
    !responsiveToolbarCssText.includes('.kg-responsive-color-swatch--dashed') ||
    !responsiveToolbarCssText.includes('--kg-responsive-color-swatch-width: var(--kg-touch-target, 44px)') ||
    !responsiveToolbarCssText.includes('--kg-responsive-color-swatch-height: var(--kg-touch-target, 44px)') ||
    !responsiveToolbarCssText.includes('.kg-responsive-selection-control') ||
    !responsiveToolbarCssText.includes('.kg-responsive-selection-control--small') ||
    !responsiveToolbarCssText.includes('.kg-responsive-selection-control--compact') ||
    !responsiveToolbarCssText.includes('--kg-responsive-selection-control-size') ||
    !responsiveToolbarCssText.includes('--kg-responsive-selection-control-size: 0.875rem') ||
    !responsiveToolbarCssText.includes('--kg-responsive-selection-control-size: 0.75rem') ||
    !responsiveToolbarCssText.includes('--kg-responsive-selection-control-size: 1rem') ||
    !responsiveToolbarCssText.includes('.kg-anchor-preview-overlay') ||
    !responsiveToolbarCssText.includes('--kg-anchor-preview-overlay-width') ||
    !responsiveToolbarCssText.includes('.kg-media-overlay-action') ||
    !responsiveToolbarCssText.includes('.kg-media-overlay-action--sm') ||
    !responsiveToolbarCssText.includes('--kg-media-overlay-action-sm-size') ||
    !responsiveToolbarCssText.includes('.kg-media-overlay-action--default') ||
    !responsiveToolbarCssText.includes('--kg-media-overlay-action-size') ||
    !responsiveToolbarCssText.includes('.kg-graph-data-table-floating-panel') ||
    !responsiveToolbarCssText.includes('.kg-graph-data-table-floating-panel--narrow') ||
    !responsiveToolbarCssText.includes('--kg-graph-data-table-floating-panel-width') ||
    !responsiveToolbarCssText.includes('--kg-graph-data-table-floating-panel-max-height') ||
    !responsiveToolbarCssText.includes('.kg-graph-data-table-cell-text') ||
    !responsiveToolbarCssText.includes('.kg-graph-data-table-cell-text--kind') ||
    !responsiveToolbarCssText.includes('.kg-graph-data-table-cell-text--id') ||
    !responsiveToolbarCssText.includes('.kg-graph-data-table-cell-text--compact') ||
    !responsiveToolbarCssText.includes('--kg-graph-data-table-cell-text-max-width') ||
    !responsiveToolbarCssText.includes('.kg-graph-data-table-scope-indicator') ||
    !responsiveToolbarCssText.includes('--kg-graph-data-table-scope-indicator-width') ||
    !responsiveToolbarCssText.includes('.kg-graph-data-table-icon-button') ||
    !responsiveToolbarCssText.includes('.kg-graph-data-table-secondary-button') ||
    !responsiveToolbarCssText.includes('.kg-graph-data-table-toolbar-button') ||
    !responsiveToolbarCssText.includes('.kg-responsive-kanban-lane') ||
    !responsiveToolbarCssText.includes('.kg-kanban-drop-indicator') ||
    !responsiveToolbarCssText.includes('--kg-kanban-drop-indicator-thickness') ||
    !responsiveToolbarCssText.includes('.kg-data-view-kanban-card-list') ||
    !responsiveToolbarCssText.includes('--kg-data-view-kanban-card-list-max-height') ||
    !responsiveToolbarCssText.includes('.kg-data-view-kanban-status-row') ||
    !responsiveToolbarCssText.includes('--kg-data-view-kanban-status-row-min-height') ||
    !responsiveToolbarCssText.includes('.kg-data-view-reorder-indicator') ||
    !responsiveToolbarCssText.includes('--kg-data-view-reorder-indicator-thickness') ||
    !responsiveToolbarCssText.includes('.kg-storyboard-reference-link') ||
    !responsiveToolbarCssText.includes('--kg-storyboard-reference-link-height') ||
    !responsiveToolbarCssText.includes('--kg-storyboard-reference-link-min-width') ||
    !responsiveToolbarCssText.includes('--kg-storyboard-reference-link-max-width') ||
    !responsiveToolbarCssText.includes('.kg-card-title-editor') ||
    !responsiveToolbarCssText.includes('--kg-card-title-editor-min-height') ||
    !responsiveToolbarCssText.includes('.kg-card-multiline-editor') ||
    !responsiveToolbarCssText.includes('--kg-card-multiline-editor-min-height') ||
    !responsiveToolbarCssText.includes('.kg-storyboard-index-badge') ||
    !responsiveToolbarCssText.includes('--kg-storyboard-index-badge-min-width') ||
    !responsiveToolbarCssText.includes('.kg-canvas-floating-action-row') ||
    !responsiveToolbarCssText.includes('.kg-canvas-diagnostic-panel') ||
    !responsiveToolbarCssText.includes('.kg-canvas-diagnostic-anchor') ||
    !responsiveToolbarCssText.includes('.kg-canvas-diagnostic-scroll-panel') ||
    !responsiveToolbarCssText.includes('.kg-responsive-structured-editor-panel') ||
    !responsiveToolbarCssText.includes('.kg-data-view-menu-panel') ||
    !responsiveToolbarCssText.includes('.kg-data-view-menu-panel--compact') ||
    !responsiveToolbarCssText.includes('.kg-data-view-menu-panel--narrow') ||
    !responsiveToolbarCssText.includes('.kg-data-view-search-input') ||
    !responsiveToolbarCssText.includes('.kg-workspace-mode-tab') ||
    !responsiveToolbarCssText.includes('--kg-workspace-mode-tab-height') ||
    !responsiveToolbarCssText.includes('--kg-workspace-mode-tab-max-width') ||
    !responsiveToolbarCssText.includes('.kg-markdown-toolbar-highlight-badge') ||
    !responsiveToolbarCssText.includes('--kg-markdown-toolbar-highlight-badge-min-width') ||
    !responsiveToolbarCssText.includes('.kg-data-view-header-actions') ||
    !responsiveToolbarCssText.includes('--kg-data-view-header-actions-max-width') ||
    !responsiveToolbarCssText.includes('.kg-data-view-action--sm') ||
    !responsiveToolbarCssText.includes('--kg-data-view-action-sm-height') ||
    !responsiveToolbarCssText.includes('--kg-data-view-action-sm-padding-inline') ||
    !responsiveToolbarCssText.includes('--kg-data-view-action-sm-gap') ||
    !responsiveToolbarCssText.includes('.kg-data-view-action--default') ||
    !responsiveToolbarCssText.includes('--kg-data-view-action-height') ||
    !responsiveToolbarCssText.includes('--kg-data-view-action-padding-inline') ||
    !responsiveToolbarCssText.includes('--kg-data-view-action-gap') ||
    !responsiveToolbarCssText.includes('.kg-menu-icon-action') ||
    !responsiveToolbarCssText.includes('--kg-menu-icon-action-size') ||
    !responsiveToolbarCssText.includes('.kg-small-icon-action') ||
    !responsiveToolbarCssText.includes('--kg-small-icon-action-size') ||
    !responsiveToolbarCssText.includes('.kg-data-view-icon-action') ||
    !responsiveToolbarCssText.includes('--kg-data-view-icon-action-sm-size') ||
    !responsiveToolbarCssText.includes('--kg-data-view-icon-action-size') ||
    !responsiveToolbarCssText.includes('.kg-media-overlay-action-icon') ||
    !responsiveToolbarCssText.includes('--kg-media-overlay-action-icon-size')
  ) {
    throw new Error('expected safe viewport panels, side panels, canvas status panels, diagnostic overlays, structured editors, floating action rows, kanban lanes, data-view panels, markdown geo/safe-html panels, preview overlays, wide dialogs, main panel cards, graph-fields editors, schema serialization editors, multiline text input editors, schema rules text editors, panel code editor frames, graph-stats token chart slots, responsive min-width owners, constrained value fields, split controls, touch targets, text action buttons, panel field rows, Storyboard Widget manager frames, History recent-file paths, and anchor previews to use shared responsive owner classes')
  }
}
