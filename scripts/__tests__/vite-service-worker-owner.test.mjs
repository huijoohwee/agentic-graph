import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'
import { build } from 'esbuild'
import { createPwaPrecacheAdmission } from '../../canvas/vitePwaPrecacheAdmission.mjs'

const revision = '0123456789abcdef0123456789abcdef01234567'
const compiled = await build({
  entryPoints: [new URL('../../canvas/sw.ts', import.meta.url).pathname],
  bundle: true, write: false, format: 'cjs', platform: 'browser',
  external: ['workbox-*'], define: { __AGENTIC_OS_SOURCE_REVISION__: JSON.stringify(revision) },
})

test('precache admits the entry static closure and excludes deferred JavaScript', async () => {
  const admission = createPwaPrecacheAdmission()
  admission.plugin.buildStart()
  admission.plugin.generateBundle.handler({}, {
    'entry.js': { type: 'chunk', fileName: 'entry.js', isEntry: true, imports: ['shared.js'] },
    'shared.js': { type: 'chunk', fileName: 'shared.js', isEntry: false, imports: [] },
    'deferred.js': { type: 'chunk', fileName: 'deferred.js', isEntry: false, imports: [] },
  })
  const transformed = await admission.manifestTransform([
    { url: 'entry.js', revision }, { url: 'shared.js', revision },
    { url: 'deferred.js', revision }, { url: 'manifest.webmanifest', revision },
  ])
  assert.deepEqual(transformed, { manifest: [
    { url: 'entry.js', revision }, { url: 'shared.js', revision },
    { url: 'manifest.webmanifest', revision },
  ], warnings: [] })
})

function worker(read) {
  const events = [], routes = [], precachePlugins = [], strategies = [], delegated = []
  const strategy = name => class {
    constructor(options) { this.name = name; this.options = options; strategies.push(this) }
    async handle(options) { delegated.push({ strategy: this, options }); return new Response('ordinary runtime') }
  }
  const modules = {
    'workbox-core': { clientsClaim: () => events.push('claim') },
    'workbox-precaching': {
      addPlugins: plugins => { events.push('plugins'); precachePlugins.push(...plugins) },
      precacheAndRoute: manifest => { events.push('precache'); assert.equal(manifest.length, 1) },
      cleanupOutdatedCaches: () => events.push('cleanup'),
    },
    'workbox-routing': { registerRoute: (...args) => routes.push(args) },
    'workbox-strategies': Object.fromEntries(['CacheFirst', 'CacheOnly', 'StaleWhileRevalidate'].map(n => [n, strategy(n)])),
    'workbox-cacheable-response': { CacheableResponsePlugin: strategy('cacheable') },
    'workbox-expiration': { ExpirationPlugin: strategy('expiration') },
  }
  const context = {
    Response, Request, URL,
    require: name => { assert.ok(modules[name], name); return modules[name] },
    importScripts: (...urls) => events.push(...urls),
    self: { __WB_MANIFEST: [{ url: 'assets/app.js', revision }], __agLearningOffline: read ? { read } : undefined,
      location: { origin: 'https://example.test' }, skipWaiting: () => events.push('skip') },
  }
  vm.runInNewContext(compiled.outputFiles[0].text, context)
  return { events, routes, plugin: precachePlugins[0], delegated,
    strategies: strategies.filter(s => ['CacheOnly', 'CacheFirst', 'StaleWhileRevalidate'].includes(s.name)) }
}

test('precache verification uses original fetch request and preserves denial responses', async () => {
  const original = new Request('https://example.test/assets/app.js')
  const transformed = new Request(`${original.url}?__WB_REVISION__=workbox-key`)
  const unverified = new Response('ordinary cache')
  for (const cachedResponse of [undefined, unverified]) {
    for (const admitted of [new Response('verified pack'), new Response('pack damaged', { status: 503 })]) {
      let reads = 0
      const { plugin } = worker(async request => { reads++; assert.equal(request, original); return admitted })
      const result = await plugin.cachedResponseWillBeUsed({
        event: { type: 'fetch', request: original }, request: transformed, cachedResponse,
      })
      assert.equal(result, admitted)
      assert.equal(reads, 1)
    }
  }
})

test('installation and unadmitted requests retain the normal precache lifecycle', async () => {
  let reads = 0
  const { plugin } = worker(async () => { reads++; return null })
  const cachedResponse = new Response('ordinary cache')
  assert.equal(await plugin.cachedResponseWillBeUsed({ event: { type: 'install' }, cachedResponse }), cachedResponse)
  assert.equal(reads, 0)
  const event = { type: 'fetch', request: new Request('https://example.test/a.js') }
  assert.equal(await plugin.cachedResponseWillBeUsed({ event, cachedResponse }), cachedResponse)
  assert.equal(await plugin.cachedResponseWillBeUsed({ event }), undefined)
  assert.equal(reads, 2)
  const failing = worker(async () => { throw new Error('verification failed') })
  await assert.rejects(failing.plugin.cachedResponseWillBeUsed({ event, cachedResponse }), /verification failed/)
})

test('SWR consults installed authority before starting any background request', async () => {
  for (const index of [2, 4]) {
    const request = new Request('https://example.test/deferred.js')
    const options = { request, event: { type: 'fetch', request }, params: { identity: 'retained' } }
    for (const status of [200, 503]) {
      const admitted = new Response('verified pack result', { status })
      const state = worker(async observed => { assert.equal(observed, request); return admitted })
      assert.equal(await state.routes[index][1](options), admitted)
      assert.equal(state.delegated.length, 0)
    }
    for (const read of [undefined, async () => null]) {
      const state = worker(read)
      assert.equal(await (await state.routes[index][1](options)).text(), 'ordinary runtime')
      assert.equal(state.delegated.length, 1)
      assert.equal(state.delegated[0].options, options)
      assert.equal(state.delegated[0].strategy, state.strategies[index])
    }
    const failed = worker(async () => { throw new Error('verification failed') })
    await assert.rejects(failed.routes[index][1](options), /verification failed/)
    assert.equal(failed.delegated.length, 0)
  }
})

test('runtime caches reject HTML reads and writes while admitting only status 200', async () => {
  const { strategies } = worker(async () => null)
  for (const index of [1, 2, 3, 4]) {
    const policy = strategies[index].options.plugins[0]
    for (const contentType of ['text/html', 'application/xhtml+xml']) {
      const response = new Response('html', { status: 200, headers: { 'content-type': contentType } })
      assert.equal(await policy.cachedResponseWillBeUsed({ cachedResponse: response }), null)
      assert.equal(await policy.cacheWillUpdate({ response }), null)
    }
    const admitted = new Response('asset', { status: 200, headers: { 'content-type': 'application/javascript' } })
    assert.equal(await policy.cacheWillUpdate({ response: admitted }), admitted)
    assert.equal(await policy.cacheWillUpdate({ response: new Response('missing', { status: 503 }) }), null)
  }
})

test('one worker retains exact imports and composes canonical route policy after precache', () => {
  const { events, routes, strategies } = worker(async () => null)
  assert.deepEqual(events, [
    `agentic-graph-service-worker-revision.js?revision=${revision}`,
    `agentic-graph-chat-stream-sw.js?revision=${revision}`, 'skip', 'claim', 'plugins', 'precache', 'cleanup',
  ])
  assert.deepEqual(strategies.map(s => [s.name, s.options.cacheName]), [
    ['CacheOnly', 'kg-python-learning-navigation'], ['CacheFirst', 'kg-xr-v2-runtime'],
    ['StaleWhileRevalidate', 'kg-assets'], ['CacheFirst', 'kg-static'], ['StaleWhileRevalidate', 'kg-data'],
  ])
  for (const index of [0, 1, 3]) assert.equal(routes[index][1], strategies[index])
  for (const index of [2, 4]) assert.equal(typeof routes[index][1], 'function')
  assert.deepEqual(Array.from(routes[1][1].options.plugins, p => p.name ?? 'policy'), ['policy', 'cacheable', 'expiration'])
  const config = readFileSync(new URL('../../canvas/vite.config.ts', import.meta.url), 'utf8')
  assert.match(config, /strategies: 'injectManifest', srcDir: '\.', filename: 'sw.ts'/)
  assert.doesNotMatch(config, /additionalManifestEntries:|offlinePrecacheEntries/)
  assert.match(config, /createPythonLearningOfflinePlugin\(runtimeIdentity.sourceRevision, offlinePublicAssets\)/)
  assert.doesNotMatch(config, /navigateFallback:|runtimeCaching:/)
})
