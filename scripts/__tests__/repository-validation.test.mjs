import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { readChangedPaths } from '../run-affected-ci.mjs'

test('local affected inventory joins committed, working and untracked paths', () => {
  const paths = readChangedPaths({ environment: {}, gitText: args => {
    if (args.at(-1) === 'origin/main...HEAD') return 'canvas/src/committed.ts\0'
    if (args.at(-1) === 'HEAD') return 'canvas/src/working.ts\0'
    return 'scripts/new.mjs\0'
  } })
  assert.deepEqual(paths, ['canvas/src/committed.ts', 'canvas/src/working.ts', 'scripts/new.mjs'])
})

test('verified event base replaces moving refs and previous-commit guesses', () => {
  const base = 'a'.repeat(40), calls = []
  const paths = readChangedPaths({ baseRevision: base, environment: {
    GITHUB_ACTIONS: 'true', GITHUB_BASE_REF: 'main', GITHUB_EVENT_BEFORE: 'b'.repeat(40),
  }, gitText: args => { calls.push(args); return 'committed.ts\0deleted.ts\0' } })
  assert.deepEqual(calls, [['diff', '--no-renames', '--name-only', '-z', `${base}...HEAD`]])
  assert.deepEqual(paths, ['committed.ts', 'deleted.ts'])
  for (const invalid of ['main', '0'.repeat(40), '--all']) {
    assert.throws(() => readChangedPaths({ baseRevision: invalid, environment: {}, gitText: () => {
      assert.fail('invalid base must fail before Git')
    } }), /invalid validation base/)
  }
})

test('default and protected affected validation share one owner command map', () => {
  const pkg = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url)))
  const policy = JSON.parse(readFileSync(new URL('../../.agentic-os-validation.json', import.meta.url)))
  assert.equal(pkg.scripts.test, 'npm run ci:affected')
  assert.equal(pkg.scripts['test:all'], 'npm run test:ci --workspace=@agentic-graph/canvas')
  assert.equal(pkg.scripts['ci:affected'], 'node node_modules/agentic-os/bin/agentic-os-validation.mjs run')
  assert.equal(pkg.scripts['ci:affected:source'], 'node ./scripts/run-affected-ci.mjs')
  assert.ok(pkg.scripts['ci:integration'].endsWith('npm run ci:affected'))
  assert.deepEqual(policy.fallback, ['graph-owner-plan'])
  assert.equal(policy.checks.length, 1)
  assert.deepEqual(policy.checks[0].command, ['npm', 'run', 'ci:affected:source'])
  assert.equal(policy.checks[0].reuse, 'never')
})
