#!/usr/bin/env node
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'
import { createObservedRollbackBaseline } from './lib/production-rollback-baseline.mjs'

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
    deployment: (await read(path.join(directory, 'current-pages-deployment-api.json'))).result }
}

export async function main(args = process.argv.slice(2)) {
  const { values } = parseArgs({ args, options: {
    'run-id': { type: 'string' }, 'mirror-root': { type: 'string' }, 'output-dir': { type: 'string' },
  }, strict: true })
  for (const name of ['run-id', 'mirror-root', 'output-dir']) assert.ok(values[name], `--${name} is required`)
  assert.match(values['run-id'], /^[1-9]\d*$/, '--run-id must be a positive integer')
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
  const releaseRun = gh(`repos/${repository}/actions/runs/${values['run-id']}`)
  const artifacts = gh(`repos/${repository}/actions/runs/${values['run-id']}/artifacts?per_page=100`)
  await write(path.join(output, 'release-run.json'), releaseRun)
  await write(path.join(output, 'artifacts.json'), artifacts)
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
  assert.equal(git(root, 'rev-parse', 'HEAD'), sourceRevision, 'capture source changed')
  assert.equal(git(root, 'status', '--porcelain'), '', 'capture source became dirty')
  assert.equal(git(root, 'ls-remote', 'origin', 'refs/heads/main').split(/\s+/)[0], sourceRevision, 'protected main changed during capture')
  const { recapture, provenance } = createObservedRollbackBaseline({ first, second, run: releaseRun,
    artifacts, repositoryId: repo.id, assembledAt: new Date().toISOString() })
  await write(path.join(output, 'observations.json'), { first, second, run: releaseRun, artifacts, repositoryId: repo.id })
  await write(path.join(output, 'provenance.json'), { ...provenance, captureSource: { sourceRevision, sourceTree },
    attributedRepository: { requestedName: attribution[1], repositoryId: attributedRepo.id } })
  await write(path.join(output, 'rollback-recapture.json'), recapture)
  console.log(JSON.stringify({ status: provenance.status, output, productionAuthorized: false }))
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  main().catch(error => { console.error(`Rollback baseline capture failed: ${error.message}`); process.exitCode = 1 })
}
