import { staleCompactChipPaddingClass, staleInlineChipPaddingClass, staleBracketMicroChipPaddingClass, staleInlineStatusChipPaddingClass, stalePanelStickyOverlapClass, staleDataViewSmallActionSizingClass, staleDataViewDefaultActionSizingClass, staleDataViewDefaultActionPaddingFirstClass, staleDataViewPropertyRowPaddingClass, staleDataViewSearchFormSizingClass, staleDataViewSmallIconSizingClass, staleDataViewDefaultIconSizingClass, staleDataViewSmallIconWidthFirstClass, staleDataViewDefaultIconWidthFirstClass, staleSmallIconActionHeightFirstClass, staleMediaOverlaySmallActionSizingClass, staleMediaOverlayDefaultActionSizingClass, staleMenuIconActionSizingClass, staleColumnHeaderFilterActionSizingClass, staleColumnHeaderFilterFieldSizingClass, staleSmallIconActionSizingClass, staleSpotlightActionButtonPaddingClasses, stalePreviewZoomControlButtonPaddingClass, stalePreviewZoomControlsFixedHeightClass, type SourceFixture } from './sourceFixture'

export function assertPhase4(fixture: SourceFixture) {
  const { toolbarText, toolMenuText, paywallOverlayText, graphDataTableBodyText, graphFieldsSamplesPanelText, mainPanelText, orchestratorTraversalPanelsText, traversalSequenceGraphRagEditorsListsText, traversalSequenceGraphRagEditorsQueryText, agenticRagContextSectionText, parserSectionsText, helpKtvLayoutText, renderSettingsSectionText, plainTextInputEditorText, markdownDataViewInlineTextCellEditorText, statusBadgeText, errorFeedbackText, tabHeaderText, mainPanelFrameText, mainPanelContainerText, collapsibleSectionText, collapsibleSubsectionText, mainPanelSettingsPanelShellText, settingsRegistryUiText, uiSliceInitialStateText, uiSliceCoreActionsText, settingsFallbackDetailsText, settingsEntryRowInputText, settingsSpecialValueNodeText, canvasKeyTypeValueValueCellText, embeddedWorkspaceShellText, markdownDataViewMultiTagSelectText, threeSizingAndWidthControlsText, grabMapsDiscoveryWidgetSectionText, responsiveControlRowsText, flowchartRendererControlsText, flowchartRendererSettingsText, radarGalaxyRendererSettingsText, designWireframeSettingsText, layoutModeRendererSettingsText, edgeTypesRendererSettingsText, designInspectorPanelText, dataViewToolbarButtonText, widgetEditorActionsToolbarText, mainPanelStoryboardWidgetManagerHeaderText, storyboardWidgetPanelChromeText, canvasArrangeActionBarText, flowCanvasInteractionRuntimeText, graphCanvasArrangeToolbarText, designCanvasArrangeActionBarText, canvasPerformanceReadoutOverlayText, performanceAutomationReadoutText, canvasPerformancePanelText, markdownMetricsDevOverlayText, designCanvasEditorChromeText, designCanvasWebpageStatusPanelText, designFloatingPanelText, storyboardCanvasText, graphEditorOverlayText, graphEditorRightPanelText, graphEditorToolRailText, markdownInlineMenusText, markdownSelectionToolbarText, dateCellEditorText, flowMappingRowsTableText, expandCollapseAllButtonText, floatingMenuStylesText, columnHeaderMenuText, columnHeaderPropertyTypeMenuText, typeMenuText, workspaceDataViewFilterMenuText, workspaceDataViewSettingsPropertiesText, workspaceDataViewSettingsPrimitivesText, workspaceDataViewSettingsFilterText, workspaceDataViewSettingsSortText, markdownDataViewChipsText, markdownDataViewTableViewText, markdownDataViewKanbanCardText, markdownDataViewKanbanGroupText, previewOverlayText, zoomPanViewportText, previewGalleryText, markdownWorkspaceFileTreeText, workspaceDataViewHeaderText, markdownYouTubeTimestampPreviewText, geoJsonGeoPanelRendererText, markdownInlineRendererText, markdownTableBlockText, safeHtmlRendererText, markdownInlineMediaDownloadText, markdownMediaWrapperText, markdownSlidePartsText, threeGraphXrText, graphHoverTooltipText, launchSpotlightTourCardText, launchSpotlightStatusCardText, settingsViewText, rendererPaletteSettingsText, rendererHoverSettingsText, responsiveElementClassesText, responsiveToolbarCssText } = fixture
  if (
    !plainTextInputEditorText.includes('UI_RESPONSIVE_MICRO_INLINE_CONTROL_CLASSNAME') ||
    !traversalSequenceGraphRagEditorsListsText.includes('UI_RESPONSIVE_MICRO_INLINE_CONTROL_CLASSNAME') ||
    !traversalSequenceGraphRagEditorsQueryText.includes('UI_RESPONSIVE_MICRO_INLINE_CONTROL_CLASSNAME') ||
    !orchestratorTraversalPanelsText.includes('UI_RESPONSIVE_MICRO_INLINE_CONTROL_CLASSNAME') ||
    !orchestratorTraversalPanelsText.includes('UI_RESPONSIVE_CHIP_CLASSNAME') ||
    !agenticRagContextSectionText.includes('UI_RESPONSIVE_BADGE_CHIP_CLASSNAME') ||
    !parserSectionsText.includes('UI_RESPONSIVE_BADGE_CHIP_CLASSNAME') ||
    !helpKtvLayoutText.includes('UI_RESPONSIVE_BADGE_CHIP_CLASSNAME') ||
    !renderSettingsSectionText.includes('UI_RESPONSIVE_BADGE_CHIP_CLASSNAME') ||
    [
      plainTextInputEditorText,
      traversalSequenceGraphRagEditorsListsText,
      traversalSequenceGraphRagEditorsQueryText,
      orchestratorTraversalPanelsText,
      agenticRagContextSectionText,
      parserSectionsText,
      helpKtvLayoutText,
      renderSettingsSectionText,
    ].some(text =>
      text.includes(staleCompactChipPaddingClass()) ||
      text.includes(staleInlineChipPaddingClass()) ||
      text.includes(staleBracketMicroChipPaddingClass())
    )
  ) {
    throw new Error('expected panel micro inline controls, badges, and plain text inputs to use shared responsive spacing owners')
  }

  if (
    !mainPanelText.includes('UI_RESPONSIVE_INLINE_STATUS_CHIP_CLASSNAME') ||
    !settingsViewText.includes('UI_RESPONSIVE_PANEL_STICKY_OVERLAP_CLASSNAME') ||
    mainPanelText.includes(staleInlineStatusChipPaddingClass()) ||
    settingsViewText.includes(stalePanelStickyOverlapClass())
  ) {
    throw new Error('expected main-panel status chips and panel sticky overlap offsets to live in shared responsive owners')
  }

  if (
    !graphHoverTooltipText.includes('UI_RESPONSIVE_TOOLTIP_EXPANDED_BODY_CLASSNAME') ||
    !graphHoverTooltipText.includes('UI_RESPONSIVE_TOOLTIP_KEY_LABEL_CLASSNAME') ||
    graphHoverTooltipText.includes('max-h-[220px]') ||
    graphHoverTooltipText.includes('max-w-[80px]')
  ) {
    throw new Error('expected GraphHoverTooltip expanded body and key labels to use shared responsive tooltip sizing classes')
  }

  if (
    !markdownYouTubeTimestampPreviewText.includes('UI_RESPONSIVE_ANCHOR_PREVIEW_OVERLAY_CLASSNAME') ||
    markdownYouTubeTimestampPreviewText.includes('w-56')
  ) {
    throw new Error('expected YouTube timestamp preview width to live in the shared anchor preview overlay owner')
  }

  if (
    !statusBadgeText.includes('UI_RESPONSIVE_STATUS_BADGE_CLASSNAME') ||
    !statusBadgeText.includes('UI_RESPONSIVE_STATUS_BADGE_MESSAGE_CLASSNAME') ||
    !statusBadgeText.includes('UI_RESPONSIVE_STATUS_BADGE_DETAIL_CLASSNAME') ||
    !tabHeaderText.includes('UI_RESPONSIVE_PANEL_HEADER_ROW_CLASSNAME') ||
    !mainPanelFrameText.includes('UI_RESPONSIVE_PANEL_HEADER_ROW_CLASSNAME') ||
    !collapsibleSectionText.includes('UI_RESPONSIVE_PANEL_HEADER_ROW_CLASSNAME') ||
    !collapsibleSubsectionText.includes("export { default } from './CollapsibleSection'") ||
    !mainPanelStoryboardWidgetManagerHeaderText.includes('UI_RESPONSIVE_PANEL_HEADER_ROW_CLASSNAME') ||
    !storyboardWidgetPanelChromeText.includes('UI_RESPONSIVE_PANEL_HEADER_ROW_CLASSNAME') ||
    !toolMenuText.includes('UI_RESPONSIVE_PANEL_HEADER_ROW_CLASSNAME') ||
    !settingsRegistryUiText.includes('UI_RESPONSIVE_PANEL_HEADER_ROW_CLASSNAME') ||
    !uiSliceInitialStateText.includes('UI_RESPONSIVE_PANEL_HEADER_ROW_CLASSNAME') ||
    !uiSliceCoreActionsText.includes('UI_RESPONSIVE_PANEL_HEADER_ROW_CLASSNAME') ||
    !collapsibleSectionText.includes('UI_RESPONSIVE_PANEL_HEADER_ACTIONS_CLASSNAME') ||
    !mainPanelSettingsPanelShellText.includes('UI_RESPONSIVE_PANEL_HEADER_SECONDARY_CLASSNAME') ||
    !graphFieldsSamplesPanelText.includes('UI_RESPONSIVE_WIDE_PANEL_HEADER_SECONDARY_CLASSNAME') ||
    !settingsEntryRowInputText.includes('UI_RESPONSIVE_SETTINGS_VALUE_WRAPPER_CLASSNAME') ||
    !settingsSpecialValueNodeText.includes('KTV_VALUE_ROW_INPUT_SHELL_CLASS_NAME') ||
    !canvasKeyTypeValueValueCellText.includes('UI_RESPONSIVE_COMPACT_PANEL_FLEX_INPUT_CLASSNAME') ||
    !errorFeedbackText.includes('UI_RESPONSIVE_COMPACT_ERROR_FEEDBACK_BADGE_CLASSNAME') ||
    !embeddedWorkspaceShellText.includes('UI_RESPONSIVE_EMBEDDED_WORKSPACE_LEFT_CLASSNAME') ||
    !markdownDataViewMultiTagSelectText.includes('UI_RESPONSIVE_TAG_INPUT_FORM_CLASSNAME') ||
    !markdownDataViewMultiTagSelectText.includes('UI_RESPONSIVE_SMALL_ICON_ACTION_CLASSNAME') ||
    statusBadgeText.includes('max-w-40') ||
    statusBadgeText.includes('max-w-32') ||
    collapsibleSectionText.includes('max-w-[45%]') ||
    mainPanelSettingsPanelShellText.includes('max-w-[55%]') ||
    graphFieldsSamplesPanelText.includes('max-w-[65%]') ||
    [tabHeaderText, mainPanelFrameText, collapsibleSectionText, collapsibleSubsectionText, mainPanelStoryboardWidgetManagerHeaderText, storyboardWidgetPanelChromeText, toolMenuText, settingsRegistryUiText, uiSliceInitialStateText, uiSliceCoreActionsText].some(text => text.includes('min-h-[36px]')) ||
    storyboardWidgetPanelChromeText.includes('h-[36px]') ||
    mainPanelContainerText.includes('headerBarHeightPx') ||
    mainPanelContainerText.includes('--kg-header-bar-height') ||
    settingsFallbackDetailsText.includes('Tailwind class for primary header row min-height') ||
    settingsFallbackDetailsText.includes('Tailwind class for section header row min-height') ||
    settingsEntryRowInputText.includes('min-h-[24px]') ||
    settingsSpecialValueNodeText.includes('min-w-[7rem]') ||
    errorFeedbackText.includes('h-[18px]') ||
    statusBadgeText.includes('sm:min-w-[120px]') ||
    embeddedWorkspaceShellText.includes('sm:min-w-[280px]') ||
    markdownDataViewMultiTagSelectText.includes('sm:min-w-[120px]') ||
    markdownDataViewMultiTagSelectText.includes(staleSmallIconActionSizingClass())
  ) {
    throw new Error('expected status badges, panel header rows, embedded workspace panes, and tag input forms to use shared responsive owners instead of local breakpoint literals')
  }

  if (
    !widgetEditorActionsToolbarText.includes('App-toolbar__btn') ||
    !grabMapsDiscoveryWidgetSectionText.includes('UI_RESPONSIVE_PANEL_TEXT_ACTION_BUTTON_CLASSNAME') ||
    grabMapsDiscoveryWidgetSectionText.includes('inline-flex h-8 items-center gap-1 rounded border px-2 text-sm') ||
    grabMapsDiscoveryWidgetSectionText.includes('inline-flex h-8 items-center gap-1 rounded px-2 text-sm') ||
    widgetEditorActionsToolbarText.includes('min-w-[36px]') ||
    widgetEditorActionsToolbarText.includes('min-w-[40px]')
  ) {
    throw new Error('expected Storyboard Widget icon actions and panel text action buttons to use their shared responsive button owners')
  }

  if (
    !threeSizingAndWidthControlsText.includes('UI_RESPONSIVE_CONSTRAINED_VALUE_FIELD_CLASSNAME') ||
    threeSizingAndWidthControlsText.includes('max-w-[180px]')
  ) {
    throw new Error('expected shared Three sizing value controls to use the shared responsive constrained value field owner')
  }

  if (
    !responsiveControlRowsText.includes('UI_RESPONSIVE_SPLIT_CONTROL_HALF_CLASSNAME') ||
    !responsiveControlRowsText.includes('UI_RESPONSIVE_CONTROL_ROW_CLASSNAME') ||
    !responsiveControlRowsText.includes('UI_RESPONSIVE_CONTROL_INPUT_CLASSNAME') ||
    !responsiveControlRowsText.includes('UI_RESPONSIVE_CONTROL_SELECT_CLASSNAME') ||
    !responsiveControlRowsText.includes('UI_RESPONSIVE_CONTROL_TOGGLE_GROUP_CLASSNAME') ||
    !responsiveControlRowsText.includes('UI_RESPONSIVE_CONTROL_TOGGLE_GROUP_END_CLASSNAME') ||
    !responsiveControlRowsText.includes('UI_RESPONSIVE_CONTROL_TOGGLE_BUTTON_CLASSNAME') ||
    !responsiveControlRowsText.includes('ResponsiveControlInput') ||
    !responsiveControlRowsText.includes('PANEL_TYPOGRAPHY_DEFAULTS.keyValueInputClass') ||
    !radarGalaxyRendererSettingsText.includes('UI_RESPONSIVE_CONTROL_TOGGLE_GROUP_END_CLASSNAME') ||
    !radarGalaxyRendererSettingsText.includes('UI_RESPONSIVE_SELECTION_CONTROL_CLASSNAME') ||
    !edgeTypesRendererSettingsText.includes('UI_RESPONSIVE_CONTROL_TOGGLE_GROUP_END_CLASSNAME') ||
    !edgeTypesRendererSettingsText.includes('UI_RESPONSIVE_SELECTION_CONTROL_CLASSNAME') ||
    !layoutModeRendererSettingsText.includes('UI_RESPONSIVE_CONTROL_VALUE_ROW_CLASSNAME') ||
    !layoutModeRendererSettingsText.includes('UI_RESPONSIVE_CONTROL_INLINE_FILL_CLASSNAME') ||
    !layoutModeRendererSettingsText.includes('UI_RESPONSIVE_CONTROL_HINT_CLASSNAME') ||
    !rendererPaletteSettingsText.includes('UI_RESPONSIVE_CONTROL_VALUE_ROW_CLASSNAME') ||
    !rendererPaletteSettingsText.includes('UI_RESPONSIVE_CONTROL_INLINE_FILL_CLASSNAME') ||
    !flowchartRendererControlsText.includes("from '@/lib/ui/responsiveControlRows'") ||
    !radarGalaxyRendererSettingsText.includes("from '@/lib/ui/responsiveControlRows'") ||
    !designWireframeSettingsText.includes("from '@/lib/ui/responsiveControlRows'") ||
    !layoutModeRendererSettingsText.includes("from '@/lib/ui/responsiveControlRows'") ||
    !edgeTypesRendererSettingsText.includes("from '@/lib/ui/responsiveControlRows'") ||
    !designInspectorPanelText.includes("from '@/lib/ui/responsiveControlRows'") ||
    !flowchartRendererSettingsText.includes('UI_RESPONSIVE_COMPACT_CONTROL_TOUCH_TARGET_CLASSNAME') ||
    !flowchartRendererSettingsText.includes('UI_RESPONSIVE_CONTROL_TOUCH_TARGET_CLASSNAME') ||
    [flowchartRendererControlsText, radarGalaxyRendererSettingsText, designWireframeSettingsText, layoutModeRendererSettingsText, edgeTypesRendererSettingsText, designInspectorPanelText, flowchartRendererSettingsText].some(text =>
      text.includes('w-[50%]') ||
      text.includes('min-h-[44px]') ||
      text.includes('min-h-[36px]') ||
      text.includes('h-6 px-2 text-xs')
    ) ||
    responsiveControlRowsText.includes('w-full ${UI_RESPONSIVE_CONTROL_TOUCH_TARGET_CLASSNAME}') ||
    responsiveControlRowsText.includes('w-full text-xs border') ||
    responsiveControlRowsText.includes('flex items-center gap-1') ||
    responsiveControlRowsText.includes('flex-1 text-xs border') ||
    radarGalaxyRendererSettingsText.includes('valueClassName="flex items-center justify-end"') ||
    edgeTypesRendererSettingsText.includes('valueClassName="flex items-center justify-end"') ||
    edgeTypesRendererSettingsText.includes('className="h-4 w-4"') ||
    layoutModeRendererSettingsText.includes('valueClassName="flex items-center gap-2"') ||
    layoutModeRendererSettingsText.includes('min-w-0 flex-1 text-right') ||
    layoutModeRendererSettingsText.includes('min-w-12 text-right text-[10px]') ||
    rendererPaletteSettingsText.includes('className="flex items-center gap-2"')
  ) {
    throw new Error('expected flowchart, radar, design wireframe, layout, edge type renderer, and design inspector split widths and touch target heights to live in shared responsive owner classes')
  }

  if (
    !toolbarText.includes('UI_RESPONSIVE_MAIN_PANEL_OPEN_CARD_CLASSNAME') ||
    !toolbarText.includes('UI_RESPONSIVE_MAIN_PANEL_COLLAPSED_CARD_CLASSNAME') ||
    ['w-[96vw]', 'sm:w-[80vw]', 'h-[85vh]', 'sm:h-[80vh]', 'max-w-[1200px]', 'max-h-[800px]'].some(snippet => toolbarText.includes(snippet))
  ) {
    throw new Error('expected Toolbar main panel card dimensions to live in shared responsive owner classes')
  }

  if (
    !launchSpotlightTourCardText.includes('UI_RESPONSIVE_FLOATING_NOTICE_CARD_CLASSNAME') ||
    !launchSpotlightStatusCardText.includes('UI_RESPONSIVE_FLOATING_NOTICE_CARD_CLASSNAME') ||
    !launchSpotlightTourCardText.includes('UI_RESPONSIVE_PANEL_TEXT_ACTION_BUTTON_CLASSNAME') ||
    !launchSpotlightStatusCardText.includes('UI_RESPONSIVE_PANEL_TEXT_ACTION_BUTTON_CLASSNAME') ||
    [launchSpotlightTourCardText, launchSpotlightStatusCardText].some(text =>
      text.includes('max-w-xs') ||
      text.includes('w-80') ||
      staleSpotlightActionButtonPaddingClasses().some(snippet => text.includes(snippet))
    )
  ) {
    throw new Error('expected Launch Spotlight cards and action buttons to share responsive owners')
  }

  if (
    !paywallOverlayText.includes('UI_RESPONSIVE_WIDE_DIALOG_PANEL_CLASSNAME') ||
    !paywallOverlayText.includes('UI_RESPONSIVE_WIDE_DIALOG_MESSAGE_CLASSNAME') ||
    paywallOverlayText.includes('w-[min(1100px,95vw)]') ||
    paywallOverlayText.includes('h-[min(760px,95vh)]') ||
    paywallOverlayText.includes('max-w-[46rem]')
  ) {
    throw new Error('expected PaywallOverlay dimensions and message width to live in shared responsive wide-dialog owner classes')
  }

  if (
    !previewOverlayText.includes('UI_RESPONSIVE_PREVIEW_OVERLAY_PANEL_CLASSNAME') ||
    !zoomPanViewportText.includes('UI_RESPONSIVE_PANEL_HEADER_ROW_CLASSNAME') ||
    !zoomPanViewportText.includes('UI_RESPONSIVE_PANEL_TEXT_ACTION_BUTTON_CLASSNAME') ||
    previewOverlayText.includes('w-[95vw]') ||
    previewOverlayText.includes('h-[95vh]') ||
    zoomPanViewportText.includes(stalePreviewZoomControlButtonPaddingClass()) ||
    zoomPanViewportText.includes(stalePreviewZoomControlsFixedHeightClass())
  ) {
    throw new Error('expected PreviewOverlay dimensions and preview zoom controls to live in shared responsive owner classes')
  }

  if (
    !previewGalleryText.includes('UI_RESPONSIVE_PREVIEW_GALLERY_DRAG_CARD_CLASSNAME') ||
    previewGalleryText.includes('max-w-[260px]')
  ) {
    throw new Error('expected PreviewGallery drag-card width to live in the shared responsive owner class')
  }

  if (
    !markdownInlineRendererText.includes('UI_RESPONSIVE_MARKDOWN_BOUNDED_IMAGE_CLASSNAME') ||
    markdownInlineRendererText.includes('max-h-[80vh]') ||
    markdownInlineRendererText.includes('isPdfAsset') ||
    !markdownTableBlockText.includes('UI_RESPONSIVE_MARKDOWN_TABLE_FRAME_CLASSNAME') ||
    markdownTableBlockText.includes('max-h-[80vh]') ||
    !safeHtmlRendererText.includes('UI_RESPONSIVE_MARKDOWN_SAFE_HTML_TABLE_SHELL_CLASSNAME') ||
    !safeHtmlRendererText.includes('UI_RESPONSIVE_MARKDOWN_SAFE_HTML_EMBED_FRAME_CLASSNAME') ||
    !safeHtmlRendererText.includes('UI_RESPONSIVE_MARKDOWN_SAFE_HTML_PRESENTATION_EMBED_FRAME_CLASSNAME') ||
    !safeHtmlRendererText.includes('UI_RESPONSIVE_MEDIA_OVERLAY_ACTION_DEFAULT_CLASSNAME') ||
    !safeHtmlRendererText.includes('UI_RESPONSIVE_MEDIA_OVERLAY_ACTION_ICON_CLASSNAME') ||
    !markdownInlineMediaDownloadText.includes('UI_RESPONSIVE_MEDIA_OVERLAY_ACTION_SMALL_CLASSNAME') ||
    !markdownInlineMediaDownloadText.includes('UI_RESPONSIVE_MEDIA_OVERLAY_ACTION_ICON_CLASSNAME') ||
    !markdownMediaWrapperText.includes('UI_RESPONSIVE_MEDIA_OVERLAY_ACTION_DEFAULT_CLASSNAME') ||
    !markdownMediaWrapperText.includes('UI_RESPONSIVE_MEDIA_OVERLAY_ACTION_ICON_CLASSNAME') ||
    !markdownSlidePartsText.includes('UI_RESPONSIVE_MARKDOWN_PRESENTATION_META_TEXT_CLASSNAME') ||
    safeHtmlRendererText.includes('max-h-[80vh]') ||
    safeHtmlRendererText.includes('h-[140px]') ||
    safeHtmlRendererText.includes('h-[220px]') ||
    [safeHtmlRendererText, markdownMediaWrapperText].some(text => text.includes(staleMediaOverlayDefaultActionSizingClass())) ||
    markdownInlineMediaDownloadText.includes(staleMediaOverlaySmallActionSizingClass()) ||
    [safeHtmlRendererText, markdownInlineMediaDownloadText, markdownMediaWrapperText].some(text => text.includes('Download className="h-4 w-4"')) ||
    markdownSlidePartsText.includes('max-w-[28rem]')
  ) {
    throw new Error('expected markdown table, media overlay actions, presentation meta text, and srcdoc iframe sizing to live in shared responsive owner classes')
  }

  if (!responsiveToolbarCssText.includes('.kg-responsive-element-row')) {
    throw new Error('expected responsive toolbar CSS to centralize clipped one-row element primitives')
  }

  if (
    !responsiveElementClassesText.includes('UI_RESPONSIVE_LABEL_ROW_CLASSNAME') ||
    !rendererHoverSettingsText.includes('UI_RESPONSIVE_LABEL_ROW_CLASSNAME') ||
    rendererHoverSettingsText.includes('flex items-center gap-1 text-xs')
  ) {
    throw new Error('expected renderer hover checkbox labels to use the shared responsive label row owner')
  }

  if (!responsiveElementClassesText.includes('kg-touch-menu-row') || responsiveElementClassesText.includes('min-h-[var(--kg-touch-target)]')) {
    throw new Error('expected touch menu row height to be CSS-policy driven, not forced into every desktop dropdown row')
  }

  if (!responsiveElementClassesText.includes('UI_RESPONSIVE_LAUNCH_MENU_ROW_CLASSNAME') || !responsiveElementClassesText.includes('kg-launch-menu-item') || !responsiveElementClassesText.includes('kg-touch-menu-row')) {
    throw new Error('expected Launch menu rows to reuse the shared mobile touch-row policy')
  }

  if (!responsiveToolbarCssText.includes('.kg-touch-menu-row') || !responsiveToolbarCssText.includes('min-height: var(--kg-control-height, 28px);') || !responsiveToolbarCssText.includes('min-height: var(--kg-touch-target, 44px);')) {
    throw new Error('expected touch menu rows to use compact desktop height and mobile touch height from shared CSS')
  }

  if (
    !columnHeaderMenuText.includes('UI_RESPONSIVE_MENU_ICON_ACTION_CLASSNAME') ||
    !columnHeaderMenuText.includes('UI_RESPONSIVE_COLUMN_HEADER_FILTER_FIELD_CLASSNAME') ||
    !columnHeaderMenuText.includes('UI_RESPONSIVE_COLUMN_HEADER_FILTER_ACTION_CLASSNAME') ||
    !responsiveToolbarCssText.includes('.kg-column-header-filter-field') ||
    !responsiveToolbarCssText.includes('--kg-column-header-filter-field-height') ||
    !responsiveToolbarCssText.includes('--kg-column-header-filter-field-padding-inline') ||
    !responsiveToolbarCssText.includes('.kg-column-header-filter-action') ||
    !responsiveToolbarCssText.includes('--kg-column-header-filter-action-height') ||
    !responsiveToolbarCssText.includes('--kg-column-header-filter-action-padding-inline') ||
    !workspaceDataViewFilterMenuText.includes('UI_RESPONSIVE_MENU_ICON_ACTION_CLASSNAME') ||
    !markdownDataViewTableViewText.includes('UI_RESPONSIVE_MENU_ICON_ACTION_CLASSNAME') ||
    !typeMenuText.includes('UI_RESPONSIVE_DEFAULT_GLYPH_CLASSNAME') ||
    !typeMenuText.includes('typeMenuGlyphClassName') ||
    !columnHeaderPropertyTypeMenuText.includes('UI_RESPONSIVE_COMPACT_GLYPH_CLASSNAME') ||
    !columnHeaderPropertyTypeMenuText.includes('columnHeaderPropertyTypeMenuGlyphClassName') ||
    [columnHeaderMenuText, workspaceDataViewFilterMenuText, markdownDataViewTableViewText].some(text =>
      text.includes(staleMenuIconActionSizingClass())
    ) ||
    columnHeaderMenuText.includes(staleColumnHeaderFilterFieldSizingClass()) ||
    columnHeaderMenuText.includes(staleColumnHeaderFilterActionSizingClass()) ||
    typeMenuText.includes('w-4 h-4 shrink-0') ||
    typeMenuText.includes('h-4 w-4 shrink-0') ||
    columnHeaderPropertyTypeMenuText.includes('w-3 h-3 shrink-0') ||
    columnHeaderPropertyTypeMenuText.includes('h-3 w-3 shrink-0')
  ) {
    throw new Error('expected column header filter actions and type menu glyph sizing to live in shared responsive owners')
  }

  if (
    !dataViewToolbarButtonText.includes('UI_RESPONSIVE_ACTION_ROW_CLASSNAME') ||
    !dataViewToolbarButtonText.includes('UI_RESPONSIVE_INLINE_ELEMENT_ROW_CLASSNAME') ||
    !dataViewToolbarButtonText.includes('UI_RESPONSIVE_DATA_VIEW_ACTION_SMALL_CLASSNAME') ||
    !dataViewToolbarButtonText.includes('UI_RESPONSIVE_DATA_VIEW_ACTION_DEFAULT_CLASSNAME') ||
    !dataViewToolbarButtonText.includes('UI_RESPONSIVE_DATA_VIEW_ICON_ACTION_SMALL_CLASSNAME') ||
    !dataViewToolbarButtonText.includes('UI_RESPONSIVE_DATA_VIEW_ICON_ACTION_DEFAULT_CLASSNAME') ||
    !dataViewToolbarButtonText.includes('getDataViewToolbarButtonClassName') ||
    !dataViewToolbarButtonText.includes('getDataViewIconButtonClassName') ||
    !workspaceDataViewHeaderText.includes('getDataViewIconButtonClassName') ||
    !workspaceDataViewFilterMenuText.includes('UI_RESPONSIVE_DATA_VIEW_ACTION_DEFAULT_CLASSNAME') ||
    [dataViewToolbarButtonText, workspaceDataViewHeaderText, workspaceDataViewFilterMenuText, workspaceDataViewSettingsFilterText, workspaceDataViewSettingsSortText, workspaceDataViewSettingsPropertiesText].some(text =>
      text.includes(staleDataViewSmallActionSizingClass()) ||
      text.includes(staleDataViewDefaultActionSizingClass()) ||
      text.includes(staleDataViewDefaultActionPaddingFirstClass()) ||
      text.includes(staleDataViewSmallIconSizingClass()) ||
      text.includes(staleDataViewDefaultIconSizingClass()) ||
      text.includes(staleDataViewSmallIconWidthFirstClass()) ||
      text.includes(staleDataViewDefaultIconWidthFirstClass())
    ) ||
    !workspaceDataViewSettingsFilterText.includes('DataViewIconButton') ||
    !workspaceDataViewSettingsFilterText.includes('DataViewToolbarButton') ||
    !workspaceDataViewSettingsFilterText.includes('getDataViewToolbarButtonClassName') ||
    !workspaceDataViewSettingsSortText.includes('DataViewToolbarButton') ||
    !workspaceDataViewSettingsPropertiesText.includes('getDataViewIconButtonClassName') ||
    !workspaceDataViewSettingsPropertiesText.includes('UI_RESPONSIVE_DATA_VIEW_FIELD_INPUT_CLASSNAME') ||
    !workspaceDataViewHeaderText.includes('UI_RESPONSIVE_COMPACT_GLYPH_CLASSNAME') ||
    !markdownDataViewChipsText.includes('UI_RESPONSIVE_COMPACT_GLYPH_CLASSNAME') ||
    !markdownDataViewMultiTagSelectText.includes('UI_RESPONSIVE_COMPACT_GLYPH_CLASSNAME') ||
    !markdownDataViewTableViewText.includes('UI_RESPONSIVE_COMPACT_GLYPH_CLASSNAME') ||
    [workspaceDataViewHeaderText, markdownDataViewChipsText, markdownDataViewMultiTagSelectText, markdownDataViewTableViewText].some(text => text.includes('w-3 h-3 shrink-0'))
  ) {
    throw new Error('expected shared data-view toolbar buttons, settings controls, and compact glyphs to use responsive owners')
  }

  if (
    !floatingMenuStylesText.includes('UI_RESPONSIVE_DATA_VIEW_MENU_PANEL_CLASSNAME') ||
    !floatingMenuStylesText.includes('UI_RESPONSIVE_DATA_VIEW_COMPACT_MENU_PANEL_CLASSNAME') ||
    !workspaceDataViewSettingsPropertiesText.includes('UI_RESPONSIVE_DATA_VIEW_MENU_PANEL_CLASSNAME') ||
    !workspaceDataViewSettingsPropertiesText.includes('UI_RESPONSIVE_DATA_VIEW_REORDER_INDICATOR_CLASSNAME') ||
    !workspaceDataViewSettingsPropertiesText.includes('UI_RESPONSIVE_DATA_VIEW_PROPERTY_ROW_CLASSNAME') ||
    !responsiveElementClassesText.includes('UI_RESPONSIVE_DATA_VIEW_PROPERTY_ROW_CLASSNAME') ||
    !responsiveToolbarCssText.includes('.kg-data-view-property-row') ||
    !responsiveToolbarCssText.includes('--kg-data-view-property-row-padding-inline') ||
    !responsiveToolbarCssText.includes('--kg-data-view-property-row-padding-block') ||
    !workspaceDataViewSettingsPrimitivesText.includes('UI_RESPONSIVE_DATA_VIEW_SETTINGS_ROW_VALUE_CLASSNAME') ||
    !workspaceDataViewSettingsPrimitivesText.includes('UI_RESPONSIVE_DATA_VIEW_SETTINGS_LAYOUT_CHOICE_CLASSNAME') ||
    !workspaceDataViewSettingsPrimitivesText.includes('UI_RESPONSIVE_COMPACT_GLYPH_CLASSNAME') ||
    !markdownDataViewTableViewText.includes('UI_RESPONSIVE_DATA_VIEW_MENU_PANEL_CLASSNAME') ||
    !markdownDataViewTableViewText.includes('UI_RESPONSIVE_DATA_VIEW_TABLE_FRAME_CLASSNAME') ||
    !markdownDataViewTableViewText.includes('UI_RESPONSIVE_DATA_VIEW_TABLE_VALUE_CLASSNAME') ||
    !markdownDataViewTableViewText.includes('UI_RESPONSIVE_DATA_VIEW_TABLE_PROGRESS_CLASSNAME') ||
    !markdownDataViewTableViewText.includes('MarkdownDataViewInlineTextCellEditor') ||
    !markdownDataViewInlineTextCellEditorText.includes('MARKDOWN_TEXT_EDIT_SURFACE_MIN_LINE_HEIGHT_CLASS') ||
    !markdownDataViewKanbanCardText.includes('UI_RESPONSIVE_DATA_VIEW_COMPACT_MENU_PANEL_CLASSNAME') ||
    !markdownDataViewKanbanCardText.includes('UI_RESPONSIVE_SMALL_ICON_ACTION_CLASSNAME') ||
    !markdownDataViewKanbanGroupText.includes('UI_RESPONSIVE_SMALL_ICON_ACTION_CLASSNAME') ||
    !dateCellEditorText.includes('UI_RESPONSIVE_SMALL_ICON_ACTION_CLASSNAME') ||
    !flowMappingRowsTableText.includes('UI_RESPONSIVE_SMALL_ICON_ACTION_CLASSNAME') ||
    !expandCollapseAllButtonText.includes('UI_RESPONSIVE_SMALL_ICON_ACTION_CLASSNAME') ||
    !markdownWorkspaceFileTreeText.includes('UI_RESPONSIVE_DATA_VIEW_NARROW_MENU_PANEL_CLASSNAME') ||
    !workspaceDataViewHeaderText.includes('UI_RESPONSIVE_DATA_VIEW_SEARCH_FORM_CLASSNAME') ||
    !workspaceDataViewHeaderText.includes('UI_RESPONSIVE_DATA_VIEW_SEARCH_INPUT_CLASSNAME') ||
    !responsiveElementClassesText.includes('UI_RESPONSIVE_DATA_VIEW_SEARCH_FORM_CLASSNAME') ||
    !responsiveToolbarCssText.includes('.kg-data-view-search-form') ||
    !responsiveToolbarCssText.includes('--kg-data-view-search-form-padding-inline') ||
    !responsiveToolbarCssText.includes('--kg-data-view-search-form-padding-block') ||
    [
      floatingMenuStylesText,
      workspaceDataViewSettingsPropertiesText,
      workspaceDataViewSettingsPrimitivesText,
      markdownDataViewTableViewText,
      markdownDataViewKanbanCardText,
      markdownDataViewKanbanGroupText,
      markdownSelectionToolbarText,
      dateCellEditorText,
      flowMappingRowsTableText,
      expandCollapseAllButtonText,
      markdownWorkspaceFileTreeText,
      workspaceDataViewHeaderText,
    ].some(text =>
      text.includes('w-[280px]') ||
      text.includes('w-[220px]') ||
      text.includes('w-[180px]') ||
      text.includes('min-w-[180px]') ||
      text.includes('w-3 h-3') ||
      text.includes(staleSmallIconActionHeightFirstClass()) ||
      text.includes(staleSmallIconActionSizingClass())
    ) ||
    markdownDataViewTableViewText.includes('max-h-[70vh]') ||
    markdownDataViewTableViewText.includes('max-w-[24rem]') ||
    markdownDataViewTableViewText.includes('w-24 max-w-[55%]') || markdownDataViewTableViewText.includes('min-h-[1lh]') ||
    workspaceDataViewSettingsPropertiesText.includes('h-[2px]') ||
    workspaceDataViewSettingsPropertiesText.includes(staleDataViewPropertyRowPaddingClass()) ||
    workspaceDataViewHeaderText.includes(staleDataViewSearchFormSizingClass())
  ) {
    throw new Error('expected data-view menus and search inputs to use shared responsive panel/search owner classes instead of local fixed width literals')
  }

  if (
    !canvasArrangeActionBarText.includes('UI_RESPONSIVE_CANVAS_FLOATING_ACTION_ROW_CLASSNAME') ||
    !threeGraphXrText.includes('UI_RESPONSIVE_CANVAS_FLOATING_ACTION_ROW_CLASSNAME') ||
    !canvasArrangeActionBarText.includes(' flex ') || !canvasArrangeActionBarText.includes('flex-nowrap') || !canvasArrangeActionBarText.includes('overflow-x-auto') ||
    !flowCanvasInteractionRuntimeText.includes('CanvasArrangeActionBar') ||
    !graphCanvasArrangeToolbarText.includes('CanvasArrangeActionBar') ||
    !designCanvasArrangeActionBarText.includes('CanvasArrangeActionBar') ||
    [flowCanvasInteractionRuntimeText, graphCanvasArrangeToolbarText, designCanvasArrangeActionBarText].some(text => text.includes('flex flex-wrap gap-1 rounded-md border'))
  ) {
    throw new Error('expected Flow, Graph, Design, and XR canvas action overlays to reuse the shared responsive canvas floating action row')
  }

  if (
    !canvasPerformanceReadoutOverlayText.includes('UI_RESPONSIVE_CANVAS_DIAGNOSTIC_PANEL_CLASSNAME') ||
    !performanceAutomationReadoutText.includes('CanvasPerformanceReadoutOverlay') ||
    !canvasPerformancePanelText.includes('CanvasPerformanceReadoutOverlay') ||
    !canvasPerformancePanelText.includes('perfOpen && typeof document') ||
    !markdownMetricsDevOverlayText.includes('UI_RESPONSIVE_CANVAS_DIAGNOSTIC_ANCHOR_CLASSNAME') ||
    !markdownMetricsDevOverlayText.includes('UI_RESPONSIVE_CANVAS_DIAGNOSTIC_SCROLL_PANEL_CLASSNAME') ||
    [canvasPerformanceReadoutOverlayText, performanceAutomationReadoutText, canvasPerformancePanelText, markdownMetricsDevOverlayText].some(text =>
      text.includes('max-w-[320px]') ||
      text.includes('max-w-[420px]') ||
      text.includes('max-h-[300px]') ||
      text.includes('fixed bottom-2 left-2') ||
      text.includes('right-3 bottom-3')
    )
  ) {
    throw new Error('expected performance and markdown metric diagnostics to share responsive viewport-safe diagnostic overlay owners')
  }

  if (
    !designCanvasEditorChromeText.includes('UI_RESPONSIVE_CANVAS_STATUS_ROW_CLASSNAME') ||
    !designCanvasEditorChromeText.includes('UI_RESPONSIVE_CANVAS_TOOL_ACTION_CLASSNAME') ||
    !designCanvasWebpageStatusPanelText.includes('UI_RESPONSIVE_CANVAS_STATUS_PANEL_CLASSNAME') ||
    designCanvasEditorChromeText.includes('calc(100%-') ||
    designCanvasEditorChromeText.includes('h-8 w-8 justify-center p-0') ||
    designCanvasWebpageStatusPanelText.includes('calc(100%-')
  ) {
    throw new Error('expected Design Canvas status and tool chrome to use shared responsive viewport/status/action classes instead of invalid local calc or fixed tool-size literals')
  }

  if (!designFloatingPanelText.includes('uiToolbarRowScrollClassName') || designFloatingPanelText.includes('App-toolbar__btn flex items-center')) {
    throw new Error('expected design floating-panel controls and tabs to use toolbar-owned row scrolling')
  }

  if (
    !graphEditorToolRailText.includes('UI_RESPONSIVE_MENU_ROW_CLASSNAME') ||
    !graphEditorToolRailText.includes('UI_RESPONSIVE_DEFAULT_GLYPH_CLASSNAME') ||
    !graphEditorToolRailText.includes('graphEditorToolRailIconClassName') ||
    !graphEditorToolRailText.includes('UI_TEXT_TRUNCATE') ||
    graphEditorToolRailText.includes('className="h-4 w-4"') ||
    graphEditorToolRailText.includes("className='h-4 w-4'") ||
    graphEditorToolRailText.includes('className="w-4 h-4"') ||
    graphEditorToolRailText.includes("className='w-4 h-4'")
  ) {
    throw new Error('expected graph-editor rail buttons and icons to reuse responsive menu rows, shared glyph sizing, and ellipsis')
  }

  if (!graphEditorOverlayText.includes('UI_RESPONSIVE_SIDE_PANEL_CLASSNAME') || graphEditorOverlayText.includes('w-[360px]')) {
    throw new Error('expected graph-editor right panel to use the shared safe side-panel owner instead of a fixed desktop width')
  }

  if (!graphEditorRightPanelText.includes('flex h-full min-h-0 flex-col') || !graphEditorRightPanelText.includes('min-h-0 flex-1 overflow-auto') || graphEditorRightPanelText.includes('calc(100%-')) {
    throw new Error('expected graph-editor right panel content to use flex-owned scroll bounds instead of invalid fixed height calc')
  }

  if (
    !storyboardCanvasText.includes('UI_RESPONSIVE_KANBAN_LANE_CLASSNAME') ||
    !storyboardCanvasText.includes('UI_RESPONSIVE_STORYBOARD_REFERENCE_LINK_CLASSNAME') ||
    !storyboardCanvasText.includes('UI_RESPONSIVE_CARD_MULTILINE_EDITOR_CLASSNAME') ||
    !storyboardCanvasText.includes('UI_RESPONSIVE_CARD_TITLE_EDITOR_CLASSNAME') ||
    !storyboardCanvasText.includes('UI_RESPONSIVE_STORYBOARD_INDEX_BADGE_CLASSNAME') ||
    !storyboardCanvasText.includes('UI_RESPONSIVE_STORYBOARD_FILTER_ACTION_CLASSNAME') ||
    !storyboardCanvasText.includes('UI_RESPONSIVE_PANEL_TEXT_ACTION_BUTTON_CLASSNAME') ||
    storyboardCanvasText.includes('w-[360px]') ||
    storyboardCanvasText.includes('h-14 min-w-14 max-w-[8rem]') ||
    storyboardCanvasText.includes('max-w-[8rem]') ||
    storyboardCanvasText.includes('min-h-[4.5rem]') ||
    storyboardCanvasText.includes('min-h-[1.5rem]') ||
    storyboardCanvasText.includes('min-w-[2rem]') ||
    storyboardCanvasText.includes('inline-flex h-7 shrink-0 items-center gap-1 rounded border px-2 text-[11px]') ||
    storyboardCanvasText.includes('inline-flex h-8 items-center justify-center gap-1 rounded border px-2 text-[11px]') ||
    storyboardCanvasText.includes('mt-2 inline-flex h-8 w-full items-center justify-center gap-1 rounded border px-2 text-[11px]')
  ) {
    throw new Error('expected Storyboard lanes, badges, reference links, editors, filters, and text actions to use shared responsive owners instead of fixed desktop clamps')
  }

  if (!graphDataTableBodyText.includes('UI_RESPONSIVE_STRUCTURED_EDITOR_PANEL_CLASSNAME') || graphDataTableBodyText.includes('min-w-[300px]')) {
    throw new Error('expected graph-data-table JSON cell editor to use the shared responsive structured-editor owner instead of a fixed min width')
  }

  if (
    !geoJsonGeoPanelRendererText.includes('UI_RESPONSIVE_MARKDOWN_GEO_PANEL_EMPTY_CLASSNAME') ||
    !geoJsonGeoPanelRendererText.includes('UI_RESPONSIVE_MARKDOWN_GEO_PANEL_FRAME_CLASSNAME') ||
    !geoJsonGeoPanelRendererText.includes('UI_RESPONSIVE_MARKDOWN_GEO_PANEL_PRESENTATION_FRAME_CLASSNAME') ||
    geoJsonGeoPanelRendererText.includes('w-[min(1200px') || geoJsonGeoPanelRendererText.includes('h-[min(720px') || geoJsonGeoPanelRendererText.includes('h-[120px]') ||
    geoJsonGeoPanelRendererText.includes('h-[320px]') ||
    geoJsonGeoPanelRendererText.includes('h-[420px]')
  ) {
    throw new Error('expected markdown GeoJSON preview frames to use shared responsive viewport-safe height owners instead of local fixed height literals')
  }

  if (!markdownInlineMenusText.includes('uiToolbarRowScrollListClassName') || markdownInlineMenusText.includes('flex flex-wrap gap-1')) {
    throw new Error('expected inline markdown selection menus to scroll on one toolbar-owned reset list row')
  }
}
