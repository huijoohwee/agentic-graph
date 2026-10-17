import { readFile, unlink } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const isJavaScript = path => /\.(?:js|mjs|cjs)$/.test(path)
const fail = message => { throw new Error(`PWA static precache: ${message}`) }
const metadataFileName = 'agentic-pwa-static-closure.json'
const metadataSchema = 'agentic-graph-pwa-static-closure/v1'
const defaultOutputDirectory = join(dirname(fileURLToPath(import.meta.url)), 'dist')

function emittedPath(value) {
  if (typeof value !== 'string' || !value || value.startsWith('/') || value.includes('\\')
      || value.split('/').some(part => part === '..' || part === ''))
    fail('Rollup bundle contains a non-canonical emitted path')
  return value
}

export function collectRequiredStaticJavaScriptFiles(bundle, isRoot = () => true) {
  if (!bundle || typeof bundle !== 'object' || Array.isArray(bundle)) fail('Rollup output must be an object')
  const chunks = new Map(Object.values(bundle)
    .filter(item => item?.type === 'chunk')
    .map(chunk => [emittedPath(chunk.fileName), chunk]))
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

/** Capture only the app bundle before Workbox reads its emitted files. */
export function createPwaPrecacheAdmission(outputDirectory = defaultOutputDirectory) {
  return {
    plugin: {
      name: 'agentic-graph-pwa-static-precache', apply: 'build', enforce: 'post',
      generateBundle: { order: 'post', handler(_options, bundle) {
        const chunks = Object.values(bundle ?? {}).filter(item => item?.type === 'chunk')
        const entries = chunks.filter(item => item.isEntry === true)
        const appEntries = entries.filter(item => !/(?:^|\/)(?:sw|service-worker)\.(?:c?js|mjs)$/i.test(item.fileName))
        if (appEntries.length) {
          const required = [...collectRequiredStaticJavaScriptFiles(bundle,
            item => !/(?:^|\/)(?:sw|service-worker)\.(?:c?js|mjs)$/i.test(item.fileName))]
          this.emitFile({ type: 'asset', fileName: metadataFileName,
            source: JSON.stringify({ schema: metadataSchema, required }) })
        }
      } },
    },
    async manifestTransform(entries) {
      if (!Array.isArray(entries)) fail('manifest must be an array')
      let metadata
      try { metadata = JSON.parse(await readFile(join(outputDirectory, metadataFileName), 'utf8')) }
      catch { fail('emitted app bundle graph is unavailable before Workbox admission') }
      if (metadata?.schema !== metadataSchema || !Array.isArray(metadata.required) || metadata.required.length === 0
          || metadata.required.some(path => typeof path !== 'string')) fail('emitted app bundle graph is invalid')
      const required = new Set(metadata.required.map(path => {
        const canonical = emittedPath(path)
        if (!isJavaScript(canonical)) fail(`required emitted asset is not JavaScript: ${canonical}`)
        return canonical
      }))
      if (required.size !== metadata.required.length) fail('emitted app bundle graph contains duplicate assets')
      await unlink(join(outputDirectory, metadataFileName))
      const present = new Set()
      const manifest = entries.filter(entry => {
        if (!entry || typeof entry.url !== 'string') fail('manifest URL is missing')
        if (entry.url === metadataFileName) return false
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
