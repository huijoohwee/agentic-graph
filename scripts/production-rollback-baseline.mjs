#!/usr/bin/env node
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'
import { verifyRemovedTerminalPersistence } from './lib/production-terminal-persistence.mjs'
import { createObservedCurrentRollbackBaseline, createObservedRollbackBaseline,
  createPagesDeploymentCommitProvenance } from './lib/production-rollback-baseline.mjs'
import { digest } from './lib/production-release-lifecycle-evidence.mjs'

const repository = 'huijoohwee/agentic-graph'
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = async file => JSON.parse(await fs.readFile(file, 'utf8'))
const write = (file, value) => fs.writeFile(file, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx', mode: 0o600 })
const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', timeout: 30_000 }).trim()
const gh = endpoint => JSON.parse(execFileSync('gh', ['api', endpoint], {
  cwd: root, encoding: 'utf8', timeout: 30_000, maxBuffer: 4 * 1024 * 1024,
}))
const run = (script, args) => execFileSync(process.execPath, [path.join(root, 'scripts', script), ...args], {
  cwd: root, stdio: ['ignore', 'pipe', 'pipe'], timeout: 120_000, maxBuffer: 4 * 1024 * 1024,
})
export const currentBaselineCaptureSummary = (provenance, recapture) => ({ status: provenance.status,
  productionAuthorized: false, pagesDeploymentCommitKind: provenance.deploymentCommitProvenance.kind,
  rollbackTargetDigest: digest(recapture.rollbackIdentity) })
const round = async (directory, mirrorRoot) => {
  await fs.mkdir(directory)
  const pagesFile = path.join(directory, 'pages.json')
  const stateFile = path.join(directory, 'state.json')
  const mirrorFile = path.join(directory, 'mirror.json')
  run('verify-production-release-transports.mjs', ['pages', '--mode', 'current', '--evidence-dir', directory, '--output', pagesFile])
  run('seed-storage-docs-to-cloudflare.mjs', ['--capture-state', '--evidence-output', stateFile])
  run('verify-production-release-transports.mjs', ['mirror', '--repository-root', mirrorRoot,
    '--repository', 'huijoohwee/huijoohwee', '--output', mirrorFile])
  return { pages: await read(pagesFile), state: await read(stateFile), mirror: await read(mirrorFile),
    deployment: (await read(path.join(directory, 'current-pages-deployment-api.json'))).result,
    pagesReadiness: await read(path.join(directory, 'current-pages-runtime-readiness.json')),
    mirrorReadiness: JSON.parse(git(mirrorRoot, 'show', 'HEAD:.well-known/runtime-readiness.json')) }
}

export async function main(args = process.argv.slice(2)) {
  const { values } = parseArgs({ args, options: {
    'run-id': { type: 'string' }, 'mirror-root': { type: 'string' }, 'output-dir': { type: 'string' },
    'current-state': { type: 'boolean', default: false },
  }, strict: true })
  for (const name of ['mirror-root', 'output-dir']) assert.ok(values[name], `--${name} is required`)
  if (values['current-state']) assert.ok(!values['run-id'], '--current-state cannot be combined with --run-id')
  else {
    assert.ok(values['run-id'], '--run-id is required unless --current-state is used')
    assert.match(values['run-id'], /^[1-9]\d*$/, '--run-id must be a positive integer')
  }
  const mirrorRoot = path.resolve(values['mirror-root'])
  const output = path.resolve(values['output-dir'])
  const sourceRevision = git(root, 'rev-parse', 'HEAD')
  const sourceTree = git(root, 'rev-parse', 'HEAD^{tree}')
  assert.equal(git(root, 'status', '--porcelain'), '', 'recovery command source must be clean')
  assert.equal(git(root, 'symbolic-ref', 'HEAD'), 'refs/heads/main', 'use integrated canonical main')
  assert.equal(git(root, 'ls-remote', 'origin', 'refs/heads/main').split(/\s+/)[0], sourceRevision, 'recovery command source must equal protected main')
  // Validate both repository origins before accepting their provider records.
  assert.match(git(root, 'remote', 'get-url', 'origin'), /(?:github\.com[:/])huijoohwee\/agentic-graph(?:\.git)?$/)
  assert.match(git(mirrorRoot, 'remote', 'get-url', 'origin'), /(?:github\.com[:/])huijoohwee\/huijoohwee(?:\.git)?$/)
  await fs.mkdir(output, { mode: 0o700 }) // Refuse overwriting earlier observations.
  const repo = gh(`repos/${repository}`)
  if (values['current-state']) {
    assert.equal(process.env.GITHUB_ACTIONS, 'true', 'current-state capture requires protected GitHub Actions')
    assert.equal(process.env.GITHUB_REPOSITORY, repository, 'current-state capture ran in the wrong repository')
    assert.equal(process.env.GITHUB_REF, 'refs/heads/main', 'current-state capture must run on protected main')
    assert.equal(process.env.GITHUB_WORKFLOW, 'Production Rollback Baseline Capture',
      'current-state capture must use its protected workflow')
    assert.equal(process.env.GITHUB_WORKFLOW_REF,
      `${repository}/.github/workflows/production-rollback-baseline-capture.yml@refs/heads/main`,
      'current-state capture workflow ref drifted')
    assert.equal(process.env.GITHUB_SHA, sourceRevision, 'current-state capture source revision drifted')
    const first = await round(path.join(output, 'first'), mirrorRoot)
    const second = await round(path.join(output, 'second'), mirrorRoot)
    const currentRun = gh(`repos/${repository}`)
    assert.equal(currentRun.id, repo.id, 'repository identity changed during capture')
    assert.equal(git(root, 'rev-parse', 'HEAD'), sourceRevision, 'capture source changed')
    assert.equal(git(root, 'status', '--porcelain'), '', 'capture source became dirty')
    assert.equal(git(root, 'ls-remote', 'origin', 'refs/heads/main').split(/\s+/)[0], sourceRevision,
      'protected main changed during capture')
    execFileSync('git', ['merge-base', '--is-ancestor', second.pages.identity.sourceRevision, sourceRevision],
      { cwd: root, stdio: 'ignore', timeout: 30_000 })
    const deploymentCommitProvenance = createPagesDeploymentCommitProvenance({
      pagesIdentity: second.pages.identity, sourceRevision: second.pages.identity.sourceRevision,
      mirror: second.mirror,
      associatedPullRequests: second.pages.identity.deploymentCommitRevision === second.pages.identity.sourceRevision
        ? [] : gh(`repos/${second.mirror.repository}/commits/${second.pages.identity.deploymentCommitRevision}/pulls?per_page=100`),
      isMirrorMergeAncestor: (mergeRevision, mirrorRevision) => {
        try {
          execFileSync('git', ['merge-base', '--is-ancestor', mergeRevision, mirrorRevision],
            { cwd: mirrorRoot, stdio: 'ignore', timeout: 30_000 })
          return true
        } catch { return false }
      },
    })
    const assembledAt = new Date().toISOString()
    const { recapture, provenance } = createObservedCurrentRollbackBaseline({ first, second,
      repositoryId: repo.id, candidateSourceRevision: sourceRevision,
      captureRunId: process.env.GITHUB_RUN_ID, captureWorkflowRef: process.env.GITHUB_WORKFLOW_REF,
      deploymentCommitProvenance, assembledAt })
    await write(path.join(output, 'observations.json'), { first, second, repositoryId: repo.id,
      candidateSourceRevision: sourceRevision })
    await write(path.join(output, 'provenance.json'), provenance)
    await write(path.join(output, 'rollback-recapture.json'), recapture)
    console.log(JSON.stringify({ ...currentBaselineCaptureSummary(provenance, recapture), output }))
    return
  }
  const releaseRun = gh(`repos/${repository}/actions/runs/${values['run-id']}`)
  const artifacts = gh(`repos/${repository}/actions/runs/${values['run-id']}/artifacts?per_page=100`)
  await write(path.join(output, 'release-run.json'), releaseRun)
  await write(path.join(output, 'artifacts.json'), artifacts)
  let terminalPersistence
  if (artifacts.total_count === 0) {
    const readWorkflow = revision => execFileSync('git', ['show', `${revision}:.github/workflows/release.yml`],
      { cwd: root, encoding: 'utf8', timeout: 30_000, maxBuffer: 500_000 })
    const workflow = readWorkflow(releaseRun.head_sha)
    const jobs = gh(`repos/${repository}/actions/runs/${releaseRun.id}/attempts/${releaseRun.run_attempt}/jobs?per_page=100`)
    terminalPersistence = { workflow, jobs }
    verifyRemovedTerminalPersistence({ ...terminalPersistence, run: releaseRun, artifacts })
    await write(path.join(output, 'terminal-persistence-inputs.json'), terminalPersistence)
  }
  const first = await round(path.join(output, 'first'), mirrorRoot)
  const attribution = /^github-actions:([^:]+):(\d+):(\d+):pages$/.exec(first.deployment.deployment_trigger?.metadata?.commit_message || '')
  assert.ok(attribution && /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(attribution[1]), 'invalid deployment run attribution')
  const attributedRepo = gh(`repos/${attribution[1]}`)
  assert.equal(attributedRepo.id, repo.id, 'deployment attribution belongs to another repository')
  const second = await round(path.join(output, 'second'), mirrorRoot)
  const currentRun = gh(`repos/${repository}/actions/runs/${values['run-id']}`)
  for (const key of ['id', 'head_sha', 'status', 'conclusion', 'run_attempt', 'updated_at']) {
    assert.equal(currentRun[key], releaseRun[key], `release ${key} changed during capture`)
  }
  const finalArtifacts = gh(`repos/${repository}/actions/runs/${values['run-id']}/artifacts?per_page=100`)
  assert.deepEqual(finalArtifacts, artifacts, 'artifact inventory changed during capture')
  let terminalPersistenceReobservation
  if (terminalPersistence) {
    const jobs = gh(`repos/${repository}/actions/runs/${releaseRun.id}/attempts/${releaseRun.run_attempt}/jobs?per_page=100`)
    assert.deepEqual(jobs, terminalPersistence.jobs, 'terminal execution records changed during capture')
    terminalPersistenceReobservation = { artifacts: finalArtifacts, jobs, capturedAt: new Date().toISOString() }
    await write(path.join(output, 'terminal-persistence-reobservation.json'), terminalPersistenceReobservation)
  }
  assert.equal(git(root, 'rev-parse', 'HEAD'), sourceRevision, 'capture source changed')
  assert.equal(git(root, 'status', '--porcelain'), '', 'capture source became dirty')
  assert.equal(git(root, 'ls-remote', 'origin', 'refs/heads/main').split(/\s+/)[0], sourceRevision, 'protected main changed during capture')
  const { recapture, provenance } = createObservedRollbackBaseline({ first, second, run: releaseRun,
    artifacts, terminalPersistence, terminalPersistenceReobservation, repositoryId: repo.id, assembledAt: new Date().toISOString() })
  await write(path.join(output, 'observations.json'), { first, second, run: releaseRun, artifacts,
    terminalPersistence, terminalPersistenceReobservation, repositoryId: repo.id })
  await write(path.join(output, 'provenance.json'), { ...provenance, captureSource: { sourceRevision, sourceTree },
    attributedRepository: { requestedName: attribution[1], repositoryId: attributedRepo.id } })
  await write(path.join(output, 'rollback-recapture.json'), recapture)
  console.log(JSON.stringify({ status: provenance.status, output, productionAuthorized: false }))
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  main().catch(error => { console.error(`Rollback baseline capture failed: ${error.message}`); process.exitCode = 1 })
}
