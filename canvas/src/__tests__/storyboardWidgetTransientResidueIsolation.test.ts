import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

export function testStoryboardWidgetFrontmatterRichMediaOverlayPoolDisablesStickyCarryover() {
  const graphStatePath = resolve(process.cwd(), 'src', 'components', 'FlowCanvas', 'useFlowCanvasGraphState.ts')
  const text = readFileSync(graphStatePath, 'utf8')
  if (!text.includes("canvas2dRenderer === 'storyboard'\n    || (!storyboardWidgetOverlayInteractionMode && !storyboardWidgetFrontmatterInteractionMode)")) {
    throw new Error('expected Storyboard to preserve Rich Media overlays across transient interaction frames while Storyboard Widget/frontmatter disable sticky carryover')
  }
  if (!text.includes('if (!useStickyOverlayPool) {')) {
    throw new Error('expected Storyboard Widget/frontmatter Rich Media overlay pool to follow the live suggested overlay set directly')
  }
  if (!text.includes('stickyMap.clear()')) {
    throw new Error('expected Storyboard Widget/frontmatter Rich Media overlay pool to clear stale sticky overlay entries before following the live set')
  }
  if (!text.includes('const retainedStickyIds = new Set<string>(')) {
    throw new Error('expected sticky Storyboard Rich Media overlays to retain only explicitly selected/open panels across transient churn')
  }
  if (!text.includes('const pushResolvedStickyId = (rawId: unknown) => {') || !text.includes("const id = String(resolved?.id || '').trim()")) {
    throw new Error('expected sticky Storyboard Rich Media overlays to keep carryover scoped to ids that still resolve in the current scene graph')
  }
  if (!text.includes('for (let i = 0; i < selectedNodeIdsSnapshot.length; i += 1) pushResolvedStickyId(selectedNodeIdsSnapshot[i])') || !text.includes('pushResolvedStickyId(selectedNodeId)') || !text.includes('for (let i = 0; i < openWidgetNodeIdsSnapshot.length; i += 1) pushResolvedStickyId(openWidgetNodeIdsSnapshot[i])')) {
    throw new Error('expected sticky Storyboard Rich Media overlays to scope carryover to resolved selected/open widget ids instead of all previous overlay ids')
  }
  if (text.includes('const needed = new Set<string>(prevOrder)')) {
    throw new Error('expected sticky Storyboard Rich Media overlays to stop treating every previous overlay id as indefinitely needed')
  }
}

export function testStoryboardWidgetFrontmatterWidgetFallbackIsScopedToActiveSource() {
  const overlaySurfacePath = resolve(process.cwd(), 'src', 'components', 'StoryboardWidgetCanvas', 'runtime', 'useStoryboardWidgetOverlaySurface.tsx')
  const text = readFileSync(overlaySurfacePath, 'utf8')
  if (!text.includes('const lastStableOverlayEditorNodeIdsSourceKeyRef = React.useRef<string>(\'\')')) {
    throw new Error('expected Storyboard Widget/frontmatter widget overlay fallback ids to be scoped by active source selection')
  }
  if (!text.includes('activeSourceSelectionKey && activeSourceSelectionKey !== lastSourceKey')) {
    throw new Error('expected Storyboard Widget/frontmatter widget overlay fallback to reject stale ids after active source changes')
  }
  if (!text.includes('storyboardWidgetFrontmatterGraphAvailable || activeSourceFrontmatterFlowAvailable')) {
    throw new Error('expected same-source frontmatter handoff frames to keep stable overlay ids while render graph data is transiently replaced')
  }
  if (!text.includes('if (activeSourceParsedGraphKnown) return false')) {
    throw new Error('expected same-source frontmatter handoff fallback to stop once the active source is known to be non-frontmatter')
  }
  if (!text.includes('const preserveStableFrontmatterGraph =')) {
    throw new Error('expected same-source frontmatter handoff graphs not to replace the stable widget node resolver graph')
  }
}

export function testStoryboardWidgetSelectionBookkeepingDefersOpenWidgetCleanupUntilGraphHandoffResolves() {
  const selectionBookkeepingPath = resolve(process.cwd(), 'src', 'components', 'StoryboardWidgetCanvas', 'runtime', 'useStoryboardWidgetSelectionBookkeeping.ts')
  const text = readFileSync(selectionBookkeepingPath, 'utf8')
  if (!text.includes("scope: 'storyboard-widget-selection-bookkeeping-render-graph'")) {
    throw new Error('expected Storyboard Widget selection bookkeeping to build a render-graph lookup for open-widget cleanup during draft handoff frames')
  }
  if (!text.includes('const graphLookupForOpenWidgetCleanup =')) {
    throw new Error('expected Storyboard Widget selection bookkeeping to resolve a dedicated graph lookup before sanitizing open widget ids')
  }
  if (!text.includes("(draftGraphLookup?.nodeById.size || 0) > 0\n        ? draftGraphLookup\n        : (renderGraphLookup?.nodeById.size || 0) > 0\n          ? renderGraphLookup\n          : null")) {
    throw new Error('expected Storyboard Widget selection bookkeeping to defer open-widget cleanup while the draft graph is empty but the render graph still resolves the active nodes')
  }
  if (!text.includes('if (!graphLookupForOpenWidgetCleanup) return')) {
    throw new Error('expected Storyboard Widget selection bookkeeping to skip destructive open-widget cleanup when neither graph lookup has settled yet')
  }
  if (!text.includes("const preserveStoryboardGraphNodeIds = canvas2dRenderer === 'storyboard'")) {
    throw new Error('expected Storyboard Widget selection bookkeeping to preserve Storyboard fixed-card open-widget ids during overlay cleanup')
  }
  if (!text.includes('const protectedPendingOpenWidgetIds = [')) {
    throw new Error('expected Storyboard Widget selection bookkeeping to preserve pending overlay widget ids while graph handoff is still settling')
  }
  if (!text.includes('const protectedPendingOpenWidgetId = protectedPendingOpenWidgetIds.some(protectedId => isCanonicalNodeIdEqual(protectedId, s))')) {
    throw new Error('expected Storyboard Widget selection bookkeeping to compare pending overlay widget ids canonically during open-widget cleanup')
  }
  if (!text.includes('if (protectedPendingOpenWidgetId) return true')) {
    throw new Error('expected Storyboard Widget selection bookkeeping to skip destructive cleanup for pending overlay widget ids during the handoff window')
  }
  if (!text.includes('preserveStoryboardGraphNodeIds\n        || overlayEligible.size === 0\n        || overlayEligible.has(s)')) {
    throw new Error('expected Storyboard Widget selection bookkeeping to keep Storyboard graph-owned widget ids even when they are not overlay-eligible Flow widgets')
  }
}

export function testStoryboardWidgetOverlayCollisionResetsTransientKeysWhenOverlaySetDisappears() {
  const collisionPath = resolve(process.cwd(), 'src', 'components', 'StoryboardWidgetCanvas', 'runtime', 'useStoryboardWidgetOverlayCollision.ts')
  const text = readFileSync(collisionPath, 'utf8')
  if (!text.includes('const resetOverlayCollisionTransientState = React.useCallback((clearRectCache = false) => {')) {
    throw new Error('expected Storyboard Widget overlay collision runtime to centralize transient-state reset when overlay ids disappear')
  }
  if (!text.includes('if (overlayNodeIds.length < 2) {\n        resetOverlayCollisionTransientState(true)\n        return\n      }')) {
    throw new Error('expected Storyboard Widget overlay collision runtime to invalidate stale resolve keys when the overlay set transiently disappears')
  }
  if (!text.includes('if (items.length === 0) {\n        resetOverlayCollisionTransientState(true)\n        return\n      }')) {
    throw new Error('expected Storyboard Widget overlay collision runtime to drop stale rect cache when no movable overlay items remain')
  }
}

export function testStoryboardWidgetOverlayEdgesReuseStableGraphForMetadataLessHandoff() {
  const edgePath = resolve(process.cwd(), 'src', 'components', 'StoryboardWidgetCanvas', 'runtime', 'useStoryboardWidgetOverlayEdges.ts')
  const surfacePath = resolve(process.cwd(), 'src', 'components', 'StoryboardWidgetCanvas', 'runtime', 'StoryboardWidgetCanvasSurface.tsx')
  const text = readFileSync(edgePath, 'utf8')
  const surfaceText = readFileSync(surfacePath, 'utf8')
  if (!surfaceText.includes('{(props.overlayOnlyActive || props.hasOverlayEditors || storyboardCardsActive) && (')) {
    throw new Error('expected Storyboard Widget overlay edge host to stay mounted whenever overlay editors are visible or storyboard cards are active')
  }
  if (!text.includes('const liveGraphMetaKind = String(((liveGraph?.metadata || {}) as Record<string, unknown>).kind || \'\').trim()')) {
    throw new Error('expected Storyboard Widget overlay edges to inspect live graph metadata before accepting handoff graphs')
  }
  for (const snippet of [
    'const liveGraphRevision = readGraphDataRevision(liveGraph)',
    'const stableGraphRevision = readGraphDataRevision(stableGraph)',
    'const canReuseMetadataLessStableGraph =',
    'liveGraphRevision === stableGraphRevision',
    'liveGraphNodeCount === stableGraphNodeCount',
    'liveGraphEdgeCount === stableGraphEdgeCount',
  ]) {
    if (!text.includes(snippet)) {
      throw new Error(`expected metadata-less handoff reuse to stay scoped to matching live/stable graph revisions or equal zero-revision counts: ${snippet}`)
    }
  }
  if (!text.includes('|| (\n            canReuseMetadataLessStableGraph\n          )')) {
    throw new Error('expected metadata-less handoff graphs to reuse the stable overlay edge graph only through the explicit handoff guard')
  }
  const stableWriteIndex = text.indexOf('lastStableOverlayEdgeGraphRef.current = graph')
  const emptyFilteredIndex = text.indexOf("pushOverlayEdgeTrace('empty-filtered-edge-set'")
  if (stableWriteIndex < 0 || emptyFilteredIndex < 0 || stableWriteIndex < emptyFilteredIndex) {
    throw new Error('expected stable overlay edge graph to advance only after the live graph resolves overlay edges')
  }
  if (!text.includes('if (rawNodes.length > 0 && rawEdges.length > 0)')) {
    throw new Error('expected successful overlay edge graphs to seed stable edge fallback in Editor Workspace too')
  }
  if (!text.includes('if (!node) {\n      cacheFrozenOverlayEdgePaths()')) {
    throw new Error('expected Storyboard Widget overlay edges to freeze paths before SVG detach during workspace handoff')
  }
  if (!text.includes('const restoredFrozenPathCount = restoreFrozenOverlayEdgePaths(node)')) {
    throw new Error('expected Storyboard Widget overlay edges to restore frozen paths in Editor Workspace handoffs')
  }
  if (text.includes('http://127.0.0.1:7777/event')) {
    throw new Error('forbid hardcoded debug event sinks inside the Storyboard Widget overlay edge runtime')
  }
}

export function testStoryboardWidgetOverlayCollisionRebalancesOnGraphContentRevision() {
  const collisionPath = resolve(process.cwd(), 'src', 'components', 'StoryboardWidgetCanvas', 'runtime', 'useStoryboardWidgetOverlayCollision.ts')
  const runtimePath = resolve(process.cwd(), 'src', 'components', 'StoryboardWidgetCanvas.runtime.tsx')
  const runtimeStorePath = resolve(process.cwd(), 'src', 'components', 'StoryboardWidgetCanvas', 'runtime', 'useStoryboardWidgetRuntimeStoreState.ts')
  const collisionText = readFileSync(collisionPath, 'utf8')
  const runtimeText = readFileSync(runtimePath, 'utf8')
  const runtimeStoreText = readFileSync(runtimeStorePath, 'utf8')
  if (!collisionText.includes('graphContentRevision: number')) {
    throw new Error('expected Storyboard Widget overlay collision hook to accept graphContentRevision so indexing recomposition can invalidate stale layout state')
  }
  if (!collisionText.includes('resetOverlayCollisionTransientState()\n    scheduleOverlayCollisionResolveRef.current()')) {
    throw new Error('expected Storyboard Widget overlay collision effect to clear stale resolve keys before rebalancing on graph-content changes')
  }
  if (!collisionText.includes('overlayNodeLayoutSignature,') || !collisionText.includes('return buildOverlayNodeLayoutSignature(graphDataForOverlayRuntime)')) {
    throw new Error('expected collision invalidation to follow shared node-layout changes without replaying on edge-only publication')
  }
  if (!runtimeStoreText.includes('graphContentRevision: s.graphContentRevision || 0')) {
    throw new Error('expected Storyboard Widget runtime to read graphContentRevision from store')
  }
  if (!runtimeText.includes('graphContentRevision,')) {
    throw new Error('expected Storyboard Widget runtime to pass graphContentRevision into overlay collision hook')
  }
}

export function testRuntimeTraceResidueUsesSharedInMemoryTrace() {
  const traceHelperPath = resolve(process.cwd(), 'src', 'lib', 'debug', 'runtimeTrace.ts')
  const traceHelperText = readFileSync(traceHelperPath, 'utf8')
  if (!traceHelperText.includes('export function reportRuntimeTrace(entry: RuntimeTraceEntry): void {')) {
    throw new Error('expected runtime debug residue to centralize through the shared in-memory trace helper')
  }
  const workspaceMirrorTraceText = readFileSync(resolve(process.cwd(), 'src', 'features', 'workspace-fs', 'workspaceSeedProviderLocalIo.ts'), 'utf8')
  if (!workspaceMirrorTraceText.includes('reportRuntimeTrace({')) {
    throw new Error('expected workspace mirror diagnostics to reuse the shared in-memory trace helper')
  }
  for (const relativePath of [
    ['features', 'workspace-fs', 'workspaceSeedProvider.ts'],
    ['features', 'workspace-fs', 'workspaceSeedProviderLocalIo.ts'],
    ['features', 'workspace-fs', 'workspaceSeedProviderPaths.ts'],
    ['features', 'workspace-fs', 'workspaceSeedProviderSourceReaders.ts'],
    ['features', 'workspace-fs', 'workspaceSeedProviderStorage.ts'],
    ['components', 'FlowCanvas', 'useFlowCanvasGraphState.ts'],
    ['components', 'StoryboardWidgetCanvas.runtime.tsx'],
    ['components', 'StoryboardWidgetCanvas', 'runtime', 'useStoryboardWidgetOverlayCollision.ts'],
    ['components', 'StoryboardWidgetCanvas', 'runtime', 'useStoryboardWidgetOverlaySurface.tsx'],
    ['components', 'StoryboardWidgetCanvas', 'runtime', 'useStoryboardWidgetSelectionBookkeeping.ts'],
    ['components', 'StoryboardWidgetCanvas', 'runtime', 'useStoryboardWidgetOverlayEdges.ts'],
    ['components', 'StoryboardWidgetCanvas', 'runtime', 'useStoryboardWidgetRuntimeScene.ts'],
    ['hooks', 'store', 'graph-data-slice', 'graphDataNodeActions.ts'],
  ] as const) {
    const text = readFileSync(resolve(process.cwd(), 'src', ...relativePath), 'utf8')
    if (/http:\/\/127\.0\.0\.1:\d+\/event/.test(text)) {
      throw new Error(`forbid dead local debug collectors in runtime sources: ${relativePath.join('/')}`)
    }
    if (text.includes('[DEBUG]')) {
      throw new Error(`forbid inline debug log payload prefixes in runtime sources: ${relativePath.join('/')}`)
    }
  }
}
