import React from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useGraphStore } from '@/hooks/useGraphStore'
import { useLocation } from 'react-router-dom'
import { VerticalResizeSeparatorHr } from '@/components/ui/VerticalResizeSeparatorHr'
import { CanvasSyncRuntime } from '@/features/canvas/CanvasSyncRuntime'
import { CanvasHotkeysRuntime } from '@/features/canvas/CanvasHotkeysRuntime'
import { useCanvasWorkspacePaneRuntime } from '@/features/canvas/useCanvasWorkspacePaneRuntime'
import { dispatchRuntimeZoomAction } from '@/lib/canvas/runtimeZoomDispatch'
import { useCanvasGeospatialRuntime } from '@/features/canvas/useCanvasGeospatialRuntime'
import { shouldOpenEditorWorkspaceFromSearch } from '@/features/canvas/canvasQueryBootstrapSearch'
import { buildDocDeepLinkIntentKey } from '@/features/canvas/canvasDocDeepLink'
import { CanvasRootRuntime } from '@/features/canvas/CanvasRootRuntime'
import { GraphStoreRuntime } from '@/features/canvas/GraphStoreRuntime'
import { useCanvasEmbeddedPreviewRuntime } from '@/features/canvas/useCanvasEmbeddedPreviewRuntime'
import { QUERY_PARAM_OPEN_EDITOR_WORKSPACE } from '@/lib/routing/queryParams'
import { isWorkspaceEditorOverlayOpen } from '@/features/workspace-table/workspaceTableSsot'
import { useMarkdownExplorerStore } from '@/features/markdown-explorer/store'
import { workspaceBasename } from '@/features/workspace-fs/path'
import { isMarkdownWorkspaceDocumentSwitchPending } from '@/lib/markdown-workspace-runtime/markdownWorkspaceDocumentSwitch'
import { WORKSPACE_EDITOR_CANVAS_GUTTER_CSS } from '@/features/workspace-table/workspaceViewCanvasDefaults'
import { WORKSPACE_VISIBLE_VIEWPORT_OCCLUDER_ATTR } from '@/lib/zoom/workspaceVisibleViewport'
import {
  UI_RESPONSIVE_CANVAS_DOCUMENT_SWITCH_NOTICE_CLASSNAME,
  UI_RESPONSIVE_CANVAS_PAGE_SURFACE_CLASSNAME,
  UI_RESPONSIVE_CANVAS_TOOLBAR_DOCK_CLASSNAME,
  UI_RESPONSIVE_CANVAS_TOOLBAR_DOCK_CONTENT_CLASSNAME,
  UI_RESPONSIVE_CANVAS_WORKSPACE_TOOLBAR_DOCK_CLASSNAME,
} from '@/lib/ui/responsiveElementClasses'
import { useMediaQuery } from '@/lib/ui/useMediaQuery'
import { isRouterRootAliasRuntime } from '@/lib/routing/basePath'
import { isXrPhysicsRunReadyDemoActive } from '@/features/workspace-fs/workspaceRunReadyDemos'

import { CanvasStartupRuntimes } from '@/features/canvas/CanvasStartupRuntimes'

const ToolbarLazy = React.lazy(() => import('@/components/Toolbar'))
const CanvasViewportLazy = React.lazy(() =>
  import('@/components/CanvasViewport').then(mod => ({ default: mod.CanvasViewport })),
)
const EmbeddedEditorShellLazy = React.lazy(() =>
  import('@/components/EmbeddedEditorShell').then(mod => ({ default: mod.EmbeddedEditorShell })),
)
const CanvasQueryBootstrapRuntimeLazy = React.lazy(() =>
  import('@/features/canvas/CanvasQueryBootstrapRuntime').then(mod => ({ default: mod.CanvasQueryBootstrapRuntime })),
)
const CanvasDocDeepLinkRuntimeLazy = React.lazy(() =>
  import('@/features/canvas/CanvasDocDeepLinkRuntime').then(mod => ({ default: mod.CanvasDocDeepLinkRuntime })),
)
const StripeCheckoutReturnRuntimeLazy = React.lazy(() =>
  import('@/features/payments/StripeCheckoutReturnRuntime').then(mod => ({ default: mod.StripeCheckoutReturnRuntime })),
)
const CanvasFrontmatterRuntimeLazy = React.lazy(() =>
  import('@/features/canvas/CanvasFrontmatterRuntime').then(mod => ({ default: mod.CanvasFrontmatterRuntime })),
)

export default function CanvasPage(props: { bootstrapRuntimesEnabled?: boolean } = {}) {
  const bootstrapRuntimesEnabled = props.bootstrapRuntimesEnabled !== false
  const location = useLocation()
  const { isEmbeddedPreview, setIsEmbeddedPreview, detectEmbeddedPreviewWriteback } = useCanvasEmbeddedPreviewRuntime(location.search)
  const xrPhysicsRunReadyDemo = isXrPhysicsRunReadyDemoActive()
  const dedicatedRunReadyDemo = xrPhysicsRunReadyDemo
  const previewOnly = isEmbeddedPreview || dedicatedRunReadyDemo
  const hasSearchParams = React.useMemo(() => String(location.search || '').trim().length > 0, [location.search])
  const documentIntentKey = React.useMemo(
    () => buildDocDeepLinkIntentKey(String(location.search || '')),
    [location.search],
  )
  const hasDocDeepLinkParams = Boolean(documentIntentKey)
  const [liveCanvasHeroOwnsWorkspace, setLiveCanvasHeroOwnsWorkspace] = React.useState(() => (
    isRouterRootAliasRuntime(import.meta.env.BASE_URL)
  ))

  const {
    uiOverlayOpacity,
    uiPanelOpacity,
    uiToolbarOpacity,
    workspaceViewMode,
    workspaceCanvasPaneOpen,
    setWorkspaceViewState,
  } = useGraphStore(
    useShallow(s => ({
      uiOverlayOpacity: s.uiOverlayOpacity,
      uiPanelOpacity: s.uiPanelOpacity,
      uiToolbarOpacity: s.uiToolbarOpacity,
      workspaceViewMode: s.workspaceViewMode,
      workspaceCanvasPaneOpen: s.workspaceCanvasPaneOpen,
      setWorkspaceViewState: s.setWorkspaceViewState,
    })),
  )

  const queryRequestsEditorWorkspace = shouldOpenEditorWorkspaceFromSearch(location.search)
  const launchSpotlightShortcutEnabled = !previewOnly && workspaceViewMode !== 'editor'
  const consumedEditorWorkspaceQueryRef = React.useRef(false)

  React.useEffect(() => {
    if (!queryRequestsEditorWorkspace || consumedEditorWorkspaceQueryRef.current) return
    consumedEditorWorkspaceQueryRef.current = true
    try {
      setWorkspaceViewState({ mode: 'editor', paneOpen: true })
    } catch {
      void 0
    }
    try {
      const params = new URLSearchParams(String(location.search || ''))
      if (!String(params.get(QUERY_PARAM_OPEN_EDITOR_WORKSPACE) || '').trim()) return
      params.delete(QUERY_PARAM_OPEN_EDITOR_WORKSPACE)
      const next = params.toString()
      const nextUrl = `${window.location.pathname}${next ? `?${next}` : ''}${window.location.hash || ''}`
      window.history.replaceState(null, '', nextUrl)
    } catch {
      void 0
    }
  }, [location.search, queryRequestsEditorWorkspace, setWorkspaceViewState])

  const [editorShellWarmed, setEditorShellWarmed] = React.useState(workspaceViewMode === 'editor')
  React.useEffect(() => {
    if (workspaceViewMode === 'editor') setEditorShellWarmed(true)
  }, [workspaceViewMode])

  const [toolbarHeaderElevated, setToolbarHeaderElevated] = React.useState(false)
  const toolbarHeaderRef = React.useRef<HTMLElement>(null)
  const editorOverlayRef = React.useRef<HTMLElement>(null)
  const toolbarHeaderLayerClassName = toolbarHeaderElevated ? 'z-[420]' : 'z-[290]'
  React.useEffect(() => {
    if (workspaceViewMode !== 'editor') setToolbarHeaderElevated(false)
  }, [workspaceViewMode])

  const { workspacePreviewWidthPx, setResizeHandleEl } = useCanvasWorkspacePaneRuntime()
  const activePath = useMarkdownExplorerStore(s => s.activePath)
  const workspaceEditorOverlayOpen = isWorkspaceEditorOverlayOpen({ workspaceViewMode, workspaceCanvasPaneOpen })
  const workspaceCanvasPaneVisible = workspaceEditorOverlayOpen && workspaceCanvasPaneOpen
  React.useEffect(() => {
    setToolbarHeaderElevated(false)
  }, [workspaceCanvasPaneVisible])
  const workspacePaneBoundaryCss = `min(${workspacePreviewWidthPx}px, calc(100% - ${WORKSPACE_EDITOR_CANVAS_GUTTER_CSS}))`
  const canvasToolbarDockSpansViewport = useMediaQuery('(max-width: 768px), (pointer: coarse)')
  const workspaceToolbarBoundaryStyle = React.useMemo<React.CSSProperties | undefined>(
    () => canvasToolbarDockSpansViewport ? undefined : { left: workspacePaneBoundaryCss },
    [canvasToolbarDockSpansViewport, workspacePaneBoundaryCss],
  )

  React.useEffect(() => {
    if (!workspaceEditorOverlayOpen) return
    void import('@/lib/canvas/interaction-recovery')
      .then(mod => {
        mod.runGlobalInteractionCleanup({ resetViewportControllers: false })
      })
      .catch(() => {
        void 0
      })
  }, [workspaceEditorOverlayOpen])

  const { canvasRenderMode, canvas3dMode, canvas2dRenderer } = useGraphStore(
    useShallow(s => ({
      canvasRenderMode: s.canvasRenderMode,
      canvas3dMode: s.canvas3dMode,
      canvas2dRenderer: s.canvas2dRenderer,
    })),
  )
  const {
    frontmatterModeEnabled,
    documentSemanticMode,
    markdownDocumentApplyViewPreset,
    markdownDocumentName,
    markdownDocumentText,
  } = useGraphStore(
    useShallow(s => ({
      frontmatterModeEnabled: s.frontmatterModeEnabled || false,
      documentSemanticMode: (s.documentSemanticMode || 'document') as 'document' | 'keyword',
      markdownDocumentApplyViewPreset: s.markdownDocumentApplyViewPreset,
      markdownDocumentName: s.markdownDocumentName,
      markdownDocumentText: s.markdownDocumentText,
    })),
  )
  const workspaceDocumentSwitchPending = isMarkdownWorkspaceDocumentSwitchPending({
    activePath,
    markdownDocumentName,
    ownerActive: workspaceEditorOverlayOpen,
  })
  const switchingDocumentLabel = React.useMemo(() => {
    if (!activePath) return 'Switching document...'
    const basename = workspaceBasename(activePath)
    return basename ? `Switching document: ${basename}` : 'Switching document...'
  }, [activePath])
  const geospatialModeEnabled = useCanvasGeospatialRuntime()
  const shouldMountCanvasFrontmatterRuntime = React.useMemo(() => {
    if (documentSemanticMode !== 'document') return false
    if (markdownDocumentApplyViewPreset === false) return false
    if (!frontmatterModeEnabled) return false
    return String(markdownDocumentText || '').trim().length > 0
  }, [
    documentSemanticMode,
    frontmatterModeEnabled,
    markdownDocumentApplyViewPreset,
    markdownDocumentText,
  ])

  const handleZoomSelection = React.useCallback(() => {
    void dispatchRuntimeZoomAction('selection')
  }, [])

  return (
    <>
      <CanvasRootRuntime
        uiOverlayOpacity={uiOverlayOpacity}
        uiPanelOpacity={uiPanelOpacity}
        uiToolbarOpacity={uiToolbarOpacity}
      />
      {bootstrapRuntimesEnabled ? <GraphStoreRuntime /> : null}
      {bootstrapRuntimesEnabled && hasSearchParams ? (
        <React.Suspense fallback={null}>
          <CanvasQueryBootstrapRuntimeLazy search={location.search} />
        </React.Suspense>
      ) : null}
      {shouldMountCanvasFrontmatterRuntime ? (
        <React.Suspense fallback={null}>
          <CanvasFrontmatterRuntimeLazy />
        </React.Suspense>
      ) : null}
      <CanvasHotkeysRuntime
        geospatialModeEnabled={geospatialModeEnabled}
        launchSpotlightShortcutEnabled={launchSpotlightShortcutEnabled}
      />
      <CanvasSyncRuntime
        isEmbeddedPreview={isEmbeddedPreview}
        setIsEmbeddedPreview={setIsEmbeddedPreview}
        detectEmbeddedPreviewWriteback={detectEmbeddedPreviewWriteback}
      />
      {bootstrapRuntimesEnabled && hasDocDeepLinkParams ? (
        <React.Suspense fallback={null}>
          <CanvasDocDeepLinkRuntimeLazy search={location.search} />
        </React.Suspense>
      ) : null}
      {hasSearchParams ? (
        <React.Suspense fallback={null}>
          <StripeCheckoutReturnRuntimeLazy search={location.search} />
        </React.Suspense>
      ) : null}
      {bootstrapRuntimesEnabled ? <CanvasStartupRuntimes /> : null}
      <section
        className={`${UI_RESPONSIVE_CANVAS_PAGE_SURFACE_CLASSNAME} bg-[var(--kg-canvas-bg)] transition-colors duration-300`}
        aria-label="agentic-graph Canvas"
      >
        {previewOnly ? (
          <main
            className="flex-1 relative overflow-hidden"
            aria-label={xrPhysicsRunReadyDemo ? 'XR Physics Playground' : 'Canvas Preview Only'}
            data-kg-xr-physics-run-ready={xrPhysicsRunReadyDemo ? 'full-frame' : undefined}
          >
            <React.Suspense fallback={null}>
              <CanvasViewportLazy
                variant="embeddedPreview"
                geospatialModeEnabled={dedicatedRunReadyDemo ? false : geospatialModeEnabled}
                workspaceEditorOverlayOpen={false}
                canvasRenderMode={dedicatedRunReadyDemo ? '3d' : canvasRenderMode}
                canvas3dMode={dedicatedRunReadyDemo ? 'xr' : canvas3dMode}
                canvas2dRenderer={canvas2dRenderer}
                documentSwitchPending={hasDocDeepLinkParams}
                documentSwitchPendingLabel="Loading shared canvas..."
              />
            </React.Suspense>
          </main>
        ) : (
          <>
            {workspaceCanvasPaneVisible && !liveCanvasHeroOwnsWorkspace ? (
              <header
                ref={toolbarHeaderRef}
                className={`absolute inset-0 pointer-events-none ${toolbarHeaderLayerClassName}`}
                aria-label="Workspace Toolbar Header"
                data-kg-workspace-toolbar-layer={toolbarHeaderElevated ? 'above-editor' : 'under-editor'}
              >
                <nav
                  className={UI_RESPONSIVE_CANVAS_WORKSPACE_TOOLBAR_DOCK_CLASSNAME}
                  style={workspaceToolbarBoundaryStyle}
                  aria-label="Canvas Toolbar"
                  role="navigation"
                >
                  <section
                    className={UI_RESPONSIVE_CANVAS_TOOLBAR_DOCK_CONTENT_CLASSNAME}
                    onPointerDownCapture={() => setToolbarHeaderElevated(true)}
                  >
                    {workspaceDocumentSwitchPending ? (
                      <section
                        className={UI_RESPONSIVE_CANVAS_DOCUMENT_SWITCH_NOTICE_CLASSNAME}
                        aria-label={switchingDocumentLabel}
                      >
                        {switchingDocumentLabel}
                      </section>
                    ) : null}
                    <React.Suspense fallback={null}>
                      <ToolbarLazy onZoomSelection={handleZoomSelection} />
                    </React.Suspense>
                  </section>
                </nav>
              </header>
            ) : null}

            <main className="flex-1 flex overflow-hidden" aria-label="Canvas Workspace">
              <section className="flex-1 flex flex-col overflow-hidden" aria-label="Workspace stage">
                <section className="relative flex-1 min-h-0 overflow-hidden" aria-label="Workspace overlay stage">
                  <section
                    className="absolute inset-0 min-h-0 overflow-hidden bg-[var(--kg-canvas-bg)]"
                    aria-label="Canvas pane"
                  >
                    {!workspaceEditorOverlayOpen && !liveCanvasHeroOwnsWorkspace ? (
                      <nav
                        className={UI_RESPONSIVE_CANVAS_TOOLBAR_DOCK_CLASSNAME}
                        aria-label="Canvas Toolbar"
                        role="navigation"
                      >
                        <section className={UI_RESPONSIVE_CANVAS_TOOLBAR_DOCK_CONTENT_CLASSNAME}>
                          {workspaceDocumentSwitchPending ? (
                            <section
                              className={UI_RESPONSIVE_CANVAS_DOCUMENT_SWITCH_NOTICE_CLASSNAME}
                              aria-label={switchingDocumentLabel}
                            >
                              {switchingDocumentLabel}
                            </section>
                          ) : null}
                          <React.Suspense fallback={null}>
                            <ToolbarLazy onZoomSelection={handleZoomSelection} />
                          </React.Suspense>
                        </section>
                      </nav>
                    ) : null}
                    <React.Suspense fallback={null}>
                      <CanvasViewportLazy
                        variant="workspace"
                        layout="full"
                        geospatialModeEnabled={geospatialModeEnabled}
                        workspaceEditorOverlayOpen={workspaceEditorOverlayOpen}
                        workspaceVisibleCanvasLeft={workspaceCanvasPaneVisible ? workspacePaneBoundaryCss : undefined}
                        canvasRenderMode={canvasRenderMode}
                        canvas3dMode={canvas3dMode}
                        canvas2dRenderer={canvas2dRenderer}
                        documentSwitchPending={workspaceDocumentSwitchPending}
                        documentSwitchPendingLabel={switchingDocumentLabel}
                        onLiveCanvasHeroVisibilityChange={setLiveCanvasHeroOwnsWorkspace}
                      />
                    </React.Suspense>
                  </section>

                  {workspaceEditorOverlayOpen && !liveCanvasHeroOwnsWorkspace ? (
                    <section
                      ref={editorOverlayRef}
                      className="absolute inset-0 z-[300] pointer-events-none"
                      aria-label="Workspace editor overlay shell"
                      onPointerDown={() => setToolbarHeaderElevated(false)}
                    >
                      <section
                        className={`absolute inset-y-0 left-0 pointer-events-auto overflow-hidden bg-[var(--kg-panel-bg)] ${workspaceCanvasPaneVisible ? 'border-r border-[var(--kg-border)] shadow-2xl' : ''}`}
                        style={{ width: workspaceCanvasPaneVisible ? workspacePaneBoundaryCss : '100%' }}
                        aria-label="Workspace left pane"
                        data-kg-workspace-left-pane="1"
                        {...{ [WORKSPACE_VISIBLE_VIEWPORT_OCCLUDER_ATTR]: 'left' }}
                      >
                        {editorShellWarmed ? (
                          <React.Suspense fallback={null}>
                            <EmbeddedEditorShellLazy active={workspaceEditorOverlayOpen} />
                          </React.Suspense>
                        ) : null}
                      </section>

                      {workspaceCanvasPaneVisible ? (
                        <VerticalResizeSeparatorHr
                          ref={setResizeHandleEl}
                          ariaLabel="Resize canvas"
                          visualStyle="centerGrip"
                          className="absolute inset-y-0 left-0 z-[301] h-full -translate-x-1/2 pointer-events-auto"
                          style={{ left: workspacePaneBoundaryCss }}
                        />
                      ) : null}
                    </section>
                  ) : null}
                </section>
              </section>
            </main>
          </>
        )}
      </section>
    </>
  )
}
