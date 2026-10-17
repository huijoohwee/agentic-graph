const isJavaScript = path => /\.(?:js|mjs|cjs)$/.test(path)
const fail = message => { throw new Error(`PWA static precache: ${message}`) }

function emittedPath(value) {
  if (typeof value !== 'string' || !value || value.startsWith('/') || value.includes('\\')
      || value.split('/').some(part => part === '..' || part === ''))
    fail('Rollup bundle contains a non-canonical emitted path')
  return value
}

export function collectRequiredStaticJavaScriptFiles(bundle) {
  if (!bundle || typeof bundle !== 'object' || Array.isArray(bundle)) fail('Rollup output must be an object')
  const chunks = new Map(Object.values(bundle)
    .filter(item => item?.type === 'chunk')
    .map(chunk => [emittedPath(chunk.fileName), chunk]))
  const roots = [...chunks.values()].filter(chunk => chunk.isEntry === true)
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
export function createPwaPrecacheAdmission() {
  let required = null
  return {
    plugin: {
      name: 'agentic-graph-pwa-static-precache', apply: 'build', enforce: 'post',
      writeBundle: { order: 'post', handler(_options, bundle) {
        const hasHtmlEntry = Object.values(bundle ?? {}).some(item => item?.type === 'asset'
          && typeof item.fileName === 'string' && /\.html?$/i.test(item.fileName))
        if (hasHtmlEntry) required = collectRequiredStaticJavaScriptFiles(bundle)
      } },
    },
    async manifestTransform(entries) {
      if (!required) fail('app bundle graph is unavailable before Workbox admission')
      if (!Array.isArray(entries)) fail('manifest must be an array')
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
      return { manifest, warnings: [] }
    },
  }
}
