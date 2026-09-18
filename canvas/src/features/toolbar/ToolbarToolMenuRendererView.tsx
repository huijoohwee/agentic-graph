import React from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useRendererPanelState } from '@/features/panels/hooks/useRendererPanelState'
import RenderSettingsSection from '@/lib/panels/views/RenderSettingsSection.impl'
import { UI_LABELS } from '@/lib/config'
import { RendererPaletteSettings } from '@/features/toolbar/ui/RendererPaletteSettings'
import { RendererHoverSettings } from '@/features/toolbar/ui/RendererHoverSettings'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import { useGraphStore } from '@/hooks/useGraphStore'
import { GraphEditorToolRail, type GraphEditorToolId } from '@/features/graph-editor/GraphEditorToolRail'
import { GraphEditorRightPanel } from '@/features/graph-editor/GraphEditorRightPanel'
import { DesignWireframeSettings } from '@/features/toolbar/ui/DesignWireframeSettings'
import { FlowchartRendererSettings } from '@/features/toolbar/ui/FlowchartRendererSettings'
import { RadarGalaxyRendererSettings } from '@/features/toolbar/ui/RadarGalaxyRendererSettings'
import { EdgeTypesRendererSettings } from '@/features/toolbar/ui/EdgeTypesRendererSettings'
import { RendererGraphTopologySummary } from '@/features/toolbar/ui/RendererGraphTopologySummary'
import type { GraphSchema } from '@/lib/graph/schema'
import { readGlobalEdgeType, type GlobalEdgeType, withGlobalEdgeType } from '@/lib/graph/edgeTypes'
import { LayoutModeRendererSettings } from '@/features/toolbar/ui/LayoutModeRendererSettings'
import { readLayoutMode2d, type LayoutMode2d } from '@/lib/graph/layoutMode'
import { cancelWorkspaceSyncTask, scheduleWorkspaceSyncTask } from '@/lib/async/workspaceSyncScheduler'
import {
  WORKSPACE_SYNC_SCOPE_RENDERER_EDGE_TYPE_RUNTIME_PERSISTENCE,
  WORKSPACE_SYNC_TASK_RENDERER_EDGE_TYPE_VIEW_STATE,
} from '@/lib/async/workspaceSyncKeys'
import { isFlowchartCanvas2dRenderer, isD3Like2dRenderer } from '@/lib/config.render'
import { useRendererInspectionGraph } from './floatingPanelBridge'

const WorkspaceTableModeControlLazy = React.lazy(async () => {
  const module = await import('@/features/workspace-table/ui/WorkspaceTableModeControl')
  return { default: module.WorkspaceTableModeControl }
})

export function ToolbarToolMenuRendererView(props: {
  onRegisterActions?: (actions: {
    apply?: () => void
    reset?: () => void
    applyDisabled?: boolean
    resetDisabled?: boolean
  }) => void
}) {
  const onRegisterActions = props.onRegisterActions
  const inspectionGraph = useRendererInspectionGraph()
  const {
    sections: renderSections,
    allSectionsCollapsed: allRenderSectionsCollapsed,
    collapseAllSections: collapseRenderSections,
    expandAllSections: expandRenderSections,
  } = useRendererPanelState({ source: 'floatingPanel' })
  const renderSectionsCollapsed = renderSections.byKey
  const renderSectionSetters = renderSections.setters

  const renderLinksCollapsed = renderSectionsCollapsed.links
  const renderLayoutCollapsed = renderSectionsCollapsed.layout
  const renderBackgroundFogCollapsed = renderSectionsCollapsed.backgroundFog
  const renderStarfieldCollapsed = renderSectionsCollapsed.starfield
  const renderCameraCollapsed = renderSectionsCollapsed.camera
  const renderSelectionCollapsed = renderSectionsCollapsed.selection
  const renderPresetsCollapsed = renderSectionsCollapsed.presets
  const renderCodebaseIndexCollapsed = renderSectionsCollapsed.codebaseIndex

  const setRenderLinksCollapsed = renderSectionSetters.links
  const setRenderLayoutCollapsed = renderSectionSetters.layout
  const setRenderBackgroundFogCollapsed = renderSectionSetters.backgroundFog
  const setRenderStarfieldCollapsed = renderSectionSetters.starfield
  const setRenderCameraCollapsed = renderSectionSetters.camera
  const setRenderSelectionCollapsed = renderSectionSetters.selection
  const setRenderPresetsCollapsed = renderSectionSetters.presets
  const setRenderCodebaseIndexCollapsed = renderSectionSetters.codebaseIndex

  const {
    workspaceViewMode,
    canvasRenderMode,
    canvas2dRenderer,
    graphData,
    setCanvasPointerMode2d,
    schema,
    setSchema,
  } = useGraphStore(
    useShallow(s => ({
      workspaceViewMode: s.workspaceViewMode,
      canvasRenderMode: s.canvasRenderMode,
      canvas2dRenderer: s.canvas2dRenderer,
      graphData: s.graphData,
      setCanvasPointerMode2d: s.setCanvasPointerMode2d,
      schema: s.schema,
      setSchema: s.setSchema,
    })),
  )

  const { richMediaPanelMode, setRichMediaPanelMode } = useGraphStore(
    useShallow(s => ({
      richMediaPanelMode: s.richMediaPanelMode,
      setRichMediaPanelMode: s.setRichMediaPanelMode,
    })),
  )

  const [toolId, setToolId] = React.useState<GraphEditorToolId>('select')
  const appliedEdgeType = readGlobalEdgeType(schema)
  const appliedLayoutMode = readLayoutMode2d(schema)
  const [edgeTypeDraft, setEdgeTypeDraft] = React.useState<GlobalEdgeType>(appliedEdgeType)
  const [layoutModeDraft, setLayoutModeDraft] = React.useState<LayoutMode2d>(appliedLayoutMode)

  React.useEffect(() => {
    const next = toolId === 'pan' ? 'pan' : 'select'
    setCanvasPointerMode2d(next)
  }, [toolId, setCanvasPointerMode2d])

  React.useEffect(() => {
    setEdgeTypeDraft(appliedEdgeType)
  }, [appliedEdgeType])
  React.useEffect(() => {
    setLayoutModeDraft(appliedLayoutMode)
  }, [appliedLayoutMode])

  const applyRendererDraft = React.useCallback(() => {
    if (edgeTypeDraft === appliedEdgeType && layoutModeDraft === appliedLayoutMode) return
    const current = useGraphStore.getState().schema as GraphSchema
    const withEdgeType = withGlobalEdgeType(current, edgeTypeDraft)
    const layout = withEdgeType.layout || {}
    const nextSchema: GraphSchema = {
      ...withEdgeType,
      layout: {
        ...layout,
        mode: layoutModeDraft,
      },
    }
    if (nextSchema === current) return
    setSchema(nextSchema)
  }, [appliedEdgeType, appliedLayoutMode, edgeTypeDraft, layoutModeDraft, setSchema])

  const resetRendererDraft = React.useCallback(() => {
    setEdgeTypeDraft(appliedEdgeType)
    setLayoutModeDraft(appliedLayoutMode)
  }, [appliedEdgeType, appliedLayoutMode])

  const rendererDraftUnchanged = edgeTypeDraft === appliedEdgeType && layoutModeDraft === appliedLayoutMode

  React.useEffect(() => {
    if (!onRegisterActions) return
    onRegisterActions({
      apply: applyRendererDraft,
      reset: resetRendererDraft,
      applyDisabled: rendererDraftUnchanged,
      resetDisabled: rendererDraftUnchanged,
    })
  }, [applyRendererDraft, onRegisterActions, rendererDraftUnchanged, resetRendererDraft])

  const showGraphEditorUi =
    workspaceViewMode === 'editor' && canvasRenderMode === '2d' && canvas2dRenderer === 'd3'
  const showDesignWireframeUi = canvasRenderMode === '2d' && canvas2dRenderer === 'design'
  const showFlowchartUi = canvasRenderMode === '2d' && isFlowchartCanvas2dRenderer(canvas2dRenderer)
  const showRadarGalaxyUi = !!inspectionGraph || canvasRenderMode === '2d' && isD3Like2dRenderer(canvas2dRenderer)
  const allowLayoutModeSelection = !!inspectionGraph || isD3Like2dRenderer(canvas2dRenderer)

  React.useEffect(() => {
    if (allowLayoutModeSelection) return
    setLayoutModeDraft(appliedLayoutMode)
  }, [allowLayoutModeSelection, appliedLayoutMode])

  React.useEffect(
    () => () => {
      cancelWorkspaceSyncTask(WORKSPACE_SYNC_TASK_RENDERER_EDGE_TYPE_VIEW_STATE)
    },
    [],
  )

  const handleSelectEdgeType = React.useCallback((next: GlobalEdgeType) => {
    setEdgeTypeDraft(next)
    scheduleWorkspaceSyncTask(
      WORKSPACE_SYNC_TASK_RENDERER_EDGE_TYPE_VIEW_STATE,
      () => {
        const state = useGraphStore.getState()
        const current = state.schema as GraphSchema
        const nextSchema = withGlobalEdgeType(current, next)
        if (nextSchema === current) return
        state.setSchema(nextSchema)
      },
      0,
      {
        scopeKey: WORKSPACE_SYNC_SCOPE_RENDERER_EDGE_TYPE_RUNTIME_PERSISTENCE,
      },
    )
  }, [])

  return (
    <section className="flex flex-col gap-2">
      <RendererGraphTopologySummary graph={inspectionGraph ?? undefined} />
      <React.Suspense fallback={null}>
        <WorkspaceTableModeControlLazy />
      </React.Suspense>
      <RendererPaletteSettings />
      <RendererHoverSettings />
      <LayoutModeRendererSettings
        selectedLayoutMode={layoutModeDraft}
        onSelectLayoutMode={setLayoutModeDraft}
        disabled={!allowLayoutModeSelection}
      />
      <EdgeTypesRendererSettings
        selectedEdgeType={edgeTypeDraft}
        onSelectEdgeType={handleSelectEdgeType}
      />
      {showRadarGalaxyUi ? <RadarGalaxyRendererSettings /> : null}
      {showFlowchartUi ? <FlowchartRendererSettings /> : null}
      <section className="flex flex-col gap-1" aria-label="Rich media rendering">
        <section className={`text-xs font-semibold ${UI_THEME_TOKENS.button.text}`}>
          Rich media
        </section>
        <label className="flex items-center gap-2 text-xs">
          <span className="min-w-0">Panel mode</span>
          <select
            className={`App-toolbar__btn text-xs ${UI_THEME_TOKENS.button.text} ${UI_THEME_TOKENS.button.hoverBg}`}
            value={richMediaPanelMode}
            onChange={e => {
              const v = String(e.target.value || '')
              setRichMediaPanelMode(v === 'embed' ? 'embed' : 'snapshot')
            }}
          >
            <option value="snapshot">Snapshot preview</option>
            <option value="embed">Interactive embed</option>
          </select>
        </label>
      </section>
      {showDesignWireframeUi ? <DesignWireframeSettings /> : null}
      {showGraphEditorUi ? (
        <section className="flex gap-2" aria-label="Graph editor tools and inspector">
          <GraphEditorToolRail
            activeToolId={toolId}
            onSelectTool={setToolId}
            disabled={!graphData}
          />
          <section className="flex-1 min-w-0">
            <GraphEditorRightPanel />
          </section>
        </section>
      ) : null}
      <section className="flex items-center gap-2">
        <button
          type="button"
          className={`App-toolbar__btn text-xs ${UI_THEME_TOKENS.button.text} ${UI_THEME_TOKENS.button.hoverBg}`}
          onClick={collapseRenderSections}
          disabled={allRenderSectionsCollapsed}
        >
          {UI_LABELS.collapseAll}
        </button>
        <button
          type="button"
          className={`App-toolbar__btn text-xs ${UI_THEME_TOKENS.button.text} ${UI_THEME_TOKENS.button.hoverBg}`}
          onClick={expandRenderSections}
        >
          {UI_LABELS.expandAll}
        </button>
      </section>
      <RenderSettingsSection
        threeGroupsCollapsed={{
          links: renderLinksCollapsed,
          layout: renderLayoutCollapsed,
          backgroundFog: renderBackgroundFogCollapsed,
          starfield: renderStarfieldCollapsed,
          camera: renderCameraCollapsed,
          selection: renderSelectionCollapsed,
        }}
        onToggleThreeGroup={(group, next) => {
          if (group === 'links') setRenderLinksCollapsed(next)
          else if (group === 'layout') setRenderLayoutCollapsed(next)
          else if (group === 'backgroundFog') setRenderBackgroundFogCollapsed(next)
          else if (group === 'starfield') setRenderStarfieldCollapsed(next)
          else if (group === 'camera') setRenderCameraCollapsed(next)
          else if (group === 'selection') setRenderSelectionCollapsed(next)
        }}
        presetsCollapsed={renderPresetsCollapsed}
        onTogglePresets={setRenderPresetsCollapsed}
        codebaseIndexCollapsed={renderCodebaseIndexCollapsed}
        onToggleCodebaseIndex={setRenderCodebaseIndexCollapsed}
      />
    </section>
  )
}
