import assert from 'node:assert/strict'
import test from 'node:test'
import fs from 'node:fs'
import { digest, seal } from '../travel-mesh-release-plan.mjs'
import { assertRecoveryAuthority, assertRecoveryProviderState, createRecoveryPlan,
  RECOVERY_REQUIRED_STEPS, validateRecoveryPlan, validateRecoveryRun } from '../production-release-recovery-proof.mjs'

const source = 'a'.repeat(40), controller = 'b'.repeat(40), mirror = 'c'.repeat(40)
const candidate = 'd'.repeat(64), config = 'e'.repeat(64)
const issuedAt = '2026-09-10T00:00:00.000Z'
const version = { id: 'candidate-version', resources: { bindings: [] } }
const fixture = () => {
  const core = seal({ schema: 'agentic-graph-core-runtime-release-receipt/v1', status: 'deployed',
    sourceRevision: source, candidateDigest: candidate, configurationDigest: config,
    units: [{ id: 'storage', worker: 'agentic-storage', activated: true,
      previous: { versionId: 'baseline-version' }, candidate: { versionId: version.id, versionDigest: digest(version) },
      deployed: { versionId: version.id } }] })
  const rollback = seal({ schema: 'agentic-graph-core-runtime-rollback-receipt/v1', status: 'restored',
    sourceRevision: source, candidateDigest: candidate, configurationDigest: config,
    compensation: { failures: [] }, serving: [{ deploymentId: 'rollback-deployment', versionId: 'baseline-version', percentage: 100 }] })
  const run = { id: 12, repository: { full_name: 'huijoohwee/agentic-graph' }, event: 'workflow_dispatch',
    head_branch: 'main', path: '.github/workflows/release.yml', status: 'completed', conclusion: 'failure', head_sha: source }
  const jobs = [{ name: 'Human-Authorized Deploy, Verify, And Publish Mirror', steps: [
    ...RECOVERY_REQUIRED_STEPS.map(name => ({ name, conclusion: 'success' })),
    { name: 'Publish verified production mirror', conclusion: 'failure' },
    { name: 'Restore exact prior travel mesh versions', conclusion: 'success' },
    { name: 'Roll back Pages to exact last-known-good deployment', conclusion: 'skipped' },
  ] }]
  const pages = { deploymentId: 'retained-pages', deploymentOrigin: 'https://retained.example', sourceRevision: source }
  const plan = createRecoveryPlan({ controllerRevision: controller, recoveryRunId: 13, originalRun: run,
    originalArtifact: { id: 22, digest: 'sha256:' + 'f'.repeat(64) }, core, rollback, pages,
    live: { candidateDigest: candidate, receiptDigest: '1'.repeat(64) }, mirrorRevision: mirror, issuedAt })
  return { core, rollback, run, jobs, pages, plan }
}

test('recovery requires completed live verification and an observed partial rollback', () => {
  const { run, jobs } = fixture()
  assert.equal(validateRecoveryRun(run, jobs, 'huijoohwee/agentic-graph', 12), source)
  for (const name of RECOVERY_REQUIRED_STEPS) {
    const changed = structuredClone(jobs)
    changed[0].steps.find(step => step.name === name).conclusion = 'failure'
    assert.throws(() => validateRecoveryRun(run, changed, 'huijoohwee/agentic-graph', 12))
  }
  const restored = structuredClone(jobs)
  restored[0].steps.at(-1).conclusion = 'success'
  assert.throws(() => validateRecoveryRun(run, restored, 'huijoohwee/agentic-graph', 12))
})

test('the sealed plan cannot substitute a different Worker version or effect', () => {
  const { plan } = fixture()
  assert.equal(validateRecoveryPlan(plan), plan)
  assert.throws(() => validateRecoveryPlan({ ...plan, versionId: 'unreviewed-version' }))
  const changed = { ...plan, allowedEffects: ['upload-new-worker'] }
  const { planDigest, ...body } = changed
  assert.throws(() => validateRecoveryPlan({ ...body, planDigest: digest(body) }))
})

test('provider drift stops recovery before activation', () => {
  const { plan, pages } = fixture()
  const observed = { deployment: { deploymentId: 'rollback-deployment', versionId: 'baseline-version' },
    version, pages, mirrorRevision: mirror }
  assert.doesNotThrow(() => assertRecoveryProviderState(plan, observed))
  for (const changed of [
    { ...observed, deployment: { ...observed.deployment, deploymentId: 'another-controller' } },
    { ...observed, version: { ...version, resources: { bindings: ['drift'] } } },
    { ...observed, pages: { ...pages, deploymentId: 'new-pages' } },
    { ...observed, mirrorRevision: '0'.repeat(40) },
  ]) assert.throws(() => assertRecoveryProviderState(plan, changed))
})

test('only current protected-run approval of the exact plan permits recovery', () => {
  const { plan } = fixture()
  const environment = { GITHUB_ACTIONS: 'true', GITHUB_REF: 'refs/heads/main', GITHUB_SHA: controller,
    GITHUB_REPOSITORY: 'huijoohwee/agentic-graph', GITHUB_WORKFLOW: 'Production Release',
    GITHUB_WORKFLOW_REF: 'huijoohwee/agentic-graph/.github/workflows/release.yml@refs/heads/main',
    GITHUB_RUN_ID: '13', GITHUB_RUN_ATTEMPT: '1' }
  const approvals = [{ state: 'approved', environments: [{ name: 'production' }],
    user: { type: 'User', id: 1, login: 'operator' }, comment: `authorize recovery ${plan.planDigest}` }]
  const request = { plan, environment, approvals, ownerId: 'github-user:1:operator', now: new Date(issuedAt) }
  assert.equal(assertRecoveryAuthority(request).planDigest, plan.planDigest)
  for (const changed of [
    { ...request, environment: { ...environment, GITHUB_ACTIONS: undefined } },
    { ...request, environment: { ...environment, GITHUB_RUN_ID: '12' } },
    { ...request, environment: { ...environment, GITHUB_RUN_ATTEMPT: '2' } },
    { ...request, approvals: [{ ...approvals[0], comment: 'approved' }] },
    { ...request, ownerId: 'github-user:2:unrelated' },
    { ...request, now: new Date(plan.expiresAt) },
  ]) assert.throws(() => assertRecoveryAuthority(changed))
})

test('release checks mirror bytes before activation and preserves all resources together', () => {
  const workflow = fs.readFileSync(new URL('../../.github/workflows/release.yml', import.meta.url), 'utf8')
  assert(workflow.indexOf('Verify complete mirror runtime seal before activation') < workflow.indexOf('Deploy verified artifact'))
  const rollback = workflow.slice(workflow.indexOf('- name: Restore exact prior travel mesh versions'))
    .split('working-directory:')[0]
  assert.match(rollback, /steps\.rollback_eligibility\.outputs\.eligible == 'true'/)
  assert.match(workflow, /verify:\n    if: inputs\.recovery_run_id == ''/)
  const recovery = fs.readFileSync(new URL('../../.github/workflows/production-release-recovery.yml', import.meta.url), 'utf8')
  assert.match(recovery, /environment: production/)
  assert.doesNotMatch(recovery, /pages deploy|versions upload|d1 migrations apply/)
})
