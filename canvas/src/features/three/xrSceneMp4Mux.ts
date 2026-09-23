import type { XrV2EncodedVideoSample } from '@/features/xr-v2/encodedTrackMuxContracts'
import { XR_MP4_MAX_BYTES } from './xrSceneMp4Evidence'

export const XR_MP4_MAX_SAMPLES = 7_201
const join = (...parts: Uint8Array[]): Uint8Array<ArrayBuffer> => {
  const bytes = new Uint8Array(parts.reduce((length, part) => length + part.length, 0))
  let offset = 0
  for (const part of parts) { bytes.set(part, offset); offset += part.length }
  return bytes
}
const u32 = (...values: number[]) => {
  const bytes = new Uint8Array(values.length * 4), view = new DataView(bytes.buffer)
  values.forEach((value, index) => view.setUint32(index * 4, value)); return bytes
}
const u16 = (...values: number[]) => {
  const bytes = new Uint8Array(values.length * 2), view = new DataView(bytes.buffer)
  values.forEach((value, index) => view.setUint16(index * 2, value)); return bytes
}
const ascii = (value: string) => new TextEncoder().encode(value)
const box = (name: string, ...parts: Uint8Array[]) => {
  const body = join(...parts); return join(u32(body.length + 8), ascii(name), body)
}
const full = (name: string, flags: number, ...parts: Uint8Array[]) => box(name, u32(flags), ...parts)
const matrix = u32(0x10000, 0, 0, 0, 0x10000, 0, 0, 0, 0x40000000)

/** One bounded, non-reordered AVC track. Display intervals come from authored timestamps. */
export function muxXrSceneMp4(input: {
  width: number; height: number; durationUs: number; configuration: Uint8Array
  samples: readonly XrV2EncodedVideoSample[]
}): Blob {
  const { width, height, durationUs, configuration, samples } = input
  if (![width, height].every(value => Number.isInteger(value) && value >= 2 && value <= 8_192)
    || !Number.isSafeInteger(durationUs) || durationUs < 2 || durationUs > 120_000_000
    || samples.length < 2 || samples.length > XR_MP4_MAX_SAMPLES
    || configuration.length < 7 || configuration.length > 65_535 || configuration[0] !== 1
    || samples[0].type !== 'key' || samples[0].timestampUs !== 0) throw new Error('Invalid bounded AVC track.')
  let payloadBytes = 0
  const durations = samples.map((sample, index) => {
    const next = samples[index + 1]?.timestampUs ?? durationUs
    if (!Number.isSafeInteger(sample.timestampUs) || sample.timestampUs < 0 || next <= sample.timestampUs
      || next > durationUs || !sample.data.length || !['key', 'delta'].includes(sample.type)) {
      throw new Error('Invalid AVC sample inventory or presentation order.')
    }
    payloadBytes += sample.data.length
    return next - sample.timestampUs
  })
  if (payloadBytes > XR_MP4_MAX_BYTES) throw new Error('MP4 recording exceeds the 64 MB limit.')
  const ftyp = box('ftyp', ascii('isom'), u32(0x200), ascii('isomiso2avc1mp41'))
  const moov = (offset: number) => box('moov',
    full('mvhd', 0, u32(0, 0, 1_000_000, durationUs, 0x10000), u16(0x100, 0), u32(0, 0), matrix, u32(0, 0, 0, 0, 0, 0, 2)),
    box('trak',
      full('tkhd', 7, u32(0, 0, 1, 0, durationUs, 0, 0), u16(0, 0, 0, 0), matrix, u32(width * 0x10000, height * 0x10000)),
      box('mdia', full('mdhd', 0, u32(0, 0, 1_000_000, durationUs), u16(0x55c4, 0)),
        full('hdlr', 0, u32(0), ascii('vide'), u32(0, 0, 0), ascii('VideoHandler\0')),
        box('minf', full('vmhd', 1, u16(0, 0, 0, 0)),
          box('dinf', full('dref', 0, u32(1), full('url ', 1))),
          box('stbl',
            full('stsd', 0, u32(1), box('avc1', new Uint8Array(6), u16(1, 0, 0), u32(0, 0, 0),
              u16(width, height), u32(0x480000, 0x480000, 0), u16(1), new Uint8Array(32), u16(24, 0xffff), box('avcC', configuration))),
            full('stts', 0, u32(samples.length), ...durations.map(duration => u32(1, duration))),
            full('stsc', 0, u32(1, 1, samples.length, 1)),
            full('stsz', 0, u32(0, samples.length, ...samples.map(sample => sample.data.length))),
            full('stco', 0, u32(1, offset)),
            full('stss', 0, u32(samples.filter(sample => sample.type === 'key').length,
              ...samples.flatMap((sample, index) => sample.type === 'key' ? [index + 1] : []))))))))
  const movie = moov(ftyp.length + moov(0).length + 8)
  const totalBytes = ftyp.length + movie.length + 8 + payloadBytes
  if (totalBytes > XR_MP4_MAX_BYTES) throw new Error('MP4 container exceeds the 64 MB limit.')
  // Blob parts avoid duplicating the complete encoded payload into a second buffer.
  return new Blob([ftyp, movie, u32(payloadBytes + 8), ascii('mdat'),
    ...samples.map(sample => sample.data.slice())], { type: 'video/mp4' })
}
