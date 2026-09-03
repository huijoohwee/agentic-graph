import assert from 'node:assert/strict'
import { appendFile, cp, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import test from 'node:test'

const sourceScriptsRoot = path.resolve(import.meta.dirname, '..')
const hygieneScript = 'check-hygiene-compliance.mjs'
const builtChunkBudgetScript = 'hygiene-built-chunk-budget.mjs'
const oversizedSource = Array.from({ length: 601 }, (_, index) => `export const line${index} = ${index}`).join('\n')

const run = (cwd, command, args, environment = {}) => {
  const result = spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, ...environment },
  })
  return {
    status: result.status,
    stdout: String(result.stdout || ''),
    stderr: String(result.stderr || ''),
  }
}

const runGit = (cwd, ...args) => {
  const result = run(cwd, 'git', args)
  assert.equal(result.status, 0, `${args.join(' ')}\n${result.stderr}`)
  return result
}

const runHygiene = (cwd, environment = {}) =>
  run(cwd, process.execPath, [path.join(cwd, 'scripts', hygieneScript), '--budget-only'], environment)

const createFixture = async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'agentic-graph-hygiene-rename-'))
  await mkdir(path.join(root, 'scripts'), { recursive: true })
  await mkdir(path.join(root, 'legacy'), { recursive: true })
  await cp(path.join(sourceScriptsRoot, hygieneScript), path.join(root, 'scripts', hygieneScript))
  await cp(path.join(sourceScriptsRoot, builtChunkBudgetScript), path.join(root, 'scripts', builtChunkBudgetScript))
  await writeFile(path.join(root, 'legacy', 'large.mjs'), oversizedSource)
  runGit(root, 'init')
  runGit(root, 'branch', '-M', 'main')
  runGit(root, 'add', '.')
  runGit(root, '-c', 'user.name=Hygiene Test', '-c', 'user.email=hygiene@example.invalid', 'commit', '-m', 'baseline')
  runGit(root, 'update-ref', 'refs/remotes/origin/main', 'HEAD')
  return root
}

const renameOversizedFile = async root => {
  await mkdir(path.join(root, 'renamed'), { recursive: true })
  runGit(root, 'mv', 'legacy/large.mjs', 'renamed/large.mjs')
}

test('hygiene preserves an existing oversized file budget across a local uncommitted rename', async () => {
  const root = await createFixture()
  try {
    await renameOversizedFile(root)
    const unchanged = runHygiene(root)
    assert.equal(unchanged.status, 0, unchanged.stderr)

    await appendFile(path.join(root, 'renamed', 'large.mjs'), '\n// actual growth')
    const grown = runHygiene(root)
    assert.equal(grown.status, 1)
    assert.match(grown.stderr, /renamed\/large\.mjs: 602 lines > 600, baseline 601/)
  } finally {
    await rm(root, { force: true, recursive: true })
  }
})

test('hygiene compares a committed branch rename with its GitHub base merge-base', async () => {
  const root = await createFixture()
  try {
    runGit(root, 'checkout', '-b', 'feature/rename-budget')
    await renameOversizedFile(root)
    runGit(root, 'commit', '-m', 'rename oversized source')

    const unchanged = runHygiene(root, { GITHUB_BASE_REF: 'main' })
    assert.equal(unchanged.status, 0, unchanged.stderr)

    await appendFile(path.join(root, 'renamed', 'large.mjs'), '\n// actual growth')
    runGit(root, 'add', 'renamed/large.mjs')
    runGit(root, 'commit', '-m', 'grow oversized source')
    const grown = runHygiene(root, { GITHUB_BASE_REF: 'main' })
    assert.equal(grown.status, 1)
    assert.match(grown.stderr, /renamed\/large\.mjs: 602 lines > 600, baseline 601/)
  } finally {
    await rm(root, { force: true, recursive: true })
  }
})
