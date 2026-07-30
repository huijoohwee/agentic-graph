import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'

const SHA_PATTERN = /^[0-9a-f]{40}$/

function environmentKey(prefix, suffix) {
  return `${prefix}_${suffix}`
}

export function publishExactBrowserSmokeSource(prefix, environment = process.env) {
  environment[environmentKey(prefix, 'EXPECTED_HEAD')] = execFileSync(
    'git',
    ['rev-parse', 'HEAD'],
    { encoding: 'utf8' },
  ).trim()
  environment[environmentKey(prefix, 'EXPECTED_BRANCH')] = execFileSync(
    'git',
    ['branch', '--show-current'],
    { encoding: 'utf8' },
  ).trim()
  environment[environmentKey(prefix, 'EXPECTED_MAIN')] = execFileSync(
    'git',
    ['rev-parse', 'refs/remotes/origin/main'],
    { encoding: 'utf8' },
  ).trim()
}

export function readExactBrowserSmokeSource(prefix, environment = process.env) {
  const sourceRevision = String(environment[environmentKey(prefix, 'EXPECTED_HEAD')] || '').trim()
  const sourceBranch = String(environment[environmentKey(prefix, 'EXPECTED_BRANCH')] || '').trim()
  const mainRevision = String(environment[environmentKey(prefix, 'EXPECTED_MAIN')] || '').trim()
  assert.match(sourceRevision, SHA_PATTERN, 'smoke requires the runner-owned exact source revision')
  assert.match(mainRevision, SHA_PATTERN, 'smoke requires the exact origin/main revision')
  if (sourceBranch) {
    assert.match(sourceBranch, /^agent\/[^/]+\/[^/]+$/, 'smoke task branch must be runner-owned')
  } else {
    assert.equal(sourceRevision, mainRevision, 'detached smoke must run from exact origin/main')
  }
  return Object.freeze({
    sourceRevision,
    sourceBranch: sourceBranch || null,
    sourceState: sourceBranch ? 'task-branch' : 'detached-main',
    mainRevision,
  })
}
