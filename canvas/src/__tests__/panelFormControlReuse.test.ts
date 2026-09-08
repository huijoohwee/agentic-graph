import fs from 'node:fs'
import path from 'node:path'
const readUtf8 = (relativePath: string): string => fs.readFileSync(path.resolve(process.cwd(), relativePath), 'utf8')
export function testPanelFormControlsAreSharedAcrossCameraAndDataViewDensity() {
  const sharedControlsText = readUtf8('src/lib/ui/panelFormControls.tsx')
  const dataViewDensityText = readUtf8('src/lib/ui/dataViewDensity.ts')
  const responsiveToolbarCssText = readUtf8('src/styles/responsive-toolbar.css')
  const explorerSearchControlText = readUtf8('src/features/markdown-workspace/ExplorerSearchControl.tsx')
  const markdownWorkspaceToolbarText = readUtf8('src/features/markdown-workspace/MarkdownWorkspaceToolbar.tsx')
  const workspaceModeSelectText = readUtf8('src/features/markdown-workspace/WorkspaceModeSelect.tsx')
  const workspaceDataViewHeaderText = readUtf8('src/features/markdown-workspace/main/viewer/WorkspaceDataViewHeader.tsx')
  const panelKeyTypeCheckboxValueRowText = readUtf8('src/features/panels/ui/PanelKeyTypeCheckboxValueRow.tsx')
  const panelKeyTypeColorTextValueRowText = readUtf8('src/features/panels/ui/PanelKeyTypeColorTextValueRow.tsx')
  const threeViewLayoutSectionText = readUtf8('src/lib/panels/views/ThreeViewLayoutSection.impl.tsx')
  const threeSizingAndWidthControlsText = readUtf8('src/features/panels/views/shared/ThreeSizingAndWidthControls.tsx')
  const threeViewBackgroundFogSectionText = readUtf8('src/features/panels/views/ThreeViewBackgroundFogSection.tsx')
  const threeViewStarfieldSectionText = readUtf8('src/features/panels/views/ThreeViewStarfieldSection.tsx')
  const strybldrCameraPanelText = readUtf8('src/features/strybldr/StrybldrCameraPanel.tsx')
  const strybldrCameraFramingSectionText = readUtf8('src/features/strybldr/StrybldrCameraFramingSection.tsx')
  const dataViewSettingsText = readUtf8('src/features/markdown-workspace/main/viewer/WorkspaceDataViewSettingsPanel.tsx')
  const dataViewFloatingStoreText = readUtf8('src/features/markdown-workspace/main/viewer/workspaceDataViewFloatingStore.ts')
  const dataViewSettingsPrimitivesText = readUtf8('src/features/markdown-workspace/main/viewer/WorkspaceDataViewSettingsPrimitives.tsx')
  const dataViewPropertiesText = readUtf8('src/features/markdown-workspace/main/viewer/WorkspaceDataViewSettingsPropertiesSection.tsx')
  const dataViewFilterMenuText = readUtf8('src/features/markdown-workspace/main/viewer/WorkspaceDataViewFilterMenu.tsx')
  const dataViewSortSectionText = readUtf8('src/features/markdown-workspace/main/viewer/WorkspaceDataViewSettingsSortSection.tsx')
  const graphTableToolbarText = readUtf8('src/features/graph-data-table/ui/GraphDataTableToolbar.tsx')
  const cardInlineTextRuntimeText = [
    'src/lib/cards/CardInlineTextEditor.tsx',
    'src/lib/cards/CardInlineTextEditingSurface.tsx',
    'src/lib/cards/CardInlineTextDisplaySurface.tsx',
  ].map(readUtf8).join('\n')
  const storyboardCanvasText = readUtf8('src/components/StoryboardCanvas.tsx')
  const storyboardWidgetInlineValueEditorText = readUtf8('src/components/StoryboardWidget/StoryboardWidgetInlineValueEditor.tsx')
  const storyboardWidgetInspectorText = readUtf8('src/components/StoryboardWidget/StoryboardWidgetInspector.tsx')
  const widgetEditorFormText = readUtf8('src/components/StoryboardWidget/WidgetEditorForm.tsx')
  const graphEditorInspectorText = readUtf8('src/features/graph-editor/panels/GraphEditorInspectorTab.tsx')
  const researchCompilerText = readUtf8('src/features/panels/views/ResearchCompilerView.tsx')
  const siteSelectionWidgetText = readUtf8('src/features/maps/SiteSelectionWidget.tsx')
  const workspaceTableModeControlText = readUtf8('src/features/workspace-table/ui/WorkspaceTableModeControl.tsx')
  const designDomInspectPanelText = readUtf8('src/features/design/DesignDomInspectPanel.tsx')
  const settingsUiText = readUtf8('src/features/settings/ui.tsx')
  const settingsChatProviderInputText = readUtf8('src/features/settings/chatProviderSettingInput.tsx')
  const rightAlignedTooltipInputText = readUtf8('src/features/panels/ui/RightAlignedTooltipInput.tsx')
  const floatingPanelChatSectionsText = readUtf8('src/features/chat/FloatingPanelChatSections.tsx')
  const chatModelCredentialControlsText = readUtf8('src/features/chat/ChatModelCredentialControls.tsx')
  const workspaceActionsPanelText = readUtf8('src/features/workspace-actions/WorkspaceActionsPanel.tsx')
  const storyboardWidgetMappingTabLayoutText = readUtf8('src/features/storyboard-widget-manager/StoryboardWidgetMappingTabLayout.tsx')
  const storyboardWidgetMappingSettingsPanelText = readUtf8('src/features/storyboard-widget-manager/StoryboardWidgetMappingSettingsPanel.tsx')
  const flowMappingRowsTableText = readUtf8('src/features/storyboard-widget-manager/FlowMappingRowsTable.tsx')
  const widgetRegistryTableText = readUtf8('src/features/storyboard-widget-manager/WidgetRegistryTable.tsx')
  const widgetRegistryFieldsEditorText = readUtf8('src/features/storyboard-widget-manager/WidgetRegistryFieldsEditor.tsx')
  const widgetRegistryPortsEditorText = readUtf8('src/features/storyboard-widget-manager/WidgetRegistryPortsEditor.tsx')
  const widgetRegistrySchemaMappingsEditorText = readUtf8('src/features/storyboard-widget-manager/WidgetRegistrySchemaMappingsEditor.tsx')
  const flowManagerRegistryEditorPrimitivesText = readUtf8('src/features/storyboard-widget-manager/FlowManagerRegistryEditorPrimitives.tsx')
  const floatingPropsPanelText = readUtf8('src/features/toolbar/FloatingPropsPanel.tsx')
  const toolbarToolMenuText = readUtf8('src/lib/toolbar/ToolbarToolMenu.impl.tsx')
  const panelLabeledRangeCardText = readUtf8('src/features/panels/ui/PanelLabeledRangeCard.tsx')
  const panelLabeledRangeFieldText = readUtf8('src/features/panels/ui/PanelLabeledRangeField.tsx')
  const panelInlineLabeledRangeRowText = readUtf8('src/features/panels/ui/PanelInlineLabeledRangeRow.tsx')
  const schemaUiEditorRowsText = readUtf8('src/features/schema/ui/SchemaUiEditorRows.tsx')
  const mediaNodesSectionText = readUtf8('src/features/panels/views/MediaNodesSection.tsx')
  const graphFieldsPanelControlsText = readUtf8('src/features/panels/views/graph-fields/GraphFieldsPanelControls.tsx')
  const graphFieldsSettingsPanelText = readUtf8('src/features/panels/views/graph-fields/FieldSettingsPanel.tsx')
  const graphFieldsCurrencyText = readUtf8('src/features/panels/views/graph-fields/CurrencySection.tsx')
  const graphFieldsDecimalPlacesText = readUtf8('src/features/panels/views/graph-fields/DecimalPlacesSection.tsx')
  const graphFieldsFieldSchemaText = readUtf8('src/features/panels/views/graph-fields/FieldSchemaSection.tsx')
  const graphFieldsFieldStylesText = readUtf8('src/features/panels/views/graph-fields/FieldStylesSection.tsx')
  const graphFieldsFieldEndpointsText = readUtf8('src/features/panels/views/graph-fields/FieldEndpointsAndCardinalitySection.tsx')
  const graphFieldsFieldLayoutText = readUtf8('src/features/panels/views/graph-fields/FieldLayoutSection.tsx')
  const graphFieldsSelectOptionsText = readUtf8('src/features/panels/views/graph-fields/SelectOptionsSection.tsx')
  const graphFieldsSamplesPanelText = readUtf8('src/features/panels/views/graph-fields/FieldSamplesPanel.tsx')
  const graphFieldsNewFieldFormText = readUtf8('src/features/panels/views/graph-fields/NewFieldForm.tsx')
  const graphFieldsSearchText = readUtf8('src/features/panels/views/graph-fields/GraphFieldsSearch.tsx')
  const graphFieldsListPanelBodyText = readUtf8('src/features/panels/views/graph-fields/GraphFieldsListPanelBody.tsx')
  const graphFieldsListRowText = readUtf8('src/features/panels/views/graph-fields/GraphFieldsListRow.tsx')
  const graphFieldsLocalSchemaValidationText = readUtf8('src/features/panels/views/graph-fields/FieldLocalSchemaValidationEditor.tsx')
  const graphFieldsLocalSchemaSectionBodyText = readUtf8('src/features/panels/views/graph-fields/FieldLocalSchemaSectionBody.tsx')
  const graphFieldsLocalSchemaRowsText = readUtf8('src/features/panels/views/graph-fields/FieldLocalSchemaRowsEditor.tsx')
  const graphFieldsLayersText = readUtf8('src/features/panels/views/graph-fields/FieldGraphLayersSection.tsx')
  const schemaEditorBehaviorText = readUtf8('src/features/schema-editor/BehaviorSection.tsx')
  const schemaEditorRulesAndQualityText = readUtf8('src/features/schema-editor/RulesAndQualitySection.tsx')
  const schemaEditorLayoutRoutingText = readUtf8('src/features/schema-editor/LayoutAndRoutingSection.tsx')
  const graphDataTableUiPrimitivesText = readUtf8('src/features/graph-data-table/ui/GraphDataTableUiPrimitives.tsx')
  const graphDataTableGroupPanelText = readUtf8('src/features/graph-data-table/ui/GraphDataTableGroupPanel.tsx')
  const graphDataTableBodyText = readUtf8('src/features/graph-data-table/ui/GraphDataTableBody.tsx')
  const graphDataTableFieldsPanelText = readUtf8('src/features/graph-data-table/ui/GraphDataTableFieldsPanel.tsx')
  const graphDataTableSortPanelText = readUtf8('src/features/graph-data-table/ui/GraphDataTableSortPanel.tsx')
  if (
    !panelKeyTypeColorTextValueRowText.includes("from '@/lib/ui/panelFormControls'") ||
    !panelKeyTypeColorTextValueRowText.includes('PanelTextInput') ||
    !panelKeyTypeColorTextValueRowText.includes('type="color"')
  ) {
    throw new Error('expected PanelKeyTypeColorTextValueRow to centralize the specialized color-swatch-plus-text input row on top of the shared panel text input primitive')
  }
  if (
    !panelKeyTypeCheckboxValueRowText.includes('labelNode?: React.ReactNode') ||
    !panelKeyTypeCheckboxValueRowText.includes('{labelNode}')
  ) {
    throw new Error('expected PanelKeyTypeCheckboxValueRow to support an optional shared value label node for checkbox rows that need inline status text')
  }

  if (
    !threeViewLayoutSectionText.includes("from '@/features/panels/ui/PanelKeyTypeRangeValueRow'") ||
    !threeViewLayoutSectionText.includes("from '@/features/panels/ui/PanelKeyTypeCheckboxValueRow'") ||
    !threeViewLayoutSectionText.includes("from '@/lib/ui/panelFormControls'") ||
    !threeViewLayoutSectionText.includes('PanelKeyTypeRangeValueRow') ||
    !threeViewLayoutSectionText.includes('PanelKeyTypeCheckboxValueRow') ||
    !threeViewLayoutSectionText.includes('PanelTextInput') ||
    threeViewLayoutSectionText.includes('type="range"') ||
    threeViewLayoutSectionText.includes('type="checkbox"') ||
    threeViewLayoutSectionText.includes('<input')
  ) {
    throw new Error('expected ThreeViewLayoutSection.impl.tsx to reuse shared KTV range and checkbox row owners plus the shared panel text input primitive instead of raw inputs')
  }

  if (
    !threeSizingAndWidthControlsText.includes("from '@/lib/ui/panelFormControls'") ||
    !threeSizingAndWidthControlsText.includes('PanelSelect') ||
    !threeSizingAndWidthControlsText.includes('PanelTextInput') ||
    threeSizingAndWidthControlsText.includes('<input') ||
    threeSizingAndWidthControlsText.includes('<select')
  ) {
    throw new Error('expected ThreeSizingAndWidthControls to reuse the shared panel select and text input primitives instead of raw inputs and selects')
  }

  if (
    !threeViewBackgroundFogSectionText.includes("from '@/features/panels/ui/PanelKeyTypeColorTextValueRow'") ||
    !threeViewBackgroundFogSectionText.includes('PanelKeyTypeColorTextValueRow') ||
    threeViewBackgroundFogSectionText.includes('PlainTextInputEditor')
  ) {
    throw new Error('expected ThreeViewBackgroundFogSection to reuse the shared specialized panel color/text value row instead of PlainTextInputEditor')
  }

  if (
    !threeViewStarfieldSectionText.includes("from '@/features/panels/ui/PanelKeyTypeColorTextValueRow'") ||
    !threeViewStarfieldSectionText.includes('PanelKeyTypeColorTextValueRow') ||
    threeViewStarfieldSectionText.includes('PlainTextInputEditor')
  ) {
    throw new Error('expected ThreeViewStarfieldSection to reuse the shared specialized panel color/text value row instead of PlainTextInputEditor')
  }

  if (
    !explorerSearchControlText.includes("from '@/lib/ui/panelFormControls'") ||
    !explorerSearchControlText.includes('PanelTextInput') ||
    explorerSearchControlText.includes('<input')
  ) {
    throw new Error('expected ExplorerSearchControl to reuse the shared panel text input primitive instead of a raw toolbar search input')
  }

  if (
    !workspaceModeSelectText.includes("from '@/lib/ui/panelFormControls'") ||
    !workspaceModeSelectText.includes('PanelSelect') ||
    workspaceModeSelectText.includes('<select')
  ) {
    throw new Error('expected WorkspaceModeSelect select mode to reuse the shared panel select primitive instead of a raw select control')
  }

  if (
    !workspaceDataViewHeaderText.includes("from '@/lib/ui/panelFormControls'") ||
    !workspaceDataViewHeaderText.includes('PanelTextInput') ||
    workspaceDataViewHeaderText.includes('<input')
  ) {
    throw new Error('expected WorkspaceDataViewHeader search control to reuse the shared panel text input primitive instead of a raw search input')
  }

  if (
    !markdownWorkspaceToolbarText.includes("from '@/lib/ui/panelFormControls'") ||
    !markdownWorkspaceToolbarText.includes('PanelCheckbox') ||
    !markdownWorkspaceToolbarText.includes('function WorkspacePaneToggle') ||
    markdownWorkspaceToolbarText.includes('type="checkbox"')
  ) {
    throw new Error('expected MarkdownWorkspaceToolbar pane toggles to reuse a shared local owner backed by the shared panel checkbox primitive instead of repeated raw checkbox inputs')
  }

  if (
    !sharedControlsText.includes('export function PanelField') ||
    !sharedControlsText.includes('export function PanelReadOnlyField') ||
    !sharedControlsText.includes('export const PanelTextInput') || !sharedControlsText.includes('export const PanelTextarea') || !sharedControlsText.includes('export const PanelSelect') ||
    !sharedControlsText.includes('export const PanelCheckbox') || !sharedControlsText.includes('export const PanelRangeInput') ||
    !sharedControlsText.includes("type PanelFieldVariant = 'micro' | 'section'") ||
    !sharedControlsText.includes("type PanelFieldLayout = 'block' | 'compact'") ||
    !sharedControlsText.includes("type PanelFormControlVariant = 'filled' | 'transparent'") ||
    !sharedControlsText.includes('PanelFormDensityProvider') ||
    !sharedControlsText.includes('readDataViewControlPaddingClassName') ||
    !sharedControlsText.includes('readDataViewSingleLineControlClassName') ||
    !sharedControlsText.includes('readDataViewMultiLineControlClassName') ||
    !sharedControlsText.includes('readDataViewMultiLineControlRows') ||
    !dataViewDensityText.includes("'overflow-hidden whitespace-pre-wrap break-words line-clamp-2'") ||
    dataViewDensityText.includes("'block overflow-hidden whitespace-pre-wrap break-words line-clamp-2'") ||
    !sharedControlsText.includes('readPanelChoiceSurfaceClassName') ||
    !sharedControlsText.includes('readPanelBooleanChoiceButtonClassName') ||
    !sharedControlsText.includes('React.createContext<PanelFormDensityContextValue | null>(null)') || !sharedControlsText.includes("densityContext?.rowHeightPreset || 'compact'") ||
    !sharedControlsText.includes('const fieldLineRows = nextFieldLineMode ? readDataViewMultiLineControlRows(nextFieldLineMode) : 0') || !sharedControlsText.includes('rows={fieldLineRows > 0 ? fieldLineRows : rows}') ||
    !sharedControlsText.includes('w-full min-w-0 max-w-full resize-y rounded-md border') ||
    !sharedControlsText.includes('w-full min-w-0 max-w-full resize-y rounded border bg-transparent') ||
    sharedControlsText.includes('w-full resize rounded') ||
    !sharedControlsText.includes('UI_RESPONSIVE_SELECTION_CONTROL_CLASSNAME') ||
    !sharedControlsText.includes('type="range"')
  ) {
    throw new Error('expected panel form controls to expose shared semantic field, read-only field, fixed single-line, resizable multi-line, select, checkbox, range, transparent-variant, and shared choice-surface utilities')
  }

  if (
    !toolbarToolMenuText.includes('PanelFormDensityProvider') ||
    !toolbarToolMenuText.includes('useWorkspaceDataViewFloatingDensity') ||
    !toolbarToolMenuText.includes('data-kg-floating-panel-row-height={panelFormDensity.rowHeightPreset}') ||
    !toolbarToolMenuText.includes('data-kg-floating-panel-field-line={panelFormDensity.fieldLineMode}')
  ) {
    throw new Error('expected FloatingPanel View density to feed shared panel form primitives through the FloatingPanel shell')
  }
  const dataViewTableValueCssSource = responsiveToolbarCssText.match(/\.kg-data-view-table-value\s\{[\s\S]*?\n\s{2}\}/)?.[0] || ''
  if (
    !dataViewTableValueCssSource ||
    dataViewTableValueCssSource.includes('display: block') ||
    dataViewTableValueCssSource.includes('white-space: nowrap') ||
    dataViewTableValueCssSource.includes('text-overflow: ellipsis')
  ) {
    throw new Error('expected Multi-dimensional Table value density to be owned by shared field-line classes instead of base table CSS')
  }
  if (
    !cardInlineTextRuntimeText.includes("from '@/lib/ui/panelFormControls'") ||
    !cardInlineTextRuntimeText.includes('PanelTextInput') ||
    !cardInlineTextRuntimeText.includes('PanelTextarea') ||
    !cardInlineTextRuntimeText.includes('useWorkspaceDataViewFloatingDensity') ||
    !cardInlineTextRuntimeText.includes('readDataViewFieldLineClassName') ||
    !cardInlineTextRuntimeText.includes('rowHeightPreset={editorDensity.rowHeightPreset}') ||
    !cardInlineTextRuntimeText.includes('fieldLineMode={editorDensity.fieldLineMode}') ||
    !cardInlineTextRuntimeText.includes('density={editorDensity.rowHeightPreset}') ||
    !cardInlineTextRuntimeText.includes('readDataViewFieldLineClassName(editorDensity.fieldLineMode)') ||
    !cardInlineTextRuntimeText.includes('densityOwnedDisplayClassName') ||
    cardInlineTextRuntimeText.includes('PlainTextInputEditor')
  ) {
    throw new Error('expected shared CardInlineTextEditor to render density-aware panel text input, textarea, and display-surface primitives')
  }

  if (
    !storyboardCanvasText.includes('CardInlineTextEditor') ||
    storyboardCanvasText.includes('px-0 py-0')
  ) {
    throw new Error('expected Storyboard card inline editors to avoid local padding overrides so shared panel density can apply')
  }

  if (
    !storyboardWidgetInlineValueEditorText.includes('CardInlineTextEditor') ||
    storyboardWidgetInlineValueEditorText.includes('PlainTextInputEditor') ||
    storyboardWidgetInlineValueEditorText.includes('<textarea') ||
    storyboardWidgetInlineValueEditorText.includes('<input') ||
    storyboardWidgetInlineValueEditorText.includes('UI_RESPONSIVE_PANEL_CODE_EDITOR_FRAME_CLASSNAME') ||
    storyboardWidgetInlineValueEditorText.includes('whitespace-pre-wrap break-words') ||
    !storyboardWidgetInspectorText.includes('CardInlineTextEditor') ||
    storyboardWidgetInspectorText.includes('px-0 py-0')
  ) {
    throw new Error('expected Storyboard Widget inline textareas to route through shared CardInlineTextEditor without local raw controls or padding overrides')
  }
  const flowEnvelopeValueBoxClassSource = widgetEditorFormText.match(/const flowEnvelopeValueBoxClass = React\.useMemo\(\(\) => \{[\s\S]*?\n\s{2}\}, \[[^\]]*\]\)/)?.[0] || ''
  if (
    !flowEnvelopeValueBoxClassSource ||
    flowEnvelopeValueBoxClassSource.includes('keyValueInputClass') ||
    flowEnvelopeValueBoxClassSource.includes('UI_RESPONSIVE_PANEL_CODE_EDITOR_FRAME_CLASSNAME')
  ) {
    throw new Error('expected Flow envelope multiline widget values to avoid single-line and fixed code-frame sizing classes')
  }

  if (
    !dataViewFloatingStoreText.includes('WorkspaceDataViewFloatingDensity') ||
    !dataViewFloatingStoreText.includes('readBindingDensity') ||
    !dataViewFloatingStoreText.includes('bindingDensityChanged') ||
    !dataViewFloatingStoreText.includes('setWorkspaceDataViewFloatingDensity') || !dataViewFloatingStoreText.includes('useWorkspaceDataViewFloatingDensity') ||
    !dataViewSettingsText.includes('setWorkspaceDataViewFloatingDensity({ rowHeightPreset: option.value, fieldLineMode })') ||
    !dataViewSettingsText.includes('setWorkspaceDataViewFloatingDensity({ rowHeightPreset, fieldLineMode: option.value })')
  ) {
    throw new Error('expected View density controls to publish row-height and field-line changes to the shared FloatingPanel primitive density snapshot')
  }

  if (
    !strybldrCameraPanelText.includes("from '@/lib/ui/panelFormControls'") ||
    !strybldrCameraPanelText.includes('PanelField') ||
    !strybldrCameraPanelText.includes('<PanelTextarea') ||
    !strybldrCameraPanelText.includes('<PanelField label="Note">')
  ) {
    throw new Error('expected Strybldr camera note field to use the shared semantic field and textarea controls')
  }
  if (!strybldrCameraFramingSectionText.includes("from '@/lib/ui/panelFormControls'") || !strybldrCameraFramingSectionText.includes('<PanelSelect')) {
    throw new Error('expected the canonical FloatingPanel Camera framing owner to reuse the shared select control')
  }

  if (
    !dataViewSettingsPrimitivesText.includes("from '@/lib/ui/panelFormControls'") ||
    !dataViewSettingsPrimitivesText.includes('export const WorkspaceDataViewComfortableTextInput') ||
    !dataViewSettingsPrimitivesText.includes('export const WorkspaceDataViewSearchInput') ||
    !dataViewSettingsPrimitivesText.includes('export const WorkspaceDataViewFieldSelect') ||
    !dataViewSettingsPrimitivesText.includes('export const WorkspaceDataViewCompactCheckbox')
  ) {
    throw new Error('expected data-view settings primitives to expose shared wrappers around the root panel text input, select, and checkbox controls')
  }

  if (
    !dataViewSettingsText.includes("from '@/lib/ui/panelFormControls'") ||
    !dataViewSettingsText.includes("from './WorkspaceDataViewSettingsPrimitives'") ||
    !dataViewSettingsText.includes('PanelField') ||
    !dataViewSettingsText.includes('PanelSelect') ||
    !dataViewSettingsText.includes('WorkspaceDataViewCompactCheckbox') ||
    !dataViewSettingsText.includes('readPanelChoiceSurfaceClassName') ||
    !dataViewSettingsText.includes('<PanelTextInput') ||
    !dataViewSettingsText.includes('<PanelField\n                label="Projection"') ||
    !dataViewSettingsText.includes('<PanelField label="Group by" variant="section">') ||
    !dataViewSettingsText.includes('type="radio"') ||
    !dataViewSettingsText.includes('name="workspace-data-view-row-height"') ||
    !dataViewSettingsText.includes('name="workspace-data-view-field-line"') ||
    dataViewSettingsText.includes('type="checkbox"') ||
    dataViewSettingsText.includes('<label className={UI_RESPONSIVE_PANEL_FIELD_ROW_CLASSNAME}>')
  ) {
    throw new Error('expected data-view settings controls to reuse semantic panel fields, shared selects, and the shared panel choice surface')
  }

  if (
    !dataViewPropertiesText.includes("from './WorkspaceDataViewSettingsPrimitives'") ||
    !dataViewPropertiesText.includes('WorkspaceDataViewSearchInput') ||
    !dataViewPropertiesText.includes('WorkspaceDataViewComfortableTextInput') ||
    !dataViewPropertiesText.includes('WorkspaceDataViewFieldSelect') ||
    dataViewPropertiesText.includes('<input') ||
    dataViewPropertiesText.includes('<select')
  ) {
    throw new Error('expected data-view property settings controls to reuse the shared workspace data-view search, text input, and select primitives instead of raw form controls')
  }

  if (
    !dataViewFilterMenuText.includes("from '@/lib/ui/panelFormControls'") ||
    !dataViewFilterMenuText.includes('PanelField') ||
    !dataViewFilterMenuText.includes('<PanelTextInput')
  ) {
    throw new Error('expected data-view filter value input to reuse the shared semantic field and single-line panel input')
  }

  if (
    !dataViewSortSectionText.includes("from '@/lib/ui/panelFormControls'") ||
    !dataViewSortSectionText.includes('PanelField') ||
    !dataViewSortSectionText.includes('<PanelSelect') ||
    dataViewSortSectionText.includes('<label className="min-w-0 flex-1">') ||
    dataViewSortSectionText.includes('<label className="min-w-0">')
  ) {
    throw new Error('expected data-view sort controls to reuse the shared semantic field and panel select primitives')
  }

  if (
    !graphTableToolbarText.includes("from '@/lib/ui/panelFormControls'") ||
    !graphTableToolbarText.includes('PanelField') ||
    !graphTableToolbarText.includes('PanelTextInput') ||
    !graphTableToolbarText.includes('<PanelSelect') ||
    !graphTableToolbarText.includes('variant="transparent"') ||
    graphTableToolbarText.includes('<label className={menuFieldClass}>') ||
    graphTableToolbarText.includes('ml-2 px-2 rounded border')
  ) {
    throw new Error('expected graph-table filter and sort menus to reuse shared semantic panel fields plus transparent panel-form controls')
  }

  if (
    !graphEditorInspectorText.includes("from '@/lib/ui/panelFormControls'") ||
    !graphEditorInspectorText.includes('PanelField') ||
    !graphEditorInspectorText.includes('PanelReadOnlyField') ||
    !graphEditorInspectorText.includes('<PanelTextInput') ||
    !graphEditorInspectorText.includes('<PanelSelect') ||
    !graphEditorInspectorText.includes('<PanelReadOnlyField label="Source"')
  ) {
    throw new Error('expected graph editor inspector fields to reuse the shared semantic field, read-only field, single-line panel input, and panel select')
  }

  if (
    !researchCompilerText.includes("from '@/lib/ui/panelFormControls'") ||
    !researchCompilerText.includes('PanelField') ||
    !researchCompilerText.includes('PanelReadOnlyField') ||
    !researchCompilerText.includes('<PanelTextarea') ||
    !researchCompilerText.includes('<PanelTextInput') ||
    !researchCompilerText.includes('<PanelReadOnlyField label="Run ID"') ||
    !researchCompilerText.includes('variant="transparent"') ||
    researchCompilerText.includes('min-h-24 resize-y rounded border') ||
    researchCompilerText.includes('w-28 rounded border') ||
    researchCompilerText.includes('<dl className="mt-2 grid grid-cols-2 gap-2 text-xs">')
  ) {
    throw new Error('expected research compiler prompt, token fields, and run status rows to reuse the shared panel-form primitives')
  }

  if (
    !siteSelectionWidgetText.includes("from '@/lib/ui/panelFormControls'") ||
    !siteSelectionWidgetText.includes('PanelField') ||
    !siteSelectionWidgetText.includes('PanelSelect') ||
    !siteSelectionWidgetText.includes('PanelTextInput') ||
    !siteSelectionWidgetText.includes('variant="transparent"') ||
    !siteSelectionWidgetText.includes('<fieldset') ||
    siteSelectionWidgetText.includes('bg-transparent border') ||
    siteSelectionWidgetText.includes('<div key={c.id}')
  ) {
    throw new Error('expected site selection widget candidate fields to reuse shared transparent panel-form primitives with semantic fieldsets')
  }

  if (
    !workspaceTableModeControlText.includes("from '@/lib/ui/panelFormControls'") ||
    !workspaceTableModeControlText.includes('PanelField') ||
    !workspaceTableModeControlText.includes('PanelSelect') ||
    !workspaceTableModeControlText.includes('PanelTextInput') ||
    workspaceTableModeControlText.includes(`<label className={\`${'${uiToolbarRowScrollJustifyBetweenClassName}'} gap-2 text-xs\`}>`)
  ) {
    throw new Error('expected workspace table mode control rows to reuse shared semantic field, select, and input primitives')
  }

  if (
    !designDomInspectPanelText.includes("from '@/lib/ui/panelFormControls'") ||
    !designDomInspectPanelText.includes('PanelReadOnlyField') ||
    !designDomInspectPanelText.includes('className={DESIGN_DOM_INSPECT_ROW_GRID_CLASS_NAME}') ||
    designDomInspectPanelText.includes("<section className={cn('text-[10px] font-mono', UI_THEME_TOKENS.text.tertiary)}>{props.k}</section>")
  ) {
    throw new Error('expected DesignDomInspectPanel rows to reuse the shared read-only field primitive while preserving the local row grid contract')
  }

  if (
    !settingsUiText.includes("from '@/lib/ui/panelFormControls'") ||
    !settingsUiText.includes('PanelCheckbox') ||
    !settingsUiText.includes('PanelTextInput') ||
    !settingsUiText.includes('PanelTextarea') ||
    settingsUiText.includes('PlainTextInputEditor') ||
    !settingsUiText.includes('renderSharedTextInput') ||
    !settingsUiText.includes('renderSharedTextarea') ||
    settingsUiText.includes('type="checkbox"')
  ) {
    throw new Error('expected MainPanel settings and integrations inputs to reuse the shared panel checkbox, text input, and textarea primitives')
  }

  if (
    !settingsChatProviderInputText.includes("from '@/lib/ui/panelFormControls'") ||
    !settingsChatProviderInputText.includes('PanelTextInput') ||
    !settingsChatProviderInputText.includes('PanelSelect') ||
    settingsChatProviderInputText.includes('<input') ||
    settingsChatProviderInputText.includes('<select')
  ) {
    throw new Error('expected settings chat provider, model, and context-scope controls to reuse shared panel text and select primitives')
  }

  if (
    !rightAlignedTooltipInputText.includes("from '@/lib/ui/panelFormControls'") ||
    !rightAlignedTooltipInputText.includes('PanelTextInput') ||
    rightAlignedTooltipInputText.includes('PlainTextInputEditor') ||
    rightAlignedTooltipInputText.includes('<input')
  ) {
    throw new Error('expected RightAlignedTooltipInput to reuse the shared panel text input primitive instead of local/raw input owners')
  }

  if (
    !floatingPanelChatSectionsText.includes("from '@/features/chat/ChatModelCredentialControls'") ||
    !chatModelCredentialControlsText.includes("from '@/lib/ui/panelFormControls'") ||
    !chatModelCredentialControlsText.includes('PanelTextInput') ||
    !chatModelCredentialControlsText.includes('PanelSelect') ||
    chatModelCredentialControlsText.includes('<input') ||
    chatModelCredentialControlsText.includes('<select')
  ) {
    throw new Error('expected FloatingPanel chat footer single-line controls to reuse shared panel text and select primitives')
  }

  if (
    !workspaceActionsPanelText.includes("from '@/lib/ui/panelFormControls'") ||
    !workspaceActionsPanelText.includes('PanelSelect') ||
    workspaceActionsPanelText.includes('<select')
  ) {
    throw new Error('expected WorkspaceActionsPanel sample dataset picker to reuse the shared panel select primitive')
  }

  if (
    !graphDataTableUiPrimitivesText.includes("from '@/lib/ui/panelFormControls'") ||
    !graphDataTableUiPrimitivesText.includes('PanelCheckbox') ||
    !graphDataTableUiPrimitivesText.includes('PanelTextInput') ||
    !graphDataTableUiPrimitivesText.includes('export const GraphDataTablePanelCheckbox') ||
    !graphDataTableUiPrimitivesText.includes('export const GraphDataTablePanelSearchInput') ||
    !graphDataTableUiPrimitivesText.includes('export function GraphDataTableInlineCheckbox') ||
    !graphDataTableUiPrimitivesText.includes('export function GraphDataTableEditableCellInput')
  ) {
    throw new Error('expected graph-data-table UI primitives to expose shared checkbox, search input, inline checkbox, and editable cell input owners backed by the shared panel checkbox and text input primitives')
  }

  if (
    !graphDataTableGroupPanelText.includes("from '@/features/graph-data-table/ui/GraphDataTableUiPrimitives'") ||
    !graphDataTableGroupPanelText.includes('GraphDataTableInlineCheckbox') ||
    graphDataTableGroupPanelText.includes('type="checkbox"')
  ) {
    throw new Error('expected GraphDataTableGroupPanel aggregate toggles to reuse the shared local inline checkbox owner instead of repeated raw checkboxes')
  }

  if (
    !graphDataTableBodyText.includes("from '@/features/graph-data-table/ui/GraphDataTableUiPrimitives'") ||
    !graphDataTableBodyText.includes('GraphDataTableEditableCellInput') ||
    graphDataTableBodyText.includes('<input\n            defaultValue={row.label}') ||
    graphDataTableBodyText.includes('<input\n              defaultValue={row.type}') ||
    graphDataTableBodyText.includes('<input\n              defaultValue={row.source}') ||
    graphDataTableBodyText.includes('<input\n              defaultValue={row.target}')
  ) {
    throw new Error('expected GraphDataTableBody editable label, type, source, and target cells to reuse the shared local editable cell input owner instead of raw inputs')
  }

  if (
    !graphDataTableFieldsPanelText.includes("from '@/features/graph-data-table/ui/GraphDataTableUiPrimitives'") ||
    !graphDataTableFieldsPanelText.includes('GraphDataTablePanelSearchInput') ||
    !graphDataTableFieldsPanelText.includes('GraphDataTablePanelCheckbox') ||
    graphDataTableFieldsPanelText.includes('<input')
  ) {
    throw new Error('expected GraphDataTableFieldsPanel search and visibility controls to reuse the shared local search input and checkbox owners instead of raw inputs')
  }

  if (
    !graphDataTableSortPanelText.includes("from '@/features/graph-data-table/ui/GraphDataTableUiPrimitives'") ||
    !graphDataTableSortPanelText.includes('GraphDataTableInlineCheckbox') ||
    graphDataTableSortPanelText.includes('type="checkbox"')
  ) {
    throw new Error('expected GraphDataTableSortPanel auto-sort toggle to reuse the shared local inline checkbox owner instead of a raw checkbox')
  }

  if (
    !storyboardWidgetMappingTabLayoutText.includes("from '@/lib/ui/panelFormControls'") ||
    !storyboardWidgetMappingTabLayoutText.includes('PanelCheckbox') ||
    storyboardWidgetMappingTabLayoutText.includes('type="checkbox"')
  ) {
    throw new Error('expected StoryboardWidgetMappingTabLayout enabled-only toggle to reuse the shared panel checkbox primitive')
  }

  if (
    !storyboardWidgetMappingSettingsPanelText.includes("from '@/lib/ui/panelFormControls'") ||
    !storyboardWidgetMappingSettingsPanelText.includes('PanelCheckbox') ||
    !storyboardWidgetMappingSettingsPanelText.includes('PanelField') ||
    !storyboardWidgetMappingSettingsPanelText.includes('PanelTextInput') ||
    storyboardWidgetMappingSettingsPanelText.includes('type="checkbox"') ||
    storyboardWidgetMappingSettingsPanelText.includes('id="storyboard-widget-manager-nodeType"\n                    value={draft.nodeTypeId}\n                    onChange={e => onChangeDraft({ nodeTypeId: e.target.value })}\n                    className={fieldClassName}')
  ) {
    throw new Error('expected StoryboardWidgetMappingSettingsPanel identity fields to reuse shared semantic panel checkbox, field, and text input primitives')
  }

  if (
    !flowManagerRegistryEditorPrimitivesText.includes('export function FlowManagerRegistrySectionHeader') ||
    !flowManagerRegistryEditorPrimitivesText.includes('export function FlowManagerRegistryItemCard') ||
    !flowManagerRegistryEditorPrimitivesText.includes('export function FlowManagerRegistryRemoveButton') ||
    !flowManagerRegistryEditorPrimitivesText.includes('export function FlowManagerRegistryEmptyState')
  ) {
    throw new Error('expected storyboard-widget-manager registry editors to expose shared shell primitives for section headers, item cards, remove buttons, and empty states')
  }

  if (
    !graphFieldsPanelControlsText.includes('export const GraphFieldsShortTextInput') ||
    !graphFieldsPanelControlsText.includes('export const GraphFieldsInlineTextInput') ||
    !graphFieldsPanelControlsText.includes('export const GraphFieldsFieldTextInput') ||
    !graphFieldsPanelControlsText.includes('export const GraphFieldsComfortableTextInput') ||
    !graphFieldsPanelControlsText.includes('export const GraphFieldsFieldSelect') ||
    !graphFieldsPanelControlsText.includes('export const GraphFieldsComfortableFieldSelect') ||
    !graphFieldsPanelControlsText.includes('export const GraphFieldsCompactCheckbox') ||
    !graphFieldsPanelControlsText.includes("from '@/lib/ui/panelFormControls'")
  ) {
    throw new Error('expected graph-fields controls to expose shared wrappers around the root panel text input, select, and checkbox primitives for short, inline, field, and comfortable layouts')
  }

  if (
    !graphFieldsSettingsPanelText.includes("from '@/features/panels/views/graph-fields/GraphFieldsPanelControls'") ||
    !graphFieldsSettingsPanelText.includes('GraphFieldsCompactCheckbox') ||
    !graphFieldsSettingsPanelText.includes('GraphFieldsComfortableTextInput') ||
    !graphFieldsSettingsPanelText.includes('GraphFieldsComfortableFieldSelect') ||
    graphFieldsSettingsPanelText.includes('type="checkbox"') ||
    graphFieldsSettingsPanelText.includes('<input') ||
    graphFieldsSettingsPanelText.includes('<select')
  ) {
    throw new Error('expected FieldSettingsPanel field and global-schema controls to reuse the shared graph-fields compact checkbox, comfortable text input, and comfortable select primitives instead of raw form controls')
  }

  if (
    !graphFieldsCurrencyText.includes("from '@/features/panels/views/graph-fields/GraphFieldsPanelControls'") ||
    !graphFieldsCurrencyText.includes('GraphFieldsShortTextInput') ||
    graphFieldsCurrencyText.includes('<input')
  ) {
    throw new Error('expected CurrencySection to reuse the shared graph-fields short text input primitive instead of a raw input')
  }

  if (
    !graphFieldsDecimalPlacesText.includes("from '@/features/panels/views/graph-fields/GraphFieldsPanelControls'") ||
    !graphFieldsDecimalPlacesText.includes('GraphFieldsFieldSelect') ||
    graphFieldsDecimalPlacesText.includes('<select')
  ) {
    throw new Error('expected DecimalPlacesSection to reuse the shared graph-fields select primitive instead of a raw select')
  }

  if (
    !graphFieldsFieldSchemaText.includes("from '@/features/panels/views/graph-fields/GraphFieldsPanelControls'") ||
    !graphFieldsFieldSchemaText.includes('GraphFieldsCompactCheckbox') ||
    graphFieldsFieldSchemaText.includes('type="checkbox"')
  ) {
    throw new Error('expected FieldSchemaSection constraints to reuse the shared graph-fields compact checkbox primitive instead of raw checkboxes')
  }

  if (
    !graphFieldsFieldStylesText.includes("from '@/lib/ui/panelFormControls'") ||
    !graphFieldsFieldStylesText.includes('PanelTextInput') ||
    !graphFieldsFieldStylesText.includes('<PanelSelect') ||
    graphFieldsFieldStylesText.includes('PlainTextInputEditor') ||
    graphFieldsFieldStylesText.includes('type="checkbox"')
  ) {
    throw new Error('expected FieldStylesSection to reuse shared panel text and select controls without local/raw inputs')
  }

  if (
    !graphFieldsFieldEndpointsText.includes("from '@/lib/ui/panelFormControls'") ||
    !graphFieldsFieldEndpointsText.includes('PanelTextInput') ||
    graphFieldsFieldEndpointsText.includes('<input')
  ) {
    throw new Error('expected FieldEndpointsAndCardinalitySection to reuse shared panel text inputs instead of raw inputs')
  }

  if (
    !graphFieldsFieldLayoutText.includes("from '@/lib/ui/panelFormControls'") ||
    !graphFieldsFieldLayoutText.includes('PanelTextInput') ||
    graphFieldsFieldLayoutText.includes('<input')
  ) {
    throw new Error('expected FieldLayoutSection to reuse shared panel text inputs instead of raw inputs')
  }

  if (
    !graphFieldsSelectOptionsText.includes("from '@/features/panels/views/graph-fields/GraphFieldsPanelControls'") ||
    !graphFieldsSelectOptionsText.includes('GraphFieldsFieldTextInput') ||
    graphFieldsSelectOptionsText.includes('<input')
  ) {
    throw new Error('expected SelectOptionsSection to reuse the shared graph-fields field text input primitive instead of raw option inputs')
  }

  if (
    !graphFieldsSamplesPanelText.includes("from '@/features/panels/views/graph-fields/GraphFieldsPanelControls'") ||
    !graphFieldsSamplesPanelText.includes('GraphFieldsCompactCheckbox') ||
    graphFieldsSamplesPanelText.includes('type="checkbox"')
  ) {
    throw new Error('expected FieldSamplesPanel selection toggles to reuse the shared graph-fields compact checkbox primitive')
  }

  if (
    !graphFieldsNewFieldFormText.includes("from '@/features/panels/views/graph-fields/GraphFieldsPanelControls'") ||
    !graphFieldsNewFieldFormText.includes('GraphFieldsInlineTextInput') ||
    !graphFieldsNewFieldFormText.includes('GraphFieldsComfortableFieldSelect') ||
    graphFieldsNewFieldFormText.includes('<input') ||
    graphFieldsNewFieldFormText.includes('<select')
  ) {
    throw new Error('expected NewFieldForm to reuse the shared graph-fields inline text input and comfortable select primitives instead of raw form controls')
  }

  if (
    !graphFieldsSearchText.includes("from '@/features/panels/views/graph-fields/GraphFieldsPanelControls'") ||
    !graphFieldsSearchText.includes('GraphFieldsInlineTextInput') ||
    graphFieldsSearchText.includes('<input')
  ) {
    throw new Error('expected GraphFieldsSearch to reuse the shared graph-fields inline text input primitive instead of a raw search input')
  }

  if (
    !graphFieldsListPanelBodyText.includes("from '@/features/panels/views/graph-fields/GraphFieldsPanelControls'") ||
    !graphFieldsListPanelBodyText.includes('GraphFieldsInlineTextInput') ||
    graphFieldsListPanelBodyText.includes('<input')
  ) {
    throw new Error('expected GraphFieldsListPanelBody search strip to reuse the shared graph-fields inline text input primitive instead of a raw search input')
  }

  if (
    !graphFieldsListRowText.includes("from '@/lib/ui/panelFormControls'") ||
    !graphFieldsListRowText.includes('PanelTextInput') ||
    !graphFieldsListRowText.includes('PanelSelect') ||
    graphFieldsListRowText.includes('<input\n                      value={settings.displayName}') ||
    graphFieldsListRowText.includes('<select\n                      value={settings.fieldType}')
  ) {
    throw new Error('expected GraphFieldsListRow active editor controls to reuse the shared panel text input and select primitives')
  }

  if (
    !graphFieldsLocalSchemaValidationText.includes("from '@/features/panels/views/graph-fields/GraphFieldsPanelControls'") ||
    !graphFieldsLocalSchemaValidationText.includes('GraphFieldsCompactCheckbox') ||
    !graphFieldsLocalSchemaValidationText.includes('GraphFieldsFieldSelect') ||
    graphFieldsLocalSchemaValidationText.includes('type="checkbox"') ||
    graphFieldsLocalSchemaValidationText.includes('<select')
  ) {
    throw new Error('expected FieldLocalSchemaValidationEditor to reuse the shared graph-fields compact checkbox and select primitives instead of raw controls')
  }

  if (
    !graphFieldsLocalSchemaSectionBodyText.includes("from '@/features/panels/views/graph-fields/GraphFieldsPanelControls'") ||
    !graphFieldsLocalSchemaSectionBodyText.includes('GraphFieldsComfortableFieldSelect') ||
    graphFieldsLocalSchemaSectionBodyText.includes('<select')
  ) {
    throw new Error('expected FieldLocalSchemaSectionBody owner selectors to reuse the shared graph-fields comfortable select primitive instead of raw selects')
  }

  if (
    !graphFieldsLocalSchemaRowsText.includes("from '@/features/panels/views/graph-fields/GraphFieldsPanelControls'") ||
    !graphFieldsLocalSchemaRowsText.includes('GraphFieldsFieldTextInput') ||
    graphFieldsLocalSchemaRowsText.includes('PlainTextInputEditor')
  ) {
    throw new Error('expected FieldLocalSchemaRowsEditor key and value editors to reuse the shared graph-fields field text input primitive instead of PlainTextInputEditor')
  }

  if (
    !graphFieldsLayersText.includes("from '@/lib/ui/panelFormControls'") ||
    !graphFieldsLayersText.includes('PanelTextInput') ||
    graphFieldsLayersText.includes('PlainTextInputEditor') ||
    graphFieldsLayersText.includes('<input')
  ) {
    throw new Error('expected FieldGraphLayersSection cluster-layer editors to reuse shared panel text inputs instead of PlainTextInputEditor or raw inputs')
  }

  if (
    !flowMappingRowsTableText.includes("from '@/lib/ui/panelFormControls'") ||
    !flowMappingRowsTableText.includes('PanelCheckbox') ||
    !flowMappingRowsTableText.includes('PanelSelect') ||
    !flowMappingRowsTableText.includes('PanelTextInput') ||
    flowMappingRowsTableText.includes('<input') ||
    flowMappingRowsTableText.includes('<select')
  ) {
    throw new Error('expected FlowMappingRowsTable to reuse shared panel checkbox, select, and text input primitives instead of raw table form controls')
  }

  if (
    !widgetRegistryTableText.includes("from '@/lib/ui/panelFormControls'") ||
    !widgetRegistryTableText.includes('PanelCheckbox') ||
    widgetRegistryTableText.includes('type="checkbox"')
  ) {
    throw new Error('expected WidgetRegistryTable enabled toggles to reuse the shared panel checkbox primitive')
  }

  if (
    !widgetRegistryFieldsEditorText.includes("from '@/lib/ui/panelFormControls'") ||
    !widgetRegistryFieldsEditorText.includes("from '@/features/storyboard-widget-manager/FlowManagerRegistryEditorPrimitives'") ||
    !widgetRegistryFieldsEditorText.includes('PanelCheckbox') ||
    !widgetRegistryFieldsEditorText.includes('PanelTextInput') ||
    !widgetRegistryFieldsEditorText.includes('FlowManagerRegistryItemCard') ||
    !widgetRegistryFieldsEditorText.includes('FlowManagerRegistrySectionHeader') ||
    widgetRegistryFieldsEditorText.includes('<input')
  ) {
    throw new Error('expected WidgetRegistryFieldsEditor to reuse shared registry shell primitives plus shared panel checkbox and text input primitives')
  }

  if (
    !widgetRegistryPortsEditorText.includes("from '@/lib/ui/panelFormControls'") ||
    !widgetRegistryPortsEditorText.includes("from '@/features/storyboard-widget-manager/FlowManagerRegistryEditorPrimitives'") ||
    !widgetRegistryPortsEditorText.includes('PanelSelect') ||
    !widgetRegistryPortsEditorText.includes('PanelTextInput') ||
    !widgetRegistryPortsEditorText.includes('FlowManagerRegistryItemCard') ||
    !widgetRegistryPortsEditorText.includes('FlowManagerRegistrySectionHeader') ||
    widgetRegistryPortsEditorText.includes('<input') ||
    widgetRegistryPortsEditorText.includes('<select')
  ) {
    throw new Error('expected WidgetRegistryPortsEditor to reuse shared registry shell primitives plus shared panel select and text input primitives')
  }

  if (
    !widgetRegistrySchemaMappingsEditorText.includes("from '@/lib/ui/panelFormControls'") ||
    !widgetRegistrySchemaMappingsEditorText.includes("from '@/features/storyboard-widget-manager/FlowManagerRegistryEditorPrimitives'") ||
    !widgetRegistrySchemaMappingsEditorText.includes('PanelTextInput') ||
    !widgetRegistrySchemaMappingsEditorText.includes('FlowManagerRegistryItemCard') ||
    !widgetRegistrySchemaMappingsEditorText.includes('FlowManagerRegistrySectionHeader') ||
    widgetRegistrySchemaMappingsEditorText.includes('<input')
  ) {
    throw new Error('expected WidgetRegistrySchemaMappingsEditor to reuse shared registry shell primitives plus shared panel text input primitives')
  }

  if (
    floatingPropsPanelText.includes("from '@/lib/ui/panelFormControls'") ||
    floatingPropsPanelText.includes('PanelRangeInput') ||
    floatingPropsPanelText.includes('PanelTextInput') ||
    floatingPropsPanelText.includes('PanelSelect') ||
    floatingPropsPanelText.includes('readPanelBooleanChoiceButtonClassName') ||
    floatingPropsPanelText.includes('<select') ||
    floatingPropsPanelText.includes('<input') ||
    floatingPropsPanelText.includes('type="range"')
  ) {
    throw new Error('expected FloatingPropsPanel to stay palette-only and avoid owning local form controls')
  }

  if (
    !panelLabeledRangeCardText.includes("from '@/lib/ui/panelFormControls'") ||
    !panelLabeledRangeCardText.includes('PanelRangeInput') ||
    panelLabeledRangeCardText.includes('type="range"')
  ) {
    throw new Error('expected PanelLabeledRangeCard to reuse the shared panel range primitive instead of a raw range input')
  }

  if (
    !panelLabeledRangeFieldText.includes("from '@/lib/ui/panelFormControls'") ||
    !panelLabeledRangeFieldText.includes('PanelRangeInput') ||
    panelLabeledRangeFieldText.includes('type="range"')
  ) {
    throw new Error('expected PanelLabeledRangeField to reuse the shared panel range primitive instead of a raw range input')
  }

  if (
    !panelInlineLabeledRangeRowText.includes("from '@/lib/ui/panelFormControls'") ||
    !panelInlineLabeledRangeRowText.includes('PanelRangeInput') ||
    panelInlineLabeledRangeRowText.includes('type="range"')
  ) {
    throw new Error('expected PanelInlineLabeledRangeRow to reuse the shared panel range primitive instead of a raw range input')
  }

  if (
    !schemaUiEditorRowsText.includes("from '@/features/panels/ui/PanelLabeledRangeField'") ||
    !schemaUiEditorRowsText.includes('PanelLabeledRangeField') ||
    schemaUiEditorRowsText.includes('type="range"')
  ) {
    throw new Error('expected SchemaUiEditorRows layout sliders to reuse the shared panel labeled range-field owner instead of raw range inputs')
  }

  if (
    !mediaNodesSectionText.includes("from '@/features/panels/ui/PanelInlineLabeledRangeRow'") ||
    !mediaNodesSectionText.includes('PanelInlineLabeledRangeRow') ||
    mediaNodesSectionText.includes('type="range"')
  ) {
    throw new Error('expected MediaNodesSection opacity slider to reuse the shared panel inline labeled range-row owner instead of raw range inputs')
  }

  if (
    !schemaEditorBehaviorText.includes("from '@/lib/ui/panelFormControls'") ||
    !schemaEditorBehaviorText.includes('PanelCheckbox') ||
    !schemaEditorBehaviorText.includes('PanelSelect') ||
    !schemaEditorBehaviorText.includes('PanelTextInput') ||
    schemaEditorBehaviorText.includes('type="checkbox"') ||
    schemaEditorBehaviorText.includes('<input') ||
    schemaEditorBehaviorText.includes('<select')
  ) {
    throw new Error('expected schema editor behavior controls to reuse the shared panel checkbox, select, and text input primitives instead of raw form controls')
  }

  if (
    !schemaEditorRulesAndQualityText.includes("from '@/lib/ui/panelFormControls'") ||
    !schemaEditorRulesAndQualityText.includes('PanelCheckbox') ||
    !schemaEditorRulesAndQualityText.includes('PanelTextInput') ||
    schemaEditorRulesAndQualityText.includes('type="checkbox"') ||
    schemaEditorRulesAndQualityText.includes('<input')
  ) {
    throw new Error('expected schema editor rules and quality controls to reuse the shared panel checkbox and text input primitives instead of raw form controls')
  }

  if (
    !schemaEditorLayoutRoutingText.includes("from '@/lib/ui/panelFormControls'") ||
    !schemaEditorLayoutRoutingText.includes('PanelSelect') ||
    !schemaEditorLayoutRoutingText.includes('PanelTextInput') ||
    schemaEditorLayoutRoutingText.includes('<input') ||
    schemaEditorLayoutRoutingText.includes('<select')
  ) {
    throw new Error('expected schema editor layout and routing controls to reuse the shared panel select and text input primitives instead of raw form controls')
  }
}

export function testStoryboardAndFlowWidgetsReuseSharedChatModelCredentialControls() {
  const widgetEditorContentText = readUtf8('src/components/StoryboardWidget/WidgetEditorFormContent.tsx')
  const projectionText = readUtf8('src/features/chat/floatingPanelChat/floatingPanelChatCredentialContext.ts')
  const storyboardCanvasText = readUtf8('src/components/StoryboardCanvas.tsx')
  const widgetEditorFormText = readUtf8('src/components/StoryboardWidget/WidgetEditorForm.tsx')
  const floatingPanelChatSectionsText = readUtf8('src/features/chat/FloatingPanelChatSections.tsx')
  const chatModelCredentialControlsText = readUtf8('src/features/chat/ChatModelCredentialControls.tsx')
  const chatModelCredentialResolverText = readUtf8('src/features/chat/chatModelCredentialResolver.ts')
  const strybldrTypesText = readUtf8('src/features/strybldr/strybldrTypes.ts')
  const strybldrStoryboardText = readUtf8('src/features/strybldr/strybldrStoryboard.ts')

  for (const [name, text] of [
    ['StoryboardCanvas', storyboardCanvasText],
    ['WidgetEditorFormContent', widgetEditorContentText],
    ['FloatingPanelChatSections', floatingPanelChatSectionsText],
  ] as const) {
    if (!text.includes("from '@/features/chat/ChatModelCredentialControls'") || !text.includes('ChatModelCredentialControls')) {
      throw new Error(`expected ${name} to reuse the shared chat model/password component`)
    }
  }

  if (!widgetEditorFormText.includes('<WidgetEditorFormContent') || !widgetEditorFormText.includes('resolveChatModelCredentialProjection({') || !storyboardCanvasText.includes('resolveChatModelCredentialProjection({')) throw new Error('expected source consumers to delegate credential projection and form rendering')
  for (const [name, text] of [
    ['StoryboardCanvas', storyboardCanvasText],
    ['WidgetEditorForm', widgetEditorFormText],
    ['FloatingPanelChat', readUtf8('src/features/chat/FloatingPanelChat.tsx')],
  ] as const) {
    const resolverText = name === 'FloatingPanelChat' ? text : projectionText
    if (!resolverText.includes("from '@/features/chat/chatModelCredentialResolver'") || !resolverText.includes('resolveSharedChatModelSelect({')) {
      throw new Error(`expected ${name} to reuse the shared provider-scoped chat model resolver`)
    }
  }

  if (
    !chatModelCredentialControlsText.includes('PanelSelect') ||
    !chatModelCredentialControlsText.includes('PanelTextInput') ||
    !chatModelCredentialControlsText.includes('data-kg-chat-model-select="true"') ||
    !chatModelCredentialControlsText.includes('data-kg-chat-api-key-input="true"') ||
    chatModelCredentialControlsText.includes('resolveSharedChatModelSelect')
  ) {
    throw new Error('expected chat model/password UI to stay in the shared component and keep resolver logic in the headless helper')
  }

  if (
    !storyboardCanvasText.includes('updateStoryboardCardModel') ||
    !storyboardCanvasText.includes('patch: { chatModel: cleanModel }') ||
    !strybldrTypesText.includes('chatModel?: string | null') ||
    !strybldrStoryboardText.includes("'chatModel'")
  ) {
    throw new Error('expected Storyboard card model selection to persist through the canonical Strybldr card override path')
  }

  if (
    !widgetEditorContentText.includes('onPatchProperties({ chatModel: nextModel })') ||
    [widgetEditorFormText, widgetEditorContentText].some(text => text.includes('apiKey: next')) ||
    storyboardCanvasText.includes('apiKey: cleanModel')
  ) {
    throw new Error('expected Flow widgets to persist only chatModel while shared BYOK password stays in the chat credential store')
  }
}
