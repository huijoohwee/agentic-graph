import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { pathToFileURL } from 'node:url'
import { createLifecycleAuthorization, createLifecycleCandidate, createLifecycleDeployment, createLifecycleLive,
  createLifecyclePublication, createLifecycleRollback, createLifecycleState, digest, selectProductionApproval } from '../production-release-lifecycle.mjs'
import { canonicalJson, createReleaseEvidenceFromSnapshot, createProductionCompleteCarrier, createRolledBackCarrier,
  releaseInventoryDigest, validateProductionCompleteCarrier } from '../lib/production-release-lifecycle-evidence.mjs'
import { buildTerminalAuthorizationEvidence, formatTerminalAuthorizationComment, responseFor } from '../production-terminal-authorization.mjs'
import { readContract } from '../collaboration-contract.mjs'
import { resolveCanonicalSourceRoots } from '../worktree-policy.mjs'
const repoRoot = path.resolve(import.meta.dirname, '..', '..'), collaborationContract = await readContract()
const canonicalSourceRoots = resolveCanonicalSourceRoots({ cwd: repoRoot, contract: collaborationContract })
const docsSource = collaborationContract.local_development.canonical_sources
  .find(source => source.id === 'agentic-canvas-os-docs')
if (!docsSource) throw new Error('collaboration contract has no Agentic Canvas OS docs source')
const docsRoot = path.resolve(canonicalSourceRoots.roots.get(docsSource.id), docsSource.required_path)
const contract = await import(pathToFileURL(
  path.join(path.dirname(docsRoot), 'scripts', 'collaborative-release-lifecycle-contract.mjs'),
).href)
const sourceRevision = 'a'.repeat(40), sourceTree = 'b'.repeat(40), docsRevision = 'c'.repeat(40), docsTree = 'd'.repeat(40)
const guidelineRevision = 'e'.repeat(40), mirrorRevision = 'f'.repeat(40), reviewEvidenceDigest = '1'.repeat(64)
const localEvidence = {
  schema: 'agentic-local-review-candidate/v1',
  status: 'review-ready',
  source: { repository: 'huijoohwee/knowgrph', revision: sourceRevision, tree: sourceTree },
  agenticCanvasOs: { repository: 'huijoohwee/agentic-canvas-os', revision: docsRevision, tree: docsTree },
  catalogRevision: docsRevision,
  runtimeEvidenceDigest: reviewEvidenceDigest,
}
const localReview = { ...localEvidence, candidateDigest: digest(localEvidence) }
const readiness = {
  source: { repository: 'huijoohwee/knowgrph', revision: sourceRevision, tree: sourceTree },
  agenticCanvasOs: { repository: 'huijoohwee/agentic-canvas-os', revision: docsRevision },
  artifact: { algorithm: 'sha256', digest: '2'.repeat(64) },
  immutableManifest: { algorithm: 'sha256', digest: '3'.repeat(64) },
  mirror: { repository: 'huijoohwee/huijoohwee' },
}
const releaseEvidence = {
  schema: 'agentic-production-release-candidate/v1',
  status: 'awaiting-human-authorization',
  source: localReview.source,
  agenticCanvasOs: localReview.agenticCanvasOs,
  catalogRevision: docsRevision,
  artifact: readiness.artifact,
  immutableManifest: readiness.immutableManifest,
  localReviewCandidateDigest: localReview.candidateDigest,
}
const releaseCandidate = {
  ...releaseEvidence,
  candidateDigest: digest(releaseEvidence),
}
const collaboration = { actorId: 'github:user:1', deviceId: 'github-hosted:linux',
  sessionId: 'github-actions:1:1', worktreeId: 'github-workspace:1:verify', branchId: 'refs/heads/main',
  scopeId: 'production-release', leaseEpoch: 1, fenceRevision: sourceRevision }
const laneCollaboration = index => ({
  actorId: `github-user:${index + 1}`, deviceId: `device:${index + 1}`,
  sessionId: `session:${index + 1}`, worktreeId: `worktree:${index + 1}`,
  branchId: `refs/heads/lane-${index + 1}`, scopeId: `scope:${index + 1}`,
  leaseEpoch: index + 1, fenceRevision: `${index + 1}`.repeat(64).slice(0, 64),
})
const rollbackIdentity = {
  schema: 'knowgrph-production-rollback-identity/v1',
  pages: { deploymentId: 'previous-deployment', deploymentOrigin: 'https://previous.pages.dev',
    deploymentCommitRevision: '8'.repeat(40), sourceRevision: '9'.repeat(40) },
  mirror: { repository: 'huijoohwee/huijoohwee', revision: mirrorRevision },
  d1: { stateContractDigest: '6'.repeat(64), readbackDigest: '7'.repeat(64),
    counts: { documentCount: 3, chunkCount: 4, graphCount: 0 } },
}
const buildReleaseEvidence = (overrides = {}) => {
  const entries = Array.from({ length: 19 }, (_, index) => ({
    collaboration: laneCollaboration(index),
    writeSetDigest: digest({ lane: index, kind: 'write-set' }),
    stateDigest: digest({ lane: index, kind: 'state' }),
    recoveryHandle: `git-worktree:lane-${index + 1}`,
    preservationMode: 'active-lane',
    overlapClass: index === 0 ? 'overlapping' : 'disjoint',
  }))
  const observations = entries.map(entry => ({
    collaboration: entry.collaboration,
    stateDigest: entry.stateDigest,
    recoveryHandle: entry.recoveryHandle,
    disposition: 'retained',
  }))
  const evidence = {
    schema: 'knowgrph-production-release-evidence/v1',
    repository: 'huijoohwee/knowgrph',
    sourceRevision,
    protectedTipDigest: digest({ sourceRevision, sourceTree }),
    convergenceBaseDigest: digest({ sourceRevision, sourceTree, ref: 'refs/heads/main' }),
    captureAdapterId: 'agentic-dormant-preservation-admission/v1',
    capturedAt: '2026-07-29T00:00:00.000Z',
    observedAt: '2026-07-29T00:00:30.000Z',
    inventoryDigest: '0'.repeat(64),
    successorWriteSetDigest: digest(['scripts/production-release-lifecycle.mjs']),
    entries,
    observations,
    rollbackIdentity,
    rollbackCapturedAt: '2026-07-28T23:59:30.000Z',
    rollbackTargetDigest: digest(rollbackIdentity),
    sourceEvidenceRefs: [{ kind: 'dormant-admission-journal', digest: '5'.repeat(64) }],
    ...overrides,
  }
  evidence.inventoryDigest = releaseInventoryDigest(evidence)
  return evidence
}
const buildMaterializerFixture = () => {
  const canonicalPath = '/workspace/canonical', successorPath = '/workspace/successor'
  const preserved = Array.from({ length: 19 }, (_, index) => ({ path: `/workspace/lane-${index + 1}`, stateDigest: digest(`state-${index + 1}`) }))
  const manifest = { schema: 'agentic-declared-write-scope/v1', semanticScope: 'release-successor', paths: ['.github/workflows/release.yml'] }
  const manifestBytes = Buffer.from(JSON.stringify(manifest)), selected = preserved.slice(0, 10).map((lane, index) => ({
    ...lane, selectionDigest: digest(`selection-${index}`), worktree: { branch: `refs/heads/dormant-${index}` },
  }))
  const source = {
    schema: 'agentic-dormant-preservation-admission-source-evidence/v1',
    controller: { headSha: '1'.repeat(40), treeSha: '2'.repeat(40) },
    canonical: { canonicalPath, targetRepository: 'huijoohwee/knowgrph', existingLanes: [{ path: canonicalPath, stateDigest: digest('old-canonical') }, ...preserved] },
    candidate: { targetPath: successorPath, branch: 'agent/device/release-successor', deviceId: 'device', semanticScope: manifest.semanticScope,
      manifestFileDigest: digest(manifestBytes), manifest: { paths: manifest.paths, writeSetDigest: digest(['release-successor']) } },
    preservation: { authenticatedActor: { actorId: 'github-user:7' }, sessionId: 'controller-session', selectedLanes: selected },
    cloudInventory: { claims: [] },
  }
  source.sourceEvidenceDigest = digest(source)
  const execution = { schema: 'agentic-dormant-preservation-admission-execution-evidence/v1', status: 'admitted',
    candidate: { leaseEpoch: 487, headSha: '3'.repeat(40) } }
  execution.evidenceDigest = digest(execution)
  const completion = { schema: 'agentic-dormant-preservation-admission-receipt/v1', status: 'admitted', sourceEvidenceDigest: source.sourceEvidenceDigest }
  completion.receiptDigest = digest(completion)
  const journalBytes = Buffer.from(JSON.stringify({ schema: 'agentic-dormant-preservation-admission-journal/v1', intent: {
    status: 'complete', planSnapshot: { sourceEvidence: source }, phases: { admitted: { values: { executionEvidence: execution } }, complete: { values: { receipt: completion } } },
  } }))
  const lanes = [{ path: canonicalPath, head: sourceRevision, treeSha: sourceTree, dirty: false, invalid: false, stateDigest: digest('new-canonical') },
    ...preserved.map((lane, index) => ({ ...lane, head: `${index + 1}`.repeat(40).slice(0, 40), treeSha: `${index + 2}`.repeat(40).slice(0, 40), dirty: false,
      leaseAmbiguous: false, lease: index < 10 ? null : { device: `writer-device-${index}`, sessionId: `writer-session-${index}`,
        branch: `writer-${index}`, scope: `writer-scope-${index}`, epoch: index + 1, fenceSha: `${index + 3}`.repeat(40).slice(0, 40), worktreePath: lane.path } })),
    { path: successorPath, head: '4'.repeat(40), treeSha: '5'.repeat(40), dirty: false, stateDigest: digest('successor') }]
  const laneState = { canonicalBaseSha: sourceRevision, canonicalSourceDisposition: 'exact', lanes, registryDigest: digest('registry') }
  laneState.laneStateDigest = digest(lanes.map(({ path: lanePath, stateDigest }) => ({ path: lanePath, stateDigest })).sort((a, b) => a.path.localeCompare(b.path)))
  const inventoryBytes = Buffer.from(JSON.stringify({ schema: 'agentic-release-frontier-inventory/v1', lanes: preserved.map((lane, index) => ({
    worktreePath: lane.path, headSha: lanes[index + 1].head, clean: true, disposition: 'keep',
  })) }))
  const laneWriteSets = preserved.map((lane, index) => ({ schema: 'knowgrph-preserved-lane-write-set/v1', path: lane.path,
    sourceRevision, mergeBaseRevision: '6'.repeat(40), laneHeadRevision: lanes[index + 1].head,
    paths: [index === 0 ? manifest.paths[0] : `lane-${index + 1}.txt`] }))
  const rollbackBytes = Buffer.from(JSON.stringify({ schema: 'knowgrph-production-rollback-recapture/v1', rollbackIdentity,
    capturedAt: '2026-07-28T23:59:30.000Z' }))
  return { journalBytes, inventoryBytes, manifestBytes, rollbackBytes, laneState, laneWriteSets, sourceRevision, sourceTree,
    capturedAt: '2026-07-29T00:00:00.000Z', observedAt: '2026-07-29T00:00:30.000Z', successorContained: true }
}
const buildCandidate = (overrides = {}) => createLifecycleCandidate({
  contract,
  localReview,
  readiness,
  sourceRevision,
  sourceTree,
  agenticCanvasOsRevision: docsRevision,
  agenticCanvasOsTree: docsTree,
  guidelineRevision,
  mirrorRevision,
  collaboration,
  integratedAt: '2026-07-29T00:00:40.000Z',
  issuedAt: '2026-07-29T00:01:00.000Z',
  targetId: 'airvio.co/knowgrph',
  releaseEvidence: buildReleaseEvidence(),
  ...overrides,
})
const baseApproval = {
  state: 'approved',
  environments: [{ name: 'production' }],
  user: { login: 'operator', id: 7, type: 'User' },
}
const approvalsFor = (candidate, runId) => {
  const challengeDigest = '4'.repeat(64)
  const evidence = buildTerminalAuthorizationEvidence({
    repository: 'huijoohwee/knowgrph',
    runId,
    sourceRevision,
    candidateDigest: releaseCandidate.candidateDigest,
    lifecycleCandidateDigest: candidate.receiptDigest,
    targetDigest: candidate.targetDigest,
    humanActorId: 'github-user:7:operator',
    challengeDigest,
    responseDigest: responseFor({
      challengeDigest,
      candidateDigest: releaseCandidate.candidateDigest,
    }),
    recordedAt: '2026-07-29T00:01:30.000Z',
  })
  return [{ ...baseApproval, comment: formatTerminalAuthorizationComment(evidence) }]
}
test('adapter creates a joined neutral receipt chain from the exact localhost candidate', () => {
  const chain = buildCandidate()
  assert.equal(chain.preservation.entries.length, 19)
  assert.equal(chain.disposition.observations.length, 19)
  assert.ok(chain.disposition.observations.every(observation => observation.disposition === 'retained'))
  assert.equal(chain.disposition.preservationReceiptDigest, chain.preservation.receiptDigest)
  assert.equal(chain.integration.preservationReceiptDigest, chain.preservation.receiptDigest)
  assert.equal(chain.integration.overlapDispositionReceiptDigest, chain.disposition.receiptDigest)
  assert.equal(chain.integration.sourceRevision, sourceRevision)
  assert.equal(chain.review.integrationReceiptDigest, chain.integration.receiptDigest)
  assert.equal(chain.candidate.runtimeReviewReceiptDigest, chain.review.receiptDigest)
  assert.equal(chain.candidate.artifactDigest, readiness.artifact.digest)
  assert.equal(chain.candidate.manifestDigest, readiness.immutableManifest.digest)
  assert.equal(chain.candidate.rollbackTargetDigest, digest(rollbackIdentity))
})
test('materializer emits ten controller and nine exact writer-record preservation entries', () => {
  const fixture = buildMaterializerFixture(), evidence = createReleaseEvidenceFromSnapshot(fixture)
  assert.equal(evidence.entries.length, 19); assert.equal(evidence.entries.filter(entry => entry.collaboration.scopeId.startsWith('dormant-controller:')).length, 10)
  assert.equal(evidence.entries.filter(entry => entry.collaboration.scopeId.startsWith('writer-lease-record:')).length, 9); assert.equal(evidence.entries.filter(entry => entry.overlapClass === 'overlapping').length, 1)
  assert.ok(evidence.observations.every(observation => observation.disposition === 'retained'))
  assert.equal(evidence.entries.filter(entry => entry.preservationMode === 'immutable-recovery-object').length, 10); assert.equal(evidence.entries.filter(entry => entry.preservationMode === 'active-lane').length, 9)
  assert.equal(evidence.entries.filter(entry => entry.recoveryHandle.startsWith('agentic-dormant-preservation:v1:')).length, 10)
  assert.ok(evidence.entries.every(entry => /^(active|dormant)-worktree:v1:[0-9a-f]{64}$/.test(entry.collaboration.worktreeId)))
  assert.ok(!JSON.stringify(evidence).includes('/workspace/'))
  const cleaned = buildMaterializerFixture(); cleaned.laneState.lanes.pop(); cleaned.successorContained = false
  cleaned.laneState.laneStateDigest = digest(cleaned.laneState.lanes.map(({ path: lanePath, stateDigest }) => ({ path: lanePath, stateDigest })).sort((a, b) => a.path.localeCompare(b.path)))
  assert.equal(createReleaseEvidenceFromSnapshot(cleaned).entries.length, 19)
})
test('materializer rejects preserved byte drift and absent writer records', () => {
  const drifted = buildMaterializerFixture()
  drifted.laneState.lanes[1].stateDigest = digest('drifted')
  drifted.laneState.laneStateDigest = digest(drifted.laneState.lanes.map(({ path: lanePath, stateDigest }) => ({ path: lanePath, stateDigest })).sort((a, b) => a.path.localeCompare(b.path)))
  assert.throws(() => createReleaseEvidenceFromSnapshot(drifted), /preserved lane state drifted/)
  const missing = buildMaterializerFixture()
  missing.laneState.lanes[11].lease = null
  missing.laneState.laneStateDigest = digest(missing.laneState.lanes.map(({ path: lanePath, stateDigest }) => ({ path: lanePath, stateDigest })).sort((a, b) => a.path.localeCompare(b.path)))
  assert.throws(() => createReleaseEvidenceFromSnapshot(missing), /no exact lease record/)
})
test('release evidence rejects omitted lanes, restored observations, and pre-capture integration time', () => {
  const missingLane = buildReleaseEvidence()
  missingLane.entries = missingLane.entries.slice(1)
  missingLane.observations = missingLane.observations.slice(1)
  missingLane.inventoryDigest = releaseInventoryDigest(missingLane)
  assert.throws(() => buildCandidate({ releaseEvidence: missingLane }), /exactly 19 preservation entries/)
  const restored = buildReleaseEvidence()
  restored.observations[0] = { ...restored.observations[0], disposition: 'restored' }
  restored.inventoryDigest = releaseInventoryDigest(restored)
  assert.throws(() => buildCandidate({ releaseEvidence: restored }), /must be retained/)
  const graph = buildReleaseEvidence({ rollbackIdentity: structuredClone(rollbackIdentity) }); graph.rollbackIdentity.d1.counts.graphCount = 1; graph.rollbackTargetDigest = digest(graph.rollbackIdentity); assert.throws(() => buildCandidate({ releaseEvidence: graph }), /requires zero graph snapshots/)
  assert.throws(
    () => buildCandidate({ integratedAt: '2026-07-29T00:00:00.000Z' }),
    /cannot predate the authoritative release-frontier observation/,
  )
  assert.throws(
    () => buildCandidate({ mirrorRevision: '0'.repeat(40) }),
    /rollback mirror revision drifted/,
  )
})
test('inventory and rollback identity drift change the authorization-bound candidate receipt', () => {
  const base = buildCandidate()
  const inventoryChanged = buildReleaseEvidence({
    sourceEvidenceRefs: [{ kind: 'dormant-admission-journal', digest: '4'.repeat(64) }],
  })
  const changedInventory = buildCandidate({ releaseEvidence: inventoryChanged })
  assert.notEqual(changedInventory.candidate.dependencyClosureDigest, base.candidate.dependencyClosureDigest)
  assert.notEqual(changedInventory.candidate.receiptDigest, base.candidate.receiptDigest)
  const changedRollbackIdentity = {
    ...rollbackIdentity,
    pages: { ...rollbackIdentity.pages, deploymentId: 'another-previous-deployment' },
  }
  const rollbackChanged = buildReleaseEvidence({
    rollbackIdentity: changedRollbackIdentity,
    rollbackTargetDigest: digest(changedRollbackIdentity),
  })
  const changedRollback = buildCandidate({ releaseEvidence: rollbackChanged })
  assert.notEqual(changedRollback.candidate.rollbackTargetDigest, base.candidate.rollbackTargetDigest)
  assert.notEqual(changedRollback.candidate.receiptDigest, base.candidate.receiptDigest)
})
test('multi-user and multi-device collaboration identities remain distinct', () => {
  const first = buildCandidate()
  const second = buildCandidate({
    collaboration: {
      ...collaboration,
      actorId: 'github:user:2',
      deviceId: 'self-hosted:workstation-b',
      sessionId: 'github-actions:2:1',
      worktreeId: 'github-workspace:2:verify',
      scopeId: 'production-release-b',
      leaseEpoch: 2,
    },
  })
  assert.notEqual(first.integration.receiptDigest, second.integration.receiptDigest)
  assert.notEqual(first.review.receiptDigest, second.review.receiptDigest)
  assert.notEqual(first.candidate.receiptDigest, second.candidate.receiptDigest)
})
test('authorization accepts one GitHub human approval and is consumed once', () => {
  const chain = buildCandidate()
  const result = createLifecycleAuthorization({
    contract,
    ...chain,
    releaseCandidate,
    localReview,
    approvals: approvalsFor(chain.candidate, '123'),
    repository: 'huijoohwee/knowgrph',
    runId: '123',
    serverUrl: 'https://github.com',
    controllerId: 'github-actions:123:deploy',
    issuedAt: '2026-07-29T00:02:00.000Z',
  })
  assert.equal(result.interaction.browserRequired, false)
  assert.equal(result.authorization.interactionReceiptDigest, result.interaction.receiptDigest)
  assert.equal(result.authorization.humanActorId, 'github-user:7:operator')
  assert.equal(result.authorization.status, 'authorized')
  assert.equal(result.consumedAuthorization.status, 'consumed')
  assert.equal(result.dispatch.status, 'claimed')
  assert.throws(
    () => contract.consumeHumanAuthorizationReceipt(result.consumedAuthorization, {
      consumedAt: '2026-07-29T00:03:00.000Z',
      controllerId: 'github-actions:other',
    }),
    /schema or status|unconsumed|already consumed|missing or unknown fields/,
  )
})
test('strict terminal constructors form and validate one production-complete v2 carrier', () => {
  const chain = buildCandidate()
  const authorized = createLifecycleAuthorization({
    contract,
    ...chain,
    releaseCandidate,
    localReview,
    approvals: approvalsFor(chain.candidate, '125'),
    repository: 'huijoohwee/knowgrph',
    runId: '125',
    serverUrl: 'https://github.com',
    controllerId: 'github-actions:125:deploy',
    issuedAt: '2026-07-29T00:02:00.000Z',
  })
  const wranglerOutput = Buffer.from([
    JSON.stringify({
      type: 'pages-deploy',
      version: 1,
      pages_project: 'knowgrph',
      deployment_id: 'candidate-deployment',
      url: 'https://candidate.pages.dev',
    }),
    JSON.stringify({
      type: 'pages-deploy-detailed',
      version: 1,
      pages_project: 'knowgrph',
      deployment_id: 'candidate-deployment',
      url: 'https://candidate.pages.dev',
      alias: null,
      environment: 'production',
      production_branch: 'main',
      deployment_trigger: { metadata: { commit_hash: sourceRevision } },
    }),
  ].join('\n'))
  const deploymentCapture = {
    schema: 'knowgrph-pages-deployment-capture/v1', status: 'deployed',
    adapterId: 'cloudflare-pages/api-canonical-observation-v1',
    deploymentId: 'candidate-deployment', deploymentOrigin: 'https://candidate.pages.dev', sourceRevision,
    deployedAt: '2026-07-29T00:03:00.000Z', capturedAt: '2026-07-29T00:03:10.000Z',
  }
  const deployment = createLifecycleDeployment({
    contract,
    candidate: chain.candidate,
    consumedAuthorization: authorized.consumedAuthorization,
    releaseEvidence: chain.releaseEvidence,
    wranglerOutput,
    deploymentCapture,
    rollbackRecapture: {
      schema: 'knowgrph-production-rollback-recapture/v1',
      rollbackIdentity,
      capturedAt: '2026-07-29T00:02:30.000Z',
    },
  })
  assert.equal(deployment.deployedAt, '2026-07-29T00:03:00.000Z')
  assert.equal(deployment.rollbackTargetDigest, chain.candidate.rollbackTargetDigest)
  const fallback = createLifecycleDeployment({
    contract, candidate: chain.candidate, consumedAuthorization: authorized.consumedAuthorization,
    releaseEvidence: chain.releaseEvidence, wranglerOutput: Buffer.from('{"type":"pages-deploy"}\ntruncated'),
    deploymentCapture, rollbackRecapture: { schema: 'knowgrph-production-rollback-recapture/v1', rollbackIdentity, capturedAt: '2026-07-29T00:02:30.000Z' },
  })
  assert.equal(fallback.deploymentAdapterId, 'cloudflare-pages/api-canonical-observation-v1')
  assert.throws(() => createLifecycleDeployment({
    contract,
    candidate: chain.candidate,
    consumedAuthorization: authorized.consumedAuthorization,
    releaseEvidence: chain.releaseEvidence,
    wranglerOutput,
    deploymentCapture,
    rollbackRecapture: {
      schema: 'knowgrph-production-rollback-recapture/v1',
      rollbackIdentity: {
        ...rollbackIdentity,
        pages: { ...rollbackIdentity.pages, deploymentId: 'drifted' },
      },
      capturedAt: '2026-07-29T00:02:30.000Z',
    },
  }), /rollback identity drifted/)
  const state = createLifecycleState({
    contract,
    deployment,
    stateEvidence: {
      schema: 'knowgrph-d1-reconciliation-evidence/v1',
      workspaceId: 'workspace:default',
      stateContractDigest: '6'.repeat(64),
      operationsDigest: '4'.repeat(64),
      operationCount: 12,
      operationLimit: 10_000,
      readbackAdapterId: 'cloudflare-wrangler-d1-direct-readback/v1',
      readbackKind: 'direct-authoritative',
      readbackDigest: '7'.repeat(64),
      expectedCounts: { documentCount: 3, chunkCount: 4, graphCount: 0 },
      observedCounts: { documentCount: 3, chunkCount: 4, graphCount: 0 },
      pathHashParity: true,
      contentParity: true,
      reconciledAt: '2026-07-29T00:04:00.000Z',
    },
  })
  const live = createLifecycleLive({
    contract,
    deployment,
    state,
    sourceRevision,
    immutableOriginSmoke: Buffer.from('immutable smoke passed'),
    publicRouteProbes: Buffer.from('public routes passed'),
    browserFidelity: Buffer.from('{"status":"passed"}'),
    clientCacheConvergence: Buffer.from('{"status":"passed"}'),
    markerParity: Buffer.from(JSON.stringify({
      schema: 'knowgrph-production-transport-evidence/v1',
      status: 'passed',
      sourceRevision,
      markerBytesParity: true,
    })),
    verifiedAt: '2026-07-29T00:05:00.000Z',
  })
  const publication = createLifecyclePublication({
    contract,
    live,
    repository: 'huijoohwee/huijoohwee',
    revision: '3'.repeat(40),
    publishedAt: '2026-07-29T00:06:00.000Z',
  })
  const receipts = [
    chain.preservation,
    chain.disposition,
    chain.integration,
    chain.review,
    chain.candidate,
    authorized.interaction,
    authorized.authorization,
    authorized.consumedAuthorization,
    deployment,
    state,
    live,
    publication,
  ]
  const docsRepositoryRoot = path.dirname(docsRoot)
  const schemas = {
    v1: JSON.parse(fs.readFileSync(path.join(docsRepositoryRoot, 'docs/schemas/collaborative-release-lifecycle.v1.schema.json'))),
    v2: JSON.parse(fs.readFileSync(path.join(docsRepositoryRoot, 'docs/schemas/collaborative-release-lifecycle.v2.schema.json'))),
  }
  const ajvModule = createRequire(import.meta.url)('ajv/dist/2020.js')
  const Ajv2020 = ajvModule.default || ajvModule
  const carrier = createProductionCompleteCarrier({ contract, schemas, Ajv2020, receipts })
  assert.equal(carrier.schema, 'agentic-collaborative-release-lifecycle/v2')
  assert.equal(carrier.completion, 'production-complete')
  assert.equal(carrier.receipts.length, 12)
  assert.equal(validateProductionCompleteCarrier({ contract, schemas, Ajv2020, carrier }), carrier)
  const markerDigest = 'd'.repeat(64)
  const restoredTransports = {
    schema: 'knowgrph-production-transport-evidence/v1', status: 'passed',
    sourceRevision: rollbackIdentity.pages.sourceRevision,
    immutableManifestDigest: readiness.immutableManifest.digest,
    markerBytesParity: true, markerBytesDigest: markerDigest,
    transports: [
      ['immutable', rollbackIdentity.pages.deploymentOrigin],
      ['stable-pages', 'https://stable.pages.dev'],
      ['public', 'https://airvio.co'],
    ].map(([id, origin]) => ({
      id, origin, smoke: { evidenceDigest: 'e'.repeat(64), checkCount: 3 },
      markers: Object.fromEntries(['apex', 'app'].map(surface => [surface, {
        sourceRevision: rollbackIdentity.pages.sourceRevision, agenticCanvasOsRevision: docsRevision,
        catalogRevision: docsRevision, immutableManifestDigest: readiness.immutableManifest.digest,
        artifactDigest: readiness.artifact.digest, bodyDigest: markerDigest,
      }])),
      routes: { apex: { status: 200, routeOwner: 'root-agent-ready-pages' }, app: { status: 200, routeOwner: 'knowgrph-agent-ready-pages' } },
    })),
    verifiedAt: '2026-07-29T00:07:00.000Z',
  }
  const rollbackEvidence = {
    releaseEvidence: chain.releaseEvidence,
    restoredPages: {
      schema: 'knowgrph-production-restored-pages-evidence/v1', status: 'restored',
      adapterId: 'cloudflare-pages/api-canonical-observation-v1',
      canonicalDeployment: { ...rollbackIdentity.pages, deployedAt: '2026-07-28T00:00:00.000Z' },
      capturedAt: '2026-07-29T00:06:30.000Z',
    },
    restoredState: {
      schema: 'knowgrph-d1-state-snapshot/v1', workspaceId: 'workspace:default',
      readbackAdapterId: 'cloudflare-wrangler-d1-direct-readback/v1', readbackKind: 'direct-authoritative',
      stateContractDigest: rollbackIdentity.d1.stateContractDigest, readbackDigest: rollbackIdentity.d1.readbackDigest,
      observedCounts: rollbackIdentity.d1.counts, capturedAt: '2026-07-29T00:06:40.000Z',
    },
    restoredTransports,
    observedMirror: { schema: 'knowgrph-production-observed-mirror-identity/v1', ...rollbackIdentity.mirror, sourceRevision: rollbackIdentity.pages.sourceRevision, observedAt: '2026-07-29T00:06:50.000Z' },
    rolledBackAt: '2026-07-29T00:08:00.000Z',
  }
  assert.throws(() => createLifecycleRollback({ contract, deployment, ...rollbackEvidence,
    restoredState: { ...rollbackEvidence.restoredState, readbackDigest: 'a'.repeat(64) },
    failureObservation: { schema: 'knowgrph-production-release-failure-observation/v1', failedStage: 'deployment', messageDigest: 'b'.repeat(64), observedAt: '2026-07-29T00:06:00.000Z' } }), /state contract, readback, or counts drifted/)
  for (const [failedStage, prefixLength] of [['deployment', 9], ['state-reconciliation', 9], ['live-verification', 10], ['publication', 11], ['receipt-persistence', 11]]) {
    const rollback = createLifecycleRollback({ contract, deployment, ...rollbackEvidence, failureObservation: { schema: 'knowgrph-production-release-failure-observation/v1', failedStage, messageDigest: 'b'.repeat(64), observedAt: '2026-07-29T00:06:00.000Z' } })
    const rolledBack = createRolledBackCarrier({ contract, schemas, Ajv2020, receipts: [...receipts.slice(0, prefixLength), rollback] })
    assert.equal(rolledBack.completion, 'rolled-back')
    assert.equal(rolledBack.receipts.length, prefixLength + 1)
  }
  const tampered = structuredClone(carrier)
  tampered.receipts[8].immutableDeploymentId = 'tampered'
  assert.throws(
    () => validateProductionCompleteCarrier({ contract, schemas, Ajv2020, carrier: tampered }),
    /schema validation failed|reconstruction|digest/,
  )
})
test('authorization rejects agents, bots, ambiguity, and the wrong environment', () => {
  for (const invalid of [
    [],
    [{ ...baseApproval, user: { login: 'release-bot', id: 8, type: 'Bot' } }],
    [{ ...baseApproval, environments: [{ name: 'staging' }] }],
    [baseApproval, { ...baseApproval, user: { login: 'other', id: 9, type: 'User' } }],
  ]) {
    assert.throws(() => selectProductionApproval(invalid), /exactly one authenticated human approval/)
  }
})
test('parallel controller dispatch coalesces an exact duplicate and fences a competing candidate', () => {
  const { candidate } = buildCandidate()
  const first = contract.dispatchReleaseController({}, {
    targetDigest: candidate.targetDigest,
    candidateDigest: candidate.receiptDigest,
    controllerId: 'controller:a',
  })
  const duplicate = contract.dispatchReleaseController(first.ledger, {
    targetDigest: candidate.targetDigest,
    candidateDigest: candidate.receiptDigest,
    controllerId: 'controller:b',
  })
  assert.equal(duplicate.status, 'coalesced')
  assert.equal(duplicate.ownerControllerId, 'controller:a')
  assert.throws(() => contract.dispatchReleaseController(first.ledger, {
    targetDigest: candidate.targetDigest,
    candidateDigest: '9'.repeat(64),
    controllerId: 'controller:b',
  }), /competing release candidate/)
})
test('source, dependency, policy, target, artifact, and manifest drift fail closed', () => {
  const chain = buildCandidate()
  const authorized = createLifecycleAuthorization({
    contract,
    ...chain,
    releaseCandidate,
    localReview,
    approvals: approvalsFor(chain.candidate, '124'),
    repository: 'huijoohwee/knowgrph',
    runId: '124',
    serverUrl: 'https://github.com',
    controllerId: 'github-actions:124:deploy',
    issuedAt: '2026-07-29T00:02:00.000Z',
  })
  const current = {
    preservationReceiptDigest: chain.preservation.receiptDigest,
    overlapDispositionReceiptDigest: chain.disposition.receiptDigest,
    integrationReceiptDigest: chain.integration.receiptDigest,
    runtimeReviewReceiptDigest: chain.review.receiptDigest,
    candidateDigest: chain.candidate.receiptDigest,
    authorizationReceiptDigest: authorized.authorization.receiptDigest,
    sourceDigest: chain.candidate.sourceDigest,
    dependencyClosureDigest: chain.candidate.dependencyClosureDigest,
    policyDigest: chain.candidate.policyDigest,
    targetDigest: chain.candidate.targetDigest,
    artifactDigest: chain.candidate.artifactDigest,
    manifestDigest: chain.candidate.manifestDigest,
  }
  for (const field of [
    'preservationReceiptDigest',
    'overlapDispositionReceiptDigest',
    'sourceDigest',
    'dependencyClosureDigest',
    'policyDigest',
    'targetDigest',
    'artifactDigest',
    'manifestDigest',
  ]) {
    assert.throws(() => contract.validateAuthorizedDeployment({
      ...chain,
      authorization: authorized.authorization,
      current: { ...current, [field]: '8'.repeat(64) },
      now: '2026-07-29T00:03:00.000Z',
    }), new RegExp(`${field} drift`))
  }
  assert.throws(() => contract.validateAuthorizedDeployment({
    ...chain,
    authorization: authorized.authorization,
    current,
    now: '2026-07-29T00:33:00.001Z',
  }), /expired/)
})
