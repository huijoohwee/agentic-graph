import {
  readMotionControlSnapshot,
  startMotionControl,
  stopMotionControl,
} from '@/features/three/motionControlRuntime'
import { motionCaptureSessionRuntime } from '@/features/three/motionCaptureSessionRuntime'
import { useGraphStore } from '@/hooks/useGraphStore'

function expectTeardownRejection(operation: () => unknown): void {
  try {
    operation()
  } catch (error) {
    if (error instanceof Error && error.message === 'motion-capture-platform-teardown-active') return
    throw error
  }
  throw new Error('expected capture re-arm to fail during platform teardown')
}

export async function testMotionControlExplicitStopCancelsConcurrentStart(): Promise<void> {
  const descriptors = new Map(['document', 'navigator', 'window'].map(key => [
    key,
    Object.getOwnPropertyDescriptor(globalThis, key),
  ]))
  let cameraRequestCount = 0
  const priorSurface = useGraphStore.getState()
  const priorSurfaceState = {
    canvasRenderMode: priorSurface.canvasRenderMode,
    canvas3dMode: priorSurface.canvas3dMode,
    floatingPanelOpen: priorSurface.floatingPanelOpen,
    floatingPanelView: priorSurface.floatingPanelView,
  }
  try {
    await stopMotionControl()
    Object.defineProperty(globalThis, 'document', {
      configurable: true,
      value: Object.assign(new EventTarget(), { visibilityState: 'visible' }),
    })
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: new EventTarget(),
    })
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: {
        mediaDevices: {
          getUserMedia: async () => {
            cameraRequestCount += 1
            throw new Error('camera request should have been cancelled')
          },
        },
      },
    })
    useGraphStore.setState({
      canvasRenderMode: '3d', canvas3dMode: 'xr', floatingPanelOpen: true, floatingPanelView: 'motionControl',
    })
    const starting = startMotionControl('wasm')
    const stopping = stopMotionControl('Explicit concurrent stop.')
    const [startResult, stopResult] = await Promise.all([starting, stopping])
    const snapshot = readMotionControlSnapshot()
    if (cameraRequestCount !== 0
      || startResult.phase !== 'off'
      || stopResult.phase !== 'off'
      || snapshot.phase !== 'off'
      || snapshot.cameraActive) {
      throw new Error('expected explicit Stop to cancel a concurrent Start before camera acquisition')
    }

    let resolveLateCamera!: (stream: MediaStream) => void
    let lateTrackStopCount = 0
    const lateStream = {
      getTracks: () => [{ stop: () => { lateTrackStopCount += 1 } }],
      getVideoTracks: () => [],
    } as unknown as MediaStream
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: { mediaDevices: { getUserMedia: () => {
        cameraRequestCount += 1
        return new Promise<MediaStream>(resolve => { resolveLateCamera = resolve })
      } } },
    })
    const hungStart = startMotionControl('wasm')
    for (let attempt = 0; attempt < 5 && !resolveLateCamera; attempt += 1) await Promise.resolve()
    if (!resolveLateCamera) throw new Error('expected Start to reach the pending camera request')
    await Promise.all([hungStart, stopMotionControl('Stop pending camera request.')])
    resolveLateCamera(lateStream)
    await Promise.resolve()
    await Promise.resolve()
    if (lateTrackStopCount !== 1 || readMotionControlSnapshot().phase !== 'off') {
      throw new Error('expected Stop to settle a pending Start and release its late camera stream')
    }

    const cameraRequestsBeforeSurfaceClose = cameraRequestCount
    const surfaceClosingStart = startMotionControl('wasm')
    useGraphStore.setState({ floatingPanelOpen: false })
    await surfaceClosingStart
    if (cameraRequestCount !== cameraRequestsBeforeSurfaceClose) {
      throw new Error('expected a synchronous XR-surface fence before camera acquisition')
    }
    useGraphStore.setState({ floatingPanelOpen: true, floatingPanelView: 'motionControl' })
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: { mediaDevices: { getUserMedia: async () => {
        cameraRequestCount += 1
        throw new Error('camera request should have been cancelled')
      } } },
    })

    motionCaptureSessionRuntime.registerSource({
      captureKind: 'landmark-stream', coordinateSpace: 'model-relative', clockDomain: 'session-monotonic',
    })
    const delayedStarting = startMotionControl('wasm')
    await Promise.resolve()
    const delayedStopping = stopMotionControl('Explicit stop after internal teardown.')
    await Promise.all([delayedStarting, delayedStopping])
    if (motionCaptureSessionRuntime.getSnapshot().sources.length !== 0
      || readMotionControlSnapshot().message !== 'Explicit stop after internal teardown.') {
      throw new Error('expected a joined explicit Stop to upgrade an already-completing restart teardown')
    }

    motionCaptureSessionRuntime.registerSource({
      captureKind: 'landmark-stream', coordinateSpace: 'model-relative', clockDomain: 'session-monotonic',
    })
    motionCaptureSessionRuntime.startRecording()
    const finalStopping = stopMotionControl('Authoritative final cleanup.')
    expectTeardownRejection(() => motionCaptureSessionRuntime.registerSource({
      captureKind: 'landmark-stream', coordinateSpace: 'model-relative', clockDomain: 'session-monotonic',
    }))
    expectTeardownRejection(() => motionCaptureSessionRuntime.startRecording())
    await finalStopping
    const capture = motionCaptureSessionRuntime.getSnapshot()
    if (capture.sources.length !== 0
      || capture.recording.status !== 'stopped'
      || readMotionControlSnapshot().message !== 'Authoritative final cleanup.') {
      throw new Error('expected Stop finalization to revoke sources, finish recording, and reject capture re-arm')
    }
    motionCaptureSessionRuntime.clearRecording()
  } finally {
    await stopMotionControl()
    useGraphStore.setState(priorSurfaceState)
    for (const [key, descriptor] of descriptors) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor)
      else Reflect.deleteProperty(globalThis, key)
    }
  }
}
