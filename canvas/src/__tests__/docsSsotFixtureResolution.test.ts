import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  clearDocsSsotFixtureCache,
  readDocsSsotFixtureText,
  resolveDocsSsotFixturePath,
  resolveDocsSsotRootPath,
} from '@/tests/lib/docsSsotFixture'
import { resolveSiblingFixturePath } from '@/tests/lib/repoTestData'

const ENV_KEYS = [
  'AG_TEST_DOCS_SSOT_ROOT', 'AGENTIC_OS_PUBLISHED_DOCS_ROOT',
  'AG_TEST_DOCS_SSOT_STORAGE_BASE_URL', 'AG_TEST_DOCS_SSOT_CACHE_DIR',
  'AG_TEST_DOCS_SSOT_WORKSPACE_ID', 'AG_TEST_DOCS_SSOT_CANONICAL_PREFIX', 'PATH',
] as const

const withFixtureDirectory = (run: (root: string) => void): void => {
  const saved = ENV_KEYS.map(key => [key, process.env[key]] as const)
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'graph-docs-fixture-test-'))
  try {
    for (const key of ENV_KEYS) if (key !== 'PATH') delete process.env[key]
    run(root)
  } finally {
    clearDocsSsotFixtureCache()
    for (const [key, value] of saved) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
    fs.rmSync(root, { recursive: true, force: true })
  }
}

export function testDocsSsotFixtureLocalReadsStayFreshAcrossRoots(): void {
  withFixtureDirectory(root => {
    const firstRoot = path.join(root, 'first')
    const secondRoot = path.join(root, 'second')
    fs.mkdirSync(firstRoot)
    fs.mkdirSync(secondRoot)
    const name = 'sample.md'
    fs.writeFileSync(path.join(firstRoot, name), '\uFEFF# first\n\u0000')
    fs.writeFileSync(path.join(secondRoot, name), '# second')
    process.env.AG_TEST_DOCS_SSOT_ROOT = firstRoot
    assert.equal(readDocsSsotFixtureText(name), '\uFEFF# first\n\u0000')
    assert.equal(resolveDocsSsotFixturePath(name), path.join(firstRoot, name))
    fs.writeFileSync(path.join(firstRoot, name), '# changed')
    assert.equal(readDocsSsotFixtureText(name), '# changed')
    process.env.AG_TEST_DOCS_SSOT_ROOT = secondRoot
    assert.equal(readDocsSsotFixtureText(name), '# second')
    delete process.env.AG_TEST_DOCS_SSOT_ROOT
    process.env.AGENTIC_OS_PUBLISHED_DOCS_ROOT = firstRoot
    assert.equal(resolveDocsSsotRootPath(), firstRoot)
    assert.equal(readDocsSsotFixtureText(name), '# changed')
  })
}

export function testDocsSsotFixtureMissingAndInvalidLocalInputsFailWithoutNetwork(): void {
  withFixtureDirectory(root => {
    process.env.AG_TEST_DOCS_SSOT_ROOT = root
    process.env.PATH = root
    assert.throws(() => readDocsSsotFixtureText('missing.md'), /required local docs fixture is unavailable/)
    assert.throws(() => readDocsSsotFixtureText('../outside.md'), /expected docs fixture basename/)
    assert.throws(() => readDocsSsotFixtureText('nested\\outside.md'), /expected docs fixture basename/)
    fs.mkdirSync(path.join(root, 'directory.md'))
    assert.throws(() => readDocsSsotFixtureText('directory.md'), /regular file/)
    fs.writeFileSync(path.join(root, 'oversized.md'), Buffer.alloc(500_000, 65))
    assert.throws(() => readDocsSsotFixtureText('oversized.md'), /exceeds 499999 bytes/)
    fs.writeFileSync(path.join(root, 'empty.md'), ' \n')
    assert.throws(() => readDocsSsotFixtureText('empty.md'), /contain markdown text/)
    fs.writeFileSync(path.join(root, 'invalid.md'), Buffer.from([0xff]))
    assert.throws(() => readDocsSsotFixtureText('invalid.md'), /valid UTF-8/)
    fs.symlinkSync(path.join(root, 'empty.md'), path.join(root, 'link.md'))
    assert.throws(() => readDocsSsotFixtureText('link.md'), /required local docs fixture is unavailable/)

    const changingPath = path.join(root, 'changing.md')
    fs.writeFileSync(changingPath, '# before')
    const originalRead = fs.readSync
    try {
      fs.readSync = ((...args: Parameters<typeof fs.readSync>) => {
        const count = originalRead(...args)
        fs.writeFileSync(changingPath, '# after!')
        return count
      }) as typeof fs.readSync
      assert.throws(() => readDocsSsotFixtureText('changing.md'), /changed during read/)
    } finally { fs.readSync = originalRead }
  })
}

export function testDocsSsotFixtureDefaultRootUsesCanonicalWorkspaceOwner(): void {
  withFixtureDirectory(() => {
    assert.equal(resolveDocsSsotRootPath(), resolveSiblingFixturePath('huijoohwee', 'docs'))
    assert.ok(!resolveDocsSsotRootPath().includes('/.worktrees/'))
  })
}

export function testDocsSsotFixtureExplicitRemoteRefreshesSourceWithoutLiveCalls(): void {
  withFixtureDirectory(root => {
    const bin = path.join(root, 'bin')
    const source = path.join(root, 'response.md')
    fs.mkdirSync(bin)
    fs.writeFileSync(source, '# first remote fixture')
    fs.writeFileSync(path.join(bin, 'curl'), `#!${process.execPath}\nprocess.stdout.write(require('node:fs').readFileSync(${JSON.stringify(source)}));\n`, { mode: 0o700 })
    process.env.PATH = bin
    process.env.AG_TEST_DOCS_SSOT_CACHE_DIR = path.join(root, 'cache')
    process.env.AG_TEST_DOCS_SSOT_STORAGE_BASE_URL = 'https://fixture.invalid'
    assert.equal(readDocsSsotFixtureText('same.md'), '# first remote fixture')
    fs.writeFileSync(source, '# changed remote fixture')
    assert.equal(readDocsSsotFixtureText('same.md'), '# changed remote fixture')
    const firstPath = resolveDocsSsotFixturePath('same.md')
    process.env.AG_TEST_DOCS_SSOT_STORAGE_BASE_URL = 'https://other-fixture.invalid'
    const secondPath = resolveDocsSsotFixturePath('same.md')
    assert.notEqual(firstPath, secondPath)
    assert.equal(fs.readFileSync(firstPath, 'utf8'), '# changed remote fixture')
    process.env.AG_TEST_DOCS_SSOT_STORAGE_BASE_URL = 'file:///private/source'
    assert.throws(() => readDocsSsotFixtureText('same.md'), /explicit HTTP\(S\)/)
    process.env.AG_TEST_DOCS_SSOT_STORAGE_BASE_URL = 'https://fixture.invalid'
    for (let index = 0; index < 62; index += 1) resolveDocsSsotFixturePath(`bounded-${index}.md`)
    assert.throws(() => resolveDocsSsotFixturePath('overflow.md'), /path limit reached: 64/)
    const unrelated = path.join(root, 'cache', 'user-authored.md')
    fs.writeFileSync(unrelated, '# preserved')
    clearDocsSsotFixtureCache()
    assert.equal(fs.readFileSync(unrelated, 'utf8'), '# preserved')
    assert.ok(!fs.existsSync(firstPath))
  })
}
