import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
import { activeDeployment, activationArguments, execute } from './travel-mesh-release.mjs'
import { digest, seal } from './travel-mesh-release-plan.mjs'
import { CORE_RUNTIME_PROFILE, readRuntimeProfile } from './runtime-release-profile.mjs'
import { createLifecycleLive } from './production-release-lifecycle.mjs'
import { verifyLocalReviewIdentity } from './production-release-authorization.mjs'
import * as contract from './production-release-lifecycle-contract.mjs'
import { assertRecoveryAuthority, assertRecoveryProviderState, createRecoveryPlan,
  validateRecoveryPlan, validateRecoveryRun } from './production-release-recovery-proof.mjs'

const repository = 'huijoohwee/agentic-graph'
const mirrorRepository = 'huijoohwee/huijoohwee'
const sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = file => JSON.parse(fs.readFileSync(file, 'utf8'))
const bytes = file => fs.readFileSync(file)
const write = (file, value) => fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx' })
const command = (executable, args, options = {}) => execFileSync(executable, args, {
  cwd: sourceRoot, encoding: 'utf8', timeout: 180_000, maxBuffer: 16 * 1024 * 1024, ...options,
})
const gh = (...args) => JSON.parse(command('gh', args))
const git = (...args) => command('git', args).trim()
const hash = value => createHash('sha256').update(value).digest('hex')
const native = args => process.stdout.write(command('node', args))

function context() {
  assert.equal(process.env.GITHUB_ACTIONS, 'true')
  assert.equal(process.env.GITHUB_REPOSITORY, repository)
  assert.equal(process.env.GITHUB_REF, 'refs/heads/main')
  assert.equal(process.env.GITHUB_WORKFLOW, 'Production Release')
  assert.equal(process.env.GITHUB_WORKFLOW_REF, `${repository}/.github/workflows/release.yml@refs/heads/main`)
  assert.equal(process.env.GITHUB_SHA, git('rev-parse', 'HEAD'))
  assert.equal(git('ls-remote', 'origin', 'refs/heads/main').split(/\s+/)[0], process.env.GITHUB_SHA)
  assert.equal(readRuntimeProfile().id, 'core')
  const root = path.resolve(process.env.RECOVERY_ROOT || '')
  const temporary = path.resolve(process.env.RUNNER_TEMP || '')
  assert(process.env.RUNNER_TEMP && process.env.RECOVERY_ROOT && root.startsWith(`${temporary}${path.sep}`))
  return root
}

function verifyOriginalEvidence(raw) {
  const lifecycle = path.join(raw, 'production-lifecycle')
  const live = read(path.join(lifecycle, 'live-verification-receipt-v2.json'))
  const recreated = createLifecycleLive({ contract,
    deployment: read(path.join(lifecycle, 'deployment-receipt.json')),
    state: read(path.join(lifecycle, 'state-reconciliation-receipt.json')),
    sourceRevision: read(path.join(raw, 'candidate-pages-deployment.json')).sourceRevision,
    immutableOriginSmoke: bytes(path.join(raw, 'immutable-origin-smoke.log')),
    publicRouteProbes: bytes(path.join(raw, 'production-transport-evidence.json')),
    browserFidelity: bytes(path.join(raw, 'production-fidelity-evidence.json')),
    clientCacheConvergence: bytes(path.join(raw, 'production-sw-convergence-evidence.json')),
    markerParity: bytes(path.join(raw, 'production-transport-evidence.json')),
    verifiedAt: live.verifiedAt,
  })
  assert.deepEqual(recreated, live, 'original live evidence no longer matches its receipt')
  return live
}

async function publicMarkers(raw) {
  const original = read(path.join(raw, 'candidate-pages-runtime-readiness.json'))
  const origins = [read(path.join(raw, 'candidate-pages-deployment.json')).deploymentOrigin,
    'https://joohwee.pages.dev', 'https://airvio.co']
  for (const origin of origins) {
    const response = await fetch(`${origin}/.well-known/runtime-readiness.json`, {
      signal: AbortSignal.timeout(15_000), cache: 'no-store', redirect: 'error',
    })
    assert.equal(response.status, 200)
    assert.deepEqual(await response.json(), original, 'public release marker changed')
  }
  return original
}

async function prepare(root) {
  const originalRunId = process.env.RECOVERY_ORIGINAL_RUN_ID
  assert.match(originalRunId || '', /^[1-9][0-9]{0,19}$/)
  assert.notEqual(originalRunId, process.env.GITHUB_RUN_ID)
  const run = gh('api', `repos/${repository}/actions/runs/${originalRunId}`)
  const jobs = gh('api', `repos/${repository}/actions/runs/${originalRunId}/jobs?per_page=100`).jobs
  validateRecoveryRun(run, jobs, repository, originalRunId)
  // Recovery may extend the controller, but cannot silently change the runtime
  // being restored. Existing product and configuration source must still match.
  const changed = git('diff', '--name-only', run.head_sha, 'HEAD', '--',
    'cloudflare', 'canvas', 'contracts', 'grph-shared', 'config', 'package-lock.json')
  assert.equal(changed, '', 'runtime inputs changed after the retained release')
  const artifactName = `production-release-raw-${run.head_sha}-${originalRunId}`
  const artifacts = gh('api', `repos/${repository}/actions/runs/${originalRunId}/artifacts?per_page=100`).artifacts
    .filter(value => value.name === artifactName && !value.expired)
  assert.equal(artifacts.length, 1)
  const artifact = artifacts[0]
  assert.equal(String(artifact.workflow_run.id), originalRunId)
  assert(artifact.size_in_bytes > 0 && artifact.size_in_bytes < 8 * 1024 * 1024)
  fs.mkdirSync(root, { recursive: true })
  const raw = path.join(root, 'raw')
  assert(!fs.existsSync(raw), 'original evidence must be restored into a fresh directory')
  command('gh', ['run', 'download', originalRunId, '--repo', repository, '--name', artifactName, '--dir', raw])
  const live = verifyOriginalEvidence(raw)
  const marker = await publicMarkers(raw)
  const localReview = JSON.parse(process.env.RECOVERY_LOCAL_REVIEW)
  const releaseEvidence = JSON.parse(process.env.RECOVERY_RELEASE_EVIDENCE)
  const docsCommit = gh('api', `repos/huijoohwee/agentic-canvas-os/git/commits/${marker.agenticCanvasOs.revision}`)
  verifyLocalReviewIdentity({ localReview, sourceRevision: run.head_sha,
    sourceTree: git('rev-parse', `${run.head_sha}^{tree}`),
    agenticCanvasOsRevision: marker.agenticCanvasOs.revision,
    agenticCanvasOsTree: docsCommit.tree.sha })
  assert.equal(releaseEvidence.schema, 'agentic-graph-production-release-evidence/v1')
  assert.equal(releaseEvidence.repository, repository)
  assert.equal(releaseEvidence.sourceRevision, run.head_sha)
  assert.equal(digest(releaseEvidence.rollbackIdentity), releaseEvidence.rollbackTargetDigest)
  assert.equal(releaseEvidence.rollbackTargetDigest,
    read(path.join(raw, 'production-lifecycle/candidate-manifest.json')).rollbackTargetDigest)
  const mirrorRevision = git('ls-remote', `https://github.com/${mirrorRepository}.git`, 'refs/heads/main').split(/\s+/)[0]
  const publications = gh('api', `repos/${mirrorRepository}/commits/${mirrorRevision}/pulls`)
    .filter(pr => pr.merged_at && pr.merge_commit_sha === mirrorRevision
      && pr.head.ref === `release/agentic-graph-${run.head_sha.slice(0, 12)}-${originalRunId}`)
  assert.equal(publications.length, 1, 'the verified original mirror must already be published')
  const publication = gh('pr', 'view', String(publications[0].number), '--repo', mirrorRepository,
    '--json', 'state,headRefOid,mergeCommit,mergedAt,statusCheckRollup,url')
  assert.equal(publication.state, 'MERGED')
  assert.equal(publication.mergeCommit.oid, mirrorRevision)
  const checks = publication.statusCheckRollup.filter(check => check.name === 'Runtime Readiness Gate')
  assert.equal(checks.length, 1)
  assert.equal(checks[0].conclusion, 'SUCCESS')
  const plan = createRecoveryPlan({ controllerRevision: process.env.GITHUB_SHA,
    recoveryRunId: process.env.GITHUB_RUN_ID, originalRun: run, originalArtifact: artifact,
    core: read(path.join(raw, 'travel-mesh-release-receipt.json')),
    rollback: read(path.join(raw, 'travel-mesh-rollback-receipt.json')),
    pages: read(path.join(raw, 'candidate-pages-deployment.json')), live, mirrorRevision,
    issuedAt: new Date().toISOString() })
  write(path.join(root, 'plan.json'), plan)
  write(path.join(root, 'publication.json'), publication)
  write(path.join(root, 'original-run.json'), { ...run, jobs })
  fs.appendFileSync(process.env.GITHUB_OUTPUT, `plan_digest=${plan.planDigest}\ndocs_revision=${marker.agenticCanvasOs.revision}\nmirror_revision=${mirrorRevision}\n`)
  fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,
    `Restore existing storage version \`${plan.versionId}\` for retained source \`${plan.originalSourceRevision}\`.\n\nExact approval comment: \`authorize recovery ${plan.planDigest}\`\n`)
}

async function apply(root) {
  const plan = validateRecoveryPlan(read(path.join(root, 'plan.json')))
  assert.equal(plan.planDigest, process.env.RECOVERY_PLAN_DIGEST)
  assert.equal(plan.controllerRevision, process.env.GITHUB_SHA)
  const raw = path.join(root, 'raw')
  const live = verifyOriginalEvidence(raw)
  assert.equal(live.receiptDigest, plan.liveVerificationReceiptDigest)
  const original = read(path.join(root, 'original-run.json'))
  validateRecoveryRun(original, original.jobs, repository, plan.originalRunId)
  const originalCore = read(path.join(raw, 'travel-mesh-release-receipt.json'))
  assert.equal(originalCore.receiptDigest, plan.originalCoreReceiptDigest)
  const profile = CORE_RUNTIME_PROFILE
  const configuration = profile.configure(process.env)
  assert.equal(configuration.configurationDigest, plan.configurationDigest)
  const approvals = gh('api', `repos/${repository}/actions/runs/${process.env.GITHUB_RUN_ID}/approvals`)
  const authority = assertRecoveryAuthority({ plan, environment: process.env, approvals,
    ownerId: configuration.variables.AGENTIC_OS_STORAGE_OWNER_ID })
  profile.validateAuthority({ humanActorId: configuration.variables.AGENTIC_OS_STORAGE_OWNER_ID }, configuration)
  const entry = profile.plan[0]
  const args = command => ['--no-install', 'wrangler', ...command, '--config', entry.config,
    '--env', entry.environment ?? '', '--name', entry.worker]
  const runJson = async command => JSON.parse((await execute(args(command))).stdout)
  const deployment = () => runJson(['deployments', 'status', '--json']).then(value => activeDeployment(value, entry.worker))
  const version = await runJson(['versions', 'view', plan.versionId, '--json'])
  const before = path.join(root, 'before')
  fs.mkdirSync(before)
  native(['scripts/verify-production-release-transports.mjs', 'pages', '--mode', 'current',
    '--evidence-dir', before, '--output', path.join(before, 'pages.json')])
  process.stdout.write(command('npm', ['run', '--silent', 'storage:d1:seed:docs', '--', '--capture-state',
    '--evidence-output', path.join(before, 'state.json')]))
  const state = read(path.join(before, 'state.json'))
  const originalState = read(path.join(raw, 'd1-reconciliation-evidence.json'))
  assert.equal(state.stateContractDigest, originalState.stateContractDigest)
  assert.equal(state.readbackDigest, originalState.readbackDigest)
  await publicMarkers(raw)
  await profile.exposure(fetch, process.env)
  const current = await deployment()
  assertRecoveryProviderState(plan, { deployment: current, version,
    pages: read(path.join(before, 'pages.json')).identity,
    mirrorRevision: git('ls-remote', `https://github.com/${mirrorRepository}.git`, 'refs/heads/main').split(/\s+/)[0] })
  assertRecoveryAuthority({ plan, environment: process.env, approvals,
    ownerId: configuration.variables.AGENTIC_OS_STORAGE_OWNER_ID })
  write(path.join(root, 'activation-attempt.json'), { planDigest: plan.planDigest,
    authority, previous: current, versionId: plan.versionId, attemptedAt: new Date().toISOString(),
    automaticRetry: false, uploads: false, migrations: false, routeChanges: false })
  // This is the only provider mutation. Its arguments come from the existing
  // release owner; no upload, migration, secret, route or Pages operation exists.
  await execute(activationArguments(entry, plan.versionId, `agentic-graph recovery ${plan.planDigest}`))
  const serving = await deployment()
  assert.equal(serving.versionId, plan.versionId)
  const probes = await profile.probe(configuration)
  const exposure = await profile.exposure(fetch, process.env)
  await publicMarkers(raw)
  write(path.join(root, 'core-recovery-receipt.json'), seal({
    schema: 'agentic-graph-core-recovery-receipt/v1', status: 'verified',
    sourceRevision: plan.originalSourceRevision, controllerRevision: plan.controllerRevision,
    recoveryRunId: plan.recoveryRunId, planDigest: plan.planDigest,
    originalCoreReceiptDigest: plan.originalCoreReceiptDigest, authority,
    previous: current, serving, versionDigest: digest(version), probes, exposure,
    recoveredAt: new Date().toISOString(),
  }))
  const complete = path.join(root, 'complete')
  fs.cpSync(path.join(raw, 'production-lifecycle'), complete, { recursive: true, errorOnExist: true })
  const marker = read(path.join(raw, 'candidate-pages-runtime-readiness.json'))
  const common = ['--docs-root', process.env.AGENTIC_OS_AGENTIC_CANVAS_OS_DOCS_ROOT,
    '--docs-sha', marker.agenticCanvasOs.revision]
  const publication = read(path.join(root, 'publication.json'))
  native(['scripts/production-release-lifecycle.mjs', 'publish', ...common, '--receipt-dir', complete,
    '--publication-revision', plan.mirrorRevision, '--publication-target', mirrorRepository,
    '--issued-at', new Date(publication.mergedAt).toISOString(), '--output-dir', complete])
  const carrier = path.join(complete, 'collaborative-release-lifecycle-v2.json')
  native(['scripts/production-release-lifecycle.mjs', 'carrier', ...common, '--receipt-dir', complete, '--output', carrier])
  native(['scripts/production-release-lifecycle.mjs', 'validate', ...common, '--carrier', carrier])
  const flags = []
  for (const prefix of ['first', 'second']) {
    const round = path.join(complete, prefix)
    fs.mkdirSync(round)
    native(['scripts/verify-production-release-transports.mjs', 'pages', '--mode', 'current',
      '--evidence-dir', round, '--output', path.join(round, 'pages.json')])
    process.stdout.write(command('npm', ['run', '--silent', 'storage:d1:seed:docs', '--', '--capture-state',
      '--evidence-output', path.join(round, 'state.json')]))
    native(['scripts/verify-production-release-transports.mjs', 'mirror',
      '--repository-root', path.resolve(sourceRoot, '../huijoohwee'), '--repository', mirrorRepository,
      '--output', path.join(round, 'mirror.json')])
    assert.equal((await deployment()).deploymentId, serving.deploymentId)
    flags.push(`--${prefix}-pages-observation`, path.join(round, 'pages.json'),
      `--${prefix}-state-evidence`, path.join(round, 'state.json'),
      `--${prefix}-mirror-observation`, path.join(round, 'mirror.json'))
  }
  native(['scripts/production-release-lifecycle.mjs', 'recapture-successful-release', ...common,
    '--carrier', carrier, ...flags, '--assembled-at', new Date().toISOString(),
    '--output', path.join(complete, 'current-production-rollback-recapture.json'),
    '--digest-output', path.join(complete, 'current-production-rollback-identity-digest.txt')])
  write(path.join(root, 'completion.json'), {
    schema: 'agentic-graph-production-recovery-completion/v1', status: 'production-complete',
    originalRunId: plan.originalRunId, recoveryRunId: plan.recoveryRunId,
    sourceRevision: plan.originalSourceRevision, mirrorRevision: plan.mirrorRevision,
    coreRecoveryReceiptDigest: read(path.join(root, 'core-recovery-receipt.json')).receiptDigest,
    lifecycleCarrierDigest: hash(bytes(carrier)), completedAt: new Date().toISOString(),
  })
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const mode = process.argv[2]
  Promise.resolve().then(() => {
    const root = context()
    if (mode === 'prepare') return prepare(root)
    if (mode === 'apply') return apply(root)
    throw new Error('mode must be prepare or apply')
  }).catch(error => { console.error(error.message); process.exitCode = 1 })
}
