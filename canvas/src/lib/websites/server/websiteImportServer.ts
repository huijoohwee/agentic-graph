import fs from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import {
  clampInt,
  extractXmlLocs,
  extractInternalUrlCandidatesFromHtml,
  fetchTextWithLimit,
  hashHex,
  isCrawlableInternalUrl,
  looksLikeSitemapIndex,
  normalizeUrl,
  safeJsonParse,
  urlToTreePath,
} from './websiteImportCore'
import { NativeWebsiteCrawler } from './nativeWebsiteCrawler'
import { handleWebsiteImportArtifact } from './websiteImportArtifactServer'
import type {
  WebsiteImportManifestV1,
  WebsiteImportNode,
  WebsiteImportOptions,
  WebsiteImportProgress,
  WebsiteImportRuntime,
} from './websiteImportTypes'
import { buildWebsiteSemanticSnapshotFromHtml } from '../websiteSemanticSnapshot'
import { resolveWebsiteImportGenerationToken, resolveWebsiteImportWorkspaceRoot } from './websiteImportStorage'

const extractTitleFromHtml = (html: string): string => {
  const raw = String(html || '')
  const m = raw.match(/<title\b[^>]*>([\s\S]*?)<\/title\s*>/i)
  const t = m ? String(m[1] || '') : ''
  return t.replace(/\s+/g, ' ').trim()
}

const isHttpUrl = (raw: string): boolean => /^https?:\/\//i.test(String(raw || '').trim())
const WEBSITE_IMPORT_PAGE_MAX_BYTES = 32 * 1024 * 1024, WEBSITE_IMPORT_DISCOVERY_MAX_BYTES = 4 * 1024 * 1024

const posixPathFromFsAbs = (absPath: string): string => String(absPath || '').replace(/\\/g, '/').replace(/^\/+/, '')

const resolveLocalInputPath = async (repoRoot: string, raw: string): Promise<{ ok: true; abs: string; rel: string } | { ok: false; error: string }> => {
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

const toTreePath = (rootKind: 'http' | 'local', value: string, localRootRel?: string): string => {
  if (rootKind === 'http') return urlToTreePath(value)
  const localRoot = String(localRootRel || '').replace(/\\/g, '/').replace(/\/+$/, '').replace(/^\/+/, '')
  const rel = String(value || '').replace(/\\/g, '/').replace(/^\/+/, '')
  const withoutRoot = localRoot && rel.startsWith(localRoot + '/') ? rel.slice(localRoot.length + 1) : rel
  return `/${withoutRoot || ''}`
}

const readLocalTextWithLimit = async (fileAbs: string, maxBytes: number): Promise<{ ok: true; text: string } | { ok: false; error: string }> => {
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

const listLocalHtmlFiles = async (rootAbs: string, maxPages: number): Promise<string[]> => {
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

const readJsonFile = async <T,>(filePath: string): Promise<T | null> => {
  try {
    const raw = await fs.readFile(filePath, 'utf8')
    return safeJsonParse<T>(raw)
  } catch {
    return null
  }
}

const writeJsonFileAtomic = async (filePath: string, value: unknown): Promise<void> => {
  const dir = path.dirname(filePath)
  await fs.mkdir(dir, { recursive: true })
  const tmp = `${filePath}.${randomUUID()}.tmp`
  await fs.writeFile(tmp, JSON.stringify(value, null, 2), 'utf8')
  await fs.rename(tmp, filePath)
}

const discoverSitemapUrl = async (rootUrl: string): Promise<string | null> => {
  const origin = (() => {
    try {
      return new URL(rootUrl).origin
    } catch {
      return ''
    }
  })()
  if (!origin) return null

  const candidates = [
    `${origin}/sitemap.xml`,
    `${origin}/sitemap_index.xml`,
    `${origin}/sitemap.xml.gz`,
    `${origin}/wp-sitemap.xml`,
    `${origin}/sitemap`,
  ]

  for (const u of candidates) {
    const res = await fetchTextWithLimit(u, { timeoutMs: 18_000, maxBytes: 2 * 1024 * 1024, accept: 'application/xml,text/xml;q=0.9,*/*;q=0.8' })
    if (!res.ok) continue
    const t = String(res.text || '')
    if (/<urlset\b/i.test(t) || /<sitemapindex\b/i.test(t)) return u
  }

  return `${origin}/sitemap.xml`
}

const crawlInternalUrls = async (args: {
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

const collectSitemapUrls = async (rootUrl: string, sitemapUrl: string, opts: { timeoutMs: number; maxBytes: number; maxSitemaps: number }): Promise<{ ok: true; urls: string[] } | { ok: false; error: string }> => {
  const first = await fetchTextWithLimit(sitemapUrl, { timeoutMs: opts.timeoutMs, maxBytes: opts.maxBytes, accept: 'application/xml,text/xml;q=0.9,*/*;q=0.8' })
  if (first.ok !== true) return { ok: false, error: first.error }

  const visited = new Set<string>()
  const urls: string[] = []
  const enqueue = (candidate: string) => {
    const normalized = normalizeUrl(candidate)
    if (!normalized) return
    if (!isCrawlableInternalUrl(normalized, rootUrl)) return
    if (visited.has(normalized)) return
    visited.add(normalized)
    urls.push(normalized)
  }

  const childSitemaps = looksLikeSitemapIndex(first.text) ? extractXmlLocs(first.text) : []
  if (childSitemaps.length > 0) {
    const queue = childSitemaps.slice(0, opts.maxSitemaps)
    for (const child of queue) {
      const res = await fetchTextWithLimit(child, { timeoutMs: opts.timeoutMs, maxBytes: opts.maxBytes, accept: 'application/xml,text/xml;q=0.9,*/*;q=0.8' })
      if (!res.ok) continue
      for (const loc of extractXmlLocs(res.text)) enqueue(loc)
    }
  } else {
    for (const loc of extractXmlLocs(first.text)) enqueue(loc)
  }

  return { ok: true, urls }
}

const sanitizeImportId = (raw: string): string | null => {
  const s = String(raw || '').trim()
  if (!s) return null
  if (!/^[a-zA-Z0-9._-]+$/.test(s)) return null
  if (s.length > 96) return null
  return s
}

type StartResponse = { ok: true; importId: string } | { ok: false; error: string }

const jobs = new Map<string, { startedAtMs: number; manifest?: WebsiteImportManifestV1 }>()

export function createWebsiteImportHandler(args: { repoRoot: string }): import('vite').Connect.NextHandleFunction {
  return async (req, res, next) => {
    const rawUrl = String(req.url || '')
    if (!rawUrl.startsWith('/__website_import')) {
      next()
      return
    }

    const base = `http://${req.headers.host || 'localhost'}`
    const parsed = new URL(rawUrl, base)
    const pathname = parsed.pathname
    const workspaceResolved = resolveWebsiteImportWorkspaceRoot({ repoRoot: args.repoRoot, outputDirRel: parsed.searchParams.get('outputDirRel') })
    if (workspaceResolved.ok !== true) {
      res.statusCode = 400
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ ok: false, error: workspaceResolved.error }))
      return
    }
    const workspaceAbs = workspaceResolved.abs

    if (req.method === 'GET' && pathname === '/__website_import/manifest') {
      const importId = sanitizeImportId(parsed.searchParams.get('importId') || '')
      if (!importId) {
        res.statusCode = 400
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ ok: false, error: 'Missing importId' }))
        return
      }
      const manifestPathAbs = path.join(workspaceAbs, importId, 'manifest.json')
      const manifest = await readJsonFile<WebsiteImportManifestV1>(manifestPathAbs)
      if (!manifest) {
        res.statusCode = 404
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ ok: false, error: 'Not found' }))
        return
      }
      res.statusCode = 200
      res.setHeader('Content-Type', 'application/json')
      res.setHeader('Cache-Control', 'no-store')
      res.end(JSON.stringify({ ok: true, manifest }))
      return
    }

    if (req.method === 'GET' && pathname === '/__website_import/artifact') {
      await handleWebsiteImportArtifact({ workspaceAbs, parsed, res, readManifest: readJsonFile })
      return
    }

    if (req.method === 'POST' && pathname === '/__website_import/import-url') {
      const chunks: Buffer[] = []
      await new Promise<void>((resolve) => {
        req.on('data', (c: Buffer) => chunks.push(c))
        req.on('end', () => resolve())
        req.on('error', () => resolve())
      })
      const bodyRaw = Buffer.concat(chunks).toString('utf8')
      const body = safeJsonParse<{ url?: unknown; options?: unknown }>(bodyRaw) || {}
      const pageUrlRaw = typeof body.url === 'string' ? body.url : ''
      const pageUrlHttp = normalizeUrl(pageUrlRaw)
      const pageUrlLocal = pageUrlHttp ? null : await resolveLocalInputPath(args.repoRoot, pageUrlRaw)
      const pageUrl = pageUrlHttp ? pageUrlHttp : pageUrlLocal && pageUrlLocal.ok === true ? pageUrlLocal.rel : ''
      if (!pageUrl) {
        res.statusCode = 400
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ ok: false, error: 'Missing or invalid url' }))
        return
      }

      const opt = (body.options && typeof body.options === 'object' ? (body.options as Record<string, unknown>) : {})
      void opt
      const importId = resolveWebsiteImportGenerationToken(opt.generationToken)
      const nodeId = hashHex(pageUrl).slice(0, 24)
      const importDirAbs = path.join(workspaceAbs, importId)
      const nodeDirAbs = path.join(importDirAbs, 'nodes', nodeId)
      const manifestPathAbs = path.join(importDirAbs, 'manifest.json')
      const errors: Array<{ url: string; error: string }> = []

      try {
        await fs.mkdir(nodeDirAbs, { recursive: true })

        const rawHtmlRes = pageUrlHttp
          ? await fetchTextWithLimit(pageUrlHttp, {
              timeoutMs: 30_000,
              maxBytes: WEBSITE_IMPORT_PAGE_MAX_BYTES,
              accept: 'text/html,*/*;q=0.9',
            })
          : pageUrlLocal && pageUrlLocal.ok === true
            ? await readLocalTextWithLimit(pageUrlLocal.abs, WEBSITE_IMPORT_PAGE_MAX_BYTES)
            : { ok: false as const, error: 'Not found' }
        if (rawHtmlRes.ok !== true) {
          errors.push({ url: pageUrl, error: rawHtmlRes.error })
        } else {
          const html = String(rawHtmlRes.text || '')
          try {
            await fs.writeFile(path.join(nodeDirAbs, 'raw.html'), html, 'utf8')
          } catch {
            void 0
          }
        }

        const importedRawHtml = rawHtmlRes.ok === true ? String(rawHtmlRes.text || '') : ''
        const title = importedRawHtml ? extractTitleFromHtml(importedRawHtml) : ''

        const node: WebsiteImportNode = {
          nodeId,
          url: pageUrl,
          path: toTreePath(pageUrlHttp ? 'http' : 'local', pageUrl),
          title: title || undefined,
          status: errors.length > 0 ? 'error' : 'ok',
          artifacts: importedRawHtml
            ? { rawHtmlRelPath: path.posix.join(workspaceResolved.rel, importId, 'nodes', nodeId, 'raw.html'), rawHtmlBytes: Buffer.byteLength(importedRawHtml, 'utf8'), rawHtmlSha256: hashHex(importedRawHtml) }
            : {},
        }

        const manifest: WebsiteImportManifestV1 = {
          version: 1,
          importId,
          rootUrl: pageUrl,
          status: errors.length > 0 ? 'failed' : 'done',
          startedAtMs: Date.now(),
          finishedAtMs: Date.now(),
          nodes: [node],
          errors,
        }
        await writeJsonFileAtomic(manifestPathAbs, manifest)
        res.statusCode = errors.length > 0 ? 400 : 200
        res.setHeader('Content-Type', 'application/json')
        res.setHeader('Cache-Control', 'no-store')
        res.end(JSON.stringify({ ok: errors.length === 0, importId, nodeId, url: pageUrl, error: errors[0]?.error }))
        return
      } catch (e) {
        const msg = e && typeof e === 'object' && 'message' in e ? String((e as { message?: unknown }).message || '') : ''
        res.statusCode = 500
        res.setHeader('Content-Type', 'application/json')
        res.setHeader('Cache-Control', 'no-store')
        res.end(JSON.stringify({ ok: false, error: msg || 'Import failed' }))
        return
      }
    }

    if (req.method === 'POST' && pathname === '/__website_import/start') {
      const chunks: Buffer[] = []
      await new Promise<void>((resolve) => {
        req.on('data', (c: Buffer) => chunks.push(c))
        req.on('end', () => resolve())
        req.on('error', () => resolve())
      })
      const bodyRaw = Buffer.concat(chunks).toString('utf8')
      const body = safeJsonParse<{ url?: unknown; options?: unknown }>(bodyRaw) || {}
      const rootInput = typeof body.url === 'string' ? body.url : ''
      const rootUrlHttp = normalizeUrl(rootInput)
      const rootLocalResolved = rootUrlHttp ? null : await resolveLocalInputPath(args.repoRoot, rootInput)
      const rootKind: 'http' | 'local' = rootUrlHttp ? 'http' : 'local'
      const rootUrl = await (async () => {
        if (rootUrlHttp) return rootUrlHttp
        if (!rootLocalResolved || rootLocalResolved.ok !== true) return ''
        try {
          const st = await fs.stat(rootLocalResolved.abs)
          if (!st.isFile()) return rootLocalResolved.rel
          const parts = rootLocalResolved.rel.split('/').filter(Boolean)
          if (parts.length <= 1) return rootLocalResolved.rel
          return parts.slice(0, -1).join('/')
        } catch {
          return rootLocalResolved.rel
        }
      })()
      if (!rootUrl) {
        res.statusCode = 400
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ ok: false, error: 'Missing or invalid url' }))
        return
      }
      const opt = (body.options && typeof body.options === 'object' ? (body.options as Record<string, unknown>) : {})
      const options: WebsiteImportOptions = {
        discoverSitemap: opt.discoverSitemap !== false,
        sitemapUrl: typeof opt.sitemapUrl === 'string' ? opt.sitemapUrl : undefined,
        maxPages: clampInt(opt.maxPages, 50, 1, 500),
        concurrency: clampInt(opt.concurrency, 4, 1, 12),
        includeImages: opt.includeImages !== false,
        generateMarkdownArtifacts: opt.generateMarkdownArtifacts === true,
        outputDirRel: typeof opt.outputDirRel === 'string' ? opt.outputDirRel : undefined,
        browserMode: rootKind === 'http' && opt.browserMode === 'headless' ? 'headless' : 'http',
        proxyRotation: opt.proxyRotation === true,
        downloadAssets: opt.downloadAssets === true,
        maxDownloads: clampInt(opt.maxDownloads, 120, 1, 500),
        maxDownloadBytes: clampInt(opt.maxDownloadBytes, 250 * 1024 * 1024, 1024 * 1024, 1024 * 1024 * 1024),
        generationToken: typeof opt.generationToken === 'string' ? opt.generationToken : undefined,
      }

      const nativeCrawler = options.browserMode === 'headless'
        ? new NativeWebsiteCrawler({
            concurrency: options.concurrency || 4,
            proxyRotation: options.proxyRotation === true,
            downloadAssets: options.downloadAssets === true,
            maxDownloads: options.maxDownloads || 120,
            maxDownloadBytes: options.maxDownloadBytes || 250 * 1024 * 1024,
          })
        : null
      const runtime: WebsiteImportRuntime = nativeCrawler?.runtime || {
        engine: 'http',
        headless: false,
        proxyMode: 'direct',
        proxyPoolSize: 0,
        downloadAssets: false,
        maxDownloads: 0,
        maxDownloadBytes: 0,
      }

      const importId = resolveWebsiteImportGenerationToken(options.generationToken)
      const importDirAbs = path.join(workspaceAbs, importId)
      const manifestPathAbs = path.join(importDirAbs, 'manifest.json')
      const existingManifest = await readJsonFile<WebsiteImportManifestV1>(manifestPathAbs)
      const existingProgressUpdatedAtMs = existingManifest?.progress?.updatedAtMs || existingManifest?.startedAtMs || 0
      const existingRunIsFresh = Boolean(
        existingManifest
        && existingManifest.rootUrl === rootUrl
        && (existingManifest.status === 'queued' || existingManifest.status === 'running')
        && Date.now() - existingProgressUpdatedAtMs < 2 * 60_000,
      )
      if (existingManifest?.rootUrl === rootUrl && (existingManifest.status === 'done' || existingRunIsFresh)) {
        const out: StartResponse = { ok: true, importId }
        res.statusCode = 200
        res.setHeader('Content-Type', 'application/json')
        res.setHeader('Cache-Control', 'no-store')
        res.end(JSON.stringify(out))
        return
      }
      const initialProgress: WebsiteImportProgress = {
        stage: 'queued',
        total: 0,
        processed: 0,
        ok: 0,
        error: 0,
        queued: 0,
        updatedAtMs: Date.now(),
      }
      const initial: WebsiteImportManifestV1 = {
        version: 1,
        importId,
        rootUrl,
        status: 'queued',
        startedAtMs: Date.now(),
        progress: initialProgress,
        runtime,
        nodes: [],
        errors: [],
      }
      await writeJsonFileAtomic(manifestPathAbs, initial)

      jobs.set(importId, { startedAtMs: Date.now(), manifest: initial })
      void (async () => {
        let manifestState: WebsiteImportManifestV1 = { ...initial }
        let writing: Promise<void> | null = null
        let lastWriteAtMs = 0
        let pending: NodeJS.Timeout | null = null

        const mergeManifest = (next: Partial<WebsiteImportManifestV1>) => {
          manifestState = {
            ...manifestState,
            ...next,
            version: 1,
            importId,
            rootUrl,
            progress: next.progress ? next.progress : manifestState.progress,
            nodes: Array.isArray(next.nodes) ? next.nodes : manifestState.nodes,
            errors: Array.isArray(next.errors) ? next.errors : manifestState.errors,
          }
          const job = jobs.get(importId)
          if (job) job.manifest = manifestState
        }

        const flushManifestWrite = async () => {
          if (pending) {
            clearTimeout(pending)
            pending = null
          }
          if (writing) {
            try {
              await writing
            } catch {
              void 0
            }
          }
          lastWriteAtMs = Date.now()
          const snapshot = manifestState
          writing = writeJsonFileAtomic(manifestPathAbs, snapshot)
          await writing
          writing = null
        }

        const scheduleManifestWrite = () => {
          const now = Date.now()
          const waitMs = Math.max(0, 500 - (now - lastWriteAtMs))
          if (!pending) {
            pending = setTimeout(() => {
              pending = null
              void flushManifestWrite()
            }, waitMs)
          }
        }

        const updateManifest = async (next: Partial<WebsiteImportManifestV1>, opts?: { flush?: boolean }) => {
          mergeManifest(next)
          if (opts?.flush) {
            await flushManifestWrite()
            return
          }
          scheduleManifestWrite()
        }

        try {
          await fs.mkdir(path.join(importDirAbs, 'nodes'), { recursive: true })
          await updateManifest({ status: 'running', progress: { ...initialProgress, stage: 'discovering', updatedAtMs: Date.now() } }, { flush: true })

          const errors: Array<{ url: string; error: string }> = []
          const repoRootAbs = path.resolve(args.repoRoot)
          const localRootAbs = rootKind === 'local' && rootLocalResolved && rootLocalResolved.ok === true ? rootLocalResolved.abs : ''
          const localSiteRootAbs = rootKind === 'local'
            ? (async () => {
                if (!localRootAbs) return ''
                try {
                  const st = await fs.stat(localRootAbs)
                  return st.isDirectory() ? localRootAbs : path.dirname(localRootAbs)
                } catch {
                  return ''
                }
              })()
            : ''
          const localSiteRootAbsResolved = rootKind === 'local' ? await localSiteRootAbs : ''
          const localSiteRootRel = rootKind === 'local' && localSiteRootAbsResolved
            ? posixPathFromFsAbs(path.relative(repoRootAbs, localSiteRootAbsResolved))
            : ''

          let sitemapUrlForManifest: string | undefined
          const limited = await (async (): Promise<string[]> => {
            if (rootKind === 'http') {
              if (nativeCrawler) {
                await updateManifest({ progress: { ...initialProgress, stage: 'crawling', updatedAtMs: Date.now() } })
                return [rootUrl]
              }
              const explicitSitemap = normalizeUrl(options.sitemapUrl || '')
              const discovered = explicitSitemap ? explicitSitemap : options.discoverSitemap ? await discoverSitemapUrl(rootUrl) : null
              const effectiveSitemap = discovered ? normalizeUrl(discovered) : null
              sitemapUrlForManifest = effectiveSitemap || undefined

              const sitemapRes: { ok: true; urls: string[] } | { ok: false; error: string } = effectiveSitemap
                ? await collectSitemapUrls(rootUrl, effectiveSitemap, { timeoutMs: 30_000, maxBytes: 3 * 1024 * 1024, maxSitemaps: 30 })
                : { ok: true, urls: [] }
              const urls = sitemapRes.ok ? sitemapRes.urls : []
              await updateManifest({ progress: { ...initialProgress, stage: 'crawling', updatedAtMs: Date.now() } })
              const crawled = await crawlInternalUrls({
                rootUrl,
                seedUrls: urls,
                maxPages: options.maxPages || 50,
                timeoutMs: 30_000,
                maxBytes: WEBSITE_IMPORT_DISCOVERY_MAX_BYTES,
              })
              const combined = (() => {
                const out: string[] = []
                const seen = new Set<string>()
                for (const u of [...urls, ...crawled]) {
                  const n = normalizeUrl(u)
                  if (!n) continue
                  if (seen.has(n)) continue
                  seen.add(n)
                  out.push(n)
                }
                return out
              })()
              if (sitemapRes.ok !== true && effectiveSitemap) errors.push({ url: effectiveSitemap, error: sitemapRes.error })
              return combined.slice(0, options.maxPages || 50)
            }

            if (!localSiteRootAbsResolved) return []
            await updateManifest({ progress: { ...initialProgress, stage: 'crawling', updatedAtMs: Date.now() } })

            const explicitLocalSitemap = options.sitemapUrl && !isHttpUrl(options.sitemapUrl)
              ? await resolveLocalInputPath(args.repoRoot, options.sitemapUrl)
              : null
            const discoveredLocalSitemap = options.discoverSitemap
              ? (async () => {
                  const candidates = ['sitemap.xml', 'sitemap_index.xml', 'wp-sitemap.xml']
                  for (const name of candidates) {
                    const abs = path.join(localSiteRootAbsResolved, name)
                    try {
                      const st = await fs.stat(abs)
                      if (st.isFile()) return abs
                    } catch {
                      void 0
                    }
                  }
                  return ''
                })()
              : ''
            const localSitemapAbs = explicitLocalSitemap && explicitLocalSitemap.ok === true
              ? explicitLocalSitemap.abs
              : discoveredLocalSitemap
                ? await discoveredLocalSitemap
                : ''
            sitemapUrlForManifest = localSitemapAbs ? posixPathFromFsAbs(path.relative(repoRootAbs, localSitemapAbs)) : undefined

            const sitemapUrls = await (async () => {
              if (!localSitemapAbs) return [] as string[]
              const xmlRes = await readLocalTextWithLimit(localSitemapAbs, 3 * 1024 * 1024)
              if (xmlRes.ok !== true) {
                errors.push({ url: posixPathFromFsAbs(path.relative(repoRootAbs, localSitemapAbs)), error: xmlRes.error })
                return []
              }
              const locs = extractXmlLocs(xmlRes.text)
              const out: string[] = []
              for (const loc of locs) {
                const http = normalizeUrl(loc)
                if (http) {
                  out.push(http)
                  continue
                }
                const normalized = String(loc || '').trim().replace(/\\/g, '/').replace(/^\/+/, '')
                if (!normalized || normalized.includes('..')) continue
                const abs = path.resolve(localSiteRootAbsResolved, normalized)
                if (!abs.startsWith(localSiteRootAbsResolved + path.sep) && abs !== localSiteRootAbsResolved) continue
                try {
                  const st = await fs.stat(abs)
                  if (!st.isFile()) continue
                } catch {
                  continue
                }
                const rel = posixPathFromFsAbs(path.relative(repoRootAbs, abs))
                out.push(rel)
              }
              return out
            })()

            const htmlFilesAbs = sitemapUrls.length
              ? []
              : await listLocalHtmlFiles(localSiteRootAbsResolved, options.maxPages || 50)

            const scanned = htmlFilesAbs.map(abs => posixPathFromFsAbs(path.relative(repoRootAbs, abs)))
            const combined = [...sitemapUrls, ...scanned]
            const seen = new Set<string>()
            const out: string[] = []
            for (const u of combined) {
              const key = String(u || '').trim()
              if (!key) continue
              if (seen.has(key)) continue
              seen.add(key)
              out.push(key)
              if (out.length >= (options.maxPages || 50)) break
            }
            return out
          })()

          const initialRunProgress: WebsiteImportProgress = {
            stage: 'converting',
            total: limited.length,
            processed: 0,
            ok: 0,
            error: 0,
            queued: limited.length,
            updatedAtMs: Date.now(),
          }

          await updateManifest({ sitemapUrl: sitemapUrlForManifest, errors, progress: initialRunProgress }, { flush: true })

          const nodes: WebsiteImportNode[] = []
          const queue = limited.slice()
          const queuedUrls = new Set(queue)
          let idx = 0
          let captureSequence = 0
          let processed = 0
          let okCount = 0
          let errorCount = 0
          const nextUrl = () => {
            if (idx >= queue.length) return null
            const u = queue[idx]
            idx += 1
            return u
          }

          let convertEnv: { restore: () => void } | null = null
          let convertFn: ((args: { html: string; url: string }) => Promise<string>) | null = null
          let convertLock = Promise.resolve()
          const withConvertLock = async <T,>(run: () => Promise<T>): Promise<T> => {
            const prev = convertLock
            let resolveNext: (() => void) | null = null
            convertLock = new Promise<void>(resolve => {
              resolveNext = resolve
            })
            await prev
            try {
              return await run()
            } finally {
              if (resolveNext) resolveNext()
            }
          }

          const ensureConvertReady = async () => {
            if (!options.generateMarkdownArtifacts) return
            if (convertFn) return
            const { initJsdomHarness } = await import('../../../tests/lib/jsdomHarness')
            convertEnv = initJsdomHarness()
            const mod = await import('../webpageHtmlToMarkdownArtifact')
            convertFn = (input: { html: string; url: string }) => mod.convertWebpageHtmlToMarkdownArtifactAsync({
              html: input.html,
              url: input.url,
              includeImages: options.includeImages !== false,
              fidelityLevel: 4,
              includeHeadSection: true,
              includeHtmlSnapshot: true,
              mode: 'debug',
            })
          }

          const processUrl = async (u: string) => {
            const nodeId = hashHex(u).slice(0, 24)
            const nodeDirAbs = path.join(importDirAbs, 'nodes', nodeId)
            await fs.mkdir(nodeDirAbs, { recursive: true })

            let html = ''
            let title = ''
            let discoveredLinks: string[] = []
            let downloads: WebsiteImportNode['artifacts']['downloads'] = []
            try {
              if (nativeCrawler && isHttpUrl(u)) {
                const capture = await nativeCrawler.capture({ url: u, nodeDirAbs, sequence: captureSequence++ })
                html = capture.html
                title = capture.title
                downloads = capture.downloads
                discoveredLinks = capture.links
                  .map(normalizeUrl)
                  .filter((link): link is string => Boolean(link && isCrawlableInternalUrl(link, rootUrl)))
              } else {
                const rawHtmlRes = rootKind === 'http' || isHttpUrl(u)
                  ? await fetchTextWithLimit(u, {
                      timeoutMs: 30_000,
                      maxBytes: WEBSITE_IMPORT_PAGE_MAX_BYTES,
                      accept: 'text/html,*/*;q=0.9',
                    })
                  : await readLocalTextWithLimit(path.resolve(repoRootAbs, u), WEBSITE_IMPORT_PAGE_MAX_BYTES)
                if (rawHtmlRes.ok !== true) throw new Error(rawHtmlRes.error)
                html = String(rawHtmlRes.text || '')
                title = extractTitleFromHtml(html)
              }
            } catch (error) {
              const message = error && typeof error === 'object' && 'message' in error ? String(error.message || '') : String(error || '')
              errors.push({ url: u, error: message || 'Crawl failed' })
              nodes.push({ nodeId, url: u, path: toTreePath(isHttpUrl(u) ? 'http' : 'local', u, localSiteRootRel), status: 'error', artifacts: {} })
              errorCount += 1
              return
            }
            for (const link of discoveredLinks) {
              if (queue.length >= (options.maxPages || 50)) break
              if (queuedUrls.has(link)) continue
              queuedUrls.add(link)
              queue.push(link)
            }

            const artifacts: WebsiteImportNode['artifacts'] = downloads.length ? { downloads } : {}
            if (html) {
              try {
                await fs.writeFile(path.join(nodeDirAbs, 'raw.html'), html, 'utf8')
                artifacts.rawHtmlRelPath = path.posix.join(workspaceResolved.rel, importId, 'nodes', nodeId, 'raw.html')
                artifacts.rawHtmlBytes = Buffer.byteLength(html, 'utf8')
                artifacts.rawHtmlSha256 = hashHex(html)
              } catch {
                void 0
              }
            }

            if (html && options.generateMarkdownArtifacts) {
              try {
                await ensureConvertReady()
                if (convertFn) {
                  const markdown = await withConvertLock(async () => convertFn ? convertFn({ html, url: u }) : '')
                  if (markdown) {
                    try {
                      await fs.writeFile(path.join(nodeDirAbs, 'page.md'), markdown, 'utf8')
                      artifacts.markdownRelPath = path.posix.join(workspaceResolved.rel, importId, 'nodes', nodeId, 'page.md')
                      artifacts.markdownBytes = Buffer.byteLength(markdown, 'utf8')
                      artifacts.markdownSha256 = hashHex(markdown)
                    } catch {
                      void 0
                    }
                    try {
                      const semanticSnapshot = buildWebsiteSemanticSnapshotFromHtml({ html, url: u, title, maxItems: 220 })
                      const json = JSON.stringify({ ok: true, name: 'webpage.md', markdown, title: title || undefined, source_url: u, images: [], semanticSnapshot }, null, 2)
                      await fs.writeFile(path.join(nodeDirAbs, 'conversion.json'), json, 'utf8')
                      artifacts.conversionJsonRelPath = path.posix.join(workspaceResolved.rel, importId, 'nodes', nodeId, 'conversion.json')
                      artifacts.conversionJsonBytes = Buffer.byteLength(json, 'utf8')
                      artifacts.conversionJsonSha256 = hashHex(json)
                    } catch {
                      void 0
                    }
                  }
                }
              } catch {
                void 0
              }
            }
            nodes.push({
              nodeId,
              url: u,
              path: toTreePath(isHttpUrl(u) ? 'http' : 'local', u, localSiteRootRel),
              title: title || undefined,
              status: 'ok',
              links: discoveredLinks.length ? discoveredLinks : undefined,
              artifacts,
            })
            okCount += 1
          }

          const workerCount = rootKind === 'local' && options.generateMarkdownArtifacts ? 1 : (options.concurrency || 4)
          const workers = Array.from({ length: workerCount }).map(async () => {
            while (true) {
              const u = nextUrl()
              if (!u) return
              await processUrl(u)
              processed += 1
              const nextProgress: WebsiteImportProgress = {
                stage: 'converting',
                total: queue.length,
                processed,
                ok: okCount,
                error: errorCount,
                queued: Math.max(0, queue.length - processed),
                lastUrl: u,
                updatedAtMs: Date.now(),
              }
              await updateManifest({ progress: nextProgress, nodes: [...nodes], errors: [...errors] })
            }
          })

          await Promise.all(workers)
          nodes.sort((a, b) => a.path.localeCompare(b.path))
          if (convertEnv) {
            try {
              convertEnv.restore()
            } catch {
              void 0
            }
          }
          await updateManifest(
            {
              status: 'done',
              finishedAtMs: Date.now(),
              progress: {
                stage: 'done',
                total: queue.length,
                processed,
                ok: okCount,
                error: errorCount,
                queued: 0,
                lastUrl: processed > 0 ? (nodes[nodes.length - 1]?.url || undefined) : undefined,
                updatedAtMs: Date.now(),
              },
              nodes,
              errors,
            },
            { flush: true },
          )
        } catch (e) {
          const msg = e && typeof e === 'object' && 'message' in e ? String((e as { message?: unknown }).message || '') : ''
          await updateManifest(
            {
              status: 'failed',
              finishedAtMs: Date.now(),
              progress: {
                stage: 'failed',
                total: manifestState.progress?.total || 0,
                processed: manifestState.progress?.processed || 0,
                ok: manifestState.progress?.ok || 0,
                error: Math.max(1, manifestState.progress?.error || 0),
                queued: manifestState.progress?.queued || 0,
                lastUrl: manifestState.progress?.lastUrl,
                updatedAtMs: Date.now(),
              },
              errors: [{ url: rootUrl, error: msg || 'Import failed' }],
            },
            { flush: true },
          )
        } finally {
          await nativeCrawler?.close().catch(() => void 0)
          jobs.delete(importId)
        }
      })()

      const out: StartResponse = { ok: true, importId }
      res.statusCode = 200
      res.setHeader('Content-Type', 'application/json')
      res.setHeader('Cache-Control', 'no-store')
      res.end(JSON.stringify(out))
      return
    }

    if (req.method === 'GET' && pathname === '/__website_import/status') {
      const importId = sanitizeImportId(parsed.searchParams.get('importId') || '')
      if (!importId) {
        res.statusCode = 400
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ ok: false, error: 'Missing importId' }))
        return
      }
      const job = jobs.get(importId)
      if (job?.manifest) {
        res.statusCode = 200
        res.setHeader('Content-Type', 'application/json')
        res.setHeader('Cache-Control', 'no-store')
        res.end(JSON.stringify({ ok: true, status: job.manifest.status, running: true, progress: job.manifest.progress || null }))
        return
      }
      const manifestPathAbs = path.join(workspaceAbs, importId, 'manifest.json')
      const manifest = await readJsonFile<WebsiteImportManifestV1>(manifestPathAbs)
      if (!manifest) {
        res.statusCode = 404
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ ok: false, error: 'Not found' }))
        return
      }
      const running = jobs.has(importId)
      res.statusCode = 200
      res.setHeader('Content-Type', 'application/json')
      res.setHeader('Cache-Control', 'no-store')
      res.end(JSON.stringify({ ok: true, status: manifest.status, running, progress: manifest.progress || null }))
      return
    }

    res.statusCode = 404
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ ok: false, error: 'Not found' }))
  }
}
