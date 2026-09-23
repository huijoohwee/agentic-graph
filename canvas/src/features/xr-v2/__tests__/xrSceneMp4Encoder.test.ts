import assert from 'node:assert/strict'
import test from 'node:test'
import { Scene } from 'three'
import { publishRichMediaTimelineClockAcknowledgement, publishRichMediaTimelineClockStart } from '@/lib/render/richMediaTimelineSync'
import { acquireVideoSequenceRecorderLease } from '@/components/timeline/videoSequenceRecorderLifecycle'
import { encodeXrSceneMp4, inspectXrMp4Encoder } from '@/features/three/xrSceneMp4Encoder'
import { muxXrSceneMp4, XR_MP4_MAX_SAMPLES } from '@/features/three/xrSceneMp4Mux'
import { assertXrMp4Container } from '@/features/three/xrSceneMp4Evidence'
import type { XrMp4SourceBinding } from '@/features/three/xrSceneMp4Export'

const configuration = new Uint8Array([1, 66, 0, 31, 255, 225, 0, 0])
const track = () => ({ width: 160, height: 90, durationUs: 2_000_000, configuration,
  samples: [0, 1_000_000, 1_966_667].map((timestampUs, index) => ({ timestampUs, durationUs: 33_333,
    type: index === 0 ? 'key' as const : 'delta' as const, data: new Uint8Array([0, 0, 0, 1, 0x65]) })) })

test('AVC container retains authored intervals, payload offsets and dimensions', async () => {
  const blob = muxXrSceneMp4(track()), bytes = await blob.arrayBuffer()
  assert.equal(blob.type, 'video/mp4'); assertXrMp4Container(bytes)
  const data = new Uint8Array(bytes), view = new DataView(bytes)
  const locate = (type: string) => new TextDecoder('latin1').decode(data).indexOf(type)
  const stts = locate('stts'), stco = locate('stco'), mdat = locate('mdat'), tkhd = locate('tkhd')
  assert.equal(view.getUint32(stts + 8), 3)
  assert.deepEqual([view.getUint32(stts + 16), view.getUint32(stts + 24), view.getUint32(stts + 32)], [1_000_000, 966_667, 33_333])
  assert.equal(view.getUint32(stco + 12), mdat + 4)
  assert.equal(view.getUint32(tkhd + 80), 160 * 65536)
  assert.deepEqual([...data.slice(mdat + 4)], track().samples.flatMap(sample => [...sample.data]))
})

test('AVC mux rejects reordered, missing, oversized and non-key opening inventories', () => {
  for (const mutate of [
    (value: ReturnType<typeof track>) => { value.samples[1].timestampUs = 0 },
    (value: ReturnType<typeof track>) => { value.samples[2].timestampUs = value.durationUs },
    (value: ReturnType<typeof track>) => { value.samples[0].type = 'delta' },
    (value: ReturnType<typeof track>) => { value.samples[0].data = new Uint8Array() },
    (value: ReturnType<typeof track>) => { value.samples = Array(XR_MP4_MAX_SAMPLES + 1).fill(value.samples[0]) },
    (value: ReturnType<typeof track>) => { value.configuration = new Uint8Array(65_536) },
  ]) { const value = track(); mutate(value); assert.throws(() => muxXrSceneMp4(value)) }
})

async function fixture(run: (context: {
  capture: (options?: { signal?: AbortSignal; onProgress?: (fraction: number) => void }) => ReturnType<typeof encodeXrSceneMp4>
  stale: () => void; frames: { timestamp: number; closed: boolean }[]; encoders: { state: string }[]
  restored: () => number; reverse: () => void; scene: Scene; initial: Scene['onAfterRender']
}) => Promise<void>) {
  const names = ['window', 'document', 'VideoFrame', 'VideoEncoder'] as const
  const previous = names.map(name => Object.getOwnPropertyDescriptor(globalThis, name))
  const set = (name: string, value: unknown) => Object.defineProperty(globalThis, name, { configurable: true, value })
  const frames: { timestamp: number; closed: boolean }[] = [], encoders: { state: string }[] = []
  let time = 0, current = true, playing = false, requested = false, released = false, ended = false, restoreCount = 0, reverse = false
  const listeners = new Set<() => void>(), lifetime = new AbortController(), scene = new Scene(), initial = scene.onAfterRender
  class Canvas {
    width = 160; height = 90; pixel = 0
    getContext() { return { drawImage: (source: Canvas) => { this.pixel = source.pixel },
      getImageData: () => ({ data: new Uint8ClampedArray(32 * 32 * 4).fill(this.pixel) }) } }
  }
  class Frame {
    closed = false; timestamp: number
    constructor(_source: Canvas, options: VideoFrameInit) { this.timestamp = options.timestamp; frames.push(this) }
    close() { this.closed = true }
  }
  class Encoder {
    state = 'configured'; encodeQueueSize = 0
    static async isConfigSupported(config: VideoEncoderConfig) { return { supported: true, config } }
    constructor(private callbacks: VideoEncoderInit) { encoders.push(this) }
    configure() {}
    encode(frame: Frame, options: VideoEncoderEncodeOptions) {
      this.encodeQueueSize++
      queueMicrotask(() => {
        this.encodeQueueSize--
        this.callbacks.output({ timestamp: frame.timestamp + (reverse ? 1 : 0), type: options.keyFrame ? 'key' : 'delta', duration: 1,
          byteLength: 5, copyTo: (target: Uint8Array) => target.set([0, 0, 0, 1, 0x65]) } as unknown as EncodedVideoChunk,
        { decoderConfig: { codec: 'avc1.420033', description: configuration } })
      })
    }
    async flush() {}
    close() { this.state = 'closed' }
  }
  set('window', new EventTarget()); set('document', { createElement: () => new Canvas() }); set('VideoFrame', Frame); set('VideoEncoder', Encoder)
  const source = new Canvas()
  const binding: XrMp4SourceBinding = { documentKey: 'timestamp-fixture', durationSeconds: 0.12, fps: 30,
    current: () => current, time: () => time, prepare: () => { time = 0 }, pause: () => { playing = false },
    play: () => { playing = true; requested = true }, subscribe: listener => { listeners.add(listener); return () => listeners.delete(listener) },
    restoreTransport: () => { playing = false; restoreCount++ }, restoreCameraAndPlayback: () => { restoreCount++ } }
  const timer = setInterval(() => {
    if (requested) {
      requested = false
      const ready = publishRichMediaTimelineClockStart({ type: 'agentic-graph:timeline-transport-frame', documentKey: binding.documentKey,
        position: 0, timeMs: 0, playing: true, playbackRate: 1, sourcePlayback: false }, lifetime.signal)
      void Promise.resolve(ready).then(() => { released = true }, () => { playing = false })
    }
    if (playing && released) time = Math.min(binding.durationSeconds, time + 0.02)
    if (playing && released && time === binding.durationSeconds && !ended) {
      ended = true
      const ready = publishRichMediaTimelineClockAcknowledgement({ type: 'agentic-graph:timeline-transport-frame', documentKey: binding.documentKey,
        position: time / 60, timeMs: time * 1000, playing: true, playbackRate: 1, sourcePlayback: false }, lifetime.signal, 'end')
      void Promise.resolve(ready).then(() => binding.pause(), () => binding.pause())
    }
    source.pixel = Math.round(time * 1000)
    scene.onAfterRender({ xr: { isPresenting: false } } as never, scene, {} as never, {} as never, {} as never, {} as never)
  }, 8)
  try {
    const config = await inspectXrMp4Encoder(source as never, binding.fps); assert.ok(config)
    await run({ capture: options => encodeXrSceneMp4({ ...options, canvas: source as never, scene, isCurrent: () => true, binding,
      verify: async (_blob, duration, _signal, final, opening) => {
        assert.equal(opening?.[0], 0); assert.equal(final?.[0], 120)
        return { durationSeconds: duration, decodedFrames: 3, width: 160, height: 90, sampleHashes: ['a', 'b', 'c'], initialFrameVerified: true, finalFrameVerified: true }
      } }, config),
      stale: () => { current = false; listeners.forEach(listener => listener()) }, frames, encoders,
      restored: () => restoreCount, reverse: () => { reverse = true }, scene, initial })
  } finally {
    clearInterval(timer); lifetime.abort()
    names.forEach((name, index) => { if (previous[index]) Object.defineProperty(globalThis, name, previous[index]!); else Reflect.deleteProperty(globalThis, name) })
  }
}

test('native acknowledgements encode opening and final authored intervals and restore all resources', async () => {
  await fixture(async ({ capture, frames, encoders, restored, scene, initial }) => {
    const result = await capture(); assert.equal(result.status, 'captured')
    assert.equal(frames[0].timestamp, 0); assert.equal(frames.at(-1)?.timestamp, 86_667)
    assert.ok(frames.every(frame => frame.closed)); assert.ok(encoders.every(encoder => encoder.state === 'closed'))
    assert.equal(restored(), 2); assert.equal(scene.onAfterRender, initial)
    const release = acquireVideoSequenceRecorderLease(); release()
  })
})

test('encoder cancellation releases the lease and hooks after frames have been submitted', async () => {
  await fixture(async ({ capture, frames, encoders, restored, scene, initial }) => {
    const controller = new AbortController()
    await assert.rejects(capture({ signal: controller.signal, onProgress: () => controller.abort() }), { name: 'AbortError' })
    assert.ok(frames.length); assert.ok(frames.every(frame => frame.closed)); assert.ok(encoders.every(encoder => encoder.state === 'closed'))
    assert.equal(restored(), 2); assert.equal(scene.onAfterRender, initial)
    const release = acquireVideoSequenceRecorderLease(); release()
  })
})

test('source switching cancels encoding without restoring an old pose into the new document', async () => {
  await fixture(async ({ capture, stale, restored, encoders }) => {
    await assert.rejects(capture({ onProgress: stale }), /source, document or canvas changed/)
    assert.equal(restored(), 0); assert.ok(encoders.every(encoder => encoder.state === 'closed'))
  })
})

test('an encoder that changes timestamps fails instead of publishing substituted timing', async () => {
  await fixture(async ({ capture, reverse, encoders }) => {
    reverse(); await assert.rejects(capture(), /authored sample inventory/)
    assert.ok(encoders.every(encoder => encoder.state === 'closed'))
  })
})

test('cancellation at the completion callback cannot return a captured result', async () => {
  await fixture(async ({ capture, restored }) => {
    const controller = new AbortController()
    await assert.rejects(capture({ signal: controller.signal, onProgress: fraction => { if (fraction === 1) controller.abort() } }), { name: 'AbortError' })
    assert.equal(restored(), 2)
  })
})
