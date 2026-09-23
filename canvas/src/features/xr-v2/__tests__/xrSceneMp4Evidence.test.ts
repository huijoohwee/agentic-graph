import assert from 'node:assert/strict'
import test from 'node:test'
import { assertXrMp4Container, verifyXrSceneMp4 } from '@/features/three/xrSceneMp4Evidence'

function box(type: string, content: Uint8Array): Uint8Array {
  const bytes = new Uint8Array(content.length + 8)
  new DataView(bytes.buffer).setUint32(0, bytes.length)
  bytes.set(new TextEncoder().encode(type), 4); bytes.set(content, 8)
  return bytes
}
const join = (...values: Uint8Array[]) => {
  const result = new Uint8Array(values.reduce((total, item) => total + item.length, 0))
  let offset = 0; for (const value of values) { result.set(value, offset); offset += value.length }
  return result
}
function container(sample = true) {
  const hdlr = new Uint8Array(20); hdlr.set(new TextEncoder().encode('vide'), 8)
  return join(box('ftyp', new TextEncoder().encode('isom\0\0\0\0isommp42')),
    box('moov', box('trak', box('mdia', box('hdlr', hdlr)))),
    ...(sample ? [box('mdat', new Uint8Array([1, 2, 3, 4]))] : []))
}

test('container inspection accepts MP4 video tracks and sample payload, not MIME labels', () => {
  assert.doesNotThrow(() => assertXrMp4Container(container().buffer))
  assert.throws(() => assertXrMp4Container(new Uint8Array(64).buffer), /not an MP4/)
  const webm = new Uint8Array(64); webm.set([0x1a, 0x45, 0xdf, 0xa3])
  assert.throws(() => assertXrMp4Container(webm.buffer), /not an MP4/)
  assert.throws(() => assertXrMp4Container(container(false).buffer), /no video sample/)
})

test('truncated MP4 sample boxes reject instead of creating a successful export', () => {
  const valid = container()
  assert.throws(() => assertXrMp4Container(valid.slice(0, -1).buffer), /box length/)
})


async function decoderFixture(empty: boolean,
  run: (readCleanup: () => number, pendingEndedListeners: () => number, pendingFrames: () => number) => Promise<void>,
  options: { duration?: number; play?: () => Promise<void>; presentedFrames?: boolean; seekFailure?: boolean } = {}) {
  const prior = Object.getOwnPropertyDescriptor(globalThis, 'document')
  let cleanup = 0; let draws = 0
  const endedListeners = new Set<EventListenerOrEventListenerObject>()
  let frameId = 0; let presented = false
  const frames = new Map<number, () => void>()
  const present = () => { presented = true; for (const [id, callback] of [...frames]) { frames.delete(id); callback() } }
  class Video extends EventTarget {
    constructor() {
      super()
      if (options.presentedFrames) Object.assign(this, {
        requestVideoFrameCallback: (callback: () => void) => { presented = false; frames.set(++frameId, callback); return frameId },
        cancelVideoFrameCallback: (id: number) => frames.delete(id),
      })
    }
    duration = options.duration ?? 2; videoWidth = 160; videoHeight = 90; readyState = 4; time = 0
    get currentTime() { return this.time }
    set currentTime(value: number) {
      if (options.seekFailure) throw new Error('seek rejected')
      this.time = value; queueMicrotask(() => { this.dispatchEvent(new Event('seeked')); queueMicrotask(present) })
    }
    load() { queueMicrotask(() => this.dispatchEvent(new Event('loadedmetadata'))) }
    play() { return options.play?.() ?? Promise.resolve() }
    addEventListener(type: string, listener: EventListenerOrEventListenerObject | null, options?: AddEventListenerOptions | boolean) {
      if (type === 'ended' && listener) endedListeners.add(listener)
      super.addEventListener(type, listener, options)
    }
    removeEventListener(type: string, listener: EventListenerOrEventListenerObject | null, options?: EventListenerOptions | boolean) {
      if (type === 'ended' && listener) endedListeners.delete(listener)
      super.removeEventListener(type, listener, options)
    }
    pause() { cleanup++ }
    removeAttribute() { cleanup++ }
  }
  Object.defineProperty(globalThis, 'document', { configurable: true, value: {
    createElement: (tag: string) => tag === 'video' ? new Video() : {
      getContext: () => ({ clearRect() {}, drawImage() {
        if (options.presentedFrames) assert.equal(presented, true, 'seeked is not proof that pixels were presented')
        draws++
      },
        getImageData: () => ({ data: new Uint8ClampedArray(32 * 32 * 4).fill(empty ? 0 : draws) }) }),
    },
  } })
  try { await run(() => cleanup, () => endedListeners.size, () => frames.size) }
  finally { if (prior) Object.defineProperty(globalThis, 'document', prior); else Reflect.deleteProperty(globalThis, 'document') }
}

test('decode waits for presented pixels after every seek and cancels frame callbacks on failure', async () => {
  await decoderFixture(false, async (_cleanup, _ended, pendingFrames) => {
    const evidence = await verifyXrSceneMp4(new Blob([container()]), 2)
    assert.equal(evidence.decodedFrames, 3)
    assert.equal(new Set(evidence.sampleHashes).size, 3)
    assert.equal(pendingFrames(), 0)
  }, { presentedFrames: true })
  await decoderFixture(false, async (_cleanup, _ended, pendingFrames) => {
    await assert.rejects(verifyXrSceneMp4(new Blob([container()]), 2), /seek rejected/)
    assert.equal(pendingFrames(), 0)
  }, { presentedFrames: true, seekFailure: true })
})

test('browser decode samples beginning, middle and end, then releases its video source', async () => {
  await decoderFixture(false, async cleanup => {
    const evidence = await verifyXrSceneMp4(new Blob([container()]), 2)
    assert.equal(evidence.decodedFrames, 3)
    assert.equal(new Set(evidence.sampleHashes).size, 3)
    assert.equal(evidence.durationSeconds, 2)
    assert.equal(cleanup(), 2)
  })
})

test('empty decoded frames fail and still release verification resources', async () => {
  await decoderFixture(true, async cleanup => {
    await assert.rejects(verifyXrSceneMp4(new Blob([container()]), 2), /empty decoded frame/)
    assert.equal(cleanup(), 2)
  })
})

test('decoded endpoint tolerates codec noise but rejects a different retained camera image', async () => {
  await decoderFixture(false, async cleanup => {
    const reference = new Uint8ClampedArray(32 * 32 * 4).fill(5)
    const evidence = await verifyXrSceneMp4(new Blob([container()]), 2, undefined, reference)
    assert.equal(evidence.finalFrameVerified, true)
    assert.equal(evidence.finalFrameMeanError, 2)
    assert.equal(cleanup(), 2)
  })
  await decoderFixture(false, async cleanup => {
    await assert.rejects(verifyXrSceneMp4(new Blob([container()]), 2, undefined,
      new Uint8ClampedArray(32 * 32 * 4).fill(100)), /does not match the authored endpoint/)
    assert.equal(cleanup(), 2)
  })
})

test('localized wrong endpoint pixels reject even when the whole-frame average is small', async () => {
  await decoderFixture(false, async () => {
    const reference = new Uint8ClampedArray(32 * 32 * 4).fill(3)
    reference.fill(80, 0, Math.floor(reference.length * 0.1))
    await assert.rejects(verifyXrSceneMp4(new Blob([container()]), 2, undefined, reference), /authored endpoint/)
  })
})

test('decoded opening pose is required independently of a matching final frame', async () => {
  await decoderFixture(false, async () => {
    const result = await verifyXrSceneMp4(new Blob([container()]), 2, undefined,
      new Uint8ClampedArray(32 * 32 * 4).fill(3), new Uint8ClampedArray(32 * 32 * 4).fill(1))
    assert.equal(result.initialFrameVerified, true)
    assert.equal(result.initialFrameMeanError, 0)
    assert.equal(result.finalFrameVerified, true)
  })
  await decoderFixture(false, async cleanup => {
    await assert.rejects(verifyXrSceneMp4(new Blob([container()]), 2, undefined,
      new Uint8ClampedArray(32 * 32 * 4).fill(3), new Uint8ClampedArray(32 * 32 * 4).fill(120)), /authored opening pose/)
    assert.equal(cleanup(), 2)
  })
})

test('fragmented decode cancels while the browser play promise never settles', async () => {
  const controller = new AbortController()
  await decoderFixture(false, async (cleanup, pendingEndedListeners) => {
    await assert.rejects(verifyXrSceneMp4(new Blob([container()]), 2, controller.signal), { name: 'AbortError' })
    assert.equal(cleanup(), 2)
    assert.equal(pendingEndedListeners(), 0)
  }, { duration: Infinity, play: () => {
    queueMicrotask(() => controller.abort())
    return new Promise(() => {})
  } })
})

test('fragmented decode times out while the browser play promise never settles', async context => {
  context.mock.timers.enable({ apis: ['setTimeout'] })
  let playing!: () => void
  const playStarted = new Promise<void>(resolve => { playing = resolve })
  try {
    await decoderFixture(false, async (cleanup, pendingEndedListeners) => {
      const verification = verifyXrSceneMp4(new Blob([container()]), 2)
      const rejected = assert.rejects(verification, /decode verification timed out/)
      await playStarted
      context.mock.timers.tick(10_000)
      await rejected
      assert.equal(cleanup(), 2)
      assert.equal(pendingEndedListeners(), 0)
    }, { duration: Infinity, play: () => { playing(); return new Promise(() => {}) } })
  } finally { context.mock.timers.reset() }
})

test('fragmented playback rejection releases its pending ended observation', async context => {
  context.mock.timers.enable({ apis: ['setTimeout'] })
  try {
    await decoderFixture(false, async (cleanup, pendingEndedListeners) => {
      await assert.rejects(verifyXrSceneMp4(new Blob([container()]), 2), /Playback denied/)
      context.mock.timers.tick(10_000)
      assert.equal(cleanup(), 2)
      assert.equal(pendingEndedListeners(), 0)
    }, { duration: Infinity, play: () => Promise.reject(new Error('Playback denied')) })
  } finally { context.mock.timers.reset() }
})
