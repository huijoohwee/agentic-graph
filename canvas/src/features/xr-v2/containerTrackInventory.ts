import {
  inspectXrV2Vp9CodecPrivate,
  inspectXrV2Vp9Keyframe,
  XR_V2_MUX_LIMITS,
  type XrV2Vp9CodecPrivateMetadata,
} from './encodedTrackMuxContracts'

export const XR_V2_CONTAINER_INVENTORY_SCHEMA = 'knowgrph-xr-v2-container-inventory/v1' as const

export type XrV2ContainerSampleEvidence = Readonly<{
  sampleIndex: number
  timestampTicks: number
  timestampNs: number
  timestampUs: number
  keyframe: boolean
  clusterPosition: number
  payloadOffset: number
  payloadEnd: number
  payloadByteLength: number
  payloadHash: `fnv1a32:${string}`
}>

export type XrV2ContainerTrackInventory = Readonly<{
  schema: typeof XR_V2_CONTAINER_INVENTORY_SCHEMA
  container: 'webm'
  timecodeScaleNs: number
  durationUs: number
  clusterCount: number
  seekHeadEntryCount: number
  cuePointCount: number
  cueTrackPositionCount: number
  tracks: readonly Readonly<{
    trackNumber: number
    kind: 'video'
    codec: 'vp8' | 'vp9'
    codecId: 'V_VP8' | 'V_VP9'
    defaultTrack: boolean
    codecPrivateByteLength: number
    vp9: XrV2Vp9CodecPrivateMetadata | null
    width: number
    height: number
    defaultDurationNs: number
    sampleCount: number
    keyframeCount: number
    encodedByteLength: number
    samples: readonly XrV2ContainerSampleEvidence[]
  }>[]
}>

type ElementView = Readonly<{
  id: number
  start: number
  dataStart: number
  dataEnd: number
}>

type ParseBudget = { elementCount: number }

const IDS = Object.freeze({
  ebml: 0x1a45dfa3,
  segment: 0x18538067,
  seekHead: 0x114d9b74,
  info: 0x1549a966,
  tracks: 0x1654ae6b,
  cluster: 0x1f43b675,
  cues: 0x1c53bb6b,
})

const MAX_PARSED_ELEMENTS = XR_V2_MUX_LIMITS.maxTracks * XR_V2_MUX_LIMITS.maxSamplesPerTrack * 8 + 16_384
const utf8Decoder = new TextDecoder('utf-8', { fatal: true })

function vintLength(firstByte: number): number {
  for (let length = 1; length <= 8; length += 1) {
    if ((firstByte & (1 << (8 - length))) !== 0) return length
  }
  throw new Error('invalid EBML variable integer')
}

function readId(bytes: Uint8Array, offset: number): Readonly<{ value: number; length: number }> {
  if (offset >= bytes.length) throw new Error('truncated EBML id')
  const length = vintLength(bytes[offset])
  if (length > 4 || offset + length > bytes.length) throw new Error('invalid EBML id length')
  let value = 0
  for (let index = 0; index < length; index += 1) value = value * 256 + bytes[offset + index]
  return { value, length }
}

function readSize(bytes: Uint8Array, offset: number): Readonly<{ value: number; length: number }> {
  if (offset >= bytes.length) throw new Error('truncated EBML size')
  const length = vintLength(bytes[offset])
  if (offset + length > bytes.length) throw new Error('invalid EBML size length')
  const firstPayloadMask = (1 << (8 - length)) - 1
  let unknownSize = (bytes[offset] & firstPayloadMask) === firstPayloadMask
  for (let index = 1; index < length; index += 1) unknownSize &&= bytes[offset + index] === 0xff
  if (unknownSize) throw new Error('unknown-size EBML elements are not admitted')

  let value = bytes[offset] & firstPayloadMask
  for (let index = 1; index < length; index += 1) {
    const next = bytes[offset + index]
    if (value > Math.floor((Number.MAX_SAFE_INTEGER - next) / 256)) {
      throw new Error('EBML size exceeds safe integer range')
    }
    value = value * 256 + next
  }
  return { value, length }
}

function elements(
  bytes: Uint8Array,
  budget: ParseBudget,
  start = 0,
  end = bytes.length,
): ElementView[] {
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end)
    || start < 0 || end < start || end > bytes.length) {
    throw new Error('invalid EBML parent boundary')
  }
  const output: ElementView[] = []
  let offset = start
  while (offset < end) {
    budget.elementCount += 1
    if (budget.elementCount > MAX_PARSED_ELEMENTS) throw new Error('EBML element count exceeds the parser bound')
    const id = readId(bytes, offset)
    const size = readSize(bytes, offset + id.length)
    const dataStart = offset + id.length + size.length
    if (size.value > end - dataStart) throw new Error('EBML element exceeds its parent boundary')
    const dataEnd = dataStart + size.value
    output.push({ id: id.value, start: offset, dataStart, dataEnd })
    offset = dataEnd
  }
  if (offset !== end) throw new Error('EBML elements do not exactly cover their parent')
  return output
}

function rejectUnknown(children: readonly ElementView[], allowed: ReadonlySet<number>, label: string): void {
  const unknown = children.find(child => !allowed.has(child.id))
  if (unknown) throw new Error(`${label} contains unsupported element 0x${unknown.id.toString(16)}`)
}

function one(
  children: readonly ElementView[],
  id: number,
  label: string,
  required = true,
): ElementView | undefined {
  let match: ElementView | undefined
  for (const child of children) {
    if (child.id !== id) continue
    if (match) throw new Error(`${label} is duplicated`)
    match = child
  }
  if (required && !match) throw new Error(`${label} is missing`)
  return match
}

function readUint(bytes: Uint8Array, element: ElementView): number {
  const byteLength = element.dataEnd - element.dataStart
  if (byteLength < 1 || byteLength > 8) throw new Error('invalid EBML unsigned integer width')
  let value = 0
  for (let offset = element.dataStart; offset < element.dataEnd; offset += 1) {
    const next = bytes[offset]
    if (value > Math.floor((Number.MAX_SAFE_INTEGER - next) / 256)) {
      throw new Error('EBML integer exceeds safe range')
    }
    value = value * 256 + next
  }
  return value
}

function readFloat(bytes: Uint8Array, element: ElementView): number {
  const byteLength = element.dataEnd - element.dataStart
  const view = new DataView(bytes.buffer, bytes.byteOffset + element.dataStart, byteLength)
  const value = byteLength === 4 ? view.getFloat32(0, false)
    : byteLength === 8 ? view.getFloat64(0, false)
      : Number.NaN
  if (!Number.isFinite(value) || value <= 0) throw new Error('invalid EBML duration')
  return value
}

function readText(bytes: Uint8Array, element: ElementView): string {
  return utf8Decoder.decode(bytes.subarray(element.dataStart, element.dataEnd))
}

function readBinaryId(bytes: Uint8Array, element: ElementView): number {
  const byteLength = element.dataEnd - element.dataStart
  if (byteLength < 1 || byteLength > 4) throw new Error('invalid SeekID width')
  let value = 0
  for (let offset = element.dataStart; offset < element.dataEnd; offset += 1) {
    value = value * 256 + bytes[offset]
  }
  return value
}

function parseBlockTrackNumber(
  bytes: Uint8Array,
  offset: number,
  end: number,
): Readonly<{ number: number; length: number }> {
  if (offset >= end) throw new Error('WebM SimpleBlock track number is truncated')
  const length = vintLength(bytes[offset])
  if (length > 2 || offset + length > end) throw new Error('invalid WebM block track number')
  const firstPayloadMask = (1 << (8 - length)) - 1
  let value = bytes[offset] & firstPayloadMask
  for (let index = 1; index < length; index += 1) value = value * 256 + bytes[offset + index]
  if (value < 1 || value > XR_V2_MUX_LIMITS.maxTracks) throw new Error('WebM block track number is outside the admitted range')
  return { number: value, length }
}

function fnv1a32(bytes: Uint8Array, start: number, end: number): `fnv1a32:${string}` {
  let hash = 0x811c9dc5
  for (let offset = start; offset < end; offset += 1) {
    hash = Math.imul(hash ^ bytes[offset], 0x01000193) >>> 0
  }
  return `fnv1a32:${hash.toString(16).padStart(8, '0')}`
}

export function verifyXrV2WebmSamplePayload(
  containerBytes: Uint8Array,
  evidence: XrV2ContainerSampleEvidence,
  expectedPayload: Uint8Array,
): boolean {
  if (!(containerBytes instanceof Uint8Array) || !(expectedPayload instanceof Uint8Array)
    || !Number.isSafeInteger(evidence.payloadOffset) || !Number.isSafeInteger(evidence.payloadEnd)
    || evidence.payloadOffset < 0 || evidence.payloadEnd < evidence.payloadOffset
    || evidence.payloadEnd > containerBytes.byteLength
    || evidence.payloadEnd - evidence.payloadOffset !== evidence.payloadByteLength
    || expectedPayload.byteLength !== evidence.payloadByteLength
    || fnv1a32(containerBytes, evidence.payloadOffset, evidence.payloadEnd) !== evidence.payloadHash) {
    return false
  }
  for (let index = 0; index < expectedPayload.byteLength; index += 1) {
    if (containerBytes[evidence.payloadOffset + index] !== expectedPayload[index]) return false
  }
  return true
}

type MutableTrack = {
  trackNumber: number
  kind: 'video'
  codec: 'vp8' | 'vp9'
  codecId: 'V_VP8' | 'V_VP9'
  defaultTrack: boolean
  codecPrivateByteLength: number
  vp9: XrV2Vp9CodecPrivateMetadata | null
  width: number
  height: number
  defaultDurationNs: number
  sampleCount: number
  keyframeCount: number
  encodedByteLength: number
  samples: XrV2ContainerSampleEvidence[]
}

function parseEbmlHeader(bytes: Uint8Array, budget: ParseBudget, header: ElementView): void {
  const children = elements(bytes, budget, header.dataStart, header.dataEnd)
  rejectUnknown(children, new Set([0x4286, 0x42f7, 0x42f2, 0x42f3, 0x4282, 0x4287, 0x4285]), 'EBML header')
  const version = one(children, 0x4286, 'EBMLVersion')
  const readVersion = one(children, 0x42f7, 'EBMLReadVersion')
  const maxIdLength = one(children, 0x42f2, 'EBMLMaxIDLength')
  const maxSizeLength = one(children, 0x42f3, 'EBMLMaxSizeLength')
  const docType = one(children, 0x4282, 'DocType')
  const docTypeVersion = one(children, 0x4287, 'DocTypeVersion')
  const docTypeReadVersion = one(children, 0x4285, 'DocTypeReadVersion')
  if (readUint(bytes, version!) !== 1 || readUint(bytes, readVersion!) !== 1
    || readUint(bytes, maxIdLength!) !== 4 || readUint(bytes, maxSizeLength!) !== 8
    || readText(bytes, docType!) !== 'webm'
    || readUint(bytes, docTypeVersion!) < 1 || readUint(bytes, docTypeReadVersion!) < 1) {
    throw new Error('EBML header is not an admitted WebM DocType')
  }
}

function parseInfo(
  bytes: Uint8Array,
  budget: ParseBudget,
  info: ElementView,
): Readonly<{ timecodeScaleNs: number; durationUs: number }> {
  const children = elements(bytes, budget, info.dataStart, info.dataEnd)
  rejectUnknown(children, new Set([0x2ad7b1, 0x4d80, 0x5741, 0x4489]), 'WebM Info')
  const scale = one(children, 0x2ad7b1, 'TimecodeScale')
  const duration = one(children, 0x4489, 'Duration')
  one(children, 0x4d80, 'MuxingApp')
  one(children, 0x5741, 'WritingApp')
  const timecodeScaleNs = readUint(bytes, scale!)
  const durationTicks = readFloat(bytes, duration!)
  if (timecodeScaleNs < 1 || timecodeScaleNs > 1_000_000_000
    || durationTicks > Number.MAX_SAFE_INTEGER / timecodeScaleNs) {
    throw new Error('WebM timing metadata exceeds the safe range')
  }
  const durationUs = durationTicks * timecodeScaleNs / 1_000
  if (!Number.isFinite(durationUs) || durationUs <= 0 || durationUs > XR_V2_MUX_LIMITS.maxDurationUs) {
    throw new Error('WebM duration exceeds the admitted bound')
  }
  return Object.freeze({ timecodeScaleNs, durationUs })
}

function parseTracks(bytes: Uint8Array, budget: ParseBudget, tracksElement: ElementView): MutableTrack[] {
  const entries = elements(bytes, budget, tracksElement.dataStart, tracksElement.dataEnd)
  if (entries.length < 1 || entries.length > XR_V2_MUX_LIMITS.maxTracks
    || entries.some(entry => entry.id !== 0xae)) {
    throw new Error('WebM Tracks must contain one to four TrackEntry elements')
  }
  const trackNumbers = new Set<number>()
  const trackUids = new Set<number>()
  const tracks = entries.map(entry => {
    const children = elements(bytes, budget, entry.dataStart, entry.dataEnd)
    rejectUnknown(children, new Set([0xd7, 0x73c5, 0x83, 0x88, 0x86, 0x9c, 0x23e383, 0x63a2, 0xe0]), 'WebM TrackEntry')
    const numberElement = one(children, 0xd7, 'TrackNumber')
    const uidElement = one(children, 0x73c5, 'TrackUID')
    const kindElement = one(children, 0x83, 'TrackType')
    const defaultElement = one(children, 0x88, 'FlagDefault')
    const codecElement = one(children, 0x86, 'CodecID')
    const lacingElement = one(children, 0x9c, 'FlagLacing')
    const defaultDurationElement = one(children, 0x23e383, 'DefaultDuration')
    const codecPrivateElement = one(children, 0x63a2, 'CodecPrivate', false)
    const video = one(children, 0xe0, 'Video')
    const trackNumber = readUint(bytes, numberElement!)
    const trackUid = readUint(bytes, uidElement!)
    const codecId = readText(bytes, codecElement!)
    const defaultDurationNs = readUint(bytes, defaultDurationElement!)
    const defaultValue = readUint(bytes, defaultElement!)
    if (trackNumber < 1 || trackNumber > XR_V2_MUX_LIMITS.maxTracks || trackNumbers.has(trackNumber)
      || trackUid < 1 || trackUids.has(trackUid) || readUint(bytes, kindElement!) !== 1
      || readUint(bytes, lacingElement!) !== 0 || (defaultValue !== 0 && defaultValue !== 1) || defaultDurationNs < 1
      || (codecId !== 'V_VP8' && codecId !== 'V_VP9')) {
      throw new Error('WebM video track metadata is invalid or duplicated')
    }
    trackNumbers.add(trackNumber)
    trackUids.add(trackUid)
    const videoChildren = elements(bytes, budget, video!.dataStart, video!.dataEnd)
    rejectUnknown(videoChildren, new Set([0xb0, 0xba]), 'WebM Video')
    const widthElement = one(videoChildren, 0xb0, 'PixelWidth')
    const heightElement = one(videoChildren, 0xba, 'PixelHeight')
    const width = readUint(bytes, widthElement!)
    const height = readUint(bytes, heightElement!)
    if (width < 1 || width > 8_192 || height < 1 || height > 8_192) {
      throw new Error('WebM video dimensions exceed the admitted bounds')
    }
    let vp9: XrV2Vp9CodecPrivateMetadata | null = null
    if (codecId === 'V_VP9') {
      if (!codecPrivateElement) throw new Error('VP9 CodecPrivate is missing')
      const inspected = inspectXrV2Vp9CodecPrivate(
        bytes.subarray(codecPrivateElement.dataStart, codecPrivateElement.dataEnd),
      )
      if (inspected.status !== 'ready') throw new Error(inspected.detail)
      vp9 = inspected.metadata
    } else if (codecPrivateElement) {
      throw new Error('VP8 must not declare VP9 CodecPrivate metadata')
    }
    return {
      trackNumber,
      kind: 'video' as const,
      codec: codecId === 'V_VP8' ? 'vp8' as const : 'vp9' as const,
      codecId: codecId as 'V_VP8' | 'V_VP9',
      defaultTrack: defaultValue === 1,
      codecPrivateByteLength: codecPrivateElement ? codecPrivateElement.dataEnd - codecPrivateElement.dataStart : 0,
      vp9,
      width,
      height,
      defaultDurationNs,
      sampleCount: 0,
      keyframeCount: 0,
      encodedByteLength: 0,
      samples: [],
    }
  })
  if (tracks.filter(track => track.defaultTrack).length !== 1) {
    throw new Error('WebM video tracks require exactly one default track')
  }
  return tracks
}

function parseSeekHead(
  bytes: Uint8Array,
  budget: ParseBudget,
  seekHead: ElementView,
  segment: ElementView,
  segmentChildren: readonly ElementView[],
): number {
  const entries = elements(bytes, budget, seekHead.dataStart, seekHead.dataEnd)
  if (entries.length < 1 || entries.some(entry => entry.id !== 0x4dbb)) {
    throw new Error('WebM SeekHead contains invalid entries')
  }
  const targets = new Set<number>()
  for (const entry of entries) {
    const children = elements(bytes, budget, entry.dataStart, entry.dataEnd)
    rejectUnknown(children, new Set([0x53ab, 0x53ac]), 'WebM Seek')
    const idElement = one(children, 0x53ab, 'SeekID')
    const positionElement = one(children, 0x53ac, 'SeekPosition')
    const targetId = readBinaryId(bytes, idElement!)
    const position = readUint(bytes, positionElement!)
    if (targets.has(targetId)) throw new Error('WebM Seek target is duplicated')
    targets.add(targetId)
    if (position > segment.dataEnd - segment.dataStart) throw new Error('WebM SeekPosition exceeds the Segment')
    const target = segmentChildren.find(child => child.start === segment.dataStart + position)
    if (!target || target.id !== targetId) throw new Error('WebM SeekPosition does not identify its declared element')
  }
  for (const required of [IDS.info, IDS.tracks, IDS.cues]) {
    if (!targets.has(required)) throw new Error('WebM SeekHead is missing a required target')
  }
  return entries.length
}

function parseCues(
  bytes: Uint8Array,
  budget: ParseBudget,
  cues: ElementView,
  tracksByNumber: ReadonlyMap<number, MutableTrack>,
  clusterPositions: ReadonlySet<number>,
): Readonly<{ cuePointCount: number; cueTrackPositionCount: number }> {
  const points = elements(bytes, budget, cues.dataStart, cues.dataEnd)
  if (points.length < 1 || points.some(point => point.id !== 0xbb)) {
    throw new Error('WebM Cues must contain CuePoint elements')
  }
  const keyframes = new Map<string, XrV2ContainerSampleEvidence>()
  let keyframeCount = 0
  for (const track of tracksByNumber.values()) {
    for (const sample of track.samples) {
      if (!sample.keyframe) continue
      keyframeCount += 1
      keyframes.set(`${track.trackNumber}:${sample.timestampTicks}`, sample)
    }
  }
  const seen = new Set<string>()
  const seenCueTimes = new Set<number>()
  for (const point of points) {
    const children = elements(bytes, budget, point.dataStart, point.dataEnd)
    rejectUnknown(children, new Set([0xb3, 0xb7]), 'WebM CuePoint')
    const timeElement = one(children, 0xb3, 'CueTime')
    const cueTime = readUint(bytes, timeElement!)
    if (seenCueTimes.has(cueTime)) throw new Error('WebM CueTime is duplicated across CuePoint elements')
    seenCueTimes.add(cueTime)
    const positionElements = children.filter(child => child.id === 0xb7)
    if (positionElements.length < 1) throw new Error('CueTrackPositions is missing')
    for (const positionsElement of positionElements) {
      const positionChildren = elements(bytes, budget, positionsElement.dataStart, positionsElement.dataEnd)
      rejectUnknown(positionChildren, new Set([0xf7, 0xf1]), 'WebM CueTrackPositions')
      const trackElement = one(positionChildren, 0xf7, 'CueTrack')
      const clusterElement = one(positionChildren, 0xf1, 'CueClusterPosition')
      const trackNumber = readUint(bytes, trackElement!)
      const clusterPosition = readUint(bytes, clusterElement!)
      const key = `${trackNumber}:${cueTime}`
      const sample = keyframes.get(key)
      if (!tracksByNumber.has(trackNumber) || !clusterPositions.has(clusterPosition)
        || !sample || sample.clusterPosition !== clusterPosition || seen.has(key)) {
        throw new Error('WebM CuePoint does not identify one unique keyframe')
      }
      seen.add(key)
    }
  }
  if (seen.size !== keyframeCount) throw new Error('WebM Cues do not cover every keyframe')
  return Object.freeze({ cuePointCount: points.length, cueTrackPositionCount: seen.size })
}

export function inspectXrV2WebmContainer(bytes: Uint8Array): XrV2ContainerTrackInventory {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength < 16) throw new Error('WebM bytes are missing')
  if (bytes.byteLength > XR_V2_MUX_LIMITS.maxContainerBytes) throw new Error('WebM container exceeds the parser byte bound')
  const budget: ParseBudget = { elementCount: 0 }
  const top = elements(bytes, budget)
  if (top.length !== 2 || top[0].id !== IDS.ebml || top[1].id !== IDS.segment) {
    throw new Error('WebM requires exactly one EBML header followed by one Segment')
  }
  const [header, segment] = top
  parseEbmlHeader(bytes, budget, header)

  const segmentChildren = elements(bytes, budget, segment.dataStart, segment.dataEnd)
  rejectUnknown(segmentChildren, new Set([
    IDS.seekHead, IDS.info, IDS.tracks, IDS.cluster, IDS.cues,
  ]), 'WebM Segment')
  const seekHead = one(segmentChildren, IDS.seekHead, 'SeekHead')
  const infoElement = one(segmentChildren, IDS.info, 'Info')
  const tracksElement = one(segmentChildren, IDS.tracks, 'Tracks')
  const cuesElement = one(segmentChildren, IDS.cues, 'Cues')
  const clusters = segmentChildren.filter(child => child.id === IDS.cluster)
  if (clusters.length < 1) throw new Error('WebM Cluster element is missing')
  const seekIndex = segmentChildren.indexOf(seekHead!)
  const infoIndex = segmentChildren.indexOf(infoElement!)
  const tracksIndex = segmentChildren.indexOf(tracksElement!)
  const cuesIndex = segmentChildren.indexOf(cuesElement!)
  if (seekIndex !== 0 || infoIndex !== 1 || tracksIndex !== 2 || cuesIndex !== 3
    || clusters.some((cluster, index) => segmentChildren[index + 4] !== cluster)) {
    throw new Error('WebM Segment children are not in the admitted seekable order')
  }

  const timing = parseInfo(bytes, budget, infoElement!)
  const tracks = parseTracks(bytes, budget, tracksElement!)
  const byNumber = new Map(tracks.map(track => [track.trackNumber, track]))
  const clusterPositions = new Set<number>()
  let totalEncodedBytes = 0
  for (const cluster of clusters) {
    const clusterPosition = cluster.start - segment.dataStart
    clusterPositions.add(clusterPosition)
    const children = elements(bytes, budget, cluster.dataStart, cluster.dataEnd)
    rejectUnknown(children, new Set([0xe7, 0xa3]), 'WebM Cluster')
    const timecodeElement = one(children, 0xe7, 'Cluster Timecode')
    if (children[0] !== timecodeElement) throw new Error('WebM Cluster Timecode must precede its blocks')
    const blocks = children.filter(child => child.id === 0xa3)
    if (blocks.length < 1) throw new Error('WebM Cluster contains no SimpleBlock')
    const clusterTimecode = readUint(bytes, timecodeElement!)
    for (const block of blocks) {
      const parsedTrack = parseBlockTrackNumber(bytes, block.dataStart, block.dataEnd)
      const relativeOffset = block.dataStart + parsedTrack.length
      const flagsOffset = relativeOffset + 2
      const payloadOffset = flagsOffset + 1
      if (payloadOffset >= block.dataEnd) throw new Error('WebM SimpleBlock has no encoded payload')
      let relativeTimecode = bytes[relativeOffset] * 256 + bytes[relativeOffset + 1]
      if (relativeTimecode >= 0x8000) relativeTimecode -= 0x1_0000
      const flags = bytes[flagsOffset]
      if ((flags & 0x06) !== 0) throw new Error('Laced WebM blocks are not admitted')
      const timestampTicks = clusterTimecode + relativeTimecode
      if (!Number.isSafeInteger(timestampTicks) || timestampTicks < 0
        || timestampTicks > Math.floor(Number.MAX_SAFE_INTEGER / timing.timecodeScaleNs)) {
        throw new Error('WebM block timestamp exceeds the safe range')
      }
      const timestampNs = timestampTicks * timing.timecodeScaleNs
      const timestampUs = timestampNs / 1_000
      if (timestampUs > timing.durationUs) throw new Error('WebM block timestamp exceeds declared Duration')
      const track = byNumber.get(parsedTrack.number)
      if (!track) throw new Error('WebM SimpleBlock references an unknown track')
      if (track.sampleCount >= XR_V2_MUX_LIMITS.maxSamplesPerTrack) {
        throw new Error('WebM sample count exceeds the parser bound')
      }
      const previous = track.samples.at(-1)
      if (previous && timestampTicks <= previous.timestampTicks) {
        throw new Error('WebM track timestamps are not strictly increasing')
      }
      const keyframe = (flags & 0x80) !== 0
      if (!previous && !keyframe) throw new Error('WebM track does not begin with a keyframe')
      if (keyframe && track.codec === 'vp9') {
        const inspected = inspectXrV2Vp9Keyframe(
          bytes.subarray(payloadOffset, block.dataEnd),
          track.width,
          track.height,
        )
        if (inspected.status !== 'ready') throw new Error(inspected.detail)
        if (!track.vp9 || inspected.metadata.profile !== track.vp9.profile
          || inspected.metadata.bitDepth !== track.vp9.bitDepth
          || inspected.metadata.chromaSubsampling !== track.vp9.chromaSubsampling) {
          throw new Error('VP9 CodecPrivate conflicts with the canonical keyframe header')
        }
      }
      const payloadByteLength = block.dataEnd - payloadOffset
      if (payloadByteLength > XR_V2_MUX_LIMITS.maxEncodedBytes - totalEncodedBytes) {
        throw new Error('WebM encoded payload exceeds the parser byte bound')
      }
      totalEncodedBytes += payloadByteLength
      const sample: XrV2ContainerSampleEvidence = Object.freeze({
        sampleIndex: track.sampleCount,
        timestampTicks,
        timestampNs,
        timestampUs,
        keyframe,
        clusterPosition,
        payloadOffset,
        payloadEnd: block.dataEnd,
        payloadByteLength,
        payloadHash: fnv1a32(bytes, payloadOffset, block.dataEnd),
      })
      track.samples.push(sample)
      track.sampleCount += 1
      track.keyframeCount += Number(keyframe)
      track.encodedByteLength += payloadByteLength
    }
  }
  if (tracks.some(track => track.sampleCount < 1 || track.keyframeCount < 1)) {
    throw new Error('WebM inventory contains an empty or unkeyed track')
  }
  const seekHeadEntryCount = parseSeekHead(bytes, budget, seekHead!, segment, segmentChildren)
  const cueInventory = parseCues(bytes, budget, cuesElement!, byNumber, clusterPositions)

  return Object.freeze({
    schema: XR_V2_CONTAINER_INVENTORY_SCHEMA,
    container: 'webm',
    timecodeScaleNs: timing.timecodeScaleNs,
    durationUs: timing.durationUs,
    clusterCount: clusters.length,
    seekHeadEntryCount,
    cuePointCount: cueInventory.cuePointCount,
    cueTrackPositionCount: cueInventory.cueTrackPositionCount,
    tracks: Object.freeze(tracks.map(track => Object.freeze({
      ...track,
      samples: Object.freeze([...track.samples]),
    }))),
  })
}
