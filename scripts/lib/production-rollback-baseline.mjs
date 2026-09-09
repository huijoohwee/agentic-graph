import assert from 'node:assert/strict'
import { normalizeCloudflarePagesDeploymentId } from '../verify-production-release-transports.mjs'
import {
  canonicalJson, digest, normalizeRollbackRecapture,
  ROLLBACK_IDENTITY_SCHEMA, ROLLBACK_RECAPTURE_SCHEMA,
  SUCCESSFUL_RELEASE_RECAPTURE_FRESHNESS_MS,
} from './production-release-lifecycle-evidence.mjs'

const instant = value => {
  assert.equal(typeof value, 'string', 'observation time is required')
  const time = Date.parse(value)
  assert.ok(Number.isFinite(time), 'observation time must be valid')
  return time
}
const substantive = round => {
  const { capturedAt: _p, ...pages } = round.pages
  const { capturedAt: _d, ...state } = round.state
  const { observedAt: _m, ...mirror } = round.mirror
  return { pages, state, mirror, deployment: round.deployment }
}

// This is a newly observed rollback target, never a reconstruction of lost
// authorization, reconciliation, or production-complete lifecycle receipts.
export function createObservedRollbackBaseline({ first, second, run, artifacts, repositoryId, assembledAt }) {
  assert.equal(run.repository?.id, repositoryId, 'release repository identity differs')
  assert.ok(Number.isSafeInteger(repositoryId) && repositoryId > 0, 'repository ID is required')
  assert.equal(run.path, '.github/workflows/release.yml', 'run is not the protected release workflow')
  assert.equal(run.event, 'workflow_dispatch', 'release was not manually dispatched')
  assert.equal(run.head_branch, 'main', 'release was not from main')
  assert.equal(run.status, 'completed', 'release is not complete')
  assert.equal(run.conclusion, 'success', 'release did not succeed')
  assert.ok(Number.isSafeInteger(run.id) && run.id > 0, 'release run ID is required')
  assert.ok(Number.isSafeInteger(run.run_attempt) && run.run_attempt > 0, 'release attempt is required')
  assert.equal(artifacts.total_count, artifacts.artifacts?.length, 'artifact inventory is truncated')
  const terminal = artifacts.artifacts.filter(item =>
    item.name === `production-lifecycle-complete-${run.head_sha}-${run.id}`)
  assert.equal(terminal.length, 1, 'exact terminal artifact metadata is required')
  assert.equal(terminal[0].expired, true, 'use the existing terminal artifact while available')
  assert.ok(Number.isSafeInteger(terminal[0].id) && terminal[0].id > 0, 'terminal artifact ID is required')
  assert.equal(canonicalJson(substantive(first)), canonicalJson(substantive(second)), 'provider state changed between observations')

  const chronology = []
  for (const round of [first, second]) {
    const { pages, state, mirror, deployment } = round
    assert.equal(pages.schema, 'agentic-graph-production-pages-current-observation/v1')
    assert.equal(pages.adapterId, 'cloudflare-pages/api-canonical-observation-v1')
    assert.equal(state.schema, 'agentic-graph-d1-state-snapshot/v1')
    assert.equal(state.workspaceId, 'kgws:canonical-docs')
    assert.equal(state.readbackAdapterId, 'cloudflare-wrangler-d1-direct-readback/v1')
    assert.equal(state.readbackKind, 'direct-authoritative')
    assert.equal(mirror.schema, 'agentic-graph-production-observed-mirror-identity/v1')
    assert.equal(mirror.repository, 'huijoohwee/huijoohwee')
    assert.equal(pages.identity.sourceRevision, run.head_sha, 'Pages runtime source differs from release')
    assert.equal(pages.identity.deploymentCommitRevision, run.head_sha, 'Pages commit differs from release')
    assert.equal(mirror.sourceRevision, run.head_sha, 'mirror source differs from release')
    normalizeCloudflarePagesDeploymentId(pages.identity.deploymentId)
    assert.equal(deployment.id, pages.identity.deploymentId, 'deployment API identity differs')
    assert.equal(deployment.url, pages.identity.deploymentOrigin, 'deployment API origin differs')
    assert.equal(deployment.environment, 'production')
    assert.equal(deployment.latest_stage?.name, 'deploy')
    assert.equal(deployment.latest_stage?.status, 'success')
    assert.equal(instant(deployment.latest_stage.ended_on), instant(pages.identity.deployedAt))
    const metadata = deployment.deployment_trigger?.metadata
    assert.equal(metadata?.commit_hash, run.head_sha)
    assert.equal(metadata?.branch, 'main')
    // The capture command resolves this provider-recorded repository through
    // GitHub and checks its numeric identity, including historical renames.
    const attribution = /^github-actions:([^:]+):(\d+):(\d+):pages$/.exec(metadata?.commit_message || '')
    assert.ok(attribution, 'deployment lacks protected run attribution')
    assert.equal(Number(attribution[2]), run.id, 'deployment belongs to another run')
    assert.equal(Number(attribution[3]), run.run_attempt, 'deployment belongs to another attempt')
    assert.ok(instant(run.run_started_at) <= instant(pages.identity.deployedAt), 'deployment predates release')
    assert.ok(instant(pages.identity.deployedAt) <= instant(run.updated_at), 'deployment follows release completion')
    assert.ok(instant(run.updated_at) < instant(pages.capturedAt), 'capture predates completed release')
    chronology.push(instant(pages.capturedAt), instant(state.capturedAt), instant(mirror.observedAt))
  }
  for (let i = 1; i < chronology.length; i++) {
    assert.ok(chronology[i] > chronology[i - 1], 'provider reads must be strictly ordered')
  }
  const assembled = instant(assembledAt)
  assert.ok(assembled >= chronology.at(-1), 'capture is in the future')
  assert.ok(assembled - chronology[0] <= SUCCESSFUL_RELEASE_RECAPTURE_FRESHNESS_MS, 'provider observations expired')
  const { deployedAt: _deployedAt, ...pages } = second.pages.identity
  const recapture = normalizeRollbackRecapture({
    schema: ROLLBACK_RECAPTURE_SCHEMA,
    rollbackIdentity: {
      schema: ROLLBACK_IDENTITY_SCHEMA,
      pages,
      mirror: { repository: second.mirror.repository, revision: second.mirror.revision },
      d1: { stateContractDigest: second.state.stateContractDigest,
        readbackDigest: second.state.readbackDigest, counts: second.state.observedCounts },
    },
    capturedAt: assembledAt,
  })
  const provenance = {
    schema: 'agentic-graph-observed-rollback-baseline/v1',
    status: 'rollback-baseline-observed',
    reason: 'terminal-artifact-expired',
    historicalLifecycleReconstructed: false,
    productionAuthorized: false,
    releaseRunId: run.id,
    releaseAttempt: run.run_attempt,
    expiredTerminalArtifactId: terminal[0].id,
    repositoryId,
    capturedAt: assembledAt,
    observationDigest: digest({ first, second, run, artifacts, repositoryId }),
    rollbackRecaptureDigest: digest(recapture),
  }
  return { recapture, provenance }
}
