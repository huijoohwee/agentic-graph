import { staleCompactControlPaddingClass, staleCompactChipPaddingClass, staleCompactListRowPaddingClass, staleInlineChipPaddingClass, staleCompactFullWidthFieldSizingClass, staleCompactPanelFieldInputSizingClass, stalePanelTableFieldInputSizingClass, stalePanelInlineFieldSelectPaddingClass, stalePanelInlineFieldPaddingClass, stalePanelInlineNarrowFieldPaddingClass, staleStoryboardWidgetInlineValueSingleLineSizingClass, stalePanelTextActionButtonSizingClass, staleFlowManagerPanelHeaderPaddingClass, staleFlowManagerPanelHeaderRowGapClass, staleFlowManagerPanelBodyPaddingClasses, staleFlowManagerPanelFramePaddingClass, staleFlowManagerToolbarRowGapClass, staleFlowManagerActionMenuGapClass, staleFlowManagerWrappedActionMenuGapClass, staleFlowManagerSectionHeaderGapClass, staleFlowManagerSectionGridGapClass, staleFlowManagerActionGroupGapClass, staleFlowManagerInlineControlGapClass, staleFlowManagerStatusTextPaddingClass, staleFlowManagerStatusAlertPaddingClass, staleFlowManagerFooterRowPaddingClass, staleFlowManagerTableHeaderCellPaddingClass, staleFlowManagerTableActionHeaderCellPaddingClass, staleFlowManagerTableCellPaddingClass, staleFlowManagerFormFieldPaddingClass, staleFlowManagerFormFieldLocalFrameClass, staleFlowManagerRegistryItemPaddingClass, staleFlowManagerRegistryItemHeaderGapClass, staleFlowManagerRegistryItemWideGridGapClass, staleFlowManagerRegistryItemNarrowGridGapClass, staleFlowManagerRegistryTableHeaderCellPaddingClass, staleFlowManagerRegistryTableCellPaddingClass, staleFlowManagerRegistryTableEmptyCellPaddingClass, staleFlowManagerSpecEditorPaddingClass, staleColorSwatchSizingClass, staleDashedColorSwatchSizingClass, staleGraphFieldsListRowPaddingClass, staleGraphFieldsSampleRowPaddingClass, staleGraphFieldsFieldInputSizingClass, staleGraphFieldsFieldInputMinWidthSizingClass, staleGraphFieldsComfortableFieldInputSizingClass, staleGraphFieldsComfortableSelectSizingClass, staleGraphFieldsComfortableSchemaInputSizingClass, staleGraphFieldsPanelHeaderSizingClass, staleGraphFieldsListPanelSearchStripClass, staleGraphFieldsSearchStripClass, staleGraphFieldsNewFieldStripClass, staleGraphFieldsNewFieldInputShellPaddingClass, staleGraphFieldsNewFieldActionButtonSizingClass, staleGraphFieldsShortFieldInputWidthClass, staleGraphFieldsTypeSelectSizingClass, staleGraphFieldsValidationSelectPaddingClass, staleGraphFieldsOptionActionSizingClass, staleGraphFieldsOptionRowPaddingClass, staleGraphFieldsOptionDragHandlePaddingClass, staleGraphFieldsOptionSwatchMarginClass, staleGraphFieldsOptionActionMarginClass, type SourceFixture } from './sourceFixture'

export function assertPhase3(fixture: SourceFixture) {
  const { graphTableKanbanViewText, graphFieldsSettingsPanelText, graphFieldsPanelControlsText, graphFieldsTemplatesText, graphFieldsValidationText, graphFieldsLocalSchemaRowsText, graphFieldsLocalSchemaSectionBodyText, graphFieldsDefaultValueText, graphFieldsDecimalPlacesText, graphFieldsCurrencyText, graphFieldsSelectOptionsText, graphFieldIconsText, graphFieldsNewFieldFormText, graphFieldsSearchText, graphFieldsListPanelBodyText, graphFieldsListRowText, graphFieldsLayoutText, graphFieldsEndpointsAndCardinalityText, graphFieldsSamplesPanelText, schemaEditorBehaviorText, schemaEditorLayoutRoutingText, schemaEditorSerializationText, schemaUiEditorRowsText, widgetEditorParamsText, widgetEditorSchemaTableText, graphRagWorkflowSectionText, orchestratorTraversalPanelsText, datasetInspectorSectionText, graphStatsPanelText, graphStatsCommunitiesSectionText, graphStatsWordFrequenciesSectionText, graphStatsKeywordEntitiesSectionText, graphStatsEdgesSectionText, graphStatsNodeWordFrequenciesSectionText, graphStatsCentralitySectionText, settingsRegistryUiText, uiSliceInitialStateText, uiSliceCoreActionsText, floatingPanelChatSectionsText, chatModelCredentialControlsText, grabMapsDiscoveryWidgetSectionText, grabMapsDiscoverySettingsGridText, storyboardWidgetGraphTabText, storyboardWidgetMappingTabLayoutText, storyboardWidgetSpecificationTabText, widgetRegistryTableText, widgetRegistryFieldsEditorText, widgetRegistryPortsEditorText, widgetRegistrySchemaMappingsEditorText, storyboardWidgetMappingSettingsPanelText, storyboardWidgetInspectorText, storyboardWidgetInlineValueEditorText, widgetEditorFormText, widgetEditorRegistrySectionText, storyboardCanvasText, markdownSidebarSectionText, flowMappingRowsTableText, markdownDataViewKanbanCardText, markdownExplorerSectionText, markdownWorkspaceFileTreeText, markdownFileTreeRowButtonText, markdownWorkspaceBacklinkRowText, markdownTocTreeRowText, settingsUiText, threeViewBackgroundFogSectionText, threeViewStarfieldSectionText, panelKeyTypeColorTextValueRowText, iconHelpersText, responsiveElementClassesText, responsiveToolbarCssText, flowManagerFormEditorTexts, flowManagerPanelHeaderTexts, flowManagerPanelBodyTexts, colorSwatchConsumerTexts, compactSelectionControlsUseSharedOwner, smallSelectionControlsUseSharedOwner, defaultSelectionControlsUseSharedOwner, graphFieldsSampleControlsUseSharedOwner, panelCheckboxUsesSharedOwner, aiKgForceControlsDelegateToPanelCheckbox, compactSelectionControlsUseStaleSizing, smallSelectionControlsUseStaleSizing, defaultSelectionControlsUseStaleSizing, panelCheckboxKeepsLegacySizing } = fixture
  if (
    flowManagerPanelHeaderTexts.some(text => !text.includes('UI_RESPONSIVE_FLOW_MANAGER_PANEL_HEADER_CLASSNAME')) ||
    !storyboardWidgetGraphTabText.includes('UI_RESPONSIVE_FLOW_MANAGER_PANEL_HEADER_ROW_CLASSNAME') ||
    flowManagerPanelBodyTexts.some(text => !text.includes('UI_RESPONSIVE_FLOW_MANAGER_PANEL_BODY_CLASSNAME')) ||
    !storyboardWidgetMappingTabLayoutText.includes('UI_RESPONSIVE_FLOW_MANAGER_TOOLBAR_ROW_CLASSNAME') ||
    !storyboardWidgetSpecificationTabText.includes('UI_RESPONSIVE_FLOW_MANAGER_TOOLBAR_ROW_CLASSNAME') ||
    !storyboardWidgetMappingSettingsPanelText.includes('UI_RESPONSIVE_FLOW_MANAGER_TOOLBAR_ROW_CLASSNAME') ||
    !storyboardWidgetMappingTabLayoutText.includes('UI_RESPONSIVE_FLOW_MANAGER_ACTION_MENU_CLASSNAME') ||
    !storyboardWidgetSpecificationTabText.includes('UI_RESPONSIVE_FLOW_MANAGER_ACTION_MENU_CLASSNAME') ||
    !storyboardWidgetMappingSettingsPanelText.includes('UI_RESPONSIVE_FLOW_MANAGER_ACTION_MENU_CLASSNAME') ||
    !storyboardWidgetMappingSettingsPanelText.includes('UI_RESPONSIVE_FLOW_MANAGER_SECTION_HEADER_CLASSNAME') ||
    !storyboardWidgetMappingSettingsPanelText.includes('UI_RESPONSIVE_FLOW_MANAGER_SECTION_GRID_CLASSNAME') ||
    !storyboardWidgetMappingSettingsPanelText.includes('UI_RESPONSIVE_FLOW_MANAGER_ACTION_GROUP_CLASSNAME') ||
    !storyboardWidgetMappingTabLayoutText.includes('UI_RESPONSIVE_FLOW_MANAGER_INLINE_CONTROL_CLASSNAME') ||
    !storyboardWidgetMappingSettingsPanelText.includes('UI_RESPONSIVE_FLOW_MANAGER_INLINE_CONTROL_CLASSNAME') ||
    !widgetRegistryFieldsEditorText.includes('UI_RESPONSIVE_FLOW_MANAGER_INLINE_CONTROL_CLASSNAME') ||
    !storyboardWidgetSpecificationTabText.includes('UI_RESPONSIVE_FLOW_MANAGER_STATUS_TEXT_CLASSNAME') ||
    !storyboardWidgetMappingSettingsPanelText.includes('UI_RESPONSIVE_FLOW_MANAGER_STATUS_ALERT_CLASSNAME') ||
    !storyboardWidgetMappingSettingsPanelText.includes('UI_RESPONSIVE_FLOW_MANAGER_FOOTER_ROW_CLASSNAME') ||
    !storyboardWidgetGraphTabText.includes('UI_RESPONSIVE_FLOW_MANAGER_PANEL_FRAME_CLASSNAME') ||
    !storyboardWidgetGraphTabText.includes('UI_RESPONSIVE_FLOW_MANAGER_TABLE_FRAME_CLASSNAME') ||
    !widgetRegistryTableText.includes('UI_RESPONSIVE_FLOW_MANAGER_TABLE_NODE_TEXT_CLASSNAME') ||
    !widgetRegistryTableText.includes('UI_RESPONSIVE_FLOW_MANAGER_TABLE_EDITOR_TEXT_CLASSNAME') ||
    !widgetRegistryTableText.includes('UI_RESPONSIVE_FLOW_MANAGER_TABLE_FORM_TEXT_CLASSNAME') ||
    flowManagerFormEditorTexts.some(text => !text.includes('UI_RESPONSIVE_FLOW_MANAGER_FORM_FIELD_CLASSNAME')) ||
    [
      widgetRegistryFieldsEditorText,
      widgetRegistryPortsEditorText,
      widgetRegistrySchemaMappingsEditorText,
    ].some(text => !text.includes('UI_RESPONSIVE_FLOW_MANAGER_REGISTRY_ITEM_CLASSNAME')) ||
    [
      widgetRegistryFieldsEditorText,
      widgetRegistryPortsEditorText,
      widgetRegistrySchemaMappingsEditorText,
    ].some(text => !text.includes('UI_RESPONSIVE_FLOW_MANAGER_REGISTRY_ITEM_HEADER_CLASSNAME')) ||
    [
      widgetRegistryFieldsEditorText,
      widgetRegistryPortsEditorText,
      widgetRegistrySchemaMappingsEditorText,
    ].some(text => !text.includes('UI_RESPONSIVE_FLOW_MANAGER_REGISTRY_ITEM_GRID_CLASSNAME')) ||
    !flowMappingRowsTableText.includes('UI_RESPONSIVE_FLOW_MANAGER_TABLE_HEADER_CELL_CLASSNAME') ||
    !flowMappingRowsTableText.includes('UI_RESPONSIVE_FLOW_MANAGER_TABLE_ACTION_HEADER_CELL_CLASSNAME') ||
    !flowMappingRowsTableText.includes('UI_RESPONSIVE_FLOW_MANAGER_TABLE_CELL_CLASSNAME') ||
    !flowMappingRowsTableText.includes('UI_RESPONSIVE_FLOW_MANAGER_TABLE_ACTION_CELL_CLASSNAME') ||
    !flowMappingRowsTableText.includes('UI_RESPONSIVE_FLOW_MANAGER_TABLE_FIELD_CLASSNAME') ||
    !widgetRegistryTableText.includes('UI_RESPONSIVE_FLOW_MANAGER_REGISTRY_TABLE_HEADER_CELL_CLASSNAME') ||
    !widgetRegistryTableText.includes('UI_RESPONSIVE_FLOW_MANAGER_REGISTRY_TABLE_CELL_CLASSNAME') ||
    !widgetRegistryTableText.includes('UI_RESPONSIVE_FLOW_MANAGER_REGISTRY_TABLE_EMPTY_CELL_CLASSNAME') ||
    !responsiveElementClassesText.includes('UI_RESPONSIVE_FLOW_MANAGER_PANEL_HEADER_CLASSNAME') ||
    !responsiveElementClassesText.includes('UI_RESPONSIVE_FLOW_MANAGER_PANEL_HEADER_ROW_CLASSNAME') ||
    !responsiveElementClassesText.includes('UI_RESPONSIVE_FLOW_MANAGER_PANEL_BODY_CLASSNAME') ||
    !responsiveElementClassesText.includes('UI_RESPONSIVE_FLOW_MANAGER_PANEL_FRAME_CLASSNAME') ||
    !responsiveElementClassesText.includes('UI_RESPONSIVE_FLOW_MANAGER_TOOLBAR_ROW_CLASSNAME') ||
    !responsiveElementClassesText.includes('UI_RESPONSIVE_FLOW_MANAGER_ACTION_MENU_CLASSNAME') ||
    !responsiveElementClassesText.includes('UI_RESPONSIVE_FLOW_MANAGER_SECTION_HEADER_CLASSNAME') ||
    !responsiveElementClassesText.includes('UI_RESPONSIVE_FLOW_MANAGER_SECTION_GRID_CLASSNAME') ||
    !responsiveElementClassesText.includes('UI_RESPONSIVE_FLOW_MANAGER_ACTION_GROUP_CLASSNAME') ||
    !responsiveElementClassesText.includes('UI_RESPONSIVE_FLOW_MANAGER_INLINE_CONTROL_CLASSNAME') ||
    !responsiveElementClassesText.includes('UI_RESPONSIVE_FLOW_MANAGER_STATUS_TEXT_CLASSNAME') ||
    !responsiveElementClassesText.includes('UI_RESPONSIVE_FLOW_MANAGER_STATUS_ALERT_CLASSNAME') ||
    !responsiveElementClassesText.includes('UI_RESPONSIVE_FLOW_MANAGER_FOOTER_ROW_CLASSNAME') ||
    !responsiveElementClassesText.includes('UI_RESPONSIVE_FLOW_MANAGER_TABLE_HEADER_CELL_CLASSNAME') ||
    !responsiveElementClassesText.includes('UI_RESPONSIVE_FLOW_MANAGER_TABLE_ACTION_HEADER_CELL_CLASSNAME') ||
    !responsiveElementClassesText.includes('UI_RESPONSIVE_FLOW_MANAGER_TABLE_CELL_CLASSNAME') ||
    !responsiveElementClassesText.includes('UI_RESPONSIVE_FLOW_MANAGER_TABLE_ACTION_CELL_CLASSNAME') ||
    !responsiveElementClassesText.includes('UI_RESPONSIVE_FLOW_MANAGER_REGISTRY_TABLE_HEADER_CELL_CLASSNAME') ||
    !responsiveElementClassesText.includes('UI_RESPONSIVE_FLOW_MANAGER_REGISTRY_TABLE_CELL_CLASSNAME') ||
    !responsiveElementClassesText.includes('UI_RESPONSIVE_FLOW_MANAGER_REGISTRY_TABLE_EMPTY_CELL_CLASSNAME') ||
    !responsiveElementClassesText.includes('UI_RESPONSIVE_FLOW_MANAGER_TABLE_FIELD_CLASSNAME') ||
    !responsiveElementClassesText.includes('UI_RESPONSIVE_FLOW_MANAGER_FORM_FIELD_CLASSNAME') ||
    !responsiveElementClassesText.includes('UI_RESPONSIVE_FLOW_MANAGER_REGISTRY_ITEM_CLASSNAME') ||
    !responsiveElementClassesText.includes('UI_RESPONSIVE_FLOW_MANAGER_REGISTRY_ITEM_HEADER_CLASSNAME') ||
    !responsiveElementClassesText.includes('UI_RESPONSIVE_FLOW_MANAGER_REGISTRY_ITEM_GRID_CLASSNAME') ||
    !responsiveToolbarCssText.includes('.kg-flow-manager-panel-header') ||
    !responsiveToolbarCssText.includes('--kg-flow-manager-panel-header-padding-inline') ||
    !responsiveToolbarCssText.includes('--kg-flow-manager-panel-header-padding-block') ||
    !responsiveToolbarCssText.includes('.kg-flow-manager-panel-header-row') ||
    !responsiveToolbarCssText.includes('--kg-flow-manager-panel-header-row-gap') ||
    !responsiveToolbarCssText.includes('.kg-flow-manager-panel-body') ||
    !responsiveToolbarCssText.includes('--kg-flow-manager-panel-body-padding-inline') ||
    !responsiveToolbarCssText.includes('--kg-flow-manager-panel-body-padding-block') ||
    !responsiveToolbarCssText.includes('.kg-flow-manager-panel-frame') ||
    !responsiveToolbarCssText.includes('--kg-flow-manager-panel-frame-padding') ||
    !responsiveToolbarCssText.includes('.kg-flow-manager-toolbar-row') ||
    !responsiveToolbarCssText.includes('--kg-flow-manager-toolbar-row-gap') ||
    !responsiveToolbarCssText.includes('.kg-flow-manager-action-menu') ||
    !responsiveToolbarCssText.includes('--kg-flow-manager-action-menu-gap') ||
    !responsiveToolbarCssText.includes('.kg-flow-manager-section-header') ||
    !responsiveToolbarCssText.includes('--kg-flow-manager-section-header-gap') ||
    !responsiveToolbarCssText.includes('.kg-flow-manager-section-grid') ||
    !responsiveToolbarCssText.includes('--kg-flow-manager-section-grid-gap') ||
    !responsiveToolbarCssText.includes('.kg-flow-manager-action-group') ||
    !responsiveToolbarCssText.includes('--kg-flow-manager-action-group-gap') ||
    !responsiveToolbarCssText.includes('.kg-flow-manager-inline-control') ||
    !responsiveToolbarCssText.includes('--kg-flow-manager-inline-control-gap') ||
    !responsiveToolbarCssText.includes('.kg-flow-manager-status-text') ||
    !responsiveToolbarCssText.includes('--kg-flow-manager-status-text-padding-inline') ||
    !responsiveToolbarCssText.includes('--kg-flow-manager-status-text-padding-block-start') ||
    !responsiveToolbarCssText.includes('.kg-flow-manager-status-alert') ||
    !responsiveToolbarCssText.includes('--kg-flow-manager-status-alert-padding-inline') ||
    !responsiveToolbarCssText.includes('--kg-flow-manager-status-alert-padding-block') ||
    !responsiveToolbarCssText.includes('.kg-flow-manager-footer-row') ||
    !responsiveToolbarCssText.includes('--kg-flow-manager-footer-row-padding-block') ||
    !responsiveToolbarCssText.includes('.kg-flow-manager-table-header-cell') ||
    !responsiveToolbarCssText.includes('.kg-flow-manager-table-header-cell--actions') ||
    !responsiveToolbarCssText.includes('--kg-flow-manager-table-header-cell-padding-inline') ||
    !responsiveToolbarCssText.includes('--kg-flow-manager-table-header-cell-padding-block') ||
    !responsiveToolbarCssText.includes('.kg-flow-manager-table-cell') ||
    !responsiveToolbarCssText.includes('.kg-flow-manager-table-cell--actions') ||
    !responsiveToolbarCssText.includes('--kg-flow-manager-table-cell-padding-inline') ||
    !responsiveToolbarCssText.includes('--kg-flow-manager-table-cell-padding-block') ||
    !responsiveToolbarCssText.includes('.kg-flow-manager-registry-table-header-cell') ||
    !responsiveToolbarCssText.includes('--kg-flow-manager-registry-table-header-cell-padding-inline') ||
    !responsiveToolbarCssText.includes('--kg-flow-manager-registry-table-header-cell-padding-block') ||
    !responsiveToolbarCssText.includes('.kg-flow-manager-registry-table-cell') ||
    !responsiveToolbarCssText.includes('.kg-flow-manager-registry-table-cell--empty') ||
    !responsiveToolbarCssText.includes('--kg-flow-manager-registry-table-cell-padding-inline') ||
    !responsiveToolbarCssText.includes('--kg-flow-manager-registry-table-cell-padding-block') ||
    !responsiveToolbarCssText.includes('.kg-flow-manager-table-field') ||
    !responsiveToolbarCssText.includes('--kg-flow-manager-table-field-height') ||
    !responsiveToolbarCssText.includes('--kg-flow-manager-table-field-padding-inline') ||
    !responsiveToolbarCssText.includes('.kg-flow-manager-form-field') ||
    !responsiveToolbarCssText.includes('--kg-flow-manager-form-field-margin-block-start') ||
    !responsiveToolbarCssText.includes('--kg-flow-manager-form-field-padding-inline') ||
    !responsiveToolbarCssText.includes('--kg-flow-manager-form-field-padding-block') ||
    !responsiveToolbarCssText.includes('.kg-flow-manager-registry-item') ||
    !responsiveToolbarCssText.includes('--kg-flow-manager-registry-item-padding') ||
    !responsiveToolbarCssText.includes('.kg-flow-manager-registry-item-header') ||
    !responsiveToolbarCssText.includes('--kg-flow-manager-registry-item-header-gap') ||
    !responsiveToolbarCssText.includes('.kg-flow-manager-registry-item-grid') ||
    !responsiveToolbarCssText.includes('--kg-flow-manager-registry-item-grid-gap') ||
    !storyboardWidgetSpecificationTabText.includes('UI_RESPONSIVE_FLOW_MANAGER_SPEC_EDITOR_CLASSNAME') ||
    !responsiveToolbarCssText.includes('--kg-flow-manager-spec-editor-margin-block-start') ||
    !responsiveToolbarCssText.includes('--kg-flow-manager-spec-editor-padding-inline') ||
    !responsiveToolbarCssText.includes('--kg-flow-manager-spec-editor-padding-block') ||
    storyboardWidgetGraphTabText.includes('h-[360px]') ||
    storyboardWidgetGraphTabText.includes('min-h-[280px]') ||
    storyboardWidgetSpecificationTabText.includes('min-h-[320px]') ||
    flowManagerPanelHeaderTexts.some(text => text.includes(staleFlowManagerPanelHeaderPaddingClass())) ||
    storyboardWidgetGraphTabText.includes(staleFlowManagerPanelHeaderRowGapClass()) ||
    flowManagerPanelBodyTexts.some(text => staleFlowManagerPanelBodyPaddingClasses().some(className => text.includes(className))) ||
    storyboardWidgetGraphTabText.includes(staleFlowManagerPanelFramePaddingClass()) ||
    storyboardWidgetMappingTabLayoutText.includes(staleFlowManagerToolbarRowGapClass()) ||
    storyboardWidgetSpecificationTabText.includes(staleFlowManagerToolbarRowGapClass()) ||
    storyboardWidgetMappingSettingsPanelText.includes('sticky bottom-0 py-2 border-t flex items-center justify-between gap-2') ||
    storyboardWidgetMappingTabLayoutText.includes(staleFlowManagerWrappedActionMenuGapClass()) ||
    storyboardWidgetSpecificationTabText.includes(staleFlowManagerActionMenuGapClass()) ||
    storyboardWidgetMappingSettingsPanelText.includes(staleFlowManagerActionMenuGapClass()) ||
    storyboardWidgetMappingSettingsPanelText.includes(staleFlowManagerSectionHeaderGapClass()) ||
    storyboardWidgetMappingSettingsPanelText.includes(staleFlowManagerSectionGridGapClass()) ||
    storyboardWidgetMappingSettingsPanelText.includes(staleFlowManagerActionGroupGapClass()) ||
    [
      storyboardWidgetMappingTabLayoutText,
      storyboardWidgetMappingSettingsPanelText,
      widgetRegistryFieldsEditorText,
    ].some(text => text.includes(staleFlowManagerInlineControlGapClass())) ||
    storyboardWidgetSpecificationTabText.includes(staleFlowManagerStatusTextPaddingClass()) ||
    storyboardWidgetMappingSettingsPanelText.includes(staleFlowManagerStatusAlertPaddingClass()) ||
    storyboardWidgetMappingSettingsPanelText.includes(staleFlowManagerFooterRowPaddingClass()) ||
    flowMappingRowsTableText.includes(staleFlowManagerTableHeaderCellPaddingClass()) ||
    flowMappingRowsTableText.includes(staleFlowManagerTableActionHeaderCellPaddingClass()) ||
    flowMappingRowsTableText.includes(staleFlowManagerTableCellPaddingClass()) ||
    widgetRegistryTableText.includes(staleFlowManagerRegistryTableHeaderCellPaddingClass()) ||
    widgetRegistryTableText.includes(staleFlowManagerRegistryTableCellPaddingClass()) ||
    widgetRegistryTableText.includes(staleFlowManagerRegistryTableEmptyCellPaddingClass()) ||
    flowMappingRowsTableText.includes(staleCompactFullWidthFieldSizingClass()) ||
    flowManagerFormEditorTexts.some(text => text.includes(staleFlowManagerFormFieldPaddingClass())) ||
    flowManagerFormEditorTexts.some(text => text.includes(staleFlowManagerFormFieldLocalFrameClass())) ||
    storyboardWidgetSpecificationTabText.includes(staleFlowManagerSpecEditorPaddingClass()) ||
    [
      widgetRegistryFieldsEditorText,
      widgetRegistryPortsEditorText,
      widgetRegistrySchemaMappingsEditorText,
    ].some(text => text.includes(staleFlowManagerRegistryItemPaddingClass())) ||
    [
      widgetRegistryFieldsEditorText,
      widgetRegistryPortsEditorText,
      widgetRegistrySchemaMappingsEditorText,
    ].some(text => text.includes(staleFlowManagerRegistryItemHeaderGapClass())) ||
    [
      widgetRegistryFieldsEditorText,
      widgetRegistryPortsEditorText,
    ].some(text => text.includes(staleFlowManagerRegistryItemWideGridGapClass())) ||
    widgetRegistrySchemaMappingsEditorText.includes(staleFlowManagerRegistryItemNarrowGridGapClass()) ||
    widgetRegistryTableText.includes('max-w-[260px]') ||
    widgetRegistryTableText.includes('max-w-[180px]') ||
    widgetRegistryTableText.includes('max-w-[160px]')
  ) {
    throw new Error('expected Storyboard Widget manager table/spec panes, mapping fields, and registry cell widths to use shared responsive sizing classes')
  }

  if (
    !graphFieldsSettingsPanelText.includes('UI_RESPONSIVE_GRAPH_FIELDS_DESCRIPTION_EDITOR_CLASSNAME') ||
    !graphFieldsSettingsPanelText.includes('UI_RESPONSIVE_GRAPH_FIELDS_COMFORTABLE_FIELD_INPUT_CLASSNAME') ||
    !graphFieldsTemplatesText.includes('UI_RESPONSIVE_GRAPH_FIELDS_TEMPLATE_EDITOR_CLASSNAME') ||
    !graphFieldsValidationText.includes('UI_RESPONSIVE_GRAPH_FIELDS_VALIDATION_EDITOR_CLASSNAME') ||
    !graphFieldsValidationText.includes('UI_RESPONSIVE_GRAPH_FIELDS_FIELD_INPUT_CLASSNAME') ||
    !graphFieldsDefaultValueText.includes('UI_RESPONSIVE_GRAPH_FIELDS_DEFAULT_TEXT_EDITOR_CLASSNAME') ||
    !graphFieldsDefaultValueText.includes('UI_RESPONSIVE_GRAPH_FIELDS_DEFAULT_TEXT_EXPANDED_EDITOR_CLASSNAME') ||
    !graphFieldsDefaultValueText.includes('UI_RESPONSIVE_GRAPH_FIELDS_DEFAULT_JSON_EDITOR_CLASSNAME') ||
    !graphFieldsDefaultValueText.includes('UI_RESPONSIVE_GRAPH_FIELDS_FIELD_INPUT_CLASSNAME') ||
    !graphFieldsPanelControlsText.includes('UI_RESPONSIVE_GRAPH_FIELDS_FIELD_INPUT_CLASSNAME') ||
    !graphFieldsDecimalPlacesText.includes('GraphFieldsFieldSelect') ||
    !graphFieldsPanelControlsText.includes('UI_RESPONSIVE_GRAPH_FIELDS_SHORT_FIELD_INPUT_CLASSNAME') ||
    !graphFieldsCurrencyText.includes('GraphFieldsShortTextInput') ||
    !graphFieldsSelectOptionsText.includes('UI_RESPONSIVE_GRAPH_FIELDS_FIELD_INPUT_CLASSNAME') ||
    !graphFieldsLocalSchemaRowsText.includes('UI_RESPONSIVE_GRAPH_FIELDS_FIELD_INPUT_CLASSNAME') ||
    !graphFieldsListRowText.includes('UI_RESPONSIVE_GRAPH_FIELDS_FIELD_INPUT_CLASSNAME') ||
    !graphFieldsListRowText.includes('UI_RESPONSIVE_GRAPH_FIELDS_TYPE_SELECT_CLASSNAME') ||
    !graphFieldsNewFieldFormText.includes('UI_RESPONSIVE_GRAPH_FIELDS_INLINE_FIELD_CLASSNAME') ||
    !graphFieldsNewFieldFormText.includes('UI_RESPONSIVE_GRAPH_FIELDS_INLINE_FIELD_SHELL_CLASSNAME') ||
    !graphFieldsNewFieldFormText.includes('UI_RESPONSIVE_GRAPH_FIELDS_PANEL_STRIP_CLASSNAME') ||
    !graphFieldsNewFieldFormText.includes('UI_RESPONSIVE_PANEL_TEXT_ACTION_BUTTON_CLASSNAME') ||
    !graphFieldsSearchText.includes('UI_RESPONSIVE_GRAPH_FIELDS_INLINE_FIELD_SHELL_CLASSNAME') ||
    !graphFieldsSearchText.includes('UI_RESPONSIVE_GRAPH_FIELDS_INLINE_FIELD_CLASSNAME') ||
    !graphFieldsSearchText.includes('UI_RESPONSIVE_GRAPH_FIELDS_PANEL_STRIP_CLASSNAME') ||
    !graphFieldsListPanelBodyText.includes('UI_RESPONSIVE_GRAPH_FIELDS_INLINE_FIELD_SHELL_CLASSNAME') ||
    !graphFieldsListPanelBodyText.includes('UI_RESPONSIVE_GRAPH_FIELDS_INLINE_FIELD_CLASSNAME') ||
    !graphFieldsListPanelBodyText.includes('UI_RESPONSIVE_GRAPH_FIELDS_PANEL_STRIP_CLASSNAME') ||
    !graphFieldsListPanelBodyText.includes('UI_RESPONSIVE_GRAPH_FIELDS_LIST_ROW_CLASSNAME') ||
    !graphFieldsListPanelBodyText.includes('UI_RESPONSIVE_GRAPH_FIELDS_PANEL_HEADER_CLASSNAME') ||
    !graphFieldsSamplesPanelText.includes('UI_RESPONSIVE_GRAPH_FIELDS_PANEL_HEADER_CLASSNAME') ||
    !graphFieldsSamplesPanelText.includes('UI_RESPONSIVE_GRAPH_FIELDS_SAMPLE_ROW_CLASSNAME') ||
    !graphFieldsSelectOptionsText.includes('UI_RESPONSIVE_GRAPH_FIELDS_COMPACT_ICON_CELL_CLASSNAME') ||
    !graphFieldsSelectOptionsText.includes('UI_RESPONSIVE_GRAPH_FIELDS_OPTION_ROW_CLASSNAME') ||
    !graphFieldsSelectOptionsText.includes('UI_RESPONSIVE_GRAPH_FIELDS_OPTION_DRAG_HANDLE_CLASSNAME') ||
    !graphFieldsSelectOptionsText.includes('UI_RESPONSIVE_GRAPH_FIELDS_OPTION_SWATCH_CLASSNAME') ||
    !graphFieldsSelectOptionsText.includes('UI_RESPONSIVE_GRAPH_FIELDS_OPTION_ACTION_CLASSNAME') ||
    !graphFieldsListRowText.includes('UI_RESPONSIVE_GRAPH_FIELDS_COMPACT_ICON_CELL_CLASSNAME') ||
    !graphFieldsListRowText.includes('UI_RESPONSIVE_GRAPH_FIELDS_LIST_ROW_CLASSNAME') ||
    !graphFieldIconsText.includes('UI_RESPONSIVE_DEFAULT_GLYPH_CLASSNAME') ||
    !graphFieldIconsText.includes('graphFieldIconDefaultClassName') ||
    !graphFieldsLayoutText.includes('UI_RESPONSIVE_GRAPH_FIELDS_OWNER_VALUE_CLASSNAME') ||
    !graphFieldsEndpointsAndCardinalityText.includes('UI_RESPONSIVE_GRAPH_FIELDS_OWNER_VALUE_CLASSNAME') ||
    !graphFieldsEndpointsAndCardinalityText.includes('UI_RESPONSIVE_GRAPH_FIELDS_COMFORTABLE_FIELD_INPUT_CLASSNAME') ||
    !graphFieldsLocalSchemaSectionBodyText.includes('UI_RESPONSIVE_GRAPH_FIELDS_COMFORTABLE_FIELD_INPUT_CLASSNAME') ||
    [
      graphFieldsSettingsPanelText,
      graphFieldsTemplatesText,
      graphFieldsValidationText,
      graphFieldsDefaultValueText,
    ].some(text => ['h-[84px]', 'h-[92px]', 'h-[116px]', 'h-[140px]', 'h-[168px]', 'h-[216px]'].some(snippet => text.includes(snippet))) ||
    [graphFieldsLayoutText, graphFieldsEndpointsAndCardinalityText].some(text => text.includes('w-40 truncate')) ||
    graphFieldsDefaultValueText.includes('h-8 w-full rounded border') ||
    graphFieldsDecimalPlacesText.includes('h-8 rounded border') ||
    graphFieldsCurrencyText.includes('h-8 w-24 rounded border') ||
    graphFieldsCurrencyText.includes(staleGraphFieldsShortFieldInputWidthClass()) ||
    graphFieldsSelectOptionsText.includes('h-8 flex-1 rounded border') ||
    graphFieldsValidationText.includes(staleGraphFieldsValidationSelectPaddingClass()) ||
    graphFieldsLocalSchemaRowsText.includes(staleGraphFieldsFieldInputSizingClass()) ||
    graphFieldsListRowText.includes(staleGraphFieldsFieldInputMinWidthSizingClass()) ||
    graphFieldsListRowText.includes(staleGraphFieldsTypeSelectSizingClass()) ||
    graphFieldsSelectOptionsText.includes(staleGraphFieldsOptionActionSizingClass()) ||
    graphFieldsSelectOptionsText.includes(staleGraphFieldsOptionRowPaddingClass()) ||
    graphFieldsSelectOptionsText.includes(staleGraphFieldsOptionDragHandlePaddingClass()) ||
    graphFieldsSelectOptionsText.includes(staleGraphFieldsOptionSwatchMarginClass()) ||
    graphFieldsSelectOptionsText.includes(staleGraphFieldsOptionActionMarginClass()) ||
    [graphFieldsSettingsPanelText, graphFieldsEndpointsAndCardinalityText].some(text => text.includes(staleGraphFieldsComfortableFieldInputSizingClass())) ||
    graphFieldsSettingsPanelText.includes(staleGraphFieldsComfortableSelectSizingClass()) ||
    graphFieldsLocalSchemaSectionBodyText.includes(staleGraphFieldsComfortableSchemaInputSizingClass()) ||
    [graphFieldsListPanelBodyText, graphFieldsSamplesPanelText].some(text => text.includes(staleGraphFieldsPanelHeaderSizingClass())) ||
    graphFieldsNewFieldFormText.includes(staleGraphFieldsNewFieldStripClass()) ||
    graphFieldsNewFieldFormText.includes(staleGraphFieldsNewFieldInputShellPaddingClass()) ||
    graphFieldsNewFieldFormText.includes(staleGraphFieldsNewFieldActionButtonSizingClass()) ||
    graphFieldsSearchText.includes(staleGraphFieldsSearchStripClass()) ||
    graphFieldsListPanelBodyText.includes(staleGraphFieldsListPanelSearchStripClass()) ||
    graphFieldsNewFieldFormText.includes('h-8 w-full bg-transparent text-xs') ||
    graphFieldsNewFieldFormText.includes('h-8 w-full text-left') ||
    graphFieldsSearchText.includes('h-8 flex items-center gap-2') ||
    graphFieldsSearchText.includes('h-8 w-full bg-transparent text-xs') ||
    graphFieldsListPanelBodyText.includes('h-8 flex items-center gap-2') ||
    graphFieldsListPanelBodyText.includes('h-8 w-full bg-transparent text-xs') ||
    graphFieldsListPanelBodyText.includes(staleGraphFieldsListRowPaddingClass()) ||
    graphFieldsSamplesPanelText.includes(staleGraphFieldsSampleRowPaddingClass()) ||
    graphFieldsSelectOptionsText.includes('h-6 w-6') ||
    graphFieldsListRowText.includes('h-6 w-6') ||
    graphFieldsListRowText.includes(staleGraphFieldsListRowPaddingClass()) ||
    graphFieldIconsText.includes('w-4 h-4') ||
    graphFieldIconsText.includes('h-4 w-4') ||
    graphFieldIconsText.includes('16px')
  ) {
    throw new Error('expected Graph Fields Monaco editor heights, field inputs, comfortable field inputs, short field inputs, type selects, inline text fields, panel headers, panel strips, text action buttons, list rows, option actions, compact icon cells, default icon glyphs, and owner value widths to live in shared responsive owner classes')
  }

  if (
    !schemaEditorSerializationText.includes('UI_RESPONSIVE_SCHEMA_EDITOR_SERIALIZATION_COMPACT_EDITOR_CLASSNAME') ||
    !schemaEditorSerializationText.includes('UI_RESPONSIVE_SCHEMA_EDITOR_SERIALIZATION_EDITOR_CLASSNAME') ||
    ['h-[92px]', 'h-[120px]'].some(snippet => schemaEditorSerializationText.includes(snippet))
  ) {
    throw new Error('expected schema serialization editor heights to live in shared responsive owner classes')
  }

  if (
    !floatingPanelChatSectionsText.includes('UI_RESPONSIVE_MULTILINE_TEXT_INPUT_EDITOR_CLASSNAME') || !floatingPanelChatSectionsText.includes('UI_RESPONSIVE_CHAT_MESSAGE_BUBBLE_CLASSNAME') ||
    !responsiveToolbarCssText.includes('.kg-floating-chat-message-bubble') || !grabMapsDiscoveryWidgetSectionText.includes('UI_RESPONSIVE_MULTILINE_TEXT_INPUT_EDITOR_CLASSNAME') ||
    floatingPanelChatSectionsText.includes('max-w-[85%]') || [floatingPanelChatSectionsText, grabMapsDiscoveryWidgetSectionText].some(text => text.includes('h-[88px]'))
  ) {
    throw new Error('expected chat message bubble width and chat/discovery multiline text input editor heights to live in shared responsive owner classes')
  }

  if (
    !['UI_RESPONSIVE_COMPACT_PANEL_FIELD_INPUT_CLASSNAME', 'UI_RESPONSIVE_CONTROL_COMPACT_VALUE_ROW_CLASSNAME', 'UI_RESPONSIVE_CONTROL_INLINE_FILL_CLASSNAME', 'htmlFor={chatModelSelectId}', 'data-kg-chat-model-select="true"'].every(snippet => chatModelCredentialControlsText.includes(snippet)) ||
    !grabMapsDiscoverySettingsGridText.includes('UI_RESPONSIVE_COMPACT_PANEL_FIELD_INPUT_CLASSNAME') ||
    !responsiveToolbarCssText.includes('.kg-responsive-compact-panel-field-input') ||
    !responsiveToolbarCssText.includes('--kg-responsive-compact-panel-field-input-height') ||
    !responsiveToolbarCssText.includes('--kg-responsive-compact-panel-field-input-padding-inline') ||
    chatModelCredentialControlsText.includes('h-7 px-2') ||
    grabMapsDiscoverySettingsGridText.includes(staleCompactPanelFieldInputSizingClass())
  ) {
    throw new Error('expected compact panel field input sizing to live in the shared responsive owner class')
  }

  if (
    !widgetEditorSchemaTableText.includes('UI_RESPONSIVE_PANEL_TABLE_FIELD_INPUT_CLASSNAME') || !widgetEditorSchemaTableText.includes('UI_RESPONSIVE_PANEL_TABLE_ICON_ACTION_CLASSNAME') ||
    !responsiveToolbarCssText.includes('.kg-responsive-panel-table-field-input') || !responsiveToolbarCssText.includes('.kg-responsive-panel-table-icon-action') ||
    !responsiveToolbarCssText.includes('--kg-responsive-panel-table-field-input-height') ||
    !responsiveToolbarCssText.includes('--kg-responsive-panel-table-field-input-padding-inline') ||
    widgetEditorSchemaTableText.includes(stalePanelTableFieldInputSizingClass()) || widgetEditorSchemaTableText.includes("style={{ width: '32px', height: '32px' }}")
  ) {
    throw new Error('expected panel table field input sizing to live in the shared responsive owner class')
  }

  if (
    !schemaUiEditorRowsText.includes('UI_RESPONSIVE_SCHEMA_RULES_TEXT_EDITOR_CLASSNAME') ||
    !schemaUiEditorRowsText.includes('UI_RESPONSIVE_SCHEMA_PROPERTY_NAME_CLASSNAME') ||
    !schemaUiEditorRowsText.includes('UI_RESPONSIVE_PANEL_INLINE_FIELD_CLASSNAME') ||
    !schemaEditorBehaviorText.includes('UI_RESPONSIVE_PANEL_INLINE_FIELD_CLASSNAME') ||
    !schemaEditorLayoutRoutingText.includes('UI_RESPONSIVE_PANEL_INLINE_FIELD_CLASSNAME') ||
    !graphFieldsValidationText.includes('UI_RESPONSIVE_SCHEMA_PROPERTY_NAME_CLASSNAME') ||
    schemaUiEditorRowsText.includes('min-h-[120px]') ||
    [schemaUiEditorRowsText, graphFieldsValidationText].some(text => text.includes('w-24 truncate')) ||
    [schemaEditorBehaviorText, schemaEditorLayoutRoutingText].some(text => text.includes(stalePanelInlineFieldSelectPaddingClass())) ||
    schemaUiEditorRowsText.includes(stalePanelInlineFieldPaddingClass()) ||
    schemaUiEditorRowsText.includes(stalePanelInlineNarrowFieldPaddingClass())
  ) {
    throw new Error('expected schema inline fields, rules editor height, and schema property-name widths to live in shared responsive owner classes')
  }

  if (
    !widgetEditorParamsText.includes('UI_RESPONSIVE_PANEL_CODE_EDITOR_TALL_FRAME_CLASSNAME') ||
    !widgetEditorParamsText.includes('UI_RESPONSIVE_PANEL_TEXT_ACTION_BUTTON_CLASSNAME') ||
    !graphRagWorkflowSectionText.includes('UI_RESPONSIVE_PANEL_CODE_EDITOR_FRAME_CLASSNAME') ||
    !graphRagWorkflowSectionText.includes('UI_RESPONSIVE_GRAPH_RAG_WORKFLOW_TOKEN_CLASSNAME') ||
    !graphRagWorkflowSectionText.includes('UI_RESPONSIVE_GRAPH_RAG_WORKFLOW_COMPACT_TOKEN_CLASSNAME') ||
    !orchestratorTraversalPanelsText.includes('UI_RESPONSIVE_PANEL_CODE_EDITOR_FRAME_CLASSNAME') ||
    widgetEditorParamsText.includes('min-h-[140px]') ||
    widgetEditorParamsText.includes(stalePanelTextActionButtonSizingClass()) ||
    graphRagWorkflowSectionText.includes('min-h-[96px]') ||
    graphRagWorkflowSectionText.includes('max-w-[120px]') ||
    graphRagWorkflowSectionText.includes('max-w-[100px]') ||
    orchestratorTraversalPanelsText.includes('min-h-[96px]')
  ) {
    throw new Error('expected panel code editor frame heights, panel text action buttons, and GraphRAG workflow summary token widths to live in shared responsive owner classes')
  }

  if (
    !storyboardWidgetInspectorText.includes('UI_RESPONSIVE_PANEL_CODE_EDITOR_FRAME_CLASSNAME') ||
    !storyboardWidgetInspectorText.includes('UI_RESPONSIVE_PANEL_CODE_EDITOR_COMPACT_FRAME_CLASSNAME') ||
    !storyboardWidgetInspectorText.includes('UI_RESPONSIVE_PANEL_CODE_EDITOR_LARGE_FRAME_CLASSNAME') ||
    !storyboardWidgetInlineValueEditorText.includes('UI_RESPONSIVE_PANEL_INLINE_FIELD_CLASSNAME') ||
    !widgetEditorRegistrySectionText.includes('UI_RESPONSIVE_PANEL_CODE_EDITOR_FRAME_CLASSNAME') ||
    storyboardWidgetInlineValueEditorText.includes('UI_RESPONSIVE_PANEL_CODE_EDITOR_FRAME_CLASSNAME') ||
    storyboardWidgetInlineValueEditorText.includes('whitespace-pre-wrap break-words') ||
    storyboardWidgetInlineValueEditorText.includes(staleStoryboardWidgetInlineValueSingleLineSizingClass()) ||
    [storyboardWidgetInspectorText, storyboardWidgetInlineValueEditorText, widgetEditorRegistrySectionText].some(text =>
      ['h-20 px-2 py-1', 'h-24 px-2 py-1', 'h-28 px-2 py-1', 'min-h-24 px-2 py-1'].some(snippet => text.includes(snippet))
    )
  ) {
    throw new Error('expected Storyboard Widget inspector, inline value, and registry editor sizing to reuse shared responsive panel owner classes')
  }

  if (
    [storyboardCanvasText, storyboardWidgetInspectorText, graphTableKanbanViewText, markdownDataViewKanbanCardText].some(text =>
      !text.includes('UI_RESPONSIVE_CARD_TITLE_EDITOR_CLASSNAME') ||
      !text.includes('UI_RESPONSIVE_CARD_MULTILINE_EDITOR_CLASSNAME') ||
      text.includes('min-h-[1.5rem]') ||
      text.includes('min-h-[4.5rem]')
    ) ||
    responsiveElementClassesText.includes('UI_RESPONSIVE_STORYBOARD_TITLE_EDITOR_CLASSNAME') ||
    responsiveElementClassesText.includes('UI_RESPONSIVE_STORYBOARD_MULTILINE_EDITOR_CLASSNAME') ||
    responsiveToolbarCssText.includes('.kg-storyboard-title-editor') ||
    responsiveToolbarCssText.includes('.kg-storyboard-multiline-editor')
  ) {
    throw new Error('expected shared card title and multiline editor sizing to use neutral card editor owners across Storyboard, Flow Inspector, and Kanban surfaces')
  }

  if (
    !settingsUiText.includes('UI_RESPONSIVE_PANEL_CODE_EDITOR_FRAME_CLASSNAME') ||
    !settingsUiText.includes('UI_RESPONSIVE_PANEL_CODE_EDITOR_SMALL_FRAME_CLASSNAME') ||
    widgetEditorFormText.includes('UI_RESPONSIVE_PANEL_CODE_EDITOR_FRAME_CLASSNAME') ||
    widgetEditorFormText.includes("'h-24'") ||
    settingsUiText.includes('min-h-24') ||
    settingsUiText.includes('min-h-16')
  ) {
    throw new Error('expected Flow envelope inline values to defer density to shared panel primitives while settings textareas use shared responsive panel code editor frames')
  }

  if (
    !settingsUiText.includes('UI_RESPONSIVE_COLOR_SWATCH_DASHED_CLASSNAME') ||
    !colorSwatchConsumerTexts.every(text => text.includes('PanelColorPicker')) ||
    !panelKeyTypeColorTextValueRowText.includes('PanelColorPicker') ||
    ![threeViewBackgroundFogSectionText, threeViewStarfieldSectionText].every(text => text.includes('PanelKeyTypeColorTextValueRow')) ||
    colorSwatchConsumerTexts.some(text =>
      text.includes(staleColorSwatchSizingClass()) ||
      text.includes(staleDashedColorSwatchSizingClass())
    )
  ) {
    throw new Error('expected settings, renderer palette, Three view, and Graph Fields color swatches to use the shared responsive color swatch owner')
  }

  if (
    !compactSelectionControlsUseSharedOwner ||
    !smallSelectionControlsUseSharedOwner ||
    !defaultSelectionControlsUseSharedOwner ||
    !graphFieldsSampleControlsUseSharedOwner ||
    !panelCheckboxUsesSharedOwner ||
    !aiKgForceControlsDelegateToPanelCheckbox ||
    compactSelectionControlsUseStaleSizing ||
    smallSelectionControlsUseStaleSizing ||
    defaultSelectionControlsUseStaleSizing ||
    panelCheckboxKeepsLegacySizing
  ) {
    throw new Error('expected toolbar, graph-data-table, Graph Fields, and Three view selection controls to use the shared responsive selection control owner')
  }

  if (
    !graphStatsCommunitiesSectionText.includes('UI_RESPONSIVE_STATS_TOKEN_CHART_SLOT_CLASSNAME') ||
    !graphStatsWordFrequenciesSectionText.includes('UI_RESPONSIVE_STATS_TOKEN_CHART_SLOT_CLASSNAME') ||
    graphStatsCommunitiesSectionText.includes('min-h-[72px]') ||
    graphStatsWordFrequenciesSectionText.includes('min-h-[72px]')
  ) {
    throw new Error('expected graph-stats token chart slot sizing to live in the shared responsive owner class')
  }

  if (
    !graphStatsPanelText.includes('UI_RESPONSIVE_COMPACT_INLINE_CONTROL_CLASSNAME') ||
    !graphStatsCommunitiesSectionText.includes('UI_RESPONSIVE_COMPACT_INLINE_CONTROL_CLASSNAME') ||
    !graphStatsCommunitiesSectionText.includes('UI_RESPONSIVE_COMPACT_INLINE_CHIP_CLASSNAME') ||
    !graphStatsWordFrequenciesSectionText.includes('UI_RESPONSIVE_COMPACT_INLINE_CONTROL_CLASSNAME') ||
    !graphStatsWordFrequenciesSectionText.includes('UI_RESPONSIVE_COMPACT_INLINE_CHIP_CLASSNAME') ||
    !graphStatsKeywordEntitiesSectionText.includes('UI_RESPONSIVE_COMPACT_INLINE_CONTROL_CLASSNAME') ||
    !graphStatsEdgesSectionText.includes('UI_RESPONSIVE_COMPACT_INLINE_CONTROL_CLASSNAME') ||
    !graphStatsNodeWordFrequenciesSectionText.includes('UI_RESPONSIVE_COMPACT_INLINE_CHIP_CLASSNAME') ||
    !graphStatsCentralitySectionText.includes('UI_RESPONSIVE_COMPACT_INLINE_CONTROL_CLASSNAME') ||
    !datasetInspectorSectionText.includes('UI_RESPONSIVE_COMPACT_INLINE_CONTROL_CLASSNAME') ||
    !datasetInspectorSectionText.includes('UI_RESPONSIVE_MICRO_INLINE_CHIP_CLASSNAME') ||
    [
      graphStatsPanelText,
      graphStatsCommunitiesSectionText,
      graphStatsWordFrequenciesSectionText,
      graphStatsKeywordEntitiesSectionText,
      graphStatsEdgesSectionText,
      graphStatsNodeWordFrequenciesSectionText,
      graphStatsCentralitySectionText,
      datasetInspectorSectionText,
    ].some(text => text.includes(staleCompactControlPaddingClass())) ||
    datasetInspectorSectionText.includes(staleCompactChipPaddingClass()) || !datasetInspectorSectionText.includes("DATASET_INSPECTOR_STATS_GRID_CLASS_NAME = 'grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-3'") || datasetInspectorSectionText.includes('grid grid-cols-3 gap-2')
  ) {
    throw new Error('expected compact inline controls, chips, and Dataset Inspector stats grid to live in responsive owner classes')
  }

  if (
    !markdownFileTreeRowButtonText.includes('UI_RESPONSIVE_COMPACT_LIST_ROW_CLASSNAME') ||
    !markdownTocTreeRowText.includes('UI_RESPONSIVE_COMPACT_LIST_ROW_CLASSNAME') ||
    !markdownExplorerSectionText.includes('UI_RESPONSIVE_COMPACT_GLYPH_CLASSNAME') ||
    !markdownWorkspaceFileTreeText.includes('UI_RESPONSIVE_COMPACT_GLYPH_CLASSNAME') ||
    !markdownSidebarSectionText.includes('UI_RESPONSIVE_COMPACT_GLYPH_CLASSNAME') ||
    !markdownWorkspaceBacklinkRowText.includes('UI_RESPONSIVE_COMPACT_GLYPH_CLASSNAME') ||
    !markdownTocTreeRowText.includes('UI_RESPONSIVE_COMPACT_GLYPH_CLASSNAME') ||
    [markdownFileTreeRowButtonText, markdownTocTreeRowText].some(text => text.includes(staleCompactListRowPaddingClass())) ||
    [markdownExplorerSectionText, markdownWorkspaceFileTreeText, markdownSidebarSectionText, markdownWorkspaceBacklinkRowText, markdownTocTreeRowText].some(text =>
      text.includes('w-3 h-3 shrink-0') ||
      text.includes('iconClassName="w-3 h-3"') ||
      text.includes('className="w-3 h-3"') ||
      text.includes('w-3 h-3 mt-[2px]')
    )
  ) {
    throw new Error('expected compact markdown explorer, sidebar, backlink, and TOC row padding/glyph sizing to live in shared responsive owners')
  }

  if (
    !iconHelpersText.includes('UI_RESPONSIVE_COMPACT_GLYPH_CLASSNAME') ||
    !iconHelpersText.includes('UI_RESPONSIVE_DEFAULT_GLYPH_CLASSNAME') ||
    !iconHelpersText.includes('UI_RESPONSIVE_CHIP_CLASSNAME') ||
    !iconHelpersText.includes('UI_RESPONSIVE_BADGE_CHIP_CLASSNAME') ||
    !iconHelpersText.includes('normalizeBadgeChipBaseClassName') ||
    !settingsUiText.includes('UI_RESPONSIVE_BADGE_CHIP_DEFAULT_CLASSNAME') ||
    !settingsRegistryUiText.includes('UI_RESPONSIVE_BADGE_CHIP_DEFAULT_CLASSNAME') ||
    !uiSliceInitialStateText.includes('normalizeBadgeChipBaseClassName') ||
    !uiSliceCoreActionsText.includes('normalizeBadgeChipBaseClassName') ||
    [iconHelpersText, settingsUiText, settingsRegistryUiText, uiSliceInitialStateText, uiSliceCoreActionsText].some(text => text.includes(staleCompactChipPaddingClass())) ||
    iconHelpersText.includes(staleInlineChipPaddingClass()) ||
    iconHelpersText.includes("return 'w-3 h-3'") ||
    iconHelpersText.includes("return 'w-4 h-4'") ||
    iconHelpersText.includes('return "w-3 h-3"') ||
    iconHelpersText.includes('return "w-4 h-4"')
  ) {
    throw new Error('expected settings, icon glyph sizing, and icon chip spacing defaults to use shared responsive owners')
  }
}
