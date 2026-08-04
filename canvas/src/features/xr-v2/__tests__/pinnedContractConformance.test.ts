import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  XR_V2_PINNED_CAPABILITY_TIERS,
  XR_V2_PINNED_CONFORMANCE_SCHEMA,
  XR_V2_PINNED_SOURCE_REVISION,
  resolveXrV2PinnedCapabilityTier,
  runXrV2PinnedContractConformanceProbe,
  validateXrV2PinnedContractConformanceEvidence,
  type XrV2PinnedContractConformanceEvidence,
} from '../pinnedContractConformance'

function mutableEvidence(
  evidence: XrV2PinnedContractConformanceEvidence,
): Record<string, any> {
  return JSON.parse(JSON.stringify(evidence)) as Record<string, any>
}

test('pinned capability projection is closed and honors an admitted platform constraint', () => {
  assert.deepEqual(XR_V2_PINNED_CAPABILITY_TIERS, [
    'webxr-ar',
    'webxr-vr',
    'pseudo-ar-depth-parallax',
    'flat-fallback',
  ])
  assert.equal(resolveXrV2PinnedCapabilityTier({
    entryMode: 'immersive-session',
    immersiveMode: 'immersive-ar',
    platformWebXrAllowed: true,
    depthParallaxAvailable: true,
  }), 'webxr-ar')
  assert.equal(resolveXrV2PinnedCapabilityTier({
    entryMode: 'immersive-session',
    immersiveMode: 'immersive-vr',
    platformWebXrAllowed: true,
    depthParallaxAvailable: false,
  }), 'webxr-vr')
  assert.equal(resolveXrV2PinnedCapabilityTier({
    entryMode: 'immersive-session',
    immersiveMode: 'immersive-ar',
    platformWebXrAllowed: false,
    depthParallaxAvailable: true,
  }), 'pseudo-ar-depth-parallax')
  assert.equal(resolveXrV2PinnedCapabilityTier({
    entryMode: 'unsupported',
    platformWebXrAllowed: false,
    depthParallaxAvailable: false,
  }), 'flat-fallback')
})

test('pinned probe executes deterministic AC evidence and retains runtime blockers', async () => {
  const evidence = await runXrV2PinnedContractConformanceProbe()
  assert.equal(evidence.schema, XR_V2_PINNED_CONFORMANCE_SCHEMA)
  assert.equal(evidence.pinnedSourceRevision, XR_V2_PINNED_SOURCE_REVISION)
  assert.equal(evidence.contractVersion, '2.0.0')
  assert.equal(evidence.overall, 'partial')
  assert.equal(evidence.deterministic.capabilityMatrixComplete, true)
  assert.equal(evidence.deterministic.captureFrameCount, 10)
  assert.equal(evidence.deterministic.stereoFrameCount, 9)
  assert.equal(evidence.deterministic.stereoCoverage, 0.9)
  assert.equal(evidence.deterministic.rawFramesUnique, true)
  assert.equal(evidence.deterministic.fallbackWithinConfiguredBreaches, true)
  assert.equal(evidence.deterministic.postProcessJobQueued, true)
  assert.equal(evidence.deterministic.ecsQueryCorrect, true)
  assert.equal(evidence.deterministic.materialGraphCompiled, true)
  assert.equal(evidence.deterministic.behaviorExactOnce, true)
  assert.equal(evidence.deterministic.behaviorUnwiredNoop, true)
  assert.equal(evidence.deterministic.particleCeilingRespected, true)
  assert.equal(evidence.deterministic.timelineInterpolationMatched, true)
  assert.equal(evidence.deterministic.processLocalPreviewPropagated, true)
  assert.deepEqual(Object.values(evidence.runtimeObservations), Array(8).fill('not-observed'))
  assert.deepEqual(
    evidence.acceptanceCriteria.map(entry => entry.criterion),
    Array.from({ length: 12 }, (_, index) => `AC-${index + 1}`),
  )
  assert.deepEqual(
    evidence.acceptanceCriteria.find(entry => entry.criterion === 'AC-11')?.blockedBy,
    ['trackPreservingContainerMux'],
  )
  assert.equal(Object.isFrozen(evidence), true)
  assert.equal(Object.isFrozen(evidence.deterministic), true)
  assert.equal(Object.isFrozen(evidence.acceptanceCriteria), true)
  assert.equal(validateXrV2PinnedContractConformanceEvidence(evidence).status, 'valid')
})

test('pinned validator rejects authority, proof, observation, and ledger tampering', async () => {
  const evidence = await runXrV2PinnedContractConformanceProbe()

  const extraEnvelopeKey = mutableEvidence(evidence)
  extraEnvelopeKey.promoted = true
  assert.deepEqual(validateXrV2PinnedContractConformanceEvidence(extraEnvelopeKey), {
    status: 'invalid', reason: 'invalid-envelope',
  })

  const wrongAuthority = mutableEvidence(evidence)
  wrongAuthority.pinnedSourceRevision = '0000000000000000000000000000000000000000'
  assert.deepEqual(validateXrV2PinnedContractConformanceEvidence(wrongAuthority), {
    status: 'invalid', reason: 'invalid-authority',
  })

  const incompleteDeterministicProof = mutableEvidence(evidence)
  incompleteDeterministicProof.deterministic.behaviorExactOnce = false
  assert.deepEqual(validateXrV2PinnedContractConformanceEvidence(incompleteDeterministicProof), {
    status: 'invalid', reason: 'deterministic-proof-incomplete',
  })

  const overclaimedRuntime = mutableEvidence(evidence)
  overclaimedRuntime.runtimeObservations.liveDepthModel = 'observed'
  assert.deepEqual(validateXrV2PinnedContractConformanceEvidence(overclaimedRuntime), {
    status: 'invalid', reason: 'runtime-observation-overreach',
  })

  const reorderedLedger = mutableEvidence(evidence)
  ;[reorderedLedger.acceptanceCriteria[0], reorderedLedger.acceptanceCriteria[1]] = [
    reorderedLedger.acceptanceCriteria[1],
    reorderedLedger.acceptanceCriteria[0],
  ]
  assert.deepEqual(validateXrV2PinnedContractConformanceEvidence(reorderedLedger), {
    status: 'invalid', reason: 'invalid-acceptance-ledger',
  })

  const promotedCriterion = mutableEvidence(evidence)
  promotedCriterion.acceptanceCriteria[0].status = 'deterministic-proven'
  assert.deepEqual(validateXrV2PinnedContractConformanceEvidence(promotedCriterion), {
    status: 'invalid', reason: 'invalid-acceptance-ledger',
  })
})
