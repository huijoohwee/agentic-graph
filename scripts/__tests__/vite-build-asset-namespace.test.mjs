import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import test from 'node:test'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { rollup } from 'rollup'
import { build as viteBuild } from 'vite'
import MagicString from 'magic-string'
import { TraceMap, originalPositionFor } from '@jridgewell/trace-mapping'
import { spawnSync } from 'node:child_process'
import {
  assertBuiltJavaScriptBudget, assertChunkGraphAcyclic, boundedChunksPlugin, dependencyComponents,
  extractDeferredParserFactories, extractStaticPayload, inspectBuiltJavaScript, partitionModuleGraph,
  finalizeChunkReport, isEvidenceRuntimeModule, removeInlinedStylesheetDepsFromViteMapDeps,
  factorVitePreloadPrefixes, poolEvidenceStringValues,
  rewriteInlinedStylesheetPreloads, rewriteInlinedStylesheetPreloadsOnDisk,
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
import './vite-service-worker-owner.test.mjs'

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

const evidenceModule = '/repo/canvas/src/features/evidence-analysis/core/fixture.mjs'
test('evidence owners stay separate from host and preserve static versus lazy admission', () => {
  const lazy = evidenceModule + '-lazy', adapter = '/repo/gympgrph/src/useSourceGeospatialLayers.ts'
  const groups = partitionModuleGraph(new Map([
    ['entry', moduleInfo([evidenceModule, adapter, 'host'], { isEntry: true, dynamicallyImportedIds: [lazy] })],
    [evidenceModule, moduleInfo()], [adapter, moduleInfo()], ['host', moduleInfo()], [lazy, moduleInfo([evidenceModule])],
  ]))
  assert.notEqual(groups.get(evidenceModule), groups.get('host'))
  assert.notEqual(groups.get(adapter), groups.get('host')); assert.notEqual(groups.get(lazy), groups.get(evidenceModule))
  for (const file of ['evidenceAnalysisAgentReadyContract.mjs', 'evidenceAnalysisWebMcpTools.ts'])
    assert.equal(isEvidenceRuntimeModule('/repo/canvas/src/features/agent-ready/' + file), true)
  assert.equal(isEvidenceRuntimeModule('/repo/gympgrph/src/GeospatialHost.tsx'), false)
  assert.throws(() => partitionModuleGraph(new Map([[evidenceModule, moduleInfo(['host'])], ['host', moduleInfo([evidenceModule])]])), /Mixed evidence\/host static cycle/)
})

test('feature reporting counts final UTF-8 bytes and hashes after preload rewriting', async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'evidence-final-bytes-'))
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }))
  fs.writeFileSync(path.join(directory, 'feature.js'), 'é/* late preload */')
  const report = await finalizeChunkReport({ chunks: [{ file: 'feature.js', bytes: 1, modules: [{ id: evidenceModule }] }] }, directory)
  assert.equal(report.chunks[0].generatedBytes, 1)
  assert.equal(report.evidenceRuntime.exclusiveBytes, Buffer.byteLength('é/* late preload */'))
  assert.equal(report.chunks[0].sha256, createHash('sha256').update('é/* late preload */').digest('hex'))
  assert.equal(report.evidenceRuntime.addedInitialBytes, null)
  await assert.rejects(finalizeChunkReport({ chunks: [{ file: 'feature.js', modules: [{ id: evidenceModule }, { id: 'host' }] }] }, directory), /Mixed evidence\/host emitted chunk/)
  await assert.rejects(finalizeChunkReport({ chunks: [{ file: 'missing.js', modules: [{ id: evidenceModule }] }] }, directory), /ENOENT/)
})

test('final report follows native Vite CSS pruning and retains minified hidden source maps', async t => {
  const config = fs.readFileSync(new URL('../../canvas/vite.config.ts', import.meta.url), 'utf8')
  assert.match(config, /\besbuild:\s*\{\s*sourcemap: process\.env\.AG_BUILD_SOURCEMAP === '1',/)
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'agentic-final-report-'))
  const reportPath = path.join(directory, 'report.json'), previous = process.env.AG_BUNDLE_REPORT_PATH
  t.after(() => { fs.rmSync(directory, { recursive: true, force: true }); if (previous === undefined) delete process.env.AG_BUNDLE_REPORT_PATH; else process.env.AG_BUNDLE_REPORT_PATH = previous })
  process.env.AG_BUNDLE_REPORT_PATH = reportPath
  const css = path.join(directory, 'node_modules/monaco-editor/theme.css')
  fs.mkdirSync(path.dirname(css), { recursive: true }); fs.writeFileSync(css, '.theme{color:red}')
  const source = 'import "./node_modules/monaco-editor/theme.css";\nexport const proof: string = "é𝒜";\nglobalThis.__proof = proof;\n'
  fs.writeFileSync(path.join(directory, 'main.ts'), source)
  let cssJavaScript
  await viteBuild({ configFile: false, root: directory, logLevel: 'silent', esbuild: { sourcemap: true },
    plugins: [boundedChunksPlugin(), { name: 'observe-css-before-native-pruning', generateBundle: { order: 'pre', handler(_options, bundle) {
      cssJavaScript = Object.values(bundle).find(chunk => chunk.type === 'chunk' && Object.keys(chunk.modules).some(id => id.endsWith('/monaco-editor/theme.css')))?.fileName
    } } }], build: { sourcemap: 'hidden', minify: 'esbuild', reportCompressedSize: false, rollupOptions: { input: path.join(directory, 'main.ts') } } })
  assert.ok(cssJavaScript, 'fixture must exercise a native CSS-only JavaScript chunk')
  const report = JSON.parse(fs.readFileSync(reportPath, 'utf8')), dist = path.join(directory, 'dist')
  assert(!fs.existsSync(path.join(dist, cssJavaScript)), 'Vite must prune the CSS-only JavaScript')
  assert(!report.chunks.some(chunk => chunk.file === cssJavaScript))
  assert(report.chunks.every(chunk => !chunk.imports.includes(cssJavaScript)))
  assert(fs.readdirSync(path.join(dist, 'assets')).some(file => file.endsWith('.css')))
  const emitted = await inspectBuiltJavaScript(dist)
  assert.deepEqual(report.chunks.map(chunk => chunk.file).sort(), emitted.map(file => file.file).sort())
  for (const chunk of report.chunks) {
    const bytes = fs.readFileSync(path.join(dist, chunk.file))
    assert.equal(chunk.bytes, bytes.length); assert.equal(chunk.sha256, createHash('sha256').update(bytes).digest('hex'))
  }
  const entry = report.chunks.find(chunk => chunk.entry), code = fs.readFileSync(path.join(dist, entry.file), 'utf8')
  const map = new TraceMap(JSON.parse(fs.readFileSync(path.join(dist, entry.file + '.map'), 'utf8')))
  assert.ok(map.sources.length && map.sourcesContent.includes(source), 'minification must retain original TypeScript sources')
  const prefix = code.slice(0, code.indexOf('__proof')), lines = prefix.split('\n')
  const original = originalPositionFor(map, { line: lines.length, column: lines.at(-1).length })
  assert.match(original.source, /main\.ts$/); assert.equal(original.line, 3)
})

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
    main: `import ${JSON.stringify(evidenceModule)};import "c";export const lazy=()=>import("e");export const feature=()=>import(${JSON.stringify(evidenceModule + '-lazy')});`,
    [evidenceModule]: 'globalThis.__agenticChunkTrace.push("a");',
    [evidenceModule + '-lazy']: 'globalThis.__agenticChunkTrace.push("feature");',
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
  const entry = await import(pathToFileURL(path.join(directory, output.find(chunk => chunk.isEntry).fileName)).href)
  assert.deepEqual(globalThis.__agenticChunkTrace, ['a', 'e', 'c'])
  await entry.feature()
  assert.deepEqual(globalThis.__agenticChunkTrace, ['a', 'e', 'c', 'feature'])
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


test('late preload cleanup preserves exact JS and original map positions in bundle and disk phases', async t => {
  const deps = ['./assets/index-A.css', 'assets/runtime.js', 'assets/other.js']
  const source = `const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=${JSON.stringify(deps)})))=>i.map(i=>d[i]);export const before="é";\nconst values=__vite__mapDeps([0,1,2]);export const after="𝒜";\n`
  const expected = source.replace(JSON.stringify(deps), JSON.stringify(deps.slice(1))).replace('__vite__mapDeps([0,1,2])', '__vite__mapDeps([0,1])')
  const removed = new Set(['assets/index-A.css']), directory = fs.mkdtempSync(path.join(os.tmpdir(), 'agentic-preload-map-'))
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }))
  const position = (code, word) => { const prefix = code.slice(0, code.indexOf(word)), lines = prefix.split('\n'); return { line: lines.length, column: lines.at(-1).length } }
  for (const phase of ['bundle', 'disk']) {
    const map = new MagicString(source).generateMap({ source: '/original.ts', file: 'entry.js', includeContent: true, hires: true })
    const chunk = { type: 'chunk', fileName: 'entry.js', sourcemapFileName: 'entry.js.map', code: source, map }
    const asset = { type: 'asset', fileName: 'entry.js.map', source: map.toString() }, bundle = { 'entry.js': chunk, 'entry.js.map': asset }
    if (phase === 'bundle') assert.equal(rewriteInlinedStylesheetPreloads(chunk, removed, bundle), true)
    else {
      fs.writeFileSync(path.join(directory, chunk.fileName), source); fs.writeFileSync(path.join(directory, asset.fileName), asset.source)
      assert.equal(await rewriteInlinedStylesheetPreloadsOnDisk(chunk, removed, bundle, directory), true)
      assert.equal(fs.readFileSync(path.join(directory, chunk.fileName), 'utf8'), expected)
      assert.equal(fs.readFileSync(path.join(directory, asset.fileName), 'utf8'), asset.source)
      assert.equal(await rewriteInlinedStylesheetPreloadsOnDisk(chunk, removed, bundle, directory), false)
    }
    assert.equal(chunk.code, expected)
    assert.equal(asset.source, chunk.map.toString())
    const traced = new TraceMap(JSON.parse(asset.source))
    assert.deepEqual(traced.sourcesContent, [source])
    for (const word of ['before', 'after', 'é', '𝒜']) {
      const original = originalPositionFor(traced, position(expected, word))
      assert.deepEqual({ source: original.source, line: original.line, column: original.column }, { source: '/original.ts', ...position(source, word) })
    }
    assert.equal(rewriteInlinedStylesheetPreloads(chunk, removed, bundle), false)
    assert.equal(typeof chunk.map.toUrl(), 'string')
  }
  assert.equal(removeInlinedStylesheetDepsFromViteMapDeps(source, removed).code, expected)
  assert.equal(removeInlinedStylesheetDepsFromViteMapDeps('plain()', removed), null)
  assert.throws(() => rewriteInlinedStylesheetPreloads({ fileName: 'entry.js', code: source,
    map: new MagicString(source).generateMap({ source: 'source.ts', hires: true }) }, removed, {}), /Missing emitted source map/)
})

test('preload prefix factoring preserves cache identity, index results, CSS order and maps', async t => {
  const deps = ['first.js', 'second.js', 'third.css'].map(name => `assets/${SOURCE_REVISION}/${name}`)
  const source = `const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=${JSON.stringify(deps)})))=>i.map(i=>d[i]);export {__vite__mapDeps};export const proof="é";`
  const originalMap = new MagicString(source).generateMap({ source: 'original.js', file: 'entry.js', hires: true, includeContent: true })
  const next = factorVitePreloadPrefixes(source, originalMap)
  assert.ok(Buffer.byteLength(next.code) < Buffer.byteLength(source))
  assert.equal(factorVitePreloadPrefixes(next.code), null)
  const module = await import(`data:text/javascript;base64,${Buffer.from(next.code).toString('base64')}`)
  assert.deepEqual(module.__vite__mapDeps([2, 0, 1, 2, 9]), [deps[2], deps[0], deps[1], deps[2], undefined])
  const cache = module.__vite__mapDeps.f
  module.__vite__mapDeps([]); assert.equal(module.__vite__mapDeps.f, cache)
  assert.deepEqual(module.__vite__mapDeps([1], { f: ['a', 'b'] }), ['b'])
  const position = originalPositionFor(new TraceMap(next.map), { line: 1, column: next.code.indexOf('proof') })
  assert.equal(position.column, source.indexOf('proof'))
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'preload-prefix-')); t.after(() => fs.rmSync(directory, { recursive: true, force: true }))
  fs.writeFileSync(path.join(directory, 'entry.js'), source); fs.writeFileSync(path.join(directory, 'entry.js.map'), originalMap.toString())
  const chunk = { code: source, fileName: 'entry.js', sourcemapFileName: 'entry.js.map', map: originalMap }, bundle = { 'entry.js.map': { type: 'asset' } }
  await rewriteInlinedStylesheetPreloadsOnDisk(chunk, new Set([deps[2]]), bundle, directory)
  const transformed = await import(`data:text/javascript;base64,${Buffer.from(chunk.code).toString('base64')}`)
  assert.deepEqual(transformed.__vite__mapDeps([0, 1, 2]), [deps[0], deps[1], undefined])
  assert.equal(await rewriteInlinedStylesheetPreloadsOnDisk(chunk, new Set([deps[2]]), bundle, directory), false)
})

test('string pooling preserves values, keys, directives, module interfaces and dynamic scope', async () => {
  const value = 'repeated primitive value é', literal = JSON.stringify(value)
  const source = `"use strict";const $0=7;export const values=[${literal},${literal},${literal}];export const obj={${literal}:${literal}};export const computed={[${literal}]:${literal}};export const read=(x=${literal})=>x;export class C{${literal}(){return ${literal}}}`
  const next = poolEvidenceStringValues(source)
  assert.ok(next && Buffer.byteLength(next.code) < Buffer.byteLength(source)); assert.ok(next.code.startsWith('"use strict";'))
  const load = code => import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`)
  const [original, transformed] = await Promise.all([load(source), load(next.code)])
  assert.deepEqual(transformed.values, original.values); assert.deepEqual(transformed.obj, original.obj); assert.deepEqual(transformed.computed, original.computed)
  assert.equal(transformed.read(), original.read()); assert.equal(new transformed.C()[value](), new original.C()[value]())
  assert.match(next.code, new RegExp(`const \\$0=7`))
  for (const scope of ['eval("0")', 'new Function("return 0")', 'globalThis["eval"]("0")']) assert.equal(poolEvidenceStringValues(source + ';' + scope), null)
  for (const interfaceCode of [`import {x as $1} from ${literal};`, `import ${literal};`, `import x from ${literal} with {type:"json"};`, `export {x as "${value}"} from ${literal};`, `export * from ${literal};`, `export const lazy=()=>import(${literal});`]) {
    const result = poolEvidenceStringValues(interfaceCode + source)
    assert.ok(result.code.includes(interfaceCode), 'module syntax and source literals must be byte-identical')
  }
})

test('post-minification pooling shrinks actual Vite output and preserves native evidence operations', async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'evidence-pooling-'))
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }))
  const root = fileURLToPath(new URL('../..', import.meta.url)), entry = path.join(root, 'canvas/src/features/evidence-analysis/tools/executeEvidence.mjs')
  const plugin = boundedChunksPlugin(), render = plugin.renderChunk.handler
  let saved = 0, transformedChunks = 0
  plugin.renderChunk.handler = function (code, chunk, ...args) {
    const result = render.call(this, code, chunk, ...args)
    if (result) { saved += Buffer.byteLength(code) - Buffer.byteLength(result.code); transformedChunks++ }
    return result
  }
  const result = await viteBuild({ configFile: false, root, logLevel: 'silent', esbuild: { sourcemap: true }, plugins: [plugin],
    build: { outDir: directory, emptyOutDir: false, modulePreload: false, sourcemap: 'hidden', minify: 'esbuild', reportCompressedSize: false,
      rollupOptions: { input: entry, preserveEntrySignatures: 'strict', output: { entryFileNames: '[name].mjs', chunkFileNames: '[name].mjs' } } } })
  assert.ok(saved > 1000 && transformedChunks > 3, `post-minifier saving must be measurable: ${saved}`)
  assert.ok(result.output.some(item => item.type === 'chunk' && /;const \$[a-z0-9]+=/.test(item.code)), 'pooled constants must survive final minification')
  t.diagnostic(`native executor post-minification pooling saves ${saved} bytes across ${transformedChunks} chunks`)
  const output = result.output, emittedEntry = output.find(item => item.type === 'chunk' && item.isEntry)
  const transformed = await import(pathToFileURL(path.join(directory, emittedEntry.fileName)).href), original = await import(pathToFileURL(entry).href)
  const fixture = name => fs.readFileSync(path.join(root, 'canvas/public/evidence-analysis/fixtures', name), 'utf8')
  const bundle = fixture('aviation-singapore-v1.json'), record = { profileId: 'aviation-v1', bundle }, atUtc = '2026-10-03T10:48:27.060Z'
  const inspection = await original.executeEvidence('aviation.inspect', record), entityId = JSON.parse(bundle).entities[0].id
  const cases = [['aviation.inspect', record], ['aviation.replay', { ...record, entityId, atUtc }], ['aviation.source', { ...record, factId: inspection.facts[0].id }], ['aviation.export', record]]
  const volume = fixture('volume-singapore-synthetic-v1.json'), route = fixture('route-singapore-synthetic-v1.json')
  cases.push(['volume.project', { profileId: 'volume-v1', viewId: 'volume-view', bundle: volume, entityId: JSON.parse(volume).entities[0].id, atUtc }],
    ['route.benchmark', { profileId: 'route-v1', policyId: 'route-policy', bundle: route, entityId: JSON.parse(route).entities[0].id }],
    ['arrival.evaluate', { profileId: 'arrival-v1', policyId: 'arrival-policy', bundles: ['train', 'calibration', 'test'].map(part => fixture(`arrival-singapore-exercise-${part}.json`)) }],
    ['notice.triage', { profileId: 'volume-v1', policyId: 'notice-policy', viewId: 'volume-view', notice: fixture('notice-singapore-synthetic-v1.json'), atUtc }])
  for (const [operation, input] of cases) assert.deepEqual(await transformed.executeEvidence(operation, input), await original.executeEvidence(operation, input))
  for (const [operation, input] of [['aviation.inspect', { ...record, bundle: '{' }], ['aviation.replay', { ...record, entityId, atUtc: 'yesterday' }]]) {
    assert.deepEqual(await transformed.executeEvidence(operation, input), await original.executeEvidence(operation, input))
  }
  for (const chunk of output.filter(item => item.type === 'chunk')) {
    const map = new TraceMap(JSON.parse(fs.readFileSync(path.join(directory, chunk.fileName + '.map'), 'utf8')))
    if (Object.entries(chunk.modules).some(([id, module]) => isEvidenceRuntimeModule(id) && module.renderedLength)) assert.ok(map.sourcesContent.some(source => source?.length), `composed maps must retain native source: ${chunk.fileName} ${Object.keys(chunk.modules).join(',')}`)
    if (chunk.isEntry) assert.ok(map.sourcesContent.includes(fs.readFileSync(entry, 'utf8')), 'entry map must contain the exact original executor')
  }
})


test('pooled ordinary object keys preserve descriptors, key order, prototypes and inferred names', async () => {
  const key = 'ordinaryRepeatedLongProperty', literal = JSON.stringify(key)
  const source = `const proto={sentinel:1};const ${key}=9;export const objects=[{__proto__:proto,${key}:1,2:"two"},{"__proto__":proto,${key}:2}, {${key}:function(){}}, {${key}:()=>3},{${key}}];
    export const special={get ${key}(){return 8},set setter(x){},${key}(){return 4}};export class C{${key}(){return 5}[${literal}](){return 6}}
    export const read=({${key}:v})=>v;export const key=${literal};export const values=[${literal},${literal}];`
  const next = poolEvidenceStringValues(source)
  assert.ok(next && Buffer.byteLength(next.code) < Buffer.byteLength(source)); assert.match(next.code, /\[\$[a-z0-9]+\]:function/)
  assert.ok(next.code.includes('{__proto__:proto,')); assert.ok(next.code.includes('{"__proto__":proto,'))
  for (const unchanged of [`get ${key}()`, `${key}(){`, `{${key}}`, `({${key}:v})`, `[${literal}]()`]) assert.ok(next.code.includes(unchanged), unchanged)
  const load = code => import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`)
  const [original, transformed] = await Promise.all([load(source), load(next.code)])
  const descriptors = object => Object.fromEntries(Object.entries(Object.getOwnPropertyDescriptors(object)).map(([name, descriptor]) => [name,
    Object.fromEntries(Object.entries(descriptor).map(([field, value]) => [field, typeof value === 'function' ? { name: value.name, result: value.length ? undefined : value() } : value]))]))
  for (let i = 0; i < original.objects.length; i++) {
    assert.deepEqual(Reflect.ownKeys(transformed.objects[i]), Reflect.ownKeys(original.objects[i]))
    assert.deepEqual(descriptors(transformed.objects[i]), descriptors(original.objects[i]))
    assert.deepEqual(Object.getPrototypeOf(transformed.objects[i]), Object.getPrototypeOf(original.objects[i]))
  }
  assert.deepEqual(descriptors(transformed.special), descriptors(original.special))
  assert.equal(new transformed.C()[key](), new original.C()[key]()); assert.equal(transformed.read({ [key]: 3 }), original.read({ [key]: 3 }))
})
