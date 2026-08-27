import assert from 'node:assert/strict'
import test from 'node:test'
import {
  canonicalWorkerScriptUrl,
  isAcceptedWorkerScriptUrl,
} from '../production-service-worker-registration-proof.mjs'

const profileOrigin = 'https://joohwee.pages.dev'
const expectedRevision = 'a'.repeat(40)
const unversionedWorkerUrl = `${profileOrigin}/agenticgraph/sw.js`
const revisionBoundWorkerUrl = canonicalWorkerScriptUrl(profileOrigin, expectedRevision)

test('prewarm accepts predecessor workers registered before revision-bound URLs', () => {
  for (const scriptUrl of [unversionedWorkerUrl, revisionBoundWorkerUrl]) {
    assert.equal(isAcceptedWorkerScriptUrl({
      scriptUrl,
      profileOrigin,
      expectedRevision,
      requireRevisionBoundRegistration: false,
    }), true)
  }
})

test('post-deploy proof requires the exact revision-bound worker URL', () => {
  assert.equal(isAcceptedWorkerScriptUrl({
    scriptUrl: revisionBoundWorkerUrl,
    profileOrigin,
    expectedRevision,
    requireRevisionBoundRegistration: true,
  }), true)
  assert.equal(isAcceptedWorkerScriptUrl({
    scriptUrl: unversionedWorkerUrl,
    profileOrigin,
    expectedRevision,
    requireRevisionBoundRegistration: true,
  }), false)
  assert.equal(isAcceptedWorkerScriptUrl({
    scriptUrl: canonicalWorkerScriptUrl(profileOrigin, 'b'.repeat(40)),
    profileOrigin,
    expectedRevision,
    requireRevisionBoundRegistration: true,
  }), false)
})

test('registration proof rejects a worker owned by another origin', () => {
  assert.equal(isAcceptedWorkerScriptUrl({
    scriptUrl: canonicalWorkerScriptUrl('https://example.com', expectedRevision),
    profileOrigin,
    expectedRevision,
    requireRevisionBoundRegistration: false,
  }), false)
})
