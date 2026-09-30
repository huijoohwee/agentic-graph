import React from 'react'
import { executeCanvasViewControl } from '@/lib/canvas/canvasViewControlRuntime'
import { useGraphStore } from '@/hooks/useGraphStore'

/** Settings is an entry to the existing Canvas Dashboard, not a second renderer. */
export default function DashboardView({ onOpenWorkspace }: { onOpenWorkspace?: () => void }) {
  React.useEffect(() => {
    executeCanvasViewControl({ optionId: 'renderer:dashboard' })
    useGraphStore.getState().setWorkspaceViewState({ mode: 'canvas' })
    onOpenWorkspace?.()
  }, [onOpenWorkspace])
  return <p role="status">Opening Dashboard…</p>
}
