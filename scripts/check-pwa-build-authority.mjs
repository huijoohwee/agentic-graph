import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import * as fakeIndexedDB from 'fake-indexeddb'

const repoRoot = path.resolve(import.meta.dirname, '..')
const serviceWorker = fs.readFileSync(path.resolve(repoRoot, 'canvas', 'dist', 'sw.js'), 'utf8')
const importedChatWorker = fs.readFileSync(
  path.resolve(repoRoot, 'canvas', 'public', 'agentic-graph-chat-stream-sw.js'),
  'utf8',
)
const revisionAuthority = fs.readFileSync(
  path.resolve(repoRoot, 'canvas', 'dist', 'agentic-graph-service-worker-revision.js'),
  'utf8',
)

assert.doesNotMatch(
  serviceWorker,
  /\{url:["']index\.html["']/,
  'generated service worker must not precache a mutable HTML shell',
)
assert.doesNotMatch(
  serviceWorker,
  /NavigationRoute\([^)]*createHandlerBoundToURL\(["']index\.html["']\)/,
  'generated service worker must not own production navigations through an HTML fallback',
)
// Exercise the emitted router, not minifier-specific variable names or inlining.
const listeners = new Map(), stores = new Map(), importedScripts = []
const keyOf = request => typeof request === 'string' ? request : request.url
const openCache = async name => {
  if (!stores.has(name)) stores.set(name, new Map())
  const rows = stores.get(name)
  return {
    match: async request => rows.get(keyOf(request))?.clone(),
    put: async (request, response) => { rows.set(keyOf(request), response.clone()) },
    delete: async request => rows.delete(keyOf(request)),
    keys: async () => [...rows.keys()].map(url => new Request(url)),
  }
}
const cacheStorage = {
  open: openCache, keys: async () => [...stores.keys()], delete: async name => stores.delete(name),
  async match(request, options = {}) {
    const names = options.cacheName ? [options.cacheName] : [...stores.keys()]
    for (const name of names) {
      const response = await (await openCache(name)).match(request)
      if (response) return response
    }
  },
}
class ProbeEvent {
  constructor(type, request) { this.type = type; this.request = request; this.pending = [] }
  waitUntil(promise) { this.pending.push(Promise.resolve(promise)) }
  respondWith(promise) { assert.equal(this.response, undefined, 'only one router may respond'); this.response = Promise.resolve(promise) }
  async settled() {
    let offset = 0
    while (offset < this.pending.length) {
      const end = this.pending.length
      await Promise.all(this.pending.slice(offset, end)); offset = end
    }
  }
}
let skipCount = 0, claimCount = 0, networkResponse, networkCalls = 0
const scope = 'https://pwa-proof.invalid/agentic-graph/'
const workerContext = {
  ...fakeIndexedDB, URL, Request, Response, Headers, console, setTimeout, clearTimeout,
  FetchEvent: ProbeEvent, ExtendableEvent: ProbeEvent,
  location: new URL(`${scope}sw.js`), registration: { scope }, caches: cacheStorage,
  clients: { claim: () => { claimCount++ } }, skipWaiting: () => { skipCount++ },
  importScripts: (...urls) => importedScripts.push(...urls),
  addEventListener(type, listener) {
    if (!listeners.has(type)) listeners.set(type, [])
    listeners.get(type).push(listener)
  },
  fetch: async () => { networkCalls++; return networkResponse.clone() },
}
workerContext.self = workerContext
vm.runInNewContext(serviceWorker, workerContext, { timeout: 5000 })
assert.equal(skipCount, 1, 'one lifecycle owner must activate the canonical worker')
const activate = new ProbeEvent('activate')
for (const listener of listeners.get('activate') || []) await listener(activate)
await activate.settled()
assert.equal(claimCount, 1, 'one lifecycle owner must claim clients')
assert.equal(listeners.get('fetch')?.length, 1, 'one Workbox router must own fetch admission')
const dispatch = async request => {
  const event = new ProbeEvent('fetch', request)
  for (const listener of listeners.get('fetch')) listener(event)
  const response = await event.response
  await event.settled()
  return response
}
const reply = (body, contentType = 'application/javascript', status = 200) => new Response(body, {
  status, headers: { 'content-type': contentType, date: new Date().toUTCString() },
})
for (const [cacheName, destination, extension] of [
  ['kg-assets', 'script', 'js'], ['kg-static', 'image', 'png'], ['kg-data', '', 'json'],
]) {
  const request = new Request(`${scope}authority-probe.${extension}`)
  Object.defineProperty(request, 'destination', { value: destination })
  const cache = await openCache(cacheName)
  for (const htmlType of ['text/html', 'application/xhtml+xml']) {
    await cache.put(request, reply('invalid cached HTML', htmlType))
    networkResponse = reply('valid network asset'); networkCalls = 0
    assert.equal(await (await dispatch(request)).text(), 'valid network asset', `${cacheName} must reject cached ${htmlType}`)
    assert.equal(networkCalls, 1)
    await cache.delete(request)
    networkResponse = reply('invalid network HTML', htmlType)
    await dispatch(request)
    assert.equal(await cache.match(request), undefined, `${cacheName} must not write ${htmlType}`)
  }
  networkResponse = reply('invalid status', 'application/javascript', 404)
  await dispatch(request)
  assert.equal(await cache.match(request), undefined, `${cacheName} must only cache status 200`)
  networkResponse = reply('valid asset')
  await dispatch(request)
  assert.equal(await (await cache.match(request)).text(), 'valid asset', `${cacheName} must retain valid responses`)
}
const navigation = new Request(scope)
Object.defineProperty(navigation, 'mode', { value: 'navigate' })
Object.defineProperty(navigation, 'destination', { value: 'document' })
assert.equal(await dispatch(navigation), undefined, 'normal HTML navigation must remain HTTP owned')
assert.doesNotMatch(
  importedChatWorker,
  /addEventListener\(["'](?:install|activate)["']/,
  'imported chat worker must not duplicate generated service-worker lifecycle ownership',
)
assert.doesNotMatch(
  revisionAuthority,
  /addEventListener\(["']install["']/,
  'revision authority must not duplicate generated service-worker install ownership',
)
assert.match(
  revisionAuthority,
  /addEventListener\(["']activate["']/,
  'revision authority must converge runtime caches during worker activation',
)
assert.match(
  revisionAuthority,
  /Refusing cache cleanup before the current precache is ready/,
  'revision authority must fail closed before deleting stale cache entries',
)
const attestedRevision = revisionAuthority.match(/const sourceRevision = ["']([0-9a-f]{40})["']/)?.[1] || ''
assert.match(attestedRevision, /^[0-9a-f]{40}$/, 'revision authority must attest one exact source revision')
assert.deepEqual(importedScripts, [
  `agentic-graph-service-worker-revision.js?revision=${attestedRevision}`,
  `agentic-graph-chat-stream-sw.js?revision=${attestedRevision}`,
], 'emitted worker must revision-bind both imported worker scripts')
assert.match(
  serviceWorker,
  new RegExp(`assets/${attestedRevision}/`),
  'service-worker precache and attested active revision must share one source namespace',
)
assert.match(
  importedChatWorker,
  /RUNTIME_SCHEMA = ["']agentic-graph-chat-stream-worker\/v2["']/,
  'imported chat worker must expose the lifecycle-clean runtime attestation',
)

process.stdout.write('[agentic-graph] generated PWA keeps HTTP as the sole HTML owner\n')
