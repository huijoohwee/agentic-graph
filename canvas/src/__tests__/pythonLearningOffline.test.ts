import test from 'node:test'
import assert from 'node:assert/strict'
import { webcrypto } from 'node:crypto'
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { installLearningOfflineOwner, createPythonLearningOfflinePlugin } from '../../vitePythonLearningOffline.mjs'

const scope = 'https://local.test/app/', prefix = 'kg-python-learning-v1-', first = '1'.repeat(40), second = '2'.repeat(40)
const digest = async (bytes: Uint8Array) => Buffer.from(await webcrypto.subtle.digest('SHA-256', bytes)).toString('hex')
class CacheFixture {
  values = new Map<string, Response>()
  constructor(private failure: () => boolean) {}
  async match(key: string) { return this.values.get(String(key))?.clone() }
  async put(key: string, response: Response) { if (this.failure()) throw new Error('Quota exceeded'); this.values.set(String(key), response.clone()) }
}
function environment() {
  const caches = new Map<string, CacheFixture>(), downloads = new Map<string, string>()
  let quota = false, serial: Promise<unknown> = Promise.resolve(), calls = 0
  const cacheStorage = {
    async open(name: string) { if (!caches.has(name)) caches.set(name, new CacheFixture(() => quota)); return caches.get(name)! },
    async keys() { return [...caches.keys()] }, async delete(name: string) { return caches.delete(name) },
  }
  const locks = { request(_key: string, action: () => Promise<unknown>) { const work = serial.then(action); serial = work.catch(() => {}); return work } }
  const ownerFor = (revision: string) => {
    const owner = { registration: { scope }, crypto: webcrypto, navigator: { locks }, caches: cacheStorage,
      async fetch(url: URL) { calls++; const body = downloads.get(String(url)); return new Response(body || 'missing', { status: body ? 200 : 404 }) },
      __agLearningOffline: undefined as { read(request: unknown): Promise<Response>; message(event: unknown): void } | undefined,
    }
    installLearningOfflineOwner(owner, revision)
    const request = (operation: string, requested = revision): Promise<any> => new Promise(resolve => owner.__agLearningOffline!.message({
      data: { type: 'AG_PYTHON_LEARNING_OFFLINE', operation, revision: requested }, source: { url: scope }, ports: [{ postMessage: resolve }], waitUntil() {},
    }))
    return { owner, request, navigate: (rev = revision) => owner.__agLearningOffline!.read({ url: scope + '?python-learning-offline=' + rev, mode: 'navigate' }) }
  }
  const publish = async (revision: string, change?: (manifest: any) => void) => {
    const assets = { 'index.html': `<html>${revision}</html>`, [`assets/${revision}/pythonWorker.js`]: `// worker ${revision}` }
    const files = await Promise.all(Object.entries(assets).map(async ([path, text]) => {
      downloads.set(scope + path, text); const bytes = new TextEncoder().encode(text)
      return { path, bytes: bytes.length, sha256: await digest(bytes) }
    }))
    const manifest = { schema: 'python-learning-offline/v1', revision, files, bytes: files.reduce((sum, file) => sum + file.bytes, 0) }
    change?.(manifest); downloads.set(scope + `learning-offline-manifest-${revision}.json`, JSON.stringify(manifest))
  }
  return { caches, downloads, ownerFor, publish, setQuota: (value: boolean) => { quota = value }, calls: () => calls,
    state: async () => (await (await cacheStorage.open(prefix + 'state')).match(scope + '__learning_state__'))?.json(),
  }
}

test('offline install admits a complete digest closure, preserves a prior version and recovers without network', async () => {
  const env = environment(); await env.publish(first); const one = env.ownerFor(first)
  assert.equal((await one.request('verify')).ok, false)
  assert.equal((await one.request('install')).ok, true)
  assert.match(await (await one.navigate()).text(), new RegExp(first))
  await env.publish(second); const two = env.ownerFor(second)
  env.downloads.set(scope + `assets/${second}/pythonWorker.js`, 'corrupt')
  assert.equal((await two.request('install')).ok, false)
  assert.equal((await env.state()).active.revision, first)
  assert.equal((await two.navigate(first)).status, 200)
  await env.publish(second); assert.equal((await two.request('install')).ok, true)
  assert.equal((await env.state()).previous.revision, first)
  const before = env.calls(); env.downloads.clear()
  assert.equal((await two.request('recover')).ok, true)
  assert.equal((await env.state()).active.revision, first)
  assert.equal(env.calls(), before)
  assert.equal((await two.navigate(first)).status, 200)
})

test('corruption fails closed and recovery verifies prior membership before changing the pointer', async () => {
  const env = environment(); await env.publish(first); const one = env.ownerFor(first); await one.request('install')
  await env.publish(second); const two = env.ownerFor(second); await two.request('install')
  const state = await env.state(), cache = env.caches.get(state.active.cache)!
  await cache.put(scope + `assets/${second}/pythonWorker.js`, new Response('tampered'))
  assert.equal((await two.request('verify')).ok, false)
  const blocked = await two.navigate(); assert.equal(blocked.status, 503)
  assert.match(await blocked.text(), /Open previous verified installation/, 'cold offline failure offers a verified recovery link')
  assert.equal((await env.state()).active.cache, state.active.cache)
  assert.equal((await two.request('recover')).ok, true)
  assert.equal((await two.navigate(first)).status, 200)
  assert.equal((await two.request('recover')).ok, false, 'cannot activate corrupt previous pack')
  assert.equal((await env.state()).active.revision, first)
})

test('quota and invalid manifests preserve exact prior pointer and never fetch foreign members', async () => {
  const env = environment(); await env.publish(first); const one = env.ownerFor(first); await one.request('install')
  const before = JSON.stringify(await env.state()); await env.publish(second); const two = env.ownerFor(second)
  env.setQuota(true); assert.equal((await two.request('install')).ok, false); env.setQuota(false)
  assert.equal(JSON.stringify(await env.state()), before)
  for (const bad of ['https://foreign.test/file', 'assets/' + second + '/../escape.js', 'assets/' + second + '/%2e%2e/x.js']) {
    await env.publish(second, manifest => { manifest.files[1].path = bad })
    const calls = env.calls(); assert.equal((await two.request('install')).ok, false)
    assert.equal(env.calls(), calls + 1, 'only the same-origin manifest was fetched')
    assert.equal(JSON.stringify(await env.state()), before)
  }
  assert.equal((await two.request('install', first)).ok, false, 'stale page cannot install a different worker revision')
})

test('concurrent installers serialize, retain two complete packs and leave ordinary navigation alone', async () => {
  const env = environment(); await env.publish(first); const one = env.ownerFor(first)
  assert.deepEqual((await Promise.all([one.request('install'), one.request('install')])).map(value => value.ok), [true, true])
  await env.publish(second); await env.ownerFor(second).request('install')
  const third = '3'.repeat(40); await env.publish(third); const three = env.ownerFor(third); await three.request('install')
  assert.equal((await env.state()).previous.revision, second)
  assert.equal([...env.caches.keys()].filter(name => name !== prefix + 'state').length, 2)
  assert.equal((await three.navigate(first)).status, 503)
  assert.equal(await three.owner.__agLearningOffline!.read({ url: scope, mode: 'navigate' }), null)
})

test('native build inventory includes HTML, worker and lazy language bytes with exact hashes', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'python-learning-manifest-'))
  try {
    const files = ['index.html', `assets/${first}/pythonWorker.js`, `assets/${first}/pythonLanguage.js`]
    await mkdir(join(directory, `assets/${first}`), { recursive: true })
    for (const file of files) await writeFile(join(directory, file), file)
    const plugin = createPythonLearningOfflinePlugin(first)
    assert.equal(plugin.writeBundle.order, 'post'); assert.equal(plugin.writeBundle.sequential, true)
    await plugin.writeBundle.handler({ dir: directory }, Object.fromEntries(files.map(path => [path, {}])))
    const manifest = JSON.parse(await readFile(join(directory, `learning-offline-manifest-${first}.json`), 'utf8'))
    assert.deepEqual(manifest.files.map((file: any) => file.path), [...files].sort())
    for (const file of manifest.files) assert.equal(file.sha256, await digest(await readFile(join(directory, file.path))))
    await assert.rejects(plugin.writeBundle.handler({ dir: directory }, { 'index.html': {} }), /missing its shell or worker/)
  } finally { await rm(directory, { recursive: true, force: true }) }
})

test('upgrade retains the last complete pack when the current pack was evicted or corrupted', async () => {
  const env = environment(); await env.publish(first); await env.ownerFor(first).request('install')
  await env.publish(second); await env.ownerFor(second).request('install')
  const state = await env.state(); env.caches.get(state.active.cache)!.values.delete(scope + `assets/${second}/pythonWorker.js`)
  const third = '3'.repeat(40); await env.publish(third); const three = env.ownerFor(third)
  assert.equal((await three.request('install')).ok, true)
  assert.equal((await env.state()).previous.revision, first)
  assert.equal((await three.request('recover')).ok, true)
  assert.equal((await three.navigate(first)).status, 200)
})
