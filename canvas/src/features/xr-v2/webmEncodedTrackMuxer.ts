import {
  createXrV2Vp9CodecPrivate,
  inspectXrV2Vp9Keyframe,
  XR_V2_ENCODED_TRACK_SET_SCHEMA,
  XR_V2_MUXED_CONTAINER_SCHEMA,
  XR_V2_MUX_LIMITS,
  type XrV2EncodedTrackSet,
  type XrV2EncodedVideoSample,
  type XrV2EncodedVideoTrack,
  type XrV2MuxResult,
} from './encodedTrackMuxContracts'

const IDS = Object.freeze({
  ebml: [0x1a, 0x45, 0xdf, 0xa3],
  segment: [0x18, 0x53, 0x80, 0x67],
  seekHead: [0x11, 0x4d, 0x9b, 0x74],
  info: [0x15, 0x49, 0xa9, 0x66],
  tracks: [0x16, 0x54, 0xae, 0x6b],
  cluster: [0x1f, 0x43, 0xb6, 0x75],
  cues: [0x1c, 0x53, 0xbb, 0x6b],
} as const)

const TIMECODE_SCALE_NS = 1_000_000
const MAX_CLUSTER_SPAN_TICKS = 30_000
const textEncoder = new TextEncoder()

type ByteNode = Readonly<{
  byteLength: number
  bytes?: Uint8Array
  parts?: readonly ByteNode[]
}>

class ContainerLimitError extends Error {}

function leaf(bytes: Uint8Array): ByteNode {
  return Object.freeze({ byteLength: bytes.byteLength, bytes })
}

function sequence(parts: readonly ByteNode[]): ByteNode {
  let byteLength = 0
  for (const part of parts) {
    if (!Number.isSafeInteger(part.byteLength) || part.byteLength < 0
      || part.byteLength > XR_V2_MUX_LIMITS.maxContainerBytes - byteLength) {
      throw new ContainerLimitError('WebM output exceeds the bounded container limit.')
    }
    byteLength += part.byteLength
  }
  return Object.freeze({ byteLength, parts })
}

function flatten(root: ByteNode): Uint8Array {
  if (root.byteLength > XR_V2_MUX_LIMITS.maxContainerBytes) {
    throw new ContainerLimitError('WebM output exceeds the bounded container limit.')
  }
  const output = new Uint8Array(root.byteLength)
  let offset = 0
  const write = (node: ByteNode) => {
    if (node.bytes) {
      output.set(node.bytes, offset)
      offset += node.bytes.byteLength
      return
    }
    for (const part of node.parts ?? []) write(part)
  }
  write(root)
  if (offset !== output.byteLength) throw new Error('WebM byte tree length mismatch')
  return output
}

function uint(value: number): Uint8Array {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error('invalid EBML unsigned integer')
  if (value === 0) return Uint8Array.of(0)
  const bytes: number[] = []
  let remaining = value
  while (remaining > 0) {
    bytes.unshift(remaining % 256)
    remaining = Math.floor(remaining / 256)
  }
  return Uint8Array.from(bytes)
}

function float64(value: number): Uint8Array {
  const bytes = new Uint8Array(8)
  new DataView(bytes.buffer).setFloat64(0, value, false)
  return bytes
}

function sizeVint(value: number): Uint8Array {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error('invalid EBML element size')
  for (let width = 1; width <= 7; width += 1) {
    const maximum = 2 ** (7 * width) - 2
    if (value > maximum) continue
    const bytes = new Uint8Array(width)
    let remaining = value
    for (let index = width - 1; index >= 0; index -= 1) {
      bytes[index] = remaining % 256
      remaining = Math.floor(remaining / 256)
    }
    bytes[0] |= 1 << (8 - width)
    return bytes
  }
  throw new ContainerLimitError('WebM element exceeds the bounded element-size limit.')
}

function element(id: readonly number[], data: ByteNode): ByteNode {
  return sequence([leaf(Uint8Array.from(id)), leaf(sizeVint(data.byteLength)), data])
}

function binary(id: readonly number[], value: Uint8Array): ByteNode {
  return element(id, leaf(value))
}

function u(id: readonly number[], value: number): ByteNode {
  return binary(id, uint(value))
}

function s(id: readonly number[], value: string): ByteNode {
  return binary(id, textEncoder.encode(value))
}

function trackEntry(track: XrV2EncodedVideoTrack, index: number): ByteNode {
  const number = index + 1
  const defaultDurationNs = Math.round(1_000_000_000 / track.frameRate)
  const video = element([0xe0], sequence([
    u([0xb0], track.width),
    u([0xba], track.height),
  ]))
  const children: ByteNode[] = [
    u([0xd7], number),
    u([0x73, 0xc5], number),
    u([0x83], 1),
    u([0x88], index === 0 ? 1 : 0),
    s([0x86], track.codec === 'vp8' ? 'V_VP8' : 'V_VP9'),
    u([0x9c], 0),
    u([0x23, 0xe3, 0x83], defaultDurationNs),
  ]
  if (track.codec === 'vp9') {
    const inspected = inspectXrV2Vp9Keyframe(track.samples[0].data, track.width, track.height)
    if (inspected.status !== 'ready') throw new Error('validated VP9 metadata became unavailable')
    children.push(binary([0x63, 0xa2], createXrV2Vp9CodecPrivate(inspected.metadata)))
  }
  children.push(video)
  return element([0xae], sequence(children))
}

type OrderedSample = Readonly<{
  trackNumber: number
  sample: XrV2EncodedVideoSample
  timestampTicks: number
}>

function simpleBlock(entry: OrderedSample, clusterTimecode: number): ByteNode {
  const relative = entry.timestampTicks - clusterTimecode
  if (!Number.isInteger(relative) || relative < -32_768 || relative > 32_767) {
    throw new Error('WebM relative block timecode is out of range')
  }
  const header = new Uint8Array(4)
  header[0] = 0x80 | entry.trackNumber
  new DataView(header.buffer).setInt16(1, relative, false)
  header[3] = entry.sample.type === 'key' ? 0x80 : 0
  return element([0xa3], sequence([leaf(header), leaf(entry.sample.data)]))
}

type ClusterBuild = Readonly<{
  node: ByteNode
  keyframes: readonly Readonly<{ trackNumber: number; timestampTicks: number }>[]
}>

function buildClusters(samples: readonly OrderedSample[]): readonly ClusterBuild[] {
  const output: ClusterBuild[] = []
  let clusterStart = -1
  let blocks: ByteNode[] = []
  let keyframes: Readonly<{ trackNumber: number; timestampTicks: number }>[] = []
  const flush = () => {
    if (clusterStart < 0) return
    const children: ByteNode[] = [u([0xe7], clusterStart)]
    for (const block of blocks) children.push(block)
    output.push(Object.freeze({
      node: element(IDS.cluster, sequence(children)),
      keyframes: Object.freeze(keyframes),
    }))
    blocks = []
    keyframes = []
  }
  for (const sample of samples) {
    if (clusterStart < 0 || sample.timestampTicks - clusterStart > MAX_CLUSTER_SPAN_TICKS
      || (sample.sample.type === 'key' && blocks.length > 0 && sample.timestampTicks !== clusterStart)) {
      flush()
      clusterStart = sample.timestampTicks
    }
    blocks.push(simpleBlock(sample, clusterStart))
    if (sample.sample.type === 'key') {
      keyframes.push(Object.freeze({
        trackNumber: sample.trackNumber,
        timestampTicks: sample.timestampTicks,
      }))
    }
  }
  flush()
  return Object.freeze(output)
}

function seekEntry(id: readonly number[], position: number): ByteNode {
  return element([0x4d, 0xbb], sequence([
    binary([0x53, 0xab], Uint8Array.from(id)),
    u([0x53, 0xac], position),
  ]))
}

function buildSeekHead(positions: Readonly<{ info: number; tracks: number; cues: number }>): ByteNode {
  return element(IDS.seekHead, sequence([
    seekEntry(IDS.info, positions.info),
    seekEntry(IDS.tracks, positions.tracks),
    seekEntry(IDS.cues, positions.cues),
  ]))
}

function buildCues(
  clusters: readonly ClusterBuild[],
  clusterPositions: readonly number[],
): ByteNode {
  const positionsByTimestamp = new Map<number, Readonly<{ trackNumber: number; clusterPosition: number }>[]>()
  for (let clusterIndex = 0; clusterIndex < clusters.length; clusterIndex += 1) {
    for (const keyframe of clusters[clusterIndex].keyframes) {
      const positions = positionsByTimestamp.get(keyframe.timestampTicks) ?? []
      positions.push(Object.freeze({
        trackNumber: keyframe.trackNumber,
        clusterPosition: clusterPositions[clusterIndex],
      }))
      positionsByTimestamp.set(keyframe.timestampTicks, positions)
    }
  }
  const points: ByteNode[] = []
  for (const [timestampTicks, positions] of positionsByTimestamp) {
    const children: ByteNode[] = [u([0xb3], timestampTicks)]
    for (const position of positions) {
      children.push(element([0xb7], sequence([
        u([0xf7], position.trackNumber),
        u([0xf1], position.clusterPosition),
      ])))
    }
    points.push(element([0xbb], sequence(children)))
  }
  return element(IDS.cues, sequence(points))
}

function validateTrackSet(input: XrV2EncodedTrackSet): XrV2MuxResult | null {
  if (!input || input.schema !== XR_V2_ENCODED_TRACK_SET_SCHEMA || !Array.isArray(input.tracks)) {
    return { status: 'invalid', reason: 'invalid-track-set', detail: 'Track-set schema is invalid.' }
  }
  if (input.tracks.length < 1 || input.tracks.length > XR_V2_MUX_LIMITS.maxTracks) {
    return { status: 'invalid', reason: 'track-limit-exceeded', detail: 'WebM requires one to four video tracks.' }
  }
  let encodedBytes = 0
  let maximumEndUs = 0
  for (const track of input.tracks) {
    if (!track || track.kind !== 'video' || (track.codec !== 'vp8' && track.codec !== 'vp9')) {
      return { status: 'invalid', reason: 'unsupported-codec', detail: 'Only VP8 and VP9 WebCodecs tracks are admitted.' }
    }
    if (!Number.isInteger(track.width) || track.width < 1 || track.width > 8_192
      || !Number.isInteger(track.height) || track.height < 1 || track.height > 8_192
      || !Number.isFinite(track.frameRate) || track.frameRate < XR_V2_MUX_LIMITS.minFrameRate
      || track.frameRate > XR_V2_MUX_LIMITS.maxFrameRate
      || !Array.isArray(track.samples) || track.samples.length < 1) {
      return { status: 'invalid', reason: 'invalid-track-set', detail: 'Video track metadata is outside the admitted bounds.' }
    }
    if (track.samples.length > XR_V2_MUX_LIMITS.maxSamplesPerTrack) {
      return { status: 'invalid', reason: 'sample-limit-exceeded', detail: 'Encoded sample count exceeds the bounded mux limit.' }
    }
    if (track.samples[0]?.type !== 'key') {
      return { status: 'invalid', reason: 'missing-keyframe', detail: 'Every encoded video track must start with a keyframe.' }
    }
    let previousTimestamp = -1
    let previousTimestampTicks = -1
    let declaredDurationUs: number | null = null
    let vp9Metadata: Readonly<{
      profile: number
      bitDepth: number
      chromaSubsampling: number
      colorSpace: number
    }> | null = null
    for (const sample of track.samples) {
      if (!sample || (sample.type !== 'key' && sample.type !== 'delta')
        || !(sample.data instanceof Uint8Array) || sample.data.byteLength < 1
        || !Number.isSafeInteger(sample.timestampUs) || sample.timestampUs < 0
        || !Number.isSafeInteger(sample.durationUs) || sample.durationUs <= 0
        || sample.timestampUs <= previousTimestamp) {
        return { status: 'invalid', reason: 'invalid-sample-order', detail: 'Samples require strictly increasing timestamps and positive durations.' }
      }
      if (sample.timestampUs > Number.MAX_SAFE_INTEGER - sample.durationUs) {
        return { status: 'invalid', reason: 'duration-limit-exceeded', detail: 'Encoded sample end time exceeds the safe timestamp range.' }
      }
      if (declaredDurationUs === null) declaredDurationUs = sample.durationUs
      const expectedDurationUs = 1_000_000 / track.frameRate
      if (sample.durationUs !== declaredDurationUs || Math.abs(sample.durationUs - expectedDurationUs) > 1) {
        return {
          status: 'invalid',
          reason: 'invalid-sample-duration',
          detail: 'DefaultDuration requires constant sample durations matching the declared frame rate within one microsecond.',
        }
      }
      if (track.codec === 'vp9' && sample.type === 'key') {
        const inspected = inspectXrV2Vp9Keyframe(sample.data, track.width, track.height)
        if (inspected.status !== 'ready') {
          return { status: 'invalid', reason: 'invalid-codec-data', detail: inspected.detail }
        }
        const metadata = inspected.metadata
        if (vp9Metadata && (metadata.profile !== vp9Metadata.profile
          || metadata.bitDepth !== vp9Metadata.bitDepth
          || metadata.chromaSubsampling !== vp9Metadata.chromaSubsampling
          || metadata.colorSpace !== vp9Metadata.colorSpace)) {
          return {
            status: 'invalid',
            reason: 'invalid-codec-data',
            detail: 'VP9 keyframes change profile, bit depth, chroma subsampling, or color space within one track.',
          }
        }
        vp9Metadata = metadata
      }
      const sampleEndUs = sample.timestampUs + sample.durationUs
      const timestampTicks = Math.round(sample.timestampUs * 1_000 / TIMECODE_SCALE_NS)
      if (timestampTicks <= previousTimestampTicks) {
        return { status: 'invalid', reason: 'invalid-sample-order', detail: 'Samples collapse to a repeated WebM timestamp at the admitted timecode scale.' }
      }
      previousTimestamp = sample.timestampUs
      previousTimestampTicks = timestampTicks
      if (sample.data.byteLength > XR_V2_MUX_LIMITS.maxEncodedBytes - encodedBytes) {
        return { status: 'invalid', reason: 'byte-limit-exceeded', detail: 'Encoded payload bytes exceed the bounded mux limit.' }
      }
      encodedBytes += sample.data.byteLength
      if (sampleEndUs > maximumEndUs) maximumEndUs = sampleEndUs
    }
  }
  if (maximumEndUs > XR_V2_MUX_LIMITS.maxDurationUs) {
    return { status: 'invalid', reason: 'duration-limit-exceeded', detail: 'Encoded duration exceeds the bounded mux limit.' }
  }
  return null
}

export function muxXrV2EncodedTracksToWebm(input: XrV2EncodedTrackSet): XrV2MuxResult {
  const invalid = validateTrackSet(input)
  if (invalid) return invalid

  try {
    const ordered: OrderedSample[] = []
    let durationUs = 0
    for (let trackIndex = 0; trackIndex < input.tracks.length; trackIndex += 1) {
      const track = input.tracks[trackIndex]
      for (const sample of track.samples) {
        ordered.push(Object.freeze({
          trackNumber: trackIndex + 1,
          sample,
          timestampTicks: Math.round(sample.timestampUs * 1_000 / TIMECODE_SCALE_NS),
        }))
        const sampleEndUs = sample.timestampUs + sample.durationUs
        if (sampleEndUs > durationUs) durationUs = sampleEndUs
      }
    }
    ordered.sort((left, right) => left.timestampTicks - right.timestampTicks
      || left.trackNumber - right.trackNumber)

    const header = element(IDS.ebml, sequence([
      u([0x42, 0x86], 1),
      u([0x42, 0xf7], 1),
      u([0x42, 0xf2], 4),
      u([0x42, 0xf3], 8),
      s([0x42, 0x82], 'webm'),
      u([0x42, 0x87], 4),
      u([0x42, 0x85], 2),
    ]))
    const info = element(IDS.info, sequence([
      u([0x2a, 0xd7, 0xb1], TIMECODE_SCALE_NS),
      s([0x4d, 0x80], 'AgenticGraph XR v2'),
      s([0x57, 0x41], 'AgenticGraph XR v2'),
      binary([0x44, 0x89], float64(durationUs * 1_000 / TIMECODE_SCALE_NS)),
    ]))
    const tracks = element(IDS.tracks, sequence(input.tracks.map(trackEntry)))
    const clusterBuilds = buildClusters(ordered)
    let seekHead = buildSeekHead({ info: 0, tracks: info.byteLength, cues: info.byteLength + tracks.byteLength })
    let cues = element(IDS.cues, sequence([]))
    let stable = false
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const previousCuesLength = cues.byteLength
      const clusterPositions: number[] = []
      const cuesPosition = seekHead.byteLength + info.byteLength + tracks.byteLength
      let position = cuesPosition + cues.byteLength
      for (const cluster of clusterBuilds) {
        clusterPositions.push(position)
        position += cluster.node.byteLength
      }
      const nextCues = buildCues(clusterBuilds, clusterPositions)
      const nextSeekHead = buildSeekHead({
        info: seekHead.byteLength,
        tracks: seekHead.byteLength + info.byteLength,
        cues: cuesPosition,
      })
      stable = nextSeekHead.byteLength === seekHead.byteLength
        && nextCues.byteLength === previousCuesLength
      seekHead = nextSeekHead
      cues = nextCues
      if (stable) break
    }
    if (!stable) throw new ContainerLimitError('WebM seek metadata did not stabilize within the bounded pass count.')

    const segmentParts: ByteNode[] = [seekHead, info, tracks, cues]
    for (const cluster of clusterBuilds) segmentParts.push(cluster.node)
    const segment = element(IDS.segment, sequence(segmentParts))
    const bytes = flatten(sequence([header, segment]))
    return {
      status: 'ready',
      container: Object.freeze({
        schema: XR_V2_MUXED_CONTAINER_SCHEMA,
        container: 'webm',
        mimeType: 'video/webm',
        bytes,
        trackCount: input.tracks.length,
        durationUs,
      }),
    }
  } catch (error) {
    if (!(error instanceof ContainerLimitError)) throw error
    return {
      status: 'invalid',
      reason: 'container-limit-exceeded',
      detail: error.message,
    }
  }
}
