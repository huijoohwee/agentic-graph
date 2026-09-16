import React from 'react'
import MainPanelBody from '@/features/panels/ui/MainPanelBody'
import MainPanelDashboardHeader from '@/features/panels/ui/MainPanelDashboardHeader'
import TabHeader from '@/features/panels/ui/TabHeader'
import { UI_LABELS } from '@/lib/config'

const GraphStatsPanel = React.lazy(() => import('@/features/graph-stats/GraphStatsPanel'))
const MissionControl = React.lazy(() => import('@/features/agent-ready/AgenticOsMissionControl'))
const tabs = [{ key: 'agentic-os', label: 'Agentic OS' }, { key: 'graph', label: 'Graph statistics' }]

export default function DashboardView() {
  const [tab, setTab] = React.useState('agentic-os')
  return (
    <MainPanelBody header={<MainPanelDashboardHeader />} scrollable={false}>
      <section className="flex h-full min-h-0 flex-col overflow-hidden" aria-label={UI_LABELS.dashboard}>
        <TabHeader tabs={tabs} activeTab={tab} onTabChange={setTab} tabIdBase="dashboard-surface" />
        <div className="min-h-0 flex-1" role="tabpanel" id={`dashboard-surface-${tab}-panel`} aria-labelledby={`dashboard-surface-${tab}-tab`}>
          <React.Suspense fallback={<p role="status">Loading dashboard…</p>}>
            {tab === 'agentic-os' ? <MissionControl /> : <GraphStatsPanel />}
          </React.Suspense>
        </div>
      </section>
    </MainPanelBody>
  )
}
