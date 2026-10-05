import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, mkdirSync, readFileSync, realpathSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import test from 'node:test'
import { produceBrowserProofBuild, verifyBrowserProofBuild } from '../browser-proof-build.mjs'
const hash = text => createHash('sha256').update(text).digest('hex')
function fixture(t) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'browser-build-proof-')))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim()
  const put = (path, text) => { mkdirSync(dirname(join(root, path)), { recursive: true }); writeFileSync(join(root, path), text) }
  put('.gitignore', '.tmp/\nnode_modules/\n**/dist/\n.env*\n')
  put('package.json', JSON.stringify({ private: true, workspaces: ['shared'] })); put('package-lock.json', '{}')
  put('shared/package.json', '{}'); put('source.js', 'export default 1\n')
  put('node_modules/compiler/index.js', 'compiler-version-1')
  symlinkSync('../shared', join(root, 'node_modules/shared'))
  git('init', '-q'); git('config', 'user.email', 'test@example.invalid'); git('config', 'user.name', 'Test')
  git('add', '.'); git('commit', '-qm', 'fixture')
  put('.tmp/docs.md', 'external admitted document')
  const readDocs = async () => ({ digest: hash(readFileSync(join(root, '.tmp/docs.md'))) })
  const environment = { PATH: process.env.PATH, NODE_OPTIONS: '--max-old-space-size=4096' }
  const build = () => {
    put('shared/dist/index.js', 'generated dependency')
    const files = [['index.html', '<script src="assets/pythonWorker-test.js"></script>'], ['assets/pythonWorker-test.js', 'worker'], ['sw.js', 'worker router'], ['agentic-graph-service-worker-revision.js', git('rev-parse', 'HEAD')]]
    for (const [path, text] of files) put('canvas/dist/' + path, text)
    put(`canvas/dist/learning-offline-manifest-${git('rev-parse', 'HEAD')}.json`, JSON.stringify({ schema: 'python-learning-offline/v1', revision: git('rev-parse', 'HEAD'), files: files.slice(0, 2).map(([path, text]) => ({ path, bytes: Buffer.byteLength(text), sha256: hash(text) })) }))
  }
  return { root, environment, git, put, build, receipt: join(root, '.tmp/browser-proof-build/receipt.json'),
    produce: options => produceBrowserProofBuild({ root, environment, readDocs, runBuild: build, ...options }), verify: options => verifyBrowserProofBuild(root, { environment, readDocs, ...options }) }
}

test('fresh build binds exact inputs and outputs', async t => {
  const f = fixture(t), receipt = await f.produce(), verified = await f.verify()
  assert.equal(receipt.authority, false); assert.equal(verified.revision, f.git('rev-parse', 'HEAD'))
  assert.equal(verified.artifactDigest, receipt.artifacts.digest); assert.ok(receipt.identity.dependency.bytes > 0)
})

for (const [name, mutate, expected] of [
  ['source bytes', f => f.put('source.js', 'changed'), /clean source/],
  ['committed candidate', f => { f.put('source.js', 'changed'); f.git('add', '.'); f.git('commit', '-qm', 'next') }, /inputs differ/],
  ['compiler bytes with unchanged lockfile', f => f.put('node_modules/compiler/index.js', 'compiler-version-2'), /inputs differ/],
  ['ignored environment file', f => f.put('.env.production.local', 'VITE_MODE=changed'), /inputs differ/],
  ['generated dependency', f => f.put('shared/dist/index.js', 'drift'), /generated dependencies differ/],
  ['service worker', f => f.put('canvas/dist/sw.js', 'drift'), /artifacts differ/],
  ['unmanifested output', f => f.put('canvas/dist/extra.js', 'drift'), /artifacts differ/],
  ['manifested output', f => f.put('canvas/dist/assets/pythonWorker-test.js', 'drift'), /manifest bytes differ/],
  ['missing service worker', f => unlinkSync(join(f.root, 'canvas/dist/sw.js')), /output incomplete/],
  ['external document bytes at the same path', f => f.put('.tmp/docs.md', 'drift'), /inputs differ/],
  ['configuration', f => f.git('config', 'core.autocrlf', 'true'), /inputs differ/],
]) {
  test(`rejects ${name} drift after successful producer`, async t => {
    const f = fixture(t); await f.produce(); mutate(f); await assert.rejects(() => f.verify(), expected)
  })
}

test('environment/revision drift fails; native ancestry is transport', async t => {
  const f = fixture(t); await f.produce()
  await assert.rejects(() => f.verify({ environment: { ...f.environment, VITE_BASE_PATH: '/' } }), /inputs differ/)
  await assert.rejects(() => f.verify({ environment: { ...f.environment, AGENTIC_OS_SOURCE_REVISION: 'a'.repeat(40) } }), /differs from HEAD/)
  assert.ok(await f.verify({ environment: { ...f.environment, AGENTIC_OS_COMMAND_ANCESTRY: '["transport"]' } }))
})

test('failed replacement invalidates an older successful receipt', async t => {
  const f = fixture(t); await f.produce()
  await assert.rejects(f.produce({ runBuild: () => { throw Error('compiler failed') } }), /compiler failed/)
  assert.equal(existsSync(f.receipt), false); await assert.rejects(() => f.verify(), /Missing/)
})

test('input drift during build prevents receipt', async t => {
  for (const path of ['source.js', 'node_modules/compiler/index.js']) {
    const f = fixture(t)
    await assert.rejects(f.produce({ runBuild: () => { f.build(); f.put(path, 'changed') } }), /clean source|inputs changed/)
    assert.equal(existsSync(f.receipt), false)
  }
})

test('partial build and invalid manifest fail', async t => {
  const f = fixture(t)
  await assert.rejects(f.produce({ runBuild: () => f.put('canvas/dist/index.html', 'partial') }), /output incomplete/)
  assert.equal(existsSync(f.receipt), false)
  await assert.rejects(f.produce({ runBuild: () => { f.build(); f.put(`canvas/dist/learning-offline-manifest-${f.git('rev-parse', 'HEAD')}.json`, '{}') } }), /manifest is invalid/)
})

test('output/dependency symlinks fail closed', async t => {
  const f = fixture(t); await f.produce()
  symlinkSync(process.execPath, join(f.root, 'canvas/dist/escaped'))
  await assert.rejects(() => f.verify(), /symlinks/); unlinkSync(join(f.root, 'canvas/dist/escaped'))
  const manifest = join(f.root, `canvas/dist/learning-offline-manifest-${f.git('rev-parse', 'HEAD')}.json`)
  unlinkSync(manifest); symlinkSync(join(f.root, 'node_modules/compiler/index.js'), manifest)
  await assert.rejects(() => f.verify(), /manifest rejects symlinks/); unlinkSync(manifest); f.build()
  symlinkSync(process.execPath, join(f.root, 'node_modules/escaped'))
  await assert.rejects(() => f.verify(), /Unsafe|escapes/)
})

test('receipt cannot follow symlink directory', async t => {
  const f = fixture(t), elsewhere = realpathSync(mkdtempSync(join(tmpdir(), 'build-proof-escape-')))
  t.after(() => rmSync(elsewhere, { recursive: true, force: true }))
  rmSync(join(f.root, '.tmp'), { recursive: true }); symlinkSync(elsewhere, join(f.root, '.tmp'))
  await assert.rejects(f.produce(), /unsafe/); assert.equal(existsSync(join(elsewhere, 'browser-proof-build')), false)
})

test('receipt size is bounded', async t => {
  const f = fixture(t); f.put('.tmp/browser-proof-build/receipt.json', ' '.repeat(16385))
  await assert.rejects(() => f.verify(), /oversized/)
})

test('manifest traversal fails', async t => {
  const f = fixture(t)
  await assert.rejects(f.produce({ runBuild: () => {
    f.build(); f.put(`canvas/dist/learning-offline-manifest-${f.git('rev-parse', 'HEAD')}.json`, JSON.stringify({ schema: 'python-learning-offline/v1', revision: f.git('rev-parse', 'HEAD'), files: [{ path: '../outside', bytes: 0, sha256: hash('') }] }))
  } }), /Unsafe/)
})
