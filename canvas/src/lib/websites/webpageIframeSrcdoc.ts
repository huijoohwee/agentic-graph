import { buildCodebaseFilePath, buildWebpageProxyUrl, isHttpUrl } from '@/lib/url'
import { clearWebpageSandboxDocCaches } from './webpageSandboxDoc'
import { clearWebpageSandboxBlobUrlCache } from './webpageSandboxBlobUrlCache'
import { createWebpageTextRequestCache } from './webpageTextRequestCache'

export type WebpageIframeMode = 'html' | 'json' | 'text'

export type WebsiteImportMeta = { importId: string; nodeId: string; outputDirRel?: string }

const CACHE_TTL_MS_PROXY = 2 * 60_000
const CACHE_TTL_MS_REPO = 10 * 60_000
const CACHE_TTL_MS_CONVERT = 8 * 60_000
const CACHE_TTL_MS_ARTIFACT = 60 * 60_000
const CACHE_TTL_MS_DEFAULT = 4 * 60_000

const cacheTtlMsForKey = (key: string): number => {
  if (key.startsWith('proxy:')) return CACHE_TTL_MS_PROXY
  if (key.startsWith('repo:')) return CACHE_TTL_MS_REPO
  if (key.startsWith('convert-json-client:')) return CACHE_TTL_MS_CONVERT
  if (key.startsWith('artifact:')) return CACHE_TTL_MS_ARTIFACT
  return CACHE_TTL_MS_DEFAULT
}

const textRequests = createWebpageTextRequestCache(cacheTtlMsForKey)
const fetchCached = textRequests.fetch

export function clearWebpageIframeSrcdocCaches(): void {
  textRequests.clear()
  clearWebpageSandboxDocCaches()
  clearWebpageSandboxBlobUrlCache()
}
export { buildCodeViewerSrcdoc, buildWebpageHtmlSrcdoc, buildWebpageSandboxHtmlAsync as buildWebpageHtmlSrcdocAsync } from './webpageSandboxDoc'

const yieldToMain = () => new Promise(resolve => setTimeout(resolve, 0))

const readContentLength = (res: Response): number | null => {
  try {
    const raw = res.headers.get('content-length')
    if (!raw) return null
    const n = Number.parseInt(raw, 10)
    return Number.isFinite(n) && n > 0 ? n : null
  } catch {
    return null
  }
}

const fetchBoundedText = async (
  res: Response,
  limit: number,
  onProgress?: (bytes: number, bytesTotal?: number | null) => void,
): Promise<string> => {
  const tooLarge = () => new Error(`Response too large (> ${(limit / 1024 / 1024).toFixed(1)}MB)`)
  const bytesTotal = readContentLength(res)
  if (bytesTotal != null && bytesTotal > limit) {
    await res.body?.cancel()
    throw tooLarge()
  }
  if (!res.body) {
    const text = await res.text()
    if (new TextEncoder().encode(text).byteLength > limit) throw tooLarge()
    return text
  }
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  const parts: string[] = []
  let bytes = 0
  let lastProgressAt = 0
  let lastYieldAtBytes = 0

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      if (value) {
        bytes += value.byteLength
        if (bytes > limit) throw tooLarge()
        parts.push(decoder.decode(value, { stream: true }))
        
        const now = Date.now()
        if (onProgress && now - lastProgressAt > 100) {
          onProgress(bytes, bytesTotal)
          lastProgressAt = now
        }
        
        if (bytes - lastYieldAtBytes > 500_000) {
          await yieldToMain()
          lastYieldAtBytes = bytes
        }

      }
    }
  } finally {
    try { await reader.cancel() } catch { void 0 }
    reader.releaseLock()
  }
  parts.push(decoder.decode())
  if (onProgress) onProgress(bytes, bytesTotal)
  return parts.join('')
}

export async function fetchWebpageHtmlViaProxy(args: {
  url: string
  signal: AbortSignal
  onProgress?: (bytes: number, bytesTotal?: number | null) => void
  bypassCache?: boolean
  fetchImpl?: typeof fetch
}): Promise<string> {
  const u = String(args.url || '').trim()
  if (!u) return ''
  const key = `proxy:${u}`
  return fetchCached(
    key,
    async (signal) => {
      const fetchFn = typeof args.fetchImpl === 'function' ? args.fetchImpl : fetch
      const res = await fetchFn(buildWebpageProxyUrl(u, 'strip'), { signal, headers: { Accept: 'text/html,*/*;q=0.9' } })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return await fetchBoundedText(res, 5_000_000, args.onProgress)
    },
    args.signal,
    { bypassCache: args.bypassCache },
  )
}

export async function fetchWebpageHtmlFromRepoFile(args: {
  relPath: string
  signal: AbortSignal
  onProgress?: (bytes: number, bytesTotal?: number | null) => void
  bypassCache?: boolean
  fetchImpl?: typeof fetch
}): Promise<string> {
  const rel = String(args.relPath || '')
    .trim()
    .replace(/\\/g, '/')
    .replace(/^file:\/\//i, '')
    .replace(/^\.+\//, '')
    .replace(/^\/+/, '')
    .split(/[?#]/)[0]
  if (!rel || rel.includes('..')) return ''
  const key = `repo:${rel}`
  return fetchCached(
    key,
    async (signal) => {
      const fetchFn = typeof args.fetchImpl === 'function' ? args.fetchImpl : fetch
      const res = await fetchFn(buildCodebaseFilePath(rel), { signal, headers: { Accept: 'text/html,*/*;q=0.9' } })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return await fetchBoundedText(res, 8_000_000, args.onProgress)
    },
    args.signal,
    { bypassCache: args.bypassCache },
  )
}

export async function fetchWebpageHtmlAuto(args: {
  url: string
  signal: AbortSignal
  onProgress?: (bytes: number, bytesTotal?: number | null) => void
  bypassCache?: boolean
  fetchImpl?: typeof fetch
}): Promise<string> {
  const u = String(args.url || '').trim()
  if (!u) return ''
  if (isHttpUrl(u)) {
    return await fetchWebpageHtmlViaProxy({
      url: u,
      signal: args.signal,
      onProgress: args.onProgress,
      bypassCache: args.bypassCache,
      fetchImpl: args.fetchImpl,
    })
  }
  return await fetchWebpageHtmlFromRepoFile({
    relPath: u,
    signal: args.signal,
    onProgress: args.onProgress,
    bypassCache: args.bypassCache,
    fetchImpl: args.fetchImpl,
  })
}

export async function fetchWebpageConversionJsonViaConvert(args: {
  url: string
  includeImages: boolean
  signal: AbortSignal
}): Promise<string> {
  void args.includeImages
  const u = String(args.url || '').trim()
  if (!u) return ''
  const key = `convert-json-client:${u}`
  return fetchCached(
    key,
    async () => {
      let diag = ''
      const isJsdomLike = (() => {
        try {
          const p = (globalThis as unknown as { process?: unknown }).process as { versions?: { node?: unknown } } | undefined
          if (p && p.versions && p.versions.node) return true
        } catch {
          void 0
        }
        try {
          const ua = typeof navigator !== 'undefined' ? String(navigator.userAgent || '') : ''
          if (ua && /jsdom/i.test(ua)) return true
        } catch {
          void 0
        }
        return false
      })()
      try {
        if (isJsdomLike) {
          diag = JSON.stringify({ ok: false, error: 'Iframe diagnostics skipped in jsdom' })
        } else {
          const { probeWebpageDomViaHiddenIframe } = await import('./webpageDomExport')
          const probe = await probeWebpageDomViaHiddenIframe({
            url: u,
            mode: 'text',
            timeoutMs: 45_000,
            maxChars: 250_000,
            scrollCrawl: true,
            expandFaq: true,
            minWaitAfterLoadMs: 650,
          })
          if (probe.ok !== true) {
            const p = probe as unknown as { stage?: unknown; error?: unknown; attempts?: unknown }
            diag = JSON.stringify({ ok: false, stage: p.stage, error: p.error, attempts: Array.isArray(p.attempts) ? p.attempts : [] })
          } else {
            diag = String(probe.result.diag || '').trim() || JSON.stringify({ ok: false, error: 'Iframe diagnostics empty' })
          }
        }
      } catch {
        diag = JSON.stringify({ ok: false, error: 'Iframe probe failed' })
      }
      const { convertWebpageUrlToMarkdownViaBrowser } = await import('./webpageClientConvert')
      const res = await convertWebpageUrlToMarkdownViaBrowser({ url: u })
      if (res.ok !== true) throw new Error(res.error)
      const payload: Record<string, unknown> = { ok: true, name: 'webpage.md', markdown: res.markdown, title: res.title, source_url: u, images: [] }
      if (diag && String(res.markdown || '').trim().length <= 140) payload.diagnostics = diag
      return JSON.stringify(payload, null, 2)
    },
    args.signal,
    { timeoutMs: 120_000 },
  )
}

export async function fetchWebsiteImportArtifact(args: {
  importId: string
  nodeId: string
  outputDirRel?: string
  kind: 'rawHtml' | 'markdown' | 'conversionJson'
  signal: AbortSignal
}): Promise<string> {
  const importId = String(args.importId || '').trim()
  const nodeId = String(args.nodeId || '').trim()
  const outputDirRel = String(args.outputDirRel || '').trim()
  const kind = args.kind
  if (!importId || !nodeId) return ''
  const key = `artifact:${outputDirRel}:${importId}:${nodeId}:${kind}`
  return fetchCached(
    key,
    async (signal) => {
      const outputDirQuery = outputDirRel ? `outputDirRel=${encodeURIComponent(outputDirRel)}&` : ''
      const res = await fetch(
        `/__website_import/artifact?${outputDirQuery}importId=${encodeURIComponent(importId)}&nodeId=${encodeURIComponent(nodeId)}&kind=${encodeURIComponent(kind)}`,
        { signal, headers: { Accept: '*/*' } },
      )
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return await fetchBoundedText(res, 32 * 1024 * 1024)
    },
    args.signal,
  )
}
