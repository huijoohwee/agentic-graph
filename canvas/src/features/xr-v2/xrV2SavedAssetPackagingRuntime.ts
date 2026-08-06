import {
  inspectXrV2WebmContainer,
  verifyXrV2WebmSamplePayload,
} from './containerTrackInventory'
import {
  copyEncodedChunk,
  XR_V2_ENCODED_TRACK_SET_SCHEMA,
  type XrV2EncodedVideoSample,
  type XrV2EncodedVideoTrack,
  type XrV2WebmVideoCodec,
} from './encodedTrackMuxContracts'
import type { XrV2EncodedTrackWebmFixture } from './browserRuntimeEvidence'
import type { XrV2SavedSpatialAssetResource } from './xrV2SavedAssetCatalog'
import { XR_V2_MAX_PERSISTED_CAPTURE_FRAMES } from './xrV2CaptureArtifactStore'
import {
  synthesizeXrV2RgbaStereoPair,
  type XrV2RgbaFrame,
} from './stereoSynthesis'
import { muxXrV2EncodedTracksToWebm } from './webmEncodedTrackMuxer'

const MAX_PACKAGING_FRAMES = XR_V2_MAX_PERSISTED_CAPTURE_FRAMES
const PACKAGING_FRAME_RATE = 10
const PACKAGING_FRAME_DURATION_US = 1_000_000 / PACKAGING_FRAME_RATE

export type XrV2SavedAssetEncodedTrackFixture = XrV2EncodedTrackWebmFixture & Readonly<{
  sourceSessionId: string
  sourceRawClipRef: string
  sourceRawClipMimeType: string
  sourceRawClipByteSize: number
  sourceRawClipSha256: `sha256:${string}`
  sourceDepthMetadataRef: string
  sourceTrackProducer: 'captured-frame-bundle-webcodecs'
  sourceTracksProducedBeforeMux: true
}>

export type XrV2SavedAssetEncodedTrackSet = Readonly<{
  schema: typeof XR_V2_ENCODED_TRACK_SET_SCHEMA
  tracks: readonly XrV2EncodedVideoTrack[]
  decodedSourceFrameCounts: readonly number[]
  sourceSessionId: string
  sourceRawClipRef: string
  sourceRawClipMimeType: string
  sourceRawClipByteSize: number
  sourceRawClipSha256: `sha256:${string}`
  sourceDepthMetadataRef: string
  sourceTrackProducer: 'captured-frame-bundle-webcodecs'
}>

type CodecChoice = Readonly<{
  containerCodec: XrV2WebmVideoCodec
  webCodecsCodec: string
  config: VideoEncoderConfig
}>

function assertFrame(frame: XrV2RgbaFrame, width: number, height: number): void {
  if (frame.width !== width || frame.height !== height
    || !(frame.data instanceof Uint8ClampedArray)
    || frame.data.length !== width * height * 4) {
    throw new Error('Saved XR capture frames must have one bounded RGBA geometry')
  }
}

async function chooseCodec(width: number, height: number): Promise<CodecChoice> {
  if (typeof VideoEncoder === 'undefined' || typeof VideoFrame === 'undefined') {
    throw new Error('WebCodecs video encoding is unavailable in this browser')
  }
  for (const candidate of [
    { containerCodec: 'vp8' as const, webCodecsCodec: 'vp8' },
    { containerCodec: 'vp9' as const, webCodecsCodec: 'vp09.00.10.08' },
  ]) {
    const config: VideoEncoderConfig = {
      codec: candidate.webCodecsCodec,
      width,
      height,
      bitrate: 750_000,
      framerate: PACKAGING_FRAME_RATE,
      latencyMode: 'realtime',
    }
    const support = await VideoEncoder.isConfigSupported(config)
    if (support.supported) return Object.freeze({ ...candidate, config: support.config })
  }
  throw new Error('No admitted VP8/VP9 WebCodecs encoder is available')
}

async function encodeFrames(
  frames: readonly XrV2RgbaFrame[],
  choice: CodecChoice,
  signal: AbortSignal,
): Promise<readonly XrV2EncodedVideoSample[]> {
  const width = frames[0]?.width || 0
  const height = frames[0]?.height || 0
  if (width < 1 || height < 1) throw new Error('Saved XR capture has no persisted RGBA frames')
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d', { alpha: false })
  if (!context) throw new Error('Saved XR packaging canvas is unavailable')
  const samples: XrV2EncodedVideoSample[] = []
  let encoderError: Error | null = null
  const encoder = new VideoEncoder({
    output: chunk => samples.push(copyEncodedChunk(chunk, PACKAGING_FRAME_DURATION_US)),
    error: error => { encoderError = error },
  })
  try {
    encoder.configure(choice.config)
    for (let index = 0; index < frames.length; index += 1) {
      if (signal.aborted) throw new Error('Saved XR packaging was cancelled')
      const frame = frames[index]
      assertFrame(frame, width, height)
      context.putImageData(new ImageData(frame.data, width, height), 0, 0)
      const videoFrame = new VideoFrame(canvas, {
        timestamp: index * PACKAGING_FRAME_DURATION_US,
        duration: PACKAGING_FRAME_DURATION_US,
      })
      try { encoder.encode(videoFrame, { keyFrame: index === 0 }) } finally { videoFrame.close() }
    }
    await encoder.flush()
    if (encoderError) throw encoderError
  } finally {
    if (encoder.state !== 'closed') encoder.close()
  }
  samples.sort((left, right) => left.timestampUs - right.timestampUs)
  if (samples.length !== frames.length || samples[0]?.type !== 'key') {
    throw new Error('Saved XR WebCodecs output did not preserve the persisted frame inventory')
  }
  return Object.freeze(samples)
}

async function decodeSamples(
  samples: readonly XrV2EncodedVideoSample[],
  choice: CodecChoice,
  width: number,
  height: number,
  signal: AbortSignal,
): Promise<number> {
  if (typeof VideoDecoder === 'undefined' || typeof EncodedVideoChunk === 'undefined') {
    throw new Error('WebCodecs video decoding is unavailable in this browser')
  }
  const config: VideoDecoderConfig = { codec: choice.webCodecsCodec, codedWidth: width, codedHeight: height }
  const support = await VideoDecoder.isConfigSupported(config)
  if (!support.supported) throw new Error(`No decoder admits captured ${choice.containerCodec} track output`)
  let decodedFrames = 0
  let decoderError: Error | null = null
  const decoder = new VideoDecoder({
    output: frame => { decodedFrames += 1; frame.close() },
    error: error => { decoderError = error },
  })
  try {
    decoder.configure(support.config)
    for (const sample of samples) {
      if (signal.aborted) throw new Error('Saved XR packaging was cancelled')
      decoder.decode(new EncodedVideoChunk({
        type: sample.type,
        timestamp: sample.timestampUs,
        duration: sample.durationUs,
        data: sample.data,
      }))
    }
    await decoder.flush()
    if (decoderError) throw decoderError
  } finally {
    if (decoder.state !== 'closed') decoder.close()
  }
  if (decodedFrames !== samples.length) {
    throw new Error('Captured encoded track did not decode its exact frame inventory')
  }
  return decodedFrames
}

async function sha256(blob: Blob, signal: AbortSignal): Promise<`sha256:${string}`> {
  const bytes = await blob.arrayBuffer()
  if (signal.aborted) throw new Error('Saved XR packaging was cancelled')
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return `sha256:${[...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, '0')).join('')}`
}

function assertCapturedResource(resource: XrV2SavedSpatialAssetResource): Readonly<{
  sessionId: string
  rawClipRef: string
  depthMetadataRef: string
}> {
  const sessionId = String(resource.asset.session_id || '')
  const rawClipRef = String(resource.asset.raw_clip_ref || '')
  const depthMetadataRef = String(resource.asset.metadata.depth_metadata_ref || '')
  if (!resource.frameBundle || resource.frameBundle.sessionId !== sessionId
    || resource.frameBundle.snapshot.sessionId !== sessionId
    || !rawClipRef.endsWith(`/raw-clip/${sessionId}`)
    || !depthMetadataRef.endsWith(`/frame-bundle/${sessionId}`)
    || !(resource.rawClip instanceof Blob) || resource.rawClip.size < 1
    || !resource.rawClip.type.toLowerCase().startsWith('video/')) {
    throw new Error('Saved XR packaging requires one identity-bound captured raw clip and frame bundle')
  }
  return Object.freeze({ sessionId, rawClipRef, depthMetadataRef })
}

export function resolveXrV2SavedAssetRgbaTracks(
  resource: XrV2SavedSpatialAssetResource,
): readonly (readonly XrV2RgbaFrame[])[] {
  const stored = resource.frameBundle?.frames.slice(0, MAX_PACKAGING_FRAMES) || []
  if (stored.length < 1) throw new Error('Open a saved XR capture with persisted frames before packaging')
  if (resource.asset.metadata.xr_capability_tier === 'pseudo-ar-depth-parallax') {
    const pairs = stored.map(storedFrame => storedFrame.estimate
      ? synthesizeXrV2RgbaStereoPair({
          frameIndex: storedFrame.frameIndex,
          capturedAtMs: storedFrame.capturedAtMs,
          frame: storedFrame.frame,
          estimate: storedFrame.estimate,
          configuration: { maxDisparityPixels: 8 },
        })
      : Object.freeze({ left: storedFrame.frame, right: storedFrame.frame }))
    return Object.freeze([
      Object.freeze(pairs.map(pair => pair.left)),
      Object.freeze(pairs.map(pair => pair.right)),
    ])
  }
  return Object.freeze([Object.freeze(stored.map(frame => frame.frame))])
}

/** Produces the capture-bound, already-encoded WebCodecs input independently of muxing. */
export async function createXrV2SavedAssetEncodedTrackSet(
  resource: XrV2SavedSpatialAssetResource,
  signal: AbortSignal,
): Promise<XrV2SavedAssetEncodedTrackSet> {
  if (signal.aborted) throw new Error('Saved XR packaging was cancelled')
  const capture = assertCapturedResource(resource)
  const sourceRawClipSha256 = await sha256(resource.rawClip, signal)
  const sourceFrames = resolveXrV2SavedAssetRgbaTracks(resource)
  const width = sourceFrames[0][0].width
  const height = sourceFrames[0][0].height
  const choice = await chooseCodec(width, height)
  const encodedSamples = await Promise.all(sourceFrames.map(frames => encodeFrames(frames, choice, signal)))
  const decodedSourceFrameCounts = await Promise.all(encodedSamples.map(samples => (
    decodeSamples(samples, choice, width, height, signal)
  )))
  const tracks: readonly XrV2EncodedVideoTrack[] = Object.freeze(encodedSamples.map(samples => Object.freeze({
    kind: 'video' as const,
    codec: choice.containerCodec,
    width,
    height,
    frameRate: PACKAGING_FRAME_RATE,
    samples,
  })))
  return Object.freeze({
    schema: XR_V2_ENCODED_TRACK_SET_SCHEMA,
    tracks,
    decodedSourceFrameCounts: Object.freeze(decodedSourceFrameCounts),
    sourceSessionId: capture.sessionId,
    sourceRawClipRef: capture.rawClipRef,
    sourceRawClipMimeType: resource.rawClip.type,
    sourceRawClipByteSize: resource.rawClip.size,
    sourceRawClipSha256,
    sourceDepthMetadataRef: capture.depthMetadataRef,
    sourceTrackProducer: 'captured-frame-bundle-webcodecs',
  })
}

/** Packages independently supplied encoded tracks and verifies exact payload preservation. */
export function packageXrV2SavedAssetEncodedTrackSet(
  source: XrV2SavedAssetEncodedTrackSet,
  signal?: AbortSignal,
): XrV2SavedAssetEncodedTrackFixture {
  if (signal?.aborted) throw new Error('Saved XR packaging was cancelled')
  const tracks = source.tracks
  if (source.schema !== XR_V2_ENCODED_TRACK_SET_SCHEMA || tracks.length < 1 || tracks.length > 2
    || source.decodedSourceFrameCounts.length !== tracks.length
    || tracks.some((track, index) => track.samples.length < 1
      || source.decodedSourceFrameCounts[index] !== track.samples.length
      || track.samples.some(sample => !(sample.data instanceof Uint8Array) || sample.data.byteLength < 1))) {
    throw new Error('Saved XR already-encoded track input is malformed')
  }
  const muxed = muxXrV2EncodedTracksToWebm({ schema: source.schema, tracks })
  if (muxed.status !== 'ready') throw new Error(`Saved XR track mux failed: ${muxed.reason}: ${muxed.detail}`)
  const inventory = inspectXrV2WebmContainer(muxed.container.bytes)
  const exactPayloadsVerified = inventory.tracks.length === tracks.length
    && inventory.tracks.every((track, trackIndex) => (
      track.codec === tracks[trackIndex].codec
      && track.sampleCount === tracks[trackIndex].samples.length
      && track.samples.every((sample, sampleIndex) => verifyXrV2WebmSamplePayload(
        muxed.container.bytes,
        sample,
        tracks[trackIndex].samples[sampleIndex].data,
      ))
    ))
  if (!exactPayloadsVerified) throw new Error('Saved XR packaged payloads drifted from the supplied encodings')
  return Object.freeze({
    blob: new Blob([muxed.container.bytes.slice().buffer], { type: muxed.container.mimeType }),
    inventory,
    exactPayloadsVerified,
    sourceCodecs: Object.freeze(tracks.map(track => track.codec)),
    sourceSampleCounts: Object.freeze(tracks.map(track => track.samples.length)),
    decodedSourceFrameCounts: source.decodedSourceFrameCounts,
    sourceSessionId: source.sourceSessionId,
    sourceRawClipRef: source.sourceRawClipRef,
    sourceRawClipMimeType: source.sourceRawClipMimeType,
    sourceRawClipByteSize: source.sourceRawClipByteSize,
    sourceRawClipSha256: source.sourceRawClipSha256,
    sourceDepthMetadataRef: source.sourceDepthMetadataRef,
    sourceTrackProducer: source.sourceTrackProducer,
    sourceTracksProducedBeforeMux: true,
  })
}

/** Produces encoded capture tracks first, then crosses the independent mux boundary. */
export async function createXrV2SavedAssetEncodedTrackFixture(
  resource: XrV2SavedSpatialAssetResource,
  signal: AbortSignal,
): Promise<XrV2SavedAssetEncodedTrackFixture> {
  const source = await createXrV2SavedAssetEncodedTrackSet(resource, signal)
  return packageXrV2SavedAssetEncodedTrackSet(source, signal)
}
