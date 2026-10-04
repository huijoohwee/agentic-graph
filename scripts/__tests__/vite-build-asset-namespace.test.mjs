import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { rollup } from 'rollup'
import { spawnSync } from 'node:child_process'
import {
  assertBuiltJavaScriptBudget, assertChunkGraphAcyclic, boundedChunksPlugin, dependencyComponents,
  extractDeferredParserFactories, extractStaticPayload, inspectBuiltJavaScript, partitionModuleGraph,
} from '../../canvas/viteBoundedChunks.mjs'

import {
  buildVersionedAssetFileNames,
  resolveBuildAssetNamespace,
} from '../../canvas/viteBuildAssetNamespace.mjs'
import {
  buildServiceWorkerRevisionAuthoritySource,
  SERVICE_WORKER_REVISION_REQUEST,
  SERVICE_WORKER_REVISION_RESPONSE,
} from '../../canvas/viteServiceWorkerRevisionAuthority.mjs'
import { isBuiltJavaScriptPath, resolveBuiltChunkBudget } from '../hygiene-built-chunk-budget.mjs'

const SOURCE_REVISION = '0123456789abcdef0123456789abcdef01234567'

test('build assets are isolated under the exact source revision', () => {
  assert.equal(resolveBuildAssetNamespace(SOURCE_REVISION), `assets/${SOURCE_REVISION}`)
  assert.deepEqual(buildVersionedAssetFileNames(SOURCE_REVISION), {
    entryFileNames: `assets/${SOURCE_REVISION}/[name]-[hash].js`,
    chunkFileNames: `assets/${SOURCE_REVISION}/[name]-[hash].js`,
    assetFileNames: `assets/${SOURCE_REVISION}/[name]-[hash][extname]`,
  })
})

test('application and worker bundles share the exact revision namespace', () => {
  const viteConfig = fs.readFileSync(new URL('../../canvas/vite.config.ts', import.meta.url), 'utf8')
  const versionedOutputReferences = viteConfig.match(
    /buildVersionedAssetFileNames\(runtimeIdentity\.sourceRevision\)/g,
  ) || []

  assert.equal(versionedOutputReferences.length, 2)
  assert.match(
    viteConfig,
    /worker: \{[\s\S]*?rollupOptions: \{ output: \{ \.\.\.buildVersionedAssetFileNames\(runtimeIdentity\.sourceRevision\) \} \}/,
  )
})

test('build asset isolation fails closed without an exact revision', () => {
  for (const revision of ['', 'main', SOURCE_REVISION.slice(0, 12), SOURCE_REVISION.toUpperCase()]) {
    assert.throws(
      () => resolveBuildAssetNamespace(revision),
      /exact 40-character source revision SHA/,
    )
  }
})

test('service-worker revision authority is generated from the same exact source namespace', () => {
  const source = buildServiceWorkerRevisionAuthoritySource(SOURCE_REVISION)
  assert.match(source, new RegExp(`const sourceRevision = "${SOURCE_REVISION}"`))
  assert.match(source, new RegExp(SERVICE_WORKER_REVISION_REQUEST))
  assert.match(source, new RegExp(SERVICE_WORKER_REVISION_RESPONSE))
  for (const revision of ['', 'main', SOURCE_REVISION.slice(0, 12), SOURCE_REVISION.toUpperCase()]) {
    assert.throws(
      () => buildServiceWorkerRevisionAuthoritySource(revision),
      /exact source revision/,
    )
  }
})

test('chunk budgets recognize exact-revision asset namespaces', () => {
  const versionedPath = `canvas/dist/assets/${SOURCE_REVISION}/monaco-build.js`
  const legacyPath = 'canvas/dist/assets/monaco-build.js'
  assert.deepEqual(resolveBuiltChunkBudget(versionedPath), resolveBuiltChunkBudget(legacyPath))
  assert.equal(resolveBuiltChunkBudget(versionedPath).reason, 'lazy Monaco editor vendor chunk')
  assert.equal(
    resolveBuiltChunkBudget(`canvas/dist/assets/${SOURCE_REVISION.toUpperCase()}/monaco-build.js`).reason,
    'default asset budget',
  )
})

test('all JavaScript names use the strict decimal byte limit, including equality', () => {
  for (const name of ['index', 'monaco', 'maplibre', 'transformers', 'worker', 'mermaid', 'runtime']) {
    assert.equal(resolveBuiltChunkBudget(`canvas/dist/assets/${SOURCE_REVISION}/${name}-build.js`).limit, 499_999)
  }
  assert.doesNotThrow(() => assertBuiltJavaScriptBudget([{ file: 'worker.js', bytes: 499_999 }]))
  assert.throws(() => assertBuiltJavaScriptBudget([{ file: 'worker.js', bytes: 500_000 }]), /500000/)
  for (const extension of ['js', 'mjs', 'cjs', 'MJS', 'CJS']) {
    assert.equal(isBuiltJavaScriptPath(`worker.${extension}`), true)
    assert.equal(resolveBuiltChunkBudget(`canvas/dist/xr-v2/wasm/worker.${extension}`).limit, 499_999)
  }
  assert.equal(isBuiltJavaScriptPath('worker.js.map'), false)
  assert.equal(isBuiltJavaScriptPath('model.wasm'), false)
})

test('final scan includes copied runtime and worker JavaScript outside the assets namespace', async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'agentic-chunk-scan-'))
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }))
  fs.mkdirSync(path.join(directory, 'runtime'))
  fs.writeFileSync(path.join(directory, 'runtime', 'worker.js'), 'é')
  fs.writeFileSync(path.join(directory, 'sw.js'), 'abcd')
  fs.writeFileSync(path.join(directory, 'runtime', 'wasm.mjs'), 'abc')
  fs.writeFileSync(path.join(directory, 'runtime', 'loader.cjs'), 'abcde')
  assert.deepEqual(await inspectBuiltJavaScript(directory), [
    { file: 'runtime/loader.cjs', bytes: 5 }, { file: 'sw.js', bytes: 4 },
    { file: 'runtime/wasm.mjs', bytes: 3 }, { file: 'runtime/worker.js', bytes: 2 },
  ])
  for (const name of ['wasm.mjs', 'loader.cjs']) {
    const file = path.join(directory, 'runtime', name)
    fs.writeFileSync(file, Buffer.alloc(500_000))
    const files = await inspectBuiltJavaScript(directory)
    assert.throws(() => assertBuiltJavaScriptBudget(files), new RegExp(`${name} \\(500000\\)`))
    fs.writeFileSync(file, '')
  }
})

test('hygiene CLI rejects oversized copied ESM and CommonJS runtimes outside assets', t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'agentic-hygiene-runtime-'))
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }))
  const scripts = path.join(directory, 'scripts'), runtime = path.join(directory, 'canvas/dist/xr-v2/wasm')
  fs.mkdirSync(scripts, { recursive: true })
  fs.mkdirSync(runtime, { recursive: true })
  for (const name of ['check-hygiene-compliance.mjs', 'hygiene-built-chunk-budget.mjs']) {
    fs.copyFileSync(new URL(`../${name}`, import.meta.url), path.join(scripts, name))
  }
  const check = () => spawnSync(process.execPath, [path.join(scripts, 'check-hygiene-compliance.mjs'), '--chunks'], { encoding: 'utf8' })
  assert.equal(check().status, 0)
  for (const name of ['module.mjs', 'loader.cjs']) {
    const file = path.join(runtime, name)
    fs.writeFileSync(file, Buffer.alloc(500_000))
    const rejected = check()
    assert.equal(rejected.status, 1)
    assert.ok(rejected.stderr.includes(`canvas/dist/xr-v2/wasm/${name}`))
    fs.writeFileSync(file, Buffer.alloc(499_999))
    assert.equal(check().status, 0)
    fs.rmSync(file)
  }
})

const moduleInfo = (importedIds = [], extra = {}) => ({ importedIds, dynamicallyImportedIds: [], code: 'x', ...extra })

test('static cycles stay together through zero-render reexport barrels', () => {
  const infos = new Map([
    ['entry', moduleInfo(['a'], { isEntry: true })],
    ['a', moduleInfo(['barrel'])],
    ['barrel', moduleInfo(['b'], { isIncluded: false })],
    ['b', moduleInfo(['a'])],
  ])
  const groups = partitionModuleGraph(infos, 1)
  assert.equal(groups.get('a'), groups.get('b'))
  assert.equal(groups.get('a'), groups.get('barrel'))
  assert.deepEqual(dependencyComponents(new Map([['a', ['b']], ['b', ['a']]])), [['a', 'b']])
  assert.throws(() => assertChunkGraphAcyclic([{ fileName: 'a', imports: ['b'] }, { fileName: 'b', imports: ['a'] }]), /static chunk cycles/)
})

test('lazy entry modules never share a chunk with the initial static closure', () => {
  const infos = new Map([
    ['entry', moduleInfo(['shared'], { isEntry: true, dynamicallyImportedIds: ['lazy'] })],
    ['shared', moduleInfo()], ['lazy', moduleInfo(['shared'])],
  ])
  const groups = partitionModuleGraph(infos)
  assert.notEqual(groups.get('entry'), groups.get('lazy'))
  assert.notEqual(groups.get('shared'), groups.get('lazy'))
})

test('multiple application entries retain independent dynamic ownership', () => {
  const groups = partitionModuleGraph(new Map([
    ['first', moduleInfo(['a', 'b'], { isEntry: true })],
    ['second', moduleInfo([], { isEntry: true, dynamicallyImportedIds: ['a'] })],
    ['a', moduleInfo()], ['b', moduleInfo()],
  ]))
  assert.notEqual(groups.get('a'), groups.get('b'))
})

test('actual emitted modules preserve side-effect order across intervening root sets', async t => {
  const sources = {
    main: 'import "a";import "c";export const lazy=()=>import("e");',
    a: 'globalThis.__agenticChunkTrace.push("a");',
    c: 'import "e";globalThis.__agenticChunkTrace.push("c");',
    e: 'globalThis.__agenticChunkTrace.push("e");',
  }
  const bundle = await rollup({ input: 'main', plugins: [{ name: 'fixture', resolveId: id => id, load: id => sources[id] }] })
  t.after(() => bundle.close())
  let assignment
  const { output } = await bundle.generate({ format: 'es', entryFileNames: '[name].mjs', chunkFileNames: '[name].mjs', onlyExplicitManualChunks: true,
    hoistTransitiveImports: false, manualChunks(id, api) {
      assignment ??= partitionModuleGraph(new Map([...api.getModuleIds()].map(id => [id, api.getModuleInfo(id)])))
      return assignment.get(id)
    } })
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'agentic-chunk-order-'))
  t.after(() => { fs.rmSync(directory, { recursive: true, force: true }); delete globalThis.__agenticChunkTrace })
  for (const chunk of output) fs.writeFileSync(path.join(directory, chunk.fileName), chunk.code)
  globalThis.__agenticChunkTrace = []
  await import(pathToFileURL(path.join(directory, output.find(chunk => chunk.isEntry).fileName)).href)
  assert.deepEqual(globalThis.__agenticChunkTrace, ['a', 'e', 'c'])
})

test('published vendor string leaves preserve escapes and do not transform executable templates', async () => {
  const value = 'shader\n\t\\"é'.repeat(100)
  const id = '/one/node_modules/maplibre-gl/dist/maplibre-gl.mjs'
  const source = `export const shader = ${JSON.stringify(value)}; export const render = x => \`value:\${x}\`;`
  const result = extractStaticPayload(source, id)
  assert.equal(result.count, 1)
  const payloadUrl = `data:text/javascript;base64,${Buffer.from(result.payload).toString('base64')}`
  const edited = result.code.replace(JSON.stringify(result.virtualId), JSON.stringify(payloadUrl))
  const loaded = await import(`data:text/javascript;base64,${Buffer.from(edited).toString('base64')}`)
  assert.equal(loaded.shader, value)
  assert.equal(loaded.render('ok'), 'value:ok')
  assert.notEqual(result.virtualId, extractStaticPayload(source, id.replace('/one/', '/two/')).virtualId)
  assert.equal(extractStaticPayload(result.payload, result.virtualId), null)
})

test('parser extraction preserves deferred calls and rejects unsafe factory shapes', async () => {
  const id = '/node_modules/@mermaid-js/parser/dist/chunks/mermaid-parser.core/chunk-fixture.mjs'
  const creator = 'var __commonJS = (cb, mod) => function(){return mod || (cb.module((mod={exports:{}}).exports), mod),mod.exports};'
  const source = `${creator} var require_probe = __commonJS({module(exports){exports.value=42;}}); export const value=require_probe().value;`
  const extracted = extractDeferredParserFactories(source, id)
  assert.ok(extracted.names.includes('require_probe'))
  const leaf = await import(`data:text/javascript;base64,${Buffer.from(extracted.payload).toString('base64')}`)
  assert.equal(leaf.require_probe().value, 42)
  assert.equal(leaf.require_probe(), leaf.require_probe())
  for (const body of ['{[globalThis.counter++](exports){}}', '{module(exports){exports.url=import.meta.url;}}', '{module(exports){eval("42");}}']) {
    assert.equal(extractDeferredParserFactories(`${creator}var require_probe=__commonJS(${body});`, id), null)
  }
  assert.throws(() => extractDeferredParserFactories('var __commonJS = cb => (globalThis.counter++, () => cb()); var require_probe=__commonJS({module(){}});', id), /deferred initialization/)
  assert.throws(() => extractDeferredParserFactories('var __commonJS = (cb, mod=globalThis.counter++) => function(){}; var require_probe=__commonJS({module(){}});', id), /deferred initialization/)
  assert.equal(extractDeferredParserFactories(`${creator}var value=0;var require_probe=__commonJS({module(exports){exports.value=value;}});value++;`, id), null)
})

test('the locked Mermaid parser retains native parse output after factory and grammar splitting', async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'agentic-parser-parity-'))
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }))
  const bundle = await rollup({ input: fileURLToPath(import.meta.resolve('@mermaid-js/parser')), plugins: [boundedChunksPlugin()] })
  t.after(() => bundle.close())
  const { output } = await bundle.write({ dir: directory, format: 'es', entryFileNames: '[name].mjs', chunkFileNames: '[name].mjs' })
  const transformed = await import(pathToFileURL(path.join(directory, output.find(chunk => chunk.isEntry).fileName)).href)
  const original = await import('@mermaid-js/parser')
  const snapshot = value => JSON.stringify(value, (key, value) => key.startsWith('$') && key !== '$type' ? undefined : value)
  for (const [type, source] of [['gitGraph', 'gitGraph\ncommit id: "a"\n'], ['pie', 'pie\n"A" : 5\n'], ['info', 'info']]) {
    assert.equal(snapshot(await transformed.parse(type, source)), snapshot(await original.parse(type, source)))
  }
  await assert.rejects(transformed.parse('pie', 'pie\n"invalid" : nope'))
})
