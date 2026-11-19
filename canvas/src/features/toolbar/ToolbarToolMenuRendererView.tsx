import { PanelSelect } from '@/lib/ui/panelFormControls'
import { ResponsiveControlRow } from '@/lib/ui/responsiveControlRows'
import { MainPanelTypeIcon } from '@/features/panels/ui/mainPanelHelpIconLibrary'
import React from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useRendererPanelState } from '@/features/panels/hooks/useRendererPanelState'
import RenderSettingsSection from '@/lib/panels/views/RenderSettingsSection.impl'
import { CollapsibleSection, ExpandCollapseAllButton, PanelTabHeader } from 'agentic-design-system/react/panels'
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
import { uiToolbarSettingsPanelBodyClassName } from '@/features/toolbar/ui/toolbarStyles'
import type { GraphSchema } from '@/lib/graph/schema'
import { readGlobalEdgeType, type GlobalEdgeType, withGlobalEdgeType } from '@/lib/graph/edgeTypes'
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
  const showRadarGalaxyUi = !inspectionGraph && canvasRenderMode === '2d' && isD3Like2dRenderer(canvas2dRenderer)
  const { allCollapsed, setAll, disclosure } = useRendererPanelState({
    source: 'floatingPanel', topology: Boolean(inspectionGraph || graphData), tuning: !inspectionGraph, radar: showRadarGalaxyUi, flowchart: showFlowchartUi, design: showDesignWireframeUi,
  })
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
    <section className="agentic-panel-tab-layout">
      <PanelTabHeader title="Renderer" actions={
        <ExpandCollapseAllButton allCollapsed={allCollapsed} onExpandAll={() => setAll(false)} onCollapseAll={() => setAll(true)} />
      } />
      <div className="agentic-panel-tab-body">
        <RendererGraphTopologySummary graph={inspectionGraph ?? undefined} {...disclosure('topology')} />
        <section className={uiToolbarSettingsPanelBodyClassName}>
          <React.Suspense fallback={null}>
            <WorkspaceTableModeControlLazy />
          </React.Suspense>
        </section>
        <CollapsibleSection headingAs="h3" title="Appearance" {...disclosure('appearance')}>
          <RendererPaletteSettings />
          <RendererHoverSettings />
        </CollapsibleSection>
        <RenderSettingsSection
          inspection={!!inspectionGraph}
          layoutSettings={{ selectedLayoutMode: layoutModeDraft, onSelectLayoutMode: setLayoutModeDraft, disabled: !allowLayoutModeSelection }}
          disclosure={disclosure}
        />
        <EdgeTypesRendererSettings
          {...disclosure('edgeTypes')}
          selectedEdgeType={edgeTypeDraft}
          onSelectEdgeType={handleSelectEdgeType}
        />
        {showRadarGalaxyUi ? <RadarGalaxyRendererSettings {...disclosure('radar')} /> : null}
        {showFlowchartUi ? <FlowchartRendererSettings {...disclosure('flowchart')} /> : null}
        <CollapsibleSection headingAs="h3" title="Rich media" {...disclosure('richMedia')}>
          <ResponsiveControlRow label="Panel mode" typeNode={<MainPanelTypeIcon iconKey="setting.text" />}>
            <PanelSelect
              className={`App-toolbar__btn text-xs ${UI_THEME_TOKENS.button.text} ${UI_THEME_TOKENS.button.hoverBg}`}
              value={richMediaPanelMode}
              onValueChange={selectedValueInput => {
                const v = String(selectedValueInput || '')
                setRichMediaPanelMode(v === 'embed' ? 'embed' : 'snapshot')
              }}
            >
              <option value="snapshot">Snapshot preview</option>
              <option value="embed">Interactive embed</option>
            </PanelSelect>
          </ResponsiveControlRow>
        </CollapsibleSection>
        {showDesignWireframeUi ? <DesignWireframeSettings {...disclosure('design')} /> : null}
        {showGraphEditorUi ? (
          <section className="flex min-w-0 max-w-full flex-wrap gap-2" aria-label="Graph editor tools and inspector">
            <GraphEditorToolRail
              activeToolId={toolId}
              onSelectTool={setToolId}
              disabled={!graphData}
            />
            <section className="flex-1 basis-64 min-w-0 max-w-full">
              <GraphEditorRightPanel />
            </section>
          </section>
        ) : null}
      </div>
    </section>
  )
}
