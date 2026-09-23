import type { RuntimeCaching } from 'workbox-build'

type LearningOfflineWorker = typeof self & { __agLearningOffline?: { read(request: Request): Promise<Response | null> } }
export const learningOfflineNavigationPlugin = {
  cachedResponseWillBeUsed: async ({ request }: { request: Request }) =>
    await (self as LearningOfflineWorker).__agLearningOffline?.read(request)
      || new Response('This learning version is not installed. Reconnect and install it from the Python pane.', { status: 503 }),
}
export const nonHtmlRuntimeCachePlugin = {
  cachedResponseWillBeUsed: async ({ request, cachedResponse }: { request?: Request; cachedResponse?: Response }) => {
    const admitted = request && await (self as LearningOfflineWorker).__agLearningOffline?.read(request);
    if (admitted) return admitted;
    if (!cachedResponse) return null;
    const mediaType = (cachedResponse.headers.get('content-type') || '')
      .split(';', 1)[0]
      .trim()
      .toLowerCase();
    return mediaType === 'text/html' || mediaType === 'application/xhtml+xml'
      ? null
      : cachedResponse;
  },
  cacheWillUpdate: async ({ response }: { response: Response }) => {
    if (response.status !== 200) return null;
    const mediaType = (response.headers.get('content-type') || '')
      .split(';', 1)[0]
      .trim()
      .toLowerCase();
    return mediaType === 'text/html' || mediaType === 'application/xhtml+xml'
      ? null
      : response;
  },
}

// Keep route ordering and cache policy together; Vite only composes this owner.
export const buildPwaRuntimeCachingRules = (): RuntimeCaching[] => [
  {
    urlPattern: ({ request, url }) => request.mode === 'navigate' && url.origin === self.location.origin
      && url.searchParams.has('python-learning-offline'),
    handler: 'CacheOnly',
    options: { cacheName: 'kg-python-learning-navigation', plugins: [learningOfflineNavigationPlugin] },
  },
  {
    urlPattern: ({ request, url }) =>
      request.method === 'GET'
      && url.origin === self.location.origin
      && /\/xr-v2\/(?:models|wasm)\//u.test(url.pathname),
    handler: 'CacheFirst',
    options: {
      cacheName: 'kg-xr-v2-runtime', plugins: [nonHtmlRuntimeCachePlugin],
      cacheableResponse: { statuses: [200] },
      expiration: { maxEntries: 8, maxAgeSeconds: 60 * 60 * 24 * 30 },
    },
  },
  {
    urlPattern: ({ request }) =>
      request.destination === 'script'
      || request.destination === 'style'
      || request.destination === 'worker',
    handler: 'StaleWhileRevalidate',
    options: {
      cacheName: 'kg-assets', plugins: [nonHtmlRuntimeCachePlugin],
      expiration: { maxEntries: 160, maxAgeSeconds: 60 * 60 * 24 * 14 },
    },
  },
  {
    urlPattern: ({ request }) => request.destination === 'image' || request.destination === 'font',
    handler: 'CacheFirst',
    options: {
      cacheName: 'kg-static', plugins: [nonHtmlRuntimeCachePlugin],
      expiration: { maxEntries: 120, maxAgeSeconds: 60 * 60 * 24 * 30 },
    },
  },
  {
    urlPattern: ({ request, url }) =>
      request.method === 'GET'
      && url.origin === self.location.origin
      && !url.pathname.startsWith('/__')
      && (
        url.pathname.endsWith('.json')
        || url.pathname.endsWith('.jsonld')
        || url.pathname.endsWith('.webmanifest')
      ),
    handler: 'StaleWhileRevalidate',
    options: {
      cacheName: 'kg-data', plugins: [nonHtmlRuntimeCachePlugin],
      expiration: { maxEntries: 80, maxAgeSeconds: 60 * 60 * 24 * 7 },
    },
  },
]
