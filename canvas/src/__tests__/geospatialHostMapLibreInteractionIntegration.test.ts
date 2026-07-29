import path from 'node:path'

import { readUtf8 } from './geospatialHostIntegrationTestUtils'

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
