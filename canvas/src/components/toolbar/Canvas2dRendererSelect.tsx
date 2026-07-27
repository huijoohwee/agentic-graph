import React from 'react'
import { useShallow } from 'zustand/react/shallow'
import { Eye } from 'lucide-react'
import type { Canvas2dRendererId } from '@/lib/config'
import { UI_COPY } from '@/lib/config'
import { useGraphStore } from '@/hooks/useGraphStore'
import { ToolbarDropdownSelect } from '@/components/toolbar/ToolbarDropdownSelect'
import { isD3Like2dRenderer, isFrontmatterOnlyPolicyActive } from '@/lib/config.render'
import type { CanvasViewOptionId, CanvasViewModelState } from '@/components/toolbar/canvasViewTypes'
import { buildCanvasViewOptions, getCanvasViewRendererOptions, getCanvasViewTriggerState } from '@/components/toolbar/canvasViewMenu'
import { applyCanvasViewSelection } from '@/components/toolbar/canvasViewActions'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import { UI_RESPONSIVE_EXTRA_WIDE_TOOLBAR_DROPDOWN_WIDTH_CLASSNAME } from '@/lib/ui/responsiveElementClasses'
import { useMinimapCollapsed } from '@/features/minimap/minimapVisibility'
import {
  activateXrSceneSurface,
  resolveXrSurfaceEntryPanelView,
} from '@/features/three/xrSceneSurfaceRuntime'

type Canvas2dRendererSelectProps = {
  iconSizeClass: string
  iconStrokeWidth: number
  ensureBaselineUnlocked: () => boolean
  geospatialEnabled: boolean
  onOpenGeospatialMode: () => void
}

export function Canvas2dRendererSelect({
  iconSizeClass,
  iconStrokeWidth,
  ensureBaselineUnlocked,
  geospatialEnabled,
  onOpenGeospatialMode,
}: Canvas2dRendererSelectProps) {
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
  const options = React.useMemo(() => buildCanvasViewOptions(modelState, rendererOptions), [modelState, rendererOptions])
  const triggerState = React.useMemo(() => getCanvasViewTriggerState(modelState, rendererOptions), [modelState, rendererOptions])

  return (
    <ToolbarDropdownSelect
      value={triggerState.id}
      options={options}
      title={`${UI_COPY.canvasViewModeTitle}: ${triggerState.title}`}
      tooltipContent={UI_COPY.canvasViewModeTooltip}
      disabled={false}
      onSelect={id =>
        applyCanvasViewSelection({
          id: id as CanvasViewOptionId,
          ensureBaselineUnlocked,
          geospatialEnabled,
          onOpenGeospatialMode,
          onOpenShared3dPanel: mode => {
            if (mode === 'geo-xr') {
              const current = useGraphStore.getState()
              if (!activateXrSceneSurface({ geospatialComposite: true, preserveGameplay: true })) {
                current.pushUiToast({
                  id: 'canvas-view:geo-xr:unavailable',
                  kind: 'error',
                  message: 'The shared Geo+XR Mode surface is unavailable for this document.',
                })
                return
              }
              onOpenGeospatialMode()
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
      }
      renderButtonContent={() => <Eye className={iconSizeClass} strokeWidth={iconStrokeWidth} />}
      renderOptionContent={option => (
        <>
          <option.Icon className={iconSizeClass} strokeWidth={iconStrokeWidth} />
          <span className="kg-toolbar-dropdown-option-copy min-w-0 flex-1 text-left">
            <span className={`block ${option.description || option.badges?.length ? 'break-words leading-4' : 'truncate'}`}>
              {option.title}
            </span>
            {option.description || option.badges?.length ? (
              <span className="mt-0.5 block min-w-0">
                {option.description ? (
                  <span className={`block text-[10px] leading-3 ${UI_THEME_TOKENS.text.tertiary}`}>
                    {option.description}
                  </span>
                ) : null}
                {option.badges?.length ? (
                  <span className="mt-1 flex min-w-0 flex-wrap items-center gap-1">
                    {option.badges.slice(0, 2).map(badge => (
                      <span key={badge} className={`shrink-0 rounded border px-1 py-0 text-[9px] leading-3 ${UI_THEME_TOKENS.panel.border} ${UI_THEME_TOKENS.badge.chip}`}>
                        {badge}
                      </span>
                    ))}
                  </span>
                ) : null}
              </span>
            ) : null}
          </span>
        </>
      )}
      menuWidthClass={UI_RESPONSIVE_EXTRA_WIDE_TOOLBAR_DROPDOWN_WIDTH_CLASSNAME}
    />
  )
}
