import type {
  XrV2CaptureSession,
} from './captureSession'
import { createXrV2CaptureSession } from './captureSession'
import type { XrV2CaptureSnapshot } from './captureContracts'
import {
  createXrV2CaptureFallbackPersister,
} from './spatialCapturePostProcess'
import {
  createXrV2RgbaStereoSynthesizer,
  type XrV2RgbaFrame,
} from './stereoSynthesis'
import {
  createXrV2CaptureArtifactSink,
  createXrV2IndexedDbArtifactStore,
  type XrV2CaptureArtifactSinkController,
  type XrV2CaptureArtifactStore,
} from './xrV2CaptureArtifactStore'
import {
  XR_V2_DEPTH_MODEL_MANIFEST,
  createXrV2LocalDepthInferenceAdapter,
  type XrV2LocalDepthInferenceAdapter,
} from './xrV2DepthInferenceRuntime'
import {
  createXrV2SpatialAssetMetadata,
  type XrV2SpatialAssetMetadata,
} from './xrV2SpatialAssetMetadata'
import { readXrV2WorkspaceReadiness } from './xrV2WorkspaceReadinessRuntime'

export const XR_V2_SPATIAL_CAPTURE_RUNTIME_SCHEMA =
  'knowgrph-xr-v2-spatial-capture-runtime/v1' as const
export const XR_V2_SPATIAL_CAPTURE_MAX_FRAMES = 24
export const XR_V2_SPATIAL_CAPTURE_MAX_DURATION_MS = 12_000
export const XR_V2_SPATIAL_CAPTURE_FRAME_BUDGET_MS = 100
export const XR_V2_SPATIAL_CAPTURE_CONSECUTIVE_BREACHES = 2

export type XrV2SpatialCaptureSnapshot = Readonly<{
  schema: typeof XR_V2_SPATIAL_CAPTURE_RUNTIME_SCHEMA
  phase:
    | 'idle'
    | 'preparing'
    | 'capturing-live'
    | 'capturing-raw'
    | 'stopping'
    | 'saved'
    | 'error'
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

const listeners = new Set<() => void>()
let configuredSource: XrV2SpatialCaptureSource | null = null
let snapshot: XrV2SpatialCaptureSnapshot = idleSnapshot()
let stream: MediaStream | null = null
let recorderHandle: XrV2RawClipRecorder | null = null
let artifactStore: XrV2CaptureArtifactStore | null = null
let artifactSink: XrV2CaptureArtifactSinkController | null = null
let depthAdapter: XrV2LocalDepthInferenceAdapter | null = null
let captureSession: XrV2CaptureSession<XrV2RgbaFrame> | null = null
let samplingTask: Promise<void> | null = null
let cancelTask: Promise<void> | null = null
let autoStopTimer: ReturnType<typeof setTimeout> | null = null
let samplingCancelled = false
let operationGeneration = 0
let boundVideo: HTMLVideoElement | null = null
let boundLeftPreview: HTMLCanvasElement | null = null
let boundRightPreview: HTMLCanvasElement | null = null
let samplingCanvas: HTMLCanvasElement | null = null
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
  for (const listener of listeners) listener()
  return snapshot
}

function errorMessage(error: unknown): string {
  return error instanceof Error && error.message.trim()
    ? error.message
    : String(error || 'XR spatial capture failed')
}

function sessionId(): string {
  const random = globalThis.crypto?.randomUUID?.().replaceAll('-', '')
    || `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`
  return `xr-v2-${random.slice(0, 64)}`
}

function drawFrame(canvas: HTMLCanvasElement | null, frame: XrV2RgbaFrame): void {
  if (!canvas) return
  canvas.width = frame.width
  canvas.height = frame.height
  const context = canvas.getContext('2d')
  if (!context) return
  context.putImageData(new ImageData(frame.data, frame.width, frame.height), 0, 0)
}

function attachBoundVideo(): void {
  if (!boundVideo) return
  if (boundVideo.srcObject !== stream) boundVideo.srcObject = stream
  boundVideo.muted = true
  boundVideo.playsInline = true
  if (stream) void boundVideo.play().catch(() => undefined)
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
  attachBoundVideo()
  if (lastLeftFrame) drawFrame(boundLeftPreview, lastLeftFrame)
  if (lastRightFrame) drawFrame(boundRightPreview, lastRightFrame)
}

export function configureXrV2SpatialCaptureSource(
  source: XrV2SpatialCaptureSource | null,
): void {
  sourceLifecycleCleanup?.()
  sourceLifecycleCleanup = null
  configuredSource = source
  if (source) {
    const tracks = source.stream.getVideoTracks()
    const ended = () => { void cancelXrV2SpatialCapture() }
    tracks.forEach(track => track.addEventListener('ended', ended))
    sourceLifecycleCleanup = () => tracks.forEach(track => track.removeEventListener('ended', ended))
  }
  if (source && boundVideo) {
    boundVideo.srcObject = source.stream
    void boundVideo.play().catch(() => undefined)
  }
  publish({ cameraSourceAvailable: source !== null })
}

function waitForVideoFrame(video: HTMLVideoElement): Promise<void> {
  if (video.readyState >= 2 && video.videoWidth > 0 && video.videoHeight > 0) {
    return Promise.resolve()
  }
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => finish(new Error('Camera preview did not become ready')), 5_000)
    const finish = (error?: Error) => {
      clearTimeout(timeout)
      video.removeEventListener('loadeddata', ready)
      video.removeEventListener('error', failed)
      if (error) reject(error)
      else resolve()
    }
    const ready = () => finish()
    const failed = () => finish(new Error('Camera preview failed to load'))
    video.addEventListener('loadeddata', ready, { once: true })
    video.addEventListener('error', failed, { once: true })
  })
}

function captureRgbaFrame(video: HTMLVideoElement): XrV2RgbaFrame {
  const width = Math.max(1, Math.min(320, video.videoWidth))
  const height = Math.max(1, Math.round(video.videoHeight * (width / video.videoWidth)))
  const canvas = samplingCanvas || document.createElement('canvas')
  samplingCanvas = canvas
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) throw new Error('Canvas 2D sampling is unavailable')
  context.drawImage(video, 0, 0, width, height)
  const image = context.getImageData(0, 0, width, height)
  return Object.freeze({ width, height, data: image.data.slice() })
}

function reflectCapture(capture: XrV2CaptureSnapshot): void {
  publish({
    phase: capture.phase === 'capturing-raw' ? 'capturing-raw' : 'capturing-live',
    message: capture.phase === 'capturing-raw'
      ? 'Frame budget fallback active; raw capture continues and post-process will queue on save.'
      : 'Live local depth + DIBR capture is running.',
    rawFrameCount: capture.rawFrameCount,
    depthFrameCount: capture.depthFrameCount,
    synthesizedFrameCount: capture.synthesizedFrameCount,
    fallbackTriggered: capture.fallback !== null,
    modelPhase: depthAdapter?.snapshot().phase || 'idle',
  })
}

async function sampleFrames(video: HTMLVideoElement): Promise<void> {
  await waitForVideoFrame(video)
  let frameIndex = 0
  while (!samplingCancelled && frameIndex < XR_V2_SPATIAL_CAPTURE_MAX_FRAMES) {
    const frame = captureRgbaFrame(video)
    const capture = captureSession
    if (!capture) return
    const state = await capture.processFrame({
      frameIndex,
      capturedAtMs: performance.now(),
      frame,
    })
    reflectCapture(state)
    frameIndex += 1
    if (!samplingCancelled && frameIndex < XR_V2_SPATIAL_CAPTURE_MAX_FRAMES) {
      await new Promise(resolve => setTimeout(resolve, 100))
    }
  }
  if (!samplingCancelled) queueMicrotask(() => { void stopXrV2SpatialCapture() })
}

function releaseCaptureStreamReference(): void {
  stream = null
  if (boundVideo) boundVideo.srcObject = null
}

async function disposeResources(closeStore: boolean): Promise<void> {
  if (autoStopTimer !== null) clearTimeout(autoStopTimer)
  autoStopTimer = null
  releaseCaptureStreamReference()
  await depthAdapter?.dispose().catch(() => undefined)
  depthAdapter = null
  captureSession = null
  artifactSink = null
  if (closeStore) artifactStore?.close()
  artifactStore = null
  recorderHandle = null
  samplingTask = null
  samplingCanvas = null
}

export async function startXrV2SpatialCapture(): Promise<XrV2SpatialCaptureSnapshot> {
  if (snapshot.phase === 'preparing'
    || snapshot.phase === 'capturing-live'
    || snapshot.phase === 'capturing-raw'
    || snapshot.phase === 'stopping') return snapshot
  if (!readXrV2WorkspaceReadiness().canOfferUserActions) {
    return publish({ phase: 'error', message: 'Capability detection must finish before capture.', error: 'capability-tier-pending' })
  }
  const source = configuredSource
  if (typeof document === 'undefined' || !globalThis.indexedDB || !source) {
    return publish({ phase: 'error', message: 'Start the canonical pose camera before XR spatial capture.', error: 'canonical-camera-unavailable' })
  }
  const generation = ++operationGeneration
  if (snapshot.playbackUrl) URL.revokeObjectURL(snapshot.playbackUrl)
  snapshot = idleSnapshot()
  publish({
    phase: 'preparing',
    message: 'Preparing the already-authorized canonical camera for XR spatial capture…',
    cameraPermissionRequested: false,
  })
  try {
    const video = source.video
    const acquired = source.stream
    if (acquired.getVideoTracks().every(track => track.readyState !== 'live')) {
      throw new Error('Canonical camera owner did not expose a live preview stream')
    }
    if (generation !== operationGeneration) {
      return snapshot
    }
    stream = acquired
    attachBoundVideo()
    video.muted = true
    video.playsInline = true
    await video.play()
    if (generation !== operationGeneration) return snapshot

    const id = sessionId()
    artifactStore = createXrV2IndexedDbArtifactStore()
    artifactSink = createXrV2CaptureArtifactSink({
      sessionId: id, store: artifactStore, maxFrames: XR_V2_SPATIAL_CAPTURE_MAX_FRAMES,
    })
    depthAdapter = createXrV2LocalDepthInferenceAdapter()
    await depthAdapter.prepare()
    if (generation !== operationGeneration) return snapshot
    captureSession = createXrV2CaptureSession({
      sessionId: id,
      configuration: {
        frameBudgetMs: XR_V2_SPATIAL_CAPTURE_FRAME_BUDGET_MS,
        consecutiveBudgetBreaches: XR_V2_SPATIAL_CAPTURE_CONSECUTIVE_BREACHES,
        maxFrames: XR_V2_SPATIAL_CAPTURE_MAX_FRAMES,
      },
      depthEstimator: depthAdapter,
      stereoSynthesizer: createXrV2RgbaStereoSynthesizer({ maxDisparityPixels: 8 }),
      artifactSink,
      clock: { now: () => performance.now() },
      onStereoPair: pair => {
        lastLeftFrame = pair.left
        lastRightFrame = pair.right
        drawFrame(boundLeftPreview, pair.left)
        drawFrame(boundRightPreview, pair.right)
      },
    })
    recorderHandle = source.createRecorder(acquired)
    const initial = captureSession.start()
    samplingCancelled = false
    publish({
      phase: 'capturing-live',
      message: 'Live local depth + DIBR capture is starting.',
      sessionId: id,
      modelPhase: depthAdapter.snapshot().phase,
      rawFrameCount: initial.rawFrameCount,
    })
    samplingTask = sampleFrames(video).catch(async error => {
      if (samplingCancelled) return
      samplingCancelled = true
      const reason = errorMessage(error)
      const failedRecorder = recorderHandle
      if (failedRecorder?.state() !== 'inactive') {
        void failedRecorder.stopped.catch(() => undefined)
        try { failedRecorder.stop() } catch { /* recorder already ended */ }
      }
      await disposeResources(true)
      publish({ phase: 'error', message: reason, error: reason })
    })
    autoStopTimer = setTimeout(() => { void stopXrV2SpatialCapture() }, XR_V2_SPATIAL_CAPTURE_MAX_DURATION_MS)
    return snapshot
  } catch (error) {
    await disposeResources(true)
    if (generation !== operationGeneration) return snapshot
    const reason = errorMessage(error)
    return publish({ phase: 'error', message: reason, error: reason })
  }
}

export async function stopXrV2SpatialCapture(): Promise<XrV2SpatialCaptureSnapshot> {
  if (snapshot.phase !== 'capturing-live' && snapshot.phase !== 'capturing-raw') return snapshot
  publish({ phase: 'stopping', message: 'Stopping, saving raw frames, and finalizing the asset contract…' })
  samplingCancelled = true
  if (autoStopTimer !== null) clearTimeout(autoStopTimer)
  autoStopTimer = null
  try {
    await samplingTask
    const recorder = recorderHandle
    if (!recorder) throw new Error('Spatial capture recorder is unavailable')
    if (recorder.state() !== 'inactive') {
      recorder.requestData()
      recorder.stop()
    }
    const rawClip = await recorder.stopped
    artifactSink?.setRawClip(rawClip)
    const result = await captureSession?.complete()
    if (!result || !artifactStore || !depthAdapter) throw new Error('Spatial capture session could not finalize')
    let postProcessJobId: string | null = null
    if (result.postProcessJob && result.snapshot.fallback) {
      const persister = createXrV2CaptureFallbackPersister({ persistence: artifactStore })
      const persisted = await persister.persist({
        idempotencyKey: `${result.sessionId}:fallback`,
        sessionId: result.sessionId,
        flatAssetId: `${result.sessionId}:asset`,
        jobId: result.postProcessJob.jobId,
        rawClipRef: result.artifacts.rawClipRef,
        rawClipMimeType: rawClip.type || 'video/webm',
        rawClipByteLength: rawClip.size,
        depthMetadataRef: result.artifacts.depthMetadataRef,
        queuedAtMs: Math.max(0, Math.round(result.postProcessJob.queuedAtMs)),
        fallback: result.snapshot.fallback,
        admittedDepthModel: depthAdapter.snapshot().phase === 'ready'
          ? XR_V2_DEPTH_MODEL_MANIFEST
          : null,
      })
      postProcessJobId = persisted.bundle.queuedJob.jobId
    }
    const metadata = createXrV2SpatialAssetMetadata({
      tier: result.synthesisMode === 'live' ? 'pseudo-ar-depth-parallax' : 'flat-fallback',
      synthesisMode: result.synthesisMode,
      depthMetadataRef: result.artifacts.depthMetadataRef,
      fallbackTriggered: result.snapshot.fallback !== null,
    })
    const playbackUrl = URL.createObjectURL(rawClip)
    const saved = publish({
      phase: 'saved',
      message: result.synthesisMode === 'live'
        ? 'Spatial capture saved with live depth/DIBR evidence.'
        : 'Raw capture saved atomically with a bounded post-process job.',
      rawFrameCount: result.snapshot.rawFrameCount,
      depthFrameCount: result.snapshot.depthFrameCount,
      synthesizedFrameCount: result.snapshot.synthesizedFrameCount,
      fallbackTriggered: result.snapshot.fallback !== null,
      modelPhase: depthAdapter.snapshot().phase,
      assetMetadata: metadata,
      rawClipRef: result.artifacts.rawClipRef,
      depthMetadataRef: result.artifacts.depthMetadataRef,
      postProcessJobId,
      playbackUrl,
      error: null,
    })
    await disposeResources(true)
    return saved
  } catch (error) {
    const reason = errorMessage(error)
    await disposeResources(true)
    return publish({ phase: 'error', message: reason, error: reason })
  }
}

export function cancelXrV2SpatialCapture(): Promise<void> {
  if (cancelTask) return cancelTask
  const operation = (async () => {
    operationGeneration += 1
    samplingCancelled = true
    if (autoStopTimer !== null) clearTimeout(autoStopTimer)
    autoStopTimer = null
    const pendingSampling = samplingTask
    if (pendingSampling) await pendingSampling.catch(() => undefined)
    const recorder = recorderHandle
    if (recorder?.state() !== 'inactive') {
      void recorder.stopped.catch(() => undefined)
      try { recorder.stop() } catch { /* recorder already ended */ }
    }
    if (recorder) await recorder.stopped.catch(() => undefined)
    await disposeResources(true)
    sourceLifecycleCleanup?.()
    sourceLifecycleCleanup = null
    if (snapshot.playbackUrl) URL.revokeObjectURL(snapshot.playbackUrl)
    snapshot = idleSnapshot()
    for (const listener of listeners) listener()
  })()
  cancelTask = operation
  return operation.finally(() => {
    if (cancelTask === operation) cancelTask = null
  })
}

export function readXrV2SpatialCapture(): XrV2SpatialCaptureSnapshot {
  return snapshot
}

export function subscribeXrV2SpatialCapture(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
