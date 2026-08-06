import { coerceFetchUrl, REMOTE_FETCH_PROXY_ENDPOINT, shouldUseRemoteFetchProxy } from '../url.js'

export type FetchRemoteTextSuccess = {
  ok: true
  text: string
  url: string
  usedProxy: boolean
  status?: number
  contentLength?: number
  contentType?: string
}

export type FetchRemoteTextFailure = {
  ok: false
  kind: 'timeout' | 'too_large' | 'http' | 'network'
  url: string
  usedProxy: boolean
  status?: number
  contentLength?: number
  errorText?: string
}

export type FetchRemoteTextResult = FetchRemoteTextSuccess | FetchRemoteTextFailure

export type FetchRemoteTextDetailedOptions = {
  method?: 'GET' | 'HEAD'
  timeoutMs?: number
  maxBytes?: number
  proxyEndpoint?: string
  useProxy?: 'auto' | 'always' | 'never'
  preferProxy?: boolean
  preflightHead?: boolean
  headers?: Record<string, string>
  validate?: ((text: string) => boolean) | ((args: { text: string; url: string }) => boolean)
  onProgress?: (args: { loadedBytes: number; totalBytes?: number }) => void
}

const DEFAULT_TIMEOUT_MS = 12_000
const DEFAULT_MAX_BYTES = 2_000_000
const DEFAULT_ERROR_TEXT_MAX_BYTES = 16_000

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  if (!timeoutMs || timeoutMs <= 0) return promise
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout')), timeoutMs)
    promise.then(
      v => {
        clearTimeout(t)
        resolve(v)
      },
      err => {
        clearTimeout(t)
        reject(err)
      },
    )
  })
}

async function readResponseTextBounded(
  res: Response,
  args: { maxBytes: number; onProgress?: (args: { loadedBytes: number; totalBytes?: number }) => void },
): Promise<{ text: string; contentLength?: number } | { kind: 'too_large'; contentLength?: number }> {
  const contentLengthHeader = res.headers.get('content-length')
  const contentLength = contentLengthHeader ? Number.parseInt(contentLengthHeader, 10) : undefined
  if (contentLength != null && Number.isFinite(contentLength) && contentLength > args.maxBytes) {
    return { kind: 'too_large', contentLength }
  }

  if (!res.body) {
    const text = await res.text()
    if (text.length > args.maxBytes) return { kind: 'too_large', contentLength }
    return { text, contentLength }
  }

  const reader = res.body.getReader()
  const chunks: Uint8Array[] = []
  let loadedBytes = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    if (value) {
      loadedBytes += value.byteLength
      if (loadedBytes > args.maxBytes) return { kind: 'too_large', contentLength }
      chunks.push(value)
      args.onProgress?.({ loadedBytes, totalBytes: contentLength })
    }
  }
  const merged = new Uint8Array(loadedBytes)
  let offset = 0
  for (const c of chunks) {
    merged.set(c, offset)
    offset += c.byteLength
  }
  const text = new TextDecoder('utf-8').decode(merged)
  return { text, contentLength }
}

function buildProxyUrl(proxyEndpoint: string, url: string): string {
  const endpoint = proxyEndpoint || REMOTE_FETCH_PROXY_ENDPOINT
  if (endpoint.includes('?')) return `${endpoint}${encodeURIComponent(url)}`
  return `${endpoint}?url=${encodeURIComponent(url)}`
}

function runValidate(
  validate: ((text: string) => boolean) | ((args: { text: string; url: string }) => boolean),
  args: { text: string; url: string },
): boolean {
  try {
    const v = validate as (a: { text: string; url: string }) => boolean
    const res = v(args)
    if (typeof res === 'boolean') return res
  } catch {
    void 0
  }
  try {
    const v = validate as (t: string) => boolean
    const res = v(args.text)
    if (typeof res === 'boolean') return res
  } catch {
    void 0
  }
  return true
}

async function fetchVia(url: string, options: FetchRemoteTextDetailedOptions, useProxy: boolean): Promise<FetchRemoteTextResult> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES
  const proxyEndpoint = options.proxyEndpoint || REMOTE_FETCH_PROXY_ENDPOINT
  const targetUrl = useProxy ? buildProxyUrl(proxyEndpoint, url) : url
  const headers = options.headers
  const method = options.method || 'GET'

  try {
    if (options.preflightHead && method !== 'HEAD') {
      try {
        const headRes = await withTimeout(fetch(targetUrl, { method: 'HEAD', headers }), timeoutMs)
        const cl = headRes.headers.get('content-length')
        const contentLength = cl ? Number.parseInt(cl, 10) : undefined
        if (contentLength != null && Number.isFinite(contentLength) && contentLength > maxBytes) {
          return { ok: false, kind: 'too_large', url, usedProxy: useProxy, status: headRes.status, contentLength }
        }
      } catch {
        void 0
      }
    }

    const res = await withTimeout(fetch(targetUrl, { method, headers }), timeoutMs)
    const status = res.status
    if (!res.ok) {
      const errorText = await (async () => {
        try {
          const body = await readResponseTextBounded(res, { maxBytes: Math.min(maxBytes, DEFAULT_ERROR_TEXT_MAX_BYTES) })
          if (!('text' in body)) return undefined
          const t = String(body.text || '')
          return t.length > DEFAULT_ERROR_TEXT_MAX_BYTES ? t.slice(0, DEFAULT_ERROR_TEXT_MAX_BYTES) : t
        } catch {
          return undefined
        }
      })()
      return { ok: false, kind: 'http', url, usedProxy: useProxy, status, errorText }
    }
    const contentType = String(res.headers.get('content-type') || '').trim() || undefined
    const contentLengthHeader = res.headers.get('content-length')
    const contentLength = contentLengthHeader ? Number.parseInt(contentLengthHeader, 10) : undefined
    if (method === 'HEAD') {
      if (contentLength != null && Number.isFinite(contentLength) && contentLength > maxBytes) {
        return { ok: false, kind: 'too_large', url, usedProxy: useProxy, status, contentLength }
      }
      return { ok: true, text: '', url, usedProxy: useProxy, status, contentLength, contentType }
    }
    const body = await readResponseTextBounded(res, { maxBytes, onProgress: options.onProgress })
    if (!('text' in body)) {
      return { ok: false, kind: 'too_large', url, usedProxy: useProxy, status, contentLength: body.contentLength }
    }
    const text = body.text
    if (options.validate && !runValidate(options.validate, { text, url })) {
      return { ok: false, kind: 'network', url, usedProxy: useProxy, status, contentLength: body.contentLength }
    }
    return { ok: true, text, url, usedProxy: useProxy, status, contentLength: body.contentLength, contentType }
  } catch (err: any) {
    if (String(err?.message || '').toLowerCase().includes('timeout')) {
      return { ok: false, kind: 'timeout', url, usedProxy: useProxy }
    }
    return { ok: false, kind: 'network', url, usedProxy: useProxy }
  }
}

/**
 * An alternate transport only helps when the first transport itself was
 * unavailable. A response from the remote source is authoritative: replaying
 * an authorization, rate-limit, server, or content-size response through the
 * other transport adds traffic without changing its meaning.
 */
function canRetryAlternateTransport(result: FetchRemoteTextResult): boolean {
  return !result.ok && (result.kind === 'network' || result.kind === 'timeout')
}

export async function fetchRemoteTextDetailed(rawUrl: string, options: FetchRemoteTextDetailedOptions = {}): Promise<FetchRemoteTextResult> {
  const url = coerceFetchUrl(rawUrl)
  if (!url) return { ok: false, kind: 'network', url: rawUrl, usedProxy: false }

  const useProxyMode = options.useProxy || 'auto'
  const shouldProxy = shouldUseRemoteFetchProxy()

  if (useProxyMode === 'never') return fetchVia(url, options, false)
  if (useProxyMode === 'always') return fetchVia(url, options, true)
  if (!shouldProxy) return fetchVia(url, options, false)

  if (options.preferProxy) {
    const proxied = await fetchVia(url, options, true)
    if (proxied.ok) return proxied
    if (!canRetryAlternateTransport(proxied)) return proxied
    return fetchVia(url, options, false)
  }

  const direct = await fetchVia(url, options, false)
  if (direct.ok) return direct
  if (!canRetryAlternateTransport(direct)) return direct
  return fetchVia(url, options, true)
}

export async function fetchRemoteText(
  rawUrl: string,
  options: { timeoutMs?: number; maxBytes?: number; useProxy?: boolean; validate?: ((text: string) => boolean) | ((args: { text: string; url: string }) => boolean) } = {},
): Promise<string | null> {
  const res = await fetchRemoteTextDetailed(rawUrl, {
    timeoutMs: options.timeoutMs,
    maxBytes: options.maxBytes,
    validate: options.validate,
    useProxy: options.useProxy ? 'always' : 'auto',
  })
  if (!res.ok) return null
  return res.text
}
