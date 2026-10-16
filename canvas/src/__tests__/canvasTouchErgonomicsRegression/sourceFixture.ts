import fs from 'node:fs'
import path from 'node:path'
export { fs, path }
export const readUtf8 = (filePath: string): string => fs.readFileSync(filePath, 'utf8')
export const staleContentStartUtility = (prefix: 'left' | 'pl'): string => `${prefix}-[44px]`
export const staleMarkdownGutterContentStartAlias = (): string => ['MARKDOWN_BLOCK_GUTTER_CONTENT_START', 'LEFT_CLASS'].join('_')
export const staleCompactControlPaddingClass = (): string => `${'px'}-2 ${'py'}-[2px]`
export const staleCompactChipPaddingClass = (): string => `${'px'}-1 ${'py'}-[1px]`
export const staleCompactListRowPaddingClass = (): string => `${'px'}-1 ${'py'}-[2px]`
export const staleInlineChipPaddingClass = (): string => `${'px'}-1.5 ${'py'}-[1px]`
export const staleBracketMicroChipPaddingClass = (): string => `${'px'}-[4px] ${'py'}-[1px]`
export const staleInlineStatusChipPaddingClass = (): string => `${'px'}-2 ${'py'}-[1px]`
export const stalePanelStickyOverlapClass = (): string => `${'-top'}-[2px]`
export const staleDataViewSmallActionSizingClass = (): string => `${'h'}-7 ${'px'}-2`
export const staleDataViewDefaultActionSizingClass = (): string => `${'h'}-8 ${'px'}-3`
export const staleDataViewDefaultActionPaddingFirstClass = (): string => `${'px'}-3 ${'h'}-8`
export const staleDataViewPropertyRowPaddingClass = (): string => `${'px'}-2 ${'py'}-1 rounded border`
export const staleDataViewSearchFormSizingClass = (): string => `kg-data-view-search-form flex min-w-0 max-w-full items-center gap-2 ${'px'}-2 ${'py'}-1 rounded border`
export const staleDataViewSmallIconSizingClass = (): string => `${'h'}-7 ${'w'}-7`
export const staleDataViewDefaultIconSizingClass = (): string => `${'h'}-8 ${'w'}-8`
export const staleDataViewSmallIconWidthFirstClass = (): string => `${'w'}-7 ${'h'}-7`
export const staleDataViewDefaultIconWidthFirstClass = (): string => `${'w'}-8 ${'h'}-8`
export const staleSmallIconActionHeightFirstClass = (): string => `${'h'}-7 ${'w'}-7`
export const staleGraphDataTableHeaderHeightClass = (): string => `${'h'}-8`
export const staleGraphDataTableInputSizingClass = (): string => `${'h'}-7 w-full ${'px'}-2`
export const staleGraphDataTableBodyCellPaddingClass = (): string => `${'px'}-2 ${'py'}-1`
export const staleGraphDataTableIndexWidthClass = (): string => `${'w'}-8`
export const staleGraphDataTableIndexColStyle = (): string => `style={{ width: ${'32'} }}`
export const staleMediaOverlaySmallActionSizingClass = (): string => `${'inline'}-flex h-7 w-7 items-center justify-center`
export const staleMediaOverlayDefaultActionSizingClass = (): string => `${'inline'}-flex h-8 w-8 items-center justify-center`
export const staleMenuIconActionSizingClass = (): string => `items-center justify-center ${'w'}-8 ${'h'}-8 rounded border`
export const staleColumnHeaderFilterActionSizingClass = (): string => `${'h'}-7 ${'px'}-2 rounded border`
export const staleColumnHeaderFilterFieldSizingClass = (): string => `${'h'}-7 min-w-0 ${'px'}-2 rounded border flex-1`
export const staleSmallIconActionSizingClass = (): string => `${'inline'}-flex items-center justify-center ${'w'}-7 ${'h'}-7`
export const staleCompactFullWidthFieldSizingClass = (): string => `${'w'}-full ${'h'}-7 ${'px'}-2`
export const staleCompactPanelFieldInputSizingClass = (): string => `${'h'}-7 ${'w'}-full rounded border ${'px'}-2`
export const stalePanelTableFieldInputSizingClass = (): string => `${'w'}-full ${'h'}-8 rounded-md ${'px'}-2`
export const stalePanelInlineFieldSelectPaddingClass = (): string => `${'px'}-2 ${'py'}-1 text-xs border`
export const stalePanelInlineFieldPaddingClass = (): string => `${'px'}-2 ${'py'}-1 rounded border`
export const stalePanelInlineNarrowFieldPaddingClass = (): string => `${'px'}-1 ${'py'}-1 text-xs rounded border`
export const staleStoryboardWidgetInlineValueSingleLineSizingClass = (): string => `${'min'}-h-7 ${'px'}-2 ${'py'}-1 truncate`
export const stalePanelTextActionButtonSizingClass = (): string => `shrink-0 rounded border ${'px'}-2 ${'py'}-1`
export const staleFlowManagerPanelHeaderPaddingClass = (): string => `${'px'}-3 ${'py'}-2 border-b`
export const staleFlowManagerPanelHeaderRowGapClass = (): string => `flex items-center justify-between ${'gap'}-3`
export const staleFlowManagerPanelBodyPaddingClasses = (): string[] => [
  `${'p'}-3 min-h-0 h-full overflow-hidden`,
  `h-full min-h-0 ${'p'}-3`,
  `overflow-auto ${'p'}-3`,
  `overflow-hidden ${'p'}-3`,
]
export const staleFlowManagerPanelFramePaddingClass = (): string => `rounded border ${'p'}-2`
export const staleFlowManagerToolbarRowGapClass = (): string => `flex flex-wrap items-center justify-between ${'gap'}-2`
export const staleFlowManagerActionMenuGapClass = (): string => `m-0 p-0 list-none flex items-center ${'gap'}-1`
export const staleFlowManagerWrappedActionMenuGapClass = (): string => `m-0 p-0 list-none flex flex-wrap items-center ${'gap'}-1`
export const staleFlowManagerSectionHeaderGapClass = (): string => `flex items-center justify-between ${'gap'}-2`
export const staleFlowManagerSectionGridGapClass = (): string => `grid grid-cols-1 sm:grid-cols-3 ${'gap'}-2`
export const staleFlowManagerActionGroupGapClass = (): string => `className="flex items-center ${'gap'}-2"`
export const staleFlowManagerInlineControlGapClass = (): string => `inline-flex items-center ${'gap'}-2`
export const staleFlowManagerStatusTextPaddingClass = (): string => `${'px'}-3 ${'pt'}-2`
export const staleFlowManagerStatusAlertPaddingClass = (): string => `rounded border ${'px'}-2 ${'py'}-2`
export const staleFlowManagerFooterRowPaddingClass = (): string => `sticky bottom-0 ${'py'}-2 border-t`
export const staleFlowManagerTableHeaderCellPaddingClass = (): string => `text-left ${'px'}-2 ${'py'}-2 text-xs font-semibold`
export const staleFlowManagerTableActionHeaderCellPaddingClass = (): string => `text-right ${'px'}-2 ${'py'}-2 text-xs font-semibold`
export const staleFlowManagerTableCellPaddingClass = (): string => `${'px'}-2 ${'py'}-1 align-top border-t`
export const staleFlowManagerFormFieldPaddingClass = (): string => `${'mt'}-1 w-full rounded border ${'px'}-2 ${'py'}-1`
export const staleFlowManagerFormFieldLocalFrameClass = (): string => `UI_RESPONSIVE_FLOW_MANAGER_FORM_FIELD_CLASSNAME, 'rounded border'`
export const staleFlowManagerRegistryItemPaddingClass = (): string => `rounded border ${'p'}-2`
export const staleFlowManagerRegistryItemHeaderGapClass = (): string => `flex items-center justify-between ${'gap'}-2`
export const staleFlowManagerRegistryItemWideGridGapClass = (): string => `grid grid-cols-1 sm:grid-cols-4 ${'gap'}-2`
export const staleFlowManagerRegistryItemNarrowGridGapClass = (): string => `grid grid-cols-1 sm:grid-cols-2 ${'gap'}-2`
export const staleFlowManagerRegistryTableHeaderCellPaddingClass = (): string => `text-left ${'px'}-3 ${'py'}-2 text-xs font-semibold`
export const staleFlowManagerRegistryTableCellPaddingClass = (): string => `${'px'}-3 ${'py'}-2`
export const staleFlowManagerRegistryTableEmptyCellPaddingClass = (): string => `${'px'}-3 ${'py'}-6 text-center`
export const staleFlowManagerSpecEditorPaddingClass = (): string => `${'mt'}-2 ${'${UI_RESPONSIVE_FLOW_MANAGER_SPEC_EDITOR_CLASSNAME}'} rounded-md border ${'px'}-2 ${'py'}-1`
export const staleSpotlightActionButtonPaddingClasses = (): string[] => [
  `${'px'}-2 ${'py'}-1 rounded`,
  `${'px'}-3 ${'py'}-1 rounded`,
]
export const stalePreviewZoomControlButtonPaddingClass = (): string => `${'px'}-2 ${'py'}-1 rounded border`
export const stalePreviewZoomControlsFixedHeightClass = (): string => `shrink-0 ${'h'}-10 ${'px'}-3`
export const staleColorSwatchSizingClass = (): string => `${'w'}-8 ${'h'}-6 p-0 border`
export const staleDashedColorSwatchSizingClass = (): string => `${'w'}-8 ${'h'}-6 rounded border border-dashed`
export const staleSelectionControlThemeBorderToken = (): string => ['${UI_THEME_TOKENS.input', 'border}'].join('.')
export const staleSelectionControlRoundedSizingClass = (): string => `${'h'}-3 ${'w'}-3 rounded ${staleSelectionControlThemeBorderToken()}`
export const staleSelectionControlRoundedWidthFirstClass = (): string => `${'w'}-3 ${'h'}-3 rounded ${staleSelectionControlThemeBorderToken()}`
export const staleSelectionControlBareSizingClass = (): string => `${'h'}-3 ${'w'}-3 ${staleSelectionControlThemeBorderToken()}`
export const staleSelectionControlSmallRoundedSizingClass = (): string => `${'h'}-3.5 ${'w'}-3.5 rounded ${staleSelectionControlThemeBorderToken()}`
export const staleSelectionControlSmallRoundedWidthFirstClass = (): string => `${'w'}-3.5 ${'h'}-3.5 rounded ${staleSelectionControlThemeBorderToken()}`
export const staleSelectionControlDefaultRoundedSizingClass = (): string => `${'h'}-4 ${'w'}-4 rounded ${staleSelectionControlThemeBorderToken()}`
export const staleSelectionControlDefaultBareSizingClass = (): string => `${'h'}-4 ${'w'}-4 ${staleSelectionControlThemeBorderToken()}`
export const staleGraphFieldsListRowPaddingClass = (): string => `${'px'}-2 ${'py'}-1.5`
export const staleGraphFieldsSampleRowPaddingClass = (): string => `${'px'}-1 ${'py'}-1 text-left`
export const staleGraphFieldsFieldInputSizingClass = (): string => `${'h'}-7 ${'w'}-full rounded border`
export const staleGraphFieldsFieldInputMinWidthSizingClass = (): string => `${'h'}-7 ${'w'}-full min-w-0 rounded border`
export const staleGraphFieldsComfortableFieldInputSizingClass = (): string => `${'h'}-9 ${'w'}-full rounded border`
export const staleGraphFieldsComfortableSelectSizingClass = (): string => `${'h'}-9 ${'w'}-full text-left`
export const staleGraphFieldsComfortableSchemaInputSizingClass = (): string => `${'h'}-9 rounded border`
export const staleGraphFieldsPanelHeaderSizingClass = (): string => `${'h'}-9 border-b`
export const staleGraphFieldsListPanelSearchStripClass = (): string => ['border-b ${UI_THEME_TOKENS.panel', 'border} p-2'].join('.')
export const staleGraphFieldsSearchStripClass = (): string => ['border-b ${UI_THEME_TOKENS.panel', 'border} ${UI_THEME_TOKENS.panel.headerBg} p-2'].join('.')
export const staleGraphFieldsNewFieldStripClass = (): string => ['border-b ${UI_THEME_TOKENS.panel', 'divider} ${UI_THEME_TOKENS.panel.bg} p-2'].join('.')
export const staleGraphFieldsNewFieldInputShellPaddingClass = (): string => ['${UI_THEME_TOKENS.input', 'bg} px-2 focus-within'].join('.')
export const staleGraphFieldsNewFieldActionButtonSizingClass = (): string => `${'App-toolbar__btn'} rounded border ${'px'}-2 ${'py'}-1`
export const staleGraphFieldsShortFieldInputWidthClass = (): string => `${'w'}-24 rounded border`
export const staleGraphFieldsTypeSelectSizingClass = (): string => `${'h'}-7 ${'w'}-44 shrink-0 text-left`
export const staleGraphFieldsValidationSelectPaddingClass = (): string => `${'px'}-2 ${'py'}-1 text-xs`
export const staleGraphFieldsOptionActionSizingClass = (): string => `${'py'}-1 ${'px'}-1.5 rounded-md ${'h'}-7 flex items-center`
export const staleGraphFieldsOptionRowPaddingClass = (): string => `flex ${'py'}-1 items-center group`
export const staleGraphFieldsOptionDragHandlePaddingClass = (): string => `${'p'}-2 flex cursor-grab`
export const staleGraphFieldsOptionSwatchMarginClass = (): string => `cursor-pointer ${'mx'}-1`
export const staleGraphFieldsOptionActionMarginClass = (): string => `${'mx'}-1 ${'${UI_RESPONSIVE_GRAPH_FIELDS_OPTION_ACTION_CLASSNAME}'}`

// Read the source fixture once per test; assertion phases share this snapshot.
export function createToolbarFixture() {
  const root = process.cwd()
  const canvasText = readUtf8(path.resolve(root, 'src/pages/Canvas.tsx'))
  const toolbarText = readUtf8(path.resolve(root, 'src/components/Toolbar.tsx'))
  const searchPanelText = readUtf8(path.resolve(root, 'src/components/SearchPanel.tsx'))
  const toolbarStylesText = readUtf8(path.resolve(root, 'src/features/toolbar/ui/toolbarStyles.ts'))
  const toolMenuController = readUtf8(path.resolve(root, 'src/lib/toolbar/ToolbarToolMenu.impl.tsx'))
  const toolMenuText = toolMenuController + readUtf8(path.resolve(root, 'src/components/ui/FloatingPanel.tsx'))
  const launchDropdownText = readUtf8(path.resolve(root, 'src/lib/toolbar/LaunchDropdown.impl.tsx'))
  const importUrlRendererSelectText = readUtf8(path.resolve(root, 'src/lib/toolbar/ImportUrlRendererSelect.tsx'))
  const collapsibleToolbarText = readUtf8(path.resolve(root, 'src/components/ui/CollapsibleToolbar.tsx'))
  const detailsMenuText = readUtf8(path.resolve(root, 'src/components/ui/DetailsMenu.tsx'))
  const explorerSearchControlText = readUtf8(path.resolve(root, 'src/features/markdown-workspace/ExplorerSearchControl.tsx'))
  const explorerHeaderActionsText = readUtf8(path.resolve(root, 'src/features/markdown-workspace/MarkdownWorkspaceExplorerHeaderActions.tsx'))
  const markdownWorkspaceToolbarText = readUtf8(path.resolve(root, 'src/features/markdown-workspace/MarkdownWorkspaceToolbar.tsx'))
  const markdownWorkspaceToolbarInlineMenusText = readUtf8(path.resolve(root, 'src/features/markdown-workspace/MarkdownWorkspaceToolbarInlineMenus.tsx'))
  const workspaceModeSelectText = readUtf8(path.resolve(root, 'src/features/markdown-workspace/WorkspaceModeSelect.tsx'))
  const markdownWorkspaceLayoutText = readUtf8(path.resolve(root, 'src/features/markdown-workspace/main/layout/MarkdownWorkspaceLayout.tsx'))
  const markdownEditorPaneText = readUtf8(path.resolve(root, 'src/features/markdown-workspace/main/editor/MarkdownEditorPane.tsx'))
  const monacoTextEditorText = readUtf8(path.resolve(root, 'src/lib/monaco/MonacoTextEditor.impl.tsx'))
  const workspaceWidthDefaultsText = readUtf8(path.resolve(root, 'src/features/workspace-table/workspaceViewCanvasDefaults.ts'))
  const workspacePaneRuntimeText = readUtf8(path.resolve(root, 'src/features/canvas/useCanvasWorkspacePaneRuntime.ts'))
  const graphTableToolbarText = readUtf8(path.resolve(root, 'src/features/graph-data-table/ui/GraphDataTableToolbar.tsx'))
  const workspaceActionsPanelText = readUtf8(path.resolve(root, 'src/features/workspace-actions/WorkspaceActionsPanel.tsx'))
  const graphTableDomTableText = readUtf8(path.resolve(root, 'src/features/graph-data-table/ui/GraphDataTableDomTableView.tsx'))
  const graphTableKanbanViewText = readUtf8(path.resolve(root, 'src/features/graph-data-table/ui/GraphDataTableKanbanView.tsx'))
  const graphDataTableFieldsPanelText = readUtf8(path.resolve(root, 'src/features/graph-data-table/ui/GraphDataTableFieldsPanel.tsx'))
  const graphDataTableFilterPanelText = readUtf8(path.resolve(root, 'src/features/graph-data-table/ui/GraphDataTableFilterPanel.tsx'))
  const graphDataTableSortPanelText = readUtf8(path.resolve(root, 'src/features/graph-data-table/ui/GraphDataTableSortPanel.tsx'))
  const graphDataTableGroupPanelText = readUtf8(path.resolve(root, 'src/features/graph-data-table/ui/GraphDataTableGroupPanel.tsx'))
  const graphDataTableUiPrimitivesText = readUtf8(path.resolve(root, 'src/features/graph-data-table/ui/GraphDataTableUiPrimitives.tsx'))
  const graphDataTableToolbarStylesText = readUtf8(path.resolve(root, 'src/features/graph-data-table/ui/GraphDataTableToolbarStyles.ts'))
  const paywallOverlayText = readUtf8(path.resolve(root, 'src/features/payments/PaywallOverlay.tsx'))
  const graphDataTableTableText = readUtf8(path.resolve(root, 'src/lib/graph-data-table/ui/GraphDataTableTable.impl.tsx'))
  const graphDataTableBodyText = readUtf8(path.resolve(root, 'src/features/graph-data-table/ui/GraphDataTableBody.tsx'))
  const graphDataTableRowsText = readUtf8(path.resolve(root, 'src/features/graph-data-table/ui/GraphDataTableRows.tsx'))
  const graphFieldsSettingsPanelText = readUtf8(path.resolve(root, 'src/features/panels/views/graph-fields/FieldSettingsPanel.tsx'))
  const graphFieldsPanelControlsText = readUtf8(path.resolve(root, 'src/features/panels/views/graph-fields/GraphFieldsPanelControls.tsx'))
  const graphFieldsTemplatesText = readUtf8(path.resolve(root, 'src/features/panels/views/graph-fields/FieldTemplatesSection.tsx'))
  const graphFieldsValidationText = readUtf8(path.resolve(root, 'src/features/panels/views/graph-fields/FieldLocalSchemaValidationEditor.tsx'))
  const graphFieldsLocalSchemaRowsText = readUtf8(path.resolve(root, 'src/features/panels/views/graph-fields/FieldLocalSchemaRowsEditor.tsx'))
  const graphFieldsLocalSchemaSectionBodyText = readUtf8(path.resolve(root, 'src/features/panels/views/graph-fields/FieldLocalSchemaSectionBody.tsx'))
  const graphFieldsDefaultValueText = readUtf8(path.resolve(root, 'src/features/panels/views/graph-fields/DefaultValueSection.tsx'))
  const graphFieldsDecimalPlacesText = readUtf8(path.resolve(root, 'src/features/panels/views/graph-fields/DecimalPlacesSection.tsx'))
  const graphFieldsCurrencyText = readUtf8(path.resolve(root, 'src/features/panels/views/graph-fields/CurrencySection.tsx'))
  const graphFieldsSelectOptionsText = readUtf8(path.resolve(root, 'src/features/panels/views/graph-fields/SelectOptionsSection.tsx'))
  const graphFieldIconsText = readUtf8(path.resolve(root, 'src/features/graph-fields/ui/graphFieldIcons.tsx'))
  const graphFieldsNewFieldFormText = readUtf8(path.resolve(root, 'src/features/panels/views/graph-fields/NewFieldForm.tsx'))
  const graphFieldsSearchText = readUtf8(path.resolve(root, 'src/features/panels/views/graph-fields/GraphFieldsSearch.tsx'))
  const graphFieldsListPanelBodyText = readUtf8(path.resolve(root, 'src/features/panels/views/graph-fields/GraphFieldsListPanelBody.tsx'))
  const graphFieldsListRowText = readUtf8(path.resolve(root, 'src/features/panels/views/graph-fields/GraphFieldsListRow.tsx'))
  const graphFieldsLayoutText = readUtf8(path.resolve(root, 'src/features/panels/views/graph-fields/FieldLayoutSection.tsx'))
  const graphFieldsEndpointsAndCardinalityText = readUtf8(path.resolve(root, 'src/features/panels/views/graph-fields/FieldEndpointsAndCardinalitySection.tsx'))
  const graphFieldsSamplesPanelText = readUtf8(path.resolve(root, 'src/features/panels/views/graph-fields/FieldSamplesPanel.tsx'))
  const graphFieldsStylesText = readUtf8(path.resolve(root, 'src/features/panels/views/graph-fields/FieldStylesSection.tsx'))
  const schemaEditorBehaviorText = readUtf8(path.resolve(root, 'src/features/schema-editor/BehaviorSection.tsx'))
  const schemaEditorLayoutRoutingText = readUtf8(path.resolve(root, 'src/features/schema-editor/LayoutAndRoutingSection.tsx'))
  const schemaEditorSerializationText = readUtf8(path.resolve(root, 'src/features/schema-editor/SerializationSection.tsx'))
  const schemaUiEditorRowsText = readUtf8(path.resolve(root, 'src/features/schema/ui/SchemaUiEditorRows.tsx'))
  const widgetEditorParamsText = readUtf8(path.resolve(root, 'src/components/StoryboardWidget/WidgetEditorParamsSection.tsx'))
  const widgetEditorSchemaTableText = readUtf8(path.resolve(root, 'src/components/StoryboardWidget/WidgetEditorSchemaTable.tsx'))
  const graphRagWorkflowSectionText = readUtf8(path.resolve(root, 'src/features/panels/views/GraphRagWorkflowSection.tsx'))
  const mainPanelText = readUtf8(path.resolve(root, 'src/features/panels/MainPanel.tsx'))
  const orchestratorTraversalPanelsText = readUtf8(path.resolve(root, 'src/features/panels/views/OrchestratorTraversalPanels.tsx'))
  const traversalSequenceGraphRagEditorsListsText = readUtf8(path.resolve(root, 'src/features/panels/views/TraversalSequenceGraphRagEditorsLists.tsx'))
  const traversalSequenceGraphRagEditorsQueryText = readUtf8(path.resolve(root, 'src/features/panels/views/TraversalSequenceGraphRagEditorsQuery.tsx'))
  const datasetInspectorSectionText = readUtf8(path.resolve(root, 'src/features/panels/views/DatasetInspectorSection.tsx'))
  const agenticRagContextSectionText = readUtf8(path.resolve(root, 'src/features/panels/views/AgenticRagContextSection.tsx'))
  const parserSectionsText = readUtf8(path.resolve(root, 'src/features/panels/views/ParserSections.tsx'))
  const aiKgForceControlsText = readUtf8(path.resolve(root, 'src/features/panels/views/AiKgLayers/AiKgForceControls.tsx'))
  const helpKtvLayoutText = readUtf8(path.resolve(root, 'src/features/panels/views/HelpKtvLayout.tsx'))
  const renderSettingsSectionText = readUtf8(path.resolve(root, 'src/lib/panels/views/RenderSettingsSection.impl.tsx'))
  const plainTextInputEditorText = readUtf8(path.resolve(root, 'src/components/ui/PlainTextInputEditor.tsx'))
  const graphStatsPanelText = readUtf8(path.resolve(root, 'src/features/graph-stats/GraphStatsPanel.tsx'))
  const graphStatsCommunitiesSectionText = readUtf8(path.resolve(root, 'src/features/graph-stats/sections/CommunitiesStatsSection.tsx'))
  const graphStatsWordFrequenciesSectionText = readUtf8(path.resolve(root, 'src/features/graph-stats/sections/GraphLayerWordFrequenciesSection.tsx'))
  const graphStatsKeywordEntitiesSectionText = readUtf8(path.resolve(root, 'src/features/graph-stats/sections/KeywordEntitiesSection.tsx'))
  const graphStatsEdgesSectionText = readUtf8(path.resolve(root, 'src/features/graph-stats/sections/EdgesStatsSection.tsx'))
  const graphStatsNodeWordFrequenciesSectionText = readUtf8(path.resolve(root, 'src/features/graph-stats/sections/NodeWordFrequenciesSection.tsx'))
  const markdownDataViewInlineTextCellEditorText = readUtf8(path.resolve(root, 'src/features/markdown/ui/MarkdownDataViewInlineTextCellEditor.tsx'))
  const graphStatsCentralitySectionText = readUtf8(path.resolve(root, 'src/features/graph-stats/sections/GraphRagCentralityStatsSection.tsx'))
  const statusBadgeText = readUtf8(path.resolve(root, 'src/features/panels/ui/StatusBadge.tsx'))
  const errorFeedbackText = readUtf8(path.resolve(root, 'src/components/ui/ErrorFeedback.tsx'))
  const tabHeaderText = readUtf8(path.resolve(root, 'src/features/panels/ui/TabHeader.tsx'))
  const mainPanelFrameText = readUtf8(path.resolve(root, 'src/features/panels/ui/MainPanelFrame.tsx'))
  const mainPanelContainerText = readUtf8(path.resolve(root, 'src/features/panels/ui/MainPanelContainer.tsx'))
  const collapsibleSectionText = readUtf8(path.resolve(root, 'src/features/panels/ui/CollapsibleSection.tsx'))
  const collapsibleSubsectionText = readUtf8(path.resolve(root, 'src/features/panels/ui/CollapsibleSubsection.tsx'))
  const mainPanelSettingsPanelShellText = readUtf8(path.resolve(root, 'src/features/panels/ui/MainPanelSettingsPanelShell.tsx'))
  const settingsRegistryUiText = readUtf8(path.resolve(root, 'src/features/settings/registry-ui.ui.ts'))
  const uiSliceInitialStateText = readUtf8(path.resolve(root, 'src/hooks/store/uiSliceInitialState.ts'))
  const uiSliceCoreActionsText = readUtf8(path.resolve(root, 'src/hooks/store/uiSliceCoreActions.ts'))
  const settingsFallbackDetailsText = readUtf8(path.resolve(root, 'src/features/panels/views/SettingsFallbackDetails.ts'))
  const settingsEntryRowInputText = readUtf8(path.resolve(root, 'src/features/panels/views/settingsEntryRow.input.tsx'))
  const settingsSpecialValueNodeText = readUtf8(path.resolve(root, 'src/features/panels/views/SettingsSpecialValueNode.tsx'))
  const canvasKeyTypeValueValueCellText = readUtf8(path.resolve(root, 'src/features/panels/ui/canvasKeyTypeValueValueCell.tsx'))
  const embeddedWorkspaceShellText = readUtf8(path.resolve(root, 'src/components/EmbeddedWorkspaceShell.tsx'))
  const markdownDataViewMultiTagSelectText = readUtf8(path.resolve(root, 'src/features/markdown/ui/MarkdownDataViewMultiTagSelect.tsx'))
  const threeSizingAndWidthControlsText = readUtf8(path.resolve(root, 'src/features/panels/views/shared/ThreeSizingAndWidthControls.tsx'))
  const floatingPanelChatSectionsText = readUtf8(path.resolve(root, 'src/features/chat/FloatingPanelChatSections.tsx'))
  const chatModelCredentialControlsText = readUtf8(path.resolve(root, 'src/features/chat/ChatModelCredentialControls.tsx'))
  const collaborationViewText = readUtf8(path.resolve(root, 'src/features/panels/views/CollaborationView.tsx'))
  const grabMapsDiscoveryWidgetSectionText = readUtf8(path.resolve(root, 'src/features/toolbar/GrabMapsDiscoveryWidgetSection.tsx'))
  const grabMapsDiscoverySettingsGridText = readUtf8(path.resolve(root, 'src/features/toolbar/GrabMapsDiscoverySettingsGrid.tsx'))
  const responsiveControlRowsText = readUtf8(path.resolve(root, 'src/lib/ui/responsiveControlRows.tsx'))
  const panelFormControlsText = readUtf8(path.resolve(root, 'src/lib/ui/panelFormControls.tsx'))
  const flowchartRendererControlsText = readUtf8(path.resolve(root, 'src/features/toolbar/ui/FlowchartRendererControls.tsx'))
  const flowchartRendererSettingsText = readUtf8(path.resolve(root, 'src/features/toolbar/ui/FlowchartRendererSettings.tsx'))
  const radarGalaxyRendererSettingsText = readUtf8(path.resolve(root, 'src/features/toolbar/ui/RadarGalaxyRendererSettings.tsx'))
  const designWireframeSettingsText = readUtf8(path.resolve(root, 'src/features/toolbar/ui/DesignWireframeSettings.tsx'))
  const layoutModeRendererSettingsText = readUtf8(path.resolve(root, 'src/features/toolbar/ui/LayoutModeRendererSettings.tsx'))
  const edgeTypesRendererSettingsText = readUtf8(path.resolve(root, 'src/features/toolbar/ui/EdgeTypesRendererSettings.tsx'))
  const designInspectorPanelText = readUtf8(path.resolve(root, 'src/features/design/DesignInspectorPanel.tsx'))
  const toastHostText = readUtf8(path.resolve(root, 'src/components/ui/ToastHost.tsx'))
  const dataViewToolbarButtonText = readUtf8(path.resolve(root, 'src/lib/ui/dataViewToolbarButton.tsx'))
  const floatingPropsPanelText = readUtf8(path.resolve(root, 'src/features/toolbar/FloatingPropsPanel.tsx'))
  const widgetEditorActionsToolbarText = readUtf8(path.resolve(root, 'src/components/StoryboardWidget/WidgetEditorActionsToolbar.tsx'))
  const storyboardWidgetGraphTabText = readUtf8(path.resolve(root, 'src/features/storyboard-widget-manager/StoryboardWidgetGraphTab.tsx'))
  const storyboardWidgetMappingTabLayoutText = readUtf8(path.resolve(root, 'src/features/storyboard-widget-manager/StoryboardWidgetMappingTabLayout.tsx'))
  const storyboardWidgetSpecificationTabText = readUtf8(path.resolve(root, 'src/features/storyboard-widget-manager/StoryboardWidgetSpecificationTab.tsx'))
  const widgetRegistryTableText = readUtf8(path.resolve(root, 'src/features/storyboard-widget-manager/WidgetRegistryTable.tsx'))
  const widgetRegistryFieldsEditorText = readUtf8(path.resolve(root, 'src/features/storyboard-widget-manager/WidgetRegistryFieldsEditor.tsx'))
  const widgetRegistryPortsEditorText = readUtf8(path.resolve(root, 'src/features/storyboard-widget-manager/WidgetRegistryPortsEditor.tsx'))
  const widgetRegistrySchemaMappingsEditorText = readUtf8(path.resolve(root, 'src/features/storyboard-widget-manager/WidgetRegistrySchemaMappingsEditor.tsx'))
  const storyboardWidgetMappingSettingsPanelText = readUtf8(path.resolve(root, 'src/features/storyboard-widget-manager/StoryboardWidgetMappingSettingsPanel.tsx'))
  const mainPanelStoryboardWidgetManagerHeaderText = readUtf8(path.resolve(root, 'src/features/panels/ui/MainPanelStoryboardWidgetManagerHeader.tsx'))
  const storyboardWidgetPanelChromeText = readUtf8(path.resolve(root, 'src/components/StoryboardWidget/StoryboardWidgetPanelChrome.tsx'))
  const storyboardWidgetInspectorText = readUtf8(path.resolve(root, 'src/components/StoryboardWidget/StoryboardWidgetInspector.tsx'))
  const storyboardWidgetInspectorTabsText = readUtf8(path.resolve(root, 'src/components/StoryboardWidget/StoryboardWidgetInspectorTabs.tsx'))
  const storyboardWidgetInlineValueEditorText = readUtf8(path.resolve(root, 'src/components/StoryboardWidget/StoryboardWidgetInlineValueEditor.tsx'))
  const widgetEditorFormText = readUtf8(path.resolve(root, 'src/components/StoryboardWidget/WidgetEditorForm.tsx'))
  const widgetEditorRegistrySectionText = readUtf8(path.resolve(root, 'src/components/StoryboardWidget/WidgetEditorRegistrySection.tsx'))
  const canvasArrangeActionBarText = readUtf8(path.resolve(root, 'src/components/canvas/CanvasArrangeActionBar.tsx'))
  const flowCanvasInteractionRuntimeText = readUtf8(path.resolve(root, 'src/components/FlowCanvas/FlowCanvasInteractionRuntime.tsx'))
  const graphCanvasArrangeToolbarText = readUtf8(path.resolve(root, 'src/components/GraphCanvasRoot/components/ArrangeToolbar2d.tsx'))
  const designCanvasArrangeActionBarText = readUtf8(path.resolve(root, 'src/components/DesignCanvas/ArrangeActionBar.tsx'))
  const canvasPerformanceReadoutOverlayText = readUtf8(path.resolve(root, 'src/features/canvas/CanvasPerformanceReadoutOverlay.tsx'))
  const performanceAutomationReadoutText = readUtf8(path.resolve(root, 'src/features/canvas/PerformanceAutomationReadout.tsx'))
  const canvasPerformancePanelText = readUtf8(path.resolve(root, 'src/features/canvas/CanvasPerformancePanel.tsx'))
  const markdownMetricsDevOverlayText = readUtf8(path.resolve(root, 'src/components/CanvasViewportMarkdownMetricsDevOverlay.tsx'))
  const designCanvasEditorChromeText = readUtf8(path.resolve(root, 'src/components/DesignCanvas/DesignCanvasEditorChrome.tsx'))
  const designCanvasWebpageStatusPanelText = readUtf8(path.resolve(root, 'src/components/DesignCanvas/webpageStatusPanel.tsx'))
  const designFloatingPanelText = readUtf8(path.resolve(root, 'src/features/design/DesignFloatingPanelView.tsx'))
  const designTokensPanelText = readUtf8(path.resolve(root, 'src/features/design/DesignTokensPanel.tsx'))
  const designDomTreePanelText = readUtf8(path.resolve(root, 'src/features/design/DesignDomTreePanel.tsx'))
  const designLayersPanelText = readUtf8(path.resolve(root, 'src/features/design/DesignLayersPanel.tsx'))
  const designDomInspectPanelText = readUtf8(path.resolve(root, 'src/features/design/DesignDomInspectPanel.tsx'))
  const storyboardCanvasText = readUtf8(path.resolve(root, 'src/components/StoryboardCanvas.tsx'))
  const graphEditorOverlayText = readUtf8(path.resolve(root, 'src/features/graph-editor/GraphEditorOverlay.tsx'))
  const graphEditorRightPanelText = readUtf8(path.resolve(root, 'src/features/graph-editor/GraphEditorRightPanel.tsx'))
  const graphEditorToolRailText = readUtf8(path.resolve(root, 'src/features/graph-editor/GraphEditorToolRail.tsx'))
  const markdownBlockGutterText = readUtf8(path.resolve(root, 'src/features/markdown/ui/MarkdownBlockGutter.tsx'))
  const markdownBlockquoteText = readUtf8(path.resolve(root, 'src/features/markdown/ui/MarkdownBlockquoteBlock.tsx'))
  const markdownCalloutText = readUtf8(path.resolve(root, 'src/features/markdown/ui/MarkdownCalloutBlock.tsx'))
  const markdownInlineMenusText = readUtf8(path.resolve(root, 'src/lib/markdown-core/ui/markdownBlockContainerCore.inlineMenusOverlay.tsx'))
  const markdownInlineSelectionToolbarText = readUtf8(path.resolve(root, 'src/lib/markdown-core/ui/MarkdownInlineSelectionToolbar.tsx'))
  const markdownSelectionToolbarText = readUtf8(path.resolve(root, 'src/lib/markdown-core/ui/MarkdownSelectionActionMenuItems.tsx'))
  const markdownSidebarSectionText = readUtf8(path.resolve(root, 'src/features/markdown/ui/MarkdownSidebarSection.tsx'))
  const dateCellEditorText = readUtf8(path.resolve(root, 'src/features/graph-data-table/ui/fast-grid/DateCellEditor.tsx'))
  const flowMappingRowsTableText = readUtf8(path.resolve(root, 'src/features/storyboard-widget-manager/FlowMappingRowsTable.tsx'))
  const expandCollapseAllButtonText = readUtf8(path.resolve(root, 'src/features/panels/ui/ExpandCollapseAllButton.tsx'))
  const floatingMenuStylesText = readUtf8(path.resolve(root, 'src/features/markdown-workspace/main/viewer/floatingMenuStyles.ts'))
  const columnHeaderMenuText = readUtf8(path.resolve(root, 'src/components/ui/ColumnHeaderMenu.tsx'))
  const columnHeaderPropertyTypeMenuText = readUtf8(path.resolve(root, 'src/components/ui/ColumnHeaderPropertyTypeMenu.tsx'))
  const typeMenuText = readUtf8(path.resolve(root, 'src/components/ui/TypeMenu.tsx'))
  const workspaceDataViewFilterMenuText = readUtf8(path.resolve(root, 'src/features/markdown-workspace/main/viewer/WorkspaceDataViewFilterMenu.tsx'))
  const workspaceDataViewSettingsPropertiesText = readUtf8(path.resolve(root, 'src/features/markdown-workspace/main/viewer/WorkspaceDataViewSettingsPropertiesSection.tsx'))
  const workspaceDataViewSettingsPrimitivesText = readUtf8(path.resolve(root, 'src/features/markdown-workspace/main/viewer/WorkspaceDataViewSettingsPrimitives.tsx'))
  const workspaceDataViewSettingsFilterText = readUtf8(path.resolve(root, 'src/features/markdown-workspace/main/viewer/WorkspaceDataViewSettingsFilterSection.tsx'))
  const workspaceDataViewSettingsSortText = readUtf8(path.resolve(root, 'src/features/markdown-workspace/main/viewer/WorkspaceDataViewSettingsSortSection.tsx'))
  const markdownDataViewChipsText = readUtf8(path.resolve(root, 'src/features/markdown/ui/MarkdownDataViewChips.tsx'))
  const markdownDataViewTableViewText = readUtf8(path.resolve(root, 'src/features/markdown/ui/MarkdownDataViewTableView.tsx'))
  const markdownDataViewKanbanViewText = readUtf8(path.resolve(root, 'src/features/markdown/ui/MarkdownDataViewKanbanView.tsx'))
  const markdownDataViewKanbanCardText = readUtf8(path.resolve(root, 'src/features/markdown/ui/kanban/KanbanCard.tsx'))
  const markdownDataViewKanbanGroupText = readUtf8(path.resolve(root, 'src/features/markdown/ui/kanban/KanbanGroup.tsx'))
  const previewOverlayText = readUtf8(path.resolve(root, 'src/features/panels/views/preview-panel/ui/PreviewOverlay.tsx'))
  const zoomPanViewportText = readUtf8(path.resolve(root, 'src/features/panels/views/preview-panel/ui/ZoomPanViewport.tsx'))
  const previewGalleryText = readUtf8(path.resolve(root, 'src/lib/panels/views/preview-panel/ui/PreviewGallery.impl.tsx'))
  const markdownExplorerSectionText = readUtf8(path.resolve(root, 'src/features/markdown-workspace/MarkdownExplorerSection.tsx'))
  const markdownWorkspaceFileTreeText = readUtf8(path.resolve(root, 'src/features/markdown-workspace/MarkdownFileTree.tsx'))
  const markdownFileTreeRowButtonText = readUtf8(path.resolve(root, 'src/features/markdown-workspace/MarkdownFileTreeRowButton.tsx'))
  const markdownWorkspaceBacklinkRowText = readUtf8(path.resolve(root, 'src/features/markdown-workspace/MarkdownWorkspaceBacklinkRow.tsx'))
  const markdownTocTreeRowText = readUtf8(path.resolve(root, 'src/features/markdown-workspace/MarkdownTocTreeRow.tsx'))
  const workspaceDataViewHeaderText = readUtf8(path.resolve(root, 'src/features/markdown-workspace/main/viewer/WorkspaceDataViewHeader.tsx'))
  const markdownCommentPreviewOverlayText = readUtf8(path.resolve(root, 'src/lib/markdown-core/ui/markdownBlockContainerCore.commentPreviewOverlay.tsx'))
  const markdownYouTubeTimestampPreviewText = readUtf8(path.resolve(root, 'src/lib/markdown-core/ui/MarkdownYouTubeTimestampPreviewLink.tsx'))
  const staticRichMediaPanelTextAnchorOverlayText = readUtf8(path.resolve(root, 'src/lib/ui/StaticRichMediaPanelTextAnchorOverlay.tsx'))
  const toolbarDropdownSelectText = readUtf8(path.resolve(root, 'src/components/toolbar/ToolbarDropdownSelect.tsx'))
  const interactionModeSelectText = readUtf8(path.resolve(root, 'src/components/toolbar/InteractionModeSelect.tsx'))
  const zoomModeSelectText = readUtf8(path.resolve(root, 'src/components/toolbar/ZoomModeSelect.tsx'))
  const documentModeSelectText = readUtf8(path.resolve(root, 'src/components/toolbar/DocumentModeSelect.tsx'))
  const editorWorkspaceSelectText = readUtf8(path.resolve(root, 'src/components/toolbar/EditorWorkspaceSelect.tsx'))
  const canvas2dRendererSelectText = readUtf8(path.resolve(root, 'src/components/toolbar/Canvas2dRendererSelect.tsx'))
  const geoJsonGeoPanelRendererText = readUtf8(path.resolve(root, 'src/features/markdown/ui/codeblock/GeoJsonGeoPanelRenderer.tsx'))
  const markdownInlineRendererText = readUtf8(path.resolve(root, 'src/lib/markdown-core/ui/MarkdownInlineRenderer.impl.tsx'))
  const markdownTableBlockText = readUtf8(path.resolve(root, 'src/features/markdown/ui/MarkdownTableBlock.tsx'))
  const safeHtmlRendererText = readUtf8(path.resolve(root, 'src/lib/markdown-core/ui/markdownPreviewLinks.safeHtml.render.tsx'))
  const markdownInlineMediaDownloadText = readUtf8(path.resolve(root, 'src/lib/markdown-core/ui/MarkdownInlineMediaDownload.tsx'))
  const markdownMediaWrapperText = readUtf8(path.resolve(root, 'src/lib/markdown-core/ui/MarkdownMediaWrapper.tsx'))
  const markdownSlidePartsText = readUtf8(path.resolve(root, 'src/features/markdown/ui/SlideParts.tsx'))
  const threeGraphXrText = readUtf8(path.resolve(root, 'src/lib/three/ThreeGraphXr.tsx'))
  const graphHoverTooltipText = readUtf8(path.resolve(root, 'src/components/GraphHoverTooltip.tsx'))
  const historyViewText = readUtf8(path.resolve(root, 'src/features/panels/views/HistoryView.tsx'))
  const launchSpotlightTourCardText = readUtf8(path.resolve(root, 'src/features/spotlight/LaunchSpotlightTourCard.tsx'))
  const launchSpotlightStatusCardText = readUtf8(path.resolve(root, 'src/features/spotlight/LaunchSpotlightStatusCard.tsx'))
  const settingsViewText = readUtf8(path.resolve(root, 'src/features/panels/views/SettingsView.tsx'))
  const settingsUiText = readUtf8(path.resolve(root, 'src/features/settings/ui.tsx'))
  const rendererPaletteSettingsText = readUtf8(path.resolve(root, 'src/features/toolbar/ui/RendererPaletteSettings.tsx'))
  const rendererHoverSettingsText = readUtf8(path.resolve(root, 'src/features/toolbar/ui/RendererHoverSettings.tsx'))
  const toolbarSettingsAreaText = readUtf8(path.resolve(root, 'src/features/toolbar/ToolbarSettingsArea.tsx'))
  const toolbarRenderAreaText = readUtf8(path.resolve(root, 'src/features/toolbar/ToolbarRenderArea.tsx'))
  const toolbarHistoryAreaText = readUtf8(path.resolve(root, 'src/features/toolbar/ToolbarHistoryArea.tsx'))
  const toolbarGraphFieldsAreaText = readUtf8(path.resolve(root, 'src/features/toolbar/ToolbarGraphFieldsArea.tsx'))
  const toolbarParserAreaText = readUtf8(path.resolve(root, 'src/features/toolbar/ToolbarParserArea.tsx'))
  const toolbarValidationAreaText = readUtf8(path.resolve(root, 'src/features/toolbar/ToolbarValidationArea.tsx'))
  const toolbarSchemaConfigAreaText = readUtf8(path.resolve(root, 'src/features/toolbar/ToolbarSchemaConfigArea.tsx'))
  const toolbarOrchestratorAreaText = readUtf8(path.resolve(root, 'src/features/toolbar/ToolbarOrchestratorArea.tsx'))
  const threeViewBackgroundFogSectionText = readUtf8(path.resolve(root, 'src/features/panels/views/ThreeViewBackgroundFogSection.tsx'))
  const threeViewStarfieldSectionText = readUtf8(path.resolve(root, 'src/features/panels/views/ThreeViewStarfieldSection.tsx'))
  const panelKeyTypeColorTextValueRowText = readUtf8(path.resolve(root, 'src/features/panels/ui/PanelKeyTypeColorTextValueRow.tsx'))
  const threeViewGlobeEffectsSectionText = readUtf8(path.resolve(root, 'src/features/panels/views/ThreeViewGlobeEffectsSection.tsx'))
  const iconHelpersText = readUtf8(path.resolve(root, 'src/lib/ui/icons.ts'))
  const responsiveElementClassesText = readUtf8(path.resolve(root, 'src/lib/ui/responsiveElementClasses.ts'))
  const anchorOverlayText = readUtf8(path.resolve(root, 'src/lib/ui/overlay.tsx'))
  const anchoredPopoverText = readUtf8(path.resolve(root, 'src/components/ui/AnchoredPopover.tsx'))
  const overlayPlacementText = readUtf8(path.resolve(root, 'src/lib/ui/overlayPlacement.ts'))
  const importUrlPromptText = readUtf8(path.resolve(root, 'src/features/toolbar/ImportUrlPrompt.tsx'))
  const launchDropdownImportUrlItemText = readUtf8(path.resolve(root, 'src/lib/toolbar/LaunchDropdownImportUrlItem.tsx'))
  const cssText = readUtf8(path.resolve(root, 'src/index.css'))
  const responsiveToolbarCssText = readUtf8(path.resolve(root, 'src/styles/responsive-toolbar.css'))
  const responsiveCanvasToolbarCssText = readUtf8(path.resolve(root, 'src/styles/responsive-canvas-toolbar.css'))
  const strybldrTimelineBottomPanelText = readUtf8(path.resolve(root, 'src/features/strybldr/StrybldrTimelineBottomPanel.tsx'))
  const toolbarAreaCssOwners = [
    '.kg-toolbar-area-stack',
    '.kg-toolbar-area-stack--inset',
    '.kg-toolbar-area-action-row',
    '.kg-toolbar-area-action-row--compact',
    '.kg-toolbar-area-action-row--wrap',
    '.kg-toolbar-area-label',
    '--kg-toolbar-area-stack-gap',
    '--kg-toolbar-area-stack-inset-padding-inline',
    '--kg-toolbar-area-action-row-gap',
    '--kg-toolbar-area-label-gap',
  ]
  const toolbarAreaContracts: Array<[string, string, string[]]> = [
    ['ToolbarSettingsArea', toolbarSettingsAreaText, ['uiToolbarAreaInsetStackClassName', 'uiToolbarAreaActionRowClassName', 'uiToolbarAreaLabelClassName']],
    ['ToolbarRenderArea', toolbarRenderAreaText, ['uiToolbarAreaStackClassName', 'uiToolbarAreaActionRowClassName']],
    ['ToolbarHistoryArea', toolbarHistoryAreaText, ['uiToolbarAreaInsetStackClassName', 'uiToolbarAreaActionRowClassName']],
    ['ToolbarGraphFieldsArea', toolbarGraphFieldsAreaText, ['uiToolbarAreaStackClassName', 'uiToolbarAreaInsetStackClassName', 'uiToolbarAreaCompactActionRowClassName', 'uiToolbarAreaActionRowClassName']],
    ['ToolbarParserArea', toolbarParserAreaText, ['uiToolbarAreaStackClassName', 'uiToolbarAreaCompactActionRowClassName', 'uiToolbarAreaActionRowClassName']],
    ['ToolbarValidationArea', toolbarValidationAreaText, ['uiToolbarAreaStackClassName', 'uiToolbarAreaWrapActionRowClassName']],
    ['ToolbarSchemaConfigArea', toolbarSchemaConfigAreaText, ['uiToolbarAreaStackClassName', 'uiToolbarAreaInsetStackClassName', 'uiToolbarAreaCompactActionRowClassName', 'uiToolbarAreaActionRowClassName']],
    ['ToolbarOrchestratorArea', toolbarOrchestratorAreaText, ['uiToolbarAreaStackClassName', 'uiToolbarAreaActionRowClassName']],
  ]
  const staleToolbarAreaLayoutStrings = [
    'flex flex-col gap-1',
    'flex flex-col gap-1 px-1',
    'flex items-center justify-end gap-2',
    'flex items-center justify-end gap-1',
    'flex flex-wrap items-center justify-end gap-1',
    'flex items-center gap-1 text-xs',
  ]
  const toolbarSettingsPanelBodyTexts = [
    radarGalaxyRendererSettingsText,
    designWireframeSettingsText,
    layoutModeRendererSettingsText,
    edgeTypesRendererSettingsText,
    flowchartRendererSettingsText,
  ]
  const designPanelTexts = [designDomTreePanelText, designLayersPanelText]
  const flowManagerFormEditorTexts = [
    widgetRegistryFieldsEditorText,
    widgetRegistryPortsEditorText,
    widgetRegistrySchemaMappingsEditorText,
    storyboardWidgetMappingSettingsPanelText,
  ]
  const flowManagerPanelHeaderTexts = [
    storyboardWidgetGraphTabText,
    storyboardWidgetMappingTabLayoutText,
    storyboardWidgetSpecificationTabText,
  ]
  const flowManagerPanelBodyTexts = [
    storyboardWidgetGraphTabText,
    storyboardWidgetMappingTabLayoutText,
    storyboardWidgetSpecificationTabText,
  ]
  const colorSwatchConsumerTexts = [
    settingsUiText,
    rendererPaletteSettingsText,
    graphFieldsStylesText,
  ]
  const compactSelectionControlConsumerTexts = [
    threeViewStarfieldSectionText,
    graphFieldsStylesText,
    graphFieldsSamplesPanelText,
    graphFieldsSettingsPanelText,
    graphDataTableGroupPanelText,
    rendererHoverSettingsText,
    toolbarSettingsAreaText,
  ]
  const smallSelectionControlConsumerTexts = [
    threeViewGlobeEffectsSectionText,
    graphDataTableSortPanelText,
  ]
  const defaultSelectionControlConsumerTexts = [
    graphDataTableFieldsPanelText,
    graphDataTableRowsText,
    radarGalaxyRendererSettingsText,
    edgeTypesRendererSettingsText,
  ]
  const compactSelectionControlOwnerChecks = {
    graphFieldsSamples: graphFieldsSamplesPanelText.includes('UI_RESPONSIVE_COMPACT_SELECTION_CONTROL_CLASSNAME'),
    graphFieldsSettings: graphFieldsSettingsPanelText.includes('UI_RESPONSIVE_COMPACT_SELECTION_CONTROL_CLASSNAME'),
    graphDataTableGroup: graphDataTableGroupPanelText.includes('UI_RESPONSIVE_COMPACT_SELECTION_CONTROL_CLASSNAME'),
    rendererHover: rendererHoverSettingsText.includes('UI_RESPONSIVE_COMPACT_SELECTION_CONTROL_CLASSNAME'),
    toolbarSettings: toolbarSettingsAreaText.includes('UI_RESPONSIVE_COMPACT_SELECTION_CONTROL_CLASSNAME'),
  }
  const compactSelectionControlsUseSharedOwner = Object.values(compactSelectionControlOwnerChecks).every(Boolean)
  const smallSelectionControlOwnerChecks = {
    threeViewGlobeEffects: threeViewGlobeEffectsSectionText.includes('UI_RESPONSIVE_SMALL_SELECTION_CONTROL_CLASSNAME'),
    graphDataTableSort: graphDataTableSortPanelText.includes('UI_RESPONSIVE_SMALL_SELECTION_CONTROL_CLASSNAME'),
  }
  const smallSelectionControlsUseSharedOwner = Object.values(smallSelectionControlOwnerChecks).every(Boolean)
  const defaultSelectionControlOwnerChecks = {
    graphDataTableFields: graphDataTableFieldsPanelText.includes('UI_RESPONSIVE_SELECTION_CONTROL_CLASSNAME'),
    graphDataTableRows: graphDataTableRowsText.includes('UI_RESPONSIVE_SELECTION_CONTROL_CLASSNAME'),
    radarGalaxyRenderer: radarGalaxyRendererSettingsText.includes('UI_RESPONSIVE_SELECTION_CONTROL_CLASSNAME'),
    edgeTypesRenderer: edgeTypesRendererSettingsText.includes('UI_RESPONSIVE_SELECTION_CONTROL_CLASSNAME'),
  }
  const defaultSelectionControlsUseSharedOwner = Object.values(defaultSelectionControlOwnerChecks).every(Boolean)
  const graphFieldsSampleControlsUseSharedOwner = graphFieldsSamplesPanelText.includes('UI_RESPONSIVE_SELECTION_CONTROL_CLASSNAME')
  const panelCheckboxUsesSharedOwner = panelFormControlsText.includes('UI_RESPONSIVE_SELECTION_CONTROL_CLASSNAME')
  const aiKgForceControlsDelegateToPanelCheckbox = aiKgForceControlsText.includes('PanelCheckbox')
  const compactSelectionControlsUseStaleSizing = compactSelectionControlConsumerTexts.some(text =>
    text.includes(staleSelectionControlRoundedSizingClass()) ||
    text.includes(staleSelectionControlRoundedWidthFirstClass()) ||
    text.includes(staleSelectionControlBareSizingClass())
  )
  const smallSelectionControlsUseStaleSizing = smallSelectionControlConsumerTexts.some(text =>
    text.includes(staleSelectionControlSmallRoundedSizingClass()) ||
    text.includes(staleSelectionControlSmallRoundedWidthFirstClass())
  )
  const defaultSelectionControlsUseStaleSizing = [graphFieldsSamplesPanelText, ...defaultSelectionControlConsumerTexts].some(text =>
    text.includes(staleSelectionControlDefaultRoundedSizingClass()) ||
    text.includes(staleSelectionControlDefaultBareSizingClass())
  )
  const panelCheckboxKeepsLegacySizing = panelFormControlsText.includes('h-4 w-4 rounded')
  const explorerPaneToggleIdx = markdownWorkspaceToolbarText.indexOf('Show Explorer pane')
  const binPaneToggleIdx = markdownWorkspaceToolbarText.indexOf('Show binary model pane')
  const jsonPaneToggleIdx = markdownWorkspaceToolbarText.indexOf('Show JSON editor pane')
  const markdownPaneToggleIdx = markdownWorkspaceToolbarText.indexOf('Show Markdown editor pane')
  const viewerPaneToggleIdx = markdownWorkspaceToolbarText.indexOf('Show Viewer preview pane')
  const htmlPaneToggleIdx = markdownWorkspaceToolbarText.indexOf('Show HTML viewer pane')
  const canvasPaneToggleIdx = markdownWorkspaceToolbarText.indexOf('Show Canvas pane')
  const graphRecordDbText = readUtf8(path.resolve(root, 'src/lib/graph-record-db/graphRecordDb.impl.ts'))
  const kanbanReorderText = readUtf8(path.resolve(root, 'src/features/markdown/ui/kanban/kanbanReorder.ts'))
  const kanbanShortcutCopyText = readUtf8(path.resolve(root, 'src/features/markdown/ui/kanban/kanbanShortcutCopy.ts'))
  const panelConfigText = readUtf8(path.resolve(root, 'src/features/panels/config.ts'))
  const kanbanDropPreviewText = readUtf8(path.resolve(root, 'src/features/markdown/ui/kanban/KanbanDropPreview.tsx'))
  const kanbanDragHookText = readUtf8(path.resolve(root, 'src/features/markdown/ui/kanban/useKanbanDragAndDrop.ts'))
  const kanbanDragVisualStateText = readUtf8(path.resolve(root, 'src/features/markdown/ui/kanban/kanbanDragVisualState.ts'))
  const kanbanDragIntentText = readUtf8(path.resolve(root, 'src/features/markdown/ui/kanban/kanbanDragIntent.ts'))
  const kanbanMoveOutcomesText = readUtf8(path.resolve(root, 'src/features/markdown/ui/kanban/kanbanMoveOutcomes.ts'))
  return { root, canvasText, toolbarText, searchPanelText, toolbarStylesText, toolMenuController, toolMenuText, launchDropdownText, importUrlRendererSelectText, collapsibleToolbarText, detailsMenuText, explorerSearchControlText, explorerHeaderActionsText, markdownWorkspaceToolbarText, markdownWorkspaceToolbarInlineMenusText, workspaceModeSelectText, markdownWorkspaceLayoutText, markdownEditorPaneText, monacoTextEditorText, workspaceWidthDefaultsText, workspacePaneRuntimeText, graphTableToolbarText, workspaceActionsPanelText, graphTableDomTableText, graphTableKanbanViewText, graphDataTableFieldsPanelText, graphDataTableFilterPanelText, graphDataTableSortPanelText, graphDataTableGroupPanelText, graphDataTableUiPrimitivesText, graphDataTableToolbarStylesText, paywallOverlayText, graphDataTableTableText, graphDataTableBodyText, graphDataTableRowsText, graphFieldsSettingsPanelText, graphFieldsPanelControlsText, graphFieldsTemplatesText, graphFieldsValidationText, graphFieldsLocalSchemaRowsText, graphFieldsLocalSchemaSectionBodyText, graphFieldsDefaultValueText, graphFieldsDecimalPlacesText, graphFieldsCurrencyText, graphFieldsSelectOptionsText, graphFieldIconsText, graphFieldsNewFieldFormText, graphFieldsSearchText, graphFieldsListPanelBodyText, graphFieldsListRowText, graphFieldsLayoutText, graphFieldsEndpointsAndCardinalityText, graphFieldsSamplesPanelText, graphFieldsStylesText, schemaEditorBehaviorText, schemaEditorLayoutRoutingText, schemaEditorSerializationText, schemaUiEditorRowsText, widgetEditorParamsText, widgetEditorSchemaTableText, graphRagWorkflowSectionText, mainPanelText, orchestratorTraversalPanelsText, traversalSequenceGraphRagEditorsListsText, traversalSequenceGraphRagEditorsQueryText, datasetInspectorSectionText, agenticRagContextSectionText, parserSectionsText, aiKgForceControlsText, helpKtvLayoutText, renderSettingsSectionText, plainTextInputEditorText, graphStatsPanelText, graphStatsCommunitiesSectionText, graphStatsWordFrequenciesSectionText, graphStatsKeywordEntitiesSectionText, graphStatsEdgesSectionText, graphStatsNodeWordFrequenciesSectionText, markdownDataViewInlineTextCellEditorText, graphStatsCentralitySectionText, statusBadgeText, errorFeedbackText, tabHeaderText, mainPanelFrameText, mainPanelContainerText, collapsibleSectionText, collapsibleSubsectionText, mainPanelSettingsPanelShellText, settingsRegistryUiText, uiSliceInitialStateText, uiSliceCoreActionsText, settingsFallbackDetailsText, settingsEntryRowInputText, settingsSpecialValueNodeText, canvasKeyTypeValueValueCellText, embeddedWorkspaceShellText, markdownDataViewMultiTagSelectText, threeSizingAndWidthControlsText, floatingPanelChatSectionsText, chatModelCredentialControlsText, collaborationViewText, grabMapsDiscoveryWidgetSectionText, grabMapsDiscoverySettingsGridText, responsiveControlRowsText, panelFormControlsText, flowchartRendererControlsText, flowchartRendererSettingsText, radarGalaxyRendererSettingsText, designWireframeSettingsText, layoutModeRendererSettingsText, edgeTypesRendererSettingsText, designInspectorPanelText, toastHostText, dataViewToolbarButtonText, floatingPropsPanelText, widgetEditorActionsToolbarText, storyboardWidgetGraphTabText, storyboardWidgetMappingTabLayoutText, storyboardWidgetSpecificationTabText, widgetRegistryTableText, widgetRegistryFieldsEditorText, widgetRegistryPortsEditorText, widgetRegistrySchemaMappingsEditorText, storyboardWidgetMappingSettingsPanelText, mainPanelStoryboardWidgetManagerHeaderText, storyboardWidgetPanelChromeText, storyboardWidgetInspectorText, storyboardWidgetInspectorTabsText, storyboardWidgetInlineValueEditorText, widgetEditorFormText, widgetEditorRegistrySectionText, canvasArrangeActionBarText, flowCanvasInteractionRuntimeText, graphCanvasArrangeToolbarText, designCanvasArrangeActionBarText, canvasPerformanceReadoutOverlayText, performanceAutomationReadoutText, canvasPerformancePanelText, markdownMetricsDevOverlayText, designCanvasEditorChromeText, designCanvasWebpageStatusPanelText, designFloatingPanelText, designTokensPanelText, designDomTreePanelText, designLayersPanelText, designDomInspectPanelText, storyboardCanvasText, graphEditorOverlayText, graphEditorRightPanelText, graphEditorToolRailText, markdownBlockGutterText, markdownBlockquoteText, markdownCalloutText, markdownInlineMenusText, markdownInlineSelectionToolbarText, markdownSelectionToolbarText, markdownSidebarSectionText, dateCellEditorText, flowMappingRowsTableText, expandCollapseAllButtonText, floatingMenuStylesText, columnHeaderMenuText, columnHeaderPropertyTypeMenuText, typeMenuText, workspaceDataViewFilterMenuText, workspaceDataViewSettingsPropertiesText, workspaceDataViewSettingsPrimitivesText, workspaceDataViewSettingsFilterText, workspaceDataViewSettingsSortText, markdownDataViewChipsText, markdownDataViewTableViewText, markdownDataViewKanbanViewText, markdownDataViewKanbanCardText, markdownDataViewKanbanGroupText, previewOverlayText, zoomPanViewportText, previewGalleryText, markdownExplorerSectionText, markdownWorkspaceFileTreeText, markdownFileTreeRowButtonText, markdownWorkspaceBacklinkRowText, markdownTocTreeRowText, workspaceDataViewHeaderText, markdownCommentPreviewOverlayText, markdownYouTubeTimestampPreviewText, staticRichMediaPanelTextAnchorOverlayText, toolbarDropdownSelectText, interactionModeSelectText, zoomModeSelectText, documentModeSelectText, editorWorkspaceSelectText, canvas2dRendererSelectText, geoJsonGeoPanelRendererText, markdownInlineRendererText, markdownTableBlockText, safeHtmlRendererText, markdownInlineMediaDownloadText, markdownMediaWrapperText, markdownSlidePartsText, threeGraphXrText, graphHoverTooltipText, historyViewText, launchSpotlightTourCardText, launchSpotlightStatusCardText, settingsViewText, settingsUiText, rendererPaletteSettingsText, rendererHoverSettingsText, toolbarSettingsAreaText, toolbarRenderAreaText, toolbarHistoryAreaText, toolbarGraphFieldsAreaText, toolbarParserAreaText, toolbarValidationAreaText, toolbarSchemaConfigAreaText, toolbarOrchestratorAreaText, threeViewBackgroundFogSectionText, threeViewStarfieldSectionText, panelKeyTypeColorTextValueRowText, threeViewGlobeEffectsSectionText, iconHelpersText, responsiveElementClassesText, anchorOverlayText, anchoredPopoverText, overlayPlacementText, importUrlPromptText, launchDropdownImportUrlItemText, cssText, responsiveToolbarCssText, responsiveCanvasToolbarCssText, strybldrTimelineBottomPanelText, toolbarAreaCssOwners, toolbarAreaContracts, staleToolbarAreaLayoutStrings, toolbarSettingsPanelBodyTexts, designPanelTexts, flowManagerFormEditorTexts, flowManagerPanelHeaderTexts, flowManagerPanelBodyTexts, colorSwatchConsumerTexts, compactSelectionControlConsumerTexts, smallSelectionControlConsumerTexts, defaultSelectionControlConsumerTexts, compactSelectionControlOwnerChecks, compactSelectionControlsUseSharedOwner, smallSelectionControlOwnerChecks, smallSelectionControlsUseSharedOwner, defaultSelectionControlOwnerChecks, defaultSelectionControlsUseSharedOwner, graphFieldsSampleControlsUseSharedOwner, panelCheckboxUsesSharedOwner, aiKgForceControlsDelegateToPanelCheckbox, compactSelectionControlsUseStaleSizing, smallSelectionControlsUseStaleSizing, defaultSelectionControlsUseStaleSizing, panelCheckboxKeepsLegacySizing, explorerPaneToggleIdx, binPaneToggleIdx, jsonPaneToggleIdx, markdownPaneToggleIdx, viewerPaneToggleIdx, htmlPaneToggleIdx, canvasPaneToggleIdx, graphRecordDbText, kanbanReorderText, kanbanShortcutCopyText, panelConfigText, kanbanDropPreviewText, kanbanDragHookText, kanbanDragVisualStateText, kanbanDragIntentText, kanbanMoveOutcomesText }
}
export type SourceFixture = ReturnType<typeof createToolbarFixture>
