import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { hasStableSameSourceTopology } from '@/hooks/store/graph-data-slice/graphDataRetainedPlacementContinuity'
import type { GraphData } from '@/lib/graph/types'
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
  const runtimeSource = readFileSync(runtimePath, 'utf8')
  if (!runtimeSource.includes("from './storyboardWidgetRuntimeSceneDiagnostics'") || !runtimeSource.includes('pushStoryboardWidgetRuntimeSceneTrace(')) throw new Error('expected the runtime scene to call its shared diagnostics owner')
  const runtimeText = runtimeSource + readFileSync(resolve(process.cwd(), 'src/components/StoryboardWidgetCanvas/runtime/storyboardWidgetRuntimeSceneDiagnostics.ts'), 'utf8')
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
  if (!graphStateText.includes('allowNodeDragOverride !== false && documentStructureBaselineLock !== true')) {
    throw new Error('expected FlowCanvas mutations to honor explicit node-drag and document baseline locks')
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
  const graphDataCommitText = readFileSync(graphDataSlicePath, 'utf8')
  if (!graphDataCommitText.includes('buildCommittedFlowWidgetState(') || !graphDataCommitText.includes("from './graphDataWidgetStateCommit'")) throw new Error('expected graph commits to call the shared widget-state owner')
  const graphDataSliceText = graphDataCommitText + readFileSync(resolve(process.cwd(), 'src/hooks/store/graph-data-slice/graphDataWidgetStateCommit.ts'), 'utf8')
  if (!graphDataSliceText.includes("import { buildCanonicalNodeLookup, canonicalNodeIdSetHas, parseCanonicalNodeIds } from '@/lib/graph/canonicalNodeIds'")) {
    throw new Error('expected graph commit carry-forward path to reuse shared canonical node identity helpers for workspace-prefixed graph clones')
  }
  if (!graphDataSliceText.includes('function remapNodeKeyedRecordByCanonicalNodeId<T>(')) {
    throw new Error('expected graph commit carry-forward path to centralize canonical remapping for node-keyed overlay state')
  }
  const topology = (prefix: string): GraphData => ({ type: 'Graph', nodes: [{ id: `${prefix}::a`, type: 'InputWidget', label: 'Input', properties: {} }, { id: `${prefix}::b`, type: 'TextGeneration', label: 'Output', properties: {} }], edges: [{ id: `${prefix}::e`, source: `${prefix}::a`, target: `${prefix}::b`, label: 'Flow', properties: {} }] })
  const original = topology('original'); const composed = topology('composed')
  if (!hasStableSameSourceTopology(original, composed)) throw new Error('expected source prefixes to preserve node and edge topology')
  if (hasStableSameSourceTopology(original, { ...composed, edges: [{ ...composed.edges[0]!, target: 'composed::a' }] })) throw new Error('expected changed edge endpoints to invalidate retained topology')
  if (hasStableSameSourceTopology(original, { ...composed, nodes: composed.nodes.slice(0, 1) })) throw new Error('expected removed nodes to invalidate retained topology')
  if (!graphDataSliceText.includes('return carry ? remapNodeKeyedRecordByCanonicalNodeId(graphData, values) : {}') || !graphDataSliceText.includes('const posRaw = select(previous?.pos || {})')) {
    throw new Error('expected graph commit carry-forward path to remap stored Flow widget screen positions onto canonical next-graph ids')
  }
  if (!graphDataSliceText.includes('const worldRaw = select(previous?.world || {})')) {
    throw new Error('expected graph commit carry-forward path to remap stored Flow widget world positions onto canonical next-graph ids')
  }
  const storePath = resolve(process.cwd(), 'src', 'hooks', 'store', 'graphViewSlice.ts')
  const storeText = readFileSync(storePath, 'utf8')
  if (!storeText.includes('isWorkspaceGraphMutationBlocked,')
    || !storeText.includes("from '@/features/workspace-table/workspaceTableSsot'")) {
    throw new Error('expected Flow widget store setters to reuse the shared workspace/indexing mutation guard')
  }
  const storePinnedGuardIndex = storeText.indexOf('if (isWorkspaceGraphMutationBlocked(state)) return')
  const storePinnedWriteIndex = storeText.indexOf("persistFlowWidgetDocument(graphKey, 'pinned')")
  if (storePinnedGuardIndex < 0 || storePinnedWriteIndex < 0 || storePinnedGuardIndex > storePinnedWriteIndex) {
    throw new Error('expected root Flow widget pinned-state setter to reject Workspace/Indexing mutation writes')
  }
  const storeScreenGuardIndex = storeText.indexOf('if (isWorkspaceGraphMutationBlocked(state) && options?.allowDuringWorkspaceMutation !== true) return', storePinnedGuardIndex + 1)
  const storeScreenWriteIndex = storeText.indexOf("persistFlowWidgetDocument(graphKey, 'pos')")
  if (storeScreenGuardIndex < 0 || storeScreenWriteIndex < 0 || storeScreenGuardIndex > storeScreenWriteIndex) {
    throw new Error('expected root Flow widget screen-position setter to reject Workspace/Indexing mutation writes')
  }
  const storeWorldGuardIndex = storeText.indexOf('if (isWorkspaceGraphMutationBlocked(state) && options?.allowDuringWorkspaceMutation !== true) return', storeScreenGuardIndex + 1)
  const storeWorldWriteIndex = storeText.indexOf("persistFlowWidgetDocument(graphKey, 'world')")
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

export {
  testWorkspaceViewUpdateSchedulesFrontmatterMediaOverlayLayoutRefresh,
  testWorkspaceViewSelectRefreshesCollectiveLayoutWithoutCloseReopen,
} from './workspaceViewCollectiveMediaLayout.test'
export {
  testCollectiveInitializationIndexingAndWorkspaceToggleDoNotMutateBalancedLayoutContracts,
  testD3SceneBuildKeyIgnoresWorkspaceGestureOverlayToggles,
} from './workspaceViewCollectiveInitialization.test'
export {
  testStoryboardWidgetOverlayFitNormalizesSurfaceWindowOffset,
} from './workspaceViewStoryboardWidgetOverlayFitRegression.test'
