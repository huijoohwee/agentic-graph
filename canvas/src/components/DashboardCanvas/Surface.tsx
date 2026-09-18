import React from 'react'
import DashboardCanvas from './index'
import { useGraphStore } from '@/hooks/useGraphStore'
import { useAgentRunWorkspace, useAgentRunInspection, closeAgentRunInspection } from '@/features/agent-ready/agentRunInspectionStore'
import { DASHBOARD_WIDGET_DRAG_TYPE, addDashboardWidget } from './dashboardWidgetPaletteActions'
const Mission = React.lazy(() => import('@/features/agent-ready/AgenticOsMissionControl'))

/** One original Dashboard layout; Mission contributes widgets, never another renderer. */
export default function DashboardSurface({ active = true, preview = false, onOpenWorkspace }: {
  active?: boolean; preview?: boolean; onOpenWorkspace?: () => void
}) {
  const workspace = useAgentRunWorkspace(), inspection = useAgentRunInspection()
  if (!active) return null
  return <section aria-label="Dashboard" data-renderer="dashboard" className="relative h-full min-h-0 min-w-0" onDragOver={event => {
    if (event.dataTransfer.types.includes(DASHBOARD_WIDGET_DRAG_TYPE)) event.preventDefault()
  }} onDrop={event => { const source = event.dataTransfer.getData(DASHBOARD_WIDGET_DRAG_TYPE); if (source) { event.preventDefault(); void addDashboardWidget(source).catch(() => undefined) } }}>
    <DashboardCanvas active headerActions={<div className="mt-2 flex flex-wrap gap-2 text-xs">
      <button className="rounded border px-2 py-1" onClick={() => { const state = useGraphStore.getState(); state.setFloatingPanelView('propsPanel'); state.setFloatingPanelOpen(true) }}>Props Panel</button>
      {workspace && <><button className="rounded border px-2 py-1" disabled={!inspection} onClick={() => useGraphStore.getState().setWorkspaceViewState({ mode: 'editor', paneOpen: !window.matchMedia('(max-width: 768px), (pointer: coarse)').matches })}>Show Editor Workspace</button>
        <button className="rounded border px-2 py-1" onClick={closeAgentRunInspection}>Close run inspection</button></>}
    </div>}>
      <React.Suspense fallback={<p role="status">Loading Mission widgets…</p>}><Mission workspace={!!workspace} preview={preview || !workspace} onOpenWorkspace={onOpenWorkspace} /></React.Suspense>
    </DashboardCanvas>
  </section>
}
