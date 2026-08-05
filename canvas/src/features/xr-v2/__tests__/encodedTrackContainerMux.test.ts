import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  inspectXrV2WebmContainer,
  verifyXrV2WebmSamplePayload,
} from '../containerTrackInventory'
import { XR_V2_ENCODED_TRACK_SET_SCHEMA } from '../encodedTrackMuxContracts'
import { muxXrV2EncodedTracksToWebm } from '../webmEncodedTrackMuxer'

function findSequence(bytes: Uint8Array, sequence: readonly number[], fromEnd = false): number {
  const indexes: number[] = []
  for (let offset = 0; offset <= bytes.byteLength - sequence.length; offset += 1) {
    let matches = true
    for (let index = 0; index < sequence.length; index += 1) {
      if (bytes[offset + index] !== sequence[index]) {
        matches = false
        break
      }
    }
    if (matches) indexes.push(offset)
  }
  const result = fromEnd ? indexes.at(-1) : indexes[0]
  assert.notEqual(result, undefined, `expected byte sequence ${sequence.join(',')}`)
  return result!
}

function createVp9Profile0Keyframe(width: number, height: number): Uint8Array {
  const bits: number[] = []
  const write = (value: number, widthBits: number) => {
    for (let index = widthBits - 1; index >= 0; index -= 1) bits.push((value >> index) & 1)
  }
  write(2, 2) // frame marker
  write(0, 1) // profile low
  write(0, 1) // profile high
  write(0, 1) // do not show an existing frame
  write(0, 1) // keyframe
  write(1, 1) // show frame
  write(0, 1) // error resilient
  write(0x49, 8)
  write(0x83, 8)
  write(0x42, 8)
  write(1, 3) // BT.601-like non-RGB color space
  write(0, 1) // studio range; profile 0 implies 4:2:0
  write(width - 1, 16)
  write(height - 1, 16)
  write(0, 1) // render dimensions equal coded dimensions
  while (bits.length % 8 !== 0) bits.push(0)
  const output = new Uint8Array(bits.length / 8)
  for (let index = 0; index < bits.length; index += 1) {
    output[Math.floor(index / 8)] |= bits[index] << (7 - (index % 8))
  }
  return output
}

function createContainer() {
  const sampleBytes = [
    Uint8Array.of(1, 2, 3, 4),
    Uint8Array.of(5, 6, 7),
    createVp9Profile0Keyframe(80, 45),
  ] as const
  const result = muxXrV2EncodedTracksToWebm({
    schema: XR_V2_ENCODED_TRACK_SET_SCHEMA,
    tracks: [
      {
        kind: 'video', codec: 'vp8', width: 160, height: 90, frameRate: 30,
        samples: [
          { type: 'key', timestampUs: 0, durationUs: 33_333, data: sampleBytes[0] },
          { type: 'key', timestampUs: 33_333, durationUs: 33_333, data: sampleBytes[1] },
        ],
      },
      {
        kind: 'video', codec: 'vp9', width: 80, height: 45, frameRate: 30,
        samples: [
          { type: 'key', timestampUs: 0, durationUs: 33_333, data: sampleBytes[2] },
          { type: 'key', timestampUs: 33_333, durationUs: 33_333, data: sampleBytes[2] },
        ],
      },
    ],
  })
  assert.equal(result.status, 'ready')
  if (result.status !== 'ready') throw new Error('fixture mux failed')
  return { container: result.container, sampleBytes }
}

test('WebM mux emits seekable VP8/VP9 tracks with byte-exact sample evidence', () => {
  const { container, sampleBytes } = createContainer()
  const inventory = inspectXrV2WebmContainer(container.bytes)

  assert.equal(container.trackCount, 2)
  assert.equal(container.durationUs, 66_666)
  assert.equal(inventory.timecodeScaleNs, 1_000_000)
  assert.equal(inventory.durationUs, 66_666)
  assert.equal(inventory.clusterCount, 2)
  assert.equal(inventory.seekHeadEntryCount, 3)
  assert.equal(inventory.cuePointCount, 2)
  assert.equal(inventory.cueTrackPositionCount, 4)
  assert.deepEqual(inventory.tracks.map(track => ({
    trackNumber: track.trackNumber,
    codec: track.codec,
    codecId: track.codecId,
    defaultTrack: track.defaultTrack,
    vp9: track.vp9,
    width: track.width,
    height: track.height,
    sampleCount: track.sampleCount,
    keyframeCount: track.keyframeCount,
    encodedByteLength: track.encodedByteLength,
  })), [
    {
      trackNumber: 1, codec: 'vp8', codecId: 'V_VP8', defaultTrack: true, vp9: null, width: 160, height: 90,
      sampleCount: 2, keyframeCount: 2, encodedByteLength: 7,
    },
    {
      trackNumber: 2, codec: 'vp9', codecId: 'V_VP9', defaultTrack: false,
      vp9: { profile: 0, level: null, bitDepth: 8, chromaSubsampling: 1 }, width: 80, height: 45,
      sampleCount: 2, keyframeCount: 2, encodedByteLength: sampleBytes[2].byteLength * 2,
    },
  ])

  const firstTrackSamples = inventory.tracks[0].samples
  assert.deepEqual(firstTrackSamples.map(sample => ({
    index: sample.sampleIndex,
    timestampTicks: sample.timestampTicks,
    timestampNs: sample.timestampNs,
    timestampUs: sample.timestampUs,
    keyframe: sample.keyframe,
    payloadByteLength: sample.payloadByteLength,
  })), [
    { index: 0, timestampTicks: 0, timestampNs: 0, timestampUs: 0, keyframe: true, payloadByteLength: 4 },
    { index: 1, timestampTicks: 33, timestampNs: 33_000_000, timestampUs: 33_000, keyframe: true, payloadByteLength: 3 },
  ])
  assert.equal(verifyXrV2WebmSamplePayload(container.bytes, firstTrackSamples[0], sampleBytes[0]), true)
  assert.equal(verifyXrV2WebmSamplePayload(container.bytes, firstTrackSamples[1], sampleBytes[1]), true)
  assert.equal(verifyXrV2WebmSamplePayload(container.bytes, inventory.tracks[1].samples[0], sampleBytes[2]), true)
  assert.deepEqual(
    container.bytes.slice(firstTrackSamples[1].payloadOffset, firstTrackSamples[1].payloadEnd),
    sampleBytes[1],
  )
  assert.equal(Object.isFrozen(inventory.tracks[0].samples), true)
  assert.equal(inventory.tracks[1].codecPrivateByteLength, 9)
  const cuesOffset = findSequence(container.bytes, [0x1c, 0x53, 0xbb, 0x6b], true)
  const firstClusterOffset = findSequence(container.bytes, [0x1f, 0x43, 0xb6, 0x75])
  assert.ok(cuesOffset < firstClusterOffset, 'seek Cues precede media Clusters')

  sampleBytes[0][0] = 255
  assert.notEqual(container.bytes[firstTrackSamples[0].payloadOffset], 255, 'mux output owns its encoded payload bytes')
})

test('WebM inventory rejects a wrong DocType, unknown-size Segment, and duplicate singleton metadata', () => {
  const { container } = createContainer()

  const wrongDocType = container.bytes.slice()
  const docTypeOffset = findSequence(wrongDocType, [...new TextEncoder().encode('webm')])
  wrongDocType[docTypeOffset] = 'm'.charCodeAt(0)
  assert.throws(() => inspectXrV2WebmContainer(wrongDocType), /WebM DocType/)

  const unknownSize = container.bytes.slice()
  const segmentOffset = findSequence(unknownSize, [0x18, 0x53, 0x80, 0x67])
  unknownSize[segmentOffset + 4] = 0xff
  assert.throws(() => inspectXrV2WebmContainer(unknownSize), /unknown-size EBML/)

  const duplicateInfo = container.bytes.slice()
  const tracksOffset = findSequence(duplicateInfo, [0x16, 0x54, 0xae, 0x6b], true)
  duplicateInfo.set([0x15, 0x49, 0xa9, 0x66], tracksOffset)
  assert.throws(() => inspectXrV2WebmContainer(duplicateInfo), /Info is duplicated/)
})

test('WebM inventory rejects malformed blocks and detects payload corruption against prior evidence', () => {
  const { container, sampleBytes } = createContainer()
  const inventory = inspectXrV2WebmContainer(container.bytes)
  const sample = inventory.tracks[0].samples[0]

  const lacedBlock = container.bytes.slice()
  lacedBlock[sample.payloadOffset - 1] |= 0x02
  assert.throws(() => inspectXrV2WebmContainer(lacedBlock), /Laced WebM blocks/)

  const corruptedPayload = container.bytes.slice()
  corruptedPayload[sample.payloadOffset] ^= 0xff
  assert.equal(verifyXrV2WebmSamplePayload(corruptedPayload, sample, sampleBytes[0]), false)
  const corruptedInventory = inspectXrV2WebmContainer(corruptedPayload)
  assert.notEqual(corruptedInventory.tracks[0].samples[0].payloadHash, sample.payloadHash)

  const conflictingVp9Private = container.bytes.slice()
  const privateOffset = findSequence(conflictingVp9Private, [1, 1, 0, 3, 1, 8, 4, 1, 1])
  conflictingVp9Private[privateOffset + 2] = 2
  conflictingVp9Private[privateOffset + 5] = 10
  assert.throws(() => inspectXrV2WebmContainer(conflictingVp9Private), /conflicts with the canonical keyframe/)
})

test('WebM mux rejects missing keyframes, timestamp replay, tiny frame rates, and unsafe sample ends', () => {
  const common = { kind: 'video' as const, codec: 'vp9' as const, width: 2, height: 2, frameRate: 30 }
  const missingKeyframe = muxXrV2EncodedTracksToWebm({
    schema: XR_V2_ENCODED_TRACK_SET_SCHEMA,
    tracks: [{ ...common, samples: [{ type: 'delta', timestampUs: 0, durationUs: 33_333, data: Uint8Array.of(1) }] }],
  })
  assert.deepEqual(missingKeyframe, {
    status: 'invalid', reason: 'missing-keyframe', detail: 'Every encoded video track must start with a keyframe.',
  })
  const replay = muxXrV2EncodedTracksToWebm({
    schema: XR_V2_ENCODED_TRACK_SET_SCHEMA,
    tracks: [{ ...common, samples: [
      { type: 'key', timestampUs: 1, durationUs: 33_333, data: createVp9Profile0Keyframe(2, 2) },
      { type: 'delta', timestampUs: 1, durationUs: 33_333, data: Uint8Array.of(2) },
    ] }],
  })
  assert.equal(replay.status, 'invalid')
  if (replay.status === 'invalid') assert.equal(replay.reason, 'invalid-sample-order')

  const tinyFrameRate = muxXrV2EncodedTracksToWebm({
    schema: XR_V2_ENCODED_TRACK_SET_SCHEMA,
    tracks: [{ ...common, frameRate: Number.MIN_VALUE, samples: [
      { type: 'key', timestampUs: 0, durationUs: 33_333, data: createVp9Profile0Keyframe(2, 2) },
    ] }],
  })
  assert.equal(tinyFrameRate.status, 'invalid')
  if (tinyFrameRate.status === 'invalid') assert.equal(tinyFrameRate.reason, 'invalid-track-set')

  const unsafeEnd = muxXrV2EncodedTracksToWebm({
    schema: XR_V2_ENCODED_TRACK_SET_SCHEMA,
    tracks: [{ ...common, samples: [
      { type: 'key', timestampUs: Number.MAX_SAFE_INTEGER - 1, durationUs: 3, data: Uint8Array.of(1) },
    ] }],
  })
  assert.equal(unsafeEnd.status, 'invalid')
  if (unsafeEnd.status === 'invalid') assert.equal(unsafeEnd.reason, 'duration-limit-exceeded')

  const durationMismatch = muxXrV2EncodedTracksToWebm({
    schema: XR_V2_ENCODED_TRACK_SET_SCHEMA,
    tracks: [{ ...common, samples: [
      { type: 'key', timestampUs: 0, durationUs: 30_000, data: createVp9Profile0Keyframe(2, 2) },
    ] }],
  })
  assert.equal(durationMismatch.status, 'invalid')
  if (durationMismatch.status === 'invalid') assert.equal(durationMismatch.reason, 'invalid-sample-duration')

  const invalidVp9 = muxXrV2EncodedTracksToWebm({
    schema: XR_V2_ENCODED_TRACK_SET_SCHEMA,
    tracks: [{ ...common, samples: [
      { type: 'key', timestampUs: 0, durationUs: 33_333, data: new Uint8Array(9) },
    ] }],
  })
  assert.equal(invalidVp9.status, 'invalid')
  if (invalidVp9.status === 'invalid') assert.equal(invalidVp9.reason, 'invalid-codec-data')
})
