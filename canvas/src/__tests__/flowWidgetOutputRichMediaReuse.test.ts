import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { getNodeMediaSpec } from '@/components/GraphCanvas/helpers'
import { deriveOpenWidgetOverlayNodeIds } from '@/components/StoryboardWidgetCanvas/storyboardWidgetCanvasShared'
import { buildTextWidgetOutputPatch } from '@/features/chat/richMediaRun'
import { buildDataflowWidgetRegistry } from '@/lib/storyboardWidget/widgetRegistryDataflow'
import { resolveRichMediaConnectedRenderSchemaPath } from '@/lib/storyboardWidget/widgetAutoRender'

export function testTextWidgetOutputPatchBuildsRichMediaIframeSpec() {
  const patch = buildTextWidgetOutputPatch({
    output: '## Hello\\n\\nWidget output',
    title: 'BytePlus Text Widget',
    model: 'seed-1-6-thinking',
  })
  const node = {
    id: 'text-widget-output',
    type: 'TextGeneration',
    label: 'BytePlus Text Widget',
    properties: patch,
  } as Parameters<typeof getNodeMediaSpec>[0]

  const spec = getNodeMediaSpec(node)
  if (spec) throw new Error('expected text widget output patch to stay off the direct media overlay path and render through Rich Media Panel instead')
  if (patch.outputSrcDoc) throw new Error('expected generated text output to persist Markdown without materializing srcDoc by default')

}

export function testRichMediaRunDispatchSupportsDeerFlowAdapters() {
  const richMediaRunPath = resolve(process.cwd(), 'src', 'features', 'chat', 'richMediaRun.ts')
  const text = readFileSync(richMediaRunPath, 'utf8')
  if (!text.includes('generateRunImageWithDeerFlow')) {
    throw new Error('expected rich media run dispatcher to import DeerFlow image adapter helper')
  }
  if (!text.includes('generateRunVideoWithDeerFlow')) {
    throw new Error('expected rich media run dispatcher to import DeerFlow video adapter helper')
  }
  if (!text.includes('if (normalizedProvider === CHAT_PROVIDER_DEERFLOW)')) {
    throw new Error('expected rich media run dispatcher to branch DeerFlow image/video execution by normalized provider')
  }
}

export function testStoryboardWidgetCanvasTextRunUsesSharedRichMediaOutputPatch() {
  const storyboardWidgetCanvasPath = resolve(process.cwd(), 'src', 'components', 'StoryboardWidgetCanvas.tsx')
  const workflowActionsPath = resolve(process.cwd(), 'src', 'components', 'StoryboardWidgetCanvas', 'runtime', 'useStoryboardWidgetWorkflowActions.ts')
  const workflowRunActionPath = resolve(process.cwd(), 'src', 'components', 'StoryboardWidgetCanvas', 'runtime', 'storyboardWidgetWorkflowRunAction.ts')
  const workflowRichMediaPanelPath = resolve(process.cwd(), 'src', 'components', 'StoryboardWidgetCanvas', 'runtime', 'storyboardWidgetWorkflowRichMediaPanel.ts')
  const workflowRichMediaPublicationPath = resolve(process.cwd(), 'src', 'components', 'StoryboardWidgetCanvas', 'runtime', 'storyboardWidgetWorkflowRichMediaPublication.ts')
  const text = [
    readFileSync(storyboardWidgetCanvasPath, 'utf8'),
    readFileSync(workflowActionsPath, 'utf8'),
    readFileSync(workflowRunActionPath, 'utf8'),
    readFileSync(workflowRichMediaPublicationPath, 'utf8'),
  ].join('\n')
  const workflowRichMediaPanelText = readFileSync(workflowRichMediaPanelPath, 'utf8')

  if (!text.includes('buildTextWidgetOutputPatch')) {
    throw new Error('expected StoryboardWidgetCanvas text widget run path to reuse shared text-widget rich-media output patch helper')
  }
  if (!text.includes('...clearRichMediaOutputProperties(nodeProps)')) {
    throw new Error('expected StoryboardWidgetCanvas text widget run path to clear stale rich-media output properties before writing next output')
  }
  if (!text.includes('...buildTextWidgetOutputPatch({')) {
    throw new Error('expected StoryboardWidgetCanvas text widget run path to write shared rich-media panel output metadata')
  }
  if (!workflowRichMediaPanelText.includes('export function ensureStoryboardWidgetWorkflowRichMediaPanelNodeId(args: {')) {
    throw new Error('expected StoryboardWidget runtime helper to centralize rich-media panel creation fallback')
  }
  if (!text.includes('const createdPanelNodeId = explicitPanelNodeIds.length > 0 ? null : ensureStoryboardWidgetWorkflowRichMediaPanelNodeId({')) {
    throw new Error('expected StoryboardWidgetCanvas text widget run path to reuse the shared rich-media panel target helper')
  }
  if (!text.includes('applyStoryboardWidgetWorkflowRichMediaPanelDraftPatch({') || !text.includes('applyPublishedPanelPatch(panelNodeId, patch)')) {
    throw new Error('expected StoryboardWidgetCanvas text widget run path to reuse the shared rich-media panel draft patch helper')
  }
}

export function testStoryboardWidgetCanvasRunTargetsWritableNodeIdForComposedGraphs() {
  const storyboardWidgetCanvasPath = resolve(process.cwd(), 'src', 'components', 'StoryboardWidgetCanvas.tsx')
  const workflowActionsPath = resolve(process.cwd(), 'src', 'components', 'StoryboardWidgetCanvas', 'runtime', 'useStoryboardWidgetWorkflowActions.ts')
  const workflowRunActionPath = resolve(process.cwd(), 'src', 'components', 'StoryboardWidgetCanvas', 'runtime', 'storyboardWidgetWorkflowRunAction.ts')
  const renderGraphHelperPath = resolve(process.cwd(), 'src', 'components', 'StoryboardWidgetCanvas', 'runtime', 'storyboardWidgetRenderGraph.ts')
  const workflowWritebackPath = resolve(process.cwd(), 'src', 'components', 'StoryboardWidgetCanvas', 'runtime', 'storyboardWidgetWorkflowWriteback.ts')
  const text = [
    readFileSync(storyboardWidgetCanvasPath, 'utf8'),
    readFileSync(workflowActionsPath, 'utf8'),
    readFileSync(workflowRunActionPath, 'utf8'),
  ].join('\n')
  const renderGraphHelperText = readFileSync(renderGraphHelperPath, 'utf8')
  const workflowWritebackText = readFileSync(workflowWritebackPath, 'utf8')

  if (!renderGraphHelperText.includes('export function resolveStoryboardWidgetWorkflowWritableNodeId(args: {')) {
    throw new Error('expected StoryboardWidget runtime helper to centralize composed-id draft write-target resolution')
  }
  if (!renderGraphHelperText.includes('const exactRequested = requested.full ? args.context.draftNodeById.get(requested.full) || null : null')) {
    throw new Error('expected shared workflow node-resolution helper to prefer exact draft node matches before canonical fallback')
  }
  if (!renderGraphHelperText.includes('const innerMatches = args.context.draftNodes.filter(node => targetInners.has(splitComposedNodeId(node?.id).inner))')) {
    throw new Error('expected shared workflow node-resolution helper to reuse canonical inner-id fallback when draft ids are composed')
  }
  if (!text.includes('const writableNodeId = String(resolvedRunTarget?.writableNodeId || resolvedNodeId).trim() || resolvedNodeId')) {
    throw new Error('expected StoryboardWidgetCanvas run path to consume the shared writable node id from the upstream run-target resolver')
  }
  if (!workflowWritebackText.includes('export function updateStoryboardWidgetWorkflowOutputForKnownNodeIds(args: {')) {
    throw new Error('expected StoryboardWidget runtime helper to centralize output writes via canonical id updater')
  }
  if (!text.includes('args.draftGraphDataRef.current = nextDraft')) {
    throw new Error('expected StoryboardWidgetCanvas run path to update live draft graph ref output before renderer recompute')
  }
  if (!text.includes('args.setDraftGraphData(prev => (prev === currentDraft ? nextDraft : args.draftGraphDataRef.current))')) {
    throw new Error('expected StoryboardWidgetCanvas run path to preserve live draft ref as SSOT while React state catches up')
  }
  if (!workflowWritebackText.includes("import { bumpStoryboardWidgetDraftGraphDataRevision } from '@/lib/storyboardWidget/storyboardWidgetDraftGraphData'")) {
    throw new Error('expected StoryboardWidget runtime helper to reuse neutral draft graph revision bumping for output cache invalidation')
  }
}

export function testStoryboardWidgetCanvasUsesDraftRevisionForActiveRenderGraph() {
  const storyboardWidgetCanvasPath = resolve(process.cwd(), 'src', 'components', 'StoryboardWidgetCanvas.tsx')
  const runtimePath = resolve(process.cwd(), 'src', 'components', 'StoryboardWidgetCanvas.runtime.tsx')
  const surfacePath = resolve(process.cwd(), 'src', 'components', 'StoryboardWidgetCanvas', 'runtime', 'StoryboardWidgetCanvasSurface.tsx')
  const renderStatePath = resolve(process.cwd(), 'src', 'components', 'StoryboardWidgetCanvas', 'runtime', 'useStoryboardWidgetRenderState.ts')
  const text = `${readFileSync(storyboardWidgetCanvasPath, 'utf8')}\n${readFileSync(runtimePath, 'utf8')}\n${readFileSync(surfacePath, 'utf8')}\n${readFileSync(renderStatePath, 'utf8')}`

  if (!text.includes('const draftGraphDataRevision = React.useMemo(() => {')) {
    throw new Error('expected StoryboardWidgetCanvas to derive a render revision from the live draft graph')
  }
  if (!text.includes("const raw = (meta as Record<string, unknown>).graphDataRevision")) {
    throw new Error('expected StoryboardWidgetCanvas to read the draft graph revision from graph metadata')
  }
  if (!text.includes('graphDataRevisionOverride={props.storyboardWidgetViewActive ? props.draftGraphDataRevision : props.baseGraphDataRevision}')) {
    throw new Error('expected FlowCanvas to render against the live draft revision while Storyboard Widget is active')
  }
}

export function testRichMediaRenderPathsReuseSemanticGraphKeysForConnectedValueCaching() {
  const flowDataflowPath = resolve(process.cwd(), 'src', 'lib', 'storyboardWidget', 'flowDataflow.ts')
  const flowCanvasStatePath = resolve(process.cwd(), 'src', 'components', 'FlowCanvas', 'useFlowCanvasGraphState.ts')
  const overlays2dPath = resolve(process.cwd(), 'src', 'components', 'GraphCanvasRoot', 'hooks', 'useRichMediaOverlays2d.ts')
  const previewPanelPath = resolve(process.cwd(), 'src', 'lib', 'panels', 'views', 'PreviewPanelView.impl.tsx')
  const commandMenuRichMediaInventoryPath = resolve(process.cwd(), 'src', 'lib', 'command-menu', 'commandMenuRichMediaInventory.ts')
  const graphTableInspectorPath = resolve(process.cwd(), 'src', 'features', 'graph-inspector', 'ui', 'GraphRecordInspector.tsx')
  const overlaySurfacePath = resolve(process.cwd(), 'src', 'components', 'StoryboardWidgetCanvas', 'runtime', 'useStoryboardWidgetOverlaySurface.tsx')
  const flowDataflowText = readFileSync(flowDataflowPath, 'utf8')
  const flowCanvasStateText = readFileSync(flowCanvasStatePath, 'utf8')
  const overlays2dText = readFileSync(overlays2dPath, 'utf8')
  const previewPanelText = readFileSync(previewPanelPath, 'utf8')
  const commandMenuRichMediaInventoryText = readFileSync(commandMenuRichMediaInventoryPath, 'utf8')
  const graphTableInspectorText = readFileSync(graphTableInspectorPath, 'utf8')
  const overlaySurfaceText = readFileSync(overlaySurfacePath, 'utf8')

  if (!flowDataflowText.includes('graphSemanticKey?: string')) {
    throw new Error('expected flow dataflow cache SSOT to accept an explicit semantic graph key')
  }
  if (!flowDataflowText.includes("buildScopedGraphSemanticKey('flow-connected-values-graph'")) {
    throw new Error('expected flow dataflow cache SSOT to derive cache keys from the shared semantic graph key helper')
  }
  if (!flowCanvasStateText.includes('graphSemanticKey: sceneGraphSemanticKey,')) {
    throw new Error('expected FlowCanvas rich media connected-value path to reuse the scene graph semantic key')
  }
  if (!flowCanvasStateText.includes('const dataflowWidgetRegistry = React.useMemo(() => {')) {
    throw new Error('expected FlowCanvas rich media connected-value path to derive one upstream merged dataflow registry memo')
  }
  if (!flowCanvasStateText.includes('registry: dataflowWidgetRegistry,')) {
    throw new Error('expected FlowCanvas rich media connected-value path to reuse the upstream merged dataflow registry memo')
  }
  if (!overlays2dText.includes('graphSemanticKey: sceneGraphSemanticKey,')) {
    throw new Error('expected D3 rich media overlay path to reuse the scene graph semantic key for connected-value caching')
  }
  if (!overlays2dText.includes('readWidgetRegistryMetadataEntries<WidgetRegistryEntry>(metadata)') || !overlays2dText.includes('const isLiveFrozenOverlayId = (id: string): boolean => {') || !overlays2dText.includes('if (!isLiveFrozenOverlayId(id)) continue')) {
    throw new Error('expected D3 rich media overlay path to reuse shared registry metadata and drop removed nodes from the sticky overlay cache')
  }
  if (overlays2dText.includes('const registryRaw = metadata[FLOW_WIDGET_REGISTRY_METADATA_KEY]')) {
    throw new Error('expected D3 rich media overlay path to stop parsing widget registry metadata inline')
  }
  if (!previewPanelText.includes('useCommandMenuRichMediaInventory()') || !commandMenuRichMediaInventoryText.includes('graphSemanticKey,')) {
    throw new Error('expected PreviewPanelView graph media path to thread semantic graph key caching through the shared Command Menu rich-media inventory')
  }
  if (!graphTableInspectorText.includes('graphSemanticKey,')) {
    throw new Error('expected GraphRecordInspector widget preview path to thread a semantic graph key into connected-value caching')
  }
  if (!overlaySurfaceText.includes('frontmatterVisibleSceneDisplayRef.current.key !== frontmatterVisibleGraphSemanticKey')) {
    throw new Error('expected StoryboardWidget overlay surface to invalidate frontmatter scene derivation on semantic graph keys instead of raw graph identity')
  }
}

export function testStoryboardWidgetCanvasResolvesCanonicalSelectionIdsAcrossDraftAndOverlayGraphs() {
  const selectionBookkeepingPath = resolve(process.cwd(), 'src', 'components', 'StoryboardWidgetCanvas', 'runtime', 'useStoryboardWidgetSelectionBookkeeping.ts')
  const overlaySurfacePath = resolve(process.cwd(), 'src', 'components', 'StoryboardWidgetCanvas', 'runtime', 'useStoryboardWidgetOverlaySurface.tsx')
  const sharedPath = resolve(process.cwd(), 'src', 'components', 'StoryboardWidgetCanvas', 'storyboardWidgetCanvasShared.tsx')
  const text = `${readFileSync(selectionBookkeepingPath, 'utf8')}\n${readFileSync(overlaySurfacePath, 'utf8')}\n${readFileSync(sharedPath, 'utf8')}`

  if (!text.includes("import { isCanonicalNodeIdEqual, parseCanonicalNodeIds, resolveGraphNodeByCanonicalId, splitComposedNodeId } from '@/lib/graph/canonicalNodeIds'")) {
    throw new Error('expected StoryboardWidgetCanvas to reuse the shared canonical node-id resolver SSOT for selection and overlay paths')
  }
  if (!text.includes('if (selected && isCanonicalNodeIdEqual(selected, override))')) {
    throw new Error('expected StoryboardWidgetCanvas overlay selection bookkeeping to compare selected and override ids canonically')
  }
  if (!text.includes('const selectedMatchesOverride = selected ? isCanonicalNodeIdEqual(selected, override) : false')) {
    throw new Error('expected StoryboardWidgetCanvas overlay override cleanup to resolve composed and canonical node ids through shared canonical equality')
  }
  if (!text.includes('return resolveDraftGraphNode(selectedNodeId) || resolveGraphNodeByCanonicalId(draftGraphData, selectedNodeId)')) {
    throw new Error('expected StoryboardWidgetCanvas selected draft node lookup to resolve composed ids against the draft graph')
  }
  if (!text.includes('deriveOpenWidgetOverlayNodeIds({')) {
    throw new Error('expected StoryboardWidgetCanvas overlay-open widget ids to resolve through the shared overlay node-id helper')
  }
  if (!text.includes('const resolvedId = resolveGraphNodeIdByCanonicalId(args.graphData, rawId)')) {
    throw new Error('expected shared StoryboardWidget overlay node-id helper to normalize composed ids against the active render graph')
  }
  if (!text.includes('const pendingOverlayNodeMatch =')) {
    throw new Error('expected StoryboardWidgetCanvas pending-open bookkeeping to derive a pending-overlay fallback before giving up on rich-media widget opens')
  }
  if (!text.includes("pendingOverlayNode && isCanonicalNodeIdEqual(String(pendingOverlayNode.id || '').trim(), resolvedPending || pending)")) {
    throw new Error('expected StoryboardWidgetCanvas pending-open bookkeeping to compare pending overlay ids canonically against the unresolved widget-open target')
  }
}

export function testDeriveOpenWidgetOverlayNodeIdsNormalizesCanonicalIdsAndFiltersExcludedNodes() {
  const graphData: import('@/lib/graph/types').GraphData = {
    type: 'Graph',
    nodes: [
      { id: 'group-a::node-a', label: 'Node A', type: 'TextGeneration', properties: {} },
      { id: 'node-b', label: 'Node B', type: 'ImageGeneration', properties: {} },
      { id: 'section-1', label: 'Section 1', type: 'Section', properties: {} },
      { id: 'node-c', label: 'Node C', type: 'VideoGeneration', properties: {} },
    ],
    edges: [],
    metadata: {},
  }
  const nodeById = new Map(graphData.nodes.map(node => [String(node.id || '').trim(), node]))
  const ids = deriveOpenWidgetOverlayNodeIds({
    graphData,
    openWidgetNodeIds: ['node-a', 'group-a::node-a', 'section-1', 'node-c'],
    eligibleNodeIds: new Set(['group-a::node-a', 'node-b']),
    nodeById,
    selectedNodeId: 'node-b',
  })

  if (ids.length !== 2) {
    throw new Error(`expected two canonical overlay ids after dedupe/filtering, got ${ids.length}`)
  }
  if (ids[0] !== 'group-a::node-a') {
    throw new Error(`expected canonical graph node id for composed widget overlay, got ${String(ids[0] || '<none>')}`)
  }
  if (ids[1] !== 'node-b') {
    throw new Error(`expected selected draft node id to append when eligible and not excluded, got ${String(ids[1] || '<none>')}`)
  }
}

export function testStoryboardWidgetCanvasDataflowRegistryPrefersNonEmptyDocumentThenEffectiveThenBase() {
  const storyboardWidgetCanvasRuntimePath = resolve(process.cwd(), 'src', 'components', 'StoryboardWidgetCanvas.runtime.tsx')
  const workflowActionsPath = resolve(process.cwd(), 'src', 'components', 'StoryboardWidgetCanvas', 'runtime', 'useStoryboardWidgetWorkflowActions.ts')
  const workflowRunActionPath = resolve(process.cwd(), 'src', 'components', 'StoryboardWidgetCanvas', 'runtime', 'storyboardWidgetWorkflowRunAction.ts')
  const workflowRunInputsPath = resolve(process.cwd(), 'src', 'components', 'StoryboardWidgetCanvas', 'runtime', 'storyboardWidgetWorkflowRunInputs.ts')
  const workflowMediaRunHandlersPath = resolve(process.cwd(), 'src', 'components', 'StoryboardWidgetCanvas', 'runtime', 'storyboardWidgetWorkflowMediaRunHandlers.ts')
  const runtimeText = readFileSync(storyboardWidgetCanvasRuntimePath, 'utf8')
  const workflowActionsText = `${readFileSync(workflowActionsPath, 'utf8')}\n${readFileSync(workflowRunActionPath, 'utf8')}\n${readFileSync(workflowMediaRunHandlersPath, 'utf8')}`
  const workflowRunInputsText = readFileSync(workflowRunInputsPath, 'utf8')

  if (!runtimeText.includes('buildDataflowWidgetRegistry')) {
    throw new Error('expected StoryboardWidgetCanvas runtime to derive one upstream merged dataflow widget registry')
  }
  if (!runtimeText.includes('() => buildDataflowWidgetRegistry({ documentWidgetRegistry, effectiveWidgetRegistry, widgetRegistry: baseWidgetRegistry })')) {
    throw new Error('expected StoryboardWidgetCanvas runtime to merge document, effective, and base widget registries through the shared dataflow registry SSOT')
  }
  if (!runtimeText.includes('widgetRegistry,')) {
    throw new Error('expected StoryboardWidgetCanvas runtime to pass the upstream merged widget registry into workflow actions')
  }
  if (!workflowActionsText.includes('widgetRegistry: WidgetRegistryEntry[]')) {
    throw new Error('expected StoryboardWidget workflow actions to accept the upstream merged widget registry instead of rebuilding it locally')
  }
  if (!workflowRunInputsText.includes('registry: args.registry,')) {
    throw new Error('expected StoryboardWidget workflow run-input helper to reuse the upstream merged widget registry for connected-value resolution')
  }
  if (!workflowRunInputsText.includes('if (args.context.renderGraph) candidateGraphs.push(args.context.renderGraph)')) {
    throw new Error('expected StoryboardWidget workflow run-input helper to prefer render graph data for connected-value resolution')
  }
  if (!workflowActionsText.includes('const connectedValuesInput = resolveStoryboardWidgetWorkflowConnectedValuesInput({')) {
    throw new Error('expected StoryboardWidget workflow rich-media runs to reuse the shared run-input helper instead of choosing a graph locally')
  }
  if (!workflowActionsText.includes('connectedValuesBySchemaPath: connectedValuesInput?.connectedValuesByNodeId.get(connectedValuesInput.targetNodeId)')) {
    throw new Error('expected rich-media runs to read connected values through the helper-resolved target node id')
  }
  if (!workflowActionsText.includes('resolveWidgetRegistryEntry({ node, registry: args.widgetRegistry, graphMetaKind: args.baseGraphKind })')) {
    throw new Error('expected StoryboardWidget workflow text runs to reuse the upstream merged widget registry for registry resolution')
  }
  if (!workflowActionsText.includes('registryEntries: args.widgetRegistry,')) {
    throw new Error('expected StoryboardWidget workflow bundle export path to reuse the upstream merged widget registry for full-bundle export')
  }
  if (workflowActionsText.includes('buildDataflowWidgetRegistry({')) {
    throw new Error('expected StoryboardWidget workflow actions to stop rebuilding a local merged dataflow widget registry')
  }
  if (workflowActionsText.includes('Array.isArray(store.widgetRegistry)')) {
    throw new Error('expected StoryboardWidget workflow actions to stop reading base widget registry directly from store state')
  }
  if (workflowActionsText.includes('computeFlowConnectedValuesBySchemaPath({')) {
    throw new Error('expected StoryboardWidget workflow actions to stop owning inline connected-values graph selection')
  }
}

export function testWidgetEditorUsesMergedDataflowRegistry() {
  const runtimePath = resolve(process.cwd(), 'src', 'components', 'StoryboardWidgetCanvas.runtime.tsx')
  const runtimeStoreStatePath = resolve(process.cwd(), 'src', 'components', 'StoryboardWidgetCanvas', 'runtime', 'useStoryboardWidgetRuntimeStoreState.ts')
  const runtimeText = readFileSync(runtimePath, 'utf8')
  const runtimeStoreStateText = readFileSync(runtimeStoreStatePath, 'utf8')

  if (!runtimeText.includes('buildDataflowWidgetRegistry')) {
    throw new Error('expected Storyboard Widget runtime to resolve widget forms from shared merged dataflow registry')
  }
  if (!runtimeStoreStateText.includes('documentWidgetRegistry: Array.isArray(s.documentWidgetRegistry)')) {
    throw new Error('expected Storyboard Widget runtime state to include document widget registry in merged form resolution')
  }
  if (!runtimeStoreStateText.includes('effectiveWidgetRegistry: Array.isArray(s.effectiveWidgetRegistry)')) {
    throw new Error('expected Storyboard Widget runtime state to include effective widget registry in merged form resolution')
  }
  if (!runtimeText.includes('widgetRegistry: baseWidgetRegistry')) {
    throw new Error('expected Storyboard Widget runtime to include base widget registry in merged form resolution')
  }
}

export function testFloatingPropsPanelUsesMergedDataflowRegistry() {
  const floatingPropsPanelPath = resolve(process.cwd(), 'src', 'features', 'toolbar', 'FloatingPropsPanel.tsx')
  const text = readFileSync(floatingPropsPanelPath, 'utf8')

  if (!text.includes('effectiveWidgetRegistry')) {
    throw new Error('expected FloatingPropsPanel widget palette to reuse the store effective widget registry SSOT')
  }
  if (text.includes('buildDataflowWidgetRegistry')) {
    throw new Error('expected FloatingPropsPanel to avoid rebuilding a duplicate merged widget registry locally')
  }
  if (!text.includes('filter(isPropsPanelWidgetPaletteEntry)')) {
    throw new Error('expected FloatingPropsPanel widget palette to filter entries through the shared neutral palette helper')
  }
  if (!text.includes('<WidgetPalette entries={widgetPaletteEntries} dragEnabled={widgetDragEnabled} />')
    || !text.includes('data-kg-props-panel-surface="widget-palette"')) {
    throw new Error('expected FloatingPropsPanel to stay a shared WidgetPalette host instead of re-owning local controls')
  }
  for (const staleSnippet of [
    'useFloatingPropsPanelModel',
    'NODE_MEDIA_KINDS',
    'CollapsibleSection',
    'PanelRangeInput',
    'PanelSelect',
    'PanelTextInput',
    'Add Media Node',
    'Update Media',
    'Anti-line strength',
    'Strong spread preset',
  ]) {
    if (text.includes(staleSnippet)) {
      throw new Error(`expected FloatingPropsPanel palette-only surface to omit stale local-control snippet: ${staleSnippet}`)
    }
  }
}

export function testRichMediaPanelMarkdownPreviewDisablesGlobalTokenStoreSync() {
  const richMediaPanelPaths = ['RichMediaPanelTextSurface.tsx', 'RichMediaPanelWorkspaceViewerSurface.tsx', 'useRichMediaPanelSurfaceState.ts', 'useRichMediaPanelMediaState.ts'].map(fileName => resolve(process.cwd(), 'src', 'components', fileName))
  const markdownPreviewPath = resolve(process.cwd(), 'src', 'features', 'markdown', 'ui', 'MarkdownPreview.tsx')
  const cardMarkdownPreviewPath = resolve(process.cwd(), 'src', 'lib', 'cards', 'CardMarkdownPreview.tsx')
  const cardTextSurfaceFramePath = resolve(process.cwd(), 'src', 'lib', 'cards', 'cardTextSurfaceFrame.ts')
  const panelText = richMediaPanelPaths.map(filePath => readFileSync(filePath, 'utf8')).join('\n')
  const previewText = readFileSync(markdownPreviewPath, 'utf8')
  const cardMarkdownPreviewText = readFileSync(cardMarkdownPreviewPath, 'utf8')
  const cardTextSurfaceFrameText = readFileSync(cardTextSurfaceFramePath, 'utf8')

  if (
    !panelText.includes("from '@/lib/cards/CardInlineTextEditor'")
    || !panelText.includes("markdownPreview={props.panel?.markdownPresentationMode === true ? true : 'auto'}")
    || !cardMarkdownPreviewText.includes('markdownTokenStoreSync={false}')
    || !panelText.includes("React.lazy(() => import('@/features/markdown/ui/MarkdownPreview'))")
    || !panelText.includes('markdownTokenStoreSync={false}')
  ) {
    throw new Error('expected RichMediaPanel Card and Workspace Viewer markdown paths to disable global markdown token store synchronization')
  }
  if (!previewText.includes('markdownTokenStoreSync?: boolean')) {
    throw new Error('expected MarkdownPreview to expose an explicit markdown token store sync gate')
  }
  if (!previewText.includes('markdownTokenStoreSync = true')) {
    throw new Error('expected MarkdownPreview to preserve existing token-store sync behavior by default')
  }
  if (!panelText.includes('const workspaceEditorOverlayOpen = isWorkspaceEditorOverlayOpen({') || !panelText.includes('workspaceViewMode:') || !panelText.includes('workspaceCanvasPaneOpen:')) {
    throw new Error('expected RichMediaPanel to use canonical workspace overlay-open state instead of workspace editor mode alone')
  }
  if (!panelText.includes('const allowPanelContentPointerEvents =') || !panelText.includes('!workspaceEditorOverlayOpen || storyboardWidgetInteractionMode === true || mediaState.isStoryboardRenderer === true')) {
    throw new Error('expected RichMediaPanel to keep content pointer interactions enabled in StoryboardWidget interaction mode for in-panel scrolling')
  }
  if (!panelText.includes('data-kg-media-scroll-surface="1"')) {
    throw new Error('expected RichMediaPanel markdown preview container to self-declare scroll-surface marker for overlay-pan gating')
  }
  if (!panelText.includes('data-kg-canvas-wheel-ignore="true"')) {
    throw new Error('expected RichMediaPanel markdown preview container to opt into the shared canvas wheel-ignore contract like MainPanel scroll surfaces')
  }
  if (!panelText.includes('CARD_TEXT_SURFACE_SCROLL_CLASS_NAME') || !panelText.includes("'flex min-h-0 flex-1 overflow-hidden'")) {
    throw new Error('expected compact Card previews to retain the shared vertical scroll owner while Workspace Viewer previews use their canonical internal scroll owner')
  }
  if (!cardTextSurfaceFrameText.includes('overflow-x-hidden')) {
    throw new Error('expected RichMediaPanel markdown preview container to keep horizontal overflow hidden like MainPanel settings bodies')
  }
  if (!panelText.includes('const storyboardWidgetInteractionMode = storyboardWidgetOverlayProxyMode || storyboardWidgetFrontmatterDocumentMode')) {
    throw new Error('expected RichMediaPanel selection/scroll interactivity gate to accept Storyboard Widget interaction and frontmatter document overlay semantics')
  }
  if (!panelText.includes("import { useShallow } from 'zustand/react/shallow'")) {
    throw new Error('expected RichMediaPanel to reuse zustand shallow selectors for hot-path store subscriptions')
  }
  if (!panelText.includes('} = useGraphStore(\n    useShallow(store => ({')) {
    throw new Error('expected RichMediaPanel to consolidate hot-path store reads behind one shallow store selector')
  }
  if (panelText.includes('const richMediaPanelMode = useGraphStore(s => s.richMediaPanelMode)')) {
    throw new Error('expected RichMediaPanel to remove per-field store subscriptions after the shared shallow selector was introduced')
  }
  if (panelText.includes('const selectedNodeId = useGraphStore(s => s.selectedNodeId)')) {
    throw new Error('expected RichMediaPanel selection state to come from the shared shallow selector instead of a separate subscription')
  }
  if (panelText.includes('selectedNodeIds: s.selectedNodeIds ?? EMPTY_STRING_ARRAY')) {
    throw new Error('expected RichMediaPanel shared shallow selector to avoid stale selected-node fallback subscriptions')
  }
}

export function testFlowCanvasRichMediaResizeUsesCanonicalSelectionMatch() {
  const flowCanvasStatePath = resolve(process.cwd(), 'src', 'components', 'FlowCanvas', 'useFlowCanvasGraphState.ts')
  const flowCanvasOverlayPath = resolve(process.cwd(), 'src', 'components', 'FlowCanvas', 'FlowCanvasMediaOverlays.tsx')
  const stateText = readFileSync(flowCanvasStatePath, 'utf8')
  const overlayText = readFileSync(flowCanvasOverlayPath, 'utf8')

  if (!stateText.includes("buildCanonicalNodeIdSet")) {
    throw new Error('expected FlowCanvas graph state to reuse shared canonical node-id set helpers for overlay selection')
  }
  if (!stateText.includes('const selectedOverlayNodeIds = React.useMemo(() => {')) {
    throw new Error('expected FlowCanvas to derive canonical overlay selection ids from store-selected node id and selected node-id set')
  }
  if (!stateText.includes('return buildCanonicalNodeIdSet(selectedOverlayNodeIds)')) {
    throw new Error('expected FlowCanvas graph state to memoize a canonical selected-overlay id set instead of rescanning media nodes')
  }
  if (!overlayText.includes("from '@/lib/graph/canonicalNodeIds'") || !overlayText.includes('canonicalNodeIdSetHas')) {
    throw new Error('expected FlowCanvas media overlays to reuse shared canonical node-id set membership helper')
  }
  if (!overlayText.includes('canonicalNodeIdSetHas(selectedOverlayNodeIdSet, node.id)') || !overlayText.includes('isCanonicalNodeIdEqual(selectedNodeId, node.id)') || !overlayText.includes('isCanonicalNodeIdEqual(activeRichMediaPanelId, node.id)')) throw new Error('expected FlowCanvas media overlay selection checks to use shared canonical membership plus active rich-media panel state')
  if (!stateText.includes('const storyboardWidgetOverlayInteractionMode = isStoryboardWidgetSurfaceRenderer(canvas2dRenderer)')) {
    throw new Error('expected FlowCanvas overlay interactions to use the shared Storyboard Widget surface renderer gate as interaction SSOT')
  }
  if (!overlayText.includes("const mediaOverlayDragInteractionMode = storyboardWidgetSurfaceRendererMode || storyboardSharedSurfaceRendererMode || canvas2dRenderer === 'flowCanvas'")) {
    throw new Error('expected FlowCanvas media overlay pan/drag handlers to use the shared Storyboard Widget surface/Flow Canvas interaction gate')
  }
  if (overlayText.includes('isStoryboardWidgetFrontmatterInteractionMode')) {
    throw new Error('expected FlowCanvas rich-media overlay runtime to remove stale frontmatter-only interaction gate references')
  }
  if (!overlayText.includes('const resizeHandleVisible = isSelected')) {
    throw new Error('expected RichMediaPanel resize affordance visibility to follow selected chrome independently of mutation availability')
  }
  if (!overlayText.includes('resizable={resizeHandleVisible}') || !overlayText.includes('resizeHandleVisible={resizeHandleVisible}')) {
    throw new Error('expected RichMediaPanel resize interaction and visible selected affordance to share the explicit resizeHandleVisible gate')
  }
}

export function testRichMediaPanelOverlayPanSkipsResizeAndScrollTargets() {
  const richMediaPanelPath = resolve(process.cwd(), 'src', 'components', 'useRichMediaPanelSurfaceState.ts')
  const text = readFileSync(richMediaPanelPath, 'utf8')

  if (!text.includes('pointerEvents: shouldHideSurfaceUntilReady') || !text.includes(": workspaceEditorOverlayOpen || canvasOverlayProxyEnabled") || !text.includes(": (contentInteractive || canClickToOpen ? 'auto' : 'none'),")) {
    throw new Error('expected RichMediaPanel root pointer events to stay enabled for shared overlay pan/drag handlers')
  }
  if (!text.includes("from 'grph-shared/dom/overlayPointerGuards'")
    || !text.includes('readOverlayPointerTargetState')
    || !text.includes('shouldBlockOverlayPanTarget(pointerTarget, { scrollSurfaceCanForwardPointer })')) {
    throw new Error('expected RichMediaPanel root pointer-capture path to reuse shared overlay pointer guards for resize/scroll/media/header targets')
  }
  if (text.includes('overlayAlreadySelected')) {
    throw new Error('expected RichMediaPanel body pan to avoid stale selected-first gating so static renderer previews can pan immediately')
  }
}

export function testRichMediaPanelHeaderDragStaysAvailableInPanMode() {
  const checkedSources = [
    {
      label: 'D3 overlay interaction hook',
      path: resolve(process.cwd(), 'src', 'components', 'GraphCanvasRoot', 'hooks', 'useOverlayInteractions2d.ts'),
    },
    {
      label: 'D3 rich media overlay layer',
      path: resolve(process.cwd(), 'src', 'components', 'GraphCanvasRoot', 'components', 'RichMediaOverlayLayer2d.tsx'),
    },
    {
      label: 'Design markdown overlay',
      path: resolve(process.cwd(), 'src', 'lib', 'markdown-edgeless', 'MarkdownDesignOverlay.impl.tsx'),
    },
    {
      label: 'Design media shell controller',
      path: resolve(process.cwd(), 'src', 'components', 'DesignCanvas', 'useDesignCanvasShellControllers.ts'),
    },
    {
      label: 'Flow Canvas media overlay',
      path: resolve(process.cwd(), 'src', 'components', 'FlowCanvas', 'FlowCanvasMediaOverlays.tsx'),
    },
  ]

  for (const source of checkedSources) {
    const text = readFileSync(source.path, 'utf8')
    if (text.includes("canvasPointerMode2d === 'pan'")) {
      throw new Error(`expected ${source.label} to keep Rich Media Panel header drag available in pan mode`)
    }
  }

  const d3HookText = readFileSync(checkedSources[0]!.path, 'utf8')
  const d3LayerText = readFileSync(checkedSources[1]!.path, 'utf8')
  const designOverlayText = readFileSync(checkedSources[2]!.path, 'utf8')
  const designShellText = readFileSync(checkedSources[3]!.path, 'utf8')
  const flowCanvasOverlayText = readFileSync(checkedSources[4]!.path, 'utf8')
  const richMediaPanelText = readFileSync(resolve(process.cwd(), 'src', 'components', 'RichMediaPanel.tsx'), 'utf8')
  const richMediaPanelSurfaceStateText = readFileSync(resolve(process.cwd(), 'src', 'components', 'useRichMediaPanelSurfaceState.ts'), 'utf8')

  const spacePanGuards = [
    ['D3 overlay interaction hook', d3HookText],
    ['D3 rich media overlay layer', d3LayerText],
    ['Design markdown overlay', designOverlayText],
    ['Design media shell controller', designShellText],
  ] as const
  for (const [label, text] of spacePanGuards) {
    if (!text.includes('if (isSpacePanHeld()) return false')) {
      throw new Error(`expected ${label} to preserve the explicit space-pan header drag guard`)
    }
  }
  if (!flowCanvasOverlayText.includes("const mediaOverlayDragInteractionMode = storyboardWidgetSurfaceRendererMode || storyboardSharedSurfaceRendererMode || canvas2dRenderer === 'flowCanvas'")) {
    throw new Error('expected Flow Canvas media overlay drag ownership to stay renderer-scoped instead of pointer-mode scoped')
  }
  if (!richMediaPanelSurfaceStateText.includes("const isHeaderTarget = !!targetEl?.closest('[data-kg-rich-media-storyboard-widget-header=\"1\"]')")) {
    throw new Error('expected RichMediaPanel header drag to stay scoped to the reusable Storyboard Widget card header')
  }
  if (!designOverlayText.includes("const explicitAnchorId = String(anchorByBlockIdRef.current?.[b.id] || '').trim()")) {
    throw new Error('expected Markdown Design rich-media header drag to distinguish explicit graph anchors from local markdown block ids')
  }
  if (
    !designOverlayText.includes('const delegateHeaderDrag = Boolean(')
    || !designOverlayText.includes('explicitAnchorId !== blockId')
    || !designOverlayText.includes('&& (props.onHeaderDragStart || props.onHeaderDrag || props.onHeaderDragEnd)')
  ) {
    throw new Error('expected Markdown Design rich-media header drag to delegate only when an explicit graph anchor exists')
  }
  if (designOverlayText.includes('const allowDrag = !props.layoutOverride') || designOverlayText.includes('if (!allowDrag) return')) {
    throw new Error('expected Markdown Design rich-media panels to keep local header drag available for unanchored layout-override panels')
  }
  if (
    designOverlayText.includes('onHeaderDragStart={args0 => {\n                if (allowEmbeddedContentInteraction) return')
    || designOverlayText.includes('onHeaderDrag={args0 => {\n                if (allowEmbeddedContentInteraction) return')
    || designOverlayText.includes('onHeaderDragEnd={() => {\n                if (allowEmbeddedContentInteraction) return')
  ) {
    throw new Error('expected Markdown Design rich-media panel header drag to stay available while embedded media content is interactive')
  }
  if (!designOverlayText.includes('blocksRef.current = next') || !designOverlayText.includes('overlayLayoutScheduleRef.current?.()')) {
    throw new Error('expected Markdown Design rich-media local header drag to schedule the shared overlay positioning loop')
  }
  if (
    designOverlayText.includes('const c = getCenter ? getCenter(anchorId) : null')
    || !designOverlayText.includes('const c = explicitAnchorId && explicitAnchorId !== blockId && getCenter ? getCenter(anchorId) : null')
  ) {
    throw new Error('expected Markdown Design rich-media positioning to use graph-node centers only for external anchors')
  }
}

export function testFlowCanvasWheelProxyHonorsWheelIgnoreTargets() {
  const wheelPath = resolve(process.cwd(), 'src', 'components', 'FlowCanvas', 'interactions', 'wheelAndGesture.ts')
  const text = readFileSync(wheelPath, 'utf8')
  if (!text.includes('if (ignoreWheelTarget) return')) {
    throw new Error('expected FlowCanvas overlay wheel proxy to always honor canvas wheel-ignore targets and never zoom canvas from RichMediaPanel scroll surfaces')
  }
  if (!text.includes('shouldKeepWidgetInnerPanelWheel(event, overlayRoot)')) {
    throw new Error('expected FlowCanvas overlay wheel proxy to reuse the shared widget inner-panel scroll guard before canvas zoom')
  }
  const iScrollGuard = text.indexOf('shouldKeepWidgetInnerPanelWheel(event, overlayRoot)')
  const iExplicitZoomIntent = text.indexOf('if (event.ctrlKey === true || event.metaKey === true) return true')
  if (iScrollGuard < 0 || iExplicitZoomIntent < 0 || !(iExplicitZoomIntent < iScrollGuard)) {
    throw new Error('expected explicit ctrl/cmd wheel canvas zoom to override RichMediaPanel/widget scroll surfaces')
  }
  const iNativeHandler = text.indexOf('const handleWheel =')
  const iNativeScrollGuard = text.indexOf('shouldKeepWidgetInnerPanelWheel(e)', iNativeHandler)
  const iNativeWheel = text.indexOf('ctx.viewportWheelController.handleWheel(e)', iNativeHandler)
  if (iNativeHandler < 0 || iNativeScrollGuard < 0 || iNativeWheel < 0 || !(iNativeScrollGuard < iNativeWheel)) {
    throw new Error('expected native canvas wheel handling to reuse the shared widget inner-panel scroll guard before canvas zoom')
  }

  const widgetInnerPanelScrollPath = resolve(process.cwd(), 'src', 'lib', 'canvas', 'widgetInnerPanelScrolling.ts')
  const widgetInnerPanelScrollText = readFileSync(widgetInnerPanelScrollPath, 'utf8')
  if (
    !widgetInnerPanelScrollText.includes('WIDGET_INNER_PANEL_SCROLL_SURFACE_SELECTOR')
    || !widgetInnerPanelScrollText.includes('isWidgetInnerPanelWheelTarget')
    || !widgetInnerPanelScrollText.includes('shouldKeepWidgetInnerPanelWheel')
    || !widgetInnerPanelScrollText.includes('findWidgetInnerPanelSurfaceAtWheelPoint')
    || !widgetInnerPanelScrollText.includes('document.elementFromPoint')
    || !widgetInnerPanelScrollText.includes('document.querySelectorAll(WIDGET_INNER_PANEL_SCROLL_SURFACE_SELECTOR)')
    || !widgetInnerPanelScrollText.includes("return true")
    || !widgetInnerPanelScrollText.includes('allowModifierZoom: false')
  ) {
    throw new Error('expected shared widget inner-panel scrolling utility to consume wheel over RichMediaPanel scroll chrome before canvas zoom')
  }
}

export function testRichMediaOverlayPoolIncludesLoadingStateFromNodeAndConnectedSources() {
  const helperPath = resolve(process.cwd(), 'src', 'lib', 'render', 'richMediaPanelState.ts')
  const overlayPath = resolve(process.cwd(), 'src', 'lib', 'render', 'mediaOverlayPool.ts')
  const text = readFileSync(helperPath, 'utf8')
  const overlayText = readFileSync(overlayPath, 'utf8')
  if (!text.includes('type RichMediaPanelOverlayState = {') && !text.includes('export type RichMediaPanelOverlayState = {')) {
    throw new Error('expected shared rich media panel state helper to define RichMediaPanel overlay state type')
  }
  if (!text.includes('isLoading: boolean')) {
    throw new Error('expected RichMediaPanel overlay state to include shared loading boolean')
  }
  if (!text.includes('loadingLabel: string')) {
    throw new Error('expected RichMediaPanel overlay state to include shared loading label')
  }
  if (!text.includes('readLoadingStateFromNode')) {
    throw new Error('expected shared rich media panel state helper to reuse node loading state helper for panel loading SSOT')
  }
  if (!text.includes("const runSignal = typeof props.lastRunAt === 'string' ? props.lastRunAt.trim() : ''")) {
    throw new Error('expected Rich Media loading SSOT to require a run-scoped lastRunAt signal before showing animated loading state')
  }
  if (!overlayText.includes('buildRichMediaPanelOverlayState({')) {
    throw new Error('expected media overlay pool to reuse the shared Rich Media panel state builder')
  }
}

export function testRichMediaAutoRenderMapsTextConnectionsToOutputSsot() {
  const mapped = resolveRichMediaConnectedRenderSchemaPath({
    schemaPath: 'properties.text',
    connectedValue: {
      value: 'Hello rich media output',
      sources: [{ edgeId: 'e1', nodeId: 'text-widget', portKey: 'output' }],
    },
  })
  if (mapped !== 'properties.output') {
    throw new Error(`expected text connections to map to properties.output SSOT, got ${mapped}`)
  }
}

export function testRichMediaPanelFreezeModeFallsBackToConnectedTextWhenLocalEmpty() {
  const richMediaPanelPath = resolve(process.cwd(), 'src', 'components', 'RichMediaPanel.tsx')
  const text = readFileSync(richMediaPanelPath, 'utf8')
  if (!text.includes('if (panelFreezeConnectedOutput) return panelDraftText || panel.text || panel.connectedText || \'\'')) {
    throw new Error('expected RichMediaPanel freeze text mode to fall back to connected text when local output is empty')
  }
}

export function testRichMediaOverlayPoolTreatsConnectedOutputAsTextPresence() {
  const helperPath = resolve(process.cwd(), 'src', 'lib', 'render', 'richMediaPanelState.ts')
  const text = readFileSync(helperPath, 'utf8')
  if (!text.includes("const connectedText = normalizeConnectedTextValue(connectedValuesBySchemaPath?.['properties.output']?.value)")) {
    throw new Error('expected shared rich media panel state helper to normalize connected output values into text for Rich Media panel state')
  }
  if (!text.includes('hasText: Boolean(text.trim() || outputSrcDoc.trim() || connectedText.trim())')) {
    throw new Error('expected Rich Media panel hasText state to include connected output text presence')
  }
}

export function testBuildDataflowWidgetRegistryMergesPartialDocumentWithFallback() {
  const merged = buildDataflowWidgetRegistry({
    documentWidgetRegistry: [
      { id: 'doc-panel', isEnabled: true, nodeTypeId: 'RichMediaPanel', widgetTypeId: 'default', formId: 'richMediaPanel', fields: [], ports: [], updatedAt: '2026-04-23T00:00:00.000Z' },
    ],
    effectiveWidgetRegistry: [
      { id: 'eff-openai', isEnabled: true, nodeTypeId: 'TextGeneration', widgetTypeId: 'default', formId: 'textGeneration.openai', fields: [], ports: [], updatedAt: '2026-04-23T00:00:00.000Z' },
    ],
    widgetRegistry: [
      { id: 'base-openai', isEnabled: true, nodeTypeId: 'TextGeneration', widgetTypeId: 'default', formId: 'textGeneration.openai', fields: [], ports: [], updatedAt: '2026-04-23T00:00:00.000Z' },
    ],
  })
  const ids = new Set(merged.map(entry => String(entry.id || '').trim()))
  if (!ids.has('doc-panel')) throw new Error('expected merged registry to keep document-scoped entries')
  if (!ids.has('eff-openai')) throw new Error('expected merged registry to include effective fallback entries when document registry is partial')
}

export function testBuildDataflowWidgetRegistryPrefersRicherEntryForSameShapeAcrossSources() {
  const merged = buildDataflowWidgetRegistry({
    documentWidgetRegistry: [
      {
        id: 'doc-openai-incomplete',
        isEnabled: true,
        nodeTypeId: 'TextGeneration',
        widgetTypeId: 'default',
        formId: 'textGeneration.openai',
        fields: [],
        ports: [],
        schemaMappings: [],
        updatedAt: '2026-04-24T10:00:00.000Z',
      },
    ],
    effectiveWidgetRegistry: [
      {
        id: 'eff-openai-rich',
        isEnabled: true,
        nodeTypeId: 'TextGeneration',
        widgetTypeId: 'default',
        formId: 'textGeneration.openai',
        fields: [{ fieldKey: 'prompt', fieldType: 'textarea', schemaPath: 'properties.prompt' }],
        ports: [{ portKey: 'text_out', direction: 'output', schemaPath: 'properties.output' }],
        schemaMappings: [],
        updatedAt: '2026-04-24T09:00:00.000Z',
      },
    ],
    widgetRegistry: [],
  })
  const textOpenAi = merged.filter(entry =>
    String(entry.nodeTypeId || '') === 'TextGeneration'
    && String(entry.widgetTypeId || '') === 'default'
    && String(entry.formId || '') === 'textGeneration.openai',
  )
  if (textOpenAi.length !== 1) throw new Error(`expected one canonical TextGeneration openai entry, got ${textOpenAi.length}`)
  if (String(textOpenAi[0]?.id || '') !== 'eff-openai-rich') {
    throw new Error('expected richer same-shape entry to replace incomplete duplicate across registry sources')
  }
}

export function testBuildDataflowWidgetRegistryReusesSemanticCacheForEquivalentInputs() {
  const buildArgs = (): Parameters<typeof buildDataflowWidgetRegistry>[0] => ({
    documentWidgetRegistry: [
      {
        id: 'doc-openai',
        isEnabled: true,
        nodeTypeId: 'TextGeneration',
        widgetTypeId: 'default',
        formId: 'textGeneration.openai',
        fields: [{ fieldKey: 'prompt', fieldType: 'textarea', schemaPath: 'properties.prompt' }],
        ports: [{ portKey: 'text_out', direction: 'output', schemaPath: 'properties.output' }],
        schemaMappings: [],
        updatedAt: '2026-04-24T10:00:00.000Z',
      },
    ],
    effectiveWidgetRegistry: [
      {
        id: 'eff-image',
        isEnabled: true,
        nodeTypeId: 'ImageGeneration',
        widgetTypeId: 'default',
        formId: 'imageGeneration.default',
        fields: [{ fieldKey: 'prompt', fieldType: 'textarea', schemaPath: 'properties.prompt' }],
        ports: [],
        schemaMappings: [],
        updatedAt: '2026-04-24T09:00:00.000Z',
      },
    ],
    widgetRegistry: [],
  })

  const mergedA = buildDataflowWidgetRegistry(buildArgs())
  const mergedB = buildDataflowWidgetRegistry(buildArgs())
  if (mergedA !== mergedB) {
    throw new Error('expected buildDataflowWidgetRegistry to reuse semantic cache for equivalent registry content')
  }
}
