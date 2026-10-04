/// <reference lib="webworker" />
import { clientsClaim } from 'workbox-core'
import { addPlugins, cleanupOutdatedCaches, precacheAndRoute, type PrecacheEntry } from 'workbox-precaching'
import { registerRoute } from 'workbox-routing'
import { CacheFirst, CacheOnly, StaleWhileRevalidate } from 'workbox-strategies'
import { CacheableResponsePlugin } from 'workbox-cacheable-response'
import { ExpirationPlugin } from 'workbox-expiration'
import { buildPwaRuntimeCachingRules } from './vitePwaRuntimeCachePolicy'

declare const __AGENTIC_OS_SOURCE_REVISION__: string
declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: (PrecacheEntry | string)[]
  __agLearningOffline?: { read(request: Request): Promise<Response | null> }
}

importScripts(
  `agentic-graph-service-worker-revision.js?revision=${__AGENTIC_OS_SOURCE_REVISION__}`,
  `agentic-graph-chat-stream-sw.js?revision=${__AGENTIC_OS_SOURCE_REVISION__}`,
)
self.skipWaiting()
clientsClaim()

// Workbox may pass a revisioned cache key as `request`. Pack admission needs the
// original fetch request. Install events must populate Workbox's own precache.
addPlugins([{
  async cachedResponseWillBeUsed({ event, cachedResponse }) {
    if (event?.type !== 'fetch' || !('request' in event)) return cachedResponse
    return await self.__agLearningOffline?.read(event.request as Request) ?? cachedResponse
  },
}])
precacheAndRoute(self.__WB_MANIFEST)
cleanupOutdatedCaches()

// Preserve the canonical policy's route/plugin ordering. Fail on an unsupported
// policy option instead of silently dropping a future cache constraint.
const strategies = { CacheFirst, CacheOnly, StaleWhileRevalidate }
for (const { urlPattern, handler, method, options = {} } of buildPwaRuntimeCachingRules()) {
  const Strategy = typeof handler === 'string' && strategies[handler]
  if (!Strategy) throw new Error(`Unsupported runtime cache strategy: ${handler}`)
  const plugins = []
  const strategyOptions = {}
  for (const [key, value] of Object.entries(options)) {
    if (key === 'plugins') plugins.push(...options.plugins)
    else if (key === 'cacheableResponse') plugins.push(new CacheableResponsePlugin(options.cacheableResponse))
    else if (key === 'expiration') plugins.push(new ExpirationPlugin(options.expiration))
    else if (['cacheName', 'fetchOptions', 'matchOptions'].includes(key)) strategyOptions[key] = value
    else throw new Error(`Unsupported runtime cache option: ${key}`)
  }
  registerRoute(urlPattern, new Strategy({ ...strategyOptions, plugins }), method)
}
