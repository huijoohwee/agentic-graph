import {
  MOTION_CAPTURE_DEFAULT_LIMITS,
  type MotionCaptureLimits,
} from './motionCapturePlatformContract'
import { finiteNumber } from './motionCaptureInputValidation'

export function mergeMotionCaptureLimits(overrides: Partial<MotionCaptureLimits> | undefined): MotionCaptureLimits {
  const limits = { ...MOTION_CAPTURE_DEFAULT_LIMITS, ...overrides }
  for (const [field, value] of Object.entries(limits)) finiteNumber(value, `limit-${field}`, 0)
  const integerLimits = [
    limits.maxSources, limits.maxLandmarksPerObservation,
    limits.maxRecordingSamples, limits.minimumCalibrationSamples,
    limits.minimumCalibrationPoses, limits.minimumClockAlignmentSamples,
    limits.minimumTriangulatedSamples, limits.minimumResearchSamplesPerSource,
  ]
  const probabilityLimits = [
    limits.minimumObservationConfidence,
    limits.minimumLandmarkVisibility,
    limits.minimumLandmarkPresence,
    limits.minimumLandmarkEvidenceRatio,
  ]
  const unsafeRelaxation = Object.entries(limits).some(([field, value]) => {
    const canonical = MOTION_CAPTURE_DEFAULT_LIMITS[field as keyof MotionCaptureLimits]
    return field.startsWith('minimum') ? value < canonical : value > canonical
  })
  if (integerLimits.some(value => !Number.isInteger(value) || value < 1)
    || probabilityLimits.some(value => value > 1)
    || unsafeRelaxation) {
    throw new Error('motion-capture-invalid-runtime-limits')
  }
  return Object.freeze(limits)
}
