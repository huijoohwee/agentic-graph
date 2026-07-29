import assert from 'node:assert/strict'
import path from 'node:path'
import test from 'node:test'
import { pathToFileURL } from 'node:url'

import {
  createLifecycleAuthorization,
  createLifecycleCandidate,
  digest,
  selectProductionApproval,
} from '../production-release-lifecycle.mjs'
import { readContract } from '../collaboration-contract.mjs'
import { resolveCanonicalSourceRoots } from '../worktree-policy.mjs'

const repoRoot = path.resolve(import.meta.dirname, '..', '..')
const collaborationContract = await readContract()
const canonicalSourceRoots = resolveCanonicalSourceRoots({
  cwd: repoRoot,
  contract: collaborationContract,
})
const docsSource = collaborationContract.local_development.canonical_sources
  .find(source => source.id === 'agentic-canvas-os-docs')
if (!docsSource) throw new Error('collaboration contract has no Agentic Canvas OS docs source')
const docsRoot = path.resolve(
  canonicalSourceRoots.roots.get(docsSource.id),
  docsSource.required_path,
)
const contract = await import(pathToFileURL(
  path.join(path.dirname(docsRoot), 'scripts', 'collaborative-release-lifecycle-contract.mjs'),
).href)

const sourceRevision = 'a'.repeat(40)
const sourceTree = 'b'.repeat(40)
const docsRevision = 'c'.repeat(40)
const docsTree = 'd'.repeat(40)
const guidelineRevision = 'e'.repeat(40)
const mirrorRevision = 'f'.repeat(40)
const reviewEvidenceDigest = '1'.repeat(64)
const localEvidence = {
  schema: 'agentic-local-review-candidate/v1',
  status: 'review-ready',
  source: { repository: 'huijoohwee/knowgrph', revision: sourceRevision, tree: sourceTree },
  agenticCanvasOs: { repository: 'huijoohwee/agentic-canvas-os', revision: docsRevision, tree: docsTree },
  catalogRevision: docsRevision,
  runtimeEvidenceDigest: reviewEvidenceDigest,
}
const localReview = { ...localEvidence, candidateDigest: digest(localEvidence) }
const readiness = {
  source: { repository: 'huijoohwee/knowgrph', revision: sourceRevision, tree: sourceTree },
  agenticCanvasOs: { repository: 'huijoohwee/agentic-canvas-os', revision: docsRevision },
  artifact: { algorithm: 'sha256', digest: '2'.repeat(64) },
  immutableManifest: { algorithm: 'sha256', digest: '3'.repeat(64) },
  mirror: { repository: 'huijoohwee/huijoohwee' },
}
const collaboration = {
  actorId: 'github:user:1',
  deviceId: 'github-hosted:linux',
  sessionId: 'github-actions:1:1',
  worktreeId: 'github-workspace:1:verify',
  branchId: 'refs/heads/main',
  scopeId: 'production-release',
  leaseEpoch: 1,
  fenceRevision: sourceRevision,
}

const buildCandidate = (overrides = {}) => createLifecycleCandidate({
  contract,
  localReview,
  readiness,
  sourceRevision,
  sourceTree,
  agenticCanvasOsRevision: docsRevision,
  agenticCanvasOsTree: docsTree,
  guidelineRevision,
  mirrorRevision,
  collaboration,
  integratedAt: '2026-07-29T00:00:00.000Z',
  issuedAt: '2026-07-29T00:01:00.000Z',
  targetId: 'airvio.co/knowgrph',
  ...overrides,
})

const approvals = [{
  state: 'approved',
  environments: [{ name: 'production' }],
  user: { login: 'operator', id: 7, type: 'User' },
}]

test('adapter creates a joined neutral receipt chain from the exact localhost candidate', () => {
  const chain = buildCandidate()
  assert.equal(chain.integration.sourceRevision, sourceRevision)
  assert.equal(chain.review.integrationReceiptDigest, chain.integration.receiptDigest)
  assert.equal(chain.candidate.runtimeReviewReceiptDigest, chain.review.receiptDigest)
  assert.equal(chain.candidate.artifactDigest, readiness.artifact.digest)
  assert.equal(chain.candidate.manifestDigest, readiness.immutableManifest.digest)
})

test('multi-user and multi-device collaboration identities remain distinct', () => {
  const first = buildCandidate()
  const second = buildCandidate({
    collaboration: {
      ...collaboration,
      actorId: 'github:user:2',
      deviceId: 'self-hosted:workstation-b',
      sessionId: 'github-actions:2:1',
      worktreeId: 'github-workspace:2:verify',
      scopeId: 'production-release-b',
      leaseEpoch: 2,
    },
  })
  assert.notEqual(first.integration.receiptDigest, second.integration.receiptDigest)
  assert.notEqual(first.review.receiptDigest, second.review.receiptDigest)
  assert.notEqual(first.candidate.receiptDigest, second.candidate.receiptDigest)
})

test('authorization accepts one GitHub human approval and is consumed once', () => {
  const chain = buildCandidate()
  const result = createLifecycleAuthorization({
    contract,
    ...chain,
    approvals,
    repository: 'huijoohwee/knowgrph',
    runId: '123',
    serverUrl: 'https://github.com',
    controllerId: 'github-actions:123:deploy',
    issuedAt: '2026-07-29T00:02:00.000Z',
  })
  assert.equal(result.authorization.humanActorId, 'github-user:7:operator')
  assert.equal(result.authorization.status, 'authorized')
  assert.equal(result.consumedAuthorization.status, 'consumed')
  assert.equal(result.dispatch.status, 'claimed')
  assert.throws(
    () => contract.consumeHumanAuthorizationReceipt(result.consumedAuthorization, {
      consumedAt: '2026-07-29T00:03:00.000Z',
      controllerId: 'github-actions:other',
    }),
    /schema or status|unconsumed|already consumed|missing or unknown fields/,
  )
})

test('authorization rejects agents, bots, ambiguity, and the wrong environment', () => {
  for (const invalid of [
    [],
    [{ ...approvals[0], user: { login: 'release-bot', id: 8, type: 'Bot' } }],
    [{ ...approvals[0], environments: [{ name: 'staging' }] }],
    [...approvals, { ...approvals[0], user: { login: 'other', id: 9, type: 'User' } }],
  ]) {
    assert.throws(() => selectProductionApproval(invalid), /exactly one authenticated human approval/)
  }
})

test('parallel controller dispatch coalesces an exact duplicate and fences a competing candidate', () => {
  const { candidate } = buildCandidate()
  const first = contract.dispatchReleaseController({}, {
    targetDigest: candidate.targetDigest,
    candidateDigest: candidate.receiptDigest,
    controllerId: 'controller:a',
  })
  const duplicate = contract.dispatchReleaseController(first.ledger, {
    targetDigest: candidate.targetDigest,
    candidateDigest: candidate.receiptDigest,
    controllerId: 'controller:b',
  })
  assert.equal(duplicate.status, 'coalesced')
  assert.equal(duplicate.ownerControllerId, 'controller:a')
  assert.throws(() => contract.dispatchReleaseController(first.ledger, {
    targetDigest: candidate.targetDigest,
    candidateDigest: '9'.repeat(64),
    controllerId: 'controller:b',
  }), /competing release candidate/)
})

test('source, dependency, policy, target, artifact, and manifest drift fail closed', () => {
  const chain = buildCandidate()
  const authorized = createLifecycleAuthorization({
    contract,
    ...chain,
    approvals,
    repository: 'huijoohwee/knowgrph',
    runId: '124',
    serverUrl: 'https://github.com',
    controllerId: 'github-actions:124:deploy',
    issuedAt: '2026-07-29T00:02:00.000Z',
  })
  const current = {
    integrationReceiptDigest: chain.integration.receiptDigest,
    runtimeReviewReceiptDigest: chain.review.receiptDigest,
    candidateDigest: chain.candidate.receiptDigest,
    authorizationReceiptDigest: authorized.authorization.receiptDigest,
    sourceDigest: chain.candidate.sourceDigest,
    dependencyClosureDigest: chain.candidate.dependencyClosureDigest,
    policyDigest: chain.candidate.policyDigest,
    targetDigest: chain.candidate.targetDigest,
    artifactDigest: chain.candidate.artifactDigest,
    manifestDigest: chain.candidate.manifestDigest,
  }
  for (const field of [
    'sourceDigest',
    'dependencyClosureDigest',
    'policyDigest',
    'targetDigest',
    'artifactDigest',
    'manifestDigest',
  ]) {
    assert.throws(() => contract.validateAuthorizedDeployment({
      ...chain,
      authorization: authorized.authorization,
      current: { ...current, [field]: '8'.repeat(64) },
      now: '2026-07-29T00:03:00.000Z',
    }), new RegExp(`${field} drift`))
  }
  assert.throws(() => contract.validateAuthorizedDeployment({
    ...chain,
    authorization: authorized.authorization,
    current,
    now: '2026-07-29T00:33:00.001Z',
  }), /expired/)
})
