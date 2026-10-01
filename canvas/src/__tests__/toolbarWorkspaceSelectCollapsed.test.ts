import fs from 'node:fs'
import path from 'node:path'

export async function testToolbarAlwaysExpandedWithoutCollapseControls() {
  const filePath = path.resolve(process.cwd(), 'src', 'components', 'Toolbar.tsx')
  const text = fs.readFileSync(filePath, { encoding: 'utf8' })
  const launcherText = fs.readFileSync(path.resolve(process.cwd(), 'src', 'features', 'toolbar', 'ToolbarMenuLauncher.tsx'), { encoding: 'utf8' })

  if (text.includes('title="Expand toolbar"') || text.includes('title="Collapse toolbar"')) {
    throw new Error('expected Toolbar to remove Expand/Collapse toolbar controls')
  }
  if (text.includes('{toolbarCollapsed ? (')) {
    throw new Error('expected Toolbar to remove toolbarCollapsed branch')
  }
  if (!text.includes('<ToolbarMenuLauncherLazy')) {
    throw new Error('expected ToolbarMenuLauncher to stay visible in toolbar')
  }
  if (!text.includes('<EditorWorkspaceSelect')) {
    throw new Error('expected EditorWorkspaceSelect to stay visible in toolbar')
  }
  if (!text.includes('<Canvas2dRendererSelect')) {
    throw new Error('expected Canvas2dRendererSelect to stay visible in toolbar')
  }
  if (!text.includes('const canRunAll = supportsToolbarRunAll(canvas2dRenderer)')) {
    throw new Error('expected Toolbar Run all readiness to use the shared renderer capability helper')
  }
  if (!text.includes('title={canRunAll ? \'Run all\'')) {
    throw new Error('expected Run all button to be rendered on Toolbar')
  }
  if (text.includes('getToolbarRunAllFloatingPanelTab') || text.includes('runAllFloatingPanelTab')) {
    throw new Error('expected Toolbar Run all not to route through a floating-panel tab helper')
  }
  if (!text.includes('createStrybldrLocalVideoArtifactFromGraphData') || !text.includes('isStrybldrStoryboardGraphData(toolbarRunAllGraphData')) {
    throw new Error('expected Toolbar Run all to reserve the headless video handoff for graph-identified Strybldr Storyboards')
  }
  if (!launcherText.includes('window.addEventListener(FLOATING_PANEL_OPEN_EVENT, handleFloatingPanelOpenEvent)')) {
    throw new Error('expected Toolbar launcher to wake renderer-owned floating panels from the shared open event')
  }
  const toolbarMenuText = fs.readFileSync(path.resolve(process.cwd(), 'src', 'lib', 'toolbar', 'ToolbarToolMenu.impl.tsx'), { encoding: 'utf8' })
  if (toolbarMenuText.includes('requestedFloatingPanelRunAllSeq') || toolbarMenuText.includes('runAllRequestSeq=')) {
    throw new Error('expected Toolbar floating panel not to carry stale mounted Run all request props')
  }
  if (!text.includes('emitWorkflowRunAll({ source: \'toolbar\' })')) {
    throw new Error('expected Run all button to emit the toolbar workflow-run event')
  }
  if (!text.includes('if (shouldRouteToStrybldrRunAll) {') || !text.includes('primeStoryboardWidgetRunAllLayoutLockFromToolbar()\n          emitToolbarRunAll()')) {
    throw new Error('expected multi-Widget Storyboards to dispatch through the shared workflow runner instead of the Strybldr handoff')
  }
  const { testViewerSettingsRemainReachableFromHiddenCanvasToolbar } = await import('./viewerDataViewControls.test')
  await testViewerSettingsRemainReachableFromHiddenCanvasToolbar()
}
