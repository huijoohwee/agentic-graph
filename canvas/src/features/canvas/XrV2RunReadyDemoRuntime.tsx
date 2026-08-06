import React from 'react'
import { useGraphStore } from '@/hooks/useGraphStore'
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
import { ensureXrPhysicsRunReadyDemoRunning } from './xrPhysicsRunReadyLifecycle'

/**
 * Activates the canonical XR scene for the source-authored xr-v2 seed. This
 * runtime never requests camera, sensor, or immersive-session permission.
 */
export function XrV2RunReadyDemoRuntime() {
  const documentName = useGraphStore(state => state.markdownDocumentName)
  const documentText = useGraphStore(state => state.markdownDocumentText)
  const canvasRenderMode = useGraphStore(state => state.canvasRenderMode)
  const canvas3dMode = useGraphStore(state => state.canvas3dMode)
  const active = isXrV2RunReadyDemoActive(documentName, documentText)
  const ownsRuntime = React.useRef(false)
  const ownsReadinessRuntime = React.useRef(false)

  React.useLayoutEffect(() => {
    if (!active) {
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
    const store = useGraphStore.getState()
    if (store.canvasRenderMode !== '3d' || store.canvas3dMode !== 'xr') {
      if (!activateXrSceneSurface({ preserveGameplay: false })) return
    }
    store.setFloatingPanelOpen(true)
    store.setFloatingPanelView('motionControl')
    store.setBottomSurfaceCollapsed(true)
    startXrV2WorkspaceReadinessRuntime()
    ownsReadinessRuntime.current = true
    ownsRuntime.current = ensureXrPhysicsRunReadyDemoRunning(readXrNativeControllerDemo(), {
      selectMode: selectXrNativeControllerDemoMode,
      developAndRun: () => {
        stopXrPhysicsRuntime()
        return developAndRunXrNativeControllerDemo()
      },
    }) || ownsRuntime.current
  }, [active, canvas3dMode, canvasRenderMode, documentName, documentText])

  React.useLayoutEffect(() => () => {
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
