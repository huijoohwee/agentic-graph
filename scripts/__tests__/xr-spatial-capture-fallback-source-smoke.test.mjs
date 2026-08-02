import assert from 'node:assert/strict'
import test from 'node:test'

import { NamedVerificationAggregateError } from '../lib/named-verification-runner.mjs'
import {
  XR_SPATIAL_CAPTURE_FALLBACK_SOURCE_VERIFICATIONS,
  runXrSpatialCaptureFallbackSourceSmoke,
} from '../run-xr-spatial-capture-fallback-source-smoke.mjs'

const QUIET_LOGGER = Object.freeze({
  error() {},
  info() {},
})

function assertAggregate(error, expectedNames) {
  assert.ok(error instanceof NamedVerificationAggregateError)
  assert.equal(error.scope, 'XR spatial capture fallback source smoke')
  assert.deepEqual(
    error.failures.map(failure => failure.name),
    expectedNames,
  )
  for (const expectedName of expectedNames) {
    assert.match(error.message, new RegExp(expectedName))
  }
  return true
}

test('XR source smoke exports the canonical verification ledger', () => {
  assert.deepEqual(
    XR_SPATIAL_CAPTURE_FALLBACK_SOURCE_VERIFICATIONS.map(verification => verification.name),
    [
      'XR native session policy',
      'XR browser smoke contract',
      'XR readiness contract',
      'XR runtime-ready contract',
    ],
  )
  assert.deepEqual(
    XR_SPATIAL_CAPTURE_FALLBACK_SOURCE_VERIFICATIONS.map(verification => verification.testLabel),
    [
      'canvas.xrMode.nativeSessionPolicy',
      'xr.spatialCaptureFallback.browserSmokeContract',
      'xr.spatialCaptureFallback.readiness',
      'xr.spatialCaptureFallback.runtimeReady',
    ],
  )
})

test('XR source smoke executes the full ledger and aggregates injected failures', async () => {
  const executed = []
  const failedNames = new Set(['XR browser smoke contract', 'XR runtime-ready contract'])

  await assert.rejects(
    runXrSpatialCaptureFallbackSourceSmoke({
      execute: async verification => {
        executed.push(verification.name)
        if (failedNames.has(verification.name)) {
          throw new Error(`injected ${verification.name} failure`)
        }
      },
      log: QUIET_LOGGER,
    }),
    error => assertAggregate(error, [...failedNames]),
  )

  assert.deepEqual(
    executed,
    XR_SPATIAL_CAPTURE_FALLBACK_SOURCE_VERIFICATIONS.map(verification => verification.name),
  )
})

test('XR source smoke passes the requested repository root through to every stage', async () => {
  const repositoryRoot = '/tmp/xr-source-proof-fixture'
  const seenRoots = []

  const report = await runXrSpatialCaptureFallbackSourceSmoke({
    execute: async (_verification, candidateRepositoryRoot) => {
      seenRoots.push(candidateRepositoryRoot)
    },
    log: QUIET_LOGGER,
    repositoryRoot,
  })

  assert.equal(report.failures.length, 0)
  assert.deepEqual(
    seenRoots,
    XR_SPATIAL_CAPTURE_FALLBACK_SOURCE_VERIFICATIONS.map(() => repositoryRoot),
  )
})
