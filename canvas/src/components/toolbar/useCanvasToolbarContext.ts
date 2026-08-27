import React, { useCallback, useRef, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useGraphStore } from '@/hooks/useGraphStore'
import { useToolbarState } from '@/features/toolbar/hooks/useToolbarState'
import {
  useMainPanelDrag,
  type MainPanelOpenOptions,
  type MainPanelTabKey,
  type WorkflowManagerTabKey,
} from '@/features/toolbar/hooks/useMainPanelDrag'
import { MAIN_PANEL_OPEN_EVENT, MAIN_PANEL_OPEN_READY_EVENT } from '@/features/panels/utils/useMainPanelRect'
import { useLaunchSpotlight } from '@/features/panels/hooks/useLaunchSpotlight'
import { LS_KEYS, UI_COPY } from '@/lib/config'
import { lsBool } from '@/lib/persistence'
import { useToolbarActions } from '@/features/toolbar/hooks/useToolbarActions'
import { onGeospatialModeChanged } from '@/features/geospatial/events'
import { useForbidBrowserZoomWheel } from '@/lib/ui/forbidBrowserZoom'
import { getIconSizeClass } from '@/lib/ui'
import { readLayoutMode2d } from '@/lib/graph/layoutMode'
import { readGeospatialOverlayEnabledPreference } from '@/lib/geospatial/geospatialModePreference'
import { readSnapGridScalarSize } from '@/lib/canvas/snapGridSize'
import {
  CANVAS_GRID_MAJOR_ALPHA_DEFAULT,
  CANVAS_GRID_MAJOR_WIDTH_PX_DEFAULT,
  CANVAS_GRID_MINOR_ALPHA_DEFAULT,
  CANVAS_GRID_MINOR_WIDTH_PX_DEFAULT,
  clampCanvasGridAlpha,
  clampCanvasGridDotRadiusPx,
  clampCanvasGridMajorEvery,
  clampCanvasGridWidthPx,
  coerceCanvasGridStroke,
  coerceCanvasGridVariant,
} from '@/lib/canvas/canvasGridConfig'

export type CanvasToolbarCallbacks = {
  onZoomSelection?: () => void
}

type MainPanelOpenReadyWindow = Window & {
  __AG_MAIN_PANEL_OPEN_READY__?: boolean
}

export function useCanvasToolbarContext({ onZoomSelection }: CanvasToolbarCallbacks) {
  const {
    canvasRenderMode,
    setCanvasRenderMode,
    schema,
    setSchema,
    fitToScreenMode,
    toggleFitToScreenMode,
    zoomToSelectionMode,
    setZoomToSelectionMode,
    setFitToScreenMode,
    enableLaunchSpotlight,
    launchSpotlightMode,
    uiIconScale,
    uiIconStrokeWidth,
    uiIconAnimationEnabled,
    selectMode,
    setSelectMode,
  } = useToolbarState()

  const {
    themeMode,
    setThemeMode,
    workspaceViewMode,
    canvas2dRenderer,
    renderMediaAsNodes,
    setRenderMediaAsNodes,
    setBehavior,
    selectedNodeId,
    selectedEdgeId,
    selectedGroupId,
    selectedNodeIds,
    selectedEdgeIds,
    selectedGroupIds,
    selectNode,
    selectEdge,
    selectGroup,
    setSelectionSource,
    documentStructureBaselineLock,
    setDocumentStructureBaselineLock,
    upsertUiToast,
    graphData,
  } = useGraphStore(
    useShallow(s => ({
      themeMode: s.themeMode,
      setThemeMode: s.setThemeMode,
      workspaceViewMode: s.workspaceViewMode,
      canvas2dRenderer: s.canvas2dRenderer,
      renderMediaAsNodes: s.renderMediaAsNodes,
      setRenderMediaAsNodes: s.setRenderMediaAsNodes,
      setBehavior: s.setBehavior,
      selectedNodeId: s.selectedNodeId,
      selectedEdgeId: s.selectedEdgeId,
      selectedGroupId: s.selectedGroupId,
      selectedNodeIds: s.selectedNodeIds,
      selectedEdgeIds: s.selectedEdgeIds,
      selectedGroupIds: s.selectedGroupIds,
      selectNode: s.selectNode,
      selectEdge: s.selectEdge,
      selectGroup: s.selectGroup,
      setSelectionSource: s.setSelectionSource,
      documentStructureBaselineLock: s.documentStructureBaselineLock === true,
      setDocumentStructureBaselineLock: s.setDocumentStructureBaselineLock,
      upsertUiToast: s.upsertUiToast,
      graphData: s.graphData,
    })),
  )

  const {
    isMainPanelOpen,
    setIsMainPanelOpen,
    mainPanelRequestedTab,
    mainPanelRequestedSearchQuery,
    mainPanelRequestedAnchorId,
    mainPanelRequestedAnchorSeq,
    mainPanelRequestedWorkflowManagerTab,
    mainPanelRequestedWorkflowManagerEntryLabel,
    mainPanelCardRef,
    mainPanelPinned,
    setMainPanelPinned,
    mainPanelCollapsed,
    setMainPanelCollapsed,
    mainPanelDragPos,
    openMainPanel,
    handleMainPanelHeaderDragStart,
    handleMainPanelRestore,
    clampMainPanelPos,
  } = useMainPanelDrag()

  const [geospatialEnabled, setGeospatialEnabled] = useState<boolean>(() => readGeospatialOverlayEnabledPreference())

  const toolbarNavRef = useRef<HTMLElement>(null)
  useForbidBrowserZoomWheel(toolbarNavRef, true)

  const iconSizeClass = getIconSizeClass(uiIconScale)
  const iconStrokeWidth = uiIconStrokeWidth
  const launchIconClass = uiIconAnimationEnabled ? 'LaunchButton__icon' : ''

  const layoutMode = readLayoutMode2d(schema)

  const isWorkspaceOverlayMode = workspaceViewMode === 'editor'
  const snapGridEnabled = !!schema?.behavior?.snapGrid?.enabled
  const snapGridSize = readSnapGridScalarSize(schema?.behavior?.snapGrid?.size)

  const canvasGridEnabled = !!schema?.behavior?.canvasGrid?.enabled
  const canvasGrid = schema?.behavior?.canvasGrid as Record<string, unknown> | null | undefined
  const canvasGridVariant = coerceCanvasGridVariant(canvasGrid?.variant)
  const canvasGridMajorEvery = clampCanvasGridMajorEvery(canvasGrid?.majorEvery)
  const canvasGridDotRadiusPx = clampCanvasGridDotRadiusPx(canvasGrid?.dotRadiusPx)
  const canvasGridMinorAlpha = clampCanvasGridAlpha(canvasGrid?.minorAlpha, CANVAS_GRID_MINOR_ALPHA_DEFAULT)
  const canvasGridMajorAlpha = clampCanvasGridAlpha(canvasGrid?.majorAlpha, CANVAS_GRID_MAJOR_ALPHA_DEFAULT)
  const canvasGridMinorWidthPx = clampCanvasGridWidthPx(canvasGrid?.minorWidthPx, CANVAS_GRID_MINOR_WIDTH_PX_DEFAULT)
  const canvasGridMajorWidthPx = clampCanvasGridWidthPx(canvasGrid?.majorWidthPx, CANVAS_GRID_MAJOR_WIDTH_PX_DEFAULT)
  const canvasGridMinorStroke = coerceCanvasGridStroke(canvasGrid?.minorStroke) || ''
  const canvasGridMajorStroke = coerceCanvasGridStroke(canvasGrid?.majorStroke) || ''

  const ensureBaselineUnlocked = useCallback((): boolean => {
    if (documentStructureBaselineLock !== true) return true
    upsertUiToast({
      id: 'baseline-locked',
      kind: 'warning',
      message: UI_COPY.baselineLockedToast,
      ttlMs: 6000,
    })
    return false
  }, [documentStructureBaselineLock, upsertUiToast])

  const hasAnySelection = Boolean(
    selectedNodeId ||
      selectedEdgeId ||
      selectedGroupId ||
      (selectedNodeIds || []).length ||
      (selectedEdgeIds || []).length ||
      (selectedGroupIds || []).length,
  )
  const isNavigateModeActive = !hasAnySelection && !(selectMode === 'multi' || selectMode === 'lasso')

  const portHandlesEnabled = Boolean(schema.behavior?.portHandles?.enabled)
  const rawNodeShapeMode = schema.behavior?.nodeShapeMode
  const nodeShapeMode =
    rawNodeShapeMode === 'rect' || rawNodeShapeMode === 'diamond' || rawNodeShapeMode === 'hex'
      ? rawNodeShapeMode
      : 'circle'
  const groupShapeMode = schema.layout?.groups?.shape === 'geo' ? 'polygon' : 'rect'

  const launchSpotlight = useLaunchSpotlight()
  const actions = useToolbarActions(
    schema,
    setSchema,
    setCanvasRenderMode,
    themeMode,
    setThemeMode,
    launchSpotlight,
    openMainPanel,
    onZoomSelection,
    setZoomToSelectionMode,
    setFitToScreenMode,
    toggleFitToScreenMode,
    fitToScreenMode,
    zoomToSelectionMode,
    renderMediaAsNodes,
    setRenderMediaAsNodes,
    canvasRenderMode,
    setGeospatialEnabled,
  )

  React.useEffect(() => {
    if (typeof window === 'undefined') return
    const handler = (ev: Event) => {
      const e = ev as CustomEvent<{
        tab?: MainPanelTabKey
        searchQuery?: string
        anchorId?: string
        workflowManagerTab?: WorkflowManagerTabKey
        workflowManagerEntryLabel?: string
      } | undefined>
      const detailTab = e.detail && e.detail.tab
      const detailSearchQuery = e.detail && typeof e.detail.searchQuery === 'string' ? e.detail.searchQuery : ''
      const detailAnchorId = e.detail && typeof e.detail.anchorId === 'string' ? e.detail.anchorId : ''
      const detailWorkflowManagerTab = e.detail?.workflowManagerTab === 'mapping' ? 'mapping' : 'graph'
      const detailWorkflowManagerEntryLabel =
        e.detail && typeof e.detail.workflowManagerEntryLabel === 'string'
          ? e.detail.workflowManagerEntryLabel.trim()
          : ''
      const tab: MainPanelTabKey =
        detailTab === 'collaboration'
        || detailTab === 'integrations'
        || detailTab === 'mcp'
        || detailTab === 'maps'
        || detailTab === 'commerce'
        || detailTab === 'design'
        || detailTab === 'workflowManager'
        || detailTab === 'help'
        || detailTab === 'dashboard'
        || detailTab === 'preview'
        || detailTab === 'settings'
        || detailTab === 'history'
          ? detailTab
          : 'help'
      const options: MainPanelOpenOptions = {
        ...(detailSearchQuery ? { searchQuery: detailSearchQuery } : {}),
        ...(detailAnchorId ? { anchorId: detailAnchorId } : {}),
        ...(tab === 'workflowManager'
          ? {
              workflowManagerTab: detailWorkflowManagerTab,
              ...(detailWorkflowManagerEntryLabel ? { workflowManagerEntryLabel: detailWorkflowManagerEntryLabel } : {}),
            }
          : {}),
      }
      openMainPanel(tab, options)
    }
    ;(window as MainPanelOpenReadyWindow).__AG_MAIN_PANEL_OPEN_READY__ = true
    window.addEventListener(MAIN_PANEL_OPEN_EVENT, handler as EventListener)
    const EventCtor = typeof window.Event === 'function' ? window.Event : Event
    window.dispatchEvent(new EventCtor(MAIN_PANEL_OPEN_READY_EVENT))
    return () => {
      ;(window as MainPanelOpenReadyWindow).__AG_MAIN_PANEL_OPEN_READY__ = false
      window.removeEventListener(MAIN_PANEL_OPEN_EVENT, handler as EventListener)
    }
  }, [openMainPanel])

  React.useEffect(() => {
    return onGeospatialModeChanged(detail => {
      const enabled = typeof detail.enabled === 'boolean' ? detail.enabled : null
      if (enabled == null) return
      setGeospatialEnabled(enabled)
    })
  }, [])

  React.useEffect(() => {
    if (typeof window === 'undefined') return
    if (isMainPanelOpen) return
    if (lsBool(LS_KEYS.startupOpenWorkflowPanel, false)) {
      openMainPanel('workflowManager')
    }
  }, [isMainPanelOpen, openMainPanel])

  return {
    actions,
    canvasGridDotRadiusPx,
    canvasGridMajorAlpha,
    canvas2dRenderer,
    canvasGridEnabled,
    canvasGridMajorStroke,
    canvasGridMajorEvery,
    canvasGridMajorWidthPx,
    canvasGridMinorAlpha,
    canvasGridMinorStroke,
    canvasGridMinorWidthPx,
    canvasGridVariant,
    canvasRenderMode,
    clampMainPanelPos,
    documentStructureBaselineLock,
    enableLaunchSpotlight,
    ensureBaselineUnlocked,
    geospatialEnabled,
    graphData,
    groupShapeMode,
    handleMainPanelHeaderDragStart,
    handleMainPanelRestore,
    iconSizeClass,
    iconStrokeWidth,
    isMainPanelOpen,
    isNavigateModeActive,
    isWorkspaceOverlayMode,
    launchIconClass,
    launchSpotlightMode,
    layoutMode,
    mainPanelCardRef,
    mainPanelCollapsed,
    mainPanelDragPos,
    mainPanelPinned,
    mainPanelRequestedTab,
    mainPanelRequestedSearchQuery,
    mainPanelRequestedAnchorId,
    mainPanelRequestedAnchorSeq,
    mainPanelRequestedWorkflowManagerTab,
    mainPanelRequestedWorkflowManagerEntryLabel,
    nodeShapeMode,
    openMainPanel,
    portHandlesEnabled,
    renderMediaAsNodes,
    schema,
    selectEdge,
    selectGroup,
    selectMode,
    selectNode,
    setBehavior,
    setCanvasRenderMode,
    setDocumentStructureBaselineLock,
    setFitToScreenMode,
    setGeospatialEnabled,
    setIsMainPanelOpen,
    setMainPanelCollapsed,
    setMainPanelPinned,
    setSchema,
    setSelectMode,
    setSelectionSource,
    snapGridEnabled,
    snapGridSize,
    themeMode,
    toggleFitToScreenMode,
    toolbarNavRef,
    zoomToSelectionMode,
  }
}
