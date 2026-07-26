import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  buildVoiceProfileManifest,
  isVoiceProfileSelectable,
  parseVoiceStudioInvocation,
  VOICE_STUDIO_LOCAL_LIMITS,
  VOICE_STUDIO_ROUTES,
} from '@/features/voice-studio/voiceStudioContract'
import { readVoiceStudioBrowserCapabilities } from '@/features/voice-studio/voiceStudioBrowserRuntime'

export function testVoiceStudioExactInvocationRoutes() {
  for (const route of Object.values(VOICE_STUDIO_ROUTES)) {
    assert.deepEqual(parseVoiceStudioInvocation(route.text), {
      operation: route.operation,
      command: '/voice.studio',
      semantic: route.semantic,
      bindings: route.bindings,
      prompt: '',
    })
  }
  assert.equal(parseVoiceStudioInvocation('/voice.studio #voice-clone @voice-profile'), null)
  assert.equal(parseVoiceStudioInvocation('/voice.studio #voice-clone #text-to-speech @audio @voice-profile @approval-gate @cost-log @runtime-proof'), null)
  assert.equal(parseVoiceStudioInvocation('/voice.studio #text-to-speech @audio @text @voice-profile @approval-gate @cost-log @runtime-proof'), null)
  assert.equal(parseVoiceStudioInvocation('/other #speech-to-text @audio @text @approval-gate @cost-log @runtime-proof'), null)
  assert.equal(
    parseVoiceStudioInvocation('Say this aloud /voice.studio #text-to-speech @text @voice-profile @audio @approval-gate @cost-log @runtime-proof')?.prompt,
    'Say this aloud',
  )
}

export async function testVoiceStudioProfileManifestConsentAndMetadataOnly() {
  const sample = new Blob(['owned sample bytes'], { type: 'audio/webm' })
  const profile = await buildVoiceProfileManifest({
    displayName: 'Owner voice',
    locale: 'en-SG',
    sample,
    basis: 'self',
    rightsAttested: true,
    notPublicFigure: true,
    consentReceiptId: 'consent-owner-0001',
    rightsReceiptId: 'rights-owner-0001',
    permittedUse: 'Private studio creation',
    retentionPolicy: 'contract-bound',
    expiresAt: '2099-01-01T00:00:00.000Z',
    now: new Date('2026-07-24T00:00:00.000Z'),
  })
  assert.equal(profile.rights.attested, true)
  assert.equal(profile.rights.publicFigure, false)
  assert.equal(profile.rights.disclosureRequired, true)
  assert.equal(profile.rights.consentReceiptId, 'consent-owner-0001')
  assert.equal(profile.rights.rightsReceiptId, 'rights-owner-0001')
  assert.equal(profile.rights.revoked, false)
  assert.match(profile.profileRevision, /^manifest-[a-f0-9]{20}$/)
  assert.equal(isVoiceProfileSelectable(profile, Date.parse('2026-07-25T00:00:00.000Z')), true)
  assert.match(profile.sampleSha256, /^[a-f0-9]{64}$/)
  const serialized = JSON.stringify(profile)
  assert.equal(serialized.includes('owned sample bytes'), false)
  assert.equal(serialized.includes('base64'), false)
  await assert.rejects(
    () => buildVoiceProfileManifest({
      displayName: 'Oversized',
      locale: 'en-SG',
      sample: { type: 'audio/webm', size: VOICE_STUDIO_LOCAL_LIMITS.cloneSampleBytes + 1 } as Blob,
      basis: 'self',
      rightsAttested: true,
      notPublicFigure: true,
      consentReceiptId: 'consent-owner-0002',
      rightsReceiptId: 'rights-owner-0002',
      permittedUse: 'Private studio creation',
      retentionPolicy: 'session-only',
      expiresAt: '2099-01-01T00:00:00.000Z',
    }),
    /100 MB/,
  )
}

export function testVoiceStudioBrowserCapabilitiesFailClosed() {
  assert.deepEqual(readVoiceStudioBrowserCapabilities(undefined), {
    microphoneCapture: false,
    speechRecognition: false,
    speechSynthesis: false,
  })
}

export function testVoiceStudioUiProvidesStopAndDisclosure() {
  const panel = readFileSync(resolve(process.cwd(), 'src/features/voice-studio/VoiceStudioPanel.tsx'), 'utf8')
  assert.match(panel, /data-kg-voice-stop="dictation"/)
  assert.match(panel, /data-kg-voice-stop="speech"/)
  assert.match(panel, /Synthetic-voice disclosure is always required/)
  assert.match(panel, /public figure or impersonation target/)
  assert.match(panel, /Sample bytes were not stored/)
  assert.match(panel, /Microphone permission is not consent/)
  assert.match(panel, /captureDurationMs/)
  assert.match(panel, /aria-controls=/)
}

export function testVoiceStudioCleanRoomDependencyBoundary() {
  const paths = [
    'src/features/voice-studio/voiceStudioContract.ts',
    'src/features/voice-studio/voiceStudioBrowserRuntime.ts',
    'src/features/voice-studio/voiceStudioInvocation.ts',
    'src/features/voice-studio/VoiceStudioPanel.tsx',
    '../contracts/voice-studio.schema.js',
    '../mcp/voice-studio-tool-contract.js',
    '../mcp/voice-studio-runtime.js',
  ]
  const source = paths.map(path => readFileSync(resolve(process.cwd(), path), 'utf8')).join('\n').toLowerCase()
  assert.equal(source.includes('voicebox'), false)
  assert.equal(source.includes('jamiepine'), false)
  assert.equal(source.includes('rawembedding'), false)
}
