import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

function assertRenderStateUsesScopedGraphAuthority(renderStateText: string, message: string) {
  if (
    !renderStateText.includes('const baseForRender = args.storyboardWidgetBaseGraphData || args.baseGraphData') ||
    !renderStateText.includes('shouldPreferScopedGraphDataAuthority({') ||
    !renderStateText.includes('candidateGraphData: draftGraphData') ||
    !renderStateText.includes('authorityGraphData: baseForRender') ||
    !renderStateText.includes(': (draftGraphData || baseForRender)')
  ) {
    throw new Error(message)
  }
}

export function testStoryboardWidgetRenderGraphUsesBaseGraphWhenNotEditableForZoomMinimapAlignment() {
  const runtimePath = resolve(process.cwd(), 'src', 'components', 'StoryboardWidgetCanvas.runtime.tsx')
  const renderStatePath = resolve(process.cwd(), 'src', 'components', 'StoryboardWidgetCanvas', 'runtime', 'useStoryboardWidgetRenderState.ts')
  const overlaySurfacePath = resolve(process.cwd(), 'src', 'components', 'StoryboardWidgetCanvas', 'runtime', 'useStoryboardWidgetOverlaySurface.tsx')
  const overlaySurfaceElementsPath = resolve(process.cwd(), 'src', 'components', 'StoryboardWidgetCanvas', 'runtime', 'storyboardWidgetOverlaySurfaceElements.tsx')
  const runtimeText = readFileSync(runtimePath, 'utf8')
  const renderStateText = readFileSync(renderStatePath, 'utf8')
  const overlaySurfaceText = readFileSync(overlaySurfacePath, 'utf8')
  const overlaySurfaceElementsText = readFileSync(overlaySurfaceElementsPath, 'utf8')
  if (!runtimeText.includes('const storyboardWidgetViewActive = editorRuntimeActive')) {
    throw new Error('expected Storyboard Widget view activation to stay renderer-scoped and independent from document modes')
  }
  assertRenderStateUsesScopedGraphAuthority(
    renderStateText,
    'expected StoryboardWidget render graph source to use draft graph in active Storyboard Widget view unless shared scoped authority proves base graph ownership',
  )
  if (!renderStateText.includes('graphData: graphDataForRender')) throw new Error('expected StoryboardWidget render graph derivation to use unified graphDataForRender source')
  if (!overlaySurfaceText.includes('if (!storyboardWidgetViewActive) {') || !overlaySurfaceText.includes('return []')) {
    throw new Error('expected widget overlays to remain view-scoped instead of edit-lock scoped to avoid View Lock-induced renderer mutation')
  }
  if (!overlaySurfaceElementsText.includes('visible={args.overlayVisibilityActive}') || !overlaySurfaceElementsText.includes('active={args.canEdit}')) {
    throw new Error('expected widget overlays to stay visible in Storyboard Widget view while becoming read-only under View Lock')
  }
  if (runtimeText.includes('frontmatterDocumentModeActive') || renderStateText.includes('frontmatterDocumentModeActive')) {
    throw new Error('expected Storyboard Widget render graph source to avoid document-mode-only overlay gating')
  }
}

export function testFrontmatterFlowLandingKeepsWidgetsVisibleAgainstSiblingRendererInterference() {
  const runtimePath = resolve(process.cwd(), 'src', 'components', 'StoryboardWidgetCanvas.runtime.tsx')
  const renderStatePath = resolve(process.cwd(), 'src', 'components', 'StoryboardWidgetCanvas', 'runtime', 'useStoryboardWidgetRenderState.ts')
  const overlaySurfacePath = resolve(process.cwd(), 'src', 'components', 'StoryboardWidgetCanvas', 'runtime', 'useStoryboardWidgetOverlaySurface.tsx')
  const overlaySurfaceElementsPath = resolve(process.cwd(), 'src', 'components', 'StoryboardWidgetCanvas', 'runtime', 'storyboardWidgetOverlaySurfaceElements.tsx')
  const selectionBookkeepingPath = resolve(process.cwd(), 'src', 'components', 'StoryboardWidgetCanvas', 'runtime', 'useStoryboardWidgetSelectionBookkeeping.ts')
  const flowCanvasPath = resolve(process.cwd(), 'src', 'components', 'FlowCanvas.tsx')
  const frontmatterFlowLandingText = [
    'kgCanvas2dRenderer: "storyboard"',
    'kgDocumentSemanticMode: "document"',
    'kgFrontmatterModeEnabled: true',
  ].join('\n')
  const runtimeText = readFileSync(runtimePath, 'utf8')
  const renderStateText = readFileSync(renderStatePath, 'utf8')
  const overlaySurfaceText = readFileSync(overlaySurfacePath, 'utf8')
  const overlaySurfaceElementsText = readFileSync(overlaySurfaceElementsPath, 'utf8')
  const selectionBookkeepingText = readFileSync(selectionBookkeepingPath, 'utf8')
  const flowCanvasText = readFileSync(flowCanvasPath, 'utf8')

  if (!frontmatterFlowLandingText.includes('kgCanvas2dRenderer: "storyboard"')) {
    throw new Error('expected generic frontmatter-flow landing fixture to keep Storyboard as the canonical frontmatter-selected 2D renderer')
  }
  if (!frontmatterFlowLandingText.includes('kgDocumentSemanticMode: "document"') || !frontmatterFlowLandingText.includes('kgFrontmatterModeEnabled: true')) {
    throw new Error('expected generic frontmatter-flow landing fixture to keep document frontmatter mode enabled for widget-visible landing')
  }
  if (!runtimeText.includes('const storyboardWidgetViewActive = editorRuntimeActive')) {
    throw new Error('expected frontmatter-flow Storyboard Widget view visibility to stay bound to the active Storyboard renderer, not sibling renderer mounts')
  }
  assertRenderStateUsesScopedGraphAuthority(
    renderStateText,
    'expected frontmatter-flow Storyboard Widget render state to keep draft graph visibility scoped through the shared graph authority helper',
  )
  if (!overlaySurfaceText.includes('if (!storyboardWidgetViewActive) {') || !overlaySurfaceText.includes('return []')) {
    throw new Error('expected frontmatter-flow widget overlays to stay view-scoped so inactive Flow Canvas/Flowchart mounts cannot keep or blank widget overlays')
  }
  if (!overlaySurfaceElementsText.includes('visible={args.overlayVisibilityActive}') || !overlaySurfaceElementsText.includes('active={args.canEdit}')) {
    throw new Error('expected frontmatter-flow widget overlays to remain visible in Storyboard Widget view while decoupling visibility from editability')
  }
  if (!selectionBookkeepingText.includes('if (!editorRuntimeActive || !storyboardWidgetViewActive || !draftGraphData) return')) {
    throw new Error('expected frontmatter-flow widget bookkeeping to avoid pruning or mutating visible widget ids from inactive renderer paths')
  }
  if (!flowCanvasText.includes("if (canvas2dRenderer === 'storyboard') {")) {
    throw new Error('expected Flow Canvas draw args to expose widget overlay state only for the active Storyboard renderer')
  }
  if (
    !flowCanvasText.includes('drawArgsRef.current.storyboardWidgetOpenNodeIds = undefined')
    || !flowCanvasText.includes('drawArgsRef.current.storyboardWidgetPinnedByNodeId = undefined')
    || !flowCanvasText.includes('drawArgsRef.current.storyboardWidgetWorldPosByNodeId = undefined')
  ) {
    throw new Error('expected inactive Flow Canvas/Flowchart renderer paths to clear Storyboard Widget draw-state instead of reusing stale visibility state')
  }
  if (flowCanvasText.includes('resolveFlowCanvasNativeRenderPolicy') || flowCanvasText.includes('drawArgsRef.current.renderNodes') || flowCanvasText.includes('drawArgsRef.current.renderEdges')) {
    throw new Error('expected Storyboard renderer isolation to avoid suppressing FlowCanvas native primitives')
  }
}

export function testStoryboardWidgetRuntimeUsesActiveSourceGraphAuthority() {
  const runtimeStoreStatePath = resolve(process.cwd(), 'src', 'components', 'StoryboardWidgetCanvas', 'runtime', 'useStoryboardWidgetRuntimeStoreState.ts')
  const activeGraphDataPath = resolve(process.cwd(), 'src', 'hooks', 'active-graph-data', 'useActiveGraphData.impl.ts')
  const runtimeStoreStateText = readFileSync(runtimeStoreStatePath, 'utf8')
  const activeGraphDataText = readFileSync(activeGraphDataPath, 'utf8')

  if (!runtimeStoreStateText.includes("import { useActiveGraphData } from '@/hooks/useActiveGraphData'")) {
    throw new Error('expected Storyboard Widget runtime state to reuse shared active graph data authority')
  }
  if (!runtimeStoreStateText.includes('const activeBaseGraphData = useActiveGraphData(true)')) {
    throw new Error('expected Storyboard Widget runtime state to derive selected-source graph data before reading raw store graph content')
  }
  if (!runtimeStoreStateText.includes('rawBaseGraphData: s.graphData')) {
    throw new Error('expected Storyboard Widget runtime state to keep raw store graph only as a named fallback')
  }
  if (!runtimeStoreStateText.includes('const baseGraphData = activeBaseGraphData || state.rawBaseGraphData')) {
    throw new Error('expected Storyboard Widget runtime state to prefer selected-source active graph over stale store graph content')
  }
  if (!runtimeStoreStateText.includes('buildGraphDocumentMetaKey(baseGraphData)')) {
    throw new Error('expected Storyboard Widget pin scope to follow the active selected-source graph authority')
  }
  if (runtimeStoreStateText.includes('baseGraphData: s.graphData')) {
    throw new Error('expected Storyboard Widget runtime state to avoid exposing raw store graph as render authority')
  }
  if (!activeGraphDataText.includes("if (canvas2dRenderer === 'storyboard') {")
    || !activeGraphDataText.includes('return workspaceStrybldrStoryboardGraphData || workspaceFrontmatterFlowGraphData || workspaceJsonGraphData')) {
    throw new Error('expected Storyboard Widget active graph selection to preserve valid Strybldr card-level graph authority')
  }
  if (!activeGraphDataText.includes('if (!frontmatterOnlyPolicyActive) {')
    || !activeGraphDataText.includes('if (workspaceFrontmatterFlowGraphData) return workspaceFrontmatterFlowGraphData')
    || !activeGraphDataText.includes('if (isFrontmatterFlowGraph(activeMarkdownBaseGraph)) return activeMarkdownBaseGraph')
    || !activeGraphDataText.includes('return buildPendingActiveMarkdownGraph({ markdownName })')) {
    throw new Error('expected Storyboard Widget/frontmatter-only active graph authority to use only the frontmatter flow graph or pending markdown graph')
  }
  const frontmatterBranch = activeGraphDataText.slice(
    activeGraphDataText.indexOf('if (!frontmatterOnlyPolicyActive) {'),
    activeGraphDataText.indexOf('const hasStructuredWorkspaceGraph = frontmatterOnlyPolicyActive'),
  )
  if (!frontmatterBranch.includes('workspaceFrontmatterMermaidGraphData')
    || !frontmatterBranch.includes('workspaceAgenticOsSemanticGraphData')
    || frontmatterBranch.indexOf('if (workspaceFrontmatterFlowGraphData) return workspaceFrontmatterFlowGraphData') > frontmatterBranch.indexOf('return buildPendingActiveMarkdownGraph({ markdownName })')) {
    throw new Error('expected Storyboard Widget/frontmatter-only graph branch to avoid Mermaid/GitGraph or AGENTIC_OS semantic fallback before pending graph')
  }
}
