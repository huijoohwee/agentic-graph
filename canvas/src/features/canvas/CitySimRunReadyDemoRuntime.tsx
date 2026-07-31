import React from 'react'
import {
  exitCitySimSurface,
  openCitySimSurface,
} from '@/features/game-city-sim/citySimRuntime'
import {
  parseCitySimAuthoredSource,
  type CitySimAuthoredSource,
} from '@/features/game-city-sim/citySimAuthoredSource'
import {
  captureCitySimPreviousCanvasSurface,
  type CitySimPreviousCanvasSurface,
} from '@/features/game-city-sim/citySimSurfaceOwnership'
import { isCitySimRunReadyDemoActive } from '@/features/workspace-fs/workspaceRunReadyDemos'
import { useGraphStore } from '@/hooks/useGraphStore'
import { readGeospatialOverlayEnabledPreference } from '@/lib/geospatial/geospatialModePreference'

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
  const sourceResult = React.useMemo(
    () => active ? parseCitySimAuthoredSource(markdownDocumentText) : null,
    [active, markdownDocumentText],
  )
  const ownsDocumentLaunchRef = React.useRef(false)
  const launchedSourceRef = React.useRef<CitySimAuthoredSource | null>(null)
  const reportedSourceErrorRef = React.useRef<string | null>(null)
  const launchGenerationRef = React.useRef(0)
  const previousCanvasSurfaceRef = React.useRef<CitySimPreviousCanvasSurface>(
    captureCitySimPreviousCanvasSurface(),
  )

  React.useLayoutEffect(() => {
    const generation = launchGenerationRef.current + 1
    launchGenerationRef.current = generation
    if (!active) {
      launchedSourceRef.current = null
      reportedSourceErrorRef.current = null
      previousCanvasSurfaceRef.current = Object.freeze({
        canvasRenderMode,
        canvas3dMode,
        canvasRenderModeLastFree,
        canvasRenderModeIsAuto,
        floatingPanelOpen,
        floatingPanelView,
        geospatialModeEnabled: readGeospatialOverlayEnabledPreference(),
      })
      if (ownsDocumentLaunchRef.current) {
        ownsDocumentLaunchRef.current = false
        exitCitySimSurface({ restorePreviousSurface: false })
      }
      return
    }
    if (!sourceResult || sourceResult.ok === false) {
      const message = sourceResult && sourceResult.ok === false
        ? sourceResult.error.message
        : 'City source is unavailable.'
      if (ownsDocumentLaunchRef.current) {
        ownsDocumentLaunchRef.current = false
        launchedSourceRef.current = null
        exitCitySimSurface({ restorePreviousSurface: false })
      }
      if (reportedSourceErrorRef.current !== message) {
        reportedSourceErrorRef.current = message
        useGraphStore.getState().pushUiToast({
          id: 'city-sim:run-ready-source:error',
          kind: 'error',
          message: `City Simulation source is invalid: ${message}`,
        })
      }
      return
    }
    reportedSourceErrorRef.current = null
    if (
      ownsDocumentLaunchRef.current
      && launchedSourceRef.current === sourceResult.source
    ) return
    if (ownsDocumentLaunchRef.current) {
      ownsDocumentLaunchRef.current = false
      exitCitySimSurface({ restorePreviousSurface: false })
    }
    ownsDocumentLaunchRef.current = true
    launchedSourceRef.current = sourceResult.source
    void openCitySimSurface({
      authoredSource: sourceResult.source,
      previousCanvasSurface: previousCanvasSurfaceRef.current,
    })
      .then(result => {
        if (launchGenerationRef.current !== generation) return
        if (result.active && result.lastResult?.ok !== false) return
        ownsDocumentLaunchRef.current = false
        launchedSourceRef.current = null
        useGraphStore.getState().pushUiToast({
          id: 'city-sim:run-ready-launch:error',
          kind: 'error',
          message: result.message,
        })
      })
      .catch(error => {
        if (launchGenerationRef.current !== generation) return
        ownsDocumentLaunchRef.current = false
        launchedSourceRef.current = null
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
    sourceResult,
  ])

  React.useLayoutEffect(() => () => {
    const teardownGeneration = launchGenerationRef.current + 1
    launchGenerationRef.current = teardownGeneration
    queueMicrotask(() => {
      if (launchGenerationRef.current !== teardownGeneration) return
      if (!ownsDocumentLaunchRef.current || isCitySimRunReadyDemoActive()) return
      ownsDocumentLaunchRef.current = false
      launchedSourceRef.current = null
      exitCitySimSurface({ restorePreviousSurface: false })
    })
  }, [])

  return null
}
