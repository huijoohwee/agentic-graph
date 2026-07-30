import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

export function testStoryboardWidgetOverlayFitNormalizesSurfaceWindowOffset() {
  const zoomPath = resolve(process.cwd(), 'src', 'components', 'FlowCanvas', 'applyZoomRequestNative.ts')
  const text = readFileSync(zoomPath, 'utf8')
  const viewportPath = resolve(process.cwd(), 'src', 'components', 'FlowCanvas', 'storyboardWidgetZoomViewport.ts')
  const viewportText = readFileSync(viewportPath, 'utf8')
  const recenterPath = resolve(process.cwd(), 'src', 'components', 'FlowCanvas', 'storyboardWidgetOverlayRecenter.ts'); const recenterText = readFileSync(recenterPath, 'utf8')
  if (!text.includes("import { isWorkspaceEditorOverlayOpen } from '@/features/workspace-table/workspaceTableSsot'")) {
    throw new Error('expected Storyboard Widget zoom fit path to reuse shared Workspace overlay-open SSOT helper')
  }
  if (!text.includes('const workspaceEditorOverlayOpen = isWorkspaceEditorOverlayOpen(state)')) {
    throw new Error('expected Storyboard Widget zoom fit path to derive overlay-open state from shared workspace SSOT before fit/recenter')
  }
  if (!recenterText.includes('readCanvasOverlayNodeId,') || !recenterText.includes('const nodeId = readCanvasOverlayNodeId(roots[j])')) {
    throw new Error('expected Storyboard Widget fit recentering to reuse shared overlay node-id resolution when translating world positions')
  }
  if (!text.includes("import { resolveStoryboardWidgetVisibleViewport } from '@/components/FlowCanvas/storyboardWidgetZoomViewport'")
    || !text.includes('export { resolveStoryboardWidgetVisibleViewport }')
    || !viewportText.includes('export function resolveStoryboardWidgetVisibleViewport(args: {')) {
    throw new Error('expected Storyboard Widget zoom fit to consume and preserve the centralized visible viewport resolver')
  }
  if (viewportText.includes('WORKSPACE_LEFT_PANE_SELECTOR') || viewportText.includes('document.querySelectorAll(\'[data-kg-workspace-left-pane="1"]\')')) {
    throw new Error('expected Storyboard Widget visible viewport to ignore Editor Workspace overlay panes instead of treating them as layout authority')
  }
  if (viewportText.includes('visibleLeft =') || viewportText.includes('left: visibleLeft')) {
    throw new Error('expected Storyboard Widget visible viewport to keep the canvas surface left edge instead of shifting to a workspace-pane strip')
  }
  if (!viewportText.includes('Editor Workspace is an overlay, not a Storyboard Widget layout constraint.')) {
    throw new Error('expected Storyboard Widget visible viewport source to document that Editor Workspace panes are overlays, not layout constraints')
  }
  if (!viewportText.includes('const surfaceRect = surfaceRoot?.getBoundingClientRect() || null')) {
    throw new Error('expected Storyboard Widget overlay fit bounds to resolve the active surface root window rect')
  }
  if (!text.includes('const surfaceOffsetLeft = Number.isFinite(surfaceRect?.left) ? Number(surfaceRect?.left) : 0')) {
    throw new Error('expected Storyboard Widget overlay fit bounds to normalize horizontal screen coordinates by active surface offset')
  }
  if (!text.includes('const surfaceOffsetTop = Number.isFinite(surfaceRect?.top) ? Number(surfaceRect?.top) : 0')) {
    throw new Error('expected Storyboard Widget overlay fit bounds to normalize vertical screen coordinates by active surface offset')
  }
  if (!viewportText.includes('left,\n    top,\n    right,\n    bottom,') || !viewportText.includes('centerX: (left + right) / 2')) {
    throw new Error('expected Storyboard Widget visible viewport resolution to return the full active surface rect')
  }
  if (!text.includes('left: entry.rect.left - surfaceOffsetLeft')) {
    throw new Error('expected Storyboard Widget overlay fit bounds to store left edge in active surface-local coordinates')
  }
  if (!text.includes('top: entry.rect.top - surfaceOffsetTop')) {
    throw new Error('expected Storyboard Widget overlay fit bounds to store top edge in active surface-local coordinates')
  }
  if (!text.includes('pushEntries(SEMANTIC_FLOW_OVERLAY_ROOT_SELECTOR)')) {
    throw new Error('expected Storyboard Widget overlay fit bounds to include semantic Storyboard fixed-card overlay roots')
  }
  if (!text.includes('const fitW = Math.max(1, visibleViewport.width - pad * 2)')) {
    throw new Error('expected Storyboard Widget zoom fit to clamp collective bounds to the shared visible viewport width')
  }
  if (!text.includes("const isStoryboardWidgetCollectiveOutRequest =")
    || !text.includes("&& args.zoomRequest.type === 'out'")
    || !text.includes('const storyboardWidgetCollectiveOutResolved =')
    || !text.includes('const wantsCollectiveFloor =')
    || !text.includes('nextTransform: storyboardWidgetCollectiveFitReference.nextTransform')) {
    throw new Error('expected Storyboard Widget zoom-out to reuse the collective frontmatter fit reference when generic zoom-out would otherwise snap to the old graph-only floor')
  }
  if (!text.includes('const canUseStoryboardWidgetOverlayFitResolved =')
    || !text.includes('|| fitHasCollectiveOverlayFit')
    || !text.includes('const storyboardWidgetOverlayFitResolved = canUseStoryboardWidgetOverlayFitResolved')) {
    throw new Error('expected Storyboard Widget zoom fit to keep the overlay-bounds fit branch available for workspace-open frontmatter collective fits')
  }
  if (!text.includes('const forceImmediateWorkspaceOverlayFit = workspaceEditorOverlayOpen && isStoryboardWidgetFitLikeRequest')) {
    throw new Error('expected Storyboard Widget zoom fit/reset to force immediate (non-animated) application while Workspace overlay is open')
  }
  if (!text.includes('const durationMs = forceImmediateWorkspaceOverlayFit')) {
    throw new Error('expected Storyboard Widget zoom duration to be forced to zero for Workspace overlay fit/reset requests')
  }
  if (!text.includes('const shouldRecenterStoryboardWidgetCollectiveAfterFit =')
    || !text.includes('|| fitHasCollectiveOverlayFit')
    || !text.includes('if (shouldRecenterStoryboardWidgetCollectiveAfterFit) {')
    || !text.includes('recenterVisibleStoryboardWidgetOverlayCentroid({')) {
    throw new Error('expected Storyboard Widget zoom fit/reset to keep post-fit collective recentering active for workspace-open frontmatter collective fits')
  }
  if (!text.includes('const fitHasCollectiveOverlayFit =')
    || !text.includes("const canvas2dRenderer = resolveCanvas2dRendererId(args.canvas2dRendererOverride ?? state.canvas2dRenderer)")
    || !text.includes("|| canvas2dRenderer === 'storyboard'")
    || !text.includes("String(fitGraphMeta.kind || '').trim() === 'frontmatter-flow'")
    || !text.includes("fitGraphContext === 'frontmatter-flow'")
    || !text.includes('const useWorkspaceOverlayGraphFallbackFit =')
    || !text.includes('&& !fitHasCollectiveOverlayFit')) {
    throw new Error('expected Storyboard Widget zoom graph-fit branch to keep frontmatter-flow on the collective overlay fit path instead of forcing workspace-overlay graph-only fallback')
  }
  if (!text.includes('? fitAllTransform(')) {
    throw new Error('expected Storyboard Widget zoom graph-fit branch to fallback to D3 fitAllTransform while Workspace overlay is open')
  }
  if (!text.includes('Math.max(1, visibleViewport.width),')) {
    throw new Error('expected Storyboard Widget zoom graph-fit fallback to clamp width to visible viewport bounds while Workspace overlay is open')
  }
  if (!text.includes('Math.max(1, visibleViewport.height),')) {
    throw new Error('expected Storyboard Widget zoom graph-fit fallback to clamp height to visible viewport bounds while Workspace overlay is open')
  }
  if (!text.includes('const targetX = visibleViewport.centerX - (centerX - base.x) * appliedScale')) {
    throw new Error('expected Storyboard Widget zoom fit to center collective overlays inside the visible viewport center')
  }
  if (!text.includes('recenterVisibleStoryboardWidgetOverlayCentroid({') || !text.includes('graphData: args.graphData,')) {
    throw new Error('expected Storyboard Widget fit recentering to shift widget world positions alongside viewport transform updates')
  }
  if (!text.includes('if (shouldRecenterStoryboardWidgetCollectiveAfterFit) {')) {
    throw new Error('expected Storyboard Widget fit recentering to stay enabled for workspace-open frontmatter collective fits')
  }
  if (!recenterText.includes('st.setFlowWidgetWorldPosByNodeId(nextWorld)')) {
    throw new Error('expected Storyboard Widget fit recentering to persist translated world positions through the shared widget world-position setter')
  }
  if (!recenterText.includes('st.setFlowWidgetPosByNodeId(nextScreen)')) {
    throw new Error('expected Storyboard Widget fit recentering to persist translated screen positions through the shared widget screen-position setter')
  }
  if (text.includes('left: entry.rect.left,')) {
    throw new Error('expected Storyboard Widget overlay fit bounds to avoid raw window-space left coordinates')
  }
  const fitHelperPath = resolve(process.cwd(), 'src', 'components', 'FlowCanvas', 'fitPinnedWidgets.ts')
  const fitHelperText = readFileSync(fitHelperPath, 'utf8')
  if (!fitHelperText.includes('const isFrontmatterOverlayFit =')) {
    throw new Error('expected Storyboard Widget pinned-widget fit helper to detect frontmatter-flow fit mode explicitly')
  }
  if (!fitHelperText.includes('const openIds = isFrontmatterOverlayFit')) {
    throw new Error('expected Storyboard Widget frontmatter-flow fit path to source open ids from the canonical frontmatter overlay set before fitting')
  }
  if (fitHelperText.includes('if (isFrontmatterOverlayFit) {\n    // Frontmatter nodes already encode the shared collective proxy layout.\n    // Reuse graph fit as the upstream basis and let later overlay-bounds refinement sharpen it.\n    return fitAllTransform(nodes, args.fitW, args.viewportH')) {
    throw new Error('expected Storyboard Widget frontmatter-flow fit path to avoid hard graph-only fit fallback when overlay collective ids are available')
  }
  if (!fitHelperText.includes('let kGuess = isFrontmatterOverlayFit ? neutralFrontmatterFitZoom : kBase')) {
    throw new Error('expected Storyboard Widget frontmatter-flow fit path to bootstrap proxy fitting from a neutral zoom instead of a tiny graph-only baseline')
  }
  if (!fitHelperText.includes('const worldById = args.worldPosById || {}')) {
    throw new Error('expected non-frontmatter pinned-widget fit path to continue using persisted world positions')
  }
}
