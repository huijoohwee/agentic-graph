import React from 'react'
import { useDashboardWidgets, configureDashboardCards, configureDashboardMetrics, updateDashboardWidgets } from './dashboardWidgetConfiguration'
import DashboardWidgetFlip from './DashboardWidgetFlip'
import { DashboardLineAreaChart } from './DashboardCharts'
import { DashboardCardView, DashboardMetricTile } from './DashboardWidgets'
import { useDashboardSource } from './useDashboardSource'
import { useGraphStore } from '@/hooks/useGraphStore'
import { useContainerDims } from '@/hooks/useContainerDims'
import { areKanbanRowIdsEqual } from '@/features/markdown/ui/kanban/kanbanOrderState'
import { reorderKanbanRowIds } from '@/features/markdown/ui/kanban/kanbanReorder'
import {
  useKanbanDragAndDrop,
} from '@/features/markdown/ui/kanban/useKanbanDragAndDrop'
import { CanvasGridOverlaySurface } from '@/components/CanvasGridOverlaySurface'
import { readCanvasGridRenderConfigFromSchema } from '@/lib/canvas/canvasGridConfig'
import { buildScopedGraphSemanticKey } from '@/lib/graph/semanticKey'
import {
  UI_RESPONSIVE_VIEWPORT_FIT_CONTENT_CLASSNAME,
  UI_RESPONSIVE_VIEWPORT_FIT_GRID_CLASSNAME,
  buildResponsiveViewportFitContentStyle,
  buildResponsiveViewportFitGridStyle,
} from '@/lib/ui/responsiveViewportFitGrid'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import {
  buildDashboardCanvasModel,
} from './dashboardModel'

type DashboardCanvasProps = {
  active?: boolean
  headerActions?: React.ReactNode
  children?: React.ReactNode
}

const DASHBOARD_METRICS_GROUP_KEY = 'dashboard-metrics'
const DASHBOARD_CONTENT_STYLE = buildResponsiveViewportFitContentStyle()
const DASHBOARD_METRICS_GRID_STYLE = buildResponsiveViewportFitGridStyle()

export default function DashboardCanvas(props: DashboardCanvasProps) {
  const widgetConfiguration = useDashboardWidgets()
  const active = props.active !== false
  const containerRef = React.useRef<HTMLElement | null>(null)
  const { graphData, selectedNodeId, selectNode, readOnly } = useDashboardSource(active)
  const schema = useGraphStore(state => state.schema)
  const resolvedThemeMode = useGraphStore(state => state.resolvedThemeMode || 'light')
  const updateNode = useGraphStore(state => state.updateNode)
  const dims = useContainerDims(containerRef)
  const graphSemanticKey = React.useMemo(
    () => buildScopedGraphSemanticKey('dashboard-canvas', { graphData }),
    [graphData],
  )
  const model = React.useMemo(
    () => buildDashboardCanvasModel(graphData, schema),
    [graphData, schema],
  )
  const canvasGrid = React.useMemo(() => readCanvasGridRenderConfigFromSchema(schema), [schema])
  const getDashboardGridTransform = React.useCallback(() => ({ k: 1, x: 0, y: 0 }), [])
  const getDashboardGridEventTarget = React.useCallback(() => containerRef.current, [])
  const displayMetrics = React.useMemo(() => configureDashboardMetrics(widgetConfiguration.document, model.metrics), [widgetConfiguration.document, model.metrics])
  const displaySections = React.useMemo(() => model.sections.map(section => ({ ...section,
    cards: configureDashboardCards(widgetConfiguration.document, section.cards, model.sections.flatMap(item => item.cards)),
  })).filter(section => section.cards.length > 0), [widgetConfiguration.document, model.sections])
  const orderedIds = (group: string) => group === DASHBOARD_METRICS_GROUP_KEY ? displayMetrics.map(item => item.id)
    : displaySections.find(section => section.id === group)?.cards.map(item => item.id) ?? []
  const dashboardDrag = useKanbanDragAndDrop({
    enabled: active,
    isNoOpMove: move => {
      if (move.sourceGroupKey !== move.targetGroupKey) return true
      const ids = orderedIds(move.targetGroupKey)
      return !ids.includes(move.rowId) || areKanbanRowIdsEqual(ids, reorderKanbanRowIds({ orderedRowIds: ids, availableRowIds: ids,
        rowIdToGroupKey: new Map(ids.map(id => [id, move.targetGroupKey])), draggedRowId: move.rowId,
        targetGroupKey: move.targetGroupKey, targetRowId: move.targetRowId, position: move.position }))
    },
    onCommitMove: move => {
      if (move.sourceGroupKey !== move.targetGroupKey) return
      const ids = orderedIds(move.targetGroupKey)
      if (!ids.includes(move.rowId)) return
      const next = reorderKanbanRowIds({ orderedRowIds: ids, availableRowIds: ids,
        rowIdToGroupKey: new Map(ids.map(id => [id, move.targetGroupKey])), draggedRowId: move.rowId,
        targetGroupKey: move.targetGroupKey, targetRowId: move.targetRowId, position: move.position })
      void updateDashboardWidgets(Object.fromEntries(next.map((id, order) => [`graph:${id}`, { order }]))).catch(() => undefined)
    },
  })

  const handleCommitRowLabel = React.useCallback((rowId: string, nextValue: string) => {
    const nodeId = String(rowId || '').trim()
    if (!nodeId || readOnly) return
    updateNode(nodeId, {
      label: String(nextValue || '').trim(),
    })
  }, [updateNode, readOnly])

  if (!active) return null

  return (
    <section
      ref={containerRef}
      className={`absolute inset-0 overflow-hidden bg-[var(--kg-canvas-bg)] ${UI_THEME_TOKENS.text.primary}`}
      aria-label="Dashboard canvas"
      data-kg-dashboard-canvas="1"
      data-kg-dashboard-source={readOnly ? 'observation' : 'authored'}
      data-kg-dashboard-semantic-key={graphSemanticKey || 'empty'}
      data-kg-dashboard-grid-enabled={model.grid.enabled ? '1' : '0'}
      data-kg-dashboard-grid-variant={model.grid.variant}
    >
      <CanvasGridOverlaySurface
        canvasGrid={canvasGrid}
        width={dims.width}
        height={dims.height}
        dpr={dims.dpr}
        getTransform={getDashboardGridTransform}
        getEventTarget={getDashboardGridEventTarget}
        themeSignal={String(resolvedThemeMode)}
        surfaceId="dashboard"
      />
      <section className="absolute inset-0 overflow-auto z-[1]" data-kg-dashboard-scroll-surface="1">
        <section
          className={UI_RESPONSIVE_VIEWPORT_FIT_CONTENT_CLASSNAME}
          style={DASHBOARD_CONTENT_STYLE}
          data-kg-dashboard-responsive-width="1"
        >
          <header className="grid min-w-0 grid-cols-1 gap-4 border-b border-[var(--kg-border)] pb-4 lg:grid-cols-[minmax(0,1fr)_minmax(320px,42%)]">
            <section className="min-w-0">
              <p className={`m-0 text-xs font-medium ${UI_THEME_TOKENS.text.tertiary}`}>Dashboard</p>
              {props.headerActions}
              <h2 className="m-0 mt-1 truncate text-2xl font-semibold leading-tight" title={model.title}>{model.title}</h2>
              <p className={`m-0 mt-2 truncate text-sm ${UI_THEME_TOKENS.text.secondary}`} title={model.subtitle}>{model.subtitle}</p>
            </section>
            <section className="h-[180px] min-w-0">
              <DashboardLineAreaChart series={model.heroSeries} tone="blue" gridEnabled={model.grid.enabled} area />
            </section>
          </header>

          <section className="min-w-0" aria-label="Dashboard metrics" data-kg-dashboard-metrics-board="1">
            <section
              className={UI_RESPONSIVE_VIEWPORT_FIT_GRID_CLASSNAME}
              style={DASHBOARD_METRICS_GRID_STYLE}
              data-kg-dashboard-metrics-cards="1"
              {...dashboardDrag.createLaneDropProps(DASHBOARD_METRICS_GROUP_KEY)}
            >
              {displayMetrics.map(metric => {
                const metricDragProps = dashboardDrag.createCardDragProps({ rowId: metric.id, groupKey: DASHBOARD_METRICS_GROUP_KEY })
                const metricDropProps = dashboardDrag.createCardDropProps({ rowId: metric.id, groupKey: DASHBOARD_METRICS_GROUP_KEY })
                return (
                  <DashboardWidgetFlip key={metric.id} widgetId={`graph:${metric.id}`} template="metric" title={metric.label} defaults={{ title: metric.label, subtitle: metric.detail, tone: metric.tone }}>
                  <DashboardMetricTile
                    metric={metric}
                    cardDragProps={metricDragProps}
                    cardDropProps={metricDropProps}
                    draggingMetricId={dashboardDrag.draggingRowId}
                    dragOverMetricId={dashboardDrag.dragOverRowId}
                    dragOverPosition={dashboardDrag.dragOverPosition}
                    commitFlashMetricId={dashboardDrag.commitFlashRowId}
                    registerMetricElement={(metricId, element) => {
                      dashboardDrag.registerFocusableRowElement({ rowId: metricId, element })
                    }}
                  />
                  </DashboardWidgetFlip>
                )
              })}
            </section>
          </section>

          <section className="min-w-0" data-kg-dashboard-sections-board="1">
            <section className="grid min-w-0 grid-cols-1 gap-5">
              {displaySections.map(section => (
                <section key={section.id} className="min-w-0" data-kg-dashboard-section={section.id}>
                  <header className="mb-3 flex min-w-0 items-center gap-3">
                    <h3 className="m-0 shrink-0 text-base font-semibold">{section.title}</h3>
                    <div className="h-px min-w-0 flex-1 bg-[var(--kg-border)]" aria-hidden="true" />
                    <span className={`shrink-0 text-xs ${UI_THEME_TOKENS.text.tertiary}`}>{section.cadence}</span>
                  </header>
                  <section
                    className="grid min-w-0 grid-cols-1 gap-3 lg:grid-cols-3"
                    data-kg-dashboard-section-cards="1"
                    {...dashboardDrag.createLaneDropProps(section.id)}
                  >
                    {section.cards.map(card => {
                      const cardDragProps = dashboardDrag.createCardDragProps({ rowId: card.id, groupKey: section.id })
                      const cardDropProps = dashboardDrag.createCardDropProps({ rowId: card.id, groupKey: section.id })
                      return (
                        <DashboardWidgetFlip key={card.id} widgetId={`graph:${card.id}`} template={card.kind} title={card.title} defaults={{ title: card.title, subtitle: card.subtitle, footnote: card.footnote, kind: card.kind, tone: card.tone }}>
                        <DashboardCardView
                          sectionLabel={section.title}
                          card={card}
                          gridEnabled={model.grid.enabled}
                          selectedNodeId={selectedNodeId}
                          canEditRows={!readOnly && typeof updateNode === 'function'}
                          cardDragProps={cardDragProps}
                          cardDropProps={cardDropProps}
                          draggingCardId={dashboardDrag.draggingRowId}
                          dragOverCardId={dashboardDrag.dragOverRowId}
                          dragOverPosition={dashboardDrag.dragOverPosition}
                          commitFlashCardId={dashboardDrag.commitFlashRowId}
                          registerCardElement={(cardId, element) => {
                            dashboardDrag.registerFocusableRowElement({ rowId: cardId, element })
                          }}
                          onSelectRow={selectNode}
                          onCommitRowLabel={handleCommitRowLabel}
                        />
                        </DashboardWidgetFlip>
                      )
                    })}
                  </section>
                </section>
              ))}
            </section>
          </section>
          {props.children}
        </section>
      </section>
    </section>
  )
}
