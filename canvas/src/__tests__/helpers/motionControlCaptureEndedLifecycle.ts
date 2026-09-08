import { readMotionControlSnapshot, startMotionControl, stopMotionControl } from '@/features/three/motionControlRuntime'
import { openMotionControlSurface } from '@/features/three/motionControlSurfaceRuntime'

export async function testCaptureEndedLifecycle() {
  class CameraTrack extends EventTarget {
    readyState: MediaStreamTrackState = 'live'
    stopped = false

    end(): void {
      this.readyState = 'ended'
      this.dispatchEvent(new Event('ended'))
    }

    stop(): void {
      this.stopped = true
      this.readyState = 'ended'
    }
  }

  const track = new CameraTrack()
  const stream = {
    getTracks: () => [track],
    getVideoTracks: () => [track],
  } as unknown as MediaStream
  let resolvePlay = () => void 0
  let playCalled = false
  const playPromise = new Promise<void>(resolve => { resolvePlay = resolve })
  const video = {
    autoplay: false,
    muted: false,
    pause: () => void 0,
    play: () => {
      playCalled = true
      return playPromise
    },
    playsInline: false,
    srcObject: null,
  }
  const fakeDocument = Object.assign(new EventTarget(), {
    createElement: () => video,
    visibilityState: 'visible',
  })
  const nativeSetTimeout = globalThis.setTimeout.bind(globalThis)
  const nativeClearTimeout = globalThis.clearTimeout.bind(globalThis)
  const timers = new Set<ReturnType<typeof globalThis.setTimeout>>()
  const fakeWindow = Object.assign(new EventTarget(), {
    setTimeout: (callback: () => void, delayMs = 0) => {
      const handle = nativeSetTimeout(() => { timers.delete(handle); callback() }, delayMs)
      timers.add(handle)
      return handle
    },
    clearTimeout: (handle: ReturnType<typeof globalThis.setTimeout>) => {
      if (timers.delete(handle)) nativeClearTimeout(handle)
    },
    cancelAnimationFrame: () => void 0,
    isSecureContext: true,
    requestAnimationFrame: () => 1,
  })
  const descriptors = new Map(['document', 'navigator', 'window'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]))
  const errors: unknown[] = []
  try {
    Object.defineProperty(globalThis, 'document', { configurable: true, value: fakeDocument })
    Object.defineProperty(globalThis, 'window', { configurable: true, value: fakeWindow })
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: { mediaDevices: { getUserMedia: async () => stream } },
    })
    const beforeStops = readMotionControlSnapshot().revision
    await Promise.all([stopMotionControl(), stopMotionControl()])
    if (readMotionControlSnapshot().revision !== beforeStops + 1) {
      throw new Error('expected concurrent stop calls to share one serialized teardown')
    }
    if (!openMotionControlSurface('motion-control')) throw new Error('expected an approved XR capture surface')
    const starting = startMotionControl('wasm')
    for (let attempt = 0; attempt < 12 && readMotionControlSnapshot().phase !== 'requesting-camera'; attempt += 1) {
      await Promise.resolve()
    }
    if (readMotionControlSnapshot().phase !== 'requesting-camera') throw new Error('expected camera request phase before lifecycle test')
    for (let attempt = 0; attempt < 12 && !playCalled; attempt += 1) await Promise.resolve()
    if (!playCalled) throw new Error('expected camera preview to bind before lifecycle test')
    track.end()
    resolvePlay()
    await starting
    for (let attempt = 0; attempt < 12 && readMotionControlSnapshot().phase !== 'error'; attempt += 1) await Promise.resolve()
    const ended = readMotionControlSnapshot()
    if (ended.phase !== 'error' || ended.cameraActive || ended.pose || !track.stopped) {
      throw new Error('expected a revoked or ended camera track to clear capture and publish an error')
    }
  } catch (error) { errors.push(error) } finally {
    resolvePlay()
    try { await stopMotionControl() } catch (error) { errors.push(error) }
    for (const handle of timers) {
      try { nativeClearTimeout(handle) } catch (error) { errors.push(error) }
    }
    timers.clear()
    for (const [key, descriptor] of descriptors) {
      try {
        if (descriptor) Object.defineProperty(globalThis, key, descriptor)
        else if (!Reflect.deleteProperty(globalThis, key)) throw new Error(`Could not restore ${key}`)
      } catch (error) { errors.push(error) }
    }
  }
  if (errors.length === 1) throw errors[0]
  if (errors.length) throw Object.assign(new Error(errors.map(error => String((error as Error)?.message ?? error)).join('; ')), { errors })
}
