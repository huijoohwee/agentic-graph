import { motionCapturePlatformTeardownActive } from '@/features/three/motionCaptureLifecycleGate'
import { createMotionCaptureXrLifecycleTeardown } from '@/features/three/motionCaptureXrLifecycleRuntime'

export async function testMotionCaptureLifecycleTeardownIsFailureSafe(): Promise<void> {
  const calls: string[] = []
  const teardown = createMotionCaptureXrLifecycleTeardown({
    readRecordingStatus: () => 'recording',
    stopRecording: () => {
      calls.push('stop-recording')
      throw new Error('recording-listener-failed')
    },
    readPeerSharingEnabled: () => true,
    disablePeerSharing: () => { calls.push('disable-peer') },
    readCameraCaptureActive: () => true,
    stopCameraCapture: async () => { calls.push('stop-camera') },
    readRegisteredSourceCount: () => 1,
    releaseRegisteredSources: () => { calls.push('release-sources') },
  })
  let failure = ''
  try {
    await teardown('XR capture surface closed.')
  } catch (error) {
    failure = error instanceof Error ? error.message : String(error)
  }
  if (failure !== 'recording-listener-failed'
    || calls.join(',') !== 'stop-recording,disable-peer,stop-camera,release-sources'
    || motionCapturePlatformTeardownActive()) {
    throw new Error('expected teardown to finish every cleanup phase, preserve the first failure, and release its gate')
  }
}
