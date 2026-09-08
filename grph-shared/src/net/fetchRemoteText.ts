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

const cancelBody = (body: ReadableStream<Uint8Array> | null, reason: string): void => {
  try {
    if (body) void Promise.resolve(body.cancel(reason)).catch(() => undefined)
  } catch {
    // Cleanup must not replace the response's known HTTP/result semantics.
  }
}

function createRequestDeadline(timeoutMs: number) {
  const controller = new AbortController()
  const deadlineMs = performance.now() + timeoutMs
  const timeoutError = new Error('timeout')
  const pending = new Set<(error: Error) => void>()
  let expired = false
  const expire = () => {
    if (expired) return
    expired = true
    for (const reject of pending) reject(timeoutError)
    try { controller.abort(timeoutError) } catch { /* bounded rejection already delivered */ }
  }
  const timer = setTimeout(expire, timeoutMs)
  const assertActive = () => {
    if (!expired && performance.now() >= deadlineMs) expire()
    if (expired) throw timeoutError
  }
  const wait = <T,>(promise: Promise<T>, disposeLate?: (value: T) => void): Promise<T> =>
    new Promise<T>((resolve, reject) => {
      let settled = false
      const fail = (error: unknown) => {
        if (settled) return
        settled = true
        pending.delete(fail)
        reject(error)
      }
      pending.add(fail)
      // One current waiter per read, without accumulating reactions on a shared timeout promise.
      promise.then(value => {
        if (!settled) {
          try { assertActive() } catch (error) { fail(error) }
        }
        if (settled) { disposeLate?.(value); return }
        settled = true
        pending.delete(fail)
        resolve(value)
      }, fail)
      try { assertActive() } catch (error) { fail(error) }
    })
  return {
    signal: controller.signal,
    assertActive,
    wait,
    close: () => clearTimeout(timer),
  }
}

type RequestDeadline = ReturnType<typeof createRequestDeadline>

async function withResponseDeadline<T>(
  targetUrl: string,
  init: RequestInit,
  timeoutMs: number,
  consume: (response: Response, deadline: RequestDeadline) => Promise<T>,
): Promise<T> {
  const deadline = createRequestDeadline(timeoutMs)
  let response: Response | undefined
  try {
    response = await deadline.wait<Response>(
      Promise.resolve().then(() => {
        deadline.assertActive()
        return fetch(targetUrl, { ...init, signal: deadline.signal })
      }),
      late => cancelBody(late.body, 'remote response arrived after deadline'),
    )
    return await consume(response, deadline)
  } finally {
    deadline.close()
    // HEAD, advertised oversize, and early failures never acquire a reader.
    if (response && !response.bodyUsed) cancelBody(response.body, 'remote response body unused')
  }
}

async function readResponseTextBounded(
  res: Response,
  args: { maxBytes: number; onProgress?: (args: { loadedBytes: number; totalBytes?: number }) => void },
  deadline: RequestDeadline,
): Promise<{ text: string; contentLength?: number } | { kind: 'too_large'; contentLength?: number }> {
  deadline.assertActive()
  const contentLengthHeader = res.headers.get('content-length')
  const contentLength = contentLengthHeader ? Number.parseInt(contentLengthHeader, 10) : undefined
  if (contentLength != null && Number.isFinite(contentLength) && contentLength > args.maxBytes) {
    return { kind: 'too_large', contentLength }
  }

  if (!res.body) {
    const text = await deadline.wait(res.text())
    if (new TextEncoder().encode(text).byteLength > args.maxBytes) return { kind: 'too_large', contentLength }
    deadline.assertActive()
    return { text, contentLength }
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder('utf-8')
  const parts: string[] = []
  let loadedBytes = 0
  let complete = false
  try {
    while (true) {
      const { done, value } = await deadline.wait(reader.read())
      if (done) { complete = true; break }
      if (value) {
        loadedBytes += value.byteLength
        if (loadedBytes > args.maxBytes) return { kind: 'too_large', contentLength }
        // Streaming decoding preserves split UTF-8 sequences and avoids a second full byte buffer.
        const text = decoder.decode(value, { stream: true })
        if (text) parts.push(text)
        args.onProgress?.({ loadedBytes, totalBytes: contentLength })
        deadline.assertActive()
      }
    }
    const tail = decoder.decode()
    if (tail) parts.push(tail)
    const text = parts.join('')
    deadline.assertActive()
    return { text, contentLength }
  } finally {
    if (!complete) {
      try { void Promise.resolve(reader.cancel('remote response read abandoned')).catch(() => undefined) } catch { /* preserve result */ }
    }
    try { reader.releaseLock() } catch { /* preserve result */ }
  }
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
  const configuredTimeout = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const timeoutMs = Number.isFinite(configuredTimeout) && configuredTimeout > 0
    ? Math.min(configuredTimeout, 2_147_483_647)
    : DEFAULT_TIMEOUT_MS
  const configuredMaxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES
  const maxBytes = Number.isFinite(configuredMaxBytes) && configuredMaxBytes >= 0
    ? configuredMaxBytes
    : DEFAULT_MAX_BYTES
  const proxyEndpoint = options.proxyEndpoint || REMOTE_FETCH_PROXY_ENDPOINT
  const targetUrl = useProxy ? buildProxyUrl(proxyEndpoint, url) : url
  const headers = options.headers
  const method = options.method || 'GET'

  try {
    // Preserve independent attempts: optional preflight HEAD and each GET/HEAD request
    // receive their own budget; alternate transport starts a new attempt as before.
    if (options.preflightHead && method !== 'HEAD') {
      try {
        const oversized = await withResponseDeadline(targetUrl, { method: 'HEAD', headers }, timeoutMs, async headRes => {
          const cl = headRes.headers.get('content-length')
          const contentLength = cl ? Number.parseInt(cl, 10) : undefined
          return contentLength != null && Number.isFinite(contentLength) && contentLength > maxBytes
            ? { ok: false as const, kind: 'too_large' as const, url, usedProxy: useProxy, status: headRes.status, contentLength }
            : null
        })
        if (oversized) return oversized
      } catch {
        void 0
      }
    }

    return await withResponseDeadline(targetUrl, { method, headers }, timeoutMs, async (res, deadline): Promise<FetchRemoteTextResult> => {
      const status = res.status
      if (!res.ok) {
        const errorText = await (async () => {
          try {
            const body = await readResponseTextBounded(res, { maxBytes: Math.min(maxBytes, DEFAULT_ERROR_TEXT_MAX_BYTES) }, deadline)
            if (!('text' in body)) return undefined
            const t = String(body.text || '')
            return t.length > DEFAULT_ERROR_TEXT_MAX_BYTES ? t.slice(0, DEFAULT_ERROR_TEXT_MAX_BYTES) : t
          } catch {
            // A stalled diagnostic body cannot turn an authoritative HTTP rejection
            // into a transport timeout eligible for alternate-origin replay.
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
      const body = await readResponseTextBounded(res, { maxBytes, onProgress: options.onProgress }, deadline)
      if (!('text' in body)) {
        return { ok: false, kind: 'too_large', url, usedProxy: useProxy, status, contentLength: body.contentLength }
      }
      const text = body.text
      if (options.validate && !runValidate(options.validate, { text, url })) {
        return { ok: false, kind: 'network', url, usedProxy: useProxy, status, contentLength: body.contentLength }
      }
      return { ok: true, text, url, usedProxy: useProxy, status, contentLength: body.contentLength, contentType }
    })
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
