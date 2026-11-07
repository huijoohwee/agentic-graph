import assert from 'node:assert/strict'
import { verifyRemovedTerminalPersistence } from './production-terminal-persistence.mjs'
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

const currentSubstantive = round => {
  const { capturedAt: _p, ...pages } = round.pages
  const { capturedAt: _d, ...state } = round.state
  const { observedAt: _m, ...mirror } = round.mirror
  return { pages, state, mirror, deployment: round.deployment, pagesReadiness: round.pagesReadiness,
    mirrorReadiness: round.mirrorReadiness }
}

const PAGES_DEPLOYMENT_COMMIT_PROVENANCE_SCHEMA = 'agentic-graph-pages-deployment-commit-provenance/v1'
const MAX_ASSOCIATED_PULL_REQUESTS = 100
const isSha = value => /^[0-9a-f]{40}$/.test(value || '')
const requireExactKeys = (value, keys, label) => {
  assert.ok(value && typeof value === 'object' && !Array.isArray(value), `${label} is required`)
  assert.deepEqual(Object.keys(value).sort(), [...keys].sort(), `${label} fields are invalid`)
}

export const createPagesDeploymentCommitProvenance = ({ pagesIdentity, sourceRevision, mirror, associatedPullRequests = [],
  isMirrorMergeAncestor = () => false }) => {
  assert.match(sourceRevision || '', /^[0-9a-f]{40}$/, 'Pages source revision must be exact')
  assert.equal(pagesIdentity?.sourceRevision, sourceRevision, 'Pages source identity drifted')
  assert.match(pagesIdentity?.deploymentCommitRevision || '', /^[0-9a-f]{40}$/, 'Pages deployment commit must be exact')
  assert.equal(mirror?.repository, 'huijoohwee/huijoohwee', 'Pages commit provenance needs the production mirror')
  assert.match(mirror?.revision || '', /^[0-9a-f]{40}$/, 'production mirror revision must be exact')
  if (pagesIdentity.deploymentCommitRevision === sourceRevision) {
    return {
      schema: PAGES_DEPLOYMENT_COMMIT_PROVENANCE_SCHEMA, kind: 'graph-source',
      repository: 'huijoohwee/agentic-graph', deploymentCommitRevision: sourceRevision, sourceRevision,
    }
  }

  assert.ok(Array.isArray(associatedPullRequests), 'associated mirror pull requests must be an array')
  assert.ok(associatedPullRequests.length < MAX_ASSOCIATED_PULL_REQUESTS,
    'Pages deployment commit pull request associations may be truncated')
  const integrated = associatedPullRequests.filter(pr => pr?.base?.repo?.full_name?.toLowerCase() === mirror.repository
    && pr.base.ref === 'main' && pr.head?.repo?.full_name?.toLowerCase() === mirror.repository
    && pr.state === 'closed' && typeof pr.merged_at === 'string'
    && Number.isSafeInteger(pr.number) && pr.number > 0
    && pr.html_url === `https://github.com/${mirror.repository}/pull/${pr.number}`
    && isSha(pr.merge_commit_sha) && isMirrorMergeAncestor(pr.merge_commit_sha, mirror.revision))
  assert.equal(integrated.length, 1, 'Pages deployment commit must map to one merged PR in the captured mirror main')
  const [pr] = integrated
  return {
    schema: PAGES_DEPLOYMENT_COMMIT_PROVENANCE_SCHEMA, kind: 'published-mirror-pull-request',
    repository: mirror.repository, deploymentCommitRevision: pagesIdentity.deploymentCommitRevision,
    sourceRevision, mirrorRevision: mirror.revision,
    pullRequest: { number: pr.number, url: pr.html_url, mergeCommitRevision: pr.merge_commit_sha, mergedAt: pr.merged_at },
  }
}

const assertPagesDeploymentCommitProvenance = ({ pagesIdentity, sourceRevision, mirror, provenance }) => {
  assert.equal(provenance?.schema, PAGES_DEPLOYMENT_COMMIT_PROVENANCE_SCHEMA)
  if (provenance.kind === 'graph-source') {
    requireExactKeys(provenance, ['schema', 'kind', 'repository', 'deploymentCommitRevision', 'sourceRevision'],
      'Graph Pages deployment commit provenance')
    assert.equal(provenance.repository, 'huijoohwee/agentic-graph')
    assert.equal(provenance.deploymentCommitRevision, pagesIdentity.deploymentCommitRevision)
    assert.equal(provenance.sourceRevision, sourceRevision)
    assert.equal(pagesIdentity.deploymentCommitRevision, sourceRevision)
    return
  }
  assert.equal(provenance.kind, 'published-mirror-pull-request', 'Pages deployment commit provenance kind is unsupported')
  requireExactKeys(provenance, ['schema', 'kind', 'repository', 'deploymentCommitRevision', 'sourceRevision',
    'mirrorRevision', 'pullRequest'], 'mirror Pages deployment commit provenance')
  assert.equal(provenance.repository, mirror.repository)
  assert.equal(provenance.deploymentCommitRevision, pagesIdentity.deploymentCommitRevision)
  assert.equal(provenance.sourceRevision, sourceRevision)
  assert.equal(provenance.mirrorRevision, mirror.revision)
  requireExactKeys(provenance.pullRequest, ['number', 'url', 'mergeCommitRevision', 'mergedAt'], 'mirror deployment PR provenance')
  assert.ok(Number.isSafeInteger(provenance.pullRequest.number) && provenance.pullRequest.number > 0)
  assert.equal(provenance.pullRequest.url, `https://github.com/${mirror.repository}/pull/${provenance.pullRequest.number}`)
  assert.match(provenance.pullRequest.mergeCommitRevision || '', /^[0-9a-f]{40}$/)
  instant(provenance.pullRequest.mergedAt)
}

const assertCurrentReadinessParity = round => {
  const { pages, state, mirror, deployment, pagesReadiness, mirrorReadiness } = round
  assert.equal(pages.schema, 'agentic-graph-production-pages-current-observation/v1')
  assert.equal(pages.adapterId, 'cloudflare-pages/api-canonical-observation-v1')
  assert.equal(state.schema, 'agentic-graph-d1-state-snapshot/v1')
  assert.equal(state.workspaceId, 'kgws:canonical-docs')
  assert.equal(state.readbackAdapterId, 'cloudflare-wrangler-d1-direct-readback/v1')
  assert.equal(state.readbackKind, 'direct-authoritative')
  assert.equal(mirror.schema, 'agentic-graph-production-observed-mirror-identity/v1')
  assert.equal(mirror.repository, 'huijoohwee/huijoohwee')
  assert.equal(pagesReadiness?.schema, 'agentic-os-production-runtime-readiness/v2')
  assert.equal(pagesReadiness?.status, 'verified-build')
  assert.equal(pagesReadiness?.source?.repository, 'huijoohwee/agentic-graph')
  assert.equal(pagesReadiness?.source?.revision, pages.identity.sourceRevision,
    'Pages readiness marker does not describe the current deployment')
  assert.equal(mirror.sourceRevision, pages.identity.sourceRevision,
    'published mirror source differs from current Pages runtime')
  assert.deepEqual(mirrorReadiness, pagesReadiness,
    'published mirror readiness marker differs from current Pages runtime')
  assert.equal(deployment.id, pages.identity.deploymentId, 'deployment API identity differs')
  assert.equal(deployment.url, pages.identity.deploymentOrigin, 'deployment API origin differs')
  assert.equal(deployment.environment, 'production')
  assert.equal(deployment.latest_stage?.name, 'deploy')
  assert.equal(deployment.latest_stage?.status, 'success')
  assert.equal(instant(deployment.latest_stage.ended_on), instant(pages.identity.deployedAt))
  return pagesReadiness
}

// A fresh provider observation can name today's rollback target without
// reconstructing the historical release carrier or its authorization.
export function createObservedCurrentRollbackBaseline({ first, second, repositoryId, candidateSourceRevision,
  captureRunId, captureWorkflowRef, deploymentCommitProvenance, assembledAt }) {
  assert.ok(Number.isSafeInteger(repositoryId) && repositoryId > 0, 'repository ID is required')
  assert.match(candidateSourceRevision || '', /^[0-9a-f]{40}$/, 'candidate source revision is required')
  assert.match(String(captureRunId || ''), /^[1-9]\d*$/, 'protected capture workflow run ID is required')
  assert.equal(captureWorkflowRef,
    'huijoohwee/agentic-graph/.github/workflows/production-rollback-baseline-capture.yml@refs/heads/main',
    'current baseline must come from the protected capture workflow')
  assert.equal(canonicalJson(currentSubstantive(first)), canonicalJson(currentSubstantive(second)),
    'current provider state changed between observations')
  const readiness = assertCurrentReadinessParity(second)
  assertCurrentReadinessParity(first)
  const sourceRevision = second.pages.identity.sourceRevision
  assert.match(sourceRevision, /^[0-9a-f]{40}$/, 'observed Pages source revision is invalid')
  assertPagesDeploymentCommitProvenance({ pagesIdentity: second.pages.identity, sourceRevision,
    mirror: second.mirror, provenance: deploymentCommitProvenance })
  assert.equal(second.mirror.sourceRevision, sourceRevision)
  assert.equal(readiness.mirror?.repository, 'huijoohwee/huijoohwee')
  assert.ok(['huijoohwee/agentic-os', 'huijoohwee/agentic-canvas-os'].includes(readiness.agenticCanvasOs?.repository),
    'current runtime marker names an unsupported documentation owner')
  assert.match(readiness.agenticCanvasOs?.revision || '', /^[0-9a-f]{40}$/)
  assert.equal(readiness.agenticCanvasOs?.revision, readiness.catalogRevision,
    'current runtime marker has an unjoined documentation revision')
  assert.equal(readiness.artifact?.algorithm, 'sha256')
  assert.match(readiness.artifact?.digest || '', /^[0-9a-f]{64}$/)
  assert.equal(readiness.immutableManifest?.algorithm, 'sha256')
  assert.match(readiness.immutableManifest?.digest || '', /^[0-9a-f]{64}$/)
  const assembled = instant(assembledAt)
  const chronology = []
  for (const round of [first, second]) {
    assertCurrentReadinessParity(round)
    assert.ok(Date.parse(round.pages.identity.deployedAt) <= instant(round.pages.capturedAt),
      'current deployment observation predates the deployment')
    chronology.push(instant(round.pages.capturedAt), instant(round.state.capturedAt), instant(round.mirror.observedAt))
  }
  for (let index = 1; index < chronology.length; index += 1) {
    assert.ok(chronology[index] > chronology[index - 1], 'provider reads must be strictly ordered')
  }
  assert.ok(assembled >= chronology.at(-1), 'baseline assembly predates provider observations')
  assert.ok(assembled - chronology[0] <= SUCCESSFUL_RELEASE_RECAPTURE_FRESHNESS_MS,
    'current provider observations are stale')
  const pages = second.pages.identity
  const recapture = normalizeRollbackRecapture({
    schema: ROLLBACK_RECAPTURE_SCHEMA,
    rollbackIdentity: {
      schema: ROLLBACK_IDENTITY_SCHEMA,
      pages: {
        deploymentId: pages.deploymentId, deploymentOrigin: pages.deploymentOrigin,
        deploymentCommitRevision: pages.deploymentCommitRevision, sourceRevision: pages.sourceRevision,
      },
      mirror: { repository: second.mirror.repository, revision: second.mirror.revision },
      d1: { stateContractDigest: second.state.stateContractDigest,
        readbackDigest: second.state.readbackDigest, counts: second.state.observedCounts },
    },
    capturedAt: assembledAt,
  })
  const provenance = {
    schema: 'agentic-graph-observed-current-rollback-baseline/v1',
    status: 'current-rollback-baseline-observed',
    historicalLifecycleReconstructed: false,
    productionAuthorized: false,
    captureRepositoryId: repositoryId,
    captureRunId: Number(captureRunId),
    captureWorkflowRef,
    captureSourceRevision: candidateSourceRevision,
    observedProductionSourceRevision: sourceRevision,
    deploymentCommitProvenance,
    observedAt: assembledAt,
    observationDigest: digest({ first, second, repositoryId, candidateSourceRevision }),
    rollbackRecaptureDigest: digest(recapture),
  }
  return { recapture, provenance }
}

// This is a newly observed rollback target, never a reconstruction of lost
// authorization, reconciliation, or production-complete lifecycle receipts.
export function createObservedRollbackBaseline({ first, second, run, artifacts, repositoryId, assembledAt,
  terminalPersistence, terminalPersistenceReobservation }) {
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
  let persistence
  if (terminal.length === 0 && terminalPersistence) {
    persistence = verifyRemovedTerminalPersistence({ ...terminalPersistence, run, artifacts })
  } else {
    assert.equal(terminal.length, 1, 'exact terminal artifact metadata is required')
    assert.equal(terminal[0].expired, true, 'use the existing terminal artifact while available')
    assert.ok(Number.isSafeInteger(terminal[0].id) && terminal[0].id > 0, 'terminal artifact ID is required')
  }
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
  if (persistence) {
    assert.ok(terminalPersistenceReobservation, 'retained final terminal inventories are required')
    assert.deepEqual(terminalPersistenceReobservation.artifacts, artifacts, 'final artifact inventory differs')
    assert.deepEqual(terminalPersistenceReobservation.jobs, terminalPersistence.jobs, 'final job inventory differs')
    const reobserved = instant(terminalPersistenceReobservation.capturedAt)
    assert.ok(reobserved > chronology.at(-1) && reobserved <= assembled,
      'terminal inventories must be reobserved after provider rounds and before assembly')
  }
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
    schema: persistence ? 'agentic-graph-observed-rollback-baseline/v2' : 'agentic-graph-observed-rollback-baseline/v1',
    status: 'rollback-baseline-observed',
    reason: persistence ? 'terminal-artifact-removed' : 'terminal-artifact-expired',
    historicalLifecycleReconstructed: false,
    productionAuthorized: false,
    releaseRunId: run.id,
    releaseAttempt: run.run_attempt,
    ...(persistence ? { terminalPersistence: persistence,
      terminalPersistenceReobservationDigest: digest(terminalPersistenceReobservation),
    } : { expiredTerminalArtifactId: terminal[0].id }),
    repositoryId,
    capturedAt: assembledAt,
    observationDigest: digest({ first, second, run, artifacts, repositoryId,
      ...(persistence ? { terminalPersistence, terminalPersistenceReobservation } : {}) }),
    rollbackRecaptureDigest: digest(recapture),
  }
  return { recapture, provenance }
}
