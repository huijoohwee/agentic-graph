import React from 'react'
import {
  exitCitySimSurface,
  openCitySimSurface,
} from '@/features/game-city-sim/citySimRuntime'
import {
  captureCitySimPreviousCanvasSurface,
  type CitySimPreviousCanvasSurface,
} from '@/features/game-city-sim/citySimSurfaceOwnership'
import { isCitySimRunReadyDemoActive } from '@/features/workspace-fs/workspaceRunReadyDemos'
import { useGraphStore } from '@/hooks/useGraphStore'

export function CitySimRunReadyDemoRuntime() {
  const markdownDocumentName = useGraphStore(state => state.markdownDocumentName)
  const markdownDocumentText = useGraphStore(state => state.markdownDocumentText)
  const canvasRenderMode = useGraphStore(state => state.canvasRenderMode)
  const canvas3dMode = useGraphStore(state => state.canvas3dMode)
  const canvasRenderModeLastFree = useGraphStore(state => state.canvasRenderModeLastFree)
  const canvasRenderModeIsAuto = useGraphStore(state => state.canvasRenderModeIsAuto)
  const floatingPanelOpen = useGraphStore(state => state.floatingPanelOpen)
  const floatingPanelView = useGraphStore(state => state.floatingPanelView)
  const active = isCitySimRunReadyDemoActive(markdownDocumentName, markdownDocumentText)
  const ownsDocumentLaunchRef = React.useRef(false)
  const launchGenerationRef = React.useRef(0)
  const previousCanvasSurfaceRef = React.useRef<CitySimPreviousCanvasSurface>(
    captureCitySimPreviousCanvasSurface(),
  )

  React.useLayoutEffect(() => {
    const generation = launchGenerationRef.current + 1
    launchGenerationRef.current = generation
    if (!active) {
      previousCanvasSurfaceRef.current = Object.freeze({
        canvasRenderMode,
        canvas3dMode,
        canvasRenderModeLastFree,
        canvasRenderModeIsAuto,
        floatingPanelOpen,
        floatingPanelView,
      })
      if (ownsDocumentLaunchRef.current) {
        ownsDocumentLaunchRef.current = false
        exitCitySimSurface({ restorePreviousSurface: false })
      }
      return
    }
    if (ownsDocumentLaunchRef.current) return
    ownsDocumentLaunchRef.current = true
    void openCitySimSurface({
      previousCanvasSurface: previousCanvasSurfaceRef.current,
    })
      .then(result => {
        if (launchGenerationRef.current !== generation) return
        if (result.active && result.lastResult?.ok !== false) return
        ownsDocumentLaunchRef.current = false
        useGraphStore.getState().pushUiToast({
          id: 'city-sim:run-ready-launch:error',
          kind: 'error',
          message: result.message,
        })
      })
      .catch(error => {
        if (launchGenerationRef.current !== generation) return
        ownsDocumentLaunchRef.current = false
        useGraphStore.getState().pushUiToast({
          id: 'city-sim:run-ready-launch:error',
          kind: 'error',
          message: error instanceof Error ? error.message : String(error || 'City Simulation launch failed'),
        })
      })
  }, [
    active,
    canvas3dMode,
    canvasRenderMode,
    canvasRenderModeIsAuto,
    canvasRenderModeLastFree,
    floatingPanelOpen,
    floatingPanelView,
  ])

  React.useLayoutEffect(() => () => {
    const teardownGeneration = launchGenerationRef.current + 1
    launchGenerationRef.current = teardownGeneration
    queueMicrotask(() => {
      if (launchGenerationRef.current !== teardownGeneration) return
      if (!ownsDocumentLaunchRef.current || isCitySimRunReadyDemoActive()) return
      ownsDocumentLaunchRef.current = false
      exitCitySimSurface({ restorePreviousSurface: false })
    })
  }, [])

  return null
}
