import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import * as esbuild from 'esbuild'
import { compile } from '@tailwindcss/node'
import { Scanner } from '@tailwindcss/oxide'
import postcss from 'postcss'

const root = fileURLToPath(new URL('../../', import.meta.url))
const startedAt = Date.now()
const entry = 'canvas/src/features/markdown/ui/dataViewBrowserAdapter.tsx'
const MAX_BYTES = 500000
const MAX_INPUTS = 100, MAX_INPUT_BYTES = 2000000, MAX_TOTAL_INPUT_BYTES = 8000000
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex')
const relative = file => path.relative(root, path.resolve(root, file)).split(path.sep).join('/')
const browserExports = ['mountDataView', 'mountSequenceGuide']
const args = process.argv.slice(2)
assert(args.length === 2 && args[0] === '--out-dir' && path.isAbsolute(args[1]), 'Expected --out-dir <absolute external directory>')
const output = path.resolve(args[1])
const outputRelative = path.relative(root, output)
assert(outputRelative.startsWith('..' + path.sep) || path.isAbsolute(outputRelative), 'Build output must be outside the source checkout')

const inputs = new Set(['canvas/scripts/build-data-view-adapter.mjs', 'package.json', 'package-lock.json', 'canvas/package.json', 'grph-shared/package.json'])
const read = async file => { inputs.add(relative(file)); return fs.readFile(path.resolve(root, file), 'utf8') }
const options = { absWorkingDir: root, bundle: true, write: false, metafile: true,
  preserveSymlinks: true, alias: { '@': path.join(root, 'canvas/src'), 'grph-shared': path.join(root, 'grph-shared/src') },
  logLevel: 'silent' }
const collect = result => {
  for (const file of Object.keys(result.metafile.inputs)) if (!file.startsWith('<')) {
    const label = relative(file)
    assert(!label.startsWith('../') && !path.isAbsolute(label), `Build input escapes checkout: ${label}`)
    inputs.add(label)
  }
}
const javascript = await esbuild.build({ ...options, entryPoints: [entry], format: 'esm', platform: 'browser',
  target: 'es2022', minify: true, legalComments: 'inline', define: { 'process.env.NODE_ENV': '"production"' } })
collect(javascript)
assert.equal(javascript.outputFiles.length, 1, 'Adapter must emit one self-contained JavaScript file')
assert(Object.values(javascript.metafile.outputs).every(output => output.imports.length === 0), 'Adapter must not retain external runtime imports')
assert(browserExports.every(name => Object.values(javascript.metafile.outputs).some(output => output.exports.includes(name))), 'Native browser export missing')
const forbidden = [...inputs].filter(file => file.startsWith('canvas/src/') && /(?:\/hooks\/|useGraphStore|useSequenceDocument|\/(?:stores?|storage|three|mermaid|rich-media)\/)/.test(file))
assert.equal(forbidden.length, 0, `Portable views imported application runtime: ${forbidden.join(', ')}`)

// Execute the native generators from this exact checkout; no maintained CSS palette exists here.
const tokenModule = await esbuild.build({ ...options, platform: 'node', format: 'esm', stdin: {
  sourcefile: '<native-token-generators>', resolveDir: root, contents: String.raw`
import { buildKgTokensCssText } from './grph-shared/src/ui/kgTokens.ts';
import { buildUiTypographyCss } from './grph-shared/src/ui/typography.ts';
export default [buildUiTypographyCss(), buildKgTokensCssText('light'),
  buildKgTokensCssText('dark'), buildKgTokensCssText('black')].join('\n');`,
} })
collect(tokenModule)
const { default: generated } = await import('data:text/javascript;base64,' + Buffer.from(tokenModule.outputFiles[0].text).toString('base64'))
  .catch(error => { throw new Error(`Native token generator failed: ${error.message}`) })
const borders = await read('canvas/src/styles/shared-borders.css')
const borderTokens = []
postcss.parse(borders).walkRules(rule => {
  if (!rule.selector.startsWith(':root')) return
  const scoped = rule.clone()
  scoped.selector += ', ' + rule.selector.replace(/:root((?:\[[^\]]+\])*)/g, (_, attributes) => attributes ? `:host(${attributes})` : ':host')
  borderTokens.push(scoped.toString())
})
const tokenRules = postcss.parse(generated)
tokenRules.walkRules(rule => {
  rule.selector += ', ' + rule.selector.replace(/:root((?:\[[^\]]+\])*)/g, (_, attributes) => attributes ? `:host(${attributes})` : ':host')
})
const indexCss = postcss.parse(await read('canvas/src/index.css'))
const viewportProperties = new Set(['--kg-safe-top', '--kg-safe-bottom', '--kg-safe-left', '--kg-safe-right',
  '--kg-canvas-viewport-edge-gap', '--panel-bg-rgb', '--panel-opacity'])
const viewportTokens = [], foundProperties = new Set()
indexCss.walkRules(rule => {
  if (!rule.selector.startsWith(':root')) return
  const scoped = rule.clone({ nodes: [] })
  rule.walkDecls(declaration => {
    if (!viewportProperties.has(declaration.prop)) return
    foundProperties.add(declaration.prop); scoped.append(declaration.clone())
  })
  if (!scoped.nodes.length) return
  scoped.selector += ', ' + rule.selector.replace(/:root((?:\[[^\]]+\])*)/g, (_, attributes) => attributes ? `:host(${attributes})` : ':host')
  viewportTokens.push(scoped.toString())
})
assert.equal(foundProperties.size, viewportProperties.size, 'Native floating-panel viewport tokens missing')
const tokens = [tokenRules.toString(), ...borderTokens, ...viewportTokens].join('\n')

// Token-only sheet is safe for host applications. Layout/reset utilities stay in the ShadowRoot sheet.
const tokenCss = (await esbuild.transform(tokens, { loader: 'css', minify: true, legalComments: 'inline' })).code
const shadowScope = text => text.replace(/:root((?:\[[^\]]+\])*)/g, (_, attributes) => attributes ? `:host(${attributes})` : ':host')
const nativeStyles = []
for (const file of ['shared-borders.css', 'application-typography.css', 'markdown-data-view-table.css']) {
  nativeStyles.push(shadowScope(await read('canvas/src/styles/' + file)).replace(/\bbody\s*\{/g, ':host {'))
}
// Preserve exact owner declarations and at-rules; exclude unrelated selectors from shared rules.
const projectRules = (source, accepts, required) => {
  const rules = [], selected = new Set()
  source.walkRules(rule => {
    const selectors = rule.selectors.filter(accepts)
    if (!selectors.length) return
    selectors.forEach(selector => selected.add(selector))
    let projected = rule.clone({ selector: selectors.join(', ') }), parent = rule.parent
    while (parent?.type === 'atrule') { projected = parent.clone({ nodes: [projected] }); parent = parent.parent }
    rules.push(projected.toString())
  })
  assert(required.every(selector => selected.has(selector)), `Native CSS owner missing: ${required.filter(selector => !selected.has(selector)).join(', ')}`)
  return rules
}
const frameSelectors = ['.kg-data-view-table-frame', '.kg-safe-viewport-panel', '.kg-responsive-panel-header-row',
  '.kg-responsive-panel-header-actions', '.kg-row-scroll', '.kg-responsive-element-row', '.kg-icon-button', '.kg-default-glyph']
nativeStyles.push(...projectRules(postcss.parse(await read('canvas/src/styles/responsive-toolbar.css')),
  selector => frameSelectors.some(base => selector === base || selector.startsWith(base + ' ')), frameSelectors))
const shellSelectors = ['.ModalContainer', '.App-toolbar__btn']
nativeStyles.push(...projectRules(indexCss, selector => shellSelectors.includes(selector), shellSelectors))
nativeStyles.push(...projectRules(postcss.parse(await read('canvas/src/features/sequence/SequenceFlow.css')),
  selector => selector === '.sequence-flow' || selector === '.sequence-flow select' || /^\.sequence-inspector(?:\s|$)/.test(selector),
  ['.sequence-flow', '.sequence-inspector', '.sequence-inspector ol', '.sequence-inspector button', '.sequence-inspector li button']))
const theme = (await read('canvas/src/styles/tailwind-theme.css'))
  .replace(/^@source[^\n]*\n/gm, '')
  .replace('@custom-variant dark (&:where(.dark, .dark *));', '@custom-variant dark (&:where(:host([data-theme="dark"]), :host([data-theme="dark"]) *));')
const compiler = await compile(`@import "tailwindcss/theme.css";\n@import "tailwindcss/preflight.css";\n${theme}\n${tokens}\n${nativeStyles.join('\n')}\n@tailwind utilities;`, {
  base: root, onDependency: file => inputs.add(relative(file)),
})
assert.equal(compiler.sources.length, 0, 'Adapter CSS must not scan unrelated application sources')
const scanInputs = [...inputs].filter(file => !file.startsWith('node_modules/') && /\.(?:tsx?|jsx?)$/.test(file)
  && file !== 'canvas/scripts/build-data-view-adapter.mjs')
const scanner = new Scanner({ sources: [] })
const candidates = scanner.scanFiles(await Promise.all(scanInputs.map(async file => ({ content: await read(file), extension: path.extname(file).slice(1) })))).sort()
const css = (await esbuild.transform(compiler.build(candidates), { loader: 'css', minify: true, legalComments: 'inline' })).code
assert(!/@import\b|url\(\s*['"]?(?:https?:|\/\/)/i.test(css), 'Adapter CSS must be self-contained and offline')
const declaredTokens = new Set([...css.matchAll(/(--(?:kg|sequence|panel)-[a-z0-9-]+):/g)].map(match => match[1]))
const requiredTokens = new Set([...css.matchAll(/var\((--(?:kg|sequence|panel)-[a-z0-9-]+)\)/g)].map(match => match[1]))
assert([...requiredTokens].every(token => declaredTokens.has(token)), 'Adapter CSS has unresolved native token references')

// Include complete installed license notices in the artifacts instead of references to absent files.
const schedulerInput = [...inputs].find(file => /node_modules\/scheduler\/index\.js$/.test(file))
assert(schedulerInput, 'Expected the bundled React DOM scheduler')
const runtimePackages = { react: 'node_modules/react', 'react-dom': 'node_modules/react-dom', scheduler: path.posix.dirname(schedulerInput),
  'lucide-react': 'node_modules/lucide-react' }
const licenses = []
let runtimeNotices = ''
for (const [name, directory] of Object.entries(runtimePackages)) {
  runtimeNotices += `/*! ${name}\n${(await read(directory + '/LICENSE')).replaceAll('*/', '* /')}\n*/\n`
  licenses.push({ package: name, path: directory + '/LICENSE', license: name === 'lucide-react' ? 'ISC AND MIT' : 'MIT' })
}
const tailwindNotice = `/*! tailwindcss\n${(await read('node_modules/tailwindcss/LICENSE')).replaceAll('*/', '* /')}\n*/\n`
licenses.push({ package: 'tailwindcss', path: 'node_modules/tailwindcss/LICENSE', license: 'MIT' })
const files = { 'graph-data-view.js': Buffer.from(runtimeNotices + javascript.outputFiles[0].text),
  'graph-data-view.css': Buffer.from(tailwindNotice + css), 'graph-ui-tokens.css': Buffer.from(tokenCss) }
for (const [name, bytes] of Object.entries(files)) assert(bytes.length > 0 && bytes.length < MAX_BYTES, `${name} exceeds the <500 kB chunk bound`)
const sourceRevision = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim()
const sourceDirty = Boolean(execFileSync('git', ['status', '--porcelain', '--untracked-files=normal'], { cwd: root, encoding: 'utf8' }).trim())
const dependencies = {}
for (const name of ['esbuild', 'tailwindcss', '@tailwindcss/node', '@tailwindcss/oxide', 'postcss', 'react', 'react-dom', 'scheduler', 'lucide-react']) {
  const directory = runtimePackages[name] || 'node_modules/' + name
  dependencies[name] = JSON.parse(await read(directory + '/package.json')).version
}
const records = await Promise.all([...inputs].sort().map(async file => {
  assert(!file.startsWith('../') && !path.isAbsolute(file), `Input path escapes checkout: ${file}`)
  const source = path.join(root, file), before = await fs.stat(source)
  const bytes = await fs.readFile(source), after = await fs.stat(source)
  assert(bytes.length > 0 && bytes.length <= MAX_INPUT_BYTES, `Native input exceeds its byte bound: ${file}`)
  assert(before.mtimeMs <= startedAt && before.mtimeMs === after.mtimeMs && before.size === after.size, `Input changed during build; retry: ${file}`)
  return { path: file, bytes: bytes.length, sha256: sha256(bytes) }
}))
assert(records.length <= MAX_INPUTS && records.reduce((total, row) => total + row.bytes, 0) <= MAX_TOTAL_INPUT_BYTES, 'Native input inventory exceeds its bound')
const manifest = { schema: 'agentic-graph/data-view-artifact/v1', sourceRevision, sourceDirty, entry,
  browserExport: 'mountDataView', browserExports, cssScope: 'shadow-root', hostTokens: 'graph-ui-tokens.css', dependencies, licenses,
  inputDigest: sha256(JSON.stringify(records)), inputs: records,
  outputs: Object.entries(files).map(([file, bytes]) => ({ path: file, bytes: bytes.length, sha256: sha256(bytes) })),
}
const manifestBytes = Buffer.from(JSON.stringify(manifest, null, 2) + '\n')
assert(manifestBytes.length < MAX_BYTES, 'Manifest exceeds the <500 kB chunk bound')
await fs.mkdir(output, { recursive: true })
const realOutput = await fs.realpath(output), realRoot = await fs.realpath(root)
assert(!realOutput.startsWith(realRoot + path.sep) && realOutput !== realRoot, 'Output symlink resolves inside source checkout')
for (const [name, bytes] of Object.entries({ ...files, 'graph-data-view.manifest.json': manifestBytes })) {
  const destination = path.join(output, name), temporary = destination + '.tmp-' + process.pid
  try { await fs.writeFile(temporary, bytes, { flag: 'wx' }); await fs.rename(temporary, destination) }
  finally { await fs.rm(temporary, { force: true }) }
}
process.stdout.write(JSON.stringify({ output, sourceRevision, sourceDirty, inputDigest: manifest.inputDigest, outputs: manifest.outputs }) + '\n')
