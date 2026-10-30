import React from 'react'
import { useShallow } from 'zustand/react/shallow'
import ErrorBoundary from '@/components/ErrorBoundary'
import { useActiveGraphRenderData } from '@/hooks/useActiveGraphData'
import { useGraphStore } from '@/hooks/useGraphStore'
import { getIconSizeClass } from '@/lib/ui'
import { usePanelTypography } from '@/lib/ui/panelTypography'
import { UI_RESPONSIVE_FLOATING_PANEL_SCROLL_CLASSNAME } from '@/lib/ui/responsiveElementClasses'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import { cn } from '@/lib/utils'
import { resolveXrMotionReferenceStage } from '@/features/three/xrSceneLibrary'
import { readXrMotionReferenceRuntime, subscribeXrMotionReferenceRuntime } from '@/features/three/xrMotionReferenceRuntime'
import { EnhancedLayerCatalogPanel } from '@/features/geospatial/EnhancedLayerCatalogPanel'
import { requestGeospatialFitToSelection } from '@/features/geospatial/gympgrphBridge'
import {
  buildGrabMapsPoiRichMediaPreviewPayload,
  publishGrabMapsPoiRichMediaPreview,
} from '@/features/geospatial/grabMapsPoiRichMedia'
import {
  MainPanelTypeIcon,
  getMainPanelTypeIconMeta,
  resolveMainPanelKtvTypeIconKey,
} from '@/features/panels/ui/mainPanelHelpIconLibrary'

type GeospatialPanelHostProps = {
  active?: boolean
  enhancedLayerCatalog?: React.ReactNode
  panelTypography?: unknown
  renderTypeIcon?: (args: { typeLabel: string }) => React.ReactNode
  snapshot?: unknown
  handlers?: unknown
}

const MissingGeospatialPanelHost = React.memo(function MissingGeospatialPanelHost(_props: GeospatialPanelHostProps) {
  return (
    <section className={`h-full w-full flex items-center justify-center text-xs ${UI_THEME_TOKENS.text.secondary}`}>
      Geospatial panel unavailable
    </section>
  )
})

const NearbyPlacesPanelLazy = React.lazy(() => import('@/features/maps/NearbyPlacesPanel'))

const GeospatialPanelHostLazy = React.lazy(async (): Promise<{ default: React.ComponentType<GeospatialPanelHostProps> }> => {
  const module = (await import('gympgrph')) as unknown as Record<string, unknown>
  const panelHost = module.GeospatialPanelHost as unknown
  if (!panelHost) return { default: MissingGeospatialPanelHost }
  return { default: panelHost as React.ComponentType<GeospatialPanelHostProps> }
})

const readSelectedGeoFeatureId = (node: unknown): string | null => {
  if (!node || typeof node !== 'object') return null
  const properties = (node as { properties?: unknown }).properties
  if (!properties || typeof properties !== 'object' || Array.isArray(properties)) return null
  const record = properties as Record<string, unknown>
  const richMediaProperties = record.richMediaPoiProperties
  const richMediaRecord = richMediaProperties && typeof richMediaProperties === 'object' && !Array.isArray(richMediaProperties)
    ? richMediaProperties as Record<string, unknown>
    : null
  const featureId = record.kgSourceFeatureId ?? richMediaRecord?.kgSourceFeatureId
  const normalized = String(featureId ?? '').trim()
  return normalized || null
}

const findGraphNode = (graphData: unknown, nodeId: string): unknown => {
  if (!graphData || typeof graphData !== 'object') return null
  const nodes = (graphData as { nodes?: unknown }).nodes
  if (!Array.isArray(nodes)) return null
  return nodes.find(node => node && typeof node === 'object'
    && String((node as { id?: unknown }).id ?? '') === nodeId) ?? null
}

export const GeoView = React.memo(function GeoView(props: {
  geospatialModeEnabled: boolean
  isEnablingGeospatial: boolean
  geospatialEnableError: string | null
  onEnableGeospatial: () => void
}) {
  const {
    geospatialModeEnabled,
    isEnablingGeospatial,
    geospatialEnableError,
    onEnableGeospatial,
  } = props
  const activeGraphData = useActiveGraphRenderData()
  const geospatialSelectionContext = useGraphStore(useShallow(state => ({
    graphDataRevision: state.graphDataRevision || 0,
    graphData: state.graphData,
    markdownDocumentName: state.markdownDocumentName || '',
    markdownDocumentText: state.markdownDocumentText || '',
    sourceFiles: state.sourceFiles,
  })))
  const xrRuntime = React.useSyncExternalStore(
    subscribeXrMotionReferenceRuntime,
    readXrMotionReferenceRuntime,
    readXrMotionReferenceRuntime,
  )
  const selectedEnvironment = resolveXrMotionReferenceStage(xrRuntime.plan.stageId)
  const panelTypography = usePanelTypography()
  const uiIconScale = useGraphStore(state => state.uiIconScale)
  const uiIconStrokeWidth = useGraphStore(state => state.uiIconStrokeWidth)
  const iconSizeClass = getIconSizeClass(uiIconScale)
  const [selectedMapFeatureId, setSelectedMapFeatureId] = React.useState<string | null>(null)
  const mapFeatureSelectionGenerationRef = React.useRef(0)
  const gympgrphBridge = useGraphStore(
    useShallow(state => ({
      zoomState: state.zoomState,
      canvasRenderMode: state.canvasRenderMode,
      selectedNodeId: state.selectedNodeId,
      selectedNodeIds: state.selectedNodeIds,
      selectionSource: state.selectionSource,
      selectedEdgeId: state.selectedEdgeId,
      openWidgetNodeIds: state.openWidgetNodeIds,
      openWidgetNodeIdsByRenderer: state.openWidgetNodeIdsByRenderer,
      selectNode: state.selectNode,
      selectEdge: state.selectEdge,
      setSelectionSource: state.setSelectionSource,
      requestZoom: state.requestZoom,
      requestThreeCamera: state.requestThreeCamera,
      pushUiToast: state.pushUiToast,
      upsertUiToast: state.upsertUiToast,
      dismissUiToast: state.dismissUiToast,
    })),
  )
  const renderGeospatialTypeIcon = React.useCallback(({ typeLabel }: { typeLabel: string }) => {
    const iconKey = resolveMainPanelKtvTypeIconKey(typeLabel)
    const meta = getMainPanelTypeIconMeta(iconKey)
    const label = String(typeLabel || meta.label).trim() || meta.label
    return (
      <span
        className="inline-flex min-h-5 min-w-5 items-center justify-center"
        title={`${label}: ${meta.label}`}
        role="img"
        aria-label={label}
      >
        <MainPanelTypeIcon
          iconKey={iconKey}
          className={`${iconSizeClass} ${UI_THEME_TOKENS.text.secondary}`}
          strokeWidth={uiIconStrokeWidth}
          ariaHidden
        />
      </span>
    )
  }, [iconSizeClass, uiIconStrokeWidth])
  const selectActiveMapFeature = React.useCallback(async (featureId: string): Promise<boolean> => {
    const generation = ++mapFeatureSelectionGenerationRef.current
    if (typeof document !== 'undefined') {
      const matchingMapControls = Array.from(document.querySelectorAll<HTMLButtonElement>(
        'button[data-kg-graph-feature][data-kg-source-feature-id]',
      )).filter(control => control.dataset.kgSourceFeatureId === featureId)
      if (matchingMapControls.length === 1) {
        matchingMapControls[0]!.click()
        return true
      }
    }
    const findTargetNode = (graphData: typeof activeGraphData) => {
      const nodes = Array.isArray(graphData?.nodes) ? graphData.nodes : []
      return nodes.find(node => {
        const properties = node?.properties && typeof node.properties === 'object'
          ? node.properties as Record<string, unknown>
          : {}
        return String(properties.kgSourceFeatureId ?? properties.id ?? properties.poi_id ?? properties.poiId ?? '') === featureId
      })
    }
    let targetNode = findTargetNode(activeGraphData)
    if (!targetNode && activeGraphData && geospatialSelectionContext.markdownDocumentName) {
      const [overlayModule, localPoiRuntime] = await Promise.all([
        import('@/features/geospatial/geospatialOverlayGraphData'),
        import('@/features/geospatial/localPoiDirectoryRuntime'),
      ])
      const mapGraphData = overlayModule.buildGeospatialOverlayGraphData({
        graphData: activeGraphData,
        graphRevision: geospatialSelectionContext.graphDataRevision,
        markdownText: geospatialSelectionContext.markdownDocumentText,
        sourceDocumentPath: geospatialSelectionContext.markdownDocumentName,
        sourceFiles: geospatialSelectionContext.sourceFiles,
      })
      if (generation !== mapFeatureSelectionGenerationRef.current) return false
      const localPoiGraphData = localPoiRuntime.buildLocalPoiDirectoryGraphData(
        localPoiRuntime.getLocalPoiDirectoryDatasetSnapshot(),
      )
      targetNode = findTargetNode(localPoiGraphData
        ? overlayModule.mergeGraphDataUnique(mapGraphData, localPoiGraphData)
        : mapGraphData)
    }
    if (!targetNode?.id) return false
    gympgrphBridge.setSelectionSource('toolbar')
    gympgrphBridge.selectNode(String(targetNode.id))
    const targetProperties = targetNode.properties && typeof targetNode.properties === 'object'
      ? targetNode.properties as Record<string, unknown>
      : {}
    const geo = targetProperties.geo && typeof targetProperties.geo === 'object'
      ? targetProperties.geo as Record<string, unknown>
      : {}
    const lng = Number(geo.lng ?? targetProperties.lng ?? targetProperties.longitude)
    const lat = Number(geo.lat ?? targetProperties.lat ?? targetProperties.latitude)
    if (Number.isFinite(lng) && Number.isFinite(lat)) {
      const storyboardWidgetOpenWidgetNodeIds = Array.isArray(gympgrphBridge.openWidgetNodeIdsByRenderer?.storyboard)
        ? gympgrphBridge.openWidgetNodeIdsByRenderer.storyboard
        : []
      publishGrabMapsPoiRichMediaPreview(buildGrabMapsPoiRichMediaPreviewPayload({
        detail: {
          label: String(targetNode.label || targetProperties.label || targetProperties.name || featureId),
          lng,
          lat,
          category: String(targetProperties.category || targetProperties.kgCategory || ''),
          properties: {
            ...targetProperties,
            kgSourceFeatureId: String(targetProperties.kgSourceFeatureId ?? featureId),
          },
        },
        graphData: activeGraphData ?? geospatialSelectionContext.graphData,
        selectedNodeId: gympgrphBridge.selectedNodeId,
        selectedNodeIds: gympgrphBridge.selectedNodeIds,
        openWidgetNodeIds: gympgrphBridge.openWidgetNodeIds,
        storyboardWidgetOpenWidgetNodeIds,
      }))
    }
    void requestGeospatialFitToSelection().catch(() => undefined)
    return true
  }, [
    activeGraphData,
    geospatialSelectionContext,
    gympgrphBridge,
  ])

  React.useEffect(() => {
    let cancelled = false
    const selectedNodeId = String(gympgrphBridge.selectedNodeId || '').trim()
    if (gympgrphBridge.selectionSource === 'canvas') mapFeatureSelectionGenerationRef.current += 1
    const resolveSelection = async () => {
      if (!selectedNodeId) {
        setSelectedMapFeatureId(null)
        return
      }
      const directNode = findGraphNode(activeGraphData, selectedNodeId)
        ?? findGraphNode(geospatialSelectionContext.graphData, selectedNodeId)
      const directFeatureId = readSelectedGeoFeatureId(directNode)
      if (directFeatureId) {
        if (!cancelled) setSelectedMapFeatureId(directFeatureId)
        return
      }
      if (!selectedNodeId.startsWith('geo:') || !geospatialSelectionContext.markdownDocumentName) {
        if (!cancelled) setSelectedMapFeatureId(null)
        return
      }
      const sourceGraph = activeGraphData ?? geospatialSelectionContext.graphData
      if (!sourceGraph) {
        if (!cancelled) setSelectedMapFeatureId(null)
        return
      }
      const [overlayModule, localPoiRuntime] = await Promise.all([
        import('@/features/geospatial/geospatialOverlayGraphData'),
        import('@/features/geospatial/localPoiDirectoryRuntime'),
      ])
      const mapGraphData = overlayModule.buildGeospatialOverlayGraphData({
        graphData: sourceGraph,
        graphRevision: geospatialSelectionContext.graphDataRevision,
        markdownText: geospatialSelectionContext.markdownDocumentText,
        sourceDocumentPath: geospatialSelectionContext.markdownDocumentName,
        sourceFiles: geospatialSelectionContext.sourceFiles,
      })
      const localPoiGraphData = localPoiRuntime.buildLocalPoiDirectoryGraphData(
        localPoiRuntime.getLocalPoiDirectoryDatasetSnapshot(),
      )
      const graphWithLocalPoi = localPoiGraphData
        ? overlayModule.mergeGraphDataUnique(mapGraphData, localPoiGraphData)
        : mapGraphData
      const overlayNode = findGraphNode(graphWithLocalPoi, selectedNodeId)
      if (!cancelled) setSelectedMapFeatureId(readSelectedGeoFeatureId(overlayNode))
    }
    void resolveSelection().catch(() => {
      if (!cancelled) setSelectedMapFeatureId(null)
    })
    return () => { cancelled = true }
  }, [
    activeGraphData,
    geospatialSelectionContext,
    gympgrphBridge.selectedNodeId,
    gympgrphBridge.selectionSource,
  ])

  return (
    <section className="h-full flex flex-col" aria-label="Geospatial panel">
      <section
        className={cn('grid gap-0.5 border-b px-3 py-2 text-xs', UI_THEME_TOKENS.panel.border, UI_THEME_TOKENS.panel.bg)}
        aria-label="Selected XR environment"
        data-kg-geo-xr-environment={selectedEnvironment.id}
        data-kg-geo-xr-environment-source="xr-motion-reference-runtime"
      >
        <span className={UI_THEME_TOKENS.text.tertiary}>XR environment</span>
        <strong className="text-xs">{selectedEnvironment.label}</strong>
        <span className={UI_THEME_TOKENS.text.secondary}>
          {selectedEnvironment.environmentKind} · {selectedEnvironment.sizeMeters.join(' × ')} m · local authored stage
        </span>
        {selectedEnvironment.geospatialContext?.purpose === 'regional-viewport-only' ? (
          <span className={UI_THEME_TOKENS.text.tertiary} data-kg-geo-xr-context="regional-viewport-only">
            {selectedEnvironment.geospatialContext.label} · local blockout preview only · no shot or structure geotags
          </span>
        ) : null}
      </section>
      {geospatialModeEnabled ? (
        <ErrorBoundary>
          <React.Suspense
            fallback={
              <section className={`p-3 text-xs ${UI_THEME_TOKENS.text.secondary}`}>
                Loading geospatial panel...
              </section>
            }
          >
            <section className={cn('min-h-0 flex-1', UI_RESPONSIVE_FLOATING_PANEL_SCROLL_CLASSNAME)}>
              <NearbyPlacesPanelLazy
                onSelectMapFeature={selectActiveMapFeature}
                selectedMapFeatureId={selectedMapFeatureId}
                selectionSource={gympgrphBridge.selectionSource}
              />
              <GeospatialPanelHostLazy
                active
                enhancedLayerCatalog={<EnhancedLayerCatalogPanel />}
                panelTypography={panelTypography}
                renderTypeIcon={renderGeospatialTypeIcon}
                snapshot={{
                  graphData: activeGraphData,
                  zoomState: gympgrphBridge.zoomState,
                  canvasRenderMode: gympgrphBridge.canvasRenderMode,
                  selectedNodeId: gympgrphBridge.selectedNodeId,
                  selectedNodeIds: gympgrphBridge.selectedNodeIds,
                  selectedEdgeId: gympgrphBridge.selectedEdgeId,
                }}
                handlers={{
                  selectNode: gympgrphBridge.selectNode,
                  selectEdge: gympgrphBridge.selectEdge,
                  setSelectionSource: gympgrphBridge.setSelectionSource,
                  requestZoom: gympgrphBridge.requestZoom,
                  requestThreeCamera: gympgrphBridge.requestThreeCamera,
                  pushUiToast: gympgrphBridge.pushUiToast,
                  upsertUiToast: gympgrphBridge.upsertUiToast,
                  dismissUiToast: gympgrphBridge.dismissUiToast,
                }}
              />
            </section>
          </React.Suspense>
        </ErrorBoundary>
      ) : (
        <section className="flex min-h-0 flex-1 flex-col items-start justify-center gap-3 p-3">
          <p className={cn('text-sm', UI_THEME_TOKENS.text.secondary)}>
            {isEnablingGeospatial
              ? 'Enabling Geospatial Mode...'
              : 'Enable Geospatial Mode to view this panel.'}
          </p>
          <button
            type="button"
            className={cn('App-toolbar__btn', UI_THEME_TOKENS.button.text, UI_THEME_TOKENS.button.hoverBg)}
            onClick={onEnableGeospatial}
            disabled={isEnablingGeospatial}
          >
            {isEnablingGeospatial ? 'Enabling Geo...' : 'Enable Geospatial Mode'}
          </button>
          {geospatialEnableError ? (
            <p className={cn('text-xs', UI_THEME_TOKENS.text.secondary)}>{geospatialEnableError}</p>
          ) : null}
        </section>
      )}
    </section>
  )
})
