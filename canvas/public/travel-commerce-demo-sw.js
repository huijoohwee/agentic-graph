const CACHE_NAME = 'agentic-graph-travel-commerce-demo-v2'
const DEMO_PATH = '/__demo__/travel-commerce'
const OFFLINE_SHELL_PATH = '/travel-commerce-demo-offline.html'

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll([DEMO_PATH, OFFLINE_SHELL_PATH]))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', event => {
  event.waitUntil(Promise.all([
    self.clients.claim(),
    caches.keys().then(names => Promise.all(names
      .filter(name => name.startsWith('agentic-graph-travel-commerce-demo-') && name !== CACHE_NAME)
      .map(name => caches.delete(name)))),
  ]))
})

self.addEventListener('message', event => {
  if (event.data?.type !== 'warm' || !Array.isArray(event.data.urls)) return
  const warming = caches.open(CACHE_NAME).then(cache => Promise.all(
    event.data.urls.map(url => cache.add(url).catch(() => undefined)),
  ))
  event.waitUntil(warming.then(
    () => event.ports[0]?.postMessage({ ok: true }),
    () => event.ports[0]?.postMessage({ ok: false }),
  ))
})

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET' || new URL(event.request.url).origin !== self.location.origin) return
  event.respondWith(fetch(event.request).then(response => {
    if (response.ok) {
      const copy = response.clone()
      event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy)))
    }
    return response
  }).catch(async () => {
    const cache = await caches.open(CACHE_NAME)
    return (await cache.match(event.request))
      ?? (event.request.mode === 'navigate' ? await cache.match(OFFLINE_SHELL_PATH) : undefined)
      ?? Response.error()
  }))
})
