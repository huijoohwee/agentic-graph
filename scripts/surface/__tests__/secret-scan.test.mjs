import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { performance } from 'node:perf_hooks'
import test from 'node:test'
import {
  scanCandidate,
  scanCandidatePaths,
} from '../secret-scan.mjs'

const repositoryRoot = path.resolve(import.meta.dirname, '../../..')
const scriptPath = path.join(repositoryRoot, 'scripts/surface/secret-scan.mjs')
const fixedNow = '2026-07-27T12:00:00.000Z'

test('scanCandidate detects all four categories without returning matched values', () => {
  const detectedValues = [
    'sk-abcdefghijklmnopqrstuvwxyz123456',
    'https://storage.example.test/object?X-Amz-Signature=abcdef0123456789',
    '10.20.30.40',
    '/Users/example/private/config.json',
  ]
  const candidates = [
    { path: 'credential.txt', content: `key=${detectedValues[0]}` },
    { path: 'signed.txt', content: detectedValues[1] },
    { path: 'host.txt', content: `endpoint=http://${detectedValues[2]}/v1` },
    { path: 'path.txt', content: `config=${detectedValues[3]}` },
  ]
  const before = candidates.map(candidate => ({ ...candidate }))

  const result = scanCandidate(candidates, {
    now: fixedNow,
    monotonicNow: () => 0,
  })

  assert.equal(result.complete, true)
  assert.equal(result.scannedCount, 4)
  assert.equal(result.timestamp, fixedNow)
  assert.deepEqual(
    new Set(result.matches.map(match => match.category)),
    new Set([
      'credential-material',
      'signed-url',
      'private-host',
      'local-absolute-path',
    ]),
  )
  assert.deepEqual(candidates, before)

  const report = JSON.stringify(result)
  for (const value of detectedValues) {
    for (let index = 0; index <= value.length - 8; index += 1) {
      assert.equal(report.includes(value.slice(index, index + 8)), false)
    }
  }
})

test('scanCandidate handles binary bytes and reports incomplete coverage or timeout', () => {
  const binary = scanCandidate(
    [{ path: 'binary.dat', bytes: Uint8Array.from([0, 255, 1, 2]) }],
    { now: fixedNow, monotonicNow: () => 0 },
  )
  assert.equal(binary.complete, true)
  assert.equal(binary.scannedCount, 1)

  const incomplete = scanCandidate(
    [{ path: 'missing.dat', content: null }],
    { now: fixedNow, monotonicNow: () => 0 },
  )
  assert.equal(incomplete.complete, false)
  assert.equal(incomplete.cause, 'incomplete-coverage')
  assert.equal(incomplete.scannedCount, 0)
  assert.deepEqual(incomplete.failure, {
    code: 'FC-SCAN-INCOMPLETE',
    cause: 'incomplete-coverage',
    deadlineMs: 300_000,
    unevaluatedCount: 1,
  })

  let tick = 0
  const timedOut = scanCandidate(
    [{ path: 'late.txt', content: 'safe' }],
    {
      timeoutMs: 5,
      now: fixedNow,
      monotonicNow: () => tick++ * 10,
    },
  )
  assert.equal(timedOut.complete, false)
  assert.equal(timedOut.cause, 'timeout')
  assert.equal(timedOut.scannedCount, 0)
  assert.equal(timedOut.failure.code, 'FC-SCAN-TIMEOUT')
  assert.equal(timedOut.unevaluatedCount, 1)
})

test('scanCandidatePaths returns a total incomplete result for unreadable paths', async () => {
  const result = await scanCandidatePaths(
    ['/path/that/does/not/exist'],
    { now: fixedNow, monotonicNow: () => 0 },
  )

  assert.equal(result.complete, false)
  assert.equal(result.scannedCount, 0)
  assert.equal(result.cause, 'incomplete-coverage')
})

test('scanCandidatePaths aborts a hung read at the hard deadline', async () => {
  let aborted = false
  const startedAt = performance.now()
  const result = await scanCandidatePaths(['hung-candidate.txt'], {
    timeoutMs: 20,
    now: fixedNow,
    readCandidate: (_candidatePath, { signal }) => new Promise((resolve, reject) => {
      signal.addEventListener('abort', () => {
        aborted = true
        reject(signal.reason)
      }, { once: true })
    }),
  })

  assert.ok(performance.now() - startedAt < 500)
  assert.equal(aborted, true)
  assert.equal(result.complete, false)
  assert.equal(result.scannedCount, 0)
  assert.equal(result.cause, 'timeout')
  assert.equal(result.unevaluatedCount, 1)
  assert.deepEqual(result.failure, {
    code: 'FC-SCAN-TIMEOUT',
    cause: 'timeout',
    deadlineMs: 20,
    unevaluatedCount: 1,
  })
})

test('secret scan CLI emits only safe metadata for a detection', async t => {
  const fixtureRoot = await mkdtemp(path.join(os.tmpdir(), 'surface-secret-cli-'))
  t.after(() => rm(fixtureRoot, { recursive: true, force: true }))
  const secret = 'sk-zyxwvutsrqponmlkjihgfedcba987654'
  const candidatePath = path.join(fixtureRoot, 'candidate.txt')
  await writeFile(candidatePath, `providerKey=${secret}\n`, 'utf8')

  const run = spawnSync(process.execPath, [scriptPath, candidatePath], {
    cwd: repositoryRoot,
    encoding: 'utf8',
  })

  assert.equal(run.status, 1)
  const result = JSON.parse(run.stdout)
  assert.deepEqual(result.matches, [{
    path: candidatePath,
    category: 'credential-material',
    line: 1,
  }])
  for (let index = 0; index <= secret.length - 8; index += 1) {
    assert.equal(run.stdout.includes(secret.slice(index, index + 8)), false)
  }
})
