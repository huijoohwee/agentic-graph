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

const GeospatialPanelHostLazy = React.lazy(async (): Promise<{ default: React.ComponentType<GeospatialPanelHostProps> }> => {
  const module = (await import('gympgrph')) as unknown as Record<string, unknown>
  const panelHost = module.GeospatialPanelHost as unknown
  if (!panelHost) return { default: MissingGeospatialPanelHost }
  return { default: panelHost as React.ComponentType<GeospatialPanelHostProps> }
})

const NearbyPlacesPanelLazy = React.lazy(() => import('@/features/maps/NearbyPlacesPanel'))

const readMapFeatureId = (node: unknown): string | null => {
  if (!node || typeof node !== 'object') return null
  const properties = (node as { properties?: unknown }).properties
  if (!properties || typeof properties !== 'object' || Array.isArray(properties)) return null
  const id = String((properties as Record<string, unknown>).kgSourceFeatureId ?? '').trim()
  return id || null
}

const findMapFeatureNode = (graphData: unknown, featureId: string): Record<string, unknown> | null => {
  if (!graphData || typeof graphData !== 'object') return null
  const nodes = (graphData as { nodes?: unknown }).nodes
  if (!Array.isArray(nodes)) return null
  for (const node of nodes) {
    if (!node || typeof node !== 'object') continue
    const record = node as Record<string, unknown>
    const properties = record.properties && typeof record.properties === 'object'
      ? record.properties as Record<string, unknown>
      : {}
    if (String(properties.kgSourceFeatureId ?? properties.id ?? properties.poi_id ?? properties.poiId ?? '').trim() === featureId) {
      return record
    }
  }
  return null
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
  const geospatialSelectionContext = useGraphStore(useShallow(state => ({
    markdownDocumentName: String(state.markdownDocumentName || ''),
    markdownDocumentText: String(state.markdownDocumentText || ''),
    sourceFiles: state.sourceFiles,
    graphDataRevision: state.graphDataRevision || 0,
  })))
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
  const selectActiveMapFeature = React.useCallback(async (featureId: string): Promise<boolean> => {
    const generation = ++mapFeatureSelectionGenerationRef.current
    let targetNode = findMapFeatureNode(activeGraphData, featureId)
    if (!targetNode) {
      const [overlayModule, localPoiRuntime] = await Promise.all([
        import('@/features/geospatial/geospatialOverlayGraphData'),
        import('@/features/geospatial/localPoiDirectoryRuntime'),
      ])
      if (generation !== mapFeatureSelectionGenerationRef.current) return false
      const mapGraphData = overlayModule.buildGeospatialOverlayGraphData({
        graphData: activeGraphData,
        graphRevision: geospatialSelectionContext.graphDataRevision,
        markdownText: geospatialSelectionContext.markdownDocumentText,
        sourceDocumentPath: geospatialSelectionContext.markdownDocumentName,
        sourceFiles: geospatialSelectionContext.sourceFiles,
      })
      const localPoiGraphData = localPoiRuntime.buildLocalPoiDirectoryGraphData(
        localPoiRuntime.getLocalPoiDirectoryDatasetSnapshot(),
      )
      targetNode = findMapFeatureNode(localPoiGraphData
        ? overlayModule.mergeGraphDataUnique(mapGraphData, localPoiGraphData)
        : mapGraphData, featureId)
    }
    if (generation !== mapFeatureSelectionGenerationRef.current || !targetNode?.id) return false
    gympgrphBridge.setSelectionSource('toolbar')
    gympgrphBridge.selectNode(String(targetNode.id))
    return true
  }, [activeGraphData, geospatialSelectionContext, gympgrphBridge.selectNode, gympgrphBridge.setSelectionSource])

  React.useEffect(() => {
    let cancelled = false
    const selectedNodeId = String(gympgrphBridge.selectedNodeId || '').trim()
    if (!selectedNodeId) {
      setSelectedMapFeatureId(null)
      return () => { cancelled = true }
    }
    const activeNode = Array.isArray(activeGraphData?.nodes)
      ? activeGraphData.nodes.find(node => String(node?.id || '') === selectedNodeId)
      : null
    const directFeatureId = readMapFeatureId(activeNode)
    if (directFeatureId) {
      setSelectedMapFeatureId(directFeatureId)
      return () => { cancelled = true }
    }
    const resolveSelection = async () => {
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
      const localPoiGraphData = localPoiRuntime.buildLocalPoiDirectoryGraphData(
        localPoiRuntime.getLocalPoiDirectoryDatasetSnapshot(),
      )
      const graphWithLocalPoi = localPoiGraphData
        ? overlayModule.mergeGraphDataUnique(mapGraphData, localPoiGraphData)
        : mapGraphData
      const selectedNode = Array.isArray(graphWithLocalPoi.nodes)
        ? graphWithLocalPoi.nodes.find(node => String(node?.id || '') === selectedNodeId)
        : null
      if (!cancelled) setSelectedMapFeatureId(readMapFeatureId(selectedNode))
    }
    void resolveSelection().catch(() => {
      if (!cancelled) setSelectedMapFeatureId(null)
    })
    return () => { cancelled = true }
  }, [activeGraphData, geospatialSelectionContext, gympgrphBridge.selectedNodeId])
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
