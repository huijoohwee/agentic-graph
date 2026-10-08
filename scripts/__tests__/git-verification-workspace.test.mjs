import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import {
  assertGitVerificationWorkspace,
  createGitVerificationWorkspace,
  createHistoricalGitVerificationWorkspace,
} from '../lib/git-verification-workspace.mjs'
import { captureGitRepositoryState } from '../lib/git-repository-state.mjs'

function git(root, ...args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: 'pipe' }).trim()
}

async function fixture(t) {
  const parent = await mkdtemp(path.join(os.tmpdir(), 'verification-history-'))
  t.after(() => rm(parent, { recursive: true, force: true }))
  const root = path.join(parent, 'source')
  await mkdir(root)
  git(root, 'init', '--quiet', '-b', 'main')
  git(root, 'config', 'user.email', 'verification@example.invalid')
  git(root, 'config', 'user.name', 'Verification Fixture')
  git(root, 'config', 'gc.auto', '0')
  await mkdir(path.join(root, 'node_modules'))
  await writeFile(path.join(root, '.gitignore'), 'node_modules/\n')
  await writeFile(path.join(root, 'source.txt'), 'baseline bytes\n')
  git(root, 'add', '.')
  git(root, 'commit', '--quiet', '-m', 'baseline')
  const baseline = git(root, 'rev-parse', 'HEAD')
  const baselineTree = git(root, 'rev-parse', 'HEAD^{tree}')
  await writeFile(path.join(root, 'source.txt'), 'current bytes\n')
  git(root, 'commit', '--quiet', '-am', 'current')
  return { root, parent, baseline, baselineTree, head: git(root, 'rev-parse', 'HEAD') }
}

async function children(parent) {
  return (await readdir(parent)).filter(name => name.startsWith('.agentic-graph-flight-verification-'))
}

test('current verification retains its branch and binds fixture and caller trees', async t => {
  const f = await fixture(t)
  const workspace = await createGitVerificationWorkspace(f.root)
  try {
    const receipt = await assertGitVerificationWorkspace({ repositoryRoot: workspace.repositoryRoot, token: workspace.token })
    assert.equal(receipt.branch, 'main')
    assert.equal(receipt.head, f.head)
    assert.equal(receipt.tree, git(f.root, 'rev-parse', 'HEAD^{tree}'))
    assert.equal(receipt.caller.head, f.head)
  } finally { await workspace.dispose() }
  assert.deepEqual(await children(f.parent), [])
})

test('historical verification materializes exact ancestor bytes without changing the caller', async t => {
  const f = await fixture(t)
  const before = await captureGitRepositoryState(f.root)
  const workspace = await createHistoricalGitVerificationWorkspace(f.root, f.baseline)
  try {
    const receipt = await assertGitVerificationWorkspace({ repositoryRoot: workspace.repositoryRoot, token: workspace.token })
    assert.equal(receipt.head, f.baseline)
    assert.equal(receipt.tree, f.baselineTree)
    assert.equal(receipt.branch, '')
    assert.equal(receipt.caller.head, f.head)
    assert.equal(receipt.caller.branch, 'main')
    assert.equal(await readFile(path.join(workspace.repositoryRoot, 'source.txt'), 'utf8'), 'baseline bytes\n')
    await writeFile(path.join(workspace.repositoryRoot, 'node_modules', 'built.tmp'), 'child-only output')
    await assert.rejects(readFile(path.join(f.root, 'node_modules', 'built.tmp')), { code: 'ENOENT' })
  } finally { await workspace.dispose() }
  assert.deepEqual(await captureGitRepositoryState(f.root), before)
  assert.equal(git(f.root, 'branch', '--show-current'), 'main')
  assert.deepEqual(await children(f.parent), [])
})

test('historical verification rejects malformed, unrelated, and dirty inputs before allocation', async t => {
  const f = await fixture(t)
  git(f.root, 'checkout', '--quiet', '-b', 'unrelated', f.baseline)
  await writeFile(path.join(f.root, 'source.txt'), 'divergent bytes\n')
  git(f.root, 'commit', '--quiet', '-am', 'divergent')
  const unrelated = git(f.root, 'rev-parse', 'HEAD')
  git(f.root, 'checkout', '--quiet', 'main')
  await assert.rejects(createHistoricalGitVerificationWorkspace(f.root, 'HEAD~1'), /exact commit revision/)
  await assert.rejects(createHistoricalGitVerificationWorkspace(f.root, unrelated), /caller ancestor commit/)
  await writeFile(path.join(f.root, 'source.txt'), 'dirty caller bytes\n')
  await assert.rejects(createHistoricalGitVerificationWorkspace(f.root, f.baseline), /clean caller checkout/)
  assert.deepEqual(await children(f.parent), [])
  assert.equal(git(f.root, 'rev-parse', 'HEAD'), f.head)
  assert.equal(await readFile(path.join(f.root, 'source.txt'), 'utf8'), 'dirty caller bytes\n')
})

test('verification rejects changed fixture identity and changed caller branch', async t => {
  const f = await fixture(t)
  const workspace = await createHistoricalGitVerificationWorkspace(f.root, f.baseline)
  try {
    git(workspace.repositoryRoot, 'checkout', '--quiet', '--detach', f.head)
    await assert.rejects(assertGitVerificationWorkspace({ repositoryRoot: workspace.repositoryRoot, token: workspace.token }), /exact isolation attestation/)
    git(workspace.repositoryRoot, 'checkout', '--quiet', '--detach', f.baseline)
    git(f.root, 'checkout', '--quiet', '-b', 'changed-caller')
    await assert.rejects(assertGitVerificationWorkspace({ repositoryRoot: workspace.repositoryRoot, token: workspace.token }), /caller identity changed/)
  } finally { await workspace.dispose() }
})

test('historical verification preserves dependency link isolation and cleans a failed child', async t => {
  const f = await fixture(t)
  const external = path.join(f.parent, 'external-package')
  await mkdir(external)
  await symlink(external, path.join(f.root, 'node_modules', 'escaping-package'))
  await assert.rejects(createHistoricalGitVerificationWorkspace(f.root, f.baseline), /dependency link escapes isolation/)
  assert.deepEqual(await children(f.parent), [])
  assert.equal(git(f.root, 'rev-parse', 'HEAD'), f.head)
})
