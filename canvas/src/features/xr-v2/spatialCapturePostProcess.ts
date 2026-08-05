import {
  XR_V2_CONTRACT_VERSION,
  type XrV2CaptureFallback,
} from './captureContracts'

export const XR_V2_FLAT_CAPTURE_ASSET_SCHEMA =
  'knowgrph-xr-flat-capture-asset/v2' as const
export const XR_V2_POST_PROCESS_QUEUE_RECORD_SCHEMA =
  'knowgrph-xr-post-process-queue-record/v2' as const
export const XR_V2_CAPTURE_FALLBACK_BUNDLE_SCHEMA =
  'knowgrph-xr-capture-fallback-bundle/v2' as const

export const XR_V2_MAX_CAPTURE_RECORD_ID_LENGTH = 160
export const XR_V2_MAX_CAPTURE_REFERENCE_LENGTH = 2_048
export const XR_V2_MAX_RAW_CAPTURE_BYTES = 8 * 1024 * 1024 * 1024
export const XR_V2_MAX_ATOMIC_FALLBACK_IN_FLIGHT = 32
export const XR_V2_MAX_FALLBACK_CANONICAL_BYTES = 16_384

const IDENTIFIER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/
const SHA_256_PATTERN = /^[0-9a-f]{64}$/
const URI_SCHEME_PATTERN = /^[a-z][a-z0-9+.-]*:\/\//i
const EPHEMERAL_REFERENCE_PATTERN = /^(?:blob|data|memory|workspace):/i

export type XrV2PostProcessExecutorState =
  | Readonly<{
      state: 'blocked'
      reason: 'no-admitted-depth-model'
      admittedModel: null
    }>
  | Readonly<{
      state: 'awaiting-executor'
      reason: null
      admittedModel: XrV2AdmittedDepthModel
    }>

export type XrV2AdmittedDepthModel = Readonly<{
  modelId: string
  revision: string
  sha256: string
  sameOriginPath: string
}>

export type XrV2FlatCaptureAssetRecord = Readonly<{
  schema: typeof XR_V2_FLAT_CAPTURE_ASSET_SCHEMA
  contractVersion: typeof XR_V2_CONTRACT_VERSION
  assetId: string
  sessionId: string
  kind: 'flat-video-capture'
  xrCapabilityTier: 'flat-fallback'
  synthesisMode: 'none'
  rawClipRef: string
  rawClipMimeType: string
  rawClipByteLength: number
  depthMetadataRef: string
  createdAtMs: number
  playbackEvidence: 'not-observed'
  depthSynthesisEvidence: 'not-observed'
}>

export type XrV2PostProcessQueueRecord = Readonly<{
  schema: typeof XR_V2_POST_PROCESS_QUEUE_RECORD_SCHEMA
  contractVersion: typeof XR_V2_CONTRACT_VERSION
  jobId: string
  sessionId: string
  flatAssetId: string
  status: 'queued'
  queuedAtMs: number
  maxAttempts: 1
  rawClipRef: string
  depthMetadataRef: string
  fallback: XrV2CaptureFallback
  executor: XrV2PostProcessExecutorState
  depthSynthesisEvidence: 'not-observed'
}>

export type XrV2CaptureFallbackBundle = Readonly<{
  schema: typeof XR_V2_CAPTURE_FALLBACK_BUNDLE_SCHEMA
  contractVersion: typeof XR_V2_CONTRACT_VERSION
  idempotencyKey: string
  flatAsset: XrV2FlatCaptureAssetRecord
  queuedJob: XrV2PostProcessQueueRecord
}>

export type XrV2PrepareCaptureFallbackInput = Readonly<{
  idempotencyKey: string
  sessionId: string
  flatAssetId: string
  jobId: string
  rawClipRef: string
  rawClipMimeType: string
  rawClipByteLength: number
  depthMetadataRef: string
  queuedAtMs: number
  fallback: XrV2CaptureFallback
  admittedDepthModel?: XrV2AdmittedDepthModel | null
}>

export type XrV2AtomicCaptureFallbackCommit = Readonly<{
  idempotencyKey: string
  canonicalPayload: string
  flatAsset: XrV2FlatCaptureAssetRecord
  queuedJob: XrV2PostProcessQueueRecord
}>

export type XrV2AtomicCaptureFallbackCommitResult = Readonly<{
  outcome: 'inserted' | 'existing'
  idempotencyKey: string
  canonicalPayload: string
}>

/**
 * This is deliberately one storage operation. Implementations must compare the
 * idempotency key and canonical payload and insert both records, or neither.
 */
export type XrV2AtomicCaptureFallbackPersistence = Readonly<{
  putFlatAssetAndQueuedJobAtomically: (
    commit: XrV2AtomicCaptureFallbackCommit,
  ) => Promise<XrV2AtomicCaptureFallbackCommitResult>
}>

export type XrV2PersistedCaptureFallback = Readonly<{
  outcome: 'inserted' | 'existing'
  bundle: XrV2CaptureFallbackBundle
}>

export type XrV2CaptureFallbackPersister = Readonly<{
  persist: (
    input: XrV2PrepareCaptureFallbackInput,
  ) => Promise<XrV2PersistedCaptureFallback>
  readInFlightCount: () => number
}>

function assertBoundedIdentifier(label: string, value: string): string {
  const normalized = String(value || '').trim()
  if (
    !normalized
    || normalized.length > XR_V2_MAX_CAPTURE_RECORD_ID_LENGTH
    || !IDENTIFIER_PATTERN.test(normalized)
  ) {
    throw new Error(`${label} must be a bounded portable identifier`)
  }
  return normalized
}

function assertDurableReference(label: string, value: string): string {
  const normalized = String(value || '').trim()
  if (
    !normalized
    || normalized.length > XR_V2_MAX_CAPTURE_REFERENCE_LENGTH
    || !URI_SCHEME_PATTERN.test(normalized)
    || EPHEMERAL_REFERENCE_PATTERN.test(normalized)
  ) {
    throw new Error(`${label} must be a bounded durable asset reference`)
  }
  return normalized
}

function assertTimestamp(label: string, value: number): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative safe integer`)
  }
  return value
}

function normalizeFallback(fallback: XrV2CaptureFallback): XrV2CaptureFallback {
  const triggeredAtFrameIndex = fallback?.triggeredAtFrameIndex
  if (!Number.isSafeInteger(triggeredAtFrameIndex) || triggeredAtFrameIndex < 0) {
    throw new Error('fallback.triggeredAtFrameIndex must be a non-negative safe integer')
  }
  if (!Number.isFinite(fallback.observedDurationMs) || fallback.observedDurationMs < 0) {
    throw new Error('fallback.observedDurationMs must be a non-negative finite number')
  }
  if (fallback.reason !== 'budget-breach' && fallback.reason !== 'live-processing-error') {
    throw new Error('fallback.reason is not supported')
  }
  return Object.freeze({
    triggeredAtFrameIndex,
    observedDurationMs: fallback.observedDurationMs,
    reason: fallback.reason,
  })
}

function normalizeAdmittedDepthModel(
  model: XrV2AdmittedDepthModel | null | undefined,
): XrV2AdmittedDepthModel | null {
  if (!model) return null
  const modelId = assertBoundedIdentifier('admittedDepthModel.modelId', model.modelId)
  const revision = assertBoundedIdentifier('admittedDepthModel.revision', model.revision)
  const sha256 = String(model.sha256 || '').trim().toLowerCase()
  if (!SHA_256_PATTERN.test(sha256)) {
    throw new Error('admittedDepthModel.sha256 must be a lowercase SHA-256 digest')
  }
  const sameOriginPath = String(model.sameOriginPath || '').trim()
  if (
    !sameOriginPath.startsWith('/')
    || sameOriginPath.startsWith('//')
    || sameOriginPath.length > XR_V2_MAX_CAPTURE_REFERENCE_LENGTH
  ) {
    throw new Error('admittedDepthModel.sameOriginPath must be a bounded same-origin path')
  }
  return Object.freeze({ modelId, revision, sha256, sameOriginPath })
}

function canonicalPayload(bundle: XrV2CaptureFallbackBundle): string {
  const payload = JSON.stringify({
    schema: bundle.schema,
    contractVersion: bundle.contractVersion,
    idempotencyKey: bundle.idempotencyKey,
    flatAsset: bundle.flatAsset,
    queuedJob: bundle.queuedJob,
  })
  if (new TextEncoder().encode(payload).byteLength > XR_V2_MAX_FALLBACK_CANONICAL_BYTES) {
    throw new Error('capture fallback bundle exceeds the canonical payload bound')
  }
  return payload
}

export function prepareXrV2CaptureFallbackBundle(
  input: XrV2PrepareCaptureFallbackInput,
): XrV2CaptureFallbackBundle {
  const idempotencyKey = assertBoundedIdentifier('idempotencyKey', input.idempotencyKey)
  const sessionId = assertBoundedIdentifier('sessionId', input.sessionId)
  const flatAssetId = assertBoundedIdentifier('flatAssetId', input.flatAssetId)
  const jobId = assertBoundedIdentifier('jobId', input.jobId)
  const rawClipRef = assertDurableReference('rawClipRef', input.rawClipRef)
  const depthMetadataRef = assertDurableReference('depthMetadataRef', input.depthMetadataRef)
  const rawClipMimeType = String(input.rawClipMimeType || '').trim().toLowerCase()
  if (!/^video\/[a-z0-9.+-]{1,64}$/.test(rawClipMimeType)) {
    throw new Error('rawClipMimeType must be a bounded video media type')
  }
  if (
    !Number.isSafeInteger(input.rawClipByteLength)
    || input.rawClipByteLength <= 0
    || input.rawClipByteLength > XR_V2_MAX_RAW_CAPTURE_BYTES
  ) {
    throw new Error('rawClipByteLength is outside the supported capture bound')
  }
  const queuedAtMs = assertTimestamp('queuedAtMs', input.queuedAtMs)
  const fallback = normalizeFallback(input.fallback)
  const admittedModel = normalizeAdmittedDepthModel(input.admittedDepthModel)
  const executor: XrV2PostProcessExecutorState = admittedModel
    ? Object.freeze({
        state: 'awaiting-executor' as const,
        reason: null,
        admittedModel,
      })
    : Object.freeze({
        state: 'blocked' as const,
        reason: 'no-admitted-depth-model' as const,
        admittedModel: null,
      })
  const flatAsset: XrV2FlatCaptureAssetRecord = Object.freeze({
    schema: XR_V2_FLAT_CAPTURE_ASSET_SCHEMA,
    contractVersion: XR_V2_CONTRACT_VERSION,
    assetId: flatAssetId,
    sessionId,
    kind: 'flat-video-capture',
    xrCapabilityTier: 'flat-fallback',
    synthesisMode: 'none',
    rawClipRef,
    rawClipMimeType,
    rawClipByteLength: input.rawClipByteLength,
    depthMetadataRef,
    createdAtMs: queuedAtMs,
    playbackEvidence: 'not-observed',
    depthSynthesisEvidence: 'not-observed',
  })
  const queuedJob: XrV2PostProcessQueueRecord = Object.freeze({
    schema: XR_V2_POST_PROCESS_QUEUE_RECORD_SCHEMA,
    contractVersion: XR_V2_CONTRACT_VERSION,
    jobId,
    sessionId,
    flatAssetId,
    status: 'queued',
    queuedAtMs,
    maxAttempts: 1,
    rawClipRef,
    depthMetadataRef,
    fallback,
    executor,
    depthSynthesisEvidence: 'not-observed',
  })
  return Object.freeze({
    schema: XR_V2_CAPTURE_FALLBACK_BUNDLE_SCHEMA,
    contractVersion: XR_V2_CONTRACT_VERSION,
    idempotencyKey,
    flatAsset,
    queuedJob,
  })
}

export function createXrV2CaptureFallbackPersister(options: Readonly<{
  persistence: XrV2AtomicCaptureFallbackPersistence
  maxInFlight?: number
}>): XrV2CaptureFallbackPersister {
  const maxInFlight = options.maxInFlight ?? XR_V2_MAX_ATOMIC_FALLBACK_IN_FLIGHT
  if (
    !Number.isSafeInteger(maxInFlight)
    || maxInFlight < 1
    || maxInFlight > XR_V2_MAX_ATOMIC_FALLBACK_IN_FLIGHT
  ) {
    throw new Error('maxInFlight is outside the supported atomic persistence bound')
  }
  const inFlight = new Map<string, Readonly<{
    canonicalPayload: string
    result: Promise<XrV2PersistedCaptureFallback>
  }>>()

  function persist(
    input: XrV2PrepareCaptureFallbackInput,
  ): Promise<XrV2PersistedCaptureFallback> {
    const bundle = prepareXrV2CaptureFallbackBundle(input)
    const payload = canonicalPayload(bundle)
    const existing = inFlight.get(bundle.idempotencyKey)
    if (existing) {
      if (existing.canonicalPayload !== payload) {
        return Promise.reject(new Error(
          'idempotencyKey is already in flight with a different capture fallback payload',
        ))
      }
      return existing.result
    }
    if (inFlight.size >= maxInFlight) {
      return Promise.reject(new Error('atomic capture fallback persistence is at capacity'))
    }

    const commit = Object.freeze({
      idempotencyKey: bundle.idempotencyKey,
      canonicalPayload: payload,
      flatAsset: bundle.flatAsset,
      queuedJob: bundle.queuedJob,
    })
    const result = Promise.resolve()
      .then(() => options.persistence.putFlatAssetAndQueuedJobAtomically(commit))
      .then(persisted => {
        if (
          (persisted.outcome !== 'inserted' && persisted.outcome !== 'existing')
          || persisted.idempotencyKey !== commit.idempotencyKey
          || persisted.canonicalPayload !== commit.canonicalPayload
        ) {
          throw new Error('atomic capture fallback persistence returned mismatched evidence')
        }
        return Object.freeze({ outcome: persisted.outcome, bundle })
      })
    inFlight.set(bundle.idempotencyKey, Object.freeze({
      canonicalPayload: payload,
      result,
    }))
    void result.finally(() => {
      const current = inFlight.get(bundle.idempotencyKey)
      if (current?.result === result) inFlight.delete(bundle.idempotencyKey)
    }).catch(() => undefined)
    return result
  }

  return Object.freeze({
    persist,
    readInFlightCount: () => inFlight.size,
  })
}
