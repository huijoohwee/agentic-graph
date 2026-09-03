import type { XrCapabilityEntryMode } from '@/lib/three/ThreeGraphXrSessionPolicy'
import { XR_V2_CONTRACT_VERSION } from './captureContracts'

export { XR_V2_CONTRACT_VERSION } from './captureContracts'

export const XR_V2_DEV_RUNTIME_EVIDENCE_SCHEMA = 'agentic-graph-xr-v2-dev-runtime-evidence/v1' as const

export type XrV2DevEditedMediaEvidence = Readonly<{
  byteSize: number
  mimeType: string
  decodedWidth: number
  decodedHeight: number
  durationSeconds: number | null
  unboundedDuration: boolean
  playbackObserved: boolean
}>

export type XrV2DevAuthoringAdapterEvidence = Readonly<{
  canonicalEcsEntityZero: boolean
  materialApplied: boolean
  timelineCommandRouted: boolean
}>

export type XrV2DevRuntimeEvidence = Readonly<{
  schema: typeof XR_V2_DEV_RUNTIME_EVIDENCE_SCHEMA
  authoringAdapters: XrV2DevAuthoringAdapterEvidence
  editedMedia: XrV2DevEditedMediaEvidence
}>

export type XrV2DevRuntimeEvidenceValidationResult =
  | Readonly<{ status: 'valid'; evidence: XrV2DevRuntimeEvidence }>
  | Readonly<{
      status: 'invalid'
      reason:
        | 'invalid-envelope'
        | 'invalid-schema'
        | 'authoring-proof-incomplete'
        | 'invalid-media-evidence'
        | 'playback-not-observed'
    }>

export type XrV2EvidenceState = 'source-backed' | 'blocked'

export type XrV2ReadinessSnapshot = Readonly<{
  schema: 'agentic-graph-xr-v2-readiness/v1'
  version: typeof XR_V2_CONTRACT_VERSION
  scope: 'xr-authoring-edited-media-delivery'
  entryMode: XrCapabilityEntryMode
  overall: 'source-ready'
  evidence: Readonly<{
    capabilityDetection: XrV2EvidenceState
    captureFallback: XrV2EvidenceState
    liveDepthSynthesis: XrV2EvidenceState
    authoringAdapters: XrV2EvidenceState
    browserPlayback: XrV2EvidenceState
    physicalDevice: XrV2EvidenceState
  }>
  blockedReasons: readonly string[]
}>

const DEV_EVIDENCE_KEYS = Object.freeze([
  'authoringAdapters',
  'editedMedia',
  'schema',
])
const AUTHORING_ADAPTER_KEYS = Object.freeze([
  'canonicalEcsEntityZero',
  'materialApplied',
  'timelineCommandRouted',
])
const EDITED_MEDIA_KEYS = Object.freeze([
  'byteSize',
  'decodedHeight',
  'decodedWidth',
  'durationSeconds',
  'mimeType',
  'playbackObserved',
  'unboundedDuration',
])
const VIDEO_MIME = /^video\/[a-z0-9][a-z0-9!#$&^_.+-]{0,63}(?:\s*;[^\r\n]{1,192})?$/iu

function isRecord(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function hasExactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort()
  return actual.length === expected.length && actual.every((key, index) => key === expected[index])
}

function isPositiveSafeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) > 0
}

/** Validates closed, serializable proof produced by the development browser smoke. */
export function validateXrV2DevRuntimeEvidence(
  candidate: unknown,
): XrV2DevRuntimeEvidenceValidationResult {
  if (!isRecord(candidate) || !hasExactKeys(candidate, DEV_EVIDENCE_KEYS)) {
    return { status: 'invalid', reason: 'invalid-envelope' }
  }
  if (candidate.schema !== XR_V2_DEV_RUNTIME_EVIDENCE_SCHEMA) {
    return { status: 'invalid', reason: 'invalid-schema' }
  }
  if (!isRecord(candidate.authoringAdapters)
    || !hasExactKeys(candidate.authoringAdapters, AUTHORING_ADAPTER_KEYS)
    || candidate.authoringAdapters.canonicalEcsEntityZero !== true
    || candidate.authoringAdapters.materialApplied !== true
    || candidate.authoringAdapters.timelineCommandRouted !== true) {
    return { status: 'invalid', reason: 'authoring-proof-incomplete' }
  }
  if (!isRecord(candidate.editedMedia) || !hasExactKeys(candidate.editedMedia, EDITED_MEDIA_KEYS)) {
    return { status: 'invalid', reason: 'invalid-media-evidence' }
  }

  const media = candidate.editedMedia
  const boundedDuration = typeof media.durationSeconds === 'number'
    && Number.isFinite(media.durationSeconds)
    && media.durationSeconds > 0
    && media.unboundedDuration === false
  const unboundedDuration = media.durationSeconds === null && media.unboundedDuration === true
  if (
    !isPositiveSafeInteger(media.byteSize)
    || typeof media.mimeType !== 'string'
    || !VIDEO_MIME.test(media.mimeType)
    || !isPositiveSafeInteger(media.decodedWidth)
    || !isPositiveSafeInteger(media.decodedHeight)
    || (!boundedDuration && !unboundedDuration)
  ) {
    return { status: 'invalid', reason: 'invalid-media-evidence' }
  }
  if (media.playbackObserved !== true) {
    return { status: 'invalid', reason: 'playback-not-observed' }
  }

  return { status: 'valid', evidence: candidate as XrV2DevRuntimeEvidence }
}

export function createXrV2ReadinessSnapshot(input: Readonly<{
  entryMode: XrCapabilityEntryMode
}>): XrV2ReadinessSnapshot {
  const blockedReasons = [
    'same-origin depth model assets are not admitted',
    'reference-device frame-budget proof is absent',
    'physical XR device proof is absent',
    'canonical-main browser runtime proof is absent',
  ]

  return Object.freeze({
    schema: 'agentic-graph-xr-v2-readiness/v1',
    version: XR_V2_CONTRACT_VERSION,
    scope: 'xr-authoring-edited-media-delivery',
    entryMode: input.entryMode,
    overall: 'source-ready',
    evidence: Object.freeze({
      capabilityDetection: 'source-backed',
      captureFallback: 'source-backed',
      liveDepthSynthesis: 'blocked',
      authoringAdapters: 'source-backed',
      browserPlayback: 'blocked',
      physicalDevice: 'blocked',
    }),
    blockedReasons: Object.freeze(blockedReasons),
  })
}
