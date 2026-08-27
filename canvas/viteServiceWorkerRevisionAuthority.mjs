const SOURCE_REVISION_PATTERN = /^[0-9a-f]{40}$/
const AGENTICGRAPH_RUNTIME_CACHE_NAMES = ['kg-assets', 'kg-static', 'kg-data']
export const SERVICE_WORKER_REVISION_ARTIFACT = 'agenticgraph-service-worker-revision.js'
export const SERVICE_WORKER_REVISION_REQUEST = 'AG_SERVICE_WORKER_SOURCE_REVISION_REQUEST'
export const SERVICE_WORKER_REVISION_RESPONSE = 'AG_SERVICE_WORKER_SOURCE_REVISION_RESPONSE'

export const buildServiceWorkerRevisionAuthoritySource = sourceRevision => {
  if (!SOURCE_REVISION_PATTERN.test(sourceRevision)) {
    throw new Error('service-worker revision authority requires an exact source revision')
  }
  return `;(() => {
  const sourceRevision = ${JSON.stringify(sourceRevision)}
  const runtimeCacheNames = new Set(${JSON.stringify(AGENTICGRAPH_RUNTIME_CACHE_NAMES)})
  const isHtmlContentType = contentType =>
    /^(?:text\\/html|application\\/xhtml\\+xml)(?:;|$)/i.test(String(contentType || '').trim())
  const pruneStaleRevisionEntries = async () => {
    const scopeUrl = new URL(self.registration.scope)
    const scopePath = scopeUrl.pathname
    const scopeRoot = scopePath.slice(0, -1)
    const assetRoot = scopePath + 'assets/'
    const expectedAssetPrefix = assetRoot + sourceRevision + '/'
    const staleEntries = []
    let expectedPrecacheReady = false

    for (const cacheName of await caches.keys()) {
      const cache = await caches.open(cacheName)
      const isAgenticGraphOwnedCache = runtimeCacheNames.has(cacheName)
        || (cacheName.startsWith('workbox-precache') && cacheName.includes(scopeUrl.toString()))
      for (const request of await cache.keys()) {
        const requestUrl = new URL(request.url)
        if (requestUrl.origin !== scopeUrl.origin) continue
        const isScopedPath = requestUrl.pathname === scopeRoot
          || requestUrl.pathname.startsWith(scopePath)
        let isHtml = isScopedPath && (
          requestUrl.pathname === scopeRoot
          || requestUrl.pathname === scopePath
          || requestUrl.pathname.endsWith('.html')
        )
        let cachedResponse
        if (!isHtml && (isScopedPath || isAgenticGraphOwnedCache)) {
          cachedResponse = await cache.match(request)
          isHtml = isHtmlContentType(cachedResponse?.headers.get('content-type'))
        }
        if (
          cacheName.startsWith('workbox-precache')
          && requestUrl.pathname.startsWith(expectedAssetPrefix)
          && cachedResponse
          && !isHtml
        ) {
          expectedPrecacheReady = true
        }
        if (
          isHtml
          || (
            requestUrl.pathname.startsWith(assetRoot)
            && !requestUrl.pathname.startsWith(expectedAssetPrefix)
          )
        ) {
          staleEntries.push({ cache, request })
        }
      }
    }

    if (!expectedPrecacheReady) {
      throw new Error('[agenticgraph] Refusing cache cleanup before the current precache is ready.')
    }
    await Promise.all(staleEntries.map(entry => entry.cache.delete(entry.request)))
  }

  self.addEventListener('activate', event => {
    event.waitUntil(pruneStaleRevisionEntries())
  })
  self.addEventListener('message', event => {
    if (event.data?.type !== ${JSON.stringify(SERVICE_WORKER_REVISION_REQUEST)}) return
    const port = event.ports?.[0]
    if (!port) return
    port.postMessage({
      type: ${JSON.stringify(SERVICE_WORKER_REVISION_RESPONSE)},
      sourceRevision,
    })
  })
})()
`
}

export const createServiceWorkerRevisionAuthorityPlugin = sourceRevision => ({
  name: 'agenticgraph-service-worker-revision-authority',
  apply: 'build',
  generateBundle() {
    this.emitFile({
      type: 'asset',
      fileName: SERVICE_WORKER_REVISION_ARTIFACT,
      source: buildServiceWorkerRevisionAuthoritySource(sourceRevision),
    })
  },
})
