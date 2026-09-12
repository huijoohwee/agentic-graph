import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { collectNativeReleaseFrontier, materializeNativeFrontierReleaseEvidence,
  NATIVE_FRONTIER_ADAPTER, NATIVE_PRESERVATION_IDENTITY, validateNativePreservationIdentity } from '../native-release-frontier.mjs'
import { normalizeReleaseEvidence, releaseInventoryDigest } from '../lib/production-release-lifecycle-evidence.mjs'
import { createLifecycleCandidate, digest } from '../production-release-lifecycle.mjs'
import * as contract from '../production-release-lifecycle-contract.mjs'

const command = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
const fixture = t => {
  const temporary = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'native-frontier-test-')))
  t.after(() => fs.rmSync(temporary, { recursive: true, force: true }))
  const root = path.join(temporary, 'repo'), remote = path.join(temporary, 'remote.git')
  fs.mkdirSync(root)
  command(temporary, 'init', '--bare', remote)
  command(root, 'init', '-b', 'main')
  command(root, 'config', 'user.email', 'fixture@example.invalid')
  command(root, 'config', 'user.name', 'Frontier fixture')
  fs.writeFileSync(path.join(root, 'source.txt'), 'committed source\n')
  fs.writeFileSync(path.join(root, '.gitignore'), 'node_modules/\n*.tmp\n')
  command(root, 'add', '.')
  command(root, 'commit', '-m', 'fixture')
  command(root, 'remote', 'add', 'origin', remote)
  command(root, 'push', '-u', 'origin', 'main')
  const sourceRevision = command(root, 'rev-parse', 'HEAD'), sourceTree = command(root, 'rev-parse', 'HEAD^{tree}')
  const attached = path.join(temporary, 'attached'), detached = path.join(temporary, 'detached')
  command(root, 'worktree', 'add', '-b', 'agent/device/attached', attached, 'HEAD')
  command(root, 'worktree', 'add', '--detach', detached, 'HEAD')
  const records = [attached, detached].map((worktree, index) => ({
    worktree, ref: `agent/device/${index ? 'detached' : 'attached'}`, device: 'device',
    scope: index ? 'detached' : 'attached', head: sourceRevision, state: 'published',
  }))
  return { root, remote, attached, detached, records, sourceRevision, sourceTree,
    options: { repository: root, sourceRevision, sourceTree, readMetadata: () => structuredClone(records) } }
}
const rollbackBytes = Buffer.from(JSON.stringify({
  schema: 'agentic-graph-production-rollback-recapture/v1', capturedAt: '2026-01-01T00:00:00.000Z',
  rollbackIdentity: { schema: 'agentic-graph-production-rollback-identity/v1',
    pages: { deploymentId: 'previous', deploymentOrigin: 'https://previous.pages.dev',
      deploymentCommitRevision: 'a'.repeat(40), sourceRevision: 'a'.repeat(40) },
    mirror: { repository: 'huijoohwee/huijoohwee', revision: 'b'.repeat(40) },
    d1: { stateContractDigest: 'c'.repeat(64), readbackDigest: 'd'.repeat(64),
      counts: { documentCount: 2, chunkCount: 0, graphCount: 0 } } },
}))

test('native frontier retains exact dirty, untracked and symlink bytes including detached worktrees', async t => {
  const f = fixture(t)
  fs.writeFileSync(path.join(f.attached, 'source.txt'), Buffer.from([0, 1, 2, 255]))
  fs.writeFileSync(path.join(f.attached, 'draft.md'), 'uncommitted draft')
  fs.symlinkSync('draft.md', path.join(f.attached, 'draft-link'))
  fs.writeFileSync(path.join(f.detached, 'kept.md'), 'detached work')
  fs.writeFileSync(path.join(f.attached, 'runtime.tmp'), 'ignored runtime')
  const indexFile = command(f.attached, 'rev-parse', '--path-format=absolute', '--git-path', 'index')
  const indexBefore = fs.readFileSync(indexFile)
  const { frontier, evidence } = await materializeNativeFrontierReleaseEvidence({ ...f.options, rollbackBytes })
  assert.equal(frontier.lanes.length, 3)
  assert.equal(evidence.entries.length, 2)
  assert.equal(evidence.observations.length, 2)
  assert.equal(evidence.captureAdapterId, NATIVE_FRONTIER_ADAPTER)
  const lane = frontier.lanes.find(lane => lane.path === f.attached)
  assert.equal(lane.dirty, true)
  assert.deepEqual(lane.writeSet.paths, ['draft-link', 'draft.md', 'source.txt'])
  assert.equal(lane.content.find(file => file.path === 'source.txt').bytes, 4)
  assert.equal(lane.content.find(file => file.path === 'draft-link').kind, 'symlink')
  assert.ok(!lane.content.some(file => file.path === 'runtime.tmp'))
  assert.equal(frontier.lanes.find(lane => lane.path === f.detached).collaboration.branchRef, null)
  assert.ok(evidence.entries.every(entry => entry.collaboration.authorizesEffects === false))
  assert.ok(evidence.entries.every(entry => !Object.hasOwn(entry.collaboration, 'leaseEpoch')))
  assert.deepEqual(fs.readFileSync(indexFile), indexBefore)
  assert.deepEqual(normalizeReleaseEvidence(evidence), evidence)
})

test('missing, ambiguous, stale and mismatched metadata fail closed', t => {
  const f = fixture(t), original = structuredClone(f.records)
  for (const change of [
    records => records.splice(0, 1),
    records => records.push(structuredClone(records[0])),
    records => { records[0].head = 'e'.repeat(40) },
    records => { records[0].ref = 'agent/device/someone-else' },
    records => { delete records[1].head },
    records => { records[0].device = '' },
  ]) {
    const records = structuredClone(original); change(records)
    assert.throws(() => collectNativeReleaseFrontier({ ...f.options, readMetadata: () => records }),
      /metadata|attribution/)
  }
})

test('content, index, metadata and registered worktree movement invalidate capture', t => {
  const changes = [
    f => fs.writeFileSync(path.join(f.attached, 'source.txt'), 'moved bytes'),
    f => { fs.writeFileSync(path.join(f.attached, 'staged.md'), 'new'); command(f.attached, 'add', 'staged.md') },
    f => { f.records[0].scope = 'changed attribution' },
    f => command(f.root, 'worktree', 'remove', f.detached),
    f => { fs.symlinkSync('source.txt', path.join(f.attached, 'alias')) },
  ]
  for (const change of changes) {
    const f = fixture(t)
    assert.throws(() => collectNativeReleaseFrontier({ ...f.options,
      betweenObservations: () => change(f) }), /changed during capture/)
  }
})

test('dirty canonical source, hidden tracked state and symlink parents are rejected', t => {
  const f = fixture(t)
  fs.writeFileSync(path.join(f.root, 'source.txt'), 'dirty canonical')
  assert.throws(() => collectNativeReleaseFrontier(f.options), /canonical source must be clean/)
  command(f.root, 'restore', 'source.txt')
  command(f.attached, 'update-index', '--assume-unchanged', 'source.txt')
  assert.throws(() => collectNativeReleaseFrontier(f.options), /hidden or unsupported/)
  command(f.attached, 'update-index', '--no-assume-unchanged', 'source.txt')
  fs.mkdirSync(path.join(f.attached, 'directory'))
  fs.writeFileSync(path.join(f.attached, 'directory', 'source'), 'inside')
  command(f.attached, 'add', 'directory/source')
  fs.rmSync(path.join(f.attached, 'directory'), { recursive: true })
  fs.symlinkSync(f.detached, path.join(f.attached, 'directory'))
  assert.throws(() => collectNativeReleaseFrontier(f.options), /symlink or non-directory parent/)
})

test('native identity admits no fabricated grant or legacy identity fields', async t => {
  const f = fixture(t)
  const { evidence } = await materializeNativeFrontierReleaseEvidence({ ...f.options, rollbackBytes })
  const identity = evidence.entries[0].collaboration
  assert.equal(identity.schema, NATIVE_PRESERVATION_IDENTITY)
  for (const change of [{ authorizesEffects: true }, { leaseEpoch: 1 }, { sessionId: 'invented' },
    { branchRef: 'refs/heads/unrelated' }, { headRevision: 'not-a-commit' }]) {
    assert.throws(() => validateNativePreservationIdentity({ ...identity, ...change }))
  }
  const relabelled = { ...evidence, captureAdapterId: 'agentic-graph-current-release-frontier-materializer/v1' }
  relabelled.inventoryDigest = releaseInventoryDigest(relabelled)
  assert.throws(() => normalizeReleaseEvidence(relabelled), /requires its native capture adapter/)
})


test('staged-deleted HEAD files retain their bytes even when ignored after removal', t => {
  const f = fixture(t)
  fs.writeFileSync(path.join(f.attached, '.gitignore'), 'source.txt\n')
  command(f.attached, 'rm', '--cached', 'source.txt')
  const captured = collectNativeReleaseFrontier(f.options)
  assert.ok(captured.lanes.find(lane => lane.path === f.attached).content.some(file => file.path === 'source.txt'))
  assert.throws(() => collectNativeReleaseFrontier({ ...f.options,
    betweenObservations: () => fs.writeFileSync(path.join(f.attached, 'source.txt'), 'retained bytes changed') }),
  /changed during capture/)
})

test('a linked main checkout cannot substitute for the primary canonical owner', t => {
  const f = fixture(t)
  command(f.root, 'switch', '-c', 'temporary-canonical-hold')
  command(f.attached, 'switch', 'main')
  assert.throws(() => collectNativeReleaseFrontier({ ...f.options, repository: f.attached }),
    /primary canonical worktree/)
})

test('symlink targets are retained as text without observing external target bytes', t => {
  const f = fixture(t), external = path.join(path.dirname(f.root), 'external.txt')
  fs.writeFileSync(external, 'outside source')
  fs.symlinkSync(external, path.join(f.attached, 'external-link'))
  assert.doesNotThrow(() => collectNativeReleaseFrontier({ ...f.options,
    betweenObservations: () => fs.writeFileSync(external, 'outside bytes may change') }))
})


test('ancestor replacement during a leaf observation fails before external bytes are accepted', t => {
  const f = fixture(t), parent = path.join(f.attached, 'parent'), moved = path.join(f.attached, 'moved-parent')
  const outside = path.join(path.dirname(f.root), 'outside')
  fs.mkdirSync(parent); fs.mkdirSync(outside)
  fs.writeFileSync(path.join(parent, 'leaf'), 'inside')
  fs.writeFileSync(path.join(outside, 'leaf'), 'outside')
  command(f.attached, 'add', 'parent/leaf')
  const realLstat = fs.lstatSync
  let swapped = false
  fs.lstatSync = function (file, ...args) {
    const result = realLstat.call(this, file, ...args)
    if (!swapped && String(file) === parent) {
      swapped = true
      fs.renameSync(parent, moved)
      fs.symlinkSync(outside, parent)
    }
    return result
  }
  try {
    assert.throws(() => collectNativeReleaseFrontier(f.options), /direct directory|changed|resolves elsewhere/)
    assert.equal(swapped, true)
  } finally { fs.lstatSync = realLstat }
})

const candidateFixture = () => {
  const sourceRevision = 'a'.repeat(40), sourceTree = 'b'.repeat(40), docsRevision = 'c'.repeat(40), docsTree = 'd'.repeat(40)
  const rollbackIdentity = JSON.parse(rollbackBytes).rollbackIdentity
  const native = { schema: NATIVE_PRESERVATION_IDENTITY, repository: 'huijoohwee/agentic-graph',
    worktreePath: '/workspace/retained', branchRef: null, headRevision: sourceRevision,
    laneRef: 'agent/device/retained', deviceId: 'device', scopeId: 'retained',
    metadataDigest: '7'.repeat(64), authorizesEffects: false }
  const collaboration = { actorId: 'github:user:1', deviceId: 'github-hosted:linux',
    sessionId: 'github-actions:1:1', worktreeId: 'github-workspace:1:verify', branchId: 'refs/heads/main',
    scopeId: 'production-release', leaseEpoch: 1, fenceRevision: sourceRevision }
  const entry = { collaboration: native, writeSetDigest: '1'.repeat(64), stateDigest: '2'.repeat(64),
    recoveryHandle: 'retained-git-worktree:v1:fixture', preservationMode: 'active-lane', overlapClass: 'overlapping' }
  const frontier = { schema: 'agentic-graph-production-release-evidence/v1', repository: 'huijoohwee/agentic-graph',
    sourceRevision, protectedTipDigest: digest({ sourceRevision, sourceTree }),
    convergenceBaseDigest: digest({ sourceRevision, sourceTree, ref: 'refs/heads/main' }),
    captureAdapterId: NATIVE_FRONTIER_ADAPTER, capturedAt: '2026-01-01T00:00:00.000Z',
    observedAt: '2026-01-01T00:00:30.000Z', inventoryDigest: '0'.repeat(64), successorWriteSetDigest: '5'.repeat(64),
    entries: [entry], observations: [{ collaboration: native, stateDigest: entry.stateDigest,
      recoveryHandle: entry.recoveryHandle, disposition: 'retained' }], rollbackIdentity,
    rollbackCapturedAt: '2026-01-01T00:00:00.000Z', rollbackTargetDigest: digest(rollbackIdentity),
    sourceEvidenceRefs: [{ kind: 'test-fixture', digest: '6'.repeat(64) }] }
  frontier.inventoryDigest = releaseInventoryDigest(frontier)
  const localEvidence = { schema: 'agentic-local-review-candidate/v1', status: 'review-ready',
    source: { repository: 'huijoohwee/agentic-graph', revision: sourceRevision, tree: sourceTree },
    agenticCanvasOs: { repository: 'huijoohwee/agentic-canvas-os', revision: docsRevision, tree: docsTree },
    catalogRevision: docsRevision, runtimeEvidenceDigest: '1'.repeat(64) }
  const localReview = { ...localEvidence, candidateDigest: digest(localEvidence) }
  const readiness = { source: localReview.source, agenticCanvasOs: localReview.agenticCanvasOs,
    artifact: { algorithm: 'sha256', digest: '2'.repeat(64) }, immutableManifest: { algorithm: 'sha256', digest: '3'.repeat(64) } }
  const buildCandidate = (overrides = {}) => createLifecycleCandidate({
    contract, localReview, readiness, sourceRevision, sourceTree, agenticCanvasOsRevision: docsRevision,
    agenticCanvasOsTree: docsTree, guidelineRevision: 'e'.repeat(40), mirrorRevision: rollbackIdentity.mirror.revision,
    collaboration, integratedAt: '2026-01-01T00:00:40.000Z', issuedAt: '2026-01-01T00:01:00.000Z',
    targetId: 'airvio.co/agentic-graph', releaseEvidence: frontier, ...overrides,
  })
  return { native, collaboration, entry, frontier, buildCandidate, result: buildCandidate() }
}

test('native preservation identity cannot become integration or deployment authority', () => {
  const { native, collaboration, entry, result } = candidateFixture()
  const preservation = contract.createOverlapPreservationReceipt({
    convergenceBaseDigest: result.preservation.convergenceBaseDigest, protectedTipDigest: result.preservation.protectedTipDigest,
    captureAdapterId: NATIVE_FRONTIER_ADAPTER, entries: [entry, { ...entry, collaboration }],
    capturedAt: result.preservation.capturedAt,
  })
  const disposition = contract.createOverlapDispositionReceipt(preservation, {
    preservationReceiptDigest: preservation.receiptDigest, convergenceBaseDigest: preservation.convergenceBaseDigest,
    protectedTipDigest: preservation.protectedTipDigest, observedAt: result.disposition.observedAt,
    observations: preservation.entries.map(({ collaboration, stateDigest, recoveryHandle }) =>
      ({ collaboration, stateDigest, recoveryHandle, disposition: 'retained' })),
  })
  const integrationInput = Object.fromEntries([
    'sourceRevision', 'sourceDigest', 'dependencyClosureDigest', 'checksDigest', 'evaluatorId',
    'collaboration', 'integrationTargetDigest', 'integratedAt',
  ].map(key => [key, result.integration[key]]))
  assert.throws(() => contract.createIntegrationReceipt(preservation, disposition,
    { ...integrationInput, collaboration: native }), /collaboration identity/)
  assert.doesNotThrow(() => contract.createIntegrationReceipt(preservation, disposition, integrationInput))
  const interaction = contract.createAuthorizationInteractionReceipt(result.candidate, {
    humanActorId: 'operator:fixture', interactionAdapterId: 'interaction:fixture', transportClass: 'interactive-reference-transport',
    browserRequired: false, challengeDigest: '6'.repeat(64), responseDigest: '7'.repeat(64), recordedAt: '2026-01-01T00:02:00.000Z',
  })
  const authorization = contract.createHumanAuthorizationReceipt(result.candidate, interaction, {
    decisionKind: 'human', humanActorId: 'operator:fixture', decisionRef: 'decision:fixture', authorityAdapterId: 'authority:fixture',
    issuedAt: '2026-01-01T00:02:00.000Z', expiresAt: '2026-01-01T00:30:00.000Z',
  })
  const consumed = contract.consumeHumanAuthorizationReceipt(authorization, {
    consumedAt: '2026-01-01T00:03:00.000Z', controllerId: 'controller:fixture',
  })
  const deploymentInput = { deploymentAdapterId: 'deployment:fixture', deployedArtifactDigest: result.candidate.artifactDigest,
    immutableDeploymentId: 'deployment:fixture', immutableDeploymentOrigin: 'origin:fixture',
    rollbackTargetDigest: result.candidate.rollbackTargetDigest, deployedAt: '2026-01-01T00:03:00.000Z' }
  assert.doesNotThrow(() => contract.createDeploymentReceipt(result.candidate, consumed, deploymentInput))
  assert.throws(() => contract.createDeploymentReceipt(result.candidate, native, deploymentInput))
  assert.throws(() => contract.createDeploymentReceipt(native, consumed, deploymentInput))
  assert.throws(() => contract.createHumanAuthorizationReceipt(result.candidate, native, {}))
})

test('native preservation passes candidate and preservation schemas without becoming integration authority', () => {
  const { native, collaboration, entry, buildCandidate, result } = candidateFixture()
  assert.deepEqual(result.preservation.entries[0].collaboration, native)
  assert.deepEqual(result.integration.collaboration, collaboration)
  const ajvModule = createRequire(import.meta.url)('ajv/dist/2020.js'), Ajv2020 = ajvModule.default || ajvModule
  const ajv = new Ajv2020({ strict: false, validateFormats: false })
  const schema = JSON.parse(fs.readFileSync(new URL('../../contracts/production-release-lifecycle.v1.schema.json', import.meta.url)))
  ajv.addSchema(schema)
  const validate = ajv.compile({ $ref: `${schema.$id}#/$defs/overlapPreservationReceipt` })
  assert.equal(validate(result.preservation), true, JSON.stringify(validate.errors))
  const validateIntegration = ajv.compile({ $ref: `${schema.$id}#/$defs/integrationReceipt` })
  assert.equal(validateIntegration({ ...result.integration, collaboration: native }), false)
  assert.throws(() => buildCandidate({ collaboration: native }), /collaboration identity/)
  assert.equal(validate({ ...result.preservation,
    entries: [{ ...entry, collaboration: { ...native, authorizesEffects: true } }] }), false)
})
