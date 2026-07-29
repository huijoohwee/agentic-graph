import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildTerminalAuthorizationEvidence,
  challengeFor,
  formatTerminalAuthorizationComment,
  GITHUB_APPROVAL_COMMENT_MAX_BYTES,
  parseTerminalAuthorizationComment,
  responseFor,
  selectLifecycleCandidateArtifact,
  selectPendingProductionDeployment,
  validateReleaseRun,
  validateTerminalAuthorizationEvidence,
} from '../production-terminal-authorization.mjs'

const run = {
  id: 123,
  event: 'workflow_dispatch',
  path: '.github/workflows/release.yml',
  head_branch: 'main',
  head_sha: 'a'.repeat(40),
  status: 'in_progress',
  conclusion: null,
}
const candidateDigest = 'b'.repeat(64)
const targetDigest = 'c'.repeat(64)
const challengeDigest = challengeFor({
  repository: 'owner/repository',
  run,
  candidate: { receiptDigest: candidateDigest, targetDigest },
})
const evidence = buildTerminalAuthorizationEvidence({
  repository: 'owner/repository',
  runId: '123',
  sourceRevision: run.head_sha,
  candidateDigest,
  targetDigest,
  humanActorId: 'github-user:7:operator',
  challengeDigest,
  responseDigest: responseFor({ challengeDigest, candidateDigest }),
  recordedAt: '2026-07-29T00:00:00.000Z',
})

test('terminal evidence round-trips exact candidate, target, actor, transport, and browser independence', () => {
  const comment = formatTerminalAuthorizationComment(evidence)
  const parsed = parseTerminalAuthorizationComment(comment)
  assert.deepEqual(parsed, evidence)
  assert.equal(parsed.transportClass, 'interactive-terminal')
  assert.equal(parsed.browserRequired, false)
  assert.ok(Buffer.byteLength(comment, 'utf8') <= GITHUB_APPROVAL_COMMENT_MAX_BYTES)
})

test('terminal evidence parser preserves the already-released uncompressed v1 encoding', () => {
  const encoded = Buffer.from(JSON.stringify(evidence), 'utf8').toString('base64url')
  const parsed = parseTerminalAuthorizationComment(
    `knowgrph-production-terminal-authorization/v1 ${encoded}`,
  )
  assert.deepEqual(parsed, evidence)
})

test('terminal evidence rejects drift, unknown fields, browser dependence, and unjoined comments', () => {
  assert.throws(
    () => validateTerminalAuthorizationEvidence({ ...evidence, candidateDigest: 'd'.repeat(64) }),
    /digest drifted/,
  )
  assert.throws(
    () => validateTerminalAuthorizationEvidence({ ...evidence, inferredApproval: true }),
    /missing or unknown fields/,
  )
  assert.throws(
    () => validateTerminalAuthorizationEvidence({ ...evidence, browserRequired: true }),
    /invalid profile/,
  )
  assert.throws(
    () => parseTerminalAuthorizationComment('approved'),
    /lacks exact terminal authorization evidence/,
  )
})

test('only the active protected-main Production Release run is eligible', () => {
  assert.equal(validateReleaseRun(run, 'owner/repository', '123'), run)
  for (const drift of [
    { event: 'push' },
    { path: '.github/workflows/other.yml' },
    { head_branch: 'feature' },
    { status: 'completed', conclusion: 'success' },
  ]) {
    assert.throws(
      () => validateReleaseRun({ ...run, ...drift }, 'owner/repository', '123'),
      /not an active protected-main/,
    )
  }
})

test('candidate artifact and pending environment selection are exact and singular', () => {
  const artifact = {
    id: 9,
    name: `production-lifecycle-${run.head_sha}-${run.id}`,
    expired: false,
  }
  assert.equal(selectLifecycleCandidateArtifact([artifact], run), artifact)
  assert.throws(
    () => selectLifecycleCandidateArtifact([artifact, { ...artifact, id: 10 }], run),
    /one exact lifecycle candidate artifact/,
  )
  const pending = {
    environment: { id: 11, name: 'production' },
    current_user_can_approve: true,
  }
  assert.equal(selectPendingProductionDeployment([pending]), pending)
  assert.throws(
    () => selectPendingProductionDeployment([pending, {
      environment: { id: 12, name: 'staging' },
      current_user_can_approve: true,
    }]),
    /one approvable production deployment/,
  )
})
