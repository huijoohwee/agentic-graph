import assert from 'node:assert/strict'
import { test } from 'node:test'

import type { XrCapabilitySnapshot } from '../../../lib/three/ThreeGraphXrSessionPolicy'
import {
  resolveXrV2CapabilityDecision,
  type XrV2CapabilityDecision,
  type XrV2ImmersiveMode,
} from '../capabilityContract'
import {
  XR_V2_MAX_PROGRESSIVE_VIEWER_ATTEMPTS,
  planXrV2ProgressiveViewer,
} from '../progressiveViewerPlan'

function capability(immersive: boolean): XrCapabilitySnapshot {
  return Object.freeze({
    schema: 'knowgrph-xr-capability-snapshot/v1',
    inline_viewer: true,
    immersive_viewer: immersive,
    monocular_capture: false,
    capture_motion: false,
    native_handoff: false,
    recommended_entry_mode: immersive ? 'immersive-session' : 'inline-viewer',
    reason_codes: [],
  })
}

function decision(input: Readonly<{
  immersiveMode: XrV2ImmersiveMode | null
  depth: boolean
}>): XrV2CapabilityDecision {
  return resolveXrV2CapabilityDecision({
    capability: capability(input.immersiveMode !== null),
    immersiveMode: input.immersiveMode,
    depthParallaxAssetAdmitted: input.depth,
  })
}

test('progressive planner starts at the selected tier and always terminates at flat fallback', () => {
  const matrix = [
    decision({ immersiveMode: 'immersive-ar', depth: true }),
    decision({ immersiveMode: 'immersive-vr', depth: false }),
    decision({ immersiveMode: null, depth: true }),
    decision({ immersiveMode: null, depth: false }),
  ]

  for (const capabilityDecision of matrix) {
    const plan = planXrV2ProgressiveViewer(capabilityDecision)
    assert.equal(plan.selectedTier, capabilityDecision.tier)
    assert.equal(plan.attempts[0]?.tier, capabilityDecision.tier)
    assert.equal(plan.attempts.at(-1)?.tier, 'flat-fallback')
    assert.equal(plan.flatFallbackIncluded, true)
    assert.ok(plan.attempts.length <= XR_V2_MAX_PROGRESSIVE_VIEWER_ATTEMPTS)
    assert.deepEqual(
      plan.attempts.map(attempt => attempt.order),
      plan.attempts.map((_, index) => index),
    )
    assert.equal(new Set(plan.attempts.map(attempt => attempt.tier)).size, plan.attempts.length)
    assert.equal(Object.isFrozen(plan), true)
    assert.equal(Object.isFrozen(plan.attempts), true)
  }
})

test('planner records candidates only and never promotes them to runtime evidence', () => {
  const plan = planXrV2ProgressiveViewer(
    decision({ immersiveMode: 'immersive-ar', depth: true }),
  )

  assert.deepEqual(plan.attempts.map(attempt => attempt.tier), [
    'webxr-ar',
    'pseudo-ar-depth-parallax',
    'flat-fallback',
  ])
  assert.equal(plan.runtimeReadiness, 'not-observed')
  assert.equal(plan.attempts.every(attempt => attempt.runtimeEvidence === 'not-observed'), true)
  assert.equal(plan.attempts.every(attempt => attempt.requiresRuntimeAdmission), true)
})

test('negative iOS constraint cannot be undone by progressive planning', () => {
  const constrained = resolveXrV2CapabilityDecision({
    capability: capability(true),
    immersiveMode: 'immersive-ar',
    negativePlatformConstraint: 'ios-webxr-unavailable',
    depthParallaxAssetAdmitted: true,
  })
  const plan = planXrV2ProgressiveViewer(constrained)

  assert.equal(constrained.tier, 'pseudo-ar-depth-parallax')
  assert.deepEqual(plan.attempts.map(attempt => attempt.tier), [
    'pseudo-ar-depth-parallax',
    'flat-fallback',
  ])
  assert.equal(plan.attempts.some(attempt => attempt.tier.startsWith('webxr-')), false)
})
