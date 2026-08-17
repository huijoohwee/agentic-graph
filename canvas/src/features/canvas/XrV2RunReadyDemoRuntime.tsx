import React from 'react'
import { useGraphStore } from '@/hooks/useGraphStore'
import { useSourceFilesBootstrapReady } from '@/features/source-files/sourceFilesBootstrapReadiness'
import { isXrV2RunReadyDemoActive } from '@/features/workspace-fs/workspaceRunReadyDemos'
import {
  developAndRunXrNativeControllerDemo,
  exitXrNativeControllerDemo,
  readXrNativeControllerDemo,
  selectXrNativeControllerDemoMode,
} from '@/features/three/xrNativeControllerDemoRuntime'
import { stopXrPhysicsRuntime } from '@/features/three/xrPhysicsRuntime'
import { activateXrSceneSurface } from '@/features/three/xrSceneSurfaceRuntime'
import {
  startXrV2WorkspaceReadinessRuntime,
  stopXrV2WorkspaceReadinessRuntime,
} from '@/features/xr-v2/xrV2WorkspaceReadinessRuntime'
import { cancelXrV2SpatialCapture } from '@/features/xr-v2/xrV2SpatialCaptureRuntime'
import { stopXrV2ImmersiveSession } from '@/features/xr-v2/xrV2ImmersiveSessionRuntime'
import {
  startXrV2PostProcessFallbackRuntime,
  stopXrV2PostProcessFallbackRuntime,
} from '@/features/xr-v2/xrV2PostProcessFallbackLifecycle'
import { ensureXrPhysicsRunReadyDemoRunning } from './xrPhysicsRunReadyLifecycle'
import { applyXrRunReadyDefaultCameraFraming } from './xrRunReadyCameraDefaults'

/**
 * Activates the canonical XR scene for the source-authored xr-v2 seed. This
 * runtime never requests camera, sensor, or immersive-session permission.
 */
export function XrV2RunReadyDemoRuntime() {
  const sourceFilesBootstrapReady = useSourceFilesBootstrapReady()
  const documentName = useGraphStore(state => state.markdownDocumentName)
  const documentText = useGraphStore(state => state.markdownDocumentText)
  const canvasRenderMode = useGraphStore(state => state.canvasRenderMode)
  const canvas3dMode = useGraphStore(state => state.canvas3dMode)
  const active = isXrV2RunReadyDemoActive(documentName, documentText)
  const ownsRuntime = React.useRef(false)
  const ownsReadinessRuntime = React.useRef(false)
  const genericSessionQuiesced = React.useRef(false)
  const cameraDefaultsApplied = React.useRef(false)

  React.useLayoutEffect(() => {
    if (!active) {
      genericSessionQuiesced.current = false
      cameraDefaultsApplied.current = false
      stopXrV2PostProcessFallbackRuntime()
      void stopXrV2ImmersiveSession()
      void cancelXrV2SpatialCapture()
      if (ownsReadinessRuntime.current) {
        ownsReadinessRuntime.current = false
        stopXrV2WorkspaceReadinessRuntime()
      }
      if (ownsRuntime.current) {
        ownsRuntime.current = false
        if (readXrNativeControllerDemo().phase !== 'off') exitXrNativeControllerDemo()
      }
      return
    }
    // Explorer materialization owns frontmatter preset replay. Wait for that
    // exact source-authority boundary before taking the shared surface to XR.
    if (!sourceFilesBootstrapReady) return
    const store = useGraphStore.getState()
    if (!genericSessionQuiesced.current) {
      genericSessionQuiesced.current = true
      if (store.canvasRenderMode === '3d' && store.canvas3dMode === 'xr') {
        // Force one synchronous inactive render so the generic XR entry owner
        // releases an existing/pending session before XR v2 takes ownership.
        store.setCanvas3dMode('3d')
        return
      }
    }
    if (store.canvasRenderMode !== '3d' || store.canvas3dMode !== 'xr') {
      activateXrSceneSurface({ preserveGameplay: false })
      // Let the shared Canvas finish its mode transition before readiness
      // subscribes to mounted evidence from that exact surface.
      return
    }
    if (!cameraDefaultsApplied.current) {
      cameraDefaultsApplied.current = true
      applyXrRunReadyDefaultCameraFraming()
    }
    store.setFloatingPanelOpen(true)
    store.setFloatingPanelView('motionControl')
    store.setBottomSurfaceCollapsed(true)
    startXrV2WorkspaceReadinessRuntime()
    startXrV2PostProcessFallbackRuntime()
    ownsReadinessRuntime.current = true
    ownsRuntime.current = ensureXrPhysicsRunReadyDemoRunning(readXrNativeControllerDemo(), {
      selectMode: selectXrNativeControllerDemoMode,
      developAndRun: () => {
        stopXrPhysicsRuntime()
        return developAndRunXrNativeControllerDemo()
      },
    }) || ownsRuntime.current
  }, [active, canvas3dMode, canvasRenderMode, documentName, documentText, sourceFilesBootstrapReady])

  React.useEffect(() => {
    if (!active || typeof window === 'undefined' || typeof document === 'undefined') return undefined
    const stopForPageLifecycle = (event: Event) => {
      if (event.type === 'visibilitychange' && document.visibilityState === 'visible') return
      void stopXrV2ImmersiveSession()
    }
    window.addEventListener('pagehide', stopForPageLifecycle)
    document.addEventListener('visibilitychange', stopForPageLifecycle)
    return () => {
      window.removeEventListener('pagehide', stopForPageLifecycle)
      document.removeEventListener('visibilitychange', stopForPageLifecycle)
    }
  }, [active])

  React.useLayoutEffect(() => () => {
    stopXrV2PostProcessFallbackRuntime()
    void stopXrV2ImmersiveSession()
    void cancelXrV2SpatialCapture()
    if (ownsReadinessRuntime.current) {
      ownsReadinessRuntime.current = false
      stopXrV2WorkspaceReadinessRuntime()
    }
    if (!ownsRuntime.current) return
    ownsRuntime.current = false
    if (readXrNativeControllerDemo().phase !== 'off') exitXrNativeControllerDemo()
  }, [])

  return null
}
