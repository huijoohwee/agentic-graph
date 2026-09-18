import React from 'react'
import { activateAgentRunWorkspace } from '@/features/agent-ready/agentRunInspectionStore'

/** Settings is an entry to the existing Canvas Dashboard, not a second renderer. */
export default function DashboardView({ onOpenWorkspace }: { onOpenWorkspace?: () => void }) {
  React.useEffect(() => { activateAgentRunWorkspace('tree'); onOpenWorkspace?.() }, [onOpenWorkspace])
  return <p role="status">Opening Dashboard…</p>
}
