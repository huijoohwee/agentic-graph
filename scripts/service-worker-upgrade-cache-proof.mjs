export const seedStaleRuntimeCacheProof = async (page, previousRevision) => page.evaluate(
  async ({ revision }) => {
    const assetPath = `/knowgrph/assets/${revision}/service-worker-upgrade-stale-runtime-proof.js`
    const assetCacheHtmlPaths = [
      `/knowgrph?kgSwUpgradeStaleHtmlProof=${revision}`,
      `/knowgrph/deep-link?kgSwUpgradeStaleHtmlProof=${revision}`,
    ]
    const staticCacheHtmlPaths = [
      `/favicon.ico?kgSwUpgradeStaleHtmlProof=${revision}`,
    ]
    const siblingCacheName = 'singabldr-pwa:static:20260504-2'
    const siblingHtmlPaths = ['/singabldr/', '/singabldr/index.html']
    const assetCache = await caches.open('kg-assets')
    const staticCache = await caches.open('kg-static')
    const siblingCache = await caches.open(siblingCacheName)
    const htmlResponse = () => new Response(
      '<!doctype html><title>stale service worker proof</title>',
      { headers: { 'Content-Type': 'text/html; charset=utf-8' } },
    )
    await assetCache.put(
      new Request(assetPath),
      new Response('export const staleRuntimeProof = true', {
        headers: { 'Content-Type': 'text/javascript' },
      }),
    )
    for (const htmlPath of assetCacheHtmlPaths) {
      await assetCache.put(new Request(htmlPath), htmlResponse())
    }
    for (const htmlPath of staticCacheHtmlPaths) {
      await staticCache.put(new Request(htmlPath), htmlResponse())
    }
    for (const htmlPath of siblingHtmlPaths) {
      await siblingCache.put(new Request(htmlPath), htmlResponse())
    }
    if (
      !await assetCache.match(assetPath)
      || !(await Promise.all(assetCacheHtmlPaths.map(htmlPath => assetCache.match(htmlPath)))).every(Boolean)
      || !(await Promise.all(staticCacheHtmlPaths.map(htmlPath => staticCache.match(htmlPath)))).every(Boolean)
      || !(await Promise.all(siblingHtmlPaths.map(htmlPath => siblingCache.match(htmlPath)))).every(Boolean)
    ) {
      throw new Error('failed to seed stale CacheStorage proof entries')
    }
    return {
      assetPath,
      htmlPaths: [...assetCacheHtmlPaths, ...staticCacheHtmlPaths],
      siblingCacheName,
      siblingHtmlPaths,
    }
  },
  { revision: previousRevision },
)
