import assert from 'node:assert/strict'
import path from 'node:path'
import test from 'node:test'
import { readContract, repoRoot } from '../collaboration-contract.mjs'
import { planDevCanonicalSourceFastForwards, syncDevCanonicalSources } from '../sync-dev-canonical-sources.mjs'

const SHA_A = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
const SHA_B = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'

const sourceStates = ({ application = {}, docs = {} } = {}) => [
  {
    id: 'agenticgraph',
    sourceRoot: repoRoot,
    branch: 'main',
    headSha: SHA_A,
    canonicalSha: SHA_B,
    mergeBaseSha: SHA_A,
    status: '',
    worktreeCount: 1,
    ...application,
  },
  {
    id: 'agentic-canvas-os-docs',
    sourceRoot: path.resolve(repoRoot, '../agentic-canvas-os'),
    branch: 'main',
    headSha: SHA_A,
    canonicalSha: SHA_B,
    mergeBaseSha: SHA_A,
    status: '',
    worktreeCount: 1,
    ...docs,
  },
]

test('dev latest plans only clean canonical branches with fast-forward ancestry', async () => {
  const contract = await readContract()
  const plan = planDevCanonicalSourceFastForwards(sourceStates(), contract)

  assert.equal(plan.length, 2)
  assert.equal(plan.every(source => source.updateRequired), true)
  assert.equal(plan[0].canonicalRef, 'refs/remotes/origin/main')
})

test('dev latest rejects dirt, task branches, divergence, and unsafe worktree registrations', async () => {
  const contract = await readContract()
  assert.throws(() => planDevCanonicalSourceFastForwards(sourceStates({
    application: { status: ' M package.json' },
  }), contract), /requires a clean worktree/)
  assert.throws(() => planDevCanonicalSourceFastForwards(sourceStates({
    application: { branch: 'agent/macbook/dev-latest' },
  }), contract), /must be on main for dev:latest/)
  assert.throws(() => planDevCanonicalSourceFastForwards(sourceStates({
    application: { mergeBaseSha: 'cccccccccccccccccccccccccccccccccccccccc' },
  }), contract), /cannot fast-forward/)
  assert.throws(() => planDevCanonicalSourceFastForwards(sourceStates({
    docs: {
      worktreeCount: 2,
      worktrees: [
        { path: '/docs', head: SHA_A, branch: 'refs/heads/main' },
        { path: '/docs-copy', head: SHA_B, branch: 'refs/heads/main' },
      ],
    },
  }), contract), /one branch checked out in multiple worktrees/)
})

test('dev latest inspects every source before applying any fast-forward', async () => {
  const docsRoot = path.resolve(repoRoot, '../agentic-canvas-os')
  const calls = []
  const git = (args, cwd) => {
    calls.push({ args, cwd })
    if (args[0] === 'rev-parse' && args[1] === 'HEAD') return SHA_A
    if (args[0] === 'rev-parse') return SHA_B
    if (args[0] === 'merge-base') return SHA_A
    if (args[0] === 'branch') return 'main'
    if (args[0] === 'status') return cwd === docsRoot ? ' M docs/FACTS.md' : ''
    if (args[0] === 'worktree') return `worktree ${cwd}\nHEAD ${SHA_A}\nbranch refs/heads/main`
    return ''
  }

  await assert.rejects(syncDevCanonicalSources({ git, pathCheck: async () => {} }), /requires a clean worktree/)
  assert.equal(calls.some(call => call.args[0] === 'merge'), false)
})

test('dev latest fetches both sources and fast-forwards each planned checkout', async () => {
  const docsRoot = path.resolve(repoRoot, '../agentic-canvas-os')
  const calls = []
  const git = (args, cwd) => {
    calls.push({ args, cwd })
    if (args[0] === 'rev-parse' && args[1] === 'HEAD') return SHA_A
    if (args[0] === 'rev-parse') return SHA_B
    if (args[0] === 'merge-base') return SHA_A
    if (args[0] === 'branch') return 'main'
    if (args[0] === 'status') return ''
    if (args[0] === 'worktree') return `worktree ${cwd}\nHEAD ${SHA_A}\nbranch refs/heads/main`
    return ''
  }

  const result = await syncDevCanonicalSources({ git, pathCheck: async () => {} })
  assert.match(result.message, /agenticgraph=origin\/main@bbbbbbbbbbbb \(fast-forwarded\)/)
  assert.deepEqual(calls.filter(call => call.args[0] === 'fetch'), [
    { args: ['fetch', '--quiet', '--prune', 'origin', 'main'], cwd: repoRoot },
    { args: ['fetch', '--quiet', '--prune', 'origin', 'main'], cwd: docsRoot },
  ])
  assert.deepEqual(calls.filter(call => call.args[0] === 'merge'), [
    { args: ['merge', '--ff-only', 'refs/remotes/origin/main'], cwd: repoRoot },
    { args: ['merge', '--ff-only', 'refs/remotes/origin/main'], cwd: docsRoot },
  ])
})
