import React from 'react'
import { executeCanvasViewControl } from '@/lib/canvas/canvasViewControlRuntime'
import { useGraphStore } from '@/hooks/useGraphStore'

/** Settings is an entry to the existing Canvas Dashboard, not a second renderer. */
export default function DashboardView({ onOpenWorkspace }: { onOpenWorkspace?: () => void }) {
  const [error, setError] = React.useState('')
  React.useEffect(() => {
    try {
      executeCanvasViewControl({ optionId: 'renderer:dashboard' })
      useGraphStore.getState().setWorkspaceViewState({ mode: 'canvas' })
      onOpenWorkspace?.()
    } catch (cause) {
      setError(`Dashboard unavailable: ${cause instanceof Error ? cause.message : String(cause)}`)
    }
  }, [onOpenWorkspace])
  return <p role={error ? 'alert' : 'status'}>{error || 'Opening Dashboard…'}</p>
}
