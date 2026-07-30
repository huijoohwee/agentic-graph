import fs from 'node:fs'
import path from 'node:path'
import {
  buildFlowOverlayBoundsFromRects,
  buildFlowOverlayCollectiveTopologyKey,
  buildWorkspaceVisibleViewportFitRecoveryKey,
  computeWorkspaceOverlayVisibleViewportFitTransform,
  deriveFlowOverlayCollectiveViewportState,
  hasFlowOverlayCollectiveTopologyChanged,
  shouldRecoverFlowOverlayCollectiveAfterTopologyChange,
  type FlowOverlayBounds,
  type FlowTransformLike,
  type VisibleFlowViewport,
} from '@/components/FlowCanvas/workspaceVisibleViewportRecovery'

const build = (codes: number[]): string => String.fromCharCode(...codes)

const projectBounds = (
  bounds: FlowOverlayBounds,
  current: FlowTransformLike,
  next: FlowTransformLike,
): FlowOverlayBounds => {
  const safeBaseK = Number.isFinite(current.k) && current.k > 0 ? current.k : 1
  const appliedScale = next.k / safeBaseK
  return {
    minX: next.x + (bounds.minX - current.x) * appliedScale,
    maxX: next.x + (bounds.maxX - current.x) * appliedScale,
    minY: next.y + (bounds.minY - current.y) * appliedScale,
    maxY: next.y + (bounds.maxY - current.y) * appliedScale,
    width: Math.max(1, bounds.width * appliedScale),
    height: Math.max(1, bounds.height * appliedScale),
    ids: bounds.ids,
  }
}

export function testStoryboardWidgetWorkspaceRecoveryRejectsHugeCenteredCollective() {
  const visibleViewport: VisibleFlowViewport = {
    left: 440,
    top: 0,
    right: 860,
    bottom: 800,
    width: 420,
    height: 800,
    centerX: 650,
    centerY: 400,
  }
  const bounds: FlowOverlayBounds = {
    minX: 220,
    maxX: 1080,
    minY: -460,
    maxY: 1260,
    width: 860,
    height: 1720,
    ids: ['text-output', 'image-output', 'video-output', 'rich-media-panel'],
  }

  const state = deriveFlowOverlayCollectiveViewportState({ bounds, visibleViewport })
  if (!state) throw new Error('expected collective state')
  if (state.fitsVisibleViewport || state.centered || state.balanced) {
    throw new Error('expected huge centered-looking collective to require bounded visible-viewport recovery')
  }
}

export function testStoryboardWidgetWorkspaceRecoveryBuildsSharedCollectiveBoundsFromRects() {
  const visibleViewport: VisibleFlowViewport = {
    left: 0,
    top: 0,
    right: 1000,
    bottom: 800,
    width: 1000,
    height: 800,
    centerX: 500,
    centerY: 400,
  }
  const bounds = buildFlowOverlayBoundsFromRects({
    items: [
      { id: 'a', left: 300, top: 280, width: 120, height: 160 },
      { id: 'b', left: 460, top: 280, width: 120, height: 160 },
      { id: 'c', left: 620, top: 280, width: 120, height: 160 },
    ],
  })
  if (!bounds) throw new Error('expected shared collective bounds from rects')
  if (bounds.minX !== 300 || bounds.maxX !== 740 || bounds.minY !== 280 || bounds.maxY !== 440) {
    throw new Error(`expected precise aggregate bounds, got ${JSON.stringify(bounds)}`)
  }
  if ((bounds.ids || []).join(',') !== 'a,b,c') {
    throw new Error('expected shared bounds helper to preserve semantic ids')
  }
  const state = deriveFlowOverlayCollectiveViewportState({ bounds, visibleViewport })
  if (!state?.visible || !state.centered || !state.balanced) {
    throw new Error('expected shared rect bounds to score as visible centered balanced')
  }

  if (hasFlowOverlayCollectiveTopologyChanged({
    previousIds: [],
    currentIds: ['panel-a'],
  })) {
    throw new Error('expected first mixed-overlay measurement to establish a baseline without moving the camera')
  }
  const topologyKeyA = buildFlowOverlayCollectiveTopologyKey({
    zoomViewKey: 'view-a',
    layoutSignature: 'revision-a',
    ids: ['panel-b', 'panel-a'],
  })
  const topologyKeyB = buildFlowOverlayCollectiveTopologyKey({
    zoomViewKey: 'view-a',
    layoutSignature: 'revision-a',
    ids: ['panel-a', 'panel-b'],
  })
  const topologyKeyC = buildFlowOverlayCollectiveTopologyKey({
    zoomViewKey: 'view-a',
    layoutSignature: 'revision-b',
    ids: ['panel-a', 'panel-b'],
  })
  if (!topologyKeyA || topologyKeyA !== topologyKeyB || topologyKeyA === topologyKeyC) {
    throw new Error('expected mixed-overlay topology keys to be order-neutral and layout-revision-sensitive')
  }
  if (hasFlowOverlayCollectiveTopologyChanged({
    previousIds: ['panel-b', 'panel-a'],
    currentIds: ['panel-a', 'panel-b'],
  })) {
    throw new Error('expected mixed-overlay topology comparison to be order-neutral')
  }
  if (!hasFlowOverlayCollectiveTopologyChanged({
    previousIds: ['panel-a'],
    currentIds: ['panel-a', 'panel-b'],
  })) {
    throw new Error('expected a newly materialized generic overlay to arm bounded viewport recovery')
  }
  if (shouldRecoverFlowOverlayCollectiveAfterTopologyChange({
    topologyChanged: true,
    viewportState: state,
  })) {
    throw new Error('expected a visible materialized collective to preserve the established infinite-canvas camera')
  }
  const offscreenState = deriveFlowOverlayCollectiveViewportState({
    bounds: {
      minX: 2400,
      maxX: 3300,
      minY: -900,
      maxY: -100,
      width: 900,
      height: 800,
      ids: ['panel-a', 'panel-b'],
    },
    visibleViewport,
  })
  if (!shouldRecoverFlowOverlayCollectiveAfterTopologyChange({
    topologyChanged: true,
    viewportState: offscreenState,
  })) {
    throw new Error('expected a topology-changed, wholly offscreen mixed collective to request one bounded recovery')
  }
  if (shouldRecoverFlowOverlayCollectiveAfterTopologyChange({
    topologyChanged: false,
    viewportState: offscreenState,
  })) {
    throw new Error('expected ordinary offscreen panning without topology change to retain infinite-canvas authority')
  }
}

export function testStoryboardWidgetWorkspaceRecoveryFitsGenericOverlayBoundsIntoVisibleViewport() {
  const visibleViewport: VisibleFlowViewport = {
    left: 440,
    top: 0,
    right: 860,
    bottom: 800,
    width: 420,
    height: 800,
    centerX: 650,
    centerY: 400,
  }
  const current: FlowTransformLike = { x: 97, y: 309, k: 0.178 }
  const bounds: FlowOverlayBounds = {
    minX: 5014,
    maxX: 5314,
    minY: 10352,
    maxY: 10852,
    width: 300,
    height: 500,
    ids: ['text-widget', 'image-widget', 'video-widget', 'rich-media-panel'],
  }

  const next = computeWorkspaceOverlayVisibleViewportFitTransform({
    current,
    overlayBounds: bounds,
    visibleViewport,
    scaleExtent: [0.000001, 24],
  })
  if (!next) throw new Error('expected fit transform')
  if (Math.abs(next.k - current.k) > 0.000001) {
    throw new Error(`expected screen-space workspace recovery to preserve current zoom scale, got ${next.k}`)
  }
  const projected = projectBounds(bounds, current, next)
  if (projected.minX < visibleViewport.left - 1 || projected.maxX > visibleViewport.right + 1) {
    throw new Error(`expected recovered overlay bounds to fit horizontally, got ${projected.minX}..${projected.maxX}`)
  }
  if (projected.minY < visibleViewport.top - 1 || projected.maxY > visibleViewport.bottom + 1) {
    throw new Error(`expected recovered overlay bounds to fit vertically, got ${projected.minY}..${projected.maxY}`)
  }
}

export function testStoryboardWidgetWorkspaceRecoveryScalesOversizedOverlayBoundsIntoVisibleViewport() {
  const visibleViewport: VisibleFlowViewport = {
    left: 0,
    top: 0,
    right: 900,
    bottom: 600,
    width: 900,
    height: 600,
    centerX: 450,
    centerY: 300,
  }
  const current: FlowTransformLike = { x: 2200, y: 600, k: 0.3 }
  const bounds: FlowOverlayBounds = {
    minX: 1800,
    maxX: 3200,
    minY: 200,
    maxY: 1400,
    width: 1400,
    height: 1200,
    ids: ['panel', 'widget', 'media'],
  }

  const next = computeWorkspaceOverlayVisibleViewportFitTransform({
    current,
    overlayBounds: bounds,
    visibleViewport,
    scaleExtent: [0.000001, 24],
  })
  if (!next) throw new Error('expected oversized overlay fit transform')
  if (!(next.k < current.k)) {
    throw new Error(`expected oversized overlay recovery to reduce poisoned zoom scale, got ${next.k}`)
  }
  const projected = projectBounds(bounds, current, next)
  if (projected.minX < visibleViewport.left - 1 || projected.maxX > visibleViewport.right + 1) {
    throw new Error(`expected oversized overlay bounds to fit horizontally, got ${projected.minX}..${projected.maxX}`)
  }
  if (projected.minY < visibleViewport.top - 1 || projected.maxY > visibleViewport.bottom + 1) {
    throw new Error(`expected oversized overlay bounds to fit vertically, got ${projected.minY}..${projected.maxY}`)
  }
  const state = deriveFlowOverlayCollectiveViewportState({ bounds: projected, visibleViewport })
  if (!state?.visible || !state.centered || !state.fitsVisibleViewport) {
    throw new Error(`expected recovered oversized overlay collective to be visible and centered, got ${JSON.stringify(state)}`)
  }
}

export function testStoryboardWidgetWorkspaceRecoveryUsesSemanticKeyAndForbidsDocumentHardcodes() {
  const keyA = buildWorkspaceVisibleViewportFitRecoveryKey({
    zoomViewKey: 'graph-a',
    visibleViewport: { left: 440, top: 0, width: 420, height: 800 },
    overlayBounds: { ids: ['video', 'text', 'image'] },
  })
  const keyB = buildWorkspaceVisibleViewportFitRecoveryKey({
    zoomViewKey: 'graph-a',
    visibleViewport: { left: 441, top: 0, width: 420, height: 800 },
    overlayBounds: { ids: ['video', 'text', 'image'] },
  })
  if (!keyA || !keyB || keyA === keyB) {
    throw new Error('expected visible-viewport fit recovery key to be semantic and viewport-sensitive')
  }
  const keyC = buildWorkspaceVisibleViewportFitRecoveryKey({
    zoomViewKey: 'graph-a',
    visibleViewport: { left: 440, top: 0, width: 420, height: 800 },
    overlayBounds: {
      minX: 355,
      maxX: 517,
      minY: 376,
      maxY: 646,
      width: 162,
      height: 270,
      ids: ['video', 'text', 'image'],
    },
  })
  const keyD = buildWorkspaceVisibleViewportFitRecoveryKey({
    zoomViewKey: 'graph-a',
    visibleViewport: { left: 440, top: 0, width: 420, height: 800 },
    overlayBounds: {
      minX: 936,
      maxX: 1398,
      minY: 240,
      maxY: 690,
      width: 462,
      height: 450,
      ids: ['video', 'text', 'image'],
    },
  })
  if (!keyC || !keyD || keyC === keyD) {
    throw new Error('expected visible-viewport fit recovery key to include settled overlay bounds so early workspace-open fits cannot block corrective recovery')
  }

  const proxyText = fs.readFileSync(
    path.resolve(process.cwd(), 'src', 'lib', 'canvas', 'storyboard-widget-overlay-proxy.ts'),
    'utf8',
  )
  if (!proxyText.includes('overlayRoot.closest(`[${STORYBOARD_WIDGET_OVERLAY_SURFACE_ATTR}]`)')) {
    throw new Error('expected Storyboard Widget overlay surface-id resolution to inherit the nearest surface id for rich media descendants')
  }
  const zoomFitText = fs.readFileSync(
    path.resolve(process.cwd(), 'src', 'components', 'FlowCanvas', 'applyZoomRequestNative.ts'),
    'utf8',
  )
  if (!zoomFitText.includes('const queryRoot: ParentNode = document')
    || !zoomFitText.includes('Storyboard Widget overlays are portal-mounted fixed elements')) {
    throw new Error('expected Storyboard Widget visible-viewport recovery to collect portal-mounted overlays by surface id instead of surface-root ancestry')
  }

  const forbidden = [
    build([107, 110, 111, 119, 103, 114, 112, 104, 45, 116, 111, 107, 101, 110, 45, 101, 99, 111, 110, 111, 109, 105, 99, 115, 45, 109, 111, 100, 101, 108, 45, 100, 101, 109, 111, 46, 109, 100]),
    build([47, 85, 115, 101, 114, 115, 47]),
    build([104, 117, 105, 106, 111, 111, 104, 119, 101, 101, 47, 100, 111, 99, 115]),
  ]
  const files = [
    path.resolve(process.cwd(), 'src', 'components', 'FlowCanvas', 'useFlowCanvasRuntime.ts'),
    path.resolve(process.cwd(), 'src', 'components', 'FlowCanvas', 'workspaceVisibleViewportRecovery.ts'),
    path.resolve(process.cwd(), 'src', 'components', 'StoryboardWidgetCanvas', 'runtime', 'useStoryboardWidgetRuntimeScene.ts'),
    path.resolve(process.cwd(), 'src', 'components', 'StoryboardWidgetCanvas', 'runtime', 'useStoryboardWidgetOverlaySurface.tsx'),
    path.resolve(process.cwd(), 'src', 'components', 'StoryboardWidgetCanvas', 'runtime', 'useStoryboardWidgetOverlayEdges.ts'),
    path.resolve(process.cwd(), 'src', '__tests__', 'storyboardWidgetOverlayOffscreenRecoveryRegression.test.ts'),
    path.resolve(process.cwd(), 'src', '__tests__', 'storyboardWidgetWorkspaceVisibleViewportRecovery.test.ts'),
  ]

  for (let i = 0; i < files.length; i += 1) {
    const text = fs.readFileSync(files[i]!, 'utf8')
    const hit = forbidden.find(fragment => text.includes(fragment))
    if (hit) {
      throw new Error(`expected Storyboard Widget workspace recovery validation to avoid document/path hardcodes in ${path.relative(process.cwd(), files[i]!)}`)
    }
  }
}
