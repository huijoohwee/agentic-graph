import type {
  XrV2CaptureArtifactSink,
  XrV2CaptureFrame,
  XrV2DepthEstimate,
} from './captureContracts'
import type { XrV2NormalizedDepthMap, XrV2RgbaFrame } from './stereoSynthesis'
import {
  XR_V2_MAX_CAPTURE_BLOB_BYTES,
  XR_V2_MAX_PERSISTED_CAPTURE_FRAMES,
  type XrV2CaptureArtifactStore,
  type XrV2StoredCaptureFrame,
} from './xrV2CaptureArtifactStore'

export type XrV2CaptureArtifactSinkController = XrV2CaptureArtifactSink<
  XrV2RgbaFrame,
  XrV2NormalizedDepthMap
> & Readonly<{
  setRawClip(blob: Blob): void
  readFrameCount(): number
}>

function assertBlob(blob: Blob): void {
  if (!(blob instanceof Blob) || blob.size < 1 || blob.size > XR_V2_MAX_CAPTURE_BLOB_BYTES) {
    throw new Error('raw-clip blob is outside the admitted persistence bound')
  }
}

function copyFrame(frame: XrV2RgbaFrame): XrV2RgbaFrame {
  if (!Number.isSafeInteger(frame.width) || frame.width < 1 || frame.width > 1_024
    || !Number.isSafeInteger(frame.height) || frame.height < 1 || frame.height > 1_024
    || !(frame.data instanceof Uint8ClampedArray)
    || frame.data.length !== frame.width * frame.height * 4) {
    throw new Error('capture frame is not a bounded RGBA frame')
  }
  return Object.freeze({ width: frame.width, height: frame.height, data: frame.data.slice() })
}

function copyEstimate(
  estimate: XrV2DepthEstimate<XrV2NormalizedDepthMap>,
): XrV2DepthEstimate<XrV2NormalizedDepthMap> {
  const { depth } = estimate
  if (!Number.isFinite(estimate.confidence) || estimate.confidence < 0 || estimate.confidence > 1
    || !Number.isSafeInteger(depth.width) || depth.width < 1
    || !Number.isSafeInteger(depth.height) || depth.height < 1
    || !(depth.values instanceof Float32Array)
    || depth.values.length !== depth.width * depth.height) {
    throw new Error('capture depth estimate is malformed')
  }
  return Object.freeze({
    confidence: estimate.confidence,
    depth: Object.freeze({ width: depth.width, height: depth.height, values: depth.values.slice() }),
  })
}

export function createXrV2CaptureArtifactSink(options: Readonly<{
  sessionId: string
  store: XrV2CaptureArtifactStore
  maxFrames?: number
}>): XrV2CaptureArtifactSinkController {
  const sessionId = String(options.sessionId || '').trim()
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/.test(sessionId)) {
    throw new Error('sessionId must be a bounded portable identifier')
  }
  const maxFrames = options.maxFrames ?? XR_V2_MAX_PERSISTED_CAPTURE_FRAMES
  if (!Number.isSafeInteger(maxFrames) || maxFrames < 1 || maxFrames > XR_V2_MAX_PERSISTED_CAPTURE_FRAMES) {
    throw new Error('XR capture artifact sink maxFrames is outside the admitted bound')
  }
  const frames = new Map<number, XrV2StoredCaptureFrame>()
  let rawClip: Blob | null = null
  let finalized: Readonly<{ rawClipRef: string; depthMetadataRef: string }> | null = null
  return Object.freeze({
    setRawClip: blob => {
      if (finalized) throw new Error('XR capture artifact sink is already finalized')
      assertBlob(blob)
      rawClip = blob
    },
    readFrameCount: () => frames.size,
    writeRawFrame: (input: XrV2CaptureFrame<XrV2RgbaFrame>) => {
      if (finalized || frames.size >= maxFrames || frames.has(input.frameIndex)) {
        throw new Error('XR capture artifact sink rejected a duplicate, excess, or finalized frame')
      }
      frames.set(input.frameIndex, Object.freeze({
        frameIndex: input.frameIndex,
        capturedAtMs: input.capturedAtMs,
        frame: copyFrame(input.frame),
        estimate: null,
      }))
    },
    writeDepthEstimate: input => {
      const stored = frames.get(input.frameIndex)
      if (!stored || stored.capturedAtMs !== input.capturedAtMs) {
        throw new Error('XR capture depth estimate has no matching raw frame')
      }
      frames.set(input.frameIndex, Object.freeze({ ...stored, estimate: copyEstimate(input.estimate) }))
    },
    finalize: async ({ snapshot }) => {
      if (finalized) return finalized
      if (!rawClip) throw new Error('XR capture raw clip must be supplied before finalization')
      if (frames.size < 1) throw new Error('XR capture cannot finalize without sampled frames')
      const rawClipRef = await options.store.putRawClip(sessionId, rawClip)
      const depthMetadataRef = await options.store.putFrameBundle({
        schema: 'agentic-graph-xr-v2-capture-frame-bundle/v1',
        sessionId,
        snapshot,
        frames: Object.freeze([...frames.values()].sort((a, b) => a.frameIndex - b.frameIndex)),
        createdAtMs: Date.now(),
      })
      finalized = Object.freeze({ rawClipRef, depthMetadataRef })
      return finalized
    },
  })
}
