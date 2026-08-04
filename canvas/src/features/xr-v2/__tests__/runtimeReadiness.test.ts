import assert from 'node:assert/strict'
import test from 'node:test'
import {
  XR_V2_CONTRACT_VERSION,
  XR_V2_DEV_RUNTIME_EVIDENCE_SCHEMA,
  createXrV2ReadinessSnapshot,
  validateXrV2DevRuntimeEvidence,
  type XrV2DevRuntimeEvidence,
} from '../runtimeReadiness'

function validEvidence(overrides: Partial<XrV2DevRuntimeEvidence['editedMedia']> = {}): XrV2DevRuntimeEvidence {
  return {
    schema: XR_V2_DEV_RUNTIME_EVIDENCE_SCHEMA,
    authoringAdapters: {
      canonicalEcsEntityZero: true,
      materialApplied: true,
      timelineCommandRouted: true,
    },
    editedMedia: {
      byteSize: 4_096,
      mimeType: 'video/webm;codecs=vp8,opus',
      decodedWidth: 1_280,
      decodedHeight: 720,
      durationSeconds: 2.5,
      unboundedDuration: false,
      playbackObserved: true,
      ...overrides,
    },
  }
}

test('XR v2 readiness keeps deterministic source proof separate from runtime proof', () => {
  const sourceSnapshot = createXrV2ReadinessSnapshot({
    entryMode: 'inline-viewer',
  })
  assert.equal(sourceSnapshot.version, XR_V2_CONTRACT_VERSION)
  assert.equal(sourceSnapshot.scope, 'xr-authoring-edited-media-delivery')
  assert.equal(sourceSnapshot.overall, 'source-ready')
  assert.equal(sourceSnapshot.evidence.capabilityDetection, 'source-backed')
  assert.equal(sourceSnapshot.evidence.captureFallback, 'source-backed')
  assert.equal(sourceSnapshot.evidence.authoringAdapters, 'source-backed')
  assert.equal(sourceSnapshot.evidence.liveDepthSynthesis, 'blocked')
  assert.equal(sourceSnapshot.evidence.browserPlayback, 'blocked')
  assert.equal(sourceSnapshot.evidence.physicalDevice, 'blocked')
  assert.deepEqual(sourceSnapshot.blockedReasons, [
    'same-origin depth model assets are not admitted',
    'reference-device frame-budget proof is absent',
    'physical XR device proof is absent',
    'canonical-main browser runtime proof is absent',
  ])
})

test('edited-media observations validate without promoting source readiness', () => {
  const evidence = validEvidence()
  assert.equal(validateXrV2DevRuntimeEvidence(evidence).status, 'valid')

  const sourceSnapshot = createXrV2ReadinessSnapshot({
    entryMode: 'immersive-session',
    // Runtime callers cannot gain readiness authority by supplying observations.
    runtimeEvidence: evidence,
  } as never)
  assert.equal(sourceSnapshot.overall, 'source-ready')
  assert.equal(sourceSnapshot.scope, 'xr-authoring-edited-media-delivery')
  assert.equal(sourceSnapshot.evidence.authoringAdapters, 'source-backed')
  assert.equal(sourceSnapshot.evidence.browserPlayback, 'blocked')
  assert.equal(sourceSnapshot.evidence.liveDepthSynthesis, 'blocked')
  assert.equal(sourceSnapshot.evidence.physicalDevice, 'blocked')
  assert.deepEqual(sourceSnapshot.blockedReasons, [
    'same-origin depth model assets are not admitted',
    'reference-device frame-budget proof is absent',
    'physical XR device proof is absent',
    'canonical-main browser runtime proof is absent',
  ])
})

test('unbounded edited media is valid only when duration is explicitly absent', () => {
  assert.equal(validateXrV2DevRuntimeEvidence(validEvidence({
    durationSeconds: null,
    unboundedDuration: true,
  })).status, 'valid')
  assert.deepEqual(validateXrV2DevRuntimeEvidence(validEvidence({
    durationSeconds: 3,
    unboundedDuration: true,
  })), { status: 'invalid', reason: 'invalid-media-evidence' })
})

test('invalid or incomplete observations fail closed', () => {
  const invalidCandidates: unknown[] = [
    undefined,
    { ...validEvidence(), schema: 'knowgrph-xr-v2-dev-runtime-evidence/v0' },
    {
      ...validEvidence(),
      authoringAdapters: { ...validEvidence().authoringAdapters, materialApplied: false },
    },
    {
      ...validEvidence(),
      authoringAdapters: { ...validEvidence().authoringAdapters, unexpected: true },
    },
    validEvidence({ byteSize: 0 }),
    validEvidence({ mimeType: 'audio/webm' }),
    validEvidence({ decodedWidth: 0 }),
    validEvidence({ decodedHeight: 0 }),
    validEvidence({ durationSeconds: 0 }),
    validEvidence({ playbackObserved: false }),
    {
      ...validEvidence(),
      editedMedia: { ...validEvidence().editedMedia, unexpected: true },
    },
    { ...validEvidence(), unexpected: true },
  ]

  for (const candidate of invalidCandidates) {
    assert.equal(validateXrV2DevRuntimeEvidence(candidate).status, 'invalid')
  }
})
