import {
  MOTION_CAPTURE_MAX_TIME_MS,
  type MotionCaptureDerivedLandmark,
  type MotionCaptureLimits,
} from '@/features/three/motionCapturePlatformContract'
import {
  createMotionCaptureSessionRuntime,
  type MotionCaptureSessionRuntime,
} from '@/features/three/motionCaptureSessionRuntime'
import { applyResearchEvidenceManifest } from '@/__tests__/helpers/motionCaptureResearchEvidenceFixture'

const RECONSTRUCTION_EVIDENCE = 'f'.repeat(64)
const RESEARCH_GROUP_COUNT = 31
const landmark = Object.freeze({ x: 0.1, y: 0.2, z: 1.3, visibility: 0.99, presence: 0.98 })

type ResearchFixture = Readonly<{
  runtime: MotionCaptureSessionRuntime
  sourceIds: readonly string[]
  time: { value: number }
}>

function deterministicIds() {
  let sequence = 0
  return (kind: 'session' | 'source' | 'recording' | 'reconstruction') => `${kind}_${++sequence}`
}

async function expectFailure(operation: () => unknown | Promise<unknown>, code: string): Promise<void> {
  try {
    await operation()
  } catch (error) {
    if (error instanceof Error && error.message === code) return
    throw error
  }
  throw new Error(`expected ${code}`)
}

async function createResearchFixture(
  sourceCount: number,
  limits?: Partial<MotionCaptureLimits>,
  clockUncertainties?: readonly number[],
): Promise<ResearchFixture> {
  const time = { value: 1_000 }
  const runtime = createMotionCaptureSessionRuntime({
    now: () => time.value,
    idFactory: deterministicIds(),
    ...(limits ? { limits } : {}),
  })
  const sourceIds = Array.from({ length: sourceCount }, (_, index) => {
    const source = runtime.registerSource({
      captureKind: 'landmark-stream',
      coordinateSpace: 'metric-world',
      clockDomain: clockUncertainties ? 'source-local' : 'session-monotonic',
    })
    if (clockUncertainties) runtime.setSourceClockAlignment(source.sourceId, {
      offsetMs: 0,
      uncertaintyMs: clockUncertainties[index]!,
      measuredAtMs: time.value,
      evidenceDigestSha256: `${index + 5}`.repeat(64),
    })
    return source.sourceId
  })
  if (clockUncertainties?.some(uncertainty => uncertainty > 5)) {
    sourceIds.forEach((sourceId, index) => runtime.setSourceCalibration(sourceId, {
      status: 'calibrated', coordinateSpace: 'metric-world',
      provenance: { kind: 'measured', measuredAtMs: time.value, evidenceDigestSha256: String(index + 1).repeat(64) },
    }))
    runtime.setSharedReconstructionEvidence({
      sourceIds, method: 'measured', measuredAtMs: time.value, evidenceDigestSha256: RECONSTRUCTION_EVIDENCE,
    })
  } else await applyResearchEvidenceManifest(runtime, sourceIds, time.value)
  return { runtime, sourceIds, time }
}

function recordGroups(fixture: ResearchFixture, groupCount: number, unsequencedSourceIndex = -1, intervalMs = 34): void {
  for (let groupIndex = 0; groupIndex < groupCount; groupIndex += 1) {
    fixture.time.value += intervalMs
    fixture.sourceIds.forEach((sourceId, sourceIndex) => {
      fixture.runtime.ingestObservation(sourceId, {
        captureTimestampMs: fixture.time.value,
        ...(sourceIndex === unsequencedSourceIndex ? {} : { sequence: groupIndex + 1 }),
        coordinateSpace: 'metric-world',
        confidence: 0.99,
        landmarks: [landmark],
      })
    })
  }
}

export async function testMotionCaptureResearchGradePreservesRecordingLocalEvidence(): Promise<void> {
  const ordered = await createResearchFixture(2)
  ordered.runtime.startRecording()
  recordGroups(ordered, RESEARCH_GROUP_COUNT)
  ordered.runtime.ingestObservation(ordered.sourceIds[0]!, {
    captureTimestampMs: ordered.time.value,
    sequence: RESEARCH_GROUP_COUNT,
    coordinateSpace: 'metric-world',
    confidence: 0.99,
    landmarks: [landmark],
  })
  ordered.runtime.stopRecording()
  const orderedArtifact = await ordered.runtime.exportRecording('json')
  const orderedPayload = JSON.parse(orderedArtifact.content) as {
    recording?: {
      sourceRejections?: Array<{ sourceId?: string; outOfOrderSamples?: number }>
      recordingLocalSourceQuality?: Array<{ sourceId?: string; outOfOrderSamples?: number }>
    }
  }
  if (orderedArtifact.researchReady
    || orderedArtifact.researchReadyGroupCount !== 0
    || orderedPayload.recording?.sourceRejections?.[0]?.outOfOrderSamples !== 1
    || orderedPayload.recording.recordingLocalSourceQuality
      ?.find(quality => quality.sourceId === ordered.sourceIds[0])?.outOfOrderSamples !== 1) {
    throw new Error('expected in-window rejected order evidence to downgrade the deterministic export')
  }

  const bounded = await createResearchFixture(2, { maxRecordingSamples: 62 })
  bounded.runtime.startRecording()
  recordGroups(bounded, RESEARCH_GROUP_COUNT + 1)
  bounded.runtime.stopRecording()
  const boundedArtifact = await bounded.runtime.exportRecording('json')
  if (boundedArtifact.researchReady
    || boundedArtifact.researchReadyGroupCount !== RESEARCH_GROUP_COUNT
    || bounded.runtime.readRecording()?.droppedByBudget !== 2) {
    throw new Error('expected recording-budget loss to prevent a research-ready artifact claim')
  }

  const stricter = await createResearchFixture(2, { minimumResearchSamplesPerSource: 40 })
  stricter.runtime.startRecording()
  recordGroups(stricter, RESEARCH_GROUP_COUNT)
  stricter.runtime.stopRecording()
  const stricterArtifact = await stricter.runtime.exportRecording('json')
  if (stricter.runtime.getSnapshot().evidence.researchReady
    || stricterArtifact.researchReady
    || stricterArtifact.researchReadyGroupCount !== 0) {
    throw new Error('expected export grading to retain the session owner\'s stricter research limits')
  }

  const optionalThird = await createResearchFixture(3)
  optionalThird.runtime.startRecording()
  recordGroups(optionalThird, RESEARCH_GROUP_COUNT, 2)
  optionalThird.runtime.stopRecording()
  const optionalThirdRecording = optionalThird.runtime.readRecording()
  const optionalThirdArtifact = await optionalThird.runtime.exportRecording('json')
  if (!optionalThirdRecording
    || optionalThirdRecording.samples.slice(-3).some(sample => sample.researchSourceIds.length !== 3)
    || !optionalThird.runtime.getSnapshot().evidence.researchReady
    || !optionalThirdArtifact.researchReady
    || optionalThirdArtifact.researchReadyGroupCount !== RESEARCH_GROUP_COUNT) {
    throw new Error('expected a stable cohort to qualify from its locally valid synchronized source pair')
  }

  const tiedClusters = await createResearchFixture(4)
  tiedClusters.runtime.startRecording()
  for (let groupIndex = 0; groupIndex < RESEARCH_GROUP_COUNT; groupIndex += 1) {
    tiedClusters.time.value += 200
    tiedClusters.sourceIds.forEach((sourceId, sourceIndex) => {
      tiedClusters.runtime.ingestObservation(sourceId, {
        captureTimestampMs: tiedClusters.time.value + (sourceIndex < 2 ? 0 : 100),
        ...(sourceIndex < 2 ? {} : { sequence: groupIndex + 1 }),
        coordinateSpace: 'metric-world', confidence: 0.99, landmarks: [landmark],
      })
    })
  }
  tiedClusters.runtime.stopRecording()
  const tiedArtifact = await tiedClusters.runtime.exportRecording('json')
  const tiedEvidence = tiedClusters.runtime.getSnapshot().evidence
  if (!tiedEvidence.researchReady
    || tiedEvidence.synchronizedSourceCount !== 2
    || !tiedArtifact.researchReady
    || tiedArtifact.researchReadyGroupCount !== RESEARCH_GROUP_COUNT) {
    throw new Error('expected research grading to select the qualified pair from tied synchronized clusters')
  }

  const bridgedSkew = await createResearchFixture(3)
  bridgedSkew.runtime.startRecording()
  for (let groupIndex = 0; groupIndex < RESEARCH_GROUP_COUNT; groupIndex += 1) {
    bridgedSkew.time.value += 100
    const timestamps = [bridgedSkew.time.value, bridgedSkew.time.value + 40, bridgedSkew.time.value + 20]
    bridgedSkew.sourceIds.forEach((sourceId, sourceIndex) => bridgedSkew.runtime.ingestObservation(sourceId, {
      captureTimestampMs: timestamps[sourceIndex]!,
      ...(sourceIndex === 2 ? {} : { sequence: groupIndex + 1 }),
      coordinateSpace: 'metric-world', confidence: 0.99, landmarks: [landmark],
    }))
  }
  bridgedSkew.runtime.stopRecording()
  const bridgedArtifact = await bridgedSkew.runtime.exportRecording('json')
  if (bridgedSkew.runtime.getSnapshot().evidence.researchReady
    || bridgedArtifact.researchReady
    || bridgedArtifact.researchReadyGroupCount !== 0) {
    throw new Error('expected an unqualified midpoint source never to bridge an over-skew qualified pair')
  }

  const lowEvidence = await createResearchFixture(2)
  lowEvidence.runtime.startRecording()
  for (let groupIndex = 0; groupIndex < RESEARCH_GROUP_COUNT; groupIndex += 1) {
    lowEvidence.time.value += 34
    lowEvidence.sourceIds.forEach(sourceId => lowEvidence.runtime.ingestObservation(sourceId, {
      captureTimestampMs: lowEvidence.time.value,
      sequence: groupIndex + 1,
      coordinateSpace: 'metric-world',
      confidence: 0,
      landmarks: [{ ...landmark, visibility: 0, presence: 0 }],
    }))
  }
  lowEvidence.runtime.stopRecording()
  const lowEvidenceArtifact = await lowEvidence.runtime.exportRecording('json')
  const lowEvidenceQuality = lowEvidence.runtime.getSnapshot().sources.map(source => source.quality)
  if (lowEvidence.runtime.getSnapshot().evidence.researchReady
    || !lowEvidence.runtime.getSnapshot().evidence.warnings.includes('capture-observation-evidence-low')
    || lowEvidenceArtifact.researchReady
    || lowEvidenceArtifact.researchReadyGroupCount !== 0
    || lowEvidenceQuality.some(quality => quality.researchUsableSamples !== 0 || quality.lowEvidenceSamples !== RESEARCH_GROUP_COUNT)) {
    throw new Error('expected low-confidence and low-presence observations to remain non-research evidence')
  }

  const mixedEvidence = await createResearchFixture(2)
  mixedEvidence.runtime.startRecording()
  for (let groupIndex = 0; groupIndex < 70; groupIndex += 1) {
    mixedEvidence.time.value += 34
    mixedEvidence.sourceIds.forEach(sourceId => mixedEvidence.runtime.ingestObservation(sourceId, {
      captureTimestampMs: mixedEvidence.time.value,
      sequence: groupIndex + 1,
      coordinateSpace: 'metric-world',
      confidence: groupIndex < 40 ? 0 : 0.99,
      landmarks: [groupIndex < 40 ? { ...landmark, visibility: 0, presence: 0 } : landmark],
    }))
  }
  mixedEvidence.runtime.stopRecording()
  const mixedEvidenceArtifact = await mixedEvidence.runtime.exportRecording('json')
  if (mixedEvidence.runtime.getSnapshot().evidence.researchReady
    || !mixedEvidence.runtime.getSnapshot().evidence.warnings.includes('capture-observation-evidence-failure-rate-high')
    || mixedEvidenceArtifact.researchReady
    || mixedEvidenceArtifact.researchReadyGroupCount !== 0) {
    throw new Error('expected a short qualified tail never to launder a mostly low-evidence recording')
  }

  const uncertainClock = await createResearchFixture(2, undefined, [1, 100])
  uncertainClock.runtime.startRecording()
  recordGroups(uncertainClock, RESEARCH_GROUP_COUNT)
  uncertainClock.runtime.stopRecording()
  const uncertainBeforeRealignment = uncertainClock.runtime.getSnapshot()
  uncertainClock.runtime.setSourceClockAlignment(uncertainClock.sourceIds[1]!, {
    offsetMs: 0,
    uncertaintyMs: 1,
    measuredAtMs: uncertainClock.time.value,
    evidenceDigestSha256: 'e'.repeat(64),
  })
  const uncertainAfterRealignment = uncertainClock.runtime.getSnapshot()
  const uncertainArtifact = await uncertainClock.runtime.exportRecording('json')
  if (uncertainBeforeRealignment.evidence.researchReady
    || !uncertainBeforeRealignment.evidence.warnings.includes('capture-clock-uncertainty-high')
    || uncertainAfterRealignment.sources.find(source => source.sourceId === uncertainClock.sourceIds[1])?.latestObservation !== null
    || uncertainAfterRealignment.sources.find(source => source.sourceId === uncertainClock.sourceIds[1])?.quality.researchUsableSamples !== 0
    || uncertainAfterRealignment.evidence.researchReady
    || uncertainArtifact.researchReady
    || uncertainArtifact.researchReadyGroupCount !== 0) {
    throw new Error('expected high clock uncertainty and alignment changes to invalidate prior observation evidence')
  }

  const alignmentEpoch = await createResearchFixture(2, undefined, [1, 1])
  alignmentEpoch.runtime.setSourceClockAlignment(alignmentEpoch.sourceIds[1]!, {
    offsetMs: 1_000, uncertaintyMs: 1, measuredAtMs: alignmentEpoch.time.value, evidenceDigestSha256: 'd'.repeat(64),
  })
  alignmentEpoch.runtime.ingestObservation(alignmentEpoch.sourceIds[0]!, {
    captureTimestampMs: 1_099, sequence: 0, coordinateSpace: 'metric-world', confidence: 0.99, landmarks: [landmark],
  })
  alignmentEpoch.runtime.startRecording()
  for (let index = 0; index < 3; index += 1) alignmentEpoch.runtime.ingestObservation(alignmentEpoch.sourceIds[1]!, {
    captureTimestampMs: 100 + index, sequence: index + 1,
    coordinateSpace: 'metric-world', confidence: 0.99, landmarks: [landmark],
  })
  alignmentEpoch.runtime.setSourceClockAlignment(alignmentEpoch.sourceIds[1]!, {
    offsetMs: 0, uncertaintyMs: 1, measuredAtMs: alignmentEpoch.time.value, evidenceDigestSha256: 'c'.repeat(64),
  })
  const afterAlignmentEpochChange = alignmentEpoch.runtime.getSnapshot()
  if (afterAlignmentEpochChange.sources.some(source => (
    source.latestObservation !== null || source.quality.researchUsableSamples !== 0
  ))) throw new Error('expected a bound clock change to reset the entire live reconstruction cohort')
  alignmentEpoch.runtime.ingestObservation(alignmentEpoch.sourceIds[1]!, {
    captureTimestampMs: 103, sequence: 4, coordinateSpace: 'metric-world', confidence: 0.99, landmarks: [landmark],
  })
  for (let index = 0; index < 3; index += 1) alignmentEpoch.runtime.ingestObservation(alignmentEpoch.sourceIds[0]!, {
    captureTimestampMs: 1_100 + index, sequence: index + 1,
    coordinateSpace: 'metric-world', confidence: 0.99, landmarks: [landmark],
  })
  alignmentEpoch.runtime.stopRecording()
  const alignmentEpochArtifact = await alignmentEpoch.runtime.exportRecording('json')
  const alignmentEpochPayload = JSON.parse(alignmentEpochArtifact.content) as {
    samples?: Array<{ researchEvidenceEpoch?: string | null; researchManifestDigestSha256?: string | null }>
  }
  const serializedAlignmentEpochs = new Set(
    alignmentEpochPayload.samples?.map(sample => sample.researchEvidenceEpoch).filter(Boolean),
  )
  if (alignmentEpoch.runtime.getSnapshot().evidence.researchReady
    || alignmentEpoch.runtime.getSnapshot().sources[1]?.quality.researchUsableSamples !== 1
    || alignmentEpochArtifact.researchReady
    || alignmentEpochArtifact.researchReadyGroupCount !== 0
    || alignmentEpochArtifact.researchEvidenceManifestCount !== 0
    || serializedAlignmentEpochs.size !== 0
    || alignmentEpochPayload.samples?.some(sample => sample.researchManifestDigestSha256 !== null)) {
    throw new Error(`expected a direct clock mutation to invalidate the manifest-bound research cohort before recording: ${JSON.stringify({
      snapshot: alignmentEpoch.runtime.getSnapshot(), artifact: alignmentEpochArtifact, samples: alignmentEpochPayload.samples,
    })}`)
  }

  const epochLocalQuality = await createResearchFixture(2)
  epochLocalQuality.runtime.startRecording()
  for (let index = 0; index < 120; index += 1) {
    const baseTimestampMs = 100 + index * 100
    epochLocalQuality.sourceIds.forEach((sourceId, sourceIndex) => epochLocalQuality.runtime.ingestObservation(sourceId, {
      captureTimestampMs: baseTimestampMs + sourceIndex * 21,
      sequence: index + 1,
      coordinateSpace: 'metric-world', confidence: 0.99, landmarks: [landmark],
    }))
  }
  epochLocalQuality.runtime.setSharedReconstructionEvidence({
    sourceIds: epochLocalQuality.sourceIds,
    method: 'measured',
    measuredAtMs: epochLocalQuality.time.value,
    evidenceDigestSha256: 'e'.repeat(64),
  })
  const noisyEpochTimestamps = [12_100, 12_101, 12_200]
  noisyEpochTimestamps.forEach((captureTimestampMs, index) => {
    epochLocalQuality.sourceIds.forEach(sourceId => epochLocalQuality.runtime.ingestObservation(sourceId, {
      captureTimestampMs,
      sequence: 121 + index,
      coordinateSpace: 'metric-world', confidence: 0.99, landmarks: [landmark],
    }))
  })
  epochLocalQuality.runtime.stopRecording()
  const epochLocalQualityArtifact = await epochLocalQuality.runtime.exportRecording('json')
  if (epochLocalQuality.runtime.getSnapshot().evidence.researchReady
    || !epochLocalQuality.runtime.getSnapshot().evidence.warnings.includes('capture-sample-jitter-high')
    || epochLocalQualityArtifact.researchReady
    || epochLocalQualityArtifact.researchReadyGroupCount !== 0) {
    throw new Error('expected prior-epoch stability never to dilute current-epoch jitter')
  }

  const maximumMatching = await createResearchFixture(2)
  maximumMatching.runtime.ingestObservation(maximumMatching.sourceIds[0]!, {
    captureTimestampMs: 999, sequence: 0, coordinateSpace: 'metric-world', confidence: 0.99, landmarks: [landmark],
  })
  maximumMatching.runtime.ingestObservation(maximumMatching.sourceIds[1]!, {
    captureTimestampMs: 999, sequence: 0, coordinateSpace: 'metric-world', confidence: 0.99, landmarks: [landmark],
  })
  maximumMatching.runtime.startRecording()
  const matchingTimestamps = [
    Array.from({ length: RESEARCH_GROUP_COUNT }, (_, index) => 1_000 + index * 34),
    Array.from({ length: RESEARCH_GROUP_COUNT }, (_, index) => 1_001 + index * 34),
  ] as const
  for (let index = 0; index < RESEARCH_GROUP_COUNT; index += 1) {
    maximumMatching.sourceIds.forEach((sourceId, sourceIndex) => maximumMatching.runtime.ingestObservation(sourceId, {
      captureTimestampMs: matchingTimestamps[sourceIndex]![index]!, sequence: index + 1,
      coordinateSpace: 'metric-world', confidence: 0.99, landmarks: [landmark],
    }))
  }
  maximumMatching.runtime.stopRecording()
  const maximumMatchingArtifact = await maximumMatching.runtime.exportRecording('json')
  if (!maximumMatching.runtime.getSnapshot().evidence.researchReady
    || !maximumMatchingArtifact.researchReady
    || maximumMatchingArtifact.researchReadyGroupCount !== RESEARCH_GROUP_COUNT) {
    throw new Error('expected deterministic interval matching to find the maximum disjoint synchronized groups')
  }

  const rollbackTime = { value: 1_000 }
  const rollback = createMotionCaptureSessionRuntime({ now: () => rollbackTime.value, idFactory: deterministicIds() })
  const rollbackSource = rollback.registerSource({
    captureKind: 'landmark-stream', coordinateSpace: 'model-relative', clockDomain: 'session-monotonic',
  })
  rollback.ingestObservation(rollbackSource.sourceId, {
    captureTimestampMs: 1_000, sequence: 1, coordinateSpace: 'model-relative', confidence: 1, landmarks: [landmark],
  })
  if (rollback.getSnapshot().evidence.activeSourceCount !== 1) throw new Error('expected fresh observation before rollback')
  rollbackTime.value = 999
  if (rollback.getSnapshot().evidence.activeSourceCount !== 0) {
    throw new Error('expected a clock rollback never to make a future-received observation fresh')
  }

  const strictShape = createMotionCaptureSessionRuntime({ now: () => 1_000, idFactory: deterministicIds() })
  const strictSource = strictShape.registerSource({
    captureKind: 'landmark-stream', coordinateSpace: 'model-relative', clockDomain: 'session-monotonic',
  })
  await expectFailure(() => strictShape.ingestObservation(strictSource.sourceId, {
    captureTimestampMs: 1,
    sequence: 1,
    coordinateSpace: 'model-relative',
    confidence: 1,
    landmarks: new Array(1) as MotionCaptureDerivedLandmark[],
  }), 'motion-capture-invalid-landmark-shape')

  const safeTime = createMotionCaptureSessionRuntime({ now: () => 1_000, idFactory: deterministicIds() })
  const localClock = safeTime.registerSource({
    captureKind: 'landmark-stream', coordinateSpace: 'model-relative', clockDomain: 'source-local',
  })
  await expectFailure(() => safeTime.setSourceClockAlignment(localClock.sourceId, {
    offsetMs: 1e20, uncertaintyMs: 1, measuredAtMs: 1_000, evidenceDigestSha256: 'a'.repeat(64),
  }), 'motion-capture-invalid-clock-offset')
  safeTime.setSourceClockAlignment(localClock.sourceId, {
    offsetMs: 1, uncertaintyMs: 1, measuredAtMs: 1_000, evidenceDigestSha256: 'a'.repeat(64),
  })
  await expectFailure(() => safeTime.ingestObservation(localClock.sourceId, {
    captureTimestampMs: MOTION_CAPTURE_MAX_TIME_MS,
    sequence: 1,
    coordinateSpace: 'model-relative',
    confidence: 1,
    landmarks: [landmark],
  }), 'motion-capture-invalid-aligned-timestamp')
  const afterRejectedTime = safeTime.getSnapshot().sources[0]
  safeTime.ingestObservation(localClock.sourceId, {
    captureTimestampMs: 1, sequence: 1, coordinateSpace: 'model-relative', confidence: 1, landmarks: [landmark],
  })
  const afterValidTime = safeTime.getSnapshot().sources[0]
  if (afterRejectedTime?.quality.receivedSamples !== 0
    || afterRejectedTime.latestObservation !== null
    || afterValidTime?.quality.receivedSamples !== 1
    || afterValidTime.quality.usableSamples !== 1) {
    throw new Error('expected aligned-time rejection to be atomic before quality and ordering state mutation')
  }
}
