import React from 'react'
import {
  exitFlightSimSurface,
  startFlightSim,
} from '@/features/game-flight-sim/flightSimRuntime'
import {
  hydrateFlightSimSharedXrSceneSource,
} from '@/features/game-flight-sim/flightSimSharedXrSceneSource'
import {
  isFlightSimStagePresentationRetryableFailure,
} from '@/features/game-flight-sim/flightSimStagePreparationRuntime'
import {
  captureFlightSimPreviousCanvasSurface,
  type FlightSimPreviousCanvasSurface,
} from '@/features/game-flight-sim/flightSimSurfaceOwnershipRuntime'
import { onGeospatialModeChanged } from '@/features/geospatial/events'
import { useSourceFilesBootstrapReady } from '@/features/source-files/sourceFilesBootstrapReadiness'
import { findComposedSourceFileByPath } from '@/features/source-files/composedSourceSelection'
import { isFlightSimRunReadyDemoActive } from '@/features/workspace-fs/workspaceRunReadyDemos'
import { useGraphStore } from '@/hooks/useGraphStore'
import { readGeospatialOverlayEnabledPreference } from '@/lib/geospatial/geospatialModePreference'
import { parseMarkdownFrontmatter, splitMarkdownLines } from '@/lib/markdown'

const subscribeGeospatialMode = (listener: () => void): (() => void) => (
  onGeospatialModeChanged(() => listener())
)

const FLIGHT_SIM_DOCUMENT_LAUNCH_ATTEMPT_LIMIT = 2

export type FlightSimRunReadyDemoDiagnostic = Readonly<{
  active: boolean
  bootstrapReady: boolean
  launchAttempt: number
  launchOwned: boolean
  sourceError: string | null
  sourceName: string | null
  sourceReady: boolean
  sourceStatus: string | null
}>

let lastFlightSimRunReadyDemoDiagnostic: FlightSimRunReadyDemoDiagnostic | null = null

export function readFlightSimRunReadyDemoDiagnostic(): FlightSimRunReadyDemoDiagnostic | null {
  return lastFlightSimRunReadyDemoDiagnostic
}

export function FlightSimRunReadyDemoRuntime() {
  const sourceFilesBootstrapReady = useSourceFilesBootstrapReady()
  const markdownDocumentName = useGraphStore(state => state.markdownDocumentName)
  const markdownDocumentText = useGraphStore(state => state.markdownDocumentText)
  const sourceFiles = useGraphStore(state => state.sourceFiles)
  const source = findComposedSourceFileByPath({ sourceFiles, targetPath: markdownDocumentName })
  const sourceReady = Boolean(source?.enabled && source.text === markdownDocumentText && source.status === 'parsed')
  const sourceError = source?.status === 'error'
    ? source.error || 'Flight Sim active SourceFile parsing failed.'
    : !source || !source.enabled || source.text !== markdownDocumentText
      ? 'Flight Sim requires the exact enabled active SourceFile text.'
      : null
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
  const active = React.useMemo(() => {
    if (!isFlightSimRunReadyDemoActive(markdownDocumentName, markdownDocumentText)) return false
    const parsed = parseMarkdownFrontmatter(splitMarkdownLines(String(markdownDocumentText || '')))
    // Authored Recorded intent fences practice before asynchronous evidence loading.
    return parsed.warnings.length === 0 && !Object.prototype.hasOwnProperty.call(parsed.meta, 'source_geospatial')
  }, [markdownDocumentName, markdownDocumentText])
  const [launchAttempt, setLaunchAttempt] = React.useState(0)
  const ownsDocumentLaunchRef = React.useRef(false)
  const panelLaunchSourceRef = React.useRef<readonly [string | null, string | undefined] | null>(null)
  const launchGenerationRef = React.useRef(0)
  const launchSource = { markdownDocumentName, markdownDocumentText, sourceId: source?.id, sourceRevision: source?.parsedGraphRevision, sourceText: source?.text, sourceEnabled: source?.enabled, sourceStatus: source?.status }
  const launchSourceRef = React.useRef(launchSource)
  const previousCanvasSurfaceRef = React.useRef<FlightSimPreviousCanvasSurface>(
    captureFlightSimPreviousCanvasSurface(),
  )

  React.useLayoutEffect(() => {
    if (import.meta.env?.VITE_AGENTIC_OS_FLIGHT_SIM_BROWSER_PROOF === '1') {
      lastFlightSimRunReadyDemoDiagnostic = Object.freeze({
        active,
        bootstrapReady: sourceFilesBootstrapReady,
        launchAttempt,
        launchOwned: ownsDocumentLaunchRef.current,
        sourceError,
        sourceName: source?.name || null,
        sourceReady,
        sourceStatus: source?.status || null,
      })
    }
  }, [active, launchAttempt, source?.name, source?.status, sourceError, sourceFilesBootstrapReady, sourceReady])

  React.useLayoutEffect(() => {
    const previousSource = launchSourceRef.current
    if (previousSource.markdownDocumentName !== markdownDocumentName
      || previousSource.markdownDocumentText !== markdownDocumentText
      || previousSource.sourceId !== source?.id
      || previousSource.sourceRevision !== source?.parsedGraphRevision
      || previousSource.sourceText !== source?.text
      || previousSource.sourceEnabled !== source?.enabled
      || previousSource.sourceStatus !== source?.status) {
      launchSourceRef.current = launchSource
      launchGenerationRef.current += 1
      if (ownsDocumentLaunchRef.current) {
        ownsDocumentLaunchRef.current = false
        exitFlightSimSurface({ restorePreviousSurface: false })
      }
      if (launchAttempt !== 0) {
        setLaunchAttempt(0)
        return
      }
    }
    if (!active) {
      panelLaunchSourceRef.current = null
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
      ownsDocumentLaunchRef.current
      || launchAttempt >= FLIGHT_SIM_DOCUMENT_LAUNCH_ATTEMPT_LIMIT
    ) return
    if (sourceError && (source?.status === 'error' || sourceFilesBootstrapReady)) {
      setLaunchAttempt(FLIGHT_SIM_DOCUMENT_LAUNCH_ATTEMPT_LIMIT)
      useGraphStore.getState().pushUiToast({ id: 'flight-sim:run-ready-launch:error', kind: 'error', message: sourceError })
      return
    }
    // The document may publish before its native parser lifecycle finishes.
    // Only a matching idle/loading record waits; malformed sources fail above.
    if (!sourceFilesBootstrapReady || !sourceReady) return
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
    void hydrateFlightSimSharedXrSceneSource()
      .then(hydrated => {
        const current = useGraphStore.getState()
        const currentSource = findComposedSourceFileByPath({ sourceFiles: current.sourceFiles, targetPath: current.markdownDocumentName })
        if (
          launchGenerationRef.current !== generation
          || !isFlightSimRunReadyDemoActive(current.markdownDocumentName, current.markdownDocumentText)
        ) return null
        if (
          current.markdownDocumentName !== markdownDocumentName
          || current.markdownDocumentText !== markdownDocumentText
          || !currentSource?.enabled || currentSource.status !== 'parsed'
          || currentSource.text !== markdownDocumentText
          || currentSource.id !== source?.id
          || currentSource.parsedGraphRevision !== source?.parsedGraphRevision
        ) {
          ownsDocumentLaunchRef.current = false
          setLaunchAttempt(0)
          return null
        }
        if (!hydrated) {
          settleFailedLaunch(
            'Flight Sim shared XR source changed before launch.',
            true,
          )
          return null
        }
        // Source refreshes re-admit Flight while retaining the latest panel intent.
        const openPanel = panelLaunchSourceRef.current?.[0] !== markdownDocumentName
          || panelLaunchSourceRef.current?.[1] !== source?.id
        panelLaunchSourceRef.current = [markdownDocumentName, source?.id]
        return startFlightSim({
          geospatialComposite: true,
          openPanel,
          previousCanvasSurface: previousCanvasSurfaceRef.current,
        })
      })
      .then(result => {
        if (!result) return
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
    markdownDocumentName,
    markdownDocumentText,
    source,
    sourceError,
    sourceReady,
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
