import assert from 'node:assert/strict'
import test from 'node:test'

import { NamedVerificationAggregateError } from '../lib/named-verification-runner.mjs'
import {
  runXrV2SourceSmoke,
  XR_V2_SOURCE_VERIFICATIONS,
} from '../run-xr-v2-source-smoke.mjs'

const QUIET_LOGGER = Object.freeze({ error() {}, info() {} })

test('XR v2 source smoke exports the closed validation ledger', () => {
  assert.deepEqual(
    XR_V2_SOURCE_VERIFICATIONS.map(verification => verification.name),
    [
      'XR v2 public runtime adapter contract',
      'XR v2 browser smoke source contract',
      'XR v2 readiness documentation contract',
    ],
  )
})

test('XR v2 source smoke executes every stage and aggregates failures', async () => {
  const executed = []
  const failedNames = new Set([
    'XR v2 public runtime adapter contract',
    'XR v2 readiness documentation contract',
  ])
  await assert.rejects(
    runXrV2SourceSmoke({
      execute: async verification => {
        executed.push(verification.name)
        if (failedNames.has(verification.name)) throw new Error(`injected ${verification.name} failure`)
      },
      log: QUIET_LOGGER,
    }),
    error => {
      assert.ok(error instanceof NamedVerificationAggregateError)
      assert.equal(error.scope, 'XR v2 source smoke')
      assert.deepEqual(error.failures.map(failure => failure.name), [...failedNames])
      return true
    },
  )
  assert.deepEqual(executed, XR_V2_SOURCE_VERIFICATIONS.map(verification => verification.name))
})

test('XR v2 source smoke passes the requested repository root to every stage', async () => {
  const repositoryRoot = '/tmp/xr-v2-source-smoke-fixture'
  const seenRoots = []
  const report = await runXrV2SourceSmoke({
    execute: async (_verification, candidateRoot) => seenRoots.push(candidateRoot),
    log: QUIET_LOGGER,
    repositoryRoot,
  })
  assert.equal(report.failures.length, 0)
  assert.deepEqual(seenRoots, XR_V2_SOURCE_VERIFICATIONS.map(() => repositoryRoot))
})
