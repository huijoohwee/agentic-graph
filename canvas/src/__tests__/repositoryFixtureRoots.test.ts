import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { resolvePinnedAgenticDocsRoot, resolveRepoSourcePath, resolveSiblingFixturePath } from '@/tests/lib/repoTestData'

const git = (cwd: string, ...args: string[]): string => execFileSync('git', args, {
  cwd,
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'pipe'],
}).trim()

const write = (file: string, text: string): void => {
  mkdirSync(path.dirname(file), { recursive: true })
  writeFileSync(file, text)
}

const initialize = (root: string): void => {
  mkdirSync(root, { recursive: true })
  git(root, 'init', '--initial-branch=main')
}

const commit = (root: string): string => {
  git(root, 'add', '.')
  git(root, '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', '-c', 'commit.gpgSign=false', 'commit', '-m', 'fixture')
  return git(root, 'rev-parse', 'HEAD')
}

const contract = (revision: string): string => `---
docs_dependency:
  repository: "https://github.com/huijoohwee/agentic-canvas-os.git"
  ref: "${revision}"
---
`

const withFixture = async (run: (fixture: {
  workspace: string
  canonical: string
  candidate: string
  docsRoot: string
  revision: string
}) => Promise<void>): Promise<void> => {
  const temporaryRoot = realpathSync(mkdtempSync(path.join(os.tmpdir(), 'graph-fixture-roots-')))
  try {
    const workspace = path.join(temporaryRoot, 'workspace')
    const canonical = path.join(workspace, 'agentic-graph')
    const candidate = path.join(workspace, '.worktrees', 'agentic-graph', 'candidate')
    const docsRepository = path.join(temporaryRoot, 'declared-docs')
    const docsRoot = path.join(docsRepository, 'docs')
    initialize(docsRepository)
    write(path.join(docsRoot, 'FACTS.md'), '# Pinned docs fixture\n')
    const revision = commit(docsRepository)
    git(docsRepository, 'remote', 'add', 'origin', 'https://github.com/huijoohwee/agentic-canvas-os.git')
    git(docsRepository, 'update-ref', 'refs/remotes/origin/main', revision)
    initialize(canonical)
    write(path.join(canonical, 'canvas/source.txt'), 'canonical')
    write(path.join(canonical, 'docs/runtime-readiness-contract.md'), contract(revision))
    commit(canonical)
    git(canonical, 'worktree', 'add', '--detach', candidate, 'HEAD')
    write(path.join(candidate, 'canvas/source.txt'), 'candidate')
    write(path.join(workspace, 'agentic-canvas-os/docs/FACTS.md'), '# Unverified sibling must not replace explicit docs\n')
    write(path.join(workspace, 'huijoohwee/_headers'), 'published headers')
    write(path.join(workspace, 'huijoohwee.github.io/template/contract.md'), 'declared template')
    await run({ workspace, canonical, candidate, docsRoot, revision })
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true })
  }
}

export async function testRepositoryFixturesPreserveCandidateAndSiblingSources(): Promise<void> {
  await withFixture(async ({ workspace, canonical, candidate }) => {
    assert.equal(readFileSync(resolveRepoSourcePath('canvas/source.txt', candidate), 'utf8'), 'candidate')
    assert.equal(readFileSync(path.join(canonical, 'canvas/source.txt'), 'utf8'), 'canonical')
    const headersPath = resolveSiblingFixturePath('huijoohwee', '_headers', candidate)
    assert.equal(headersPath, path.join(workspace, 'huijoohwee/_headers'))
    assert.equal(readFileSync(headersPath, 'utf8'), 'published headers')
    assert.equal(readFileSync(resolveSiblingFixturePath('huijoohwee.github.io', 'template/contract.md', candidate), 'utf8'), 'declared template')
    write(path.join(candidate, 'docs/missing-demo.md'), 'convenient alternate content')
    const missingPath = resolveSiblingFixturePath('huijoohwee', 'docs/missing-demo.md', candidate)
    assert.throws(() => readFileSync(missingPath, 'utf8'), (error: unknown) => {
      const failure = error as NodeJS.ErrnoException
      return failure.code === 'ENOENT' && failure.path === missingPath
    })
    assert.throws(() => resolveRepoSourcePath('../canonical/source.txt', candidate), /candidate-relative source path/)
  })
}

export async function testRepositoryFixturesRequireExactPinnedDocs(): Promise<void> {
  await withFixture(async ({ candidate, docsRoot, revision }) => {
    const env = { AGENTIC_OS_AGENTIC_CANVAS_OS_DOCS_ROOT: docsRoot }
    assert.equal(await resolvePinnedAgenticDocsRoot({ repositoryRoot: candidate, env }), docsRoot)
    const wrongPin = 'a'.repeat(40)
    write(path.join(candidate, 'docs/runtime-readiness-contract.md'), contract(wrongPin))
    await assert.rejects(resolvePinnedAgenticDocsRoot({ repositoryRoot: candidate, env }), (error: Error) => (
      error.message.includes(`expected pinned Agentic Canvas OS ${wrongPin}, got ${revision} at ${docsRoot}`)
    ))
    write(path.join(candidate, 'docs/runtime-readiness-contract.md'), contract(revision))
    const missingRoot = path.join(docsRoot, 'missing')
    await assert.rejects(resolvePinnedAgenticDocsRoot({ repositoryRoot: candidate, env: {
      AGENTIC_OS_AGENTIC_CANVAS_OS_DOCS_ROOT: missingRoot,
    } }), (error: Error) => error.message.includes(missingRoot) && error.message.includes('not a readable'))
    write(path.join(docsRoot, 'FACTS.md'), '# Dirty docs must not reuse prior validation\n')
    await assert.rejects(resolvePinnedAgenticDocsRoot({ repositoryRoot: candidate, env }), /uncommitted content/)
  })
}
