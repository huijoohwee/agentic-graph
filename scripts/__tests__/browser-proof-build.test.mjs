import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { existsSync, lstatSync, mkdtempSync, mkdirSync, readFileSync, realpathSync, rmSync, symlinkSync, unlinkSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import test from 'node:test'
import { BUILD_PHASE_LIMITS, produceBrowserProofBuild, verifyBrowserProofBuild } from '../browser-proof-build.mjs'
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
  const build = (revision = git('rev-parse', 'HEAD')) => {
    put('shared/dist/index.js', 'generated dependency')
    const files = [['index.html', '<script src="assets/pythonWorker-test.js"></script>'], ['assets/pythonWorker-test.js', 'worker'], ['sw.js', 'worker router'], ['agentic-graph-service-worker-revision.js', revision]]
    for (const [path, text] of files) put('canvas/dist/' + path, text)
    put(`canvas/dist/learning-offline-manifest-${revision}.json`, JSON.stringify({ schema: 'python-learning-offline/v1', revision, files: files.slice(0, 2).map(([path, text]) => ({ path, bytes: Buffer.byteLength(text), sha256: hash(text) })) }))
  }
  return { root, environment, git, put, build, readDocs, receipt: join(root, '.tmp/browser-proof-build/receipt.json'),
    produce: options => produceBrowserProofBuild({ root, environment, readDocs, runBuild: build, observe: () => {}, ...options }), verify: options => verifyBrowserProofBuild(root, { environment, readDocs, ...options }) }
}

function mergeFixture(t, { changedTree = false, reverseParents = false } = {}) {
  const f = fixture(t), base = f.git('rev-parse', 'HEAD')
  f.put('source.js', 'export default 2\n'); f.git('add', '.'); f.git('commit', '-qm', 'authored source')
  const revision = f.git('rev-parse', 'HEAD'), tree = f.git('rev-parse', 'HEAD^{tree}')
  const parents = reverseParents ? [revision, base] : [base, revision]
  const checkout = f.git('commit-tree', changedTree ? base + '^{tree}' : tree, '-p', parents[0], '-p', parents[1], '-m', 'provider merge')
  f.git('checkout', '--detach', '-q', checkout)
  const event = { pull_request: { base: { sha: base }, head: { sha: revision } } }
  const setEvent = value => f.put('.tmp/event.json', JSON.stringify(value))
  setEvent(event)
  const environment = { ...f.environment, GITHUB_ACTIONS: 'true', GITHUB_EVENT_NAME: 'pull_request',
    GITHUB_EVENT_PATH: join(f.root, '.tmp/event.json'), GITHUB_SHA: checkout, AGENTIC_OS_SOURCE_REVISION: revision }
  return { ...f, base, revision, tree, checkout, event, setEvent, environment,
    produce: options => f.produce({ environment, runBuild: () => f.build(revision), ...options }),
    verify: options => f.verify({ environment, ...options }) }
}

test('synthetic merge keeps checkout identity and verifies the authored runtime namespace', async t => {
  const f = mergeFixture(t), receipt = await f.produce()
  assert.equal(receipt.identity.revision, f.revision)
  assert.equal(receipt.identity.checkoutRevision, f.checkout)
  assert.equal(receipt.identity.tree, f.tree)
  const before = await f.verify(), after = await f.verify()
  assert.deepEqual(before, after)
  assert.equal(before.revision, f.revision); assert.equal(before.checkoutRevision, f.checkout)
})

for (const [name, options, mutate] of [
  ['unequal source tree', { changedTree: true }, () => {}],
  ['reversed parents', { reverseParents: true }, () => {}],
  ['missing CI context', {}, f => { delete f.environment.GITHUB_ACTIONS }],
  ['wrong provider checkout', {}, f => { f.environment.GITHUB_SHA = f.revision }],
  ['wrong event head', {}, f => f.setEvent({ pull_request: { ...f.event.pull_request, head: { sha: f.base } } })],
  ['wrong event base', {}, f => f.setEvent({ pull_request: { ...f.event.pull_request, base: { sha: f.revision } } })],
  ['unrelated same-tree revision', {}, f => { f.environment.AGENTIC_OS_SOURCE_REVISION = f.git('commit-tree', f.tree, '-m', 'unrelated') }],
]) test('synthetic merge rejects ' + name + ' before compilation', async t => {
  const f = mergeFixture(t, options); mutate(f); let builds = 0
  await assert.rejects(f.produce({ runBuild: () => { builds++ } }))
  assert.equal(builds, 0); assert.equal(existsSync(f.receipt), false)
})

test('synthetic merge revalidates event identity during and after a build', async t => {
  const f = mergeFixture(t); await f.produce()
  f.setEvent({ pull_request: { ...f.event.pull_request, head: { sha: f.base } } })
  await assert.rejects(() => f.verify())
  f.setEvent(f.event)
  await assert.rejects(f.produce({ runBuild: () => {
    f.build(f.revision); f.setEvent({ pull_request: { ...f.event.pull_request, base: { sha: f.revision } } })
  } }))
  assert.equal(existsSync(f.receipt), false)
})

test('synthetic merge refuses output named only for the checkout revision', async t => {
  const f = mergeFixture(t)
  await assert.rejects(f.produce({ runBuild: () => f.build() }), /output incomplete/)
  assert.equal(existsSync(f.receipt), false)
})

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
  await assert.rejects(() => f.verify({ environment: { ...f.environment, AGENTIC_OS_SOURCE_REVISION: 'a'.repeat(40) } }), /blocked-validation-ci-context/)
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


test('producer caches unchanged bytes only inside its invocation and reports bounded phases', async t => {
  const f = fixture(t), first = [], second = []
  await f.produce({ observe: event => first.push(event) }); await f.produce({ observe: event => second.push(event) })
  assert.deepEqual(BUILD_PHASE_LIMITS, { input: 60000, compile: 300000, output: 60000 })
  assert.deepEqual(first.map(event => [event.phase, event.status]), ['pre-build-inputs', 'compiler', 'post-build-verification']
    .flatMap(phase => [[phase, 'started'], [phase, 'completed']]))
  const input = first[1], output = first[5]
  assert.ok(input.readBytes > 0 && output.cacheHits > 0)
  assert.ok(output.readBytes < input.readBytes, 'unchanged source/compiler bytes are not read twice')
  assert.equal(second[1].readBytes, input.readBytes, 'a new invocation reads input bytes again')
  for (const event of first) assert.ok(event.elapsedMs >= 0 && event.elapsedMs <= event.budgetMs)
})

test('same-size dependency mutation with restored mtime invalidates the invocation cache', async t => {
  const f = fixture(t), file = join(f.root, 'node_modules/compiler/index.js'), fixedTime = 1000000000
  utimesSync(file, fixedTime, fixedTime); const before = lstatSync(file, { bigint: true })
  await assert.rejects(f.produce({ runBuild: async () => {
    f.build(); await new Promise(resolve => setTimeout(resolve, 3))
    f.put('node_modules/compiler/index.js', 'compiler-version-2'); utimesSync(file, fixedTime, fixedTime)
    const after = lstatSync(file, { bigint: true })
    assert.equal(after.size, before.size); assert.equal(after.mtimeNs, before.mtimeNs)
    assert.notEqual(after.ctimeNs, before.ctimeNs)
  } }), /inputs changed/)
  assert.equal(existsSync(f.receipt), false)
})

for (const [phase, limit] of [['pre-build-inputs', 'input'], ['compiler', 'compile'], ['post-build-verification', 'output']]) {
  test(`expired ${phase} refuses a success receipt and retains phase attribution`, async t => {
    const f = fixture(t); await f.produce(); let clock = 0, reads = 0, builds = 0; const events = []
    await assert.rejects(f.produce({ now: () => clock, observe: event => events.push(event),
      readDocs: async () => {
        reads++; if ((phase === 'pre-build-inputs' && reads === 1) || (phase === 'post-build-verification' && reads === 2))
          clock += BUILD_PHASE_LIMITS[limit] + 1
        return f.readDocs()
      }, runBuild: () => { builds++; f.build(); if (phase === 'compiler') clock += BUILD_PHASE_LIMITS.compile + 1 },
    }), new RegExp('phase timeout: ' + phase))
    assert.equal(events.at(-1).phase, phase); assert.equal(events.at(-1).status, 'failed')
    assert.equal(builds, phase === 'pre-build-inputs' ? 0 : 1); assert.equal(existsSync(f.receipt), false)
  })
}
