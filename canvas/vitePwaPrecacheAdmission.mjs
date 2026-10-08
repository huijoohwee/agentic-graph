const isJavaScript = path => /\.(?:js|mjs|cjs)$/.test(path)
const fail = message => { throw new Error(`PWA static precache: ${message}`) }

/** One build owns this closure; deferred modules remain in explicit offline packs. */
export function createPwaPrecacheAdmission() {
  let required = null
  return {
    plugin: {
      name: 'agentic-graph-pwa-static-precache', apply: 'build', enforce: 'post',
      buildStart() { required = null },
      generateBundle: { order: 'post', handler(_options, bundle) {
        required = null
        const chunks = new Map(Object.values(bundle).filter(item => item.type === 'chunk').map(item => [item.fileName, item]))
        const roots = [...chunks.values()].filter(chunk => chunk.isEntry)
        if (!roots.length) fail('emitted entry roots are missing')
        const next = new Set(), pending = roots.map(chunk => chunk.fileName)
        while (pending.length) {
          const path = pending.pop()
          if (next.has(path)) continue
          const chunk = chunks.get(path)
          if (!chunk || !isJavaScript(path)) fail(`required emitted JavaScript chunk is missing: ${path}`)
          if (!Array.isArray(chunk.imports)) fail(`static imports are unavailable: ${path}`)
          next.add(path)
          pending.push(...chunk.imports)
        }
        required = next
      } },
    },
    async manifestTransform(entries) {
      if (!required) fail('manifest arrived before a successful emitted graph capture')
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
