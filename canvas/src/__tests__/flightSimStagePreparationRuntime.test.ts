import assert from 'node:assert/strict'
import test from 'node:test'
import {
  beginFlightSimStagePreparation,
  cancelFlightSimStagePreparation,
  completeFlightSimHudStagePreparation,
  completeFlightSimStagePreparation,
  readCurrentFlightSimStagePreparationRequest,
  resetFlightSimStagePreparationForTests,
  waitForFlightSimStageFrameOpportunity,
  waitForFlightSimStagePresentation,
  waitForFlightSimStagePreparation,
} from '@/features/game-flight-sim/flightSimStagePreparationRuntime'

type ControlledAnimationFrameWindow = Readonly<{
  cancelAnimationFrame: (frameId: number) => void
  requestAnimationFrame: (callback: FrameRequestCallback) => number
}>

function installControlledAnimationFrameWindow() {
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window')
  const callbacks = new Map<number, FrameRequestCallback>()
  const cancelled: number[] = []
  let frameSequence = 0
  const controlledWindow: ControlledAnimationFrameWindow = {
    cancelAnimationFrame: frameId => {
      callbacks.delete(frameId)
      cancelled.push(frameId)
    },
    requestAnimationFrame: callback => {
      frameSequence += 1
      callbacks.set(frameSequence, callback)
      return frameSequence
    },
  }
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: controlledWindow,
  })
  return {
    callbacks,
    cancelled,
    restore: () => {
      if (originalWindow) {
        Object.defineProperty(globalThis, 'window', originalWindow)
      } else {
        Reflect.deleteProperty(globalThis, 'window')
      }
    },
  }
}

test('surface preparation waits for its exact committed mission-stage request', async () => {
  resetFlightSimStagePreparationForTests()
  const requestId = beginFlightSimStagePreparation()
  assert.equal(readCurrentFlightSimStagePreparationRequest(), requestId)
  let resolved = false
  const waiting = waitForFlightSimStagePreparation(
    requestId,
    { limitMs: 1_000 },
  ).then(() => {
    resolved = true
  })

  await Promise.resolve()
  assert.equal(resolved, false)
  assert.equal(completeFlightSimStagePreparation(requestId), true)
  await waiting
  assert.equal(resolved, true)
  assert.equal(readCurrentFlightSimStagePreparationRequest(), null)
  cancelFlightSimStagePreparation(requestId)
  resetFlightSimStagePreparationForTests()
})

test('a stale stage instance cannot satisfy a newer preparation request', async () => {
  resetFlightSimStagePreparationForTests()
  const staleRequestId = beginFlightSimStagePreparation()
  const currentRequestId = beginFlightSimStagePreparation()
  let resolved = false
  const waiting = waitForFlightSimStagePreparation(
    currentRequestId,
    { limitMs: 1_000 },
  ).then(() => {
    resolved = true
  })

  assert.equal(completeFlightSimStagePreparation(staleRequestId), false)
  await Promise.resolve()
  assert.equal(resolved, false)
  assert.equal(completeFlightSimStagePreparation(currentRequestId), true)
  await waiting
  assert.equal(resolved, true)
  cancelFlightSimStagePreparation(currentRequestId)
  resetFlightSimStagePreparationForTests()
})

test('an aborted late request cannot satisfy the next activation', async () => {
  resetFlightSimStagePreparationForTests()
  const abortedRequestId = beginFlightSimStagePreparation()
  const controller = new AbortController()
  const abortedWait = waitForFlightSimStagePreparation(abortedRequestId, {
    limitMs: 1_000,
    signal: controller.signal,
  })
  controller.abort(new Error('injected preparation abort'))
  await assert.rejects(abortedWait, /injected preparation abort/)
  cancelFlightSimStagePreparation(abortedRequestId)

  const currentRequestId = beginFlightSimStagePreparation()
  let resolved = false
  const currentWait = waitForFlightSimStagePreparation(
    currentRequestId,
    { limitMs: 1_000 },
  ).then(() => {
    resolved = true
  })
  assert.equal(completeFlightSimStagePreparation(abortedRequestId), false)
  await Promise.resolve()
  assert.equal(resolved, false)
  assert.equal(completeFlightSimStagePreparation(currentRequestId), true)
  await currentWait
  cancelFlightSimStagePreparation(currentRequestId)
  resetFlightSimStagePreparationForTests()
})

test('a timed-out request stays stale across reset and a monotonic next token', async () => {
  resetFlightSimStagePreparationForTests()
  const timedOutRequestId = beginFlightSimStagePreparation()
  await assert.rejects(
    waitForFlightSimStagePreparation(timedOutRequestId, { limitMs: 0 }),
    /did not complete within 0 ms/,
  )
  resetFlightSimStagePreparationForTests()

  const currentRequestId = beginFlightSimStagePreparation()
  assert.ok(currentRequestId > timedOutRequestId)
  let resolved = false
  const currentWait = waitForFlightSimStagePreparation(
    currentRequestId,
    { limitMs: 1_000 },
  ).then(() => {
    resolved = true
  })
  assert.equal(completeFlightSimStagePreparation(timedOutRequestId), false)
  await Promise.resolve()
  assert.equal(resolved, false)
  assert.equal(completeFlightSimStagePreparation(currentRequestId), true)
  await currentWait
  cancelFlightSimStagePreparation(currentRequestId)
  resetFlightSimStagePreparationForTests()
})

test('surface presentation waits for its stage acknowledgement and next frame opportunity', async () => {
  const animationFrame = installControlledAnimationFrameWindow()
  try {
    resetFlightSimStagePreparationForTests()
    const requestId = beginFlightSimStagePreparation()
    let resolved = false
    const waiting = waitForFlightSimStagePresentation(requestId, {
      limitMs: 1_000,
    })
      .then(() => {
        resolved = true
      })
    await Promise.resolve()
    assert.equal(resolved, false)
    assert.equal(animationFrame.callbacks.size, 0)

    assert.equal(completeFlightSimStagePreparation(requestId), true)
    await Promise.resolve()
    assert.equal(animationFrame.callbacks.size, 1)

    const [[frameId, presentFrame]] = [...animationFrame.callbacks]
    animationFrame.callbacks.delete(frameId)
    presentFrame(16)
    await waiting
    assert.equal(resolved, true)
    assert.deepEqual(animationFrame.cancelled, [])
    cancelFlightSimStagePreparation(requestId)
    resetFlightSimStagePreparationForTests()
  } finally {
    animationFrame.restore()
  }
})

test('MapLibre preparation requires the exact HUD layout and no redundant browser frame', async () => {
  const animationFrame = installControlledAnimationFrameWindow()
  try {
    resetFlightSimStagePreparationForTests()
    const requestId = beginFlightSimStagePreparation()
    let resolved = false
    const waiting = waitForFlightSimStagePresentation(requestId, {
      limitMs: 1_000,
    }).then(() => {
      resolved = true
    })

    assert.equal(completeFlightSimHudStagePreparation(requestId, 16), true)
    await Promise.resolve()
    assert.equal(resolved, false)
    assert.equal(readCurrentFlightSimStagePreparationRequest(), requestId)
    assert.equal(completeFlightSimStagePreparation(requestId, {
      framePresented: true,
      revision: 17,
    }), true)
    await Promise.resolve()
    assert.equal(resolved, false)
    assert.equal(completeFlightSimHudStagePreparation(requestId, 17), true)
    await waiting
    assert.equal(resolved, true)
    assert.equal(animationFrame.callbacks.size, 0)
    assert.deepEqual(animationFrame.cancelled, [])
    cancelFlightSimStagePreparation(requestId)
    resetFlightSimStagePreparationForTests()
  } finally {
    animationFrame.restore()
  }
})

test('aborting a frame-opportunity wait cancels its pending browser frame', async () => {
  const animationFrame = installControlledAnimationFrameWindow()
  try {
    const controller = new AbortController()
    const waiting = waitForFlightSimStageFrameOpportunity({
      limitMs: 1_000,
      signal: controller.signal,
    })
    assert.equal(animationFrame.callbacks.size, 1)

    controller.abort(new Error('injected frame-opportunity abort'))
    await assert.rejects(waiting, /injected frame-opportunity abort/)
    assert.equal(animationFrame.callbacks.size, 0)
    assert.deepEqual(animationFrame.cancelled, [1])
  } finally {
    animationFrame.restore()
  }
})

test('a frame-opportunity wait fails closed when the browser never presents', async () => {
  const animationFrame = installControlledAnimationFrameWindow()
  try {
    await assert.rejects(
      waitForFlightSimStageFrameOpportunity({ limitMs: 0 }),
      /frame opportunity did not complete within 0 ms/,
    )
    assert.equal(animationFrame.callbacks.size, 0)
    assert.deepEqual(animationFrame.cancelled, [1])
  } finally {
    animationFrame.restore()
  }
})

test('presentation keeps one absolute budget and rejects a stale prepared request', async () => {
  const animationFrame = installControlledAnimationFrameWindow()
  try {
    resetFlightSimStagePreparationForTests()
    const expiredRequestId = beginFlightSimStagePreparation()
    assert.equal(completeFlightSimStagePreparation(expiredRequestId), true)
    await assert.rejects(
      waitForFlightSimStagePresentation(expiredRequestId, { limitMs: 0 }),
      /presentation request .* did not complete within 0 ms/,
    )
    assert.equal(animationFrame.callbacks.size, 0)

    const staleRequestId = beginFlightSimStagePreparation()
    const waiting = waitForFlightSimStagePresentation(staleRequestId, {
      limitMs: 1_000,
    })
    assert.equal(completeFlightSimStagePreparation(staleRequestId), true)
    await Promise.resolve()
    assert.equal(animationFrame.callbacks.size, 1)
    resetFlightSimStagePreparationForTests()
    const [[frameId, presentFrame]] = [...animationFrame.callbacks]
    animationFrame.callbacks.delete(frameId)
    presentFrame(16)
    await assert.rejects(waiting, /preparation request .* is stale/)
  } finally {
    resetFlightSimStagePreparationForTests()
    animationFrame.restore()
  }
})
