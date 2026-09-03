import type { XrV2StoredCaptureFrame } from './xrV2CaptureArtifactStore'
import type { XrV2SavedSpatialAssetResource } from './xrV2SavedAssetCatalog'

export const XR_V2_TEMPORAL_PLAYBACK_MAX_FRAMES = 180
export const XR_V2_TEMPORAL_CAPTURE_MAX_SPAN_MS = 12_000
export const XR_V2_TEMPORAL_PLAYBACK_MAX_TERMINAL_FRAME_MS = 1_000
export const XR_V2_TEMPORAL_PLAYBACK_MAX_DURATION_MS =
  XR_V2_TEMPORAL_CAPTURE_MAX_SPAN_MS + XR_V2_TEMPORAL_PLAYBACK_MAX_TERMINAL_FRAME_MS

export type XrV2TemporalDepthSequence = Readonly<{
  frames: readonly XrV2StoredCaptureFrame[]
  offsetsMs: readonly number[]
  durationMs: number
}>

export type XrV2TemporalFrameObservation = Readonly<{
  frame: XrV2StoredCaptureFrame
  frameIndex: number
  capturedAtMs: number
  loop: number
}>

function validRgbaFrame(frame: XrV2StoredCaptureFrame['frame']): boolean {
  return Number.isSafeInteger(frame.width) && frame.width >= 1 && frame.width <= 1_024
    && Number.isSafeInteger(frame.height) && frame.height >= 1 && frame.height <= 1_024
    && frame.data instanceof Uint8ClampedArray
    && frame.data.length === frame.width * frame.height * 4
}

function validDepthFrame(frame: XrV2StoredCaptureFrame): boolean {
  const depth = frame.estimate?.depth
  if (!depth || !Number.isFinite(frame.estimate?.confidence)
    || (frame.estimate?.confidence ?? -1) < 0 || (frame.estimate?.confidence ?? 2) > 1
    || !Number.isSafeInteger(depth.width) || depth.width < 1 || depth.width > 1_024
    || !Number.isSafeInteger(depth.height) || depth.height < 1 || depth.height > 1_024
    || !(depth.values instanceof Float32Array)
    || depth.values.length !== depth.width * depth.height) return false
  for (const value of depth.values) if (!Number.isFinite(value)) return false
  return true
}

export function resolveXrV2TemporalDepthSequence(
  resource: XrV2SavedSpatialAssetResource,
): XrV2TemporalDepthSequence | null {
  const bundle = resource.frameBundle
  const sessionId = resource.asset.session_id
  const metadata = resource.asset.metadata
  const depthMetadataRef = `indexeddb://agentic-graph-xr-v2/frame-bundle/${sessionId}`
  const synthesisCompatible = (metadata.synthesis_mode === 'live' && !metadata.fallback_triggered)
    || (metadata.synthesis_mode === 'post-process' && metadata.fallback_triggered)
  if (resource.asset.metadata.xr_capability_tier !== 'pseudo-ar-depth-parallax'
    || !synthesisCompatible || metadata.depth_metadata_ref !== depthMetadataRef
    || !bundle || bundle.sessionId !== sessionId || bundle.snapshot.sessionId !== sessionId
    || bundle.frames.length < 2 || bundle.frames.length > XR_V2_TEMPORAL_PLAYBACK_MAX_FRAMES) return null
  const frames = [...bundle.frames]
  const offsetsMs: number[] = []
  let previousIndex = -1
  let previousTimestamp = -1
  const firstTimestamp = frames[0]?.capturedAtMs
  const firstWidth = frames[0]?.frame.width
  const firstHeight = frames[0]?.frame.height
  const firstDepthWidth = frames[0]?.estimate?.depth.width
  const firstDepthHeight = frames[0]?.estimate?.depth.height
  if (!Number.isFinite(firstTimestamp) || firstTimestamp < 0) return null
  for (const frame of frames) {
    if (!Number.isSafeInteger(frame.frameIndex) || frame.frameIndex <= previousIndex
      || !Number.isFinite(frame.capturedAtMs) || frame.capturedAtMs <= previousTimestamp
      || !validRgbaFrame(frame.frame) || !validDepthFrame(frame)
      || frame.frame.width !== firstWidth || frame.frame.height !== firstHeight
      || frame.estimate?.depth.width !== firstDepthWidth
      || frame.estimate?.depth.height !== firstDepthHeight) return null
    const offset = frame.capturedAtMs - firstTimestamp
    if (!Number.isFinite(offset) || offset < 0 || offset > XR_V2_TEMPORAL_CAPTURE_MAX_SPAN_MS) return null
    offsetsMs.push(offset)
    previousIndex = frame.frameIndex
    previousTimestamp = frame.capturedAtMs
  }
  const spanMs = offsetsMs[offsetsMs.length - 1]
  if (!(spanMs > 0) || spanMs > XR_V2_TEMPORAL_CAPTURE_MAX_SPAN_MS) return null
  const finalIntervalMs = Math.min(
    XR_V2_TEMPORAL_PLAYBACK_MAX_TERMINAL_FRAME_MS,
    Math.max(1, spanMs - offsetsMs[offsetsMs.length - 2]),
  )
  const durationMs = spanMs + finalIntervalMs
  if (!Number.isFinite(durationMs) || durationMs > XR_V2_TEMPORAL_PLAYBACK_MAX_DURATION_MS) return null
  return Object.freeze({
    frames: Object.freeze(frames),
    offsetsMs: Object.freeze(offsetsMs),
    durationMs,
  })
}

function framePosition(sequence: XrV2TemporalDepthSequence, elapsedMs: number): number {
  const positionMs = elapsedMs % sequence.durationMs
  let low = 0
  let high = sequence.offsetsMs.length - 1
  while (low < high) {
    const middle = Math.ceil((low + high) / 2)
    if (sequence.offsetsMs[middle] <= positionMs) low = middle
    else high = middle - 1
  }
  return low
}

export type XrV2TemporalPlayhead = Readonly<{
  start(nowMs: number): XrV2TemporalFrameObservation | null
  advance(nowMs: number): XrV2TemporalFrameObservation | null
  read(): XrV2TemporalFrameObservation | null
  stop(): void
  release(): void
}>

export function createXrV2TemporalPlayhead(
  sequence: XrV2TemporalDepthSequence,
): XrV2TemporalPlayhead {
  let phase: 'idle' | 'playing' | 'stopped' | 'released' = 'idle'
  let startedAtMs = 0
  let current: XrV2TemporalFrameObservation | null = null
  const observationAt = (nowMs: number): XrV2TemporalFrameObservation | null => {
    if (phase !== 'playing' || !Number.isFinite(nowMs)) return null
    const elapsedMs = Math.max(0, nowMs - startedAtMs)
    if (!Number.isFinite(elapsedMs)) return null
    const position = framePosition(sequence, elapsedMs)
    const frame = sequence.frames[position]
    const next = Object.freeze({
      frame,
      frameIndex: frame.frameIndex,
      capturedAtMs: frame.capturedAtMs,
      loop: Math.floor(elapsedMs / sequence.durationMs),
    })
    current = next
    return next
  }
  return Object.freeze({
    start: nowMs => {
      if (phase === 'released' || !Number.isFinite(nowMs)) return null
      phase = 'playing'
      startedAtMs = nowMs
      current = null
      return observationAt(nowMs)
    },
    advance: observationAt,
    read: () => current,
    stop: () => {
      if (phase === 'playing') phase = 'stopped'
    },
    release: () => {
      phase = 'released'
      current = null
    },
  })
}

type AnimationFrameRequester = (callback: FrameRequestCallback) => number
type AnimationFrameCanceller = (handle: number) => void

export type XrV2TemporalAnimationLease = Readonly<{
  start(): boolean
  stop(): void
  release(): void
  read(): XrV2TemporalFrameObservation | null
}>

export function createXrV2TemporalAnimationLease(input: Readonly<{
  sequence: XrV2TemporalDepthSequence
  onFrame: (observation: XrV2TemporalFrameObservation) => void
  requestFrame: AnimationFrameRequester
  cancelFrame: AnimationFrameCanceller
  nowMs: () => number
}>): XrV2TemporalAnimationLease {
  let playhead = createXrV2TemporalPlayhead(input.sequence)
  let requestHandle: number | null = null
  let playing = false
  let released = false
  let lastKey = ''
  const emit = (observation: XrV2TemporalFrameObservation | null) => {
    if (!observation) return
    const key = `${observation.loop}:${observation.frameIndex}:${observation.capturedAtMs}`
    if (key === lastKey) return
    lastKey = key
    input.onFrame(observation)
  }
  const schedule = () => {
    if (!playing || released || requestHandle !== null) return
    requestHandle = input.requestFrame(timestamp => {
      requestHandle = null
      if (!playing || released) return
      emit(playhead.advance(timestamp))
      schedule()
    })
  }
  return Object.freeze({
    start: () => {
      if (released || playing) return false
      playhead = createXrV2TemporalPlayhead(input.sequence)
      playing = true
      lastKey = ''
      emit(playhead.start(input.nowMs()))
      schedule()
      return true
    },
    stop: () => {
      playing = false
      playhead.stop()
      if (requestHandle !== null) input.cancelFrame(requestHandle)
      requestHandle = null
    },
    release: () => {
      if (released) return
      playing = false
      if (requestHandle !== null) input.cancelFrame(requestHandle)
      requestHandle = null
      playhead.release()
      released = true
    },
    read: () => playhead.read(),
  })
}

export type XrV2TemporalEvidenceGate = Readonly<{
  observe(frameIndex: number, capturedAtMs: number): boolean
}>

export function createXrV2TemporalEvidenceGate(
  admittedFrames?: readonly Pick<XrV2StoredCaptureFrame, 'frameIndex' | 'capturedAtMs'>[],
): XrV2TemporalEvidenceGate {
  const admitted = admittedFrames
    ? new Set(admittedFrames.map(frame => `${frame.frameIndex}:${frame.capturedAtMs}`))
    : null
  let first: Readonly<{ frameIndex: number; capturedAtMs: number }> | null = null
  let advanced = false
  return Object.freeze({
    observe: (frameIndex, capturedAtMs) => {
      if (advanced) return true
      if (!Number.isSafeInteger(frameIndex) || frameIndex < 0
        || !Number.isFinite(capturedAtMs) || capturedAtMs < 0
        || (admitted && !admitted.has(`${frameIndex}:${capturedAtMs}`))) return false
      if (!first) {
        first = Object.freeze({ frameIndex, capturedAtMs })
        return false
      }
      if (first.frameIndex === frameIndex || first.capturedAtMs === capturedAtMs) return false
      advanced = true
      return true
    },
  })
}
