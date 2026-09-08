import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { GraphData } from '@/lib/graph/types'
import { buildGraphDocumentMetaKey } from '@/lib/graph/graphMetaKey'
import { buildWidgetLayoutEvidence } from '@/hooks/store/graph-data-slice/graphDataRetainedPlacementContinuity'
import { buildCommittedFlowWidgetState } from '@/hooks/store/graph-data-slice/graphDataWidgetStateCommit'
export function testCollectiveInitializationIndexingAndWorkspaceToggleDoNotMutateBalancedLayoutContracts() {
  const storyboardWidgetPath = resolve(process.cwd(), 'src', 'components', 'StoryboardWidgetCanvas', 'runtime', 'useStoryboardWidgetOverlayCollision.ts')
  const storyboardWidgetText = readFileSync(storyboardWidgetPath, 'utf8')
  if (!storyboardWidgetText.includes('const canDeferUntilMeasuredCollectiveLayout =')) {
    throw new Error('expected Storyboard Widget collective layout to defer rebalance until the full measured collective is ready')
  }
  if (!storyboardWidgetText.includes('overlayMeasurementWarmupStartedAtMsRef')) {
    throw new Error('expected Storyboard Widget collective layout to keep an explicit init-warmup guard against partial overlay measurements')
  }
  if (storyboardWidgetText.includes('workspaceViewSig') || storyboardWidgetText.includes('workspaceViewLayoutRefreshNonce')) {
    throw new Error('expected Storyboard Widget collective layout to stay decoupled from workspace view refresh signatures')
  }
  if (!storyboardWidgetText.includes('storyboardWidgetSurfaceId,')) {
    throw new Error('expected Storyboard Widget collective layout runtime to key collision resolution off the active overlay surface identity')
  }
  if (!storyboardWidgetText.includes('}, [draftGraphDataRef, queryActiveSurfaceOverlays, renderGraphDataOverride, runtimeActive])')) {
    throw new Error('expected Storyboard Widget collective layout subscriptions to rebind through the active overlay surface query')
  }

  const storyboardWidgetCanvasSurfacePath = resolve(process.cwd(), 'src', 'components', 'StoryboardWidgetCanvas', 'runtime', 'StoryboardWidgetCanvasSurface.tsx')
  const storyboardWidgetCanvasSurfaceText = readFileSync(storyboardWidgetCanvasSurfacePath, 'utf8')
  const storyboardSharedSurfacePanPath = resolve(process.cwd(), 'src', 'components', 'StoryboardWidgetCanvas', 'runtime', 'useStoryboardSharedSurfacePan.ts')
  const storyboardSharedSurfacePanText = readFileSync(storyboardSharedSurfacePanPath, 'utf8')
  const flowCanvasPointerDownPath = resolve(process.cwd(), 'src', 'components', 'FlowCanvas', 'interactions', 'pointerDown.ts')
  const flowCanvasPointerDownText = readFileSync(flowCanvasPointerDownPath, 'utf8')
  const flowCanvasPointerMovePath = resolve(process.cwd(), 'src', 'components', 'FlowCanvas', 'interactions', 'pointerMove.ts')
  const flowCanvasPointerMoveText = readFileSync(flowCanvasPointerMovePath, 'utf8')
  const flowCanvasPointerTypesPath = resolve(process.cwd(), 'src', 'components', 'FlowCanvas', 'interactions', 'types.ts')
  const flowCanvasPointerTypesText = readFileSync(flowCanvasPointerTypesPath, 'utf8')
  const flowCanvasListenersPath = resolve(process.cwd(), 'src', 'components', 'FlowCanvas', 'interactions', 'listeners.ts')
  const flowCanvasListenersText = readFileSync(flowCanvasListenersPath, 'utf8')
  const flowCanvasWheelPath = resolve(process.cwd(), 'src', 'components', 'FlowCanvas', 'interactions', 'wheelAndGesture.ts')
  const flowCanvasWheelText = readFileSync(flowCanvasWheelPath, 'utf8')
  if (!storyboardWidgetCanvasSurfaceText.includes('useStoryboardSharedSurfacePan({')) {
    throw new Error('expected Storyboard Widget canvas surface to reuse the shared Card/Widget pan owner')
  }
  if (!storyboardSharedSurfacePanText.includes('readStoryboardWidgetScreenAuthorityPanSnapshot')
    || !storyboardSharedSurfacePanText.includes('applyStoryboardWidgetScreenAuthorityPanSnapshot')) {
    throw new Error('expected shared Storyboard Card/Widget pan owner to use the screen-authority collective pan helpers')
  }
  if (!storyboardSharedSurfacePanText.includes('const storyboardWidgetOverlayInteractionMode = shouldUseStoryboardWidgetScreenAuthorityCollectivePan(state)')) {
    throw new Error('expected shared Storyboard Card/Widget pan owner to activate through the shared Storyboard Widget screen-authority predicate')
  }
  if (!flowCanvasPointerTypesText.includes('useStoryboardWidgetScreenAuthorityPan?: boolean')) {
    throw new Error('expected native Storyboard Widget canvas pan sessions to carry a captured screen-authority predicate result')
  }
  if (!flowCanvasPointerDownText.includes('const createPanDrag = (): Extract<NonNullable<FlowCanvasDrag>, { type: \'pan\' }> => {')
    || !flowCanvasPointerDownText.includes('shouldUseStoryboardWidgetScreenAuthorityCollectivePan(storeStateAtDown)')
    || !flowCanvasPointerDownText.includes('readStoryboardWidgetScreenAuthorityPanSnapshot({')) {
    throw new Error('expected native Storyboard Widget canvas pan to capture the shared collective screen-authority snapshot at pointerdown')
  }
  if (!flowCanvasPointerMoveText.includes('drag.useStoryboardWidgetScreenAuthorityPan === true')
    || flowCanvasPointerMoveText.includes('shouldUseStoryboardWidgetScreenAuthorityCollectivePan(state)')
    || flowCanvasPointerMoveText.includes('useGraphStore.getState()')) {
    throw new Error('expected native Storyboard Widget canvas pan pointermove to apply the captured screen-authority session without rereading store mode')
  }
  if (!flowCanvasListenersText.includes('isStoryboardWidgetSurfaceRenderer(st.canvas2dRenderer) && shouldUseStoryboardWidgetScreenAuthorityCollectivePan(st)')
    || !flowCanvasListenersText.includes('readStoryboardWidgetScreenAuthorityPanSnapshot({')
    || !flowCanvasListenersText.includes('useStoryboardWidgetScreenAuthorityPan: pending.useStoryboardWidgetScreenAuthorityPan')
    || flowCanvasListenersText.includes('isStoryboardWidgetFrontmatterDocumentModeRequested')) {
    throw new Error('expected overlay proxy pan to reuse the shared Storyboard Widget screen-authority predicate and capture the snapshot at pan start')
  }
  if (!flowCanvasWheelText.includes('const storyboardWidgetOverlayInteractionMode = shouldUseStoryboardWidgetScreenAuthorityCollectivePan(st)')
    || !flowCanvasWheelText.includes('if (!storyboardWidgetOverlayInteractionMode) return')) {
    throw new Error('expected Storyboard Widget overlay wheel and gesture proxying to reuse the shared collective screen-authority predicate')
  }
  const sharedPanFragments = ["window.addEventListener('pointerdown', onPointerDown, { passive: false, capture: true })", "window.addEventListener('mousedown', onPointerDown, { passive: false, capture: true })", "window.addEventListener('mousemove', onPointerMove, { passive: false, capture: true })", 'CANVAS_OVERLAY_PROXY_ROOT_SELECTOR', 'shouldUseCanvasOverlayBodyPan', 'CANVAS_OVERLAY_DRAG_HANDLE_SELECTOR', 'CANVAS_OVERLAY_RESIZE_HANDLE_SELECTOR']
  if (sharedPanFragments.some(fragment => !storyboardSharedSurfacePanText.includes(fragment))) {
    throw new Error('expected shared Storyboard Card/Widget pan owner to install guarded overlay-body pointer/mouse listeners for collective pan')
  }
  if (storyboardSharedSurfacePanText.includes('!target || !surfaceRoot.contains(target)')) {
    throw new Error('expected Storyboard Widget collective pan to accept portaled overlay roots by surface id instead of surface DOM ancestry')
  }
  const widgetPlacementText = readFileSync(resolve(process.cwd(), 'src', 'components', 'StoryboardWidget', 'useWidgetPlacementRuntime.ts'), 'utf8')
  if (!widgetPlacementText.includes('STORYBOARD_WIDGET_SCREEN_AUTHORITY_COLLECTIVE_PAN_EVENT')
    || widgetPlacementText.includes('if (!active || !floatingUsesScreenAuthority || !nodeId')) {
    throw new Error('expected Storyboard Widget overlay placement runtime to apply collective pan events for rich-media and widget overlays, not floating-only widgets')
  }
  const screenAuthorityPanText = readFileSync(resolve(process.cwd(), 'src', 'lib', 'storyboardWidget', 'screenAuthorityCollectivePan.ts'), 'utf8')
  const vectorPaintedOverlayProjectionText = readFileSync(resolve(process.cwd(), 'src', 'lib', 'canvas', 'vectorPaintedOverlayProjection.ts'), 'utf8')
  if (!screenAuthorityPanText.includes('applyScreenAuthorityPanDomPositions')
    || !screenAuthorityPanText.includes('queryStoryboardWidgetOverlayRootsForSurface')
    || !vectorPaintedOverlayProjectionText.includes('const nextTransform = `matrix(')
    || !vectorPaintedOverlayProjectionText.includes('el.style.transform = nextTransform')) {
    throw new Error('expected shared screen-authority pan helper to apply surface-scoped DOM transforms for rich-media roots as well as store persistence')
  }
  if (!screenAuthorityPanText.includes('export function shouldUseStoryboardWidgetScreenAuthorityCollectivePan')
    || !screenAuthorityPanText.includes('isStoryboardWidgetSurfaceRenderer(canvas2dRenderer)')
    || !screenAuthorityPanText.includes('isStoryboardWidgetFrontmatterDocumentModeRequested({')) {
    throw new Error('expected shared screen-authority pan helper to include shared Storyboard Widget surfaces and frontmatter Storyboard Widget in one predicate')
  }

  const mediaLoopPath = resolve(process.cwd(), 'src', 'lib', 'render', 'mediaOverlayLayoutLoop2d.ts')
  const mediaLoopText = readFileSync(mediaLoopPath, 'utf8')
  if (!mediaLoopText.includes('const canDeferUntilCollectiveCentersStabilize =')) {
    throw new Error('expected frontmatter Rich Media collective layout to defer rebalance until collective centers are ready')
  }
  if (!mediaLoopText.includes('collectiveCenterWarmupStartedAtMs')) {
    throw new Error('expected Rich Media collective layout loop to keep an explicit center warmup guard')
  }

  const storyboardWidgetSurfacePath = resolve(process.cwd(), 'src', 'components', 'StoryboardWidgetCanvas', 'runtime', 'useStoryboardWidgetOverlaySurface.tsx')
  const storyboardWidgetSurfaceText = readFileSync(storyboardWidgetSurfacePath, 'utf8')
  if (!storyboardWidgetSurfaceText.includes('const workspaceMutationBlocked = useGraphStore(s => isWorkspaceGraphMutationBlocked(s))')) {
    throw new Error('expected Storyboard Widget overlay surface to subscribe to shared workspace mutation state for transient visibility hold')
  }
  if (!storyboardWidgetSurfaceText.includes('if (workspaceMutationBlocked && lastStable.length > 0) return lastStable')) {
    throw new Error('expected Storyboard Widget overlay ids to reuse last stable ids when storyboardWidgetViewActive is transiently false during workspace mutation windows')
  }
  if (!storyboardWidgetSurfaceText.includes('const overlayVisibilityActive = React.useMemo(() => {')) {
    throw new Error('expected Storyboard Widget overlay surface to derive one shared overlay visibility authority for active and workspace-passthrough frames')
  }
  if (!storyboardWidgetSurfaceText.includes('return storyboardWidgetViewActive || (workspaceOverlayOpen && overlayEditorNodeIds.length > 0)')) {
    throw new Error('expected Storyboard Widget overlay visibility authority to keep overlays active during workspace-open frames')
  }
  if (!storyboardWidgetSurfaceText.includes('return buildOverlayEditorElements({') || !storyboardWidgetSurfaceText.includes('overlayVisibilityActive,')) {
    throw new Error('expected Storyboard Widget overlays to render from the shared overlay visibility authority during workspace-open frames')
  }
  if (!storyboardWidgetSurfaceText.includes('const workspaceOverlayOpen = useGraphStore(s => isWorkspaceEditorOverlayOpen(s))')) {
    throw new Error('expected Storyboard Widget overlay surface to derive overlay visibility from the actual workspace overlay state')
  }
  if (storyboardWidgetSurfaceText.includes('workspaceInteractionPassthrough')) {
    throw new Error('expected Storyboard Widget overlay surface to remove stale interaction passthrough wiring')
  }
  if (!storyboardWidgetSurfaceText.includes('|| (workspaceOverlayOpen && overlayEditorNodeIds.length > 0)')) {
    throw new Error('expected Storyboard Widget overlay surface hasOverlayEditors guard to keep overlay layers mounted during workspace-open frames')
  }
  const storyboardWidgetSurfaceElementsPath = resolve(process.cwd(), 'src', 'components', 'StoryboardWidgetCanvas', 'runtime', 'storyboardWidgetOverlaySurfaceElements.tsx'); const storyboardWidgetSurfaceElementsText = readFileSync(storyboardWidgetSurfaceElementsPath, 'utf8')
  if (!storyboardWidgetSurfaceElementsText.includes('if (!args.overlayVisibilityActive) return []')) {
    throw new Error('expected Storyboard Widget overlay surface to keep widget overlay elements mounted from the shared visibility authority')
  }
  if (
    !storyboardWidgetSurfaceText.includes('return overlayVisibilityActive && (') ||
    !storyboardWidgetSurfaceText.includes('renderGraphPlacementContext?.isFrontmatterFlow === true') ||
    !storyboardWidgetSurfaceText.includes('|| isFrontmatterFlowGraph(frontmatterOverlayAuthorityGraphData)')
  ) {
    throw new Error('expected frontmatter rich-media coverage to stay active while workspace visibility keeps overlays visible')
  }
  const storyboardWidgetSurfaceVisibilityPath = resolve(process.cwd(), 'src', 'components', 'StoryboardWidgetCanvas', 'runtime', 'storyboardWidgetOverlaySurfaceVisibility.ts'); const storyboardWidgetSurfaceVisibilityText = readFileSync(storyboardWidgetSurfaceVisibilityPath, 'utf8')
  if (!storyboardWidgetSurfaceVisibilityText.includes('const baseActive = overlayVisibilityActive && (hasOverlayEditors || Boolean(geospatialWidgetPanelMode))')) {
    throw new Error('expected overlay-only authority to reuse the shared overlay visibility guard during workspace passthrough')
  }
  if (!storyboardWidgetSurfaceElementsText.includes("import { resolveGraphNodeByCanonicalId } from '@/lib/graph/canonicalNodeIds'")) {
    throw new Error('expected Storyboard Widget overlay surface node resolution to reuse shared canonical node-id helper')
  }
  if (!storyboardWidgetSurfaceText.includes('const lastStableRenderGraphDataOverrideRef = React.useRef<GraphData | null>(renderGraphDataOverride)')) {
    throw new Error('expected Storyboard Widget overlay surface to cache the last stable non-empty render graph for transient workspace recomposition windows')
  }
  if (
    !storyboardWidgetSurfaceText.includes('if (!renderGraphDataOverride || nodeCount <= 0) return')
    || !storyboardWidgetSurfaceText.includes('lastStableRenderGraphDataOverrideRef.current = renderGraphDataOverride')
  ) {
    throw new Error('expected Storyboard Widget overlay surface to refresh last stable render graph cache only from non-empty graph frames')
  }
  if (!storyboardWidgetSurfaceText.includes('const workspaceMutationBlocked = useGraphStore(s => isWorkspaceGraphMutationBlocked(s))')) {
    throw new Error('expected Storyboard Widget overlay id selection to derive workspace mutation-blocked state via shared guard')
  }
  if (!storyboardWidgetSurfaceText.includes('if (lastStable.length > 0 && (sameGraphAsLastStable || workspaceMutationBlocked || nodes.length === 0)) return lastStable')) {
    throw new Error('expected frontmatter overlay ids to reuse last stable ids during workspace mutation or transient empty-node frames to prevent flash-missing')
  }
  if (!storyboardWidgetSurfaceText.includes('if (workspaceMutationBlocked && lastStable.length > 0) return lastStable')) {
    throw new Error('expected frontmatter graph-available fallback to reuse last stable overlay ids while workspace mutation is blocked')
  }
  if (!storyboardWidgetSurfaceText.includes("import { isWorkspaceEditorOverlayOpen, isWorkspaceGraphMutationBlocked } from '@/features/workspace-table/workspaceTableSsot'")) {
    throw new Error('expected Storyboard Widget overlay surface initialization to reuse the shared workspace/indexing mutation guard')
  }
  if (!storyboardWidgetSurfaceText.includes('if (isWorkspaceGraphMutationBlocked(st)) return')) {
    throw new Error('expected Storyboard Widget overlay surface pin seeding to skip while Workspace/Indexing overlay is open')
  }
  if (!storyboardWidgetSurfaceText.includes('const connectedValuesGraphRevision = args.storyboardWidgetViewActive ? args.draftGraphDataRevision : args.baseGraphDataRevision')) {
    throw new Error('expected Storyboard Widget overlay connected-values cache to use the active draft/render graph revision')
  }
  if (!storyboardWidgetSurfaceText.includes('const lastStableOverlayEditorNodeIdsGraphKeyRef = React.useRef<string>(\'\')')) {
    throw new Error('expected Storyboard Widget overlay id stability to track the semantic graph key of last stable frontmatter overlay ids')
  }
  if (!storyboardWidgetSurfaceText.includes('const sameGraphAsLastStable = lastStableOverlayEditorNodeIdsGraphKeyRef.current === renderGraphSemanticKey')) {
    throw new Error('expected frontmatter overlay id fallback to only reuse last stable ids when semantic graph key remains unchanged')
  }
  if (!storyboardWidgetSurfaceText.includes('if (lastStable.length > 0 && (sameGraphAsLastStable || workspaceMutationBlocked || nodes.length === 0)) return lastStable')) {
    throw new Error('expected frontmatter overlay id fallback to avoid transient empty-id unmount flicker without cross-graph stale reuse')
  }
  if (!storyboardWidgetSurfaceElementsText.includes('const canonicalMatch = resolveGraphNodeByCanonicalId(args.renderGraphDataOverride, id)')) {
    throw new Error('expected Storyboard Widget overlay node resolver to recover transient composed/canonical id mismatches without close-reopen')
  }
  if (!storyboardWidgetSurfaceElementsText.includes('const stableCanonicalMatch = resolveGraphNodeByCanonicalId(args.lastStableRenderGraphDataOverride, id)')) {
    throw new Error('expected Storyboard Widget overlay node resolver to reuse last stable render graph canonical lookup during transient live-graph gaps')
  }
  if (!storyboardWidgetSurfaceVisibilityText.includes('const frontmatterFlowOwnedNodeIds =')) {
    throw new Error('expected Storyboard Widget frontmatter graph exclusion to derive owned visual nodes before FlowCanvas rendering')
  }
  if (!storyboardWidgetSurfaceVisibilityText.includes('excludedNodeIds: frontmatterFlowOwnedNodeIds')) {
    throw new Error('expected Storyboard Widget frontmatter graph exclusion to use upstream graph partitioning instead of coverage-gated suppression')
  }

  const flowCanvasMediaPath = resolve(process.cwd(), 'src', 'components', 'FlowCanvas', 'FlowCanvasMediaOverlays.tsx')
  const flowCanvasMediaText = readFileSync(flowCanvasMediaPath, 'utf8')
  if (!flowCanvasMediaText.includes('mediaLayoutItemIdsKey')) {
    throw new Error('expected frontmatter collective scheduling to key off active media layout items instead of workspace view toggles')
  }
  if (flowCanvasMediaText.includes('workspaceViewSig') || flowCanvasMediaText.includes('workspaceViewLayoutRefreshNonce')) {
    throw new Error('expected frontmatter collective scheduling to stay decoupled from workspace view refresh signatures')
  }

  const a: GraphData = { type: 'Graph', nodes: ['TextGeneration', 'ImageGeneration', 'VideoGeneration', 'RichMediaPanel']
    .map((type, i) => ({ id: `n${i}`, label: type, type, x: (i % 2) * 200, y: Math.floor(i / 2) * 200, properties: {} })), edges: [],
    metadata: { kind: 'frontmatter-flow', source: 'workspace:/collective-a.md' } }
  const key = buildGraphDocumentMetaKey(a), layout = buildWidgetLayoutEvidence(a)!
  const pinned = Object.fromEntries(a.nodes.map(node => [node.id, false]))
  const pos = Object.fromEntries(a.nodes.map((node, i) => [node.id, { top: 140 + Math.floor(i / 2) * 620, left: 240 + (i % 2) * 480 }]))
  const world = Object.fromEntries(a.nodes.map((node, i) => [node.id, { x: 10 + i, y: 20 + i }]))
  const state: Parameters<typeof buildCommittedFlowWidgetState>[0]['state'] = { graphData: a,
    flowWidgetLayoutEvidenceByGraphMetaKey: { [key]: layout },
    flowWidgetPinnedByNodeId: pinned, flowWidgetPinnedByNodeIdByGraphMetaKey: { [key]: pinned },
    flowWidgetPosByNodeId: pos, flowWidgetPosByNodeIdByGraphMetaKey: { [key]: pos },
    flowWidgetWorldPosByNodeId: world, flowWidgetWorldPosByNodeIdByGraphMetaKey: { [key]: world } }
  const before = JSON.stringify(state)
  const recomposed = { ...a, nodes: a.nodes.map(node => ({ ...node, x: node.x! + 640, y: node.y! + 320 })),
    metadata: { ...a.metadata, sourceLayerHash: 'recomposed' } }
  const blocked = buildCommittedFlowWidgetState({ state, graphData: recomposed, workspaceGraphMutationBlocked: true })
  if (Object.keys(blocked).length || JSON.stringify(state) !== before) {
    throw new Error('expected workspace/indexing mutation guards to leave all balanced placement and cache authority untouched')
  }
  const sameDocument = buildCommittedFlowWidgetState({ state, graphData: recomposed, workspaceGraphMutationBlocked: false })
  if (JSON.stringify(sameDocument.flowWidgetPinnedByNodeId) !== JSON.stringify(pinned)
    || JSON.stringify(sameDocument.flowWidgetPosByNodeId) !== JSON.stringify(pos)
    || JSON.stringify(sameDocument.flowWidgetWorldPosByNodeId) !== JSON.stringify(world)) {
    throw new Error('expected same-document recomposition to retain the complete balanced floating collective')
  }
  const switched = buildCommittedFlowWidgetState({ state,
    graphData: { ...recomposed, metadata: { ...recomposed.metadata, source: 'workspace:/collective-b.md' } },
    workspaceGraphMutationBlocked: false })
  if ([switched.flowWidgetPinnedByNodeId, switched.flowWidgetPosByNodeId, switched.flowWidgetWorldPosByNodeId]
    .some(value => !value || Object.keys(value).length) || JSON.stringify(state) !== before) {
    throw new Error('expected a source-document switch to withhold the other document placement while preserving its cached bytes')
  }

  const interactionRuntimePath = resolve(process.cwd(), 'src', 'components', 'FlowCanvas', 'FlowCanvasInteractionRuntime.tsx')
  const interactionRuntimeText = readFileSync(interactionRuntimePath, 'utf8')
  const interactionGuardIndex = interactionRuntimeText.indexOf('if (workspaceMutationBlocked) return')
  const interactionBlockedSelectorIndex = interactionRuntimeText.indexOf('isWorkspaceGraphMutationBlocked({')
  const interactionApplyIndex = interactionRuntimeText.indexOf('applyZoomRequestNative({')
  if (
    interactionApplyIndex < 0
  ) {
    throw new Error('expected FlowCanvas interaction runtime to route zoom requests through native zoom application')
  }
  if (interactionGuardIndex >= 0 || interactionBlockedSelectorIndex >= 0) {
    throw new Error('expected FlowCanvas interaction runtime zoom handling to avoid workspace mutation-block gating so manual zoom actions always function')
  }
  if (interactionRuntimeText.includes('useGraphStore.getState().clearZoomRequest()')) {
    throw new Error('expected FlowCanvas interaction runtime to avoid discarding zoom requests before native zoom application')
  }

  const uiModeActionsPath = resolve(process.cwd(), 'src', 'hooks', 'store', 'uiSettingsSliceModeActions.ts')
  const uiModeActionsText = readFileSync(uiModeActionsPath, 'utf8')
  if (
    !uiModeActionsText.includes("nextEnabled && state.canvasRenderMode === '2d' && state.canvas2dRenderer !== 'storyboard'") ||
    !uiModeActionsText.includes("nextEnabled && nextCanvasRenderMode === '2d' && nextCanvas2dRenderer !== 'storyboard'")
  ) {
    throw new Error('expected workspace mode actions to avoid emitting fit-to-view zoom requests when Storyboard is the active 2D renderer')
  }

  const anchorPath = resolve(process.cwd(), 'src', 'components', 'StoryboardWidgetCanvas', 'runtime', 'useStoryboardWidgetSurfaceAnchors.ts')
  const anchorText = readFileSync(anchorPath, 'utf8')
  if (!anchorText.includes("import { resolveCanvasViewportMeasureElement } from '@/lib/canvas/viewportMeasureElement'") || !anchorText.includes('return resolveCanvasViewportMeasureElement(args.rootRef.current)')) {
    throw new Error('expected Storyboard Widget surface anchors to resolve canvas window offset from the canonical canvas viewport root')
  }
  if (!anchorText.includes('const resolveCanonicalCanvasWindowOffset = React.useCallback((fallbackRect?: Pick<DOMRect, \'left\' | \'top\'> | null) => {')) {
    throw new Error('expected Storyboard Widget surface anchors to centralize canonical canvas window offset resolution in a shared helper')
  }
  if (!anchorText.includes('const anchorRect = anchorEl?.getBoundingClientRect() || fallbackRect || null')) {
    throw new Error('expected Storyboard Widget surface anchors to prefer canonical viewport-root rects over transient inner-surface rects')
  }
  if (!anchorText.includes('const { left, top } = resolveCanonicalCanvasWindowOffset()')) {
    throw new Error('expected Storyboard Widget surface anchors to measure window offset through the shared canonical anchor-offset resolver')
  }
  if (!anchorText.includes('const { left, top } = resolveCanonicalCanvasWindowOffset(rect)')) {
    throw new Error('expected Storyboard Widget surface anchor writes to normalize caller-provided rects through the canonical viewport-root offset helper')
  }
  if (anchorText.includes('const left = Number.isFinite(args.containerLeft) ? args.containerLeft : 0')) {
    throw new Error('expected Storyboard Widget surface anchors to avoid overriding canonical window offset from transient containerLeft coordinates')
  }
  if (anchorText.includes('const top = Number.isFinite(args.containerTop) ? args.containerTop : 0')) {
    throw new Error('expected Storyboard Widget surface anchors to avoid overriding canonical window offset from transient containerTop coordinates')
  }
  if (anchorText.includes('const el = args.rootRef.current')) {
    throw new Error('expected Storyboard Widget surface anchors to avoid measuring raw rootRef coordinates directly during workspace toggles')
  }
}

export function testD3SceneBuildKeyIgnoresWorkspaceGestureOverlayToggles() {
  const helperPath = resolve(process.cwd(), 'src', 'components', 'GraphCanvasRoot', 'utils', 'd3SceneSetupContext.ts')
  const helperText = readFileSync(helperPath, 'utf8')
  if (!helperText.includes('const buildKey = [')) {
    throw new Error('expected D3 scene setup helper to centralize the D3 scene build key')
  }
  if (helperText.includes('String(args.enableEditorGestures ? 1 : 0)')) {
    throw new Error('expected D3 scene build key to ignore workspace/panel gesture gating so layout does not rebuild on overlay toggles')
  }
  if (helperText.includes('sceneWidth') || helperText.includes('sceneHeight')) {
    throw new Error('expected D3 scene setup helper to keep viewport dimensions out of the scene rebuild key')
  }
  if (helperText.includes('roundedCoordinateKey') || helperText.includes('{ x?: unknown }') || helperText.includes('{ y?: unknown }')) {
    throw new Error('expected D3 scene shape key to ignore mutable runtime coordinates so force-layout ticks do not rebuild the scene')
  }
  if (!helperText.includes("String(props['visual:shape'] || '')") || !helperText.includes("String(props['visual:parentId'] || '')")) {
    throw new Error('expected D3 scene shape key to retain semantic node shape and group-parent identity')
  }
  if (!helperText.includes('String(args.infiniteCanvasInteractionMode)')) {
    throw new Error('expected D3 scene build key to keep interaction-mode semantics while excluding overlay gesture toggles')
  }
  const hookPath = resolve(process.cwd(), 'src', 'components', 'GraphCanvasRoot', 'hooks', 'useD3GraphScene2d.ts')
  const hookText = readFileSync(hookPath, 'utf8')
  if (!hookText.includes('const workspaceViewMode = useGraphStore(s => s.workspaceViewMode)')) {
    throw new Error('expected D3 scene hook to scope reactive dependencies to workspace view mode only')
  }
  if (hookText.includes('workspaceCanvasPaneOpen } = useGraphStore(')) {
    throw new Error('expected D3 scene hook to avoid subscribing scene rebuilds to workspaceCanvasPaneOpen toggle churn')
  }
  if (!hookText.includes('const workspaceOverlayOpenRef = useRef(false)')) {
    throw new Error('expected D3 scene hook to track workspace overlay-open state through a non-reactive ref')
  }
  const sceneSetupCallStart = hookText.indexOf('const sceneSetup = buildD3SceneSetupContext({')
  const sceneSetupCallEnd = sceneSetupCallStart >= 0 ? hookText.indexOf('    })', sceneSetupCallStart) : -1
  const sceneSetupCall = sceneSetupCallStart >= 0 && sceneSetupCallEnd > sceneSetupCallStart
    ? hookText.slice(sceneSetupCallStart, sceneSetupCallEnd)
    : ''
  if (!sceneSetupCall) {
    throw new Error('expected D3 scene hook to build setup context through the shared helper')
  }
  if (sceneSetupCall.includes('sceneWidth') || sceneSetupCall.includes('sceneHeight')) {
    throw new Error('expected D3 scene hook to keep viewport dimensions out of scene setup rebuild inputs')
  }
  if (!hookText.includes('s => s.workspaceViewMode')) {
    throw new Error('expected D3 scene hook overlay-open subscription to listen only to workspaceViewMode')
  }
  if (hookText.includes('s => [s.workspaceCanvasPaneOpen, s.workspaceViewMode] as const')) {
    throw new Error('expected D3 scene hook overlay-open subscription to avoid workspaceCanvasPaneOpen tuple churn')
  }
  if (!hookText.includes('const enableEditorGestures = workspaceViewMode === \'editor\'')) {
    throw new Error('expected D3 scene hook to keep pane-open overlay toggles outside scene rebuild keys')
  }
  const presentationHookPath = resolve(process.cwd(), 'src', 'components', 'GraphCanvasRoot', 'hooks', 'useD3PresentationUpdates2d.ts')
  const presentationHookText = readFileSync(presentationHookPath, 'utf8')
  if (presentationHookText.includes('workspaceCanvasPaneOpen } = useGraphStore(')) {
    throw new Error('expected D3 presentation hook to avoid reacting to workspaceCanvasPaneOpen toggle churn')
  }
  if (!presentationHookText.includes('const workspaceOverlayOpenRef = useRef(false)')) {
    throw new Error('expected D3 presentation hook to use shared overlay-open refs instead of reactive pane-open subscriptions')
  }
  if (!presentationHookText.includes('s => s.workspaceViewMode')) {
    throw new Error('expected D3 presentation hook overlay-open subscription to listen only to workspaceViewMode')
  }
  if (presentationHookText.includes('s => [s.workspaceCanvasPaneOpen, s.workspaceViewMode] as const')) {
    throw new Error('expected D3 presentation hook overlay-open subscription to avoid workspaceCanvasPaneOpen tuple churn')
  }
  if (!presentationHookText.includes('const enableEditorGestures = workspaceViewMode === \'editor\'')) {
    throw new Error('expected D3 presentation hook to keep gesture-gating independent from workspace pane open/close toggles')
  }
}

export {
  testStoryboardWidgetOverlayFitNormalizesSurfaceWindowOffset,
} from './workspaceViewStoryboardWidgetOverlayFitRegression.test'
