import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

import { NamedVerificationAggregateError } from '../lib/named-verification-runner.mjs'
import {
  runXrModeSourceSmoke,
  XR_MODE_SOURCE_VERIFICATIONS,
} from '../run-xr-mode-source-smoke.mjs'

const QUIET_LOGGER = Object.freeze({
  error() {},
  info() {},
})

test('root scripts keep XR Mode runtime readiness complete and local', () => {
  const manifest = JSON.parse(readFileSync(resolve(import.meta.dirname, '..', '..', 'package.json'), 'utf8'))
  assert.equal(
    manifest.scripts?.['xr-mode:source-ready'],
    'npm -C canvas run prepare:linked-packages && node ./scripts/run-xr-mode-source-smoke.mjs',
  )
  const runtimeReady = manifest.scripts?.['xr-mode:runtime-ready']
  assert.equal(
    runtimeReady,
    'npm run xr-mode:source-runner:test && npm run xr-mode:source-ready && npm -C canvas run test:smoke:xr-spatial-capture-fallback:browser',
  )
  for (const forbidden of ['wrangler', 'pages:deploy', 'cloudflare', 'docs:update']) {
    assert.ok(!runtimeReady.includes(forbidden), `runtime readiness must not mutate ${forbidden}`)
  }
})

test('XR Mode source smoke exports the complete E1 through E4 ledger', () => {
  assert.deepEqual(
    XR_MODE_SOURCE_VERIFICATIONS.map(verification => verification.testLabel),
    [
      'canvas.viewSelection.xrSurfaceMode',
      'canvas.xrMode.sharedSurfaceOwnershipBoundaries',
      'canvas.xrMode.physics.homeSceneAuthority',
      'canvas.xrMode.arPlacement',
      'canvas.xrMode.glbAssetRenderGate',
      'canvas.xrMode.gltfAssetRenderGate',
      'workspace.import.xrSpatialCapture',
      'canvas.xrAsset',
      'canvas.xrMode.nativeSessionPolicy',
      'xr.spatialCaptureFallback.browserSmokeContract',
      'xr.spatialCaptureFallback.readiness',
      'xr.spatialCaptureFallback.runtimeReady',
    ],
  )
})

test('XR Mode source smoke executes every stage and aggregates failures', async () => {
  const executed = []
  const failedNames = new Set([
    'XR spatial-capture ingest and runtime',
    'XR runtime-ready contract',
  ])

  await assert.rejects(
    runXrModeSourceSmoke({
      execute: async verification => {
        executed.push(verification.name)
        if (failedNames.has(verification.name)) {
          throw new Error(`injected ${verification.name} failure`)
        }
      },
      log: QUIET_LOGGER,
    }),
    error => {
      assert.ok(error instanceof NamedVerificationAggregateError)
      assert.equal(error.scope, 'XR Mode source smoke')
      assert.deepEqual(error.failures.map(failure => failure.name), [...failedNames])
      return true
    },
  )

  assert.deepEqual(
    executed,
    XR_MODE_SOURCE_VERIFICATIONS.map(verification => verification.name),
  )
})

test('XR Mode source smoke passes the repository root to every stage', async () => {
  const repositoryRoot = '/tmp/xr-mode-source-proof-fixture'
  const seenRoots = []

  const report = await runXrModeSourceSmoke({
    execute: async (_verification, candidateRepositoryRoot) => {
      seenRoots.push(candidateRepositoryRoot)
    },
    log: QUIET_LOGGER,
    repositoryRoot,
  })

  assert.equal(report.failures.length, 0)
  assert.deepEqual(
    seenRoots,
    XR_MODE_SOURCE_VERIFICATIONS.map(() => repositoryRoot),
  )
})
