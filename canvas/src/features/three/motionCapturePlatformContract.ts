import type { MotionCaptureResearchEvidenceManifest } from './motionCaptureResearchEvidence'

export const MOTION_CAPTURE_PLATFORM_SCHEMA = 'agenticgraph.motion-capture-platform/v1' as const
export const MOTION_CAPTURE_RECORDING_SCHEMA = 'agenticgraph.motion-capture-recording/v1' as const
export const MOTION_CAPTURE_MAX_TIME_MS = 2 ** 43

export type MotionCaptureLimits = Readonly<{
  maxSources: number
  maxLandmarksPerObservation: number
  maxRecordingSamples: number
  maxSampleStalenessMs: number
  maxSynchronizationSkewMs: number
  maxClockUncertaintyMs: number
  maxJitterMs: number
  maxDropRate: number
  maxCalibrationReprojectionErrorPx: number
  maxMetricMeasurementErrorMeters: number
  maxScaleRelativeError: number
  minimumCalibrationSamples: number
  minimumCalibrationPoses: number
  minimumClockAlignmentSamples: number
  minimumTriangulatedSamples: number
  minimumResearchSamplesPerSource: number
  minimumResearchDurationMs: number
  minimumObservationConfidence: number
  minimumLandmarkVisibility: number
  minimumLandmarkPresence: number
  minimumLandmarkEvidenceRatio: number
}>

export const MOTION_CAPTURE_DEFAULT_LIMITS: MotionCaptureLimits = Object.freeze({
  maxSources: 8,
  maxLandmarksPerObservation: 256,
  maxRecordingSamples: 3_600,
  maxSampleStalenessMs: 1_000,
  maxSynchronizationSkewMs: 20,
  maxClockUncertaintyMs: 5,
  maxJitterMs: 10,
  maxDropRate: 0.02,
  maxCalibrationReprojectionErrorPx: 5,
  maxMetricMeasurementErrorMeters: 0.02,
  maxScaleRelativeError: 0.02,
  minimumCalibrationSamples: 30,
  minimumCalibrationPoses: 5,
  minimumClockAlignmentSamples: 30,
  minimumTriangulatedSamples: 30,
  minimumResearchSamplesPerSource: 30,
  minimumResearchDurationMs: 1_000,
  minimumObservationConfidence: 0.5,
  minimumLandmarkVisibility: 0.5,
  minimumLandmarkPresence: 0.5,
  minimumLandmarkEvidenceRatio: 0.5,
})
export type MotionCaptureCaptureKind = 'video' | 'depth' | 'landmark-stream' | 'peer-derived'
export type MotionCaptureCoordinateSpace = 'normalized-image' | 'model-relative' | 'metric-world'
export type MotionCaptureClockDomain = 'session-monotonic' | 'source-local'
export type MotionCaptureCapabilityTier =
  | 'single-view-control'
  | 'time-aligned-multi-source'
  | 'calibrated-metric-reconstruction'
export type MotionCaptureRecordingStatus = 'idle' | 'recording' | 'stopped'
export type MotionCaptureExportFormat = 'json' | 'csv'

export type MotionCaptureDimensions = Readonly<{
  width: number
  height: number
}>

export type MotionCaptureDerivedLandmark = Readonly<{
  x: number
  y: number
  z: number
  visibility: number
  presence: number
}>

export type MotionCaptureSourceRegistration = Readonly<{
  captureKind: MotionCaptureCaptureKind
  coordinateSpace: MotionCaptureCoordinateSpace
  clockDomain: MotionCaptureClockDomain
  dimensions?: MotionCaptureDimensions
  nominalFps?: number
}>

export type MotionCaptureClockAlignmentInput = Readonly<{
  offsetMs: number
  uncertaintyMs: number
  measuredAtMs: number
  evidenceDigestSha256: string
}>

export type MotionCaptureClockAlignment = Readonly<{
  status: 'aligned' | 'unaligned'
  offsetMs: number | null
  uncertaintyMs: number | null
  measuredAtMs: number | null
  evidenceDigestSha256: string | null
  provenance: 'session-clock' | 'measured-alignment' | null
  researchManifestDigestSha256: string | null
}>

export type MotionCaptureCalibrationProvenance = Readonly<{
  kind: 'operator-verified' | 'measured' | 'imported'
  measuredAtMs: number
  evidenceDigestSha256: string
}>

export type MotionCaptureCalibrationInput = Readonly<{
  status: 'uncalibrated' | 'calibrating' | 'calibrated' | 'invalid'
  coordinateSpace: MotionCaptureCoordinateSpace
  provenance?: MotionCaptureCalibrationProvenance
  reprojectionErrorPx?: number | null
}>

export type MotionCaptureCalibration = Readonly<{
  status: MotionCaptureCalibrationInput['status']
  coordinateSpace: MotionCaptureCoordinateSpace
  provenance: MotionCaptureCalibrationProvenance | null
  reprojectionErrorPx: number | null
  researchValidation: MotionCaptureCalibrationResearchValidation | null
}>

export type MotionCaptureCalibrationResearchValidation = Readonly<{
  schema: 'agenticgraph.motion-capture-calibration-validation/v1'
  researchManifestDigestSha256: string
  referenceFrame: 'metric-si-right-up-forward'
  measurementErrorMeters: number
  reprojectionP95Px: number | null
  calibrationSampleCount: number
  calibrationPoseCount: number
}>

export type MotionCaptureSharedReconstructionInput = Readonly<{
  sourceIds: readonly string[]
  method: 'measured'
  measuredAtMs: number
  evidenceDigestSha256: string
}>

export type MotionCaptureSharedReconstructionEvidence = Readonly<{
  reconstructionId: string
  referenceFrame: 'shared-metric-session'
  coordinateSpace: 'metric-world'
  method: 'measured'
  measuredAtMs: number
  evidenceDigestSha256: string
  researchValidation: MotionCaptureReconstructionResearchValidation | null
  sourceBindings: readonly Readonly<{
    sourceId: string
    calibrationEvidenceDigestSha256: string
  }>[]
}>

export type MotionCaptureReconstructionResearchValidation = Readonly<{
  schema: 'agenticgraph.motion-capture-reconstruction-validation/v1'
  researchManifestDigestSha256: string
  referenceFrame: 'metric-si-right-up-forward'
  scaleRelativeError: number
  triangulatedSampleCount: number
}>

export type MotionCaptureObservationInput = Readonly<{
  captureTimestampMs: number
  sequence?: number
  coordinateSpace: MotionCaptureCoordinateSpace
  confidence: number
  landmarks: readonly MotionCaptureDerivedLandmark[]
  missing?: boolean
}>

export type MotionCaptureObservationSummary = Readonly<{
  captureTimestampMs: number
  alignedTimestampMs: number | null
  receivedAtMs: number
  sequence: number | null
  coordinateSpace: MotionCaptureCoordinateSpace
  confidence: number
  landmarkCount: number
  missing: boolean
}>

export type MotionCaptureSourceQuality = Readonly<{
  receivedSamples: number
  usableSamples: number
  researchUsableSamples: number
  lowEvidenceSamples: number
  missingSamples: number
  droppedSequenceSamples: number
  unsequencedSamples: number
  outOfOrderSamples: number
  researchDurationMs: number
  jitterMs: number
  dropRate: number
}>

export type MotionCaptureSourceState = Readonly<{
  sourceId: string
  captureKind: MotionCaptureCaptureKind
  coordinateSpace: MotionCaptureCoordinateSpace
  clockDomain: MotionCaptureClockDomain
  dimensions: MotionCaptureDimensions | null
  nominalFps: number | null
  clockAlignment: MotionCaptureClockAlignment
  calibration: MotionCaptureCalibration
  quality: MotionCaptureSourceQuality
  latestObservation: MotionCaptureObservationSummary | null
}>

export type MotionCaptureSessionEvidence = Readonly<{
  tier: MotionCaptureCapabilityTier | null
  researchReady: boolean
  activeSourceCount: number
  alignedSourceCount: number
  synchronizedSourceCount: number
  maxSkewMs: number | null
  maxClockUncertaintyMs: number | null
  maxJitterMs: number
  dropRate: number
  missingSamples: number
  warnings: readonly string[]
}>

export type MotionCaptureSessionEvaluation = Readonly<{
  evidence: MotionCaptureSessionEvidence
  sharedReconstructionId: string | null
  researchSourceIds: readonly string[]
}>

export type MotionCaptureRecordingSummary = Readonly<{
  status: MotionCaptureRecordingStatus
  recordingId: string | null
  startedAtMs: number | null
  finishedAtMs: number | null
  sampleCount: number
  landmarkCount: number
  droppedByBudget: number
  maxSamples: number
}>

export type MotionCaptureSessionSnapshot = Readonly<{
  schema: typeof MOTION_CAPTURE_PLATFORM_SCHEMA
  sessionId: string
  revision: number
  sources: readonly MotionCaptureSourceState[]
  evidence: MotionCaptureSessionEvidence
  recording: MotionCaptureRecordingSummary
}>

export type MotionCaptureRecordedSample = Readonly<{
  ordinal: number
  sourceId: string
  captureTimestampMs: number
  alignedTimestampMs: number | null
  receivedAtMs: number
  sequence: number | null
  coordinateSpace: MotionCaptureCoordinateSpace
  confidence: number
  missing: boolean
  landmarks: readonly MotionCaptureDerivedLandmark[]
  sourceQuality: MotionCaptureSourceQuality
  sessionEvidence: MotionCaptureSessionEvidence
  sharedReconstructionId: string | null
  researchSourceIds: readonly string[]
  researchEvidenceEpoch: string | null
  researchManifestDigestSha256: string | null
}>

export type MotionCaptureRecordingSourceRejection = Readonly<{
  sourceId: string
  researchEvidenceEpoch: string | null
  outOfOrderSamples: number
}>

export type MotionCaptureRecording = Readonly<{
  schema: typeof MOTION_CAPTURE_RECORDING_SCHEMA
  recordingId: string
  sessionId: string
  status: Exclude<MotionCaptureRecordingStatus, 'idle'>
  startedAtMs: number
  finishedAtMs: number | null
  droppedByBudget: number
  researchLimits: MotionCaptureLimits
  sourceRejections: readonly MotionCaptureRecordingSourceRejection[]
  researchEvidenceManifests: readonly MotionCaptureResearchEvidenceManifest[]
  samples: readonly MotionCaptureRecordedSample[]
}>

export type MotionCaptureExportArtifact = Readonly<{
  schema: 'agenticgraph.motion-capture-export/v1'
  format: MotionCaptureExportFormat
  mimeType: 'application/json' | 'text/csv'
  fileName: string
  content: string
  sha256: string
  byteLength: number
  recordingId: string
  sourceCount: number
  sampleCount: number
  landmarkCount: number
  researchReady: boolean
  researchReadyGroupCount: number
  researchEvidenceManifestCount: number
}>

export const isMotionCaptureSha256 = (value: string): boolean => /^[a-f0-9]{64}$/u.test(value)

const EMPTY_MOTION_CAPTURE_EVIDENCE: MotionCaptureSessionEvidence = Object.freeze({
  tier: null,
  researchReady: false,
  activeSourceCount: 0,
  alignedSourceCount: 0,
  synchronizedSourceCount: 0,
  maxSkewMs: null,
  maxClockUncertaintyMs: null,
  maxJitterMs: 0,
  dropRate: 0,
  missingSamples: 0,
  warnings: Object.freeze(['capture-no-active-sources']),
})

function synchronizedMotionCaptureCluster(
  sources: readonly MotionCaptureSourceState[],
  limits: MotionCaptureLimits,
): readonly MotionCaptureSourceState[] {
  const candidates = sources
    .filter(source => typeof source.latestObservation?.alignedTimestampMs === 'number'
      && source.clockAlignment.uncertaintyMs !== null
      && source.clockAlignment.uncertaintyMs <= limits.maxClockUncertaintyMs)
    .sort((left, right) => (
      left.latestObservation!.alignedTimestampMs! - right.latestObservation!.alignedTimestampMs!
      || left.sourceId.localeCompare(right.sourceId)
    ))
  let best: readonly MotionCaptureSourceState[] = Object.freeze([])
  let start = 0
  for (let end = 0; end < candidates.length; end += 1) {
    while (candidates[end]!.latestObservation!.alignedTimestampMs!
      - candidates[start]!.latestObservation!.alignedTimestampMs! > limits.maxSynchronizationSkewMs) start += 1
    const candidate = candidates.slice(start, end + 1)
    if (candidate.length > best.length) best = candidate
  }
  return Object.freeze([...best])
}

function motionCaptureCalibrationEvidenceSupportsResearch(
  source: MotionCaptureSourceState,
  limits: MotionCaptureLimits,
): boolean {
  const calibration = source.calibration
  if (calibration.status !== 'calibrated'
    || calibration.coordinateSpace !== 'metric-world'
    || !calibration.provenance
    || calibration.provenance.kind !== 'measured'
    || !isMotionCaptureSha256(calibration.provenance.evidenceDigestSha256)
    || !calibration.researchValidation
    || !isMotionCaptureSha256(calibration.researchValidation.researchManifestDigestSha256)
    || calibration.researchValidation.referenceFrame !== 'metric-si-right-up-forward'
    || calibration.researchValidation.measurementErrorMeters > limits.maxMetricMeasurementErrorMeters
    || calibration.researchValidation.calibrationSampleCount < limits.minimumCalibrationSamples
    || calibration.researchValidation.calibrationPoseCount < limits.minimumCalibrationPoses) return false
  if (source.captureKind === 'video' && calibration.reprojectionErrorPx === null) return false
  return (calibration.reprojectionErrorPx === null
      || calibration.reprojectionErrorPx <= limits.maxCalibrationReprojectionErrorPx)
    && (calibration.researchValidation.reprojectionP95Px === null
      || calibration.researchValidation.reprojectionP95Px <= limits.maxCalibrationReprojectionErrorPx)
}

function motionCaptureCalibrationSupportsResearch(
  source: MotionCaptureSourceState,
  limits: MotionCaptureLimits,
): boolean {
  return source.latestObservation?.coordinateSpace === 'metric-world'
    && motionCaptureCalibrationEvidenceSupportsResearch(source, limits)
}

function validSharedReconstructionEvidence(
  evidence: MotionCaptureSharedReconstructionEvidence | null,
  sources: readonly MotionCaptureSourceState[],
  nowMs: number,
  limits: MotionCaptureLimits,
): evidence is MotionCaptureSharedReconstructionEvidence {
  if (!evidence
    || evidence.referenceFrame !== 'shared-metric-session'
    || evidence.coordinateSpace !== 'metric-world'
    || evidence.method !== 'measured'
    || evidence.measuredAtMs < 0
    || evidence.measuredAtMs > nowMs
    || !isMotionCaptureSha256(evidence.evidenceDigestSha256)
    || evidence.sourceBindings.length < 2
    || !evidence.researchValidation
    || evidence.researchValidation.referenceFrame !== 'metric-si-right-up-forward'
    || evidence.researchValidation.scaleRelativeError > limits.maxScaleRelativeError
    || evidence.researchValidation.triangulatedSampleCount < limits.minimumTriangulatedSamples
    || evidence.researchValidation.researchManifestDigestSha256 !== evidence.evidenceDigestSha256) return false
  const sourceById = new Map(sources.map(source => [source.sourceId, source]))
  const uniqueIds = new Set(evidence.sourceBindings.map(binding => binding.sourceId))
  if (uniqueIds.size !== evidence.sourceBindings.length) return false
  return evidence.sourceBindings.every((binding) => {
    const calibrationDigest = sourceById.get(binding.sourceId)?.calibration.provenance?.evidenceDigestSha256
    const source = sourceById.get(binding.sourceId)
    return isMotionCaptureSha256(binding.calibrationEvidenceDigestSha256)
      && binding.calibrationEvidenceDigestSha256 === calibrationDigest
      && binding.calibrationEvidenceDigestSha256 !== evidence.evidenceDigestSha256
      && source?.calibration.researchValidation?.researchManifestDigestSha256 === evidence.evidenceDigestSha256
      && source?.clockAlignment.researchManifestDigestSha256 === evidence.evidenceDigestSha256
  })
}

export function evaluateMotionCaptureSessionEvidence(
  sources: readonly MotionCaptureSourceState[],
  sharedReconstruction: MotionCaptureSharedReconstructionEvidence | null,
  nowMs: number,
  limits: MotionCaptureLimits,
): MotionCaptureSessionEvaluation {
  const recent = sources.filter((source) => {
    const latest = source.latestObservation
    return Boolean(latest && nowMs >= latest.receivedAtMs && nowMs - latest.receivedAtMs <= limits.maxSampleStalenessMs)
  })
  if (recent.length === 0) return Object.freeze({
    evidence: EMPTY_MOTION_CAPTURE_EVIDENCE,
    sharedReconstructionId: sharedReconstruction?.reconstructionId || null,
    researchSourceIds: Object.freeze([]),
  })
  const active = recent.filter(source => source.latestObservation?.missing === false)
  const aligned = active.filter(source => typeof source.latestObservation?.alignedTimestampMs === 'number')
  const cluster = synchronizedMotionCaptureCluster(aligned, limits)
  const synchronized = cluster.length >= 2 ? cluster : Object.freeze([])
  const clusterTimestamps = synchronized.map(source => source.latestObservation!.alignedTimestampMs!)
  const alignedTimestamps = aligned.map(source => source.latestObservation!.alignedTimestampMs!)
  const reportedTimestamps = clusterTimestamps.length >= 2 ? clusterTimestamps : alignedTimestamps
  const maxSkewMs = reportedTimestamps.length >= 2
    ? Math.max(...reportedTimestamps) - Math.min(...reportedTimestamps)
    : null
  const maxClockUncertaintyMs = aligned.length > 0
    ? Math.max(...aligned.map(source => source.clockAlignment.uncertaintyMs || 0))
    : null
  const maxJitterMs = Math.max(0, ...recent.map(source => source.quality.jitterMs))
  const missingSamples = recent.reduce((total, source) => total + source.quality.missingSamples, 0)
  const receivedSamples = recent.reduce((total, source) => total + source.quality.receivedSamples, 0)
  const droppedSamples = recent.reduce((total, source) => total + source.quality.droppedSequenceSamples, 0)
  const dropRate = receivedSamples + droppedSamples > 0
    ? (missingSamples + droppedSamples) / (receivedSamples + droppedSamples)
    : 0
  const reconstructionValid = validSharedReconstructionEvidence(sharedReconstruction, sources, nowMs, limits)
  const boundSourceIds = new Set(sharedReconstruction?.sourceBindings.map(binding => binding.sourceId) || [])
  const configuredReconstructionSources = reconstructionValid ? sources.filter(source => (
    boundSourceIds.has(source.sourceId)
    && motionCaptureCalibrationEvidenceSupportsResearch(source, limits)
    && source.clockAlignment.status === 'aligned'
    && source.clockAlignment.uncertaintyMs !== null
    && source.clockAlignment.uncertaintyMs <= limits.maxClockUncertaintyMs
  )) : []
  const configuredReconstructionSourceIds = new Set(configuredReconstructionSources.map(source => source.sourceId))
  const reconstructionSources = aligned.filter(source => configuredReconstructionSourceIds.has(source.sourceId))
  const researchEvidenceFailureRate = (source: MotionCaptureSourceState): number => {
    const expectedSamples = source.quality.receivedSamples + source.quality.droppedSequenceSamples
    return expectedSamples > 0
      ? (source.quality.missingSamples + source.quality.lowEvidenceSamples + source.quality.droppedSequenceSamples) / expectedSamples
      : 0
  }
  const researchSources = synchronizedMotionCaptureCluster(reconstructionSources.filter(source => (
    source.quality.researchUsableSamples >= limits.minimumResearchSamplesPerSource
    && source.quality.researchDurationMs >= limits.minimumResearchDurationMs
    && source.quality.jitterMs <= limits.maxJitterMs
    && researchEvidenceFailureRate(source) <= limits.maxDropRate
    && source.quality.unsequencedSamples === 0
    && source.quality.outOfOrderSamples === 0
  )), limits)
  const researchReady = researchSources.length >= 2
  const tier = active.length === 0
    ? null
    : researchReady
      ? 'calibrated-metric-reconstruction' as const
      : synchronized.length >= 2
        ? 'time-aligned-multi-source' as const
        : 'single-view-control' as const
  const warnings: string[] = []
  if (active.length === 0) warnings.push('capture-no-active-sources')
  else if (active.length < 2) warnings.push('capture-single-source-only')
  if (aligned.length < active.length) warnings.push('capture-clock-alignment-incomplete')
  if (maxClockUncertaintyMs !== null && maxClockUncertaintyMs > limits.maxClockUncertaintyMs) {
    warnings.push('capture-clock-uncertainty-high')
  }
  const lowUncertaintyAlignedCount = aligned.filter(
    source => (source.clockAlignment.uncertaintyMs || 0) <= limits.maxClockUncertaintyMs,
  ).length
  if (lowUncertaintyAlignedCount >= 2 && synchronized.length < 2) warnings.push('capture-synchronization-skew-high')
  if (maxJitterMs > limits.maxJitterMs) warnings.push('capture-sample-jitter-high')
  if (dropRate > limits.maxDropRate) warnings.push('capture-sample-loss-high')
  if (recent.some(source => source.quality.outOfOrderSamples > 0)) warnings.push('capture-sample-order-invalid')
  if (recent.some(source => source.quality.unsequencedSamples > 0)) warnings.push('capture-sequence-evidence-incomplete')
  if (recent.some(source => source.quality.lowEvidenceSamples > 0)) warnings.push('capture-observation-evidence-low')
  if (recent.some(source => researchEvidenceFailureRate(source) > limits.maxDropRate)) {
    warnings.push('capture-observation-evidence-failure-rate-high')
  }
  if (synchronized.length >= 2 && synchronized.some(source => !motionCaptureCalibrationSupportsResearch(source, limits))) {
    warnings.push('capture-metric-calibration-incomplete')
  }
  if (synchronized.length >= 2
    && synchronized.some(source => source.quality.researchUsableSamples < limits.minimumResearchSamplesPerSource)) {
    warnings.push('capture-research-sample-window-insufficient')
  }
  if (synchronized.length >= 2
    && synchronized.some(source => source.quality.researchDurationMs < limits.minimumResearchDurationMs)) {
    warnings.push('capture-research-duration-insufficient')
  }
  if (synchronized.length >= 2 && !sharedReconstruction) warnings.push('capture-shared-reconstruction-evidence-required')
  else if (sharedReconstruction && !reconstructionValid) warnings.push('capture-shared-reconstruction-evidence-invalid')
  else if (reconstructionValid && synchronized.length >= 2 && researchSources.length < 2) {
    warnings.push('capture-shared-reconstruction-sources-unqualified')
  }
  const evidence: MotionCaptureSessionEvidence = Object.freeze({
    tier,
    researchReady,
    activeSourceCount: active.length,
    alignedSourceCount: aligned.length,
    synchronizedSourceCount: synchronized.length,
    maxSkewMs,
    maxClockUncertaintyMs,
    maxJitterMs,
    dropRate,
    missingSamples,
    warnings: Object.freeze(warnings),
  })
  return Object.freeze({
    evidence,
    sharedReconstructionId: sharedReconstruction?.reconstructionId || null,
    researchSourceIds: Object.freeze(configuredReconstructionSources.map(source => source.sourceId).sort()),
  })
}

export function createMotionCaptureClockAlignment(clockDomain: MotionCaptureClockDomain): MotionCaptureClockAlignment {
  return clockDomain === 'session-monotonic'
    ? Object.freeze({
      status: 'aligned' as const,
      offsetMs: 0,
      uncertaintyMs: 0,
      measuredAtMs: null,
      evidenceDigestSha256: null,
      provenance: 'session-clock' as const,
      researchManifestDigestSha256: null,
    })
    : Object.freeze({
      status: 'unaligned' as const,
      offsetMs: null,
      uncertaintyMs: null,
      measuredAtMs: null,
      evidenceDigestSha256: null,
      provenance: null,
      researchManifestDigestSha256: null,
    })
}

export function createMotionCaptureCalibration(coordinateSpace: MotionCaptureCoordinateSpace): MotionCaptureCalibration {
  return Object.freeze({
    status: 'uncalibrated' as const,
    coordinateSpace,
    provenance: null,
    reprojectionErrorPx: null,
    researchValidation: null,
  })
}
