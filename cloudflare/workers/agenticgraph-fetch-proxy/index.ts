const CORS_HEADERS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET,HEAD,OPTIONS',
  'access-control-allow-headers': '*',
  'access-control-max-age': '86400',
}

const readEnvNumber = (raw: unknown, fallback: number): number => {
  const v = typeof raw === 'string' ? raw.trim() : typeof raw === 'number' ? String(raw) : ''
  const n = v ? Number(v) : NaN
  if (!Number.isFinite(n)) return fallback
  return Math.floor(n)
}

function isLoopbackOrUnspecifiedIpv4Host(host: string): boolean {
  return host === '127.0.0.1' || host === '0.0.0.0'
}

function isPrivateIpv4Host(host: string): boolean {
  const parts = host.split('.')
  if (parts.length !== 4) return false
  const octets = parts.map(part => Number.parseInt(part, 10))
  if (octets.some(octet => !Number.isInteger(octet) || octet < 0 || octet > 255)) return false
  if (octets[0] === 10) return true
  if (octets[0] === 192 && octets[1] === 168) return true
  if (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) return true
  return false
}

function isBlockedHostname(hostname: string): boolean {
  const host = String(hostname || '').trim().toLowerCase()
  if (!host) return true
  if (host === 'localhost' || host.endsWith('.localhost')) return true
  if (host === '::1' || host === '[::1]') return true
  if (isLoopbackOrUnspecifiedIpv4Host(host)) return true
  if (isPrivateIpv4Host(host)) return true
  return false
}

const errorText = (status: number, message: string): Response =>
  new Response(message, {
    status,
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'no-store',
      ...CORS_HEADERS,
    },
  })

const computeTimeoutMs = (env: Record<string, unknown>): number => {
  const raw = env.KNOWGRPH_REMOTE_FETCH_TIMEOUT_MS
  const n = readEnvNumber(raw, 60_000)
  return Math.max(1_000, Math.min(120_000, n))
}

const computeMaxBytes = (env: Record<string, unknown>): number => {
  const raw = env.KNOWGRPH_REMOTE_FETCH_MAX_BYTES
  const n = readEnvNumber(raw, 20 * 1024 * 1024)
  return Math.max(64 * 1024, Math.min(50 * 1024 * 1024, n))
}

const computeMaxBinaryBytes = (env: Record<string, unknown>): number => {
  const raw = env.KNOWGRPH_REMOTE_FETCH_MAX_BYTES_BINARY
  const n = readEnvNumber(raw, 250 * 1024 * 1024)
  return Math.max(512 * 1024, Math.min(1024 * 1024 * 1024, n))
}

const passthroughHeaders = [
  'cache-control',
  'etag',
  'last-modified',
  'expires',
  'accept-ranges',
  'content-range',
  'content-length',
]

const buildDownstreamHeaders = (upstream: Response): Headers => {
  const headers = new Headers()
  headers.set('cache-control', 'no-store')
  headers.set('access-control-allow-origin', '*')
  headers.set('cross-origin-resource-policy', 'cross-origin')
  headers.set(
    'access-control-expose-headers',
    'Content-Type, Content-Length, Content-Range, Accept-Ranges, ETag, Last-Modified, Cache-Control, Expires',
  )

  const contentType = upstream.headers.get('content-type')
  if (contentType) headers.set('content-type', contentType)
  for (const key of passthroughHeaders) {
    const v = upstream.headers.get(key)
    if (v) headers.set(key, v)
  }
  return headers
}

const makeCappedBody = async (args: {
  upstream: Response
  controller: AbortController
  maxBytes: number
}): Promise<ReadableStream<Uint8Array> | null> => {
  const body = args.upstream.body
  if (!body) return null
  const reader = body.getReader()
  let total = 0
  return new ReadableStream<Uint8Array>({
    async pull(ctrl) {
      if (args.controller.signal.aborted) {
        ctrl.close()
        return
      }
      const { done, value } = await reader.read()
      if (done) {
        ctrl.close()
        return
      }
      if (!value || value.byteLength === 0) return
      total += value.byteLength
      if (total > args.maxBytes) {
        try {
          args.controller.abort()
        } catch {
          void 0
        }
        try {
          await reader.cancel()
        } catch {
          void 0
        }
        ctrl.error(new Error('Upstream response too large'))
        return
      }
      ctrl.enqueue(value)
    },
    async cancel() {
      try {
        args.controller.abort()
      } catch {
        void 0
      }
      try {
        await reader.cancel()
      } catch {
        void 0
      }
    },
  })
}

export default {
  async fetch(request: Request, env: Record<string, unknown>): Promise<Response> {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS })
    }

    const method = String(request.method || '').toUpperCase()
    if (method !== 'GET' && method !== 'HEAD') {
      return errorText(405, 'Method not allowed')
    }

    const url = new URL(request.url)
    if (url.pathname !== '/__fetch_remote') {
      return errorText(404, 'Not found')
    }

    const urlParam = url.searchParams.get('url')
    if (!urlParam) return errorText(400, 'Missing url parameter')

    let target: URL
    try {
      target = new URL(urlParam)
    } catch {
      return errorText(400, 'Invalid url parameter')
    }

    if (target.protocol !== 'https:' && target.protocol !== 'http:') {
      return errorText(400, 'Unsupported protocol')
    }

    if (isBlockedHostname(target.hostname)) {
      return errorText(403, 'Forbidden host')
    }

    const timeoutMs = computeTimeoutMs(env)
    const maxBytes = computeMaxBytes(env)
    const maxBinaryBytes = computeMaxBinaryBytes(env)

    const range = request.headers.get('range') || ''
    const ifRange = request.headers.get('if-range') || ''

    const shouldSpoofWeChat = (() => {
      const host = target.hostname.toLowerCase()
      return (
        host === 'mp.weixin.qq.com' ||
        host.endsWith('.mp.weixin.qq.com') ||
        host === 'mmbiz.qpic.cn' ||
        host.endsWith('.qpic.cn') ||
        host === 'mmbiz.qlogo.cn' ||
        host.endsWith('.qlogo.cn') ||
        host === 'wx.qlogo.cn' ||
        host.endsWith('.wx.qlogo.cn')
      )
    })()

    const upstreamReferer = (() => {
      if (shouldSpoofWeChat) return 'https://mp.weixin.qq.com/'
      const host = target.hostname.toLowerCase()
      if (host === 'media.licdn.com' || host.endsWith('.licdn.com')) return 'https://www.linkedin.com/'
      return `${target.origin}/`
    })()

    const acceptLanguage = (() => {
      const raw = request.headers.get('accept-language')
      if (raw && raw.trim()) return raw
      if (shouldSpoofWeChat) return 'zh-CN,zh;q=0.9,en;q=0.8'
      return 'en-US,en;q=0.9'
    })()

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const upstream = await fetch(target.toString(), {
        method,
        redirect: 'follow',
        signal: controller.signal,
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          Accept: request.headers.get('accept') || '*/*',
          'Accept-Language': acceptLanguage,
          'Accept-Encoding': 'identity',
          Referer: upstreamReferer,
          ...(range ? { Range: range } : {}),
          ...(ifRange ? { 'If-Range': ifRange } : {}),
        },
      })

      const headers = buildDownstreamHeaders(upstream)

      const contentLengthRaw = upstream.headers.get('content-length')
      const contentLength = contentLengthRaw ? Number(contentLengthRaw) : NaN
      const contentType = String(upstream.headers.get('content-type') || '').toLowerCase()
      const effectiveMaxBytes = (() => {
        if (range) return maxBinaryBytes
        if (contentType.startsWith('video/') || contentType.startsWith('audio/')) return maxBinaryBytes
        return maxBytes
      })()

      if (Number.isFinite(contentLength) && contentLength > effectiveMaxBytes) {
        return errorText(413, 'Upstream response too large')
      }

      if (method === 'HEAD') {
        return new Response(null, { status: upstream.status, headers })
      }

      const cappedBody = await makeCappedBody({ upstream, controller, maxBytes: effectiveMaxBytes })
      return new Response(cappedBody, { status: upstream.status, headers })
    } catch (e) {
      const msg = e && typeof e === 'object' && 'message' in e ? String((e as { message?: unknown }).message || '') : ''
      if (/aborted|timeout/i.test(msg) || controller.signal.aborted) return errorText(504, 'Timeout')
      return errorText(502, msg || 'Upstream fetch failed')
    } finally {
      clearTimeout(timeoutId)
    }
  },
}

