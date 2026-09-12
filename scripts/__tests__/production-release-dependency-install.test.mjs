import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import test from 'node:test'
import YAML from 'yaml'

const installer = path.resolve(import.meta.dirname, '../install-production-release-dependencies.sh')
test('verify and deploy install dependencies before consuming the mirror runtime', () => {
  const workflow = YAML.parse(fs.readFileSync(path.resolve(import.meta.dirname, '../../.github/workflows/release.yml'), 'utf8'))
  for (const [job, consumer] of [['verify', 'Verify complete mirror runtime seal before activation'],
    ['deploy', 'Reconcile verified artifact into exact mirror base']]) {
    const steps = workflow.jobs[job].steps
    const install = steps.findIndex(step => step.run === 'bash ./scripts/install-production-release-dependencies.sh')
    assert.ok(install >= 0)
    assert.equal(steps[install]['working-directory'], 'agentic-graph')
    assert.ok(steps.findIndex(step => step.name === consumer) > install)
  }
})
const runInstaller = (t, { mirrorRoot = '', graphFailures = 0, mirrorFailures = 0 } = {}) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'release-dependency-install-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const bin = path.join(root, 'bin'), cwd = path.join(root, 'agentic-graph')
  fs.mkdirSync(bin); fs.mkdirSync(cwd)
  const log = path.join(root, 'calls.jsonl')
  const shim = `#!${process.execPath}
const fs = require('node:fs'), path = require('node:path');
const command = path.basename(process.argv[1]), args = process.argv.slice(2);
fs.appendFileSync(process.env.LC_INSTALL_LOG, JSON.stringify([command, ...args]) + '\\n');
if (command === 'npm' && args.includes('ci')) {
  const mirror = args.includes('--prefix');
  const counter = process.env.LC_INSTALL_LOG + (mirror ? '.mirror' : '.graph');
  const attempt = Number(fs.existsSync(counter) ? fs.readFileSync(counter, 'utf8') : 0) + 1;
  fs.writeFileSync(counter, String(attempt));
  if (attempt <= Number(process.env[mirror ? 'LC_INSTALL_MIRROR_FAILURES' : 'LC_INSTALL_GRAPH_FAILURES'])) process.exit(17);
}
`
  for (const command of ['npm', 'npx', 'sleep']) fs.writeFileSync(path.join(bin, command), shim, { mode: 0o755 })
  const result = spawnSync('bash', [installer], { cwd, encoding: 'utf8', timeout: 10_000,
    env: { ...process.env, PATH: `${bin}${path.delimiter}${process.env.PATH}`,
      AGENTIC_OS_PUBLISH_REPOSITORY_ROOT: mirrorRoot, LC_INSTALL_LOG: log,
      LC_INSTALL_GRAPH_FAILURES: String(graphFailures), LC_INSTALL_MIRROR_FAILURES: String(mirrorFailures) } })
  if (result.error) throw result.error
  return { ...result, calls: fs.readFileSync(log, 'utf8').trim().split('\n').map(line => JSON.parse(line)) }
}

test('release setup installs the mirror lockfile and development dependency before runtime preparation', t => {
  const result = runInstaller(t)
  assert.equal(result.status, 0, result.stderr)
  assert.deepEqual(result.calls, [
    ['npm', 'ci'],
    ['npm', '--prefix', '../huijoohwee', 'ci', '--ignore-scripts', '--include=dev'],
    ['npm', 'run', 'smoke:prepare'],
    ['npx', 'playwright', 'install', '--with-deps', 'chromium'],
  ])
})

test('release setup retries the configured mirror path without splitting spaces', t => {
  const result = runInstaller(t, { mirrorRoot: '/fixture/production mirror', mirrorFailures: 2 })
  assert.equal(result.status, 0, result.stderr)
  assert.deepEqual(result.calls.filter(call => call.includes('--prefix')),
    Array(3).fill(['npm', '--prefix', '/fixture/production mirror', 'ci', '--ignore-scripts', '--include=dev']))
  assert.deepEqual(result.calls.filter(call => call[0] === 'sleep'), [['sleep', '10'], ['sleep', '20']])
  assert.deepEqual(result.calls.at(-1), ['npx', 'playwright', 'install', '--with-deps', 'chromium'])
})

test('exhausted source or mirror dependency installation stops before later preparation', t => {
  for (const failures of [{ graphFailures: 3 }, { mirrorFailures: 3 }]) {
    const result = runInstaller(t, failures)
    assert.notEqual(result.status, 0)
    assert.equal(result.calls.filter(call => call[0] === 'sleep').length, 2)
    assert.ok(result.calls.every(call => !call.includes('smoke:prepare') && call[0] !== 'npx'))
    const installs = result.calls.filter(call => call.includes('ci'))
    assert.equal(installs.length, failures.graphFailures ? 3 : 4)
    assert.match(result.stderr, /npm ci failed after 3 attempts/)
  }
})
