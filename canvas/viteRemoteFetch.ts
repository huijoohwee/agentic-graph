import { once } from 'node:events'
import type { ServerResponse } from 'node:http'
import path from 'node:path'
import fs from 'node:fs/promises'

async function waitForResponseDrain(res: ServerResponse, signal: AbortSignal): Promise<void> {
  const waiting = new AbortController()
  const onClose = () => waiting.abort()
  const onAbort = () => waiting.abort(signal.reason)
  res.once('close', onClose)
  signal.addEventListener('abort', onAbort, { once: true })
  try {
    if (signal.aborted) onAbort()
    if (res.destroyed) onClose()
    await once(res, 'drain', { signal: waiting.signal })
  } finally {
    res.removeListener('close', onClose)
    signal.removeEventListener('abort', onAbort)
  }
}

export function createRemoteFetchHandler({ repoRoot, injectWebpageProxyHtml }: {
  repoRoot: string
  injectWebpageProxyHtml: (options: { html: string; originalUrl: string; scriptPolicy?: string | null }) => string
}): import('vite').Connect.NextHandleFunction {
  return async (req, res, next) => {
    if (req.method === 'OPTIONS') {
      res.statusCode = 204
      res.setHeader('Access-Control-Allow-Origin', '*')
      res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS')
      res.setHeader('Access-Control-Allow-Headers', '*')
      res.setHeader('Access-Control-Max-Age', '86400')
      res.end()
      return
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      next()
      return
    }

    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin')
    res.setHeader(
      'Access-Control-Expose-Headers',
      'Content-Type, Content-Length, Content-Range, Accept-Ranges, ETag, Last-Modified, Cache-Control, Expires',
    )
    const parsedReq = (() => {
      try {
        return new URL(req.url || '', `http://${req.headers.host}`)
      } catch {
        return null
      }
    })()
    const urlParam = parsedReq ? parsedReq.searchParams.get('url') : null
    const scriptPolicyParam = parsedReq ? parsedReq.searchParams.get('agentic_os_script_policy') : null
    const rangeHeader = typeof req.headers.range === 'string' ? req.headers.range : ''
    const ifRangeHeader = typeof req.headers['if-range'] === 'string' ? req.headers['if-range'] : ''

    if (!urlParam) {
      res.statusCode = 400
      res.setHeader('Content-Type', 'text/plain; charset=utf-8')
      res.end('Missing or invalid url parameter')
      return
    }

    const isHttp = /^https?:\/\//i.test(urlParam)
    let localFile: string | null = null

    if (!isHttp) {
      const candidates = [
        path.resolve(repoRoot, '..', urlParam),
        path.resolve(repoRoot, urlParam),
      ]
      for (const p of candidates) {
        try {
          const stat = await fs.stat(p)
          if (stat.isFile()) {
            localFile = p
            break
          }
        } catch {
          void 0
        }
      }
      
      if (!localFile) {
        res.statusCode = 404
        res.setHeader('Content-Type', 'text/plain; charset=utf-8')
        res.end('Not found')
        return
      }
    }

    if (localFile) {
       try {
         const ext = path.extname(localFile).toLowerCase()
         if (ext === '.html' || ext === '.htm') {
           const content = await fs.readFile(localFile, 'utf8')
           const injected = injectWebpageProxyHtml({
             html: content,
             originalUrl: urlParam,
             scriptPolicy: scriptPolicyParam,
           })
           res.statusCode = 200
           res.setHeader('Content-Type', 'text/html; charset=utf-8')
           res.setHeader('Cache-Control', 'no-store')
           res.end(injected)
           return
         }

         const content = await fs.readFile(localFile, 'utf8')
         const contentType = (() => {
           if (ext === '.geojson') return 'application/geo+json; charset=utf-8'
           if (ext === '.json' || ext === '.jsonld') return 'application/json; charset=utf-8'
           if (ext === '.md' || ext === '.markdown' || ext === '.mmd') return 'text/markdown; charset=utf-8'
           if (ext === '.yaml' || ext === '.yml') return 'text/yaml; charset=utf-8'
           if (ext === '.csv') return 'text/csv; charset=utf-8'
           if (ext === '.svg') return 'image/svg+xml; charset=utf-8'
           if (ext === '.txt') return 'text/plain; charset=utf-8'
           return 'text/plain; charset=utf-8'
         })()
         res.statusCode = 200
         res.setHeader('Content-Type', contentType)
         res.setHeader('Cache-Control', 'no-store')
         res.end(content)
         return
       } catch (err) {
         res.statusCode = 500
         res.end(String(err))
         return
       }
    }

    if (!isHttp) { // Should not happen given logic above
       res.statusCode = 400
       res.end('Invalid URL')
       return
    }

    const upstreamHost = (() => {
      try {
        return new URL(urlParam).hostname.toLowerCase()
      } catch {
        return ''
      }
    })()
    const shouldSpoofWeChat =
      upstreamHost === 'mp.weixin.qq.com' ||
      upstreamHost.endsWith('.mp.weixin.qq.com') ||
      upstreamHost === 'mmbiz.qpic.cn' ||
      upstreamHost.endsWith('.qpic.cn') ||
      upstreamHost === 'mmbiz.qlogo.cn' ||
      upstreamHost.endsWith('.qlogo.cn') ||
      upstreamHost === 'wx.qlogo.cn' ||
      upstreamHost.endsWith('.wx.qlogo.cn')

    const upstreamReferer = (() => {
      if (shouldSpoofWeChat) return 'https://mp.weixin.qq.com/'
      try {
        const u = new URL(urlParam)
        const host = u.hostname.toLowerCase()
        if (host === 'media.licdn.com' || host.endsWith('.licdn.com')) return 'https://www.linkedin.com/'
        return `${u.origin}/`
      } catch {
        return undefined
      }
    })()

    const acceptLanguage =
      typeof req.headers['accept-language'] === 'string' && req.headers['accept-language'].trim()
        ? req.headers['accept-language']
        : shouldSpoofWeChat
          ? 'zh-CN,zh;q=0.9,en;q=0.8'
          : 'en-US,en;q=0.9'

    let controller: AbortController | null = null
    let timeoutId: ReturnType<typeof setTimeout> | null = null
    let timedOut = false
    let clientAborted = false
    let finished = false
    let detachClientAbort: (() => void) | undefined
    try {
      const timeoutMs = (() => {
        const raw = String(process.env.AGENTIC_OS_REMOTE_FETCH_TIMEOUT_MS || '').trim()
        const parsed = raw ? Number(raw) : NaN
        if (!Number.isFinite(parsed)) return 60_000
        return Math.max(1_000, Math.min(120_000, Math.floor(parsed)))
      })()
      const maxBytes = (() => {
        const raw = String(process.env.AGENTIC_OS_REMOTE_FETCH_MAX_BYTES || '').trim()
        const parsed = raw ? Number(raw) : NaN
        if (!Number.isFinite(parsed)) return 20 * 1024 * 1024
        return Math.max(64 * 1024, Math.min(50 * 1024 * 1024, Math.floor(parsed)))
      })()
      const maxBinaryBytes = (() => {
        const raw = String(process.env.AGENTIC_OS_REMOTE_FETCH_MAX_BYTES_BINARY || '').trim()
        const parsed = raw ? Number(raw) : NaN
        if (!Number.isFinite(parsed)) return 250 * 1024 * 1024
        return Math.max(512 * 1024, Math.min(1024 * 1024 * 1024, Math.floor(parsed)))
      })()
      const ctrl = new AbortController()
      controller = ctrl
      const abort = () => {
        if (finished) return
        clientAborted = true
        try {
          ctrl.abort()
        } catch {
          void 0
        }
      }
      req.on('aborted', abort)
      detachClientAbort = () => req.removeListener('aborted', abort)

      timeoutId = setTimeout(() => {
        timedOut = true
        ctrl.abort()
      }, timeoutMs)
      const upstream = await fetch(urlParam, {
        method: req.method,
        redirect: 'follow',
        signal: ctrl.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          // Use generic accept for remote fetch to avoid 406/403 on raw files
          Accept: typeof req.headers.accept === 'string' && req.headers.accept.trim() ? req.headers.accept : '*/*',
          'Accept-Language': acceptLanguage,
          'Accept-Encoding': 'identity',
          ...(upstreamReferer ? { Referer: upstreamReferer } : {}),
          ...(rangeHeader ? { Range: rangeHeader } : {}),
          ...(ifRangeHeader ? { 'If-Range': ifRangeHeader } : {}),
        },
      })

      if (ctrl.signal.aborted) {
        finished = true
        if (!res.writableEnded) {
          try {
            res.statusCode = timedOut ? 504 : 499
            res.setHeader('Content-Type', 'text/plain; charset=utf-8')
            res.end(timedOut ? 'Timeout' : '')
          } catch {
            void 0
          }
        }
        return
      }

      res.statusCode = upstream.status
      const contentType = upstream.headers.get('content-type')
      if (contentType) {
        res.setHeader('Content-Type', contentType)
      }
      const passthrough = ['cache-control', 'etag', 'last-modified', 'expires', 'accept-ranges', 'content-range', 'content-length']
      for (const key of passthrough) {
        try {
          const v = upstream.headers.get(key)
          if (v) res.setHeader(key, v)
        } catch {
          void 0
        }
      }
      if (req.method === 'HEAD') {
        res.end()
        finished = true
        return
      }
      const effectiveMaxBytes = (() => {
        const ct = String(contentType || '').toLowerCase()
        if (rangeHeader) return maxBinaryBytes
        if (ct.startsWith('video/') || ct.startsWith('audio/')) return maxBinaryBytes
        return maxBytes
      })()
      const reader = upstream.body?.getReader()
      if (!reader) {
        const contentLengthRaw = upstream.headers.get('content-length')
        const len = contentLengthRaw ? Number(contentLengthRaw) : NaN
        if (Number.isFinite(len) && len > effectiveMaxBytes) {
          throw new Error('Upstream response too large')
        }
        const buf = Buffer.from(await upstream.arrayBuffer())
        if (buf.byteLength > effectiveMaxBytes) throw new Error('Upstream response too large')
        finished = true
        res.end(buf)
        return
      }
      let total = 0
      while (true) {
        if (ctrl.signal.aborted) throw new Error('aborted')
        const { done, value } = await reader.read()
        if (done) break
        if (!value || value.byteLength === 0) continue
        total += value.byteLength
        if (total > effectiveMaxBytes) {
          try {
            await reader.cancel()
          } catch {
            void 0
          }
          throw new Error('Upstream response too large')
        }
        if (!res.write(Buffer.from(value))) {
          await waitForResponseDrain(res, ctrl.signal)
        }
      }
      finished = true
      res.end()
    } catch (error) {
      if (res.headersSent || res.destroyed) {
        if (!res.destroyed) res.destroy()
        return
      }
      const msg =
        error && typeof error === 'object' && 'message' in error
          ? String((error as { message?: unknown }).message || '')
          : 'Upstream fetch failed'
      const message = msg || 'Upstream fetch failed'
      if (timedOut) {
        res.statusCode = 504
        res.setHeader('Content-Type', 'text/plain; charset=utf-8')
        res.end('Timeout')
        return
      }
      if (clientAborted || controller?.signal.aborted || /aborted/i.test(message)) {
        try {
          res.statusCode = 499
          res.end()
        } catch {
          void 0
        }
        return
      }
      if (/aborted/i.test(message) || /timeout/i.test(message)) {
        res.statusCode = 504
      } else if (/too large/i.test(message)) {
        res.statusCode = 413
      } else {
        res.statusCode = 502
      }
      res.setHeader('Content-Type', 'text/plain; charset=utf-8')
      res.end(message)
    } finally {
      detachClientAbort?.()
      if (!finished) controller?.abort()
      if (timeoutId) {
        clearTimeout(timeoutId)
      }
    }
  }
}

