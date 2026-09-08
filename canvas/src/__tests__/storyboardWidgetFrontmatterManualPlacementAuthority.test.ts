import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

export function testStoryboardWidgetFrontmatterManualPlacementAuthorityUsesSharedHelper() {
  const sharedPath = resolve(process.cwd(), 'src', 'components', 'StoryboardWidgetCanvas', 'storyboardWidgetCanvasShared.tsx')
  const authorityPath = resolve(process.cwd(), 'src', 'lib', 'storyboardWidget', 'widgetPlacementAuthority.ts')
  const overlayPath = resolve(process.cwd(), 'src', 'components', 'StoryboardWidget', 'WidgetEditorInner.tsx')
  const overlayPlacementRuntimePath = resolve(process.cwd(), 'src', 'components', 'StoryboardWidget', 'useWidgetPlacementRuntime.ts')
  const runtimeScenePath = resolve(process.cwd(), 'src', 'components', 'StoryboardWidgetCanvas', 'runtime', 'useStoryboardWidgetRuntimeScene.ts')
  const collisionPath = resolve(process.cwd(), 'src', 'components', 'StoryboardWidgetCanvas', 'runtime', 'useStoryboardWidgetOverlayCollision.ts')
  const graphDataCommitActionsPath = resolve(process.cwd(), 'src', 'hooks', 'store', 'graph-data-slice', 'graphDataCommitActions.ts')
  const sharedText = readFileSync(sharedPath, 'utf8')
  const authorityText = readFileSync(authorityPath, 'utf8')
  const overlayText = readFileSync(overlayPath, 'utf8')
  const overlayPlacementRuntimeText = [readFileSync(overlayPlacementRuntimePath, 'utf8'), readFileSync(resolve(process.cwd(), 'src/components/StoryboardWidget/widgetPlacementRuntimeProjection.ts'), 'utf8'), readFileSync(resolve(process.cwd(), 'src/components/StoryboardWidget/widgetPlacementRuntimeState.ts'), 'utf8')].join('\n')
  if (!overlayPlacementRuntimeText.includes("from '@/components/StoryboardWidget/widgetPlacementRuntimeProjection'") || !overlayPlacementRuntimeText.includes('applyWidgetOverlayPosition(')) throw new Error('expected the placement hook to call its projection owner')
  const runtimeText = readFileSync(runtimeScenePath, 'utf8')
  const collisionText = readFileSync(collisionPath, 'utf8')
  const graphDataCommitActionsText = readFileSync(graphDataCommitActionsPath, 'utf8') + readFileSync(resolve(process.cwd(), 'src/hooks/store/graph-data-slice/graphDataWidgetStateCommit.ts'), 'utf8')

  if (!graphDataCommitActionsText.includes("from './graphDataWidgetStateCommit'") || !graphDataCommitActionsText.includes('buildCommittedFlowWidgetState(')) throw new Error('expected graph commit actions to call the widget-state owner')
  if (!sharedText.includes('export {')) {
    throw new Error('expected Storyboard Widget canvas shared module to re-export pure widget placement authority helpers')
  }
  if (!authorityText.includes('export function shouldAutoPlaceStoryboardWidget')) {
    throw new Error('expected Storyboard Widget shared runtime to expose one SSOT helper for widget auto-placement authority')
  }
  if (!authorityText.includes('nodeTypeId?: string | null')) {
    throw new Error('expected Storyboard Widget shared auto-placement authority helper to accept node type context')
  }
  if (!authorityText.includes("if (!pinnedInCanvas && isCanonicalFrontmatterBuiltInWidgetNode({ id: '', type: nodeTypeId })) return true")) {
    throw new Error('expected canonical frontmatter built-in floating widgets to stay auto-rebalanceable even with stored screen positions')
  }
  if (!authorityText.includes('export function shouldUseStoryboardWidgetFloatingScreenAuthority')) {
    throw new Error('expected Storyboard Widget shared runtime to expose one SSOT helper for floating screen-authority rules')
  }
  if (!authorityText.includes('if (args.pinnedInCanvas === true) return false')
    || !authorityText.includes('storyboardWidgetSurfaceId?: string | null')
    || !authorityText.includes("return surfaceId === 'storyboard' || kind === 'frontmatter-flow' || kind !== ''")) {
    throw new Error('expected Storyboard Widget floating screen-authority to cover every unpinned Storyboard Widget without deriving world placement')
  }
  if (!authorityText.includes('export function stripFrontmatterAutoManagedWidgetScreenPositions')) {
    throw new Error('expected widget placement authority SSOT to strip stale frontmatter built-in screen positions during graph rebuilds')
  }
  if (!authorityText.includes('preserveBalancedCollective?: boolean')) {
    throw new Error('expected widget placement authority SSOT to support preserving balanced same-source frontmatter collective layouts while stripping residue clusters')
  }
  if (!authorityText.includes('isVerticalOverlayCluster') || !authorityText.includes('isHorizontalOverlayStrip')) {
    throw new Error('expected widget placement authority SSOT to detect vertical/horizontal residue before preserving same-source frontmatter screen layouts')
  }
  if (!authorityText.includes('function hasAutoManagedWidgetOverlap(')) {
    throw new Error('expected widget placement authority SSOT to reject overlapped frontmatter collectives before preserving same-source screen layouts')
  }
  if (!overlayText.includes('shouldUseStoryboardWidgetFloatingScreenAuthority')) {
    throw new Error('expected widget runtime to reuse the shared floating screen-authority helper')
  }
  if (overlayText.includes("from '@/components/StoryboardWidgetCanvas/storyboardWidgetCanvasShared'")) {
    throw new Error('expected widget runtime to avoid importing through Storyboard Widget canvas shared module')
  }
  if (!overlayText.includes("from '@/lib/storyboardWidget/widgetPlacementAuthority'")) {
    throw new Error('expected widget runtime to import placement authority directly from the shared lib owner')
  }
  if (!overlayPlacementRuntimeText.includes('const currentStoredWorldForPlacement = storyboardPinnedCardLayoutActive || floatingUsesScreenAuthority')
    || !overlayPlacementRuntimeText.includes('const storedWorld = currentStoredWorldForPlacement || (floatingUsesScreenAuthority ? null : widgetWorldPosRef.current)')) {
    throw new Error('expected floating screen-authority mode to ignore stored world placement authority')
  }
  const persistFloatingPlacementIdx = overlayPlacementRuntimeText.indexOf('const persistFloatingPlacement = React.useCallback((pos: { top: number; left: number }) => {')
  const screenAuthorityPlacementGuardIdx = overlayPlacementRuntimeText.indexOf('if (floatingUsesScreenAuthority) {', persistFloatingPlacementIdx)
  const floatingPlacementWorldPersistIdx = overlayPlacementRuntimeText.indexOf('persistWorldPos(world)', persistFloatingPlacementIdx)
  if (
    persistFloatingPlacementIdx < 0
    || screenAuthorityPlacementGuardIdx < persistFloatingPlacementIdx
    || floatingPlacementWorldPersistIdx < screenAuthorityPlacementGuardIdx
  ) {
    throw new Error('expected screen-authority floating placement to persist screen coordinates without writing derived canvas-world coordinates')
  }
  if (!overlayPlacementRuntimeText.includes('const persistFloatingScreenPlacement = React.useCallback((pos: { top: number; left: number }) => {')
    || !overlayPlacementRuntimeText.includes('widgetWorldPosRef.current = null')
    || !overlayPlacementRuntimeText.includes('screenAuthorityLayoutZoomBaseRef.current = {')) {
    throw new Error('expected pin handoff to persist floating screen placement without deriving world placement from the previous pinned frame')
  }
  if (!overlayPlacementRuntimeText.includes('const readCurrentOverlayScreenPlacementForHandoff = React.useCallback((): { left: number; top: number } | null => {')
    || !overlayPlacementRuntimeText.includes('left: rect.left')
    || !overlayPlacementRuntimeText.includes('top: rect.top')) {
    throw new Error('expected pin handoff to read the live Widget viewport screen box')
  }
  const screenAuthorityWorldSyncGuardIdx = overlayPlacementRuntimeText.indexOf('if (floatingUsesScreenAuthority) return')
  const derivedWorldSyncIdx = overlayPlacementRuntimeText.indexOf('persistWorldPos(nextWorld)')
  if (screenAuthorityWorldSyncGuardIdx < 0 || derivedWorldSyncIdx < screenAuthorityWorldSyncGuardIdx) {
    throw new Error('expected derived world-position synchronization to run only after screen-authority widgets have been excluded')
  }
  if (!overlayPlacementRuntimeText.includes('hasAppliedPlacement: boolean')
    || !overlayPlacementRuntimeText.includes('|| args.hasAppliedPlacement ||')
    || !overlayPlacementRuntimeText.includes('hasAppliedPlacement: Boolean(lastAppliedRef.current)')) {
    throw new Error('expected frontmatter balanced fallback to act only before the first applied screen-authority placement')
  }
  if (!overlayPlacementRuntimeText.includes('const useFrontmatterInitialBalancedBase = frontmatterManagedNode')
    || !overlayPlacementRuntimeText.includes('&& !lastAppliedRef.current')
    || !overlayPlacementRuntimeText.includes('useFrontmatterInitialBalancedBase && frontmatterBalancedFallbackPos')) {
    throw new Error('expected screen-authority base placement to stop reapplying initial balanced fallback after measured placement owns the frame')
  }
  if (!overlayPlacementRuntimeText.includes('const zoomK = args.initialFrontmatterManagedNode && args.floatingUsesScreenAuthority')
    || !overlayPlacementRuntimeText.includes('const frontmatterVisibleViewportAuthority = frontmatterManagedNode')
    || !overlayPlacementRuntimeText.includes('const frontmatterPanelScaleZoomK = readScreenAuthorityFollowZoomK(zoomK, frontmatterVisibleViewportAuthority)')
    || !overlayPlacementRuntimeText.includes('zoomK: frontmatterPanelScaleZoomK')) {
    throw new Error('expected frontmatter placement to keep screen-position authority while letting shared viewport zoom drive baseline-normalized visual scale')
  }
  if (!overlayPlacementRuntimeText.includes('screenAuthorityLayoutZoomBaseRef')
    || !overlayPlacementRuntimeText.includes('projectCollectiveScreenLayoutForZoom({')
    || !overlayPlacementRuntimeText.includes('screenAuthorityLayoutZoomBaseRef.current = {')) {
    throw new Error('expected frontmatter screen-authority placement to project visible zoom layout from a non-mutating screen-layout baseline')
  }
  if (!overlayPlacementRuntimeText.includes('const pos = posBaseForViewport')
    || !overlayPlacementRuntimeText.includes('const effectivePanelScale = storyboardPinnedScreenBox?.scale ?? panelScale')
    || !overlayPlacementRuntimeText.includes('const appliedPanelScale = floatingScreenAuthorityScale ?? effectivePanelScale')) {
    throw new Error('expected frontmatter screen-authority placement to keep scale and projected screen position inside its placement owner')
  }
  if (!overlayPlacementRuntimeText.includes('const floatingScreenAuthorityScale = floatingRef.current && floatingUsesScreenAuthority && !frontmatterManagedNode')
    || !overlayPlacementRuntimeText.includes('screenAuthorityHandoffPos?.scale ?? lastAppliedRef.current?.scale')
    || !overlayPlacementRuntimeText.includes('screenAuthorityHandoffPosRef.current = {')) {
    throw new Error('expected unpinned Storyboard Widget screen authority to preserve the current pinned scale during pin handoff')
  }
  if (!overlayPlacementRuntimeText.includes('const frontmatterScreenAuthority = isFrontmatterManagedOverlayNode(graphMetaKind, nodeRef.current) && floatingUsesScreenAuthority')
    || !overlayPlacementRuntimeText.includes('if (frontmatterScreenAuthority && sameScale && !pinnedDragOverrideRef.current) return')) {
    throw new Error('expected frontmatter screen-authority zoom subscriptions to skip only same-scale churn while allowing proportional zoom projection')
  }
  if (!overlayPlacementRuntimeText.includes('initialFrontmatterManagedNode')
    || !overlayPlacementRuntimeText.includes('&& lastAppliedRef.current')
    || !overlayPlacementRuntimeText.includes('&& !pinnedDragOverrideRef.current')) {
    throw new Error('expected frontmatter screen-authority placement to ignore later store-position writes after the first applied placement')
  }
  if (!runtimeText.includes('shouldAutoPlaceStoryboardWidget')) {
    throw new Error('expected pinned widget runtime seeding to reuse the shared auto-placement authority helper')
  }
  if (!runtimeText.includes('shouldUseStoryboardWidgetFloatingScreenAuthority')) {
    throw new Error('expected runtime scene DOM recovery to reuse the shared frontmatter screen-authority helper')
  }
  if (!runtimeText.includes('const skipDomCollectiveRecoveryForFrontmatterScreenAuthority =')
    || !runtimeText.includes("graphMetaKind === 'frontmatter-flow'")
    || !/if \(skipDomCollectiveRecoveryForFrontmatterScreenAuthority\) \{\s*return true/.test(runtimeText)) {
    throw new Error('expected runtime scene DOM recovery to avoid rewriting frontmatter floating screen-authority collectives')
  }
  if (!collisionText.includes('shouldAutoPlaceStoryboardWidget')) {
    throw new Error('expected floating widget collision auto-placement to reuse the shared auto-placement authority helper')
  }
  if (!collisionText.includes('shouldUseStoryboardWidgetFloatingScreenAuthority')
    || !collisionText.includes('const floatingScreenAuthorityOwnedByPlacementRuntime = shouldUseStoryboardWidgetFloatingScreenAuthority({')
    || !collisionText.includes('if (floatingScreenAuthorityOwnedByPlacementRuntime) {')) {
    throw new Error('expected floating widget collision to leave screen-positioned Storyboard Widgets under placement-runtime ownership')
  }
  if (!collisionText.includes("const storyboardCardLayoutSurface = String(storyboardWidgetSurfaceId || '').trim() === 'storyboard'")
    || !collisionText.includes('const isPinnedInCanvasForNode = (id: string): boolean => storyboardCardLayoutSurface || resolveEffectiveFlowWidgetPinnedInCanvas')) {
    throw new Error('expected collision ownership to keep Storyboard surface Widgets on Card layout regardless of pin UI state')
  }
  if (!collisionText.includes("nodeTypeId: String(nodeById?.get(id)?.type || '').trim()")) {
    throw new Error('expected floating widget collision auto-placement to pass built-in node-type context through the shared node lookup helper')
  }
  if (!authorityText.includes('export function shouldPreserveFrontmatterAutoManagedBalancedCollective')) {
    throw new Error('expected widget placement authority SSOT to expose a pure helper for preserving only balanced floating frontmatter collectives')
  }
  if (!authorityText.includes('export function shouldCarryForwardFlowWidgetOverlayStateOnGraphCommit')) {
    throw new Error('expected widget placement authority SSOT to expose one graph-commit helper for widget overlay carry-forward policy')
  }
  if (
    !authorityText.includes("if (kind === 'frontmatter-flow') {")
    || !authorityText.includes('return args.carryForwardSameSourceUiState === true && args.stableSameSourceNodeLayout === true')
  ) {
    throw new Error('expected graph-commit widget carry-forward helper to gate frontmatter-flow carry on stable same-source node layout outside balanced collective preservation')
  }
  if (!graphDataCommitActionsText.includes('stripFrontmatterAutoManagedWidgetScreenPositions')) {
    throw new Error('expected graph commit path to strip stale frontmatter built-in screen positions via the shared authority helper')
  }
  if (!graphDataCommitActionsText.includes('shouldPreserveFrontmatterAutoManagedBalancedCollective')) {
    throw new Error('expected graph commit path to detect balanced floating frontmatter collectives before carrying overlay state across same-source layout churn')
  }
  if (!graphDataCommitActionsText.includes('preserveBalancedCollective: args.preserveStableSameSourceOverlayState')) {
    throw new Error('expected graph commit path to preserve only balanced same-source frontmatter collective screen layouts')
  }
  if (!graphDataCommitActionsText.includes('const carry = continuity?.stableLayout === true || preserveBalanced') || !graphDataCommitActionsText.includes('compareWidgetLayoutEvidence(previous.layout, layout)')) {
    throw new Error('expected graph commit carry-forward policy to use shared layout continuity evidence or a verified balanced collective')
  }
}
