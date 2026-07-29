import React from 'react'
import { useShallow } from 'zustand/react/shallow'
import { ChevronDown } from 'lucide-react'
import { setMediaCatalogMode } from '@/features/command-menu/mediaCatalogModeRuntime'
import { useOrchestratorPanelState } from '@/features/panels/hooks/useOrchestratorPanelState'
import { GRAPH_TRAVERSAL_FLOATING_PANEL_EVENT } from '@/features/panels/utils/useMainPanelRect'
import OrchestratorSettingsSection from '@/features/panels/views/OrchestratorSettingsSection'
import IconButton from '@/components/IconButton'
import { ToolbarDropdownSelect } from '@/components/toolbar/ToolbarDropdownSelect'
import { ToolbarToolMenuRendererView } from '@/features/toolbar/ToolbarToolMenuRendererView'
import { useGraphStore } from '@/hooks/useGraphStore'
import type { FloatingPanelView } from '@/hooks/store/store-types/graph-state-chat-import'
import { getIconSizeClass } from '@/lib/ui'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import {
  UI_RESPONSIVE_FLOATING_PANEL_SCROLL_CLASSNAME,
  UI_RESPONSIVE_NARROW_TOOLBAR_DROPDOWN_WIDTH_CLASSNAME,
  UI_RESPONSIVE_PANEL_HEADER_ROW_CLASSNAME,
  UI_RESPONSIVE_SAFE_VIEWPORT_PANEL_CLASSNAME,
} from '@/lib/ui/responsiveElementClasses'
import { usePanelTypography } from '@/lib/ui/panelTypography'
import { usePinnedLs } from '@/lib/ui/panelPinned'
import { uiPrimaryPillActiveClassName, uiToolbarRowScrollClassName, uiToolbarRowScrollJustifyBetweenClassName } from '@/features/toolbar/ui/toolbarStyles'
import { cn } from '@/lib/utils'
import { Z_INDEX_FLOATING_PANEL_DEFAULT } from '@/lib/ui/zIndex'
import {
  FLOATING_PANEL_CANVAS_PANEL_HEIGHT_CSS,
  resolveFloatingPanelWidthCss,
} from '@/lib/ui/floatingPanelGeometry'
import { LS_KEYS, UI_LABELS, UI_SELECTORS } from '@/lib/config'
import HeaderActions from '@/features/panels/ui/HeaderActions'
import {
  FLOATING_PANEL_TYPE_ICON_BY_VIEW,
} from '@/features/panels/ui/mainPanelHelpIconLibrary'
import { FloatingPropsPanel } from '@/features/toolbar/FloatingPropsPanel'
import { FloatingPanelSkillsCommandsView } from '@/features/toolbar/FloatingPanelSkillsCommandsView'; import { FloatingPanelPromptPresetsView } from '@/features/toolbar/FloatingPanelPromptPresetsView'
import { DesignFloatingPanelView } from '@/features/design/DesignFloatingPanelView'
import type { ToolbarToolMenuProps } from '@/features/toolbar/ToolbarToolMenuTypes'
import { requestGeospatialTraversalRun, setGeospatialModeEnabled as enableGeospatialMode } from '@/features/geospatial/gympgrphBridge'
import { onGeospatialModeChanged } from '@/features/geospatial/events'
import { readGeospatialOverlayEnabledPreference } from '@/lib/geospatial/geospatialModePreference'
import { openOrchestratorWorkflowWorkspaceFile } from '@/features/panels/utils/orchestratorWorkspaceFiles'
import { isWorkspaceEditorOverlayOpen } from '@/features/workspace-table/workspaceTableSsot'
import { WorkspaceDataViewFloatingPanelView } from '@/features/markdown-workspace/main/viewer/WorkspaceDataViewFloatingPanelView'
import { PanelFormDensityProvider } from '@/lib/ui/panelFormControls'
import { useWorkspaceDataViewFloatingDensity } from '@/features/markdown-workspace/main/viewer/workspaceDataViewFloatingStore'
import { GeoView } from '@/lib/toolbar/ToolbarToolMenuGeoView'
import { routeToolbarXrScenePanel } from '@/features/three/toolbarXrScenePanelRouting'
import {
  FloatingPanelHeaderStatus,
  useFloatingPanelDevStatusMetrics,
} from '@/lib/toolbar/ToolbarToolMenuStatus'
import { FloatingPanelXrSceneView } from '@/lib/toolbar/FloatingPanelXrSceneViews'

type RequestedFloatingPanelView = FloatingPanelView; type FloatingManagedHeaderActionsView = 'renderer'
type FloatingHeaderActions = {
  apply?: () => void
  reset?: () => void
  applyDisabled?: boolean
  resetDisabled?: boolean
}

type FloatingPanelViewButtonSpec = {
  view: FloatingPanelView
  title: string
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>
  disabled?: boolean
  hidden?: boolean
  spotlightView?: string
}

type FloatingPanelOverflowOption = {
  id: FloatingPanelView
  title: string
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>
  disabled?: boolean
  hidden?: boolean
}

const FloatingPanelChatLazy = React.lazy(() => import('@/features/chat/FloatingPanelChat'))
const StoryboardWidgetFloatingPanelViewLazy = React.lazy(() => import('@/features/storyboard-widget-manager/StoryboardWidgetFloatingPanelView').then(mod => ({ default: mod.StoryboardWidgetFloatingPanelView })))
const FlowchartFloatingPanelViewLazy = React.lazy(() => import('@/features/gitgraph/FlowchartFloatingPanelView').then(mod => ({ default: mod.FlowchartFloatingPanelView })))
const GitGraphFloatingPanelViewLazy = React.lazy(() => import('@/features/gitgraph/GitGraphFloatingPanelView').then(mod => ({ default: mod.GitGraphFloatingPanelView })))
const GanttFloatingPanelViewLazy = React.lazy(() => import('@/features/gitgraph/GanttFloatingPanelView').then(mod => ({ default: mod.GanttFloatingPanelView })))
const TimelineFloatingPanelViewLazy = React.lazy(() => import('@/features/gitgraph/TimelineFloatingPanelView').then(mod => ({ default: mod.TimelineFloatingPanelView })))
const ArchitectureFloatingPanelViewLazy = React.lazy(() => import('@/features/gitgraph/ArchitectureFloatingPanelView').then(mod => ({ default: mod.ArchitectureFloatingPanelView })))
const EventModelingFloatingPanelViewLazy = React.lazy(() => import('@/features/gitgraph/EventModelingFloatingPanelView').then(mod => ({ default: mod.EventModelingFloatingPanelView })))

const FLOATING_PANEL_FULL_HEIGHT_VIEWS = new Set<FloatingPanelView>(['skillsCommands', 'promptPresets', 'view', 'animation', 'motionControl', 'gameMode', 'flightSim', 'cityBuilder', 'camera', 'chat', 'geo', 'storyboardWidget', 'flowchart', 'gitGraph', 'gantt', 'timeline', 'architecture', 'eventModeling'])

const FLOATING_PANEL_PRIMARY_VIEW_BUTTON_SPECS: FloatingPanelViewButtonSpec[] = [
  { view: 'propsPanel', title: UI_LABELS.propsPanel, icon: FLOATING_PANEL_TYPE_ICON_BY_VIEW.propsPanel },
  { view: 'skillsCommands', title: UI_LABELS.skillsCommands, icon: FLOATING_PANEL_TYPE_ICON_BY_VIEW.skillsCommands }, { view: 'promptPresets', title: UI_LABELS.promptPresets, icon: FLOATING_PANEL_TYPE_ICON_BY_VIEW.promptPresets },
  { view: 'view', title: UI_LABELS.view, icon: FLOATING_PANEL_TYPE_ICON_BY_VIEW.view },
  { view: 'media', title: 'Media', icon: FLOATING_PANEL_TYPE_ICON_BY_VIEW.media },
  { view: 'animation', title: 'Animation', icon: FLOATING_PANEL_TYPE_ICON_BY_VIEW.animation },
  { view: 'motionControl', title: UI_LABELS.motionControl, icon: FLOATING_PANEL_TYPE_ICON_BY_VIEW.motionControl },
  { view: 'gameMode', title: UI_LABELS.gameMode, icon: FLOATING_PANEL_TYPE_ICON_BY_VIEW.gameMode },
  { view: 'flightSim', title: UI_LABELS.flightSim, icon: FLOATING_PANEL_TYPE_ICON_BY_VIEW.flightSim },
  { view: 'cityBuilder', title: UI_LABELS.cityBuilder, icon: FLOATING_PANEL_TYPE_ICON_BY_VIEW.cityBuilder },
  { view: 'camera', title: 'Camera', icon: FLOATING_PANEL_TYPE_ICON_BY_VIEW.camera },
  { view: 'design', title: 'Design', icon: FLOATING_PANEL_TYPE_ICON_BY_VIEW.design },
  { view: 'chat', title: UI_LABELS.chat, icon: FLOATING_PANEL_TYPE_ICON_BY_VIEW.chat },
  { view: 'geo', title: UI_LABELS.geo, icon: FLOATING_PANEL_TYPE_ICON_BY_VIEW.geo },
  { view: 'renderer', title: UI_LABELS.renderer, icon: FLOATING_PANEL_TYPE_ICON_BY_VIEW.renderer },
  { view: 'storyboardWidget', title: 'Storyboard Widget', icon: FLOATING_PANEL_TYPE_ICON_BY_VIEW.storyboardWidget },
  { view: 'flowchart', title: 'Flowchart', icon: FLOATING_PANEL_TYPE_ICON_BY_VIEW.flowchart },
  { view: 'gitGraph', title: UI_LABELS.gitGraph, icon: FLOATING_PANEL_TYPE_ICON_BY_VIEW.gitGraph },
  { view: 'gantt', title: UI_LABELS.gantt, icon: FLOATING_PANEL_TYPE_ICON_BY_VIEW.gantt },
  { view: 'timeline', title: UI_LABELS.timeline, icon: FLOATING_PANEL_TYPE_ICON_BY_VIEW.timeline },
  { view: 'architecture', title: 'Architecture', icon: FLOATING_PANEL_TYPE_ICON_BY_VIEW.architecture },
  { view: 'eventModeling', title: 'Event Model', icon: FLOATING_PANEL_TYPE_ICON_BY_VIEW.eventModeling },
]

const FLOATING_PANEL_VISIBLE_OVERFLOW_OPTIONS: FloatingPanelOverflowOption[] = [{
  id: 'graphTraversal',
  title: UI_LABELS.graphTraversal,
  icon: FLOATING_PANEL_TYPE_ICON_BY_VIEW.graphTraversal,
}]

export function ToolbarToolMenu({
  pipelineStatus,
  exportStatus,
  toolMenuCardRef,
  toolMenuCardStyle,
  onHeaderPointerDown,
  requestedFloatingPanelView,
  requestedFloatingPanelViewSeq,
  onClose,
}: ToolbarToolMenuProps) {
  const { pinned: floatingPanelPinned, togglePinned: toggleFloatingPanelPinned } = usePinnedLs(LS_KEYS.floatingPanelPinned, true)
  const [floatingPanelMinimized, setFloatingPanelMinimized] = React.useState(false)
  const floatingPanelView = useGraphStore(s => (s.floatingPanelView || 'propsPanel') as FloatingPanelView)
  const setFloatingPanelView = useGraphStore(s => s.setFloatingPanelView)
  const panelFormDensity = useWorkspaceDataViewFloatingDensity()
  const [managedHeaderActions, setManagedHeaderActions] = React.useState<FloatingHeaderActions>({
    apply: undefined,
    reset: undefined,
    applyDisabled: true,
    resetDisabled: true,
  })
  const handledRequestedViewSeqRef = React.useRef<number | undefined>(undefined)
  const setFloatingPanelZIndex = useGraphStore(s => s.setFloatingPanelZIndex)

  const [geospatialModeEnabled, setGeospatialModeEnabledState] = React.useState<boolean>(() => readGeospatialOverlayEnabledPreference())
  const [isEnablingGeospatial, setIsEnablingGeospatial] = React.useState(false)
  const [geospatialEnableError, setGeospatialEnableError] = React.useState<string | null>(null)

  const {
    floatingPanelWidthRatio,
    floatingPanelZIndex,
    uiIconScale,
    uiIconStrokeWidth,
    workspaceViewMode,
    workspaceCanvasPaneOpen,
    canvasRenderMode, canvas3dMode,
    canvas2dRenderer,
  } = useGraphStore(
    useShallow(state => ({
      floatingPanelWidthRatio: state.floatingPanelWidthRatio,
      floatingPanelZIndex: state.floatingPanelZIndex,
      uiIconScale: state.uiIconScale,
      uiIconStrokeWidth: state.uiIconStrokeWidth,
      workspaceViewMode: state.workspaceViewMode,
      workspaceCanvasPaneOpen: state.workspaceCanvasPaneOpen,
      canvasRenderMode: state.canvasRenderMode, canvas3dMode: state.canvas3dMode,
      canvas2dRenderer: state.canvas2dRenderer,
    })),
  )
  const workspaceEditorOverlayOpen = isWorkspaceEditorOverlayOpen({ workspaceViewMode, workspaceCanvasPaneOpen })

  const devStatusMetrics = useFloatingPanelDevStatusMetrics()

  const {
    fontClass: uiPanelTextFontClass,
    textSizeClass: uiPanelKeyValueTextSizeClass,
    microLabelTextSizeClass: uiPanelMicroLabelTextSizeClass,
  } = usePanelTypography()

  const { sections: orchestratorSections } = useOrchestratorPanelState()
  const orchestratorSectionCollapsedById = orchestratorSections.byId
  const orchestratorSectionSetters = orchestratorSections.setters

  const orchestratorGraphRagCollapsed = orchestratorSectionCollapsedById.graphRag
  const orchestratorPresetsCollapsed = orchestratorSectionCollapsedById.presets
  const orchestratorEditorCollapsed = orchestratorSectionCollapsedById.editor
  const orchestratorContextCollapsed = orchestratorSectionCollapsedById.context
  const orchestratorWorkflowIndexingCollapsed = orchestratorSectionCollapsedById.workflowIndexing
  const orchestratorWorkflowTracingCollapsed = orchestratorSectionCollapsedById.workflowTracing

  const setOrchestratorGraphRagCollapsed = orchestratorSectionSetters.graphRag
  const setOrchestratorPresetsCollapsed = orchestratorSectionSetters.presets
  const setOrchestratorEditorCollapsed = orchestratorSectionSetters.editor
  const setOrchestratorContextCollapsed = orchestratorSectionSetters.context
  const setOrchestratorWorkflowIndexingCollapsed = orchestratorSectionSetters.workflowIndexing
  const setOrchestratorWorkflowTracingCollapsed = orchestratorSectionSetters.workflowTracing

  const ensureGeospatialEnabled = React.useCallback(async (): Promise<boolean> => {
    if (geospatialModeEnabled) {
      setGeospatialEnableError(null)
      return true
    }
    setIsEnablingGeospatial(true)
    setGeospatialEnableError(null)
    try {
      const nextEnabled = await enableGeospatialMode(true)
      setGeospatialModeEnabledState(nextEnabled)
      if (!nextEnabled) {
        setGeospatialEnableError('Geospatial Mode is still disabled. Check MainPanel Maps and try again.')
      }
      return nextEnabled
    } catch (err) {
      const message =
        err && typeof err === 'object' && 'message' in err
          ? String((err as { message?: unknown }).message || '').trim()
          : ''
      const fallback = message || 'Unknown error'
      setGeospatialEnableError(`Geospatial Mode failed to load: ${fallback}`)
      try {
        useGraphStore.getState().pushUiToast({
          id: 'floating-geo-enable-error',
          kind: 'error',
          message: `Geospatial Mode failed to load: ${fallback}`,
        })
      } catch {
        void 0
      }
      return false
    } finally {
      setIsEnablingGeospatial(false)
    }
  }, [geospatialModeEnabled])

  const handleSelectView = React.useCallback((view: RequestedFloatingPanelView) => {
    if (routeToolbarXrScenePanel({ view, canvasRenderMode, canvas3dMode })) return
    if (view === 'media') setMediaCatalogMode(canvasRenderMode === '3d' && canvas3dMode === 'xr' ? 'xr-3d' : 'media')
    setFloatingPanelView(view)
    if (view === 'geo') void ensureGeospatialEnabled()
  }, [canvas3dMode, canvasRenderMode, ensureGeospatialEnabled, setFloatingPanelView])

  const handleFloatingPanelPointerDown = React.useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      event.stopPropagation()
      const target = event.target
      if (!(target instanceof Element)) return
      if (
        target.closest(
          UI_SELECTORS.draggablePanelIgnorePointerDown,
        )
      ) {
        return
      }
      if (floatingPanelPinned) return
      try {
        event.preventDefault()
      } catch {
        void 0
      }
      onHeaderPointerDown(event)
    },
    [floatingPanelPinned, onHeaderPointerDown],
  )

  const floatingPanelRootClassName = 'fixed inset-0 pointer-events-none'
  const handlePinToggle = toggleFloatingPanelPinned
  const registerManagedHeaderActions = React.useCallback((actions: FloatingHeaderActions) => {
    setManagedHeaderActions(actions)
  }, [])
  const floatingPanelRootStyle = React.useMemo(() => {
    const safeZ = Number.isFinite(floatingPanelZIndex) ? Math.max(1, Math.floor(floatingPanelZIndex)) : Z_INDEX_FLOATING_PANEL_DEFAULT
    if (floatingPanelPinned) return { zIndex: Math.max(safeZ, 1000) }
    return { zIndex: Math.max(safeZ, workspaceEditorOverlayOpen ? 420 : 90) }
  }, [floatingPanelPinned, floatingPanelZIndex, workspaceEditorOverlayOpen])

  const floatingPanelSizeStyle = React.useMemo(() => {
    return {
      width: resolveFloatingPanelWidthCss(floatingPanelWidthRatio),
      height: FLOATING_PANEL_CANVAS_PANEL_HEIGHT_CSS,
      maxHeight: FLOATING_PANEL_CANVAS_PANEL_HEIGHT_CSS,
    }
  }, [floatingPanelWidthRatio])

  const iconSizeClass = getIconSizeClass(uiIconScale)
  const designPanelsAvailable =
    !geospatialModeEnabled && workspaceViewMode === 'canvas' && canvasRenderMode === '2d' && canvas2dRenderer === 'design'
  const managedHeaderActionsView: FloatingManagedHeaderActionsView | null =
    floatingPanelView === 'renderer' ? floatingPanelView : null
  const floatingPanelBodyClassName = cn(
    'mt-1',
    FLOATING_PANEL_FULL_HEIGHT_VIEWS.has(floatingPanelView)
      ? 'flex-1 min-h-0 overflow-hidden'
      : UI_RESPONSIVE_FLOATING_PANEL_SCROLL_CLASSNAME,
    uiPanelTextFontClass,
    uiPanelKeyValueTextSizeClass,
    UI_THEME_TOKENS.text.primary,
  )

  const isOverflowViewActive = floatingPanelView === 'graphTraversal'
  const overflowValue = React.useMemo(() => {
    if (floatingPanelView === 'graphTraversal') {
      return floatingPanelView
    }
    const fallback = FLOATING_PANEL_VISIBLE_OVERFLOW_OPTIONS.find(option => !option.disabled)?.id ?? FLOATING_PANEL_VISIBLE_OVERFLOW_OPTIONS[0]?.id
    return fallback ?? 'graphTraversal'
  }, [floatingPanelView])

  const viewButtons = (
    <>
      {FLOATING_PANEL_PRIMARY_VIEW_BUTTON_SPECS.map(spec => {
        if (spec.hidden) return null
        const Icon = spec.icon
        return (
          <IconButton
            key={spec.view}
            title={spec.title}
            onClick={() => handleSelectView(spec.view)}
            disabled={spec.disabled}
            className={`App-toolbar__btn ${
              floatingPanelView === spec.view ? uiPrimaryPillActiveClassName : UI_THEME_TOKENS.text.secondary
            }`}
            showTooltip
            data-kg-floating-panel-view-trigger={spec.view} data-kg-spotlight-view={spec.spotlightView}
          >
            <Icon className={iconSizeClass} strokeWidth={uiIconStrokeWidth} aria-hidden={true} />
          </IconButton>
        )
      })}
      {FLOATING_PANEL_VISIBLE_OVERFLOW_OPTIONS.length > 0 ? (
        <ToolbarDropdownSelect
          value={overflowValue}
          options={FLOATING_PANEL_VISIBLE_OVERFLOW_OPTIONS}
          title="More floating views"
          showTooltip={false}
          isButtonActive={isOverflowViewActive}
          onSelect={id => handleSelectView(id as FloatingPanelView)}
          renderButtonContent={() => <ChevronDown className={iconSizeClass} strokeWidth={uiIconStrokeWidth} />}
          renderOptionContent={option => (
            <>
              <option.icon className={iconSizeClass} strokeWidth={uiIconStrokeWidth} />
              <span className="truncate">{option.title}</span>
            </>
          )}
          menuWidthClass={UI_RESPONSIVE_NARROW_TOOLBAR_DROPDOWN_WIDTH_CLASSNAME}
        />
      ) : null}
    </>
  )

  React.useEffect(() => {
    return onGeospatialModeChanged(detail => {
      const enabled = typeof detail.enabled === 'boolean' ? detail.enabled : null
      if (enabled == null) return
      setGeospatialModeEnabledState(enabled)
      if (enabled) setGeospatialEnableError(null)
    })
  }, [])

  React.useEffect(() => {
    if (!floatingPanelPinned) return
    if (!Number.isFinite(floatingPanelZIndex)) return
    if (floatingPanelZIndex >= 1000) return
    setFloatingPanelZIndex(1000)
  }, [floatingPanelPinned, floatingPanelZIndex, setFloatingPanelZIndex])

  React.useEffect(() => {
    if (!requestedFloatingPanelView || !requestedFloatingPanelViewSeq || handledRequestedViewSeqRef.current === requestedFloatingPanelViewSeq) return
    handledRequestedViewSeqRef.current = requestedFloatingPanelViewSeq
    setFloatingPanelMinimized(false)
    handleSelectView(requestedFloatingPanelView)
  }, [handleSelectView, requestedFloatingPanelView, requestedFloatingPanelViewSeq])

  React.useEffect(() => {
    if (floatingPanelView === 'renderer') return
    setManagedHeaderActions({
      apply: undefined,
      reset: undefined,
      applyDisabled: true,
      resetDisabled: true,
    })
  }, [floatingPanelView])

  React.useEffect(() => {
    const handleOpenGraphTraversal = () => {
      setFloatingPanelMinimized(false)
      setFloatingPanelView('graphTraversal')
    }
    window.addEventListener(GRAPH_TRAVERSAL_FLOATING_PANEL_EVENT, handleOpenGraphTraversal)
    return () => {
      window.removeEventListener(GRAPH_TRAVERSAL_FLOATING_PANEL_EVENT, handleOpenGraphTraversal)
    }
  }, [setFloatingPanelView])

  if (floatingPanelMinimized) {
    return (
      <section className={floatingPanelRootClassName} style={floatingPanelRootStyle}>
        <aside
          ref={toolMenuCardRef}
          className={`pointer-events-auto ModalContainer App-toolbar App-toolbar--compact select-none min-w-0 ${UI_RESPONSIVE_SAFE_VIEWPORT_PANEL_CLASSNAME} p-0 ${!floatingPanelPinned ? 'cursor-move' : ''}`}
          style={toolMenuCardStyle}
          data-kg-floating-panel-root="true"
          data-kg-floating-panel-row-height={panelFormDensity.rowHeightPreset}
          data-kg-floating-panel-field-line={panelFormDensity.fieldLineMode}
        >
          <header className={`${uiToolbarRowScrollJustifyBetweenClassName} w-full gap-1 sm:gap-2`} onPointerDown={handleFloatingPanelPointerDown}>
            <nav className={`${uiToolbarRowScrollClassName} flex-1 gap-1 ${uiPanelTextFontClass}`} aria-label="Floating panel views">
              {viewButtons}
              <FloatingPanelHeaderStatus
                pipelineStatus={pipelineStatus}
                devStatusMetrics={devStatusMetrics}
                uiPanelMicroLabelTextSizeClass={uiPanelMicroLabelTextSizeClass}
              />
            </nav>
            <HeaderActions
              onPinToggle={handlePinToggle}
              pinned={floatingPanelPinned}
              onApply={managedHeaderActionsView ? managedHeaderActions.apply : undefined}
              onReset={managedHeaderActionsView ? managedHeaderActions.reset : undefined}
              applyDisabled={managedHeaderActionsView ? managedHeaderActions.applyDisabled : true}
              resetDisabled={managedHeaderActionsView ? managedHeaderActions.resetDisabled : true}
              onRestore={() => {
                setFloatingPanelMinimized(false)
              }}
              onClose={onClose}
            />
          </header>
        </aside>
      </section>
    )
  }

  return (
    <section className={floatingPanelRootClassName} style={floatingPanelRootStyle}>
      <aside
        ref={toolMenuCardRef}
        className={`pointer-events-auto ModalContainer flex ${UI_RESPONSIVE_SAFE_VIEWPORT_PANEL_CLASSNAME} flex-col overflow-hidden p-0 ${UI_THEME_TOKENS.panel.bg} ${UI_THEME_TOKENS.text.primary}`}
        style={{ ...toolMenuCardStyle, ...floatingPanelSizeStyle }}
        data-kg-floating-panel-root="true"
        data-kg-floating-panel-row-height={panelFormDensity.rowHeightPreset}
        data-kg-floating-panel-field-line={panelFormDensity.fieldLineMode}
      >
        <section className={`px-2 py-1 flex h-full ${UI_RESPONSIVE_PANEL_HEADER_ROW_CLASSNAME} min-w-0 flex-col gap-1`} aria-label="Floating panel">
          <header className={`${uiToolbarRowScrollJustifyBetweenClassName} w-full gap-1 select-none sm:gap-2 ${!floatingPanelPinned ? 'cursor-move' : ''}`} onPointerDown={handleFloatingPanelPointerDown}>
            <nav className={`${uiToolbarRowScrollClassName} flex-1 gap-1 ${uiPanelTextFontClass}`} aria-label="Floating panel views">
              {viewButtons}
              <FloatingPanelHeaderStatus
                pipelineStatus={pipelineStatus}
                exportStatus={exportStatus}
                devStatusMetrics={devStatusMetrics}
                uiPanelMicroLabelTextSizeClass={uiPanelMicroLabelTextSizeClass}
              />
            </nav>
            <HeaderActions
              onPinToggle={handlePinToggle}
              pinned={floatingPanelPinned}
              onApply={managedHeaderActionsView ? managedHeaderActions.apply : undefined}
              onReset={managedHeaderActionsView ? managedHeaderActions.reset : undefined}
              applyDisabled={managedHeaderActionsView ? managedHeaderActions.applyDisabled : true}
              resetDisabled={managedHeaderActionsView ? managedHeaderActions.resetDisabled : true}
              onMinimize={() => {
                setFloatingPanelMinimized(true)
              }}
              onClose={onClose}
            />
          </header>
          <section className={floatingPanelBodyClassName} aria-label={UI_LABELS.floatingPanel}>
            <PanelFormDensityProvider value={panelFormDensity}>
            {floatingPanelView === 'propsPanel' && <FloatingPropsPanel />}
            {floatingPanelView === 'skillsCommands' && <FloatingPanelSkillsCommandsView />} {floatingPanelView === 'promptPresets' && <FloatingPanelPromptPresetsView />}
            {floatingPanelView === 'view' && <WorkspaceDataViewFloatingPanelView />}
            <FloatingPanelXrSceneView view={floatingPanelView} />
            {floatingPanelView === 'design' && <DesignFloatingPanelView active={designPanelsAvailable} />}
            {floatingPanelView === 'chat' && (
              <React.Suspense fallback={null}>
                <FloatingPanelChatLazy />
              </React.Suspense>
            )}
            {floatingPanelView === 'geo' && (
              <GeoView
                geospatialModeEnabled={geospatialModeEnabled}
                isEnablingGeospatial={isEnablingGeospatial}
                geospatialEnableError={geospatialEnableError}
                onEnableGeospatial={() => {
                  void ensureGeospatialEnabled()
                }}
              />
            )}
            {floatingPanelView === 'renderer' && <ToolbarToolMenuRendererView onRegisterActions={registerManagedHeaderActions} />}
            {floatingPanelView === 'storyboardWidget' && (
              <React.Suspense fallback={null}>
                <StoryboardWidgetFloatingPanelViewLazy />
              </React.Suspense>
            )}
            {floatingPanelView === 'flowchart' && (
              <React.Suspense fallback={null}>
                <FlowchartFloatingPanelViewLazy />
              </React.Suspense>
            )}
            {floatingPanelView === 'gitGraph' && (
              <React.Suspense fallback={null}>
                <GitGraphFloatingPanelViewLazy />
              </React.Suspense>
            )}
            {floatingPanelView === 'gantt' && (
              <React.Suspense fallback={null}>
                <GanttFloatingPanelViewLazy />
              </React.Suspense>
            )}
            {floatingPanelView === 'timeline' && (
              <React.Suspense fallback={null}>
                <TimelineFloatingPanelViewLazy />
              </React.Suspense>
            )}
            {floatingPanelView === 'architecture' && (
              <React.Suspense fallback={null}>
                <ArchitectureFloatingPanelViewLazy />
              </React.Suspense>
            )}
            {floatingPanelView === 'eventModeling' && (
              <React.Suspense fallback={null}>
                <EventModelingFloatingPanelViewLazy />
              </React.Suspense>
            )}
            {floatingPanelView === 'graphTraversal' && (
              <section className="space-y-2" aria-label="Graph traversal">
                <header className={`${uiToolbarRowScrollJustifyBetweenClassName} gap-2`} aria-label="Graph traversal actions">
                  <nav className={`${uiToolbarRowScrollClassName} gap-2`} aria-label="Traversal tools">
                    <button
                      type="button"
                      className={cn('App-toolbar__btn', UI_THEME_TOKENS.button.text, UI_THEME_TOKENS.button.hoverBg)}
                      onClick={() => openOrchestratorWorkflowWorkspaceFile()}
                    >
                      Open `orchestrator/graphrag-workflow.jsonld`
                    </button>
                    <button
                      type="button"
                      className={cn('App-toolbar__btn', UI_THEME_TOKENS.button.text, UI_THEME_TOKENS.button.hoverBg)}
                      onClick={() => {
                        void requestGeospatialTraversalRun().catch(() => void 0)
                      }}
                    >
                      Run airplane on selected edge
                    </button>
                  </nav>
                  <p className={`${uiPanelMicroLabelTextSizeClass} ${UI_THEME_TOKENS.text.tertiary}`}>Geospatial</p>
                </header>
                <OrchestratorSettingsSection
                  graphRagCollapsed={orchestratorGraphRagCollapsed}
                  presetsCollapsed={orchestratorPresetsCollapsed}
                  editorCollapsed={orchestratorEditorCollapsed}
                  contextCollapsed={orchestratorContextCollapsed}
                  setGraphRagCollapsed={setOrchestratorGraphRagCollapsed}
                  setPresetsCollapsed={setOrchestratorPresetsCollapsed}
                  setEditorCollapsed={setOrchestratorEditorCollapsed}
                  setContextCollapsed={setOrchestratorContextCollapsed}
                  indexingCollapsed={orchestratorWorkflowIndexingCollapsed}
                  setIndexingCollapsed={setOrchestratorWorkflowIndexingCollapsed}
                  tracingCollapsed={orchestratorWorkflowTracingCollapsed}
                  setTracingCollapsed={setOrchestratorWorkflowTracingCollapsed}
                />
              </section>
            )}
            </PanelFormDensityProvider>
          </section>
        </section>
      </aside>
    </section>
  )
}
