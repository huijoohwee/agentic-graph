#!/usr/bin/env node

import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  executeVerificationCommand,
  XR_SPATIAL_CAPTURE_FALLBACK_SOURCE_VERIFICATIONS,
} from './run-xr-spatial-capture-fallback-source-smoke.mjs'
import {
  collectNamedVerifications,
  throwForNamedFailures,
} from './lib/named-verification-runner.mjs'

const scriptPath = fileURLToPath(import.meta.url)
const defaultRepositoryRoot = path.resolve(path.dirname(scriptPath), '..')

const XR_MODE_CORE_SOURCE_VERIFICATIONS = Object.freeze([
  Object.freeze({
    name: 'XR surface activation',
    testLabel: 'canvas.viewSelection.xrSurfaceMode',
  }),
  Object.freeze({
    name: 'XR shared surface ownership',
    testLabel: 'canvas.xrMode.sharedSurfaceOwnershipBoundaries',
  }),
  Object.freeze({
    name: 'XR canonical scene authority',
    testLabel: 'canvas.xrMode.physics.homeSceneAuthority',
  }),
  Object.freeze({
    name: 'XR AR placement lifecycle',
    testLabel: 'canvas.xrMode.arPlacement',
  }),
  Object.freeze({
    name: 'XR GLB inline render path',
    testLabel: 'canvas.xrMode.glbAssetRenderGate',
  }),
  Object.freeze({
    name: 'XR glTF inline render path',
    testLabel: 'canvas.xrMode.gltfAssetRenderGate',
  }),
  Object.freeze({
    name: 'XR spatial-capture ingest and runtime',
    testLabel: 'workspace.import.xrSpatialCapture',
  }),
  Object.freeze({
    name: 'XR deterministic asset conversion',
    testLabel: 'canvas.xrAsset',
  }),
])

export const XR_MODE_SOURCE_VERIFICATIONS = Object.freeze([
  ...XR_MODE_CORE_SOURCE_VERIFICATIONS,
  ...XR_SPATIAL_CAPTURE_FALLBACK_SOURCE_VERIFICATIONS,
])

export async function runXrModeSourceSmoke({
  execute = executeVerificationCommand,
  log = console,
  repositoryRoot = defaultRepositoryRoot,
} = {}) {
  const report = await collectNamedVerifications({
    execute: verification => execute(verification, repositoryRoot),
    log,
    verifications: XR_MODE_SOURCE_VERIFICATIONS,
  })
  throwForNamedFailures('XR Mode source smoke', report.failures)
  return report
}

if (path.resolve(process.argv[1] || '') === scriptPath) {
  runXrModeSourceSmoke().catch(error => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
}
