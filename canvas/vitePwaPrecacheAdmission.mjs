import { lstatSync, readFileSync, unlinkSync } from 'node:fs'
import { isAbsolute } from 'node:path'

const MAX_MANIFEST_BYTES = 4 * 1024 * 1024
const isJavaScript = path => /\.(?:js|mjs|cjs)$/.test(path)
const fail = message => { throw new Error(`PWA static precache: ${message}`) }
const identity = stat => [stat.dev, stat.ino, stat.uid, stat.mode, stat.nlink, stat.size,
  stat.ctimeNs, stat.mtimeNs].map(String).join(':')

function emittedPath(value) {
  if (typeof value !== 'string' || !value || value.startsWith('/') || value.includes('\\')
      || value.split('/').some(part => part === '..' || part === ''))
    fail('Vite manifest contains a non-canonical emitted path')
  return value
}

export function collectRequiredStaticJavaScriptFiles(manifest) {
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest))
    fail('Vite manifest must be an object')
  const chunks = new Map()
  for (const [key, entry] of Object.entries(manifest)) {
    if (!key || !entry || typeof entry !== 'object' || Array.isArray(entry))
      fail('Vite manifest entry is malformed')
    emittedPath(entry.file)
    chunks.set(key, entry)
  }
  const roots = [...chunks.entries()].filter(([, entry]) => entry.isEntry === true && isJavaScript(entry.file))
  if (!roots.length) fail('Vite manifest has no emitted JavaScript entry roots')
  const required = new Set(), pending = roots.map(([key]) => key)
  while (pending.length) {
    const key = pending.pop()
    const entry = chunks.get(key)
    if (!entry || !isJavaScript(entry.file)) fail(`required static JavaScript import is missing: ${key}`)
    if (required.has(entry.file)) continue
    const imports = entry.imports ?? []
    if (!Array.isArray(imports) || imports.some(item => typeof item !== 'string'))
      fail(`static imports are unavailable: ${entry.file}`)
    required.add(entry.file)
    pending.push(...imports)
  }
  return required
}

function readExactManifest(path) {
  let before
  try { before = lstatSync(path, { bigint: true }) } catch { fail('emitted Vite manifest is missing') }
  if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1n || before.size > BigInt(MAX_MANIFEST_BYTES))
    fail('emitted Vite manifest is not a bounded regular file')
  const bytes = readFileSync(path), after = lstatSync(path, { bigint: true })
  if (!after.isFile() || after.isSymbolicLink() || identity(before) !== identity(after))
    fail('emitted Vite manifest changed during read')
  let manifest
  try { manifest = JSON.parse(bytes.toString('utf8')) } catch { fail('emitted Vite manifest is invalid JSON') }
  return { manifest, identity: identity(after) }
}

function removeExactManifest(path, expectedIdentity) {
  let current
  try { current = lstatSync(path, { bigint: true }) } catch { fail('emitted Vite manifest disappeared before cleanup') }
  if (!current.isFile() || current.isSymbolicLink() || identity(current) !== expectedIdentity)
    fail('emitted Vite manifest changed before cleanup')
  unlinkSync(path)
  try {
    lstatSync(path)
    fail('emitted Vite manifest path was replaced during cleanup')
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error
  }
}

/** Read the completed Vite output manifest; do not couple Workbox to Rollup hook state. */
export function createPwaPrecacheAdmission(manifestPath) {
  if (typeof manifestPath !== 'string' || !isAbsolute(manifestPath))
    fail('Vite manifest path must be absolute')
  return {
    async manifestTransform(entries) {
      if (!Array.isArray(entries)) fail('manifest must be an array')
      const captured = readExactManifest(manifestPath)
      const required = collectRequiredStaticJavaScriptFiles(captured.manifest)
      const present = new Set()
      const manifest = entries.filter(entry => {
        if (!entry || typeof entry.url !== 'string') fail('manifest URL is missing')
        if (!isJavaScript(entry.url)) return true
        if (!required.has(entry.url)) return false
        if (present.has(entry.url)) fail(`duplicate required asset: ${entry.url}`)
        present.add(entry.url)
        return true
      })
      for (const path of required) if (!present.has(path)) fail(`required asset is absent from manifest: ${path}`)
      removeExactManifest(manifestPath, captured.identity)
      return { manifest, warnings: [] }
    },
  }
}
