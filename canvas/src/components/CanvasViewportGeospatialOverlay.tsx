import React from 'react'
import { useShallow } from 'zustand/react/shallow'
import {
  deriveGameModeCityMapFrame,
  deriveXrEnvironmentMapFrame,
  gameModeGeoOverlayFeatureCollection,
} from 'gympgrph'
import type {
  CityGeoOverlaySnapshot,
  FlightGeoOverlayPresentation,
  GeospatialPresentationCameraOwner,
  MapLibreCanvasSemanticOwner,
} from 'gympgrph'
import type { GraphData } from '@/lib/graph/types'
import type { ViewportControlsPreset } from '@/lib/config.viewport-controls'
import { useGraphStore } from '@/hooks/useGraphStore'
import { deriveSceneDisplayGraph } from '@/lib/scene/sceneDerivation'
import { buildGeospatialOverlayGraphData } from '@/features/geospatial/geospatialOverlayGraphData'
import {
  resolveGeoXrGameplayPresentationOwner,
  type GeoXrOverlayStoreModule,
} from '@/features/geospatial/geoXrFlightOverlayComposition'
import { useGeoXrOverlayPublisher } from '@/features/geospatial/useGeoXrOverlayPublisher'
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
import { readSourceGeospatialSnapshot, subscribeSourceGeospatial, useSourceGeospatialReview, sourceGeospatialReviewBounds } from '@/features/evidence-analysis/geospatialSource'
import { useCanvasAppliedMarkdownDocument } from '@/features/canvas/useCanvasAppliedMarkdownDocument'
import {
  isFlightSimHydrationPending,
  readFlightSimSnapshot,
  readFlightSimSpatialProfile,
  subscribeFlightSimSnapshot,
} from '@/features/game-flight-sim/flightSimRuntime'
import {
  readGameFpsRunId,
  readGameFpsSnapshot,
  subscribeGameFpsSnapshot,
} from '@/features/game-fps/gameFpsRuntime'
import {
  readGameModeSnapshot,
  subscribeGameModeSnapshot,
} from '@/features/game-fps/gameModeRuntime'
import {
  readXrMotionReferenceRuntime,
  subscribeXrMotionReferenceRuntime,
} from '@/features/three/xrMotionReferenceRuntime'
import {
  controlXrSharedAssetControls,
  inspectXrSharedAssetControls,
} from '@/features/three/xrSharedAssetControlRuntime'
import {
  publishGeoXrSharedMediaProjection,
  readGeoXrSharedMediaProjection,
  retryGeoXrSharedMediaAssetFocus,
  subscribeGeoXrSharedMediaAssetFocus,
} from '@/features/three/geoXrSharedMediaProjectionRuntime'
import {
  claimFlightSimReadyPresenter,
  completeFlightSimMapLibreReadyFrame,
} from '@/features/game-flight-sim/flightSimDeadlineRuntime'
import {
  completeFlightSimStagePreparation,
  readCurrentFlightSimStagePreparationRequest,
} from '@/features/game-flight-sim/flightSimStagePreparationRuntime'
import { projectXrEnvironmentToFlightGeo } from '@/features/game-flight-sim/flightSimGeoEnvironmentProjection'
import {
  readFlightSimGeospatialBootstrapRequested,
  subscribeFlightSimGeospatialBootstrapRequest,
} from '@/features/game-flight-sim/flightSimSurfaceOpenLifecycle'
import {
  readCitySimSnapshot,
  selectCityParcel,
  setCitySimPlayerSelected,
  moveCitySimPlayerToCoordinate,
  subscribeCitySimSnapshot,
} from '@/features/game-city-sim/citySimRuntime'
import {
  projectCitySimGeographicProfile,
  projectCitySimToGeospatialOverlay,
} from '@/features/game-city-sim/citySimGeospatialProjection'
import {
  readImmersiveMediaSnapshot,
  subscribeImmersiveMediaSnapshot,
} from '@/features/immersive-media/immersiveMediaRuntime'
import { resolveXrMotionReferenceStage } from '@/features/three/xrSceneLibrary'
import { sampleXrMotionReferenceSubjectPlayback } from '@/features/three/xrMotionReferenceSubjectPlayback'
import { readActiveMapLibreMap, regionalPoiProfileBounds, SINGAPORE_FLIGHT_GEO_REFERENCE } from '@/lib/gympgrph/api'

const EMPTY_STRING_ARRAY: string[] = []
const EMPTY_OPEN_WIDGETS_BY_RENDERER: Record<string, string[]> = {}

type GeoXrMediaSelectionAsset = Readonly<{
  id: string
  label: string
  coordinate: readonly [number, number]
}>

type GeoXrMediaSelectionTarget = Readonly<{
  id: string
  label: string
  left: number
  top: number
}>

/**
 * Adds semantic selection targets over the existing shared XR meshes. These
 * buttons have no duplicate artwork: the canvas remains the single renderer,
 * while selection tools and keyboard users get a named control per asset.
 */
function GeoXrMediaSelectionTargets({
  active,
  assets,
  onSelect,
}: {
  active: boolean
  assets: readonly GeoXrMediaSelectionAsset[]
  onSelect: (targetId: string) => void
}) {
  const rootRef = React.useRef<HTMLElement | null>(null)
  const [targets, setTargets] = React.useState<readonly GeoXrMediaSelectionTarget[]>([])

  React.useEffect(() => {
    if (!active) {
      setTargets([])
      return
    }
    let disposed = false
    let attachedMap: any | null = null
    let interval: ReturnType<typeof setInterval> | null = null
    const updatePositions = () => {
      if (disposed) return
      const root = rootRef.current
      const map = attachedMap
      const mapCanvas = map?.getCanvas?.() as HTMLCanvasElement | undefined
      if (!root || !mapCanvas || typeof map?.project !== 'function') return
      const rootRect = root.getBoundingClientRect()
      const mapRect = mapCanvas.getBoundingClientRect()
      const next = assets.flatMap(asset => {
        try {
          const point = map.project(asset.coordinate)
          const left = mapRect.left - rootRect.left + Number(point?.x)
          const top = mapRect.top - rootRect.top + Number(point?.y)
          return Number.isFinite(left) && Number.isFinite(top) ? [{ id: asset.id, label: asset.label, left, top }] : []
        } catch {
          return []
        }
      })
      setTargets(previous => {
        if (previous.length === next.length && previous.every((target, index) => {
          const candidate = next[index]
          return target.id === candidate?.id
            && target.label === candidate?.label
            && Math.abs(target.left - Number(candidate?.left)) < 0.5
            && Math.abs(target.top - Number(candidate?.top)) < 0.5
        })) return previous
        return next
      })
    }
    const onMapChange = () => updatePositions()
    const updateMap = () => {
      if (disposed) return
      const nextMap = readActiveMapLibreMap()
      if (nextMap !== attachedMap) {
        if (attachedMap) {
          for (const eventName of ['load', 'move', 'zoom', 'rotate', 'pitch', 'resize', 'styledata']) {
            attachedMap.off?.(eventName, onMapChange)
          }
        }
        attachedMap = nextMap
        if (attachedMap) {
          for (const eventName of ['load', 'move', 'zoom', 'rotate', 'pitch', 'resize', 'styledata']) {
            attachedMap.on?.(eventName, onMapChange)
          }
        }
      }
      updatePositions()
      retryGeoXrSharedMediaAssetFocus()
    }
    interval = setInterval(updateMap, 500)
    updateMap()
    return () => {
      disposed = true
      if (interval) clearInterval(interval)
      if (attachedMap) {
        for (const eventName of ['load', 'move', 'zoom', 'rotate', 'pitch', 'resize', 'styledata']) {
          attachedMap.off?.(eventName, onMapChange)
        }
      }
    }
  }, [active, assets])

  if (!active) return null
  return (
    <nav
      ref={rootRef}
      className="pointer-events-none absolute inset-0 z-[2]"
      aria-label="Geo+XR shared Media assets"
      data-kg-geo-xr-media-selection-targets="1"
    >
      {targets.map(target => (
        <button
          key={target.id}
          type="button"
          className="pointer-events-auto absolute rounded-full border border-blue-500/30 bg-transparent focus-visible:border-blue-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500"
          style={{ left: target.left, top: target.top, width: 40, height: 40, transform: 'translate(-50%, -50%)' }}
          aria-label={`Select ${target.label} in Geo+XR and move the view to it`}
          title={`Select ${target.label} in Geo+XR`}
          data-kg-xr-geo-media-selection-target={target.id}
          onClick={event => {
            event.preventDefault()
            event.stopPropagation()
            onSelect(target.id)
          }}
        />
      ))}
    </nav>
  )
}

function readFlightSimActive(): boolean {
  return readFlightSimSnapshot().active
}

type GeospatialOverlayHostProps = {
  active?: boolean
  keyboardNavigationEnabled?: boolean
  gameplayPresentationOwner: GeospatialPresentationCameraOwner
  semanticMediaOwner?: MapLibreCanvasSemanticOwner | null
  snapshot?: unknown
  handlers?: unknown
  onFlightOverlayPresented?: (
    presentation: FlightGeoOverlayPresentation,
  ) => void
}

type GympgrphStoreState = {
  setGeospatialAutoFitEnabled?: (enabled: boolean) => void
}

type GympgrphModule = GeoXrOverlayStoreModule & {
  useGympgrphStore?: { getState?: () => GympgrphStoreState }
  requestGeospatialFitToBounds?: (bounds: readonly [number, number, number, number]) => void
  requestGeospatialFitToData?: () => void
  requestGeospatialFitToSelection?: () => void
  GeospatialOverlayHost?: React.ComponentType<GeospatialOverlayHostProps>
}

export type CanvasViewportGeospatialOverlayProps = {
  active: boolean
  composedWithXr: boolean
  geospatialModeEnabled: boolean
  graphData: GraphData
  semanticMediaOwner?: MapLibreCanvasSemanticOwner | null
  storyboardWidgetPanelsActive: boolean
  threeOverlayComposed: boolean
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
  const {
    active,
    composedWithXr,
    geospatialModeEnabled,
    graphData,
    semanticMediaOwner,
    storyboardWidgetPanelsActive,
    threeOverlayComposed,
  } = props
  const stableSemanticMediaOwner = React.useMemo(
    (): MapLibreCanvasSemanticOwner | null => {
      if (!semanticMediaOwner) return null
      return Object.freeze({
        captionId: semanticMediaOwner.captionId,
        label: semanticMediaOwner.label,
        selectionAttribute: Object.freeze({
          name: semanticMediaOwner.selectionAttribute.name,
          value: semanticMediaOwner.selectionAttribute.value,
        }),
      })
    },
    [
      semanticMediaOwner?.captionId,
      semanticMediaOwner?.label,
      semanticMediaOwner?.selectionAttribute.name,
      semanticMediaOwner?.selectionAttribute.value,
    ],
  )
  const flightBootstrapRequested = React.useSyncExternalStore(
    subscribeFlightSimGeospatialBootstrapRequest,
    readFlightSimGeospatialBootstrapRequested,
    readFlightSimGeospatialBootstrapRequested,
  )
  const flightSimActive = React.useSyncExternalStore(
    subscribeFlightSimSnapshot,
    readFlightSimActive,
    readFlightSimActive,
  )
  const citySimSnapshot = React.useSyncExternalStore(
    subscribeCitySimSnapshot,
    readCitySimSnapshot,
    readCitySimSnapshot,
  )
  const citySimActive = citySimSnapshot.active
  const gameModeActive = React.useSyncExternalStore(
    subscribeGameModeSnapshot,
    () => readGameModeSnapshot().active,
    () => readGameModeSnapshot().active,
  )
  const gameFpsSnapshot = React.useSyncExternalStore(
    subscribeGameFpsSnapshot,
    readGameFpsSnapshot,
    readGameFpsSnapshot,
  )
  const xrMotion = React.useSyncExternalStore(
    subscribeXrMotionReferenceRuntime,
    readXrMotionReferenceRuntime,
    readXrMotionReferenceRuntime,
  )
  const gameModeCityContext = React.useMemo<CityGeoOverlaySnapshot | null>(() => {
    if (
      !composedWithXr
      || !citySimSnapshot.city.regionalPoiProfileId.trim()
    ) return null
    try {
      const cityContext = projectCitySimToGeospatialOverlay({
        ...citySimSnapshot,
        active: true,
      })
      return Object.freeze({
        ...cityContext,
        selectedParcelId: null,
      })
    } catch {
      return null
    }
  }, [citySimSnapshot, composedWithXr])
  const cityMapFrame = React.useMemo(
    () => deriveGameModeCityMapFrame(gameModeCityContext),
    [gameModeCityContext],
  )
  const sharedMediaEnvironment = React.useMemo(() => {
    if (!composedWithXr) return null
    const stage = resolveXrMotionReferenceStage(xrMotion.plan.stageId)
    const stageBounds = stage.regionalPoiProfile
      ? regionalPoiProfileBounds(stage.regionalPoiProfile)
      : SINGAPORE_FLIGHT_GEO_REFERENCE.presentationBounds
    const anchor = cityMapFrame?.origin
      || (stage.regionalPoiProfile
        ? Object.freeze([
          (stageBounds[0][0] + stageBounds[1][0]) / 2,
          (stageBounds[0][1] + stageBounds[1][1]) / 2,
        ] as const)
        : SINGAPORE_FLIGHT_GEO_REFERENCE.anchor)
    const presentationBounds = cityMapFrame?.bounds || stageBounds
    try {
      const projected = projectXrEnvironmentToFlightGeo(
        xrMotion.plan,
        { anchor, presentationBounds },
        {
          fitLocalContentToPresentationBounds: true,
          includeSubjectSurfaces: false,
        },
      )
      if (!gameModeCityContext) return projected
      const surfaces = Object.freeze(projected.surfaces.filter(surface => surface.kind !== 'poi'))
      return Object.freeze({
        ...projected,
        revision: `${projected.revision}|city-pois-shared`,
        surfaces,
      })
    } catch {
      return null
    }
  }, [composedWithXr, gameModeCityContext, cityMapFrame, xrMotion.plan])
  const gameModeMapFrame = React.useMemo(
    () => deriveXrEnvironmentMapFrame(sharedMediaEnvironment, cityMapFrame),
    [cityMapFrame, sharedMediaEnvironment],
  )
  const gameModeGeoOverlay = React.useMemo(() => {
    if (!composedWithXr) return null
    const selectedAssetId = inspectXrSharedAssetControls().selectedTargetId
    return Object.freeze({
      active: true,
      gameplayActive: gameModeActive,
      phase: gameFpsSnapshot.phase,
      runId: readGameFpsRunId(),
      tick: gameFpsSnapshot.tick,
      mapFrame: gameModeMapFrame,
      cityContext: citySimActive ? gameModeCityContext : null,
      environment: sharedMediaEnvironment,
      player: Object.freeze({ x: gameFpsSnapshot.player.x, z: gameFpsSnapshot.player.z }),
      npcs: Object.freeze((gameModeActive ? gameFpsSnapshot.npcs : []).map(npc => Object.freeze({
        id: npc.id,
        x: npc.x,
        z: npc.z,
        health: npc.health,
        action: npc.action,
      }))),
      assets: Object.freeze(xrMotion.plan.subjects.map(subject => {
        const track = xrMotion.plan.cast.find(candidate => candidate.actorId === subject.id)
        const playback = sampleXrMotionReferenceSubjectPlayback(subject, track, xrMotion.playheadSeconds)
        return Object.freeze({
          id: subject.id,
          assetId: subject.assetId,
          category: subject.category,
          label: subject.label,
          color: subject.color,
          x: playback.position[0],
          z: playback.position[2],
          scale: subject.scale,
          selected: selectedAssetId === subject.id,
        })
      })),
    })
  }, [composedWithXr, citySimActive, gameModeActive, gameFpsSnapshot, gameModeMapFrame, gameModeCityContext, sharedMediaEnvironment, xrMotion.plan.cast, xrMotion.plan.subjects, xrMotion.playheadSeconds])
  const sharedMediaGeoProjection = React.useMemo(() => {
    const origin = gameModeGeoOverlay?.mapFrame?.origin
    if (!gameModeGeoOverlay || !origin || origin.length < 2) return []
    const collection = gameModeGeoOverlayFeatureCollection(gameModeGeoOverlay, {
      lng: Number(origin[0]),
      lat: Number(origin[1]),
    })
    return collection.features.flatMap(feature => {
      const properties = feature.properties
      const coordinate = feature.geometry.coordinates
      const id = String(properties.actorId || '').trim()
      const lng = Number(coordinate[0])
      const lat = Number(coordinate[1])
      if (properties.actorKind !== 'asset' || !id || !Number.isFinite(lng) || !Number.isFinite(lat)) return []
      return [Object.freeze({ id, coordinate: Object.freeze([lng, lat] as const) })]
    })
  }, [gameModeGeoOverlay])
  React.useEffect(() => {
    publishGeoXrSharedMediaProjection(
      sharedMediaGeoProjection,
      gameModeGeoOverlay?.mapFrame?.origin || null,
    )
  }, [gameModeGeoOverlay?.mapFrame?.origin, sharedMediaGeoProjection])
  const geoXrMediaSelectionAssets = React.useMemo(() => sharedMediaGeoProjection.map(asset => ({
    ...asset,
    label: xrMotion.plan.subjects.find(subject => subject.id === asset.id)?.label || asset.id,
  })), [sharedMediaGeoProjection, xrMotion.plan.subjects])
  React.useEffect(() => {
    if (!active || !composedWithXr) return
    return subscribeGeoXrSharedMediaAssetFocus(targetId => {
      const asset = readGeoXrSharedMediaProjection().assets.find(candidate => candidate.id === targetId)
      const map = readActiveMapLibreMap() as any
      if (!asset || !map || typeof map.easeTo !== 'function') return false
      const currentZoom = Number(map.getZoom?.())
      map.easeTo({
        center: asset.coordinate,
        zoom: Math.max(Number.isFinite(currentZoom) ? currentZoom : 0, 18),
        duration: 800,
        essential: true,
      })
      return true
    })
  }, [active, composedWithXr])
  const keyboardNavigationEnabled = React.useSyncExternalStore(
    subscribeImmersiveMediaSnapshot,
    () => readImmersiveMediaSnapshot().navigation.keyboardActions,
    () => readImmersiveMediaSnapshot().navigation.keyboardActions,
  )
  const sourceReview = useSourceGeospatialReview()
  const gameplayPresentationOwner = sourceReview ? null : resolveGeoXrGameplayPresentationOwner({
    cityActive: citySimActive,
    flightActive: flightSimActive,
    flightBootstrapRequested,
    gameModeActive,
  })
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

  const sourceGeospatial = React.useSyncExternalStore(subscribeSourceGeospatial, readSourceGeospatialSnapshot, () => null)
  const snapshot = React.useMemo(
    () => ({
      graphData: geospatialGraphData,
      sourceGeospatial,
      graphRevision: graphDataRevision,
      zoomState: gympgrphBridge.zoomState,
      canvasRenderMode: gympgrphBridge.canvasRenderMode,
      viewportControlsPreset: gympgrphBridge.viewportControlsPreset,
      selectedNodeId: gympgrphBridge.selectedNodeId,
      selectedNodeIds: gympgrphBridge.selectedNodeIds,
      selectedEdgeId: gympgrphBridge.selectedEdgeId,
      geospatialPanelNodeIds: storyboardWidgetPanelsActive ? gympgrphBridge.openWidgetNodeIds : [],
      gameModeGeoOverlay,
    }),
    [
      geospatialGraphData,
      sourceGeospatial,
      graphDataRevision,
      gympgrphBridge.canvasRenderMode,
      gympgrphBridge.openWidgetNodeIds,
      gympgrphBridge.selectedEdgeId,
      gympgrphBridge.selectedNodeId,
      gympgrphBridge.selectedNodeIds,
      storyboardWidgetPanelsActive,
      gympgrphBridge.viewportControlsPreset,
      gympgrphBridge.zoomState,
      gameModeGeoOverlay,
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

  const selectGameModeGeoActor = React.useCallback((targetId: string) => {
    const result = controlXrSharedAssetControls({ operation: 'select-target', targetId })
    gympgrphBridge.pushUiToast({
      id: `game-mode:map-target:${targetId}:${result.ok ? 'ok' : 'error'}`,
      kind: result.ok ? 'success' : 'error',
      message: result.message,
    })
    return result.ok
  }, [gympgrphBridge.pushUiToast])

  const handlers = React.useMemo(
    () => ({
      selectNode: gympgrphBridge.selectNode,
      selectEdge: gympgrphBridge.selectEdge,
      setSelectionSource: gympgrphBridge.setSelectionSource,
      requestZoom: gympgrphBridge.requestZoom,
      requestThreeCamera: gympgrphBridge.requestThreeCamera,
      selectCityParcel,
      selectGameModeGeoActor,
      setCityGameplayPlayerSelected: setCitySimPlayerSelected,
      moveCityGameplayPlayerToCoordinate: moveCitySimPlayerToCoordinate,
      renderPoiInRichMediaPanel,
      pushUiToast: gympgrphBridge.pushUiToast,
      upsertUiToast: gympgrphBridge.upsertUiToast,
      dismissUiToast: gympgrphBridge.dismissUiToast,
    }),
    [
      gympgrphBridge.dismissUiToast,
      moveCitySimPlayerToCoordinate,
      gympgrphBridge.pushUiToast,
      gympgrphBridge.requestThreeCamera,
      gympgrphBridge.requestZoom,
      renderPoiInRichMediaPanel,
      selectGameModeGeoActor,
      gympgrphBridge.selectEdge,
      gympgrphBridge.selectNode,
      selectCityParcel,
      setCitySimPlayerSelected,
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
    if (!active || !composedWithXr || !flightSimActive) return
    return claimFlightSimReadyPresenter('maplibre')
  }, [active, composedWithXr, flightSimActive])

  useGeoXrOverlayPublisher({
    active: active && !sourceReview,
    composedWithXr,
    loadOverlayModule: loadGympgrphModule,
  })

  // The existing composition owner releases gameplay before source review claims framing.
  // Keyed to source identity, never the moving UTC cursor, so playback preserves user pan/zoom.
  const reviewSourceKey = sourceReview ? sourceGeospatial?.sourceKey : null
  React.useEffect(() => {
    if (!active || !sourceReview) return
    let disposed = false
    void loadGympgrphModule().then(module => {
      if (disposed) return
      module.clearFlightGeoOverlay()
      module.clearCityGeoOverlay()
      const bounds = sourceGeospatialReviewBounds(readSourceGeospatialSnapshot())
      if (bounds) module.requestGeospatialFitToBounds?.(bounds)
    })
    return () => { disposed = true }
  }, [active, sourceReview, reviewSourceKey])

  const handleFlightOverlayPresented = React.useCallback((
    presentation: FlightGeoOverlayPresentation,
  ) => {
    if (
      !active
      || !composedWithXr
      || presentation.presentationOwner !== 'flight'
    ) return
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
      className={`absolute inset-0 ${threeOverlayComposed ? 'z-[5] pointer-events-none' : 'z-[20] pointer-events-auto'} ${active ? 'opacity-100' : 'pointer-events-none opacity-0'}`}
      data-kg-geo-xr-layer={composedWithXr ? 'geo-background' : undefined}
      data-kg-geo-xr-surface={active && composedWithXr ? 'active' : undefined}
      data-kg-city-maplibre-owner={
        active && composedWithXr && !threeOverlayComposed ? '1' : undefined
      }
    >
      <GeoXrMediaSelectionTargets
        active={active && composedWithXr && geoXrMediaSelectionAssets.length > 0}
        assets={geoXrMediaSelectionAssets}
        onSelect={selectGameModeGeoActor}
      />
      <GeospatialOverlayHostLazy
        active={active}
        keyboardNavigationEnabled={keyboardNavigationEnabled}
        gameplayPresentationOwner={gameplayPresentationOwner}
        semanticMediaOwner={stableSemanticMediaOwner}
        snapshot={snapshot}
        handlers={handlers}
        onFlightOverlayPresented={handleFlightOverlayPresented}
      />
    </section>
  )
})
