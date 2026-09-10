import assert from 'node:assert/strict'
import test from 'node:test'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
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

test('release retains an attempt before running the gate and cannot authorize a failed gate', async () => {
  const workflow = YAML.parse(await fs.readFile(new URL('../../.github/workflows/release.yml', import.meta.url), 'utf8'))
  const steps = workflow.jobs.verify.steps, names = steps.map(step => step.name)
  const order = ['Restore protected browser attempt history', 'Reverify exact candidate',
    'Build and sync verified candidate', 'Prepare isolated browser candidate',
    'Retain browser attempt before execution', 'Run isolated browser gate before production authorization',
    'Retain browser ledger and bounded diagnostics', 'Bind immutable production candidate']
  const indices = order.map(name => { const index = names.indexOf(name); assert.ok(index >= 0, name); return index })
  assert.deepEqual(indices, [...indices].sort((a, b) => a - b))
  const gate = steps[indices[5]]
  assert.equal(gate['continue-on-error'], undefined)
  assert.equal(gate.if, undefined)
  assert.match(gate.run, /flight gate --operation=production-activation/)
  assert.equal(workflow.jobs.deploy.needs, 'verify')
  const live = workflow.jobs.deploy.steps.find(step => step.id === 'fidelity')
  assert.doesNotMatch(live.run, /for |sleep |continue-on-error/)
  assert.match(live.run, /2>.*production-fidelity-diagnostics/)
})
