import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { isFlowCanvasRichMediaPropertyMutationBlocked } from '@/components/FlowCanvas/shared'

export function testStoryboardWidgetFrontmatterWorkspaceBlockedRichMediaLayoutStaysLive() {
  const overlaysPath = resolve(process.cwd(), 'src', 'components', 'FlowCanvas', 'FlowCanvasMediaOverlays.tsx')
  const panelPath = resolve(process.cwd(), 'src', 'components', 'useRichMediaPanelSurfaceState.ts')
  const text = readFileSync(overlaysPath, 'utf8')
  const panelText = readFileSync(panelPath, 'utf8')

  if (!text.includes('const stopPassiveLayoutWhileWorkspaceOverlayOpen =\n      workspaceOverlayOpenRef.current && !storyboardWidgetFrontmatterDocumentModeRequested')) {
    throw new Error('expected FlowCanvas media overlays to derive a frontmatter-aware passive layout exception while workspace mutation blocking is open')
  }
  if (!text.includes('if (stopPassiveLayoutWhileWorkspaceOverlayOpen) return')) {
    throw new Error('expected passive Rich Media layout scheduling to stay active for frontmatter document mode while workspace mutation blocking is open')
  }
  if (!text.includes('if (!active || mediaLayoutItems.length === 0 || stopPassiveLayoutWhileWorkspaceOverlayOpen)')) {
    throw new Error('expected Rich Media layout loop shutdown to exempt frontmatter document mode from workspace-open passive-layout parking')
  }
  if (!text.includes('className={`absolute left-0 top-0 overflow-visible ${overlayPanelPointerEventsClass}`')
    || !text.includes('data-kg-rich-media-storyboard-widget-overlay-shell="1"')) {
    throw new Error('expected FlowCanvas rich media overlays to anchor at absolute top-left so passive layout transforms do not stack in normal document flow')
  }
  if (!text.includes('storyboardWidgetInteractionMode={storyboardWidgetSurfaceInteractionMode}')) {
    throw new Error('expected FlowCanvas rich media overlays to delegate Storyboard Widget absolute root positioning to the shared Rich Media Panel owner')
  }
  if (!panelText.includes("position: useSurfaceFrame || panelOwnsInlineSrcDocScroll ? 'relative' : (storyboardWidgetInteractionMode ? 'absolute' : 'relative')")) {
    throw new Error('expected shared Rich Media Panel root positioning to switch to absolute in Storyboard Widget interaction mode so passive layout transforms map directly to overlay boxes')
  }
  if (!panelText.includes("const bodySurfaceStyle: React.CSSProperties = {\n    ...PANEL_FRAME_BODY_STYLE,")
    || !panelText.includes("position: useSurfaceFrame || panelOwnsInlineSrcDocScroll ? 'relative' : (storyboardWidgetInteractionMode ? 'absolute' : 'relative'),")) {
    throw new Error('expected shared Rich Media Panel merged body surface styles to preserve absolute positioning in Storyboard Widget interaction mode')
  }
  if (!text.includes('const storyboardWidgetSurfaceRendererMode = isStoryboardWidgetSurfaceRenderer(canvas2dRenderer)')
    || !text.includes("const mediaOverlayDragInteractionMode = storyboardWidgetSurfaceRendererMode || storyboardSharedSurfaceRendererMode || canvas2dRenderer === 'flowCanvas'")) {
    throw new Error('expected Rich Media overlay pan/drag interactions to be enabled from the shared Storyboard Widget surface/Flow Canvas gate')
  }
  if (!text.includes('resolveFlowCanvasMediaOverlayInteractionPolicy')) {
    throw new Error('expected Rich Media overlay pan/drag interactions to reuse the shared renderer-level interaction policy')
  }
  if (!text.includes('const overlayInteractionEnabled = mediaOverlayInteractionPolicy.overlayPanActive')) {
    throw new Error('expected Rich Media panel pan proxy to remain active from the renderer-level interaction policy while workspace is open')
  }
  if (!text.includes('const headerDragInteractionActive = mediaOverlayInteractionPolicy.headerDragActive')) {
    throw new Error('expected Rich Media panel header drag to remain active from the renderer-level interaction policy while workspace is open')
  }
  if (text.includes('const overlayInteractionEnabled = mediaOverlayDragInteractionMode && !workspaceOverlayOpen')) {
    throw new Error('expected Rich Media panel pan proxy to avoid workspace-open pointer suppression')
  }
  if (text.includes('if (!mediaOverlayDragInteractionMode || workspaceOverlayOpenRef.current) return')) {
    throw new Error('expected Rich Media panel pan proxy to avoid workspace-open runtime suppression')
  }
  if (!text.includes("resizeMutationBlocked = workspaceMutationBlocked && typeof onNodePropertiesChange !== 'function'")
    || !text.includes('if (!mediaOverlayDragInteractionMode || resizeMutationBlockedRef.current) return')) {
    throw new Error('expected Rich Media resize writes to remain available through the canonical source owner while store-only mutation stays blocked')
  }
  if (!text.includes("const richMediaInfiniteCanvasMode = storyboardWidgetSurfaceRendererMode || storyboardSharedSurfaceRendererMode || canvas2dRenderer === 'flowCanvas'")) {
    throw new Error('expected Storyboard Widget shared surfaces and Flow Canvas Rich Media panel layout to use the shared renderer-level infinite-canvas gate')
  }
  if (!text.includes("collision: richMediaInfiniteCanvasMode\n        ? { enabled: false }") || !text.includes("clampToViewport: richMediaInfiniteCanvasMode\n        ? null")) {
    throw new Error('expected Flow Rich Media panels to preserve infinite-canvas world placement instead of viewport collision/clamp relayout during pan/zoom')
  }
}

export function testStoryboardWidgetFrontmatterWorkspaceDelegatesRichMediaPropertyMutation() {
  if (isFlowCanvasRichMediaPropertyMutationBlocked({
    workspaceMutationBlocked: true,
    hasDelegatedPropertyMutation: true,
  })) {
    throw new Error('expected workspace Rich Media text edits to reach the delegated Storyboard source persistence owner')
  }
  if (!isFlowCanvasRichMediaPropertyMutationBlocked({
    workspaceMutationBlocked: true,
    hasDelegatedPropertyMutation: false,
  })) {
    throw new Error('expected workspace mutation blocking to continue rejecting store-only Rich Media property writes')
  }
  if (isFlowCanvasRichMediaPropertyMutationBlocked({
    workspaceMutationBlocked: false,
    hasDelegatedPropertyMutation: false,
  })) {
    throw new Error('expected ordinary Rich Media property writes to remain available outside workspace mutation blocking')
  }
}
