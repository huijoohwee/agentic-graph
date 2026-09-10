import assert from 'node:assert/strict'
import { digest } from './travel-mesh-release-plan.mjs'

export const RECOVERY_SCHEMA = 'agentic-graph-core-publication-recovery/v1'
export const RECOVERY_REQUIRED_STEPS = Object.freeze([
  'Upload and activate exact-candidate travel mesh versions',
  'Reconcile canonical docs into D1',
  'Publish exact canonical documents through the storage owner',
  'Verify live runtime', 'Verify stable Pages runtime', 'Verify public custom-domain runtime',
  'Verify exact deployment markers and candidate browser fidelity',
  'Verify returning-user service worker revision convergence',
  'Verify immutable and public production transports', 'Record live verification receipt',
])
export const verifySealedRecoveryInput = (value, schema) => {
  assert.equal(value?.schema, schema)
  const { receiptDigest, ...body } = value
  assert.equal(digest(body), receiptDigest, `${schema} seal differs`)
  return value
}
export function validateRecoveryRun(run, jobs, repository, runId) {
  assert.equal(run.repository?.full_name, repository)
  assert.equal(String(run.id), String(runId))
  assert.equal(run.event, 'workflow_dispatch')
  assert.equal(run.head_branch, 'main')
  assert.equal(run.path?.split('@')[0], '.github/workflows/release.yml')
  assert.equal(run.status, 'completed')
  assert.equal(run.conclusion, 'failure')
  const deployment = jobs.find(job => job.name === 'Human-Authorized Deploy, Verify, And Publish Mirror')
  assert(deployment, 'original deployment job is required')
  const conclusion = name => deployment.steps.find(step => step.name === name)?.conclusion
  for (const name of RECOVERY_REQUIRED_STEPS) assert.equal(conclusion(name), 'success', name)
  assert.equal(conclusion('Publish verified production mirror'), 'failure')
  assert.equal(conclusion('Restore exact prior travel mesh versions'), 'success')
  assert.equal(conclusion('Roll back Pages to exact last-known-good deployment'), 'skipped')
  return run.head_sha
}
export function createRecoveryPlan({ controllerRevision, recoveryRunId, originalRun, originalArtifact,
  core, rollback, pages, live, mirrorRevision, issuedAt }) {
  verifySealedRecoveryInput(core, 'agentic-graph-core-runtime-release-receipt/v1')
  verifySealedRecoveryInput(rollback, 'agentic-graph-core-runtime-rollback-receipt/v1')
  assert.equal(core.status, 'deployed')
  assert.equal(rollback.status, 'restored')
  assert.equal(core.sourceRevision, originalRun.head_sha)
  assert.equal(rollback.sourceRevision, core.sourceRevision)
  assert.equal(rollback.candidateDigest, core.candidateDigest)
  assert.equal(rollback.configurationDigest, core.configurationDigest)
  assert.equal(pages.sourceRevision, core.sourceRevision)
  assert.equal(live.candidateDigest, core.candidateDigest)
  assert.equal(core.units.length, 1)
  const unit = core.units[0]
  assert.equal(unit.id, 'storage')
  assert.equal(unit.worker, 'agentic-storage')
  assert.equal(unit.activated, true)
  assert.equal(unit.deployed.versionId, unit.candidate.versionId)
  assert.equal(rollback.compensation.failures.length, 0)
  assert.equal(rollback.serving.length, 1)
  assert.equal(rollback.serving[0].versionId, unit.previous.versionId)
  assert.equal(rollback.serving[0].percentage, 100)
  for (const revision of [controllerRevision, mirrorRevision, core.sourceRevision]) assert.match(revision, /^[a-f0-9]{40}$/)
  const body = {
    schema: RECOVERY_SCHEMA, controllerRevision, recoveryRunId: String(recoveryRunId),
    originalRunId: String(originalRun.id), originalSourceRevision: core.sourceRevision,
    originalArtifactId: originalArtifact.id, originalArtifactDigest: originalArtifact.digest,
    originalCoreReceiptDigest: core.receiptDigest, originalRollbackReceiptDigest: rollback.receiptDigest,
    lifecycleCandidateDigest: core.candidateDigest, configurationDigest: core.configurationDigest,
    worker: unit.worker, versionId: unit.candidate.versionId, versionDigest: unit.candidate.versionDigest,
    expectedCurrentDeploymentId: rollback.serving[0].deploymentId,
    expectedCurrentVersionId: unit.previous.versionId,
    pagesDeploymentId: pages.deploymentId, pagesOrigin: pages.deploymentOrigin,
    mirrorRevision, liveVerificationReceiptDigest: live.receiptDigest,
    issuedAt, expiresAt: new Date(Date.parse(issuedAt) + 60 * 60_000).toISOString(),
    allowedEffects: ['activate-existing-storage-version', 'verify-core-browser-session'],
  }
  return { ...body, planDigest: digest(body) }
}
export function validateRecoveryPlan(plan) {
  assert.equal(plan.schema, RECOVERY_SCHEMA)
  const { planDigest, ...body } = plan
  assert.equal(digest(body), planDigest, 'recovery plan seal differs')
  assert.equal(plan.worker, 'agentic-storage')
  assert.deepEqual(plan.allowedEffects, ['activate-existing-storage-version', 'verify-core-browser-session'])
  return plan
}
export function assertRecoveryAuthority({ plan, environment, approvals, ownerId, now = new Date() }) {
  validateRecoveryPlan(plan)
  assert.equal(environment.GITHUB_ACTIONS, 'true')
  assert.equal(environment.GITHUB_REF, 'refs/heads/main')
  assert.equal(environment.GITHUB_SHA, plan.controllerRevision)
  assert.equal(environment.GITHUB_WORKFLOW, 'Production Release')
  assert.equal(environment.GITHUB_WORKFLOW_REF,
    `${environment.GITHUB_REPOSITORY}/.github/workflows/release.yml@refs/heads/main`)
  assert.equal(String(environment.GITHUB_RUN_ID), plan.recoveryRunId)
  assert.equal(String(environment.GITHUB_RUN_ATTEMPT), '1', 'recovery attempts require a fresh plan')
  assert(now.getTime() >= Date.parse(plan.issuedAt) && now.getTime() < Date.parse(plan.expiresAt), 'recovery plan expired')
  const approved = approvals.filter(item => item.state === 'approved'
    && item.environments?.some(value => value.name === 'production'))
  assert.equal(approved.length, 1, 'one exact production approval is required')
  const approval = approved[0]
  assert.equal(approval.user?.type, 'User')
  assert.equal(`github-user:${approval.user.id}:${approval.user.login}`, ownerId)
  assert.equal(approval.comment, `authorize recovery ${plan.planDigest}`)
  return { userId: approval.user.id, login: approval.user.login, planDigest: plan.planDigest }
}
export function assertRecoveryProviderState(plan, { deployment, version, pages, mirrorRevision }) {
  validateRecoveryPlan(plan)
  assert.equal(deployment.deploymentId, plan.expectedCurrentDeploymentId, 'storage deployment changed since rollback')
  assert.equal(deployment.versionId, plan.expectedCurrentVersionId, 'storage version changed since rollback')
  assert.equal(version.id, plan.versionId)
  assert.equal(digest(version), plan.versionDigest, 'stored candidate version bytes changed')
  assert.equal(pages.deploymentId, plan.pagesDeploymentId, 'Pages deployment changed')
  assert.equal(pages.sourceRevision, plan.originalSourceRevision)
  assert.equal(mirrorRevision, plan.mirrorRevision, 'published mirror changed')
}
