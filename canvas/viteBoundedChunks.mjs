import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import path from 'node:path'
import MagicString from 'magic-string'
import remapping from '@jridgewell/remapping'
import { parseAst } from 'rollup/parseAst'
import { parse } from 'acorn'
import { analyze } from 'eslint-scope'
import { isBuiltJavaScriptPath } from '../scripts/hygiene-built-chunk-budget.mjs'

const DATA_PREFIX = '\0agentic-graph-static-data:'
const FACTORY_PREFIX = '\0agentic-graph-parser-factories:'
const RAW_GROUP_BYTES = 220_000

// Browser evidence owners introduced by cc40000f8; native Flight/host integrations remain shared.
export const isEvidenceRuntimeModule = id => {
  const file = id.replaceAll('\\', '/').split('?', 1)[0]
  return /\/canvas\/src\/features\/evidence-analysis\//.test(file)
    || /\/canvas\/src\/features\/agent-ready\/evidenceAnalysis(?:AgentReadyContract\.mjs|WebMcpTools\.ts)$/.test(file)
    || /\/gympgrph\/(?:src\/useSourceGeospatialLayers\.ts|dist\/useSourceGeospatialLayers\.js)$/.test(file)
}

export async function finalizeChunkReport(report, directory) {
  for (const chunk of report.chunks) {
    const owners = new Set(chunk.modules.map(module => isEvidenceRuntimeModule(module.id)))
    if (owners.size > 1) throw new Error(`Mixed evidence/host emitted chunk: ${chunk.file}`)
    const bytes = await readFile(path.join(directory, chunk.file))
    chunk.generatedBytes = chunk.bytes; chunk.bytes = bytes.length
    chunk.sha256 = createHash('sha256').update(bytes).digest('hex')
    chunk.evidenceOwned = owners.has(true)
  }
  report.evidenceRuntime = {
    exclusiveBytes: report.chunks.filter(chunk => chunk.evidenceOwned).reduce((sum, chunk) => sum + chunk.bytes, 0),
    scope: 'Owned modules/adapters only; shared integration deltas require a matched baseline.',
    addedInitialBytes: null,
  }
  return report
}

// The late CSS cleanup changes generated columns; retain exact JS output and original sources.
export function removeInlinedStylesheetDepsFromViteMapDeps(code, inlinedCssFileNames, originalMap = null) {
  if (!inlinedCssFileNames.size || !code.includes('__vite__mapDeps')) return null
  const helper = /const __vite__mapDeps=\(i,m=__vite__mapDeps,d=\(m\.f\|\|\(m\.f=(\[[^\]]*\])\)\)\)=>i\.map\(i=>d\[i\]\);/.exec(code)
  if (!helper) return null
  let deps
  try { deps = JSON.parse(helper[1]) } catch { return null }
  if (!Array.isArray(deps) || !deps.every(dep => typeof dep === 'string')) return null
  const indexes = new Map(), kept = []
  deps.forEach((dep, index) => {
    if (!inlinedCssFileNames.has(dep.trim().replace(/\\/g, '/').replace(/^\.\//, '').split(/[?#]/)[0])) {
      indexes.set(index, kept.length); kept.push(dep)
    }
  })
  if (kept.length === deps.length) return null
  const edited = new MagicString(code), arrayStart = helper.index + helper[0].indexOf(helper[1])
  edited.overwrite(arrayStart, arrayStart + helper[1].length, JSON.stringify(kept))
  for (const match of code.matchAll(/__vite__mapDeps\(\[([0-9,\s]*)\]\)/g)) {
    const values = match[1].split(',').map(value => value.trim()).filter(Boolean).map(value => Number.parseInt(value, 10))
    if (!values.every(value => Number.isInteger(value) && value >= 0)) continue
    const next = values.map(value => indexes.get(value)).filter(value => typeof value === 'number')
    edited.overwrite(match.index, match.index + match[0].length, `__vite__mapDeps([${next.join(',')}])`)
  }
  return mappedRewrite(edited, originalMap)
}

function mappedRewrite(edited, originalMap) {
  let map = null
  if (originalMap) {
    const shift = edited.generateMap({ hires: true, source: originalMap.file || 'chunk.js' })
    map = Object.assign(shift, remapping([shift, originalMap], () => null))
    map.file = originalMap.file
    if (originalMap.debugId) map.debugId = originalMap.debugId
  }
  return { code: edited.toString(), map }
}

// Run after CSS cleanup: the strict helper shape excludes an already factored array.
export function factorVitePreloadPrefixes(code, originalMap = null) {
  const helper = /const __vite__mapDeps=\(i,m=__vite__mapDeps,d=\(m\.f\|\|\(m\.f=(\[[^\]]*\])\)\)\)=>i\.map\(i=>d\[i\]\);/.exec(code)
  if (!helper) return null
  let values
  try { values = JSON.parse(helper[1]) } catch { return null }
  if (!values.length || !values.every(value => typeof value === 'string')) return null
  let prefix = values[0]
  for (const value of values) {
    let i = 0
    while (i < prefix.length && prefix[i] === value[i]) i++
    prefix = prefix.slice(0, i)
  }
  const expression = `${JSON.stringify(values.map(value => value.slice(prefix.length)))}.map(s=>${JSON.stringify(prefix)}+s)`
  if (Buffer.byteLength(expression) >= Buffer.byteLength(helper[1])) return null
  const edited = new MagicString(code), start = helper.index + helper[0].indexOf(helper[1])
  edited.overwrite(start, start + helper[1].length, expression)
  return mappedRewrite(edited, originalMap)
}

/** Pool primitive values and ordinary data keys after minification; preserve module and eval scope. */
export function poolEvidenceStringValues(code, fileName = 'chunk.js') {
  const ast = parseAst(code), names = new Set(), literals = new Map(), pending = [[ast, null, '', false]]
  let unsafe = false
  while (pending.length) {
    const [node, parent, key, excluded] = pending.pop()
    if (node.type === 'Identifier') names.add(node.name)
    if ((node.type === 'Identifier' && /^(eval|Function)$/.test(node.name))
      || (node.type === 'Literal' && /^(eval|Function)$/.test(node.value))) unsafe = true
    if (!excluded && node.type === 'Property' && parent?.type === 'ObjectExpression'
      && !node.computed && !node.method && !node.shorthand && node.kind === 'init') {
      const value = node.key.type === 'Identifier' ? node.key.name : node.key.value
      if (typeof value === 'string' && value !== '__proto__') {
        const group = literals.get(value) || []; group.push({ ...node.key, pooledKey: true }); literals.set(value, group)
      }
    }
    if (!excluded && node.type === 'Literal' && typeof node.value === 'string'
      && !(key === 'key' && (parent?.computed === false || ['MethodDefinition', 'PropertyDefinition'].includes(parent?.type))) && parent?.type !== 'ExpressionStatement') {
      const group = literals.get(node.value) || []; group.push(node); literals.set(node.value, group)
    }
    const omit = excluded || ['ImportDeclaration', 'ImportExpression', 'ExportAllDeclaration', 'ExportSpecifier'].includes(node.type)
      || (node.type === 'ExportNamedDeclaration' && Boolean(node.source))
    for (const [key, value] of Object.entries(node)) {
      if (Array.isArray(value)) { for (const child of value) if (child?.type) pending.push([child, node, key, omit]) }
      else if (value?.type) pending.push([value, node, key, omit])
    }
  }
  if (unsafe) return null
  const edited = new MagicString(code), declarations = []
  let serial = 0
  for (const [value, nodes] of literals) {
    if (nodes.length < 2) continue
    let name
    do { name = '$' + (serial++).toString(36) } while (names.has(name))
    const declaration = `${name}=${JSON.stringify(value)}`
    const saving = nodes.reduce((sum, node) => sum + Buffer.byteLength(code.slice(node.start, node.end)) - name.length - (node.pooledKey ? 2 : 0), 0)
    if (saving <= Buffer.byteLength(declaration) + 8) continue
    declarations.push(declaration)
    for (const node of nodes) edited.overwrite(node.start, node.end, node.pooledKey ? `[${name}]` : name)
  }
  if (!declarations.length) return null
  let start = 0
  for (const node of ast.body) { if (node.type === 'ExpressionStatement' && typeof node.expression.value === 'string') start = node.end; else break }
  edited.appendLeft(start, `;const ${declarations.join(',')};`)
  if (Buffer.byteLength(edited.toString()) >= Buffer.byteLength(code)) return null
  return { code: edited.toString(), map: edited.generateMap({ hires: true, source: fileName, includeContent: true }) }
}

export function rewriteInlinedStylesheetPreloads(output, inlinedCssFileNames, bundle) {
  const next = removeInlinedStylesheetDepsFromViteMapDeps(output.code, inlinedCssFileNames, output.map)
  if (!next) return false
  const mapAsset = next.map && bundle[output.sourcemapFileName]
  if (next.map && mapAsset?.type !== 'asset') throw new Error(`Missing emitted source map: ${output.fileName}`)
  output.code = next.code
  if (next.map) { output.map = next.map; mapAsset.source = next.map.toString() }
  return true
}

export async function rewriteInlinedStylesheetPreloadsOnDisk(output, inlinedCssFileNames, bundle, directory) {
  const file = path.resolve(directory, output.fileName), code = await readFile(file, 'utf8')
  if (!removeInlinedStylesheetDepsFromViteMapDeps(code, inlinedCssFileNames) && !factorVitePreloadPrefixes(code)) return false
  const mapFile = output.sourcemapFileName && path.resolve(directory, output.sourcemapFileName)
  const map = output.map ? JSON.parse(await readFile(mapFile, 'utf8')) : null
  const current = { ...output, code, map }
  rewriteInlinedStylesheetPreloads(current, inlinedCssFileNames, bundle)
  const factored = factorVitePreloadPrefixes(current.code, current.map)
  if (factored) {
    if (factored.map && bundle[current.sourcemapFileName]?.type !== 'asset') throw new Error(`Missing emitted source map: ${current.fileName}`)
    current.code = factored.code
    if (factored.map) { current.map = factored.map; bundle[current.sourcemapFileName].source = factored.map.toString() }
  }
  if (current.map) await writeFile(mapFile, current.map.toString())
  await writeFile(file, current.code)
  Object.assign(output, current)
  return true
}

/** Dependency-first SCCs. Iterative traversal also handles large editor graphs. */
export function dependencyComponents(graph) {
  const visited = new Set(), order = []
  for (const root of graph.keys()) {
    if (visited.has(root)) continue
    visited.add(root)
    const stack = [[root, 0]]
    while (stack.length) {
      const frame = stack.at(-1), dependencies = graph.get(frame[0]) || []
      if (frame[1] < dependencies.length) {
        const next = dependencies[frame[1]++]
        if (graph.has(next) && !visited.has(next)) { visited.add(next); stack.push([next, 0]) }
      } else { order.push(frame[0]); stack.pop() }
    }
  }
  const reverse = new Map([...graph.keys()].map(id => [id, []]))
  for (const [id, dependencies] of graph) for (const dependency of dependencies) reverse.get(dependency)?.push(id)
  const assigned = new Set(), components = []
  for (const root of order.reverse()) {
    if (assigned.has(root)) continue
    const component = [], pending = [root]
    assigned.add(root)
    while (pending.length) {
      const id = pending.pop(); component.push(id)
      for (const next of reverse.get(id) || []) if (!assigned.has(next)) { assigned.add(next); pending.push(next) }
    }
    components.push(component.sort())
  }
  return components.reverse()
}

/** Preserve static cycles and lazy entry ownership before applying a byte bound.
 * Equal root sets form a DAG: a dependency's roots are a superset of its caller's.
 * Only globally consecutive dependency-first SCCs with equal root sets are packed.
 * Directory/hash buckets cannot provide this evaluation-order guarantee.
 */
export function partitionModuleGraph(infos, byteLimit = RAW_GROUP_BYTES) {
  const graph = new Map([...infos].map(([id, info]) => [id, info.importedIds.filter(dep => infos.has(dep))]))
  const components = dependencyComponents(graph)
  const owner = new Map(components.flatMap((ids, i) => ids.map(id => [id, i])))
  const entries = [...infos].filter(([, info]) => info.isEntry).map(([id]) => id)
  const roots = components.map(() => new Set())
  for (const [id, info] of infos) {
    if (info.isEntry) roots[owner.get(id)].add(id)
    for (const target of info.dynamicallyImportedIds || []) if (owner.has(target)) roots[owner.get(target)].add(target)
  }
  for (let i = components.length - 1; i >= 0; i--) {
    for (const id of components[i]) for (const dep of graph.get(id)) {
      const next = owner.get(dep)
      if (next !== i) for (const root of roots[i]) roots[next].add(root)
    }
  }
  const assignment = new Map()
  let serial = 0, group
  for (let i = 0; i < components.length; i++) {
    // With exactly one app entry, initial modules are already loaded before any
    // dynamic entry can run. Discard only their redundant dynamic-root labels.
    // Multi-entry builds retain every label: another entry may load that leaf alone.
    const effectiveRoots = entries.length === 1 && roots[i].has(entries[0]) ? entries : [...roots[i]].sort()
    const ids = components[i], signature = JSON.stringify(effectiveRoots)
    const owners = new Set(ids.map(isEvidenceRuntimeModule))
    if (owners.size > 1) throw new Error(`Mixed evidence/host static cycle: ${ids.join(' -> ')}`)
    const evidenceOwned = owners.has(true)
    const bytes = ids.reduce((sum, id) => sum + (infos.get(id).isIncluded === false ? 0 : Buffer.byteLength(infos.get(id).code || '')), 0)
    // Names retain existing lazy-vendor preload/cache policy; they never select membership.
    const kind = ids.every(id => /(?:monaco-editor|static-data:monaco)/.test(id)) ? 'monaco'
      : ids.every(id => /(?:mermaid|static-data:mermaid)/.test(id)) ? 'mermaid'
      : ids.every(id => /(?:maplibre-gl|static-data:maplibre)/.test(id)) ? 'maplibre'
      : ids.every(id => /\/node_modules\/three\/src\/(?:nodes\/|materials\/nodes\/|renderers\/(?:common|webgpu|webgl-fallback)\/)/.test(id)) ? 'three-webgpu'
      : ids.every(id => /\/node_modules\/(?:three|@react-three)\//.test(id)) ? 'three'
      : 'runtime'
    if (!group || group.signature !== signature || group.bytes + bytes > byteLimit || group.kind !== kind || group.evidenceOwned !== evidenceOwned) {
      group = { name: `${kind === 'runtime' ? 'r' : kind}-${++serial}`, kind, signature, evidenceOwned, bytes: 0 }
    }
    group.bytes += bytes
    for (const id of ids) assignment.set(id, group.name)
  }
  return assignment
}

export function assertChunkGraphAcyclic(chunks) {
  const graph = new Map(chunks.map(chunk => [chunk.fileName, chunk.imports]))
  const cycles = dependencyComponents(graph).filter(ids => ids.length > 1)
  if (cycles.length) throw new Error(`Build introduced static chunk cycles: ${cycles.map(ids => ids.join(' -> ')).join('; ')}`)
}

export async function inspectBuiltJavaScript(directory) {
  const result = []
  async function visit(folder) {
    for (const entry of await readdir(folder, { withFileTypes: true })) {
      const file = path.join(folder, entry.name)
      if (entry.isDirectory()) await visit(file)
      else if (isBuiltJavaScriptPath(entry.name)) result.push({ file: path.relative(directory, file), bytes: (await stat(file)).size })
    }
  }
  await visit(directory)
  return result.sort((a, b) => b.bytes - a.bytes)
}

export function assertBuiltJavaScriptBudget(files) {
  const oversized = files.filter(file => file.bytes >= 500_000)
  if (oversized.length) throw new Error(`JavaScript must be smaller than 500000 bytes: ${oversized.map(file => `${file.file} (${file.bytes})`).join(', ')}`)
}

/** Only inert published shader/grammar strings move; executable vendor code is unchanged. */
export function extractStaticPayload(code, id, excludedRanges = []) {
  if (id.startsWith(DATA_PREFIX)) return null
  const kind = /\/maplibre-gl\/dist\/maplibre-gl\.mjs$/.test(id) ? 'maplibre'
    : /\/@mermaid-js\/parser\/dist\/chunks\/mermaid-parser\.core\/[^/]+\.mjs$/.test(id) ? 'mermaid' : null
  if (!kind) return null
  const ast = parseAst(code), replacements = [], pending = [[ast, null, null]]
  while (pending.length) {
    const [node, parent, key] = pending.pop()
    if (excludedRanges.some(range => node.start >= range.start && node.end <= range.end)) continue
    const value = node.type === 'Literal' && typeof node.value === 'string' ? node.value
      : node.type === 'TemplateLiteral' && node.expressions.length === 0 ? node.quasis[0].value.cooked : null
    if (typeof value === 'string' && value.length >= 500
      && ((parent?.type === 'CallExpression' && key === 'arguments') || (parent?.type === 'VariableDeclarator' && key === 'init'))) {
      replacements.push({ start: node.start, end: node.end, value })
      continue
    }
    for (const [childKey, child] of Object.entries(node)) {
      if (Array.isArray(child)) {
        for (const entry of child) if (entry?.type) pending.push([entry, node, childKey])
      } else if (child?.type) pending.push([child, node, childKey])
    }
  }
  if (!replacements.length) return null
  replacements.sort((a, b) => a.start - b.start)
  const edited = new MagicString(code), virtualId = `${DATA_PREFIX}${kind}:${id}`
  const exports = replacements.map(({ start, end, value }, i) => {
    edited.overwrite(start, end, `__agenticStaticPayload${i}`)
    return `export const __agenticStaticPayload${i} = ${JSON.stringify(value)};`
  })
  edited.prepend(`import { ${replacements.map((_, i) => `__agenticStaticPayload${i}`).join(', ')} } from ${JSON.stringify(virtualId)};\n`)
  return { code: edited.toString(), map: edited.generateMap({ hires: true, source: id, includeContent: true }), edited, virtualId, payload: exports.join('\n'), count: replacements.length }
}

/** Recover the vendor's deferred CommonJS factory boundary without executing it.
 * Scope analysis admits only closed, never-reassigned wrappers and pure helpers.
 * Every other declaration and every original require invocation stays in place.
 */
export function extractDeferredParserFactories(code, id) {
  if (id.startsWith('\0') || !/\/@mermaid-js\/parser\/dist\/chunks\/mermaid-parser\.core\/[^/]+\.mjs$/.test(id)
    || !code.includes('var __commonJS =')) return null
  const ast = parse(code, { ecmaVersion: 'latest', sourceType: 'module', ranges: true })
  const scope = analyze(ast, { ecmaVersion: 2022, sourceType: 'module' }).scopes.find(scope => scope.type === 'module')
  const declarations = new Map(ast.body.filter(node => node.type === 'VariableDeclaration' && node.declarations.length === 1
    && node.declarations[0].id.type === 'Identifier').map(node => [node.declarations[0].id.name, node]))
  const creator = declarations.get('__commonJS')?.declarations[0].init
  if (creator?.type !== 'ArrowFunctionExpression' || creator.body.type !== 'FunctionExpression'
    || !creator.params.every(parameter => parameter.type === 'Identifier')) {
    throw new Error('Mermaid parser CommonJS creator changed; review its deferred initialization contract.')
  }
  function safeDeferredTree(node) {
    if (node.type === 'MetaProperty' || (node.type === 'CallExpression' && node.callee?.type === 'Identifier' && node.callee.name === 'eval')) return false
    return Object.values(node).every(value => Array.isArray(value)
      ? value.every(child => !child?.type || safeDeferredTree(child)) : !value?.type || safeDeferredTree(value))
  }
  const selected = new Set([...declarations].filter(([name, node]) => {
    const init = node.declarations[0].init
    if (!init || !safeDeferredTree(init)) return false
    const wrapper = init.type === 'CallExpression' && init.callee.name === '__commonJS'
      && init.arguments.length === 1 && init.arguments[0].type === 'ObjectExpression'
      && init.arguments[0].properties.every(property => property.type === 'Property' && !property.computed && property.kind === 'init'
        && ['FunctionExpression', 'ArrowFunctionExpression'].includes(property.value.type))
    const intrinsic = init.type === 'MemberExpression' && /^Object\.(?:create|defineProperty|getOwnPropertyDescriptor|getOwnPropertyNames|getPrototypeOf|prototype\.hasOwnProperty)$/.test(code.slice(init.start, init.end))
    return wrapper || (name.startsWith('__') && (['ArrowFunctionExpression', 'FunctionExpression'].includes(init.type) || intrinsic))
  }).map(([name]) => name))
  const dependencies = new Map([...selected].map(name => [name, new Set()]))
  for (const variable of scope.variables) {
    if (variable.references.some(reference => reference.isWrite() && !reference.init)) selected.delete(variable.name)
    for (const reference of variable.references) for (const [name, dependenciesForName] of dependencies) {
      const node = declarations.get(name)
      if (node.start <= reference.identifier.start && reference.identifier.start < node.end && variable.name !== name) dependenciesForName.add(variable.name)
    }
  }
  let changed = true
  while (changed) {
    changed = false
    for (const name of selected) if ([...dependencies.get(name)].some(dependency => !selected.has(dependency))) { selected.delete(name); changed = true }
  }
  if (![...selected].some(name => name.startsWith('require_'))) return null
  const ranges = [...selected].map(name => declarations.get(name)).sort((a, b) => a.start - b.start)
  const names = [...selected]
  return { ranges, names, virtualId: `${FACTORY_PREFIX}${id}`,
    payload: `${ranges.map(node => code.slice(node.start, node.end)).join('\n')}\nexport { ${names.join(', ')} };` }
}

/** Build-only graph partitioning and local payload leaves; no external runtime dependency. */
export function boundedChunksPlugin() {
  let assignment, report
  let outDir
  const payloads = new Map()
  return {
    name: 'agentic-graph-bounded-chunks', apply: 'build',
    configResolved(config) { outDir = path.resolve(config.root, config.build.outDir) },
    buildStart() { assignment = undefined; report = undefined; payloads.clear() },
    resolveId(id) { if (id.startsWith(DATA_PREFIX) || id.startsWith(FACTORY_PREFIX)) return id },
    load(id) { return payloads.get(id) },
    transform(code, id) {
      if (id.startsWith('\0')) return null
      const factories = extractDeferredParserFactories(code, id)
      const result = extractStaticPayload(code, id, factories?.ranges)
      if (!result && !factories) return null
      if (result) payloads.set(result.virtualId, result.payload)
      const edited = result?.edited || new MagicString(code)
      if (factories) {
        payloads.set(factories.virtualId, factories.payload)
        for (const range of factories.ranges) edited.remove(range.start, range.end)
        edited.prepend(`import { ${factories.names.join(', ')} } from ${JSON.stringify(factories.virtualId)};\n`)
      }
      return { code: edited.toString(), map: edited.generateMap({ hires: true, source: id, includeContent: true }) }
    },
    outputOptions(options) {
      if (options.inlineDynamicImports) return options
      return { ...options, onlyExplicitManualChunks: true, hoistTransitiveImports: false, manualChunks: (id, api) => {
        if (!assignment) {
          const infos = new Map([...api.getModuleIds()].map(moduleId => [moduleId, api.getModuleInfo(moduleId)])
            .filter(([, info]) => info && !info.isExternal))
          assignment = partitionModuleGraph(infos)
        }
        return assignment.get(id)
      } }
    },
    renderChunk: { order: 'post', handler(code, chunk) {
      const ids = Object.keys(chunk.modules)
      return ids.length && ids.every(isEvidenceRuntimeModule) ? poolEvidenceStringValues(code, chunk.fileName) : null
    } },
    // Vite prunes CSS-only JavaScript during later generateBundle hooks. Capture
    // the surviving graph after every generation hook and normal disk rewrite.
    writeBundle: { order: 'post', sequential: true, handler(_options, bundle) {
      const chunks = Object.values(bundle).filter(item => item.type === 'chunk')
      assertChunkGraphAcyclic(chunks)
      const membership = new Map(chunks.flatMap(chunk => Object.entries(chunk.modules)))
      const graph = new Map([...membership.keys()].map(id => [id, (this.getModuleInfo(id)?.importedIds || []).filter(dependency => membership.has(dependency))]))
      report = {
        schema: 'agentic-graph-bundle-graph/v1',
        chunks: chunks.map(chunk => ({ file: chunk.fileName, bytes: Buffer.byteLength(chunk.code), entry: chunk.isEntry,
          imports: chunk.imports, dynamicImports: chunk.dynamicImports,
          modules: Object.entries(chunk.modules).map(([id, value]) => ({ id, renderedLength: value.renderedLength })) })),
        components: dependencyComponents(graph).map(ids => ({ renderedLength: ids.reduce((size, id) => size + membership.get(id).renderedLength, 0), ids })),
        graph: Object.fromEntries(graph),
      }
    } },
    closeBundle: { order: 'post', sequential: true, async handler() {
      if (!outDir) return
      const files = await inspectBuiltJavaScript(outDir)
      assertBuiltJavaScriptBudget(files)
      const destination = process.env.AG_BUNDLE_REPORT_PATH
      if (destination && report) {
        if (!path.isAbsolute(destination)) throw new Error('Bundle report path must be absolute.')
        await mkdir(path.dirname(destination), { recursive: true })
        await writeFile(destination, JSON.stringify(await finalizeChunkReport(report, outDir)))
      }
      this.info(`JavaScript budget: ${files.length} files; largest ${files[0]?.bytes || 0} bytes (<500000).`)
    } },
  }
}
