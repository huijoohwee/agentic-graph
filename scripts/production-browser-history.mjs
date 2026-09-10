import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { canonicalJson } from 'agentic-os'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const repository = 'huijoohwee/agentic-graph'
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim()
const gh = (...args) => execFileSync('gh', args, { cwd: root, encoding: 'utf8', timeout: 30000, maxBuffer: 8 * 1024 * 1024 })
export const historyArtifactName = binding => 'browser-preflight-' + createHash('sha256').update(canonicalJson(binding)).digest('hex')
export function assertPriorBrowserRun(run, currentRun) {
  assert.ok(Number.isSafeInteger(run.id), 'prior run identity is missing')
  assert.match(run.head_sha, /^[0-9a-f]{40}$/, 'prior source revision is invalid')
  assert.notEqual(String(run.id), String(currentRun), 'a release attempt cannot overwrite its own browser history')
  assert.equal(run.path, '.github/workflows/release.yml', 'browser history workflow differs')
  assert.equal(run.event, 'workflow_dispatch', 'browser history trigger differs')
  assert.equal(run.head_branch, 'main', 'browser history is not protected main')
  assert.equal(run.status, 'completed', 'prior release is still active; preserve its history')
  assert.equal(run.conclusion, 'success', 'unchanged prior release failed or was interrupted; repair or reconcile before retry')
}

async function restore() {
  const docsRoot = process.env.AGENTIC_OS_AGENTIC_CANVAS_OS_DOCS_ROOT
  assert.ok(docsRoot && path.isAbsolute(docsRoot), 'absolute pinned docs root is required')
  assert.equal(await fs.realpath(docsRoot), docsRoot, 'docs root must be a real path')
  assert.equal(process.env.GITHUB_REPOSITORY, repository)
  assert.equal(process.env.GITHUB_REF, 'refs/heads/main')
  const binding = { sourceTree: git('rev-parse', 'HEAD^{tree}'),
    docsTree: execFileSync('git', ['rev-parse', 'HEAD^{tree}'], { cwd: path.dirname(docsRoot), encoding: 'utf8' }).trim(),
    runtime: { node: process.version, platform: process.platform, arch: process.arch },
    check: 'isolated-browser-v1' }
  const name = historyArtifactName(binding)
  assert.ok(process.env.GITHUB_OUTPUT, 'GitHub output path is required')
  await fs.appendFile(process.env.GITHUB_OUTPUT, `artifact_name=${name}\n`)
  const listing = JSON.parse(gh('api', `repos/${repository}/actions/artifacts?name=${name}&per_page=100`))
  assert.ok(Array.isArray(listing.artifacts) && Number.isSafeInteger(listing.total_count), 'browser history response is malformed')
  assert.ok(listing.total_count <= 100 && listing.artifacts.length === listing.total_count, 'browser history exceeds its observation bound')
  const common = git('rev-parse', '--path-format=absolute', '--git-common-dir')
  const destination = path.join(common, 'agentic-os/flight-checks')
  assert.equal(await fs.stat(destination).then(() => true, error => { if(error.code === 'ENOENT') return false; throw error }), false,
    'restore requires a fresh CI ledger; existing history cannot be overwritten')
  for (const artifact of listing.artifacts) {
    assert.equal(artifact.name, name)
    assert.equal(artifact.expired, false, 'expired browser history requires reconciliation')
    assert.ok(artifact.size_in_bytes > 0 && artifact.size_in_bytes <= 4 * 1024 * 1024, 'browser history artifact exceeds its bound')
    const run = JSON.parse(gh('api', `repos/${repository}/actions/runs/${artifact.workflow_run.id}`))
    assertPriorBrowserRun(run, process.env.GITHUB_RUN_ID)
    const commit = JSON.parse(gh('api', `repos/${repository}/git/commits/${run.head_sha}`))
    assert.equal(commit.tree.sha, binding.sourceTree, 'browser history source tree differs')
  }
  const newest = listing.artifacts.sort((a, b) => b.id - a.id)[0]
  if (newest) gh('run', 'download', String(newest.workflow_run.id), '--repo', repository, '--name', `${name}-ledger`, '--dir', destination)
  await fs.appendFile(process.env.GITHUB_OUTPUT, 'may_execute=true\n')
  console.log(JSON.stringify({ schema: 'agentic-graph/browser-history-observation/v1', artifact: name, restored: Boolean(newest),
    sourceTree: binding.sourceTree, authorizesEffects: false, automaticRetry: false }))
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) restore().catch(error => { console.error(error.message); process.exitCode = 1 })
