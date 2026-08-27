import { createHash } from 'node:crypto'
import { lookup } from 'node:dns/promises'
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
  downloads: WebsiteImportDownloadArtifact[]
}

const PRIVATE_IPV4_PATTERNS = [
  /^0\./,
  /^10\./,
  /^127\./,
  /^169\.254\./,
  /^192\.168\./,
]

const isPrivateIpv4 = (value: string): boolean => {
  if (PRIVATE_IPV4_PATTERNS.some(pattern => pattern.test(value))) return true
  const octets = value.split('.').map(Number)
  if (octets.length !== 4 || octets.some(octet => !Number.isInteger(octet) || octet < 0 || octet > 255)) return false
  const [a = 0, b = 0, c = 0] = octets
  return (
    (a === 100 && b >= 64 && b <= 127)
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 0 && (c === 0 || c === 2))
    || (a === 198 && (b === 18 || b === 19))
    || (a === 198 && b === 51 && c === 100)
    || (a === 203 && b === 0 && c === 113)
    || a >= 224
  )
}

export const isPrivateCrawlerAddress = (value: unknown): boolean => {
  const address = String(value || '').trim().toLowerCase().replace(/^\[|\]$/g, '')
  if (!address) return true
  const firstIpv6Group = Number.parseInt(address.split(':')[0] || '0', 16)
  if (address === '::1' || address === '::' || (firstIpv6Group & 0xfe00) === 0xfc00 || (firstIpv6Group & 0xffc0) === 0xfe80 || address.startsWith('2001:db8:')) return true
  const mapped = address.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)?.[1]
  if (mapped) return isPrivateIpv4(mapped)
  return isPrivateIpv4(address)
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

const readServerProxyUrls = (): string[] => String(process.env.AGENTICGRAPH_CRAWLER_PROXY_URLS || '')
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
  private readonly hostSafety = new Map<string, Promise<boolean>>()
  private readonly budget: NativeDownloadBudget
  private readonly maxDownloadFileBytes: number
  private readonly navigationTimeoutMs: number
  private readonly maxHtmlChars: number
  private readonly allowPrivateNetworks: boolean

  constructor(private readonly options: NativeWebsiteCrawlerOptions) {
    const supplied = options.proxyUrls || readServerProxyUrls()
    const parsed = options.proxyRotation ? parseNativeCrawlerProxyEndpoints(supplied) : []
    this.proxyEndpoints = parsed.slice(0, Math.max(1, Math.min(8, options.concurrency)))
    this.maxDownloadFileBytes = Math.max(64 * 1024, Math.min(100 * 1024 * 1024, options.maxDownloadFileBytes || 25 * 1024 * 1024))
    this.navigationTimeoutMs = Math.max(3_000, Math.min(120_000, options.navigationTimeoutMs || 30_000))
    this.maxHtmlChars = Math.max(100_000, Math.min(32_000_000, options.maxHtmlChars || 12_000_000))
    this.allowPrivateNetworks = options.allowPrivateNetworks === true || process.env.AGENTICGRAPH_CRAWLER_ALLOW_PRIVATE_NETWORKS === '1'
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

  private async isUrlAllowed(raw: string): Promise<boolean> {
    let url: URL
    try {
      url = new URL(raw)
    } catch {
      return false
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return false
    if (url.username || url.password) return false
    if (this.allowPrivateNetworks) return true
    const host = url.hostname.toLowerCase()
    if (host === 'localhost' || host.endsWith('.localhost') || isPrivateCrawlerAddress(host)) return false
    let verdict = this.hostSafety.get(host)
    if (!verdict) {
      verdict = lookup(host, { all: true }).then(rows => rows.length > 0 && rows.every(row => !isPrivateCrawlerAddress(row.address))).catch(() => false)
      this.hostSafety.set(host, verdict)
      if (this.hostSafety.size > 256) this.hostSafety.delete(this.hostSafety.keys().next().value || '')
    }
    return await verdict
  }

  private async launchBrowser(poolIndex: number): Promise<Browser> {
    const proxy = this.proxyEndpoints[poolIndex]
    const launchOptions = { headless: true as const, ...(proxy ? { proxy } : {}) }
    try {
      return await chromium.launch(launchOptions)
    } catch (firstError) {
      try {
        return await chromium.launch({ ...launchOptions, channel: 'chrome' })
      } catch {
        throw firstError
      }
    }
  }

  private async browserFor(sequence: number): Promise<Browser> {
    const poolSize = Math.max(1, this.proxyEndpoints.length)
    const index = Math.abs(sequence) % poolSize
    let browser = this.browsers.get(index)
    if (!browser) {
      browser = this.launchBrowser(index)
      this.browsers.set(index, browser)
    }
    return await browser
  }

  private async configureContext(context: BrowserContext): Promise<void> {
    await context.route('**/*', async route => {
      const url = route.request().url()
      if (/^(?:data|blob|about):/i.test(url) || await this.isUrlAllowed(url)) await route.continue()
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

  async capture(args: { url: string; nodeDirAbs: string; sequence: number }): Promise<NativeWebsiteCapture> {
    if (!await this.isUrlAllowed(args.url)) throw new Error('Crawler target is not a public HTTP(S) URL')
    const browser = await this.browserFor(args.sequence)
    const context = await browser.newContext({ acceptDownloads: true, serviceWorkers: 'block' })
    await this.configureContext(context)
    const page = await context.newPage()
    page.setDefaultNavigationTimeout(this.navigationTimeoutMs)
    try {
      const head = await this.requestWithSafeRedirects({ context, url: args.url, method: 'head' }).catch(() => null)
      const headType = String(head?.response.headers()['content-type'] || '').toLowerCase()
      const headDisposition = String(head?.response.headers()['content-disposition'] || '').toLowerCase()
      const isDirectDownload = Boolean(head?.response.ok() && ((headType && !headType.includes('text/html') && !headType.includes('application/xhtml')) || headDisposition.includes('attachment')))
      if (head) await head.response.dispose().catch(() => void 0)
      if (isDirectDownload) {
        const artifact = await this.persistDownload({ context, url: head?.finalUrl || args.url, nodeDirAbs: args.nodeDirAbs })
        if (!artifact) throw new Error('Download was rejected by crawler size or safety limits')
        return { finalUrl: artifact.url, title: artifact.fileName, html: '', links: [], downloads: [artifact] }
      }
      const navigation = await page.goto(args.url, { waitUntil: 'domcontentloaded', timeout: this.navigationTimeoutMs })
        .then(response => ({ kind: 'page' as const, response }))
        .catch(async error => {
          if (!/download is starting/i.test(String(error))) throw error
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
      if (!await this.isUrlAllowed(finalUrl)) throw new Error('Crawler redirect target is not allowed')
      const contentType = String(response.headers()['content-type'] || '').toLowerCase()
      const title = String(await page.title().catch(() => '')).trim()
      const links = await page.locator('a[href]').evaluateAll(elements => elements
        .map(element => (element as HTMLAnchorElement).href)
        .filter(Boolean)
        .slice(0, 500)).catch(() => [] as string[])
      const downloads: WebsiteImportDownloadArtifact[] = []

      if (!contentType.includes('text/html') && !contentType.includes('application/xhtml')) {
        const artifact = await this.persistDownload({ context, url: finalUrl, nodeDirAbs: args.nodeDirAbs })
        if (artifact) downloads.push(artifact)
        return { finalUrl, title, html: '', links, downloads }
      }

      const htmlRaw = await page.content()
      const html = htmlRaw.length > this.maxHtmlChars ? htmlRaw.slice(0, this.maxHtmlChars) : htmlRaw
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
    } finally {
      await context.close().catch(() => void 0)
    }
  }

  async close(): Promise<void> {
    const browsers = await Promise.allSettled(this.browsers.values())
    await Promise.all(browsers.map(result => result.status === 'fulfilled' ? result.value.close().catch(() => void 0) : Promise.resolve()))
    this.browsers.clear()
  }
}
