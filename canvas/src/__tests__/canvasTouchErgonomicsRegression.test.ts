import fs from 'node:fs'
import path from 'node:path'

const readUtf8 = (filePath: string): string => fs.readFileSync(filePath, 'utf8')
const staleContentStartUtility = (prefix: 'left' | 'pl'): string => `${prefix}-[44px]`
const staleMarkdownGutterContentStartAlias = (): string => ['MARKDOWN_BLOCK_GUTTER_CONTENT_START', 'LEFT_CLASS'].join('_')
const staleCompactControlPaddingClass = (): string => `${'px'}-2 ${'py'}-[2px]`
const staleCompactChipPaddingClass = (): string => `${'px'}-1 ${'py'}-[1px]`
const staleCompactListRowPaddingClass = (): string => `${'px'}-1 ${'py'}-[2px]`
const staleInlineChipPaddingClass = (): string => `${'px'}-1.5 ${'py'}-[1px]`
const staleBracketMicroChipPaddingClass = (): string => `${'px'}-[4px] ${'py'}-[1px]`
const staleInlineStatusChipPaddingClass = (): string => `${'px'}-2 ${'py'}-[1px]`
const stalePanelStickyOverlapClass = (): string => `${'-top'}-[2px]`
const staleDataViewSmallActionSizingClass = (): string => `${'h'}-7 ${'px'}-2`
const staleDataViewDefaultActionSizingClass = (): string => `${'h'}-8 ${'px'}-3`
const staleDataViewDefaultActionPaddingFirstClass = (): string => `${'px'}-3 ${'h'}-8`
const staleDataViewPropertyRowPaddingClass = (): string => `${'px'}-2 ${'py'}-1 rounded border`
const staleDataViewSearchFormSizingClass = (): string => `kg-data-view-search-form flex min-w-0 max-w-full items-center gap-2 ${'px'}-2 ${'py'}-1 rounded border`
const staleDataViewSmallIconSizingClass = (): string => `${'h'}-7 ${'w'}-7`
const staleDataViewDefaultIconSizingClass = (): string => `${'h'}-8 ${'w'}-8`
const staleDataViewSmallIconWidthFirstClass = (): string => `${'w'}-7 ${'h'}-7`
const staleDataViewDefaultIconWidthFirstClass = (): string => `${'w'}-8 ${'h'}-8`
const staleSmallIconActionHeightFirstClass = (): string => `${'h'}-7 ${'w'}-7`
const staleGraphDataTableHeaderHeightClass = (): string => `${'h'}-8`
const staleGraphDataTableInputSizingClass = (): string => `${'h'}-7 w-full ${'px'}-2`
const staleGraphDataTableBodyCellPaddingClass = (): string => `${'px'}-2 ${'py'}-1`
const staleGraphDataTableIndexWidthClass = (): string => `${'w'}-8`
const staleGraphDataTableIndexColStyle = (): string => `style={{ width: ${'32'} }}`
const staleMediaOverlaySmallActionSizingClass = (): string => `${'inline'}-flex h-7 w-7 items-center justify-center`
const staleMediaOverlayDefaultActionSizingClass = (): string => `${'inline'}-flex h-8 w-8 items-center justify-center`
const staleMenuIconActionSizingClass = (): string => `items-center justify-center ${'w'}-8 ${'h'}-8 rounded border`
const staleColumnHeaderFilterActionSizingClass = (): string => `${'h'}-7 ${'px'}-2 rounded border`
const staleColumnHeaderFilterFieldSizingClass = (): string => `${'h'}-7 min-w-0 ${'px'}-2 rounded border flex-1`
const staleSmallIconActionSizingClass = (): string => `${'inline'}-flex items-center justify-center ${'w'}-7 ${'h'}-7`
const staleCompactFullWidthFieldSizingClass = (): string => `${'w'}-full ${'h'}-7 ${'px'}-2`
const staleCompactPanelFieldInputSizingClass = (): string => `${'h'}-7 ${'w'}-full rounded border ${'px'}-2`
const stalePanelTableFieldInputSizingClass = (): string => `${'w'}-full ${'h'}-8 rounded-md ${'px'}-2`
const stalePanelInlineFieldSelectPaddingClass = (): string => `${'px'}-2 ${'py'}-1 text-xs border`
const stalePanelInlineFieldPaddingClass = (): string => `${'px'}-2 ${'py'}-1 rounded border`
const stalePanelInlineNarrowFieldPaddingClass = (): string => `${'px'}-1 ${'py'}-1 text-xs rounded border`
const staleStoryboardWidgetInlineValueSingleLineSizingClass = (): string => `${'min'}-h-7 ${'px'}-2 ${'py'}-1 truncate`
const stalePanelTextActionButtonSizingClass = (): string => `shrink-0 rounded border ${'px'}-2 ${'py'}-1`
const staleFlowManagerPanelHeaderPaddingClass = (): string => `${'px'}-3 ${'py'}-2 border-b`
const staleFlowManagerPanelHeaderRowGapClass = (): string => `flex items-center justify-between ${'gap'}-3`
const staleFlowManagerPanelBodyPaddingClasses = (): string[] => [
  `${'p'}-3 min-h-0 h-full overflow-hidden`,
  `h-full min-h-0 ${'p'}-3`,
  `overflow-auto ${'p'}-3`,
  `overflow-hidden ${'p'}-3`,
]
const staleFlowManagerPanelFramePaddingClass = (): string => `rounded border ${'p'}-2`
const staleFlowManagerToolbarRowGapClass = (): string => `flex flex-wrap items-center justify-between ${'gap'}-2`
const staleFlowManagerActionMenuGapClass = (): string => `m-0 p-0 list-none flex items-center ${'gap'}-1`
const staleFlowManagerWrappedActionMenuGapClass = (): string => `m-0 p-0 list-none flex flex-wrap items-center ${'gap'}-1`
const staleFlowManagerSectionHeaderGapClass = (): string => `flex items-center justify-between ${'gap'}-2`
const staleFlowManagerSectionGridGapClass = (): string => `grid grid-cols-1 sm:grid-cols-3 ${'gap'}-2`
const staleFlowManagerActionGroupGapClass = (): string => `className="flex items-center ${'gap'}-2"`
const staleFlowManagerInlineControlGapClass = (): string => `inline-flex items-center ${'gap'}-2`
const staleFlowManagerStatusTextPaddingClass = (): string => `${'px'}-3 ${'pt'}-2`
const staleFlowManagerStatusAlertPaddingClass = (): string => `rounded border ${'px'}-2 ${'py'}-2`
const staleFlowManagerFooterRowPaddingClass = (): string => `sticky bottom-0 ${'py'}-2 border-t`
const staleFlowManagerTableHeaderCellPaddingClass = (): string => `text-left ${'px'}-2 ${'py'}-2 text-xs font-semibold`
const staleFlowManagerTableActionHeaderCellPaddingClass = (): string => `text-right ${'px'}-2 ${'py'}-2 text-xs font-semibold`
const staleFlowManagerTableCellPaddingClass = (): string => `${'px'}-2 ${'py'}-1 align-top border-t`
const staleFlowManagerFormFieldPaddingClass = (): string => `${'mt'}-1 w-full rounded border ${'px'}-2 ${'py'}-1`
const staleFlowManagerFormFieldLocalFrameClass = (): string => `UI_RESPONSIVE_FLOW_MANAGER_FORM_FIELD_CLASSNAME, 'rounded border'`
const staleFlowManagerRegistryItemPaddingClass = (): string => `rounded border ${'p'}-2`
const staleFlowManagerRegistryItemHeaderGapClass = (): string => `flex items-center justify-between ${'gap'}-2`
const staleFlowManagerRegistryItemWideGridGapClass = (): string => `grid grid-cols-1 sm:grid-cols-4 ${'gap'}-2`
const staleFlowManagerRegistryItemNarrowGridGapClass = (): string => `grid grid-cols-1 sm:grid-cols-2 ${'gap'}-2`
const staleFlowManagerRegistryTableHeaderCellPaddingClass = (): string => `text-left ${'px'}-3 ${'py'}-2 text-xs font-semibold`
const staleFlowManagerRegistryTableCellPaddingClass = (): string => `${'px'}-3 ${'py'}-2`
const staleFlowManagerRegistryTableEmptyCellPaddingClass = (): string => `${'px'}-3 ${'py'}-6 text-center`
const staleFlowManagerSpecEditorPaddingClass = (): string => `${'mt'}-2 ${'${UI_RESPONSIVE_FLOW_MANAGER_SPEC_EDITOR_CLASSNAME}'} rounded-md border ${'px'}-2 ${'py'}-1`
const staleSpotlightActionButtonPaddingClasses = (): string[] => [
  `${'px'}-2 ${'py'}-1 rounded`,
  `${'px'}-3 ${'py'}-1 rounded`,
]
const stalePreviewZoomControlButtonPaddingClass = (): string => `${'px'}-2 ${'py'}-1 rounded border`
const stalePreviewZoomControlsFixedHeightClass = (): string => `shrink-0 ${'h'}-10 ${'px'}-3`
const staleColorSwatchSizingClass = (): string => `${'w'}-8 ${'h'}-6 p-0 border`
const staleDashedColorSwatchSizingClass = (): string => `${'w'}-8 ${'h'}-6 rounded border border-dashed`
const staleSelectionControlThemeBorderToken = (): string => ['${UI_THEME_TOKENS.input', 'border}'].join('.')
const staleSelectionControlRoundedSizingClass = (): string => `${'h'}-3 ${'w'}-3 rounded ${staleSelectionControlThemeBorderToken()}`
const staleSelectionControlRoundedWidthFirstClass = (): string => `${'w'}-3 ${'h'}-3 rounded ${staleSelectionControlThemeBorderToken()}`
const staleSelectionControlBareSizingClass = (): string => `${'h'}-3 ${'w'}-3 ${staleSelectionControlThemeBorderToken()}`
const staleSelectionControlSmallRoundedSizingClass = (): string => `${'h'}-3.5 ${'w'}-3.5 rounded ${staleSelectionControlThemeBorderToken()}`
const staleSelectionControlSmallRoundedWidthFirstClass = (): string => `${'w'}-3.5 ${'h'}-3.5 rounded ${staleSelectionControlThemeBorderToken()}`
const staleSelectionControlDefaultRoundedSizingClass = (): string => `${'h'}-4 ${'w'}-4 rounded ${staleSelectionControlThemeBorderToken()}`
const staleSelectionControlDefaultBareSizingClass = (): string => `${'h'}-4 ${'w'}-4 ${staleSelectionControlThemeBorderToken()}`
const staleGraphFieldsListRowPaddingClass = (): string => `${'px'}-2 ${'py'}-1.5`
const staleGraphFieldsSampleRowPaddingClass = (): string => `${'px'}-1 ${'py'}-1 text-left`
const staleGraphFieldsFieldInputSizingClass = (): string => `${'h'}-7 ${'w'}-full rounded border`
const staleGraphFieldsFieldInputMinWidthSizingClass = (): string => `${'h'}-7 ${'w'}-full min-w-0 rounded border`
const staleGraphFieldsComfortableFieldInputSizingClass = (): string => `${'h'}-9 ${'w'}-full rounded border`
const staleGraphFieldsComfortableSelectSizingClass = (): string => `${'h'}-9 ${'w'}-full text-left`
const staleGraphFieldsComfortableSchemaInputSizingClass = (): string => `${'h'}-9 rounded border`
const staleGraphFieldsPanelHeaderSizingClass = (): string => `${'h'}-9 border-b`
const staleGraphFieldsListPanelSearchStripClass = (): string => ['border-b ${UI_THEME_TOKENS.panel', 'border} p-2'].join('.')
const staleGraphFieldsSearchStripClass = (): string => ['border-b ${UI_THEME_TOKENS.panel', 'border} ${UI_THEME_TOKENS.panel.headerBg} p-2'].join('.')
const staleGraphFieldsNewFieldStripClass = (): string => ['border-b ${UI_THEME_TOKENS.panel', 'divider} ${UI_THEME_TOKENS.panel.bg} p-2'].join('.')
const staleGraphFieldsNewFieldInputShellPaddingClass = (): string => ['${UI_THEME_TOKENS.input', 'bg} px-2 focus-within'].join('.')
const staleGraphFieldsNewFieldActionButtonSizingClass = (): string => `${'App-toolbar__btn'} rounded border ${'px'}-2 ${'py'}-1`
const staleGraphFieldsShortFieldInputWidthClass = (): string => `${'w'}-24 rounded border`
const staleGraphFieldsTypeSelectSizingClass = (): string => `${'h'}-7 ${'w'}-44 shrink-0 text-left`
const staleGraphFieldsValidationSelectPaddingClass = (): string => `${'px'}-2 ${'py'}-1 text-xs`
const staleGraphFieldsOptionActionSizingClass = (): string => `${'py'}-1 ${'px'}-1.5 rounded-md ${'h'}-7 flex items-center`
const staleGraphFieldsOptionRowPaddingClass = (): string => `flex ${'py'}-1 items-center group`
const staleGraphFieldsOptionDragHandlePaddingClass = (): string => `${'p'}-2 flex cursor-grab`
const staleGraphFieldsOptionSwatchMarginClass = (): string => `cursor-pointer ${'mx'}-1`
const staleGraphFieldsOptionActionMarginClass = (): string => `${'mx'}-1 ${'${UI_RESPONSIVE_GRAPH_FIELDS_OPTION_ACTION_CLASSNAME}'}`

export function testToolbarTouchErgonomicsStaySourceDriven() {
  const root = process.cwd()
  const canvasText = readUtf8(path.resolve(root, 'src/pages/Canvas.tsx'))
  const toolbarText = readUtf8(path.resolve(root, 'src/components/Toolbar.tsx'))
  const searchPanelText = readUtf8(path.resolve(root, 'src/components/SearchPanel.tsx'))
  const toolbarStylesText = readUtf8(path.resolve(root, 'src/features/toolbar/ui/toolbarStyles.ts'))
  const toolMenuText = readUtf8(path.resolve(root, 'src/lib/toolbar/ToolbarToolMenu.impl.tsx'))
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
  if (toolbarAreaCssOwners.some(cssOwner => !responsiveToolbarCssText.includes(cssOwner))) {
    throw new Error('expected responsive toolbar CSS to own toolbar-area spacing and bounds')
  }
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
    !responsiveElementClassesText.includes('UI_RESPONSIVE_TOOLBAR_DROPDOWN_OPTION_META_CLASSNAME') ||
    !responsiveElementClassesText.includes('UI_RESPONSIVE_TOOLBAR_DROPDOWN_OPTION_HINT_CLASSNAME') ||
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
    !responsiveElementClassesText.includes('UI_RESPONSIVE_COMPACT_ERROR_FEEDBACK_BADGE_CLASSNAME') ||
    !responsiveElementClassesText.includes('UI_RESPONSIVE_EMBEDDED_WORKSPACE_LEFT_CLASSNAME') ||
    !responsiveElementClassesText.includes('UI_RESPONSIVE_TAG_INPUT_FORM_CLASSNAME') ||
    !responsiveElementClassesText.includes('UI_RESPONSIVE_CONSTRAINED_VALUE_FIELD_CLASSNAME') ||
    !responsiveElementClassesText.includes('UI_RESPONSIVE_SETTINGS_VALUE_WRAPPER_CLASSNAME') ||
    !responsiveElementClassesText.includes('UI_RESPONSIVE_PANEL_FLEX_INPUT_CLASSNAME') ||
    !responsiveElementClassesText.includes('UI_RESPONSIVE_COMPACT_PANEL_FLEX_INPUT_CLASSNAME') ||
    !responsiveElementClassesText.includes('UI_RESPONSIVE_COMPACT_PANEL_FIELD_INPUT_CLASSNAME') ||
    !responsiveElementClassesText.includes('UI_RESPONSIVE_PANEL_TABLE_FIELD_INPUT_CLASSNAME') || !responsiveElementClassesText.includes('UI_RESPONSIVE_PANEL_TABLE_ICON_ACTION_CLASSNAME') ||
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
    !responsiveToolbarCssText.includes('--kg-media-overlay-action-icon-size') ||
    !responsiveToolbarCssText.includes('.kg-data-view-field-input') ||
    !responsiveToolbarCssText.includes('--kg-data-view-field-input-height') ||
    !responsiveToolbarCssText.includes('--kg-data-view-field-input-padding-inline') ||
    !responsiveToolbarCssText.includes('.kg-import-url-preset-action') ||
    !responsiveToolbarCssText.includes('--kg-import-url-preset-action-height') ||
    !responsiveToolbarCssText.includes('--kg-import-url-preset-action-padding-inline') ||
    !responsiveToolbarCssText.includes('.kg-import-url-addon-action') ||
    !responsiveToolbarCssText.includes('--kg-import-url-addon-action-size') ||
    !responsiveToolbarCssText.includes('.kg-import-url-field') ||
    !responsiveToolbarCssText.includes('--kg-import-url-field-height') ||
    !responsiveToolbarCssText.includes('--kg-import-url-field-padding-inline') ||
    !responsiveToolbarCssText.includes('--kg-import-url-confirm-height') ||
    !responsiveToolbarCssText.includes('--kg-import-url-confirm-padding-inline') ||
    !responsiveToolbarCssText.includes('.kg-graph-data-table-header-cell') ||
    !responsiveToolbarCssText.includes('--kg-graph-data-table-header-height') ||
    !responsiveToolbarCssText.includes('.kg-graph-data-table-body-cell') ||
    !responsiveToolbarCssText.includes('--kg-graph-data-table-cell-padding-inline') ||
    !responsiveToolbarCssText.includes('--kg-graph-data-table-cell-padding-block') ||
    !responsiveToolbarCssText.includes('.kg-graph-data-table-text-input') ||
    !responsiveToolbarCssText.includes('--kg-graph-data-table-input-height') ||
    !responsiveToolbarCssText.includes('--kg-graph-data-table-input-padding-inline') ||
    !responsiveToolbarCssText.includes('.kg-graph-data-table-panel-choice') ||
    !responsiveToolbarCssText.includes('--kg-graph-data-table-panel-choice-height') ||
    !responsiveToolbarCssText.includes('--kg-graph-data-table-panel-choice-gap') ||
    !responsiveToolbarCssText.includes('--kg-graph-data-table-panel-choice-padding-inline') ||
    !responsiveToolbarCssText.includes('--kg-graph-data-table-panel-choice-height: var(--kg-touch-target, 44px)') ||
    !responsiveToolbarCssText.includes('.kg-graph-data-table-panel-header-row') ||
    !responsiveToolbarCssText.includes('--kg-graph-data-table-panel-header-row-gap') ||
    !responsiveToolbarCssText.includes('.kg-graph-data-table-panel-search-row') ||
    !responsiveToolbarCssText.includes('--kg-graph-data-table-panel-search-row-margin-block-end') ||
    !responsiveToolbarCssText.includes('.kg-graph-data-table-panel-inline-row') ||
    !responsiveToolbarCssText.includes('.kg-graph-data-table-panel-split-row') ||
    !responsiveToolbarCssText.includes('--kg-graph-data-table-panel-row-gap') ||
    !responsiveToolbarCssText.includes('.kg-graph-data-table-panel-field-row') ||
    !responsiveToolbarCssText.includes('--kg-graph-data-table-panel-field-row-padding-inline') ||
    !responsiveToolbarCssText.includes('.kg-graph-data-table-panel-inline-control') ||
    !responsiveToolbarCssText.includes('--kg-graph-data-table-panel-inline-control-gap') ||
    !responsiveToolbarCssText.includes('.kg-graph-data-table-panel-stack') ||
    !responsiveToolbarCssText.includes('--kg-graph-data-table-panel-stack-gap') ||
    !responsiveToolbarCssText.includes('.kg-graph-data-table-panel-scroll-stack') ||
    !responsiveToolbarCssText.includes('--kg-graph-data-table-panel-scroll-stack-gap') ||
    !responsiveToolbarCssText.includes('.kg-graph-data-table-panel-scroll-stack--spacious') ||
    !responsiveToolbarCssText.includes('.kg-graph-data-table-panel-divider-stack') ||
    !responsiveToolbarCssText.includes('--kg-graph-data-table-panel-divider-stack-padding-block-start') ||
    !responsiveToolbarCssText.includes('.kg-graph-data-table-panel-group-frame') ||
    !responsiveToolbarCssText.includes('--kg-graph-data-table-panel-group-frame-padding') ||
    !responsiveToolbarCssText.includes('.kg-graph-data-table-panel-wrap-row') ||
    !responsiveToolbarCssText.includes('.kg-graph-data-table-panel-footer-row') ||
    !responsiveToolbarCssText.includes('--kg-graph-data-table-panel-footer-row-margin-block-start') ||
    !responsiveToolbarCssText.includes('.kg-graph-data-table-index-column') ||
    !responsiveToolbarCssText.includes('--kg-graph-data-table-index-column-width') ||
    !responsiveToolbarCssText.includes('.kg-data-view-table-value') ||
    !responsiveToolbarCssText.includes('--kg-data-view-table-value-max-width') ||
    !responsiveToolbarCssText.includes('.kg-data-view-table-progress') ||
    !responsiveToolbarCssText.includes('--kg-data-view-table-progress-width') ||
    !responsiveToolbarCssText.includes('--kg-data-view-table-progress-height') ||
    !responsiveToolbarCssText.includes('.kg-toolbar-dropdown-menu--wide') ||
    !responsiveToolbarCssText.includes('.kg-toolbar-dropdown-menu--extra-wide') ||
    !responsiveToolbarCssText.includes('--kg-toolbar-dropdown-inline-clearance') ||
    !responsiveToolbarCssText.includes('.kg-toolbar-dropdown-menu--narrow') ||
    !responsiveToolbarCssText.includes('.kg-toolbar-dropdown-menu--compact') ||
    !responsiveToolbarCssText.includes('.kg-toolbar-dropdown-menu--slim') ||
    !responsiveToolbarCssText.includes('.kg-toolbar-dropdown-menu--tiny') ||
    !responsiveToolbarCssText.includes('.kg-toolbar-dropdown-option-meta') ||
    !responsiveToolbarCssText.includes('--kg-toolbar-dropdown-option-meta-max-width') ||
    !responsiveToolbarCssText.includes('.kg-toolbar-dropdown-option-hint') ||
    !responsiveToolbarCssText.includes('--kg-toolbar-dropdown-option-hint-padding-inline') ||
    !responsiveToolbarCssText.includes('.kg-menu-option-row') ||
    !responsiveToolbarCssText.includes('--kg-menu-option-row-padding-inline') ||
    !responsiveToolbarCssText.includes('.kg-launch-menu-root') ||
    !responsiveToolbarCssText.includes('--kg-toolbar-dropdown-width') ||
    !responsiveToolbarCssText.includes('.kg-markdown-geo-panel-empty') ||
    !responsiveToolbarCssText.includes('.kg-markdown-geo-panel-frame') ||
    !responsiveToolbarCssText.includes('.kg-markdown-geo-panel-frame--presentation') ||
    !responsiveToolbarCssText.includes('.kg-markdown-table-frame') ||
    !responsiveToolbarCssText.includes('--kg-markdown-table-frame-max-height') ||
    !responsiveToolbarCssText.includes('.kg-markdown-bounded-image') ||
    !responsiveToolbarCssText.includes('--kg-markdown-bounded-image-max-height') ||
    !responsiveToolbarCssText.includes('.kg-markdown-safe-html-table-shell') ||
    !responsiveToolbarCssText.includes('.kg-markdown-safe-html-embed-frame') ||
    !responsiveToolbarCssText.includes('.kg-markdown-safe-html-embed-frame--presentation') ||
    !responsiveToolbarCssText.includes('.kg-markdown-inline-menu-list') ||
    !responsiveToolbarCssText.includes('.kg-markdown-presentation-meta-text') ||
    !responsiveToolbarCssText.includes('--kg-markdown-presentation-meta-text-max-width') ||
    !responsiveToolbarCssText.includes('.kg-preview-overlay-panel') ||
    !responsiveToolbarCssText.includes('.kg-preview-gallery-drag-card') ||
    !responsiveToolbarCssText.includes('.kg-responsive-wide-dialog-panel') ||
    !responsiveToolbarCssText.includes('.kg-responsive-wide-dialog-message') ||
    !responsiveToolbarCssText.includes('--kg-responsive-wide-dialog-message-max-width') ||
    !responsiveToolbarCssText.includes('.kg-main-panel-card') ||
    !responsiveToolbarCssText.includes('.kg-main-panel-card--open') ||
    !responsiveToolbarCssText.includes('.kg-main-panel-card--collapsed') ||
    !responsiveToolbarCssText.includes('.kg-responsive-floating-notice-card') ||
    !responsiveToolbarCssText.includes('--kg-floating-notice-card-width') ||
    !responsiveToolbarCssText.includes('.kg-graph-fields-editor') ||
    !responsiveToolbarCssText.includes('.kg-graph-fields-editor--description') ||
    !responsiveToolbarCssText.includes('.kg-graph-fields-editor--template') ||
    !responsiveToolbarCssText.includes('.kg-graph-fields-editor--validation') ||
    !responsiveToolbarCssText.includes('.kg-graph-fields-editor--default-text') ||
    !responsiveToolbarCssText.includes('.kg-graph-fields-editor--default-text-expanded') ||
    !responsiveToolbarCssText.includes('.kg-graph-fields-editor--default-json') ||
    !responsiveToolbarCssText.includes('.kg-graph-fields-owner-value') ||
    !responsiveToolbarCssText.includes('--kg-graph-fields-owner-value-width') ||
    !responsiveToolbarCssText.includes('.kg-graph-fields-panel-header') ||
    !responsiveToolbarCssText.includes('--kg-graph-fields-panel-header-height') ||
    !responsiveToolbarCssText.includes('--kg-graph-fields-panel-header-height: var(--kg-touch-target, 44px)') ||
    !responsiveToolbarCssText.includes('--kg-graph-fields-panel-header-padding-inline') ||
    !responsiveToolbarCssText.includes('.kg-graph-fields-panel-strip') ||
    !responsiveToolbarCssText.includes('--kg-graph-fields-panel-strip-padding-inline') ||
    !responsiveToolbarCssText.includes('--kg-graph-fields-panel-strip-padding-block') ||
    !responsiveToolbarCssText.includes('--kg-graph-fields-panel-strip-padding-inline: 0.75rem') ||
    !responsiveToolbarCssText.includes('--kg-graph-fields-panel-strip-padding-block: 0.75rem') ||
    !responsiveToolbarCssText.includes('.kg-graph-fields-field-input') ||
    !responsiveToolbarCssText.includes('--kg-graph-fields-field-input-height') ||
    !responsiveToolbarCssText.includes('--kg-graph-fields-field-input-padding-inline') ||
    !responsiveToolbarCssText.includes('.kg-graph-fields-field-input--comfortable') ||
    !responsiveToolbarCssText.includes('--kg-graph-fields-field-input-height: 2.25rem') ||
    !responsiveToolbarCssText.includes('--kg-graph-fields-field-input-height: var(--kg-touch-target, 44px)') ||
    !responsiveToolbarCssText.includes('--kg-graph-fields-field-input-padding-inline: 0.75rem') ||
    !responsiveToolbarCssText.includes('.kg-graph-fields-field-input--short') ||
    !responsiveToolbarCssText.includes('--kg-graph-fields-short-field-input-width') ||
    !responsiveToolbarCssText.includes('--kg-graph-fields-short-field-input-width: 100%') ||
    !responsiveToolbarCssText.includes('.kg-graph-fields-type-select') ||
    !responsiveToolbarCssText.includes('--kg-graph-fields-type-select-height') ||
    !responsiveToolbarCssText.includes('--kg-graph-fields-type-select-width') ||
    !responsiveToolbarCssText.includes('--kg-graph-fields-type-select-height: var(--kg-touch-target, 44px)') ||
    !responsiveToolbarCssText.includes('.kg-graph-fields-inline-field-shell') ||
    !responsiveToolbarCssText.includes('.kg-graph-fields-inline-field') ||
    !responsiveToolbarCssText.includes('--kg-graph-fields-inline-field-height') ||
    !responsiveToolbarCssText.includes('--kg-graph-fields-inline-field-padding-inline') ||
    !responsiveToolbarCssText.includes('--kg-graph-fields-inline-field-height: var(--kg-touch-target, 44px)') ||
    !responsiveToolbarCssText.includes('--kg-graph-fields-inline-field-padding-inline: 0.75rem') ||
    !responsiveToolbarCssText.includes('.kg-graph-fields-compact-icon-cell') ||
    !responsiveToolbarCssText.includes('--kg-graph-fields-compact-icon-cell-size') ||
    !responsiveToolbarCssText.includes('.kg-graph-fields-option-row') ||
    !responsiveToolbarCssText.includes('--kg-graph-fields-option-row-min-height') ||
    !responsiveToolbarCssText.includes('--kg-graph-fields-option-row-min-height: var(--kg-touch-target, 44px)') ||
    !responsiveToolbarCssText.includes('--kg-graph-fields-option-row-padding-block') ||
    !responsiveToolbarCssText.includes('.kg-graph-fields-option-drag-handle') ||
    !responsiveToolbarCssText.includes('--kg-graph-fields-option-drag-handle-size') ||
    !responsiveToolbarCssText.includes('--kg-graph-fields-option-drag-handle-size: var(--kg-touch-target, 44px)') ||
    !responsiveToolbarCssText.includes('.kg-graph-fields-option-swatch') ||
    !responsiveToolbarCssText.includes('--kg-graph-fields-option-swatch-margin-inline') ||
    !responsiveToolbarCssText.includes('.kg-graph-fields-option-action') ||
    !responsiveToolbarCssText.includes('--kg-graph-fields-option-action-size') ||
    !responsiveToolbarCssText.includes('--kg-graph-fields-option-action-size: var(--kg-touch-target, 44px)') ||
    !responsiveToolbarCssText.includes('--kg-graph-fields-option-action-margin-inline') ||
    !responsiveToolbarCssText.includes('.kg-graph-fields-option-row .kg-graph-fields-option-action') ||
    !responsiveToolbarCssText.includes('visibility: visible') ||
    !responsiveToolbarCssText.includes('.kg-graph-fields-list-row') ||
    !responsiveToolbarCssText.includes('--kg-graph-fields-list-row-padding-inline') ||
    !responsiveToolbarCssText.includes('--kg-graph-fields-list-row-padding-block') ||
    !responsiveToolbarCssText.includes('--kg-graph-fields-list-row-padding-block: 0.5rem') ||
    !responsiveToolbarCssText.includes('.kg-graph-fields-sample-row') ||
    !responsiveToolbarCssText.includes('--kg-graph-fields-sample-row-padding-inline') ||
    !responsiveToolbarCssText.includes('--kg-graph-fields-sample-row-padding-block') ||
    !responsiveToolbarCssText.includes('--kg-graph-fields-sample-row-padding-inline: 0.5rem') ||
    !responsiveToolbarCssText.includes('--kg-graph-fields-sample-row-padding-block: 0.5rem') ||
    !responsiveToolbarCssText.includes('.kg-schema-editor-serialization-editor') ||
    !responsiveToolbarCssText.includes('.kg-schema-editor-serialization-editor--compact') ||
    !responsiveToolbarCssText.includes('.kg-schema-editor-serialization-editor--default') ||
    !responsiveToolbarCssText.includes('.kg-multiline-text-input-editor') ||
    !responsiveToolbarCssText.includes('.kg-schema-rules-text-editor') ||
    !responsiveToolbarCssText.includes('.kg-panel-code-editor-frame') ||
    !responsiveToolbarCssText.includes('--kg-panel-code-editor-frame-min-height') ||
    !responsiveToolbarCssText.includes('.kg-panel-code-editor-frame--small') ||
    !responsiveToolbarCssText.includes('.kg-panel-code-editor-frame--compact') ||
    !responsiveToolbarCssText.includes('.kg-panel-code-editor-frame--large') ||
    !responsiveToolbarCssText.includes('.kg-panel-code-editor-frame--tall') ||
    !responsiveToolbarCssText.includes('.kg-graph-rag-workflow-token') ||
    !responsiveToolbarCssText.includes('.kg-graph-rag-workflow-token--compact') ||
    !responsiveToolbarCssText.includes('--kg-graph-rag-workflow-token-max-width') ||
    !responsiveToolbarCssText.includes('.kg-stats-token-chart-slot') ||
    !responsiveToolbarCssText.includes('--kg-stats-token-chart-slot-min-height') ||
    !responsiveToolbarCssText.includes('.kg-compact-inline-control') ||
    !responsiveToolbarCssText.includes('--kg-compact-inline-control-padding-inline') ||
    !responsiveToolbarCssText.includes('--kg-compact-inline-control-padding-block') ||
    !responsiveToolbarCssText.includes('.kg-compact-inline-chip') ||
    !responsiveToolbarCssText.includes('--kg-compact-inline-chip-gap') ||
    !responsiveToolbarCssText.includes('.kg-micro-inline-control') ||
    !responsiveToolbarCssText.includes('--kg-micro-inline-control-padding-inline') ||
    !responsiveToolbarCssText.includes('--kg-micro-inline-control-padding-block') ||
    !responsiveToolbarCssText.includes('.kg-micro-inline-chip') ||
    !responsiveToolbarCssText.includes('.kg-compact-list-row') ||
    !responsiveToolbarCssText.includes('--kg-compact-list-row-padding-inline') ||
    !responsiveToolbarCssText.includes('--kg-compact-list-row-padding-block') ||
    !responsiveToolbarCssText.includes('.kg-responsive-chip') ||
    !responsiveToolbarCssText.includes('--kg-responsive-chip-padding-inline') ||
    !responsiveToolbarCssText.includes('--kg-responsive-chip-padding-block') ||
    !responsiveToolbarCssText.includes('.kg-responsive-badge-chip') ||
    !responsiveToolbarCssText.includes('--kg-responsive-badge-chip-padding-inline') ||
    !responsiveToolbarCssText.includes('--kg-responsive-badge-chip-padding-block') ||
    !responsiveToolbarCssText.includes('.kg-inline-status-chip') ||
    !responsiveToolbarCssText.includes('--kg-inline-status-chip-padding-inline') ||
    !responsiveToolbarCssText.includes('--kg-inline-status-chip-padding-block') ||
    !responsiveToolbarCssText.includes('.kg-panel-sticky-overlap') ||
    !responsiveToolbarCssText.includes('--kg-panel-sticky-overlap-top') ||
    !responsiveToolbarCssText.includes('.kg-responsive-tooltip-expanded-body') ||
    !responsiveToolbarCssText.includes('.kg-responsive-tooltip-key-label') ||
    !responsiveToolbarCssText.includes('.kg-responsive-status-badge') ||
    !responsiveToolbarCssText.includes('--kg-responsive-status-badge-min-width') ||
    !responsiveToolbarCssText.includes('.kg-responsive-status-badge-message') ||
    !responsiveToolbarCssText.includes('--kg-responsive-status-badge-message-max-width') ||
    !responsiveToolbarCssText.includes('.kg-responsive-status-badge-detail') ||
    !responsiveToolbarCssText.includes('--kg-responsive-status-badge-detail-max-width') ||
    !responsiveToolbarCssText.includes('.kg-compact-error-feedback-badge') ||
    !responsiveToolbarCssText.includes('--kg-compact-error-feedback-badge-height') ||
    !responsiveToolbarCssText.includes('.kg-embedded-workspace-left') ||
    !responsiveToolbarCssText.includes('--kg-embedded-workspace-left-min-width') ||
    !responsiveToolbarCssText.includes('.kg-responsive-tag-input-form') ||
    !responsiveToolbarCssText.includes('--kg-responsive-tag-input-form-min-width') ||
    !responsiveToolbarCssText.includes('.kg-responsive-constrained-value-field') ||
    !responsiveToolbarCssText.includes('--kg-responsive-constrained-value-field-max-width') ||
    !responsiveToolbarCssText.includes('.kg-settings-value-wrapper') ||
    !responsiveToolbarCssText.includes('--kg-settings-value-wrapper-min-height') ||
    !responsiveToolbarCssText.includes('.kg-responsive-panel-flex-input') ||
    !responsiveToolbarCssText.includes('.kg-responsive-panel-flex-input--compact') ||
    !responsiveToolbarCssText.includes('--kg-responsive-panel-flex-input-min-width') ||
    !responsiveToolbarCssText.includes('.kg-responsive-panel-inline-field') ||
    !responsiveToolbarCssText.includes('--kg-responsive-panel-inline-field-height') ||
    !responsiveToolbarCssText.includes('--kg-responsive-panel-inline-field-padding-inline') ||
    !responsiveToolbarCssText.includes('--kg-responsive-panel-inline-field-padding-block') ||
    !responsiveToolbarCssText.includes('--kg-responsive-panel-inline-field-height: var(--kg-touch-target, 44px)') ||
    !responsiveToolbarCssText.includes('--kg-responsive-panel-inline-field-padding-inline: 0.75rem') ||
    !responsiveToolbarCssText.includes('--kg-responsive-panel-inline-field-padding-block: 0.5rem') ||
    !responsiveToolbarCssText.includes('.kg-schema-property-name') ||
    !responsiveToolbarCssText.includes('--kg-schema-property-name-width') ||
    !responsiveToolbarCssText.includes('.kg-responsive-control-row') ||
    !responsiveToolbarCssText.includes('--kg-responsive-control-row-gap') ||
    !responsiveToolbarCssText.includes('.kg-responsive-split-control-half') ||
    !responsiveToolbarCssText.includes('.kg-responsive-split-control-half.kg-responsive-split-control-half') ||
    !responsiveToolbarCssText.includes('width: calc(50% - (var(--kg-responsive-control-row-gap) / 2))') ||
    !responsiveToolbarCssText.includes('.kg-responsive-control-touch-target') ||
    !responsiveToolbarCssText.includes('.kg-responsive-control-touch-target--compact') ||
    !responsiveToolbarCssText.includes('.kg-responsive-control-input') ||
    !responsiveToolbarCssText.includes('.kg-responsive-control-select') ||
    !responsiveToolbarCssText.includes('.kg-responsive-control-toggle-group') ||
    !responsiveToolbarCssText.includes('--kg-responsive-control-toggle-group-gap') ||
    !responsiveToolbarCssText.includes('.kg-responsive-control-toggle-button') ||
    !responsiveToolbarCssText.includes('.kg-responsive-control-value-row') ||
    !responsiveToolbarCssText.includes('--kg-responsive-control-value-row-gap') ||
    !responsiveToolbarCssText.includes('.kg-responsive-control-value-row--compact') ||
    !responsiveToolbarCssText.includes('.kg-responsive-control-inline-fill') ||
    !responsiveToolbarCssText.includes('.kg-responsive-control-hint') ||
    !responsiveToolbarCssText.includes('--kg-responsive-control-hint-min-width') ||
    !responsiveToolbarCssText.includes('--kg-responsive-control-hint-font-size') ||
    !responsiveToolbarCssText.includes('.kg-responsive-text-action-button') ||
    !responsiveToolbarCssText.includes('--kg-responsive-text-action-button-min-width') ||
    !responsiveToolbarCssText.includes('.kg-responsive-text-action-button--wide') ||
    !responsiveToolbarCssText.includes('.kg-responsive-panel-text-action-button') ||
    !responsiveToolbarCssText.includes('--kg-responsive-panel-text-action-button-height') ||
    !responsiveToolbarCssText.includes('--kg-responsive-panel-text-action-button-padding-inline') ||
    !responsiveToolbarCssText.includes('--kg-responsive-panel-text-action-button-height: var(--kg-touch-target, 44px)') ||
    !responsiveToolbarCssText.includes('--kg-responsive-panel-text-action-button-padding-inline: 0.75rem') ||
    !responsiveToolbarCssText.includes('.kg-responsive-panel-field-row') ||
    !responsiveToolbarCssText.includes('--kg-responsive-panel-field-label-width') ||
    !responsiveToolbarCssText.includes('.kg-responsive-panel-field-label--wide') ||
    !responsiveToolbarCssText.includes('.kg-responsive-panel-field-value') ||
    !responsiveToolbarCssText.includes('.kg-responsive-panel-header-row') ||
    !responsiveToolbarCssText.includes('--kg-responsive-panel-header-row-min-height') ||
    !responsiveToolbarCssText.includes('.kg-responsive-panel-header-actions') ||
    !responsiveToolbarCssText.includes('--kg-responsive-panel-header-actions-max-width') ||
    !responsiveToolbarCssText.includes('.kg-responsive-panel-header-secondary') ||
    !responsiveToolbarCssText.includes('--kg-responsive-panel-header-secondary-max-width') ||
    !responsiveToolbarCssText.includes('.kg-responsive-panel-header-secondary--wide') ||
    !responsiveToolbarCssText.includes('.kg-design-panel-header-row') ||
    !responsiveToolbarCssText.includes('--kg-design-panel-header-row-padding-inline') ||
    !responsiveToolbarCssText.includes('.kg-design-panel-search-block') ||
    !responsiveToolbarCssText.includes('--kg-design-panel-search-block-padding-inline') ||
    !responsiveToolbarCssText.includes('.kg-design-panel-search-field') ||
    !responsiveToolbarCssText.includes('--kg-design-panel-search-field-padding-inline') ||
    !responsiveToolbarCssText.includes('.kg-design-panel-content') ||
    !responsiveToolbarCssText.includes('--kg-design-panel-content-padding-inline') ||
    !responsiveToolbarCssText.includes('.kg-design-panel-empty-row') ||
    !responsiveToolbarCssText.includes('--kg-design-panel-empty-row-padding-inline') ||
    !responsiveToolbarCssText.includes('.kg-design-panel-list-row') ||
    !responsiveToolbarCssText.includes('--kg-design-panel-list-row-padding-inline') ||
    !responsiveToolbarCssText.includes('.kg-design-panel-tree-row') ||
    !responsiveToolbarCssText.includes('--kg-design-panel-tree-row-padding-inline') ||
    !responsiveToolbarCssText.includes('.kg-design-panel-row-action') ||
    !responsiveToolbarCssText.includes('--kg-design-panel-row-action-padding-inline') ||
    !responsiveToolbarCssText.includes('.kg-design-panel-reorder-row') ||
    !responsiveToolbarCssText.includes('--kg-design-panel-reorder-row-gap') ||
    !responsiveToolbarCssText.includes('.kg-data-view-table-frame') ||
    !responsiveToolbarCssText.includes('--kg-data-view-table-frame-max-height') ||
    !responsiveToolbarCssText.includes('.kg-data-view-settings-row-value') ||
    !responsiveToolbarCssText.includes('--kg-data-view-settings-row-value-max-width') ||
    !responsiveToolbarCssText.includes('.kg-data-view-settings-layout-choice') ||
    !responsiveToolbarCssText.includes('--kg-data-view-settings-layout-choice-min-width') ||
    !responsiveToolbarCssText.includes('.kg-flow-manager-panel-header') ||
    !responsiveToolbarCssText.includes('--kg-flow-manager-panel-header-padding-inline') ||
    !responsiveToolbarCssText.includes('--kg-flow-manager-panel-header-padding-block') ||
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
    !responsiveToolbarCssText.includes('.kg-flow-manager-table-frame') ||
    !responsiveToolbarCssText.includes('--kg-flow-manager-table-frame-height') ||
    !responsiveToolbarCssText.includes('.kg-flow-manager-table-cell-text') ||
    !responsiveToolbarCssText.includes('.kg-flow-manager-table-cell-text--node') ||
    !responsiveToolbarCssText.includes('.kg-flow-manager-table-cell-text--editor') ||
    !responsiveToolbarCssText.includes('.kg-flow-manager-table-cell-text--form') ||
    !responsiveToolbarCssText.includes('--kg-flow-manager-table-cell-text-max-width') ||
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
    !responsiveToolbarCssText.includes('.kg-flow-manager-spec-editor') ||
    !responsiveToolbarCssText.includes('--kg-flow-manager-spec-editor-margin-block-start') ||
    !responsiveToolbarCssText.includes('--kg-flow-manager-spec-editor-padding-inline') ||
    !responsiveToolbarCssText.includes('--kg-flow-manager-spec-editor-padding-block') ||
    !responsiveToolbarCssText.includes('--kg-flow-manager-spec-editor-min-height') ||
    !responsiveToolbarCssText.includes('.kg-history-recent-file-location') ||
    !responsiveToolbarCssText.includes('--kg-history-recent-file-location-max-width') ||
    !responsiveToolbarCssText.includes('inset-block-end: calc(var(--kg-safe-bottom) + var(--kg-mobile-bottom-dock-clearance) + 0.5rem);')
  ) {
    throw new Error('expected safe viewport panels, side panels, canvas status panels, diagnostic overlays, structured editors, floating action rows, kanban lanes, data-view panels, markdown geo/safe-html panels, preview overlays, wide dialogs, main panel cards, graph-fields editors, schema serialization editors, multiline text input editors, schema rules text editors, panel code editor frames, graph-stats token chart slots, responsive min-width owners, constrained value fields, split controls, touch targets, text action buttons, panel field rows, Storyboard Widget manager frames, History recent-file paths, and anchor previews to use shared responsive owner classes')
  }
  if (
    !toolMenuText.includes('UI_RESPONSIVE_SAFE_VIEWPORT_PANEL_CLASSNAME') ||
    toolMenuText.includes('w-80') ||
    !toolbarDropdownSelectText.includes("menuWidthClass = ''") ||
    toolbarDropdownSelectText.includes("menuWidthClass = 'w-72'") ||
    interactionModeSelectText.includes('menuWidthClass="w-72"') ||
    ![zoomModeSelectText, documentModeSelectText, editorWorkspaceSelectText].every(text => text.includes('UI_RESPONSIVE_COMPACT_TOOLBAR_DROPDOWN_WIDTH_CLASSNAME')) ||
    [zoomModeSelectText, documentModeSelectText, editorWorkspaceSelectText].some(text => text.includes('menuWidthClass="w-64"')) ||
    !canvas2dRendererSelectText.includes('UI_RESPONSIVE_EXTRA_WIDE_TOOLBAR_DROPDOWN_WIDTH_CLASSNAME') ||
    canvas2dRendererSelectText.includes('[--kg-toolbar-dropdown-width:24rem]') ||
    canvas2dRendererSelectText.includes('max-w-[calc(100vw_-_2rem)]') ||
    ![toolMenuText, designFloatingPanelText].every(text => text.includes('UI_RESPONSIVE_NARROW_TOOLBAR_DROPDOWN_WIDTH_CLASSNAME')) ||
    [toolMenuText, designFloatingPanelText].some(text => text.includes('menuWidthClass="w-56"')) ||
    ![mainPanelStoryboardWidgetManagerHeaderText, storyboardWidgetSpecificationTabText].every(text => text.includes('UI_RESPONSIVE_SLIM_TOOLBAR_DROPDOWN_WIDTH_CLASSNAME')) ||
    [mainPanelStoryboardWidgetManagerHeaderText, storyboardWidgetSpecificationTabText].some(text => text.includes('menuWidthClass="w-44"')) ||
    (historyViewText.includes('ToolbarDropdownSelect') && !historyViewText.includes('UI_RESPONSIVE_TINY_TOOLBAR_DROPDOWN_WIDTH_CLASSNAME')) ||
    !historyViewText.includes('UI_RESPONSIVE_HISTORY_RECENT_FILE_LOCATION_CLASSNAME') ||
    historyViewText.includes('menuWidthClass="w-40"') ||
    historyViewText.includes('max-w-[200px]') ||
    !storyboardWidgetInspectorTabsText.includes('UI_RESPONSIVE_TINY_TOOLBAR_DROPDOWN_WIDTH_CLASSNAME') ||
    storyboardWidgetInspectorTabsText.includes('menuWidthClass="w-40"') ||
    !searchPanelText.includes('UI_RESPONSIVE_WIDE_TOOLBAR_DROPDOWN_PANEL_CLASSNAME') ||
    !searchPanelText.includes('UI_RESPONSIVE_TOOLBAR_FIELD_CLASSNAME') ||
    !toolbarDropdownSelectText.includes('UI_RESPONSIVE_TOUCH_MENU_OPTION_ROW_CLASSNAME') ||
    !toolbarDropdownSelectText.includes('UI_RESPONSIVE_TOOLBAR_DROPDOWN_OPTION_META_CLASSNAME') ||
    !toolbarDropdownSelectText.includes('UI_RESPONSIVE_TOOLBAR_DROPDOWN_OPTION_HINT_CLASSNAME') ||
    !editorWorkspaceSelectText.includes('UI_RESPONSIVE_MENU_OPTION_ROW_CLASSNAME') ||
    !launchDropdownText.includes('kg-launch-menu-root') ||
    !launchDropdownText.includes('UI_RESPONSIVE_DEFAULT_GLYPH_CLASSNAME') ||
    !launchDropdownText.includes("const menuIconClass = cn(UI_RESPONSIVE_DEFAULT_GLYPH_CLASSNAME, 'shrink-0')") ||
    toolbarDropdownSelectText.includes('max-w-[45%]') ||
    toolbarDropdownSelectText.includes('gap-2 rounded px-2 py-1 text-sm') ||
    toolbarDropdownSelectText.includes('px-2 py-0.5 text-[10px]') ||
    editorWorkspaceSelectText.includes('gap-2 rounded px-2 py-1 text-sm') ||
    searchPanelText.includes('w-80') ||
    searchPanelText.includes('w-full min-w-0 h-[var(--kg-control-height,28px)] px-2 rounded border') ||
    launchDropdownText.includes("const menuIconClass = 'w-4 h-4 shrink-0'") ||
    launchDropdownText.includes('const menuIconClass = "w-4 h-4 shrink-0"') ||
    launchDropdownText.includes('w-80')
  ) {
    throw new Error('expected floating tool, toolbar dropdown width variants, SearchPanel, and LaunchDropdown widths/icons to live in shared responsive owners')
  }
  const toolbarSettingsPanelBodyTexts = [
    radarGalaxyRendererSettingsText,
    designWireframeSettingsText,
    layoutModeRendererSettingsText,
    edgeTypesRendererSettingsText,
    flowchartRendererSettingsText,
  ]
  if (
    !toolbarStylesText.includes('uiToolbarSettingsPanelBodyClassName') ||
    !toolbarStylesText.includes('uiToolbarSettingsPanelSubsectionClassName') ||
    !toolbarStylesText.includes('uiToolbarSettingsPanelFooterClassName') ||
    !toolbarStylesText.includes('uiToolbarSettingsPanelActionGroupClassName') ||
    !toolbarStylesText.includes('uiToolbarSettingsPanelTextActionClassName') ||
    !responsiveToolbarCssText.includes('.kg-toolbar-settings-panel-body') ||
    !responsiveToolbarCssText.includes('.kg-toolbar-settings-panel-subsection') ||
    !responsiveToolbarCssText.includes('.kg-toolbar-settings-panel-footer') ||
    !responsiveToolbarCssText.includes('.kg-toolbar-settings-panel-action-group') ||
    !responsiveToolbarCssText.includes('.kg-toolbar-settings-panel-text-action') ||
    !responsiveToolbarCssText.includes('--kg-toolbar-settings-panel-body-padding-inline') ||
    !responsiveToolbarCssText.includes('--kg-toolbar-settings-panel-body-gap') ||
    !responsiveToolbarCssText.includes('--kg-toolbar-settings-panel-subsection-padding-block-start') ||
    !responsiveToolbarCssText.includes('--kg-toolbar-settings-panel-subsection-gap') ||
    !responsiveToolbarCssText.includes('--kg-toolbar-settings-panel-footer-gap') ||
    !responsiveToolbarCssText.includes('--kg-toolbar-settings-panel-action-group-gap') ||
    !responsiveToolbarCssText.includes('--kg-toolbar-settings-panel-text-action-min-height') ||
    !responsiveToolbarCssText.includes('--kg-toolbar-settings-panel-text-action-padding-inline') ||
    !toolbarSettingsPanelBodyTexts.every(text => text.includes('uiToolbarSettingsPanelBodyClassName')) ||
    !layoutModeRendererSettingsText.includes('uiToolbarSettingsPanelSubsectionClassName') ||
    !layoutModeRendererSettingsText.includes('uiToolbarSettingsPanelFooterClassName') ||
    !layoutModeRendererSettingsText.includes('uiToolbarSettingsPanelActionGroupClassName') ||
    !layoutModeRendererSettingsText.includes('uiToolbarSettingsPanelTextActionClassName') ||
    toolbarSettingsPanelBodyTexts.some(text => text.includes('px-3 py-2 space-y-2')) ||
    layoutModeRendererSettingsText.includes('pt-2 border-t border-[color:var(--kg-border)] space-y-2') ||
    layoutModeRendererSettingsText.includes('flex items-center justify-between gap-2 pt-1') ||
    layoutModeRendererSettingsText.includes('px-2 py-1 rounded') ||
    flowchartRendererSettingsText.includes('0.5rem, env(safe-area-inset-bottom)')
  ) {
    throw new Error('expected toolbar renderer/settings panel body spacing to live in the shared toolbar settings panel body owner')
  }
  if (
    !collaborationViewText.includes('UI_RESPONSIVE_PANEL_FLEX_INPUT_CLASSNAME') ||
    collaborationViewText.includes('min-w-[14rem]')
  ) {
    throw new Error('expected Collaboration panel invite and answer input shells to use the shared responsive flex input owner')
  }
  if (
    ![
      floatingPropsPanelText,
      designTokensPanelText,
      designDomTreePanelText,
      designLayersPanelText,
      designDomInspectPanelText,
    ].every(text => text.includes('UI_RESPONSIVE_FLOATING_PANEL_SUBPANEL_CLASSNAME')) ||
    [
      floatingPropsPanelText,
      designTokensPanelText,
      designDomTreePanelText,
      designLayersPanelText,
      designDomInspectPanelText,
    ].some(text => text.includes('min-w-56'))
  ) {
    throw new Error('expected floating/design subpanel min widths to live in the shared responsive subpanel owner')
  }
  const designPanelTexts = [designDomTreePanelText, designLayersPanelText]
  if (
    !designDomTreePanelText.includes('UI_RESPONSIVE_DESIGN_PANEL_CONTENT_CLASSNAME') ||
    !designDomTreePanelText.includes('UI_RESPONSIVE_DESIGN_PANEL_TREE_ROW_CLASSNAME') ||
    !designLayersPanelText.includes('UI_RESPONSIVE_DESIGN_PANEL_LIST_ROW_CLASSNAME') ||
    !designLayersPanelText.includes('UI_RESPONSIVE_DESIGN_PANEL_REORDER_ROW_CLASSNAME') ||
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
    designDomTreePanelText.includes('flex items-center gap-1 px-2 py-1.5') ||
    designDomTreePanelText.includes('block px-2 py-2 text-[10px]') ||
    designLayersPanelText.includes('px-2 py-2 flex items-center gap-2') ||
    designLayersPanelText.includes('block px-3 py-2 text-[10px]') ||
    designLayersPanelText.includes('className="flex items-center gap-1"')
  ) {
    throw new Error('expected Design DOM and Layers panel rows/search surfaces to use shared responsive design panel owners')
  }
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
  const colorSwatchConsumerTexts = [
    settingsUiText,
    rendererPaletteSettingsText,
    graphFieldsStylesText,
  ]
  if (
    !settingsUiText.includes('UI_RESPONSIVE_COLOR_SWATCH_DASHED_CLASSNAME') ||
    !colorSwatchConsumerTexts.every(text => text.includes('UI_RESPONSIVE_COLOR_SWATCH_CLASSNAME')) ||
    !panelKeyTypeColorTextValueRowText.includes('UI_RESPONSIVE_COLOR_SWATCH_CLASSNAME') ||
    ![threeViewBackgroundFogSectionText, threeViewStarfieldSectionText].every(text => text.includes('PanelKeyTypeColorTextValueRow')) ||
    colorSwatchConsumerTexts.some(text =>
      text.includes(staleColorSwatchSizingClass()) ||
      text.includes(staleDashedColorSwatchSizingClass())
    )
  ) {
    throw new Error('expected settings, renderer palette, Three view, and Graph Fields color swatches to use the shared responsive color swatch owner')
  }
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
    !collapsibleSubsectionText.includes('UI_RESPONSIVE_PANEL_HEADER_ROW_CLASSNAME') ||
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
    !canvasArrangeActionBarText.includes('flex flex-nowrap') ||
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
  const explorerPaneToggleIdx = markdownWorkspaceToolbarText.indexOf('Show Explorer pane')
  const binPaneToggleIdx = markdownWorkspaceToolbarText.indexOf('Show binary model pane')
  const jsonPaneToggleIdx = markdownWorkspaceToolbarText.indexOf('Show JSON editor pane')
  const markdownPaneToggleIdx = markdownWorkspaceToolbarText.indexOf('Show Markdown editor pane')
  const viewerPaneToggleIdx = markdownWorkspaceToolbarText.indexOf('Show Viewer preview pane')
  const htmlPaneToggleIdx = markdownWorkspaceToolbarText.indexOf('Show HTML viewer pane')
  const canvasPaneToggleIdx = markdownWorkspaceToolbarText.indexOf('Show Canvas pane')
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
  const graphRecordDbText = readUtf8(path.resolve(root, 'src/lib/graph-record-db/graphRecordDb.impl.ts'))
  const kanbanReorderText = readUtf8(path.resolve(root, 'src/features/markdown/ui/kanban/kanbanReorder.ts'))
  const kanbanShortcutCopyText = readUtf8(path.resolve(root, 'src/features/markdown/ui/kanban/kanbanShortcutCopy.ts'))
  const panelConfigText = readUtf8(path.resolve(root, 'src/features/panels/config.ts'))
  const kanbanDropPreviewText = readUtf8(path.resolve(root, 'src/features/markdown/ui/kanban/KanbanDropPreview.tsx'))
  const kanbanDragHookText = readUtf8(path.resolve(root, 'src/features/markdown/ui/kanban/useKanbanDragAndDrop.ts'))
  const kanbanDragVisualStateText = readUtf8(path.resolve(root, 'src/features/markdown/ui/kanban/kanbanDragVisualState.ts'))
  const kanbanDragIntentText = readUtf8(path.resolve(root, 'src/features/markdown/ui/kanban/kanbanDragIntent.ts'))
  const kanbanMoveOutcomesText = readUtf8(path.resolve(root, 'src/features/markdown/ui/kanban/kanbanMoveOutcomes.ts'))
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
  if (!kanbanDragHookText.includes('registerFocusableRowElement') || !kanbanDragHookText.includes('requestFocusRow') || !kanbanDragHookText.includes('attemptFocusRow')) {
    throw new Error('expected graph-table kanban focus recovery to stay centralized in the shared drag owner')
  }
  if (!kanbanDragHookText.includes('const commitMove = React.useCallback') || !kanbanDragHookText.includes('const reportBlockedMove = React.useCallback') || !kanbanDragHookText.includes("commitMove(move) === 'committed' ? 'commit' : 'no-op'")) {
    throw new Error('expected graph-table kanban pointer and keyboard moves to share one upstream commit/no-op/boundary resolver')
  }
  if (!kanbanDragVisualStateText.includes('export const getKanbanCardDragVisualState') || !kanbanDragVisualStateText.includes('isCommitFlash') || !graphTableKanbanViewText.includes('getKanbanCardDragVisualState') || !graphTableKanbanViewText.includes('getKanbanLaneDragVisualState') || !graphTableKanbanViewText.includes('commitFlashGroupKey')) {
    throw new Error('expected graph-table kanban drag ghost, lane hover emphasis, and commit flash to reuse the shared visual state helper')
  }
  if (kanbanDragHookText.indexOf('const updateAutoScrollTargets = React.useCallback') > kanbanDragHookText.indexOf('const resolveDropTarget = React.useCallback')) {
    throw new Error('expected graph-table shared auto-scroll callback to be declared before the shared drop-target resolver to avoid TDZ runtime crashes')
  }
  if (!kanbanDragHookText.includes('const clearActiveDropTarget = React.useCallback') || !kanbanDragHookText.includes('if (dragOverRowIdRef.current == null) {') || !kanbanDragHookText.includes('clearActiveDropTarget()')) {
    throw new Error('expected graph-table lane-end drag previews to clear from the shared drag owner when the pointer leaves the lane target')
  }
  if (!kanbanDragHookText.includes('const [dragOutcomeSequence, setDragOutcomeSequence] = React.useState(0)') || !kanbanDragHookText.includes('setDragOutcomeSequence(value => value + 1)') || !graphTableKanbanViewText.includes('kanbanDrag.dragOutcomeSequence')) {
    throw new Error('expected graph-table repeated outcome announcements to be driven by the shared outcome sequence')
  }
  if (!kanbanDragHookText.includes('clearCommitFeedback()') || !kanbanDragHookText.includes("kind: 'no-op'")) {
    throw new Error('expected graph-table kanban no-op moves to clear stale success feedback in the shared drag owner')
  }
  if (!kanbanDragHookText.includes('setCommitFlashRowId(move.rowId)') || !graphTableKanbanViewText.includes('commitFlashRowId === row.id')) {
    throw new Error('expected graph-table kanban commit flash to follow the moved row from the shared drag owner')
  }
  if (!kanbanDragIntentText.includes('export const buildKanbanCardDropIntentLabel') || !graphTableKanbanViewText.includes('buildKanbanDragStatusText') || !graphTableKanbanViewText.includes('activeDragStatusText')) {
    throw new Error('expected graph-table kanban drag intent captions and status text to reuse the shared intent helper')
  }
  if (
    !graphTableKanbanViewText.includes('const liveRegionKey = [') ||
    !graphTableKanbanViewText.includes('kanbanDrag.dragOutcomeSequence') ||
    !graphTableKanbanViewText.includes('aria-live="polite">{statusPillText}</section>') ||
    !graphTableKanbanViewText.includes('UI_RESPONSIVE_DATA_VIEW_KANBAN_STATUS_ROW_CLASSNAME') ||
    !markdownDataViewKanbanViewText.includes('UI_RESPONSIVE_DATA_VIEW_KANBAN_STATUS_ROW_CLASSNAME') ||
    graphTableKanbanViewText.includes("setLiveMessage(statusPillText || '')") ||
    graphTableKanbanViewText.includes('min-h-[28px]') ||
    markdownDataViewKanbanViewText.includes('min-h-[28px]')
  ) {
    throw new Error('expected graph-table and markdown kanban live-region announcements to stay aligned with the shared status pill and status-row owner without local churn')
  }
  if (!kanbanMoveOutcomesText.includes("kind: 'blocked' | 'cancelled' | 'no-op' | 'committed'") || !kanbanMoveOutcomesText.includes('export type KanbanBlockedMoveReason') || !kanbanMoveOutcomesText.includes('export const isKanbanMoveNoOp') || !graphTableKanbanViewText.includes('dragOutcomeMessage') || !graphTableKanbanViewText.includes('commitFlashRowId') || !graphTableKanbanViewText.includes('statusPillText')) {
    throw new Error('expected graph-table kanban success, cancel, no-op, and boundary outcomes to reuse the shared move outcome helper')
  }
  if (!graphTableKanbanViewText.includes('registerFocusableRowElement') || !graphTableKanbanViewText.includes('kanbanDrag.commitMove({') || !graphTableKanbanViewText.includes('kanbanDrag.reportBlockedMove({') || !graphTableKanbanViewText.includes("'start-of-lane'") || !graphTableKanbanViewText.includes("'start-of-board'") || !graphTableKanbanViewText.includes("'end-of-board'")) {
    throw new Error('expected graph-table kanban view to reuse the shared keyboard commit, boundary feedback, and focus recovery path')
  }
  if (!kanbanReorderText.includes('export const resolveKanbanGroupOrder') || !graphTableKanbanViewText.includes('resolveKanbanGroupOrder({')) {
    throw new Error('expected graph-table kanban lanes to reuse the shared lane ordering helper instead of local alphabetical sorting')
  }
  if (!graphRecordDbText.includes('export const reorderGraphRecordRows') || graphRecordDbText.includes('await doc.incrementalPatch({ order: nextOrder, data: nextData, updatedAtMs: now })')) {
    throw new Error('expected graph-table db owner to persist manual row reorder upstream and preserve it during graph sync')
  }
  if (!responsiveToolbarCssText.includes('.kg-toast-card') || !toastHostText.includes('kg-toast-list')) {
    throw new Error('expected toast notifications to use valid shared mobile viewport sizing')
  }
  if ([
    explorerSearchControlText,
    explorerHeaderActionsText,
    graphTableKanbanViewText,
    toastHostText,
    designCanvasEditorChromeText,
    designCanvasWebpageStatusPanelText,
    graphEditorRightPanelText,
    toolMenuText,
    markdownCommentPreviewOverlayText,
    markdownYouTubeTimestampPreviewText,
    staticRichMediaPanelTextAnchorOverlayText,
    canvas2dRendererSelectText,
    geoJsonGeoPanelRendererText,
    graphDataTableFieldsPanelText,
    graphDataTableFilterPanelText,
    graphDataTableSortPanelText,
    graphDataTableGroupPanelText,
  ].some(text => text.includes('calc(100vw-') || text.includes('calc(100vh-'))) {
    throw new Error('expected mobile viewport calc classes to avoid invalid no-space calc syntax')
  }
  if (!cssText.includes('min-height: var(--kg-control-height, 36px);')) {
    throw new Error('expected collapsed toolbar and header height to follow the shared control height token')
  }
  if (
    !importUrlPromptText.includes('kg-import-url-prompt') ||
    !importUrlPromptText.includes('kg-import-url-actions') ||
    !importUrlPromptText.includes('UI_RESPONSIVE_IMPORT_URL_PRESET_ACTION_CLASSNAME') ||
    !importUrlPromptText.includes('UI_RESPONSIVE_IMPORT_URL_FIELD_CLASSNAME') ||
    !importUrlPromptText.includes('UI_RESPONSIVE_IMPORT_URL_CONFIRM_ACTION_CLASSNAME') ||
    !importUrlRendererSelectText.includes('UI_RESPONSIVE_IMPORT_URL_FIELD_CLASSNAME') ||
    !launchDropdownImportUrlItemText.includes('UI_RESPONSIVE_IMPORT_URL_ADDON_ACTION_CLASSNAME') ||
    importUrlPromptText.includes('h-6 px-2 inline-flex items-center justify-center rounded border text-xs') ||
    importUrlPromptText.includes('kg-import-url-input flex-1 min-w-0 h-[var(--kg-control-height,28px)] px-2 rounded border box-border text-xs') ||
    importUrlPromptText.includes('kg-import-url-confirm h-[var(--kg-control-height,28px)] px-2 inline-flex items-center justify-center rounded border text-xs') ||
    importUrlRendererSelectText.includes('h-[var(--kg-control-height,28px)] min-w-0 flex-1 px-2 rounded border text-xs')
  ) {
    throw new Error('expected Import URL controls to expose shared responsive owner classes')
  }
  if (launchDropdownText.includes('h-[var(--kg-control-height,28px)] w-[var(--kg-control-height,28px)] inline-flex items-center justify-center rounded border')) {
    throw new Error('expected LaunchDropdown Import URL addon actions to use shared responsive owner classes instead of local square sizing literals')
  }
  if (
    !responsiveToolbarCssText.includes('.kg-import-url-actions') ||
    !responsiveToolbarCssText.includes('flex-direction: column') ||
    !responsiveToolbarCssText.includes('.kg-import-url-confirm') ||
    !responsiveToolbarCssText.includes('.kg-import-url-preset-action') ||
    !responsiveToolbarCssText.includes('--kg-import-url-preset-action-height') ||
    !responsiveToolbarCssText.includes('--kg-import-url-preset-action-padding-inline') ||
    !responsiveToolbarCssText.includes('.kg-import-url-addon-action') ||
    !responsiveToolbarCssText.includes('--kg-import-url-addon-action-size: var(--kg-touch-target, 44px)') ||
    !responsiveToolbarCssText.includes('.kg-import-url-field') ||
    !responsiveToolbarCssText.includes('--kg-import-url-confirm-height') ||
    !responsiveToolbarCssText.includes('--kg-import-url-field-padding-inline')
  ) {
    throw new Error('expected Import URL controls to stack and keep touch-sized actions from shared mobile CSS')
  }
  if (!responsiveToolbarCssText.includes('[data-kg-floating-panel-root="true"]:not(.App-toolbar)') || !responsiveToolbarCssText.includes('--kg-floating-tool-menu-bottom-offset')) {
    throw new Error('expected floating tool menus to use a shared bottom-safe mobile panel placement')
  }
}

export function testCanvasTouchTargetsStayLargeAndViewportSuppressesBrowserGestures() {
  const root = process.cwd()
  const dropdownText = readUtf8(path.resolve(root, 'src/components/toolbar/ToolbarDropdownSelect.tsx'))
  const viewportText = readUtf8(path.resolve(root, 'src/components/CanvasViewport.tsx'))

  if (
    !dropdownText.includes('UI_RESPONSIVE_TOUCH_MENU_OPTION_ROW_CLASSNAME') ||
    !dropdownText.includes('UI_RESPONSIVE_COMPACT_GLYPH_CLASSNAME') ||
    !dropdownText.includes('toolbarDropdownChevronClassName')
  ) {
    throw new Error('expected toolbar dropdown option rows and nested chevrons to keep shared touch-sized hit targets')
  }
  if (dropdownText.includes('gap-2 rounded px-2 py-1 text-sm') || dropdownText.includes('px-2 py-0.5 text-[10px]') || dropdownText.includes('h-3 w-3') || dropdownText.includes('w-3 h-3')) {
    throw new Error('expected toolbar dropdown row, hint, and chevron sizing to stay in shared responsive owners')
  }
  if (!dropdownText.includes('kg-toolbar-dropdown-children') || !dropdownText.includes('aria-expanded')) {
    throw new Error('expected toolbar dropdown child groups to use shared click-expand-down rows')
  }
  if (dropdownText.includes('kg-toolbar-dropdown-submenu') || dropdownText.includes('left-full')) {
    throw new Error('expected toolbar dropdown groups to avoid stale side-flyout submenu placement')
  }
  if (!viewportText.includes("touchAction: 'manipulation'")) {
    throw new Error('expected canvas viewport shell to disable double-tap browser zoom delays')
  }
  if (!viewportText.includes("overscrollBehavior: 'none'")) {
    throw new Error('expected canvas viewport shell to contain browser overscroll gestures')
  }
}
