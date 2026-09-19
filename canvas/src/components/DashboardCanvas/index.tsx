import React from 'react'
import { useDashboardWidgets, configureDashboardCards, configureDashboardMetrics } from './dashboardWidgetConfiguration'
import DashboardWidgetFlip from './DashboardWidgetFlip'
import { DashboardLineAreaChart } from './DashboardCharts'
import { DashboardCardView, DashboardMetricTile } from './DashboardWidgets'
import { useDashboardSource } from './useDashboardSource'
import { useGraphStore } from '@/hooks/useGraphStore'
import { useContainerDims } from '@/hooks/useContainerDims'
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
          <header className="kg-dashboard-header grid min-w-0 grid-cols-1 items-center gap-3 border-b border-[var(--kg-border)] pb-3 lg:grid-cols-[minmax(0,1fr)_minmax(200px,28%)]">
            <section className="min-w-0">
              <p className={`m-0 text-xs font-medium ${UI_THEME_TOKENS.text.tertiary}`}>Dashboard</p>
              <h2 className="m-0 mt-1 truncate text-xl font-semibold leading-tight" title={model.title}>{model.title}</h2>
              <p className={`m-0 mt-1 truncate text-xs ${UI_THEME_TOKENS.text.secondary}`} title={model.subtitle}>{model.subtitle}</p>
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
                <section key={section.id} className="min-w-0" data-kg-dashboard-section={section.id}>
                  <header className="mb-3 flex min-w-0 items-center gap-3">
                    <h3 className="m-0 shrink-0 text-base font-semibold">{section.title}</h3>
                    <div className="h-px min-w-0 flex-1 bg-[var(--kg-border)]" aria-hidden="true" />
                    <span className={`shrink-0 text-xs ${UI_THEME_TOKENS.text.tertiary}`}>{section.cadence}</span>
                  </header>
                  <section data-kg-dashboard-section-cards="1">
                    <DashboardWidgetBoard id={section.id} columns={3} items={section.cards.map(card => ({
                      id: `graph:${card.id}`, cardId: card.id,
                      content: <DashboardWidgetFlip widgetId={`graph:${card.id}`} template={card.kind} title={card.title} defaults={{ title: card.title, subtitle: card.subtitle, footnote: card.footnote, kind: card.kind, tone: card.tone }}>
                        <DashboardCardView sectionLabel={section.title} card={card} gridEnabled={model.grid.enabled}
                          selectedNodeId={selectedNodeId} canEditRows={!readOnly && typeof updateNode === 'function'}
                          onSelectRow={selectNode} onCommitRowLabel={handleCommitRowLabel} />
                      </DashboardWidgetFlip>,
                    }))} />
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
