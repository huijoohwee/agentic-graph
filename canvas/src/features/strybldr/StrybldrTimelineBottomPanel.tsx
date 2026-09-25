import React from 'react'
import IconButton from '@/components/IconButton'
import { FloatingPanel } from '@/components/ui/FloatingPanel'
import HeaderActions from '@/features/panels/ui/HeaderActions'
import { useGraphStore } from '@/hooks/useGraphStore'
import { UI_SELECTORS } from '@/lib/config'
import { WORKSPACE_LEFT_PANE_SELECTOR } from '@/lib/canvas/viewportMeasureElement'
import { beginRichMediaPanelResizeDrag, RichMediaPanelResizeHandle } from '@/components/RichMediaPanel'
import { getIconSizeClass } from '@/lib/ui'
import { UI_RESPONSIVE_CANVAS_BOTTOM_PANEL_CLASSNAME } from '@/lib/ui/responsiveElementClasses'
import { createRafValueScheduler } from '@/lib/react/rafValueScheduler'
import { clampOverlayTopLeftToViewport } from '@/lib/ui/overlayClamp'
import { beginOverlayPanelPositionDrag } from '@/lib/ui/overlayPanelDrag'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import { cn } from '@/lib/utils'
import { GanttTimelineTransportPlaybackRuntime } from '@/features/gitgraph/GanttTimelineTransportPlaybackRuntime'
import { Activity, ChartGantt, Columns2, FileDiff, GitGraph, History, MonitorPlay, Network, Workflow } from 'lucide-react'
import { StrybldrTimelinePanel } from './StrybldrTimelinePanel'
import {
  TIMELINE_BOTTOM_PANEL_FALLBACK_SIZE, TIMELINE_BOTTOM_PANEL_MAX_HEIGHT_RATIO,
  TIMELINE_BOTTOM_PANEL_MIN_RESIZE_HEIGHT_PX, TIMELINE_BOTTOM_PANEL_MIN_RESIZE_WIDTH_PX,
  TIMELINE_BOTTOM_PANEL_UNPINNED_MAX_HEIGHT_PX, TIMELINE_BOTTOM_PANEL_UNPINNED_WIDTH_PX, TIMELINE_BOTTOM_PANEL_VISIBLE_PX,
  clampTimelineBottomPanelHeightRatio,
  resolveWorkspaceCanvasLayerInsetLeft,
} from './strybldrTimelineBottomPanelLayout'

type TimelineBottomPanelPosition = { top: number; left: number }
type TimelineBottomPanelSize = { width: number; height: number }
type TimelineBottomPanelView =
  | 'activity'
  | 'timeline'
  | 'designTimeline'
  | 'strybldrTimeline'
  | 'documentVersionGraph'
  | 'flowchart'
  | 'gitGraph'
  | 'gantt'
  | 'architecture'
  | 'eventModeling'
const WorkspaceActivityPanelLazy = React.lazy(() => import('@/features/agent-ready/WorkspaceActivityPanel'))
const GitGraphBottomPanelViewLazy = React.lazy(() => import('@/features/gitgraph/GitGraphBottomPanelView').then(mod => ({ default: mod.GitGraphBottomPanelView })))
const FlowchartBottomPanelViewLazy = React.lazy(() => import('@/features/gitgraph/FlowchartBottomPanelView').then(mod => ({ default: mod.FlowchartBottomPanelView })))
const GanttBottomPanelViewLazy = React.lazy(() => import('@/features/gitgraph/GanttBottomPanelView').then(mod => ({ default: mod.GanttBottomPanelView })))
const TimelineBottomPanelViewLazy = React.lazy(() => import('@/features/gitgraph/TimelineBottomPanelView').then(mod => ({ default: mod.TimelineBottomPanelView })))
const DesignTimelineBottomPanelViewLazy = React.lazy(() => import('@/features/design/DesignTimelineBottomPanelView').then(mod => ({ default: mod.DesignTimelineBottomPanelView })))
const ArchitectureBottomPanelViewLazy = React.lazy(() => import('@/features/gitgraph/ArchitectureBottomPanelView').then(mod => ({ default: mod.ArchitectureBottomPanelView })))
const EventModelingBottomPanelViewLazy = React.lazy(() => import('@/features/gitgraph/EventModelingBottomPanelView').then(mod => ({ default: mod.EventModelingBottomPanelView })))
const DocumentVersionGitGraphPanelLazy = React.lazy(() => import('@/features/document-versioning/DocumentVersionGitGraphPanel').then(mod => ({ default: mod.DocumentVersionGitGraphPanel })))

export function StrybldrTimelineBottomPanel({
  active = true,
  initialView = 'strybldrTimeline',
  workspaceEditorOverlayOpen = false,
}: {
  active?: boolean
  initialView?: TimelineBottomPanelView
  workspaceEditorOverlayOpen?: boolean
}) {
  const rootLayerRef = React.useRef<HTMLElement | null>(null)
  const layerRef = React.useRef<HTMLElement | null>(null)
  const panelRef = React.useRef<HTMLElement | null>(null)
  const resizeStateRef = React.useRef<TimelineBottomPanelSize | null>(null)
  const [pinned, setPinned] = React.useState(true)
  const [minimized, setMinimized] = React.useState(false)
  const [view, setView] = React.useState<TimelineBottomPanelView>(initialView)
  const [position, setPosition] = React.useState<TimelineBottomPanelPosition | null>(null)
  const [panelSizePx, setPanelSizePx] = React.useState<TimelineBottomPanelSize | null>(null)
  const [workspaceLayerInsetLeft, setWorkspaceLayerInsetLeft] = React.useState(0)
  const bottomSurfaceCollapsed = useGraphStore(s => s.bottomSurfaceCollapsed)
  const bottomSurfaceHeightRatio = useGraphStore(s => s.bottomSurfaceHeightRatio)
  const bottomSurfaceTab = useGraphStore(s => s.bottomSurfaceTab)
  const setBottomSurfaceCollapsed = useGraphStore(s => s.setBottomSurfaceCollapsed)
  const setBottomSurfaceHeightRatio = useGraphStore(s => s.setBottomSurfaceHeightRatio)
  const setBottomSurfaceTab = useGraphStore(s => s.setBottomSurfaceTab)
  const setTimelineEnabled = useGraphStore(s => s.setTimelineEnabled)
  const markdownDocumentName = useGraphStore(s => s.markdownDocumentName)
  const resolvedThemeMode = useGraphStore(s => (s.resolvedThemeMode || 'light') as 'light' | 'dark')
  const uiIconScale = useGraphStore(s => s.uiIconScale)
  const uiIconStrokeWidth = useGraphStore(s => s.uiIconStrokeWidth)
  const iconSizeClass = getIconSizeClass(uiIconScale)
  const dragSchedulerRef = React.useRef(createRafValueScheduler((next: TimelineBottomPanelPosition) => setPosition(next)))

  React.useEffect(() => {
    dragSchedulerRef.current = createRafValueScheduler((next: TimelineBottomPanelPosition) => setPosition(next))
  }, [])

  React.useEffect(() => {
    setView(initialView)
  }, [initialView])

  const updateWorkspaceLayerInsetLeft = React.useCallback(() => {
    if (typeof document === 'undefined') {
      setWorkspaceLayerInsetLeft(0)
      return
    }
    const rootLayer = rootLayerRef.current
    const workspaceLeftPane = document.querySelector<HTMLElement>(WORKSPACE_LEFT_PANE_SELECTOR)
    const nextInsetLeft = resolveWorkspaceCanvasLayerInsetLeft({
      workspaceEditorOverlayOpen,
      rootRect: rootLayer?.getBoundingClientRect() || null,
      workspaceLeftPaneRect: workspaceLeftPane?.getBoundingClientRect() || null,
    })
    setWorkspaceLayerInsetLeft(current => current === nextInsetLeft ? current : nextInsetLeft)
  }, [workspaceEditorOverlayOpen])

  React.useLayoutEffect(() => {
    updateWorkspaceLayerInsetLeft()
    if (typeof window === 'undefined') return undefined
    const rootLayer = rootLayerRef.current
    const workspaceLeftPane = typeof document !== 'undefined'
      ? document.querySelector<HTMLElement>(WORKSPACE_LEFT_PANE_SELECTOR)
      : null
    const rafId = window.requestAnimationFrame(updateWorkspaceLayerInsetLeft)
    window.addEventListener('resize', updateWorkspaceLayerInsetLeft)
    let resizeObserver: ResizeObserver | null = null
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(updateWorkspaceLayerInsetLeft)
      if (rootLayer) resizeObserver.observe(rootLayer)
      if (workspaceLeftPane) resizeObserver.observe(workspaceLeftPane)
    }
    return () => {
      window.cancelAnimationFrame(rafId)
      window.removeEventListener('resize', updateWorkspaceLayerInsetLeft)
      resizeObserver?.disconnect()
    }
  }, [updateWorkspaceLayerInsetLeft])

  const getPanelSize = React.useCallback(() => {
    const rect = panelRef.current?.getBoundingClientRect()
    const width = rect && Number.isFinite(rect.width) && rect.width > 0 ? rect.width : TIMELINE_BOTTOM_PANEL_FALLBACK_SIZE.width
    const height = rect && Number.isFinite(rect.height) && rect.height > 0 ? rect.height : TIMELINE_BOTTOM_PANEL_FALLBACK_SIZE.height
    return { width, height }
  }, [])
  const getLayerRect = React.useCallback(() => {
    return layerRef.current?.getBoundingClientRect() || null
  }, [])
  const getLayerSize = React.useCallback(() => {
    const rect = getLayerRect()
    if (rect && Number.isFinite(rect.width) && rect.width > 0 && Number.isFinite(rect.height) && rect.height > 0) {
      return { width: rect.width, height: rect.height }
    }
    if (typeof window !== 'undefined') return { width: window.innerWidth, height: window.innerHeight }
    return TIMELINE_BOTTOM_PANEL_FALLBACK_SIZE
  }, [getLayerRect])

  const resolveLayerRelativePosition = React.useCallback((rect: DOMRect) => {
    const layerRect = getLayerRect()
    return {
      top: rect.top - (layerRect?.top || 0),
      left: rect.left - (layerRect?.left || 0),
    }
  }, [getLayerRect])

  const clampPosition = React.useCallback((next: TimelineBottomPanelPosition) => {
    if (typeof window === 'undefined' && !layerRef.current) return next
    return clampOverlayTopLeftToViewport({
      pos: next,
      size: getPanelSize(),
      viewport: getLayerSize(),
      visiblePx: TIMELINE_BOTTOM_PANEL_VISIBLE_PX,
    })
  }, [getLayerSize, getPanelSize])

  const getDefaultUnpinnedPosition = React.useCallback(() => {
    if (typeof window === 'undefined' && !layerRef.current) return { top: 0, left: 0 }
    const { width, height } = getPanelSize()
    const layerSize = getLayerSize()
    return clampPosition({
      top: layerSize.height - height - TIMELINE_BOTTOM_PANEL_VISIBLE_PX,
      left: (layerSize.width - width) / 2,
    })
  }, [clampPosition, getLayerSize, getPanelSize])

  const clampPanelSize = React.useCallback((next: TimelineBottomPanelSize) => {
    const layerSize = getLayerSize()
    const maxWidth = Math.max(TIMELINE_BOTTOM_PANEL_MIN_RESIZE_WIDTH_PX, layerSize.width - TIMELINE_BOTTOM_PANEL_VISIBLE_PX)
    const maxHeight = Math.max(
      TIMELINE_BOTTOM_PANEL_MIN_RESIZE_HEIGHT_PX,
      Math.min(layerSize.height * TIMELINE_BOTTOM_PANEL_MAX_HEIGHT_RATIO, TIMELINE_BOTTOM_PANEL_UNPINNED_MAX_HEIGHT_PX),
    )
    return {
      width: Math.max(TIMELINE_BOTTOM_PANEL_MIN_RESIZE_WIDTH_PX, Math.min(maxWidth, next.width)),
      height: Math.max(TIMELINE_BOTTOM_PANEL_MIN_RESIZE_HEIGHT_PX, Math.min(maxHeight, next.height)),
    }
  }, [getLayerSize])

  React.useEffect(() => {
    if (pinned) return
    setPosition(current => {
      const next = clampPosition(current || getDefaultUnpinnedPosition())
      if (current && current.top === next.top && current.left === next.left) return current
      return next
    })
  }, [clampPosition, getDefaultUnpinnedPosition, pinned])

  const handlePinToggle = React.useCallback(() => {
    if (pinned) {
      const rect = panelRef.current?.getBoundingClientRect()
      if (rect && Number.isFinite(rect.width) && rect.width > 0 && Number.isFinite(rect.height) && rect.height > 0) {
        setPanelSizePx(clampPanelSize({ width: rect.width, height: rect.height }))
      }
      setPosition(clampPosition(rect ? resolveLayerRelativePosition(rect) : getDefaultUnpinnedPosition()))
      setPinned(false)
      return
    }
    setPinned(true)
  }, [clampPanelSize, clampPosition, getDefaultUnpinnedPosition, pinned, resolveLayerRelativePosition])
  const handleMinimize = React.useCallback(() => setMinimized(true), [])
  const handleRestore = React.useCallback(() => setMinimized(false), [])
  const documentVersionGraphRequested = bottomSurfaceCollapsed !== true && bottomSurfaceTab === 'documentVersionGraph'
  const mermaidFlowchartRequested = bottomSurfaceCollapsed !== true && bottomSurfaceTab === 'flowchart'
  const mermaidGitGraphRequested = bottomSurfaceCollapsed !== true && bottomSurfaceTab === 'gitGraph'
  const mermaidGanttRequested = bottomSurfaceCollapsed !== true && bottomSurfaceTab === 'gantt'
  const mermaidTimelineRequested = bottomSurfaceCollapsed !== true && bottomSurfaceTab === 'timeline'
  const mermaidArchitectureRequested = bottomSurfaceCollapsed !== true && bottomSurfaceTab === 'architecture'
  const mermaidEventModelingRequested = bottomSurfaceCollapsed !== true && bottomSurfaceTab === 'eventModeling'
  const bottomSurfaceDiagramRequested =
    (bottomSurfaceCollapsed !== true && bottomSurfaceTab === 'activity') ||
    documentVersionGraphRequested ||
    mermaidFlowchartRequested ||
    mermaidGitGraphRequested ||
    mermaidGanttRequested ||
    mermaidTimelineRequested ||
    mermaidArchitectureRequested ||
    mermaidEventModelingRequested
  const showTimelineView = React.useCallback(() => {
    setView(initialView === 'designTimeline' ? 'designTimeline' : 'timeline')
    setBottomSurfaceTab('timeline')
    setBottomSurfaceCollapsed(false)
  }, [initialView, setBottomSurfaceCollapsed, setBottomSurfaceTab])
  const showStrybldrTimelineView = React.useCallback(() => {
    setView('strybldrTimeline')
    if (bottomSurfaceDiagramRequested) setBottomSurfaceCollapsed(true)
  }, [bottomSurfaceDiagramRequested, setBottomSurfaceCollapsed])
  const showDocumentVersionGraphView = React.useCallback(() => {
    setView('documentVersionGraph')
    setBottomSurfaceTab('documentVersionGraph')
    setBottomSurfaceCollapsed(false)
  }, [setBottomSurfaceCollapsed, setBottomSurfaceTab])
  const showFlowchartView = React.useCallback(() => {
    setView('flowchart')
    setBottomSurfaceTab('flowchart')
    setBottomSurfaceCollapsed(false)
  }, [setBottomSurfaceCollapsed, setBottomSurfaceTab])
  const showGitGraphView = React.useCallback(() => {
    setView('gitGraph')
    setBottomSurfaceTab('gitGraph')
    setBottomSurfaceCollapsed(false)
  }, [setBottomSurfaceCollapsed, setBottomSurfaceTab])
  const showGanttView = React.useCallback(() => {
    setView('gantt')
    setBottomSurfaceTab('gantt')
    setBottomSurfaceCollapsed(false)
  }, [setBottomSurfaceCollapsed, setBottomSurfaceTab])
  const showArchitectureView = React.useCallback(() => {
    setView('architecture')
    setBottomSurfaceTab('architecture')
    setBottomSurfaceCollapsed(false)
  }, [setBottomSurfaceCollapsed, setBottomSurfaceTab])
  const showEventModelingView = React.useCallback(() => {
    setView('eventModeling')
    setBottomSurfaceTab('eventModeling')
    setBottomSurfaceCollapsed(false)
  }, [setBottomSurfaceCollapsed, setBottomSurfaceTab])
  const handleClose = React.useCallback(() => {
    if (bottomSurfaceDiagramRequested) {
      setBottomSurfaceCollapsed(true)
      return
    }
    setTimelineEnabled(false)
  }, [bottomSurfaceDiagramRequested, setBottomSurfaceCollapsed, setTimelineEnabled])

  const handleHeaderPointerDown = React.useCallback((event: React.PointerEvent<HTMLElement>) => {
    event.stopPropagation()
    if (pinned) return
    const target = event.target
    if (target instanceof Element && target.closest(UI_SELECTORS.draggablePanelIgnorePointerDown)) return
    const rect = panelRef.current?.getBoundingClientRect()
    if (!rect) return
    const scheduler = dragSchedulerRef.current
    beginOverlayPanelPositionDrag({
      event,
      cursor: 'grabbing',
      readStartPosition: () => {
        const currentRect = panelRef.current?.getBoundingClientRect()
        return currentRect ? resolveLayerRelativePosition(currentRect) : null
      },
      clampPosition,
      schedulePosition: next => scheduler.schedule(next),
      flushPosition: () => scheduler.flush(),
      cancelPosition: () => scheduler.cancel(),
    })
  }, [clampPosition, pinned, resolveLayerRelativePosition])

  const handleResizePointerDown = React.useCallback((event: React.PointerEvent<HTMLElement>) => {
    beginRichMediaPanelResizeDrag({
      event,
      onResizeStart: () => {
        resizeStateRef.current = clampPanelSize(getPanelSize())
      },
      onResize: ({ dx, dy }) => {
        const start = resizeStateRef.current
        if (!start) return
        const next = clampPanelSize({
          width: start.width + dx,
          height: start.height + dy,
        })
        setPanelSizePx(next)
        if (!pinned) return
        const layerHeight = getLayerSize().height
        if (Number.isFinite(layerHeight) && layerHeight > 0) {
          setBottomSurfaceHeightRatio(clampTimelineBottomPanelHeightRatio(next.height / layerHeight))
        }
      },
      onResizeEnd: () => {
        resizeStateRef.current = null
      },
    })
  }, [clampPanelSize, getLayerSize, getPanelSize, pinned, setBottomSurfaceHeightRatio])

  const resolvedBottomSurfaceHeightRatio = clampTimelineBottomPanelHeightRatio(bottomSurfaceHeightRatio)
  const expandedPinnedHeightStyle = {
    width: panelSizePx ? `${panelSizePx.width}px` : undefined,
    height: panelSizePx ? `${panelSizePx.height}px` : `clamp(9rem, ${Math.round(resolvedBottomSurfaceHeightRatio * 10000) / 100}dvh, 24rem)`,
    maxHeight: 'min(62dvh, 24rem)',
  }
  const expandedUnpinnedHeightStyle = {
    width: panelSizePx ? `${panelSizePx.width}px` : `min(${TIMELINE_BOTTOM_PANEL_UNPINNED_WIDTH_PX}px, calc(100% - 1.5rem - var(--kg-safe-left) - var(--kg-safe-right)))`,
    height: panelSizePx ? `${panelSizePx.height}px` : `min(${TIMELINE_BOTTOM_PANEL_UNPINNED_MAX_HEIGHT_PX}px, 44dvh)`,
    maxHeight: 'min(62dvh, 24rem)',
  }
  const panelHeightStyle = minimized
    ? { height: 'var(--kg-toolbar-compact-surface-height)' }
    : view === 'activity' || view === 'documentVersionGraph' || view === 'flowchart' || view === 'gitGraph' || view === 'gantt' || view === 'timeline' || view === 'designTimeline' || view === 'architecture' || view === 'eventModeling'
      ? pinned
        ? expandedPinnedHeightStyle
        : expandedUnpinnedHeightStyle
      : { maxHeight: 'min(32vh, 12rem)' }
  const panelPosition = position || getDefaultUnpinnedPosition()
  const layerStyle = React.useMemo(() => ({ left: workspaceLayerInsetLeft }), [workspaceLayerInsetLeft])
  const panelStyle = pinned
    ? {
        position: 'absolute' as const,
        ...panelHeightStyle,
      }
    : {
        position: 'absolute' as const,
        top: panelPosition.top,
        left: panelPosition.left,
        ...panelHeightStyle,
      }

  return (
    <section
      ref={rootLayerRef}
      className="absolute inset-0 z-[230] pointer-events-none"
      aria-label="Timeline bottom panel root"
      data-kg-strybldr-bottom-timeline-root="canvas-viewport"
    >
      <section
        ref={layerRef}
        className="absolute inset-y-0 right-0 pointer-events-none"
        style={layerStyle}
        aria-label="Timeline bottom panel layer"
        data-kg-strybldr-bottom-timeline-layer="canvas-viewport"
      >
        <FloatingPanel
          ref={panelRef}
          as="aside"
          ariaLabel="Strybldr Timeline"
          ariaExpanded={!minimized}
          className={cn(
            'pointer-events-auto ModalContainer relative flex min-h-0 flex-col overflow-hidden p-0',
            UI_RESPONSIVE_CANVAS_BOTTOM_PANEL_CLASSNAME,
            pinned && 'kg-canvas-bottom-panel--pinned',
            UI_THEME_TOKENS.panel.bg,
            UI_THEME_TOKENS.text.primary,
          )}
          style={panelStyle}
          data-kg-canvas-pointer-ignore="true"
          data-kg-canvas-wheel-ignore="true"
          data-kg-floating-panel-root="true"
          data-kg-canvas-overlay-drag-handle={!pinned && !minimized ? 'true' : undefined}
          data-kg-strybldr-bottom-timeline-panel="1"
          data-kg-strybldr-bottom-timeline-minimized={minimized ? 'true' : 'false'}
          data-kg-strybldr-bottom-timeline-pinned={pinned ? 'true' : 'false'}
          data-kg-strybldr-bottom-timeline-drag-enabled={!pinned && !minimized ? 'true' : 'false'}
        >
          <header
            className={cn('flex select-none items-center justify-between gap-2', !pinned && 'cursor-move')}
            style={{
              minHeight: 'var(--kg-control-height, 28px)',
              paddingBlock: 'var(--kg-toolbar-compact-pad-y)',
              paddingInline: 'var(--kg-toolbar-compact-pad-x)',
            }}
            onPointerDown={handleHeaderPointerDown}
          >
            <section className="flex min-w-0 items-center gap-1">
              <span className="min-w-0 truncate text-xs font-semibold">{view === 'activity' ? 'Activity' : 'Timeline'}</span>
              <IconButton className="App-toolbar__btn" style={{ minWidth: 44, minHeight: 44 }} title="Activity" showTooltip aria-pressed={view === 'activity'} onClick={() => { setView('activity'); setBottomSurfaceTab('activity'); setBottomSurfaceCollapsed(false); setMinimized(false) }}><Activity className={iconSizeClass} strokeWidth={uiIconStrokeWidth} aria-hidden="true" /></IconButton>
              <IconButton
                className={cn(
                  'App-toolbar__btn',
                  view === 'timeline' || view === 'designTimeline'
                    ? `${UI_THEME_TOKENS.button.activeBg} ${UI_THEME_TOKENS.button.activeText}`
                    : `${UI_THEME_TOKENS.button.text} ${UI_THEME_TOKENS.button.hoverBg}`,
                )}
                title="Timeline"
                showTooltip
                aria-pressed={view === 'timeline' || view === 'designTimeline'}
                onClick={showTimelineView}
                data-kg-strybldr-bottom-timeline-timeline-toggle="1"
              >
                <History className={iconSizeClass} strokeWidth={uiIconStrokeWidth} aria-hidden="true" />
              </IconButton>
              {active ? (
                <IconButton
                  className={cn(
                    'App-toolbar__btn',
                    view === 'strybldrTimeline'
                      ? `${UI_THEME_TOKENS.button.activeBg} ${UI_THEME_TOKENS.button.activeText}`
                      : `${UI_THEME_TOKENS.button.text} ${UI_THEME_TOKENS.button.hoverBg}`,
                  )}
                  title="Strybldr Timeline"
                  showTooltip
                  aria-pressed={view === 'strybldrTimeline'}
                  onClick={showStrybldrTimelineView}
                  data-kg-strybldr-bottom-timeline-strybldr-toggle="1"
                >
                  <MonitorPlay className={iconSizeClass} strokeWidth={uiIconStrokeWidth} aria-hidden="true" />
                </IconButton>
              ) : null}
              <IconButton
                className={cn(
                  'App-toolbar__btn',
                  view === 'documentVersionGraph'
                    ? `${UI_THEME_TOKENS.button.activeBg} ${UI_THEME_TOKENS.button.activeText}`
                    : `${UI_THEME_TOKENS.button.text} ${UI_THEME_TOKENS.button.hoverBg}`,
                )}
                title="Version Graph"
                showTooltip
                aria-pressed={view === 'documentVersionGraph'}
                onClick={showDocumentVersionGraphView}
                data-kg-strybldr-bottom-timeline-document-version-graph-toggle="1"
              >
                <FileDiff className={iconSizeClass} strokeWidth={uiIconStrokeWidth} aria-hidden="true" />
              </IconButton>
              <IconButton
                className={cn(
                  'App-toolbar__btn',
                  view === 'flowchart'
                    ? `${UI_THEME_TOKENS.button.activeBg} ${UI_THEME_TOKENS.button.activeText}`
                    : `${UI_THEME_TOKENS.button.text} ${UI_THEME_TOKENS.button.hoverBg}`,
                )}
                title="Flowchart"
                showTooltip
                aria-pressed={view === 'flowchart'}
                onClick={showFlowchartView}
                data-kg-strybldr-bottom-timeline-flowchart-toggle="1"
              >
                <Columns2 className={iconSizeClass} strokeWidth={uiIconStrokeWidth} aria-hidden="true" />
              </IconButton>
              <IconButton
                className={cn(
                  'App-toolbar__btn',
                  view === 'gitGraph'
                    ? `${UI_THEME_TOKENS.button.activeBg} ${UI_THEME_TOKENS.button.activeText}`
                    : `${UI_THEME_TOKENS.button.text} ${UI_THEME_TOKENS.button.hoverBg}`,
                )}
                title="GitGraph"
                showTooltip
                aria-pressed={view === 'gitGraph'}
                onClick={showGitGraphView}
                data-kg-strybldr-bottom-timeline-gitgraph-toggle="1"
              >
                <GitGraph className={iconSizeClass} strokeWidth={uiIconStrokeWidth} aria-hidden="true" />
              </IconButton>
              <IconButton
                className={cn(
                  'App-toolbar__btn',
                  view === 'gantt'
                    ? `${UI_THEME_TOKENS.button.activeBg} ${UI_THEME_TOKENS.button.activeText}`
                    : `${UI_THEME_TOKENS.button.text} ${UI_THEME_TOKENS.button.hoverBg}`,
                )}
                title="Gantt-Timeline"
                showTooltip
                aria-pressed={view === 'gantt'}
                onClick={showGanttView}
                data-kg-strybldr-bottom-timeline-gantt-toggle="1"
              >
                <ChartGantt className={iconSizeClass} strokeWidth={uiIconStrokeWidth} aria-hidden="true" />
              </IconButton>
              <IconButton
                className={cn(
                  'App-toolbar__btn',
                  view === 'architecture'
                    ? `${UI_THEME_TOKENS.button.activeBg} ${UI_THEME_TOKENS.button.activeText}`
                    : `${UI_THEME_TOKENS.button.text} ${UI_THEME_TOKENS.button.hoverBg}`,
                )}
                title="Architecture"
                showTooltip
                aria-pressed={view === 'architecture'}
                onClick={showArchitectureView}
                data-kg-strybldr-bottom-timeline-architecture-toggle="1"
              >
                <Network className={iconSizeClass} strokeWidth={uiIconStrokeWidth} aria-hidden="true" />
              </IconButton>
              <IconButton
                className={cn(
                  'App-toolbar__btn',
                  view === 'eventModeling'
                    ? `${UI_THEME_TOKENS.button.activeBg} ${UI_THEME_TOKENS.button.activeText}`
                    : `${UI_THEME_TOKENS.button.text} ${UI_THEME_TOKENS.button.hoverBg}`,
                )}
                title="Event Model"
                showTooltip
                aria-pressed={view === 'eventModeling'}
                onClick={showEventModelingView}
                data-kg-strybldr-bottom-timeline-event-modeling-toggle="1"
              >
                <Workflow className={iconSizeClass} strokeWidth={uiIconStrokeWidth} aria-hidden="true" />
              </IconButton>
            </section>
            <HeaderActions
              onPinToggle={handlePinToggle}
              pinned={pinned}
              onMinimize={!minimized ? handleMinimize : undefined}
              onRestore={minimized ? handleRestore : undefined}
              onClose={handleClose}
            />
          </header>
          {!minimized ? (
            <section
              className="min-h-0 flex-1 overflow-y-auto px-2 pb-2 overscroll-contain"
              aria-label="Timeline bottom panel body"
              data-kg-strybldr-bottom-timeline-scroll="body"
            >
              <GanttTimelineTransportPlaybackRuntime />
              {view === 'activity' ? <React.Suspense fallback={null}><WorkspaceActivityPanelLazy /></React.Suspense> : view === 'documentVersionGraph' ? (
                <React.Suspense fallback={null}>
                  <DocumentVersionGitGraphPanelLazy
                    activePath={markdownDocumentName}
                    compact
                    emptyLabel="No document versions for the current document."
                    fallbackToLatest
                    themeMode={resolvedThemeMode}
                  />
                </React.Suspense>
              ) : view === 'flowchart' ? (
                <React.Suspense fallback={null}>
                  <FlowchartBottomPanelViewLazy compact />
                </React.Suspense>
              ) : view === 'gitGraph' ? (
                <React.Suspense fallback={null}>
                  <GitGraphBottomPanelViewLazy compact />
                </React.Suspense>
              ) : view === 'gantt' ? (
                <React.Suspense fallback={null}>
                  <GanttBottomPanelViewLazy compact />
                </React.Suspense>
              ) : view === 'timeline' ? (
                <React.Suspense fallback={null}>
                  <TimelineBottomPanelViewLazy compact />
                </React.Suspense>
              ) : view === 'designTimeline' ? (
                <React.Suspense fallback={null}>
                  <DesignTimelineBottomPanelViewLazy compact />
                </React.Suspense>
              ) : view === 'architecture' ? (
                <React.Suspense fallback={null}>
                  <ArchitectureBottomPanelViewLazy compact />
                </React.Suspense>
              ) : view === 'eventModeling' ? (
                <React.Suspense fallback={null}>
                  <EventModelingBottomPanelViewLazy compact />
                </React.Suspense>
              ) : (
                <StrybldrTimelinePanel active={active} />
              )}
            </section>
          ) : null}
          {!minimized ? (
            <RichMediaPanelResizeHandle placement="panel" onPointerDown={handleResizePointerDown} />
          ) : null}
        </FloatingPanel>
      </section>
    </section>
  )
}
