import React from 'react'
import {
  exitFlightSimSurface,
  startFlightSim,
} from '@/features/game-flight-sim/flightSimRuntime'
import {
  isFlightSimStagePresentationRetryableFailure,
} from '@/features/game-flight-sim/flightSimStagePreparationRuntime'
import {
  captureFlightSimPreviousCanvasSurface,
  type FlightSimPreviousCanvasSurface,
} from '@/features/game-flight-sim/flightSimSurfaceOwnershipRuntime'
import { onGeospatialModeChanged } from '@/features/geospatial/events'
import { useSourceFilesBootstrapReady } from '@/features/source-files/sourceFilesBootstrapReadiness'
import { isFlightSimRunReadyDemoActive } from '@/features/workspace-fs/workspaceRunReadyDemos'
import { useGraphStore } from '@/hooks/useGraphStore'
import { readGeospatialOverlayEnabledPreference } from '@/lib/geospatial/geospatialModePreference'

const subscribeGeospatialMode = (listener: () => void): (() => void) => (
  onGeospatialModeChanged(() => listener())
)

const FLIGHT_SIM_DOCUMENT_LAUNCH_ATTEMPT_LIMIT = 2

export function FlightSimRunReadyDemoRuntime() {
  const sourceFilesBootstrapReady = useSourceFilesBootstrapReady()
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
  const [launchAttempt, setLaunchAttempt] = React.useState(0)
  const ownsDocumentLaunchRef = React.useRef(false)
  const launchGenerationRef = React.useRef(0)
  const previousCanvasSurfaceRef = React.useRef<FlightSimPreviousCanvasSurface>(
    captureFlightSimPreviousCanvasSurface(),
  )

  React.useLayoutEffect(() => {
    if (!active) {
      launchGenerationRef.current += 1
      if (launchAttempt !== 0) setLaunchAttempt(0)
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
    if (
      !sourceFilesBootstrapReady
      || ownsDocumentLaunchRef.current
      || launchAttempt >= FLIGHT_SIM_DOCUMENT_LAUNCH_ATTEMPT_LIMIT
    ) return
    const generation = launchGenerationRef.current + 1
    const currentAttempt = launchAttempt + 1
    launchGenerationRef.current = generation
    ownsDocumentLaunchRef.current = true
    const settleFailedLaunch = (
      message: string,
      retryable: boolean,
    ) => {
      if (launchGenerationRef.current !== generation) return
      ownsDocumentLaunchRef.current = false
      const canRetry = retryable
        && currentAttempt < FLIGHT_SIM_DOCUMENT_LAUNCH_ATTEMPT_LIMIT
      setLaunchAttempt(
        canRetry
          ? currentAttempt
          : FLIGHT_SIM_DOCUMENT_LAUNCH_ATTEMPT_LIMIT,
      )
      if (canRetry) return
      useGraphStore.getState().pushUiToast({
        id: 'flight-sim:run-ready-launch:error',
        kind: 'error',
        message,
      })
    }
    void startFlightSim({
      geospatialComposite: true,
      openPanel: true,
      previousCanvasSurface: previousCanvasSurfaceRef.current,
    })
      .then(result => {
        if (launchGenerationRef.current !== generation) return
        if (result.active && !result.runtimeError) return
        const message = result.runtimeError || 'Flight Sim launch failed.'
        settleFailedLaunch(
          message,
          isFlightSimStagePresentationRetryableFailure(message),
        )
      })
      .catch(error => {
        const message = error instanceof Error ? error.message : String(error || 'Flight Sim launch failed')
        settleFailedLaunch(message, false)
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
    launchAttempt,
    sourceFilesBootstrapReady,
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
