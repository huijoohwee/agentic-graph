import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { canonicalJson } from 'agentic-os'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const repository = 'huijoohwee/agentic-graph'
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim()
const gh = (...args) => execFileSync('gh', args, { cwd: root, encoding: 'utf8', timeout: 30000, maxBuffer: 8 * 1024 * 1024 })
export const historyArtifactName = binding => 'browser-preflight-' + createHash('sha256').update(canonicalJson(binding)).digest('hex')
export const priorRunRequiresJobHistory = run => run.status === 'completed'
  && ['failure', 'cancelled'].includes(run.conclusion)
const rollbackArtifactLimit = 4 * 1024 * 1024
const rollbackHistoryBudget = 16 * 1024 * 1024
const exactPriorJob = (run, jobs, name) => {
  assert.ok(Array.isArray(jobs), 'prior release jobs are required')
  const matches = jobs.filter(job => job.name === name)
  assert.equal(matches.length, 1, `prior ${name} job is ambiguous`)
  const job = matches[0]
  assert.equal(job.run_id, run.id)
  assert.equal(job.run_attempt, run.run_attempt)
  assert.equal(job.head_sha, run.head_sha)
  assert.equal(job.status, 'completed')
  return job
}
// A passed browser ledger remains evidence when authorization or a read-only
// preflight stops deployment. It never substitutes for fresh authorization.
export function assertPreDeploymentStop(run, jobs) {
  const verify = exactPriorJob(run, jobs, 'Verify Release Candidate')
  assert.equal(verify.conclusion, 'success', 'prior candidate verification did not pass')
  const deploy = exactPriorJob(run, jobs, 'Human-Authorized Deploy, Verify, And Publish Mirror')
  assert.equal(deploy.conclusion, 'failure')
  const exactStep = name => {
    const matches = deploy.steps.filter(step => step.name === name)
    assert.equal(matches.length, 1, `prior ${name} step is missing or ambiguous`)
    assert.equal(matches[0].status, 'completed')
    return matches[0]
  }
  const stepResult = (name, conclusion) =>
    assert.equal(exactStep(name).conclusion, conclusion, `prior ${name} was not ${conclusion}`)
  const authorization = 'Record exact human authorization and claim release controller'
  const devPromotion = 'Promote isolated Pages Dev and verify shared data views'
  const preflight = 'Preflight protected travel mesh without mutation'
  const stoppedAtAuthorization = exactStep(authorization).conclusion === 'failure'
  const stoppedAtDev = !stoppedAtAuthorization && exactStep(devPromotion).conclusion === 'failure'
  stepResult(authorization, stoppedAtAuthorization ? 'failure' : 'success')
  stepResult(devPromotion, stoppedAtAuthorization ? 'skipped' : stoppedAtDev ? 'failure' : 'success')
  stepResult(preflight, stoppedAtAuthorization || stoppedAtDev ? 'skipped' : 'failure')
  const stopStep = stoppedAtAuthorization ? authorization : stoppedAtDev ? devPromotion : preflight
  for (const name of ['Deploy verified artifact', 'Capture authoritative candidate deployment',
    'Record exact Pages deployment receipt', 'Upload and activate exact-candidate travel mesh versions',
    'Reconcile canonical docs into D1', 'Publish exact canonical documents through the storage owner',
    'Publish verified production mirror', 'Restore exact prior travel mesh versions',
    'Roll back Pages to exact last-known-good deployment', 'Restore and reconcile last-known-good D1 state']) {
    stepResult(name, 'skipped')
  }
  const attemptGuard = 'Require an exact successful deployment attempt'
  stepResult(attemptGuard, 'failure')
  const allowedFailures = new Set([stopStep, attemptGuard])
  assert.ok(deploy.steps.every(step => ['success', 'skipped'].includes(step.conclusion)
    || (step.conclusion === 'failure' && allowedFailures.has(step.name))), 'prior deployment has an unresolved failure')
}
export function assertCancellationBeforeDeployment(run, jobs) {
  const verify = exactPriorJob(run, jobs, 'Verify Release Candidate')
  assert.equal(verify.conclusion, 'success', 'prior candidate verification did not pass')
  const deploy = exactPriorJob(run, jobs, 'Human-Authorized Deploy, Verify, And Publish Mirror')
  assert.equal(deploy.conclusion, 'cancelled', 'prior deployment was not cancelled')
  assert.ok(Array.isArray(deploy.steps), 'cancelled deployment step history is unavailable')
  assert.equal(deploy.steps.length, 0, 'cancelled deployment started before reconciliation')
}
export function assertRollbackCarrierBinding(run, carrier) {
  assert.equal(carrier?.schema, 'agentic-collaborative-release-lifecycle/v2', 'prior rollback carrier schema differs')
  assert.equal(carrier.completion, 'rolled-back', 'prior lifecycle is not terminally rolled back')
  assert.ok(Array.isArray(carrier.receipts), 'prior rollback receipts are unavailable')
  const exactReceipt = schema => {
    const matches = carrier.receipts.filter(receipt => receipt.schema === schema)
    assert.equal(matches.length, 1, `prior ${schema} receipt is missing or ambiguous`)
    return matches[0]
  }
  const integration = exactReceipt('agentic-integration-receipt/v2')
  const candidate = exactReceipt('agentic-candidate-manifest/v1')
  const deployment = exactReceipt('agentic-deployment-receipt/v1')
  const rollback = exactReceipt('agentic-rollback-receipt/v1')
  assert.equal(integration.sourceRevision, run.head_sha, 'prior rollback source differs from its workflow run')
  assert.ok(candidate.receiptDigest, 'prior candidate receipt digest is missing')
  assert.equal(deployment.candidateDigest, candidate.receiptDigest, 'prior deployment differs from its candidate')
  assert.equal(rollback.status, 'rolled-back', 'prior rollback receipt is not terminal')
  assert.equal(rollback.failedStage, 'deployment', 'prior release failed outside deployment')
  assert.equal(rollback.candidateDigest, candidate.receiptDigest, 'prior rollback differs from its candidate')
  assert.equal(rollback.deploymentReceiptDigest, deployment.receiptDigest, 'prior rollback differs from its deployment')
  assert.equal(rollback.terminalResult, 'restored-last-known-good', 'prior release did not restore last-known-good state')
}

export function assertCompletedRollback(run, jobs, carrier) {
  const verify = exactPriorJob(run, jobs, 'Verify Release Candidate')
  assert.equal(verify.conclusion, 'success', 'prior candidate verification did not pass')
  const deploy = exactPriorJob(run, jobs, 'Human-Authorized Deploy, Verify, And Publish Mirror')
  assert.equal(deploy.conclusion, 'failure', 'prior deployment was not rolled back after failure')
  const exactStep = name => {
    const matches = deploy.steps.filter(step => step.name === name)
    assert.equal(matches.length, 1, `prior ${name} step is missing or ambiguous`)
    assert.equal(matches[0].status, 'completed')
    return matches[0]
  }
  const expected = new Map([
    ['Require an exact successful deployment attempt', 'success'],
    ['Upload and activate exact-candidate travel mesh versions', 'failure'],
    ['Record normalized release failure observation', 'success'],
    ['Determine pre-publication rollback eligibility', 'success'],
    ['Preserve deployed state after publication boundary', 'skipped'],
    ['Preserve ambiguous travel mesh state', 'skipped'],
    ['Restore exact prior travel mesh versions', 'skipped'],
    ['Roll back Pages to exact last-known-good deployment', 'success'],
    ['Restore and reconcile last-known-good D1 state', 'success'],
    ['Capture authoritative restored Pages deployment', 'success'],
    ['Verify restored immutable Pages runtime', 'success'],
    ['Verify restored stable Pages runtime', 'success'],
    ['Verify restored public custom-domain runtime', 'success'],
    ['Record restored production transport evidence', 'success'],
    ['Seal and validate rolled-back lifecycle carrier', 'success'],
    ['Persist terminal rolled-back lifecycle receipts', 'success'],
    ['Persist raw production release observations', 'success'],
  ])
  for (const [name, conclusion] of expected) {
    assert.equal(exactStep(name).conclusion, conclusion, `prior ${name} was not ${conclusion}`)
  }
  const expectedFailure = 'Upload and activate exact-candidate travel mesh versions'
  assert.ok(deploy.steps.every(step => step.conclusion === 'success' || step.conclusion === 'skipped'
    || (step.name === expectedFailure && step.conclusion === 'failure')),
  'prior deployment has an unresolved or ambiguous failure')
  assertRollbackCarrierBinding(run, carrier)
}

async function restoreRollbackCarrier(run, jobs, docsRoot, remainingBudget) {
  assert.ok(Number.isSafeInteger(run.id) && run.id > 0, 'prior rollback run identity is invalid')
  assert.match(run.head_sha, /^[0-9a-f]{40}$/, 'prior rollback source revision is invalid')
  const name = `production-lifecycle-rolled-back-${run.head_sha}-${run.id}`
  const deploy = exactPriorJob(run, jobs, 'Human-Authorized Deploy, Verify, And Publish Mirror')
  const persistedSteps = deploy.steps.filter(step => step.name === 'Persist terminal rolled-back lifecycle receipts')
  assert.equal(persistedSteps.length, 1, 'prior terminal rollback persistence step is missing or ambiguous')
  const persistedStep = persistedSteps[0]
  assert.equal(persistedStep.status, 'completed')
  assert.equal(persistedStep.conclusion, 'success')
  const persistedAt = Date.parse(persistedStep.completed_at)
  assert.ok(Number.isFinite(persistedAt), 'prior rollback persistence time is invalid')
  const listing = JSON.parse(gh('api', `repos/${repository}/actions/runs/${run.id}/artifacts?per_page=100`))
  assert.ok(Array.isArray(listing.artifacts) && Number.isSafeInteger(listing.total_count), 'prior rollback artifact response is malformed')
  assert.ok(listing.total_count <= 100 && listing.artifacts.length === listing.total_count, 'prior rollback artifacts exceed their observation bound')
  const matches = listing.artifacts.filter(artifact => artifact.name === name)
  assert.equal(matches.length, 1, 'exact prior rolled-back lifecycle artifact is missing or ambiguous')
  const artifact = matches[0]
  assert.equal(artifact.expired, false, 'prior rollback evidence expired and requires reconciliation')
  assert.equal(String(artifact.workflow_run?.id), String(run.id), 'prior rollback artifact run identity differs')
  assert.equal(artifact.workflow_run?.head_sha, run.head_sha, 'prior rollback artifact source differs from its workflow run')
  assert.equal(artifact.workflow_run?.head_branch, 'main', 'prior rollback artifact is not bound to protected main')
  assert.match(artifact.digest, /^sha256:[0-9a-f]{64}$/, 'prior rollback artifact digest is missing')
  assert.ok(Date.parse(artifact.created_at) >= persistedAt && Date.parse(artifact.updated_at) >= persistedAt,
    'prior rollback artifact predates the exact run-attempt persistence step')
  assert.ok(Number.isSafeInteger(artifact.size_in_bytes) && artifact.size_in_bytes > 0
    && artifact.size_in_bytes <= rollbackArtifactLimit, 'prior rollback artifact exceeds its byte bound')
  remainingBudget.bytes += artifact.size_in_bytes
  assert.ok(remainingBudget.bytes <= rollbackHistoryBudget, 'prior rollback history exceeds its aggregate byte bound')
  const runnerTemp = process.env.RUNNER_TEMP
  assert.ok(runnerTemp && path.isAbsolute(runnerTemp), 'absolute runner temp path is required for rollback validation')
  const rollbackDir = path.join(runnerTemp, 'agentic-graph-browser-history-rollbacks', String(run.id))
  assert.equal(await fs.stat(rollbackDir).then(() => true, error => { if (error.code === 'ENOENT') return false; throw error }), false,
    'prior rollback evidence cannot overwrite an existing record')
  await fs.mkdir(rollbackDir, { recursive: true })
  gh('run', 'download', String(run.id), '--repo', repository, '--name', name, '--dir', rollbackDir)
  const carrierPath = path.join(rollbackDir, 'collaborative-release-lifecycle-rollback-v2.json')
  const releaseEvidencePath = path.join(rollbackDir, 'release-evidence.json')
  const carrier = JSON.parse(await fs.readFile(carrierPath, 'utf8'))
  const releaseEvidence = JSON.parse(await fs.readFile(releaseEvidencePath, 'utf8'))
  assert.equal(releaseEvidence.sourceRevision, run.head_sha, 'prior release evidence differs from its workflow run')
  execFileSync('npm', ['run', '--silent', 'release:lifecycle:receipts', '--', 'validate', '--docs-root', docsRoot,
    '--docs-sha', execFileSync('git', ['rev-parse', 'HEAD'], { cwd: docsRoot, encoding: 'utf8' }).trim(), '--carrier', carrierPath],
  { cwd: root, env: process.env, timeout: 30000, stdio: 'inherit' })
  assertRollbackCarrierBinding(run, carrier)
  return carrier
}

export function assertPriorBrowserRun(run, currentRun, jobs, rollbackCarrier = null) {
  assert.ok(Number.isSafeInteger(run.id), 'prior run identity is missing')
  assert.match(run.head_sha, /^[0-9a-f]{40}$/, 'prior source revision is invalid')
  assert.notEqual(String(run.id), String(currentRun), 'a release attempt cannot overwrite its own browser history')
  assert.equal(run.path, '.github/workflows/release.yml', 'browser history workflow differs')
  assert.equal(run.event, 'workflow_dispatch', 'browser history trigger differs')
  assert.equal(run.head_branch, 'main', 'browser history is not protected main')
  assert.equal(run.status, 'completed', 'prior release is still active; preserve its history')
  if (run.conclusion === 'failure' && jobs) {
    const deploy = exactPriorJob(run, jobs, 'Human-Authorized Deploy, Verify, And Publish Mirror')
    const attempt = deploy.steps?.filter(step => step.name === 'Require an exact successful deployment attempt') ?? []
    if (attempt.length === 1 && attempt[0].conclusion === 'success') assertCompletedRollback(run, jobs, rollbackCarrier)
    else assertPreDeploymentStop(run, jobs)
  }
  else if (run.conclusion === 'cancelled' && jobs) assertCancellationBeforeDeployment(run, jobs)
  else assert.equal(run.conclusion, 'success', 'unchanged prior release failed or was interrupted; repair or reconcile before retry')
}

async function restore() {
  const docsRoot = process.env.AGENTIC_OS_AGENTIC_CANVAS_OS_DOCS_ROOT
  assert.ok(docsRoot && path.isAbsolute(docsRoot), 'absolute pinned docs root is required')
  assert.equal(await fs.realpath(docsRoot), docsRoot, 'docs root must be a real path')
  assert.equal(process.env.GITHUB_REPOSITORY, repository)
  assert.equal(process.env.GITHUB_REF, 'refs/heads/main')
  const binding = { sourceTree: git('rev-parse', 'HEAD^{tree}'),
    docsTree: execFileSync('git', ['rev-parse', 'HEAD^{tree}'], { cwd: path.dirname(docsRoot), encoding: 'utf8' }).trim(),
    runtime: { node: process.version, platform: process.platform, arch: process.arch },
    check: 'isolated-browser-v1' }
  const name = historyArtifactName(binding)
  assert.ok(process.env.GITHUB_OUTPUT, 'GitHub output path is required')
  await fs.appendFile(process.env.GITHUB_OUTPUT, `artifact_name=${name}\n`)
  const listing = JSON.parse(gh('api', `repos/${repository}/actions/artifacts?name=${name}&per_page=100`))
  assert.ok(Array.isArray(listing.artifacts) && Number.isSafeInteger(listing.total_count), 'browser history response is malformed')
  assert.ok(listing.total_count <= 100 && listing.artifacts.length === listing.total_count, 'browser history exceeds its observation bound')
  const common = git('rev-parse', '--path-format=absolute', '--git-common-dir')
  const destination = path.join(common, 'agentic-os/flight-checks')
  assert.equal(await fs.stat(destination).then(() => true, error => { if(error.code === 'ENOENT') return false; throw error }), false,
    'restore requires a fresh CI ledger; existing history cannot be overwritten')
  const rollbackBudget = { bytes: 0 }
  for (const artifact of listing.artifacts) {
    assert.equal(artifact.name, name)
    assert.equal(artifact.expired, false, 'expired browser history requires reconciliation')
    assert.ok(artifact.size_in_bytes > 0 && artifact.size_in_bytes <= 4 * 1024 * 1024, 'browser history artifact exceeds its bound')
    const run = JSON.parse(gh('api', `repos/${repository}/actions/runs/${artifact.workflow_run.id}`))
    let jobs
    if (priorRunRequiresJobHistory(run)) {
      assert.ok(Number.isSafeInteger(run.run_attempt) && run.run_attempt > 0, 'prior attempt identity is missing')
      const payload = JSON.parse(gh('api', `repos/${repository}/actions/runs/${run.id}/attempts/${run.run_attempt}/jobs?per_page=100`))
      assert.ok(Array.isArray(payload.jobs) && payload.jobs.length === payload.total_count && payload.total_count <= 100,
        'prior job observation is incomplete')
      jobs = payload.jobs
    }
    let rollbackCarrier = null
    if (run.conclusion === 'failure' && jobs) {
      const deploy = jobs.find(job => job.name === 'Human-Authorized Deploy, Verify, And Publish Mirror')
      const attempt = deploy?.steps?.filter(step => step.name === 'Require an exact successful deployment attempt') ?? []
      if (attempt.length === 1 && attempt[0].status === 'completed' && attempt[0].conclusion === 'success') {
        rollbackCarrier = await restoreRollbackCarrier(run, jobs, docsRoot, rollbackBudget)
      }
    }
    assertPriorBrowserRun(run, process.env.GITHUB_RUN_ID, jobs, rollbackCarrier)
    const commit = JSON.parse(gh('api', `repos/${repository}/git/commits/${run.head_sha}`))
    assert.equal(commit.tree.sha, binding.sourceTree, 'browser history source tree differs')
  }
  const newest = listing.artifacts.sort((a, b) => b.id - a.id)[0]
  if (newest) gh('run', 'download', String(newest.workflow_run.id), '--repo', repository, '--name', `${name}-ledger`, '--dir', destination)
  await fs.appendFile(process.env.GITHUB_OUTPUT, 'may_execute=true\n')
  console.log(JSON.stringify({ schema: 'agentic-graph/browser-history-observation/v1', artifact: name, restored: Boolean(newest),
    sourceTree: binding.sourceTree, authorizesEffects: false, automaticRetry: false }))
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) restore().catch(error => { console.error(error.message); process.exitCode = 1 })
