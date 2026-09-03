import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  XR_V2_STEREO_PAIR_SCHEMA,
  type XrV2CaptureArtifactSink,
  type XrV2CaptureFrame,
} from '../captureContracts'
import { createXrV2CaptureSession } from '../captureSession'

type TestFrame = Readonly<{ value: number }>
type TestDepth = Readonly<{ value: number }>

function createSink() {
  const rawFrameIndexes: number[] = []
  const depthFrameIndexes: number[] = []
  const sink: XrV2CaptureArtifactSink<TestFrame, TestDepth> = {
    writeRawFrame: frame => {
      rawFrameIndexes.push(frame.frameIndex)
    },
    writeDepthEstimate: input => {
      depthFrameIndexes.push(input.frameIndex)
    },
    finalize: () => ({
      rawClipRef: 'workspace://capture/raw.webm',
      depthMetadataRef: 'workspace://capture/depth.json',
    }),
  }
  return { sink, rawFrameIndexes, depthFrameIndexes }
}

function frame(frameIndex: number): XrV2CaptureFrame<TestFrame> {
  return { frameIndex, capturedAtMs: frameIndex * 33, frame: { value: frameIndex } }
}

test('capture session emits stereo for at least 90 percent of an in-budget clip', async () => {
  let currentTimeMs = 0
  const { sink, rawFrameIndexes, depthFrameIndexes } = createSink()
  const previewFrameIndexes: number[] = []
  const diagnostics: number[] = []
  const session = createXrV2CaptureSession({
    sessionId: 'live-clip',
    configuration: {
      frameBudgetMs: 50,
      consecutiveBudgetBreaches: 2,
      maxFrames: 10,
    },
    clock: { now: () => currentTimeMs },
    artifactSink: sink,
    depthEstimator: {
      estimate: input => {
        currentTimeMs += 10
        return { depth: { value: input.frame.value }, confidence: 0.9 }
      },
    },
    stereoSynthesizer: {
      synthesize: ({ frame: source }) => {
        if (source.frameIndex === 4) throw new Error('synthetic dropped preview')
        return {
          schema: XR_V2_STEREO_PAIR_SCHEMA,
          frameIndex: source.frameIndex,
          capturedAtMs: source.capturedAtMs,
          left: `left-${source.frameIndex}`,
          right: `right-${source.frameIndex}`,
        }
      },
    },
    onStereoPair: pair => {
      previewFrameIndexes.push(pair.frameIndex)
    },
    onDiagnostic: diagnostic => {
      diagnostics.push(diagnostic.frameIndex)
    },
  })

  session.start()
  await Promise.all(Array.from({ length: 10 }, (_, frameIndex) => (
    session.processFrame(frame(frameIndex))
  )))
  const result = await session.complete()

  assert.deepEqual(rawFrameIndexes, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9])
  assert.deepEqual(depthFrameIndexes, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9])
  assert.equal(new Set(rawFrameIndexes).size, 10)
  assert.equal(previewFrameIndexes.length / rawFrameIndexes.length, 0.9)
  assert.deepEqual(diagnostics, [4])
  assert.equal(result.synthesisMode, 'live')
  assert.equal(result.postProcessJob, null)
  assert.equal(result.snapshot.phase, 'completed')
  assert.equal(result.snapshot.synthesizedFrameCount, 9)
})

test('capture session switches to raw mode and queues a deterministic post-process job', async () => {
  let currentTimeMs = 0
  let estimatorCalls = 0
  const { sink, rawFrameIndexes, depthFrameIndexes } = createSink()
  const session = createXrV2CaptureSession({
    sessionId: 'fallback-clip',
    configuration: {
      frameBudgetMs: 50,
      consecutiveBudgetBreaches: 2,
      maxFrames: 4,
    },
    clock: { now: () => currentTimeMs },
    artifactSink: sink,
    depthEstimator: {
      estimate: input => {
        estimatorCalls += 1
        currentTimeMs += input.frameIndex === 0 ? 60 : 55
        return { depth: { value: input.frame.value }, confidence: 1 }
      },
    },
    stereoSynthesizer: {
      synthesize: ({ frame: source }) => ({
        schema: XR_V2_STEREO_PAIR_SCHEMA,
        frameIndex: source.frameIndex,
        capturedAtMs: source.capturedAtMs,
        left: source.frame.value,
        right: source.frame.value,
      }),
    },
  })

  session.start()
  await session.processFrame(frame(0))
  const fallbackSnapshot = await session.processFrame(frame(1))
  await session.processFrame(frame(2))
  const result = await session.complete()

  assert.equal(fallbackSnapshot.phase, 'capturing-raw')
  assert.equal(estimatorCalls, 2)
  assert.deepEqual(rawFrameIndexes, [0, 1, 2])
  assert.deepEqual(depthFrameIndexes, [0, 1])
  assert.equal(result.synthesisMode, 'post-process')
  assert.equal(result.postProcessJob?.schema, 'agentic-graph-xr-post-process-job/v2')
  assert.equal(result.postProcessJob?.jobId, 'fallback-clip:post-process:1')
  assert.equal(result.postProcessJob?.rawClipRef, 'workspace://capture/raw.webm')
  assert.equal(result.postProcessJob?.depthMetadataRef, 'workspace://capture/depth.json')
  assert.deepEqual(result.postProcessJob?.fallback, {
    triggeredAtFrameIndex: 1,
    observedDurationMs: 55,
    reason: 'budget-breach',
  })
})

test('capture completion demotes sub-90-percent stereo coverage without consecutive misses', async () => {
  let currentTimeMs = 0
  const { sink } = createSink()
  const session = createXrV2CaptureSession({
    sessionId: 'coverage-fallback',
    configuration: { frameBudgetMs: 50, consecutiveBudgetBreaches: 2, maxFrames: 4 },
    clock: { now: () => currentTimeMs },
    artifactSink: sink,
    depthEstimator: {
      estimate: input => {
        currentTimeMs += 10
        if (input.frameIndex % 2 === 1) throw new Error('alternating inference miss')
        return { depth: { value: input.frame.value }, confidence: 1 }
      },
    },
    stereoSynthesizer: {
      synthesize: ({ frame: source }) => ({
        schema: XR_V2_STEREO_PAIR_SCHEMA,
        frameIndex: source.frameIndex,
        capturedAtMs: source.capturedAtMs,
        left: source.frame.value,
        right: source.frame.value,
      }),
    },
  })

  session.start()
  for (let frameIndex = 0; frameIndex < 4; frameIndex += 1) {
    const state = await session.processFrame(frame(frameIndex))
    assert.equal(state.phase, 'capturing-live')
  }
  const result = await session.complete()
  assert.equal(result.snapshot.synthesizedFrameCount, 2)
  assert.equal(result.synthesisMode, 'post-process')
  assert.equal(result.postProcessJob?.fallback.reason, 'live-processing-error')
  assert.equal(result.postProcessJob?.fallback.triggeredAtFrameIndex, 3)
})

test('capture session records raw once when a duplicate frame is rejected', async () => {
  let currentTimeMs = 0
  const { sink, rawFrameIndexes } = createSink()
  const session = createXrV2CaptureSession({
    sessionId: 'unique-frames',
    configuration: {
      frameBudgetMs: 50,
      consecutiveBudgetBreaches: 2,
      maxFrames: 2,
    },
    clock: { now: () => currentTimeMs },
    artifactSink: sink,
    depthEstimator: {
      estimate: () => {
        currentTimeMs += 10
        return { depth: { value: 1 }, confidence: 1 }
      },
    },
    stereoSynthesizer: {
      synthesize: ({ frame: source }) => ({
        schema: XR_V2_STEREO_PAIR_SCHEMA,
        frameIndex: source.frameIndex,
        capturedAtMs: source.capturedAtMs,
        left: source.frame.value,
        right: source.frame.value,
      }),
    },
  })

  session.start()
  await session.processFrame(frame(0))
  await assert.rejects(() => session.processFrame(frame(0)), /strictly increasing/)
  assert.deepEqual(rawFrameIndexes, [0])
})
