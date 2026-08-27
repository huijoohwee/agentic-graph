import React from 'react'
import { useShallow } from 'zustand/react/shallow'
import type { Canvas2dRendererId, Canvas3dModeId } from '@/lib/config.render'
import type { GraphData } from '@/lib/graph/types'
import { importWithRetry } from '@/lib/react/importWithRetry'
import { useGraphStore } from '@/hooks/useGraphStore'
import { useActiveGraphRenderData } from '@/hooks/useActiveGraphData'
import { useMarkdownExplorerStore } from '@/features/markdown-explorer/store'
import { useForbidBrowserZoomWheel } from '@/lib/ui/forbidBrowserZoom'
import { useMediaQuery } from '@/lib/ui/useMediaQuery'
import { UI_RESPONSIVE_CANVAS_MINIMAP_OVERLAY_CLASSNAME } from '@/lib/ui/responsiveElementClasses'
import { resolveCanvas3dMode } from '@/lib/canvas/canvas3dMode'
import { resolveCanvasSurfaceOwnership } from '@/lib/canvas/canvasSurfaceOwnershipRuntime'
import { isCitySimRunReadyDemoActive, isXrPhysicsRunReadyDemoActive, isXrPhysicsRuntimeRunReadyDemoActive } from '@/features/workspace-fs/workspaceRunReadyDemos'
import { useCanvasGameplayOverlayState } from '@/features/canvas/useCanvasGameplayOverlayState'
import { useFlightSimSurfacePreload } from '@/features/game-flight-sim/useFlightSimSurfacePreload'
import { FlightSimHud } from '@/features/game-flight-sim/FlightSimHud'
import { XrNativeControllerDemoHud } from '@/features/three/XrNativeControllerDemoHud'
import {
  resolveThreeCanvasSurfaceLifecycle,
  retainThreeCanvasSourceAdmission,
} from '@/lib/three/threeRendererLifecycle'
import { getCanvas2dSurfaceId, isCanvas2dRendererId, isStoryboardCanvas2dRenderer, supportsCanvas2dMinimap } from '@/lib/config.render'
import { shouldRenderTimelineSurface } from '@/lib/timeline/timelineVisibility'
import { resolvePreferredEnabledComposedSourceFile } from '@/features/source-files/composedSourceSelection'
import { isFrontmatterFlowGraph } from '@/lib/graph/frontmatterMode'
import { isStrybldrStoryboardGraphData } from '@/features/strybldr/strybldrStoryboard'
import { useAgenticGraphLiveCanvasHero } from '@/features/canvas/useAgenticGraphLiveCanvasHero'
import { AGENTICGRAPH_XR_IFRAME_ALLOW } from '@/features/canvas/canvasEmbedIframeMarkup'
import { shouldDocumentSwitchOwnCanvasViewport } from '@/features/canvas/liveCanvasHeroVisibility'
import { deriveLiveCanvasHeroCommandRouteGraph } from '@/features/canvas/liveCanvasHeroProjection'
import { useSourceFilesBootstrapSnapshot } from '@/features/source-files/sourceFilesBootstrapReadiness'
import {
  CANVAS_VIEWPORT_HEAVY_RUNTIME_INTENT_COPY,
  resolveCanvasViewportHeavyRuntimeIntentSurface,
} from '@/components/canvasViewportHeavyRuntimeIntent'
import { loadCanvasViewportGeospatialOverlay } from '@/components/canvasViewportGeospatialOverlayLoader'
import { CanvasEmbedCodePanelHost } from '@/components/CanvasEmbedCodePanelHost'
import { CanvasSourceInitializationError } from '@/components/CanvasSourceInitializationError'
import {
  CITY_SIM_MEDIA_STAGE_DATA_ATTRIBUTES,
  CITY_SIM_MEDIA_STAGE_LABEL,
} from '@/features/game-city-sim/citySimMediaSurface'
import { SemanticMediaFigure } from '@/lib/cards/SemanticMediaFigure'
import {
  MEDIA_PREVIEW_SELECTABLE_SURFACE_ATTR,
  MEDIA_PREVIEW_SELECTABLE_SURFACE_VALUE,
} from '@/lib/cards/mediaPreviewSurfaceSelection'
import { XrPhysicsSemanticMediaSurface } from '@/features/three/XrPhysicsSemanticMediaSurface'
import {
  createEmbeddedCanvasChatSubmitMessage,
  deliverEmbeddedCanvasChatSubmit,
  isEmbeddedCanvasChatReadyMessage,
  installEmbeddedCanvasChatCommandBridge,
} from '@/features/canvas/embeddedCanvasChatCommand'
import { useEmbeddedCanvasChatCommandReceiver } from '@/features/canvas/useEmbeddedCanvasChatCommandReceiver'
const CanvasViewportGeospatialOverlayLazy = React.lazy(loadCanvasViewportGeospatialOverlay)
const LiveCanvasHeroLazy = React.lazy(() => import('@/components/LiveCanvasHero').then(mod => ({ default: mod.LiveCanvasHero })))
const SharedGraphCanvasLazy = React.lazy(() => import('@/components/GraphCanvas'))
const DashboardCanvasLazy = React.lazy(() => importWithRetry(() => import('@/components/DashboardCanvas'), { retries: 2, retryDelayMs: 50 }))
const GalleryCanvasLazy = React.lazy(() => importWithRetry(() => import('@/components/GalleryCanvas'), { retries: 2, retryDelayMs: 50 }))
const MediaCanvasLazy = React.lazy(() => importWithRetry(() => import('@/components/MediaCanvas'), { retries: 2, retryDelayMs: 50 }))
const MultiDimTableSurfaceLazy = React.lazy(() => importWithRetry(() => import('@/features/markdown-workspace/main/viewer/MultiDimTableSurface'), { retries: 2, retryDelayMs: 50 }).then(mod => ({ default: mod.MultiDimTableSurface })))
const CanvasWorkspaceDataViewFloatingRegistrationBridgeLazy = React.lazy(() => importWithRetry(() => import('@/features/markdown-workspace/main/viewer/CanvasWorkspaceDataViewFloatingRegistrationBridge'), { retries: 2, retryDelayMs: 50 }).then(mod => ({ default: mod.CanvasWorkspaceDataViewFloatingRegistrationBridge })))
const MermaidGitGraphCanvasLazy = React.lazy(() => import('@/components/MermaidGitGraphCanvas'))
const MermaidGanttCanvasLazy = React.lazy(() => import('@/components/MermaidGanttCanvas'))
const FlowCanvasLazy = React.lazy(() => importWithRetry(() => import('@/components/FlowCanvas'), { retries: 2, retryDelayMs: 50 }))
const AnimaticCanvasLazy = React.lazy(() => importWithRetry(() => import('@/components/AnimaticCanvas'), { retries: 2, retryDelayMs: 50 }))
const StoryboardWidgetCanvasLazy = React.lazy(() => importWithRetry(() => import('@/components/StoryboardWidgetCanvas'), { retries: 2, retryDelayMs: 50 }))
const StoryboardWidgetDropBridgeLazy = React.lazy(() => importWithRetry(() => import('@/components/StoryboardWidgetDropBridge'), { retries: 2, retryDelayMs: 50 }))
const MarkdownMetricsDevOverlayLazy = React.lazy(() => import('@/components/CanvasViewportMarkdownMetricsDevOverlay').then(mod => ({ default: mod.CanvasViewportMarkdownMetricsDevOverlay })))
const DesignCanvasLazy = React.lazy(() => import('@/components/DesignCanvas'))
const GameFpsHudLazy = React.lazy(() => import('@/features/game-fps/GameFpsHud').then(mod => ({ default: mod.GameFpsHud })))
const MinimapLazy = React.lazy(() => import('@/features/minimap/Minimap'))
const StrybldrTimelineBottomPanelLazy = React.lazy(() => import('@/features/strybldr/StrybldrTimelineBottomPanel').then(mod => ({ default: mod.StrybldrTimelineBottomPanel })))
const LaunchSpotlightLazy = React.lazy(() => import('@/features/spotlight/LaunchSpotlight'))
const PaywallOverlayLazy = React.lazy(async (): Promise<{ default: React.ComponentType<{ portalTarget: HTMLElement | null }> }> => ({
  default: (await import('@/features/payments/PaywallOverlay')).PaywallOverlay,
}))
const MARKDOWN_METRICS_DEV_ENABLED = Boolean((import.meta as unknown as { env?: { DEV?: boolean } }).env?.DEV)
export type CanvasViewportVariant = 'workspace' | 'embeddedPreview'
export type CanvasViewportProps = {
  variant: CanvasViewportVariant
  layout?: 'full' | 'pane'
  geospatialModeEnabled: boolean
  workspaceEditorOverlayOpen?: boolean
  workspaceVisibleCanvasLeft?: string
  canvasRenderMode: '2d' | '3d'
  canvas3dMode: Canvas3dModeId
  canvas2dRenderer: Canvas2dRendererId
  documentSwitchPending?: boolean
  documentSwitchPendingLabel?: string
  onLiveCanvasHeroVisibilityChange?: (visible: boolean) => void
}
function isLiveCanvasHeroEmbedPreview(variant: CanvasViewportVariant): boolean {
  if (variant !== 'embeddedPreview' || typeof window === 'undefined') return false
  return new URLSearchParams(window.location.search).get('kgLiveHero') === '1'
}
function resolveLiveCanvasHeroEmbedPreviewSurface(variant: CanvasViewportVariant): string | null {
  if (!isLiveCanvasHeroEmbedPreview(variant) || typeof window === 'undefined') return null
  const renderer = new URLSearchParams(window.location.search).get('kgCanvas2dRenderer')
  return isCanvas2dRendererId(renderer) ? getCanvas2dSurfaceId(renderer) : null
}
export function CanvasViewport(props: CanvasViewportProps) {
  useEmbeddedCanvasChatCommandReceiver()
  const {
    variant,
    layout = 'full',
    geospatialModeEnabled,
    workspaceEditorOverlayOpen = false,
    workspaceVisibleCanvasLeft,
    canvasRenderMode,
    canvas3dMode,
    canvas2dRenderer,
    documentSwitchPending = false,
    documentSwitchPendingLabel = 'Switching document...',
    onLiveCanvasHeroVisibilityChange,
  } = props
  const activeGraphData = useActiveGraphRenderData(true)
  const graphDataRevision = useGraphStore(s => s.graphDataRevision || 0)
  const sourceFiles = useGraphStore(s => s.sourceFiles)
  const markdownDocumentName = useGraphStore(s => s.markdownDocumentName)
  const markdownDocumentText = useGraphStore(s => s.markdownDocumentText)
  const xrPhysicsRunReadyDemo = isXrPhysicsRunReadyDemoActive(markdownDocumentName, markdownDocumentText)
  const xrPhysicsRuntimeRunReadyDemo = isXrPhysicsRuntimeRunReadyDemoActive(markdownDocumentName, markdownDocumentText)
  const citySimSourceIntent = isCitySimRunReadyDemoActive(markdownDocumentName, markdownDocumentText)
  const { citySim, citySimActive, gameFpsActive, flightSimActive } = useCanvasGameplayOverlayState()
  const cityMapLibreSurfaceRequested = citySimActive
    || (citySimSourceIntent && citySim.lastResult?.operation !== 'exit')
  const gameplayOverlayActive = citySimActive || gameFpsActive || flightSimActive
  const geospatialCompositionEnabled = geospatialModeEnabled
  const sourceFilesBootstrap = useSourceFilesBootstrapSnapshot()
  const sourceFilesBootstrapReady = sourceFilesBootstrap.phase === 'ready'
  const gameFpsHudVisible = gameFpsActive && sourceFilesBootstrapReady
  const flightSimHudVisible = flightSimActive && sourceFilesBootstrapReady
  const explorerActivePath = useMarkdownExplorerStore(s => s.activePath)
  useFlightSimSurfacePreload({
    activePath: explorerActivePath,
    sourceFiles,
  })
  const activeSourceFile = React.useMemo(
    () => resolvePreferredEnabledComposedSourceFile({
      sourceFiles,
      markdownDocumentName,
      explorerActivePath,
      fallbackName: markdownDocumentName,
      activePathAuthority: documentSwitchPending ? 'workspace-selection' : 'markdown-document',
    }),
    [documentSwitchPending, explorerActivePath, markdownDocumentName, sourceFiles],
  )
  const rawActive2dSurface = getCanvas2dSurfaceId(canvas2dRenderer)
  const workspaceStoryboardSurfaceActive = !documentSwitchPending
    && workspaceEditorOverlayOpen === true
    && isStoryboardCanvas2dRenderer(canvas2dRenderer)
    && canvasRenderMode === '2d'
    && (isFrontmatterFlowGraph(activeGraphData) || isFrontmatterFlowGraph(activeSourceFile?.parsedGraphData))
  const active2dSurface = workspaceStoryboardSurfaceActive ? 'storyboard' : rawActive2dSurface
  const documentSwitchBlocksCanvas = documentSwitchPending
  const sharedGraphCanvasSurfaceActive = active2dSurface === 'd3'
  const safeGraphData = React.useMemo(
    () => activeGraphData || ({ nodes: [], edges: [] } as GraphData),
    [activeGraphData],
  )
  const liveCanvasHeroEmbedPreview = isLiveCanvasHeroEmbedPreview(variant)
  const liveCanvasHeroEmbedPreviewSurface = resolveLiveCanvasHeroEmbedPreviewSurface(variant)
  const liveCanvasHeroEmbedGraph = React.useMemo(
    () => liveCanvasHeroEmbedPreview
      ? deriveLiveCanvasHeroCommandRouteGraph(safeGraphData) || safeGraphData
      : null,
    [liveCanvasHeroEmbedPreview, safeGraphData],
  )
  const { frontmatterModeEnabled, multiDimTableModeEnabled, documentSemanticMode, schema, timelineEnabled, bottomSurfaceCollapsed, bottomSurfaceTab } = useGraphStore(
    useShallow(s => ({
      frontmatterModeEnabled: s.frontmatterModeEnabled === true,
      multiDimTableModeEnabled: s.multiDimTableModeEnabled === true,
      documentSemanticMode: s.documentSemanticMode,
      schema: s.schema,
      timelineEnabled: s.timelineEnabled,
      bottomSurfaceCollapsed: s.bottomSurfaceCollapsed === true,
      bottomSurfaceTab: s.bottomSurfaceTab,
    })),
  )
  const documentVersionGraphBottomPanelVisible = bottomSurfaceCollapsed !== true && bottomSurfaceTab === 'documentVersionGraph'
  const mermaidFlowchartBottomPanelVisible = bottomSurfaceCollapsed !== true && bottomSurfaceTab === 'flowchart'
  const mermaidGitGraphBottomPanelVisible = bottomSurfaceCollapsed !== true && bottomSurfaceTab === 'gitGraph'
  const mermaidGanttBottomPanelVisible = bottomSurfaceCollapsed !== true && bottomSurfaceTab === 'gantt'
  const designTimelineBottomPanelVisible = canvas2dRenderer === 'design' && bottomSurfaceCollapsed !== true && bottomSurfaceTab === 'timeline'
  const mermaidTimelineBottomPanelVisible = !designTimelineBottomPanelVisible && bottomSurfaceCollapsed !== true && bottomSurfaceTab === 'timeline'
  const mermaidArchitectureBottomPanelVisible = bottomSurfaceCollapsed !== true && bottomSurfaceTab === 'architecture'
  const mermaidEventModelingBottomPanelVisible = bottomSurfaceCollapsed !== true && bottomSurfaceTab === 'eventModeling'
  const { paywallEnabled, floatingPanelOpen, floatingPanelView } = useGraphStore(
    useShallow(s => ({
      paywallEnabled: s.paymentsPaywallEnabled === true,
      floatingPanelOpen: s.floatingPanelOpen === true,
      floatingPanelView: s.floatingPanelView,
    })),
  )
  const effectiveCanvas3dMode = resolveCanvas3dMode({
    requested: canvas3dMode,
    canvas2dRenderer,
    documentSemanticMode,
    frontmatterModeEnabled,
    multiDimTableModeEnabled,
    geospatialEnabled: geospatialCompositionEnabled,
    schema,
  })
  const geospatialXrModeEnabled = geospatialCompositionEnabled && canvasRenderMode === '3d' && effectiveCanvas3dMode === 'xr'
  const { activeSurface, geospatialOverlayOwnsViewport } = resolveCanvasSurfaceOwnership({
    canvasRenderMode,
    cityMapLibreSurfaceRequested,
    flightSimActive,
    gameplayOverlayActive,
    geospatialModeEnabled: geospatialCompositionEnabled,
    geospatialXrModeEnabled,
    workspaceEditorOverlayOpen,
    workspaceStoryboardSurfaceActive: active2dSurface === 'storyboard',
  })
  const strybldrTimelineBottomPanelVisible = canvas2dRenderer === 'storyboard'
    && (
      isStrybldrStoryboardGraphData(activeGraphData)
      || isStrybldrStoryboardGraphData(activeSourceFile?.parsedGraphData)
    )
    && shouldRenderTimelineSurface({
    activeSurface,
    documentSwitchPending: documentSwitchBlocksCanvas,
    geospatialOverlayOwnsViewport,
    timelineEnabled,
  })
  const timelineBottomPanelVisible =
    documentVersionGraphBottomPanelVisible ||
    mermaidFlowchartBottomPanelVisible ||
    mermaidGitGraphBottomPanelVisible ||
    mermaidGanttBottomPanelVisible ||
    mermaidTimelineBottomPanelVisible ||
    mermaidArchitectureBottomPanelVisible ||
    mermaidEventModelingBottomPanelVisible ||
    designTimelineBottomPanelVisible ||
    strybldrTimelineBottomPanelVisible
  const paywallOverlayActive = paywallEnabled && floatingPanelOpen && floatingPanelView === 'chat'
  const { liveCanvasHeroVisible, liveCanvasHeroSource, dismissLiveCanvasHero } = useAgenticGraphLiveCanvasHero({
    graphData: activeGraphData,
    sourceFiles,
    markdownDocumentName,
    markdownDocumentText,
    sourceFilesBootstrapReady,
    isEmbeddedPreview: variant === 'embeddedPreview',
    workspaceEditorOverlayOpen,
    workspaceDocumentSwitchPending: documentSwitchBlocksCanvas,
    floatingPanelOpen,
    alternateCanvasSurfaceActive: geospatialCompositionEnabled || canvasRenderMode !== '2d',
  })
  const documentSwitchOwnsViewport = shouldDocumentSwitchOwnCanvasViewport({
    documentSwitchBlocksCanvas,
    liveCanvasHeroVisible,
  })
  const liveCanvasHeroEmbedRef = React.useRef<HTMLIFrameElement | null>(null)
  const liveCanvasHeroEmbedReadyRef = React.useRef(false)
  const pendingLiveCanvasHeroChatMessageRef = React.useRef<ReturnType<typeof createEmbeddedCanvasChatSubmitMessage>>(null)
  React.useEffect(() => {
    if (!liveCanvasHeroVisible || !liveCanvasHeroSource?.embedUrl) return
    liveCanvasHeroEmbedReadyRef.current = false
    pendingLiveCanvasHeroChatMessageRef.current = null
    return installEmbeddedCanvasChatCommandBridge({
      submit: text => {
        const target = liveCanvasHeroEmbedRef.current?.contentWindow
        const message = createEmbeddedCanvasChatSubmitMessage(text)
        if (!target || !message) return false
        if (!liveCanvasHeroEmbedReadyRef.current) {
          pendingLiveCanvasHeroChatMessageRef.current = message
          return true
        }
        return deliverEmbeddedCanvasChatSubmit(target, message, window.location.origin)
      },
    })
  }, [liveCanvasHeroSource?.embedUrl, liveCanvasHeroVisible])
  React.useEffect(() => {
    if (!liveCanvasHeroVisible || !liveCanvasHeroSource?.embedUrl) return
    const handleEmbeddedChatReady = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return
      if (event.source !== liveCanvasHeroEmbedRef.current?.contentWindow) return
      if (!isEmbeddedCanvasChatReadyMessage(event.data)) return
      liveCanvasHeroEmbedReadyRef.current = true
      const pendingMessage = pendingLiveCanvasHeroChatMessageRef.current
      const target = liveCanvasHeroEmbedRef.current?.contentWindow
      if (!pendingMessage || !target) return
      pendingLiveCanvasHeroChatMessageRef.current = null
      deliverEmbeddedCanvasChatSubmit(target, pendingMessage, window.location.origin)
    }
    window.addEventListener('message', handleEmbeddedChatReady)
    return () => window.removeEventListener('message', handleEmbeddedChatReady)
  }, [liveCanvasHeroSource?.embedUrl, liveCanvasHeroVisible])
  React.useEffect(() => {
    onLiveCanvasHeroVisibilityChange?.(liveCanvasHeroVisible)
    return () => onLiveCanvasHeroVisibilityChange?.(false)
  }, [liveCanvasHeroVisible, onLiveCanvasHeroVisibilityChange])
  const isTouchViewport = useMediaQuery('(max-width: 768px), (pointer: coarse)')
  const isNarrowViewport = useMediaQuery('(max-width: 768px)')
  const [activatedHeavyRuntimeSurfaces, setActivatedHeavyRuntimeSurfaces] = React.useState<Partial<Record<'3d' | 'geo', true>>>({})
  const heavyRuntimeIntentSurface = xrPhysicsRuntimeRunReadyDemo || citySimSourceIntent || gameplayOverlayActive ? null : resolveCanvasViewportHeavyRuntimeIntentSurface({
    isTouchViewport,
    geospatialOverlayOwnsViewport,
    canvasRenderMode,
  })
  const heavyRuntimeIntentBlocked = heavyRuntimeIntentSurface !== null && activatedHeavyRuntimeSurfaces[heavyRuntimeIntentSurface] !== true
  const threeCanvasSourceAdmissionRef = React.useRef(false)
  threeCanvasSourceAdmissionRef.current = retainThreeCanvasSourceAdmission(threeCanvasSourceAdmissionRef.current, sourceFilesBootstrapReady)
  const threeCanvasSurfaceMountedRef = React.useRef(false)
  const threeCanvasSurface = resolveThreeCanvasSurfaceLifecycle({
    sourceFilesBootstrapAdmitted: threeCanvasSourceAdmissionRef.current, sourceFilesBootstrapReady,
    rendererPreviouslyMounted: threeCanvasSurfaceMountedRef.current,
    geospatialOverlayOwnsViewport, liveCanvasHeroVisible, canvasRenderMode,
    heavyRuntimeIntentBlocked, activeSurface, documentSwitchOwnsViewport,
  })
  threeCanvasSurfaceMountedRef.current = threeCanvasSurface.mounted
  const activateHeavyRuntimeIntentSurface = React.useCallback(() => {
    if (!heavyRuntimeIntentSurface) return
    setActivatedHeavyRuntimeSurfaces(previous => {
      if (previous[heavyRuntimeIntentSurface] === true) return previous
      return { ...previous, [heavyRuntimeIntentSurface]: true }
    })
  }, [heavyRuntimeIntentSurface])
  const minimapOverlayVisible = !documentSwitchOwnsViewport
    && !geospatialOverlayOwnsViewport
    && !liveCanvasHeroVisible
    && !liveCanvasHeroEmbedPreview
    && !heavyRuntimeIntentBlocked
    && !isNarrowViewport
    && !gameplayOverlayActive
    && (
      (activeSurface === '2d' && supportsCanvas2dMinimap(canvas2dRenderer))
      || (activeSurface === '3d' && effectiveCanvas3dMode === '3d')
    )
  const minimapOverlaySurface = activeSurface === '3d' ? '3d' : '2d'
  const bridgeOnlyWidgetDropActive = !documentSwitchOwnsViewport
    && !geospatialOverlayOwnsViewport
    && !liveCanvasHeroVisible
    && !liveCanvasHeroEmbedPreview
    && canvasRenderMode === '2d'
    && active2dSurface !== 'storyboard'
  const rootRef = React.useRef<HTMLElement | null>(null)
  useForbidBrowserZoomWheel(rootRef, true, { stopPropagation: false })
  const workspaceXrViewportInset = xrPhysicsRuntimeRunReadyDemo
    && !gameplayOverlayActive
    && !liveCanvasHeroVisible
    && workspaceEditorOverlayOpen
    && String(workspaceVisibleCanvasLeft || '').trim()
      ? String(workspaceVisibleCanvasLeft).trim()
      : ''

  return (
    <section
      ref={rootRef}
      data-kg-canvas-viewport-root="1"
      data-kg-source-authority-phase={sourceFilesBootstrap.phase}
      className="relative w-full h-full overflow-hidden"
      style={{
        touchAction: 'manipulation',
        overscrollBehavior: 'none',
        WebkitTapHighlightColor: 'transparent',
        ...(workspaceXrViewportInset ? {
          marginLeft: workspaceXrViewportInset,
          width: `calc(100% - ${workspaceXrViewportInset})`,
        } : {}),
      }}
      aria-label={sourceFilesBootstrap.phase === 'error'
        ? 'Canvas source initialization error'
        : citySimActive ? 'Deterministic City Simulation'
          : gameFpsActive ? 'Deterministic Game Mode'
            : flightSimActive
              ? 'Deterministic Flight Sim'
              : sourceFilesBootstrapReady && xrPhysicsRuntimeRunReadyDemo
                ? 'Interactive XR Physics Playground'
                : variant === 'embeddedPreview'
                  ? 'Canvas Preview Only'
                  : 'Canvas viewport'}
    >
      <React.Suspense fallback={null}>
        {liveCanvasHeroVisible && liveCanvasHeroSource ? (
          <section
            className="absolute inset-0 z-[40]"
            data-kg-live-canvas-hero-viewport-owner="true"
          >
            <section
              className={`absolute inset-0 opacity-100 ${liveCanvasHeroSource.embedUrl ? 'pointer-events-auto' : 'pointer-events-none bg-[var(--kg-canvas-bg)]'}`}
              aria-label={liveCanvasHeroSource.embedUrl ? 'Shared interactive canvas background' : 'Home background unavailable'}
              data-kg-live-canvas-hero-background={liveCanvasHeroSource.embedUrl ? 'shared-embed' : 'unavailable'}
              data-kg-live-canvas-hero-source={liveCanvasHeroSource.sourcePath}
              data-kg-live-canvas-hero-source-graph-id={liveCanvasHeroSource.graphId || undefined}
            >
              {liveCanvasHeroSource.embedUrl ? (
                <iframe
                  ref={liveCanvasHeroEmbedRef}
                  key={liveCanvasHeroSource.embedUrl}
                  src={liveCanvasHeroSource.embedUrl}
                  title={`Interactive canvas embed for ${liveCanvasHeroSource.sourcePath}`}
                  className="absolute inset-0 h-full w-full border-0 bg-transparent"
                  sandbox="allow-forms allow-popups allow-same-origin allow-scripts"
                  allow={AGENTICGRAPH_XR_IFRAME_ALLOW}
                  allowFullScreen
                  referrerPolicy="strict-origin-when-cross-origin"
                  data-kg-live-canvas-hero-selected-embed="true"
                  data-kg-live-canvas-hero-embed-url={liveCanvasHeroSource.embedUrl}
                />
              ) : null}
            </section>
            <LiveCanvasHeroLazy source={liveCanvasHeroSource} sourceFiles={sourceFiles} onEnter={dismissLiveCanvasHero} />
          </section>
        ) : null}
        {!documentSwitchOwnsViewport && !geospatialOverlayOwnsViewport && canvasRenderMode === '2d' && (
          <section className="absolute inset-0 z-[10]">
            {liveCanvasHeroEmbedPreview && liveCanvasHeroEmbedGraph ? (
                <section
                  className="absolute inset-0 pointer-events-auto opacity-100"
                  aria-label={liveCanvasHeroEmbedPreviewSurface === 'storyboard' ? 'Shared interactive Storyboard canvas' : 'Shared interactive command-route canvas'}
                  data-kg-live-canvas-hero-embed-preview="true"
                  data-kg-live-canvas-hero-interactive="true"
                  data-kg-live-canvas-hero-embed-surface={liveCanvasHeroEmbedPreviewSurface || 'flow'}
                >
                  {liveCanvasHeroEmbedPreviewSurface === 'storyboard' ? (
                    <StoryboardWidgetCanvasLazy active storyboardWidgetSurfaceId="storyboard" storyboardCardsMode />
                  ) : (
                    <FlowCanvasLazy
                      active
                      graphDataOverride={liveCanvasHeroEmbedGraph}
                      mutationSourceGraphDataOverride={safeGraphData}
                      graphDataRevisionOverride={graphDataRevision}
                      canvas2dRendererOverride="flow"
                      suppressMediaOverlays
                      flowWidgetStateGraphKeyOverride={`live-hero-embed:${graphDataRevision}`}
                      forbidCircleNodes
                    />
                  )}
                </section>
            ) : !liveCanvasHeroVisible ? (
              <>
                <section
                  className={`absolute inset-0 ${sharedGraphCanvasSurfaceActive ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'}`}
                  aria-hidden={!sharedGraphCanvasSurfaceActive}
                  data-kg-shared-graph-canvas-surface={sharedGraphCanvasSurfaceActive ? active2dSurface || undefined : undefined}
                >
                  {sharedGraphCanvasSurfaceActive ? <SharedGraphCanvasLazy active /> : null}
                </section>
                <section className={`absolute inset-0 ${active2dSurface === 'dashboard' ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'}`} aria-hidden={active2dSurface !== 'dashboard'}>
                  {active2dSurface === 'dashboard' ? <DashboardCanvasLazy active /> : null}
                </section>
                <section className={`absolute inset-0 ${active2dSurface === 'gallery' ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'}`} aria-hidden={active2dSurface !== 'gallery'}>
                  {active2dSurface === 'gallery' ? <GalleryCanvasLazy active /> : null}
                </section>
                <section className={`absolute inset-0 ${active2dSurface === 'media' ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'}`} aria-hidden={active2dSurface !== 'media'}>
                  {active2dSurface === 'media' ? <MediaCanvasLazy /> : null}
                </section>
                <section className={`absolute inset-0 flex min-h-0 min-w-0 bg-[var(--kg-panel-bg)] ${active2dSurface === 'multiDimTable' ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'}`} aria-hidden={active2dSurface !== 'multiDimTable'}>
                  {active2dSurface === 'multiDimTable' ? <MultiDimTableSurfaceLazy active ariaLabel="Canvas Multi-dimensional Table" /> : null}
                </section>
                <section className={`absolute inset-0 ${active2dSurface === 'gitGraph' ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'}`} aria-hidden={active2dSurface !== 'gitGraph'}>
                  {active2dSurface === 'gitGraph' ? <MermaidGitGraphCanvasLazy active /> : null}
                </section>
                <section className={`absolute inset-0 ${active2dSurface === 'gantt' ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'}`} aria-hidden={active2dSurface !== 'gantt'}>
                  {active2dSurface === 'gantt' ? <MermaidGanttCanvasLazy active /> : null}
                </section>
                <section className={`absolute inset-0 ${active2dSurface === 'flow' ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'}`} aria-hidden={active2dSurface !== 'flow'}>
                  {active2dSurface === 'flow' ? <FlowCanvasLazy active /> : null}
                </section>
                <section className={`absolute inset-0 ${active2dSurface === 'animatic' ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'}`} aria-hidden={active2dSurface !== 'animatic'}>
                  {active2dSurface === 'animatic' ? <AnimaticCanvasLazy active /> : null}
                </section>
                <section className={`absolute inset-0 ${active2dSurface === 'design' ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'}`} aria-hidden={active2dSurface !== 'design'}>
                  {active2dSurface === 'design' ? <DesignCanvasLazy active /> : null}
                </section>
                <section className={`absolute inset-0 ${active2dSurface === 'storyboard' ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'}`} aria-hidden={active2dSurface !== 'storyboard'}>
                  {active2dSurface === 'storyboard' ? <StoryboardWidgetCanvasLazy active storyboardWidgetSurfaceId="storyboard" storyboardCardsMode /> : null}
                  {active2dSurface === 'storyboard' && floatingPanelOpen && floatingPanelView === 'view' ? (
                    <CanvasWorkspaceDataViewFloatingRegistrationBridgeLazy active fallbackDocumentName="storyboard.md" />
                  ) : null}
                </section>
              </>
            ) : null}
          </section>
        )}
        {bridgeOnlyWidgetDropActive ? (
          <section
            className="absolute inset-0 z-[30] pointer-events-none"
            aria-hidden="true"
            data-kg-storyboard-widget-drop-bridge="canvas"
          >
            <StoryboardWidgetDropBridgeLazy active={false} widgetDropCaptureEnabled />
          </section>
        ) : null}
        {threeCanvasSurface.mounted ? (
          <XrPhysicsSemanticMediaSurface
            active={threeCanvasSurface.active}
            geospatialComposite={geospatialXrModeEnabled}
            mode={effectiveCanvas3dMode}
            physicsRunReady={xrPhysicsRuntimeRunReadyDemo}
          />
        ) : null}
        {!documentSwitchOwnsViewport && geospatialCompositionEnabled && active2dSurface === 'storyboard' ? (
          <section className="absolute inset-0 z-[30] pointer-events-none" aria-hidden="true">
            <StoryboardWidgetDropBridgeLazy active={false} widgetDropCaptureEnabled geospatialWidgetPanelMode />
          </section>
        ) : null}

        {geospatialCompositionEnabled && !heavyRuntimeIntentBlocked ? (
          <SemanticMediaFigure
            active={citySimActive}
            activeDataAttributes={CITY_SIM_MEDIA_STAGE_DATA_ATTRIBUTES}
            label={CITY_SIM_MEDIA_STAGE_LABEL}
            selectionTarget="descendant"
          >
            {captionId => (
              <CanvasViewportGeospatialOverlayLazy
                active={activeSurface === 'geo' || activeSurface === 'geo-xr'}
                composedWithXr={geospatialXrModeEnabled}
                geospatialModeEnabled={geospatialCompositionEnabled}
                graphData={safeGraphData}
                semanticMediaOwner={citySimActive ? {
                  captionId,
                  label: CITY_SIM_MEDIA_STAGE_LABEL,
                  selectionAttribute: {
                    name: MEDIA_PREVIEW_SELECTABLE_SURFACE_ATTR,
                    value: MEDIA_PREVIEW_SELECTABLE_SURFACE_VALUE,
                  },
                } : undefined}
                storyboardWidgetPanelsActive={geospatialCompositionEnabled && active2dSurface === 'storyboard'}
                threeOverlayComposed={cityMapLibreSurfaceRequested ? false : geospatialXrModeEnabled}
              />
            )}
          </SemanticMediaFigure>
        ) : null}
        {!documentSwitchOwnsViewport && heavyRuntimeIntentSurface && heavyRuntimeIntentBlocked ? (
          <section
            className="absolute inset-0 z-[35] flex items-center justify-center bg-[var(--kg-canvas-bg)]/96 px-4"
            aria-label={`${CANVAS_VIEWPORT_HEAVY_RUNTIME_INTENT_COPY[heavyRuntimeIntentSurface].title} activation`}
            data-kg-canvas-heavy-runtime-intent={heavyRuntimeIntentSurface}
          >
            <section className="w-full max-w-sm rounded-2xl border border-[var(--kg-border)] bg-[var(--kg-panel-bg)] px-5 py-5 text-left shadow-sm">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--kg-text-secondary)]">
                {CANVAS_VIEWPORT_HEAVY_RUNTIME_INTENT_COPY[heavyRuntimeIntentSurface].eyebrow}
              </p>
              <h2 className="mt-2 text-base font-semibold text-[var(--kg-text-primary)]">
                {CANVAS_VIEWPORT_HEAVY_RUNTIME_INTENT_COPY[heavyRuntimeIntentSurface].title}
              </h2>
              <p className="mt-2 text-sm leading-6 text-[var(--kg-text-secondary)]">
                {CANVAS_VIEWPORT_HEAVY_RUNTIME_INTENT_COPY[heavyRuntimeIntentSurface].body}
              </p>
              <div className="mt-4 flex flex-wrap gap-3">
                <button
                  type="button"
                  className="App-toolbar__btn min-h-11 px-4 text-sm font-medium"
                  onClick={activateHeavyRuntimeIntentSurface}
                  data-kg-canvas-heavy-runtime-intent-activate={heavyRuntimeIntentSurface}
                >
                  {CANVAS_VIEWPORT_HEAVY_RUNTIME_INTENT_COPY[heavyRuntimeIntentSurface].action}
                </button>
              </div>
            </section>
          </section>
        ) : null}
        {sourceFilesBootstrap.phase === 'error' && !liveCanvasHeroVisible
          ? <CanvasSourceInitializationError error={sourceFilesBootstrap.error} />
          : null}

        {variant === 'workspace' ? (
          <>
            {layout === 'full' && !documentSwitchOwnsViewport && !liveCanvasHeroVisible ? (
              <React.Suspense fallback={null}>
                <LaunchSpotlightLazy />
              </React.Suspense>
            ) : null}
            {minimapOverlayVisible ? (
              <aside
                className={`${layout === 'pane' ? 'absolute kg-canvas-minimap-overlay--pane' : 'fixed'} ${UI_RESPONSIVE_CANVAS_MINIMAP_OVERLAY_CLASSNAME} ${workspaceEditorOverlayOpen ? 'z-[420]' : 'z-[201]'} pointer-events-auto isolate`}
                aria-label="Minimap Overlay"
                data-kg-minimap-overlay="1"
                data-kg-css-inspector-selectable="minimap-overlay"
                data-kg-minimap-overlay-placement="bottom-left"
                data-kg-minimap-overlay-surface={minimapOverlaySurface}
              >
                <MinimapLazy />
              </aside>
            ) : null}
            {timelineBottomPanelVisible && !liveCanvasHeroVisible ? (
              <StrybldrTimelineBottomPanelLazy
                active={strybldrTimelineBottomPanelVisible}
                initialView={
                  mermaidEventModelingBottomPanelVisible
                    ? 'eventModeling'
                    : mermaidArchitectureBottomPanelVisible
                      ? 'architecture'
                      : designTimelineBottomPanelVisible
                        ? 'designTimeline'
                        : mermaidTimelineBottomPanelVisible
                          ? 'timeline'
                          : mermaidGanttBottomPanelVisible
                            ? 'gantt'
                            : mermaidGitGraphBottomPanelVisible
                              ? 'gitGraph'
                              : mermaidFlowchartBottomPanelVisible
                                ? 'flowchart'
                                : documentVersionGraphBottomPanelVisible
                                  ? 'documentVersionGraph'
                                  : 'strybldrTimeline'
                }
                workspaceEditorOverlayOpen={workspaceEditorOverlayOpen}
              />
            ) : null}
            {!documentSwitchOwnsViewport && !liveCanvasHeroVisible && MARKDOWN_METRICS_DEV_ENABLED ? <MarkdownMetricsDevOverlayLazy layout={layout} /> : null}
            {!documentSwitchOwnsViewport && !liveCanvasHeroVisible && paywallOverlayActive ? <PaywallOverlayLazy portalTarget={rootRef.current} /> : null}
            {documentSwitchOwnsViewport ? (
              <section
                className="absolute inset-0 z-[80] flex items-center justify-center bg-[var(--kg-canvas-bg)]"
                aria-label={documentSwitchPendingLabel}
              >
                <section className="rounded border border-[var(--kg-border)] bg-[var(--kg-panel-bg)] px-4 py-3 text-center shadow-sm">
                  <p className="text-sm font-medium text-[var(--kg-text-primary)]">{documentSwitchPendingLabel}</p>
                  <p className="mt-1 text-xs text-[var(--kg-text-secondary)]">Preparing canvas view...</p>
                </section>
              </section>
            ) : null}
          </>
        ) : null}
      </React.Suspense>
      {sourceFilesBootstrapReady && xrPhysicsRunReadyDemo && !gameplayOverlayActive && !liveCanvasHeroVisible ? <XrNativeControllerDemoHud /> : null}
      {gameFpsHudVisible ? <GameFpsHudLazy /> : null}
      {flightSimHudVisible ? (
        <FlightSimHud />
      ) : null}
      {variant === 'workspace' ? <CanvasEmbedCodePanelHost /> : null}
    </section>
  )
}
