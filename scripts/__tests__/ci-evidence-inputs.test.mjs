import assert from 'node:assert/strict'
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { test } from 'node:test'
import { load } from 'js-yaml'
import { ownerInputs } from '../ci-evidence-inputs.mjs'
import { readContract } from '../collaboration-contract.mjs'
import { validateCiEvidencePolicy } from '../../node_modules/agentic-os/bin/agentic-os-ci-evidence.mjs'

const read = relative => readFileSync(new URL(`../../${relative}`, import.meta.url), 'utf8')
const integration = load(read('.github/workflows/integration.yml')).jobs['integration-gate'].steps
const release = load(read('.github/workflows/release.yml')).jobs.verify.steps
const action = load(read('.github/actions/protected-ci-evidence/action.yml'))
const policy = validateCiEvidencePolicy(JSON.parse(read('.agentic-os-ci-evidence.json')))
const contract = await readContract()
const sample = (event, paths, extra = {}) => ownerInputs({ contract,
  environment: { GITHUB_ACTIONS: 'true', GITHUB_EVENT_NAME: event },
  gitText: () => paths.map(p => `${p}\0`).join(''),
  resolveCi: () => ({ base: 'a'.repeat(40) }), versions: { python: '3.11', chrome: '140' }, ...extra })

test('event-independent evidence retains exact owner-selected paths and expanded commands', () => {
  const paths = ['package.json', '.github/workflows/release.yml']
  assert.deepEqual(sample('push', paths), sample('workflow_dispatch', paths))
  assert.notDeepEqual(sample('push', paths), sample('workflow_dispatch', ['docs/README.md']))
  assert.ok(sample('push', paths).commands.some(c => c.join(' ') === 'npm run check'))
  assert.ok(sample('push', ['new-unknown-input']).commands.some(c => c.join(' ') === 'npm run check'))
  assert.notDeepEqual(sample('push', paths), sample('push', paths, { versions: { python: '3.12', chrome: '140' } }))
})

test('missing event and malformed Git inventory cannot produce reusable inputs', () => {
  assert.throws(() => sample('pull_request', ['package.json']))
  assert.throws(() => sample('push', [], { gitText: () => 'package.json' }), /NUL/)
  assert.throws(() => sample('push', [], { resolveCi: () => { throw Error('unbound event') } }), /unbound event/)
})

test('producer binds unchanged owner command and seals after all required checks', () => {
  const gate = integration.find(s => s.name === policy.step)
  assert.equal(gate.run, policy.command.join(' '))
  assert.equal(gate.if, undefined)
  const capture = integration.find(s => s.id === 'ci_evidence_capture')
  const seal = integration.find(s => s.id === 'ci_evidence_seal')
  assert.match(capture.if, /github.event_name == 'push'/)
  assert.equal(capture['continue-on-error'], true)
  assert.equal(seal['continue-on-error'], true)
  assert.ok(integration.indexOf(capture) < integration.indexOf(gate))
  assert.ok(integration.indexOf(seal) > integration.findIndex(s => s.name === 'Run XR v2 runtime review-candidate gate'))
  assert.equal(seal.if, "steps.ci_evidence_capture.outcome == 'success'")
  assert.ok(policy.environment.includes('AGENTIC_OS_CI_OWNER_INPUTS'))
})

test('failed owner-input capture stops shell before evidence creation', () => {
  const fixture = mkdtempSync(join(tmpdir(), 'ci-input-failure-'))
  try {
    writeFileSync(join(fixture, 'node'), '#!/bin/sh\nexit 7\n', { mode: 0o700 })
    const script = integration.find(s => s.id === 'ci_evidence_capture').run
    const result = spawnSync('bash', ['--noprofile', '--norc', '-e', '-o', 'pipefail', '-c', script], {
      encoding: 'utf8', env: { ...process.env, PATH: `${fixture}:${process.env.PATH}` },
    })
    assert.equal(result.status, 7)
  } finally { rmSync(fixture, { recursive: true, force: true }) }
})

test('release errors fall back to original validation and retain live gates', () => {
  const reuse = release.find(s => s.id === 'ci_evidence')
  const fresh = release.find(s => s.name === 'Reverify exact candidate')
  assert.equal(reuse['continue-on-error'], true)
  assert.equal(fresh.if, "steps.ci_evidence.outcome != 'success' || steps.ci_evidence.outputs.reused != 'true'")
  assert.equal(fresh.run, policy.command.join(' '))
  for (const name of ['Recheck current source ownership', 'Build and sync verified candidate',
    'Verify source-to-mirror parity', 'Run isolated browser gate before production authorization', 'Bind immutable production candidate']) {
    assert.equal(release.find(s => s.name === name).if, undefined, name)
  }
  assert.equal(action.outputs.reused.value, '${{ steps.verify.outputs.reused }}')
  const download = action.runs.steps.find(s => s.id === 'download')
  assert.match(download.uses, /^actions\/download-artifact@[a-f0-9]{40}$/)
  assert.equal(download.with['github-token'], '${{ inputs.token }}')
  assert.equal(download.with['run-id'], '${{ steps.lookup.outputs.run-id }}')
  assert.match(action.runs.steps.find(s => s.id === 'verify').run, /agentic-os-ci-evidence.mjs verify/)
})
