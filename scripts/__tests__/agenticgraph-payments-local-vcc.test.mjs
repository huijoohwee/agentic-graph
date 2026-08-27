import assert from 'node:assert/strict'
import test from 'node:test'

import {
  AGENTICGRAPH_PAYMENTS_LOCAL_VCC_SUITES,
  runAgenticGraphPaymentsLocalVcc,
  validateAgenticGraphPaymentsLocalVccAttestation,
} from '../lib/agenticgraph-payments-local-vcc.mjs'

const SOURCE_DIGEST = 'a'.repeat(64)

const tapOutput = ({ tests = 2, pass = tests, fail = 0 } = {}) => [
  'TAP version 13',
  `1..${tests}`,
  `# tests ${tests}`,
  `# pass ${pass}`,
  `# fail ${fail}`,
  '',
].join('\n')

const passingExecutor = async command => ({
  exitCode: 0,
  stdout: command.id === 'build-payment-client-and-shared-contracts'
    ? 'build complete\n'
    : command.id === 'canvas-payment-runtime'
      ? 'SUMMARY total=9 ok=9 failed=0\n'
      : tapOutput(),
  stderr: '',
})

test('local VCC runner executes the fixed inventory and binds passing results to source', async () => {
  const executedIds = []
  const result = await runAgenticGraphPaymentsLocalVcc({
    root: '/fixture',
    sourceEvidenceDigest: SOURCE_DIGEST,
    executor: async command => {
      executedIds.push(command.id)
      return passingExecutor(command)
    },
  })

  assert.equal(result.ok, true)
  assert.equal(result.validation.valid, true)
  assert.deepEqual(executedIds, [
    'build-payment-client-and-shared-contracts',
    ...AGENTICGRAPH_PAYMENTS_LOCAL_VCC_SUITES.map(suite => suite.id),
  ])
  assert.equal(result.attestation.sourceEvidenceDigest, SOURCE_DIGEST)
  assert.equal(result.attestation.preparation.status, 'pass')
  assert.equal(
    result.attestation.suites.find(suite => suite.id === 'canvas-payment-runtime')?.testCount,
    9,
  )
})

test('local VCC attestation rejects a failed or zero-test suite', async () => {
  const failed = await runAgenticGraphPaymentsLocalVcc({
    root: '/fixture',
    sourceEvidenceDigest: SOURCE_DIGEST,
    executor: async command => {
      if (command.id !== 'worker-payment-runtime') return passingExecutor(command)
      return {
        exitCode: 1,
        stdout: tapOutput({ tests: 2, pass: 1, fail: 1 }),
        stderr: 'worker assertion failed',
      }
    },
  })
  assert.equal(failed.ok, false)
  assert.match(failed.validation.failures.join('\n'), /worker-payment-runtime/)

  const zeroTests = await runAgenticGraphPaymentsLocalVcc({
    root: '/fixture',
    sourceEvidenceDigest: SOURCE_DIGEST,
    executor: async command => {
      if (command.id !== 'mcp-payment-contracts') return passingExecutor(command)
      return { exitCode: 0, stdout: tapOutput({ tests: 0 }), stderr: '' }
    },
  })
  assert.equal(zeroTests.ok, false)
  assert.match(zeroTests.validation.failures.join('\n'), /mcp-payment-contracts/)
})

test('local VCC attestation rejects source, inventory, and suite-result tampering', async () => {
  const result = await runAgenticGraphPaymentsLocalVcc({
    root: '/fixture',
    sourceEvidenceDigest: SOURCE_DIGEST,
    executor: passingExecutor,
  })

  const wrongSource = structuredClone(result.attestation)
  wrongSource.sourceEvidenceDigest = 'b'.repeat(64)
  assert.match(
    validateAgenticGraphPaymentsLocalVccAttestation(wrongSource, SOURCE_DIGEST)
      .failures.join('\n'),
    /not bound to this source evidence digest/,
  )

  const wrongInventory = structuredClone(result.attestation)
  wrongInventory.inventoryDigest = 'c'.repeat(64)
  assert.match(
    validateAgenticGraphPaymentsLocalVccAttestation(wrongInventory, SOURCE_DIGEST)
      .failures.join('\n'),
    /command inventory/,
  )

  const missingSuite = structuredClone(result.attestation)
  missingSuite.suites.pop()
  assert.match(
    validateAgenticGraphPaymentsLocalVccAttestation(missingSuite, SOURCE_DIGEST)
      .failures.join('\n'),
    /exact ordered allowlist/,
  )
})

test('failed preparation executes no suites and cannot attest readiness', async () => {
  const executedIds = []
  const result = await runAgenticGraphPaymentsLocalVcc({
    root: '/fixture',
    sourceEvidenceDigest: SOURCE_DIGEST,
    executor: async command => {
      executedIds.push(command.id)
      return { exitCode: 2, stdout: '', stderr: 'build failed' }
    },
  })

  assert.deepEqual(executedIds, ['build-payment-client-and-shared-contracts'])
  assert.equal(result.ok, false)
  assert.equal(result.attestation.suites.every(suite => suite.status === 'skipped'), true)
  assert.match(result.validation.failures.join('\n'), /preparation/)
})
