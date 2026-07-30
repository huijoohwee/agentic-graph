import fs from 'node:fs'
import path from 'node:path'

import { shouldPreserveEstablishedWorkspaceOverlayCamera } from '@/components/FlowCanvas/workspaceVisibleViewportRecovery'

export function testStoryboardWidgetRuntimeUsesOverlayCollectiveViewportStateForRecovery() {
  const runtimePath = path.resolve(process.cwd(), 'src', 'components', 'FlowCanvas', 'useFlowCanvasRuntime.ts')
  const runtimeText = fs.readFileSync(runtimePath, 'utf8')
  const recoveryPath = path.resolve(process.cwd(), 'src', 'components', 'FlowCanvas', 'workspaceVisibleViewportRecovery.ts')
  const recoveryText = fs.readFileSync(recoveryPath, 'utf8')

  if (!runtimeText.includes("import {\n  buildWorkspaceVisibleViewportFitRecoveryKey,")
    || !runtimeText.includes("} from '@/components/FlowCanvas/workspaceVisibleViewportRecovery'")) {
    throw new Error('expected Flow runtime to reuse the shared visible-viewport recovery helper')
  }
  if (!recoveryText.includes('export function deriveFlowOverlayCollectiveViewportState(args: {')) {
    throw new Error('expected shared Flow recovery helper to derive viewport visibility from actual overlay collective bounds')
  }
  if (!runtimeText.includes('const overlayCollectiveState = deriveFlowOverlayCollectiveViewportState({')) {
    throw new Error('expected Flow runtime recovery to measure overlay collective viewport state before preservation decisions')
  }
  const runtimeScenePath = path.resolve(
    process.cwd(),
    'src',
    'components',
    'StoryboardWidgetCanvas',
    'runtime',
    'useStoryboardWidgetRuntimeScene.ts',
  )
  const runtimeSceneText = fs.readFileSync(runtimeScenePath, 'utf8')
  const storyboardRuntimePath = path.resolve(
    process.cwd(),
    'src',
    'components',
    'StoryboardWidgetCanvas.runtime.tsx',
  )
  const storyboardRuntimeText = fs.readFileSync(storyboardRuntimePath, 'utf8')
  if (!runtimeSceneText.includes('selector: CANVAS_OVERLAY_PROXY_ROOT_SELECTOR,')
    || !runtimeSceneText.includes('collectCanonicalStoryboardWidgetOverlayRectEntries(roots)')) {
    throw new Error('expected topology recovery to measure the canonical mixed Widget Card and Rich Media Panel collective')
  }
  if (!runtimeSceneText.includes('const getRenderedZoomTransform = React.useCallback(() => {')
    || !runtimeSceneText.includes('return readFiniteRuntimeZoomTransform(flowRuntimeRefRef.current?.current)')
    || !runtimeSceneText.includes('getRenderedZoomTransform,')) {
    throw new Error('expected Run capture to expose the finite coordinate frame currently painted by the runtime')
  }
  if (!runtimeSceneText.includes('const getRenderedOverlayRectForNode = React.useCallback((nodeId: string) => {')
    || !runtimeSceneText.includes('collectCanonicalStoryboardWidgetOverlayRectEntries(roots)')
    || !runtimeSceneText.includes('left: entry.rect.left - surfaceRect.left')
    || !runtimeSceneText.includes('getRenderedOverlayRectForNode,')) {
    throw new Error('expected Run capture to expose the canonical rendered source rectangle in surface-local coordinates')
  }
  if (!storyboardRuntimeText.includes('renderedScreenRect: getRenderedOverlayRectForNode(nodeId),')) {
    throw new Error('expected Run execution anchoring to prefer the actually rendered source rectangle before ambiguous store or graph coordinates')
  }
  const renderedTransformReadIndex = storyboardRuntimeText.indexOf('getRenderedZoomTransform()')
  const guardedTransformReadIndex = storyboardRuntimeText.indexOf('getLiveZoomTransform()', renderedTransformReadIndex)
  const neutralTransformFallbackIndex = storyboardRuntimeText.indexOf('|| { k: 1, x: 0, y: 0 }', guardedTransformReadIndex)
  if (
    renderedTransformReadIndex < 0
    || guardedTransformReadIndex < 0
    || neutralTransformFallbackIndex < 0
    || renderedTransformReadIndex > guardedTransformReadIndex
    || guardedTransformReadIndex > neutralTransformFallbackIndex
  ) {
    throw new Error('expected immutable Run capture to prefer the rendered camera before guarded or neutral fallbacks')
  }
  if (!runtimeSceneText.includes('if (establishedTopologyChanged) return true')) {
    throw new Error('expected same-view topology growth to preserve graph-authored placement and the established camera')
  }
  if (runtimeSceneText.includes("'content-materialization-offscreen-collective-visible-viewport-recovery'")
    || runtimeSceneText.includes("'topology-change-offscreen-collective-visible-viewport-recovery'")
    || runtimeSceneText.includes('st.requestZoomTransform(nextTransform)')) {
    throw new Error('expected ordinary Run/topology materialization to never mutate the camera as a downstream recovery')
  }
  if (runtimeSceneText.includes('if (preserveExistingCollective) return true')) {
    throw new Error('expected topology growth to stop suppressing canonical mixed-overlay recovery')
  }
  if (!runtimeText.includes('const collectiveVisible = overlayCollectiveState?.visible ?? graphVisible')) {
    throw new Error('expected Flow runtime recovery to prefer overlay collective visibility over raw scene-node visibility when overlays exist')
  }
  if (!runtimeText.includes('const collectiveBalanced = overlayCollectiveState?.balanced ?? graphBalanced')) {
    throw new Error('expected Flow runtime recovery to prefer overlay collective balance over raw scene-node balance when overlays exist')
  }
  if (!runtimeText.includes('const collectiveCentered = overlayCollectiveState?.centered ?? graphCentered')) {
    throw new Error('expected Flow runtime recovery to prefer overlay collective centering over raw scene-node centering when overlays exist')
  }
  if (!recoveryText.includes('const fitsVisibleViewport =')
    || !recoveryText.includes('spanW <= visibleViewport.width * 1.4')
    || !recoveryText.includes('spanH <= visibleViewport.height * 1.4')) {
    throw new Error('expected Flow runtime recovery to reject huge centered-looking collectives that do not fit the visible workspace viewport')
  }
  if (!recoveryText.includes('offscreen: boolean') || !runtimeText.includes('workspace-open-offscreen-visible-viewport-refit')) {
    throw new Error('expected Flow runtime to keep measuring offscreen overlay state before bounded visible-viewport refit')
  }
  if (runtimeText.includes('allowAutomaticOverlayCentroidRecovery')
    || runtimeText.includes('allowOverlayCentroidRecovery')
    || runtimeText.includes('overlayCollectiveNeedsRecovery')
    || runtimeText.includes('const shouldRecenterOverlayCollective =')) {
    throw new Error('expected Flow runtime to remove automatic overlay recovery/recentering so ordinary pan/zoom stays infinite-canvas')
  }
  if (!runtimeText.includes('if (shouldPreserveEstablishedWorkspaceOverlayCamera({')
    || !runtimeText.includes('initializedForView: hasInitializedStoryboardZoomView(lastInitTransformZoomViewKeyRef.current, storyboardCameraViewKey),')) {
    throw new Error('expected workspace-open established camera authority to survive transient topology coverage changes')
  }
  if (runtimeText.includes('const workspaceOpenCurrentTransformUsable =')
    || runtimeText.includes('const initOverlayCollectiveState = storyboardWidgetMode')) {
    throw new Error('expected workspace-open init-fit to stop rejecting user pans because the overlay collective moved offscreen')
  }
  if (!runtimeText.includes("workspace-open-offscreen-visible-viewport-refit-pending")
    || !runtimeText.includes("workspace-open-initialized-init-preserve-current")
    || !runtimeText.includes("workspace-open-user-controlled-init-preserve-current")) {
    throw new Error('expected workspace-open init-fit to preserve initialized/user-controlled transforms while bounded recovery handles pre-interaction offscreen fits')
  }
  if (!runtimeText.includes('const workspaceVisibleViewportFitRecoveryKeyRef = React.useRef<string | null>(null)')
    || !runtimeText.includes('workspace-open-visible-viewport-bounds-fit')
    || !runtimeText.includes('visible-viewport:overlay-bounds-fit')
    || !runtimeText.includes('buildWorkspaceVisibleViewportFitRecoveryKey({')
    || !recoveryText.includes("buildScopedGraphSemanticKey('storyboard-widget-workspace-visible-viewport-fit'")) {
    throw new Error('expected workspace-open recovery to use one bounded overlay-bounds fit without recurring viewport churn')
  }
  if (!runtimeText.includes('!hasInitializedStoryboardZoomView(lastInitTransformZoomViewKeyRef.current, storyboardCameraViewKey) && !overlayBounds')) {
    throw new Error('expected workspace-open recovery to allow live overlay-bounds fitting even before init key catches up')
  }
  if (!runtimeText.includes('if (workspaceEditorOverlayOpen && workspaceOverlayUserControlledRef.current) {')
    || !runtimeText.includes('workspace-open-user-controlled-infinite-canvas-preserve-current')) {
    throw new Error('expected user-controlled workspace-open offscreen transforms to be preserved for infinite canvas panning')
  }
  if (runtimeText.includes('scheduleWorkspaceOffscreenRecoveryRetry')
    || runtimeText.includes('const shouldLatchRecoveryKey =')
    || runtimeText.includes('lastOffscreenOverlayRecoveryKeyRef')) {
    throw new Error('expected Flow runtime to remove offscreen recovery retry/latch state that can bounce the infinite canvas')
  }
  if (!runtimeText.includes('if (workspaceEditorOverlayOpen && collectiveVisible && (collectiveBalanced || collectiveCentered)) workspaceOverlayStabilizedRef.current = true')) {
    throw new Error('expected workspace-open stabilization to require balanced or centered overlay collective state')
  }
  if (!runtimeText.includes('workspace-open-visible-balanced-preserve-current')) {
    throw new Error('expected workspace-open preserve path to remain active after overlay-collective visibility gating')
  }
  if (!shouldPreserveEstablishedWorkspaceOverlayCamera({
    initializedForView: false,
    workspaceEditorOverlayOpen: true,
    workspaceOverlayStabilized: true,
  })) {
    throw new Error('expected a stabilized open workspace to preserve its camera during ordinary topology growth')
  }
  if (shouldPreserveEstablishedWorkspaceOverlayCamera({
    initializedForView: false,
    workspaceEditorOverlayOpen: true,
    workspaceOverlayStabilized: false,
  })) {
    throw new Error('expected an unstabilized workspace to retain initial visible-viewport recovery authority')
  }
  if (!shouldPreserveEstablishedWorkspaceOverlayCamera({
    initializedForView: true,
    workspaceEditorOverlayOpen: true,
    workspaceOverlayStabilized: false,
  })) {
    throw new Error('expected the initialized current view to preserve its camera even when a mixed collective never reports balanced')
  }
}

export function testStoryboardWidgetFitRecenteringClampsOverlayBoundsIntoVisibleViewport() {
  const zoomPath = path.resolve(process.cwd(), 'src', 'components', 'FlowCanvas', 'applyZoomRequestNative.ts')
  const text = fs.readFileSync(zoomPath, 'utf8')

  if (!text.includes('const desiredDeltaX = visibleViewport.centerX - centroid.x')) {
    throw new Error('expected Storyboard Widget overlay recentering to compute the desired horizontal centroid shift first')
  }
  if (!text.includes('const minDeltaX = visibleViewport.left - bounds.minX')) {
    throw new Error('expected Storyboard Widget overlay recentering to clamp against the visible viewport left edge')
  }
  if (!text.includes('const maxDeltaX = visibleViewport.right - bounds.maxX')) {
    throw new Error('expected Storyboard Widget overlay recentering to clamp against the visible viewport right edge')
  }
  if (!text.includes('const minDeltaY = visibleViewport.top - bounds.minY')) {
    throw new Error('expected Storyboard Widget overlay recentering to clamp against the visible viewport top edge')
  }
  if (!text.includes('const maxDeltaY = visibleViewport.bottom - bounds.maxY')) {
    throw new Error('expected Storyboard Widget overlay recentering to clamp against the visible viewport bottom edge')
  }
  if (!text.includes('? Math.max(minDeltaX, Math.min(maxDeltaX, desiredDeltaX))')) {
    throw new Error('expected Storyboard Widget overlay recentering to clamp horizontal recovery inside visible viewport bounds')
  }
  if (!text.includes('? Math.max(minDeltaY, Math.min(maxDeltaY, desiredDeltaY))')) {
    throw new Error('expected Storyboard Widget overlay recentering to clamp vertical recovery inside visible viewport bounds')
  }
}

export function testStoryboardWidgetOverlayPlacementRuntimePersistsOffscreenScreenWrites() {
  const runtimePath = path.resolve(process.cwd(), 'src', 'components', 'StoryboardWidget', 'useWidgetPlacementRuntime.ts')
  const text = fs.readFileSync(runtimePath, 'utf8')

  if (text.includes('const screenLooksFarOffscreen =') || text.includes('screenLooksFarOffscreen) return')) {
    throw new Error('expected Storyboard Widget overlay placement runtime to persist far-offscreen screen coordinates for infinite-canvas behavior')
  }
  if (text.includes('const worldLooksFarOffscreen =') || text.includes('worldLooksFarOffscreen) return')) {
    throw new Error('expected Storyboard Widget overlay placement runtime to persist far-offscreen world coordinates for infinite-canvas behavior')
  }
  if (!text.includes('isWorkspaceGraphMutationBlocked(state)')) {
    throw new Error('expected Storyboard Widget overlay placement runtime to retain graph-scoped writes during workspace mutation windows')
  }
}

export function testStoryboardWidgetOverlayPlacementRuntimeSkipsStaleStoreZoomFallbackForWorkspaceBlockedPinnedWidgets() {
  const runtimePath = path.resolve(process.cwd(), 'src', 'components', 'StoryboardWidget', 'useWidgetPlacementRuntime.ts')
  const runtimeStatePath = path.resolve(process.cwd(), 'src', 'components', 'StoryboardWidget', 'widgetPlacementRuntimeState.ts')
  const runtimeText = fs.readFileSync(runtimePath, 'utf8')
  const runtimeStateText = fs.readFileSync(runtimeStatePath, 'utf8')

  if (!runtimeText.includes('const shouldBypassStoreZoomFallback = React.useCallback((liveZoom: { k: number; x: number; y: number } | null): boolean => {')) {
    throw new Error('expected Storyboard Widget overlay placement runtime to centralize the stale store-zoom fallback guard for workspace-blocked pinned widgets')
  }
  if (!runtimeStateText.includes('if (!isWorkspaceGraphMutationBlocked(state)) return false')) {
    throw new Error('expected Storyboard Widget overlay placement runtime to gate stale store-zoom bypass on workspace-blocked state')
  }
  if (!runtimeText.includes('hasStoredWorldPos: !!readStoredWidgetWorldPos(),') || !runtimeStateText.includes('return hasStoredWorldPos')) {
    throw new Error('expected Storyboard Widget overlay placement runtime to bypass stale store-zoom fallback only when a seeded pinned widget world position already exists')
  }
  if (!runtimeStateText.includes('let z = liveZoom || (bypassStore ? null : zoomStateRef.current)')) {
    throw new Error('expected Storyboard Widget overlay placement runtime to refuse cached store zoom when workspace-blocked pinned world authority is already available')
  }
  if (!runtimeStateText.includes('if (!liveZoom && !bypassStore && storeZoom && storeZoom !== z) {')) {
    throw new Error('expected Storyboard Widget overlay placement runtime to use persisted store zoom only when the workspace-blocked bypass is inactive')
  }
}

export function testStoryboardWidgetOverlayPlacementRuntimeIgnoresProjectedOffscreenFrontmatterStoredWorld() {
  const runtimePath = path.resolve(process.cwd(), 'src', 'components', 'StoryboardWidget', 'useWidgetPlacementRuntime.ts')
  const text = fs.readFileSync(runtimePath, 'utf8')
  const frontmatterPlacementPath = path.resolve(process.cwd(), 'src', 'components', 'StoryboardWidget', 'widgetFrontmatterPlacement.ts')
  const frontmatterPlacementText = fs.readFileSync(frontmatterPlacementPath, 'utf8')

  if (!text.includes('const storedWorldScreen = storedWorld ? worldToScreen({ transform: placementTransform, x: storedWorld.x, y: storedWorld.y }) : null')) {
    throw new Error('expected Storyboard Widget placement runtime to project stored widget world positions through the active transform')
  }
  if (!text.includes("import { isFrontmatterManagedOverlayNode, resolveFrontmatterBalancedFallbackPos } from '@/components/StoryboardWidget/widgetFrontmatterPlacement'")
    || !frontmatterPlacementText.includes('function isFrontmatterManagedOverlayNode(')
    || !frontmatterPlacementText.includes('isFrontmatterCollectiveNode(node)')
    || !text.includes('const frontmatterManagedNode = isFrontmatterManagedOverlayNode(graphMetaKind, n)')) {
    throw new Error('expected projected offscreen stored-world guard to be scoped by shared frontmatter collective node semantics')
  }
  if (!text.includes('const effectiveStoredWorld = storedWorldFarOffscreen ? null : storedWorld')) {
    throw new Error('expected Storyboard Widget placement runtime to ignore frontmatter stored widget positions that project far offscreen')
  }
  if (!frontmatterPlacementText.includes("import { placeWidgetsCenteredInGroupBounds } from '@/components/StoryboardWidget/seedGroupSpread'")
    || !frontmatterPlacementText.includes("placeWidgetsCenteredInGroupBounds({")
    || !frontmatterPlacementText.includes("preset: 'widgetFrontmatter'")
    || !text.includes('const frontmatterBaseFarOffscreen = frontmatterManagedNode')) {
    throw new Error('expected Storyboard Widget placement runtime to recover frontmatter overlays through the shared centered spread fallback when anchored geometry is far offscreen')
  }
  if (!frontmatterPlacementText.includes("computeBalancedSpreadBaseGapPx({ viewportW: args.viewportW, viewportH: args.viewportH, preset: 'widgetFrontmatter', margins })")
    || text.includes('baseGapPx: 24')
    || frontmatterPlacementText.includes('baseGapPx: 24')) {
    throw new Error('expected Storyboard Widget placement runtime to reuse the shared balanced-spread gap helper without fixed fallback spacing')
  }
  if (!text.includes("import { emitStoryboardWidgetInteractionFrame } from '@/lib/canvas/storyboard-widget-overlay-proxy'")
    || !text.includes('emitStoryboardWidgetInteractionFrame()')) {
    throw new Error('expected Storyboard Widget placement runtime to notify recovery observers after programmatic overlay placement changes')
  }
  if (!text.includes('const worldPinned = worldDragOverride || effectiveStoredWorld || defaultWorld')) {
    throw new Error('expected Storyboard Widget placement runtime to fall back to live anchored placement after rejecting stale stored world positions')
  }
}

export function testStoryboardWidgetRuntimeSceneReusesLastUsableTransformWhileWorkspaceSceneIsUnsettled() {
  const runtimeScenePath = path.resolve(process.cwd(), 'src', 'components', 'StoryboardWidgetCanvas', 'runtime', 'useStoryboardWidgetRuntimeScene.ts')
  const text = fs.readFileSync(runtimeScenePath, 'utf8')

  if (!text.includes("import { resolveStoryboardWidgetVisibleViewport } from '@/components/FlowCanvas/applyZoomRequestNative'")) {
    throw new Error('expected Storyboard Widget runtime scene to reuse the shared pane-aware visible viewport helper')
  }
  if (!text.includes('const getVisibleViewport = React.useCallback(() => {')) {
    throw new Error('expected Storyboard Widget runtime scene to centralize visible viewport resolution for workspace-open layout decisions')
  }
  if (!text.includes('const visibleViewport = getVisibleViewport()')
    || !text.includes('const offscreen =')
    || !text.includes('if (offscreen) return false')) {
    throw new Error('expected Storyboard Widget runtime scene to reject stale reopen authorities that project the widget collective outside the visible workspace viewport')
  }
  if (text.includes('normalizeTransformToVisibleViewport') || text.includes("reason: 'workspace-blocked-unsettled-transform-reusing-last-usable'")) {
    throw new Error('expected Storyboard Widget runtime scene to avoid viewport-normalized transform reuse that can bounce the infinite canvas')
  }
  if (!text.includes('lastUsableZoomTransformRef.current = next')) {
    throw new Error('expected Storyboard Widget runtime scene to accept live transforms as authoritative during interaction')
  }
  if (!text.includes("reason: 'scene-empty-using-last-usable-transform'")) {
    throw new Error('expected Storyboard Widget runtime scene to reuse the last live transform only for empty-scene recomposition')
  }
  if (!text.includes("reason: 'scene-empty-using-live-runtime-transform'")) {
    throw new Error('expected Storyboard Widget runtime scene to keep overlay-only widget pan/zoom frames on the live transform authority')
  }
}

export function testStoryboardWidgetRuntimeSceneUsesNeutralSeedZoomForWorkspaceBlockedFrontmatterLanding() {
  const runtimeScenePath = path.resolve(process.cwd(), 'src', 'components', 'StoryboardWidgetCanvas', 'runtime', 'useStoryboardWidgetRuntimeScene.ts')
  const text = fs.readFileSync(runtimeScenePath, 'utf8')

  if (!text.includes('const workspaceMutationBlockedForSeed = isWorkspaceGraphMutationBlocked(st)')) {
    throw new Error('expected Storyboard Widget runtime scene seeding to derive a single workspace-blocked guard for frontmatter landing')
  }
  if (!text.includes("reason: 'workspace-blocked-skipping-flow-widget-seed-write'")) {
    throw new Error('expected Storyboard Widget runtime scene seeding to skip widget seed writes while frontmatter landing is workspace-blocked')
  }
  if (text.includes('const allowPersistedViewportOffsetSeed =') || text.includes('const persistedZoomForSeed =')) {
    throw new Error('expected Storyboard Widget runtime scene seeding to avoid stale workspace-blocked persisted-zoom branches')
  }
  if (!text.includes('const visibleViewport = getVisibleViewport()')) {
    throw new Error('expected Storyboard Widget runtime scene seeding to derive a pane-aware visible viewport before sizing the frontmatter collective')
  }
  if (!text.includes('viewportW: visibleViewport.width,')
    || !text.includes('viewportH: visibleViewport.height,')) {
    throw new Error('expected Storyboard Widget runtime scene seeding to size frontmatter collective scale against the visible viewport strip')
  }
  if (!text.includes('minX: (visibleViewport.left - zoomX) / safeZoomK')
    || !text.includes('maxX: (visibleViewport.right - zoomX) / safeZoomK')) {
    throw new Error('expected Storyboard Widget runtime scene viewport bucket to anchor frontmatter seeding to the visible strip instead of the full surface')
  }
}

export function testStoryboardWidgetRuntimeSceneNeutralizesPoisonedTransformForAutoSeededWidgets() {
  const runtimeScenePath = path.resolve(process.cwd(), 'src', 'components', 'StoryboardWidgetCanvas', 'runtime', 'useStoryboardWidgetRuntimeScene.ts')
  const text = fs.readFileSync(runtimeScenePath, 'utf8')

  const forbidden = [
    "reason: 'workspace-blocked-auto-seed-transform-neutralized'",
    "reason: 'workspace-blocked-auto-seed-transform-reusing-last-usable'",
    'buildAutoSeedWorldRectsForTransform',
    'normalizeTransformToVisibleViewport',
    'const lastUsableShowsAutoSeed =',
    'isFlowTransformKeepingWorldRectCollectiveInViewport',
    "reason: 'workspace-blocked-unsettled-transform-neutralized-for-auto-seed'",
    'const autoSeedWorldRects = buildAutoSeedWorldRectsForTransform(next)',
  ]
  for (const fragment of forbidden) {
    if (text.includes(fragment)) {
      throw new Error(`expected Storyboard Widget runtime scene to remove viewport-fit transform guard fragment for infinite-canvas behavior: ${fragment}`)
    }
  }
  if (!text.includes('lastUsableZoomTransformRef.current = next')) {
    throw new Error('expected Storyboard Widget runtime scene to accept live transforms as the current authority instead of bouncing to viewport-fitted transforms')
  }
}

export function testStoryboardWidgetRuntimeScenePrefersAutoSeedWorldPosForWorkspaceBlockedFrontmatterWidgets() {
  const runtimeScenePath = path.resolve(process.cwd(), 'src', 'components', 'StoryboardWidgetCanvas', 'runtime', 'useStoryboardWidgetRuntimeScene.ts')
  const text = fs.readFileSync(runtimeScenePath, 'utf8')

  if (!text.includes('const autoSeed = latestAutoSeedWorldPosByNodeIdRef.current[id]')) {
    throw new Error('expected Storyboard Widget runtime scene live node reader to inspect the latest auto-seeded widget world positions first')
  }
  if (!text.includes('const workspaceMutationBlocked = isWorkspaceGraphMutationBlocked(state)')) {
    throw new Error('expected Storyboard Widget runtime scene live node reader to derive a single workspace-blocked guard before choosing widget world authority')
  }
  if (!text.includes('if (workspaceMutationBlocked && autoSeedX != null && autoSeedY != null && !interactionInProgress && !flowWidgetDragging) {')) {
    throw new Error('expected Storyboard Widget runtime scene live node reader to prefer auto-seeded widget world positions whenever workspace-blocked landing exposes a valid widget seed')
  }
  if (!text.includes('return { x: autoSeedX, y: autoSeedY }')) {
    throw new Error('expected Storyboard Widget runtime scene live node reader to hand widget overlays the centered auto-seeded world position before stale runtime scene coordinates')
  }
}
