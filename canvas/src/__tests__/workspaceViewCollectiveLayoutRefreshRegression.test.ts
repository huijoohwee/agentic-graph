import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
export function testWorkspaceViewUpdateSchedulesStoryboardWidgetCollectiveCollisionRefresh() {
  const p = resolve(process.cwd(), 'src', 'components', 'StoryboardWidgetCanvas', 'runtime', 'useStoryboardWidgetOverlayCollision.ts'); const text = readFileSync(p, 'utf8')
  const surfacePath = resolve(process.cwd(), 'src', 'components', 'StoryboardWidgetCanvas', 'runtime', 'useStoryboardWidgetOverlaySurface.tsx'); const surfaceText = readFileSync(surfacePath, 'utf8')
  if (text.includes('workspaceViewSig')) {
    throw new Error('expected Storyboard Widget collective collision key to avoid workspace view signature coupling')
  }
  if (text.includes('workspaceCanvasPaneOpen === true ? 1 : 0')) {
    throw new Error('expected Storyboard Widget collective collision refresh to avoid workspace pane open state coupling')
  }
  if (!text.includes('const workspaceOverlayOpenRef = React.useRef(false)')) {
    throw new Error('expected Storyboard Widget collective collision to track workspace overlay open state without key coupling')
  }
  if (!surfaceText.includes("import { isWorkspaceEditorOverlayOpen, isWorkspaceGraphMutationBlocked } from '@/features/workspace-table/workspaceTableSsot'")) {
    throw new Error('expected Storyboard Widget collective collision to reuse the shared workspace/indexing mutation guard')
  }
  if (!surfaceText.includes('const workspaceMutationBlocked = useGraphStore(s => isWorkspaceGraphMutationBlocked(s))')) {
    throw new Error('expected Storyboard Widget collective collision to derive Workspace/Indexing mutation state via the shared guard')
  }
  if (!text.includes('if (workspaceOverlayOpenRef.current) return')) {
    throw new Error('expected workspace overlay open state to block persisted Storyboard Widget position mutation')
  }
  const mutationGuardIndex = text.indexOf('if (workspaceOverlayOpenRef.current) return')
  const writebackIndex = text.indexOf('st.setFlowWidgetPosByNodeId(nextPos)')
  if (mutationGuardIndex < 0 || writebackIndex < 0 || mutationGuardIndex > writebackIndex) {
    throw new Error('expected workspace overlay mutation guard before Storyboard Widget position writeback')
  }
  if (!text.includes('const unsubOpenWidgets = useGraphStore.subscribe(')) {
    throw new Error('expected Storyboard Widget collective collision to subscribe to open widget ids')
  }
  if (!text.includes('s.openWidgetNodeIds')) {
    throw new Error('expected Storyboard Widget collective collision refresh subscription to use openWidgetNodeIds')
  }
  const editorPath = resolve(process.cwd(), 'src', 'components', 'StoryboardWidget', 'FlowWidgetOverlay.tsx')
  const editorInnerPath = resolve(process.cwd(), 'src', 'components', 'StoryboardWidget', 'WidgetEditorInner.tsx')
  const editorPlacementPath = resolve(process.cwd(), 'src', 'components', 'StoryboardWidget', 'useWidgetPlacementRuntime.ts')
  const editorPlacementStatePath = resolve(process.cwd(), 'src', 'components', 'StoryboardWidget', 'widgetPlacementRuntimeState.ts')
  const editorViewPath = resolve(process.cwd(), 'src', 'components', 'StoryboardWidget', 'WidgetEditorView.tsx')
  const editorSharedPath = resolve(process.cwd(), 'src', 'components', 'StoryboardWidget', 'flowWidgetOverlayShared.ts')
  const editorWrapperText = readFileSync(editorPath, 'utf8')
  const editorText = [
    editorWrapperText,
    editorWrapperText.includes("from '@/components/StoryboardWidget/WidgetEditorInner'") ? readFileSync(editorInnerPath, 'utf8') : '',
    readFileSync(editorPlacementPath, 'utf8'),
    readFileSync(editorPlacementStatePath, 'utf8'),
    readFileSync(editorViewPath, 'utf8'),
    readFileSync(editorSharedPath, 'utf8'),
  ].join('\n')
  if (!editorText.includes("import { isWorkspaceGraphMutationBlocked, type WorkspaceGraphMutationState } from '@/features/workspace-table/workspaceTableSsot'")) {
    throw new Error('expected direct Storyboard Widget persistence to reuse the shared workspace/indexing mutation guard')
  }
  if (!editorText.includes('resolveFlowWidgetStateGraphKey')) {
    throw new Error('expected direct Storyboard Widget persistence to reuse shared graph semantic key helper for workspace-blocked in-memory updates')
  }
  if (!editorText.includes('if (isWorkspaceGraphMutationBlocked(state)) {')) {
    throw new Error('expected direct Storyboard Widget persistence to branch workspace-blocked updates through an explicit in-memory path')
  }
  if (!editorText.includes('resolveStoryboardWidgetSurfacePointerPolicy')) {
    throw new Error('expected FlowWidgetOverlay to reuse the shared widget surface pointer policy')
  }
  if (!editorText.includes('data-kg-canvas-wheel-ignore={pointerPolicy.canvasWheelIgnore}')) {
    throw new Error('expected FlowWidgetOverlay widget panel wheel routing to come from the shared pointer policy')
  }
  if (
    !editorText.includes('className={`${pointerPolicy.rootClassName}')
    || !editorText.includes('[&_input:disabled]:pointer-events-none')
    || !editorText.includes('[&_select:disabled]:pointer-events-none')
    || !editorText.includes('[&_textarea:disabled]:pointer-events-none')
    || !editorText.includes('onPointerDownCapture={handleRootPointerCapture}')
    || !editorText.includes('onMouseDownCapture={handleRootPointerCapture}')
  ) {
    throw new Error('expected FlowWidgetOverlay root pointer routing to come from the shared pointer policy')
  }
  if (!editorText.includes('pointerPolicy.toolbarPointerEventsClassName')) {
    throw new Error('expected FlowWidgetOverlay toolbar pointer routing to come from the shared pointer policy')
  }
  if (!editorText.includes('className={pointerPolicy.panelPointerEventsClassName}')) {
    throw new Error('expected FlowWidgetOverlay panel pointer routing to come from the shared pointer policy')
  }
  if (editorText.includes('interactionPassthrough')) {
    throw new Error('expected FlowWidgetOverlay to remove stale workspace passthrough pointer disabling')
  }
  const overlaySharedPath = resolve(process.cwd(), 'src', 'components', 'StoryboardWidgetCanvas', 'storyboardWidgetCanvasShared.tsx')
  const overlaySharedText = readFileSync(overlaySharedPath, 'utf8')
  if (overlaySharedText.includes('interactionPassthrough')) {
    throw new Error('expected StoryboardWidgetOverlay shared wrapper to stop threading stale interaction passthrough into FlowWidgetOverlay')
  }
  if (!editorText.includes('useGraphStore.setState(prev => {')) {
    throw new Error('expected direct Storyboard Widget persistence to update in-memory widget positions while workspace mutation is blocked')
  }
  if (!editorText.includes('flowWidgetPosByNodeIdByGraphMetaKey')) {
    throw new Error('expected direct Storyboard Widget screen-position in-memory updates to mirror graph-keyed SSOT while workspace mutation is blocked')
  }
  if (!editorText.includes('flowWidgetWorldPosByNodeIdByGraphMetaKey')) {
    throw new Error('expected direct Storyboard Widget world-position in-memory updates to mirror graph-keyed SSOT while workspace mutation is blocked')
  }
  if (!editorText.includes('state.setFlowWidgetPosByNodeIdForGraph(graphMetaKey, {')) {
    throw new Error('expected direct Storyboard Widget screen-position persistence path to remain available when workspace mutation is not blocked')
  }
  if (!editorText.includes('state.setFlowWidgetWorldPosByNodeIdForGraph(graphMetaKey, {')) {
    throw new Error('expected direct Storyboard Widget world-position persistence path to remain available when workspace mutation is not blocked')
  }
  const flowCanvasPath = resolve(process.cwd(), 'src', 'components', 'FlowCanvas.tsx')
  const flowCanvasText = readFileSync(flowCanvasPath, 'utf8')
  const flowCanvasInteractionRuntimePath = resolve(process.cwd(), 'src', 'components', 'FlowCanvas', 'FlowCanvasInteractionRuntime.tsx')
  const flowCanvasInteractionRuntimeText = readFileSync(flowCanvasInteractionRuntimePath, 'utf8')
  if (!flowCanvasText.includes('allowLayoutCommitWhenWorkspaceBlocked: canvas2dRenderer === \'storyboard\'')) {
    throw new Error('expected FlowCanvas commit path to allow Storyboard Widget layout commits while workspace view is open')
  }
  if (!flowCanvasText.includes('const WORKSPACE_PREINIT_DRAW_INTERACTION_BYPASS_MS = 1200')) {
    throw new Error('expected FlowCanvas pre-init draw suppression to include a bounded user-interaction bypass window for zoom/minimap responsiveness')
  }
  if (!flowCanvasText.includes('const interactedRecently = Date.now() - lastUserInteractionAtMsRef.current <= WORKSPACE_PREINIT_DRAW_INTERACTION_BYPASS_MS')
    || !flowCanvasText.includes('if (interactedRecently) return false')) {
    throw new Error('expected FlowCanvas pre-init draw suppression to bypass gating after recent user interaction so toolbar/minimap zoom requests are not dropped')
  }
  if (!flowCanvasText.includes('const scheduleFlowDraw = React.useCallback((opts?: { force?: boolean }) => {')
    || !flowCanvasText.includes('if (!force && shouldSuppressWorkspacePreInitCanvasDraw())')) {
    throw new Error('expected FlowCanvas draw scheduler to expose a force bypass path for interaction-driven zoom/minimap frames under pre-init suppression')
  }
  if (!flowCanvasInteractionRuntimeText.includes('scheduleFlowDraw({ force: true })')) {
    throw new Error('expected FlowCanvas interaction runtime zoom callback to force draw flush so toolbar/minimap zoom remains responsive during pre-init suppression')
  }
  if (!flowCanvasText.includes('width={canvasPixelW}') || !flowCanvasText.includes('height={canvasPixelH}')) {
    throw new Error('expected FlowCanvas to bind backing-store dimensions to viewport*dpr so first frame is sharp in workspace-open Storyboard Widget')
  }
  const flowCommitPath = resolve(process.cwd(), 'src', 'components', 'FlowCanvas', 'useFlowRequestCommit.ts')
  const flowCommitText = readFileSync(flowCommitPath, 'utf8')
  if (!flowCommitText.includes('const allowLayoutCommit = !args.workspaceMutationBlocked || args.allowLayoutCommitWhenWorkspaceBlocked === true')
    || !flowCommitText.includes('shouldCommitFlowLayoutPositions({')) {
    throw new Error('expected FlowCanvas requestCommit to decouple workspace mutation guard from Storyboard Widget collective interaction commits')
  }
  if (!flowCommitText.includes('commitZoomTransformToStore({')) {
    throw new Error('expected FlowCanvas requestCommit to keep viewport zoom-state commit active during workspace-open interaction')
  }
  const runtimePath = resolve(process.cwd(), 'src', 'components', 'StoryboardWidgetCanvas', 'runtime', 'useStoryboardWidgetRuntimeScene.ts')
  const runtimeText = readFileSync(runtimePath, 'utf8')
  const runtimeSeedPath = resolve(process.cwd(), 'src', 'components', 'StoryboardWidgetCanvas', 'runtime', 'storyboardWidgetRuntimeSeedPositions.ts')
  const runtimeSeedText = readFileSync(runtimeSeedPath, 'utf8')
  const overlayEdgesPath = resolve(process.cwd(), 'src', 'components', 'StoryboardWidgetCanvas', 'runtime', 'useStoryboardWidgetOverlayEdges.ts')
  const overlayEdgesText = readFileSync(overlayEdgesPath, 'utf8')
  const worldSeedGuardIndex = runtimeText.indexOf('if (workspaceMutationBlockedForSeed && !zoomPresetPresentationRebalanceRequested) {')
  const worldSeedKeyWriteIndex = runtimeText.indexOf('seededPinnedWidgetWorldPosKeyRef.current = seedKey', worldSeedGuardIndex)
  const worldSeedWriteIndex = runtimeText.indexOf('if (changedScreenPos) st.setFlowWidgetPosByNodeId(nextScreenPos, presentationPositionCommitOptions)', worldSeedGuardIndex)
  if (worldSeedGuardIndex < 0 || worldSeedWriteIndex < 0 || worldSeedGuardIndex > worldSeedWriteIndex) {
    throw new Error('expected pinned widget auto-seed to skip ordinary geometry writes while allowing only explicit non-persistent zoom-preset presentation rebalances')
  }
  if (worldSeedKeyWriteIndex >= 0 && worldSeedGuardIndex < worldSeedKeyWriteIndex && worldSeedKeyWriteIndex < worldSeedWriteIndex) {
    throw new Error('expected pinned widget auto-seed key not to be committed while Workspace/Indexing mutation guard is active')
  }
  if (!runtimeText.includes("reason: 'workspace-blocked-skipping-flow-widget-seed-write'")) {
    throw new Error('expected pinned widget auto-seed to trace read-only workspace-blocked seed skips')
  }
  if (runtimeText.includes('buildWorkspaceBlockedFlowWidgetSeedPatch') || runtimeSeedText.includes('buildWorkspaceBlockedFlowWidgetSeedPatch')) {
    throw new Error('expected pinned widget auto-seed to remove the stale workspace-blocked in-memory mutation branch')
  }
  if (!runtimeText.includes('syncFlowWidgetScreenAuthorityPosition({') || !runtimeSeedText.includes('shouldUseStoryboardWidgetFloatingScreenAuthority({')) {
    throw new Error('expected pinned widget auto-seed to sync screen-authority positions with centered world seeds through the shared authority helper')
  }
  if (runtimeText.includes('const reseedEligible = effectiveOpenIds')) {
    throw new Error('expected pinned widget auto-seed to avoid reseeding already-placed world positions on layout-signature churn')
  }
  if (!runtimeText.includes('...pendingRaw,\n            ...overlapEligible,\n            ...forcedInitialCollectiveIds,\n            ...forcedLayoutRebalanceIds,')) {
    throw new Error('expected pinned widget auto-seed to only seed missing, overlapping, initial collective, or explicit layout-rebalance world positions')
  }
  if (!runtimeText.includes('const incrementalUnplacedNodeIds = (')
    || !runtimeText.includes('? incrementalUnplacedNodeIds')
    || !runtimeText.includes('&& incrementalUnplacedNodeIds.length === 0')) {
    throw new Error('expected incremental Widget/Rich Media additions to seed independently without reseeding the existing collective')
  }
  if (!runtimeText.includes('const effectiveOrFallbackOpenIds = effectiveOpenIds.length > 0')
    || !runtimeText.includes("graphMetaKind === 'frontmatter-flow'")
    || !runtimeText.includes('...Object.keys(worldById),')) {
    throw new Error('expected pinned widget auto-seed to fallback to world-key ids when frontmatter effective-open ids are empty')
  }
  if (!runtimeText.includes('const shouldReseedWholeFrontmatterCollective =') || !runtimeText.includes('if (shouldReseedWholeFrontmatterCollective) pending = fullFrontmatterCollectiveIds')) {
    throw new Error('expected pinned widget auto-seed to force frontmatter collective recovery only when overlap/missing detection yields partial pending ids')
  }
  if (runtimeText.includes('shouldReseedFrontmatterScreenAuthorityCollective({') || runtimeText.includes('resolveOffscreenPinnedFlowWidgetIds({')) {
    throw new Error('expected pinned widget auto-seed to forbid viewport/offscreen reseed triggers in infinite-canvas mode')
  }
  if (runtimeText.includes('const allowPersistedViewportOffsetSeed =') || runtimeText.includes('const persistedZoomForSeed =')) {
    throw new Error('expected pinned widget auto-seed to avoid workspace-blocked persisted zoom branches after the read-only guard')
  }
  if (!runtimeText.includes('(persistedHasViewportOffset && liveLooksDefault ? persistedZoom : null)')) {
    throw new Error('expected pinned widget auto-seed zoom source to stay independent from Workspace overlay toggles after the read-only guard')
  }
  if (!runtimeText.includes('const currentLayoutSignature = `${args.overlayNodeLayoutSignature}|${visibleViewport.left},${visibleViewport.top},${visibleViewport.width}x${visibleViewport.height}|${bucketSignature}`')) {
    throw new Error('expected pinned widget auto-seed layout signature to include shared visible viewport geometry without Editor Workspace pane authority')
  }
  if (!runtimeText.includes('args.storyboardWidgetSurfaceId,')) {
    throw new Error('expected Storyboard Widget runtime scene dependencies to react to surface-scoped visible viewport changes')
  }
  if (!runtimeText.includes('const shouldUseNeutralSeedZoom =')
    || !runtimeText.includes('runtimeSceneNodeCount <= 0')
    || !runtimeText.includes('!partitionedFrontmatterRuntimeScene')
    || !runtimeText.includes('|| shouldUseNeutralSeedZoomForFrontmatterInit')) {
    throw new Error('expected pinned widget auto-seed to neutralize stale zoom offset only when flow runtime scene is missing, not intentionally partitioned')
  }
  if (!runtimeText.includes('(shouldUseNeutralSeedZoom ? { k: 1, x: 0, y: 0 } : null)')) {
    throw new Error('expected pinned widget auto-seed zoom source to prioritize neutral zoom for empty-scene overlay recovery')
  }
  if (!runtimeText.includes('const shouldUseNeutralSeedZoomForFrontmatterInit =')
    || !runtimeText.includes('const isFirstFrontmatterInitSeed = isFrontmatterFlow && seededPinnedWidgetWorldPosKeyRef.current.length === 0')
    || !runtimeText.includes('!persistedHasViewportOffset')
    || !runtimeText.includes('&& isFirstFrontmatterInitSeed')) {
    throw new Error('expected frontmatter-flow init seeding to force neutral zoom only on the first non-workspace-blocked seed pass')
  }
  if (!runtimeText.includes("reason: 'scene-empty-workspace-blocked-awaiting-live-transform'")) {
    throw new Error('expected pinned widget auto-seed to gate workspace-blocked empty-scene frontmatter placement until post-init layout')
  }
  if (
    !runtimeText.includes('const partitionedFrontmatterRuntimeScene =')
    || !runtimeText.includes('renderGraphNodeCount > 0')
    || !runtimeText.includes('&& !partitionedFrontmatterRuntimeScene')
  ) {
    throw new Error('expected pinned widget auto-seed to avoid forced reseed when frontmatter native runtime scene is intentionally partitioned')
  }
  if (!runtimeText.includes('if (forceSceneEmptyReseed) return true')) {
    throw new Error('expected pinned widget auto-seed pending selection to include all pinned widgets during empty-scene reseed')
  }
  if (!runtimeText.includes('if (seededPinnedWidgetWorldPosKeyRef.current === seedKey && !forceSceneEmptyReseed) {')) {
    throw new Error('expected pinned widget auto-seed key guard to allow forced scene-empty reseed despite matching seed key')
  }
  if (!runtimeText.includes("const STORYBOARD_WIDGET_RUNTIME_SCENE_TRACE_KEY = '__storyboardWidgetRuntimeSceneDebug'")) {
    throw new Error('expected runtime source instrumentation to expose deterministic transform-authority trace entries for Storyboard Widget overlay drift diagnostics')
  }
  if (!runtimeText.includes('const lastUsableZoomTransformRef = React.useRef<{ k: number; x: number; y: number } | null>(null)')) {
    throw new Error('expected runtime transform authority to persist last usable transform so empty-scene recomposition does not flash widgets offscreen')
  }
  if (!runtimeText.includes('const workspaceMutationBlocked = useGraphStore(s => isWorkspaceGraphMutationBlocked(s))')) {
    throw new Error('expected Storyboard Widget runtime scene to subscribe to shared workspace mutation guard for open/close transition resets')
  }
  if (!runtimeText.includes('const workspaceMutationBlockedPrevRef = React.useRef<boolean>(workspaceMutationBlocked)')) {
    throw new Error('expected Storyboard Widget runtime scene to track workspace mutation transition edges for reopen reset logic')
  }
  if (!runtimeText.includes('if (workspaceMutationBlocked !== true || prev === true) return')) {
    throw new Error('expected Storyboard Widget runtime scene to run transition reset only on workspace reopen edges')
  }
  if (!['const shouldPreserveWorkspaceReopenAuthorities = React.useCallback(() => {', 'if (shouldPreserveWorkspaceReopenAuthorities()) {', "reason: 'workspace-reopen-preserving-current-authorities'"].every(fragment => runtimeText.includes(fragment))) {
    throw new Error('expected Storyboard Widget runtime scene to preserve visible current widget authorities across workspace reopen instead of reseeding stable layouts')
  }
  if (!runtimeText.includes("lastUsableZoomTransformRef.current = null")) {
    throw new Error('expected Storyboard Widget runtime scene to clear stale last-usable transform only when workspace reopen authorities are no longer visible')
  }
  if (!runtimeText.includes("seededPinnedWidgetWorldPosKeyRef.current = ''") || !runtimeText.includes("lastAutoSeedLayoutSignatureRef.current = ''")) {
    throw new Error('expected Storyboard Widget runtime scene to clear transient auto-seed keys only for stale workspace reopen authorities')
  }
  if (!runtimeText.includes("reason: 'scene-empty-using-last-usable-transform'")) {
    throw new Error('expected runtime trace to report scene-empty fallback that reuses last usable transform instead of dropping overlays')
  }
  if (!runtimeText.includes('function readFiniteRuntimeZoomTransform(runtime: FlowNativeRuntime | null | undefined)')
    || !runtimeText.includes("reason: 'scene-empty-using-live-runtime-transform'")
    || !runtimeText.includes('&& !workspaceMutationBlocked')
    || !runtimeText.includes('interactionInProgress || hasViewportOffset(liveRuntimeTransform) || !hasViewportOffset(persistedTransform)')) {
    throw new Error('expected empty-scene overlay-only Storyboard Widget interactions to read the live runtime transform only outside workspace-mutation windows')
  }
  if (!runtimeText.includes("reason: 'scene-empty-workspace-blocked-rejecting-live-runtime-transform'")) {
    throw new Error('expected workspace-blocked empty-scene frames to reject live runtime transforms before they can replay FlowCanvas layout movement into Storyboard Widget')
  }
  if (!runtimeText.includes("reason: 'scene-empty-using-persisted-transform'")) {
    throw new Error('expected runtime transform authority to fallback to persisted effective zoom before neutral identity during transient empty-scene frames')
  }
  if (!runtimeText.includes('lastUsableZoomTransformRef.current = next')) {
    throw new Error('expected runtime transform authority to refresh last usable transform from visible live transform frames')
  }
  const collisionPath = resolve(process.cwd(), 'src', 'components', 'StoryboardWidgetCanvas', 'runtime', 'useStoryboardWidgetOverlayCollision.ts')
  const collisionText = readFileSync(collisionPath, 'utf8')
  if (!collisionText.includes("|| { k: 1, x: 0, y: 0 }")) {
    throw new Error('expected overlay collision node obstacle projection to avoid null transform fallthrough by using numeric identity fallback')
  }
  if (collisionText.includes('zoomStateByKey: st.zoomStateByKey }) || null')) {
    throw new Error('expected overlay collision node obstacle projection to forbid null transform fallback that can trigger number-null runtime warnings')
  }
  if (runtimeText.includes('workspaceMutationBlocked && sceneNodeCount > 0 && !interactionInProgress && !flowWidgetDragging')) {
    throw new Error('expected runtime transform authority to avoid node-bearing workspace-mutation viewport offscreen guards before reusing live transform')
  }
  if (runtimeText.includes('const allowPersistedDuringActiveInteraction = interactionInProgress || flowWidgetDragging') || runtimeText.includes('|| allowPersistedDuringActiveInteraction')) {
    throw new Error('expected runtime scene-empty persisted-transform branch to preserve persisted transforms without viewport-specific active-interaction overrides')
  }
  if (runtimeText.includes("reason: 'workspace-blocked-offscreen-transform-neutralized'")) {
    throw new Error('expected runtime transform trace to remove offscreen neutralization that caused viewport bounce')
  }
  if (!runtimeText.includes('isCanonicalFrontmatterBuiltInWidgetNode')) {
    throw new Error('expected pinned widget auto-seed overlap detection to include canonical frontmatter widget identity')
  }
  if (!runtimeText.includes("graphMetaKind === 'frontmatter-flow'")) {
    throw new Error('expected pinned widget auto-seed overlap detection to include frontmatter-flow pinned widgets with stale world positions')
  }
  if (!runtimeText.includes('|| frontmatterPinnedWidget')) {
    throw new Error('expected pinned widget auto-seed overlap detection to avoid skipping frontmatter pinned widgets when world positions exist')
  }

  const renderStatePath = resolve(process.cwd(), 'src', 'components', 'StoryboardWidgetCanvas', 'runtime', 'useStoryboardWidgetRenderState.ts')
  const renderStateText = readFileSync(renderStatePath, 'utf8')
  const graphStatePath = resolve(process.cwd(), 'src', 'components', 'FlowCanvas', 'useFlowCanvasGraphState.ts')
  const graphStateText = readFileSync(graphStatePath, 'utf8')
  const overlaySurfacePath = resolve(process.cwd(), 'src', 'components', 'StoryboardWidgetCanvas', 'runtime', 'useStoryboardWidgetOverlaySurface.tsx')
  const overlaySurfaceText = readFileSync(overlaySurfacePath, 'utf8')
  const overlaySurfaceVisibilityPath = resolve(process.cwd(), 'src', 'components', 'StoryboardWidgetCanvas', 'runtime', 'storyboardWidgetOverlaySurfaceVisibility.ts'); const storyboardWidgetSurfaceVisibilityText = readFileSync(overlaySurfaceVisibilityPath, 'utf8')
  const runtimeCanvasPath = resolve(process.cwd(), 'src', 'components', 'StoryboardWidgetCanvas.runtime.tsx')
  const runtimeCanvasText = readFileSync(runtimeCanvasPath, 'utf8')
  if (!runtimeCanvasText.includes('workspaceMutationBlocked,') || !runtimeCanvasText.includes('useStoryboardWidgetRenderState({')) {
    throw new Error('expected Storyboard Widget canvas runtime to pass shared workspace mutation-blocked state into render graph stabilization path')
  }
  if (!runtimeCanvasText.includes('workspaceMutationBlocked,')) {
    throw new Error('expected Storyboard Widget render state hook invocation to include workspace mutation-blocked input')
  }
  if (!renderStateText.includes('workspaceMutationBlocked: boolean')) {
    throw new Error('expected Storyboard Widget render state to accept shared workspace mutation-blocked state for transient render graph stability')
  }
  if (!renderStateText.includes('const shouldPreserveStableDuringWorkspaceMutation =')) {
    throw new Error('expected Storyboard Widget render state to centralize workspace-mutation transient empty-graph preservation guard')
  }
  if (!renderStateText.includes('if (shouldPreserveStableDuringWorkspaceMutation && prev?.documentKey === args.activeDocumentKey) return prev')) {
    throw new Error('expected Storyboard Widget render state stable graph cache writes to avoid replacing stable graph with transient empty graph during workspace mutation windows')
  }
  if (!renderStateText.includes('const preserveStableGraphDuringWorkspaceMutation =')) {
    throw new Error('expected Storyboard Widget render state graph selection to prefer stable graph during workspace-mutation transient empty-graph frames')
  }
  if (!renderStateText.includes('if (preserveStableGraphDuringWorkspaceMutation) return stableGraph')) {
    throw new Error('expected Storyboard Widget render state graph selection to keep overlays mounted without close/reopen when workspace mutation emits empty render graph frames')
  }
  if (!renderStateText.includes('const preserveStableGraphAcrossFlowViewClose =')) {
    throw new Error('expected Storyboard Widget render state to name the stable graph reuse contract for workspace close explicitly')
  }
  if (!graphStateText.includes('const allowMutations = allowNodeDragOverride !== false')) {
    throw new Error('expected FlowCanvas graph state to keep interaction mutation pathways enabled in Workspace-open Storyboard Widget mode')
  }
  if (graphStateText.includes('allowNodeDragOverride !== false && documentStructureBaselineLock !== true')) {
    throw new Error('expected FlowCanvas interaction mutation gate to avoid baseline-lock coupling that freezes workspace-open drag/pan/zoom')
  }
  if (!storyboardWidgetSurfaceVisibilityText.includes("if (frontmatterOverlayVisualIsolation.kind === 'frontmatter-flow') {")) {
    throw new Error('expected Storyboard Widget overlay-only mode to branch on frontmatter-flow before workspace mutation fallback')
  }
  if (!storyboardWidgetSurfaceVisibilityText.includes('FlowCanvas') || !storyboardWidgetSurfaceVisibilityText.includes('partitioned before FlowCanvas')) {
    throw new Error('expected frontmatter-flow overlay-only guard to document upstream renderer partitioning before FlowCanvas receives the graph')
  }
  if (overlaySurfaceText.includes('preferCanvasCollectiveInteraction')) {
    throw new Error('expected Storyboard Widget overlay surface to avoid base FlowCanvas collective fallback authority that can cause renderer seepage/interference')
  }
  const nativePolicyFlowCanvasPath = resolve(process.cwd(), 'src', 'components', 'FlowCanvas.tsx')
  const nativePolicyFlowCanvasText = readFileSync(nativePolicyFlowCanvasPath, 'utf8')
  if (nativePolicyFlowCanvasText.includes('resolveFlowCanvasNativeRenderPolicy')) {
    throw new Error('expected FlowCanvas to avoid native primitive suppression policy helpers')
  }
  if (
    nativePolicyFlowCanvasText.includes('drawArgsRef.current.renderNodes')
    || nativePolicyFlowCanvasText.includes('drawArgsRef.current.renderGroups')
    || nativePolicyFlowCanvasText.includes('drawArgsRef.current.renderEdges')
  ) {
    throw new Error('expected FlowCanvas draw args to avoid renderer-visibility kill switches')
  }
  const nativeRuntimeText = readFileSync(resolve(process.cwd(), 'src', 'components', 'FlowCanvas', 'nativeRuntime.ts'), 'utf8')
  if (nativeRuntimeText.includes('if (!renderEdges && !renderGroups && !renderNodes) return')) {
    throw new Error('expected native FlowCanvas draws to avoid returning through an all-primitives-off suppression branch')
  }
  const overlayCanvasSurfacePath = resolve(process.cwd(), 'src', 'components', 'StoryboardWidgetCanvas', 'runtime', 'StoryboardWidgetCanvasSurface.tsx')
  const overlayCanvasSurfaceText = readFileSync(overlayCanvasSurfacePath, 'utf8')
  if (overlayCanvasSurfaceText.includes('nativeSurfaceMode')) {
    throw new Error('expected Storyboard Widget canvas surface to avoid native surface suppression mode plumbing')
  }
  if (overlayCanvasSurfaceText.includes('renderNodes=') || overlayCanvasSurfaceText.includes('renderEdges=') || overlayCanvasSurfaceText.includes('renderGroups=')) {
    throw new Error('expected Storyboard Widget canvas surface to avoid owning FlowCanvas native node/edge visibility')
  }
  if (overlayCanvasSurfaceText.includes('hideNodeIds=')) {
    throw new Error('expected Storyboard Widget canvas surface to forbid hideNodeIds masking and keep FlowCanvas visibility neutral')
  }
  if (overlayCanvasSurfaceText.includes('hidePortHandleNodeIds=')) {
    throw new Error('expected Storyboard Widget canvas surface to forbid hidePortHandleNodeIds masking and keep FlowCanvas interaction contracts upstream')
  }
  if (!storyboardWidgetSurfaceVisibilityText.includes('const frontmatterFlowOwnedNodeIds =')) {
    throw new Error('expected Storyboard Widget overlay surface to derive the Storyboard Widget-owned visual node set upstream')
  }
  if (!storyboardWidgetSurfaceVisibilityText.includes('excludedNodeIds: frontmatterFlowOwnedNodeIds')) {
    throw new Error('expected Storyboard Widget overlay surface to neutralize seepage via upstream filtered graph exclusions instead of FlowCanvas hide props')
  }
  if (!storyboardWidgetSurfaceVisibilityText.includes('return filterGraphByExcludedNodeIds({')) {
    throw new Error('expected Storyboard Widget overlay surface to centralize overlay/base isolation in shared graph exclusion helper')
  }
  const storyboardWidgetCanvasRuntimePath = resolve(process.cwd(), 'src', 'components', 'StoryboardWidgetCanvas.runtime.tsx')
  const storyboardWidgetCanvasRuntimeText = readFileSync(storyboardWidgetCanvasRuntimePath, 'utf8')
  if (
    storyboardWidgetCanvasRuntimeText.includes('flowCanvasNativeSurfaceMode')
    || storyboardWidgetCanvasRuntimeText.includes('resolveFlowCanvasNativeSurfaceMode')
    || storyboardWidgetCanvasRuntimeText.includes('overlayOwnsScene')
    || storyboardWidgetCanvasRuntimeText.includes('nativeSurfaceMode=')
  ) {
    throw new Error('expected Storyboard Widget runtime to avoid native FlowCanvas suppression mode plumbing')
  }
  if (!storyboardWidgetCanvasRuntimeText.includes('renderGraphDataOverride={flowCanvasGraphDataOverride}')) {
    throw new Error('expected Storyboard Widget runtime to pass the upstream-filtered graph override into FlowCanvas')
  }
  if (!renderStateText.includes('prev.topologyLayoutSignature === nextTopologyLayoutSignature')) {
    throw new Error('expected Storyboard Widget render state to preserve the stable overlay graph only when semantic overlay topology still matches')
  }
  if (!renderStateText.includes('if (preserveStableGraphAcrossFlowViewClose) return stableGraph')) {
    throw new Error('expected Storyboard Widget render state to reuse the last stable overlay graph during workspace close when topology is unchanged')
  }
  const graphDataSlicePath = resolve(process.cwd(), 'src', 'hooks', 'store', 'graph-data-slice', 'graphDataCommitActions.ts')
  const graphDataSliceText = readFileSync(graphDataSlicePath, 'utf8')
  if (!graphDataSliceText.includes("import { buildCanonicalNodeLookup, parseCanonicalNodeIds, splitComposedNodeId } from '@/lib/graph/canonicalNodeIds'")) {
    throw new Error('expected graph commit carry-forward path to reuse shared canonical node identity helpers for workspace-prefixed graph clones')
  }
  if (!graphDataSliceText.includes('function remapNodeKeyedRecordByCanonicalNodeId<T>(')) {
    throw new Error('expected graph commit carry-forward path to centralize canonical remapping for node-keyed overlay state')
  }
  if (!graphDataSliceText.includes('readCanonicalGraphIdentity(n?.id)')) {
    throw new Error('expected same-source graph topology checks to compare canonical node ids instead of raw workspace-prefixed ids')
  }
  if (!graphDataSliceText.includes("`${readCanonicalGraphIdentity(e?.id)}|${readCanonicalGraphIdentity(e?.source)}|${readCanonicalGraphIdentity(e?.target)}`")) {
    throw new Error('expected same-source graph topology checks to compare canonical edge identities instead of raw workspace-prefixed ids')
  }
  if (!graphDataSliceText.includes('remapNodeKeyedRecordByCanonicalNodeId(nextGraphData, { ...(s.flowWidgetPosByNodeId || {}) })')) {
    throw new Error('expected graph commit carry-forward path to remap stored Flow widget screen positions onto canonical next-graph ids')
  }
  if (!graphDataSliceText.includes('remapNodeKeyedRecordByCanonicalNodeId(nextGraphData, { ...(s.flowWidgetWorldPosByNodeId || {}) })')) {
    throw new Error('expected graph commit carry-forward path to remap stored Flow widget world positions onto canonical next-graph ids')
  }
  const storePath = resolve(process.cwd(), 'src', 'hooks', 'store', 'graphViewSlice.ts')
  const storeText = readFileSync(storePath, 'utf8')
  if (!storeText.includes('isWorkspaceGraphMutationBlocked,')
    || !storeText.includes("from '@/features/workspace-table/workspaceTableSsot'")) {
    throw new Error('expected Flow widget store setters to reuse the shared workspace/indexing mutation guard')
  }
  const storePinnedGuardIndex = storeText.indexOf('if (isWorkspaceGraphMutationBlocked(state)) return')
  const storePinnedWriteIndex = storeText.indexOf('scheduleFlowWidgetPersistence({ pinned: { graphKey, value: nextPinnedById } })')
  if (storePinnedGuardIndex < 0 || storePinnedWriteIndex < 0 || storePinnedGuardIndex > storePinnedWriteIndex) {
    throw new Error('expected root Flow widget pinned-state setter to reject Workspace/Indexing mutation writes')
  }
  const storeScreenGuardIndex = storeText.indexOf('if (isWorkspaceGraphMutationBlocked(state) && options?.allowDuringWorkspaceMutation !== true) return', storePinnedGuardIndex + 1)
  const storeScreenWriteIndex = storeText.indexOf('scheduleFlowWidgetPersistence({ pos: { graphKey, value: nextPosByNodeId } })')
  if (storeScreenGuardIndex < 0 || storeScreenWriteIndex < 0 || storeScreenGuardIndex > storeScreenWriteIndex) {
    throw new Error('expected root Flow widget screen-position setter to reject Workspace/Indexing mutation writes')
  }
  const storeWorldGuardIndex = storeText.indexOf('if (isWorkspaceGraphMutationBlocked(state) && options?.allowDuringWorkspaceMutation !== true) return', storeScreenGuardIndex + 1)
  const storeWorldWriteIndex = storeText.indexOf('scheduleFlowWidgetPersistence({ world: { graphKey, value: nextWorldByNodeId } })')
  if (storeWorldGuardIndex < 0 || storeWorldWriteIndex < 0 || storeWorldGuardIndex > storeWorldWriteIndex) {
    throw new Error('expected root Flow widget world-position setter to reject Workspace/Indexing mutation writes')
  }
  if (!overlayEdgesText.includes('isWorkspaceEditorOverlayOpen') || !overlayEdgesText.includes('isWorkspaceGraphMutationBlocked')) {
    throw new Error('expected Storyboard Widget overlay edge scheduler to use the actual workspace overlay state instead of the expiring mutation guard')
  }
  if (!overlayEdgesText.includes('const workspaceOverlayOpenRef = React.useRef(false)')) {
    throw new Error('expected Storyboard Widget overlay edge scheduler to keep workspace overlay-open state as a latest-value guard')
  }
  if (!overlayEdgesText.includes('args.overlayEdgesEnabledRef.current = true')) {
    throw new Error('expected Storyboard Widget overlay edge SVG reattach to re-enable edge scheduling after Workspace remounts the overlay layer')
  }
  if (!overlayEdgesText.includes('if (workspaceOverlayOpenRef.current) scheduleOverlayEdgeUpdate()')) {
    throw new Error('expected workspace overlay open initialization to redraw stable edge geometry instead of only cancelling queued recomputation')
  }
  if (!overlayEdgesText.includes("const STORYBOARD_WIDGET_OVERLAY_EDGE_ID_ATTR = 'data-kg-overlay-edge-id'")) {
    throw new Error('expected Storyboard Widget overlay edges to mark a canonical DOM edge identity for frozen-workspace reuse')
  }
  if (!overlayEdgesText.includes('const frozenOverlayEdgePathsBySurfaceId = new Map<string, FrozenOverlayEdgePathSnapshot[]>()')) {
    throw new Error('expected Storyboard Widget overlay edges to cache the last stable edge render by surface id')
  }
  if (!overlayEdgesText.includes('const cacheFrozenOverlayEdgePaths = React.useCallback(() => {')) {
    throw new Error('expected Storyboard Widget overlay edges to snapshot the last stable edge DOM before workspace-open freezes')
  }
  if (!overlayEdgesText.includes('const restoreFrozenOverlayEdgePaths = React.useCallback((svg: SVGSVGElement | null): number => {')) {
    throw new Error('expected Storyboard Widget overlay edges to restore frozen edge DOM while workspace-open recomputation is blocked')
  }
  if (!overlayEdgesText.includes('if (wasOpen) {') || !overlayEdgesText.includes('scheduleOverlayEdgeUpdate()')) {
    throw new Error('expected workspace overlay close transition to reschedule overlay edge recomputation')
  }
  const edgeScheduleGuardIndex = overlayEdgesText.indexOf('const workspaceOverlayOpen = workspaceOverlayOpenRef.current')
  const edgePathWriteIndex = overlayEdgesText.indexOf("if (pathEl.getAttribute('d') !== d) pathEl.setAttribute('d', d)")
  if (edgeScheduleGuardIndex < 0 || edgePathWriteIndex < 0 || edgeScheduleGuardIndex > edgePathWriteIndex) {
    throw new Error('expected Storyboard Widget overlay edge DOM writes to remain driven by the workspace-open guard and stable graph branch')
  }
  if (text.includes('workspaceViewLayoutRefreshNonce')) {
    throw new Error('expected Storyboard Widget collective collision signature to avoid workspace layout refresh nonce coupling')
  }
}

export function testWorkspaceViewUpdatePreservesFrozenOverlayEdgesWhileIndexingToastIsVisible() {
  const overlayEdgesPath = resolve(process.cwd(), 'src', 'components', 'StoryboardWidgetCanvas', 'runtime', 'useStoryboardWidgetOverlayEdges.ts')
  const text = readFileSync(overlayEdgesPath, 'utf8')
  if (!text.includes("const STORYBOARD_WIDGET_OVERLAY_EDGE_ID_ATTR = 'data-kg-overlay-edge-id'")) {
    throw new Error('expected overlay edge freeze preservation to use a canonical DOM edge identity')
  }
  if (!text.includes('const frozenOverlayEdgePathsBySurfaceId = new Map<string, FrozenOverlayEdgePathSnapshot[]>()')) {
    throw new Error('expected overlay edge freeze preservation to cache stable paths per surface')
  }
  if (!text.includes('const existingDomPaths = Array.from(svg.querySelectorAll(`path[${STORYBOARD_WIDGET_OVERLAY_EDGE_ID_ATTR}]`))')) {
    throw new Error('expected overlay edge restoration to rehydrate from already-mounted DOM paths before snapshot replay')
  }
  if (!text.includes('overlayEdgePathByIdRef.current.clear()')) {
    throw new Error('expected overlay edge restoration to rebuild the in-memory edge map from canonical DOM paths')
  }
  if (!text.includes("const snapshots = surfaceId ? frozenOverlayEdgePathsBySurfaceId.get(surfaceId) || [] : []")) {
    throw new Error('expected overlay edge restoration to fall back to the last stable per-surface snapshot')
  }
  if (!text.includes("pathEl.setAttribute(STORYBOARD_WIDGET_OVERLAY_EDGE_ID_ATTR, edgeId)")) {
    throw new Error('expected overlay edge writes to stamp canonical DOM edge ids onto live paths')
  }
  const workspaceStableGeometryIndex = text.indexOf("pushOverlayEdgeTrace('schedule-workspace-open-live-geometry', {")
  const workspaceStableGraphIndex = text.indexOf('const graph = shouldReuseStableGraph ? stableGraph : liveGraph')
  if (workspaceStableGeometryIndex < 0 || workspaceStableGraphIndex < 0 || workspaceStableGraphIndex > workspaceStableGeometryIndex) {
    throw new Error('expected workspace-open edge scheduling to reuse the last stable graph while redrawing against current live overlay geometry')
  }
  const svgAttachedClearIndex = text.indexOf('workspaceOverlayOpenRef.current ? (removeAllPaths(overlayEdgePathByIdRef), 0) : restoreFrozenOverlayEdgePaths(node)')
  const svgAttachedRestoreIndex = text.indexOf('const restoredFrozenPathCount = workspaceOverlayOpenRef.current ? (removeAllPaths(overlayEdgePathByIdRef), 0) : restoreFrozenOverlayEdgePaths(node)')
  const svgAttachedTraceIndex = text.indexOf("pushOverlayEdgeTrace('svg-attached', {")
  if (svgAttachedClearIndex < 0 || svgAttachedRestoreIndex < 0 || svgAttachedTraceIndex < 0 || svgAttachedRestoreIndex > svgAttachedClearIndex || svgAttachedClearIndex > svgAttachedTraceIndex) {
    throw new Error('expected overlay svg attachment to clear stale workspace-open edge paths and skip frozen path restoration before reporting attachment state')
  }
  const workspaceSkipIndex = text.indexOf("pushOverlayEdgeTrace('schedule-skip-workspace-open', {")
  const workspaceSkipClearIndex = text.indexOf('removeAllPaths(overlayEdgePathByIdRef)')
  if (workspaceSkipIndex < 0 || workspaceSkipClearIndex < 0 || workspaceSkipClearIndex > workspaceSkipIndex) {
    throw new Error('expected workspace-open edge scheduling without live geometry to clear stale paths before skipping redraw')
  }
}

export function testWorkspaceViewUpdateSchedulesFrontmatterMediaOverlayLayoutRefresh() {
  const p = resolve(process.cwd(), 'src', 'components', 'FlowCanvas', 'FlowCanvasMediaOverlays.tsx')
  const text = readFileSync(p, 'utf8')
  const runtimePath = resolve(process.cwd(), 'src', 'components', 'FlowCanvas', 'useFlowCanvasRuntime.ts')
  const runtimeText = readFileSync(runtimePath, 'utf8')
  const runtimeTextIncludesAll = (...fragments: string[]): boolean => fragments.every(fragment => runtimeText.includes(fragment))
  const commitPath = resolve(process.cwd(), 'src', 'components', 'FlowCanvas', 'useFlowRequestCommit.ts')
  const commitText = readFileSync(commitPath, 'utf8')
  const computedPath = resolve(process.cwd(), 'src', 'components', 'FlowCanvas', 'useFlowComputedPositions.ts')
  const computedText = readFileSync(computedPath, 'utf8')
  if (text.includes('const workspaceViewSig =')) {
    throw new Error('expected FlowCanvas media overlays to avoid deriving workspace view signature')
  }
  if (!text.includes('mediaOverlayLayoutScheduleRef.current?.()')) {
    throw new Error('expected FlowCanvas media overlays to schedule layout updates')
  }
  if (!text.includes('mediaLayoutItemIdsKey')) {
    throw new Error('expected FlowCanvas media overlay layout scheduling to track media overlay item ids')
  }
  if (!text.includes('storyboardWidgetFrontmatterDocumentModeRequested')) {
    throw new Error('expected FlowCanvas media overlay loop dependencies to include frontmatter document mode')
  }
  if (!text.includes('const storyboardWidgetSurfaceInteractionMode =')
    || !text.includes('|| storyboardWidgetFrontmatterInteractionMode')
    || !text.includes('|| storyboardWidgetFrontmatterDocumentModeRequested')) {
    throw new Error('expected FlowCanvas media overlays to derive active Storyboard Widget surface mode from overlay and frontmatter interaction modes')
  }
  if (!text.includes('const storyboardWidgetOverlaySurfaceId = storyboardWidgetSurfaceInteractionMode ? storyboardWidgetSurfaceId :')) {
    throw new Error('expected FlowCanvas media overlays to forward the active surface id in frontmatter Storyboard Widget mode')
  }
  if (!text.includes('storyboardWidgetInteractionMode={storyboardWidgetSurfaceInteractionMode}')) {
    throw new Error('expected Rich Media Panels to receive the unified Storyboard Widget interaction surface mode')
  }
  if (!text.includes('const stopPassiveLayoutWhileWorkspaceOverlayOpen =\n      workspaceOverlayOpenRef.current && !storyboardWidgetFrontmatterDocumentModeRequested')) {
    throw new Error('expected frontmatter media overlay refresh to derive a workspace-open passive-layout exception from frontmatter document mode')
  }
  const flowZoomCommitWriteIndex = commitText.indexOf('commitZoomTransformToStore({')
  const flowLayoutCommitGuardIndex = commitText.indexOf('if (!shouldCommitFlowLayoutPositions({')
  const flowLayoutGuardHelperIndex = commitText.indexOf('const allowLayoutCommit = !args.workspaceMutationBlocked || args.allowLayoutCommitWhenWorkspaceBlocked === true')
  if (flowZoomCommitWriteIndex < 0) {
    throw new Error('expected Flow request commit to keep viewport zoom persistence active')
  }
  if (flowLayoutGuardHelperIndex < 0) {
    throw new Error('expected Flow request commit to centralize workspace mutation checks in the layout persistence helper')
  }
  if (flowLayoutCommitGuardIndex < 0 || flowZoomCommitWriteIndex > flowLayoutCommitGuardIndex) {
    throw new Error('expected Flow request commit to gate layout persistence separately from zoom persistence while Workspace/Indexing mutation guard is active')
  }
  if (!runtimeText.includes('const lateStoryboardWidgetInitAfterSceneBuild =')) {
    throw new Error('expected Flow runtime to name the late Storyboard Widget init guard explicitly')
  }
  if (!runtimeTextIncludesAll('const initialW = Math.max(1, Math.floor(viewportW * dpr))', 'const initialH = Math.max(1, Math.floor(viewportH * dpr))')) {
    throw new Error('expected Flow runtime to prime canvas backing-store size before first draw for workspace-open sharpness')
  }
  if (!runtimeText.includes('lastBuiltGraphKeyRef.current.length > 0')) {
    throw new Error('expected Flow runtime late init guard to detect scene builds that raced ahead of zoom-key initialization')
  }
  if (!runtimeText.includes('Continue into fit so the first visible frame does not stay frozen at identity.')) {
    throw new Error('expected Flow runtime late init guard to continue into fit instead of freezing Storyboard Widget at identity')
  }
  if (runtimeText.includes('const graphKey = `${graphDataRevision}:')) {
    throw new Error('expected Flow runtime scene rebuild key to avoid raw graphDataRevision churn')
  }
  if (!runtimeText.includes('buildFlowCanvasNativeSceneKey({') || runtimeText.includes('graphRevision: graphDataRevision,')) {
    throw new Error('expected Flow runtime scene rebuild key to use the shared native scene semantic key without raw revision-only churn')
  }
  if (!runtimeText.includes("import { isFlowTransformShowingGraph } from '@/components/FlowCanvas/transformGuards'")) {
    throw new Error('expected Flow runtime zoom seeding to reuse the shared flow transform visibility guard helper')
  }
  if (!runtimeText.includes('cancelFlowZoomRequestAnim(runtime)')) {
    throw new Error('expected Flow runtime authoritative fit/recovery writes to cancel stale zoom-request animations before applying transforms')
  }
  if (!runtimeText.includes('const preserveCurrentTransform =')) {
    throw new Error('expected Flow runtime zoom seeding to centralize current transform preservation checks')
  }
  if (!runtimeText.includes('const isReusableFlowTransform = (t: d3.ZoomTransform | null | undefined): boolean => {')
    || !runtimeText.includes('if (storyboardWidgetMode) return true')
    || !runtimeText.includes('return isFlowTransformShowingGraph(')) {
    throw new Error('expected Storyboard Widget zoom seeding to accept finite offscreen transforms while keeping viewport visibility guards scoped to non-infinite renderers')
  }
  if (!runtimeTextIncludesAll('const initialTransform = initial ? d3.zoomIdentity.translate(initial.x, initial.y).scale(initial.k) : null', 'const initialTransformUsable = isReusableFlowTransform(initialTransform)')) {
    throw new Error('expected Flow runtime zoom seeding to preserve finite initial transforms in Storyboard Widget infinite-canvas mode')
  }
  if (!runtimeText.includes('const shouldUseInitialTransform = workspaceEditorOverlayOpen !== true && initialTransformUsable && !!initialTransform')) {
    throw new Error('expected Flow runtime to disable stale stored initial transform reuse while Workspace overlay is open')
  }
  if (!runtimeTextIncludesAll('const seed = shouldUseInitialTransform', '? (initialTransform as d3.ZoomTransform)')) {
    throw new Error('expected Flow runtime zoom seeding to fallback from unusable initial transforms to fit/current guard path')
  }
  if (!runtimeText.includes('if (storyboardWidgetMode && alreadyInitializedForKey && workspaceEditorOverlayOpen !== true) return')) {
    throw new Error('expected Flow runtime initialization to preserve already-initialized non-workspace Storyboard Widget transforms, including an intentional 100% identity camera')
  }
  if (!runtimeTextIncludesAll('workspaceEditorOverlayOpen !== true', 'Date.now() - lastUserInteractionAtMsRef.current < 500')) {
    throw new Error('expected Flow runtime to bypass recent-interaction init-fit suppression while Workspace overlay is open')
  }
  if (!runtimeTextIncludesAll('workspaceEditorOverlayOpen === true', 'alreadyInitializedForKey || workspaceOverlayUserControlledRef.current', 'The established camera can intentionally be the 100% identity transform.')) {
    throw new Error('expected Flow runtime workspace-open init-fit guard to preserve established transforms, including intentional identity')
  }
  if (!runtimeTextIncludesAll('const collectiveOverlayFitIds = storyboardWidgetMode ? deriveExpectedOverlayCollectiveIds(graphDataForFit) : []', 'const hasCollectiveFlowWidgets = storyboardWidgetMode && collectiveOverlayFitIds.length > 0')) {
    throw new Error('expected Flow runtime init fit strategy to detect collective Storyboard Widget overlays before selecting centered-fit mode')
  }
  if (!runtimeTextIncludesAll('const canUseFrontmatterCollectiveInitFit =', "String(initFitGraphMeta.kind || '').trim() === 'frontmatter-flow'", "initFitGraphContext === 'frontmatter-flow'", 'const canUseCollectiveInitFit = hasCollectiveFlowWidgets || canUseFrontmatterCollectiveInitFit', '!canUseCollectiveInitFit', '!canUseFrontmatterCollectiveInitFit', '&& hasCollectiveFlowWidgets', '&& !hasUsableCollectiveWidgetWorldPos')) {
    throw new Error('expected Flow runtime settled init fit to keep frontmatter-flow on the collective overlay fit path even before explicit open widget ids are populated')
  }
  if (!runtimeText.includes('x: fit.x + (useD3StyleInitFit ? 0 : visibleViewportFit.left),')) {
    throw new Error('expected Storyboard Widget fit seed to avoid x viewport offset when Workspace overlay D3-style init fit is active')
  }
  if (!runtimeText.includes('y: fit.y + (useD3StyleInitFit ? 0 : visibleViewportFit.top),')) {
    throw new Error('expected Storyboard Widget fit seed to avoid y viewport offset when Workspace overlay D3-style init fit is active')
  }
  if (!runtimeText.includes('const workspaceEditorOverlayOpen = useGraphStore(s => isWorkspaceEditorOverlayOpen(s))')) {
    throw new Error('expected Flow runtime to subscribe to shared Workspace overlay-open SSOT for deterministic open/close recovery passes')
  }
  if (!runtimeText.includes('const graphVisible = isFlowTransformShowingGraph(')) {
    throw new Error('expected Flow runtime to keep graph visibility as a read-only signal for preservation decisions')
  }
  if (!runtimeText.includes('const remapTransformToVisibleViewport = React.useCallback(')) {
    throw new Error('expected Flow runtime to normalize transform visibility checks into visible-viewport-local coordinates')
  }
  if (!runtimeText.includes('syncFlowCanvasDebugToast({ enabled: true })')) {
    throw new Error('expected Flow runtime recovery path to publish temporary debug status via toast SSOT')
  }
  if (!runtimeText.includes('x: t.x - visibleViewport.left,')) {
    throw new Error('expected Flow runtime transform normalization to offset x by visible viewport left before visibility checks')
  }
  if (!runtimeText.includes('y: t.y - visibleViewport.top,')) {
    throw new Error('expected Flow runtime transform normalization to offset y by visible viewport top before visibility checks')
  }
  if (!runtimeText.includes("import { STORYBOARD_WIDGET_INTERACTION_FRAME_EVENT } from '@/lib/canvas/storyboard-widget-overlay-proxy'")) {
    throw new Error('expected Flow runtime infinite-canvas preservation to reuse shared Storyboard Widget interaction-frame event contract')
  }
  if (!runtimeText.includes("import { isHorizontalOverlayStrip, isVerticalOverlayCluster } from '@/lib/ui/overlayBalancedSpread'")) {
    throw new Error('expected Flow runtime infinite-canvas preservation to reuse shared balanced-spread strip/cluster detectors')
  }
  if (!runtimeText.includes('const [workspaceOverlayInteractionFrameTick, setWorkspaceOverlayInteractionFrameTick] = React.useState(0)')) {
    throw new Error('expected Flow runtime infinite-canvas preservation to track interaction-frame ticks while Workspace overlay is open')
  }
  if (!runtimeText.includes('window.addEventListener(STORYBOARD_WIDGET_INTERACTION_FRAME_EVENT, onInteractionFrame)')) {
    throw new Error('expected Flow runtime infinite-canvas preservation to subscribe to live Storyboard Widget interaction frames')
  }
  if (!runtimeText.includes('workspaceEditorOverlayOpen !== true &&')) {
    throw new Error('expected Flow runtime init preserve-current-transform guard to disable stale transform reuse while Workspace overlay is open')
  }
  if (!runtimeText.includes('const normalizedCurrent = remapTransformToVisibleViewport(')) {
    throw new Error('expected Flow runtime preservation visibility checks to evaluate normalized current transform within visible viewport coordinates')
  }
  if (!runtimeText.includes('const graphBalanced = isFlowTransformBalancedCollective({')) {
    throw new Error('expected Flow runtime preservation to detect visible collective balance without refitting')
  }
  if (runtimeText.includes('const transformDriftedFromFit =') || runtimeText.includes('drifted-from-fit')) {
    throw new Error('expected Flow runtime infinite-canvas mode to remove viewport-fit drift recovery that caused bounce-back')
  }
  if (!runtimeText.includes('const shouldIgnorePersistedWorldPosForWorkspaceOverlay = React.useMemo(() => {')) {
    throw new Error('expected Flow runtime fit path to guard against stale persisted world positions while Workspace overlay is open')
  }
  if (!runtimeTextIncludesAll("if (kind !== 'frontmatter-flow') return false", 'return hasUsableNodeCoords')) {
    throw new Error('expected Flow runtime fit path to ignore persisted world positions for Workspace-open frontmatter-flow view switching when node coordinates are usable')
  }
  if (!runtimeText.includes('worldPosById: fitWorldPosById,') && !runtimeText.includes('worldPosByNodeId: fitWorldPosById,')) {
    throw new Error('expected Flow runtime fit path to route overlay-open fit through sanitized world positions')
  }
  if (runtimeText.includes('allowOverlayCentroidRecovery') || runtimeText.includes('buildSceneViewportRecoverySignature')) {
    throw new Error('expected Flow runtime infinite-canvas preservation to remove automatic offscreen centroid refits')
  }
  if (!runtimeText.includes("from '@/components/FlowCanvas/workspaceVisibleViewportRecovery'")
    || !runtimeText.includes('buildWorkspaceVisibleViewportFitRecoveryKey({')
    || !runtimeText.includes('computeWorkspaceOverlayVisibleViewportFitTransform({')) {
    throw new Error('expected Flow runtime bounded workspace-open refits to use the shared visible-viewport recovery helper')
  }
  if (!runtimeText.includes('workspaceOverlayInteractionFrameTick,')) {
    throw new Error('expected Flow runtime preservation effect dependencies to rerun on live interaction frames while Workspace overlay is open')
  }
  if (runtimeText.includes('if (interactionInProgress || flowWidgetDragging) return')) {
    throw new Error('expected Flow runtime infinite-canvas preservation to remove delayed corrective-fit writes after interaction settles')
  }
  if (!runtimeText.includes('if (workspaceEditorOverlayOpen && collectiveVisible && overlayCollectiveCoverageComplete && (collectiveBalanced || collectiveCentered)) {')) {
    throw new Error('expected Flow runtime workspace-open preservation to keep balanced visible transforms without viewport-fit drift gating')
  }
  if (!runtimeText.includes('if (shouldPreserveEstablishedWorkspaceOverlayCamera({')
    || !runtimeText.includes('initializedForView: hasInitializedStoryboardZoomView(lastInitTransformZoomViewKeyRef.current, storyboardCameraViewKey),')) {
    throw new Error('expected Flow runtime to preserve the initialized view camera through transient topology coverage changes')
  }
  if (!runtimeText.includes('const workspaceOverlayStabilizedRef = React.useRef(false)')) {
    throw new Error('expected Flow runtime workspace-open recovery to track stabilized transform authority after THEN-layout convergence')
  }
  if (!runtimeText.includes('const initializedStoryboardZoomViewKeys = new Set<string>()')
    || !runtimeText.includes('const storyboardCameraViewKey = React.useMemo(() => {')
    || !runtimeText.includes('buildFlowZoomGraphMetaKey({')
    || !runtimeText.includes('hasInitializedStoryboardZoomView(lastInitTransformZoomViewKeyRef.current, initKey)')
    || !runtimeText.includes('rememberInitializedStoryboardZoomView(initKey)')) {
    throw new Error('expected Storyboard camera initialization authority to survive same-page Flow renderer remounts for the stable view key')
  }
  if (!runtimeText.includes('const workspaceOverlayZoomViewKeyRef = React.useRef<string | null>(null)')) {
    throw new Error('expected Flow runtime workspace-open recovery to track active zoom view key for transform-authority resets')
  }
  if (!runtimeText.includes('const workspaceVisibleViewportSignatureRef = React.useRef<string | null>(null)')
    || !runtimeText.includes('const workspaceVisibleViewportStableTicksRef = React.useRef(0)')) {
    throw new Error('expected Flow runtime workspace-open recovery to track visible viewport stability before applying fit/recovery transforms')
  }
  if (!runtimeText.includes('const isWorkspaceVisibleViewportSettled = React.useCallback((visibleViewport: {')
    || !runtimeText.includes('workspaceVisibleViewportStableTicksRef.current >= 1')) {
    throw new Error('expected Flow runtime workspace-open recovery to gate transform writes on settled pane-aware viewport bounds')
  }
  if (!runtimeText.includes('const shouldDeferWorkspaceOpenDraw = React.useCallback((): boolean => {')
    || !runtimeText.includes('workspace-open-first-draw-deferred-unsettled-viewport')) {
    throw new Error('expected Flow runtime workspace-open scene draw to defer first paint while pane-aware viewport is unsettled to avoid flash')
  }
  if (!runtimeText.includes('const workspaceDeferredDrawPendingRef = React.useRef(false)')
    || !runtimeText.includes('workspaceDeferredDrawPendingRef.current = true')) {
    throw new Error('expected Flow runtime workspace-open draw deferral to track pending draw flush state while viewport settles')
  }
  if (!runtimeText.includes('const workspaceViewportSettleRetryTimeoutRef = React.useRef<number | null>(null)')
    || !runtimeText.includes('const scheduleWorkspaceViewportSettleRetry = React.useCallback(() => {')) {
    throw new Error('expected Flow runtime workspace-open init to keep a bounded viewport-settle retry scheduler so pre-init suppression does not stall until user interaction')
  }
  if (!runtimeText.includes('workspace-open-init-viewport-settle-retry-pending')
    || !runtimeText.includes('scheduleWorkspaceViewportSettleRetry()')) {
    throw new Error('expected Flow runtime workspace-open init path to emit deterministic retry reason and schedule a settle retry tick when viewport is not yet stable')
  }
  if (!runtimeText.includes('requestFlowNativeDraw(runtime, buildDrawArgs())\n    requestCommit()\n    scheduleWorkspaceViewportSettleRetry()')) {
    throw new Error('expected Flow runtime workspace-open visible-viewport fit to schedule a bounded post-fit retry so settled overlay bounds cannot stall under the editor pane')
  }
  if (
    runtimeText.includes('const provisionalUseD3StyleInitFit =')
    || runtimeText.includes('const provisionalCanUseFrontmatterCollectiveInitFit =')
    || runtimeText.includes('provisionalFitGraphMeta')
    || runtimeText.includes('provisionalFit =')
    || runtimeText.includes('canApplyProvisionalWorkspaceInitFit')
  ) {
    throw new Error('expected Flow runtime workspace-open init to forbid provisional transforms that can flash before settled visible-viewport recovery')
  }
  if (!runtimeText.includes('if (!workspaceDeferredDrawPendingRef.current) return')
    || !runtimeText.includes('workspaceOverlayInteractionFrameTick')) {
    throw new Error('expected Flow runtime workspace-open deferred first draw to flush once viewport settles on subsequent interaction/frame ticks')
  }
  if (!runtimeText.includes('const shouldSuppressWorkspacePreInitDraw = React.useCallback((): boolean => {')
    || !runtimeText.includes('workspace-open-preinit-draw-suppressed')) {
    throw new Error('expected Flow runtime workspace-open draw paths to suppress pre-init scene draws until the current zoom view key transform is initialized')
  }
  if (!runtimeText.includes('const frontmatterDocumentModeRequested = isStoryboardWidgetFrontmatterDocumentModeRequested({')
    || !runtimeText.includes('if (hasRenderableGraphNodes && !frontmatterDocumentModeRequested) return false')) {
    throw new Error('expected Flow runtime workspace-open pre-init draw suppression to keep Storyboard Widget frontmatter document mode off the generic renderable-graph early-draw path')
  }
  if (!runtimeText.includes('if (!hasInitializedStoryboardZoomView(lastInitTransformZoomViewKeyRef.current, storyboardCameraViewKey)) return')) {
    throw new Error('expected Flow runtime workspace-open deferred draw flush to wait for current zoom view key init transform readiness')
  }
  if (!runtimeText.includes('workspace-open-preinit-recovery-suppressed')
    || !runtimeText.includes('if (workspaceEditorOverlayOpen && !hasInitializedStoryboardZoomView(lastInitTransformZoomViewKeyRef.current, storyboardCameraViewKey) && !overlayBounds) {')) {
    throw new Error('expected Flow runtime workspace-open recovery to suppress generic pre-init corrective transforms while allowing bounded overlay-bounds fits')
  }
  if (!runtimeText.includes('if (shouldDeferWorkspaceOpenDraw()) return')
    || !runtimeText.includes('scheduleFlowDraw()')) {
    throw new Error('expected Flow runtime workspace-open draw paths to gate scheduleFlowDraw behind viewport-settle deferral')
  }
  if (!runtimeText.includes('if (prev != null && prev !== storyboardCameraViewKey) {')) {
    throw new Error('expected Flow runtime workspace-open recovery to reset stabilized/user-controlled authority when active view key changes')
  }
  if (!runtimeTextIncludesAll('if (open && !prev) {', 'lastInitTransformZoomViewKeyRef.current = storyboardCameraViewKey', 'rememberInitializedStoryboardZoomView(storyboardCameraViewKey)')
    || runtimeText.includes('if (lastInitTransformZoomViewKeyRef.current !== storyboardCameraViewKey) lastInitTransformZoomViewKeyRef.current = null')
    || runtimeText.includes('lastOffscreenOverlayRecoveryKeyRef.current = null')) {
    throw new Error('expected Flow runtime workspace reopen edge to claim the rendered document camera without clearing initialized transform authority')
  }
  if (!runtimeTextIncludesAll('if (!open) {', 'Keep the initialized Storyboard Widget transform through close') || runtimeText.includes('Drop init/recovery memoization on close')) {
    throw new Error('expected Flow runtime workspace close edge to preserve initialized transform authority until the next reopen owns the reset')
  }
  if (runtimeText.includes('const currentTransformUsable =') || runtimeText.includes('const initOverlayCollectiveState = storyboardWidgetMode')) {
    throw new Error('expected Flow runtime init guard to stop rejecting current transforms because the overlay collective is offscreen')
  }
  if (!runtimeText.includes('storyboardWidgetMode && alreadyInitializedForKey && workspaceEditorOverlayOpen !== true')) {
    throw new Error('expected Flow runtime non-workspace init-preserve guard to preserve initialized transforms without topology-change refits')
  }
  if (!runtimeText.includes('workspaceEditorOverlayOpen === true\n      && (alreadyInitializedForKey || workspaceOverlayUserControlledRef.current)')) {
    throw new Error('expected Flow runtime workspace-open init-preserve guard to preserve established identity before skipping re-fit')
  }
  const overlayOpenCameraClaimIndex = runtimeText.indexOf('lastInitTransformZoomViewKeyRef.current = storyboardCameraViewKey')
  const overlayOpenCameraRememberIndex = runtimeText.indexOf('rememberInitializedStoryboardZoomView(storyboardCameraViewKey)')
  const overlayOpenTimestampIndex = runtimeText.indexOf('workspaceOverlayOpenedAtMsRef.current = Date.now()')
  if (overlayOpenCameraClaimIndex < 0
    || overlayOpenCameraRememberIndex < overlayOpenCameraClaimIndex
    || overlayOpenTimestampIndex < overlayOpenCameraRememberIndex) {
    throw new Error('expected workspace overlay startup to claim the already-rendered document camera before a blocked init effect can miss it')
  }
  if (!runtimeText.includes('const deriveExpectedOverlayCollectiveIds = React.useCallback((graphData: any): string[] => {')
    || !runtimeText.includes('const isOverlayCollectiveCoverageComplete = React.useCallback((args: {')
    || !runtimeText.includes('shouldPreserveEstablishedWorkspaceOverlayCamera({')
    || !runtimeText.includes('overlayCollectiveCoverageComplete && (collectiveBalanced || collectiveCentered)')) {
    throw new Error('expected Flow runtime to establish camera authority from complete collective coverage, then preserve it through later topology growth')
  }
  if (!runtimeText.includes('const collectiveOverlayFitIds = storyboardWidgetMode ? deriveExpectedOverlayCollectiveIds(graphDataForFit) : []')
    || !runtimeText.includes('const hasCollectiveFlowWidgets = storyboardWidgetMode && collectiveOverlayFitIds.length > 0')
    || runtimeText.includes('const recoveryCollectiveOverlayFitIds = deriveExpectedOverlayCollectiveIds(recoveryGraphData)')) {
    throw new Error('expected Flow runtime workspace-open init fits to use canonical frontmatter collective ids and remove automatic recovery fits')
  }
  if (!runtimeText.includes('workspace-open-stabilized-preserve-current')) {
    throw new Error('expected Flow runtime workspace-open recovery to preserve stabilized transform and forbid late fly-off refits')
  }
  if (!runtimeText.includes("'workspace-open-visible-balanced-preserve-current'")) {
    throw new Error('expected Flow runtime workspace-open balanced-visible preservation to emit deterministic debug reason')
  }
  if (!runtimeText.includes('const isFlowTransformCentroidCentered = React.useCallback((args: {')
    || !runtimeText.includes('workspace-open-visible-centered-preserve-current')) {
    throw new Error('expected Flow runtime workspace-open recovery to preserve already-visible centroid-centered layouts and emit deterministic centered-preserve reason')
  }
  if (!runtimeText.includes("deriveFlowOverlayCollectiveViewportState,")
    || !runtimeText.includes("from '@/components/FlowCanvas/workspaceVisibleViewportRecovery'")
    || runtimeText.includes('const deriveFlowOverlayCollectiveViewportState = React.useCallback((args: {')) {
    throw new Error('expected Flow runtime workspace-open recovery to reuse the shared overlay collective viewport-state helper')
  }
  if (!runtimeText.includes('const collectiveVisible = overlayCollectiveState?.visible ?? graphVisible')
    || !runtimeText.includes('const collectiveBalanced = overlayCollectiveState?.balanced ?? graphBalanced')
    || !runtimeText.includes('const collectiveCentered = overlayCollectiveState?.centered ?? graphCentered')) {
    throw new Error('expected Flow runtime workspace-open recovery to prefer overlay collective visibility/centering over raw scene-node visibility when overlays exist')
  }
  if (!runtimeText.includes("workspace-open-initialized-init-preserve-current")
    || !runtimeText.includes("workspace-open-user-controlled-init-preserve-current")
    || runtimeText.includes("'workspace-open-offscreen-visible-viewport-refit'")) {
    throw new Error('expected Flow runtime init-fit to preserve initialized and user-controlled infinite-canvas transforms instead of refitting offscreen state')
  }
  if (!runtimeText.includes("const hasWorkspaceCanvasUserInteractionAfterOpen = React.useCallback((): boolean => {")
    || !runtimeText.includes("const userInteractionAfterWorkspaceOpen =")
    || !runtimeText.includes("workspace-open-user-controlled-preserve-current")
    || !runtimeText.includes("workspace-open-user-controlled-infinite-canvas-preserve-current")) {
    throw new Error('expected Flow runtime workspace-open recovery to preserve user-controlled transforms after zoom/pan to avoid fly-off refits')
  }
  if (!runtimeText.includes('if (workspaceEditorOverlayOpen && workspaceOverlayUserControlledRef.current) {')
    || runtimeText.includes('if (workspaceEditorOverlayOpen && collectiveVisible && workspaceOverlayUserControlledRef.current) {')) {
    throw new Error('expected Flow runtime workspace-open user-controlled preserve guard to allow offscreen infinite-canvas panning without bounce-back')
  }
  if (!runtimeText.includes('const pointerInteractionAfterWorkspaceOpen =')
    || !runtimeText.includes("(lastPointerInCanvasRef.current?.ts || 0) > workspaceOverlayOpenedAtMsRef.current + 24")
    || !runtimeText.includes('&& pointerInteractionAfterWorkspaceOpen')) {
    throw new Error('expected Flow runtime workspace-open preserve-current guard to require recent canvas-pointer activity, not just generic interaction timing')
  }
  if (runtimeText.includes('workspaceOverlayOffscreenSinceMsRef')
    || runtimeText.includes('const workspaceOffscreenDebounced =')
    || runtimeText.includes('workspace-open-offscreen-debounce-pending')
    || runtimeText.includes('const shouldBypassWorkspaceOffscreenDebounce =')) {
    throw new Error('expected Flow runtime workspace-open infinite canvas to remove offscreen debounce/recovery refits')
  }
  if (!runtimeText.includes('workspace-open-viewport-settle-pending')) {
    throw new Error('expected Flow runtime workspace-open recovery to expose deterministic viewport-settle pending reason while pane geometry stabilizes')
  }
  const computedPositionsPath = resolve(process.cwd(), 'src', 'components', 'FlowCanvas', 'useFlowComputedPositions.ts')
  const computedPositionsText = readFileSync(computedPositionsPath, 'utf8')
  if (computedPositionsText.includes('const rev = typeof graphDataRevision')) {
    throw new Error('expected Flow computed positions graph key to avoid raw graphDataRevision churn')
  }
  if (!computedPositionsText.includes('const semanticGraphKey = buildGraphMetaKeyIgnoringPending(g)')) {
    throw new Error('expected Flow computed positions graph key to reuse semantic graph meta identity')
  }
  if (!computedPositionsText.includes('const topologySignature = buildFlowLayoutTopologyKey({ semanticGraphKey, nodes: nodeList, edges: edgeList })')
    || !computedPositionsText.includes('const graphKey = `graph:${topologySignature}:')) {
    throw new Error('expected Flow computed positions graph key to be based on semantic graph identity')
  }
  const flowCommitGuardIndex = commitText.indexOf('shouldCommitFlowLayoutPositions({')
  const flowCommitWriteIndex = commitText.indexOf('if (changed) setLayoutPositionsForMode(cacheKey, nextPositions)')
  if (flowCommitGuardIndex < 0 || flowCommitWriteIndex < 0 || flowCommitGuardIndex > flowCommitWriteIndex) {
    throw new Error('expected Flow request commit to gate layout persistence through an explicit workspace-guard override contract')
  }
  const computedGuardIndex = computedText.indexOf('!isWorkspaceGraphMutationBlocked(workspaceState)')
  const computedWriteIndex = computedText.indexOf('setLayoutPositionsForMode(cacheKey, packed)')
  if (computedGuardIndex < 0 || computedWriteIndex < 0 || computedGuardIndex > computedWriteIndex) {
    throw new Error('expected Flow computed positions to block layout cache writes while Workspace/Indexing mutation guard is active')
  }
  if (!computedText.includes("cacheScope: 'flow-canvas-computed-positions-scene-graph'") || !computedText.includes('getCachedGraphLookup({')) {
    throw new Error('expected Flow computed positions to reuse the shared scene-graph lookup helper instead of rebuilding local Mermaid sizing maps')
  }
  const storePath = resolve(process.cwd(), 'src', 'hooks', 'useGraphStore.ts')
  const storeText = readFileSync(storePath, 'utf8')
  const rootLayoutGuardIndex = storeText.indexOf('if (isWorkspaceGraphMutationBlocked(get())) return')
  const rootLayoutWriteIndex = storeText.indexOf('set({ layoutPositionCacheByMode: { ...prev, [key]: positions } })')
  if (rootLayoutGuardIndex < 0 || rootLayoutWriteIndex < 0 || rootLayoutGuardIndex > rootLayoutWriteIndex) {
    throw new Error('expected root layout cache setter to reject Workspace/Indexing mutation writes')
  }
  const toolbarPath = resolve(process.cwd(), 'src', 'components', 'Toolbar.tsx')
  const toolbarText = readFileSync(toolbarPath, 'utf8')
  if (toolbarText.includes('__flowCanvasDebug.lastRuntimeTransform')) {
    throw new Error('expected temporary Flow debug readout to move out of Toolbar and reuse toast SSOT')
  }
  const debugPath = resolve(process.cwd(), 'src', 'components', 'FlowCanvas', 'flowCanvasDebug.ts')
  const debugText = readFileSync(debugPath, 'utf8')
  if (!debugText.includes("const FLOW_CANVAS_DEBUG_TOAST_ID = 'flow-canvas-runtime-debug-status'")) {
    throw new Error('expected Flow debug helper to define a stable toast SSOT id for temporary runtime readout')
  }
  if (!text.includes("import { isWorkspaceEditorOverlayOpen, isWorkspaceGraphMutationBlocked } from '@/features/workspace-table/workspaceTableSsot'")) {
    throw new Error('expected FlowCanvas media overlays to distinguish visible workspace overlay state from shared workspace/indexing mutation guards')
  }
  if (!text.includes('const workspaceOverlayOpenRef = React.useRef(false)')) {
    throw new Error('expected FlowCanvas media overlays to track workspace overlay open state without layout-key coupling')
  }
  if (!text.includes('const workspaceMutationBlockedRef = React.useRef(false)')) {
    throw new Error('expected FlowCanvas media overlays to track mutation blocking separately from visible workspace overlay state')
  }
  if (!text.includes('const workspaceOverlayOpen = useGraphStore(s => isWorkspaceEditorOverlayOpen(s))') || text.includes('workspaceOverlayOpenKey') || text.includes('setWorkspaceOverlayOpenKey') || text.includes('setWorkspaceMutationBlockedKey')) {
    throw new Error('expected FlowCanvas media overlays to restart passive layout from semantic workspace overlay selector transitions without state-key churn')
  }
  if (!text.includes('const stopPassiveLayoutWhileWorkspaceOverlayOpen =\n      workspaceOverlayOpenRef.current && !storyboardWidgetFrontmatterDocumentModeRequested')) {
    throw new Error('expected FlowCanvas media overlays to derive a frontmatter-aware passive layout exception while workspace overlay is open')
  }
  if (!text.includes('if (!active || mediaLayoutItems.length === 0 || stopPassiveLayoutWhileWorkspaceOverlayOpen)')) {
    throw new Error('expected Rich Media layout loop shutdown to exempt frontmatter document mode from workspace-open passive-layout parking')
  }
  if (!text.includes('const storyboardWidgetSurfaceRendererMode = isStoryboardWidgetSurfaceRenderer(canvas2dRenderer)') || !text.includes("const mediaOverlayDragInteractionMode = storyboardWidgetSurfaceRendererMode || storyboardSharedSurfaceRendererMode || canvas2dRenderer === 'flowCanvas'")) {
    throw new Error('expected Rich Media overlay drag/pan interactions to use the shared Storyboard Widget surface/Flow Canvas gate')
  }
  if (!text.includes('resolveFlowCanvasMediaOverlayInteractionPolicy')) {
    throw new Error('expected Rich Media overlay interactions to reuse the shared FlowCanvas interaction policy')
  }
  if (!text.includes('const overlayInteractionEnabled = mediaOverlayInteractionPolicy.overlayPanActive')) {
    throw new Error('expected Rich Media overlay pan to stay controlled by the shared renderer interaction policy')
  }
  if (!text.includes('const headerDragInteractionActive = mediaOverlayInteractionPolicy.headerDragActive')) {
    throw new Error('expected Rich Media header drag to stay controlled by the shared renderer interaction policy')
  }
  if (!text.includes('const resizeInteractionActive = mediaOverlayInteractionPolicy.resizeActive')) {
    throw new Error('expected Rich Media resize to stay controlled by the shared renderer interaction policy')
  }
  if (!text.includes('const overlayPanelPointerEventsClass = mediaOverlayInteractionPolicy.panelPointerEventsClassName')) {
    throw new Error('expected Rich Media overlays to centralize pointer-event policy without workspace-open pointer suppression')
  }
  if (!text.includes('className={`absolute left-0 top-0 overflow-visible ${overlayPanelPointerEventsClass}`') || !text.includes('data-kg-rich-media-storyboard-widget-overlay-shell="1"')) {
    throw new Error('expected Rich Media overlays to keep the shared pointer policy at the storyboard-widget overlay shell')
  }
  if (!text.includes('onWheelCapture={mediaOverlayInteractionPolicy.capturePanelEvents ? stopEvent : undefined}')) {
    throw new Error('expected Rich Media overlay wheel capture to follow the shared interaction policy')
  }
  if (!text.includes('const cancelMediaOverlayInteractionState = React.useCallback(')) {
    throw new Error('expected FlowCanvas media overlays to centralize cancellation of delayed interaction writes')
  }
  const workspaceOpenCancelIndex = text.indexOf('if (workspaceMutationBlocked) cancelMediaOverlayInteractionState({ preserveWorldPositionOverrides: true })')
  const schedulerCancelIndex = text.indexOf('mediaOverlayHeaderMoveSchedulerRef.current?.cancel()')
  if (workspaceOpenCancelIndex < 0 || schedulerCancelIndex < 0) {
    throw new Error('expected workspace overlay open transition to cancel queued Rich Media overlay writes before they can flush after close')
  }
  const richMediaResizeMoveIndex = text.indexOf('const applyMediaOverlayResizeMove = React.useCallback')
  const richMediaRuntimeGuardIndex = text.indexOf('if (!mediaOverlayDragInteractionMode || resizeMutationBlockedRef.current) return', richMediaResizeMoveIndex)
  const richMediaResizeWriteIndex = text.indexOf('mediaOverlayPanelSizeOverrideRef.current.set(id', richMediaRuntimeGuardIndex)
  if (richMediaResizeMoveIndex < 0 || richMediaRuntimeGuardIndex < 0 || richMediaResizeWriteIndex < 0 || richMediaRuntimeGuardIndex > richMediaResizeWriteIndex) {
    throw new Error('expected Rich Media resize runtime writes to use the source-aware shared mutation guard')
  }
  const resizeGuardIndex = text.indexOf('if (!resizeMutationBlockedRef.current) {')
  const resizeWriteIndex = text.indexOf('const nextProperties = { ...baseProps, \'visual:width\': drag.lastW, \'visual:height\': drag.lastH }')
  if (resizeGuardIndex < 0 || resizeWriteIndex < 0 || resizeGuardIndex > resizeWriteIndex) {
    throw new Error('expected Rich Media resize persistence to remain blocked only when no canonical source mutation owner is available')
  }
  if (text.includes('workspaceViewLayoutRefreshNonce')) {
    throw new Error('expected FlowCanvas media overlay scheduling to avoid workspace layout refresh nonce coupling')
  }
}

export function testWorkspaceViewSelectRefreshesCollectiveLayoutWithoutCloseReopen() {
  const p = resolve(process.cwd(), 'src', 'components', 'toolbar', 'EditorWorkspaceSelect.tsx')
  const text = readFileSync(p, 'utf8')
  if (text.includes('bumpWorkspaceViewLayoutRefreshNonce')) {
    throw new Error('expected Workspace View toolbar selection to avoid layout refresh nonce bump side-effects')
  }
}

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

  const graphDataSlicePath = resolve(process.cwd(), 'src', 'hooks', 'store', 'graph-data-slice', 'graphDataCommitActions.ts')
  const graphDataSliceText = readFileSync(graphDataSlicePath, 'utf8')
  if (!graphDataSliceText.includes('preserveStableSameSourceOverlayState')) {
    throw new Error('expected graph commit path to preserve stable same-source collective overlay state during indexing recomposition')
  }
  if (!graphDataSliceText.includes('resolveCommittedFlowWidgetScreenPositions')) {
    throw new Error('expected graph commit path to centralize collective screen-position carry/cleanup decisions')
  }
  if (!graphDataSliceText.includes('currentSourceIdentity === nextSourceIdentity')) {
    throw new Error('expected graph commit path to forbid cross-source frontmatter balanced overlay carry-forward on source-file switches')
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
