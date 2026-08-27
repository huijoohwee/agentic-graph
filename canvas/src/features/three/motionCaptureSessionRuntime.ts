import {
  MOTION_CAPTURE_MAX_TIME_MS,
  MOTION_CAPTURE_PLATFORM_SCHEMA,
  MOTION_CAPTURE_RECORDING_SCHEMA,
  createMotionCaptureCalibration,
  createMotionCaptureClockAlignment,
  evaluateMotionCaptureSessionEvidence,
  isMotionCaptureSha256,
  type MotionCaptureCalibrationInput,
  type MotionCaptureClockAlignmentInput,
  type MotionCaptureExportArtifact,
  type MotionCaptureExportFormat,
  type MotionCaptureObservationInput,
  type MotionCaptureRecordedSample,
  type MotionCaptureRecording,
  type MotionCaptureSessionSnapshot,
  type MotionCaptureSharedReconstructionEvidence,
  type MotionCaptureSharedReconstructionInput,
  type MotionCaptureSourceRegistration,
  type MotionCaptureSourceState,
} from './motionCapturePlatformContract'
import { buildMotionCaptureExport } from './motionCaptureExport'
import {
  assertStrictRecord,
  boundedNumber,
  finiteNumber,
  integerNumber,
  STRICT_INPUT_KEYS,
} from './motionCaptureInputValidation'
import { mergeMotionCaptureLimits } from './motionCaptureRuntimeConfiguration'
import { motionCapturePlatformTeardownActive } from './motionCaptureLifecycleGate'
import {
  createMutableMotionCaptureSourceQuality,
  freezeMotionCaptureSourceQuality,
  resetMotionCaptureSourceResearchEvidence,
  type MutableMotionCaptureSource,
} from './motionCaptureSourceQualityRuntime'
import {
  buildMotionCaptureResearchEvidenceEpoch,
  freezeMotionCaptureSourceRejections,
  recordMotionCaptureSourceRejection,
  type MutableMotionCaptureSourceRejections,
} from './motionCaptureResearchEpochRuntime'
import {
  buildMotionCaptureResearchEvidenceBinding,
  validateMotionCaptureResearchEvidenceManifest,
  type MotionCaptureResearchEvidenceManifest,
  type ValidatedMotionCaptureResearchEvidence,
} from './motionCaptureResearchEvidence'
import {
  createMotionCaptureOpaqueId,
  defaultMotionCaptureIdFactory,
  freezeMotionCaptureLandmarks,
  validateMotionCaptureRuntimeOptions,
} from './motionCaptureSessionPrimitives'
import type {
  MotionCaptureRuntimeListener,
  MotionCaptureSessionRuntime,
  MotionCaptureSessionRuntimeOptions,
} from './motionCaptureSessionTypes'
export type { MotionCaptureSessionRuntime, MotionCaptureSessionRuntimeOptions } from './motionCaptureSessionTypes'
export function createMotionCaptureSessionRuntime(
  options: MotionCaptureSessionRuntimeOptions = {},
): MotionCaptureSessionRuntime {
  validateMotionCaptureRuntimeOptions(options)
  const now = options.now || Date.now
  const idFactory = options.idFactory || defaultMotionCaptureIdFactory
  const limits = mergeMotionCaptureLimits(options.limits)
  const readNow = (): number => boundedNumber(now(), 'runtime-time', 0, MOTION_CAPTURE_MAX_TIME_MS)
  const sessionId = createMotionCaptureOpaqueId('session', idFactory)
  const sources = new Map<string, MutableMotionCaptureSource>()
  const listeners = new Set<MotionCaptureRuntimeListener>()
  let freshnessTimer: ReturnType<typeof setTimeout> | null = null
  let lastEvidenceSignature = ''
  let revision = 0
  let sharedReconstruction: MotionCaptureSharedReconstructionEvidence | null = null
  let activeResearchEvidence: ValidatedMotionCaptureResearchEvidence | null = null
  let recordingRevision = 0
  let recordingStatus: 'idle' | 'recording' | 'stopped' = 'idle'
  let recordingId: string | null = null
  let recordingStartedAtMs: number | null = null
  let recordingFinishedAtMs: number | null = null
  let recordedLandmarkCount = 0
  let droppedByBudget = 0
  const sourceRejections: MutableMotionCaptureSourceRejections = new Map()
  const recordingResearchEvidenceManifests = new Map<string, MotionCaptureResearchEvidenceManifest>()
  let recordedSamples: MotionCaptureRecordedSample[] = []

  const sourceStates = (): readonly MotionCaptureSourceState[] => Object.freeze(
    [...sources.values()].map(source => source.state).sort((left, right) => left.sourceId.localeCompare(right.sourceId)),
  )

  const getSnapshot = (): MotionCaptureSessionSnapshot => {
    const states = sourceStates()
    const evidence = evaluateMotionCaptureSessionEvidence(states, sharedReconstruction, readNow(), limits).evidence
    const warnings = droppedByBudget > 0 && !evidence.warnings.includes('capture-recording-budget-reached')
      ? Object.freeze([...evidence.warnings, 'capture-recording-budget-reached'])
      : evidence.warnings
    return Object.freeze({
      schema: MOTION_CAPTURE_PLATFORM_SCHEMA,
      sessionId,
      revision,
      sources: states,
      evidence: warnings === evidence.warnings ? evidence : Object.freeze({ ...evidence, warnings }),
      recording: Object.freeze({
        status: recordingStatus,
        recordingId,
        startedAtMs: recordingStartedAtMs,
        finishedAtMs: recordingFinishedAtMs,
        sampleCount: recordedSamples.length,
        landmarkCount: recordedLandmarkCount,
        droppedByBudget,
        maxSamples: limits.maxRecordingSamples,
      }),
    })
  }

  function scheduleFreshnessExpiry(): void {
    if (freshnessTimer !== null) clearTimeout(freshnessTimer)
    freshnessTimer = null
    if (listeners.size === 0) return
    const currentTime = readNow()
    const expiries = [...sources.values()].flatMap(source => source.state.latestObservation
      ? [source.state.latestObservation.receivedAtMs + limits.maxSampleStalenessMs + 1]
      : []).filter(expiry => expiry > currentTime)
    if (expiries.length === 0) return
    freshnessTimer = setTimeout(() => {
      freshnessTimer = null
      notify()
    }, Math.max(0, Math.min(...expiries) - currentTime))
  }

  function notify(): MotionCaptureSessionSnapshot {
    revision += 1
    const snapshot = getSnapshot()
    lastEvidenceSignature = JSON.stringify(snapshot.evidence)
    for (const listener of [...listeners]) {
      try {
        listener(snapshot)
      } catch (error) {
        console.error('[agenticgraph] motion capture session listener failed', error)
      }
    }
    scheduleFreshnessExpiry()
    return snapshot
  }

  const getSource = (sourceId: string): MutableMotionCaptureSource => {
    const source = sources.get(sourceId)
    if (!source) throw new Error('motion-capture-source-not-found')
    return source
  }

  const replaceSourceState = (source: MutableMotionCaptureSource, patch: Partial<MotionCaptureSourceState>): MotionCaptureSourceState => {
    source.state = Object.freeze({ ...source.state, ...patch })
    notify()
    return source.state
  }

  const resetSourceResearchEvidenceCohort = (source: MutableMotionCaptureSource): void => {
    const bound = sharedReconstruction?.sourceBindings.some(binding => binding.sourceId === source.state.sourceId)
    const sourceIds = bound ? sharedReconstruction!.sourceBindings.map(binding => binding.sourceId) : [source.state.sourceId]
    sourceIds.forEach(sourceId => resetMotionCaptureSourceResearchEvidence(getSource(sourceId)))
  }

  const invalidateActiveResearchEvidence = (): void => {
    activeResearchEvidence = null
  }

  const registerSource = (input: MotionCaptureSourceRegistration): MotionCaptureSourceState => {
    if (motionCapturePlatformTeardownActive()) throw new Error('motion-capture-platform-teardown-active')
    assertStrictRecord(input, STRICT_INPUT_KEYS.sourceRegistration, 'source-registration')
    if (sources.size >= limits.maxSources) throw new Error('motion-capture-source-budget-exceeded')
    if (!['video', 'depth', 'landmark-stream', 'peer-derived'].includes(input.captureKind)
      || !['normalized-image', 'model-relative', 'metric-world'].includes(input.coordinateSpace)
      || !['session-monotonic', 'source-local'].includes(input.clockDomain)) {
      throw new Error('motion-capture-invalid-source-registration')
    }
    if (input.dimensions !== undefined) assertStrictRecord(input.dimensions, STRICT_INPUT_KEYS.sourceDimensions, 'source-dimensions')
    const dimensions = input.dimensions === undefined
      ? null
      : Object.freeze({
        width: integerNumber(input.dimensions.width, 'source-width', 1, 32_768),
        height: integerNumber(input.dimensions.height, 'source-height', 1, 32_768),
      })
    const nominalFps = input.nominalFps === undefined
      ? null
      : boundedNumber(input.nominalFps, 'source-fps', 0.1, 1_000)
    const sourceId = createMotionCaptureOpaqueId('source', idFactory)
    if (sources.has(sourceId)) throw new Error('motion-capture-duplicate-opaque-id')
    const quality = createMutableMotionCaptureSourceQuality()
    const state: MotionCaptureSourceState = Object.freeze({
      sourceId,
      captureKind: input.captureKind,
      coordinateSpace: input.coordinateSpace,
      clockDomain: input.clockDomain,
      dimensions,
      nominalFps,
      clockAlignment: createMotionCaptureClockAlignment(input.clockDomain),
      calibration: createMotionCaptureCalibration(input.coordinateSpace),
      quality: freezeMotionCaptureSourceQuality(quality),
      latestObservation: null,
    })
    sources.set(sourceId, {
      state, quality, previousCaptureTimestampMs: null, previousSequence: null, researchEvidenceEpoch: 0,
    })
    notify()
    return state
  }

  const removeSource = (sourceId: string): MotionCaptureSessionSnapshot => {
    if (!sources.delete(sourceId)) throw new Error('motion-capture-source-not-found')
    if (sharedReconstruction?.sourceBindings.some(binding => binding.sourceId === sourceId)) sharedReconstruction = null
    invalidateActiveResearchEvidence()
    return notify()
  }

  const releaseAllSources = (): MotionCaptureSessionSnapshot => {
    if (sources.size === 0) return getSnapshot()
    sources.clear()
    sharedReconstruction = null
    invalidateActiveResearchEvidence()
    return notify()
  }

  const setSourceClockAlignment = (
    sourceId: string,
    input: MotionCaptureClockAlignmentInput,
  ): MotionCaptureSourceState => {
    assertStrictRecord(input, STRICT_INPUT_KEYS.clockAlignment, 'clock-alignment')
    const source = getSource(sourceId)
    if (source.state.clockDomain !== 'source-local') throw new Error('motion-capture-session-clock-is-canonical')
    if (!isMotionCaptureSha256(input.evidenceDigestSha256)) throw new Error('motion-capture-invalid-clock-evidence')
    const measuredAtMs = finiteNumber(input.measuredAtMs, 'clock-measured-at', 0)
    if (measuredAtMs > readNow()) throw new Error('motion-capture-invalid-clock-evidence')
    const clockAlignment = Object.freeze({
      status: 'aligned' as const,
      offsetMs: boundedNumber(input.offsetMs, 'clock-offset', -MOTION_CAPTURE_MAX_TIME_MS, MOTION_CAPTURE_MAX_TIME_MS),
      uncertaintyMs: finiteNumber(input.uncertaintyMs, 'clock-uncertainty', 0),
      measuredAtMs,
      evidenceDigestSha256: input.evidenceDigestSha256,
      provenance: 'measured-alignment' as const,
      researchManifestDigestSha256: null,
    })
    invalidateActiveResearchEvidence()
    resetSourceResearchEvidenceCohort(source)
    return replaceSourceState(source, { clockAlignment })
  }

  const setSourceCalibration = (
    sourceId: string,
    input: MotionCaptureCalibrationInput,
  ): MotionCaptureSourceState => {
    assertStrictRecord(input, STRICT_INPUT_KEYS.calibration, 'calibration')
    if (input.provenance !== undefined) {
      assertStrictRecord(input.provenance, STRICT_INPUT_KEYS.calibrationProvenance, 'calibration-provenance')
    }
    const source = getSource(sourceId)
    if (input.coordinateSpace !== source.state.coordinateSpace) {
      throw new Error('motion-capture-calibration-coordinate-space-mismatch')
    }
    if (input.status === 'calibrated' && !input.provenance) {
      throw new Error('motion-capture-calibration-provenance-required')
    }
    if (!['uncalibrated', 'calibrating', 'calibrated', 'invalid'].includes(input.status)
      || (input.provenance && !['operator-verified', 'measured', 'imported'].includes(input.provenance.kind))) {
      throw new Error('motion-capture-invalid-calibration-state')
    }
    if (input.provenance && (!isMotionCaptureSha256(input.provenance.evidenceDigestSha256)
      || !Number.isFinite(input.provenance.measuredAtMs)
      || input.provenance.measuredAtMs < 0
      || input.provenance.measuredAtMs > MOTION_CAPTURE_MAX_TIME_MS
      || input.provenance.measuredAtMs > readNow())) {
      throw new Error('motion-capture-invalid-calibration-provenance')
    }
    const reprojectionErrorPx = input.reprojectionErrorPx === undefined || input.reprojectionErrorPx === null
      ? null
      : finiteNumber(input.reprojectionErrorPx, 'calibration-error', 0)
    const calibration = Object.freeze({
      status: input.status,
      coordinateSpace: input.coordinateSpace,
      provenance: input.provenance ? Object.freeze({
        kind: input.provenance.kind,
        measuredAtMs: input.provenance.measuredAtMs,
        evidenceDigestSha256: input.provenance.evidenceDigestSha256,
      }) : null,
      reprojectionErrorPx,
      researchValidation: null,
    })
    if (sharedReconstruction?.sourceBindings.some(binding => binding.sourceId === sourceId)) sharedReconstruction = null
    invalidateActiveResearchEvidence()
    resetMotionCaptureSourceResearchEvidence(source)
    return replaceSourceState(source, { calibration })
  }

  const setSharedReconstructionEvidence = (
    input: MotionCaptureSharedReconstructionInput,
  ): MotionCaptureSessionSnapshot => {
    assertStrictRecord(input, STRICT_INPUT_KEYS.sharedReconstruction, 'shared-reconstruction')
    if (!Array.isArray(input.sourceIds)) throw new Error('motion-capture-invalid-shared-reconstruction-shape')
    const sourceIds = [...new Set(input.sourceIds)].sort()
    const measuredAtMs = finiteNumber(input.measuredAtMs, 'reconstruction-measured-at', 0)
    if (input.method !== 'measured'
      || sourceIds.length !== input.sourceIds.length
      || sourceIds.length < 2
      || sourceIds.length > limits.maxSources
      || measuredAtMs > readNow()
      || !isMotionCaptureSha256(input.evidenceDigestSha256)) {
      throw new Error('motion-capture-invalid-shared-reconstruction-evidence')
    }
    const sourceBindings = sourceIds.map((sourceId) => {
      const calibration = getSource(sourceId).state.calibration
      const provenance = calibration.provenance
      if (calibration.status !== 'calibrated'
        || calibration.coordinateSpace !== 'metric-world'
        || provenance?.kind !== 'measured'
        || provenance.measuredAtMs > measuredAtMs
        || !isMotionCaptureSha256(provenance.evidenceDigestSha256)
        || provenance.evidenceDigestSha256 === input.evidenceDigestSha256) {
        throw new Error('motion-capture-shared-reconstruction-source-unqualified')
      }
      return Object.freeze({
        sourceId,
        calibrationEvidenceDigestSha256: provenance.evidenceDigestSha256,
      })
    })
    const nextSharedReconstruction = Object.freeze({
      reconstructionId: createMotionCaptureOpaqueId('reconstruction', idFactory),
      referenceFrame: 'shared-metric-session' as const,
      coordinateSpace: 'metric-world' as const,
      method: 'measured' as const,
      measuredAtMs,
      evidenceDigestSha256: input.evidenceDigestSha256,
      researchValidation: null,
      sourceBindings: Object.freeze(sourceBindings),
    })
    sourceIds.forEach(sourceId => resetMotionCaptureSourceResearchEvidence(getSource(sourceId)))
    sharedReconstruction = nextSharedReconstruction
    invalidateActiveResearchEvidence()
    return notify()
  }

  const clearSharedReconstructionEvidence = (): MotionCaptureSessionSnapshot => {
    if (!sharedReconstruction) return getSnapshot()
    const sourceIds = sharedReconstruction.sourceBindings.map(binding => binding.sourceId)
    sharedReconstruction = null
    invalidateActiveResearchEvidence()
    sourceIds.forEach(sourceId => resetMotionCaptureSourceResearchEvidence(getSource(sourceId)))
    return notify()
  }

  const applyResearchEvidenceManifest = async (input: unknown): Promise<MotionCaptureSessionSnapshot> => {
    if (motionCapturePlatformTeardownActive()) throw new Error('motion-capture-platform-teardown-active')
    if (recordingStatus === 'recording') throw new Error('motion-capture-research-evidence-recording-active')
    const evidenceFence = revision
    const validated = await validateMotionCaptureResearchEvidenceManifest(input, {
      sources: sourceStates(), limits, nowMs: readNow(),
    })
    if (revision !== evidenceFence) throw new Error('motion-capture-research-evidence-invalidated')
    const binding = buildMotionCaptureResearchEvidenceBinding(
      validated, createMotionCaptureOpaqueId('reconstruction', idFactory),
    )
    binding.sourcePatches.forEach((patch) => {
      const source = getSource(patch.sourceId)
      resetMotionCaptureSourceResearchEvidence(source)
      source.state = Object.freeze({
        ...source.state,
        clockAlignment: patch.clockAlignment,
        calibration: patch.calibration,
      })
    })
    sharedReconstruction = binding.sharedReconstruction
    activeResearchEvidence = validated
    return notify()
  }

  const ingestObservation = (
    sourceId: string,
    input: MotionCaptureObservationInput,
  ): MotionCaptureSessionSnapshot => {
    assertStrictRecord(input, STRICT_INPUT_KEYS.observation, 'observation')
    if (input.missing !== undefined && typeof input.missing !== 'boolean') {
      throw new Error('motion-capture-invalid-observation-shape')
    }
    const source = getSource(sourceId)
    if (input.coordinateSpace !== source.state.coordinateSpace) {
      throw new Error('motion-capture-observation-coordinate-space-mismatch')
    }
    const captureTimestampMs = boundedNumber(input.captureTimestampMs, 'capture-timestamp', 0, MOTION_CAPTURE_MAX_TIME_MS)
    const receivedAtMs = readNow()
    const sequence = input.sequence === undefined
      ? null
      : integerNumber(input.sequence, 'sequence', 0, Number.MAX_SAFE_INTEGER)
    const missing = input.missing === true
    const landmarks = freezeMotionCaptureLandmarks(input.landmarks, limits.maxLandmarksPerObservation)
    if (missing !== (landmarks.length === 0)) throw new Error('motion-capture-missing-sample-shape-mismatch')
    const confidence = boundedNumber(input.confidence, 'confidence', 0, 1)
    const researchLandmarkCount = landmarks.filter(landmark => (
      landmark.visibility >= limits.minimumLandmarkVisibility
      && landmark.presence >= limits.minimumLandmarkPresence
    )).length
    const researchEvidenceQualified = !missing
      && confidence >= limits.minimumObservationConfidence
      && researchLandmarkCount / landmarks.length >= limits.minimumLandmarkEvidenceRatio
    const alignedTimestampMs = source.state.clockAlignment.status === 'aligned'
      ? boundedNumber(captureTimestampMs + (source.state.clockAlignment.offsetMs || 0), 'aligned-timestamp', 0, MOTION_CAPTURE_MAX_TIME_MS)
      : null
    source.quality.receivedSamples += 1
    if (sequence === null) source.quality.unsequencedSamples += 1
    const outOfOrder = (source.previousCaptureTimestampMs !== null && captureTimestampMs <= source.previousCaptureTimestampMs)
      || (sequence !== null && source.previousSequence !== null && sequence <= source.previousSequence)
    if (outOfOrder) {
      source.quality.outOfOrderSamples += 1
      if (recordingStatus === 'recording') {
        const evaluation = evaluateMotionCaptureSessionEvidence(sourceStates(), sharedReconstruction, readNow(), limits)
        const epoch = buildMotionCaptureResearchEvidenceEpoch(
          evaluation.researchSourceIds,
          researchSourceId => getSource(researchSourceId).researchEvidenceEpoch,
        )
        recordMotionCaptureSourceRejection(sourceRejections, sourceId, epoch)
      }
      source.state = Object.freeze({ ...source.state, quality: freezeMotionCaptureSourceQuality(source.quality) })
      return notify()
    }
    if (sequence !== null && source.previousSequence !== null && sequence > source.previousSequence + 1) {
      source.quality.droppedSequenceSamples += sequence - source.previousSequence - 1
    }
    if (source.previousCaptureTimestampMs !== null) {
      const interval = captureTimestampMs - source.previousCaptureTimestampMs
      source.quality.intervalCount += 1
      const delta = interval - source.quality.intervalMeanMs
      source.quality.intervalMeanMs += delta / source.quality.intervalCount
      source.quality.intervalM2 += delta * (interval - source.quality.intervalMeanMs)
    }
    source.previousCaptureTimestampMs = captureTimestampMs
    if (sequence !== null) source.previousSequence = sequence
    if (missing) source.quality.missingSamples += 1
    else {
      source.quality.usableSamples += 1
      if (researchEvidenceQualified) {
        source.quality.researchUsableSamples += 1
        const researchTimestampMs = alignedTimestampMs ?? captureTimestampMs
        source.quality.firstResearchTimestampMs ??= researchTimestampMs
        source.quality.lastResearchTimestampMs = researchTimestampMs
      }
      else source.quality.lowEvidenceSamples += 1
    }
    const quality = freezeMotionCaptureSourceQuality(source.quality)
    source.state = Object.freeze({
      ...source.state,
      quality,
      latestObservation: Object.freeze({
        captureTimestampMs,
        alignedTimestampMs,
        receivedAtMs,
        sequence,
        coordinateSpace: input.coordinateSpace,
        confidence,
        landmarkCount: landmarks.length,
        missing,
      }),
    })
    const evaluation = evaluateMotionCaptureSessionEvidence(sourceStates(), sharedReconstruction, readNow(), limits)
    const researchEvidenceEpoch = buildMotionCaptureResearchEvidenceEpoch(
      evaluation.researchSourceIds,
      researchSourceId => getSource(researchSourceId).researchEvidenceEpoch,
    )
    if (recordingStatus === 'recording') {
      if (recordedSamples.length >= limits.maxRecordingSamples) droppedByBudget += 1
      else {
        recordedSamples.push(Object.freeze({
          ordinal: recordedSamples.length,
          sourceId,
          captureTimestampMs,
          alignedTimestampMs,
          receivedAtMs,
          sequence,
          coordinateSpace: input.coordinateSpace,
          confidence,
          missing,
          landmarks,
          sourceQuality: quality,
          sessionEvidence: evaluation.evidence,
          sharedReconstructionId: evaluation.sharedReconstructionId,
          researchSourceIds: evaluation.researchSourceIds,
          researchEvidenceEpoch,
          researchManifestDigestSha256: activeResearchEvidence?.manifestDigestSha256 || null,
        }))
        if (activeResearchEvidence) {
          recordingResearchEvidenceManifests.set(
            activeResearchEvidence.manifestDigestSha256, activeResearchEvidence.manifest,
          )
        }
        recordedLandmarkCount += landmarks.length
      }
    }
    return notify()
  }

  const startRecording = (): MotionCaptureSessionSnapshot => {
    if (motionCapturePlatformTeardownActive()) throw new Error('motion-capture-platform-teardown-active')
    if (recordingStatus === 'recording') return getSnapshot()
    if (recordingStatus === 'stopped') throw new Error('motion-capture-recording-must-be-cleared')
    if (sources.size === 0) throw new Error('motion-capture-recording-source-required')
    recordingStatus = 'recording'
    recordingRevision += 1
    recordingId = createMotionCaptureOpaqueId('recording', idFactory)
    recordingStartedAtMs = readNow()
    recordingFinishedAtMs = null
    sourceRejections.clear()
    recordingResearchEvidenceManifests.clear()
    if (activeResearchEvidence) {
      recordingResearchEvidenceManifests.set(activeResearchEvidence.manifestDigestSha256, activeResearchEvidence.manifest)
    }
    return notify()
  }

  const stopRecording = (): MotionCaptureSessionSnapshot => {
    if (recordingStatus !== 'recording') return getSnapshot()
    recordingStatus = 'stopped'
    recordingRevision += 1
    recordingFinishedAtMs = boundedNumber(readNow(), 'recording-finished-at', recordingStartedAtMs || 0, MOTION_CAPTURE_MAX_TIME_MS)
    return notify()
  }

  const clearRecording = (): MotionCaptureSessionSnapshot => {
    if (recordingStatus === 'idle' && recordedSamples.length === 0) return getSnapshot()
    recordingStatus = 'idle'
    recordingRevision += 1
    recordingId = null
    recordingStartedAtMs = null
    recordingFinishedAtMs = null
    recordedLandmarkCount = 0
    droppedByBudget = 0
    sourceRejections.clear()
    recordingResearchEvidenceManifests.clear()
    recordedSamples = []
    return notify()
  }
  const readRecording = (): MotionCaptureRecording | null => {
    if (recordingStatus === 'idle' || !recordingId || recordingStartedAtMs === null) return null
    return Object.freeze({
      schema: MOTION_CAPTURE_RECORDING_SCHEMA,
      recordingId,
      sessionId,
      status: recordingStatus,
      startedAtMs: recordingStartedAtMs,
      finishedAtMs: recordingFinishedAtMs,
      droppedByBudget,
      researchLimits: limits,
      sourceRejections: freezeMotionCaptureSourceRejections(sourceRejections),
      researchEvidenceManifests: Object.freeze([...recordingResearchEvidenceManifests.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([, manifest]) => manifest)),
      samples: Object.freeze([...recordedSamples]),
    })
  }
  const exportRecording = async (format: MotionCaptureExportFormat): Promise<MotionCaptureExportArtifact> => {
    const recording = readRecording()
    if (!recording || recording.status !== 'stopped') throw new Error('motion-capture-recording-not-finished')
    const exportFence = recordingRevision
    const artifact = await buildMotionCaptureExport(recording, format)
    if (recordingRevision !== exportFence || recordingId !== recording.recordingId || recordingStatus !== 'stopped') {
      throw new Error('motion-capture-export-invalidated')
    }
    return artifact
  }

  return Object.freeze({
    getSnapshot,
    subscribe: (listener: MotionCaptureRuntimeListener) => {
      listeners.add(listener)
      if (lastEvidenceSignature !== JSON.stringify(getSnapshot().evidence)) notify()
      else scheduleFreshnessExpiry()
      return () => {
        listeners.delete(listener)
        if (listeners.size === 0 && freshnessTimer !== null) clearTimeout(freshnessTimer)
        if (listeners.size === 0) freshnessTimer = null
      }
    },
    registerSource,
    removeSource,
    releaseAllSources,
    setSourceClockAlignment,
    setSourceCalibration,
    setSharedReconstructionEvidence,
    clearSharedReconstructionEvidence,
    applyResearchEvidenceManifest,
    ingestObservation,
    startRecording,
    stopRecording,
    clearRecording,
    readRecording,
    exportRecording,
  })
}
export const motionCaptureSessionRuntime = createMotionCaptureSessionRuntime()
export const readMotionCaptureSessionSnapshot = (): MotionCaptureSessionSnapshot => motionCaptureSessionRuntime.getSnapshot()
export const subscribeMotionCaptureSession = (listener: MotionCaptureRuntimeListener): (() => void) => motionCaptureSessionRuntime.subscribe(listener)
