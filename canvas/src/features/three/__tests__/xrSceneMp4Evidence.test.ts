import assert from 'node:assert/strict'
import test from 'node:test'
import { assertXrMp4Container, verifyXrSceneMp4 } from '../xrSceneMp4Evidence'

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


async function decoderFixture(empty: boolean, run: (readCleanup: () => number) => Promise<void>) {
  const prior = Object.getOwnPropertyDescriptor(globalThis, 'document')
  let cleanup = 0; let draws = 0
  class Video extends EventTarget {
    duration = 2; videoWidth = 160; videoHeight = 90; readyState = 4; time = 0
    get currentTime() { return this.time }
    set currentTime(value: number) { this.time = value; queueMicrotask(() => this.dispatchEvent(new Event('seeked'))) }
    load() { queueMicrotask(() => this.dispatchEvent(new Event('loadedmetadata'))) }
    pause() { cleanup++ }
    removeAttribute() { cleanup++ }
  }
  Object.defineProperty(globalThis, 'document', { configurable: true, value: {
    createElement: (tag: string) => tag === 'video' ? new Video() : {
      getContext: () => ({ clearRect() {}, drawImage() { draws++ },
        getImageData: () => ({ data: new Uint8ClampedArray(32 * 32 * 4).fill(empty ? 0 : draws) }) }),
    },
  } })
  try { await run(() => cleanup) }
  finally { if (prior) Object.defineProperty(globalThis, 'document', prior); else Reflect.deleteProperty(globalThis, 'document') }
}

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
