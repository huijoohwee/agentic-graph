import {
  XR_V2_CAPTURE_SNAPSHOT_SCHEMA,
  XR_V2_CONTRACT_VERSION,
  type XrV2CaptureConfiguration,
  type XrV2CaptureSnapshot,
} from './captureContracts'

function requirePositiveFinite(value: number, name: string): number {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${name} must be a positive finite number`)
  }
  return value
}

function requirePositiveInteger(value: number, name: string): number {
  requirePositiveFinite(value, name)
  if (!Number.isInteger(value)) throw new Error(`${name} must be an integer`)
  return value
}

function freezeSnapshot(snapshot: XrV2CaptureSnapshot): XrV2CaptureSnapshot {
  if (snapshot.fallback) Object.freeze(snapshot.fallback)
  return Object.freeze(snapshot)
}

export function createXrV2CaptureSnapshot(input: Readonly<{
  sessionId: string
  configuration: XrV2CaptureConfiguration
}>): XrV2CaptureSnapshot {
  const sessionId = input.sessionId.trim()
  if (!sessionId) throw new Error('sessionId is required')

  return freezeSnapshot({
    schema: XR_V2_CAPTURE_SNAPSHOT_SCHEMA,
    contractVersion: XR_V2_CONTRACT_VERSION,
    sessionId,
    phase: 'idle',
    frameBudgetMs: requirePositiveFinite(input.configuration.frameBudgetMs, 'frameBudgetMs'),
    consecutiveBudgetBreachesRequired: requirePositiveInteger(
      input.configuration.consecutiveBudgetBreaches,
      'consecutiveBudgetBreaches',
    ),
    maxFrames: requirePositiveInteger(input.configuration.maxFrames, 'maxFrames'),
    rawFrameCount: 0,
    depthFrameCount: 0,
    synthesizedFrameCount: 0,
    consecutiveBudgetBreaches: 0,
    lastFrameIndex: null,
    fallback: null,
  })
}

export function startXrV2Capture(
  snapshot: XrV2CaptureSnapshot,
): XrV2CaptureSnapshot {
  if (snapshot.phase !== 'idle') throw new Error('capture session has already started')
  return freezeSnapshot({ ...snapshot, phase: 'capturing-live' })
}

export function assertXrV2CaptureFrameAccepted(
  snapshot: XrV2CaptureSnapshot,
  frameIndex: number,
): void {
  if (snapshot.phase !== 'capturing-live' && snapshot.phase !== 'capturing-raw') {
    throw new Error('capture session is not accepting frames')
  }
  if (!Number.isInteger(frameIndex) || frameIndex < 0) {
    throw new Error('frameIndex must be a non-negative integer')
  }
  if (snapshot.lastFrameIndex !== null && frameIndex <= snapshot.lastFrameIndex) {
    throw new Error('frameIndex must be strictly increasing')
  }
  if (snapshot.rawFrameCount >= snapshot.maxFrames) {
    throw new Error(`capture frame limit reached (${snapshot.maxFrames})`)
  }
}

export function recordXrV2RawFrame(
  snapshot: XrV2CaptureSnapshot,
  frameIndex: number,
): XrV2CaptureSnapshot {
  assertXrV2CaptureFrameAccepted(snapshot, frameIndex)
  return freezeSnapshot({
    ...snapshot,
    rawFrameCount: snapshot.rawFrameCount + 1,
    lastFrameIndex: frameIndex,
  })
}

export function recordXrV2LiveFrameOutcome(
  snapshot: XrV2CaptureSnapshot,
  input: Readonly<{
    frameIndex: number
    processingDurationMs: number
    depthRecorded: boolean
    synthesized: boolean
    processingFailed: boolean
  }>,
): XrV2CaptureSnapshot {
  if (snapshot.phase !== 'capturing-live') {
    throw new Error('live frame outcome requires a live capture phase')
  }
  if (snapshot.lastFrameIndex !== input.frameIndex) {
    throw new Error('live frame outcome must match the most recently recorded raw frame')
  }
  if (!Number.isFinite(input.processingDurationMs) || input.processingDurationMs < 0) {
    throw new Error('processingDurationMs must be a non-negative finite number')
  }

  const breachedBudget = input.processingFailed
    || input.processingDurationMs > snapshot.frameBudgetMs
  const consecutiveBudgetBreaches = breachedBudget
    ? snapshot.consecutiveBudgetBreaches + 1
    : 0
  const shouldFallback = consecutiveBudgetBreaches
    >= snapshot.consecutiveBudgetBreachesRequired

  return freezeSnapshot({
    ...snapshot,
    phase: shouldFallback ? 'capturing-raw' : snapshot.phase,
    depthFrameCount: snapshot.depthFrameCount + Number(input.depthRecorded),
    synthesizedFrameCount: snapshot.synthesizedFrameCount + Number(input.synthesized),
    consecutiveBudgetBreaches,
    fallback: shouldFallback
      ? {
          triggeredAtFrameIndex: input.frameIndex,
          observedDurationMs: input.processingDurationMs,
          reason: input.processingFailed
            ? 'live-processing-error'
            : 'budget-breach',
        }
      : null,
  })
}

export function completeXrV2Capture(
  snapshot: XrV2CaptureSnapshot,
): XrV2CaptureSnapshot {
  if (snapshot.phase !== 'capturing-live' && snapshot.phase !== 'capturing-raw') {
    throw new Error('only an active capture session can complete')
  }
  if (snapshot.rawFrameCount === 0) {
    throw new Error('capture session cannot complete without a raw frame')
  }
  return freezeSnapshot({ ...snapshot, phase: 'completed' })
}
