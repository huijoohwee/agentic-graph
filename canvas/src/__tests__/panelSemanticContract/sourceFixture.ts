import fs from 'node:fs'
import path from 'node:path'
export { fs, path }
export const readUtf8 = (absPath: string): string => {
  return fs.readFileSync(absPath, { encoding: 'utf8' })
}

// Read the source fixture once per test; assertion phases share this snapshot.
export function createMenusFixture() {
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
  const overlay = readUtf8(overlayPath)
  const toolbarDropdown = readUtf8(toolbarDropdownPath)
  const editorWorkspaceSelect = readUtf8(editorWorkspaceSelectPath)
  const interactionModeSelect = readUtf8(interactionModeSelectPath)
  const canvas2dRendererSelect = readUtf8(canvas2dRendererSelectPath)
  const compactToolbarDropdowns = [
    readUtf8(zoomModeSelectPath),
    readUtf8(documentModeSelectPath),
    readUtf8(editorWorkspaceSelectPath),
  ]
  const narrowToolbarDropdowns = [
    readUtf8(designFloatingPanelPath),
    // FloatingPanel tabs now use PanelViewTabs instead of a dropdown.
  ]
  const storyboardWidgetSpecificationTab = readUtf8(storyboardWidgetSpecificationTabPath)
  const slimToolbarDropdowns = [
    readUtf8(mainPanelStoryboardWidgetManagerHeaderPath),
    storyboardWidgetSpecificationTab,
  ]
  const tinyToolbarDropdown = readUtf8(historyViewPath)
  const storyboardWidgetInspectorTabs = readUtf8(storyboardWidgetInspectorTabsPath)
  const collaborationView = readUtf8(collaborationViewPath)
  const floatingPanelChatSections = readUtf8(floatingPanelChatSectionsPath)
  const chatModelCredentialControls = readUtf8(chatModelCredentialControlsPath)
  const grabMapsDiscoveryWidgetSection = readUtf8(grabMapsDiscoveryWidgetSectionPath)
  const grabMapsDiscoverySettingsGrid = readUtf8(grabMapsDiscoverySettingsGridPath)
  const widgetEditorSchemaTable = readUtf8(widgetEditorSchemaTablePath)
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
  const searchPanel = readUtf8(searchPanelPath)
  const launchDropdown = readUtf8(launchDropdownPath)
  const launchDropdownExport = readUtf8(launchDropdownExportPath)
  const launchDropdownImportUrlItem = readUtf8(launchDropdownImportUrlItemPath)
  const columnHeaderMenu = readUtf8(columnHeaderMenuPath)
  const typeMenu = readUtf8(typeMenuPath)
  const columnHeaderPropertyTypeMenu = readUtf8(columnHeaderPropertyTypeMenuPath)
  const dataViewHeader = readUtf8(dataViewHeaderPath)
  const dataViewPanel = readUtf8(dataViewPanelPath)
  const dataViewProperties = readUtf8(dataViewPropertiesPath)
  const dataViewPrimitives = readUtf8(dataViewPrimitivesPath)
  const dataViewFilter = readUtf8(dataViewFilterPath)
  const dataViewChips = readUtf8(dataViewChipsPath)
  const dataViewChipStyles = readUtf8(dataViewChipStylesPath)
  const dataViewAddColumn = readUtf8(dataViewAddColumnPath)
  const dataViewTableNative = readUtf8(dataViewTablePath)
  if (!dataViewTableNative.includes("from './MarkdownDataViewTableCore'") || !dataViewTableNative.includes('<MarkdownDataViewTableCore')) throw new Error('Expected native Data View table to delegate to its shared core')
  const dataViewTable = dataViewTableNative + readUtf8(path.resolve(root, 'src/features/markdown/ui/MarkdownDataViewTableCore.tsx'))
  const graphDataTableHeader = readUtf8(graphDataTableHeaderPath)
  const graphTableFastGridHeader = readUtf8(graphTableFastGridHeaderPath)
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
  const kanbanView = readUtf8(kanbanViewPath)
  const dataViewGroupsPath = path.resolve(root, 'src', 'features', 'markdown-workspace', 'main', 'viewer', 'workspaceDataViewGroups.ts')
  const dataViewModelPath = path.resolve(root, 'src', 'features', 'markdown', 'ui', 'markdownDataViewModel.ts')
  const dataViewGroups = readUtf8(dataViewGroupsPath)
  const dataViewModel = readUtf8(dataViewModelPath)
  const fileTree = readUtf8(fileTreePath)
  const floatingMenuStyles = readUtf8(floatingMenuStylesPath)
  return { root, responsiveCssPath, responsiveElementClassesPath, overlayPath, toolbarDropdownPath, interactionModeSelectPath, canvas2dRendererSelectPath, zoomModeSelectPath, documentModeSelectPath, editorWorkspaceSelectPath, toolbarToolMenuPath, designFloatingPanelPath, floatingPropsPanelPath, storyboardWidgetInspectorTabsPath, collaborationViewPath, floatingPanelChatSectionsPath, chatModelCredentialControlsPath, grabMapsDiscoveryWidgetSectionPath, grabMapsDiscoverySettingsGridPath, designTokensPanelPath, designDomTreePanelPath, designLayersPanelPath, designDomInspectPanelPath, mainPanelStoryboardWidgetManagerHeaderPath, storyboardWidgetGraphTabPath, storyboardWidgetSpecificationTabPath, storyboardWidgetMappingTabLayoutPath, widgetEditorSchemaTablePath, historyViewPath, searchPanelPath, launchDropdownPath, launchDropdownExportPath, launchDropdownImportUrlItemPath, columnHeaderMenuPath, columnHeaderPropertyTypeMenuPath, typeMenuPath, graphDataTableHeaderPath, graphTableFastGridHeaderPath, dataViewHeaderPath, dataViewPanelPath, dataViewPropertiesPath, dataViewPrimitivesPath, dataViewFilterPath, dataViewChipsPath, dataViewChipStylesPath, dataViewAddColumnPath, dataViewTablePath, kanbanCardPath, dateCellEditorPath, flowMappingRowsTablePath, widgetRegistryTablePath, widgetRegistryFieldsEditorPath, widgetRegistryPortsEditorPath, widgetRegistrySchemaMappingsEditorPath, storyboardWidgetMappingSettingsPanelPath, expandCollapseAllButtonPath, fileTreePath, floatingMenuStylesPath, responsiveCss, responsiveElementClasses, overlay, toolbarDropdown, editorWorkspaceSelect, interactionModeSelect, canvas2dRendererSelect, compactToolbarDropdowns, narrowToolbarDropdowns, storyboardWidgetSpecificationTab, slimToolbarDropdowns, tinyToolbarDropdown, storyboardWidgetInspectorTabs, collaborationView, floatingPanelChatSections, chatModelCredentialControls, grabMapsDiscoveryWidgetSection, grabMapsDiscoverySettingsGrid, widgetEditorSchemaTable, floatingSubpanels, designDomTreePanel, designLayersPanel, designPanelTexts, searchPanel, launchDropdown, launchDropdownExport, launchDropdownImportUrlItem, columnHeaderMenu, typeMenu, columnHeaderPropertyTypeMenu, dataViewHeader, dataViewPanel, dataViewProperties, dataViewPrimitives, dataViewFilter, dataViewChips, dataViewChipStyles, dataViewAddColumn, dataViewTable, graphDataTableHeader, graphTableFastGridHeader, kanbanViewPath, kanbanShortcutCopyPath, kanbanGroupPath, kanbanDropPreviewPath, kanbanDragHookPath, kanbanDragVisualStatePath, kanbanDragIntentPath, kanbanMoveOutcomesPath, kanbanCard, kanbanShortcutCopy, panelConfig, kanbanGroup, smallIconActionSurfaces, flowMappingRowsTable, widgetRegistryTable, kanbanDropPreview, kanbanDragHook, kanbanDragVisualState, kanbanDragIntent, kanbanMoveOutcomes, flowManagerFormEditorTexts, storyboardWidgetGraphTab, storyboardWidgetMappingTabLayout, flowManagerPanelHeaderTexts, flowManagerPanelBodyTexts, kanbanView, dataViewGroupsPath, dataViewModelPath, dataViewGroups, dataViewModel, fileTree, floatingMenuStyles }
}
export type SourceFixture = ReturnType<typeof createMenusFixture>
