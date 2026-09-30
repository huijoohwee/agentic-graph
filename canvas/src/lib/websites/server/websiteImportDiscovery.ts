import type { IncomingMessage, ServerResponse } from 'node:http'
import { NativeWebsiteCrawler } from './nativeWebsiteCrawler'
import { isCrawlableInternalUrl, normalizeUrl, urlToTreePath } from './websiteImportCore'

export const WEBSITE_SELECTION_LIMIT = 500
const WEBSITE_DISCOVERY_LIMIT = 2_000

export function validateSelectedWebsiteUrls(rootUrl: string, value: unknown): string[] | undefined {
  if (value === undefined) return undefined
  if (!Array.isArray(value) || !value.length || value.length > WEBSITE_SELECTION_LIMIT) {
    throw new Error(`Select between 1 and ${WEBSITE_SELECTION_LIMIT} pages`)
  }
  const selected = new Set<string>()
  for (const raw of value) {
    const url = typeof raw === 'string' && raw.length <= 4096 ? normalizeUrl(raw) : null
    if (!url || new URL(url).origin !== new URL(rootUrl).origin || new URL(url).username || new URL(url).password || !isCrawlableInternalUrl(url, rootUrl)) {
      throw new Error('Selected pages must belong to the source website and path')
    }
    selected.add(url)
  }
  return [...selected]
}

export async function readWebsiteImportRequest(req: IncomingMessage): Promise<{ url?: unknown; rootUrl?: unknown; options?: unknown }> {
  const origin = req.headers.origin
  if (origin && new URL(origin).host !== req.headers.host) throw new Error('Cross-origin website import request rejected')
  let size = 0
  const chunks: Buffer[] = []
  for await (const chunk of req) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    size += bytes.length
    if (size > 256 * 1024) throw new Error('Website import request is too large')
    chunks.push(bytes)
  }
  const value = JSON.parse(Buffer.concat(chunks).toString('utf8'))
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid website import request')
  return value
}

export async function handleWebsiteDiscovery(req: IncomingMessage, res: ServerResponse): Promise<void> {
  let crawler: NativeWebsiteCrawler | undefined
  let abort: (() => void) | undefined
  try {
    const body = await readWebsiteImportRequest(req)
    const rootUrl = typeof body.rootUrl === 'string' ? normalizeUrl(body.rootUrl) : null
    const url = typeof body.url === 'string' ? normalizeUrl(body.url) : null
    if (!rootUrl || !url) throw new Error('A public HTTP(S) source URL is required')
    validateSelectedWebsiteUrls(rootUrl, [url])
    crawler = new NativeWebsiteCrawler({ concurrency: 1, proxyRotation: false, downloadAssets: false, maxDownloads: 0, maxDownloadBytes: 0 })
    const activeCrawler = crawler
    abort = () => { if (!res.writableEnded) void activeCrawler.close() }
    res.once('close', abort)
    // Discovery never serializes the HTML, converts text, downloads assets, or writes files.
    const capture = await crawler.capture({ url, nodeDirAbs: '', sequence: 0, discoveryOnly: true })
    validateSelectedWebsiteUrls(rootUrl, [capture.finalUrl])
    const urls = new Set<string>([url])
    for (const link of capture.links) {
      const normalized = normalizeUrl(link)
      if (normalized && normalized.length <= 4096 && isCrawlableInternalUrl(normalized, rootUrl) && new URL(normalized).origin === new URL(rootUrl).origin && !new URL(normalized).username && !new URL(normalized).password) urls.add(normalized)
    }
    const pages = [...urls].slice(0, WEBSITE_DISCOVERY_LIMIT).map(pageUrl => ({ url: pageUrl, path: urlToTreePath(pageUrl), ...(pageUrl === url ? { title: capture.title } : {}) }))
    res.setHeader('Content-Type', 'application/json')
    res.setHeader('Cache-Control', 'no-store')
    res.end(JSON.stringify({ ok: true, rootUrl, pages, limited: capture.linksLimited === true || urls.size > WEBSITE_DISCOVERY_LIMIT, limit: WEBSITE_DISCOVERY_LIMIT }))
  } catch (error) {
    if (!res.destroyed) {
      res.statusCode = 400
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ ok: false, error: String((error as Error).message || error) }))
    }
  } finally {
    if (abort) res.off('close', abort)
    await crawler?.close()
  }
}
