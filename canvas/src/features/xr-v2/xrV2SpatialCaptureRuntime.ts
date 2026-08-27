import { createXrV2CaptureSession, type XrV2CaptureSession } from './captureSession'
import type { XrV2CaptureSnapshot } from './captureContracts'
import { createXrV2CaptureFallbackPersister } from './spatialCapturePostProcess'
import {
  createXrV2RgbaStereoSynthesizer,
  type XrV2RgbaFrame,
} from './stereoSynthesis'
import {
  createXrV2CaptureArtifactSink,
  type XrV2CaptureArtifactSinkController,
  type XrV2CaptureArtifactStore,
  type XrV2CapturePersistenceKeys,
} from './xrV2CaptureArtifactStore'
import {
  XR_V2_DEPTH_MODEL_MANIFEST,
  type XrV2LocalDepthInferenceAdapter,
} from './xrV2DepthInferenceRuntime'
import {
  createXrV2PublishedSpatialAsset,
  createXrV2SpatialAssetMetadata,
  type XrV2SpatialAssetMetadata,
} from './xrV2SpatialAssetMetadata'
import {
  XR_V2_DEFAULT_SPATIAL_CAPTURE_DEPENDENCIES,
  XR_V2_SPATIAL_CAPTURE_OPERATION_TIMEOUT_MS,
  XR_V2_SPATIAL_CAPTURE_MAX_DURATION_MS,
  XR_V2_SPATIAL_CAPTURE_PREPARE_TIMEOUT_MS,
  prepareXrV2DepthEstimatorOrRawFallback,
  resetXrV2SamplingCanvas,
  verifyXrV2PublishedAsset,
  waitForXrV2VideoFrame,
  withXrV2Deadline,
  type XrV2SpatialCaptureRuntimeDependencies,
  type XrV2SpatialCaptureRuntimeTestDependencies,
} from './xrV2SpatialCaptureRuntimeSupport'

export const XR_V2_SPATIAL_CAPTURE_RUNTIME_SCHEMA = 'agenticgraph-xr-v2-spatial-capture-runtime/v1' as const
export const XR_V2_SPATIAL_CAPTURE_MAX_FRAMES = 24
export const XR_V2_SPATIAL_CAPTURE_FRAME_BUDGET_MS = 100
export const XR_V2_SPATIAL_CAPTURE_CONSECUTIVE_BREACHES = 2
export {
  XR_V2_SPATIAL_CAPTURE_OPERATION_TIMEOUT_MS,
  XR_V2_SPATIAL_CAPTURE_MAX_DURATION_MS,
  XR_V2_SPATIAL_CAPTURE_PREPARE_TIMEOUT_MS,
  type XrV2SpatialCaptureRuntimeTestDependencies,
} from './xrV2SpatialCaptureRuntimeSupport'
export type XrV2SpatialCaptureSnapshot = Readonly<{
  schema: typeof XR_V2_SPATIAL_CAPTURE_RUNTIME_SCHEMA
  phase: 'idle' | 'preparing' | 'capturing-live' | 'capturing-raw' | 'stopping' | 'saved' | 'error'
  message: string
  sessionId: string | null
  cameraPermissionRequested: boolean
  cameraSourceAvailable: boolean
  sensorPermissionRequested: false
  rawFrameCount: number
  depthFrameCount: number
  synthesizedFrameCount: number
  fallbackTriggered: boolean
  modelPhase: 'idle' | 'loading' | 'ready' | 'running' | 'error' | 'disposed'
  assetMetadata: XrV2SpatialAssetMetadata | null
  rawClipRef: string | null
  depthMetadataRef: string | null
  postProcessJobId: string | null
  playbackUrl: string | null
  error: string | null
}>
export type XrV2RawClipRecorder = Readonly<{
  state: () => 'inactive' | 'paused' | 'recording'
  requestData: () => void
  stop: () => void
  stopped: Promise<Blob>
}>
export type XrV2SpatialCaptureSource = Readonly<{
  video: HTMLVideoElement
  stream: MediaStream
  createRecorder: (stream: MediaStream) => XrV2RawClipRecorder
}>
type SessionContext = {
  generation: number
  source: XrV2SpatialCaptureSource
  stream: MediaStream
  abort: AbortController
  dependencies: XrV2SpatialCaptureRuntimeDependencies
  store: XrV2CaptureArtifactStore | null
  sink: XrV2CaptureArtifactSinkController | null
  adapter: XrV2LocalDepthInferenceAdapter | null
  capture: XrV2CaptureSession<XrV2RgbaFrame> | null
  recorder: XrV2RawClipRecorder | null
  samplingTask: Promise<void> | null
  finishTask: Promise<XrV2SpatialCaptureSnapshot> | null
  cleanupTask: Promise<void> | null
  autoStopTimer: ReturnType<typeof setTimeout> | null
  persistence: XrV2CapturePersistenceKeys
  stopping: boolean
  cancelled: boolean
  committed: boolean
}

const listeners = new Set<() => void>()
let configuredSource: XrV2SpatialCaptureSource | null = null
let sourceBindingGeneration = 0
let generation = 0
let activeSession: SessionContext | null = null
let snapshot: XrV2SpatialCaptureSnapshot = idleSnapshot()
let boundVideo: HTMLVideoElement | null = null
let boundLeftPreview: HTMLCanvasElement | null = null
let boundRightPreview: HTMLCanvasElement | null = null
let lastLeftFrame: XrV2RgbaFrame | null = null
let lastRightFrame: XrV2RgbaFrame | null = null
let sourceLifecycleCleanup: (() => void) | null = null

function idleSnapshot(): XrV2SpatialCaptureSnapshot {
  return Object.freeze({
    schema: XR_V2_SPATIAL_CAPTURE_RUNTIME_SCHEMA,
    phase: 'idle',
    message: 'Spatial camera stays off until Start XR capture.',
    sessionId: null,
    cameraPermissionRequested: false,
    cameraSourceAvailable: configuredSource !== null,
    sensorPermissionRequested: false,
    rawFrameCount: 0,
    depthFrameCount: 0,
    synthesizedFrameCount: 0,
    fallbackTriggered: false,
    modelPhase: 'idle',
    assetMetadata: null,
    rawClipRef: null,
    depthMetadataRef: null,
    postProcessJobId: null,
    playbackUrl: null,
    error: null,
  })
}
function publish(patch: Partial<XrV2SpatialCaptureSnapshot>): XrV2SpatialCaptureSnapshot {
  snapshot = Object.freeze({ ...snapshot, ...patch })
  for (const listener of listeners) {
    try { listener() } catch { /* one subscriber cannot corrupt capture state */ }
  }
  return snapshot
}
function message(error: unknown): string {
  return error instanceof Error && error.message.trim()
    ? error.message
    : String(error || 'XR spatial capture failed')
}
let dependencies = XR_V2_DEFAULT_SPATIAL_CAPTURE_DEPENDENCIES

/** Test-only dependency override. Production callers should never invoke this. */
export function installXrV2SpatialCaptureRuntimeTestDependencies(
  overrides: XrV2SpatialCaptureRuntimeTestDependencies,
): () => void {
  if (activeSession) throw new Error('cannot replace XR capture dependencies while a session is active')
  const previous = dependencies
  dependencies = Object.freeze({ ...dependencies, ...overrides })
  return () => { dependencies = previous }
}

function sessionId(): string {
  const random = globalThis.crypto?.randomUUID?.().replaceAll('-', '')
    || `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`
  return `xr-v2-${random.slice(0, 64)}`
}

function persistenceKeys(id: string): XrV2CapturePersistenceKeys {
  return Object.freeze({
    rawClipRef: `indexeddb://agenticgraph-xr-v2/raw-clip/${id}`,
    depthMetadataRef: `indexeddb://agenticgraph-xr-v2/frame-bundle/${id}`,
    spatialAssetId: `${id}:asset`,
    fallback: Object.freeze({
      flatAssetId: `${id}:asset`,
      jobId: `${id}:post-process:1`,
      idempotencyKey: `${id}:fallback`,
    }),
  })
}

function owns(context: SessionContext): boolean {
  return activeSession === context
    && generation === context.generation
    && !context.cancelled
}

function drawFrame(canvas: HTMLCanvasElement | null, frame: XrV2RgbaFrame): void {
  if (!canvas) return
  canvas.width = frame.width
  canvas.height = frame.height
  const context = canvas.getContext('2d')
  if (context) context.putImageData(new ImageData(frame.data, frame.width, frame.height), 0, 0)
}

function clearBoundPreview(stream?: MediaStream): void {
  if ((!stream || boundVideo?.srcObject === stream) && boundVideo) boundVideo.srcObject = null
  lastLeftFrame = null; lastRightFrame = null
  for (const canvas of [boundLeftPreview, boundRightPreview]) canvas?.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height)
}

function attachBoundVideo(context: SessionContext): void {
  if (!boundVideo || !owns(context)) return
  if (boundVideo.srcObject !== context.stream) boundVideo.srcObject = context.stream
  boundVideo.muted = true
  boundVideo.playsInline = true
  void boundVideo.play().catch(() => undefined)
}

export function bindXrV2SpatialCapturePreview(input: Readonly<{
  video: HTMLVideoElement | null
  left: HTMLCanvasElement | null
  right: HTMLCanvasElement | null
}>): void {
  if (boundVideo && boundVideo !== input.video) boundVideo.srcObject = null
  boundVideo = input.video
  boundLeftPreview = input.left
  boundRightPreview = input.right
  if (activeSession) attachBoundVideo(activeSession)
  if (lastLeftFrame) drawFrame(boundLeftPreview, lastLeftFrame)
  if (lastRightFrame) drawFrame(boundRightPreview, lastRightFrame)
}

function releaseSourceBinding(binding: number): void {
  if (binding !== sourceBindingGeneration) return
  const releasedStream = configuredSource?.stream
  sourceLifecycleCleanup?.()
  sourceLifecycleCleanup = null
  configuredSource = null
  clearBoundPreview(releasedStream)
  publish({ cameraSourceAvailable: false })
}

export function configureXrV2SpatialCaptureSource(
  source: XrV2SpatialCaptureSource | null,
): () => void {
  sourceLifecycleCleanup?.()
  sourceLifecycleCleanup = null
  const binding = ++sourceBindingGeneration
  configuredSource = source
  if (!source) {
    publish({ cameraSourceAvailable: false })
    return () => undefined
  }
  const tracks = source.stream.getVideoTracks()
  const ended = () => {
    releaseSourceBinding(binding)
    void cancelXrV2SpatialCapture()
  }
  tracks.forEach(track => track.addEventListener('ended', ended))
  sourceLifecycleCleanup = () => tracks.forEach(track => track.removeEventListener('ended', ended))
  if (boundVideo) {
    boundVideo.srcObject = source.stream
    void boundVideo.play().catch(() => undefined)
  }
  publish({ cameraSourceAvailable: true })
  return () => releaseSourceBinding(binding)
}

function reflectCapture(context: SessionContext, capture: XrV2CaptureSnapshot): void {
  if (!owns(context) || context.stopping) return
  publish({
    phase: capture.phase === 'capturing-raw' ? 'capturing-raw' : 'capturing-live',
    message: capture.phase === 'capturing-raw'
      ? 'Frame budget fallback active; raw capture continues and post-process will queue on save.'
      : 'Live local depth + DIBR capture is running.',
    rawFrameCount: capture.rawFrameCount,
    depthFrameCount: capture.depthFrameCount,
    synthesizedFrameCount: capture.synthesizedFrameCount,
    fallbackTriggered: capture.fallback !== null,
    modelPhase: context.adapter?.snapshot().phase || 'idle',
  })
}

async function sampleFrames(context: SessionContext): Promise<void> {
  await waitForXrV2VideoFrame(context.source.video, context.abort.signal)
  let frameIndex = 0
  while (owns(context) && !context.stopping && frameIndex < XR_V2_SPATIAL_CAPTURE_MAX_FRAMES) {
    const capture = context.capture
    if (!capture) return
    const state = await capture.processFrame({
      frameIndex,
      capturedAtMs: context.dependencies.now(),
      frame: context.dependencies.captureFrame(context.source.video),
    })
    reflectCapture(context, state)
    frameIndex += 1
    if (owns(context) && !context.stopping && frameIndex < XR_V2_SPATIAL_CAPTURE_MAX_FRAMES) {
      await context.dependencies.delay(100, context.abort.signal)
    }
  }
  if (owns(context) && !context.stopping) queueMicrotask(() => {
    if (owns(context)) void stopXrV2SpatialCapture()
  })
}

function detachContextPreview(context: SessionContext): void {
  if (boundVideo?.srcObject === context.stream) boundVideo.srcObject = null
}

function cleanupSession(
  context: SessionContext,
  options: Readonly<{ compensate: boolean; waitForFinish: boolean }>,
): Promise<void> {
  if (context.cleanupTask) return context.cleanupTask
  const work = (async () => {
    context.abort.abort()
    if (context.autoStopTimer !== null) clearTimeout(context.autoStopTimer)
    context.autoStopTimer = null
    if (options.waitForFinish && context.finishTask) {
      await withXrV2Deadline(context.finishTask, context.dependencies.operationTimeoutMs, 'XR capture finish').catch(() => undefined)
    }
    if (context.samplingTask) {
      await withXrV2Deadline(context.samplingTask, context.dependencies.operationTimeoutMs, 'XR frame sampler').catch(() => undefined)
    }
    const recorder = context.recorder
    if (recorder && recorder.state() !== 'inactive') {
      try { recorder.stop() } catch { /* recorder already ended */ }
    }
    if (recorder) {
      await withXrV2Deadline(recorder.stopped, context.dependencies.operationTimeoutMs, 'XR recorder cleanup').catch(() => undefined)
    }
    if (context.adapter) {
      await withXrV2Deadline(context.adapter.dispose(), context.dependencies.operationTimeoutMs, 'XR depth cleanup').catch(() => undefined)
    }
    if (options.compensate && context.store && !context.committed) {
      await withXrV2Deadline(
        context.store.deleteCapturePersistence(context.persistence),
        context.dependencies.operationTimeoutMs,
        'XR capture compensation',
      ).catch(() => undefined)
    }
    context.store?.close()
    detachContextPreview(context)
    context.store = null
    context.sink = null
    context.adapter = null
    context.capture = null
    context.recorder = null
    context.samplingTask = null
    resetXrV2SamplingCanvas()
  })()
  context.cleanupTask = withXrV2Deadline(
    work,
    context.dependencies.operationTimeoutMs * 2,
    'XR capture teardown',
  ).catch(() => undefined)
  return context.cleanupTask
}

function failCurrentSession(context: SessionContext, error: unknown): XrV2SpatialCaptureSnapshot {
  if (!owns(context)) return snapshot
  activeSession = null
  context.cancelled = true
  context.abort.abort()
  const reason = message(error)
  const failed = publish({ phase: 'error', message: reason, error: reason })
  void cleanupSession(context, { compensate: true, waitForFinish: false })
  return failed
}

export async function startXrV2SpatialCapture(): Promise<XrV2SpatialCaptureSnapshot> {
  if (activeSession || snapshot.phase === 'stopping') return snapshot
  if (!dependencies.canOfferUserActions()) {
    return publish({ phase: 'error', message: 'Capability detection must finish before capture.', error: 'capability-tier-pending' })
  }
  const source = configuredSource
  if (!source) {
    return publish({ phase: 'error', message: 'Start the canonical pose camera before XR spatial capture.', error: 'canonical-camera-unavailable' })
  }
  const id = sessionId()
  const context: SessionContext = {
    generation: ++generation,
    source,
    stream: source.stream,
    abort: new AbortController(),
    dependencies,
    store: null,
    sink: null,
    adapter: null,
    capture: null,
    recorder: null,
    samplingTask: null,
    finishTask: null,
    cleanupTask: null,
    autoStopTimer: null,
    persistence: persistenceKeys(id),
    stopping: false,
    cancelled: false,
    committed: false,
  }
  activeSession = context
  if (snapshot.playbackUrl) context.dependencies.revokeObjectUrl(snapshot.playbackUrl)
  snapshot = idleSnapshot()
  publish({
    phase: 'preparing',
    message: 'Preparing durable local storage and the authorized camera for XR spatial capture…',
    cameraPermissionRequested: false,
  })
  try {
    if (source.stream.getVideoTracks().every(track => track.readyState !== 'live')) {
      throw new Error('Canonical camera owner did not expose a live preview stream')
    }
    await withXrV2Deadline(context.dependencies.preflightStore(), context.dependencies.operationTimeoutMs, 'XR storage preflight')
    if (!owns(context)) return snapshot
    context.store = context.dependencies.createStore()
    attachBoundVideo(context)
    source.video.muted = true
    source.video.playsInline = true
    await withXrV2Deadline(source.video.play(), context.dependencies.operationTimeoutMs, 'XR camera preview')
    if (!owns(context)) return snapshot
    context.sink = createXrV2CaptureArtifactSink({
      sessionId: id,
      store: context.store,
      maxFrames: XR_V2_SPATIAL_CAPTURE_MAX_FRAMES,
    })
    context.recorder = source.createRecorder(source.stream)
    context.autoStopTimer = setTimeout(() => {
      if (!owns(context)) return
      if (snapshot.phase === 'preparing') void cancelXrV2SpatialCapture()
      else void stopXrV2SpatialCapture()
    }, context.dependencies.maxDurationMs)
    context.adapter = context.dependencies.createDepthAdapter()
    const depthEstimator = await prepareXrV2DepthEstimatorOrRawFallback(context.adapter, context.dependencies.prepareTimeoutMs)
    if (!owns(context)) return snapshot
    context.capture = createXrV2CaptureSession({
      sessionId: id,
      configuration: {
        frameBudgetMs: XR_V2_SPATIAL_CAPTURE_FRAME_BUDGET_MS,
        consecutiveBudgetBreaches: XR_V2_SPATIAL_CAPTURE_CONSECUTIVE_BREACHES,
        maxFrames: XR_V2_SPATIAL_CAPTURE_MAX_FRAMES,
      },
      depthEstimator,
      stereoSynthesizer: createXrV2RgbaStereoSynthesizer({ maxDisparityPixels: 8 }),
      artifactSink: context.sink,
      clock: { now: context.dependencies.now },
      onStereoPair: pair => {
        if (!owns(context) || context.stopping) return
        lastLeftFrame = pair.left
        lastRightFrame = pair.right
        drawFrame(boundLeftPreview, pair.left)
        drawFrame(boundRightPreview, pair.right)
      },
    })
    const initial = context.capture.start()
    publish({
      phase: 'capturing-live',
      message: 'Live local depth + DIBR capture is starting.',
      sessionId: id,
      modelPhase: context.adapter.snapshot().phase,
      rawFrameCount: initial.rawFrameCount,
    })
    context.samplingTask = sampleFrames(context).catch(error => {
      if (!owns(context) || context.stopping || context.abort.signal.aborted) return
      failCurrentSession(context, error)
    })
    return snapshot
  } catch (error) {
    return failCurrentSession(context, error)
  }
}

function assertCurrent(context: SessionContext): void {
  if (!owns(context) || context.cancelled) throw new DOMException('Capture cancelled', 'AbortError')
}

async function finishSession(context: SessionContext): Promise<XrV2SpatialCaptureSnapshot> {
  try {
    if (context.samplingTask) {
      await withXrV2Deadline(context.samplingTask, context.dependencies.operationTimeoutMs, 'XR frame sampler')
    }
    assertCurrent(context)
    const recorder = context.recorder
    if (!recorder || !context.sink || !context.capture || !context.store || !context.adapter) {
      throw new Error('Spatial capture session could not finalize')
    }
    if (recorder.state() !== 'inactive') {
      recorder.requestData()
      recorder.stop()
    }
    const rawClip = await withXrV2Deadline(recorder.stopped, context.dependencies.operationTimeoutMs, 'XR recorder finalization')
    assertCurrent(context)
    context.sink.setRawClip(rawClip)
    const result = await withXrV2Deadline(context.capture.complete(), context.dependencies.operationTimeoutMs, 'XR artifact finalization')
    assertCurrent(context)
    const metadata = createXrV2SpatialAssetMetadata({
      tier: result.synthesisMode === 'live' ? 'pseudo-ar-depth-parallax' : 'flat-fallback',
      synthesisMode: result.synthesisMode,
      depthMetadataRef: result.artifacts.depthMetadataRef,
      fallbackTriggered: result.snapshot.fallback !== null,
    })
    let postProcessJobId: string | null = null
    if (result.postProcessJob && result.snapshot.fallback) {
      const persisted = await withXrV2Deadline(createXrV2CaptureFallbackPersister({
        persistence: context.store,
      }).persist({
        idempotencyKey: context.persistence.fallback!.idempotencyKey,
        sessionId: result.sessionId,
        flatAssetId: context.persistence.spatialAssetId,
        jobId: result.postProcessJob.jobId,
        rawClipRef: result.artifacts.rawClipRef,
        rawClipMimeType: rawClip.type || 'video/webm',
        rawClipByteLength: rawClip.size,
        depthMetadataRef: result.artifacts.depthMetadataRef,
        queuedAtMs: context.dependencies.wallNow(),
        fallback: result.snapshot.fallback,
        admittedDepthModel: context.adapter.snapshot().phase === 'ready'
          ? XR_V2_DEPTH_MODEL_MANIFEST : null,
      }), context.dependencies.operationTimeoutMs, 'XR fallback persistence')
      postProcessJobId = persisted.bundle.queuedJob.jobId
    } else {
      const asset = createXrV2PublishedSpatialAsset({
        assetId: context.persistence.spatialAssetId,
        sessionId: result.sessionId,
        rawClipRef: result.artifacts.rawClipRef,
        metadata,
        createdAtMs: context.dependencies.wallNow(),
      })
      await withXrV2Deadline(
        context.store.putPublishedSpatialAsset(asset),
        context.dependencies.operationTimeoutMs,
        'XR asset metadata persistence',
      )
    }
    assertCurrent(context)
    const stored = await withXrV2Deadline(
      context.store.readPublishedSpatialAsset(context.persistence.spatialAssetId),
      context.dependencies.operationTimeoutMs,
      'XR asset metadata read-back',
    )
    verifyXrV2PublishedAsset(stored, metadata)
    assertCurrent(context)
    const playbackUrl = context.dependencies.createObjectUrl(rawClip)
    const modelPhase = context.adapter.snapshot().phase
    context.committed = true
    activeSession = null
    const saved = publish({
      phase: 'saved',
      message: result.synthesisMode === 'live'
        ? 'Spatial capture durably saved with live depth/DIBR evidence.'
        : 'Raw capture and exact metadata saved with one bounded post-process job.',
      rawFrameCount: result.snapshot.rawFrameCount,
      depthFrameCount: result.snapshot.depthFrameCount,
      synthesizedFrameCount: result.snapshot.synthesizedFrameCount,
      fallbackTriggered: result.snapshot.fallback !== null,
      modelPhase,
      assetMetadata: metadata,
      rawClipRef: result.artifacts.rawClipRef,
      depthMetadataRef: result.artifacts.depthMetadataRef,
      postProcessJobId,
      playbackUrl,
      error: null,
    })
    await cleanupSession(context, { compensate: false, waitForFinish: false })
    return saved
  } catch (error) {
    if (!owns(context)) return snapshot
    return failCurrentSession(context, error)
  }
}

export function stopXrV2SpatialCapture(): Promise<XrV2SpatialCaptureSnapshot> {
  const context = activeSession
  if (!context || (snapshot.phase !== 'capturing-live' && snapshot.phase !== 'capturing-raw')) {
    return Promise.resolve(snapshot)
  }
  if (context.finishTask) return context.finishTask
  context.stopping = true
  context.abort.abort()
  if (context.autoStopTimer !== null) clearTimeout(context.autoStopTimer)
  context.autoStopTimer = null
  publish({ phase: 'stopping', message: 'Stopping and durably committing the exact XR asset contract…' })
  context.finishTask = finishSession(context)
  return context.finishTask
}
export function cancelXrV2SpatialCapture(): Promise<void> {
  const context = activeSession
  generation += 1
  activeSession = null
  if (context) {
    context.cancelled = true
    context.abort.abort()
    if (context.autoStopTimer !== null) clearTimeout(context.autoStopTimer)
    context.autoStopTimer = null
  }
  if (snapshot.playbackUrl) dependencies.revokeObjectUrl(snapshot.playbackUrl)
  clearBoundPreview()
  snapshot = idleSnapshot()
  for (const listener of listeners) {
    try { listener() } catch { /* cancellation remains authoritative */ }
  }
  return context
    ? cleanupSession(context, { compensate: true, waitForFinish: true })
    : Promise.resolve()
}
export function readXrV2SpatialCapture(): XrV2SpatialCaptureSnapshot {
  return snapshot
}
export function subscribeXrV2SpatialCapture(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
