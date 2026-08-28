import assert from 'node:assert/strict'
import path from 'node:path'
import test from 'node:test'
import { readContract, repoRoot } from '../collaboration-contract.mjs'
import { checkDevSourceConsistency, evaluateDevSourceConsistency, readDeclaredPinnedRef, resolveDevSourceMode } from '../dev-source-consistency.mjs'

const SHA_A = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
const SHA_B = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
const SHA_PIN = 'dddddddddddddddddddddddddddddddddddddddd'
const CANONICAL_ROOT = '/workspace/agenticgraph'

const sourceStates = ({ application = {}, docs = {} } = {}) => [
  {
    id: 'agenticgraph',
    root: CANONICAL_ROOT,
    canonicalRoot: CANONICAL_ROOT,
    canonicalOwnerPath: CANONICAL_ROOT,
    branch: 'main',
    headSha: SHA_A,
    canonicalSha: SHA_A,
    status: '',
    worktreeCount: 1,
    ...application,
  },
  {
    id: 'agentic-canvas-os-docs',
    root: '/workspace/agentic-canvas-os',
    canonicalRoot: '/workspace/agentic-canvas-os',
    canonicalOwnerPath: '/workspace/agentic-canvas-os',
    branch: 'main',
    headSha: SHA_A,
    canonicalSha: SHA_A,
    status: '',
    worktreeCount: 1,
    ...docs,
  },
]

test('canonical Dev source accepts only clean application and docs checkouts at fetched origin main SHAs', async () => {
  const contract = await readContract()
  const result = evaluateDevSourceConsistency(sourceStates(), contract, 'canonical')

  assert.equal(result.canonical, true)
  assert.match(result.message, /agenticgraph=origin\/main@aaaaaaaaaaaa/)
  assert.match(result.message, /agentic-canvas-os-docs=origin\/main@aaaaaaaaaaaa/)
})

test('canonical Dev source accepts the declared docs pin when it is an ancestor of fetched origin main', async () => {
  const contract = await readContract()
  const result = evaluateDevSourceConsistency(sourceStates({
    docs: { headSha: SHA_PIN, pinnedRef: SHA_PIN, pinnedRefIsAncestor: true },
  }), contract, 'canonical')

  assert.equal(result.canonical, true)
  assert.match(result.message, /agenticgraph=origin\/main@aaaaaaaaaaaa/)
  assert.match(result.message, /agentic-canvas-os-docs=pin@dddddddddddd \(ancestor of origin\/main@aaaaaaaaaaaa\)/)
})

test('canonical Dev source rejects a declared docs pin that is not an ancestor of fetched origin main', async () => {
  const contract = await readContract()
  assert.throws(() => evaluateDevSourceConsistency(sourceStates({
    docs: { headSha: SHA_PIN, pinnedRef: SHA_PIN, pinnedRefIsAncestor: false },
  }), contract, 'canonical'), /agentic-canvas-os-docs canonical Dev source mismatch/)
  assert.throws(() => evaluateDevSourceConsistency(sourceStates({
    docs: { headSha: SHA_B, pinnedRef: SHA_PIN, pinnedRefIsAncestor: true },
  }), contract, 'canonical'), /agentic-canvas-os-docs canonical Dev source mismatch/)
})

test('the application source is never relaxed to a pin', async () => {
  const contract = await readContract()
  assert.throws(() => evaluateDevSourceConsistency(sourceStates({
    application: { headSha: SHA_PIN, pinnedRef: SHA_PIN, pinnedRefIsAncestor: true },
  }), contract, 'canonical'), /agenticgraph canonical Dev source mismatch/)
})

test('declared pins are read conservatively from the contract-named frontmatter file', async () => {
  const source = { id: 'agentic-canvas-os-docs', pinned_ref_allowed: true, pinned_ref_frontmatter: 'docs/runtime-readiness-contract.md' }
  const document = ref => `---\ndocs_dependency:\n  ref: "${ref}"\n---\nbody\n`
  assert.equal(await readDeclaredPinnedRef(source, { readFile: async () => document(SHA_PIN) }), SHA_PIN)
  assert.equal(await readDeclaredPinnedRef(source, { readFile: async () => document('not-a-sha') }), null)
  assert.equal(await readDeclaredPinnedRef(source, { readFile: async () => 'no frontmatter' }), null)
  assert.equal(await readDeclaredPinnedRef(source, { readFile: async () => { throw new Error('missing') } }), null)
  assert.equal(await readDeclaredPinnedRef({ ...source, pinned_ref_allowed: false }, { readFile: async () => document(SHA_PIN) }), null)
})

test('canonical Dev source rejects stale or dirty checkouts before any port can serve them', async () => {
  const contract = await readContract()
  assert.throws(() => evaluateDevSourceConsistency(sourceStates({
    application: { canonicalSha: SHA_B },
  }), contract, 'canonical'), /Run npm run dev:latest to fast-forward clean canonical checkouts safely/)
  assert.throws(() => evaluateDevSourceConsistency(sourceStates({
    docs: { status: ' M docs\/FACTS.md' },
  }), contract, 'canonical'), /agentic-canvas-os-docs source requires a clean worktree/)
})

test('canonical Dev rejects a linked main owner outside the primary repository path', async () => {
  const contract = await readContract()
  assert.throws(() => evaluateDevSourceConsistency(sourceStates({
    application: {
      root: '/workspace/.worktrees/agenticgraph/canonical-main-release',
      canonicalOwnerPath: '/workspace/.worktrees/agenticgraph/canonical-main-release',
    },
  }), contract, 'canonical'), error => {
    assert.match(error.message, /^blocked-canonical-path:/)
    assert.match(error.message, /canonical agenticgraph Dev must run from \/workspace\/agenticgraph/)
    return true
  })
})

test('canonical Dev rejects a checkout when no registered main owner exists', async () => {
  const contract = await readContract()
  assert.throws(() => evaluateDevSourceConsistency(sourceStates({
    application: { canonicalOwnerPath: null },
  }), contract, 'canonical'), error => {
    assert.match(error.message, /^blocked-canonical-path:/)
    assert.match(error.message, /registered main owner is unavailable/)
    return true
  })
})

test('all source modes accept multiple registered worktrees with isolated branches', async () => {
  const contract = await readContract()
  const canonical = evaluateDevSourceConsistency(sourceStates({
    application: { worktreeCount: 2 },
  }), contract, 'canonical')
  assert.equal(canonical.canonical, true)
  const task = evaluateDevSourceConsistency(sourceStates({
    application: {
      root: '/workspace/.worktrees/agenticgraph/dev-source-consistency',
      canonicalOwnerPath: '/workspace/.worktrees/agenticgraph/canonical-main-release',
      branch: 'agent/macbook/dev-source-consistency',
      headSha: SHA_B,
      worktreeCount: 2,
    },
  }), contract, 'task')
  assert.equal(task.canonical, false)
  assert.match(task.message, /task preview only; not canonical Dev or release proof/)
})

test('task mode allows application divergence but keeps Agentic Canvas OS docs canonical', async () => {
  const contract = await readContract()
  const result = evaluateDevSourceConsistency(sourceStates({
    application: {
      branch: 'agent/macbook/dev-source-consistency',
      headSha: SHA_B,
      status: ' M package.json',
    },
  }), contract, 'task')

  assert.equal(result.canonical, false)
  assert.match(result.message, /agenticgraph=task:agent\/macbook\/dev-source-consistency@bbbbbbbbbbbb/)
  assert.match(result.message, /agentic-canvas-os-docs=origin\/main@aaaaaaaaaaaa/)
  assert.throws(() => evaluateDevSourceConsistency(sourceStates({
    application: { branch: 'feature/dev-source-consistency' },
  }), contract, 'task'), /branch must satisfy/)
  assert.throws(() => evaluateDevSourceConsistency(sourceStates({
    application: { branch: 'agent/macbook/dev-source-consistency' },
    docs: { canonicalSha: SHA_B },
  }), contract, 'task'), /agentic-canvas-os-docs canonical Dev source mismatch/)
})

test('Dev mode defaults to task only for contract-valid application task branches', async () => {
  const contract = await readContract()
  const taskSources = sourceStates({
    application: {
      branch: 'agent/macbook/dev-source-consistency',
      headSha: SHA_B,
      status: ' M package.json',
    },
  })

  assert.equal(resolveDevSourceMode(taskSources, contract, {}), 'task')
  assert.equal(resolveDevSourceMode(sourceStates({
    application: { status: ' M package.json' },
  }), contract, {}), 'canonical')
  assert.equal(resolveDevSourceMode(taskSources, contract, { AG_DEV_SOURCE_MODE: 'canonical' }), 'canonical')
})

test('source collection fetches and identifies both repositories from the shared contract', async () => {
  const calls = []
  const git = (args, cwd) => {
    calls.push({ args, cwd })
    if (args[0] === 'rev-parse' && args.includes('--git-common-dir')) {
      return path.join(repoRoot, '.git')
    }
    if (args[0] === 'branch') return cwd === repoRoot ? 'main' : 'main'
    if (args[1] === 'HEAD') return SHA_A
    if (args[1]?.startsWith('refs/remotes/')) return SHA_A
    if (args[0] === 'status') return ''
    if (args[0] === 'worktree') return `worktree ${cwd}\nHEAD ${SHA_A}\nbranch refs/heads/main`
    return ''
  }
  const checkedPaths = []
  const result = await checkDevSourceConsistency({
    environment: {},
    git,
    pathCheck: async targetPath => checkedPaths.push(targetPath),
  })

  const docsRoot = path.resolve(repoRoot, '../agentic-canvas-os')
  assert.equal(result.canonical, true)
  assert.deepEqual(checkedPaths, [repoRoot, path.join(docsRoot, 'docs')])
  assert.deepEqual(calls.filter(call => call.args[0] === 'fetch'), [
    { args: ['fetch', '--quiet', 'origin', 'main'], cwd: repoRoot },
    { args: ['fetch', '--quiet', 'origin', 'main'], cwd: docsRoot },
  ])
  assert.equal(calls.filter(call => call.args[0] === 'worktree').length, 2)
  assert.equal(calls.filter(call => call.args.includes('--git-common-dir')).length, 1)
})

test('unknown source modes fail closed', async () => {
  const contract = await readContract()
  assert.throws(() => evaluateDevSourceConsistency(sourceStates(), contract, 'loose'), /must be canonical or task/)
})
