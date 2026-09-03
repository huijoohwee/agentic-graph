import {
  MOTION_CAPTURE_MAX_TIME_MS,
  type MotionCaptureCalibration,
  type MotionCaptureClockAlignment,
  type MotionCaptureLimits,
  type MotionCaptureSharedReconstructionEvidence,
  type MotionCaptureSourceState,
} from './motionCapturePlatformContract'
import {
  assertStrictRecord,
  boundedNumber,
  integerNumber,
} from './motionCaptureInputValidation'

export const MOTION_CAPTURE_RESEARCH_EVIDENCE_SCHEMA = 'agentic-graph.motion-capture-research-evidence/v1' as const
export const MOTION_CAPTURE_RESEARCH_REFERENCE_FRAME = 'metric-si-right-up-forward' as const

export type MotionCaptureResearchProjectionEvidence = Readonly<{
  model: 'pinhole'
  imageWidth: number
  imageHeight: number
  intrinsics: readonly number[]
  reprojectionMeanPx: number
  reprojectionP95Px: number
}>

export type MotionCaptureResearchClockEvidence = Readonly<{
  offsetMs: number
  uncertaintyMs: number
  measuredAtMs: number
  sampleCount: number
}>

export type MotionCaptureResearchSourceEvidence = Readonly<{
  sourceId: string
  measuredAtMs: number
  sensorToWorldMatrix: readonly number[]
  measurementErrorMeters: number
  calibrationSampleCount: number
  calibrationPoseCount: number
  projection: MotionCaptureResearchProjectionEvidence | null
  clockAlignment: MotionCaptureResearchClockEvidence | null
}>

export type MotionCaptureResearchScaleValidation = Readonly<{
  method: 'known-distance'
  referenceDistanceMeters: number
  reconstructedDistanceMeters: number
  triangulatedSampleCount: number
}>

export type MotionCaptureResearchEvidenceManifest = Readonly<{
  schema: typeof MOTION_CAPTURE_RESEARCH_EVIDENCE_SCHEMA
  referenceFrame: typeof MOTION_CAPTURE_RESEARCH_REFERENCE_FRAME
  measuredAtMs: number
  sources: readonly MotionCaptureResearchSourceEvidence[]
  scaleValidation: MotionCaptureResearchScaleValidation
}>

export type ValidatedMotionCaptureResearchEvidence = Readonly<{
  manifest: MotionCaptureResearchEvidenceManifest
  manifestDigestSha256: string
  scaleRelativeError: number
  sourceDigests: readonly Readonly<{
    sourceId: string
    calibrationDigestSha256: string
    clockDigestSha256: string
  }>[]
}>

export type MotionCaptureResearchEvidenceBinding = Readonly<{
  sourcePatches: readonly Readonly<{
    sourceId: string
    clockAlignment: MotionCaptureClockAlignment
    calibration: MotionCaptureCalibration
  }>[]
  sharedReconstruction: MotionCaptureSharedReconstructionEvidence
}>

const MANIFEST_KEYS = Object.freeze(['schema', 'referenceFrame', 'measuredAtMs', 'sources', 'scaleValidation'])
const SOURCE_KEYS = Object.freeze([
  'sourceId', 'measuredAtMs', 'sensorToWorldMatrix', 'measurementErrorMeters',
  'calibrationSampleCount', 'calibrationPoseCount', 'projection', 'clockAlignment',
])
const PROJECTION_KEYS = Object.freeze([
  'model', 'imageWidth', 'imageHeight', 'intrinsics', 'reprojectionMeanPx', 'reprojectionP95Px',
])
const CLOCK_KEYS = Object.freeze(['offsetMs', 'uncertaintyMs', 'measuredAtMs', 'sampleCount'])
const SCALE_KEYS = Object.freeze([
  'method', 'referenceDistanceMeters', 'reconstructedDistanceMeters', 'triangulatedSampleCount',
])

function numericValue(value: unknown, field: string): number {
  if (typeof value !== 'number') throw new Error(`motion-capture-invalid-${field}`)
  return value
}

function finiteVector(value: unknown, length: number, field: string): readonly number[] {
  if (!Array.isArray(value)
    || value.length !== length
    || Reflect.ownKeys(value).some(key => key !== 'length' && (!/^\d+$/u.test(String(key)) || Number(key) >= length))) {
    throw new Error(`motion-capture-invalid-${field}`)
  }
  const vector = Array.from(value, entry => boundedNumber(numericValue(entry, field), field, -1_000_000, 1_000_000))
  if (vector.length !== length || vector.some((_, index) => !(index in value))) {
    throw new Error(`motion-capture-invalid-${field}`)
  }
  return Object.freeze(vector)
}

function assertNear(value: number, expected: number, tolerance: number, field: string): void {
  if (Math.abs(value - expected) > tolerance) throw new Error(`motion-capture-invalid-${field}`)
}

function normalizeRigidTransform(value: unknown): readonly number[] {
  const matrix = finiteVector(value, 16, 'sensor-to-world-matrix')
  assertNear(matrix[12]!, 0, 1e-6, 'sensor-to-world-matrix')
  assertNear(matrix[13]!, 0, 1e-6, 'sensor-to-world-matrix')
  assertNear(matrix[14]!, 0, 1e-6, 'sensor-to-world-matrix')
  assertNear(matrix[15]!, 1, 1e-6, 'sensor-to-world-matrix')
  const rotation = [
    [matrix[0]!, matrix[1]!, matrix[2]!],
    [matrix[4]!, matrix[5]!, matrix[6]!],
    [matrix[8]!, matrix[9]!, matrix[10]!],
  ] as const
  const dot = (left: readonly number[], right: readonly number[]) => left.reduce(
    (total, entry, index) => total + entry * right[index]!, 0,
  )
  rotation.forEach(axis => assertNear(dot(axis, axis), 1, 0.05, 'sensor-to-world-matrix'))
  assertNear(dot(rotation[0], rotation[1]), 0, 0.05, 'sensor-to-world-matrix')
  assertNear(dot(rotation[0], rotation[2]), 0, 0.05, 'sensor-to-world-matrix')
  assertNear(dot(rotation[1], rotation[2]), 0, 0.05, 'sensor-to-world-matrix')
  const determinant = rotation[0][0] * (rotation[1][1] * rotation[2][2] - rotation[1][2] * rotation[2][1])
    - rotation[0][1] * (rotation[1][0] * rotation[2][2] - rotation[1][2] * rotation[2][0])
    + rotation[0][2] * (rotation[1][0] * rotation[2][1] - rotation[1][1] * rotation[2][0])
  assertNear(determinant, 1, 0.05, 'sensor-to-world-matrix')
  return matrix
}

function normalizeProjection(
  value: unknown,
  source: MotionCaptureSourceState,
  limits: MotionCaptureLimits,
): MotionCaptureResearchProjectionEvidence | null {
  if (value === null) {
    if (source.captureKind === 'video') throw new Error('motion-capture-research-video-projection-required')
    return null
  }
  assertStrictRecord(value, PROJECTION_KEYS, 'research-projection')
  const projection = value as Record<string, unknown>
  if (projection.model !== 'pinhole') throw new Error('motion-capture-invalid-research-projection-model')
  const imageWidth = integerNumber(numericValue(projection.imageWidth, 'research-image-width'), 'research-image-width', 1, 32_768)
  const imageHeight = integerNumber(numericValue(projection.imageHeight, 'research-image-height'), 'research-image-height', 1, 32_768)
  if (source.dimensions && (source.dimensions.width !== imageWidth || source.dimensions.height !== imageHeight)) {
    throw new Error('motion-capture-research-projection-dimensions-mismatch')
  }
  const intrinsics = finiteVector(projection.intrinsics, 9, 'research-intrinsics')
  if (intrinsics[0]! <= 0 || intrinsics[4]! <= 0
    || intrinsics[2]! < 0 || intrinsics[2]! > imageWidth
    || intrinsics[5]! < 0 || intrinsics[5]! > imageHeight) {
    throw new Error('motion-capture-invalid-research-intrinsics')
  }
  assertNear(intrinsics[6]!, 0, 1e-6, 'research-intrinsics')
  assertNear(intrinsics[7]!, 0, 1e-6, 'research-intrinsics')
  assertNear(intrinsics[8]!, 1, 1e-6, 'research-intrinsics')
  const reprojectionMeanPx = boundedNumber(
    numericValue(projection.reprojectionMeanPx, 'research-reprojection-mean'), 'research-reprojection-mean', 0,
    limits.maxCalibrationReprojectionErrorPx,
  )
  const reprojectionP95Px = boundedNumber(
    numericValue(projection.reprojectionP95Px, 'research-reprojection-p95'), 'research-reprojection-p95', reprojectionMeanPx,
    limits.maxCalibrationReprojectionErrorPx,
  )
  return Object.freeze({
    model: 'pinhole', imageWidth, imageHeight, intrinsics, reprojectionMeanPx, reprojectionP95Px,
  })
}

function normalizeClockEvidence(
  value: unknown,
  source: MotionCaptureSourceState,
  measuredAtMs: number,
  limits: MotionCaptureLimits,
): MotionCaptureResearchClockEvidence | null {
  if (source.clockDomain === 'session-monotonic') {
    if (value !== null) throw new Error('motion-capture-research-session-clock-must-be-null')
    return null
  }
  assertStrictRecord(value, CLOCK_KEYS, 'research-clock-alignment')
  const clock = value as Record<string, unknown>
  const clockMeasuredAtMs = boundedNumber(
    numericValue(clock.measuredAtMs, 'research-clock-measured-at'), 'research-clock-measured-at', 0, measuredAtMs,
  )
  return Object.freeze({
    offsetMs: boundedNumber(
      numericValue(clock.offsetMs, 'research-clock-offset'), 'research-clock-offset',
      -MOTION_CAPTURE_MAX_TIME_MS, MOTION_CAPTURE_MAX_TIME_MS,
    ),
    uncertaintyMs: boundedNumber(
      numericValue(clock.uncertaintyMs, 'research-clock-uncertainty'), 'research-clock-uncertainty',
      0, limits.maxClockUncertaintyMs,
    ),
    measuredAtMs: clockMeasuredAtMs,
    sampleCount: integerNumber(
      numericValue(clock.sampleCount, 'research-clock-sample-count'), 'research-clock-sample-count',
      limits.minimumClockAlignmentSamples, Number.MAX_SAFE_INTEGER,
    ),
  })
}

function normalizeSourceEvidence(
  value: unknown,
  sourcesById: ReadonlyMap<string, MotionCaptureSourceState>,
  manifestMeasuredAtMs: number,
  limits: MotionCaptureLimits,
): MotionCaptureResearchSourceEvidence {
  assertStrictRecord(value, SOURCE_KEYS, 'research-source-evidence')
  const input = value as Record<string, unknown>
  if (typeof input.sourceId !== 'string') throw new Error('motion-capture-invalid-research-source-id')
  const sourceId = input.sourceId
  const source = sourcesById.get(sourceId)
  if (!source) throw new Error('motion-capture-research-source-not-found')
  if (source.coordinateSpace !== 'metric-world') throw new Error('motion-capture-research-source-not-metric')
  const measuredAtMs = boundedNumber(
    numericValue(input.measuredAtMs, 'research-source-measured-at'), 'research-source-measured-at', 0, manifestMeasuredAtMs,
  )
  return Object.freeze({
    sourceId,
    measuredAtMs,
    sensorToWorldMatrix: normalizeRigidTransform(input.sensorToWorldMatrix),
    measurementErrorMeters: boundedNumber(
      numericValue(input.measurementErrorMeters, 'research-measurement-error'), 'research-measurement-error',
      0, limits.maxMetricMeasurementErrorMeters,
    ),
    calibrationSampleCount: integerNumber(
      numericValue(input.calibrationSampleCount, 'research-calibration-sample-count'), 'research-calibration-sample-count',
      limits.minimumCalibrationSamples, Number.MAX_SAFE_INTEGER,
    ),
    calibrationPoseCount: integerNumber(
      numericValue(input.calibrationPoseCount, 'research-calibration-pose-count'), 'research-calibration-pose-count',
      limits.minimumCalibrationPoses, Number.MAX_SAFE_INTEGER,
    ),
    projection: normalizeProjection(input.projection, source, limits),
    clockAlignment: normalizeClockEvidence(input.clockAlignment, source, measuredAtMs, limits),
  })
}

async function sha256(value: string): Promise<string> {
  const subtle = globalThis.crypto?.subtle
  if (!subtle) throw new Error('motion-capture-research-manifest-hash-unavailable')
  const digest = await subtle.digest('SHA-256', new TextEncoder().encode(value))
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('')
}

export async function validateMotionCaptureResearchEvidenceManifest(
  value: unknown,
  args: Readonly<{
    sources: readonly MotionCaptureSourceState[]
    limits: MotionCaptureLimits
    nowMs: number
  }>,
): Promise<ValidatedMotionCaptureResearchEvidence> {
  assertStrictRecord(value, MANIFEST_KEYS, 'research-evidence-manifest')
  const input = value as Record<string, unknown>
  if (input.schema !== MOTION_CAPTURE_RESEARCH_EVIDENCE_SCHEMA
    || input.referenceFrame !== MOTION_CAPTURE_RESEARCH_REFERENCE_FRAME
    || !Array.isArray(input.sources)) {
    throw new Error('motion-capture-invalid-research-evidence-manifest')
  }
  const measuredAtMs = boundedNumber(
    numericValue(input.measuredAtMs, 'research-manifest-measured-at'), 'research-manifest-measured-at', 0, args.nowMs,
  )
  if (input.sources.length < 2 || input.sources.length > args.limits.maxSources) {
    throw new Error('motion-capture-invalid-research-source-count')
  }
  const sourcesById = new Map(args.sources.map(source => [source.sourceId, source]))
  const sources = input.sources.map(source => normalizeSourceEvidence(source, sourcesById, measuredAtMs, args.limits))
    .sort((left, right) => left.sourceId.localeCompare(right.sourceId))
  if (new Set(sources.map(source => source.sourceId)).size !== sources.length) {
    throw new Error('motion-capture-duplicate-research-source')
  }
  assertStrictRecord(input.scaleValidation, SCALE_KEYS, 'research-scale-validation')
  const scale = input.scaleValidation as Record<string, unknown>
  if (scale.method !== 'known-distance') throw new Error('motion-capture-invalid-research-scale-method')
  const referenceDistanceMeters = boundedNumber(
    numericValue(scale.referenceDistanceMeters, 'research-reference-distance'), 'research-reference-distance', 0.05, 100,
  )
  const reconstructedDistanceMeters = boundedNumber(
    numericValue(scale.reconstructedDistanceMeters, 'research-reconstructed-distance'),
    'research-reconstructed-distance', 0.001, 100,
  )
  const scaleRelativeError = Math.abs(reconstructedDistanceMeters - referenceDistanceMeters) / referenceDistanceMeters
  if (scaleRelativeError > args.limits.maxScaleRelativeError) throw new Error('motion-capture-research-scale-error-high')
  const scaleValidation = Object.freeze({
    method: 'known-distance' as const,
    referenceDistanceMeters,
    reconstructedDistanceMeters,
    triangulatedSampleCount: integerNumber(
      numericValue(scale.triangulatedSampleCount, 'research-triangulated-sample-count'), 'research-triangulated-sample-count',
      args.limits.minimumTriangulatedSamples, Number.MAX_SAFE_INTEGER,
    ),
  })
  const manifest: MotionCaptureResearchEvidenceManifest = Object.freeze({
    schema: MOTION_CAPTURE_RESEARCH_EVIDENCE_SCHEMA,
    referenceFrame: MOTION_CAPTURE_RESEARCH_REFERENCE_FRAME,
    measuredAtMs,
    sources: Object.freeze(sources),
    scaleValidation,
  })
  const manifestDigestSha256 = await sha256(JSON.stringify(manifest))
  const sourceDigests = await Promise.all(sources.map(async source => Object.freeze({
    sourceId: source.sourceId,
    calibrationDigestSha256: await sha256(JSON.stringify({ manifestDigestSha256, calibration: source })),
    clockDigestSha256: await sha256(JSON.stringify({ manifestDigestSha256, clockAlignment: source.clockAlignment })),
  })))
  return Object.freeze({
    manifest,
    manifestDigestSha256,
    scaleRelativeError,
    sourceDigests: Object.freeze(sourceDigests),
  })
}

export function buildMotionCaptureResearchEvidenceBinding(
  validated: ValidatedMotionCaptureResearchEvidence,
  reconstructionId: string,
): MotionCaptureResearchEvidenceBinding {
  const digestsBySourceId = new Map(validated.sourceDigests.map(digest => [digest.sourceId, digest]))
  const sourcePatches = validated.manifest.sources.map((sourceEvidence) => {
    const digests = digestsBySourceId.get(sourceEvidence.sourceId)!
    const clockEvidence = sourceEvidence.clockAlignment
    return Object.freeze({
      sourceId: sourceEvidence.sourceId,
      clockAlignment: Object.freeze({
        status: 'aligned' as const,
        offsetMs: clockEvidence?.offsetMs ?? 0,
        uncertaintyMs: clockEvidence?.uncertaintyMs ?? 0,
        measuredAtMs: clockEvidence?.measuredAtMs ?? sourceEvidence.measuredAtMs,
        evidenceDigestSha256: digests.clockDigestSha256,
        provenance: clockEvidence ? 'measured-alignment' as const : 'session-clock' as const,
        researchManifestDigestSha256: validated.manifestDigestSha256,
      }),
      calibration: Object.freeze({
        status: 'calibrated' as const,
        coordinateSpace: 'metric-world' as const,
        provenance: Object.freeze({
          kind: 'measured' as const,
          measuredAtMs: sourceEvidence.measuredAtMs,
          evidenceDigestSha256: digests.calibrationDigestSha256,
        }),
        reprojectionErrorPx: sourceEvidence.projection?.reprojectionMeanPx ?? null,
        researchValidation: Object.freeze({
          schema: 'agentic-graph.motion-capture-calibration-validation/v1' as const,
          researchManifestDigestSha256: validated.manifestDigestSha256,
          referenceFrame: validated.manifest.referenceFrame,
          measurementErrorMeters: sourceEvidence.measurementErrorMeters,
          reprojectionP95Px: sourceEvidence.projection?.reprojectionP95Px ?? null,
          calibrationSampleCount: sourceEvidence.calibrationSampleCount,
          calibrationPoseCount: sourceEvidence.calibrationPoseCount,
        }),
      }),
    })
  })
  return Object.freeze({
    sourcePatches: Object.freeze(sourcePatches),
    sharedReconstruction: Object.freeze({
      reconstructionId,
      referenceFrame: 'shared-metric-session' as const,
      coordinateSpace: 'metric-world' as const,
      method: 'measured' as const,
      measuredAtMs: validated.manifest.measuredAtMs,
      evidenceDigestSha256: validated.manifestDigestSha256,
      researchValidation: Object.freeze({
        schema: 'agentic-graph.motion-capture-reconstruction-validation/v1' as const,
        researchManifestDigestSha256: validated.manifestDigestSha256,
        referenceFrame: validated.manifest.referenceFrame,
        scaleRelativeError: validated.scaleRelativeError,
        triangulatedSampleCount: validated.manifest.scaleValidation.triangulatedSampleCount,
      }),
      sourceBindings: Object.freeze(sourcePatches.map(patch => Object.freeze({
        sourceId: patch.sourceId,
        calibrationEvidenceDigestSha256: patch.calibration.provenance!.evidenceDigestSha256,
      }))),
    }),
  })
}
