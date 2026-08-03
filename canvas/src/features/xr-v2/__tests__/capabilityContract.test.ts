import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { XrCapabilitySnapshot } from '../../../lib/three/ThreeGraphXrSessionPolicy'
import {
  XR_V2_CAPABILITY_PROJECTION_SCHEMA,
  XR_V2_ENTRY_MODES,
  resolveXrV2CapabilityProjection,
} from '../capabilityContract'

function capability(
  entryMode: XrCapabilitySnapshot['recommended_entry_mode'],
  monocularCapture = false,
): XrCapabilitySnapshot {
  return Object.freeze({
    schema: 'knowgrph-xr-capability-snapshot/v1',
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
