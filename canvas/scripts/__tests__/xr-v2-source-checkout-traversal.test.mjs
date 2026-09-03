import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import test from 'node:test'

import { resolveXrV2SourceAheadGitArgs } from '../lib/xr-v2-source-checkout-traversal.mjs'

function git(repositoryRoot, args) {
  return execFileSync('git', args, {
    cwd: repositoryRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim()
}

function createSyntheticPullRequestMerge(t) {
  const repositoryRoot = mkdtempSync(resolve(tmpdir(), 'agentic-graph-xr-v2-traversal-'))
  t.after(() => rmSync(repositoryRoot, { force: true, recursive: true }))
  git(repositoryRoot, ['init', '--initial-branch=main'])
  git(repositoryRoot, ['config', 'user.email', 'xr-v2-test@agentic-graph.invalid'])
  git(repositoryRoot, ['config', 'user.name', 'agentic-graph XR v2 test'])
  writeFileSync(resolve(repositoryRoot, 'base.txt'), 'base\n')
  git(repositoryRoot, ['add', 'base.txt'])
  git(repositoryRoot, ['commit', '-m', 'base'])
  const baseRevision = git(repositoryRoot, ['rev-parse', 'HEAD'])

  git(repositoryRoot, ['switch', '-c', 'task'])
  writeFileSync(resolve(repositoryRoot, 'candidate.txt'), 'candidate\n')
  git(repositoryRoot, ['add', 'candidate.txt'])
  git(repositoryRoot, ['commit', '-m', 'candidate'])
  const candidateRevision = git(repositoryRoot, ['rev-parse', 'HEAD'])

  git(repositoryRoot, ['switch', 'main'])
  writeFileSync(resolve(repositoryRoot, 'protected-drift.txt'), 'protected drift\n')
  git(repositoryRoot, ['add', 'protected-drift.txt'])
  git(repositoryRoot, ['commit', '-m', 'protected drift'])
  git(repositoryRoot, ['merge', '--no-ff', 'task', '-m', 'synthetic pull request merge'])
  git(repositoryRoot, ['update-ref', 'refs/remotes/origin/base', baseRevision])
  git(repositoryRoot, ['update-ref', 'refs/remotes/origin/task', candidateRevision])
  return Object.freeze({ candidateRevision, repositoryRoot })
}

test('source-ahead traversal is checkout-state aware', () => {
  assert.deepEqual(resolveXrV2SourceAheadGitArgs({
    sourceCheckoutState: 'attached',
    sourceUpstreamRef: 'origin/agent/device/task',
  }), [
    'rev-list',
    '--count',
    'origin/agent/device/task..HEAD',
  ])
  assert.deepEqual(resolveXrV2SourceAheadGitArgs({
    sourceCheckoutState: 'github-pull-request-merge',
    sourceUpstreamRef: 'origin/agent/device/task',
  }), [
    'rev-list',
    '--count',
    '--ancestry-path',
    'origin/agent/device/task..HEAD',
  ])
})

test('source-ahead traversal rejects incomplete checkout identity', () => {
  assert.throws(
    () => resolveXrV2SourceAheadGitArgs({
      sourceCheckoutState: 'detached',
      sourceUpstreamRef: 'origin/task',
    }),
    /unsupported XR v2 source checkout state/u,
  )
  assert.throws(
    () => resolveXrV2SourceAheadGitArgs({
      sourceCheckoutState: 'attached',
      sourceUpstreamRef: ' ',
    }),
    /source upstream ref must be a non-empty string/u,
  )
})

test('synthetic merge traversal counts only the candidate-to-merge edge', t => {
  const { candidateRevision, repositoryRoot } = createSyntheticPullRequestMerge(t)
  const rawCount = Number(git(repositoryRoot, [
    'rev-list',
    '--count',
    'refs/remotes/origin/task..HEAD',
  ]))
  const sourceAheadCount = Number(git(
    repositoryRoot,
    resolveXrV2SourceAheadGitArgs({
      sourceCheckoutState: 'github-pull-request-merge',
      sourceUpstreamRef: 'refs/remotes/origin/task',
    }),
  ))

  assert.equal(rawCount, 2)
  assert.equal(sourceAheadCount, 1)

  git(repositoryRoot, ['switch', '--detach', candidateRevision])
  assert.equal(Number(git(
    repositoryRoot,
    resolveXrV2SourceAheadGitArgs({
      sourceCheckoutState: 'attached',
      sourceUpstreamRef: 'refs/remotes/origin/base',
    }),
  )), 1)
})
