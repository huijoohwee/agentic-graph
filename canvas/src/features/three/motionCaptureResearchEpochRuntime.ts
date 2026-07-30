import type { MotionCaptureRecordingSourceRejection } from './motionCapturePlatformContract'

export type MutableMotionCaptureSourceRejections = Map<string, MotionCaptureRecordingSourceRejection>

export function buildMotionCaptureResearchEvidenceEpoch(
  sourceIds: readonly string[],
  readEpoch: (sourceId: string) => number,
): string | null {
  return sourceIds.length >= 2
    ? JSON.stringify(sourceIds.map(sourceId => [sourceId, readEpoch(sourceId)]))
    : null
}

export function recordMotionCaptureSourceRejection(
  rejections: MutableMotionCaptureSourceRejections,
  sourceId: string,
  researchEvidenceEpoch: string | null,
): void {
  const key = JSON.stringify([sourceId, researchEvidenceEpoch])
  const previous = rejections.get(key)
  rejections.set(key, Object.freeze({
    sourceId,
    researchEvidenceEpoch,
    outOfOrderSamples: (previous?.outOfOrderSamples || 0) + 1,
  }))
}

export function freezeMotionCaptureSourceRejections(
  rejections: MutableMotionCaptureSourceRejections,
): readonly MotionCaptureRecordingSourceRejection[] {
  return Object.freeze([...rejections.values()].sort((left, right) => (
    left.sourceId.localeCompare(right.sourceId)
    || String(left.researchEvidenceEpoch).localeCompare(String(right.researchEvidenceEpoch))
  )))
}
