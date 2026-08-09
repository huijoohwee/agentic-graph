#!/usr/bin/env node

import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

import {
  collectNamedVerifications,
  throwForNamedFailures,
} from './lib/named-verification-runner.mjs'
import { verifyXrV2BrowserSmokeSourceContract } from './xr-v2/browser-smoke-contract.mjs'
import { verifyXrV2PinConsistency } from './xr-v2/pin-consistency-checker.mjs'
import { verifyXrV2ReadinessDocumentation } from './xr-v2/readiness-doc-contract.mjs'
import { verifyXrV2RuntimeSourceContract } from './xr-v2/runtime-source-contract.mjs'

const scriptPath = fileURLToPath(import.meta.url)
const defaultRepositoryRoot = resolve(dirname(scriptPath), '..')

export const XR_V2_SOURCE_VERIFICATIONS = Object.freeze([
  Object.freeze({
    name: 'XR v2 pin consistency',
    verify: verifyXrV2PinConsistency,
  }),
  Object.freeze({
    name: 'XR v2 public runtime adapter contract',
    verify: verifyXrV2RuntimeSourceContract,
  }),
  Object.freeze({
    name: 'XR v2 browser smoke source contract',
    verify: verifyXrV2BrowserSmokeSourceContract,
  }),
  Object.freeze({
    name: 'XR v2 readiness documentation contract',
    verify: verifyXrV2ReadinessDocumentation,
  }),
])

export async function runXrV2SourceSmoke({
  execute = (verification, repositoryRoot) => verification.verify(repositoryRoot),
  log = console,
  repositoryRoot = defaultRepositoryRoot,
} = {}) {
  const report = await collectNamedVerifications({
    execute: verification => execute(verification, repositoryRoot),
    log,
    verifications: XR_V2_SOURCE_VERIFICATIONS,
  })
  throwForNamedFailures('XR v2 source smoke', report.failures)
  return report
}

if (resolve(process.argv[1] || '') === scriptPath) {
  runXrV2SourceSmoke().catch(error => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
}
