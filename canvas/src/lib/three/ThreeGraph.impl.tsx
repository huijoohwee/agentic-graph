import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react'
import { Canvas } from '@react-three/fiber'
import { useGraphStore } from '@/hooks/useGraphStore'
import { useActiveGraphRenderData } from '@/hooks/useActiveGraphData'
import type { GraphData, GraphNode, GraphEdge } from '@/lib/graph/types'
import { defaultSchema, type GraphSchema } from '@/lib/graph/schema'
import { deriveSceneDisplayGraph } from '@/lib/scene/sceneDerivation'
import { usePositions } from '@/features/three/layout'
import { GraphHoverTooltip, type HoverInfo } from '@/components/GraphHoverTooltip'
import { ACESFilmicToneMapping, PCFSoftShadowMap, SRGBColorSpace, type Camera, type Scene as ThreeScene, type WebGLRenderer } from 'three'
import { useThemeDetector } from '@/hooks/useThemeDetector'
import type { Canvas3dModeId } from '@/lib/config'
import { emitPropsPanelOpen } from '@/features/canvas/utils'
import { parseGlbAssetDocument } from '@/lib/assets/glbAssetDocument'
import { GlbAssetModel, buildGlbAssetRenderKey, type GlbFit } from '@/lib/three/GlbAssetModel'
import { CanvasXrEntryPanel, OverlayFrameSync } from '@/lib/three/ThreeGraphXr'
import { registerThreeGraphSnapshotFns } from '@/lib/three/ThreeGraphSnapshots'
import { useThreeRichMediaOverlayController } from '@/lib/three/useThreeRichMediaOverlayController'
import { useCanvasAppliedMarkdownDocument } from '@/features/canvas/useCanvasAppliedMarkdownDocument'
import { useMarkdownExplorerStore } from '@/features/markdown-explorer/store'
import { shouldRenderCanvasAppliedModelAsset } from '@/lib/three/modelAssetActivePathGuard'
import { parseStandaloneSpatialCaptureManifest } from '@/features/markdown-workspace/workspaceImport/spatialCaptureFileset'
import { SpatialCaptureManifestStage } from '@/features/three/SpatialCaptureManifestStage'
import { XrEmptyWorldStage } from '@/features/three/XrEmptyWorldStage'
import { XrEmptyWorldHud } from '@/features/three/XrEmptyWorldHud'
import { useXrSceneMediaDrop } from '@/features/three/useXrSceneMediaDrop'
import { XrCameraAspectMask } from '@/features/three/XrCameraAspectMask'
import { XrArPlacementStage } from '@/features/three/XrArPlacementStage'
import { subscribeXrMotionReferenceRuntime } from '@/features/three/xrMotionReferenceRuntime'
import { isCitySimRunReadyDemoActive, isNativeXrRunReadyDemoActive } from '@/features/workspace-fs/workspaceRunReadyDemos'
import { XrRendererClearController } from '@/lib/three/XrRendererClearController'
import { GAME_FPS_SHARED_XR_PROFILE_ID } from '@/features/game-fps/gameFpsModel'
import { resolveFlightSimGameplayCoordinateScale } from '@/features/game-flight-sim/flightSimSpatialScale'
import { useCanvasGameplayOverlayState } from '@/features/canvas/useCanvasGameplayOverlayState'
import {
  ThreeGameplayMissionStage,
  ThreeGameplayWebglUnsupportedState,
} from '@/lib/three/ThreeGameplayOverlay'
import { readWebglSupport } from '@/lib/three/webglSupport'
import { XR_NATIVE_CONTROLLER_DEMO_STAGE_SCALE } from '@/features/three/xrNativeControllerDemoRuntime'
import { resolveAuthoredWorldPaused } from '@/lib/three/authoredWorldPause'
import { ThreeCanvasMediaFigure } from '@/lib/three/ThreeCanvasMediaFigure'
import {
  boundedInverseFitScale,
  fitFloorOffset,
  readXrStageMetersPerUnit,
  resolveSceneBackgroundColor,
} from '@/lib/three/threeGraphSceneLayout'
import { resolveThreeRendererLifecycleKey, shouldMountThreeRenderer } from '@/lib/three/threeRendererLifecycle'
import { resolveThreeGraphXrSceneAuthority, ThreeGraphImmersiveMediaHud, ThreeGraphImmersiveMediaStage, useThreeGraphImmersiveMediaStageActive } from '@/lib/three/ThreeGraphImmersiveMedia'
const SceneLazy = React.lazy(() =>
  import('@/lib/three/Scene.impl').then(mod => ({
    default: mod.Scene,
  })),
)
const ControlsLazy = React.lazy(() =>
  import('@/features/three/Controls').then(mod => ({
    default: mod.Controls,
  })),
)
const XR_PHYSICS_RUN_READY_GRAPH: GraphData = { type: 'Graph', nodes: [], edges: [] }
function XrWorldPlacement({
  active,
  children,
  contentScale,
  contentOffset,
}: {
  active: boolean
  children: React.ReactNode
  contentScale: number
  contentOffset: readonly [number, number, number]
}) {
  return active ? (
    <XrArPlacementStage contentScale={contentScale} contentOffset={contentOffset}>
      {children}
    </XrArPlacementStage>
  ) : <>{children}</>
}
export default function ThreeGraph({ active = true, geospatialComposite = false, mode = '3d' }: { active?: boolean; geospatialComposite?: boolean; mode?: Canvas3dModeId }) {
  const { schema, selectNode, selectEdge, setSelectionSource } = useGraphStore()
  const markdownDocumentName = useGraphStore(s => s.markdownDocumentName)
  const markdownDocumentText = useGraphStore(s => s.markdownDocumentText)
  const nativeXrRunReadyDemo = isNativeXrRunReadyDemoActive(markdownDocumentName, markdownDocumentText)
  const citySimRunReadyDemo = isCitySimRunReadyDemoActive(markdownDocumentName, markdownDocumentText)
  const { citySim, citySimActive, flightSim, flightSimActive, gameMode, gameFpsActive } = useCanvasGameplayOverlayState()
  const citySimStageActive = mode === 'xr' && citySimActive
  const citySimMeshActive = citySimStageActive && !geospatialComposite
  const flightStageActive = mode === 'xr' && flightSimActive
  const gameFpsStageActive = mode === 'xr' && gameFpsActive
  const gameplayOverlayActive = citySimStageActive || flightStageActive || gameFpsStageActive
  const immersiveMediaStageActive = useThreeGraphImmersiveMediaStageActive(mode, gameplayOverlayActive)
  const markdownDocumentSourceUrl = useGraphStore(s => s.markdownDocumentSourceUrl)
  const markdownDocumentApplyViewPreset = useGraphStore(s => s.markdownDocumentApplyViewPreset)
  const explorerActivePath = useMarkdownExplorerStore(s => s.activePath)
  const registerCanvasSnapshotFns = useGraphStore(s => s.registerCanvasSnapshotFns)
  const registerThreeGlbSnapshotFns = useGraphStore(s => s.registerThreeGlbSnapshotFns)
  const registerThreeLayoutSnapshotFns = useGraphStore(s => s.registerThreeLayoutSnapshotFns)
  const glCanvasRef = React.useRef<HTMLCanvasElement | null>(null)
  const threeSceneRef = React.useRef<ThreeScene | null>(null)
  const threeCameraRef = React.useRef<Camera | null>(null)
  const threeGlRef = React.useRef<WebGLRenderer | null>(null)
  const [webglSupported] = useState(readWebglSupport)
  const effectiveWebglSupported = citySimActive ? citySim.webglSupported : gameFpsActive ? gameMode.webglSupported : flightSimActive ? flightSim.webglSupported : webglSupported
  const paused = !active
  const authoredWorldPaused = resolveAuthoredWorldPaused(paused, gameplayOverlayActive)
  const graph = useActiveGraphRenderData() as GraphData | null
  const xrStageMetersPerUnit = React.useSyncExternalStore(
    subscribeXrMotionReferenceRuntime,
    readXrStageMetersPerUnit,
    readXrStageMetersPerUnit,
  )
  const xrDocumentLoaded = mode !== 'xr' || Boolean(
    String(markdownDocumentName || '').trim()
    && String(markdownDocumentText || '').trim(),
  )
  const s = schema as GraphSchema | null
  const effectiveSchema = useMemo<GraphSchema>(() => s || defaultSchema, [s])
  const renderGraphRef = useRef<GraphData | null>(null)
  const renderGraph = useMemo(() => {
    if (!xrDocumentLoaded) {
      renderGraphRef.current = null
      return null
    }
    if (paused && renderGraphRef.current) return renderGraphRef.current
    renderGraphRef.current = graph
    return graph
  }, [graph, paused, xrDocumentLoaded])
  const canvasMarkdownDocument = useCanvasAppliedMarkdownDocument({
    name: markdownDocumentName,
    sourceUrl: markdownDocumentSourceUrl,
    text: markdownDocumentText,
    applyViewPreset: markdownDocumentApplyViewPreset !== false,
  })
  const glbAsset = useMemo(() => parseGlbAssetDocument(canvasMarkdownDocument.text), [canvasMarkdownDocument.text])
  const spatialCaptureManifest = useMemo(() => parseStandaloneSpatialCaptureManifest(canvasMarkdownDocument.text), [canvasMarkdownDocument.text])
  const shouldRenderGlbAsset = useMemo(
    () => shouldRenderCanvasAppliedModelAsset({
      explorerActivePath,
      canvasDocumentName: canvasMarkdownDocument.name,
      hasModelAsset: !!glbAsset,
    }),
    [canvasMarkdownDocument.name, explorerActivePath, glbAsset],
  )
  const glbAssetRenderKey = useMemo(
    () => (glbAsset && shouldRenderGlbAsset ? buildGlbAssetRenderKey(glbAsset, canvasMarkdownDocument.semanticKey) : ''),
    [canvasMarkdownDocument.semanticKey, glbAsset, shouldRenderGlbAsset],
  )
  const spatialCaptureRenderKey = useMemo(() => {
    if (!spatialCaptureManifest) return ''
    return [
      'spatial-capture-render',
      canvasMarkdownDocument.semanticKey,
      spatialCaptureManifest.format,
      spatialCaptureManifest.renderCacheKey,
      spatialCaptureManifest.pendingLocalPath,
      spatialCaptureManifest.sourceKind,
      spatialCaptureManifest.sourceIdentity,
    ].join('|')
  }, [canvasMarkdownDocument.semanticKey, spatialCaptureManifest])
  const [glbAssetFit, setGlbAssetFit] = useState<GlbFit | null>(null)
  const [spatialCaptureFit, setSpatialCaptureFit] = useState<GlbFit | null>(null)
  const [spatialRuntimeStatus, setSpatialRuntimeStatus] = useState<'idle' | 'loading' | 'ready' | 'empty' | 'error'>('idle')
  const [spatialRuntimeFidelity, setSpatialRuntimeFidelity] = useState<'idle' | 'preview' | 'full'>('idle')
  useEffect(() => {
    setGlbAssetFit(null)
  }, [glbAssetRenderKey])
  useEffect(() => {
    setSpatialCaptureFit(null)
  }, [spatialCaptureRenderKey])
  useEffect(() => {
    if (!spatialCaptureManifest) {
      setSpatialRuntimeStatus('idle')
      setSpatialRuntimeFidelity('idle')
    }
  }, [spatialCaptureManifest])
  const handleSpatialLoadStateChange = useCallback((state: { load?: { fidelity?: 'preview' | 'full' }; status: 'loading' | 'ready' | 'empty' | 'error' }) => {
    setSpatialRuntimeStatus(state.status)
    setSpatialRuntimeFidelity(state.status === 'ready' ? state.load?.fidelity || 'full' : 'idle')
  }, [])
  const handleSpatialCaptureFitChange = useCallback((fit: GlbFit | null) => {
    setSpatialCaptureFit(fit)
  }, [])
  const handleGlbAssetFitChange = useCallback((fit: GlbFit | null) => {
    setGlbAssetFit(fit)
  }, [])
  const sceneGraph = useMemo(() => {
    if (glbAsset) return null
    if (spatialCaptureManifest) return null
    const g = renderGraph as GraphData | null
    if (!g) return null
    return deriveSceneDisplayGraph({ graphData: g })?.displayGraphData || g
  }, [glbAsset, renderGraph, spatialCaptureManifest])
  const sceneGraphForRender = useMemo<GraphData | null>(() => {
    if (!sceneGraph || !Array.isArray(sceneGraph.nodes)) {
      return nativeXrRunReadyDemo ? XR_PHYSICS_RUN_READY_GRAPH : null
    }
    return Array.isArray(sceneGraph.edges)
      ? sceneGraph
      : { ...sceneGraph, edges: [] }
  }, [nativeXrRunReadyDemo, sceneGraph])
  const hasGraph = !citySimRunReadyDemo && !citySimStageActive && !!sceneGraphForRender
  const hasGlbAsset = !!glbAsset && shouldRenderGlbAsset
  const hasSpatialCaptureManifest = !!spatialCaptureManifest
  const hasXrEmptyWorld = mode === 'xr' && !xrDocumentLoaded && !nativeXrRunReadyDemo && !immersiveMediaStageActive
  const hasRenderableScene = immersiveMediaStageActive || gameplayOverlayActive || hasGraph || hasGlbAsset || hasSpatialCaptureManifest || hasXrEmptyWorld
  const xrGraphStageAuthority = mode === 'xr' && hasGraph
    ? nativeXrRunReadyDemo ? 'native-controller' : 'motion-reference'
    : undefined
  const xrSceneAuthority = resolveThreeGraphXrSceneAuthority({ mode, immersiveMediaActive: immersiveMediaStageActive, xrGraphStageAuthority, hasGlbAsset, hasSpatialCaptureManifest, hasXrEmptyWorld })
  const xrStandaloneFit = hasSpatialCaptureManifest
    ? spatialCaptureFit
    : hasGlbAsset
      ? glbAssetFit
      : null
  const xrWorldContentScale = hasGraph || hasXrEmptyWorld
    ? xrStageMetersPerUnit
    : boundedInverseFitScale(xrStandaloneFit)
  const xrWorldContentOffset = fitFloorOffset(xrStandaloneFit)
  const hoverEnabled = (effectiveSchema as GraphSchema).behavior?.hover?.enabled !== false
  const positions = usePositions(
    hasGraph ? sceneGraphForRender!.nodes : [],
    hasGraph ? (effectiveSchema as GraphSchema) : null,
    hasGraph ? sceneGraphForRender : null,
    mode,
  )
  const positionsRef = React.useRef<Record<string, [number, number, number]>>({})
  const positions3d = positions as unknown as Record<string, [number, number, number]>
  positionsRef.current = positions3d
  const containerRef = React.useRef<HTMLElement | null>(null)
  const xrSceneMediaDrop = useXrSceneMediaDrop({
    active: active && mode === 'xr' && !gameplayOverlayActive,
    targetRef: containerRef,
  })
  const [hoverInfo, setHoverInfo] = useState<HoverInfo | null>(null)
  const [hoveredEdgeId, setHoveredEdgeId] = useState<string | null>(null)
  const [draggedNodeId, setDraggedNodeId] = useState<string | null>(null)
  const draggedNodeIdRef = React.useRef<string | null>(null)
  const hoverClearTimerRef = useRef<number | null>(null)
  const theme = useThemeDetector()
  const sceneBackgroundColor = useMemo(() => {
    void theme
    return resolveSceneBackgroundColor(effectiveSchema, mode)
  }, [effectiveSchema, mode, theme])
  const rendererClearColor = hasXrEmptyWorld ? '#0b2f4a'
    : hasGraph ? sceneBackgroundColor : '#000000'
  const rendererDefaultClearAlpha = geospatialComposite
    ? 0
    : immersiveMediaStageActive || hasXrEmptyWorld || hasGraph ? 1 : 0
  const rendererLifecycleKey = resolveThreeRendererLifecycleKey(mode)
  const rendererMounted = shouldMountThreeRenderer({
    mode,
    hasRenderableScene,
    webglSupported: effectiveWebglSupported,
  })
  useEffect(() => {
    draggedNodeIdRef.current = draggedNodeId
  }, [draggedNodeId])
  useEffect(() => {
    if (!hoverEnabled) {
      setHoverInfo(null)
      setHoveredEdgeId(null)
    }
  }, [hoverEnabled])
  useEffect(() => {
    return () => {
      try {
        registerCanvasSnapshotFns('3d', null)
      } catch {
        void 0
      }
      try {
        registerThreeGlbSnapshotFns(null)
      } catch {
        void 0
      }
      try {
        registerThreeLayoutSnapshotFns(null)
      } catch {
        void 0
      }
      const renderer = threeGlRef.current
      if (renderer) {
        try { renderer.xr.enabled = false } catch { void 0 }
      }
      threeGlRef.current = null
      threeCameraRef.current = null
      threeSceneRef.current = null
    }
  }, [registerCanvasSnapshotFns, registerThreeGlbSnapshotFns, registerThreeLayoutSnapshotFns])

  useEffect(() => {
    const renderer = threeGlRef.current
    if (!renderer) return
    renderer.xr.enabled = mode === 'xr'
    return () => {
      if (renderer === threeGlRef.current) renderer.xr.enabled = false
    }
  }, [mode])

  useEffect(() => {
    registerThreeLayoutSnapshotFns({
      capturePositions: () => {
        try {
          const cur = positionsRef.current
          const out: Record<string, [number, number, number]> = {}
          for (const id in cur) {
            const p = cur[id]
            if (!p) continue
            const x = Number(p[0])
            const y = Number(p[1])
            const z = Number(p[2])
            if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) continue
            out[id] = [x, y, z]
          }
          return out
        } catch {
          return null
        }
      },
    })
    return () => {
      registerThreeLayoutSnapshotFns(null)
    }
  }, [registerThreeLayoutSnapshotFns])
  const onSelectNode = (id: string) => {
    setSelectionSource('canvas')
    selectNode(id)
    if (mode === 'voxel') {
      emitPropsPanelOpen()
    }
  }
  const clearHoverClearTimer = useCallback(() => {
    const t = hoverClearTimerRef.current
    if (t != null) {
      try {
        window.clearTimeout(t)
      } catch {
        void 0
      }
      hoverClearTimerRef.current = null
    }
  }, [])
  useEffect(() => {
    return () => {
      clearHoverClearTimer()
    }
  }, [clearHoverClearTimer])
  const handleHoverNode = useCallback((info: { id: string; clientX: number; clientY: number } | null) => {
    if (!info) {
      clearHoverClearTimer()
      hoverClearTimerRef.current = window.setTimeout(() => {
        setHoverInfo(prev => (prev && prev.kind === 'node' ? null : prev))
        hoverClearTimerRef.current = null
      }, 80)
      return
    }
    clearHoverClearTimer()
    setHoverInfo({ kind: 'node', id: info.id, clientX: info.clientX, clientY: info.clientY })
  }, [clearHoverClearTimer])
  const handleHoverEdge = useCallback((info: { id: string; clientX: number; clientY: number } | null) => {
    if (!info) {
      clearHoverClearTimer()
      hoverClearTimerRef.current = window.setTimeout(() => {
        setHoverInfo(prev => (prev && prev.kind === 'edge' ? null : prev))
        hoverClearTimerRef.current = null
      }, 80)
      return
    }
    clearHoverClearTimer()
    setHoverInfo({ kind: 'edge', id: info.id, clientX: info.clientX, clientY: info.clientY })
  }, [clearHoverClearTimer])

  const handleHoverEdgeIdChange = useCallback((id: string | null) => {
    setHoveredEdgeId(id)
  }, [])

  const { dragOverridesRef, overlayHiddenNodeIdSet, overlayLayer, requestSchedule, scheduleRef } = useThreeRichMediaOverlayController({
    active: active && mode !== 'xr' && !gameplayOverlayActive,
    sceneGraph: mode === 'xr' || gameplayOverlayActive ? null : sceneGraphForRender,
    effectiveSchema,
    positions: positions3d,
    glCanvasRef,
    containerRef,
    threeCameraRef,
    threeGlRef,
    draggedNodeIdRef,
    setDraggedNodeId,
  })
  if (!rendererMounted) {
    return (
      <section
        ref={containerRef}
        className="absolute inset-0 w-full h-full z-0"
        data-kg-xr-document-loaded={mode === 'xr' ? (xrDocumentLoaded ? '1' : '0') : undefined}
        data-kg-xr-scene-authority={xrSceneAuthority}
        data-kg-xr-scene-media-drop={mode === 'xr' ? '1' : undefined}
        onDragOver={xrSceneMediaDrop.onDragOver}
        onDrop={xrSceneMediaDrop.onDrop}
      >
        {effectiveWebglSupported === false && gameplayOverlayActive ? (
          <ThreeGameplayWebglUnsupportedState
            citySimActive={citySimStageActive}
            flightSimActive={flightStageActive}
            gameFpsActive={gameFpsStageActive}
          />
        ) : null}
      </section>
    )
  }
  const gameplayCoordinateScale = resolveFlightSimGameplayCoordinateScale(
    nativeXrRunReadyDemo ? XR_NATIVE_CONTROLLER_DEMO_STAGE_SCALE : 1 / xrStageMetersPerUnit,
    flightStageActive,
  )
  const gameplayStage = <ThreeGameplayMissionStage
    citySimActive={citySimStageActive}
    coordinateScale={gameplayCoordinateScale}
    flightSimActive={flightStageActive}
    gameFpsActive={gameFpsStageActive}
    geospatialComposite={geospatialComposite}
  />
  return (
    <section
      ref={containerRef}
      className="absolute inset-0 w-full h-full z-0"
      data-kg-xr-document-loaded={mode === 'xr' ? (xrDocumentLoaded ? '1' : '0') : undefined}
      data-kg-geo-xr-surface={geospatialComposite ? 'active' : undefined}
      data-kg-xr-scene-authority={xrSceneAuthority}
      data-kg-xr-exclusive-stage={mode === 'xr' && (immersiveMediaStageActive || hasGraph || hasXrEmptyWorld) ? '1' : undefined}
      data-kg-xr-empty-world={hasXrEmptyWorld ? '1' : undefined}
      data-kg-xr-scene-media-drop={mode === 'xr' ? '1' : undefined}
      data-kg-game-fps-stage={gameFpsStageActive ? 'active' : undefined}
      data-kg-flight-sim-stage={flightStageActive ? 'active' : undefined}
      data-kg-city-sim-stage={citySimMeshActive ? 'active' : citySimStageActive ? 'maplibre-aerial' : undefined}
      data-kg-game-mode-surface={gameMode.active ? gameMode.surfaceMode : undefined}
      data-kg-game-mode-scene={gameMode.active ? GAME_FPS_SHARED_XR_PROFILE_ID : undefined}
      data-kg-flight-sim-surface={flightSim.active ? flightSim.surfaceMode : undefined}
      data-kg-city-sim-surface={citySim.active ? 'geo-xr' : undefined}
      data-kg-authored-xr-scene-retained={gameplayOverlayActive ? '1' : undefined}
      data-kg-immersive-media-stage={immersiveMediaStageActive ? 'active' : undefined}
      data-kg-three-viewport-gestures={gameFpsStageActive ? 'first-person' : citySimMeshActive ? 'city-parcel-select' : citySimStageActive && geospatialComposite ? 'map-pass-through' : immersiveMediaStageActive ? 'immersive-look-zoom' : 'orbit-pan-cursor-zoom'}
      onDragOver={xrSceneMediaDrop.onDragOver}
      onDrop={xrSceneMediaDrop.onDrop}
      onContextMenu={event => {
        event.preventDefault()
        event.stopPropagation()
      }}
    >
      <ThreeCanvasMediaFigure citySimActive={citySimStageActive}>
        <Canvas
        key={rendererLifecycleKey}
        data-kg-three-canvas-owner="1"
        frameloop={paused ? 'demand' : 'always'}
        camera={{ position: [0, 0, 220], fov: 50 }}
        shadows
        gl={{ antialias: true, alpha: true }}
        style={geospatialComposite && !citySimMeshActive ? { pointerEvents: 'none' } : undefined}
        onCreated={({ gl, scene, camera }) => {
          gl.xr.enabled = mode === 'xr'
          try {
            gl.toneMapping = ACESFilmicToneMapping
            gl.toneMappingExposure = 1
            gl.shadowMap.enabled = true
            gl.shadowMap.type = PCFSoftShadowMap
            gl.outputColorSpace = SRGBColorSpace
          } catch {
            void 0
          }
          try {
            glCanvasRef.current = gl.domElement as HTMLCanvasElement
          } catch {
            glCanvasRef.current = null
          }
          threeGlRef.current = gl
          threeCameraRef.current = camera || null
          threeSceneRef.current = scene || null
          try {
            requestSchedule()
          } catch {
            void 0
          }
          registerThreeGraphSnapshotFns({
            glCanvasRef,
            threeSceneRef,
            registerCanvasSnapshotFns,
            registerThreeGlbSnapshotFns,
          })
        }}
        onPointerMissed={(ev) => {
          if (ev && typeof ev.button === 'number' && ev.button !== 0) return
          setSelectionSource('canvas')
          selectNode(null)
          selectEdge(null)
        }}
      >
        <XrRendererClearController
          color={rendererClearColor}
          defaultAlpha={rendererDefaultClearAlpha}
          xrSurface={mode === 'xr'}
        />
        <React.Suspense fallback={null}>
          {immersiveMediaStageActive && !geospatialComposite ? <ThreeGraphImmersiveMediaStage /> : null}
          <XrWorldPlacement
            active={mode === 'xr'}
            contentScale={xrWorldContentScale}
            contentOffset={xrWorldContentOffset}
          >
            {gameplayStage}
            {!geospatialComposite && hasXrEmptyWorld ? (
              <group name="kg_xr_empty_world">
                <XrEmptyWorldStage />
              </group>
            ) : null}
            {hasGraph ? (
              <SceneLazy
                data={sceneGraphForRender as GraphData}
                schema={effectiveSchema as GraphSchema}
                positions={positions}
                paused={authoredWorldPaused}
                onSelectNode={onSelectNode}
                onHoverNode={hoverEnabled ? handleHoverNode : undefined}
                onHoverEdge={hoverEnabled ? handleHoverEdge : undefined}
                onHoverEdgeIdChange={hoverEnabled ? handleHoverEdgeIdChange : undefined}
                hoveredEdgeId={hoveredEdgeId}
                onDragNode={setDraggedNodeId}
                draggedNodeId={draggedNodeId}
                theme={theme}
                dragOverridesRef={dragOverridesRef as unknown as React.MutableRefObject<Record<string, [number, number, number]>>}
                hiddenNodeIdSet={overlayHiddenNodeIdSet}
                mode={mode}
                xrGraphStageAuthority={xrGraphStageAuthority}
                backgroundColor={sceneBackgroundColor}
                geospatialComposite={geospatialComposite}
              />
            ) : null}
            {!geospatialComposite && glbAsset && shouldRenderGlbAsset ? (
              <GlbAssetModel
                key={glbAssetRenderKey}
                asset={glbAsset}
                mode={mode}
                paused={authoredWorldPaused}
                standalone={!hasGraph}
                onFitChange={handleGlbAssetFitChange}
              />
            ) : null}
            {!geospatialComposite && spatialCaptureManifest ? (
              <SpatialCaptureManifestStage
                manifest={spatialCaptureManifest}
                paused={authoredWorldPaused}
                dimmed={paused}
                onLoadStateChange={handleSpatialLoadStateChange}
                onFitChange={handleSpatialCaptureFitChange}
              />
            ) : null}
          </XrWorldPlacement>
          {!gameFpsStageActive && !citySimStageActive ? <ControlsLazy
            schema={effectiveSchema as GraphSchema}
            positions={positions}
            paused={paused}
            mode={mode}
            flightSimActive={flightStageActive}
            immersiveMediaActive={immersiveMediaStageActive}
            gameplayCoordinateScale={gameplayCoordinateScale}
            modelAssetRenderKey={spatialCaptureRenderKey || glbAssetRenderKey}
            modelAssetFit={spatialCaptureRenderKey ? spatialCaptureFit : glbAssetFit}
            xrEmptyWorld={hasXrEmptyWorld}
            onControlsChange={() => {
              try {
                scheduleRef.current?.()
              } catch {
                void 0
              }
            }}
          /> : null}
          <OverlayFrameSync enabled={active && mode !== 'xr'} scheduleRef={scheduleRef} />
        </React.Suspense>
        </Canvas>
      </ThreeCanvasMediaFigure>
      {mode === 'xr' && xrDocumentLoaded && !gameplayOverlayActive && !immersiveMediaStageActive ? <XrCameraAspectMask /> : null}
      {hasXrEmptyWorld && !gameplayOverlayActive ? <XrEmptyWorldHud /> : null}
      {immersiveMediaStageActive ? <ThreeGraphImmersiveMediaHud geospatialComposite={geospatialComposite} /> : null}
      <CanvasXrEntryPanel
        key={`${rendererLifecycleKey}-session-panel`}
        active={active && mode === 'xr' && !gameplayOverlayActive}
        rendererRef={threeGlRef}
        surfaceKind={spatialCaptureManifest ? 'spatial-capture' : 'graph'}
        spatialRuntimeStatus={spatialRuntimeStatus}
        spatialRuntimeFidelity={spatialRuntimeFidelity}
      />
      {mode !== 'xr' && !gameplayOverlayActive ? overlayLayer : null}
      {mode !== 'xr' && !gameplayOverlayActive ? <GraphHoverTooltip
        hoverInfo={hoverInfo}
        containerRef={containerRef as unknown as React.RefObject<HTMLElement | null>}
        nodes={sceneGraphForRender?.nodes as GraphNode[] | undefined}
        edges={sceneGraphForRender?.edges as GraphEdge[] | undefined}
        schema={effectiveSchema as GraphSchema | null}
        tooltipInteractive
      /> : null}
    </section>
  )
}
