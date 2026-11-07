import { fetchCrawlerTextWithLimit, type CrawlerTextOptions, type CrawlerTextResult, type CrawlerResponseMetadata } from './crawlerNetworkPolicy'
import type { NativeWebsiteCapture } from './nativeWebsiteCrawler'

export type WebsiteDiscoveryMetrics = {
  elapsedMs: number; metadataTransferBytes: number; browserTransferBytes: number
  cacheHits: number; revalidated: number; metadataRequests: number; browserLaunches: number
  renderedCacheAgeMs: number | null
}
export const newDiscoveryMetrics = (): WebsiteDiscoveryMetrics => ({ elapsedMs: 0, metadataTransferBytes: 0,
  browserTransferBytes: 0, cacheHits: 0, revalidated: 0, metadataRequests: 0, browserLaunches: 0, renderedCacheAgeMs: null })

type CacheEntry = {
  bytes: number; storedAt: number; freshUntil: number; retainUntil: number
} & ({ kind: 'text'; text: string; response: CrawlerResponseMetadata } | { kind: 'render'; capture: NativeWebsiteCapture })

function freshness(response: CrawlerResponseMetadata, ceilingMs: number): number | null {
  if (response.hasCookies || response.redirected || /(?:^|,)\s*(?:no-store|private)(?:\s|,|=|$)/i.test(response.cacheControl || '')
    || (response.vary && response.vary.split(',').some(value => !['accept', 'accept-encoding'].includes(value.trim().toLowerCase())))) return null
  if (/(?:^|,)\s*no-cache(?:\s|,|=|$)/i.test(response.cacheControl || '')) return 0
  const maxAge = /(?:^|,)\s*max-age\s*=\s*"?(\d+)/i.exec(response.cacheControl || '')
  const expiresIn = Date.parse(response.expires || '') - (Date.parse(response.date || '') || Date.now())
  const lifetime = maxAge ? Number(maxAge[1]) * 1000 : Number.isFinite(expiresIn) ? expiresIn : ceilingMs
  return Math.max(0, Math.min(ceilingMs, lifetime) - Math.max(0, Number(response.age) || 0) * 1000)
}

/** Process-local public discovery cache. One memory/entry bound covers text and rendered links. */
export class WebsiteDiscoveryCache {
  private readonly entries = new Map<string, CacheEntry>()
  private bytes = 0
  constructor(private readonly now = Date.now, private readonly maxBytes = 8 * 1024 * 1024, private readonly maxEntries = 128) {}

  private key(kind: string, url: string): string {
    return `${process.env.AGENTIC_OS_CRAWLER_ALLOW_PRIVATE_NETWORKS === '1' ? 'private-dev' : 'public'}:${kind}:${url}`
  }
  private remove(key: string): void {
    const entry = this.entries.get(key)
    if (entry) this.bytes -= entry.bytes
    this.entries.delete(key)
  }
  private get(key: string): CacheEntry | undefined {
    const entry = this.entries.get(key)
    if (!entry) return
    if (entry.retainUntil <= this.now()) { this.remove(key); return }
    this.entries.delete(key); this.entries.set(key, entry)
    return entry
  }
  private put(key: string, entry: CacheEntry): void {
    this.remove(key)
    if (entry.bytes > this.maxBytes) return
    for (const [oldKey, old] of this.entries) if (old.retainUntil <= this.now()) this.remove(oldKey)
    while (this.entries.size && (this.bytes + entry.bytes > this.maxBytes || this.entries.size >= this.maxEntries)) {
      this.remove(this.entries.keys().next().value!)
    }
    this.entries.set(key, entry); this.bytes += entry.bytes
  }
  get usage(): { bytes: number; entries: number } { return { bytes: this.bytes, entries: this.entries.size } }

  getRendered(url: string): { capture: NativeWebsiteCapture; ageMs: number } | undefined {
    const entry = this.get(this.key('render', url))
    if (entry?.kind !== 'render' || entry.freshUntil <= this.now()) return
    return { capture: structuredClone(entry.capture), ageMs: Math.max(0, this.now() - entry.storedAt) }
  }
  setRendered(url: string, capture: NativeWebsiteCapture): void {
    const key = this.key('render', url)
    this.remove(key)
    if (capture.linksLimited || !capture.discoveryResponse) return
    const ttl = freshness(capture.discoveryResponse, 60_000)
    if (!ttl) return
    const storedAt = this.now()
    // The discovery caller never stores HTML or download bodies here.
    const value = { ...capture, html: '', downloads: [] }
    this.put(key, { kind: 'render', capture: structuredClone(value), bytes: 2 * (JSON.stringify(value).length + key.length),
      storedAt, freshUntil: storedAt + ttl, retainUntil: storedAt + ttl })
  }

  async read(url: string, options: CrawlerTextOptions, metrics: WebsiteDiscoveryMetrics): Promise<CrawlerTextResult> {
    options.signal?.throwIfAborted()
    const key = this.key('text', `${url}\n${options.accept || '*/*'}`)
    const cached = this.get(key)
    const previous = cached?.kind === 'text' ? cached : undefined
    if (previous && Buffer.byteLength(previous.text) > options.maxBytes) return { ok: false, error: 'Upstream response too large' }
    if (previous && previous.freshUntil > this.now()) {
      metrics.cacheHits += 1
      options.onBytes?.(Buffer.byteLength(previous.text))
      return { ok: true, text: previous.text }
    }
    let workBytes = 0
    metrics.metadataRequests += 1
    const result = await fetchCrawlerTextWithLimit(url, { ...options,
      cache: previous ? { etag: previous.response.etag, lastModified: previous.response.lastModified } : {},
      onBytes: bytes => { workBytes = bytes },
      onTransferBytes: bytes => { metrics.metadataTransferBytes += bytes; options.onTransferBytes?.(bytes) },
    })
    options.signal?.throwIfAborted()
    if (!result.ok || !result.response) { options.onBytes?.(workBytes); return result }
    const unchanged = result.response.status === 304 && previous
    const text = unchanged ? previous.text : result.text
    options.onBytes?.(Math.max(workBytes, Buffer.byteLength(text)))
    if (unchanged) { metrics.cacheHits += 1; metrics.revalidated += 1 }
    const response = { ...result.response }
    if (unchanged) {
      response.etag ??= previous.response.etag
      response.lastModified ??= previous.response.lastModified
      response.cacheControl ??= previous.response.cacheControl
      response.vary ??= previous.response.vary
      response.expires ??= previous.response.expires
    }
    this.remove(key)
    const ttl = freshness(response, 30_000)
    if (ttl !== null) {
      const storedAt = this.now()
      this.put(key, { kind: 'text', text, response, storedAt, freshUntil: storedAt + ttl,
        retainUntil: storedAt + 24 * 60 * 60_000, bytes: 2 * (text.length + key.length + JSON.stringify(response).length) })
    }
    return { ok: true, text }
  }
}
