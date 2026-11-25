import React from 'react'
import { useGraphStore } from '@/hooks/useGraphStore'
import { useSourceFilesBootstrapReady } from '@/features/source-files/sourceFilesBootstrapReadiness'
import { findComposedSourceFileByPath } from '@/features/source-files/composedSourceSelection'
import {
  isXrPhysicsRuntimeRunReadyDemoActive,
  isXrPhysicsRunReadyDemoActive,
} from '@/features/workspace-fs/workspaceRunReadyDemos'
import {
  developAndRunXrNativeControllerDemo,
  exitXrNativeControllerDemo,
  pauseXrNativeControllerDemo,
  readXrNativeControllerDemo,
  resumeXrNativeControllerDemo,
  selectXrNativeControllerDemoMode,
  subscribeXrNativeControllerDemo,
} from '@/features/three/xrNativeControllerDemoRuntime'
import { stopXrPhysicsRuntime } from '@/features/three/xrPhysicsRuntime'
import { ensureXrPhysicsRunReadyDemoRunning } from './xrPhysicsRunReadyLifecycle'
import { activateXrSceneSurface } from '@/features/three/xrSceneSurfaceRuntime'
import { useCanvasGameplayOverlayState } from './useCanvasGameplayOverlayState'
import { applyXrRunReadyDefaultCameraSource } from './xrRunReadyCameraDefaults'
import { onGeospatialModeChanged } from '@/features/geospatial/events'
import { readGeospatialOverlayEnabledPreference } from '@/lib/geospatial/geospatialModePreference'

const subscribeGeospatialMode = (listener: () => void): (() => void) => (
  onGeospatialModeChanged(() => listener())
)

export function XrPhysicsRunReadyDemoRuntime() {
  const sourceFilesBootstrapReady = useSourceFilesBootstrapReady()
  const markdownDocumentName = useGraphStore(state => state.markdownDocumentName)
  const markdownDocumentText = useGraphStore(state => state.markdownDocumentText)
  const sourceFiles = useGraphStore(state => state.sourceFiles)
  const canvasRenderMode = useGraphStore(state => state.canvasRenderMode)
  const canvas3dMode = useGraphStore(state => state.canvas3dMode)
  const schemaLayoutMode = useGraphStore(state => state.schema?.layout?.mode)
  const geospatialModeEnabled = React.useSyncExternalStore(
    subscribeGeospatialMode,
    readGeospatialOverlayEnabledPreference,
    readGeospatialOverlayEnabledPreference,
  )
  const source = findComposedSourceFileByPath({ sourceFiles, targetPath: markdownDocumentName })
  const sourceReady = Boolean(source?.enabled && source.text === markdownDocumentText && source.status === 'parsed')
  const active = isXrPhysicsRuntimeRunReadyDemoActive(
    markdownDocumentName,
    markdownDocumentText,
  )
  const dedicatedDemo = isXrPhysicsRunReadyDemoActive()
  const ownsDocumentLaunchRef = React.useRef(false)
  const surfaceInitializedRef = React.useRef(false)
  const pausedForGameplayRef = React.useRef(false)
  const unmountTeardownTokenRef = React.useRef(0)
  const cameraDefaultsAppliedRef = React.useRef(false)
  const launchSource = {
    markdownDocumentName,
    markdownDocumentText,
    sourceId: source?.id,
    sourceRevision: source?.parsedGraphRevision,
    sourceText: source?.text,
    sourceEnabled: source?.enabled,
    sourceStatus: source?.status,
  }
  const launchSourceRef = React.useRef(launchSource)
  const runtime = React.useSyncExternalStore(
    subscribeXrNativeControllerDemo,
    readXrNativeControllerDemo,
    readXrNativeControllerDemo,
  )
  const { citySimActive, flightSimActive, gameFpsActive } = useCanvasGameplayOverlayState()
  const gameplayOverlayActive = citySimActive || flightSimActive || gameFpsActive
  const phase = runtime.phase
  const revision = runtime.revision
  React.useLayoutEffect(() => {
    unmountTeardownTokenRef.current += 1
    return () => {
      const teardownToken = unmountTeardownTokenRef.current + 1
      unmountTeardownTokenRef.current = teardownToken
      queueMicrotask(() => {
        if (unmountTeardownTokenRef.current !== teardownToken) return
        if (!ownsDocumentLaunchRef.current) return
        ownsDocumentLaunchRef.current = false
        if (isXrPhysicsRunReadyDemoActive()) return
        if (readXrNativeControllerDemo().phase !== 'off') exitXrNativeControllerDemo()
      })
    }
  }, [])
  React.useLayoutEffect(() => {
    const previousSource = launchSourceRef.current
    if (
      previousSource.markdownDocumentName !== markdownDocumentName
      || previousSource.markdownDocumentText !== markdownDocumentText
      || previousSource.sourceId !== source?.id
      || previousSource.sourceRevision !== source?.parsedGraphRevision
      || previousSource.sourceText !== source?.text
      || previousSource.sourceEnabled !== source?.enabled
      || previousSource.sourceStatus !== source?.status
    ) {
      launchSourceRef.current = launchSource
      surfaceInitializedRef.current = false
      pausedForGameplayRef.current = false
      cameraDefaultsAppliedRef.current = false
      if (ownsDocumentLaunchRef.current && !dedicatedDemo) {
        ownsDocumentLaunchRef.current = false
        if (readXrNativeControllerDemo().phase !== 'off') exitXrNativeControllerDemo()
        return undefined
      }
    }
    if (!active) {
      surfaceInitializedRef.current = false
      pausedForGameplayRef.current = false
      cameraDefaultsAppliedRef.current = false
      if (ownsDocumentLaunchRef.current) {
        ownsDocumentLaunchRef.current = false
        if (readXrNativeControllerDemo().phase !== 'off') exitXrNativeControllerDemo()
      }
      return undefined
    }
    if (!sourceFilesBootstrapReady) {
      surfaceInitializedRef.current = false
      pausedForGameplayRef.current = false
      cameraDefaultsAppliedRef.current = false
      if (ownsDocumentLaunchRef.current && !dedicatedDemo) {
        ownsDocumentLaunchRef.current = false
        if (readXrNativeControllerDemo().phase !== 'off') exitXrNativeControllerDemo()
      }
      return undefined
    }
    if (!dedicatedDemo && !sourceReady) {
      surfaceInitializedRef.current = false
      pausedForGameplayRef.current = false
      cameraDefaultsAppliedRef.current = false
      if (ownsDocumentLaunchRef.current) {
        ownsDocumentLaunchRef.current = false
        if (readXrNativeControllerDemo().phase !== 'off') exitXrNativeControllerDemo()
      }
      return undefined
    }
    if (gameplayOverlayActive) {
      if (readXrNativeControllerDemo().phase === 'running') {
        pausedForGameplayRef.current = true
        pauseXrNativeControllerDemo()
      }
      return undefined
    }
    if (pausedForGameplayRef.current) {
      pausedForGameplayRef.current = false
      resumeXrNativeControllerDemo()
      return undefined
    }
    if (!surfaceInitializedRef.current) {
      const activatesXrSurface = canvasRenderMode !== '3d' || canvas3dMode !== 'xr'
      if (
        activatesXrSurface
        && !activateXrSceneSurface({ preserveGameplay: !dedicatedDemo })
      ) return undefined
      surfaceInitializedRef.current = true
    }
    if (
      !cameraDefaultsAppliedRef.current
      && isXrPhysicsRunReadyDemoActive(markdownDocumentName, markdownDocumentText)
    ) {
      cameraDefaultsAppliedRef.current = true
      applyXrRunReadyDefaultCameraSource()
    }
    const launched = ensureXrPhysicsRunReadyDemoRunning(readXrNativeControllerDemo(), {
      selectMode: selectXrNativeControllerDemoMode,
      developAndRun: () => {
        stopXrPhysicsRuntime()
        return developAndRunXrNativeControllerDemo()
      },
    })
    if (launched && !dedicatedDemo) ownsDocumentLaunchRef.current = true
    return undefined
  }, [
    active,
    canvas3dMode,
    canvasRenderMode,
    dedicatedDemo,
    gameplayOverlayActive,
    geospatialModeEnabled,
    markdownDocumentName,
    markdownDocumentText,
    phase,
    revision,
    source?.enabled,
    source?.id,
    source?.parsedGraphRevision,
    source?.status,
    source?.text,
    sourceFilesBootstrapReady,
    schemaLayoutMode,
    sourceReady,
  ])
  return null
}
