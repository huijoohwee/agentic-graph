import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  assertXrV2CaptureFrameAccepted,
  completeXrV2Capture,
  createXrV2CaptureSnapshot,
  recordXrV2LiveFrameOutcome,
  recordXrV2RawFrame,
  startXrV2Capture,
} from '../captureStateMachine'

const configuration = Object.freeze({
  frameBudgetMs: 50,
  consecutiveBudgetBreaches: 2,
  maxFrames: 8,
})

function recordLiveFrame(
  snapshot: ReturnType<typeof createXrV2CaptureSnapshot>,
  frameIndex: number,
  processingDurationMs: number,
) {
  const withRaw = recordXrV2RawFrame(snapshot, frameIndex)
  return recordXrV2LiveFrameOutcome(withRaw, {
    frameIndex,
    processingDurationMs,
    depthRecorded: true,
    synthesized: true,
    processingFailed: false,
  })
}

test('state machine falls back only after consecutive budget breaches', () => {
  let snapshot = startXrV2Capture(createXrV2CaptureSnapshot({
    sessionId: 'capture-1',
    configuration,
  }))

  snapshot = recordLiveFrame(snapshot, 0, 60)
  assert.equal(snapshot.consecutiveBudgetBreaches, 1)
  snapshot = recordLiveFrame(snapshot, 1, 40)
  assert.equal(snapshot.consecutiveBudgetBreaches, 0)
  snapshot = recordLiveFrame(snapshot, 2, 51)
  snapshot = recordLiveFrame(snapshot, 3, 52)

  assert.equal(snapshot.phase, 'capturing-raw')
  assert.deepEqual(snapshot.fallback, {
    triggeredAtFrameIndex: 3,
    observedDurationMs: 52,
    reason: 'budget-breach',
  })
  assert.equal(snapshot.rawFrameCount, 4)
  assert.equal(snapshot.depthFrameCount, 4)
  assert.equal(snapshot.synthesizedFrameCount, 4)
})

test('state machine rejects duplicate, out-of-order, and excess frames', () => {
  let snapshot = startXrV2Capture(createXrV2CaptureSnapshot({
    sessionId: 'capture-2',
    configuration: { ...configuration, maxFrames: 1 },
  }))
  snapshot = recordXrV2RawFrame(snapshot, 4)

  assert.throws(() => assertXrV2CaptureFrameAccepted(snapshot, 4), /strictly increasing|frame limit/)
  assert.throws(() => assertXrV2CaptureFrameAccepted(snapshot, 3), /strictly increasing|frame limit/)
  assert.throws(() => assertXrV2CaptureFrameAccepted(snapshot, 5), /frame limit/)
})

test('state machine requires a bounded configuration and at least one raw frame', () => {
  assert.throws(() => createXrV2CaptureSnapshot({
    sessionId: 'invalid',
    configuration: { ...configuration, maxFrames: 0 },
  }), /maxFrames/)

  const active = startXrV2Capture(createXrV2CaptureSnapshot({
    sessionId: 'empty',
    configuration,
  }))
  assert.throws(() => completeXrV2Capture(active), /without a raw frame/)
})
