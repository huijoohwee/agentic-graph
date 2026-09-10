import assert from 'node:assert/strict'
import test from 'node:test'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { execFileSync, spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { canonicalJson, createRepositoryProfile } from 'agentic-os'
import YAML from 'yaml'
import { historyArtifactName, assertPriorBrowserRun } from '../production-browser-history.mjs'
import { browserArtifactDigest, inspectBrowserInput } from '../production-browser-preflight.mjs'
import { productionMirrorArtifactEntries } from '../production-mirror-artifact-entries.mjs'

test('browser history refuses failed, interrupted, active, self, and unprotected attempts', () => {
  const run = { id: 41, head_sha: 'a'.repeat(40), path: '.github/workflows/release.yml', event: 'workflow_dispatch',
    head_branch: 'main', status: 'completed', conclusion: 'success' }
  assert.doesNotThrow(() => assertPriorBrowserRun(run, '42'))
  for (const change of [{ conclusion: 'failure' }, { conclusion: 'cancelled' }, { conclusion: null },
    { status: 'in_progress' }, { id: 42 }, { head_sha: 'invalid' }, { head_branch: 'candidate' },
    { event: 'pull_request' }, { path: '.github/workflows/untrusted.yml' }]) {
    assert.throws(() => assertPriorBrowserRun({ ...run, ...change }, '42'))
  }
})

test('history keys bind source, docs and execution configuration with canonical ordering', () => {
  const binding = { sourceTree: 'a'.repeat(40), docsTree: 'b'.repeat(40), check: 'isolated-browser-v1', runtime: { node: '22', platform: 'linux' } }
  const name = historyArtifactName(binding)
  assert.equal(name, historyArtifactName({ runtime: { platform: 'linux', node: '22' }, check: binding.check, docsTree: binding.docsTree, sourceTree: binding.sourceTree }))
  assert.notEqual(name, historyArtifactName({ ...binding, docsTree: 'c'.repeat(40) }))
  assert.notEqual(name, historyArtifactName({ ...binding, sourceTree: 'd'.repeat(40) }))
  assert.notEqual(name, historyArtifactName({ ...binding, runtime: { ...binding.runtime, node: '24' } }))
})

test('artifact identity detects changed browser bytes and rejects symlink substitutions', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'browser-artifact-check-'))
  try {
    for (const entry of [...productionMirrorArtifactEntries, 'content/singabldr/index.html', 'content/singabldr/manifest.webmanifest', 'content/singabldr/sw.js']) {
      const target = path.join(root, entry)
      await fs.mkdir(path.dirname(target), { recursive: true })
      if (path.extname(entry)) await fs.writeFile(target, `fixture:${entry}`)
      else await fs.mkdir(target, { recursive: true })
    }
    const script = path.join(root, 'content/agentic-graph/main.js')
    await fs.writeFile(script, 'console.log("first")')
    const before = await browserArtifactDigest(root)
    await fs.writeFile(script, 'console.log("corrected")')
    assert.notEqual(await browserArtifactDigest(root), before)
    await fs.unlink(script); await fs.symlink('/etc/hosts', script)
    await assert.rejects(browserArtifactDigest(root), /symlinks/)
  } finally { await fs.rm(root, { recursive: true, force: true }) }
})

test('preflight refuses an unbound or relative candidate before reading its artifacts', async () => {
  await assert.rejects(inspectBrowserInput({ schema: 'wrong', artifactRoot: '/tmp', docsRoot: '/tmp' }))
  await assert.rejects(inspectBrowserInput({ schema: 'agentic-graph/browser-preflight-input/v1', artifactRoot: 'relative', docsRoot: '/tmp' }), /absolute/)
})

test('a fresh runner authenticates native setup before the real gate can execute a check', async () => {
  const parent = await fs.mkdtemp(path.join(os.tmpdir(), 'browser-native-setup-'))
  const root = path.join(parent, 'repo')
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim()
  const save = (file, value) => fs.writeFile(file, canonicalJson(value) + '\n')
  try {
    await fs.mkdir(root)
    git('init', '-q', '--initial-branch=main')
    git('config', 'user.name', 'Fixture'); git('config', 'user.email', 'fixture@example.invalid')
    const profile = createRepositoryProfile({ repository: 'github.com/example/browser-fixture',
      canonical: { localRef: 'refs/heads/main', remoteRef: 'refs/remotes/origin/main' },
      adapters: { repository: { id: 'git', version: '1' }, provider: null }, capabilities: [], requiredChecks: [] })
    await save(path.join(root, '.agentic-os.json'), profile)
    await save(path.join(root, '.agentic-os-flight.json'), { schema: 'agentic-os/flight-requirements/v3',
      maxAgeSeconds: 900, operations: ['publication', 'production-activation'], requirements: [], checks: [{
        id: 'browser-fixture', owner: 'fixture', kind: 'browser', operations: ['production-activation'],
        script: 'check.mjs', args: [], environment: ['PROBE_OUTPUT'], timeoutMs: 2000 }] })
    await fs.writeFile(path.join(root, 'check.mjs'), "import {writeFileSync} from 'node:fs'; writeFileSync(process.env.PROBE_OUTPUT, 'executed');\n")
    await fs.writeFile(path.join(root, '.gitignore'), 'node_modules/\n')
    git('add', '.'); git('commit', '-qm', 'fixture')
    const sha = git('rev-parse', 'HEAD')
    // Synthetic protected refs belong only to this disposable fixture, never a release checkout.
    git('update-ref', 'refs/remotes/origin/main', sha)
    const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.resolve('agentic-os'))), '..')
    const installation = path.join(root, 'node_modules/agentic-os')
    await fs.cp(packageRoot, installation, { recursive: true })
    const cli = path.join(installation, 'bin/agentic-os.mjs'), context = path.join(parent, 'context.json')
    await save(context, { schema: 'agentic-os/flight-check-context/v1', sourceRevision: sha,
      artifactDigest: 'a'.repeat(64), configurationDigest: 'b'.repeat(64) })
    const args = [cli, 'flight', 'gate', '--operation=production-activation', `--context=${context}`]
    const options = { cwd: root, encoding: 'utf8', timeout: 30000, env: { ...process.env, PROBE_OUTPUT: path.join(parent, 'observed') } }
    const missing = spawnSync(process.execPath, args, options)
    assert.equal(missing.status, 1); assert.match(missing.stderr, /blocked-repository-trust-missing/)
    execFileSync(process.execPath, [cli, 'setup'], options)
    const checked = spawnSync(process.execPath, args, options)
    assert.equal(checked.status, 0, checked.stdout + checked.stderr)
    const report = JSON.parse(checked.stdout)
    assert.equal(report.checks[0].outcome, 'passed'); assert.equal(report.authorizesEffects, false)
    assert.equal(await fs.readFile(options.env.PROBE_OUTPUT, 'utf8'), 'executed')
  } finally { await fs.rm(parent, { recursive: true, force: true }) }
})

test('release retains an attempt before running the gate and cannot authorize a failed gate', async () => {
  const workflow = YAML.parse(await fs.readFile(new URL('../../.github/workflows/release.yml', import.meta.url), 'utf8'))
  const steps = workflow.jobs.verify.steps, names = steps.map(step => step.name)
  const order = ['Install dependencies', 'Initialize native release gate trust',
    'Restore protected browser attempt history', 'Reverify exact candidate',
    'Build and sync verified candidate', 'Prepare isolated browser candidate',
    'Retain browser attempt before execution', 'Run isolated browser gate before production authorization',
    'Retain browser ledger and bounded diagnostics', 'Bind immutable production candidate']
  const indices = order.map(name => { const index = names.indexOf(name); assert.ok(index >= 0, name); return index })
  assert.deepEqual(indices, [...indices].sort((a, b) => a - b))
  const setup = steps.find(step => step.name === 'Initialize native release gate trust')
  assert.match(setup.run, /git fetch origin main/)
  assert.match(setup.run, /git switch main/)
  assert.match(setup.run, /npm run agentic-os:setup/)
  assert.equal(setup['continue-on-error'], undefined)
  const gate = steps.find(step => step.id === 'browser_gate')
  assert.equal(gate['continue-on-error'], undefined)
  assert.equal(gate.if, undefined)
  assert.match(gate.run, /flight gate --operation=production-activation/)
  assert.equal(workflow.jobs.deploy.needs, 'verify')
  const live = workflow.jobs.deploy.steps.find(step => step.id === 'fidelity')
  assert.doesNotMatch(live.run, /for |sleep |continue-on-error/)
  assert.match(live.run, /2>.*production-fidelity-diagnostics/)
})
