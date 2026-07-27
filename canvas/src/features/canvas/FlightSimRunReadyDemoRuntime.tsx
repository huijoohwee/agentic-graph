import React from 'react'
import {
  exitFlightSimSurface,
  startFlightSim,
} from '@/features/game-flight-sim/flightSimRuntime'
import {
  captureFlightSimPreviousCanvasSurface,
  type FlightSimPreviousCanvasSurface,
} from '@/features/game-flight-sim/flightSimSurfaceOwnershipRuntime'
import { onGeospatialModeChanged } from '@/features/geospatial/events'
import { isFlightSimRunReadyDemoActive } from '@/features/workspace-fs/workspaceRunReadyDemos'
import { useGraphStore } from '@/hooks/useGraphStore'
import { readGeospatialOverlayEnabledPreference } from '@/lib/geospatial/geospatialModePreference'

const subscribeGeospatialMode = (listener: () => void): (() => void) => (
  onGeospatialModeChanged(() => listener())
)

export function FlightSimRunReadyDemoRuntime() {
  const markdownDocumentName = useGraphStore(state => state.markdownDocumentName)
  const markdownDocumentText = useGraphStore(state => state.markdownDocumentText)
  const canvasRenderMode = useGraphStore(state => state.canvasRenderMode)
  const canvas3dMode = useGraphStore(state => state.canvas3dMode)
  const canvasRenderModeLastFree = useGraphStore(state => state.canvasRenderModeLastFree)
  const canvasRenderModeIsAuto = useGraphStore(state => state.canvasRenderModeIsAuto)
  const floatingPanelOpen = useGraphStore(state => state.floatingPanelOpen)
  const floatingPanelView = useGraphStore(state => state.floatingPanelView)
  const geospatialModeEnabled = React.useSyncExternalStore(
    subscribeGeospatialMode,
    readGeospatialOverlayEnabledPreference,
    readGeospatialOverlayEnabledPreference,
  )
  const active = isFlightSimRunReadyDemoActive(markdownDocumentName, markdownDocumentText)
  const ownsDocumentLaunchRef = React.useRef(false)
  const launchGenerationRef = React.useRef(0)
  const previousCanvasSurfaceRef = React.useRef<FlightSimPreviousCanvasSurface>(
    captureFlightSimPreviousCanvasSurface(),
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
        geospatialModeEnabled,
      })
      if (ownsDocumentLaunchRef.current) {
        ownsDocumentLaunchRef.current = false
        exitFlightSimSurface({ restorePreviousSurface: false })
      }
      return
    }
    if (ownsDocumentLaunchRef.current) return
    ownsDocumentLaunchRef.current = true
    void startFlightSim({
      openPanel: true,
      previousCanvasSurface: previousCanvasSurfaceRef.current,
    })
      .then(result => {
        if (launchGenerationRef.current !== generation) return
        if (result.active && !result.runtimeError) return
        ownsDocumentLaunchRef.current = false
        useGraphStore.getState().pushUiToast({
          id: 'flight-sim:run-ready-launch:error',
          kind: 'error',
          message: result.runtimeError || 'Flight Sim launch failed.',
        })
      })
      .catch(error => {
        if (launchGenerationRef.current !== generation) return
        ownsDocumentLaunchRef.current = false
        const message = error instanceof Error ? error.message : String(error || 'Flight Sim launch failed')
        useGraphStore.getState().pushUiToast({
          id: 'flight-sim:run-ready-launch:error',
          kind: 'error',
          message,
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
    geospatialModeEnabled,
  ])

  React.useLayoutEffect(() => () => {
    const teardownGeneration = launchGenerationRef.current + 1
    launchGenerationRef.current = teardownGeneration
    queueMicrotask(() => {
      if (launchGenerationRef.current !== teardownGeneration) return
      if (!ownsDocumentLaunchRef.current || isFlightSimRunReadyDemoActive()) return
      ownsDocumentLaunchRef.current = false
      exitFlightSimSurface({ restorePreviousSurface: false })
    })
  }, [])
  return null
}
