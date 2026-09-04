import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import test from 'node:test'
import {
  collectOsvPackages,
  isTransientNpmAuditFailure,
  NPM_AUDIT_TIMEOUT_MARKER,
  runAuditCommand,
  runNpmAuditWithRetry,
  runOsvAudit,
} from '../npm-audit.mjs'

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

test('npm audit uses a successful OSV fallback only after a transient provider failure', async () => {
  let fallbackCalls = 0
  const result = await runNpmAuditWithRetry({
    retryDelaysMs: [],
    runAudit: async () => ({ code: 124, output: NPM_AUDIT_TIMEOUT_MARKER }),
    runFallback: async () => {
      fallbackCalls += 1
      return { code: 0, output: 'OSV exact package inventory passed\n' }
    },
  })
  assert.equal(result.code, 0)
  assert.equal(fallbackCalls, 1)
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
  assert.equal(isTransientNpmAuditFailure(NPM_AUDIT_TIMEOUT_MARKER), true)
  assert.equal(isTransientNpmAuditFailure('npm warn audit 503 Service Unavailable'), false)
  assert.equal(isTransientNpmAuditFailure('npm error audit endpoint returned an error'), false)
})

test('npm audit owns a hard child-process deadline', async () => {
  const child = new EventEmitter()
  child.stdout = new EventEmitter()
  child.stderr = new EventEmitter()
  const signals = []
  child.kill = signal => {
    signals.push(signal)
    queueMicrotask(() => child.emit('close', null))
    return true
  }

  const result = await runAuditCommand(['audit'], {
    spawnProcess: () => child,
    timeoutMs: 1,
    killGraceMs: 1,
  })

  assert.equal(result.code, 124)
  assert.match(result.output, /npm audit command timed out after 1ms/)
  assert.deepEqual(signals, ['SIGTERM'])
})

test('OSV inventory includes only exact registry packages and honors omit-dev', () => {
  const lockfile = { packages: {
    'node_modules/a': { version: '1.0.0', resolved: 'https://registry.npmjs.org/a/-/a-1.0.0.tgz' },
    'node_modules/a/node_modules/b': { version: '2.0.0', resolved: 'https://registry.npmjs.org/b/-/b-2.0.0.tgz', dev: true },
    'node_modules/c': { version: '3.0.0', resolved: 'git+ssh://git@example.test/c.git' },
  } }
  assert.deepEqual(collectOsvPackages(lockfile), [
    { name: 'a', version: '1.0.0' },
    { name: 'b', version: '2.0.0' },
  ])
  assert.deepEqual(collectOsvPackages(lockfile, { omitDev: true }), [
    { name: 'a', version: '1.0.0' },
  ])
})

test('OSV fallback fails closed on an exact vulnerable package result', async () => {
  const lockfile = { packages: {
    'node_modules/a': { version: '1.0.0', resolved: 'https://registry.npmjs.org/a/-/a-1.0.0.tgz' },
  } }
  const result = await runOsvAudit({
    readFileImpl: async () => JSON.stringify(lockfile),
    fetchImpl: async (_url, options) => {
      const request = JSON.parse(options.body)
      assert.equal(request.queries[0].package.name, 'a')
      return { ok: true, json: async () => ({ results: [{ vulns: [{ id: 'OSV-TEST-1' }] }] }) }
    },
  })
  assert.equal(result.code, 1)
  assert.match(result.output, /a@1\.0\.0 OSV-TEST-1/u)
})
