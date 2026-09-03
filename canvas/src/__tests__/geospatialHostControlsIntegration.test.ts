import path from 'node:path'

import { readUtf8 } from './geospatialHostIntegrationTestUtils'

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
    throw new Error('Expected agentic-graph host Tailwind config to scan gympgrph sources for class generation')
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
  if (!text.includes('setRuntimeProjectionMode(projectionMode)')) throw new Error('Expected view changes to restore the requested MapLibre projection')
  if (text.includes("prev === 'mercator' ? prev : projectionMode")) throw new Error('Expected mercator fallback state not to pin later 3D globe views')
  if (!text.includes("map.setProjection?.({ type: 'globe' })")) throw new Error('Expected basemap hook to set globe projection in 3D mode')
  if (!text.includes('readSingaporeCanvasCameraPolicy(canvasRenderMode)')) throw new Error('Expected basemap hook to share the canonical 2D/3D camera policy')
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
  if (!helperText.includes("if (!trimmed) return ''")) {
    throw new Error('Expected blank persisted style URLs to defer to the selected MapLibre view default')
  }
  if (!helperText.includes("if (lower.startsWith('http://') || lower.startsWith('https://')) return trimmed")) {
    throw new Error('Expected persisted remote style URLs to stay available for explicit MapLibre mode usage')
  }

  const hostPath = path.resolve(process.cwd(), '..', 'gympgrph', 'src', 'GeospatialHost.tsx')
  const hostText = readUtf8(hostPath)
  if (!hostText.includes('normalizePersistedGeospatialStyleUrl(raw)')) {
    throw new Error('Expected GeospatialHost to normalize persisted style URLs when reading runtime basemap state')
  }
  if (!hostText.includes('resolveEffectiveGeospatialStyleUrl(geospatialViewMode, targetStyleUrl)')) {
    throw new Error('Expected GeospatialHost to resolve a blank stored style against the active MapLibre view')
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
