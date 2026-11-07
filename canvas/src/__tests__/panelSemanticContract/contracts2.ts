import { fs, path, readUtf8 } from './sourceFixture'

export const testSettingsRowsUseEllipsisForLongMobileText = () => {
  const root = process.cwd()
  const settingsEntryRowPath = path.resolve(root, 'src', 'features', 'panels', 'views', 'SettingsEntryRow.tsx')
  const settingsEntryRowInputPath = path.resolve(root, 'src', 'features', 'panels', 'views', 'settingsEntryRow.input.tsx')
  const detailsTablePath = path.resolve(root, 'src', 'features', 'panels', 'views', 'SettingsEntryDetailsTable.tsx')
  const collapsibleSectionPath = path.resolve(root, 'src', 'features', 'panels', 'ui', 'CollapsibleSection.tsx')
  const mainPanelSettingsPanelShellPath = path.resolve(root, 'src', 'features', 'panels', 'ui', 'MainPanelSettingsPanelShell.tsx')
  const settingsSectionsPath = path.resolve(root, 'src', 'features', 'panels', 'views', 'SettingsSections.tsx')
  const sourceFileRowsPath = path.resolve(root, 'src', 'features', 'panels', 'views', 'SourceFileManagementSettingsRows.tsx')
  const specialValueNodePath = path.resolve(root, 'src', 'features', 'panels', 'views', 'SettingsSpecialValueNode.tsx')
  const settingsUiPath = path.resolve(root, 'src', 'features', 'settings', 'ui.tsx')
  const indexCssPath = path.resolve(root, 'src', 'index.css')

  const settingsEntryRow = readUtf8(settingsEntryRowPath)
  const settingsEntryRowInput = readUtf8(settingsEntryRowInputPath)
  if (!settingsEntryRow.includes('UI_TEXT_TRUNCATE')) {
    throw new Error('Expected SettingsEntryRow to use the shared ellipsis helper for long labels')
  }
  if (!settingsEntryRow.includes('className="w-full min-w-0 max-w-full overflow-hidden"')) {
    throw new Error('Expected SettingsEntryRow tooltips to constrain long labels before ellipsis')
  }
  if (!settingsEntryRow.includes('RightAlignedValueCell') || !settingsEntryRow.includes('valueNode={<RightAlignedValueCell>')) {
    throw new Error('Expected SettingsEntryRow values to reuse the shared responsive value cell')
  }
  if (!settingsEntryRowInput.includes('UI_RESPONSIVE_SETTINGS_VALUE_WRAPPER_CLASSNAME') || settingsEntryRowInput.includes('min-h-[24px]')) {
    throw new Error('Expected SettingsEntryRow input value wrappers to use the shared responsive value wrapper')
  }

  const detailsTable = readUtf8(detailsTablePath)
  if (!detailsTable.includes('table-fixed') || !detailsTable.includes('title={modules}')) {
    throw new Error('Expected SettingsEntryDetailsTable to preserve details behind clipped cells')
  }
  if (!detailsTable.includes('UI_TEXT_TRUNCATE')) {
    throw new Error('Expected SettingsEntryDetailsTable to ellipsize long module/class/function details')
  }

  const indexCss = readUtf8(indexCssPath)
  if (!indexCss.includes('display: block;') || !indexCss.includes('max-inline-size: 100%')) {
    throw new Error('Expected shared truncate utility to create a bounded ellipsis box')
  }

  const collapsibleSection = readUtf8(collapsibleSectionPath)
  const mainPanelSettingsPanelShell = readUtf8(mainPanelSettingsPanelShellPath)
  if (!collapsibleSection.includes('flex min-w-0 max-w-full items-center justify-between gap-1')) {
    throw new Error('Expected CollapsibleSection headers to stay within mobile panel bounds')
  }
  if (!collapsibleSection.includes('min-w-0 flex-1 overflow-hidden')) {
    throw new Error('Expected CollapsibleSection title area to release width to the action button')
  }
  if (!collapsibleSection.includes('UI_RESPONSIVE_PANEL_HEADER_ACTIONS_CLASSNAME') || collapsibleSection.includes('max-w-[45%]')) {
    throw new Error('Expected CollapsibleSection action lanes to use the shared responsive panel header owner')
  }
  if (!mainPanelSettingsPanelShell.includes('UI_RESPONSIVE_PANEL_HEADER_SECONDARY_CLASSNAME') || mainPanelSettingsPanelShell.includes('max-w-[55%]')) {
    throw new Error('Expected MainPanelSettingsPanelShell secondary lanes to use the shared responsive panel header owner')
  }

  const settingsSections = readUtf8(settingsSectionsPath)
  if (!settingsSections.includes('UI_TEXT_TRUNCATE') || !settingsSections.includes('inline-flex min-w-0 max-w-full items-center gap-1 overflow-hidden')) {
    throw new Error('Expected SettingsSections titles to ellipsize instead of overflowing on mobile')
  }

  const sourceFileRows = readUtf8(sourceFileRowsPath)
  if (!sourceFileRows.includes('SOURCE_FILE_ROW_DESCRIPTION_CLASS_NAME') || !sourceFileRows.includes('UI_TEXT_TRUNCATE')) {
    throw new Error('Expected Source File Management settings rows to reuse shared ellipsis classes')
  }
  if (!sourceFileRows.includes('SOURCE_FILE_ROW_VALUE_CLASS_NAME') || !sourceFileRows.includes('uiToolbarRowScrollClassName')) {
    throw new Error('Expected Source File Management value groups to stay inside the responsive value cell')
  }

  const specialValueNode = readUtf8(specialValueNodePath)
  if (!specialValueNode.includes('specialValueRowClassName') || !specialValueNode.includes('KTV_VALUE_ROW_SCROLL_SPACIOUS_CLASS_NAME')) {
    throw new Error('Expected Settings special value rows to scroll within the KTV value cell')
  }
  if (!specialValueNode.includes('KTV_VALUE_ROW_INPUT_SHELL_CLASS_NAME') || specialValueNode.includes('min-w-[7rem]')) {
    throw new Error('Expected Settings special value input shells to use the shared compact panel flex-input owner')
  }
  if (specialValueNode.includes('flex items-center gap-2') || specialValueNode.includes('flex-1 min-w-0')) {
    throw new Error('Expected Settings special value rows to avoid stale fixed-width mobile layouts')
  }

  const settingsUi = readUtf8(settingsUiPath)
  if (!settingsUi.includes('overflow-hidden text-ellipsis whitespace-nowrap')) {
    throw new Error('Expected read-only settings values to ellipsize on mobile')
  }
  if (!settingsUi.includes('normalizeSingleLineControlClassName') || settingsUi.includes('w-full min-w-0 max-w-full h-6')) {
    throw new Error('Expected settings inputs and selects to reuse shared height and responsive width constraints')
  }
}

export const testToolbarRendererViewLazyLoadsWorkspaceTableModeControl = () => {
  const root = process.cwd()
  const filePath = path.resolve(root, 'src', 'features', 'toolbar', 'ToolbarToolMenuRendererView.tsx')
  const text = readUtf8(filePath)
  if (text.includes("import { WorkspaceTableModeControl } from '@/features/workspace-table/ui/WorkspaceTableModeControl'")) {
    throw new Error('Expected ToolbarToolMenuRendererView to avoid a static WorkspaceTableModeControl import')
  }
  if (!text.includes('const WorkspaceTableModeControlLazy = React.lazy(async () => {')) {
    throw new Error('Expected ToolbarToolMenuRendererView to lazy-load WorkspaceTableModeControl')
  }
  if (!text.includes('<WorkspaceTableModeControlLazy />')) {
    throw new Error('Expected ToolbarToolMenuRendererView to render the lazy workspace control')
  }
}

export const testWorkspaceTableModeControlAvoidsToolbarSsotBridge = () => {
  const root = process.cwd()
  const filePath = path.resolve(root, 'src', 'features', 'workspace-table', 'ui', 'WorkspaceTableModeControl.tsx')
  const text = readUtf8(filePath)
  if (text.includes("from '@/features/workspace-table/workspaceTableSsot'")) {
    throw new Error('Expected WorkspaceTableModeControl to avoid workspaceTableSsot imports that can pull toolbar chunks into SettingsView')
  }
  if (text.includes("from '@/lib/graph-record-db'") || text.includes('warmGraphRecordDb(')) {
    throw new Error('Expected WorkspaceTableModeControl to avoid the legacy GraphRecordDb warm-up and open the shared Multi-dimensional Table surface directly')
  }
}

export const testMainPanelLazyLoadsInactiveHeavyTabs = () => {
  const root = process.cwd()
  const filePath = path.resolve(root, 'src', 'features', 'panels', 'MainPanel.tsx')
  const text = readUtf8(filePath)
  if (text.includes("import HelpView from '@/features/panels/views/HelpView'")) {
    throw new Error('Expected MainPanel to avoid a static HelpView import')
  }
  if (text.includes("import DashboardView from '@/features/panels/views/DashboardView'")) {
    throw new Error('Expected MainPanel to avoid a static DashboardView import')
  }
  if (text.includes("import WorkflowSection from '@/features/panels/views/WorkflowSection'")) {
    throw new Error('Expected MainPanel to avoid a static WorkflowSection import')
  }
  if (!text.includes("const HelpViewLazy = React.lazy(() => import('@/features/panels/views/HelpView'))")) {
    throw new Error('Expected MainPanel to lazy-load HelpView')
  }
  if (!text.includes("const DashboardViewLazy = React.lazy(() => import('@/features/panels/views/DashboardView'))")) {
    throw new Error('Expected MainPanel to lazy-load DashboardView')
  }
  if (text.includes("const WorkflowSectionLazy = React.lazy(() => import('@/features/panels/views/WorkflowSection'))")) {
    throw new Error('Expected MainPanel to avoid legacy WorkflowSection lazy loading after consolidation into StoryboardWidgetManager')
  }
}

export const testMainPanelSettingsSurfacesSourceFileManagementContract = () => {
  const root = process.cwd()
  const settingsViewPath = path.resolve(root, 'src', 'features', 'panels', 'views', 'SettingsView.tsx')
  const sourceFileRowsPath = path.resolve(root, 'src', 'features', 'panels', 'views', 'SourceFileManagementSettingsRows.tsx')
  const collapseStatePath = path.resolve(root, 'src', 'features', 'markdown', 'ui', 'useMarkdownExplorerSectionCollapseState.ts')
  const schemaPath = path.resolve(root, 'src', 'features', 'settings', 'settings-flow.schema.json')

  const settingsViewText = readUtf8(settingsViewPath)
  const sourceFileRowsText = readUtf8(sourceFileRowsPath)
  const collapseStateText = readUtf8(collapseStatePath)
  const schemaText = readUtf8(schemaPath)

  if (settingsViewText.includes('<SourceFileManagementSettingsPanel')) {
    throw new Error('Expected MainPanel Settings to remove the legacy standalone Source File Management panel')
  }
  if (!settingsViewText.includes('<SourceFileManagementSettingsRows')) {
    throw new Error('Expected MainPanel Settings to render Source File Management rows inside the Settings section')
  }
  if (!settingsViewText.includes('getAreaIntroItemCount={getSettingsAreaIntroItemCount}')) {
    throw new Error('Expected MainPanel Settings section counts to include Source File Management lead rows')
  }
  if (!sourceFileRowsText.includes('SOURCE_FILE_MANAGEMENT_SETTINGS_ROW_COUNT = 7')) {
    throw new Error('Expected Source File Management lead row count to stay owned by the rows module')
  }
  if (!sourceFileRowsText.includes("from 'grph-shared/react/keyTypeValueRow'")) {
    throw new Error('Expected Source File Management settings to reuse the shared Key/Type/Value row primitive from the upstream owner')
  }
  if (!sourceFileRowsText.includes('buildSettingsRowAnchorId')) {
    throw new Error('Expected Source File Management settings to reuse the shared settings row anchor helper')
  }
  if (sourceFileRowsText.includes('rounded-xl') || sourceFileRowsText.includes('grid grid-cols-2')) {
    throw new Error('Expected Source File Management settings to avoid the legacy standalone card/stat-grid layout')
  }
  if (!sourceFileRowsText.includes('Restore docs mirror defaults') || !sourceFileRowsText.includes('Open Source Files')) {
    throw new Error('Expected Source File Management settings rows to expose docs mirror restore and Source Files open actions')
  }
  if (!sourceFileRowsText.includes('scheduleApplyComposedGraphFromSourceFiles()')) {
    throw new Error('Expected Source File Management settings rows to reuse the canonical passive Source Files recomposition scheduler')
  }
  if (!sourceFileRowsText.includes('Import local files remains an explicit manual action') || !sourceFileRowsText.includes('Select folder') || !sourceFileRowsText.includes('Select files') || !sourceFileRowsText.includes('Automatic') || !sourceFileRowsText.includes('Manual')) {
    throw new Error('Expected Source File Management settings rows to expose explicit local selection and automatic/manual sync controls')
  }
  if (!collapseStateText.includes('requestMarkdownExplorerSourceFilesOpen')) {
    throw new Error('Expected markdown explorer collapse state to expose a source-owned Source Files open request')
  }
  if (!schemaText.includes('"area": "Source File Management"')) {
    throw new Error('Expected settings schema to group Source Files controls under Source File Management')
  }
}

export const testWorkflowManagerReusesWorkspaceTableSsotForMultiDimView = () => {
  const root = process.cwd()
  const filePath = path.resolve(root, 'src', 'features', 'storyboard-widget-manager', 'StoryboardWidgetGraphTab.tsx')
  const text = readUtf8(filePath)
  const removedWorkspaceSymbol = ['GraphTable', 'Workspace'].join('')
  if (!text.includes("from '@/features/workspace-table/workspaceTablePreferencesStore'")) {
    throw new Error('Expected Workflow Manager to read workspace table mode from workspaceTablePreferencesStore SSOT')
  }
  if (!text.includes('workspaceEditorMode === \'multiDimTable\'')) {
    throw new Error('Expected Workflow Manager to gate multi-dimensional table view by workspaceEditorMode SSOT')
  }
  if (!text.includes('<MultiDimTableSurface active ariaLabel="Workflow Multi-dimensional Table" />')) {
    throw new Error('Expected Workflow Manager to render the shared Multi-dimensional Table surface')
  }
  if (text.includes(removedWorkspaceSymbol)) {
    throw new Error('Expected Workflow Manager to avoid the removed graph-table workspace surface')
  }
  if (text.includes('Legacy graph-manager controls are suppressed for frontmatter workflow processing.')) {
    throw new Error('Expected Workflow Manager to remove dedicated workflow sections mode panel copy after Graph Fields consolidation')
  }
  if (text.includes('WorkflowManagerInspectorPanel')) {
    throw new Error('Expected Workflow Manager to avoid dedicated inspector panel and reuse Graph Fields pane model')
  }
}
