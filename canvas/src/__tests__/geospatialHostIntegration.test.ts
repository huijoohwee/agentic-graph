import path from 'node:path'

import { readUtf8 } from './geospatialHostIntegrationTestUtils'

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
  if (!text.includes('const mapLibreRuntimeEnabled = show2dMapLibre || show3d')) {
    throw new Error('Expected GeospatialOverlayHost runtime to enable MapLibre only for explicit 2D/3D MapLibre modes')
  }
  if (!text.includes('<SvgGeospatialFallback')) {
    throw new Error('Expected GeospatialOverlayHost to render the SVG fallback basemap')
  }
}

export const testGeoXrComposesNativeMapLibreBelowTransparentFlight = () => {
  const viewportPath = path.resolve(process.cwd(), 'src', 'components', 'CanvasViewportGeospatialOverlay.tsx')
  const hostPath = path.resolve(process.cwd(), '..', 'gympgrph', 'src', 'GeospatialHost.tsx')
  const presentationPath = path.resolve(process.cwd(), '..', 'gympgrph', 'src', 'features', 'geospatial', 'useFlightGeoOverlayMapLibrePresentation.ts')
  const xrStagePath = path.resolve(process.cwd(), 'src', 'features', 'three', 'XrCanonicalPhysicsStage.tsx')
  const threeGraphPath = path.resolve(process.cwd(), 'src', 'lib', 'three', 'ThreeGraph.impl.tsx')
  const gameplayOverlayPath = path.resolve(process.cwd(), 'src', 'lib', 'three', 'ThreeGameplayOverlay.tsx')
  const flightOverlayPath = path.resolve(process.cwd(), '..', 'gympgrph', 'src', 'flightGeoOverlayMapLibre.ts')
  const viewportText = readUtf8(viewportPath)
  const hostText = readUtf8(hostPath)
  const presentationText = readUtf8(presentationPath)
  const xrStageText = readUtf8(xrStagePath)
  const threeGraphText = readUtf8(threeGraphPath)
  const gameplayOverlayText = readUtf8(gameplayOverlayPath)
  const flightOverlayText = readUtf8(flightOverlayPath)
  if (viewportText.includes('shared-xr-stage') || hostText.includes('sharedXrStage')) {
    throw new Error('Expected Geo+XR to avoid the conflicting shared-R3F provider policy')
  }
  if (!viewportText.includes('setFlightGeoOverlay')
    || !viewportText.includes('projectFlightSimToGeospatialOverlay')) {
    throw new Error('Expected Geo+XR to publish the deterministic Flight projection to the Geo owner')
  }
  if (!hostText.includes('const mapLibreRuntimeEnabled = show2dMapLibre || show3d')
    || !hostText.includes('useFlightGeoOverlayMapLibrePresentation({')
    || !presentationText.includes('applyFlightGeoOverlayToMap(map, overlay)')) {
    throw new Error('Expected the native MapLibre runtime to own Geo+XR basemap and Flight projection layers')
  }
  const overlayApplyIndex = presentationText.indexOf('const applied = applyFlightGeoOverlayToMap(map, overlay)')
  const overlayFitIndex = presentationText.indexOf('fitMapToFlightGeoOverlay(map, overlay, cameraPadding)')
  const overlayCameraIndex = presentationText.indexOf('applyFlightGeoOverlayCameraToMap(')
  if (
    overlayApplyIndex < 0
    || overlayFitIndex < overlayApplyIndex
    || overlayCameraIndex < overlayFitIndex
  ) {
    throw new Error('Expected route fit to complete before the final Fixed Follow camera write')
  }
  const fitKeyStart = presentationText.indexOf('const fitKey = [', overlayApplyIndex)
  const fitKeyEnd = presentationText.indexOf("].join(':')", fitKeyStart)
  const fitKeySource = presentationText.slice(fitKeyStart, fitKeyEnd)
  if (
    fitKeyStart < 0
    || fitKeyEnd < 0
    || fitKeySource.includes('overlay.camera')
  ) {
    throw new Error('Expected route fit to stay stable when Flight camera source or view changes')
  }
  if (!presentationText.includes("root.dataset.kgFlightGeospatialOverlay = 'active'")) {
    throw new Error('Expected the Geo host to expose live Flight overlay browser proof')
  }
  if (!presentationText.includes('scheduleFinalApply')
    || !presentationText.includes("map?.on?.('load', scheduleFinalApply)")
    || !presentationText.includes('readFlightGeoMapViewportPadding(map)')
    || !presentationText.includes('applyFlightGeoOverlayCameraToMap(')) {
    throw new Error('Expected MapLibre initialization to finish with the Flight camera owner')
  }
  const renderAcknowledgeIndex = presentationText.indexOf("map.on('render', listener)")
  const firstFrameMarkerIndex = presentationText.indexOf("canvas.dataset.kgFlightSimFirstFrameSurface = 'maplibre'")
  const presentationCallbackIndex = presentationText.indexOf('onPresented?.(presentation)')
  if (
    renderAcknowledgeIndex < 0
    || firstFrameMarkerIndex < 0
    || presentationCallbackIndex < firstFrameMarkerIndex
  ) {
    throw new Error('Expected only the rendered native MapLibre overlay to acknowledge Geo+XR Flight presentation')
  }
  if (!presentationText.includes("overlay.phase !== 'stopped'")
    || !presentationText.includes('pending.attempts += 1')
    || !presentationText.includes('FLIGHT_GEO_PREPARATION_RENDER_ATTEMPT_LIMIT')
    || !presentationText.includes('FLIGHT_GEO_READY_RENDER_ATTEMPT_LIMIT')) {
    throw new Error('Expected stopped re-preparation and transient MapLibre renders to use bounded, exact presentation retries')
  }
  if (!viewportText.includes('completeFlightSimMapLibreReadyFrame(')
    || !viewportText.includes('completeFlightSimStagePreparation(requestId, {')
    || !viewportText.includes('framePresented: true')
    || !viewportText.includes('onFlightOverlayPresented={handleFlightOverlayPresented}')) {
    throw new Error('Expected the Geo+XR bridge to route exact MapLibre presentation into Flight preparation and tick-zero readiness')
  }
  if (!xrStageText.includes('environmentVisible={!geospatialComposite}')
    || !xrStageText.includes('geospatialComposite ? null : <XrNativeControllerDemoSceneAtmosphere')) {
    throw new Error('Expected Geo+XR to hide duplicate R3F terrain and atmosphere')
  }
  if (!threeGraphText.includes('const rendererDefaultClearAlpha = geospatialComposite ? 0')) {
    throw new Error('Expected the Flight R3F canvas to stay transparent above MapLibre')
  }
  if (!gameplayOverlayText.includes('actorsVisible={!props.geospatialComposite}')) {
    throw new Error('Expected Geo+XR to suppress competing R3F Flight geometry')
  }
  for (const layer of ['route', 'routePoints', 'aircraft', 'aircraftOutline']) {
    if (!flightOverlayText.includes(`${layer}:`)) {
      throw new Error(`Expected the MapLibre Flight projection to include ${layer}`)
    }
  }
  for (const marker of [
    "overlay.camera.effectiveOwner === 'timeline-playback'",
    'center: [...overlay.camera.centerCoordinate]',
    'FLIGHT_GEO_NIGHT_EXPRESSION',
  ]) {
    if (!flightOverlayText.includes(marker)) {
      throw new Error(`Expected visible MapLibre Flight camera/palette contract to include ${marker}`)
    }
  }
  if (flightOverlayText.includes('overlay.tick <= 0')) {
    throw new Error('Expected Fixed Follow camera framing to apply at stopped/ready tick zero')
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

export * from './geospatialHostControlsIntegration.test'
export * from './geospatialHostMapLibreInteractionIntegration.test'
