import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { readPinnedDocsIdentity, verifyDocsRevisionParity, verifyPackagePinParity } from '../check-runtime-docs-parity.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const workflow = fs.readFileSync(path.join(root, '.github/workflows/release.yml'), 'utf8')
const current = 'f'.repeat(40)
const next = 'e'.repeat(40)
const contract = revision => `---\ndocs_dependency:\n  repository: "https://github.com/huijoohwee/agentic-os.git"\n  ref: "${revision}"\n---\n`
const packageSources = revision => {
  const url = `https://codeload.github.com/huijoohwee/agentic-os/tar.gz/${revision}`
  return [JSON.stringify({ dependencies: { 'agentic-os': url } }), JSON.stringify({
    packages: { '': { dependencies: { 'agentic-os': url } }, 'node_modules/agentic-os': { resolved: url } },
  })]
}

test('release docs identity is exact and binds to canonical Dev main', () => {
  const identity = readPinnedDocsIdentity(contract(current))
  assert.equal(identity.repository, 'huijoohwee/agentic-os')
  verifyPackagePinParity(identity, ...packageSources(current))
  assert.deepEqual(verifyDocsRevisionParity(identity, `${current}\trefs/heads/main\n`), {
    schema: 'agentic-graph/runtime-docs-parity/v1', status: 'passed',
    repository: 'huijoohwee/agentic-os', revision: current, pinnedRevision: current,
    revisionBinding: 'fetched-tip', ref: 'refs/heads/main',
  })
})

test('release docs parity accepts only a proven exact consumer-pin ancestor', () => {
  const identity = readPinnedDocsIdentity(contract(current))
  const comparison = {
    status: 'ahead',
    ahead_by: 1,
    base_commit: { sha: current },
    merge_base_commit: { sha: current },
  }
  assert.deepEqual(verifyDocsRevisionParity(identity, `${next}\trefs/heads/main\n`, comparison), {
    schema: 'agentic-graph/runtime-docs-parity/v1', status: 'passed',
    repository: 'huijoohwee/agentic-os', revision: next, pinnedRevision: current,
    revisionBinding: 'consumer-pin', ref: 'refs/heads/main',
  })
  assert.throws(() => verifyDocsRevisionParity(identity, `${next}\trefs/heads/main\n`), /not an ancestor/)
  assert.throws(() => verifyDocsRevisionParity(identity, `${next}\trefs/heads/main\n`, {
    ...comparison, status: 'diverged',
  }), /not an ancestor/)
  assert.throws(() => verifyDocsRevisionParity(identity, `${next}\trefs/heads/main\n`, {
    ...comparison, merge_base_commit: { sha: 'a'.repeat(40) },
  }), /not an ancestor/)
  assert.throws(() => verifyDocsRevisionParity(identity, `${next}\trefs/heads/main\n`, {
    ...comparison, ahead_by: 0,
  }), /not an ancestor/)
})

test('release docs parity fails closed on malformed ownership and malformed remote refs', () => {
  assert.throws(() => readPinnedDocsIdentity(contract('main')), /one exact GitHub repository/)
  assert.throws(() => readPinnedDocsIdentity(contract(current).replace('huijoohwee/agentic-os', 'other/os')),
    /canonical Agentic OS repository/)
  assert.throws(() => verifyPackagePinParity(readPinnedDocsIdentity(contract(current)),
    ...packageSources(next)), /contract, package manifest, and lockfile/)
  assert.throws(() => verifyDocsRevisionParity(readPinnedDocsIdentity(contract(current)),
    `${current}\trefs/heads/main\n${next}\trefs/heads/main\n`), /one exact ref/)
})

test('release checks docs parity before dependency installation and again before activation', () => {
  const check = 'node scripts/check-runtime-docs-parity.mjs'
  const first = workflow.indexOf(check)
  const install = workflow.indexOf('name: Install dependencies')
  const second = workflow.indexOf(check, first + check.length)
  const activation = workflow.indexOf('name: Deploy verified artifact')
  assert.ok(first >= 0 && first < install, 'stale pins must fail before npm install and integration work')
  assert.ok(second > install && second < activation, 'pin drift during approval must fail before activation')
  assert.equal(workflow.indexOf(check, second + check.length), -1, 'run only the two boundary checks')
  assert.match(workflow, /name: Verify checked-out commit[\s\S]{0,300}GH_TOKEN: '\$\{\{ github\.token \}\}'/)
  assert.match(workflow, /name: Revalidate last-known-good rollback identity[\s\S]{0,180}GH_TOKEN: '\$\{\{ github\.token \}\}'/)
})
