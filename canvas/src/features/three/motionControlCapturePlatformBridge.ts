import type { MotionControlPoseFrame } from './motionControlPose'
import {
  motionCaptureSessionRuntime,
  readMotionCaptureSessionSnapshot,
} from './motionCaptureSessionRuntime'
import { publishMotionCapturePeerObservation, setMotionCapturePeerSharingEnabled } from './motionCapturePeerRuntime'
import { motionCaptureProviderApi } from './motionCaptureProviderRuntime'

type LocalCaptureSourceInput = Readonly<{
  width?: number
  height?: number
  nominalFps?: number
}>

let localSourceId: string | null = null
let localSequence = 0
let lastBridgeError = ''

const finitePositive = (value: number | undefined): value is number => (
  typeof value === 'number' && Number.isFinite(value) && value > 0
)

function rememberFailure(error: unknown): false {
  lastBridgeError = error instanceof Error ? error.message : String(error)
  return false
}

export function startMotionControlCapturePlatformSource(input: LocalCaptureSourceInput = {}): boolean {
  try {
    if (localSourceId) motionCaptureSessionRuntime.removeSource(localSourceId)
    const dimensions = finitePositive(input.width) && finitePositive(input.height)
      ? { width: input.width, height: input.height }
      : undefined
    const source = motionCaptureSessionRuntime.registerSource({
      captureKind: 'video',
      coordinateSpace: 'model-relative',
      clockDomain: 'session-monotonic',
      ...(dimensions ? { dimensions } : {}),
      ...(finitePositive(input.nominalFps) ? { nominalFps: input.nominalFps } : {}),
    })
    localSourceId = source.sourceId
    lastBridgeError = ''
    return true
  } catch (error) {
    localSourceId = null
    return rememberFailure(error)
  }
}

function ingestLocalObservation(input: Readonly<{
  captureTimestampMs: number
  confidence: number
  landmarks: MotionControlPoseFrame['worldLandmarks']
  missing: boolean
}>): boolean {
  if (!localSourceId) {
    lastBridgeError = 'The built-in Motion Control source is not registered.'
    return false
  }
  try {
    localSequence += 1
    motionCaptureSessionRuntime.ingestObservation(localSourceId, {
      captureTimestampMs: input.captureTimestampMs,
      sequence: localSequence,
      coordinateSpace: 'model-relative',
      confidence: input.confidence,
      landmarks: input.landmarks,
      missing: input.missing,
    })
    publishMotionCapturePeerObservation({
      captureTimestampMs: input.captureTimestampMs,
      sequence: localSequence,
      confidence: input.confidence,
      landmarks: input.landmarks,
      missing: input.missing,
    })
    lastBridgeError = ''
    return true
  } catch (error) {
    return rememberFailure(error)
  }
}

export function recordMotionControlCapturePose(frame: MotionControlPoseFrame, captureTimestampMs: number): boolean {
  return ingestLocalObservation({
    captureTimestampMs,
    confidence: frame.confidence,
    landmarks: frame.worldLandmarks,
    missing: false,
  })
}

export function recordMotionControlCaptureMissingSample(captureTimestampMs: number, confidence: number): boolean {
  return ingestLocalObservation({
    captureTimestampMs,
    confidence,
    landmarks: Object.freeze([]),
    missing: true,
  })
}

export function stopMotionControlCapturePlatformSource(options: Readonly<{
  clearRecording?: boolean
  releaseRegisteredSources?: boolean
}> = {}): void {
  try {
    if (options.releaseRegisteredSources === true) setMotionCapturePeerSharingEnabled(false)
    if (options.releaseRegisteredSources === true
      && readMotionCaptureSessionSnapshot().recording.status === 'recording') {
      motionCaptureSessionRuntime.stopRecording()
    }
    if (options.releaseRegisteredSources === true) releaseMotionControlCapturePlatformSources()
    else {
      if (localSourceId && readMotionCaptureSessionSnapshot().sources.some(source => source.sourceId === localSourceId)) {
        motionCaptureSessionRuntime.removeSource(localSourceId)
      }
      localSourceId = null
    }
    if (options.clearRecording === true) motionCaptureSessionRuntime.clearRecording()
    lastBridgeError = ''
  } catch (error) {
    localSourceId = null
    rememberFailure(error)
  }
}

export function releaseMotionControlCapturePlatformSources(): void {
  motionCaptureSessionRuntime.releaseAllSources()
  localSourceId = null
}

export function inspectMotionControlCapturePlatform() {
  return {
    ...readMotionCaptureSessionSnapshot(),
    bridge: {
      builtInSourceActive: localSourceId !== null,
      lastError: lastBridgeError,
      providerApi: motionCaptureProviderApi.inspect(),
    },
    privacy: {
      frameUpload: false,
      framePersistence: false,
      rawTensorRetention: false,
      recordingScope: 'derived-landmarks-only' as const,
    },
  }
}
