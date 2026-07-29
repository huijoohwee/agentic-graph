import React from 'react'
import { useShallow } from 'zustand/react/shallow'
import type { FlightGeoOverlayPresentation } from 'gympgrph'
import type { GraphData } from '@/lib/graph/types'
import type { ViewportControlsPreset } from '@/lib/config.viewport-controls'
import { useGraphStore } from '@/hooks/useGraphStore'
import { deriveSceneDisplayGraph } from '@/lib/scene/sceneDerivation'
import { buildGeospatialOverlayGraphData } from '@/features/geospatial/geospatialOverlayGraphData'
import {
  buildGrabMapsPoiRichMediaSrcDoc,
  publishGrabMapsPoiRichMediaPreview,
  resolveGrabMapsPoiRichMediaPanelNodeId,
  type GrabMapsPoiRichMediaDetail,
} from '@/features/geospatial/grabMapsPoiRichMedia'
import {
  normalizeGeoPoiRichMediaProperties,
  resolveGeoPoiAddressFromProperties,
  resolveGeoPoiCategoryFromProperties,
} from 'grph-shared/geospatial/poiRichMedia'
import { hashScopedStringArraySignature } from '@/lib/hash/signature'
import { createId } from '@/lib/id'
import { resolveGraphNodeByCanonicalId } from '@/lib/graph/canonicalNodeIds'
import { buildRichMediaPanelNode } from '@/lib/render/richMediaPanelNode'
import { buildSourceFilesGeospatialSelectionSignature } from '@/features/source-files/sourceFilesSignatures'
import { useCanvasAppliedMarkdownDocument } from '@/features/canvas/useCanvasAppliedMarkdownDocument'
import {
  isFlightSimHydrationPending,
  readFlightSimSnapshot,
  readFlightSimSpatialProfile,
  subscribeFlightSimPresentation,
} from '@/features/game-flight-sim/flightSimRuntime'
import {
  claimFlightSimReadyPresenter,
  completeFlightSimMapLibreReadyFrame,
  readCurrentFlightSimReadyFrameRequestId,
} from '@/features/game-flight-sim/flightSimDeadlineRuntime'
import {
  completeFlightSimStagePreparation,
  readCurrentFlightSimStagePreparationRequest,
} from '@/features/game-flight-sim/flightSimStagePreparationRuntime'
import {
  projectFlightSimTimelineCameraToGeospatial,
  projectFlightSimToGeospatialOverlay,
} from '@/features/game-flight-sim/flightSimGeospatialProjection'
import {
  projectXrEnvironmentToFlightGeo,
} from '@/features/game-flight-sim/flightSimGeoEnvironmentProjection'
import {
  claimFlightGeoOverlayPublisherLease,
} from '@/features/game-flight-sim/flightGeoOverlayPublisherLease'
import {
  readFlightSimCameraSnapshot,
  subscribeFlightSimCamera,
} from '@/features/game-flight-sim/flightSimCameraRuntime'
import {
  readFlightSimTrainingSnapshot,
  subscribeFlightSimTrainingSnapshot,
} from '@/features/game-flight-sim/flightSimTrainingRuntime'
import {
  readXrNativeControllerCamera,
  subscribeXrNativeControllerCamera,
} from '@/features/three/xrNativeControllerCameraRuntime'
import {
  sampleXrMotionReferenceCameraPose,
} from '@/features/three/xrMotionReferenceModel'
import {
  readXrMotionReferenceRuntime,
  subscribeXrMotionReferenceRuntime,
} from '@/features/three/xrMotionReferenceRuntime'

const EMPTY_STRING_ARRAY: string[] = []
const EMPTY_OPEN_WIDGETS_BY_RENDERER: Record<string, string[]> = {}

type GeospatialOverlayHostProps = {
  active?: boolean
  snapshot?: unknown
  handlers?: unknown
  onFlightOverlayPresented?: (
    presentation: FlightGeoOverlayPresentation,
  ) => void
}

type GympgrphStoreState = {
  setGeospatialAutoFitEnabled?: (enabled: boolean) => void
}

type GympgrphModule = {
  clearFlightGeoOverlay?: () => void
  setFlightGeoOverlay?: (overlay: ReturnType<typeof projectFlightSimToGeospatialOverlay>) => void
  useGympgrphStore?: { getState?: () => GympgrphStoreState }
  requestGeospatialFitToData?: () => void
  requestGeospatialFitToSelection?: () => void
  GeospatialOverlayHost?: React.ComponentType<GeospatialOverlayHostProps>
}

export type CanvasViewportGeospatialOverlayProps = {
  active: boolean
  composedWithXr: boolean
  geospatialModeEnabled: boolean
  graphData: GraphData
  storyboardWidgetPanelsActive: boolean
}

const MissingGeospatialOverlayHost = React.memo(function MissingGeospatialOverlayHost(_props: GeospatialOverlayHostProps) {
  return (
    <section className="absolute inset-0 flex items-center justify-center text-xs text-[color:var(--kg-text-primary)] bg-[color:var(--kg-panel-bg)]/70 dark:bg-black/40">
      Geospatial overlay unavailable
    </section>
  )
})

let gympgrphModulePromise: Promise<GympgrphModule> | null = null

const loadGympgrphModule = (): Promise<GympgrphModule> => {
  if (!gympgrphModulePromise) {
    gympgrphModulePromise = import('gympgrph')
      .then(mod => mod as unknown as GympgrphModule)
      .catch(err => {
        gympgrphModulePromise = null
        throw err
      })
  }
  return gympgrphModulePromise
}

const GeospatialOverlayHostLazy = React.lazy(async (): Promise<{ default: React.ComponentType<GeospatialOverlayHostProps> }> => {
  const m = await loadGympgrphModule()
  const c = m.GeospatialOverlayHost as unknown
  if (!c) return { default: MissingGeospatialOverlayHost }
  return { default: c as React.ComponentType<GeospatialOverlayHostProps> }
})

export const CanvasViewportGeospatialOverlay = React.memo(function CanvasViewportGeospatialOverlay(
  props: CanvasViewportGeospatialOverlayProps,
) {
  const { active, composedWithXr, geospatialModeEnabled, graphData, storyboardWidgetPanelsActive } = props
  const gympgrphBridge = useGraphStore(
    useShallow(s => ({
      zoomState: s.zoomState,
      canvasRenderMode: s.canvasRenderMode,
      viewportControlsPreset: s.viewportControlsPreset as ViewportControlsPreset,
      selectedNodeId: s.selectedNodeId,
      selectedNodeIds: s.selectedNodeIds,
      selectedEdgeId: s.selectedEdgeId,
      openWidgetNodeIds: s.openWidgetNodeIds ?? EMPTY_STRING_ARRAY,
      openWidgetNodeIdsByRenderer: s.openWidgetNodeIdsByRenderer ?? EMPTY_OPEN_WIDGETS_BY_RENDERER,
      updateOpenWidgetNodeIds: s.updateOpenWidgetNodeIds,
      selectNode: s.selectNode,
      selectEdge: s.selectEdge,
      setSelectionSource: s.setSelectionSource,
      requestZoom: s.requestZoom,
      requestThreeCamera: s.requestThreeCamera,
      updateNode: s.updateNode,
      addNode: s.addNode,
      pushUiToast: s.pushUiToast,
      upsertUiToast: s.upsertUiToast,
      dismissUiToast: s.dismissUiToast,
    })),
  )
  const {
    fitToScreenMode,
    zoomToSelectionMode,
    viewPinned,
    selectedNodeId,
    selectedNodeIds,
    selectedEdgeId,
    markdownDocumentName,
    markdownDocumentSourceUrl,
    markdownDocumentText,
    markdownDocumentApplyViewPreset,
    sourceFiles,
  } = useGraphStore(
    useShallow(s => ({
      fitToScreenMode: s.fitToScreenMode === true,
      zoomToSelectionMode: s.zoomToSelectionMode === true,
      viewPinned: s.viewPinned === true,
      selectedNodeId: s.selectedNodeId,
      selectedNodeIds: s.selectedNodeIds,
      selectedEdgeId: s.selectedEdgeId,
      markdownDocumentName: s.markdownDocumentName,
      markdownDocumentSourceUrl: s.markdownDocumentSourceUrl,
      markdownDocumentText: s.markdownDocumentText,
      markdownDocumentApplyViewPreset: s.markdownDocumentApplyViewPreset,
      sourceFiles: s.sourceFiles,
    })),
  )
  const graphDataRevision = useGraphStore(s => s.graphDataRevision || 0)
  const canvasMarkdownDocument = useCanvasAppliedMarkdownDocument({
    name: markdownDocumentName,
    sourceUrl: markdownDocumentSourceUrl,
    text: markdownDocumentText,
    applyViewPreset: markdownDocumentApplyViewPreset !== false,
  })
  const sourceFilesGeospatialSelectionSignature = React.useMemo(
    () => buildSourceFilesGeospatialSelectionSignature(sourceFiles),
    [sourceFiles],
  )
  const geospatialSourceFiles = React.useMemo(() => sourceFiles, [sourceFilesGeospatialSelectionSignature])

  const geoGraphLastRef = React.useRef<GraphData>(graphData)
  const geospatialGraphData = React.useMemo(() => {
    if (!active) return geoGraphLastRef.current
    const derived = deriveSceneDisplayGraph({ graphData })?.displayGraphData || null
    const base = (derived || graphData) as GraphData
    return buildGeospatialOverlayGraphData({
      graphData: base,
      graphRevision: graphDataRevision,
      markdownText: canvasMarkdownDocument.text,
      sourceDocumentPath: canvasMarkdownDocument.name,
      sourceFiles: geospatialSourceFiles,
    })
  }, [active, canvasMarkdownDocument.name, canvasMarkdownDocument.text, geospatialSourceFiles, graphData, graphDataRevision])

  React.useEffect(() => {
    if (!active) return
    geoGraphLastRef.current = geospatialGraphData
  }, [active, geospatialGraphData])

  const snapshot = React.useMemo(
    () => ({
      graphData: geospatialGraphData,
      graphRevision: graphDataRevision,
      zoomState: gympgrphBridge.zoomState,
      canvasRenderMode: gympgrphBridge.canvasRenderMode,
      viewportControlsPreset: gympgrphBridge.viewportControlsPreset,
      selectedNodeId: gympgrphBridge.selectedNodeId,
      selectedNodeIds: gympgrphBridge.selectedNodeIds,
      selectedEdgeId: gympgrphBridge.selectedEdgeId,
      geospatialPanelNodeIds: storyboardWidgetPanelsActive ? gympgrphBridge.openWidgetNodeIds : [],
    }),
    [
      geospatialGraphData,
      graphDataRevision,
      gympgrphBridge.canvasRenderMode,
      gympgrphBridge.openWidgetNodeIds,
      gympgrphBridge.selectedEdgeId,
      gympgrphBridge.selectedNodeId,
      gympgrphBridge.selectedNodeIds,
      storyboardWidgetPanelsActive,
      gympgrphBridge.viewportControlsPreset,
      gympgrphBridge.zoomState,
    ],
  )

  const renderPoiInRichMediaPanel = React.useCallback((detail: GrabMapsPoiRichMediaDetail): boolean => {
    const poiProperties = normalizeGeoPoiRichMediaProperties(detail.properties)
    const poiAddress = String(detail.address || '').trim() || resolveGeoPoiAddressFromProperties(poiProperties)
    const poiCategory = String(detail.category || '').trim() || resolveGeoPoiCategoryFromProperties(poiProperties)
    const normalizedDetail = { ...detail, address: poiAddress, category: poiCategory, properties: poiProperties }
    const srcDoc = buildGrabMapsPoiRichMediaSrcDoc(normalizedDetail)
    const storyboardWidgetOpenWidgetNodeIds = Array.isArray(gympgrphBridge.openWidgetNodeIdsByRenderer?.storyboard)
      ? gympgrphBridge.openWidgetNodeIdsByRenderer.storyboard
      : []
    let targetNodeId = resolveGrabMapsPoiRichMediaPanelNodeId({
      graphData,
      selectedNodeId: gympgrphBridge.selectedNodeId,
      selectedNodeIds: gympgrphBridge.selectedNodeIds,
      openWidgetNodeIds: gympgrphBridge.openWidgetNodeIds,
      storyboardWidgetOpenWidgetNodeIds,
    })
    if (!targetNodeId) {
      const candidateIds = [
        String(gympgrphBridge.selectedNodeId || '').trim(),
        ...(Array.isArray(gympgrphBridge.selectedNodeIds) ? gympgrphBridge.selectedNodeIds : []).map(v => String(v || '').trim()),
      ].filter(Boolean)
      let anchorNode = null
      for (let i = 0; i < candidateIds.length; i += 1) {
        const resolved = resolveGraphNodeByCanonicalId(graphData, candidateIds[i]) || null
        if (!resolved) continue
        if (Number.isFinite(resolved.x) && Number.isFinite(resolved.y)) {
          anchorNode = resolved
          break
        }
        if (!anchorNode) anchorNode = resolved
      }
      const nextId = createId('rich-media-panel')
      gympgrphBridge.addNode(buildRichMediaPanelNode({ id: nextId, anchor: anchorNode }))
      targetNodeId = nextId
    }
    publishGrabMapsPoiRichMediaPreview({
      targetNodeId,
      srcDoc,
      label: String(detail.label || '').trim() || 'POI',
    })
    const panelNodeId = targetNodeId
    gympgrphBridge.updateNode(panelNodeId, {
      properties: {
        richMediaActiveTab: 'poi',
        freezeConnectedOutput: true,
        richMediaPoiLabel: String(detail.label || '').trim() || 'POI',
        richMediaPoiAddress: poiAddress,
        richMediaPoiCategory: poiCategory,
        richMediaPoiProperties: poiProperties,
        richMediaPoiLat: Number.isFinite(Number(detail.lat)) ? Number(detail.lat) : null,
        richMediaPoiLng: Number.isFinite(Number(detail.lng)) ? Number(detail.lng) : null,
        richMediaPoiCoordinates:
          Number.isFinite(Number(detail.lat)) && Number.isFinite(Number(detail.lng))
            ? `${Number(detail.lat).toFixed(6)}, ${Number(detail.lng).toFixed(6)}`
            : '',
        output: '',
        outputSrcDoc: srcDoc,
      },
    })
    gympgrphBridge.updateOpenWidgetNodeIds(prev => (prev.includes(panelNodeId) ? prev : [...prev, panelNodeId]))
    gympgrphBridge.selectNode(panelNodeId)
    return true
  }, [
    graphData,
    gympgrphBridge,
  ])

  const handlers = React.useMemo(
    () => ({
      selectNode: gympgrphBridge.selectNode,
      selectEdge: gympgrphBridge.selectEdge,
      setSelectionSource: gympgrphBridge.setSelectionSource,
      requestZoom: gympgrphBridge.requestZoom,
      requestThreeCamera: gympgrphBridge.requestThreeCamera,
      renderPoiInRichMediaPanel,
      pushUiToast: gympgrphBridge.pushUiToast,
      upsertUiToast: gympgrphBridge.upsertUiToast,
      dismissUiToast: gympgrphBridge.dismissUiToast,
    }),
    [
      gympgrphBridge.dismissUiToast,
      gympgrphBridge.pushUiToast,
      gympgrphBridge.requestThreeCamera,
      gympgrphBridge.requestZoom,
      renderPoiInRichMediaPanel,
      gympgrphBridge.selectEdge,
      gympgrphBridge.selectNode,
      gympgrphBridge.setSelectionSource,
      gympgrphBridge.upsertUiToast,
    ],
  )

  React.useEffect(() => {
    if (!geospatialModeEnabled) return
    void loadGympgrphModule()
      .then(m => {
        const st = m.useGympgrphStore?.getState?.()
        const setAutoFit = st && typeof st.setGeospatialAutoFitEnabled === 'function' ? st.setGeospatialAutoFitEnabled : null
        if (!setAutoFit) return
        setAutoFit(fitToScreenMode && !viewPinned)
      })
      .catch(() => void 0)
  }, [fitToScreenMode, geospatialModeEnabled, viewPinned])

  const lastGeoFitToScreenEnabledRef = React.useRef<boolean>(false)
  React.useEffect(() => {
    if (!geospatialModeEnabled) return
    const prev = lastGeoFitToScreenEnabledRef.current
    lastGeoFitToScreenEnabledRef.current = fitToScreenMode && !viewPinned
    if (prev || !(fitToScreenMode && !viewPinned)) return
    void loadGympgrphModule()
      .then(m => {
        m.requestGeospatialFitToData?.()
      })
      .catch(() => void 0)
  }, [fitToScreenMode, geospatialModeEnabled, viewPinned])

  const lastGeoSelectionFitKeyRef = React.useRef<string>('')
  React.useEffect(() => {
    if (!geospatialModeEnabled) return
    if (viewPinned) return
    if (!zoomToSelectionMode) {
      lastGeoSelectionFitKeyRef.current = ''
      return
    }
    const ids = Array.isArray(selectedNodeIds) && selectedNodeIds.length > 0 ? selectedNodeIds : selectedNodeId ? [selectedNodeId] : []
    const key = `${hashScopedStringArraySignature('geo-fit-selection', ids, { unique: true, sort: true })}:${String(selectedEdgeId || '')}`
    if (!ids.length) return
    if (key === lastGeoSelectionFitKeyRef.current) return
    lastGeoSelectionFitKeyRef.current = key
    void loadGympgrphModule()
      .then(m => {
        m.requestGeospatialFitToSelection?.()
      })
      .catch(() => void 0)
  }, [geospatialModeEnabled, selectedEdgeId, selectedNodeId, selectedNodeIds, viewPinned, zoomToSelectionMode])

  React.useLayoutEffect(() => {
    if (!active || !composedWithXr) return
    return claimFlightSimReadyPresenter('maplibre')
  }, [active, composedWithXr])

  React.useEffect(() => {
    const publisherLease = claimFlightGeoOverlayPublisherLease()
    let disposed = false
    let unsubscribeFlight = () => void 0
    let unsubscribeFlightCamera = () => void 0
    let unsubscribeFlightTraining = () => void 0
    let unsubscribeCameraSource = () => void 0
    let unsubscribeTimelineRuntime = () => void 0
    let unsubscribeTimelineTransport = () => void 0
    void loadGympgrphModule()
      .then(module => {
        if (disposed || !publisherLease.isCurrent()) return
        const publish = () => {
          if (!publisherLease.isCurrent()) return
          const flight = readFlightSimSnapshot()
          if (!active || !composedWithXr || !flight.active) {
            module.clearFlightGeoOverlay?.()
            return
          }
          const spatialProfile = readFlightSimSpatialProfile()
          const motionRuntime = readXrMotionReferenceRuntime()
          const timelinePose = useGraphStore.getState().timelineTransportPlaying
            ? sampleXrMotionReferenceCameraPose(
                motionRuntime.plan.camera,
                motionRuntime.playheadSeconds,
                motionRuntime.plan.cast,
                motionRuntime.plan.subjects,
              )
            : null
          module.setFlightGeoOverlay?.(
            projectFlightSimToGeospatialOverlay(
              flight,
              spatialProfile,
              {
                source: readXrNativeControllerCamera().mode,
                timeline: timelinePose
                  ? projectFlightSimTimelineCameraToGeospatial(
                      timelinePose,
                      spatialProfile,
                      motionRuntime.playheadSeconds,
                    )
                  : null,
                view: readFlightSimCameraSnapshot().view,
              },
              readFlightSimTrainingSnapshot().night,
              readCurrentFlightSimReadyFrameRequestId(),
              projectXrEnvironmentToFlightGeo(
                motionRuntime.plan,
                spatialProfile,
              ),
            ),
          )
        }
        if (active && composedWithXr) {
          unsubscribeFlight = subscribeFlightSimPresentation(
            'maplibre',
            publish,
          )
        }
        unsubscribeFlightCamera = subscribeFlightSimCamera(publish)
        unsubscribeFlightTraining = subscribeFlightSimTrainingSnapshot(publish)
        unsubscribeCameraSource = subscribeXrNativeControllerCamera(publish)
        unsubscribeTimelineRuntime = subscribeXrMotionReferenceRuntime(publish)
        unsubscribeTimelineTransport = useGraphStore.subscribe(
          (state, previousState) => {
            if (
              state.timelineTransportPlaying
              !== previousState.timelineTransportPlaying
            ) publish()
          },
        )
        publish()
      })
      .catch(() => void 0)
    return () => {
      disposed = true
      unsubscribeFlight()
      unsubscribeFlightCamera()
      unsubscribeFlightTraining()
      unsubscribeCameraSource()
      unsubscribeTimelineRuntime()
      unsubscribeTimelineTransport()
      void loadGympgrphModule()
        .then(module => {
          if (!publisherLease.isCurrent()) return
          module.clearFlightGeoOverlay?.()
        })
        .catch(() => void 0)
    }
  }, [active, composedWithXr])

  const handleFlightOverlayPresented = React.useCallback((
    presentation: FlightGeoOverlayPresentation,
  ) => {
    if (!active || !composedWithXr) return
    const flight = readFlightSimSnapshot()
    if (
      !flight.active
      || readFlightSimSpatialProfile().id !== presentation.profileId
      || flight.phase !== presentation.phase
      || flight.runId !== presentation.runId
      || flight.tick !== presentation.tick
      || flight.runtimeError
    ) return
    if (presentation.phase === 'stopped') {
      const requestId = readCurrentFlightSimStagePreparationRequest()
      if (requestId !== null && !isFlightSimHydrationPending()) {
        // MapLibre fires `render` after its painter commits this exact overlay,
        // while the matching HUD layout seals the other preparation facet.
        completeFlightSimStagePreparation(requestId, {
          framePresented: true,
          revision: flight.revision,
        })
      }
      return
    }
    if (
      presentation.phase === 'ready'
      && presentation.tick === 0
      && presentation.runId > 0
      && presentation.readyFrameRequestId !== null
    ) {
      completeFlightSimMapLibreReadyFrame(
        presentation.readyFrameRequestId,
        presentation.runId,
        presentation.tick,
      )
    }
  }, [active, composedWithXr])

  return (
    <section
      className={`absolute inset-0 ${composedWithXr ? 'z-[5] pointer-events-none' : 'z-[20] pointer-events-auto'} ${active ? 'opacity-100' : 'pointer-events-none opacity-0'}`}
      data-kg-geo-xr-layer={composedWithXr ? 'geo-background' : undefined}
    >
      <GeospatialOverlayHostLazy
        active={active}
        snapshot={snapshot}
        handlers={handlers}
        onFlightOverlayPresented={handleFlightOverlayPresented}
      />
    </section>
  )
})
