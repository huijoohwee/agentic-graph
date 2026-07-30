import type { MotionCaptureSourceQuality, MotionCaptureSourceState } from './motionCapturePlatformContract'

export type MutableMotionCaptureSourceQuality = {
  receivedSamples: number
  usableSamples: number
  researchUsableSamples: number
  lowEvidenceSamples: number
  missingSamples: number
  droppedSequenceSamples: number
  unsequencedSamples: number
  outOfOrderSamples: number
  intervalCount: number
  intervalMeanMs: number
  intervalM2: number
  firstResearchTimestampMs: number | null
  lastResearchTimestampMs: number | null
}

export type MutableMotionCaptureSource = {
  state: MotionCaptureSourceState
  quality: MutableMotionCaptureSourceQuality
  previousCaptureTimestampMs: number | null
  previousSequence: number | null
  researchEvidenceEpoch: number
}

export function createMutableMotionCaptureSourceQuality(): MutableMotionCaptureSourceQuality {
  return {
    receivedSamples: 0,
    usableSamples: 0,
    researchUsableSamples: 0,
    lowEvidenceSamples: 0,
    missingSamples: 0,
    droppedSequenceSamples: 0,
    unsequencedSamples: 0,
    outOfOrderSamples: 0,
    intervalCount: 0,
    intervalMeanMs: 0,
    intervalM2: 0,
    firstResearchTimestampMs: null,
    lastResearchTimestampMs: null,
  }
}

export function freezeMotionCaptureSourceQuality(
  quality: MutableMotionCaptureSourceQuality,
): MotionCaptureSourceQuality {
  const jitterMs = quality.intervalCount > 1
    ? Math.sqrt(quality.intervalM2 / (quality.intervalCount - 1))
    : 0
  const expectedSamples = quality.receivedSamples + quality.droppedSequenceSamples
  return Object.freeze({
    receivedSamples: quality.receivedSamples,
    usableSamples: quality.usableSamples,
    researchUsableSamples: quality.researchUsableSamples,
    lowEvidenceSamples: quality.lowEvidenceSamples,
    missingSamples: quality.missingSamples,
    droppedSequenceSamples: quality.droppedSequenceSamples,
    unsequencedSamples: quality.unsequencedSamples,
    outOfOrderSamples: quality.outOfOrderSamples,
    researchDurationMs: quality.firstResearchTimestampMs === null || quality.lastResearchTimestampMs === null
      ? 0
      : Math.max(0, quality.lastResearchTimestampMs - quality.firstResearchTimestampMs),
    jitterMs,
    dropRate: expectedSamples > 0
      ? (quality.missingSamples + quality.droppedSequenceSamples) / expectedSamples
      : 0,
  })
}

export function resetMotionCaptureSourceResearchEvidence(source: MutableMotionCaptureSource): void {
  source.quality = createMutableMotionCaptureSourceQuality()
  source.previousCaptureTimestampMs = null
  source.previousSequence = null
  source.researchEvidenceEpoch += 1
  source.state = Object.freeze({
    ...source.state,
    quality: freezeMotionCaptureSourceQuality(source.quality),
    latestObservation: null,
  })
}
