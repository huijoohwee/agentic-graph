import { splitInvocationTokenSegments } from '@/lib/markdown/invocationTokens'

export type VoiceStudioOperation = 'clone' | 'dictate' | 'create'

export const VOICE_STUDIO_COMMAND = '/voice.studio' as const
export const VOICE_STUDIO_LOCAL_LIMITS = Object.freeze({
  cloneSampleBytes: 100_000_000,
  captureBytes: 100_000_000,
  captureDurationMs: 300_000,
  createTextCharacters: 20_000,
  transcriptCharacters: 200_000,
})
export const VOICE_STUDIO_ROUTES = Object.freeze({
  clone: Object.freeze({
    operation: 'clone' as const,
    semantic: '#voice-clone',
    bindings: Object.freeze(['@audio', '@voice-profile', '@approval-gate', '@cost-log', '@runtime-proof']),
    text: '/voice.studio #voice-clone @audio @voice-profile @approval-gate @cost-log @runtime-proof',
  }),
  dictate: Object.freeze({
    operation: 'dictate' as const,
    semantic: '#speech-to-text',
    bindings: Object.freeze(['@audio', '@text', '@approval-gate', '@cost-log', '@runtime-proof']),
    text: '/voice.studio #speech-to-text @audio @text @approval-gate @cost-log @runtime-proof',
  }),
  create: Object.freeze({
    operation: 'create' as const,
    semantic: '#text-to-speech',
    bindings: Object.freeze(['@text', '@voice-profile', '@audio', '@approval-gate', '@cost-log', '@runtime-proof']),
    text: '/voice.studio #text-to-speech @text @voice-profile @audio @approval-gate @cost-log @runtime-proof',
  }),
})

export type VoiceStudioInvocation = {
  operation: VoiceStudioOperation
  command: typeof VOICE_STUDIO_COMMAND
  semantic: string
  bindings: readonly string[]
  prompt: string
}

export type VoiceProfileManifest = {
  id: string
  profileRevision: string
  displayName: string
  locale: string
  sampleSha256: string
  sampleMediaType: string
  sampleBytes: number
  rights: {
    basis: 'self' | 'written-authorization' | 'licensed'
    attested: true
    publicFigure: false
    consentReceiptId: string
    rightsReceiptId: string
    permittedUse: string
    disclosureRequired: true
    retentionPolicy: 'session-only' | '30-days' | 'max-90-days' | 'contract-bound'
    expiresAt: string
    revoked: boolean
  }
  state: 'manifest-only'
  createdAt: string
}

const SEMANTICS = new Set(Object.values(VOICE_STUDIO_ROUTES).map(route => route.semantic))
const OPAQUE_ID_PATTERN = /^[A-Za-z0-9._:-]{3,128}$/

export function parseVoiceStudioInvocation(input: unknown): VoiceStudioInvocation | null {
  const raw = String(input || '').trim()
  const segments = splitInvocationTokenSegments(raw)
  const tokens = segments
    .filter(segment => segment.kind === 'token')
    .map(segment => segment.value.toLowerCase())
  const tokenSet = new Set(tokens)
  if (tokenSet.size !== tokens.length || !tokenSet.has(VOICE_STUDIO_COMMAND)) return null
  const matchingSemantics = [...SEMANTICS].filter(token => tokenSet.has(token))
  if (matchingSemantics.length !== 1) return null
  const route = Object.values(VOICE_STUDIO_ROUTES).find(candidate => {
    const expected = [VOICE_STUDIO_COMMAND, candidate.semantic, ...candidate.bindings]
    return expected.length === tokens.length && expected.every((token, index) => tokens[index] === token)
  })
  if (!route) return null
  const prompt = segments
    .filter(segment => segment.kind === 'text')
    .map(segment => segment.value)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (prompt.length > VOICE_STUDIO_LOCAL_LIMITS.createTextCharacters) return null
  return {
    operation: route.operation,
    command: VOICE_STUDIO_COMMAND,
    semantic: route.semantic,
    bindings: route.bindings,
    prompt,
  }
}

export function validateVoiceProfileManifest(value: unknown): value is VoiceProfileManifest {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const profile = value as Partial<VoiceProfileManifest>
  const rights = profile.rights
  return typeof profile.id === 'string'
    && OPAQUE_ID_PATTERN.test(profile.id)
    && typeof profile.profileRevision === 'string'
    && /^[A-Za-z0-9._:-]{8,128}$/.test(profile.profileRevision)
    && typeof profile.displayName === 'string'
    && profile.displayName.trim().length > 0
    && profile.displayName.length <= 80
    && typeof profile.locale === 'string'
    && profile.locale.trim().length >= 2
    && typeof profile.sampleSha256 === 'string'
    && /^[a-f0-9]{64}$/.test(profile.sampleSha256)
    && typeof profile.sampleMediaType === 'string'
    && profile.sampleMediaType.startsWith('audio/')
    && Number.isSafeInteger(profile.sampleBytes)
    && Number(profile.sampleBytes) > 0
    && Number(profile.sampleBytes) <= VOICE_STUDIO_LOCAL_LIMITS.cloneSampleBytes
    && rights?.attested === true
    && rights.publicFigure === false
    && typeof rights.consentReceiptId === 'string'
    && OPAQUE_ID_PATTERN.test(rights.consentReceiptId)
    && typeof rights.rightsReceiptId === 'string'
    && OPAQUE_ID_PATTERN.test(rights.rightsReceiptId)
    && rights.disclosureRequired === true
    && ['self', 'written-authorization', 'licensed'].includes(rights.basis || '')
    && typeof rights.permittedUse === 'string'
    && rights.permittedUse.trim().length > 0
    && ['session-only', '30-days', 'max-90-days', 'contract-bound'].includes(rights.retentionPolicy || '')
    && typeof rights.expiresAt === 'string'
    && Number.isFinite(Date.parse(rights.expiresAt))
    && typeof rights.revoked === 'boolean'
    && profile.state === 'manifest-only'
    && typeof profile.createdAt === 'string'
}

export async function sha256VoiceSample(sample: Blob): Promise<string> {
  if (!globalThis.crypto?.subtle) throw new Error('This browser cannot hash the voice sample.')
  const digest = await globalThis.crypto.subtle.digest('SHA-256', await sample.arrayBuffer())
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('')
}

export async function buildVoiceProfileManifest(args: {
  displayName: string
  locale: string
  sample: Blob
  basis: VoiceProfileManifest['rights']['basis']
  rightsAttested: boolean
  notPublicFigure: boolean
  consentReceiptId: string
  rightsReceiptId: string
  permittedUse: string
  retentionPolicy: VoiceProfileManifest['rights']['retentionPolicy']
  expiresAt: string
  now?: Date
}): Promise<VoiceProfileManifest> {
  const displayName = args.displayName.trim()
  const locale = args.locale.trim()
  const permittedUse = args.permittedUse.trim()
  const consentReceiptId = args.consentReceiptId.trim()
  const rightsReceiptId = args.rightsReceiptId.trim()
  const now = args.now || new Date()
  if (!displayName || displayName.length > 80 || !locale || !permittedUse) {
    throw new Error('Profile name, locale, and permitted use are required.')
  }
  if (!OPAQUE_ID_PATTERN.test(consentReceiptId) || !OPAQUE_ID_PATTERN.test(rightsReceiptId)) {
    throw new Error('Exact consent and recording-rights receipt IDs are required.')
  }
  if (args.rightsAttested !== true || args.notPublicFigure !== true) {
    throw new Error('Explicit voice-rights and non-public-figure attestations are required.')
  }
  if (!Number.isFinite(Date.parse(args.expiresAt)) || Date.parse(args.expiresAt) <= now.getTime()) {
    throw new Error('The consent receipt must have a future expiry.')
  }
  const retentionMaximumDays = args.retentionPolicy === '30-days'
    ? 30
    : args.retentionPolicy === 'max-90-days'
      ? 90
      : null
  if (retentionMaximumDays
    && Date.parse(args.expiresAt) > now.getTime() + retentionMaximumDays * 24 * 60 * 60 * 1000) {
    throw new Error(`Consent expiry exceeds the ${retentionMaximumDays}-day retention policy.`)
  }
  if (!args.sample.type.startsWith('audio/') || args.sample.size < 1) {
    throw new Error('Choose a non-empty audio sample.')
  }
  if (args.sample.size > VOICE_STUDIO_LOCAL_LIMITS.cloneSampleBytes) {
    throw new Error('Voice samples must be 100 MB or smaller.')
  }
  const sampleSha256 = await sha256VoiceSample(args.sample)
  const revisionMaterial = JSON.stringify({
    sampleSha256,
    consentReceiptId,
    rightsReceiptId,
    permittedUse,
    retentionPolicy: args.retentionPolicy,
    expiresAt: new Date(args.expiresAt).toISOString(),
  })
  const revisionDigest = await globalThis.crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(revisionMaterial),
  )
  const revisionSha = [...new Uint8Array(revisionDigest)]
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('')
  return {
    id: `profile-${revisionSha.slice(0, 16)}`,
    profileRevision: `manifest-${revisionSha.slice(0, 20)}`,
    displayName,
    locale,
    sampleSha256,
    sampleMediaType: args.sample.type,
    sampleBytes: args.sample.size,
    rights: {
      basis: args.basis,
      attested: true,
      publicFigure: false,
      consentReceiptId,
      rightsReceiptId,
      permittedUse,
      disclosureRequired: true,
      retentionPolicy: args.retentionPolicy,
      expiresAt: new Date(args.expiresAt).toISOString(),
      revoked: false,
    },
    state: 'manifest-only',
    createdAt: now.toISOString(),
  }
}

export function isVoiceProfileSelectable(
  profile: VoiceProfileManifest,
  nowMs = Date.now(),
): boolean {
  return validateVoiceProfileManifest(profile)
    && profile.rights.revoked === false
    && Date.parse(profile.rights.expiresAt) > nowMs
}
