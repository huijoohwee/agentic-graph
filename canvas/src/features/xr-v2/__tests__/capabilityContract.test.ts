import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { XrCapabilitySnapshot } from '../../../lib/three/ThreeGraphXrSessionPolicy'
import {
  XR_V2_CAPABILITY_DECISION_SCHEMA,
  XR_V2_CAPABILITY_PROJECTION_SCHEMA,
  XR_V2_CAPABILITY_TIERS,
  XR_V2_ENTRY_MODES,
  resolveXrV2CapabilityDecision,
  resolveXrV2CapabilityProjection,
} from '../capabilityContract'

function capability(
  entryMode: XrCapabilitySnapshot['recommended_entry_mode'],
  monocularCapture = false,
): XrCapabilitySnapshot {
  return Object.freeze({
    schema: 'agenticgraph-xr-capability-snapshot/v1',
    inline_viewer: entryMode !== 'unsupported',
    immersive_viewer: entryMode === 'immersive-session',
    monocular_capture: monocularCapture,
    capture_motion: false,
    native_handoff: entryMode === 'native-handoff',
    recommended_entry_mode: entryMode,
    reason_codes: [],
  })
}

test('v2 capability projection preserves every canonical entry mode', () => {
  assert.deepEqual(XR_V2_ENTRY_MODES, [
    'immersive-session',
    'inline-viewer',
    'monocular-capture',
    'native-handoff',
    'unsupported',
  ])

  for (const entryMode of XR_V2_ENTRY_MODES) {
    const projection = resolveXrV2CapabilityProjection({
      capability: capability(entryMode),
      depthEstimatorAvailable: false,
    })
    assert.equal(projection.schema, XR_V2_CAPABILITY_PROJECTION_SCHEMA)
    assert.equal(projection.contractVersion, '2.0.0')
    assert.equal(projection.entryMode, entryMode)
  }
})

test('capture readiness remains orthogonal to immersive entry selection', () => {
  const projection = resolveXrV2CapabilityProjection({
    capability: capability('immersive-session', true),
    depthEstimatorAvailable: true,
  })

  assert.equal(projection.entryMode, 'immersive-session')
  assert.equal(projection.capturePipeline, 'live-depth-preview')
  assert.equal(projection.canStartMonocularCapture, true)
  assert.equal(projection.cameraPermission, 'explicit-user-action-required')
})

test('capture projection degrades by injected readiness without changing entry mode', () => {
  const rawCapture = resolveXrV2CapabilityProjection({
    capability: capability('monocular-capture', true),
    depthEstimatorAvailable: false,
  })
  const unavailable = resolveXrV2CapabilityProjection({
    capability: capability('inline-viewer', false),
    depthEstimatorAvailable: true,
  })

  assert.equal(rawCapture.capturePipeline, 'raw-capture')
  assert.equal(rawCapture.entryMode, 'monocular-capture')
  assert.equal(unavailable.capturePipeline, 'unavailable')
  assert.equal(unavailable.entryMode, 'inline-viewer')
  assert.equal(unavailable.cameraPermission, 'unavailable')
})

test('four-tier capability decision is closed and derives immersive tiers only from admitted features', () => {
  assert.deepEqual(XR_V2_CAPABILITY_TIERS, [
    'webxr-ar',
    'webxr-vr',
    'pseudo-ar-depth-parallax',
    'flat-fallback',
  ])
  const matrix = [
    resolveXrV2CapabilityDecision({
      capability: capability('immersive-session'),
      immersiveMode: 'immersive-ar',
      depthParallaxAssetAdmitted: true,
    }),
    resolveXrV2CapabilityDecision({
      capability: capability('immersive-session'),
      immersiveMode: 'immersive-vr',
      depthParallaxAssetAdmitted: false,
    }),
    resolveXrV2CapabilityDecision({
      capability: capability('inline-viewer'),
      immersiveMode: null,
      depthParallaxAssetAdmitted: true,
    }),
    resolveXrV2CapabilityDecision({
      capability: capability('inline-viewer'),
      immersiveMode: null,
      depthParallaxAssetAdmitted: false,
    }),
  ]

  assert.deepEqual(matrix.map(decision => decision.tier), XR_V2_CAPABILITY_TIERS)
  assert.equal(matrix.every(decision => decision.schema === XR_V2_CAPABILITY_DECISION_SCHEMA), true)
  assert.equal(matrix.every(decision => XR_V2_CAPABILITY_TIERS.includes(decision.tier)), true)
  assert.equal(matrix.every(Object.isFrozen), true)
})

test('iOS-class constraint is negative-only and never promotes an unavailable feature', () => {
  for (const immersiveMode of ['immersive-ar', 'immersive-vr'] as const) {
    const unconstrained = resolveXrV2CapabilityDecision({
      capability: capability('immersive-session'),
      immersiveMode,
      depthParallaxAssetAdmitted: true,
    })
    const constrained = resolveXrV2CapabilityDecision({
      capability: capability('immersive-session'),
      immersiveMode,
      negativePlatformConstraint: 'ios-webxr-unavailable',
      depthParallaxAssetAdmitted: true,
    })
    assert.match(unconstrained.tier, /^webxr-/)
    assert.equal(constrained.tier, 'pseudo-ar-depth-parallax')
    assert.equal(constrained.demotedByPlatformConstraint, true)
    assert.deepEqual(constrained.reasons, [
      'ios-webxr-negative-constraint',
      'depth-parallax-asset-admitted',
    ])
  }

  const unavailable = capability('inline-viewer')
  const unconstrained = resolveXrV2CapabilityDecision({
    capability: unavailable,
    immersiveMode: 'immersive-ar',
    depthParallaxAssetAdmitted: false,
  })
  const constrained = resolveXrV2CapabilityDecision({
    capability: unavailable,
    immersiveMode: 'immersive-ar',
    negativePlatformConstraint: 'ios-webxr-unavailable',
    depthParallaxAssetAdmitted: false,
  })
  assert.equal(unconstrained.tier, 'flat-fallback')
  assert.equal(constrained.tier, 'flat-fallback')
  assert.equal(constrained.demotedByPlatformConstraint, false)
  assert.equal(constrained.immersiveMode, null)
  assert.deepEqual(constrained.reasons, ['flat-fallback-only'])
})
