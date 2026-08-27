import type { CompiledModel, Tensor } from '@litertjs/core'
import {
  MOTION_CONTROL_INPUT_SIZE,
  MOTION_CONTROL_LANDMARK_COUNT,
  MOTION_CONTROL_MIN_CONFIDENCE,
  MOTION_CONTROL_SCHEMA,
  motionControlLiteRtWasmUrl,
  motionControlPoseModelUrl,
} from './motionControlConfig'
import {
  resetMotionControlCalibration,
  resolveMotionControlTrackingBoundingBox,
  smoothMotionControlPose,
  type MotionControlBoundingBox,
  type MotionControlLandmark,
  type MotionControlPoseFrame,
} from './motionControlPose'
import { recordMotionControlCaptureMissingSample, recordMotionControlCapturePose, startMotionControlCapturePlatformSource, stopMotionControlCapturePlatformSource } from './motionControlCapturePlatformBridge'
import { hasLiveMotionControlVideoTrack as hasLiveVideoTrack, releaseMotionControlCapture as releaseCapture } from './motionControlCaptureResources'
import { clamp01, shapeElements, shapeMatches, sigmoid, valuesAreFinite } from './motionControlRuntimeNumbers'
import { beginMotionCapturePlatformTeardown } from './motionCaptureLifecycleGate'
import { MOTION_CONTROL_START_CANCELLED, waitForMotionControlStart } from './motionControlStartCancellation'
import { motionControlCaptureSurfaceCurrentlyOpen, MOTION_CONTROL_XR_SURFACE_REQUIRED_MESSAGE } from './motionControlSurfaceRuntime'
import { buildMotionControlRuntimeInspection, INITIAL_MOTION_CONTROL_SNAPSHOT } from './motionControlRuntimeSnapshot'
export type MotionControlBackendPreference = 'auto' | 'webgpu' | 'wasm'
export type MotionControlEffectiveBackend = 'webgpu' | 'webgpu+wasm' | 'wasm' | 'none'
export type MotionControlPhase = 'off' | 'requesting-camera' | 'loading-model' | 'running' | 'error'
export type MotionControlPermission = 'unknown' | 'prompting' | 'granted' | 'denied'
export type MotionControlSnapshot = Readonly<{
  schema: typeof MOTION_CONTROL_SCHEMA
  phase: MotionControlPhase
  requestedBackend: MotionControlBackendPreference
  effectiveBackend: MotionControlEffectiveBackend
  fullyAccelerated: boolean
  cameraActive: boolean
  permission: MotionControlPermission
  modelId: string
  message: string
  fallbackReason: string
  confidence: number
  latencyMs: number
  framesPerSecond: number
  pose: MotionControlPoseFrame | null
  boundingBoxEnabled: boolean
  boundingBox: MotionControlBoundingBox | null
  revision: number
}>
type RuntimeRoi = { x: number; y: number; size: number }
type LiteRtModule = typeof import('@litertjs/core')
const listeners = new Set<() => void>()
const processingCanvas = typeof document === 'undefined' ? null : document.createElement('canvas')
if (processingCanvas) {
  processingCanvas.width = MOTION_CONTROL_INPUT_SIZE
  processingCanvas.height = MOTION_CONTROL_INPUT_SIZE
}
let snapshot: MotionControlSnapshot = INITIAL_MOTION_CONTROL_SNAPSHOT
let activeGeneration = 0
let animationFrameId: number | null = null
let cameraStream: MediaStream | null = null
let captureVideo: HTMLVideoElement | null = null
let compiledModel: CompiledModel | null = null
let inferencePromise: Promise<void> | null = null
let liteRtLoadPromise: Promise<LiteRtModule> | null = null
let stopPromise: Promise<MotionControlSnapshot> | null = null
let activeStartAbortController: AbortController | null = null
let controlIntentRevision = 0
let pendingReleaseRegisteredSources = false
let trackLifecycleCleanup: (() => void) | null = null
let roi: RuntimeRoi = { x: 0, y: 0, size: 1 }
let previousInferenceAt = 0
let lostFrameCount = 0
const MOTION_CONTROL_PAGE_HIDDEN_MESSAGE = 'Capture stopped because the page is no longer visible.'

function publish(update: Partial<Omit<MotionControlSnapshot, 'schema' | 'revision'>>): void {
  snapshot = Object.freeze({ ...snapshot, ...update, revision: snapshot.revision + 1 })
  for (const listener of listeners) {
    try {
      listener()
    } catch (error) {
      console.error('[agenticgraph] motion control listener failed', error)
    }
  }
}

export function readMotionControlSnapshot(): MotionControlSnapshot {
  return snapshot
}

export function subscribeMotionControl(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function setMotionControlBoundingBoxEnabled(enabled: boolean): MotionControlSnapshot {
  if (snapshot.boundingBoxEnabled === enabled) return snapshot
  publish({ boundingBoxEnabled: enabled })
  return snapshot
}

export function bindMotionControlPreview(video: HTMLVideoElement | null): () => void {
  if (!video) return () => void 0
  const boundStream = cameraStream
  video.muted = true
  video.playsInline = true
  video.autoplay = true
  video.srcObject = boundStream
  if (boundStream) void video.play().catch(() => void 0)
  return () => {
    if (video.srcObject !== boundStream) return
    video.pause()
    video.srcObject = null
  }
}

function removeTrackLifecycleStops(): void {
  const cleanup = trackLifecycleCleanup
  trackLifecycleCleanup = null
  cleanup?.()
}

function stopCamera(): void {
  const stream = cameraStream
  const video = captureVideo
  cameraStream = null
  captureVideo = null
  removeTrackLifecycleStops()
  releaseCapture(stream, video)
}

function abandonRequestedCapture(stream: MediaStream | null, video: HTMLVideoElement | null): void {
  if (cameraStream === stream) {
    cameraStream = null
    removeTrackLifecycleStops()
  }
  if (captureVideo === video) captureVideo = null
  releaseCapture(stream, video)
}

function removeLifecycleStops(): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return
  window.removeEventListener('pagehide', stopForPageLifecycle)
  document.removeEventListener('visibilitychange', stopForPageLifecycle)
}

function stopForPageLifecycle(event: Event): void {
  if (event.type === 'visibilitychange' && typeof document !== 'undefined' && document.visibilityState === 'visible') return
  void stopMotionControl(MOTION_CONTROL_PAGE_HIDDEN_MESSAGE)
}

function installLifecycleStops(): void {
  removeLifecycleStops()
  if (typeof window === 'undefined' || typeof document === 'undefined') return
  window.addEventListener('pagehide', stopForPageLifecycle)
  document.addEventListener('visibilitychange', stopForPageLifecycle)
}

function captureCanContinue(generation: number): boolean {
  return generation === activeGeneration
    && (typeof document === 'undefined' || document.visibilityState !== 'hidden')
}

function stopForCaptureLoss(generation: number): void {
  if (generation !== activeGeneration) return
  const message = 'Motion Control stopped because camera access ended.'
  void stopMotionControl(message).then(() => {
    if (snapshot.phase !== 'off' || snapshot.message !== message) return
    publish({ phase: 'error', message, pose: null, confidence: 0 })
  })
}

function installTrackLifecycleStops(stream: MediaStream, generation: number): void {
  removeTrackLifecycleStops()
  const tracks = stream.getVideoTracks()
  const onEnded = () => stopForCaptureLoss(generation)
  tracks.forEach(track => track.addEventListener('ended', onEnded))
  trackLifecycleCleanup = () => tracks.forEach(track => track.removeEventListener('ended', onEnded))
}

export async function loadMotionControlLiteRt(): Promise<LiteRtModule> {
  if (liteRtLoadPromise) return liteRtLoadPromise
  liteRtLoadPromise = import('@litertjs/core').then(async module => {
    const jspi = await module.supportsFeature('jspi').catch(() => false)
    await module.loadLiteRt(motionControlLiteRtWasmUrl(), { jspi })
    return module
  }).catch(error => {
    liteRtLoadPromise = null
    throw error
  })
  return liteRtLoadPromise
}

export async function compileMotionControlPoseModel(preference: MotionControlBackendPreference): Promise<{
  model: CompiledModel
  effectiveBackend: Exclude<MotionControlEffectiveBackend, 'none'>
  fallbackReason: string
}> {
  const liteRt = await loadMotionControlLiteRt()
  const canUseWebGpu = liteRt.isWebGPUSupported()
  const requested = preference === 'wasm' ? 'wasm' : preference === 'webgpu' || canUseWebGpu ? 'webgpu' : 'wasm'
  if (requested === 'wasm') {
    return { model: await liteRt.loadAndCompile(motionControlPoseModelUrl(), { accelerator: 'wasm' }), effectiveBackend: 'wasm', fallbackReason: preference === 'auto' && !canUseWebGpu ? 'WebGPU is unavailable; using Wasm CPU.' : '' }
  }
  try {
    const model = await liteRt.loadAndCompile(motionControlPoseModelUrl(), { accelerator: 'webgpu' })
    if (model.options.accelerator === 'wasm') {
      return {
        model,
        effectiveBackend: 'wasm',
        fallbackReason: 'LiteRT.js could not fully delegate this model to WebGPU in this browser; using Wasm CPU.',
      }
    }
    if (!model.isFullyAccelerated) {
      return {
        model,
        effectiveBackend: 'webgpu+wasm',
        fallbackReason: 'Some model operators are running through LiteRT.js Wasm fallback.',
      }
    }
    return { model, effectiveBackend: 'webgpu', fallbackReason: '' }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return {
      model: await liteRt.loadAndCompile(motionControlPoseModelUrl(), { accelerator: 'wasm' }),
      effectiveBackend: 'wasm',
      fallbackReason: `WebGPU compilation failed; using Wasm CPU. ${message}`.trim(),
    }
  }
}

export function validateMotionControlPoseModel(model: CompiledModel): void {
  const inputs = model.getInputDetails()
  const outputs = model.getOutputDetails()
  const expectedInputElements = MOTION_CONTROL_INPUT_SIZE * MOTION_CONTROL_INPUT_SIZE * 3
  if (inputs.length !== 1 || inputs[0]?.dtype !== 'float32' || !shapeMatches(inputs[0], [1, MOTION_CONTROL_INPUT_SIZE, MOTION_CONTROL_INPUT_SIZE, 3]) || shapeElements(inputs[0]) !== expectedInputElements) {
    throw new Error('The pose model does not expose the expected float32 256x256 RGB input.')
  }
  const requiredShapes = [[1, 195], [1, 117], [1, 1]] as const
  if (requiredShapes.some(shape => !outputs.some(output => output.dtype === 'float32' && shapeMatches(output, shape)))) {
    throw new Error('The pose model does not expose the expected landmark, world-landmark, and confidence tensors.')
  }
}

function pixelsForCurrentRoi(video: HTMLVideoElement): Float32Array | null {
  const context = processingCanvas?.getContext('2d', { willReadFrequently: true })
  if (!context || video.videoWidth <= 0 || video.videoHeight <= 0) return null
  const baseSize = Math.min(video.videoWidth, video.videoHeight)
  const baseX = (video.videoWidth - baseSize) / 2
  const baseY = (video.videoHeight - baseSize) / 2
  const sourceSize = roi.size * baseSize
  context.drawImage(
    video,
    baseX + roi.x * baseSize,
    baseY + roi.y * baseSize,
    sourceSize,
    sourceSize,
    0,
    0,
    MOTION_CONTROL_INPUT_SIZE,
    MOTION_CONTROL_INPUT_SIZE,
  )
  const rgba = context.getImageData(0, 0, MOTION_CONTROL_INPUT_SIZE, MOTION_CONTROL_INPUT_SIZE).data
  const rgb = new Float32Array(MOTION_CONTROL_INPUT_SIZE * MOTION_CONTROL_INPUT_SIZE * 3)
  for (let source = 0, target = 0; source < rgba.length; source += 4) {
    rgb[target++] = rgba[source]! / 255
    rgb[target++] = rgba[source + 1]! / 255
    rgb[target++] = rgba[source + 2]! / 255
  }
  return rgb
}

function tensorValues(tensor: Tensor): Promise<Float32Array> {
  return tensor.data().then(data => data instanceof Float32Array ? data : new Float32Array(data.buffer, data.byteOffset, data.byteLength / 4))
}

function landmarkFromModel(values: Float32Array, index: number, currentRoi: RuntimeRoi): MotionControlLandmark {
  const offset = index * 5
  return Object.freeze({
    x: clamp01(currentRoi.x + (values[offset]! / MOTION_CONTROL_INPUT_SIZE) * currentRoi.size),
    y: clamp01(currentRoi.y + (values[offset + 1]! / MOTION_CONTROL_INPUT_SIZE) * currentRoi.size),
    z: (values[offset + 2]! / MOTION_CONTROL_INPUT_SIZE) * currentRoi.size,
    visibility: sigmoid(values[offset + 3]!),
    presence: sigmoid(values[offset + 4]!),
  })
}

function worldLandmarkFromModel(values: Float32Array, index: number): MotionControlLandmark {
  const offset = index * 3
  return Object.freeze({
    x: values[offset] || 0,
    y: values[offset + 1] || 0,
    z: values[offset + 2] || 0,
    visibility: 1,
    presence: 1,
  })
}

async function inferPose(generation: number): Promise<void> {
  const model = compiledModel
  const video = captureVideo
  if (!model || !video || generation !== activeGeneration) return
  const captureTimestampMs = performance.now()
  const inputValues = pixelsForCurrentRoi(video)
  if (!inputValues) return
  const currentRoi = { ...roi }
  const liteRt = await loadMotionControlLiteRt()
  const input = new liteRt.Tensor(inputValues, [1, MOTION_CONTROL_INPUT_SIZE, MOTION_CONTROL_INPUT_SIZE, 3])
  let outputs: Tensor[] = []
  const startedAt = performance.now()
  try {
    outputs = await model.run(input) as Tensor[]
    const details = model.getOutputDetails()
    const landmarkIndex = details.findIndex(item => shapeMatches(item, [1, 195]))
    const worldIndex = details.findIndex(item => shapeMatches(item, [1, 117]))
    const confidenceIndex = details.findIndex(item => shapeMatches(item, [1, 1]))
    const [landmarkValues, worldValues, confidenceValues] = await Promise.all([
      tensorValues(outputs[landmarkIndex]!),
      tensorValues(outputs[worldIndex]!),
      tensorValues(outputs[confidenceIndex]!),
    ])
    if (generation !== activeGeneration) return
    if (!valuesAreFinite(landmarkValues) || !valuesAreFinite(worldValues) || !valuesAreFinite(confidenceValues)) {
      throw new Error('The pose model returned non-finite tensor values.')
    }
    const poseConfidence = clamp01(confidenceValues[0] || 0)
    const landmarks = Object.freeze(Array.from({ length: MOTION_CONTROL_LANDMARK_COUNT }, (_, index) => landmarkFromModel(landmarkValues, index, currentRoi)))
    const worldLandmarks = Object.freeze(Array.from({ length: MOTION_CONTROL_LANDMARK_COUNT }, (_, index) => worldLandmarkFromModel(worldValues, index)))
    const visibleConfidence = landmarks.reduce((sum, landmark) => sum + Math.min(landmark.visibility, landmark.presence), 0) / landmarks.length
    const confidence = Math.min(poseConfidence, visibleConfidence)
    const now = performance.now()
    const latencyMs = now - startedAt
    const instantaneousFps = previousInferenceAt > 0 ? 1000 / Math.max(1, now - previousInferenceAt) : 0
    previousInferenceAt = now
    if (confidence < MOTION_CONTROL_MIN_CONFIDENCE) {
      lostFrameCount += 1
      if (lostFrameCount >= 4) roi = { x: 0, y: 0, size: 1 }
      recordMotionControlCaptureMissingSample(captureTimestampMs, confidence)
      publish({
        confidence,
        latencyMs,
        framesPerSecond: snapshot.framesPerSecond ? snapshot.framesPerSecond * 0.72 + instantaneousFps * 0.28 : instantaneousFps,
        pose: null,
        boundingBox: null,
        message: 'Looking for one centered, full-body pose.',
      })
      return
    }
    lostFrameCount = 0
    const boundingBox = resolveMotionControlTrackingBoundingBox(landmarks)
    if (boundingBox) roi = { x: boundingBox.x, y: boundingBox.y, size: boundingBox.width }
    const nextPose = smoothMotionControlPose(snapshot.pose, Object.freeze({ timestampMs: now, confidence, landmarks, worldLandmarks }))
    recordMotionControlCapturePose(nextPose, captureTimestampMs)
    publish({
      confidence,
      latencyMs,
      framesPerSecond: snapshot.framesPerSecond ? snapshot.framesPerSecond * 0.72 + instantaneousFps * 0.28 : instantaneousFps,
      pose: nextPose,
      boundingBox,
      message: 'Tracking one local pose.',
    })
  } finally {
    input.delete()
    outputs.forEach(output => output?.delete())
  }
}

function scheduleInference(generation: number): void {
  if (typeof window === 'undefined' || generation !== activeGeneration || snapshot.phase !== 'running') return
  if (!hasLiveVideoTrack(cameraStream)) {
    stopForCaptureLoss(generation)
    return
  }
  animationFrameId = window.requestAnimationFrame(() => {
    if (!hasLiveVideoTrack(cameraStream)) {
      stopForCaptureLoss(generation)
      return
    }
    const runPromise = inferPose(generation)
      .catch(error => {
        if (generation !== activeGeneration) return
        const message = error instanceof Error ? error.message : String(error)
        const stopMessage = 'Motion Control stopped after a pose inference error.'
        queueMicrotask(() => {
          if (generation !== activeGeneration) return
          void stopMotionControl(stopMessage).then(() => {
            if (snapshot.phase !== 'off' || snapshot.message !== stopMessage) return
            publish({ phase: 'error', message: `Pose inference failed: ${message}`, pose: null, boundingBox: null, confidence: 0 })
          })
        })
      })
      .finally(() => {
        if (inferencePromise === runPromise) inferencePromise = null
        if (generation === activeGeneration && snapshot.phase === 'running') scheduleInference(generation)
      })
    inferencePromise = runPromise
  })
}

export async function startMotionControl(preference: MotionControlBackendPreference = 'auto'): Promise<MotionControlSnapshot> {
  if (snapshot.phase === 'running' && snapshot.requestedBackend === preference) return snapshot
  const startIntent = ++controlIntentRevision
  await stopMotionControl('Restarting Motion Control.', false)
  if (startIntent !== controlIntentRevision) return snapshot
  if (!motionControlCaptureSurfaceCurrentlyOpen()) {
    publish({ phase: 'error', requestedBackend: preference, message: MOTION_CONTROL_XR_SURFACE_REQUIRED_MESSAGE })
    return snapshot
  }
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia || typeof document === 'undefined') {
    publish({ phase: 'error', requestedBackend: preference, message: 'Camera capture is unavailable in this browser.' })
    return snapshot
  }
  const startAbortController = new AbortController()
  activeStartAbortController = startAbortController
  const generation = ++activeGeneration
  resetMotionControlCalibration()
  installLifecycleStops()
  if (!captureCanContinue(generation)) {
    removeLifecycleStops()
    publish({ phase: 'error', requestedBackend: preference, message: 'Motion Control cannot start while the page is hidden.' })
    return snapshot
  }
  let requestedStream: MediaStream | null = null
  let requestedVideo: HTMLVideoElement | null = null
  let compiledCandidate: CompiledModel | null = null
  publish({ phase: 'requesting-camera', requestedBackend: preference, permission: 'prompting', message: 'Waiting for camera permission.', fallbackReason: '', pose: null, boundingBox: null })
  try {
    const cameraRequest = navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
    })
    const cameraResult = await waitForMotionControlStart(cameraRequest, startAbortController.signal)
    if (cameraResult === MOTION_CONTROL_START_CANCELLED) {
      void cameraRequest.then(stream => releaseCapture(stream, null), () => undefined)
      return snapshot
    }
    requestedStream = cameraResult
    if (!captureCanContinue(generation)) {
      releaseCapture(requestedStream, null)
      return generation === activeGeneration ? stopMotionControl(MOTION_CONTROL_PAGE_HIDDEN_MESSAGE) : snapshot
    }
    if (!hasLiveVideoTrack(requestedStream)) throw new Error('The selected camera did not provide a live video track.')
    cameraStream = requestedStream
    installTrackLifecycleStops(requestedStream, generation)
    requestedVideo = document.createElement('video')
    captureVideo = requestedVideo
    requestedVideo.muted = true
    requestedVideo.playsInline = true
    requestedVideo.srcObject = requestedStream
    if (await waitForMotionControlStart(requestedVideo.play(), startAbortController.signal) === MOTION_CONTROL_START_CANCELLED) {
      abandonRequestedCapture(requestedStream, requestedVideo)
      return snapshot
    }
    if (!captureCanContinue(generation)) {
      abandonRequestedCapture(requestedStream, requestedVideo)
      return generation === activeGeneration ? stopMotionControl(MOTION_CONTROL_PAGE_HIDDEN_MESSAGE) : snapshot
    }
    if (!hasLiveVideoTrack(requestedStream)) {
      stopForCaptureLoss(generation)
      return snapshot
    }
    const captureSettings = requestedStream.getVideoTracks()[0]?.getSettings()
    if (!startMotionControlCapturePlatformSource({ width: requestedVideo.videoWidth, height: requestedVideo.videoHeight, nominalFps: captureSettings?.frameRate })) throw new Error('Canonical motion capture source registration failed.')
    publish({ phase: 'loading-model', cameraActive: true, permission: 'granted', message: 'Loading the official Google pose model with LiteRT.js.' })
    const compileRequest = compileMotionControlPoseModel(preference)
    const compileResult = await waitForMotionControlStart(compileRequest, startAbortController.signal)
    if (compileResult === MOTION_CONTROL_START_CANCELLED) {
      void compileRequest.then(compiled => compiled.model.delete(), () => undefined)
      abandonRequestedCapture(requestedStream, requestedVideo)
      return snapshot
    }
    const compiled = compileResult
    compiledCandidate = compiled.model
    if (!captureCanContinue(generation)) {
      compiledCandidate.delete()
      compiledCandidate = null
      abandonRequestedCapture(requestedStream, requestedVideo)
      return generation === activeGeneration ? stopMotionControl(MOTION_CONTROL_PAGE_HIDDEN_MESSAGE) : snapshot
    }
    if (!hasLiveVideoTrack(requestedStream)) {
      compiledCandidate.delete()
      compiledCandidate = null
      stopForCaptureLoss(generation)
      return snapshot
    }
    validateMotionControlPoseModel(compiledCandidate)
    compiledModel = compiledCandidate
    compiledCandidate = null
    roi = { x: 0, y: 0, size: 1 }
    lostFrameCount = 0
    previousInferenceAt = 0
    publish({
      phase: 'running',
      effectiveBackend: compiled.effectiveBackend,
      fullyAccelerated: compiled.effectiveBackend === 'webgpu' && compiledModel.isFullyAccelerated,
      fallbackReason: compiled.fallbackReason,
      cameraActive: true,
      message: 'Camera ready. Center one full body in the frame.',
    })
    scheduleInference(generation)
  } catch (error) {
    if (generation !== activeGeneration) {
      compiledCandidate?.delete()
      abandonRequestedCapture(requestedStream, requestedVideo)
      return snapshot
    }
    const message = error instanceof Error ? error.message : String(error)
    const denied = typeof DOMException !== 'undefined'
      && error instanceof DOMException
      && (error.name === 'NotAllowedError' || error.name === 'SecurityError')
    removeLifecycleStops()
    if (activeStartAbortController === startAbortController) activeStartAbortController = null
    stopCamera()
    stopMotionControlCapturePlatformSource()
    compiledCandidate?.delete()
    resetMotionControlCalibration()
    publish({
      phase: 'error',
      cameraActive: false,
      permission: denied ? 'denied' : snapshot.permission === 'prompting' ? 'unknown' : snapshot.permission,
      effectiveBackend: 'none',
      fullyAccelerated: false,
      message: `Motion Control could not start: ${message}`,
      pose: null,
      boundingBox: null,
    })
  }
  return snapshot
}
export async function stopMotionControl(message = 'Motion Control is off.', releaseRegisteredSources = true): Promise<MotionControlSnapshot> {
  const finishPlatformTeardown = releaseRegisteredSources ? beginMotionCapturePlatformTeardown() : null
  if (releaseRegisteredSources) controlIntentRevision += 1
  pendingReleaseRegisteredSources ||= releaseRegisteredSources
  if (stopPromise) {
    const pendingStop = stopPromise
    if (!releaseRegisteredSources) return pendingStop
    return pendingStop.then(() => {
      stopMotionControlCapturePlatformSource({ releaseRegisteredSources: true })
      if (snapshot.phase !== 'off' || snapshot.message !== message) publish({ phase: 'off', cameraActive: false, message })
      return snapshot
    }).finally(() => finishPlatformTeardown?.())
  }
  const operation = (async (): Promise<MotionControlSnapshot> => {
    activeStartAbortController?.abort()
    activeStartAbortController = null
    activeGeneration += 1
    if (animationFrameId !== null && typeof window !== 'undefined') window.cancelAnimationFrame(animationFrameId)
    animationFrameId = null
    removeLifecycleStops()
    stopCamera()
    stopMotionControlCapturePlatformSource({ releaseRegisteredSources: pendingReleaseRegisteredSources })
    const model = compiledModel
    compiledModel = null
    resetMotionControlCalibration()
    roi = { x: 0, y: 0, size: 1 }
    lostFrameCount = 0
    publish({
      phase: 'off',
      effectiveBackend: 'none',
      fullyAccelerated: false,
      cameraActive: false,
      permission: snapshot.permission === 'prompting' ? 'unknown' : snapshot.permission,
      message,
      fallbackReason: '',
      confidence: 0,
      latencyMs: 0,
      framesPerSecond: 0,
      pose: null,
      boundingBox: null,
    })
    const pendingInference = inferencePromise
    inferencePromise = null
    if (pendingInference) void pendingInference.catch(() => undefined).finally(() => model?.delete())
    else model?.delete()
    await Promise.resolve()
    stopMotionControlCapturePlatformSource({ releaseRegisteredSources: pendingReleaseRegisteredSources })
    return snapshot
  })()
  stopPromise = operation
  try {
    return await operation
  } finally {
    if (stopPromise === operation) {
      stopPromise = null
      pendingReleaseRegisteredSources = false
    }
    finishPlatformTeardown?.()
  }
}
export function inspectMotionControlRuntime() {
  return buildMotionControlRuntimeInspection(snapshot)
}
