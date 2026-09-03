import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { normalizeRollbackRecapture } from '../lib/production-release-lifecycle-evidence.mjs'
import { createForwardHealBaselineEvidence } from '../verify-production-release-transports.mjs'

const canonicalJson = value => Array.isArray(value)
  ? `[${value.map(canonicalJson).join(',')}]`
  : value && typeof value === 'object'
    ? `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`
    : JSON.stringify(value)
const digest = value => createHash('sha256').update(Buffer.isBuffer(value) ? value : canonicalJson(value)).digest('hex')
const sealed = body => ({ ...body, receiptDigest: digest(body) })
const resealed = value => {
  const { receiptDigest: _receiptDigest, ...body } = value
  return sealed(body)
}
const sha = character => character.repeat(40)
const hash = character => character.repeat(64)
const counts = { documentCount: 147, chunkCount: 18, graphCount: 0 }

const fixture = () => {
  const sourceRevision = sha('1')
  const predecessorRollbackIdentity = {
    schema: 'agentic-graph-production-rollback-identity/v1',
    pages: {
      deploymentId: 'previous-deployment',
      deploymentOrigin: 'https://previous.example.pages.dev',
      deploymentCommitRevision: sha('2'),
      sourceRevision: sha('2'),
    },
    mirror: { repository: 'example/mirror', revision: sha('3') },
    d1: { stateContractDigest: hash('4'), readbackDigest: hash('5'), counts: { ...counts, documentCount: 146 } },
  }
  const releaseEvidence = {
    schema: 'agentic-graph-production-release-evidence/v1',
    repository: 'example/runtime',
    sourceRevision,
    rollbackCapturedAt: '2026-08-28T00:00:00.000Z',
    rollbackIdentity: predecessorRollbackIdentity,
    rollbackTargetDigest: digest(predecessorRollbackIdentity),
  }
  const collaboration = {
    actorId: 'actor', deviceId: 'device', sessionId: 'session', worktreeId: 'worktree',
    branchId: 'refs/heads/main', scopeId: 'release', leaseEpoch: 1, fenceRevision: sourceRevision,
  }
  const preservationEntry = {
    collaboration, writeSetDigest: hash('8'), stateDigest: hash('9'),
    recoveryHandle: 'active-lane:v1:test', preservationMode: 'active-lane', overlapClass: 'overlapping',
  }
  const preservation = sealed({
    schema: 'agentic-overlap-preservation-receipt/v1', status: 'preserved',
    convergenceBaseDigest: hash('a'), protectedTipDigest: hash('b'), captureAdapterId: 'test-capture/v1',
    entries: [preservationEntry], capturedAt: '2026-08-28T00:00:10.000Z',
  })
  const disposition = sealed({
    schema: 'agentic-overlap-disposition-receipt/v1', status: 'accounted',
    preservationReceiptDigest: preservation.receiptDigest,
    convergenceBaseDigest: preservation.convergenceBaseDigest,
    protectedTipDigest: preservation.protectedTipDigest,
    observations: [{
      collaboration, stateDigest: preservationEntry.stateDigest, recoveryHandle: preservationEntry.recoveryHandle,
      disposition: 'retained',
    }],
    observedAt: '2026-08-28T00:00:20.000Z',
  })
  const integration = sealed({
    schema: 'agentic-integration-receipt/v2', status: 'integrated',
    preservationReceiptDigest: preservation.receiptDigest,
    overlapDispositionReceiptDigest: disposition.receiptDigest, sourceRevision,
    sourceDigest: hash('6'), dependencyClosureDigest: hash('7'), checksDigest: hash('2'),
    evaluatorId: 'protected-integration-gate', collaboration,
    integrationTargetDigest: hash('3'), integratedAt: '2026-08-28T00:01:00.000Z',
  })
  const review = sealed({
    schema: 'agentic-runtime-review-receipt/v1', status: 'reviewed',
    integrationReceiptDigest: integration.receiptDigest, sourceDigest: integration.sourceDigest,
    dependencyClosureDigest: integration.dependencyClosureDigest, reviewSurfaceDigest: hash('4'), policyDigest: hash('8'),
    probesDigest: hash('5'), reviewerId: 'localhost:reviewer',
    issuedAt: '2026-08-28T00:02:00.000Z', expiresAt: '2026-08-29T00:02:00.000Z',
  })
  const candidate = sealed({
    schema: 'agentic-candidate-manifest/v1', status: 'awaiting-human-authorization',
    runtimeReviewReceiptDigest: review.receiptDigest, sourceDigest: review.sourceDigest,
    dependencyClosureDigest: review.dependencyClosureDigest, policyDigest: review.policyDigest,
    targetDigest: hash('9'), artifactDigest: hash('a'), manifestDigest: hash('b'),
    rollbackTargetDigest: releaseEvidence.rollbackTargetDigest, builtAt: '2026-08-28T00:03:00.000Z',
  })
  const releaseKey = digest({ targetDigest: candidate.targetDigest, candidateDigest: candidate.receiptDigest })
  const authorizationInteraction = sealed({
    schema: 'agentic-authorization-interaction-receipt/v1', status: 'observed',
    candidateDigest: candidate.receiptDigest, targetDigest: candidate.targetDigest,
    humanActorId: 'github-user:1:actor', interactionAdapterId: 'github-actions-protected-environment/v1',
    transportClass: 'headless-native', browserRequired: false, challengeDigest: hash('c'), responseDigest: hash('d'),
    recordedAt: '2026-08-28T00:03:30.000Z',
  })
  const authorizedHuman = sealed({
    schema: 'agentic-human-authorization-receipt/v2', status: 'authorized',
    candidateDigest: candidate.receiptDigest, targetDigest: candidate.targetDigest, releaseKey,
    decisionKind: 'human', humanActorId: 'github-user:1:actor', decisionRef: 'https://example.test/release',
    authorityAdapterId: 'github-actions-protected-environment/v1',
    interactionReceiptDigest: authorizationInteraction.receiptDigest,
    issuedAt: '2026-08-28T00:04:00.000Z', consumedAt: null,
    expiresAt: '2026-08-28T00:34:00.000Z',
  })
  const { receiptDigest: authorizationReceiptDigest, ...authorizedHumanBody } = authorizedHuman
  const authorization = sealed({
    ...authorizedHumanBody, status: 'consumed', consumedAt: '2026-08-28T00:04:00.000Z',
    controllerId: 'release-controller', authorizationReceiptDigest,
  })
  const deployment = sealed({
    schema: 'agentic-deployment-receipt/v1', status: 'deployed',
    consumedAuthorizationReceiptDigest: authorization.receiptDigest, candidateDigest: candidate.receiptDigest,
    targetDigest: candidate.targetDigest, releaseKey, controllerId: authorization.controllerId,
    deploymentAdapterId: 'cloudflare-pages/wrangler-output-v1', deployedArtifactDigest: candidate.artifactDigest,
    immutableDeploymentId: 'current-deployment', immutableDeploymentOrigin: 'https://current.example.pages.dev',
    rollbackTargetDigest: candidate.rollbackTargetDigest, deployedAt: '2026-08-28T00:05:00.000Z',
  })
  const state = sealed({
    schema: 'agentic-state-reconciliation-receipt/v1', status: 'reconciled',
    deploymentReceiptDigest: deployment.receiptDigest, candidateDigest: deployment.candidateDigest,
    targetDigest: deployment.targetDigest, controllerId: deployment.controllerId,
    stateContractDigest: hash('c'), operationsDigest: hash('d'), operationCount: 10, operationLimit: 100,
    readbackAdapterId: 'cloudflare-wrangler-d1-direct-readback/v1', readbackKind: 'direct-authoritative',
    readbackDigest: hash('e'), expectedCounts: counts, observedCounts: counts,
    pathHashParity: true, contentParity: true, reconciledAt: '2026-08-28T00:06:00.000Z',
  })
  const outcomes = {
    deployment_gate: 'success', deploy_pages: 'success', deployment_authority: 'success',
    deployment_receipt: 'success', reconcile_state: 'success', state_receipt: 'success',
    fidelity: 'failure', publish_mirror: 'skipped', publication_receipt: 'skipped',
  }
  const failureDetailBytes = Buffer.from(`${JSON.stringify({ failedStage: 'live-verification', outcomes }, null, 2)}\n`)
  const failureObservation = {
    schema: 'agentic-graph-production-release-failure-observation/v1', failedStage: 'live-verification',
    messageDigest: digest(failureDetailBytes), observedAt: '2026-08-28T00:07:00.000Z',
  }
  const pages = {
    deploymentId: deployment.immutableDeploymentId, deploymentOrigin: deployment.immutableDeploymentOrigin,
    deploymentCommitRevision: sourceRevision, sourceRevision, deployedAt: deployment.deployedAt,
  }
  const stateObservation = capturedAt => ({
    schema: 'agentic-graph-d1-state-snapshot/v1', workspaceId: 'workspace:canonical',
    readbackAdapterId: state.readbackAdapterId, readbackKind: state.readbackKind,
    stateContractDigest: state.stateContractDigest, readbackDigest: state.readbackDigest,
    observedCounts: counts, capturedAt,
  })
  const mirror = observedAt => ({
    schema: 'agentic-graph-production-observed-mirror-identity/v1',
    repository: predecessorRollbackIdentity.mirror.repository,
    revision: predecessorRollbackIdentity.mirror.revision,
    sourceRevision: predecessorRollbackIdentity.pages.sourceRevision, observedAt,
  })
  return {
    lifecycle: {
      preservation, disposition, integration, review, candidate, authorizationInteraction,
      authorizedHuman, authorization, deployment, state, releaseEvidence,
    },
    failureObservation,
    failureDetail: JSON.parse(String(failureDetailBytes)),
    failureDetailBytes,
    firstObservation: {
      pages: { ...pages }, state: stateObservation('2026-08-28T00:08:00.000Z'),
      mirror: mirror('2026-08-28T00:09:00.000Z'),
    },
    secondObservation: {
      pages: { ...pages }, state: stateObservation('2026-08-28T00:10:00.000Z'),
      mirror: mirror('2026-08-28T00:11:00.000Z'),
    },
  }
}

test('forward-heal baseline deterministically binds the joined failed run and two stable provider reads', () => {
  const input = fixture()
  const first = createForwardHealBaselineEvidence(input)
  const replay = createForwardHealBaselineEvidence(structuredClone(input))
  assert.deepEqual(replay, first)
  assert.equal(first.attestation.status, 'forward-heal-required')
  assert.equal(first.attestation.effect, 'evidence-only')
  assert.equal(first.attestation.rollbackDisposition, 'preserve-current-on-failure')
  assert.equal(first.attestation.observedAt, input.secondObservation.mirror.observedAt)
  assert.equal(first.rollbackRecapture.capturedAt, input.secondObservation.mirror.observedAt)
  assert.equal(first.rollbackRecapture.rollbackIdentity.pages.sourceRevision, input.lifecycle.integration.sourceRevision)
  assert.equal(first.rollbackRecapture.rollbackIdentity.mirror.revision,
    input.lifecycle.releaseEvidence.rollbackIdentity.mirror.revision)
  assert.equal(first.attestation.rollbackTargetDigest, digest(first.rollbackRecapture.rollbackIdentity))
  assert.deepEqual(normalizeRollbackRecapture(first.rollbackRecapture), first.rollbackRecapture)
  const { attestationDigest, ...attestationBody } = first.attestation
  assert.equal(attestationDigest, digest(attestationBody))
  assert.deepEqual(
    first.attestation.observationRounds.map(round => [round.pagesIdentityDigest, round.stateIdentityDigest, round.mirrorIdentityDigest]),
    Array(2).fill([
      first.attestation.observationRounds[0].pagesIdentityDigest,
      first.attestation.observationRounds[0].stateIdentityDigest,
      first.attestation.observationRounds[0].mirrorIdentityDigest,
    ]),
  )
})

test('forward-heal baseline fails closed on authority, second-read, chronology, and split drift', async t => {
  const cases = [
    ['receipt digest', input => { input.lifecycle.deployment.immutableDeploymentId = 'tampered' }, /deployment receipt receipt digest drifted/],
    ['preservation join', input => {
      input.lifecycle.preservation = resealed({ ...input.lifecycle.preservation, captureAdapterId: 'foreign-capture/v1' })
    }, /overlap disposition is unjoined from preservation/],
    ['disposition join', input => {
      input.lifecycle.disposition = resealed({ ...input.lifecycle.disposition, observedAt: '2026-08-28T00:00:30.000Z' })
    }, /integration is unjoined from overlap disposition/],
    ['authorization interaction join', input => {
      input.lifecycle.authorizationInteraction = resealed({
        ...input.lifecycle.authorizationInteraction, interactionAdapterId: 'foreign-interaction/v1',
      })
    }, /authorized human receipt is unjoined from authorization interaction/],
    ['authorized human join', input => {
      input.lifecycle.authorizedHuman = resealed({
        ...input.lifecycle.authorizedHuman, decisionRef: 'https://example.test/foreign-release',
      })
    }, /consumed authorization is unjoined from authorized human receipt/],
    ['detail digest', input => { input.failureDetailBytes = Buffer.from('{}\n') }, /failed release detail bytes drifted/],
    ['second read', input => { input.secondObservation.state.readbackDigest = hash('0') }, /provider observations changed between reads/],
    ['chronology', input => { input.secondObservation.state.capturedAt = '2026-08-28T00:08:30.000Z' }, /observation round overlaps/],
    ['healthy parity', input => {
      input.firstObservation.mirror.sourceRevision = input.lifecycle.integration.sourceRevision
      input.secondObservation.mirror.sourceRevision = input.lifecycle.integration.sourceRevision
    }, /requires an explicit Pages\/mirror source split/],
    ['predecessor mirror source', input => {
      input.firstObservation.mirror.sourceRevision = sha('e')
      input.secondObservation.mirror.sourceRevision = sha('e')
    }, /mirror sourceRevision drifted from the predecessor rollback Pages sourceRevision/],
  ]
  for (const [name, mutate, pattern] of cases) await t.test(name, () => {
    const input = fixture()
    mutate(input)
    assert.throws(() => createForwardHealBaselineEvidence(input), pattern)
  })
})

test('forward-heal CLI writes evidence once and accepts byte-identical replay', t => {
  const input = fixture()
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agentic-graph-forward-heal-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const receiptDir = path.join(root, 'receipts')
  const firstDir = path.join(root, 'first')
  const secondDir = path.join(root, 'second')
  for (const directory of [receiptDir, firstDir, secondDir]) fs.mkdirSync(directory, { recursive: true })
  const write = (filePath, value) => fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`)
  for (const [fileName, value] of [
    ['overlap-preservation-receipt.json', input.lifecycle.preservation],
    ['overlap-disposition-receipt.json', input.lifecycle.disposition],
    ['integration-receipt.json', input.lifecycle.integration],
    ['runtime-review-receipt.json', input.lifecycle.review],
    ['candidate-manifest.json', input.lifecycle.candidate],
    ['authorization-interaction-receipt.json', input.lifecycle.authorizationInteraction],
    ['human-authorization-receipt.json', input.lifecycle.authorizedHuman],
    ['consumed-human-authorization-receipt.json', input.lifecycle.authorization],
    ['deployment-receipt.json', input.lifecycle.deployment],
    ['state-reconciliation-receipt.json', input.lifecycle.state],
    ['release-evidence.json', input.lifecycle.releaseEvidence],
  ]) write(path.join(receiptDir, fileName), value)
  write(path.join(root, 'failure.json'), input.failureObservation)
  fs.writeFileSync(path.join(root, 'failure-detail.json'), input.failureDetailBytes)
  for (const [directory, observation] of [[firstDir, input.firstObservation], [secondDir, input.secondObservation]]) {
    write(path.join(directory, 'pages.json'), observation.pages)
    write(path.join(directory, 'state.json'), observation.state)
    write(path.join(directory, 'mirror.json'), observation.mirror)
  }
  const attestationPath = path.join(root, 'attestation.json')
  const recapturePath = path.join(root, 'recapture.json')
  const argumentsList = [
    path.resolve(import.meta.dirname, '..', 'verify-production-release-transports.mjs'), 'forward-heal-baseline',
    '--receipt-dir', receiptDir,
    '--failure-observation', path.join(root, 'failure.json'),
    '--failure-detail', path.join(root, 'failure-detail.json'),
    '--first-pages-observation', path.join(firstDir, 'pages.json'),
    '--first-state-evidence', path.join(firstDir, 'state.json'),
    '--first-mirror-observation', path.join(firstDir, 'mirror.json'),
    '--second-pages-observation', path.join(secondDir, 'pages.json'),
    '--second-state-evidence', path.join(secondDir, 'state.json'),
    '--second-mirror-observation', path.join(secondDir, 'mirror.json'),
    '--attestation-output', attestationPath,
    '--rollback-recapture-output', recapturePath,
  ]
  const created = JSON.parse(execFileSync(process.execPath, argumentsList, { encoding: 'utf8' }))
  const attestationBytes = fs.readFileSync(attestationPath)
  const recaptureBytes = fs.readFileSync(recapturePath)
  const replayed = JSON.parse(execFileSync(process.execPath, argumentsList, { encoding: 'utf8' }))
  assert.equal(created.attestationWrite, 'created')
  assert.equal(created.rollbackWrite, 'created')
  assert.equal(replayed.attestationWrite, 'replayed')
  assert.equal(replayed.rollbackWrite, 'replayed')
  assert.deepEqual(fs.readFileSync(attestationPath), attestationBytes)
  assert.deepEqual(fs.readFileSync(recapturePath), recaptureBytes)
})
