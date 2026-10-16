import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { realpathSync } from 'node:fs'
import { basename } from 'node:path'
import { assertWorkflowEffect, readSelectedWorkflow } from '../../../node_modules/agentic-os/bin/agentic-os-workflow.mjs'
import { remoteRefSha, remoteTransport } from '../../../node_modules/agentic-os/src/git.mjs'
import { remoteRepositoryIdentity } from '../../../node_modules/agentic-os/src/github-provider.mjs'

const SOURCE_AHEAD_OPTIONS_BY_CHECKOUT_STATE = Object.freeze({
  attached: Object.freeze([]),
  'github-pull-request-merge': Object.freeze(['--ancestry-path']),
})

const repository = 'github.com/huijoohwee/agentic-graph'
const taskBranch = /^agent\/[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?\/[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/u
const sha = /^[a-f0-9]{40}$/u
const digest = /^[a-f0-9]{64}$/u
const upstreamFields = ['sourceUpstreamRef', 'sourceUpstreamRevision', 'sourceAheadCount',
  'sourceBehindCount', 'sourceDescendsFromUpstream', 'upstreamSynchronized']
const gitText = (root, args) => execFileSync('git', args, {
  cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024,
}).trim()

export function readXrV2SourceUpstream(root, context, services = {}) {
  const ref = context.sourceCheckoutState === 'attached'
    ? gitText(root, ['for-each-ref', `refs/heads/${context.sourceBranch}`, '--format=%(upstream:short)'])
    : `origin/${context.sourceBranch}`
  if (ref) return { checkoutContext: context, sourceUpstreamRef: ref,
    sourceUpstreamRevision: gitText(root, ['rev-parse', '--verify', `${ref}^{commit}`]), sourceAllocationEvidence: null }
  assert.equal(context.sourceCheckoutState, 'attached')
  assert.equal(context.sourceLane, 'task-review', 'Only an admitted local task can lack an upstream')
  assert.match(context.sourceBranch, taskBranch)
  root = realpathSync(root)
  const worktreeId = basename(root)
  const selectionOptions = { worktreeId, ref: context.sourceBranch, navigation: false, required: true }
  const readSelection = services.readSelectedWorkflow ?? readSelectedWorkflow
  const selected = readSelection(root, repository, selectionOptions)
  const allocation = selected.manifest.allocations?.find(row => row.ref === context.sourceBranch)
  assert.equal(allocation?.state, 'active', 'Unpublished source requires a native active allocation')
  assert.equal(allocation.path, root)
  assert.equal(allocation.worktreeId, worktreeId)
  assert.equal(allocation.headRevision, context.sourceCandidateRevision)
  assert.match(allocation.baseRevision, sha)
  assert.equal(isGitAncestor(root, allocation.baseRevision, context.sourceCandidateRevision), true)
  const decision = (services.assertWorkflowEffect ?? assertWorkflowEffect)({ root, repository,
    phase: 'checks', worktreeId, ref: context.sourceBranch, revision: context.sourceCandidateRevision, dirty: false })
  assert.equal(decision.status, 'eligible')
  assert.equal(decision.authority, false)
  assert.equal(decision.dependencyCoverage, 'declared')
  assert.equal(decision.manifestDigest, selected.digest)
  assert.match(selected.digest, digest)
  assert.match(decision.fingerprint, digest)
  const transport = (services.remoteTransport ?? remoteTransport)('origin', root)
  assert.equal(remoteRepositoryIdentity(transport.fetchUrl)?.repository, repository)
  assert.equal((services.remoteRefSha ?? remoteRefSha)('origin', context.sourceBranch, root, transport.fetchUrl), null,
    'A published task with missing tracking must recover its native upstream')
  assert.equal(readSelection(root, repository, selectionOptions).digest, selected.digest, 'Native allocation changed')
  assert.equal(gitText(root, ['rev-parse', 'HEAD']), context.sourceCandidateRevision)
  assert.equal(gitText(root, ['branch', '--show-current']), context.sourceBranch)
  return { checkoutContext: { ...context, sourceLane: 'task-local' }, sourceUpstreamRef: null,
    sourceUpstreamRevision: null, sourceAllocationEvidence: { authority: false, manifestDigest: selected.digest,
      fingerprint: decision.fingerprint, ref: context.sourceBranch, revision: context.sourceCandidateRevision,
      tree: gitText(root, ['rev-parse', 'HEAD^{tree}']), worktreeId, path: root,
      baseRevision: allocation.baseRevision, remoteTransportDigest: transport.urlDigest, remoteRevision: null } }
}

export function assertXrV2SourceUpstreamEvidence(source) {
  if (source.sourceLane === 'task-local') {
    assert.equal(source.sourceCheckoutState, 'attached')
    assert.match(source.sourceBranch, taskBranch)
    assert.equal(source.sourceCandidateRevision, source.sourceRevision)
    assert.equal(source.sourceDescendsFromOriginMain, true)
    for (const key of upstreamFields) assert.equal(source[key], null, `${key} must remain unobserved`)
    const evidence = source.sourceAllocationEvidence
    assert.equal(evidence?.authority, false)
    assert.match(evidence.manifestDigest, digest)
    assert.match(evidence.fingerprint, digest)
    assert.match(evidence.remoteTransportDigest, digest)
    assert.equal(evidence.ref, source.sourceBranch)
    assert.equal(evidence.revision, source.sourceRevision)
    assert.equal(evidence.tree, source.sourceHeadTree)
    assert.match(evidence.baseRevision, sha)
    assert.equal(evidence.remoteRevision, null)
    return
  }
  assert.equal(source.sourceAllocationEvidence, null)
  assert.match(source.sourceUpstreamRevision, sha)
  assert.equal(source.sourceUpstreamRef, `origin/${source.sourceBranch}`)
  assert.equal(source.sourceDescendsFromUpstream, true)
  assert.equal(source.sourceDescendsFromOriginMain, true)
  assert.equal(source.sourceBehindCount, 0)
  assert.ok(Number.isSafeInteger(source.sourceAheadCount) && source.sourceAheadCount >= 0)
  assert.equal(source.upstreamSynchronized, source.sourceAheadCount === 0)
}

export function isGitAncestor(repositoryRoot, ancestor, descendant) {
  try {
    execFileSync('git', ['merge-base', '--is-ancestor', ancestor, descendant], {
      cwd: repositoryRoot,
      stdio: 'ignore',
    })
    return true
  } catch (error) {
    if (error && typeof error === 'object' && error.status === 1) return false
    throw error
  }
}

export function resolveXrV2SourceAheadGitArgs({
  sourceCheckoutState,
  sourceUpstreamRef,
}) {
  if (!Object.hasOwn(SOURCE_AHEAD_OPTIONS_BY_CHECKOUT_STATE, sourceCheckoutState)) {
    throw new Error(`unsupported XR v2 source checkout state: ${String(sourceCheckoutState)}`)
  }
  const checkoutOptions = SOURCE_AHEAD_OPTIONS_BY_CHECKOUT_STATE[sourceCheckoutState]
  if (typeof sourceUpstreamRef !== 'string' || sourceUpstreamRef.trim() === '') {
    throw new Error('XR v2 source upstream ref must be a non-empty string')
  }
  return Object.freeze([
    'rev-list',
    '--count',
    ...checkoutOptions,
    `${sourceUpstreamRef}..HEAD`,
  ])
}
