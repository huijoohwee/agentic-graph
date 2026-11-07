import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

const hash = bytes => createHash('sha256').update(bytes).digest('hex')
const json = file => JSON.parse(fs.readFileSync(file, 'utf8'))
const write = (file, value) => fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx', mode: 0o600 })
const ghCommand = args => execFileSync('gh', args, { encoding: 'utf8', timeout: 120_000, maxBuffer: 2 * 1024 * 1024 })
const roles = ['production-lifecycle-complete', 'production-release-evidence', 'production-release-raw']

export function selectRetentionArtifacts(run, inventory, sourceRevision, runId) {
  assert.match(sourceRevision, /^[a-f0-9]{40}$/)
  assert.equal(String(run.id), String(runId), 'run identity differs')
  assert.equal(run.head_sha, sourceRevision, 'source revision differs')
  assert.equal(run.path, '.github/workflows/release.yml')
  assert.equal(run.event, 'workflow_dispatch')
  assert.equal(run.head_branch, 'main')
  assert.equal(run.status, 'completed')
  assert.equal(run.conclusion, 'success', 'only successful terminal releases can be retained by this operation')
  assert.ok(Number.isSafeInteger(run.run_attempt) && run.run_attempt > 0)
  assert.equal(inventory.total_count, inventory.artifacts?.length, 'artifact inventory is incomplete')
  assert.ok(inventory.total_count <= 100, 'artifact inventory exceeds its bound')
  const selected = roles.map(role => {
    const name = `${role}-${sourceRevision}-${runId}`
    const matches = inventory.artifacts.filter(item => item.name === name)
    assert.equal(matches.length, 1, `one exact artifact is required: ${name}`)
    const artifact = matches[0]
    assert.equal(artifact.expired, false, `artifact expired: ${name}`)
    assert.ok(Number.isSafeInteger(artifact.id) && artifact.id > 0)
    assert.ok(Number.isSafeInteger(artifact.size_in_bytes) && artifact.size_in_bytes > 0)
    assert.equal(artifact.workflow_run?.id, run.id, 'artifact run differs')
    assert.equal(artifact.workflow_run?.head_sha, sourceRevision, 'artifact source differs')
    return { role, ...artifact }
  })
  assert.ok(selected.reduce((sum, item) => sum + item.size_in_bytes, 0) <= 32 * 1024 * 1024, 'compressed evidence exceeds 32 MiB')
  return selected
}

export function retentionInventory(root) {
  const files = []
  let bytes = 0, entries = 0
  const visit = (directory, depth = 0) => {
    assert.ok(depth <= 32, 'retained evidence exceeds directory depth bound')
    for (const entry of fs.readdirSync(directory).sort()) {
      assert.ok(++entries <= 4096, 'retained evidence exceeds entry bound')
      const file = path.join(directory, entry), stat = fs.lstatSync(file)
      assert.ok(!stat.isSymbolicLink(), 'retained evidence must not contain symlinks')
      if (stat.isDirectory()) { visit(file, depth + 1); continue }
      assert.ok(stat.isFile(), 'retained evidence must contain regular files only')
      const relative = path.relative(root, file).split(path.sep).join('/')
      if (relative === 'retention.json') continue
      assert.ok(stat.size <= 8 * 1024 * 1024, 'retained file exceeds 8 MiB')
      bytes += stat.size
      assert.ok(bytes <= 64 * 1024 * 1024 && files.length < 2048, 'retained evidence exceeds its bound')
      files.push({ path: relative, bytes: stat.size, sha256: hash(fs.readFileSync(file)) })
    }
  }
  assert.ok(fs.lstatSync(root).isDirectory() && !fs.lstatSync(root).isSymbolicLink())
  visit(root)
  return files
}

function verifyEvidence(root, sourceRevision, validateCarrier) {
  const lifecycle = path.join(root, roles[0])
  const carrier = json(path.join(lifecycle, 'collaborative-release-lifecycle-v2.json'))
  validateCarrier(carrier)
  assert.equal(carrier.completion, 'production-complete')
  const integration = carrier.receipts.find(item => item.schema === 'agentic-integration-receipt/v2')
  assert.equal(integration?.sourceRevision, sourceRevision, 'carrier source differs')
  const deployment = carrier.receipts.find(item => item.schema === 'agentic-deployment-receipt/v1')
  const recapture = json(path.join(root, roles[1], 'current-production-rollback-recapture.json'))
  assert.equal(recapture.schema, 'agentic-graph-production-rollback-recapture/v1')
  assert.equal(recapture.rollbackIdentity?.pages?.sourceRevision, sourceRevision, 'rollback source differs')
  assert.equal(recapture.rollbackIdentity.pages.deploymentId, deployment?.immutableDeploymentId, 'rollback deployment differs')
  assert.equal(recapture.rollbackIdentity.pages.deploymentOrigin, deployment?.immutableDeploymentOrigin, 'rollback origin differs')
  const rawCarrier = fs.readFileSync(path.join(root, roles[2], 'production-lifecycle', 'collaborative-release-lifecycle-v2.json'))
  assert.ok(rawCarrier.equals(fs.readFileSync(path.join(lifecycle, 'collaborative-release-lifecycle-v2.json'))), 'terminal carrier copies differ')
  return hash(rawCarrier)
}

// Read-only GitHub adapter for the lifecycle owner. It grants no release or
// production authority and never replaces the downloaded provider receipts.
export function retainProductionRelease({ repository, runId, sourceRevision, outputDir, validateCarrier, gh = ghCommand, now = () => new Date() }) {
  assert.match(repository, /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/)
  assert.match(String(runId), /^[1-9][0-9]*$/)
  assert.equal(typeof validateCarrier, 'function', 'native terminal validator is required')
  const api = suffix => JSON.parse(gh(['api', `repos/${repository}/actions/runs/${runId}${suffix}`]))
  const run = api(''), inventory = api('/artifacts?per_page=100')
  const artifacts = selectRetentionArtifacts(run, inventory, sourceRevision, runId)
  const output = path.resolve(outputDir)
  if (fs.existsSync(output)) {
    const stat = fs.lstatSync(output)
    assert.ok(stat.isDirectory() && !stat.isSymbolicLink(), 'retention target must be a real directory')
    const receipt = json(path.join(output, 'retention.json'))
    assert.equal(receipt.schema, 'agentic-graph-production-retention/v1')
    assert.equal(receipt.repository, repository)
    assert.equal(receipt.runId, String(runId))
    assert.equal(receipt.sourceRevision, sourceRevision)
    assert.equal(receipt.runAttempt, run.run_attempt)
    assert.deepEqual(receipt.artifactIds, artifacts.map(item => item.id), 'provider artifact identity changed')
    assert.deepEqual(retentionInventory(output), receipt.files, 'retained evidence changed')
    assert.equal(verifyEvidence(output, sourceRevision, validateCarrier), receipt.carrierSha256)
    return { status: 'retained', disposition: 'replayed', outputDir: output }
  }
  fs.mkdirSync(path.dirname(output), { recursive: true })
  const stage = `${output}.partial-${randomUUID()}`
  fs.mkdirSync(stage, { mode: 0o700 })
  try {
    write(path.join(stage, 'provider-run.json'), run)
    write(path.join(stage, 'provider-artifacts.json'), inventory)
    for (const artifact of artifacts) {
      gh(['run', 'download', String(runId), '--repo', repository, '--name', artifact.name, '--dir', path.join(stage, artifact.role)])
    }
    const files = retentionInventory(stage)
    const carrierSha256 = verifyEvidence(stage, sourceRevision, validateCarrier)
    const observedRun = api(''), observedInventory = api('/artifacts?per_page=100')
    const observedArtifacts = selectRetentionArtifacts(observedRun, observedInventory, sourceRevision, runId)
    assert.equal(observedRun.run_attempt, run.run_attempt, 'release attempt changed during retention')
    assert.deepEqual(observedArtifacts, artifacts, 'artifacts changed during retention')
    write(path.join(stage, 'retention.json'), {
      schema: 'agentic-graph-production-retention/v1', status: 'retained', repository,
      runId: String(runId), runAttempt: run.run_attempt, sourceRevision, artifactIds: artifacts.map(item => item.id),
      carrierSha256, files, retainedAt: now().toISOString(), authorizesEffects: false,
    })
    // An existing destination is never replaced, including an empty directory.
    fs.mkdirSync(output, { mode: 0o700 })
    for (const entry of fs.readdirSync(stage)) fs.renameSync(path.join(stage, entry), path.join(output, entry))
    fs.rmdirSync(stage)
    return { status: 'retained', disposition: 'created', outputDir: output, files: files.length, carrierSha256 }
  } catch (error) {
    throw new Error(`retention failed; preserved partial evidence at ${stage}: ${error.message}`, { cause: error })
  }
}
