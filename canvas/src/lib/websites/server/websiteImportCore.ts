import { createHash } from 'node:crypto'

export const safeJsonParse = <T,>(raw: string): T | null => {
  try {
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

export const hashHex = (input: string): string => createHash('sha256').update(String(input || ''), 'utf8').digest('hex')

export const clampInt = (v: unknown, fallback: number, min: number, max: number): number => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() ? Number(v) : NaN
  if (!Number.isFinite(n)) return fallback
  return Math.max(min, Math.min(max, Math.floor(n)))
}

export const extractXmlLocs = (xml: string): string[] => {
  const s = String(xml || '')
  const out: string[] = []
  const re = /<loc>\s*([^<]+?)\s*<\/loc>/gi
  while (true) {
    const m = re.exec(s)
    if (!m) break
    const loc = String(m[1] || '').trim()
    if (loc) out.push(loc)
  }
  return out
}

export const looksLikeSitemapIndex = (xml: string): boolean => /<sitemapindex\b/i.test(String(xml || ''))

export const normalizeUrl = (raw: string): string | null => {
  try {
    const u = new URL(String(raw || '').trim())
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null
    u.hash = ''
    return u.toString()
  } catch {
    return null
  }
}

export const isSameHost = (a: string, b: string): boolean => {
  try {
    return new URL(a).host === new URL(b).host
  } catch {
    return false
  }
}

const NON_DOCUMENT_EXTENSIONS = new Set([
  'css',
  'js',
  'mjs',
  'map',
  'png',
  'jpg',
  'jpeg',
  'gif',
  'webp',
  'svg',
  'ico',
  'avif',
  'bmp',
  'woff',
  'woff2',
  'ttf',
  'eot',
  'otf',
  'pdf',
  'zip',
  'gz',
  'tgz',
  'rar',
  '7z',
  'mp3',
  'mp4',
  'webm',
  'mov',
  'avi',
  'json',
])

const NON_DOCUMENT_PATH_PREFIXES = [
  '/api/',
  '/assets/',
  '/static/',
  '/cdn-cgi/',
  '/_next/',
  '/favicon',
]

const normalizePathname = (raw: string): string => {
  const path = String(raw || '').trim() || '/'
  return path.startsWith('/') ? path : `/${path}`
}

export const deriveCrawlPathScope = (rootUrl: string): string => {
  try {
    const u = new URL(rootUrl)
    const path = normalizePathname(u.pathname)
    if (path === '/') return '/'
    const parts = path.split('/').filter(Boolean)
    if (parts.length === 0) return '/'
    const leaf = parts[parts.length - 1] || ''
    if (parts.length > 1 || /\.[a-z0-9]{1,12}$/i.test(leaf)) {
      parts.pop()
    }
    if (parts.length === 0) return '/'
    return `/${parts.join('/')}/`
  } catch {
    return '/'
  }
}

export const isWithinCrawlPathScope = (candidateUrl: string, rootUrl: string): boolean => {
  try {
    const scope = deriveCrawlPathScope(rootUrl)
    if (scope === '/') return true
    const path = normalizePathname(new URL(candidateUrl).pathname)
    const exact = scope.replace(/\/+$/, '') || '/'
    return path === exact || path.startsWith(scope)
  } catch {
    return false
  }
}

export const isCrawlableInternalUrl = (candidateUrl: string, rootUrl: string): boolean => {
  const normalized = normalizeUrl(candidateUrl)
  if (!normalized) return false
  if (!isSameHost(normalized, rootUrl)) return false
  if (!isWithinCrawlPathScope(normalized, rootUrl)) return false
  try {
    const u = new URL(normalized)
    const path = normalizePathname(u.pathname)
    const lowerPath = path.toLowerCase()
    if (NON_DOCUMENT_PATH_PREFIXES.some(prefix => lowerPath.startsWith(prefix))) return false
    const leaf = lowerPath.split('/').pop() || ''
    const ext = leaf.includes('.') ? leaf.split('.').pop() || '' : ''
    if (ext && NON_DOCUMENT_EXTENSIONS.has(ext)) return false
  } catch {
    return false
  }
  return true
}

const decodeUrlToken = (raw: string): string => String(raw || '')
  .replace(/\\u002f/gi, '/')
  .replace(/\\\//g, '/')
  .replace(/&amp;/gi, '&')
  .trim()

const resolveCrawlCandidate = (raw: string, baseUrl: string, rootUrl: string): string | null => {
  const cleaned = decodeUrlToken(raw)
    .replace(/^[\s"'`]+/, '')
    .replace(/[\s"'`,.;)]+$/, '')
  if (!cleaned || cleaned.startsWith('#')) return null
  if (/^(javascript|data|mailto|tel|blob):/i.test(cleaned)) return null
  try {
    const u = new URL(cleaned, baseUrl)
    u.hash = ''
    const normalized = normalizeUrl(u.toString())
    if (!normalized || !isCrawlableInternalUrl(normalized, rootUrl)) return null
    return normalized
  } catch {
    return null
  }
}

export const extractInternalUrlCandidatesFromHtml = (html: string, baseUrl: string, rootUrl?: string): string[] => {
  const root = normalizeUrl(rootUrl || baseUrl) || normalizeUrl(baseUrl)
  if (!root) return []
  const body = String(html || '')
  if (!body.trim()) return []
  const scan = decodeUrlToken(body.length > 5_000_000 ? body.slice(0, 5_000_000) : body)
  const out: string[] = []
  const seen = new Set<string>()
  const push = (raw: string) => {
    const resolved = resolveCrawlCandidate(raw, baseUrl, root)
    if (!resolved || seen.has(resolved)) return
    seen.add(resolved)
    out.push(resolved)
  }

  const attrRe = /\b(?:href|data-href|to|url)\s*=\s*(["'])([^"']+)\1/gi
  let m: RegExpExecArray | null
  while ((m = attrRe.exec(scan))) push(String(m[2] || ''))

  const tokenRe = /["'`]\s*((?:https?:\/\/|\/\/|\/)[^"'`<>{}\s]{1,2000})\s*["'`]/gi
  while ((m = tokenRe.exec(scan))) push(String(m[1] || ''))

  return out
}

export const urlToTreePath = (urlRaw: string): string => {
  try {
    const u = new URL(urlRaw)
    const p = u.pathname || '/'
    if (p === '/' || p.trim() === '') return '/'
    return p
  } catch {
    return '/'
  }
}

export { fetchCrawlerTextWithLimit as fetchTextWithLimit } from './crawlerNetworkPolicy'

export const __testkit = {
  extractXmlLocs,
  looksLikeSitemapIndex,
  urlToTreePath,
  normalizeUrl,
  isSameHost,
  deriveCrawlPathScope,
  isWithinCrawlPathScope,
  isCrawlableInternalUrl,
  extractInternalUrlCandidatesFromHtml,
}
