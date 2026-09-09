import assert from 'node:assert/strict'
import test from 'node:test'
import { createObservedRollbackBaseline } from '../lib/production-rollback-baseline.mjs'
import { digest } from '../lib/production-release-lifecycle-evidence.mjs'

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
