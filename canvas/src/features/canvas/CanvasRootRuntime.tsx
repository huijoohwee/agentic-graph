import React from 'react'
import { useGraphStore } from '@/hooks/useGraphStore'

export function CanvasRootRuntime(props: {
  uiOverlayOpacity: number
  uiPanelOpacity: number
  uiToolbarOpacity: number
}) {
  const { uiOverlayOpacity, uiPanelOpacity, uiToolbarOpacity } = props
  const setLifecycleStage = useGraphStore(s => s.setLifecycleStage)

  React.useEffect(() => {
    const root = document.documentElement
    root.style.setProperty('--overlay-opacity', String(uiOverlayOpacity))
    root.style.setProperty('--panel-opacity', String(uiPanelOpacity))
    root.style.setProperty('--toolbar-opacity', String(uiToolbarOpacity))
    root.style.setProperty('--panel-bg', `rgba(var(--panel-bg-rgb), ${uiPanelOpacity})`)
    root.style.setProperty('--toolbar-bg', `rgba(var(--panel-bg-rgb), ${uiToolbarOpacity})`)
  }, [uiOverlayOpacity, uiPanelOpacity, uiToolbarOpacity])

  React.useEffect(() => {
    setLifecycleStage('hydrated')
  }, [setLifecycleStage])

  return null
}
