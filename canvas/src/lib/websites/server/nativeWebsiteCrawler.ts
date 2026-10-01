import { createHash } from 'node:crypto'
import { resolveCrawlerTarget, type CrawlerResponseMetadata } from './crawlerNetworkPolicy'
export { isPrivateCrawlerAddress } from './crawlerNetworkPolicy'
import fs from 'node:fs/promises'
import path from 'node:path'
import { chromium, type APIResponse, type Browser, type BrowserContext } from 'playwright'
import type { WebsiteImportDownloadArtifact, WebsiteImportRuntime } from './websiteImportTypes'

type ProxyEndpoint = {
  server: string
  username?: string
  password?: string
}

type DownloadReservation = { bytes: number }

type NativeWebsiteCrawlerOptions = {
  concurrency: number
  proxyRotation: boolean
  downloadAssets: boolean
  maxDownloads: number
  maxDownloadBytes: number
  maxDownloadFileBytes?: number
  navigationTimeoutMs?: number
  maxHtmlChars?: number
  allowPrivateNetworks?: boolean
  proxyUrls?: string[]
}

export type NativeWebsiteCapture = {
  finalUrl: string
  title: string
  html: string
  links: string[]
  linksLimited?: boolean
  discoveryResponse?: CrawlerResponseMetadata
  downloads: WebsiteImportDownloadArtifact[]
}

const parseProxyEndpoint = (raw: unknown): ProxyEndpoint | null => {
  try {
    const url = new URL(String(raw || '').trim())
    if (!['http:', 'https:', 'socks4:', 'socks5:'].includes(url.protocol) || !url.hostname) return null
    const hostname = url.hostname.replace(/^\[|\]$/g, '')
    const server = `${url.protocol}//${hostname.includes(':') ? `[${hostname}]` : hostname}${url.port ? `:${url.port}` : ''}`
    const username = url.username ? decodeURIComponent(url.username) : ''
    const password = url.password ? decodeURIComponent(url.password) : ''
    return { server, ...(username ? { username } : {}), ...(password ? { password } : {}) }
  } catch {
    return null
  }
}

export const parseNativeCrawlerProxyEndpoints = (values: readonly unknown[]): ProxyEndpoint[] => {
  const seen = new Set<string>()
  const out: ProxyEndpoint[] = []
  for (const value of values) {
    const endpoint = parseProxyEndpoint(value)
    if (!endpoint) continue
    const identity = `${endpoint.server}\n${endpoint.username || ''}`
    if (seen.has(identity)) continue
    seen.add(identity)
    out.push(endpoint)
  }
  return out
}

const readServerProxyUrls = (): string[] => String(process.env.AGENTIC_OS_CRAWLER_PROXY_URLS || '')
  .split(/[\n,]+/)
  .map(value => value.trim())
  .filter(Boolean)

const sha256 = (value: Buffer): string => createHash('sha256').update(value).digest('hex')

const sanitizeFileName = (value: unknown, fallback = 'download.bin'): string => {
  const base = String(value || '').replace(/\\/g, '/').split('/').filter(Boolean).pop() || fallback
  const cleaned = base
    .normalize('NFKD')
    .replace(/[^A-Za-z0-9._-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^[_\.]+|[_\.]+$/g, '')
    .slice(0, 140)
  return cleaned || fallback
}

const fileNameFromDisposition = (value: string): string => {
  const encoded = /filename\*\s*=\s*UTF-8''([^;]+)/i.exec(value)?.[1]
  if (encoded) {
    try {
      return decodeURIComponent(encoded)
    } catch {
      return encoded
    }
  }
  return /filename\s*=\s*["']?([^;"']+)/i.exec(value)?.[1]?.trim() || ''
}

const fileNameFromUrl = (url: string, contentType: string): string => {
  let name = ''
  try {
    name = decodeURIComponent(new URL(url).pathname.split('/').filter(Boolean).pop() || '')
  } catch {
    void 0
  }
  if (name.includes('.')) return sanitizeFileName(name)
  const mime = contentType.split(';')[0]?.trim().toLowerCase() || ''
  const ext = mime === 'application/pdf'
    ? 'pdf'
    : mime === 'image/jpeg'
      ? 'jpg'
      : mime === 'image/png'
        ? 'png'
        : mime === 'image/webp'
          ? 'webp'
          : mime === 'image/svg+xml'
            ? 'svg'
            : mime.startsWith('text/html')
              ? 'html'
              : 'bin'
  return sanitizeFileName(`${name || 'download'}.${ext}`)
}

const isDownloadCandidate = (candidate: { tag: string; url: string; download: boolean }): boolean => {
  if (candidate.download || ['img', 'source', 'video', 'audio'].includes(candidate.tag)) return true
  try {
    const pathname = new URL(candidate.url).pathname.toLowerCase()
    return /\.(?:pdf|jpe?g|png|gif|webp|svg|avif|bmp|ico|zip|gz|tgz|rar|7z|docx?|xlsx?|pptx?|csv|json|xml|mp3|wav|ogg|m4a|mp4|webm|mov|gltf|glb|ply|spz)$/i.test(pathname)
  } catch {
    return false
  }
}

class NativeDownloadBudget {
  private count = 0
  private bytes = 0
  private tail = Promise.resolve()

  constructor(private readonly maxCount: number, private readonly maxBytes: number) {}

  private async locked<T>(run: () => T): Promise<T> {
    const previous = this.tail
    let release = () => void 0
    this.tail = new Promise<void>(resolve => { release = resolve })
    await previous
    try {
      return run()
    } finally {
      release()
    }
  }

  async reserve(bytes: number): Promise<DownloadReservation | null> {
    return await this.locked(() => {
      if (!Number.isFinite(bytes) || bytes <= 0 || this.count >= this.maxCount || this.bytes + bytes > this.maxBytes) return null
      this.count += 1
      this.bytes += bytes
      return { bytes }
    })
  }

  async finish(reservation: DownloadReservation, actualBytes: number): Promise<boolean> {
    return await this.locked(() => {
      const delta = actualBytes - reservation.bytes
      if (actualBytes <= 0 || this.bytes + delta > this.maxBytes) {
        this.count -= 1
        this.bytes -= reservation.bytes
        return false
      }
      this.bytes += delta
      return true
    })
  }

  async cancel(reservation: DownloadReservation): Promise<void> {
    await this.locked(() => {
      this.count -= 1
      this.bytes -= reservation.bytes
    })
  }
}

export class NativeWebsiteCrawler {
  readonly runtime: WebsiteImportRuntime
  private readonly proxyEndpoints: ProxyEndpoint[]
  private readonly browsers = new Map<number, Promise<Browser>>()
  private readonly budget: NativeDownloadBudget
  private readonly maxDownloadFileBytes: number
  private readonly navigationTimeoutMs: number
  private readonly maxHtmlChars: number
  private readonly allowPrivateNetworks: boolean
  private closed = false

  constructor(private readonly options: NativeWebsiteCrawlerOptions) {
    const supplied = options.proxyUrls || readServerProxyUrls()
    const parsed = options.proxyRotation ? parseNativeCrawlerProxyEndpoints(supplied) : []
    this.proxyEndpoints = parsed.slice(0, Math.max(1, Math.min(8, options.concurrency)))
    this.maxDownloadFileBytes = Math.max(64 * 1024, Math.min(100 * 1024 * 1024, options.maxDownloadFileBytes || 25 * 1024 * 1024))
    this.navigationTimeoutMs = Math.max(3_000, Math.min(120_000, options.navigationTimeoutMs || 30_000))
    this.maxHtmlChars = Math.max(100_000, Math.min(32_000_000, options.maxHtmlChars || 32_000_000))
    this.allowPrivateNetworks = options.allowPrivateNetworks === true || process.env.AGENTIC_OS_CRAWLER_ALLOW_PRIVATE_NETWORKS === '1'
    this.budget = new NativeDownloadBudget(options.maxDownloads, options.maxDownloadBytes)
    this.runtime = {
      engine: 'playwright',
      headless: true,
      proxyMode: this.proxyEndpoints.length > 0 ? 'rotating' : 'direct',
      proxyPoolSize: this.proxyEndpoints.length,
      downloadAssets: options.downloadAssets,
      maxDownloads: options.maxDownloads,
      maxDownloadBytes: options.maxDownloadBytes,
    }
  }

  private async isUrlAllowed(raw: string, signal?: AbortSignal): Promise<boolean> {
    try { await resolveCrawlerTarget(raw, this.allowPrivateNetworks, signal); return true }
    catch { return false }
  }

  private async launchBrowser(poolIndex: number): Promise<Browser> {
    const proxy = this.proxyEndpoints[poolIndex]
    const launchOptions = { headless: true as const, timeout: this.navigationTimeoutMs, ...(proxy ? { proxy } : {}) }
    try {
      return await chromium.launch(launchOptions)
    } catch (firstError) {
      if (this.closed) throw firstError
      try {
        return await chromium.launch({ ...launchOptions, channel: 'chrome' })
      } catch {
        throw firstError
      }
    }
  }

  private async browserFor(sequence: number): Promise<Browser> {
    if (this.closed) throw new Error('Crawler is closed')
    const poolSize = Math.max(1, this.proxyEndpoints.length)
    const index = Math.abs(sequence) % poolSize
    let browser = this.browsers.get(index)
    if (!browser) {
      browser = this.launchBrowser(index)
      this.browsers.set(index, browser)
    }
    const result = await browser
    if (this.closed) { await result.close(); throw new Error('Crawler is closed') }
    return result
  }

  private async configureContext(context: BrowserContext, discovery?: { limited: boolean; requests: number }, signal?: AbortSignal): Promise<void> {
    await context.route('**/*', async route => {
      const url = route.request().url()
      if (signal?.aborted) { await route.abort('aborted'); return }
      if (discovery) {
        if (['image', 'media', 'font'].includes(route.request().resourceType())) { await route.abort('blockedbyclient'); return }
        if (++discovery.requests > 128) { discovery.limited = true; await route.abort('blockedbyclient'); return }
      }
      if (/^(?:data|blob|about):/i.test(url) || await this.isUrlAllowed(url, signal)) await route.continue()
      else await route.abort('blockedbyclient')
    })
  }

  private async requestWithSafeRedirects(args: {
    context: BrowserContext
    url: string
    method: 'head' | 'get'
  }): Promise<{ response: APIResponse; finalUrl: string } | null> {
    let currentUrl = args.url
    for (let redirect = 0; redirect <= 5; redirect += 1) {
      if (!await this.isUrlAllowed(currentUrl)) return null
      const requestOptions = { timeout: this.navigationTimeoutMs, failOnStatusCode: false, maxRedirects: 0 }
      const response = args.method === 'head'
        ? await args.context.request.head(currentUrl, requestOptions)
        : await args.context.request.get(currentUrl, requestOptions)
      const location = response.headers().location
      if (response.status() < 300 || response.status() >= 400 || !location) return { response, finalUrl: currentUrl }
      await response.dispose().catch(() => void 0)
      try {
        currentUrl = new URL(location, currentUrl).toString()
      } catch {
        return null
      }
    }
    return null
  }

  private async persistDownload(args: {
    context: BrowserContext
    url: string
    nodeDirAbs: string
  }): Promise<WebsiteImportDownloadArtifact | null> {
    const fetched = await this.requestWithSafeRedirects({ context: args.context, url: args.url, method: 'get' })
    if (!fetched) return null
    const { response, finalUrl } = fetched
    if (!response.ok()) return null
    const headers = response.headers()
    const declaredBytes = Number(headers['content-length'] || '')
    if (!Number.isFinite(declaredBytes) || declaredBytes <= 0 || declaredBytes > this.maxDownloadFileBytes) return null
    const reservation = await this.budget.reserve(declaredBytes)
    if (!reservation) return null
    let reservationSettled = false
    try {
      const body = await response.body()
      if (body.byteLength > this.maxDownloadFileBytes) return null
      const withinBudget = await this.budget.finish(reservation, body.byteLength)
      reservationSettled = true
      if (!withinBudget) return null
      const mimeType = String(headers['content-type'] || 'application/octet-stream').split(';')[0]?.trim() || 'application/octet-stream'
      const suggested = fileNameFromDisposition(String(headers['content-disposition'] || '')) || fileNameFromUrl(finalUrl, mimeType)
      const fileName = sanitizeFileName(suggested)
      const id = createHash('sha256').update(finalUrl).digest('hex').slice(0, 20)
      const storedFileName = `${id}-${fileName}`
      const downloadDir = path.join(args.nodeDirAbs, 'downloads')
      await fs.mkdir(downloadDir, { recursive: true })
      await fs.writeFile(path.join(downloadDir, storedFileName), body)
      return { id, url: finalUrl, fileName, storedFileName, mimeType, bytes: body.byteLength, sha256: sha256(body) }
    } finally {
      if (!reservationSettled) await this.budget.cancel(reservation)
    }
  }

  async capture(args: { url: string; nodeDirAbs: string; sequence: number; discoveryOnly?: boolean; signal?: AbortSignal; onTransferBytes?: (bytes: number) => void }): Promise<NativeWebsiteCapture> {
    args.signal?.throwIfAborted()
    if (!await this.isUrlAllowed(args.url, args.signal)) throw new Error('Crawler target is not a public HTTP(S) URL')
    const browser = await this.browserFor(args.sequence)
    args.signal?.throwIfAborted()
    const context = await browser.newContext({ acceptDownloads: true, serviceWorkers: 'block' })
    const cancel = () => { void context.close().catch(() => void 0) }
    args.signal?.addEventListener('abort', cancel, { once: true })
    const discovery = args.discoveryOnly ? { limited: false, requests: 0 } : undefined
    let resourceError: Error | undefined
    try {
      args.signal?.throwIfAborted()
      await this.configureContext(context, discovery, args.signal)
      const page = await context.newPage()
      page.setDefaultNavigationTimeout(this.navigationTimeoutMs)
      if (args.discoveryOnly) {
        const session = await context.newCDPSession(page)
        let totalBytes = 0, decodedBytes = 0
        const exhaust = () => { resourceError = new Error('Website discovery exceeded its 32 MiB browser response budget'); cancel() }
        const transferred = new Map<string, number>()
        const record = (requestId: string, bytes: number, complete = false) => {
          const previous = transferred.get(requestId) || 0
          const delta = Math.max(0, complete ? bytes - previous : bytes)
          if (complete) transferred.delete(requestId); else transferred.set(requestId, previous + delta)
          totalBytes += delta; args.onTransferBytes?.(delta)
          if (totalBytes > 32 * 1024 * 1024) exhaust()
        }
        session.on('Network.responseReceived', event => {
          const length = Object.entries(event.response.headers).find(([name]) => name.toLowerCase() === 'content-length')?.[1]
          if (Number(length) > 32 * 1024 * 1024) exhaust()
        })
        session.on('Network.dataReceived', event => {
          decodedBytes += event.dataLength
          record(event.requestId, event.encodedDataLength)
          if (decodedBytes > 32 * 1024 * 1024) exhaust()
        })
        session.on('Network.loadingFinished', event => record(event.requestId, event.encodedDataLength, true))
        session.on('Network.loadingFailed', event => transferred.delete(event.requestId))
        await session.send('Network.enable')
      }
      const head = args.discoveryOnly ? null : await this.requestWithSafeRedirects({ context, url: args.url, method: 'head' }).catch(() => null)
      const headType = String(head?.response.headers()['content-type'] || '').toLowerCase()
      const headDisposition = String(head?.response.headers()['content-disposition'] || '').toLowerCase()
      const isDirectDownload = Boolean(head?.response.ok() && ((headType && !headType.includes('text/html') && !headType.includes('application/xhtml')) || headDisposition.includes('attachment')))
      if (head) await head.response.dispose().catch(() => void 0)
      if (isDirectDownload) {
        if (args.discoveryOnly) return { finalUrl: head?.finalUrl || args.url, title: '', html: '', links: [], downloads: [] }
        const artifact = await this.persistDownload({ context, url: head?.finalUrl || args.url, nodeDirAbs: args.nodeDirAbs })
        if (!artifact) throw new Error('Download was rejected by crawler size or safety limits')
        return { finalUrl: artifact.url, title: artifact.fileName, html: '', links: [], downloads: [artifact] }
      }
      const navigation = await page.goto(args.url, { waitUntil: 'domcontentloaded', timeout: this.navigationTimeoutMs })
        .then(response => ({ kind: 'page' as const, response }))
        .catch(async error => {
          if (args.discoveryOnly || !/download is starting/i.test(String(error))) throw error
          const artifact = await this.persistDownload({ context, url: args.url, nodeDirAbs: args.nodeDirAbs })
          if (!artifact) throw error
          return { kind: 'download' as const, artifact }
        })
      if (navigation.kind === 'download') {
        return { finalUrl: navigation.artifact.url, title: navigation.artifact.fileName, html: '', links: [], downloads: [navigation.artifact] }
      }
      const response = navigation.response
      if (!response || !response.ok()) throw new Error(`HTTP ${response?.status() || 0}`)
      await page.waitForLoadState('networkidle', { timeout: Math.min(5_000, this.navigationTimeoutMs) }).catch(() => void 0)
      for (let index = 0; index < 4; index += 1) {
        await page.evaluate(() => window.scrollBy(0, Math.max(480, window.innerHeight * 0.8))).catch(() => void 0)
        await page.waitForTimeout(80)
      }
      const finalUrl = page.url() || args.url
      if (!await this.isUrlAllowed(finalUrl, args.signal)) throw new Error('Crawler redirect target is not allowed')
      const contentType = String(response.headers()['content-type'] || '').toLowerCase()
      const title = String(await page.title().catch(() => '')).trim()
      // Read explicit navigation targets, including scripted cards exposing a URL.
      // Do not serialize large application state or infer routes from titles/slugs.
      const discovered = await page.evaluate(() => {
        const links = new Set<string>()
        let scanned = 0, limited = false
        for (const element of document.querySelectorAll('a[href],area[href],[data-href],[data-url],[to],[url],[title]')) {
          if (++scanned > 20_000) { limited = true; break }
          for (const attribute of ['href', 'data-href', 'data-url', 'to', 'url', 'title']) {
            const raw = element.getAttribute(attribute)?.trim()
            if (!raw || raw.length > 4096 || raw.startsWith('#') || (attribute === 'title' && !/^https?:\/\//i.test(raw))) continue
            try {
              const url = new URL(raw, document.baseURI)
              if (!['http:', 'https:'].includes(url.protocol)) continue
              url.hash = ''
              links.add(url.href)
              if (links.size > 2_000) { limited = true; break }
            } catch { /* Ignore labels that are not URLs. */ }
          }
          if (limited) break
        }
        return { links: [...links].slice(0, 2_000), limited }
      })
      const links = discovered.links
      const downloads: WebsiteImportDownloadArtifact[] = []

      if (args.discoveryOnly) {
        args.signal?.throwIfAborted()
        const headers = await response.allHeaders()
        return { finalUrl, title, html: '', links, linksLimited: discovered.limited || discovery?.limited, downloads: [],
          discoveryResponse: { status: response.status(), cacheControl: headers['cache-control'], vary: headers.vary,
            expires: headers.expires, date: headers.date,
            age: headers.age, hasCookies: Boolean(headers['set-cookie']) || (await context.cookies()).length > 0,
            redirected: finalUrl !== args.url } }
      }

      if (!contentType.includes('text/html') && !contentType.includes('application/xhtml')) {
        const artifact = await this.persistDownload({ context, url: finalUrl, nodeDirAbs: args.nodeDirAbs })
        if (artifact) downloads.push(artifact)
        return { finalUrl, title, html: '', links, downloads }
      }

      const htmlRaw = await page.content()
      // Cutting HTML can end inside an attribute or script and silently discard
      // the rendered body. An incomplete capture must never become an ok import.
      if (htmlRaw.length > this.maxHtmlChars) throw new Error(`Captured HTML exceeds the ${this.maxHtmlChars}-character limit`)
      const html = htmlRaw
      if (this.options.downloadAssets) {
        const candidates = await page.locator('a[href],img[src],source[src],video[src],audio[src]').evaluateAll(elements => elements.map(element => {
          const tag = element.tagName.toLowerCase()
          const raw = tag === 'a' ? (element as HTMLAnchorElement).href : (element as HTMLImageElement).src
          return { tag, url: raw, download: tag === 'a' && element.hasAttribute('download') }
        }).filter(candidate => candidate.url).slice(0, 300)).catch(() => [] as Array<{ tag: string; url: string; download: boolean }>)
        const seen = new Set<string>()
        for (const candidate of candidates) {
          if (!isDownloadCandidate(candidate) || seen.has(candidate.url)) continue
          seen.add(candidate.url)
          const artifact = await this.persistDownload({ context, url: candidate.url, nodeDirAbs: args.nodeDirAbs }).catch(() => null)
          if (artifact) downloads.push(artifact)
          if (downloads.length >= 24) break
        }
      }
      return { finalUrl, title, html, links, downloads }
    } catch (error) {
      args.signal?.throwIfAborted()
      throw resourceError || error
    } finally {
      args.signal?.removeEventListener('abort', cancel)
      await context.close().catch(() => void 0)
    }
  }

  async close(): Promise<void> {
    this.closed = true
    const browsers = await Promise.allSettled(this.browsers.values())
    await Promise.all(browsers.map(result => result.status === 'fulfilled' ? result.value.close().catch(() => void 0) : Promise.resolve()))
    this.browsers.clear()
  }
}
