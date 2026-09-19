import React from 'react'
import { useDashboardWidgets, configureDashboardCards, configureDashboardMetrics } from './dashboardWidgetConfiguration'
import DashboardWidgetFlip from './DashboardWidgetFlip'
import { DashboardLineAreaChart } from './DashboardCharts'
import { DashboardCardView, DashboardMetricTile } from './DashboardWidgets'
import { useDashboardSource } from './useDashboardSource'
import { useGraphStore } from '@/hooks/useGraphStore'
import { useContainerDims } from '@/hooks/useContainerDims'
import DashboardWidgetContainer from './DashboardWidgetContainer'
import DashboardDocumentWidgets from './DashboardDocumentWidgets'
import { DashboardMarkdown } from './DashboardMarkdown'
import DashboardWidgetBoard from './DashboardWidgetBoard'
import { CanvasGridOverlaySurface } from '@/components/CanvasGridOverlaySurface'
import { readCanvasGridRenderConfigFromSchema } from '@/lib/canvas/canvasGridConfig'
import { buildScopedGraphSemanticKey } from '@/lib/graph/semanticKey'
import {
  UI_RESPONSIVE_VIEWPORT_FIT_CONTENT_CLASSNAME,
  buildResponsiveViewportFitContentStyle,
} from '@/lib/ui/responsiveViewportFitGrid'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import {
  buildDashboardCanvasModel,
} from './dashboardModel'

type DashboardCanvasProps = {
  active?: boolean
  children?: React.ReactNode
  overview?: React.ReactNode
}

const DASHBOARD_CONTENT_STYLE = buildResponsiveViewportFitContentStyle()
const DashboardSnapshotView = React.lazy(() => import('./DashboardSnapshotView'))
const AgentMissionDashboardExport = React.lazy(() => import('@/features/agent-ready/AgentMissionDashboardExport'))

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
          className={`kg-dashboard-content ${UI_RESPONSIVE_VIEWPORT_FIT_CONTENT_CLASSNAME}`}
          style={DASHBOARD_CONTENT_STYLE}
          data-kg-dashboard-responsive-width="1"
        >
          <React.Suspense fallback={null}><AgentMissionDashboardExport /></React.Suspense>
          {widgetConfiguration.dashboard && !readOnly ? <React.Suspense fallback={<p>Opening saved dashboard…</p>}><DashboardSnapshotView /></React.Suspense> : <>
          <header className="kg-dashboard-header grid min-w-0 grid-cols-1 items-center gap-3 border-b border-[var(--kg-border)] pb-3 lg:grid-cols-[minmax(0,1fr)_minmax(200px,28%)]">
            <section className="min-w-0">
              <DashboardMarkdown text={widgetConfiguration.document.widgets['graph:header']?.markdown ?? `Dashboard\n\n## ${widgetConfiguration.document.widgets['graph:header']?.title ?? model.title}\n\n${widgetConfiguration.document.widgets['graph:header']?.subtitle ?? model.subtitle}`} label="Dashboard heading and description" />
            </section>
            <section className="h-[72px] min-w-0 lg:h-[96px]">
              <DashboardLineAreaChart series={model.heroSeries} tone="blue" gridEnabled={model.grid.enabled} area />
            </section>
          </header>

          {props.overview}

          <section className="min-w-0" aria-label="Dashboard metrics" data-kg-dashboard-metrics-board="1">
            <DashboardWidgetBoard id="dashboard-metrics" columns={5} items={displayMetrics.map(metric => ({
              id: `graph:${metric.id}`, cardId: metric.id,
              content: <DashboardWidgetFlip widgetId={`graph:${metric.id}`} template="metric" title={metric.label} defaults={{ title: metric.label, subtitle: metric.detail, tone: metric.tone }}>
                <DashboardMetricTile metric={metric} />
              </DashboardWidgetFlip>,
            }))} />
          </section>

          <section className="min-w-0" data-kg-dashboard-sections-board="1">
            <section className="grid min-w-0 grid-cols-1 gap-5">
              {displaySections.map(section => (
                <DashboardWidgetContainer key={section.id} id={section.id} title={section.title} subtitle={section.cadence}
                    columns={3} items={section.cards.map(card => ({
                      id: `graph:${card.id}`, cardId: card.id,
                      content: <DashboardWidgetFlip widgetId={`graph:${card.id}`} template={card.kind} title={card.title} defaults={{ title: card.title, subtitle: card.subtitle, footnote: card.footnote, kind: card.kind, tone: card.tone }}>
                        <DashboardCardView sectionLabel={section.title} card={card} gridEnabled={model.grid.enabled}
                          selectedNodeId={selectedNodeId} canEditRows={!readOnly && typeof updateNode === 'function'}
                          onSelectRow={selectNode} onCommitRowLabel={handleCommitRowLabel} />
                      </DashboardWidgetFlip>,
                    }))} />
              ))}
            </section>
          </section>
          <DashboardDocumentWidgets sourceIds={[...model.metrics.map(item => `graph:${item.id}`), ...model.sections.flatMap(section => section.cards.map(card => `graph:${card.id}`))]} />
          {props.children}
          </>}
        </section>
      </section>
    </section>
  )
}
