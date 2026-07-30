import fs from 'node:fs'
import path from 'node:path'

import {
  buildCollectiveCameraFollowBaselineKey,
  computeCollectiveCameraFollowScaleFromBaseline,
  computeCollectiveFollowPinnedScale,
  computeCollectiveFollowZoomK,
  computeWidgetScaledSize,
  resetCollectiveCameraFollowBaseline,
  resolveCollectiveCameraFollowBaselineRef,
  WIDGET_BASE_SIZE,
} from '@/lib/canvas/overlayWidgetZoom'
import { computeMediaOverlaySizing } from '@/lib/render/mediaOverlaySizing'
import { coerceRichMediaPanelSizePx } from '@/lib/render/richMediaSsot'
import { computeTransformScaleAboutViewportFrameCenter, screenToWorld } from '@/lib/zoom/viewport'
import {
  applyFixedStoryboardCardPlacementsToGraphData2d,
  readStoryboardWidgetPlacementSize2d,
} from '@/components/StoryboardWidgetCanvas/storyboardCardPlacements2d'

function readSourceFilesUnder(dir: string): string[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true })
  const files: string[] = []
  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      files.push(...readSourceFilesUnder(full))
      continue
    }
    if (/\.[cm]?[tj]sx?$/.test(entry.name)) files.push(full)
  }
  return files
}

function assertTextIncludes(text: string, snippets: string[], message: string) {
  for (const snippet of snippets) {
    if (!text.includes(snippet)) throw new Error(`${message}: ${snippet}`)
  }
}

export function testStoryboardWidgetCollectiveScaleDoesNotReverseZoomDirection() {
  const zoomOut = computeCollectiveFollowPinnedScale({
    zoomK: 0.5,
    viewportW: 1920,
    viewportH: 1080,
    count: 12,
    baseWidth: 360,
    baseHeight: 520,
  })
  const neutral = computeCollectiveFollowPinnedScale({
    zoomK: 1,
    viewportW: 1920,
    viewportH: 1080,
    count: 12,
    baseWidth: 360,
    baseHeight: 520,
  })
  const zoomIn = computeCollectiveFollowPinnedScale({
    zoomK: 2,
    viewportW: 1920,
    viewportH: 1080,
    count: 12,
    baseWidth: 360,
    baseHeight: 520,
  })

  if (!(zoomOut <= neutral)) {
    throw new Error(`expected widget collective zoom-out scale to not grow past neutral, got out=${zoomOut} neutral=${neutral}`)
  }
  if (!(zoomIn >= neutral)) {
    throw new Error(`expected widget collective zoom-in scale to not shrink below neutral, got in=${zoomIn} neutral=${neutral}`)
  }
}

export function testStoryboardWidgetPlacementReusesSharedSurfaceDefaultSize() {
  const graphData = {
    type: 'application/json',
    nodes: [
      {
        id: 'card-a',
        type: 'storyboard',
        label: 'Card A',
        x: 0,
        y: 0,
        properties: { lane: 'Elements', summary: 'A', order: 0 },
      },
      {
        id: 'card-b',
        type: 'storyboard',
        label: 'Card B',
        x: 0,
        y: 0,
        properties: { lane: 'Elements', summary: 'B', order: 1 },
      },
    ],
    edges: [],
  } as never
  const cardLayout = applyFixedStoryboardCardPlacementsToGraphData2d({
    aspectRatioMode: '16:9',
    graphData,
    graphRevision: 1,
    schema: null,
  })
  const widgetLayout = applyFixedStoryboardCardPlacementsToGraphData2d({
    aspectRatioMode: '16:9',
    graphData,
    graphRevision: 1,
    readPlacementSize: node => readStoryboardWidgetPlacementSize2d(node, '16:9'),
    schema: null,
  })
  const readGap = (next: typeof cardLayout): number => {
    const nodes = Array.isArray(next?.nodes) ? next!.nodes : []
    const a = nodes.find(node => String(node?.id || '') === 'card-a') as { y?: number } | undefined
    const b = nodes.find(node => String(node?.id || '') === 'card-b') as { y?: number } | undefined
    if (!Number.isFinite(a?.y) || !Number.isFinite(b?.y)) return 0
    return Math.abs(Number(b!.y) - Number(a!.y))
  }
  const cardGap = readGap(cardLayout)
  const widgetGap = readGap(widgetLayout)
  if (widgetGap !== cardGap) {
    throw new Error(`expected Card and Widget placement to reuse identical default shape and size, cardGap=${cardGap} widgetGap=${widgetGap}`)
  }
}

export function testStoryboardWidgetRichMediaCollectiveSizingDoesNotReverseZoomDirection() {
  const sizingConfig = {
    widthRatio: 0.2,
    widthMinPx: 220,
    widthMaxPx: 360,
    quantizeStepPx: 16,
  }
  const itemCount = 12
  const widgetZoomOut = computeCollectiveFollowPinnedScale({
    zoomK: 0.5,
    viewportW: 1920,
    viewportH: 1080,
    count: itemCount,
    baseWidth: 360,
    baseHeight: 520,
  })
  const widgetNeutral = computeCollectiveFollowPinnedScale({
    zoomK: 1,
    viewportW: 1920,
    viewportH: 1080,
    count: itemCount,
    baseWidth: 360,
    baseHeight: 520,
  })
  const widgetZoomIn = computeCollectiveFollowPinnedScale({
    zoomK: 2,
    viewportW: 1920,
    viewportH: 1080,
    count: itemCount,
    baseWidth: 360,
    baseHeight: 520,
  })

  const zoomOut = computeMediaOverlaySizing({
    density: 'default',
    viewportW: 1920,
    viewportH: 1080,
    zoomK: widgetZoomOut,
    itemCount,
    config: sizingConfig,
  })
  const neutral = computeMediaOverlaySizing({
    density: 'default',
    viewportW: 1920,
    viewportH: 1080,
    zoomK: widgetNeutral,
    itemCount,
    config: sizingConfig,
  })
  const zoomIn = computeMediaOverlaySizing({
    density: 'default',
    viewportW: 1920,
    viewportH: 1080,
    zoomK: widgetZoomIn,
    itemCount,
    config: sizingConfig,
  })

  if (!(zoomOut.panelW <= neutral.panelW && zoomOut.panelH <= neutral.panelH)) {
    throw new Error(`expected rich media zoom-out sizing to not grow past neutral, got out=${zoomOut.panelW}x${zoomOut.panelH} neutral=${neutral.panelW}x${neutral.panelH}`)
  }
  if (!(zoomIn.panelW >= neutral.panelW && zoomIn.panelH >= neutral.panelH)) {
    throw new Error(`expected rich media zoom-in sizing to not shrink below neutral, got in=${zoomIn.panelW}x${zoomIn.panelH} neutral=${neutral.panelW}x${neutral.panelH}`)
  }
}

export function testStoryboardNewCardScaleUsesSharedRichMediaZoomBaseline() {
  const persistentBaselineRef = resolveCollectiveCameraFollowBaselineRef('storyboard:test-baseline')
  persistentBaselineRef.current = 0.42
  if (resolveCollectiveCameraFollowBaselineRef('storyboard:test-baseline') !== persistentBaselineRef) {
    throw new Error('expected the shared Card/Rich Media zoom baseline to survive a Storyboard surface remount')
  }
  const sharedArgs = {
    zoomK: 0.55,
    baselineZoomK: 0.42,
  }
  const cardScale = computeCollectiveCameraFollowScaleFromBaseline(sharedArgs)
  const richMediaScale = computeCollectiveCameraFollowScaleFromBaseline(sharedArgs)
  if (cardScale !== richMediaScale) {
    throw new Error(`expected new Card and Rich Media overlays to share one baseline-relative scale, card=${cardScale} media=${richMediaScale}`)
  }
  const expectedScale = sharedArgs.zoomK / sharedArgs.baselineZoomK
  if (Math.abs(cardScale - expectedScale) > 1e-9) {
    throw new Error(`expected exact camera-to-baseline overlay scale ${expectedScale}, got ${cardScale}`)
  }

  const zoomedOutK = 0.12
  const baselineK = 0.37
  const zoomedOutScale = computeCollectiveCameraFollowScaleFromBaseline({ zoomK: zoomedOutK, baselineZoomK: baselineK })
  const worldCenterDistance = 1500
  const panelWidth = 360
  const baselineGap = worldCenterDistance * baselineK - panelWidth
  const zoomedOutGap = worldCenterDistance * zoomedOutK - panelWidth * zoomedOutScale
  if (Math.abs(zoomedOutGap - baselineGap * zoomedOutScale) > 1e-9) {
    throw new Error(`expected card/panel gap to preserve layout similarity across zoom, baselineGap=${baselineGap} zoomedOutGap=${zoomedOutGap}`)
  }

  const srcRoot = path.resolve(process.cwd(), 'src')
  const cardProjectionText = fs.readFileSync(path.join(srcRoot, 'components', 'StoryboardWidgetCanvas', 'useStoryboardCardOverlayProjection2d.ts'), 'utf8')
  const mediaText = fs.readFileSync(path.join(srcRoot, 'components', 'FlowCanvas', 'FlowCanvasMediaOverlays.tsx'), 'utf8')
  const surfaceText = fs.readFileSync(path.join(srcRoot, 'components', 'StoryboardWidgetCanvas', 'runtime', 'StoryboardWidgetCanvasSurface.tsx'), 'utf8')
  assertTextIncludes(cardProjectionText, [
    'storyboardCardZoomBaselineKRef',
    'computeCollectiveCameraFollowScaleFromBaseline({',
    'storyboardCollectiveZoomBaselineKRef',
  ], 'expected newly added Storyboard Cards to reuse the baseline-relative overlay zoom owner')
  assertTextIncludes(mediaText, [
    'computeCollectiveCameraFollowScaleFromBaseline({',
    'storyboardCollectiveZoomBaselineKRef',
  ], 'expected Rich Media overlays to reuse the same baseline-relative overlay zoom owner')
  assertTextIncludes(surfaceText, [
    'resolveCollectiveCameraFollowBaselineRef(',
    'storyboardCollectiveZoomBaselineKRef={storyboardCollectiveZoomBaselineKRef}',
  ], 'expected the shared Storyboard surface to reuse one persistent Card/Rich Media zoom baseline across graph publication remounts')
}

export function testStoryboardWidgetCollectiveScaleUsesRequestedLayoutAspect() {
  const srcRoot = path.resolve(process.cwd(), 'src')
  const neutralZoomPath = path.join(srcRoot, 'lib', 'canvas', 'overlayWidgetZoom.ts')
  const neutralText = fs.readFileSync(neutralZoomPath, 'utf8')
  const collectiveStart = neutralText.indexOf('export function computeCollectiveFollowPinnedScale')
  if (collectiveStart < 0) {
    throw new Error('expected neutral overlay zoom owner to expose collective scale helper')
  }
  const collectiveBody = neutralText.slice(collectiveStart)
  if (!collectiveBody.includes('width: baseWidth * candidate') || !collectiveBody.includes('height: baseHeight * candidate')) {
    throw new Error('expected collective zoom fit loop to measure the requested base layout size instead of widget-only dimensions')
  }
  if (collectiveBody.includes('const panel = computeWidgetScaledSize(candidate)')) {
    throw new Error('expected collective zoom fit loop to avoid widget-only sizing for rich-media panel collectives')
  }

  const landscapeScale = computeCollectiveFollowPinnedScale({
    zoomK: 1,
    viewportW: 1280,
    viewportH: 720,
    count: 12,
    baseWidth: 320,
    baseHeight: 180,
    hardMinScale: 0.05,
    hardMaxScale: 1,
  })
  const portraitScale = computeCollectiveFollowPinnedScale({
    zoomK: 1,
    viewportW: 1280,
    viewportH: 720,
    count: 12,
    baseWidth: 180,
    baseHeight: 320,
    hardMinScale: 0.05,
    hardMaxScale: 1,
  })
  if (Math.abs(landscapeScale - portraitScale) <= 0.01) {
    throw new Error(`expected collective zoom scale to react to caller-provided layout aspect, got landscape=${landscapeScale} portrait=${portraitScale}`)
  }
}

export function testStoryboardWidgetLiveCollectiveScaleFollowsZoomWithoutViewportFitClamp() {
  const viewport = { viewportW: 909, viewportH: 801, count: 19, baseWidth: 360, baseHeight: 520 }
  const followNeutral = computeCollectiveFollowPinnedScale({
    ...viewport,
    zoomK: 1,
    fitToViewport: false,
  })
  const followZoomIn = computeCollectiveFollowPinnedScale({
    ...viewport,
    zoomK: 1.25,
    fitToViewport: false,
  })
  const fittedZoomIn = computeCollectiveFollowPinnedScale({
    ...viewport,
    zoomK: 1.25,
  })
  if (!(followZoomIn > followNeutral)) {
    throw new Error(`expected Storyboard Widget live collective scale to grow with zoom, neutral=${followNeutral} zoomIn=${followZoomIn}`)
  }
  if (!(fittedZoomIn <= followZoomIn)) {
    throw new Error(`expected viewport-fit collective scale to remain the fit/reset path, fitted=${fittedZoomIn} follow=${followZoomIn}`)
  }
  const fitBaselineK = 0.18
  const baselineRelative = computeCollectiveFollowPinnedScale({
    ...viewport,
    zoomK: computeCollectiveFollowZoomK({ zoomK: fitBaselineK, baselineZoomK: fitBaselineK }),
    fitToViewport: false,
  })
  const zoomedRelative = computeCollectiveFollowPinnedScale({
    ...viewport,
    zoomK: computeCollectiveFollowZoomK({ zoomK: fitBaselineK * 1.25, baselineZoomK: fitBaselineK }),
    fitToViewport: false,
  })
  if (!(zoomedRelative > baselineRelative)) {
    throw new Error(`expected baseline-normalized Storyboard Widget zoom to change visible collective scale while native fit k is below 1, baseline=${baselineRelative} zoomed=${zoomedRelative}`)
  }

  const srcRoot = path.resolve(process.cwd(), 'src')
  const placementText = fs.readFileSync(path.join(srcRoot, 'components', 'StoryboardWidget', 'useWidgetPlacementRuntime.ts'), 'utf8')
  const placementStateText = fs.readFileSync(path.join(srcRoot, 'components', 'StoryboardWidget', 'widgetPlacementRuntimeState.ts'), 'utf8')
  if (!placementText.includes('fitToViewport: false')) {
    throw new Error('expected Storyboard Widget placement to follow zoom instead of fitting every zoom step back into the viewport')
  }
  if (!placementText.includes('computeCollectiveFollowZoomK,') || !placementStateText.includes('args.computeCollectiveFollowZoomK({')) {
    throw new Error('expected screen-authority Storyboard widgets to normalize viewport zoom against their live baseline')
  }
  if (placementText.includes('const frontmatterPanelScaleZoomK = frontmatterVisibleViewportAuthority ? 1 : zoomK')) {
    throw new Error('expected Storyboard Widget zoom to avoid stale neutral-scale screen-authority gating')
  }
  const mediaText = fs.readFileSync(path.join(srcRoot, 'components', 'FlowCanvas', 'FlowCanvasMediaOverlays.tsx'), 'utf8')
  const mediaViewportText = fs.readFileSync(path.join(srcRoot, 'components', 'FlowCanvas', 'flowCanvasMediaLayoutViewport.ts'), 'utf8')
  assertTextIncludes(mediaText, [
    'computeCollectiveCameraFollowScaleFromBaseline({',
    'computeCollectiveFollowScaleFromBaseline({',
    'const readMediaLayoutViewport = React.useCallback',
    'readLayoutViewport: readMediaLayoutViewport',
    'coerceRichMediaPanelSizeForLayoutViewport({ readLayoutViewport: readMediaLayoutViewport',
  ], 'expected rich-media Storyboard Widget overlays to use the shared visible viewport zoom owner')
  assertTextIncludes(mediaViewportText, ['resolveStoryboardWidgetVisibleViewport({'], 'expected rich-media Storyboard Widget overlays to reuse the widget visible viewport owner')

  const mediaLoopText = fs.readFileSync(path.join(srcRoot, 'lib', 'render', 'mediaOverlayLayoutLoop2d.ts'), 'utf8')
  assertTextIncludes(mediaLoopText, [
    'readLayoutViewport?: (() => MediaOverlayLayoutViewport | null) | null',
    'viewportW: layoutViewport.width',
    'viewportH: layoutViewport.height',
    'left: layoutViewport.left + cell.left',
    'top: layoutViewport.top + cell.top',
  ], 'expected shared media overlay loop to honor the active layout viewport')
}

export function testStoryboardWidgetToolbarExposesRuntimeZoomActions() {
  const srcRoot = path.resolve(process.cwd(), 'src')
  const toolbarText = fs.readFileSync(path.join(srcRoot, 'components', 'Toolbar.tsx'), 'utf8')
  const zoomModeSelectText = fs.readFileSync(path.join(srcRoot, 'components', 'toolbar', 'ZoomModeSelect.tsx'), 'utf8')
  const zoomMenuModelText = fs.readFileSync(path.join(srcRoot, 'components', 'toolbar', 'toolbarZoomMenuModel.ts'), 'utf8')
  const fixedZoomPresetText = fs.readFileSync(path.join(srcRoot, 'lib', 'zoom', 'fixedZoomPreset.ts'), 'utf8')
  const nativeZoomText = fs.readFileSync(path.join(srcRoot, 'components', 'FlowCanvas', 'applyZoomRequestNative.ts'), 'utf8')
  const interactionRuntimeText = fs.readFileSync(path.join(srcRoot, 'components', 'FlowCanvas', 'FlowCanvasInteractionRuntime.tsx'), 'utf8')
  assertTextIncludes(toolbarText, [
    '<ZoomModeSelect iconSizeClass={iconSizeClass} iconStrokeWidth={iconStrokeWidth} onZoomSelection={onZoomSelection} />',
  ], 'expected toolbar Zoom owner to route zoom controls through the shared Zoom menu')
  assertTextIncludes(zoomModeSelectText, [
    "key: 'action:out' as const",
    "key: 'action:in' as const",
    "requestZoom('in')",
    "requestZoom('out')",
    'computeToolbarZoomPresetTransform({ state, preset: presetValue })',
    "{ intent: 'zoomPreset' }",
    'disableAutoZoomModesForUserGesture({',
  ], 'expected Zoom menu to own in/out actions and center-preserving preset dispatch')
  assertTextIncludes(zoomMenuModelText, [
    'FIXED_ZOOM_PRESETS as TOOLBAR_ZOOM_PRESETS',
    'readFixedZoomScale as readToolbarZoomScale',
    'computeFixedZoomPresetTransform as computeToolbarZoomPresetTransform',
  ], 'expected Zoom menu model to preserve its public toolbar facade over the shared fixed-preset owner')
  assertTextIncludes(fixedZoomPresetText, [
    'FIXED_ZOOM_PRESETS',
    'NATURAL_CANVAS_ZOOM_PRESET',
    'computeNaturalCanvasInitialTransform',
    'computeTransformScaleAboutViewportCenter',
    'buildActive2dZoomViewKey',
    'getEffectiveZoomStateForKey',
  ], 'expected shared fixed zoom presets to reuse the canonical zoom key and viewport transform helpers')
  assertTextIncludes(nativeZoomText, [
    "args.zoomRequest.intent === 'zoomPreset'",
    "args.zoomRequest.intent === 'naturalInitialization'",
    'x: visibleViewport.centerX',
    'y: visibleViewport.centerY',
    'resetCollectiveCameraFollowBaseline(',
    "reason: 'zoom-preset'",
    'targetTransform: {',
  ], 'expected Storyboard zoom presets to reset stale overlay scale authority and request target-transform balanced spread')
  assertTextIncludes(interactionRuntimeText, [
    "if (!graphActivationFit && zoomRequest.type === 'fit')",
    'Explicit user zoom commands are presentation-only',
  ], 'expected explicit zoom presets to remain usable while the Markdown editor guards source mutation')

  const baselineKey = buildCollectiveCameraFollowBaselineKey({
    surfaceId: 'storyboard-test-surface',
    graphKey: 'document-test-key',
  })
  const baselineRef = resolveCollectiveCameraFollowBaselineRef(baselineKey)
  baselineRef.current = 3.8
  resetCollectiveCameraFollowBaseline(baselineKey)
  const presetScale = computeCollectiveCameraFollowScaleFromBaseline({
    zoomK: 1,
    baselineZoomK: baselineRef.current,
  })
  if (presetScale !== 1) {
    throw new Error(`expected 100% preset to restore natural Widget/Rich Media paint scale, got ${presetScale}`)
  }
}

export function testStoryboardWidgetRichMediaZoomCoercionMaintainsIndividualAspectRatio() {
  const samples = [
    { width: 96, height: 54, viewportW: 640, viewportH: 360 },
    { width: 960, height: 540, viewportW: 640, viewportH: 360 },
    { width: 54, height: 96, viewportW: 640, viewportH: 900 },
  ]
  for (const sample of samples) {
    const targetAspect = sample.width / sample.height
    const coerced = coerceRichMediaPanelSizePx({
      width: sample.width,
      height: sample.height,
      viewportW: sample.viewportW,
      viewportH: sample.viewportH,
      minWidthPx: 220,
      minHeightPx: 160,
    })
    const actualAspect = coerced.width / coerced.height
    if (Math.abs(actualAspect - targetAspect) > 0.01) {
      throw new Error(`expected zoom-bound rich-media panel size to preserve individual aspect, target=${targetAspect} actual=${actualAspect}`)
    }
    if (coerced.width < 220 || coerced.height < 160) {
      throw new Error(`expected rich-media zoom coercion to preserve minimum usable panel size, got ${coerced.width}x${coerced.height}`)
    }
  }
}

export function testStoryboardWidgetZoomInOutUsesVisibleCanvasCenterAsContextualAnchor() {
  const applyZoomPath = path.resolve(process.cwd(), 'src', 'components', 'FlowCanvas', 'applyZoomRequestNative.ts')
  const applyZoomText = fs.readFileSync(applyZoomPath, 'utf8')
  for (const snippet of [
    'computeTransformScaleAboutViewportFrameCenter',
    'const isStoryboardWidgetContextualZoomRequest =',
    'viewport: visibleViewport',
    'const shouldRecenterStoryboardWidgetCollectiveAfterZoom =',
    'const resolved = isStoryboardWidgetFitLikeRequest && storyboardWidgetOverlayFitResolved',
  ]) {
    if (!applyZoomText.includes(snippet)) {
      throw new Error(`expected Storyboard Widget zoom in/out to use visible canvas center contextual zoom behavior: ${snippet}`)
    }
  }

  const current = { k: 0.8, x: -120, y: 36 }
  const focal = { x: 612, y: 360 }
  const beforeWorld = screenToWorld({ transform: current, sx: focal.x, sy: focal.y })
  const next = computeTransformScaleAboutViewportFrameCenter({
    transform: current,
    viewport: { centerX: focal.x, centerY: focal.y },
    nextK: 1.25,
  })
  const afterWorld = screenToWorld({ transform: next, sx: focal.x, sy: focal.y })
  if (Math.abs(afterWorld.x - beforeWorld.x) > 1e-9 || Math.abs(afterWorld.y - beforeWorld.y) > 1e-9) {
    throw new Error(`expected contextual zoom focal world point to remain stable, before=${JSON.stringify(beforeWorld)} after=${JSON.stringify(afterWorld)}`)
  }
}

export function testRuntimeZoomDispatchDoesNotGate2dZoomOnGeospatialBridge() {
  const dispatchPath = path.resolve(process.cwd(), 'src', 'lib', 'canvas', 'runtimeZoomDispatch.ts')
  const text = fs.readFileSync(dispatchPath, 'utf8')
  const zoomBranch = text.indexOf("if (store.canvasRenderMode === '2d') {\n    store.requestZoom(type)")
  const geospatialRead = text.indexOf('const geospatialEnabled = await readGeospatialModeEnabled()')
  if (zoomBranch < 0 || geospatialRead < 0 || zoomBranch > geospatialRead) {
    throw new Error('expected 2D runtime zoom dispatch to request zoom before awaiting the geospatial bridge')
  }
  const fitBranch = text.indexOf("if (store.canvasRenderMode === '2d') {\n    store.requestZoom('fit', { intent })")
  const fitGeospatialRead = text.indexOf('const geospatialEnabled = await readGeospatialModeEnabled().catch(() => false)', geospatialRead + 1)
  if (fitBranch < 0 || fitGeospatialRead < 0 || fitBranch > fitGeospatialRead) {
    throw new Error('expected 2D runtime fit dispatch to request zoom before awaiting the geospatial bridge')
  }
}

export function testFlowCanvasZoomHelpersStayRendererNeutral() {
  const srcRoot = path.resolve(process.cwd(), 'src')
  const neutralZoomPath = path.join(srcRoot, 'lib', 'canvas', 'overlayWidgetZoom.ts')
  const legacyStoryboardWidgetZoomPath = path.join(srcRoot, 'components', 'StoryboardWidget', 'widgetZoom.ts')
  const flowCanvasFiles = readSourceFilesUnder(path.join(srcRoot, 'components', 'FlowCanvas'))
  const forbiddenStoryboardWidgetOwners = [
    '@/components/StoryboardWidget/widgetZoom',
    '@/components/StoryboardWidget/useWidgetPlacementRuntime',
    'components/StoryboardWidget/widgetZoom',
    'components/StoryboardWidget/useWidgetPlacementRuntime',
  ]

  if (!fs.existsSync(neutralZoomPath)) {
    throw new Error('expected overlay zoom sizing to live in the neutral canvas helper owner')
  }
  if (fs.existsSync(legacyStoryboardWidgetZoomPath)) {
    throw new Error('expected legacy Storyboard Widget zoom owner to be removed instead of kept as a renderer alias')
  }

  const neutralText = fs.readFileSync(neutralZoomPath, 'utf8')
  if (!neutralText.includes('export function computeCollectiveFollowPinnedScale') || !neutralText.includes('export function computeWidgetScaledSize')) {
    throw new Error('expected neutral overlay zoom owner to export collective scale and widget size helpers')
  }

  for (const file of flowCanvasFiles) {
    const text = fs.readFileSync(file, 'utf8')
    for (const owner of forbiddenStoryboardWidgetOwners) {
      if (text.includes(owner)) {
        throw new Error(`expected Flow Canvas to avoid Storyboard Widget overlay owner seepage in ${path.relative(srcRoot, file)}`)
      }
    }
  }

  const flowCanvasZoomUsers = flowCanvasFiles.filter(file => {
    const text = fs.readFileSync(file, 'utf8')
    return text.includes('computeCollectiveFollowPinnedScale') || text.includes('computeWidgetScale') || text.includes('WIDGET_BASE_SIZE')
  })
  if (flowCanvasZoomUsers.length > 0) {
    const nonNeutralUsers = flowCanvasZoomUsers.filter(file => !fs.readFileSync(file, 'utf8').includes('@/lib/canvas/overlayWidgetZoom'))
    if (nonNeutralUsers.length > 0) {
      throw new Error(`expected Flow Canvas zoom helper users to import the neutral canvas owner: ${nonNeutralUsers.map(file => path.relative(srcRoot, file)).join(', ')}`)
    }
  }
}

export {
  testStoryboardWidgetOverlayMetricProbeScalesProportionallyAcrossZoom,
  testStoryboardWidgetOverlayZoomUsesProportionalScreenProjection,
} from './storyboardWidgetOverlayZoomProjection.test'
