import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

export function testViteConfigRoutesChatAssetProxyThroughSharedRemoteFetchHandler() {
  const vitePath = resolve(process.cwd(), 'vite.config.ts')
  const text = readFileSync(vitePath, 'utf8')
  if (!text.includes("const CHAT_BINARY_DOWNLOAD_PROXY_PREFIX = '/__chat_asset_proxy'")) {
    throw new Error('expected vite config to define a shared chat asset proxy prefix')
  }
  if (!text.includes("req.url?.startsWith(CHAT_BINARY_DOWNLOAD_PROXY_PREFIX)")) {
    throw new Error('expected vite config to route the chat asset proxy through the shared remote fetch middleware')
  }
  if (!text.includes('createRemoteFetchHandler({ repoRoot, injectWebpageProxyHtml })(req, res, next)')) {
    throw new Error('expected vite config to reuse the existing upstream remote fetch handler for chat asset proxy requests')
  }
}
