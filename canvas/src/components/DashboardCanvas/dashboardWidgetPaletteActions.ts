import { useGraphStore } from '@/hooks/useGraphStore'
import { buildDashboardCanvasModel } from './dashboardModel'
import { updateDashboardWidget } from './dashboardWidgetConfiguration'
import { selectAgentRunView } from '@/features/agent-ready/agentRunInspectionStore'

export const DASHBOARD_WIDGET_DRAG_TYPE = 'application/x-agentic-dashboard-widget'
export async function addDashboardWidget(source: string) {
  if (source === 'mission:tree') {
    await updateDashboardWidget(source, { visible: true }); selectAgentRunView(source.slice(8)); return
  }
  const state = useGraphStore.getState(), model = buildDashboardCanvasModel(state.graphData, state.schema)
  const sources = [...model.metrics.map(metric => ({ id: metric.id, title: metric.label })), ...model.sections.flatMap(section => section.cards)]
  if (!sources.some(item => `graph:${item.id}` === source)) throw Error('Dashboard widget source is unavailable.')
  await updateDashboardWidget(`graph:widget-${crypto.randomUUID()}`, { source, visible: true })
}
