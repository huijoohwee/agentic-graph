import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { join, posix } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const isJavaScript = path => /\.(?:js|mjs|cjs)$/.test(path)
const isServiceWorker = path => /(?:^|\/)(?:sw|service-worker)\.(?:c?js|mjs)$/i.test(path)
const fail = message => { throw new Error(`PWA static precache: ${message}`) }
const defaultOutputDirectory = resolve(dirname(fileURLToPath(import.meta.url)), 'dist')

function emittedPath(value) {
  if (typeof value !== 'string' || !value || value.startsWith('/') || value.includes('\\')
      || value.split('/').some(part => part === '..' || part === ''))
    fail('Rollup output contains a non-canonical emitted path')
  return value
}

function scriptSources(html) {
  const sources = []
  for (const [tag] of html.matchAll(/<script\b[^>]*>/gi)) {
    const type = tag.match(/\btype\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i)
    if (type && (type[1] ?? type[2] ?? type[3]).toLowerCase() !== 'module') continue
    const src = tag.match(/\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i)
    const value = src?.[1] ?? src?.[2] ?? src?.[3]
    if (value && isJavaScript(value.split(/[?#]/, 1)[0])) sources.push(value)
  }
  return sources
}

function resolveManifestPath(reference, importer, manifestPaths) {
  const clean = String(reference).split(/[?#]/, 1)[0]
  if (!clean || /^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(clean) || clean.includes('\\'))
    fail(`static JavaScript dependency is not a local asset: ${reference}`)
  const candidates = clean.startsWith('/')
    ? [...manifestPaths].filter(path => clean === `/${path}` || clean.endsWith(`/${path}`))
    : [posix.normalize(posix.join(importer ? posix.dirname(importer) : '', clean))]
  if (candidates.length !== 1) fail(`cannot resolve emitted JavaScript path: ${reference}`)
  const path = emittedPath(candidates[0])
  if (!manifestPaths.has(path)) fail(`static JavaScript dependency is absent from manifest: ${path}`)
  return path
}

function staticImports(code, path) {
  const source = ts.createSourceFile(path, code, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS)
  if (source.parseDiagnostics.length) {
    const detail = ts.flattenDiagnosticMessageText(source.parseDiagnostics[0].messageText, ' ')
    fail(`emitted JavaScript cannot be parsed (${path}: ${detail})`)
  }
  return source.statements.flatMap(statement => {
    if (ts.isImportDeclaration(statement) && ts.isStringLiteral(statement.moduleSpecifier))
      return [statement.moduleSpecifier.text]
    if (ts.isExportDeclaration(statement) && statement.moduleSpecifier
        && ts.isStringLiteral(statement.moduleSpecifier)) return [statement.moduleSpecifier.text]
    return []
  })
}

async function collectHtmlStaticClosure(outputDirectory, manifestEntries) {
  const manifestPaths = new Set(manifestEntries.filter(entry => isJavaScript(entry.url)).map(entry => emittedPath(entry.url)))
  let html
  try { html = await readFile(join(outputDirectory, 'index.html'), 'utf8') }
  catch (error) {
    const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : 'read-error'
    fail(`built HTML entry is unavailable (${code}; path=${join(outputDirectory, 'index.html')})`)
  }
  const roots = scriptSources(html).map(source => resolveManifestPath(source, '', manifestPaths))
  if (!roots.length) fail(`built HTML has no local JavaScript entry (${join(outputDirectory, 'index.html')})`)
  const required = new Set(), pending = roots
  while (pending.length) {
    const path = pending.pop()
    if (required.has(path)) continue
    let code
    try { code = await readFile(join(outputDirectory, path), 'utf8') }
    catch (error) {
      const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : 'read-error'
      fail(`static JavaScript asset is unavailable (${code}; path=${join(outputDirectory, path)})`)
    }
    required.add(path)
    for (const dependency of staticImports(code, path))
      pending.push(resolveManifestPath(dependency, path, manifestPaths))
  }
  return required
}

export function collectRequiredStaticJavaScriptFiles(bundle, isRoot = () => true) {
  if (!bundle || typeof bundle !== 'object' || Array.isArray(bundle)) fail('Rollup output must be an object')
  const chunks = new Map()
  for (const item of Object.values(bundle)) {
    if (item?.type !== 'chunk') continue
    const path = emittedPath(item.fileName)
    if (chunks.has(path)) fail(`duplicate emitted chunk: ${path}`)
    chunks.set(path, item)
  }
  const roots = [...chunks.values()].filter(chunk => chunk.isEntry === true && isRoot(chunk))
  if (!roots.length) fail('emitted JavaScript entry roots are missing')
  const required = new Set(), pending = roots.map(chunk => chunk.fileName)
  while (pending.length) {
    const path = emittedPath(pending.pop())
    const chunk = chunks.get(path)
    if (!chunk || !isJavaScript(path)) fail(`required emitted JavaScript chunk is missing: ${path}`)
    if (required.has(path)) continue
    const imports = chunk.imports ?? []
    if (!Array.isArray(imports) || imports.some(item => typeof item !== 'string'))
      fail(`static imports are unavailable: ${path}`)
    required.add(path)
    pending.push(...imports)
  }
  return required
}

/** Capture the application bundle's exact static import closure before Workbox runs. */
export function createPwaPrecacheAdmission(outputDirectory = defaultOutputDirectory, phase = process.env.AGENTIC_GRAPH_PWA_BUILD_PHASE || 'single') {
  const manifestDirectory = resolve(outputDirectory)
  if (!['single', 'app', 'finalize'].includes(phase)) fail(`unknown build phase: ${phase}`)
  let requiredFiles = null
  return {
    plugin: {
      name: 'agentic-graph-pwa-static-precache', apply: 'build', enforce: 'post',
      generateBundle(_options, bundle) {
        const entries = Object.values(bundle ?? {}).filter(item => item?.type === 'chunk' && item.isEntry === true)
        if (entries.length && entries.every(item => isServiceWorker(item.fileName))) return
        const appEntries = entries.filter(item => !isServiceWorker(item.fileName))
        if (!appEntries.length) return
        requiredFiles = [...collectRequiredStaticJavaScriptFiles(bundle, item => !isServiceWorker(item.fileName))]
      },
    },
    async manifestTransform(entries) {
      if (!Array.isArray(entries)) fail('manifest must be an array')
      if (entries.some(entry => !entry || typeof entry.url !== 'string')) fail('manifest URL is missing')
      if (phase === 'app') return { manifest: [], warnings: [] }
      if (phase === 'finalize') {
        const required = await collectHtmlStaticClosure(manifestDirectory, entries)
        const present = new Set()
        const manifest = entries.filter(entry => {
          if (!isJavaScript(entry.url)) return true
          if (!required.has(entry.url)) return false
          if (present.has(entry.url)) fail(`duplicate required asset: ${entry.url}`)
          present.add(entry.url)
          return true
        })
        for (const path of required) if (!present.has(path)) fail(`required asset is absent from manifest: ${path}`)
        return { manifest, warnings: [] }
      }
      if (!requiredFiles?.length)
        fail(`in-memory application bundle observation is unavailable before Workbox admission (manifest entries=${entries.length}; output=${manifestDirectory})`)
      const required = new Set(requiredFiles.map(path => {
        const canonical = emittedPath(path)
        if (!isJavaScript(canonical)) fail(`required emitted asset is not JavaScript: ${canonical}`)
        return canonical
      }))
      if (required.size !== requiredFiles.length) fail('emitted app bundle graph contains duplicate assets')
      const present = new Set()
      const manifest = entries.filter(entry => {
        if (!isJavaScript(entry.url)) return true
        if (!required.has(entry.url)) return false
        if (present.has(entry.url)) fail(`duplicate required asset: ${entry.url}`)
        present.add(entry.url)
        return true
      })
      for (const path of required) if (!present.has(path)) fail(`required asset is absent from manifest: ${path}`)
      return { manifest, warnings: [] }
    },
  }
}
