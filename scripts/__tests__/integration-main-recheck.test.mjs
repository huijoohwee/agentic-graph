import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, before, test } from 'node:test'
import { load } from 'js-yaml'
import { readChangedPaths } from '../run-affected-ci.mjs'

const workflow = load(readFileSync(new URL('../../.github/workflows/integration.yml', import.meta.url), 'utf8'))
const steps = workflow.jobs['integration-gate'].steps
const authorization = steps.find(step => step.name === 'Authorize exact protected integration dispatch')
let fixture, checkout, remote, revision, nextRevision
const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim()

before(() => {
  fixture = mkdtempSync(path.join(tmpdir(), 'integration-main-recheck-'))
  checkout = path.join(fixture, 'checkout')
  remote = path.join(fixture, 'origin.git')
  git(fixture, 'init', '--initial-branch=main', checkout)
  git(checkout, 'config', 'user.name', 'Integration fixture')
  git(checkout, 'config', 'user.email', 'integration@example.invalid')
  git(checkout, '-c', 'commit.gpgsign=false', 'commit', '--allow-empty', '-m', 'Fixture base')
  revision = git(checkout, 'rev-parse', 'HEAD')
  nextRevision = git(checkout, '-c', 'commit.gpgsign=false', 'commit-tree', 'HEAD^{tree}', '-p', 'HEAD', '-m', 'Fixture next')
  git(fixture, 'clone', '--bare', '--shared', checkout, remote)
  git(checkout, 'remote', 'add', 'origin', remote)
})
after(() => { if (fixture) rmSync(fixture, { recursive: true, force: true }) })

const authorize = (overrides = {}) => spawnSync('bash', ['--noprofile', '--norc', '-e', '-o', 'pipefail', '-c', authorization.run], {
  cwd: checkout,
  encoding: 'utf8',
  env: {
    ...process.env,
    EXPECTED_OPERATION: 'protected-main-recheck',
    EXPECTED_PR_NUMBER: '0',
    EXPECTED_BRANCH: 'main',
    EXPECTED_HEAD_SHA: revision,
    GITHUB_REF: 'refs/heads/main',
    GITHUB_SHA: revision,
    ...overrides,
  },
})

test('exact main recovery runs the existing read-only gate without PR metadata', () => {
  assert.equal(authorize().status, 0)
  assert.deepEqual(workflow.permissions, { actions: 'read', contents: 'read', 'pull-requests': 'read' })
  assert.equal(workflow.on.workflow_dispatch.inputs.pull_request_number.default, 0)
  assert.equal(authorization.if, "${{ github.event_name == 'workflow_dispatch' }}")
  assert.equal(steps.find(step => step.name === 'Load exact protected refresh pull request metadata').if,
    "${{ github.event_name == 'workflow_dispatch' && inputs.operation == 'protected-head-refresh' }}")
  for (const name of ['Create immutable app docs catalog manifest', 'Run canonical integration gate', 'Select XR runtime gate from native source inputs']) {
    assert.equal(steps.find(step => step.name === name).if, undefined, `${name} must remain unconditional`)
  }
  assert.equal(steps.find(step => step.name === 'Run XR v2 runtime review-candidate gate').if,
    "steps.xr_gate.outputs.required != 'false'")
})

test('main recovery rejects wrong refs, revisions, PR context and unknown operations', () => {
  for (const overrides of [
    { GITHUB_REF: 'refs/heads/other' },
    { EXPECTED_BRANCH: 'other', GITHUB_REF: 'refs/heads/other' },
    { GITHUB_SHA: nextRevision },
    { EXPECTED_HEAD_SHA: nextRevision, GITHUB_SHA: nextRevision },
    { EXPECTED_HEAD_SHA: 'not-a-sha', GITHUB_SHA: 'not-a-sha' },
    { EXPECTED_PR_NUMBER: '983' },
    { EXPECTED_OPERATION: 'skip-checks' },
  ]) assert.notEqual(authorize(overrides).status, 0, JSON.stringify(overrides))
})

test('main recovery rejects a stale remote observation even when the local checkout matches', () => {
  git(remote, 'update-ref', 'refs/heads/main', nextRevision)
  try { assert.notEqual(authorize().status, 0) }
  finally { git(remote, 'update-ref', 'refs/heads/main', revision) }
})

test('PR refresh keeps its exact branch and positive PR requirement', () => {
  const refresh = { EXPECTED_OPERATION: 'protected-head-refresh', EXPECTED_BRANCH: 'agent/device/scope',
    GITHUB_REF: 'refs/heads/agent/device/scope', EXPECTED_PR_NUMBER: '984' }
  assert.equal(authorize(refresh).status, 0)
  assert.notEqual(authorize({ ...refresh, EXPECTED_PR_NUMBER: '0' }).status, 0)
})

test('main recheck selects the actual main commit delta rather than an empty PR diff', () => {
  const calls = []
  const changed = readChangedPaths({
    environment: { GITHUB_ACTIONS: 'true', GITHUB_EVENT_NAME: 'workflow_dispatch', AGENTIC_OS_PR_BASE_REF: '' },
    gitText: args => { calls.push(args); return '.github/workflows/integration.yml\0' },
  })
  assert.deepEqual(calls, [['diff', '--no-renames', '--name-only', '-z', 'HEAD^...HEAD']])
  assert.deepEqual(changed, ['.github/workflows/integration.yml'])
})
