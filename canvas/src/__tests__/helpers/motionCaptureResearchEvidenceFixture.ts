import type { MotionCaptureSessionRuntime } from '@/features/three/motionCaptureSessionRuntime'
import {
  MOTION_CAPTURE_RESEARCH_EVIDENCE_SCHEMA,
  MOTION_CAPTURE_RESEARCH_REFERENCE_FRAME,
  type MotionCaptureResearchEvidenceManifest,
} from '@/features/three/motionCaptureResearchEvidence'

const IDENTITY_TRANSFORM = Object.freeze([
  1, 0, 0, 0,
  0, 1, 0, 0,
  0, 0, 1, 0,
  0, 0, 0, 1,
])

export function buildResearchEvidenceManifest(
  runtime: MotionCaptureSessionRuntime,
  sourceIds: readonly string[],
  measuredAtMs: number,
): MotionCaptureResearchEvidenceManifest {
  const sourcesById = new Map(runtime.getSnapshot().sources.map(source => [source.sourceId, source]))
  return Object.freeze({
    schema: MOTION_CAPTURE_RESEARCH_EVIDENCE_SCHEMA,
    referenceFrame: MOTION_CAPTURE_RESEARCH_REFERENCE_FRAME,
    measuredAtMs,
    sources: Object.freeze(sourceIds.map((sourceId) => {
      const source = sourcesById.get(sourceId)
      if (!source) throw new Error(`missing motion capture fixture source ${sourceId}`)
      const dimensions = source.dimensions || { width: 640, height: 480 }
      return Object.freeze({
        sourceId,
        measuredAtMs,
        sensorToWorldMatrix: IDENTITY_TRANSFORM,
        measurementErrorMeters: 0.005,
        calibrationSampleCount: 60,
        calibrationPoseCount: 8,
        projection: source.captureKind === 'video' ? Object.freeze({
          model: 'pinhole' as const,
          imageWidth: dimensions.width,
          imageHeight: dimensions.height,
          intrinsics: Object.freeze([500, 0, dimensions.width / 2, 0, 500, dimensions.height / 2, 0, 0, 1]),
          reprojectionMeanPx: 0.5,
          reprojectionP95Px: 1,
        }) : null,
        clockAlignment: source.clockDomain === 'source-local' ? Object.freeze({
          offsetMs: source.clockAlignment.offsetMs || 0,
          uncertaintyMs: source.clockAlignment.uncertaintyMs || 0,
          measuredAtMs,
          sampleCount: 60,
        }) : null,
      })
    })),
    scaleValidation: Object.freeze({
      method: 'known-distance' as const,
      referenceDistanceMeters: 1,
      reconstructedDistanceMeters: 1.005,
      triangulatedSampleCount: 60,
    }),
  })
}

export async function applyResearchEvidenceManifest(
  runtime: MotionCaptureSessionRuntime,
  sourceIds: readonly string[],
  measuredAtMs: number,
): Promise<void> {
  await runtime.applyResearchEvidenceManifest(buildResearchEvidenceManifest(runtime, sourceIds, measuredAtMs))
}
