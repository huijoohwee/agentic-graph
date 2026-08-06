import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import { resolveXrV2ImmersiveMode } from '../xrV2ImmersiveSessionRuntime'

test('immersive entry is admitted only by one ready pinned tier', () => {
  assert.equal(resolveXrV2ImmersiveMode({
    canOfferUserActions: false,
    capabilityTier: 'webxr-ar',
  }), null)
  assert.equal(resolveXrV2ImmersiveMode({
    canOfferUserActions: true,
    capabilityTier: 'webxr-ar',
  }), 'immersive-ar')
  assert.equal(resolveXrV2ImmersiveMode({
    canOfferUserActions: true,
    capabilityTier: 'webxr-vr',
  }), 'immersive-vr')
  assert.equal(resolveXrV2ImmersiveMode({
    canOfferUserActions: true,
    capabilityTier: 'pseudo-ar-depth-parallax',
  }), null)
  assert.equal(resolveXrV2ImmersiveMode({
    canOfferUserActions: true,
    capabilityTier: 'flat-fallback',
  }), null)
})

test('XR v2 session runtime consumes readiness and never re-probes support', () => {
  const source = readFileSync(new URL('../xrV2ImmersiveSessionRuntime.ts', import.meta.url), 'utf8')
  assert.match(source, /readXrV2WorkspaceReadiness/)
  assert.doesNotMatch(source, /reportXrV2ImmersiveSessionObservation/)
  assert.doesNotMatch(source, /isSessionSupported/)
  assert.match(source, /requestSession/)
})
