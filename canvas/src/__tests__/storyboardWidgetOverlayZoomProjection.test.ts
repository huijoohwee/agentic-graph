import fs from 'node:fs'
import path from 'node:path'

import {
  computeCollectiveFollowPinnedScale,
  computeWidgetScaledSize,
  projectCollectiveScreenLayoutForZoom,
} from '@/lib/canvas/overlayWidgetZoom'
import { computeMediaOverlaySizing } from '@/lib/render/mediaOverlaySizing'

function assertTextIncludes(text: string, snippets: string[], message: string) {
  for (const snippet of snippets) {
    if (!text.includes(snippet)) throw new Error(`${message}: ${snippet}`)
  }
}

export function testStoryboardWidgetOverlayZoomUsesProportionalScreenProjection() {
  const placementPath = path.resolve(process.cwd(), 'src', 'components', 'StoryboardWidget', 'useWidgetPlacementRuntime.ts')
  const placementProjectionPath = path.resolve(process.cwd(), 'src', 'components', 'StoryboardWidget', 'widgetPlacementRuntimeProjection.ts')
  const overlaySurfacePath = path.resolve(process.cwd(), 'src', 'components', 'StoryboardWidgetCanvas', 'runtime', 'useStoryboardWidgetOverlaySurface.tsx')
  const runtimeScenePath = path.resolve(process.cwd(), 'src', 'components', 'StoryboardWidgetCanvas', 'runtime', 'useStoryboardWidgetRuntimeScene.ts')
  const mediaLoopPath = path.resolve(process.cwd(), 'src', 'lib', 'render', 'mediaOverlayLayoutLoop2d.ts')
  const mediaOverlaysPath = path.resolve(process.cwd(), 'src', 'components', 'FlowCanvas', 'FlowCanvasMediaOverlays.tsx')
  const placementText = fs.readFileSync(placementPath, 'utf8')
  const placementProjectionText = fs.readFileSync(placementProjectionPath, 'utf8')
  const overlaySurfaceText = fs.readFileSync(overlaySurfacePath, 'utf8')
  const runtimeSceneText = fs.readFileSync(runtimeScenePath, 'utf8')
  const mediaLoopText = fs.readFileSync(mediaLoopPath, 'utf8')
  const mediaOverlaysText = fs.readFileSync(mediaOverlaysPath, 'utf8')

  if (placementText.includes('stabilizePinnedWorldPosForZoom')
    || placementText.includes('resolvePinnedZoomCenterPreservingPlacement')
    || placementText.includes('liveZoomCenterPreservingPlacement')) {
    throw new Error('expected pinned widget zoom to render from stable world positions instead of mutating layout to chase screen centers')
  }
  assertTextIncludes(placementProjectionText, [
    'computeStoryboardWidgetOverlayScreenBox({',
    'centerWorld: worldPinned',
    'const storyboardPinnedCardLayoutActive = !floatingRef.current',
    'const effectivePanelScale = storyboardPinnedScreenBox?.scale ?? panelScale',
    '? { top: storyboardPinnedScreenBox.top, left: storyboardPinnedScreenBox.left }',
  ], 'expected pinned Storyboard Widget placement to reuse Card world-center screen-box layout during zoom')
  if (!placementProjectionText.includes(': { top: worldPinnedScreen.sy, left: worldPinnedScreen.sx }')) {
    throw new Error('expected non-Storyboard pinned widget placement to retain direct stable-world fallback during zoom')
  }
  assertTextIncludes(placementProjectionText, [
    'screenAuthorityLayoutZoomBaseRef',
    'projectCollectiveScreenLayoutForZoom({',
    'anchorX: screenAuthorityViewportLeft + screenAuthorityViewportWidth / 2',
    'anchorY: screenAuthorityViewportTop + screenAuthorityViewportHeight / 2',
  ], 'expected frontmatter screen-authority widgets to project around the visible viewport center while zooming')
  assertTextIncludes(overlaySurfaceText, [
    'applyFixedStoryboardCardPlacementsToGraphData2d({',
    'const overlayLayoutGraphData = React.useMemo((): GraphData | null => {',
    "if (String(storyboardWidgetSurfaceId || '').trim() !== 'storyboard') return renderGraphDataOverride",
    'graphData: overlayLayoutGraphData',
  ], 'expected Storyboard Widget overlay surface to render from the shared Card placement graph')
  if (!runtimeSceneText.includes("if (bucketId === viewportBucketId) return `${bucketId}:visible-viewport`")) {
    throw new Error('expected storyboard widget runtime scene to keep viewport auto-seed signatures stable across zoom changes')
  }
  if (!runtimeSceneText.includes('const currentLayoutSignature = `${args.overlayNodeLayoutSignature}|${visibleViewport.left},${visibleViewport.top},${visibleViewport.width}x${visibleViewport.height}|${bucketSignature}`')) {
    throw new Error('expected storyboard widget runtime scene layout signature to exclude zoom-key churn for overlay auto-seeding')
  }
  if (!mediaLoopText.includes('const previousTransform = lastTransform') || !mediaLoopText.includes('const scaleChanged = !!previousTransform && Math.abs(previousTransform.k - rawK) > 1e-6')) {
    throw new Error('expected rich media overlay layout loop to detect zoom-scale changes separately from pan changes')
  }
  assertTextIncludes(mediaLoopText, ['scaleLayoutOnZoom?: boolean', 'zoomLayoutBaseBoxById', 'projectCollectiveScreenLayoutForZoom({', 'baseLayoutScale: base.layoutScale', 'const panelLayoutScale = w / Math.max(1, base.w)', 'layoutScale: panelLayoutScale'], 'expected rich media overlay layout loop to support proportional zoom layout projection')
  assertTextIncludes(mediaOverlaysText, ['scaleLayoutOnZoom: storyboardWidgetSurfaceRendererMode'], 'expected Storyboard Widget shared rich-media overlays to opt into proportional zoom layout projection')
}

type ProbeRect = {
  left: number
  top: number
  width: number
  height: number
}

function measureCollectiveMetrics(rects: ProbeRect[]) {
  const centroid = rects.reduce((acc, rect) => ({
    x: acc.x + rect.left + rect.width / 2,
    y: acc.y + rect.top + rect.height / 2,
  }), { x: 0, y: 0 })
  centroid.x /= Math.max(1, rects.length)
  centroid.y /= Math.max(1, rects.length)
  const avgRadius =
    rects.reduce((sum, rect) => {
      const cx = rect.left + rect.width / 2
      const cy = rect.top + rect.height / 2
      return sum + Math.hypot(cx - centroid.x, cy - centroid.y)
    }, 0) / Math.max(1, rects.length)
  return { centroidX: centroid.x, centroidY: centroid.y, avgRadius }
}

function projectScreenLayoutAcrossZoom(args: {
  previousRects: ProbeRect[]
  nextWidth: number
  nextHeight: number
  anchorX: number
  anchorY: number
}): ProbeRect[] {
  return args.previousRects.map(rect => {
    const baseScale = rect.width / Math.max(1, args.nextWidth)
    const pos = projectCollectiveScreenLayoutForZoom({
      base: { left: rect.left, top: rect.top, scale: baseScale },
      scale: 1,
      anchorX: args.anchorX,
      anchorY: args.anchorY,
      baseWidth: args.nextWidth,
      baseHeight: args.nextHeight,
    })
    return { left: pos.left, top: pos.top, width: args.nextWidth, height: args.nextHeight }
  })
}

export function testStoryboardWidgetOverlayMetricProbeScalesProportionallyAcrossZoom() {
  const centers = [
    { x: 520, y: 320 },
    { x: 760, y: 320 },
    { x: 1000, y: 320 },
    { x: 640, y: 560 },
    { x: 880, y: 560 },
    { x: 1120, y: 560 },
  ]
  const anchor = { x: 960, y: 540 }
  const readWidgetScale = (zoomK: number) => computeCollectiveFollowPinnedScale({ zoomK, viewportW: 1920, viewportH: 1080, count: centers.length, baseWidth: 360, baseHeight: 520 })
  const widgetNeutralScale = readWidgetScale(1)
  const widgetZoomOutScale = readWidgetScale(0.5)
  const widgetZoomInScale = readWidgetScale(2)
  const widgetNeutralSize = computeWidgetScaledSize(widgetNeutralScale)
  const widgetNeutralRects = centers.map(center => ({
    left: center.x - widgetNeutralSize.width / 2,
    top: center.y - widgetNeutralSize.height / 2,
    width: widgetNeutralSize.width,
    height: widgetNeutralSize.height,
  }))
  const widgetZoomOutSize = computeWidgetScaledSize(widgetZoomOutScale)
  const widgetZoomInSize = computeWidgetScaledSize(widgetZoomInScale)
  const widgetZoomOutRects = projectScreenLayoutAcrossZoom({ previousRects: widgetNeutralRects, nextWidth: widgetZoomOutSize.width, nextHeight: widgetZoomOutSize.height, anchorX: anchor.x, anchorY: anchor.y })
  const widgetZoomInRects = projectScreenLayoutAcrossZoom({ previousRects: widgetNeutralRects, nextWidth: widgetZoomInSize.width, nextHeight: widgetZoomInSize.height, anchorX: anchor.x, anchorY: anchor.y })

  const richSizingConfig = {
    widthRatio: 0.2,
    widthMinPx: 220,
    widthMaxPx: 360,
    quantizeStepPx: 16,
  }
  const readRichSizing = (zoomK: number) => computeMediaOverlaySizing({ density: 'default', viewportW: 1920, viewportH: 1080, zoomK, itemCount: centers.length, config: richSizingConfig })
  const richNeutral = readRichSizing(widgetNeutralScale)
  const richZoomOut = readRichSizing(widgetZoomOutScale)
  const richZoomIn = readRichSizing(widgetZoomInScale)
  const richNeutralRects = centers.map(center => ({
    left: center.x - richNeutral.panelW / 2,
    top: center.y - richNeutral.panelH / 2,
    width: richNeutral.panelW,
    height: richNeutral.panelH,
  }))
  const richZoomOutRects = projectScreenLayoutAcrossZoom({ previousRects: richNeutralRects, nextWidth: richZoomOut.panelW, nextHeight: richZoomOut.panelH, anchorX: anchor.x, anchorY: anchor.y })
  const richZoomInRects = projectScreenLayoutAcrossZoom({ previousRects: richNeutralRects, nextWidth: richZoomIn.panelW, nextHeight: richZoomIn.panelH, anchorX: anchor.x, anchorY: anchor.y })

  const widgetNeutralMetrics = measureCollectiveMetrics(widgetNeutralRects)
  const widgetZoomOutMetrics = measureCollectiveMetrics(widgetZoomOutRects)
  const widgetZoomInMetrics = measureCollectiveMetrics(widgetZoomInRects)
  const richNeutralMetrics = measureCollectiveMetrics(richNeutralRects)
  const richZoomOutMetrics = measureCollectiveMetrics(richZoomOutRects)
  const richZoomInMetrics = measureCollectiveMetrics(richZoomInRects)

  const assertScaledRadius = (label: string, actual: number, expected: number) => {
    if (Math.abs(actual - expected) > 0.001) {
      throw new Error(`expected ${label} average radius to scale with panel size, actual=${actual} expected=${expected}`)
    }
  }
  assertScaledRadius('widget zoom-out', widgetZoomOutMetrics.avgRadius, widgetNeutralMetrics.avgRadius * (widgetZoomOutSize.width / widgetNeutralSize.width))
  assertScaledRadius('widget zoom-in', widgetZoomInMetrics.avgRadius, widgetNeutralMetrics.avgRadius * (widgetZoomInSize.width / widgetNeutralSize.width))
  assertScaledRadius('rich-media zoom-out', richZoomOutMetrics.avgRadius, richNeutralMetrics.avgRadius * (richZoomOut.panelW / richNeutral.panelW))
  assertScaledRadius('rich-media zoom-in', richZoomInMetrics.avgRadius, richNeutralMetrics.avgRadius * (richZoomIn.panelW / richNeutral.panelW))
  if (!(widgetZoomOutMetrics.avgRadius < widgetNeutralMetrics.avgRadius && widgetZoomInMetrics.avgRadius > widgetNeutralMetrics.avgRadius)) {
    throw new Error(`expected widget layout to contract on zoom-out and expand on zoom-in, out=${widgetZoomOutMetrics.avgRadius} neutral=${widgetNeutralMetrics.avgRadius} in=${widgetZoomInMetrics.avgRadius}`)
  }
  if (!(richZoomOutMetrics.avgRadius <= richNeutralMetrics.avgRadius && richZoomInMetrics.avgRadius >= richNeutralMetrics.avgRadius)) {
    throw new Error(`expected rich-media layout to not diverge on zoom-out or collide on zoom-in, out=${richZoomOutMetrics.avgRadius} neutral=${richNeutralMetrics.avgRadius} in=${richZoomInMetrics.avgRadius}`)
  }
}
