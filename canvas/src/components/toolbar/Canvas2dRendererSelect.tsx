import React from 'react'
import { useShallow } from 'zustand/react/shallow'
import { Eye } from 'lucide-react'
import type { Canvas2dRendererId } from '@/lib/config'
import { UI_COPY } from '@/lib/config'
import { useGraphStore } from '@/hooks/useGraphStore'
import { ToolbarDropdownSelect } from '@/components/toolbar/ToolbarDropdownSelect'
import { isD3Like2dRenderer, isFrontmatterOnlyPolicyActive } from '@/lib/config.render'
import type { CanvasViewOptionId, CanvasViewModelState } from '@/components/toolbar/canvasViewTypes'
import { useAgentRunWorkspace, closeAgentRunInspection, activateAgentRunWorkspace } from '@/features/agent-ready/agentRunInspectionStore'
import { buildCanvasViewOptions, getCanvasViewRendererOptions, getCanvasViewTriggerState } from '@/components/toolbar/canvasViewMenu'
import { applyCanvasViewSelection } from '@/components/toolbar/canvasViewActions'
import { buildCanvasViewOptionHelp } from './canvasViewOptionHelp'
import { UI_RESPONSIVE_EXTRA_WIDE_TOOLBAR_DROPDOWN_WIDTH_CLASSNAME } from '@/lib/ui/responsiveElementClasses'
import { SelectableRowValue } from '@/components/ui/SelectableRowValue'
import { useMinimapCollapsed } from '@/features/minimap/minimapVisibility'
import {
  activateXrSceneSurface,
  resolveXrSurfaceEntryPanelView,
} from '@/features/three/xrSceneSurfaceRuntime'
import {
  CANVAS_VIEW_BINDING_TOKEN,
  AGENT_RUN_CANVAS_VIEWS,
  CANVAS_VIEW_COMMAND_TOKEN,
  CANVAS_VIEW_MCP_TOOL_NAME,
  CANVAS_VIEW_SEMANTIC_TOKEN,
  buildCanvasViewInvocation,
} from '@/lib/canvas/canvasViewInvocationContract.mjs'
import { registerCanvasViewControlHandler } from '@/lib/canvas/canvasViewControlRuntime'

type Canvas2dRendererSelectProps = {
  iconSizeClass: string
  iconStrokeWidth: number
  ensureBaselineUnlocked: () => boolean
  geospatialEnabled: boolean
  onOpenGeospatialMode: () => void
  onActivateGeoXrMode: () => void
  onExitGeospatialMode: () => void
}

export function Canvas2dRendererSelect({
  iconSizeClass,
  iconStrokeWidth,
  ensureBaselineUnlocked,
  geospatialEnabled,
  onOpenGeospatialMode,
  onActivateGeoXrMode,
  onExitGeospatialMode,
}: Canvas2dRendererSelectProps) {
  const inspection = useAgentRunWorkspace()
  const [minimapCollapsed, setMinimapCollapsed] = useMinimapCollapsed()
  const state = useGraphStore(
    useShallow(s => ({
      canvas2dRenderer: (s.canvas2dRenderer || 'd3') as Canvas2dRendererId,
      canvasRenderMode: s.canvasRenderMode,
      canvas3dMode: s.canvas3dMode,
      documentSemanticMode: s.documentSemanticMode || 'document',
      frontmatterModeEnabled: s.frontmatterModeEnabled === true,
      multiDimTableModeEnabled: s.multiDimTableModeEnabled === true,
      renderMediaAsNodes: s.renderMediaAsNodes === true,
      timelineEnabled: s.timelineEnabled,
      bottomSurfaceCollapsed: s.bottomSurfaceCollapsed === true,
      bottomSurfaceTab: s.bottomSurfaceTab,
      setCanvas2dRenderer: s.setCanvas2dRenderer,
      setCanvasRenderMode: s.setCanvasRenderMode,
      setCanvas3dMode: s.setCanvas3dMode,
      floatingPanelOpen: s.floatingPanelOpen === true,
      setFloatingPanelOpen: s.setFloatingPanelOpen,
      setFloatingPanelView: s.setFloatingPanelView,
      setSchema: s.setSchema,
      setBehavior: s.setBehavior,
      setRenderMediaAsNodes: s.setRenderMediaAsNodes,
      setTimelineEnabled: s.setTimelineEnabled,
      setBottomSurfaceCollapsed: s.setBottomSurfaceCollapsed,
      setBottomSurfaceTab: s.setBottomSurfaceTab,
      aspectRatioMode: s.strybldrStoryboardCardAspectMode,
      setAspectRatioMode: s.setStrybldrStoryboardCardAspectMode,
      boardLayoutMode: s.strybldrStoryboardBoardLayoutMode,
      setBoardLayoutMode: s.setStrybldrStoryboardBoardLayoutMode,
      storyboardDisplayMode: s.strybldrStoryboardDisplayMode,
      setStoryboardDisplayMode: s.setStrybldrStoryboardDisplayMode,
      setDocumentSemanticMode: s.setDocumentSemanticMode,
      setFrontmatterModeEnabled: s.setFrontmatterModeEnabled,
      setMultiDimTableModeEnabled: s.setMultiDimTableModeEnabled,
      requestStoryboardWidgetLayoutRebalance: s.requestStoryboardWidgetLayoutRebalance,
      layoutMode: s.schema?.layout?.mode,
      schema: s.schema,
    })),
  )

  const frontmatterOnlyAllowed = isFrontmatterOnlyPolicyActive({
    canvasRenderMode: state.canvasRenderMode,
    canvas2dRenderer: state.canvas2dRenderer,
  })
  const isD3Like2dLayoutToggle = isD3Like2dRenderer(state.canvas2dRenderer)
  const modelState = React.useMemo(
    () =>
      ({
        canvas2dRenderer: state.canvas2dRenderer,
        canvas3dMode: state.canvas3dMode,
        canvasRenderMode: state.canvasRenderMode,
        documentSemanticMode: state.documentSemanticMode,
        frontmatterModeEnabled: state.frontmatterModeEnabled,
        multiDimTableModeEnabled: state.multiDimTableModeEnabled,
        renderMediaAsNodes: state.renderMediaAsNodes,
        timelineEnabled: state.timelineEnabled,
        bottomSurfaceCollapsed: state.bottomSurfaceCollapsed,
        bottomSurfaceTab: state.bottomSurfaceTab,
        minimapCollapsed,
        aspectRatioMode: state.aspectRatioMode,
        boardLayoutMode: state.boardLayoutMode,
        storyboardDisplayMode: state.storyboardDisplayMode,
        geospatialEnabled,
        layoutMode: state.layoutMode,
        schema: state.schema,
        frontmatterOnlyAllowed,
        isD3Like2dLayoutToggle,
      }) satisfies CanvasViewModelState,
    [
      frontmatterOnlyAllowed,
      geospatialEnabled,
      isD3Like2dLayoutToggle,
      minimapCollapsed,
      state.canvas2dRenderer,
      state.canvas3dMode,
      state.canvasRenderMode,
      state.documentSemanticMode,
      state.frontmatterModeEnabled,
      state.layoutMode,
      state.multiDimTableModeEnabled,
      state.renderMediaAsNodes,
      state.timelineEnabled,
      state.bottomSurfaceCollapsed,
      state.bottomSurfaceTab,
      state.aspectRatioMode,
      state.boardLayoutMode,
      state.storyboardDisplayMode,
      state.schema,
    ],
  )

  const rendererOptions = React.useMemo(() => getCanvasViewRendererOptions(), [])
  const effectiveModel = inspection ? { ...modelState, canvas2dRenderer: 'dashboard' as const, canvasRenderMode: '2d' as const, geospatialEnabled: false } : modelState
  const options = buildCanvasViewOptions(effectiveModel, rendererOptions)
  const triggerState = getCanvasViewTriggerState(effectiveModel, rendererOptions)
  const applyCanvasViewOption = React.useCallback((id: CanvasViewOptionId, baselineGuard = ensureBaselineUnlocked) => {
    if (id === 'renderer:dashboard' || id.startsWith('agent-run:')) {
      activateAgentRunWorkspace(id === 'renderer:dashboard' ? inspection?.view ?? 'tree' : id.slice('agent-run:'.length) as Extract<keyof typeof AGENT_RUN_CANVAS_VIEWS, string>); return
    }
    if (!baselineGuard()) return
    // Presentation controls configure the current Mission; only navigation leaves it.
    if (inspection && /^(renderer|surface|document):/.test(id)) closeAgentRunInspection()
    applyCanvasViewSelection({
      id,
      ensureBaselineUnlocked: baselineGuard,
      geospatialEnabled,
      onOpenGeospatialMode,
      onExitGeospatialMode,
      onOpenShared3dPanel: mode => {
        if (mode === 'geo-xr') {
          onActivateGeoXrMode()
          return
        }
        if (mode === 'xr') {
          const current = useGraphStore.getState()
          const panelView = resolveXrSurfaceEntryPanelView(current)
          if (!activateXrSceneSurface({ panelView, openPanel: true, timeline: true })) {
            current.pushUiToast({
              id: 'canvas-view:xr:unavailable',
              kind: 'error',
              message: 'The shared XR Mode surface is unavailable for this document.',
            })
          }
          return
        }
        if (!state.floatingPanelOpen) {
          state.setFloatingPanelView('camera')
          state.setFloatingPanelOpen(true)
        }
      },
      canvas2dRenderer: state.canvas2dRenderer,
      canvas3dMode: state.canvas3dMode,
      canvasRenderMode: state.canvasRenderMode,
      documentSemanticMode: state.documentSemanticMode,
      frontmatterModeEnabled: state.frontmatterModeEnabled,
      multiDimTableModeEnabled: state.multiDimTableModeEnabled,
      renderMediaAsNodes: state.renderMediaAsNodes,
      timelineEnabled: state.timelineEnabled,
      bottomSurfaceCollapsed: state.bottomSurfaceCollapsed,
      bottomSurfaceTab: state.bottomSurfaceTab,
      minimapCollapsed,
      schema: state.schema,
      setCanvas2dRenderer: state.setCanvas2dRenderer,
      setCanvasRenderMode: state.setCanvasRenderMode,
      setCanvas3dMode: state.setCanvas3dMode,
      setSchema: state.setSchema,
      setBehavior: state.setBehavior,
      setRenderMediaAsNodes: state.setRenderMediaAsNodes,
      setTimelineEnabled: state.setTimelineEnabled,
      setBottomSurfaceCollapsed: state.setBottomSurfaceCollapsed,
      setBottomSurfaceTab: state.setBottomSurfaceTab,
      setMinimapCollapsed,
      aspectRatioMode: state.aspectRatioMode,
      setAspectRatioMode: state.setAspectRatioMode,
      boardLayoutMode: state.boardLayoutMode,
      setBoardLayoutMode: state.setBoardLayoutMode,
      storyboardDisplayMode: state.storyboardDisplayMode,
      setStoryboardDisplayMode: state.setStoryboardDisplayMode,
      setDocumentSemanticMode: state.setDocumentSemanticMode,
      setFrontmatterModeEnabled: state.setFrontmatterModeEnabled,
      setMultiDimTableModeEnabled: state.setMultiDimTableModeEnabled,
      requestStoryboardWidgetLayoutRebalance: state.requestStoryboardWidgetLayoutRebalance,
    })
  }, [
    inspection,
    ensureBaselineUnlocked,
    geospatialEnabled,
    minimapCollapsed,
    onActivateGeoXrMode,
    onExitGeospatialMode,
    onOpenGeospatialMode,
    setMinimapCollapsed,
    state,
  ])
  React.useEffect(() => registerCanvasViewControlHandler(optionId => {
    if (optionId.startsWith('agent-run:') || optionId === 'renderer:dashboard') { applyCanvasViewOption(optionId); return }
    const option = options.flatMap(parent => parent.children?.length ? parent.children : [parent])
      .find(candidate => candidate.id === optionId)
    if (!option || option.disabled || option.children?.length) {
      throw new Error(`Canvas View option ${optionId} is unavailable in the current document.`)
    }
    if (!inspection && !optionId.startsWith('agent-run:') && !ensureBaselineUnlocked()) {
      throw new Error('Canvas View control is locked by the active baseline.')
    }
    applyCanvasViewOption(optionId, () => true)
  }), [applyCanvasViewOption, ensureBaselineUnlocked, options, !!inspection])

  const resolveInvocationOptionId = React.useCallback((option: (typeof options)[number]): CanvasViewOptionId | null => {
    if (!option.children?.length) return option.id
    return option.children.find(child => child.isActive)?.id || null
  }, [])

  return (
    <ToolbarDropdownSelect
      value={triggerState.id}
      options={options}
      title={`${UI_COPY.canvasViewModeTitle}: ${triggerState.title}`}
      tooltipContent={UI_COPY.canvasViewModeTooltip}
      disabled={false}
      onSelect={id => applyCanvasViewOption(id as CanvasViewOptionId)}
      renderButtonContent={() => <Eye className={iconSizeClass} strokeWidth={iconStrokeWidth} />}
      getOptionTooltip={buildCanvasViewOptionHelp}
      renderOptionContent={option => {
        // Setting rows name the feature; categorical choices already describe themselves.
        const showFieldLabel = Boolean(option.children?.length)
          || option.id.startsWith('document:')
          || (option.id.startsWith('control:') && option.rowLabel !== 'Display')
        return <>
          <option.Icon className={iconSizeClass} strokeWidth={iconStrokeWidth} />
          {showFieldLabel || !option.valueLabel ? <span className="min-w-0 flex-1 truncate text-left">
            {option.rowLabel || option.title}
          </span> : null}
          {option.valueLabel ? (() => {
            const invocationOptionId = resolveInvocationOptionId(option)
            return <SelectableRowValue
              label={option.rowLabel || option.title}
              value={option.valueLabel}
              className={showFieldLabel ? 'kg-toolbar-dropdown-option-value ml-auto text-xs' : 'min-w-0 flex-1 truncate text-left'}
              invocation={invocationOptionId ? buildCanvasViewInvocation(invocationOptionId) : undefined}
              mcpTool={invocationOptionId ? CANVAS_VIEW_MCP_TOOL_NAME : undefined}
              commandToken={invocationOptionId ? CANVAS_VIEW_COMMAND_TOKEN : undefined}
              semanticToken={invocationOptionId ? CANVAS_VIEW_SEMANTIC_TOKEN : undefined}
              bindingToken={invocationOptionId ? CANVAS_VIEW_BINDING_TOKEN : undefined}
            />
          })() : null}
        </>
      }}
      menuWidthClass={UI_RESPONSIVE_EXTRA_WIDE_TOOLBAR_DROPDOWN_WIDTH_CLASSNAME}
    />
  )
}
