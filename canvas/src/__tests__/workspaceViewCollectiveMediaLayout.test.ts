import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
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
  if (!runtimeText.includes('const storyboardCameraViewKey = React.useMemo(() => {')
    || !runtimeText.includes('buildFlowZoomGraphMetaKey({')
    || !runtimeText.includes('hasInitializedStoryboardZoomView(lastInitTransformZoomViewKeyRef.current, initKey)')
    || !runtimeText.includes('const workspaceOverlayOpenPrevRef = React.useRef(workspaceEditorOverlayOpen === true)')
    || runtimeText.includes('initializedStoryboardZoomViewKeys')) {
    throw new Error('expected Storyboard camera initialization authority to remain runtime-scoped so remounts restore or fit the active document instead of preserving identity')
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
  if (!runtimeTextIncludesAll('if (open && !prev) {', 'lastInitTransformZoomViewKeyRef.current = storyboardCameraViewKey')
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
  const overlayOpenTimestampIndex = runtimeText.indexOf('workspaceOverlayOpenedAtMsRef.current = Date.now()')
  if (overlayOpenCameraClaimIndex < 0
    || overlayOpenTimestampIndex < overlayOpenCameraClaimIndex) {
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
