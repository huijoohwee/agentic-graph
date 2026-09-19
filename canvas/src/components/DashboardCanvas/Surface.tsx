import React from 'react'
import DashboardCanvas from './index'
import { useDashboardWidgets } from './dashboardWidgetConfiguration'
import type { AgentRunView } from '@/features/agent-ready/agentRunInspectionStore'
import { useAgentRunWorkspace } from '@/features/agent-ready/agentRunInspectionStore'
const Mission = React.lazy(() => import('@/features/agent-ready/AgenticOsMissionControl'))
const MissionOverview = React.lazy(() => import('@/features/agent-ready/AgentMissionOverview'))

/** One original Dashboard layout; Mission contributes widgets, never another renderer. */
export default function DashboardSurface({ active = true, preview = false, onOpenWorkspace }: {
  active?: boolean; preview?: boolean; onOpenWorkspace?: () => void
}) {
  const workspace = useAgentRunWorkspace()
  const saved = useDashboardWidgets()
  const retained = workspace ? undefined : saved.dashboard?.mission
  const [spanId, setSpanId] = React.useState<string | null>(null), [view, setView] = React.useState<AgentRunView>('tree')
  React.useEffect(() => { setSpanId(null); setView('tree') }, [saved.sourcePath])
  if (!active) return null
  const mission = <React.Suspense fallback={<p role="status">Loading Mission widgets…</p>}><Mission key={retained ? saved.sourcePath : 'live'} retained={retained} retainedSpanId={spanId} onRetainedSpan={setSpanId} retainedView={view} onRetainedView={setView} workspace={!!workspace} preview={preview || !workspace} onOpenWorkspace={onOpenWorkspace} /></React.Suspense>
  return <section aria-label="Dashboard" data-renderer="dashboard" className="relative h-full min-h-0 min-w-0">
    <DashboardCanvas active retainedSpanId={spanId} onRetainedSpan={setSpanId} overview={workspace || retained ? <React.Suspense fallback={<p role="status">Loading Mission evidence…</p>}><MissionOverview retained={retained} retainedSpanId={spanId} onRetainedSpan={setSpanId} onRetainedView={setView}>{mission}</MissionOverview></React.Suspense> : undefined}>
      {!workspace && !retained && mission}
    </DashboardCanvas>
  </section>
}
