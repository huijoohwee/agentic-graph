import React from 'react'
import { useGraphStore } from '@/hooks/useGraphStore'
import { useSourceFilesBootstrapReady } from '@/features/source-files/sourceFilesBootstrapReadiness'
import { isXrV2RunReadyDemoActive } from '@/features/workspace-fs/workspaceRunReadyDemos'
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

/**
 * Observes the canonical XR scene for the source-authored xr-v2 seed. This
 * runtime never requests camera, sensor, or immersive-session permission.
 */
export function XrV2RunReadyDemoRuntime() {
  const sourceFilesBootstrapReady = useSourceFilesBootstrapReady()
  const documentName = useGraphStore(state => state.markdownDocumentName)
  const documentText = useGraphStore(state => state.markdownDocumentText)
  const canvasRenderMode = useGraphStore(state => state.canvasRenderMode)
  const canvas3dMode = useGraphStore(state => state.canvas3dMode)
  const active = isXrV2RunReadyDemoActive(documentName, documentText)
  const ownsReadinessRuntime = React.useRef(false)

  React.useLayoutEffect(() => {
    if (!active) {
      stopXrV2PostProcessFallbackRuntime()
      void stopXrV2ImmersiveSession()
      void cancelXrV2SpatialCapture()
      if (ownsReadinessRuntime.current) {
        ownsReadinessRuntime.current = false
        stopXrV2WorkspaceReadinessRuntime()
      }
      return
    }
    // Explorer materialization owns frontmatter preset replay. Wait for that
    // exact source boundary before observing the shared XR surface.
    if (!sourceFilesBootstrapReady) return
    // The shared physics lifecycle owns surface, camera and controller state.
    // Source presets own initial panels; editing a mark must not reopen them.
    if (canvasRenderMode !== '3d' || canvas3dMode !== 'xr') return
    startXrV2WorkspaceReadinessRuntime()
    startXrV2PostProcessFallbackRuntime()
    ownsReadinessRuntime.current = true
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
  }, [])

  return null
}
