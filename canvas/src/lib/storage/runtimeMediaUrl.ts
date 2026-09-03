const LOCAL_STORAGE_HOSTS = new Set(['localhost', '127.0.0.1', '0.0.0.0'])
const DEFAULT_MEDIA_TOKEN_TTL_MS = 15 * 60 * 1000
const MEDIA_TOKEN_REFRESH_SKEW_MS = 30 * 1000
const RUNTIME_STORAGE_MEDIA_URL_IN_TEXT_RE = /https?:\/\/[^\s<>"')\]]+/gi

type RuntimeMediaAccessUrlCacheEntry = {
  expiresAt: number
  url: string
}

const RUNTIME_MEDIA_ACCESS_URL_CACHE = new Map<string, RuntimeMediaAccessUrlCacheEntry>()

const normalizeString = (value: unknown): string => String(value || '').trim()

const readRuntimeOrigin = (): string => {
  if (typeof window === 'undefined') return ''
  return normalizeString(window.location?.origin)
}

const isLocalStorageHost = (hostname: string): boolean => LOCAL_STORAGE_HOSTS.has(hostname.toLowerCase())

const isStorageMediaPath = (pathname: string): boolean => pathname.startsWith('/api/storage/media/')

const encodeBase64Url = (value: string): string => {
  try {
    const bytes = new TextEncoder().encode(value)
    let binary = ''
    for (let index = 0; index < bytes.length; index += 1) binary += String.fromCharCode(bytes[index])
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
  } catch {
    return ''
  }
}

const readRunIdFromStorageMediaPath = (pathname: string): string => {
  const parts = pathname.split('/').filter(Boolean)
  const runsIndex = parts.indexOf('runs')
  return runsIndex >= 0 ? normalizeString(parts[runsIndex + 1]) : ''
}

export function normalizeRuntimeStorageMediaUrl(value: unknown, runtimeOrigin = readRuntimeOrigin()): string {
  const raw = normalizeString(value)
  const origin = normalizeString(runtimeOrigin)
  if (!raw || !origin) return raw
  try {
    const current = new URL(origin)
    const parsed = new URL(raw, current.origin)
    if (!/^https?:$/i.test(parsed.protocol) || !isLocalStorageHost(parsed.hostname) || !isStorageMediaPath(parsed.pathname)) return raw
    return new URL(`${parsed.pathname}${parsed.search}${parsed.hash}`, current.origin).toString()
  } catch {
    return raw
  }
}

export function buildRuntimeStorageMediaAccessUrl(args: {
  publicUrl: string
  runId?: string | null
  runtimeOrigin?: string | null
  ttlMs?: number | null
}): string {
  const runtimeOrigin = normalizeString(args.runtimeOrigin) || readRuntimeOrigin()
  const publicUrl = normalizeRuntimeStorageMediaUrl(args.publicUrl, runtimeOrigin)
  if (!publicUrl) return ''
  try {
    const url = new URL(publicUrl, runtimeOrigin || 'https://example.invalid')
    if (!isStorageMediaPath(url.pathname)) return publicUrl
    const runId = normalizeString(args.runId) || readRunIdFromStorageMediaPath(url.pathname)
    if (!runId) return publicUrl
    const ttlMs = Math.max(60_000, args.ttlMs ?? DEFAULT_MEDIA_TOKEN_TTL_MS)
    const nowMs = Date.now()
    const cacheKey = [
      url.origin,
      url.pathname,
      url.hash,
      runId,
      ttlMs,
    ].join('\n')
    const cached = RUNTIME_MEDIA_ACCESS_URL_CACHE.get(cacheKey)
    if (cached && cached.expiresAt - MEDIA_TOKEN_REFRESH_SKEW_MS > nowMs) return cached.url
    const expiresAt = nowMs + ttlMs
    const authToken = encodeBase64Url(JSON.stringify({
      runId,
      expiresAt,
    }))
    if (!authToken) return publicUrl
    url.searchParams.set('agentic_os_media_token', authToken)
    const nextUrl = url.toString()
    RUNTIME_MEDIA_ACCESS_URL_CACHE.set(cacheKey, { expiresAt, url: nextUrl })
    return nextUrl
  } catch {
    return publicUrl
  }
}

export function normalizeRuntimeStorageMediaAccessUrl(args: {
  url: unknown
  runId?: string | null
  runtimeOrigin?: string | null
  ttlMs?: number | null
}): string {
  const rawUrl = normalizeString(args.url)
  if (!rawUrl) return ''
  return buildRuntimeStorageMediaAccessUrl({
    publicUrl: rawUrl,
    runId: args.runId,
    runtimeOrigin: args.runtimeOrigin,
    ttlMs: args.ttlMs,
  }) || normalizeRuntimeStorageMediaUrl(rawUrl, normalizeString(args.runtimeOrigin) || readRuntimeOrigin())
}

const splitRuntimeStorageTextUrlToken = (rawToken: string): { url: string; suffix: string } => {
  let url = String(rawToken || '')
  let suffix = ''
  while (url && /[.,;:!?}\]]$/.test(url)) {
    suffix = `${url.slice(-1)}${suffix}`
    url = url.slice(0, -1)
  }
  return { url, suffix }
}

export function normalizeRuntimeStorageMediaAccessUrlsInText(args: {
  text: unknown
  runtimeOrigin?: string | null
  ttlMs?: number | null
}): string {
  const text = String(args.text || '')
  if (!text || !text.includes('/api/storage/media/')) return text
  const runtimeOrigin = normalizeString(args.runtimeOrigin) || readRuntimeOrigin()
  return text.replace(RUNTIME_STORAGE_MEDIA_URL_IN_TEXT_RE, (rawToken) => {
    if (!rawToken.includes('/api/storage/media/')) return rawToken
    const { url, suffix } = splitRuntimeStorageTextUrlToken(rawToken)
    const normalized = normalizeRuntimeStorageMediaAccessUrl({
      url,
      runtimeOrigin,
      ttlMs: args.ttlMs,
    })
    return normalized ? `${normalized}${suffix}` : rawToken
  })
}
