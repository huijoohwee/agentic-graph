import fs from 'node:fs'
import path from 'node:path'
import { loadGraphDataFromTextViaParser } from '@/features/parsers/loader'
import { extractGrabMapsPoiFeatureCollectionsFromMarkdown } from '@/features/geospatial/grabMapsMarkdownPoi'
import { parseGraph } from '@/lib/graph/io/adapter'
import {
  GRABMAPS_DEFAULT_MCP_AUTH_HEADER_ARG,
  GRABMAPS_DEFAULT_MCP_ARGS_JSON,
  GRABMAPS_DEFAULT_MCP_COMMAND,
  GRABMAPS_DEFAULT_MCP_PACKAGE,
  GRABMAPS_DEFAULT_MCP_STARTUP_TIMEOUT_MS,
} from 'grph-shared/geospatial/grabMapsSsot'
import { resolveRepoTestDataPath } from '@/tests/lib/repoTestData'

const readUtf8 = (absPath: string): string => {
  return fs.readFileSync(absPath, { encoding: 'utf8' })
}

export const testGrabMapsParserSupportsNestedSearchPlacesResponses = () => {
  const text = JSON.stringify({
    tool: 'search_places',
    data: {
      results: [
        {
          id: 'poi-1',
          name: 'Marina Bay Sands',
          location: { lat: 1.2834, lng: 103.8607 },
          category: 'landmark',
        },
        {
          id: 'poi-2',
          name: 'Satay by the Bay',
          coordinates: [103.8683, 1.2897],
          category: 'restaurant',
        },
      ],
    },
  })

  const { data } = parseGraph('grabmaps-search-places.json', text)
  if (data.context !== 'geodata') {
    throw new Error(`Expected context=geodata for nested GrabMaps search results, got ${data.context}`)
  }
  if (!Array.isArray(data.nodes) || data.nodes.length !== 2) {
    throw new Error(`Expected 2 parsed geodata nodes, got ${data.nodes?.length}`)
  }
}

export const testGrabMapsParserPreservesDirectionsPolylineImport = () => {
  const text = JSON.stringify({
    routes: [
      {
        geometry: '_izlhA~rlgdF_{geC~ywl@_kwzCn`{nI',
        distance: 1523,
        duration: 420,
      },
    ],
  })

  const { data } = parseGraph('grabmaps-directions.json', text)
  if (data.context !== 'grabmaps') {
    throw new Error(`Expected context=grabmaps for directions payload, got ${data.context}`)
  }
  const meta = (data.metadata || {}) as Record<string, unknown>
  if (!meta.kgGeospatialLineFeatures) {
    throw new Error('Expected directions payload to produce kgGeospatialLineFeatures metadata')
  }
}

export const testGrabMapsParserReusesSharedPlainObjectGuard = () => {
  const filePath = path.resolve(process.cwd(), 'src', 'lib', 'graph', 'io', 'grabmaps.ts')
  const text = readUtf8(filePath)
  if (!text.includes("import { isPlainObject } from '@/lib/graph/value'")) {
    throw new Error('expected GrabMaps parser to reuse the shared plain-object guard upstream')
  }
  if (!text.includes('if (!isPlainObject(json)) return null')) {
    throw new Error('expected GrabMaps parser root payload detection to reuse the shared plain-object guard')
  }
  if (!text.includes('if (!isPlainObject(r0)) return null')) {
    throw new Error('expected GrabMaps parser route record detection to reuse the shared plain-object guard')
  }
  if (text.includes('const isRecord = (v: unknown): v is Record<string, unknown> =>')) {
    throw new Error('expected GrabMaps parser to stop defining a local record guard')
  }
}

export const testGrabMapsMarkdownPoiColumnKeysUseVariantsNotAliases = () => {
  const filePath = path.resolve(process.cwd(), 'src', 'features', 'geospatial', 'grabMapsMarkdownPoi.ts')
  const text = readUtf8(filePath)
  if (!text.includes('deriveColumnKeyVariants')) {
    throw new Error('expected GrabMaps markdown POI column-key normalization to use variant terminology')
  }
  if (
    text.includes('deriveColumnKeyAliases') ||
    text.includes('const aliases') ||
    text.includes('for (const alias of')
  ) {
    throw new Error('expected GrabMaps markdown POI column-key normalization to avoid alias terminology')
  }
}

export const testGrabMapsPresetUsesPreferredStyleSetting = () => {
  const panelPath = path.resolve(process.cwd(), '..', 'gympgrph', 'src', 'GeospatialPanelHost.tsx')
  const text = readUtf8(panelPath)
  if (!text.includes('readPreferredGrabMapsStyleUrl')) {
    throw new Error('Expected GrabMaps preset to read the preferred style URL helper')
  }
  if (!text.includes('LS_KEYS.grabMapsBasemapStyleUrl')) {
    throw new Error('Expected GrabMaps panel host to persist preferred GrabMaps style URL in the shared LS key')
  }
  if (!text.includes('isGrabMapsPresetActive(committedStyleUrl, geospatialViewMode)')) {
    throw new Error('Expected GrabMaps panel host to reuse shared preset-active detection')
  }
  if (!text.includes("active={geospatialViewMode === '2d-modern' && !isGrabMapsPresetActive(committedStyleUrl, geospatialViewMode)}")) {
    throw new Error('Expected MapLibre Modern and GrabMaps preset selections to be mutually exclusive')
  }
  if (!text.includes('resolveStandardViewModeStyleUrl(')) {
    throw new Error('Expected standard MapLibre mode selection to reuse a shared style resolver instead of panel-local branching')
  }
  if (text.includes('emitGeospatialModeChanged({ enabled: true, viewMode:')) {
    throw new Error('Expected GeospatialPanelHost to avoid duplicate direct mode-event emission and rely on store SSOT')
  }
}

export const testGrabMapsStyleDoesNotLeakIntoOtherMapLibreModes = () => {
  const basemapStylePath = path.resolve(process.cwd(), '..', 'gympgrph', 'src', 'features', 'geospatial', 'basemapStyle.ts')
  const hostPath = path.resolve(process.cwd(), '..', 'gympgrph', 'src', 'GeospatialHost.tsx')
  const basemapStyleText = readUtf8(basemapStylePath)
  const hostText = readUtf8(hostPath)
  if (!basemapStyleText.includes('const resolveEffectiveGeospatialStyleUrl = (')) {
    throw new Error('Expected shared geospatial basemap style helpers to centralize effective style resolution')
  }
  if (!basemapStyleText.includes('isGrabMapsStyleUrl(normalizedStyleUrl)')) {
    throw new Error('Expected effective geospatial style resolution to detect GrabMaps styles explicitly')
  }
  if (!basemapStyleText.includes('getBuiltInDefaultStyleUrl(normalizedViewMode)')) {
    throw new Error('Expected effective geospatial style resolution to fall back to the selected mode default')
  }
  if (!hostText.includes('resolveEffectiveGeospatialStyleUrl(geospatialViewMode, targetStyleUrl)')) {
    throw new Error('Expected GeospatialHost to reuse the shared effective-style resolver so GrabMaps cannot bleed into other MapLibre modes')
  }
}

export const testCanvasStartupDefaultsPreferStoryboardFrontmatterAndUnlockedView = () => {
  const uiSlicePath = path.resolve(process.cwd(), 'src', 'hooks', 'store', 'uiSlice.ts')
  const uiSettingsSlicePath = path.resolve(process.cwd(), 'src', 'hooks', 'store', 'uiSettingsSlice.ts')
  const configRenderPath = path.resolve(process.cwd(), 'src', 'lib', 'config.render.ts')
  const geospatialSlicePath = path.resolve(process.cwd(), '..', 'gympgrph', 'src', 'hooks', 'store', 'geospatialSlice.ts')
  const toolbarContextPath = path.resolve(process.cwd(), 'src', 'components', 'toolbar', 'useCanvasToolbarContext.ts')
  const runtimePath = path.resolve(process.cwd(), 'src', 'features', 'canvas', 'useCanvasGeospatialRuntime.ts')
  const toolbarLauncherPath = path.resolve(process.cwd(), 'src', 'features', 'toolbar', 'ToolbarMenuLauncher.tsx')
  const toolbarToolMenuPath = path.resolve(process.cwd(), 'src', 'lib', 'toolbar', 'ToolbarToolMenu.impl.tsx')
  const geospatialPreferencePath = path.resolve(process.cwd(), 'src', 'lib', 'geospatial', 'geospatialModePreference.ts')
  const sharedGeospatialConstantsPath = path.resolve(process.cwd(), '..', 'grph-shared', 'src', 'geospatial', 'constants.ts')

  const uiSliceText = readUtf8(uiSlicePath)
  const uiSettingsSliceText = readUtf8(uiSettingsSlicePath)
  const configRenderText = readUtf8(configRenderPath)
  const geospatialSliceText = readUtf8(geospatialSlicePath)
  const toolbarContextText = readUtf8(toolbarContextPath)
  const runtimeText = readUtf8(runtimePath)
  const toolbarLauncherText = readUtf8(toolbarLauncherPath)
  const toolbarToolMenuText = readUtf8(toolbarToolMenuPath)
  const geospatialPreferenceText = readUtf8(geospatialPreferencePath)
  const sharedGeospatialConstantsText = readUtf8(sharedGeospatialConstantsPath)

  if (!configRenderText.includes("export const DEFAULT_CANVAS_2D_RENDERER: Canvas2dRendererId = 'storyboard'")) {
    throw new Error('Expected startup 2D renderer baseline to default to Storyboard at the shared renderer config')
  }
  if (!uiSettingsSliceText.includes('frontmatterModeEnabled: true')) {
    throw new Error('Expected startup frontmatter mode to default ON at the shared UI settings slice')
  }
  if (!uiSettingsSliceText.includes("documentSemanticMode: 'document'")) {
    throw new Error('Expected startup document mode to default to document semantics at the shared UI settings slice')
  }
  if (!uiSliceText.includes('floatingPanelOpen: false')) {
    throw new Error('Expected startup floating panel open state to default OFF at the shared UI slice')
  }
  if (!uiSliceText.includes("floatingPanelView: 'geo'")) {
    throw new Error("Expected startup floating panel view to default to 'geo' at the shared UI slice")
  }
  if (!uiSliceText.includes('documentStructureBaselineLock: lsBool(LS_KEYS.documentStructureBaselineLock, false)')) {
    throw new Error('Expected View Lock startup default to be OFF at the shared UI slice')
  }
  if (
    !sharedGeospatialConstantsText.includes('export const DEFAULT_GEOSPATIAL_OVERLAY_ENABLED = false as const')
    || !sharedGeospatialConstantsText.includes("export const GEOSPATIAL_OVERLAY_PREFERENCE_VERSION = 'neutral-v1' as const")
    || !sharedGeospatialConstantsText.includes('geospatialOverlayPreferenceVersion:')
  ) {
    throw new Error('Expected shared geospatial constants to keep overlay startup neutral instead of map-first')
  }
  if (
    !geospatialPreferenceText.includes('DEFAULT_GEOSPATIAL_OVERLAY_ENABLED')
    || !geospatialPreferenceText.includes('GEOSPATIAL_OVERLAY_PREFERENCE_VERSION')
    || !geospatialPreferenceText.includes('readGeospatialOverlayEnabledPreference')
    || !geospatialPreferenceText.includes('writeGeospatialOverlayEnabledPreference')
    || !geospatialPreferenceText.includes('lsBool(LS_KEYS.geospatialOverlayEnabled, DEFAULT_GEOSPATIAL_OVERLAY_ENABLED)')
    || !geospatialPreferenceText.includes('LS_KEYS.geospatialOverlayPreferenceVersion')
  ) {
    throw new Error('Expected Canvas geospatial preference reads to centralize on the shared neutral overlay default')
  }
  if (
    !geospatialSliceText.includes('DEFAULT_GEOSPATIAL_OVERLAY_ENABLED, GEOSPATIAL_OVERLAY_PREFERENCE_VERSION')
    || !geospatialSliceText.includes('readGeospatialModeEnabledPreference()')
    || !geospatialSliceText.includes('writeString(LS_KEYS.geospatialOverlayPreferenceVersion, GEOSPATIAL_OVERLAY_PREFERENCE_VERSION)')
  ) {
    throw new Error('Expected geospatial startup default to reuse the shared neutral overlay preference')
  }
  if (!geospatialSliceText.includes('DEFAULT_GEOSPATIAL_VIEW_MODE') || !geospatialSliceText.includes('normalizeGeospatialViewMode')) {
    throw new Error("Expected geospatial startup fallback view mode to prefer the shared default geospatial view-mode SSOT")
  }
  if (!toolbarContextText.includes('readGeospatialOverlayEnabledPreference()')) {
    throw new Error('Expected toolbar startup state to reuse the shared neutral geospatial preference without default drift')
  }
  if (!runtimeText.includes('readGeospatialOverlayEnabledPreference()')) {
    throw new Error('Expected canvas geospatial runtime to reuse the shared neutral geospatial preference without default drift')
  }
  if (!toolbarLauncherText.includes('readGeospatialOverlayEnabledPreference()')) {
    throw new Error('Expected toolbar launcher startup state to reuse the shared neutral geospatial preference')
  }
  if (!toolbarToolMenuText.includes('readGeospatialOverlayEnabledPreference()')) {
    throw new Error('Expected floating toolbar startup state to reuse the shared neutral geospatial preference')
  }
}

export const testCanvasGeospatialRuntimeDeduplicatesRepeatedModeEvents = () => {
  const runtimePath = path.resolve(process.cwd(), 'src', 'features', 'canvas', 'useCanvasGeospatialRuntime.ts')
  const runtimeText = readUtf8(runtimePath)
  if (!runtimeText.includes('lastHandledGeospatialModeEnabledRef')) {
    throw new Error('Expected canvas geospatial runtime to track the last handled geospatial mode state upstream')
  }
  if (!runtimeText.includes('if (lastHandledGeospatialModeEnabledRef.current === enabled) {')) {
    throw new Error('Expected canvas geospatial runtime to ignore repeated identical mode events')
  }
  if (!runtimeText.includes('setGeospatialModeEnabled(prev => (prev === enabled ? prev : enabled))')) {
    throw new Error('Expected canvas geospatial runtime state updates to short-circuit identical geospatial mode values')
  }
}

export const testWorkspaceInitializationDocsRenderableThroughYamlFrontmatterPipeline = async () => {
  const docsRoot = path.resolve(process.cwd(), '..', '..', 'huijoohwee', 'docs')
  const readmeCandidate = fs
    .readdirSync(docsRoot)
    .filter(name => name.endsWith('.md'))
    .map(name => {
      const filePath = path.resolve(docsRoot, name)
      return { filePath, name, text: readUtf8(filePath) }
    })
    .find(candidate => candidate.text.includes('kgFrontmatterModeEnabled: true') && candidate.text.includes('index:'))
  if (!readmeCandidate) {
    throw new Error('Expected docs mirror to include a YAML-frontmatter canvas seed')
  }
  const placesPath = path.resolve(docsRoot, 'knowgrph-maps-places.md')
  const readmeText = readmeCandidate.text
  const placesText = readUtf8(placesPath)

  if (!readmeText.includes('kgFrontmatterModeEnabled: true') || !readmeText.includes('index:')) {
    throw new Error('Expected discovered docs markdown to declare a YAML-frontmatter canvas seed')
  }
  if (!placesText.includes('kgCanvasSurfaceMode: "geospatial"') || !placesText.includes('Coordinates (`lat, lng`)')) {
    throw new Error('Expected knowgrph-maps-places.md to declare a geospatial YAML-frontmatter seed with coordinates data')
  }

  const readmeResult = await loadGraphDataFromTextViaParser(readmeCandidate.name, readmeText, { applyToStore: false })
  const placesResult = await loadGraphDataFromTextViaParser('knowgrph-maps-places.md', placesText, { applyToStore: false })
  const readmeGraph = readmeResult?.graphData
  const placesGraph = placesResult?.graphData

  if (!readmeGraph || readmeGraph.context !== 'frontmatter-flow' || (readmeGraph.nodes?.length || 0) === 0) {
    throw new Error('Expected discovered docs markdown to materialize into a non-empty frontmatter-flow graph')
  }
  if (!placesGraph || (placesGraph.nodes?.length || 0) === 0) {
    throw new Error('Expected knowgrph-maps-places.md to materialize into a non-empty document graph')
  }

  const poiExtraction = extractGrabMapsPoiFeatureCollectionsFromMarkdown({
    markdownText: placesText,
    sourceDocumentPath: 'workspace:/knowgrph-maps-places.md',
  })
  if (!poiExtraction.featureCollections.length || (poiExtraction.featureCollections[0]?.featureCollection.features?.length || 0) === 0) {
    throw new Error('Expected knowgrph-maps-places.md to expose geospatial POI overlay features from markdown tables')
  }
  if (poiExtraction.featureCollections[0]?.sourceDescriptor.kind !== 'table') {
    throw new Error('Expected markdown POI extraction to attach canonical table source descriptors upstream')
  }
  const candidateCollection = poiExtraction.featureCollections.find(entry => {
    const features = entry.featureCollection.features || []
    return features.some(feature => String(feature.properties?.name || '') === 'Punggol')
  })
  const punggol = candidateCollection?.featureCollection.features.find(feature => String(feature.properties?.name || '') === 'Punggol')
  if (!punggol) {
    throw new Error('Expected knowgrph-maps-places.md to expose canonical candidate location features upstream')
  }
  const punggolScore = Number.parseFloat(String(punggol.properties?.['C*'] || '').replace(/[^\d.]+/g, ''))
  if (!Number.isFinite(punggolScore) || punggolScore <= 0 || punggolScore >= 1) {
    throw new Error('Expected knowgrph-maps-places.md to merge a canonical numeric C* score into candidate geo features upstream')
  }
  if (!String(punggol.properties?.Rank || '').trim()) {
    throw new Error('Expected knowgrph-maps-places.md to merge candidate ranking metadata into canonical geo features upstream')
  }
  if (String(punggol.properties?.['Best residential catchment'] || '') !== '' && String(punggol.properties?.['Best residential catchment'] || '') !== 'Punggol') {
    throw new Error('Expected merged markdown geo metadata to preserve canonical candidate labels without doc-specific remapping')
  }
}

export const testGrabMapsReferenceDemoDeclaresCanonicalGeospatialSeedPreset = () => {
  const demoPath = resolveRepoTestDataPath('knowgrph-maps-grabmap-multim-demo.md')
  const text = readUtf8(demoPath)
  if (!text.includes('kgCanvasSurfaceMode: "geospatial"')) {
    throw new Error('Expected GrabMaps reference demo to declare geospatial surface mode as the canonical seed preset')
  }
  if (!text.includes('kgCanvas2dRenderer: "storyboard"')) {
    throw new Error('Expected GrabMaps reference demo to preserve Storyboard as the canonical 2D renderer for geospatial widget-panel overlays')
  }
  if (!text.includes('kgDocumentSemanticMode: "document"')) {
    throw new Error('Expected GrabMaps reference demo to declare document semantic mode explicitly')
  }
  if (!text.includes('kgFrontmatterModeEnabled: true')) {
    throw new Error('Expected GrabMaps reference demo to enable Frontmatter Mode explicitly')
  }
  if (!text.includes('kgMultiDimTableModeEnabled: false')) {
    throw new Error('Expected GrabMaps reference demo to disable Multi-dimensional Table Mode explicitly')
  }
  if (!text.includes('kgDocumentStructureBaselineLock: false')) {
    throw new Error('Expected GrabMaps reference demo to keep View Lock OFF explicitly')
  }
}

export const testGrabMapsFallbackDoesNotTreatAuthErrorsAsUnavailable = () => {
  const basemapPath = path.resolve(process.cwd(), '..', 'gympgrph', 'src', 'features', 'geospatial', 'useMapLibreBasemap.ts')
  const libraryPath = path.resolve(process.cwd(), '..', 'grph-shared', 'src', 'geospatial', 'grabMapsLibrary.ts')
  const text = readUtf8(basemapPath)
  const libraryText = readUtf8(libraryPath)
  if (!text.includes('const isGrabMapsServiceUnavailable')) {
    throw new Error('Expected MapLibre basemap hook to use a dedicated GrabMaps service-unavailable classifier')
  }
  if (text.includes('401|403|500|502|503|504')) {
    throw new Error('GrabMaps fallback must not classify 401/403 auth errors as service-unavailable fallbacks')
  }
  if (!text.includes('grabMapsBootstrapPending')) {
    throw new Error('Expected GrabMaps fallback to be limited to the initial bootstrap window')
  }
  if (!text.includes('const resolveGrabMapsStyleAssetUrl = (rawValue: unknown, styleUrl: string): string => {')) {
    throw new Error('Expected GrabMaps basemap hook to centralize style asset URL normalization')
  }
  if (!text.includes("const originBase = new URL('/', styleBase)")) {
    throw new Error('Expected GrabMaps style asset normalization to anchor bare paths at the site root')
  }
  if (!text.includes("trimmed.replace(/^\\/+/, '')")) {
    throw new Error('Expected GrabMaps style asset normalization to strip leading slashes before root-based URL resolution')
  }
  if (!text.includes('originBase).toString()')) {
    throw new Error('Expected bare GrabMaps style asset paths to be normalized against the site root instead of /api/style.json')
  }
  if (!text.includes('const normalizedStyle = normalizeGrabMapsStyleDocument(rawStyle, styleUrl)')) {
    throw new Error('Expected GrabMaps preflight to reuse the fetched style JSON as the normalized MapLibre style input')
  }
  if (!text.includes('const resolveGrabMapsGlyphsUrl = (rawValue: unknown, styleUrl: string): string => {')) {
    throw new Error('Expected GrabMaps basemap hook to centralize glyph template normalization')
  }
  if (!text.includes('decodeGrabMapsTileTemplatePlaceholders(resolveGrabMapsStyleAssetUrl(rawValue, styleUrl))')) {
    throw new Error('Expected GrabMaps glyph normalization to decode encoded placeholder tokens before template checks')
  }
  if (!text.includes("return `${base}/{fontstack}/{range}.pbf`")) {
    throw new Error('Expected bare GrabMaps glyph endpoints to be expanded into a MapLibre-compatible fontstack/range template')
  }
  if (!text.includes('const decodeGrabMapsTileTemplatePlaceholders = (url: string): string => {')) {
    throw new Error('Expected GrabMaps basemap hook to centralize tile template placeholder decoding')
  }
  if (!text.includes(".replace(/%257B/gi, '{')")) {
    throw new Error('Expected GrabMaps basemap hook to decode double-encoded tile placeholders before MapLibre requests tiles')
  }
  if (!text.includes('const normalizeGrabMapsVectorTileUrl = (rawUrl: string): string => {')) {
    throw new Error('Expected GrabMaps basemap hook to centralize vector tile endpoint normalization')
  }
  if (!text.includes("'/api/maps/tiles/v2/vector/'")) {
    throw new Error('Expected GrabMaps basemap hook to detect non-canonical /api vector tile paths')
  }
  if (!text.includes("'/maps/tiles/v2/vector/'")) {
    throw new Error('Expected GrabMaps basemap hook to rewrite vector tiles onto the canonical /maps path')
  }
  if (!text.includes('const hydrateGrabMapsSourceUrls = async (')) {
    throw new Error('Expected GrabMaps basemap preflight to hydrate nested source TileJSON documents')
  }
  if (!text.includes('const hydratedStyle = await hydrateGrabMapsSourceUrls(normalizedStyle, headers)')) {
    throw new Error('Expected GrabMaps style preflight to inline normalized source TileJSON before MapLibre mounts')
  }
  if (!text.includes('isCurrent: () => !cancelled')) {
    throw new Error('Expected GrabMaps fallback creation to bind late async map mounting to the current basemap owner')
  }
  if (!text.includes('if (cancelled) {\n            disposeMapLibreBasemap(fallbackMap)\n            return\n          }')) {
    throw new Error('Expected cancelled GrabMaps fallback maps to dispose immediately instead of claiming a stale surface')
  }
  if (!libraryText.includes('isCurrent?: () => boolean')) {
    throw new Error('Expected shared GrabMaps library helper to accept an optional owner-current predicate')
  }
  if (!libraryText.includes('if (args.isCurrent?.() === false) return null')) {
    throw new Error('Expected shared GrabMaps library helper to stop before mounting stale async fallback maps')
  }
}

export const testGeospatialHostDebugLayerReadsAreStyleSafe = () => {
  const hostPath = path.resolve(process.cwd(), '..', 'gympgrph', 'src', 'GeospatialHost.tsx')
  const text = readUtf8(hostPath)
  if (!text.includes('const styleReady = activeBasemap.styleRevision > 0')) {
    throw new Error('Expected GeospatialHost debug/readiness logic to use styleRevision as the upstream style-ready SSOT')
  }
  if (!text.includes('const hasLayer = (layerId: string): boolean => {')) {
    throw new Error('Expected GeospatialHost debug layer checks to use a guarded helper')
  }
  if (!text.includes('if (!styleReady) return false')) {
    throw new Error('Expected GeospatialHost debug layer checks to bail before calling getLayer when style is not ready')
  }
}

export const testMapLibreStyleReadinessGuardsMissingStyleObject = () => {
  const layerPath = path.resolve(process.cwd(), '..', 'gympgrph', 'src', 'maplibreLayers.ts')
  const text = readUtf8(layerPath)
  if (!text.includes('const hasStyleAttached = (map: any): boolean => {')) {
    throw new Error('Expected shared MapLibre layer helpers to centralize style-attached checks')
  }
  if (!text.includes('if (!hasStyleAttached(map)) return false')) {
    throw new Error('Expected isStyleReady() to bail before calling isStyleLoaded() when the style object is missing')
  }
}

export const testGrabMapsProxyTreatsTileAbortAsCancellationNotBadGateway = () => {
  const vitePath = path.resolve(process.cwd(), 'vite.config.ts')
  const text = readUtf8(vitePath)
  if (!text.includes('let downstreamClosed = false')) {
    throw new Error('Expected GrabMaps proxy to track downstream request closure')
  }
  if (!text.includes("req.once('aborted', markDownstreamClosed)")) {
    throw new Error('Expected GrabMaps proxy to abort upstream fetches when tile requests are cancelled by the client')
  }
  if (!text.includes('/aborted|premature close|socket hang up|econnreset/i')) {
    throw new Error('Expected GrabMaps proxy to classify downstream abort-like failures separately from real 502 upstream failures')
  }
  if (!text.includes("? (effectiveBearerToken ? 'private, no-store' : 'public, max-age=60')")) {
    throw new Error('Expected authenticated GrabMaps proxy GETs to disable cache reuse across BYOK/token changes')
  }
}

export const testGrabMapsMcpConfigUsesRemoteCommandShape = () => {
  const registryPath = path.resolve(process.cwd(), 'src', 'features', 'settings', 'registry-ui.grabmaps.ts')
  const docsPath = path.resolve(process.cwd(), 'src', 'features', 'panels', 'views', 'grabmapsMcpApiDocs.ts')
  const ssotPath = path.resolve(process.cwd(), '..', 'grph-shared', 'src', 'geospatial', 'grabMapsSsot.ts')
  const registryText = readUtf8(registryPath)
  const docsText = readUtf8(docsPath)
  const ssotText = readUtf8(ssotPath)
  if (!registryText.includes('GRABMAPS_DEFAULT_MCP_COMMAND')) {
    throw new Error('Expected GrabMaps MCP registry defaults to come from the shared SSOT command')
  }
  if (!docsText.includes('GRABMAPS_DEFAULT_MCP_COMMAND')) {
    throw new Error('Expected GrabMaps MCP docs defaults to reuse the shared SSOT command')
  }
  ;[
    'GRABMAPS_DEFAULT_MCP_COMMAND',
    'GRABMAPS_DEFAULT_MCP_PACKAGE',
    'GRABMAPS_DEFAULT_MCP_AUTH_HEADER_ARG',
    'GRABMAPS_DEFAULT_MCP_STARTUP_TIMEOUT_MS',
  ].forEach(token => {
    if (!ssotText.includes(token)) {
      throw new Error(`Expected GrabMaps MCP shared default ${JSON.stringify(token)} to live in the shared SSOT`)
    }
  })
  const defaultArgs = JSON.parse(GRABMAPS_DEFAULT_MCP_ARGS_JSON) as unknown[]
  ;[
    GRABMAPS_DEFAULT_MCP_PACKAGE,
    GRABMAPS_DEFAULT_MCP_AUTH_HEADER_ARG,
  ].forEach(token => {
    if (!defaultArgs.includes(token)) {
      throw new Error(`Expected GrabMaps MCP shared args to include ${JSON.stringify(token)}`)
    }
  })
  if (!GRABMAPS_DEFAULT_MCP_COMMAND || !Number.isFinite(GRABMAPS_DEFAULT_MCP_STARTUP_TIMEOUT_MS)) {
    throw new Error('Expected GrabMaps MCP shared defaults to retain command and timeout values')
  }
  if (registryText.includes("const GRABMAPS_DEFAULT_MCP_COMMAND = '")) {
    throw new Error('Expected GrabMaps MCP registry to stop declaring local command defaults')
  }
  if (!registryText.includes("'maps.grabmaps.mcp.args'") || !registryText.includes("'maps.grabmaps.mcp.env'")) {
    throw new Error('Expected GrabMaps MCP registry to expose args/env rows instead of legacy URL/header rows')
  }
  if (!docsText.includes("'maps.grabmaps.mcp.startupTimeoutMs'")) {
    throw new Error('Expected GrabMaps MCP docs rows to expose startupTimeoutMs')
  }
}

export const testGrabMapsSearchDiscoveryDocsExposeKeywordCountryLimitAndNearbyRanking = () => {
  const registryPath = path.resolve(process.cwd(), 'src', 'features', 'settings', 'registry-ui.grabmaps.ts')
  const docsPath = path.resolve(process.cwd(), 'src', 'features', 'panels', 'views', 'grabmapsMcpApiDocs.ts')
  const registryText = readUtf8(registryPath)
  const docsText = readUtf8(docsPath)

  ;[
    'maps.grabmaps.mcp.searchPlaces.country',
    'maps.grabmaps.mcp.searchPlaces.limit',
    'maps.grabmaps.mcp.nearbySearch.limit',
    'maps.grabmaps.mcp.nearbySearch.rankBy',
    'maps.grabmaps.mcp.nearbySearch.language',
  ].forEach(token => {
    if (!registryText.includes(`'${token}'`) && !registryText.includes(`key: '${token}'`)) {
      throw new Error(`Expected GrabMaps registry to expose ${token}`)
    }
    if (!docsText.includes(`'${token}'`) && !docsText.includes(`valueKey: '${token}'`)) {
      throw new Error(`Expected GrabMaps MCP docs to expose ${token}`)
    }
  })

  if (!docsText.includes('/maps/poi/v1/search')) {
    throw new Error('Expected GrabMaps MCP docs to reference the official keyword-search endpoint')
  }
  if (!docsText.includes('ISO 3166-1 alpha-3')) {
    throw new Error('Expected GrabMaps MCP docs to describe the country bias format')
  }
  if (!docsText.includes('distance') || !docsText.includes('popularity')) {
    throw new Error('Expected GrabMaps MCP docs to describe nearby ranking modes')
  }
  if (!docsText.includes('kilometres')) {
    throw new Error('Expected GrabMaps MCP docs to describe nearby radius in kilometres')
  }
}

export const testGrabMapsDefaultsToServerManagedAndMemoryOnlyByok = () => {
  const authPath = path.resolve(process.cwd(), '..', 'grph-shared', 'src', 'geospatial', 'grabMapsAuth.ts')
  const uiSlicePath = path.resolve(process.cwd(), 'src', 'hooks', 'store', 'uiSliceInitialState.ts')
  const registryPath = path.resolve(process.cwd(), 'src', 'features', 'settings', 'registry-ui.grabmaps.ts')
  const authText = readUtf8(authPath)
  const uiSliceText = readUtf8(uiSlicePath)
  const registryText = readUtf8(registryPath)
  if (authText.includes('GRABMAPS_BYOK_API_KEY_SESSION_KEY')) {
    throw new Error('Expected GrabMaps BYOK helper to stop defining a browser-session persistence key')
  }
  if (!authText.includes("return raw === 'byok' ? 'byok' : 'serverManaged'")) {
    throw new Error('Expected shared GrabMaps auth mode normalizer to default unknown values to serverManaged')
  }
  if (!authText.includes("if (typeof window === 'undefined') return 'serverManaged'")) {
    throw new Error('Expected shared GrabMaps browser auth helper to default to serverManaged')
  }
  if (authText.includes('window.sessionStorage.getItem') || authText.includes('window.sessionStorage.setItem')) {
    throw new Error('Expected GrabMaps BYOK helper to keep API keys memory-only and avoid browser session storage')
  }
  if (!uiSliceText.includes("LS_KEYS.grabMapsAuthMode,\n      'serverManaged'")) {
    throw new Error('Expected GrabMaps UI store default auth mode to be serverManaged')
  }
  if (!uiSliceText.includes("value => (value === 'byok' ? 'byok' : 'serverManaged')")) {
    throw new Error('Expected GrabMaps UI store auth mode normalizer to default unknown values to serverManaged')
  }
  if (!registryText.includes("default: () => 'serverManaged'")) {
    throw new Error('Expected GrabMaps settings registry default auth mode to be serverManaged')
  }
  if (!registryText.includes("options: ['serverManaged', 'byok']")) {
    throw new Error('Expected GrabMaps settings registry to present serverManaged before explicit BYOK fallback')
  }
  if (!authText.includes(".replace(/^authorization\\s*:\\s*bearer\\s+/i, '')")) {
    throw new Error('Expected GrabMaps BYOK sanitization to strip Authorization: Bearer prefixes')
  }
  if (!authText.includes(".replace(/^bearer\\s+/i, '')")) {
    throw new Error('Expected GrabMaps BYOK sanitization to strip Bearer prefixes')
  }
}
