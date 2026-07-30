import React, { useEffect, useRef, useState } from 'react'
import { Rocket } from 'lucide-react'
import IconButton from '@/components/IconButton'
import { useToolMenuShortcuts } from '@/features/toolbar/useToolMenuShortcuts'
import { useToolMenuState } from '@/features/toolbar/useToolMenuState'
import { useGraphStore } from '@/hooks/useGraphStore'
import { FLOATING_PANEL_OPEN_EVENT, type PropsPanelOpenEventDetail, type FloatingPanelOpenEventDetail } from '@/features/canvas/utils'
import { LS_KEYS } from '@/lib/config'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import { getIconSizeClass } from '@/lib/ui'
import { lsBool } from '@/lib/persistence'
import type { ToolMenuAction, ToolMenuArea } from '@/features/toolbar/toolMenu'
import { createNewMarkdownSourceFileAndOpenViewer } from '@/features/source-files/createNewMarkdownSourceFile'
import type { MainPanelTabKey } from '@/features/toolbar/hooks/useMainPanelDrag'
import { installFloatingPanelBridge, type FloatingPanelRequestedView } from '@/features/toolbar/floatingPanelBridge'
import {
  FLOATING_PANEL_CANVAS_INSET_PX,
  FLOATING_PANEL_DEFAULT_HEIGHT_FALLBACK_PX,
  FLOATING_PANEL_DEFAULT_WIDTH_FALLBACK_PX,
} from '@/lib/ui/floatingPanelGeometry'
import { readGeospatialOverlayEnabledPreference } from '@/lib/geospatial/geospatialModePreference'
import { MotionControlXrLifecycleGuard } from '@/features/three/MotionControlXrLifecycleGuard'
import { useKnowledgeGraphLaunchHostBridge } from '@/features/knowledge-graph/knowledgeGraphLaunchHostBridge'

const ToolbarToolMenuLazy = React.lazy(() =>
  import('@/lib/toolbar/ToolbarToolMenu.impl').then(mod => ({ default: mod.ToolbarToolMenu })),
)
const LaunchDropdownLazy = React.lazy(() =>
  import('@/lib/toolbar/LaunchDropdown.impl').then(mod => ({ default: mod.LaunchDropdown })),
)

type ToolbarMenuLauncherProps = {
  onOpenMainPanel: (tab: MainPanelTabKey) => void
  onLaunchSpotlight?: () => void
  onLaunchStatus?: () => void
  onCloseMainPanel?: () => void
}

export function ToolbarMenuLauncher({
  onOpenMainPanel: _onOpenMainPanel,
  onLaunchSpotlight,
  onLaunchStatus,
  onCloseMainPanel,
}: ToolbarMenuLauncherProps) {
  useKnowledgeGraphLaunchHostBridge()
  const [launchOpen, setLaunchOpen] = useState(false)

  const floatingPanelRequestSeqRef = useRef(0)
  const [floatingPanelRequestedView, setFloatingPanelRequestedView] = useState<
    {
      view: FloatingPanelRequestedView
      seq: number
    } | null
  >(null)

  const {
    isToolMenuOpen,
    setIsToolMenuOpen,
    toolMenuButtonRef,
    toolMenuCardRef,
    toolMenuCardStyle,
    setToolMenuDragPos,
    handleToolMenuCardPointerDown,
    closeToolMenu,
  } = useToolMenuState()

  const handleToolMenuShortcutAction = React.useCallback((area: ToolMenuArea, action: ToolMenuAction) => {
    if (area !== 'sourceFiles' || action !== 'new') return
    try {
      createNewMarkdownSourceFileAndOpenViewer()
    } catch {
      void 0
    }
  }, [])

  useToolMenuShortcuts(handleToolMenuShortcutAction)

  useEffect(() => {
    if (typeof window === 'undefined') return

    const openRequestedFloatingPanel = (view: FloatingPanelRequestedView) => {
      floatingPanelRequestSeqRef.current += 1
      setFloatingPanelRequestedView({
        view,
        seq: floatingPanelRequestSeqRef.current,
      })
      setIsToolMenuOpen(true)
    }

    const openPropsPanel = (detail?: PropsPanelOpenEventDetail) => {
      try {
        const isPinned = lsBool(LS_KEYS.floatingPanelPinned, false)
        const clientX = detail && typeof detail.clientX === 'number' ? detail.clientX : null
        const clientY = detail && typeof detail.clientY === 'number' ? detail.clientY : null
        if (!isPinned && clientX !== null && clientY !== null && Number.isFinite(clientX) && Number.isFinite(clientY)) {
          const padding = FLOATING_PANEL_CANVAS_INSET_PX
          const estimatedWidth = FLOATING_PANEL_DEFAULT_WIDTH_FALLBACK_PX
          const estimatedHeight = FLOATING_PANEL_DEFAULT_HEIGHT_FALLBACK_PX
          const maxLeft = Math.max(padding, window.innerWidth - estimatedWidth - padding)
          const maxTop = Math.max(padding, window.innerHeight - estimatedHeight - padding)
          setToolMenuDragPos({
            top: Math.min(Math.max(padding, clientY), maxTop),
            left: Math.min(Math.max(padding, clientX), maxLeft),
          })
        }
      } catch {
        void 0
      }
      openRequestedFloatingPanel('propsPanel')
    }

    const openRendererPanel = () => {
      openRequestedFloatingPanel('renderer')
    }

    const openFloatingPanel = (detail?: FloatingPanelOpenEventDetail) => {
      const tab = detail?.tab
      if (tab === 'inspector' || tab === 'node') {
        if (detail?.open === false) return
        _onOpenMainPanel('workflowManager')
        closeToolMenu()
        return
      }
      const requested =
        tab === 'view'
          ? 'view'
          : tab === 'media'
            ? 'media'
          : tab === 'animation'
            ? 'animation'
          : tab === 'motionControl'
            ? 'motionControl'
          : tab === 'gameMode'
            ? 'gameMode'
          : tab === 'flightSim'
            ? 'flightSim'
          : tab === 'cityBuilder'
            ? 'cityBuilder'
          : tab === 'camera'
            ? 'camera'
          : tab === 'chat'
          ? 'chat'
          : tab === 'geo'
            ? 'geo'
            : tab === 'storyboardWidget'
              ? 'storyboardWidget'
              : tab === 'flowchart'
                ? 'flowchart'
              : tab === 'gitGraph'
                ? 'gitGraph'
                : tab === 'gantt'
                  ? 'gantt'
                  : tab === 'timeline'
                    ? 'timeline'
                    : tab === 'architecture'
                      ? 'architecture'
                      : tab === 'eventModeling'
                        ? 'eventModeling'
                        : null
      if (!requested) return
      if (detail?.open === false) {
        closeToolMenu()
        return
      }
      openRequestedFloatingPanel(requested)
    }

    const handleFloatingPanelOpenEvent = (event: Event) => {
      openFloatingPanel((event as CustomEvent<FloatingPanelOpenEventDetail>).detail)
    }
    window.addEventListener(FLOATING_PANEL_OPEN_EVENT, handleFloatingPanelOpenEvent)
    const cleanupBridge = installFloatingPanelBridge({
      openPropsPanel,
      openFloatingPanel,
      openRendererPanel,
    })
    return () => {
      window.removeEventListener(FLOATING_PANEL_OPEN_EVENT, handleFloatingPanelOpenEvent)
      cleanupBridge()
    }
  }, [_onOpenMainPanel, closeToolMenu, setIsToolMenuOpen, setToolMenuDragPos])

  const uiIconScale = useGraphStore(s => s.uiIconScale)
  const geospatialOverlayEnabled = readGeospatialOverlayEnabledPreference()
  void geospatialOverlayEnabled
  const iconSizeClass = getIconSizeClass(uiIconScale)

  return (
    <>
      <MotionControlXrLifecycleGuard />
      <IconButton
        ref={toolMenuButtonRef}
        className={`App-toolbar__btn ${UI_THEME_TOKENS.icon.color}`}
        title="Launch"
        tooltipContent="Launch"
        showTooltip
        onClick={() => {
          closeToolMenu()
          setLaunchOpen(v => !v)
        }}
      >
        <Rocket className={iconSizeClass} />
      </IconButton>

      <React.Suspense fallback={null}>
        <LaunchDropdownLazy
          anchorRef={toolMenuButtonRef}
          open={launchOpen}
          onClose={() => setLaunchOpen(false)}
          onOpenWorkflowPanel={() => {
            setLaunchOpen(false)
            _onOpenMainPanel('workflowManager')
          }}
          onLaunchSpotlight={onLaunchSpotlight}
          onLaunchStatus={onLaunchStatus}
          onCloseMainPanel={onCloseMainPanel}
        />
      </React.Suspense>
      {isToolMenuOpen && (
        <React.Suspense fallback={null}>
          <ToolbarToolMenuLazy
            toolMenuCardRef={toolMenuCardRef}
            toolMenuCardStyle={toolMenuCardStyle}
            onHeaderPointerDown={handleToolMenuCardPointerDown}
            requestedFloatingPanelView={floatingPanelRequestedView?.view}
            requestedFloatingPanelViewSeq={floatingPanelRequestedView?.seq}
            pipelineStatus={null}
            exportStatus={null}
            onClose={closeToolMenu}
          />
        </React.Suspense>
      )}
    </>
  )
}
