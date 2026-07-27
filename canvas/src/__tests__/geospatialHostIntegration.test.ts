import fs from 'node:fs'
import path from 'node:path'

const readUtf8 = (absPath: string): string => {
  return fs.readFileSync(absPath, { encoding: 'utf8' })
}

export const testGeospatialOverlayHostNotGatedBySidebar = () => {
  const canvasPath = path.resolve(process.cwd(), 'src', 'pages', 'Canvas.tsx')
  const text = readUtf8(canvasPath)
  const viewportPath = path.resolve(process.cwd(), 'src', 'components', 'CanvasViewport.tsx')
  const viewportText = readUtf8(viewportPath)
  if (text.includes("active={isSidebarOpen && floatingPanelTab === 'geo'}")) {
    throw new Error('GeospatialOverlayHost must not be gated by FloatingPanel expand/collapse')
  }
  if (!text.includes('geospatialModeEnabled')) throw new Error('Expected geospatialModeEnabled state to exist')
  if (!(text.includes('geospatialModeEnabled &&') || viewportText.includes('geospatialModeEnabled &&'))) {
    throw new Error('Expected GeospatialOverlayHost to mount only when Geospatial Mode is enabled')
  }
}

export const testFitToViewActionDoesNotRouteStoryboard2dToGeospatialFallback = () => {
  const fitToViewPath = path.resolve(process.cwd(), 'src', 'features', 'toolbar', 'hooks', 'useFitToViewAction.ts')
  const text = readUtf8(fitToViewPath)
  if (!text.includes("const storyboard2dActive = canvas2dRenderer === 'storyboard'")) {
    throw new Error('Expected Fit-to-View action to fast-path Storyboard onto the canvas zoom pipeline')
  }
  if (!text.includes('if (storyboard2dActive) {')) {
    throw new Error('Expected Fit-to-View action to guard Storyboard before geospatial fallback branches')
  }
  if (!text.includes("const allowGeospatialFit = geospatialEnabled && canvasRenderMode !== '2d'")) {
    throw new Error('Expected Fit-to-View action to keep Storyboard 2D requests on the canvas zoom pipeline')
  }
  const storyboardGuardIndex = text.indexOf('if (storyboard2dActive) {')
  const geospatialGuardIndex = text.indexOf('if (allowGeospatialFit)')
  const storyboardBranchText =
    storyboardGuardIndex >= 0 && geospatialGuardIndex > storyboardGuardIndex
      ? text.slice(storyboardGuardIndex, geospatialGuardIndex)
      : ''
  const fallbackFitZoomIndex = text.lastIndexOf("requestZoom('fit', { intent: 'fitToView' })")
  if (
    storyboardGuardIndex < 0
    || geospatialGuardIndex < 0
    || storyboardGuardIndex > geospatialGuardIndex
    || !storyboardBranchText.includes("requestZoom('fit', { intent: 'fitToView' })")
    || fallbackFitZoomIndex < geospatialGuardIndex
  ) {
    throw new Error('Expected non-geospatial Fit-to-View path to route through fit zoom requests for 2D canvas')
  }
}

export const testCanvasForbidsGraphWhenGeospatialEnabled = () => {
  const viewportPath = path.resolve(process.cwd(), 'src', 'components', 'CanvasViewport.tsx')
  const text = readUtf8(viewportPath)

  if (!text.includes('!geospatialModeEnabled && canvasRenderMode === \'2d\'')) {
    throw new Error('Expected 2D canvas to be gated off while Geospatial Mode is enabled')
  }
  if (!text.includes('!geospatialModeEnabled && canvasRenderMode === \'3d\'')) {
    throw new Error('Expected 3D canvas to be gated off while Geospatial Mode is enabled')
  }
  if (!(text.includes('!geospatialModeEnabled') && text.includes('<MinimapLazy />'))) {
    throw new Error('Expected minimap overlay to be gated by Geospatial Mode')
  }
}

export const testGeospatialStoryboardWidgetDropBridgeStaysMounted = () => {
  const viewportPath = path.resolve(process.cwd(), 'src', 'components', 'CanvasViewport.tsx')
  const storyboardWidgetPath = path.resolve(process.cwd(), 'src', 'components', 'StoryboardWidgetCanvas.tsx')
  const viewportText = readUtf8(viewportPath)
  const storyboardWidgetText = readUtf8(storyboardWidgetPath)

  if (!viewportText.includes("geospatialModeEnabled && active2dSurface === 'storyboard'")) {
    throw new Error('Expected Geospatial mode to mount the Storyboard widget drop bridge when Storyboard is selected')
  }
  if (!viewportText.includes('<StoryboardWidgetDropBridgeLazy active={false} widgetDropCaptureEnabled geospatialWidgetPanelMode />')) {
    throw new Error('Expected Geospatial Storyboard widget bridge to mount with widget-drop capture and geospatial panel mode')
  }
  if (!storyboardWidgetText.includes('widgetDropCaptureEnabled')) {
    throw new Error('Expected StoryboardWidgetCanvas to expose widgetDropCaptureEnabled override for drop listeners')
  }
  if (!storyboardWidgetText.includes('geospatialWidgetPanelMode')) {
    throw new Error('Expected StoryboardWidgetCanvas to expose geospatial widget panel overlay mode')
  }
}

export const testGeospatialWidgetPanelsDefaultToFloatingAndHideMapDots = () => {
  const viewportPath = path.resolve(process.cwd(), 'src', 'components', 'CanvasViewport.tsx')
  const storyboardWidgetPath = path.resolve(process.cwd(), 'src', 'components', 'StoryboardWidgetCanvas', 'runtime', 'useStoryboardWidgetDropBridge.ts')
  const hostPath = path.resolve(process.cwd(), '..', 'gympgrph', 'src', 'GeospatialHost.tsx')
  const viewportText = readUtf8(viewportPath)
  const storyboardWidgetText = readUtf8(storyboardWidgetPath)
  const hostText = readUtf8(hostPath)

  if (!viewportText.includes('geospatialPanelNodeIds')) {
    throw new Error('Expected CanvasViewport geospatial snapshot to publish panel-rendered widget node ids')
  }
  if (!storyboardWidgetText.includes("import { setFlowWidgetPinnedById } from '@/lib/storyboardWidget/flowWidgetPinnedState'")
    || !storyboardWidgetText.includes('setFlowWidgetPinnedById(st.flowWidgetPinnedByNodeId, actualId, false)')) {
    throw new Error('Expected geospatial widget drops to default to unpinned floating panels')
  }
  if (!hostText.includes('if (panelNodeIds.has(nodeId)) continue')) {
    throw new Error('Expected GeospatialHost to suppress point rendering for panel-rendered widget nodes')
  }
}

export const testGeospatialWidgetPanelsResolvePendingOpenAgainstRenderedGraph = () => {
  const storyboardWidgetPath = path.resolve(process.cwd(), 'src', 'components', 'StoryboardWidgetCanvas.tsx')
  const storyboardWidgetText = readUtf8(storyboardWidgetPath)

  if (!storyboardWidgetText.includes('resolveGraphNodeIdByCanonicalId(renderGraphDataOverride as GraphData | null, pending) || pending')) {
    throw new Error('Expected StoryboardWidgetCanvas to resolve pending widget opens against rendered graph canonical ids')
  }
  if (!storyboardWidgetText.includes('Array.isArray(renderGraphDataOverride?.nodes)')) {
    throw new Error('Expected pending widget-open resolution to inspect rendered graph nodes, not only local draft nodes')
  }
}

export const testGeospatialWidgetPanelsDoNotBindDiscoveryWidgetsToGeoCoordinates = () => {
  const storyboardWidgetPath = path.resolve(process.cwd(), 'src', 'components', 'StoryboardWidgetCanvas.tsx')
  const storyboardWidgetText = readUtf8(storyboardWidgetPath)

  if (!storyboardWidgetText.includes('if (!geospatialWidgetPanelMode) {')) {
    throw new Error('Expected geospatial widget panel mode to guard coordinate-coupled discovery widget behavior')
  }
  if (!storyboardWidgetText.includes('if (entry.nodeTypeId === FLOW_GRABMAPS_DISCOVERY_NODE_TYPE_ID && !geospatialWidgetPanelMode) {')) {
    throw new Error('Expected post-drop discovery geo sync to stay disabled for geospatial widget panel mode')
  }
  if (!storyboardWidgetText.includes('if (!geospatialWidgetPanelMode) {\n          const dropGeo = readFiniteGeoLatLng(properties)')) {
    throw new Error('Expected map recentering to stay disabled for geospatial widget panel mode discovery widget drops')
  }
}

export const testGeospatialWidgetPanelsOverrideStalePinnedReuseOnDrop = () => {
  const storyboardWidgetPath = path.resolve(process.cwd(), 'src', 'components', 'StoryboardWidgetCanvas', 'runtime', 'useStoryboardWidgetDropBridge.ts')
  const storyboardWidgetText = readUtf8(storyboardWidgetPath)

  if (!storyboardWidgetText.includes('const nextPinnedMap = setFlowWidgetPinnedById(st.flowWidgetPinnedByNodeId, actualId, false)')) {
    throw new Error('Expected geospatial widget panel drops to override stale pinned state for reused node ids')
  }
  if (!storyboardWidgetText.includes('if (nextPinnedMap) st.setFlowWidgetPinnedByNodeId(nextPinnedMap)')) {
    throw new Error('Expected geospatial widget panel drops to force new widgets back to floating mode')
  }
}

export const testGeospatialWidgetPanelsIncludeRichMediaPanelInSharedOpenPath = () => {
  const storyboardWidgetPath = path.resolve(process.cwd(), 'src', 'components', 'StoryboardWidgetCanvas.tsx')
  const grabMapsPoiPath = path.resolve(process.cwd(), 'src', 'features', 'geospatial', 'grabMapsPoiRichMedia.ts')
  const storyboardWidgetText = readUtf8(storyboardWidgetPath)
  const grabMapsPoiText = readUtf8(grabMapsPoiPath)

  if (storyboardWidgetText.includes('entry.nodeTypeId !== FLOW_RICH_MEDIA_PANEL_NODE_TYPE_ID')) {
    throw new Error('Expected Rich Media Panel drops to reuse the shared pending widget-open path')
  }
  if (storyboardWidgetText.includes("String(nodeById.get(s)?.type || '') === FLOW_RICH_MEDIA_PANEL_NODE_TYPE_ID")) {
    throw new Error('Expected Rich Media Panel nodes to stay eligible for shared geospatial widget overlay visibility')
  }
  if (!grabMapsPoiText.includes("from '@/lib/render/richMediaSsot'") || !grabMapsPoiText.includes('resolvePreferredRichMediaPanelNodeId')) {
    throw new Error('Expected GrabMaps POI rich media picker to reuse the shared preferred Rich Media panel resolver')
  }
  if (grabMapsPoiText.includes('const pickFromIds =')) {
    throw new Error('Expected GrabMaps POI rich media picker to remove its local preferred Rich Media panel resolver logic')
  }
}

export const testGeospatialHostPublishesCursorLngLatForWidgetDropPlacement = () => {
  const hostPath = path.resolve(process.cwd(), '..', 'gympgrph', 'src', 'GeospatialHost.tsx')
  const slicePath = path.resolve(process.cwd(), '..', 'gympgrph', 'src', 'hooks', 'store', 'geospatialSlice.ts')
  const storyboardWidgetPath = path.resolve(process.cwd(), 'src', 'components', 'StoryboardWidgetCanvas.tsx')
  const hostText = readUtf8(hostPath)
  const sliceText = readUtf8(slicePath)
  const storyboardWidgetText = readUtf8(storyboardWidgetPath)
  if (!hostText.includes("map.on?.('mousemove'")) {
    throw new Error('Expected GeospatialHost to track cursor lng/lat from map mousemove events')
  }
  if (!hostText.includes("document.addEventListener('dragover'")) {
    throw new Error('Expected GeospatialHost to track cursor lng/lat during HTML dragover for geospatial widget drops')
  }
  if (!hostText.includes('immediate: true')) {
    throw new Error('Expected GeospatialHost to publish final drop lng/lat synchronously during drop events')
  }
  if (!sliceText.includes('setGeospatialCursorLngLat')) {
    throw new Error('Expected geospatial store to expose setGeospatialCursorLngLat SSOT action')
  }
  if (!storyboardWidgetText.includes('syncGrabMapsDiscoveryGeoFromDropCursor')) {
    throw new Error('Expected StoryboardWidget bridge drop path to perform a short post-drop geo sync for GrabMaps discovery widgets')
  }
  if (!storyboardWidgetText.includes('readGeospatialCursorLngLat()')) {
    throw new Error('Expected StoryboardWidget drop path to reuse geospatial cursor lng/lat for widget placement')
  }
}

export const testGympgrphGeospatialKeysAreNamespacedOnly = () => {
  const configPath = path.resolve(process.cwd(), '..', 'gympgrph', 'src', 'lib', 'config.ts')
  const text = readUtf8(configPath)
  if (text.includes("'ui:geospatial:") || text.includes('"ui:geospatial:')) {
    throw new Error('Legacy ui:geospatial keys must not exist (collision risk)')
  }
  if (text.includes('LS_KEYS_LEGACY')) throw new Error('Legacy key map must not exist (collision risk)')
  if (!text.includes('kg:ui:geospatial:') && !text.includes('grph-shared/geospatial/constants')) {
    throw new Error('Expected namespaced kg:ui:geospatial keys (direct) or shared GEOSPATIAL_LS_KEYS import')
  }
  if (!(text.includes('geospatialViewMode') || text.includes('GEOSPATIAL_LS_KEYS'))) {
    throw new Error('Expected persisted geospatialViewMode key to exist via direct key or shared key map alias')
  }
}

export const testGympgrphDefaultViewModeIs2d = () => {
  const slicePath = path.resolve(process.cwd(), '..', 'gympgrph', 'src', 'hooks', 'store', 'geospatialSlice.ts')
  const stylePath = path.resolve(process.cwd(), '..', 'gympgrph', 'src', 'features', 'geospatial', 'basemapStyle.ts')
  const text = readUtf8(slicePath)
  const styleText = readUtf8(stylePath)
  if (!text.includes('LS_KEYS.geospatialViewMode')) {
    throw new Error('Expected geospatialViewMode persistence key usage')
  }
  if (!text.includes('DEFAULT_GEOSPATIAL_VIEW_MODE') || !text.includes('normalizeGeospatialViewMode')) {
    throw new Error('Expected geospatialViewMode default and normalization to reuse the shared geospatial basemap-style SSOT')
  }
  if (!styleText.includes("mode === '2d'") || !styleText.includes("? '2d'")) {
    throw new Error('Expected geospatial view-mode normalization to preserve 2D MapLibre Classic instead of collapsing it to the default')
  }
}

export const testGeospatialOverlayHostSupportsMapLibreGlobeRenderer = () => {
  const hostPath = path.resolve(process.cwd(), '..', 'gympgrph', 'src', 'GeospatialHost.tsx')
  const text = readUtf8(hostPath)
  if (!text.includes('useMapLibreBasemap')) throw new Error('Expected GeospatialOverlayHost to use MapLibre basemap hook')
  if (!text.includes('basemap3d')) throw new Error('Expected GeospatialOverlayHost to create dedicated 3D basemap instance')
  if (!text.includes("projectionMode: 'globe'")) throw new Error('Expected GeospatialOverlayHost 3D view to use MapLibre globe projection')
  if (!text.includes('resolveEffectiveGeospatialStyleUrl') || !text.includes('normalizeGeospatialViewMode')) {
    throw new Error('Expected GeospatialOverlayHost 3D mode to route default style resolution through the shared geospatial basemap-style SSOT')
  }
  if (!text.includes('geospatialViewMode')) throw new Error('Expected host to read geospatialViewMode')
}

export const testGeospatialOverlayHostProvidesSvgFallbackBasemapAndDisablesDefaultMapLibreRuntime = () => {
  const hostPath = path.resolve(process.cwd(), '..', 'gympgrph', 'src', 'GeospatialHost.tsx')
  const text = readUtf8(hostPath)
  if (!text.includes('function SvgGeospatialFallback')) {
    throw new Error('Expected GeospatialOverlayHost to provide a built-in SVG fallback basemap surface')
  }
  if (!text.includes('const show2dSvgFallback = active && geospatialViewMode === \'2d-svg\'')) {
    throw new Error('Expected GeospatialOverlayHost to expose a dedicated 2D SVG fallback mode')
  }
  if (!text.includes('const show3dModern = active && geospatialViewMode === \'3d-modern\'')) {
    throw new Error('Expected GeospatialOverlayHost to expose a dedicated 3D MapLibre Modern mode')
  }
  if (!text.includes('const show2dMapLibreModern = active && geospatialViewMode === \'2d-modern\'')) {
    throw new Error('Expected GeospatialOverlayHost to expose a dedicated 2D MapLibre Modern mode')
  }
  if (!text.includes('const mapLibreRuntimeEnabled = !sharedXrStage && (show2dMapLibre || show3d)')) {
    throw new Error('Expected GeospatialOverlayHost runtime to enable MapLibre only for explicit 2D/3D MapLibre modes')
  }
  if (!text.includes('<SvgGeospatialFallback')) {
    throw new Error('Expected GeospatialOverlayHost to render the SVG fallback basemap')
  }
}

export const testGeoXrUsesSharedXrStageWithoutScreenSpaceBasemap = () => {
  const viewportPath = path.resolve(process.cwd(), 'src', 'components', 'CanvasViewportGeospatialOverlay.tsx')
  const hostPath = path.resolve(process.cwd(), '..', 'gympgrph', 'src', 'GeospatialHost.tsx')
  const xrStagePath = path.resolve(process.cwd(), 'src', 'features', 'three', 'XrCanonicalPhysicsStage.tsx')
  const presentationPath = path.resolve(process.cwd(), 'src', 'features', 'three', 'xrGeoEnvironmentPresentation.ts')
  const viewportText = readUtf8(viewportPath)
  const hostText = readUtf8(hostPath)
  const xrStageText = readUtf8(xrStagePath)
  const presentationText = readUtf8(presentationPath)
  if (!viewportText.includes("renderPolicy={composedWithXr ? 'shared-xr-stage' : 'default'}")) {
    throw new Error('Expected Geo+XR composition to delegate rendering to the shared XR stage')
  }
  if (!hostText.includes("const sharedXrStage = props.renderPolicy === 'shared-xr-stage'")) {
    throw new Error('Expected GeospatialOverlayHost to recognize shared XR stage ownership')
  }
  if (!hostText.includes('const mapLibreRuntimeEnabled = !sharedXrStage && (show2dMapLibre || show3d)')) {
    throw new Error('Expected shared-stage Geo+XR to keep MapLibre style and tile requests disabled')
  }
  if (!hostText.includes('{sharedXrStage ? null : (')
    || hostText.includes('data-kg-geospatial-local-basemap')) {
    throw new Error('Expected Geo+XR to suppress the screen-space world SVG instead of restyling it')
  }
  if (!hostText.includes("data-kg-geospatial-projection-owner={sharedXrStage ? 'shared-r3f-stage' : undefined}")
    || !hostText.includes('data-kg-geospatial-xr-stage-view={sharedXrStage ? geospatialViewMode : undefined}')) {
    throw new Error('Expected the Geo host to expose shared-stage browser proof markers')
  }
  if (!xrStageText.includes('environmentVisible')
    || !xrStageText.includes('environmentPresentation={environmentPresentation}')
    || !xrStageText.includes('geospatialComposite ? null : <XrNativeControllerDemoSceneAtmosphere')) {
    throw new Error('Expected Geo+XR to retain one selected environment while suppressing only XR atmosphere')
  }
  for (const presentation of ['2d-classic', '2d-modern', '3d-classic', '3d-modern']) {
    if (!presentationText.includes(`'${presentation}'`)) {
      throw new Error(`Expected the shared environment resolver to include ${presentation}`)
    }
  }
}

export const testGeospatialOverlayHostDoesNotOverlaySvgFallbackOnHealthyMapLibreBasemap = () => {
  const hostPath = path.resolve(process.cwd(), '..', 'gympgrph', 'src', 'GeospatialHost.tsx')
  const text = readUtf8(hostPath)
  if (!text.includes('const hasRenderableMapLibreBasemap = !!activeBasemap.map && !activeBasemap.basemapUnavailable && activeBasemap.probe.tilesLoaded')) {
    throw new Error('Expected GeospatialOverlayHost SVG overlay gating to trust confirmed renderable MapLibre tiles')
  }
  if (!text.includes('|| (!hasRenderableMapLibreBasemap && !!String(activeBasemap.mapError || \'\').trim())')) {
    throw new Error('Expected GeospatialOverlayHost SVG overlay gating to treat map errors as hard failures only before renderable tiles are confirmed')
  }
  if (!text.includes('if (!hasHardMapUnavailable) return false')) {
    throw new Error('Expected GeospatialOverlayHost to avoid SVG overlay on healthy MapLibre basemaps')
  }
  if (!text.includes('return !activeBasemap.map || activeBasemap.basemapUnavailable || !activeBasemap.probe.tilesLoaded')) {
    throw new Error('Expected GeospatialOverlayHost to avoid full-screen error overlays on renderable MapLibre basemaps')
  }
  if (text.includes('featureCount < 1')) {
    throw new Error('Expected GeospatialOverlayHost SVG fallback basemap to render when MapLibre is unavailable even before geospatial features exist')
  }
}

export const testGeospatialOverlayHostOverlaysSvgFallbackWhenMapLibreMountsBlank = () => {
  const hostPath = path.resolve(process.cwd(), '..', 'gympgrph', 'src', 'GeospatialHost.tsx')
  const hookPath = path.resolve(process.cwd(), '..', 'gympgrph', 'src', 'features', 'geospatial', 'useMapLibreBasemap.ts')
  const hostText = readUtf8(hostPath)
  const hookText = readUtf8(hookPath)
  if (!hookText.includes('basemapUnavailable: boolean')) {
    throw new Error('Expected MapLibre basemap hook to expose blank-mounted basemap availability state')
  }
  if (!hookText.includes('scheduleBasemapVisibilityProbe')) {
    throw new Error('Expected MapLibre basemap hook to probe tile visibility after mount/style load')
  }
  if (!hookText.includes('basemapRenderableConfirmationCount >= 2')) {
    throw new Error('Expected MapLibre basemap hook to require stable tile readiness before suppressing the fallback basemap')
  }
  if (!hookText.includes('switchBlankBasemapToSafeStyle')) {
    throw new Error('Expected MapLibre basemap hook to try the shared safe style before declaring a mounted basemap unavailable')
  }
  if (!hookText.includes("map.on?.('sourcedata'")) {
    throw new Error('Expected MapLibre basemap hook to listen for source tile activity before declaring mounted basemaps blank')
  }
  if (!hookText.includes("await import('maplibre-gl/dist/maplibre-gl.js')")) {
    throw new Error('Expected MapLibre basemap hook to load the browser dist build so vector-tile workers are available')
  }
  if (hookText.includes("await import('maplibre-gl')")) {
    throw new Error('Expected MapLibre basemap hook to avoid the source entrypoint with an empty default worker URL')
  }
  if (!hookText.includes('BASEMAP_SOURCE_ACTIVITY_GRACE_MS')) {
    throw new Error('Expected MapLibre basemap hook to keep active tile sources out of premature blank fallback')
  }
  if (!hookText.includes('sourceId.startsWith(HOST_GRAPH_SOURCE_PREFIX)')) {
    throw new Error('Expected MapLibre basemap hook to ignore host graph overlay sources in basemap tile readiness')
  }
  if (!hookText.includes('basemapRenderable: basemapSourceRenderable')) {
    throw new Error('Expected MapLibre basemap probe to treat renderable basemap source activity as tile readiness')
  }
  if (!hookText.includes('prev.basemapUnavailable || prev.mapError')) {
    throw new Error('Expected renderable MapLibre basemap probes to clear stale non-fatal map errors')
  }
  if (!hookText.includes('markBasemapSourceActivity(hasTilePayload)') || hookText.includes("sourceDataType === 'content'") || hookText.includes('e?.isSourceLoaded === true')) {
    throw new Error('Expected MapLibre basemap hook to treat actual tile payloads, not TileJSON/source metadata, as renderable basemap readiness')
  }
  if (!hookText.includes('if (!requestedGrabMapsStyle) return false')) {
    throw new Error('Expected blank-style fallback switching to stay scoped to GrabMaps, not active OpenFreeMap tile stacks')
  }
  if (!hostText.includes('activeBasemap.basemapUnavailable')) {
    throw new Error('Expected GeospatialHost SVG fallback overlay to cover MapLibre instances that mounted without renderable basemap tiles')
  }
}

export const testGeospatialOverlayHostSvgFallbackRendersHighFidelitySvgBasemap = () => {
  const hostPath = path.resolve(process.cwd(), '..', 'gympgrph', 'src', 'GeospatialHost.tsx')
  const terrainPath = path.resolve(process.cwd(), '..', 'gympgrph', 'src', 'features', 'geospatial', 'worldSvgBasemap.ts')
  const text = readUtf8(hostPath)
  const terrainText = readUtf8(terrainPath)
  if (!text.includes("from './features/geospatial/worldSvgBasemap.js'")) {
    throw new Error('Expected GeospatialOverlayHost SVG fallback to import the generated inline terrain module')
  }
  if (!terrainText.includes('Generated from ./assets/simple-world-map-edit.svg')) {
    throw new Error('Expected inline terrain module to derive from the vendored high-fidelity SVG basemap asset')
  }
  if (!text.includes('HIGH_FIDELITY_WORLD_SVG_INNER')) {
    throw new Error('Expected GeospatialOverlayHost SVG fallback to render sanitized inline terrain paths')
  }
  if (!text.includes('dangerouslySetInnerHTML={{ __html: HIGH_FIDELITY_WORLD_SVG_INNER }}')) {
    throw new Error('Expected GeospatialOverlayHost SVG fallback to place inline terrain inside the fallback surface')
  }
  if (!text.includes('.kg-geo-fallback-terrain .st0') || !text.includes('.kg-geo-fallback-terrain .st1')) {
    throw new Error('Expected GeospatialOverlayHost SVG fallback terrain to carry scoped SVG land styling')
  }
  if (!terrainText.includes('<path class="st0"') || !terrainText.includes('<path class="st1"')) {
    throw new Error('Expected inline terrain module to preserve high-fidelity land path geometry')
  }
  if (text.includes('HIGH_FIDELITY_WORLD_SVG_URL') || text.includes('<image') || text.includes('?raw')) {
    throw new Error('Expected GeospatialOverlayHost SVG fallback to avoid nested external SVG images for terrain')
  }
}

export const testGeospatialOverlayHostSvgFallbackAppliesMaplikeVisualPolish = () => {
  const hostPath = path.resolve(process.cwd(), '..', 'gympgrph', 'src', 'GeospatialHost.tsx')
  const text = readUtf8(hostPath)
  const requiredSnippets = [
    'SVG_FALLBACK_STYLE = {',
    'kg-geo-fallback-ocean-sheen',
    'kg-geo-fallback-land-wash',
    'kg-geo-fallback-frame-stroke',
    'kg-geo-fallback-map-filter',
    'kg-geo-fallback-sphere-shadow',
    'kg-geo-fallback-point-shadow',
    'graticuleMinorStep',
    'graticuleMajorStep',
    'minorGraticulePath',
    'majorGraticulePath',
    'rgba(37,99,235,0.92)',
    'rgba(249,115,22,0.98)',
  ]
  const missing = requiredSnippets.filter(snippet => !text.includes(snippet))
  if (missing.length) {
    throw new Error(`Expected GeospatialOverlayHost SVG fallback to include refined MapLibre-like styling: ${missing.join(', ')}`)
  }
}

export const testGeospatialOverlayHostAvoidsClusteredGeoJsonOnGlobeRenderer = () => {
  const hostPath = path.resolve(process.cwd(), '..', 'gympgrph', 'src', 'GeospatialHost.tsx')
  const text = readUtf8(hostPath)
  if (!text.includes("viewMode === 'map2d' && isPointOnlyFeatureCollection")) {
    throw new Error('Expected GeospatialOverlayHost to restrict GeoJSON clustering to 2D MapLibre mode')
  }
}

export const testGeospatialOverlayHostProjectsGraphGeoJsonIn3dWithoutClustering = () => {
  const hostPath = path.resolve(process.cwd(), '..', 'gympgrph', 'src', 'GeospatialHost.tsx')
  const text = readUtf8(hostPath)
  if (text.includes("if (viewMode === 'map3d')")) {
    throw new Error('Expected GeospatialOverlayHost to keep graph GeoJSON projection active in 3D mode')
  }
  if (!text.includes("const cluster = viewMode === 'map2d' && isPointOnlyFeatureCollection")) {
    throw new Error('Expected GeospatialOverlayHost to restrict clustering to 2D while still rendering 3D graph points')
  }
}

export const testGeospatialOverlayHostProjectsSnapshotGraphDataToMapLayer = () => {
  const hostPath = path.resolve(process.cwd(), '..', 'gympgrph', 'src', 'GeospatialHost.tsx')
  const text = readUtf8(hostPath)
  if (!text.includes('getSnapshotGraphData')) {
    throw new Error('Expected host to read snapshot.graphData')
  }
  if (!text.includes('buildFeatureCollectionFromGraphData')) {
    throw new Error('Expected host to project graph nodes into FeatureCollection')
  }
  if (!text.includes("['geo']") || !text.includes("['lat']") || !text.includes("['lng']")) {
    throw new Error('Expected host graph projection to read node.properties.geo.lat/lng')
  }
  if (!text.includes('ensureDatasetLayer') || !text.includes('setGeoJsonSourceData')) {
    throw new Error('Expected host to publish projected graph features into MapLibre source/layer')
  }
}

export const testGeospatialPoiClicksRenderIntoRichMediaPanelInsteadOfMapLibrePopup = () => {
  const viewportPath = path.resolve(process.cwd(), 'src', 'components', 'CanvasViewportGeospatialOverlay.tsx')
  const basemapPath = path.resolve(process.cwd(), '..', 'gympgrph', 'src', 'features', 'geospatial', 'useMapLibreBasemap.ts')
  const viewportText = readUtf8(viewportPath)
  const basemapText = readUtf8(basemapPath)
  const richMediaPanelText = [
    readUtf8(path.resolve(process.cwd(), 'src', 'components', 'useRichMediaPanelMediaState.ts')),
    readUtf8(path.resolve(process.cwd(), 'src', 'features', 'geospatial', 'grabMapsPoiRichMedia.ts')),
  ].join('\n')
  if (!viewportText.includes('renderPoiInRichMediaPanel')) {
    throw new Error('Expected CanvasViewport to expose a shared geospatial POI -> Rich Media Panel handoff')
  }
  if (!viewportText.includes('buildGrabMapsPoiRichMediaSrcDoc(normalizedDetail)')) {
    throw new Error('Expected CanvasViewport to write GrabMaps POI output into Rich Media Panel srcdoc content')
  }
  if (!viewportText.includes('publishGrabMapsPoiRichMediaPreview({')) {
    throw new Error('Expected CanvasViewport to publish GrabMaps POI preview payloads for visible Rich Media panels')
  }
  if (!viewportText.includes('resolveGrabMapsPoiRichMediaPanelNodeId')) {
    throw new Error('Expected CanvasViewport to resolve the canonical Rich Media Panel node before writing POI output')
  }
  if (!basemapText.includes('onPoiClick?.({')) {
    throw new Error('Expected MapLibre basemap click handling to emit structured POI details upstream')
  }
  if (basemapText.includes('new PopupConstructor') || basemapText.includes('.setText(label).addTo(map)')) {
    throw new Error('Expected MapLibre basemap POI clicks to avoid mutating popup DOM and instead defer to Rich Media Panel SSOT')
  }
  if (!richMediaPanelText.includes('subscribeGrabMapsPoiRichMediaPreview')) {
    throw new Error('Expected RichMediaPanel to subscribe via the shared GrabMaps POI preview helper')
  }
  if (readUtf8(path.resolve(process.cwd(), 'src', 'components', 'useRichMediaPanelMediaState.ts')).includes('addEventListener(GRABMAPS_POI_RICH_MEDIA_PREVIEW_EVENT')) {
    throw new Error('Expected RichMediaPanel to avoid raw GrabMaps POI preview listener wiring')
  }
  if (!richMediaPanelText.includes('const effectiveInlineSrcDoc = inlineSrcDoc || grabMapsPoiPreviewSrcDoc')) {
    throw new Error('Expected empty RichMediaPanel surfaces to reuse the latest GrabMaps POI preview srcdoc')
  }
}

export const testGeospatialOverlayHostClearsStaleDataAndSeparatesClusterSources = () => {
  const hostPath = path.resolve(process.cwd(), '..', 'gympgrph', 'src', 'GeospatialHost.tsx')
  const text = readUtf8(hostPath)
  if (!text.includes('clearGeoJsonSourceData')) {
    throw new Error('Expected host to clear stale GeoJSON source data during rapid graph switches')
  }
  if (!text.includes('graphSourceIdClustered') || !text.includes('graphSourceIdUnclustered')) {
    throw new Error('Expected host to separate clustered and unclustered source IDs to avoid stale layer/source mode mismatch')
  }
  if (!text.includes('featureCount <= 0') || !text.includes("graphDataAppliedRef.current[viewMode] = ''")) {
    throw new Error('Expected host to reset source state when active graph has no geospatial features')
  }
}

export const testSourceFilesPersistenceUsesContentHashNotLengthOnly = () => {
  const persistencePath = path.resolve(process.cwd(), 'src', 'features', 'source-files', 'SourceFilesPersistenceBootstrap.tsx')
  const signaturesPath = path.resolve(process.cwd(), 'src', 'features', 'source-files', 'sourceFilesSignatures.ts')
  const text = readUtf8(persistencePath)
  const signaturesText = readUtf8(signaturesPath)
  if (!text.includes("from '@/features/source-files/sourceFilesSignatures'")) {
    throw new Error('Expected source-files persistence bootstrap to reuse the shared source-files signature helper module')
  }
  if (!text.includes('areSourceFilesEqualByIdAndHash') || !text.includes('buildSourceFilesPersistenceSignature')) {
    throw new Error('Expected source-files persistence bootstrap to reuse shared persistence equality and signature helpers')
  }
  if (!signaturesText.includes('hashStringToHexCached(cacheKey, text)')) {
    throw new Error('Expected shared source-files persistence hashing to hash canonical text content through the bounded text-hash cache')
  }
  if (text.includes("String(x?.text || '').length !== String(y?.text || '').length")) {
    throw new Error('Source-files persistence must not compare by text length only')
  }
  if (signaturesText.includes("String(x?.text || '').length !== String(y?.text || '').length")) {
    throw new Error('Shared source-files persistence helpers must not compare by text length only')
  }
}

export const testSourceFilesDbUsesPersistedCollectionStoreForRuntimeQueries = () => {
  const dbPath = path.resolve(process.cwd(), 'src', 'features', 'source-files', 'sourceFilesDb.ts')
  const text = readUtf8(dbPath)
  if (!text.includes('createPersistedCollectionDb')) {
    throw new Error('Expected source-files persistence DB to use the shared persisted collection store for runtime find/sort queries')
  }
  if (!text.includes("collections.sourceFiles.find().sort({ orderIndex: 'asc' }).exec()")) {
    throw new Error('Expected source-files persistence DB to keep the shared persisted-store query/sort path for runtime source-file reads')
  }
}

export const testGeospatialPanelHostIsNotEmpty = () => {
  const hostPath = path.resolve(process.cwd(), '..', 'gympgrph', 'src', 'GeospatialPanelHost.tsx')
  const text = readUtf8(hostPath)
  if (!text.includes("from 'grph-shared/ui/keyTypeValueRows'")) throw new Error('Expected GeospatialPanelHost to reuse the shared KTV row class contract')
  if (!text.includes('coercePanelTypography')) throw new Error('Expected GeospatialPanelHost to derive KTV typography from the shared panel typography contract')
  if (!text.includes('GeoPanelKtvRow')) throw new Error('Expected GeospatialPanelHost to render geospatial controls as KTV rows')
  if (!text.includes('KTV_KEY_TYPE_VALUE_GRID_CLASS_NAME')) throw new Error('Expected GeospatialPanelHost KTV rows to share the MainPanel key/type/value grid')
  if (!text.includes('keyNode="Key"') || !text.includes('typeNode="Type"') || !text.includes('valueNode="Value"')) throw new Error('Expected GeospatialPanelHost to render the KTV header')
  if (!text.includes('renderTypeIcon?: (args: { typeLabel: string }) => React.ReactNode')) throw new Error('Expected GeospatialPanelHost to accept an upstream KTV Type icon renderer')
  if (!text.includes('GeoPanelTypeIconRenderContext') || !text.includes('renderTypeIcon({ typeLabel })')) throw new Error('Expected GeospatialPanelHost Type cells to render icons through the upstream MainPanel icon renderer')
  if (text.includes("from 'lucide-react'")) throw new Error('Expected GeospatialPanelHost to avoid local icon imports and reuse the MainPanel Help icon library renderer')
  if (!text.includes('GeoPanelSection title="Basemap"') || !text.includes('keyNode="Style URL"')) throw new Error('Expected GeospatialPanelHost to render basemap style controls')
  if (!text.includes('Fit to data')) throw new Error('Expected GeospatialPanelHost to render fit controls')
  if (!text.includes('Use current location')) throw new Error('Expected GeospatialPanelHost to render current-location control')
  if (!text.includes('2D (MapLibre, Classic)')) throw new Error('Expected GeospatialPanelHost to expose explicit 2D MapLibre Classic selection')
  if (!text.includes('2D (MapLibre, Modern)')) throw new Error('Expected GeospatialPanelHost to expose explicit 2D MapLibre Modern selection')
  if (!text.includes('3D (MapLibre, Classic)')) throw new Error('Expected GeospatialPanelHost to expose explicit 3D MapLibre Classic selection')
  if (!text.includes('3D (MapLibre, Modern)')) throw new Error('Expected GeospatialPanelHost to expose explicit 3D MapLibre Modern selection')
  if (!text.includes('2D (SVG, fallback)')) throw new Error('Expected GeospatialPanelHost to expose explicit 2D SVG fallback selection')
  if (!text.includes('Apply Point Style')) throw new Error('Expected GeospatialPanelHost to expose point style apply control')
  if (!text.includes('Reset Point Style')) throw new Error('Expected GeospatialPanelHost to expose point style reset control')
  if (text.includes('GeoViewModeChoice') || text.includes('geospatialPanelCardClassName') || text.includes('grid grid-cols-1 gap-2 sm:grid-cols-6')) {
    throw new Error('Expected GeospatialPanelHost to avoid stale card/grid geospatial panel layout paths')
  }
}

export const testGeospatialHostSupportsCurrentLocationViewportRequests = () => {
  const fitPath = path.resolve(process.cwd(), '..', 'gympgrph', 'src', 'geospatialFit.ts')
  const slicePath = path.resolve(process.cwd(), '..', 'gympgrph', 'src', 'hooks', 'store', 'geospatialSlice.ts')
  const hostPath = path.resolve(process.cwd(), '..', 'gympgrph', 'src', 'GeospatialHost.tsx')
  const fitText = readUtf8(fitPath)
  const sliceText = readUtf8(slicePath)
  const hostText = readUtf8(hostPath)
  if (!fitText.includes('requestGeospatialCurrentLocation')) {
    throw new Error('Expected gympgrph fit helpers to expose current-location requests')
  }
  if (!sliceText.includes("mode: 'currentLocation'")) {
    throw new Error('Expected gympgrph geospatial slice to support currentLocation fit requests')
  }
  if (!hostText.includes("if (geospatialFitRequest.mode === 'currentLocation')")) {
    throw new Error('Expected GeospatialHost to handle currentLocation viewport requests')
  }
}

export const testGympgrphDefaultInteractionModeIsAlways = () => {
  const slicePath = path.resolve(process.cwd(), '..', 'gympgrph', 'src', 'hooks', 'store', 'geospatialSlice.ts')
  const text = readUtf8(slicePath)
  if (!text.includes("LS_KEYS.geospatialInteractionMode")) throw new Error('Expected geospatialInteractionMode persistence key usage')
  if (!text.includes("'always'")) throw new Error('Expected default interaction mode to include always')
}

export const testHoldSpaceKeyHandlingPreventsScrollAndIgnoresInputs = () => {
  const heldKeyPath = path.resolve(process.cwd(), '..', 'gympgrph', 'src', 'features', 'geospatial', 'useHeldKey.ts')
  const text = readUtf8(heldKeyPath)
  if (!text.includes('preventDefault')) throw new Error('Expected Space hold to preventDefault to avoid page scroll')
  if (!(text.includes('closest(') || text.includes('closest?.('))) {
    throw new Error('Expected hold-space logic to ignore input/textarea/select/contenteditable')
  }
}

export const testHostEnableForcesAlwaysInteractionMode = () => {
  const hostBridgePath = path.resolve(process.cwd(), '..', 'gympgrph', 'src', 'hostBridge.ts')
  const text = readUtf8(hostBridgePath)
  if (!text.includes("s.setGeospatialInteractionMode('always')")) {
    throw new Error('Expected enabling Geospatial Mode to force interactionMode=always for immediate navigation')
  }
}

export const testHostEnableDoesNotForce2dViewMode = () => {
  const hostBridgePath = path.resolve(process.cwd(), '..', 'gympgrph', 'src', 'hostBridge.ts')
  const text = readUtf8(hostBridgePath)
  if (text.includes("s.setGeospatialViewMode('2d')")) {
    throw new Error('Geospatial host enable must not hard-reset view mode to 2d')
  }
}

export const testHostTailwindScansGympgrphClasses = () => {
  const tailwindConfigPath = path.resolve(process.cwd(), 'tailwind.config.js')
  const text = readUtf8(tailwindConfigPath)
  if (!text.includes('../gympgrph/src/**/*.{js,ts,jsx,tsx}')) {
    throw new Error('Expected knowgrph host Tailwind config to scan gympgrph sources for class generation')
  }
}

export const testGeospatialModeEventContractIsShared = () => {
  const hostEventsPath = path.resolve(process.cwd(), 'src', 'features', 'geospatial', 'events.ts')
  const hostEventsText = readUtf8(hostEventsPath)
  if (!hostEventsText.includes("from 'grph-shared/geospatial/events'")) {
    throw new Error('Expected host geospatial events to re-export from grph-shared/geospatial/events')
  }
  if (hostEventsText.includes('export type GeospatialModeChangedDetail')) {
    throw new Error('Host must not redefine GeospatialModeChangedDetail (cross-repo drift risk)')
  }

  const canvasPath = path.resolve(process.cwd(), 'src', 'pages', 'Canvas.tsx')
  const canvasText = readUtf8(canvasPath)
  const canvasRuntimePath = path.resolve(process.cwd(), 'src', 'features', 'canvas', 'useCanvasGeospatialRuntime.ts')
  const canvasRuntimeText = readUtf8(canvasRuntimePath)
  if (!(canvasText.includes('useCanvasGeospatialRuntime') && canvasRuntimeText.includes('onGeospatialModeChanged'))) {
    throw new Error('Expected Canvas to subscribe via shared geospatial runtime or the onGeospatialModeChanged helper')
  }
  if (canvasText.includes('addEventListener(GEOSPATIAL_MODE_CHANGED_EVENT')) {
    throw new Error('Canvas must not attach raw GEOSPATIAL_MODE_CHANGED_EVENT listener (use helper)')
  }

  const toolbarPath = path.resolve(process.cwd(), 'src', 'components', 'Toolbar.tsx')
  const toolbarText = readUtf8(toolbarPath)
  const toolbarContextPath = path.resolve(process.cwd(), 'src', 'components', 'toolbar', 'useCanvasToolbarContext.ts')
  const toolbarContextText = readUtf8(toolbarContextPath)
  if (!(toolbarText.includes('onGeospatialModeChanged') || toolbarContextText.includes('onGeospatialModeChanged'))) {
    throw new Error('Expected Toolbar or delegated toolbar context to subscribe via onGeospatialModeChanged helper')
  }
  if (
    toolbarText.includes('addEventListener(GEOSPATIAL_MODE_CHANGED_EVENT') ||
    toolbarContextText.includes('addEventListener(GEOSPATIAL_MODE_CHANGED_EVENT')
  ) {
    throw new Error('Toolbar integration must not attach raw GEOSPATIAL_MODE_CHANGED_EVENT listener (use helper)')
  }

  const slicePath = path.resolve(process.cwd(), '..', 'gympgrph', 'src', 'hooks', 'store', 'geospatialSlice.ts')
  const sliceText = readUtf8(slicePath)
  if (!sliceText.includes("emitGeospatialModeChanged({")) {
    throw new Error('Expected gympgrph geospatialSlice to emit via emitGeospatialModeChanged helper')
  }
  if (sliceText.includes('new CustomEvent(UI_EVENTS.geospatialModeChanged')) {
    throw new Error('gympgrph must not emit raw UI_EVENTS.geospatialModeChanged CustomEvent (drift risk)')
  }
}

export const testFloatingPanelRequestedGeoViewEnsuresGeospatialEnabled = () => {
  const toolbarToolMenuPath = path.resolve(process.cwd(), 'src', 'lib', 'toolbar', 'ToolbarToolMenu.impl.tsx')
  const text = readUtf8(toolbarToolMenuPath)

  if (!text.includes('setFloatingPanelView(requestedFloatingPanelView)')) {
    throw new Error('Expected FloatingPanel requested-view handler to set the requested view')
  }
  if (!text.includes("requestedFloatingPanelView === 'geo'")) {
    throw new Error('Expected FloatingPanel requested-view handler to branch on geo view')
  }
  if (!text.includes('ensureGeospatialEnabled()')) {
    throw new Error('Expected FloatingPanel requested-view handler to ensure Geospatial Mode is enabled for geo view')
  }
}

export const testRemoteFetchProxyDoesNotAbortOnCloseOrTruncate = () => {
  const vitePath = path.resolve(process.cwd(), 'vite.config.ts')
  const text = readUtf8(vitePath)
  if (!text.includes('function createRemoteFetchHandler')) {
    throw new Error('Expected vite.config.ts to include createRemoteFetchHandler for /__fetch_remote')
  }
  if (text.includes("res.on('close'") || text.includes('res.on("close"')) {
    throw new Error('Remote fetch proxy must not abort upstream fetch on response close events')
  }
  if (text.includes("req.on('close'") || text.includes('req.on("close"')) {
    throw new Error('Remote fetch proxy must not abort upstream fetch on request close events')
  }
  if (!text.includes("res.setHeader('Content-Length', String(buf.byteLength))")) {
    throw new Error('Expected remote fetch proxy to set Content-Length from full buffered body')
  }
}

export const testGympgrphMapLibreBasemapSupportsGlobeProjection = () => {
  const hookPath = path.resolve(process.cwd(), '..', 'gympgrph', 'src', 'features', 'geospatial', 'useMapLibreBasemap.ts')
  const text = readUtf8(hookPath)
  if (!text.includes("projectionMode: 'mercator' | 'globe'")) throw new Error('Expected basemap hook to support mercator and globe projection modes')
  if (!text.includes("map.setProjection?.({ type: 'globe' })")) throw new Error('Expected basemap hook to set globe projection in 3D mode')
  if (!text.includes("canvasRenderMode === '3d'")) throw new Error('Expected basemap hook to apply 3D camera defaults')
}

export const testGympgrphMapLibreBasemapBlankDefaultStaysOffForSvgFallback = () => {
  const hookPath = path.resolve(process.cwd(), '..', 'gympgrph', 'src', 'features', 'geospatial', 'useMapLibreBasemap.ts')
  const text = readUtf8(hookPath)
  if (!text.includes("if (!trimmed) return MAPLIBRE_DEFAULT_STYLE_URL")) {
    throw new Error('Expected empty basemap style URL to resolve to the MapLibre default style')
  }
  if (!text.includes("if (trimmed === SAFE_SVG_FALLBACK_STYLE_SENTINEL) return null")) {
    throw new Error('Expected SVG fallback sentinel to keep MapLibre disabled in explicit SVG mode')
  }
  const helperPath = path.resolve(process.cwd(), '..', 'gympgrph', 'src', 'features', 'geospatial', 'basemapStyle.ts')
  const helperText = readUtf8(helperPath)
  if (!helperText.includes("MAPLIBRE_CLASSIC_DEFAULT_STYLE_URL = 'https://demotiles.maplibre.org/style.json'")) {
    throw new Error('Expected basemap style helper to expose a MapLibre classic default style URL')
  }
  if (!helperText.includes("MAPLIBRE_MODERN_DEFAULT_STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty'")) {
    throw new Error('Expected basemap style helper to expose a MapLibre modern default style URL')
  }
  if (!helperText.includes("SAFE_SVG_FALLBACK_STYLE_SENTINEL = 'kg:style:svg-fallback'")) {
    throw new Error('Expected basemap style helper to expose an SVG fallback sentinel')
  }
}

export const testGympgrphGeospatialStyleStorageNormalizesUnsafeRemoteStyles = () => {
  const helperPath = path.resolve(process.cwd(), '..', 'gympgrph', 'src', 'features', 'geospatial', 'basemapStyle.ts')
  const helperText = readUtf8(helperPath)
  if (!helperText.includes('normalizePersistedGeospatialStyleUrl')) {
    throw new Error('Expected a shared geospatial basemap style normalization helper')
  }
  if (!helperText.includes("if (!trimmed) return MAPLIBRE_DEFAULT_STYLE_URL")) {
    throw new Error('Expected blank persisted style URLs to normalize to the MapLibre default path')
  }
  if (!helperText.includes("if (lower.startsWith('http://') || lower.startsWith('https://')) return trimmed")) {
    throw new Error('Expected persisted remote style URLs to stay available for explicit MapLibre mode usage')
  }

  const hostPath = path.resolve(process.cwd(), '..', 'gympgrph', 'src', 'GeospatialHost.tsx')
  const hostText = readUtf8(hostPath)
  if (!hostText.includes('normalizePersistedGeospatialStyleUrl(raw)')) {
    throw new Error('Expected GeospatialHost to normalize persisted style URLs when reading runtime basemap state')
  }
  if (!hostText.includes('MAPLIBRE_MODERN_DEFAULT_STYLE_URL')) {
    throw new Error('Expected GeospatialHost to distinguish MapLibre modern built-in default styling')
  }
}

export const testGympgrphGeospatialRuntimeContainsNoRasterFallbackContract = () => {
  const helperPath = path.resolve(process.cwd(), '..', 'gympgrph', 'src', 'features', 'geospatial', 'basemapStyle.ts')
  const helperText = readUtf8(helperPath)
  const legacyRasterSentinelSnippet = ['raster', 'osm'].join('-')
  const legacyRasterConstantSnippet = ['SAFE', 'RASTER'].join('_')
  if (helperText.includes(legacyRasterSentinelSnippet) || helperText.includes(legacyRasterConstantSnippet)) {
    throw new Error('Expected geospatial basemap style helper to contain no raster fallback contract')
  }

  const hookPath = path.resolve(process.cwd(), '..', 'gympgrph', 'src', 'features', 'geospatial', 'useMapLibreBasemap.ts')
  const hookText = readUtf8(hookPath)
  const legacyRasterTileSnippet = ['tile', 'openstreetmap', 'org'].join('.')
  if (hookText.includes(legacyRasterSentinelSnippet) || hookText.includes(legacyRasterTileSnippet)) {
    throw new Error('Expected MapLibre basemap hook to contain no raster fallback path')
  }
}

export const testGympgrphMapLibreBasemapFallsBackFromUnsafeRuntimeErrors = () => {
  const hookPath = path.resolve(process.cwd(), '..', 'gympgrph', 'src', 'features', 'geospatial', 'useMapLibreBasemap.ts')
  const text = readUtf8(hookPath)
  if (!text.includes('isKnownUnsafeMapLibreRuntimeError')) {
    throw new Error('Expected basemap hook to classify known unsafe MapLibre runtime errors')
  }
  if (!text.includes("cannot access '_' before initialization")) {
    throw new Error('Expected basemap hook to classify production MapLibre TDZ runtime failures')
  }
  if (!text.includes("setRuntimeProjectionMode('mercator')")) {
    throw new Error('Expected basemap hook to fall back to mercator on known unsafe runtime errors')
  }
  if (!text.includes('fallbackUnsafeMapLibreRuntime') || !text.includes('map.setStyle?.(RESILIENT_AUTOMATIC_FALLBACK_STYLE_URL)')) {
    throw new Error('Expected basemap hook to fall back to the shared safe MapLibre style on known unsafe runtime errors')
  }
  if (!text.includes('isKnownUnsafeMapLibreRuntimeError(msg)')) {
    throw new Error('Expected basemap hook to suppress known unsafe MapLibre construction failures into the fallback surface')
  }
}

export const testGympgrphMapLibreLoggerSuppressesAbortNoise = () => {
  const hookPath = path.resolve(process.cwd(), '..', 'gympgrph', 'src', 'features', 'geospatial', 'useMapLibreBasemap.ts')
  const text = readUtf8(hookPath)
  if (!text.includes('setLogger')) throw new Error('Expected MapLibre logger override to be installed')
  if (!text.includes('/__fetch_remote')) throw new Error('Expected logger to filter /__fetch_remote abort noise')
  if (!text.toLowerCase().includes('err_aborted') && !text.toLowerCase().includes('aborterror')) {
    throw new Error('Expected logger to match aborted request errors')
  }
}

export const testGympgrphMapLibreBasemapFallsBackFromOpenFreeMapLibertyAbort = () => {
  const hookPath = path.resolve(process.cwd(), '..', 'gympgrph', 'src', 'features', 'geospatial', 'useMapLibreBasemap.ts')
  const text = readUtf8(hookPath)
  if (!text.includes('isOpenFreeMapLibertyUrl')) {
    throw new Error('Expected basemap hook to classify OpenFreeMap liberty style requests')
  }
  if (!text.includes('requestedOpenFreeMapLiberty')) {
    throw new Error('Expected basemap hook to carry OpenFreeMap liberty style state through runtime fallback paths')
  }
  if (!text.includes('openFreeMapAbort')) {
    throw new Error('Expected basemap hook to detect OpenFreeMap liberty abort-style runtime errors')
  }
  if (!text.includes('RESILIENT_AUTOMATIC_FALLBACK_STYLE_URL')) {
    throw new Error('Expected basemap hook to apply resilient style fallback when OpenFreeMap liberty aborts')
  }
}

export const testGeospatialPoiClickWiresHostActionAndRichMediaPanel = () => {
  const hookPath = path.resolve(process.cwd(), '..', 'gympgrph', 'src', 'features', 'geospatial', 'useMapLibreBasemap.ts')
  const viewportPath = path.resolve(process.cwd(), 'src', 'components', 'CanvasViewportGeospatialOverlay.tsx')
  const hostPath = path.resolve(process.cwd(), '..', 'gympgrph', 'src', 'GeospatialHost.tsx')
  const hookText = readUtf8(hookPath)
  const viewportText = readUtf8(viewportPath)
  const hostText = readUtf8(hostPath)

  if (!hookText.includes('onPoiClick?: (detail: BasemapPoiClickDetail) => void')) {
    throw new Error('Expected basemap hook contract to expose onPoiClick callback')
  }
  if (!hookText.includes('queryRenderedFeatures')) {
    throw new Error('Expected basemap hook POI picking to query rendered features on map click')
  }
  if (!hookText.includes('onPoiClick?.({')) {
    throw new Error('Expected basemap hook to forward picked POI detail to host callback')
  }
  if (!hookText.includes('address: readPoiAddressFromFeature(picked)')) {
    throw new Error('Expected basemap hook to include POI address detail in the upstream callback payload')
  }
  if (!viewportText.includes('const renderPoiInRichMediaPanel = React.useCallback')) {
    throw new Error('Expected CanvasViewport to define the shared POI -> Rich Media Panel handoff')
  }
  if (!viewportText.includes('openWidgetNodeIdsByRenderer?.storyboard')) {
    throw new Error('Expected CanvasViewport to resolve POI targets against Storyboard Widget-panel ids in geospatial mode')
  }
  if (!viewportText.includes('const srcDoc = buildGrabMapsPoiRichMediaSrcDoc(normalizedDetail)')) {
    throw new Error('Expected CanvasViewport to build a single shared POI srcdoc payload for Rich Media rendering')
  }
  if (!viewportText.includes("richMediaActiveTab: 'poi'")) {
    throw new Error('Expected CanvasViewport POI handoff to auto-switch the canonical Rich Media Panel into POI Viewer mode')
  }
  if (!viewportText.includes('richMediaPoiLabel: String(detail.label || \'\').trim() || \'POI\'')) {
    throw new Error('Expected CanvasViewport POI handoff to persist a canonical POI label for Rich Media Panel viewer selection')
  }
  if (!viewportText.includes('richMediaPoiAddress: poiAddress')) {
    throw new Error('Expected CanvasViewport POI handoff to persist resolved POI address metadata for richer Rich Media state')
  }
  if (!viewportText.includes('richMediaPoiCategory: poiCategory')) {
    throw new Error('Expected CanvasViewport POI handoff to persist resolved POI category metadata for richer Rich Media state')
  }
  if (!viewportText.includes('richMediaPoiProperties: poiProperties')) {
    throw new Error('Expected CanvasViewport POI handoff to persist normalized source properties for richer Rich Media state')
  }
  if (!viewportText.includes('richMediaPoiCoordinates:')) {
    throw new Error('Expected CanvasViewport POI handoff to persist normalized POI coordinate metadata')
  }
  if (!viewportText.includes('outputSrcDoc: srcDoc')) {
    throw new Error('Expected CanvasViewport to write the shared POI srcdoc payload into Rich Media Panel output')
  }
  if (!viewportText.includes('renderPoiInRichMediaPanel')) {
    throw new Error('Expected geospatial overlay handlers to expose Rich Media Panel POI rendering upstream')
  }
  if (!hostText.includes('typeof overlayHandlers.renderPoiInRichMediaPanel === \'function\'')) {
    throw new Error('Expected GeospatialHost to reuse the shared Rich Media Panel POI render handler when available')
  }
  if (!hostText.includes('renderPoiInRichMediaPanel?.(detail)')) {
    throw new Error('Expected GeospatialHost POI handler to invoke the shared Rich Media Panel renderer before clipboard fallback')
  }
  if (!viewportText.includes('storyboardWidgetOpenWidgetNodeIds')) {
    throw new Error('Expected CanvasViewport POI resolution to reuse Storyboard Widget ids explicitly')
  }
  if (!viewportText.includes('gympgrphBridge.addNode(buildRichMediaPanelNode')) {
    throw new Error('Expected CanvasViewport POI handoff to auto-create a Rich Media Panel when none exists')
  }
}

export const testGympgrphMapLibreLayersGuardWritesUntilStyleReady = () => {
  const layersPath = path.resolve(process.cwd(), '..', 'gympgrph', 'src', 'maplibreLayers.ts')
  const text = readUtf8(layersPath)
  if (!text.includes('isStyleReady')) {
    throw new Error('Expected maplibre layer helpers to define a style-ready guard')
  }
  if (!text.includes('if (!isStyleReady(map)) return')) {
    throw new Error('Expected maplibre layer helpers to skip source/layer writes before style load')
  }
}

export const testGeospatialHostDoesNotMemoizeGraphApplyBeforeStyleReady = () => {
  const hostPath = path.resolve(process.cwd(), '..', 'gympgrph', 'src', 'GeospatialHost.tsx')
  const layersPath = path.resolve(process.cwd(), '..', 'gympgrph', 'src', 'maplibreLayers.ts')
  const hostText = readUtf8(hostPath)
  const layersText = readUtf8(layersPath)
  if (!layersText.includes('export function isMapLibreStyleReady')) {
    throw new Error('Expected maplibre layer helpers to expose a style-ready predicate')
  }
  if (!hostText.includes('if (!isMapLibreStyleReady(basemapMap))')) {
    throw new Error('Expected GeospatialHost to skip graph apply memoization until MapLibre style is ready')
  }
  if (!hostText.includes("graphDataAppliedRef.current[viewMode] = ''")) {
    throw new Error('Expected GeospatialHost to clear apply memo when style is not ready')
  }
}

export const testMapLibreStyleReadyPredicateAllowsLoadedRenderedMaps = () => {
  const layersPath = path.resolve(process.cwd(), '..', 'gympgrph', 'src', 'maplibreLayers.ts')
  const text = readUtf8(layersPath)
  if (!text.includes("typeof map.isStyleLoaded === 'function' && map.isStyleLoaded() === true")) {
    throw new Error('Expected MapLibre style-ready predicate to only short-circuit on positive isStyleLoaded')
  }
  if (!text.includes("typeof map.loaded === 'function' && map.loaded() === true")) {
    throw new Error('Expected MapLibre style-ready predicate to accept fully loaded maps')
  }
  if (!text.includes("typeof map.areTilesLoaded === 'function' && map.areTilesLoaded() === true")) {
    throw new Error('Expected MapLibre style-ready predicate to accept tile-loaded maps with a style object')
  }
}

export const testGympgrphMapLibrePointLayersUseVisiblePaintStyling = () => {
  const layersPath = path.resolve(process.cwd(), '..', 'gympgrph', 'src', 'maplibreLayers.ts')
  const text = readUtf8(layersPath)
  const required = [
    'cluster-bubbles',
    ':routes',
    "'circle-stroke-color': '#ffffff'",
    "'circle-stroke-width': 1.5",
    'pointRadiusByZoomExpression',
    'pointColorExpression',
    "['get', 'kgCategory']",
    "['==', ['geometry-type'], 'Point']",
    "['==', ['geometry-type'], 'LineString']",
  ]
  const missing = required.filter(snippet => !text.includes(snippet))
  if (missing.length) {
    throw new Error(`Expected MapLibre point layers to use visibility-safe styling: ${missing.join(', ')}`)
  }
}

export const testGeospatialHostProjectsCategoryForPointStyling = () => {
  const hostPath = path.resolve(process.cwd(), '..', 'gympgrph', 'src', 'GeospatialHost.tsx')
  const text = readUtf8(hostPath)
  if (!text.includes('kgCategory')) {
    throw new Error('Expected GeospatialHost projection to include kgCategory property for data-driven point styling')
  }
  if (!text.includes("if (v.includes('airport')) return 'airport'")) {
    throw new Error('Expected GeospatialHost projection to classify airport category')
  }
  if (!text.includes("if (v.includes('hotel') || v.includes('hostel') || v.includes('accommodation')) return 'hotel'")) {
    throw new Error('Expected GeospatialHost projection to classify hotel category')
  }
  if (!text.includes("if (v.includes('poi') || v.includes('attraction') || v.includes('landmark')) return 'poi'")) {
    throw new Error('Expected GeospatialHost projection to classify poi category')
  }
}

export const testGeospatialHostRendersInMapLegendFromPointStyleConfig = () => {
  const hostPath = path.resolve(process.cwd(), '..', 'gympgrph', 'src', 'GeospatialHost.tsx')
  const text = readUtf8(hostPath)
  const required = [
    'function GeospatialPointLegend',
    'Legend',
    'Airport',
    'Hotel',
    'POI',
    'Route',
    'pointStyleConfig.colors.airport',
    'pointStyleConfig.colors.hotel',
    'pointStyleConfig.colors.poi',
    'pointStyleConfig.colors.route',
  ]
  const missing = required.filter(snippet => !text.includes(snippet))
  if (missing.length) {
    throw new Error(`Expected GeospatialHost to render in-map legend from point-style config: ${missing.join(', ')}`)
  }
}

export const testGeospatialHostGraphNodeClickCyclesOverlappingFeaturesWithoutHoverPanelChurn = () => {
  const hostPath = path.resolve(process.cwd(), '..', 'gympgrph', 'src', 'GeospatialHost.tsx')
  const text = readUtf8(hostPath)
  if (!text.includes('clickedGraphNodeCycleRef')) {
    throw new Error('Expected GeospatialHost to track click-cycle state for overlapping geodata point hits')
  }
  if (!text.includes('const pickFeatureForClick = (features: unknown[], point: unknown): unknown | null => {')) {
    throw new Error('Expected GeospatialHost click path to resolve a deterministic feature pick for overlapping point hits')
  }
  if (!text.includes('const first = Array.isArray(features) ? pickFeatureForClick(features, point) : null')) {
    throw new Error('Expected GeospatialHost click picking to use click-cycle feature resolution instead of first-hit only')
  }
  if (!text.includes('renderGraphNodeClickInRichMediaPanel(first)')) {
    throw new Error('Expected GeospatialHost click picking to render the selected point into Rich Media Panel')
  }
  if (text.includes("map.on('mousemove', onMove)")) {
    throw new Error('Expected GeospatialHost to avoid hover-driven Rich Media Panel writeback churn')
  }
}

export const testGeospatialHostPreservesFeaturePropertiesForRichPoiRendering = () => {
  const hostPath = path.resolve(process.cwd(), '..', 'gympgrph', 'src', 'GeospatialHost.tsx')
  const basemapPath = path.resolve(process.cwd(), '..', 'gympgrph', 'src', 'features', 'geospatial', 'useMapLibreBasemap.ts')
  const richMediaPath = path.resolve(process.cwd(), 'src', 'features', 'geospatial', 'grabMapsPoiRichMedia.ts')
  const viewportPath = path.resolve(process.cwd(), 'src', 'components', 'CanvasViewportGeospatialOverlay.tsx')
  const hostText = readUtf8(hostPath)
  const basemapText = readUtf8(basemapPath)
  const richMediaText = readUtf8(richMediaPath)
  const viewportText = readUtf8(viewportPath)

  if (!hostText.includes("from 'grph-shared/geospatial/poiRichMedia'")) {
    throw new Error('Expected GeospatialHost to reuse the shared POI rich-media normalization helper')
  }
  if (!hostText.includes('const properties = normalizeGeoPoiRichMediaProperties(propsRaw)')) {
    throw new Error('Expected GeospatialHost graph projection to preserve normalized source properties')
  }
  if (!hostText.includes('...properties,') || !hostText.includes('properties,')) {
    throw new Error('Expected GeospatialHost to carry source properties through map features and Rich Media details')
  }
  if (!hostText.includes('resolveGeoPoiAddressFromProperties(properties)') || !hostText.includes('resolveGeoPoiCategoryFromProperties(properties)')) {
    throw new Error('Expected GeospatialHost to derive address/category via shared POI heuristics')
  }
  if (!basemapText.includes('properties: readPoiPropertiesFromFeature(picked)')) {
    throw new Error('Expected basemap-native POI clicks to forward normalized feature properties upstream')
  }
  if (!basemapText.includes('!isGraphOverlayFeature(f) && readPoiLabelFromFeature(f)')) {
    throw new Error('Expected basemap-native POI picking to avoid duplicate graph-overlay Rich Media writes')
  }
  if (!richMediaText.includes('buildGeoPoiRichMediaRows') || !richMediaText.includes('buildGeoPoiRichMediaSemanticKey')) {
    throw new Error('Expected GrabMaps POI srcdoc rendering to reuse shared metadata rows and semantic keys')
  }
  if (!viewportText.includes('normalizeGeoPoiRichMediaProperties(detail.properties)')) {
    throw new Error('Expected CanvasViewport POI handoff to normalize source properties once before Rich Media writeback')
  }
}

export const testLaunchDropdownFallbackActivatesFirstImportedWorkspaceFile = () => {
  const fallbackPath = path.resolve(process.cwd(), 'src', 'features', 'toolbar', 'launchDropdownFallbacks.ts')
  const text = readUtf8(fallbackPath)
  const required = [
    'async function focusFirstImportedWorkspaceFile',
    'activateFirstImportedWorkspaceFile',
    'await focusFirstImportedWorkspaceFile({ fs, createdPaths: res.createdPaths, applyToGraph })',
  ]
  const missing = required.filter(snippet => !text.includes(snippet))
  if (missing.length) {
    throw new Error(`Expected launch dropdown fallback import to activate first imported workspace file: ${missing.join(', ')}`)
  }

  const importActionsPath = path.resolve(process.cwd(), 'src', 'features', 'markdown-workspace', 'useWorkspaceFileActions', 'importRuntimeActions.ts')
  const importActionsText = readUtf8(importActionsPath)
  const sharedRequired = [
    'export async function activateFirstImportedWorkspaceFile',
    'useMarkdownExplorerStore.getState().setActivePath',
    'await state.setActiveMarkdownDocument({',
  ]
  const missingShared = sharedRequired.filter(snippet => !importActionsText.includes(snippet))
  if (missingShared.length) {
    throw new Error(`Expected shared import action helper to activate first imported workspace file: ${missingShared.join(', ')}`)
  }
}

export const testLaunchDropdownFilePickerClosesAfterSelectionNotBefore = () => {
  const dropdownPath = path.resolve(process.cwd(), 'src', 'lib', 'toolbar', 'LaunchDropdown.impl.tsx')
  const text = readUtf8(dropdownPath)
  if (!text.includes('runLaunchImportLocalFiles({') || !text.includes('fallback: importLocalFilesFallback') || !text.includes('onClose()')) {
    throw new Error('Expected local file picker flow to dispatch import and close dropdown after file selection is handled')
  }
  if (text.includes('openFilePicker(fileInputRef.current)\n                onClose()')) {
    throw new Error('Expected local file picker button to avoid closing dropdown before native file selection returns')
  }
  if (text.includes('openFilePicker(folderInputRef.current)\n                onClose()')) {
    throw new Error('Expected local folder picker button to avoid closing dropdown before native folder selection returns')
  }
}

export const testGympgrphBasemapResetsStyleRevisionBeforeRemount = () => {
  const hookPath = path.resolve(process.cwd(), '..', 'gympgrph', 'src', 'features', 'geospatial', 'useMapLibreBasemap.ts')
  const text = readUtf8(hookPath)
  if (!text.includes('Reset style revision before mounting/re-mounting')) {
    throw new Error('Expected basemap hook to reset style revision before remount')
  }
  if (!text.includes('styleRevision: 0')) {
    throw new Error('Expected basemap hook remount reset to clear styleRevision')
  }
}

export const testGympgrphFitToSelectionRequestExists = () => {
  const fitPath = path.resolve(process.cwd(), '..', 'gympgrph', 'src', 'geospatialFit.ts')
  const fitText = readUtf8(fitPath)
  if (!fitText.includes('requestGeospatialFitToSelection')) {
    throw new Error('Expected gympgrph to export requestGeospatialFitToSelection')
  }
  if (!fitText.includes('store.requestGeospatialFitToSelection')) {
    throw new Error('Expected requestGeospatialFitToSelection to delegate to store.requestGeospatialFitToSelection')
  }
  const typesPath = path.resolve(process.cwd(), '..', 'gympgrph', 'src', 'hooks', 'store', 'types.ts')
  const typesText = readUtf8(typesPath)
  if (!typesText.includes("mode: 'data' | 'selection'")) {
    throw new Error("Expected geospatial fit request mode to include 'selection'")
  }
  const slicePath = path.resolve(process.cwd(), '..', 'gympgrph', 'src', 'hooks', 'store', 'geospatialSlice.ts')
  const sliceText = readUtf8(slicePath)
  if (!sliceText.includes("mode: 'selection'")) {
    throw new Error("Expected geospatialSlice requestGeospatialFitToSelection to set mode: 'selection'")
  }
}

export const testHostGeoZoomToSelectionCallsGympgrphSelectionFit = () => {
  const viewportPath = path.resolve(process.cwd(), 'src', 'components', 'CanvasViewportGeospatialOverlay.tsx')
  const viewportText = readUtf8(viewportPath)
  if (!viewportText.includes('requestGeospatialFitToSelection')) {
    throw new Error('Expected host CanvasViewport to call requestGeospatialFitToSelection when zoomToSelectionMode changes')
  }
  if (!viewportText.includes('setGeospatialAutoFitEnabled')) {
    throw new Error('Expected host CanvasViewport to sync Fit-to-Screen to setGeospatialAutoFitEnabled')
  }
}

export const testZIndexSsotIsUsedForToastsAndFloatingPanels = () => {
  const zPath = path.resolve(process.cwd(), 'src', 'lib', 'ui', 'zIndex.ts')
  const zText = readUtf8(zPath)
  if (!zText.includes('Z_INDEX_FLOATING_PANEL_DEFAULT')) throw new Error('Expected Z_INDEX_FLOATING_PANEL_DEFAULT to exist')
  if (!zText.includes('Z_INDEX_TOAST')) throw new Error('Expected Z_INDEX_TOAST to exist')
  const toastPath = path.resolve(process.cwd(), 'src', 'components', 'ui', 'ToastHost.tsx')
  const toastText = readUtf8(toastPath)
  if (toastText.includes('z-[2500]') || toastText.includes('z-[5000]')) {
    throw new Error('ToastHost must not hardcode z-index classes (use zIndex SSOT)')
  }
  if (!toastText.includes('Z_INDEX_TOAST')) throw new Error('Expected ToastHost to use Z_INDEX_TOAST')
  const slicePath = path.resolve(process.cwd(), 'src', 'hooks', 'store', 'panelLayoutUiSlice.ts')
  const sliceText = readUtf8(slicePath)
  if (sliceText.includes('floatingPanelZIndex, 5000')) {
    throw new Error('Expected floatingPanelZIndex default to use SSOT constant, not hardcoded 5000')
  }
}
