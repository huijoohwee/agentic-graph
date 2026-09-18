import React from 'react'
import TabHeader from '@/features/panels/ui/TabHeader'
import { useGraphStore } from '@/hooks/useGraphStore'
import { useAgentRunWorkspace, useAgentRunInspection, closeAgentRunInspection } from '@/features/agent-ready/agentRunInspectionStore'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'

const Mission = React.lazy(() => import('@/features/agent-ready/AgenticOsMissionControl'))
const GraphStatistics = React.lazy(() => import('./index'))
const tabs = [{ key: 'mission', label: 'Agent Mission' }, { key: 'graph', label: 'Graph statistics' }]

/** The existing 2D Dashboard owns both projections; neither creates authored evidence. */
export default function DashboardSurface({ active = true, preview = false, onOpenWorkspace }: {
  active?: boolean; preview?: boolean; onOpenWorkspace?: () => void
}) {
  const workspace = useAgentRunWorkspace(), inspection = useAgentRunInspection()
  const [tab, setTab] = React.useState('mission')
  if (!active) return null
  return <section aria-label="Dashboard" data-renderer="dashboard" className={`flex h-full min-h-0 min-w-0 flex-col overflow-hidden ${UI_THEME_TOKENS.panel.bg}`}>
    <header className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b p-2">
      <TabHeader tabs={tabs} activeTab={tab} onTabChange={setTab} tabIdBase="canvas-dashboard" />
      {workspace && <div className="flex flex-wrap gap-2 text-xs">
        <button className="rounded border px-2 py-1" disabled={!inspection} onClick={() => useGraphStore.getState().setWorkspaceViewState({ mode: 'editor', paneOpen: !window.matchMedia('(max-width: 768px), (pointer: coarse)').matches })}>Show Editor Workspace</button>
        <button className="rounded border px-2 py-1" onClick={closeAgentRunInspection}>Close run inspection</button>
      </div>}
    </header>
    <div className="relative min-h-0 min-w-0 flex-1" role="tabpanel" id={`canvas-dashboard-${tab}-panel`} aria-labelledby={`canvas-dashboard-${tab}-tab`}>
      <React.Suspense fallback={<p role="status">Loading dashboard…</p>}>
        {tab === 'mission' ? <Mission workspace={!!workspace} preview={preview || !workspace} onOpenWorkspace={onOpenWorkspace} /> : <GraphStatistics active />}
      </React.Suspense>
    </div>
  </section>
}
