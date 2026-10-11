import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import yaml from 'js-yaml'
import { verifyRemovedTerminalPersistence } from '../lib/production-terminal-persistence.mjs'

const workflow = readFileSync(new URL('../../.github/workflows/release.yml', import.meta.url), 'utf8')
const definition = yaml.load(workflow)
const sha = 'a'.repeat(40)
const at = second => `2026-09-29T00:00:${String(second).padStart(2, '0')}.000Z`
const names = ['Record publication receipt', 'Seal and validate terminal lifecycle carrier',
  'Capture successful release rollback target', 'Validate successful release rollback outputs',
  'Persist completed lifecycle receipts']
const fixture = () => ({
  workflow, artifacts: { total_count: 0, artifacts: [] },
  run: { id: 42, run_attempt: 1, head_sha: sha, head_branch: 'main', event: 'workflow_dispatch',
    path: '.github/workflows/release.yml', status: 'completed', conclusion: 'success',
    run_started_at: at(0), updated_at: at(20) },
  jobs: { total_count: 1, jobs: [{ id: 123, run_id: 42, run_attempt: 1, head_sha: sha,
    head_branch: 'main', name: definition.jobs.deploy.name, status: 'completed', conclusion: 'success',
    started_at: at(1), completed_at: at(15), steps: names.map((name, i) => ({ name,
      number: i + 1, status: 'completed', conclusion: 'success', started_at: at(i * 2 + 2),
      completed_at: at(i * 2 + 3) })) }] },
})

test('removed-artifact recovery retains exact execution proof without inventing a carrier or artifact ID', () => {
  const proof = verifyRemovedTerminalPersistence(fixture())
  assert.equal(proof.jobId, 123)
  assert.equal(proof.sourceRevision, sha)
  assert.equal(proof.steps.length, 5)
  assert.equal(proof.artifactState, 'removed')
  assert.equal(proof.productionAuthorized, false)
  assert.equal(proof.historicalLifecycleReconstructed, false)
  assert.equal(Object.hasOwn(proof, 'expiredTerminalArtifactId'), false)
  assert.match(proof.workflowDigest, /^[a-f0-9]{64}$/)
})

for (const [name, mutate] of [
  ['failed run', v => { v.run.conclusion = 'failure' }],
  ['wrong workflow', v => { v.run.path = '.github/workflows/other.yml' }],
  ['wrong trigger', v => { v.run.event = 'push' }],
  ['wrong branch', v => { v.run.head_branch = 'feature' }],
  ['nonempty artifact inventory', v => { v.artifacts = { total_count: 1, artifacts: [{ id: 1 }] } }],
  ['truncated artifacts', v => { v.artifacts.total_count = 1 }],
  ['truncated jobs', v => { v.jobs.total_count = 2 }],
  ['duplicate deploy job', v => { v.jobs.jobs.push(structuredClone(v.jobs.jobs[0])); v.jobs.total_count++ }],
  ['wrong run job', v => { v.jobs.jobs[0].run_id++ }],
  ['wrong attempt job', v => { v.jobs.jobs[0].run_attempt++ }],
  ['wrong source job', v => { v.jobs.jobs[0].head_sha = 'b'.repeat(40) }],
  ['failed deploy job', v => { v.jobs.jobs[0].conclusion = 'failure' }],
  ['skipped upload', v => { v.jobs.jobs[0].steps[4].conclusion = 'skipped' }],
  ['failed validation', v => { v.jobs.jobs[0].steps[1].conclusion = 'failure' }],
  ['missing seal', v => { v.jobs.jobs[0].steps.splice(1, 1) }],
  ['duplicate seal', v => { v.jobs.jobs[0].steps.push(structuredClone(v.jobs.jobs[0].steps[1])) }],
  ['step order', v => { v.jobs.jobs[0].steps[4].number = 1 }],
  ['overlapping steps', v => { v.jobs.jobs[0].steps[4].started_at = at(2) }],
  ['missing timestamp', v => { delete v.jobs.jobs[0].steps[4].completed_at }],
  ['future job', v => { v.jobs.jobs[0].completed_at = at(21) }],
]) test(`rejects ${name}`, () => {
  const value = fixture(); mutate(value)
  assert.throws(() => verifyRemovedTerminalPersistence(value))
})

test('accepts a historical workflow when its required release semantics remain valid', () => {
  const value = fixture()
  value.workflow = `# Historical source snapshot\n${value.workflow}`
  assert.doesNotThrow(() => verifyRemovedTerminalPersistence(value))
})

for (const [name, mutate] of [
  ['unprotected environment', d => { d.jobs.deploy.environment.name = 'preview' }],
  ['optional terminal step', d => { d.jobs.deploy.steps.find(s => s.id === 'persist_complete')['continue-on-error'] = true }],
  ['conditional upload', d => { d.jobs.deploy.steps.find(s => s.id === 'persist_complete').if = 'false' }],
  ['unpinned uploader', d => { d.jobs.deploy.steps.find(s => s.id === 'persist_complete').uses = 'actions/upload-artifact@main' }],
  ['optional missing files', d => { d.jobs.deploy.steps.find(s => s.id === 'persist_complete').with['if-no-files-found'] = 'warn' }],
  ['wrong artifact name', d => { d.jobs.deploy.steps.find(s => s.id === 'persist_complete').with.name = 'different' }],
  ['wrong artifact path', d => { d.jobs.deploy.steps.find(s => s.id === 'persist_complete').with.path = '/tmp/other' }],
  ['missing validation command', d => { d.jobs.deploy.steps.find(s => s.id === 'lifecycle_terminal').run = 'echo okay' }],
]) test(`rejects ${name} even in matching source`, () => {
  const value = fixture(); const d = yaml.load(value.workflow); mutate(d)
  value.workflow = yaml.dump(d)
  assert.throws(() => verifyRemovedTerminalPersistence(value))
})

// Exercise the new proof through the existing baseline owner, including its live joins.
const baseline = async () => {
  const value = fixture()
  value.run.repository = { id: 99 }
  const round = start => ({
    pages: { schema: 'agentic-graph-production-pages-current-observation/v1',
      adapterId: 'cloudflare-pages/api-canonical-observation-v1', capturedAt: at(start),
      identity: { deploymentId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        deploymentOrigin: 'https://aaaaaaaa.example.pages.dev', deploymentCommitRevision: sha,
        sourceRevision: sha, deployedAt: at(2) } },
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
  return { run: value.run, artifacts: value.artifacts, repositoryId: 99, assembledAt: at(50),
    first: round(30), second: round(40), terminalPersistence: value,
    terminalPersistenceReobservation: { artifacts: structuredClone(value.artifacts),
      jobs: structuredClone(value.jobs), capturedAt: at(45) } }
}

test('baseline joins removed-artifact proof to fresh live identity without a historical artifact ID', async () => {
  const { createObservedRollbackBaseline } = await import('../lib/production-rollback-baseline.mjs')
  const value = await baseline()
  const { provenance, recapture } = createObservedRollbackBaseline(value)
  assert.equal(provenance.schema, 'agentic-graph-observed-rollback-baseline/v2')
  assert.equal(provenance.reason, 'terminal-artifact-removed')
  assert.equal(provenance.terminalPersistence.jobId, 123)
  assert.equal(Object.hasOwn(provenance, 'expiredTerminalArtifactId'), false)
  assert.equal(recapture.rollbackIdentity.pages.sourceRevision, sha)
  for (const mutate of [
    v => { v.second.state.readbackDigest = 'e'.repeat(64) },
    v => { v.first.pages.identity.sourceRevision = 'e'.repeat(40) },
    v => { v.second.mirror.observedAt = at(31) },
    v => { v.terminalPersistence.jobs.jobs[0].steps[4].conclusion = 'skipped' },
  ]) {
    const invalid = structuredClone(value); mutate(invalid)
    assert.throws(() => createObservedRollbackBaseline(invalid))
  }
})

test('baseline requires and binds retained post-round inventories and their observation time', async () => {
  const { createObservedRollbackBaseline } = await import('../lib/production-rollback-baseline.mjs')
  const { digest } = await import('../lib/production-release-lifecycle-evidence.mjs')
  const value = await baseline()
  const { provenance } = createObservedRollbackBaseline(value)
  assert.equal(provenance.terminalPersistenceReobservationDigest, digest(value.terminalPersistenceReobservation))
  const { assembledAt: _, ...observations } = value
  assert.equal(provenance.observationDigest, digest(observations))
  const later = structuredClone(value)
  later.terminalPersistenceReobservation.capturedAt = at(46)
  assert.notEqual(createObservedRollbackBaseline(later).provenance.observationDigest, provenance.observationDigest)
  for (const mutate of [
    v => { delete v.terminalPersistenceReobservation },
    v => { v.terminalPersistenceReobservation.artifacts.total_count = 1 },
    v => { v.terminalPersistenceReobservation.jobs.jobs[0].id++ },
    v => { v.terminalPersistenceReobservation.capturedAt = at(41) },
    v => { v.terminalPersistenceReobservation.capturedAt = at(51) },
  ]) {
    const invalid = structuredClone(value); mutate(invalid)
    assert.throws(() => createObservedRollbackBaseline(invalid))
  }
})
