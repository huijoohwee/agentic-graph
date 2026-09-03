import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { readContract, repoRoot } from '../collaboration-contract.mjs'
import {
  checkWorktreePolicy,
  countRegisteredWorktrees,
  evaluateWorktreePolicy,
  parseRegisteredWorktrees,
  resolveCanonicalSourceRoots,
  resolvePrimaryWorktreeRoot,
} from '../worktree-policy.mjs'

const canonicalStates = [
  { id: 'agentic-graph', worktreeCount: 1 },
  { id: 'agentic-canvas-os-docs', worktreeCount: 1 },
]

test('porcelain worktree records are counted without path parsing', () => {
  assert.equal(countRegisteredWorktrees(`worktree /repo\nHEAD a\nbranch refs/heads/main\n`), 1)
  assert.equal(countRegisteredWorktrees([
    'worktree /repo',
    'HEAD a',
    'branch refs/heads/main',
    '',
    'worktree /repo-task',
    'HEAD b',
    'branch refs/heads/agent/device/task',
  ].join('\n')), 2)
})

test('contract worktree policy accepts multiple isolated worktrees and rejects missing registrations', async () => {
  const contract = await readContract()
  assert.deepEqual(contract.local_development.worktree_policy.session_end, {
    completion_state: 'completed',
    cleanup_requires: ['clean', 'detached', 'exact-origin-main', 'explicit-target'],
    retain_states: ['canonical', 'active', 'delivery', 'parked'],
    force_remove: false,
    delete_branch: false,
  })
  const result = evaluateWorktreePolicy(canonicalStates, contract)
  assert.equal(result.message, (
    'same-device-multi-worktree sources agentic-graph=1; agentic-canvas-os-docs=1'
  ))
  const parallel = evaluateWorktreePolicy([
    { id: 'agentic-graph', worktreeCount: 2 },
    canonicalStates[1],
  ], contract)
  assert.match(parallel.message, /agentic-graph=2/)
  assert.throws(() => evaluateWorktreePolicy([
    { id: 'agentic-graph', worktreeCount: 0 },
    canonicalStates[1],
  ], contract), /requires at least 1 registered worktree/)
})

test('registry policy rejects prunable worktrees and duplicate checked-out branches', async () => {
  const contract = await readContract()
  const main = { path: '/repo', head: 'a', branch: 'refs/heads/main', prunable: false, bare: false }
  assert.throws(() => evaluateWorktreePolicy([
    { id: 'agentic-graph', worktreeCount: 2, worktrees: [main, { ...main, path: '/repo-task' }] },
    canonicalStates[1],
  ], contract), /one branch checked out in multiple worktrees/)
  assert.throws(() => evaluateWorktreePolicy([
    { id: 'agentic-graph', worktreeCount: 1, worktrees: [{ ...main, prunable: true }] },
    canonicalStates[1],
  ], contract), /invalid, bare, or prunable/)
})

test('linked task worktrees resolve sibling sources beside the registered main worktree', async () => {
  const contract = await readContract()
  const primaryRoot = '/workspace/agentic-graph'
  const taskRoot = '/workspace/.worktrees/agentic-graph/three-object-input'
  const result = resolveCanonicalSourceRoots({
    cwd: taskRoot,
    contract,
    git: args => args[0] === 'rev-parse'
      ? `${primaryRoot}/.git`
      : [
        `worktree ${primaryRoot}`,
        'HEAD a',
        'branch refs/heads/main',
        '',
        `worktree ${taskRoot}`,
        'HEAD b',
        'branch refs/heads/agent/device/three-object-input',
      ].join('\n'),
  })
  assert.equal(result.roots.get('agentic-graph'), taskRoot)
  assert.equal(result.roots.get('agentic-canvas-os-docs'), '/workspace/agentic-canvas-os')
  assert.equal(result.canonicalApplicationRoot, primaryRoot)
  assert.equal(result.canonicalOwnerPath, primaryRoot)
  assert.equal(parseRegisteredWorktrees(result.applicationPorcelain).length, 2)
})

test('primary repository root stays canonical when main is registered in a linked release worktree', async () => {
  const contract = await readContract()
  const primaryRoot = '/workspace/agentic-graph'
  const releaseRoot = '/workspace/.worktrees/agentic-graph/canonical-main-release'
  const taskRoot = '/workspace/.worktrees/agentic-graph/canonical-dev-path-guard'
  const result = resolveCanonicalSourceRoots({
    cwd: taskRoot,
    contract,
    git: args => args[0] === 'rev-parse'
      ? `${primaryRoot}/.git`
      : [
        `worktree ${primaryRoot}`,
        'HEAD a',
        'branch refs/heads/agent/device/occupied-root',
        '',
        `worktree ${releaseRoot}`,
        'HEAD b',
        'branch refs/heads/main',
        '',
        `worktree ${taskRoot}`,
        'HEAD c',
        'branch refs/heads/agent/device/canonical-dev-path-guard',
      ].join('\n'),
  })

  assert.equal(result.canonicalApplicationRoot, primaryRoot)
  assert.equal(result.canonicalOwnerPath, releaseRoot)
  assert.equal(result.roots.get('agentic-canvas-os-docs'), '/workspace/agentic-canvas-os')
})

test('task-only CI checkout resolves without a locally checked-out main branch', async () => {
  const contract = await readContract()
  const primaryRoot = '/workspace/agentic-graph'
  const taskRoot = '/workspace/agentic-graph'
  const result = resolveCanonicalSourceRoots({
    cwd: taskRoot,
    contract,
    git: args => args[0] === 'rev-parse'
      ? `${primaryRoot}/.git`
      : [
        `worktree ${taskRoot}`,
        'HEAD a',
        'branch refs/heads/agent/device/canonical-dev-path-guard-v2',
      ].join('\n'),
  })

  assert.equal(result.canonicalApplicationRoot, primaryRoot)
  assert.equal(result.canonicalOwnerPath, null)
  assert.equal(result.roots.get('agentic-graph'), taskRoot)
})

test('primary worktree root derives from the shared Git directory', () => {
  assert.equal(resolvePrimaryWorktreeRoot({
    cwd: '/workspace/.worktrees/agentic-graph/task',
    git: () => '/workspace/agentic-graph/.git',
  }), '/workspace/agentic-graph')
})

test('standalone preflight checks every canonical source without fetching or starting Dev', async () => {
  const calls = []
  const result = await checkWorktreePolicy({
    git: (args, cwd) => {
      calls.push({ args, cwd })
      if (args[0] === 'rev-parse') return path.join(repoRoot, '.git')
      return `worktree ${cwd}\nHEAD a\nbranch refs/heads/main`
    },
  })

  assert.equal(result.sources.length, 2)
  assert.deepEqual(calls, [
    { args: ['worktree', 'list', '--porcelain'], cwd: repoRoot },
    {
      args: ['rev-parse', '--path-format=absolute', '--git-common-dir'],
      cwd: repoRoot,
    },
    {
      args: ['worktree', 'list', '--porcelain'],
      cwd: path.resolve(repoRoot, '../agentic-canvas-os'),
    },
  ])
})

test('Git pre-push delegates current and object refs to the repository-owned gate', () => {
  const packageJson = JSON.parse(readFileSync(path.resolve(repoRoot, 'package.json'), 'utf8'))
  const prePushHook = readFileSync(path.resolve(repoRoot, '.githooks/pre-push'), 'utf8')
  const prePushGate = readFileSync(path.resolve(repoRoot, 'scripts/run-pre-push-gate.mjs'), 'utf8')
  assert.equal(packageJson.scripts['worktree:check'], 'node ./scripts/check-worktree-policy.mjs')
  assert.equal(
    packageJson.scripts['worktree:lifecycle:check'],
    'node ../agentic-canvas-os/scripts/worktree-lifecycle.mjs check --repository=.',
  )
  assert.equal(
    packageJson.scripts['worktree:lifecycle:cleanup'],
    'node ../agentic-canvas-os/scripts/worktree-lifecycle.mjs cleanup --repository=.',
  )
  assert.ok(packageJson.scripts['ci:integration'].startsWith('npm run worktree:check &&'))
  assert.match(prePushHook, /run-pre-push-gate\.mjs/)
  assert.match(prePushGate, /runCheckoutIntegration/)
  assert.match(prePushGate, /buildImmutableReleaseManifest/)
})
