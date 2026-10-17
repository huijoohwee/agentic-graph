import { readFile } from 'node:fs/promises'
import { dirname, join, posix, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const isJavaScript = path => /\.(?:js|mjs|cjs)$/.test(path)
const fail = message => { throw new Error(`PWA static precache: ${message}`) }
const defaultOutputDirectory = resolve(dirname(fileURLToPath(import.meta.url)), 'dist')

function emittedPath(value) {
  if (typeof value !== 'string' || !value || value.startsWith('/') || value.includes('\\')
      || value.split('/').some(part => part === '..' || part === ''))
    fail('manifest contains a non-canonical emitted path')
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

/** Admit the built HTML entry's exact static JavaScript closure to Workbox. */
export function createPwaPrecacheAdmission(outputDirectory = defaultOutputDirectory) {
  const manifestDirectory = resolve(outputDirectory)
  return {
    async manifestTransform(entries) {
      if (!Array.isArray(entries)) fail('manifest must be an array')
      if (entries.some(entry => !entry || typeof entry.url !== 'string')) fail('manifest URL is missing')
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
    },
  }
}
