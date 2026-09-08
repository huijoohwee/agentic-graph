import assert from 'node:assert/strict'
import test from 'node:test'
import { JSDOM } from 'jsdom'
import { waitForSurfaceFrame } from '@/features/geospatial/surfaceFrameWait'

test('a live surface completes its frame wait', { timeout: 1000 }, async () => {
  const dom = new JSDOM('', { pretendToBeVisual: true })
  try {
    await waitForSurfaceFrame(Date.now() + 500, 'frame deadline', dom.window)
  } finally {
    dom.window.close()
  }
})

test('closing a surface cannot cancel its frame deadline', { timeout: 1000 }, async () => {
  const dom = new JSDOM('', { pretendToBeVisual: true })
  const pending = waitForSurfaceFrame(Date.now() + 30, 'closed surface deadline', dom.window)
  dom.window.close()
  await assert.rejects(pending, /closed surface deadline/)
})

test('deadline cancels frame zero on the original surface after window replacement', { timeout: 1000 }, async () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'window')
  const cancelled: number[] = []
  let replacementCancellations = 0
  Object.defineProperty(globalThis, 'window', { configurable: true, value: {
    requestAnimationFrame: () => 0,
    cancelAnimationFrame: (id: number) => cancelled.push(id),
  } })
  try {
    const pending = waitForSurfaceFrame(Date.now() + 20, 'original surface deadline')
    Object.defineProperty(globalThis, 'window', { configurable: true, value: {
      cancelAnimationFrame: () => { replacementCancellations += 1 },
    } })
    await assert.rejects(pending, /original surface deadline/)
    assert.deepEqual(cancelled, [0])
    assert.equal(replacementCancellations, 0)
  } finally {
    if (descriptor) Object.defineProperty(globalThis, 'window', descriptor)
    else Reflect.deleteProperty(globalThis, 'window')
  }
})

test('an expired deadline rejects without requesting a frame', async () => {
  await assert.rejects(waitForSurfaceFrame(Date.now() - 1, 'expired', {
    requestAnimationFrame: () => { assert.fail('expired wait requested a frame') },
    cancelAnimationFrame: () => assert.fail('expired wait cancelled a frame'),
  }), /expired/)
})

test('a throwing frame registration rejects immediately', async () => {
  const failure = new Error('surface unavailable')
  await assert.rejects(waitForSurfaceFrame(Date.now() + 500, 'deadline', {
    requestAnimationFrame: () => { throw failure },
    cancelAnimationFrame: () => assert.fail('no frame was registered'),
  }), error => error === failure)
})

test('a disposed surface throwing during cancellation still rejects at deadline', { timeout: 1000 }, async () => {
  await assert.rejects(waitForSurfaceFrame(Date.now() + 20, 'cancelled surface deadline', {
    requestAnimationFrame: () => 1,
    cancelAnimationFrame: () => { throw new Error('surface disposed') },
  }), /cancelled surface deadline/)
})
