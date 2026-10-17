import { readFileSync } from 'node:fs'

export function testDashboardCanvasReusesBaseVisuals() {
  const canvas = readFileSync(new URL('../components/DashboardCanvas/index.tsx', import.meta.url), 'utf8')
  const widgets = readFileSync(new URL('../components/DashboardCanvas/DashboardWidgets.tsx', import.meta.url), 'utf8')
  const charts = readFileSync(new URL('../components/DashboardCanvas/DashboardCharts.tsx', import.meta.url), 'utf8')

  for (const snippet of [
    'import { DashboardWidgetCard } from \'@agentic-base/views-react/dashboard\'',
    'titleEditor',
    'subtitleEditor',
    'footnoteEditor',
    'cardDragProps={cardDragProps}',
    'cardDropProps={cardDropProps}',
    'registerElement={props.registerCardElement}',
    'CardInlineTextEditor',
    'DashboardWidgetBoard',
    'DashboardWidgetContainer',
    'KanbanCardDropPreview',
  ]) {
    if (!widgets.includes(snippet)) throw new Error(`expected Graph dashboard host to compose Base visuals and retain consumer actions: ${snippet}`)
  }
  for (const snippet of [
    'DashboardBarChart',
    'DashboardLineAreaChart',
    'DASHBOARD_CHART_TONE_COLORS',
    "from '@agentic-base/views-react/dashboard'",
  ]) {
    if (!charts.includes(snippet)) throw new Error(`expected Graph dashboard charts to consume Base rendering: ${snippet}`)
  }
  for (const snippet of [
    'CanvasGridOverlaySurface',
    'DashboardWidgetBoard',
    'data-kg-dashboard-scroll-surface="1"',
    'data-kg-dashboard-sections-board="1"',
    'data-kg-dashboard-metrics-board="1"',
  ]) {
    if (!canvas.includes(snippet)) throw new Error(`expected Graph to retain dashboard product composition: ${snippet}`)
  }
  for (const source of [widgets, charts]) {
    if (source.includes('getKanbanCardDragVisualState')) throw new Error('dashboard drag visuals must have one owner in Base')
  }
  if (charts.includes('function ChartGridLines') || charts.includes('<svg')) {
    throw new Error('dashboard chart geometry must have one owner in Base')
  }
}
