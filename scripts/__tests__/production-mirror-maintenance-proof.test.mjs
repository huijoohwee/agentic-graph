import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { prepareCanonicalDescendantMirrorRollbackInputs, assertSuccessfulReleaseMirrorIdentity } from '../production-mirror-artifact.mjs'
import { normalizeMirrorMaintenanceProof } from '../production-mirror-maintenance-proof.mjs'
import { digest } from '../lib/production-release-lifecycle-evidence.mjs'

const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_')))
const git = (root, ...args) => execFileSync('git', args, { cwd: root, env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
const write = async (root, name, body) => { await fs.mkdir(path.dirname(path.join(root, name)), { recursive: true }); await fs.writeFile(path.join(root, name), body) }
const fixture = async (t, changedPath = 'scripts/worktree-lifecycle-contract.test.mjs', symlink = false) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mirror-maintenance-'))
  t.after(() => fs.rm(root, { recursive: true, force: true }))
  git(root, 'init', '--quiet', '--initial-branch=main')
  git(root, 'config', 'user.name', 'Runtime Test'); git(root, 'config', 'user.email', 'runtime-test@example.com')
  git(root, 'config', 'core.hooksPath', '/dev/null'); git(root, 'config', 'core.excludesFile', '/dev/null')
  await write(root, 'content/agentic-graph/index.html', 'published bytes\n')
  await write(root, 'unrelated/retained.bin', 'other application\0bytes')
  await write(root, 'package.json', '{"private":true}\n')
  git(root, 'add', '.'); git(root, 'commit', '--quiet', '-m', 'base')
  const baseRevision = git(root, 'rev-parse', 'HEAD')
  if (symlink) { await fs.mkdir(path.dirname(path.join(root, changedPath)), { recursive: true }); await fs.symlink('../package.json', path.join(root, changedPath)) }
  else await write(root, changedPath, 'maintenance delta\n')
  git(root, 'add', '.'); git(root, 'commit', '--quiet', '-m', 'maintenance')
  const descendantRevision = git(root, 'rev-parse', 'HEAD')
  git(root, 'update-ref', 'refs/remotes/origin/main', descendantRevision)
  const repository = 'owner/mirror', mergedAt = '2026-09-14T00:01:00Z'
  const pr = { number: 7, url: `https://github.com/${repository}/pull/7`, state: 'MERGED', baseRefName: 'main', headRefName: 'agent/device/maintenance',
    headRefOid: descendantRevision, mergeCommit: { oid: descendantRevision }, mergedAt,
    statusCheckRollup: [{ name: 'Runtime Readiness Gate', status: 'COMPLETED', conclusion: 'SUCCESS',
      detailsUrl: `https://github.com/${repository}/actions/runs/1/job/2`, completedAt: '2026-09-14T00:00:30Z' }] }
  const pages = { deploymentId: 'deployment', deploymentOrigin: 'https://deployment.pages.dev', deploymentCommitRevision: 'a'.repeat(40), sourceRevision: 'a'.repeat(40) }
  const d1 = { stateContractDigest: 'b'.repeat(64), readbackDigest: 'c'.repeat(64), counts: { documentCount: 1, chunkCount: 1, graphCount: 0 } }
  const previous = { schema: 'agentic-graph-production-rollback-recapture/v1', capturedAt: '2026-09-13T00:00:00Z', rollbackIdentity: {
    schema: 'agentic-graph-production-rollback-identity/v1', pages, mirror: { repository, revision: baseRevision }, d1 } }
  const options = { 'mirror-maintenance': 'repository-metadata-only', 'previous-rollback-recapture': 'previous',
    'mirror-repository-root': root, 'mirror-remote-ref': 'refs/remotes/origin/main', 'mirror-protected-pr': 'pr' }
  const currentMirror = { repository, revision: descendantRevision }
  const prepare = () => prepareCanonicalDescendantMirrorRollbackInputs({ options, currentMirror, readJson: name => ({ previous, pr })[name] })
  const publication = { candidateDigest: 'd'.repeat(64), liveVerificationReceiptDigest: 'e'.repeat(64) }
  publication.publicationIdentitiesDigest = digest({ repository, revision: baseRevision, ...publication })
  const identity = { currentMirror, firstPagesCapturedAt: '2026-09-14T00:02:00Z', publication,
    integration: { sourceRevision: pages.sourceRevision }, deployment: { immutableDeploymentId: pages.deploymentId, immutableDeploymentOrigin: pages.deploymentOrigin },
    stateReceipt: { stateContractDigest: d1.stateContractDigest, readbackDigest: d1.readbackDigest, observedCounts: d1.counts } }
  return { root, baseRevision, descendantRevision, pr, previous, options, prepare, identity }
}

test('maintenance recapture preserves the whole remaining tree and terminal Pages/D1 binding', async t => {
  const f = await fixture(t), inputs = await f.prepare(), proof = inputs.mirrorDescendantProof
  assert.deepEqual(proof.changedPaths, ['scripts/worktree-lifecycle-contract.test.mjs'])
  assert.equal(proof.unchangedEntryCount, 3)
  assert.notEqual(proof.baseTree, proof.descendantTree)
  assert.doesNotThrow(() => assertSuccessfulReleaseMirrorIdentity({ ...f.identity, ...inputs }))
  assert.throws(() => assertSuccessfulReleaseMirrorIdentity(f.identity), /mirror identity drifted/)
  for (const change of [
    input => { input.previousRollbackRecapture.rollbackIdentity.pages.sourceRevision = 'f'.repeat(40) },
    input => { input.previousRollbackRecapture.rollbackIdentity.d1.readbackDigest = 'f'.repeat(64) },
    input => { input.previousRollbackRecapture.rollbackIdentity.mirror.revision = 'f'.repeat(40) },
    input => { input.previousRollbackRecapture.capturedAt = '2026-09-15T00:00:00Z' },
  ]) {
    const input = structuredClone(inputs); change(input)
    assert.throws(() => assertSuccessfulReleaseMirrorIdentity({ ...f.identity, ...input }))
  }
  assert.throws(() => assertSuccessfulReleaseMirrorIdentity({ ...f.identity, ...inputs, firstPagesCapturedAt: '2026-09-14T00:00:45Z' }), /not merged before/)
  const exact = { ...f.identity, currentMirror: { ...f.identity.currentMirror, revision: f.baseRevision } }
  assert.throws(() => assertSuccessfulReleaseMirrorIdentity({ ...exact, ...inputs }), /not applicable/)
})

for (const name of ['content/agentic-graph/index.html', 'unrelated/retained.bin', 'functions/auth.mjs']) {
  test(`rejects publication or unclassified change: ${name}`, async t => {
    const f = await fixture(t, name)
    await assert.rejects(f.prepare, /non-maintenance path/)
  })
}
test('rejects symlinks in admitted maintenance paths', async t => {
  const f = await fixture(t, 'scripts/link.mjs', true)
  await assert.rejects(f.prepare, /non-regular/)
})
test('rejects dirty checkout and stale remote', async t => {
  const f = await fixture(t)
  await write(f.root, 'untracked', 'preserve me')
  await assert.rejects(f.prepare, /clean/)
  await fs.unlink(path.join(f.root, 'untracked'))
  git(f.root, 'update-ref', 'refs/remotes/origin/main', f.baseRevision)
  await assert.rejects(f.prepare, /remote main must be exact/)
})
test('rejects missing, failed, duplicate, late or unrelated protected check', async t => {
  const f = await fixture(t), original = structuredClone(f.pr.statusCheckRollup)
  for (const checks of [[], [...original, ...original], [{ ...original[0], conclusion: 'FAILURE' }],
    [{ ...original[0], completedAt: '2026-09-15T00:00:00Z' }], [{ ...original[0], detailsUrl: 'https://example.com/check' }]]) {
    f.pr.statusCheckRollup = checks
    await assert.rejects(f.prepare, /protected check/)
  }
})
test('rejects unreviewed tree and non-direct successor', async t => {
  const f = await fixture(t)
  f.pr.headRefOid = f.baseRevision
  await assert.rejects(f.prepare, /pull request tree drifted/)
  f.pr.headRefOid = f.descendantRevision
  git(f.root, 'commit', '--quiet', '--allow-empty', '-m', 'unrelated intervening commit')
  const next = git(f.root, 'rev-parse', 'HEAD')
  git(f.root, 'update-ref', 'refs/remotes/origin/main', next)
  f.identity.currentMirror.revision = next; f.pr.mergeCommit.oid = next; f.pr.headRefOid = next
  await assert.rejects(f.prepare, /direct protected squash successor/)
})
test('rejects ambiguous mode and proof tampering even with a recomputed digest', async t => {
  const f = await fixture(t), { mirrorDescendantProof: proof } = await f.prepare()
  f.options['gamexr-source-sha'] = 'a'.repeat(40)
  await assert.rejects(f.prepare, /exclusive/)
  for (const change of [value => { value.changedPaths = ['_worker.js'] }, value => { value.unchangedEntryCount = 0 },
    value => { value.extra = true }, value => { value.changedPaths = ['docs/../_worker.js'] },
    value => { value.changedPaths = Array.from({ length: 65 }, (_, i) => `docs/${i}.md`).sort() }, value => { value.protectedPullRequest.mergeRevision = f.baseRevision }]) {
    const value = structuredClone(proof); change(value)
    const { proofDigest: _, ...core } = value; value.proofDigest = digest(core)
    assert.throws(() => normalizeMirrorMaintenanceProof(value, { digestValue: digest, isExcluded: () => false }))
  }
})
