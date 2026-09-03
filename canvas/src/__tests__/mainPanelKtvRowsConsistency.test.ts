import fs from 'node:fs'
import path from 'node:path'
import { isMainPanelVirtualSettingConfigDefault } from '@/features/panels/mainPanelVirtualSettings'

const readUtf8 = (absPath: string): string => fs.readFileSync(absPath, { encoding: 'utf8' })

export const testMainPanelKtvRowsUseSharedEditableValueCell = () => {
  const root = process.cwd()
  const legacyKeyTypeValueRowPath = path.resolve(root, 'src', 'features', 'panels', 'ui', 'KeyTypeValueRow.tsx')
  const collapsibleSection = readUtf8(path.resolve(root, 'src', 'features', 'panels', 'ui', 'CollapsibleSection.tsx'))
  const collapsibleSubsection = readUtf8(path.resolve(root, 'src', 'features', 'panels', 'ui', 'CollapsibleSubsection.tsx'))
  const sharedKtvRows = readUtf8(path.resolve(root, '..', 'grph-shared', 'src', 'ui', 'keyTypeValueRows.ts'))
  const sharedKtvLayout = readUtf8(path.resolve(root, '..', 'grph-shared', 'src', 'react', 'keyTypeValueLayout.tsx'))
  const sharedKtvRow = readUtf8(path.resolve(root, '..', 'grph-shared', 'src', 'react', 'keyTypeValueRow.tsx'))
  const sharedPanelTypography = readUtf8(path.resolve(root, '..', 'grph-shared', 'src', 'ui', 'panelTypography.ts'))
  const sharedTsconfig = readUtf8(path.resolve(root, '..', 'grph-shared', 'tsconfig.json'))
  const sectionChipChrome = readUtf8(path.resolve(root, 'src', 'lib', 'ui', 'sectionChipChrome.ts'))
  const settingsEntryRow = readUtf8(path.resolve(root, 'src', 'features', 'panels', 'views', 'SettingsEntryRow.tsx'))
  const settingsEntryInput = readUtf8(path.resolve(root, 'src', 'features', 'panels', 'views', 'settingsEntryRow.input.tsx'))
  const settingsEntryRowValue = readUtf8(path.resolve(root, 'src', 'features', 'panels', 'views', 'settingsEntryRow.value.tsx'))
  const settingsSpecialValueNode = readUtf8(path.resolve(root, 'src', 'features', 'panels', 'views', 'SettingsSpecialValueNode.tsx'))
  const settingsRowTypes = readUtf8(path.resolve(root, 'src', 'features', 'panels', 'views', 'settingsRowTypes.ts'))
  const settingsView = readUtf8(path.resolve(root, 'src', 'features', 'panels', 'views', 'SettingsView.tsx'))
  const settingsViewRuntime = readUtf8(path.resolve(root, 'src', 'features', 'panels', 'views', 'useSettingsView.ts'))
  const settingsRowBundles = readUtf8(path.resolve(root, 'src', 'features', 'panels', 'views', 'useSettingsRowBundles.ts'))
  const settingsViewHelpers = readUtf8(path.resolve(root, 'src', 'features', 'panels', 'views', 'useSettingsView.helpers.ts'))
  const settingsSections = readUtf8(path.resolve(root, 'src', 'features', 'panels', 'views', 'SettingsSections.tsx'))
  const settingsChatAssist = readUtf8(path.resolve(root, 'src', 'features', 'panels', 'views', 'useSettingsChatAssist.tsx'))
  const sourceFileManagementSettingsRows = readUtf8(path.resolve(root, 'src', 'features', 'panels', 'views', 'SourceFileManagementSettingsRows.tsx'))
  const settingsViewConstants = readUtf8(path.resolve(root, 'src', 'features', 'panels', 'views', 'settingsView.constants.ts'))
  const settingsMcpDocEntries = readUtf8(path.resolve(root, 'src', 'features', 'panels', 'views', 'settingsMcpDocEntries.ts'))
  const openAiMcpApiDocs = readUtf8(path.resolve(root, 'src', 'features', 'panels', 'views', 'openaiMcpApiDocs.ts'))
  const responsiveElementClasses = readUtf8(path.resolve(root, 'src', 'lib', 'ui', 'responsiveElementClasses.ts'))
  const collaborationView = readUtf8(path.resolve(root, 'src', 'features', 'panels', 'views', 'CollaborationView.tsx'))
  const expandCollapseAllButton = readUtf8(path.resolve(root, 'src', 'features', 'panels', 'ui', 'ExpandCollapseAllButton.tsx'))
  const mainPanelTabs = readUtf8(path.resolve(root, 'src', 'features', 'panels', 'mainPanelTabs.ts'))
  const mainPanelTabDescriptions = readUtf8(path.resolve(root, 'src', 'features', 'panels', 'mainPanelTabDescriptions.ts'))
  const mainPanelMarkdownTable = readUtf8(path.resolve(root, 'src', 'features', 'panels', 'mainPanelMarkdownTable.ts'))
  const mainPanelHelpCheatsheet = readUtf8(path.resolve(root, 'src', 'features', 'panels', 'mainPanelHelpCheatsheet.ts'))
  const mainPanelHelpDev = readUtf8(path.resolve(root, 'src', 'features', 'panels', 'mainPanelHelpDev.ts'))
  const mainPanelHelpShortcuts = readUtf8(path.resolve(root, 'src', 'features', 'panels', 'mainPanelHelpShortcuts.ts'))
  const mainPanelHelpIconTexts = readUtf8(path.resolve(root, 'src', 'features', 'panels', 'mainPanelHelpIconTexts.ts'))
  const mainPanelSectionDescriptions = readUtf8(path.resolve(root, 'src', 'features', 'panels', 'mainPanelSectionDescriptions.ts'))
  const mainPanelWorkflowLinks = readUtf8(path.resolve(root, 'src', 'features', 'panels', 'mainPanelWorkflowLinks.ts'))
  const mainPanelVirtualSettings = readUtf8(path.resolve(root, 'src', 'features', 'panels', 'mainPanelVirtualSettings.ts'))
  const mainPanelHelpIconLibrary = readUtf8(path.resolve(root, 'src', 'features', 'panels', 'ui', 'mainPanelHelpIconLibrary.tsx'))
  const mainPanelSectionHeader = readUtf8(path.resolve(root, 'src', 'features', 'panels', 'ui', 'MainPanelSectionHeader.tsx'))
  const mainPanelGraphFieldsHeader = readUtf8(path.resolve(root, 'src', 'features', 'panels', 'ui', 'MainPanelGraphFieldsHeader.tsx'))
  const mainPanelStoryboardWidgetManagerHeader = readUtf8(path.resolve(root, 'src', 'features', 'panels', 'ui', 'MainPanelStoryboardWidgetManagerHeader.tsx'))
  const schemaSummary = readUtf8(path.resolve(root, 'src', 'features', 'panels', 'ui', 'SchemaSummary.tsx'))
  const dashboardHeader = readUtf8(path.resolve(root, 'src', 'features', 'panels', 'ui', 'MainPanelDashboardHeader.tsx'))
  const helpHeader = readUtf8(path.resolve(root, 'src', 'features', 'panels', 'ui', 'MainPanelHelpHeader.tsx'))
  const helpSections = readUtf8(path.resolve(root, 'src', 'features', 'panels', 'views', 'HelpSections.tsx'))
  const helpView = readUtf8(path.resolve(root, 'src', 'features', 'panels', 'views', 'HelpView.tsx'))
  const helpKtvLayout = readUtf8(path.resolve(root, 'src', 'features', 'panels', 'views', 'HelpKtvLayout.tsx'))
  const agenticRagNodeInspectorSection = readUtf8(path.resolve(root, 'src', 'features', 'panels', 'views', 'AgenticRagNodeInspectorSection.tsx'))
  const orchestratorTraversalSequenceSection = readUtf8(path.resolve(root, 'src', 'features', 'panels', 'views', 'OrchestratorTraversalSequenceSection.tsx'))
  const commandCatalogPanel = readUtf8(path.resolve(root, 'src', 'features', 'command-menu', 'CommandMenuCatalogPanel.tsx'))
  const storyboardWidgetFloatingPanelView = readUtf8(path.resolve(root, 'src', 'features', 'storyboard-widget-manager', 'StoryboardWidgetFloatingPanelView.tsx'))
  const canvasEditableKeyTypeValueRow = readUtf8(path.resolve(root, 'src', 'features', 'panels', 'ui', 'CanvasEditableKeyTypeValueRow.tsx'))
  const canvasKeyTypeValueCompatibility = readUtf8(path.resolve(root, 'src', 'features', 'panels', 'ui', 'canvasKeyTypeValueCompatibility.ts'))
  const canvasKeyTypeValueHeader = readUtf8(path.resolve(root, 'src', 'features', 'panels', 'ui', 'canvasKeyTypeValueHeader.tsx'))
  const canvasKeyTypeValueMarkdownBridge = readUtf8(path.resolve(root, 'src', 'features', 'panels', 'ui', 'canvasKeyTypeValueMarkdownBridge.tsx'))
  const canvasKeyTypeValueRowAdapter = readUtf8(path.resolve(root, 'src', 'features', 'panels', 'ui', 'canvasKeyTypeValueRowAdapter.tsx'))
  const canvasKeyTypeValueRuntime = readUtf8(path.resolve(root, 'src', 'features', 'panels', 'ui', 'canvasKeyTypeValueRuntime.ts'))
  const canvasSimpleKeyValueRow = readUtf8(path.resolve(root, 'src', 'features', 'panels', 'ui', 'canvasSimpleKeyValueRow.tsx'))
  const canvasKeyTypeValueValueCell = readUtf8(path.resolve(root, 'src', 'features', 'panels', 'ui', 'canvasKeyTypeValueValueCell.tsx'))
  const canvasKeyTypeValueStaticRow = readUtf8(path.resolve(root, 'src', 'features', 'panels', 'ui', 'canvasKeyTypeValueStaticRow.tsx'))
  const panelKeyTypeCheckboxValueRow = readUtf8(path.resolve(root, 'src', 'features', 'panels', 'ui', 'PanelKeyTypeCheckboxValueRow.tsx'))
  const panelKeyTypeRangeValueRow = readUtf8(path.resolve(root, 'src', 'features', 'panels', 'ui', 'PanelKeyTypeRangeValueRow.tsx'))
  const panelKeyTypeSliderNumberRow = readUtf8(path.resolve(root, 'src', 'features', 'panels', 'ui', 'PanelKeyTypeSliderNumberRow.tsx'))
  const orchestratorTraversalDelayRow = readUtf8(path.resolve(root, 'src', 'features', 'panels', 'ui', 'OrchestratorTraversalDelayRow.tsx'))
  const rightAlignedTooltipInput = readUtf8(path.resolve(root, 'src', 'features', 'panels', 'ui', 'RightAlignedTooltipInput.tsx'))
  const helpViewSectionFileNames = ['HelpShortcutsSection.tsx', 'HelpCheatsheetSection.tsx', 'HelpPanelTourSection.tsx', 'HelpWorkflowLinksSection.tsx', 'HelpIconsSection.tsx']
  const helpViewSectionTexts = helpViewSectionFileNames.map(fileName => [
    fileName,
    readUtf8(path.resolve(root, 'src', 'features', 'panels', 'views', fileName)),
  ] as const)
  const mediaNodesSection = readUtf8(path.resolve(root, 'src', 'features', 'panels', 'views', 'MediaNodesSection.tsx'))
  const fieldSettingsPanel = readUtf8(path.resolve(root, 'src', 'features', 'panels', 'views', 'graph-fields', 'FieldSettingsPanel.tsx'))
  const graphFieldsListPanel = readUtf8(path.resolve(root, 'src', 'features', 'panels', 'views', 'graph-fields', 'GraphFieldsListPanel.tsx'))
  const fieldSamplesPanel = readUtf8(path.resolve(root, 'src', 'features', 'panels', 'views', 'graph-fields', 'FieldSamplesPanel.tsx'))
  const fieldLocalSchemaRowsEditor = readUtf8(path.resolve(root, 'src', 'features', 'panels', 'views', 'graph-fields', 'FieldLocalSchemaRowsEditor.tsx'))
  const helpCommandMenuSection = readUtf8(path.resolve(root, 'src', 'features', 'panels', 'views', 'HelpCommandMenuSection.tsx'))
  const graphFieldSettingSectionTexts = ['DefaultValueSection.tsx', 'CurrencySection.tsx', 'DecimalPlacesSection.tsx', 'UrlProtocolSection.tsx', 'SelectOptionsSection.tsx'].map(fileName => [
    fileName,
    readUtf8(path.resolve(root, 'src', 'features', 'panels', 'views', 'graph-fields', fileName)),
  ] as const)
  const workspaceActionsPanel = readUtf8(path.resolve(root, 'src', 'features', 'workspace-actions', 'WorkspaceActionsPanel.tsx'))
  const floatingPropsPanel = readUtf8(path.resolve(root, 'src', 'features', 'toolbar', 'FloatingPropsPanel.tsx'))
  const widgetPalette = readUtf8(path.resolve(root, 'src', 'features', 'toolbar', 'WidgetPalette.tsx'))
  const floatingPanelChat = readUtf8(path.resolve(root, 'src', 'features', 'chat', 'FloatingPanelChat.tsx'))
  const floatingPanelChatSections = readUtf8(path.resolve(root, 'src', 'features', 'chat', 'FloatingPanelChatSections.tsx'))
  const mainPanelDocMappedValueSources = ['agnesApiDocs.ts', 'miromindApiDocs.ts', 'stripeMcpApiDocs.ts', 'stripePaymentApiDocs.ts', 'crawlerAccessMcpApiDocs.ts', 'miromindMcpApiDocs.ts'].map(fileName => readUtf8(path.resolve(root, 'src', 'features', 'panels', 'views', fileName)))
  const graphStatsPanel = readUtf8(path.resolve(root, 'src', 'features', 'graph-stats', 'GraphStatsPanel.tsx'))
  const settingsUi = readUtf8(path.resolve(root, 'src', 'features', 'settings', 'ui.tsx'))
  const settingsChatProviderInput = readUtf8(path.resolve(root, 'src', 'features', 'settings', 'chatProviderSettingInput.tsx'))
  const settingsRegistry = readUtf8(path.resolve(root, 'src', 'features', 'settings', 'registry.ts'))
  const settingsRegistryOpenAiMcp = readUtf8(path.resolve(root, 'src', 'features', 'settings', 'registry-openai-mcp.ts'))
  const settingsRegistryUi = readUtf8(path.resolve(root, 'src', 'features', 'settings', 'registry-ui.ui.ts'))
  const sharedOpenAiMcpSsot = readUtf8(path.resolve(root, '..', 'grph-shared', 'src', 'openai', 'openaiMcpSsot.ts'))
  const sharedPackageJson = readUtf8(path.resolve(root, '..', 'grph-shared', 'package.json'))
  const uiSliceCoreActions = readUtf8(path.resolve(root, 'src', 'hooks', 'store', 'uiSliceCoreActions.ts'))
  const renderSettingsSection = readUtf8(path.resolve(root, 'src', 'lib', 'panels', 'views', 'RenderSettingsSection.impl.tsx'))
  const rendererPaletteSettings = readUtf8(path.resolve(root, 'src', 'features', 'toolbar', 'ui', 'RendererPaletteSettings.tsx'))
  const rendererHoverSettings = readUtf8(path.resolve(root, 'src', 'features', 'toolbar', 'ui', 'RendererHoverSettings.tsx'))
  const renderPresetSection = readUtf8(path.resolve(root, 'src', 'features', 'panels', 'views', 'RenderPresetSection.tsx'))
  const threeViewLayoutSection = readUtf8(path.resolve(root, 'src', 'lib', 'panels', 'views', 'ThreeViewLayoutSection.impl.tsx'))
  const threeViewBackgroundFogSection = readUtf8(path.resolve(root, 'src', 'features', 'panels', 'views', 'ThreeViewBackgroundFogSection.tsx'))
  const threeViewCameraSection = readUtf8(path.resolve(root, 'src', 'features', 'panels', 'views', 'ThreeViewCameraSection.tsx'))
  const threeViewGlobeEffectsSection = readUtf8(path.resolve(root, 'src', 'features', 'panels', 'views', 'ThreeViewGlobeEffectsSection.tsx'))
  const threeViewLinksSection = readUtf8(path.resolve(root, 'src', 'features', 'panels', 'views', 'ThreeViewLinksSection.tsx'))
  const threeViewSelectionSection = readUtf8(path.resolve(root, 'src', 'features', 'panels', 'views', 'ThreeViewSelectionSection.tsx'))
  const threeViewStarfieldSection = readUtf8(path.resolve(root, 'src', 'features', 'panels', 'views', 'ThreeViewStarfieldSection.tsx'))
  const aiKgForceControls = readUtf8(path.resolve(root, 'src', 'features', 'panels', 'views', 'AiKgLayers', 'AiKgForceControls.tsx'))
  const aiKgOpacityControls = readUtf8(path.resolve(root, 'src', 'features', 'panels', 'views', 'AiKgLayers', 'AiKgOpacityControls.tsx'))
  const aiKgLayersSection = readUtf8(path.resolve(root, 'src', 'features', 'panels', 'views', 'AiKgLayersSection.tsx'))
  const graphRagWorkflowSection = readUtf8(path.resolve(root, 'src', 'features', 'panels', 'views', 'GraphRagWorkflowSection.tsx'))
  const graphRagWorkflowIndexingSection = readUtf8(path.resolve(root, 'src', 'features', 'panels', 'views', 'GraphRagWorkflowIndexingSection.tsx'))
  const orchestratorTraversalPanels = readUtf8(path.resolve(root, 'src', 'features', 'panels', 'views', 'OrchestratorTraversalPanels.tsx'))
  const sourceFileManagementRows = readUtf8(path.resolve(root, 'src', 'features', 'panels', 'views', 'SourceFileManagementSettingsRows.tsx'))
  const threeSizingAndWidthControls = readUtf8(path.resolve(root, 'src', 'features', 'panels', 'views', 'shared', 'ThreeSizingAndWidthControls.tsx'))
  const threeViewTuningSection = readUtf8(path.resolve(root, 'src', 'features', 'panels', 'views', 'ThreeViewTuningSection.tsx'))
  const schemaEditorUiClasses = readUtf8(path.resolve(root, 'src', 'features', 'schema-editor', 'useSchemaEditorUiClasses.ts'))
  const graphFieldSharedInputClassSectionTexts = ['DefaultValueSection.tsx', 'FieldStylesSection.tsx', 'FieldGraphLayersSection.tsx', 'FieldEndpointsAndCardinalitySection.tsx', 'FieldLayoutSection.tsx'].map(fileName => [
    fileName,
    readUtf8(path.resolve(root, 'src', 'features', 'panels', 'views', 'graph-fields', fileName)),
  ] as const)
  const fieldStylesSection = graphFieldSharedInputClassSectionTexts.find(([fileName]) => fileName === 'FieldStylesSection.tsx')?.[1] || ''
  const mainPanelTabsDoc = readUtf8(path.resolve(root, '..', 'docs', 'documents', 'agentic-graph-mainpanel-tabs.md'))
  const mainPanelHelpCheatsheetDoc = readUtf8(path.resolve(root, '..', 'docs', 'documents', 'agentic-graph-mainpanel-help-cheatsheet.md'))
  const mainPanelHelpDevDoc = readUtf8(path.resolve(root, '..', 'docs', 'documents', 'agentic-graph-mainpanel-help-dev.md'))
  const mainPanelHelpShortcutsDoc = readUtf8(path.resolve(root, '..', 'docs', 'documents', 'agentic-graph-mainpanel-help-shortcuts.md'))
  const mainPanelHelpIconsDoc = readUtf8(path.resolve(root, '..', 'docs', 'documents', 'agentic-graph-mainpanel-help-icons.md'))
  const mainPanelSectionDescriptionsDoc = readUtf8(path.resolve(root, '..', 'docs', 'documents', 'agentic-graph-mainpanel-section-descriptions.md'))
  const mainPanelWorkflowLinksDoc = readUtf8(path.resolve(root, '..', 'docs', 'documents', 'agentic-graph-mainpanel-workflow-links.md'))
  const helpPanelTourSection = helpViewSectionTexts.find(([fileName]) => fileName === 'HelpPanelTourSection.tsx')?.[1] || ''
  const helpCheatsheetSection = helpViewSectionTexts.find(([fileName]) => fileName === 'HelpCheatsheetSection.tsx')?.[1] || ''
  const helpWorkflowLinksSection = helpViewSectionTexts.find(([fileName]) => fileName === 'HelpWorkflowLinksSection.tsx')?.[1] || ''
  const helpIconsSection = helpViewSectionTexts.find(([fileName]) => fileName === 'HelpIconsSection.tsx')?.[1] || ''
  const mainPanelTabKeys = Array.from(mainPanelTabs.matchAll(/key: '([^']+)'/g)).map(match => match[1] || '')
  const helpShortcutsSection = helpViewSectionTexts.find(([fileName]) => fileName === 'HelpShortcutsSection.tsx')?.[1] || ''
  const mainPanelTypeIconKeysBlock = mainPanelHelpIconLibrary.match(/export const MAIN_PANEL_TYPE_ICON_KEYS = \[([\s\S]*?)\] as const/)?.[1] || ''
  const mainPanelTypeIconKeys = Array.from(mainPanelTypeIconKeysBlock.matchAll(/'([^']+)'/g)).map(match => match[1] || '')
  const readMarkdownDocRows = (markdown: string): Array<{ key: string; type: string; value: string; details: string }> => {
    const lines = markdown.split(/\r?\n/)
    for (let idx = 0; idx < lines.length - 1; idx += 1) {
      const headerLine = (lines[idx] || '').trim()
      const dividerLine = (lines[idx + 1] || '').trim()
      if (!headerLine.startsWith('|') || !/^\|\s*-+/.test(dividerLine)) continue
      const headers = headerLine.replace(/^\|/, '').replace(/\|$/, '').split('|').map(cell => cell.trim().toLowerCase())
      if (!headers.includes('key') || !headers.includes('value')) continue
      const rows: Array<{ key: string; type: string; value: string; details: string }> = []
      for (let rowIdx = idx + 2; rowIdx < lines.length; rowIdx += 1) {
        const line = lines[rowIdx] || ''
        if (!line.trim() || !line.includes('|')) break
        const cells = line.replace(/^\|/, '').replace(/\|$/, '').split('|').map(cell => cell.trim())
        const row: Record<string, string> = {}
        headers.forEach((header, headerIdx) => {
          if (!header) return
          row[header] = cells[headerIdx] || ''
        })
        rows.push({
          key: row.key || '',
          type: row.type || '',
          value: row.value || '',
          details: row.details || '',
        })
      }
      return rows
    }
    return []
  }
  const assertHelpDocValuesAreConcise = (docName: string, markdown: string) => {
    for (const row of readMarkdownDocRows(markdown)) {
      if (!row.value || /^tbd$/i.test(row.value) || row.value === '—') {
        throw new Error(`Expected ${docName} ${row.key} Value to be concise non-empty editable text`)
      }
      if (row.value.length > 64 || /(?:->|;|\.)/.test(row.value)) {
        throw new Error(`Expected ${docName} ${row.key} Value to stay simplified, got: ${row.value}`)
      }
    }
  }
  const tabIconMapBlock = mainPanelHelpIconLibrary.match(/export const MAIN_PANEL_TAB_TYPE_ICON_KEY_BY_TAB = \{([\s\S]*?)\} satisfies/)?.[1] || ''
  const tabIconKeyByTab = new Map<string, string>()
  for (const match of tabIconMapBlock.matchAll(/(\w+): '([^']+)'/g)) {
    tabIconKeyByTab.set(match[1] || '', match[2] || '')
  }
  const docRows = new Map<string, { type: string; value: string }>()
  for (const line of mainPanelTabsDoc.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed.startsWith('|')) continue
    if (/^\|\s*-+/.test(trimmed)) continue
    const cells = trimmed.replace(/^\|/, '').replace(/\|$/, '').split('|').map(cell => cell.trim())
    if (cells.length < 3 || cells[0] === 'Key') continue
    docRows.set(cells[0] || '', { type: cells[1] || '', value: cells[2] || '' })
  }

  if (fs.existsSync(legacyKeyTypeValueRowPath)) {
    throw new Error('Expected legacy KeyTypeValueRow.tsx to be removed once the dedicated canvas KTV compatibility entrypoint owns the broad surface')
  }
  if (!canvasKeyTypeValueCompatibility.includes("from 'grph-shared/ui/keyTypeValueRows'")) {
    throw new Error('Expected the dedicated canvas KTV compatibility entrypoint to import the shared KTV row class contract')
  }
  for (const exportedClassName of [
    'KTV_ROW_TEXT_CELL_CLASS_NAME',
    'KTV_ROW_LABEL_CELL_CLASS_NAME',
    'KTV_ROW_VALUE_CELL_CLASS_NAME',
    'KTV_KEY_TYPE_VALUE_GRID_CLASS_NAME',
    'KTV_SECTION_STACK_CLASS_NAME',
    'KTV_ROW_TEXT_SIZE_FALLBACK_CLASS_NAME',
    'KTV_HEADER_LABEL_TEXT_SIZE_CLASS_NAME',
    'KTV_STATUS_TEXT_SIZE_CLASS_NAME',
    'KTV_HEADER_LABEL_CLASS_NAME',
    'KTV_SECTION_TITLE_CLASS_NAME',
    'KTV_STATUS_TEXT_CLASS_NAME',
  ]) {
    if (!sharedKtvRows.includes(`export const ${exportedClassName}`)) {
      throw new Error(`Expected shared KTV rows module to export ${exportedClassName}`)
    }
  }
  if (!sharedKtvRows.includes('export function shouldFlushKeyTypeValueSectionTop')) {
    throw new Error('Expected shared KTV rows module to export the KTV section seam helper')
  }
  if (
    !sharedKtvLayout.includes('export interface KeyTypeValueHeaderProps') ||
    !sharedKtvLayout.includes('export interface KeyTypeValueSectionStackProps') ||
    !sharedKtvLayout.includes('export function KeyTypeValueHeader') ||
    !sharedKtvLayout.includes('export function KeyTypeValueSectionStack') ||
    !sharedKtvLayout.includes('KTV_SECTION_STACK_CLASS_NAME')
  ) {
    throw new Error('Expected grph-shared to own the structural KTV header and section-stack React shell')
  }
  if (
    !sharedPackageJson.includes('"./react/keyTypeValueLayout"') ||
    !sharedPackageJson.includes('"./react/keyTypeValueRow"') ||
    !sharedTsconfig.includes('"jsx": "react-jsx"') ||
    !sharedTsconfig.includes('"src/**/*.tsx"')
  ) {
    throw new Error('Expected grph-shared to expose and compile the shared KTV React layout and row entries')
  }
  const valueCellUses = sharedKtvRow.match(/KTV_ROW_VALUE_CELL_CLASS_NAME/g)?.length ?? 0
  if (valueCellUses < 5) {
    throw new Error('Expected all shared static KTV row layouts to reuse the shared value-cell class')
  }
  if (!sharedKtvRow.includes('export function SimpleKeyValueRow')) {
    throw new Error('Expected grph-shared to expose the shared simple KTV row helper')
  }
  for (const sharedValueRowExport of ['KTV_VALUE_CELL_ROW_SCROLL_CLASS_NAME', 'KTV_VALUE_ROW_SCROLL_CLASS_NAME', 'KTV_VALUE_ROW_SCROLL_SPACIOUS_CLASS_NAME', 'KTV_VALUE_ROW_STATUS_SHELL_CLASS_NAME']) {
    if (!sharedKtvRows.includes(`export const ${sharedValueRowExport}`)) {
      throw new Error(`Expected shared KTV rows module to export ${sharedValueRowExport}`)
    }
  }
  if (
    !canvasKeyTypeValueValueCell.includes("from 'grph-shared/ui/keyTypeValueRows'")
    || !canvasKeyTypeValueValueCell.includes("from 'grph-shared/react/keyTypeValueRow'")
    || !canvasKeyTypeValueValueCell.includes("from '@/lib/ui/responsiveElementClasses'")
    || !canvasKeyTypeValueValueCell.includes('export const KTV_VALUE_ROW_INPUT_SHELL_CLASS_NAME')
    || !canvasKeyTypeValueValueCell.includes('export interface RightAlignedValueCellProps')
  ) {
    throw new Error('Expected the canvas value-cell compatibility owner to live in a dedicated module')
  }
  if (
    !canvasKeyTypeValueValueCell.includes("from 'grph-shared/react/keyTypeValueRow'")
    || !sharedKtvRow.includes('${KTV_ROW_VALUE_CELL_CLASS_NAME} ${KTV_VALUE_CELL_ROW_SCROLL_CLASS_NAME}')
    || !sharedKtvRow.includes('export function KeyTypeValueStaticRow')
  ) {
    throw new Error('Expected the shared KTV row runtime to own the horizontal value-cell row-scroll utility')
  }
  if (!sharedKtvRow.includes("const rootClassName = [KTV_VALUE_ROW_SCROLL_CLASS_NAME, className || '']")) {
    throw new Error('Expected RightAlignedValueCell to remain owned by the shared KTV row runtime')
  }
  if (
    canvasKeyTypeValueCompatibility.includes('export function RightAlignedTooltipInput')
    || canvasKeyTypeValueCompatibility.includes('export interface RightAlignedTooltipInputProps')
    || !rightAlignedTooltipInput.includes('export interface RightAlignedTooltipInputProps')
    || !rightAlignedTooltipInput.includes('export function RightAlignedTooltipInput')
    || !rightAlignedTooltipInput.includes("from 'grph-shared/react/keyTypeValueRow'")
    || !rightAlignedTooltipInput.includes("from '@/lib/ui/panelFormControls'")
    || !rightAlignedTooltipInput.includes('PanelTextInput')
    || rightAlignedTooltipInput.includes('PlainTextInputEditor')
  ) {
    throw new Error('Expected RightAlignedTooltipInput to move into a dedicated editable bridge module while preserving the shared right-aligned value-cell owner')
  }
  if (
    !canvasEditableKeyTypeValueRow.includes("from 'grph-shared/react/keyTypeValueRow'")
    || !canvasEditableKeyTypeValueRow.includes('export function CanvasEditableKeyTypeValueRow')
    || !canvasEditableKeyTypeValueRow.includes("from '@/features/panels/ui/canvasKeyTypeValueRuntime'")
    || !canvasEditableKeyTypeValueRow.includes("from '@/features/panels/ui/canvasKeyTypeValueMarkdownBridge'")
    || !canvasEditableKeyTypeValueRow.includes('useCanvasKeyTypeValueStaticRowProps')
    || !canvasEditableKeyTypeValueRow.includes('renderKeyTypeValueMarkdownSigilBridgeNode')
  ) {
    throw new Error('Expected editable KTV rows to use a dedicated direct-shared bridge that reuses canvas static-row props and markdown-sigil rendering')
  }
  if (
    !canvasKeyTypeValueMarkdownBridge.includes('export const renderKeyTypeValueMarkdownSigilBridgeNode')
    || !canvasKeyTypeValueMarkdownBridge.includes('renderMarkdownSigilInlineText')
  ) {
    throw new Error('Expected markdown-sigil KTV rendering to live in a dedicated bridge module')
  }
  if (
    !canvasKeyTypeValueRuntime.includes('export interface CanvasKeyTypeValueRuntime')
    || !canvasKeyTypeValueRuntime.includes('export const resolveCanvasKeyTypeValueDensityClassName')
    || !canvasKeyTypeValueRuntime.includes('export function useCanvasKeyTypeValueRuntime')
    || !canvasKeyTypeValueRuntime.includes('export function useCanvasKeyTypeValueStaticRowProps')
  ) {
    throw new Error('Expected canvas KTV runtime/default helpers to live in a dedicated runtime module')
  }
  if (
    !canvasKeyTypeValueStaticRow.includes("from 'grph-shared/react/keyTypeValueRow'")
    || !canvasKeyTypeValueStaticRow.includes("from '@/features/panels/ui/canvasKeyTypeValueRuntime'")
    || !canvasKeyTypeValueStaticRow.includes("from '@/features/panels/ui/canvasKeyTypeValueMarkdownBridge'")
    || !canvasKeyTypeValueStaticRow.includes('export interface KeyTypeValueRowProps')
    || !canvasKeyTypeValueStaticRow.includes('export interface CanvasKeyTypeValueStaticRowProps')
    || !canvasKeyTypeValueStaticRow.includes('export function CanvasKeyTypeValueStaticRow')
  ) {
    throw new Error('Expected the canvas static-row compatibility owner and shared row prop shape to live in a dedicated compatibility-row module')
  }
  if (
    !canvasKeyTypeValueHeader.includes("from 'grph-shared/react/keyTypeValueLayout'")
    || !canvasKeyTypeValueHeader.includes("from '@/features/panels/ui/canvasKeyTypeValueMarkdownBridge'")
    || !canvasKeyTypeValueHeader.includes('export interface CanvasKeyTypeValueHeaderProps')
    || !canvasKeyTypeValueHeader.includes('export function KeyTypeValueHeader')
  ) {
    throw new Error('Expected the canvas header compatibility owner to live in a dedicated header module')
  }
  if (
    !canvasSimpleKeyValueRow.includes("from 'grph-shared/react/keyTypeValueRow'")
    || !canvasSimpleKeyValueRow.includes("from '@/features/panels/ui/canvasKeyTypeValueRuntime'")
    || !canvasSimpleKeyValueRow.includes('export interface SimpleKeyValueRowProps')
    || !canvasSimpleKeyValueRow.includes('export function SimpleKeyValueRow')
  ) {
    throw new Error('Expected the canvas simple-row compatibility owner to live in a dedicated module')
  }
  if (
    !canvasKeyTypeValueValueCell.includes('export const KTV_VALUE_CELL_ROW_SCROLL_CLASS_NAME')
    || !canvasKeyTypeValueValueCell.includes('export const KTV_VALUE_ROW_SCROLL_CLASS_NAME')
    || !canvasKeyTypeValueValueCell.includes('export const KTV_VALUE_ROW_SCROLL_SPACIOUS_CLASS_NAME')
    || !canvasKeyTypeValueValueCell.includes('export const KTV_VALUE_ROW_INPUT_SHELL_CLASS_NAME')
    || !canvasKeyTypeValueValueCell.includes('export const KTV_VALUE_ROW_STATUS_SHELL_CLASS_NAME')
    || !canvasKeyTypeValueValueCell.includes('export const RightAlignedValueCell = SharedRightAlignedValueCell')
  ) {
    throw new Error('Expected the dedicated canvas value-cell compatibility owner to centralize the remaining KTV value-row utility exports')
  }
  if (
    !canvasKeyTypeValueRowAdapter.includes("from '@/features/panels/ui/canvasKeyTypeValueStaticRow'")
    || !canvasKeyTypeValueRowAdapter.includes('export function KeyTypeValueRow')
    || !canvasKeyTypeValueRowAdapter.includes('return <CanvasKeyTypeValueStaticRow {...props} />')
  ) {
    throw new Error('Expected the canvas row compatibility adapter to live in a dedicated module')
  }
  if (
    !canvasKeyTypeValueCompatibility.includes("from '@/features/panels/ui/canvasKeyTypeValueMarkdownBridge'") ||
    !canvasKeyTypeValueCompatibility.includes('export { renderKeyTypeValueMarkdownSigilBridgeNode }') ||
    !canvasKeyTypeValueCompatibility.includes("from '@/features/panels/ui/canvasKeyTypeValueHeader'") ||
    !canvasKeyTypeValueCompatibility.includes('export { KeyTypeValueHeader }') ||
    !canvasKeyTypeValueCompatibility.includes('CanvasKeyTypeValueHeaderProps') ||
    !canvasKeyTypeValueCompatibility.includes("from '@/features/panels/ui/canvasSimpleKeyValueRow'") ||
    !canvasKeyTypeValueCompatibility.includes('export { SimpleKeyValueRow }') ||
    !canvasKeyTypeValueCompatibility.includes('SimpleKeyValueRowProps') ||
    !canvasKeyTypeValueCompatibility.includes("from '@/features/panels/ui/canvasKeyTypeValueValueCell'") ||
    !canvasKeyTypeValueCompatibility.includes('export type { RightAlignedValueCellProps }') ||
    !canvasKeyTypeValueCompatibility.includes('KTV_VALUE_ROW_INPUT_SHELL_CLASS_NAME') ||
    !canvasKeyTypeValueCompatibility.includes('RightAlignedValueCell') ||
    !canvasKeyTypeValueCompatibility.includes("from '@/features/panels/ui/canvasKeyTypeValueStaticRow'") ||
    !canvasKeyTypeValueCompatibility.includes("from '@/features/panels/ui/canvasKeyTypeValueRuntime'") ||
    !canvasKeyTypeValueCompatibility.includes('export {') ||
    !canvasKeyTypeValueCompatibility.includes('useCanvasKeyTypeValueRuntime') ||
    !canvasKeyTypeValueCompatibility.includes('useCanvasKeyTypeValueStaticRowProps') ||
    !canvasKeyTypeValueCompatibility.includes('resolveCanvasKeyTypeValueDensityClassName') ||
    !canvasKeyTypeValueCompatibility.includes('export {') ||
    !canvasKeyTypeValueCompatibility.includes('CanvasKeyTypeValueStaticRow') ||
    !canvasKeyTypeValueCompatibility.includes('KeyTypeValueRowProps') ||
    !canvasKeyTypeValueCompatibility.includes("from '@/features/panels/ui/canvasKeyTypeValueRowAdapter'") ||
    !canvasKeyTypeValueCompatibility.includes('export { KeyTypeValueRow }')
  ) {
    throw new Error('Expected the dedicated canvas KTV compatibility entrypoint to isolate row adapter ownership, simple-row ownership, header ownership, value-cell ownership, static-row ownership, markdown-sigil rendering, and runtime/default helpers behind dedicated modules while re-exporting them for compatibility')
  }
  if (
    !canvasSimpleKeyValueRow.includes('SharedSimpleKeyValueRow')
    || !canvasSimpleKeyValueRow.includes('<SharedSimpleKeyValueRow')
  ) {
    throw new Error('Expected the dedicated canvas simple-row compatibility owner to delegate to the shared KTV row helper')
  }
  if (
    !sharedKtvRows.includes('self-stretch px-2')
    || sharedKtvRows.includes('border-x ${UI_THEME_TOKENS.panel.border}')
    || !sharedKtvLayout.includes('${KTV_ROW_VALUE_CELL_CLASS_NAME} items-center ${KTV_HEADER_LABEL_CLASS_NAME}')
  ) {
    throw new Error('Expected shared KTV Value cells to preserve header/body left-right alignment without grid border lines')
  }

  if (!settingsEntryRow.includes('RightAlignedValueCell') || !settingsEntryRow.includes('valueNode={<RightAlignedValueCell>')) {
    throw new Error('Expected SettingsEntryRow values to use the shared KTV value cell')
  }
  if (
    !settingsEntryRow.includes("from '@/features/panels/ui/canvasKeyTypeValueValueCell'")
    || !settingsEntryRow.includes("from 'grph-shared/ui/keyTypeValueRows'")
    || settingsEntryRow.includes("from '@/features/panels/ui/KeyTypeValueRow'")
  ) {
    throw new Error('Expected SettingsEntryRow to import value-cell compatibility helpers and shared status text sizing directly instead of routing through the legacy KeyTypeValueRow wrapper')
  }
  for (const [fileName, source] of [
    ['SettingsView.tsx', settingsView],
    ['useSettingsRowBundles.ts', settingsRowBundles],
    ['settingsRowTypes.ts', settingsRowTypes],
    ['SettingsSpecialValueNode.tsx', settingsSpecialValueNode],
  ] as const) {
    for (const staleStripeCheckoutState of ['isGeneratingStripeCheckout', 'setIsGeneratingStripeCheckout', 'stripeCheckoutStatus', 'setStripeCheckoutStatus']) {
      if (source.includes(staleStripeCheckoutState)) {
        throw new Error(`Expected ${fileName} to remove stale settings-level Stripe checkout state ${staleStripeCheckoutState}`)
      }
    }
  }
  if (fs.existsSync(path.resolve(root, 'src', 'features', 'integrations', 'integrationVirtualSettings.ts'))) {
    throw new Error('Expected MainPanel virtual editable values to use one neutral panels owner, not an integrations-only legacy helper')
  }
  if (
    !mainPanelVirtualSettings.includes("kg:main-panel:virtual:")
    || !mainPanelVirtualSettings.includes('buildMainPanelVirtualSettingMeta')
    || !mainPanelVirtualSettings.includes('getMainPanelVirtualSettingStorageKey')
    || !mainPanelVirtualSettings.includes('isMainPanelVirtualSettingConfigDefault')
    || !settingsViewRuntime.includes("from '@/features/panels/mainPanelVirtualSettings'")
    || !settingsViewHelpers.includes("from '@/features/panels/mainPanelVirtualSettings'")
    || !settingsViewHelpers.includes('resolveDocMappedEntryMeta')
    || !settingsViewHelpers.includes('writable: Boolean(resolvedMeta.write)')
    || !settingsViewHelpers.includes('valueKey: stateKey')
    || !settingsViewHelpers.includes('valueType: resolvedMeta.type')
  ) {
    throw new Error('Expected all MainPanel doc-mapped Value cells to resolve through editable neutral virtual settings')
  }
  for (const proseDefault of ['Required. Image generation prompt text.', 'Required. Video generation prompt text. Max 1024 tokens. Supports audio prompts.', 'States that Qwen reuses the canonical agentic-graph chat request message assembly.', 'Documents the optional provider request field without creating a second MainPanel-to-canvas pipeline.', 'Pins Google Cloud to the canonical FloatingPanel Chat -> Workspace -> Source Files -> markdown/frontmatter -> canvas path.']) {
    if (isMainPanelVirtualSettingConfigDefault(proseDefault)) {
      throw new Error(`Expected prose virtual default to be rejected before it reaches a KTV Value cell: ${proseDefault}`)
    }
  }
  for (const configDefault of ['frontmatter_kgc_markdown', 'delta.content', 'delta.reasoning_steps', 'Singapore', 'google-cloud', 'PROJECT_ID', 'v5']) {
    if (!isMainPanelVirtualSettingConfigDefault(configDefault)) {
      throw new Error(`Expected concise config literal to remain usable as a KTV Value default: ${configDefault}`)
    }
  }
  if (
    settingsEntryRow.includes('sectionMeta')
    || settingsEntryRow.includes('isFirstRowInArea')
    || settingsEntryRowValue.includes('buildSectionMetaAssistNodes')
    || settingsEntryRowValue.includes('sectionMeta')
    || settingsRowTypes.includes('buildSectionMetaAssistNodes')
  ) {
    throw new Error('Expected SettingsEntryRow Value cells to avoid section metadata/description assist nodes')
  }
  if (!canvasKeyTypeValueHeader.includes('export function KeyTypeValueHeader') || !sharedKtvLayout.includes('actions?: ReactNode')) {
    throw new Error('Expected KTV sticky headers to be centralized through the shared KTV React layout action slot')
  }
  if (
    !canvasKeyTypeValueCompatibility.includes("from 'grph-shared/ui/keyTypeValueRows'")
    || !canvasKeyTypeValueHeader.includes("from 'grph-shared/react/keyTypeValueLayout'")
    || !canvasKeyTypeValueHeader.includes('SharedKeyTypeValueHeader')
    || !canvasKeyTypeValueCompatibility.includes("from '@/features/panels/ui/canvasKeyTypeValueHeader'")
    || !canvasKeyTypeValueCompatibility.includes('export { KeyTypeValueHeader }')
    || !canvasKeyTypeValueCompatibility.includes("export { KeyTypeValueSectionStack } from 'grph-shared/react/keyTypeValueLayout'")
    || !canvasKeyTypeValueCompatibility.includes('shouldFlushKeyTypeValueSectionTop')
  ) {
    throw new Error('Expected the dedicated canvas KTV compatibility entrypoint to re-export the header compatibility owner while delegating the structural shell to grph-shared')
  }
  if (
    !canvasKeyTypeValueCompatibility.includes('KTV_ROW_TEXT_SIZE_FALLBACK_CLASS_NAME')
    || !canvasKeyTypeValueCompatibility.includes('KTV_HEADER_LABEL_CLASS_NAME')
    || !canvasKeyTypeValueCompatibility.includes('KTV_SECTION_TITLE_CLASS_NAME')
    || !canvasKeyTypeValueCompatibility.includes('KTV_STATUS_TEXT_CLASS_NAME')
    || canvasKeyTypeValueCompatibility.includes('export const KTV_SECTION_TITLE_CLASS_NAME =')
  ) {
    throw new Error('Expected KTV typography hierarchy to come from the shared KTV row contract instead of local constant duplication')
  }
  for (const [consumerName, consumerSource] of [
    ['Workspace actions', workspaceActionsPanel],
    ['Field settings panel', fieldSettingsPanel],
    ['Floating chat', floatingPanelChat],
    ['Help command menu', helpCommandMenuSection],
    ['Settings runtime', settingsViewRuntime],
    ['Media Nodes', mediaNodesSection],
    ['Widget palette', widgetPalette],
    ['Field samples panel', fieldSamplesPanel],
    ['Graph fields list', graphFieldsListPanel],
    ['Help shortcuts', helpShortcutsSection],
    ['Help panel tour', helpPanelTourSection],
    ['Help icons', helpIconsSection],
    ['Help cheatsheet', helpCheatsheetSection],
    ['Help workflow links', helpWorkflowLinksSection],
    ['MainPanel section header', mainPanelSectionHeader],
    ['MainPanel graph fields header', mainPanelGraphFieldsHeader],
    ['Collapsible subsection', collapsibleSubsection],
    ...graphFieldSettingSectionTexts.map(([fileName, source]) => [`Graph field ${fileName}`, source] as const),
  ] as const) {
    if (
      !consumerSource.includes("from 'grph-shared/ui/keyTypeValueRows'")
      || consumerSource.includes("from '@/features/panels/ui/KeyTypeValueRow'")
    ) {
      throw new Error(`Expected ${consumerName} to import shared KTV typography/constants directly instead of routing through the legacy KeyTypeValueRow wrapper`)
    }
  }
  if (
    !settingsView.includes("from 'grph-shared/react/keyTypeValueLayout'") ||
    !collaborationView.includes("from 'grph-shared/react/keyTypeValueLayout'") ||
    !helpSections.includes("from 'grph-shared/react/keyTypeValueLayout'") ||
    !commandCatalogPanel.includes("from 'grph-shared/react/keyTypeValueLayout'") ||
    !storyboardWidgetFloatingPanelView.includes("from 'grph-shared/react/keyTypeValueLayout'")
  ) {
    throw new Error('Expected high-fanout KTV header/stack consumers to import the shared KTV React layout owner')
  }
  if (
    !agenticRagNodeInspectorSection.includes("from 'grph-shared/react/keyTypeValueRow'") ||
    !orchestratorTraversalSequenceSection.includes("from 'grph-shared/react/keyTypeValueRow'") ||
    !workspaceActionsPanel.includes("from 'grph-shared/react/keyTypeValueRow'")
  ) {
    throw new Error('Expected simple read-only KTV consumers to import the shared KTV simple-row owner directly')
  }
  if (
    !collapsibleSection.includes('KTV_SECTION_TITLE_CLASS_NAME')
    || !collapsibleSection.includes("from 'grph-shared/ui/keyTypeValueRows'")
    || collapsibleSection.includes("./KeyTypeValueRow")
    || collapsibleSection.includes('overflow-hidden text-xs font-semibold')
    || !collaborationView.includes('KTV_STATUS_TEXT_CLASS_NAME')
    || collaborationView.includes('const noteClassName = `text-xs ${UI_THEME_TOKENS.text.secondary}`')
  ) {
    throw new Error('Expected Collaboration KTV section titles and status notes to reuse the shared typography hierarchy directly from upstream without deleted wrapper imports')
  }
  if (
    !sectionChipChrome.includes('UI_SECTION_CHIP_CHROME_CLASS_NAME')
    || !sectionChipChrome.includes("'App-toolbar__btn'")
    || !sectionChipChrome.includes('getUiSectionChipClassName')
    || !sectionChipChrome.includes('getUiSectionActionClassName')
    || !sectionChipChrome.includes('getUiSectionStatusChipClassName')
    || sectionChipChrome.includes('rounded-full')
  ) {
    throw new Error('Expected MainPanel/FloatingPanel section chip chrome to have one shared toolbar-button owner')
  }
  if (
    !collaborationView.includes("from '@/lib/ui/sectionChipChrome'")
    || !collaborationView.includes('UI_SECTION_CHIP_CHROME_CLASS_NAME')
    || !collaborationView.includes('statusButtonClassName')
    || !collaborationView.includes('secondaryStatusButtonClassName')
    || collaborationView.includes('collaborationValueButtonChromeClassName')
    || collaborationView.includes('statusPillClassName')
    || collaborationView.includes('secondaryPillClassName')
    || collaborationView.includes('rounded-full')
  ) {
    throw new Error('Expected Collaboration status/count Value chips to reuse shared section chip toolbar chrome')
  }
  for (const [consumerName, consumerSource] of [
    ['Settings row', settingsEntryRow],
    ['Settings sections', settingsSections],
    ['Settings chat assist', settingsChatAssist],
    ['Source File Management settings', sourceFileManagementSettingsRows],
    ['Help KTV layout', helpKtvLayout],
    ['Storyboard Widget manager header', mainPanelStoryboardWidgetManagerHeader],
    ['Schema summary', schemaSummary],
    ['Floating chat sections', floatingPanelChatSections],
  ] as const) {
    if (!consumerSource.includes("from '@/lib/ui/sectionChipChrome'")) {
      throw new Error(`Expected ${consumerName} section chips to import the shared toolbar chrome helper`)
    }
  }
  for (const [consumerName, consumerSource] of [
    ['Settings row', settingsEntryRow],
    ['Settings value', settingsEntryRowValue],
    ['Settings special value', settingsSpecialValueNode],
    ['Settings sections', settingsSections],
    ['Settings chat assist', settingsChatAssist],
    ['Source File Management settings', sourceFileManagementSettingsRows],
    ['Help KTV layout', helpKtvLayout],
    ['Storyboard Widget manager header', mainPanelStoryboardWidgetManagerHeader],
    ['Schema summary', schemaSummary],
    ['Floating chat sections', floatingPanelChatSections],
  ] as const) {
    if (
      consumerSource.includes('rounded-full border')
      || consumerSource.includes('inline-flex min-h-6')
      || consumerSource.includes('inline-flex items-center h-6 rounded-full')
      || consumerSource.includes('inline-flex items-center rounded px-1.5')
      || consumerSource.includes('App-toolbar__btn text-xs border ${UI_THEME_TOKENS.panel.border} ${UI_THEME_TOKENS.panel.bg}')
      || consumerSource.includes('pillButtonClassName')
      || consumerSource.includes('statusPillClassName')
    ) {
      throw new Error(`Expected ${consumerName} section chips to avoid local rounded/pill chrome`)
    }
  }
  if (
    !mainPanelSectionHeader.includes('KTV_SECTION_TITLE_CLASS_NAME')
    || mainPanelSectionHeader.includes('uiPanelMicroLabelTextSizeClass')
    || mainPanelSectionHeader.includes('text-xs font-semibold')
    || !collapsibleSubsection.includes('KTV_HEADER_LABEL_CLASS_NAME')
    || collapsibleSubsection.includes('text-xs font-semibold')
  ) {
    throw new Error('Expected MainPanel/FloatingPanel section headers to reuse the shared KTV typography hierarchy')
  }
  for (const [consumerName, consumerSource] of [
    ['Help Panel Tour', helpPanelTourSection],
    ['Help Shortcuts', helpShortcutsSection],
    ['Help Cheatsheet', helpCheatsheetSection],
    ['Help Icons', helpIconsSection],
    ['Help Workflow Links', helpWorkflowLinksSection],
    ['Settings runtime', settingsViewRuntime],
    ['Media Nodes', mediaNodesSection],
    ['Graph Fields header', mainPanelGraphFieldsHeader],
    ['Graph Fields settings', fieldSettingsPanel],
    ['Graph Fields list', graphFieldsListPanel],
    ['Graph Fields samples', fieldSamplesPanel],
    ['Workspace actions', workspaceActionsPanel],
    ['Widget palette', widgetPalette],
    ['Floating chat', floatingPanelChat],
  ] as const) {
    if (!consumerSource.includes('KTV_ROW_TEXT_SIZE_FALLBACK_CLASS_NAME')) {
      throw new Error(`Expected ${consumerName} to reuse the shared KTV row text fallback`)
    }
  }
  for (const [consumerName, consumerSource] of graphFieldSettingSectionTexts) {
    if (!consumerSource.includes('KTV_ROW_TEXT_SIZE_FALLBACK_CLASS_NAME')) {
      throw new Error(`Expected graph field ${consumerName} to reuse the shared KTV row text fallback`)
    }
  }
  for (const [consumerName, consumerSource] of [
    ['Settings row', settingsEntryRow],
    ['Media Nodes', mediaNodesSection],
    ['Floating chat', floatingPanelChat],
    ['Default Value', graphFieldSettingSectionTexts.find(([fileName]) => fileName === 'DefaultValueSection.tsx')?.[1] || ''],
  ] as const) {
    if (!consumerSource.includes('KTV_STATUS_TEXT_SIZE_CLASS_NAME')) {
      throw new Error(`Expected ${consumerName} status/action text to reuse the shared KTV status text size`)
    }
  }
  for (const [consumerName, consumerSource] of [
    ['Settings runtime', settingsViewRuntime],
    ['Default Value', graphFieldSettingSectionTexts.find(([fileName]) => fileName === 'DefaultValueSection.tsx')?.[1] || ''],
  ] as const) {
    if (!consumerSource.includes('PANEL_TYPOGRAPHY_DEFAULTS.keyValueInputClass')) {
      throw new Error(`Expected ${consumerName} editable value inputs to reuse the shared panel typography input class`)
    }
  }
  if (
    !sharedPanelTypography.includes('export const PANEL_KEY_VALUE_INPUT_CLASS_BY_TEXT_SIZE') ||
    !sharedPanelTypography.includes('export const PANEL_TYPOGRAPHY_DENSITY_PRESETS') ||
    !sharedPanelTypography.includes('keyValueInputClass: PANEL_KEY_VALUE_INPUT_CLASS_BY_TEXT_SIZE.textSm') ||
    !sharedPanelTypography.includes('keyValueInputClass: PANEL_KEY_VALUE_INPUT_CLASS_BY_TEXT_SIZE.textXs')
  ) {
    throw new Error('Expected shared panel typography to own key-value input class variants and density presets')
  }
  if (
    !settingsView.includes('PANEL_TYPOGRAPHY_DENSITY_PRESETS') ||
    settingsView.includes('uiPanelKeyValueInputClass: `w-full h-6 px-2')
  ) {
    throw new Error('Expected Settings density presets to reuse shared panel typography presets')
  }
  for (const [consumerName, consumerSource] of [
    ['Settings UI renderer', settingsUi],
    ['Settings registry UI', settingsRegistryUi],
    ['UI slice core actions', uiSliceCoreActions],
    ['Render settings', renderSettingsSection],
    ['Renderer palette settings', rendererPaletteSettings],
    ['AI KG layers', aiKgLayersSection],
    ['GraphRAG workflow', graphRagWorkflowSection],
    ['GraphRAG workflow indexing', graphRagWorkflowIndexingSection],
    ['Three view tuning', threeViewTuningSection],
    ['Schema editor UI classes', schemaEditorUiClasses],
    ...graphFieldSharedInputClassSectionTexts.map(([fileName, text]) => [`Graph Fields ${fileName}`, text] as const),
  ] as const) {
    if (!consumerSource.includes('PANEL_TYPOGRAPHY_DEFAULTS.keyValueInputClass')) {
      throw new Error(`Expected ${consumerName} editable value inputs to reuse the shared panel typography input class`)
    }
    if (
      consumerSource.includes('`w-full h-6 px-2 text-sm border') ||
      consumerSource.includes('`w-full h-6 px-2 text-xs border') ||
      consumerSource.includes('`w-full min-w-0 max-w-full h-6 px-2 text-sm border') ||
      consumerSource.includes('min-w-0 flex-1 h-6 px-2 text-xs')
    ) {
      throw new Error(`Expected ${consumerName} to avoid local key-value input class redefinitions`)
    }
  }
  if (
    floatingPropsPanel.includes("uiPanelKeyValueTextSizeClass || 'text-xs'")
    || floatingPropsPanel.includes("uiPanelMicroLabelTextSizeClass || 'text-[10px]'")
    || floatingPropsPanel.includes('text-[10px]')
    || floatingPropsPanel.includes('text-[11px]')
    || floatingPanelChat.includes("uiPanelKeyValueTextSizeClass || 'text-sm'")
    || floatingPanelChat.includes("uiPanelMicroLabelTextSizeClass || 'text-xs'")
    || floatingPanelChatSections.includes('text-[10px]')
    || mediaNodesSection.includes('text-[10px]')
    || mediaNodesSection.includes('text-[11px]')
    || mediaNodesSection.includes('text-xs font-semibold')
    || settingsViewRuntime.includes("uiPanelKeyValueTextSizeClass || 'text-xs'")
    || settingsViewRuntime.includes('w-full h-6 px-2 text-xs')
    || settingsEntryRow.includes('px-2 text-xs')
  ) {
    throw new Error('Expected KTV MainPanel/FloatingPanel consumers to avoid local row/status typography fallbacks')
  }
  for (const [consumerName, consumerSource] of graphFieldSettingSectionTexts) {
    if (
      consumerSource.includes("uiPanelKeyValueTextSizeClass || 'text-xs'")
      || consumerSource.includes('App-toolbar__btn text-xs')
      || consumerSource.includes('px-2 text-xs')
    ) {
      throw new Error(`Expected graph field ${consumerName} to avoid local row/control typography fallbacks`)
    }
  }
  if (!sharedKtvLayout.includes('z-20 border-b ${UI_THEME_TOKENS.panel.border}')) {
    throw new Error('Expected KTV sticky headers to own the shared bottom divider')
  }
  if (
    !sharedKtvLayout.includes('${KTV_ROW_VALUE_CELL_CLASS_NAME} items-center ${KTV_HEADER_LABEL_CLASS_NAME}')
    || !sharedKtvLayout.includes('sm:justify-end')
  ) {
    throw new Error('Expected the shared KTV header Value cell to preserve responsive value alignment')
  }
  if (!settingsView.includes('<KeyTypeValueHeader') || !collaborationView.includes('<KeyTypeValueHeader')) {
    throw new Error('Expected Settings and Collaboration KTV headers to reuse the shared KeyTypeValueHeader')
  }
  if (settingsView.includes('absolute right-0 top-1/2') || collaborationView.includes('absolute right-0 top-1/2')) {
    throw new Error('Expected KTV header expand/collapse controls to live in the shared header action slot instead of overlaying the Value column')
  }
  if (settingsView.includes('headerDividerWidthClass') || settingsView.includes('border-b-[0.5px]')) {
    throw new Error('Expected Settings-derived KTV headers to avoid local divider chrome')
  }
  if (collaborationView.includes('sticky top-0 z-20 border-b')) {
    throw new Error('Expected CollaborationView KTV header to avoid drawing a top divider above the first body section')
  }
  if (
    !collaborationView.includes('KeyTypeValueSectionStack')
    || !collaborationView.includes('shouldFlushKeyTypeValueSectionTop(index)')
    || collaborationView.includes('className="space-y-0 py-0"')
    || collaborationView.includes('flushTop={index === 0}')
  ) {
    throw new Error('Expected Collaboration KTV sections to reuse the shared section stack seam helper')
  }
  if (
    !settingsView.includes('KeyTypeValueSectionStack')
    || !settingsView.includes('flushFirstSectionTop={!headerHasToolbarStrip}')
    || !settingsSections.includes('shouldFlushKeyTypeValueSectionTop(index)')
  ) {
    throw new Error('Expected Settings-derived MainPanel tabs to reuse the shared KTV seam helper')
  }
  if (
    !helpSections.includes('KeyTypeValueSectionStack')
    || !helpSections.includes('shouldFlushKeyTypeValueSectionTop(0)')
  ) {
    throw new Error('Expected MainPanel Help sections to reuse the shared KTV seam helper')
  }
  if (!expandCollapseAllButton.includes('ChevronsDown') || !expandCollapseAllButton.includes('ChevronsUp')) {
    throw new Error('Expected expand/collapse-all KTV header control to use explicit icon-only expand/collapse glyphs')
  }
  if (!mainPanelSectionHeader.includes('MAIN_PANEL_SECTION_HEADER_ROOT_CLASS_NAME') || !mainPanelSectionHeader.includes('flex min-h-8 min-w-0 max-w-full items-center justify-between gap-1')) {
    throw new Error('Expected Dashboard/Help headers to share one lean MainPanel section header shell')
  }
  if (!mainPanelSectionHeader.includes('MAIN_PANEL_SECTION_HEADER_ACTIONS_CLASS_NAME') || !mainPanelSectionHeader.includes('MAIN_PANEL_SECTION_HEADER_TITLE_CLASS_NAME')) {
    throw new Error('Expected MainPanel section header title and action slots to be centralized')
  }
  if (!dashboardHeader.includes('MainPanelSectionHeader') || !helpHeader.includes('MainPanelSectionHeader')) {
    throw new Error('Expected Dashboard and Help headers to reuse the shared MainPanel section header')
  }
  if (dashboardHeader.includes('border-t') || dashboardHeader.includes('mt-4') || helpHeader.includes('border-t') || helpHeader.includes('mt-4')) {
    throw new Error('Expected Dashboard and Help headers to avoid local top divider/margin chrome')
  }
  if (!helpHeader.includes('ExpandCollapseAllButton') || helpHeader.includes("from 'lucide-react'") || helpHeader.includes('ChevronDown')) {
    throw new Error('Expected Help header expand/collapse-all to reuse the shared icon-only button')
  }
  if (graphStatsPanel.includes('CollapsibleSection title="Dashboard"')) {
    throw new Error('Expected Dashboard controls to avoid a duplicate Dashboard collapsible header')
  }
  if (
    !mainPanelTabDescriptions.includes("agentic-graph-mainpanel-tabs.md?raw")
    || !mainPanelTabDescriptions.includes('MAIN_PANEL_TAB_DESCRIPTIONS_DOC_PATH')
    || !mainPanelTabDescriptions.includes('loadMainPanelTabKtvRows')
    || !mainPanelTabDescriptions.includes('buildMainPanelTabKtvRows')
  ) {
    throw new Error('Expected MainPanel tab KTV values to be loaded from the editable docs/documents markdown source')
  }
  if (mainPanelTabDescriptions.includes("import mainPanelTabsMarkdown from")) {
    throw new Error('Expected MainPanel tab docs to avoid top-level markdown raw imports that break Node/runtime tests')
  }
  if (!mainPanelMarkdownTable.includes('parseMarkdownTableRows') || !mainPanelTabDescriptions.includes("from './mainPanelMarkdownTable'")) {
    throw new Error('Expected MainPanel docs-backed KTV tables to reuse one markdown table parser')
  }
  if (!mainPanelHelpCheatsheet.includes("from '@/features/panels/mainPanelMarkdownTable'")) {
    throw new Error('Expected MainPanel Help cheatsheet docs to reuse the shared markdown table parser')
  }
  if (!mainPanelHelpDev.includes("from '@/features/panels/mainPanelMarkdownTable'")) {
    throw new Error('Expected MainPanel Help dev docs to reuse the shared markdown table parser')
  }
  if (!mainPanelHelpShortcuts.includes("from '@/features/panels/mainPanelMarkdownTable'")) {
    throw new Error('Expected MainPanel Help shortcut docs to reuse the shared markdown table parser')
  }
  if (!mainPanelHelpIconTexts.includes("from '@/features/panels/mainPanelMarkdownTable'")) {
    throw new Error('Expected MainPanel Help icon docs to reuse the shared markdown table parser')
  }
  if (!mainPanelWorkflowLinks.includes("from '@/features/panels/mainPanelMarkdownTable'")) {
    throw new Error('Expected MainPanel workflow-link docs to reuse the shared markdown table parser')
  }
  if (!mainPanelTabDescriptions.includes('MAIN_PANEL_TABS.map') || !mainPanelTabDescriptions.includes('MAIN_PANEL_TAB_TYPE_ICON_KEY_BY_TAB[tab.key]')) {
    throw new Error('Expected MainPanel tab KTV rows to derive keys and Type icons from shared MainPanel tab/icon owners')
  }
  if (!mainPanelTabDescriptions.includes('descriptionByKey[tab.key]')) {
    throw new Error('Expected MainPanel tab KTV Value cells to derive from the docs-backed description lookup')
  }
  if (!helpPanelTourSection.includes('loadMainPanelTabKtvRows') || helpPanelTourSection.includes('panelTourRows') || helpPanelTourSection.includes('MAIN_PANEL_TAB_KTV_ROWS')) {
    throw new Error('Expected Help MainPanel tabs section to render derived tab KTV rows instead of local row fixtures')
  }
  if (
    !mainPanelHelpCheatsheet.includes('MAIN_PANEL_HELP_CHEATSHEET_DOC_PATH')
    || !mainPanelHelpCheatsheet.includes("agentic-graph-mainpanel-help-cheatsheet.md?raw")
    || !mainPanelHelpCheatsheet.includes('parseMainPanelHelpCheatsheetTexts')
    || !mainPanelHelpCheatsheet.includes('loadMainPanelHelpCheatsheetTexts')
    || !helpCheatsheetSection.includes('loadMainPanelHelpCheatsheetTexts')
  ) {
    throw new Error('Expected Help cheatsheet KTV values to load from docs/documents instead of inline source prose')
  }
  if (!mainPanelHelpCheatsheetDoc.includes('| Key | Type | Gesture | Value | Details |')) {
    throw new Error('Expected editable MainPanel Help cheatsheet descriptions doc to use a KTV table')
  }
  for (const cheatsheetKey of [
    'select.single',
    'zoom.fitSelection',
    'select.multi',
    'layout.radial',
    'graph.layers',
    'create.shiftDrag',
    'create.clickSourceTarget',
    'create.panelOnly',
  ]) {
    if (!mainPanelHelpCheatsheetDoc.includes(`| ${cheatsheetKey} |`)) {
      throw new Error(`Expected editable MainPanel Help cheatsheet descriptions doc to include ${cheatsheetKey}`)
    }
  }
  for (const staleCheatsheetValue of [
    'Zoom and drag behave normally; one node stays selected',
    'Single-select → click one node to focus selection',
    'Toggle Multi-select Mode, then click nodes/edges',
    'Canvas clusters → toggle the toolbar button',
    'Toolbar edge tools → pick an edge type',
    'Panel-only creation → use floating panels',
  ]) {
    if (helpCheatsheetSection.includes(staleCheatsheetValue)) {
      throw new Error(`Expected Help cheatsheet Value text to live in docs/documents instead of source: ${staleCheatsheetValue}`)
    }
  }
  if (helpCheatsheetSection.includes('text.gesture') || helpCheatsheetSection.includes('text.details.map')) {
    throw new Error('Expected Help cheatsheet Value cells to render only concise docs Value text, not Gesture or Details prose')
  }
  if (
    !mainPanelHelpDev.includes('MAIN_PANEL_HELP_DEV_DOC_PATH')
    || !mainPanelHelpDev.includes("agentic-graph-mainpanel-help-dev.md?raw")
    || !mainPanelHelpDev.includes('parseMainPanelHelpDevTexts')
    || !mainPanelHelpDev.includes('loadMainPanelHelpDevTexts')
    || !helpView.includes('loadMainPanelHelpDevTexts')
  ) {
    throw new Error('Expected Help dev KTV values to load from docs/documents instead of inline source prose')
  }
  if (!mainPanelHelpDevDoc.includes('| Key | Type | Value | Details |')) {
    throw new Error('Expected editable MainPanel Help dev descriptions doc to use a KTV table')
  }
  for (const helpDevTextKey of [
    'dev.lsKeyMappings',
    'dev.uiIconScalePreview',
    'semantic.layerDerivation',
  ]) {
    if (!mainPanelHelpDevDoc.includes(`| ${helpDevTextKey} |`)) {
      throw new Error(`Expected editable MainPanel Help dev descriptions doc to include ${helpDevTextKey}`)
    }
  }
  for (const staleHelpDevValue of [
    'Dev: uiIconScale preview',
    'Semantic layer derivation (cosine / PMI, top',
    'Semantic layer mode builds a weighted similarity graph',
    'The implementation constructs an inverted index',
    'For each node, neighbor candidates are sorted by similarity',
    'A NetworkX connected-components pass assigns clusters',
    'getOrchestratorSectionMarkdownTable',
    'getRenderSectionDiagnostics',
  ]) {
    if (helpView.includes(staleHelpDevValue)) {
      throw new Error(`Expected Help dev/semantic Value text to live in docs/documents instead of source: ${staleHelpDevValue}`)
    }
  }
  if (
    !mainPanelHelpShortcuts.includes('MAIN_PANEL_HELP_SHORTCUTS_DOC_PATH')
    || !mainPanelHelpShortcuts.includes("agentic-graph-mainpanel-help-shortcuts.md?raw")
    || !mainPanelHelpShortcuts.includes('parseMainPanelHelpShortcutTexts')
    || !mainPanelHelpShortcuts.includes('loadMainPanelHelpShortcutTexts')
    || !helpShortcutsSection.includes('loadMainPanelHelpShortcutTexts')
  ) {
    throw new Error('Expected Help shortcut KTV values to load from docs/documents instead of inline source prose')
  }
  if (!mainPanelHelpShortcutsDoc.includes('| Key | Type | Value |')) {
    throw new Error('Expected editable MainPanel Help shortcut descriptions doc to use a KTV table')
  }
  for (const shortcutTextKey of [
    'precedence.space-pan',
    'precedence.wheel-zoom',
    'precedence.modifiers-marquee',
    'other.included',
  ]) {
    if (!mainPanelHelpShortcutsDoc.includes(`| ${shortcutTextKey} |`)) {
      throw new Error(`Expected editable MainPanel Help shortcut descriptions doc to include ${shortcutTextKey}`)
    }
  }
  for (const staleShortcutValue of [
    'When Space is held, pointer drag pans the viewport',
    'In the default preset, wheel zooms.',
    'Shift adds to selection; Alt removes',
    'Included in the Help shortcut bundle.',
  ]) {
    if (helpShortcutsSection.includes(staleShortcutValue)) {
      throw new Error(`Expected Help shortcut Value text to live in docs/documents instead of source: ${staleShortcutValue}`)
    }
  }
  if (helpShortcutsSection.includes('s.notes')) {
    throw new Error('Expected Help shortcut Value cells to avoid rendering verbose shortcut notes')
  }
  if (
    !mainPanelHelpIconTexts.includes('MAIN_PANEL_HELP_ICONS_DOC_PATH')
    || !mainPanelHelpIconTexts.includes("agentic-graph-mainpanel-help-icons.md?raw")
    || !mainPanelHelpIconTexts.includes('parseMainPanelHelpIconTexts')
    || !mainPanelHelpIconTexts.includes('loadMainPanelHelpIconTexts')
    || !helpIconsSection.includes('loadMainPanelHelpIconTexts')
  ) {
    throw new Error('Expected Help icon-library KTV values to load from docs/documents instead of inline source prose')
  }
  if (!mainPanelHelpIconsDoc.includes('| Key | Type | Value | Details |')) {
    throw new Error('Expected editable MainPanel Help icon descriptions doc to use a KTV table')
  }
  for (const iconKey of mainPanelTypeIconKeys) {
    if (!mainPanelHelpIconsDoc.includes(`| ${iconKey} | ${iconKey} |`)) {
      throw new Error(`Expected editable MainPanel Help icon descriptions doc to include ${iconKey}`)
    }
  }
  for (const helpIconTextKey of [
    'iconLegend.header',
    'iconDensity.settings',
    'reuse.contract',
    'graphDataTable.mapping',
    'field.scope.node',
    'field.scope.edge',
    'field.origin.custom',
    'field.origin.derived',
    'field.visibility.show',
    'field.visibility.hide',
    'field.type.singleLineText',
    'field.type.longText',
    'field.type.number',
    'field.type.decimal',
    'field.type.checkbox',
    'field.type.multiSelect',
    'field.type.singleSelect',
    'field.type.dateTime',
    'field.type.url',
    'field.type.currency',
    'field.type.json',
  ]) {
    if (!mainPanelHelpIconsDoc.includes(`| ${helpIconTextKey} |`)) {
      throw new Error(`Expected editable MainPanel Help icon descriptions doc to include ${helpIconTextKey}`)
    }
  }
  if (mainPanelHelpIconLibrary.includes('agentic:') || mainPanelHelpIconLibrary.includes('usage:')) {
    throw new Error('Expected MainPanel Help Icon Library to own icons only, not rendered KTV Value prose')
  }
  for (const staleHelpIconValue of [
    'Icons in toolbars, headers, and this legend follow UI Density: Icons in Panel Settings.',
    'Node-level property',
    'Field attached to nodes; use for node attributes such as title or type.',
    'Remote actor',
    'Identifies participants, peer count, ownership rows, and local/remote presence.',
    'GRAPH_FIELDS_ICON_LEGEND_REUSE_TEXT',
    'GRAPH_FIELDS_GRAPH_DATA_TABLE_MAPPING_TOOLTIP}</HelpKtvMutedText>',
    'row.agentic',
    'row.usage',
  ]) {
    if (helpIconsSection.includes(staleHelpIconValue)) {
      throw new Error(`Expected Help icon-library Value text to live in docs/documents instead of source: ${staleHelpIconValue}`)
    }
  }
  if (helpIconsSection.includes('text.details.map')) {
    throw new Error('Expected Help icon-library Value cells to render only concise docs Value text, not Details prose')
  }
  if (
    helpIconsSection.includes("from '@/features/graph-fields/ui/graphFieldIcons'")
    || helpIconsSection.includes('KindPill')
    || helpIconsSection.includes('ScopeIcon')
    || helpIconsSection.includes('FieldOriginIcon')
    || helpIconsSection.includes('VisibilityIcon')
  ) {
    throw new Error('Expected Help icon-library Type cells, including graph field rows, to reuse the centralized MainPanel Help Icon Library')
  }
  if (
    !mainPanelWorkflowLinks.includes('MAIN_PANEL_WORKFLOW_LINKS_DOC_PATH')
    || !mainPanelWorkflowLinks.includes("agentic-graph-mainpanel-workflow-links.md?raw")
    || !mainPanelWorkflowLinks.includes('parseMainPanelWorkflowLinkTexts')
    || !mainPanelWorkflowLinks.includes('loadMainPanelWorkflowLinkTexts')
    || !helpWorkflowLinksSection.includes('loadMainPanelWorkflowLinkTexts')
  ) {
    throw new Error('Expected Help workflow-link KTV values to load from docs/documents instead of inline source prose')
  }
  if (!mainPanelWorkflowLinksDoc.includes('| Key | Type | Value | Details |')) {
    throw new Error('Expected editable MainPanel workflow-link descriptions doc to use a KTV table')
  }
  for (const workflowLinkKey of ['workflow.open', 'pipeline.ingestValidate', 'pipeline.renderInspect', 'pipeline.agenticReasoning', 'cluster.layers', 'agentic.labels', 'markdown.entryPoints', 'workflow.entry.mainPanel', 'workflow.entry.bottomPanel', 'workflow.entry.workspace', 'graphrag.metadata', 'graphrag.canvasEntry', 'graphrag.markdownPipeline', 'graphrag.storesWorkflow']) {
    if (!mainPanelWorkflowLinksDoc.includes(`| ${workflowLinkKey} |`)) {
      throw new Error(`Expected editable MainPanel workflow-link descriptions doc to include ${workflowLinkKey}`)
    }
  }
  for (const staleWorkflowLinkValue of [
    'Workflow Manager tab → Step 6',
    'Render tab → Markdown pipeline helper section',
    'Toolbar →',
    'Path metadata traces canvas, pipeline, stores, and workflow entry points',
    'canvas/src/pages/Canvas.tsx → canvas/src/components/GraphCanvas.tsx',
    'Main Panel Workflow Manager tab → python -m agentic_graph_parser markdown',
    'Shared labels explain each reasoning stage without adding renderer-specific aliases',
    'Run codebase indexing from any listed surface',
    'Phases render on the canvas as soft grouped outlines around owned steps',
  ]) {
    if (helpWorkflowLinksSection.includes(staleWorkflowLinkValue)) {
      throw new Error(`Expected Help workflow-link Value text to live in docs/documents instead of source: ${staleWorkflowLinkValue}`)
    }
  }
  if (helpWorkflowLinksSection.includes('.details.map')) {
    throw new Error('Expected Help workflow-link Value cells to render only concise docs Value text, not Details prose')
  }
  for (const staleHardcodedHelpText of [
    'Load data, toggle 2D and 3D modes',
    'Use Workflow Manager and Help tabs',
    'Use Renderer and Graph Traversal',
    'Use Stats and History for quick review',
  ]) {
    if (helpPanelTourSection.includes(staleHardcodedHelpText)) {
      throw new Error(`Expected Help MainPanel tab values to avoid stale hardcoded prose: ${staleHardcodedHelpText}`)
    }
  }
  if (!mainPanelTabsDoc.includes('| Key | Type | Value |')) {
    throw new Error('Expected editable MainPanel tab descriptions doc to use a KTV table')
  }
  ;[
    ['MainPanel tab descriptions', mainPanelTabsDoc],
    ['MainPanel Help cheatsheet', mainPanelHelpCheatsheetDoc],
    ['MainPanel Help dev', mainPanelHelpDevDoc],
    ['MainPanel Help shortcuts', mainPanelHelpShortcutsDoc],
    ['MainPanel Help icons', mainPanelHelpIconsDoc],
    ['MainPanel workflow links', mainPanelWorkflowLinksDoc],
  ].forEach(([docName, markdown]) => {
    assertHelpDocValuesAreConcise(docName, markdown)
  })
  if (
    !mainPanelSectionDescriptionsDoc.includes('| Key | Type | Value | Highlights |')
    || !mainPanelSectionDescriptionsDoc.includes('| Crawler Access MCP Configuration | mainPanel.sectionDescription |')
    || !mainPanelSectionDescriptions.includes('MAIN_PANEL_SECTION_DESCRIPTIONS_DOC_PATH')
    || !mainPanelSectionDescriptions.includes('__AGENTIC_OS_MAIN_PANEL_SECTION_DESCRIPTIONS_MARKDOWN__')
    || !settingsSections.includes('loadMainPanelSectionDescriptions')
  ) {
    throw new Error('Expected MainPanel section descriptions to be editable from docs/documents outside KTV Value cells')
  }
  for (const staleHardcodedMainPanelDescription of [
    'Uses shared BytePlus auth_mode and api_key from BytePlus Shared + Text API.',
    'MainPanel Maps remains backend/system/API-facing',
  ]) {
    if (settingsViewConstants.includes(staleHardcodedMainPanelDescription) || settingsEntryRowValue.includes(staleHardcodedMainPanelDescription)) {
      throw new Error(`Expected section description prose to live in docs/documents instead of row/value source: ${staleHardcodedMainPanelDescription}`)
    }
  }
  for (const staleHardcodedValuePrefix of [
    "value: 'Shared prompt contract composes",
    "value: 'Optional provider-side array of external MCP server configs",
    "value: 'Reasoning chunks arrive in delta.reasoning_steps",
    "value: 'Each SSE data frame is expected to carry",
    "value: 'When chatStorageTarget is chatAgenticGraph",
    "value: 'Use restricted API key permissions only",
    "value: 'MainPanel MCP is ready to accept payment",
    "value: 'Cloudflare zone policy owns Pay Per Crawl",
    "value: 'Crawler routes expose read-only Source Files",
    "value: 'Crawler payment is Cloudflare Pay Per Crawl",
    "value: 'Provider-side remote MCP descriptors",
    "value: 'Optional and plan-dependent",
    "value: 'agentic-graph MCP readiness remains owned",
    "value: '200 OK; 400 Bad Request",
    'value: `POST ${STRIPE_PAYMENT_ROUTE_PATHS.checkoutSession} ->',
  ]) {
    if (mainPanelDocMappedValueSources.some(text => text.includes(staleHardcodedValuePrefix))) {
      throw new Error(`Expected MainPanel editable Value defaults to avoid hardcoded prose: ${staleHardcodedValuePrefix}`)
    }
  }
  for (const tabKey of mainPanelTabKeys) {
    const docRow = docRows.get(tabKey)
    if (!docRow) {
      throw new Error(`Expected editable MainPanel tab descriptions doc to include ${tabKey}`)
    }
    const expectedType = tabIconKeyByTab.get(tabKey)
    if (expectedType && docRow.type !== expectedType) {
      throw new Error(`Expected ${tabKey} doc Type to match shared icon key ${expectedType}`)
    }
    if (!docRow.value || /^tbd$/i.test(docRow.value) || docRow.value === '—') {
      throw new Error(`Expected ${tabKey} doc Value to be editable non-empty text`)
    }
    if (docRow.value.length > 160) {
      throw new Error(`Expected ${tabKey} doc Value to stay concise rather than embedding verbose UI prose`)
    }
  }
  if (!helpSections.includes('<KeyTypeValueHeader')) {
    throw new Error('Expected MainPanel Help to reuse the shared KTV column header')
  }
  if (
    !helpKtvLayout.includes("from 'grph-shared/react/keyTypeValueRow'")
    || !helpKtvLayout.includes('KeyTypeValueStaticRow')
    || !helpKtvLayout.includes('RightAlignedValueCell')
  ) {
    throw new Error('Expected MainPanel Help KTV layout to import the shared static KTV row/value primitives directly')
  }
  if (
    !graphRagWorkflowSection.includes("from 'grph-shared/react/keyTypeValueRow'")
    || !graphRagWorkflowSection.includes('KeyTypeValueStaticRow')
    || !graphRagWorkflowSection.includes('RightAlignedValueCell')
  ) {
    throw new Error('Expected GraphRAG workflow rows to import the shared static KTV row/value primitives directly')
  }
  if (
    !fieldLocalSchemaRowsEditor.includes("from 'grph-shared/react/keyTypeValueRow'")
    || !fieldLocalSchemaRowsEditor.includes('KeyTypeValueStaticRow')
    || !fieldLocalSchemaRowsEditor.includes('RightAlignedValueCell')
  ) {
    throw new Error('Expected graph-field local schema rows to import the shared static KTV row/value primitives directly')
  }
  if (
    !renderSettingsSection.includes("from 'grph-shared/react/keyTypeValueRow'")
    || !renderSettingsSection.includes('KeyTypeValueStaticRow')
    || !renderSettingsSection.includes('RightAlignedValueCell')
  ) {
    throw new Error('Expected render settings compact 2D layout rows to import the shared static KTV row/value primitives directly')
  }
  if (
    !rendererPaletteSettings.includes("from 'grph-shared/react/keyTypeValueRow'")
    || !rendererPaletteSettings.includes('KeyTypeValueStaticRow')
    || !rendererPaletteSettings.includes('RightAlignedValueCell')
  ) {
    throw new Error('Expected renderer palette rows to import the shared static KTV row/value primitives directly')
  }
  if (
    !rendererHoverSettings.includes("from 'grph-shared/react/keyTypeValueRow'")
    || !rendererHoverSettings.includes('KeyTypeValueStaticRow')
  ) {
    throw new Error('Expected renderer hover rows to import the shared static KTV row owner directly')
  }
  if (
    !workspaceActionsPanel.includes("from '@/features/panels/ui/RightAlignedTooltipInput'")
    || !collaborationView.includes("from '@/features/panels/ui/RightAlignedTooltipInput'")
    || !renderPresetSection.includes("from '@/features/panels/ui/RightAlignedTooltipInput'")
    || !graphRagWorkflowIndexingSection.includes("from '@/features/panels/ui/RightAlignedTooltipInput'")
  ) {
    throw new Error('Expected the remaining editable KTV consumers to import RightAlignedTooltipInput from the dedicated editable bridge module')
  }
  if (
    !collaborationView.includes("from '@/features/panels/ui/canvasKeyTypeValueValueCell'")
    || collaborationView.includes("from '@/features/panels/ui/KeyTypeValueRow'")
  ) {
    throw new Error('Expected CollaborationView to import RightAlignedValueCell from the dedicated canvas value-cell compatibility owner')
  }
  if (
    !collaborationView.includes("from '@/features/panels/ui/CanvasEditableKeyTypeValueRow'")
    || !renderPresetSection.includes("from '@/features/panels/ui/CanvasEditableKeyTypeValueRow'")
    || !graphRagWorkflowIndexingSection.includes("from '@/features/panels/ui/CanvasEditableKeyTypeValueRow'")
    || !collaborationView.includes('CanvasEditableKeyTypeValueRow as KeyTypeValueRow')
    || !renderPresetSection.includes('CanvasEditableKeyTypeValueRow as KeyTypeValueRow')
    || !graphRagWorkflowIndexingSection.includes('CanvasEditableKeyTypeValueRow as KeyTypeValueRow')
  ) {
    throw new Error('Expected the remaining editable KTV row consumers to import the dedicated direct-shared editable row bridge instead of the legacy KeyTypeValueRow wrapper')
  }
  if (
    !threeViewSelectionSection.includes("from '@/features/panels/ui/PanelKeyTypeRangeValueRow'") ||
    !threeViewSelectionSection.includes('PanelKeyTypeRangeValueRow')
  ) {
    throw new Error('Expected three-view selection rows to consume the shared panel KTV range-value row owner')
  }
  if (
    !threeViewLinksSection.includes("from '@/features/panels/ui/PanelKeyTypeRangeValueRow'") ||
    !threeViewLinksSection.includes('PanelKeyTypeRangeValueRow')
  ) {
    throw new Error('Expected three-view link rows to consume the shared panel KTV range-value row owner')
  }
  if (
    !threeViewStarfieldSection.includes("from '@/features/panels/ui/PanelKeyTypeCheckboxValueRow'") ||
    !threeViewStarfieldSection.includes("from '@/features/panels/ui/PanelKeyTypeRangeValueRow'") ||
    !threeViewStarfieldSection.includes('PanelKeyTypeCheckboxValueRow') ||
    !threeViewStarfieldSection.includes('PanelKeyTypeRangeValueRow')
  ) {
    throw new Error('Expected three-view starfield rows to consume the shared panel KTV checkbox and range-value row owners for starfield controls')
  }
  if (
    !threeViewBackgroundFogSection.includes("from '@/features/panels/ui/PanelKeyTypeRangeValueRow'") ||
    !threeViewBackgroundFogSection.includes('PanelKeyTypeRangeValueRow')
  ) {
    throw new Error('Expected three-view background/fog fog-distance rows to consume the shared panel KTV range-value row owner')
  }
  if (
    !panelKeyTypeCheckboxValueRow.includes("from 'grph-shared/react/keyTypeValueRow'") ||
    !panelKeyTypeCheckboxValueRow.includes('KeyTypeValueStaticRow') ||
    !panelKeyTypeCheckboxValueRow.includes("from '@/features/panels/ui/canvasKeyTypeValueRuntime'") ||
    !panelKeyTypeCheckboxValueRow.includes('useCanvasKeyTypeValueStaticRowProps') ||
    !panelKeyTypeCheckboxValueRow.includes("from '@/lib/ui/panelFormControls'") ||
    !panelKeyTypeCheckboxValueRow.includes('PanelCheckbox')
  ) {
    throw new Error('Expected the shared panel KTV checkbox row owner to bridge root KTV runtime props with the shared checkbox primitive')
  }
  if (
    !panelKeyTypeRangeValueRow.includes("from 'grph-shared/react/keyTypeValueRow'") ||
    !panelKeyTypeRangeValueRow.includes('KeyTypeValueStaticRow') ||
    !panelKeyTypeRangeValueRow.includes("from '@/features/panels/ui/canvasKeyTypeValueRuntime'") ||
    !panelKeyTypeRangeValueRow.includes('useCanvasKeyTypeValueStaticRowProps') ||
    !panelKeyTypeRangeValueRow.includes("from '@/lib/ui/panelFormControls'") ||
    !panelKeyTypeRangeValueRow.includes('PanelRangeInput')
  ) {
    throw new Error('Expected the shared panel KTV range-value row owner to bridge root KTV runtime props with the shared range primitive')
  }
  if (
    !threeViewCameraSection.includes("from '@/features/panels/ui/PanelKeyTypeRangeValueRow'") ||
    !threeViewCameraSection.includes('PanelKeyTypeRangeValueRow') ||
    threeViewCameraSection.includes('PanelKeyTypeCheckboxValueRow') ||
    threeViewCameraSection.includes('Auto Rotate')
  ) {
    throw new Error('Expected live three-view navigation rows to consume the shared range owner and omit dead auto-rotate controls')
  }
  if (
    !threeViewGlobeEffectsSection.includes("from '@/features/panels/ui/PanelKeyTypeCheckboxValueRow'") ||
    !threeViewGlobeEffectsSection.includes("from '@/features/panels/ui/PanelKeyTypeRangeValueRow'") ||
    !threeViewGlobeEffectsSection.includes('PanelKeyTypeCheckboxValueRow') ||
    !threeViewGlobeEffectsSection.includes('PanelKeyTypeRangeValueRow')
  ) {
    throw new Error('Expected three-view globe-effects rows to consume the shared panel KTV checkbox and range-value row owners')
  }
  if (
    !threeViewLayoutSection.includes("from 'grph-shared/react/keyTypeValueRow'") ||
    !threeViewLayoutSection.includes('KeyTypeValueStaticRow') ||
    !threeViewLayoutSection.includes("from '@/features/panels/ui/canvasKeyTypeValueRuntime'") ||
    !threeViewLayoutSection.includes('useCanvasKeyTypeValueStaticRowProps')
  ) {
    throw new Error('Expected three-view layout rows to import the shared static KTV row owner and root static-row prop helper directly')
  }
  if (
    !panelKeyTypeSliderNumberRow.includes("from 'grph-shared/react/keyTypeValueRow'") ||
    !panelKeyTypeSliderNumberRow.includes('KeyTypeValueStaticRow') ||
    !panelKeyTypeSliderNumberRow.includes("from '@/features/panels/ui/canvasKeyTypeValueRuntime'") ||
    !panelKeyTypeSliderNumberRow.includes('useCanvasKeyTypeValueStaticRowProps') ||
    !panelKeyTypeSliderNumberRow.includes("from '@/lib/ui/panelFormControls'") ||
    !panelKeyTypeSliderNumberRow.includes('PanelRangeInput') ||
    !panelKeyTypeSliderNumberRow.includes('PanelTextInput')
  ) {
    throw new Error('Expected the shared panel KTV slider-number row owner to bridge root KTV runtime props with shared range and number primitives')
  }
  if (
    !aiKgForceControls.includes("from '@/features/panels/ui/PanelKeyTypeSliderNumberRow'") ||
    !aiKgForceControls.includes('PanelKeyTypeSliderNumberRow')
  ) {
    throw new Error('Expected AI KG force controls to consume the shared panel KTV slider-number row owner')
  }
  if (
    !aiKgOpacityControls.includes("from '@/features/panels/ui/PanelKeyTypeSliderNumberRow'") ||
    !aiKgOpacityControls.includes('PanelKeyTypeSliderNumberRow')
  ) {
    throw new Error('Expected AI KG opacity controls to consume the shared panel KTV slider-number row owner')
  }
  if (
    !commandCatalogPanel.includes("from 'grph-shared/react/keyTypeValueRow'") ||
    !commandCatalogPanel.includes('KeyTypeValueStaticRow') ||
    !commandCatalogPanel.includes("from '@/features/panels/ui/canvasKeyTypeValueRuntime'") ||
    !commandCatalogPanel.includes('useCanvasKeyTypeValueStaticRowProps')
  ) {
    throw new Error('Expected command-menu catalog rows to import the shared static KTV row owner and root static-row prop helper directly')
  }
  if (
    !storyboardWidgetFloatingPanelView.includes("from 'grph-shared/react/keyTypeValueRow'") ||
    !storyboardWidgetFloatingPanelView.includes('KeyTypeValueStaticRow') ||
    !storyboardWidgetFloatingPanelView.includes("from '@/features/panels/ui/canvasKeyTypeValueRuntime'") ||
    !storyboardWidgetFloatingPanelView.includes('useCanvasKeyTypeValueStaticRowProps')
  ) {
    throw new Error('Expected Storyboard Widget floating-panel rows to import the shared static KTV row owner and root static-row prop helper directly')
  }
  if (
    !settingsEntryRow.includes("from 'grph-shared/react/keyTypeValueRow'") ||
    !settingsEntryRow.includes('KeyTypeValueStaticRow') ||
    !settingsEntryRow.includes("from '@/features/panels/ui/canvasKeyTypeValueRuntime'") ||
    !settingsEntryRow.includes('useCanvasKeyTypeValueStaticRowProps')
  ) {
    throw new Error('Expected Settings entry rows to import the shared static KTV row owner and root static-row prop helper directly')
  }
  if (
    !sourceFileManagementRows.includes("from 'grph-shared/react/keyTypeValueRow'") ||
    !sourceFileManagementRows.includes('KeyTypeValueStaticRow') ||
    !sourceFileManagementRows.includes("from '@/features/panels/ui/canvasKeyTypeValueRuntime'") ||
    !sourceFileManagementRows.includes('useCanvasKeyTypeValueStaticRowProps')
  ) {
    throw new Error('Expected Source File Management rows to import the shared static KTV row owner and root static-row prop helper directly')
  }
  if (
    !threeSizingAndWidthControls.includes("from 'grph-shared/react/keyTypeValueRow'") ||
    !threeSizingAndWidthControls.includes('KeyTypeValueStaticRow') ||
    !threeSizingAndWidthControls.includes("from '@/features/panels/ui/canvasKeyTypeValueRuntime'") ||
    !threeSizingAndWidthControls.includes('useCanvasKeyTypeValueStaticRowProps') ||
    !threeSizingAndWidthControls.includes("from '@/lib/ui/panelFormControls'") ||
    !threeSizingAndWidthControls.includes('PanelSelect') ||
    !threeSizingAndWidthControls.includes('PanelTextInput')
  ) {
    throw new Error('Expected shared three-view sizing and width controls to import the shared static KTV row owner, root static-row prop helper, and root panel select/text primitives directly')
  }
  if (
    !orchestratorTraversalPanels.includes("from 'grph-shared/react/keyTypeValueRow'") ||
    !orchestratorTraversalPanels.includes('KeyTypeValueStaticRow') ||
    !orchestratorTraversalPanels.includes("from '@/features/panels/ui/canvasKeyTypeValueRuntime'") ||
    !orchestratorTraversalPanels.includes('useCanvasKeyTypeValueStaticRowProps')
  ) {
    throw new Error('Expected orchestrator traversal preset rows to import the shared static KTV row owner and root static-row prop helper directly')
  }
  if (
    !orchestratorTraversalDelayRow.includes("from '@/features/panels/ui/PanelKeyTypeSliderNumberRow'") ||
    !orchestratorTraversalDelayRow.includes('PanelKeyTypeSliderNumberRow')
  ) {
    throw new Error('Expected orchestrator traversal delay rows to consume the shared panel KTV slider-number row owner')
  }
  if (
    !graphRagWorkflowIndexingSection.includes("from '@/features/panels/ui/PanelKeyTypeSliderNumberRow'") ||
    !graphRagWorkflowIndexingSection.includes('PanelKeyTypeSliderNumberRow') ||
    graphRagWorkflowIndexingSection.includes('type="range"')
  ) {
    throw new Error('Expected GraphRAG workflow indexing slider rows to consume the shared panel KTV slider-number row owner instead of local raw range inputs')
  }
  if (
    !fieldStylesSection.includes("from 'grph-shared/react/keyTypeValueRow'") ||
    !fieldStylesSection.includes('KeyTypeValueStaticRow') ||
    !fieldStylesSection.includes("from '@/features/panels/ui/canvasKeyTypeValueRuntime'") ||
    !fieldStylesSection.includes('useCanvasKeyTypeValueStaticRowProps')
  ) {
    throw new Error('Expected graph-field style rows to import the shared static KTV row owner and root static-row prop helper directly')
  }
  if (
    !helpKtvLayout.includes("from '@/features/panels/ui/mainPanelHelpIconLibrary'")
    || !helpKtvLayout.includes('MainPanelTypeIcon')
    || !helpKtvLayout.includes('MainPanelTypeIconKey')
  ) {
    throw new Error('Expected MainPanel Help KTV layout to reuse the centralized Help icon library for Type cells')
  }
  for (const [fileName, text] of helpViewSectionTexts) {
    if (!text.includes('HelpKtvRow') || !text.includes('HelpKtvValueStack')) {
      throw new Error(`Expected ${fileName} to render Help content through shared KTV rows`)
    }
    if (/<(?:table|thead|tbody|tr|td|th|ul|li)\b/.test(text) || text.includes('list-disc')) {
      throw new Error(`Expected ${fileName} to avoid local table/list layouts inside MainPanel Help`)
    }
  }
  for (const staleHelpHeaderText of [
    'Canvas shortcut table',
    'AgenticRAG alignment',
    'Usage notes',
    'Toolbar / panels',
    'Multi-dimensional Table mapping',
  ]) {
    if (helpViewSectionTexts.some(([, text]) => text.includes(staleHelpHeaderText))) {
      throw new Error(`Expected MainPanel Help to avoid stale local table header text: ${staleHelpHeaderText}`)
    }
  }

  for (const eventName of ['onPointerDown', 'onMouseDown', 'onClick', 'onKeyDown']) {
    if (!settingsEntryInput.includes(`${eventName}={stopSettingsValueEvent}`)) {
      throw new Error(`Expected Settings value editors to stop ${eventName} from toggling the row`)
    }
  }
  if (
    !settingsEntryInput.includes('UI_RESPONSIVE_SETTINGS_VALUE_WRAPPER_CLASSNAME')
    || !responsiveElementClasses.includes('justify-start sm:justify-end')
  ) {
    throw new Error('Expected Settings value editors to share responsive value alignment')
  }
  if (
    !settingsEntryRowValue.includes("from '@/features/panels/ui/canvasKeyTypeValueValueCell'")
    || !settingsEntryRowValue.includes('KTV_VALUE_ROW_SCROLL_CLASS_NAME')
    || !settingsEntryRowValue.includes('KTV_VALUE_ROW_INPUT_SHELL_CLASS_NAME')
    || settingsEntryRowValue.includes("from '@/features/panels/ui/KeyTypeValueRow'")
    || settingsEntryRowValue.includes("from '@/features/toolbar/ui/toolbarStyles'")
    || settingsEntryRowValue.includes('UI_RESPONSIVE_COMPACT_PANEL_FLEX_INPUT_CLASSNAME')
    || settingsEntryRowValue.includes('space-y-1')
  ) {
    throw new Error('Expected Settings value assist controls to import the dedicated canvas value-row utilities directly')
  }
  if (
    !settingsSpecialValueNode.includes("from '@/features/panels/ui/canvasKeyTypeValueValueCell'")
    || !settingsSpecialValueNode.includes('KTV_VALUE_ROW_SCROLL_SPACIOUS_CLASS_NAME')
    || !settingsSpecialValueNode.includes('KTV_VALUE_ROW_INPUT_SHELL_CLASS_NAME')
    || !settingsSpecialValueNode.includes('KTV_VALUE_ROW_STATUS_SHELL_CLASS_NAME')
    || settingsSpecialValueNode.includes("from '@/features/panels/ui/KeyTypeValueRow'")
    || settingsSpecialValueNode.includes("from '@/features/toolbar/ui/toolbarStyles'")
    || settingsSpecialValueNode.includes('UI_RESPONSIVE_COMPACT_PANEL_FLEX_INPUT_CLASSNAME')
  ) {
    throw new Error('Expected special Settings value rows to import the dedicated canvas value-row utilities directly')
  }
  for (const [fileName, source] of [
    ['RenderSettingsSection.impl.tsx', renderSettingsSection],
    ['RendererPaletteSettings.tsx', rendererPaletteSettings],
    ['RendererHoverSettings.tsx', rendererHoverSettings],
    ['ThreeViewLayoutSection.impl.tsx', threeViewLayoutSection],
  ] as const) {
    const usesSharedKtvRowOwner =
      source.includes('KeyTypeValueRow') || source.includes('KeyTypeValueStaticRow')
    if (!usesSharedKtvRowOwner || (fileName === 'ThreeViewLayoutSection.impl.tsx' && !source.includes('THREE_VIEW_FIELD_GRID_CLASS_NAME')) || (fileName === 'RenderSettingsSection.impl.tsx' && !source.includes('RENDER_SETTINGS_PRESETS_GRID_CLASS_NAME')) || source.includes('grid grid-cols-2 gap-3')) {
      throw new Error(`Expected FloatingPanel KTV surface ${fileName} to inherit shared KTV rows and responsive grid owners`)
    }
  }
  if (
    !threeViewLayoutSection.includes("from '@/features/panels/ui/PanelKeyTypeRangeValueRow'") ||
    !threeViewLayoutSection.includes("from '@/features/panels/ui/PanelKeyTypeCheckboxValueRow'") ||
    !threeViewLayoutSection.includes('PanelKeyTypeRangeValueRow') ||
    !threeViewLayoutSection.includes('PanelKeyTypeCheckboxValueRow')
  ) {
    throw new Error('Expected ThreeViewLayoutSection.impl.tsx to consume the shared panel KTV range and checkbox row owners')
  }
  if (
    !threeViewBackgroundFogSection.includes("from '@/features/panels/ui/PanelKeyTypeColorTextValueRow'") ||
    !threeViewBackgroundFogSection.includes('PanelKeyTypeColorTextValueRow') ||
    !threeViewStarfieldSection.includes("from '@/features/panels/ui/PanelKeyTypeColorTextValueRow'") ||
    !threeViewStarfieldSection.includes('PanelKeyTypeColorTextValueRow')
  ) {
    throw new Error('Expected ThreeView background fog and starfield sections to consume the shared specialized panel color/text KTV row owner')
  }
  for (const [fileName, source] of [
    ['RenderSettingsSection.impl.tsx', renderSettingsSection],
    ['RendererPaletteSettings.tsx', rendererPaletteSettings],
  ] as const) {
    if (!source.includes('RightAlignedValueCell')) {
      throw new Error(`Expected FloatingPanel editable KTV surface ${fileName} to use the shared right-aligned Value row`)
    }
  }

  if (!settingsUi.includes('normalizePanelValueInputClassName') || !settingsUi.includes('uiPanelKeyValueInputLeftClass')) {
    throw new Error('Expected settings inputs to derive visual variants from uiPanelKeyValueInputClass')
  }
  if (
    !settingsUi.includes("if (key === 'integrationConfigsJson')")
    || settingsUi.includes("key === 'chatSystemPrompt' || key === 'integrationConfigsJson'")
    || settingsUi.includes("key === 'integrationConfigsJson' ? 6 : 4")
  ) {
    throw new Error('Expected integrationConfigsJson to render as a compact one-row Value input, not a multiline editor')
  }
  if (
    !['resolveChatModelIdForProvider', 'inferChatProviderFromModelId', 'resolveChatModelSelectionValues', 'args.values.chatProvider', 'readOnly'].every(snippet => settingsChatProviderInput.includes(snippet))
    || ['resolveChatProviderSelectionValues', '[selected, ...args.options]', '[resolved, ...args.options]'].some(snippet => settingsChatProviderInput.includes(snippet))
    || !settingsChatProviderInput.includes("from '@/lib/ui/panelFormControls'")
    || !settingsChatProviderInput.includes('PanelTextInput')
    || !settingsChatProviderInput.includes('PanelSelect')
  ) {
    throw new Error('Expected chatProvider to derive from chatModel while chatModel dropdowns normalize stale provider models without duplicate legacy options')
  }
  if (settingsUi.includes('className={`w-full h-6 px-2 text-sm border') || settingsUi.includes('className={`w-full min-w-0 max-w-full h-6 px-2 text-sm border')) {
    throw new Error('Expected settings input branches to avoid local KTV input class redefinitions')
  }

  const hubModes: Array<[string, string]> = [
    ['IntegrationsHubView.tsx', 'integrations'],
    ['McpHubView.tsx', 'mcp'],
    ['MapsHubView.tsx', 'maps'],
    ['CommerceHubView.tsx', 'payments'],
  ]
  for (const [fileName, mode] of hubModes) {
    const text = readUtf8(path.resolve(root, 'src', 'features', 'panels', 'views', fileName))
    if (!text.includes('SettingsView') || !text.includes(`mode="${mode}"`)) {
      throw new Error(`Expected ${fileName} to inherit KTV rows through SettingsView mode=${mode}`)
    }
  }

  if (
    !settingsViewConstants.includes('SETTINGS_VIEW_MODE_CONFIG_BY_MODE')
    || !settingsViewConstants.includes('SETTINGS_MCP_KTV_HEADER_LABELS')
    || !settingsViewConstants.includes('mcp: { ktvHeaderLabels: SETTINGS_MCP_KTV_HEADER_LABELS }')
  ) {
    throw new Error('Expected SettingsView mode config to own the MCP KTV header labels instead of a renderer-local Value label')
  }
  const forbiddenMcpHeaderLabelSnippets = [
    ['valueLabel: ', "'Config'"].join(''),
    ['valueLabel: ', '"Config"'].join(''),
  ]
  if (forbiddenMcpHeaderLabelSnippets.some(snippet => settingsViewConstants.includes(snippet))) {
    throw new Error('Expected MCP KTV header labels to preserve the shared KeyTypeValue vocabulary; MCP rows may configure Value cells, not rename Value to Config')
  }
  if (
    !settingsView.includes('resolveSettingsKtvHeaderLabels(mode)')
    || !settingsView.includes('valueLabel={ktvHeaderLabels.valueLabel}')
  ) {
    throw new Error('Expected SettingsView to render KTV header labels from resolved mode config')
  }
  if (
    !settingsViewRuntime.includes("import type { SettingsViewMode } from './settingsView.constants'")
    || settingsViewRuntime.includes("mode?: 'all' | 'integrations' | 'payments' | 'maps' | 'mcp'")
  ) {
    throw new Error('Expected useSettingsView to reuse the shared SettingsViewMode type without duplicating mode literals')
  }
  if (
    !sharedOpenAiMcpSsot.includes('OPENAI_MCP_DOCS_URL')
    || !sharedPackageJson.includes('"./openai/openaiMcpSsot"')
    || !settingsRegistry.includes('...openAiMcpSettingsRegistry')
    || !settingsRegistryOpenAiMcp.includes('openai.mcp.serverUrl')
    || !settingsMcpDocEntries.includes('...OPENAI_MCP_DOC_ENTRIES')
    || !settingsMcpDocEntries.includes('buildOpenAiMcpResponsesToolConfigJson(values)')
    || !settingsViewHelpers.includes('OPENAI_MCP_DOC_AREA')
    || !settingsViewConstants.includes('[OPENAI_MCP_DOC_AREA]')
    || !openAiMcpApiDocs.includes('valueKey: `${OPENAI_MCP_KEY_PREFIX}serverUrl`')
    || !openAiMcpApiDocs.includes('buildOpenAiMcpResponsesRequestJson')
  ) {
    throw new Error('Expected OpenAI MCP rows to use shared SSOT, writable settings registry, and SettingsView MCP aggregation')
  }
}
