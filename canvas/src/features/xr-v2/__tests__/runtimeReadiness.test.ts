import assert from 'node:assert/strict'
import test from 'node:test'
import {
  XR_V2_CONTRACT_VERSION,
  createXrV2ReadinessSnapshot,
} from '../runtimeReadiness'

test('XR v2 readiness keeps deterministic source proof separate from runtime proof', () => {
  const sourceSnapshot = createXrV2ReadinessSnapshot({
    entryMode: 'inline-viewer',
  })
  assert.equal(sourceSnapshot.version, XR_V2_CONTRACT_VERSION)
  assert.equal(sourceSnapshot.overall, 'source-ready')
  assert.equal(sourceSnapshot.evidence.capabilityDetection, 'source-backed')
  assert.equal(sourceSnapshot.evidence.captureFallback, 'source-backed')
  assert.equal(sourceSnapshot.evidence.authoringAdapters, 'source-backed')
  assert.equal(sourceSnapshot.evidence.liveDepthSynthesis, 'blocked')
  assert.equal(sourceSnapshot.evidence.browserPlayback, 'blocked')
  assert.equal(sourceSnapshot.evidence.physicalDevice, 'blocked')
  assert.equal(sourceSnapshot.blockedReasons.length, 4)
})

test('XR v2 readiness becomes runtime-ready only when every external proof is present', () => {
  const runtimeSnapshot = createXrV2ReadinessSnapshot({
    entryMode: 'immersive-session',
    depthModelLoaded: true,
    referenceDeviceProven: true,
    browserPlaybackProven: true,
    physicalDeviceProven: true,
  })
  assert.equal(runtimeSnapshot.overall, 'runtime-ready')
  assert.deepEqual(runtimeSnapshot.blockedReasons, [])
  assert.deepEqual(new Set(Object.values(runtimeSnapshot.evidence)), new Set([
    'source-backed',
    'runtime-backed',
  ]))
})
