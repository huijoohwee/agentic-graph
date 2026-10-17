import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

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
export function createPwaPrecacheAdmission(outputDirectory = defaultOutputDirectory) {
  const manifestDirectory = resolve(outputDirectory)
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
