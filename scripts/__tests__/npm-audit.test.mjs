import assert from 'node:assert/strict'
import test from 'node:test'
import { isTransientNpmAuditFailure, runNpmAuditWithRetry } from '../npm-audit.mjs'

const serviceUnavailable = 'npm warn audit 503 Service Unavailable\nnpm error audit endpoint returned an error'
const networkTimeout = 'npm warn audit network timeout\nnpm error audit endpoint returned an error'

test('npm audit retries only bounded transient audit endpoint failures', async () => {
  const outcomes = [
    { code: 1, output: serviceUnavailable },
    { code: 1, output: networkTimeout },
    { code: 0, output: 'found 0 vulnerabilities' },
  ]
  const delays = []

  await runNpmAuditWithRetry({
    retryDelaysMs: [10, 20],
    runAudit: async () => outcomes.shift(),
    sleepImpl: async delayMs => delays.push(delayMs),
  })

  assert.deepEqual(delays, [10, 20])
  assert.equal(outcomes.length, 0)
})

test('npm audit stays fail-closed when transient endpoint failures exhaust the budget', async () => {
  let calls = 0
  await assert.rejects(
    runNpmAuditWithRetry({
      retryDelaysMs: [0, 0],
      runAudit: async () => {
        calls += 1
        return { code: 1, output: serviceUnavailable }
      },
      sleepImpl: async () => {},
    }),
    /npm audit exited with 1 after 3 attempts/,
  )
  assert.equal(calls, 3)
})

test('npm audit does not retry vulnerability findings or unrelated failures', async () => {
  let calls = 0
  await assert.rejects(
    runNpmAuditWithRetry({
      runAudit: async () => {
        calls += 1
        return { code: 1, output: 'found 2 vulnerabilities' }
      },
    }),
    /npm audit exited with 1$/,
  )
  assert.equal(calls, 1)
})

test('transient audit detection requires an audit transport failure', () => {
  assert.equal(isTransientNpmAuditFailure(serviceUnavailable), true)
  assert.equal(isTransientNpmAuditFailure(networkTimeout), true)
  assert.equal(isTransientNpmAuditFailure('npm warn audit 503 Service Unavailable'), false)
  assert.equal(isTransientNpmAuditFailure('npm error audit endpoint returned an error'), false)
})
