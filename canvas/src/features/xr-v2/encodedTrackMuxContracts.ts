export const XR_V2_ENCODED_TRACK_SET_SCHEMA = 'agentic-graph-xr-v2-encoded-track-set/v1' as const
export const XR_V2_MUXED_CONTAINER_SCHEMA = 'agentic-graph-xr-v2-muxed-container/v1' as const

export const XR_V2_MUX_LIMITS = Object.freeze({
  maxDurationUs: 10 * 60 * 1_000_000,
  maxEncodedBytes: 256 * 1024 * 1024,
  maxContainerBytes: 320 * 1024 * 1024,
  maxSamplesPerTrack: 36_000,
  maxTracks: 4,
  minFrameRate: 0.1,
  maxFrameRate: 240,
})

export type XrV2WebmVideoCodec = 'vp8' | 'vp9'

export type XrV2EncodedVideoSample = Readonly<{
  type: 'key' | 'delta'
  timestampUs: number
  durationUs: number
  data: Uint8Array
}>

export type XrV2EncodedVideoTrack = Readonly<{
  kind: 'video'
  codec: XrV2WebmVideoCodec
  width: number
  height: number
  frameRate: number
  samples: readonly XrV2EncodedVideoSample[]
}>

export type XrV2EncodedTrackSet = Readonly<{
  schema: typeof XR_V2_ENCODED_TRACK_SET_SCHEMA
  tracks: readonly XrV2EncodedVideoTrack[]
}>

export type XrV2MuxedContainer = Readonly<{
  schema: typeof XR_V2_MUXED_CONTAINER_SCHEMA
  container: 'webm'
  mimeType: 'video/webm'
  bytes: Uint8Array
  trackCount: number
  durationUs: number
}>

export type XrV2MuxFailureReason =
  | 'invalid-track-set'
  | 'unsupported-codec'
  | 'track-limit-exceeded'
  | 'sample-limit-exceeded'
  | 'byte-limit-exceeded'
  | 'container-limit-exceeded'
  | 'duration-limit-exceeded'
  | 'invalid-sample-duration'
  | 'invalid-codec-data'
  | 'invalid-sample-order'
  | 'missing-keyframe'

export type XrV2MuxResult =
  | Readonly<{ status: 'ready'; container: XrV2MuxedContainer }>
  | Readonly<{ status: 'invalid'; reason: XrV2MuxFailureReason; detail: string }>

export function copyEncodedChunk(
  chunk: EncodedVideoChunk,
  durationUs = chunk.duration ?? 0,
): XrV2EncodedVideoSample {
  const data = new Uint8Array(chunk.byteLength)
  chunk.copyTo(data)
  return Object.freeze({
    type: chunk.type,
    timestampUs: chunk.timestamp,
    durationUs,
    data,
  })
}

export type XrV2Vp9CodecMetadata = Readonly<{
  profile: 0 | 1 | 2 | 3
  bitDepth: 8 | 10 | 12
  chromaSubsampling: 1 | 2 | 3
  colorSpace: number
  frameWidth: number
  frameHeight: number
}>

export type XrV2Vp9CodecMetadataResult =
  | Readonly<{ status: 'ready'; metadata: XrV2Vp9CodecMetadata }>
  | Readonly<{ status: 'invalid'; detail: string }>

export type XrV2Vp9CodecPrivateMetadata = Readonly<{
  profile: 0 | 1 | 2 | 3
  level: 10 | 11 | 20 | 21 | 30 | 31 | 40 | 41 | 50 | 51 | 52 | 60 | 61 | 62 | null
  bitDepth: 8 | 10 | 12
  chromaSubsampling: 1 | 2 | 3
}>

export type XrV2Vp9CodecPrivateResult =
  | Readonly<{ status: 'ready'; metadata: XrV2Vp9CodecPrivateMetadata }>
  | Readonly<{ status: 'invalid'; detail: string }>

class MsbBitReader {
  private bitOffset = 0

  constructor(private readonly bytes: Uint8Array) {}

  read(width: number): number | null {
    if (!Number.isInteger(width) || width < 1 || width > 24
      || this.bitOffset + width > this.bytes.byteLength * 8) return null
    let value = 0
    for (let index = 0; index < width; index += 1) {
      const absolute = this.bitOffset + index
      value = value * 2 + ((this.bytes[Math.floor(absolute / 8)] >> (7 - (absolute % 8))) & 1)
    }
    this.bitOffset += width
    return value
  }
}

export function inspectXrV2Vp9Keyframe(
  data: Uint8Array,
  maximumWidth: number,
  maximumHeight: number,
): XrV2Vp9CodecMetadataResult {
  if (!(data instanceof Uint8Array) || data.byteLength < 9
    || !Number.isInteger(maximumWidth) || maximumWidth < 1 || maximumWidth > 8_192
    || !Number.isInteger(maximumHeight) || maximumHeight < 1 || maximumHeight > 8_192) {
    return { status: 'invalid', detail: 'VP9 keyframe bytes or declared dimensions are outside the admitted bounds.' }
  }
  const reader = new MsbBitReader(data)
  const frameMarker = reader.read(2)
  const profileLow = reader.read(1)
  const profileHigh = reader.read(1)
  if (frameMarker !== 2 || profileLow === null || profileHigh === null) {
    return { status: 'invalid', detail: 'VP9 keyframe marker or profile is invalid.' }
  }
  const profileValue = profileLow | (profileHigh << 1)
  if (profileValue === 3 && reader.read(1) !== 0) {
    return { status: 'invalid', detail: 'VP9 profile reserved bit must be zero.' }
  }
  const profile = profileValue as 0 | 1 | 2 | 3
  if (reader.read(1) !== 0 || reader.read(1) !== 0) {
    return { status: 'invalid', detail: 'VP9 sample marked as a keyframe does not contain a canonical keyframe header.' }
  }
  if (reader.read(1) === null || reader.read(1) === null
    || reader.read(8) !== 0x49 || reader.read(8) !== 0x83 || reader.read(8) !== 0x42) {
    return { status: 'invalid', detail: 'VP9 keyframe sync code is invalid or truncated.' }
  }

  let bitDepth: 8 | 10 | 12 = 8
  if (profile >= 2) {
    const highBitDepth = reader.read(1)
    if (highBitDepth === null) return { status: 'invalid', detail: 'VP9 bit-depth metadata is truncated.' }
    bitDepth = highBitDepth === 0 ? 10 : 12
  }
  const colorSpace = reader.read(3)
  if (colorSpace === null) return { status: 'invalid', detail: 'VP9 color metadata is truncated.' }
  let subsamplingX: number
  let subsamplingY: number
  if (colorSpace !== 7) {
    if (reader.read(1) === null) return { status: 'invalid', detail: 'VP9 color-range metadata is truncated.' }
    if (profile === 1 || profile === 3) {
      subsamplingX = reader.read(1) ?? -1
      subsamplingY = reader.read(1) ?? -1
      if (reader.read(1) !== 0) return { status: 'invalid', detail: 'VP9 chroma reserved bit must be zero.' }
      if (subsamplingX === 1 && subsamplingY === 1) {
        return { status: 'invalid', detail: 'VP9 profile 1/3 does not admit 4:2:0 chroma.' }
      }
    } else {
      subsamplingX = 1
      subsamplingY = 1
    }
  } else {
    if (profile !== 1 && profile !== 3) {
      return { status: 'invalid', detail: 'VP9 RGB color space requires profile 1 or 3.' }
    }
    subsamplingX = 0
    subsamplingY = 0
    if (reader.read(1) !== 0) return { status: 'invalid', detail: 'VP9 RGB reserved bit must be zero.' }
  }
  const chromaSubsampling = subsamplingX === 1 && subsamplingY === 1 ? 1
    : subsamplingX === 1 && subsamplingY === 0 ? 2
      : subsamplingX === 0 && subsamplingY === 0 ? 3
        : null
  if (chromaSubsampling === null) {
    return { status: 'invalid', detail: 'VP9 4:4:0 chroma has no admitted WebM CodecPrivate mapping.' }
  }
  const encodedWidth = reader.read(16)
  const encodedHeight = reader.read(16)
  const renderSizeDiffers = reader.read(1)
  if (encodedWidth === null || encodedHeight === null || renderSizeDiffers === null) {
    return { status: 'invalid', detail: 'VP9 keyframe dimensions are truncated.' }
  }
  const frameWidth = encodedWidth + 1
  const frameHeight = encodedHeight + 1
  if (frameWidth > maximumWidth || frameHeight > maximumHeight) {
    return { status: 'invalid', detail: 'VP9 keyframe dimensions exceed the declared track bounds.' }
  }
  if (renderSizeDiffers === 1) {
    const renderWidth = reader.read(16)
    const renderHeight = reader.read(16)
    if (renderWidth === null || renderHeight === null
      || renderWidth + 1 > frameWidth || renderHeight + 1 > frameHeight) {
      return { status: 'invalid', detail: 'VP9 render dimensions are truncated or exceed the coded frame.' }
    }
  }
  return {
    status: 'ready',
    metadata: Object.freeze({
      profile,
      bitDepth,
      chromaSubsampling,
      colorSpace,
      frameWidth,
      frameHeight,
    }),
  }
}

export function createXrV2Vp9CodecPrivate(metadata: XrV2Vp9CodecMetadata): Uint8Array {
  return Uint8Array.of(
    1, 1, metadata.profile,
    3, 1, metadata.bitDepth,
    4, 1, metadata.chromaSubsampling,
  )
}

export function inspectXrV2Vp9CodecPrivate(data: Uint8Array): XrV2Vp9CodecPrivateResult {
  if (!(data instanceof Uint8Array) || data.byteLength < 9 || data.byteLength > 12) {
    return { status: 'invalid', detail: 'VP9 CodecPrivate must contain the bounded feature list.' }
  }
  const features = new Map<number, number>()
  let offset = 0
  while (offset < data.byteLength) {
    if (offset + 3 > data.byteLength || (data[offset] & 0x80) !== 0 || data[offset + 1] !== 1) {
      return { status: 'invalid', detail: 'VP9 CodecPrivate feature header is invalid or truncated.' }
    }
    const id = data[offset]
    const value = data[offset + 2]
    if (id < 1 || id > 4 || features.has(id)) {
      return { status: 'invalid', detail: 'VP9 CodecPrivate feature identifier is unsupported or duplicated.' }
    }
    features.set(id, value)
    offset += 3
  }
  const profile = features.get(1)
  const level = features.get(2) ?? null
  const bitDepth = features.get(3)
  const chromaSubsampling = features.get(4)
  const validLevels = new Set([10, 11, 20, 21, 30, 31, 40, 41, 50, 51, 52, 60, 61, 62])
  if ((profile !== 0 && profile !== 1 && profile !== 2 && profile !== 3)
    || (bitDepth !== 8 && bitDepth !== 10 && bitDepth !== 12)
    || (chromaSubsampling !== 1 && chromaSubsampling !== 2 && chromaSubsampling !== 3)
    || (level !== null && !validLevels.has(level))) {
    return { status: 'invalid', detail: 'VP9 CodecPrivate feature value is outside the WebM-defined set.' }
  }
  const profileMatches = (profile === 0 && bitDepth === 8 && chromaSubsampling === 1)
    || (profile === 1 && bitDepth === 8 && chromaSubsampling !== 1)
    || (profile === 2 && bitDepth !== 8 && chromaSubsampling === 1)
    || (profile === 3 && bitDepth !== 8 && chromaSubsampling !== 1)
  if (!profileMatches) {
    return { status: 'invalid', detail: 'VP9 CodecPrivate profile, bit depth, and chroma subsampling conflict.' }
  }
  return {
    status: 'ready',
    metadata: Object.freeze({
      profile,
      level: level as XrV2Vp9CodecPrivateMetadata['level'],
      bitDepth,
      chromaSubsampling,
    }),
  }
}
