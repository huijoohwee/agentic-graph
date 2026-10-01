import dns from 'node:dns/promises'
import { isIP } from 'node:net'
import http from 'node:http'
import https from 'node:https'
import { gunzipSync } from 'node:zlib'

const privateIpv4 = (address: string): boolean => {
  const [a, b, c] = address.split('.').map(Number)
  return a === 0 || a === 10 || a === 127 || a >= 224
    || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254)
    || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)
    || (a === 192 && b === 0 && (c === 0 || c === 2))
    || (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100)))
    || (a === 203 && b === 0 && c === 113)
}

export function isPrivateCrawlerAddress(value: unknown): boolean {
  const address = String(value || '').trim().toLowerCase().replace(/^\[|\]$/g, '')
  if (!address) return true
  if (isIP(address) === 4) return privateIpv4(address)
  if (isIP(address) !== 6) return false
  // URL canonicalization normalizes dotted and expanded IPv4-mapped IPv6 alike.
  const canonical = new URL(`http://[${address}]/`).hostname.slice(1, -1)
  const mapped = /^::ffff:([a-f\d]+):([a-f\d]+)$/.exec(canonical)
  if (mapped) {
    const high = parseInt(mapped[1], 16), low = parseInt(mapped[2], 16)
    return privateIpv4(`${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`)
  }
  // Only global unicast is eligible; exclude documentation/transition ranges.
  const first = parseInt(canonical.split(':')[0] || '0', 16)
  return first < 0x2000 || first > 0x3fff || canonical.startsWith('2001:db8:')
    || canonical.startsWith('2002:') || /^2001:(?:[0-9a-f]{1,2}|1[0-9a-f]{2}):/.test(canonical)
}

export async function resolveCrawlerTarget(raw: string, allowPrivateNetworks = false, signal?: AbortSignal) {
  const url = new URL(raw)
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new Error('Crawler target is not a public HTTP(S) URL')
  }
  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, '')
  if (!allowPrivateNetworks && (hostname === 'localhost' || hostname.endsWith('.localhost') || isPrivateCrawlerAddress(hostname))) {
    throw new Error('Crawler target is not a public HTTP(S) URL')
  }
  const family = isIP(hostname)
  signal?.throwIfAborted()
  let onAbort: (() => void) | undefined
  const resolved = family ? Promise.resolve([{ address: hostname, family }]) : dns.lookup(hostname, { all: true })
  const aborted = new Promise<never>((_resolve, reject) => {
    onAbort = () => reject(signal?.reason || new Error('Request aborted'))
    signal?.addEventListener('abort', onAbort, { once: true })
  })
  const addresses = await Promise.race([resolved, aborted]).finally(() => {
    if (onAbort) signal?.removeEventListener('abort', onAbort)
  })
  if (!addresses.length || (!allowPrivateNetworks && addresses.some(row => isPrivateCrawlerAddress(row.address)))) {
    throw new Error('Crawler target resolves to a non-public address')
  }
  return { url, address: addresses[0].address, family: addresses[0].family }
}

export type CrawlerResponseMetadata = {
  status: number; contentType?: string; etag?: string; lastModified?: string; cacheControl?: string; vary?: string; age?: string
  expires?: string; date?: string
  hasCookies: boolean; redirected: boolean
}
export type CrawlerTextOptions = {
  timeoutMs: number; maxBytes: number; accept?: string; signal?: AbortSignal; allowedOrigin?: string
  onBytes?: (bytes: number) => void; onTransferBytes?: (bytes: number) => void
  cache?: { etag?: string; lastModified?: string }
}
export type CrawlerTextResult = { ok: true; text: string; response?: CrawlerResponseMetadata } | { ok: false; error: string }

export async function fetchCrawlerTextWithLimit(raw: string, options: CrawlerTextOptions): Promise<CrawlerTextResult> {
  const controller = new AbortController()
  const cancel = () => controller.abort(options.signal?.reason)
  options.signal?.addEventListener('abort', cancel, { once: true })
  if (options.signal?.aborted) cancel()
  const timer = setTimeout(() => controller.abort(), options.timeoutMs)
  let bytes = 0, transferBytes = 0
  try {
    let current = raw
    for (let hop = 0; hop <= 5; hop += 1) {
      controller.signal.throwIfAborted()
      if (options.allowedOrigin && new URL(current).origin !== options.allowedOrigin) throw new Error('Crawler redirect left the source origin')
      const target = await resolveCrawlerTarget(current, process.env.AGENTIC_OS_CRAWLER_ALLOW_PRIVATE_NETWORKS === '1', controller.signal)
      controller.signal.throwIfAborted()
      const result = await new Promise<{ text: string; location?: string; response?: CrawlerResponseMetadata }>((resolve, reject) => {
        // Pin the validated address at connection time; retain the original Host/SNI.
        const request = (target.url.protocol === 'https:' ? https : http).get(target.url, {
          signal: controller.signal,
          family: target.family,
          lookup: (_host, _options, callback) => callback(null, target.address, target.family),
          headers: { 'User-Agent': 'Mozilla/5.0', Accept: options.accept || '*/*',
            ...(hop === 0 && options.cache?.etag ? { 'If-None-Match': options.cache.etag } : {}),
            ...(hop === 0 && !options.cache?.etag && options.cache?.lastModified ? { 'If-Modified-Since': options.cache.lastModified } : {}),
          },
        }, response => {
          const status = response.statusCode || 0
          const metadata: CrawlerResponseMetadata = { status, contentType: response.headers['content-type'], etag: response.headers.etag,
            lastModified: response.headers['last-modified'], cacheControl: response.headers['cache-control'],
            vary: response.headers.vary, age: response.headers.age,
            expires: response.headers.expires, date: response.headers.date,
            hasCookies: Boolean(response.headers['set-cookie']), redirected: hop > 0 }
          if (status === 304 && options.cache && hop === 0 && (options.cache.etag || options.cache.lastModified)) {
            resolve({ text: '', response: metadata }); response.destroy(); return
          }
          if (status >= 300 && status < 400 && response.headers.location) {
            try { resolve({ text: '', location: new URL(response.headers.location, target.url).toString() }) }
            catch (error) { reject(error) }
            response.destroy()
            return
          }
          if (status < 200 || status >= 300) {
            reject(new Error(`HTTP ${status}`))
            response.destroy()
            return
          }
          const chunks: Buffer[] = []
          let total = 0
          response.on('data', (chunk: Buffer) => {
            total += chunk.length
            bytes += chunk.length
            transferBytes += chunk.length
            if (total > options.maxBytes) {
              reject(new Error('Upstream response too large'))
              response.destroy()
            } else chunks.push(chunk)
          })
          response.on('end', () => {
            try {
              let body = Buffer.concat(chunks)
              if (body[0] === 0x1f && body[1] === 0x8b) {
                body = gunzipSync(body, { maxOutputLength: options.maxBytes })
                bytes += Math.max(0, body.length - total)
              }
              resolve({ text: body.toString('utf8'), ...(options.cache ? { response: metadata } : {}) })
            } catch (error) { bytes = Math.max(bytes, options.maxBytes); reject(error) }
          })
          response.on('error', reject)
          response.on('aborted', () => reject(new Error('Upstream response aborted')))
        })
        request.on('error', reject)
      })
      if (!result.location) return { ok: true, text: result.text, ...(result.response ? { response: result.response } : {}) }
      current = result.location
    }
    return { ok: false, error: 'Crawler redirect limit exceeded' }
  } catch (error) {
    return { ok: false, error: controller.signal.aborted ? (options.signal?.aborted ? 'Request cancelled' : 'Request timed out') : String((error as Error).message || error) }
  } finally {
    clearTimeout(timer); options.signal?.removeEventListener('abort', cancel)
    options.onBytes?.(bytes); options.onTransferBytes?.(transferBytes)
  }
}
