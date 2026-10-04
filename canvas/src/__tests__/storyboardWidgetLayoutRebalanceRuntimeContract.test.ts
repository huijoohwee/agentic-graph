import fs from 'node:fs'
import path from 'node:path'

const readUtf8 = (absPath: string): string => fs.readFileSync(absPath, { encoding: 'utf8' })

export const testStoryboardWidgetLayoutRebalanceUsesCenteredBalancedSpreadRuntime = () => {
  const runtimeText = readUtf8(path.resolve(process.cwd(), 'src', 'components', 'StoryboardWidgetCanvas', 'runtime', 'useStoryboardWidgetRuntimeScene.ts'))
  const runActionText = readUtf8(path.resolve(process.cwd(), 'src', 'components', 'StoryboardWidgetCanvas', 'runtime', 'storyboardWidgetWorkflowRunAction.ts'))
  const overlayCollisionText = readUtf8(path.resolve(process.cwd(), 'src', 'components', 'StoryboardWidgetCanvas', 'runtime', 'useStoryboardWidgetOverlayCollision.ts'))
  if (!runtimeText.includes('storyboardWidgetLayoutRebalanceRequest?: StoryboardWidgetLayoutRebalanceRequest | null')) throw new Error('expected Storyboard Widget runtime scene to accept the shared renderer Layout rebalance request contract')
  if (!runtimeText.includes('readStoryboardWidgetLayoutTargetTransform(args.storyboardWidgetLayoutRebalanceRequest)')
    || !runtimeText.includes('isStoryboardWidgetZoomPresetRebalanceRequest(args.storyboardWidgetLayoutRebalanceRequest)')
    || !runtimeText.includes('layoutRebalanceTargetTransform')
    || !runtimeText.includes('allowDuringWorkspaceMutation: true, persist: false')) {
    throw new Error('expected explicit zoom-preset rebalances to use target camera geometry as non-persistent presentation state while source mutation is guarded')
  }
  if (!runtimeText.includes('const forcedLayoutRebalanceIds = layoutRebalanceRequested ? pinnedOpenIds : []')) throw new Error('expected Storyboard renderer Layout rebalance to target the pinned open widget collective')
  if (!runActionText.includes('const executionAnchor = args.captureExecutionAnchor?.(resolvedNodeId) || null')
    || !runActionText.includes('const commitPublishedRunGraphData = args.commitPublishedGraphData')
    || !runActionText.includes('commitPublishedGraphData: commitPublishedRunGraphData')
    || !runActionText.includes('executionAnchor,')
    || runActionText.includes("reason: 'content-materialization'")) {
    throw new Error('expected successful generic Run materialization to use one execution-anchor authority without requesting downstream camera recovery')
  }
  if (!runtimeText.includes('isStoryboardWidgetContentMaterializationRebalanceRequest(args.storyboardWidgetLayoutRebalanceRequest)')
    || !runtimeText.includes('&& !contentMaterializationViewportRecoveryRequested')
    || !runtimeText.includes('if (establishedTopologyChanged) return true')
    || runtimeText.includes('lastHandledContentMaterializationRecoveryAtRef')
    || runtimeText.includes('topologyRecoveryArmed')) {
    throw new Error('expected content materialization to preserve execution-anchor placement without downstream position or camera recovery')
  }
  if (!runtimeText.includes('const activeSurfaceOverlayWidgetIds = (() => {') || !runtimeText.includes('selector: STORYBOARD_WIDGET_OVERLAY_ROOT_SELECTOR,') || !runtimeText.includes('resolveGraphNodeIdByCanonicalId(graphDataForSeeding, id)') || !runtimeText.includes('const placementPinnedById: FlowWidgetPinnedById =') || !runtimeText.includes('const activeSurfaceOverlayWidgetIdSet = new Set(activeSurfaceOverlayWidgetIds)') || !runtimeText.includes('return pinned || activeSurfaceOverlayWidgetIdSet.has(id)') || !runtimeText.includes("if (pinnedAttr === '0') activeSurfaceOverlayPinnedById[id] = false") || !runtimeText.includes('...activeSurfaceOverlayWidgetIds,')) throw new Error('expected Storyboard renderer Layout rebalance to include all active surface widget overlays, including unpinned screen-authority widgets')
  if (!runtimeText.includes('const forcedInitialCollectiveIds =')) throw new Error('expected Storyboard initialization to balance the full collective when seed positions are missing')
  if (!runtimeText.includes('domCollectiveRecoveryAttemptByScopeRef') || !runtimeText.includes("reason: 'workspace-blocked-skipping-dom-collective-seed-write'") || !runtimeText.includes('ids: boundsIds,') || !runtimeText.includes('new MutationObserver(() => {') || !runtimeText.includes('viewportState?.balanced === true') || !runtimeText.includes('needsMeasuredCenterShift') || !runtimeText.includes('measuredCenterShiftY') || !runtimeText.includes('readinessAttempts < 240') || !runtimeText.includes('attempts >= 6') || !runtimeText.includes('emitStoryboardWidgetInteractionFrameEvent()') || !runtimeText.includes('return false')) throw new Error('expected Storyboard initialization to recover mounted offscreen/off-center collectives through guarded active-surface seed writes outside workspace-blocked mode')
  if (runtimeText.includes('buildWorkspaceBlockedFlowWidgetSeedPatch({')) throw new Error('expected Storyboard Widget DOM collective recovery to forbid widget geometry writes while Workspace mutation is blocked')
  if (!runtimeText.includes('collectiveCentroidOffCenter(') || !runtimeText.includes('measureLayoutRectSet(items)') || !runtimeText.includes('targetCenterX') || !runtimeText.includes('targetCenterY')) throw new Error('expected Storyboard initialization to detect off-center collectives through shared centroid metrics before reseeding')
  if (!runtimeText.includes("import { centerLayoutRectsByCentroid, measureLayoutRectSet } from '@/lib/canvas/layoutCentroid'") || !runtimeText.includes('centerLayoutRectsByCentroid({') || runtimeText.includes('function resolveStoryboardWidgetCollectiveCenterShift(')) throw new Error('expected Storyboard Widget collective centering to reuse the shared bounded-centroid layout helper without a local center-shift alias')
  if (!runtimeText.includes('shouldForceBalancedSpreadReseed({ items: bucketItems, gapPx: gapWorld })')) throw new Error('expected Storyboard Widget runtime scene to reuse the shared balanced-spread reseed heuristic')
  if (!runtimeText.includes('const currentPinnedCollectiveViewportState =') || !runtimeText.includes('currentPinnedCollectiveViewportState?.balanced === true') || !runtimeText.includes('&& !currentPinnedCollectiveAlreadyBalanced')) throw new Error('expected Storyboard Widget runtime scene to skip post-init signature reseeds while the projected collective is already balanced')
  if (!runtimeText.includes('fitToViewport: false,')) throw new Error('expected Storyboard Widget runtime scene seeding to reuse the same follow-pinned scale mode as widget placement')
  if (!runtimeText.includes('const liveHasViewportOffset = hasViewportOffset(liveZoom)') || !runtimeText.includes('!layoutRebalanceRequested') || !runtimeText.includes('&& !liveHasViewportOffset') || !runtimeText.includes('&& !persistedHasViewportOffset') || !runtimeText.includes('(persistedHasViewportOffset && liveLooksDefault ? persistedZoom : null)') || !runtimeText.includes('&& liveLooksDefault')) throw new Error('expected Storyboard Widget runtime scene to preserve active zoom/pan authority during renderer Layout rebalance and non-workspace initialization')
  if (runtimeText.includes('const allowPersistedViewportOffsetSeed =') || runtimeText.includes('const persistedZoomForSeed =')) throw new Error('expected Storyboard Widget runtime scene to remove stale workspace-blocked persisted-offset seed branching')
  if (!runtimeText.includes('buildFlowOverlayBoundsFromRects({') || !runtimeText.includes('deriveFlowOverlayCollectiveViewportState({') || !runtimeText.includes("from '@/components/FlowCanvas/workspaceVisibleViewportRecovery'")) throw new Error('expected Storyboard Widget runtime scene to reuse shared visible-viewport collective scoring for init stability')
  if (!runtimeText.includes('placeWidgetsCenteredInGroupBounds({')) throw new Error('expected Storyboard Widget runtime scene to reuse the shared centered widget spread planner')
  if (!runtimeText.includes('markLayoutRebalanceHandled()')) throw new Error('expected Storyboard Widget runtime scene to handle rebalance requests once without feedback loops')
  if (!overlayCollisionText.includes('const screenAuthorityOwnedByPlacementRuntime = areStoryboardWidgetOverlaysOwnedByFloatingScreenAuthority({') || !overlayCollisionText.includes('if (screenAuthorityOwnedByPlacementRuntime)')) throw new Error('expected screen-authority collision to exit at the placement-runtime ownership boundary')
  if (overlayCollisionText.includes('useFrontmatterSemanticBalancedCollision') || overlayCollisionText.includes('applyFrontmatterSemanticBalancedWorld')) throw new Error('expected frontmatter screen-authority placement to avoid a competing semantic collision layout branch')
}
