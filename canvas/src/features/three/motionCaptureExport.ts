import {
  type MotionCaptureExportArtifact,
  type MotionCaptureExportFormat,
  type MotionCaptureLimits,
  type MotionCaptureRecordedSample,
  type MotionCaptureRecording,
} from './motionCapturePlatformContract'
import { mergeMotionCaptureLimits } from './motionCaptureRuntimeConfiguration'

const EXPORT_SCHEMA = 'knowgrph.motion-capture-export/v1' as const
type RecordingLocalSourceQuality = Readonly<{
  sourceId: string
  usableSamples: number
  researchUsableSamples: number
  lowEvidenceSamples: number
  researchEvidenceFailureRate: number
  researchDurationMs: number
  missingSamples: number
  droppedSequenceSamples: number
  unsequencedSamples: number
  outOfOrderSamples: number
  jitterMs: number
  dropRate: number
  researchReady: boolean
}>

function sampleSupportsResearch(
  sample: MotionCaptureRecordedSample,
  limits: MotionCaptureLimits,
): boolean {
  if (sample.missing || sample.confidence < limits.minimumObservationConfidence || sample.landmarks.length === 0) return false
  const qualifiedLandmarkCount = sample.landmarks.filter(landmark => (
    landmark.visibility >= limits.minimumLandmarkVisibility
    && landmark.presence >= limits.minimumLandmarkPresence
  )).length
  return qualifiedLandmarkCount / sample.landmarks.length >= limits.minimumLandmarkEvidenceRatio
}
type RecordingResearchGrade = Readonly<{
  researchReady: boolean
  researchReadyGroupCount: number
  sourceQuality: readonly RecordingLocalSourceQuality[]
}>

function sortedSamples(recording: MotionCaptureRecording): readonly MotionCaptureRecordedSample[] {
  return Object.freeze([...recording.samples].sort((left, right) => (
    (left.alignedTimestampMs ?? left.captureTimestampMs) - (right.alignedTimestampMs ?? right.captureTimestampMs)
    || left.sourceId.localeCompare(right.sourceId)
    || left.ordinal - right.ordinal
  )))
}

function gradeSourceSamples(
  sourceId: string,
  sourceSamples: readonly MotionCaptureRecordedSample[],
  rejectedOutOfOrderSamples: number,
  limits: MotionCaptureLimits,
): RecordingLocalSourceQuality {
  const samples = [...sourceSamples].sort((left, right) => left.ordinal - right.ordinal)
  const intervals: number[] = []
  let droppedSequenceSamples = 0
  let outOfOrderSamples = rejectedOutOfOrderSamples
  for (let index = 1; index < samples.length; index += 1) {
    const previous = samples[index - 1]!
    const sample = samples[index]!
    const interval = sample.captureTimestampMs - previous.captureTimestampMs
    if (interval <= 0) outOfOrderSamples += 1
    else intervals.push(interval)
    if (sample.sequence !== null && previous.sequence !== null) {
      if (sample.sequence <= previous.sequence) outOfOrderSamples += 1
      else droppedSequenceSamples += Math.max(0, sample.sequence - previous.sequence - 1)
    }
  }
  const intervalMeanMs = intervals.length > 0
    ? intervals.reduce((total, interval) => total + interval, 0) / intervals.length
    : 0
  const jitterMs = intervals.length > 1
    ? Math.sqrt(intervals.reduce((total, interval) => total + (interval - intervalMeanMs) ** 2, 0) / (intervals.length - 1))
    : 0
  const missingSamples = samples.filter(sample => sample.missing).length
  const unsequencedSamples = samples.filter(sample => sample.sequence === null).length
  const usableSamples = samples.length - missingSamples
  const researchUsableSamples = samples.filter(sample => sampleSupportsResearch(sample, limits)).length
  const researchTimestamps = samples.filter(sample => sampleSupportsResearch(sample, limits))
    .map(sample => sample.alignedTimestampMs ?? sample.captureTimestampMs)
  const researchDurationMs = researchTimestamps.length < 2
    ? 0
    : Math.max(...researchTimestamps) - Math.min(...researchTimestamps)
  const lowEvidenceSamples = usableSamples - researchUsableSamples
  const expectedSamples = samples.length + droppedSequenceSamples
  const dropRate = expectedSamples > 0 ? (missingSamples + droppedSequenceSamples) / expectedSamples : 0
  const researchEvidenceFailureRate = expectedSamples > 0
    ? (missingSamples + lowEvidenceSamples + droppedSequenceSamples) / expectedSamples
    : 0
  return Object.freeze({
    sourceId, usableSamples, researchUsableSamples, lowEvidenceSamples, researchEvidenceFailureRate, researchDurationMs,
    missingSamples, droppedSequenceSamples, unsequencedSamples, outOfOrderSamples, jitterMs, dropRate,
    researchReady: researchUsableSamples >= limits.minimumResearchSamplesPerSource
      && researchDurationMs >= limits.minimumResearchDurationMs
      && jitterMs <= limits.maxJitterMs
      && researchEvidenceFailureRate <= limits.maxDropRate
      && unsequencedSamples === 0
      && outOfOrderSamples === 0,
  })
}

function gradeRecordingLocalSourceQuality(
  recording: MotionCaptureRecording,
  limits: MotionCaptureLimits,
): readonly RecordingLocalSourceQuality[] {
  const sourceIds = new Set(recording.samples.map(sample => sample.sourceId))
  recording.sourceRejections.forEach(rejection => sourceIds.add(rejection.sourceId))
  return Object.freeze([...sourceIds].sort().map(sourceId => gradeSourceSamples(
    sourceId,
    recording.samples.filter(sample => sample.sourceId === sourceId),
    recording.sourceRejections
      .filter(rejection => rejection.sourceId === sourceId)
      .reduce((total, rejection) => total + rejection.outOfOrderSamples, 0),
    limits,
  )))
}

function gradeRecordingResearchEvidence(
  recording: MotionCaptureRecording,
  manifestDigests: ReadonlySet<string>,
): RecordingResearchGrade {
  const limits = mergeMotionCaptureLimits(recording.researchLimits)
  const sourceQuality = gradeRecordingLocalSourceQuality(recording, limits)
  const allSamples = sortedSamples(recording)
  const cohorts = new Map<string, {
    sourceIds: readonly string[]
    researchEvidenceEpoch: string
    samples: MotionCaptureRecordedSample[]
  }>()
  for (const sample of allSamples) {
    const sourceIds = Object.freeze([...sample.researchSourceIds].sort())
    if (sourceIds.length < 2
      || sample.sharedReconstructionId === null
      || sample.researchEvidenceEpoch === null
      || sample.researchManifestDigestSha256 === null
      || !manifestDigests.has(sample.researchManifestDigestSha256)) continue
    const cohortKey = JSON.stringify([
      sample.sharedReconstructionId, sourceIds, sample.researchEvidenceEpoch, sample.researchManifestDigestSha256,
    ])
    const cohort = cohorts.get(cohortKey)
    if (cohort) cohort.samples.push(sample)
    else cohorts.set(cohortKey, {
      sourceIds,
      researchEvidenceEpoch: sample.researchEvidenceEpoch,
      samples: [sample],
    })
  }
  let researchReadyGroupCount = 0
  for (const cohort of cohorts.values()) {
    const qualifiedSourceIds = cohort.sourceIds.filter((sourceId) => {
      const rejected = recording.sourceRejections
        .filter(rejection => rejection.sourceId === sourceId
          && rejection.researchEvidenceEpoch === cohort.researchEvidenceEpoch)
        .reduce((total, rejection) => total + rejection.outOfOrderSamples, 0)
      return gradeSourceSamples(
        sourceId,
        cohort.samples.filter(sample => sample.sourceId === sourceId),
        rejected,
        limits,
      ).researchReady
    })
    for (let leftIndex = 0; leftIndex < qualifiedSourceIds.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < qualifiedSourceIds.length; rightIndex += 1) {
        const samplesByTime = (sourceId: string) => cohort.samples
          .filter(sample => sample.sourceId === sourceId
            && sampleSupportsResearch(sample, limits)
            && sample.coordinateSpace === 'metric-world'
            && sample.alignedTimestampMs !== null)
          .sort((left, right) => left.alignedTimestampMs! - right.alignedTimestampMs! || left.ordinal - right.ordinal)
        const leftSamples = samplesByTime(qualifiedSourceIds[leftIndex]!)
        const rightSamples = samplesByTime(qualifiedSourceIds[rightIndex]!)
        let leftSampleIndex = 0
        let rightSampleIndex = 0
        let pairGroupCount = 0
        while (leftSampleIndex < leftSamples.length && rightSampleIndex < rightSamples.length) {
          const leftTimestamp = leftSamples[leftSampleIndex]!.alignedTimestampMs!
          const rightTimestamp = rightSamples[rightSampleIndex]!.alignedTimestampMs!
          const difference = leftTimestamp - rightTimestamp
          if (Math.abs(difference) <= limits.maxSynchronizationSkewMs) {
            pairGroupCount += 1
            leftSampleIndex += 1
            rightSampleIndex += 1
          } else if (difference < 0) leftSampleIndex += 1
          else rightSampleIndex += 1
        }
        researchReadyGroupCount = Math.max(researchReadyGroupCount, pairGroupCount)
      }
    }
  }
  return Object.freeze({
    researchReady: recording.droppedByBudget === 0
      && manifestDigests.size > 0
      && researchReadyGroupCount >= limits.minimumResearchSamplesPerSource,
    researchReadyGroupCount,
    sourceQuality,
  })
}

function buildJsonContent(recording: MotionCaptureRecording, grade: RecordingResearchGrade): string {
  const samples = sortedSamples(recording).map(sample => ({
    ordinal: sample.ordinal,
    sourceId: sample.sourceId,
    captureTimestampMs: sample.captureTimestampMs,
    alignedTimestampMs: sample.alignedTimestampMs,
    receivedAtMs: sample.receivedAtMs,
    sequence: sample.sequence,
    coordinateSpace: sample.coordinateSpace,
    confidence: sample.confidence,
    missing: sample.missing,
    landmarks: sample.landmarks.map((landmark, landmarkIndex) => ({
      landmarkIndex,
      x: landmark.x,
      y: landmark.y,
      z: landmark.z,
      visibility: landmark.visibility,
      presence: landmark.presence,
    })),
    sourceQuality: sample.sourceQuality,
    sessionEvidence: sample.sessionEvidence,
    sharedReconstructionId: sample.sharedReconstructionId,
    researchSourceIds: sample.researchSourceIds,
      researchEvidenceEpoch: sample.researchEvidenceEpoch,
      researchManifestDigestSha256: sample.researchManifestDigestSha256,
  }))
  return `${JSON.stringify({
    schema: EXPORT_SCHEMA,
    recording: {
      schema: recording.schema,
      recordingId: recording.recordingId,
      sessionId: recording.sessionId,
      status: recording.status,
      startedAtMs: recording.startedAtMs,
      finishedAtMs: recording.finishedAtMs,
      droppedByBudget: recording.droppedByBudget,
      researchLimits: recording.researchLimits,
      sourceRejections: recording.sourceRejections,
      researchEvidenceManifests: recording.researchEvidenceManifests,
      sampleCount: recording.samples.length,
      landmarkCount: recording.samples.reduce((total, sample) => total + sample.landmarks.length, 0),
      researchReady: grade.researchReady,
      researchReadyGroupCount: grade.researchReadyGroupCount,
      recordingLocalSourceQuality: grade.sourceQuality,
    },
    samples,
  }, null, 2)}\n`
}

function csvCell(value: string | number | boolean | null): string {
  if (value === null) return ''
  const text = String(value)
  return /[",\r\n]/u.test(text) ? `"${text.replace(/"/gu, '""')}"` : text
}

const CSV_COLUMNS = Object.freeze([
  'recording_schema',
  'recording_id',
  'session_id',
  'recording_status',
  'started_at_ms',
  'finished_at_ms',
  'dropped_by_budget',
  'recording_research_limits',
  'recording_research_ready',
  'research_ready_group_count',
  'research_evidence_manifest_count',
  'recording_source_usable_samples',
  'recording_source_research_usable_samples',
  'recording_source_low_evidence_samples',
  'recording_source_research_evidence_failure_rate',
  'recording_source_research_duration_ms',
  'recording_source_missing_samples',
  'recording_source_dropped_sequence_samples',
  'recording_source_unsequenced_samples',
  'recording_source_out_of_order_samples',
  'recording_source_jitter_ms',
  'recording_source_drop_rate',
  'recording_source_research_ready',
  'sample_ordinal',
  'source_id',
  'capture_timestamp_ms',
  'aligned_timestamp_ms',
  'received_at_ms',
  'sequence',
  'coordinate_space',
  'confidence',
  'missing',
  'shared_reconstruction_id',
  'research_source_ids',
  'research_evidence_epoch',
  'research_manifest_digest_sha256',
  'landmark_index',
  'x',
  'y',
  'z',
  'visibility',
  'presence',
  'source_jitter_ms',
  'source_drop_rate',
  'source_missing_samples',
  'capability_tier',
  'research_ready',
  'synchronized_source_count',
  'max_skew_ms',
  'warnings',
])

function buildCsvContent(recording: MotionCaptureRecording, grade: RecordingResearchGrade): string {
  const rows: string[] = [CSV_COLUMNS.join(',')]
  const appendRow = (
    sample: MotionCaptureRecordedSample,
    landmarkIndex: number | null,
  ): void => {
    const landmark = landmarkIndex === null ? null : sample.landmarks[landmarkIndex]!
    const recordingSourceQuality = grade.sourceQuality.find(quality => quality.sourceId === sample.sourceId)!
    rows.push([
      recording.schema,
      recording.recordingId,
      recording.sessionId,
      recording.status,
      recording.startedAtMs,
      recording.finishedAtMs,
      recording.droppedByBudget,
      JSON.stringify(recording.researchLimits),
      grade.researchReady,
      grade.researchReadyGroupCount,
      recording.researchEvidenceManifests.length,
      recordingSourceQuality.usableSamples,
      recordingSourceQuality.researchUsableSamples,
      recordingSourceQuality.lowEvidenceSamples,
      recordingSourceQuality.researchEvidenceFailureRate,
      recordingSourceQuality.researchDurationMs,
      recordingSourceQuality.missingSamples,
      recordingSourceQuality.droppedSequenceSamples,
      recordingSourceQuality.unsequencedSamples,
      recordingSourceQuality.outOfOrderSamples,
      recordingSourceQuality.jitterMs,
      recordingSourceQuality.dropRate,
      recordingSourceQuality.researchReady,
      sample.ordinal,
      sample.sourceId,
      sample.captureTimestampMs,
      sample.alignedTimestampMs,
      sample.receivedAtMs,
      sample.sequence,
      sample.coordinateSpace,
      sample.confidence,
      sample.missing,
      sample.sharedReconstructionId,
      JSON.stringify(sample.researchSourceIds),
      sample.researchEvidenceEpoch,
      sample.researchManifestDigestSha256,
      landmarkIndex,
      landmark?.x ?? null,
      landmark?.y ?? null,
      landmark?.z ?? null,
      landmark?.visibility ?? null,
      landmark?.presence ?? null,
      sample.sourceQuality.jitterMs,
      sample.sourceQuality.dropRate,
      sample.sourceQuality.missingSamples,
      sample.sessionEvidence.tier,
      sample.sessionEvidence.researchReady,
      sample.sessionEvidence.synchronizedSourceCount,
      sample.sessionEvidence.maxSkewMs,
      sample.sessionEvidence.warnings.join('|'),
    ].map(csvCell).join(','))
  }
  for (const sample of sortedSamples(recording)) {
    if (sample.landmarks.length === 0) appendRow(sample, null)
    else for (let index = 0; index < sample.landmarks.length; index += 1) appendRow(sample, index)
  }
  return `${rows.join('\n')}\n`
}

async function sha256(content: string): Promise<string> {
  const subtle = globalThis.crypto?.subtle
  if (!subtle) throw new Error('motion-capture-export-hash-unavailable')
  const bytes = new TextEncoder().encode(content)
  const digest = await subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, '0')).join('')
}

export async function buildMotionCaptureExport(
  recording: MotionCaptureRecording,
  format: MotionCaptureExportFormat,
): Promise<MotionCaptureExportArtifact> {
  if (format !== 'json' && format !== 'csv') throw new Error('motion-capture-export-format-unsupported')
  if (recording.status !== 'stopped' || recording.finishedAtMs === null) {
    throw new Error('motion-capture-recording-not-finished')
  }
  const manifestDigests = new Set(await Promise.all(
    recording.researchEvidenceManifests.map(manifest => sha256(JSON.stringify(manifest))),
  ))
  const grade = gradeRecordingResearchEvidence(recording, manifestDigests)
  const content = format === 'json' ? buildJsonContent(recording, grade) : buildCsvContent(recording, grade)
  const sampleCount = recording.samples.length
  const landmarkCount = recording.samples.reduce((total, sample) => total + sample.landmarks.length, 0)
  const fileStem = recording.recordingId.replace(/[^A-Za-z0-9_-]/gu, '_')
  return Object.freeze({
    schema: EXPORT_SCHEMA,
    format,
    mimeType: format === 'json' ? 'application/json' as const : 'text/csv' as const,
    fileName: `${fileStem}.motion-capture.${format}`,
    content,
    sha256: await sha256(content),
    byteLength: new TextEncoder().encode(content).byteLength,
    recordingId: recording.recordingId,
    sourceCount: new Set(recording.samples.map(sample => sample.sourceId)).size,
    sampleCount,
    landmarkCount,
    researchReady: grade.researchReady,
    researchReadyGroupCount: grade.researchReadyGroupCount,
    researchEvidenceManifestCount: recording.researchEvidenceManifests.length,
  })
}
