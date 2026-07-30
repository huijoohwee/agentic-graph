import React from 'react'
import {
  readMediaCatalogMode,
  subscribeMediaCatalogMode,
} from '@/features/command-menu/mediaCatalogModeRuntime'
import { useGraphStore } from '@/hooks/useGraphStore'
import {
  readMotionControlSnapshot,
  subscribeMotionControl,
} from './motionControlRuntime'
import {
  readMotionCaptureSessionSnapshot,
  subscribeMotionCaptureSession,
} from './motionCaptureSessionRuntime'
import {
  readMotionCapturePeerSharingSnapshot,
  subscribeMotionCapturePeerSharing,
} from './motionCapturePeerRuntime'
import { stopMotionCaptureOutsideXrSurface } from './motionCaptureXrLifecycleRuntime'
import { motionControlCaptureSurfaceIsOpen } from './motionControlSurfaceRuntime'

let mountedLifecycleOwnerCount = 0

export function MotionControlXrLifecycleGuard() {
  const mediaCatalogMode = React.useSyncExternalStore(
    subscribeMediaCatalogMode,
    readMediaCatalogMode,
    readMediaCatalogMode,
  )
  const captureSurfaceOpen = useGraphStore(state => motionControlCaptureSurfaceIsOpen({
    canvas3dMode: state.canvas3dMode,
    canvasRenderMode: state.canvasRenderMode,
    floatingPanelOpen: state.floatingPanelOpen,
    floatingPanelView: state.floatingPanelView,
    mediaCatalogMode,
  }))
  const runtime = React.useSyncExternalStore(
    subscribeMotionControl,
    readMotionControlSnapshot,
    readMotionControlSnapshot,
  )
  const recordingStatus = React.useSyncExternalStore(
    subscribeMotionCaptureSession,
    () => readMotionCaptureSessionSnapshot().recording.status,
    () => readMotionCaptureSessionSnapshot().recording.status,
  )
  const registeredSourceCount = React.useSyncExternalStore(
    subscribeMotionCaptureSession,
    () => readMotionCaptureSessionSnapshot().sources.length,
    () => readMotionCaptureSessionSnapshot().sources.length,
  )
  const peerSharing = React.useSyncExternalStore(
    subscribeMotionCapturePeerSharing,
    readMotionCapturePeerSharingSnapshot,
    readMotionCapturePeerSharingSnapshot,
  )
  const captureActive = runtime.cameraActive
    || runtime.phase === 'requesting-camera'
    || runtime.phase === 'loading-model'
    || runtime.phase === 'running'
  const lifecycleActive = captureActive
    || recordingStatus === 'recording'
    || registeredSourceCount > 0
    || peerSharing.enabled

  React.useEffect(() => {
    mountedLifecycleOwnerCount += 1
    return () => {
      mountedLifecycleOwnerCount = Math.max(0, mountedLifecycleOwnerCount - 1)
      queueMicrotask(() => {
        if (mountedLifecycleOwnerCount > 0) return
        void stopMotionCaptureOutsideXrSurface('Motion Control stopped when its lifecycle owner unmounted.')
      })
    }
  }, [])

  React.useEffect(() => {
    if (captureSurfaceOpen || !lifecycleActive) return
    void stopMotionCaptureOutsideXrSurface('Motion Control stopped when its XR FloatingPanel surface closed.')
  }, [captureSurfaceOpen, lifecycleActive])

  return null
}
