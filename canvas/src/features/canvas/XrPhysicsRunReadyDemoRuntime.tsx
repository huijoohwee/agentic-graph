import React from 'react'
import { useGraphStore } from '@/hooks/useGraphStore'
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

export function XrPhysicsRunReadyDemoRuntime() {
  const markdownDocumentName = useGraphStore(state => state.markdownDocumentName)
  const markdownDocumentText = useGraphStore(state => state.markdownDocumentText)
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
    const state = useGraphStore.getState()
    if (!surfaceInitializedRef.current) {
      const activatesXrSurface = state.canvasRenderMode !== '3d' || state.canvas3dMode !== 'xr'
      if (
        activatesXrSurface
        && !activateXrSceneSurface({ preserveGameplay: !dedicatedDemo })
      ) return undefined
      surfaceInitializedRef.current = true
      if (activatesXrSurface) {
        state.setFloatingPanelOpen(false)
        state.setBottomSurfaceCollapsed(true)
      }
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
  }, [active, dedicatedDemo, gameplayOverlayActive, markdownDocumentName, markdownDocumentText, phase, revision])
  return null
}
