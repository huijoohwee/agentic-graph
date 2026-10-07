import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'
import { build } from 'esbuild'

const revision = '0123456789abcdef0123456789abcdef01234567'
const compiled = await build({
  entryPoints: [new URL('../../canvas/sw.ts', import.meta.url).pathname],
  bundle: true, write: false, format: 'cjs', platform: 'browser',
  external: ['workbox-*'], define: { __AGENTIC_OS_SOURCE_REVISION__: JSON.stringify(revision) },
})
function worker(read) {
  const events = [], routes = [], precachePlugins = []
  const strategy = name => class { constructor(options) { this.name = name; this.options = options } }
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
    self: { __WB_MANIFEST: [{ url: 'assets/app.js', revision }], __agLearningOffline: { read },
      location: { origin: 'https://example.test' }, skipWaiting: () => events.push('skip') },
  }
  vm.runInNewContext(compiled.outputFiles[0].text, context)
  return { events, routes, plugin: precachePlugins[0] }
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

test('one worker retains exact imports and composes canonical route policy after precache', () => {
  const { events, routes } = worker(async () => null)
  assert.deepEqual(events, [
    `agentic-graph-service-worker-revision.js?revision=${revision}`,
    `agentic-graph-chat-stream-sw.js?revision=${revision}`, 'skip', 'claim', 'plugins', 'precache', 'cleanup',
  ])
  assert.deepEqual(routes.map(([, s]) => [s.name, s.options.cacheName]), [
    ['CacheOnly', 'kg-python-learning-navigation'], ['CacheFirst', 'kg-xr-v2-runtime'],
    ['StaleWhileRevalidate', 'kg-assets'], ['CacheFirst', 'kg-static'], ['StaleWhileRevalidate', 'kg-data'],
  ])
  assert.deepEqual(Array.from(routes[1][1].options.plugins, p => p.name ?? 'policy'), ['policy', 'cacheable', 'expiration'])
  const config = readFileSync(new URL('../../canvas/vite.config.ts', import.meta.url), 'utf8')
  assert.match(config, /strategies: 'injectManifest', srcDir: '\.', filename: 'sw.ts'/)
  assert.match(config, /additionalManifestEntries: offlinePrecacheEntries\(offlinePublicAssets\)/)
  assert.doesNotMatch(config, /navigateFallback:|runtimeCaching:/)
})
