import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

export function testStoryboardWidgetOverlayPrefersGraphKeyedWidgetState() {
  const editorPath = resolve(process.cwd(), 'src', 'components', 'StoryboardWidget', 'WidgetEditorInner.tsx')
  const editorStatePath = resolve(process.cwd(), 'src', 'components', 'StoryboardWidget', 'useWidgetEditorOverlayUiState.ts')
  const portalPath = resolve(process.cwd(), 'src', 'components', 'StoryboardWidget', 'FlowWidgetOverlayPortal.tsx')
  const runtimePath = resolve(process.cwd(), 'src', 'components', 'StoryboardWidget', 'useWidgetPlacementRuntime.ts')
  const runtimeStatePath = resolve(process.cwd(), 'src', 'components', 'StoryboardWidget', 'widgetPlacementRuntimeState.ts')
  const runtimeProjectionPath = resolve(process.cwd(), 'src', 'components', 'StoryboardWidget', 'widgetPlacementRuntimeProjection.ts')
  const overlaySurfaceElementsPath = resolve(process.cwd(), 'src', 'components', 'StoryboardWidgetCanvas', 'runtime', 'storyboardWidgetOverlaySurfaceElements.tsx')
  const overlaySurfaceRuntimePath = resolve(process.cwd(), 'src', 'components', 'StoryboardWidgetCanvas', 'runtime', 'useStoryboardWidgetOverlaySurface.tsx')
  const runtimeScenePath = resolve(process.cwd(), 'src', 'components', 'StoryboardWidgetCanvas', 'runtime', 'useStoryboardWidgetRuntimeScene.ts')
  const runtimeWidgetStatePath = resolve(process.cwd(), 'src', 'components', 'StoryboardWidgetCanvas', 'runtime', 'storyboardWidgetRuntimeWidgetState.ts')
  const widgetScopePath = resolve(process.cwd(), 'src', 'lib', 'storyboardWidget', 'widgetStateScope.ts')
  const editorText = `${readFileSync(editorPath, 'utf8')}\n${readFileSync(editorStatePath, 'utf8')}`
  const portalText = readFileSync(portalPath, 'utf8')
  const runtimeText = `${readFileSync(runtimePath, 'utf8')}\n${readFileSync(runtimeStatePath, 'utf8')}\n${readFileSync(runtimeProjectionPath, 'utf8')}`
  const overlaySurfaceText = readFileSync(overlaySurfaceElementsPath, 'utf8')
  const overlaySurfaceRuntimeText = readFileSync(overlaySurfaceRuntimePath, 'utf8')
  const runtimeSceneText = readFileSync(runtimeScenePath, 'utf8')
  const runtimeWidgetStateText = readFileSync(runtimeWidgetStatePath, 'utf8')
  const widgetScopeText = readFileSync(widgetScopePath, 'utf8')

  if (!overlaySurfaceText.includes('const graphMetaKey = buildGraphDocumentMetaKey(')
    || !overlaySurfaceText.includes('useStableFrontmatterGraphAuthority')
    || !overlaySurfaceText.includes('args.lastStableRenderGraphDataOverride')
    || !overlaySurfaceText.includes(': args.renderGraphDataOverride')) {
    throw new Error('expected Storyboard Widget overlay surface to pass the active frontmatter graph authority key into widget overlays')
  }
  if (!overlaySurfaceText.includes('if (useStableFrontmatterGraphAuthority) {\n      const stableCanonicalMatch = resolveGraphNodeByCanonicalId(args.lastStableRenderGraphDataOverride, id)')) {
    throw new Error('expected removed current-graph overlays not to be resurrected from stale stable graph authority')
  }
  if (!overlaySurfaceRuntimeText.includes("import { resolveScopedFlowWidgetNodeMap } from '@/lib/storyboardWidget/widgetStateScope'")) {
    throw new Error('expected Storyboard Widget overlay surface to reuse the shared scoped widget-state helper for auto-pin seeding')
  }
  if (!overlaySurfaceRuntimeText.includes("import { buildGraphDocumentMetaKey } from '@/lib/graph/graphMetaKey'")) {
    throw new Error('expected Storyboard Widget overlay surface to derive the active render graph key before auto-pin seeding')
  }
  if (!overlaySurfaceText.includes('graphMetaKey={graphMetaKey}')) {
    throw new Error('expected Storyboard Widget overlay surface to thread the active rendered graph key into widget overlay props')
  }
  if (!overlaySurfaceText.includes('const overlayInstanceKey = [')) {
    throw new Error('expected Storyboard Widget overlay surface to derive one remount key for widget overlays from surface and graph identity')
  }
  if (!overlaySurfaceText.includes("String(args.storyboardWidgetSurfaceId || '').trim() || 'surface'")) {
    throw new Error('expected Storyboard Widget overlay remount key to include surface identity so stale portal instances cannot survive across surfaces')
  }
  if (!overlaySurfaceText.includes("const overlayGraphInstanceKey = graphMetaKind === 'frontmatter-flow'")
    || !overlaySurfaceText.includes("String(graphMetaKey || '').trim() || String(args.renderGraphSemanticKey || '').trim() || 'graph'")
    || !overlaySurfaceText.includes("String(args.renderGraphSemanticKey || '').trim() || String(graphMetaKey || '').trim() || 'graph'")) {
    throw new Error('expected Storyboard Widget overlay remount key to prefer stable graph meta authority for frontmatter handoff before falling back to semantic render identity')
  }
  if (!overlaySurfaceText.includes('key={overlayInstanceKey}')) {
    throw new Error('expected Storyboard Widget overlays to remount when surface or graph identity changes')
  }
  if (!overlaySurfaceRuntimeText.includes('const renderGraphMetaKey = React.useMemo(')) {
    throw new Error('expected Storyboard Widget overlay surface to memoize one active render graph key for scoped auto-pin seeding')
  }
  if (!overlaySurfaceRuntimeText.includes('const pinnedById = resolveScopedFlowWidgetNodeMap({')) {
    throw new Error('expected Storyboard Widget overlay surface auto-pin seeding to read pinned state from the active graph scope')
  }
  if (overlaySurfaceRuntimeText.includes('const pinnedById = st.flowWidgetPinnedByNodeId || {}')) {
    throw new Error('expected Storyboard Widget overlay surface auto-pin seeding to forbid direct global pinned-state fallback')
  }
  if (!widgetScopeText.includes('export function resolveFlowWidgetStateGraphKey')) {
    throw new Error('expected Storyboard Widget overlay state scope to centralize render-graph-key resolution in a shared helper')
  }
  if (!widgetScopeText.includes('if (graphKey) return args.keyedByGraphMetaKey?.[graphKey] || (EMPTY_SCOPED_FLOW_WIDGET_NODE_MAP as Record<string, T>)')) {
    throw new Error('expected Storyboard Widget state scope to read keyed widget state exclusively whenever an active graph key exists')
  }
  if (!editorText.includes('return readScopedFlowWidgetNodeValue({')) {
    throw new Error('expected Storyboard Widget overlay readers to resolve floating screen state through the shared scoped widget-state helper')
  }
  if (!portalText.includes('return typeof document === \'undefined\' ? overlayElement : createPortal(overlayElement, document.body)')) {
    throw new Error('expected Storyboard Widget overlays to keep the global body portal contract so fixed-position overlays stay in viewport coordinates')
  }
  if (!editorText.includes('keyedByGraphMetaKey: state.flowWidgetPinnedByNodeIdByGraphMetaKey')) {
    throw new Error('expected Storyboard Widget pin reads to route through graph-keyed state via the shared scoped helper')
  }
  if (editorText.includes("?? s.flowWidgetPosByNodeId?.[nodeId]")) {
    throw new Error('expected Storyboard Widget overlay readers to forbid global screen-position fallback when an active render-graph key is available')
  }
  if (editorText.includes("?? state.flowWidgetPinnedByNodeId?.[id]")) {
    throw new Error('expected Storyboard Widget pin reads to forbid global pinned-state fallback when an active render-graph key is available')
  }
  if (!runtimeText.includes('const graphKey = resolveFlowWidgetStateGraphKey({')) {
    throw new Error('expected Storyboard Widget placement runtime to centralize render-graph-key resolution before writing scoped widget state')
  }
  if (!runtimeText.includes('const prevWorld = resolveScopedFlowWidgetNodeMap({')) {
    throw new Error('expected Storyboard Widget placement runtime to build keyed world-position writes from the active scoped state, not from global caches')
  }
  if (!runtimeText.includes('const currentStoredWorld = readStoredWidgetWorldPos()')) {
    throw new Error('expected Storyboard Widget placement loop to resolve current graph-keyed world positions at render time, not only through subscription warmup')
  }
  if (!runtimeText.includes('return readScopedFlowWidgetNodeValue({')) {
    throw new Error('expected Storyboard Widget placement runtime to resolve stored world positions through the shared scoped widget-state helper')
  }
  if (runtimeText.includes("?? state.flowWidgetWorldPosByNodeId?.[nodeId]")) {
    throw new Error('expected Storyboard Widget placement runtime to forbid global world-position fallback when an active render-graph key is available')
  }
  if (!runtimeText.includes('const currentStoredWorldForPlacement = floatingUsesScreenAuthority ? null : currentStoredWorld')
    || !runtimeText.includes('const storedWorld = currentStoredWorldForPlacement || (floatingUsesScreenAuthority ? null : widgetWorldPosRef.current)')) {
    throw new Error('expected Storyboard Widget placement loop to keep graph-keyed world SSOT out of floating screen-authority placement reads')
  }
  if (!runtimeSceneText.includes('const graphKey = buildGraphDocumentMetaKey(graphDataForSeeding)')) {
    throw new Error('expected Storyboard Widget runtime scene workspace-blocked widget seeding to write graph-keyed world positions under the active render graph key before falling back to store graph state')
  }
  if (!runtimeSceneText.includes('useStoryboardWidgetStateDependencyCounts')) {
    throw new Error('expected Storyboard Widget runtime scene to delegate hot-path widget dependency counts to the shared runtime helper')
  }
  if (!runtimeWidgetStateText.includes("import { useShallow } from 'zustand/react/shallow'")) {
    throw new Error('expected Storyboard Widget runtime scene to select widget state through a shallow store selector')
  }
  if (!runtimeWidgetStateText.includes('const state = useGraphStore(useShallow(s => ({')) {
    throw new Error('expected Storyboard Widget runtime scene to gather widget state refs without rebuilding graph identity inside store selectors')
  }
  if (!runtimeWidgetStateText.includes('const graphKey = React.useMemo(() => buildGraphDocumentMetaKey(state.graphData), [state.graphData])')) {
    throw new Error('expected Storyboard Widget runtime scene to memoize the active graph key for widget dependency counts')
  }
  if (!runtimeWidgetStateText.includes('const flowWidgetWorldPosCount = React.useMemo(() => Object.keys(resolveScopedFlowWidgetNodeMap({')) {
    throw new Error('expected Storyboard Widget runtime scene to memoize scoped world-position dependency counts')
  }
  if (!runtimeWidgetStateText.includes('const flowWidgetPinnedCount = React.useMemo(() => Object.keys(resolveScopedFlowWidgetNodeMap({')) {
    throw new Error('expected Storyboard Widget runtime scene to memoize scoped pinned-state dependency counts')
  }
  if (runtimeSceneText.includes('const flowWidgetWorldPosCount = useGraphStore(s => {') || runtimeWidgetStateText.includes('const flowWidgetWorldPosCount = useGraphStore(s => {')) {
    throw new Error('expected Storyboard Widget runtime scene to avoid rebuilding graph keys inside world-position store selectors')
  }
  if (runtimeSceneText.includes('const flowWidgetPinnedCount = useGraphStore(s => {') || runtimeWidgetStateText.includes('const flowWidgetPinnedCount = useGraphStore(s => {')) {
    throw new Error('expected Storyboard Widget runtime scene to avoid rebuilding graph keys inside pinned-state store selectors')
  }
  if (!runtimeSceneText.includes("import { resolveScopedFlowWidgetNodeMap } from '@/lib/storyboardWidget/widgetStateScope'")) {
    throw new Error('expected Storyboard Widget runtime scene to reuse the shared scoped widget-state helper before reading workspace-blocked widget state')
  }
  if (!runtimeSceneText.includes('const pinnedById = resolveScopedFlowWidgetNodeMap({')) {
    throw new Error('expected Storyboard Widget runtime scene workspace-blocked widget seeding to read pinned state from the active graph scope')
  }
  if (!runtimeSceneText.includes('const posById = resolveScopedFlowWidgetNodeMap({')) {
    throw new Error('expected Storyboard Widget runtime scene workspace-blocked widget seeding to read floating screen positions from the active graph scope')
  }
  if (!runtimeSceneText.includes('const worldById = resolveScopedFlowWidgetNodeMap({')) {
    throw new Error('expected Storyboard Widget runtime scene workspace-blocked widget seeding to read world positions from the active graph scope')
  }
  if (runtimeSceneText.includes('const pinnedById = st.flowWidgetPinnedByNodeId || {}')) {
    throw new Error('expected Storyboard Widget runtime scene workspace-blocked widget seeding to forbid direct global pinned-state fallback')
  }
  if (runtimeSceneText.includes('const posById =\n      (st as unknown as { flowWidgetPosByNodeId?: Record<string, { top: number; left: number }> })')) {
    throw new Error('expected Storyboard Widget runtime scene workspace-blocked widget seeding to forbid direct global floating-position fallback')
  }
  if (runtimeSceneText.includes('const worldById =\n      (st as unknown as { flowWidgetWorldPosByNodeId?: Record<string, { x: number; y: number }> })')) {
    throw new Error('expected Storyboard Widget runtime scene workspace-blocked widget seeding to forbid direct global world-position fallback')
  }
}

export function testStoryboardWidgetOverlayCollisionPrefersGraphKeyedWidgetState() {
  const collisionPath = resolve(process.cwd(), 'src', 'components', 'StoryboardWidgetCanvas', 'runtime', 'useStoryboardWidgetOverlayCollision.ts')
  const collisionText = readFileSync(collisionPath, 'utf8')

  if (!collisionText.includes("import { buildGraphDocumentMetaKey } from '@/lib/graph/graphMetaKey'")) {
    throw new Error('expected Storyboard Widget overlay collision runtime to derive the active render-graph key before reading widget state')
  }
  if (!collisionText.includes("import { resolveScopedFlowWidgetNodeMap } from '@/lib/storyboardWidget/widgetStateScope'")) {
    throw new Error('expected Storyboard Widget overlay collision runtime to reuse the shared scoped widget-state helper')
  }
  if (!collisionText.includes('const graphKey = buildGraphDocumentMetaKey(graphDataForOverlayRuntime)')) {
    throw new Error('expected Storyboard Widget overlay collision runtime to derive one graph key from the active overlay graph source')
  }
  if (!collisionText.includes('const pinnedById = resolveScopedFlowWidgetNodeMap({')) {
    throw new Error('expected Storyboard Widget overlay collision runtime to read pinned state from graph-keyed widget state')
  }
  if (!collisionText.includes('const posById = resolveScopedFlowWidgetNodeMap({')) {
    throw new Error('expected Storyboard Widget overlay collision runtime to read floating screen positions from graph-keyed widget state')
  }
  if (!collisionText.includes('const worldById = resolveScopedFlowWidgetNodeMap({')) {
    throw new Error('expected Storyboard Widget overlay collision runtime to read widget world positions from graph-keyed widget state')
  }
  if (!collisionText.includes('const shouldWriteGraphScopedInMemory = !!graphKey && graphKey !== storeGraphKey')) {
    throw new Error('expected Storyboard Widget overlay collision runtime to avoid writing scoped overlay layout through the wrong graph setter context')
  }
  if (!collisionText.includes('flowWidgetPosByNodeIdByGraphMetaKey')) {
    throw new Error('expected Storyboard Widget overlay collision runtime to persist and subscribe to graph-keyed floating positions')
  }
  if (!collisionText.includes('flowWidgetWorldPosByNodeIdByGraphMetaKey')) {
    throw new Error('expected Storyboard Widget overlay collision runtime to persist and subscribe to graph-keyed world positions')
  }
  if (!collisionText.includes('flowWidgetPinnedByNodeIdByGraphMetaKey')) {
    throw new Error('expected Storyboard Widget overlay collision runtime to subscribe to graph-keyed pinned state')
  }
}
