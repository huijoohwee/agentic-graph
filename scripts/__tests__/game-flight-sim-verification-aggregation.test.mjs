import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import {
  runIsolatedBrowserProof,
  runSerialBrowserProof,
} from '../lib/game-flight-sim-browser-proof-orchestration.mjs'
import {
  prepareFlightSimBrowserEvidencePublication,
  publishFlightSimBrowserEvidence,
} from '../lib/game-flight-sim-browser-evidence-publication.mjs'
import {
  assertExactFlightSimBrowserVerificationLedger,
  readFlightSimBrowserVerificationNames,
} from '../lib/game-flight-sim-browser-evidence.mjs'
import {
  captureGitRepositoryState,
  repositoryStatesEqual,
} from '../lib/git-repository-state.mjs'
import {
  NamedVerificationAggregateError,
} from '../lib/named-verification-runner.mjs'
import {
  FLIGHT_SIM_RUNTIME_VERIFICATIONS,
  runFlightSimRuntimeReadiness,
} from '../run-game-flight-sim-runtime-ready.mjs'

const QUIET_LOGGER = Object.freeze({
  error() {},
  info() {},
})

function git(repositoryRoot, args) {
  return execFileSync('git', args, {
    cwd: repositoryRoot,
    encoding: 'utf8',
  }).trim()
}

async function createFixtureRepository() {
  const repositoryRoot = await mkdtemp(
    path.join(os.tmpdir(), 'knowgrph-flight-verification-'),
  )
  git(repositoryRoot, ['init', '--quiet'])
  git(repositoryRoot, ['config', 'user.email', 'flight-proof@example.invalid'])
  git(repositoryRoot, ['config', 'user.name', 'Flight Proof'])
  const sentinelPath = path.join(repositoryRoot, 'sentinel.txt')
  await Promise.all([
    mkdir(path.join(repositoryRoot, 'node_modules')),
    writeFile(
      path.join(repositoryRoot, '.gitignore'),
      'node_modules/\n',
      'utf8',
    ),
    writeFile(
      path.join(repositoryRoot, 'package.json'),
      '{"name":"flight-proof-fixture","private":true,"workspaces":[]}\n',
      'utf8',
    ),
    writeFile(sentinelPath, 'byte-stable sentinel\n', 'utf8'),
  ])
  git(repositoryRoot, ['add', '.gitignore', 'package.json', 'sentinel.txt'])
  git(repositoryRoot, ['commit', '--quiet', '-m', 'fixture'])
  return Object.freeze({ repositoryRoot, sentinelPath })
}

async function repositoryEvidence(fixture) {
  return Object.freeze({
    bytes: await readFile(fixture.sentinelPath),
    state: await captureGitRepositoryState(fixture.repositoryRoot),
    status: git(fixture.repositoryRoot, [
      'status',
      '--porcelain=v1',
      '--untracked-files=all',
    ]),
  })
}

function assertAggregate(error, expectedNames) {
  assert.ok(error instanceof NamedVerificationAggregateError)
  assert.deepEqual(
    error.failures.map(failure => failure.name),
    expectedNames,
  )
  for (const expectedName of expectedNames) {
    assert.match(error.message, new RegExp(expectedName))
  }
  return true
}

test('runtime readiness rejects an initially dirty checkout before executing stages', async t => {
  const fixture = await createFixtureRepository()
  t.after(() => rm(fixture.repositoryRoot, { recursive: true, force: true }))
  await writeFile(fixture.sentinelPath, 'dirty but byte-stable sentinel\n', 'utf8')
  const before = await repositoryEvidence(fixture)
  const executed = []

  await assert.rejects(
    runFlightSimRuntimeReadiness({
      execute: async verification => {
        executed.push(verification.name)
      },
      log: QUIET_LOGGER,
      repositoryRoot: fixture.repositoryRoot,
    }),
    error => assertAggregate(error, ['clean checkout preflight']),
  )

  assert.deepEqual(executed, [])
  const after = await repositoryEvidence(fixture)
  assert.equal(repositoryStatesEqual(before.state, after.state), true)
  assert.deepEqual(after.bytes, before.bytes)
  assert.equal(after.status, before.status)
})

test('runtime readiness executes every stage and reports every injected failure without repository mutation', async t => {
  const fixture = await createFixtureRepository()
  t.after(() => rm(fixture.repositoryRoot, { recursive: true, force: true }))
  const before = await repositoryEvidence(fixture)
  const executed = []
  const failedNames = new Set(['source authority', 'Canvas TypeScript'])

  await assert.rejects(
    runFlightSimRuntimeReadiness({
      createWorkspace: async repositoryRoot => ({
        repositoryRoot,
        async dispose() {},
      }),
      execute: async verification => {
        executed.push(verification.name)
        if (failedNames.has(verification.name)) {
          throw new Error(`injected ${verification.name} failure`)
        }
      },
      log: QUIET_LOGGER,
      repositoryRoot: fixture.repositoryRoot,
    }),
    error => assertAggregate(error, [...failedNames]),
  )

  assert.deepEqual(
    executed,
    FLIGHT_SIM_RUNTIME_VERIFICATIONS.map(verification => verification.name),
  )
  const after = await repositoryEvidence(fixture)
  assert.equal(repositoryStatesEqual(before.state, after.state), true)
  assert.deepEqual(after.bytes, before.bytes)
  assert.equal(after.status, before.status)
})

test('runtime readiness discards tracked and untracked child mutations from its isolated checkout', async t => {
  const fixture = await createFixtureRepository()
  t.after(() => rm(fixture.repositoryRoot, { recursive: true, force: true }))
  const before = await repositoryEvidence(fixture)
  let isolatedRepositoryRoot = null

  await assert.rejects(
    runFlightSimRuntimeReadiness({
      execute: async (verification, repositoryRoot) => {
        isolatedRepositoryRoot = repositoryRoot
        if (verification.name !== 'source authority') return
        await Promise.all([
          writeFile(
            path.join(repositoryRoot, 'sentinel.txt'),
            'mutated only inside child checkout\n',
            'utf8',
          ),
          writeFile(
            path.join(repositoryRoot, 'injected-untracked.txt'),
            'child-owned untracked bytes\n',
            'utf8',
          ),
        ])
        throw new Error('injected source authority failure after mutation')
      },
      log: QUIET_LOGGER,
      repositoryRoot: fixture.repositoryRoot,
    }),
    error => assertAggregate(error, [
      'source authority',
      'repository source immutability',
    ]),
  )

  assert.notEqual(isolatedRepositoryRoot, fixture.repositoryRoot)
  const after = await repositoryEvidence(fixture)
  assert.equal(repositoryStatesEqual(before.state, after.state), true)
  assert.deepEqual(after.bytes, before.bytes)
  assert.equal(after.status, before.status)
  await assert.rejects(
    readFile(path.join(fixture.repositoryRoot, 'injected-untracked.txt')),
    error => error?.code === 'ENOENT',
  )
})

test('browser orchestration reports failures from both serial runs and preserves repository bytes', async t => {
  const fixture = await createFixtureRepository()
  t.after(() => rm(fixture.repositoryRoot, { recursive: true, force: true }))
  const before = await repositoryEvidence(fixture)
  const executed = []
  let candidateChecks = 0
  let cleanupCalls = 0

  await assert.rejects(
    runSerialBrowserProof({
      assertExactCandidate: async () => {
        candidateChecks += 1
      },
      clearPriorEvidence: async () => {
        cleanupCalls += 1
      },
      executeRun: async runIndex => {
        executed.push(runIndex)
        throw new Error(`injected verifier failure ${runIndex}`)
      },
      log: QUIET_LOGGER,
      runCount: 2,
      validateRunEvidence: async () => {
        assert.fail('failed browser runs must not validate stale evidence')
      },
    }),
    error => assertAggregate(error, [
      'serial browser run 1',
      'serial browser run 2',
    ]),
  )

  assert.deepEqual(executed, [1, 2])
  assert.equal(candidateChecks, 3)
  assert.equal(cleanupCalls, 1)
  const after = await repositoryEvidence(fixture)
  assert.equal(repositoryStatesEqual(before.state, after.state), true)
  assert.deepEqual(after.bytes, before.bytes)
  assert.equal(after.status, before.status)
})

test('browser wrapper discards tracked and untracked mutations detected inside its isolated child', async t => {
  const fixture = await createFixtureRepository()
  t.after(() => rm(fixture.repositoryRoot, { recursive: true, force: true }))
  const before = await repositoryEvidence(fixture)
  let isolatedRepositoryRoot = null

  await assert.rejects(
    runIsolatedBrowserProof({
      repositoryRoot: fixture.repositoryRoot,
      runProof: async repositoryRoot => {
        isolatedRepositoryRoot = repositoryRoot
        const exactState = await captureGitRepositoryState(repositoryRoot)
        return runSerialBrowserProof({
          assertExactCandidate: async () => {
            const current = await captureGitRepositoryState(repositoryRoot)
            if (!repositoryStatesEqual(exactState, current)) {
              throw new Error('injected browser child mutation detected')
            }
          },
          clearPriorEvidence: async () => {},
          executeRun: async () => {
            await Promise.all([
              writeFile(
                path.join(repositoryRoot, 'sentinel.txt'),
                'browser child tracked mutation\n',
                'utf8',
              ),
              writeFile(
                path.join(repositoryRoot, 'browser-untracked.txt'),
                'browser child untracked mutation\n',
                'utf8',
              ),
            ])
            throw new Error('injected browser verifier failure')
          },
          log: QUIET_LOGGER,
          runCount: 2,
          validateRunEvidence: async () => {
            assert.fail('failed browser run must not validate evidence')
          },
        })
      },
    }),
    error => assertAggregate(error, [
      'serial browser run 1',
      'exact candidate after browser run 1',
      'repository source immutability',
    ]),
  )

  assert.notEqual(isolatedRepositoryRoot, fixture.repositoryRoot)
  const after = await repositoryEvidence(fixture)
  assert.equal(repositoryStatesEqual(before.state, after.state), true)
  assert.deepEqual(after.bytes, before.bytes)
  assert.equal(after.status, before.status)
  await assert.rejects(
    readFile(path.join(fixture.repositoryRoot, 'browser-untracked.txt')),
    error => error?.code === 'ENOENT',
  )
})

test('browser orchestration aggregates evidence failures after successful fresh runs', async () => {
  const validated = []
  const infoMessages = []
  await assert.rejects(
    runSerialBrowserProof({
      assertExactCandidate: async () => {},
      clearPriorEvidence: async () => {},
      executeRun: async () => {},
      log: {
        error() {},
        info(message) {
          infoMessages.push(message)
        },
      },
      runCount: 2,
      validateRunEvidence: async runIndex => {
        validated.push(runIndex)
        throw new Error(`injected evidence failure ${runIndex}`)
      },
    }),
    error => assertAggregate(error, [
      'browser evidence run 1',
      'browser evidence run 2',
    ]),
  )
  assert.deepEqual(validated, [1, 2])
  assert.equal(
    infoMessages.some(message => message.includes('browser-verification:pass')),
    false,
  )
})

test('browser exact-candidate preflight remains a hard gate before evidence mutation', async () => {
  let cleanupCalled = false
  let runCalled = false
  await assert.rejects(
    runSerialBrowserProof({
      assertExactCandidate: async () => {
        throw new Error('dirty checkout')
      },
      clearPriorEvidence: async () => {
        cleanupCalled = true
      },
      executeRun: async () => {
        runCalled = true
      },
      log: QUIET_LOGGER,
      runCount: 2,
      validateRunEvidence: async () => ({}),
    }),
    error => assertAggregate(error, ['exact candidate preflight']),
  )
  assert.equal(cleanupCalled, false)
  assert.equal(runCalled, false)
})

test('browser evidence publication rolls back every prior byte after an injected mid-publication failure', async t => {
  const fixtureRoot = await mkdtemp(
    path.join(os.tmpdir(), 'knowgrph-flight-evidence-publication-'),
  )
  t.after(() => rm(fixtureRoot, { recursive: true, force: true }))
  const sourceRoot = path.join(fixtureRoot, 'isolated-output')
  const destinationRoot = path.join(fixtureRoot, 'caller-output')
  const names = ['aggregate.json', 'run-1.json', 'run-2.json']
  await Promise.all([
    mkdir(sourceRoot),
    mkdir(destinationRoot),
  ])
  await Promise.all(names.map((name, index) => writeFile(
    path.join(sourceRoot, name),
    `new evidence ${index}\n`,
    'utf8',
  )))
  await Promise.all(names.slice(0, 2).map((name, index) => writeFile(
    path.join(destinationRoot, name),
    `prior evidence ${index}\n`,
    'utf8',
  )))

  await assert.rejects(
    publishFlightSimBrowserEvidence({
      destinationRoot,
      names,
      onPublishStep: ({ index }) => {
        if (index === 0) throw new Error('injected publication failure')
      },
      sourceRoot,
    }),
    /injected publication failure/,
  )

  assert.equal(
    await readFile(path.join(destinationRoot, names[0]), 'utf8'),
    'prior evidence 0\n',
  )
  assert.equal(
    await readFile(path.join(destinationRoot, names[1]), 'utf8'),
    'prior evidence 1\n',
  )
  await assert.rejects(
    readFile(path.join(destinationRoot, names[2])),
    error => error?.code === 'ENOENT',
  )
})

test('browser cleanup failure discards staged evidence before caller publication', async t => {
  const fixture = await createFixtureRepository()
  const evidenceRoot = await mkdtemp(
    path.join(os.tmpdir(), 'knowgrph-flight-evidence-cleanup-'),
  )
  t.after(() => Promise.all([
    rm(fixture.repositoryRoot, { recursive: true, force: true }),
    rm(evidenceRoot, { recursive: true, force: true }),
  ]))
  const sourceRoot = path.join(evidenceRoot, 'isolated-output')
  const destinationRoot = path.join(evidenceRoot, 'caller-output')
  const names = ['aggregate.json', 'run-1.json']
  await Promise.all([
    mkdir(sourceRoot),
    mkdir(destinationRoot),
  ])
  await Promise.all(names.flatMap((name, index) => [
    writeFile(
      path.join(sourceRoot, name),
      `new cleanup evidence ${index}\n`,
      'utf8',
    ),
    writeFile(
      path.join(destinationRoot, name),
      `prior cleanup evidence ${index}\n`,
      'utf8',
    ),
  ]))

  await assert.rejects(
    runIsolatedBrowserProof({
      createWorkspace: async repositoryRoot => ({
        repositoryRoot,
        token: 'fixture-token',
        async dispose() {
          throw new Error('injected isolated cleanup failure')
        },
      }),
      prepareEvidence: isolatedRepositoryRoot => {
        assert.equal(isolatedRepositoryRoot, fixture.repositoryRoot)
        return prepareFlightSimBrowserEvidencePublication({
          destinationRoot,
          names,
          sourceRoot,
        })
      },
      repositoryRoot: fixture.repositoryRoot,
      runProof: async () => ({ ok: true }),
    }),
    error => assertAggregate(error, ['isolated browser cleanup']),
  )

  for (const [index, name] of names.entries()) {
    assert.equal(
      await readFile(path.join(destinationRoot, name), 'utf8'),
      `prior cleanup evidence ${index}\n`,
    )
  }
  assert.deepEqual((await readdir(destinationRoot)).sort(), [...names].sort())
})

test('browser evidence rejects a non-empty all-passed verification subset', async () => {
  const requiredNames = await readFlightSimBrowserVerificationNames()
  const complete = requiredNames.map(name => ({ name, status: 'passed' }))
  assert.deepEqual(
    await assertExactFlightSimBrowserVerificationLedger(complete),
    requiredNames,
  )
  await assert.rejects(
    assertExactFlightSimBrowserVerificationLedger(complete.slice(0, -1)),
    error => {
      assert.match(error.message, /exact required all-passed inventory/)
      assert.match(error.message, /browser error surface/)
      return true
    },
  )
  await assert.rejects(
    assertExactFlightSimBrowserVerificationLedger([
      ...complete,
      { name: 'unexpected green check', status: 'passed' },
    ]),
    /unexpected green check/,
  )
})
