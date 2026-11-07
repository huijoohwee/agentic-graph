import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { retainProductionRelease, retentionInventory, selectRetentionArtifacts } from '../production-release-retention.mjs'

const sourceRevision = 'a'.repeat(40), runId = '42', repository = 'owner/repo'
const roles = ['production-lifecycle-complete', 'production-release-evidence', 'production-release-raw']
const run = { id: 42, run_attempt: 1, head_sha: sourceRevision, path: '.github/workflows/release.yml',
  event: 'workflow_dispatch', head_branch: 'main', status: 'completed', conclusion: 'success' }
const inventory = { total_count: 3, artifacts: roles.map((role, index) => ({ id: index + 1,
  name: `${role}-${sourceRevision}-${runId}`, expired: false, size_in_bytes: 100,
  workflow_run: { id: 42, head_sha: sourceRevision } })) }
const deployment = { schema: 'agentic-deployment-receipt/v1', immutableDeploymentId: 'pages-id', immutableDeploymentOrigin: 'https://pages.test' }
// The native schema/constructor validator is supplied by the existing CLI owner;
// these tests isolate provider/file boundaries and require it to run on replay.
const carrier = { completion: 'production-complete', receipts: [
  { schema: 'agentic-integration-receipt/v2', sourceRevision }, deployment,
] }
const recapture = { schema: 'agentic-graph-production-rollback-recapture/v1', rollbackIdentity: { pages: {
  sourceRevision, deploymentId: deployment.immutableDeploymentId, deploymentOrigin: deployment.immutableDeploymentOrigin,
} } }
const save = (file, value) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(value)) }
function fixture(t, options = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'release-retention-test-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  let downloads = 0, validations = 0, reads = 0
  const gh = args => {
    if (args[0] === 'api') {
      reads++
      const value = args[1].includes('/artifacts') ? structuredClone(inventory) : structuredClone(run)
      if (options.drift && reads > 2 && value.artifacts) value.artifacts[0].id = 99
      return JSON.stringify(value)
    }
    downloads++
    const directory = args[args.indexOf('--dir') + 1]
    if (options.failDownload && downloads === 2) throw new Error('provider download unavailable')
    if (directory.endsWith(roles[0])) save(path.join(directory, 'collaborative-release-lifecycle-v2.json'), carrier)
    else if (directory.endsWith(roles[1])) save(path.join(directory, 'current-production-rollback-recapture.json'), options.badRollback ? { ...recapture, rollbackIdentity: { pages: { ...recapture.rollbackIdentity.pages, sourceRevision: 'b'.repeat(40) } } } : recapture)
    else save(path.join(directory, 'production-lifecycle/collaborative-release-lifecycle-v2.json'), carrier)
    return ''
  }
  const args = { repository, runId, sourceRevision, outputDir: path.join(root, 'retained'), gh,
    validateCarrier: value => { validations++; assert.deepEqual(value, carrier); if (options.rejectCarrier) throw new Error('invalid native carrier') } }
  return { root, args, counts: () => ({ downloads, validations }) }
}

test('retains exact evidence and replay revalidates unchanged bytes without downloading again', t => {
  const f = fixture(t)
  assert.equal(retainProductionRelease(f.args).disposition, 'created')
  assert.equal(retainProductionRelease(f.args).disposition, 'replayed')
  assert.deepEqual(f.counts(), { downloads: 3, validations: 2 })
  const receipt = JSON.parse(fs.readFileSync(path.join(f.args.outputDir, 'retention.json')))
  assert.equal(receipt.authorizesEffects, false)
  assert.equal(receipt.files.length, 5)
  assert.equal(fs.statSync(f.args.outputDir).mode & 0o777, 0o700)
})

test('rejects failed, wrong-source, incomplete, duplicate, expired and oversized artifacts', () => {
  for (const mutate of [
    (r, i) => { r.conclusion = 'failure' }, (r, i) => { r.head_sha = 'b'.repeat(40) },
    (r, i) => { i.total_count++ }, (r, i) => { i.artifacts[1] = i.artifacts[0] },
    (r, i) => { i.artifacts[0].expired = true }, (r, i) => { i.artifacts[0].size_in_bytes = 33 * 1024 * 1024 },
    (r, i) => { i.artifacts[0].workflow_run.id = 43 },
  ]) {
    const r = structuredClone(run), i = structuredClone(inventory); mutate(r, i)
    assert.throws(() => selectRetentionArtifacts(r, i, sourceRevision, runId))
  }
})

for (const option of ['failDownload', 'drift', 'rejectCarrier', 'badRollback']) {
  test(`${option} preserves partial evidence without publishing success`, t => {
    const f = fixture(t, { [option]: true })
    assert.throws(() => retainProductionRelease(f.args), /preserved partial evidence/)
    assert.equal(fs.existsSync(f.args.outputDir), false)
    const partial = fs.readdirSync(f.root).find(name => name.includes('.partial-'))
    assert.ok(partial)
    assert.equal(fs.existsSync(path.join(f.root, partial, 'retention.json')), false)
  })
}

test('rejects changed files and untracked additions on replay', t => {
  const f = fixture(t); retainProductionRelease(f.args)
  fs.writeFileSync(path.join(f.args.outputDir, 'unexpected.txt'), 'new bytes')
  assert.throws(() => retainProductionRelease(f.args), /retained evidence changed/)
})

test('refuses symlinks and existing unrelated destinations', t => {
  const f = fixture(t)
  fs.mkdirSync(f.args.outputDir); fs.symlinkSync('/etc/passwd', path.join(f.args.outputDir, 'link'))
  assert.throws(() => retentionInventory(f.args.outputDir), /symlinks/)
  assert.throws(() => retainProductionRelease(f.args))
  assert.ok(fs.lstatSync(path.join(f.args.outputDir, 'link')).isSymbolicLink())
})


test('bounds empty directory nesting before reading evidence', t => {
  const f = fixture(t)
  fs.mkdirSync(path.join(f.args.outputDir, ...Array(33).fill('nested')), { recursive: true })
  assert.throws(() => retentionInventory(f.args.outputDir), /directory depth bound/)
})
