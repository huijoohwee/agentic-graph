import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { pathToFileURL } from 'node:url'
import { createLifecycleAuthorization, createLifecycleCandidate, createLifecycleDeployment, createLifecycleLive,
  createLifecyclePublication, createLifecycleRollback, createLifecycleState, digest, selectProductionApproval } from '../production-release-lifecycle.mjs'
import { canonicalJson, CLEAN_FRONTIER_CAPTURE_ADAPTER, createReleaseEvidenceFromSnapshot,
  CURRENT_FRONTIER_CAPTURE_ADAPTER, createProductionCompleteCarrier, createRolledBackCarrier,
  createSuccessfulReleaseRollbackRecapture,
  materializeCleanFrontierReleaseEvidence, materializeCurrentFrontierReleaseEvidence,
  releaseInventoryDigest, validateProductionCompleteCarrier } from '../lib/production-release-lifecycle-evidence.mjs'
import { normalizeCloudflarePagesDeploymentId, observeMirror } from '../verify-production-release-transports.mjs'
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
const docsRepositoryRoot = path.dirname(docsRoot)
const schemas = {
  v1: JSON.parse(fs.readFileSync(path.join(docsRepositoryRoot, 'docs/schemas/collaborative-release-lifecycle.v1.schema.json'))),
  v2: JSON.parse(fs.readFileSync(path.join(docsRepositoryRoot, 'docs/schemas/collaborative-release-lifecycle.v2.schema.json'))),
}
const ajvModule = createRequire(import.meta.url)('ajv/dist/2020.js')
const Ajv2020 = ajvModule.default || ajvModule
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
  schema: 'agenticgraph-production-rollback-identity/v1',
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
    schema: 'agenticgraph-production-release-evidence/v1',
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
const buildCleanReleaseEvidence = (overrides = {}) => {
  const evidence = {
    schema: 'agenticgraph-production-release-evidence/v1',
    repository: 'huijoohwee/knowgrph',
    sourceRevision,
    protectedTipDigest: digest({ sourceRevision, sourceTree }),
    convergenceBaseDigest: digest({ sourceRevision, sourceTree, ref: 'refs/heads/main' }),
    captureAdapterId: CLEAN_FRONTIER_CAPTURE_ADAPTER,
    capturedAt: '2026-07-29T00:00:00.000Z',
    observedAt: '2026-07-29T00:00:30.000Z',
    inventoryDigest: '0'.repeat(64),
    successorWriteSetDigest: digest({ sourceRevision, sourceTree, preservedEntries: [] }),
    entries: [],
    observations: [],
    rollbackIdentity,
    rollbackCapturedAt: '2026-07-28T23:59:30.000Z',
    rollbackTargetDigest: digest(rollbackIdentity),
    sourceEvidenceRefs: [{ kind: 'clean-frontier-git-state', digest: '5'.repeat(64) }],
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
  const laneWriteSets = preserved.map((lane, index) => ({ schema: 'agenticgraph-preserved-lane-write-set/v1', path: lane.path,
    sourceRevision, mergeBaseRevision: '6'.repeat(40), laneHeadRevision: lanes[index + 1].head,
    paths: [index === 0 ? manifest.paths[0] : `lane-${index + 1}.txt`] }))
  const rollbackBytes = Buffer.from(JSON.stringify({ schema: 'agenticgraph-production-rollback-recapture/v1', rollbackIdentity,
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
  targetId: 'airvio.co/agenticgraph',
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
  assert.throws(() => buildCandidate({ releaseEvidence: missingLane }), /exactly 19 preserved entries/)
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
test('clean release evidence accepts an exact zero-lane frontier only through the clean adapter', () => {
  const chain = buildCandidate({ releaseEvidence: buildCleanReleaseEvidence() })
  assert.equal(chain.preservation.entries.length, 0)
  assert.equal(chain.disposition.observations.length, 0)
  const dirtyAdapter = buildCleanReleaseEvidence({ captureAdapterId: 'agentic-dormant-preservation-admission/v1' })
  dirtyAdapter.inventoryDigest = releaseInventoryDigest(dirtyAdapter)
  assert.throws(() => buildCandidate({ releaseEvidence: dirtyAdapter }), /exactly 19 preserved entries/)
  const dirtyEntry = buildCleanReleaseEvidence({
    entries: buildReleaseEvidence().entries.slice(0, 1),
    observations: buildReleaseEvidence().observations.slice(0, 1),
  })
  dirtyEntry.inventoryDigest = releaseInventoryDigest(dirtyEntry)
  assert.throws(() => buildCandidate({ releaseEvidence: dirtyEntry }), /zero preservation entries/)
})
test('clean frontier materializer binds exact canonical main and rollback recapture', () => {
  const repository = '/repo/agenticgraph'
  const rollbackBytes = Buffer.from(JSON.stringify({ schema: 'agenticgraph-production-rollback-recapture/v1', rollbackIdentity,
    capturedAt: '2026-07-28T23:59:30.000Z' }))
  const git = (cwd, args) => {
    assert.equal(cwd, repository)
    const key = args.join(' ')
    if (key === 'rev-parse HEAD') return `${sourceRevision}\n`
    if (key === 'rev-parse HEAD^{tree}') return `${sourceTree}\n`
    if (key === 'rev-parse refs/remotes/origin/main') return `${sourceRevision}\n`
    if (key === 'ls-remote --exit-code origin refs/heads/main') return `${sourceRevision}\trefs/heads/main\n`
    if (key === 'status --porcelain') return ''
    if (key === 'worktree list --porcelain') return `worktree ${repository}\nHEAD ${sourceRevision}\nbranch refs/heads/main\n`
    throw new Error(`unexpected git command: ${key}`)
  }
  const evidence = materializeCleanFrontierReleaseEvidence({ repository, rollbackBytes, sourceRevision, sourceTree,
    git, clock: () => '2026-07-29T00:00:00.000Z' })
  assert.equal(evidence.entries.length, 0)
  assert.equal(evidence.observations.length, 0)
  assert.equal(evidence.captureAdapterId, CLEAN_FRONTIER_CAPTURE_ADAPTER)
  assert.equal(evidence.rollbackTargetDigest, digest(rollbackIdentity))
})
test('current frontier materializer preserves one attributed review lane', async () => {
  const repository = '/repo/agenticgraph', controllerRoot = '/repo/agentic-canvas-os'
  const lane = {
    path: '/repo/worktrees/review-lane', head: '1'.repeat(40), treeSha: '2'.repeat(40), dirty: false,
    invalid: false, leaseAmbiguous: false, stateDigest: digest('review-lane'),
    lease: { status: 'review_ready', epoch: 9, sessionId: 'review-session', device: 'review-device',
      scope: 'review-scope', branch: 'agent/review-device/review-scope', worktreePath: '/repo/worktrees/review-lane',
      fenceSha: '3'.repeat(40), taskAuthority: { authoritySubjectId: 'urn:agentic-task:review' } },
  }
  const lanes = [{ path: repository, head: sourceRevision, treeSha: sourceTree, dirty: false, invalid: false,
    stateDigest: digest('canonical') }, lane]
  const laneState = { canonicalBaseSha: sourceRevision, canonicalSourceDisposition: 'exact', lanes,
    registryDigest: digest('registry') }
  laneState.laneStateDigest = digest(lanes.map(({ path: lanePath, stateDigest }) => ({ path: lanePath, stateDigest })))
  const rollbackBytes = Buffer.from(JSON.stringify({ schema: 'agenticgraph-production-rollback-recapture/v1', rollbackIdentity,
    capturedAt: '2026-07-28T23:59:30.000Z' }))
  const git = (cwd, args) => {
    const key = args.join(' ')
    if (cwd === controllerRoot && key === 'rev-parse HEAD') return `${docsRevision}\n`
    if (cwd === controllerRoot && key === 'rev-parse HEAD^{tree}') return `${docsTree}\n`
    if (cwd === controllerRoot && key === 'rev-parse refs/remotes/origin/main') return `${docsRevision}\n`
    if (cwd === controllerRoot && key === 'ls-remote --exit-code origin refs/heads/main') return `${docsRevision}\trefs/heads/main\n`
    if (cwd === controllerRoot && key === 'status --porcelain') return ''
    throw new Error(`unexpected git command: ${cwd} :: ${key}`)
  }
  const evidence = await materializeCurrentFrontierReleaseEvidence({ repository, controllerRoot, rollbackBytes,
    sourceRevision, sourceTree, collectLaneState: () => structuredClone(laneState), git,
    writeSetCapture: () => ({ schema: 'agenticgraph-preserved-lane-write-set/v1', path: lane.path, sourceRevision,
      mergeBaseRevision: sourceRevision, laneHeadRevision: lane.head, paths: ['canvas/src/review.ts'] }),
    clock: () => '2026-07-29T00:00:00.000Z' })
  assert.equal(evidence.captureAdapterId, CURRENT_FRONTIER_CAPTURE_ADAPTER)
  assert.equal(evidence.entries.length, 1)
  assert.equal(evidence.entries[0].collaboration.actorId, 'urn:agentic-task:review')
  assert.equal(evidence.entries[0].preservationMode, 'active-lane')
  assert.equal(evidence.observations[0].disposition, 'retained')
  await assert.rejects(materializeCurrentFrontierReleaseEvidence({ repository, controllerRoot, rollbackBytes,
    sourceRevision, sourceTree, collectLaneState: () => ({ ...structuredClone(laneState), laneStateDigest: digest('forged') }), git,
    writeSetCapture: () => ({ schema: 'agenticgraph-preserved-lane-write-set/v1', path: lane.path, sourceRevision,
      mergeBaseRevision: sourceRevision, laneHeadRevision: lane.head, paths: ['canvas/src/review.ts'] }),
    clock: () => '2026-07-29T00:00:00.000Z' }), /exact clean protected main and stable registered lanes/)
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
  const candidateDeploymentId = '11111111-1111-4111-8111-111111111111'
  const wranglerOutput = Buffer.from([
    JSON.stringify({
      type: 'pages-deploy',
      version: 1,
      pages_project: 'agenticgraph',
      deployment_id: candidateDeploymentId,
      url: 'https://candidate.pages.dev',
    }),
    JSON.stringify({
      type: 'pages-deploy-detailed',
      version: 1,
      pages_project: 'agenticgraph',
      deployment_id: candidateDeploymentId,
      url: 'https://candidate.pages.dev',
      alias: null,
      environment: 'production',
      production_branch: 'main',
      deployment_trigger: { metadata: { commit_hash: sourceRevision } },
    }),
  ].join('\n'))
  const deploymentCapture = {
    schema: 'agenticgraph-pages-deployment-capture/v1', status: 'deployed',
    adapterId: 'cloudflare-pages/api-canonical-observation-v1',
    deploymentId: candidateDeploymentId, deploymentOrigin: 'https://candidate.pages.dev', sourceRevision,
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
      schema: 'agenticgraph-production-rollback-recapture/v1',
      rollbackIdentity,
      capturedAt: '2026-07-29T00:02:30.000Z',
    },
  })
  assert.equal(deployment.deployedAt, '2026-07-29T00:03:00.000Z')
  assert.equal(deployment.rollbackTargetDigest, chain.candidate.rollbackTargetDigest)
  const fallback = createLifecycleDeployment({
    contract, candidate: chain.candidate, consumedAuthorization: authorized.consumedAuthorization,
    releaseEvidence: chain.releaseEvidence, wranglerOutput: Buffer.from('{"type":"pages-deploy"}\ntruncated'),
    deploymentCapture, rollbackRecapture: { schema: 'agenticgraph-production-rollback-recapture/v1', rollbackIdentity, capturedAt: '2026-07-29T00:02:30.000Z' },
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
      schema: 'agenticgraph-production-rollback-recapture/v1',
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
      schema: 'agenticgraph-d1-reconciliation-evidence/v1',
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
      schema: 'agenticgraph-production-transport-evidence/v1',
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
  const carrier = createProductionCompleteCarrier({ contract, schemas, Ajv2020, receipts })
  assert.equal(carrier.schema, 'agentic-collaborative-release-lifecycle/v2')
  assert.equal(carrier.completion, 'production-complete')
  assert.equal(carrier.receipts.length, 12)
  assert.equal(validateProductionCompleteCarrier({ contract, schemas, Ajv2020, carrier }), carrier)
  const observation = (pagesCapturedAt, stateCapturedAt, mirrorObservedAt) => ({
    pages: {
      schema: 'agenticgraph-production-pages-current-observation/v1',
      adapterId: 'cloudflare-pages/api-canonical-observation-v1',
      identity: {
        deploymentId: deployment.immutableDeploymentId,
        deploymentOrigin: deployment.immutableDeploymentOrigin,
        deploymentCommitRevision: sourceRevision,
        sourceRevision,
        deployedAt: deployment.deployedAt,
      },
      capturedAt: pagesCapturedAt,
    },
    state: {
      schema: 'agenticgraph-d1-state-snapshot/v1', workspaceId: 'workspace:default',
      readbackAdapterId: state.readbackAdapterId, readbackKind: state.readbackKind,
      stateContractDigest: state.stateContractDigest, readbackDigest: state.readbackDigest,
      observedCounts: state.observedCounts, capturedAt: stateCapturedAt,
    },
    mirror: {
      schema: 'agenticgraph-production-observed-mirror-identity/v1',
      repository: 'huijoohwee/huijoohwee', revision: '3'.repeat(40), sourceRevision,
      observedAt: mirrorObservedAt,
    },
  })
  const firstObservation = observation('2026-07-29T00:06:30.000Z', '2026-07-29T00:07:00.000Z', '2026-07-29T00:08:00.000Z')
  const secondObservation = observation('2026-07-29T00:09:00.000Z', '2026-07-29T00:09:30.000Z', '2026-07-29T00:10:00.000Z')
  const assembledAt = '2026-07-29T00:10:30.000Z'
  const successfulInput = { contract, schemas, Ajv2020, carrier, firstObservation, secondObservation, assembledAt }
  const recapture = createSuccessfulReleaseRollbackRecapture(successfulInput)
  assert.equal(recapture.schema, 'agenticgraph-production-rollback-recapture/v1')
  assert.equal(recapture.capturedAt, assembledAt)
  assert.equal(recapture.rollbackIdentity.pages.sourceRevision, sourceRevision)
  assert.equal(recapture.rollbackIdentity.mirror.revision, '3'.repeat(40))
  assert.deepEqual(recapture.rollbackIdentity.d1.counts, state.observedCounts)
  assert.notEqual(digest(recapture.rollbackIdentity), chain.candidate.rollbackTargetDigest)
  const reorderedCounts = structuredClone(secondObservation)
  reorderedCounts.state.observedCounts = { graphCount: 0, chunkCount: 4, documentCount: 3 }
  const reorderedRecapture = createSuccessfulReleaseRollbackRecapture({
    ...successfulInput,
    secondObservation: reorderedCounts,
  })
  assert.equal(JSON.stringify(reorderedRecapture), JSON.stringify(recapture))
  const changedSecondRead = structuredClone(secondObservation)
  changedSecondRead.state.readbackDigest = '8'.repeat(64)
  assert.throws(() => createSuccessfulReleaseRollbackRecapture({ ...successfulInput, secondObservation: changedSecondRead }), /provider observations changed between reads/)
  const pagesDrift = [structuredClone(firstObservation), structuredClone(secondObservation)]
  pagesDrift.forEach(value => { value.pages.identity.deploymentId = '22222222-2222-4222-8222-222222222222' })
  assert.throws(() => createSuccessfulReleaseRollbackRecapture({ ...successfulInput,
    firstObservation: pagesDrift[0], secondObservation: pagesDrift[1] }), /Pages deploymentId drifted/)
  const mirrorDrift = [structuredClone(firstObservation), structuredClone(secondObservation)]
  mirrorDrift.forEach(value => { value.mirror.revision = '4'.repeat(40) })
  assert.throws(() => createSuccessfulReleaseRollbackRecapture({ ...successfulInput,
    firstObservation: mirrorDrift[0], secondObservation: mirrorDrift[1] }), /mirror identity drifted/)
  assert.throws(() => createSuccessfulReleaseRollbackRecapture({ ...successfulInput,
    firstObservation: observation('2026-07-29T00:05:59.000Z', '2026-07-29T00:07:00.000Z', '2026-07-29T00:08:00.000Z') }), /predates publication/)
  assert.throws(() => createSuccessfulReleaseRollbackRecapture({ ...successfulInput,
    secondObservation: observation('2026-07-29T00:08:00.000Z', '2026-07-29T00:09:30.000Z', '2026-07-29T00:10:00.000Z') }), /must follow the first/)
  assert.throws(() => createSuccessfulReleaseRollbackRecapture({ ...successfulInput,
    assembledAt: '2026-07-29T00:17:00.000Z' }), /freshness window/)
  assert.throws(() => createSuccessfulReleaseRollbackRecapture({ ...successfulInput,
    assembledAt: '2026-07-29T00:09:59.000Z' }), /cannot follow assembledAt/)
  const invalidPagesObservation = structuredClone(firstObservation)
  invalidPagesObservation.pages.identity.deploymentId = 'not-a-cloudflare-uuid\nunsafe=true'
  assert.throws(() => createSuccessfulReleaseRollbackRecapture({
    ...successfulInput, firstObservation: invalidPagesObservation,
  }), /canonical UUID/)
  const cliRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'agenticgraph-successful-recapture-'))
  try {
    const write = (fileName, value) => {
      const filePath = path.join(cliRoot, fileName)
      fs.mkdirSync(path.dirname(filePath), { recursive: true })
      fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`)
      return filePath
    }
    const carrierPath = write('carrier.json', carrier)
    const inputPaths = Object.fromEntries([
      ['first-pages', firstObservation.pages], ['first-state', firstObservation.state], ['first-mirror', firstObservation.mirror],
      ['second-pages', secondObservation.pages], ['second-state', secondObservation.state], ['second-mirror', secondObservation.mirror],
    ].map(([name, value]) => [name, write(`${name}.json`, value)]))
    const output = path.join(cliRoot, 'recapture.json'), digestOutput = path.join(cliRoot, 'recapture-digest.txt')
    const docsSha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: docsRepositoryRoot, encoding: 'utf8' }).trim()
    const args = [path.join(repoRoot, 'scripts/production-release-lifecycle.mjs'), 'recapture-successful-release',
      '--docs-root', docsRoot, '--docs-sha', docsSha, '--carrier', carrierPath,
      '--first-pages-observation', inputPaths['first-pages'], '--first-state-evidence', inputPaths['first-state'],
      '--first-mirror-observation', inputPaths['first-mirror'], '--second-pages-observation', inputPaths['second-pages'],
      '--second-state-evidence', inputPaths['second-state'], '--second-mirror-observation', inputPaths['second-mirror'],
      '--assembled-at', assembledAt, '--output', output, '--digest-output', digestOutput]
    const run = () => JSON.parse(execFileSync(process.execPath, args, {
      cwd: repoRoot, encoding: 'utf8', env: { ...process.env, GITHUB_OUTPUT: '' },
    }))
    const created = run(), recaptureBytes = fs.readFileSync(output), digestBytes = fs.readFileSync(digestOutput)
    const replayed = run()
    assert.equal(created.outputWrite, 'created')
    assert.equal(created.digestWrite, 'created')
    assert.equal(replayed.outputWrite, 'replayed')
    assert.equal(replayed.digestWrite, 'replayed')
    assert.deepEqual(fs.readFileSync(output), recaptureBytes)
    assert.deepEqual(fs.readFileSync(digestOutput), digestBytes)
    assert.deepEqual(JSON.parse(String(recaptureBytes)), recapture)
    const githubOutput = path.join(cliRoot, 'github-output.txt')
    const githubRun = JSON.parse(execFileSync(process.execPath, [...args, '--github-output'], {
      cwd: repoRoot, encoding: 'utf8', env: { ...process.env, GITHUB_OUTPUT: githubOutput },
    }))
    assert.equal(githubRun.outputWrite, 'replayed')
    assert.equal(githubRun.digestWrite, 'replayed')
    assert.deepEqual(fs.readFileSync(githubOutput, 'utf8').trim().split('\n'), [
      `rollback_recapture_path=${output}`,
      `rollback_target_digest=${digest(recapture.rollbackIdentity)}`,
    ])
    assert.equal(fs.readdirSync(cliRoot).some(name => name.includes('.stage-')), false)
    const argsFor = (nextOutput, nextDigest) => [
      ...args.slice(0, -4), '--output', nextOutput, '--digest-output', nextDigest,
    ]
    const conflictOutput = path.join(cliRoot, 'conflict-recapture.json')
    const conflictDigest = path.join(cliRoot, 'conflict-digest.txt')
    fs.writeFileSync(conflictDigest, 'conflicting digest\n')
    assert.throws(() => execFileSync(process.execPath, argsFor(conflictOutput, conflictDigest), {
      cwd: repoRoot, encoding: 'utf8', env: { ...process.env, GITHUB_OUTPUT: '' },
    }), /replayed evidence differs/)
    assert.equal(fs.existsSync(conflictOutput), false)
    const noChannelOutput = path.join(cliRoot, 'no-channel-recapture.json')
    const noChannelDigest = path.join(cliRoot, 'no-channel-digest.txt')
    assert.throws(() => execFileSync(process.execPath, [
      ...argsFor(noChannelOutput, noChannelDigest), '--github-output',
    ], {
      cwd: repoRoot, encoding: 'utf8', env: { ...process.env, GITHUB_OUTPUT: '' },
    }), /GITHUB_OUTPUT is required/)
    assert.equal(fs.existsSync(noChannelOutput), false)
    assert.equal(fs.existsSync(noChannelDigest), false)
    const unsafeChannelOutput = path.join(cliRoot, 'unsafe-channel-recapture.json')
    const unsafeChannelDigest = path.join(cliRoot, 'unsafe-channel-digest.txt')
    assert.throws(() => execFileSync(process.execPath, [
      ...argsFor(unsafeChannelOutput, unsafeChannelDigest), '--github-output',
    ], {
      cwd: repoRoot, encoding: 'utf8', env: { ...process.env, GITHUB_OUTPUT: `${githubOutput}\nunsafe` },
    }), /GITHUB_OUTPUT path contains a line break/)
    assert.equal(fs.existsSync(unsafeChannelOutput), false)
    assert.equal(fs.existsSync(unsafeChannelDigest), false)
    const unsafeOutput = path.join(cliRoot, 'unsafe\ninjected=value.json')
    const unsafeDigest = path.join(cliRoot, 'unsafe-digest.txt')
    assert.throws(() => execFileSync(process.execPath, [
      ...argsFor(unsafeOutput, unsafeDigest), '--github-output',
    ], {
      cwd: repoRoot, encoding: 'utf8', env: { ...process.env, GITHUB_OUTPUT: githubOutput },
    }), /contains a line break/)
    assert.equal(fs.existsSync(unsafeOutput), false)
    assert.equal(fs.existsSync(unsafeDigest), false)
  } finally {
    fs.rmSync(cliRoot, { recursive: true, force: true })
  }
  const markerDigest = 'd'.repeat(64)
  const restoredTransports = {
    schema: 'agenticgraph-production-transport-evidence/v1', status: 'passed',
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
      routes: { apex: { status: 200, routeOwner: 'root-agent-ready-pages' }, app: { status: 200, routeOwner: 'agenticgraph-agent-ready-pages' } },
    })),
    verifiedAt: '2026-07-29T00:07:00.000Z',
  }
  const rollbackEvidence = {
    releaseEvidence: chain.releaseEvidence,
    restoredPages: {
      schema: 'agenticgraph-production-restored-pages-evidence/v1', status: 'restored',
      adapterId: 'cloudflare-pages/api-canonical-observation-v1',
      canonicalDeployment: { ...rollbackIdentity.pages, deployedAt: '2026-07-28T00:00:00.000Z' },
      capturedAt: '2026-07-29T00:06:30.000Z',
    },
    restoredState: {
      schema: 'agenticgraph-d1-state-snapshot/v1', workspaceId: 'workspace:default',
      readbackAdapterId: 'cloudflare-wrangler-d1-direct-readback/v1', readbackKind: 'direct-authoritative',
      stateContractDigest: rollbackIdentity.d1.stateContractDigest, readbackDigest: rollbackIdentity.d1.readbackDigest,
      observedCounts: rollbackIdentity.d1.counts, capturedAt: '2026-07-29T00:06:40.000Z',
    },
    restoredTransports,
    observedMirror: { schema: 'agenticgraph-production-observed-mirror-identity/v1', ...rollbackIdentity.mirror, sourceRevision: rollbackIdentity.pages.sourceRevision, observedAt: '2026-07-29T00:06:50.000Z' },
    rolledBackAt: '2026-07-29T00:08:00.000Z',
  }
  assert.throws(() => createLifecycleRollback({ contract, deployment, ...rollbackEvidence,
    restoredState: { ...rollbackEvidence.restoredState, readbackDigest: 'a'.repeat(64) },
    failureObservation: { schema: 'agenticgraph-production-release-failure-observation/v1', failedStage: 'deployment', messageDigest: 'b'.repeat(64), observedAt: '2026-07-29T00:06:00.000Z' } }), /state contract, readback, or counts drifted/)
  for (const [failedStage, prefixLength] of [['deployment', 9], ['state-reconciliation', 9], ['live-verification', 10], ['publication', 11], ['receipt-persistence', 11]]) {
    const rollback = createLifecycleRollback({ contract, deployment, ...rollbackEvidence, failureObservation: { schema: 'agenticgraph-production-release-failure-observation/v1', failedStage, messageDigest: 'b'.repeat(64), observedAt: '2026-07-29T00:06:00.000Z' } })
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
test('current mirror observation is read-only and does not require GitHub output', async () => {
  const cloudflareDeploymentId = '12345678-1234-4234-8234-123456789abc'
  assert.equal(normalizeCloudflarePagesDeploymentId(cloudflareDeploymentId), cloudflareDeploymentId)
  assert.throws(() => normalizeCloudflarePagesDeploymentId('unsafe\noutput=true'), /canonical UUID/)
  assert.throws(() => normalizeCloudflarePagesDeploymentId(`\n${cloudflareDeploymentId}`), /canonical UUID/)
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agenticgraph-current-mirror-'))
  const remote = path.join(root, 'remote.git'), checkout = path.join(root, 'checkout')
  const git = (args, cwd = checkout) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim()
  try {
    execFileSync('git', ['init', '--bare', '--initial-branch=main', remote], { encoding: 'utf8' })
    execFileSync('git', ['init', '--initial-branch=main', checkout], { encoding: 'utf8' })
    git(['config', 'user.name', 'Release Evidence Test'])
    git(['config', 'user.email', 'release-evidence@example.test'])
    fs.mkdirSync(path.join(checkout, '.well-known'), { recursive: true })
    fs.writeFileSync(path.join(checkout, '.well-known/runtime-readiness.json'), `${JSON.stringify({ source: { revision: sourceRevision } }, null, 2)}\n`)
    git(['add', '.well-known/runtime-readiness.json'])
    git(['commit', '-m', 'test: seed exact mirror identity'])
    git(['remote', 'add', 'origin', remote])
    git(['push', '--set-upstream', 'origin', 'main'])
    const refsBefore = git(['for-each-ref', '--format=%(refname):%(objectname)', 'refs/remotes'])
    const output = path.join(root, 'mirror.json')
    const observed = await observeMirror({
      repositoryRoot: checkout, repository: 'example/mirror', releaseEvidencePath: '', output, githubOutput: false,
    })
    assert.equal(observed.repository, 'example/mirror')
    assert.equal(observed.revision, git(['rev-parse', 'HEAD']))
    assert.equal(observed.sourceRevision, sourceRevision)
    assert.deepEqual(JSON.parse(fs.readFileSync(output, 'utf8')), observed)
    assert.equal(git(['for-each-ref', '--format=%(refname):%(objectname)', 'refs/remotes']), refsBefore)
    assert.equal(git(['status', '--porcelain=v1', '--untracked-files=all']), '')
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
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
