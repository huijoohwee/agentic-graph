import {
  motionCaptureSessionRuntime,
  readMotionCaptureSessionSnapshot,
} from './motionCaptureSessionRuntime'
import {
  readMotionCapturePeerSharingSnapshot,
  setMotionCapturePeerSharingEnabled,
} from './motionCapturePeerRuntime'
import {
  readMotionControlSnapshot,
  stopMotionControl,
} from './motionControlRuntime'
import { releaseMotionControlCapturePlatformSources } from './motionControlCapturePlatformBridge'
import { beginMotionCapturePlatformTeardown } from './motionCaptureLifecycleGate'

type MotionCaptureXrLifecycleDependencies = Readonly<{
  readRecordingStatus: () => 'idle' | 'recording' | 'stopped'
  stopRecording: () => void
  readPeerSharingEnabled: () => boolean
  disablePeerSharing: () => void
  readCameraCaptureActive: () => boolean
  stopCameraCapture: (message: string) => Promise<unknown>
  readRegisteredSourceCount: () => number
  releaseRegisteredSources: () => void
}>

export function createMotionCaptureXrLifecycleTeardown(
  dependencies: MotionCaptureXrLifecycleDependencies,
): (message: string) => Promise<void> {
  let pendingTeardown: Promise<void> | null = null
  return (message: string): Promise<void> => {
    if (pendingTeardown) return pendingTeardown
    const operation = (async () => {
      const finishPlatformTeardown = beginMotionCapturePlatformTeardown()
      let firstFailure: unknown
      let failed = false
      const attempt = async (step: () => unknown | Promise<unknown>): Promise<void> => {
        try {
          await step()
        } catch (error) {
          if (!failed) firstFailure = error
          failed = true
        }
      }
      await attempt(() => {
        if (dependencies.readRecordingStatus() === 'recording') dependencies.stopRecording()
      })
      await attempt(() => {
        if (dependencies.readPeerSharingEnabled()) dependencies.disablePeerSharing()
      })
      await attempt(async () => {
        if (dependencies.readCameraCaptureActive()) await dependencies.stopCameraCapture(message)
      })
      await attempt(() => {
        if (dependencies.readRegisteredSourceCount() > 0) dependencies.releaseRegisteredSources()
      })
      finishPlatformTeardown()
      if (failed) throw firstFailure
    })()
    pendingTeardown = operation
    return operation.finally(() => {
      if (pendingTeardown === operation) pendingTeardown = null
    })
  }
}

const teardownMotionCaptureOutsideXrSurface = createMotionCaptureXrLifecycleTeardown({
  readRecordingStatus: () => readMotionCaptureSessionSnapshot().recording.status,
  stopRecording: () => { motionCaptureSessionRuntime.stopRecording() },
  readPeerSharingEnabled: () => readMotionCapturePeerSharingSnapshot().enabled,
  disablePeerSharing: () => { setMotionCapturePeerSharingEnabled(false) },
  readCameraCaptureActive: () => {
    const snapshot = readMotionControlSnapshot()
    return snapshot.cameraActive
      || snapshot.phase === 'requesting-camera'
      || snapshot.phase === 'loading-model'
      || snapshot.phase === 'running'
  },
  stopCameraCapture: message => stopMotionControl(message),
  readRegisteredSourceCount: () => readMotionCaptureSessionSnapshot().sources.length,
  releaseRegisteredSources: releaseMotionControlCapturePlatformSources,
})

export function stopMotionCaptureOutsideXrSurface(message: string): Promise<void> {
  return teardownMotionCaptureOutsideXrSurface(message)
}
