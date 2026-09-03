#!/usr/bin/env node

import path from 'node:path'
import process from 'node:process'

import { runAgenticGraphPaymentsLocalVcc } from './lib/agentic-graph-payments-local-vcc.mjs'
import { inspectAgenticGraphPaymentsReadiness } from './lib/agentic-graph-payments-readiness.mjs'
import { hasFlag, readArgValue } from './stripe-payment-script-runtime.mjs'

const args = process.argv.slice(2)
const root = path.resolve(readArgValue(args, '--root', process.cwd()))
const json = hasFlag(args, '--json')
const inspection = await inspectAgenticGraphPaymentsReadiness({
  root,
  requireTracked: false,
})
const sourceEvidenceDigest = inspection.sourceIdentity.evidenceDigest

if (!sourceEvidenceDigest) {
  console.error('[agentic-graph] local payment VCCs require a complete source-evidence digest.')
  process.exitCode = 1
} else {
  const executedResult = await runAgenticGraphPaymentsLocalVcc({ root, sourceEvidenceDigest })
  const finalInspection = await inspectAgenticGraphPaymentsReadiness({
    root,
    requireTracked: false,
  })
  const sourceDigestStable =
    finalInspection.sourceIdentity.evidenceDigest === sourceEvidenceDigest
  const finalSourceFailures = finalInspection.gates.source.checks
    .filter(check =>
      check.id !== 'executed-local-vcc-attestation'
      && check.status !== 'pass')
    .map(check => `Source check ${check.id} finished ${check.status}: ${check.detail}`)
  const executionStable =
    sourceDigestStable
    && finalSourceFailures.length === 0
  const result = executionStable
    ? executedResult
    : {
        ok: false,
        attestation: executedResult.attestation,
        validation: {
          valid: false,
          failures: [
            ...executedResult.validation.failures,
            ...(sourceDigestStable
              ? []
              : ['Source evidence changed while local VCCs executed.']),
            ...finalSourceFailures,
          ],
        },
      }
  if (json) {
    console.log(JSON.stringify(result, null, 2))
  } else if (result.ok) {
    const testCount = result.attestation.suites.reduce(
      (total, suite) => total + suite.testCount,
      0,
    )
    console.log(
      `[agentic-graph] ${result.attestation.suites.length} local payment VCC suites passed (${testCount} tests).`,
    )
    console.log(`[agentic-graph] source evidence ${sourceEvidenceDigest}`)
  } else {
    console.error(
      `[agentic-graph] local payment VCCs failed: ${result.validation.failures.join(' ')}`,
    )
  }
  if (!result.ok) process.exitCode = 1
}
