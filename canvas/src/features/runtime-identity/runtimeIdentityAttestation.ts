import {
  isKnowgrphRuntimeIdentityFresh,
  serializeKnowgrphRuntimeIdentity,
  type KnowgrphRuntimeIdentity,
} from './knowgrphRuntimeIdentity'
import { KNOWGRPH_RUNTIME_IDENTITY_ROOM_ID } from '@/lib/storage/knowgrphRuntimeIdentityRoomContract'

export { KNOWGRPH_RUNTIME_IDENTITY_ROOM_ID }

export const KNOWGRPH_RUNTIME_IDENTITY_ATTESTATION_SCHEMA = 'knowgrph-runtime-identity-attestation/v1' as const
export const KNOWGRPH_RUNTIME_IDENTITY_VERIFICATION_SCHEMA = 'knowgrph-runtime-identity-verification/v1' as const
export const KNOWGRPH_RUNTIME_IDENTITY_ATTESTATION_TTL_MS = 60_000
export const KNOWGRPH_RUNTIME_IDENTITY_REQUIRED_DEVICE_COUNT = 2

const FUTURE_CLOCK_SKEW_MS = 5_000

export type KnowgrphRuntimeIdentityAttestation = {
  schema: typeof KNOWGRPH_RUNTIME_IDENTITY_ATTESTATION_SCHEMA
  sessionId: string
  challenge: string
  runtimeInstanceId: string
  capturedAtMs: number
  expiresAtMs: number
  identityDigest: string
  identity: KnowgrphRuntimeIdentity
}

export type AuthenticatedKnowgrphRuntimeIdentityAttestation = {
  authenticatedPeerId: string
  authenticatedSessionId: string
  authenticatedDevicePrincipalId: string
  attestation: KnowgrphRuntimeIdentityAttestation
}

export type KnowgrphRuntimeIdentityVerificationStatus =
  | 'collecting'
  | 'pass'
  | 'mismatch'
  | 'stale'
  | 'blocked'

export type KnowgrphRuntimeIdentityVerification = {
  schema: typeof KNOWGRPH_RUNTIME_IDENTITY_VERIFICATION_SCHEMA
  status: KnowgrphRuntimeIdentityVerificationStatus
  sessionId: string
  challenge: string
  comparedAtMs: number
  expiresAtMs: number | null
  requiredDeviceCount: number
  observedDeviceCount: number
  verificationDigest: string | null
  message: string
  differences: string[]
  devices: Array<{
    device: string
    runtimeInstanceId: string
    authenticatedPeerId: string
    authenticatedSessionId: string
    authenticatedDevicePrincipalId: string
    identityDigest: string
    expiresAtMs: number
  }>
}

export type VerifyKnowgrphRuntimeIdentityAttestationsArgs = {
  sessionId: string
  challenge: string
  attestations: AuthenticatedKnowgrphRuntimeIdentityAttestation[]
  nowMs?: number
  requiredDeviceCount?: number
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value)

const normalizeString = (value: unknown): string => String(value || '').trim()

const snapshotRuntimeIdentity = (identity: KnowgrphRuntimeIdentity): KnowgrphRuntimeIdentity => ({
  schema: identity.schema,
  device: identity.device,
  branch: identity.branch,
  knowgrphRevision: identity.knowgrphRevision,
  agenticCanvasOsRevision: identity.agenticCanvasOsRevision,
  catalogRevision: identity.catalogRevision,
  catalogDigest: identity.catalogDigest,
  catalogHydration: { ...identity.catalogHydration },
  catalogCounts: { ...identity.catalogCounts },
  agentLiveProviderProof: {
    ...identity.agentLiveProviderProof,
    finalAnswerOwners: { ...identity.agentLiveProviderProof.finalAnswerOwners },
  },
  progressiveAgentsReadiness: {
    ...identity.progressiveAgentsReadiness,
    growthStages: [...identity.progressiveAgentsReadiness.growthStages],
  },
})

const isRuntimeIdentity = (value: unknown): value is KnowgrphRuntimeIdentity => {
  if (!isRecord(value) || value.schema !== 'knowgrph-runtime-identity/v1') return false
  if (
    typeof value.device !== 'string'
    || typeof value.branch !== 'string'
    || typeof value.knowgrphRevision !== 'string'
    || typeof value.agenticCanvasOsRevision !== 'string'
    || typeof value.catalogRevision !== 'string'
    || typeof value.catalogDigest !== 'string'
    || !isRecord(value.catalogHydration)
    || !isRecord(value.catalogCounts)
    || !isRecord(value.agentLiveProviderProof)
    || !isRecord(value.agentLiveProviderProof.finalAnswerOwners)
    || !isRecord(value.progressiveAgentsReadiness)
    || !Array.isArray(value.progressiveAgentsReadiness.growthStages)
  ) return false
  return typeof value.catalogHydration.status === 'string'
    && Number.isInteger(value.catalogHydration.attempts)
    && Number.isInteger(value.catalogCounts.slash)
    && Number.isInteger(value.catalogCounts.hash)
    && Number.isInteger(value.catalogCounts.at)
    && value.agentLiveProviderProof.schema === 'agent-live-provider-proof-summary/v1'
    && typeof value.agentLiveProviderProof.status === 'string'
    && typeof value.agentLiveProviderProof.sourceRevision === 'string'
    && typeof value.agentLiveProviderProof.proofRevision === 'string'
    && typeof value.agentLiveProviderProof.sourcePath === 'string'
    && typeof value.agentLiveProviderProof.sourceUrl === 'string'
    && typeof value.agentLiveProviderProof.model === 'string'
    && typeof value.agentLiveProviderProof.reasoningEffort === 'string'
    && Number.isInteger(value.agentLiveProviderProof.providerCalls)
    && Number.isInteger(value.agentLiveProviderProof.inputTokens)
    && Number.isInteger(value.agentLiveProviderProof.outputTokens)
    && Number.isInteger(value.agentLiveProviderProof.cachedInputTokens)
    && typeof value.agentLiveProviderProof.estimatedCostUsd === 'number'
    && typeof value.agentLiveProviderProof.finalAnswerOwners.delegation === 'string'
    && typeof value.agentLiveProviderProof.finalAnswerOwners.handoff === 'string'
    && typeof value.agentLiveProviderProof.continuationContext === 'string'
    && typeof value.agentLiveProviderProof.defaultWorkerConfigured === 'boolean'
    && value.progressiveAgentsReadiness.schema === 'progressive-agents-readiness-summary/v1'
    && typeof value.progressiveAgentsReadiness.status === 'string'
    && typeof value.progressiveAgentsReadiness.sourceRevision === 'string'
    && typeof value.progressiveAgentsReadiness.sourcePath === 'string'
    && typeof value.progressiveAgentsReadiness.sourceUrl === 'string'
    && typeof value.progressiveAgentsReadiness.contractSchema === 'string'
    && typeof value.progressiveAgentsReadiness.runtimeScope === 'string'
    && typeof value.progressiveAgentsReadiness.runtimeOwner === 'string'
    && typeof value.progressiveAgentsReadiness.runtimeProof === 'string'
    && typeof value.progressiveAgentsReadiness.contractReady === 'boolean'
    && (typeof value.progressiveAgentsReadiness.configured === 'boolean' || value.progressiveAgentsReadiness.configured === null)
    && typeof value.progressiveAgentsReadiness.progressionPolicy === 'string'
    && value.progressiveAgentsReadiness.growthStages.every(stage => typeof stage === 'string')
    && (typeof value.progressiveAgentsReadiness.externalSdkDependency === 'boolean' || value.progressiveAgentsReadiness.externalSdkDependency === null)
    && typeof value.progressiveAgentsReadiness.providerExecutionStatus === 'string'
    && (typeof value.progressiveAgentsReadiness.defaultWorkerConfigured === 'boolean' || value.progressiveAgentsReadiness.defaultWorkerConfigured === null)
    && typeof value.progressiveAgentsReadiness.deployPolicy === 'string'
}

const toHex = (bytes: ArrayBuffer): string =>
  Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('')

export async function digestKnowgrphRuntimeIdentityText(text: string): Promise<string> {
  if (!globalThis.crypto?.subtle) throw new Error('Web Crypto SHA-256 is unavailable')
  const bytes = new TextEncoder().encode(text)
  return toHex(await globalThis.crypto.subtle.digest('SHA-256', bytes))
}

const serializeAttestationPayload = (args: {
  sessionId: string
  challenge: string
  runtimeInstanceId: string
  capturedAtMs: number
  expiresAtMs: number
  identity: KnowgrphRuntimeIdentity
}): string => [
  KNOWGRPH_RUNTIME_IDENTITY_ATTESTATION_SCHEMA,
  args.sessionId,
  args.challenge,
  args.runtimeInstanceId,
  String(args.capturedAtMs),
  String(args.expiresAtMs),
  serializeKnowgrphRuntimeIdentity(args.identity),
].join('\n')

export function createKnowgrphRuntimeInstanceId(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID()
  if (!globalThis.crypto?.getRandomValues) throw new Error('secure runtime instance identity is unavailable')
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16))
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')
}

export async function createKnowgrphRuntimeIdentityAttestation(args: {
  identity: KnowgrphRuntimeIdentity
  sessionId: string
  challenge: string
  runtimeInstanceId: string
  nowMs?: number
}): Promise<KnowgrphRuntimeIdentityAttestation> {
  const capturedAtMs = args.nowMs ?? Date.now()
  const expiresAtMs = capturedAtMs + KNOWGRPH_RUNTIME_IDENTITY_ATTESTATION_TTL_MS
  const identity = snapshotRuntimeIdentity(args.identity)
  const identityDigest = await digestKnowgrphRuntimeIdentityText(serializeAttestationPayload({
    sessionId: args.sessionId,
    challenge: args.challenge,
    runtimeInstanceId: args.runtimeInstanceId,
    capturedAtMs,
    expiresAtMs,
    identity,
  }))
  return {
    schema: KNOWGRPH_RUNTIME_IDENTITY_ATTESTATION_SCHEMA,
    sessionId: args.sessionId,
    challenge: args.challenge,
    runtimeInstanceId: args.runtimeInstanceId,
    capturedAtMs,
    expiresAtMs,
    identityDigest,
    identity,
  }
}

const buildVerification = (args: {
  status: KnowgrphRuntimeIdentityVerificationStatus
  sessionId: string
  challenge: string
  nowMs: number
  requiredDeviceCount: number
  attestations: AuthenticatedKnowgrphRuntimeIdentityAttestation[]
  differences: string[]
  message: string
  verificationDigest?: string | null
}): KnowgrphRuntimeIdentityVerification => ({
  schema: KNOWGRPH_RUNTIME_IDENTITY_VERIFICATION_SCHEMA,
  status: args.status,
  sessionId: args.sessionId,
  challenge: args.challenge,
  comparedAtMs: args.nowMs,
  expiresAtMs: args.attestations.length
    ? Math.min(...args.attestations.map(entry => entry.attestation.expiresAtMs))
    : null,
  requiredDeviceCount: args.requiredDeviceCount,
  observedDeviceCount: new Set(args.attestations.map(entry => entry.authenticatedDevicePrincipalId)).size,
  verificationDigest: args.verificationDigest ?? null,
  message: args.message,
  differences: args.differences,
  devices: args.attestations.map(entry => ({
    device: entry.attestation.identity.device,
    runtimeInstanceId: entry.attestation.runtimeInstanceId,
    authenticatedPeerId: entry.authenticatedPeerId,
    authenticatedSessionId: entry.authenticatedSessionId,
    authenticatedDevicePrincipalId: entry.authenticatedDevicePrincipalId,
    identityDigest: entry.attestation.identityDigest,
    expiresAtMs: entry.attestation.expiresAtMs,
  })),
})

const collectParityDifferences = (
  attestations: AuthenticatedKnowgrphRuntimeIdentityAttestation[],
): string[] => {
  const identities = attestations.map(entry => entry.attestation.identity)
  const fields: Array<keyof Pick<KnowgrphRuntimeIdentity,
    'knowgrphRevision' | 'agenticCanvasOsRevision' | 'catalogRevision' | 'catalogDigest'>> = [
      'knowgrphRevision',
      'agenticCanvasOsRevision',
      'catalogRevision',
      'catalogDigest',
    ]
  const differences: string[] = fields.filter(field => new Set(identities.map(identity => identity[field])).size !== 1)
  const countFields = ['slash', 'hash', 'at'] as const
  for (const field of countFields) {
    if (new Set(identities.map(identity => identity.catalogCounts[field])).size !== 1) {
      differences.push(`catalogCounts.${field}`)
    }
  }
  if (new Set(identities.map(identity => JSON.stringify(identity.agentLiveProviderProof))).size !== 1) {
    differences.push('agentLiveProviderProof')
  }
  if (new Set(identities.map(identity => JSON.stringify(identity.progressiveAgentsReadiness))).size !== 1) {
    differences.push('progressiveAgentsReadiness')
  }
  return differences
}

export async function verifyKnowgrphRuntimeIdentityAttestations(
  args: VerifyKnowgrphRuntimeIdentityAttestationsArgs,
): Promise<KnowgrphRuntimeIdentityVerification> {
  const nowMs = args.nowMs ?? Date.now()
  const requiredDeviceCount = args.requiredDeviceCount ?? KNOWGRPH_RUNTIME_IDENTITY_REQUIRED_DEVICE_COUNT
  const sessionId = normalizeString(args.sessionId)
  const challenge = normalizeString(args.challenge)
  const structuralFailures: string[] = []
  const staleFailures: string[] = []

  for (const entry of args.attestations) {
    const attestation = entry.attestation
    if (!normalizeString(entry.authenticatedPeerId)) structuralFailures.push('missing authenticated peer')
    if (!normalizeString(entry.authenticatedSessionId)) structuralFailures.push('missing authenticated session')
    if (!/^[0-9a-f]{64}$/.test(normalizeString(entry.authenticatedDevicePrincipalId))) {
      structuralFailures.push('missing authenticated device principal')
    }
    if (!isRecord(attestation) || attestation.schema !== KNOWGRPH_RUNTIME_IDENTITY_ATTESTATION_SCHEMA) {
      structuralFailures.push('invalid attestation schema')
      continue
    }
    if (!isRuntimeIdentity(attestation.identity)) {
      structuralFailures.push('invalid runtime identity payload')
      continue
    }
    if (attestation.sessionId !== sessionId) structuralFailures.push('attestation session mismatch')
    if (attestation.challenge !== challenge) structuralFailures.push('attestation challenge replay')
    if (!normalizeString(attestation.runtimeInstanceId)) structuralFailures.push('missing runtime instance')
    const lifetimeMs = attestation.expiresAtMs - attestation.capturedAtMs
    if (!Number.isInteger(attestation.capturedAtMs) || !Number.isInteger(attestation.expiresAtMs)) {
      structuralFailures.push('invalid attestation timestamps')
    } else if (lifetimeMs <= 0 || lifetimeMs > KNOWGRPH_RUNTIME_IDENTITY_ATTESTATION_TTL_MS) {
      structuralFailures.push('invalid attestation lifetime')
    } else if (attestation.capturedAtMs > nowMs + FUTURE_CLOCK_SKEW_MS) {
      structuralFailures.push('attestation timestamp is in the future')
    } else if (attestation.expiresAtMs <= nowMs) {
      staleFailures.push('attestation expired')
    }
    const expectedDigest = await digestKnowgrphRuntimeIdentityText(serializeAttestationPayload({
      sessionId: attestation.sessionId,
      challenge: attestation.challenge,
      runtimeInstanceId: attestation.runtimeInstanceId,
      capturedAtMs: attestation.capturedAtMs,
      expiresAtMs: attestation.expiresAtMs,
      identity: attestation.identity,
    }))
    if (!/^[0-9a-f]{64}$/.test(attestation.identityDigest)) structuralFailures.push('invalid attestation digest')
    if (attestation.identityDigest !== expectedDigest) structuralFailures.push('attestation digest mismatch')
    if (!isKnowgrphRuntimeIdentityFresh(attestation.identity)) staleFailures.push('runtime identity is not fresh')
    if (!normalizeString(attestation.identity.device) || attestation.identity.device === 'unknown-device') {
      structuralFailures.push('runtime device identity is unavailable')
    }
  }

  const devices = args.attestations.map(entry => entry.attestation.identity.device)
  const runtimeInstances = args.attestations.map(entry => entry.attestation.runtimeInstanceId)
  const authenticatedSessions = args.attestations.map(entry => entry.authenticatedSessionId)
  const authenticatedDevicePrincipals = args.attestations.map(entry => entry.authenticatedDevicePrincipalId)
  if (new Set(devices).size !== devices.length) structuralFailures.push('duplicate runtime device')
  if (new Set(runtimeInstances).size !== runtimeInstances.length) structuralFailures.push('duplicate runtime instance')
  if (new Set(authenticatedSessions).size !== authenticatedSessions.length) {
    structuralFailures.push('duplicate authenticated session')
  }
  if (new Set(authenticatedDevicePrincipals).size !== authenticatedDevicePrincipals.length) {
    structuralFailures.push('duplicate authenticated device principal')
  }

  if (structuralFailures.length) {
    return buildVerification({
      status: 'blocked', sessionId, challenge, nowMs, requiredDeviceCount,
      attestations: args.attestations, differences: Array.from(new Set(structuralFailures)),
      message: 'Automatic identity verification is blocked by invalid or replayed evidence.',
    })
  }
  if (staleFailures.length) {
    return buildVerification({
      status: 'stale', sessionId, challenge, nowMs, requiredDeviceCount,
      attestations: args.attestations, differences: Array.from(new Set(staleFailures)),
      message: 'Automatic identity verification is stale until every runtime reports fresh evidence.',
    })
  }
  if (new Set(authenticatedDevicePrincipals).size < requiredDeviceCount) {
    return buildVerification({
      status: 'collecting', sessionId, challenge, nowMs, requiredDeviceCount,
      attestations: args.attestations, differences: [],
      message: `Waiting for ${requiredDeviceCount - new Set(authenticatedDevicePrincipals).size} additional authenticated device attestation(s).`,
    })
  }
  const parityDifferences = collectParityDifferences(args.attestations)
  if (parityDifferences.length) {
    return buildVerification({
      status: 'mismatch', sessionId, challenge, nowMs, requiredDeviceCount,
      attestations: args.attestations, differences: parityDifferences,
      message: `Exact cross-device parity failed for ${parityDifferences.join(', ')}.`,
    })
  }
  const verificationDigest = await digestKnowgrphRuntimeIdentityText(
    args.attestations.map(entry => entry.attestation.identityDigest).sort().join('\n'),
  )
  return buildVerification({
    status: 'pass', sessionId, challenge, nowMs, requiredDeviceCount,
    attestations: args.attestations, differences: [], verificationDigest,
    message: `Exact runtime identity parity passed across ${new Set(authenticatedDevicePrincipals).size} authenticated devices.`,
  })
}
