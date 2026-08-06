import {
  XR_V2_CAPTURE_RESULT_SCHEMA,
  XR_V2_CONTRACT_VERSION,
  XR_V2_POST_PROCESS_JOB_SCHEMA,
  type XrV2CaptureArtifactSink,
  type XrV2CaptureArtifacts,
  type XrV2CaptureClock,
  type XrV2CaptureConfiguration,
  type XrV2CaptureDiagnostic,
  type XrV2CaptureFrame,
  type XrV2CaptureResult,
  type XrV2CaptureSnapshot,
  type XrV2DepthEstimate,
  type XrV2DepthEstimator,
  type XrV2StereoPair,
  type XrV2StereoSynthesizer,
} from './captureContracts'
import {
  assertXrV2CaptureFrameAccepted,
  completeXrV2Capture,
  createXrV2CaptureSnapshot,
  enforceXrV2MinimumStereoCoverage,
  recordXrV2LiveFrameOutcome,
  recordXrV2RawFrame,
  startXrV2Capture,
} from './captureStateMachine'

const DEFAULT_CAPTURE_CLOCK: XrV2CaptureClock = Object.freeze({
  now: () => Date.now(),
})

export type XrV2CaptureSessionOptions<TFrame, TDepth, TPreviewFrame> = Readonly<{
  sessionId: string
  configuration: XrV2CaptureConfiguration
  depthEstimator: XrV2DepthEstimator<TFrame, TDepth>
  stereoSynthesizer: XrV2StereoSynthesizer<TFrame, TDepth, TPreviewFrame>
  artifactSink: XrV2CaptureArtifactSink<TFrame, TDepth>
  clock?: XrV2CaptureClock
  onStereoPair?: (
    pair: XrV2StereoPair<TPreviewFrame>,
  ) => void | Promise<void>
  onDiagnostic?: (diagnostic: XrV2CaptureDiagnostic) => void
}>

export type XrV2CaptureSession<TFrame> = Readonly<{
  start: () => XrV2CaptureSnapshot
  processFrame: (frame: XrV2CaptureFrame<TFrame>) => Promise<XrV2CaptureSnapshot>
  complete: () => Promise<XrV2CaptureResult>
  readSnapshot: () => XrV2CaptureSnapshot
}>

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message
  return String(error || 'Unknown live processing failure')
}

function assertCaptureFrame(frame: XrV2CaptureFrame<unknown>): void {
  if (!Number.isFinite(frame.capturedAtMs) || frame.capturedAtMs < 0) {
    throw new Error('capturedAtMs must be a non-negative finite number')
  }
}

function assertDepthEstimate<TDepth>(
  estimate: XrV2DepthEstimate<TDepth>,
): void {
  if (!estimate || !Object.prototype.hasOwnProperty.call(estimate, 'depth')) {
    throw new Error('depth estimator returned no depth payload')
  }
  if (
    !Number.isFinite(estimate.confidence)
    || estimate.confidence < 0
    || estimate.confidence > 1
  ) {
    throw new Error('depth estimator confidence must be between 0 and 1')
  }
}

function assertStereoPair<TPreviewFrame>(
  pair: XrV2StereoPair<TPreviewFrame>,
  frame: XrV2CaptureFrame<unknown>,
): void {
  if (pair.frameIndex !== frame.frameIndex) {
    throw new Error('stereo pair frameIndex does not match its source frame')
  }
  if (pair.capturedAtMs !== frame.capturedAtMs) {
    throw new Error('stereo pair timestamp does not match its source frame')
  }
}

function normalizeArtifacts(artifacts: XrV2CaptureArtifacts): XrV2CaptureArtifacts {
  const rawClipRef = String(artifacts?.rawClipRef || '').trim()
  const depthMetadataRef = String(artifacts?.depthMetadataRef || '').trim()
  if (!rawClipRef) throw new Error('capture artifact sink returned no raw clip reference')
  if (!depthMetadataRef) {
    throw new Error('capture artifact sink returned no depth metadata reference')
  }
  return Object.freeze({ rawClipRef, depthMetadataRef })
}

export function createXrV2CaptureSession<TFrame, TDepth, TPreviewFrame>(
  options: XrV2CaptureSessionOptions<TFrame, TDepth, TPreviewFrame>,
): XrV2CaptureSession<TFrame> {
  const clock = options.clock || DEFAULT_CAPTURE_CLOCK
  let snapshot = createXrV2CaptureSnapshot({
    sessionId: options.sessionId,
    configuration: options.configuration,
  })
  let completedResult: XrV2CaptureResult | null = null
  let operationChain: Promise<void> = Promise.resolve()

  function enqueue<TResult>(operation: () => Promise<TResult>): Promise<TResult> {
    const result = operationChain.then(operation)
    operationChain = result.then(() => undefined, () => undefined)
    return result
  }

  async function processFrameNow(
    frame: XrV2CaptureFrame<TFrame>,
  ): Promise<XrV2CaptureSnapshot> {
    assertCaptureFrame(frame)
    assertXrV2CaptureFrameAccepted(snapshot, frame.frameIndex)

    await options.artifactSink.writeRawFrame(frame)
    snapshot = recordXrV2RawFrame(snapshot, frame.frameIndex)
    if (snapshot.phase === 'capturing-raw') return snapshot

    const processingStartedAtMs = clock.now()
    let depthRecorded = false
    try {
      const estimate = await options.depthEstimator.estimate(frame)
      assertDepthEstimate(estimate)
      await options.artifactSink.writeDepthEstimate({
        frameIndex: frame.frameIndex,
        capturedAtMs: frame.capturedAtMs,
        estimate,
      })
      depthRecorded = true
      const pair = await options.stereoSynthesizer.synthesize({ frame, estimate })
      assertStereoPair(pair, frame)
      const processingDurationMs = Math.max(0, clock.now() - processingStartedAtMs)
      if (options.onStereoPair) await options.onStereoPair(pair)
      snapshot = recordXrV2LiveFrameOutcome(snapshot, {
        frameIndex: frame.frameIndex,
        processingDurationMs,
        depthRecorded,
        synthesized: true,
        processingFailed: false,
      })
      return snapshot
    } catch (error) {
      const processingDurationMs = Math.max(0, clock.now() - processingStartedAtMs)
      snapshot = recordXrV2LiveFrameOutcome(snapshot, {
        frameIndex: frame.frameIndex,
        processingDurationMs,
        depthRecorded,
        synthesized: false,
        processingFailed: true,
      })
      options.onDiagnostic?.({
        code: 'live-processing-failed',
        frameIndex: frame.frameIndex,
        message: errorMessage(error),
      })
      return snapshot
    }
  }

  async function completeNow(): Promise<XrV2CaptureResult> {
    if (completedResult) return completedResult
    if (snapshot.phase !== 'capturing-live' && snapshot.phase !== 'capturing-raw') {
      throw new Error('only an active capture session can complete')
    }

    snapshot = enforceXrV2MinimumStereoCoverage(snapshot)
    const artifacts = normalizeArtifacts(await options.artifactSink.finalize({ snapshot }))
    const completedSnapshot = completeXrV2Capture(snapshot)
    const queuedAtMs = clock.now()
    if (!Number.isFinite(queuedAtMs) || queuedAtMs < 0) {
      throw new Error('capture clock returned an invalid completion timestamp')
    }
    const postProcessJob = completedSnapshot.fallback
      ? Object.freeze({
          schema: XR_V2_POST_PROCESS_JOB_SCHEMA,
          contractVersion: XR_V2_CONTRACT_VERSION,
          jobId: `${completedSnapshot.sessionId}:post-process:1`,
          sessionId: completedSnapshot.sessionId,
          status: 'queued' as const,
          rawClipRef: artifacts.rawClipRef,
          depthMetadataRef: artifacts.depthMetadataRef,
          queuedAtMs,
          fallback: completedSnapshot.fallback,
        })
      : null

    snapshot = completedSnapshot
    completedResult = Object.freeze({
      schema: XR_V2_CAPTURE_RESULT_SCHEMA,
      contractVersion: XR_V2_CONTRACT_VERSION,
      sessionId: completedSnapshot.sessionId,
      synthesisMode: postProcessJob ? 'post-process' : 'live',
      artifacts,
      snapshot: completedSnapshot,
      postProcessJob,
    })
    return completedResult
  }

  return Object.freeze({
    start: () => {
      snapshot = startXrV2Capture(snapshot)
      return snapshot
    },
    processFrame: frame => enqueue(() => processFrameNow(frame)),
    complete: () => enqueue(completeNow),
    readSnapshot: () => snapshot,
  })
}
