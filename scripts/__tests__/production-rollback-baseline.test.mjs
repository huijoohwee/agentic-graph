import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import YAML from 'yaml'
import { createObservedCurrentRollbackBaseline, createObservedRollbackBaseline,
  createPagesDeploymentCommitProvenance } from '../lib/production-rollback-baseline.mjs'
import { digest } from '../lib/production-release-lifecycle-evidence.mjs'
import { currentBaselineCaptureSummary } from '../production-rollback-baseline.mjs'

const sha = 'a'.repeat(40)
const at = second => `2026-09-09T00:00:${String(second).padStart(2, '0')}.000Z`
const round = start => ({
  pages: {
    schema: 'agentic-graph-production-pages-current-observation/v1',
    adapterId: 'cloudflare-pages/api-canonical-observation-v1',
    identity: { deploymentId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      deploymentOrigin: 'https://aaaaaaaa.example.pages.dev', deploymentCommitRevision: sha,
      sourceRevision: sha, deployedAt: at(2) }, capturedAt: at(start),
  },
  state: { schema: 'agentic-graph-d1-state-snapshot/v1', workspaceId: 'kgws:canonical-docs',
    readbackAdapterId: 'cloudflare-wrangler-d1-direct-readback/v1', readbackKind: 'direct-authoritative',
    stateContractDigest: 'b'.repeat(64), readbackDigest: 'c'.repeat(64),
    observedCounts: { documentCount: 149, chunkCount: 18, graphCount: 0 }, capturedAt: at(start + 1) },
  mirror: { schema: 'agentic-graph-production-observed-mirror-identity/v1',
    repository: 'huijoohwee/huijoohwee', revision: 'd'.repeat(40), sourceRevision: sha, observedAt: at(start + 2) },
  deployment: { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', url: 'https://aaaaaaaa.example.pages.dev',
    environment: 'production', latest_stage: { name: 'deploy', status: 'success', ended_on: at(2) },
    deployment_trigger: { metadata: { branch: 'main', commit_hash: sha,
      commit_message: 'github-actions:huijoohwee/agentic-graph:42:1:pages' } } },
})
const fixture = () => ({ first: round(10), second: round(20), repositoryId: 99, assembledAt: at(30),
  run: { repository: { id: 99 }, path: '.github/workflows/release.yml', event: 'workflow_dispatch',
    head_branch: 'main', status: 'completed', conclusion: 'success', id: 42, run_attempt: 1,
    head_sha: sha, run_started_at: at(1), updated_at: at(3) },
  artifacts: { total_count: 1, artifacts: [{ id: 123, name: `production-lifecycle-complete-${sha}-42`, expired: true }] },
})

const currentReadiness = () => ({
  schema: 'agentic-os-production-runtime-readiness/v2', status: 'verified-build',
  source: { repository: 'huijoohwee/agentic-graph', revision: sha },
  agenticCanvasOs: { repository: 'huijoohwee/agentic-os', revision: 'e'.repeat(40) },
  catalogRevision: 'e'.repeat(40),
  artifact: { algorithm: 'sha256', digest: 'f'.repeat(64) },
  immutableManifest: { algorithm: 'sha256', digest: '1'.repeat(64) },
  mirror: { repository: 'huijoohwee/huijoohwee' },
})

const currentRound = start => {
  const value = round(start)
  const readiness = currentReadiness()
  value.pagesReadiness = structuredClone(readiness)
  value.mirrorReadiness = structuredClone(readiness)
  return value
}

const currentCommitProvenance = second => createPagesDeploymentCommitProvenance({
  pagesIdentity: second.pages.identity, sourceRevision: second.pages.identity.sourceRevision,
  mirror: second.mirror,
})

test('fresh stable provider observations recover only a rollback target', () => {
  const value = fixture()
  const { recapture, provenance } = createObservedRollbackBaseline(value)
  assert.equal(recapture.rollbackIdentity.pages.sourceRevision, sha)
  assert.deepEqual(recapture.rollbackIdentity.d1.counts, value.second.state.observedCounts)
  assert.equal(provenance.rollbackRecaptureDigest, digest(recapture))
  assert.equal(provenance.productionAuthorized, false)
  assert.equal(provenance.historicalLifecycleReconstructed, false)
  assert.equal(provenance.expiredTerminalArtifactId, 123)
})

test('fresh current provider observations name a rollback target without rebuilding history', () => {
  const first = currentRound(10), second = currentRound(20)
  const { recapture, provenance } = createObservedCurrentRollbackBaseline({
    first, second, repositoryId: 99, candidateSourceRevision: '9'.repeat(40),
    captureRunId: '7001',
    captureWorkflowRef: 'huijoohwee/agentic-graph/.github/workflows/production-rollback-baseline-capture.yml@refs/heads/main',
    deploymentCommitProvenance: currentCommitProvenance(second),
    assembledAt: at(30),
  })
  assert.equal(recapture.rollbackIdentity.pages.sourceRevision, sha)
  assert.equal(recapture.rollbackIdentity.mirror.revision, second.mirror.revision)
  assert.deepEqual(recapture.rollbackIdentity.d1.counts, second.state.observedCounts)
  assert.equal(provenance.schema, 'agentic-graph-observed-current-rollback-baseline/v1')
  assert.equal(provenance.status, 'current-rollback-baseline-observed')
  assert.equal(provenance.rollbackRecaptureDigest, digest(recapture))
  assert.equal(provenance.productionAuthorized, false)
  assert.equal(provenance.historicalLifecycleReconstructed, false)
  assert.equal(provenance.captureRunId, 7001)
  assert.equal(provenance.deploymentCommitProvenance.kind, 'graph-source')
})

test('current baseline links a mirror deployment commit without confusing it with the Graph source', () => {
  const first = currentRound(10), second = currentRound(20)
  const mirrorCommit = 'f'.repeat(40), mirrorMerge = '8'.repeat(40)
  for (const observation of [first, second]) {
    observation.pages.identity.deploymentCommitRevision = mirrorCommit
    observation.deployment.deployment_trigger.metadata.commit_hash = mirrorCommit
  }
  const pullRequest = { number: 100, state: 'closed', merged_at: at(15), merge_commit_sha: mirrorMerge,
    html_url: 'https://github.com/huijoohwee/huijoohwee/pull/100',
    base: { ref: 'main', repo: { full_name: 'huijoohwee/huijoohwee' } },
    head: { repo: { full_name: 'huijoohwee/huijoohwee' } } }
  const deploymentCommitProvenance = createPagesDeploymentCommitProvenance({
    pagesIdentity: second.pages.identity, sourceRevision: sha, mirror: second.mirror,
    associatedPullRequests: [pullRequest], isMirrorMergeAncestor: (merge, mirror) => merge === mirrorMerge && mirror === second.mirror.revision,
  })
  const { recapture, provenance } = createObservedCurrentRollbackBaseline({
    first, second, repositoryId: 99, candidateSourceRevision: '9'.repeat(40), captureRunId: '7001',
    captureWorkflowRef: 'huijoohwee/agentic-graph/.github/workflows/production-rollback-baseline-capture.yml@refs/heads/main',
    deploymentCommitProvenance, assembledAt: at(30),
  })
  assert.equal(recapture.rollbackIdentity.pages.deploymentCommitRevision, mirrorCommit)
  assert.equal(recapture.rollbackIdentity.pages.sourceRevision, sha)
  assert.equal(provenance.deploymentCommitProvenance.kind, 'published-mirror-pull-request')
  assert.equal(provenance.deploymentCommitProvenance.pullRequest.number, 100)
  assert.equal(provenance.historicalLifecycleReconstructed, false)
  assert.equal(provenance.productionAuthorized, false)
  const provenanceInput = { pagesIdentity: second.pages.identity, sourceRevision: sha, mirror: second.mirror }
  for (const [label, associatedPullRequests, isMirrorMergeAncestor] of [
    ['missing', [], () => false],
    ['unmerged', [{ ...pullRequest, state: 'open', merged_at: null }], () => true],
    ['unreachable', [pullRequest], () => false],
    ['ambiguous', [pullRequest, { ...pullRequest, number: 101,
      html_url: 'https://github.com/huijoohwee/huijoohwee/pull/101' }], () => true],
  ]) {
    assert.throws(() => createPagesDeploymentCommitProvenance({ ...provenanceInput,
      associatedPullRequests, isMirrorMergeAncestor }), /one merged PR/, label)
  }
  assert.throws(() => createPagesDeploymentCommitProvenance({ ...provenanceInput,
    associatedPullRequests: Array(100).fill(pullRequest) }), /may be truncated/)
})

test('current baseline capture summary binds its rollback identity digest', () => {
  const rollbackIdentity = { pages: { sourceRevision: sha }, mirror: { revision: 'd'.repeat(40) } }
  const summary = currentBaselineCaptureSummary({ status: 'current-rollback-baseline-observed',
    deploymentCommitProvenance: { kind: 'graph-source' } }, { rollbackIdentity })
  assert.deepEqual(summary, { status: 'current-rollback-baseline-observed', productionAuthorized: false,
    pagesDeploymentCommitKind: 'graph-source',
    rollbackTargetDigest: digest(rollbackIdentity) })
})

for (const [label, mutate] of [
  ['changed Pages deployment', v => { v.second.pages.identity.deploymentId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' }],
  ['changed D1 readback', v => { v.second.state.readbackDigest = 'e'.repeat(64) }],
  ['changed mirror revision', v => { v.second.mirror.revision = 'e'.repeat(40) }],
  ['Pages marker mismatch', v => { v.second.pagesReadiness.source.revision = 'e'.repeat(40) }],
  ['mirror marker mismatch', v => { v.second.mirrorReadiness.artifact.digest = '2'.repeat(64) }],
  ['Pages commit mismatch', v => { v.second.pages.identity.deploymentCommitRevision = 'e'.repeat(40) }],
  ['mirror source mismatch', v => { v.second.mirror.sourceRevision = 'e'.repeat(40) }],
  ['nonzero graph snapshot count', v => { v.second.state.observedCounts.graphCount = 1 }],
  ['stale observations', v => { v.assembledAt = '2026-09-09T00:11:00.000Z' }],
  ['wrong capture workflow', v => { v.captureWorkflowRef = 'feature/production-rollback-baseline-capture.yml' }],
]) test(`current baseline rejects ${label}`, () => {
  const value = { first: currentRound(10), second: currentRound(20), repositoryId: 99,
    candidateSourceRevision: '9'.repeat(40), captureRunId: '7001',
    captureWorkflowRef: 'huijoohwee/agentic-graph/.github/workflows/production-rollback-baseline-capture.yml@refs/heads/main',
    deploymentCommitProvenance: null,
    assembledAt: at(30) }
  value.deploymentCommitProvenance = currentCommitProvenance(value.first, value.second)
  mutate(value)
  assert.throws(() => createObservedCurrentRollbackBaseline(value))
})

test('current baseline workflow is protected and contains no deployment command', () => {
  const workflow = readFileSync(new URL('../../.github/workflows/production-rollback-baseline-capture.yml', import.meta.url), 'utf8')
  const implementation = readFileSync(new URL('../production-rollback-baseline.mjs', import.meta.url), 'utf8')
  const parsed = YAML.parse(workflow)
  const install = parsed.jobs.capture.steps.find(step => step.name === 'Install dependencies')
  assert.equal(install.run, 'source ./scripts/install-agentic-graph-dependencies.sh')
  assert.match(install.env.AGENTIC_BASE_READ_KEY, /secrets\.AGENTIC_BASE_READ_KEY/)
  assert.match(workflow, /baseline_mode:[\s\S]*current-observed[\s\S]*successful-release-run/)
  assert.match(workflow, /environment:\n\s+name: production/)
  assert.match(workflow, /path: agentic-graph\n\s+fetch-depth: 0\n\s+fetch-tags: false/)
  assert.match(workflow, /--current-state/)
  assert.match(workflow, /productionAuthorized/)
  assert.match(implementation, /productionAuthorized:\s*false/)
  assert.doesNotMatch(workflow, /wrangler pages deploy|pages:deploy-cloudflare|workers:deploy|storage:deploy/)
})

for (const [label, mutate] of [
  ['failed release', v => { v.run.conclusion = 'failure' }],
  ['incomplete release', v => { v.run.status = 'in_progress' }],
  ['wrong repository', v => { v.repositoryId++ }],
  ['wrong workflow', v => { v.run.path = '.github/workflows/test.yml' }],
  ['unprotected branch', v => { v.run.head_branch = 'feature' }],
  ['unprotected trigger', v => { v.run.event = 'push' }],
  ['live terminal artifact', v => { v.artifacts.artifacts[0].expired = false }],
  ['missing terminal artifact', v => { v.artifacts = { total_count: 0, artifacts: [] } }],
  ['truncated artifacts', v => { v.artifacts.total_count++ }],
  ['wrong terminal source', v => { v.artifacts.artifacts[0].name = 'production-lifecycle-complete-wrong' }],
  ['drifting D1', v => { v.second.state.readbackDigest = 'e'.repeat(64) }],
  ['drifting mirror', v => { v.second.mirror.revision = 'e'.repeat(40) }],
  ['drifting Pages', v => { v.second.pages.identity.sourceRevision = 'e'.repeat(40) }],
  ['simultaneous rounds', v => { v.second = structuredClone(v.first) }],
  ['out of order reads', v => { v.first.state.capturedAt = at(9) }],
  ['future observation', v => { v.assembledAt = at(21) }],
  ['stale observation', v => { v.assembledAt = '2026-09-09T00:11:00.000Z' }],
]) test(`rejects ${label}`, () => {
  const value = fixture(); mutate(value)
  assert.throws(() => createObservedRollbackBaseline(value))
})

for (const [label, mutate] of [
  ['wrong source in both reads', r => { r.mirror.sourceRevision = 'e'.repeat(40) }],
  ['wrong deployment attribution', r => { r.deployment.deployment_trigger.metadata.commit_message = 'github-actions:huijoohwee/agentic-graph:43:1:pages' }],
  ['wrong attempt', r => { r.deployment.deployment_trigger.metadata.commit_message = 'github-actions:huijoohwee/agentic-graph:42:2:pages' }],
  ['unauthenticated D1 adapter', r => { r.state.readbackKind = 'local' }],
  ['different D1 workspace', r => { r.state.workspaceId = 'other' }],
  ['malformed digest', r => { r.state.readbackDigest = 'bad' }],
  ['invalid counts', r => { r.state.observedCounts.documentCount = -1 }],
  ['malformed deployment', r => { r.pages.identity.deploymentId = 'bad'; r.deployment.id = 'bad' }],
  ['failed deployment', r => { r.deployment.latest_stage.status = 'failure' }],
]) test(`rejects ${label} even when stable`, () => {
  const value = fixture(); mutate(value.first); mutate(value.second)
  assert.throws(() => createObservedRollbackBaseline(value))
})
