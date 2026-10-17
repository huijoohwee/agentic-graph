import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const isJavaScript = path => /\.(?:js|mjs|cjs)$/.test(path)
const fail = message => { throw new Error(`PWA static precache: ${message}`) }
const metadataFileName = 'agentic-pwa-static-closure.json'
const metadataSchema = 'agentic-graph-pwa-static-closure/v2'
const defaultOutputDirectory = resolve(dirname(fileURLToPath(import.meta.url)), 'dist')
const isServiceWorker = path => /(?:^|\/)(?:sw|service-worker)\.(?:c?js|mjs)$/i.test(path)

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

/** Capture only the app bundle after Rollup writes it and before Workbox reads it. */
export function createPwaPrecacheAdmission(outputDirectory = defaultOutputDirectory) {
  const manifestDirectory = resolve(outputDirectory)
  const metadataPath = join(manifestDirectory, metadataFileName)
  return {
    plugin: {
      name: 'agentic-graph-pwa-static-precache', apply: 'build', enforce: 'post',
      writeBundle: { order: 'post', sequential: true, async handler(options, bundle) {
        const chunks = Object.values(bundle ?? {}).filter(item => item?.type === 'chunk')
        const entries = chunks.filter(item => item.isEntry === true)
        if (entries.length && entries.every(item => isServiceWorker(item.fileName))) return
        const appEntries = entries.filter(item => !isServiceWorker(item.fileName))
        const bundleDirectory = typeof options?.dir === 'string' ? resolve(options.dir) : manifestDirectory
        const required = appEntries.length
          ? [...collectRequiredStaticJavaScriptFiles(bundle, item => !isServiceWorker(item.fileName))]
          : []
        const metadata = {
          schema: metadataSchema,
          required,
          observation: {
            bundleDirectory,
            chunkCount: chunks.length,
            entryCount: entries.length,
            entryFiles: entries.slice(0, 6).map(item => emittedPath(item.fileName)),
          },
        }
        await mkdir(manifestDirectory, { recursive: true })
        await writeFile(metadataPath, JSON.stringify(metadata))
        process.stdout.write(`[PWA static precache] ${JSON.stringify({ stage: 'writeBundle', metadataPath, ...metadata.observation })}\n`)
      } },
    },
    async manifestTransform(entries) {
      if (!Array.isArray(entries)) fail('manifest must be an array')
      let metadata
      try { metadata = JSON.parse(await readFile(metadataPath, 'utf8')) }
      catch (error) {
        const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : 'read-error'
        fail(`bundle observation is unavailable before Workbox admission (${code}; path=${metadataPath})`)
      }
      if (metadata?.schema !== metadataSchema || !Array.isArray(metadata.required) || metadata.required.length === 0
          || metadata.required.some(path => typeof path !== 'string'))
        fail(`emitted app bundle graph is invalid (path=${metadataPath}; observation=${JSON.stringify(metadata?.observation ?? null)}; manifestEntries=${entries.length}; manifestSample=${JSON.stringify(entries.slice(0, 6).map(entry => entry?.url ?? null))})`)
      const required = new Set(metadata.required.map(path => {
        const canonical = emittedPath(path)
        if (!isJavaScript(canonical)) fail(`required emitted asset is not JavaScript: ${canonical}`)
        return canonical
      }))
      if (required.size !== metadata.required.length) fail('emitted app bundle graph contains duplicate assets')
      await unlink(metadataPath)
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
