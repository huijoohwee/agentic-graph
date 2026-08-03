import { useGraphStore } from '@/hooks/useGraphStore'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { buildGraphMetaKeyIgnoringPending } from '@/lib/graph/graphMetaKey'
import type { GraphData } from '@/lib/graph/types'
import {
  buildWorkspaceGraphMutationBlockKey,
  buildWorkspaceGraphMutationTransitionState,
  isWorkspaceGraphMutationBlocked,
} from '@/features/workspace-table/workspaceTableSsot'
import { buildAutoFitToScreenSignature, buildAutoZoomSelectionSignature } from '@/lib/zoom/autoModeSignatures'

export function testWorkspaceGraphMutationTransitionUsesSemanticKeyAndExpiry() {
  const key = buildWorkspaceGraphMutationBlockKey({
    workspaceViewMode: 'canvas',
    workspaceCanvasPaneOpen: false,
    markdownWorkspaceIndexingInFlight: false,
  })
  if (!key) throw new Error('expected workspace graph mutation transition identity to use a semantic key')

  const transition = buildWorkspaceGraphMutationTransitionState({
    workspaceViewMode: 'canvas',
    workspaceCanvasPaneOpen: false,
    markdownWorkspaceIndexingInFlight: false,
    nowMs: 1000,
  })
  if (transition.workspaceGraphMutationBlockKey !== key) {
    throw new Error('expected transition state to reuse the shared semantic workspace graph mutation key')
  }
  const sourceSwitchTransition = buildWorkspaceGraphMutationTransitionState({
    workspaceViewMode: 'canvas',
    workspaceCanvasPaneOpen: false,
    markdownWorkspaceIndexingInFlight: false,
    transitionSemanticKey: 'source:/docs/a.md',
    nowMs: 1000,
  })
  if (sourceSwitchTransition.workspaceGraphMutationBlockKey === key) {
    throw new Error('expected Source Files document switches to key workspace graph mutation guards by source identity')
  }
  if (!isWorkspaceGraphMutationBlocked({
    workspaceViewMode: 'canvas',
    workspaceCanvasPaneOpen: false,
    markdownWorkspaceIndexingInFlight: false,
    workspaceGraphMutationBlockUntilMs: Date.now() + 1000,
    workspaceGraphMutationBlockKey: key,
  })) {
    throw new Error('expected active workspace graph mutation transition to block graph layout writes')
  }
  if (isWorkspaceGraphMutationBlocked({
    workspaceViewMode: 'canvas',
    workspaceCanvasPaneOpen: false,
    markdownWorkspaceIndexingInFlight: false,
    workspaceGraphMutationBlockUntilMs: 1,
    workspaceGraphMutationBlockKey: key,
  })) {
    throw new Error('expected expired workspace graph mutation transition to release graph layout writes')
  }
}

export function testWorkspaceGraphMutationTransitionKeysAutoFitVisibility() {
  const closedKey = buildWorkspaceGraphMutationBlockKey({
    workspaceViewMode: 'canvas',
    workspaceCanvasPaneOpen: false,
    markdownWorkspaceIndexingInFlight: false,
  })
  const openedKey = buildWorkspaceGraphMutationBlockKey({
    workspaceViewMode: 'editor',
    workspaceCanvasPaneOpen: true,
    markdownWorkspaceIndexingInFlight: false,
  })
  const base = {
    nodeCount: 4,
    viewportW: 1000,
    viewportH: 700,
    graphDataRevision: 12,
    schema: null,
    mediaPanelDensity: 'comfortable',
    renderMediaAsNodes: true,
  } as const
  const closedSig = buildAutoFitToScreenSignature({ ...base, visibilityFrameKey: closedKey })
  const openedSig = buildAutoFitToScreenSignature({ ...base, visibilityFrameKey: openedKey })
  if (closedSig === openedSig) {
    throw new Error('expected workspace open/close semantic keys to create distinct auto-fit visibility signatures')
  }
  const storyboardWidgetClosedSig = buildAutoFitToScreenSignature({
    ...base,
    graphDataRevision: 0,
    graphLayoutSignature: 'storyboard-widget-topology-layout',
    visibilityFrameKey: '',
  })
  const storyboardWidgetOpenedSig = buildAutoFitToScreenSignature({
    ...base,
    graphDataRevision: 99,
    graphLayoutSignature: 'storyboard-widget-topology-layout',
    visibilityFrameKey: '',
  })
  if (storyboardWidgetClosedSig !== storyboardWidgetOpenedSig) {
    throw new Error('expected Storyboard Widget auto-fit signatures to ignore output-only revisions and mutation visibility keys')
  }
  const storyboardWidgetSelectionBefore = buildAutoZoomSelectionSignature({
    graphDataRevision: 1,
    graphLayoutSignature: 'storyboard-widget-topology-layout',
    selectedNodeId: 'html_video_mp4_panel',
    selectedEdgeId: null,
  })
  const storyboardWidgetSelectionAfter = buildAutoZoomSelectionSignature({
    graphDataRevision: 2,
    graphLayoutSignature: 'storyboard-widget-topology-layout',
    selectedNodeId: 'html_video_mp4_panel',
    selectedEdgeId: null,
  })
  if (storyboardWidgetSelectionBefore !== storyboardWidgetSelectionAfter) {
    throw new Error('expected Storyboard Widget selection auto-zoom signatures to ignore output-only graph revisions')
  }

  const autoZoomPath = resolve(process.cwd(), 'src', 'features', 'zoom', 'useAutoZoomModes2d.ts')
  const autoZoomText = readFileSync(autoZoomPath, 'utf8')
  if (!autoZoomText.includes("const visibilityFrameKey = graphLayoutSignature ? '' : state.workspaceGraphMutationBlockKey")) {
    throw new Error('expected 2D auto-fit signatures to suppress mutation visibility keys only for Storyboard Widget layout signatures')
  }
  if (!autoZoomText.includes('workspaceGraphMutationBlockKey: s.workspaceGraphMutationBlockKey')) {
    throw new Error('expected 2D auto-fit scheduling to subscribe to workspace graph visibility key changes')
  }

  const threeControlsPath = resolve(process.cwd(), 'src', 'features', 'three', 'Controls.tsx')
  const threeControlsText = readFileSync(threeControlsPath, 'utf8')
  if (!threeControlsText.includes('visibilityFrameKey: workspaceGraphMutationBlockKey')) {
    throw new Error('expected 3D auto-fit signatures to include the shared workspace graph visibility key')
  }
}

export function testWorkspaceCloseTransitionBlocksLayoutCacheMutation() {
  const previous = useGraphStore.getState()
  const previousWorkspaceViewMode = previous.workspaceViewMode
  const previousWorkspaceCanvasPaneOpen = previous.workspaceCanvasPaneOpen
  const previousIndexing = previous.markdownWorkspaceIndexingInFlight
  const previousBlockUntil = previous.workspaceGraphMutationBlockUntilMs
  const previousBlockKey = previous.workspaceGraphMutationBlockKey
  const previousLayoutCache = previous.layoutPositionCacheByMode
  const cacheKey = 'workspace-transition-layout-cache'

  try {
    useGraphStore.setState({
      workspaceViewMode: 'editor',
      workspaceCanvasPaneOpen: true,
      markdownWorkspaceIndexingInFlight: false,
      workspaceGraphMutationBlockUntilMs: 0,
      workspaceGraphMutationBlockKey: '',
      layoutPositionCacheByMode: {},
    } as never)
    useGraphStore.getState().setWorkspaceViewState({ mode: 'canvas', paneOpen: false })
    const afterClose = useGraphStore.getState()
    if (!afterClose.workspaceGraphMutationBlockKey || afterClose.workspaceGraphMutationBlockUntilMs <= Date.now()) {
      throw new Error('expected closing Editor Workspace to stamp a live graph mutation transition guard')
    }
    afterClose.setLayoutPositionsForMode(cacheKey as never, { n1: { x: 10, y: 20 } })
    if (useGraphStore.getState().layoutPositionCacheByMode[cacheKey]) {
      throw new Error('expected workspace close transition to block layout cache writes')
    }

    useGraphStore.setState({
      workspaceGraphMutationBlockUntilMs: 0,
      workspaceGraphMutationBlockKey: '',
    } as never)
    useGraphStore.getState().setLayoutPositionsForMode(cacheKey as never, { n1: { x: 10, y: 20 } })
    if (!useGraphStore.getState().layoutPositionCacheByMode[cacheKey]) {
      throw new Error('expected layout cache writes to resume after workspace transition guard expires')
    }
  } finally {
    useGraphStore.setState({
      workspaceViewMode: previousWorkspaceViewMode,
      workspaceCanvasPaneOpen: previousWorkspaceCanvasPaneOpen,
      markdownWorkspaceIndexingInFlight: previousIndexing,
      workspaceGraphMutationBlockUntilMs: previousBlockUntil,
      workspaceGraphMutationBlockKey: previousBlockKey,
      layoutPositionCacheByMode: previousLayoutCache,
    } as never)
  }
}

export function testRunAllLayoutLockPreservesStoryboardWidgetGeometryDuringGraphCommit() {
  const previous = useGraphStore.getState()
  const previousPatch = {
    workspaceViewMode: previous.workspaceViewMode,
    workspaceCanvasPaneOpen: previous.workspaceCanvasPaneOpen,
    markdownWorkspaceIndexingInFlight: previous.markdownWorkspaceIndexingInFlight,
    workspaceGraphMutationBlockUntilMs: previous.workspaceGraphMutationBlockUntilMs,
    workspaceGraphMutationBlockKey: previous.workspaceGraphMutationBlockKey,
    workspaceGraphMutationLayoutLockActive: previous.workspaceGraphMutationLayoutLockActive,
    canvas2dRenderer: previous.canvas2dRenderer,
    graphData: previous.graphData,
    graphDataRevision: previous.graphDataRevision,
    graphContentRevision: previous.graphContentRevision,
    docLocationRevision: previous.docLocationRevision,
    flowWidgetPinnedByNodeId: previous.flowWidgetPinnedByNodeId,
    flowWidgetPinnedByNodeIdByGraphMetaKey: previous.flowWidgetPinnedByNodeIdByGraphMetaKey,
    flowWidgetPosByNodeId: previous.flowWidgetPosByNodeId,
    flowWidgetPosByNodeIdByGraphMetaKey: previous.flowWidgetPosByNodeIdByGraphMetaKey,
    flowWidgetWorldPosByNodeId: previous.flowWidgetWorldPosByNodeId,
    flowWidgetWorldPosByNodeIdByGraphMetaKey: previous.flowWidgetWorldPosByNodeIdByGraphMetaKey,
  }
  const baseGraph: GraphData = {
    type: 'Graph',
    nodes: [
      { id: 'widgetA', label: 'Widget A', type: 'rich_media_panel', properties: { output: 'before' } },
      { id: 'widgetB', label: 'Widget B', type: 'ComputeWidget', properties: { output: 'before' } },
    ],
    edges: [{ id: 'edgeA', source: 'widgetB', target: 'widgetA' }],
    metadata: { kind: 'frontmatter-flow', source: 'run-all-layout-lock' },
  } as never
  const outputGraph: GraphData = {
    ...baseGraph,
    nodes: [
      { id: 'widgetA', label: 'Widget A', type: 'rich_media_panel', properties: { output: 'after' } },
      { id: 'widgetB', label: 'Widget B', type: 'ComputeWidget', properties: { output: 'after' } },
    ],
    metadata: { kind: 'frontmatter-flow', source: 'run-all-layout-lock', runOutputRevision: 'after' },
  } as never
  const outputGraphKey = buildGraphMetaKeyIgnoringPending(outputGraph)
  const preservedScreen = { widgetA: { top: 10, left: 20 }, widgetB: { top: 210, left: 320 } }
  const preservedWorld = { widgetA: { x: 100, y: 200 }, widgetB: { x: 300, y: 400 } }
  const staleReplayScreen = { widgetA: { top: 900, left: 920 }, widgetB: { top: 930, left: 940 } }
  const staleReplayWorld = { widgetA: { x: 900, y: 920 }, widgetB: { x: 930, y: 940 } }

  try {
    useGraphStore.setState({
      workspaceViewMode: 'canvas',
      workspaceCanvasPaneOpen: false,
      markdownWorkspaceIndexingInFlight: false,
      workspaceGraphMutationBlockUntilMs: 0,
      workspaceGraphMutationBlockKey: '',
      workspaceGraphMutationLayoutLockActive: true,
      canvas2dRenderer: 'storyboard',
      graphData: baseGraph,
      flowWidgetPinnedByNodeId: { widgetA: true, widgetB: false },
      flowWidgetPinnedByNodeIdByGraphMetaKey: {
        [outputGraphKey]: { widgetA: false, widgetB: false },
      },
      flowWidgetPosByNodeId: preservedScreen,
      flowWidgetPosByNodeIdByGraphMetaKey: {
        [outputGraphKey]: staleReplayScreen,
      },
      flowWidgetWorldPosByNodeId: preservedWorld,
      flowWidgetWorldPosByNodeIdByGraphMetaKey: {
        [outputGraphKey]: staleReplayWorld,
      },
    } as never)

    useGraphStore.getState().setGraphData(outputGraph)
    const after = useGraphStore.getState()
    const committedOutput = String(after.graphData?.nodes?.[0]?.properties?.output || '')
    if (committedOutput !== 'after') {
      throw new Error(`expected Run all output graph commit to continue while layout lock is active, got ${committedOutput}`)
    }
    if (after.flowWidgetPinnedByNodeId.widgetA !== true) {
      throw new Error('expected Run all layout lock to preserve Storyboard Widget pin state during graph commit')
    }
    if (after.flowWidgetPosByNodeId.widgetA?.top !== 10 || after.flowWidgetPosByNodeId.widgetA?.left !== 20) {
      throw new Error('expected Run all layout lock to block graph-commit replay of Storyboard Widget screen positions')
    }
    if (after.flowWidgetWorldPosByNodeId.widgetB?.x !== 300 || after.flowWidgetWorldPosByNodeId.widgetB?.y !== 400) {
      throw new Error('expected Run all layout lock to block graph-commit replay of Storyboard Widget world positions')
    }
  } finally {
    useGraphStore.setState(previousPatch as never)
  }
}

export function testRunAllLayoutLockSuppressesAutoZoomUntilMutationGuardReleases() {
  const storyboardWidgetFitBefore = buildAutoFitToScreenSignature({
    nodeCount: 3,
    viewportW: 866,
    viewportH: 962,
    graphDataRevision: 1,
    graphLayoutSignature: 'storyboard-widget-topology-layout',
    schema: null,
    mediaPanelDensity: 'comfortable',
    renderMediaAsNodes: true,
    visibilityFrameKey: '',
  })
  const storyboardWidgetFitAfter = buildAutoFitToScreenSignature({
    nodeCount: 3,
    viewportW: 866,
    viewportH: 962,
    graphDataRevision: 2,
    graphLayoutSignature: 'storyboard-widget-topology-layout',
    schema: null,
    mediaPanelDensity: 'comfortable',
    renderMediaAsNodes: true,
    visibilityFrameKey: '',
  })
  if (storyboardWidgetFitBefore !== storyboardWidgetFitAfter) {
    throw new Error('expected Storyboard Widget auto-fit signatures to ignore output-only Run all revisions and mutation visibility keys')
  }
  const storyboardWidgetSelectionBefore = buildAutoZoomSelectionSignature({
    graphDataRevision: 1,
    graphLayoutSignature: 'storyboard-widget-topology-layout',
    selectedNodeId: 'html_video_mp4_panel',
    selectedEdgeId: null,
  })
  const storyboardWidgetSelectionAfter = buildAutoZoomSelectionSignature({
    graphDataRevision: 2,
    graphLayoutSignature: 'storyboard-widget-topology-layout',
    selectedNodeId: 'html_video_mp4_panel',
    selectedEdgeId: null,
  })
  if (storyboardWidgetSelectionBefore !== storyboardWidgetSelectionAfter) {
    throw new Error('expected Storyboard Widget selection auto-zoom signatures to ignore output-only Run all graph revisions')
  }
  const autoZoomPath = resolve(process.cwd(), 'src', 'features', 'zoom', 'useAutoZoomModes2d.ts')
  const autoZoomText = readFileSync(autoZoomPath, 'utf8')
  if (!autoZoomText.includes("import { isWorkspaceGraphMutationBlocked } from '@/features/workspace-table/workspaceTableSsot'")) {
    throw new Error('expected auto-zoom scheduler to import the shared workspace graph mutation guard')
  }
  if (!autoZoomText.includes('if (isWorkspaceGraphMutationBlocked(state)) return')) {
    throw new Error('expected auto-fit and selection zoom dispatch to stop while Run all holds the shared graph mutation guard')
  }
  if (!autoZoomText.includes("import { buildOverlayTopologyLayoutSignature } from '@/lib/storyboardWidget/overlayTopologyLayoutSignature'")) {
    throw new Error('expected Storyboard Widget auto-fit signatures to reuse the shared topology/layout signature')
  }
  if (!autoZoomText.includes('const graphLayoutSignature = isStoryboardCanvas2dRenderer(state.canvas2dRenderer)')) {
    throw new Error('expected Storyboard Widget auto-fit to ignore output-only graph revisions and key by semantic layout topology')
  }
  if (!autoZoomText.includes("const visibilityFrameKey = graphLayoutSignature ? '' : state.workspaceGraphMutationBlockKey")) {
    throw new Error('expected Storyboard Widget auto-fit to ignore mutation visibility keys when semantic layout topology is stable')
  }
  if (!autoZoomText.includes('graphLayoutSignature,')) {
    throw new Error('expected selection auto-zoom signatures to receive the semantic Storyboard Widget layout signature')
  }
  const storyboardInfiniteZoomPath = resolve(process.cwd(), 'src', 'components', 'StoryboardCanvas', 'useStoryboardInfiniteZoom.ts')
  const storyboardInfiniteZoomText = readFileSync(storyboardInfiniteZoomPath, 'utf8')
  if (!storyboardInfiniteZoomText.includes("import { isWorkspaceEditorOverlayOpen } from '@/features/workspace-table/workspaceTableSsot'")) {
    throw new Error('expected the outer Storyboard surface to share workspace camera ownership state')
  }
  if (!storyboardInfiniteZoomText.includes("import { resolveFlowWidgetStateGraphKey } from '@/lib/storyboardWidget/widgetStateScope'")) {
    throw new Error('expected Storyboard initial fit to share the stable document identity used by Widget and Rich Media layout state')
  }
  if (!storyboardInfiniteZoomText.includes('const storyboardCameraViewKey = React.useMemo(')
    || !storyboardInfiniteZoomText.includes('() => resolveFlowWidgetStateGraphKey({ graphData: args.graphData }) || zoomViewKey')
    || !storyboardInfiniteZoomText.includes('const fitKey = `${storyboardCameraViewKey}:${viewportW}x${viewportH}`')) {
    throw new Error('expected same-document Widget topology growth not to re-arm Storyboard implicit initial fit')
  }
  const workspaceCameraGuardIndex = storyboardInfiniteZoomText.indexOf('if (isWorkspaceEditorOverlayOpen(requestState)) return')
  const implicitInitialFitIndex = storyboardInfiniteZoomText.indexOf("zoomRequest: { type: 'fit', intent: 'fitToView', at: 0 }")
  if (workspaceCameraGuardIndex < 0 || implicitInitialFitIndex < 0 || workspaceCameraGuardIndex > implicitInitialFitIndex) {
    throw new Error('expected the outer Storyboard surface to suppress implicit initial fit before the workspace-owned camera can mutate')
  }
  const signaturePath = resolve(process.cwd(), 'src', 'lib', 'zoom', 'autoModeSignatures.ts')
  const signatureText = readFileSync(signaturePath, 'utf8')
  if (!signatureText.includes('graphLayoutSignature?: string | null')) {
    throw new Error('expected shared auto-fit signatures to accept a semantic graph layout signature')
  }
  if (!signatureText.includes('graphLayoutSignature || graphDataRevision')) {
    throw new Error('expected shared auto-fit signatures to prefer semantic layout signatures over raw graph revisions')
  }
  const runtimeScenePath = resolve(process.cwd(), 'src', 'components', 'StoryboardWidgetCanvas', 'runtime', 'useStoryboardWidgetRuntimeScene.ts')
  const runtimeSceneText = readFileSync(runtimeScenePath, 'utf8')
  if (!runtimeSceneText.includes("reason: 'workspace-blocked-using-last-usable-transform'")) {
    throw new Error('expected Storyboard Widget runtime widgets to keep the last usable zoom transform while Run all blocks graph mutation')
  }
  if (!runtimeSceneText.includes("reason: 'workspace-blocked-rejecting-live-runtime-transform'")) {
    throw new Error('expected Storyboard Widget runtime widgets to reject transient live zoom transforms while Run all blocks graph mutation')
  }
  if (!runtimeSceneText.includes('screenLeft: rect.left') || !runtimeSceneText.includes('screenX: item.x + surfaceOffsetLeft')) {
    throw new Error('expected Storyboard Widget DOM collective recovery to preserve viewport screen coordinates separately from surface-relative bounds')
  }
  const flowRuntimePath = resolve(process.cwd(), 'src', 'components', 'FlowCanvas', 'useFlowCanvasRuntime.ts')
  const flowRuntimeText = readFileSync(flowRuntimePath, 'utf8')
  if (!flowRuntimeText.includes("import { isWorkspaceEditorOverlayOpen, isWorkspaceGraphMutationBlocked } from '@/features/workspace-table/workspaceTableSsot'")) {
    throw new Error('expected native FlowCanvas runtime fit to import the shared workspace graph mutation guard')
  }
  if (!flowRuntimeText.includes('if (storyboardWidgetMode && isWorkspaceGraphMutationBlocked(state)) {')
    || !flowRuntimeText.includes('workspaceEditorOverlayOpen === true && (alreadyInitializedForKey || hasNonIdentityTransform)')
    || !flowRuntimeText.includes('lastInitTransformZoomViewKeyRef.current = initKey')) {
    throw new Error('expected native FlowCanvas runtime fit to stop while preserving only established current-document camera authority during the shared graph mutation guard')
  }
  if (!flowRuntimeText.includes('const initKey = storyboardCameraViewKey') || flowRuntimeText.includes('`storyboardWidget:${zoomViewKey}`')) {
    throw new Error('expected Storyboard Widget init fit and preservation guards to share one stable document/view identity')
  }
  if (flowRuntimeText.includes('const initKey = storyboardWidgetMode ? `storyboardWidget:${storyboardWidgetLayoutSignature}` : zoomViewKey')) {
    throw new Error('expected same-document Storyboard topology growth not to re-arm initial fit')
  }
  const interactionRuntimePath = resolve(process.cwd(), 'src', 'components', 'FlowCanvas', 'FlowCanvasInteractionRuntime.tsx')
  const interactionRuntimeText = readFileSync(interactionRuntimePath, 'utf8')
  if (!interactionRuntimeText.includes("import { isWorkspaceGraphMutationBlocked } from '@/features/workspace-table/workspaceTableSsot'")) {
    throw new Error('expected native FlowCanvas zoom request runtime to import the shared workspace graph mutation guard')
  }
  if (!interactionRuntimeText.includes('if (storyboardWidgetMode && isWorkspaceGraphMutationBlocked(requestState)) {')
    || !interactionRuntimeText.includes("if (!graphActivationFit && zoomRequest.type === 'fit') {")
    || !interactionRuntimeText.includes('Explicit user zoom commands are presentation-only')) {
    throw new Error('expected native FlowCanvas zoom requests to discard blocked source fits instead of firing after graph mutation settles')
  }
  const runAllPath = resolve(process.cwd(), 'src', 'components', 'StoryboardWidgetCanvas', 'runtime', 'useStoryboardWidgetWorkflowRunAll.ts')
  const runAllText = readFileSync(runAllPath, 'utf8')
  if (!runAllText.includes('export const setRunAllLayoutMutationLock = (active: boolean): void =>')) {
    throw new Error('expected Run all layout lock to be shared by toolbar and workflow runtime')
  }
  if (runAllText.includes('storyboard-widget-run-all:release')) {
    throw new Error('expected Run all release to avoid stamping a fresh workspace mutation key that can trigger post-run auto-fit')
  }
  if (!runAllText.includes('if (!active)') || !runAllText.includes('workspaceGraphMutationLayoutLockActive: false')) {
    throw new Error('expected Run all release to clear only the explicit layout lock')
  }
  const runActionPath = resolve(process.cwd(), 'src', 'components', 'StoryboardWidgetCanvas', 'runtime', 'storyboardWidgetWorkflowRunAction.ts')
  const runActionText = readFileSync(runActionPath, 'utf8')
  if (!runActionText.includes('if (!suppressLayoutMutation && activeWorkspacePath && isKgcWorkspaceCompanionPath(activeWorkspacePath))')) {
    throw new Error('expected Run all node execution to skip KGC companion document side effects while layout mutation is locked')
  }
  if (!runActionText.includes('ensureEditorCanvasLandingForDuration(1500)')) {
    throw new Error('expected manual KGC node execution to keep the editor landing behavior')
  }
  if (!runActionText.includes('await state.setActiveMarkdownDocument({')) {
    throw new Error('expected manual KGC companion document switches to finish before graph apply runs')
  }
  if (!runActionText.includes('const ok = await state.applyMarkdownDocumentToGraph(canonicalPath, canonicalText, { force: true })')) {
    throw new Error('expected manual KGC graph apply to preserve canonical document behavior')
  }
  const toolbarPath = resolve(process.cwd(), 'src', 'components', 'Toolbar.tsx')
  const toolbarText = readFileSync(toolbarPath, 'utf8')
  if (!toolbarText.includes("import { setRunAllLayoutMutationLock } from '@/components/StoryboardWidgetCanvas/runtime/useStoryboardWidgetWorkflowRunAll'")) {
    throw new Error('expected Toolbar Run all to reuse the shared Storyboard Widget layout lock helper')
  }
  if (!toolbarText.includes("import { disableAutoZoomModesForUserGesture } from '@/lib/canvas/auto-zoom-modes'")) {
    throw new Error('expected Toolbar Run all to treat Storyboard Widget execution as a user gesture before auto-fit can recompute')
  }
  if (!toolbarText.includes('onPointerDownCapture={() => {') || !toolbarText.includes('primeStoryboardWidgetRunAllLayoutLockFromToolbar()')) {
    throw new Error('expected Toolbar Run all to prime the layout lock before click dispatch')
  }
  if (!toolbarText.includes('data-kg-canvas-pointer-ignore="true"')) {
    throw new Error('expected Toolbar root to advertise the shared canvas pointer-ignore contract')
  }
  const sourceComposePath = resolve(process.cwd(), 'src', 'features', 'source-files', 'applyComposedGraphFromSourceFiles.ts')
  const sourceComposeText = readFileSync(sourceComposePath, 'utf8')
  if (!sourceComposeText.includes('isWorkspaceGraphMutationBlocked') || !sourceComposeText.includes('if (isWorkspaceGraphMutationBlocked(store)) return')) {
    throw new Error('expected composed source-file import modes to skip frontmatter preset replay during workspace graph mutation locks')
  }
  if (!sourceComposeText.includes("import { resolveFlowWidgetStateGraphKey } from '@/lib/storyboardWidget/widgetStateScope'")) {
    throw new Error('expected composed source-file workspace fit to share the Widget/Rich Media document identity')
  }
  if (!sourceComposeText.includes("let lastWorkspaceOpenStoryboardWidgetFitGraphKey = ''")
    || !sourceComposeText.includes('if (!graphKey || graphKey === lastWorkspaceOpenStoryboardWidgetFitGraphKey) return')
    || !sourceComposeText.includes('lastWorkspaceOpenStoryboardWidgetFitGraphKey = graphKey')) {
    throw new Error('expected same-document source recomposition not to request a fresh Storyboard fit after Widget or Rich Media generation')
  }
  const existingDocumentFitSeedIndex = sourceComposeText.indexOf(
    'resolveFlowWidgetStateGraphKey({ graphData: store.graphData })',
  )
  const composedGraphMutationIndex = sourceComposeText.indexOf("if (change === 'order-only')")
  if (existingDocumentFitSeedIndex < 0 || composedGraphMutationIndex < 0 || existingDocumentFitSeedIndex > composedGraphMutationIndex) {
    throw new Error('expected composed source changes to seed Storyboard fit ownership from the existing document before graph replacement')
  }
}

export function testRunAllLayoutLockBlocksWorkspaceFrameMutation() {
  const previous = useGraphStore.getState()
  const previousPatch = {
    workspaceViewMode: previous.workspaceViewMode,
    workspaceCanvasPaneOpen: previous.workspaceCanvasPaneOpen,
    workspaceGraphMutationLayoutLockActive: previous.workspaceGraphMutationLayoutLockActive,
    workspaceGraphMutationBlockUntilMs: previous.workspaceGraphMutationBlockUntilMs,
    workspaceGraphMutationBlockKey: previous.workspaceGraphMutationBlockKey,
  }

  try {
    useGraphStore.setState({
      workspaceViewMode: 'canvas',
      workspaceCanvasPaneOpen: false,
      workspaceGraphMutationLayoutLockActive: true,
      workspaceGraphMutationBlockUntilMs: Date.now() + 1000,
      workspaceGraphMutationBlockKey: 'run-all-layout-lock-workspace-frame',
    } as never)
    const locked = useGraphStore.getState()
    locked.setWorkspaceViewState({ mode: 'editor', paneOpen: true })
    locked.setWorkspaceViewMode('editor')
    locked.setWorkspaceCanvasPaneOpen(true)
    locked.toggleWorkspaceViewMode()
    const afterLockedMutations = useGraphStore.getState()
    if (afterLockedMutations.workspaceViewMode !== 'canvas' || afterLockedMutations.workspaceCanvasPaneOpen !== false) {
      throw new Error('expected Run all layout lock to block workspace view and pane mutations')
    }

    useGraphStore.setState({ workspaceGraphMutationLayoutLockActive: false } as never)
    useGraphStore.getState().setWorkspaceViewState({ mode: 'editor', paneOpen: true })
    const afterRelease = useGraphStore.getState()
    if (afterRelease.workspaceViewMode !== 'editor' || afterRelease.workspaceCanvasPaneOpen !== true) {
      throw new Error('expected workspace view and pane mutations to resume after Run all layout lock releases')
    }
  } finally {
    useGraphStore.setState(previousPatch as never)
  }
}

export function testRendererSwitchTransitionBlocksStoryboardWidgetLayoutMutation() {
  const previous = useGraphStore.getState()
  const previousPatch = {
    canvas2dRenderer: previous.canvas2dRenderer,
    workspaceViewMode: previous.workspaceViewMode,
    workspaceCanvasPaneOpen: previous.workspaceCanvasPaneOpen,
    markdownWorkspaceIndexingInFlight: previous.markdownWorkspaceIndexingInFlight,
    workspaceGraphMutationBlockUntilMs: previous.workspaceGraphMutationBlockUntilMs,
    workspaceGraphMutationBlockKey: previous.workspaceGraphMutationBlockKey,
    flowWidgetPinnedByNodeId: previous.flowWidgetPinnedByNodeId,
    flowWidgetPosByNodeId: previous.flowWidgetPosByNodeId,
    flowWidgetWorldPosByNodeId: previous.flowWidgetWorldPosByNodeId,
    graphData: previous.graphData,
  }

  try {
    useGraphStore.setState({
      canvas2dRenderer: 'storyboard',
      workspaceViewMode: 'canvas',
      workspaceCanvasPaneOpen: false,
      markdownWorkspaceIndexingInFlight: false,
      workspaceGraphMutationBlockUntilMs: 0,
      workspaceGraphMutationBlockKey: '',
      flowWidgetPinnedByNodeId: { widgetA: true },
      flowWidgetPosByNodeId: { widgetA: { top: 10, left: 20 } },
      flowWidgetWorldPosByNodeId: { widgetA: { x: 30, y: 40 } },
      graphData: {
        type: 'Graph',
        nodes: [{ id: 'widgetA', label: 'Widget A', type: 'rich_media_panel' }],
        edges: [],
        metadata: { title: 'Storyboard renderer transition guard' },
      },
    } as never)
    useGraphStore.getState().setCanvas2dRenderer('d3')
    const afterSwitch = useGraphStore.getState()
    if (!afterSwitch.workspaceGraphMutationBlockKey || afterSwitch.workspaceGraphMutationBlockUntilMs <= Date.now()) {
      throw new Error('expected 2D renderer switch to stamp a transient graph mutation guard')
    }
    afterSwitch.setFlowWidgetPinnedByNodeId({ widgetA: false })
    afterSwitch.setFlowWidgetPosByNodeId({ widgetA: { top: 300, left: 400 } })
    afterSwitch.setFlowWidgetWorldPosByNodeId({ widgetA: { x: 500, y: 600 } })
    const blocked = useGraphStore.getState()
    if (blocked.flowWidgetPinnedByNodeId.widgetA !== true) {
      throw new Error('expected renderer transition guard to block Storyboard Widget pin mutation')
    }
    if (blocked.flowWidgetPosByNodeId.widgetA?.top !== 10 || blocked.flowWidgetPosByNodeId.widgetA?.left !== 20) {
      throw new Error('expected renderer transition guard to block Storyboard Widget screen-position mutation')
    }
    if (blocked.flowWidgetWorldPosByNodeId.widgetA?.x !== 30 || blocked.flowWidgetWorldPosByNodeId.widgetA?.y !== 40) {
      throw new Error('expected renderer transition guard to block Storyboard Widget world-position mutation')
    }
  } finally {
    useGraphStore.setState(previousPatch as never)
  }
}

export function testStoryboardWidgetOverlayPositionBypassesHonorWorkspaceMutationGuard() {
  const collisionPath = resolve(process.cwd(), 'src', 'components', 'StoryboardWidgetCanvas', 'runtime', 'useStoryboardWidgetOverlayCollision.ts')
  const collisionText = readFileSync(collisionPath, 'utf8')
  if (!collisionText.includes("import { isWorkspaceEditorOverlayOpen, isWorkspaceGraphMutationBlocked } from '@/features/workspace-table/workspaceTableSsot'")) {
    throw new Error('expected Storyboard Widget overlay collision to import the shared workspace graph mutation guard')
  }
  if (!collisionText.includes('if (isWorkspaceGraphMutationBlocked(useGraphStore.getState())) return')) {
    throw new Error('expected Storyboard Widget overlay collision scheduling to stop during workspace and renderer transitions')
  }
  if (!collisionText.includes('if (isWorkspaceGraphMutationBlocked(st)) return')) {
    throw new Error('expected Storyboard Widget overlay collision direct position commits to honor the workspace mutation guard')
  }
  if (!collisionText.includes('if (isWorkspaceGraphMutationBlocked(prev)) return {}')) {
    throw new Error('expected graph-scoped Storyboard Widget overlay position writes to honor the workspace mutation guard')
  }

  const recenterPath = resolve(process.cwd(), 'src', 'components', 'FlowCanvas', 'storyboardWidgetOverlayRecenter.ts')
  const recenterText = readFileSync(recenterPath, 'utf8')
  if (!recenterText.includes("import { isWorkspaceEditorOverlayOpen, isWorkspaceGraphMutationBlocked } from '@/features/workspace-table/workspaceTableSsot'")) {
    throw new Error('expected Storyboard Widget overlay recenter to import the shared workspace graph mutation guard')
  }
  if (!recenterText.includes('if (isWorkspaceGraphMutationBlocked(st as never)) return')) {
    throw new Error('expected Storyboard Widget overlay recenter to skip lifecycle mutation windows')
  }
  if (!recenterText.includes('if (isWorkspaceGraphMutationBlocked(prev as never)) return {}')) {
    throw new Error('expected graph-scoped overlay recenter writes to honor the workspace mutation guard')
  }
}

export async function testWorkspaceGraphMutationTransitionExpiresStoreState() {
  const previous = useGraphStore.getState()
  const previousPatch = {
    workspaceViewMode: previous.workspaceViewMode,
    workspaceCanvasPaneOpen: previous.workspaceCanvasPaneOpen,
    markdownWorkspaceIndexingInFlight: previous.markdownWorkspaceIndexingInFlight,
    workspaceGraphMutationBlockUntilMs: previous.workspaceGraphMutationBlockUntilMs,
    workspaceGraphMutationBlockKey: previous.workspaceGraphMutationBlockKey,
  }

  try {
    useGraphStore.setState({
      workspaceViewMode: 'canvas',
      workspaceCanvasPaneOpen: false,
      markdownWorkspaceIndexingInFlight: false,
      workspaceGraphMutationBlockUntilMs: Date.now() + 24,
      workspaceGraphMutationBlockKey: 'workspace-transition-expiry-test',
    } as never)
    await new Promise(resolve => setTimeout(resolve, 80))
    const after = useGraphStore.getState()
    if (after.workspaceGraphMutationBlockUntilMs !== 0 || after.workspaceGraphMutationBlockKey !== '') {
      throw new Error('expected expired workspace graph mutation transition state to clear itself so selectors and refs release interaction passthrough')
    }
  } finally {
    useGraphStore.setState(previousPatch as never)
  }
}

export {
  testActiveMarkdownDocumentSwitchStampsMutationGuardWithoutPresetReplay,
} from './workspaceViewActiveDocumentMutationGuard.test'
