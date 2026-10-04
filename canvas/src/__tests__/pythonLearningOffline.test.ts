import test from 'node:test'
import assert from 'node:assert/strict'
import { webcrypto } from 'node:crypto'
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { installLearningOfflineOwner, createPythonLearningOfflinePlugin, offlinePrecacheEntries } from '../../vitePythonLearningOffline.mjs'
import authoredPublicAssets from '../features/evidence-analysis/profiles/offline-assets.json'
import { buildPwaRuntimeCachingRules } from '../../vitePwaRuntimeCachePolicy'

const scope = 'https://local.test/app/', prefix = 'kg-python-learning-v1-%2Fapp%2F-', first = '1'.repeat(40), second = '2'.repeat(40)
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
    return { owner, request, navigate: (rev = revision, route = 'python-learning-offline') => owner.__agLearningOffline!.read({ url: scope + '?' + route + '=' + rev, mode: 'navigate' }) }
  }
  const publish = async (revision: string, change?: (manifest: any) => void, publicAssets: Record<string, string> = {}) => {
    const assets = { 'index.html': `<html>${revision}</html>`, [`assets/${revision}/pythonWorker.js`]: `// worker ${revision}`, ...publicAssets }
    const files = await Promise.all(Object.entries(assets).map(async ([path, text]) => {
      downloads.set(scope + path, text); const bytes = new TextEncoder().encode(text)
      return { path, bytes: bytes.length, sha256: await digest(bytes) }
    }))
    const manifest = { schema: 'python-learning-offline/v1', revision, files, ...(Object.keys(publicAssets).length ? { publicAssets: Object.keys(publicAssets) } : {}), bytes: files.reduce((sum, file) => sum + file.bytes, 0) }
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

test('the verified application pack serves Studio navigation offline and fails closed on missing or ambiguous revisions', async () => {
  const env = environment(); await env.publish(first); const one = env.ownerFor(first)
  assert.equal((await one.navigate(first, 'studio-offline')).status, 503)
  assert.equal((await one.request('install')).ok, true)
  const before = env.calls(); env.downloads.clear()
  assert.match(await (await one.navigate(first, 'studio-offline')).text(), new RegExp(first))
  assert.equal(env.calls(), before, 'Studio navigation reads the verified pack without network')
  assert.equal((await one.navigate(second, 'studio-offline')).status, 503)
  const ambiguous = await one.owner.__agLearningOffline!.read({
    url: scope + '?python-learning-offline=' + first + '&studio-offline=' + first, mode: 'navigate',
  })
  assert.equal(ambiguous.status, 503)
  assert.match(await ambiguous.text(), /Choose one offline workspace route/)
})

test('corruption fails closed and recovery verifies prior membership before changing the pointer', async () => {
  const env = environment(); await env.publish(first); const one = env.ownerFor(first); await one.request('install')
  await env.publish(second); const two = env.ownerFor(second); await two.request('install')
  const state = await env.state(), cache = env.caches.get(state.active.cache)!
  await cache.put(scope + `assets/${second}/pythonWorker.js`, new Response('tampered'))
  assert.equal((await two.request('verify')).ok, false)
  const blocked = await two.navigate(); assert.equal(blocked.status, 503)
  assert.match(await blocked.text(), /Open previous verified installation/, 'cold offline failure offers a verified recovery link')
  const studioBlocked = await two.navigate(second, 'studio-offline')
  assert.equal(studioBlocked.status, 503)
  assert.match(await studioBlocked.text(), new RegExp('studio-offline=' + first), 'Studio recovery retains its own route')
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
  const anotherScope = 'kg-python-learning-v1-%2Fanother%2F-state'
  env.caches.set(anotherScope, new CacheFixture(() => false))
  const fourth = '4'.repeat(40); await env.publish(fourth); await env.ownerFor(fourth).request('install')
  assert.ok(env.caches.has(anotherScope), 'installation cleanup cannot delete another application scope')
})

test('native build inventory includes HTML, worker and lazy language bytes with exact hashes', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'python-learning-manifest-'))
  try {
    const files = ['index.html', `assets/${first}/pythonWorker.js`, `assets/${first}/pythonLanguage.js`, `assets/${first}/studioScene.js`]
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

test('declared public members are revision-bound offline and tampering fails closed', async () => {
  const file = 'example/fixtures/source.json', env = environment()
  await env.publish(first, undefined, { [file]: '{"version":1}' }); await env.ownerFor(first).request('install')
  await env.publish(second, undefined, { [file]: '{"version":2}' }); const two = env.ownerFor(second); await two.request('install')
  const read = (revision: string, path = file) => two.owner.__agLearningOffline!.read({ url: scope + path + '?revision=' + revision, mode: 'cors' })
  const before = env.calls(); env.downloads.clear()
  assert.equal(await (await read(first)).text(), '{"version":1}'); assert.equal(await (await read(second)).text(), '{"version":2}')
  assert.equal(await read(second, 'example/fixtures/undeclared.json'), null)
  assert.equal(await read('3'.repeat(40), 'example/fixtures/undeclared.json'), null, 'unknown revisions cannot claim an unrelated public URL')
  assert.equal((await read('3'.repeat(40))).status, 503); assert.equal(env.calls(), before)
  const current = (await env.state()).active, cache = env.caches.get(current.cache)!
  await cache.put(scope + file, new Response('{"version":9}'))
  assert.equal((await read(second)).status, 503); assert.equal((await two.request('verify')).ok, false)
  assert.equal(await (await read(first)).text(), '{"version":1}', 'prior complete source bytes remain distinct')
  cache.values.delete(scope + file); assert.equal((await read(second)).status, 503)
})

test('missing, undeclared and traversal public membership cannot replace a complete installation', async () => {
  const file = 'example/fixtures/source.json', env = environment(); await env.publish(first); await env.ownerFor(first).request('install')
  const before = JSON.stringify(await env.state()), two = env.ownerFor(second)
  for (const change of [
    (value: any) => { value.publicAssets = [] },
    (value: any) => { value.publicAssets.push('example/fixtures/missing.json') },
    (value: any) => { value.publicAssets[0] = 'example/../escape.json' },
    (value: any) => { value.publicAssets[0] = 'https://foreign.test/source.json' },
    (value: any) => { const file = value.files.find((entry: any) => value.publicAssets.includes(entry.path)); value.bytes += 500000 - file.bytes; file.bytes = 500000 },
  ]) {
    await env.publish(second, change, { [file]: '{}' }); const calls = env.calls()
    assert.equal((await two.request('install')).ok, false); assert.equal(env.calls(), calls + 1)
    assert.equal(JSON.stringify(await env.state()), before)
  }
  await env.publish(second, undefined, { [file]: '{}' }); env.downloads.delete(scope + file)
  assert.equal((await two.request('install')).ok, false); assert.equal(JSON.stringify(await env.state()), before)
})

test('one bounded authored asset declaration supplies exact build and precache membership', async () => {
  const entries = offlinePrecacheEntries(authoredPublicAssets)
  assert.ok(entries.length > 0 && entries.length <= 40)
  assert.deepEqual(entries, authoredPublicAssets.map(file => ({ url: file.path, revision: file.sha256 })))
  const config = await readFile(new URL('../../vite.config.ts', import.meta.url), 'utf8')
  assert.match(config, /createPythonLearningOfflinePlugin\(runtimeIdentity.sourceRevision, offlinePublicAssets\)/)
  assert.match(config, /additionalManifestEntries: offlinePrecacheEntries\(offlinePublicAssets\)/)
  for (const file of authoredPublicAssets) {
    const bytes = await readFile(new URL(`../../public/${file.path}`, import.meta.url)); assert.equal(bytes.length, file.bytes); assert.equal(await digest(bytes), file.sha256)
  }
  const directory = await mkdtemp(join(tmpdir(), 'declared-offline-assets-'))
  try {
    const shell = ['index.html', `assets/${first}/pythonWorker.js`]
    for (const file of shell) { await mkdir(join(directory, file, '..'), { recursive: true }); await writeFile(join(directory, file), file) }
    for (const file of authoredPublicAssets) { await mkdir(join(directory, file.path, '..'), { recursive: true }); await writeFile(join(directory, file.path), await readFile(new URL(`../../public/${file.path}`, import.meta.url))) }
    const plugin = createPythonLearningOfflinePlugin(first, authoredPublicAssets), bundle = Object.fromEntries(shell.map(path => [path, {}]))
    await plugin.writeBundle.handler({ dir: directory }, bundle)
    const manifest = JSON.parse(await readFile(join(directory, `learning-offline-manifest-${first}.json`), 'utf8'))
    assert.deepEqual(manifest.publicAssets, authoredPublicAssets.map(file => file.path)); assert.equal(manifest.files.length, shell.length + authoredPublicAssets.length)
    await writeFile(join(directory, authoredPublicAssets[0].path), 'changed')
    await assert.rejects(plugin.writeBundle.handler({ dir: directory }, bundle), /differs from its declaration/)
    await rm(join(directory, authoredPublicAssets[0].path))
    await assert.rejects(plugin.writeBundle.handler({ dir: directory }, bundle), /ENOENT/)
    assert.throws(() => offlinePrecacheEntries([...authoredPublicAssets, authoredPublicAssets[0]]), /Invalid offline public asset/)
    assert.throws(() => offlinePrecacheEntries([{ ...authoredPublicAssets[0], path: 'example/../escape.json' }]), /Invalid offline public asset/)
    assert.throws(() => offlinePrecacheEntries([{ ...authoredPublicAssets[0], bytes: 500000 }]), /Invalid offline public asset/)
  } finally { await rm(directory, { recursive: true, force: true }) }
})

test('immutable build assets use verified pack bytes without background fetch and preserve mutable online policy', async () => {
  const env = environment(); await env.publish(first); const one = env.ownerFor(first)
  await one.request('install')
  const prior = new Map<string, PropertyDescriptor | undefined>(), priorMode = process.env.NODE_ENV
  const set = (key: string, value: unknown) => { prior.set(key, Object.getOwnPropertyDescriptor(globalThis, key)); Object.defineProperty(globalThis, key, { configurable: true, writable: true, value }) }
  class WorkerEvent extends Event { waitUntil(_promise: Promise<unknown>) {} }
  let networkCalls = 0
  set('self', { ...one.owner, location: new URL(scope), __WB_DISABLE_DEV_LOGS: true })
  set('location', new URL(scope)); set('ExtendableEvent', WorkerEvent); set('FetchEvent', WorkerEvent)
  set('caches', {
    async match(request: Request, options: { cacheName: string }) { return (await one.owner.caches.open(options.cacheName)).match(request.url) },
    async open(name: string) { const cache = await one.owner.caches.open(name); return { match: (request: Request) => cache.match(request.url), put: (request: Request, response: Response) => cache.put(request.url, response) } },
  })
  set('fetch', async () => { networkCalls++; return new Response('// online replacement', { headers: { 'content-type': 'text/javascript' } }) })
  process.env.NODE_ENV = 'production'
  try {
    const strategies = await import('workbox-strategies')
    const rules = buildPwaRuntimeCachingRules()
    const ruleFor = (path: string, destination = 'script', method = 'GET') => {
      const request = new Request(new URL(path, scope), { method }); Object.defineProperty(request, 'destination', { value: destination })
      const rule = rules.find(candidate => typeof candidate.urlPattern === 'function' && candidate.urlPattern({ request, url: new URL(request.url), sameOrigin: new URL(request.url).origin === new URL(scope).origin, event: new WorkerEvent('fetch') as never }))
      assert.ok(rule); return { request, rule }
    }
    const handle = async (path: string) => {
      const { request, rule } = ruleFor(path), Strategy = strategies[rule.handler as 'CacheFirst' | 'StaleWhileRevalidate']
      const strategy = new Strategy({ cacheName: rule.options!.cacheName, plugins: rule.options!.plugins })
      const [response, done] = strategy.handleAll({ request, event: new WorkerEvent('fetch') as never })
      const result = await response; await done; return result
    }
    const path = `assets/${first}/pythonWorker.js`
    assert.equal(await (await handle(path)).text(), `// worker ${first}`)
    assert.equal(networkCalls, 0, 'verified installed bytes must not schedule stale-while-revalidate traffic')
    const installed = env.caches.get((await env.state()).active.cache)!
    await installed.put(scope + path, new Response('corrupted'))
    assert.equal((await handle(path)).status, 503); assert.equal(networkCalls, 0, 'corruption must fail closed without fetching a replacement')
    installed.values.delete(scope + path)
    assert.equal((await handle(path)).status, 503); assert.equal(networkCalls, 0, 'an evicted admitted member must not fall through to the network')
    assert.equal((await handle(`assets/${second}/next.js`)).status, 200); assert.equal(networkCalls, 1, 'an uninstalled online revision must still fetch on its first request')
    assert.equal(ruleFor(path).rule.handler, 'CacheFirst')
    for (const mutable of ['assets/current/module.js', `assets/${first}/module.js?refresh=1`, `https://foreign.test/app/${path}`, `../another/${path}`, `assets/${first}/nested/module.js`]) {
      assert.equal(ruleFor(mutable).rule.handler, 'StaleWhileRevalidate', mutable)
    }
    assert.equal(ruleFor(path, 'script', 'POST').rule.handler, 'StaleWhileRevalidate')
  } finally {
    if (priorMode === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = priorMode
    for (const [key, descriptor] of prior) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key) }
  }
})
