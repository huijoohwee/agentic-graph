import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  createXrV2MemoryArtifactStore,
  type XrV2CaptureArtifactStore,
} from '../xrV2CaptureArtifactStore'
import {
  XR_V2_DEPTH_MODEL_ID,
  XR_V2_DEPTH_MODEL_REVISION,
  type XrV2DepthInferenceSnapshot,
  type XrV2LocalDepthInferenceAdapter,
} from '../xrV2DepthInferenceRuntime'
import {
  bindXrV2SpatialCapturePreview,
  cancelXrV2SpatialCapture,
  configureXrV2SpatialCaptureSource,
  installXrV2SpatialCaptureRuntimeTestDependencies,
  readXrV2SpatialCapture,
  startXrV2SpatialCapture,
  stopXrV2SpatialCapture,
  subscribeXrV2SpatialCapture,
  type XrV2RawClipRecorder,
} from '../xrV2SpatialCaptureRuntime'

type Deferred<T> = Readonly<{
  promise: Promise<T>
  resolve: (value: T | PromiseLike<T>) => void
  reject: (error: unknown) => void
}>

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return Object.freeze({ promise, resolve, reject })
}

async function waitFor(predicate: () => boolean, label: string): Promise<void> {
  const deadline = Date.now() + 500
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error(`timed out waiting for ${label}`)
    await new Promise(resolve => setTimeout(resolve, 1))
  }
}

function createAdapter(options: Readonly<{
  prepare?: () => Promise<void>
  estimate?: () => Promise<void>
}> = {}): XrV2LocalDepthInferenceAdapter {
  const listeners = new Set<() => void>()
  let phase: XrV2DepthInferenceSnapshot['phase'] = 'idle'
  let inferenceCount = 0
  const publish = (next: XrV2DepthInferenceSnapshot['phase']) => {
    phase = next
    listeners.forEach(listener => listener())
  }
  const snapshot = (): XrV2DepthInferenceSnapshot => Object.freeze({
    phase,
    modelId: XR_V2_DEPTH_MODEL_ID,
    revision: XR_V2_DEPTH_MODEL_REVISION,
    sameOriginPath: '/xr-v2/models/depth-anything-v2-small/',
    remoteFallbackAllowed: false,
    inferenceCount,
    error: null,
  })
  return Object.freeze({
    prepare: async () => {
      publish('loading')
      await options.prepare?.()
      if (phase !== 'disposed') publish('ready')
      return snapshot()
    },
    estimate: async () => {
      publish('running')
      await options.estimate?.()
      inferenceCount += 1
      if (phase !== 'disposed') publish('ready')
      return Object.freeze({
        confidence: 1,
        depth: Object.freeze({ width: 1, height: 1, values: new Float32Array([0.5]) }),
      })
    },
    snapshot,
    subscribe: listener => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    dispose: async () => {
      publish('disposed')
      listeners.clear()
    },
  })
}

function createRecorder(neverSettles = false): XrV2RawClipRecorder {
  let state: ReturnType<XrV2RawClipRecorder['state']> = 'recording'
  let resolveStopped!: (blob: Blob) => void
  const stopped = new Promise<Blob>(resolve => { resolveStopped = resolve })
  return Object.freeze({
    state: () => state,
    requestData: () => undefined,
    stop: () => {
      state = 'inactive'
      if (!neverSettles) resolveStopped(new Blob(['capture'], { type: 'video/webm' }))
    },
    stopped,
  })
}

function abortableSamplingDelay(onEntered?: () => void) {
  return (_milliseconds: number, signal: AbortSignal): Promise<void> => {
    onEntered?.()
    if (signal.aborted) return Promise.reject(new DOMException('Capture interrupted', 'AbortError'))
    return new Promise((_resolve, reject) => {
      signal.addEventListener('abort', () => {
        reject(new DOMException('Capture interrupted', 'AbortError'))
      }, { once: true })
    })
  }
}

function createSource(recorderFactory: () => XrV2RawClipRecorder) {
  const endedListeners = new Set<EventListenerOrEventListenerObject>()
  const track = {
    readyState: 'live',
    addEventListener: (type: string, listener: EventListenerOrEventListenerObject) => {
      if (type === 'ended') endedListeners.add(listener)
    },
    removeEventListener: (type: string, listener: EventListenerOrEventListenerObject) => {
      if (type === 'ended') endedListeners.delete(listener)
    },
  } as unknown as MediaStreamTrack
  const stream = { getVideoTracks: () => [track] } as unknown as MediaStream
  const video = {
    readyState: 2,
    videoWidth: 1,
    videoHeight: 1,
    muted: true,
    playsInline: true,
    srcObject: stream,
    play: async () => undefined,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  } as unknown as HTMLVideoElement
  return Object.freeze({ video, stream, createRecorder: () => recorderFactory() })
}

async function installHarness(options: Readonly<{
  adapters: XrV2LocalDepthInferenceAdapter[]
  recorderFactory?: () => XrV2RawClipRecorder
  storeFactory?: () => XrV2CaptureArtifactStore
  delay?: (milliseconds: number, signal: AbortSignal) => Promise<void>
  operationTimeoutMs?: number
  prepareTimeoutMs?: number
  maxDurationMs?: number
}>): Promise<() => Promise<void>> {
  await cancelXrV2SpatialCapture()
  const adapters = [...options.adapters]
  const restore = installXrV2SpatialCaptureRuntimeTestDependencies({
    canOfferUserActions: () => true,
    preflightStore: async () => true,
    createStore: options.storeFactory || createXrV2MemoryArtifactStore,
    createDepthAdapter: () => {
      const adapter = adapters.shift()
      if (!adapter) throw new Error('test depth adapter queue exhausted')
      return adapter
    },
    captureFrame: () => Object.freeze({
      width: 1,
      height: 1,
      data: new Uint8ClampedArray([20, 40, 60, 255]),
    }),
    delay: options.delay || abortableSamplingDelay(),
    now: () => 1,
    wallNow: () => 1_700_000_000_000,
    createObjectUrl: () => 'blob:xr-v2-test-playback',
    revokeObjectUrl: () => undefined,
    operationTimeoutMs: options.operationTimeoutMs || 30,
    prepareTimeoutMs: options.prepareTimeoutMs || 100,
    maxDurationMs: options.maxDurationMs || 12_000,
  })
  const releaseSource = configureXrV2SpatialCaptureSource(createSource(
    options.recorderFactory || (() => createRecorder()),
  ))
  return async () => {
    await cancelXrV2SpatialCapture()
    releaseSource()
    configureXrV2SpatialCaptureSource(null)
    restore()
  }
}

test('spatial capture session generations serialize stop/cancel and reject stale mutation', async t => {
  await t.test('hard duration cancels preparation instead of starting an over-budget capture', async () => {
    let recorderCancelled = false
    const teardown = await installHarness({
      adapters: [createAdapter({ prepare: () => new Promise<void>(() => undefined) })],
      recorderFactory: () => {
        const recorder = createRecorder()
        return Object.freeze({
          ...recorder,
          stop: () => {
            recorderCancelled = true
            recorder.stop()
          },
        })
      },
      prepareTimeoutMs: 80,
      maxDurationMs: 20,
    })
    try {
      const startedAt = Date.now()
      const result = await startXrV2SpatialCapture()
      assert.equal(result.phase, 'idle')
      assert.equal(recorderCancelled, true)
      assert.ok(Date.now() - startedAt < 250)
    } finally {
      await teardown()
    }
  })

  await t.test('cancelled deferred preparation cannot overwrite a restarted session', async () => {
    const firstPrepare = deferred<void>()
    let firstPreparing = false
    const teardown = await installHarness({
      adapters: [
        createAdapter({ prepare: async () => {
          firstPreparing = true
          await firstPrepare.promise
        } }),
        createAdapter(),
      ],
    })
    try {
      const firstStart = startXrV2SpatialCapture()
      await waitFor(() => firstPreparing, 'first model preparation')
      await cancelXrV2SpatialCapture()
      const restarted = await startXrV2SpatialCapture()
      assert.equal(restarted.phase, 'capturing-live')
      const restartedId = restarted.sessionId
      firstPrepare.resolve()
      await firstStart
      assert.equal(readXrV2SpatialCapture().phase, 'capturing-live')
      assert.equal(readXrV2SpatialCapture().sessionId, restartedId)
    } finally {
      firstPrepare.resolve()
      await teardown()
    }
  })

  await t.test('stop while inference is in flight never regresses from stopping and saves once', async () => {
    const estimate = deferred<void>()
    let estimating = false
    let delayEntered = false
    const phases: string[] = []
    const teardown = await installHarness({
      adapters: [createAdapter({ estimate: async () => {
        estimating = true
        await estimate.promise
      } })],
      delay: abortableSamplingDelay(() => { delayEntered = true }),
    })
    const unsubscribe = subscribeXrV2SpatialCapture(() => {
      phases.push(readXrV2SpatialCapture().phase)
    })
    try {
      await startXrV2SpatialCapture()
      await waitFor(() => estimating, 'in-flight depth inference')
      const stopping = stopXrV2SpatialCapture()
      assert.equal(readXrV2SpatialCapture().phase, 'stopping')
      estimate.resolve()
      const saved = await stopping
      assert.equal(delayEntered, false)
      assert.equal(saved.phase, 'saved')
      assert.equal(saved.assetMetadata?.synthesis_mode, 'live')
      const stoppingIndex = phases.indexOf('stopping')
      assert.ok(stoppingIndex >= 0)
      assert.equal(phases.slice(stoppingIndex + 1).some(phase => phase.startsWith('capturing-')), false)
    } finally {
      estimate.resolve()
      unsubscribe()
      await teardown()
    }
  })

  await t.test('cancel during metadata finalization compensates every partial artifact', async () => {
    const baseStore = createXrV2MemoryArtifactStore()
    const persistGate = deferred<void>()
    let persistedAssetId: string | null = null
    let persistenceEntered = false
    const store: XrV2CaptureArtifactStore = Object.freeze({
      ...baseStore,
      putPublishedSpatialAsset: async asset => {
        await baseStore.putPublishedSpatialAsset(asset)
        persistedAssetId = asset.asset_id
        persistenceEntered = true
        await persistGate.promise
      },
    })
    let frameCompleted = false
    const teardown = await installHarness({
      adapters: [createAdapter()],
      storeFactory: () => store,
      delay: abortableSamplingDelay(() => { frameCompleted = true }),
    })
    try {
      await startXrV2SpatialCapture()
      await waitFor(() => frameCompleted, 'sampled frame')
      const stopping = stopXrV2SpatialCapture()
      await waitFor(() => persistenceEntered, 'metadata persistence')
      await cancelXrV2SpatialCapture()
      persistGate.resolve()
      await stopping
      assert.equal(readXrV2SpatialCapture().phase, 'idle')
      assert.ok(persistedAssetId)
      assert.equal(await baseStore.readPublishedSpatialAsset(persistedAssetId!), null)
    } finally {
      persistGate.resolve()
      await teardown()
    }
  })

  await t.test('a recorder that never settles fails within the operation bound', async () => {
    let frameCompleted = false
    const teardown = await installHarness({
      adapters: [createAdapter()],
      recorderFactory: () => createRecorder(true),
      delay: abortableSamplingDelay(() => { frameCompleted = true }),
      operationTimeoutMs: 20,
    })
    try {
      await startXrV2SpatialCapture()
      await waitFor(() => frameCompleted, 'sampled frame')
      const startedAt = Date.now()
      const failed = await stopXrV2SpatialCapture()
      assert.equal(failed.phase, 'error')
      assert.match(failed.error || '', /recorder finalization timed out/)
      assert.ok(Date.now() - startedAt < 250)
      await new Promise(resolve => setTimeout(resolve, 70))
    } finally {
      await teardown()
    }
  })
})

test('depth preparation failure keeps the raw recorder alive and saves one fallback job', async () => {
  const order: string[] = []
  let sampled = false
  const adapter = createAdapter({ prepare: async () => {
    order.push('prepare')
    throw new Error('local model unsupported')
  } })
  const teardown = await installHarness({
    adapters: [adapter],
    recorderFactory: () => {
      order.push('recorder')
      return createRecorder()
    },
    delay: abortableSamplingDelay(() => { sampled = true }),
  })
  try {
    const started = await startXrV2SpatialCapture()
    assert.equal(started.phase, 'capturing-live')
    assert.deepEqual(order.slice(0, 2), ['recorder', 'prepare'])
    await waitFor(() => sampled, 'raw frame after model preparation failure')
    const saved = await stopXrV2SpatialCapture()
    assert.equal(saved.phase, 'saved')
    assert.equal(saved.assetMetadata?.synthesis_mode, 'post-process')
    assert.equal(saved.fallbackTriggered, true)
    assert.equal(saved.postProcessJobId?.endsWith(':post-process:1'), true)
  } finally {
    await teardown()
  }
})

test('camera source release without an active capture clears every XR preview', async () => {
  await cancelXrV2SpatialCapture()
  let clearCount = 0
  const previewVideo = {
    srcObject: null,
    muted: true,
    playsInline: true,
    play: async () => undefined,
  } as unknown as HTMLVideoElement
  const previewCanvas = () => ({
    width: 4,
    height: 4,
    getContext: () => ({ clearRect: () => { clearCount += 1 } }),
  }) as unknown as HTMLCanvasElement
  bindXrV2SpatialCapturePreview({ video: previewVideo, left: previewCanvas(), right: previewCanvas() })
  const source = createSource(() => createRecorder())
  const release = configureXrV2SpatialCaptureSource(source)
  assert.equal(previewVideo.srcObject, source.stream)
  release()
  assert.equal(previewVideo.srcObject, null)
  assert.equal(clearCount, 2)
  bindXrV2SpatialCapturePreview({ video: null, left: null, right: null })
})
