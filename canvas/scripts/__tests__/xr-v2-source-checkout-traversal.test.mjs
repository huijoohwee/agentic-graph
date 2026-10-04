import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, resolve } from 'node:path'
import test from 'node:test'

import { assertXrV2SourceUpstreamEvidence, readXrV2SourceUpstream, resolveXrV2SourceAheadGitArgs } from '../lib/xr-v2-source-checkout-traversal.mjs'

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

function localLane(t) {
  let { repositoryRoot: root, candidateRevision } = createSyntheticPullRequestMerge(t)
  root = git(root, ['rev-parse', '--show-toplevel'])
  git(root, ['switch', 'task'])
  const branch = 'agent/device/test'
  git(root, ['branch', '-m', branch])
  git(root, ['remote', 'add', 'origin', 'https://github.com/huijoohwee/agentic-graph.git'])
  const baseRevision = git(root, ['rev-parse', 'origin/base'])
  git(root, ['update-ref', 'refs/remotes/origin/main', baseRevision])
  const ctx = { sourceBranch: branch, sourceCandidateRevision: candidateRevision, sourceCheckoutState: 'attached', sourceLane: 'task-review' }
  const sel = { digest: 'a'.repeat(64), manifest: { allocations: [{ state: 'active', ref: branch, path: root, worktreeId: basename(root), headRevision: candidateRevision, baseRevision }] } }
  const dec = { status: 'eligible', authority: false, dependencyCoverage: 'declared', manifestDigest: sel.digest, fingerprint: 'b'.repeat(64) }
  const svc = {
    readSelectedWorkflow: () => sel,
    assertWorkflowEffect: () => dec,
    remoteTransport: () => ({ fetchUrl: 'https://github.com/huijoohwee/agentic-graph.git', urlDigest: 'c'.repeat(64) }),
    remoteRefSha: (_, ref, cwd) => { assert.equal(ref, branch); assert.equal(cwd, root); return null },
  }
  return { root, ctx, sel, svc }
}

test('unpublished lane has no remote proof', t => {
  const { root, ctx, svc } = localLane(t)
  const result = readXrV2SourceUpstream(root, ctx, svc)
  const source = { ...result.checkoutContext, ...result, sourceRevision: ctx.sourceCandidateRevision, sourceHeadTree: git(root, ['rev-parse', 'HEAD^{tree}']), sourceAheadCount: null, sourceBehindCount: null, sourceDescendsFromUpstream: null, upstreamSynchronized: null, sourceDescendsFromOriginMain: true }
  assertXrV2SourceUpstreamEvidence(source)
})

test('stale admission and remote errors fail', t => {
  const { root, ctx, sel, svc } = localLane(t)
  const reject = overrides => assert.throws(() => readXrV2SourceUpstream(root, ctx, { ...svc, ...overrides }))
  reject({ readSelectedWorkflow: () => null })
  reject({ assertWorkflowEffect: () => ({}) })
  const allocation = sel.manifest.allocations[0]
  for (const change of [{ path: `${root}/wrong` }, { headRevision: allocation.baseRevision }]) {
    reject({ readSelectedWorkflow: () => ({ ...sel, manifest: { allocations: [{ ...allocation, ...change }] } }) })
  }
  reject({ remoteRefSha: () => ctx.sourceCandidateRevision })
  const failure = new Error('remote failure')
  assert.throws(() => readXrV2SourceUpstream(root, ctx, { ...svc, remoteRefSha: () => { throw failure } }), error => error === failure)
})

test('main and PR cannot admit nullable evidence', t => {
  const { root, ctx, svc } = localLane(t)
  for (const change of [{ sourceBranch: 'main', sourceLane: 'canonical-main' }, { sourceCheckoutState: 'github-pull-request-merge', sourceLane: 'pull-request-integration' }]) {
    assert.throws(() => readXrV2SourceUpstream(root, { ...ctx, ...change }, svc))
  }
})

test('configured upstream is strict', t => {
  const { root, ctx } = localLane(t)
  const branch = ctx.sourceBranch, ref = `origin/${branch}`
  git(root, ['update-ref', `refs/remotes/${ref}`, ctx.sourceCandidateRevision])
  git(root, ['config', `branch.${branch}.remote`, 'origin'])
  git(root, ['config', `branch.${branch}.merge`, `refs/heads/${branch}`])
  const result = readXrV2SourceUpstream(root, ctx)
  assert.equal(result.sourceUpstreamRef, ref)
  assert.equal(result.sourceUpstreamRevision, ctx.sourceCandidateRevision)
  assert.equal(result.sourceAllocationEvidence, null)
  assert.throws(() => assertXrV2SourceUpstreamEvidence({ ...ctx, ...result, sourceUpstreamRef: 'origin/main' }))
  git(root, ['update-ref', '-d', `refs/remotes/${ref}`])
  assert.throws(() => readXrV2SourceUpstream(root, ctx))
})
