import fs from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { deriveCrawlPathScope, extractXmlLocs, extractInternalUrlCandidatesFromHtml, fetchTextWithLimit, isCrawlableInternalUrl, looksLikeSitemapIndex, normalizeUrl, safeJsonParse, urlToTreePath } from './websiteImportCore'

export const extractTitleFromHtml = (html: string): string => {
  const raw = String(html || '')
  const m = raw.match(/<title\b[^>]*>([\s\S]*?)<\/title\s*>/i)
  const t = m ? String(m[1] || '') : ''
  return t.replace(/\s+/g, ' ').trim()
}

export const isHttpUrl = (raw: string): boolean => /^https?:\/\//i.test(String(raw || '').trim())
export const WEBSITE_IMPORT_PAGE_MAX_BYTES = 32 * 1024 * 1024, WEBSITE_IMPORT_DISCOVERY_MAX_BYTES = 4 * 1024 * 1024

export const posixPathFromFsAbs = (absPath: string): string => String(absPath || '').replace(/\\/g, '/').replace(/^\/+/, '')

export const resolveLocalInputPath = async (repoRoot: string, raw: string): Promise<{ ok: true; abs: string; rel: string } | { ok: false; error: string }> => {
  const trimmed = String(raw || '').trim()
  if (!trimmed) return { ok: false, error: 'Missing local path' }
  const normalized = trimmed.replace(/\\/g, '/').replace(/^file:\/\//i, '').replace(/^\.+\//, '').replace(/^\/+/, '')
  if (!normalized || normalized.includes('..')) return { ok: false, error: 'Invalid local path' }
  const rootAbs = path.resolve(repoRoot)
  const abs = path.resolve(rootAbs, normalized)
  if (!abs.startsWith(rootAbs + path.sep) && abs !== rootAbs) return { ok: false, error: 'Local path escapes repo root' }
  try {
    const stat = await fs.stat(abs)
    if (!stat.isFile() && !stat.isDirectory()) return { ok: false, error: 'Not found' }
  } catch {
    return { ok: false, error: 'Not found' }
  }
  return { ok: true, abs, rel: posixPathFromFsAbs(path.relative(rootAbs, abs)) }
}

export const toTreePath = (rootKind: 'http' | 'local', value: string, localRootRel?: string): string => {
  if (rootKind === 'http') return urlToTreePath(value)
  const localRoot = String(localRootRel || '').replace(/\\/g, '/').replace(/\/+$/, '').replace(/^\/+/, '')
  const rel = String(value || '').replace(/\\/g, '/').replace(/^\/+/, '')
  const withoutRoot = localRoot && rel.startsWith(localRoot + '/') ? rel.slice(localRoot.length + 1) : rel
  return `/${withoutRoot || ''}`
}

export const readLocalTextWithLimit = async (fileAbs: string, maxBytes: number): Promise<{ ok: true; text: string } | { ok: false; error: string }> => {
  try {
    const stat = await fs.stat(fileAbs)
    if (!stat.isFile()) return { ok: false, error: 'Not found' }
    if (stat.size > maxBytes) return { ok: false, error: 'File too large' }
    const text = await fs.readFile(fileAbs, 'utf8')
    return { ok: true, text }
  } catch {
    return { ok: false, error: 'Not found' }
  }
}

export const listLocalHtmlFiles = async (rootAbs: string, maxPages: number): Promise<string[]> => {
  const out: string[] = []
  const queue: string[] = [rootAbs]
  const rootResolved = path.resolve(rootAbs)
  const skipDirs = new Set(['node_modules', '.git', '.agentic-graph-workspace', 'agentic-graph-workspace', 'dist', 'build', 'out', '.next', '.cache'])
  while (queue.length && out.length < maxPages) {
    const dir = queue.shift() as string
    let entries: Array<import('node:fs').Dirent> = []
    try {
      entries = await fs.readdir(dir, { withFileTypes: true })
    } catch {
      continue
    }
    for (const ent of entries) {
      if (out.length >= maxPages) break
      const name = ent.name
      if (!name || name.startsWith('.')) continue
      const abs = path.resolve(dir, name)
      if (!abs.startsWith(rootResolved + path.sep) && abs !== rootResolved) continue
      if (ent.isDirectory()) {
        if (skipDirs.has(name)) continue
        queue.push(abs)
        continue
      }
      if (!ent.isFile()) continue
      const lower = name.toLowerCase()
      if (lower.endsWith('.html') || lower.endsWith('.htm')) out.push(abs)
    }
  }
  return out
}

export const readJsonFile = async <T,>(filePath: string): Promise<T | null> => {
  try {
    const raw = await fs.readFile(filePath, 'utf8')
    return safeJsonParse<T>(raw)
  } catch {
    return null
  }
}

export const writeJsonFileAtomic = async (filePath: string, value: unknown): Promise<void> => {
  const dir = path.dirname(filePath)
  await fs.mkdir(dir, { recursive: true })
  const tmp = `${filePath}.${randomUUID()}.tmp`
  await fs.writeFile(tmp, JSON.stringify(value, null, 2), 'utf8')
  await fs.rename(tmp, filePath)
}

const sitemapCandidates = (rootUrl: string): string[] => {
  const origin = new URL(rootUrl).origin
  return [...new Set([`${origin}${deriveCrawlPathScope(rootUrl)}sitemap.xml`, ...[
    '/sitemap.xml', '/sitemap_index.xml', '/sitemap.xml.gz', '/wp-sitemap.xml', '/sitemap',
  ].map(pathname => origin + pathname)])]
}

export const discoverSitemapUrl = async (rootUrl: string): Promise<string | null> => {
  const origin = (() => {
    try {
      return new URL(rootUrl).origin
    } catch {
      return ''
    }
  })()
  if (!origin) return null

  for (const u of sitemapCandidates(rootUrl)) {
    const res = await fetchTextWithLimit(u, { timeoutMs: 18_000, maxBytes: 2 * 1024 * 1024, accept: 'application/xml,text/xml;q=0.9,*/*;q=0.8' })
    if (!res.ok) continue
    const t = String(res.text || '')
    if (/<(?:[\w.-]+:)?urlset\b/i.test(t) || looksLikeSitemapIndex(t)) return u
  }

  return `${origin}/sitemap.xml`
}

export const crawlInternalUrls = async (args: {
  rootUrl: string
  seedUrls: string[]
  maxPages: number
  timeoutMs: number
  maxBytes: number
}): Promise<string[]> => {
  const root = normalizeUrl(args.rootUrl)
  if (!root) return []

  const maxPages = Math.max(1, Math.min(500, Math.floor(args.maxPages)))
  const visited = new Set<string>()
  const queue: string[] = []
  const enqueue = (candidate: string) => {
    const normalized = normalizeUrl(candidate)
    if (!normalized) return
    if (!isCrawlableInternalUrl(normalized, root)) return
    if (visited.has(normalized)) return
    visited.add(normalized)
    queue.push(normalized)
  }

  enqueue(root)
  for (const u of args.seedUrls) enqueue(u)

  const out: string[] = []
  let fetched = 0
  const fetchLimit = Math.max(6, Math.min(120, maxPages * 3))
  let queueIdx = 0

  while (queueIdx < queue.length && out.length < maxPages && fetched < fetchLimit) {
    const u = queue[queueIdx] as string
    queueIdx += 1
    out.push(u)
    fetched += 1

    const htmlRes = await fetchTextWithLimit(u, { timeoutMs: args.timeoutMs, maxBytes: args.maxBytes, accept: 'text/html,*/*;q=0.9' })
    if (!htmlRes.ok) continue
    const html = String(htmlRes.text || '')
    for (const href of extractInternalUrlCandidatesFromHtml(html, u, root)) {
      enqueue(href)
      if (visited.size >= maxPages) break
    }
  }

  return out
}

export const collectSitemapUrls = async (rootUrl: string, sitemapUrl: string, opts: {
  timeoutMs: number; maxBytes: number; maxSitemaps: number; discover?: boolean; maxUrls?: number; signal?: AbortSignal
}): Promise<{ ok: true; urls: string[]; limited: boolean } | { ok: false; error: string }> => {
  const origin = new URL(rootUrl).origin
  const maxUrls = Math.max(1, Math.min(2_000, opts.maxUrls ?? 2_000))
  const maxRequests = Math.max(1, Math.min(24, opts.maxSitemaps))
  const deadline = AbortSignal.timeout(opts.discover ? 12_000 : Math.min(120_000, opts.timeoutMs * maxRequests))
  const signal = opts.signal ? AbortSignal.any([opts.signal, deadline]) : deadline
  const queue: Array<{ url: string; required: boolean }> = []
  const visited = new Set<string>(), pages = new Set<string>()
  let limited = false, requests = 0, bytesLeft = 8 * 1024 * 1024
  const withinOrigin = (raw: string, base = rootUrl): string | null => {
    try {
      const url = new URL(raw, base)
      return url.origin === origin && !url.username && !url.password ? normalizeUrl(url.toString()) : null
    } catch { return null }
  }
  const enqueue = (raw: string, required: boolean, base = rootUrl) => {
    const url = withinOrigin(raw, base)
    if (!url || url.length > 4096 || visited.has(url)) return
    if (visited.size >= maxRequests) { limited = true; return }
    visited.add(url)
    // Published references take precedence over conventional fallback locations.
    if (required) queue.unshift({ url, required }); else queue.push({ url, required })
  }
  const read = async (url: string, maxBytes = opts.maxBytes) => {
    requests += 1
    const result = await fetchTextWithLimit(url, { timeoutMs: opts.timeoutMs, maxBytes: Math.min(maxBytes, bytesLeft),
      signal, allowedOrigin: origin, onBytes: bytes => { bytesLeft -= bytes }, accept: 'application/xml,text/xml,text/plain;q=0.9,*/*;q=0.5' })
    opts.signal?.throwIfAborted()
    return result
  }
  if (opts.discover) {
    const robots = await read(`${origin}/robots.txt`, 256 * 1024)
    if (robots.ok === true) {
      for (const line of robots.text.split(/\r?\n/)) {
        const match = /^\s*Sitemap:\s*(\S+)/i.exec(line)
        if (match) enqueue(match[1], true)
      }
    } else if (!/^HTTP (404|410)$/.test(robots.error)) limited = true
    enqueue(sitemapUrl, false)
    sitemapCandidates(rootUrl).forEach(url => enqueue(url, false))
  } else enqueue(sitemapUrl, true)
  while (queue.length && requests < maxRequests && bytesLeft > 0 && !signal.aborted) {
    const current = queue.shift()!
    const result = await read(current.url)
    if (result.ok !== true) {
      if (!opts.discover && requests === 1) return result
      if (current.required || !/^HTTP (404|410)$/.test(result.error)) limited = true
      continue
    }
    const index = looksLikeSitemapIndex(result.text)
    if (!index && !/<(?:[\w.-]+:)?urlset\b/i.test(result.text)) {
      if (current.required) limited = true
      continue
    }
    for (const raw of extractXmlLocs(result.text)) {
      const url = withinOrigin(raw, current.url)
      if (!url || url.length > 4096) continue
      // Some publishers list child XML sitemaps inside a urlset, not an index.
      if (index || /\.xml(?:\.gz)?$/i.test(new URL(url).pathname)) { enqueue(url, true); continue }
      if (!isCrawlableInternalUrl(url, rootUrl) || pages.has(url)) continue
      if (pages.size === maxUrls) { limited = true; break }
      pages.add(url)
    }
    if (pages.size === maxUrls) { limited ||= queue.length > 0; break }
  }
  opts.signal?.throwIfAborted()
  return { ok: true, urls: [...pages], limited: limited || queue.length > 0 || signal.aborted }
}

export const sanitizeImportId = (raw: string): string | null => {
  const s = String(raw || '').trim()
  if (!s) return null
  if (!/^[a-zA-Z0-9._-]+$/.test(s)) return null
  if (s.length > 96) return null
  return s
}
