import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8')

export function testDesignEditorUsesOneFloatingPanelSurface() {
  const tabs = read('src/features/panels/mainPanelTabs.ts')
  const mainPanel = read('src/features/panels/MainPanel.tsx')
  const floatingPanel = read('src/features/design/DesignFloatingPanelView.tsx')
  const toolbar = read('src/lib/toolbar/ToolbarToolMenu.impl.tsx')
  const toolbarContext = read('src/components/toolbar/useCanvasToolbarContext.ts')

  if (tabs.includes("key: 'design'") || mainPanel.includes('DesignEditorMainPanelViewLazy')) {
    throw new Error('expected the duplicate MainPanel Design surface to be absent')
  }
  if (!mainPanel.includes('MAIN_PANEL_TAB_TYPE_ICON_BY_KEY') || !mainPanel.includes("'commerce', 'settings'")) {
    throw new Error('expected MainPanel Settings to remain available')
  }
  if (!toolbar.includes("floatingPanelView === 'design' && <DesignFloatingPanelView") || !floatingPanel.includes('DesignEditorOverviewPanel')) {
    throw new Error('expected FloatingPanel Design to own the editor controls')
  }
  if (!toolbarContext.includes("detailTab === 'design'") || !toolbarContext.includes('activateDesignEditorSurface()')) {
    throw new Error('expected legacy Design panel intent to open the FloatingPanel editor')
  }
}

export function testDesignEditorOverviewIsSharedByDesignSurfaces() {
  const floatingPanel = read('src/features/design/DesignFloatingPanelView.tsx')
  const overview = read('src/features/design/DesignEditorOverviewPanel.tsx')
  const helper = read('src/features/design/designEditorLaunchState.ts')
  const metricGridLiteral = 'grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-4'

  if (!floatingPanel.includes('DesignEditorOverviewPanel') || !floatingPanel.includes("id: 'overview'")) {
    throw new Error('expected Design surfaces to expose the shared editor overview tab')
  }
  if (!overview.includes(`DESIGN_EDITOR_OVERVIEW_METRIC_GRID_CLASS_NAME = '${metricGridLiteral}'`)) {
    throw new Error('expected Design overview metric grids to use one shared mobile-first responsive owner')
  }
  if (overview.includes('grid grid-cols-2 gap-2 md:grid-cols-4')) {
    throw new Error('expected Design overview metric grids to stay free of fixed mobile two-column literals')
  }
  for (const snippet of ['summarizeDesignTokens', 'dispatchRuntimeFitToViewSoon', 'activateDesignEditorSurface']) {
    if (!overview.includes(snippet)) throw new Error(`expected Design overview to reuse shared editor capability: ${snippet}`)
  }
  for (const snippet of ['setCanvasRenderMode', "setCanvas2dRenderer('design')", 'setFloatingPanelView']) {
    if (!helper.includes(snippet)) throw new Error(`expected Design launch helper to centralize Design editor state: ${snippet}`)
  }
}

export function testImportUrlDesignSelectionActivatesSharedDesignSurface() {
  const launcher = read('src/lib/toolbar/LaunchDropdown.impl.tsx')
  if (!launcher.includes('<LaunchDropdownImportUrlItem')) throw new Error('expected launcher to compose the shared URL import owner')
  const importUrlItem = read('src/lib/toolbar/LaunchDropdownImportUrlItem.tsx')
  const importActions = read('src/features/markdown-workspace/useWorkspaceFileActions/importActions.ts')
  const fallbacks = read('src/features/toolbar/launchDropdownFallbacks.ts')
  const deerflowAction = read('src/features/markdown-workspace/useWorkspaceFileActions/deerflowUrlImportAction.ts')
  const deerflowImport = read('src/features/markdown-workspace/workspaceImport/deerflowUrlImport.ts')
  const rendererSelect = read('src/lib/toolbar/ImportUrlRendererSelect.tsx')

  if (!rendererSelect.includes("DESIGN_IMPORT_URL_RENDERER_SELECTION") || rendererSelect.includes("isWorkspaceUrlImportCanvasRendererId(value) ?")) {
    throw new Error('expected Import URL renderer selection to expose Design explicitly without legacy bare-renderer remapping')
  }
  for (const [label, text] of [
    ['LaunchDropdown URL item', importUrlItem],
    ['workspace import actions', importActions],
    ['launch fallback', fallbacks],
    ['DeerFlow action', deerflowAction],
  ] as const) {
    if (!text.includes('activateDesignEditorSurface')) {
      throw new Error(`expected ${label} to activate the shared Design editor state for Design URL imports`)
    }
  }
  if (!deerflowImport.includes('getWorkspaceUrlImportCanvasPreset') || !deerflowImport.includes('buildWebpageWorkspaceEntryTextFromUpstreamMarkdown')) {
    throw new Error('expected DeerFlow URL import to carry the same renderer preset frontmatter as regular Import URL')
  }
}
