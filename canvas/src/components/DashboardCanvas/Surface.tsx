import React from 'react'
import DashboardCanvas from './index'
import { useAgentRunWorkspace } from '@/features/agent-ready/agentRunInspectionStore'
const Mission = React.lazy(() => import('@/features/agent-ready/AgenticOsMissionControl'))

/** One original Dashboard layout; Mission contributes widgets, never another renderer. */
export default function DashboardSurface({ active = true, preview = false, onOpenWorkspace }: {
  active?: boolean; preview?: boolean; onOpenWorkspace?: () => void
}) {
  const workspace = useAgentRunWorkspace()
  if (!active) return null
  return <section aria-label="Dashboard" data-renderer="dashboard" className="relative h-full min-h-0 min-w-0">
    <DashboardCanvas active>
      <React.Suspense fallback={<p role="status">Loading Mission widgets…</p>}><Mission workspace={!!workspace} preview={preview || !workspace} onOpenWorkspace={onOpenWorkspace} /></React.Suspense>
    </DashboardCanvas>
  </section>
}
