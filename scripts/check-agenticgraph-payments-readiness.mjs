#!/usr/bin/env node

import path from 'node:path'
import process from 'node:process'

import {
  inspectKnowgrphPaymentsReadiness,
  readKnowgrphPaymentsProviderProof,
} from './lib/knowgrph-payments-readiness.mjs'
import { hasFlag, readArgValue } from './stripe-payment-script-runtime.mjs'

const args = process.argv.slice(2)
const root = path.resolve(readArgValue(args, '--root', process.cwd()))
const providerProofPath = readArgValue(args, '--provider-proof', '')
const json = hasFlag(args, '--json')
const { proof, error } = readKnowgrphPaymentsProviderProof(
  providerProofPath ? path.resolve(providerProofPath) : '',
)
const report = await inspectKnowgrphPaymentsReadiness({
  root,
  providerProof: proof,
  providerProofError: error,
  requireTracked: false,
  executeLocalVcc: true,
})

if (json) {
  console.log(JSON.stringify(report, null, 2))
} else {
  for (const [gate, result] of Object.entries(report.gates)) {
    console.log(`${result.status === 'pass' ? 'ok' : 'not ok'} ${gate}: ${result.status}`)
  }
  if (report.ok) {
    console.log('[knowgrph] payments are ready for protected integration; no canonical or deployment claim is implied.')
  } else {
    console.error(`[knowgrph] payments runtime readiness is blocked by ${report.blockers.length} explicit blocker(s).`)
  }
}

if (!report.ok) process.exitCode = 1
