import React from 'react'
import { useGraphStore } from '@/hooks/useGraphStore'
import { useSourceFilesBootstrapReady } from '@/features/source-files/sourceFilesBootstrapReadiness'
import { findComposedSourceFileByPath } from '@/features/source-files/composedSourceSelection'
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
  const sourceFiles = useGraphStore(state => state.sourceFiles)
  const source = findComposedSourceFileByPath({ sourceFiles, targetPath: documentName })
  const sourceReady = Boolean(source?.enabled && source.text === documentText && source.status === 'parsed')
  const canvasRenderMode = useGraphStore(state => state.canvasRenderMode)
  const canvas3dMode = useGraphStore(state => state.canvas3dMode)
  const active = isXrV2RunReadyDemoActive(documentName, documentText)
  const ownsReadinessRuntime = React.useRef(false)
  const launchSource = {
    documentName,
    documentText,
    sourceId: source?.id,
    sourceRevision: source?.parsedGraphRevision,
    sourceText: source?.text,
    sourceEnabled: source?.enabled,
    sourceStatus: source?.status,
  }
  const launchSourceRef = React.useRef(launchSource)

  React.useLayoutEffect(() => {
    const stopOwnedRuntime = () => {
      stopXrV2PostProcessFallbackRuntime()
      void stopXrV2ImmersiveSession()
      void cancelXrV2SpatialCapture()
      if (ownsReadinessRuntime.current) {
        ownsReadinessRuntime.current = false
        stopXrV2WorkspaceReadinessRuntime()
      }
    }
    const previousSource = launchSourceRef.current
    if (
      previousSource.documentName !== documentName
      || previousSource.documentText !== documentText
      || previousSource.sourceId !== source?.id
      || previousSource.sourceRevision !== source?.parsedGraphRevision
      || previousSource.sourceText !== source?.text
      || previousSource.sourceEnabled !== source?.enabled
      || previousSource.sourceStatus !== source?.status
    ) {
      launchSourceRef.current = launchSource
      if (ownsReadinessRuntime.current) {
        stopOwnedRuntime()
        return
      }
    }
    if (!active) {
      stopOwnedRuntime()
      return
    }
    // Explorer materialization owns frontmatter preset replay. Wait for that
    // exact source boundary before observing the shared XR surface.
    if (!sourceFilesBootstrapReady || !sourceReady) {
      stopOwnedRuntime()
      return
    }
    // The shared physics lifecycle owns surface, camera and controller state.
    // Source presets own initial panels; editing a mark must not reopen them.
    if (canvasRenderMode !== '3d' || canvas3dMode !== 'xr') {
      stopOwnedRuntime()
      return
    }
    startXrV2WorkspaceReadinessRuntime()
    startXrV2PostProcessFallbackRuntime()
    ownsReadinessRuntime.current = true
  }, [
    active,
    canvas3dMode,
    canvasRenderMode,
    documentName,
    documentText,
    source?.enabled,
    source?.id,
    source?.parsedGraphRevision,
    source?.status,
    source?.text,
    sourceFilesBootstrapReady,
    sourceReady,
  ])

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
