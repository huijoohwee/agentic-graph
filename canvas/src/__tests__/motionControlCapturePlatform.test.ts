import { buildMotionCaptureExport } from '@/features/three/motionCaptureExport'
import {
  MOTION_CAPTURE_DEFAULT_LIMITS,
  MOTION_CAPTURE_PLATFORM_SCHEMA,
  type MotionCaptureDerivedLandmark,
} from '@/features/three/motionCapturePlatformContract'
import {
  createMotionCaptureSessionRuntime,
  motionCaptureSessionRuntime,
} from '@/features/three/motionCaptureSessionRuntime'
import { createMotionCaptureXrLifecycleTeardown } from '@/features/three/motionCaptureXrLifecycleRuntime'
import {
  inspectMotionControlCapturePlatform,
  startMotionControlCapturePlatformSource,
  stopMotionControlCapturePlatformSource,
} from '@/features/three/motionControlCapturePlatformBridge'
import {
  applyResearchEvidenceManifest,
  buildResearchEvidenceManifest,
} from '@/__tests__/helpers/motionCaptureResearchEvidenceFixture'
import {
  MOTION_CAPTURE_PROVIDER_API_SCHEMA,
  motionCaptureProviderApi,
} from '@/features/three/motionCaptureProviderRuntime'

const EVIDENCE_A = 'a'.repeat(64)
const EVIDENCE_B = 'b'.repeat(64)
const SHARED_RECONSTRUCTION_EVIDENCE = 'c'.repeat(64)
const RESEARCH_GROUP_COUNT = 31
const landmark = (offset = 0): MotionCaptureDerivedLandmark => Object.freeze({
  x: 0.25 + offset,
  y: 0.5,
  z: 1.25,
  visibility: 0.98,
  presence: 0.99,
})
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

export async function testMotionCapturePlatformIsProviderNeutralBoundedAndEvidenceGraded() {
  let nowMs = 1_000
  const runtime = createMotionCaptureSessionRuntime({
    now: () => nowMs,
    idFactory: deterministicIds(),
  })
  await expectFailure(() => createMotionCaptureSessionRuntime({
    now: () => nowMs,
    endpoint: 'https://example.invalid/capture',
  } as never), 'motion-capture-invalid-runtime-options-shape')
  await expectFailure(() => runtime.registerSource({
    captureKind: 'video',
    coordinateSpace: 'normalized-image',
    clockDomain: 'session-monotonic',
    deviceId: 'stable-device-id',
  } as never), 'motion-capture-invalid-source-registration-shape')
  const first = runtime.registerSource({
    captureKind: 'landmark-stream',
    coordinateSpace: 'metric-world',
    clockDomain: 'session-monotonic',
    nominalFps: 30,
  })
  const second = runtime.registerSource({
    captureKind: 'peer-derived',
    coordinateSpace: 'metric-world',
    clockDomain: 'source-local',
    nominalFps: 30,
  })
  await expectFailure(() => runtime.ingestObservation(second.sourceId, {
    captureTimestampMs: 995,
    coordinateSpace: 'metric-world',
    confidence: 0.96,
    landmarks: [landmark()],
    endpoint: 'https://example.invalid/pose',
  } as never), 'motion-capture-invalid-observation-shape')
  if (!first.sourceId.startsWith('source-')
    || !second.sourceId.startsWith('source-')
    || first.sourceId === second.sourceId
    || 'deviceId' in first
    || 'provider' in first) {
    throw new Error('expected generated session-local source identities without provider or stable device identity')
  }

  runtime.ingestObservation(second.sourceId, {
    captureTimestampMs: 996,
    sequence: 1,
    coordinateSpace: 'metric-world',
    confidence: 0.96,
    landmarks: [landmark()],
  })
  const unaligned = runtime.getSnapshot()
  if (unaligned.evidence.alignedSourceCount !== 0
    || !unaligned.evidence.warnings.includes('capture-clock-alignment-incomplete')) {
    throw new Error('expected source-local timestamps to remain unaligned without explicit clock evidence')
  }
  await expectFailure(() => runtime.setSourceClockAlignment(second.sourceId, {
    offsetMs: 4,
    uncertaintyMs: 1.5,
    measuredAtMs: nowMs,
    evidenceDigestSha256: EVIDENCE_B,
    deviceId: 'stable-device-id',
  } as never), 'motion-capture-invalid-clock-alignment-shape')
  await expectFailure(() => runtime.setSourceClockAlignment(second.sourceId, {
    offsetMs: 4,
    uncertaintyMs: 1.5,
    measuredAtMs: nowMs + 1,
    evidenceDigestSha256: EVIDENCE_B,
  }), 'motion-capture-invalid-clock-evidence')
  runtime.setSourceClockAlignment(second.sourceId, {
    offsetMs: 4,
    uncertaintyMs: 1.5,
    measuredAtMs: nowMs,
    evidenceDigestSha256: EVIDENCE_B,
  })
  runtime.setSourceCalibration(first.sourceId, {
    status: 'calibrated',
    coordinateSpace: 'metric-world',
    provenance: { kind: 'measured', measuredAtMs: nowMs, evidenceDigestSha256: EVIDENCE_A },
  })
  await expectFailure(() => runtime.setSourceCalibration(first.sourceId, {
    status: 'calibrated',
    coordinateSpace: 'metric-world',
    provenance: {
      kind: 'measured',
      measuredAtMs: nowMs,
      evidenceDigestSha256: EVIDENCE_A,
      endpoint: 'https://example.invalid/calibration',
    },
  } as never), 'motion-capture-invalid-calibration-provenance-shape')
  await expectFailure(() => runtime.setSourceCalibration(second.sourceId, {
    status: 'calibrated',
    coordinateSpace: 'metric-world',
    provenance: { kind: 'measured', measuredAtMs: nowMs + 1, evidenceDigestSha256: EVIDENCE_B },
  }), 'motion-capture-invalid-calibration-provenance')
  runtime.setSourceCalibration(second.sourceId, {
    status: 'calibrated',
    coordinateSpace: 'metric-world',
    provenance: { kind: 'measured', measuredAtMs: nowMs, evidenceDigestSha256: EVIDENCE_B },
  })

  const ingestSynchronizedPair = (index: number): void => {
    nowMs += 34
    runtime.ingestObservation(first.sourceId, {
      captureTimestampMs: nowMs,
      sequence: index + 1,
      coordinateSpace: 'metric-world',
      confidence: 0.97,
      landmarks: [landmark(index / 100)],
    })
    runtime.ingestObservation(second.sourceId, {
      captureTimestampMs: nowMs - 4,
      sequence: index + 2,
      coordinateSpace: 'metric-world',
      confidence: 0.95,
      landmarks: [landmark(index / 100)],
    })
  }
  for (let index = 0; index < 3; index += 1) ingestSynchronizedPair(index)
  const unlinked = runtime.getSnapshot()
  if (unlinked.evidence.researchReady
    || unlinked.evidence.tier !== 'time-aligned-multi-source'
    || !unlinked.evidence.warnings.includes('capture-shared-reconstruction-evidence-required')) {
    throw new Error('expected unrelated per-source calibration evidence to remain time-aligned but never research-ready')
  }
  await expectFailure(() => runtime.setSharedReconstructionEvidence({
    sourceIds: [first.sourceId, second.sourceId],
    method: 'measured',
    measuredAtMs: nowMs,
    evidenceDigestSha256: SHARED_RECONSTRUCTION_EVIDENCE,
    deviceId: 'stable-device-id',
  } as never), 'motion-capture-invalid-shared-reconstruction-shape')
  await expectFailure(() => runtime.setSharedReconstructionEvidence({
    sourceIds: [first.sourceId, second.sourceId],
    method: 'measured',
    measuredAtMs: nowMs,
    evidenceDigestSha256: EVIDENCE_A,
  }), 'motion-capture-shared-reconstruction-source-unqualified')
  runtime.setSharedReconstructionEvidence({
    sourceIds: [first.sourceId, second.sourceId],
    method: 'measured',
    measuredAtMs: nowMs,
    evidenceDigestSha256: SHARED_RECONSTRUCTION_EVIDENCE,
  })
  for (let index = 3; index < 6; index += 1) ingestSynchronizedPair(index)
  if (runtime.getSnapshot().evidence.researchReady) {
    throw new Error('expected caller-supplied SHA metadata never to qualify as research evidence')
  }
  const strictManifest = buildResearchEvidenceManifest(runtime, [first.sourceId, second.sourceId], nowMs)
  await expectFailure(() => runtime.applyResearchEvidenceManifest({
    ...strictManifest,
    sources: strictManifest.sources.map((source, index) => index === 0
      ? { ...source, calibrationSampleCount: '60' }
      : source),
  }), 'motion-capture-invalid-research-calibration-sample-count')
  await runtime.applyResearchEvidenceManifest(strictManifest)
  for (let index = 0; index < RESEARCH_GROUP_COUNT; index += 1) ingestSynchronizedPair(index)
  const research = runtime.getSnapshot()
  if (research.schema !== MOTION_CAPTURE_PLATFORM_SCHEMA
    || research.evidence.tier !== 'calibrated-metric-reconstruction'
    || !research.evidence.researchReady
    || research.evidence.synchronizedSourceCount !== 2
    || research.evidence.maxSkewMs !== 0
    || research.evidence.maxClockUncertaintyMs !== 1.5) {
    throw new Error(`expected evidence-gated metric reconstruction, got ${JSON.stringify(research.evidence)}`)
  }
  runtime.setSourceCalibration(first.sourceId, {
    status: 'calibrated',
    coordinateSpace: 'metric-world',
    provenance: { kind: 'measured', measuredAtMs: nowMs, evidenceDigestSha256: EVIDENCE_A },
  })
  const invalidatedReconstruction = runtime.getSnapshot()
  if (invalidatedReconstruction.evidence.researchReady
    || !invalidatedReconstruction.evidence.warnings.includes('capture-single-source-only')
    || invalidatedReconstruction.sources.find(source => source.sourceId === first.sourceId)?.latestObservation !== null) {
    throw new Error('expected any bound source recalibration to invalidate shared reconstruction evidence')
  }

  const normalized = runtime.registerSource({
    captureKind: 'video',
    coordinateSpace: 'normalized-image',
    clockDomain: 'session-monotonic',
  })
  await expectFailure(() => runtime.ingestObservation(normalized.sourceId, {
    captureTimestampMs: nowMs + 1,
    coordinateSpace: 'metric-world',
    confidence: 1,
    landmarks: [landmark()],
  }), 'motion-capture-observation-coordinate-space-mismatch')
  await expectFailure(() => runtime.setSourceCalibration(normalized.sourceId, {
    status: 'calibrated',
    coordinateSpace: 'metric-world',
    provenance: { kind: 'imported', measuredAtMs: nowMs, evidenceDigestSha256: EVIDENCE_A },
  }), 'motion-capture-calibration-coordinate-space-mismatch')

  nowMs = 3_000
  const groupedRuntime = createMotionCaptureSessionRuntime({
    now: () => nowMs,
    idFactory: deterministicIds(),
  })
  const groupedFirst = groupedRuntime.registerSource({
    captureKind: 'landmark-stream',
    coordinateSpace: 'metric-world',
    clockDomain: 'session-monotonic',
  })
  const groupedSecond = groupedRuntime.registerSource({
    captureKind: 'landmark-stream',
    coordinateSpace: 'metric-world',
    clockDomain: 'session-monotonic',
  })
  await applyResearchEvidenceManifest(groupedRuntime, [groupedFirst.sourceId, groupedSecond.sourceId], nowMs)
  groupedRuntime.startRecording()
  await expectFailure(() => applyResearchEvidenceManifest(
    groupedRuntime, [groupedFirst.sourceId, groupedSecond.sourceId], nowMs,
  ), 'motion-capture-research-evidence-recording-active')
  for (let index = 0; index < RESEARCH_GROUP_COUNT; index += 1) {
    nowMs = 3_000 + index * 34
    for (const source of [groupedFirst, groupedSecond]) groupedRuntime.ingestObservation(source.sourceId, {
      captureTimestampMs: nowMs,
      sequence: index + 1,
      coordinateSpace: 'metric-world',
      confidence: 0.98,
      landmarks: [landmark(index / 100)],
    })
  }
  groupedRuntime.stopRecording()
  const researchExport = await groupedRuntime.exportRecording('json')
  if (!researchExport.researchReady || researchExport.researchReadyGroupCount !== RESEARCH_GROUP_COUNT) {
    throw new Error('expected a one-second, thirty-one-pair recording to qualify without session pre-roll')
  }
  const researchRecording = groupedRuntime.readRecording()
  if (!researchRecording) throw new Error('expected the research recording to remain available')
  const shortExport = await buildMotionCaptureExport(Object.freeze({
    ...researchRecording,
    recordingId: 'recording_one_synchronized_pair',
    samples: Object.freeze(researchRecording.samples.slice(0, 2)),
  }), 'json')
  if (shortExport.researchReady || shortExport.researchReadyGroupCount !== 0) {
    throw new Error('expected one recording-local synchronized group to remain below research-ready')
  }
  const mixedCohortExport = await buildMotionCaptureExport(Object.freeze({
    ...researchRecording,
    recordingId: 'recording_mixed_reconstruction_cohorts',
    samples: Object.freeze(researchRecording.samples.map((sample, sampleIndex) => Object.freeze({
      ...sample,
      sharedReconstructionId: `reconstruction_${Math.floor(sampleIndex / 2)}`,
    }))),
  }), 'json')
  if (mixedCohortExport.researchReady || mixedCohortExport.researchReadyGroupCount !== 0) {
    throw new Error('expected no reconstruction cohort to borrow another cohort\'s local quality threshold')
  }
  const invalidatedExport = groupedRuntime.exportRecording('json')
  groupedRuntime.clearRecording()
  await expectFailure(() => invalidatedExport, 'motion-capture-export-invalidated')
  for (let index = 0; index < 100; index += 1) {
    nowMs += 33
    for (const source of [groupedFirst, groupedSecond]) groupedRuntime.ingestObservation(source.sourceId, {
      captureTimestampMs: nowMs,
      sequence: index + RESEARCH_GROUP_COUNT + 1,
      coordinateSpace: 'metric-world',
      confidence: 0.98,
      landmarks: [landmark()],
    })
  }
  groupedRuntime.startRecording()
  for (const [index, interval] of Array.from({ length: RESEARCH_GROUP_COUNT }, (_, itemIndex) => (
    itemIndex % 2 === 0 ? 20 : 48
  )).entries()) {
    nowMs += interval
    for (const source of [groupedFirst, groupedSecond]) groupedRuntime.ingestObservation(source.sourceId, {
      captureTimestampMs: nowMs,
      sequence: index + RESEARCH_GROUP_COUNT + 101,
      coordinateSpace: 'metric-world',
      confidence: 0.98,
      landmarks: [landmark()],
    })
  }
  groupedRuntime.stopRecording()
  if (!groupedRuntime.getSnapshot().evidence.researchReady) {
    throw new Error(`expected long clean pre-roll to demonstrate cumulative session-quality dilution: ${JSON.stringify(groupedRuntime.getSnapshot())}`)
  }
  const badWindowExport = await groupedRuntime.exportRecording('json')
  const badWindowPayload = JSON.parse(badWindowExport.content) as {
    recording?: { recordingLocalSourceQuality?: Array<{ jitterMs?: number; researchReady?: boolean }> }
  }
  const badWindowQuality = badWindowPayload.recording?.recordingLocalSourceQuality
  if (badWindowExport.researchReady
    || badWindowExport.researchReadyGroupCount !== 0
    || badWindowQuality?.length !== 2
    || badWindowQuality.some(quality => quality.researchReady !== false || (quality.jitterMs || 0) <= 10)) {
    throw new Error('expected recording-local jitter to prevent pre-roll quality from qualifying the artifact')
  }
  groupedRuntime.clearRecording()
  groupedRuntime.startRecording()
  for (let index = 0; index < RESEARCH_GROUP_COUNT; index += 1) {
    nowMs += 34
    for (const source of [groupedFirst, groupedSecond]) groupedRuntime.ingestObservation(source.sourceId, {
      captureTimestampMs: nowMs,
      coordinateSpace: 'metric-world',
      confidence: 0.98,
      landmarks: [landmark()],
    })
  }
  groupedRuntime.stopRecording()
  const unsequencedSnapshot = groupedRuntime.getSnapshot()
  const unsequencedExport = await groupedRuntime.exportRecording('json')
  if (unsequencedSnapshot.evidence.researchReady
    || !unsequencedSnapshot.evidence.warnings.includes('capture-sequence-evidence-incomplete')
    || unsequencedExport.researchReady) {
    throw new Error('expected omitted sequence evidence to remain valid for control but below research-ready')
  }
  groupedRuntime.clearRecording()

  const freshnessRuntime = createMotionCaptureSessionRuntime({
    idFactory: deterministicIds(),
    limits: { maxSampleStalenessMs: 10 },
  })
  const freshnessFirst = freshnessRuntime.registerSource({
    captureKind: 'landmark-stream', coordinateSpace: 'metric-world', clockDomain: 'session-monotonic',
  })
  const freshnessSecond = freshnessRuntime.registerSource({
    captureKind: 'landmark-stream', coordinateSpace: 'metric-world', clockDomain: 'session-monotonic',
  })
  const freshnessMeasuredAt = Date.now()
  await applyResearchEvidenceManifest(
    freshnessRuntime, [freshnessFirst.sourceId, freshnessSecond.sourceId], freshnessMeasuredAt,
  )
  for (let index = 0; index < RESEARCH_GROUP_COUNT; index += 1) {
    for (const source of [freshnessFirst, freshnessSecond]) freshnessRuntime.ingestObservation(source.sourceId, {
      captureTimestampMs: 10_000 + index * 34,
      sequence: index + 1,
      coordinateSpace: 'metric-world', confidence: 0.98, landmarks: [landmark()],
    })
  }
  if (!freshnessRuntime.getSnapshot().evidence.researchReady) throw new Error('expected fresh measured sources')
  let staleNotificationReceived = false
  const unsubscribeBeforeExpiry = freshnessRuntime.subscribe(() => undefined)
  unsubscribeBeforeExpiry()
  await new Promise(resolve => setTimeout(resolve, 30))
  const unsubscribeAfterExpiry = freshnessRuntime.subscribe(snapshot => {
    if (!snapshot.evidence.researchReady) staleNotificationReceived = true
  })
  const staleSnapshot = freshnessRuntime.getSnapshot()
  unsubscribeAfterExpiry()
  if (staleSnapshot.evidence.researchReady || !staleNotificationReceived) {
    throw new Error('expected source staleness to publish a new non-research-ready revision')
  }

  const lossyRuntime = createMotionCaptureSessionRuntime({
    now: () => nowMs,
    idFactory: deterministicIds(),
  })
  const lossySource = lossyRuntime.registerSource({
    captureKind: 'landmark-stream',
    coordinateSpace: 'model-relative',
    clockDomain: 'session-monotonic',
  })
  lossyRuntime.ingestObservation(lossySource.sourceId, {
    captureTimestampMs: nowMs,
    sequence: 1,
    coordinateSpace: 'model-relative',
    confidence: 0,
    landmarks: [],
    missing: true,
  })
  lossyRuntime.ingestObservation(lossySource.sourceId, {
    captureTimestampMs: nowMs + 33,
    sequence: 4,
    coordinateSpace: 'model-relative',
    confidence: 0.9,
    landmarks: [landmark()],
  })
  const lossy = lossyRuntime.getSnapshot()
  if (lossy.sources[0]?.quality.missingSamples !== 1
    || lossy.sources[0]?.quality.droppedSequenceSamples !== 2
    || lossy.sources[0]?.quality.dropRate <= 0
    || !lossy.evidence.warnings.includes('capture-sample-loss-high')) {
    throw new Error('expected missing samples and sequence gaps to remain visible quality evidence')
  }

  nowMs = 2_000
  const boundedRuntime = createMotionCaptureSessionRuntime({
    now: () => nowMs,
    idFactory: deterministicIds(),
    limits: { maxRecordingSamples: 4 },
  })
  const boundedSource = boundedRuntime.registerSource({
    captureKind: 'video',
    coordinateSpace: 'model-relative',
    clockDomain: 'session-monotonic',
    dimensions: { width: 640, height: 480 },
  })
  boundedRuntime.startRecording()
  for (let index = 0; index < 6; index += 1) {
    nowMs += 33
    boundedRuntime.ingestObservation(boundedSource.sourceId, {
      captureTimestampMs: nowMs,
      sequence: index,
      coordinateSpace: 'model-relative',
      confidence: 0.91,
      landmarks: [landmark(index / 100)],
    })
  }
  boundedRuntime.stopRecording()
  const bounded = boundedRuntime.getSnapshot()
  if (bounded.recording.status !== 'stopped'
    || bounded.recording.sampleCount !== 4
    || bounded.recording.landmarkCount !== 4
    || bounded.recording.droppedByBudget !== 2
    || !bounded.evidence.warnings.includes('capture-recording-budget-reached')) {
    throw new Error(`expected explicit bounded local recording, got ${JSON.stringify(bounded.recording)}`)
  }
  const recording = boundedRuntime.readRecording()
  if (!recording || recording.samples.some(sample => 'frame' in sample || 'tensor' in sample)) {
    throw new Error('expected recording to retain only derived landmark and quality samples')
  }
  const firstJson = await buildMotionCaptureExport(recording, 'json')
  const secondJson = await boundedRuntime.exportRecording('json')
  const csv = await boundedRuntime.exportRecording('csv')
  if (firstJson.content !== secondJson.content
    || firstJson.sha256 !== secondJson.sha256
    || !/^[a-f0-9]{64}$/u.test(firstJson.sha256)
    || firstJson.byteLength !== new TextEncoder().encode(firstJson.content).byteLength
    || firstJson.sampleCount !== 4
    || firstJson.landmarkCount !== 4
    || firstJson.sourceCount !== 1
    || csv.sampleCount !== 4
    || !csv.content.startsWith('recording_schema,recording_id,session_id')
    || csv.content.split('\n').length !== 6) {
    throw new Error('expected deterministic JSON and tidy CSV exports with content-bound metadata')
  }
  const jsonPayload = JSON.parse(firstJson.content) as { samples?: unknown[] }
  if (!Array.isArray(jsonPayload.samples) || jsonPayload.samples.length !== 4) {
    throw new Error('expected deterministic export payload to retain bounded derived samples')
  }

  boundedRuntime.clearRecording()
  if (boundedRuntime.readRecording() !== null
    || boundedRuntime.getSnapshot().recording.status !== 'idle'
    || boundedRuntime.getSnapshot().recording.sampleCount !== 0) {
    throw new Error('expected explicit Clear to release the retained recording')
  }

  const lifecycleRuntime = createMotionCaptureSessionRuntime({
    now: () => nowMs,
    idFactory: deterministicIds(),
  })
  const lifecycleSource = lifecycleRuntime.registerSource({
    captureKind: 'landmark-stream',
    coordinateSpace: 'model-relative',
    clockDomain: 'session-monotonic',
  })
  lifecycleRuntime.startRecording()
  lifecycleRuntime.ingestObservation(lifecycleSource.sourceId, {
    captureTimestampMs: nowMs,
    sequence: 1,
    coordinateSpace: 'model-relative',
    confidence: 0.9,
    landmarks: [landmark()],
  })
  let peerSharingEnabled = true
  let cameraStopCount = 0
  let sourceReleaseNotified = false
  const unsubscribeLifecycle = lifecycleRuntime.subscribe((snapshot) => {
    if (!snapshot.sources.some(source => source.sourceId === lifecycleSource.sourceId)) sourceReleaseNotified = true
  })
  const teardown = createMotionCaptureXrLifecycleTeardown({
    readRecordingStatus: () => lifecycleRuntime.getSnapshot().recording.status,
    stopRecording: () => { lifecycleRuntime.stopRecording() },
    readPeerSharingEnabled: () => peerSharingEnabled,
    disablePeerSharing: () => { peerSharingEnabled = false },
    readCameraCaptureActive: () => false,
    stopCameraCapture: async () => { cameraStopCount += 1 },
    readRegisteredSourceCount: () => lifecycleRuntime.getSnapshot().sources.length,
    releaseRegisteredSources: () => { lifecycleRuntime.releaseAllSources() },
  })
  await teardown('XR capture surface closed.')
  unsubscribeLifecycle()
  const lifecycleRecording = lifecycleRuntime.getSnapshot().recording
  const lifecycleExport = await lifecycleRuntime.exportRecording('json')
  await expectFailure(() => lifecycleRuntime.ingestObservation(lifecycleSource.sourceId, {
    captureTimestampMs: nowMs, sequence: 2, coordinateSpace: 'model-relative', confidence: 0.9, landmarks: [landmark()],
  }), 'motion-capture-source-not-found')
  if (lifecycleRecording.status !== 'stopped'
    || lifecycleRecording.sampleCount !== 1
    || peerSharingEnabled
    || cameraStopCount !== 0
    || !sourceReleaseNotified
    || lifecycleRuntime.getSnapshot().sources.length !== 0
    || lifecycleExport.sampleCount !== 1) {
    throw new Error('expected XR exit to finish and retain recording, disable sharing, and tolerate an already-off camera')
  }

  const providerHandle = motionCaptureProviderApi.connect({
    providerId: 'test-provider', label: 'Test provider', transport: 'host-bridge',
  })
  const externalProvider = providerHandle.registerSource({
    captureKind: 'landmark-stream', coordinateSpace: 'model-relative', clockDomain: 'session-monotonic',
  })
  try {
    await expectFailure(() => providerHandle.ingestObservation('unowned-source', {
      captureTimestampMs: nowMs, sequence: 1, coordinateSpace: 'model-relative', confidence: 1, landmarks: [landmark()],
    }), 'motion-capture-provider-source-not-owned')
    if (!startMotionControlCapturePlatformSource()) throw new Error('expected the built-in source to coexist with a provider source')
    motionCaptureSessionRuntime.startRecording()
    stopMotionControlCapturePlatformSource({ releaseRegisteredSources: false })
    if (!motionCaptureSessionRuntime.getSnapshot().sources.some(source => source.sourceId === externalProvider.sourceId)
      || inspectMotionControlCapturePlatform().bridge.builtInSourceActive
      || inspectMotionControlCapturePlatform().bridge.providerApi.schema !== MOTION_CAPTURE_PROVIDER_API_SCHEMA
      || inspectMotionControlCapturePlatform().bridge.providerApi.connectedProviderCount !== 1
      || motionCaptureSessionRuntime.getSnapshot().recording.status !== 'recording') {
      throw new Error('expected a capability-scoped provider source to survive built-in source teardown')
    }
  } finally {
    stopMotionControlCapturePlatformSource({ releaseRegisteredSources: false })
    if (motionCaptureSessionRuntime.getSnapshot().recording.status === 'recording') motionCaptureSessionRuntime.stopRecording()
    motionCaptureSessionRuntime.clearRecording()
    if (motionCaptureProviderApi.inspect().providers.some(provider => provider.providerId === 'test-provider')) {
      providerHandle.disconnect()
    }
  }

  const existingSingletonSourceIds = new Set(
    motionCaptureSessionRuntime.getSnapshot().sources.map(source => source.sourceId),
  )
  const fillerSourceIds: string[] = []
  try {
    while (motionCaptureSessionRuntime.getSnapshot().sources.length < MOTION_CAPTURE_DEFAULT_LIMITS.maxSources) {
      const filler = motionCaptureSessionRuntime.registerSource({
        captureKind: 'landmark-stream',
        coordinateSpace: 'model-relative',
        clockDomain: 'session-monotonic',
      })
      fillerSourceIds.push(filler.sourceId)
    }
    if (startMotionControlCapturePlatformSource()
      || !inspectMotionControlCapturePlatform().bridge.lastError.includes('source-budget-exceeded')) {
      throw new Error('expected built-in source registration failure to be explicit instead of silently degraded')
    }
  } finally {
    for (const sourceId of fillerSourceIds) {
      if (!existingSingletonSourceIds.has(sourceId)
        && motionCaptureSessionRuntime.getSnapshot().sources.some(source => source.sourceId === sourceId)) {
        motionCaptureSessionRuntime.removeSource(sourceId)
      }
    }
  }
}
