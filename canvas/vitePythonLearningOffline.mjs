import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

export const LEARNING_OFFLINE_SCHEMA = 'python-learning-offline/v1'
export const createPythonLearningOfflinePlugin = revision => ({
  name: 'agentic-graph-python-learning-offline-manifest', apply: 'build',
  writeBundle: { order: 'post', sequential: true, async handler(options, bundle) {
    if (!/^[0-9a-f]{40}$/.test(revision)) throw new Error('Offline manifest requires an exact source revision.')
    // Conservative closure of the existing application shell. Dynamic editor, language and
    // worker imports are included; unrelated public datasets/models are not learning inputs.
    const names = Object.keys(bundle).filter(name => name === 'index.html' || /^assets\/.*\.(?:js|css|woff2?|ttf|svg|png)$/.test(name)).sort()
    const files = []
    for (const path of names) {
      const bytes = await readFile(resolve(options.dir, path))
      files.push({ path, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') })
    }
    if (!files.some(file => file.path === 'index.html') || !files.some(file => /pythonWorker/.test(file.path))) throw new Error('Learning offline closure is missing its shell or worker.')
    const manifest = { schema: LEARNING_OFFLINE_SCHEMA, revision, files, bytes: files.reduce((sum, file) => sum + file.bytes, 0) }
    if (files.length > 4096 || manifest.bytes > 96 * 1024 * 1024 || files.some(file => file.bytes > 16 * 1024 * 1024)) throw new Error('Learning offline closure exceeds its installation budget.')
    await writeFile(resolve(options.dir, `learning-offline-manifest-${revision}.json`), JSON.stringify(manifest))
  } },
})

// Serialized into the existing revision authority, never installed as another service worker.
// The same native owner supplies Workbox cache reads and explicit installation messages.
export function installLearningOfflineOwner(owner, sourceRevision) {
  const scope = new URL(owner.registration.scope), prefix = 'kg-python-learning-v1-' + encodeURIComponent(scope.pathname) + '-', meta = prefix + 'state'
  const pointerUrl = new URL('__learning_state__', scope).href, manifestKey = new URL('__learning_manifest__', scope).href
  const sha = /^[0-9a-f]{64}$/, revisionPattern = /^[0-9a-f]{40}$/
  const failure = message => { throw new Error(message) }
  const digest = async bytes => Array.from(new Uint8Array(await owner.crypto.subtle.digest('SHA-256', bytes)), byte => byte.toString(16).padStart(2, '0')).join('')
  const limited = async (response, limit) => {
    if (!response || response.status !== 200 || response.type === 'opaque' || Number(response.headers.get('content-length')) > limit) failure('Offline asset response is unavailable or oversized.')
    const reader = response.body?.getReader(), chunks = []; let size = 0
    if (!reader) failure('Offline response has no readable body.')
    try { while (true) { const part = await reader.read(); if (part.done) break; size += part.value.length; if (size > limit) failure('Offline response exceeds its byte limit.'); chunks.push(part.value) } }
    finally { await reader.cancel().catch(() => {}) }
    const bytes = new Uint8Array(size); let offset = 0
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length }
    return bytes
  }
  const json = bytes => JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
  const validVersion = value => value && revisionPattern.test(value.revision) && sha.test(value.digest)
    && value.cache === prefix + value.revision + '-' + value.digest
  const readState = async () => {
    const response = await (await owner.caches.open(meta)).match(pointerUrl)
    if (!response) return { active: null, previous: null }
    const state = json(await limited(response, 4096))
    if (!validVersion(state.active) || state.previous !== null && !validVersion(state.previous)) failure('Offline installation pointer is corrupt. Export source and debriefs before clearing site data.')
    return state
  }
  const validateManifest = value => {
    if (!value || value.schema !== 'python-learning-offline/v1' || !revisionPattern.test(value.revision) || !Array.isArray(value.files)
      || value.files.length < 2 || value.files.length > 4096) failure('Invalid offline manifest.')
    const seen = new Set(); let total = 0
    for (const file of value.files) {
      if (!file || typeof file.path !== 'string' || !(file.path === 'index.html' || file.path.startsWith('assets/' + value.revision + '/'))
        || /[?#%\\\s]/.test(file.path) || file.path.split('/').some(part => part === '..' || !part)
        || !Number.isSafeInteger(file.bytes) || file.bytes < 1 || file.bytes > 16 * 1024 * 1024 || !sha.test(file.sha256) || seen.has(file.path)) failure('Invalid offline member.')
      total += file.bytes; seen.add(file.path)
    }
    if (!seen.has('index.html') || total !== value.bytes || total > 96 * 1024 * 1024) failure('Invalid offline closure or byte budget.')
    return value
  }
  const readManifest = async version => {
    if (!validVersion(version)) failure('No verified offline installation is selected.')
    const cache = await owner.caches.open(version.cache), bytes = await limited(await cache.match(manifestKey), 1024 * 1024)
    if (await digest(bytes) !== version.digest) failure('Offline manifest digest mismatch.')
    const manifest = validateManifest(json(bytes))
    if (manifest.revision !== version.revision) failure('Offline manifest revision mismatch.')
    return { cache, manifest }
  }
  const checkedMember = async (cache, file) => {
    const response = await cache.match(new URL(file.path, scope).href), bytes = await limited(response?.clone(), file.bytes)
    if (bytes.length !== file.bytes || await digest(bytes) !== file.sha256) failure('Offline asset missing or corrupt: ' + file.path)
    return response
  }
  const verify = async version => {
    const { cache, manifest } = await readManifest(version)
    for (const file of manifest.files) await checkedMember(cache, file)
    return { revision: version.revision, digest: version.digest, bytes: manifest.bytes, files: manifest.files.length }
  }
  const lock = action => {
    if (!owner.navigator?.locks) failure('This browser cannot safely coordinate offline installations.')
    return owner.navigator.locks.request(prefix + scope.href, action)
  }
  const install = () => lock(async () => {
    const state = await readState(), abort = new AbortController(), timeout = setTimeout(() => abort.abort(), 180000)
    let candidate = null, committed = false
    try {
      const raw = await limited(await owner.fetch(new URL(`learning-offline-manifest-${sourceRevision}.json`, scope), { cache: 'no-store', signal: abort.signal }), 1024 * 1024)
      const manifest = validateManifest(json(raw)); if (manifest.revision !== sourceRevision) failure('Installation revision changed. Reload online before retrying.')
      candidate = { revision: sourceRevision, digest: await digest(raw), cache: '' }; candidate.cache = prefix + candidate.revision + '-' + candidate.digest
      if (state.active?.cache === candidate.cache || state.previous?.cache === candidate.cache) return verify(candidate)
      // A failed earlier attempt may leave an unreferenced cache; its immutable name is safe to replace.
      await owner.caches.delete(candidate.cache)
      const cache = await owner.caches.open(candidate.cache)
      for (const file of manifest.files) {
        if (abort.signal.aborted) failure('Offline installation timed out; the previous version is preserved.')
        const url = new URL(file.path, scope).href
        const response = await owner.fetch(url, { cache: 'no-store', signal: abort.signal }), bytes = await limited(response, file.bytes)
        if (bytes.length !== file.bytes || await digest(bytes) !== file.sha256) failure('Downloaded asset digest mismatch: ' + file.path)
        const type = file.path.endsWith('.html') ? 'text/html' : file.path.endsWith('.js') ? 'text/javascript' : file.path.endsWith('.css') ? 'text/css' : response.headers.get('content-type') || 'application/octet-stream'
        await cache.put(url, new Response(bytes, { headers: { 'content-type': type } }))
      }
      await cache.put(manifestKey, new Response(raw, { headers: { 'content-type': 'application/json' } }))
      const evidence = await verify(candidate)
      if (abort.signal.aborted) failure('Offline installation timed out before activation.')
      let previous = null
      for (const version of [state.active, state.previous]) {
        if (!version) continue
        try { await verify(version); previous = version; break } catch { /* Retain the newest complete version, never a corrupt replacement. */ }
      }
      // One atomic cache entry publishes membership only after every byte has passed readback.
      const pointer = await owner.caches.open(meta)
      await pointer.put(pointerUrl, new Response(JSON.stringify({ active: candidate, previous })))
      committed = true
      const readback = await readState(); if (readback.active.cache !== candidate.cache) failure('Offline pointer readback failed.')
      // Keep the immediately preceding complete pack, including its HTML, through SW upgrades.
      for (const name of await owner.caches.keys()) if (name.startsWith(prefix) && ![meta, candidate.cache, previous?.cache].includes(name)) await owner.caches.delete(name)
      return evidence
    } finally { clearTimeout(timeout); if (candidate && !committed && candidate.cache !== state.active?.cache && candidate.cache !== state.previous?.cache) await owner.caches.delete(candidate.cache) }
  })
  const recover = () => lock(async () => {
    const state = await readState(), evidence = await verify(state.previous)
    await (await owner.caches.open(meta)).put(pointerUrl, new Response(JSON.stringify({ active: state.previous, previous: state.active })))
    const readback = await readState(); if (readback.active.cache !== state.previous.cache) failure('Recovery pointer readback failed.')
    return evidence
  })
  const read = async request => {
    const url = new URL(request.url)
    if (url.origin !== scope.origin || !url.pathname.startsWith(scope.pathname)) return null
    const navigation = request.mode === 'navigate' && url.searchParams.has('python-learning-offline')
    if (!navigation && !url.pathname.startsWith(scope.pathname + 'assets/')) return null
    let state
    try { state = await readState() } catch (error) { if (!navigation) return null; return new Response(String(error.message), { status: 503 }) }
    try {
      const requested = navigation ? url.searchParams.get('python-learning-offline') : url.pathname.slice(scope.pathname.length).split('/')[1]
      const version = [state.active, state.previous].find(item => item?.revision === requested)
      if (!version) { if (navigation) failure('This offline version is not installed. Reconnect and install it from the Python pane.'); return null }
      if (navigation) await verify(version)
      const { cache, manifest } = await readManifest(version)
      const file = manifest.files.find(item => item.path === (navigation ? 'index.html' : url.pathname.slice(scope.pathname.length)))
      if (!file) { if (navigation) failure('Offline shell is missing.'); return null }
      return await checkedMember(cache, file)
    } catch (error) {
      const message = String(error.message || error)
      if (!navigation) return new Response(message, { status: 503, headers: { 'content-type': 'text/plain' } })
      const escape = value => String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character])
      let recovery = ''
      for (const version of [state.active, state.previous]) {
        if (!version || version.revision === url.searchParams.get('python-learning-offline')) continue
        try {
          await verify(version)
          const target = new URL(scope); target.searchParams.set('python-learning-offline', version.revision); target.searchParams.set('openEditorWorkspace', '1')
          recovery = `<p><a href="${escape(target.href)}">Open previous verified installation</a></p>`; break
        } catch { /* A recovery link is offered only after full readback. */ }
      }
      return new Response(`<!doctype html><html lang="en"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Offline installation unavailable</title><body><h1>Offline installation unavailable</h1><p>${escape(message)}</p>${recovery}<p>Your workspace source and debriefs are preserved. Reconnect to reinstall from the Python pane if no complete version remains.</p></body></html>`, { status: 503, headers: { 'content-type': 'text/html; charset=utf-8' } })
    }
  }
  const message = event => {
    if (event.data?.type !== 'AG_PYTHON_LEARNING_OFFLINE' || !event.ports?.[0]) return
    const port = event.ports[0], client = event.source?.url && new URL(event.source.url)
    if (!client || client.origin !== scope.origin || !client.pathname.startsWith(scope.pathname)) return
    const operation = event.data.operation
    const work = async () => {
      try {
        if (!['install', 'verify', 'recover'].includes(operation) || !revisionPattern.test(event.data.revision)) failure('Invalid offline operation.')
        if (operation === 'install' && event.data.revision !== sourceRevision) failure('The page and service worker revisions differ. Reload online before installing.')
        const evidence = operation === 'install' ? await install() : operation === 'recover' ? await recover() : await lock(async () => {
          const state = await readState(); return verify([state.active, state.previous].find(item => item?.revision === event.data.revision))
        })
        port.postMessage({ ok: true, evidence })
      } catch (error) { port.postMessage({ ok: false, error: String(error.message || error).slice(0, 1024) }) }
    }
    event.waitUntil(work())
  }
  owner.__agLearningOffline = { read, message }
}
